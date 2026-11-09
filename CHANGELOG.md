# Changelog

All notable changes to idv7lol are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Status words used below: **developed** (code exists), **tested locally** (automated tests or a
PC preview), **compiled** (artifacts built), **published** (on GitHub), **tested in vehicle**
(confirmed on a car). They are not interchangeable.

## [Unreleased]

### Added

- Images in the Studio: import from the computer by button, drag and drop or paste; assets embedded
  in the theme; full-window non-destructive editor with adjustments, looks, crop, rotate and flip,
  background removal, erase/restore brush, effects, compare, undo and a live view on the cluster.
- Compiler bakes each image's edits at its layer size and validates renderer pixel memory.
- MGU app draws image layers (tested locally against a fake renderer; not tested in a vehicle).
- Animated pictures: GIF, animated WebP, APNG and short videos (up to 12 s, 15 fps, 120 frames, no
  sound) import as a sprite sheet, play in the editor and compile to one atlas that the renderer
  loops by itself, with nothing sent per frame. Tested locally; not tested in a vehicle.

### Fixed

- Studio desktop build: HTML5 drag and drop was disabled by Tauri's `dragDropEnabled`.
- Compiled `theme.json` was written before image sizes were settled.

- `@idv7lol/simulator`: virtual vehicle model, scenarios (idle, cold start, city, highway,
  track, redline, manual shifts, drive modes, signal loss, communication failure), overrides,
  faults, latency, recording and replay. Tested locally.
- `@idv7lol/theme-compiler`: validation with readable findings, component → GLSL layer
  compiler (10 shaders), exact renderer layer budget, TrueType/WOFF → SDF atlas baking, PNG
  codec, bundle writer and CLI. Tested locally.
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
