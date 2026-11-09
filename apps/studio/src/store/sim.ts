import { create } from 'zustand';
import { Simulator, type Recording, type VehicleInputs } from '@idv7lol/simulator';

/** One simulator for the whole Studio; the canvas ticks it every frame. */
export const simulator = new Simulator({ profileId: 'turbo-ice' });
simulator.setInputs({ throttle: 0.15, gearPosition: 'D' });

interface SimState {
  running: boolean;
  scenarioId: string | null;
  speed: number;
  recording: boolean;
  lastRecording: Recording | null;
  /** Bumps on every change so panels re-render; the Simulator itself is mutable. */
  rev: number;

  setRunning(on: boolean): void;
  setSpeed(x: number): void;
  loadScenario(id: string | null): void;
  reset(): void;
  setInputs(partial: Partial<VehicleInputs>): void;
  override(signal: string, value: number | string | boolean | null): void;
  drop(signal: string, on: boolean): void;
  setCommLoss(on: boolean): void;
  setLatency(ms: number): void;
  setProfile(id: string): void;
  toggleRecording(): void;
  replayLast(): void;
  touch(): void;
}

export const useSimStore = create<SimState>((set, get) => ({
  running: true,
  scenarioId: null,
  speed: 1,
  recording: false,
  lastRecording: null,
  rev: 0,

  setRunning: (on) => {
    simulator.paused = !on;
    set({ running: on });
  },
  setSpeed: (x) => {
    simulator.speed = x;
    set({ speed: x });
  },
  loadScenario: (id) => {
    if (id) simulator.loadScenario(id);
    else simulator.toManual();
    simulator.paused = !get().running;
    set({ scenarioId: id, rev: get().rev + 1 });
  },
  reset: () => {
    const id = get().scenarioId;
    simulator.reset(false);
    if (id) simulator.loadScenario(id);
    simulator.paused = !get().running;
    set({ rev: get().rev + 1 });
  },
  setInputs: (partial) => {
    simulator.setInputs(partial);
    set({ rev: get().rev + 1 });
  },
  override: (signal, value) => {
    simulator.override(signal, value);
    set({ rev: get().rev + 1 });
  },
  drop: (signal, on) => {
    simulator.dropSignal(signal, on);
    set({ rev: get().rev + 1 });
  },
  setCommLoss: (on) => {
    simulator.setCommLoss(on);
    set({ rev: get().rev + 1 });
  },
  setLatency: (ms) => {
    simulator.setLatency(ms);
    set({ rev: get().rev + 1 });
  },
  setProfile: (id) => {
    simulator.setProfile(id);
    simulator.bus.clear();
    set({ rev: get().rev + 1 });
  },
  toggleRecording: () => {
    if (get().recording) {
      const rec = simulator.stopRecording();
      set({ recording: false, lastRecording: rec });
    } else {
      simulator.startRecording('studio');
      set({ recording: true });
    }
  },
  replayLast: () => {
    const rec = get().lastRecording;
    if (!rec) return;
    simulator.loadReplay(rec, true);
    set({ scenarioId: null, rev: get().rev + 1 });
  },
  touch: () => set({ rev: get().rev + 1 }),
}));
