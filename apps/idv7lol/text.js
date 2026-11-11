'use strict';
/**
 * text.js - number formatting and glyph layout for the SDF text layers.
 *
 * Mirrors packages/theme-compiler/src/font/glyphs.ts (layoutLine) and
 * packages/theme-engine/src/format.ts (formatNumber) in Node 8 JavaScript.
 * Keep the two in step: the compiler decides glyph codes, this file lays
 * them out on the car.
 */

const SPACE_MIN = 0.32;
const MAX_GLYPHS = 32;

function codeOf(chars, ch) {
  let i = chars.indexOf(ch);
  if (i < 0 && ch !== ch.toUpperCase()) i = chars.indexOf(ch.toUpperCase());
  return i;
}

const formatCache = {};
function parseFormat(fmt) {
  if (formatCache[fmt]) return formatCache[fmt];
  const m = /^([\s\S]*?)(\+?)(0[0,]*)(?:\.(0+))?([\s\S]*)$/.exec(fmt);
  let parsed;
  if (!m)
    parsed = {
      prefix: '',
      suffix: fmt,
      decimals: 0,
      minIntegerDigits: 1,
      forceSign: false,
      thousands: false,
    };
  else {
    const intPart = m[3];
    parsed = {
      prefix: m[1],
      forceSign: m[2] === '+',
      minIntegerDigits: intPart.replace(/,/g, '').length,
      thousands: intPart.indexOf(',') >= 0,
      decimals: m[4] ? m[4].length : 0,
      suffix: m[5],
    };
  }
  formatCache[fmt] = parsed;
  return parsed;
}

function formatNumber(value, fmt) {
  const f = parseFormat(fmt || '0');
  if (typeof value !== 'number' || !isFinite(value)) return f.prefix + '--' + f.suffix;
  const rounded = Math.abs(value).toFixed(f.decimals);
  const parts = rounded.split('.');
  let int = parts[0];
  while (int.length < f.minIntegerDigits) int = '0' + int;
  if (f.thousands) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const negative = value < 0 && Number(rounded) !== 0;
  const sign = negative ? '-' : f.forceSign ? '+' : '';
  return f.prefix + sign + int + (parts[1] ? '.' + parts[1] : '') + f.suffix;
}

function formatDash(fmt) {
  const f = parseFormat(fmt || '0');
  const width = Math.max(1, f.minIntegerDigits) + (f.decimals ? f.decimals + 1 : 0);
  return f.prefix + '----'.slice(0, Math.min(width, 4)) + f.suffix;
}

/** An enum value as the cluster shows it: SPORT_PLUS reads SPORT+, ECO_PRO reads ECO PRO. */
function enumText(value) {
  return String(value)
    .replace(/_PLUS$/, '+')
    .replace(/_/g, ' ');
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function formatClock(hours, minutes, seconds, opts) {
  const colon = opts.colon === false ? ' ' : ':';
  let h = hours;
  let suffix = '';
  if (opts.format === '12h') {
    suffix = h >= 12 ? ' PM' : ' AM';
    h = h % 12;
    if (h === 0) h = 12;
  }
  const hh = opts.format === '24h' ? pad2(h) : String(h);
  const ss = opts.showSeconds ? colon + pad2(seconds) : '';
  return hh + colon + pad2(minutes) + ss + (opts.showSuffix ? suffix : '');
}

/**
 * Lay out a line for the TEXT shader. parts = [{ text, secondary }], metrics
 * = the font's metrics (chars, adv[]), boxW = layer width in glyph heights,
 * align 0 / 0.5 / 1. Returns { codes[32], centres[32], width }.
 */
function layoutLine(parts, metrics, boxW, align, tracking, scale2, tabular) {
  tracking = tracking || 0;
  scale2 = scale2 || 1;
  const gap = 0.12;
  const glyphs = [];
  let digitAdv = 0;
  if (tabular) for (let d = 0; d <= 9; d++) digitAdv = Math.max(digitAdv, metrics.adv[d] || 0);
  parts.forEach((part, pi) => {
    if (pi > 0 && part.text) glyphs.push({ code: -1, adv: gap, secondary: false });
    const s = part.secondary ? scale2 : 1;
    for (const ch of String(part.text)) {
      const code = codeOf(metrics.chars, ch);
      if (code < 0) {
        if (ch === ' ') glyphs.push({ code: -1, adv: SPACE_MIN * s, secondary: !!part.secondary });
        continue;
      }
      let adv = Math.max(metrics.adv[code] || 0.5, ch === ' ' ? SPACE_MIN : 0);
      if (tabular && code <= 9) adv = digitAdv;
      glyphs.push({ code, adv: adv * s, secondary: !!part.secondary });
    }
  });
  let visible = 0;
  for (let i = 0; i < glyphs.length; i++) {
    if (glyphs[i].code >= 0) visible++;
    if (visible > MAX_GLYPHS) {
      glyphs.length = i;
      break;
    }
  }
  let tr = tracking;
  let total = glyphs.reduce((a, g) => a + g.adv, 0) + tr * Math.max(0, glyphs.length - 1);
  if (total > boxW && tr > 0) {
    tr = 0;
    total = glyphs.reduce((a, g) => a + g.adv, 0);
  }
  let compress = 1;
  if (total > boxW && total > 0) compress = Math.max(0.85, boxW / total);
  total *= compress;
  let pen = (boxW - total) * align;
  const codes = [];
  const centres = [];
  for (let i = 0; i < MAX_GLYPHS; i++) {
    codes.push(-1);
    centres.push(-100);
  }
  let slot = 0;
  for (const g of glyphs) {
    const adv = g.adv * compress;
    if (g.code >= 0 && slot < MAX_GLYPHS) {
      codes[slot] = g.secondary ? g.code + 1000 : g.code;
      centres[slot] = Math.round((pen + adv / 2) * 1000) / 1000;
      slot++;
    }
    pen += adv + tr;
  }
  return { codes, centres, width: total };
}

module.exports = {
  codeOf,
  formatNumber,
  formatDash,
  formatClock,
  layoutLine,
  enumText,
  MAX_GLYPHS,
};
