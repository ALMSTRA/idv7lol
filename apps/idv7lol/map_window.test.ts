import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { gzipSync } from 'node:zlib';
import { buildThemePackage, compileTheme, encodeThemePackage } from '@idv7lol/theme-compiler';
import { bakeFamily } from '@idv7lol/theme-compiler/node';
import { createComponent, createEmptyTheme } from '@idv7lol/theme-schema';
import type { CompiledTheme } from '@idv7lol/theme-compiler';

const require = createRequire(import.meta.url);
interface Engine {
  shown: boolean;
  tick(): void;
  setShown(want: boolean): void;
  status(): { map: string };
}
const { ClusterEngine, mapPart, mapWhole, targetSize } = require('./engine.js') as {
  ClusterEngine: new (o: Record<string, unknown>) => Engine;
  mapWhole(tw: number, th: number, w: number, h: number): Record<string, number>;
  mapPart(tw: number, th: number, w: number, h: number): Record<string, number>;
  targetSize(targets: unknown, name: string): { w: number; h: number } | null;
};
const { SignalStore } = require('./signals.js') as { SignalStore: new () => object };
const { readPackage } = require('./usb_themes.js') as {
  readPackage(buf: Buffer, opts: Record<string, unknown>): { theme: CompiledTheme };
};
const SHADERS = require('./shaders.js') as Record<string, string>;

type Op = Record<string, unknown>;
/** The renderer client as far as the engine uses it, with the hosting calls of cluster-render 0.8.2. */
class FakeClient extends EventEmitter {
  ops: Op[] = [];
  next = 1;
  ready = true;
  hostLayers = true;
  backend = 'id7';
  targets = 'map:1088x480,panel:1920x720,hud:800x480';
  effect(o: Op) {
    const ref = this.next++;
    this.ops.push({ op: 'layer', ref, ...o });
    return ref;
  }
  asset() {
    return this.next++;
  }
  pixels() {
    return true;
  }
  uniform(ref: number, name: string, v: number[]) {
    this.ops.push({ op: 'uniform', ref, name, v });
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
  host(into: string, o: Op) {
    this.ops.push({ op: 'host', into, ...o });
    return true;
  }
  unhost(target: string) {
    this.ops.push({ op: 'unhost', target });
  }
  of(op: string) {
    return this.ops.filter((o) => o.op === op);
  }
}

const baked = bakeFamily('sans');
const fonts = { sans: { metrics: baked.metrics, pixels: Buffer.from(baked.pixels) } };

/** A backdrop, a map window of 720x480 in the middle, and a speed over its corner. */
function mapTheme(window = { x: 600, y: 150, width: 720, height: 480 }) {
  const doc = createEmptyTheme({ id: 'map-test', name: 'Map test' });
  doc.components.push(
    createComponent('rect', {
      id: 'bg',
      x: 0,
      y: 0,
      width: 1920,
      height: 720,
      props: { fill: '#000000' },
    }),
    createComponent('map', { id: 'map', ...window, props: { radius: 16 } }),
    createComponent('value.digital', {
      id: 'speed',
      x: 620,
      y: 170,
      width: 200,
      height: 90,
      binding: { signal: 'vehicle.speed' },
    }),
  );
  return doc;
}

function compileMap(window?: Parameters<typeof mapTheme>[0], fit?: 'cover' | 'contain') {
  const doc = mapTheme(window);
  const win = doc.components.find((c) => c.id === 'map');
  if (fit && win && win.type === 'map') win.props.fit = fit;
  const result = compileTheme(doc, {
    fonts: { sans: { pixels: baked.pixels, metrics: baked.metrics } },
  });
  expect(result.report.errors).toEqual([]);
  return result;
}

function setup(theme: CompiledTheme, client = new FakeClient()) {
  let now = 100_000;
  const state = { map: true, strip: null as number | null };
  const engine = new ClusterEngine({
    client,
    log: { info: () => undefined, warn: () => undefined },
    theme,
    fonts,
    signals: new SignalStore(),
    enabled: () => true,
    live: () => true,
    sweep: () => false,
    now: () => now,
    paletteId: () => 'night',
    map: () => state.map,
    stripY: () => state.strip,
  });
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      now += 1000 / 60;
      engine.tick();
    }
  };
  return { engine, client, state, advance };
}

describe('the map window on the car', () => {
  it('reads the map target from the renderer’s hello and takes its middle, unsquashed', () => {
    expect(targetSize('map:1088x480,panel:1920x720,hud:800x480', 'map')).toEqual({
      w: 1088,
      h: 480,
    });
    expect(targetSize('panel:1920x720', 'map')).toBeNull();
    expect(targetSize(undefined, 'map')).toBeNull();
    // cluster-render PROTOCOL.md's own example: a 720x480 window shows the map's centre part
    expect(mapPart(1088, 480, 720, 480)).toEqual({ src_x: 184, src_y: 0, src_w: 720, src_h: 480 });
    // a wide window takes the whole width and a band of the height
    expect(mapPart(1088, 480, 1088, 240)).toEqual({
      src_x: 0,
      src_y: 120,
      src_w: 1088,
      src_h: 240,
    });
    // never less than the renderer hosts
    const thin = mapPart(1088, 480, 1900, 40);
    expect(thin.src_w).toBe(1088);
    expect(thin.src_h).toBeGreaterThanOrEqual(32);
  });

  it('asks for the map in the window and lets the fill go only once it is drawn there', () => {
    const { compiled } = compileMap();
    const { engine, client, advance } = setup(compiled!);
    advance(2);
    expect(engine.shown).toBe(true);
    expect(client.of('host')).toEqual([
      {
        op: 'host',
        into: 'panel',
        target: 'map',
        x: 600,
        y: 150,
        w: 720,
        h: 480,
        src_x: 184,
        src_y: 0,
        src_w: 720,
        src_h: 480,
      },
    ]);
    const map = client.of('layer').find((l) => l.fs === SHADERS['map'])!;
    expect(map).toMatchObject({ target: 'panel', x: 600, y: 150, w: 720, h: 480 });
    const lit = () =>
      client.ops.filter((o) => o.op === 'uniform' && o.ref === map.ref && o.name === 'u_on').pop()!
        .v;
    expect(lit()).toEqual([0]);
    expect(engine.status().map).toMatch(/^waiting/);

    client.emit('hosting', 'map', { state: 'waiting', reason: 'panel is not on screen (idle)' });
    expect(lit()).toEqual([0]);
    expect(engine.status().map).toBe('waiting: panel is not on screen (idle)');
    client.emit('hosting', 'map', { state: 'live', reason: '' });
    expect(lit()).toEqual([1]);
    expect(engine.status().map).toBe('the map is drawn in the window');
    // another target's host is not ours
    client.emit('hosting', 'hud', { state: 'waiting', reason: 'x' });
    expect(lit()).toEqual([1]);

    // asked once, however long it stays up
    advance(120);
    expect(client.of('host')).toHaveLength(1);

    // hidden: the map goes back to its own place before the layers go
    engine.setShown(false);
    const last = client.ops.map((o) => o.op);
    expect(last.indexOf('unhost')).toBeGreaterThan(-1);
    expect(last.indexOf('unhost')).toBeLessThan(last.indexOf('drop'));
    expect(client.of('unhost')).toEqual([{ op: 'unhost', target: 'map' }]);
  });

  it('gives the map back when the setting is switched off, and asks again when on', () => {
    const { compiled } = compileMap();
    const { engine, client, state, advance } = setup(compiled!);
    advance(2);
    client.emit('hosting', 'map', { state: 'live' });
    state.map = false;
    advance(31);
    expect(client.of('unhost')).toHaveLength(1);
    expect(engine.status().map).toBe('off (setting)');
    const map = client.of('layer').find((l) => l.fs === SHADERS['map'])!;
    const lit = client.ops.filter((o) => o.ref === map.ref && o.name === 'u_on').pop()!.v;
    expect(lit).toEqual([0]);
    state.map = true;
    advance(31);
    expect(client.of('host')).toHaveLength(2);
  });

  it('asks nothing of a renderer that hosts no map from layers, and shows the fill', () => {
    const { compiled } = compileMap();
    const old = new FakeClient();
    old.hostLayers = false;
    const a = setup(compiled!, old);
    a.advance(40);
    expect(old.of('host')).toEqual([]);
    expect(old.of('unhost')).toEqual([]);
    expect(a.engine.status().map).toBe('needs cluster-render 0.8.2 or newer');

    const noMap = new FakeClient();
    noMap.targets = 'panel:1920x720';
    const b = setup(compiled!, noMap);
    b.advance(40);
    expect(noMap.of('host')).toEqual([]);
    expect(b.engine.status().map).toBe('this cluster has no map target');

    // the renderer comes later: asked then
    const late = new FakeClient();
    late.ready = false;
    const c = setup(compiled!, late);
    c.advance(40);
    expect(late.of('host')).toEqual([]);
    late.ready = true;
    c.advance(31);
    expect(late.of('host')).toHaveLength(1);
  });

  it('keeps the window above the car’s bottom strip', () => {
    const { compiled } = compileMap({ x: 600, y: 300, width: 720, height: 400 });
    const { client, state, advance } = setup(compiled!);
    state.strip = 646;
    advance(2);
    expect(client.of('host')[0]).toMatchObject({ x: 600, y: 300, w: 720, h: 346 });
  });

  it('shows all of the map, as large as fits, in a window that asks for it', () => {
    expect(mapWhole(1088, 480, 720, 480)).toEqual({ x: 0, y: 81, w: 720, h: 318 });
    expect(mapWhole(1088, 480, 1920, 720)).toEqual({ x: 144, y: 0, w: 1632, h: 720 });
    expect(mapWhole(1088, 480, 1088, 480)).toEqual({ x: 0, y: 0, w: 1088, h: 480 });

    const { compiled } = compileMap(undefined, 'contain');
    const { client, advance } = setup(compiled!);
    advance(2);
    // the whole 1088x480 picture, in the middle of the 720x480 window at 600,150
    expect(client.of('host')).toEqual([
      {
        op: 'host',
        into: 'panel',
        target: 'map',
        x: 600,
        y: 231,
        w: 720,
        h: 318,
        src_x: 0,
        src_y: 0,
        src_w: 1088,
        src_h: 480,
      },
    ]);
    // the fill gives way there only: the rest of the window keeps it
    const map = client.of('layer').find((l) => l.fs === SHADERS['map'])!;
    const open = client.ops.filter((o) => o.ref === map.ref && o.name === 'u_open').pop()!.v;
    expect(open).toEqual([0, 81, 720, 318]);

    // a window that fills its place: the fill gives way in all of it
    const cover = setup(compileMap().compiled!);
    cover.advance(2);
    const m2 = cover.client.of('layer').find((l) => l.fs === SHADERS['map'])!;
    expect(
      cover.client.ops.filter((o) => o.ref === m2.ref && o.name === 'u_open').pop()!.v,
    ).toEqual([0, 0, 720, 480]);

    // too thin for all of the map (under 32 rows): its middle fills the window, as before
    const thin = setup(compileMap({ x: 600, y: 150, width: 64, height: 40 }, 'contain').compiled!);
    thin.advance(2);
    expect(thin.client.of('host')[0]).toMatchObject({ x: 600, y: 150, w: 64, h: 40 });
  });

  it('says nothing about a map for a theme without a window', () => {
    const doc = mapTheme();
    doc.components = doc.components.filter((c) => c.id !== 'map');
    const { compiled } = compileTheme(doc, {
      fonts: { sans: { pixels: baked.pixels, metrics: baked.metrics } },
    });
    const { engine, client, advance } = setup(compiled!);
    advance(40);
    expect(client.of('host')).toEqual([]);
    expect(client.of('unhost')).toEqual([]);
    expect(engine.status().map).toBe('');
  });

  it('comes through a USB package with the app’s own shaders', () => {
    const result = compileMap();
    const pkg = gzipSync(Buffer.from(encodeThemePackage(buildThemePackage(result))));
    const got = readPackage(pkg, { appVersion: '0.2.21', shaders: SHADERS, fonts: ['sans'] });
    const kinds = got.theme.pieces.map((p) => p.shader);
    expect(kinds).toContain('map');
    expect(kinds).toContain('flat-hole');
    expect(got.theme.shaders['map']).toBe(SHADERS['map']);
    // an app from before the map window says why it cannot show the theme
    const { map: _m, 'flat-hole': _h, ...older } = SHADERS;
    expect(() =>
      readPackage(pkg, { appVersion: '0.2.20', shaders: older, fonts: ['sans'] }),
    ).toThrow(/needs idv7lol 0\.2\.21 or newer/);
  });
});
