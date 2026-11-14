/**
 * ETC2 RGBA with EAC alpha (GL_COMPRESSED_RGBA8_ETC2_EAC), the `etc2rgba` asset format of
 * cluster-render 0.5.9 (its PROTOCOL.md): 16 bytes a 4×4 block, the EAC alpha block then the
 * colour block, both big-endian, blocks in rows top to bottom. A quarter of the bytes of RGBA8,
 * charged once against the renderer's pixel memory instead of twice, sent once.
 *
 * Colour uses ETC1's individual and differential modes only, which every ETC2 decoder reads as
 * ETC2 blocks; differential deltas are kept in range, so no block turns into T, H or planar by
 * accident. Colour error is weighted by alpha. The approach follows cluster-render's
 * tools/etc2_test/etc2_encode.py (Robert Nisipeanu, GPL-3.0-or-later), with a smaller search so
 * that it runs in the editor.
 */

const ETC1_TABLES: readonly (readonly [number, number])[] = [
  [2, 8],
  [5, 17],
  [9, 29],
  [13, 42],
  [18, 60],
  [24, 80],
  [33, 106],
  [47, 183],
];
/** Modifier by pixel index (msb << 1 | lsb): +a, +b, −a, −b. */
const MODS = ETC1_TABLES.map(([a, b]) => [a, b, -a, -b] as const);

export const EAC_TABLES: readonly (readonly number[])[] = [
  [-3, -6, -9, -15, 2, 5, 8, 14],
  [-3, -7, -10, -13, 2, 6, 9, 12],
  [-2, -5, -8, -13, 1, 4, 7, 12],
  [-2, -4, -6, -13, 1, 3, 5, 12],
  [-3, -6, -8, -12, 2, 5, 7, 11],
  [-3, -7, -9, -11, 2, 6, 8, 10],
  [-4, -7, -8, -11, 3, 6, 7, 10],
  [-3, -5, -8, -11, 2, 4, 7, 10],
  [-2, -6, -8, -10, 1, 5, 7, 9],
  [-2, -5, -8, -10, 1, 4, 7, 9],
  [-2, -4, -8, -10, 1, 3, 7, 9],
  [-2, -5, -7, -10, 1, 4, 6, 9],
  [-3, -4, -7, -10, 2, 3, 6, 9],
  [-1, -2, -3, -10, 0, 1, 2, 9],
  [-4, -6, -8, -9, 3, 5, 7, 8],
  [-3, -5, -7, -9, 2, 4, 6, 8],
];

/** Pixel p of a block is x = p >> 2, y = p & 3 (ETC's column order). Sub-blocks by flip. */
const SUBS: readonly (readonly [number[], number[]])[] = [
  [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [8, 9, 10, 11, 12, 13, 14, 15],
  ], // flip 0: left, right (2×4)
  [
    [0, 1, 4, 5, 8, 9, 12, 13],
    [2, 3, 6, 7, 10, 11, 14, 15],
  ], // flip 1: top, bottom (4×2)
];

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const ex4 = (q: number) => q * 17;
const ex5 = (q: number) => (q << 3) | (q >> 2);

/** Bytes of a w×h etc2rgba texture (w and h multiples of 4). */
export function etc2Bytes(w: number, h: number): number {
  return (w / 4) * (h / 4) * 16;
}

interface Fit {
  err: number;
  table: number;
  idx: number[];
}

/** The best table and pixel indices for one base colour over a sub-block. */
function fitSub(px: Float64Array, wt: Float64Array, sub: readonly number[], base: number[]): Fit {
  let best: Fit = { err: Infinity, table: 0, idx: [] };
  for (let t = 0; t < 8; t++) {
    const mods = MODS[t]!;
    let err = 0;
    const idx: number[] = [];
    for (const p of sub) {
      const r = px[p * 3]!,
        g = px[p * 3 + 1]!,
        b = px[p * 3 + 2]!;
      let pe = Infinity,
        pm = 0;
      for (let m = 0; m < 4; m++) {
        const d = mods[m]!;
        const dr = r - clamp255(base[0]! + d),
          dg = g - clamp255(base[1]! + d),
          db = b - clamp255(base[2]! + d);
        const e = dr * dr + dg * dg + db * db;
        if (e < pe) {
          pe = e;
          pm = m;
        }
      }
      err += pe * wt[p]!;
      idx.push(pm);
      if (err >= best.err) break;
    }
    if (err < best.err) best = { err, table: t, idx };
  }
  return best;
}

function average(px: Float64Array, wt: Float64Array, sub: readonly number[]): number[] {
  let r = 0,
    g = 0,
    b = 0,
    w = 0;
  for (const p of sub) {
    r += px[p * 3]! * wt[p]!;
    g += px[p * 3 + 1]! * wt[p]!;
    b += px[p * 3 + 2]! * wt[p]!;
    w += wt[p]!;
  }
  return [r / w, g / w, b / w];
}

/** Candidate quantised bases around the average: as is, and one step darker and lighter. */
function candidates(avg: number[], max: number): number[][] {
  const q = avg.map((v) => Math.min(max, Math.max(0, Math.round((v * max) / 255))));
  const out = [q];
  for (const s of [-1, 1]) out.push(q.map((v) => Math.min(max, Math.max(0, v + s))));
  return out;
}

interface Choice {
  err: number;
  flip: number;
  diff: number;
  c1: number[];
  c2: number[];
  f1: Fit;
  f2: Fit;
}

function encodeColour(px: Float64Array, wt: Float64Array, out: Uint8Array, o: number): void {
  let best: Choice | null = null;
  for (let flip = 0; flip < 2; flip++) {
    const [s1, s2] = SUBS[flip]!;
    const a1 = average(px, wt, s1),
      a2 = average(px, wt, s2);
    // Individual: two 4-bit bases.
    let b1: { c: number[]; f: Fit } | null = null;
    let b2: { c: number[]; f: Fit } | null = null;
    for (const c of candidates(a1, 15)) {
      const f = fitSub(px, wt, s1, c.map(ex4));
      if (!b1 || f.err < b1.f.err) b1 = { c, f };
    }
    for (const c of candidates(a2, 15)) {
      const f = fitSub(px, wt, s2, c.map(ex4));
      if (!b2 || f.err < b2.f.err) b2 = { c, f };
    }
    if (!best || b1!.f.err + b2!.f.err < best.err)
      best = {
        err: b1!.f.err + b2!.f.err,
        flip,
        diff: 0,
        c1: b1!.c,
        c2: b2!.c,
        f1: b1!.f,
        f2: b2!.f,
      };
    // Differential: a 5-bit base and the second within −4..3 of it in every channel.
    for (const c1 of candidates(a1, 31)) {
      const f1 = fitSub(px, wt, s1, c1.map(ex5));
      if (f1.err >= best.err) continue;
      const want = candidates(a2, 31);
      for (const w of want) {
        const c2 = w.map((v, ch) => Math.min(c1[ch]! + 3, Math.max(c1[ch]! - 4, v)));
        const f2 = fitSub(px, wt, s2, c2.map(ex5));
        if (f1.err + f2.err < best.err)
          best = { err: f1.err + f2.err, flip, diff: 1, c1, c2, f1, f2 };
      }
    }
  }
  const b = best!;
  // 64 bits as two 32-bit halves: hi = bits 63..32, lo = bits 31..0.
  let hi = 0;
  for (let ch = 0; ch < 3; ch++) {
    const byte = b.diff
      ? (b.c1[ch]! << 3) | ((b.c2[ch]! - b.c1[ch]!) & 7)
      : (b.c1[ch]! << 4) | b.c2[ch]!;
    hi |= byte << (24 - 8 * ch);
  }
  hi |= (b.f1.table << 5) | (b.f2.table << 2) | (b.diff << 1) | b.flip;
  let lo = 0;
  const [s1, s2] = SUBS[b.flip]!;
  s1.forEach((p, i) => {
    const m = b.f1.idx[i]!;
    lo |= ((m >> 1) << (16 + p)) | ((m & 1) << p);
  });
  s2.forEach((p, i) => {
    const m = b.f2.idx[i]!;
    lo |= ((m >> 1) << (16 + p)) | ((m & 1) << p);
  });
  writeU32(out, o, hi >>> 0);
  writeU32(out, o + 4, lo >>> 0);
}

function writeU32(out: Uint8Array, o: number, v: number): void {
  out[o] = v >>> 24;
  out[o + 1] = (v >>> 16) & 255;
  out[o + 2] = (v >>> 8) & 255;
  out[o + 3] = v & 255;
}

/** Writes an EAC block: base, multiplier, table and a 3-bit index per pixel (48 bits). */
function writeAlpha(
  out: Uint8Array,
  o: number,
  base: number,
  mul: number,
  tab: number,
  idx: number[],
): void {
  out[o] = base;
  out[o + 1] = (mul << 4) | tab;
  // 48 index bits, pixel 0 first, as six bytes.
  let bits = 0,
    n = 0,
    k = o + 2;
  for (let p = 0; p < 16; p++) {
    bits = (bits << 3) | idx[p]!;
    n += 3;
    while (n >= 8) {
      out[k++] = (bits >> (n - 8)) & 255;
      n -= 8;
    }
  }
}

function encodeAlpha(a: Uint8Array, out: Uint8Array, o: number): void {
  let mn = 255,
    mx = 0,
    onlyEnds = true;
  for (let p = 0; p < 16; p++) {
    const v = a[p]!;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
    if (v !== 0 && v !== 255) onlyEnds = false;
  }
  if (mn === mx) {
    // One value: table 13 has 0 at index 4.
    writeAlpha(out, o, mn, 1, 13, new Array<number>(16).fill(4));
    return;
  }
  if (onlyEnds) {
    // Only clear and opaque: base 128 × 15 reaches past both ends, clamped to 0 and 255 exactly.
    const idx = Array.from(a, (v) => (v === 0 ? 3 : 7));
    writeAlpha(out, o, 128, 15, 0, idx);
    return;
  }
  let best = { err: Infinity, base: 0, mul: 1, tab: 0, idx: [] as number[] };
  for (let t = 0; t < 16; t++) {
    const tab = EAC_TABLES[t]!;
    const lo = Math.min(...tab),
      hiT = Math.max(...tab);
    for (let mul = 1; mul < 16; mul++) {
      const centre = Math.round((mn + mx) / 2 - ((lo + hiT) * mul) / 2);
      for (let s = -1; s <= 1; s++) {
        const base = Math.min(255, Math.max(0, centre + s));
        let err = 0;
        const idx: number[] = [];
        for (let p = 0; p < 16 && err < best.err; p++) {
          let pe = Infinity,
            pi = 0;
          for (let i = 0; i < 8; i++) {
            const d = a[p]! - clamp255(base + tab[i]! * mul);
            const e = d * d;
            if (e < pe) {
              pe = e;
              pi = i;
            }
          }
          err += pe;
          idx.push(pi);
        }
        if (err < best.err) best = { err, base, mul, tab: t, idx };
      }
    }
  }
  writeAlpha(out, o, best.base, best.mul, best.tab, best.idx);
}

/** RGBA8 (w×h, both multiples of 4) → etc2rgba bytes. */
export function encodeEtc2Rgba(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
): Uint8Array {
  if (w % 4 || h % 4) throw new Error(`etc2rgba needs a size in 4×4 blocks, not ${w}×${h}`);
  const out = new Uint8Array(etc2Bytes(w, h));
  const px = new Float64Array(48);
  const wt = new Float64Array(16);
  const alpha = new Uint8Array(16);
  let o = 0;
  for (let by = 0; by < h; by += 4) {
    for (let bx = 0; bx < w; bx += 4) {
      let anyVisible = false;
      for (let p = 0; p < 16; p++) {
        const i = ((by + (p & 3)) * w + bx + (p >> 2)) * 4;
        px[p * 3] = rgba[i]!;
        px[p * 3 + 1] = rgba[i + 1]!;
        px[p * 3 + 2] = rgba[i + 2]!;
        alpha[p] = rgba[i + 3]!;
        wt[p] = rgba[i + 3]! / 255 + 0.002;
        if (rgba[i + 3]! > 0) anyVisible = true;
      }
      encodeAlpha(alpha, out, o);
      // A block nobody sees keeps zero colour bits: black, individual mode.
      if (anyVisible) encodeColour(px, wt, out, o + 8);
      o += 16;
    }
  }
  return out;
}

/** etc2rgba bytes → RGBA8, for previews and tests (blocks this encoder writes: no T, H, planar). */
export function decodeEtc2Rgba(data: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  let o = 0;
  for (let by = 0; by < h; by += 4) {
    for (let bx = 0; bx < w; bx += 4) {
      const base = data[o]!,
        mul = data[o + 1]! >> 4,
        tab = EAC_TABLES[data[o + 1]! & 15]!;
      // the 48 index bits as a number (safe below 2^53)
      let bits = 0;
      for (let k = 2; k < 8; k++) bits = bits * 256 + data[o + k]!;
      const hi =
        ((data[o + 8]! << 24) | (data[o + 9]! << 16) | (data[o + 10]! << 8) | data[o + 11]!) >>> 0;
      const lo =
        ((data[o + 12]! << 24) | (data[o + 13]! << 16) | (data[o + 14]! << 8) | data[o + 15]!) >>>
        0;
      const diff = (hi >>> 1) & 1,
        flip = hi & 1;
      const c1: number[] = [],
        c2: number[] = [];
      for (let ch = 0; ch < 3; ch++) {
        const byte = (hi >>> (24 - 8 * ch)) & 255;
        if (diff) {
          const q = byte >> 3;
          let d = byte & 7;
          if (d >= 4) d -= 8;
          c1.push(ex5(q));
          c2.push(ex5(q + d));
        } else {
          c1.push(ex4(byte >> 4));
          c2.push(ex4(byte & 15));
        }
      }
      const tables = [(hi >>> 5) & 7, (hi >>> 2) & 7];
      SUBS[flip]!.forEach((sub, si) => {
        const c = si ? c2 : c1;
        const mods = MODS[tables[si]!]!;
        for (const p of sub) {
          const m = (((lo >>> (16 + p)) & 1) << 1) | ((lo >>> p) & 1);
          const i = ((by + (p & 3)) * w + bx + (p >> 2)) * 4;
          for (let ch = 0; ch < 3; ch++) out[i + ch] = clamp255(c[ch]! + mods[m]!);
          const ai = Math.floor(bits / 2 ** (45 - 3 * p)) % 8;
          out[i + 3] = clamp255(base + tab[ai]! * mul);
        }
      });
      o += 16;
    }
  }
  return out;
}
