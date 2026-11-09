import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  bakeFont,
  decodePng,
  encodePng,
  flattenContour,
  parseFontFile,
  rasterizeSdf,
  TrueTypeFont,
} from '../node.js';
import { GLYPHS, codeOf } from './glyphs.js';

const require = createRequire(import.meta.url);
const WOFF =
  require.resolve('@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff');

describe('font parsing', () => {
  it('unpacks WOFF tables and reads glyph outlines', () => {
    const font = new TrueTypeFont(parseFontFile(new Uint8Array(readFileSync(WOFF))));
    expect(font.unitsPerEm).toBeGreaterThan(0);
    const gi = font.glyphIndex('8'.codePointAt(0)!);
    expect(gi).toBeGreaterThan(0);
    const o = font.outline(gi);
    expect(o.contours.length).toBeGreaterThanOrEqual(2); // '8' has an outer and two inner contours
    expect(o.advance).toBeGreaterThan(0);
    const space = font.outline(font.glyphIndex(32));
    expect(space.contours).toHaveLength(0);
    expect(space.advance).toBeGreaterThan(0);
    const poly = flattenContour(o.contours[0]!);
    expect(poly.length).toBeGreaterThan(10);
  });
});

describe('SDF rasterisation', () => {
  it('encodes inside > 128 > outside for a square', () => {
    const square: Array<[number, number]> = [
      [4, 4],
      [28, 4],
      [28, 28],
      [4, 28],
    ];
    const r = rasterizeSdf([square], 32, 32, 8);
    const at = (x: number, y: number) => r.pixels[y * 32 + x]!;
    expect(at(16, 16)).toBeGreaterThan(200);
    expect(at(1, 1)).toBeLessThan(100);
    expect(Math.abs(at(4, 16) - 128)).toBeLessThan(20);
    // A hole (reverse winding) is outside.
    const hole: Array<[number, number]> = [
      [12, 12],
      [12, 20],
      [20, 20],
      [20, 12],
    ];
    const r2 = rasterizeSdf([square, hole], 32, 32, 8);
    expect(r2.pixels[16 * 32 + 16]!).toBeLessThan(128);
  });
});

describe('bakeFont', () => {
  it('bakes the full glyph set into a 1792×192 R8 atlas with advances', () => {
    const baked = bakeFont('sans', new Uint8Array(readFileSync(WOFF)));
    expect(baked.width).toBe(1792);
    expect(baked.height).toBe(192);
    expect(baked.pixels.length).toBe(1792 * 192);
    expect(baked.metrics.adv).toHaveLength(GLYPHS.length);
    const zero = baked.metrics.adv[codeOf('0')]!;
    expect(zero).toBeGreaterThan(0.3);
    expect(zero).toBeLessThan(0.7);
    // Barlow's default figures are proportional ('1' is narrow); every digit still has an advance
    for (let d = 1; d <= 9; d++) expect(baked.metrics.adv[d]).toBeGreaterThan(0.2);
    // the cell of '0' has ink (values above 128) and empty corners
    const col = codeOf('0') % 32;
    const cellX = col * 56;
    let maxV = 0;
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 56; x++) maxV = Math.max(maxV, baked.pixels[y * 1792 + cellX + x]!);
    expect(maxV).toBeGreaterThan(150);
    expect(baked.pixels[0]).toBeLessThan(64);
  }, 60_000);
});

describe('PNG codec', () => {
  it('round-trips RGBA and grey images', () => {
    const w = 5;
    const h = 3;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 37) & 255;
    const png = encodePng(w, h, rgba);
    const dec = decodePng(png);
    expect(dec.width).toBe(w);
    expect(dec.height).toBe(h);
    expect([...dec.rgba]).toEqual([...rgba]);
    const grey = new Uint8Array(w * h).map((_, i) => i * 17);
    const g = decodePng(encodePng(w, h, grey, true));
    expect(g.rgba[0]).toBe(0);
    expect(g.rgba[4]).toBe(17);
    expect(g.rgba[3]).toBe(255);
  });
});
