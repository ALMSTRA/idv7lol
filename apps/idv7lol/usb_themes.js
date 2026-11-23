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
const isCount = (v) => isNum(v) && v >= 1 && Math.floor(v) === v;
// Own keys only: a name like "constructor" must not find Object.prototype.
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMAGE_RE = /^images\/[A-Za-z0-9_.-]{1,96}\.(rgba|etc2|r8)$/;

/** Why an animation's frame grid doesn't fit its atlas, or '' when it does. */
function badSprite(sp, iw, ih) {
  if (!sp || typeof sp !== 'object') return 'no frame data';
  if (![sp.columns, sp.rows, sp.cellW, sp.cellH, sp.frames].every(isCount)) return 'bad grid';
  if (sp.frames > sp.columns * sp.rows) return 'more frames than cells';
  if (sp.columns * sp.cellW > iw || sp.rows * sp.cellH > ih) return 'grid larger than the sheet';
  if (!Array.isArray(sp.durations) || sp.durations.length !== sp.frames) return 'bad durations';
  if (!sp.durations.every((d) => isNum(d) && d > 0 && d <= 60000)) return 'bad durations';
  return '';
}

function fail(reason) {
  const e = new Error(reason);
  e.refused = true;
  throw e;
}

/**
 * Inflate a gzip file without ever holding more than `cap` bytes of what comes out: a file of a
 * megabyte or two can inflate to gigabytes, and gunzipSync has no limit on Node 8. The file goes
 * in slice by slice and no more is fed once the output passes the cap.
 * cb(err, buffer); err.refused is set, with the reason as its message.
 */
function gunzipCapped(buf, cap, cb) {
  const gz = zlib.createGunzip();
  const parts = [];
  let total = 0;
  let done = false;
  const end = (reason, out) => {
    if (done) return;
    done = true;
    gz.removeAllListeners('data');
    // Stopped early: no more goes in, and the stream is ended once it is back from the slice it
    // is on (closing it from inside its own callback throws on Node 8). What it still gives out
    // is dropped; the error the cut-off file then raises is caught by the listener below.
    if (reason)
      setImmediate(() => {
        try {
          gz.end();
        } catch (_e) {
          /* ended already */
        }
      });
    if (!reason) return cb(null, out);
    const e = new Error(reason);
    e.refused = true;
    return cb(e);
  };
  gz.on('data', (c) => {
    total += c.length;
    if (total > cap) end('package too large');
    else parts.push(c);
  });
  gz.on('error', () => end('not a theme package (not gzip)'));
  gz.on('end', () => end(null, Buffer.concat(parts, total)));
  // 8 KiB of a file inflate to 8 MiB at the very most
  const STEP = 8192;
  let i = 0;
  const feed = () => {
    if (done) return;
    if (i >= buf.length) {
      gz.end();
      return;
    }
    const more = gz.write(buf.slice(i, i + STEP));
    i += STEP;
    if (more) setImmediate(feed);
    else gz.once('drain', feed);
  };
  feed();
}

/** The size a gzip file says it inflates to (its last four bytes), or -1 for a file too short. */
function declaredSize(buf) {
  return buf.length >= 18 ? buf.readUInt32LE(buf.length - 4) : -1;
}

const PREVIEW_MAX = 160;
/** `sketch` adds the pictures' mosaic tiles to those (theme-compiler MOSAIC_MAX). */
const SKETCH_MAX = PREVIEW_MAX + 900;
const COLOUR_RE = /^(\$[a-z0-9-]{1,32}|#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?)$/;
// how many numbers each shape of a sketch carries before its colour (a text is checked apart)
const PREVIEW_SHAPES = { r: 5, o: 6, c: 3, a: 6, l: 5, m: 4 };

/** A theme's sketch for the app's page (theme-compiler preview.ts) with anything odd left out. */
function cleanPreview(list, max) {
  if (!Array.isArray(list)) return [];
  const num = (v) => isNum(v) && Math.abs(v) <= 8192;
  return list.slice(0, max || PREVIEW_MAX).filter((p) => {
    if (!Array.isArray(p) || typeof p[0] !== 'string') return false;
    if (p[0] === 't')
      return (
        p.length === 8 &&
        typeof p[1] === 'string' &&
        p[1].length <= 24 &&
        [p[2], p[3], p[4], p[6], p[7]].every(num) &&
        p[4] > 0 &&
        typeof p[5] === 'string' &&
        COLOUR_RE.test(p[5])
      );
    const n = PREVIEW_SHAPES[p[0]];
    return (
      n !== undefined &&
      p.length === n + 2 &&
      p.slice(1, n + 1).every(num) &&
      typeof p[n + 1] === 'string' &&
      COLOUR_RE.test(p[n + 1])
    );
  });
}

/**
 * Read and check a package. Returns { meta, theme, images } with the theme's
 * shaders filled in from `shaders`, or throws an Error whose message says why.
 * `inflated` is the package's JSON when the caller inflated it already (the USB watcher does,
 * with gunzipCapped); without it the file is inflated here in one go, so only for files whose
 * own header says they stay under the limit.
 */
const UNIT_GROUPS = ['speed', 'temperature', 'pressure'];

/** A theme's `units` with every piece checked, or undefined. */
function cleanUnits(theme, shaders, inside) {
  const units = theme.units;
  if (!units || typeof units !== 'object' || Array.isArray(units)) return undefined;
  const base = {};
  theme.pieces.forEach((p) => {
    base[p.key] = p;
  });
  const out = {};
  const taken = {};
  let ok = true;
  UNIT_GROUPS.forEach((g) => {
    const set = units[g];
    if (set === undefined) return;
    if (!set || typeof set !== 'object' || Array.isArray(set)) {
      ok = false;
      return;
    }
    Object.keys(set).forEach((key) => {
      const p = set[key];
      const b = has(base, key) ? base[key] : null;
      if (
        !b ||
        has(taken, key) ||
        !p ||
        typeof p !== 'object' ||
        p.key !== key ||
        p.shader !== b.shader ||
        !has(shaders, p.shader) ||
        !p.statics ||
        typeof p.statics !== 'object' ||
        !inside(p) ||
        JSON.stringify(p.texture === undefined ? null : p.texture) !==
          JSON.stringify(b.texture === undefined ? null : b.texture)
      )
        ok = false;
      taken[key] = true;
    });
    out[g] = set;
  });
  return ok && Object.keys(out).length ? out : undefined;
}

function readPackage(buf, opts, inflated) {
  if (buf.length > LIMITS.fileBytes) fail('file too large');
  let json = inflated;
  if (!json) {
    if (declaredSize(buf) > LIMITS.jsonBytes) fail('package too large');
    try {
      json = zlib.gunzipSync(buf);
    } catch (_e) {
      fail('not a theme package (not gzip)');
    }
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
    if (
      !p ||
      typeof p.shader !== 'string' ||
      !has(opts.shaders, p.shader) ||
      typeof opts.shaders[p.shader] !== 'string'
    )
      fail('layer ' + i + ' uses an unknown shader');
    if (!p.statics || typeof p.statics !== 'object') fail('layer ' + i + ' is incomplete');
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
    if (!isCount(img.iw) || !isCount(img.ih)) fail('image ' + i + ' has no size');
    // An animation's atlas may come as etc2rgba blocks (a byte a pixel, whole 4x4 blocks).
    const etc2 = img.format === 'etc2rgba';
    if (img.format !== undefined && !etc2) fail('image ' + i + ' has an unknown format');
    if (etc2 && (!img.sprite || img.iw % 4 || img.ih % 4))
      fail('image ' + i + ' is not a whole number of ETC2 blocks');
    if (img.sprite) {
      sprites++;
      if (img.iw > LIMITS.atlasSide || img.ih > LIMITS.atlasSide)
        fail('animation ' + i + ' too large');
      const why = badSprite(img.sprite, img.iw, img.ih);
      if (why) fail('animation ' + i + ': ' + why);
      if (!has(opts.shaders, 'sprite')) fail('this app version cannot play animations');
      shaders.sprite = opts.shaders.sprite;
    } else if (img.iw > LIMITS.width || img.ih > LIMITS.height) {
      fail('image ' + i + ' too large');
    }
    const b64 = data[img.file];
    if (typeof b64 !== 'string') fail('image ' + i + ' has no pixels');
    const px = Buffer.from(b64, 'base64');
    if (px.length !== img.iw * img.ih * (etc2 ? 1 : 4)) fail('image ' + i + ' has the wrong size');
    // cluster-render charges uncompressed pixels twice, compressed ones once
    pixelBytes += etc2 ? px.length : 2 * px.length;
    images[img.file] = px;
  });
  // Pictures layers sample (a custom icon's mask, a needle of your own): R8 or RGBA8, uncompressed.
  let textures = 0;
  theme.pieces.forEach((p, i) => {
    const t = p.texture;
    if (t === undefined) return;
    textures++;
    if (!t || typeof t.file !== 'string' || !IMAGE_RE.test(t.file))
      fail('layer ' + i + ' has a bad picture name');
    if (t.format !== 'r8' && t.format !== 'rgba8')
      fail('layer ' + i + ' has a picture of no known format');
    if (!isCount(t.w) || !isCount(t.h) || t.w > 1024 || t.h > 1024)
      fail('layer ' + i + ' has a picture of a bad size');
    if (t.sampler !== 'u_mask' && t.sampler !== 'u_tex')
      fail('layer ' + i + ' samples an unknown picture');
    const b64 = data[t.file];
    if (typeof b64 !== 'string') fail('layer ' + i + ' has no picture');
    const px = Buffer.from(b64, 'base64');
    if (px.length !== t.w * t.h * (t.format === 'r8' ? 1 : 4))
      fail('layer ' + i + ' has a picture of the wrong size');
    pixelBytes += 2 * px.length;
    images[t.file] = px;
  });
  if (sprites + textures > LIMITS.sprites)
    fail('more than ' + LIMITS.sprites + ' animations, custom icons and needle pictures');
  if (sprites > LIMITS.sprites) fail('more than ' + LIMITS.sprites + ' animations');
  if (pixelBytes > LIMITS.pixelBytes) fail('images use too much renderer memory');

  // The pieces for other units (theme-compiler types.ts `units`): each takes the place of the
  // piece with its key, so it must be the same kind of layer and pass the same checks. Anything
  // else and the theme is installed without them, shown as drawn.
  theme.units = cleanUnits(theme, opts.shaders, inside);

  // Fonts: the ones this app ships; anything else falls back to the first.
  const fonts = (Array.isArray(theme.fonts) ? theme.fonts : []).filter(
    (f) => opts.fonts.indexOf(f) >= 0,
  );
  theme.fonts = fonts.length ? fonts : opts.fonts.slice(0, 1);
  theme.shaders = shaders;
  theme.preview = cleanPreview(theme.preview).filter((p) => p[0] !== 'm');
  theme.sketch = cleanPreview(theme.sketch, SKETCH_MAX);

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

const RESTART = 'Restart the head unit and plug the stick in again.';

/**
 * Why a theme could not be written, in words for the page: the system's own text
 * ("EACCES: permission denied, mkdir '/var/...'") says little there and goes to the log.
 */
function storageReason(e) {
  const code = (e && e.code) || 'error';
  if (code === 'ENOSPC') return 'no space left on the head unit (ENOSPC)';
  if (code === 'EROFS') return "the head unit's storage is read-only right now (EROFS). " + RESTART;
  if (code === 'EGONE')
    return "the app's data folder is gone, as after an update of the app. " + RESTART;
  return 'the app cannot write to its data folder (' + code + '). ' + RESTART;
}

/** The themes installed in the app's data folder. */
class ThemeLibrary {
  constructor(opts) {
    this.root = opts.dataDir;
    this.dir = path.join(opts.dataDir, 'themes');
    this.log = opts.log;
  }

  /**
   * '' when the data folder takes a file, else why not (storageReason). An app left running
   * from an install that an update replaced has no folder any more; nothing is made above it.
   */
  storage() {
    try {
      this._root();
      const probe = path.join(this.root, '.write-test-' + process.pid);
      fs.writeFileSync(probe, '');
      fs.unlinkSync(probe);
      return '';
    } catch (e) {
      return storageReason(e);
    }
  }

  /** The data folder itself: made when only it is missing, never the folders above it. */
  _root() {
    if (fs.existsSync(this.root)) return;
    if (!fs.existsSync(path.dirname(this.root))) {
      const e = new Error('data folder gone: ' + this.root);
      e.code = 'EGONE';
      throw e;
    }
    fs.mkdirSync(this.root);
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
    try {
      return this._write(checked, hash, source, id);
    } catch (e) {
      if (this.log) this.log.warn('usb: could not save ' + id + ': ' + ((e && e.message) || e));
      return fail(storageReason(e));
    }
  }

  _write(checked, hash, source, id) {
    this._root();
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

  /**
   * One look at the sticks. New packages are read and inflated a piece at a time, so a large or
   * a bad one never stalls the cluster; `onChange(results)` is called once this round's files are
   * all installed or refused (never from inside tick itself). `done(results)`, if given, is
   * called at the end of every round, with an empty list when there was nothing new. Returns how
   * many files it took up.
   */
  tick(done) {
    const o = this.opts;
    const present = {};
    const fresh = [];
    findPackages(this.roots).forEach((p) => {
      const mark = p.size + ':' + p.mtime;
      present[p.file] = mark;
      if (this.seen[p.file] === mark) return;
      this.seen[p.file] = mark;
      fresh.push(p);
    });
    // forget files that went away, so the same stick is read again next time
    Object.keys(this.seen).forEach((f) => {
      if (!present[f]) delete this.seen[f];
    });
    if (!fresh.length) {
      if (done) done([]);
      return 0;
    }
    const results = [];
    let left = fresh.length;
    const settle = () => {
      if (--left) return;
      if (results.length) {
        this.last = { at: Date.now(), results };
        try {
          if (o.onChange) o.onChange(results);
        } catch (e) {
          if (o.log) o.log.warn('usb: ' + ((e && e.stack) || e));
        }
      }
      if (done) done(results);
    };
    fresh.forEach((p) => {
      const name = path.basename(p.file);
      const refuse = (reason) => {
        results.push({ file: name, ok: false, reason });
        if (o.log) o.log.warn('usb: ' + name + ' refused: ' + reason);
        settle();
      };
      // the size first: a file over the limit is never read
      if (p.size > LIMITS.fileBytes) return refuse('file too large');
      let buf;
      let hash;
      try {
        buf = fs.readFileSync(p.file);
        hash = crypto.createHash('sha256').update(buf).digest('hex');
      } catch (e) {
        return refuse(e.message);
      }
      if (o.library.has(hash)) return settle();
      return gunzipCapped(buf, LIMITS.jsonBytes, (err, json) => {
        if (err) return refuse(err.message);
        try {
          const meta = o.library.install(readPackage(buf, o, json), hash, 'usb');
          results.push({ file: name, ok: true, theme: meta });
          if (o.log) o.log.info('usb: installed ' + meta.id + ' ' + meta.version + ' from ' + name);
        } catch (e) {
          return refuse(e.message);
        }
        return settle();
      });
    });
    return fresh.length;
  }
}

module.exports = {
  FORMAT,
  EXT,
  PREFIX,
  LIMITS,
  MEDIA_ROOTS,
  compareVersions,
  gunzipCapped,
  cleanPreview,
  readPackage,
  findPackages,
  ThemeLibrary,
  UsbWatcher,
};
