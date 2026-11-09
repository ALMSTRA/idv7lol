import {
  applyImageEdits,
  resizeRaster,
  type ImageResolver,
  type Raster,
} from '@idv7lol/theme-engine';
import type { ImageEdits, Theme } from '@idv7lol/theme-schema';

/**
 * Decoded pixels of the theme's image assets, and the edited versions the
 * canvas draws. Everything is derived from the assets' embedded PNG data.
 */
interface Source {
  data: string;
  raster: Raster;
}

/** Imported images larger than this are scaled down; the car's largest layer is 1920×720. */
const MAX_SIDE = 2048;
const MAX_EDITED = 48;

const sources = new Map<string, Source>();
const pending = new Map<string, Promise<Raster | null>>();
const edited = new Map<string, { image: HTMLCanvasElement; width: number; height: number }>();
const editKeys = new WeakMap<object, string>();

function loadElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The file is not an image this app can read'));
    img.src = url;
  });
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

async function decode(url: string): Promise<Raster> {
  const img = await loadElement(url);
  const c = canvasOf(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}

/** Load one asset's pixels (once). Resolves to null when the data cannot be decoded. */
export function ensureSource(id: string, data: string): Promise<Raster | null> {
  const have = sources.get(id);
  if (have?.data === data) return Promise.resolve(have.raster);
  const key = `${id}:${data.length}`;
  const running = pending.get(key);
  if (running) return running;
  const p = decode(data)
    .then((raster) => {
      sources.set(id, { data, raster });
      for (const k of edited.keys()) if (k.startsWith(`${id}|`)) edited.delete(k);
      return raster;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

export function getSource(id: string): Raster | undefined {
  return sources.get(id)?.raster;
}

/** Keep the decoded pixels in step with the theme's assets. */
export function syncAssets(theme: Theme): void {
  for (const [id, asset] of Object.entries(theme.assets)) {
    if (asset.data) void ensureSource(id, asset.data);
  }
}

function editsKey(edits: ImageEdits | undefined): string {
  if (!edits) return '';
  let k = editKeys.get(edits);
  if (k === undefined) {
    k = JSON.stringify(edits);
    editKeys.set(edits, k);
  }
  return k;
}

/** What the canvas draws: each asset with a component's edits applied, cached. */
export const imageResolver: ImageResolver = {
  get(assetId, edits, resolveColor) {
    const source = sources.get(assetId);
    if (!source) return undefined;
    const tint = edits?.tint && resolveColor ? resolveColor(edits.tint.color) : '';
    const key = `${assetId}|${editsKey(edits)}|${tint}`;
    const hit = edited.get(key);
    if (hit) return hit;
    const result = edits ? applyImageEdits(source.raster, edits, resolveColor) : source.raster;
    const entry = { image: rasterToCanvas(result), width: result.width, height: result.height };
    edited.set(key, entry);
    if (edited.size > MAX_EDITED) edited.delete(edited.keys().next().value!);
    return entry;
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
      const data = c.toDataURL('image/png');
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
