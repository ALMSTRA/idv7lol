# Community themes

Layouts shared by people who use idv7lol, plus the converted Cluster Layouts and KurdBimmer
Themes below. To share one,
see "Sharing a layout" in [CONTRIBUTING.md](../../CONTRIBUTING.md). Every folder here shows up in
the Studio's welcome window as a template; each shared theme carries its author and licence.

## Cluster Layouts conversions

Hand conversions of the twelve cluster layouts from
[eroobeeroo/idrive7-cluster-info](https://github.com/eroobeeroo/idrive7-cluster-info)
(`apps/cluster_layouts/`) to idv7lol's declarative theme format: seven from Cluster Layouts
0.13.2, and `gt3`, `pulse`, `sport`, `m-cluster` and `classic-m-cluster` from Cluster Layouts
0.27.2 (commit 637223f, 10 November 2026), the last version published under GPL-3.0-or-later.
Upstream's later versions are under PolyForm Noncommercial and nothing was taken from them.

## Licence and attribution

- Original layouts: Copyright (C) 2026 eroobeeroo, GPL-3.0-or-later. These conversions are
  derived works and stay under GPL-3.0-or-later; see the repository's `LICENSE`.
- Upstream's own Cluster Layouts notice also covers its MIT-licensed kit, the MPL-2.0 cluster
  render client and its Barlow font atlases. None of those were copied here: only the arrangement,
  proportions, colours and readouts of the layouts were taken over, and no upstream shader,
  JavaScript, font or image is included.
- Each theme's `author` and `description` credit upstream. Upstream's on-cluster credit mark
  (drawn by its own engine) has no equivalent in this format and is not reproduced.

## KurdBimmer Themes conversions

The seventeen folders that start with `kb-` are hand conversions of the cluster themes in
[FDX100/KB](https://github.com/FDX100/KB) (`apps/kurdbimmer_themes/`, KurdBimmer Themes 0.20.5,
and Luxe from 0.23.0), made by [FDX100](https://github.com/FDX100): Apex, Alpina, Concept, Live
Cockpit, Eco, Classic, Classic Map, Night Drive, M Digital, Blue Dials, ePower, Digital Rain, Neon
City, Glass, E46 M3, Hybrid and Luxe.

- Original themes: Copyright (c) 2026 FDX100, MIT (the repository also names bimmer-lab, whose
  Cluster Themes app it is built on). The conversions keep the MIT licence, and each theme's
  `author` and `description` credit FDX100.
- Only the arrangement, proportions, colours and readouts were taken over, from the theme
  pictures and layout files. No upstream shader, JavaScript, font or image is included.
- Upstream says of itself that it was not yet tried on a real car; neither were these.

What differs from upstream, all seventeen:

- Upstream draws each theme with its own shader over the whole 1920x720 panel. Here every theme
  is redrawn with this format's gauges, bars, texts and shapes at 0.66 of its size, at the left of
  the panel (x 88 to 1355, y 150 to 625), so that nothing sits under the cowl, the gear bracket,
  the eDrive box or the bottom strip. Clock, range and outside temperature are in a column right
  of the gear bracket instead of along the bottom.
- Chevron and curved scales (Alpina, Live Cockpit, M Digital) are straight segmented bars; the
  curved gauges of Concept are arcs of a circle.
- No wordmarks or brand stripes: the ALPINA wordmark, the M stripe and the texts on the E46 M3
  dial faces are left out. The names of the themes are FDX100's.
- Shader effects have no equivalent: the falling glyphs of Digital Rain are still columns, the
  skyline of Neon City is a few plain towers without windows, the hatched bands, glass shine and
  glowing floors are plain fills and lines, the analog clock of ePower is a digital one.
- The Waze map window, the per-drive-mode theme choice, the shift lights, the G-meter, the alerts
  and the Kurdish (Sorani) settings pages belong to upstream's app and are not part of a theme.
- Units are fixed to km/h, °C and bar. The gear shows the gear or the selector position, not both
  (`D3` reads `3`).
- The E46 M3 display is orange figures on a dark panel, not dark figures on orange, to stay
  legible against the layout's background check.
- Eco's "POWER %" reads the engine load; ePower's right dial reads the battery power in kW with
  the charge sector above it, and Hybrid and ePower target the `phev` profile.
- Luxe: the right dial reads the battery power in kW (upstream: the car's power meter in %); its
  charging view (charge power, time to full) and the badge spot with your own logo are left out,
  having no catalog signal or no equivalent in a theme; the analog clock is a digital one.

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

### gt3

- Converted from upstream commit 637223f (Cluster Layouts 0.27.2), the last one under
  GPL-3.0-or-later.
- The right-hand tiles sit right of the gear bracket (x 1672-1900) and are 228 px wide instead
  of 290; upstream's stand on the gear bracket.
- The last-shift tile and its grade (EARLY, SPOT ON, LATE...) are omitted: upstream scores each
  upshift in its app, with no catalog signal. The shift lights use a fixed 4000-6700 rpm window
  instead of upstream's oil-temperature-dependent shift point.
- Tyre temperatures are omitted (no catalog signal); pressures are shown in bar.
- Battery power is always green; upstream turns it green only while regenerating.

### pulse

- Converted from upstream commit 637223f. Upstream's full-screen variant (clock and outside
  temperature in the top corners, drive mode under the cowl) with the bottom row of readings of its
  strip variant, which the picture shows.
- `ENGINE RPM` moved left (x 1220-1400) to clear the gear bracket.
- Power is always green; upstream turns it green only while regenerating.

### sport

- Converted from upstream commit 637223f.
- The slanted speed and rev brackets are straight segmented vertical bars, and their numerals are
  linear (0-280 km/h, 0-7) instead of upstream's stretched low end. The rev scale starts below
  the eDrive box and right of the gear bracket, so it is shorter than the speed scale.
- The ePower scale that replaces the rev numerals on electricity alone is omitted.
- The cruise control icon is omitted; its set speed shows in green while it holds.
- The oil gauge reads 50-150 °C and sits lower, below the gear bracket.
- The clock, range and outside temperature sit in the middle above the bottom bar, since upstream
  puts them on the car's own strip.
- The bottom bar's power half reads 0-100 kW of battery power; regeneration is not drawn.

### m-cluster

- Converted from upstream commit 637223f (layout "M"). Only its full-screen centre; the map window
  variant and the M-car box placements are omitted.
- The curved blades are straight segmented vertical bars bound to engine speed (0-8000, lit red
  from 7000). The right blade's numerals are separate texts on its inner side; it does not switch
  to battery power on electricity alone.
- The right card is split into two cards, above and below the gear bracket: battery power above
  (regeneration as a separate green bar left of its 0, 33 kW, the draw to a fixed 100 kW), battery
  temperature below.
- Icons are replaced by text names (WATER, OIL, POWER, BATTERY, FUEL, CHARGE).
- The drive-logic bars beside the gear and the gearbox-oil and boost/torque variants for
  combustion cars are omitted; the drive mode sits where upstream's stripes were.
- Readings past their red zone keep the normal colour (upstream turns them red).

### classic-m-cluster

- Converted from upstream commit 637223f (layout "Classic M"). Named "Classic Cluster".
- Dials are 476 px across and the whole group sits left (x 88-1358), so the tach clears the gear
  bracket; the right of the screen stays empty.
- Speed scale 0-330 km/h with numerals every 30, as upstream's km/h scale.
- The tach does not switch to battery power on electricity alone; the amber display always shows
  battery power, gear, speed and charge (upstream shows boost and coolant on combustion cars).
- The ring's glow and the needles' glow are omitted; the ring is a flat light-blue track.
- The sport palette (warm ring, red-orange display) is new; upstream has one look.
