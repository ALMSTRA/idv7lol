'use strict';
/**
 * store.js - the online store: themes from idv7lol.com, installed in the car.
 *
 * Off unless the driver turns "Online store" on, and only while the car is parked. The app asks
 * the site for three things, all with GET and nothing about the car in them:
 *
 *   catalog.json   { sig, body }: body is the catalog as JSON text, { v: 1, seq, themes: [..] },
 *                  and sig its ECDSA P-256 / SHA-256 signature (DER, base64) by one of KEYS
 *                  (store_keys.js). A catalog that is not signed, or older than the last one
 *                  seen (seq), is refused.
 *   a theme        the .idv7pkg the catalog names, taken only when its size and sha256 are the
 *                  signed ones, and then checked and saved exactly as one from a USB stick
 *                  (usb_themes.js readPackage, ThemeLibrary.install).
 *   inbox/<code>   { v: 1, themes: [ids] }: what somebody sent to this car from the site's page
 *                  on a phone, opened with the QR code the Store tab shows. <code> is 20 random
 *                  characters made here once; only themes of the signed catalog are taken.
 *
 * Installing never changes the cluster: the theme joins the list and the driver picks it.
 *
 * Node 8: CommonJS, builtins only.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const usb = require('./usb_themes');

const HOST = 'www.idv7lol.com';
const BASE = 'https://' + HOST + '/car/v1/';
const PHONE = 'https://' + HOST + '/car/#';
const STATE_FILE = 'store.json';
const LIMITS = {
  catalogBytes: 512 * 1024,
  inboxBytes: 16 * 1024,
  packageBytes: 8 * 1024 * 1024,
  themes: 500,
  inbox: 20,
};
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const CODE_RE = /^[a-z2-7]{20}$/;
const COLOUR_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const TOKEN_RE = /^[a-z0-9-]{1,32}$/;
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

const NO_INTERNET = 'No internet. The app needs mgu-uplink from the MGU Store and a phone hotspot.';
const PARKED_ONLY = 'The store works only while the car is parked.';

function refuse(reason) {
  const e = new Error(reason);
  e.refused = true;
  throw e;
}

/** 20 characters of a-z and 2-7 from 100 random bits. */
function newCode() {
  const bytes = crypto.randomBytes(13);
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length && out.length < 20; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5 && out.length < 20) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** One theme of the catalog with anything odd refused: null for an entry the app cannot offer. */
function cleanItem(raw, host) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  if (typeof raw.sha256 !== 'string' || !HASH_RE.test(raw.sha256)) return null;
  const size = raw.size;
  if (typeof size !== 'number' || Math.floor(size) !== size || size < 1) return null;
  if (size > LIMITS.packageBytes) return null;
  let url;
  try {
    url = new URL(String(raw.url));
  } catch (_e) {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password)
    return null;
  if (url.port) return null;
  const colors = {};
  if (raw.colors && typeof raw.colors === 'object')
    Object.keys(raw.colors)
      .slice(0, 64)
      .forEach((k) => {
        if (TOKEN_RE.test(k) && typeof raw.colors[k] === 'string' && COLOUR_RE.test(raw.colors[k]))
          colors[k] = raw.colors[k];
      });
  const background =
    typeof raw.background === 'string' &&
    (COLOUR_RE.test(raw.background) || /^\$[a-z0-9-]{1,32}$/.test(raw.background))
      ? raw.background
      : '#000000';
  const name = text(raw.name, 60) || raw.id;
  return {
    id: raw.id,
    name,
    author: text(raw.author, 60),
    version: text(raw.version, 20),
    layers: typeof raw.layers === 'number' && raw.layers > 0 ? Math.floor(raw.layers) : 0,
    size,
    sha256: raw.sha256,
    url: url.toString(),
    // what the page draws the theme's sketch from (page.js drawPreview)
    theme: {
      name,
      background,
      preview: usb.cleanPreview(raw.preview).filter((p) => p[0] !== 'm'),
      palettes: { store: { colors } },
      paletteSelection: { default: 'store' },
    },
  };
}

/**
 * The catalog of a downloaded catalog.json: { seq, themes: [cleanItem] }. Throws (refused) when
 * it is not signed by one of `keys` (PEM public keys) or is not a catalog.
 */
function readCatalog(buf, keys, host) {
  let env;
  try {
    env = JSON.parse(buf.toString('utf8'));
  } catch (_e) {
    refuse('the catalog is not JSON');
  }
  if (!env || typeof env.body !== 'string' || typeof env.sig !== 'string')
    refuse('the catalog has no signature');
  const sig = Buffer.from(env.sig, 'base64');
  const signed = (keys || []).some((pem) => {
    try {
      return crypto.createVerify('SHA256').update(env.body, 'utf8').verify(pem, sig);
    } catch (_e) {
      return false;
    }
  });
  if (!signed) refuse('the catalog is not signed by idv7lol');
  let body;
  try {
    body = JSON.parse(env.body);
  } catch (_e) {
    refuse('the catalog is not JSON');
  }
  if (!body || body.v !== 1 || !Array.isArray(body.themes)) refuse('unknown catalog format');
  if (typeof body.seq !== 'number' || Math.floor(body.seq) !== body.seq || body.seq < 0)
    refuse('the catalog has no number');
  const seen = Object.create(null);
  const themes = [];
  body.themes.slice(0, LIMITS.themes).forEach((raw) => {
    const it = cleanItem(raw, host || HOST);
    if (!it || seen[it.id]) return;
    seen[it.id] = true;
    themes.push(it);
  });
  return { seq: body.seq, themes };
}

/**
 * opts: { dataDir, library, log, appVersion, shaders, fonts, keys, get(url, opts, cb), lease(),
 *         moving(), bundled: [ids of the themes the app carries], onChange(),
 *         onInstalled(meta), base, host }
 */
class Store {
  constructor(opts) {
    this.opts = opts;
    this.base = opts.base || BASE;
    this.host = opts.host || HOST;
    this.items = [];
    this.loaded = false;
    this.loadedAt = 0; // when the catalog on show came
    this.busy = ''; // '' | 'catalog' | 'inbox' | the id of the theme being fetched
    this.chain = false; // the inbox's themes are being taken one after another
    this.failed = Object.create(null); // sha256 -> how often that file was refused or cut off
    this.listed = null; // { at, list }: the library's themes, kept a moment (the page asks often)
    this.progress = null; // { bytes, total } of that theme
    this.note = '';
    this.error = '';
    this.request = null;
    this.state = this._readState();
  }

  _readState() {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(this.opts.dataDir, STATE_FILE), 'utf8'));
      return {
        code: typeof s.code === 'string' && CODE_RE.test(s.code) ? s.code : '',
        seq: typeof s.seq === 'number' && s.seq >= 0 ? Math.floor(s.seq) : 0,
      };
    } catch (_e) {
      return { code: '', seq: 0 };
    }
  }

  _saveState() {
    const file = path.join(this.opts.dataDir, STATE_FILE);
    try {
      fs.writeFileSync(file + '.tmp', JSON.stringify(this.state));
      fs.renameSync(file + '.tmp', file);
    } catch (e) {
      if (this.opts.log) this.opts.log.warn('store: state not saved: ' + ((e && e.message) || e));
    }
  }

  /** This car's code for the phone page; made once, from random bytes alone. */
  code() {
    if (!this.state.code) {
      this.state.code = newCode();
      this._saveState();
    }
    return this.state.code;
  }

  phoneUrl() {
    return PHONE + this.code();
  }

  /** 'installed' | 'update' (another version is installed) | 'bundled' | '' for a theme. */
  statusOf(item) {
    if ((this.opts.bundled || []).indexOf(item.id) >= 0) return 'bundled';
    const mine = this._list().find((t) => t.id === item.id);
    if (!mine) return '';
    return mine.hash === item.sha256 ? 'installed' : 'update';
  }

  _list() {
    const now = Date.now();
    if (!this.listed || now - this.listed.at > 2000 || now < this.listed.at)
      this.listed = { at: now, list: this.opts.library.list() };
    return this.listed.list;
  }

  _changed() {
    try {
      if (this.opts.onChange) this.opts.onChange();
    } catch (e) {
      if (this.opts.log) this.opts.log.warn('store: ' + ((e && e.stack) || e));
    }
  }

  /** '' when the store may use the network now, else why not. */
  blocked() {
    if (this.opts.moving && this.opts.moving()) return PARKED_ONLY;
    if (!this._lease()) return NO_INTERNET;
    return '';
  }

  _lease() {
    return this.opts.lease ? this.opts.lease() : null;
  }

  _get(url, maxBytes, onProgress, cb) {
    const lease = this._lease();
    this.request = this.opts.get(
      url,
      {
        hosts: [this.host],
        maxBytes,
        dns: lease ? lease.dns : [],
        userAgent: 'idv7lol/' + this.opts.appVersion,
        onProgress,
      },
      (err, buf) => {
        this.request = null;
        cb(err, buf);
      },
    );
  }

  /** The car moved off, or the store was switched off: what is under way ends. */
  cancel() {
    if (this.request) this.request.abort();
  }

  /** Called every second: a car that starts moving ends a download. */
  tick() {
    if (this.busy && this.opts.moving && this.opts.moving()) {
      this.cancel();
      this.error = PARKED_ONLY;
    }
  }

  _end(error, note, cb, result) {
    // in the inbox's chain the store stays busy between two themes: nothing else may start there
    this.busy = this.chain ? 'inbox' : '';
    this.progress = null;
    const fresh = error && error !== this.error;
    this.error = error || '';
    if (note !== null) this.note = note || '';
    if (fresh && this.opts.log) this.opts.log.warn('store: ' + error);
    this._changed();
    if (cb) cb(error ? new Error(error) : null, result);
  }

  /** Fetch the catalog. cb(err). */
  refresh(cb) {
    if (this.busy) return cb && cb(new Error('busy'));
    const why = this.blocked();
    if (why) return this._end(why, null, cb);
    this.busy = 'catalog';
    this.error = '';
    this._changed();
    return this._get(this.base + 'catalog.json', LIMITS.catalogBytes, null, (err, buf) => {
      if (err) return this._end('The catalog did not load: ' + err.message, null, cb);
      let cat;
      try {
        cat = readCatalog(buf, this.opts.keys, this.host);
      } catch (e) {
        return this._end('The catalog was refused: ' + e.message, null, cb);
      }
      if (cat.seq < this.state.seq)
        return this._end('The catalog was refused: older than the last one seen', null, cb);
      if (cat.seq !== this.state.seq) {
        this.state.seq = cat.seq;
        this._saveState();
      }
      this.items = cat.themes;
      this.loaded = true;
      this.loadedAt = Date.now();
      return this._end('', null, cb);
    });
  }

  /** Download, check and save one theme of the catalog. cb(err, meta). */
  install(item, cb) {
    if (this.busy) return cb && cb(new Error('busy'));
    return this._install(item, cb);
  }

  _install(item, cb) {
    const o = this.opts;
    const why = this.blocked();
    if (why) return this._end(why, null, cb);
    this.busy = item.id;
    this.progress = { bytes: 0, total: item.size };
    this.error = '';
    this._changed();
    const fail = (reason) => {
      this.failed[item.sha256] = (this.failed[item.sha256] || 0) + 1;
      return this._end(item.name + ' was not installed: ' + reason, null, cb);
    };
    const onProgress = (bytes) => {
      const before = this.progress ? Math.floor((this.progress.bytes * 20) / item.size) : -1;
      this.progress = { bytes, total: item.size };
      if (Math.floor((bytes * 20) / item.size) !== before) this._changed();
    };
    return this._get(item.url, item.size, onProgress, (err, buf) => {
      if (err) return fail(err.message);
      if (buf.length !== item.size) return fail('its size is not the one in the catalog');
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash !== item.sha256) return fail('it is not the file the catalog names');
      return usb.gunzipCapped(buf, usb.LIMITS.jsonBytes, (gzErr, json) => {
        if (gzErr) return fail(gzErr.message);
        // the car may have moved off while the file was coming
        if (o.moving && o.moving()) return fail(PARKED_ONLY);
        let meta;
        try {
          const checked = usb.readPackage(
            buf,
            { appVersion: o.appVersion, shaders: o.shaders, fonts: o.fonts },
            json,
          );
          if (checked.meta.id !== item.id) refuse('it is another theme');
          meta = o.library.install(checked, hash, 'store');
        } catch (e) {
          return fail(e.message);
        }
        this.listed = null;
        if (o.log) o.log.info('store: installed ' + meta.id + ' ' + meta.version);
        try {
          if (o.onInstalled) o.onInstalled(meta);
        } catch (e) {
          if (o.log) o.log.warn('store: ' + ((e && e.stack) || e));
        }
        return this._end('', 'Installed ' + meta.name + '. Pick it in the Themes tab.', cb, meta);
      });
    });
  }

  /**
   * Take what the phone page sent to this car: the inbox's themes that are in the catalog and
   * not here yet, one after another. A file that failed twice is left alone until the app
   * starts again (or the catalog names another), and does not hold up the ones after it.
   * cb(err, [meta]).
   */
  checkInbox(cb) {
    if (this.busy) return cb && cb(new Error('busy'));
    if (!this.loaded) return cb && cb(new Error('no catalog'));
    const why = this.blocked();
    if (why) return this._end(why, null, cb);
    this.busy = 'inbox';
    const finish = (note, done) => {
      this.chain = false;
      return this._end(this.error, note, cb, done);
    };
    return this._get(this.base + 'inbox/' + this.code(), LIMITS.inboxBytes, null, (err, buf) => {
      // nothing sent yet is no error, and a failed look says nothing: the catalog is on show
      if (err) return finish(null, []);
      let ids = [];
      try {
        const box = JSON.parse(buf.toString('utf8'));
        if (box && box.v === 1 && Array.isArray(box.themes)) ids = box.themes;
      } catch (_e) {
        ids = [];
      }
      this.listed = null;
      const wanted = [];
      ids.slice(0, LIMITS.inbox).forEach((id) => {
        const it = typeof id === 'string' && this.items.find((x) => x.id === id);
        if (!it || wanted.indexOf(it) >= 0 || (this.failed[it.sha256] || 0) >= 2) return;
        if (['', 'update'].indexOf(this.statusOf(it)) >= 0) wanted.push(it);
      });
      const done = [];
      this.chain = true;
      const next = () => {
        const it = wanted.shift();
        if (!it) {
          const names = done.map((m) => m.name).join(', ');
          return finish(
            done.length ? 'From your phone: ' + names + '. Pick it in the Themes tab.' : null,
            done,
          );
        }
        return this._install(it, (e, meta) => {
          if (!e) done.push(meta);
          return next();
        });
      };
      return next();
    });
  }
}

module.exports = {
  HOST,
  BASE,
  PHONE,
  LIMITS,
  NO_INTERNET,
  PARKED_ONLY,
  newCode,
  cleanItem,
  readCatalog,
  Store,
};
