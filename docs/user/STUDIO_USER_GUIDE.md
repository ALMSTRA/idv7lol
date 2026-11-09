# idv7lol Studio — user guide

idv7lol Studio is a Windows desktop editor for custom BMW iDrive 7 instrument-cluster layouts.
You design on a 1920×720 canvas that represents the cluster, test with a built-in simulator,
validate against the real limits of the car's renderer, and export a bundle the idv7lol car app
loads. No GLSL, RAMSES or JavaScript knowledge is needed.

> The preview is drawn by the Studio's own engine. The car draws with RAMSES on the cluster's
> GPU: anti-aliasing, glow and fonts differ slightly. The Studio says so in the canvas corner.

## The window

```
┌──────────────────────────── top bar ────────────────────────────┐
│ Library │              Canvas               │ Inspector/Layers/ │
│         │   (rulers, grid, reserved zones)  │ Palettes          │
├─────────┴───────────────────────────────────┴───────────────────┤
│ Simulator · Validation · Animation · Build & Deploy · Console   │
└──────────────────────────── status bar ─────────────────────────┘
```

**Top bar**: New, Open, Save, Save as, Export PNG, Undo/Redo, Simulate (play/pause the virtual
car), Validate (jumps to the Validation tab and shows the error count), Build, language (EN/ES),
light/dark, help, and three buttons that show or hide the side and bottom panels.

**Status bar**: saved state, selection count, cursor position in layout pixels, renderer layer
count versus the 64-layer limit, simulated signal health, display profile.

## Library (left)

Components grouped as Gauges, Readouts, Indicators, Text & shapes, Decoration. Each entry is a
preset (for example _Tachometer_ is a circular gauge already bound to `engine.rpm` with a
redline and segments). Drag an entry onto the canvas, or click it to add it at the centre.

## Canvas (centre)

| Action                            | How                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Select                            | click; Shift+click adds or removes; drag on empty space for a marquee                                                    |
| Move                              | drag; arrow keys nudge 1 px, Shift+arrows 10 px                                                                          |
| Resize                            | drag a white handle; Shift keeps the aspect ratio                                                                        |
| Rotate                            | drag the round handle above the selection; Shift snaps to 15°                                                            |
| Zoom                              | Ctrl+wheel, the − / + buttons, or **Fit** (Ctrl+0)                                                                       |
| Pan                               | Space+drag, middle mouse, or wheel (Shift+wheel horizontal)                                                              |
| Align / distribute                | toolbar buttons at the top of the canvas (one component aligns to the layout)                                            |
| Group / ungroup                   | Ctrl+G / Ctrl+Shift+G (top-level components)                                                                             |
| Duplicate / copy / paste / delete | Ctrl+D / Ctrl+C / Ctrl+V / Delete                                                                                        |
| Snap                              | toggle in the canvas toolbar; snaps to grid, other components' edges and centres, and the layout centre (magenta guides) |

**Reserved zones** (toggle ▦) are drawn as hatched areas:

- orange, _factory_: the factory cluster draws over this area (top cowl with telltales, gear
  bracket on the right, eDrive box, bottom telltale strip). Decoration may sit there; essential
  readings should not.
- red, _keep clear_: the slanted glass corners; nothing there is visible.
- blue, _info_: the stock map window, informational only.

## Inspector (right)

Appears for the selected component.

- **Component**: name, position, size, rotation and anchor, opacity, visible, locked, and the
  number of renderer layers the component costs on the car.
- **Signal**: the catalog signal, display unit, range (min/max used by gauges), smoothing (how
  softly the value follows the car) and what to show when the signal is unavailable (dashes,
  hide, keep last, zero). Catalog range and availability are shown; a warning appears if the
  theme's vehicle profile does not provide the signal.
- **Properties**: everything the component type offers (arc angles, ticks, labels, needle,
  redline, bars, zones, text styles, panels…). Colours are palette tokens (`$accent`, `$text`…)
  or custom values; tokens change with the palette.
- **Show only when**: a condition on a signal (for example _show the cruise speed only while
  cruise is active_).
- **Animations**: attach clips from the Animation tab with a trigger (on load, always, while a
  condition holds, when it becomes true/false, when a signal changes).

## Layers

Top of the list is drawn last (on top). Double-click to rename, use the eye and lock icons, the
arrows to reorder (or drag). The number on the right is the component's renderer-layer cost; the
header shows the total against the 64-layer limit of the cluster renderer. Keep themes under
48 so other apps still fit.

## Palettes

Each theme has one or more palettes (colour sets). Required tokens: `background`, `surface`,
`text`, `text-muted`, `accent`, `track`, `success`, `warning`, `danger`; add your own. Choose
the default palette and which palette each driving mode uses (ECO PRO, COMFORT, SPORT,
SPORT+…); the car switches automatically when it reports the mode. Text tokens show their
contrast ratio against the background.

## Simulator (bottom)

- **Scenario**: idle, cold start, city, highway, track lap, redline, manual shifts, driving
  mode changes, signal loss, communication failure, or manual control.
- **Manual control**: throttle, brake, gear lever, gearbox mode and manual gear, driving mode,
  cruise speed, outside temperature, ignition, indicators, high beam.
- **Signals**: live values of the signals the theme uses (or all). ✎ overrides a signal with a
  value of your own; ⚡ drops it (unavailable), so you can check fallbacks. _Communication loss_
  freezes everything; _latency_ ages every sample.
- Record / replay runs; export PNG from the top bar.

## Validation

Runs automatically while you edit. Click a finding to select the component. Errors block
compilation (unknown signals, wrong units, missing palette tokens, readings in keep-clear zones,
more than 64 renderer layers). Warnings are advice (readings inside factory zones, low contrast,
characters the car font cannot draw, signals missing on the vehicle profile).

## Animation

Create clips (duration, easing, loop, direction) with tracks and keyframes. Transform and
opacity tracks preview in the Studio; on the car, rotation and scale tracks play on the renderer
and colour tracks are updated by the app; opacity tracks are not played on the car yet.

## Build & Deploy

The status ladder is honest about where the theme is: _Preview available_, _Validation passed_,
_Package compiled_, _Bundle exported_, _Tested in vehicle_ (only you can confirm that).
**Compile theme** runs the compiler; **Export bundle…** writes `theme.json`, shaders and the font
atlas to a folder. Installing on the car is described in [DEPLOYMENT.md](DEPLOYMENT.md).

## Files

- `.idv7theme`: your theme (JSON, the same format as `themes/*/theme.json` in the repository).
- Preferences (language, grid, zones) are kept locally; nothing is sent anywhere.
