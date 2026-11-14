import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface Tank {
  litres: number | null;
  rangeKm: number | null;
  odometerKm: number | null;
  reserve: boolean | null;
}
interface Level {
  pct: number;
  src: 'obd' | 'litres';
  capacity: { litres: number; src: 'setting' | 'derived' | 'learned' | 'default' } | null;
}
interface State {
  learnedMax?: number;
  derived?: number;
}
interface Gauge {
  tank(litres: number, now: number): void;
  obd(pct: number, now: number): void;
  tick(now: number): void;
  capacity(setting?: unknown): { litres: number; src: string };
  level(now: number, setting?: unknown): Level | null;
}
// The car app is CommonJS for Node 8; load it as the head unit would.
const { FuelGauge, parseTank, CarAwake } = require('./fuel.js') as {
  FuelGauge: new (o?: {
    state?: State | null;
    save?: (s: State) => void;
    defaultLitres?: number;
  }) => Gauge;
  parseTank: (v: unknown) => Tank;
  CarAwake: new () => {
    note(condition: number | undefined): void;
    sample(speed: unknown, rpm: unknown, now: number): void;
    on(now: number): boolean;
  };
};

const S = 1000;

describe('parseTank (KombiIF.statusRangeTankStatus)', () => {
  it('reads litres, range, odometer and the reserve warning (a G05 X5 45e, tank full)', () => {
    expect(
      parseTank({
        fluidLevelFuelTank: 68,
        fluidLevelFuelTankLeftHand: 0,
        fluidLevelFuelTankRightHand: 137,
        statusFluidLevelFuelTankSpare: 'NICHT_AKTIV',
        range: 521,
        mileageKilometre: 123456,
      }),
    ).toEqual({ litres: 68, rangeKm: 521, odometerKm: 123456, reserve: false });
  });

  it('takes the reserve warning by name or wire number', () => {
    expect(parseTank({ statusFluidLevelFuelTankSpare: 'AKTIV' }).reserve).toBe(true);
    expect(parseTank({ statusFluidLevelFuelTankSpare: 1 }).reserve).toBe(true);
    expect(parseTank({ statusFluidLevelFuelTankSpare: 0 }).reserve).toBe(false);
  });

  it('leaves out what the car marks as no value', () => {
    expect(
      parseTank({
        fluidLevelFuelTank: 255,
        range: 4095,
        mileageKilometre: 16777215,
        statusFluidLevelFuelTankSpare: 'SIGNAL_UNGUELTIG',
      }),
    ).toEqual({ litres: null, rangeKm: null, odometerKm: null, reserve: null });
  });

  it('copes with a missing or odd payload', () => {
    const none = { litres: null, rangeKm: null, odometerKm: null, reserve: null };
    expect(parseTank(undefined)).toEqual(none);
    expect(parseTank('x')).toEqual(none);
    expect(parseTank({ fluidLevelFuelTank: -1, range: 'a', mileageKilometre: 0 })).toEqual(none);
  });
});

describe('FuelGauge', () => {
  it('has no level before the car says anything', () => {
    expect(new FuelGauge().level(0)).toBeNull();
  });

  it('starts from a medium tank size until it knows better', () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(34, 0);
    const l = g.level(1 * S)!;
    expect(l.src).toBe('litres');
    expect(l.capacity).toEqual({ litres: 65, src: 'default' });
    expect(l.pct).toBeCloseTo((34 / 65) * 100, 5);
  });

  it('learns a bigger tank from a level that held, so a full tank reads full', () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(68, 0);
    g.tick(61 * S);
    expect(g.capacity()).toEqual({ litres: 68, src: 'learned' });
    expect(g.level(62 * S)!.pct).toBeCloseTo(100, 5);
  });

  it('does not learn a level that did not hold', () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(80, 0);
    g.tank(68, 10 * S);
    g.tick(30 * S);
    g.tick(71 * S);
    expect(g.capacity()).toEqual({ litres: 68, src: 'learned' });
  });

  it('never learns a tank smaller than the medium size from litres alone, so a half tank does not read full', () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(30, 0);
    g.tick(120 * S);
    expect(g.capacity()).toEqual({ litres: 65, src: 'default' });
    expect(g.level(121 * S)!.pct).toBeCloseTo((30 / 65) * 100, 5);
  });

  it('uses the tank size set in the settings', () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(34, 0);
    expect(g.capacity(40)).toEqual({ litres: 40, src: 'setting' });
    expect(g.level(1 * S, 40)!.pct).toBeCloseTo(85, 5);
    // 0 is the settings' Automatic
    expect(g.capacity(0)).toEqual({ litres: 65, src: 'default' });
  });

  it("takes the engine unit's own percentage while it is fresh, then falls back to litres", () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(34, 0);
    g.obd(62, 0);
    expect(g.level(10 * S)).toMatchObject({ pct: 62, src: 'obd' });
    expect(g.level(61 * S)!.src).toBe('litres');
  });

  it('works out the real tank size from litres and the percentage, small tanks too', () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(36, 0);
    [90, 90.2, 89.8].forEach((pct, i) => g.obd(pct, i * 10 * S));
    expect(g.capacity()).toEqual({ litres: 40, src: 'derived' });
    // once the engine unit stops answering, litres over the real size
    expect(g.level(200 * S)).toMatchObject({
      src: 'litres',
      capacity: { litres: 40, src: 'derived' },
    });
    expect(g.level(200 * S)!.pct).toBeCloseTo(90, 5);
  });

  it('works the size out only from readings that agree, and not from a low tank', () => {
    const low = new FuelGauge({ defaultLitres: 65 });
    low.tank(10, 0);
    [25, 25, 25].forEach((pct, i) => low.obd(pct, i * 10 * S));
    expect(low.capacity().src).toBe('default');

    const jumpy = new FuelGauge({ defaultLitres: 65 });
    jumpy.tank(36, 0);
    [90, 60, 75].forEach((pct, i) => jumpy.obd(pct, i * 10 * S));
    expect(jumpy.capacity().src).toBe('default');
  });

  it('keeps what it learned for the next start', () => {
    const saved: State[] = [];
    const g = new FuelGauge({ defaultLitres: 65, save: (s) => saved.push({ ...s }) });
    g.tank(68, 0);
    g.tick(61 * S);
    expect(saved.at(-1)).toMatchObject({ learnedMax: 68 });

    const again = new FuelGauge({ defaultLitres: 65, state: saved.at(-1) });
    expect(again.capacity()).toEqual({ litres: 68, src: 'learned' });
    expect(new FuelGauge({ defaultLitres: 65, state: { derived: 40 } }).capacity()).toEqual({
      litres: 40,
      src: 'derived',
    });
  });

  it('keeps the percentage between 0 and 100', () => {
    const g = new FuelGauge({ defaultLitres: 65 });
    g.tank(70, 0);
    expect(g.level(1 * S)!.pct).toBe(100);
    g.obd(140, 2 * S);
    expect(g.level(3 * S)!.src).toBe('litres');
  });
});

// A diagnostic request goes through the car's gateway and wakes its networks; asked while the car
// is parked they never sleep, and the car stores faults for it (seen by another iDrive 7 project
// whose apps read a locked car's units). The engine unit is asked only while the car is on.
describe('CarAwake (when the engine unit may be asked)', () => {
  const MIN = 60 * S;

  it('says on in the states with the ignition on, and off in the parked ones', () => {
    const a = new CarAwake();
    for (const on of [7, 8, 10, 12]) {
      a.note(on);
      expect(a.on(0), `state ${on}`).toBe(true);
    }
    for (const off of [1, 2, 3, 5]) {
      a.note(off);
      expect(a.on(0), `state ${off}`).toBe(false);
    }
  });

  it('counts a moving car or a running engine as on, whatever the state said', () => {
    const a = new CarAwake();
    a.note(5);
    a.sample(40, 1800, 10 * S);
    expect(a.on(20 * S)).toBe(true);
    expect(a.on(10 * S + 31 * S)).toBe(false);
    a.sample(0, 750, 50 * S); // idling
    expect(a.on(55 * S)).toBe(true);
  });

  it('without a state from the car, stays on for 3 minutes after it last moved or ran', () => {
    const a = new CarAwake();
    expect(a.on(0)).toBe(false);
    a.sample(30, 2000, 0);
    expect(a.on(2 * MIN)).toBe(true);
    expect(a.on(3 * MIN + S)).toBe(false);
  });

  it('ignores a state it does not know and values that are not numbers', () => {
    const a = new CarAwake();
    a.note(10);
    a.note(undefined);
    expect(a.on(0)).toBe(true);
    a.sample('fast', null, 0);
    a.note(2);
    expect(a.on(S)).toBe(false);
  });
});
