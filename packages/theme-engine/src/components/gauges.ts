import type { ArcGaugeComponent, BarGaugeComponent, Binding } from '@idv7lol/theme-schema';
import { unitSymbol } from '@idv7lol/vehicle-signals';
import { DEG, clamp, normalize, polar } from '../math.js';
import { formatNumber } from '../format.js';
import type { RenderContext } from '../render-context.js';
import type { EvaluatedBinding } from '../state.js';
import type { ComponentRenderer } from './types.js';

/** Fallback range when a gauge has no binding: 0..100. */
function rangeOf(eb: EvaluatedBinding | undefined): { min: number; max: number } {
  return eb ? { min: eb.min, max: eb.max } : { min: 0, max: 100 };
}

function gaugeValue(
  rc: RenderContext,
  eb: EvaluatedBinding | undefined,
  binding: Binding | undefined,
): number | undefined {
  if (!eb || !binding) return undefined;
  const live = eb.valid && !eb.stale;
  if (live) return eb.value;
  switch (binding.fallback) {
    case 'last':
      return eb.sample ? eb.value : undefined;
    case 'zero':
      return eb.min;
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Arc gauge                                                                  */
/* -------------------------------------------------------------------------- */

export const arcGaugeRenderer: ComponentRenderer<ArcGaugeComponent> = {
  type: 'gauge.arc',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const eb = rc.binding(c);
    const { min, max } = rangeOf(eb);
    const value = gaugeValue(rc, eb, c.binding);
    const norm = value === undefined ? 0 : normalize(value, min, max);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2;
    const start = p.startAngle;
    const sweep = p.sweepAngle;
    const angleAt = (n: number) => start + sweep * clamp(n, 0, 1);
    const ccw = sweep < 0;

    // Radii, from the outside in.
    let outer = R;
    if (p.redline.show && p.redline.placement === 'outer') {
      const rr = outer - p.redline.width / 2;
      const from = normalize(p.redline.from, min, max);
      if (from < 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, rr, angleAt(from) * DEG, angleAt(1) * DEG, ccw);
        ctx.strokeStyle = rc.color(p.redline.color);
        ctx.lineWidth = p.redline.width;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
      outer -= p.redline.width + 4;
    }
    const trackWidth = p.track.show ? p.track.width : 0;
    const bandWidth = Math.max(trackWidth, p.fill.show ? p.fill.width : 0);
    const bandRadius = outer - bandWidth / 2;

    if (p.track.show && trackWidth > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, bandRadius, start * DEG, (start + sweep) * DEG, ccw);
      ctx.strokeStyle = rc.color(p.track.color);
      ctx.lineWidth = trackWidth;
      ctx.lineCap = p.track.cap;
      ctx.stroke();
    }

    if (p.redline.show && p.redline.placement === 'track') {
      const from = normalize(p.redline.from, min, max);
      if (from < 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, bandRadius, angleAt(from) * DEG, angleAt(1) * DEG, ccw);
        ctx.strokeStyle = rc.color(p.redline.color);
        ctx.lineWidth = Math.max(trackWidth, p.redline.width);
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    }

    if (p.fill.show && value !== undefined && norm > 0) {
      const box = { x: cx - bandRadius, y: cy - bandRadius, w: bandRadius * 2, h: bandRadius * 2 };
      const baseFill =
        typeof p.fill.color === 'string' ? rc.color(p.fill.color) : rc.fill(p.fill.color, box);
      const zoneFill =
        typeof p.fill.color === 'string'
          ? rc.zoneColor(p.fill.zones, value, baseFill as string)
          : baseFill;
      if (p.glow.show) rc.shadow(p.glow.color, p.glow.blur);
      ctx.strokeStyle = zoneFill;
      ctx.lineWidth = p.fill.width;
      ctx.lineCap = p.fill.cap;
      if (p.fill.mode === 'solid') {
        ctx.beginPath();
        ctx.arc(cx, cy, bandRadius, start * DEG, angleAt(norm) * DEG, ccw);
        ctx.stroke();
      } else {
        const n = p.fill.segments;
        const gap = p.fill.segmentGap;
        const segSweep = sweep / n;
        const lit = Math.round(norm * n);
        ctx.lineCap = 'butt';
        for (let i = 0; i < lit; i++) {
          const a0 = start + segSweep * i + Math.sign(sweep) * (gap / 2);
          const a1 = start + segSweep * (i + 1) - Math.sign(sweep) * (gap / 2);
          const segValue = min + ((i + 0.5) / n) * (max - min);
          ctx.strokeStyle =
            typeof p.fill.color === 'string'
              ? rc.zoneColor(p.fill.zones, segValue, baseFill as string)
              : baseFill;
          ctx.beginPath();
          ctx.arc(cx, cy, bandRadius, a0 * DEG, a1 * DEG, ccw);
          ctx.stroke();
        }
      }
      if (p.glow.show) rc.shadow(undefined);
    }

    // Ticks
    const tickOuter = outer - bandWidth - p.ticks.inset - 4;
    if (p.ticks.major > 0 && tickOuter > 0) {
      const redFrom = p.redline.show ? normalize(p.redline.from, min, max) : 2;
      const majorColor = rc.color(p.ticks.color);
      const minorColor = rc.color(p.ticks.minorColor ?? p.ticks.color);
      const redColor = p.ticks.redlineColor ? rc.color(p.ticks.redlineColor) : undefined;
      const total = p.ticks.major * (p.ticks.minor + 1);
      for (let i = 0; i <= total; i++) {
        const n = i / total;
        const isMajor = i % (p.ticks.minor + 1) === 0;
        const len = isMajor ? p.ticks.majorLength : p.ticks.minorLength;
        const width = isMajor ? p.ticks.majorWidth : p.ticks.minorWidth;
        if (len <= 0 || width <= 0) continue;
        const a = angleAt(n);
        const p0 = polar(cx, cy, tickOuter, a);
        const p1 = polar(cx, cy, tickOuter - len, a);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.strokeStyle = redColor && n >= redFrom ? redColor : isMajor ? majorColor : minorColor;
        ctx.lineWidth = width;
        ctx.lineCap = 'butt';
        ctx.stroke();
      }
    }

    // Labels
    if (p.labels.show && p.ticks.major > 0) {
      const r = tickOuter - p.ticks.majorLength - p.labels.inset;
      const style = { ...p.labels.style, align: 'center' as const, baseline: 'middle' as const };
      for (let i = 0; i <= p.ticks.major; i += p.labels.every) {
        const n = i / p.ticks.major;
        const v = (min + (max - min) * n) / p.labels.divisor;
        const pt = polar(cx, cy, r, angleAt(n));
        rc.text(formatNumber(v, p.labels.format), pt.x, pt.y, style);
      }
    }

    // Value text
    if (p.valueText.show && c.binding && eb) {
      const d = rc.display(eb, c.binding, p.valueText.format);
      if (d.show) {
        const vx = cx + p.valueText.offsetX;
        const vy = cy + p.valueText.offsetY;
        const style = {
          ...p.valueText.style,
          align: 'center' as const,
          baseline: 'middle' as const,
        };
        rc.text(d.text, vx, vy, style);
        if (p.valueText.showUnit) {
          const unit = unitSymbol(p.valueText.unit ?? eb.unit);
          if (unit) {
            const us = {
              ...p.valueText.unitStyle,
              align: 'center' as const,
              baseline: 'middle' as const,
            };
            rc.text(unit, vx, vy + style.size * 0.75, us);
          }
        }
      }
    }

    // Needle
    if (p.needle.show && value !== undefined) {
      const a = angleAt(norm);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a * DEG);
      const len = p.needle.length * R;
      const tail = p.needle.tail * R;
      const hw = p.needle.width / 2;
      if (p.needle.shadow)
        rc.shadow(
          p.needle.shadow.color,
          p.needle.shadow.blur,
          p.needle.shadow.offsetX,
          p.needle.shadow.offsetY,
        );
      ctx.fillStyle = rc.color(p.needle.color);
      ctx.beginPath();
      if (p.needle.shape === 'bar') {
        ctx.rect(-tail, -hw, len + tail, hw * 2);
      } else if (p.needle.shape === 'arrow') {
        ctx.moveTo(-tail, -hw);
        ctx.lineTo(len * 0.8, -hw * 1.6);
        ctx.lineTo(len, 0);
        ctx.lineTo(len * 0.8, hw * 1.6);
        ctx.lineTo(-tail, hw);
        ctx.closePath();
      } else {
        ctx.moveTo(-tail, -hw);
        ctx.lineTo(len, -0.5);
        ctx.lineTo(len, 0.5);
        ctx.lineTo(-tail, hw);
        ctx.closePath();
      }
      ctx.fill();
      rc.shadow(undefined);
      ctx.restore();
      if (p.needle.cap.show && p.needle.cap.radius > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, p.needle.cap.radius, 0, Math.PI * 2);
        ctx.fillStyle = rc.color(p.needle.cap.color);
        ctx.fill();
      }
    }
  },
  layers(c) {
    const p = c.props;
    let n = 1; // track + fill + redline in one shader
    if (p.ticks.major > 0) n += 1;
    if (p.labels.show && p.ticks.major > 0) n += Math.ceil((p.ticks.major + 1) / 8);
    if (p.needle.show) n += 1;
    if (p.valueText.show) n += p.valueText.showUnit ? 2 : 1;
    return n;
  },
};

/* -------------------------------------------------------------------------- */
/* Bar gauge                                                                  */
/* -------------------------------------------------------------------------- */

export const barGaugeRenderer: ComponentRenderer<BarGaugeComponent> = {
  type: 'gauge.bar',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const eb = rc.binding(c);
    const { min, max } = rangeOf(eb);
    const value = gaugeValue(rc, eb, c.binding);
    const norm = value === undefined ? 0 : normalize(value, min, max);
    const horizontal = p.orientation === 'horizontal';
    const box = { x: 0, y: 0, w, h };

    if (p.track.show) {
      rc.roundRectPath(0, 0, w, h, p.track.radius);
      ctx.fillStyle = rc.color(p.track.color);
      ctx.fill();
      if (p.track.stroke && p.track.stroke.width > 0) rc.stroke(p.track.stroke);
    }

    const baseFill =
      typeof p.fill.color === 'string' ? rc.color(p.fill.color) : rc.fill(p.fill.color, box);
    const fillFor = (v: number) =>
      typeof p.fill.color === 'string'
        ? rc.zoneColor(p.fill.zones, v, baseFill as string)
        : baseFill;

    // Rect for a fill fraction range [a, b] of the bar.
    const span = (a: number, b: number): { x: number; y: number; w: number; h: number } => {
      if (horizontal) {
        const x0 = p.direction === 'forward' ? a * w : w - b * w;
        return { x: x0, y: 0, w: (b - a) * w, h };
      }
      const y0 = p.direction === 'forward' ? h - b * h : a * h;
      return { x: 0, y: y0, w, h: (b - a) * h };
    };

    if (value !== undefined && norm > 0) {
      if (p.glow.show) rc.shadow(p.glow.color, p.glow.blur);
      if (p.fill.mode === 'solid') {
        const r = span(0, norm);
        rc.roundRectPath(r.x, r.y, r.w, r.h, p.fill.radius);
        ctx.fillStyle = fillFor(value);
        ctx.fill();
      } else {
        const n = p.fill.segments;
        const lit = Math.round(norm * n);
        const gapFrac = horizontal ? p.fill.segmentGap / w : p.fill.segmentGap / h;
        for (let i = 0; i < lit; i++) {
          const a = i / n + gapFrac / 2;
          const b = (i + 1) / n - gapFrac / 2;
          if (b <= a) continue;
          const r = span(a, b);
          rc.roundRectPath(r.x, r.y, r.w, r.h, Math.min(p.fill.radius, 3));
          ctx.fillStyle = fillFor(min + ((i + 0.5) / n) * (max - min));
          ctx.fill();
        }
      }
      if (p.glow.show) rc.shadow(undefined);
    }

    if (p.ticks.show) {
      ctx.strokeStyle = rc.color(p.ticks.color);
      ctx.lineWidth = p.ticks.width;
      for (let i = 0; i < p.ticks.count; i++) {
        const n = i / (p.ticks.count - 1);
        const pos = horizontal
          ? p.direction === 'forward'
            ? n * w
            : w - n * w
          : p.direction === 'forward'
            ? h - n * h
            : n * h;
        const sides: Array<'before' | 'after'> =
          p.ticks.side === 'both' ? ['before', 'after'] : [p.ticks.side];
        for (const side of sides) {
          ctx.beginPath();
          if (horizontal) {
            const y0 = side === 'before' ? 0 : h;
            const y1 = side === 'before' ? -p.ticks.length : h + p.ticks.length;
            ctx.moveTo(pos, y0);
            ctx.lineTo(pos, y1);
          } else {
            const x0 = side === 'before' ? 0 : w;
            const x1 = side === 'before' ? -p.ticks.length : w + p.ticks.length;
            ctx.moveTo(x0, pos);
            ctx.lineTo(x1, pos);
          }
          ctx.stroke();
        }
      }
    }

    if (p.labels.show) {
      const count = p.ticks.show ? p.ticks.count : 2;
      for (let i = 0; i < count; i++) {
        const n = i / (count - 1);
        const v = (min + (max - min) * n) / p.labels.divisor;
        const pos = horizontal
          ? p.direction === 'forward'
            ? n * w
            : w - n * w
          : p.direction === 'forward'
            ? h - n * h
            : n * h;
        const style = { ...p.labels.style, align: 'center' as const, baseline: 'middle' as const };
        if (horizontal) rc.text(formatNumber(v, p.labels.format), pos, h + p.labels.offset, style);
        else
          rc.text(formatNumber(v, p.labels.format), w + p.labels.offset, pos, {
            ...style,
            align: 'left',
          });
      }
    }

    if (p.marker.show) {
      const n = normalize(p.marker.value, min, max);
      const pos = horizontal
        ? p.direction === 'forward'
          ? n * w
          : w - n * w
        : p.direction === 'forward'
          ? h - n * h
          : n * h;
      ctx.fillStyle = rc.color(p.marker.color);
      if (horizontal) ctx.fillRect(pos - p.marker.width / 2, -2, p.marker.width, h + 4);
      else ctx.fillRect(-2, pos - p.marker.width / 2, w + 4, p.marker.width);
    }
  },
  layers(c) {
    let n = 1;
    if (c.props.ticks.show) n += 1;
    if (c.props.labels.show) n += 1;
    return n;
  },
};
