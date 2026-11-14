import type { NamedTextStyle, TextStyle } from './primitives.js';
import type { Theme } from './theme.js';

/** What a named style sets on a text that uses it; alignment and baseline stay the text's own. */
export const NAMED_STYLE_KEYS = [
  'font',
  'size',
  'weight',
  'color',
  'letterSpacing',
  'uppercase',
] as const;

/** A text style object anywhere in a component's props (it has the fields a TextStyle always has). */
function isTextStyle(v: unknown): v is TextStyle {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['size'] === 'number' && typeof o['weight'] === 'string' && 'color' in o && 'align' in o
  );
}

/** `style` with the fields of the named style it uses, or as it is. */
export function applyNamedStyle(
  style: TextStyle,
  styles: Record<string, NamedTextStyle>,
): TextStyle {
  const named = style.use ? styles[style.use] : undefined;
  if (!named) return style;
  let changed = false;
  const out: Record<string, unknown> = { ...style };
  for (const k of NAMED_STYLE_KEYS) {
    if (out[k] !== named[k]) {
      out[k] = named[k];
      changed = true;
    }
  }
  return changed ? (out as TextStyle) : style;
}

function walk(v: unknown, styles: Record<string, NamedTextStyle>): unknown {
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((x) => {
      const y = walk(x, styles);
      if (y !== x) changed = true;
      return y;
    });
    return changed ? out : v;
  }
  if (!v || typeof v !== 'object') return v;
  if (isTextStyle(v)) return applyNamedStyle(v, styles);
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const y = walk(x, styles);
    if (y !== x) changed = true;
    out[k] = y;
  }
  return changed ? out : v;
}

const cache = new WeakMap<Theme, Theme>();

/**
 * The theme with every text that uses a named style (TextStyle.use) following it. Unchanged
 * objects are kept, so a theme with no named styles comes back as it is. Cached per theme object.
 */
export function resolveTextStyles(theme: Theme): Theme {
  const styles = theme.textStyles ?? {};
  if (!Object.keys(styles).length) return theme;
  const hit = cache.get(theme);
  if (hit) return hit;
  const components = walk(theme.components, styles) as Theme['components'];
  const out = components === theme.components ? theme : { ...theme, components };
  cache.set(theme, out);
  return out;
}

/** Ids of named styles that texts use but the theme doesn't have. */
export function unknownTextStyles(theme: Theme): string[] {
  const styles = theme.textStyles ?? {};
  const missing = new Set<string>();
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') {
      if (isTextStyle(v) && v.use && !styles[v.use]) missing.add(v.use);
      Object.values(v as Record<string, unknown>).forEach(visit);
    }
  };
  visit(theme.components);
  return [...missing];
}

/** The theme with texts that use `id` keeping their current look but no longer following it. */
export function detachTextStyle(theme: Theme, id: string): Theme {
  const resolved = resolveTextStyles(theme);
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (!v || typeof v !== 'object') return v;
    if (isTextStyle(v) && v.use === id) {
      const { use: _use, ...rest } = v;
      return rest;
    }
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, visit(x)]),
    );
  };
  const textStyles = { ...theme.textStyles };
  delete textStyles[id];
  return { ...resolved, textStyles, components: visit(resolved.components) as Theme['components'] };
}

/** A free id for a new named style called `name`. */
export function newTextStyleId(theme: Theme, name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'style';
  let id = base;
  for (let i = 2; theme.textStyles?.[id]; i++) id = `${base}-${i}`;
  return id;
}
