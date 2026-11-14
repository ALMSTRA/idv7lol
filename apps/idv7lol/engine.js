'use strict';
/**
 * engine.js - draws a compiled idv7lol theme on the instrument cluster.
 *
 * A compiled theme (theme_<id>.js, produced by the idv7lol theme compiler)
 * is a list of pieces; each piece is one cluster-render effect layer with a
 * GLSL ES 1.00 fragment shader, static uniforms, palette colours and
 * "dynamics" that tell this engine how a vehicle signal drives a uniform or
 * a text. The engine:
 *
 *   - makes the layers (and the SDF font atlas asset) when the layout is
 *     wanted: the user turned it on AND car data is live;
 *   - eases numeric uniforms at 60 Hz towards their targets (tau 30 ms) and
 *     sends only what moved; texts, colours and visibility at most 30 Hz and
 *     only on change;
 *   - drops every layer when the layout is turned off, when data goes
 *     stale, or when the app stops. The factory cluster is untouched
 *     underneath and shows again.
 *
 * Nothing here writes to the vehicle. The client (cluster_render_client.js)
 * replays layers by itself after a reconnect.
 */
const { layoutLine, formatNumber, formatDash, formatClock, enumText } = require('./text');
const { convert } = require('./units');
const conditions = require('./conditions');

const RATE_MS = 1000 / 60;
const TEXT_DIVIDER = 2; // texts/colours every 2nd tick (30 Hz)
const TAU_MS = 30;
const EPS = 0.0015;
const ANGLE_EPS = 0.05;
const LIVE_GRACE_MS = 1500;
const SWEEP_MS = 700;
// cluster-render's layer limit for one client (docs/architecture/RENDERER.md).
const LAYERS_PER_CLIENT = 64;

const ICON_P_CODE = 'P';
const SECONDARY_START = '\u0001';
const SECONDARY_END = '\u0002';

/* ---------- colours ---------- */

function hexToRgba(hex) {
  const h = String(hex).replace('#', '');
  const n = (s) => parseInt(s.length === 1 ? s + s : s, 16) / 255;
  if (h.length === 3 || h.length === 4)
    return [n(h[0]), n(h[1]), n(h[2]), h.length === 4 ? n(h[3]) : 1];
  if (h.length === 6 || h.length === 8)
    return [
      n(h.slice(0, 2)),
      n(h.slice(2, 4)),
      n(h.slice(4, 6)),
      h.length === 8 ? n(h.slice(6, 8)) : 1,
    ];
  return [1, 0, 1, 1];
}

function parseColor(c) {
  if (!c || c === 'transparent') return [0, 0, 0, 0];
  if (c[0] === '#') return hexToRgba(c);
  const m = /^rgba?\(([^)]*)\)$/.exec(c);
  if (m) {
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [(p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255, p.length > 3 ? p[3] : 1];
  }
  return [1, 0, 1, 1];
}

function resolveColor(c, palette) {
  if (typeof c !== 'string') return [0, 0, 0, 0];
  if (c[0] === '$') return parseColor((palette && palette.colors[c.slice(1)]) || '#ff00ff');
  return parseColor(c);
}

const SPEED_STEP = 0.25; // as packages/theme-engine/src/image-edits.ts
const SPRITE_RESTART_MS = 500; // a speed-tied animation restarts at most this often

/**
 * The playback speed of an animated picture: `base`, or with speedFrom and a live value, `base`
 * at `from` rising to `fast` at `to`, in SPEED_STEP steps. Same as playbackSpeed in
 * packages/theme-engine/src/image-edits.ts.
 */
function playbackSpeed(base, sf, value) {
  if (!sf || value === null || value === undefined || !isFinite(value)) return base;
  const fast = sf.fast !== undefined ? sf.fast : sf.fastSpeed;
  const f =
    sf.to === sf.from
      ? value >= sf.to
        ? 1
        : 0
      : Math.max(0, Math.min(1, (value - sf.from) / (sf.to - sf.from)));
  if (f === 0) return base;
  const raw = base + (fast - base) * f;
  return Math.max(0.1, Math.min(4, Math.round(raw / SPEED_STEP) * SPEED_STEP));
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (arr) => arr.map(r3);

function mixColor(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

/* ---------- easing for animation clips (subset) ---------- */

function ease(name, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  switch (name) {
    case 'linear':
      return t;
    case 'ease-in':
    case 'ease-in-cubic':
      return t * t;
    case 'ease-out':
    case 'ease-out-cubic':
      return 1 - (1 - t) * (1 - t);
    case 'step':
      return t >= 1 ? 1 : 0;
    default:
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}

/* ---------- the engine ---------- */

class ClusterEngine {
  /**
   * opts: { client, log, target, theme, fonts: { family: { metrics, pixels } }, paletteId(), enabled(),
   *         live(), signals (store with get(id) -> { value, at, valid }), sweep(), utcOffsetMinutes() }
   */
  constructor(opts) {
    this.cr = opts.client;
    this.log = opts.log || console;
    this.target = opts.target || 'panel';
    this.theme = opts.theme;
    this.fonts = opts.fonts || {};
    this.paletteId = opts.paletteId || (() => this.theme.paletteSelection.default);
    this.enabled = opts.enabled || (() => true);
    this.live = opts.live || (() => true);
    this.signals = opts.signals;
    this.sweep = opts.sweep || (() => true);
    this.utcOffsetMinutes = opts.utcOffsetMinutes || (() => 0);
    this.now = opts.now || (() => Date.now());
    this.shown = false;
    this.pieces = []; // runtime state per piece
    this.images = []; // runtime state per image layer
    this.loadImage = opts.loadImage || (() => null);
    this.assets = {}; // family -> asset ref
    this.lastLive = 0;
    this.tickCount = 0;
    this.timer = null;
    this.refused = 0;
    this.rendererStatus = '';
    this.targetState = '';
    this.layerStates = {};
    this.lastPalette = null;
    this.messages = 0;
    this.startedAt = this.now();
    this.cr.on('refused', (op, ref, reason) => {
      this.refused++;
      this.log.warn('cluster-render refused ' + op + ' ' + ref + ': ' + reason);
    });
    this.cr.on('target', (name, state, holder, reason) => {
      if (name === this.target)
        this.targetState =
          state + (holder ? ' (' + holder + ')' : '') + (reason ? ': ' + reason : '');
    });
    this.cr.on('layer', (ref, state, reason) => {
      this.layerStates[ref] = state + (reason ? ' ' + reason : '');
      if (state === 'error') this.log.warn('layer ' + ref + ' error: ' + reason);
    });
    this.cr.on('status', (text) => {
      this.rendererStatus = text;
    });
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (e) {
        this.log.warn('tick: ' + ((e && e.stack) || e));
      }
    }, RATE_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setShown(false);
  }

  /** Swap the theme (and fonts); rebuilds when shown. */
  setTheme(theme, fonts) {
    this._swap(theme, fonts);
  }

  rebuild() {
    this.failed = null;
    this._swap(this.theme, null);
  }

  /**
   * Replace the layout while it is shown. An empty panel hands the cluster back to the factory
   * gauges for a moment, which shows as a flash between two layouts (seen by another cluster
   * app, eroobeeroo/idrive7-cluster-info #9). So the old layout's bottom layer, its background as
   * a rule, stays until the new one is up, when the new layout leaves room for it.
   */
  _swap(theme, fonts) {
    const was = this.shown;
    const room = theme.pieces.length + (theme.images || []).length < LAYERS_PER_CLIENT;
    const hold = was && room ? this._bottomLayer() : null;
    if (hold) this.pieces = this.pieces.filter((p) => p !== hold);
    this.setShown(false);
    this.theme = theme;
    if (fonts) this.fonts = fonts;
    if (was) this.setShown(true);
    if (hold) this.cr.drop(hold.ref);
  }

  /** The lowest effect layer that needs no texture, or null. */
  _bottomLayer() {
    let best = null;
    this.pieces.forEach((p) => {
      if (!p.ref || p.piece.usesFont) return;
      if (!best || p.piece.z < best.piece.z) best = p;
    });
    return best;
  }

  palette() {
    const id = this.paletteId();
    return this.theme.palettes[id] || this.theme.palettes[this.theme.paletteSelection.default];
  }

  /** Resend every colour uniform (palette changed). */
  recolour() {
    const pal = this.palette();
    this.pieces.forEach((p) => this._sendColors(p, pal));
  }

  status() {
    return {
      shown: this.shown,
      layers: this.pieces.length + this.images.length,
      refused: this.refused,
      connected: !!this.cr.ready,
      backend: this.cr.backend || '',
      targets: this.cr.targets || '',
      target: this.targetState || 'unknown',
      palette: this.paletteId(),
      theme: this.theme.id,
      failed: this.failed === this.theme,
      messages: this.messages,
    };
  }

  /* ----- build / teardown ----- */

  setShown(want) {
    if (want === this.shown) return;
    if (!want) {
      this._teardown();
      this.shown = false;
      return;
    }
    // A theme that failed once stays off until it changes: retrying every tick
    // would resend its layers and pictures 60 times a second.
    if (this.failed === this.theme) return;
    this._made = [];
    try {
      this._build();
      this.shown = true;
    } catch (e) {
      this.log.warn('layout failed, the factory cluster stays: ' + ((e && e.stack) || e));
      this._made.reverse().forEach((ref) => this.cr.drop(ref));
      this.pieces = [];
      this.images = [];
      this.assets = {};
      this.failed = this.theme;
    }
    this._made = null;
  }

  /** Create a renderer object and remember it, so a build that fails halfway can drop it. */
  _make(kind, opts) {
    const ref = this.cr[kind](opts);
    if (ref && this._made) this._made.push(ref);
    return ref;
  }

  _build() {
    const theme = this.theme;
    const pal = this.palette();
    this.lastPalette = this.paletteId();
    const target = this.target;
    // font atlases
    this.assets = {};
    theme.fonts.forEach((fam) => {
      const f = this.fonts[fam];
      if (!f) {
        this.log.warn('no atlas for font family ' + fam);
        return;
      }
      const m = f.metrics;
      const ref = this._make('asset', {
        target,
        format: 'r8',
        w: m.cols * m.cellW,
        h: m.rows * m.cellH,
        sampling: 'bilinear',
      });
      if (!ref) {
        this.log.warn('font asset refused');
        return;
      }
      this.cr.pixels(ref, null, f.pixels);
      this.assets[fam] = ref;
      this.messages++;
    });
    const defaultFamily = theme.fonts[0];
    this.pieces = theme.pieces.map((piece) => {
      const opts = {
        target,
        klass: 'content',
        z: piece.z,
        x: piece.x,
        y: piece.y,
        w: piece.w,
        h: piece.h,
        visible: 1,
        fs: theme.shaders[piece.shader],
      };
      if (piece.rotation) {
        opts.rotate = piece.rotation;
        const pv = piece.statics._pivot;
        if (pv) {
          opts.px = pv[0];
          opts.py = pv[1];
        }
      }
      if (piece.usesTime) opts.time = true;
      const ref = this._make('effect', opts);
      const st = {
        piece,
        ref,
        eased: {},
        lastText: null,
        lastColor: {},
        visible: true,
        flashAnim: 0,
        anims: [],
        colorAnimBase: {},
      };
      if (!ref) {
        this.log.warn('layer refused for ' + piece.key);
        return st;
      }
      this.messages++;
      this.cr.uniform(ref, 'u_size', [piece.w, piece.h]);
      Object.keys(piece.statics).forEach((name) => {
        if (name[0] === '_') return;
        const v = piece.statics[name];
        if (v.length <= 4) this.cr.uniform(ref, name, vec(v));
        else this.cr.uniform(ref, name, vec(v), { type: 'vec4' });
      });
      this._sendColors(st, pal);
      if (piece.usesFont && defaultFamily && this.assets[defaultFamily]) {
        const m = this.fonts[defaultFamily].metrics;
        this.cr.bind(ref, 'u_font', this.assets[defaultFamily]);
        this.cr.uniform(ref, 'u_font_cells', [m.cols, m.cellW / m.cellH, m.rows]);
        const zero = m.adv[m.chars.indexOf('0')] || 0.5;
        this.cr.uniform(ref, 'u_digit_adv', [r3(zero)]);
        if (piece.shader === 'telltale')
          this.cr.uniform(ref, 'u_code_p', [m.chars.indexOf(ICON_P_CODE)]);
      }
      this._startAnimations(st);
      return st;
    });
    // image layers: baked by the compiler at exactly their layer size
    this.images = (theme.images || []).map((img) => {
      const st = { img, ref: 0, visible: true };
      let pixels = null;
      try {
        pixels = this.loadImage(img);
      } catch (e) {
        this.log.warn('image ' + img.key + ': ' + e);
      }
      if (!pixels || pixels.length !== img.iw * img.ih * 4) {
        this.log.warn('image ' + img.key + ': no usable pixels');
        return st;
      }
      if (img.sprite) {
        // The renderer plays the frames by itself: nothing is sent per frame.
        st.asset = this._make('asset', {
          target,
          format: 'rgba8',
          w: img.iw,
          h: img.ih,
          sampling: 'bilinear',
        });
        const sprite = {
          target,
          klass: 'content',
          z: img.z,
          x: img.x,
          y: img.y,
          w: img.w,
          h: img.h,
          visible: 1,
          fs: theme.shaders.sprite,
        };
        if (img.rotation) {
          sprite.rotate = img.rotation;
          sprite.px = img.pivotX;
          sprite.py = img.pivotY;
        }
        st.ref = st.asset ? this._make('effect', sprite) : 0;
        if (!st.ref) {
          this.log.warn('animation refused: ' + img.key);
          return st;
        }
        this.cr.pixels(st.asset, null, pixels);
        this.cr.bind(st.ref, 'u_atlas', st.asset);
        const sp = img.sprite;
        this.cr.uniform(st.ref, 'u_size', [img.w, img.h]);
        this.cr.uniform(st.ref, 'u_cells', [sp.columns, sp.rows]);
        // Half a texel of a cell; six decimals, so it doesn't round to 0 on wide cells.
        const r6 = (v) => Math.round(v * 1e6) / 1e6;
        this.cr.uniform(st.ref, 'u_texel', [r6(0.5 / sp.cellW), r6(0.5 / sp.cellH)]);
        this.cr.uniform(st.ref, 'u_opacity', [img.opacity]);
        this.cr.uniform(st.ref, 'u_frame', [0]);
        st.speed = img.speedFrom ? img.speedFrom.slow : 1;
        st.played = 0; // time into the loop, in the compiled durations, when this run started
        st.startedAt = this.now();
        st.anim = this._playSprite(st, 1, 0);
        return st;
      }
      const opts = {
        target,
        klass: 'content',
        z: img.z,
        x: img.x,
        y: img.y,
        w: img.w,
        h: img.h,
        iw: img.iw,
        ih: img.ih,
        opacity: img.opacity,
        sampling: 'bilinear',
        visible: 1,
      };
      if (img.rotation) {
        opts.rotate = img.rotation;
        opts.px = img.pivotX;
        opts.py = img.pivotY;
      }
      st.ref = this._make('image', opts);
      if (st.ref) {
        this.cr.pixels(st.ref, null, pixels);
        this.messages++;
      } else {
        this.log.warn('image layer refused: ' + img.key);
      }
      return st;
    });
    this.startedAt = this.now();
    this._update(true);
    if (this.sweep()) this._sweep();
    this.log.info(
      'layout up: ' +
        this.pieces.filter((p) => p.ref).length +
        ' layers, palette ' +
        this.lastPalette,
    );
  }

  _teardown() {
    this.pieces.forEach((p) => {
      if (p.ref) this.cr.drop(p.ref);
    });
    Object.keys(this.assets).forEach((fam) => this.cr.drop(this.assets[fam]));
    this.images.forEach((st) => {
      if (st.ref) this.cr.drop(st.ref);
      if (st.asset) this.cr.drop(st.asset);
    });
    this.images = [];
    this.pieces = [];
    this.assets = {};
    this.log.info('layout down: the factory cluster shows');
  }

  _sendColors(st, pal) {
    const piece = st.piece;
    if (!st.ref) return;
    Object.keys(piece.colors).forEach((name) => {
      if (
        st.lastColor[name] !== undefined &&
        st.lastColor[name] !== piece.colors[name] &&
        name === 'u_color'
      )
        return; // dynamic colour owns it
      this.cr.uniform(st.ref, name, vec(resolveColor(piece.colors[name], pal)));
    });
    const arrays = piece.colorArrays || {};
    Object.keys(arrays).forEach((name) => {
      const flat = [];
      arrays[name].forEach((c) => resolveColor(c, pal).forEach((v) => flat.push(r3(v))));
      this.cr.uniform(st.ref, name, flat, { type: 'vec4' });
    });
  }

  /** Start-up sweep: every value gauge runs to full and back on the renderer's clock. */
  _sweep() {
    this.pieces.forEach((st) => {
      if (!st.ref) return;
      st.piece.dynamics.forEach((d) => {
        if (d.kind === 'norm') {
          this.cr.animate(st.ref, {
            property: 'uniform',
            name: d.uniform,
            keys: '0:0 ' + SWEEP_MS + ':1 ' + SWEEP_MS * 2 + ':0',
            loop: false,
          });
          st.sweeping = this.now() + SWEEP_MS * 2 + 150;
        } else if (d.kind === 'angle') {
          this.cr.animate(st.ref, {
            property: 'uniform',
            name: d.uniform,
            keys:
              '0:' +
              r3(d.from) +
              ' ' +
              SWEEP_MS +
              ':' +
              r3(d.from + d.sweep) +
              ' ' +
              SWEEP_MS * 2 +
              ':' +
              r3(d.from),
            loop: false,
          });
          st.sweeping = this.now() + SWEEP_MS * 2 + 150;
        }
      });
    });
  }

  /** Renderer-side clips for rotation and scale tracks; colour tracks are handled in _update. */
  _startAnimations(st) {
    const piece = st.piece;
    (piece.animations || []).forEach((a) => {
      const trig = a.trigger && a.trigger.on;
      a.tracks.forEach((track) => {
        if (track.property === 'rotation' || track.property === 'scale') {
          if (trig !== 'load' && trig !== 'always') return; // conditional transform clips are not supported yet
          const keys = track.keyframes
            .map(
              (k) =>
                Math.round(k.t * a.duration) +
                ':' +
                (track.property === 'scale' ? r3(k.value) + ',' + r3(k.value) + ',1' : r3(k.value)),
            )
            .join(' ');
          this.cr.animate(st.ref, {
            property: track.property === 'rotation' ? 'rotate' : 'scale',
            keys,
            loop: a.loop === true || (typeof a.loop === 'number' && a.loop > 1),
          });
        } else if (/^props\./.test(track.property)) {
          st.anims.push({
            clip: a,
            track,
            startedAt: trig === 'load' || trig === 'always' ? this.now() + (a.delay || 0) : null,
            holds: false,
          });
        } else {
          this.log.info(
            'animation track "' +
              track.property +
              '" of ' +
              piece.key +
              ' is not played on the car',
          );
        }
      });
    });
  }

  /* ----- per frame ----- */

  tick() {
    this.tickCount++;
    const now = this.now();
    const live = this.live();
    if (live) this.lastLive = now;
    const want = this.enabled() && (live || (this.lastLive && now - this.lastLive < LIVE_GRACE_MS));
    if (want !== this.shown) this.setShown(want);
    if (!this.shown) return;
    const pid = this.paletteId();
    if (pid !== this.lastPalette) {
      this.lastPalette = pid;
      this.recolour();
    }
    this._update(false);
  }

  /**
   * Start an animated picture's frames on the renderer, `factor` times faster than compiled,
   * from `frame` on. The renderer plays them by itself; returns the animation's number.
   */
  _playSprite(st, factor, frame) {
    const sp = st.img.sprite;
    const order = [];
    for (let i = 0; i < sp.frames; i++) order.push((frame + i) % sp.frames);
    let t = 0;
    const keys = order.map((i) => {
      const key = t + ':' + i;
      t += Math.max(20, Math.round(sp.durations[i] / factor));
      return key;
    });
    keys.push(t + ':' + order[order.length - 1]);
    this.messages++;
    return this.cr.animate(st.ref, {
      property: 'uniform',
      name: 'u_frame',
      keys: keys.join(' '),
      loop: true,
      interp: 'step',
    });
  }

  /** Restart a speed-tied animation when its speed step changes, from the frame it is on. */
  _spriteSpeed(st, now) {
    const sf = st.img.speedFrom;
    if (!sf || !st.ref || !st.anim) return;
    if (now - st.startedAt < SPRITE_RESTART_MS) return;
    const s = this.signals.get(sf.signal);
    const live = s && s.valid && now - s.at <= conditions.STALE_MS ? Number(s.value) : null;
    const speed = playbackSpeed(sf.slow, sf, live);
    if (speed === st.speed) return;
    const sp = st.img.sprite;
    const factor = st.speed / sf.slow;
    let total = 0;
    for (let i = 0; i < sp.frames; i++) total += sp.durations[i];
    let at = (st.played + (now - st.startedAt) * factor) % total;
    let frame = 0;
    while (frame < sp.frames - 1 && at >= sp.durations[frame]) at -= sp.durations[frame++];
    this.cr.stop(st.ref, st.anim);
    st.played = 0;
    for (let i = 0; i < frame; i++) st.played += sp.durations[i];
    st.speed = speed;
    st.startedAt = now;
    st.anim = this._playSprite(st, speed / sf.slow, frame);
  }

  _update(force) {
    const now = this.now();
    const pal = this.palette();
    const textsNow = force || this.tickCount % TEXT_DIVIDER === 0;
    if (textsNow) {
      this.images.forEach((st) => this._spriteSpeed(st, now));
      this.images.forEach((st) => {
        if (!st.ref || !st.img.visibleWhen) return;
        const vis = conditions.evaluate(st.img.visibleWhen, this.signals, now);
        if (vis !== st.visible || force) {
          st.visible = vis;
          this.cr.set(st.ref, { visible: vis ? 1 : 0 });
        }
      });
    }
    this.pieces.forEach((st) => {
      if (!st.ref) return;
      const piece = st.piece;
      // visibility
      if (textsNow && piece.visibleWhen) {
        const vis = conditions.evaluate(piece.visibleWhen, this.signals, now);
        if (vis !== st.visible || force) {
          st.visible = vis;
          this.cr.set(st.ref, { visible: vis ? 1 : 0 });
        }
        if (!vis) return;
      }
      const sweeping = st.sweeping && now < st.sweeping;
      piece.dynamics.forEach((d) => {
        switch (d.kind) {
          case 'norm':
            if (!sweeping) this._easeTo(st, d.uniform, this._norm(d.binding, now), force, EPS);
            break;
          case 'angle':
            if (!sweeping)
              this._easeTo(
                st,
                d.uniform,
                d.from + d.sweep * this._norm(d.binding, now),
                force,
                ANGLE_EPS,
              );
            break;
          case 'text':
            if (textsNow) this._text(st, d, pal, now, force);
            break;
          case 'shiftlights':
            if (textsNow) this._shiftlights(st, d, now, force);
            break;
          case 'telltale':
            if (textsNow) this._telltale(st, d, pal, now, force);
            break;
          case 'clock':
            if (textsNow) this._clock(st, d, now, force);
            break;
          case 'gear':
            if (textsNow) this._gear(st, d, pal, now, force);
            break;
          case 'mode-text':
            if (textsNow) this._modeText(st, d, now, force);
            break;
          case 'zone-color':
            if (textsNow) this._zoneColor(st, d, pal, now, force);
            break;
          default:
            break;
        }
      });
      if (textsNow && st.anims.length) this._colorAnims(st, pal, now);
    });
  }

  /* ----- values ----- */

  _sample(binding) {
    return this.signals.get(binding.signal);
  }

  _staleMs(binding) {
    return binding.staleAfterMs || conditions.STALE_MS;
  }

  /** Display value of a binding: converted, scaled, clamped. null when unavailable. */
  _value(binding, now) {
    const s = this._sample(binding);
    if (!s || !s.valid) return null;
    if (now - s.at > this._staleMs(binding)) return null;
    let v =
      typeof s.value === 'number'
        ? s.value
        : typeof s.value === 'boolean'
          ? s.value
            ? 1
            : 0
          : Number(s.value);
    if (!isFinite(v)) return null;
    if (binding.unit && binding.catalogUnit && binding.unit !== binding.catalogUnit)
      v = convert(v, binding.catalogUnit, binding.unit);
    v = v * (binding.scale === undefined ? 1 : binding.scale) + (binding.offset || 0);
    if (binding.clamp !== false) v = Math.max(binding.rangeMin, Math.min(binding.rangeMax, v));
    return v;
  }

  _norm(binding, now) {
    let v = this._value(binding, now);
    if (v === null) {
      if (binding.fallback === 'last') return undefined; // keep the eased value where it is
      v = binding.rangeMin;
    }
    const span = binding.rangeMax - binding.rangeMin;
    return span ? Math.max(0, Math.min(1, (v - binding.rangeMin) / span)) : 0;
  }

  _easeTo(st, uniform, target, force, eps) {
    if (target === undefined) return;
    let e = st.eased[uniform];
    if (!e) {
      e = st.eased[uniform] = { cur: target, sent: NaN, at: this.now() };
    }
    const now = this.now();
    const dt = Math.max(RATE_MS, now - e.at);
    e.at = now;
    const k = 1 - Math.exp(-dt / TAU_MS);
    e.cur += (target - e.cur) * k;
    if (Math.abs(target - e.cur) < eps / 4) e.cur = target;
    if (force || isNaN(e.sent) || Math.abs(e.cur - e.sent) >= eps) {
      e.sent = e.cur;
      this.cr.uniform(st.ref, uniform, [Math.round(e.cur * 10000) / 10000]);
      this.messages++;
    }
  }

  /* ----- texts ----- */

  _metrics() {
    const fam = this.theme.fonts[0];
    return fam && this.fonts[fam] ? this.fonts[fam].metrics : null;
  }

  _sendLine(st, parts, align, tracking, scale2, force) {
    const m = this._metrics();
    if (!m) return;
    const line = layoutLine(parts, m, st.piece.w / st.piece.h, align, tracking, scale2 || 1, false);
    const key = JSON.stringify([line.codes, line.centres]);
    if (!force && key === st.lastText) return;
    st.lastText = key;
    this.cr.uniform(st.ref, 'u_text', line.codes, { type: 'vec4' });
    this.cr.uniform(st.ref, 'u_x', line.centres, { type: 'vec4' });
    this.messages += 2;
  }

  _setColor(st, name, color, pal, force) {
    const rgba = Array.isArray(color) ? color : resolveColor(color, pal);
    const key = rgba.map(r3).join(',');
    if (!force && st.lastColor[name] === key) return;
    st.lastColor[name] = key;
    this.cr.uniform(st.ref, name, vec(rgba));
    this.messages++;
  }

  _displayText(binding, format, now) {
    const s = this._sample(binding);
    const valid = !!s && s.valid && now - s.at <= this._staleMs(binding);
    if (valid) {
      if (typeof s.value === 'string' && !isFinite(Number(s.value)))
        return { show: true, text: enumText(s.value), value: undefined };
      const v = this._value(binding, now);
      return { show: true, text: formatNumber(v, format), value: v };
    }
    switch (binding.fallback) {
      case 'hide':
        return { show: false, text: '', value: undefined };
      case 'zero':
        return { show: true, text: formatNumber(0, format), value: 0 };
      case 'last':
        return s
          ? {
              show: true,
              text:
                typeof s.value === 'string'
                  ? isFinite(Number(s.value))
                    ? s.value
                    : enumText(s.value)
                  : formatNumber(this._valueOf(binding, s), format),
              value: undefined,
            }
          : { show: true, text: formatDash(format), value: undefined };
      default:
        return { show: true, text: formatDash(format), value: undefined };
    }
  }

  _valueOf(binding, s) {
    let v = typeof s.value === 'number' ? s.value : Number(s.value);
    if (!isFinite(v)) return 0;
    if (binding.unit && binding.catalogUnit && binding.unit !== binding.catalogUnit)
      v = convert(v, binding.catalogUnit, binding.unit);
    return v * (binding.scale === undefined ? 1 : binding.scale) + (binding.offset || 0);
  }

  _text(st, d, pal, now, force) {
    let template = d.template || '';
    let show = true;
    let value;
    let valueText = '';
    let unit = '';
    if (d.binding) {
      const r = this._displayText(d.binding, d.format, now);
      show = r.show;
      value = r.value;
      valueText = r.text;
      unit = d.binding.unitSymbol || '';
    }
    if (!show) {
      this._setVisible(st, false);
      return;
    }
    this._setVisible(st, st.visible !== false);
    if (d.binding) {
      if (template.indexOf('{value}') >= 0 || template.indexOf('{unit}') >= 0)
        template = template.replace(/\{value\}/g, valueText).replace(/\{unit\}/g, unit);
      else template = template ? template + valueText : valueText;
    }
    if (d.uppercase) template = template.toUpperCase();
    // \u0001...\u0002 marks a secondary (label-coloured) run, used by status panel rows
    const parts = [];
    const re = new RegExp(SECONDARY_START + '([^' + SECONDARY_END + ']*)' + SECONDARY_END, 'g');
    let last = 0,
      m;
    while ((m = re.exec(template))) {
      if (m.index > last) parts.push({ text: template.slice(last, m.index) });
      parts.push({ text: m[1], secondary: true });
      last = m.index + m[0].length;
    }
    if (last < template.length) parts.push({ text: template.slice(last) });
    if (d.secondary && d.secondary.text) parts.push({ text: d.secondary.text, secondary: true });
    this._sendLine(
      st,
      parts,
      d.align,
      d.tracking,
      d.secondary ? d.secondary.scale : undefined,
      force,
    );
    if (d.zones && d.zones.length) {
      let color = st.piece.colors.u_color;
      if (value !== undefined)
        d.zones.forEach((z) => {
          if (value >= z.from && value < z.to) color = z.color;
        });
      this._setColor(st, 'u_color', color, pal, force);
    }
  }

  _setVisible(st, vis) {
    if (st.piece.visibleWhen) return; // owned by the condition
    if (st.shownByText === vis) return;
    st.shownByText = vis;
    this.cr.set(st.ref, { visible: vis ? 1 : 0 });
  }

  _clock(st, d, now, force) {
    const t = new Date(now + this.utcOffsetMinutes() * 60000);
    const colon = d.blinkColon ? Math.floor(now / 500) % 2 === 0 : true;
    const text = formatClock(t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), {
      format: d.format,
      showSeconds: d.showSeconds,
      showSuffix: d.showSuffix,
      colon,
    });
    this._sendLine(st, [{ text }], d.align, 0, 1, force);
  }

  _gear(st, d, pal, now, force) {
    const r = this._displayText(d.binding, '0', now);
    if (!r.show) {
      this._setVisible(st, false);
      return;
    }
    this._setVisible(st, true);
    let gear = r.text;
    if (d.mapping && d.mapping[gear]) gear = d.mapping[gear];
    this._sendLine(st, [{ text: gear }], 0.5, 0, 1, force);
    const mode = this.signals.get(d.modeSignal);
    const manual = d.manualColor && mode && mode.valid && String(mode.value) === 'M';
    this._setColor(st, 'u_color', manual ? d.manualColor : st.piece.colors.u_color, pal, force);
  }

  _modeText(st, d, now, force) {
    const mode = this.signals.get(d.modeSignal);
    const text =
      mode && mode.valid && now - mode.at <= conditions.STALE_MS ? String(mode.value) : '';
    this._sendLine(st, [{ text }], 0.5, 0, 1, force);
  }

  _telltale(st, d, pal, now, force) {
    const v = this._value(d.binding, now);
    const on = v !== null && v >= 0.5;
    if (d.hideWhenOff) this._setVisible(st, on);
    this._setColor(st, 'u_color', on ? d.onColor : d.offColor, pal, force);
  }

  _zoneColor(st, d, pal, now, force) {
    const v = this._value(d.binding, now);
    let color = d.base;
    if (v !== null)
      d.zones.forEach((z) => {
        if (v >= z.from && v < z.to) color = z.color;
      });
    this._setColor(st, d.uniform, color, pal, force);
  }

  _shiftlights(st, d, now, force) {
    const v = this._value(d.binding, now);
    let lit = 0;
    if (v !== null && d.to > d.from && v >= d.from)
      lit = Math.max(0, Math.min(d.count, Math.ceil(((v - d.from) / (d.to - d.from)) * d.count)));
    if (force || st.lastLit !== lit) {
      st.lastLit = lit;
      this.cr.uniform(st.ref, 'u_lit', [lit]);
      this.messages++;
    }
    const flashing = d.flashAbove > 0 && v !== null && v >= d.flashAbove;
    if (flashing && !st.flashAnim) {
      const half = Math.round(500 / (d.flashRateHz || 6));
      st.flashAnim = this.cr.animate(st.ref, {
        property: 'uniform',
        name: 'u_flash',
        keys: '0:1 ' + half + ':-1 ' + half * 2 + ':1',
        loop: true,
        interp: 'step',
      });
    } else if (!flashing && st.flashAnim) {
      this.cr.stop(st.ref, st.flashAnim);
      st.flashAnim = 0;
      this.cr.uniform(st.ref, 'u_flash', [0]);
    }
  }

  /* ----- colour animation clips (runtime side, 30 Hz) ----- */

  _colorAnims(st, pal, now) {
    st.anims.forEach((an) => {
      const clip = an.clip,
        trig = clip.trigger || {};
      const uniform = this._uniformForProp(st.piece, an.track.property);
      if (!uniform) return;
      if (trig.on === 'while') {
        const holds = conditions.evaluate(trig.condition, this.signals, now);
        if (holds && an.startedAt === null) an.startedAt = now + (clip.delay || 0);
        if (!holds && an.startedAt !== null) {
          an.startedAt = null;
          this._setColor(st, uniform, st.piece.colors[uniform], pal, true);
        }
      } else if (trig.on === 'rising' || trig.on === 'falling') {
        const holds = conditions.evaluate(trig.condition, this.signals, now);
        if (an.prev !== undefined && holds !== an.prev && (trig.on === 'rising' ? holds : !holds))
          an.startedAt = now + (clip.delay || 0);
        an.prev = holds;
      } else if (trig.on === 'change') {
        const s = this.signals.get(trig.signal);
        const v = s && s.valid ? s.value : undefined;
        if (an.prev !== undefined && v !== an.prev) an.startedAt = now + (clip.delay || 0);
        an.prev = v;
      }
      if (an.startedAt === null || now < an.startedAt) return;
      const local = now - an.startedAt;
      const iter = Math.floor(local / clip.duration);
      const maxLoops = clip.loop === true ? Infinity : clip.loop === false ? 1 : clip.loop;
      let frac;
      if (iter >= maxLoops) {
        if (trig.on !== 'while' && trig.on !== 'always') {
          an.startedAt = null;
          this._setColor(st, uniform, st.piece.colors[uniform], pal, true);
          return;
        }
        frac = 1;
      } else frac = (local % clip.duration) / clip.duration;
      if (clip.direction === 'reverse') frac = 1 - frac;
      else if (clip.direction === 'alternate' && iter % 2 === 1) frac = 1 - frac;
      const kfs = an.track.keyframes;
      let color = null;
      for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i],
          b = kfs[i + 1];
        if (frac >= a.t && frac <= b.t) {
          const k = ease(a.easing || clip.easing, b.t === a.t ? 1 : (frac - a.t) / (b.t - a.t));
          color = mixColor(
            resolveColor(String(a.value), pal),
            resolveColor(String(b.value), pal),
            k,
          );
          break;
        }
      }
      if (!color)
        color = resolveColor(String((frac <= kfs[0].t ? kfs[0] : kfs[kfs.length - 1]).value), pal);
      this._setColor(st, uniform, color, pal, false);
    });
  }

  _uniformForProp(piece, prop) {
    switch (prop) {
      case 'props.style.color':
      case 'props.valueStyle.color':
        return piece.shader === 'text' ? 'u_color' : null;
      case 'props.needle.color':
        return piece.shader === 'needle' ? 'u_color' : null;
      case 'props.fill.color':
        return piece.shader === 'arc-band' || piece.shader === 'bar' ? 'u_fill' : null;
      default:
        return null;
    }
  }
}

module.exports = {
  ClusterEngine,
  resolveColor,
  parseColor,
  LIVE_GRACE_MS,
  STALE_MS: conditions.STALE_MS,
};
