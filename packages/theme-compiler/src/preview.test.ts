import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme, parseTheme, type Theme } from '@idv7lol/theme-schema';
import { MOSAIC_MAX, PREVIEW_MAX, mosaic, themePreview } from './preview.js';

const bundled = (id: string): Theme => {
  const doc = JSON.parse(
    readFileSync(new URL(`../../../themes/${id}/theme.json`, import.meta.url), 'utf8'),
  ) as unknown;
  const r = parseTheme(doc);
  if (!r.ok) throw new Error(`${id} does not parse`);
  return r.theme;
};

describe('theme sketch for the car app', () => {
  it('draws a gauge, a bar and a reading where the theme has them', () => {
    const theme = createEmptyTheme({ id: 'sketch', name: 'Sketch' });
    theme.components.push(
      createComponent('gauge.arc', {
        id: 'revs',
        x: 100,
        y: 100,
        width: 400,
        height: 400,
        binding: { signal: 'engine.rpm', min: 0, max: 8000 },
      }),
      createComponent('gauge.bar', {
        id: 'fuel',
        x: 600,
        y: 600,
        width: 400,
        height: 20,
        binding: { signal: 'fuel.level' },
      }),
      createComponent('value.digital', {
        id: 'speed',
        x: 800,
        y: 200,
        width: 300,
        height: 120,
        binding: { signal: 'vehicle.speed' },
      }),
    );
    const prims = themePreview(parseOk(theme));
    // the track, then the fill up to 4300 of 8000 rpm: 135° + 90° to 135° + 270° × 0.5375 + 90°
    expect(prims[0]).toEqual(['a', 300, 300, 184, 200, 225, 495, '$track']);
    expect(prims[1]).toEqual(['a', 300, 300, 184, 200, 225, 370, '$accent']);
    // the bar's track, and its fill at 62 %
    expect(prims[2]).toEqual(['r', 600, 600, 400, 20, 4, '$track']);
    expect(prims[3]).toEqual(['r', 600, 600, 248, 20, 4, '$accent']);
    // the speed, centred in its box
    expect(prims[4]).toEqual(['t', '112', 950, 260, 96, '$text', 1, 1]);
  });

  it('leaves out what is hidden or only shows on a condition, and turns literals into hex', () => {
    const theme = createEmptyTheme({ id: 'sketch-2', name: 'Sketch 2' });
    theme.components.push(
      createComponent('rect', {
        id: 'panel',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        props: { fill: 'rgb(255, 0, 0)', radius: 8 },
      }),
      createComponent('rect', { id: 'ghost', visible: false, props: { fill: '#ffffff' } }),
      createComponent('text', {
        id: 'warning',
        props: { text: 'HOT' },
        visibleWhen: { signal: 'engine.coolant.temp', op: 'gt', value: 110 },
      }),
    );
    expect(themePreview(parseOk(theme))).toEqual([['r', 0, 0, 100, 50, 8, '#ff0000']]);
  });

  it('shows a picture as tiles of its colours, runs of one colour as one tile', () => {
    // 80x40: the left half red, the right half clear but for a blue square at the bottom right
    const pic = { width: 80, height: 40, rgba: new Uint8Array(80 * 40 * 4) };
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 80; x++) {
        const i = (y * 80 + x) * 4;
        if (x < 40) pic.rgba.set([255, 0, 0, 255], i);
        else if (x >= 60 && y >= 20) pic.rgba.set([0, 0, 255, 255], i);
      }
    expect(mosaic(pic, 100, 200, 160, 80, 40)).toEqual([
      ['m', 100, 200, 80, 80, '#ff0000'],
      ['m', 220, 240, 40, 40, '#0000ff'],
    ]);

    const theme = createEmptyTheme({ id: 'pic', name: 'Pic' });
    theme.assets.photo = { type: 'image', path: 'assets/photo.png', width: 80, height: 40 };
    theme.components.push(
      createComponent('image', {
        id: 'photo',
        x: 100,
        y: 200,
        width: 160,
        height: 80,
        props: { asset: 'photo', fit: 'stretch' },
      }),
    );
    const parsed = parseOk(theme);
    // without its pixels a small picture leaves nothing; with them, its tiles
    expect(themePreview(parsed)).toEqual([]);
    const tiles = themePreview(parsed, { photo: pic });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t[0] === 'm')).toBe(true);
    // a turned picture is left out: the tiles would lie about where it is
    parsed.components[0]!.rotation = 30;
    expect(themePreview(parsed, { photo: pic })).toEqual([]);
  });

  it('keeps a noisy picture within the tile limit by making the tiles larger', () => {
    const pic = { width: 960, height: 360, rgba: new Uint8Array(960 * 360 * 4) };
    for (let i = 0; i < pic.rgba.length; i += 4) {
      // blocks of 8 px of one colour, so tiles differ from their neighbours
      const block =
        (Math.floor(i / 4 / 960 / 8) * 131 + Math.floor(((i / 4) % 960) / 8)) * 2654435761;
      pic.rgba.set([block & 255, (block >>> 8) & 255, (block >>> 16) & 255, 255], i);
    }
    expect(mosaic(pic, 0, 0, 1920, 720, 20).length).toBeGreaterThan(MOSAIC_MAX);
    const theme = createEmptyTheme({ id: 'noise', name: 'Noise' });
    theme.assets.noise = { type: 'image', path: 'assets/noise.png', width: 960, height: 360 };
    theme.components.push(
      createComponent('image', {
        id: 'noise',
        x: 0,
        y: 0,
        width: 1920,
        height: 720,
        props: { asset: 'noise', fit: 'stretch' },
      }),
    );
    const tiles = themePreview(parseOk(theme), { noise: pic });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(MOSAIC_MAX);
  });

  it('gives every bundled theme a sketch the car app can draw', () => {
    const ids = readdirSync(new URL('../../../themes/', import.meta.url), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'community' && d.name !== 'examples')
      .map((d) => d.name);
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) {
      const prims = themePreview(bundled(id));
      expect(prims.length, id).toBeGreaterThan(0);
      expect(prims.length, id).toBeLessThanOrEqual(PREVIEW_MAX);
      for (const p of prims) {
        const colourOf = p[p.length - (p[0] === 't' ? 3 : 1)] as string;
        expect(colourOf, `${id} ${JSON.stringify(p)}`).toMatch(/^(\$[a-z0-9-]+|#[0-9a-f]{6,8})$/);
        for (const v of p)
          if (typeof v === 'number')
            expect(Number.isFinite(v), `${id} ${JSON.stringify(p)}`).toBe(true);
      }
    }
  });
});

function parseOk(theme: Theme): Theme {
  const r = parseTheme(JSON.parse(JSON.stringify(theme)));
  if (!r.ok) throw new Error('theme does not parse: ' + JSON.stringify(r));
  return r.theme;
}
