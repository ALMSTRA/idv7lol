# Project status

_Last updated: 2026-11-09._ Version: **0.1.0-dev** (no release tag yet).

Status words: **developed** (code exists), **tested locally** (automated tests or PC preview),
**compiled** (artifacts built), **published** (on GitHub), **tested in vehicle**.

## Where things stand

| Area                                                                                                                                                             | Status                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository, licence, policies, templates, CI (lint, typecheck, tests, theme validation, secret scan, Windows installer job)                                      | published                                                                                                                                        |
| `@idv7lol/vehicle-signals`: 61 signals, units, 5 vehicle profiles, SignalBus                                                                                     | tested locally (10 tests), published                                                                                                             |
| `@idv7lol/theme-schema`: schema v1, 15 component types, bindings, conditions, animations, palettes, display profile with reserved zones                          | tested locally (10 tests), published                                                                                                             |
| `@idv7lol/theme-engine`: Canvas2D renderer, bindings/smoothing/staleness, animation player, hit testing, zone overlaps, layer cost                               | tested locally (15 tests), published                                                                                                             |
| `@idv7lol/simulator`: vehicle model, scenarios, faults, recording/replay                                                                                         | tested locally (13 tests), published                                                                                                             |
| `@idv7lol/theme-compiler`: validation, GLSL piece compiler (10 shaders), SDF font baking, PNG codec, CLI                                                         | tested locally (17 tests), published                                                                                                             |
| Themes Performance (28 layers), Modern (39), Classic (29), example minimal (5)                                                                                   | validated, compiled into the app, published                                                                                                      |
| idv7lol Studio (Tauri 2 + React): canvas, library, inspector, layers, palettes, simulator, validation, timeline, build & deploy, console, i18n es/en, dark/light | developed, tested locally in the browser and as the desktop build; installer **compiled** (`idv7lol Studio_0.1.0_x64-setup.exe`, unsigned)       |
| idv7lol MGU app (Node 8): engine, signals, menu, diagnostics, kit (MIT) + cluster-render client (MPL-2.0), `mgu-repo.json`                                       | developed; engine tested locally against a fake client (6 tests); kit staging verified with `build.py --preview-only`; **not tested in vehicle** |
| Documentation (EN) + Spanish user guide                                                                                                                          | published                                                                                                                                        |

**Nothing has been tested in a vehicle.** The first on-car run must be done parked, by someone
with SSH access to the head unit, following `docs/user/DEPLOYMENT.md`.

## Architecture (short)

npm-workspaces monorepo. `packages/*` are TypeScript libraries shared by the Studio
(`apps/studio`, Tauri 2 + React 19 + Vite) and used by the compiler to produce the car runtime's
data. `apps/idv7lol` is the CommonJS Node 8 app for the head unit; it loads
`theme_<id>.js` modules (compiled themes: pieces with GLSL shaders, uniforms, palette colours and
dynamics) and the `font_sans.wad` SDF atlas, and drives `cluster-render`'s `panel` target.
`kit/` is the MIT app kit from cauliflowermossgrape/idrive7-apps, vendored so the MGU Store can
build the app on the unit. Details: `docs/architecture/ARCHITECTURE.md`, `RENDERER.md`.

## Images (added 2026-11-09)

Import (button, drag and drop, paste), embedded PNG assets, full-window non-destructive image editor,
baking in the compiler and image layers in the car runtime: developed and tested locally (browser and
fake renderer client). **Image layers have not been tested in a vehicle.**

## Animated pictures, interface and web analysis (added 2026-11-09)

GIF, animated WebP, APNG and short videos import as sprite sheets, play in the Studio and compile to
one RGBA atlas that the renderer loops through a stepped `u_frame` animation: developed and tested
locally (browser import and compile, and a fake renderer client). The `sprite` shader and the
renderer-side animation **have not been tested in a vehicle.** At most 15 animations fit, because the
renderer allows 16 assets per client and text uses one.

The interface now uses the project logo, one icon set, a File menu, resizable panels and drawers in
small windows: tested locally in a browser.

## Community templates (added 2026-11-09)

`themes/community/` holds hand conversions of the seven Cluster Layouts by eroobeeroo
(GPL-3.0-or-later), offered as optional templates in the Studio. All seven pass validation with no
errors or warnings and compile. They are not bundled into the car app, and their differences from the
originals are listed in `themes/community/README.md`. **Not tested in a vehicle.** The installer was
rebuilt with this work (`idv7lol Studio_0.1.0_x64-setup.exe`, unsigned).

## Themes from a USB stick (added 2026-11-09)

Studio button, `.idv7pkg` package format and car app 0.2.0 import from `/media/<label>`: developed and
tested locally (unit tests on fake sticks, and the three bundled themes plus a community one packaged
and accepted). **Not tested in a vehicle.** The first car test must confirm that the app can read a
stick, that the new button appears, and that an installed theme draws like a built-in one.

## Pending (ordered)

1. **First vehicle test** of the MGU app (maintainer with SSH). Confirm: install from the Store,
   layout up/down, telltales on top, deactivate restores the factory cluster, shader compile on
   the unit's libramses, bandwidth, the three themes. Record in `COMPATIBILITY.md`.
2. Map more signals on the car: fuel level/range (`KombiIF`, member-name discovery), 12 V
   battery, cruise, lights, hybrid values (shared tmpfs from eDrive Live as Cluster Layouts does).
3. Theme upload path so Studio exports can be installed without rebuilding the app (e.g. the app
   reading `data/themes/*.json` placed by a USB import or a future Store feature).
4. Studio: multi-select resize, nested group editing, inline text editing, custom component
   presets library (save/load), WebGL preview using the compiler's own shaders, PNG export of
   scenario sequences, project folders with assets (images).
5. Car runtime: opacity animations (needs a `u_alpha` in shaders), conditional transform clips,
   custom telltale icons, image layers upload path, `budget` event handling (lower rates).
6. Diagnostics: export report from Studio; QR/USB log export on the car (Cluster Layouts style).
7. Release v0.1.0: tag, Studio installer as release asset, screenshots in README.

## Known bugs / caveats

- Car: shift lights with `glow` lay out over the grown layer (the `_inset` static is not used by the
  shader), so they sit slightly wider than in the preview.
- Car: every text piece uses the theme's first font family; a second family (Classic's `condensed`
  clock) falls back to it.
- Image background removal is by color across the whole picture, not by subject; the brush fixes the rest.
- The preview is not the car: Canvas2D vs RAMSES shaders (anti-aliasing, glow, text). Gradients use two
  stops on the car; radial gradients linear; shadows, dashes, tint, group clip not on car.
- Display profile geometry comes from Cluster Layouts (`verified: false` until our own test).
- Studio: the inspector edits one component at a time (multi-select supports common fields and
  transforms only); the condition editor handles a single comparison (complex trees are kept
  but shown as "edit in JSON").
- `value.digital` tabular digits are not applied in the Canvas2D preview.
- Development mode (`npm run dev:studio`, no Tauri): Save downloads a file and bundle export
  downloads separate files.
- The Tauri installer is unsigned (no certificate).

## Compatibility

iDrive 7 (MGU) only; cluster-render ≥ 0.4.2; Node 8 on the unit. Development car: iDrive 7,
I-step `20w44.1-1-3` (a software identifier, not a renderer version). See
`docs/compatibility/COMPATIBILITY.md`.

## Important decisions

- Own declarative theme format (schemaVersion 1); the compiler maps it to one small GLSL layer
  per piece (the proven safe pattern; one huge shader restarted a KOMBI upstream).
- zod 4 with `.prefault({})` for nested defaults; types inferred from schemas.
- Text on the car via an R8 SDF atlas (Barlow, OFL) baked by our own TrueType-to-SDF pipeline;
  digits first in the glyph order so shaders can draw numerals.
- Studio: Tauri 2 + React 19 + Vite 8 + zustand; no telemetry; fonts bundled from @fontsource.
- The MGU app embeds compiled themes as JS modules + `.wad` atlas (kit ships top-level files);
  generated files are committed because the Store builds on the unit.

## Development commands

See [developer/BUILD.md](developer/BUILD.md) and [CONTRIBUTING.md](../CONTRIBUTING.md). Tests: `npm test` (89 passing).

## Next milestone

Vehicle test (pending item 1) and the remaining signal providers (item 2); then tag v0.1.0.
