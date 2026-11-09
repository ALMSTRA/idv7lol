import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme, type Theme } from '@idv7lol/theme-schema';
import { SignalBus } from '@idv7lol/vehicle-signals';
import {
  EngineState,
  RecordingContext,
  ThemeEngine,
  collectSignals,
  contrastRatio,
  formatDash,
  formatNumber,
  hitTest,
  parseColor,
  reservedZoneOverlaps,
  resolvePalette,
  sampleTrack,
  selectPaletteId,
  shiftLightsLit,
  smoothStep,
  themeCost,
  toCss,
} from './index.js';

function themeWith(components: Theme['components'], extra: Partial<Theme> = {}): Theme {
  const t = createEmptyTheme({ id: 'test', name: 'Test' });
  return { ...t, ...extra, components };
}

describe('formatting', () => {
  it('formats numbers per the format string', () => {
    expect(formatNumber(123.456, '0')).toBe('123');
    expect(formatNumber(123.456, '0.0')).toBe('123.5');
    expect(formatNumber(5, '00')).toBe('05');
    expect(formatNumber(5, '+0')).toBe('+5');
    expect(formatNumber(-5, '+0')).toBe('-5');
    expect(formatNumber(1234567, '0,0')).toBe('1,234,567');
    expect(formatNumber(42, '0 km/h')).toBe('42 km/h');
    expect(formatNumber(-0.04, '0.0')).toBe('0.0');
    expect(formatNumber(NaN, '0')).toBe('--');
    expect(formatDash('0.0')).toBe('---');
  });
});

describe('colours', () => {
  it('parses hex, rgb and hsl', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('#00ff0080').a).toBeCloseTo(0.502, 2);
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(toCss(parseColor('#336699'))).toBe('#336699');
  });
  it('computes contrast ratios', () => {
    expect(contrastRatio(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 0);
  });
});

describe('smoothing and tracks', () => {
  it('eases towards the target and snaps when close', () => {
    let v = 0;
    for (let i = 0; i < 100; i++) v = smoothStep(v, 100, 0.1, 1 / 60);
    expect(v).toBe(100);
    expect(smoothStep(0, 100, 0.1, 0.1)).toBeCloseTo(63.2, 0);
  });
  it('interpolates numeric and colour keyframes', () => {
    const kf = [
      { t: 0, value: 0 },
      { t: 1, value: 10 },
    ];
    expect(sampleTrack(kf, 0.5, 'linear')).toBe(5);
    const cf = [
      { t: 0, value: '#000000' },
      { t: 1, value: '#ffffff' },
    ];
    expect(sampleTrack(cf, 0.5, 'linear')).toBe('#808080');
  });
});

describe('engine state', () => {
  it('evaluates bindings with unit conversion, range and staleness', () => {
    const bus = new SignalBus(() => 0);
    const state = new EngineState(bus, 0);
    bus.set('vehicle.speed', 100, 0);
    const eb = state.evaluate('k', {
      signal: 'vehicle.speed',
      unit: 'mph',
      scale: 1,
      offset: 0,
      clamp: true,
      smoothing: 0,
      fallback: 'dash',
    });
    expect(eb.value).toBeCloseTo(62.1, 1);
    expect(eb.max).toBeCloseTo(205.05, 1);
    expect(eb.stale).toBe(false);
    state.tick(10_000);
    const stale = state.evaluate('k', {
      signal: 'vehicle.speed',
      scale: 1,
      offset: 0,
      clamp: true,
      smoothing: 0,
      fallback: 'dash',
    });
    expect(stale.stale).toBe(true);
  });

  it('evaluates conditions and edges', () => {
    const bus = new SignalBus(() => 0);
    const state = new EngineState(bus, 0);
    bus.set('engine.rpm', 3000);
    bus.set('drive.mode', 'SPORT');
    expect(state.condition({ signal: 'engine.rpm', op: 'gt', value: 2000 })).toBe(true);
    expect(
      state.condition({
        all: [{ signal: 'engine.rpm', op: 'between', value: 1000, value2: 2000 }],
      }),
    ).toBe(false);
    expect(state.condition({ any: [{ signal: 'drive.mode', op: 'eq', value: 'SPORT' }] })).toBe(
      true,
    );
    expect(state.condition({ not: { signal: 'missing.signal', op: 'truthy' } })).toBe(true);
    expect(state.edge('e', false)).toBe(null);
    expect(state.edge('e', true)).toBe('rising');
    expect(state.edge('e', false)).toBe('falling');
  });

  it('selects palettes by drive mode and manual override', () => {
    const theme = createEmptyTheme();
    const state = new EngineState(new SignalBus(() => 0), 0);
    expect(selectPaletteId(theme, state)).toBe('night');
    state.bus.set('drive.mode', 'SPORT');
    expect(selectPaletteId(theme, state)).toBe('sport');
    state.manualPalette = 'night';
    expect(selectPaletteId(theme, state)).toBe('night');
    const p = resolvePalette(theme, 'does-not-exist');
    expect(p.colors['accent']).toBe('#3f8cff');
  });
});

describe('rendering', () => {
  it('renders every component type without throwing and reports stats', () => {
    const comps = [
      createComponent('rect', {
        id: 'bg',
        props: { fill: '$surface', stroke: { color: '$accent', width: 2 } },
      }),
      createComponent('ellipse', {
        id: 'e',
        props: {
          fill: {
            type: 'radial',
            stops: [
              { offset: 0, color: '#fff' },
              { offset: 1, color: '#000' },
            ],
          },
        },
      }),
      createComponent('line', { id: 'l' }),
      createComponent('arc', { id: 'a' }),
      createComponent('text', {
        id: 't',
        props: { text: 'Hello {value}{unit}' },
        binding: { signal: 'vehicle.speed' },
      }),
      createComponent('image', { id: 'i' }),
      createComponent('gauge.arc', {
        id: 'g',
        props: {
          needle: { show: true },
          valueText: { show: true, showUnit: true },
          redline: { show: true },
        },
      }),
      createComponent('gauge.bar', {
        id: 'b',
        props: { ticks: { show: true }, labels: { show: true } },
      }),
      createComponent('value.digital', { id: 'v', props: { label: 'Speed' } }),
      createComponent('indicator.gear', { id: 'gear' }),
      createComponent('indicator.shiftlights', { id: 's' }),
      createComponent('clock', { id: 'c' }),
      createComponent('telltale', { id: 'tt' }),
      createComponent('status.panel', { id: 'sp' }),
      createComponent('group', {
        id: 'grp',
        props: { clip: true, children: [createComponent('rect', { id: 'inner' })] },
      }),
    ];
    const theme = themeWith(comps);
    const engine = new ThemeEngine(new EngineState(new SignalBus(() => 1000), 1000));
    engine.state.bus.set('vehicle.speed', 88, 1000);
    engine.state.bus.set('engine.rpm', 4500, 1000);
    engine.state.bus.set('transmission.gear', '4', 1000);
    engine.state.bus.set('transmission.mode', 'M', 1000);
    engine.state.bus.set('fuel.level', 40, 1000);
    engine.state.bus.set('light.turn.left', true, 1000);
    const ctx = new RecordingContext();
    const stats = engine.render(ctx, theme, 1000, {
      wallClock: () => new Date(2026, 0, 1, 9, 5, 0),
      showReservedZones: true,
    });
    expect(stats.drawn).toBe(15); // 14 leaf types + inner rect
    expect(stats.skipped).toBe(0);
    const texts = ctx.texts();
    expect(texts).toContain('Hello 88km/h');
    expect(texts).toContain('88');
    expect(texts).toContain('4');
    expect(texts).toContain('M');
    expect(texts).toContain('09:05');
    // reserved zone labels are drawn
    expect(texts).toContain('Top cowl (factory telltales)');
    // the group's clip was applied
    expect(ctx.count('clip')).toBeGreaterThanOrEqual(2);
  });

  it('shows dashes for stale values and hides when asked', () => {
    const theme = themeWith([
      createComponent('value.digital', {
        id: 'v',
        binding: { signal: 'vehicle.speed', fallback: 'dash' },
      }),
      createComponent('value.digital', {
        id: 'h',
        binding: { signal: 'engine.rpm', fallback: 'hide' },
      }),
    ]);
    const engine = new ThemeEngine(new EngineState(new SignalBus(() => 0), 0));
    const ctx = new RecordingContext();
    engine.render(ctx, theme, 0);
    const texts = ctx.texts();
    expect(texts).toContain('-');
    expect(texts.filter((t) => t.includes('rpm'))).toHaveLength(0);
  });

  it('respects visibleWhen and animation overrides', () => {
    const theme = themeWith(
      [
        createComponent('rect', {
          id: 'r',
          visibleWhen: { signal: 'engine.rpm', op: 'gt', value: 5000 },
        }),
        createComponent('rect', {
          id: 'fade',
          animations: [{ clip: 'fade', trigger: { on: 'load' }, delay: 0 }],
        }),
      ],
      {
        animations: {
          fade: {
            duration: 1000,
            easing: 'linear',
            loop: false,
            direction: 'normal',
            tracks: [
              {
                property: 'opacity',
                keyframes: [
                  { t: 0, value: 0 },
                  { t: 1, value: 1 },
                ],
              },
            ],
          },
        },
      },
    );
    const engine = new ThemeEngine(new EngineState(new SignalBus(() => 0), 0));
    engine.state.bus.set('engine.rpm', 1000, 0);
    let ctx = new RecordingContext();
    let stats = engine.render(ctx, theme, 0);
    // rpm too low → first rect skipped; fade at opacity 0 → skipped
    expect(stats.skipped).toBe(2);
    engine.state.bus.set('engine.rpm', 6000, 500);
    ctx = new RecordingContext();
    stats = engine.render(ctx, theme, 500);
    expect(stats.drawn).toBe(2);
  });
});

describe('geometry and cost', () => {
  it('hit-tests rotated components and detects reserved-zone overlaps', () => {
    const theme = themeWith([
      createComponent('rect', { id: 'a', x: 100, y: 100, width: 200, height: 100 }),
      createComponent('rect', {
        id: 'b',
        x: 150,
        y: 120,
        width: 50,
        height: 50,
        rotation: 45,
        anchor: 'center',
      }),
      createComponent('rect', { id: 'cowl', x: 800, y: 10, width: 100, height: 50 }),
    ]);
    expect(hitTest(theme, 175, 145)?.component.id).toBe('b');
    expect(hitTest(theme, 110, 110)?.component.id).toBe('a');
    expect(hitTest(theme, 5, 5)).toBeUndefined();
    const overlaps = reservedZoneOverlaps(theme);
    expect(overlaps.map((o) => `${o.componentId}:${o.zone.id}`)).toContain('cowl:cowl');
    expect(overlaps.some((o) => o.componentId === 'a' && o.zone.id === 'glass-corner-left')).toBe(
      true,
    );
  });

  it('checks the display profile zones even when a theme leaves them out', () => {
    const theme = createEmptyTheme({ id: 'z', name: 'Z' });
    const bare = {
      ...theme,
      layout: { ...theme.layout, reservedZones: [] },
      components: [createComponent('rect', { id: 'cowl', x: 800, y: 10, width: 100, height: 50 })],
    };
    expect(reservedZoneOverlaps(bare).map((o) => `${o.componentId}:${o.zone.id}`)).toContain(
      'cowl:cowl',
    );
  });

  it('estimates layer cost and flags budgets', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      createComponent('gauge.arc', {
        id: `g${i}`,
        props: { needle: { show: true }, valueText: { show: true } },
      }),
    );
    const cost = themeCost(themeWith(many));
    expect(cost.layers).toBeGreaterThan(64);
    expect(cost.overLimit).toBe(true);
    expect(themeCost(themeWith([createComponent('rect')])).layers).toBe(1);
  });

  it('collects referenced signals', () => {
    const theme = themeWith([
      createComponent('gauge.arc', { id: 'g' }),
      createComponent('indicator.gear', { id: 'gear' }),
      createComponent('rect', {
        id: 'r',
        visibleWhen: { signal: 'light.turn.left', op: 'truthy' },
      }),
    ]);
    const s = collectSignals(theme.components);
    expect([...s].sort()).toEqual([
      'engine.rpm',
      'light.turn.left',
      'transmission.gear',
      'transmission.mode',
    ]);
  });

  it('computes shift-light counts', () => {
    expect(shiftLightsLit(undefined, 5000, 7000, 10)).toBe(0);
    expect(shiftLightsLit(4000, 5000, 7000, 10)).toBe(0);
    expect(shiftLightsLit(6000, 5000, 7000, 10)).toBe(5);
    expect(shiftLightsLit(9000, 5000, 7000, 10)).toBe(10);
  });
});
