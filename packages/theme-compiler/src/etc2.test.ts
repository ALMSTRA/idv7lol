import { describe, expect, it } from 'vitest';
import { decodeEtc2Rgba, encodeEtc2Rgba, etc2Bytes } from './etc2.js';

function psnr(a: Uint8Array, b: Uint8Array, channels: number[]): number {
  let se = 0,
    n = 0;
  for (let i = 0; i < a.length; i += 4)
    for (const c of channels) {
      const d = a[i + c]! - b[i + c]!;
      se += d * d;
      n++;
    }
  return se === 0 ? Infinity : 10 * Math.log10((255 * 255) / (se / n));
}

/** A picture with gradients, hard edges and see-through parts, like a sprite frame. */
function sprite(w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (Math.min(w, h) / 2.4) ** 2;
      px[i] = (x * 255) / (w - 1);
      px[i + 1] = (y * 255) / (h - 1);
      px[i + 2] = x % 16 < 8 ? 220 : 40;
      // clear outside, opaque inside, a soft ring between
      const r = Math.hypot(x - w / 2, y - h / 2) / (Math.min(w, h) / 2.4);
      px[i + 3] = inside ? 255 : r < 1.15 ? Math.round((255 * (1.15 - r)) / 0.15) : 0;
    }
  return px;
}

describe('etc2rgba', () => {
  it('takes 16 bytes a 4×4 block, a quarter of RGBA8', () => {
    expect(etc2Bytes(64, 32)).toBe(64 * 32);
    expect(encodeEtc2Rgba(new Uint8Array(64 * 32 * 4), 64, 32).length).toBe(64 * 32);
    expect(() => encodeEtc2Rgba(new Uint8Array(6 * 4 * 4), 6, 4)).toThrow();
  });

  it('keeps clear and opaque pixels exactly so', () => {
    const w = 32,
      h = 32;
    const px = sprite(w, h);
    for (let i = 3; i < px.length; i += 4) px[i] = px[i]! > 127 ? 255 : 0;
    const back = decodeEtc2Rgba(encodeEtc2Rgba(px, w, h), w, h);
    for (let i = 3; i < px.length; i += 4) expect(back[i]).toBe(px[i]);
  });

  it('decodes close to the original, colour where it shows and alpha everywhere', () => {
    const w = 64,
      h = 48;
    const px = sprite(w, h);
    const back = decodeEtc2Rgba(encodeEtc2Rgba(px, w, h), w, h);
    expect(psnr(px, back, [3])).toBeGreaterThan(36);
    // Colour only where the picture is opaque (what is clear doesn't matter).
    const seen = new Uint8Array(px),
      got = new Uint8Array(back);
    for (let i = 0; i < seen.length; i += 4)
      if (px[i + 3]! < 255)
        seen[i] = seen[i + 1] = seen[i + 2] = got[i] = got[i + 1] = got[i + 2] = 0;
    expect(psnr(seen, got, [0, 1, 2])).toBeGreaterThan(30);
  });

  it('draws a flat colour block within a step of the colour', () => {
    const px = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < px.length; i += 4) px.set([255, 214, 10, 255], i); // Volt Runner's yellow
    const back = decodeEtc2Rgba(encodeEtc2Rgba(px, 4, 4), 4, 4);
    for (let i = 0; i < px.length; i += 4) {
      for (let c = 0; c < 3; c++)
        expect(Math.abs(back[i + c]! - px[i + c]!)).toBeLessThanOrEqual(4);
      expect(back[i + 3]).toBe(255);
    }
  });
});
