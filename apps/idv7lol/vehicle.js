'use strict';
/**
 * vehicle.js - the car's signals as idv7lol catalog ids.
 *
 * The kit's Car class (kit/car.js, MIT) subscribes to the common SOME/IP
 * fields (engine speed, road speed, temperatures, accelerations, gear,
 * torque) with BMW's scalings and offers a demo drive when no car answers.
 * This module adds the fields the themes need beyond that (drive mode,
 * boost, gearbox programme, outside temperature, gearbox oil) and writes
 * everything into a SignalStore keyed by catalog id, with timestamps, so
 * the engine can tell fresh data from stale data.
 *
 * The fuel level, fuel range and odometer come from the cluster
 * (KombiIF.statusRangeTankStatus) and, for the percentage, from the engine
 * unit over the kit's read-only diagnostic link (fuel.js says how).
 *
 * Nothing here is written to the car; every field is read-only.
 */
const fs = require('fs');
const path = require('path');
const {
  SignalStore,
  driveModeOf,
  boostOf,
  GEAR_TEXT,
  mEngineModeOf,
  indicatorsOf,
  flashLit,
  lowBeamOf,
  highBeamOf,
  rearFogOf,
  handBrakeOf,
  cruiseOf,
  averageConsumptionOf,
  dippedBeamOf,
  parkingBrakeOf,
  dscModeOf,
  cruiseHudOf,
} = require('./signals');
const { FuelGauge, CarAwake, RefuelTrip, parseTank } = require('./fuel');

/** The engine unit's fuel level: OBD-II PID 2F, A x 100 / 255 (a public standard, no BMW table). */
const FUEL_OBD = {
  ecu: 0x12,
  obd: '2F',
  bytes: 1,
  factor: 100 / 255,
  offset: 0,
  min: 0,
  max: 100,
  timeoutMs: 1500,
};
const FUEL_EVERY_MS = 10000;
const FUEL_RETRY_MS = 300000; // an engine unit that didn't answer 3 times in a row is asked this often

/**
 * The fuel gauge (fuel.js) with what it learned kept in the app's data folder, and the engine
 * unit asked for its percentage every FUEL_EVERY_MS while the car is switched on (CarAwake in
 * fuel.js; never parked, where the requests would keep the car's networks awake). The diagnostic
 * link is the kit's read-only one (kit/readonly-diag.js): it refuses anything but reads before a
 * request leaves the head unit. Returns { gauge, ask(now), wake() }: wake() when the car comes
 * on, so the engine unit is asked at once even after it went quiet.
 * deps.openLink() (tests) returns { link, reader, ready } in place of the kit's.
 */
function startFuel(ctx, log, deps) {
  const file = path.join(ctx.dataDir || process.cwd(), 'fuel.json');
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_e) {
    /* first start */
  }
  const gauge = new FuelGauge({
    state,
    save: (s) => {
      try {
        // whole or not at all: a temp file renamed over it, so a power cut never leaves half
        fs.writeFileSync(file + '.tmp', JSON.stringify(s));
        fs.renameSync(file + '.tmp', file);
        log.info('fuel: tank size ' + JSON.stringify(s));
      } catch (e) {
        log.warn('fuel: ' + e);
      }
    },
  });
  let reader = null;
  let link = null;
  let ready = null;
  let misses = 0;
  let lastAsk = -Infinity;
  let busy = false;
  let answered = null;
  /** The kit's read-only diagnostic link, opened once (shared with the boost reads): true when there is one. */
  const open = () => {
    if (reader === false) return false;
    if (reader) return true;
    try {
      if (deps && deps.openLink) {
        const o = deps.openLink();
        link = o.link;
        reader = o.reader;
        ready = o.ready;
      } else {
        const { ReadOnlyDiag } = require('./kit/readonly-diag');
        const { DidReader } = require('./kit/dids');
        link = new ReadOnlyDiag(ctx.signals, log);
        ready = link.init().catch((e) => log.warn('diagnostic link: ' + e));
        reader = new DidReader(link, { ecu: FUEL_OBD.ecu });
      }
      return true;
    } catch (e) {
      reader = false;
      log.info('fuel: no diagnostic link (' + e + '); litres over the tank size');
      return false;
    }
  };
  const ask = (now) => {
    if (reader === false || busy) return;
    if (now - lastAsk < (misses >= 3 ? FUEL_RETRY_MS : FUEL_EVERY_MS)) return;
    if (!open()) return;
    // The kit's link stops asking a unit after 5 misses in a row until it is woken; a retry
    // after misses wakes it, or the 5-minute retries would never send anything again.
    if (misses >= 3 && link && link.wake) link.wake(FUEL_OBD.ecu);
    lastAsk = now;
    busy = true;
    Promise.resolve(ready)
      .then(() => reader.value('fuel', [FUEL_OBD]))
      .then((v) => {
        if (v !== null) {
          if (answered !== true)
            log.info('fuel: ' + v.toFixed(0) + ' % from the engine unit (OBD 2F)');
          answered = true;
          misses = 0;
          gauge.obd(v, Date.now());
          return;
        }
        misses++;
        if (misses === 3 && answered !== false) {
          const r = reader.raws[reader.key(FUEL_OBD)] || {};
          log.info(
            'fuel: the engine unit gives no OBD 2F (' +
              (r.why || '?') +
              '); litres over the tank size, asked again every 5 min',
          );
          answered = false;
        }
      })
      .catch(() => {
        misses++;
      })
      .then(() => {
        busy = false;
      });
  };
  const wake = () => {
    if (link && link.wake) link.wake(FUEL_OBD.ecu);
    lastAsk = -Infinity;
  };
  /** { reader, ready } of the shared link, or null. */
  const diag = () => (open() ? { reader, ready } : null);
  return { gauge, ask, wake, diag };
}

/*
 * Boost from the engine unit over the read-only link, as Cluster Layouts (idrive7-cluster-info config.dme)
 * and M Vitals read it: BMW's actual boost pressure (absolute) first, then the OBD-II ones, minus the
 * barometric pressure. Candidates are tried in order and the first that answers is kept (kit/dids.js).
 */
const BOOST_ACTUAL = [
  {
    ecu: 0x12,
    did: '580B',
    bytes: 2,
    at: 0,
    factor: 0.00390625,
    min: 20,
    max: 400,
    timeoutMs: 600,
  },
  { ecu: 0x12, did: 'F470', bytes: 2, at: 3, factor: 0.03125, min: 20, max: 600, timeoutMs: 600 },
  { ecu: 0x12, obd: '70', bytes: 2, at: 3, factor: 0.03125, min: 20, max: 600, timeoutMs: 600 },
  { ecu: 0x12, obd: '0B', bytes: 1, at: 0, factor: 1, min: 20, max: 255, timeoutMs: 600 },
];
const BARO = [
  { ecu: 0x12, did: 'F433', bytes: 1, at: 0, factor: 1, min: 50, max: 115, timeoutMs: 600 },
  { ecu: 0x12, obd: '33', bytes: 1, at: 0, factor: 1, min: 50, max: 115, timeoutMs: 600 },
];
const BOOST_EVERY_MS = 200; // 5 a second while the engine runs
const BARO_EVERY_MS = 60000;
const BOOST_RETRY_MS = 60000; // an engine unit that answered none of them is asked again after this

/**
 * Asks the engine unit for boost while the engine runs and the sport display gives none. tick(now, running)
 * from vehicle.js; sets engine.boost (bar over atmosphere) in the store.
 */
function startBoost(fuel, store, log) {
  let busy = false;
  let lastAsk = -Infinity;
  let baro = 101.3;
  let baroAt = -Infinity;
  let misses = 0;
  let told = null;
  return {
    tick(now, running) {
      if (!running || busy) return;
      if (now - lastAsk < (misses >= 5 ? BOOST_RETRY_MS : BOOST_EVERY_MS)) return;
      const d = fuel.diag();
      if (!d) return;
      lastAsk = now;
      busy = true;
      Promise.resolve(d.ready)
        .then(() => (now - baroAt > BARO_EVERY_MS ? d.reader.value('baro', BARO) : null))
        .then((b) => {
          if (b !== null && b !== undefined) {
            baro = b;
            baroAt = now;
          }
          return d.reader.value('boost', BOOST_ACTUAL);
        })
        .then((abs) => {
          if (abs === null) {
            misses++;
            if (misses === 5 && told !== false) {
              told = false;
              log.info(
                'boost: the engine unit gives none of its boost pressures; asked again every minute',
              );
            }
            return;
          }
          misses = 0;
          if (told !== true) {
            told = true;
            log.info(
              'boost: from the engine unit (' +
                (d.reader.pick.boost || 0) +
                '), ' +
                abs.toFixed(1) +
                ' kPa absolute, baro ' +
                baro.toFixed(1),
            );
          }
          store.set('engine.boost', (abs - baro) / 100);
        })
        .catch(() => {
          misses++;
        })
        .then(() => {
          busy = false;
        });
    },
  };
}

/**
 * The distance since the last refuel (fuel.js RefuelTrip), kept in the app's data folder (trip.json) so it
 * survives restarts.
 */
function startTrip(ctx, log) {
  const file = path.join(ctx.dataDir || process.cwd(), 'trip.json');
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_e) {
    /* first start */
  }
  return new RefuelTrip({
    state,
    save: (s) => {
      try {
        fs.writeFileSync(file + '.tmp', JSON.stringify(s));
        fs.renameSync(file + '.tmp', file);
      } catch (e) {
        log.warn('trip: ' + e);
      }
    },
  });
}

/**
 * Start reading the car. Returns { store, car, live(), status(), stop() }.
 * `redline` is the demo drive's rev limit.
 */
function startVehicle(ctx, opts) {
  // The kit is next to this file only in the built app (kit/tools/build.py copies it in).
  const Car = require('./kit/car');
  const store = new SignalStore();
  const raw = {}; // last raw payloads by field, for the Signals page
  const seen = (field, v) => {
    raw[field] = JSON.stringify(v).slice(0, 160);
  };
  let modeFallbackSince = Date.now();
  // An M car names its mode in M Drive (the engine mode of M Setup); once it has, the driving
  // experience switch (FES), which stays on COMFORT there, no longer sets the mode.
  let mDriveMode = false;
  // Fields whose scaling isn't known yet: each distinct raw value (the first 20) goes to the log too, for
  // calibrating against the car (DSC on / off / MDM, the injected fuel against the trip computer).
  const logged = {};
  const calibrate = (field, v) => {
    seen(field, v);
    const j = JSON.stringify(v);
    const l = logged[field] || (logged[field] = []);
    if (l.length < 20 && l.indexOf(j) < 0) {
      l.push(j);
      ctx.log.info('raw ' + field + ': ' + j.slice(0, 300));
    }
  };
  let indicate = null; // the direction the car indicates: 'left' | 'right' | 'both' | 'off'
  let dipped = false; // the dipped beam lamp has been heard (LampExterior2)
  let epb = false; // an electric parking brake has been heard (Vehicle2.statusStandstillFunctions)
  let cruise2 = false; // the car fills DisplayDataServer2's set speed
  const fuel = startFuel(ctx, ctx.log);
  const trip = startTrip(ctx, ctx.log);
  const boost = startBoost(fuel, store, ctx.log);
  let boostSportAt = -Infinity; // the sport display last gave a boost
  let tank = null; // the cluster's last tank values (fuel.js parseTank)
  const flag = (id, v) => {
    if (v !== null) store.set(id, v);
  };
  const extra = {
    'de.bmw.infotainment.KombiIF': {
      statusRangeTankStatus: (v) => {
        seen('statusRangeTankStatus', v);
        tank = parseTank(v);
        if (tank.litres !== null) fuel.gauge.tank(tank.litres, Date.now());
      },
      // (the trip computer's own distance: shown on the Signals page; vehicle.trip.distance is the distance
      // since the last refuel, below)
      statusBordcomputerTravelData: (v) => seen('statusBordcomputerTravelData', v),
      statusBordcomputerAverage: (v) => {
        seen('statusBordcomputerAverage', v);
        flag('fuel.consumption.average', averageConsumptionOf(v));
      },
    },
    'de.bmw.body.Light': {
      StatusFunctionsIndicators: (v) => {
        seen('StatusFunctionsIndicators', v);
        const d = indicatorsOf(v);
        if (d !== null) indicate = d;
      },
      // the switch's "driving light on", only until the dipped beam lamp itself (LampExterior2) is heard
      LowBeam: (v) => {
        seen('LowBeam', v);
        if (!dipped) flag('light.low.beam', lowBeamOf(v));
      },
      LampExterior: (v) => {
        seen('LampExterior', v);
        flag('light.fog.rear', rearFogOf(v));
      },
      LampExterior2: (v) => {
        seen('LampExterior2', v);
        flag('light.high.beam', highBeamOf(v));
        const d = dippedBeamOf(v);
        if (d !== null) {
          dipped = true;
          store.set('light.low.beam', d);
        }
      },
    },
    'de.bmw.infotainment.vehicle.CDS': {
      // a mechanical handbrake's switch, only on cars without an electric parking brake (below)
      statusHandBrake: (v) => {
        seen('statusHandBrake', v);
        if (!epb) flag('chassis.handbrake', handBrakeOf(v));
      },
    },
    'de.bmw.infotainment.vehicle.Vehicle2': {
      statusStandstillFunctions: (v) => {
        seen('statusStandstillFunctions', v);
        const p = parkingBrakeOf(v);
        if (p === null) return;
        epb = true;
        store.set('chassis.handbrake', p);
      },
    },
    'de.bmw.infotainment.displaydataserver.DisplayDataServer': {
      functionalLibraryData: (v) => {
        seen(
          'functionalLibraryData (HUD)',
          v && { ldmSymColor: v.ldmSymColor, cruiseCtrlSpeedHUD: v.cruiseCtrlSpeedHUD },
        );
        const c = cruiseHudOf(v);
        if (!c || cruise2) return;
        store.set('vehicle.cruise.active', c.active);
        if (c.speed !== null) store.set('vehicle.cruise.speed', c.speed);
      },
    },
    'de.bmw.infotainment.displaydata.DisplayDataServer2': {
      functionalLibraryData: (v) => {
        const c = cruiseOf(v);
        seen('functionalLibraryData', v && v.ldmSetSpeed);
        if (!c) return;
        // a set speed here (not just OFF) means this car fills DisplayDataServer2; it wins then
        if (c.active || c.speed !== null) cruise2 = true;
        store.set('vehicle.cruise.active', c.active);
        if (c.speed !== null) store.set('vehicle.cruise.speed', c.speed);
      },
    },
    'de.bmw.chassis.VehicleStabilizationManagement': {
      StabilizationManagement: (v) => calibrate('StabilizationManagement', v),
    },
    'de.bmw.infotainment.vehicle.CDS2': {
      statusInjectionVolume: (v) => calibrate('statusInjectionVolume', v),
    },
    'de.bmw.infotainment.drivingexcitement.FES': {
      statusDSCSwitchHMI: (v) => {
        seen('statusDSCSwitchHMI', v);
        flag('chassis.dsc.mode', dscModeOf(v));
      },
      statusFESVehicleDynamicSwitchHMI: (v) => {
        seen('statusFESVehicleDynamicSwitchHMI', v);
        const m = mDriveMode ? null : driveModeOf(v);
        if (m) {
          store.set('drive.mode', m);
          modeFallbackSince = Date.now() + 60000;
        }
      },
      statusSwitchDriveDynamicSport2: (v) => {
        seen('statusSwitchDriveDynamicSport2', v);
        const b = boostOf(v && v.displayBoostPressure);
        if (b !== null) {
          boostSportAt = Date.now();
          store.set('engine.boost', b);
        }
        if (!mDriveMode && Date.now() > modeFallbackSince) {
          const m = driveModeOf(v);
          if (m) store.set('drive.mode', m);
        }
      },
    },
    'de.bmw.infrastructure.EnvironmentalInformation': {
      ExteriorTemperature: (v) => {
        seen('ExteriorTemperature', v);
        const t = v && v.temperatureExterior;
        if (typeof t === 'number' && t !== 255) store.set('environment.outside.temp', t * 0.5 - 40);
      },
    },
    'de.bmw.infotainment.misc.MDrive': {
      controlDisplayMSystems: (v) => {
        seen('controlDisplayMSystems', v);
        const m = mEngineModeOf(v);
        if (!m) return;
        if (!mDriveMode) ctx.log.info('drive mode: from M Drive (the engine mode of M Setup)');
        mDriveMode = true;
        store.set('drive.mode', m);
      },
      dataDisplayGearbox: (v) => {
        seen('dataDisplayGearbox', v);
        const s = JSON.stringify(v || '');
        if (/M_MINUS|"2"|: ?2\b/.test(s)) store.set('transmission.mode', 'M');
        else if (/S_MINUS|"1"|: ?1\b/.test(s)) store.set('transmission.mode', 'S');
        else store.set('transmission.mode', 'D');
      },
    },
    'de.bmw.infrastructure.analytics.BasicDataSet': {
      basicDataSet: (v) => {
        seen('basicDataSet', v);
        const t = v && v.valueTemperatureTransmissionOil;
        if (typeof t === 'number' && t !== 255) store.set('transmission.oil.temp', t - 48);
      },
    },
  };
  const car = new Car(
    ctx,
    ['rpm', 'speed', 'accel', 'temps', 'gear', 'torque', 'condition'],
    extra,
  );
  if (opts && opts.redline) car.setRedline(opts.redline);
  // The car says which way it indicates, not each flash: the turn signals flash here at the cluster's
  // own rate (signals.js FLASH_MS), lit together for hazards. Ticks every 40 ms for clean edges.
  setInterval(() => {
    if (indicate === null || car.data().demo) return;
    const now = Date.now();
    const lit = flashLit(now);
    store.set('light.turn.left', lit && (indicate === 'left' || indicate === 'both'), now);
    store.set('light.turn.right', lit && (indicate === 'right' || indicate === 'both'), now);
  }, 40);
  // Boost from the engine unit while it runs and the sport display gives none (startBoost).
  setInterval(() => {
    let d;
    try {
      d = car.data();
      if (d.demo || !live()) return;
    } catch (_e) {
      return; // (no car yet)
    }
    const now = Date.now();
    boost.tick(now, typeof d.rpm === 'number' && d.rpm > 400 && now - boostSportAt > 3000);
  }, 50);
  car.onSample((d, t) => {
    if (typeof d.rpm === 'number') store.set('engine.rpm', d.rpm, t);
    if (typeof d.speed === 'number') store.set('vehicle.speed', d.speed, t);
    if (typeof d.gLong === 'number') store.set('chassis.accel.lon', d.gLong, t);
    if (typeof d.gLat === 'number') store.set('chassis.accel.lat', d.gLat, t);
    if (typeof d.coolant === 'number') store.set('engine.coolant.temp', d.coolant, t);
    if (typeof d.oil === 'number') store.set('engine.oil.temp', d.oil, t);
    if (typeof d.torque === 'number') store.set('engine.torque', d.torque, t);
    const gear = GEAR_TEXT(d.gear, d.stage);
    if (gear) store.set('transmission.gear', gear, t);
    store.set('engine.running', typeof d.rpm === 'number' && d.rpm > 300, t);
    if (d.demo) {
      // the demo drive has no mode, fuel or outside temperature: fill plausible values so themes show
      if (!store.get('transmission.mode')) store.set('transmission.mode', 'D', t);
      if (!store.get('drive.mode')) store.set('drive.mode', 'COMFORT', t);
      store.set('fuel.level', 62, t);
      store.set('vehicle.range', 410, t);
      store.set('electrical.battery.voltage', 14.1, t);
      if (!store.get('environment.outside.temp')) store.set('environment.outside.temp', 18, t);
      if (!store.get('engine.boost'))
        store.set(
          'engine.boost',
          Math.max(-0.6, (d.rpm - 1500) / 6000) * (d.speed > 2 ? 1 : 0.3),
          t,
        );
    }
  });
  // slow signals the engine reads by id: the 12 V battery is not on SOME/IP in the kit; left unset (themes show dashes)
  const live = () =>
    car.data().demo ||
    car.subs.some((s) => s.available) ||
    (car.lastCar > 0 && Date.now() - car.lastCar < 3000);
  const tankSetting = () => ctx.settings && ctx.settings.get('fuelTank');
  // The cluster notifies its tank values on change only (once while parked), so while the car is
  // live the last ones are published again every second; the layout would take them for stale.
  let fuelSrc = '';
  const awake = new CarAwake();
  let awakeWas = null;
  setInterval(() => {
    const now = Date.now();
    const d = car.data();
    if (d.demo || !live()) return;
    // A state the car sent but the kit doesn't know (15, no value) is no state: the activity
    // rule decides then, instead of the last known one.
    awake.note(d.conditionKnown === false ? null : d.condition);
    awake.sample(d.speed, d.rpm, now);
    const on = awake.on(now);
    if (on !== awakeWas) {
      if (on && awakeWas === false) fuel.wake();
      awakeWas = on;
      ctx.log.info(
        'fuel: car ' +
          (on ? 'on' : 'off') +
          ' (vehicle state ' +
          (awake.condition === undefined ? 'not told' : awake.condition) +
          ')' +
          (on ? '' : ': the engine unit is not asked until it is on again'),
      );
    }
    if (on) fuel.ask(now);
    fuel.gauge.tick(now);
    if (tank) {
      if (tank.litres !== null) store.set('fuel.volume', tank.litres, now);
      if (tank.rangeKm !== null) store.set('vehicle.range', tank.rangeKm, now);
      if (tank.odometerKm !== null) store.set('vehicle.odometer', tank.odometerKm, now);
      if (tank.reserve !== null) store.set('fuel.low', tank.reserve, now);
      const km = trip.update(tank.litres, tank.odometerKm, d.speed, now);
      if (km !== null) store.set('vehicle.trip.distance', km, now);
    }
    const lv = fuel.gauge.level(now, tankSetting());
    if (!lv) return;
    store.set('fuel.level', lv.pct, now);
    const src = lv.src === 'obd' ? 'the engine unit' : lv.capacity.src + ' ' + lv.capacity.litres;
    if (src !== fuelSrc) {
      fuelSrc = src;
      ctx.log.info(
        'fuel: level from ' +
          (lv.src === 'obd'
            ? 'the engine unit (OBD 2F)'
            : 'litres over a ' + lv.capacity.litres + ' l tank (' + lv.capacity.src + ')'),
      );
    }
  }, 1000);
  /** One line for the app's page: what the fuel gauge shows and where it comes from. */
  const fuelText = () => {
    const lv = fuel.gauge.level(Date.now(), tankSetting());
    if (!lv) return 'no value from the car yet';
    const litres = tank && tank.litres !== null ? tank.litres + ' l  ·  ' : '';
    const cap = fuel.gauge.capacity(tankSetting());
    return (
      Math.round(lv.pct) +
      ' %  ·  ' +
      litres +
      (lv.src === 'obd' ? 'from the engine unit' : 'litres over the tank') +
      '  ·  tank ' +
      cap.litres +
      ' l (' +
      cap.src +
      ')' +
      (tank && tank.rangeKm !== null ? '  ·  range ' + tank.rangeKm + ' km' : '') +
      (tank && tank.reserve ? '  ·  RESERVE' : '')
    );
  };
  const status = () => ({
    fuel: fuelText(),
    demo: !!car.data().demo,
    providers: car.subs
      .map((s) => s.iface.split('.').pop() + (s.available ? ' ok' : s.error ? ' error' : ' -'))
      .join(', '),
    raw,
    values: store.snapshot(),
  });
  const hold = () => holdFor(car.data());
  return {
    store,
    car,
    live,
    hold,
    status,
    stop: () => Promise.all(car.subs.map((s) => s.shutdown())),
  };
}

/**
 * Whether the layout must keep off the cluster for the car's state (VehicleCondition, kit/car.js):
 * 'drop' while the car is off (5 or lower: parked, standby, someone in it with the ignition off)
 * or switching off (12); 'wait' (no new layout) while drive readiness is starting (8) or the car
 * sent a state it can't name; null otherwise, the demo drive, or a car that sends no state. The
 * kit's Redline holds its cluster-render layer back the same way (issue #141 there): a target
 * mapped while the KOMBI switches on or off took strikes from cluster-render's mapping guard, and
 * two turn the target off for good.
 */
function holdFor(d) {
  if (!d || d.demo) return null;
  if (d.conditionKnown === false) return 'wait';
  const c = d.condition;
  if (typeof c !== 'number') return null;
  if (c <= 5 || c === 12) return 'drop';
  if (c === 8) return 'wait';
  return null;
}

module.exports = { startVehicle, startFuel, holdFor, SignalStore, driveModeOf, GEAR_TEXT };
