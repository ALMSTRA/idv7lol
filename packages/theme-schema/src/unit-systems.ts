import { UNITS, convert, getSignal, type UnitId } from '@idv7lol/vehicle-signals';
import type { Binding } from './bindings.js';
import type { Component } from './components.js';
import type { Theme } from './theme.js';

/**
 * Showing a theme in other units than the ones it was drawn in.
 *
 * Themes are drawn in km/h, km, °C and bar. A driver may want miles, °F or psi; rather than a
 * second copy of every theme, the same theme is rewritten: bindings change unit, the ranges,
 * zones and limits of a gauge are converted, a gauge that draws its own numerals gets round ones,
 * and unit labels in texts follow. What an author set to another unit on purpose (a boost gauge in
 * psi) is left alone, and so is everything that is compared with the car's own value (conditions,
 * animation triggers, an animated picture's speed).
 */

/** The three choices. `speed` covers distances too: a car that shows mph counts miles. */
export interface UnitChoice {
  speed?: 'mph';
  temperature?: 'fahrenheit';
  pressure?: 'psi';
}
export type UnitGroup = keyof UnitChoice;
export const UNIT_GROUPS: readonly UnitGroup[] = ['speed', 'temperature', 'pressure'];

/** A unit system as a driver picks it. */
export type UnitSystem = 'metric' | 'mph-celsius' | 'mph-fahrenheit';
export const UNIT_SYSTEMS: Readonly<Record<UnitSystem, UnitChoice>> = {
  metric: {},
  'mph-celsius': { speed: 'mph' },
  'mph-fahrenheit': { speed: 'mph', temperature: 'fahrenheit', pressure: 'psi' },
};

interface Pair {
  from: UnitId;
  to: UnitId;
  group: UnitGroup;
}

/** Catalog dimension -> the pair it is converted with under `choice`. */
function pairs(choice: UnitChoice): Partial<Record<string, Pair>> {
  const out: Partial<Record<string, Pair>> = {};
  if (choice.speed === 'mph') {
    out['speed'] = { from: 'kmh', to: 'mph', group: 'speed' };
    out['distance'] = { from: 'km', to: 'mi', group: 'speed' };
  }
  if (choice.temperature === 'fahrenheit')
    out['temperature'] = { from: 'celsius', to: 'fahrenheit', group: 'temperature' };
  if (choice.pressure === 'psi') out['pressure'] = { from: 'bar', to: 'psi', group: 'pressure' };
  return out;
}

/** The pair a binding is converted with, or undefined when it stays as it is. */
function pairOf(b: Binding | undefined, table: Partial<Record<string, Pair>>): Pair | undefined {
  if (!b) return undefined;
  const def = getSignal(b.signal);
  if (!def || def.kind !== 'number') return undefined;
  const pair = table[UNITS[def.unit].dimension];
  if (!pair) return undefined;
  // only what is shown in the metric unit; a scaled or shifted value is the author's own arithmetic
  if ((b.unit ?? def.unit) !== pair.from || def.unit !== pair.from) return undefined;
  if (b.scale !== 1 || b.offset !== 0) return undefined;
  return pair;
}

const NICE = [1, 2, 2.5, 5];
function isNice(v: number): boolean {
  if (!(v > 0)) return false;
  const m = v / Math.pow(10, Math.floor(Math.log10(v) + 1e-9));
  return NICE.some((n) => Math.abs(m - n) < 1e-6) || Math.abs(m - 10) < 1e-6;
}
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * A scale with round numerals for the range min..max: `intervals` major steps wanted, a numeral
 * every `every` steps. Up to 4 % of the range may be cut at either end to land on a round number.
 * `fixedEvery`: the numerals stay at every step (a bar).
 */
export function niceScale(
  min: number,
  max: number,
  intervals: number,
  every: number,
  fixedEvery = false,
): { min: number; max: number; intervals: number; every: number } {
  const span = max - min;
  if (!(span > 0) || intervals < 1) return { min, max, intervals, every };
  const tol = span * 0.04;
  const labels0 = intervals / every + 1;
  let best: { min: number; max: number; intervals: number; every: number } | null = null;
  let bestScore = Infinity;
  const top = Math.ceil(Math.log10(span));
  for (let k = top - 3; k <= top; k++)
    for (const base of NICE) {
      const s = base * Math.pow(10, k);
      const lo = round6(s * Math.floor((min + tol) / s + 1e-9));
      const hi = round6(s * Math.ceil((max - tol) / s - 1e-9));
      const n = Math.round((hi - lo) / s);
      if (n < 1 || n > 100 || hi <= lo) continue;
      for (const e of fixedEvery ? [1] : [1, 2, 3, 4, 5, 6]) {
        if (e > n) continue;
        const labels = n / e + 1;
        // never more numerals than the author fitted on a full dial, a few more on a sparse one:
        // they would run into each other
        if (labels > (labels0 < 10 ? Math.ceil(labels0 * 1.2) : labels0)) continue;
        const score =
          (Math.abs(n - intervals) / intervals) * 0.5 +
          Math.abs(labels - labels0) / labels0 +
          (isNice(s * e) ? 0 : 1) +
          (n % e ? 0.3 : 0) +
          Math.abs((hi - lo) / span - 1) * 0.5;
        if (score < bestScore - 1e-9) {
          bestScore = score;
          best = { min: lo, max: hi, intervals: n, every: e };
        }
      }
    }
  return best ?? { min, max, intervals, every };
}

/** "0.00" -> "0.0", "0.0" -> "0": a psi figure needs one decimal less than its bar one. */
function fewerDecimals(format: string): string {
  return format.replace(/\.(0+)/, (_m, zeros: string) =>
    zeros.length > 1 ? '.' + zeros.slice(1) : '',
  );
}

/** The same letters in the case of `like`: KM/H -> MPH, km/h -> mph. */
function cased(word: string, like: string): string {
  return like === like.toUpperCase() && like !== like.toLowerCase() ? word.toUpperCase() : word;
}

/** Unit words of one pair in a text: "{value} km" -> "{value} mi". */
function relabel(text: string, pair: Pair): string {
  switch (pair.from) {
    case 'kmh':
      return text.replace(/km\/h/gi, (m) => cased('mph', m));
    case 'km':
      return text.replace(
        /(^|[^A-Za-z/])(km)(?![A-Za-z/])/gi,
        (_m, a: string, w: string) => a + cased('mi', w),
      );
    case 'celsius':
      return text.replace(/°\s?C(?![A-Za-z])/g, (m) => m.slice(0, -1) + 'F');
    case 'bar':
      return text.replace(
        /(^|[^A-Za-z])(bar)(?![A-Za-z])/gi,
        (_m, a: string, w: string) => a + cased('psi', w),
      );
    default:
      return text;
  }
}

function walk(list: Component[], fn: (c: Component) => void): void {
  for (const c of list) {
    fn(c);
    if (c.type === 'group') walk(c.props.children, fn);
  }
}

export interface UnitConversion {
  theme: Theme;
  /** Ids of the components that changed. */
  changed: string[];
}

/**
 * `theme` shown in the units of `choice`. The theme given is not changed; with nothing to
 * convert the result is a copy with an empty `changed`.
 */
export function convertThemeUnits(source: Theme, choice: UnitChoice): UnitConversion {
  const theme = JSON.parse(JSON.stringify(source)) as Theme;
  const table = pairs(choice);
  const changed = new Set<string>();
  if (!Object.keys(table).length) return { theme, changed: [] };

  // Which groups the theme shows at all: a bare label ("km/h", "BOOST BAR") follows only then.
  const shown = new Set<string>();
  walk(theme.components, (c) => {
    const p = pairOf(c.binding, table);
    if (p) shown.add(p.from);
    if (c.type === 'status.panel')
      for (const r of c.props.rows) {
        const rp = pairOf(r.binding, table);
        if (rp) shown.add(rp.from);
      }
  });

  walk(theme.components, (c) => {
    const before = JSON.stringify(c);
    const pair = pairOf(c.binding, table);
    const conv = (v: number): number => (pair ? round6(convert(v, pair.from, pair.to)) : v);
    const zones = (list: { from: number; to: number }[]): void => {
      for (const z of list) {
        z.from = conv(z.from);
        z.to = conv(z.to);
      }
    };
    const format = (f: string): string => (pair && pair.to === 'psi' ? fewerDecimals(f) : f);

    if (pair && c.binding) {
      const b = c.binding;
      const def = getSignal(b.signal)!;
      const min = conv(b.min ?? def.min);
      const max = conv(b.max ?? def.max);
      b.unit = pair.to;
      if (b.min !== undefined) b.min = min;
      if (b.max !== undefined) b.max = max;

      switch (c.type) {
        case 'gauge.arc': {
          const p = c.props;
          if (p.labels.show && p.ticks.major > 0) {
            const s = niceScale(min, max, p.ticks.major, p.labels.every);
            b.min = s.min;
            b.max = s.max;
            p.ticks.major = s.intervals;
            p.labels.every = s.every;
          }
          zones(p.fill.zones);
          p.redline.from = conv(p.redline.from);
          if (p.valueText.unit === pair.from) p.valueText.unit = pair.to;
          p.valueText.format = format(p.valueText.format);
          break;
        }
        case 'gauge.bar': {
          const p = c.props;
          if (p.labels.show) {
            if (p.ticks.show && p.ticks.count > 1) {
              const s = niceScale(min, max, p.ticks.count - 1, 1, true);
              b.min = s.min;
              b.max = s.max;
              p.ticks.count = Math.max(2, Math.min(50, s.intervals + 1));
            } else {
              b.min = Math.round(min);
              b.max = Math.round(max);
              if (b.max <= b.min) b.max = b.min + 1;
            }
          }
          zones(p.fill.zones);
          p.marker.value = conv(p.marker.value);
          break;
        }
        case 'value.digital':
          if (c.props.unit === pair.from) c.props.unit = pair.to;
          c.props.format = format(c.props.format);
          c.props.label = relabel(c.props.label, pair);
          zones(c.props.zones);
          break;
        case 'text':
          c.props.text = relabel(c.props.text, pair);
          c.props.format = format(c.props.format);
          break;
        case 'indicator.shiftlights':
          c.props.from = conv(c.props.from);
          c.props.to = conv(c.props.to);
          if (c.props.flashAbove) c.props.flashAbove = conv(c.props.flashAbove);
          break;
        default:
          break;
      }
    }

    if (c.type === 'status.panel')
      for (const r of c.props.rows) {
        const rp = pairOf(r.binding, table);
        if (!rp) continue;
        r.binding.unit = rp.to;
        if (r.binding.min !== undefined)
          r.binding.min = round6(convert(r.binding.min, rp.from, rp.to));
        if (r.binding.max !== undefined)
          r.binding.max = round6(convert(r.binding.max, rp.from, rp.to));
        if (r.unit === rp.from) r.unit = rp.to;
        if (rp.to === 'psi') r.format = fewerDecimals(r.format);
        r.label = relabel(r.label, rp);
      }

    // A text of its own: a unit beside a number ("km/h"), or a caption that ends in one
    // ("BOOST BAR"). Short, and only for what the theme shows in that unit.
    if (c.type === 'text' && !c.binding && c.props.text.length <= 24) {
      let text = c.props.text;
      for (const p of Object.values(table)) {
        if (!p || !shown.has(p.from)) continue;
        if (p.from === 'bar' || p.from === 'km') {
          if (new RegExp(`(^|\\s)${p.from}$`, 'i').test(text.trim())) text = relabel(text, p);
        } else text = relabel(text, p);
      }
      c.props.text = text;
    }

    if (JSON.stringify(c) !== before) changed.add(c.id);
  });

  return { theme, changed: [...changed] };
}
