import { describe, expect, it } from 'vitest';
import { RecordingContext } from './canvas.js';
import { drawIcon } from './components/icons.js';

/** Corners of the path an icon draws, in its 100×100 box. */
function pathPoints(icon: 'turn-left' | 'turn-right'): Array<{ x: number; y: number }> {
  const ctx = new RecordingContext();
  drawIcon(ctx, icon);
  return ctx.ops
    .filter((o) => o.op === 'moveTo' || o.op === 'lineTo')
    .map((o) => ({ x: o.args[0] as number, y: o.args[1] as number }));
}

/** The arrow's tip: the one corner on the centre line that is also an end of the shape. */
function tip(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  const onAxis = points.filter((p) => p.y === 50);
  expect(onAxis).toHaveLength(1);
  return onAxis[0]!;
}

describe('turn signal icons', () => {
  it('turn-left points left', () => {
    const points = pathPoints('turn-left');
    expect(tip(points).x).toBe(Math.min(...points.map((p) => p.x)));
    expect(tip(points).x).toBeLessThan(50);
  });

  it('turn-right points right', () => {
    const points = pathPoints('turn-right');
    expect(tip(points).x).toBe(Math.max(...points.map((p) => p.x)));
    expect(tip(points).x).toBeGreaterThan(50);
  });
});
