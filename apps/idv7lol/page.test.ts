import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The car app is CommonJS for Node 8; load it, and the kit's own canvas, as the head unit would.
interface Canvas {
  n: number;
  clear(c: string): Canvas;
}
const { Recorder } = require('../../kit/runtime/record.js') as {
  Recorder: new (w: number, h: number) => Canvas;
};
const kitThemes = require('../../kit/runtime/themes.js') as { theme(id?: string): object };
const page = require('./page.js') as {
  W: number;
  H: number;
  MODERN_TABS: string[];
  THEMES: { prev: Box; next: Box; centre: Box; swipe: number };
  themeAt(x: number, y: number): number;
  ascii(s: unknown): string;
  stateOf(s: Record<string, unknown>): { tone: string; label: string; detail: string };
  drawPreview(cv: object, theme: object, pid: string, x: number, y: number, w: number): number;
  themesPage(cv: object, t: object, m: object): void;
  dataPage(cv: object, t: object, m: object): void;
  textPage(cv: object, t: object, n: number, m: object): void;
};
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const index = require('./themes_index.js') as { themes: Array<{ id: string; module: string }> };
interface Compiled {
  name: string;
  preview: unknown[];
  paletteSelection: { default: string };
}
const themes = index.themes.map((t) => require('./' + t.module) as Compiled);

/** Records the calls a page makes, to check what a sketch asks the kit's canvas for. */
function spy() {
  const calls: Array<[string, ...unknown[]]> = [];
  const cv: Record<string, (...a: unknown[]) => unknown> = { textWidth: () => 100 };
  for (const op of [
    'fillRect',
    'roundRect',
    'strokeRoundRect',
    'circle',
    'arc',
    'line',
    'text',
    'clip',
    'noclip',
  ])
    cv[op] = (...a: unknown[]) => {
      calls.push([op, ...a]);
      return cv;
    };
  return { cv, calls };
}

const state = { tone: 'on', label: 'On the cluster', detail: 'x' };

describe('the app page', () => {
  it('writes only letters the kit’s fonts have', () => {
    expect(page.ascii('Diagnóstico · Año 2026 ¿Qué?')).toBe('Diagnostico · Ano 2026 Que?');
    expect(page.ascii('Straße 96°  日本語')).toBe('Strasse 96°  ');
    expect(page.ascii(undefined)).toBe('');
    expect(page.MODERN_TABS.every((t) => page.ascii(t) === t)).toBe(true);
  });

  it('says one thing about the cluster, and never "showing" without a renderer', () => {
    const base = {
      showing: true,
      connected: true,
      failed: false,
      shown: true,
      hold: null,
      demo: false,
      theme: 'Performance',
      palette: 'night',
    };
    expect(page.stateOf(base)).toMatchObject({ tone: 'on', label: 'On the cluster' });
    expect(page.stateOf({ ...base, showing: false }).label).toBe('Off');
    // the engine has its layers queued, but nothing is connected to draw them
    expect(page.stateOf({ ...base, connected: false })).toMatchObject({
      tone: 'bad',
      label: 'Renderer not connected',
    });
    expect(page.stateOf({ ...base, failed: true }).label).toBe('Layout failed');
    expect(page.stateOf({ ...base, shown: false }).label).toBe('Waiting for car data');
    expect(page.stateOf({ ...base, shown: false, hold: 'drop' }).label).toBe('Waiting for the car');
    expect(page.stateOf({ ...base, demo: true }).label).toBe('On the cluster (demo data)');
  });

  it('draws a sketch to scale, an arc over the top in two', () => {
    const { cv, calls } = spy();
    const theme = {
      name: 'T',
      background: '#000000',
      palettes: { a: { colors: { accent: '#ff0000', track: '#202020' } } },
      paletteSelection: { default: 'a' },
      preview: [
        ['r', 0, 0, 1920, 720, 0, '$track'],
        ['a', 960, 360, 184, 200, 225, 495, '$accent'],
        ['t', '112', 960, 360, 96, '#ffffff', 1, 1],
      ],
    };
    expect(page.drawPreview(cv, theme, 'a', 100, 50, 960)).toBe(360);
    const arcs = calls.filter((c) => c[0] === 'arc');
    // 225° to 495° clockwise from 12 o'clock: up to 360°, then 0° to 135°
    expect(arcs.map((c) => [c[5], c[6]])).toEqual([
      [225, 360],
      [0, 135],
    ]);
    // at half size, moved to 100, 50
    expect(arcs[0]!.slice(1, 5)).toEqual([580, 230, 92, 100]);
    expect(arcs[0]![7]).toEqual([255, 0, 0, 255]);
    const text = calls.find((c) => c[0] === 'text')!;
    expect(text.slice(1, 3)).toEqual(['112', 580]);
    expect(calls.at(-1)![0]).toBe('noclip');
  });

  it('draws a picture’s tiles on whole pixels, edge to edge', () => {
    const { cv, calls } = spy();
    const theme = {
      name: 'Tiles',
      background: '#000000',
      palettes: { p: { colors: {} } },
      preview: [
        ['m', 0, 0, 24, 24, '#ff0000'],
        ['m', 24, 0, 24, 24, '#00ff00'],
      ],
    };
    page.drawPreview(cv, theme, 'p', 10, 20, 820);
    const tiles = calls.filter((c) => c[0] === 'fillRect').slice(1) as number[][];
    expect(tiles).toHaveLength(2);
    for (const t of tiles) for (const v of t.slice(1, 5)) expect(Number.isInteger(v)).toBe(true);
    // the second starts where the first ends, or before it: no seam between them
    expect(tiles[1]![1]).toBeLessThanOrEqual(tiles[0]![1]! + tiles[0]![3]!);
  });

  it('knows which neighbour a touch is on, and makes both places to press', () => {
    const { prev, next, centre } = page.THEMES;
    expect(page.themeAt(prev.x + 5, prev.y + 5)).toBe(-1);
    expect(page.themeAt(next.x + next.w - 5, next.y + next.h + 20)).toBe(1);
    expect(page.themeAt(centre.x + centre.w / 2, centre.y + 50)).toBe(0);

    const cv = new Recorder(page.W, page.H).clear('#000000') as Canvas & {
      targets: Array<{ key: string; run(): void; x: number }>;
    };
    const went: number[] = [];
    const item = { theme: themes[0], palette: themes[0]!.paletteSelection.default };
    const m = {
      themes: [item, item, item],
      state: page.stateOf({ showing: false }),
      layers: 1,
      paletteName: 'x',
      count: 3,
      at: 1,
      go: (d: number) => went.push(d),
    };
    page.themesPage(cv, kitThemes.theme(), m);
    expect(cv.targets.map((t) => t.key)).toEqual(['theme-prev', 'theme-next']);
    cv.targets.forEach((t) => t.run());
    expect(went).toEqual([-1, 1]);
    // while a finger pulls the sketches there is nothing to press under them
    const moving = new Recorder(page.W, page.H).clear('#000000') as typeof cv;
    page.themesPage(moving, kitThemes.theme(), { ...m, dx: 120 });
    expect(moving.targets).toEqual([]);
  });

  it('measures the localized state label and preserves raw signal names', () => {
    const { cv, calls } = spy();
    const widths: unknown[] = [];
    cv.textWidth = (value) => {
      widths.push(value);
      return 100;
    };
    const cur = { theme: themes[0]!, palette: themes[0]!.paletteSelection.default };
    const format = (value: string) => (value === 'On the cluster' ? '仪表显示中' : '译文');
    page.dataPage(cv, kitThemes.theme(), { theme: cur, state, source: 'Live', format });
    expect(widths).toContain('仪表显示中');
    expect(calls.some((c) => c[0] === 'text' && c[1] === '仪表显示中')).toBe(true);
    page.textPage(cv, kitThemes.theme(), 1, {
      version: '0.2.19',
      format,
      signals: [{ text: 'vehicle.speed = 100', fresh: true }],
      raw: [],
    });
    expect(calls.some((c) => c[0] === 'text' && c[1] === 'vehicle.speed = 100')).toBe(true);
  });

  it('draws every bundled theme and every page on the kit’s own canvas', () => {
    const t = kitThemes.theme();
    expect(themes.length).toBeGreaterThan(8);
    for (const theme of themes) {
      expect(theme.preview.length, theme.name).toBeGreaterThan(0);
      const cv = new Recorder(page.W, page.H).clear('#000000');
      const it3 = { theme, palette: theme.paletteSelection.default };
      page.themesPage(cv, t, {
        themes: [it3, it3, it3],
        state,
        layers: 30,
        paletteName: 'Auto',
        note: '',
        count: 11,
        at: 1,
      });
      expect(cv.n, theme.name).toBeGreaterThan(50);
    }
    const cur = { theme: themes[0]!, palette: themes[0]!.paletteSelection.default };
    const data = new Recorder(page.W, page.H).clear('#000000');
    page.dataPage(data, t, {
      theme: cur,
      state,
      mode: 'COMFORT',
      source: 'Live',
      speed: 112,
      rpm: 4300,
      redline: 7000,
      gear: '4',
      programme: 'S',
      fuelPct: 30,
      fuelText: '18 l',
      oil: 96,
      coolant: 90,
    });
    expect(data.n).toBeGreaterThan(50);
    // with nothing from the car yet
    page.dataPage(new Recorder(page.W, page.H), t, { theme: cur, state, source: 'Not live' });
    const model = {
      version: '0.0.0',
      state,
      themeLine: 'x',
      rendererLine: 'x',
      carLine: 'x',
      modeLine: 'x',
      usb: 'x',
      signals: [{ text: 'a = 1', fresh: true }],
      raw: ['r'],
      lines: ['l'],
      footer: 'f',
      versions: 'v',
    };
    for (let n = 0; n < 4; n++) page.textPage(new Recorder(page.W, page.H), t, n, model);
  });
});

describe('what ships in the car app’s package', () => {
  it('has the licences its parts ask for', async () => {
    const { readFileSync } = await import('node:fs');
    // (a Windows checkout may hold either line ending)
    const read = (p: string) =>
      readFileSync(new URL(p, import.meta.url), 'utf8')
        .split('\r')
        .join('');
    // the GPL itself, the same text as the repository's
    expect(read('./LICENSE')).toBe(read('../../LICENSE'));
    const notice = read('./NOTICE');
    expect(notice).toContain(read('../../kit/LICENSE').trim());
    expect(notice).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(notice).toContain('https://mozilla.org/MPL/2.0/');
    expect((JSON.parse(read('./app.json')) as { license: string }).license).toBe(
      'GPL-3.0-or-later',
    );
  });
});
