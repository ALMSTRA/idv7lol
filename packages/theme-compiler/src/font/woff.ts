import { inflateSync } from 'node:zlib';

export interface SfntTables {
  flavor: number;
  tables: Map<string, Uint8Array>;
}

const td = (buf: Uint8Array, off: number, len: number) =>
  String.fromCharCode(...buf.subarray(off, off + len));

/** Unpack a WOFF 1.0 file into its uncompressed sfnt tables. */
export function parseWoff(buf: Uint8Array): SfntTables {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (td(buf, 0, 4) !== 'wOFF') throw new Error('Not a WOFF 1.0 file');
  const flavor = dv.getUint32(4);
  const numTables = dv.getUint16(12);
  const tables = new Map<string, Uint8Array>();
  let off = 44;
  for (let i = 0; i < numTables; i++) {
    const tag = td(buf, off, 4);
    const offset = dv.getUint32(off + 4);
    const compLength = dv.getUint32(off + 8);
    const origLength = dv.getUint32(off + 12);
    off += 20;
    const raw = buf.subarray(offset, offset + compLength);
    const data = compLength < origLength ? new Uint8Array(inflateSync(raw)) : new Uint8Array(raw);
    if (data.length !== origLength) throw new Error(`WOFF table ${tag}: bad length`);
    tables.set(tag, data);
  }
  return { flavor, tables };
}

/** Read a plain TrueType/OpenType file's tables. */
export function parseSfnt(buf: Uint8Array): SfntTables {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const flavor = dv.getUint32(0);
  const numTables = dv.getUint16(4);
  const tables = new Map<string, Uint8Array>();
  let off = 12;
  for (let i = 0; i < numTables; i++) {
    const tag = td(buf, off, 4);
    const offset = dv.getUint32(off + 8);
    const length = dv.getUint32(off + 12);
    off += 16;
    tables.set(tag, buf.subarray(offset, offset + length));
  }
  return { flavor, tables };
}

export function parseFontFile(buf: Uint8Array): SfntTables {
  return td(buf, 0, 4) === 'wOFF' ? parseWoff(buf) : parseSfnt(buf);
}
