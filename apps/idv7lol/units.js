'use strict';
/**
 * units.js - unit conversion for compiled bindings (mirrors
 * packages/vehicle-signals/src/units.ts). value_display = canonical * factor + offset.
 */
const UNITS = {
  none: { dim: 'none', f: 1, o: 0 },
  kmh: { dim: 'speed', f: 1, o: 0 },
  mph: { dim: 'speed', f: 0.621371192, o: 0 },
  rpm: { dim: 'rotation', f: 1, o: 0 },
  celsius: { dim: 'temperature', f: 1, o: 0 },
  fahrenheit: { dim: 'temperature', f: 1.8, o: 32 },
  bar: { dim: 'pressure', f: 1, o: 0 },
  psi: { dim: 'pressure', f: 14.5037738, o: 0 },
  kpa: { dim: 'pressure', f: 100, o: 0 },
  volt: { dim: 'voltage', f: 1, o: 0 },
  ampere: { dim: 'current', f: 1, o: 0 },
  kw: { dim: 'power', f: 1, o: 0 },
  hp: { dim: 'power', f: 1.34102209, o: 0 },
  nm: { dim: 'torque', f: 1, o: 0 },
  percent: { dim: 'ratio', f: 1, o: 0 },
  km: { dim: 'distance', f: 1, o: 0 },
  mi: { dim: 'distance', f: 0.621371192, o: 0 },
  m: { dim: 'distance', f: 1000, o: 0 },
  liter: { dim: 'volume', f: 1, o: 0 },
  gallon_us: { dim: 'volume', f: 0.264172052, o: 0 },
  l_100km: { dim: 'consumption', f: 1, o: 0 },
  mpg_us: { dim: 'consumption', f: 235.214583, o: 0, inverse: true },
  kwh_100km: { dim: 'consumption', f: 1, o: 0 },
  g: { dim: 'acceleration', f: 1, o: 0 },
  ms2: { dim: 'acceleration', f: 9.80665, o: 0 },
  deg: { dim: 'angle', f: 1, o: 0 },
  seconds: { dim: 'time', f: 1, o: 0 },
  minutes: { dim: 'time', f: 1 / 60, o: 0 },
  hours: { dim: 'time', f: 1 / 3600, o: 0 },
};

function convert(value, from, to) {
  if (from === to) return value;
  const a = UNITS[from],
    b = UNITS[to];
  if (!a || !b || a.dim !== b.dim) return value;
  if (a.dim === 'consumption') {
    const canonical = a.inverse ? (value === 0 ? 0 : a.f / value) : value;
    if (b.inverse) return canonical === 0 ? 0 : b.f / canonical;
    return canonical;
  }
  const canonical = (value - a.o) / a.f;
  return canonical * b.f + b.o;
}

module.exports = { UNITS, convert };
