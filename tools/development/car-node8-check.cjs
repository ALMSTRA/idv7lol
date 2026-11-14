'use strict';
// Runs the car app's own modules under the Node the head unit has (8.x), which the Vitest suite
// can't: every bundled theme is built by the car's engine against a client that counts what it
// is asked for, and every `.idv7pkg` in the folder given as argument is read and checked like the
// car does on a USB stick, then built too. Plain CommonJS and ES2017 on purpose, so it runs on
// Node 8.9.4 and 8.16.2 (both seen on head units).
//
//   node tools/development/car-node8-check.cjs [folder with .idv7pkg files]

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const APP = path.join(__dirname, '..', '..', 'apps', 'idv7lol');
const load = (m) => require(path.join(APP, m));

const { ClusterEngine } = load('engine.js');
const { readPackage } = load('usb_themes.js');
const SHADERS = load('shaders.js');
const index = load('themes_index.js');
const spec = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8'));
// Loaded only to prove they parse and initialise on this Node.
load('cluster_render_client.js');
load('signals.js');
load('conditions.js');
load('text.js');
load('units.js');
load('fuel.js');
load('etc2.js');
// The kit's runtime goes into the app too (kit/tools/build.py). It needs the head unit's oap-sdk
// to run, so here it is only compiled, which is enough to catch syntax this Node lacks.
const vm = require('vm');
const KIT = path.join(__dirname, '..', '..', 'kit', 'runtime');
fs.readdirSync(KIT)
  .filter((f) => /\.js$/.test(f))
  .forEach((f) => {
    const src = fs.readFileSync(path.join(KIT, f), 'utf8');
    new vm.Script(require('module').wrap(src), { filename: 'kit/runtime/' + f });
  });

class CountingClient extends EventEmitter {
  constructor() {
    super();
    this.ready = true;
    this.next = 1;
    this.live = new Set();
  }
  make() {
    const ref = this.next++;
    this.live.add(ref);
    return ref;
  }
  effect() {
    return this.make();
  }
  image() {
    return this.make();
  }
  asset() {
    return this.make();
  }
  drop(ref) {
    this.live.delete(ref);
  }
  pixels() {}
  uniform() {}
  bind() {}
  set() {}
  animate() {
    return 1;
  }
  stop() {}
  status() {}
}

function fontsFor(theme) {
  const fonts = {};
  theme.fonts.forEach((fam) => {
    const file = path.join(APP, 'font_' + fam + '.wad');
    if (!fs.existsSync(file)) return;
    fonts[fam] = { metrics: load('font_' + fam + '.js'), pixels: fs.readFileSync(file) };
  });
  return fonts;
}

let failures = 0;

function check(name, theme) {
  try {
    const client = new CountingClient();
    const engine = new ClusterEngine({
      client,
      log: { info() {}, warn() {} },
      theme,
      fonts: fontsFor(theme),
      signals: { get: () => undefined },
      sweep: () => false,
      now: () => 1000000,
    });
    engine.tick();
    const st = engine.status();
    const want = theme.pieces.length + (theme.images || []).length;
    if (st.failed) throw new Error('the engine gave up building it');
    if (st.layers !== want) throw new Error(st.layers + ' layers made, ' + want + ' expected');
    engine.setShown(false);
    if (client.live.size) throw new Error(client.live.size + ' layers left after switching off');
    console.log('ok   ' + name + ' (' + st.layers + ' layers)');
  } catch (e) {
    failures++;
    console.log('FAIL ' + name + ': ' + (e && e.message));
  }
}

console.log('Node ' + process.version + ', car app ' + spec.version);

index.themes.forEach((t) => check(t.id, load(t.module + '.js')));

const dir = process.argv[2];
if (dir) {
  const files = fs.readdirSync(dir).filter((f) => /\.idv7pkg$/.test(f));
  if (!files.length) {
    failures++;
    console.log('FAIL no .idv7pkg files in ' + dir);
  }
  files.forEach((f) => {
    let read;
    try {
      read = readPackage(fs.readFileSync(path.join(dir, f)), {
        appVersion: spec.version,
        shaders: SHADERS,
        fonts: ['sans'],
      });
    } catch (e) {
      failures++;
      console.log('FAIL ' + f + ' refused: ' + (e && e.message));
      return;
    }
    // Pictures come from the package's folder on the car; here only the layers are counted.
    check(f, Object.assign({}, read.theme, { images: [] }));
  });
}

if (failures) {
  console.log(failures + ' failed');
  process.exitCode = 1;
}
