import type { ClockComponent, TextComponent, TextStyle } from '@idv7lol/theme-schema';
import { unitSymbol } from '@idv7lol/vehicle-signals';
import { formatClock } from '../format.js';
import type { RenderContext } from '../render-context.js';
import type { ComponentRenderer } from './types.js';

/** Where to put text inside a box for a style's alignment settings. */
export function textOrigin(style: TextStyle, w: number, h: number): { x: number; y: number } {
  const x = style.align === 'left' ? 0 : style.align === 'right' ? w : w / 2;
  let y: number;
  switch (style.baseline) {
    case 'top':
      y = 0;
      break;
    case 'bottom':
      y = h;
      break;
    case 'middle':
      y = h / 2;
      break;
    case 'alphabetic':
    default:
      // Approximate: baseline sits at about 80% of the em height when centred.
      y = h / 2 + style.size * 0.35;
      break;
  }
  return { x, y };
}

/** Greedy word wrap using the context's measureText. */
export function wrapText(
  rc: RenderContext,
  text: string,
  style: TextStyle,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && rc.measure(candidate, style) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Resolve the text a text component shows: template, bound value and unit. */
export function resolveText(rc: RenderContext, c: TextComponent): { text: string; show: boolean } {
  const p = c.props;
  if (!c.binding) return { text: p.text, show: true };
  const eb = rc.binding(c)!;
  const d = rc.display(eb, c.binding, p.format);
  if (!d.show) return { text: '', show: false };
  const unit = unitSymbol(eb.unit);
  let out = p.text;
  if (out.includes('{value}') || out.includes('{unit}')) {
    out = out.replace(/\{value\}/g, d.text).replace(/\{unit\}/g, unit);
  } else {
    out = out ? `${out}${d.text}` : d.text;
  }
  return { text: out, show: true };
}

export const textRenderer: ComponentRenderer<TextComponent> = {
  type: 'text',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const { text, show } = resolveText(rc, c);
    if (!show || text === '') return;
    if (p.clip) {
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
    }
    const style = p.style;
    if (p.wrap) {
      const lines = wrapText(rc, text, style, w);
      const lh = style.size * p.lineHeight;
      const total = lh * lines.length;
      const o = textOrigin(style, w, h);
      const startY =
        style.baseline === 'top' ? 0 : style.baseline === 'bottom' ? h - total : (h - total) / 2;
      lines.forEach((line, i) => {
        const y =
          style.baseline === 'top'
            ? startY + i * lh
            : style.baseline === 'bottom'
              ? startY + i * lh + lh
              : startY + i * lh + lh / 2;
        const baseline: TextStyle['baseline'] =
          style.baseline === 'alphabetic' ? 'middle' : style.baseline;
        rc.text(line, o.x, y, { ...style, baseline });
      });
      return;
    }
    const o = textOrigin(style, w, h);
    rc.text(text, o.x, o.y, style);
  },
  layers: (c) => Math.max(1, Math.ceil(Math.max(1, c.props.text.length || 8) / 32)),
};

export const clockRenderer: ComponentRenderer<ClockComponent> = {
  type: 'clock',
  draw(rc, c, w, h) {
    const p = c.props;
    const bus = rc.state.bus;
    let hours: number;
    let minutes: number;
    let seconds: number;
    if (
      bus.isFresh('time.hours', 120_000, rc.now) &&
      bus.isFresh('time.minutes', 120_000, rc.now)
    ) {
      hours = bus.number('time.hours');
      minutes = bus.number('time.minutes');
      seconds = bus.number('time.seconds');
    } else {
      const d = (rc.options.wallClock ?? (() => new Date()))();
      hours = d.getHours();
      minutes = d.getMinutes();
      seconds = d.getSeconds();
    }
    const colon = p.blinkColon ? Math.floor(rc.now / 500) % 2 === 0 : true;
    const text = formatClock(hours, minutes, seconds, {
      format: p.format,
      showSeconds: p.showSeconds,
      showSuffix: p.showSuffix,
      colon,
    });
    const o = textOrigin(p.style, w, h);
    rc.text(text, o.x, o.y, p.style);
  },
  layers: () => 1,
};
