import { create } from 'zustand';
import { createComponent, type Component, type SignalId } from '@idv7lol/theme-schema';

/**
 * "Needle on a photo": the user clicks a dial's centre, its first mark and its last mark on a
 * picture, and gets a circular gauge that is only a needle, placed and turned to match the dial.
 */
export interface Point {
  x: number;
  y: number;
}

export interface Calibration {
  center: Point;
  /** Where the needle points at the lowest value (the 0 mark). */
  start: Point;
  /** Where it points at the highest value. */
  end: Point;
}

export interface NeedleOptions {
  id: string;
  name: string;
  signal: SignalId;
  min: number;
  max: number;
  /** The needle turns clockwise from the first mark to the last (most dials). */
  clockwise: boolean;
}

/** Degrees clockwise from 3 o'clock, 0 to 360, of `p` seen from `c` (screen y points down). */
export function angleOf(c: Point, p: Point): number {
  const a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
  return (a + 360) % 360;
}

/** The arc a dial covers: where it starts and how far it turns (negative: counter-clockwise). */
export function dialArc(
  cal: Calibration,
  clockwise: boolean,
): { startAngle: number; sweepAngle: number } {
  const startAngle = angleOf(cal.center, cal.start);
  const endAngle = angleOf(cal.center, cal.end);
  let sweep = clockwise
    ? (endAngle - startAngle + 360) % 360
    : -((startAngle - endAngle + 360) % 360);
  // the same point twice: a full turn
  if (Math.abs(sweep) < 1) sweep = clockwise ? 360 : -360;
  return { startAngle: Math.round(startAngle * 10) / 10, sweepAngle: Math.round(sweep * 10) / 10 };
}

/** The needle-only gauge for a calibrated dial. */
export function calibratedNeedle(cal: Calibration, o: NeedleOptions): Component {
  const r1 = Math.hypot(cal.start.x - cal.center.x, cal.start.y - cal.center.y);
  const r2 = Math.hypot(cal.end.x - cal.center.x, cal.end.y - cal.center.y);
  // the box reaches the marks; the needle stops just short of them
  const R = Math.max(8, Math.round((r1 + r2) / 2));
  const { startAngle, sweepAngle } = dialArc(cal, o.clockwise);
  return createComponent('gauge.arc', {
    id: o.id,
    name: o.name,
    x: Math.round(cal.center.x - R),
    y: Math.round(cal.center.y - R),
    width: R * 2,
    height: R * 2,
    binding: {
      signal: o.signal,
      min: o.min,
      max: o.max,
      smoothing: 0.12,
      scale: 1,
      offset: 0,
      clamp: true,
      fallback: 'dash',
    },
    props: {
      startAngle,
      sweepAngle,
      track: { show: false },
      fill: { show: false },
      ticks: { major: 0 },
      labels: { show: false },
      redline: { show: false },
      valueText: { show: false },
      glow: { show: false },
      needle: {
        show: true,
        color: '$accent',
        width: Math.max(3, Math.round(R / 30)),
        length: 0.92,
        tail: 0.12,
        shape: 'tapered',
        cap: { show: true, radius: Math.max(6, Math.round(R / 12)), color: '$surface' },
      },
    },
  });
}

/** The clicks of a calibration in progress (the canvas collects them while `active`). */
interface CalibrateState {
  active: boolean;
  points: Point[];
  start(): void;
  cancel(): void;
  add(p: Point): void;
  /** Take the last click back. */
  back(): void;
}

export const useCalibrateStore = create<CalibrateState>((set, get) => ({
  active: false,
  points: [],
  start: () => set({ active: true, points: [] }),
  cancel: () => set({ active: false, points: [] }),
  add: (p) => {
    if (get().points.length < 3) set({ points: [...get().points, p] });
  },
  back: () => set({ points: get().points.slice(0, -1) }),
}));
