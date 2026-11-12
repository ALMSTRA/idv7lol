# Changelog

All notable changes to idv7lol are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Status words used below: **developed** (code exists), **tested locally** (automated tests or a
PC preview), **compiled** (artifacts built), **published** (on GitHub), **tested in vehicle**
(confirmed on a car). They are not interchangeable.

## [Unreleased]

### Added

- The car app installs from the MGU Store's **Releases** channel too, the one the Store offers
  first once the repository has releases. A `catalog` release lists a ready package of the app,
  built by `tools/build/build-store-catalog.py` without BMW's SDK (the head unit makes that module
  from one of its own apps). Its layout matches packages that install from the Store on the test
  car; this one hasn't been tried on a car yet. Before, a source added on Releases showed "no
  catalog release".
- The Studio speaks Russian, Japanese and Simplified Chinese, next to English and Spanish
  (… > Language). It starts in the system's language when it has it, otherwise in English.

## [0.2.0-beta.2] - 2026-11-11

Second pre-release: idv7lol Studio 0.2.0 for Windows and, new, for macOS, plus the car app from
`main`. The car app has run on one car (install, two themes drawn, turning off restores the
factory cluster); everything marked below as not tried on a car still needs a test there.

### Added

- idv7lol Studio for macOS: CI builds one universal `.dmg` (Apple silicon and Intel, macOS 10.15
  or newer), signed ad hoc, and checks its architectures, signature and the `.idv7theme`
  association. Double-clicking a theme in Finder opens it. Compiled, not tested on a Mac; how to
  open it the first time is in `docs/user/INSTALL_MAC.md`.
- Studio: **Theme details** in the Inspector when nothing is selected (name, id, author, version,
  licence, description), with undo. Tested locally in the browser.
- Studio: **File > Share with the community** checks the theme (no errors, an author, an id that
  isn't a template's), saves it with a picture and opens the new theme form on GitHub. Nothing is
  uploaded by the Studio. Tested locally in the browser; the desktop folder dialog is not tried yet.
- A "Share a theme" issue form and a "Sharing a layout (no car needed)" section in CONTRIBUTING.
- Studio library: 23 more entries. **Blocks** add several arranged components at once (speed and
  gear, turn signal pair, temperature columns, data row, modes); new gauges (sweep and half-moon
  tachometers, lateral G meter, oil column, oil pressure, torque ring), readouts (driving mode,
  outside temperature, odometer, torque), a big gear, a 15-LED shift bar and six telltales. Every
  entry is tested to validate and compile for the car.
- Two new themes, also bundled in the car app: **Night Minimal** (a thin rev arc over a big speed,
  quiet side readouts; Night, Amber and Sport palettes, 17 layers) and **Rally Dash** (a 15-LED
  shift strip and rev bar across the top, a huge gear, six data cards; Rally, Stage and Ice
  palettes, 34 layers). Both validate clean and pass the car path test; not tried on a car.
- Display profile: zones other cluster projects report from their cars, shown in the Studio as
  hints only (no findings): the bottom strip below y 646 where the cluster draws black boxes,
  two boxes on M cars, and the driver camera notch. Not measured by idv7lol yet.
- Validator: warns when the numerals of an arc gauge run into each other, such as a 0–260 km/h
  dial labelled at every tick (reported for another cluster app, idrive7-cluster-info #5).

### Fixed

- Driving mode texts read SPORT+ and ECO PRO instead of `SPORT_PLUS` and `ECO_PRO`, in the
  Studio and on the car (the same rule in both engines, checked by a test).
- Car app: switching themes no longer leaves the panel empty for a moment. The old layout's
  bottom layer stays until the new one is up, so the factory gauges don't flash in between
  (reported for another cluster app, idrive7-cluster-info #9). Tested locally with the car's
  engine; not tried on a car.

### Changed

- Car app: requires cluster-render 0.5.2 or newer. From 0.5.1 the panel has its own scene id and
  can show together with a HUD app; 0.5.2 fixes a crash after a renderer-side animation is
  stopped (idrive-apps #132), which the car app does. The renderer client is refreshed from
  upstream (0.5.5; it only adds the `yield` field, which idv7lol doesn't use). Checked locally: the client loads and
  parses as ES2017, and every theme still passes the car path test. Not tried on a car with
  0.5.x yet.
- Car app build: the kit's `build.py` is refreshed from upstream (MIT). On the head unit it now
  leaves out SOME/IP fields, accesses and instances the unit's firmware lacks and logs them,
  instead of BMW's installer refusing the whole app (idrive7-apps #145). Checked locally against
  a made-up interface catalog; not tried on a car.
- `mgu-repo.json` names `build.shared` (`kit`, `oap-sdk`), so on the Branch channel a Studio or
  docs commit is no longer offered to cars as an idv7lol update (mgu-store #205).
- CI builds every theme and every USB package with the car app's modules on Node 8.9.4 and
  8.16.2, the versions head units run.
- Docs: a warning before installing the MGU Store that the SSH unlock flash erases the head
  unit's coding (what is lost, recoding, Digital Key, flash only once), and install problems
  reported upstream in the troubleshooting guide.
- Renderer and compatibility docs follow cluster-render 0.5.x: the panel's scene id, panel and
  HUD together, `yield`, the new limits, and the iDrive 8 targets.
- First vehicle test: on a 2021 X4 M Competition (iDrive 7) the car app installed from the MGU
  Store, drew the Performance and Supercar Track themes, and turning it off restored the factory
  cluster. Status, compatibility and deployment docs now say so, and list what is still
  unconfirmed on a car.
- Docs: install from the Store with the Branch channel (`main`). The Tags channel skips
  pre-release tags such as `v0.2.0-beta.1`.

## [0.2.0-beta.1] - 2026-11-10

First pre-release: idv7lol Studio 0.2.0 for Windows and the car app 0.2.0. Experimental and
**not tested in a vehicle**.

### Added

- Car preview in the Studio: a canvas toggle runs the car app's own engine against a WebGL stand-in
  for cluster-render, so a theme can be seen drawn by the car's shaders before it goes to the car.
  Tested locally; the car's RAMSES renderer can still differ.
- Supercar Track theme: a wide segmented rev arc, a huge gear in the middle, oil, water and fuel
  columns and speed bottom right, with Track and Corsa palettes. Validates clean, 43 of 64 layers.
- My pieces: save components, pictures included, and reuse them in any theme.
- Resize several selected components at once; group and ungroup inside groups, with Escape stepping
  out to the group; edit text right on the canvas (double-click, Enter or F2).
- A test that runs every theme in the repository through the car path: compile, USB package, the
  car app's checks and the car's engine.

- Themes from a USB stick: the Studio's **Save for the car (USB)** writes a `.idv7pkg` package to
  `idv7lol/themes/` on a stick, and the car app (0.2.0) finds, checks and installs it by itself,
  with **Remove USB theme** to delete it. Packages carry no shaders. Tested locally; not tested in a
  vehicle.

- Images in the Studio: import from the computer by button, drag and drop or paste; assets embedded
  in the theme; full-window non-destructive editor with adjustments, looks, crop, rotate and flip,
  background removal, erase/restore brush, effects, compare, undo and a live view on the cluster.
- Compiler bakes each image's edits at its layer size and validates renderer pixel memory.
- MGU app draws image layers (tested locally against a fake renderer; not tested in a vehicle).
- Animated pictures: GIF, animated WebP, APNG and short videos (up to 12 s, 15 fps, 120 frames, no
  sound) import as a sprite sheet, play in the editor and compile to one atlas that the renderer
  loops by itself, with nothing sent per frame. Tested locally; not tested in a vehicle.
- Optional free templates in the Studio's welcome window: conversions of the seven Cluster Layouts by
  eroobeeroo (GPL-3.0-or-later), with credits and differences in `themes/community/README.md`.
- Monorepo foundation: npm workspaces, TypeScript project references, Vitest, ESLint, Prettier,
  GPL-3.0-or-later licence, contribution and security policies, issue and PR templates, CI.
- `@idv7lol/vehicle-signals`: signal catalog (60+ signals with units, ranges, availability),
  unit conversion, vehicle profiles (combustion, turbo, M, PHEV, BEV) and a timestamped signal
  bus. Tested locally.
- `@idv7lol/theme-schema`: versioned theme document format (schemaVersion 1) with 15 component
  types, bindings, conditions, keyframe animations, palettes per driving mode, display profile
  of the iDrive 7 cluster with its reserved zones. Tested locally.
- `@idv7lol/theme-engine`: Canvas2D renderer for every component type, binding evaluation
  with smoothing and staleness, animation player with triggers, hit testing, reserved-zone
  overlap detection, layer-cost estimation against the cluster-render limits. Tested locally.
- `@idv7lol/simulator`: virtual vehicle model, scenarios (idle, cold start, city, highway,
  track, redline, manual shifts, drive modes, signal loss, communication failure), overrides,
  faults, latency, recording and replay. Tested locally.
- `@idv7lol/theme-compiler`: validation with readable findings, compiler from components
  to GLSL layers (10 shaders), exact renderer layer budget, SDF atlas baking from TrueType/WOFF,
  PNG codec, bundle writer and CLI. Tested locally.
- Themes: IDV7LOL Performance, Modern, Classic and a minimal example; all validate clean.
- idv7lol Studio (Tauri 2 + React): canvas editor, library, inspector, layers, palettes,
  simulator, validation, animation clips, Build & Deploy, console, welcome templates, undo/redo,
  Spanish/English, dark/light, file dialogs, PNG export. Windows NSIS installer compiled
  (unsigned).
- idv7lol MGU app (Node 8): cluster-render engine with 60 Hz easing and fail-safe, signal
  providers via the MIT kit, menu with status/diagnostics pages, compiled themes embedded,
  `mgu-repo.json` for the MGU Store. Engine tested locally against a fake renderer client;
  **not tested in a vehicle**.
- Documentation: quick start, Studio user guide (EN) and guía de usuario (ES), theme
  development, component API, generated signals reference, build, deployment, compatibility,
  troubleshooting.

### Changed

- Studio interface: the supplied idv7lol logo and its colours, one icon set instead of text symbols,
  a File menu and a shorter toolbar, resizable panels that remember their size, and drawers in small
  windows. Tested locally in a browser.

### Fixed

- A theme could relax the display's reserved zones by redeclaring one with the same id.
- Save for the car and Export bundle could use a compile older than the latest edits.
- USB packages: a shader named like an Object property (`constructor`) passed the check, and
  malformed animations were not refused. A new copy of the theme on show is now reloaded.
- The car app retried a theme that failed to build on every tick, resending its layers.
- Importing a long or large video could take gigabytes before the frames were scaled down.
- On the car, segmented arcs drew as solid bands and the first and last arc numerals were cut;
  animated pictures could bleed between frames on wide sheets.
- Hidden groups still showed on the car; group opacity and conditions now reach their components.
- The Inspector showed raw keys such as `components.gauge.arc` instead of the component's name.
- Shortcuts acted on the theme behind the welcome window; Escape now closes it.
- Two quick image imports could take the same name, and the second replaced the first.
- Animation speed in the editor now matches the car; flush edges no longer count as covering a
  reserved zone; wide rev arcs are judged by the area they paint; an animation needs one duration
  per frame.
- Simulator: manual control kept a fault scenario's dropped signals, and the signal health read
  100 % during communication loss.
- Bring to front and Send to back swapped several selected components and ignored grouped ones;
  Build & Deploy forgot the compile when switching tabs; renaming a saved piece inserted it twice;
  menus now work from the keyboard; panel splitters had a dead zone; the Inspector fields, the
  simulator and the Build tab are now in Spanish; rulers follow light mode.

- The validator skipped the factory zones when a theme did not list them in its own layout.
- Studio desktop build: HTML5 drag and drop was disabled by Tauri's `dragDropEnabled`.
- Compiled `theme.json` was written before image sizes were settled.
