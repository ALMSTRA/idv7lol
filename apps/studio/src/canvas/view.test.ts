import { describe, expect, it } from 'vitest';
import { resizeRect, scaleItems } from './view.js';

describe('resizing several components', () => {
  const from = { x: 100, y: 100, width: 400, height: 200 };
  const items = [
    { id: 'a', absX: 100, absY: 100, x: 100, y: 100, width: 100, height: 100 },
    // a child of a group placed at (300, 50): local and absolute positions differ
    { id: 'b', absX: 400, absY: 200, x: 100, y: 150, width: 100, height: 100 },
  ];

  it('scales every box with the selection, keeping their places', () => {
    const to = resizeRect(from, 'se', 400, 200, false); // twice as big
    const out = scaleItems(from, to, items);
    expect(out.get('a')).toEqual({ x: 100, y: 100, width: 200, height: 200 });
    // absolute 400,200 → 700,300; the local position moves by the same amount
    expect(out.get('b')).toEqual({ x: 400, y: 250, width: 200, height: 200 });
  });

  it('grows from the opposite corner when dragging the top-left handle', () => {
    const to = resizeRect(from, 'nw', -400, -200, true);
    expect(to).toEqual({ x: -300, y: -100, width: 800, height: 400 });
    const out = scaleItems(from, to, items);
    expect(out.get('a')).toMatchObject({ x: -300, y: -100 });
  });

  it('never makes a box smaller than 4 pixels', () => {
    const to = { x: 100, y: 100, width: 4, height: 4 };
    for (const r of scaleItems(from, to, items).values()) {
      expect(r.width).toBeGreaterThanOrEqual(4);
      expect(r.height).toBeGreaterThanOrEqual(4);
    }
  });
});
