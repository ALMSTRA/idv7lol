import type { ImageSource } from './canvas.js';

/**
 * A picture used as an icon shape (custom telltales and alerts): what is lit in the icon's colour.
 * A picture with transparency gives its alpha; an opaque one its dark parts (black lines on white).
 * The car app gets the same mask as an R8 texture (theme-compiler), so both look alike.
 */
export function maskOf(rgba: ArrayLike<number>): Uint8Array {
  const n = rgba.length >> 2;
  let opaque = true;
  for (let i = 0; i < n; i++)
    if (rgba[i * 4 + 3]! < 250) {
      opaque = false;
      break;
    }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (opaque) {
      const l = 0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!;
      out[i] = 255 - Math.round(l);
    } else out[i] = rgba[i * 4 + 3]!;
  }
  return out;
}

/** The few canvas calls tintedMask needs (no DOM types in this package). */
interface MaskCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): {
    drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
    getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
    putImageData(data: unknown, x: number, y: number): void;
    clearRect(x: number, y: number, w: number, h: number): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    fillStyle: unknown;
  } | null;
}
const tinted = new WeakMap<object, Map<string, MaskCanvas>>();

/**
 * The picture as a mask lit in `color`, for drawing in a browser (cached per picture and colour).
 * Undefined where there is no canvas to make it with (tests); the caller then draws the picture.
 */
export function tintedMask(
  image: unknown,
  w: number,
  h: number,
  color: string,
): ImageSource | undefined {
  const doc = (globalThis as { document?: { createElement(t: string): unknown } }).document;
  if (!doc || !image || typeof image !== 'object') return undefined;
  let byColor = tinted.get(image);
  if (!byColor) tinted.set(image, (byColor = new Map()));
  const key = `${color}:${Math.round(w)}x${Math.round(h)}`;
  const hit = byColor.get(key);
  if (hit) return hit as unknown as ImageSource;
  const c = doc.createElement('canvas') as MaskCanvas;
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.drawImage(image, 0, 0, c.width, c.height);
  const mask = maskOf(g.getImageData(0, 0, c.width, c.height).data);
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  const lit = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < mask.length; i++)
    lit.data[i * 4 + 3] = Math.round((lit.data[i * 4 + 3]! * mask[i]!) / 255);
  g.putImageData(lit, 0, 0);
  byColor.set(key, c);
  return c as unknown as ImageSource;
}
