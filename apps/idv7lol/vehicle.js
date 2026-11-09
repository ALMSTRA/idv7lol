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
 * Nothing here is written to the car; every field is read-only.
 */
const Car = require('./kit/car');
const { SignalStore, driveModeOf, GEAR_TEXT } = require('./signals');

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
  const extra = {
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
        const b = v && v.displayBoostPressure;
        if (typeof b === 'number' && b < 254) store.set('engine.boost', b / 10);
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
  const car = new Car(ctx, ['rpm', 'speed', 'accel', 'temps', 'gear', 'torque'], extra);
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
  const status = () => ({
    demo: !!car.data().demo,
    providers: car.subs
      .map((s) => s.iface.split('.').pop() + (s.available ? ' ok' : s.error ? ' error' : ' -'))
      .join(', '),
    raw,
    values: store.snapshot(),
  });
  return { store, car, live, status, stop: () => Promise.all(car.subs.map((s) => s.shutdown())) };
}

module.exports = { startVehicle, SignalStore, driveModeOf, GEAR_TEXT };
