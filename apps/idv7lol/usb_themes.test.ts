import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  buildThemePackage,
  compileTheme,
  packageFileName,
  USB_THEMES_DIR,
  type ThemePackage,
} from '@idv7lol/theme-compiler';
import { decodePng, encodePng } from '@idv7lol/theme-compiler/node';
import { createComponent, createEmptyTheme } from '@idv7lol/theme-schema';

const require = createRequire(import.meta.url);
interface Meta {
  key: string;
  id: string;
  name: string;
  hash: string;
}
interface Result {
  file: string;
  ok: boolean;
  reason?: string;
  theme?: Meta;
}
const usb = require('./usb_themes.js') as {
  ThemeLibrary: new (o: { dataDir: string }) => {
    list(): Meta[];
    load(key: string): {
      theme: { shaders: Record<string, string>; images: Array<{ file: string }> };
      imageDir: string;
    };
    remove(key: string): boolean;
    storage(): string;
  };
  UsbWatcher: new (o: Record<string, unknown>) => {
    tick(done?: (results: Result[]) => void): number;
  };
  gunzipCapped(buf: Buffer, cap: number, cb: (err: Error | null, out?: Buffer) => void): void;
  cleanPreview(list: unknown): unknown[];
  readPackage(
    buf: Buffer,
    opts: Record<string, unknown>,
  ): {
    theme: { preview: unknown[]; sketch: unknown[] };
  };
  LIMITS: { fileBytes: number; jsonBytes: number };
  compareVersions(a: string, b: string): number;
};
const SHADERS = require('./shaders.js') as Record<string, string>;

function samplePackage(): ThemePackage {
  const png = encodePng(4, 4, new Uint8Array(4 * 4 * 4).fill(200));
  const base = createEmptyTheme({ id: 'usb-test', name: 'USB test' });
  const theme = {
    ...base,
    assets: {
      pic: {
        type: 'image' as const,
        data: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
      },
    },
    components: [
      createComponent('value.digital', { id: 'speed', x: 760, y: 300, width: 300, height: 120 }),
      createComponent('image', {
        id: 'logo',
        x: 300,
        y: 300,
        width: 64,
        height: 64,
        props: { asset: 'pic' },
      }),
    ],
  };
  const result = compileTheme(theme, { images: { pic: decodePng(png) } });
  expect(result.report.errors).toEqual([]);
  return buildThemePackage(result, { now: () => new Date('2026-11-09T00:00:00Z') });
}

let root: string;
let stick: string;
let dataDir: string;
const put = (pkg: unknown, name = 'usb-test.idv7pkg', raw?: Buffer) => {
  mkdirSync(stick, { recursive: true });
  writeFileSync(join(stick, name), raw ?? gzipSync(Buffer.from(JSON.stringify(pkg))));
};
type Watcher = ReturnType<typeof watcher>;
/** One look at the stick: what was installed or refused this round. */
const look = (w: Watcher) => new Promise<Result[]>((resolve) => w.tick(resolve));
const watcher = (extra: Record<string, unknown> = {}) =>
  new usb.UsbWatcher({
    ...extra,
    library: new usb.ThemeLibrary({ dataDir }),
    roots: [join(root, 'media')],
    appVersion: '0.2.0',
    shaders: SHADERS,
    fonts: ['sans'],
  });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'idv7lol-usb-'));
  stick = join(root, 'media', 'STICK', ...USB_THEMES_DIR.split('/'));
  dataDir = join(root, 'data');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('themes from a USB stick', () => {
  it('installs a package from the stick once, with the app’s own shaders', async () => {
    const pkg = samplePackage();
    expect(packageFileName(pkg.id)).toBe('usb-test.idv7pkg');
    expect(pkg.theme).not.toHaveProperty('shaders');
    put(pkg);
    const w = watcher();
    const first = await look(w);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ ok: true, theme: { id: 'usb-test', key: 'usb:usb-test' } });
    expect(await look(w)).toEqual([]);

    const lib = new usb.ThemeLibrary({ dataDir });
    expect(lib.list().map((t) => t.key)).toEqual(['usb:usb-test']);
    const loaded = lib.load('usb:usb-test');
    for (const [kind, src] of Object.entries(loaded.theme.shaders)) expect(src).toBe(SHADERS[kind]);
    const img = loaded.theme.images[0]!;
    expect(statSync(join(loaded.imageDir, img.file)).size).toBe(64 * 64 * 4);

    expect(lib.remove('usb:usb-test')).toBe(true);
    expect(lib.list()).toEqual([]);
  });

  it('refuses packages that could hurt or don’t fit', async () => {
    const cases: Array<[string, (p: ThemePackage) => void, RegExp]> = [
      ['shader.idv7pkg', (p) => (p.theme.pieces[0]!.shader = 'evil' as never), /unknown shader/],
      [
        'proto.idv7pkg',
        (p) => (p.theme.pieces[0]!.shader = 'constructor' as never),
        /unknown shader/,
      ],
      [
        'sprite.idv7pkg',
        (p) => {
          const img = p.theme.images[0]!;
          img.sprite = { columns: 1, rows: 1, cellW: 64, cellH: 64, frames: 2, durations: [100] };
        },
        /animation 0: more frames than cells/,
      ],
      [
        'durations.idv7pkg',
        (p) => {
          const img = p.theme.images[0]!;
          img.sprite = { columns: 2, rows: 1, cellW: 32, cellH: 64, frames: 2, durations: [100] };
        },
        /animation 0: bad durations/,
      ],
      ['version.idv7pkg', (p) => (p.minAppVersion = '9.0.0'), /needs idv7lol 9\.0\.0/],
      ['path.idv7pkg', (p) => (p.theme.images[0]!.file = '../../escape.rgba'), /bad file name/],
      ['pixels.idv7pkg', (p) => (p.images[p.theme.images[0]!.file] = 'AAAA'), /wrong size/],
      [
        'layers.idv7pkg',
        (p) => {
          const piece = p.theme.pieces[0]!;
          p.theme.pieces = Array.from({ length: 70 }, () => ({ ...piece }));
        },
        /more than 64 layers/,
      ],
      ['offscreen.idv7pkg', (p) => (p.theme.pieces[0]!.x = 99999), /outside the panel/],
    ];
    for (const [name, change] of cases) {
      const p = samplePackage();
      change(p);
      put(p, name);
    }
    put(null, 'junk.idv7pkg', Buffer.from('not gzip'));
    const results = await look(watcher());
    expect(results.every((r) => !r.ok)).toBe(true);
    for (const [name, , reason] of cases)
      expect(results.find((r) => r.file === name)?.reason).toMatch(reason);
    expect(results.find((r) => r.file === 'junk.idv7pkg')?.reason).toMatch(/not gzip/);
    expect(existsSync(join(dataDir, 'themes', 'usb-test'))).toBe(false);
  });

  it('says in plain words why a good theme could not be saved', async () => {
    // the app still running from an install that an update replaced: its folders are gone
    dataDir = join(root, 'oap_old', 'data');
    put(samplePackage());
    const gone = await look(watcher());
    expect(gone[0]).toMatchObject({ ok: false });
    expect(gone[0]!.reason).toMatch(/data folder is gone.*Restart the head unit/);
    expect(gone[0]!.reason).not.toContain(root);
    expect(existsSync(join(root, 'oap_old'))).toBe(false);
    expect(new usb.ThemeLibrary({ dataDir }).storage()).toMatch(/gone/);

    // something in the way of the themes folder: the system's error, without its path
    dataDir = join(root, 'data');
    mkdirSync(dataDir);
    writeFileSync(join(dataDir, 'themes'), 'not a folder');
    const blocked = await look(watcher());
    expect(blocked[0]).toMatchObject({ ok: false });
    expect(blocked[0]!.reason).toMatch(/cannot write to its data folder \(E[A-Z]+\)/);
    expect(blocked[0]!.reason).not.toContain(root);

    rmSync(join(dataDir, 'themes'));
    const lib = new usb.ThemeLibrary({ dataDir });
    expect(lib.storage()).toBe('');
    expect(readdirSync(dataDir)).toEqual([]);
  });

  it('reads a new copy again after the stick changes', async () => {
    put(samplePackage());
    const w = watcher();
    expect(await look(w)).toHaveLength(1);
    const p = samplePackage();
    p.version = '0.2.0';
    put(p);
    const again = await look(w);
    expect(again[0]).toMatchObject({ ok: true });
    const meta = JSON.parse(readFileSync(join(dataDir, 'themes', 'usb-test', 'meta.json'), 'utf8'));
    expect(meta.version).toBe('0.2.0');
  });

  // A megabyte of file can hold gigabytes of zeros: the app must stop long before it has them.
  it('stops inflating a package that grows past the limit', async () => {
    const bomb = gzipSync(Buffer.alloc(96 * 1024 * 1024), { level: 9 });
    expect(bomb.length).toBeLessThan(200 * 1024);
    const before = process.memoryUsage().rss;
    const err = await new Promise<Error | null>((resolve) =>
      usb.gunzipCapped(bomb, 8 * 1024 * 1024, (e) => resolve(e)),
    );
    expect(err?.message).toBe('package too large');
    expect(process.memoryUsage().rss - before).toBeLessThan(64 * 1024 * 1024);
    // on a stick it is refused with that reason, and the page hears of it after tick, not inside it
    put(null, 'bomb.idv7pkg', gzipSync(Buffer.alloc(80 * 1024 * 1024), { level: 9 }));
    let told = 0;
    const w = watcher({ onChange: () => told++ });
    const round = look(w);
    expect(told).toBe(0);
    expect((await round)[0]).toMatchObject({ ok: false, reason: 'package too large' });
    expect(told).toBe(1);
  });

  it('inflates a good file whole, and says which are not gzip or cut short', async () => {
    const data = Buffer.from(JSON.stringify({ text: 'x'.repeat(300000) }));
    const gz = gzipSync(data);
    const run = (buf: Buffer) =>
      new Promise<[Error | null, Buffer | undefined]>((resolve) =>
        usb.gunzipCapped(buf, 1 << 22, (e, out) => resolve([e, out])),
      );
    expect((await run(gz))[1]?.equals(data)).toBe(true);
    expect((await run(Buffer.from('not gzip at all, not at all')))[0]?.message).toMatch(/not gzip/);
    expect((await run(gz.subarray(0, gz.length - 40)))[0]?.message).toMatch(/not gzip/);
  });

  it('keeps a theme’s sketch only as far as it is well formed', () => {
    expect(
      usb.cleanPreview([
        ['r', 0, 0, 100, 50, 8, '$surface'],
        ['a', 300, 300, 184, 200, 225, 495, '#3d8bff'],
        ['t', '112', 950, 260, 96, '$text', 1, 1],
        ['r', 0, 0, 100, 50, 8, 'red; drop'],
        ['r', 0, 0, 1e9, 50, 8, '#ffffff'],
        ['t', 'x'.repeat(200), 0, 0, 20, '#ffffff', 0, 0],
        ['x', 1, 2, 3],
        'nope',
      ]),
    ).toEqual([
      ['r', 0, 0, 100, 50, 8, '$surface'],
      ['a', 300, 300, 184, 200, 225, 495, '#3d8bff'],
      ['t', '112', 950, 260, 96, '$text', 1, 1],
    ]);
    expect(usb.cleanPreview('nope')).toEqual([]);
    // a package from the Studio carries one, and it survives the checks
    const read = usb.readPackage(gzipSync(Buffer.from(JSON.stringify(samplePackage()))), {
      appVersion: '0.2.0',
      shaders: SHADERS,
      fonts: ['sans'],
    });
    expect(read.theme.preview.length).toBeGreaterThan(0);
    // the sketch with a picture's tiles is kept beside it, tiles and all, past the first 160
    const withTiles = samplePackage() as unknown as { theme: { sketch: unknown[] } };
    withTiles.theme.sketch = Array.from({ length: 400 }, (_v, i) => [
      'm',
      (i % 40) * 24,
      Math.floor(i / 40) * 24,
      24,
      24,
      '#102030',
    ]);
    const tiled = usb.readPackage(gzipSync(Buffer.from(JSON.stringify(withTiles))), {
      appVersion: '0.2.0',
      shaders: SHADERS,
      fonts: ['sans'],
    });
    expect(tiled.theme.sketch).toHaveLength(400);
    expect(tiled.theme.preview.some((q) => (q as unknown[])[0] === 'm')).toBe(false);
  });

  it('compares versions', () => {
    expect(usb.compareVersions('0.2.0', '0.2.0')).toBe(0);
    expect(usb.compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(usb.compareVersions('0.1.9', '0.2.0')).toBeLessThan(0);
  });
});
