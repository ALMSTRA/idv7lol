import type { Color, Palette } from '@idv7lol/theme-schema';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, RGBA> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function hexChannel(s: string): number {
  return parseInt(s.length === 1 ? s + s : s, 16);
}

/** Parse a colour literal. Returns opaque magenta for unparsable input so mistakes are visible. */
export function parseColor(input: string): RGBA {
  const s = input.trim();
  if (NAMED[s]) return NAMED[s];
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      return {
        r: hexChannel(h[0]!),
        g: hexChannel(h[1]!),
        b: hexChannel(h[2]!),
        a: h.length === 4 ? hexChannel(h[3]!) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: hexChannel(h.slice(0, 2)),
        g: hexChannel(h.slice(2, 4)),
        b: hexChannel(h.slice(4, 6)),
        a: h.length === 8 ? hexChannel(h.slice(6, 8)) / 255 : 1,
      };
    }
  }
  const m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s);
  if (m) {
    const parts = m[2]!
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((p) =>
        p.endsWith('%') ? { v: parseFloat(p), pct: true } : { v: parseFloat(p), pct: false },
      );
    if (m[1]!.startsWith('rgb') && parts.length >= 3) {
      const ch = (p: { v: number; pct: boolean }) => (p.pct ? (p.v / 100) * 255 : p.v);
      const a = parts[3] ? (parts[3].pct ? parts[3].v / 100 : parts[3].v) : 1;
      return { r: ch(parts[0]!), g: ch(parts[1]!), b: ch(parts[2]!), a };
    }
    if (m[1]!.startsWith('hsl') && parts.length >= 3) {
      const a = parts[3] ? (parts[3].pct ? parts[3].v / 100 : parts[3].v) : 1;
      return { ...hslToRgb(parts[0]!.v, parts[1]!.v / 100, parts[2]!.v / 100), a };
    }
  }
  return { r: 255, g: 0, b: 255, a: 1 };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(f(hh + 1 / 3) * 255),
    g: Math.round(f(hh) * 255),
    b: Math.round(f(hh - 1 / 3) * 255),
  };
}

export function toCss(c: RGBA): string {
  const r = Math.round(Math.max(0, Math.min(255, c.r)));
  const g = Math.round(Math.max(0, Math.min(255, c.g)));
  const b = Math.round(Math.max(0, Math.min(255, c.b)));
  const a = Math.max(0, Math.min(1, c.a));
  if (a >= 1) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`;
}

export function toHex(c: RGBA): string {
  const r = Math.round(Math.max(0, Math.min(255, c.r)));
  const g = Math.round(Math.max(0, Math.min(255, c.g)));
  const b = Math.round(Math.max(0, Math.min(255, c.b)));
  const a = Math.round(Math.max(0, Math.min(1, c.a)) * 255);
  return a >= 255 ? `#${hex2(r)}${hex2(g)}${hex2(b)}` : `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

export function mixColors(a: RGBA, b: RGBA, t: number): RGBA {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    r: a.r + (b.r - a.r) * tt,
    g: a.g + (b.g - a.g) * tt,
    b: a.b + (b.b - a.b) * tt,
    a: a.a + (b.a - a.a) * tt,
  };
}

export function withAlpha(c: RGBA, alpha: number): RGBA {
  return { ...c, a: c.a * alpha };
}

export function isToken(c: string): boolean {
  return c.startsWith('$');
}

/**
 * Resolve a colour (literal or "$token") against a palette. Unknown tokens
 * resolve to magenta so they are obvious in previews; the validator reports
 * them as errors before a theme can be compiled.
 */
export function resolveColor(c: Color, palette: Palette): string {
  if (isToken(c)) {
    return palette.colors[c.slice(1)] ?? '#ff00ff';
  }
  return c;
}

/** Relative luminance (WCAG) of an sRGB colour. */
export function luminance(c: RGBA): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** WCAG contrast ratio between two colours, 1..21. */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
