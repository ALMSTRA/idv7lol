import type { SignalBus, SignalValue } from '@idv7lol/vehicle-signals';

/** A recorded run: per-signal samples as [time ms, value] pairs. */
export interface Recording {
  formatVersion: 1;
  name: string;
  createdAt: string;
  durationMs: number;
  intervalMs: number;
  signals: Record<string, Array<[number, SignalValue]>>;
}

export class Recorder {
  private rec: Recording | null = null;
  private startAt: number | null = null;
  private lastSample = -Infinity;

  constructor(private readonly intervalMs = 50) {}

  get recording(): boolean {
    return this.rec !== null;
  }

  /** Begin recording; time zero is the first sample taken. */
  start(name: string): void {
    this.rec = {
      formatVersion: 1,
      name,
      createdAt: new Date().toISOString(),
      durationMs: 0,
      intervalMs: this.intervalMs,
      signals: {},
    };
    this.startAt = null;
    this.lastSample = -Infinity;
  }

  /** Sample the bus if the interval has elapsed. Only valid samples are stored. */
  sample(bus: SignalBus, now: number): void {
    if (!this.rec) return;
    if (now - this.lastSample < this.intervalMs) return;
    this.lastSample = now;
    if (this.startAt === null) this.startAt = now;
    const t = now - this.startAt;
    for (const [id, s] of Object.entries(bus.snapshot())) {
      if (!s.valid) continue;
      const list = (this.rec.signals[id] ??= []);
      const last = list[list.length - 1];
      if (last && last[1] === s.value) continue; // store changes only
      list.push([t, s.value]);
    }
    this.rec.durationMs = t;
  }

  stop(): Recording | null {
    const r = this.rec;
    this.rec = null;
    return r;
  }
}

export function serializeRecording(r: Recording): string {
  return JSON.stringify(r);
}

export function parseRecording(text: string): Recording {
  const r = JSON.parse(text) as Recording;
  if (r.formatVersion !== 1 || typeof r.signals !== 'object')
    throw new Error('Not an idv7lol recording');
  return r;
}

/** Replays a recording into a bus; values hold between samples. */
export class Replayer {
  private cursor = new Map<string, number>();
  private time = 0;

  constructor(
    readonly recording: Recording,
    public loop = true,
  ) {}

  reset(): void {
    this.cursor.clear();
    this.time = 0;
  }

  get position(): number {
    return this.time;
  }

  /** Advance by dt ms and write every signal whose value changed. */
  advance(dtMs: number, bus: SignalBus, now: number): boolean {
    const dur = this.recording.durationMs;
    this.time += dtMs;
    if (this.time > dur) {
      if (!this.loop || dur <= 0) {
        this.time = dur;
        this.writeAt(dur, bus, now);
        return false;
      }
      this.time = this.time % dur;
      this.cursor.clear();
    }
    this.writeAt(this.time, bus, now);
    return true;
  }

  private writeAt(t: number, bus: SignalBus, now: number): void {
    for (const [id, samples] of Object.entries(this.recording.signals)) {
      let i = this.cursor.get(id) ?? 0;
      let changed = false;
      while (i < samples.length && samples[i]![0] <= t) {
        i += 1;
        changed = true;
      }
      if (i === 0) continue;
      this.cursor.set(id, i);
      const value = samples[i - 1]![1];
      if (changed || !bus.get(id)) bus.set(id, value, now);
      else bus.set(id, value, now); // refresh timestamp so it does not go stale
    }
  }
}
