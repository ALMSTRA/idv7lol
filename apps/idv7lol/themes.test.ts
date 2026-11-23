import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildThemePackage, compileTheme, encodeThemePackage } from '@idv7lol/theme-compiler';
import { bakeFamily, imagesFor } from '@idv7lol/theme-compiler/node';
import { parseTheme } from '@idv7lol/theme-schema';

// Every theme in the repository, run through the same path a theme takes to the car:
// compile, package for a USB stick, check on the car, then build with the car's engine.
const require = createRequire(import.meta.url);
const { ClusterEngine } = require('./engine.js') as {
  ClusterEngine: new (o: Record<string, unknown>) => {
    shown: boolean;
    tick(): void;
    status(): { layers: number; failed: boolean };
  };
};
const { readPackage } = require('./usb_themes.js') as {
  readPackage(
    buf: Buffer,
    o: Record<string, unknown>,
  ): { theme: { pieces: unknown[]; images: unknown[]; units?: unknown } };
};
const { applyUnits, SYSTEMS } = require('./units.js') as {
  applyUnits<T>(theme: T, groups: string[]): T;
  SYSTEMS: Record<string, string[]>;
};
const SHADERS = require('./shaders.js') as Record<string, string>;

const root = join(__dirname, '..', '..', 'themes');
const themeFiles = [
  ...readdirSync(root).map((d) => join(root, d, 'theme.json')),
  ...['community', 'examples'].flatMap((g) =>
    readdirSync(join(root, g)).map((d) => join(root, g, d, 'theme.json')),
  ),
].filter((f) => existsSync(f));

const baked = bakeFamily('sans');
const fonts = { sans: { pixels: baked.pixels, metrics: baked.metrics } };

/** Counts what the engine asks of the renderer, like cluster-render would see it. */
class CountingClient extends EventEmitter {
  ready = true;
  next = 1;
  live = new Set<number>();
  private make() {
    const ref = this.next++;
    this.live.add(ref);
    return ref;
  }
  effect() {
    return this.make();
  }
  image() {
    return this.make();
  }
  asset() {
    return this.make();
  }
  drop(ref: number) {
    this.live.delete(ref);
  }
  pixels() {}
  uniform() {}
  bind() {}
  set() {}
  animate() {
    return 1;
  }
  stop() {}
  status() {}
}

describe('every bundled theme on the car path', () => {
  it('finds the themes', () => {
    expect(themeFiles.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of themeFiles) {
    const name = file.slice(root.length + 1).replace(/\\/g, '/');
    it(name, () => {
      const doc = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      const parsed = parseTheme(doc);
      const images = parsed.ok ? imagesFor(parsed.theme, dirname(file)) : {};
      const result = compileTheme(doc, { fonts, images });
      expect(result.report.errors).toEqual([]);
      const compiled = result.compiled!;
      for (const p of compiled.pieces) expect(SHADERS[p.shader], p.shader).toBeTypeOf('string');

      // As a USB package, checked by the car app.
      const pkg = buildThemePackage(result, { now: () => new Date('2026-11-09T00:00:00Z') });
      const read = readPackage(gzipSync(Buffer.from(encodeThemePackage(pkg))), {
        // the app's own version: a theme with a map window asks for 0.2.21
        appVersion: (require('./app.json') as { version: string }).version,
        shaders: SHADERS,
        fonts: ['sans'],
      });
      expect(read.theme.pieces).toHaveLength(compiled.pieces.length);

      // Built by the car's engine: every layer made, none refused, and all dropped when it stops.
      const client = new CountingClient();
      const engine = new ClusterEngine({
        client,
        log: { info: () => undefined, warn: () => undefined },
        theme: compiled,
        fonts: { sans: { metrics: baked.metrics, pixels: Buffer.from(baked.pixels) } },
        signals: { get: () => undefined },
        sweep: () => false,
        now: () => 1_000_000,
      });
      engine.tick();
      expect(engine.status().failed).toBe(false);
      expect(engine.shown).toBe(true);
      expect(engine.status().layers).toBe(compiled.pieces.length + compiled.images.length);
      (engine as unknown as { setShown(v: boolean): void }).setShown(false);
      expect(client.live.size).toBe(0);

      // the same theme in the driver's other units: as it came through a package, as many
      // layers, every one a shader the app has
      expect(read.theme.units).toEqual(
        compiled.units ? JSON.parse(JSON.stringify(compiled.units)) : undefined,
      );
      for (const groups of Object.values(SYSTEMS)) {
        const shown = applyUnits(read.theme, groups) as unknown as typeof compiled;
        expect(shown.pieces).toHaveLength(compiled.pieces.length);
        expect(shown.pieces.map((p) => p.key)).toEqual(compiled.pieces.map((p) => p.key));
        for (const p of shown.pieces) expect(SHADERS[p.shader], p.shader).toBeTypeOf('string');
        const c2 = new CountingClient();
        const e2 = new ClusterEngine({
          client: c2,
          log: { info: () => undefined, warn: () => undefined },
          theme: shown,
          fonts: { sans: { metrics: baked.metrics, pixels: Buffer.from(baked.pixels) } },
          signals: {
            get: (id: string) => ({ value: id.includes('temp') ? 90 : 100, t: 1_000_000 }),
          },
          sweep: () => false,
          now: () => 1_000_000,
        });
        e2.tick();
        e2.tick();
        expect(e2.status().failed, groups.join('+')).toBe(false);
        expect(e2.status().layers).toBe(compiled.pieces.length + compiled.images.length);
      }
    });
  }
});
