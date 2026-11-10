import { describe, expect, it } from 'vitest';
import { getSignal } from '@idv7lol/vehicle-signals';
import {
  SCENARIOS,
  Simulator,
  VehicleModel,
  modelSignals,
  parseRecording,
  scenarioInputsAt,
  serializeRecording,
} from './index.js';

const wall = () => new Date(2026, 5, 1, 14, 30, 15);

/** Advance a simulator by wall-clock seconds; each simulator keeps its own monotonic clock. */
const clocks = new WeakMap<Simulator, number>();
function run(sim: Simulator, seconds: number, fps = 60): void {
  let now = clocks.get(sim) ?? 1000;
  const frames = Math.round(seconds * fps);
  for (let i = 1; i <= frames; i++) {
    now += 1000 / fps;
    sim.tick(now);
  }
  clocks.set(sim, now);
}

describe('VehicleModel', () => {
  it('accelerates under throttle, shifts up and brakes to a stop', () => {
    const m = new VehicleModel({}, false);
    m.inputs.throttle = 1;
    for (let i = 0; i < 60 * 12; i++) m.step(1 / 60);
    expect(m.state.speed).toBeGreaterThan(100);
    expect(m.state.gear).toBeGreaterThan(2);
    expect(m.state.rpm).toBeLessThanOrEqual(m.params.redlineRpm);
    m.inputs.throttle = 0;
    m.inputs.brake = 1;
    for (let i = 0; i < 60 * 10; i++) m.step(1 / 60);
    expect(m.state.speed).toBe(0);
    expect(m.state.rpm).toBeCloseTo(m.params.idleRpm, -1);
  });

  it('limits revs to the cold redline until the oil warms up', () => {
    const m = new VehicleModel({}, true);
    expect(m.redline).toBeLessThan(m.params.redlineRpm);
    m.inputs.gearPosition = 'N';
    m.inputs.throttle = 1;
    for (let i = 0; i < 60 * 5; i++) m.step(1 / 60);
    expect(m.state.rpm).toBeLessThanOrEqual(m.params.coldRedlineRpm + 50);
    m.state.oilTemp = 95;
    expect(m.redline).toBe(m.params.redlineRpm);
  });

  it('consumes fuel and warms up while driving', () => {
    const m = new VehicleModel({}, true);
    const fuel0 = m.state.fuelLitres;
    m.inputs.throttle = 0.5;
    for (let i = 0; i < 60 * 120; i++) m.step(1 / 60);
    expect(m.state.fuelLitres).toBeLessThan(fuel0);
    expect(m.state.coolantTemp).toBeGreaterThan(40);
    expect(m.state.tripKm).toBeGreaterThan(1);
    expect(m.averageConsumption()).toBeGreaterThan(0);
  });

  it('reports gears like the factory cluster', () => {
    const m = new VehicleModel({}, false);
    m.inputs.gearPosition = 'P';
    expect(m.gearLabel()).toBe('P');
    m.inputs.gearPosition = 'D';
    m.inputs.gearMode = 'M';
    m.inputs.manualGear = 3;
    m.step(0.1);
    expect(m.gearLabel()).toBe('3');
  });
});

describe('signal publishing', () => {
  it('produces values within the catalog ranges for every published signal', () => {
    const sim = new Simulator({ profileId: 'phev', wallClock: wall });
    sim.model.params.hybrid = true;
    sim.setInputs({ throttle: 0.8 });
    run(sim, 20);
    const snap = sim.bus.snapshot();
    expect(Object.keys(snap).length).toBeGreaterThan(40);
    for (const [id, s] of Object.entries(snap)) {
      const def = getSignal(id);
      expect(def, id).toBeDefined();
      if (!def) continue;
      if (def.kind === 'number' && typeof s.value === 'number') {
        expect(s.value, id).toBeGreaterThanOrEqual(def.min - 1e-6);
        expect(s.value, id).toBeLessThanOrEqual(def.max + 1e-6);
      }
      if (def.kind === 'enum') expect(def.enumValues, id).toContain(String(s.value));
      if (def.kind === 'boolean') expect(typeof s.value, id).toBe('boolean');
    }
    expect(snap['time.hours']?.value).toBe(14);
  });

  it('respects the vehicle profile', () => {
    const sim = new Simulator({ profileId: 'generic-ice', wallClock: wall });
    run(sim, 1);
    expect(sim.bus.get('engine.boost')).toBeUndefined();
    expect(sim.bus.get('hybrid.battery.soc')).toBeUndefined();
    expect(sim.bus.get('engine.rpm')).toBeDefined();
    sim.setProfile('bev');
    sim.bus.clear();
    run(sim, 1);
    expect(sim.bus.get('engine.rpm')).toBeUndefined();
    expect(sim.bus.get('hybrid.battery.soc')).toBeDefined();
  });

  it('applies overrides, dropped signals and communication loss', () => {
    const sim = new Simulator({ wallClock: wall });
    sim.override('vehicle.speed', 123);
    sim.dropSignal('engine.oil.temp');
    run(sim, 1);
    expect(sim.bus.get('vehicle.speed')?.value).toBe(123);
    expect(sim.bus.get('engine.oil.temp')?.valid).toBe(false);
    expect(sim.bus.number('system.signal.health')).toBeLessThan(100);
    const before = sim.bus.get('engine.rpm')!.at;
    sim.setCommLoss(true);
    run(sim, 1);
    expect(sim.bus.get('engine.rpm')!.at).toBe(before);
    sim.setCommLoss(false);
    sim.override('vehicle.speed', null);
    run(sim, 1);
    expect(sim.bus.get('engine.rpm')!.at).toBeGreaterThan(before);
  });

  it('exposes the raw model signal map', () => {
    const m = new VehicleModel({}, false);
    const sig = modelSignals(m, wall());
    expect(sig['transmission.gear']).toBe('D');
    expect(sig['engine.running']).toBe(true);
  });
});

describe('scenarios', () => {
  it('has well-formed presets', () => {
    for (const s of SCENARIOS) {
      expect(s.keyframes.length).toBeGreaterThan(0);
      expect(s.keyframes[0]!.t).toBe(0);
      for (let i = 1; i < s.keyframes.length; i++)
        expect(s.keyframes[i]!.t).toBeGreaterThanOrEqual(s.keyframes[i - 1]!.t);
      expect(s.keyframes[s.keyframes.length - 1]!.t).toBeLessThanOrEqual(s.duration);
    }
  });

  it('interpolates eased inputs and holds discrete ones', () => {
    const sc = SCENARIOS.find((s) => s.id === 'city')!;
    const base = new VehicleModel().inputs;
    const i1 = scenarioInputsAt(sc, 1, base);
    expect(i1.throttle).toBeCloseTo(0.175, 2); // halfway from 0 to 0.35 between t=0 and t=2
    expect(i1.gearPosition).toBe('D');
    const i17 = scenarioInputsAt(sc, 17, base);
    expect(i17.turnRight).toBe(true);
  });

  it('runs the track scenario and reaches high revs, then the signal-loss scenario drops signals', () => {
    const sim = new Simulator({ wallClock: wall });
    expect(sim.loadScenario('track')).toBe(true);
    let maxRpm = 0;
    const start = 1000;
    for (let i = 1; i <= 60 * 14; i++) {
      sim.tick(start + (i * 1000) / 60);
      maxRpm = Math.max(maxRpm, sim.bus.number('engine.rpm'));
    }
    expect(maxRpm).toBeGreaterThan(6000);
    expect(sim.bus.get('drive.mode')?.value).toBe('SPORT_PLUS');

    sim.loadScenario('signal-loss');
    run(sim, 9);
    expect(sim.bus.get('engine.oil.temp')?.valid).toBe(false);
    run(sim, 22);
    expect(sim.bus.get('engine.oil.temp')?.valid).toBe(true);

    sim.loadScenario('comm-failure');
    run(sim, 11);
    const at = sim.bus.get('engine.rpm')!.at;
    run(sim, 2);
    expect(sim.bus.get('engine.rpm')!.at).toBe(at);
  });

  it('pauses at the end of non-looping scenarios and honours the speed multiplier', () => {
    const sim = new Simulator({ wallClock: wall });
    sim.loadScenario('cold-start');
    sim.speed = 10;
    run(sim, 30);
    expect(sim.scenarioPosition).toBeGreaterThanOrEqual(240);
    expect(sim.paused).toBe(true);
  });
});

describe('recording and replay', () => {
  it('records changes and replays them into another bus', () => {
    const sim = new Simulator({ wallClock: wall });
    sim.setInputs({ throttle: 0.6 });
    sim.startRecording('test');
    run(sim, 3);
    const rec = sim.stopRecording()!;
    expect(rec.durationMs).toBeGreaterThan(2500);
    expect(rec.signals['engine.rpm']!.length).toBeGreaterThan(5);
    const text = serializeRecording(rec);
    const parsed = parseRecording(text);

    const sim2 = new Simulator({ wallClock: wall });
    sim2.loadReplay(parsed, false);
    run(sim2, 3.5);
    const finalRecorded = rec.signals['engine.rpm']![rec.signals['engine.rpm']!.length - 1]![1];
    expect(sim2.bus.get('engine.rpm')?.value).toBe(finalRecorded);
    expect(() => parseRecording('{"formatVersion":2}')).toThrow();
  });

  it("leaves a scenario's faults behind when going back to manual control", () => {
    const sim = new Simulator({ profileId: 'turbo-ice' });
    sim.loadScenario('comm-failure');
    sim.setCommLoss(true);
    sim.dropSignal('engine.oil.temp', true);
    sim.toManual();
    expect(sim.publisher.faults.commLoss).toBe(false);
    expect(sim.publisher.faults.dropped.size).toBe(0);
  });

  it('reports no signal health while communication is lost', () => {
    const sim = new Simulator({ profileId: 'turbo-ice' });
    sim.setCommLoss(true);
    sim.tick(1000);
    sim.tick(1100);
    expect(sim.bus.get('system.signal.health')?.value).toBe(0);
  });
});
