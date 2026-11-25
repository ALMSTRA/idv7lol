'use strict';
/**
 * idv7lol - your own layout on the whole instrument cluster of a BMW iDrive 7 (MGU) car.
 *
 * The app runs on the head unit (Node 8). It reads the car's signals
 * (vehicle.js), loads a theme compiled by the idv7lol Studio / theme
 * compiler (theme_<id>.js) and draws it through the cluster-render service
 * (engine.js). Its own page on the central display (page.js) shows the
 * themes, the car's data and diagnostics; everything else is in the Settings
 * the kit builds from app.json.
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
const { ClusterEngine, STRIP_Y, SETTLE_MS } = require('./engine');
const { startVehicle } = require('./vehicle');
const tz = require('./tz');
const index = require('./themes_index');
const SHADERS = require('./shaders');
const { ThemeLibrary, UsbWatcher, PREFIX } = require('./usb_themes');
const { unitGroups, applyUnits } = require('./units');

const G = require('./kit/gauges');
const { getLanguage, t: translate } = require('./kit/i18n');
const page = require('./page');

const W = page.W,
  H = page.H;
const APP_ID = 'idv7lol';
const formatLabel = getLanguage() === 'zh-CN' ? translate : page.ascii;
const drawLabel = page.labels(formatLabel);

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
    // the Time zone setting (daylight saving included, tz.js); 'offset' uses the fixed Clock offset
    const utcOffset = () =>
      tz.offsetMinutes(
        settings.get('timeZone'),
        Date.now(),
        Number(settings.get('utcOffset')) || 0,
      );
    const vehicle = startVehicle(ctx, { redline: 7000 });

    const library = new ThemeLibrary({ dataDir: ctx.dataDir || process.cwd(), log });
    const themeKeys = () => index.themes.map((t) => t.id).concat(library.list().map((t) => t.key));
    // The cluster's theme is the setting "clusterTheme". It was "theme", which is the kit's own
    // key for the colours of this page: a theme chosen under the old name is carried over once.
    const THEME = 'clusterTheme';
    if (settings.get('_clusterThemeMoved') !== 1) {
      const old = settings.get('theme');
      const item = settings.item(THEME);
      if (
        typeof old === 'string' &&
        item &&
        settings.get(THEME) === item.default &&
        old !== item.default &&
        themeKeys().indexOf(old) >= 0
      )
        settings.set(THEME, old);
      settings.set('_clusterThemeMoved', 1);
    }
    let current;
    try {
      current = loadTheme(settings.get(THEME), library);
    } catch (e) {
      log.warn('theme ' + settings.get(THEME) + ' failed, using the first bundled one: ' + e);
      current = loadTheme(index.themes[0].id);
    }
    let usbNote = '';
    // '' or why a theme from a stick could not be saved here (Status page)
    let storage = library.storage();
    if (storage) log.warn('usb: ' + storage);
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

    // Units: the Units setting, or with Auto the car's own (its board computer names them a
    // little after the start, so what it said last time is kept for the next start).
    const carUnits = () => {
      const now = vehicle.carUnits();
      if (now) {
        const text = now.speed + ',' + (now.consumption || '');
        if (settings.get('_carUnits') !== text) settings.set('_carUnits', text);
        return now;
      }
      const kept = String(settings.get('_carUnits') || '').split(',');
      return kept[0] ? { speed: kept[0], consumption: kept[1] || null } : null;
    };
    const groups = () => unitGroups(settings.get('units') || 'auto', carUnits());
    /** The theme on show in the driver's units (the theme's own pieces where it has no others). */
    const themeShown = () => applyUnits(current.theme, groups());

    const client = new ClusterRender(APP_ID);
    const engine = new ClusterEngine({
      client,
      log,
      target: 'panel',
      theme: themeShown(),
      fonts: current.fonts,
      paletteId,
      enabled: showing,
      live: vehicle.live,
      signals: vehicle.store,
      loadImage: (img) => fs.readFileSync(path.join(current.imageDir, img.file)),
      sweep: () => settings.get('sweep') !== 'off',
      // a theme's map window shows the map another app draws, unless switched off
      map: () => settings.get('map') !== 'off',
      // plain lines of text as the renderer's text layers, where it has them (cluster-render 0.8.11)
      textLayers: () => settings.get('textLayers') === 'on',
      utcOffsetMinutes: utcOffset,
      // The layout ends above the cluster's own bottom strip unless the setting says otherwise:
      // drawn over it, some KOMBIs leave black boxes until the head unit restarts (issue #7).
      stripY: () => (settings.get('bottomStrip') === 'layout' ? null : STRIP_Y),
      hold: vehicle.hold,
      settleMs: SETTLE_MS,
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
    let unitsShown = groups().join(',');
    /** Draw the layout again when the units changed, and only then: a rebuild flashes the cluster. */
    const followUnits = () => {
      const now = groups().join(',');
      if (now === unitsShown) return;
      unitsShown = now;
      log.info('units: ' + (now || 'as drawn'));
      engine.setTheme(themeShown(), current.fonts);
    };
    setInterval(() => {
      if (engine.shown) client.status();
      followUnits();
    }, 5000);

    /* ---------- the app's own page (drawing in page.js) ---------- */
    // "modern": tabs with the themes' sketches and the car's data, then the four text pages.
    // "classic": the four text pages alone, as the app was before.
    const classic = () => settings.get('interface') === 'classic';
    let tab = 0; // modern: index into page.MODERN_TABS
    let textPageNo = 0; // classic: 0 status, 1 signals, 2 renderer, 3 about
    let drawn = null; // what the last frame showed: the page is drawn again only when it changes
    let dragX = 0; // Themes tab: how far a finger has pulled the sketches sideways (page px)
    let touchDown = null; // where that finger went down
    let dragBusy = false; // a frame of that pull is being drawn
    const redraw = () => {
      drawn = null;
    };

    // A theme's data for its sketch, without its fonts and pictures (kept: the page shows three).
    const sketches = {};
    const sketchOf = (key) => {
      if (key === current.key) return current.theme;
      if (!sketches[key]) {
        try {
          if (String(key).indexOf(PREFIX) === 0) sketches[key] = library.load(key).theme;
          else {
            const entry = index.themes.find((t) => t.id === key);
            sketches[key] = entry ? require('./' + entry.module) : null;
          }
        } catch (e) {
          log.warn('sketch of ' + key + ': ' + e);
          sketches[key] = null;
        }
      }
      return sketches[key];
    };
    const forgetUsbSketches = () =>
      Object.keys(sketches).forEach((k) => {
        if (k.indexOf(PREFIX) === 0) delete sketches[k];
      });

    const stateNow = () => {
      const st = engine.status();
      const vs = vehicle.status();
      return page.stateOf({
        showing: showing(),
        connected: st.connected,
        failed: st.failed,
        shown: st.shown,
        hold: vehicle.hold(),
        demo: vs.demo,
        theme: current.theme.name,
        palette: st.palette,
      });
    };
    const text = (id) => {
      const s = vehicle.store.get(id);
      return s && s.value !== undefined && s.value !== null ? String(s.value) : '';
    };

    function removeUsbTheme() {
      if (current.key.indexOf(PREFIX) !== 0) {
        usbNote = 'Only themes installed from USB can be removed. This one is built in.';
        return;
      }
      const name = current.theme.name;
      library.remove(current.key);
      forgetUsbSketches();
      settings.set(THEME, index.themes[0].id);
      usbNote = 'Removed ' + name + '.';
    }

    // The kit tells every setting it is given, the same value too (picked again in the HMI). Only a
    // real change rebuilds the layout: a rebuild that changes nothing still flashes the cluster.
    const last = { theme: settings.get(THEME), bottomStrip: settings.get('bottomStrip') };
    settings.onChange((k) => {
      redraw();
      if (k === THEME) {
        if (settings.get(THEME) === last.theme) return;
        last.theme = settings.get(THEME);
        try {
          current = loadTheme(settings.get(THEME), library);
          engine.setTheme(themeShown(), current.fonts);
          log.info('theme: ' + current.theme.id);
        } catch (e) {
          log.warn('theme load failed: ' + e);
        }
      }
      if (k === 'bottomStrip') {
        if (settings.get('bottomStrip') === last.bottomStrip) return;
        last.bottomStrip = settings.get('bottomStrip');
        engine.setTheme(themeShown(), current.fonts);
      }
      if (k === 'units') followUnits();
      if (k === 'palette') engine.recolour();
      // "Theme from USB on show > Remove it from the car" is a one-off: it goes back to Keep
      if (k === 'usbRemove' && settings.get('usbRemove') === 'remove') {
        removeUsbTheme();
        settings.set('usbRemove', 'keep');
      }
    });

    function draw() {
      const t = ctx.theme();
      const cv = ctx.canvas(W, H).clear(t.bg);
      const st = engine.status();
      const vs = vehicle.status();
      const state = stateNow();
      const store = vehicle.store;
      const pid = paletteId();
      const modern = !classic();
      if (modern && tab === 0) {
        const keys = themeKeys();
        const i = Math.max(0, keys.indexOf(current.key));
        const side = (d) => {
          if (keys.length < 2 || (keys.length === 2 && d < 0)) return null;
          const th = sketchOf(keys[(i + d + keys.length) % keys.length]);
          return th ? { theme: th, palette: th.paletteSelection.default } : null;
        };
        page.themesPage(cv, t, {
          format: formatLabel,
          themes: [side(-1), { theme: current.theme, palette: pid }, side(1)],
          state,
          layers: current.theme.layers,
          paletteName: settings.get('palette') === 'auto' ? 'Auto (' + pid + ')' : pid,
          note: usbNote,
          count: keys.length,
          at: i + 1,
          dx: dragX,
          go: stepTheme,
        });
      } else if (modern && tab === 1) {
        const litres = store.number('fuel.volume');
        const range = store.number('vehicle.range');
        page.dataPage(cv, t, {
          format: formatLabel,
          theme: { theme: current.theme, palette: pid },
          state,
          mode: text('drive.mode'),
          source: vs.demo ? 'Demo' : vehicle.live() ? 'Live' : 'Not live',
          speed: store.number('vehicle.speed'),
          mph: groups().indexOf('speed') >= 0,
          rpm: store.number('engine.rpm'),
          redline: 7000,
          gear: text('transmission.gear'),
          programme: text('transmission.mode'),
          fuelPct: store.number('fuel.level'),
          fuelText:
            (page.isNum(litres) ? page.fmt(litres) + ' l' : '') +
            (page.isNum(litres) && page.isNum(range) ? '  ·  ' : '') +
            (page.isNum(range) ? page.fmt(range) + ' km' : ''),
          oil: store.number('engine.oil.temp'),
          coolant: store.number('engine.coolant.temp'),
        });
      } else {
        const n = modern ? tab - 2 : textPageNo;
        const now = Date.now();
        page.textPage(cv, t, n, {
          format: formatLabel,
          version,
          state,
          themeLine:
            current.theme.name +
            '  ·  ' +
            current.theme.layers +
            ' layers  ·  ' +
            current.theme.compiledWith,
          rendererLine:
            (st.connected ? 'connected (' + st.backend + ')' : 'not connected') +
            '  ·  panel: ' +
            st.target +
            '  ·  refused ops: ' +
            st.refused +
            (st.map ? '  ·  map: ' + String(st.map).slice(0, 48) : '') +
            (st.textLayers ? '  ·  text layers: ' + st.textLayers : ''),
          carLine:
            (vs.demo ? 'DEMO' : vehicle.live() ? 'live' : 'not live') +
            '  ·  ' +
            page.fmt(store.number('vehicle.speed')) +
            ' km/h  ·  ' +
            page.fmt(store.number('engine.rpm')) +
            ' rpm  ·  gear ' +
            (text('transmission.gear') || '-') +
            '  ·  oil ' +
            page.fmt(store.number('engine.oil.temp')) +
            '°  ·  coolant ' +
            page.fmt(store.number('engine.coolant.temp')) +
            '°',
          modeLine:
            (text('drive.mode') || '-') +
            '  ·  shift programme ' +
            (text('transmission.mode') || '-'),
          fuel: vs.fuel,
          providers: vs.providers,
          usb:
            library.list().length +
            ' installed  ·  ' +
            (usbNote ||
              (storage
                ? 'Themes cannot be saved: ' + storage
                : 'Copy themes to idv7lol/themes on a USB stick and plug it in.')),
          demo: vs.demo,
          signals: store
            .ids()
            .sort()
            .map((id) => {
              const s = store.get(id);
              const v = typeof s.value === 'number' ? Math.round(s.value * 100) / 100 : s.value;
              return {
                text: id + '  =  ' + v + '   (' + Math.round((now - s.at) / 100) / 10 + ' s)',
                fresh: s.valid && now - s.at < 3000,
              };
            }),
          raw: Object.keys(vs.raw).map((k) => k + ': ' + vs.raw[k]),
          connected: st.connected,
          lines: (engine.rendererStatus || 'open this page with the layout showing')
            .split('\n')
            .filter((l) => !/effect of idv7lol/.test(l)),
          footer:
            'messages sent: ' +
            st.messages +
            '   layers: ' +
            st.layers +
            '   targets: ' +
            st.targets,
          versions:
            'Versions: app ' +
            version +
            '  ·  theme ' +
            current.theme.version +
            '  ·  compiler ' +
            current.theme.compiledWith,
        });
        if (!modern)
          drawLabel(
            cv,
            'Show: ' +
              (showing() ? 'ON' : 'off') +
              '   ·   Theme: ' +
              current.theme.name +
              '   ·   Palette: ' +
              settings.get('palette') +
              '   ·   page ' +
              (textPageNo + 1) +
              '/' +
              page.CLASSIC_PAGES,
            48,
            504,
            15,
            t.dim,
          );
      }
      if (modern) G.frame(cv, t, page.MODERN_TABS, tab, [vs.demo && { text: 'DEMO' }]);
      return cv;
    }

    /** What the page shows now, as one string: it is drawn again only when this changes. */
    function shownNow() {
      const store = vehicle.store;
      const state = stateNow();
      const modern = !classic();
      const parts = [
        modern ? 'm' + tab : 'c' + textPageNo,
        state.label,
        state.detail,
        current.key,
        paletteId(),
        settings.get('palette'),
        usbNote,
        ctx.theme().name,
        Math.round(dragX / 4),
        groups().join(','),
      ];
      const n = (id, step) => {
        const v = store.number(id);
        return page.isNum(v) ? Math.round(v / step) * step : '-';
      };
      if (modern && tab === 0) parts.push(themeKeys().length);
      else if (modern && tab === 1)
        parts.push(
          n('vehicle.speed', 1),
          n('engine.rpm', 20),
          text('transmission.gear'),
          text('transmission.mode'),
          text('drive.mode'),
          n('fuel.level', 1),
          n('fuel.volume', 1),
          n('vehicle.range', 1),
          n('engine.oil.temp', 1),
          n('engine.coolant.temp', 1),
          vehicle.status().demo,
          vehicle.live(),
        );
      // the text pages show values and their ages: twice a second (About: never by itself)
      else if ((modern ? tab - 2 : textPageNo) !== 3) parts.push(Math.floor(Date.now() / 500));
      return parts.join('|');
    }

    function render(force) {
      const now = shownNow();
      if (!force && now === drawn) return Promise.resolve();
      drawn = now;
      return ui.image('MAIN_GFX', draw());
    }
    // A button's own frame at once; a failure there is logged, never thrown at the kit.
    const show = () => render(true).catch((e) => log.warn('page: ' + ((e && e.stack) || e)));

    ui.onClick('BTN_SHOW', () => {
      settings.set('show', showing() ? 'off' : 'on');
      return show();
    });
    /** The theme d places on (1: the next, -1: the one before), round the list. */
    function stepTheme(d) {
      const ids = themeKeys();
      if (ids.length < 2) return show();
      const i = Math.max(0, ids.indexOf(current.key));
      usbNote = '';
      settings.set(THEME, ids[(i + d + ids.length) % ids.length]);
      return show();
    }
    ui.onClick('BTN_THEME', () => stepTheme(1));
    // Themes tab, where the kit hands the page a finger's whole gesture: the sketches follow it,
    // far enough sideways is the next theme (to the left) or the one before, and a tap on a
    // neighbour's sketch is that theme. Anywhere else the kit keeps the touch.
    if (ctx.onTouch)
      ctx.onTouch((phase, x, y) => {
        if (phase === 1) {
          touchDown = null;
          if (classic() || tab !== 0 || y < page.TOP || y > page.BOTTOM) return false;
          touchDown = { x, y, far: 0 };
          return true;
        }
        if (!touchDown) return false;
        const dx = x - touchDown.x;
        touchDown.far = Math.max(touchDown.far, Math.abs(dx), Math.abs(y - touchDown.y));
        if (phase === 2) {
          dragX = Math.abs(dx) < 12 ? 0 : dx;
          // a frame per move, one at a time (the page's own loop runs twice a second)
          if (!dragBusy) {
            dragBusy = true;
            const done = () => {
              dragBusy = false;
            };
            render(true).then(done, done);
          }
          return true;
        }
        const down = touchDown;
        touchDown = null;
        dragX = 0;
        if (Math.abs(dx) >= page.THEMES.swipe) stepTheme(dx < 0 ? 1 : -1);
        else if (down.far < 30 && page.themeAt(x, y)) stepTheme(page.themeAt(x, y));
        else show();
        return true;
      });
    ui.onClick('BTN_PALETTE', () => {
      const ids = ['auto'].concat(Object.keys(current.theme.palettes));
      const i = ids.indexOf(settings.get('palette'));
      settings.set('palette', ids[(i + 1) % ids.length]);
      return show();
    });
    // Page: the next tab (the kit leaves this button out where its tabs can be tapped)
    ui.onClick('BTN_PAGE', () => {
      if (classic()) textPageNo = (textPageNo + 1) % page.CLASSIC_PAGES;
      else tab = (tab + 1) % page.MODERN_TABS.length;
      return show();
    });
    ctx.onTab((i) => {
      if (classic() || i === tab || i < 0 || i >= page.MODERN_TABS.length) return;
      tab = i;
      show();
    });
    if (ctx.onLayout) ctx.onLayout(redraw);
    ui.onVisible((name, on) => {
      if (name === 'MAIN' && on) redraw();
    });
    if (ui.onFocus)
      ui.onFocus((name, on) => {
        if (name === 'MAIN' && on) redraw();
      });

    ctx.loop('MAIN', 2, () => render(false));
    show();

    // Themes on a USB stick install by themselves; the driver picks them with Theme. Started
    // last: a stick that is in already reports at once, and by then the page can be drawn.
    const usb = new UsbWatcher({
      library,
      log,
      appVersion: version,
      shaders: SHADERS,
      fonts: index.fonts.length ? index.fonts : ['sans'],
      onChange: (results) => {
        const ok = results.filter((r) => r.ok).map((r) => r.theme.name);
        const bad = results.filter((r) => !r.ok);
        forgetUsbSketches();
        storage = library.storage();
        // A new copy of the theme on show replaced its files: reload it so the
        // layout and its pictures come from the same version.
        if (results.some((r) => r.ok && r.theme.key === current.key)) {
          try {
            current = loadTheme(current.key, library);
            engine.setTheme(themeShown(), current.fonts);
          } catch (e) {
            log.warn('theme reload failed: ' + e);
          }
        }
        usbNote =
          (ok.length ? 'Installed from USB: ' + ok.join(', ') + '. Press Theme to pick it.' : '') +
          (bad.length
            ? (ok.length ? '  ' : '') +
              'Refused ' +
              bad.map((r) => r.file + ' (' + r.reason + ')').join(', ')
            : '');
        show();
      },
    });
    usb.start();
  },
});
