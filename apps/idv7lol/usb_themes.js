'use strict';
/**
 * usb_themes.js - themes from a USB stick, installed by themselves.
 *
 * The Studio saves a theme as idv7lol/themes/<id>.idv7pkg on a stick: one
 * gzip'd JSON file with the compiled theme and its image layers. Every few
 * seconds this module looks at the sticks the unit has mounted (/media/<label>,
 * the same place Cluster Layouts writes its logs), checks each new package and
 * copies the good ones to the app's data folder. Nothing on the cluster changes
 * until the driver picks the theme.
 *
 * A package never brings shaders: its pieces name a shader and the app uses its
 * own copy (shaders.js). Anything that doesn't fit the renderer's limits, the
 * panel or the known shaders is refused with a reason.
 *
 * Node 8: CommonJS, builtins only.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const FORMAT = 1;
const EXT = '.idv7pkg';
const STICK_DIR = path.join('idv7lol', 'themes');
const MEDIA_ROOTS = ['/media', '/run/media'];
const PREFIX = 'usb:';

const LIMITS = {
  fileBytes: 32 * 1024 * 1024,
  jsonBytes: 64 * 1024 * 1024,
  layers: 64,
  sprites: 15,
  pixelBytes: 16 * 1024 * 1024,
  themes: 20,
  width: 1920,
  height: 720,
  atlasSide: 2048,
};

/** Compare "1.2.3" versions: <0, 0 or >0. */
function compareVersions(a, b) {
  const pa = String(a)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

const isNum = (v) => typeof v === 'number' && isFinite(v);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMAGE_RE = /^images\/[A-Za-z0-9_.-]{1,96}\.rgba$/;

function fail(reason) {
  const e = new Error(reason);
  e.refused = true;
  throw e;
}

/**
 * Read and check a package. Returns { meta, theme, images } with the theme's
 * shaders filled in from `shaders`, or throws an Error whose message says why.
 */
function readPackage(buf, opts) {
  if (buf.length > LIMITS.fileBytes) fail('file too large');
  let json;
  try {
    json = zlib.gunzipSync(buf);
  } catch (_e) {
    fail('not a theme package (not gzip)');
  }
  if (json.length > LIMITS.jsonBytes) fail('package too large');
  let pkg;
  try {
    pkg = JSON.parse(json.toString('utf8'));
  } catch (_e) {
    fail('not a theme package (bad JSON)');
  }
  if (!pkg || pkg.idv7pkg !== FORMAT) fail('unknown package format');
  if (compareVersions(opts.appVersion, pkg.minAppVersion || '0.0.0') < 0)
    fail('needs idv7lol ' + pkg.minAppVersion + ' or newer');
  const theme = pkg.theme;
  if (!theme || typeof theme !== 'object' || theme.format !== 1) fail('unknown theme format');
  if (typeof theme.id !== 'string' || !ID_RE.test(theme.id)) fail('bad theme id');
  if (!theme.target || theme.target.renderTarget !== 'panel') fail('not a panel theme');
  if (theme.target.width !== LIMITS.width || theme.target.height !== LIMITS.height)
    fail('layout is not 1920x720');
  if (!Array.isArray(theme.pieces) || !Array.isArray(theme.images)) fail('theme has no layers');
  if (!theme.palettes || !theme.paletteSelection || !theme.palettes[theme.paletteSelection.default])
    fail('theme has no default palette');
  if (theme.pieces.length + theme.images.length > LIMITS.layers)
    fail('more than ' + LIMITS.layers + ' layers');

  const inside = (o) =>
    isNum(o.x) &&
    isNum(o.y) &&
    isNum(o.w) &&
    isNum(o.h) &&
    o.w > 0 &&
    o.h > 0 &&
    o.x >= -LIMITS.width &&
    o.y >= -LIMITS.height &&
    o.x + o.w <= 2 * LIMITS.width &&
    o.y + o.h <= 2 * LIMITS.height;

  const shaders = {};
  theme.pieces.forEach((p, i) => {
    if (!p || typeof p.shader !== 'string' || !opts.shaders[p.shader])
      fail('layer ' + i + ' uses an unknown shader');
    if (!inside(p)) fail('layer ' + i + ' is outside the panel');
    shaders[p.shader] = opts.shaders[p.shader];
  });

  const images = {};
  let pixelBytes = 0;
  let sprites = 0;
  const data = pkg.images || {};
  theme.images.forEach((img, i) => {
    if (!img || typeof img.file !== 'string' || !IMAGE_RE.test(img.file))
      fail('image ' + i + ' has a bad file name');
    if (!inside(img)) fail('image ' + i + ' is outside the panel');
    if (!isNum(img.iw) || !isNum(img.ih) || img.iw < 1 || img.ih < 1)
      fail('image ' + i + ' has no size');
    if (img.sprite) {
      sprites++;
      if (img.iw > LIMITS.atlasSide || img.ih > LIMITS.atlasSide)
        fail('animation ' + i + ' too large');
      if (!opts.shaders.sprite) fail('this app version cannot play animations');
      shaders.sprite = opts.shaders.sprite;
    } else if (img.iw > LIMITS.width || img.ih > LIMITS.height) {
      fail('image ' + i + ' too large');
    }
    const b64 = data[img.file];
    if (typeof b64 !== 'string') fail('image ' + i + ' has no pixels');
    const px = Buffer.from(b64, 'base64');
    if (px.length !== img.iw * img.ih * 4) fail('image ' + i + ' has the wrong size');
    pixelBytes += px.length;
    images[img.file] = px;
  });
  if (sprites > LIMITS.sprites) fail('more than ' + LIMITS.sprites + ' animations');
  if (pixelBytes > LIMITS.pixelBytes) fail('images use too much renderer memory');

  // Fonts: the ones this app ships; anything else falls back to the first.
  const fonts = (Array.isArray(theme.fonts) ? theme.fonts : []).filter(
    (f) => opts.fonts.indexOf(f) >= 0,
  );
  theme.fonts = fonts.length ? fonts : opts.fonts.slice(0, 1);
  theme.shaders = shaders;

  return {
    meta: {
      id: theme.id,
      name: String(pkg.name || theme.name || theme.id).slice(0, 60),
      author: String(pkg.author || theme.author || '').slice(0, 60),
      version: String(pkg.version || theme.version || ''),
    },
    theme,
    images,
  };
}

function mkdirp(dir) {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  fs.mkdirSync(dir);
}

function rmrf(p) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch (_e) {
    return;
  }
  if (st.isDirectory()) {
    fs.readdirSync(p).forEach((f) => rmrf(path.join(p, f)));
    fs.rmdirSync(p);
  } else fs.unlinkSync(p);
}

/** The themes installed in the app's data folder. */
class ThemeLibrary {
  constructor(opts) {
    this.dir = path.join(opts.dataDir, 'themes');
    this.log = opts.log;
  }

  /** [{ key, id, name, author, version, hash }], sorted by name. */
  list() {
    let dirs = [];
    try {
      dirs = fs.readdirSync(this.dir);
    } catch (_e) {
      return [];
    }
    const out = [];
    dirs.forEach((d) => {
      if (!ID_RE.test(d)) return;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(this.dir, d, 'meta.json'), 'utf8'));
        meta.key = PREFIX + d;
        out.push(meta);
      } catch (_e) {
        /* half-written or foreign folder: not a theme */
      }
    });
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  has(hash) {
    return this.list().some((t) => t.hash === hash);
  }

  /** Write a checked package; replaces an older copy of the same theme. */
  install(checked, hash, source) {
    const id = checked.meta.id;
    const replacing = fs.existsSync(path.join(this.dir, id));
    if (!replacing && this.list().length >= LIMITS.themes)
      fail('already ' + LIMITS.themes + ' themes installed');
    mkdirp(this.dir);
    const tmp = path.join(this.dir, '.tmp-' + id);
    rmrf(tmp);
    mkdirp(path.join(tmp, 'images'));
    Object.keys(checked.images).forEach((file) => {
      fs.writeFileSync(path.join(tmp, file), checked.images[file]);
    });
    fs.writeFileSync(path.join(tmp, 'theme.json'), JSON.stringify(checked.theme));
    const meta = {
      id,
      name: checked.meta.name,
      author: checked.meta.author,
      version: checked.meta.version,
      hash,
      source,
      installedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify(meta));
    const target = path.join(this.dir, id);
    rmrf(target);
    fs.renameSync(tmp, target);
    meta.key = PREFIX + id;
    return meta;
  }

  /** { theme, imageDir } for a key from list(). */
  load(key) {
    const id = String(key).slice(PREFIX.length);
    if (!ID_RE.test(id)) throw new Error('bad theme key');
    const dir = path.join(this.dir, id);
    return {
      theme: JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')),
      imageDir: dir,
    };
  }

  remove(key) {
    const id = String(key).slice(PREFIX.length);
    if (!ID_RE.test(id)) return false;
    rmrf(path.join(this.dir, id));
    return true;
  }
}

/** Packages on the mounted sticks: [{ file, size, mtime }]. */
function findPackages(roots) {
  const out = [];
  const look = (mount) => {
    const dir = path.join(mount, STICK_DIR);
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (_e) {
      return;
    }
    files.forEach((f) => {
      if (f.toLowerCase().slice(-EXT.length) !== EXT) return;
      try {
        const st = fs.statSync(path.join(dir, f));
        if (st.isFile())
          out.push({ file: path.join(dir, f), size: st.size, mtime: st.mtime.getTime() });
      } catch (_e) {
        /* gone */
      }
    });
  };
  roots.forEach((root) => {
    let entries;
    try {
      entries = fs.readdirSync(root);
    } catch (_e) {
      return;
    }
    entries.forEach((name) => {
      const p = path.join(root, name);
      look(p);
      // /run/media/<user>/<label>: one level more
      if (root.indexOf('run') >= 0) {
        try {
          fs.readdirSync(p).forEach((inner) => look(path.join(p, inner)));
        } catch (_e) {
          /* not a folder */
        }
      }
    });
  });
  return out;
}

/**
 * Looks at the sticks every `intervalMs` and installs new packages.
 * opts: { library, log, appVersion, shaders, fonts, roots?, intervalMs?, onChange(results) }
 * Each result: { file, ok, theme?, reason? }.
 */
class UsbWatcher {
  constructor(opts) {
    this.opts = opts;
    this.roots = opts.roots || MEDIA_ROOTS;
    this.seen = {};
    this.last = null;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.opts.intervalMs || 5000);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One look at the sticks; returns this round's results (empty when nothing new). */
  tick() {
    const o = this.opts;
    const results = [];
    const present = {};
    findPackages(this.roots).forEach((p) => {
      const mark = p.size + ':' + p.mtime;
      present[p.file] = mark;
      if (this.seen[p.file] === mark) return;
      this.seen[p.file] = mark;
      const name = path.basename(p.file);
      try {
        const buf = fs.readFileSync(p.file);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        if (o.library.has(hash)) return;
        const checked = readPackage(buf, o);
        const meta = o.library.install(checked, hash, 'usb');
        results.push({ file: name, ok: true, theme: meta });
        if (o.log) o.log.info('usb: installed ' + meta.id + ' ' + meta.version + ' from ' + name);
      } catch (e) {
        results.push({ file: name, ok: false, reason: e.message });
        if (o.log) o.log.warn('usb: ' + name + ' refused: ' + e.message);
      }
    });
    // forget files that went away, so the same stick is read again next time
    Object.keys(this.seen).forEach((f) => {
      if (!present[f]) delete this.seen[f];
    });
    if (results.length) {
      this.last = { at: Date.now(), results };
      if (o.onChange) o.onChange(results);
    }
    return results;
  }
}

module.exports = {
  FORMAT,
  EXT,
  PREFIX,
  LIMITS,
  MEDIA_ROOTS,
  compareVersions,
  readPackage,
  findPackages,
  ThemeLibrary,
  UsbWatcher,
};
