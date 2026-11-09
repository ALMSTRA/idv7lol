# idv7lol

**Open-source custom digital cluster platform for BMW iDrive 7 (MGU), with a visual theme
editor for Windows.**

idv7lol lets you design your own instrument-cluster layout on a PC, simulate it with live
vehicle data, validate it against the real limits of the cluster renderer, and build a package
that the [MGU Store](https://github.com/robertnisipeanu/mgu-store) can install on the car. The
car keeps its factory instrumentation whenever idv7lol is off.

> **Disclaimer.** idv7lol is an unofficial, experimental hobby project. It is not affiliated
> with, endorsed by or supported by BMW AG. Changing what your instrument cluster shows can
> distract you and can void warranties or break local rules. Use it parked or on a closed
> course, keep the factory warnings in view, and read [SECURITY.md](SECURITY.md).

|         |                                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Licence | GPL-3.0-or-later (third-party parts keep their own licences, see `THIRD_PARTY_NOTICES.md`)                                              |
| Target  | BMW iDrive 7 / MGU head units with the open-source `cluster-render` service                                                             |
| Desktop | Windows 10/11 x64 (idv7lol Studio, Tauri 2 + React)                                                                                     |
| Status  | **0.1.0 in development.** Everything runs on a PC; nothing is tested in a car yet. See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) |

## What is in the box

- **idv7lol Studio** (Windows): drag-and-drop editor with canvas, component library, inspector,
  layers, palettes, animation timeline, simulator, validation and Build & Deploy.
- **Theme engine**: a platform-neutral renderer that draws every component from a declarative
  theme document, used by the Studio canvas and the simulator.
- **Theme compiler**: validates a theme (schema, signals, reserved zones, layer budget) and
  emits the JavaScript, shaders and font assets the MGU app runs on the car.
- **Simulator**: a virtual car with throttle, brake, gears, temperatures, driving modes, signal
  loss and recorded scenarios.
- **idv7lol MGU app**: the app that runs on the head unit, draws the active theme through
  `cluster-render`, and lets you activate, deactivate and switch themes from the iDrive menu.
- **Three themes** to start from: _Performance_, _Modern_ and _Classic_. All editable.

## Status

Status words are deliberate: **developed** (code exists), **tested locally** (automated tests
or PC preview), **compiled** (artifacts built), **published** (on GitHub), **tested in vehicle**.

| Area                                                     | Status                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Signal catalog, units, vehicle profiles                  | developed · tested locally · published                                             |
| Theme document format (schema v1)                        | developed · tested locally · published                                             |
| Theme engine (Canvas2D renderer, animations)             | developed · tested locally · published                                             |
| Simulator (vehicle model, scenarios, faults, recording)  | developed · tested locally · published                                             |
| Theme compiler → GLSL layers, SDF fonts, validation, CLI | developed · tested locally · published                                             |
| Bundled themes (Performance, Modern, Classic)            | validated · compiled into the app · published                                      |
| idv7lol Studio (Windows)                                 | developed · tested locally · installer compiled (unsigned)                         |
| idv7lol MGU app (Node 8 runtime)                         | developed · engine tested locally with a fake renderer · staged with the kit build |
| Tested in a vehicle                                      | **no** — see [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md)                      |

## Quick start (developers)

Requirements: Node.js 20+ (24 recommended), npm 10+. For the desktop app also Rust stable
(MSVC), Visual Studio Build Tools 2022 (C++ workload) and WebView2.

```bash
git clone https://github.com/ALMSTRA/idv7lol.git
```

```bash
cd idv7lol && npm install
```

```bash
npm test
```

```bash
npm run tauri:dev
```

More in [docs/QUICKSTART.md](docs/QUICKSTART.md), [docs/developer/BUILD.md](docs/developer/BUILD.md)
and the Spanish user guide [docs/user/GUIA_USUARIO_ES.md](docs/user/GUIA_USUARIO_ES.md).

## How it works, in one paragraph

A theme is a JSON document (`themes/<id>/theme.json`) listing components (gauges, bars,
readouts, gear indicator, shift lights, texts, shapes…), each bound to a catalog signal such
as `engine.rpm`, styled with palette tokens and optionally animated. The Studio edits that
document and renders it with the theme engine. The compiler turns the same document into what
the car understands: one small GLSL ES 1.00 fragment-shader layer per piece (the renderer
allows 64 per app), a signed-distance-field glyph atlas for text, and a Node 8 runtime that
reads SOME/IP vehicle signals and streams uniforms to `cluster-render`, which hands the
scene to the cluster's own RAMSES renderer. Deactivating the app drops the layers and the
factory cluster is visible again.

## Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md) · [Renderer](docs/architecture/RENDERER.md)
- [Theme development](docs/developer/THEME_DEVELOPMENT.md) · [Component API](docs/developer/COMPONENT_API.md) · [Signals](docs/developer/SIGNALS.md)
- [Build](docs/developer/BUILD.md) · [Deployment](docs/user/DEPLOYMENT.md) · [Compatibility](docs/compatibility/COMPATIBILITY.md) · [Troubleshooting](docs/troubleshooting/TROUBLESHOOTING.md)
- [Project status](docs/PROJECT_STATUS.md) · [Changelog](CHANGELOG.md)

## Acknowledgements

idv7lol stands on the work of the iDrive 7 custom-app community:
[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) (the
app kit and GPU renderer), [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps)
(`cluster-render`) and [robertnisipeanu/mgu-store](https://github.com/robertnisipeanu/mgu-store)
(the Store), and [eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info)
(Cluster Layouts, which proved that full custom layouts work on the KOMBI). Thank you.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Questions go to GitHub Discussions; vulnerabilities to
the private security form (see [SECURITY.md](SECURITY.md)).
