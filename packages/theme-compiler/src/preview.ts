import type { Binding, Color, Component, Fill, TextStyle, Theme } from '@idv7lol/theme-schema';
import { resolveTextStyles } from '@idv7lol/theme-schema';
import { flattenComponents, formatNumber, isToken, parseColor, toHex } from '@idv7lol/theme-engine';
import { convert, getSignal } from '@idv7lol/vehicle-signals';

/**
 * A sketch of a theme for the car app's own page, which can't show pictures where the Store's
 * renderer draws it: a short list of flat shapes in layout pixels (1920×720), drawn with the
 * kit's canvas. Colours stay palette tokens ("$accent") where the theme uses them, so the sketch
 * follows the palette on show; literals are "#rrggbb[aa]".
 *
 *   ['r', x, y, w, h, radius, colour]            filled box
 *   ['o', x, y, w, h, radius, width, colour]     outlined box
 *   ['c', cx, cy, r, colour]                     disc
 *   ['a', cx, cy, r0, r1, a0, a1, colour]        ring from a0 to a1, degrees clockwise from 12 o'clock
 *   ['l', x1, y1, x2, y2, width, colour]         line
 *   ['t', text, x, y, size, colour, align, bold] text; y is its middle, align 0 left 1 centre 2 right
 */
export type PreviewPrim =
  | ['r', number, number, number, number, number, string]
  | ['o', number, number, number, number, number, number, string]
  | ['c', number, number, number, string]
  | ['a', number, number, number, number, number, number, string]
  | ['l', number, number, number, number, number, string]
  | ['t', string, number, number, number, string, 0 | 1 | 2, 0 | 1];

/** Never more than this many shapes: the page draws three sketches at a time. */
export const PREVIEW_MAX = 140;

/** What the car "reads" in a sketch: a calm drive, the values the Studio's thumbnails use. */
const SAMPLE: Record<string, number | string> = {
  'vehicle.speed': 112,
  'engine.rpm': 4300,
  'transmission.gear': '4',
  'transmission.mode': 'S',
  'drive.mode': 'COMFORT',
  'fuel.level': 62,
  'fuel.volume': 40,
  'vehicle.range': 410,
  'vehicle.odometer': 48213,
  'engine.oil.temp': 96,
  'engine.coolant.temp': 90,
  'engine.boost': 0.8,
  'environment.outside.temp': 18.5,
  'electrical.battery.voltage': 14.1,
  'fuel.consumption.average': 7.4,
};

const r1 = (n: number): number => Math.round(n);

function colour(c: Color | undefined): string | null {
  if (!c || c === 'transparent') return null;
  if (isToken(c)) return c;
  try {
    const rgba = parseColor(c);
    return rgba.a === 0 ? null : toHex(rgba);
  } catch {
    return null;
  }
}

function fillColour(f: Fill | undefined): string | null {
  if (!f) return null;
  return typeof f === 'string' ? colour(f) : colour(f.stops[f.stops.length - 1]!.color);
}

/** The sample value of a binding in its display unit, and where it sits in its range (0 to 1). */
function sample(b: Binding | undefined): { value: number | string | null; frac: number } {
  if (!b) return { value: null, frac: 0.6 };
  const def = getSignal(b.signal);
  const raw = SAMPLE[b.signal];
  if (typeof raw === 'string') return { value: raw, frac: 0.6 };
  const unit = b.unit ?? def?.unit;
  const to = (v: number): number =>
    (def && unit && unit !== def.unit ? convert(v, def.unit, unit) : v) * b.scale + b.offset;
  const lo = b.min ?? (def && typeof def.min === 'number' ? to(def.min) : 0);
  const hi = b.max ?? (def && typeof def.max === 'number' ? to(def.max) : 100);
  const value = typeof raw === 'number' ? to(raw) : lo + (hi - lo) * 0.6;
  const frac = hi === lo ? 0 : Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return { value, frac };
}

function valueText(b: Binding | undefined, format: string | undefined): string {
  const { value } = sample(b);
  if (value === null) return '';
  return typeof value === 'string' ? value : formatNumber(value, format ?? '0');
}

/**
 * The sketch of `theme`. Hidden components, ones that only show on a condition, alerts and
 * pictures are left out; a picture that covers most of the layout leaves a plain panel.
 */
export function themePreview(source: Theme): PreviewPrim[] {
  const theme = resolveTextStyles(source);
  const out: PreviewPrim[] = [];
  const W = theme.layout.width;
  const H = theme.layout.height;
  const hidden = new Set<string>();

  const text = (
    s: string,
    st: TextStyle,
    x: number,
    y: number,
    w: number,
    h: number,
    size = st.size,
  ): void => {
    const c = colour(st.color);
    const str = (st.uppercase ? s.toUpperCase() : s).slice(0, 18);
    if (!c || !str.trim() || size < 14) return;
    const align = st.align === 'center' ? 1 : st.align === 'right' ? 2 : 0;
    const tx = align === 1 ? x + w / 2 : align === 2 ? x + w : x;
    const ty =
      st.baseline === 'top'
        ? y + size * 0.5
        : st.baseline === 'bottom'
          ? y + h - size * 0.5
          : y + h / 2;
    out.push(['t', str, r1(tx), r1(ty), r1(size), c, align, st.weight === 'bold' ? 1 : 0]);
  };

  /** A ring between two layout angles (0 = 3 o'clock, clockwise), in the kit's angles. */
  const ring = (
    cx: number,
    cy: number,
    r: number,
    width: number,
    start: number,
    sweep: number,
    c: string | null,
  ): void => {
    if (!c || width <= 0 || r <= 0 || sweep === 0) return;
    const a = sweep < 0 ? start + sweep : start;
    out.push([
      'a',
      r1(cx),
      r1(cy),
      r1(Math.max(0, r - width)),
      r1(r),
      r1(a + 90),
      r1(a + Math.abs(sweep) + 90),
      c,
    ]);
  };

  for (const f of flattenComponents(theme.components)) {
    const c: Component = f.component;
    if (!c.visible || c.opacity < 0.25 || c.visibleWhen || f.parents.some((p) => hidden.has(p))) {
      hidden.add(c.id);
      continue;
    }
    const x = f.absX;
    const y = f.absY;
    const w = c.width;
    const h = c.height;
    const cx = x + w / 2;
    const cy = y + h / 2;
    switch (c.type) {
      case 'rect': {
        const fill = fillColour(c.props.fill);
        const radius = Math.min(c.props.radius, w / 2, h / 2);
        if (fill) out.push(['r', r1(x), r1(y), r1(w), r1(h), r1(radius), fill]);
        const s = c.props.stroke;
        const sc = s && s.width > 0 ? colour(s.color) : null;
        if (s && sc) out.push(['o', r1(x), r1(y), r1(w), r1(h), r1(radius), r1(s.width), sc]);
        break;
      }
      case 'ellipse': {
        const r = Math.min(w, h) / 2;
        const fill = fillColour(c.props.fill);
        if (fill) out.push(['c', r1(cx), r1(cy), r1(r), fill]);
        const s = c.props.stroke;
        if (s) ring(cx, cy, r, s.width, 0, 360, colour(s.color));
        break;
      }
      case 'line': {
        const sc = colour(c.props.stroke.color);
        if (!sc || c.props.stroke.width <= 0) break;
        const d = c.props.direction;
        const pts =
          d === 'vertical'
            ? [cx, y, cx, y + h]
            : d === 'diagonal'
              ? [x, y, x + w, y + h]
              : d === 'diagonal-flip'
                ? [x, y + h, x + w, y]
                : [x, cy, x + w, cy];
        out.push([
          'l',
          r1(pts[0]!),
          r1(pts[1]!),
          r1(pts[2]!),
          r1(pts[3]!),
          r1(c.props.stroke.width),
          sc,
        ]);
        break;
      }
      case 'arc':
        ring(
          cx,
          cy,
          Math.min(w, h) / 2,
          c.props.stroke.width,
          c.props.startAngle,
          c.props.sweepAngle,
          colour(c.props.stroke.color),
        );
        break;
      case 'text': {
        const p = c.props;
        const v = valueText(c.binding, p.format);
        const s = c.binding
          ? p.text.includes('{value}')
            ? p.text.replace(/\{value\}/g, v).replace(/\{unit\}/g, '')
            : p.text + v
          : p.text;
        if (!p.wrap) text(s.trim(), p.style, x, y, w, h);
        break;
      }
      case 'image':
        if (w * h > W * H * 0.5) out.push(['r', r1(x), r1(y), r1(w), r1(h), 0, '$surface']);
        break;
      case 'gauge.arc': {
        const p = c.props;
        const r = Math.min(w, h) / 2;
        const { frac } = sample(c.binding);
        if (p.track.show)
          ring(cx, cy, r, p.track.width, p.startAngle, p.sweepAngle, colour(p.track.color));
        if (p.fill.show)
          ring(
            cx,
            cy,
            r,
            p.fill.width,
            p.startAngle,
            p.sweepAngle * frac,
            fillColour(p.fill.color),
          );
        if (p.needle.show) {
          const a = ((p.startAngle + p.sweepAngle * frac) * Math.PI) / 180;
          const nc = colour(p.needle.color);
          const len = r * p.needle.length;
          if (nc)
            out.push([
              'l',
              r1(cx),
              r1(cy),
              r1(cx + Math.cos(a) * len),
              r1(cy + Math.sin(a) * len),
              r1(Math.max(3, p.needle.width)),
              nc,
            ]);
        }
        if (p.valueText.show) {
          const size = p.valueText.style.size;
          text(
            valueText(c.binding, p.valueText.format),
            { ...p.valueText.style, align: 'center', baseline: 'middle' },
            cx + p.valueText.offsetX - size * 2,
            cy + p.valueText.offsetY - size / 2,
            size * 4,
            size,
          );
        }
        break;
      }
      case 'gauge.bar': {
        const p = c.props;
        const { frac } = sample(c.binding);
        const tc = p.track.show ? colour(p.track.color) : null;
        const tr = Math.min(p.track.radius, w / 2, h / 2);
        if (tc) out.push(['r', r1(x), r1(y), r1(w), r1(h), r1(tr), tc]);
        const fc = fillColour(p.fill.color);
        if (fc && frac > 0) {
          const horizontal = p.orientation === 'horizontal';
          const fw = horizontal ? w * frac : w;
          const fh = horizontal ? h : h * frac;
          // forward fills from the left, or from the bottom
          const fromStart = horizontal ? p.direction === 'forward' : p.direction !== 'forward';
          const fx = horizontal && !fromStart ? x + w - fw : x;
          const fy = !horizontal && !fromStart ? y + h - fh : y;
          out.push(['r', r1(fx), r1(fy), r1(fw), r1(fh), r1(Math.min(tr, fw / 2, fh / 2)), fc]);
        }
        break;
      }
      case 'value.digital': {
        const p = c.props;
        const bg = fillColour(p.background);
        if (bg) out.push(['r', r1(x), r1(y), r1(w), r1(h), r1(p.radius), bg]);
        text(valueText(c.binding, p.format), p.valueStyle, x, y, w, h);
        break;
      }
      case 'indicator.gear':
        text(valueText(c.binding, undefined) || 'D', c.props.style, x, y, w, h);
        break;
      case 'clock':
        text('10:08', c.props.style, x, y, w, h);
        break;
      case 'indicator.shiftlights': {
        const p = c.props;
        const n = p.count;
        const size = Math.min(h, (w - p.gap * (n - 1)) / n);
        if (size < 4) break;
        const lit = Math.round(n * 0.6);
        const off = colour(p.offColor);
        for (let i = 0; i < n; i++) {
          const on = p.symmetric ? Math.min(i, n - 1 - i) < Math.ceil(lit / 2) : i < lit;
          const lc = on ? colour(p.colors[Math.min(i, p.colors.length - 1)]) : off;
          if (lc) out.push(['c', r1(x + size / 2 + i * (size + p.gap)), r1(cy), r1(size / 2), lc]);
        }
        break;
      }
      default:
        // groups pass their place on to their children; telltales, alerts and status panels
        // light up on what the car does and say little in a still sketch
        break;
    }
  }
  return trim(out);
}

/** How much of the layout a shape covers, to drop the smallest when there are too many. */
function weight(p: PreviewPrim): number {
  switch (p[0]) {
    case 'r':
    case 'o':
      return p[3] * p[4];
    case 'c':
      return p[3] * p[3] * 3;
    case 'a':
      return p[4] * p[4] * 3;
    case 'l':
      return Math.hypot(p[3] - p[1], p[4] - p[2]) * p[5] * 4;
    case 't':
      return p[4] * p[4] * p[1].length * 4;
  }
}

/** At most PREVIEW_MAX shapes, in drawing order: the smallest go first. */
function trim(prims: PreviewPrim[]): PreviewPrim[] {
  if (prims.length <= PREVIEW_MAX) return prims;
  const keep = new Set(
    prims
      .map((p, i) => ({ i, w: weight(p) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, PREVIEW_MAX)
      .map((e) => e.i),
  );
  return prims.filter((_p, i) => keep.has(i));
}
