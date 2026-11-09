import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { compileTheme } from '@idv7lol/theme-compiler';
import { bakeFamily } from '@idv7lol/theme-compiler/node';
import type { CompiledTheme } from '@idv7lol/theme-compiler';

const require = createRequire(import.meta.url);
// The MGU app is CommonJS for Node 8; load it as the head unit would.
interface Engine {
  shown: boolean;
  tick(): void;
}
interface Store {
  set(id: string, value: unknown, at?: number): void;
  get(id: string): { value: unknown; at: number; valid: boolean } | undefined;
}
interface LineLayout {
  codes: number[];
  centres: number[];
  width: number;
}
const { ClusterEngine } = require('./engine.js') as {
  ClusterEngine: new (o: Record<string, unknown>) => Engine;
};
const { SignalStore, driveModeOf, GEAR_TEXT } = require('./signals.js') as {
  SignalStore: new () => Store;
  driveModeOf: (raw: unknown) => string | null;
  GEAR_TEXT: (gear: unknown, stage: unknown) => string | null;
};
const { layoutLine, formatNumber } = require('./text.js') as {
  layoutLine: (
    parts: Array<{ text: string; secondary?: boolean }>,
    metrics: object,
    boxW: number,
    align: number,
    tracking: number,
    scale2: number,
    tabular: boolean,
  ) => LineLayout;
  formatNumber: (v: number, fmt?: string) => string;
};

/** Records every operation like the real client would send it. */
class FakeClient extends EventEmitter {
  ops: Array<Record<string, unknown>> = [];
  layers = new Map<number, Record<string, unknown>>();
  next = 1;
  ready = true;
  backend = 'id7';
  targets = 'map:1088x480,panel:1920x720,hud:800x480';
  effect(o: Record<string, unknown>) {
    const ref = this.next++;
    this.layers.set(ref, { kind: 'effect', ...o });
    this.ops.push({ op: 'layer', ref, ...o });
    return ref;
  }
  asset(o: Record<string, unknown>) {
    const ref = this.next++;
    this.layers.set(ref, { kind: 'asset', ...o });
    this.ops.push({ op: 'asset', ref, ...o });
    return ref;
  }
  pixels(ref: number, rects: unknown, px: Uint8Array) {
    this.ops.push({ op: 'pixels', ref, bytes: px.length });
  }
  uniform(ref: number, name: string, v: number[], o?: { type?: string }) {
    this.ops.push({ op: 'uniform', ref, name, v, type: o?.type });
  }
  bind(ref: number, sampler: string, asset: number) {
    this.ops.push({ op: 'bind', ref, sampler, asset });
  }
  set(ref: number, o: Record<string, unknown>) {
    this.ops.push({ op: 'set', ref, ...o });
  }
  animate(ref: number, o: Record<string, unknown>) {
    this.ops.push({ op: 'animate', ref, ...o });
    return 1;
  }
  stop(ref: number, anim: number) {
    this.ops.push({ op: 'stop', ref, anim });
  }
  drop(ref: number) {
    this.layers.delete(ref);
    this.ops.push({ op: 'drop', ref });
  }
  status() {
    this.ops.push({ op: 'status' });
  }
  count(op: string) {
    return this.ops.filter((o) => o.op === op).length;
  }
  uniforms(name: string) {
    return this.ops.filter((o) => o.op === 'uniform' && o.name === name);
  }
}

const performanceTheme = JSON.parse(
  readFileSync(new URL('../../themes/performance/theme.json', import.meta.url), 'utf8'),
) as unknown;
const baked = bakeFamily('sans');
const compiled = compileTheme(performanceTheme, {
  fonts: { sans: { pixels: baked.pixels, metrics: baked.metrics } },
}).compiled as CompiledTheme;
const fonts = { sans: { metrics: baked.metrics, pixels: Buffer.from(baked.pixels) } };
const quiet = { info: () => undefined, warn: () => undefined };

function setup(opts: { enabled?: boolean; live?: boolean } = {}) {
  let now = 100_000;
  const store = new SignalStore();
  const client = new FakeClient();
  const state = { enabled: opts.enabled ?? true, live: opts.live ?? true };
  const engine = new ClusterEngine({
    client,
    log: quiet,
    theme: compiled,
    fonts,
    signals: store,
    enabled: () => state.enabled,
    live: () => state.live,
    sweep: () => false,
    now: () => now,
    paletteId: () => 'night',
  });
  const feed = (values: Record<string, number | string | boolean>) => {
    for (const [k, v] of Object.entries(values)) store.set(k, v, now);
  };
  const advance = (ms: number) => {
    const ticks = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < ticks; i++) {
      now += 1000 / 60;
      engine.tick();
    }
  };
  return { engine, client, store, state, feed, advance, time: () => now };
}

describe('MGU engine', () => {
  it('builds one layer per compiled piece plus the font atlas, and tears down when disabled', () => {
    const t = setup();
    t.feed({
      'engine.rpm': 3000,
      'vehicle.speed': 80,
      'transmission.gear': '4',
      'drive.mode': 'COMFORT',
    });
    t.advance(50);
    expect(t.engine.shown).toBe(true);
    expect(t.client.count('asset')).toBe(1);
    expect(t.client.count('layer')).toBe(compiled.pieces.length);
    expect(t.client.count('pixels')).toBe(1);
    // every layer got its size and the font layers a binding
    expect(t.client.uniforms('u_size')).toHaveLength(compiled.pieces.length);
    expect(t.client.count('bind')).toBe(compiled.pieces.filter((p) => p.usesFont).length);
    // the tachometer band got a normalised value near 3000/8000
    const band = compiled.pieces.findIndex((p) => p.key === 'tacho:band') + 2; // ref: asset is 1
    const values = t.client.uniforms('u_value').filter((u) => u.ref === band);
    expect(values.length).toBeGreaterThan(0);
    const last = values[values.length - 1]!.v as number[];
    expect(last[0]).toBeGreaterThan(0.3);
    expect(last[0]).toBeLessThanOrEqual(0.375);
    // text layers got glyph codes
    expect(t.client.uniforms('u_text').length).toBeGreaterThan(5);
    t.state.enabled = false;
    t.advance(20);
    expect(t.engine.shown).toBe(false);
    expect(t.client.count('drop')).toBe(compiled.pieces.length + 1);
    expect(t.client.layers.size).toBe(0);
  });

  it('eases values and sends only changes; hides the layout when data goes stale', () => {
    const t = setup();
    t.feed({ 'engine.rpm': 1000 });
    t.advance(500);
    const before = t.client.count('uniform');
    t.advance(500); // nothing changed: no new value uniforms beyond texts refreshing
    const steady = t.client.uniforms('u_value').length;
    t.advance(500);
    expect(t.client.uniforms('u_value').length).toBe(steady);
    t.feed({ 'engine.rpm': 7000 });
    t.advance(300);
    expect(t.client.count('uniform')).toBeGreaterThan(before);
    const band = compiled.pieces.findIndex((p) => p.key === 'tacho:band') + 2;
    const vals = t.client
      .uniforms('u_value')
      .filter((u) => u.ref === band)
      .map((u) => (u.v as number[])[0]!);
    expect(vals[vals.length - 1]!).toBeCloseTo(7000 / 8000, 2);
    // live stops → grace → teardown
    t.state.live = false;
    t.advance(1000);
    expect(t.engine.shown).toBe(true);
    t.advance(800);
    expect(t.engine.shown).toBe(false);
  });

  it('flashes the shift lights above the limiter and stops below it', () => {
    const t = setup();
    t.feed({ 'engine.rpm': 7500 });
    t.advance(100);
    expect(t.client.ops.some((o) => o.op === 'animate' && o.name === 'u_flash')).toBe(true);
    t.feed({ 'engine.rpm': 3000 });
    t.advance(100);
    expect(t.client.count('stop')).toBe(1);
  });

  it('changes the gear colour in manual mode and switches text visibility with conditions', () => {
    const t = setup();
    t.feed({
      'engine.rpm': 2000,
      'transmission.gear': '3',
      'transmission.mode': 'M',
      'drive.mode': 'SPORT',
    });
    t.advance(100);
    const gearPiece = compiled.pieces.findIndex((p) => p.key === 'gear:gear') + 2;
    const colors = t.client.uniforms('u_color').filter((u) => u.ref === gearPiece);
    const lastColor = colors[colors.length - 1]!.v as number[];
    // manualColor is $accent (night: #3f8cff) → blue dominant
    expect(lastColor[2]!).toBeGreaterThan(lastColor[0]!);
    expect(t.client.uniforms('u_text').some((u) => (u.v as number[])[0] === 3)).toBe(true); // '3' is glyph code 3
  });
});

describe('vehicle helpers', () => {
  it('maps BMW drive-mode payloads and gear enums', () => {
    expect(driveModeOf('SPORT_PLUS')).toBe('SPORT_PLUS');
    expect(driveModeOf({ mode: 'ECO_PRO' })).toBe('ECO_PRO');
    expect(driveModeOf('COMFORT')).toBe('COMFORT');
    expect(driveModeOf('BASIS')).toBe('COMFORT');
    expect(driveModeOf('???')).toBe(null);
    expect(GEAR_TEXT(3, 'D')).toBe('3');
    expect(GEAR_TEXT(-1, 'R')).toBe('R');
    expect(GEAR_TEXT(0, 'P')).toBe('P');
  });
});

describe('text helpers (Node 8 port)', () => {
  it('matches the compiler formatting and layout', () => {
    expect(formatNumber(123.456, '0.0')).toBe('123.5');
    expect(formatNumber(-5, '+0')).toBe('-5');
    const line = layoutLine(
      [{ text: '120' }, { text: 'km/h', secondary: true }],
      baked.metrics,
      6,
      0.5,
      0,
      0.5,
      false,
    );
    const codes = line.codes.filter((c: number) => c >= 0);
    expect(codes).toHaveLength(7);
    expect(codes.slice(3).every((c: number) => c >= 1000)).toBe(true);
  });
});
