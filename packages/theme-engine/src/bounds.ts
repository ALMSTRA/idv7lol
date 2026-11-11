import { getDisplayProfile } from '@idv7lol/theme-schema';
import type { Component, Rect, ReservedZone, Theme } from '@idv7lol/theme-schema';
import { DEG, anchorFraction, polar } from './math.js';
import { formatNumber } from './format.js';

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

/**
 * Where an arc or arc gauge actually paints, when that is less than its box: a
 * wide rev arc whose centre sits low only draws the upper half of its square.
 * Other components, rotated ones and gauges with a needle or centre text paint
 * across the whole box, so this returns the box.
 */
export function paintedBounds(c: Component, absX: number, absY: number): Rect {
  const box = componentBounds(c, absX, absY);
  if (c.rotation || (c.type !== 'arc' && c.type !== 'gauge.arc')) return box;
  const R = Math.min(c.width, c.height) / 2;
  let inner: number;
  let outer = R;
  if (c.type === 'arc') {
    if (c.props.fill) return box;
    inner = R - c.props.stroke.width;
    outer = R + c.props.stroke.width / 2;
  } else {
    const p = c.props;
    if (p.needle.show || p.valueText.show) return box;
    // Same radii as the gauge renderer: redline, band, ticks, then labels, from the outside in.
    let r = R;
    if (p.redline.show && p.redline.placement === 'outer') r -= p.redline.width + 4;
    r -= Math.max(p.track.show ? p.track.width : 0, p.fill.show ? p.fill.width : 0);
    inner = r;
    if (p.ticks.major > 0) {
      const tickOuter = r - p.ticks.inset - 4;
      inner = Math.min(inner, tickOuter - p.ticks.majorLength);
      if (p.labels.show)
        inner = Math.min(
          inner,
          tickOuter - p.ticks.majorLength - p.labels.inset - p.labels.style.size,
        );
    }
    inner = Math.max(0, inner);
    if (p.glow.show) outer += p.glow.blur;
  }
  const sweep = Math.max(-360, Math.min(360, c.props.sweepAngle));
  if (Math.abs(sweep) >= 360) return box;
  const cx = absX + c.width / 2;
  const cy = absY + c.height / 2;
  const a0 = Math.min(c.props.startAngle, c.props.startAngle + sweep);
  const a1 = Math.max(c.props.startAngle, c.props.startAngle + sweep);
  const angles = [a0, a1];
  for (let k = Math.ceil(a0 / 90) * 90; k <= a1; k += 90) angles.push(k);
  const pts: Array<{ x: number; y: number }> = [];
  for (const a of angles) {
    const rad = a * DEG;
    for (const r of [inner, outer])
      pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  const minX = Math.max(box.x, Math.min(...pts.map((p) => p.x)));
  const minY = Math.max(box.y, Math.min(...pts.map((p) => p.y)));
  const maxX = Math.min(box.x + box.width, Math.max(...pts.map((p) => p.x)));
  const maxY = Math.min(box.y + box.height, Math.max(...pts.map((p) => p.y)));
  return {
    x: minX,
    y: minY,
    width: Math.max(1e-6, maxX - minX),
    height: Math.max(1e-6, maxY - minY),
  };
}

/** Width of one character of gauge numerals, as a share of the font size (Barlow digits). */
const NUMERAL_WIDTH = 0.56;
/** Height of a numeral's ink, as a share of the font size. */
const NUMERAL_HEIGHT = 0.72;

/**
 * The first two neighbouring numerals of an arc gauge that would overlap, using the
 * renderer's label radius and an estimate of each numeral's box, or null. In km/h a
 * 0–260 dial with a label at every major tick is the usual case.
 */
export function arcLabelOverlap(
  c: Extract<Component, { type: 'gauge.arc' }>,
  min: number,
  max: number,
): [string, string] | null {
  const p = c.props;
  if (!p.labels.show || p.ticks.major <= 0) return null;
  let r = Math.min(c.width, c.height) / 2;
  if (p.redline.show && p.redline.placement === 'outer') r -= p.redline.width + 4;
  r -= Math.max(p.track.show ? p.track.width : 0, p.fill.show ? p.fill.width : 0);
  const radius = r - p.ticks.inset - 4 - p.ticks.majorLength - p.labels.inset;
  if (radius <= 0) return null;
  const size = p.labels.style.size;
  const labels: Array<{ text: string; x: number; y: number; w: number }> = [];
  for (let i = 0; i <= p.ticks.major; i += p.labels.every) {
    const n = i / p.ticks.major;
    const text = formatNumber((min + (max - min) * n) / p.labels.divisor, p.labels.format);
    const pt = polar(0, 0, radius, p.startAngle + p.sweepAngle * n);
    labels.push({ text, x: pt.x, y: pt.y, w: text.length * size * NUMERAL_WIDTH });
  }
  // On a full circle the last numeral sits on the first one by design; don't count that pair.
  const closed = Math.abs(p.sweepAngle) >= 360;
  for (let i = 1; i < labels.length; i++) {
    const a = labels[i - 1]!;
    const b = labels[i]!;
    if (closed && i === labels.length - 1 && Math.hypot(a.x - b.x, a.y - b.y) < 1) continue;
    const apartX = Math.abs(a.x - b.x) < (a.w + b.w) / 2;
    const apartY = Math.abs(a.y - b.y) < size * NUMERAL_HEIGHT;
    if (apartX && apartY) return [a.text, b.text];
  }
  return null;
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
  // Strict: segments that only touch at an end don't count, so sitting flush
  // against a zone's edge isn't reported as covering it.
  return u > 0 && u < 1 && v > 0 && v < 1;
}

/** Does a component's rotated box overlap a reserved zone (rect or polygon)? */
export function overlapsZone(
  c: Component,
  absX: number,
  absY: number,
  zone: ReservedZone,
): boolean {
  // Rotated boxes keep their exact corners; unrotated arcs use what they paint.
  const painted = paintedBounds(c, absX, absY);
  const corners = c.rotation
    ? componentCorners(c, absX, absY)
    : [
        { x: painted.x, y: painted.y },
        { x: painted.x + painted.width, y: painted.y },
        { x: painted.x + painted.width, y: painted.y + painted.height },
        { x: painted.x, y: painted.y + painted.height },
      ];
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

const zoneShape = (z: ReservedZone): string =>
  JSON.stringify([z.kind, z.x, z.y, z.width, z.height, z.polygon ?? null]);

/**
 * The display's zones plus the theme's own. The display's always come first and
 * as they are, so a theme can add zones but cannot redefine or relax the factory
 * ones by reusing their id. A theme zone with the same shape as one already
 * listed is dropped so it doesn't report twice.
 */
export function effectiveZones(theme: Theme): ReservedZone[] {
  const out: ReservedZone[] = [];
  const seen = new Set<string>();
  const add = (z: ReservedZone): void => {
    const key = zoneShape(z);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(z);
  };
  for (const z of getDisplayProfile(theme.target.display)?.reservedZones ?? []) add(z);
  for (const z of theme.layout.reservedZones) add(z);
  return out;
}

/** Every component that touches a reserved zone of the theme's layout. */
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
    const b = paintedBounds(f.component, f.absX, f.absY);
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
