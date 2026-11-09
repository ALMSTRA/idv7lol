import {
  applyImageEdits,
  resizeRaster,
  type ImageResolver,
  type Raster,
} from '@idv7lol/theme-engine';
import { ImageEditsSchema, type ImageEdits, type Theme } from '@idv7lol/theme-schema';

/**
 * Decoded pixels of the theme's image assets and the edited versions the
 * canvas draws. Edits are computed in a Web Worker, so the interface never
 * waits for them; until a result arrives the canvas keeps the previous one.
 */
interface Source {
  data: string;
  raster: Raster;
  base: HTMLCanvasElement;
  thumb: string;
}
export interface Rendered {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/** Imported images larger than this are scaled down; the car's largest layer is 1920×720. */
const MAX_SIDE = 2048;
const MAX_EDITED = 48;
const THUMB_SIDE = 160;
const CLEAN_KEY = JSON.stringify(ImageEditsSchema.parse({}));

const sources = new Map<string, Source>();
const pending = new Map<string, Promise<Raster | null>>();
const edited = new Map<string, Rendered>();
const lastByAsset = new Map<string, Rendered>();
const requested = new Set<string>();
const editKeys = new WeakMap<object, string>();

/* ----- change notifications, for components that show images ----- */

let version = 0;
const listeners = new Set<() => void>();
export const imagesVersion = (): number => version;
export function subscribeImages(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function rasterToCanvas(r: Raster): HTMLCanvasElement {
  const c = canvasOf(r.width, r.height);
  c.getContext('2d')!.putImageData(
    new ImageData(r.data as Uint8ClampedArray<ArrayBuffer>, r.width, r.height),
    0,
    0,
  );
  return c;
}

/* ----- worker ----- */

interface Job {
  id: number;
  channel: string;
  source: string;
  edits: ImageEdits;
  maxSide: number;
  done: (r: Rendered) => void;
}

let worker: Worker | null | undefined;
let nextJob = 1;
const running = new Map<number, Job>();
const channels = new Map<string, { busy: boolean; next: Job | null }>();

function finish(job: Job, result: Rendered | null): void {
  running.delete(job.id);
  if (result) job.done(result);
  const ch = channels.get(job.channel);
  if (!ch) return;
  const next = ch.next;
  ch.next = null;
  if (next) dispatch(next);
  else channels.delete(job.channel);
}

function computeHere(job: Job): void {
  // Only when workers are unavailable: same pipeline, on this thread, after input is handled.
  setTimeout(() => {
    const src = sources.get(job.source)?.raster;
    if (!src) return finish(job, null);
    const small = job.maxSide ? previewOf(src, job.maxSide) : src;
    const out = applyImageEdits(small, job.edits);
    finish(job, { image: rasterToCanvas(out), width: out.width, height: out.height });
  }, 0);
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (
      e: MessageEvent<{ id: number; bitmap?: ImageBitmap; width: number; height: number }>,
    ) => {
      const job = running.get(e.data.id);
      if (!job) return;
      finish(
        job,
        e.data.bitmap ? { image: e.data.bitmap, width: e.data.width, height: e.data.height } : null,
      );
    };
    worker.onerror = () => {
      worker = null;
      for (const job of [...running.values()]) computeHere(job);
    };
    for (const [key, s] of sources) worker.postMessage({ type: 'load', key, raster: s.raster });
  } catch {
    worker = null;
  }
  return worker;
}

function dispatch(job: Job): void {
  const ch = channels.get(job.channel) ?? { busy: true, next: null };
  channels.set(job.channel, ch);
  running.set(job.id, job);
  const w = getWorker();
  if (w)
    w.postMessage({
      type: 'render',
      id: job.id,
      source: job.source,
      channel: job.channel,
      edits: job.edits,
      maxSide: job.maxSide,
    });
  else computeHere(job);
}

/**
 * Render edits on a channel. While one job runs only the newest request waits,
 * so fast slider moves never pile up.
 */
export function renderLatest(
  channel: string,
  source: string,
  edits: ImageEdits,
  maxSide: number,
  done: (r: Rendered) => void,
): void {
  const job: Job = { id: nextJob++, channel, source, edits, maxSide, done };
  const ch = channels.get(channel);
  if (ch) ch.next = job;
  else dispatch(job);
}

/* ----- sources ----- */

function loadElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The file is not an image this app can read'));
    img.src = url;
  });
}

async function decode(url: string): Promise<{ raster: Raster; base: HTMLCanvasElement }> {
  const img = await loadElement(url);
  const c = canvasOf(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { raster: { width: c.width, height: c.height, data: d.data }, base: c };
}

function makeThumb(base: HTMLCanvasElement): string {
  const s = Math.min(1, THUMB_SIDE / Math.max(base.width, base.height));
  const t = canvasOf(
    Math.max(1, Math.round(base.width * s)),
    Math.max(1, Math.round(base.height * s)),
  );
  const ctx = t.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, t.width, t.height);
  return t.toDataURL('image/png');
}

/** Load one asset's pixels (once). Resolves to null when the data cannot be decoded. */
export function ensureSource(id: string, data: string): Promise<Raster | null> {
  const have = sources.get(id);
  if (have?.data === data) return Promise.resolve(have.raster);
  const key = `${id}:${data.length}`;
  const running2 = pending.get(key);
  if (running2) return running2;
  const p = decode(data)
    .then(({ raster, base }) => {
      sources.set(id, { data, raster, base, thumb: makeThumb(base) });
      getWorker()?.postMessage({ type: 'load', key: id, raster });
      for (const k of edited.keys()) if (k.startsWith(`${id}|`)) edited.delete(k);
      for (const k of requested) if (k.startsWith(`${id}|`)) requested.delete(k);
      lastByAsset.delete(id);
      notify();
      return raster;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

export const getSource = (id: string): Raster | undefined => sources.get(id)?.raster;
export const getThumb = (id: string): string | undefined => sources.get(id)?.thumb;

/** Keep the decoded pixels in step with the theme's assets. */
export function syncAssets(theme: Theme): void {
  for (const [id, asset] of Object.entries(theme.assets)) {
    if (asset.data) void ensureSource(id, asset.data);
  }
}

function editsKey(edits: ImageEdits | undefined): string {
  if (!edits) return CLEAN_KEY;
  let k = editKeys.get(edits);
  if (k === undefined) {
    k = JSON.stringify(edits);
    editKeys.set(edits, k);
  }
  return k;
}

/** Palette tokens become colours here: the worker has no palette. */
export function withResolvedTint(
  edits: ImageEdits,
  resolveColor?: (c: string) => string,
): ImageEdits {
  return edits.tint && resolveColor
    ? { ...edits, tint: { ...edits.tint, color: resolveColor(edits.tint.color) } }
    : edits;
}

/** What the canvas draws. Never blocks: a missing result is requested and the last one shown. */
export const imageResolver: ImageResolver = {
  get(assetId, edits, resolveColor) {
    const source = sources.get(assetId);
    if (!source) return undefined;
    const ek = editsKey(edits);
    const base = { image: source.base, width: source.base.width, height: source.base.height };
    if (ek === CLEAN_KEY || !edits) return base;
    const tint = edits.tint && resolveColor ? resolveColor(edits.tint.color) : '';
    const key = `${assetId}|${ek}|${tint}`;
    const hit = edited.get(key);
    if (hit) {
      lastByAsset.set(assetId, hit);
      return hit;
    }
    if (!requested.has(key)) {
      requested.add(key);
      renderLatest(`res:${key}`, assetId, withResolvedTint(edits, resolveColor), 0, (r) => {
        requested.delete(key);
        edited.set(key, r);
        lastByAsset.set(assetId, r);
        if (edited.size > MAX_EDITED) {
          const oldest = edited.keys().next().value!;
          edited.delete(oldest);
        }
        notify();
      });
    }
    return lastByAsset.get(assetId) ?? base;
  },
};

/** RGBA pixels of every asset, for the compiler. */
export async function decodeThemeImages(
  theme: Theme,
): Promise<Record<string, { width: number; height: number; rgba: Uint8Array }>> {
  const out: Record<string, { width: number; height: number; rgba: Uint8Array }> = {};
  for (const [id, asset] of Object.entries(theme.assets)) {
    if (!asset.data) continue;
    const r = await ensureSource(id, asset.data);
    if (r)
      out[id] = {
        width: r.width,
        height: r.height,
        rgba: new Uint8Array(r.data.buffer as ArrayBuffer, r.data.byteOffset, r.data.byteLength),
      };
  }
  return out;
}

/* ----- importing from the computer ----- */

export interface ImportedImage {
  id: string;
  name: string;
  data: string;
  width: number;
  height: number;
}

function idFromName(name: string, taken: Set<string>): string {
  const base =
    name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 40) || 'image';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** PNG encoding happens off the interface thread with toBlob. */
function canvasToDataUrl(c: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    c.toBlob((blob) => {
      if (!blob) return reject(new Error('encode failed'));
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error('encode failed'));
      fr.readAsDataURL(blob);
    }, 'image/png');
  });
}

/** Turn files into PNG assets. Any format the browser engine reads works: PNG, JPEG, WebP, GIF, SVG, BMP, AVIF. */
export async function importFiles(
  files: File[],
  assets: Theme['assets'],
): Promise<{ images: ImportedImage[]; failed: string[] }> {
  const taken = new Set(Object.keys(assets));
  const images: ImportedImage[] = [];
  const failed: string[] = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadElement(url);
      // SVGs without intrinsic size report 0: give them a usable one.
      const nw = img.naturalWidth || 512;
      const nh = img.naturalHeight || 512;
      const scale = Math.min(1, MAX_SIDE / Math.max(nw, nh));
      const width = Math.max(1, Math.round(nw * scale));
      const height = Math.max(1, Math.round(nh * scale));
      const c = canvasOf(width, height);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      const data = await canvasToDataUrl(c);
      const same = Object.entries(assets).find(([, a]) => a.data === data);
      images.push({
        id: same ? same[0] : idFromName(file.name || 'image', taken),
        name: file.name || 'image',
        data,
        width,
        height,
      });
    } catch {
      failed.push(file.name || 'image');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return { images, failed };
}

export function pickImageFiles(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.svg';
    input.multiple = multiple;
    input.onchange = () => resolve(input.files ? [...input.files] : []);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export function imageFilesOf(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const entry of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const f = 'getAsFile' in entry ? (entry.kind === 'file' ? entry.getAsFile() : null) : entry;
    if (f && (f.type.startsWith('image/') || /\.svg$/i.test(f.name))) out.push(f);
  }
  return out;
}

/** A small version of a raster, for previews that recompute on every change. */
export function previewOf(r: Raster, maxSide: number): Raster {
  const s = Math.min(1, maxSide / Math.max(r.width, r.height));
  return s === 1 ? r : resizeRaster(r, r.width * s, r.height * s);
}
