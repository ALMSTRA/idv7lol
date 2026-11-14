import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type Decoder<T> = (raw: unknown) => T;
// The car app is CommonJS for Node 8; load it as the head unit would.
const S = require('./signals.js') as {
  driveModeOf: Decoder<string | null>;
  mEngineModeOf: Decoder<string | null>;
  indicatorsOf: Decoder<'left' | 'right' | 'both' | 'off' | null>;
  flashLit: (now: number) => boolean;
  lowBeamOf: Decoder<boolean | null>;
  highBeamOf: Decoder<boolean | null>;
  rearFogOf: Decoder<boolean | null>;
  handBrakeOf: Decoder<boolean | null>;
  cruiseOf: Decoder<{ active: boolean; speed: number | null } | null>;
  tripOf: Decoder<number | null>;
  averageConsumptionOf: Decoder<number | null>;
};

// Values as an F98 X4 M Competition's catalog names them; the binding sends a name or its number.
describe('M engine mode (MDrive.controlDisplayMSystems)', () => {
  it('reads Efficient, Sport and Sport+ by name or number', () => {
    expect(S.mEngineModeOf({ controlDisplayEngineMode: 'KOMFORT' })).toBe('COMFORT');
    expect(S.mEngineModeOf({ controlDisplayEngineMode: 1 })).toBe('COMFORT');
    expect(S.mEngineModeOf({ controlDisplayEngineMode: 'SPORT' })).toBe('SPORT');
    expect(S.mEngineModeOf({ controlDisplayEngineMode: 2 })).toBe('SPORT');
    expect(S.mEngineModeOf({ controlDisplayEngineMode: 'SPORT_PLUS' })).toBe('SPORT_PLUS');
    expect(S.mEngineModeOf({ controlDisplayEngineMode: 3 })).toBe('SPORT_PLUS');
  });
  it('gives no mode for FREI, DUNKELSCHALTUNG, an invalid value or nothing', () => {
    for (const v of ['FREI', 0, 'DUNKELSCHALTUNG', 4, 'SIGNAL_UNGUELTIG', 7, undefined])
      expect(S.mEngineModeOf({ controlDisplayEngineMode: v })).toBeNull();
    expect(S.mEngineModeOf(null)).toBeNull();
  });
});

describe('turn signals (Light.StatusFunctionsIndicators)', () => {
  it('reads left, right, hazards and off by name or number', () => {
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 'DAUERBLINKEN_LINKS' })).toBe('left');
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 9 })).toBe('left');
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 'TIPPBLINKEN_RECHTS' })).toBe('right');
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 8 })).toBe('right');
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 'WARNBLINKEN_MANUELL' })).toBe('both');
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 'BLINKEN_AUS' })).toBe('off');
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 0 })).toBe('off');
  });
  it('gives nothing for an unfilled or reserved value', () => {
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 'SIGNAL_UNBEFUELLT' })).toBeNull();
    expect(S.indicatorsOf({ activeFunctionIndicateDirection: 255 })).toBeNull();
    expect(S.indicatorsOf({})).toBeNull();
  });
  it('flashes at the cluster rate: lit 335 ms of every 640', () => {
    expect(S.flashLit(0)).toBe(true);
    expect(S.flashLit(334)).toBe(true);
    expect(S.flashLit(335)).toBe(false);
    expect(S.flashLit(639)).toBe(false);
    expect(S.flashLit(640)).toBe(true);
  });
});

describe('lights', () => {
  it('low beam (Light.LowBeam.statusLowBeam)', () => {
    expect(S.lowBeamOf({ statusLowBeam: 'FAHRLICHT_EINSCHALTEN' })).toBe(true);
    expect(S.lowBeamOf({ statusLowBeam: 1 })).toBe(true);
    expect(S.lowBeamOf({ statusLowBeam: 0 })).toBe(false);
    expect(S.lowBeamOf({ statusLowBeam: 3 })).toBeNull();
  });
  it('high beam (Light.LampExterior2.controlFunctionMainBeam)', () => {
    expect(S.highBeamOf({ controlFunctionMainBeam: 'OFF_MAB' })).toBe(false);
    expect(S.highBeamOf({ controlFunctionMainBeam: 'ON_MAB_MODE_1' })).toBe(true);
    for (const n of [2, 5, 6, 7]) expect(S.highBeamOf({ controlFunctionMainBeam: n })).toBe(true);
    expect(S.highBeamOf({ controlFunctionMainBeam: 15 })).toBeNull();
  });
  it('rear fog (Light.LampExterior.controlFunctionRearFogLamp)', () => {
    expect(S.rearFogOf({ controlFunctionRearFogLamp: 'ON_RFLI_SYNC' })).toBe(true);
    expect(S.rearFogOf({ controlFunctionRearFogLamp: 3 })).toBe(true);
    expect(S.rearFogOf({ controlFunctionRearFogLamp: 'OFF_RFLI_OFF_TRM' })).toBe(false);
    expect(S.rearFogOf({ controlFunctionRearFogLamp: 0 })).toBeNull();
  });
});

describe('parking brake (CDS.statusHandBrake)', () => {
  it('reads applied and released, nothing when not coded or invalid', () => {
    expect(S.handBrakeOf({ statusContactHandBrake: 'HANDBREMSE_ANGEZOGEN' })).toBe(true);
    expect(S.handBrakeOf({ statusContactHandBrake: 2 })).toBe(true);
    expect(S.handBrakeOf({ statusContactHandBrake: 'HANDBREMSE_GELOEST' })).toBe(false);
    expect(S.handBrakeOf({ statusContactHandBrake: 0 })).toBeNull();
    expect(S.handBrakeOf({ statusContactHandBrake: 3 })).toBeNull();
  });
});

describe('cruise (DisplayDataServer2.functionalLibraryData.ldmSetSpeed)', () => {
  it('is active only in green, with the set speed while on', () => {
    expect(
      S.cruiseOf({ ldmSetSpeed: { ldmSetSpeedColour: 'ACTIVE_GREEN', ldmSetSpeedValue: 110 } }),
    ).toEqual({ active: true, speed: 110 });
    expect(S.cruiseOf({ ldmSetSpeed: { ldmSetSpeedColour: 2, ldmSetSpeedValue: 110 } })).toEqual({
      active: false,
      speed: 110,
    });
    expect(
      S.cruiseOf({ ldmSetSpeed: { ldmSetSpeedColour: 'OFF', ldmSetSpeedValue: 110 } }),
    ).toEqual({ active: false, speed: null });
  });
  it('gives nothing without the set speed block', () => {
    expect(S.cruiseOf({})).toBeNull();
    expect(S.cruiseOf(null)).toBeNull();
  });
});

describe('trip computer (KombiIF)', () => {
  it('trip distance (statusBordcomputerTravelData.wayPassed)', () => {
    expect(S.tripOf({ wayPassed: 63 })).toBe(63);
    expect(S.tripOf({ wayPassed: 65535 })).toBeNull();
  });
  it('average consumption in l/100 km, tenths (statusBordcomputerAverage)', () => {
    expect(
      S.averageConsumptionOf({
        consumptionAverage1BC1: 98,
        statusUnitOfMeasurementConsumptionBC: 'VERBRAUCH_IN_L_S_100KM',
      }),
    ).toBe(9.8);
    expect(
      S.averageConsumptionOf({
        consumptionAverage1BC1: 98,
        statusUnitOfMeasurementConsumptionBC: 1,
      }),
    ).toBe(9.8);
    expect(
      S.averageConsumptionOf({
        consumptionAverage1BC1: 98,
        statusUnitOfMeasurementConsumptionBC: 2,
      }),
    ).toBeNull();
    expect(S.averageConsumptionOf({ consumptionAverage1BC1: 65535 })).toBeNull();
  });
});

describe('driving experience switch (FES) still read on cars without M Drive', () => {
  it('keeps the existing decoding', () => {
    expect(S.driveModeOf({ actualValueModeDrivingExperience: 'SPORT_EXPERT' })).toBe('SPORT_PLUS');
    expect(S.driveModeOf({ actualValueModeDrivingExperience: 4 })).toBe('COMFORT');
  });
});
