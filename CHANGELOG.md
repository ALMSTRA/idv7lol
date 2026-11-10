# Changelog

All notable changes to idv7lol are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Status words used below: **developed** (code exists), **tested locally** (automated tests or a
PC preview), **compiled** (artifacts built), **published** (on GitHub), **tested in vehicle**
(confirmed on a car). They are not interchangeable.

## [Unreleased]

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
