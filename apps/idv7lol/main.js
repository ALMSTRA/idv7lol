'use strict';
/**
 * idv7lol - your own layout on the whole instrument cluster of a BMW iDrive 7 (MGU) car.
 *
 * The app runs on the head unit (Node 8). It reads the car's signals
 * (vehicle.js), loads a theme compiled by the idv7lol Studio / theme
 * compiler (theme_<id>.js) and draws it through the cluster-render service
 * (engine.js). Its own page on the central display shows status and
 * diagnostics; everything else is in the iDrive Settings menu the kit builds
 * from app.json.
 *
 * Safety: off by default. The layout exists only while "Show on the
 * cluster" is on AND car data is live; it is dropped (and the factory
 * cluster returns) when either stops, when the app stops or when the
 * render service dies. The factory telltales and pop-ups stay on top:
 * the panel target sits below them. Nothing is written to the vehicle.
 */
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const { ClusterRender } = require('./cluster_render_client');
const { ClusterEngine, STRIP_Y } = require('./engine');
const { startVehicle } = require('./vehicle');
const index = require('./themes_index');
const SHADERS = require('./shaders');
const { ThemeLibrary, UsbWatcher, PREFIX } = require('./usb_themes');

const W = 1600,
  H = 520;
const APP_ID = 'idv7lol';

function loadFonts(theme) {
  const fonts = {};
  theme.fonts.forEach((fam) => {
    const metrics = require('./font_' + fam);
    const pixels = fs.readFileSync(path.join(__dirname, 'font_' + fam + '.wad'));
    fonts[fam] = { metrics, pixels };
  });
  return fonts;
}

/** A bundled theme by id, or one installed from USB by its "usb:<id>" key. */
function loadTheme(key, library) {
  if (library && String(key).indexOf(PREFIX) === 0) {
    const got = library.load(key);
    return { key, theme: got.theme, fonts: loadFonts(got.theme), imageDir: got.imageDir };
  }
  const entry = index.themes.find((t) => t.id === key) || index.themes[0];
  if (!entry) throw new Error('no themes bundled');
  const theme = require('./' + entry.module);
  return { key: entry.id, theme, fonts: loadFonts(theme), imageDir: __dirname };
}

mgu.run({
  async start(ctx) {
    const { ui, settings, log } = ctx;
    const version = (ctx.spec && ctx.spec.version) || '0.0.0';
    log.info(
      'idv7lol ' + version + ' starting; themes: ' + index.themes.map((t) => t.id).join(', '),
    );

    const showing = () => settings.get('show') === 'on';
    const utcOffset = () => Number(settings.get('utcOffset')) || 0;
    const vehicle = startVehicle(ctx, { redline: 7000 });

    const library = new ThemeLibrary({ dataDir: ctx.dataDir || process.cwd(), log });
    const themeKeys = () => index.themes.map((t) => t.id).concat(library.list().map((t) => t.key));
    let current;
    try {
      current = loadTheme(settings.get('theme'), library);
    } catch (e) {
      log.warn('theme ' + settings.get('theme') + ' failed, using the first bundled one: ' + e);
      current = loadTheme(index.themes[0].id);
    }
    let usbNote = 'Copy themes to idv7lol/themes on a USB stick and plug it in.';
    const paletteId = () => {
      const manual = settings.get('palette');
      const sel = current.theme.paletteSelection;
      if (manual && manual !== 'auto' && sel.allowManual && current.theme.palettes[manual])
        return manual;
      const mode = vehicle.store.get('drive.mode');
      if (
        mode &&
        mode.valid &&
        sel.byDriveMode[mode.value] &&
        current.theme.palettes[sel.byDriveMode[mode.value]]
      )
        return sel.byDriveMode[mode.value];
      return sel.default;
    };

    const client = new ClusterRender(APP_ID);
    const engine = new ClusterEngine({
      client,
      log,
      target: 'panel',
      theme: current.theme,
      fonts: current.fonts,
      paletteId,
      enabled: showing,
      live: vehicle.live,
      signals: vehicle.store,
      loadImage: (img) => fs.readFileSync(path.join(current.imageDir, img.file)),
      sweep: () => settings.get('sweep') !== 'off',
      utcOffsetMinutes: utcOffset,
      // The layout ends above the cluster's own bottom strip unless the setting says otherwise:
      // drawn over it, some KOMBIs leave black boxes until the head unit restarts (issue #7).
      stripY: () => (settings.get('bottomStrip') === 'layout' ? null : STRIP_Y),
    });
    client.on('ready', () =>
      log.info('cluster-render connected: ' + client.backend + ' ' + client.targets),
    );
    client.on('disconnected', () => log.warn('cluster-render disconnected'));
    client.on('budget', (cap, max, reason) =>
      log.info(
        'upload budget ' + cap + ' / ' + max + ' KB/s' + (reason ? ' (' + reason + ')' : ''),
      ),
    );
    client.connect();
    engine.start();
    setInterval(() => {
      if (engine.shown) client.status();
    }, 5000);

    settings.onChange((k) => {
      if (k === 'theme') {
        try {
          current = loadTheme(settings.get('theme'), library);
          engine.setTheme(current.theme, current.fonts);
          log.info('theme: ' + current.theme.id);
        } catch (e) {
          log.warn('theme load failed: ' + e);
        }
      }
      if (k === 'bottomStrip') engine.setTheme(current.theme, current.fonts);
      if (k === 'palette') engine.recolour();
      if (k === 'sweep' || k === 'utcOffset') return;
      render().catch(() => {});
    });

    /* ---------- the app's own page ---------- */
    let page = 0; // 0 status, 1 signals, 2 renderer, 3 about
    const PAGES = 4;
    ui.onClick('BTN_SHOW', () => {
      settings.set('show', showing() ? 'off' : 'on');
      return render();
    });
    ui.onClick('BTN_THEME', () => {
      const ids = themeKeys();
      const i = ids.indexOf(current.key);
      settings.set('theme', ids[(i + 1) % ids.length]);
      return render();
    });
    ui.onClick('BTN_REMOVE', () => {
      if (current.key.indexOf(PREFIX) !== 0) {
        usbNote = 'Only themes installed from USB can be removed. This one is built in.';
        return render();
      }
      const name = current.theme.name;
      library.remove(current.key);
      settings.set('theme', index.themes[0].id);
      usbNote = 'Removed ' + name + '.';
      return render();
    });

    // Themes on a USB stick install by themselves; the driver picks them with Next theme.
    const usb = new UsbWatcher({
      library,
      log,
      appVersion: version,
      shaders: SHADERS,
      fonts: index.fonts.length ? index.fonts : ['sans'],
      onChange: (results) => {
        const ok = results.filter((r) => r.ok).map((r) => r.theme.name);
        const bad = results.filter((r) => !r.ok);
        // A new copy of the theme on show replaced its files: reload it so the
        // layout and its pictures come from the same version.
        if (results.some((r) => r.ok && r.theme.key === current.key)) {
          try {
            current = loadTheme(current.key, library);
            engine.setTheme(current.theme, current.fonts);
          } catch (e) {
            log.warn('theme reload failed: ' + e);
          }
        }
        usbNote =
          (ok.length ? 'Installed from USB: ' + ok.join(', ') + '. Press Next theme.' : '') +
          (bad.length
            ? (ok.length ? '  ' : '') +
              'Refused ' +
              bad.map((r) => r.file + ' (' + r.reason + ')').join(', ')
            : '');
        render().catch(() => {});
      },
    });
    usb.start();
    ui.onClick('BTN_PALETTE', () => {
      const ids = ['auto'].concat(Object.keys(current.theme.palettes));
      const i = ids.indexOf(settings.get('palette'));
      settings.set('palette', ids[(i + 1) % ids.length]);
      return render();
    });
    ui.onClick('BTN_DIAG', () => {
      page = (page + 1) % PAGES;
      return render();
    });

    const isNum = (v) => typeof v === 'number' && isFinite(v);
    const fmt = (v, d) => (isNum(v) ? v.toFixed(d || 0) : '--');
    function render() {
      const t = ctx.theme();
      const cv = ctx.canvas(W, H).clear(t.bg);
      const st = engine.status();
      const vs = vehicle.status();
      const text = (s, x, y, size, c, opts) =>
        cv.text(
          String(s).slice(0, 140),
          x,
          y,
          size,
          c,
          Object.assign({ literal: true }, opts || {}),
        );
      text('idv7lol ' + version, 48, 72, 40, t.text, { font: 'bold' });
      if (page === 0) {
        const lines = [
          [
            'On the cluster',
            !showing()
              ? 'Off - the factory cluster shows. Press "Show on the cluster".'
              : st.shown
                ? 'Showing ' + current.theme.name + '  ·  palette ' + st.palette
                : 'Waiting for live car data (' + (vs.demo ? 'demo' : 'no signals yet') + ')',
          ],
          [
            'Theme',
            current.theme.name +
              '  ·  ' +
              current.theme.layers +
              ' layers  ·  ' +
              current.theme.compiledWith,
          ],
          [
            'Cluster renderer',
            (st.connected ? 'connected (' + st.backend + ')' : 'not connected') +
              '  ·  panel: ' +
              st.target +
              '  ·  refused ops: ' +
              st.refused,
          ],
          [
            'Car data',
            (vs.demo ? 'DEMO' : vehicle.live() ? 'live' : 'not live') +
              '  ·  ' +
              fmt(vehicle.store.number('vehicle.speed')) +
              ' km/h  ·  ' +
              fmt(vehicle.store.number('engine.rpm')) +
              ' rpm  ·  gear ' +
              ((vehicle.store.get('transmission.gear') || {}).value || '-') +
              '  ·  oil ' +
              fmt(vehicle.store.number('engine.oil.temp')) +
              '°  ·  coolant ' +
              fmt(vehicle.store.number('engine.coolant.temp')) +
              '°',
          ],
          [
            'Drive mode',
            ((vehicle.store.get('drive.mode') || {}).value || '-') +
              '  ·  gearbox ' +
              ((vehicle.store.get('transmission.mode') || {}).value || '-'),
          ],
          ['Fuel', vs.fuel || '-'],
          ['Providers', vs.providers || '-'],
          ['USB themes', library.list().length + ' installed  ·  ' + usbNote],
          [
            'Safety',
            'Experimental software. Factory warnings stay on top. Deactivate here or uninstall from the MGU Store to restore everything.',
          ],
        ];
        lines.forEach(([k, v], i) => {
          // 9 rows: 40 px apart so the last stays clear of the footer at y 500
          text(k, 48, 140 + i * 40, 20, t.dim, { font: 'bold' });
          text(v, 300, 140 + i * 40, k === 'Safety' || k === 'USB themes' ? 16 : 19, t.text, {
            font: 'label',
          });
        });
      } else if (page === 1) {
        text(
          'Signals (' + (vs.demo ? 'demo' : 'car') + ')  ·  catalog id, value, age',
          48,
          120,
          22,
          t.dim,
          { font: 'bold' },
        );
        const ids = vehicle.store.ids().sort();
        const now = Date.now();
        ids.slice(0, 24).forEach((id, i) => {
          const s = vehicle.store.get(id);
          const col = i % 2,
            row = Math.floor(i / 2);
          const v = typeof s.value === 'number' ? Math.round(s.value * 100) / 100 : s.value;
          text(
            id + '  =  ' + v + '   (' + Math.round((now - s.at) / 100) / 10 + ' s)',
            48 + col * 780,
            156 + row * 26,
            16,
            s.valid && now - s.at < 3000 ? t.text : t.dim,
            { font: 'label' },
          );
        });
        let y = 156 + 12 * 26 + 10;
        Object.keys(vs.raw)
          .slice(0, 4)
          .forEach((k) => {
            text(k + ': ' + vs.raw[k], 48, y, 14, t.dim, { font: 'label' });
            y += 20;
          });
      } else if (page === 2) {
        text(
          'Cluster renderer status (' + (st.connected ? 'connected' : 'disconnected') + ')',
          48,
          120,
          22,
          t.dim,
          { font: 'bold' },
        );
        const lines = (engine.rendererStatus || 'press again with the layout showing')
          .split('\n')
          .filter((l) => !/effect of idv7lol/.test(l));
        lines
          .slice(0, 16)
          .forEach((l, i) => text(l, 48, 156 + i * 22, 15, t.text, { font: 'label' }));
        text(
          'messages sent: ' + st.messages + '   layers: ' + st.layers + '   targets: ' + st.targets,
          48,
          500,
          14,
          t.dim,
          { font: 'label' },
        );
      } else {
        text('About', 48, 120, 22, t.dim, { font: 'bold' });
        [
          'idv7lol is free, open-source software (GPL-3.0-or-later): github.com/ALMSTRA/idv7lol',
          'Not affiliated with BMW AG. Experimental: use parked, keep the factory warnings in view.',
          'Themes are made with idv7lol Studio and compiled to one GPU layer per piece.',
          'Drawing by cluster-render (Robert Nisipeanu, MPL-2.0 client). Fonts: Barlow (SIL OFL 1.1).',
          'App kit: cauliflowermossgrape/idrive7-apps (MIT).',
          'Versions: app ' +
            version +
            '  ·  theme ' +
            current.theme.version +
            '  ·  compiler ' +
            current.theme.compiledWith,
        ].forEach((l, i) => text(l, 48, 160 + i * 36, 17, t.text, { font: 'label' }));
      }
      text(
        'Show: ' +
          (showing() ? 'ON' : 'off') +
          '   ·   Theme: ' +
          current.theme.name +
          '   ·   Palette: ' +
          settings.get('palette') +
          '   ·   page ' +
          (page + 1) +
          '/' +
          PAGES,
        48,
        500,
        15,
        t.dim,
        { font: 'label' },
      );
      return ui.image('MAIN_GFX', cv);
    }
    ctx.loop('MAIN', 2, render);
    Promise.resolve()
      .then(render)
      .catch((e) => log.warn('first render: ' + ((e && e.stack) || e)));
  },
});
