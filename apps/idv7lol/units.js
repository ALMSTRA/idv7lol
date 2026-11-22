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

/**
 * The units a driver sees, as groups of a compiled theme's `units` (theme-compiler types.ts):
 * 'speed' (mph and miles), 'temperature' (°F), 'pressure' (psi). `setting` is the Units setting;
 * with 'auto' they follow the car's own board computer (signals.js carUnitsOf): its mph for speed
 * and distance, and °F and psi where it counts consumption in US miles per gallon. A car that
 * has said nothing yet shows the theme as drawn.
 */
const SYSTEMS = {
  metric: [],
  'mph-celsius': ['speed'],
  'mph-fahrenheit': ['speed', 'temperature', 'pressure'],
};
function unitGroups(setting, car) {
  if (Object.prototype.hasOwnProperty.call(SYSTEMS, setting)) return SYSTEMS[setting];
  if (!car || car.speed !== 'mph') return SYSTEMS.metric;
  return car.consumption === 'mpg_us' ? SYSTEMS['mph-fahrenheit'] : SYSTEMS['mph-celsius'];
}

/**
 * `theme` with the pieces of `groups` swapped in. The theme itself is not changed; without
 * anything to swap it comes back as it is.
 */
function applyUnits(theme, groups) {
  const units = theme && theme.units;
  if (!units || !groups || !groups.length) return theme;
  const swap = {};
  let any = false;
  groups.forEach((g) => {
    const set = units[g];
    if (!set) return;
    Object.keys(set).forEach((key) => {
      swap[key] = set[key];
      any = true;
    });
  });
  if (!any) return theme;
  const pieces = theme.pieces.map((p) =>
    Object.prototype.hasOwnProperty.call(swap, p.key) ? swap[p.key] : p,
  );
  return Object.assign({}, theme, { pieces });
}

module.exports = { UNITS, convert, SYSTEMS, unitGroups, applyUnits };
