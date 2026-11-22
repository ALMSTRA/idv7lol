import { describe, expect, it } from 'vitest';
import {
  UNIT_SYSTEMS,
  convertThemeUnits,
  createComponent,
  createEmptyTheme,
  niceScale,
  parseTheme,
  type Component,
  type Theme,
} from './index.js';

function themeOf(components: unknown[]): Theme {
  const r = parseTheme({ ...createEmptyTheme({ id: 'units', name: 'Units' }), components });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.theme;
}
const find = (t: Theme, id: string): Component => {
  const c = t.components.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};
const textOf = (t: Theme, id: string): string =>
  (find(t, id) as { props: { text: string } }).props.text;

describe('niceScale', () => {
  it('gives a speedometer round miles with about as many numerals', () => {
    // 0–260 km/h, 13 steps, a numeral every second one: 0–160 mph in 10s, numerals every 20
    expect(niceScale(0, 161.556, 13, 2)).toEqual({ min: 0, max: 160, intervals: 16, every: 2 });
    // a numeral at every one of 13 steps: no more numerals than fitted before
    const full = niceScale(0, 161.556, 13, 1);
    expect(full.intervals / full.every + 1).toBeLessThanOrEqual(14);
    expect(full.max).toBe(160);
  });
  it('keeps the numerals of a bar at every tick', () => {
    const s = niceScale(0, 186.4, 6, 1, true);
    expect(s.every).toBe(1);
    expect(s.min).toBe(0);
    expect(Number.isInteger(s.max / s.intervals)).toBe(true);
  });
  it('leaves an empty range alone', () => {
    expect(niceScale(5, 5, 4, 1)).toEqual({ min: 5, max: 5, intervals: 4, every: 1 });
  });
});

describe('convertThemeUnits', () => {
  const base = themeOf([
    createComponent('gauge.arc', {
      id: 'speedo',
      binding: { signal: 'vehicle.speed', min: 0, max: 260 },
      props: { ticks: { major: 13 }, labels: { show: true, every: 2 } },
    }),
    createComponent('gauge.arc', {
      id: 'painted',
      binding: { signal: 'vehicle.speed', min: 0, max: 260 },
      props: { ticks: { major: 13 }, labels: { show: false } },
    }),
    createComponent('gauge.bar', {
      id: 'water',
      binding: { signal: 'engine.coolant.temp', min: 50, max: 130 },
      props: {
        fill: { zones: [{ from: 115, to: 130, color: '#ff0000' }] },
        marker: { show: true, value: 90 },
      },
    }),
    createComponent('value.digital', {
      id: 'boost',
      binding: { signal: 'engine.boost' },
      props: { format: '0.00', label: 'BOOST BAR' },
    }),
    createComponent('value.digital', {
      id: 'boost-psi',
      binding: { signal: 'engine.boost', unit: 'psi' },
      props: { format: '0.0' },
    }),
    createComponent('text', {
      id: 'range',
      binding: { signal: 'vehicle.range' },
      props: { text: 'RANGE {value} km' },
    }),
    createComponent('text', { id: 'unit', props: { text: 'KM/H' } }),
    createComponent('text', { id: 'caption', props: { text: 'OIL °C' } }),
    createComponent('text', { id: 'prose', props: { text: 'bar none' } }),
    createComponent('text', {
      id: 'fast',
      props: { text: 'FAST' },
      visibleWhen: { signal: 'vehicle.speed', op: 'gt', value: 130 },
    }),
    createComponent('value.digital', { id: 'revs', binding: { signal: 'engine.rpm' } }),
  ]);

  it('changes nothing for metric, and never the theme it was given', () => {
    const before = JSON.stringify(base);
    const r = convertThemeUnits(base, UNIT_SYSTEMS.metric);
    expect(r.changed).toEqual([]);
    expect(JSON.stringify(r.theme)).toBe(before);
    convertThemeUnits(base, UNIT_SYSTEMS['mph-fahrenheit']);
    expect(JSON.stringify(base)).toBe(before);
  });

  it('gives mph and miles, with round numerals where the gauge draws them', () => {
    const r = convertThemeUnits(base, UNIT_SYSTEMS['mph-celsius']);
    const speedo = find(r.theme, 'speedo');
    if (speedo.type !== 'gauge.arc') throw new Error('type');
    expect(speedo.binding).toMatchObject({ unit: 'mph', min: 0, max: 160 });
    expect(speedo.props.ticks.major).toBe(16);
    // numerals painted in a picture: the needle keeps its place, to the mile
    const painted = find(r.theme, 'painted');
    if (painted.type !== 'gauge.arc') throw new Error('type');
    expect(painted.binding!.max).toBeCloseTo(161.5565, 3);
    expect(painted.props.ticks.major).toBe(13);
    expect(textOf(r.theme, 'range')).toBe('RANGE {value} mi');
    expect(textOf(r.theme, 'unit')).toBe('MPH');
    // temperatures, pressures and everything else stay
    expect(find(r.theme, 'water').binding!.unit).toBeUndefined();
    expect(textOf(r.theme, 'caption')).toBe('OIL °C');
    expect([...r.changed].sort()).toEqual(['painted', 'range', 'speedo', 'unit']);
  });

  it('gives °F and psi with their zones, markers and one decimal less', () => {
    const r = convertThemeUnits(base, UNIT_SYSTEMS['mph-fahrenheit']);
    const water = find(r.theme, 'water');
    if (water.type !== 'gauge.bar') throw new Error('type');
    expect(water.binding).toMatchObject({ unit: 'fahrenheit', min: 122, max: 266 });
    expect(water.props.fill.zones[0]).toMatchObject({ from: 239, to: 266 });
    expect(water.props.marker.value).toBe(194);
    const boost = find(r.theme, 'boost');
    if (boost.type !== 'value.digital') throw new Error('type');
    expect(boost.binding!.unit).toBe('psi');
    expect(boost.props.format).toBe('0.0');
    expect(boost.props.label).toBe('BOOST PSI');
    expect(textOf(r.theme, 'caption')).toBe('OIL °F');
  });

  it('leaves alone what the author set, prose, conditions and other signals', () => {
    const r = convertThemeUnits(base, UNIT_SYSTEMS['mph-fahrenheit']);
    const own = find(r.theme, 'boost-psi');
    if (own.type !== 'value.digital') throw new Error('type');
    expect(own.binding!.unit).toBe('psi');
    expect(own.props.format).toBe('0.0');
    expect(textOf(r.theme, 'prose')).toBe('bar none');
    // a condition is compared with the value the car sends, in km/h
    expect(find(r.theme, 'fast').visibleWhen).toEqual({
      signal: 'vehicle.speed',
      op: 'gt',
      value: 130,
    });
    expect(r.changed).not.toContain('revs');
    expect(parseTheme(r.theme).ok).toBe(true);
  });
});
