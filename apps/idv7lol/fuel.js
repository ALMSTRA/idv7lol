'use strict';
/**
 * fuel.js - the fuel level as a percentage, on any car.
 *
 * The cluster sends what its own gauge shows as litres in the whole tank
 * (KombiIF.statusRangeTankStatus.fluidLevelFuelTank; on a G05 X5 45e with a
 * full 69 l tank it read 68), next to the fuel range and the odometer. A
 * percentage needs the tank's size, which differs by model, so it comes from,
 * in this order:
 *
 *   1. the engine unit's own percentage (OBD-II PID 2F, read by vehicle.js)
 *      while it is fresh; no tank size needed. From it and the litres the real
 *      size is worked out once a few readings agree, and kept;
 *   2. litres over the tank size: the one set in the settings, else the one
 *      worked out in 1, else the largest level that ever held (it can't be
 *      more than the tank) but never less than a medium size, so a half tank
 *      never reads full before the first fill-up.
 *
 * No dependency on the kit, so it can be unit-tested on a desktop. Node 8.
 */

const STABLE_MS = 60000; // a level counts as held after this long without a change
const OBD_FRESH_MS = 60000; // the engine unit's percentage is used for this long
const DERIVE_MIN_PCT = 50; // below this the 1 l steps of the litres make the size too rough
const DERIVE_SPREAD = 2; // l: the size estimates that agree are this close
const DERIVE_KEEP = 5;
const MIN_TANK = 20;
const MAX_TANK = 150;

const isNum = (v) => typeof v === 'number' && isFinite(v);
const inRange = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;

/** A KombiIF.statusRangeTankStatus value: { litres, rangeKm, odometerKm, reserve }, null where there's no value. */
function parseTank(v) {
  const o = v && typeof v === 'object' ? v : {};
  const litres = o.fluidLevelFuelTank;
  const range = o.range;
  const km = o.mileageKilometre;
  const spare = o.statusFluidLevelFuelTankSpare;
  let reserve = null;
  if (spare === 'AKTIV' || spare === 1) reserve = true;
  else if (spare === 'NICHT_AKTIV' || spare === 0) reserve = false;
  return {
    litres: isNum(litres) && litres >= 0 && litres < 255 ? litres : null,
    rangeKm: isNum(range) && range >= 0 && range < 4095 ? range : null,
    odometerKm: isNum(km) && km > 0 && km < 16777215 ? km : null,
    reserve,
  };
}

function median(list) {
  const s = list.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

class FuelGauge {
  /** opts: { state ({ learnedMax, derived } from save()), save(state), defaultLitres (65) } */
  constructor(opts) {
    const o = opts || {};
    const st = o.state || {};
    this.save = o.save || (() => {});
    this.defaultLitres = isNum(o.defaultLitres) ? o.defaultLitres : 65;
    this.learnedMax = inRange(st.learnedMax, 0, MAX_TANK) ? st.learnedMax : 0;
    this.derived = inRange(st.derived, MIN_TANK, MAX_TANK) ? st.derived : null;
    this.litres = null; // { v, since, at }
    this.pct = null; // { v, at }
    this.estimates = [];
  }

  /** The cluster's litres, as they come. */
  tank(litres, now) {
    if (!isNum(litres)) return;
    if (!this.litres || this.litres.v !== litres) this.litres = { v: litres, since: now, at: now };
    else this.litres.at = now;
  }

  /** The engine unit's percentage (OBD-II PID 2F). */
  obd(pct, now) {
    if (!inRange(pct, 0, 100)) return;
    this.pct = { v: pct, at: now };
    if (!this.litres || pct < DERIVE_MIN_PCT) return;
    this.estimates.push(this.litres.v / (pct / 100));
    if (this.estimates.length > DERIVE_KEEP) this.estimates.shift();
    if (this.estimates.length < 3) return;
    const last = this.estimates.slice(-3);
    if (Math.max.apply(null, last) - Math.min.apply(null, last) > DERIVE_SPREAD) return;
    const size = Math.round(median(last));
    if (inRange(size, MIN_TANK, MAX_TANK) && size !== this.derived) {
      this.derived = size;
      this._save();
    }
  }

  /** Call often (vehicle.js: every second): a level that held long enough raises the learned size. */
  tick(now) {
    const l = this.litres;
    if (l && now - l.since >= STABLE_MS && l.v > this.learnedMax && l.v <= MAX_TANK) {
      this.learnedMax = l.v;
      this._save();
    }
  }

  /** The tank size used for litres: { litres, src: 'setting' | 'derived' | 'learned' | 'default' }. */
  capacity(setting) {
    const set = Number(setting);
    if (inRange(set, MIN_TANK, MAX_TANK)) return { litres: set, src: 'setting' };
    if (this.derived) return { litres: this.derived, src: 'derived' };
    if (this.learnedMax > this.defaultLitres) return { litres: this.learnedMax, src: 'learned' };
    return { litres: this.defaultLitres, src: 'default' };
  }

  /** { pct, src: 'obd' | 'litres', capacity } now, or null while nothing is known. */
  level(now, setting) {
    if (this.pct && now - this.pct.at <= OBD_FRESH_MS) {
      return {
        pct: this.pct.v,
        src: 'obd',
        capacity: this.derived ? this.capacity(setting) : null,
      };
    }
    if (!this.litres) return null;
    const cap = this.capacity(setting);
    return {
      pct: Math.max(0, Math.min(100, (this.litres.v / cap.litres) * 100)),
      src: 'litres',
      capacity: cap,
    };
  }

  _save() {
    try {
      this.save({ learnedMax: this.learnedMax, derived: this.derived });
    } catch (_e) {
      /* the next change saves again */
    }
  }
}

module.exports = { FuelGauge, parseTank, STABLE_MS, OBD_FRESH_MS };
