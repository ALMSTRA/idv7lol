/**
 * A tiny in-memory signal bus: the runtime, the simulator and the Studio all
 * write values into one of these and components read from it.
 *
 * Values carry a timestamp so consumers can tell stale data from fresh data
 * and never show a frozen reading as if it were live.
 */

export type SignalValue = number | boolean | string;

export interface SignalSample {
  value: SignalValue;
  /** Milliseconds, in the clock of the producer (usually performance.now / Date.now). */
  at: number;
  /** False when the producer reports the signal as unavailable. */
  valid: boolean;
}

export type SignalListener = (id: string, sample: SignalSample) => void;

export class SignalBus {
  private readonly samples = new Map<string, SignalSample>();
  private readonly listeners = new Set<SignalListener>();
  private readonly wildcard = new Set<SignalListener>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  set(id: string, value: SignalValue, at: number = this.now()): void {
    const sample: SignalSample = { value, at, valid: true };
    this.samples.set(id, sample);
    this.emit(id, sample);
  }

  /** Mark a signal as unavailable, keeping the last value for reference. */
  invalidate(id: string, at: number = this.now()): void {
    const prev = this.samples.get(id);
    const sample: SignalSample = { value: prev?.value ?? 0, at, valid: false };
    this.samples.set(id, sample);
    this.emit(id, sample);
  }

  get(id: string): SignalSample | undefined {
    return this.samples.get(id);
  }

  /** Numeric view of a signal; booleans become 0/1, invalid or missing become `fallback`. */
  number(id: string, fallback = 0): number {
    const s = this.samples.get(id);
    if (!s || !s.valid) return fallback;
    if (typeof s.value === 'number') return Number.isFinite(s.value) ? s.value : fallback;
    if (typeof s.value === 'boolean') return s.value ? 1 : 0;
    const n = Number(s.value);
    return Number.isFinite(n) ? n : fallback;
  }

  /**
   * True when the signal has a valid sample newer than `maxAgeMs`. Pass
   * `Infinity` to only check validity.
   */
  isFresh(id: string, maxAgeMs: number, at: number = this.now()): boolean {
    const s = this.samples.get(id);
    return !!s && s.valid && at - s.at <= maxAgeMs;
  }

  ids(): string[] {
    return [...this.samples.keys()];
  }

  snapshot(): Record<string, SignalSample> {
    const out: Record<string, SignalSample> = {};
    for (const [k, v] of this.samples) out[k] = { ...v };
    return out;
  }

  /** Subscribe to one signal id, or to every signal with `'*'`. Returns an unsubscribe function. */
  subscribe(id: string, listener: SignalListener): () => void {
    if (id === '*') {
      this.wildcard.add(listener);
      return () => this.wildcard.delete(listener);
    }
    const wrapped: SignalListener = (sid, sample) => {
      if (sid === id) listener(sid, sample);
    };
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  clear(): void {
    this.samples.clear();
  }

  private emit(id: string, sample: SignalSample): void {
    for (const l of this.listeners) l(id, sample);
    for (const l of this.wildcard) l(id, sample);
  }
}
