import { getDisplayProfile, type Theme } from '@idv7lol/theme-schema';
import {
  applyImageEdits,
  createRaster,
  frameRaster,
  collectSignals,
  findComponent,
  fitRaster,
  maskOf,
  resolveColor,
} from '@idv7lol/theme-engine';
import { buildPieces } from './pieces.js';
import { encodeEtc2Rgba } from './etc2.js';
import { SHADERS } from './glsl.js';
import { codeOf } from './font/glyphs.js';
import { validateTheme } from './validate.js';
import type { BundleFile, CompileResult, CompiledPiece, CompiledTheme, Finding } from './types.js';

export const COMPILER_VERSION = '0.1.0';

export interface CompileOptions {
  /** Already-baked font atlases to include, keyed by family. */
  fonts?: Record<string, { pixels: Uint8Array; metrics: object }>;
  /** Decoded image assets as RGBA8 pixels, keyed by asset id. */
  images?: Record<string, { width: number; height: number; rgba: Uint8Array }>;
  /** Compile even with validation errors (for diagnostics). */
  force?: boolean;
  now?: () => Date;
}

/**
 * Compile a theme into the runtime format plus the files of a bundle.
 * The bundle layout is what `apps/idv7lol` loads:
 *
 *   theme.json            CompiledTheme (pieces, shaders by kind, palettes…)
 *   fonts/<family>.r8     SDF atlas pixels (R8)
 *   fonts/<family>.json   FontMetrics
 *   images/<asset>.rgba   RGBA8 pixels of image assets
 */
export function compileTheme(doc: unknown, opts: CompileOptions = {}): CompileResult {
  const report = validateTheme(doc);
  if (!report.theme || (!report.ok && !opts.force)) return { report, files: [] };
  const theme = report.theme;
  const build = buildPieces(theme);
  const display = getDisplayProfile(theme.target.display);

  // Telltales need the atlas code of 'P'.
  const codeP = codeOf('P');
  for (const p of build.pieces) if (p.shader === 'telltale') p.statics['u_code_p'] = [codeP];

  const fontFamilies = new Set<string>();
  for (const p of build.pieces) if (p.usesFont) fontFamilies.add(fontFamilyOf(theme, p));

  const usedShaders: Record<string, string> = {};
  for (const p of build.pieces) usedShaders[p.shader] = SHADERS[p.shader];
  if (build.images.some((i) => i.sprite)) usedShaders['sprite'] = SHADERS.sprite;

  const signals = new Set(collectSignals(theme.components));
  signals.add('drive.mode');

  const warnings: Finding[] = [
    ...report.warnings,
    ...build.findings.filter((f) => f.severity === 'warning'),
  ];

  const compiled: CompiledTheme = {
    format: 1,
    id: theme.id,
    name: theme.name,
    version: theme.version,
    author: theme.author,
    description: theme.description,
    compiledWith: `idv7lol theme-compiler ${COMPILER_VERSION}`,
    compiledAt: (opts.now ?? (() => new Date()))().toISOString(),
    target: {
      display: theme.target.display,
      renderTarget: display?.renderTarget ?? 'panel',
      width: theme.layout.width,
      height: theme.layout.height,
    },
    vehicleProfile: theme.vehicleProfile,
    palettes: Object.fromEntries(
      Object.entries(theme.palettes).map(([id, p]) => [
        id,
        { name: p.name, colors: { ...p.colors } },
      ]),
    ),
    paletteSelection: theme.palette,
    background:
      typeof theme.layout.background === 'string'
        ? theme.layout.background
        : theme.layout.background.stops[0]!.color,
    fonts: [...fontFamilies],
    shaders: usedShaders,
    pieces: build.pieces,
    images: build.images,
    ...(build.alerts.length ? { alerts: build.alerts } : {}),
    signals: [...signals].sort(),
    layers: build.pieces.length + build.images.length,
    warnings,
  };

  const files: BundleFile[] = [];
  for (const fam of fontFamilies) {
    const f = opts.fonts?.[fam];
    if (f) {
      files.push({ path: `fonts/${fam}.r8`, data: f.pixels });
      files.push({ path: `fonts/${fam}.json`, data: JSON.stringify(f.metrics) });
    } else {
      report.infos.push({
        severity: 'info',
        code: 'bundle.font-missing',
        message: `No baked atlas for font family "${fam}" was supplied; the bundle needs fonts/${fam}.r8 and .json.`,
      });
    }
  }

  // Bake each image component: edits first, then fitted to exactly its layer size.
  const palette = theme.palettes[theme.palette.default];
  for (const ref of build.assetRefs) {
    const img = opts.images?.[ref.asset];
    const entry = compiled.images.find((i) => i.key === ref.key);
    const component = findComponent(theme.components, ref.componentId);
    if (!entry) continue;
    if (!img || component?.type !== 'image') {
      report.infos.push({
        severity: 'info',
        code: 'bundle.image-missing',
        message: `Image asset "${ref.asset}" was not decoded; the bundle needs ${entry.file}.`,
      });
      continue;
    }
    const source = {
      width: img.width,
      height: img.height,
      data: new Uint8ClampedArray(
        img.rgba.buffer as ArrayBuffer,
        img.rgba.byteOffset,
        img.rgba.byteLength,
      ),
    };
    const resolve = (c: string) => (palette ? resolveColor(c, palette) : c);
    const anim = theme.assets[ref.asset]?.animation;
    if (anim && entry.sprite) {
      const { columns, cellW, cellH, frames } = entry.sprite;
      const atlas = createRaster(entry.iw, entry.ih);
      for (let i = 0; i < frames; i++) {
        const cell = fitRaster(
          applyImageEdits(frameRaster(source, anim, i), component.props.edits, resolve),
          cellW,
          cellH,
          component.props.fit,
        );
        const ox = (i % columns) * cellW;
        const oy = Math.floor(i / columns) * cellH;
        for (let y = 0; y < cellH; y++)
          atlas.data.set(
            cell.data.subarray(y * cellW * 4, (y + 1) * cellW * 4),
            ((y + oy) * entry.iw + ox) * 4,
          );
      }
      const rgba = new Uint8Array(atlas.data.buffer as ArrayBuffer);
      files.push({
        path: entry.file,
        data: entry.format === 'etc2rgba' ? etc2Cached(rgba, entry.iw, entry.ih) : rgba,
      });
      continue;
    }
    const edited = applyImageEdits(source, component.props.edits, (c) =>
      palette ? resolveColor(c, palette) : c,
    );
    const baked = fitRaster(edited, entry.iw, entry.ih, component.props.fit);
    files.push({
      path: entry.file,
      data: new Uint8Array(
        baked.data.buffer as ArrayBuffer,
        baked.data.byteOffset,
        baked.data.byteLength,
      ),
    });
  }

  // Pictures pieces sample: a custom icon's mask (R8), a needle of your own (RGBA8).
  for (const ref of build.textureRefs) {
    const img = opts.images?.[ref.asset];
    if (!img) {
      report.infos.push({
        severity: 'info',
        code: 'bundle.image-missing',
        message: `Image asset "${ref.asset}" was not decoded; the bundle needs ${ref.file}.`,
      });
      continue;
    }
    const source = {
      width: img.width,
      height: img.height,
      data: new Uint8ClampedArray(
        img.rgba.buffer as ArrayBuffer,
        img.rgba.byteOffset,
        img.rgba.byteLength,
      ),
    };
    const fitted = fitRaster(source, ref.w, ref.h, ref.mask ? 'contain' : 'stretch');
    const rgba = new Uint8Array(
      fitted.data.buffer as ArrayBuffer,
      fitted.data.byteOffset,
      fitted.data.byteLength,
    );
    files.push({ path: ref.file, data: ref.mask ? maskOf(rgba) : new Uint8Array(rgba) });
  }

  // Last, so it records every value settled above.
  files.unshift({ path: 'theme.json', data: JSON.stringify(compiled, null, 2) });
  return { report, compiled, files };
}

/** Font family used by a text-capable piece (from the component's style), defaulting to the theme default. */
function fontFamilyOf(theme: Theme, _piece: CompiledPiece): string {
  const fonts = theme.fonts;
  const first = Object.values(fonts)[0];
  return (fonts['default'] ?? first)?.family ?? 'sans';
}

/**
 * The editor compiles again on every change; an atlas that didn't change is not encoded again.
 * Keyed by a hash of its pixels; a few kept.
 */
const etc2Cache = new Map<string, Uint8Array>();
function etc2Cached(rgba: Uint8Array, w: number, h: number): Uint8Array {
  let a = 0x811c9dc5,
    b = 0x01000193;
  const words = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2);
  for (let i = 0; i < words.length; i++) {
    a = Math.imul(a ^ words[i]!, 0x01000193);
    b = Math.imul(b ^ words[i]!, 0x5bd1e995) ^ (b >>> 15);
  }
  const key = `${w}x${h}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
  let out = etc2Cache.get(key);
  if (!out) {
    out = encodeEtc2Rgba(rgba, w, h);
    etc2Cache.set(key, out);
    if (etc2Cache.size > 8) etc2Cache.delete(etc2Cache.keys().next().value!);
  }
  return out;
}
