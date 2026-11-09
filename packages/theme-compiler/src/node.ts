/**
 * Node-only entry of the compiler: font baking, PNG decoding and bundle
 * writing. The browser-safe API lives in `index.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseThemeJson, type Theme } from '@idv7lol/theme-schema';
import { compileTheme, type CompileOptions } from './compile.js';
import { bakeFamily, type BakedFont } from './font/bake.js';
import { decodePng } from './font/png.js';
import type { CompileResult } from './types.js';

export * from './font/bake.js';
export * from './font/png.js';
export * from './font/sdf.js';
export * from './font/ttf.js';
export * from './font/woff.js';

const bakedCache = new Map<string, BakedFont>();

/** Bake (once per process) every font family a compiled theme needs. */
export function fontsFor(families: string[]): NonNullable<CompileOptions['fonts']> {
  const out: NonNullable<CompileOptions['fonts']> = {};
  for (const fam of families) {
    let b = bakedCache.get(fam);
    if (!b) {
      b = bakeFamily(fam);
      bakedCache.set(fam, b);
    }
    out[fam] = { pixels: b.pixels, metrics: b.metrics };
  }
  return out;
}

/** Decode the PNG assets of a theme relative to its folder. */
export function imagesFor(theme: Theme, themeDir: string): NonNullable<CompileOptions['images']> {
  const out: NonNullable<CompileOptions['images']> = {};
  for (const [id, asset] of Object.entries(theme.assets)) {
    if (asset.type !== 'image') continue;
    try {
      const img = decodePng(new Uint8Array(readFileSync(resolve(themeDir, asset.path))));
      out[id] = img;
    } catch {
      /* reported by compileTheme as a missing image */
    }
  }
  return out;
}

/** Compile a theme file from disk with fonts baked and images decoded. */
export function compileThemeFile(
  themePath: string,
  opts: Omit<CompileOptions, 'fonts' | 'images'> = {},
): CompileResult {
  const text = readFileSync(themePath, 'utf8');
  const parsed = parseThemeJson(text);
  if (!parsed.ok) return compileTheme(JSON.parse(text), opts);
  const dir = dirname(resolve(themePath));
  const families = new Set<string>();
  for (const f of Object.values(parsed.theme.fonts)) families.add(f.family);
  return compileTheme(parsed.theme, {
    ...opts,
    fonts: fontsFor([...families]),
    images: imagesFor(parsed.theme, dir),
  });
}

/** Write a compile result's files under `outDir/<themeId>/`. Returns the written paths. */
export function writeBundle(result: CompileResult, outDir: string): string[] {
  if (!result.compiled) return [];
  const base = join(outDir, result.compiled.id);
  const written: string[] = [];
  for (const f of result.files) {
    const p = join(base, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.data);
    written.push(p);
  }
  return written;
}
