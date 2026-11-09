import { inflateSync, deflateSync } from 'node:zlib';

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA8, straight alpha. */
  rgba: Uint8Array;
}

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** Decode an 8-bit non-interlaced PNG (grey, grey+alpha, RGB, RGBA, palette) to RGBA8. */
export function decodePng(buf: Uint8Array): DecodedPng {
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('Not a PNG file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  while (p < buf.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(buf[p + 4]!, buf[p + 5]!, buf[p + 6]!, buf[p + 7]!);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = dv.getUint32(p + 8);
      height = dv.getUint32(p + 12);
      depth = buf[p + 16]!;
      colorType = buf[p + 17]!;
      interlace = buf[p + 20]!;
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`PNG bit depth ${depth} is not supported (use 8-bit)`);
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported');
  const channels =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const total = idat.reduce((a, c) => a + c.length, 0);
  const z = new Uint8Array(total);
  let o = 0;
  for (const c of idat) {
    z.set(c, o);
    o += c.length;
  }
  const raw = new Uint8Array(inflateSync(z));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++]!;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      const v = raw[rp + x]!;
      let val: number;
      switch (filter) {
        case 0:
          val = v;
          break;
        case 1:
          val = v + a;
          break;
        case 2:
          val = v + b;
          break;
        case 3:
          val = v + ((a + b) >> 1);
          break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a);
          const pb = Math.abs(pp - b);
          const pc = Math.abs(pp - c);
          val = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`Bad PNG filter ${filter}`);
      }
      cur[x] = val & 255;
    }
    rp += stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const s = x * channels;
      switch (colorType) {
        case 0:
          out[i] = out[i + 1] = out[i + 2] = cur[s]!;
          out[i + 3] = 255;
          break;
        case 2:
          out[i] = cur[s]!;
          out[i + 1] = cur[s + 1]!;
          out[i + 2] = cur[s + 2]!;
          out[i + 3] = 255;
          break;
        case 3: {
          const idx = cur[s]!;
          out[i] = palette?.[idx * 3] ?? 0;
          out[i + 1] = palette?.[idx * 3 + 1] ?? 0;
          out[i + 2] = palette?.[idx * 3 + 2] ?? 0;
          out[i + 3] = trns && idx < trns.length ? trns[idx]! : 255;
          break;
        }
        case 4:
          out[i] = out[i + 1] = out[i + 2] = cur[s]!;
          out[i + 3] = cur[s + 1]!;
          break;
        default:
          out[i] = cur[s]!;
          out[i + 1] = cur[s + 1]!;
          out[i + 2] = cur[s + 2]!;
          out[i + 3] = cur[s + 3]!;
      }
    }
    prev.set(cur);
  }
  return { width, height, rgba: out };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encode RGBA8 (or grey R8 when `grey`) pixels as a PNG, for previews and atlas inspection. */
export function encodePng(
  width: number,
  height: number,
  pixels: Uint8Array,
  grey = false,
): Uint8Array {
  const channels = grey ? 1 : 4;
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = grey ? 0 : 6;
  const parts = [
    new Uint8Array(SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
