import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { compileTheme } from '@idv7lol/theme-compiler';
import { bakeFamily } from '@idv7lol/theme-compiler/node';
import { createComponent, createEmptyTheme } from '@idv7lol/theme-schema';
import type { CompiledTheme } from '@idv7lol/theme-compiler';

const require = createRequire(import.meta.url);
interface Engine {
  shown: boolean;
  tick(): void;
  setShown(want: boolean): void;
  status(): { textLayers: number };
}
interface Metrics {
  chars: string;
  adv: number[];
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  spread: number;
}
const { ClusterEngine } = require('./engine.js') as {
  ClusterEngine: new (o: Record<string, unknown>) => Engine;
};
const { fontTable, textLine, layoutLine } = require('./text.js') as {
  fontTable(m: Metrics): { line: number; glyphs: string; sdf: number };
  textLine(
    text: string,
    m: Metrics,
    boxW: number,
    tracking: number,
  ): { text: string; spacing: number };
  layoutLine(
    parts: { text: string }[],
    m: Metrics,
    boxW: number,
    align: number,
    tracking: number,
    scale2: number,
    tabular: boolean,
  ): { codes: number[]; centres: number[] };
};
const { SignalStore } = require('./signals.js') as {
  SignalStore: new () => { set(id: string, value: unknown, at: number): void };
};
const { ClusterRender } = require('./cluster_render_client.js') as {
  ClusterRender: new (app: string) => {
    asset(o: Record<string, unknown>): number;
    font(asset: number, o: Record<string, unknown>): number;
    text(o: Record<string, unknown>): number;
    setText(ref: number, text: string): boolean;
    textStyle(ref: number, o: Record<string, unknown>): boolean;
  };
};

const baked = bakeFamily('sans');
const metrics = baked.metrics as unknown as Metrics;
const fonts = { sans: { metrics: baked.metrics, pixels: Buffer.from(baked.pixels) } };

interface Glyph {
  x: number;
  y: number;
  w: number;
  h: number;
  left: number;
  top: number;
  advance: number;
}
/** The table as the service reads it (cluster-render text_layer.cpp parse_font), with its checks. */
function parseFont(table: { line: number; glyphs: string; sdf: number }, aw: number, ah: number) {
  expect(table.line).toBeGreaterThanOrEqual(1);
  expect(table.sdf).toBeGreaterThanOrEqual(1);
  expect(table.sdf).toBeLessThanOrEqual(64);
  const glyphs = new Map<number, Glyph>();
  table.glyphs.split(' ').forEach((entry) => {
    expect(entry).toMatch(/^\d+:\d+,\d+,\d+,\d+,-?\d+,-?\d+,\d+$/);
    const [code = '', rest = ''] = entry.split(':');
    const [x = 0, y = 0, w = 0, h = 0, left = 0, top = 0, advance = 0] = rest
      .split(',')
      .map(Number);
    expect(glyphs.has(Number(code))).toBe(false);
    expect(x + w).toBeLessThanOrEqual(aw);
    expect(y + h).toBeLessThanOrEqual(ah);
    expect(Math.abs(left)).toBeLessThanOrEqual(2048);
    expect(advance).toBeLessThanOrEqual(2048);
    glyphs.set(Number(code), { x, y, w, h, left, top, advance });
  });
  expect(glyphs.size).toBeLessThanOrEqual(1024);
  return glyphs;
}

/**
 * Where the service puts each glyph's box: the pen and the alignment of cluster-render's lay_out
 * (text_layer.cpp), without its cut at the layer's edges. Returns the x of each drawn box.
 */
function serviceLayout(
  glyphs: Map<number, Glyph>,
  line: number,
  text: string,
  size: number,
  spacing: number,
  align: 'left' | 'center' | 'right',
  w: number,
) {
  const s = size / line;
  let pen = 0;
  const xs: number[] = [];
  [...text].forEach((ch, i) => {
    if (i) pen += spacing;
    const g = glyphs.get(ch.codePointAt(0)!);
    if (g && g.w && g.h) xs.push(Math.floor(pen + g.left * s + 0.5));
    if (g) pen += g.advance * s;
  });
  const room = w - pen;
  const shift =
    align === 'right'
      ? Math.floor(room + 0.5)
      : align === 'center'
        ? Math.floor(room / 2 + 0.5)
        : 0;
  return xs.map((x) => x + shift);
}

type Op = Record<string, unknown>;
/** The renderer client as far as the engine uses it, with the text calls of cluster-render 0.8.11. */
class FakeClient extends EventEmitter {
  ops: Op[] = [];
  next = 1;
  ready = true;
  texts = true;
  backend = 'id7';
  targets = 'panel:1920x720';
  effect(o: Op) {
    const ref = this.next++;
    this.ops.push({ op: 'layer', kind: 'effect', ref, ...o });
    return ref;
  }
  text(o: Op) {
    const ref = this.next++;
    this.ops.push({ op: 'layer', kind: 'text', ref, ...o });
    return ref;
  }
  font(asset: number, o: Op) {
    const ref = this.next++;
    this.ops.push({ op: 'font', ref, asset, ...o });
    return ref;
  }
  asset(o: Op) {
    const ref = this.next++;
    this.ops.push({ op: 'asset', ref, ...o });
    return ref;
  }
  pixels() {
    return true;
  }
  uniform(ref: number, name: string, v: number[]) {
    this.ops.push({ op: 'uniform', ref, name, v });
  }
  setText(ref: number, text: string) {
    this.ops.push({ op: 'text', ref, text });
    return true;
  }
  textStyle(ref: number, o: Op) {
    this.ops.push({ op: 'style', ref, ...o });
    return true;
  }
  bind() {}
  set() {}
  animate() {
    return 1;
  }
  stop() {}
  drop(ref: number) {
    this.ops.push({ op: 'drop', ref });
  }
  of(op: string) {
    return this.ops.filter((o) => o.op === op);
  }
}

/** A title, a speed with its unit beside it, a gear and a clock. */
function theme(): CompiledTheme {
  const doc = createEmptyTheme({ id: 'text-test', name: 'Text test' });
  doc.components.push(
    createComponent('rect', {
      id: 'bg',
      x: 0,
      y: 0,
      width: 1920,
      height: 720,
      props: { fill: '#000000' },
    }),
    createComponent('text', {
      id: 'title',
      x: 100,
      y: 200,
      width: 400,
      height: 60,
      props: { text: 'Trip' },
    }),
    createComponent('value.digital', {
      id: 'speed',
      x: 620,
      y: 170,
      width: 300,
      height: 90,
      binding: { signal: 'vehicle.speed' },
      props: { layout: 'inline' },
    }),
    createComponent('indicator.gear', { id: 'gear', x: 1000, y: 200, width: 120, height: 120 }),
    createComponent('clock', { id: 'clock', x: 1300, y: 200, width: 200, height: 60 }),
  );
  const result = compileTheme(doc, {
    fonts: { sans: { pixels: baked.pixels, metrics: baked.metrics } },
  });
  expect(result.report.errors).toEqual([]);
  return result.compiled!;
}

function setup(client = new FakeClient()) {
  let now = 100_000;
  const state = { textLayers: true };
  const signals = new SignalStore();
  const engine = new ClusterEngine({
    client,
    log: { info: () => undefined, warn: () => undefined },
    theme: theme(),
    fonts,
    signals,
    enabled: () => true,
    live: () => true,
    sweep: () => false,
    now: () => now,
    textLayers: () => state.textLayers,
  });
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      now += 1000 / 60;
      engine.tick();
    }
  };
  return { engine, client, state, signals, advance, now: () => now };
}

describe('texts as the renderer’s text layers', () => {
  it('gives the atlas as a font table the service takes', () => {
    const table = fontTable(metrics);
    const glyphs = parseFont(table, baked.width, baked.height);
    expect(table.line).toBe(metrics.cellH);
    expect(table.sdf).toBe(metrics.spread);
    // every glyph of the atlas, the space with no box
    expect(glyphs.size).toBe(new Set(metrics.chars).size);
    expect(glyphs.get(32)).toMatchObject({ w: 0, h: 0 });
    expect(glyphs.get(32)!.advance).toBeGreaterThan(0);
    // '0' is the atlas's first cell, centred on its advance
    const zero = glyphs.get(48)!;
    expect(zero).toMatchObject({ x: 0, y: 0, w: metrics.cellW, h: metrics.cellH, top: 0 });
    expect(zero.left * 2 + metrics.cellW).toBeCloseTo((metrics.adv[0] ?? 0) * metrics.cellH, 0);
    // the client the app ships takes it and a line drawn from it
    const cr = new ClusterRender('idv7lol');
    const atlas = cr.asset({ target: 'panel', format: 'r8', w: baked.width, h: baked.height });
    const font = cr.font(atlas, table);
    expect(font).toBeGreaterThan(0);
    const line = cr.text({
      target: 'panel',
      klass: 'content',
      z: 3,
      x: 10,
      y: 20,
      w: 300,
      h: 48,
      visible: 1,
      font,
      max: 64,
      size: 48,
      color: [1, 0.5, 0, 1],
      text: '',
    });
    expect(line).toBeGreaterThan(0);
    expect(cr.setText(line, '128 km/h')).toBe(true);
    expect(cr.textStyle(line, { align: 'center', spacing: -0.75 })).toBe(true);
  });

  it('lays a line that fits its box out where the app’s own shader draws it, within a pixel and 2% of its height', () => {
    const table = fontTable(metrics);
    const glyphs = parseFont(table, baked.width, baked.height);
    let worst = 0;
    const lines = ['0', '128', '88.8', 'SPORT+', '12:45 PM', 'Average', '1/min x1000', '-12.5°C'];
    [24, 40, 64, 96, 150].forEach((size) => {
      [0, 0.5, 1].forEach((align) => {
        lines.forEach((text) => {
          const w = 1400;
          const own = layoutLine([{ text }], metrics, w / size, align, 0, 1, false);
          const line = textLine(text, metrics, w / size, 0);
          const xs = serviceLayout(
            glyphs,
            table.line,
            line.text,
            size,
            line.spacing * size,
            align === 0 ? 'left' : align === 1 ? 'right' : 'center',
            w,
          );
          const space = metrics.chars.indexOf(' ');
          const centres = own.centres.filter((_, i) => {
            const code = own.codes[i] ?? -1;
            return code >= 0 && code !== space;
          });
          expect(xs.length).toBe(centres.length);
          xs.forEach((x, i) => {
            const centre = x + (metrics.cellW * size) / table.line / 2;
            worst = Math.max(worst, Math.abs(centre - (centres[i] ?? 0) * size) - 0.02 * size);
          });
        });
      });
    });
    // the font table holds whole atlas pixels, and the service puts each glyph on a whole pixel
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('keeps a line that is too wide inside its box, as the app’s shader squeezes it', () => {
    const boxW = 2; // glyph heights
    const line = textLine('123456', metrics, boxW, 0.05);
    expect(line.text).toBe('123456');
    expect(line.spacing).toBeLessThan(0);
    // a letter the font lacks in lower case goes as its capital, one it lacks altogether is left out
    expect(textLine('añb', metrics, 10, 0).text).toBe('ab');
    expect(textLine('Trip', metrics, 10, 0.02).spacing).toBeCloseTo(0.02, 1);
    expect(textLine('7', metrics, 10, 0.02)).toEqual({ text: '7', spacing: 0 });
  });

  it('makes plain lines text layers of a renderer that takes them, the rest effect layers', () => {
    const a = setup();
    a.signals.set('vehicle.speed', 128, a.now());
    a.advance(10);
    expect(a.engine.shown).toBe(true);
    const atlas = a.client.of('asset')[0]!;
    const fontOps = a.client.of('font');
    expect(fontOps).toHaveLength(1);
    const font = [fontOps[0]!];
    expect(font[0]).toMatchObject({ asset: atlas.ref, line: 64, sdf: 8 });
    const texts = a.client.ops.filter((o) => o.op === 'layer' && o.kind === 'text');
    const effects = a.client.ops.filter((o) => o.op === 'layer' && o.kind === 'effect');
    // the title, the gear, its mode and the clock; the speed carries its unit in a second size
    // and stays
    expect(texts).toHaveLength(4);
    expect(a.engine.status().textLayers).toBe(4);
    expect(effects.length).toBeGreaterThanOrEqual(2);
    texts.forEach((t) => {
      expect(t).toMatchObject({ font: font[0]!.ref, max: 32, size: t.h, target: 'panel' });
      expect(t.fs).toBeUndefined();
      expect((t.color as number[]).length).toBe(4);
      // no uniform goes to a text layer
      expect(a.client.ops.filter((o) => o.op === 'uniform' && o.ref === t.ref)).toEqual([]);
    });
    expect(a.client.of('text').map((o) => o.text)).toContain('Trip');
    expect(a.client.of('style').some((o) => o.align === 'left' || o.align === 'center')).toBe(true);
    // the font goes before the atlas it draws from
    a.engine.setShown(false);
    const drops = a.client.of('drop').map((o) => o.ref);
    expect(drops.indexOf(font[0]!.ref)).toBeGreaterThanOrEqual(0);
    expect(drops.indexOf(font[0]!.ref)).toBeLessThan(drops.indexOf(atlas.ref));
    texts.forEach((t) => expect(drops.indexOf(t.ref)).toBeLessThan(drops.indexOf(font[0]!.ref)));
  });

  it('sends the client the app ships a font, text layers and their strings it takes', () => {
    // the real client, as if a service whose hello has text 1 were connected; what it would
    // write to the socket is kept instead
    const cr = new ClusterRender('idv7lol') as unknown as FakeClient & {
      _send(m: Op): void;
    };
    const sent: Op[] = [];
    cr.ready = true;
    cr.texts = true;
    cr._send = (m) => {
      sent.push(m);
    };
    const a = setup(cr);
    a.signals.set('transmission.gear', 'D', a.now());
    a.advance(10);
    expect(a.engine.shown).toBe(true);
    expect(a.engine.status().textLayers).toBe(4);
    const font = sent.filter((m) => m.op === 'font');
    expect(font).toHaveLength(1);
    expect(font[0]).toMatchObject({ line: 64, sdf: 8 });
    const layers = sent.filter((m) => m.op === 'layer' && m.kind === 'text');
    expect(layers).toHaveLength(4);
    layers.forEach((l) =>
      expect(l).toMatchObject({ font: font[0]!.ref, max: 32, target: 'panel' }),
    );
    const strings = sent.filter((m) => m.op === 'text' && typeof m.text === 'string');
    expect(strings.map((m) => m.text)).toEqual(expect.arrayContaining(['Trip', 'D']));
    // nothing but text messages and layer fields goes to a text layer
    const refs = layers.map((l) => l.ref);
    const others = sent.filter(
      (m) => refs.indexOf(m.ref) >= 0 && ['layer', 'text', 'set'].indexOf(String(m.op)) < 0,
    );
    expect(others).toEqual([]);
  });

  it('draws every text itself with the setting off or an older renderer', () => {
    const off = setup();
    off.state.textLayers = false;
    off.advance(10);
    expect(off.client.of('font')).toEqual([]);
    expect(off.client.ops.filter((o) => o.kind === 'text')).toEqual([]);
    expect(off.engine.status().textLayers).toBe(0);

    const old = new FakeClient();
    old.texts = false;
    const b = setup(old);
    b.advance(10);
    expect(old.of('font')).toEqual([]);
    expect(old.ops.filter((o) => o.kind === 'text')).toEqual([]);
    expect(old.of('uniform').some((o) => o.name === 'u_text')).toBe(true);
  });

  it('makes the layout again when the setting changes or the renderer refuses a text layer', () => {
    const a = setup();
    a.state.textLayers = false;
    a.advance(10);
    expect(a.engine.status().textLayers).toBe(0);
    a.state.textLayers = true;
    a.advance(2);
    expect(a.engine.shown).toBe(true);
    expect(a.engine.status().textLayers).toBe(4);
    // the renderer could not draw one: back to effect layers, and it stays so
    const line = a.client.ops.filter((o) => o.kind === 'text').pop()!;
    a.client.emit('layer', line.ref, 'error', 'the renderer refused 4 glyphs');
    a.advance(2);
    expect(a.engine.shown).toBe(true);
    expect(a.engine.status().textLayers).toBe(0);
    a.advance(120);
    expect(a.engine.status().textLayers).toBe(0);
  });
});
