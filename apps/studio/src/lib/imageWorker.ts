/// <reference lib="webworker" />
import {
  applyFinishStage,
  applySourceStage,
  resizeRaster,
  sourceStageKey,
  type Raster,
} from '@idv7lol/theme-engine';
import type { ImageEdits } from '@idv7lol/theme-schema';

/**
 * Runs the image pipeline away from the interface thread. The expensive early
 * stage (background removal, brush, crop) is cached per channel, so moving a
 * colour slider only redoes the cheap part.
 */
interface Load {
  type: 'load';
  key: string;
  raster: Raster;
}
interface Render {
  type: 'render';
  id: number;
  source: string;
  channel: string;
  edits: ImageEdits;
  maxSide: number;
}

const sources = new Map<string, Map<number, Raster>>();
const stages = new Map<string, { key: string; raster: Raster }>();

function sourceAt(key: string, maxSide: number): Raster | undefined {
  const sizes = sources.get(key);
  const full = sizes?.get(0);
  if (!sizes || !full) return undefined;
  if (!maxSide || Math.max(full.width, full.height) <= maxSide) return full;
  let r = sizes.get(maxSide);
  if (!r) {
    const s = maxSide / Math.max(full.width, full.height);
    r = resizeRaster(full, full.width * s, full.height * s);
    sizes.set(maxSide, r);
  }
  return r;
}

self.onmessage = async (e: MessageEvent<Load | Render>) => {
  const m = e.data;
  if (m.type === 'load') {
    sources.set(m.key, new Map([[0, m.raster]]));
    return;
  }
  try {
    const src = sourceAt(m.source, m.maxSide);
    if (!src) throw new Error('unknown image');
    const key = `${m.source}|${m.maxSide}|${sourceStageKey(m.edits)}`;
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
