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
  uniformVectors,
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

  it('refuses an animation whose durations do not match its frames', () => {
    const t = theme([], {
      assets: {
        anim: {
          type: 'image',
          path: 'anim.png',
          animation: {
            frames: 3,
            columns: 3,
            frameWidth: 8,
            frameHeight: 8,
            durations: [100, 100],
          },
        },
      },
    });
    const r = validateTheme(t);
    expect(
      r.errors.some((e) => e.code.startsWith('schema.') && /durations/.test(e.path ?? '')),
    ).toBe(true);
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

  it("applies a group's visibility, opacity and condition to what is inside it", () => {
    const when = { signal: 'engine.rpm', op: 'gt' as const, value: 1000 };
    const inner = createComponent('rect', { id: 'inner', x: 0, y: 0, width: 50, height: 50 });
    const group = (extra: object) =>
      createComponent('group', {
        id: 'g',
        x: 300,
        y: 300,
        width: 100,
        height: 100,
        ...extra,
        props: { children: [{ ...inner, opacity: 0.5 }], clip: false },
      });
    const hidden = compileTheme(theme([group({ visible: false })]));
    expect(hidden.compiled!.pieces.some((p) => p.componentId === 'inner')).toBe(false);

    const faded = compileTheme(theme([group({ opacity: 0.5, visibleWhen: when })]));
    const piece = faded.compiled!.pieces.find((p) => p.componentId === 'inner')!;
    expect(piece.opacity).toBeCloseTo(0.25);
    expect(piece.visibleWhen).toEqual(when);
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

  it('lets a component sit flush against a zone', () => {
    // The top cowl ends at y = 128; this box starts exactly there.
    const flush = createComponent('value.digital', {
      id: 'flush',
      x: 800,
      y: 128,
      width: 200,
      height: 80,
    });
    const r = validateTheme(theme([flush]));
    expect(r.warnings.filter((w) => w.componentId === 'flush')).toEqual([]);
  });

  it('warns when gauge numerals run into each other', () => {
    // A 0–260 km/h dial labelled at all 14 ticks, the case Cluster Layouts users hit (#5).
    const crowded = createComponent('gauge.arc', {
      id: 'speedo',
      x: 700,
      y: 200,
      width: 300,
      height: 300,
      binding: { signal: 'vehicle.speed', min: 0, max: 260 },
      props: { ticks: { major: 13 }, labels: { every: 1, style: { size: 26 } } },
    });
    const codes = (c: typeof crowded) =>
      validateTheme(theme([c]))
        .warnings.filter((w) => w.componentId === 'speedo')
        .map((w) => w.code);
    expect(codes(crowded)).toContain('gauge.labels-overlap');
    // Every second numeral fits.
    const sparse = {
      ...crowded,
      props: { ...crowded.props, labels: { ...crowded.props.labels, every: 2 } },
    } as typeof crowded;
    expect(codes(sparse)).not.toContain('gauge.labels-overlap');
  });

  it('treats the M-car boxes as hints, and warns about readings below the bottom strip', () => {
    // Inside the M-car box but clear of every factory zone.
    const inBox = createComponent('value.digital', {
      id: 'in-m-box',
      x: 800,
      y: 295,
      width: 200,
      height: 80,
    });
    const low = createComponent('value.digital', {
      id: 'low',
      x: 100,
      y: 620,
      width: 300,
      height: 60,
    });
    const r = validateTheme(theme([inBox, low]));
    const all = [...r.errors, ...r.warnings, ...r.infos];
    expect(all.filter((f) => f.componentId === 'in-m-box' && f.code.startsWith('layout.'))).toEqual(
      [],
    );
    expect(r.warnings.filter((f) => f.componentId === 'low').map((f) => f.code)).toEqual([
      'layout.bottom-strip',
    ]);
  });

  it('judges an arc by the part of its sweep it draws, not its box', () => {
    // The box reaches y 860, but an arc over the top half ends at its centre (y 560).
    const top = createComponent('gauge.arc', {
      id: 'top-arc',
      x: 660,
      y: 260,
      width: 600,
      height: 600,
      props: { startAngle: 180, sweepAngle: 180 },
    });
    const full = createComponent('gauge.arc', {
      id: 'full-arc',
      x: 100,
      y: 260,
      width: 500,
      height: 500,
      props: { startAngle: 135, sweepAngle: 270 },
    });
    const r = validateTheme(theme([top, full]));
    const codes = (id: string) =>
      [...r.warnings, ...r.infos].filter((f) => f.componentId === id).map((f) => f.code);
    expect(codes('top-arc')).not.toContain('layout.bottom-strip');
    // 135° to 405° is lowest at its ends, sin 45° below the centre: y 687, past the strip.
    expect(codes('full-arc')).toContain('layout.bottom-strip');
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

  // Each 900×420 image is about 1.4 MiB, which cluster-render charges twice (PROTOCOL.md, "Choosing a
  // pixel format"); the warning starts at 9.6 MiB and the limit is 16 MiB.
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
    const fine = validateTheme(theme(['c1', 'c2'].map(big), { assets: { a: asset } }));
    expect(fine.warnings.some((w) => w.code === 'budget.images')).toBe(false);
    const warned = validateTheme(
      theme(['a1', 'a2', 'a3', 'a4'].map(big), { assets: { a: asset } }),
    );
    expect(warned.warnings.some((w) => w.code === 'budget.images')).toBe(true);
    expect(warned.errors.some((e) => e.code === 'budget.images')).toBe(false);
    // Six of them fit in 16 MiB counted once, not counted twice as the renderer does.
    const failed = validateTheme(
      theme(Array.from({ length: 6 }, (_, i) => `b${i}`).map(big), { assets: { a: asset } }),
    );
    expect(failed.errors.some((e) => e.code === 'budget.images')).toBe(true);
  });
});

describe('shaders', () => {
  it('pass the static lint', () => {
    for (const [kind, src] of Object.entries(SHADERS)) expect(lintShader(src), kind).toEqual([]);
  });

  it('count uniform vectors as GLSL ES does, and stay near what a car has drawn', () => {
    const src = [
      'uniform vec4 u_a[8];',
      'uniform float u_b;',
      'uniform mat4 u_m;',
      'uniform sampler2D u_t;',
    ].join('\n');
    expect(uniformVectors(src)).toBe(13);
    // The shift lights' 39 drew on a car; nothing of ours should go past the lint's limit.
    expect(uniformVectors(SHADERS.shiftlights)).toBe(39);
    for (const src of Object.values(SHADERS)) expect(uniformVectors(src)).toBeLessThanOrEqual(39);
  });

  it('refuse a shader with too many uniform vectors or a loop left with break', () => {
    const head = '#version 100\nprecision mediump float;\n';
    expect(lintShader(head + 'uniform vec4 u_x[70];\nvoid main() {}')).toContain(
      'takes 70 uniform vectors (max 48)',
    );
    expect(
      lintShader(head + 'void main() { for (int i = 0; i < 4; i++) { if (i > 1) break; } }'),
    ).toContain('leaves a loop with break');
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
