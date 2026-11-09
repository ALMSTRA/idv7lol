import type { Easing } from '@idv7lol/theme-schema';

export type EasingFn = (t: number) => number;

const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

export const EASINGS: Readonly<Record<Easing, EasingFn>> = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => 1 - (1 - t) * (1 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => 1 - (1 - t) ** 3,
  'ease-in-out-cubic': (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  'ease-out-back': (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  'ease-out-elastic': (t) =>
    t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1,
  'ease-out-bounce': (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  step: (t) => (t >= 1 ? 1 : 0),
};

export function ease(name: Easing, t: number): number {
  const fn = EASINGS[name] ?? EASINGS.linear;
  return fn(t < 0 ? 0 : t > 1 ? 1 : t);
}
