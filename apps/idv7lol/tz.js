'use strict';
/**
 * tz.js - the local time's offset from UTC for the Time zone setting, daylight saving included. The head
 * unit runs its apps on UTC, so the zone comes from the setting: a standard offset and its region's
 * daylight-saving rule, worked out here (no time-zone database on the unit). Node 8, no kit dependency.
 *
 *   au: from the first Sunday of October 2:00 to the first Sunday of April 3:00 daylight (2:00 standard)
 *   nz: from the last Sunday of September 2:00 to the first Sunday of April 3:00 daylight (2:00 standard)
 *   eu: from the last Sunday of March 1:00 UTC to the last Sunday of October 1:00 UTC
 *   us: from the second Sunday of March 2:00 to the first Sunday of November 2:00 daylight (1:00 standard)
 * (the rules as of 2026; southern rules run over the new year)
 */
const ZONES = {
  melbourne: { off: 10, dst: 'au' }, // Melbourne, Sydney, Canberra, Hobart
  brisbane: { off: 10, dst: null },
  adelaide: { off: 9.5, dst: 'au' },
  darwin: { off: 9.5, dst: null },
  perth: { off: 8, dst: null },
  auckland: { off: 12, dst: 'nz' },
  utc: { off: 0, dst: null },
  uk: { off: 0, dst: 'eu' },
  cet: { off: 1, dst: 'eu' },
  eet: { off: 2, dst: 'eu' },
  'us-eastern': { off: -5, dst: 'us' },
  'us-central': { off: -6, dst: 'us' },
  'us-mountain': { off: -7, dst: 'us' },
  arizona: { off: -7, dst: null },
  'us-pacific': { off: -8, dst: 'us' },
};
const H = 3600000;

/** The day of month of the n-th (1..) or last (n = -1) Sunday of a month (0-based), in UTC. */
function sunday(y, m, n) {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  }
  const last = new Date(Date.UTC(y, m + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/** True while daylight saving is in force at ms (UTC) for zone z. */
function inDst(z, ms) {
  if (!z.dst) return false;
  const y = new Date(ms).getUTCFullYear();
  const at = (m, d, hourStd) => Date.UTC(y, m, d, hourStd) - z.off * H; // a local standard time in UTC
  if (z.dst === 'eu')
    return ms >= Date.UTC(y, 2, sunday(y, 2, -1), 1) && ms < Date.UTC(y, 9, sunday(y, 9, -1), 1);
  if (z.dst === 'us') return ms >= at(2, sunday(y, 2, 2), 2) && ms < at(10, sunday(y, 10, 1), 1);
  if (z.dst === 'au') return ms >= at(9, sunday(y, 9, 1), 2) || ms < at(3, sunday(y, 3, 1), 2);
  if (z.dst === 'nz') return ms >= at(8, sunday(y, 8, -1), 2) || ms < at(3, sunday(y, 3, 1), 2);
  return false;
}

/**
 * Minutes to add to UTC for the zone's local time at ms. 'offset' (or an unknown id) uses fixedMinutes:
 * the Clock offset setting.
 */
function offsetMinutes(id, ms, fixedMinutes) {
  const z = ZONES[id];
  if (!z) return fixedMinutes || 0;
  return Math.round((z.off + (inDst(z, ms) ? 1 : 0)) * 60);
}

module.exports = { ZONES, offsetMinutes, inDst };
