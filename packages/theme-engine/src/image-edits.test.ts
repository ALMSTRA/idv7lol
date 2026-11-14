import { describe, expect, it } from 'vitest';
import { ImageEditsSchema, createComponent, createEmptyTheme } from '@idv7lol/theme-schema';
import {
  EngineState,
  RecordingContext,
  ThemeEngine,
  applyImageEdits,
  createRaster,
  displayToSource,
  editedSize,
  frameAt,
  playbackSpeed,
  frameRaster,
  frameRect,
  fitRaster,
  resizeRaster,
  type Raster,
} from './index.js';

const E = (o: object = {}) => ImageEditsSchema.parse(o);

/** width×height raster where each pixel's red = x, green = y. */
function gradient(w: number, h: number): Raster {
  const r = createRaster(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      r.data[i] = x;
      r.data[i + 1] = y;
      r.data[i + 3] = 255;
    }
  return r;
}
const px = (r: Raster, x: number, y: number) => [
  ...r.data.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
];

describe('applyImageEdits', () => {
  it('returns an equal copy for no edits and never mutates the source', () => {
    const src = gradient(4, 3);
    const before = [...src.data];
    const out = applyImageEdits(src, E({ brightness: 50 }));
    expect([...src.data]).toEqual(before);
    expect(out.data).not.toBe(src.data);
    expect([...applyImageEdits(src, E()).data]).toEqual(before);
  });

  it('rotates, flips and crops', () => {
    const src = gradient(4, 2);
    const r90 = applyImageEdits(src, E({ rotate: 90 }));
    expect([r90.width, r90.height]).toEqual([2, 4]);
    expect(px(r90, 1, 0).slice(0, 2)).toEqual([0, 0]); // the top-left source pixel moves to the top right
    const flipped = applyImageEdits(src, E({ flipH: true }));
    expect(px(flipped, 0, 0)[0]).toBe(3);
    const cropped = applyImageEdits(src, E({ crop: { x: 0.5, y: 0, width: 0.5, height: 1 } }));
    expect([cropped.width, cropped.height]).toEqual([2, 2]);
    expect(px(cropped, 0, 0)[0]).toBe(2);
  });

  it('maps display points back to the source for every rotation, flip and crop', () => {
    const src = gradient(8, 4);
    for (const rotate of [0, 90, 180, 270] as const) {
      for (const flipH of [false, true]) {
        const e = E({ rotate, flipH, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
        const out = applyImageEdits(src, e);
        const nx = 0.5 / out.width;
        const ny = 0.5 / out.height;
        const p = displayToSource(e, nx, ny);
        const [r, g] = px(out, 0, 0);
        expect(Math.abs(p.x * 8 - (r! + 0.5))).toBeLessThanOrEqual(1);
        expect(Math.abs(p.y * 4 - (g! + 0.5))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reports the edited size in source pixels', () => {
    expect(
      editedSize(E({ rotate: 90, crop: { x: 0, y: 0, width: 0.5, height: 1 } }), 100, 40),
    ).toEqual({ width: 20, height: 100 });
  });

  it('removes a background colour and restores it with a brush', () => {
    const src = createRaster(10, 10);
    src.data.fill(255);
    for (let i = 0; i < 4; i++) src.data.set([255, 0, 0, 255], i * 4); // four red pixels on white
    const keyed = applyImageEdits(
      src,
      E({ colorKey: { color: '#ffffff', tolerance: 5, softness: 0 } }),
    );
    expect(px(keyed, 9, 9)[3]).toBe(0);
    expect(px(keyed, 0, 0)[3]).toBe(255);
    const restored = applyImageEdits(
      src,
      E({
        colorKey: { color: '#ffffff', tolerance: 5, softness: 0 },
        strokes: [{ mode: 'restore', size: 0.6, hardness: 1, points: [0.95, 0.95] }],
      }),
    );
    expect(px(restored, 9, 9)[3]).toBe(255);
    expect(px(restored, 5, 0)[3]).toBe(0);
  });

  it('erases along a stroke', () => {
    const src = createRaster(20, 20);
    src.data.fill(255);
    const out = applyImageEdits(
      src,
      E({ strokes: [{ mode: 'erase', size: 0.2, hardness: 1, points: [0, 0.5, 1, 0.5] }] }),
    );
    expect(px(out, 10, 10)[3]).toBe(0);
    expect(px(out, 10, 1)[3]).toBe(255);
  });

  it('adjusts tone and colour in the expected direction', () => {
    const src = createRaster(1, 1);
    src.data.set([100, 150, 200, 255]);
    expect(px(applyImageEdits(src, E({ brightness: 50 })), 0, 0)[0]).toBeGreaterThan(100);
    expect(px(applyImageEdits(src, E({ brightness: -50 })), 0, 0)[0]).toBeLessThan(100);
    const [r, g, b] = px(applyImageEdits(src, E({ grayscale: true })), 0, 0);
    expect(Math.abs(r! - g!)).toBeLessThanOrEqual(1);
    expect(Math.abs(g! - b!)).toBeLessThanOrEqual(1);
    expect(px(applyImageEdits(src, E({ invert: true })), 0, 0)[0]).toBe(155);
    const warm = px(applyImageEdits(src, E({ temperature: 100 })), 0, 0);
    expect(warm[0]).toBeGreaterThan(100);
    expect(warm[2]).toBeLessThan(200);
    const tinted = px(
      applyImageEdits(src, E({ tint: { color: '$accent', amount: 100 } }), () => '#ff0000'),
      0,
      0,
    );
    expect(tinted[1]).toBe(0);
    expect(tinted[0]).toBeGreaterThan(0);
  });

  it('blurs without bleeding transparent black and rounds corners', () => {
    const src = createRaster(40, 40);
    for (let y = 0; y < 40; y++)
      for (let x = 20; x < 40; x++) src.data.set([255, 255, 255, 255], (y * 40 + x) * 4);
    const out = applyImageEdits(src, E({ blur: 50 }));
    const edge = px(out, 19, 20);
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
    expect(edge[0]).toBeGreaterThan(240); // stays white, not grey
    const full = createRaster(40, 40);
    full.data.fill(255);
    const round = applyImageEdits(full, E({ radius: 50 }));
    expect(px(round, 0, 0)[3]).toBe(0);
    expect(px(round, 20, 20)[3]).toBe(255);
  });
});

describe('animated sheets', () => {
  const a = { frames: 3, columns: 2, frameWidth: 2, frameHeight: 2, durations: [100, 100, 200] };
  it('finds frames by time, looping', () => {
    expect(frameAt(a, 0)).toBe(0);
    expect(frameAt(a, 150)).toBe(1);
    expect(frameAt(a, 399)).toBe(2);
    expect(frameAt(a, 400)).toBe(0);
    // At 4× speed each frame lasts a quarter, but never less than 20 ms, as on the car.
    expect(frameAt(a, 30, 4)).toBe(1);
    expect(frameAt({ ...a, durations: [40, 40, 40] }, 25, 4)).toBe(1);
  });
  it('slices frames out of the sheet', () => {
    const sheet = gradient(4, 4);
    expect(frameRect(a, 2)).toEqual({ x: 0, y: 2, w: 2, h: 2 });
    const f = frameRaster(sheet, a, 1);
    expect([f.width, f.height]).toEqual([2, 2]);
    expect(px(f, 0, 0).slice(0, 2)).toEqual([2, 0]);
  });
});

describe('resampling', () => {
  it('resizes keeping colour under transparency', () => {
    const src = createRaster(4, 4);
    for (let i = 0; i < 16; i += 2) src.data.set([200, 10, 10, 255], i * 4);
    const out = resizeRaster(src, 2, 2);
    expect([out.width, out.height]).toEqual([2, 2]);
    expect(px(out, 0, 0)[0]).toBe(200);
    expect(px(out, 0, 0)[3]).toBeGreaterThan(100);
  });

  it('fits into a box', () => {
    const src = createRaster(10, 10);
    src.data.fill(255);
    const contain = fitRaster(src, 20, 10, 'contain');
    expect([contain.width, contain.height]).toEqual([20, 10]);
    expect(px(contain, 0, 5)[3]).toBe(0);
    expect(px(contain, 10, 5)[3]).toBe(255);
    const cover = fitRaster(src, 20, 10, 'cover');
    expect(px(cover, 0, 5)[3]).toBe(255);
    expect(fitRaster(src, 7, 3, 'stretch').width).toBe(7);
  });
});

describe('image component rendering', () => {
  it('asks the resolver with its edits and draws the result', () => {
    const c = createComponent('image', {
      id: 'pic',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      props: { asset: 'logo', edits: { brightness: 20 } },
    });
    const theme = { ...createEmptyTheme(), components: [c] };
    const asked: unknown[] = [];
    const ctx = new RecordingContext();
    new ThemeEngine(new EngineState()).render(ctx, theme, 0, {
      images: {
        get: (id, edits) => {
          asked.push([id, edits?.brightness]);
          return { image: 'bitmap', width: 50, height: 50 };
        },
      },
    });
    expect(asked).toEqual([['logo', 20]]);
    expect(ctx.count('drawImage')).toBe(1);
  });
});

describe('playbackSpeed', () => {
  const sf = { from: 0, to: 200, fastSpeed: 3 };
  it('keeps the base speed without a live value or below from', () => {
    expect(playbackSpeed(1, undefined, 120)).toBe(1);
    expect(playbackSpeed(1, sf, undefined)).toBe(1);
    expect(playbackSpeed(0.6, sf, 0)).toBe(0.6);
  });
  it('rises to fastSpeed in steps', () => {
    expect(playbackSpeed(1, sf, 100)).toBe(2);
    expect(playbackSpeed(1, sf, 101)).toBe(2);
    expect(playbackSpeed(1, sf, 30)).toBe(1.25);
    expect(playbackSpeed(1, sf, 500)).toBe(3);
  });
});
