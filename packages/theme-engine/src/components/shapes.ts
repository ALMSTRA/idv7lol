import type {
  ArcComponent,
  EllipseComponent,
  LineComponent,
  RectComponent,
} from '@idv7lol/theme-schema';
import { DEG } from '../math.js';
import type { ComponentRenderer } from './types.js';

export const rectRenderer: ComponentRenderer<RectComponent> = {
  type: 'rect',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    rc.roundRectPath(0, 0, w, h, p.radius);
    if (p.fill) {
      if (p.shadow) rc.shadow(p.shadow.color, p.shadow.blur, p.shadow.offsetX, p.shadow.offsetY);
      ctx.fillStyle = rc.fill(p.fill, { x: 0, y: 0, w, h });
      ctx.fill();
      if (p.shadow) rc.shadow(undefined);
    }
    if (p.stroke && p.stroke.width > 0) rc.stroke(p.stroke);
  },
  layers: () => 1,
};

export const ellipseRenderer: ComponentRenderer<EllipseComponent> = {
  type: 'ellipse',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (p.fill) {
      if (p.shadow) rc.shadow(p.shadow.color, p.shadow.blur, p.shadow.offsetX, p.shadow.offsetY);
      ctx.fillStyle = rc.fill(p.fill, { x: 0, y: 0, w, h });
      ctx.fill();
      if (p.shadow) rc.shadow(undefined);
    }
    if (p.stroke && p.stroke.width > 0) rc.stroke(p.stroke);
  },
  layers: () => 1,
};

export const lineRenderer: ComponentRenderer<LineComponent> = {
  type: 'line',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    ctx.beginPath();
    switch (c.props.direction) {
      case 'horizontal':
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        break;
      case 'vertical':
        ctx.moveTo(w / 2, 0);
        ctx.lineTo(w / 2, h);
        break;
      case 'diagonal':
        ctx.moveTo(0, 0);
        ctx.lineTo(w, h);
        break;
      case 'diagonal-flip':
        ctx.moveTo(0, h);
        ctx.lineTo(w, 0);
        break;
    }
    rc.stroke(c.props.stroke);
  },
  layers: () => 1,
};

export const arcRenderer: ComponentRenderer<ArcComponent> = {
  type: 'arc',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const cx = w / 2;
    const cy = h / 2;
    const rx = Math.max(0, w / 2 - p.stroke.width / 2);
    const ry = Math.max(0, h / 2 - p.stroke.width / 2);
    const start = p.startAngle * DEG;
    const end = (p.startAngle + p.sweepAngle) * DEG;
    const ccw = p.sweepAngle < 0;
    if (p.fill) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.ellipse(cx, cy, rx, ry, 0, start, end, ccw);
      ctx.closePath();
      ctx.fillStyle = rc.fill(p.fill, { x: 0, y: 0, w, h });
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, start, end, ccw);
    rc.stroke(p.stroke);
  },
  layers: () => 1,
};
