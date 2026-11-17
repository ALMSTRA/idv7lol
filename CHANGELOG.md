# Changelog

All notable changes to idv7lol are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

Status words used below: **developed** (code exists), **tested locally** (automated tests or a
PC preview), **compiled** (artifacts built), **published** (on GitHub), **tested in vehicle**
(confirmed on a car). They are not interchangeable.

## [Unreleased]

### Changed

- The car app is version 0.2.14 and requires cluster-render 0.6.6 (was 0.6.4) and the Store's
  deploy tool 0.8.21 (was 0.8.19). cluster-render 0.6.5 remembers across drives the upload level
  the KOMBI accepts, and 0.6.6 keeps the scene through a warning or an open door and maps it
  again when the slot unlocks, instead of leaving the panel blank until a new fetch. mgu-deploy
  0.8.21 refuses, before changing anything, an app that asks for something the head unit lacks,
  and restores other apps the app manager dropped during an install. Not tested in a vehicle.
- The app kit's `kit/runtime/signals.js` is refreshed from cauliflowermossgrape/idrive7-apps
  (bae1732): method calls and the set-up of their proxies go ahead of the `watch()` set-ups
  waiting, and after four of them in a row a set-up goes next. The car app reads fuel over
  diagnostics while it watches some fifteen interfaces, so those reads no longer wait behind
  every set-up. Tested locally.
- `apps/idv7lol/cluster_render_client.js` is the upstream file again (idrive-apps dd61304): it
  had fallen behind by `host()`, the `host` event and a scene's `layers` options, which idv7lol
  does not use.
- The setting _Bottom strip > Covered by the layout_ says it may leave black boxes. A measurement
  on a G80 M3 (idrive-apps #199) agrees with the default: a layout that ends at y 646 leaves none.
- The car app's buttons are **Show**, **Theme**, **Palette**, **Page** and **Settings**: the five
  labels were wider than the screen (Palette was cut and Remove USB theme never showed), and
  there was no way to open the app's Settings (time zone, tank size, bottom strip). A theme that
  came from USB is removed with _Settings > Theme from USB on show > Remove it from the car_.
- The cluster's theme is the setting `clusterTheme`. It was `theme`, which is the kit's own name
  for the colours of an app's page: the kit could set it back to the first theme once, and the
  page could not follow the kit's colour scheme. The theme chosen before is carried over.
- **Supercar Track** is redrawn closer to an Italian supercar's digital cluster: a thick rev band
  of 30 blocks counting to 10 (red from 7) under a yellow and red rim, a yellow inner line with the
  numbers, a huge red gear with the drive mode beside it and the odometer to its right, the speed
  bottom right, a hexagon floor with a lane in perspective (original artwork), side panels with
  leaning bars for oil, water, fuel and gearbox oil, the time and outside temperature, and a pill
  that says Low fuel. Its Track and Corsa palettes keep their names. Tested locally; not tested in
  a vehicle.
- The car app is version 0.2.13, so the MGU Store's Releases channel offers the new app screen,
  the idv7lol icon, the fixes below, the newer cluster-render and deploy tool, alerts, your own icons and needles, text styles, the X4 M
  fixes, VDO Classic M, Lily Pad, Neon Drive, Heritage 89, the new Supercar Track, Volt Runner, the
  fuel readings, the needle fix, the bottom strip fix, ETC2 animations and the fixes taken from
  upstream below as an update. The `catalog` release holds the new package.
- The car app requires cluster-render 0.6.4 or newer (was 0.5.2, then 0.5.9), so the Store brings
  its fixes along: a scene the cluster accepted and then never mapped (a cluster still starting, or
  a lock while parked) is asked for again instead of leaving the panel blank (0.5.5, 0.5.6); a
  layer whose atlas the renderer refused lets go of the cluster, which goes back to its own gauges,
  instead of holding an empty panel (0.5.9); no mapping guard turns a target off for good after
  two display drops, a drop is only logged (0.5.12); a picture layer stays hidden until its pixels
  are written, so the cluster never shows its empty buffer for a moment (0.6.3); and a scene the
  KOMBI removes during an upload lowers the upload rate for the rest of the run instead of
  stepping up again (0.6.4). See `docs/architecture/RENDERER.md`. Not tested in a vehicle with
  these versions.
- The car app requires the Store's deploy tool 0.8.19 (was 0.8.12): it repairs missing tiles on
  iDrive 7 (0.8.13), has the Store's safe mode (0.8.16), and on iDrive 7 MainApp 6.4.8 restarts
  only the app it installs (0.8.19, mgu-store #273).
- The MIT app kit's `kit/runtime/mgu.js` is refreshed from cauliflowermossgrape/idrive7-apps
  (b288063): a SETTINGS state is looked for only when no menu screen shows the settings itself. No
  change for idv7lol, which has a SETTINGS state.

### Added

- **A new view for the Studio**, beside the classic one. The work goes as steps along the top:
  Template, Design, Simulate, Validate, To the car, with a Continue button to the next one. Design
  has a bar of icons on the left (Pieces, Layers, Images, Palettes, Animate) that puts one thing
  in the left panel at a time, the Inspector on the right and the simulator under the canvas;
  Simulate gives the canvas the whole width; Validate lists the findings under it; To the car is a
  page of its own with the build. It holds the same panels as the classic window, which stays as
  it was. The desktop app asks which view you want the first time it runs and the web editor every
  time it opens; _… > View_ switches at any time. Tested locally in a browser.
- **The desktop Studio looks for a newer version when it starts** and asks whether to update: it
  downloads the signed installer from the project's GitHub releases, installs it and restarts.
  _… > Install updates without asking_ does it unasked when nothing unsaved is open, _… > Look for
  updates at startup_ turns the check off, and _… > Look for updates now_ runs it. The check reads
  one file from GitHub and sends nothing about you or your themes. Updating works from beta 7 on:
  earlier versions have no updater, so install this one by hand. Compiled on Windows; the update
  itself is not tested until a later release exists, and not on a Mac.
- The Windows installer also comes in Russian, Japanese and Simplified Chinese, the languages
  the Studio has besides English and Spanish.

- **A new screen for the car app.** Tabs instead of one page of text: **Themes** shows a sketch of
  the theme on show, with the one before and the one after, its palette and whether it is on the
  cluster; **Data** shows the car's speed, revs, gear, shift programme, fuel and temperatures;
  **Status**, **Signals**, **Renderer** and **About** are the pages the app had. The sketches are
  flat shapes the theme compiler makes from each theme (`preview` in a compiled theme, in USB
  packages too), because the Store's renderer takes no pictures on an app's page. The page is
  drawn again only when what it shows changes. _Settings > App screen > Classic_ brings the old
  text pages back as they were. Tested locally (the real kit on a PC, Node 8.16.2 and Node 24,
  software drawing); not tested in a vehicle.
- The car app's icon is the idv7lol logo (it was the kit's generic gauge), in the Store and in the
  car's app list.
- The car app's package carries its licences: the GPL in `LICENSE`, and the MIT licence of the app
  kit and the SIL Open Font License of Barlow in `NOTICE`; its `package.json` says
  GPL-3.0-or-later instead of UNLICENSED. The Studio's installers carry `LICENSE`,
  `THIRD_PARTY_NOTICES.md` and `LICENSES/`.
- **Needle on a photo.** A button in the canvas toolbar turns three clicks on a dial in a picture
  (its centre, its first mark and its last mark) into a needle-only circular gauge placed, sized
  and turned to match, bound to the signal and range you pick. Tested locally; not tested in a
  vehicle.
- **Your own icons and needles.** A custom telltale (and an alert's icon) draws a picture of your
  own, PNG or SVG, lit in its colours, now on the car too (a mask and a small shader; they were not
  drawn on the car before). A circular gauge's needle can be a picture of your own that turns with
  the value. The Inspector's Icon picture and Needle picture fields import one without placing it;
  Save as piece keeps the result for any theme. USB packages carry the pictures. Tested locally
  (compiler, car engine, USB package); not tested in a vehicle.
- **Alerts** with a priority: a new component, a warning box with a text, an icon, a fill and a
  border, that shows while its condition (Show only when) holds; when several hold only the
  highest priority shows, and it can blink. The car app draws it with the pieces it already has and
  picks the alert that wins as the values change. In the Studio a selected alert shows on the
  canvas whatever its condition; the Library has a low fuel and an engine hot alert. Tested locally
  (unit tests on the compiler and the car engine); not tested in a vehicle.
- **Text styles** with a name: save a text's look as a style from the Inspector's style picker
  and link other texts to it; changing a linked text changes the style and every text that uses
  it, while each keeps its own alignment. The Palettes panel lists the styles to rename or remove
  them (texts keep their look). Theme format: `textStyles` and `TextStyle.use`; the compiler and the
  editor resolve them, so the car app needs no change. Tested locally.
- **VDO Classic M** (contributed): a classic round-dial M cluster built from a photo, widened over
  the whole glass. It has live needles (speed, revs, fuel, coolant, consumption, oil temperature),
  the odometer and the trip since refuel, and a bottom bar: drive mode, gear, low beam, parking
  brake and DSC on the left; a boost readout and bar in the middle; battery, cruise with its set
  speed, and the clock on the right. The fuel pump lights when fuel is low, and the coolant symbol
  is blue while cold and red when hot. It frames the factory's own turn arrows. **Tested in
  vehicle** (F98 X4 M Competition).
- Signal `chassis.dsc.mode` (ON, OFF, DTC, MDM) from the DSC button's state (`FES.statusDSCSwitchHMI`).
- Boost from the engine unit when the car's sport display sends none, read over the read-only link as
  Cluster Layouts and M Vitals read it (charge pressure less ambient). Tested locally.
- A Time zone setting with daylight saving (Australian, New Zealand, European and US rules; `tz.js`).
  It defaults to the fixed offset, so existing installs keep their clock.
- `vehicle.trip.distance` is the distance since the last refuel (the tank 5 l up while standing),
  kept across restarts (`trip.json`). Not yet confirmed on a car.
- **Lily Pad**, a night pond: an original pixel-art tree frog hops on its lily pad in the middle
  of a segmented rev ring, faster the faster the car goes; fireflies are the shift lights, the
  speed is a needle on a lily pad (in a group, with a swirl turning round it), fuel, oil and water
  stand as reeds, ripples breathe under the frog, the gear flashes on each change, the frog croaks
  near the redline and says ribbit at a stop. Pond, Firefly night, Toxic (Sport) and Lotus (Eco
  Pro) palettes. Tested locally (car preview); not tested in a vehicle.
- **Neon Drive**, cyberpunk: huge neon speed in holo rings turning both ways, a segmented rev bar
  with a sync strip that flashes at the limit, the gear in a diamond, a system readout, a fuel cell
  and range; the speed glitches past 130, OVERDRIVE flashes near the redline and STANDBY breathes
  at a stop. Neon, Blood (Sport) and Acid (Eco Pro) palettes. Tested locally; not tested in a
  vehicle.
- **Heritage 89**, inspired by late-80s and 90s BMW clusters (no logos): a speedometer and a
  tachometer with chrome bezels and orange-red needles, fuel and temperature dials inside them,
  check lamps, a gear window, a green-yellow-red row of lamps for the oil warming up and an amber
  on-board computer. Amber night, Daylight and Red night palettes. Tested locally; not tested in a
  vehicle.
- The newest themes open the Studio's template list: VDO Classic M, Lily Pad, Supercar Track, Neon
  Drive, Heritage 89, Volt Runner. VDO Classic M carries its pictures in its file (1.2 MB), so it
  loads when the list opens instead of with the Studio, which starts as fast as before.

- **Volt Runner**, a new bright yellow theme built around an animation: a running lightning bolt
  (original pixel art) in the middle that runs faster the faster the car goes, the speed big on
  the left, the gear on the right, engine speed as the road under the runner, and fuel, oil and
  water along the bottom. Volt, Dusk and Sport palettes. Swap the runner for your own GIF in the
  Studio. Tested locally (Studio and car preview); not tested in a vehicle.
- Animated pictures can follow a signal: `speedFrom` on an image plays it faster as the signal
  rises (for example `vehicle.speed`), in the Studio and on the car, where the app restarts the
  renderer's animation at the new speed only when it changes by a step. In the Inspector under
  **Faster with**. Tested locally; not tested in a vehicle.

- The car app reads the fuel level, the fuel range and the odometer, and the reserve warning
  (`fuel.level`, `fuel.volume`, `vehicle.range`, `vehicle.odometer`, `fuel.low`), from the
  cluster's `KombiIF.statusRangeTankStatus`, the signal other iDrive 7 apps read. The cluster gives
  litres, so the percentage comes from the engine unit's OBD-II PID 2F while it answers, read over
  the kit's read-only diagnostic link (one request every 10 s, every 5 min once it hasn't answered
  3 times). Otherwise it is litres over the tank size: the new setting _Fuel tank size_, else the
  size worked out from the litres and the engine unit's percentage, else the largest level that
  held, never less than 65 l so a half tank doesn't read full. What it learns is kept in the app's
  data folder (`fuel.json`), and the app's page says where the level comes from. Both interfaces
  are optional: a car without them installs as before, with dashes. Tested locally (unit tests,
  and `vehicle.js` run against a fake car); the cluster's values were read on a G05 X5 xDrive45e
  with a full 69 l tank (68 l). **Tested in vehicle** with car app 0.2.11 on an F98 X4 M
  Competition: the level from the engine unit (30 %, 18 l) and the range (156 km).

- Animations go to the car as ETC2 textures (`etc2rgba`, cluster-render 0.5.9): a quarter of
  the bytes of RGBA8, sent once and charged once against the renderer's pixel memory instead of
  twice, so an animation costs an eighth of the memory it did. Volt Runner's runner atlas goes from
  4.6 MB to 1.2 MB. The theme compiler encodes the atlas (`packages/theme-compiler/src/etc2.ts`,
  frames in whole 4×4 blocks, up to 2048×1024), the car app sends it as an `etc2rgba` asset and,
  if a renderer refuses the texture, decodes it and sends it again as RGBA8. USB packages carry
  the atlas as `images/<id>.etc2`; the Studio's car preview decodes it to show what the car draws.
  An older car app refuses a USB package with an ETC2 animation (it reads it as a bad file name).
  Tested locally (unit tests; the encoder's blocks decode byte for byte the same with
  cluster-render's reference decoder; the car preview); not tested in a vehicle.

### Fixed

- Build & Deploy listed cluster-render 0.5.9 and mgu-deploy 0.7.11 as what the car needs; the
  car app asks for 0.6.4 and 0.8.19.
- Studio (desktop): the question before discarding unsaved changes is waited for. `window.confirm`
  returns a promise inside the desktop app, so a new template, a recent file or an opened file
  replaced the work whatever the answer, and deleting a picture in use or leaving the image editor
  went ahead too. Closing the window with unsaved changes now asks as well. Tested locally (unit
  tests); not tried in the desktop app yet.
- Studio: a file it saves can be opened again. A number typed outside its range (an alert's
  priority above 9) is brought back into it, names stop at the length the format allows, and a
  theme that would not open is not written: the Studio says what is wrong instead.
- An alert with an icon that is as tall as it is wide, or taller, no longer breaks validation and
  the build: it keeps its box and its icon, with a warning that there is no room for the text.
- Car app: with a USB stick in when the app starts, a new or a refused theme left the app's page
  blank and its buttons dead until a restart (the page was drawn before it was ready). The stick
  is read last, and a failure there is logged.
- Car app: a theme package is inflated a piece at a time and stopped at the limit. A file of a
  megabyte or two made to inflate to gigabytes was read whole before it was refused, with the
  cluster frozen meanwhile; a file over the size limit is no longer read at all. Tested on Node
  8.16.2: 300 kB of such a file are refused in a third of a second.
- Car app: a needle whose signal uses the "last value" fallback moves again when the signal comes
  back. Without a value its angle became not-a-number, and stayed so until the layout was rebuilt.
- Car app: the page no longer says the layout is showing when cluster-render is not connected. One
  state everywhere: Off, Waiting for the car, Waiting for car data, Renderer not connected, Layout
  failed, On the cluster.
- Car app: theme names and messages with accented letters are written without the accent on the
  page (the kit's fonts have none; they came out as "?").
- The Node 8 check compiles every file of the car app, `main.js`, `vehicle.js` and `tz.js` too, so
  syntax newer than ES2017 can't reach a car, and draws every bundled theme's sketch.
- The car app's diagnostic link (TASU) never reached the car: app.json named its method and broadcast
  as plain strings, which `kit/tools/build.py` checked letter by letter against the unit's catalog, so
  the whole interface was dropped on install and every engine-unit read failed silently. They are
  lists now, the build accepts either form, a test guards it, and a link that fails to start is
  logged. **Tested in vehicle** (F98 X4 M Competition) for the signals below; the diagnostic link fix is
  tested locally.
- Signals on an F98 X4 M Competition (**tested in vehicle**): drive mode from M Drive's engine mode
  (`MDrive.controlDisplayMSystems`: Efficient, Sport, Sport+); the electric parking brake
  (`Vehicle2.statusStandstillFunctions`; the mechanical handbrake switch only without one); low beam
  from the dipped beam lamp (`Light.LampExterior2`), so it goes out with the lights; cruise from the
  older display data on cars that don't fill `DisplayDataServer2`.
- The Studio's car preview drew a layer with uniforms left over from the last layer of the same
  shader: WebGL keeps them per program, while on the car each layer has its own and an unset one
  reads 0. A shape drawn after a background cut at the bottom strip came out stretched. Each layer
  now resets what it doesn't set.
- The car app requires the Store's deploy tool 0.8.12, which removes an app's code cache on
  install so an update runs the new code (mgu-store #261, the Store pins it the same way). The app
  folder has its `icon.png`, so the Branch channel shows the icon before install and after removal
  (mgu-store #241); it is the icon the kit made, unchanged. The install and troubleshooting guides
  cover the Store's safe mode, the tile repair, removing `cluster-render`, I-Step updates, USB
  sticks and the knob.
- The shader lint counts uniform vectors as GLSL ES does and refuses more than 48, and refuses a
  loop left with `break`. A shader of about 70 vectors restarted a G21's KOMBI (the MIT kit's
  Redline), and another cluster project suspected an early exit from a loop around texture reads of
  the same. None of idv7lol's shaders does either; the most is the shift lights' 39, drawn on a car.
- Under a layout cut at the bottom strip, a black band (to y 662, to 658 over the strip's drive
  mode and gear at x 1196–1424) hides the factory dials' lower edges and the separator line, which
  showed there in photos of a car (another cluster project, a G05). One layer with a small shader
  of its own, made only when the layout leaves room for it.
- The start-up sweep's animations are stopped once it is over and the gauges' values sent again. A
  finished animation holds its last key and plays again whenever cluster-render publishes the scene
  again (its PROTOCOL.md), which 0.5.5 and later do more often; a steady gauge (fuel, a temperature)
  could have dropped back to zero with nothing sent to correct it.
- The layout keeps off the cluster while the car is off or switching on and off: none with the
  car parked, in standby or with the ignition off (vehicle state 5 or lower), it goes when drive
  readiness ends (12), and none new goes up while drive readiness starts (8) or the car sends a
  state it can't name. A panel mapped while the KOMBI switches on or off counts against
  cluster-render's mapping guard, which turns the target off for good after two strikes (the kit's
  Redline holds its layer back the same way, issue #141 there). Cars that send no state work as
  before.
- The layout goes up only once it has been wanted for 1.2 s without a break, so services coming up
  one by one at start don't put it up and down (seen by another cluster project on cars). Taking it
  down stays immediate.
- Picking the theme or the bottom strip setting it already has no longer rebuilds the layout (the
  kit tells every setting it is given, and a rebuild flashes the cluster).
- Each change of the renderer target (shown, waiting, a speech dialog, the guard) goes to the log.
- The engine unit's fuel percentage came back only after the app restarted once the unit had
  missed five times in a row: the kit's read-only link skips such a unit until it is woken, and the
  5-minute retries never woke it. Each retry and the car coming on now wake it. A vehicle state the
  car can't name (15, no value) no longer keeps the last one: activity decides, so a car switching
  off isn't asked. `fuel.json` is written whole (a temp file renamed over it).
- Boost from the car's sport display (`FES.displayBoostPressure`) is read in hundredths of a bar.
  It was read in tenths, ten times the real figure: another cluster project fixed the same after a
  user's photos against the engine unit, and the MIT kit's own apps read it so. 255 is no value.
- The drive mode is read by BMW's name or wire number (`actualValueModeDrivingExperience`, as the
  kit's apps read it): Sport+ (`SPORT_EXPERT`, 2) was shown as Sport, numbers weren't read, and a
  plug-in hybrid's modes now map to the catalog (Sport+ and Boost to Sport, Hybrid and Electric to
  Comfort, which has no hybrid mode). 0 and 61–63 carry no mode.
- Speeds over 400 km/h, which a car sends while it wakes, are no value (as the kit's eDrive app
  reads them); they pegged the speed needle and counted as driving.
- Animations didn't show on the car in 0.2.5: the car app's copy of the renderer client predated
  cluster-render 0.5.9's ETC2 support, so it sized an `etc2rgba` atlas at four bytes a pixel and
  didn't send it (Volt Runner's runner stayed blank, a 2048×1024 atlas was refused). The client is
  copied again from cluster-render, a test now runs the real client with ETC2 atlases, and the car
  app logs when the client doesn't take an atlas. Tested locally; not tested in a vehicle.
- Needles turn the way their scale runs on the car and in the Studio's car preview. The needle
  shader built its rotation the wrong way round, so a needle sent to angle _a_ was drawn at _−a_:
  mirrored top to bottom against its ticks, its band and the editor's own drawing. A dial at zero
  pointed to the upper left instead of the lower left; in Performance the boost needle sat as far
  below the horizontal as the end of the arc was above it. `apps/idv7lol/shaders.js` and the two
  bundled themes with needles (Classic, Performance) are regenerated. Tested locally (a unit test
  on the shader's matrix, and the car preview); not tested in a vehicle.
- In the editor, the `turn-left` and `turn-right` telltales point the way they are named. They
  were swapped there; the car's shader already drew them right. Tested locally.
- Black boxes over the layout that stayed until the head unit restarted, seen on a G82 M4
  (issue #7). Some KOMBIs, M cars among them, leave them over a full-screen layout that covers the
  cluster's own bottom strip; cluster projects tested on cars found that a layout ending at y 646
  leaves none. The car app now cuts every layer at y 646 by default, keeping its drawing as it was
  (a new `u_keep` uniform in the shaders; image layers send only the rows above), so the car's own
  strip shows below the layout. The new setting **Bottom strip** (_The car's own_ / _Covered by the
  layout_) brings the old behaviour back. The Studio's car preview cuts the same way, the validator
  warns about readings below y 646, and the texts of Supercar Track and Track that reached below
  it sit a few pixels higher. Tested locally (unit tests and the car preview); not tested in a
  vehicle.
- The car app asks the engine unit for the fuel percentage only while the car is switched on
  (BMW's vehicle state `VehicleCondition`: ignition on, ready to drive, driving or switching off),
  or, before the car has told its state, within 3 minutes of moving or running. It asked every 10 s
  whenever the car's signals were there, parked too. Another iDrive 7 project found that
  diagnostic requests to a locked car go through its gateway, keep its networks awake, and leave
  faults ("no sleep in parking state", a battery management warning). The interface is optional
  like the others. Tested locally (unit tests, and `vehicle.js` run against a fake car: no request
  while parked, requests once on); not tested in a vehicle.
- The image memory check counts pictures and glyph atlases twice, as cluster-render charges image
  layers and uncompressed assets against its 16 MiB of pixel memory (its `PROTOCOL.md`, "Choosing a
  pixel format"). A theme that passed while needing more than the renderer has is now refused, and
  the warning starts earlier. No bundled theme is affected. Tested locally.
- The MIT app kit's runtime (`kit/runtime`) is refreshed from cauliflowermossgrape/idrive7-apps.
  Settings and other small files are written whole (a temp file renamed over the old one), so a power
  cut while saving no longer leaves a half-written `settings.json`. An app that comes to the front
  without the iDrive controller (the Store's renderer held it while the app restarted after an
  update) connects to the renderer again, up to three times, so the controller reaches it. The
  app page's drawn frames go to RAM instead of the head unit's flash, with a fallback to the old
  folder. The vehicle state the kit reads is logged once per new value. The CI's Node 8 check now
  compiles every kit runtime file. Tested locally (Node 8.16.2); not tested in a vehicle.

## [0.2.0-beta.3] - 2026-11-12

Third pre-release: idv7lol Studio in three more languages, and the car app on the Store's Releases
channel.

### Added

- The car app installs from the MGU Store's **Releases** channel too, the one the Store offers
  first once the repository has releases. A `catalog` release lists a ready package of the app,
  built by `tools/build/build-store-catalog.py` without BMW's SDK (the head unit makes that module
  from one of its own apps). Its layout matches packages that install from the Store on the test
  car; this one hasn't been tried on a car yet. Before, a source added on Releases showed "no
  catalog release".
- The Studio speaks Russian, Japanese and Simplified Chinese, next to English and Spanish
  (… > Language). It starts in the system's language when it has it, otherwise in English.

## [0.2.0-beta.2] - 2026-11-11

Second pre-release: idv7lol Studio 0.2.0 for Windows and, new, for macOS, plus the car app from
`main`. The car app has run on one car (install, two themes drawn, turning off restores the
factory cluster); everything marked below as not tried on a car still needs a test there.

### Added

- idv7lol Studio for macOS: CI builds one universal `.dmg` (Apple silicon and Intel, macOS 10.15
  or newer), signed ad hoc, and checks its architectures, signature and the `.idv7theme`
  association. Double-clicking a theme in Finder opens it. Compiled, not tested on a Mac; how to
  open it the first time is in `docs/user/INSTALL_MAC.md`.
- Studio: **Theme details** in the Inspector when nothing is selected (name, id, author, version,
  licence, description), with undo. Tested locally in the browser.
- Studio: **File > Share with the community** checks the theme (no errors, an author, an id that
  isn't a template's), saves it with a picture and opens the new theme form on GitHub. Nothing is
  uploaded by the Studio. Tested locally in the browser; the desktop folder dialog is not tried yet.
- A "Share a theme" issue form and a "Sharing a layout (no car needed)" section in CONTRIBUTING.
- Studio library: 23 more entries. **Blocks** add several arranged components at once (speed and
  gear, turn signal pair, temperature columns, data row, modes); new gauges (sweep and half-moon
  tachometers, lateral G meter, oil column, oil pressure, torque ring), readouts (driving mode,
  outside temperature, odometer, torque), a big gear, a 15-LED shift bar and six telltales. Every
  entry is tested to validate and compile for the car.
- Two new themes, also bundled in the car app: **Night Minimal** (a thin rev arc over a big speed,
  quiet side readouts; Night, Amber and Sport palettes, 17 layers) and **Rally Dash** (a 15-LED
  shift strip and rev bar across the top, a huge gear, six data cards; Rally, Stage and Ice
  palettes, 34 layers). Both validate clean and pass the car path test; not tried on a car.
- Display profile: zones other cluster projects report from their cars, shown in the Studio as
  hints only (no findings): the bottom strip below y 646 where the cluster draws black boxes,
  two boxes on M cars, and the driver camera notch. Not measured by idv7lol yet.
- Validator: warns when the numerals of an arc gauge run into each other, such as a 0–260 km/h
  dial labelled at every tick (reported for another cluster app, idrive7-cluster-info #5).

### Fixed

- Driving mode texts read SPORT+ and ECO PRO instead of `SPORT_PLUS` and `ECO_PRO`, in the
  Studio and on the car (the same rule in both engines, checked by a test).
- Car app: switching themes no longer leaves the panel empty for a moment. The old layout's
  bottom layer stays until the new one is up, so the factory gauges don't flash in between
  (reported for another cluster app, idrive7-cluster-info #9). Tested locally with the car's
  engine; not tried on a car.

### Changed

- Car app: requires cluster-render 0.5.2 or newer. From 0.5.1 the panel has its own scene id and
  can show together with a HUD app; 0.5.2 fixes a crash after a renderer-side animation is
  stopped (idrive-apps #132), which the car app does. The renderer client is refreshed from
  upstream (0.5.5; it only adds the `yield` field, which idv7lol doesn't use). Checked locally: the client loads and
  parses as ES2017, and every theme still passes the car path test. Not tried on a car with
  0.5.x yet.
- Car app build: the kit's `build.py` is refreshed from upstream (MIT). On the head unit it now
  leaves out SOME/IP fields, accesses and instances the unit's firmware lacks and logs them,
  instead of BMW's installer refusing the whole app (idrive7-apps #145). Checked locally against
  a made-up interface catalog; not tried on a car.
- `mgu-repo.json` names `build.shared` (`kit`, `oap-sdk`), so on the Branch channel a Studio or
  docs commit is no longer offered to cars as an idv7lol update (mgu-store #205).
- CI builds every theme and every USB package with the car app's modules on Node 8.9.4 and
  8.16.2, the versions head units run.
- Docs: a warning before installing the MGU Store that the SSH unlock flash erases the head
  unit's coding (what is lost, recoding, Digital Key, flash only once), and install problems
  reported upstream in the troubleshooting guide.
- Renderer and compatibility docs follow cluster-render 0.5.x: the panel's scene id, panel and
  HUD together, `yield`, the new limits, and the iDrive 8 targets.
- First vehicle test: on a 2021 X4 M Competition (iDrive 7) the car app installed from the MGU
  Store, drew the Performance and Supercar Track themes, and turning it off restored the factory
  cluster. Status, compatibility and deployment docs now say so, and list what is still
  unconfirmed on a car.
- Docs: install from the Store with the Branch channel (`main`). The Tags channel skips
  pre-release tags such as `v0.2.0-beta.1`.

## [0.2.0-beta.1] - 2026-11-10

First pre-release: idv7lol Studio 0.2.0 for Windows and the car app 0.2.0. Experimental and
**not tested in a vehicle**.

### Added

- Car preview in the Studio: a canvas toggle runs the car app's own engine against a WebGL stand-in
  for cluster-render, so a theme can be seen drawn by the car's shaders before it goes to the car.
  Tested locally; the car's RAMSES renderer can still differ.
- Supercar Track theme: a wide segmented rev arc, a huge gear in the middle, oil, water and fuel
  columns and speed bottom right, with Track and Corsa palettes. Validates clean, 43 of 64 layers.
- My pieces: save components, pictures included, and reuse them in any theme.
- Resize several selected components at once; group and ungroup inside groups, with Escape stepping
  out to the group; edit text right on the canvas (double-click, Enter or F2).
- A test that runs every theme in the repository through the car path: compile, USB package, the
  car app's checks and the car's engine.

- Themes from a USB stick: the Studio's **Save for the car (USB)** writes a `.idv7pkg` package to
  `idv7lol/themes/` on a stick, and the car app (0.2.0) finds, checks and installs it by itself,
  with **Remove USB theme** to delete it. Packages carry no shaders. Tested locally; not tested in a
  vehicle.

- Images in the Studio: import from the computer by button, drag and drop or paste; assets embedded
  in the theme; full-window non-destructive editor with adjustments, looks, crop, rotate and flip,
  background removal, erase/restore brush, effects, compare, undo and a live view on the cluster.
- Compiler bakes each image's edits at its layer size and validates renderer pixel memory.
- MGU app draws image layers (tested locally against a fake renderer; not tested in a vehicle).
- Animated pictures: GIF, animated WebP, APNG and short videos (up to 12 s, 15 fps, 120 frames, no
  sound) import as a sprite sheet, play in the editor and compile to one atlas that the renderer
  loops by itself, with nothing sent per frame. Tested locally; not tested in a vehicle.
- Optional free templates in the Studio's welcome window: conversions of the seven Cluster Layouts by
  eroobeeroo (GPL-3.0-or-later), with credits and differences in `themes/community/README.md`.
- Monorepo foundation: npm workspaces, TypeScript project references, Vitest, ESLint, Prettier,
  GPL-3.0-or-later licence, contribution and security policies, issue and PR templates, CI.
- `@idv7lol/vehicle-signals`: signal catalog (60+ signals with units, ranges, availability),
  unit conversion, vehicle profiles (combustion, turbo, M, PHEV, BEV) and a timestamped signal
  bus. Tested locally.
- `@idv7lol/theme-schema`: versioned theme document format (schemaVersion 1) with 15 component
  types, bindings, conditions, keyframe animations, palettes per driving mode, display profile
  of the iDrive 7 cluster with its reserved zones. Tested locally.
- `@idv7lol/theme-engine`: Canvas2D renderer for every component type, binding evaluation
  with smoothing and staleness, animation player with triggers, hit testing, reserved-zone
  overlap detection, layer-cost estimation against the cluster-render limits. Tested locally.
- `@idv7lol/simulator`: virtual vehicle model, scenarios (idle, cold start, city, highway,
  track, redline, manual shifts, drive modes, signal loss, communication failure), overrides,
  faults, latency, recording and replay. Tested locally.
- `@idv7lol/theme-compiler`: validation with readable findings, compiler from components
  to GLSL layers (10 shaders), exact renderer layer budget, SDF atlas baking from TrueType/WOFF,
  PNG codec, bundle writer and CLI. Tested locally.
- Themes: IDV7LOL Performance, Modern, Classic and a minimal example; all validate clean.
- idv7lol Studio (Tauri 2 + React): canvas editor, library, inspector, layers, palettes,
  simulator, validation, animation clips, Build & Deploy, console, welcome templates, undo/redo,
  Spanish/English, dark/light, file dialogs, PNG export. Windows NSIS installer compiled
  (unsigned).
- idv7lol MGU app (Node 8): cluster-render engine with 60 Hz easing and fail-safe, signal
  providers via the MIT kit, menu with status/diagnostics pages, compiled themes embedded,
  `mgu-repo.json` for the MGU Store. Engine tested locally against a fake renderer client;
  **not tested in a vehicle**.
- Documentation: quick start, Studio user guide (EN) and guía de usuario (ES), theme
  development, component API, generated signals reference, build, deployment, compatibility,
  troubleshooting.

### Changed

- Studio interface: the supplied idv7lol logo and its colours, one icon set instead of text symbols,
  a File menu and a shorter toolbar, resizable panels that remember their size, and drawers in small
  windows. Tested locally in a browser.

### Fixed

- A theme could relax the display's reserved zones by redeclaring one with the same id.
- Save for the car and Export bundle could use a compile older than the latest edits.
- USB packages: a shader named like an Object property (`constructor`) passed the check, and
  malformed animations were not refused. A new copy of the theme on show is now reloaded.
- The car app retried a theme that failed to build on every tick, resending its layers.
- Importing a long or large video could take gigabytes before the frames were scaled down.
- On the car, segmented arcs drew as solid bands and the first and last arc numerals were cut;
  animated pictures could bleed between frames on wide sheets.
- Hidden groups still showed on the car; group opacity and conditions now reach their components.
- The Inspector showed raw keys such as `components.gauge.arc` instead of the component's name.
- Shortcuts acted on the theme behind the welcome window; Escape now closes it.
- Two quick image imports could take the same name, and the second replaced the first.
- Animation speed in the editor now matches the car; flush edges no longer count as covering a
  reserved zone; wide rev arcs are judged by the area they paint; an animation needs one duration
  per frame.
- Simulator: manual control kept a fault scenario's dropped signals, and the signal health read
  100 % during communication loss.
- Bring to front and Send to back swapped several selected components and ignored grouped ones;
  Build & Deploy forgot the compile when switching tabs; renaming a saved piece inserted it twice;
  menus now work from the keyboard; panel splitters had a dead zone; the Inspector fields, the
  simulator and the Build tab are now in Spanish; rulers follow light mode.

- The validator skipped the factory zones when a theme did not list them in its own layout.
- Studio desktop build: HTML5 drag and drop was disabled by Tauri's `dragDropEnabled`.
- Compiled `theme.json` was written before image sizes were settled.
