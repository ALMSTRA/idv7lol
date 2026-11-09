/**
 * Signed distance field rasterisation of flattened glyph outlines.
 *
 * For every cell pixel centre we compute the exact distance to the nearest
 * outline segment and the sign from the non-zero winding number. Distances are
 * encoded as `0.5 + sd / (2 * spread)` into a byte, 128 on the outline, higher
 * inside. That is the convention the TEXT shaders expect.
 */

export type Polyline = Array<[number, number]>;

export interface RasterGlyph {
  /** Cell-sized R8 pixels (row-major, top row first). */
  pixels: Uint8Array;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return dx * dx + dy * dy;
}

/** Non-zero winding of polylines around a point. */
function winding(px: number, py: number, polys: Polyline[]): number {
  let wn = 0;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = poly[i]!;
      const [bx, by] = poly[(i + 1) % n]!;
      if (ay <= py) {
        if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) wn += 1;
      } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) wn -= 1;
    }
  }
  return wn;
}

/**
 * Rasterise polylines (already in cell pixel space, y down) into an SDF cell.
 * Uses a coarse grid to limit the segments tested per pixel.
 */
export function rasterizeSdf(
  polys: Polyline[],
  cellW: number,
  cellH: number,
  spread: number,
): RasterGlyph {
  const pixels = new Uint8Array(cellW * cellH);
  if (polys.length === 0) return { pixels };
  const segs: Array<[number, number, number, number]> = [];
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  }
  const maxD = spread * 1.05;
  const maxD2 = maxD * maxD;
  for (let y = 0; y < cellH; y++) {
    const py = y + 0.5;
    for (let x = 0; x < cellW; x++) {
      const px = x + 0.5;
      let best = maxD2;
      for (const s of segs) {
        // cheap reject: bounding box of the segment expanded by maxD
        if (px < Math.min(s[0], s[2]) - maxD || px > Math.max(s[0], s[2]) + maxD) continue;
        if (py < Math.min(s[1], s[3]) - maxD || py > Math.max(s[1], s[3]) + maxD) continue;
        const d2 = segDist2(px, py, s[0], s[1], s[2], s[3]);
        if (d2 < best) best = d2;
      }
      let d = Math.sqrt(best);
      const inside = winding(px, py, polys) !== 0;
      if (!inside) d = -d;
      const v = Math.round((0.5 + d / (2 * spread)) * 255);
      pixels[y * cellW + x] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { pixels };
}
