import type { ImageEdits } from '@idv7lol/theme-schema';
import { parseColor } from './color.js';

/**
 * Non-destructive image editing as a pure pixel pipeline. The Studio preview
 * and the theme compiler run this same code, so what the author sees in the
 * editor is what gets baked for the car.
 *
 * Order: background removal and brush strokes (source space) → rotate → flip
 * → crop → colour adjustments → sharpen → blur → tint → vignette → corners.
 */
export interface Raster {
  width: number;
  height: number;
  /** RGBA8, straight alpha, row-major. */
  data: Uint8ClampedArray;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

const smooth = (a: number, b: number, v: number): number => {
  if (a === b) return v < a ? 0 : 1;
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* -------------------------------------------------------------------------- */
/* Background removal and brush                                               */
/* -------------------------------------------------------------------------- */

/** Removal mask from the colour key: 255 = fully removed. */
function colorKeyMask(
  src: Raster,
  key: NonNullable<ImageEdits['colorKey']>,
  mask: Uint8Array,
): void {
  const c = parseColor(key.color);
  const maxDist = Math.sqrt(3) * 255;
  const inner = (key.tolerance / 100) * maxDist;
  const outer = inner + (key.softness / 100) * maxDist * 0.5 + 1;
  const d = src.data;
  for (let i = 0, n = 0; n < mask.length; n++, i += 4) {
    const dr = d[i]! - c.r;
    const dg = d[i + 1]! - c.g;
    const db = d[i + 2]! - c.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    mask[n] = Math.round((1 - smooth(inner, outer, dist)) * 255);
  }
}

/** Adds erase/restore strokes to the removal mask. Points are normalised to the source. */
function applyStrokes(
  w: number,
  h: number,
  strokes: ImageEdits['strokes'],
  mask: Uint8Array,
): void {
  const unit = Math.min(w, h);
  const cover = new Uint8Array(w * h);
  for (const stroke of strokes) {
    const radius = Math.max(0.75, (stroke.size * unit) / 2);
    const coreR = radius * stroke.hardness;
    const pts = stroke.points;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    const count = Math.floor(pts.length / 2);
    for (let s = 0; s < Math.max(1, count - 1); s++) {
      const ax = pts[s * 2]! * w;
      const ay = pts[s * 2 + 1]! * h;
      const bx = count > 1 ? pts[s * 2 + 2]! * w : ax;
      const by = count > 1 ? pts[s * 2 + 3]! * h : ay;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1));
      const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + radius + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1));
      const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + radius + 1));
      const vx = bx - ax;
      const vy = by - ay;
      const len2 = vx * vx + vy * vy;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const wx = x + 0.5 - ax;
          const wy = y + 0.5 - ay;
          const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
          const dist = Math.hypot(wx - vx * t, wy - vy * t);
          if (dist >= radius) continue;
          const v = Math.round((1 - smooth(coreR, radius, dist)) * 255);
          const idx = y * w + x;
          if (v > cover[idx]!) cover[idx] = v;
        }
      }
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    }
    const target = stroke.mode === 'erase' ? 255 : 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = y * w + x;
        const c = cover[idx]!;
        if (c) {
          mask[idx] = Math.round(mask[idx]! + ((target - mask[idx]!) * c) / 255);
          cover[idx] = 0;
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

function rotateFlip(src: Raster, rotate: number, flipH: boolean, flipV: boolean): Raster {
  if (rotate === 0 && !flipH && !flipV) return src;
  const swap = rotate === 90 || rotate === 270;
  const W = swap ? src.height : src.width;
  const H = swap ? src.width : src.height;
  const out = createRaster(W, H);
  const s = src.data;
  const d = out.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = flipH ? W - 1 - x : x;
      const fy = flipV ? H - 1 - y : y;
      let sx = fx;
      let sy = fy;
      if (rotate === 90) {
        sx = fy;
        sy = src.height - 1 - fx;
      } else if (rotate === 180) {
        sx = src.width - 1 - fx;
        sy = src.height - 1 - fy;
      } else if (rotate === 270) {
        sx = src.width - 1 - fy;
        sy = fx;
      }
      const si = (sy * src.width + sx) * 4;
      const di = (y * W + x) * 4;
      d[di] = s[si]!;
      d[di + 1] = s[si + 1]!;
      d[di + 2] = s[si + 2]!;
      d[di + 3] = s[si + 3]!;
    }
  }
  return out;
}

function cropRaster(src: Raster, crop: NonNullable<ImageEdits['crop']>): Raster {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.round(crop.x * src.width)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.round(crop.y * src.height)));
  const W = Math.max(1, Math.min(src.width - x0, Math.round(crop.width * src.width)));
  const H = Math.max(1, Math.min(src.height - y0, Math.round(crop.height * src.height)));
  const out = createRaster(W, H);
  for (let y = 0; y < H; y++) {
    const start = ((y + y0) * src.width + x0) * 4;
    out.data.set(src.data.subarray(start, start + W * 4), y * W * 4);
  }
  return out;
}

/** Size in source pixels of the image after rotation and crop. */
export function editedSize(
  edits: ImageEdits,
  srcW: number,
  srcH: number,
): { width: number; height: number } {
  const swap = edits.rotate === 90 || edits.rotate === 270;
  const w = swap ? srcH : srcW;
  const h = swap ? srcW : srcH;
  return edits.crop
    ? { width: Math.max(1, edits.crop.width * w), height: Math.max(1, edits.crop.height * h) }
    : { width: w, height: h };
}

/** Map a normalised point of the edited image back to normalised source coordinates. */
export function displayToSource(
  edits: ImageEdits,
  nx: number,
  ny: number,
): { x: number; y: number } {
  let x = edits.crop ? edits.crop.x + nx * edits.crop.width : nx;
  let y = edits.crop ? edits.crop.y + ny * edits.crop.height : ny;
  if (edits.flipH) x = 1 - x;
  if (edits.flipV) y = 1 - y;
  switch (edits.rotate) {
    case 90:
      return { x: y, y: 1 - x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: 1 - y, y: x };
    default:
      return { x, y };
  }
}

/* -------------------------------------------------------------------------- */
/* Colour                                                                     */
/* -------------------------------------------------------------------------- */

function buildToneLut(brightness: number, contrast: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const b = brightness / 100;
  const factor = contrast >= 0 ? 1 + (contrast / 100) * 2 : 1 + contrast / 100;
  for (let i = 0; i < 256; i++) {
    let v = b >= 0 ? i + (255 - i) * b : i * (1 + b);
    v = (v - 128) * factor + 128;
    lut[i] = v;
  }
  return lut;
}

/** 3×3 matrix combining saturation and a luminance-preserving hue rotation. */
function colorMatrix(saturation: number, hue: number, grayscale: boolean): number[] | null {
  const s = grayscale ? 0 : 1 + saturation / 100;
  if (s === 1 && hue === 0) return null;
  const lr = 0.2126;
  const lg = 0.7152;
  const lb = 0.0722;
  const a = (hue * Math.PI) / 180;
  const c = Math.cos(a);
  const n = Math.sin(a);
  const h = [
    lr + c * (1 - lr) - n * lr,
    lg - c * lg - n * lg,
    lb - c * lb + n * (1 - lb),
    lr - c * lr + n * 0.143,
    lg + c * (1 - lg) + n * 0.14,
    lb - c * lb - n * 0.283,
    lr - c * lr - n * (1 - lr),
    lg - c * lg + n * lg,
    lb + c * (1 - lb) + n * lb,
  ];
  const sat = [
    lr * (1 - s) + s,
    lg * (1 - s),
    lb * (1 - s),
    lr * (1 - s),
    lg * (1 - s) + s,
    lb * (1 - s),
    lr * (1 - s),
    lg * (1 - s),
    lb * (1 - s) + s,
  ];
  const m: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      m.push(sat[r * 3]! * h[col]! + sat[r * 3 + 1]! * h[col + 3]! + sat[r * 3 + 2]! * h[col + 6]!);
    }
  }
  return m;
}

function adjustColors(r: Raster, e: ImageEdits): void {
  const needsTone = e.brightness !== 0 || e.contrast !== 0;
  const matrix = colorMatrix(e.saturation, e.hue, e.grayscale);
  const t = e.temperature / 100;
  if (!needsTone && !matrix && t === 0 && !e.invert) return;
  const lut = needsTone ? buildToneLut(e.brightness, e.contrast) : null;
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    let R = d[i]!;
    let G = d[i + 1]!;
    let B = d[i + 2]!;
    if (t !== 0) {
      R += t * 40;
      G += t * 8;
      B -= t * 40;
    }
    if (matrix) {
      const r2 = matrix[0]! * R + matrix[1]! * G + matrix[2]! * B;
      const g2 = matrix[3]! * R + matrix[4]! * G + matrix[5]! * B;
      const b2 = matrix[6]! * R + matrix[7]! * G + matrix[8]! * B;
      R = r2;
      G = g2;
      B = b2;
    }
    if (lut) {
      R = lut[Math.max(0, Math.min(255, Math.round(R)))]!;
      G = lut[Math.max(0, Math.min(255, Math.round(G)))]!;
      B = lut[Math.max(0, Math.min(255, Math.round(B)))]!;
    }
    if (e.invert) {
      R = 255 - R;
      G = 255 - G;
      B = 255 - B;
    }
    d[i] = R;
    d[i + 1] = G;
    d[i + 2] = B;
  }
}

/* -------------------------------------------------------------------------- */
/* Blur, sharpen                                                              */
/* -------------------------------------------------------------------------- */

/** Three-pass box blur on premultiplied colour, so transparent pixels do not bleed. */
function boxBlurred(src: Raster, radius: number): Float32Array {
  const { width: w, height: h, data } = src;
  const cur = new Float32Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    cur[i] = data[i]! * a;
    cur[i + 1] = data[i + 1]! * a;
    cur[i + 2] = data[i + 2]! * a;
    cur[i + 3] = data[i + 3]!;
  }
  const next = new Float32Array(w * h * 4);
  const r = Math.max(1, Math.round(radius));
  const win = r * 2 + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++)
          sum += cur[(y * w + Math.max(0, Math.min(w - 1, k))) * 4 + c]!;
        for (let x = 0; x < w; x++) {
          next[(y * w + x) * 4 + c] = sum / win;
          sum +=
            cur[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c]! -
            cur[(y * w + Math.max(0, x - r)) * 4 + c]!;
        }
      }
    }
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++)
          sum += next[(Math.max(0, Math.min(h - 1, k)) * w + x) * 4 + c]!;
        for (let y = 0; y < h; y++) {
          cur[(y * w + x) * 4 + c] = sum / win;
          sum +=
            next[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c]! -
            next[(Math.max(0, y - r) * w + x) * 4 + c]!;
        }
      }
    }
  }
  return cur;
}

function blurRaster(r: Raster, radius: number): void {
  const b = boxBlurred(r, radius);
  const d = r.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = b[i + 3]!;
    const k = a > 0 ? 255 / a : 0;
    d[i] = b[i]! * k;
    d[i + 1] = b[i + 1]! * k;
    d[i + 2] = b[i + 2]! * k;
    d[i + 3] = a;
  }
}

function sharpenRaster(r: Raster, amount: number): void {
  const b = boxBlurred(r, Math.max(1, Math.round(Math.min(r.width, r.height) / 500)));
  const d = r.data;
  const k = (amount / 100) * 1.5;
  for (let i = 0; i < d.length; i += 4) {
    const a = b[i + 3]!;
    if (a <= 0) continue;
    const u = 255 / a;
    d[i] = d[i]! + (d[i]! - b[i]! * u) * k;
    d[i + 1] = d[i + 1]! + (d[i + 1]! - b[i + 1]! * u) * k;
    d[i + 2] = d[i + 2]! + (d[i + 2]! - b[i + 2]! * u) * k;
  }
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

/** Identifies the result of the expensive first stage (removal, brush, geometry). */
export function sourceStageKey(e: ImageEdits): string {
  return JSON.stringify([e.colorKey, e.strokes, e.rotate, e.flipH, e.flipV, e.crop]);
}

/** First stage: background removal, brush strokes, rotation, flip, crop. */
export function applySourceStage(src: Raster, e: ImageEdits): Raster {
  let cur: Raster = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };

  if (e.colorKey || e.strokes.length) {
    const mask = new Uint8Array(cur.width * cur.height);
    if (e.colorKey) colorKeyMask(cur, e.colorKey, mask);
    if (e.strokes.length) applyStrokes(cur.width, cur.height, e.strokes, mask);
    for (let n = 0, i = 3; n < mask.length; n++, i += 4) {
      if (mask[n]) cur.data[i] = (cur.data[i]! * (255 - mask[n]!)) / 255;
    }
  }

  cur = rotateFlip(cur, e.rotate, e.flipH, e.flipV);
  if (e.crop) cur = cropRaster(cur, e.crop);
  return cur;
}

/** Second stage: colour, blur and shape. Does not modify its input. */
export function applyFinishStage(
  stage: Raster,
  e: ImageEdits,
  resolveColor: (c: string) => string = (c) => c,
): Raster {
  const cur: Raster = {
    width: stage.width,
    height: stage.height,
    data: new Uint8ClampedArray(stage.data),
  };
  adjustColors(cur, e);

  const unit = Math.min(cur.width, cur.height);
  if (e.sharpen > 0) sharpenRaster(cur, e.sharpen);
  if (e.blur > 0) blurRaster(cur, (e.blur / 100) * unit * 0.08);

  const { width: w, height: h, data: d } = cur;
  if (e.tint && e.tint.amount > 0) {
    const c = parseColor(resolveColor(e.tint.color));
    const k = e.tint.amount / 100;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
      d[i] = d[i]! + (c.r * l - d[i]!) * k;
      d[i + 1] = d[i + 1]! + (c.g * l - d[i + 1]!) * k;
      d[i + 2] = d[i + 2]! + (c.b * l - d[i + 2]!) * k;
    }
  }

  if (e.vignette > 0 || e.radius > 0) {
    const amount = e.vignette / 100;
    const radius = (e.radius / 100) * unit;
    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (amount > 0) {
          const dx = (x + 0.5 - cx) / cx;
          const dy = (y + 0.5 - cy) / cy;
          const f = 1 - amount * smooth(0.45, 1.35, Math.hypot(dx, dy));
          d[i] = d[i]! * f;
          d[i + 1] = d[i + 1]! * f;
          d[i + 2] = d[i + 2]! * f;
        }
        if (radius > 0) {
          const qx = Math.abs(x + 0.5 - cx) - cx + radius;
          const qy = Math.abs(y + 0.5 - cy) - cy + radius;
          const sd =
            Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
          if (sd > -0.5) d[i + 3] = d[i + 3]! * Math.max(0, Math.min(1, 0.5 - sd));
        }
      }
    }
  }
  return cur;
}

/** Apply every edit and return a new raster; the source is never modified. */
export function applyImageEdits(
  src: Raster,
  e: ImageEdits,
  resolveColor: (c: string) => string = (c) => c,
): Raster {
  return applyFinishStage(applySourceStage(src, e), e, resolveColor);
}

/* -------------------------------------------------------------------------- */
/* Resampling                                                                 */
/* -------------------------------------------------------------------------- */

/** Resize with area averaging when shrinking and bilinear when growing; alpha-correct. */
export function resizeRaster(src: Raster, width: number, height: number): Raster {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  if (W === src.width && H === src.height)
    return { width: W, height: H, data: new Uint8ClampedArray(src.data) };
  const out = createRaster(W, H);
  const sx = src.width / W;
  const sy = src.height / H;
  const s = src.data;
  for (let y = 0; y < H; y++) {
    const y0 = y * sy;
    const y1 = Math.max(y0 + 1e-6, (y + 1) * sy);
    for (let x = 0; x < W; x++) {
      const x0 = x * sx;
      const x1 = Math.max(x0 + 1e-6, (x + 1) * sx);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;
      const shrinking = sx > 1 || sy > 1;
      const sampleY0 = shrinking ? Math.floor(y0) : Math.max(0, Math.floor((y0 + y1) / 2 - 0.5));
      const sampleY1 = shrinking
        ? Math.min(src.height - 1, Math.ceil(y1) - 1)
        : Math.min(src.height - 1, sampleY0 + 1);
      const sampleX0 = shrinking ? Math.floor(x0) : Math.max(0, Math.floor((x0 + x1) / 2 - 0.5));
      const sampleX1 = shrinking
        ? Math.min(src.width - 1, Math.ceil(x1) - 1)
        : Math.min(src.width - 1, sampleX0 + 1);
      for (let py = sampleY0; py <= sampleY1; py++) {
        const wy = shrinking
          ? Math.min(py + 1, y1) - Math.max(py, y0)
          : 1 - Math.abs((y0 + y1) / 2 - (py + 0.5));
        for (let px = sampleX0; px <= sampleX1; px++) {
          const wx = shrinking
            ? Math.min(px + 1, x1) - Math.max(px, x0)
            : 1 - Math.abs((x0 + x1) / 2 - (px + 0.5));
          const w = Math.max(0, wx) * Math.max(0, wy);
          const i = (py * src.width + px) * 4;
          const al = s[i + 3]!;
          r += s[i]! * al * w;
          g += s[i + 1]! * al * w;
          b += s[i + 2]! * al * w;
          a += al * w;
          total += w;
        }
      }
      const o = (y * W + x) * 4;
      if (a > 0) {
        out.data[o] = r / a;
        out.data[o + 1] = g / a;
        out.data[o + 2] = b / a;
        out.data[o + 3] = a / total;
      }
    }
  }
  return out;
}

/** Fit a raster into an exact box: contain leaves transparent bars, cover crops. */
export function fitRaster(
  src: Raster,
  boxW: number,
  boxH: number,
  fit: 'contain' | 'cover' | 'stretch',
): Raster {
  const W = Math.max(1, Math.round(boxW));
  const H = Math.max(1, Math.round(boxH));
  if (fit === 'stretch') return resizeRaster(src, W, H);
  if (fit === 'cover') {
    const s = Math.max(W / src.width, H / src.height);
    const scaled = resizeRaster(src, Math.ceil(src.width * s), Math.ceil(src.height * s));
    const out = createRaster(W, H);
    const ox = Math.floor((scaled.width - W) / 2);
    const oy = Math.floor((scaled.height - H) / 2);
    for (let y = 0; y < H; y++) {
      const start = ((y + oy) * scaled.width + ox) * 4;
      out.data.set(scaled.data.subarray(start, start + W * 4), y * W * 4);
    }
    return out;
  }
  const s = Math.min(W / src.width, H / src.height);
  const scaled = resizeRaster(
    src,
    Math.max(1, Math.round(src.width * s)),
    Math.max(1, Math.round(src.height * s)),
  );
  const out = createRaster(W, H);
  const ox = Math.floor((W - scaled.width) / 2);
  const oy = Math.floor((H - scaled.height) / 2);
  for (let y = 0; y < scaled.height; y++) {
    out.data.set(
      scaled.data.subarray(y * scaled.width * 4, (y + 1) * scaled.width * 4),
      (y + oy) * W * 4 + ox * 4,
    );
  }
  return out;
}
