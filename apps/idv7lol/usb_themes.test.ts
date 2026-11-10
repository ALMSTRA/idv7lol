import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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
  };
  UsbWatcher: new (o: Record<string, unknown>) => { tick(): Result[] };
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
const watcher = () =>
  new usb.UsbWatcher({
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
  it('installs a package from the stick once, with the app’s own shaders', () => {
    const pkg = samplePackage();
    expect(packageFileName(pkg.id)).toBe('usb-test.idv7pkg');
    expect(pkg.theme).not.toHaveProperty('shaders');
    put(pkg);
    const w = watcher();
    const first = w.tick();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ ok: true, theme: { id: 'usb-test', key: 'usb:usb-test' } });
    expect(w.tick()).toEqual([]);

    const lib = new usb.ThemeLibrary({ dataDir });
    expect(lib.list().map((t) => t.key)).toEqual(['usb:usb-test']);
    const loaded = lib.load('usb:usb-test');
    for (const [kind, src] of Object.entries(loaded.theme.shaders)) expect(src).toBe(SHADERS[kind]);
    const img = loaded.theme.images[0]!;
    expect(statSync(join(loaded.imageDir, img.file)).size).toBe(64 * 64 * 4);

    expect(lib.remove('usb:usb-test')).toBe(true);
    expect(lib.list()).toEqual([]);
  });

  it('refuses packages that could hurt or don’t fit', () => {
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
    const results = watcher().tick();
    expect(results.every((r) => !r.ok)).toBe(true);
    for (const [name, , reason] of cases)
      expect(results.find((r) => r.file === name)?.reason).toMatch(reason);
    expect(results.find((r) => r.file === 'junk.idv7pkg')?.reason).toMatch(/not gzip/);
    expect(existsSync(join(dataDir, 'themes', 'usb-test'))).toBe(false);
  });

  it('reads a new copy again after the stick changes', () => {
    put(samplePackage());
    const w = watcher();
    expect(w.tick()).toHaveLength(1);
    const p = samplePackage();
    p.version = '0.2.0';
    put(p);
    const again = w.tick();
    expect(again[0]).toMatchObject({ ok: true });
    const meta = JSON.parse(readFileSync(join(dataDir, 'themes', 'usb-test', 'meta.json'), 'utf8'));
    expect(meta.version).toBe('0.2.0');
  });

  it('compares versions', () => {
    expect(usb.compareVersions('0.2.0', '0.2.0')).toBe(0);
    expect(usb.compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(usb.compareVersions('0.1.9', '0.2.0')).toBeLessThan(0);
  });
});
