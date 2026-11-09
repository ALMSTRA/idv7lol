# Project status

_Last updated: 2026-11-09 (session 1)._ Version: **0.1.0-dev** (no release yet).

## Current architecture

npm-workspaces monorepo (TypeScript, Vitest, ESLint, Prettier):

- `packages/vehicle-signals` — catalog of 60+ signals, units with conversion, vehicle profiles,
  `SignalBus` with timestamps/validity.
- `packages/theme-schema` — zod v4 schema of `theme.json` (schemaVersion 1): 15 component types
  (`rect`, `ellipse`, `line`, `arc`, `text`, `image`, `gauge.arc`, `gauge.bar`, `value.digital`,
  `indicator.gear`, `indicator.shiftlights`, `clock`, `telltale`, `status.panel`, `group`),
  bindings (unit, range, smoothing, staleness, fallback), conditions, keyframe animation clips
  with triggers, palettes with per-driving-mode selection, display profile `kombi-id7-12.3`
  with reserved zones, factories (`createComponent`, `createEmptyTheme`), parse/migrate.
- `packages/theme-engine` — Canvas2D renderer for every component, `EngineState` (binding
  evaluation, conditions, edges), `AnimationPlayer`, `RenderContext` (palette/fill/font
  resolution), hit-testing and reserved-zone overlap detection, layer-cost estimation
  against cluster-render limits (64/app).
- `packages/simulator`, `packages/theme-compiler`, `apps/mgu`, `apps/studio` — scaffolded,
  implementation in progress.

## Finished (tested locally, published)

- Repository, licence (GPL-3.0-or-later), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR
  templates, Dependabot, CI (format, lint, typecheck, tests, secret scan).
- Signal catalog, units, profiles, bus (10 tests).
- Theme schema and factories (10 tests).
- Theme engine: rendering of all component types, bindings, animations, geometry, cost (15 tests).
- Research of the reference projects, condensed in `docs/architecture/RENDERER.md` and
  `docs/architecture/ARCHITECTURE.md`.

## Pending (ordered)

1. **Simulator** (`packages/simulator`): virtual vehicle model, scenarios, recording/replay,
   signal-loss and communication-failure modes.
2. **Theme compiler** (`packages/theme-compiler`): validation (schema, signals vs profile,
   reserved zones, layer budget, palette tokens, fonts), GLSL piece generation per component,
   SDF font atlas baking, runtime bundle output, CLI.
3. **Bundled themes**: Performance, Modern, Classic (editable, bound to simulated values).
4. **MGU app** (`apps/mgu`): Node 8 runtime, cluster-render client (MPL-2.0 copy), SOME/IP
   signal providers, theme loader, menu (activate/deactivate/theme/palette/info/diagnostics),
   fail-safe (drop layers when data is stale), `app.json`, `mgu-repo.json`.
5. **Studio MVP** (`apps/studio`): Tauri 2 + React; canvas (zoom/pan/select/drag/resize/
   rotate/snap/guides), library, inspector, layers, save/open, preview, simulator panel,
   validation panel, i18n es/en, dark/light.
6. Advanced Studio: timeline, presets library, palette editor, undo/redo, assistants.
7. Diagnostics: event console, compile/shader errors, signal health, reports.
8. Build & release: NSIS installer, CI Windows build, releases, installation guide.

## Known bugs / caveats

- The Canvas2D preview is not the RAMSES renderer: anti-aliasing, glow and font rendering will
  differ from the car. The Studio must say so (planned "preview vs car" note).
- Display profile geometry comes from the Cluster Layouts project, not yet verified by idv7lol
  on a car (`verified: false`).
- `value.digital` `tabular` digits are not applied in the Canvas2D preview (SDF text on the
  car uses fixed advances anyway).

## Compatibility

- Target: iDrive 7 (MGU) with `cluster-render` ≥ 0.4.2 installed via MGU Store; Node 8 on the
  head unit. Development car: iDrive 7 MGU, I-step 20w44.1-1-3 (identifier of the head-unit
  software, **not** a renderer version). Nothing tested in a vehicle yet.

## Important decisions

- Own declarative theme format; the compiler maps it to cluster-render effect layers.
- zod 4 with `.prefault({})` for nested defaults; types inferred from schemas.
- Canvas2D engine shared by Studio canvas, simulator and PNG export; WebGL shader preview is a
  later milestone.
- Fonts: Barlow Semi Condensed / Barlow Condensed (SIL OFL 1.1) to match what the reference
  renderer bakes; the Studio will bundle them.
- Studio stack: Tauri 2 + React 19 + TypeScript + Vite; zustand for state; no telemetry.

## Development commands

See `CLAUDE.md`. Tests: `npm test` (35 passing).

## Next milestone

Milestone 5 (Simulator) and 4 (Compiler) are being done before the MGU app because the app
embeds the compiler output; then Milestone 2 (MGU runtime) and 3 (Studio MVP).
