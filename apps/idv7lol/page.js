'use strict';
/**
 * page.js - what the app draws on the central display: the Themes and Data tabs of the modern
 * screen, and the four text pages (Status, Signals, Renderer, About) that are the whole of the
 * classic one. Drawing only: main.js owns the state, the buttons and the loop.
 *
 * Everything goes through the kit's canvas (rects, arcs, lines, text). There are no pictures:
 * where the Store's renderer draws the page it takes none, so a theme shows as its sketch, the
 * flat shapes the theme compiler leaves in `theme.preview` (theme-compiler preview.ts).
 *
 * The caller may format application UI labels before drawing. Theme sketches and raw diagnostic
 * values use the original ASCII-compatible rendering path.
 *
 * Node 8: CommonJS, ES2017, builtins only.
 */
const { parseColor } = require('./engine');

const W = 1600;
const H = 520;
/** First row under the kit's tab strip (kit gauges.js TOP) and the last one of the page. */
const TOP = 44;
const BOTTOM = 512;
/** idv7lol's own accent, the cyan of its logo. */
const ACCENT = '#22d3ee';
const GOOD = '#34d378';
const MODERN_TABS = ['Themes', 'Data', 'Status', 'Signals', 'Renderer', 'About'];
const CLASSIC_PAGES = 4;

const FOLD = {
  á: 'a',
  à: 'a',
  â: 'a',
  ä: 'a',
  ã: 'a',
  å: 'a',
  Á: 'A',
  À: 'A',
  Â: 'A',
  Ä: 'A',
  Ã: 'A',
  Å: 'A',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  É: 'E',
  È: 'E',
  Ê: 'E',
  Ë: 'E',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  Í: 'I',
  Ì: 'I',
  Î: 'I',
  Ï: 'I',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  ö: 'o',
  õ: 'o',
  ø: 'o',
  Ó: 'O',
  Ò: 'O',
  Ô: 'O',
  Ö: 'O',
  Õ: 'O',
  Ø: 'O',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  Ú: 'U',
  Ù: 'U',
  Û: 'U',
  Ü: 'U',
  ñ: 'n',
  Ñ: 'N',
  ç: 'c',
  Ç: 'C',
  ß: 'ss',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  ý: 'y',
  ÿ: 'y',
  '¿': '',
  '¡': '',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '«': '"',
  '»': '"',
};
// what the kit's fonts do have beyond ASCII (kit/runtime/fonts)
const KEPT = '°±²³·×μ–—…€';

/** `s` in letters the kit's fonts have: accents folded away, anything else unknown left out. */
function ascii(s) {
  let out = '';
  for (const ch of String(s === undefined || s === null ? '' : s)) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code < 127) out += ch;
    else if (Object.prototype.hasOwnProperty.call(FOLD, ch)) out += FOLD[ch];
    else if (KEPT.indexOf(ch) >= 0) out += ch;
  }
  return out;
}

const isNum = (v) => typeof v === 'number' && isFinite(v);
const fmt = (v, d) => (isNum(v) ? v.toFixed(d || 0) : '--');

/** A theme colour as the kit takes it: [r, g, b, a] in 0..255. */
function kitColour(c, fallback) {
  const v = parseColor(c || fallback || '#808080');
  return [
    Math.round(v[0] * 255),
    Math.round(v[1] * 255),
    Math.round(v[2] * 255),
    Math.round((isNum(v[3]) ? Math.max(0, Math.min(1, v[3])) : 1) * 255),
  ];
}

function withAlpha(c, a) {
  const v = kitColour(c);
  return [v[0], v[1], v[2], Math.round(a * 255)];
}

/** The colours of palette `pid` of a theme, or of its default one. */
function paletteOf(theme, pid) {
  const pals = theme.palettes || {};
  const sel = theme.paletteSelection || {};
  const p = pals[pid] || pals[sel.default] || pals[Object.keys(pals)[0]];
  return (p && p.colors) || {};
}

/**
 * The sketch of `theme` in palette `pid`, w wide (16:6) with its top-left at x, y. Returns its
 * height. A theme without a sketch (an older USB package) shows its name on its background.
 */
function drawPreview(cv, theme, pid, x, y, w) {
  const k = w / 1920;
  const h = Math.round(720 * k);
  const pal = paletteOf(theme, pid);
  const col = (c) =>
    kitColour(typeof c === 'string' && c[0] === '$' ? pal[c.slice(1)] : c, '#808080');
  const bg = theme.background === 'transparent' || !theme.background ? '#000000' : theme.background;
  cv.fillRect(x, y, w, h, col(bg)[3] ? col(bg) : [0, 0, 0, 255]);
  // `sketch` is the one with the theme's pictures as mosaics, where the theme has pictures
  const prims =
    Array.isArray(theme.sketch) && theme.sketch.length
      ? theme.sketch
      : Array.isArray(theme.preview)
        ? theme.preview
        : [];
  if (!prims.length) {
    cv.text(
      ascii(theme.name).slice(0, 28),
      x + w / 2,
      y + h / 2 + 10 * k * 4,
      Math.max(14, 64 * k),
      col('$text'),
      {
        align: 'center',
        font: 'bold',
        literal: true,
      },
    );
    return h;
  }
  cv.clip(x, y, w, h);
  const X = (v) => x + v * k;
  const Y = (v) => y + v * k;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
    switch (p[0]) {
      case 'r':
        if (p[5] * k >= 1) cv.roundRect(X(p[1]), Y(p[2]), p[3] * k, p[4] * k, p[5] * k, col(p[6]));
        else cv.fillRect(X(p[1]), Y(p[2]), Math.max(1, p[3] * k), Math.max(1, p[4] * k), col(p[6]));
        break;
      case 'o':
        cv.strokeRoundRect(
          X(p[1]),
          Y(p[2]),
          p[3] * k,
          p[4] * k,
          p[5] * k,
          Math.max(1, p[6] * k),
          col(p[7]),
        );
        break;
      case 'c':
        cv.circle(X(p[1]), Y(p[2]), Math.max(1, p[3] * k), col(p[4]));
        break;
      case 'a': {
        const r1 = p[4] * k;
        const r0 = Math.min(p[3] * k, r1 - 1.5);
        const c = col(p[7]);
        const a0 = ((p[5] % 360) + 360) % 360;
        const span = Math.min(360, p[6] - p[5]);
        if (span >= 360) cv.arc(X(p[1]), Y(p[2]), Math.max(0, r0), r1, 0, 360, c);
        else if (a0 + span <= 360) cv.arc(X(p[1]), Y(p[2]), Math.max(0, r0), r1, a0, a0 + span, c);
        else {
          // the kit's angles run 0 to 360 from 12 o'clock: an arc across the top goes in two
          cv.arc(X(p[1]), Y(p[2]), Math.max(0, r0), r1, a0, 360, c);
          cv.arc(X(p[1]), Y(p[2]), Math.max(0, r0), r1, 0, a0 + span - 360, c);
        }
        break;
      }
      case 'l':
        cv.line(X(p[1]), Y(p[2]), X(p[3]), Y(p[4]), Math.max(1, p[5] * k), col(p[6]));
        break;
      case 'm': {
        // a tile of a picture's mosaic, on whole pixels so that neighbours leave no seam
        const x0 = Math.floor(X(p[1]));
        const y0 = Math.floor(Y(p[2]));
        cv.fillRect(
          x0,
          y0,
          Math.ceil(X(p[1] + p[3])) - x0,
          Math.ceil(Y(p[2] + p[4])) - y0,
          col(p[5]),
        );
        break;
      }
      case 't': {
        const size = p[4] * k;
        if (size < 9) break;
        cv.text(ascii(p[1]), X(p[2]), Y(p[3]) + size * 0.36, size, col(p[5]), {
          align: p[6] === 1 ? 'center' : p[6] === 2 ? 'right' : 'left',
          font: p[7] ? 'bold' : 'label',
          literal: true,
        });
        break;
      }
      default:
        break;
    }
  }
  cv.noclip();
  return h;
}

/**
 * What the cluster is doing, in one word and one line. `s`: { showing, connected, failed, shown,
 * hold, demo, live, theme, palette }.
 */
function stateOf(s) {
  if (!s.showing)
    return {
      tone: 'off',
      label: 'Off',
      detail: 'The factory cluster shows. Press Show to put the layout up.',
    };
  if (!s.connected)
    return {
      tone: 'bad',
      label: 'Renderer not connected',
      detail: 'cluster-render is not running. Install or update it in the MGU Store.',
    };
  if (s.failed)
    return {
      tone: 'bad',
      label: 'Layout failed',
      detail: 'This theme could not be drawn. Pick another theme.',
    };
  if (!s.shown) {
    if (s.hold)
      return {
        tone: 'wait',
        label: 'Waiting for the car',
        detail: 'The layout goes up once the car is switched on.',
      };
    return {
      tone: 'wait',
      label: 'Waiting for car data',
      detail: s.demo
        ? 'Demo data is on: it never goes to the cluster by itself.'
        : 'No live signals yet.',
    };
  }
  return {
    tone: 'on',
    label: s.demo ? 'On the cluster (demo data)' : 'On the cluster',
    detail: ascii(s.theme) + '  ·  palette ' + ascii(s.palette),
  };
}

function toneColour(t, tone) {
  return tone === 'on' ? GOOD : tone === 'bad' ? t.crit : tone === 'wait' ? t.warn : t.dim;
}

function labels(format = ascii) {
  return (cv, s, x, y, size, c, opts) =>
    cv.text(format(s).slice(0, 140), x, y, size, c, Object.assign({ literal: true }, opts || {}));
}

const label = labels();

function pill(cv, t, x, y, text, tone, format = ascii) {
  const c = toneColour(t, tone);
  const w = cv.textWidth(format(text).slice(0, 140), 18, { font: 'bold', literal: true }) + 50;
  cv.roundRect(x, y, w, 34, 17, withAlpha(t.bg, 0.86));
  cv.strokeRoundRect(x, y, w, 34, 17, 1.5, withAlpha(c, 0.7));
  cv.circle(x + 19, y + 17, 6, c);
  labels(format)(cv, text, x + 34, y + 23, 18, t.text, { font: 'bold' });
  return w;
}

function card(cv, t, x, y, w, h) {
  cv.roundRect(x, y, w, h, 14, t.panelBottom);
  cv.strokeRoundRect(x, y, w, h, 14, 1, t.panelEdge);
}

function meter(cv, t, x, y, w, frac, c) {
  cv.roundRect(x, y, w, 10, 5, t.track);
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0) cv.roundRect(x, y, Math.max(10, w * f), 10, 5, c);
}

/** Where the Themes tab draws its three sketches (page px): the one on show and its neighbours. */
const THEMES = (() => {
  const cw = 820;
  const sw = 300;
  const cy = TOP + 14;
  const ch = Math.round((cw * 720) / 1920);
  const sh = Math.round((sw * 720) / 1920);
  const sy = cy + Math.round((ch - sh) / 2);
  return {
    centre: { x: (W - cw) / 2, y: cy, w: cw, h: ch },
    prev: { x: 40, y: sy, w: sw, h: sh },
    next: { x: W - 40 - sw, y: sy, w: sw, h: sh },
    /** A finger moved this far sideways changes the theme. */
    swipe: 90,
  };
})();

/** Which neighbour a point of the Themes tab is on: -1 the one before, 1 the one after, else 0. */
function themeAt(x, y) {
  const inside = (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h + 40;
  return inside(THEMES.prev) ? -1 : inside(THEMES.next) ? 1 : 0;
}

/**
 * The Themes tab. `m`: { themes: [prev, current, next] as { theme, palette } (prev and next may
 * be null), state (stateOf), layers, paletteName, note, count, at, dx (the sketches follow a
 * finger this far, page px), go(d) (the neighbour's sketch is a place to press: the theme before
 * or after) }.
 */
function themesPage(cv, t, m) {
  const drawLabel = labels(m.format);
  const cur = m.themes[1];
  const dx = Math.max(-260, Math.min(260, m.dx || 0));
  const cw = THEMES.centre.w;
  const cx = THEMES.centre.x + dx;
  const cy = THEMES.centre.y;
  const sw = THEMES.prev.w;
  const sh = THEMES.prev.h;
  const sy = THEMES.prev.y;
  // the neighbour the finger is pulling in shows clearer the further it has come
  const pull = Math.min(1, Math.abs(dx) / THEMES.swipe);
  [
    [m.themes[0], THEMES.prev.x, -1],
    [m.themes[2], THEMES.next.x, 1],
  ].forEach((side) => {
    const it = side[0];
    if (!it) return;
    const x = side[1] + dx;
    const coming = (dx > 0 && side[2] < 0) || (dx < 0 && side[2] > 0);
    drawPreview(cv, it.theme, it.palette, x, sy, sw);
    cv.fillRect(x, sy, sw, sh, withAlpha(t.bg, coming ? 0.4 * (1 - pull) : 0.4));
    cv.strokeRoundRect(
      x,
      sy,
      sw,
      sh,
      4,
      coming && pull >= 1 ? 2 : 1,
      coming && pull >= 1 ? ACCENT : t.panelEdge,
    );
    label(cv, it.theme.name, x + sw / 2, sy + sh + 30, 19, t.dim, { align: 'center' });
    if (m.go && cv.target && !dx)
      cv.target(
        side[1],
        sy,
        sw,
        sh + 40,
        () => m.go(side[2]),
        side[2] < 0 ? 'theme-prev' : 'theme-next',
        4,
      );
  });
  const ch = drawPreview(cv, cur.theme, cur.palette, cx, cy, cw);
  const on = m.state.tone === 'on';
  cv.strokeRoundRect(cx - 3, cy - 3, cw + 6, ch + 6, 6, on ? 3 : 1.5, on ? ACCENT : t.panelEdge);
  pill(cv, t, cx + 14, cy + 12, m.state.label, m.state.tone, m.format);
  label(cv, cur.theme.name, W / 2 + dx, cy + ch + 50, 40, t.text, {
    align: 'center',
    font: 'bold',
  });
  const sub =
    m.layers + ' layers  ·  ' + m.at + ' of ' + m.count + '  ·  Palette: ' + m.paletteName;
  const subW = cv.textWidth((m.format || ascii)(sub).slice(0, 140), 19, { literal: true });
  const sx = W / 2 - (subW + 96) / 2;
  drawLabel(cv, sub, sx, cy + ch + 84, 19, t.dim);
  const pal = paletteOf(cur.theme, cur.palette);
  ['accent', 'text', 'danger'].forEach((tok, i) => {
    cv.circle(sx + subW + 26 + i * 28, cy + ch + 78, 9, kitColour(pal[tok], '#808080'));
  });
  drawLabel(cv, m.note || m.state.detail, W / 2, BOTTOM - 8, 16, t.dim, { align: 'center' });
}

/**
 * The Data tab. `m`: { theme: { theme, palette }, state, mode, source, speed, rpm, redline, gear,
 * programme, fuelPct, fuelText, oil, coolant }.
 */
function dataPage(cv, t, m) {
  const drawLabel = labels(m.format);
  const y0 = TOP + 12;
  // what is on the cluster
  card(cv, t, 40, y0, 480, BOTTOM - y0 - 12);
  const ph = drawPreview(cv, m.theme.theme, m.theme.palette, 60, y0 + 20, 440);
  label(cv, m.theme.theme.name, 60, y0 + ph + 62, 30, t.text, { font: 'bold' });
  pill(cv, t, 60, y0 + ph + 78, m.state.label, m.state.tone, m.format);
  drawLabel(cv, 'DRIVE MODE', 60, y0 + ph + 150, 15, t.dim, { font: 'bold', spacing: 1.5 });
  drawLabel(cv, m.mode || '-', 60, y0 + ph + 182, 28, t.text, { font: 'bold' });
  drawLabel(cv, 'CAR DATA', 300, y0 + ph + 150, 15, t.dim, { font: 'bold', spacing: 1.5 });
  drawLabel(cv, m.source, 300, y0 + ph + 182, 28, m.source === 'Live' ? GOOD : t.warn, {
    font: 'bold',
  });

  const head = (s, x, y) => drawLabel(cv, s, x, y, 15, t.dim, { font: 'bold', spacing: 1.5 });
  // speed
  card(cv, t, 540, y0, 520, 250);
  head('SPEED', 564, y0 + 30);
  // in the driver's units, as the layout shows it (m.mph: units.js unitGroups has 'speed')
  const speed = m.mph && isNum(m.speed) ? m.speed * 0.621371192 : m.speed;
  drawLabel(cv, fmt(speed), 564, y0 + 196, 150, t.text, { font: 'num' });
  drawLabel(cv, m.mph ? 'mph' : 'km/h', 564, y0 + 232, 22, t.dim);
  // engine speed
  card(cv, t, 1080, y0, 480, 118);
  head('ENGINE', 1104, y0 + 30);
  drawLabel(cv, fmt(m.rpm), 1104, y0 + 94, 58, t.text, { font: 'num' });
  drawLabel(cv, 'rpm', 1290, y0 + 94, 20, t.dim);
  meter(cv, t, 1350, y0 + 76, 186, isNum(m.rpm) ? m.rpm / (m.redline || 7000) : 0, ACCENT);
  // gear and shift programme
  card(cv, t, 1080, y0 + 132, 232, 118);
  head('GEAR', 1104, y0 + 162);
  drawLabel(cv, m.gear || '-', 1104, y0 + 230, 62, t.text, { font: 'bold' });
  card(cv, t, 1328, y0 + 132, 232, 118);
  head('SHIFT PROGRAMME', 1352, y0 + 162);
  drawLabel(cv, m.programme || '-', 1352, y0 + 230, 62, t.text, { font: 'bold' });
  // fuel
  card(cv, t, 540, y0 + 264, 1020, 84);
  head('FUEL', 564, y0 + 294);
  drawLabel(cv, isNum(m.fuelPct) ? fmt(m.fuelPct) + ' %' : '--', 564, y0 + 332, 32, t.text, {
    font: 'bold',
  });
  meter(
    cv,
    t,
    720,
    y0 + 312,
    816,
    isNum(m.fuelPct) ? m.fuelPct / 100 : 0,
    isNum(m.fuelPct) && m.fuelPct < 15 ? t.crit : t.warn,
  );
  drawLabel(cv, m.fuelText || '', 1536, y0 + 296, 18, t.dim, { align: 'right' });
  // temperatures
  [
    ['OIL', m.oil, 540],
    ['COOLANT', m.coolant, 1058],
  ].forEach((r) => {
    card(cv, t, r[2], y0 + 362, 502, BOTTOM - 12 - (y0 + 362));
    head(r[0], r[2] + 24, y0 + 392);
    drawLabel(cv, isNum(r[1]) ? fmt(r[1]) + '°' : '--', r[2] + 24, y0 + 430, 32, t.text, {
      font: 'bold',
    });
    meter(
      cv,
      t,
      r[2] + 150,
      y0 + 410,
      328,
      isNum(r[1]) ? (r[1] - 40) / 90 : 0,
      isNum(r[1]) && r[1] > 120 ? t.crit : ACCENT,
    );
  });
}

/** The first text page: one line each for the cluster, the theme, the renderer, the car and the rest. */
function statusPage(cv, t, m) {
  const drawLabel = labels(m.format);
  const lines = [
    ['On the cluster', m.state.label + '  ·  ' + m.state.detail],
    ['Theme', m.themeLine],
    ['Cluster renderer', m.rendererLine],
    ['Car data', m.carLine],
    ['Drive mode', m.modeLine],
    ['Fuel', m.fuel || '-'],
    ['Providers', m.providers || '-'],
    ['USB themes', m.usb],
    [
      'Safety',
      'Experimental software. Factory warnings stay on top. Deactivate here or uninstall from the MGU Store to restore everything.',
    ],
  ];
  lines.forEach((l, i) => {
    // 9 rows: 40 px apart so the last stays clear of the footer at y 500
    drawLabel(cv, l[0], 48, 140 + i * 40, 20, t.dim, { font: 'bold' });
    drawLabel(
      cv,
      l[1],
      300,
      140 + i * 40,
      l[0] === 'Safety' || l[0] === 'USB themes' || l[0] === 'Providers' ? 16 : 19,
      i === 0 && m.state.tone !== 'off' ? toneColour(t, m.state.tone) : t.text,
    );
  });
}

function signalsPage(cv, t, m) {
  const drawLabel = labels(m.format);
  drawLabel(
    cv,
    'Signals (' + (m.demo ? 'demo' : 'car') + ')  ·  catalog id, value, age',
    48,
    120,
    22,
    t.dim,
    { font: 'bold' },
  );
  m.signals.slice(0, 24).forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    label(cv, s.text, 48 + col * 780, 156 + row * 26, 16, s.fresh ? t.text : t.dim);
  });
  let y = 156 + 12 * 26 + 10;
  m.raw.slice(0, 4).forEach((r) => {
    label(cv, r, 48, y, 14, t.dim);
    y += 20;
  });
}

function rendererPage(cv, t, m) {
  const drawLabel = labels(m.format);
  drawLabel(
    cv,
    'Cluster renderer status (' + (m.connected ? 'connected' : 'disconnected') + ')',
    48,
    120,
    22,
    t.dim,
    { font: 'bold' },
  );
  m.lines.slice(0, 14).forEach((l, i) => {
    const drawLine = l === 'open this page with the layout showing' ? drawLabel : label;
    drawLine(cv, l, 48, 156 + i * 22, 15, t.text);
  });
  drawLabel(cv, m.footer, 48, 476, 14, t.dim);
}

function aboutPage(cv, t, m) {
  const drawLabel = labels(m.format);
  drawLabel(cv, 'About', 48, 120, 22, t.dim, { font: 'bold' });
  [
    'idv7lol is free, open-source software (GPL-3.0-or-later): github.com/ALMSTRA/idv7lol',
    'Not affiliated with BMW AG. Experimental: use parked, keep the factory warnings in view.',
    'Themes are made with idv7lol Studio and compiled to one GPU layer per piece.',
    'Drawing by cluster-render (Robert Nisipeanu, MPL-2.0 client). Fonts: Barlow (SIL OFL 1.1).',
    'App kit: cauliflowermossgrape/idrive7-apps (MIT).',
    m.versions,
  ].forEach((l, i) => drawLabel(cv, l, 48, 160 + i * 36, 17, t.text));
}

/** One of the four text pages (0 Status, 1 Signals, 2 Renderer, 3 About), with the app's title. */
function textPage(cv, t, n, m) {
  label(cv, 'idv7lol ' + m.version, 48, 86, 34, t.text, { font: 'bold' });
  if (n === 0) statusPage(cv, t, m);
  else if (n === 1) signalsPage(cv, t, m);
  else if (n === 2) rendererPage(cv, t, m);
  else aboutPage(cv, t, m);
}

module.exports = {
  W,
  H,
  TOP,
  BOTTOM,
  THEMES,
  themeAt,
  MODERN_TABS,
  CLASSIC_PAGES,
  ascii,
  fmt,
  isNum,
  kitColour,
  drawPreview,
  stateOf,
  themesPage,
  dataPage,
  textPage,
  label,
  labels,
};
