import type { Binding, ImageComponent } from '@idv7lol/theme-schema';
import { frameAt, playbackSpeed } from '../image-edits.js';
import type { RenderContext } from '../render-context.js';
import type { ComponentRenderer } from './types.js';

/**
 * Where each speed-tied animation is in its loop, by component id. Its speed changes while it
 * plays, so the frame comes from time played at each speed, not from the clock.
 */
const played = new Map<string, { at: number; t: number }>();

function animationTime(rc: RenderContext, c: ImageComponent): number {
  const p = c.props;
  if (!p.speedFrom) return rc.now;
  const binding: Binding = {
    signal: p.speedFrom.signal,
    scale: 1,
    offset: 0,
    clamp: false,
    smoothing: 0,
    fallback: 'dash',
  };
  const eb = rc.bindingFor(`${c.id}#speedFrom`, binding);
  const live = eb.valid && !eb.stale ? eb.value : undefined;
  const speed = playbackSpeed(p.speed, p.speedFrom, live);
  const s = played.get(c.id);
  // A jump back or a long gap (scrubbing, a paused simulator) starts over from the clock.
  if (!s || rc.now < s.at || rc.now - s.at > 1000) {
    const fresh = { at: rc.now, t: rc.now * speed };
    played.set(c.id, fresh);
    return fresh.t;
  }
  s.t += (rc.now - s.at) * speed;
  s.at = rc.now;
  return s.t;
}

export const imageRenderer: ComponentRenderer<ImageComponent> = {
  type: 'image',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const animation = rc.theme.assets[p.asset]?.animation;
    const frame = animation
      ? frameAt(animation, animationTime(rc, c), p.speedFrom ? 1 : p.speed)
      : undefined;
    const img = rc.options.images?.get(p.asset, p.edits, (color) => rc.color(color), frame);
    if (!img) {
      // Placeholder: dashed box with a cross, so a missing asset is obvious.
      ctx.beginPath();
      ctx.rect(0.5, 0.5, w - 1, h - 1);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = rc.color('$text-muted');
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.moveTo(w, 0);
      ctx.lineTo(0, h);
      ctx.stroke();
      return;
    }
    let dw = w;
    let dh = h;
    let dx = 0;
    let dy = 0;
    if (p.fit !== 'stretch' && img.width > 0 && img.height > 0) {
      const sx = w / img.width;
      const sy = h / img.height;
      const s = p.fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
      dw = img.width * s;
      dh = img.height * s;
      dx = (w - dw) / 2;
      dy = (h - dh) / 2;
    }
    ctx.save();
    if (p.fit === 'cover') {
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
    }
    if (img.crop) {
      const r = img.crop;
      ctx.drawImage(img.image, r.x, r.y, r.w, r.h, dx, dy, dw, dh);
    } else {
      ctx.drawImage(img.image, dx, dy, dw, dh);
    }
    ctx.restore();
  },
  layers: () => 1,
};
