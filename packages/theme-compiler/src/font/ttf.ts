import type { SfntTables } from './woff.js';

export interface Point {
  x: number;
  y: number;
  onCurve: boolean;
}

export interface GlyphOutline {
  /** Contours as lists of points in font units (y up). */
  contours: Point[][];
  advance: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/**
 * A minimal TrueType reader: cmap (formats 4 and 12), loca/glyf outlines
 * (simple and composite glyphs), hmtx advances, head/hhea metrics. Enough to
 * bake the Latin glyph set of Barlow into an SDF atlas.
 */
export class TrueTypeFont {
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  private readonly cmap = new Map<number, number>();
  private readonly loca: Uint32Array;
  private readonly glyf: Uint8Array;
  private readonly hmtx: Uint8Array;
  private readonly numHMetrics: number;
  private readonly numGlyphs: number;

  constructor(readonly tables: SfntTables) {
    const head = need(tables, 'head');
    const hhea = need(tables, 'hhea');
    const maxp = need(tables, 'maxp');
    this.unitsPerEm = u16(head, 18);
    const indexToLocFormat = i16(head, 50);
    this.ascender = i16(hhea, 4);
    this.descender = i16(hhea, 6);
    this.numHMetrics = u16(hhea, 34);
    this.numGlyphs = u16(maxp, 4);
    this.hmtx = need(tables, 'hmtx');
    this.glyf = need(tables, 'glyf');
    const loca = need(tables, 'loca');
    this.loca = new Uint32Array(this.numGlyphs + 1);
    for (let i = 0; i <= this.numGlyphs; i++) {
      this.loca[i] = indexToLocFormat === 0 ? u16(loca, i * 2) * 2 : u32(loca, i * 4);
    }
    this.parseCmap(need(tables, 'cmap'));
  }

  private parseCmap(cmap: Uint8Array): void {
    const n = u16(cmap, 2);
    let best: { off: number; format: number; score: number } | null = null;
    for (let i = 0; i < n; i++) {
      const platform = u16(cmap, 4 + i * 8);
      const encoding = u16(cmap, 6 + i * 8);
      const off = u32(cmap, 8 + i * 8);
      const format = u16(cmap, off);
      let score = 0;
      if (format === 12) score = 3;
      else if (format === 4) score = 2;
      else continue;
      if (platform === 3 && (encoding === 1 || encoding === 10)) score += 1;
      if (platform === 0) score += 1;
      if (!best || score > best.score) best = { off, format, score };
    }
    if (!best) throw new Error('No usable cmap subtable');
    if (best.format === 4) this.parseCmap4(cmap, best.off);
    else this.parseCmap12(cmap, best.off);
  }

  private parseCmap4(t: Uint8Array, off: number): void {
    const segX2 = u16(t, off + 6);
    const seg = segX2 / 2;
    const ends = off + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffs = deltas + segX2;
    for (let s = 0; s < seg; s++) {
      const end = u16(t, ends + s * 2);
      const start = u16(t, starts + s * 2);
      const delta = u16(t, deltas + s * 2);
      const ro = u16(t, rangeOffs + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end; c++) {
        let g: number;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          const addr = rangeOffs + s * 2 + ro + (c - start) * 2;
          if (addr + 1 >= t.length) continue;
          g = u16(t, addr);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) this.cmap.set(c, g);
      }
    }
  }

  private parseCmap12(t: Uint8Array, off: number): void {
    const nGroups = u32(t, off + 12);
    let p = off + 16;
    for (let i = 0; i < nGroups; i++) {
      const start = u32(t, p);
      const end = u32(t, p + 4);
      const startGlyph = u32(t, p + 8);
      p += 12;
      for (let c = start; c <= end && c - start < 65536; c++)
        this.cmap.set(c, startGlyph + (c - start));
    }
  }

  glyphIndex(codePoint: number): number {
    return this.cmap.get(codePoint) ?? 0;
  }

  advance(glyphIndex: number): number {
    const i = Math.min(glyphIndex, this.numHMetrics - 1);
    return u16(this.hmtx, i * 4);
  }

  /** Outline of a glyph in font units; empty contours for whitespace. */
  outline(glyphIndex: number, depth = 0): GlyphOutline {
    const start = this.loca[glyphIndex] ?? 0;
    const end = this.loca[glyphIndex + 1] ?? start;
    const adv = this.advance(glyphIndex);
    if (end <= start) return { contours: [], advance: adv, xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    const g = this.glyf.subarray(start, end);
    const nContours = i16(g, 0);
    const xMin = i16(g, 2);
    const yMin = i16(g, 4);
    const xMax = i16(g, 6);
    const yMax = i16(g, 8);
    if (nContours >= 0)
      return { contours: simpleGlyph(g, nContours), advance: adv, xMin, yMin, xMax, yMax };
    if (depth > 4) return { contours: [], advance: adv, xMin, yMin, xMax, yMax };
    return { contours: this.compositeGlyph(g, depth), advance: adv, xMin, yMin, xMax, yMax };
  }

  private compositeGlyph(g: Uint8Array, depth: number): Point[][] {
    const out: Point[][] = [];
    let p = 10;
    for (;;) {
      const flags = u16(g, p);
      const glyphIndex = u16(g, p + 2);
      p += 4;
      let dx: number;
      let dy: number;
      if (flags & 1) {
        dx = i16(g, p);
        dy = i16(g, p + 2);
        p += 4;
      } else {
        dx = (g[p]! << 24) >> 24;
        dy = (g[p + 1]! << 24) >> 24;
        p += 2;
      }
      let a = 1;
      let b = 0;
      let c = 0;
      let d = 1;
      if (flags & 8) {
        a = d = f2dot14(g, p);
        p += 2;
      } else if (flags & 0x40) {
        a = f2dot14(g, p);
        d = f2dot14(g, p + 2);
        p += 4;
      } else if (flags & 0x80) {
        a = f2dot14(g, p);
        b = f2dot14(g, p + 2);
        c = f2dot14(g, p + 4);
        d = f2dot14(g, p + 6);
        p += 8;
      }
      const sub = this.outline(glyphIndex, depth + 1);
      for (const contour of sub.contours) {
        out.push(
          contour.map((pt) => ({
            x: a * pt.x + c * pt.y + dx,
            y: b * pt.x + d * pt.y + dy,
            onCurve: pt.onCurve,
          })),
        );
      }
      if (!(flags & 0x20)) break;
    }
    return out;
  }
}

function simpleGlyph(g: Uint8Array, nContours: number): Point[][] {
  const endPts: number[] = [];
  let p = 10;
  for (let i = 0; i < nContours; i++) {
    endPts.push(u16(g, p));
    p += 2;
  }
  const nPts = nContours ? endPts[endPts.length - 1]! + 1 : 0;
  const instLen = u16(g, p);
  p += 2 + instLen;
  const flags = new Uint8Array(nPts);
  for (let i = 0; i < nPts;) {
    const f = g[p++]!;
    flags[i++] = f;
    if (f & 8) {
      let r = g[p++]!;
      while (r-- > 0 && i < nPts) flags[i++] = f;
    }
  }
  const xs = new Int16Array(nPts);
  let v = 0;
  for (let i = 0; i < nPts; i++) {
    const f = flags[i]!;
    if (f & 2) {
      const d = g[p++]!;
      v += f & 16 ? d : -d;
    } else if (!(f & 16)) {
      v += i16(g, p);
      p += 2;
    }
    xs[i] = v;
  }
  const ys = new Int16Array(nPts);
  v = 0;
  for (let i = 0; i < nPts; i++) {
    const f = flags[i]!;
    if (f & 4) {
      const d = g[p++]!;
      v += f & 32 ? d : -d;
    } else if (!(f & 32)) {
      v += i16(g, p);
      p += 2;
    }
    ys[i] = v;
  }
  const contours: Point[][] = [];
  let s = 0;
  for (const e of endPts) {
    const c: Point[] = [];
    for (let i = s; i <= e; i++) c.push({ x: xs[i]!, y: ys[i]!, onCurve: (flags[i]! & 1) !== 0 });
    contours.push(c);
    s = e + 1;
  }
  return contours;
}

function need(t: SfntTables, tag: string): Uint8Array {
  const v = t.tables.get(tag);
  if (!v) throw new Error(`Font lacks table ${tag}`);
  return v;
}
const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const i16 = (b: Uint8Array, o: number) => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const f2dot14 = (b: Uint8Array, o: number) => i16(b, o) / 16384;

/**
 * Flatten a TrueType contour (quadratic Béziers with implied on-curve
 * midpoints) into a closed polyline in font units.
 */
export function flattenContour(points: Point[], segments = 8): Array<[number, number]> {
  if (points.length === 0) return [];
  // Ensure we start on an on-curve point.
  const pts = [...points];
  const firstOn = pts.findIndex((p) => p.onCurve);
  if (firstOn < 0) {
    // All off-curve: insert implied midpoints.
    const mid = { x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2, onCurve: true };
    pts.unshift(mid);
  } else if (firstOn > 0) {
    pts.push(...pts.splice(0, firstOn));
  }
  const out: Array<[number, number]> = [];
  const n = pts.length;
  let i = 0;
  out.push([pts[0]!.x, pts[0]!.y]);
  while (i < n) {
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    if (next.onCurve) {
      out.push([next.x, next.y]);
      i += 1;
      continue;
    }
    // next is a control point; the end point is the following on-curve point or an implied midpoint
    const after = pts[(i + 2) % n]!;
    const end = after.onCurve
      ? after
      : { x: (next.x + after.x) / 2, y: (next.y + after.y) / 2, onCurve: true };
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const mt = 1 - t;
      out.push([
        mt * mt * cur.x + 2 * mt * t * next.x + t * t * end.x,
        mt * mt * cur.y + 2 * mt * t * next.y + t * t * end.y,
      ]);
    }
    if (after.onCurve) i += 2;
    else {
      // implied midpoint becomes the new current point
      pts.splice(i + 2, 0, end);
      i += 2;
    }
    if (i >= n) break;
  }
  return out;
}
