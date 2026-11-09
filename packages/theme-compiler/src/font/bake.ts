import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  CELL_H,
  CELL_W,
  GLYPHS,
  SPREAD,
  type FontMetrics,
} from './glyphs.js';
import { rasterizeSdf, type Polyline } from './sdf.js';
import { TrueTypeFont, flattenContour } from './ttf.js';
import { parseFontFile } from './woff.js';

export interface BakedFont {
  family: string;
  width: number;
  height: number;
  /** R8 pixels of the whole atlas. */
  pixels: Uint8Array;
  metrics: FontMetrics;
}

/** Font size relative to the cell height and baseline position, as the reference atlas. */
const FONT_SCALE = 0.92;
const BASELINE = 0.79;

/**
 * Bake a TrueType/WOFF font into the idv7lol SDF atlas: fixed cells of
 * 56×64 px, 32 columns, glyph set `GLYPHS`, spread 8 px.
 */
export function bakeFont(
  family: string,
  fontFile: Uint8Array,
  opts: { cellW?: number; cellH?: number; spread?: number } = {},
): BakedFont {
  const cellW = opts.cellW ?? CELL_W;
  const cellH = opts.cellH ?? CELL_H;
  const spread = opts.spread ?? SPREAD;
  const font = new TrueTypeFont(parseFontFile(fontFile));
  const cols = ATLAS_COLS;
  const rows = ATLAS_ROWS;
  const width = cols * cellW;
  const height = rows * cellH;
  const pixels = new Uint8Array(width * height);
  const adv: number[] = [];
  const scale = (cellH * FONT_SCALE) / font.unitsPerEm;
  const baselineY = cellH * BASELINE;

  [...GLYPHS].forEach((ch, code) => {
    const gi = font.glyphIndex(ch.codePointAt(0)!);
    const outline = font.outline(gi);
    adv.push((outline.advance * scale) / cellH);
    if (outline.contours.length === 0) return;
    // Centre the glyph's advance box in the cell horizontally.
    const advPx = outline.advance * scale;
    const x0 = (cellW - advPx) / 2;
    const polys: Polyline[] = outline.contours.map((c) =>
      flattenContour(c).map(
        ([x, y]) => [x0 + x * scale, baselineY - y * scale] as [number, number],
      ),
    );
    const cell = rasterizeSdf(polys, cellW, cellH, spread);
    const row = Math.floor(code / cols);
    const col = code % cols;
    for (let y = 0; y < cellH; y++) {
      pixels.set(
        cell.pixels.subarray(y * cellW, (y + 1) * cellW),
        (row * cellH + y) * width + col * cellW,
      );
    }
  });

  return {
    family,
    width,
    height,
    pixels,
    metrics: { family, chars: GLYPHS, cellW, cellH, cols, rows, spread, adv },
  };
}

/** Where the bundled OFL fonts live (installed from @fontsource). */
const FONT_FILES: Record<string, string> = {
  sans: '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-600-normal.woff',
  'sans-condensed': '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff',
  display: '@fontsource/barlow/files/barlow-latin-600-normal.woff',
  // No monospace font is bundled yet; the condensed face stands in.
  mono: '@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff',
};

/** Load and bake one of the project's logical font families. */
export function bakeFamily(family: string): BakedFont {
  const rel = FONT_FILES[family];
  if (!rel) throw new Error(`Unknown font family "${family}"`);
  const require = createRequire(import.meta.url);
  const file = require.resolve(rel);
  return bakeFont(family, new Uint8Array(readFileSync(file)));
}

export const FONT_FAMILIES = Object.keys(FONT_FILES);
