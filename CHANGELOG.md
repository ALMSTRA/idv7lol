# Changelog

All notable changes to idv7lol are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Status words used below: **developed** (code exists), **tested locally** (automated tests or a
PC preview), **compiled** (artifacts built), **published** (on GitHub), **tested in vehicle**
(confirmed on a car). They are not interchangeable.

## [Unreleased]

### Changed

- The car app is version 0.2.7, so the MGU Store's Releases channel offers Volt Runner, the
  fuel readings, the needle fix, the bottom strip fix, ETC2 animations and the fixes taken from
  upstream below as an update. The `catalog` release holds the new package.
- The car app requires cluster-render 0.5.9 or newer (was 0.5.2), so the Store brings its fixes
  along: a scene the cluster accepted and then never mapped (a cluster still starting, or a lock
  while parked) is asked for again instead of leaving the panel blank (0.5.5, 0.5.6), and a layer
  whose atlas the renderer refused lets go of the cluster, which goes back to its own gauges,
  instead of holding an empty panel (0.5.9). See `docs/architecture/RENDERER.md`.

### Added

- **Volt Runner**, a new bright yellow theme built around an animation: a running lightning bolt
  (original pixel art) in the middle that runs faster the faster the car goes, the speed big on
  the left, the gear on the right, engine speed as the road under the runner, and fuel, oil and
  water along the bottom. Volt, Dusk and Sport palettes. Swap the runner for your own GIF in the
  Studio. Tested locally (Studio and car preview); not tested in a vehicle.
- Animated pictures can follow a signal: `speedFrom` on an image plays it faster as the signal
  rises (for example `vehicle.speed`), in the Studio and on the car, where the app restarts the
  renderer's animation at the new speed only when it changes by a step. In the Inspector under
  **Faster with**. Tested locally; not tested in a vehicle.

- The car app reads the fuel level, the fuel range and the odometer, and the reserve warning
  (`fuel.level`, `fuel.volume`, `vehicle.range`, `vehicle.odometer`, `fuel.low`), from the
  cluster's `KombiIF.statusRangeTankStatus`, the signal other iDrive 7 apps read. The cluster gives
  litres, so the percentage comes from the engine unit's OBD-II PID 2F while it answers, read over
  the kit's read-only diagnostic link (one request every 10 s, every 5 min once it hasn't answered
  3 times). Otherwise it is litres over the tank size: the new setting _Fuel tank size_, else the
  size worked out from the litres and the engine unit's percentage, else the largest level that
  held, never less than 65 l so a half tank doesn't read full. What it learns is kept in the app's
  data folder (`fuel.json`), and the app's page says where the level comes from. Both interfaces
  are optional: a car without them installs as before, with dashes. Tested locally (unit tests,
  and `vehicle.js` run against a fake car); the cluster's values were read on a G05 X5 xDrive45e
  with a full 69 l tank (68 l); not tested in a vehicle with this code.

- Animations go to the car as ETC2 textures (`etc2rgba`, cluster-render 0.5.9): a quarter of
  the bytes of RGBA8, sent once and charged once against the renderer's pixel memory instead of
  twice, so an animation costs an eighth of the memory it did. Volt Runner's runner atlas goes from
  4.6 MB to 1.2 MB. The theme compiler encodes the atlas (`packages/theme-compiler/src/etc2.ts`,
  frames in whole 4×4 blocks, up to 2048×1024), the car app sends it as an `etc2rgba` asset and,
  if a renderer refuses the texture, decodes it and sends it again as RGBA8. USB packages carry
  the atlas as `images/<id>.etc2`; the Studio's car preview decodes it to show what the car draws.
  An older car app refuses a USB package with an ETC2 animation (it reads it as a bad file name).
  Tested locally (unit tests; the encoder's blocks decode byte for byte the same with
  cluster-render's reference decoder; the car preview); not tested in a vehicle.

### Fixed

- The car app requires the Store's deploy tool 0.8.12, which removes an app's code cache on
  install so an update runs the new code (mgu-store #261, the Store pins it the same way). The app
  folder has its `icon.png`, so the Branch channel shows the icon before install and after removal
  (mgu-store #241); it is the icon the kit made, unchanged. The install and troubleshooting guides
  cover the Store's safe mode, the tile repair, removing `cluster-render`, I-Step updates, USB
  sticks and the knob.
- The shader lint counts uniform vectors as GLSL ES does and refuses more than 48, and refuses a
  loop left with `break`. A shader of about 70 vectors restarted a G21's KOMBI (the MIT kit's
  Redline), and another cluster project suspected an early exit from a loop around texture reads of
  the same. None of idv7lol's shaders does either; the most is the shift lights' 39, drawn on a car.
- Under a layout cut at the bottom strip, a black band (to y 662, to 658 over the strip's drive
  mode and gear at x 1196–1424) hides the factory dials' lower edges and the separator line, which
  showed there in photos of a car (another cluster project, a G05). One layer with a small shader
  of its own, made only when the layout leaves room for it.
- The start-up sweep's animations are stopped once it is over and the gauges' values sent again. A
  finished animation holds its last key and plays again whenever cluster-render publishes the scene
  again (its PROTOCOL.md), which 0.5.5 and later do more often; a steady gauge (fuel, a temperature)
  could have dropped back to zero with nothing sent to correct it.
- The layout keeps off the cluster while the car is off or switching on and off: none with the
  car parked, in standby or with the ignition off (vehicle state 5 or lower), it goes when drive
  readiness ends (12), and none new goes up while drive readiness starts (8) or the car sends a
  state it can't name. A panel mapped while the KOMBI switches on or off counts against
  cluster-render's mapping guard, which turns the target off for good after two strikes (the kit's
  Redline holds its layer back the same way, issue #141 there). Cars that send no state work as
  before.
- The layout goes up only once it has been wanted for 1.2 s without a break, so services coming up
  one by one at start don't put it up and down (seen by another cluster project on cars). Taking it
  down stays immediate.
- Picking the theme or the bottom strip setting it already has no longer rebuilds the layout (the
  kit tells every setting it is given, and a rebuild flashes the cluster).
- Each change of the renderer target (shown, waiting, a speech dialog, the guard) goes to the log.
- The engine unit's fuel percentage came back only after the app restarted once the unit had
  missed five times in a row: the kit's read-only link skips such a unit until it is woken, and the
  5-minute retries never woke it. Each retry and the car coming on now wake it. A vehicle state the
  car can't name (15, no value) no longer keeps the last one: activity decides, so a car switching
  off isn't asked. `fuel.json` is written whole (a temp file renamed over it).
- Boost from the car's sport display (`FES.displayBoostPressure`) is read in hundredths of a bar.
  It was read in tenths, ten times the real figure: another cluster project fixed the same after a
  user's photos against the engine unit, and the MIT kit's own apps read it so. 255 is no value.
- The drive mode is read by BMW's name or wire number (`actualValueModeDrivingExperience`, as the
  kit's apps read it): Sport+ (`SPORT_EXPERT`, 2) was shown as Sport, numbers weren't read, and a
  plug-in hybrid's modes now map to the catalog (Sport+ and Boost to Sport, Hybrid and Electric to
  Comfort, which has no hybrid mode). 0 and 61–63 carry no mode.
- Speeds over 400 km/h, which a car sends while it wakes, are no value (as the kit's eDrive app
  reads them); they pegged the speed needle and counted as driving.
- Animations didn't show on the car in 0.2.5: the car app's copy of the renderer client predated
  cluster-render 0.5.9's ETC2 support, so it sized an `etc2rgba` atlas at four bytes a pixel and
  didn't send it (Volt Runner's runner stayed blank, a 2048×1024 atlas was refused). The client is
  copied again from cluster-render, a test now runs the real client with ETC2 atlases, and the car
  app logs when the client doesn't take an atlas. Tested locally; not tested in a vehicle.
- Needles turn the way their scale runs on the car and in the Studio's car preview. The needle
  shader built its rotation the wrong way round, so a needle sent to angle _a_ was drawn at _−a_:
  mirrored top to bottom against its ticks, its band and the editor's own drawing. A dial at zero
  pointed to the upper left instead of the lower left; in Performance the boost needle sat as far
  below the horizontal as the end of the arc was above it. `apps/idv7lol/shaders.js` and the two
  bundled themes with needles (Classic, Performance) are regenerated. Tested locally (a unit test
  on the shader's matrix, and the car preview); not tested in a vehicle.
- In the editor, the `turn-left` and `turn-right` telltales point the way they are named. They
  were swapped there; the car's shader already drew them right. Tested locally.
- Black boxes over the layout that stayed until the head unit restarted, seen on a G82 M4
  (issue #7). Some KOMBIs, M cars among them, leave them over a full-screen layout that covers the
  cluster's own bottom strip; cluster projects tested on cars found that a layout ending at y 646
  leaves none. The car app now cuts every layer at y 646 by default, keeping its drawing as it was
  (a new `u_keep` uniform in the shaders; image layers send only the rows above), so the car's own
  strip shows below the layout. The new setting **Bottom strip** (_The car's own_ / _Covered by the
  layout_) brings the old behaviour back. The Studio's car preview cuts the same way, the validator
  warns about readings below y 646, and the texts of Supercar Track and Track that reached below
  it sit a few pixels higher. Tested locally (unit tests and the car preview); not tested in a
  vehicle.
- The car app asks the engine unit for the fuel percentage only while the car is switched on
  (BMW's vehicle state `VehicleCondition`: ignition on, ready to drive, driving or switching off),
  or, before the car has told its state, within 3 minutes of moving or running. It asked every 10 s
  whenever the car's signals were there, parked too. Another iDrive 7 project found that
  diagnostic requests to a locked car go through its gateway, keep its networks awake, and leave
  faults ("no sleep in parking state", a battery management warning). The interface is optional
  like the others. Tested locally (unit tests, and `vehicle.js` run against a fake car: no request
  while parked, requests once on); not tested in a vehicle.
- The image memory check counts pictures and glyph atlases twice, as cluster-render charges image
  layers and uncompressed assets against its 16 MiB of pixel memory (its `PROTOCOL.md`, "Choosing a
  pixel format"). A theme that passed while needing more than the renderer has is now refused, and
  the warning starts earlier. No bundled theme is affected. Tested locally.
- The MIT app kit's runtime (`kit/runtime`) is refreshed from cauliflowermossgrape/idrive7-apps.
  Settings and other small files are written whole (a temp file renamed over the old one), so a power
  cut while saving no longer leaves a half-written `settings.json`. An app that comes to the front
  without the iDrive controller (the Store's renderer held it while the app restarted after an
  update) connects to the renderer again, up to three times, so the controller reaches it. The
  app page's drawn frames go to RAM instead of the head unit's flash, with a fallback to the old
  folder. The vehicle state the kit reads is logged once per new value. The CI's Node 8 check now
  compiles every kit runtime file. Tested locally (Node 8.16.2); not tested in a vehicle.

## [0.2.0-beta.3] - 2026-11-12

Third pre-release: idv7lol Studio in three more languages, and the car app on the Store's Releases
channel.

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
