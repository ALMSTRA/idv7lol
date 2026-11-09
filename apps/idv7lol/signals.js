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

/** BMW drive-mode names (TAB_FES_MODUS_ARG and friends) to the catalog's enum. */
const DRIVE_MODES = [
  [/ECO_?PRO|EFFICIENT|ECO/i, 'ECO_PRO'],
  [/SPORT_?PLUS|SPORT\+|SPORTPLUS/i, 'SPORT_PLUS'],
  [/TRACK|RACE/i, 'TRACK'],
  [/ADAPTIVE|ADAPTIV/i, 'ADAPTIVE'],
  [/SPORT|XTRABOOST|S_MINUS/i, 'SPORT'],
  [/COMFORT|NORMAL|BASIS|BASE/i, 'COMFORT'],
];

function driveModeOf(raw) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw || '');
  for (const [re, mode] of DRIVE_MODES) if (re.test(text)) return mode;
  return null;
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

module.exports = { SignalStore, driveModeOf, GEAR_TEXT };
