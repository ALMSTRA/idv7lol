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
const Car = require('./kit/car');
const { SignalStore, driveModeOf, boostOf, GEAR_TEXT } = require('./signals');
const { FuelGauge, CarAwake, parseTank } = require('./fuel');

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
  const ask = (now) => {
    if (reader === false || busy) return;
    if (now - lastAsk < (misses >= 3 ? FUEL_RETRY_MS : FUEL_EVERY_MS)) return;
    if (!reader) {
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
          ready = link.init().catch(() => {});
          reader = new DidReader(link, { ecu: FUEL_OBD.ecu });
        }
      } catch (e) {
        reader = false;
        log.info('fuel: no diagnostic link (' + e + '); litres over the tank size');
        return;
      }
    }
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
  return { gauge, ask, wake };
}

/**
 * Start reading the car. Returns { store, car, live(), status(), stop() }.
 * `redline` is the demo drive's rev limit.
 */
function startVehicle(ctx, opts) {
  const store = new SignalStore();
  const raw = {}; // last raw payloads by field, for the Signals page
  const seen = (field, v) => {
    raw[field] = JSON.stringify(v).slice(0, 160);
  };
  let modeFallbackSince = Date.now();
  const fuel = startFuel(ctx, ctx.log);
  let tank = null; // the cluster's last tank values (fuel.js parseTank)
  const extra = {
    'de.bmw.infotainment.KombiIF': {
      statusRangeTankStatus: (v) => {
        seen('statusRangeTankStatus', v);
        tank = parseTank(v);
        if (tank.litres !== null) fuel.gauge.tank(tank.litres, Date.now());
      },
    },
    'de.bmw.infotainment.drivingexcitement.FES': {
      statusFESVehicleDynamicSwitchHMI: (v) => {
        seen('statusFESVehicleDynamicSwitchHMI', v);
        const m = driveModeOf(v);
        if (m) {
          store.set('drive.mode', m);
          modeFallbackSince = Date.now() + 60000;
        }
      },
      statusSwitchDriveDynamicSport2: (v) => {
        seen('statusSwitchDriveDynamicSport2', v);
        const b = boostOf(v && v.displayBoostPressure);
        if (b !== null) store.set('engine.boost', b);
        if (Date.now() > modeFallbackSince) {
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
  return { store, car, live, status, stop: () => Promise.all(car.subs.map((s) => s.shutdown())) };
}

module.exports = { startVehicle, startFuel, SignalStore, driveModeOf, GEAR_TEXT };
