# idv7lol MGU app

The app that runs on the BMW iDrive 7 head unit and draws a compiled idv7lol theme on the
instrument cluster through the `cluster-render` service. The MGU Store builds it from this
repository: `mgu-repo.json` points it at `kit/tools/build.py idv7lol`. **Not yet tested in a
vehicle.**

| File                                                       | Role                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `app.json`                                                 | manifest for the kit: identity, SOME/IP signals, screen, settings, scaling, `requires`          |
| `main.js`                                                  | app entry (`kit/mgu.js`): settings, buttons, status/diagnostics pages, wires engine and vehicle |
| `engine.js`                                                | turns a compiled theme into cluster-render layers; 60 Hz easing, 30 Hz texts/colours, fail-safe |
| `vehicle.js`                                               | the car's signals as catalog ids (kit `Car` + extra SOME/IP fields)                             |
| `signals.js`                                               | `SignalStore` and BMW enum decoders (drive mode, gear)                                          |
| `text.js`                                                  | glyph layout and number/clock formatting for the SDF text layers                                |
| `conditions.js`, `units.js`                                | condition evaluation and unit conversion (mirror the TypeScript packages)                       |
| `cluster_render_client.js`                                 | the renderer client, MPL-2.0, copied verbatim from robertnisipeanu/idrive-apps                  |
| `theme_*.js`, `themes_index.js`, `font_*.wad`, `font_*.js` | **generated** by `tools/build/build-mgu-themes.ts`                                              |
| `engine.test.ts`                                           | Vitest tests against a fake client (desktop only)                                               |
| `package.json`                                             | marks the folder CommonJS for local tests; not used on the unit                                 |

Runtime constraints: Node 8 (CommonJS, ES2017 syntax, builtins + `./kit/*` only). ESLint parses
this folder with `ecmaVersion: 2017`.

Controls on the car: Show on the cluster (off by default), Next theme, Palette and Diagnostics
(status, signals, renderer, about), plus the Settings screen the kit builds (show, theme,
palette, start-up sweep, clock UTC offset, demo data).

Safety: the layout exists only while it is enabled and car data is live; it is dropped when data
goes stale (3 s + 1.5 s grace), when the app stops or when the render service dies. Factory
telltales and pop-ups stay on top. Nothing is written to the vehicle.
