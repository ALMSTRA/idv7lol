import type { CompileResult, CompiledTheme } from './types.js';

/**
 * A theme ready to copy to the car on a USB stick: one gzip'd JSON file with
 * the compiled theme and its image layers. The car app reads every
 * `idv7lol/themes/*.idv7pkg` on a stick by itself.
 *
 * Shaders are left out on purpose. The car uses its own copy of the
 * compiler's shaders and looks them up by name, so a package can't bring GLSL
 * of its own.
 */
export const PACKAGE_FORMAT = 1;
export const PACKAGE_EXTENSION = '.idv7pkg';
/** Where the car looks on a stick. */
export const USB_THEMES_DIR = 'idv7lol/themes';
/** The first car app version that reads packages. */
export const PACKAGE_MIN_APP_VERSION = '0.2.0';

export interface ThemePackage {
  idv7pkg: typeof PACKAGE_FORMAT;
  id: string;
  name: string;
  author: string;
  version: string;
  minAppVersion: string;
  createdAt: string;
  theme: Omit<CompiledTheme, 'shaders'>;
  /** Image layers by their `file` in the theme, as base64 RGBA. */
  images: Record<string, string>;
}

function toBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } })
    .Buffer;
  if (B) return B.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The package for a successful compile. Throws when the compile failed or an image is missing. */
export function buildThemePackage(
  result: CompileResult,
  opts: { now?: () => Date } = {},
): ThemePackage {
  const compiled = result.compiled;
  if (!compiled) throw new Error('The theme did not compile.');
  const { shaders: _shaders, ...theme } = compiled;
  const images: Record<string, string> = {};
  for (const img of compiled.images) {
    const file = result.files.find((f) => f.path === img.file);
    if (!file || typeof file.data === 'string')
      throw new Error(`Image layer ${img.key} has no pixels.`);
    images[img.file] = toBase64(file.data);
  }
  return {
    idv7pkg: PACKAGE_FORMAT,
    id: compiled.id,
    name: compiled.name,
    author: compiled.author,
    version: compiled.version,
    minAppVersion: PACKAGE_MIN_APP_VERSION,
    createdAt: (opts.now ?? (() => new Date()))().toISOString(),
    theme,
    images,
  };
}

/** The file name a package gets on the stick. */
export function packageFileName(id: string): string {
  return `${id.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}${PACKAGE_EXTENSION}`;
}

/** The package as UTF-8 JSON, ready to gzip. */
export function encodeThemePackage(pkg: ThemePackage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(pkg));
}
