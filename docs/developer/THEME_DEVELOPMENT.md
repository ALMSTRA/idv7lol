# Theme development

A theme is a JSON document (`theme.json`, or `.idv7theme` when saved from the Studio) that the
Studio edits and the compiler turns into cluster layers. The exact field list is in the zod schemas of
`packages/theme-schema/src/` (`theme.ts`, `components.ts`, `bindings.ts`, `animation.ts`).

## Anatomy

```json
{
  "schemaVersion": 1,
  "id": "my-cluster",
  "name": "My cluster",
  "version": "0.1.0",
  "vehicleProfile": "turbo-ice",
  "target": { "display": "kombi-id7-12.3" },
  "layout": { "width": 1920, "height": 720, "background": "$background" },
  "palettes": {
    "night": {
      "name": "Night",
      "colors": {
        "background": "#000000",
        "surface": "#15181d",
        "text": "#f4f6f8",
        "text-muted": "#8d96a3",
        "accent": "#3f8cff",
        "track": "#262b33",
        "success": "#3ddc84",
        "warning": "#ffb020",
        "danger": "#ff3b3b"
      }
    }
  },
  "palette": { "default": "night", "byDriveMode": { "SPORT": "sport" } },
  "fonts": { "default": { "family": "sans" } },
  "animations": {},
  "components": []
}
```

- `id` is kebab-case and unique; it names the compiled module on the car.
- `vehicleProfile`: `generic-ice`, `turbo-ice`, `turbo-ice-sport`, `phev`, `bev` (see
  [SIGNALS.md](SIGNALS.md)). The validator warns when a component binds a signal the profile
  lacks.
- `layout.reservedZones` is optional; when omitted the Studio fills it from the display profile.
  The validator always checks the display profile's zones as well as any listed in the theme.
- Every palette must define the nine required tokens. Components reference colours as `$token`
  or literal `#rrggbb`.

## Components

Components are drawn in array order (later = on top). Common fields: `id`, `type`, `x`, `y`,
`width`, `height`, `rotation`, `opacity`, `visible`, `locked`, `anchor`, `binding`,
`visibleWhen`, `animations`, `props`. Types and their props are documented in
[COMPONENT_API.md](COMPONENT_API.md). Defaults are applied on load, so you only write what
differs; `createComponent(type)` in `@idv7lol/theme-schema` produces a complete component.

### Bindings

```json
"binding": { "signal": "engine.rpm", "min": 0, "max": 8000, "smoothing": 0.06, "fallback": "dash" }
```

- `signal`: a catalog id. `min`/`max` default to the catalog range (in the display unit).
- `unit`: display unit of the same dimension (`mph`, `fahrenheit`, `psi`…).
- `scale`/`offset`: applied after conversion; `clamp` (default true) keeps the value in range.
- `smoothing`: time constant in seconds; the Studio eases values, the car eases uniforms at
  60 Hz with its own constant.
- `fallback`: what to show when the signal is missing or stale: `dash`, `hide`, `last`, `zero`.

### Conditions

`visibleWhen` and animation triggers accept `{ "signal", "op", "value", "value2" }` with ops
`eq neq gt gte lt lte between truthy falsy stale`, and combinations `{ "all": [...] }`,
`{ "any": [...] }`, `{ "not": ... }`.

### Animations

Clips live in `animations` and are referenced from components:

```json
"animations": { "fade-in": { "duration": 700, "easing": "ease-out-cubic", "tracks": [ { "property": "opacity", "keyframes": [ { "t": 0, "value": 0 }, { "t": 1, "value": 1 } ] } ] } }
```

Triggers: `load`, `always`, `while` + condition, `rising`/`falling` + condition, `change` +
signal. Tracks may address `x y width height rotation opacity scale` or `props.<path>` (for
example `props.style.color`). On the car only rotation/scale tracks with `load`/`always`
triggers and colour tracks are played; the validator and the Studio tell you.

### Animated pictures that follow a signal

An image whose asset has an `animation` (a GIF, a short video or a sprite sheet) plays at its
`speed`. With `speedFrom` it plays faster as a signal rises, in steps of 0.25:

```json
"props": { "asset": "runner", "speed": 0.6, "speedFrom": { "signal": "vehicle.speed", "from": 0, "to": 200, "fastSpeed": 4 } }
```

`speed` holds at `from` and below, `fastSpeed` from `to` up, in the signal's catalog unit
(km/h for `vehicle.speed`). In the Studio it is under the picture's **Faster with** field. On the
car the renderer still plays the frames by itself; the app restarts the animation at the new
speed, from the frame it is on, when the step changes (at most twice a second). Volt Runner uses
it for its runner.

## Keeping out of the factory's way

The 1920×720 panel sits above the factory gauges and below its telltales and pop-ups. Keep
readings outside the zones listed in [../architecture/RENDERER.md](../architecture/RENDERER.md):
the top cowl (730–1190 × 0–128), the gear bracket (1410–1662 × 262–454), the eDrive box
(1770–1920 × 170–265), the bottom telltale strip (560–1520 × 652–720) and the slanted glass
corners (`y < 217 − 0.55·min(x, 1920−x)`). Backgrounds may cover them.

## Renderer budget

Each component compiles to one or more effect layers; the car allows 64 per app. Rough costs:
circular gauge 1 (band) + 1 (ticks/labels) + 1 (needle) + 1–2 (value text); bar 1–2; digital
readout 1–4; gear 1–3; shift lights 1; text 1 per line; status panel 1 + rows. The Layers panel
and `npm run themes:validate` report exact numbers.

## What the car cannot draw (yet)

Gradients with more than two stops (first and last are used), radial gradients (drawn linear),
shadows, dashed lines, group clipping, elliptical decorative arcs (drawn as
circles), decimals in gauge numerals (use `divisor`), custom telltale icons, text longer than 32
glyphs per line, characters outside the atlas (digits, Latin letters, `- ° / . : % + , ' ! | ( )
~ < > = # & * ? _ "`). Each case is a validation note or warning.

## Workflow

1. Edit `themes/<id>/theme.json` (or save from the Studio into that folder).
2. `npm run themes:validate`. It has to come back clean.
3. `npx tsx tools/build/build-mgu-themes.ts` regenerates `apps/idv7lol/theme_*.js` and the
   theme/palette choices in `apps/idv7lol/app.json`. Commit the generated files: the Store
   builds the app from the repository on the head unit.
4. Open it in the Studio and run the scenarios _track_, _signal-loss_ and _comm-failure_.
5. Add an entry to `CHANGELOG.md`.

## Adding a theme to the Studio's templates

Import it in `apps/studio/src/lib/templates.ts`. The welcome dialog renders thumbnails with the
engine from fixed sample values.
