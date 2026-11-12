# Contributing to idv7lol

Thanks for helping out. Read the ground rules first; the rest is reference.

## Ground rules

1. Safety comes first. Nothing in this repository may modify the vehicle's firmware, ECUs,
   odometer, speed or safety systems, hide factory warnings, or make the cluster restart on
   purpose. Changes that touch the runtime (`apps/idv7lol`) must keep deactivation working: turn
   the app off and the factory cluster comes back.
2. Be honest about status. Distinguish _developed_, _tested locally_, _compiled_, _published_ and
   _tested in a vehicle_. Never describe a feature as working on a car unless someone did it.
3. No proprietary material. Do not commit the BMW SDK, head-unit binaries, vsomeip
   configs, VINs, logs with personal data, tokens or keys. `.gitignore` blocks the obvious
   paths; please check anyway.
4. Original code is GPL-3.0-or-later. Code copied from other projects keeps its
   licence and header (for example the MPL-2.0 cluster-render client). Fonts and images need a
   compatible licence recorded in `THIRD_PARTY_NOTICES.md`.
5. One logical change per commit, conventional commit messages
   (`feat(studio): …`, `fix(engine): …`, `docs: …`), no backup folders or `*.bak` files, no
   force-pushes to `main`.

## Repository layout

| Path                       | What lives there                                                      |
| -------------------------- | --------------------------------------------------------------------- |
| `packages/vehicle-signals` | signal catalog, units, vehicle profiles, signal bus                   |
| `packages/theme-schema`    | the versioned theme document format (zod), factories, parsing         |
| `packages/theme-engine`    | platform-neutral Canvas2D renderer, animations, geometry, cost        |
| `packages/simulator`       | simulated vehicle, scenarios, recording and replay                    |
| `packages/theme-compiler`  | validation and compilation of themes to the MGU runtime               |
| `apps/idv7lol`             | the idv7lol app that runs on the head unit (Node 8, CommonJS)         |
| `apps/studio`              | idv7lol Studio: Tauri 2 + React desktop editor for Windows and macOS  |
| `themes/`                  | the bundled themes (Performance, Modern, Classic) and examples        |
| `tools/`                   | build, validation and development scripts                             |
| `docs/`                    | user, developer, architecture, compatibility and troubleshooting docs |

## Prerequisites

- Node.js 20 or newer (24 is used for development) and npm 10+.
- For the Studio desktop build: Rust stable (MSVC toolchain), Visual Studio Build Tools 2022
  with the C++ workload, and WebView2 (preinstalled on Windows 11).
- Python 3 for a few tooling scripts.

## Everyday commands

```bash
npm install
```

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run dev:studio
```

```bash
npm run tauri:dev
```

`npm run themes:validate` validates the bundled themes; `npm run themes:build` compiles them.

## Making a change

1. Fork and branch from `main` (`feat/<topic>` or `fix/<topic>`).
2. Add or update tests next to the code (`*.test.ts`, Vitest).
3. Run `npm test`, `npm run lint` and `npm run typecheck`.
4. Update the relevant document in `docs/` and `CHANGELOG.md` under _Unreleased_.
5. Open a pull request using the template. CI must pass. Describe how you tested, and on
   which hardware if a car was involved.

## Adding a component type

1. Add its props schema and the union member in `packages/theme-schema/src/components.ts`.
2. Add a renderer in `packages/theme-engine/src/components/` and register it in
   `components/index.ts` (including its layer estimate).
3. Add the compiler mapping in `packages/theme-compiler` (GLSL shader + uniforms).
4. Add the inspector descriptors and library entry in the Studio.
5. Document it in `docs/developer/COMPONENT_API.md`.

## Sharing a layout (no car needed)

You don't need an iDrive 7 car to design layouts. The Studio's simulator drives a theme the way
the car would, the car preview draws it with the car app's own shaders, and the validator checks
it against the renderer's limits and the areas reserved for factory warnings.

1. Design it in the Studio. Fix everything the **Validation** tab marks as an error.
2. Click an empty part of the canvas and fill in **Theme details** in the Inspector: a name, a
   short id of your own, your name as author and a description.
3. **File > Share with the community** saves the theme and a picture of it and opens the
   [theme form](https://github.com/ALMSTRA/idv7lol/issues/new?template=theme_submission.yml).
   Attach both files there.

Shared layouts go to `themes/community/<id>/` and show up in the Studio's welcome window with
your credit. They are published under GPL-3.0-or-later, so only use pictures and logos you are
allowed to share. Each one is tried on a car before it's called car-tested.

## Adding a theme

See `docs/developer/THEME_DEVELOPMENT.md`. Themes live in `themes/<id>/theme.json` and are
validated in CI.

## Questions

Open a GitHub Discussion. For security matters see [SECURITY.md](SECURITY.md).
