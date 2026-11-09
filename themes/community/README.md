# Community themes

Hand conversions of the seven cluster layouts from
[eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info)
(`apps/cluster_layouts/`, Cluster Layouts 0.13.2) to idv7lol's declarative theme format.

## Licence and attribution

- Original layouts: Copyright (C) 2026 eroobeeroo, GPL-3.0-or-later. These conversions are
  derived works and stay under GPL-3.0-or-later; see the repository's `LICENSE`.
- Upstream's own Cluster Layouts notice also covers its MIT-licensed kit, the MPL-2.0 cluster
  render client and its Barlow font atlases. None of those were copied here: only the arrangement,
  proportions, colours and readouts of the layouts were taken over, and no upstream shader,
  JavaScript, font or image is included.
- Each theme's `author` and `description` credit upstream. Upstream's on-cluster credit mark
  (drawn by its own engine) has no equivalent in this format and is not reproduced.

## Status

Validated and compiled with the theme compiler CLI and rendered with the Studio engine
locally. Nothing here has been tested in a vehicle.

## What differs from upstream, all themes

- No custom shaders in this format: no satin bezels or radial face shading (faces are two-stop
  linear gradients), no glow on text, no needle shadows or glass reflections. Glows remain only on
  gauge arcs and bars.
- Only upstream's full-screen layout is converted. Its map-centre and stock-centre variants, the
  M-car adaptations and the Settings pages have no equivalent.
- Upstream swaps electric readings for engine ones on non-hybrid cars (a setting). These themes
  target the `phev` profile, so on a combustion car the electric readouts show dashes.
- Units are fixed to km/h and °C (upstream's default is mph and °F, switchable).
- Fuel range is bound to `vehicle.range` (the catalog's remaining range), which is not strictly
  fuel only on a hybrid.
- Numerals past the redline stay in the normal colour; gauge numerals cannot change colour by zone.
- Engine-speed text is not rounded to 50 rpm as upstream does.
- `D4` is drawn as a mode letter plus the gear number (four layers). A bare `D` from the car reads
  `D` even in Sport (`S`) mode.
- Palettes follow `drive.mode` only; upstream's look also followed the selector (S/M) and hybrid
  electric mode.

## Per layout

### analog-sport

- Dials are 476 px across instead of 520 and sit a little lower and further right: the validator
  checks each gauge's bounding square against the glass corners and telltale strip.
- Speedometer numerals every 40 km/h instead of 20, to stay legible at that size.
- Power meter arcs are kept, but their tick numerals are small and the `kW` label moved down.

### digital-round

- Same dial size change as analog-sport; numerals every 40 km/h.
- The lit value arc is a second gauge inside the tick ring, because a single gauge draws its band
  outside its ticks.

### retro

- Same dial size change; numerals every 40 km/h.
- The economy gauge always reads battery power (upstream shows boost on combustion cars).

### digital-dash

- The two-minute trend lines (sparklines) are omitted: there is no such component.
- Tile icons are omitted: the built-in icons do not match, and the layer budget is full (48).
- The xDrive split is omitted: no catalog signal.
- `BOOST` does not read `OFF` with the engine off; it shows the signal's fallback.
- The battery power bar is split into regeneration (left) and drawing (right) bars, since one bar
  cannot fill from zero in both directions.

### modern-wide

- The two long arcs of 520 px radius are straight segmented vertical bars: no square box of that
  size can avoid the glass corners, cowl, gear bracket and eDrive box. They keep upstream's vertical
  extent, segments and glow, but not the curve.
- Numerals of the left bar sit to its right (`gauge.bar` only draws labels on that side).

### freedom

- The waving flag is static: seven red stripes on a grey field and a navy canton.
- Stars are rows of `*` text, kept clear of the glass corner.
- The eagles and fireworks are omitted (upstream's shaders; no images used).
- The tach arc has a 260 px radius over about 200 degrees instead of 520 px over 110: the larger
  box would cross the telltale strip and gear bracket.
- The xDrive split is omitted: no catalog signal.

### track

- The 0-60 timer and the drive's peak power tiles are omitted: both are values upstream computes
  in its app, with no catalog signal. The space below the speed stays empty.
- The xDrive split is omitted: no catalog signal.
