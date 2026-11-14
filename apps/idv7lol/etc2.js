'use strict';
/**
 * etc2.js - etc2rgba blocks back to RGBA8, for an animation whose ETC2 texture the renderer
 * refused (engine.js sends it again uncompressed). ETC2 RGBA with EAC alpha
 * (GL_COMPRESSED_RGBA8_ETC2_EAC): 16 bytes a 4x4 block, the alpha block then the colour block,
 * both big-endian, blocks in rows. Reads the blocks the theme compiler writes
 * (packages/theme-compiler/src/etc2.ts): ETC1's individual and differential modes. Node 8.
 */

const MODS = [
  [2, 8],
  [5, 17],
  [9, 29],
  [13, 42],
  [18, 60],
  [24, 80],
  [33, 106],
  [47, 183],
].map((t) => [t[0], t[1], -t[0], -t[1]]);
const EAC = [
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

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const ex4 = (q) => q * 17;
const ex5 = (q) => (q << 3) | (q >> 2);

/** etc2rgba bytes of a w x h texture (multiples of 4) -> RGBA8 Buffer. */
function decodeEtc2Rgba(data, w, h) {
  const out = Buffer.alloc(w * h * 4);
  let o = 0;
  for (let by = 0; by < h; by += 4) {
    for (let bx = 0; bx < w; bx += 4) {
      const base = data[o];
      const mul = data[o + 1] >> 4;
      const tab = EAC[data[o + 1] & 15];
      let bits = 0; // the 48 alpha index bits, below 2^53
      for (let k = 2; k < 8; k++) bits = bits * 256 + data[o + k];
      const hi = data.readUInt32BE(o + 8);
      const lo = data.readUInt32BE(o + 12);
      const diff = (hi >>> 1) & 1;
      const flip = hi & 1;
      const c1 = [];
      const c2 = [];
      for (let ch = 0; ch < 3; ch++) {
        const byte = (hi >>> (24 - 8 * ch)) & 255;
        if (diff) {
          let d = byte & 7;
          if (d >= 4) d -= 8;
          c1.push(ex5(byte >> 3));
          c2.push(ex5((byte >> 3) + d));
        } else {
          c1.push(ex4(byte >> 4));
          c2.push(ex4(byte & 15));
        }
      }
      const t1 = MODS[(hi >>> 5) & 7];
      const t2 = MODS[(hi >>> 2) & 7];
      for (let p = 0; p < 16; p++) {
        const x = p >> 2;
        const y = p & 3;
        const second = flip ? y >= 2 : x >= 2;
        const c = second ? c2 : c1;
        const mods = second ? t2 : t1;
        const m = (((lo >>> (16 + p)) & 1) << 1) | ((lo >>> p) & 1);
        const i = ((by + y) * w + bx + x) * 4;
        out[i] = clamp(c[0] + mods[m]);
        out[i + 1] = clamp(c[1] + mods[m]);
        out[i + 2] = clamp(c[2] + mods[m]);
        out[i + 3] = clamp(base + tab[Math.floor(bits / Math.pow(2, 45 - 3 * p)) % 8] * mul);
      }
      o += 16;
    }
  }
  return out;
}

module.exports = { decodeEtc2Rgba };
