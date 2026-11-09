import type { Anchor } from '@idv7lol/theme-schema';

export const DEG = Math.PI / 180;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map `v` from [inMin, inMax] to [outMin, outMax], optionally clamped. */
export function mapRange(
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  clampResult = true,
): number {
  if (inMax === inMin) return outMin;
  const t = (v - inMin) / (inMax - inMin);
  const tt = clampResult ? clamp(t, 0, 1) : t;
  return outMin + (outMax - outMin) * tt;
}

/** Normalise `v` within [min, max] to 0..1 (clamped). */
export function normalize(v: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((v - min) / (max - min), 0, 1);
}

export function polar(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const a = angleDeg * DEG;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

/** Offset of the anchor point from the top-left corner of a box, as fractions. */
export function anchorFraction(anchor: Anchor): { fx: number; fy: number } {
  switch (anchor) {
    case 'top-left':
      return { fx: 0, fy: 0 };
    case 'top':
      return { fx: 0.5, fy: 0 };
    case 'top-right':
      return { fx: 1, fy: 0 };
    case 'left':
      return { fx: 0, fy: 0.5 };
    case 'center':
      return { fx: 0.5, fy: 0.5 };
    case 'right':
      return { fx: 1, fy: 0.5 };
    case 'bottom-left':
      return { fx: 0, fy: 1 };
    case 'bottom':
      return { fx: 0.5, fy: 1 };
    case 'bottom-right':
      return { fx: 1, fy: 1 };
  }
}

export function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

/**
 * Exponential smoothing step: move `current` towards `target` with time
 * constant `tau` seconds over `dt` seconds. Returns the new value.
 */
export function smoothStep(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 0 || dt <= 0) return target;
  const a = 1 - Math.exp(-dt / tau);
  const next = current + (target - current) * a;
  // Snap when close enough to avoid endless tiny updates.
  return Math.abs(target - next) < 1e-4 * Math.max(1, Math.abs(target)) ? target : next;
}

export function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}
