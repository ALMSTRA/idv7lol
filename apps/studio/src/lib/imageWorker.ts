/// <reference lib="webworker" />
import {
  applyFinishStage,
  applySourceStage,
  frameRaster,
  resizeRaster,
  sourceStageKey,
  type Raster,
} from '@idv7lol/theme-engine';
import type { AssetAnimation, ImageEdits } from '@idv7lol/theme-schema';

/**
 * Runs the image pipeline away from the interface thread. The expensive early
 * stage (background removal, brush, crop) is cached per channel, so moving a
 * colour slider only redoes the cheap part.
 */
interface Load {
  type: 'load';
  key: string;
  raster: Raster;
  animation?: AssetAnimation;
}
interface Render {
  type: 'render';
  id: number;
  source: string;
  channel: string;
  edits: ImageEdits;
  maxSide: number;
  frame?: number;
}

const sources = new Map<
  string,
  { sizes: Map<string, Raster>; full: Raster; animation?: AssetAnimation }
>();
const stages = new Map<string, { key: string; raster: Raster }>();

function sourceAt(key: string, maxSide: number, frame?: number): Raster | undefined {
  const entry = sources.get(key);
  if (!entry) return undefined;
  const id = `${frame ?? 'x'}|${maxSide}`;
  let r = entry.sizes.get(id);
  if (r) return r;
  r =
    entry.animation && frame !== undefined
      ? frameRaster(entry.full, entry.animation, frame)
      : entry.full;
  if (maxSide && Math.max(r.width, r.height) > maxSide) {
    const s = maxSide / Math.max(r.width, r.height);
    r = resizeRaster(r, r.width * s, r.height * s);
  }
  entry.sizes.set(id, r);
  return r;
}

self.onmessage = async (e: MessageEvent<Load | Render>) => {
  const m = e.data;
  if (m.type === 'load') {
    sources.set(m.key, { sizes: new Map(), full: m.raster, animation: m.animation });
    return;
  }
  try {
    const src = sourceAt(m.source, m.maxSide, m.frame);
    if (!src) throw new Error('unknown image');
    const key = `${m.source}|${m.maxSide}|${m.frame ?? ''}|${sourceStageKey(m.edits)}`;
    let stage = stages.get(m.channel);
    if (stage?.key !== key) {
      stage = { key, raster: applySourceStage(src, m.edits) };
      stages.set(m.channel, stage);
      if (stages.size > 12) stages.delete(stages.keys().next().value!);
    }
    const out = applyFinishStage(stage.raster, m.edits);
    const bitmap = await createImageBitmap(
      new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height),
    );
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(
      { id: m.id, bitmap, width: out.width, height: out.height },
      [bitmap],
    );
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id: m.id, error: String(err) });
  }
};
