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

module.exports = { SignalStore, driveModeOf, boostOf, GEAR_TEXT };
