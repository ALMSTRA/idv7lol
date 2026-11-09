import type { ImageComponent } from '@idv7lol/theme-schema';
import type { ComponentRenderer } from './types.js';

export const imageRenderer: ComponentRenderer<ImageComponent> = {
  type: 'image',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const img = rc.options.images?.get(p.asset);
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
    ctx.drawImage(img.image, dx, dy, dw, dh);
    if (p.tint) {
      const anyCtx = ctx as unknown as { globalCompositeOperation?: string };
      if (anyCtx.globalCompositeOperation !== undefined) {
        const prev = anyCtx.globalCompositeOperation;
        anyCtx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = rc.color(p.tint);
        ctx.fillRect(dx, dy, dw, dh);
        anyCtx.globalCompositeOperation = prev;
      }
    }
    ctx.restore();
  },
  layers: () => 1,
};
