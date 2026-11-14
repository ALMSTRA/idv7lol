'use strict';
/**
 * signals.js - the signal store keyed by catalog id, and the decoders that
 * turn BMW enum payloads into the catalog's values. No dependency on the
 * kit, so it can be unit-tested on a desktop.
 */
class SignalStore {
  constructor() {
    this.map = {};
  }
  set(id, value, at) {
    if (value === null || value === undefined || (typeof value === 'number' && !isFinite(value)))
      return;
    this.map[id] = { value, at: at || Date.now(), valid: true };
  }
  invalidate(id) {
    const s = this.map[id];
    if (s) s.valid = false;
  }
  get(id) {
    return this.map[id];
  }
  number(id, fallback) {
    const s = this.map[id];
    return s && s.valid && typeof s.value === 'number' ? s.value : fallback;
  }
  snapshot() {
    return Object.assign({}, this.map);
  }
  ids() {
    return Object.keys(this.map);
  }
}

/**
 * FES.statusFESVehicleDynamicSwitchHMI.actualValueModeDrivingExperience, by name or wire number,
 * to the catalog's enum (as the kit's own apps read it: live_data/signals.js, ambient_config). The
 * catalog has no hybrid or electric mode: a plug-in hybrid's Hybrid and Electric read as COMFORT.
 * 0 and 61-63 carry no mode.
 */
const MODE_BY_KEY = {
  SPORT_DYNAMIC: 'SPORT',
  SPORT_EXPERT: 'SPORT_PLUS',
  SPORT_INDIVIDUAL: 'SPORT',
  COMFORT: 'COMFORT',
  COMFORT_PLUS: 'COMFORT',
  COMFORT_INDIVIDUAL: 'COMFORT',
  ECO_PRO_EFFICIENT: 'ECO_PRO',
  ECO_PRO_PLUS: 'ECO_PRO',
  ECO_PRO_INDIVIDUAL: 'ECO_PRO',
  ADAPTIVE: 'ADAPTIVE',
  PHEV_SPORT_STANDARD: 'SPORT',
  PHEV_SPORT_INDIVIDUAL: 'SPORT',
  PHEV_SPORT_PLUS: 'SPORT_PLUS',
  BOOST: 'SPORT',
  PHEV_HYBRID_STANDARD: 'COMFORT',
  PHEV_HYBRID_ECO: 'COMFORT',
  PHEV_HYBRID_COMFORT: 'COMFORT',
  PHEV_ELECTRIC_STANDARD: 'COMFORT',
  PHEV_ELECTRIC_INDIVIDUAL: 'COMFORT',
  1: 'SPORT',
  2: 'SPORT_PLUS',
  3: 'SPORT',
  4: 'COMFORT',
  5: 'COMFORT',
  6: 'COMFORT',
  7: 'ECO_PRO',
  8: 'ECO_PRO',
  9: 'ECO_PRO',
  10: 'ADAPTIVE',
  15: 'SPORT',
  16: 'SPORT',
  17: 'COMFORT',
  18: 'COMFORT',
  19: 'COMFORT',
  20: 'COMFORT',
  21: 'COMFORT',
  23: 'SPORT_PLUS',
  28: 'SPORT',
};

/** Other spellings seen in payloads, matched in order when the value isn't one of the keys above. */
const DRIVE_MODES = [
  [/ECO_?PRO|EFFICIENT|ECO/i, 'ECO_PRO'],
  [/SPORT_?PLUS|SPORT\+|SPORTPLUS/i, 'SPORT_PLUS'],
  [/TRACK|RACE/i, 'TRACK'],
  [/ADAPTIVE|ADAPTIV/i, 'ADAPTIVE'],
  [/SPORT|XTRABOOST|S_MINUS/i, 'SPORT'],
  [/COMFORT|NORMAL|BASIS|BASE/i, 'COMFORT'],
];

function driveModeOf(raw) {
  const v =
    raw && typeof raw === 'object' && raw.actualValueModeDrivingExperience !== undefined
      ? raw.actualValueModeDrivingExperience
      : raw;
  if (typeof v === 'number' || typeof v === 'string') {
    const key = typeof v === 'string' ? v.toUpperCase() : v;
    if (Object.prototype.hasOwnProperty.call(MODE_BY_KEY, key)) return MODE_BY_KEY[key];
    if (typeof v === 'number') return null;
  }
  const text = typeof v === 'string' ? v : JSON.stringify(v || '');
  for (const [re, mode] of DRIVE_MODES) if (re.test(text)) return mode;
  return null;
}

/*
 * The fields below were checked against an F98 X4 M Competition's own catalog
 * (/etc/oap/someip/someip-interfaces.json): their names, members and enums as written there. The SOME/IP
 * binding hands an enum over as its name or as its number, so each decoder takes either.
 */
const enumOf = (v, names) =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(names, v) ? names[v] : v;
const member = (v, key) => (v && typeof v === 'object' ? v[key] : v);

/**
 * M cars: MDrive.controlDisplayMSystems.controlDisplayEngineMode, the engine mode M Setup shows (the driving
 * experience switch in FES stays on COMFORT on these cars). 1 KOMFORT is the mode M calls Efficient.
 * 0 FREI, 4 DUNKELSCHALTUNG, 7 SIGNAL_UNGUELTIG carry no mode.
 */
const M_ENGINE = { KOMFORT: 1, SPORT: 2, SPORT_PLUS: 3 };
function mEngineModeOf(raw) {
  const n = enumOf(member(raw, 'controlDisplayEngineMode'), M_ENGINE);
  return n === 1 ? 'COMFORT' : n === 2 ? 'SPORT' : n === 3 ? 'SPORT_PLUS' : null;
}

/**
 * Light.StatusFunctionsIndicators(2).activeFunctionIndicateDirection: 'left' | 'right' | 'both' | 'off', or
 * null for no value. Steady and tap indicating and the driver assistance's direction indicating count as
 * left / right; hazard, crash, alarm and the other warning flashers as both.
 */
const INDICATE = {
  BLINKEN_AUS: 0,
  CRASH_BLINKEN: 1,
  REVERSIER_BLINKEN: 2,
  QUITTIERUNGSBLINKEN_SCHAERFEN: 3,
  QUITTIERUNGSBLINKEN_ENTSCHAERFEN: 4,
  DWA_BLINKEN: 5,
  WARNBLINKEN_MANUELL: 6,
  DAUERBLINKEN_LINKS: 7,
  DAUERBLINKEN_RECHTS: 8,
  TIPPBLINKEN_LINKS: 9,
  TIPPBLINKEN_RECHTS: 10,
  UEBERFALLALARM: 11,
  FAS_WARNBLINKEN_AUSPRAEGUNG_1: 12,
  AUFFAHRWARNBLINKEN: 13,
  ANKUENDIGUNGSBLINKEN_OEFFNEN: 14,
  ANKUENDIGUNGSBLINKEN_SCHLIESSEN: 15,
  WARNBLINKEN_NACH_GEFAHRENBREMSUNG: 16,
  WARNBLINKEN_VON_RCP: 17,
  FAS_RICHTUNGSBLINKEN_LOWPRIO_LINKS: 18,
  FAS_RICHTUNGSBLINKEN_LOWPRIO_RECHTS: 19,
  FAS_RICHTUNGSBLINKEN_MIDPRIO_LINKS: 20,
  FAS_RICHTUNGSBLINKEN_MIDPRIO_RECHTS: 21,
  FAS_RICHTUNGSBLINKEN_HIGHPRIO_LINKS: 22,
  FAS_RICHTUNGSBLINKEN_HIGHPRIO_RECHTS: 23,
  FAS_WARNBLINKEN_AUSPRAEGUNG_2: 24,
  FAS_WARNBLINKEN_AUSPRAEGUNG_3: 25,
  ANKUENDIGUNGSBLINKEN_REMOTE_MOTORSTART: 26,
};
const LEFT = [7, 9, 18, 20, 22];
const RIGHT = [8, 10, 19, 21, 23];
const BOTH = [1, 5, 6, 11, 12, 13, 16, 17, 24, 25];
function indicatorsOf(raw) {
  const n = enumOf(member(raw, 'activeFunctionIndicateDirection'), INDICATE);
  if (typeof n !== 'number' || n >= 253) return null;
  if (LEFT.indexOf(n) >= 0) return 'left';
  if (RIGHT.indexOf(n) >= 0) return 'right';
  if (BOTH.indexOf(n) >= 0) return 'both';
  return 'off';
}
/** The cluster's own flash, as measured on a G05: 640 ms a flash, lit for 335. */
const FLASH_MS = 640;
const FLASH_LIT_MS = 335;
const flashLit = (now) => now % FLASH_MS < FLASH_LIT_MS;

/** Light.LowBeam.statusLowBeam: 1 FAHRLICHT_EINSCHALTEN on, 0 off, 3 no value. */
function lowBeamOf(raw) {
  const n = enumOf(member(raw, 'statusLowBeam'), {
    FAHRLICHT_AUSSCHALTEN: 0,
    FAHRLICHT_EINSCHALTEN: 1,
  });
  return n === 1 ? true : n === 0 ? false : null;
}
/** Light.LampExterior2.controlFunctionMainBeam (high beam): 1 OFF_MAB off, 2 / 5 / 6 / 7 ON_MAB_MODE_1-4 on. */
function highBeamOf(raw) {
  const n = enumOf(member(raw, 'controlFunctionMainBeam'), {
    OFF_MAB: 1,
    ON_MAB_MODE_1: 2,
    ON_MAB_MODE_2: 5,
    ON_MAB_MODE_3: 6,
    ON_MAB_MODE_4: 7,
  });
  return n === 1 ? false : [2, 5, 6, 7].indexOf(n) >= 0 ? true : null;
}
/** Light.LampExterior.controlFunctionRearFogLamp: ON_RFLI_* (2, 3, 8, 9) on, OFF_RFLI_* (1, 4) off. */
function rearFogOf(raw) {
  const n = enumOf(member(raw, 'controlFunctionRearFogLamp'), {
    OFF_RFLI_OFF_TRM: 1,
    ON_RFLI_OFF_TRM: 2,
    ON_RFLI_ON_TRM: 3,
    OFF_RFLI_ON_TRM: 4,
    ON_RFLI_SYNC: 8,
    ON_RFLI_ASYNC: 9,
  });
  return [2, 3, 8, 9].indexOf(n) >= 0 ? true : n === 1 || n === 4 ? false : null;
}
/**
 * Light.LampExterior2.controlFunctionDippedBeamLeftHand: the dipped (low) beam lamp itself, so it goes out
 * when the lights do (Light.LowBeam's "driving light on" stays on with automatic lights). 1 OFF_DIPB_L off;
 * 2 ON, 3-5 LOW levels, 6 ON_DIPB_ENBN on; 7 no value.
 */
function dippedBeamOf(raw) {
  const n = enumOf(member(raw, 'controlFunctionDippedBeamLeftHand'), {
    OFF_DIPB_L: 1,
    ON_DIPB_L: 2,
    LOW_DIPB_L: 3,
    LOW_LEVEL_2_DIPB_L: 4,
    LOW_LEVEL_3_DIPB_L: 5,
    ON_DIPB_ENBN_L: 6,
  });
  return n === 1 ? false : [2, 3, 4, 5, 6].indexOf(n) >= 0 ? true : null;
}
/**
 * The electric parking brake: Vehicle2.statusStandstillFunctions.statusParkingBrake. 1 FESTGESTELLT and
 * 4 applying count as on; 0 NICHT_FESTGESTELLT and 2 releasing as off; 13-15 no value.
 */
function parkingBrakeOf(raw) {
  const n = enumOf(member(raw, 'statusParkingBrake'), {
    PARKBREMSE_MECHANISCH_NICHT_FESTGESTELLT: 0,
    PARKBREMSE_MECHANISCH_FESTGESTELLT: 1,
    PARKBREMSE_IM_STELLVORGANG_LOESEN: 2,
    PARKBREMSE_IM_STELLVORGANG_FESTSTELLEN: 4,
  });
  return n === 1 || n === 4 ? true : n === 0 || n === 2 ? false : null;
}
/**
 * FES.statusDSCSwitchHMI.displayStatusDSC2, the DSC button's state: 0 DSC_EIN 'ON', 1 DSC_AUS 'OFF',
 * 2 ANFAHRHILFE_AKTIV 'DTC', 4 TRAKTIONSMODUS_EIN 'MDM' (the traction mode, M Dynamic Mode on an M car);
 * 13-15 no value.
 */
function dscModeOf(raw) {
  const n = enumOf(member(raw, 'displayStatusDSC2'), {
    DSC_EIN: 0,
    DSC_AUS: 1,
    ANFAHRHILFE_AKTIV: 2,
    TRAKTIONSMODUS_EIN: 4,
  });
  return n === 0 ? 'ON' : n === 1 ? 'OFF' : n === 2 ? 'DTC' : n === 4 ? 'MDM' : null;
}
/**
 * The older display data (displaydataserver.DisplayDataServer.functionalLibraryData), which cars without
 * DisplayDataServer2's set speed fill: ldmSymColor 1 LDM_ACTIVE regulating, 3 LDM_STANDBY, 0 LDM_OFF, and
 * cruiseCtrlSpeedHUD the set speed. { active, speed } or null.
 */
function cruiseHudOf(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const c = enumOf(raw.ldmSymColor, {
    LDM_OFF: 0,
    LDM_ACTIVE: 1,
    LDM_UEBERTRETEN: 2,
    LDM_STANDBY: 3,
    LDM_CRITICAL: 4,
    LDM_BRAKE_ONLY: 5,
  });
  if (typeof c !== 'number' || c > 5) return null;
  const v = raw.cruiseCtrlSpeedHUD;
  return {
    active: c === 1 || c === 2,
    speed: c !== 0 && typeof v === 'number' && v > 0 && v < 400 ? v : null,
  };
}
/** CDS.statusHandBrake.statusContactHandBrake: 2 HANDBREMSE_ANGEZOGEN applied, 1 HANDBREMSE_GELOEST released. */
function handBrakeOf(raw) {
  const n = enumOf(member(raw, 'statusContactHandBrake'), {
    HANDBREMSE_GELOEST: 1,
    HANDBREMSE_ANGEZOGEN: 2,
  });
  return n === 2 ? true : n === 1 ? false : null;
}
/**
 * DisplayDataServer2.functionalLibraryData: the cruise display the factory cluster draws.
 * ldmSetSpeed.ldmSetSpeedColour 1 ACTIVE_GREEN = regulating, 2 INACTIVE_GREY = standby, 0 OFF;
 * ldmSetSpeed.ldmSetSpeedValue the set speed (as the cluster shows it). { active, speed } or null.
 */
function cruiseOf(raw) {
  const s = member(raw, 'ldmSetSpeed');
  if (!s || typeof s !== 'object') return null;
  const c = enumOf(s.ldmSetSpeedColour, { OFF: 0, ACTIVE_GREEN: 1, INACTIVE_GREY: 2 });
  if (typeof c !== 'number' || c > 2) return null;
  const v = s.ldmSetSpeedValue;
  return {
    active: c === 1,
    speed: c !== 0 && typeof v === 'number' && v > 0 && v < 400 ? v : null,
  };
}
/** KombiIF.statusBordcomputerTravelData.wayPassed: the trip computer's distance in km, 65535 no value. */
function tripOf(raw) {
  const v = member(raw, 'wayPassed');
  return typeof v === 'number' && v >= 0 && v < 65535 ? v : null;
}
/**
 * KombiIF.statusBordcomputerAverage: trip 1's average consumption, tenths, in the unit
 * statusUnitOfMeasurementConsumptionBC names (1 = l/100 km; others are not converted). 65535 no value.
 */
function averageConsumptionOf(raw) {
  const v = member(raw, 'consumptionAverage1BC1');
  const unit = enumOf(member(raw, 'statusUnitOfMeasurementConsumptionBC'), {
    VERBRAUCH_IN_L_S_100KM: 1,
  });
  if (typeof v !== 'number' || v >= 65535 || (unit !== undefined && unit !== 1)) return null;
  return v / 10;
}

/** FES.statusSwitchDriveDynamicSport2.displayBoostPressure: hundredths of a bar, 255 = no value. */
function boostOf(raw) {
  return typeof raw === 'number' && raw >= 0 && raw < 255 ? raw / 100 : null;
}

const GEAR_TEXT = (gear, stage) => {
  if (stage === 'P' || stage === 'R' || stage === 'N') return stage;
  if (typeof gear === 'number') {
    if (gear === -1) return 'R';
    if (gear === 0) return stage || 'N';
    return String(gear);
  }
  return stage || null;
};

module.exports = {
  SignalStore,
  driveModeOf,
  boostOf,
  GEAR_TEXT,
  mEngineModeOf,
  indicatorsOf,
  flashLit,
  lowBeamOf,
  highBeamOf,
  rearFogOf,
  handBrakeOf,
  dippedBeamOf,
  parkingBrakeOf,
  dscModeOf,
  cruiseHudOf,
  cruiseOf,
  tripOf,
  averageConsumptionOf,
};
