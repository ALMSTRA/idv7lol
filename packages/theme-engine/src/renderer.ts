import type { Component, Theme } from '@idv7lol/theme-schema';
import type { Canvas2DLike } from './canvas.js';
import { AnimationPlayer, applyPropOverrides } from './animation.js';
import { DEG, anchorFraction } from './math.js';
import { effectiveZones } from './bounds.js';
import { RenderContext, type RenderOptions } from './render-context.js';
import { rendererFor } from './components/index.js';
import { EngineState, resolvePalette, selectPaletteId } from './state.js';

export interface RenderStats {
  drawn: number;
  skipped: number;
  paletteId: string;
}

/**
 * The engine instance a host keeps for the lifetime of a running theme:
 * signal state plus animation playback.
 */
export class ThemeEngine {
  readonly state: EngineState;
  readonly anim = new AnimationPlayer();

  constructor(state: EngineState = new EngineState()) {
    this.state = state;
  }

  /** Render one frame at time `now` (ms). */
  render(ctx: Canvas2DLike, theme: Theme, now: number, options: RenderOptions = {}): RenderStats {
    this.state.tick(now);
    return renderTheme(ctx, theme, this.state, this.anim, options);
  }

  reset(now = this.state.now): void {
    this.state.reset(now);
    this.anim.reset();
  }
}

/** Render a theme once with explicit state and animation player. */
export function renderTheme(
  ctx: Canvas2DLike,
  theme: Theme,
  state: EngineState,
  anim: AnimationPlayer,
  options: RenderOptions = {},
): RenderStats {
  const paletteId = selectPaletteId(theme, state);
  const palette = resolvePalette(theme, paletteId);
  const rc = new RenderContext(ctx, theme, palette, state, anim, options);
  const { width, height } = theme.layout;
  const stats: RenderStats = { drawn: 0, skipped: 0, paletteId };

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.fillStyle = rc.fill(theme.layout.background, { x: 0, y: 0, w: width, h: height });
  ctx.fillRect(0, 0, width, height);

  for (const c of theme.components) drawComponent(rc, c, stats);

  if (options.showReservedZones) drawReservedZones(rc);
  ctx.restore();
  return stats;
}

export function drawComponent(rc: RenderContext, c: Component, stats: RenderStats): void {
  const { ctx } = rc;
  if (!c.visible || (c.visibleWhen && !rc.state.condition(c.visibleWhen))) {
    stats.skipped += 1;
    return;
  }
  const ov = rc.anim.evaluate(c, rc.theme, rc.state);
  const x = ov.x ?? c.x;
  const y = ov.y ?? c.y;
  const w = ov.width ?? c.width;
  const h = ov.height ?? c.height;
  const rotation = ov.rotation ?? c.rotation;
  const opacity = (ov.opacity ?? c.opacity) * 1;
  const scale = ov.scale ?? 1;
  if (opacity <= 0 || w <= 0 || h <= 0) {
    stats.skipped += 1;
    return;
  }
  const comp = Object.keys(ov.props).length
    ? ({
        ...c,
        props: applyPropOverrides(c.props as Record<string, unknown>, ov.props),
      } as Component)
    : c;

  const { fx, fy } = anchorFraction(c.anchor);
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * opacity;
  ctx.translate(x + fx * w, y + fy * h);
  if (rotation !== 0) ctx.rotate(rotation * DEG);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.translate(-fx * w, -fy * h);

  if (comp.type === 'group') {
    if (comp.props.clip) {
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
    }
    for (const child of comp.props.children) drawComponent(rc, child, stats);
  } else {
    const r = rendererFor(comp.type);
    if (r) {
      r.draw(rc, comp, w, h);
      stats.drawn += 1;
    }
  }

  if (rc.options.showBounds) {
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Hatch the reserved zones of the layout so authors see where factory content lands. */
export function drawReservedZones(rc: RenderContext): void {
  drawZones(rc.ctx, rc.theme);
}

/** The same hatching, for hosts that draw the layout some other way. */
export function drawZones(ctx: Canvas2DLike, theme: Theme): void {
  for (const z of effectiveZones(theme)) {
    const color =
      z.kind === 'keep-clear' ? '255, 60, 60' : z.kind === 'info' ? '80, 160, 255' : '255, 170, 0';
    ctx.save();
    ctx.beginPath();
    if (z.polygon) {
      z.polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    } else {
      ctx.rect(z.x, z.y, z.width, z.height);
    }
    ctx.fillStyle = `rgba(${color}, 0.12)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${color}, 0.8)`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = `rgba(${color}, 0.95)`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(z.name, z.x + 6, z.y + 4);
    ctx.restore();
  }
}

export { EngineState, AnimationPlayer };
