import { describe, expect, it } from 'vitest';
import {
  SIGNALS,
  SignalBus,
  UNITS,
  convert,
  getProfile,
  getSignal,
  profileHasSignal,
  profileSignals,
  sameDimension,
} from './index.js';

describe('signal catalog', () => {
  it('has unique, well-formed ids', () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/);
  });

  it('has sane ranges and known units', () => {
    for (const s of SIGNALS) {
      expect(s.min).toBeLessThan(s.max);
      expect(UNITS[s.unit]).toBeDefined();
      if (s.kind === 'enum') expect(s.enumValues?.length).toBeGreaterThan(0);
      if (s.kind === 'boolean') expect([s.min, s.max]).toEqual([0, 1]);
    }
  });

  it('looks up signals by id', () => {
    expect(getSignal('engine.rpm')?.unit).toBe('rpm');
    expect(getSignal('does.not.exist')).toBeUndefined();
  });
});

describe('units', () => {
  it('converts speed, temperature and pressure', () => {
    expect(convert(100, 'kmh', 'mph')).toBeCloseTo(62.137, 2);
    expect(convert(100, 'celsius', 'fahrenheit')).toBeCloseTo(212);
    expect(convert(212, 'fahrenheit', 'celsius')).toBeCloseTo(100);
    expect(convert(1, 'bar', 'psi')).toBeCloseTo(14.5, 1);
    expect(convert(1, 'bar', 'kpa')).toBeCloseTo(100);
  });

  it('converts inverse consumption units both ways', () => {
    const mpg = convert(10, 'l_100km', 'mpg_us');
    expect(mpg).toBeCloseTo(23.52, 1);
    expect(convert(mpg, 'mpg_us', 'l_100km')).toBeCloseTo(10, 5);
    expect(convert(0, 'l_100km', 'mpg_us')).toBe(0);
  });

  it('refuses conversions across dimensions', () => {
    expect(sameDimension('kmh', 'celsius')).toBe(false);
    expect(() => convert(1, 'kmh', 'celsius')).toThrow(/Cannot convert/);
  });
});

describe('vehicle profiles', () => {
  it('excludes hybrid signals from the generic combustion profile', () => {
    const p = getProfile('generic-ice')!;
    expect(profileHasSignal(p, 'hybrid.battery.soc')).toBe(false);
    expect(profileHasSignal(p, 'engine.boost')).toBe(false);
    expect(profileHasSignal(p, 'engine.rpm')).toBe(true);
  });

  it('removes combustion signals from the electric profile and applies overrides', () => {
    const bev = profileSignals(getProfile('bev')!);
    expect(bev.some((s) => s.id === 'engine.rpm')).toBe(false);
    expect(bev.some((s) => s.id === 'hybrid.battery.soc')).toBe(true);
    const sport = profileSignals(getProfile('turbo-ice-sport')!);
    expect(sport.find((s) => s.id === 'engine.rpm')?.max).toBe(8000);
  });
});

describe('SignalBus', () => {
  it('stores samples, notifies listeners and tracks freshness', () => {
    let t = 1000;
    const bus = new SignalBus(() => t);
    const seen: string[] = [];
    const off = bus.subscribe('engine.rpm', (id, s) => seen.push(`${id}=${s.value}`));
    bus.set('engine.rpm', 3000);
    bus.set('vehicle.speed', 50);
    expect(seen).toEqual(['engine.rpm=3000']);
    expect(bus.number('engine.rpm')).toBe(3000);
    expect(bus.isFresh('engine.rpm', 500)).toBe(true);
    t = 2000;
    expect(bus.isFresh('engine.rpm', 500)).toBe(false);
    bus.invalidate('engine.rpm');
    expect(bus.number('engine.rpm', -1)).toBe(-1);
    expect(bus.get('engine.rpm')?.valid).toBe(false);
    // invalidation notifies listeners too, with the last known value
    expect(seen).toEqual(['engine.rpm=3000', 'engine.rpm=3000']);
    off();
    bus.set('engine.rpm', 1);
    expect(seen).toHaveLength(2);
  });

  it('coerces booleans and strings to numbers', () => {
    const bus = new SignalBus();
    bus.set('light.turn.left', true);
    bus.set('transmission.gear', '3');
    expect(bus.number('light.turn.left')).toBe(1);
    expect(bus.number('transmission.gear')).toBe(3);
    bus.set('transmission.gear', 'D');
    expect(bus.number('transmission.gear', 0)).toBe(0);
  });
});
