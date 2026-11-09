import { getDisplayProfile, type Theme } from '@idv7lol/theme-schema';
import {
  applyImageEdits,
  createRaster,
  frameRaster,
  collectSignals,
  findComponent,
  fitRaster,
  resolveColor,
} from '@idv7lol/theme-engine';
import { buildPieces } from './pieces.js';
import { SHADERS } from './glsl.js';
import { codeOf } from './font/glyphs.js';
import { validateTheme } from './validate.js';
import type { BundleFile, CompileResult, CompiledPiece, CompiledTheme, Finding } from './types.js';

export const COMPILER_VERSION = '0.1.0';

export interface CompileOptions {
  /** Already-baked font atlases to include: family → { pixels, metrics }. */
  fonts?: Record<string, { pixels: Uint8Array; metrics: object }>;
  /** Decoded image assets: asset id → RGBA8 pixels. */
  images?: Record<string, { width: number; height: number; rgba: Uint8Array }>;
  /** Compile even with validation errors (for diagnostics). */
  force?: boolean;
  now?: () => Date;
}

/**
 * Compile a theme into the runtime format plus the files of a bundle.
 * The bundle layout is what `apps/idv7lol` loads:
 *
 *   theme.json            — CompiledTheme (pieces, shaders by kind, palettes…)
 *   fonts/<family>.r8     — SDF atlas pixels (R8)
 *   fonts/<family>.json   — FontMetrics
 *   images/<asset>.rgba   — RGBA8 pixels of image assets
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
      files.push({ path: entry.file, data: new Uint8Array(atlas.data.buffer as ArrayBuffer) });
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
