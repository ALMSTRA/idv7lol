import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type Decoder<T> = (raw: unknown) => T;
// The car app is CommonJS for Node 8; load it as the head unit would.
const S = require('./signals.js') as {
  dippedBeamOf: Decoder<boolean | null>;
  parkingBrakeOf: Decoder<boolean | null>;
  dscModeOf: Decoder<string | null>;
  cruiseHudOf: Decoder<{ active: boolean; speed: number | null } | null>;
};
const { RefuelTrip } = require('./fuel.js') as {
  RefuelTrip: new (o?: { state?: unknown; save?: (s: unknown) => void }) => {
    update(
      litres: number | null,
      odometerKm: number | null,
      speedKmh: number | null,
      now: number,
    ): number | null;
  };
};
const tz = require('./tz.js') as { offsetMinutes(id: string, ms: number, fixed?: number): number };

// Enums as an F98 X4 M Competition's catalog names them; the binding sends a name or its number.
describe('low beam from the dipped beam lamp (Light.LampExterior2)', () => {
  it('is off when the lamp is, on in any of its on levels', () => {
    expect(S.dippedBeamOf({ controlFunctionDippedBeamLeftHand: 'OFF_DIPB_L' })).toBe(false);
    expect(S.dippedBeamOf({ controlFunctionDippedBeamLeftHand: 1 })).toBe(false);
    expect(S.dippedBeamOf({ controlFunctionDippedBeamLeftHand: 'ON_DIPB_L' })).toBe(true);
    for (const n of [2, 3, 4, 5, 6])
      expect(S.dippedBeamOf({ controlFunctionDippedBeamLeftHand: n })).toBe(true);
    expect(S.dippedBeamOf({ controlFunctionDippedBeamLeftHand: 7 })).toBeNull();
  });
});

describe('electric parking brake (Vehicle2.statusStandstillFunctions)', () => {
  it('reads applied / applying as on, released / releasing as off', () => {
    expect(S.parkingBrakeOf({ statusParkingBrake: 'PARKBREMSE_MECHANISCH_FESTGESTELLT' })).toBe(
      true,
    );
    expect(S.parkingBrakeOf({ statusParkingBrake: 1 })).toBe(true);
    expect(S.parkingBrakeOf({ statusParkingBrake: 4 })).toBe(true);
    expect(
      S.parkingBrakeOf({ statusParkingBrake: 'PARKBREMSE_MECHANISCH_NICHT_FESTGESTELLT' }),
    ).toBe(false);
    expect(S.parkingBrakeOf({ statusParkingBrake: 2 })).toBe(false);
    expect(S.parkingBrakeOf({ statusParkingBrake: 15 })).toBeNull();
  });
});

describe('DSC mode (FES.statusDSCSwitchHMI)', () => {
  it('reads on, off, DTC and MDM by name or number', () => {
    expect(S.dscModeOf({ displayStatusDSC2: 'DSC_EIN' })).toBe('ON');
    expect(S.dscModeOf({ displayStatusDSC2: 1 })).toBe('OFF');
    expect(S.dscModeOf({ displayStatusDSC2: 'ANFAHRHILFE_AKTIV' })).toBe('DTC');
    expect(S.dscModeOf({ displayStatusDSC2: 4 })).toBe('MDM');
    expect(S.dscModeOf({ displayStatusDSC2: 15 })).toBeNull();
  });
});

describe('cruise from the older display data (DisplayDataServer)', () => {
  it('is active while regulating, with its set speed', () => {
    expect(S.cruiseHudOf({ ldmSymColor: 'LDM_ACTIVE', cruiseCtrlSpeedHUD: 100 })).toEqual({
      active: true,
      speed: 100,
    });
    expect(S.cruiseHudOf({ ldmSymColor: 3, cruiseCtrlSpeedHUD: 100 })).toEqual({
      active: false,
      speed: 100,
    });
    expect(S.cruiseHudOf({ ldmSymColor: 0, cruiseCtrlSpeedHUD: 100 })).toEqual({
      active: false,
      speed: null,
    });
    expect(S.cruiseHudOf(null)).toBeNull();
  });
});

describe('trip since the last refuel (fuel.js RefuelTrip)', () => {
  it('counts from the first reading, resets on a refuel while standing, and keeps its state', () => {
    let saved: unknown = null;
    const t = new RefuelTrip({ save: (s) => (saved = s) });
    expect(t.update(40, 1000, 0, 0)).toBe(0);
    expect(t.update(35, 1060, 80, 1)).toBe(60); // driving: litres fall
    expect(t.update(37, 1061, 80, 2)).toBe(61); // sloshing while driving: no refuel
    expect(t.update(41, 1062, 90, 3)).toBe(62); // +6 l while driving: not a refuel
    expect(t.update(62, 1062, 0, 4)).toBe(0); // +27 l while standing: a refuel
    expect(t.update(60, 1080, 60, 5)).toBe(18);
    const again = new RefuelTrip({ state: saved });
    expect(again.update(60, 1090, 60, 6)).toBe(28);
  });
  it('gives nothing without the odometer', () => {
    expect(new RefuelTrip().update(40, null, 0, 0)).toBeNull();
  });
});

describe('time zone (tz.js)', () => {
  const at = (iso: string) => Date.parse(iso);
  it('Melbourne: +11 in daylight saving, +10 outside, switching on the right days', () => {
    expect(tz.offsetMinutes('melbourne', at('2026-11-14T12:12:00Z'))).toBe(660); // the photo's 11:11 pm
    expect(tz.offsetMinutes('melbourne', at('2026-07-01T00:00:00Z'))).toBe(600);
    expect(tz.offsetMinutes('melbourne', at('2026-04-04T15:59:00Z'))).toBe(660); // 2:59 daylight, 5 Apr
    expect(tz.offsetMinutes('melbourne', at('2026-04-04T16:01:00Z'))).toBe(600);
    expect(tz.offsetMinutes('melbourne', at('2026-10-03T15:59:00Z'))).toBe(600); // 1:59, 4 Oct
    expect(tz.offsetMinutes('melbourne', at('2026-10-03T16:01:00Z'))).toBe(660);
  });
  it('other zones, and the fixed offset', () => {
    expect(tz.offsetMinutes('brisbane', at('2026-11-14T00:00:00Z'))).toBe(600);
    expect(tz.offsetMinutes('adelaide', at('2026-11-14T00:00:00Z'))).toBe(630);
    expect(tz.offsetMinutes('perth', at('2026-11-14T00:00:00Z'))).toBe(480);
    expect(tz.offsetMinutes('auckland', at('2026-11-14T00:00:00Z'))).toBe(780);
    expect(tz.offsetMinutes('uk', at('2026-07-01T00:00:00Z'))).toBe(60);
    expect(tz.offsetMinutes('us-eastern', at('2026-07-01T00:00:00Z'))).toBe(-240);
    expect(tz.offsetMinutes('offset', at('2026-07-01T00:00:00Z'), 330)).toBe(330);
  });
});

describe('app.json interface declarations', () => {
  it('lists methods and broadcasts as arrays (the build checks a lone string letter by letter)', () => {
    const spec = require('./app.json') as { signals: Record<string, Record<string, unknown>> };
    for (const [iface, f] of Object.entries(spec.signals))
      for (const k of ['_methods', '_broadcasts'])
        if (f[k] !== undefined) expect(Array.isArray(f[k]), iface + ' ' + k).toBe(true);
  });
});
