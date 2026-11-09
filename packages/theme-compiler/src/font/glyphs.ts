/**
 * The glyph set baked into every idv7lol atlas, in code order. Digits come
 * first so shaders can draw numerals with `code = digit`. Keep this stable:
 * compiled themes and the runtime both rely on the order.
 */
export const GLYPHS =
  '0123456789' +
  '-°PRNDSMOILCATEHKXFUGBVYWQJZ' +
  "/ .:%+,'!|()" +
  'abcdefghijklmnopqrstuvwxyz' +
  '~<>=#&*?_"';

export const ATLAS_COLS = 32;
export const CELL_W = 56;
export const CELL_H = 64;
export const SPREAD = 8;
export const ATLAS_ROWS = Math.ceil(GLYPHS.length / ATLAS_COLS);

/** Glyph code for a character, or -1 when it is not in the atlas (lowercase falls back to uppercase). */
export function codeOf(ch: string): number {
  let i = GLYPHS.indexOf(ch);
  if (i < 0 && ch !== ch.toUpperCase()) i = GLYPHS.indexOf(ch.toUpperCase());
  return i;
}

export function hasGlyph(ch: string): boolean {
  return codeOf(ch) >= 0;
}

/** Characters of a string that the atlas cannot draw. */
export function missingGlyphs(text: string): string[] {
  const out = new Set<string>();
  for (const ch of text) if (ch !== '{' && ch !== '}' && !hasGlyph(ch)) out.add(ch);
  return [...out];
}

/** Per-family metrics shipped next to the atlas pixels. */
export interface FontMetrics {
  family: string;
  chars: string;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  spread: number;
  /** Advance of each glyph in glyph heights (cell heights). */
  adv: number[];
}

export interface LineLayout {
  /** 32 glyph codes, -1 for unused slots. Codes ≥ 1000 are secondary glyphs. */
  codes: number[];
  /** 32 glyph centres in glyph heights from the left of the layer. */
  centres: number[];
  /** Total advance of the line in glyph heights. */
  width: number;
}

const SPACE_MIN = 0.32;

/**
 * Lay out a line for the TEXT shader: `boxW` is the layer width in glyph
 * heights, `align` 0/0.5/1. Secondary glyphs (a unit, a label) are listed
 * with `secondary: true` and drawn at `scale2` of the line height. When the
 * line is too long the tracking is dropped and the advances compressed to at
 * most 85 %, like the reference engine does.
 */
export function layoutLine(
  parts: Array<{ text: string; secondary?: boolean }>,
  metrics: FontMetrics,
  boxW: number,
  align: number,
  tracking = 0,
  scale2 = 1,
  gapBetweenParts = 0.12,
  tabular = false,
): LineLayout {
  const glyphs: Array<{ code: number; adv: number; secondary: boolean }> = [];
  // Tabular figures: every digit takes the widest digit's advance so values do not jitter.
  let digitAdv = 0;
  if (tabular) for (let d = 0; d <= 9; d++) digitAdv = Math.max(digitAdv, metrics.adv[d] ?? 0);
  parts.forEach((part, pi) => {
    if (pi > 0 && part.text) glyphs.push({ code: -1, adv: gapBetweenParts, secondary: false });
    for (const ch of part.text) {
      const code = codeOf(ch);
      const s = part.secondary ? scale2 : 1;
      if (code < 0) {
        if (ch === ' ') glyphs.push({ code: -1, adv: SPACE_MIN * s, secondary: !!part.secondary });
        continue;
      }
      let adv = Math.max(metrics.adv[code] ?? 0.5, ch === ' ' ? SPACE_MIN : 0);
      if (tabular && code <= 9) adv = digitAdv;
      glyphs.push({ code, adv: adv * s, secondary: !!part.secondary });
    }
  });
  const visible = glyphs.filter((g) => g.code >= 0);
  if (visible.length > 32)
    glyphs.splice(0, glyphs.length, ...glyphs.slice(0, indexOfNthVisible(glyphs, 32)));
  let tr = tracking;
  let total = glyphs.reduce((a, g) => a + g.adv, 0) + tr * Math.max(0, glyphs.length - 1);
  if (total > boxW && tr > 0) {
    tr = 0;
    total = glyphs.reduce((a, g) => a + g.adv, 0);
  }
  let compress = 1;
  if (total > boxW && total > 0) compress = Math.max(0.85, boxW / total);
  total *= compress;
  let pen = (boxW - total) * align;
  const codes: number[] = new Array(32).fill(-1);
  const centres: number[] = new Array(32).fill(-100);
  let slot = 0;
  for (const g of glyphs) {
    const adv = g.adv * compress;
    if (g.code >= 0 && slot < 32) {
      codes[slot] = g.secondary ? g.code + 1000 : g.code;
      centres[slot] = pen + adv / 2;
      slot += 1;
    }
    pen += adv + tr;
  }
  return { codes, centres, width: total };
}

function indexOfNthVisible(glyphs: Array<{ code: number }>, n: number): number {
  let seen = 0;
  for (let i = 0; i < glyphs.length; i++) {
    if (glyphs[i]!.code >= 0) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return glyphs.length;
}

/** Approximate metrics used when no atlas has been baked (uniform advances). */
export function fallbackMetrics(family = 'sans'): FontMetrics {
  const adv = [...GLYPHS].map((ch) =>
    ch === ' '
      ? SPACE_MIN
      : /[0-9]/.test(ch)
        ? 0.47
        : /[a-z]/.test(ch)
          ? 0.42
          : /[.,:'!|]/.test(ch)
            ? 0.22
            : 0.5,
  );
  return {
    family,
    chars: GLYPHS,
    cellW: CELL_W,
    cellH: CELL_H,
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    spread: SPREAD,
    adv,
  };
}
