/**
 * Units of measure used by vehicle signals and by theme components.
 *
 * Every signal in the catalog is stored in a canonical unit (the first unit of
 * its dimension below). Components may ask for a display unit of the same
 * dimension; `convert` performs the conversion.
 */

export type UnitId =
  | 'none'
  | 'kmh'
  | 'mph'
  | 'rpm'
  | 'celsius'
  | 'fahrenheit'
  | 'bar'
  | 'psi'
  | 'kpa'
  | 'volt'
  | 'ampere'
  | 'kw'
  | 'hp'
  | 'nm'
  | 'percent'
  | 'km'
  | 'mi'
  | 'm'
  | 'liter'
  | 'gallon_us'
  | 'l_100km'
  | 'mpg_us'
  | 'kwh_100km'
  | 'g'
  | 'ms2'
  | 'deg'
  | 'seconds'
  | 'minutes'
  | 'hours';

export type Dimension =
  | 'none'
  | 'speed'
  | 'rotation'
  | 'temperature'
  | 'pressure'
  | 'voltage'
  | 'current'
  | 'power'
  | 'torque'
  | 'ratio'
  | 'distance'
  | 'volume'
  | 'consumption'
  | 'acceleration'
  | 'angle'
  | 'time';

export interface UnitDef {
  id: UnitId;
  dimension: Dimension;
  /** Short symbol for display, e.g. "km/h". */
  symbol: string;
  /** Conversion from the canonical unit of the dimension: value * factor + offset. */
  factor: number;
  offset: number;
}

const U = (id: UnitId, dimension: Dimension, symbol: string, factor = 1, offset = 0): UnitDef => ({
  id,
  dimension,
  symbol,
  factor,
  offset,
});

/** All units. The first unit listed for a dimension is its canonical unit. */
export const UNITS: Readonly<Record<UnitId, UnitDef>> = {
  none: U('none', 'none', ''),
  kmh: U('kmh', 'speed', 'km/h'),
  mph: U('mph', 'speed', 'mph', 0.621371192),
  rpm: U('rpm', 'rotation', 'rpm'),
  celsius: U('celsius', 'temperature', '°C'),
  fahrenheit: U('fahrenheit', 'temperature', '°F', 1.8, 32),
  bar: U('bar', 'pressure', 'bar'),
  psi: U('psi', 'pressure', 'psi', 14.5037738),
  kpa: U('kpa', 'pressure', 'kPa', 100),
  volt: U('volt', 'voltage', 'V'),
  ampere: U('ampere', 'current', 'A'),
  kw: U('kw', 'power', 'kW'),
  hp: U('hp', 'power', 'hp', 1.34102209),
  nm: U('nm', 'torque', 'Nm'),
  percent: U('percent', 'ratio', '%'),
  km: U('km', 'distance', 'km'),
  mi: U('mi', 'distance', 'mi', 0.621371192),
  m: U('m', 'distance', 'm', 1000),
  liter: U('liter', 'volume', 'l'),
  gallon_us: U('gallon_us', 'volume', 'gal', 0.264172052),
  l_100km: U('l_100km', 'consumption', 'l/100km'),
  // mpg is the inverse of l/100km; handled specially in convert().
  mpg_us: U('mpg_us', 'consumption', 'mpg', 235.214583),
  kwh_100km: U('kwh_100km', 'consumption', 'kWh/100km'),
  g: U('g', 'acceleration', 'g'),
  ms2: U('ms2', 'acceleration', 'm/s²', 9.80665),
  deg: U('deg', 'angle', '°'),
  seconds: U('seconds', 'time', 's'),
  minutes: U('minutes', 'time', 'min', 1 / 60),
  hours: U('hours', 'time', 'h', 1 / 3600),
};

export function unitSymbol(id: UnitId): string {
  return UNITS[id].symbol;
}

export function canonicalUnit(dimension: Dimension): UnitId {
  for (const u of Object.values(UNITS)) if (u.dimension === dimension) return u.id;
  return 'none';
}

export function sameDimension(a: UnitId, b: UnitId): boolean {
  return UNITS[a].dimension === UNITS[b].dimension;
}

/**
 * Convert a value between two units of the same dimension.
 * Throws if the dimensions differ.
 */
export function convert(value: number, from: UnitId, to: UnitId): number {
  if (from === to) return value;
  const a = UNITS[from];
  const b = UNITS[to];
  if (a.dimension !== b.dimension) {
    throw new Error(`Cannot convert ${from} (${a.dimension}) to ${to} (${b.dimension})`);
  }
  // Inverse units (mpg <-> l/100km) are not affine; handle them explicitly.
  if (a.dimension === 'consumption') {
    const toCanonical = from === 'mpg_us' ? (value === 0 ? 0 : a.factor / value) : value;
    if (to === 'mpg_us') return toCanonical === 0 ? 0 : b.factor / toCanonical;
    return toCanonical;
  }
  const canonical = (value - a.offset) / a.factor;
  return canonical * b.factor + b.offset;
}

export function unitsOfDimension(dimension: Dimension): UnitDef[] {
  return Object.values(UNITS).filter((u) => u.dimension === dimension);
}
