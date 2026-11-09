# CLAUDE.md — permanent context for coding assistants

Read this first, then `AGENTS.md`, then `docs/PROJECT_STATUS.md`, then `git log --oneline -20`.
Do not re-audit the whole project or redo the research summarised in `docs/architecture/`.

## What this project is

idv7lol: an open-source platform to design, simulate, validate and deploy custom instrument
cluster layouts for BMW iDrive 7 (MGU) cars, plus **idv7lol Studio**, a Windows desktop editor.
Public repository: https://github.com/ALMSTRA/idv7lol (GitHub user `ALMSTRA`). Licence
GPL-3.0-or-later; copied third-party code keeps its licence (see `THIRD_PARTY_NOTICES.md`).

## Non-negotiable rules

- Never modify vehicle firmware, ECUs, odometer, speed or safety systems; never hide factory
  warnings; the runtime must always be able to deactivate and hand the cluster back.
- Never commit the BMW SDK, head-unit binaries, vsomeip configs, VINs, tokens, keys or logs
  with personal data.
- Distinguish **developed / tested locally / compiled / published / tested in vehicle**. Nothing
  in this repository has been tested in a vehicle unless `docs/PROJECT_STATUS.md` says so.
- Do not invent APIs. The renderer protocol and limits are documented in
  `docs/architecture/RENDERER.md` from the reference implementations; cite them.
- Git: one logical change per commit, conventional messages, no backup copies or `.bak` files,
  no force-push to `main`, no empty commits, push after a coherent unit passes tests.
- Keep answers short; do not re-read files without need; do not rebuild everything for a
  small change.

## Layout

```
packages/vehicle-signals  signal catalog, units, profiles, SignalBus
packages/theme-schema     zod schema v1 of theme.json, factories, parse/migrate, display profiles
packages/theme-engine     Canvas2D renderer, bindings, animations, geometry, layer cost
packages/simulator        virtual vehicle, scenarios, recording/replay
packages/theme-compiler   validate + compile themes to MGU runtime artifacts, CLI
apps/mgu                  idv7lol app for the head unit (Node 8, CommonJS, ES2017 syntax only)
apps/studio               idv7lol Studio (Tauri 2, React, TypeScript, Vite)
themes/                   bundled themes: performance, modern, classic, examples
tools/                    build/validation/development scripts
docs/                     user, developer, architecture, compatibility, troubleshooting
```

Packages import each other through `@idv7lol/*`; Vitest and Vite alias those to `src/` so no
build is needed to run tests (`vitest.config.ts`).

## Commands

- `npm install` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run format`
- `npm run themes:validate` / `npm run themes:build` (compiler CLI via tsx)
- `npm run dev:studio` (Vite only) · `npm run tauri:dev` · `npm run tauri:build`
- Run Rust/Tauri builds from PowerShell, not Git Bash (Git's `link.exe` shadows MSVC's).

## Key technical decisions

- Theme format is idv7lol's own declarative JSON (schemaVersion 1), not a renderer API. Zod 4
  schemas with `.prefault({})` for nested object defaults (`.default()` would skip nested
  defaults). Types are inferred from the schemas.
- The engine draws in local component coordinates (origin top-left of the box, anchor used for
  rotation/scale). Groups translate children. Colours are literals or `$token` palette refs.
- The car target is the `cluster-render` **panel** target (1920×720, slot 0x203): one GLSL ES
  1.00 effect layer per piece, max 64 layers per app, text through an R8 SDF glyph atlas. Values
  are eased client-side at 60 Hz; colours/texts only on change.
- Reserved zones of the KOMBI (cowl, gear bracket, eDrive box, bottom telltales, slanted glass
  corners) live in `packages/theme-schema/src/display-profiles.ts` and are enforced by the
  validator; the Studio draws them.
- Head unit runs Node 8: the MGU app is CommonJS ES2017, no optional chaining, no `??`, uses only
  `net`, `events`, `fs`, `path`.

## Where to look when asked to…

- "Crea otro cluster" → copy `themes/examples/` or a bundled theme, edit `theme.json`, run
  `npm run themes:validate`, add a preview and an entry in `docs/developer/THEME_DEVELOPMENT.md`.
- "Mejora el editor" → `apps/studio/src` (state in `store/`, canvas in `canvas/`, panels in
  `panels/`). Do not break `apps/mgu`.
- "Corrige este bug" → reproduce with a Vitest test first, fix, run the related tests, update
  `CHANGELOG.md`, commit, push.
- "Actualiza GitHub" → `git status`, run tests/lint/typecheck, commit pending work, push.
- "Continúa" → `docs/PROJECT_STATUS.md` → next milestone.
