import type { VehicleInputs } from './vehicle-model.js';

/** A partial input set applied at a point in time, plus optional fault changes. */
export interface ScenarioKeyframe {
  /** Seconds from the start of the scenario. */
  t: number;
  inputs?: Partial<VehicleInputs>;
  /** Signals to drop (true) or restore (false) at this time. */
  faults?: Record<string, boolean>;
  commLoss?: boolean;
  /** Interpolate throttle/brake/cruise/steering linearly towards the next keyframe. */
  ease?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  /** Total length in seconds. */
  duration: number;
  loop: boolean;
  /** Start from a cold engine. */
  cold: boolean;
  keyframes: ScenarioKeyframe[];
}

const K = (
  t: number,
  inputs: Partial<VehicleInputs>,
  extra: Partial<ScenarioKeyframe> = {},
): ScenarioKeyframe => ({
  t,
  inputs,
  ease: true,
  ...extra,
});

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'idle',
    name: 'Idle, warm engine',
    description: 'Engine running, car stopped in Park. Good for checking layout at rest.',
    duration: 30,
    loop: true,
    cold: false,
    keyframes: [K(0, { throttle: 0, brake: 0.3, gearPosition: 'P', driveMode: 'COMFORT' })],
  },
  {
    id: 'cold-start',
    name: 'Cold start and warm-up',
    description:
      'Cold oil and coolant, gentle driving; shows the cold redline and temperature rise.',
    duration: 240,
    loop: false,
    cold: true,
    keyframes: [
      K(0, { throttle: 0, brake: 0.3, gearPosition: 'P' }),
      K(5, { gearPosition: 'D', brake: 0 }),
      K(8, { throttle: 0.25 }),
      K(40, { throttle: 0.3 }),
      K(60, { throttle: 0.1 }),
      K(90, { throttle: 0.35 }),
      K(200, { throttle: 0.2 }),
      K(240, { throttle: 0.2 }),
    ],
  },
  {
    id: 'city',
    name: 'City driving',
    description: 'Stop-and-go with turn signals, 0–60 km/h.',
    duration: 60,
    loop: true,
    cold: false,
    keyframes: [
      K(0, {
        throttle: 0,
        brake: 0.5,
        gearPosition: 'D',
        driveMode: 'COMFORT',
        turnLeft: false,
        turnRight: false,
      }),
      K(2, { throttle: 0.35, brake: 0 }),
      K(10, { throttle: 0.2 }),
      K(16, { throttle: 0, brake: 0.4, turnRight: true }),
      K(22, { brake: 0.6 }),
      K(25, { brake: 0.5, throttle: 0, turnRight: false }),
      K(28, { throttle: 0.4, brake: 0 }),
      K(36, { throttle: 0.15, turnLeft: true }),
      K(44, { throttle: 0, brake: 0.3, turnLeft: false }),
      K(52, { brake: 0.5 }),
      K(60, { brake: 0.5 }),
    ],
  },
  {
    id: 'highway',
    name: 'Highway cruise',
    description: 'Acceleration to 130 km/h, cruise control engaged, overtaking.',
    duration: 90,
    loop: true,
    cold: false,
    keyframes: [
      K(0, { throttle: 0.6, brake: 0, gearPosition: 'D', driveMode: 'COMFORT', cruiseSpeed: 0 }),
      K(18, { throttle: 0.3 }),
      K(25, { throttle: 0, cruiseSpeed: 130 }),
      K(50, { throttle: 0.8, cruiseSpeed: 0 }),
      K(58, { throttle: 0.2 }),
      K(64, { throttle: 0, cruiseSpeed: 130 }),
      K(90, { cruiseSpeed: 130 }),
    ],
  },
  {
    id: 'track',
    name: 'Track lap (Sport+)',
    description:
      'Full-throttle runs to the redline, hard braking, manual gears; exercises shift lights.',
    duration: 70,
    loop: true,
    cold: false,
    keyframes: [
      K(0, { throttle: 1, brake: 0, gearPosition: 'D', gearMode: 'S', driveMode: 'SPORT_PLUS' }),
      K(14, { throttle: 1 }),
      K(15, { throttle: 0, brake: 0.9 }),
      K(19, { throttle: 0.5, brake: 0 }),
      K(26, { throttle: 1 }),
      K(36, { throttle: 0, brake: 1 }),
      K(40, { throttle: 0.7, brake: 0 }),
      K(52, { throttle: 1 }),
      K(62, { throttle: 0, brake: 0.8 }),
      K(66, { throttle: 0.4, brake: 0 }),
      K(70, { throttle: 1 }),
    ],
  },
  {
    id: 'redline',
    name: 'Redline in neutral',
    description:
      'Blips to the limiter with the car stopped; isolates the tachometer and shift lights.',
    duration: 12,
    loop: true,
    cold: false,
    keyframes: [
      K(0, { throttle: 0, gearPosition: 'N', brake: 0.3, driveMode: 'SPORT' }),
      K(1.5, { throttle: 1 }),
      K(4.5, { throttle: 1 }),
      K(5, { throttle: 0 }),
      K(8, { throttle: 0.5 }),
      K(10, { throttle: 0 }),
      K(12, { throttle: 0 }),
    ],
  },
  {
    id: 'manual-shifts',
    name: 'Manual gear changes',
    description: 'Shifts 1→6 and back in manual mode; triggers gear-change animations.',
    duration: 40,
    loop: true,
    cold: false,
    keyframes: [
      K(0, {
        throttle: 0.7,
        brake: 0,
        gearPosition: 'D',
        gearMode: 'M',
        manualGear: 1,
        driveMode: 'SPORT',
      }),
      K(4, { manualGear: 2 }, { ease: false }),
      K(8, { manualGear: 3 }, { ease: false }),
      K(13, { manualGear: 4 }, { ease: false }),
      K(19, { manualGear: 5 }, { ease: false }),
      K(26, { manualGear: 6, throttle: 0.4 }, { ease: false }),
      K(30, { throttle: 0, brake: 0.6, manualGear: 4 }, { ease: false }),
      K(34, { manualGear: 2, brake: 0.6 }, { ease: false }),
      K(38, { manualGear: 1, brake: 0.8 }, { ease: false }),
      K(40, { brake: 0.8 }),
    ],
  },
  {
    id: 'drive-modes',
    name: 'Driving mode changes',
    description:
      'Cycles ECO PRO → COMFORT → SPORT → SPORT+ while cruising; exercises palette switching.',
    duration: 40,
    loop: true,
    cold: false,
    keyframes: [
      K(0, { throttle: 0.3, gearPosition: 'D', gearMode: 'D', driveMode: 'ECO_PRO' }),
      K(10, { driveMode: 'COMFORT' }, { ease: false }),
      K(20, { driveMode: 'SPORT', gearMode: 'S' }, { ease: false }),
      K(30, { driveMode: 'SPORT_PLUS' }, { ease: false }),
      K(40, { driveMode: 'SPORT_PLUS' }),
    ],
  },
  {
    id: 'signal-loss',
    name: 'Signal loss',
    description: 'Oil temperature, boost and then speed drop out and come back; shows fallbacks.',
    duration: 40,
    loop: true,
    cold: false,
    keyframes: [
      K(
        0,
        { throttle: 0.4, gearPosition: 'D' },
        { faults: { 'engine.oil.temp': false, 'engine.boost': false, 'vehicle.speed': false } },
      ),
      K(8, {}, { faults: { 'engine.oil.temp': true } }),
      K(14, {}, { faults: { 'engine.boost': true } }),
      K(20, {}, { faults: { 'vehicle.speed': true } }),
      K(
        30,
        {},
        { faults: { 'engine.oil.temp': false, 'engine.boost': false, 'vehicle.speed': false } },
      ),
      K(40, { throttle: 0.4 }),
    ],
  },
  {
    id: 'comm-failure',
    name: 'Communication failure',
    description: 'All vehicle data stops for 6 seconds; the layout must fall back and recover.',
    duration: 30,
    loop: true,
    cold: false,
    keyframes: [
      K(0, { throttle: 0.5, gearPosition: 'D' }, { commLoss: false }),
      K(10, {}, { commLoss: true }),
      K(16, {}, { commLoss: false }),
      K(30, { throttle: 0.5 }),
    ],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

const EASED_KEYS: ReadonlyArray<keyof VehicleInputs> = [
  'throttle',
  'brake',
  'cruiseSpeed',
  'outsideTemp',
];

/**
 * Inputs at time t of a scenario: discrete fields take the value of the last
 * keyframe at or before t, eased numeric fields interpolate to the next one.
 */
export function scenarioInputsAt(
  scenario: Scenario,
  t: number,
  base: VehicleInputs,
): Partial<VehicleInputs> {
  const out: Partial<VehicleInputs> = {};
  const kfs = scenario.keyframes;
  if (kfs.length === 0) return out;
  const time =
    scenario.loop && scenario.duration > 0
      ? ((t % scenario.duration) + scenario.duration) % scenario.duration
      : Math.min(t, scenario.duration);
  let idx = -1;
  for (let i = 0; i < kfs.length; i++) if (kfs[i]!.t <= time) idx = i;
  // discrete fields: last value set by any keyframe up to idx
  const acc: Partial<VehicleInputs> = {};
  for (let i = 0; i <= idx; i++) Object.assign(acc, kfs[i]!.inputs ?? {});
  Object.assign(out, acc);
  const cur = kfs[idx];
  const next = kfs[idx + 1];
  if (cur && next && cur.ease !== false) {
    const span = next.t - cur.t;
    const k = span > 0 ? (time - cur.t) / span : 1;
    for (const key of EASED_KEYS) {
      const a = (acc[key] ?? base[key]) as number;
      const b = next.inputs?.[key];
      if (typeof b === 'number' && typeof a === 'number')
        (out as Record<string, unknown>)[key] = a + (b - a) * k;
    }
  }
  return out;
}

/** Fault changes that occur in (prevT, t]. */
export function scenarioFaultsBetween(
  scenario: Scenario,
  prevT: number,
  t: number,
): { faults: Record<string, boolean>; commLoss?: boolean } {
  const faults: Record<string, boolean> = {};
  let commLoss: boolean | undefined;
  const dur = scenario.duration;
  const norm = (x: number) => (scenario.loop && dur > 0 ? ((x % dur) + dur) % dur : x);
  const a = norm(prevT);
  const b = norm(t);
  const inRange = (kt: number) => (a <= b ? kt > a && kt <= b : kt > a || kt <= b);
  for (const kf of scenario.keyframes) {
    if (!inRange(kf.t) && !(t === 0 && kf.t === 0)) continue;
    if (kf.faults) Object.assign(faults, kf.faults);
    if (kf.commLoss !== undefined) commLoss = kf.commLoss;
  }
  return { faults, commLoss };
}
