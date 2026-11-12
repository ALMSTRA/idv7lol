import { describe, expect, it } from 'vitest';
import { NEEDLE_FS } from './glsl.js';

/**
 * The needle shader turns each pixel into the needle's own frame with a 2×2 matrix and paints
 * where that lands on +x. This reads the matrix out of the shader and applies it as GLSL does
 * (mat2 takes its arguments column by column), so the test follows the shader's real maths.
 */
function needleFrame(angleDeg: number, pixel: { x: number; y: number }): { x: number; y: number } {
  const m = /mat2\s+rot\s*=\s*mat2\(([^;]+)\);/.exec(NEEDLE_FS);
  if (!m)
    throw new Error('the needle shader no longer builds its rotation as "mat2 rot = mat2(…)"');
  expect(NEEDLE_FS).toMatch(/vec2\s+q\s*=\s*rot\s*\*\s*p;/);
  const a = (angleDeg * Math.PI) / 180;
  const term = (src: string): number => {
    const t = /^(-?)\s*(cos|sin)\(a\)$/.exec(src.trim());
    if (!t) throw new Error(`unexpected matrix term "${src}"`);
    return (t[1] ? -1 : 1) * (t[2] === 'cos' ? Math.cos(a) : Math.sin(a));
  };
  const [c0x, c0y, c1x, c1y] = m[1]!.split(',').map(term) as [number, number, number, number];
  return { x: c0x * pixel.x + c1x * pixel.y, y: c0y * pixel.x + c1y * pixel.y };
}

describe('needle shader', () => {
  // Angles are degrees clockwise from 3 o'clock with y down, as the scale's ticks and the
  // Canvas2D engine use them: the pixel one unit out at that angle is (cos a, sin a).
  it.each([0, 30, 67.5, 90, 145, 238.75, 292.5])(
    'paints the needle along its own angle, the way the scale runs (%s°)',
    (angle) => {
      const a = (angle * Math.PI) / 180;
      const q = needleFrame(angle, { x: Math.cos(a), y: Math.sin(a) });
      expect(q.x).toBeCloseTo(1, 6);
      expect(q.y).toBeCloseTo(0, 6);
    },
  );

  it('does not paint the mirror image of the needle', () => {
    const a = (67.5 * Math.PI) / 180;
    const q = needleFrame(67.5, { x: Math.cos(a), y: -Math.sin(a) });
    expect(q.x).toBeLessThan(0.5);
  });
});
