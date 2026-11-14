import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The renderer client as the car app ships it (copied from cluster-render); no socket is needed
// to make assets and queue their pixels.
const { ClusterRender } = require('./cluster_render_client.js') as {
  ClusterRender: new (app: string) => {
    asset(o: Record<string, unknown>): number;
    pixels(ref: number, rects: unknown, px: Buffer): boolean;
  };
};

describe('the renderer client the car app ships', () => {
  // The engine's fake client only counts calls, so a client that can't take an etc2rgba atlas
  // (the copy before cluster-render 0.5.9) went unnoticed: the layer waited for pixels forever.
  it.each([
    [1248, 936], // Volt Runner's runner
    [2048, 1024], // the largest atlas the compiler makes
  ])('takes a %ix%i etc2rgba atlas, a byte a pixel', (w, h) => {
    const cr = new ClusterRender('idv7lol');
    const ref = cr.asset({ target: 'panel', format: 'etc2rgba', w, h, sampling: 'bilinear' });
    expect(ref).toBeGreaterThan(0);
    expect(cr.pixels(ref, null, Buffer.alloc(w * h))).toBe(true);
  });

  it('takes the glyph atlas and an rgba8 fallback atlas', () => {
    const cr = new ClusterRender('idv7lol');
    const font = cr.asset({ target: 'panel', format: 'r8', w: 1792, h: 192 });
    expect(cr.pixels(font, null, Buffer.alloc(1792 * 192))).toBe(true);
    const rgba = cr.asset({ target: 'panel', format: 'rgba8', w: 1248, h: 936 });
    expect(cr.pixels(rgba, null, Buffer.alloc(1248 * 936 * 4))).toBe(true);
  });
});
