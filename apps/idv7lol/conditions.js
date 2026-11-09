'use strict';
/**
 * conditions.js - evaluate theme conditions ({ signal, op, value } and
 * all / any / not) against the signal store. Mirrors EngineState.condition
 * in packages/theme-engine/src/state.ts.
 */
const STALE_MS = 3000;

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(v);
  return isFinite(n) ? n : NaN;
}

function truthy(v) {
  if (typeof v === 'string') return v !== '' && v !== '0' && v.toLowerCase() !== 'false';
  return !!v;
}

function compare(c, store, now) {
  const s = store.get(c.signal);
  if (c.op === 'stale') return !s || !s.valid || now - s.at > STALE_MS;
  if (!s || !s.valid) return false;
  const v = s.value;
  const num = toNumber(v);
  const cmp = typeof c.value === 'number' ? c.value : Number(c.value);
  switch (c.op) {
    case 'truthy':
      return truthy(v);
    case 'falsy':
      return !truthy(v);
    case 'eq':
      return typeof c.value === 'string' ? String(v) === c.value : num === cmp;
    case 'neq':
      return typeof c.value === 'string' ? String(v) !== c.value : num !== cmp;
    case 'gt':
      return num > cmp;
    case 'gte':
      return num >= cmp;
    case 'lt':
      return num < cmp;
    case 'lte':
      return num <= cmp;
    case 'between':
      return num >= cmp && num <= (c.value2 === undefined ? cmp : c.value2);
    default:
      return false;
  }
}

function evaluate(cond, store, now) {
  if (!cond) return true;
  if (cond.all) return cond.all.every((x) => evaluate(x, store, now));
  if (cond.any) return cond.any.some((x) => evaluate(x, store, now));
  if (cond.not) return !evaluate(cond.not, store, now);
  return compare(cond, store, now);
}

module.exports = { evaluate, STALE_MS };
