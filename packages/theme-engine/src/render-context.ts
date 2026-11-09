import type {
  Binding,
  Color,
  Component,
  Fill,
  Font,
  Palette,
  TextStyle,
  Theme,
  Zone,
} from '@idv7lol/theme-schema';
import type { Canvas2DLike, GradientLike, ImageResolver } from './canvas.js';
import { resolveColor } from './color.js';
import { DEG } from './math.js';
import type { AnimationPlayer } from './animation.js';
import type { EngineState, EvaluatedBinding } from './state.js';
import { formatDash, formatNumber } from './format.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FontFamilyId = Font['family'];

/** Default CSS font stacks for the logical families. The Studio bundles the first one of each. */
export const DEFAULT_FONT_STACKS: Readonly<Record<FontFamilyId, string>> = {
  sans: '"Barlow Semi Condensed", "Inter", "Segoe UI", system-ui, sans-serif',
  'sans-condensed': '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", sans-serif',
  mono: '"JetBrains Mono", "Cascadia Mono", Consolas, "Roboto Mono", monospace',
  display: '"Barlow", "Segoe UI", system-ui, sans-serif',
};

const WEIGHTS: Record<TextStyle['weight'], number> = {
  light: 300,
  regular: 400,
  medium: 500,
  bold: 700,
};

export interface RenderOptions {
  images?: ImageResolver;
  /** Overlay the display profile's reserved zones. */
  showReservedZones?: boolean;
  /** Clock source for the clock component when the bus has no time signals. */
  wallClock?: () => Date;
  fontFamilies?: Partial<Record<FontFamilyId, string>>;
  /** Draw a thin outline around every component box (Studio debug). */
  showBounds?: boolean;
}

/** What a readout should show for a binding right now. */
export interface DisplayValue {
  show: boolean;
  /** Numeric value to draw, when there is one. */
  value: number | undefined;
  /** Text to draw (formatted number, dash placeholder or enum text). */
  text: string;
}

/**
 * Per-frame helper passed to component renderers: resolves colours, fills
 * and fonts against the active palette and caches binding evaluations.
 */
export class RenderContext {
  private readonly bindingCache = new Map<string, EvaluatedBinding>();

  constructor(
    readonly ctx: Canvas2DLike,
    readonly theme: Theme,
    readonly palette: Palette,
    readonly state: EngineState,
    readonly anim: AnimationPlayer,
    readonly options: RenderOptions = {},
  ) {}

  get now(): number {
    return this.state.now;
  }

  color(c: Color): string {
    return resolveColor(c, this.palette);
  }

  /** A fill style for a colour or gradient relative to a box in the current coordinate space. */
  fill(f: Fill, box: Box): string | GradientLike {
    if (typeof f === 'string') return this.color(f);
    const { ctx } = this;
    let g: GradientLike | undefined;
    if (f.type === 'linear') {
      const a = f.angle * DEG;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const half = (Math.abs(Math.cos(a)) * box.w + Math.abs(Math.sin(a)) * box.h) / 2;
      const dx = Math.cos(a) * half;
      const dy = Math.sin(a) * half;
      g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    } else if (f.type === 'radial') {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(box.w, box.h) / 2);
    } else if (ctx.createConicGradient) {
      g = ctx.createConicGradient((f.angle - 90) * DEG, box.x + box.w / 2, box.y + box.h / 2);
    }
    if (!g) return this.color(f.stops[0]!.color);
    for (const s of f.stops) g.addColorStop(s.offset, this.color(s.color));
    return g;
  }

  font(style: TextStyle): string {
    const fontDef = this.theme.fonts[style.font] ?? this.theme.fonts['default'];
    const family: FontFamilyId = fontDef?.family ?? 'sans';
    const stack = this.options.fontFamilies?.[family] ?? DEFAULT_FONT_STACKS[family];
    return `${WEIGHTS[style.weight]} ${style.size}px ${stack}`;
  }

  /** Apply a text style to the context (font, colour, alignment, spacing). */
  applyTextStyle(style: TextStyle, colorOverride?: string): void {
    const { ctx } = this;
    ctx.font = this.font(style);
    ctx.fillStyle = colorOverride ?? this.color(style.color);
    ctx.textAlign = style.align;
    ctx.textBaseline = style.baseline;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${style.letterSpacing}px`;
  }

  /** Draw text with a style at (x, y); applies uppercase and returns the drawn string. */
  text(
    text: string,
    x: number,
    y: number,
    style: TextStyle,
    colorOverride?: string,
    maxWidth?: number,
  ): string {
    const t = style.uppercase ? text.toUpperCase() : text;
    this.applyTextStyle(style, colorOverride);
    this.ctx.fillText(t, x, y, maxWidth);
    return t;
  }

  measure(text: string, style: TextStyle): number {
    this.ctx.font = this.font(style);
    if ('letterSpacing' in this.ctx) this.ctx.letterSpacing = `${style.letterSpacing}px`;
    const t = style.uppercase ? text.toUpperCase() : text;
    return this.ctx.measureText(t).width;
  }

  /** Evaluate (and cache for this frame) a component's binding. */
  binding(component: Component): EvaluatedBinding | undefined {
    if (!component.binding) return undefined;
    return this.bindingFor(component.id, component.binding);
  }

  bindingFor(key: string, binding: Binding): EvaluatedBinding {
    const cached = this.bindingCache.get(key);
    if (cached) return cached;
    const eb = this.state.evaluate(key, binding);
    this.bindingCache.set(key, eb);
    return eb;
  }

  /** Decide what a readout shows, honouring the binding's fallback. */
  display(eb: EvaluatedBinding, binding: Binding, format: string): DisplayValue {
    const live = eb.valid && !eb.stale;
    if (live) {
      if (eb.text !== undefined && !Number.isFinite(Number(eb.text))) {
        return { show: true, value: undefined, text: eb.text };
      }
      return { show: true, value: eb.value, text: formatNumber(eb.value, format) };
    }
    switch (binding.fallback) {
      case 'hide':
        return { show: false, value: undefined, text: '' };
      case 'zero':
        return { show: true, value: 0, text: formatNumber(0, format) };
      case 'last':
        if (eb.sample)
          return { show: true, value: eb.value, text: eb.text ?? formatNumber(eb.value, format) };
        return { show: true, value: undefined, text: formatDash(format) };
      case 'dash':
      default:
        return { show: true, value: undefined, text: formatDash(format) };
    }
  }

  /** Colour of the zone containing `value`, or `fallback`. */
  zoneColor(zones: readonly Zone[], value: number | undefined, fallback: string): string {
    if (value === undefined) return fallback;
    for (const z of zones) {
      if (value >= z.from && value < z.to) return this.color(z.color);
    }
    return fallback;
  }

  /** Path for a rounded rectangle in the current coordinate space. */
  roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
    const { ctx } = this;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (rr === 0) {
      ctx.rect(x, y, w, h);
      return;
    }
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
    ctx.lineTo(x + rr, y + h);
    ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + rr);
    ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  shadow(color: Color | undefined, blur = 0, ox = 0, oy = 0): void {
    const { ctx } = this;
    if (!color) {
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      return;
    }
    ctx.shadowColor = this.color(color);
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = ox;
    ctx.shadowOffsetY = oy;
  }

  stroke(stroke: {
    color: Color;
    width: number;
    cap: 'butt' | 'round' | 'square';
    dash?: number[];
  }): void {
    const { ctx } = this;
    ctx.strokeStyle = this.color(stroke.color);
    ctx.lineWidth = stroke.width;
    ctx.lineCap = stroke.cap;
    ctx.setLineDash(stroke.dash ?? []);
    ctx.stroke();
    if (stroke.dash) ctx.setLineDash([]);
  }
}
