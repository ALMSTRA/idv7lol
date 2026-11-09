# Architecture

idv7lol is one repository with two runtimes and a shared core.

```
                 ┌──────────────────────── shared core (TypeScript) ────────────────────────┐
                 │ vehicle-signals  →  theme-schema  →  theme-engine  →  theme-compiler     │
                 │        ▲                                   ▲                             │
                 │        └──────────── simulator ────────────┘                             │
                 └───────────────┬──────────────────────────────────┬──────────────────────┘
                                 │                                  │
                     apps/studio (Tauri 2 + React)         apps/mgu (Node 8 on the car)
                     canvas · inspector · layers           theme loader · SOME/IP signals
                     simulator · validation · build        cluster-render client · menu
```

## Shared core

| Package           | Responsibility                                                                                                                                                                                                                         | Depends on                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `vehicle-signals` | What a car can tell us: signal ids, units, ranges, availability, vehicle profiles; the `SignalBus` that carries live values with timestamps and validity                                                                               | —                                           |
| `theme-schema`    | The theme document (`schemaVersion` 1): components, bindings, conditions, animations, palettes, fonts, assets, display profiles with reserved zones; factories; parsing with readable errors; migrations                               | vehicle-signals, zod                        |
| `theme-engine`    | Draws a theme on any Canvas2D-like context; evaluates bindings (unit conversion, smoothing, staleness, fallbacks), conditions and animation triggers; geometry for hit-testing and reserved-zone checks; layer-cost estimation         | theme-schema, vehicle-signals               |
| `simulator`       | A virtual vehicle (throttle, brake, gearbox, thermals, fuel, boost, driving modes) that writes into a `SignalBus`; scenarios; recording and replay; fault injection (signal loss, communication failure)                               | vehicle-signals, theme-schema               |
| `theme-compiler`  | Validates a theme (schema, signals vs profile, palette tokens, reserved zones, layer budget, fonts) and compiles it into runtime artifacts: piece list with GLSL ES 1.00 shaders and uniforms, SDF font atlas, manifest fragments; CLI | theme-schema, theme-engine, vehicle-signals |

The core has no DOM or Node-specific dependencies except in the compiler CLI, so the same code
runs in the Studio (browser context inside Tauri), in Node tests and in tooling.

## idv7lol Studio (`apps/studio`)

- **Tauri 2** shell (Rust) for the window, file dialogs, file system, preferences and the
  installer; **React 19 + TypeScript + Vite** for the UI; **zustand** for state with an
  undo/redo command history; Canvas2D via the theme engine for the editor canvas and the
  simulator view.
- Panels: top bar (file, undo/redo, preview, simulate, validate, build, publish), library
  (drag components), canvas (zoom, pan, multi-select, drag, resize, rotate, align, distribute,
  group, lock, hide, duplicate, snap, guides, rulers, reserved zones), inspector (bound to the
  schema), layers (order, rename, lock, hide, cost), timeline (keyframes), simulator, validation
  and diagnostics console, Build & Deploy.
- Persistence: `.idv7lol` project folders (theme.json + assets), recent files, preferences in
  the app data directory. No network required; no telemetry.
- i18n: Spanish and English dictionaries, switchable at runtime. Dark and light themes.

## idv7lol MGU app (`apps/mgu`)

- A standard OAP app (`app.json`, `main.js`) built from source by the MGU Store, with its own
  identifiers (never overwriting Cluster Layouts). Runs on **Node 8**: CommonJS, ES2017
  syntax, modules `net`, `events`, `fs`, `path` only.
- Pieces: `cluster_render_client.js` (MPL-2.0, copied), `signals/` (SOME/IP providers with
  scaling and availability detection), `engine.js` (piece list → layers, 60 Hz easing, on-change
  uniforms, fail-safe), `themes/` (compiler output bundled per theme), `menu.js` (activate,
  deactivate, theme, palette, info, versions, diagnostics, dependencies, reset).
- Safety: layers only while active and data is live; deactivate drops every layer; the factory
  cluster is untouched underneath; no writes to the vehicle.

## Data flow of one frame (car)

1. SOME/IP notifications update the signal store (scaled to catalog units).
2. Every 16.7 ms the engine eases numeric uniforms (`u_value`) towards targets and sends only
   the ones that moved more than the deadband.
3. Texts and colours are recomputed at ≤ 30 Hz and sent only when they change.
4. If a bound signal is stale for 3 s (+1.5 s grace) the affected piece shows its fallback;
   if every signal is stale the layout is dropped and the stock cluster returns.

## Data flow of one frame (Studio / simulator)

1. The simulator steps its vehicle model and writes into the `SignalBus`.
2. `ThemeEngine.render` evaluates bindings and animations and draws every component with the
   active palette (chosen by driving mode or the user).
3. Overlays (reserved zones, selection, guides) are drawn by the Studio on top.

## Extension points

- New component type: schema → engine renderer (+ layer estimate) → compiler mapping → Studio
  inspector descriptors and library entry → docs.
- New vehicle profile or signal: `vehicle-signals` catalog/profiles → runtime provider mapping.
- New theme: `themes/<id>/theme.json` (+ assets) validated in CI.
- Future: plugin-style component packs, community theme library, WebGL preview using the
  compiler's own shaders, shader editor.
