import { compileTheme, type CompileResult } from '@idv7lol/theme-compiler';
import type { Theme } from '@idv7lol/theme-schema';
import { fetchStatic } from '../host/files.js';
import { decodeThemeImages } from './imageStore.js';

export interface BakedFont {
  pixels: Uint8Array;
  metrics: object;
}

const fontCache = new Map<string, Promise<BakedFont | null>>();

/** The baked SDF atlas the car uses for a font family, shipped with the Studio. */
export function loadBakedFont(family: string): Promise<BakedFont | null> {
  let p = fontCache.get(family);
  if (!p) {
    p = (async () => {
      const px = await fetchStatic(`/fonts/${family}.r8`);
      const mt = await fetchStatic(`/fonts/${family}.json`);
      if (!px || !mt) return null;
      return { pixels: px, metrics: JSON.parse(new TextDecoder().decode(mt)) as object };
    })();
    fontCache.set(family, p);
  }
  return p;
}

/** Compile a theme exactly as Build & Deploy does: with its fonts and decoded pictures. */
export async function compileForCar(theme: Theme): Promise<CompileResult> {
  const fonts: Record<string, BakedFont> = {};
  for (const fam of new Set(Object.values(theme.fonts).map((f) => f.family))) {
    const f = await loadBakedFont(fam);
    if (f) fonts[fam] = f;
  }
  return compileTheme(theme, { fonts, images: await decodeThemeImages(theme) });
}
