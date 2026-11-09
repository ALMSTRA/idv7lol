/**
 * Renders the idv7lol application icon (1024×1024 PNG) procedurally: a dark
 * rounded tile with a gauge arc, a red limiter segment and a needle.
 *
 *   npx tsx tools/development/make-icon.ts apps/studio/app-icon.png
 */
import { writeFileSync } from 'node:fs';
import { encodePng } from '../../packages/theme-compiler/src/node.js';

const SIZE = 1024;
const px = new Uint8Array(SIZE * SIZE * 4);

type RGBA = [number, number, number, number];
const BG: RGBA = [11, 13, 18, 255];
const RING: RGBA = [63, 140, 255, 255];
const TRACK: RGBA = [34, 40, 52, 255];
const RED: RGBA = [255, 59, 59, 255];
const NEEDLE: RGBA = [244, 246, 248, 255];
const HUB: RGBA = [20, 24, 32, 255];

function blend(i: number, c: RGBA, a: number): void {
  if (a <= 0) return;
  const k = Math.min(1, a) * (c[3] / 255);
  const o = i * 4;
  px[o] = px[o]! + (c[0] - px[o]!) * k;
  px[o + 1] = px[o + 1]! + (c[1] - px[o + 1]!) * k;
  px[o + 2] = px[o + 2]! + (c[2] - px[o + 2]!) * k;
  px[o + 3] = Math.max(px[o + 3]!, Math.round(255 * k));
}
const cov = (d: number) => Math.max(0, Math.min(1, 0.5 - d));
const sdRoundBox = (x: number, y: number, b: number, r: number) => {
  const qx = Math.abs(x) - b + r;
  const qy = Math.abs(y) - b + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const deg = (a: number) => (a * Math.PI) / 180;
function arcDist(x: number, y: number, r: number, a0: number, a1: number, hw: number): number {
  const ang = (Math.atan2(y, x) * 180) / Math.PI;
  const rel = (((ang - a0) % 360) + 360) % 360;
  const sweep = a1 - a0;
  if (rel <= sweep) return Math.abs(Math.hypot(x, y) - r) - hw;
  const ea = deg(rel - sweep < 360 - rel ? a1 : a0);
  return Math.hypot(x - Math.cos(ea) * r, y - Math.sin(ea) * r) - hw;
}

const c = SIZE / 2;
const R = 330;
const needleAngle = 135 + 270 * 0.72;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    const dx = x + 0.5 - c;
    const dy = y + 0.5 - c;
    const tile = sdRoundBox(dx, dy, 470, 210);
    blend(i, BG, cov(tile));
    if (tile > 1) continue;
    blend(i, TRACK, cov(arcDist(dx, dy, R, 135, 405, 46)));
    blend(i, RING, cov(arcDist(dx, dy, R, 135, 135 + 270 * 0.72, 46)));
    blend(i, RED, cov(arcDist(dx, dy, R, 135 + 270 * 0.86, 405, 46)));
    // needle
    const a = deg(needleAngle);
    const nx = dx * Math.cos(-a) - dy * Math.sin(-a);
    const ny = dx * Math.sin(-a) + dy * Math.cos(-a);
    const hw = 18 * (1 - Math.max(0, nx) / 300) + 2;
    const nd = Math.max(Math.abs(ny) - hw, Math.max(-60 - nx, nx - 280));
    blend(i, NEEDLE, cov(nd));
    blend(i, HUB, cov(Math.hypot(dx, dy) - 52));
    blend(i, NEEDLE, cov(Math.abs(Math.hypot(dx, dy) - 52) - 6));
  }
}
const out = process.argv[2] ?? 'app-icon.png';
writeFileSync(out, encodePng(SIZE, SIZE, px));
console.log(`wrote ${out}`);
