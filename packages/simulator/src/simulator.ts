import { SignalBus } from '@idv7lol/vehicle-signals';
import { SignalPublisher } from './publisher.js';
import { Recorder, Replayer, type Recording } from './recorder.js';
import {
  getScenario,
  scenarioFaultsBetween,
  scenarioInputsAt,
  type Scenario,
} from './scenarios.js';
import { VehicleModel, type VehicleInputs, type VehicleParams } from './vehicle-model.js';

export type SimulatorMode = 'manual' | 'scenario' | 'replay';

export interface SimulatorOptions {
  profileId?: string;
  params?: Partial<VehicleParams>;
  /** Wall clock used for time-of-day signals. */
  wallClock?: () => Date;
  /** Physics step, seconds. Smaller is smoother; 1/120 is plenty. */
  physicsStep?: number;
}

/**
 * The simulator facade used by the Studio and by tests. Call `tick(now)`
 * once per frame with a monotonic millisecond clock; it advances the model,
 * applies the active scenario or replay, and publishes into the bus.
 */
export class Simulator {
  readonly bus: SignalBus;
  readonly model: VehicleModel;
  readonly publisher: SignalPublisher;
  readonly recorder = new Recorder();
  mode: SimulatorMode = 'manual';
  /** Playback speed multiplier. */
  speed = 1;
  paused = false;

  private scenario: Scenario | null = null;
  private scenarioTime = 0;
  private replayer: Replayer | null = null;
  private lastNow: number | null = null;
  private accumulator = 0;
  private readonly physicsStep: number;
  private readonly wallClock: () => Date;
  /** Simulated seconds elapsed. */
  elapsed = 0;

  constructor(opts: SimulatorOptions = {}) {
    this.bus = new SignalBus();
    this.model = new VehicleModel(opts.params ?? {}, false);
    this.publisher = new SignalPublisher(opts.profileId);
    this.physicsStep = opts.physicsStep ?? 1 / 120;
    this.wallClock = opts.wallClock ?? (() => new Date());
  }

  /* ----- inputs ----- */

  setInput<K extends keyof VehicleInputs>(key: K, value: VehicleInputs[K]): void {
    this.model.inputs[key] = value;
  }

  setInputs(partial: Partial<VehicleInputs>): void {
    Object.assign(this.model.inputs, partial);
  }

  get inputs(): Readonly<VehicleInputs> {
    return this.model.inputs;
  }

  /** Force a signal to a value (null removes the override). */
  override(signal: string, value: number | string | boolean | null): void {
    if (value === null) this.publisher.overrides.delete(signal);
    else this.publisher.overrides.set(signal, value);
  }

  dropSignal(signal: string, dropped = true): void {
    if (dropped) this.publisher.faults.dropped.add(signal);
    else this.publisher.faults.dropped.delete(signal);
  }

  setCommLoss(on: boolean): void {
    this.publisher.faults.commLoss = on;
  }

  setLatency(ms: number): void {
    this.publisher.faults.latencyMs = Math.max(0, ms);
  }

  setProfile(id: string): void {
    this.publisher.setProfile(id);
  }

  /* ----- scenarios and replay ----- */

  loadScenario(idOrScenario: string | Scenario): boolean {
    const sc = typeof idOrScenario === 'string' ? getScenario(idOrScenario) : idOrScenario;
    if (!sc) return false;
    this.scenario = sc;
    this.scenarioTime = 0;
    this.mode = 'scenario';
    this.model.reset(sc.cold);
    this.publisher.faults.dropped.clear();
    this.publisher.faults.commLoss = false;
    // Apply the first keyframe immediately.
    Object.assign(this.model.inputs, scenarioInputsAt(sc, 0, this.model.inputs));
    const f0 = scenarioFaultsBetween(sc, -1, 0);
    this.applyFaults(f0.faults, f0.commLoss);
    return true;
  }

  get activeScenario(): Scenario | null {
    return this.scenario;
  }

  get scenarioPosition(): number {
    return this.scenarioTime;
  }

  loadReplay(rec: Recording, loop = true): void {
    this.replayer = new Replayer(rec, loop);
    this.mode = 'replay';
  }

  toManual(): void {
    this.mode = 'manual';
    this.scenario = null;
    this.replayer = null;
  }

  startRecording(name = 'recording'): void {
    this.recorder.start(name);
  }

  stopRecording(): Recording | null {
    return this.recorder.stop();
  }

  reset(cold = false): void {
    this.model.reset(cold);
    this.bus.clear();
    this.elapsed = 0;
    this.scenarioTime = 0;
    this.accumulator = 0;
    this.replayer?.reset();
  }

  /* ----- stepping ----- */

  /** Advance to `now` (ms, monotonic) and publish. Returns simulated dt in seconds. */
  tick(now: number): number {
    if (this.lastNow === null) this.lastNow = now;
    let dtMs = Math.max(0, Math.min(250, now - this.lastNow));
    this.lastNow = now;
    if (this.paused) dtMs = 0;
    const dt = (dtMs / 1000) * this.speed;

    if (this.mode === 'replay' && this.replayer) {
      this.replayer.advance(dtMs * this.speed, this.bus, now);
      this.recorder.sample(this.bus, now);
      this.elapsed += dt;
      return dt;
    }

    if (this.mode === 'scenario' && this.scenario && dt > 0) {
      const prev = this.scenarioTime;
      this.scenarioTime += dt;
      Object.assign(
        this.model.inputs,
        scenarioInputsAt(this.scenario, this.scenarioTime, this.model.inputs),
      );
      const f = scenarioFaultsBetween(this.scenario, prev, this.scenarioTime);
      this.applyFaults(f.faults, f.commLoss);
      if (!this.scenario.loop && this.scenarioTime >= this.scenario.duration) this.paused = true;
    }

    // Fixed-step physics for stability.
    this.accumulator += dt;
    const step = this.physicsStep;
    let guard = 0;
    while (this.accumulator >= step && guard < 60) {
      this.model.step(step);
      this.accumulator -= step;
      guard += 1;
    }
    if (guard >= 60) this.accumulator = 0;

    this.elapsed += dt;
    this.publisher.publish(this.bus, this.model, now, this.wallClock());
    this.recorder.sample(this.bus, now);
    return dt;
  }

  private applyFaults(faults: Record<string, boolean>, commLoss: boolean | undefined): void {
    for (const [id, on] of Object.entries(faults)) this.dropSignal(id, on);
    if (commLoss !== undefined) this.setCommLoss(commLoss);
  }
}
