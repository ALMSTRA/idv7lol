import type { Component, Theme } from '@idv7lol/theme-schema';
import {
  componentBounds,
  componentCorners,
  flattenComponents,
  type FlatComponent,
} from '@idv7lol/theme-engine';

/** Screen ↔ layout mapping: screen = layout * zoom + pan (CSS pixels). */
export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const toLayout = (v: View, sx: number, sy: number) => ({
  x: (sx - v.panX) / v.zoom,
  y: (sy - v.panY) / v.zoom,
});
export const toScreen = (v: View, lx: number, ly: number) => ({
  x: lx * v.zoom + v.panX,
  y: ly * v.zoom + v.panY,
});

export function fitView(theme: Theme, width: number, height: number, margin = 48): View {
  const zoom = Math.min(
    (width - margin * 2) / theme.layout.width,
    (height - margin * 2) / theme.layout.height,
  );
  const z = Math.max(0.05, Math.min(4, zoom));
  return {
    zoom: z,
    panX: (width - theme.layout.width * z) / 2,
    panY: (height - theme.layout.height * z) / 2,
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((r) => r.x + r.width));
  const b = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: r - x, height: b - y };
}

/** Absolute bounds (ignoring rotation) and corners of the given component ids. */
export function selectionGeometry(
  theme: Theme,
  ids: string[],
): {
  items: Array<FlatComponent & { bounds: Rect; corners: Array<{ x: number; y: number }> }>;
  bbox: Rect | null;
} {
  const sel = new Set(ids);
  const flat = flattenComponents(theme.components).filter((f) => sel.has(f.component.id));
  const items = flat.map((f) => ({
    ...f,
    bounds: componentBounds(f.component, f.absX, f.absY),
    corners: componentCorners(f.component, f.absX, f.absY),
  }));
  return { items, bbox: unionRects(items.map((i) => i.bounds)) };
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export const HANDLE_SIZE = 8;

/** Handle positions in screen space for a layout bbox. */
export function handlePositions(v: View, b: Rect): Array<{ id: HandleId; x: number; y: number }> {
  const tl = toScreen(v, b.x, b.y);
  const br = toScreen(v, b.x + b.width, b.y + b.height);
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;
  return [
    { id: 'nw', x: tl.x, y: tl.y },
    { id: 'n', x: cx, y: tl.y },
    { id: 'ne', x: br.x, y: tl.y },
    { id: 'e', x: br.x, y: cy },
    { id: 'se', x: br.x, y: br.y },
    { id: 's', x: cx, y: br.y },
    { id: 'sw', x: tl.x, y: br.y },
    { id: 'w', x: tl.x, y: cy },
    { id: 'rotate', x: cx, y: tl.y - 26 },
  ];
}

export function hitHandle(v: View, b: Rect, sx: number, sy: number): HandleId | null {
  for (const h of handlePositions(v, b)) {
    if (Math.abs(sx - h.x) <= HANDLE_SIZE && Math.abs(sy - h.y) <= HANDLE_SIZE) return h.id;
  }
  return null;
}

export const CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  rotate: 'grab',
};

/** Resize a rect by dragging a handle to a new layout point. Returns the new rect (min 4×4). */
export function resizeRect(
  start: Rect,
  handle: HandleId,
  dx: number,
  dy: number,
  keepAspect: boolean,
): Rect {
  let { x, y, width, height } = start;
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  if (east) width = start.width + dx;
  if (south) height = start.height + dy;
  if (west) {
    width = start.width - dx;
    x = start.x + dx;
  }
  if (north) {
    height = start.height - dy;
    y = start.y + dy;
  }
  if (keepAspect && start.width > 0 && start.height > 0 && (east || west) && (north || south)) {
    const aspect = start.width / start.height;
    if (Math.abs(width / aspect) > Math.abs(height)) height = width / aspect;
    else width = height * aspect;
    if (west) x = start.x + start.width - width;
    if (north) y = start.y + start.height - height;
  }
  if (width < 4) {
    if (west) x = start.x + start.width - 4;
    width = 4;
  }
  if (height < 4) {
    if (north) y = start.y + start.height - 4;
    height = 4;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export interface Guide {
  axis: 'x' | 'y';
  pos: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/**
 * Snap a moving bbox against the layout edges/centre and other components'
 * edges/centres. `threshold` is in layout pixels.
 */
export function snapBox(
  moving: Rect,
  others: Rect[],
  layout: { width: number; height: number },
  threshold: number,
  grid: number | null,
): SnapResult {
  const candidatesX: number[] = [0, layout.width / 2, layout.width];
  const candidatesY: number[] = [0, layout.height / 2, layout.height];
  for (const o of others) {
    candidatesX.push(o.x, o.x + o.width / 2, o.x + o.width);
    candidatesY.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  const edgesX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const edgesY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];
  let bestX: { d: number; pos: number } | null = null;
  let bestY: { d: number; pos: number } | null = null;
  for (const e of edgesX)
    for (const c of candidatesX)
      if (Math.abs(c - e) <= threshold && (!bestX || Math.abs(c - e) < Math.abs(bestX.d)))
        bestX = { d: c - e, pos: c };
  for (const e of edgesY)
    for (const c of candidatesY)
      if (Math.abs(c - e) <= threshold && (!bestY || Math.abs(c - e) < Math.abs(bestY.d)))
        bestY = { d: c - e, pos: c };
  const guides: Guide[] = [];
  let dx = 0;
  let dy = 0;
  if (bestX) {
    dx = bestX.d;
    guides.push({ axis: 'x', pos: bestX.pos });
  } else if (grid) dx = Math.round(moving.x / grid) * grid - moving.x;
  if (bestY) {
    dy = bestY.d;
    guides.push({ axis: 'y', pos: bestY.pos });
  } else if (grid) dy = Math.round(moving.y / grid) * grid - moving.y;
  return { dx, dy, guides };
}

/** Components (top-level or nested) whose bounds intersect the marquee. */
export function marqueeSelect(theme: Theme, r: Rect): string[] {
  const out: string[] = [];
  for (const f of flattenComponents(theme.components)) {
    if (f.component.type === 'group') continue;
    const b = componentBounds(f.component, f.absX, f.absY);
    if (b.x < r.x + r.width && b.x + b.width > r.x && b.y < r.y + r.height && b.y + b.height > r.y)
      out.push(f.component.id);
  }
  return out;
}

export function normalizeRect(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

export function isLocked(c: Component): boolean {
  return c.locked || !c.visible;
}
