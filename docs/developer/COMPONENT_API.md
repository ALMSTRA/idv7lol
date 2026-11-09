# Component API

Every component shares the base fields below and adds type-specific `props`. Defaults are listed
in parentheses; the authoritative definitions are the zod schemas in
`packages/theme-schema/src/components.ts`, the renderers in `packages/theme-engine/src/components/`
and the compiler mapping in `packages/theme-compiler/src/pieces.ts`.

## Base fields

| Field                       | Default    | Meaning                                      |
| --------------------------- | ---------- | -------------------------------------------- |
| `id`                        | —          | kebab-case, unique in the theme              |
| `name`                      | —          | label in the Layers panel                    |
| `x`, `y`, `width`, `height` | —          | box in layout pixels, relative to the parent |
| `rotation`                  | 0          | degrees clockwise around the anchor          |
| `anchor`                    | `top-left` | pivot for rotation/scale                     |
| `opacity`                   | 1          | 0..1                                         |
| `visible`                   | true       |                                              |
| `locked`                    | false      | Studio only                                  |
| `binding`                   | —          | signal binding (see THEME_DEVELOPMENT.md)    |
| `visibleWhen`               | —          | condition                                    |
| `animations`                | []         | `[{ clip, trigger, delay }]`                 |
| `notes`                     | —          | author notes                                 |

Text styles (`TextStyle`) are used throughout: `font` (`default`), `size`, `weight`
(`light regular medium bold`), `color` (`$text`), `align`, `baseline`, `letterSpacing`,
`uppercase`.

Number formats: `0`, `0.0`, `00`, `+0`, `0,0`, with literal prefix/suffix (`0 km/h`).

Zones: `[{ from, to, color }]` colour the value range `[from, to)`.

## Shapes

### `rect`

`fill` (colour or gradient), `stroke` `{ color, width, cap, dash }`, `radius` (0), `shadow`
(Studio only). Car: 1 layer.

### `ellipse`

`fill`, `stroke`, `shadow`. Car: 1 layer.

### `line`

`stroke` (required), `direction` (`horizontal vertical diagonal diagonal-flip`). Car: 1 layer
(dashes drawn solid).

### `arc` (decorative)

`startAngle` (135), `sweepAngle` (270), `stroke` (required), `fill` (pie, Studio only). Angles
in degrees, 0 = 3 o'clock, clockwise. Car: 1 layer, circular.

### `image`

`asset` (id in `assets`), `fit` (`contain cover stretch`), `edits` (non-destructive: `rotate`, `flipH`,
`flipV`, `crop`, `brightness`, `contrast`, `saturation`, `hue`, `temperature`, `sharpen`, `blur`,
`invert`, `grayscale`, `tint`, `vignette`, `radius`, `colorKey`, `strokes`). The pipeline is
`packages/theme-engine/src/image-edits.ts`, shared by the Studio and the compiler. Car: 1 image layer
baked at the component's size, at most 1920×720; a palette-token tint uses the default palette.

### `group`

`props.children` (components, relative to the group), `clip` (Studio only).

## Text

### `text`

`text` (literal; `{value}` and `{unit}` insert the bound signal; without `{value}` the value is
appended), `style`, `format`, `wrap`, `lineHeight`, `clip`. Car: 1 layer per line, ≤ 32 glyphs.

### `clock`

`format` (`24h`/`12h`), `showSeconds`, `showSuffix`, `blinkColon`, `style`. Uses `time.*`
signals when present, else the host clock (car: unit clock + the app's UTC offset setting).

## Gauges

### `gauge.arc`

Circular gauge inscribed in the box. `startAngle` (135), `sweepAngle` (270);
`track` `{ show, color, width, cap }`; `fill` `{ show, color|gradient, width, mode solid|segments,
segments, segmentGap, cap, zones }`; `ticks` `{ major, minor, majorLength, minorLength,
majorWidth, minorWidth, color, minorColor, inset, redlineColor }`; `labels` `{ show, every,
style, divisor, format, inset }`; `needle` `{ show, color, width, length, tail, shape
tapered|bar|arrow, cap { show, radius, color }, shadow }`; `redline` `{ show, from, color,
width, placement outer|track }`; `valueText` `{ show, style, format, unit, showUnit, unitStyle,
offsetX, offsetY }`; `glow` `{ show, color, blur }`.
Car: band (1) + ticks/labels (1, numerals from the atlas, integers) + needle (1) + value text
(1–2). Up to 4 zones.

### `gauge.bar`

`orientation`, `direction`, `track` `{ show, color, radius, stroke }`, `fill` `{ color|gradient,
radius, mode, segments, segmentGap, zones }`, `ticks` `{ show, count, color, length, width,
side before|after|both }`, `labels` `{ show, style, format, divisor, offset }`, `marker` `{
show, value, color, width }`, `glow`. Car: bar (1) + ticks/labels (1).

## Readouts and indicators

### `value.digital`

`format`, `unit`, `showUnit`, `label`, `layout` (`stacked inline label-left`), `valueStyle`,
`unitStyle`, `labelStyle`, `zones` (value colour), `background`, `stroke`, `radius`, `padding`,
`tabular`. Car: 1 (value, unit inline as secondary glyphs) to 4 layers (label, value, unit,
panel).

### `indicator.gear`

`style`, `showMode`, `modeStyle`, `modeSignal` (`transmission.mode`), `manualColor`, `mapping`
(gear text → display text), `background`, `radius`. Default binding `transmission.gear`. Car:
1–3 layers.

### `indicator.shiftlights`

`count` (10), `shape` (`circle rect pill`), `gap`, `from`, `to` (binding units; first light at
`from`, all at `to`), `flashAbove` (0 = off), `flashRateHz`, `colors` (per light, last repeats),
`offColor`, `symmetric`, `glow`. Car: 1 layer; flashing is a renderer-side animation.

### `telltale`

`icon` (`turn-left turn-right high-beam low-beam fog-rear parking-brake cruise battery fuel engine
oil coolant snowflake custom`), `asset` (custom), `onColor`, `offColor`, `hideWhenOff`. Mirrors a
boolean signal; it never replaces factory telltales. Car: 1 layer (custom icons not yet).

### `status.panel`

`rows` `[{ label, binding, format, unit, showUnit }]` (1–12), `rowHeight`, `labelStyle`,
`valueStyle`, `unitStyle`, `background`, `radius`, `padding`, `divider`. Car: 1 layer per row
(label as secondary glyphs) + 1 panel with dividers.

## Adding a component type

1. Props schema + union member in `packages/theme-schema/src/components.ts`, default size in
   `factory.ts`.
2. Renderer in `packages/theme-engine/src/components/` with a `layers()` estimate; register in
   `components/index.ts`.
3. Compiler mapping in `packages/theme-compiler/src/pieces.ts` (reuse a shader or add one in
   `glsl.ts`; keep each shader small, ≤ 32 uniforms, no reserved `u_mvp`-style names).
4. Runtime support in `apps/idv7lol/engine.js` if a new dynamic kind is needed.
5. Inspector descriptors in `apps/studio/src/inspector/descriptors.ts`, a library entry in
   `apps/studio/src/lib/componentLibrary.ts`, translations in `apps/studio/src/i18n/`.
6. Tests in each package and a line in this document.
