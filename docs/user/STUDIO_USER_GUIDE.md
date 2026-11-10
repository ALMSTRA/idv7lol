# idv7lol Studio user guide

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

The top bar has the **File** menu (New, Open, Save, Save as, Add images, Export PNG), Save, Undo/Redo,
Add images, Simulate, Validate (shows the error count), Build, three buttons that show or hide the
panels, and a **…** menu with language, light/dark and help.

Drag the edge of a panel to resize it, and double-click the edge to reset it. In a small window the
side panels open as drawers over the canvas.

The status bar shows the saved state, selection count, cursor position in layout pixels, renderer layer
count versus the 64-layer limit, simulated signal health, display profile.

## Library (left)

Components grouped as Gauges, Readouts, Indicators, Text & shapes, Decoration. Each entry is a
preset (for example _Tachometer_ is a circular gauge already bound to `engine.rpm` with a
redline and segments). Drag an entry onto the canvas, or click it to add it at the centre.

### Images

Add pictures from your computer in any of these ways: the **Add images** button (top bar or
library), dragging files onto the canvas or the library, or pasting with Ctrl+V. PNG, JPEG, WebP,
GIF, SVG, BMP and AVIF work; images are stored inside the theme, so a saved `.idv7theme` is one
self-contained file. Images larger than 2048 px are scaled down on import. Click a thumbnail to
reuse a picture, or drag it onto the layout.

### Animations and video

GIF, animated WebP and APNG files import as animations, and so do short videos (MP4 or WebM). Videos
keep the first 12 seconds at up to 15 frames per second, with no sound. The Inspector sets the
playback speed, and the image editor can step through the frames. On the car, all frames must share
one texture, so large or long animations lose sharpness; Validation warns when that happens. Animations
have not been tested in a vehicle.

## Image editor

Double-click a picture on the canvas, or press **Edit image** in the Inspector. Edits are
non-destructive: the original stays intact and **Reset all** returns to it.

| Tool              | What it does                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| Adjust            | brightness, contrast, saturation, temperature, hue; double-click a name to reset it   |
| Looks             | one-click styles (Night, Neon, Mono, Warm, Cold, Punch, Muted)                        |
| Crop              | drag the frame; free, component, cluster, 16:9 or 1:1 proportions; rotate and flip    |
| Remove background | click a color in the image or **Detect background**; tune tolerance and edge softness |
| Brush             | erase parts by hand, or restore what was removed; `[` and `]` change the size         |
| Effects           | blur, sharpen, vignette, rounded corners, black and white, invert, colorize           |

The panel **On your cluster** shows the picture in place in your layout while you work. Ctrl+Z and
Ctrl+Y undo and redo, Esc cancels. Below the image you can switch the backdrop (transparent, black,
white) and hold a button to compare with the original. On the car, the edits are baked into the
picture at its size on the cluster. Images use renderer memory according to that size; Validation
warns when a theme uses too much.

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

- Component: name, position, size, rotation and anchor, opacity, visible, locked, and the
  number of renderer layers the component costs on the car.
- Signal: the catalog signal, display unit, range (min/max used by gauges), smoothing (how
  softly the value follows the car) and what to show when the signal is unavailable (dashes,
  hide, keep last, zero). Catalog range and availability are shown; a warning appears if the
  theme's vehicle profile does not provide the signal.
- Properties: everything the component type offers (arc angles, ticks, labels, needle,
  redline, bars, zones, text styles, panels…). Colours are palette tokens (`$accent`, `$text`…)
  or custom values; tokens change with the palette.
- Show only when: a condition on a signal (for example _show the cruise speed only while
  cruise is active_).
- Animations: attach clips from the Animation tab with a trigger (on load, always, while a
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

- Scenario: idle, cold start, city, highway, track lap, redline, manual shifts, driving
  mode changes, signal loss, communication failure, or manual control.
- Manual control: throttle, brake, gear lever, gearbox mode and manual gear, driving mode,
  cruise speed, outside temperature, ignition, indicators, high beam.
- Signals: live values of the signals the theme uses (or all). ✎ overrides a signal with a
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

The status ladder shows how far the theme has got: _Preview available_, _Validation passed_,
_Package compiled_, _Bundle exported_, _Tested in vehicle_ (only you can confirm that).
**Compile theme** runs the compiler. **Save for the car (USB)** asks for your USB stick and saves
the theme there as `idv7lol/themes/<theme>.idv7pkg`; the car app installs it by itself when the
stick is plugged in. **Export bundle…** writes `theme.json`, shaders and the font atlas to a folder,
for developers. Installing on the car is described in [DEPLOYMENT.md](DEPLOYMENT.md).

## Files

- `.idv7theme`: your theme (JSON, the same format as `themes/*/theme.json` in the repository).
- Preferences (language, grid, zones) are kept locally; nothing is sent anywhere.
