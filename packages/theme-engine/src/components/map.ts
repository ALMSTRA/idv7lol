import { MAP_PICTURE_SIZE, type MapComponent } from '@idv7lol/theme-schema';
import type { ComponentRenderer } from './types.js';

/** Streets of the sample map, as fractions of the window: [x0, y0, x1, y1, width]. */
const STREETS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-0.05, 0.22, 1.05, 0.34, 0.03],
  [-0.05, 0.71, 1.05, 0.6, 0.045],
  [0.18, -0.05, 0.3, 1.05, 0.03],
  [0.62, -0.05, 0.52, 1.05, 0.045],
  [0.86, -0.05, 0.93, 1.05, 0.02],
  [0.3, 0.45, 0.56, 0.47, 0.018],
  [0.57, 0.86, 1.05, 0.9, 0.018],
];
/** The route drawn over them, up the middle street and off to the right. */
const ROUTE: ReadonlyArray<readonly [number, number]> = [
  [0.535, 1.05],
  [0.565, 0.655],
  [0.6, 0.3],
  [1.05, 0.345],
];

/**
 * The map window. The car puts another app's live map here; the Studio has none, so it draws a
 * sample of streets with a route, which says "a map goes here" without being one.
 */
export const mapRenderer: ComponentRenderer<MapComponent> = {
  type: 'map',
  draw(rc, c, w, h) {
    const { ctx } = rc;
    const p = c.props;
    const r = Math.min(p.radius, w / 2, h / 2);
    const whole = { w, h };
    ctx.save();
    rc.roundRectPath(0, 0, w, h, r);
    ctx.clip();
    ctx.fillStyle = rc.color(p.fill);
    ctx.fillRect(0, 0, w, h);
    if (p.fit === 'contain') {
      // all of the map, as large as fits: the sample goes in that part, the fill stays around
      const k = Math.min(w / MAP_PICTURE_SIZE.width, h / MAP_PICTURE_SIZE.height);
      const mw = MAP_PICTURE_SIZE.width * k;
      const mh = MAP_PICTURE_SIZE.height * k;
      ctx.translate((w - mw) / 2, (h - mh) / 2);
      ctx.beginPath();
      ctx.rect(0, 0, mw, mh);
      ctx.clip();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 0, mw, mh);
      w = mw;
      h = mh;
    }
    const unit = Math.min(w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    for (const [x0, y0, x1, y1, lw] of STREETS) {
      ctx.lineWidth = Math.max(1, lw * unit);
      ctx.beginPath();
      ctx.moveTo(x0 * w, y0 * h);
      ctx.lineTo(x1 * w, y1 * h);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3d8bfd';
    ctx.lineWidth = Math.max(2, 0.035 * unit);
    ctx.beginPath();
    ROUTE.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.stroke();
    // where the car is: an arrow on the route
    const ax = 0.558 * w;
    const ay = 0.74 * h;
    const s = Math.max(5, 0.06 * unit);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(ax, ay - s);
    ctx.lineTo(ax + s * 0.75, ay + s * 0.8);
    ctx.lineTo(ax, ay + s * 0.4);
    ctx.lineTo(ax - s * 0.75, ay + s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    w = whole.w;
    h = whole.h;
    if (p.stroke && p.stroke.width > 0) {
      // inside the window, as the car draws it
      const half = p.stroke.width / 2;
      rc.roundRectPath(half, half, w - p.stroke.width, h - p.stroke.width, Math.max(0, r - half));
      rc.stroke(p.stroke);
    }
  },
  layers: () => 1,
};
