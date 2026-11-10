import { describe, expect, it } from 'vitest';
import {
  createComponent,
  createEmptyTheme,
  serializeTheme,
  type Theme,
} from '@idv7lol/theme-schema';
import { RENDERER_LIMITS } from '@idv7lol/theme-engine';
import {
  GLYPHS,
  codeOf,
  compileTheme,
  fallbackMetrics,
  layoutLine,
  lintShader,
  SHADERS,
  textLayerGeometry,
  validateTheme,
} from './index.js';

function theme(components: Theme['components'], extra: Partial<Theme> = {}): Theme {
  return { ...createEmptyTheme({ id: 'spec', name: 'Spec' }), ...extra, components };
}

describe('validateTheme', () => {
  it('accepts a sane theme and counts layers', () => {
    const t = theme([
      createComponent('gauge.arc', {
        id: 'tacho',
        x: 420,
        y: 110,
        width: 500,
        height: 500,
        props: { needle: { show: true }, valueText: { show: true } },
      }),
      createComponent('value.digital', { id: 'speed', x: 700, y: 250, width: 500, height: 220 }),
    ]);
    const r = validateTheme(t);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.layers).toBeGreaterThanOrEqual(5);
  });

  it('reports schema errors with paths', () => {
    const r = validateTheme({ schemaVersion: 1, id: 'x' });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code.startsWith('schema.') && e.path === 'name')).toBe(true);
  });

  it('detects unknown signals, bad units, missing tokens and duplicate ids', () => {
    const t = theme([
      createComponent('gauge.arc', { id: 'a', binding: { signal: 'engine.nope' } }),
      createComponent('value.digital', {
        id: 'a',
        binding: { signal: 'vehicle.speed', unit: 'celsius' },
      }),
      createComponent('rect', { id: 'r', x: 300, y: 300, props: { fill: '$nope' } }),
    ]);
    const r = validateTheme(t);
    const codes = r.errors.map((e) => e.code);
    expect(codes).toContain('signal.unknown');
    expect(codes).toContain('binding.unit');
    expect(codes).toContain('palette.unknown-token');
    expect(codes).toContain('component.duplicate-id');
  });

  it('flags reserved zones: keep-clear is an error, factory zones a warning for readings', () => {
    const t = theme([
      createComponent('value.digital', { id: 'corner', x: 0, y: 0, width: 200, height: 100 }),
      createComponent('text', {
        id: 'cowl',
        x: 800,
        y: 20,
        width: 200,
        height: 40,
        props: { text: 'Hi' },
      }),
      createComponent('rect', { id: 'deco', x: 800, y: 20, width: 200, height: 40 }),
    ]);
    const r = validateTheme(t);
    expect(r.errors.some((e) => e.code === 'layout.keep-clear' && e.componentId === 'corner')).toBe(
      true,
    );
    expect(r.warnings.some((w) => w.code === 'layout.reserved' && w.componentId === 'cowl')).toBe(
      true,
    );
    expect(
      r.infos.some((w) => w.code === 'layout.reserved-decor' && w.componentId === 'deco'),
    ).toBe(true);
  });

  it('judges a wide rev arc by what it paints, not by its square box', () => {
    const arc = createComponent('gauge.arc', {
      id: 'revs',
      x: 530,
      y: 160,
      width: 860,
      height: 860,
      props: { startAngle: 180, sweepAngle: 180, needle: { show: false } },
    });
    const r = validateTheme(theme([arc]));
    expect(r.warnings.filter((w) => w.componentId === 'revs')).toEqual([]);
    // The same box drawn as a full circle reaches the bottom telltales and leaves the panel.
    const full = { ...arc, props: { ...arc.props, sweepAngle: 360 } } as typeof arc;
    const codes = validateTheme(theme([full])).warnings.map((w) => w.code);
    expect(codes).toContain('layout.out-of-bounds');
  });

  it("doesn't let a theme relax a factory zone by reusing its id", () => {
    const base = createEmptyTheme({ id: 'spec', name: 'Spec' });
    const t = theme(
      [createComponent('value.digital', { id: 'corner', x: 0, y: 0, width: 200, height: 100 })],
      {
        layout: {
          ...base.layout,
          reservedZones: [
            ...base.layout.reservedZones,
            {
              id: 'glass-corner-left',
              name: 'Mine',
              kind: 'info',
              x: 1900,
              y: 700,
              width: 10,
              height: 10,
            },
          ],
        },
      },
    );
    const r = validateTheme(t);
    const corner = r.errors.filter(
      (e) => e.code === 'layout.keep-clear' && e.componentId === 'corner',
    );
    expect(corner).toHaveLength(1);
  });

  it('warns about profile availability and glyph coverage', () => {
    const t = theme(
      [
        createComponent('value.digital', {
          id: 'soc',
          x: 600,
          y: 300,
          binding: { signal: 'hybrid.battery.soc' },
          props: { label: 'Batería ☀' },
        }),
      ],
      { vehicleProfile: 'generic-ice' },
    );
    const r = validateTheme(t);
    expect(r.warnings.some((w) => w.code === 'signal.profile')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'text.glyphs')).toBe(true);
  });

  it('enforces the layer budget', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      createComponent('gauge.arc', {
        id: `g${i}`,
        x: 600,
        y: 300,
        width: 100,
        height: 100,
        props: { needle: { show: true }, valueText: { show: true, showUnit: true } },
      }),
    );
    const r = validateTheme(theme(many));
    expect(r.errors.some((e) => e.code === 'budget.layers')).toBe(true);
    expect(r.layers).toBeGreaterThan(RENDERER_LIMITS.layersPerApp);
  });
});

describe('image memory budget', () => {
  const asset = { type: 'image' as const, data: 'data:image/png;base64,AAAA', width: 4, height: 4 };
  const pic = (id: string, x: number) =>
    createComponent('image', { id, x, y: 240, width: 500, height: 400, props: { asset: 'a' } });

  // Each 900×420 image is about 1.5 MiB; the warning starts at 9.6 MiB and the limit is 16 MiB.
  it('warns when images take much of the renderer memory and fails over the limit', () => {
    const big = (id: string) =>
      createComponent('image', {
        id,
        x: 500,
        y: 220,
        width: 900,
        height: 420,
        props: { asset: 'a' },
      });
    expect(validateTheme(theme([pic('p1', 450)], { assets: { a: asset } })).errors).toEqual([]);
    const warned = validateTheme(
      theme(['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'].map(big), { assets: { a: asset } }),
    );
    expect(warned.warnings.some((w) => w.code === 'budget.images')).toBe(true);
    const failed = validateTheme(
      theme(Array.from({ length: 11 }, (_, i) => `b${i}`).map(big), { assets: { a: asset } }),
    );
    expect(failed.errors.some((e) => e.code === 'budget.images')).toBe(true);
  });
});

describe('shaders', () => {
  it('pass the static lint', () => {
    for (const [kind, src] of Object.entries(SHADERS)) expect(lintShader(src), kind).toEqual([]);
  });
});

describe('compileTheme', () => {
  it('produces pieces with uniforms, colours and dynamics for every component type', () => {
    const t = theme([
      createComponent('rect', {
        id: 'bg',
        x: 0,
        y: 200,
        width: 1920,
        height: 400,
        props: {
          fill: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '$surface' },
              { offset: 1, color: '$background' },
            ],
          },
        },
      }),
      createComponent('gauge.arc', {
        id: 'tacho',
        x: 420,
        y: 110,
        width: 500,
        height: 500,
        props: {
          needle: { show: true },
          valueText: { show: true, showUnit: true },
          redline: { show: true, from: 6500 },
        },
      }),
      createComponent('gauge.bar', {
        id: 'fuel',
        x: 100,
        y: 560,
        width: 400,
        height: 24,
        props: { ticks: { show: true }, labels: { show: true } },
      }),
      createComponent('value.digital', {
        id: 'speed',
        x: 760,
        y: 250,
        width: 400,
        height: 220,
        props: { label: 'km/h', zones: [{ from: 120, to: 400, color: '$danger' }] },
      }),
      createComponent('indicator.gear', { id: 'gear', x: 1200, y: 300, width: 160, height: 160 }),
      createComponent('indicator.shiftlights', {
        id: 'lights',
        x: 600,
        y: 140,
        width: 700,
        height: 40,
      }),
      createComponent('clock', { id: 'clock', x: 1600, y: 500, width: 200, height: 48 }),
      createComponent('telltale', { id: 'left', x: 1300, y: 500, width: 64, height: 64 }),
      createComponent('status.panel', {
        id: 'panel',
        x: 1450,
        y: 480,
        width: 360,
        height: 160,
        props: { background: '$surface', divider: { color: '$track', width: 1 } },
      }),
      createComponent('text', {
        id: 'title',
        x: 760,
        y: 560,
        width: 400,
        height: 40,
        props: { text: 'IDV7LOL' },
      }),
    ]);
    const r = compileTheme(t, { now: () => new Date('2026-01-01T00:00:00Z') });
    expect(r.report.errors).toEqual([]);
    expect(r.compiled).toBeDefined();
    const c = r.compiled!;
    expect(c.layers).toBe(c.pieces.length);
    expect(c.layers).toBeLessThanOrEqual(RENDERER_LIMITS.layersPerApp);
    const byShader = new Map<string, number>();
    for (const p of c.pieces) byShader.set(p.shader, (byShader.get(p.shader) ?? 0) + 1);
    expect(byShader.get('arc-band')).toBe(1);
    expect(byShader.get('arc-ticks')).toBe(1);
    expect(byShader.get('needle')).toBe(1);
    expect(byShader.get('bar')).toBe(1);
    expect(byShader.get('bar-ticks')).toBe(1);
    expect(byShader.get('shiftlights')).toBe(1);
    expect(byShader.get('telltale')).toBe(1);
    expect(byShader.get('panel')).toBe(1);
    expect(byShader.get('text')).toBeGreaterThanOrEqual(8);
    // dynamics reference compiled bindings with ranges
    const band = c.pieces.find((p) => p.key === 'tacho:band')!;
    const dyn = band.dynamics[0]!;
    expect(dyn.kind).toBe('norm');
    if (dyn.kind === 'norm') expect(dyn.binding.rangeMax).toBe(9000);
    expect(band.statics['u_red']![0]).toBeCloseTo(6500 / 9000, 3);
    // gradient became two colours
    const bg = c.pieces.find((p) => p.key === 'bg')!;
    expect(bg.colors['u_fill']).toBe('$surface');
    expect(bg.colors['u_fill2']).toBe('$background');
    expect(bg.statics['u_grad']).toEqual([90, 1, 0, 0]);
    // shaders only for used kinds, signals collected
    expect(Object.keys(c.shaders).sort()).toEqual([...byShader.keys()].sort());
    expect(c.signals).toContain('engine.rpm');
    expect(c.signals).toContain('drive.mode');
    expect(c.fonts).toEqual(['sans']);
    // bundle has theme.json and reports the missing atlas
    expect(r.files.map((f) => f.path)).toEqual(['theme.json']);
    expect(r.report.infos.some((i) => i.code === 'bundle.font-missing')).toBe(true);
    // JSON round-trips
    expect(JSON.parse(r.files[0]!.data as string).id).toBe('spec');
  });

  it('refuses to compile invalid themes unless forced', () => {
    const t = theme([createComponent('gauge.arc', { id: 'g', binding: { signal: 'nope.nope' } })]);
    expect(compileTheme(t).compiled).toBeUndefined();
    expect(compileTheme(t, { force: true }).compiled).toBeDefined();
  });

  it('keeps the serialized theme compilable', () => {
    const t = theme([createComponent('value.digital', { id: 'v', x: 700, y: 300 })]);
    const r = compileTheme(JSON.parse(serializeTheme(t)));
    expect(r.report.ok).toBe(true);
  });
});

describe('glyphs and text layout', () => {
  it('has unique glyphs with digits first', () => {
    expect(new Set(GLYPHS).size).toBe(GLYPHS.length);
    for (let d = 0; d <= 9; d++) expect(codeOf(String(d))).toBe(d);
    expect(codeOf('p')).toBe(codeOf('P') >= 0 ? codeOf('p') : -1);
    expect(codeOf('€')).toBe(-1);
  });

  it('lays out a line with alignment, secondary glyphs and compression', () => {
    const m = fallbackMetrics();
    const l = layoutLine([{ text: '120' }, { text: 'km/h', secondary: true }], m, 6, 0.5, 0, 0.5);
    const codes = l.codes.filter((c) => c >= 0);
    expect(codes).toHaveLength(7);
    expect(codes.slice(3).every((c) => c >= 1000)).toBe(true);
    const centres = l.centres.slice(0, 7);
    for (let i = 1; i < centres.length; i++) expect(centres[i]!).toBeGreaterThan(centres[i - 1]!);
    expect(l.width).toBeLessThanOrEqual(6);
    const tight = layoutLine([{ text: '000000000000' }], m, 2, 0, 0);
    expect(tight.width).toBeLessThanOrEqual(12 * 0.47 + 1e-9);
    expect(tight.width).toBeGreaterThanOrEqual(12 * 0.47 * 0.85 - 1e-9);
  });

  it('computes text layer geometry for baselines', () => {
    const box = { x: 0, y: 0, w: 200, h: 100 };
    const style = {
      font: 'default',
      size: 40,
      weight: 'regular',
      color: '$text',
      align: 'center',
      baseline: 'middle',
      letterSpacing: 0,
      uppercase: false,
    } as const;
    const g = textLayerGeometry(box, style);
    expect(g.h).toBeCloseTo(40 / 0.92, 5);
    expect(g.y + g.h / 2).toBeCloseTo(50, 5);
    expect(g.align).toBe(0.5);
    const top = textLayerGeometry(box, { ...style, baseline: 'top' });
    expect(top.y).toBeGreaterThanOrEqual(-5);
  });
});
