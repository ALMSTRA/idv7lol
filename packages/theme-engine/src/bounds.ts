import { getDisplayProfile } from '@idv7lol/theme-schema';
import type { Component, Rect, ReservedZone, Theme } from '@idv7lol/theme-schema';
import { DEG, anchorFraction } from './math.js';

export interface FlatComponent {
  component: Component;
  /** Ids from the root to this component (exclusive). */
  parents: string[];
  /** Absolute top-left in layout pixels, ignoring rotation. */
  absX: number;
  absY: number;
  depth: number;
}

/** Depth-first list of every component, with absolute positions. */
export function flattenComponents(
  components: readonly Component[],
  parents: string[] = [],
  ox = 0,
  oy = 0,
  depth = 0,
  out: FlatComponent[] = [],
): FlatComponent[] {
  for (const c of components) {
    out.push({ component: c, parents, absX: ox + c.x, absY: oy + c.y, depth });
    if (c.type === 'group')
      flattenComponents(c.props.children, [...parents, c.id], ox + c.x, oy + c.y, depth + 1, out);
  }
  return out;
}

export function findComponent(components: readonly Component[], id: string): Component | undefined {
  for (const c of components) {
    if (c.id === id) return c;
    if (c.type === 'group') {
      const f = findComponent(c.props.children, id);
      if (f) return f;
    }
  }
  return undefined;
}

/** Corners of a component's (possibly rotated) box in absolute layout coordinates. */
export function componentCorners(
  c: Component,
  absX: number,
  absY: number,
): Array<{ x: number; y: number }> {
  const { fx, fy } = anchorFraction(c.anchor);
  const px = absX + fx * c.width;
  const py = absY + fy * c.height;
  const a = c.rotation * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const local = [
    { x: -fx * c.width, y: -fy * c.height },
    { x: (1 - fx) * c.width, y: -fy * c.height },
    { x: (1 - fx) * c.width, y: (1 - fy) * c.height },
    { x: -fx * c.width, y: (1 - fy) * c.height },
  ];
  return local.map((p) => ({ x: px + p.x * cos - p.y * sin, y: py + p.x * sin + p.y * cos }));
}

/** Axis-aligned bounding box of a component in absolute layout coordinates. */
export function componentBounds(c: Component, absX: number, absY: number): Rect {
  const pts = componentCorners(c, absX, absY);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1e-6, maxX - minX),
    height: Math.max(1e-6, maxY - minY),
  };
}

/** Is the layout point inside the component's rotated box? */
export function pointInComponent(
  c: Component,
  absX: number,
  absY: number,
  x: number,
  y: number,
): boolean {
  const { fx, fy } = anchorFraction(c.anchor);
  const px = absX + fx * c.width;
  const py = absY + fy * c.height;
  const a = -c.rotation * DEG;
  const dx = x - px;
  const dy = y - py;
  const lx = dx * Math.cos(a) - dy * Math.sin(a) + fx * c.width;
  const ly = dx * Math.sin(a) + dy * Math.cos(a) + fy * c.height;
  return lx >= 0 && ly >= 0 && lx <= c.width && ly <= c.height;
}

/**
 * Top-most component under a layout point. Groups are transparent unless
 * `pickGroups` is set; locked and invisible components are skipped when
 * `respectLocks` is set.
 */
export function hitTest(
  theme: Theme,
  x: number,
  y: number,
  opts: { pickGroups?: boolean; respectLocks?: boolean } = {},
): FlatComponent | undefined {
  const flat = flattenComponents(theme.components);
  for (let i = flat.length - 1; i >= 0; i--) {
    const f = flat[i]!;
    const c = f.component;
    if (c.type === 'group' && !opts.pickGroups) continue;
    if (opts.respectLocks && (c.locked || !c.visible)) continue;
    if (pointInComponent(c, f.absX, f.absY, x, y)) return f;
  }
  return undefined;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function pointInPolygon(
  pt: { x: number; y: number },
  poly: ReadonlyArray<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const intersect =
      pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return false;
  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/** Does a component's rotated box overlap a reserved zone (rect or polygon)? */
export function overlapsZone(
  c: Component,
  absX: number,
  absY: number,
  zone: ReservedZone,
): boolean {
  const corners = componentCorners(c, absX, absY);
  const poly = zone.polygon ?? [
    { x: zone.x, y: zone.y },
    { x: zone.x + zone.width, y: zone.y },
    { x: zone.x + zone.width, y: zone.y + zone.height },
    { x: zone.x, y: zone.y + zone.height },
  ];
  if (corners.some((p) => pointInPolygon(p, poly))) return true;
  if (poly.some((p) => pointInPolygon(p, corners))) return true;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % corners.length]!;
    for (let j = 0; j < poly.length; j++) {
      if (segmentsIntersect(a, b, poly[j]!, poly[(j + 1) % poly.length]!)) return true;
    }
  }
  return false;
}

export interface ZoneOverlap {
  componentId: string;
  zone: ReservedZone;
}

/** Every component that touches a reserved zone of the theme's layout. */
/** The theme's zones plus its display's: a theme cannot opt out of the factory areas. */
export function effectiveZones(theme: Theme): ReservedZone[] {
  const zones = new Map(theme.layout.reservedZones.map((z) => [z.id, z]));
  for (const z of getDisplayProfile(theme.target.display)?.reservedZones ?? [])
    if (!zones.has(z.id)) zones.set(z.id, z);
  return [...zones.values()];
}

export function reservedZoneOverlaps(theme: Theme): ZoneOverlap[] {
  const out: ZoneOverlap[] = [];
  const zones = effectiveZones(theme);
  for (const f of flattenComponents(theme.components)) {
    if (f.component.type === 'group') continue;
    for (const zone of zones) {
      if (overlapsZone(f.component, f.absX, f.absY, zone))
        out.push({ componentId: f.component.id, zone });
    }
  }
  return out;
}

/** Components whose box leaves the layout. */
export function outOfBounds(theme: Theme): string[] {
  const out: string[] = [];
  const layout = { x: 0, y: 0, width: theme.layout.width, height: theme.layout.height };
  for (const f of flattenComponents(theme.components)) {
    const b = componentBounds(f.component, f.absX, f.absY);
    if (
      b.x < layout.x - 0.5 ||
      b.y < layout.y - 0.5 ||
      b.x + b.width > layout.width + 0.5 ||
      b.y + b.height > layout.height + 0.5
    ) {
      out.push(f.component.id);
    }
  }
  return out;
}
