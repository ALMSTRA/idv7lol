/**
 * Limits the editor applies as you type, so a value the theme schema would
 * refuse never reaches the project, and the check a theme passes before it is
 * written to disk.
 */
import { parseThemeJson } from '@idv7lol/theme-schema';

/** Longest names the schema accepts (packages/theme-schema: components.ts, theme.ts, primitives.ts, animation.ts). */
export const MAX_COMPONENT_NAME = 64;
export const MAX_PALETTE_NAME = 48;
export const MAX_TEXT_STYLE_NAME = 48;
export const MAX_CLIP_NAME = 48;
export const MAX_NOTES = 500;

/** A typed number held inside a field's range; whole when the field takes no decimals. */
export function clampNumber(n: number, min?: number, max?: number, integer = false): number {
  let v = integer ? Math.round(n) : n;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

/**
 * What stops this text from being opened again, as "path: message" lines; empty
 * when the Studio can reopen it. The same parse the open path runs.
 */
export function unsavableReasons(text: string): string[] {
  const r = parseThemeJson(text);
  return r.ok ? [] : r.issues.map((i) => `${i.path}: ${i.message}`);
}
