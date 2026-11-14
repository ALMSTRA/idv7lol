import {
  SignalBus,
  convert,
  getSignal,
  type SignalSample,
  type UnitId,
} from '@idv7lol/vehicle-signals';
import type {
  Binding,
  Component,
  Comparison,
  Condition,
  DriveMode,
  Palette,
  Theme,
} from '@idv7lol/theme-schema';
import { REQUIRED_PALETTE_TOKENS } from '@idv7lol/theme-schema';
import { clamp, normalize, smoothStep } from './math.js';

/** Result of evaluating a component's binding at a point in time. */
export interface EvaluatedBinding {
  /** Raw sample as delivered by the bus (before conversion), if any. */
  sample: SignalSample | undefined;
  /** Display value: converted, scaled, smoothed and clamped. */
  value: number;
  /** Unsmoothed display value. */
  target: number;
  min: number;
  max: number;
  /** value normalised to 0..1 within [min, max]. */
  normalized: number;
  /** For enum/string signals: the string value. */
  text: string | undefined;
  /** The bus has a valid sample. */
  valid: boolean;
  /** The sample is older than the binding's staleness threshold. */
  stale: boolean;
  /** Display unit after conversion. */
  unit: UnitId;
}

interface SmoothState {
  value: number;
  lastAt: number;
}

/**
 * Mutable runtime state shared by every component while a theme runs:
 * the signal bus, smoothing memories, animation clocks and trigger edges.
 */
export class EngineState {
  readonly bus: SignalBus;
  private readonly smooth = new Map<string, SmoothState>();
  private readonly edges = new Map<string, boolean>();
  private readonly lastValues = new Map<string, unknown>();
  /** Manual palette override chosen by the user (null = automatic). */
  manualPalette: string | null = null;
  /** Monotonic time of the last frame, ms. */
  now = 0;
  /** Time when the layout appeared, ms. */
  startedAt = 0;

  constructor(bus: SignalBus = new SignalBus(), now = 0) {
    this.bus = bus;
    this.now = now;
    this.startedAt = now;
  }

  /** Advance the clock. Call once per frame before rendering. */
  tick(now: number): void {
    this.now = now;
  }

  reset(now = this.now): void {
    this.smooth.clear();
    this.edges.clear();
    this.lastValues.clear();
    this.startedAt = now;
    this.now = now;
  }

  /** Default staleness threshold: six update periods, at least one second. */
  staleThreshold(binding: Binding): number {
    if (binding.staleAfterMs) return binding.staleAfterMs;
    const def = getSignal(binding.signal);
    const rate = def?.rateHz ?? 1;
    if (rate <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(1000, (6 * 1000) / rate);
  }

  /** Evaluate a binding for a component (the id keys the smoothing memory). */
  evaluate(key: string, binding: Binding): EvaluatedBinding {
    const def = getSignal(binding.signal);
    const sample = this.bus.get(binding.signal);
    const unit: UnitId = binding.unit ?? def?.unit ?? 'none';
    const canonicalUnit = def?.unit ?? 'none';

    const convertValue = (v: number): number => {
      let out = v;
      if (def && binding.unit && binding.unit !== canonicalUnit) {
        try {
          out = convert(out, canonicalUnit, binding.unit);
        } catch {
          /* dimension mismatch is reported by the validator */
        }
      }
      return out * binding.scale + binding.offset;
    };

    const defMin = def ? convertValue(def.min) : 0;
    const defMax = def ? convertValue(def.max) : 1;
    const min = binding.min ?? Math.min(defMin, defMax);
    const max = binding.max ?? Math.max(defMin, defMax);

    const valid = !!sample && sample.valid;
    const stale = valid ? this.now - sample.at > this.staleThreshold(binding) : true;

    let text: string | undefined;
    let targetRaw = 0;
    if (valid) {
      const v = sample.value;
      if (typeof v === 'number') targetRaw = v;
      else if (typeof v === 'boolean') targetRaw = v ? 1 : 0;
      else {
        text = v;
        const n = Number(v);
        targetRaw = Number.isFinite(n) ? n : 0;
      }
    }
    let target = convertValue(targetRaw);
    if (binding.clamp) target = clamp(target, min, max);

    let value = target;
    if (binding.smoothing > 0) {
      const s = this.smooth.get(key);
      if (!s) {
        this.smooth.set(key, { value: target, lastAt: this.now });
      } else {
        const dt = Math.max(0, (this.now - s.lastAt) / 1000);
        s.value = smoothStep(s.value, target, binding.smoothing, dt);
        s.lastAt = this.now;
        value = s.value;
      }
    }

    return {
      sample,
      value,
      target,
      min,
      max,
      normalized: normalize(value, min, max),
      text,
      valid,
      stale,
      unit,
    };
  }

  /** Evaluate a condition against the bus. Unknown signals are false. */
  condition(c: Condition): boolean {
    if ('all' in c) return c.all.every((x) => this.condition(x));
    if ('any' in c) return c.any.some((x) => this.condition(x));
    if ('not' in c) return !this.condition(c.not);
    return this.compare(c);
  }

  private compare(c: Comparison): boolean {
    const s = this.bus.get(c.signal);
    if (c.op === 'stale') {
      if (!s || !s.valid) return true;
      const def = getSignal(c.signal);
      const rate = def?.rateHz ?? 1;
      const threshold = rate <= 0 ? Number.POSITIVE_INFINITY : Math.max(1000, (6 * 1000) / rate);
      return this.now - s.at > threshold;
    }
    if (!s || !s.valid) return false;
    const v = s.value;
    const num = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
    const cmpNum = typeof c.value === 'number' ? c.value : Number(c.value);
    switch (c.op) {
      case 'truthy':
        return typeof v === 'string' ? v !== '' && v !== '0' && v.toLowerCase() !== 'false' : !!v;
      case 'falsy':
        return typeof v === 'string' ? v === '' || v === '0' || v.toLowerCase() === 'false' : !v;
      case 'eq':
        return typeof c.value === 'string' ? String(v) === c.value : num === cmpNum;
      case 'neq':
        return typeof c.value === 'string' ? String(v) !== c.value : num !== cmpNum;
      case 'gt':
        return num > cmpNum;
      case 'gte':
        return num >= cmpNum;
      case 'lt':
        return num < cmpNum;
      case 'lte':
        return num <= cmpNum;
      case 'between':
        return num >= cmpNum && num <= (c.value2 ?? cmpNum);
    }
  }

  /**
   * Edge detection for triggers: returns 'rising', 'falling' or null for the
   * boolean `value` identified by `key`, remembering the previous value.
   */
  edge(key: string, value: boolean): 'rising' | 'falling' | null {
    const prev = this.edges.get(key);
    this.edges.set(key, value);
    if (prev === undefined) return null;
    if (!prev && value) return 'rising';
    if (prev && !value) return 'falling';
    return null;
  }

  /** True when the signal's value differs from the last time this key saw it. */
  changed(key: string, signal: string): boolean {
    const s = this.bus.get(signal);
    const v = s && s.valid ? s.value : undefined;
    const prev = this.lastValues.get(key);
    const has = this.lastValues.has(key);
    this.lastValues.set(key, v);
    return has && prev !== v;
  }
}

/** Pick the palette a theme should use right now. */
export function selectPaletteId(theme: Theme, state: EngineState): string {
  if (state.manualPalette && theme.palette.allowManual && theme.palettes[state.manualPalette]) {
    return state.manualPalette;
  }
  const mode = state.bus.get('drive.mode');
  if (mode && mode.valid && typeof mode.value === 'string') {
    const id = theme.palette.byDriveMode[mode.value as DriveMode];
    if (id && theme.palettes[id]) return id;
  }
  return theme.palette.default;
}

/**
 * A palette guaranteed to contain every required token: missing tokens fall
 * back to the default palette, then to magenta so the problem is visible.
 */
export function resolvePalette(theme: Theme, id: string): Palette {
  const base = theme.palettes[theme.palette.default];
  const chosen = theme.palettes[id] ?? base;
  const colors: Record<string, string> = { ...(base?.colors ?? {}), ...(chosen?.colors ?? {}) };
  for (const token of REQUIRED_PALETTE_TOKENS) {
    if (!colors[token]) colors[token] = '#ff00ff';
  }
  return { name: chosen?.name ?? id, colors };
}

/** Collect the signal ids a component tree references (bindings, conditions, triggers). */
export function collectSignals(
  components: readonly Component[],
  out = new Set<string>(),
): Set<string> {
  const fromCondition = (c: Condition | undefined): void => {
    if (!c) return;
    if ('all' in c) c.all.forEach(fromCondition);
    else if ('any' in c) c.any.forEach(fromCondition);
    else if ('not' in c) fromCondition(c.not);
    else out.add(c.signal);
  };
  for (const c of components) {
    if (c.binding) out.add(c.binding.signal);
    fromCondition(c.visibleWhen);
    for (const a of c.animations) {
      if (a.trigger.on === 'change') out.add(a.trigger.signal);
      else if ('condition' in a.trigger) fromCondition(a.trigger.condition);
    }
    if (c.type === 'status.panel') for (const r of c.props.rows) out.add(r.binding.signal);
    if (c.type === 'indicator.gear') out.add(c.props.modeSignal);
    if (c.type === 'image' && c.props.speedFrom) out.add(c.props.speedFrom.signal);
    if (c.type === 'clock')
      ['time.hours', 'time.minutes', 'time.seconds'].forEach((s) => out.add(s));
    if (c.type === 'group') collectSignals(c.props.children, out);
  }
  return out;
}
