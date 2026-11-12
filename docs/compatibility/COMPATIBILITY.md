# Compatibility

Status words: **developed**, **tested locally**, **compiled**, **published**, **tested in
vehicle**. Only what the _Tested in vehicle_ section lists has reached that state.

## Head units

| Platform                  | Status            | Notes                                                                                                                                                 |
| ------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| BMW iDrive 7 (MGU, "ID7") | tested in vehicle | target of this project; `cluster-render` `panel` 1920×720; one car so far (see below)                                                                 |
| BMW iDrive 8 (MGU, "ID8") | not supported     | no full-cluster target on ID8: `map` 874×749, `hud`, `guide`, `widget`/`popup` (centre only); the Store won't install idv7lol there (`mguHmi` is ID7) |

The development car reports software `20w44.1-1-3`. That identifier names the head-unit
software release (I-step), **not** the renderer or the cluster. Capabilities are detected at run
time from cluster-render's `hello` (`backend`, `targets`), never assumed from that string.

## Dependencies on the head unit

| Component                                    | Minimum                           | Source                      |
| -------------------------------------------- | --------------------------------- | --------------------------- |
| MGU Store (mgu-deploy, app-privacy, updater) | current                           | robertnisipeanu/mgu-store   |
| cluster-render                               | 0.5.2 (see RENDERER.md)           | robertnisipeanu/idrive-apps |
| Node.js on the unit                          | 8.7+ (8.16.2 on current firmware) | BMW firmware                |
| Python on the unit (build from source)       | mgu-python                        | installed by the Store      |

## Vehicle signals

See [../developer/SIGNALS.md](../developer/SIGNALS.md). Mapped on the car: engine speed,
speed, coolant and oil temperature, torque, longitudinal/lateral acceleration, gear and gearbox
programme, drive mode, boost (cars with the sport display), outside temperature, gearbox oil
(optional interface). Not yet mapped: fuel level, ranges, 12 V battery, lights, cruise, hybrid
values, tyre pressures, time signals (the clock uses the unit clock plus a UTC offset setting).

Drivetrains: the vehicle profiles `generic-ice`, `turbo-ice`, `turbo-ice-sport`, `phev`, `bev`
only affect validation and simulation; the car app reads whatever the unit provides.

## Studio

| OS             | Status                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Windows 11 x64 | developed, tested locally (dev build)                                                                    |
| Windows 10 x64 | expected to work (WebView2 required), not tested                                                         |
| macOS 10.15+   | compiled in CI (universal: Apple silicon and Intel), not tested on a Mac; see `docs/user/INSTALL_MAC.md` |
| Linux          | no desktop build is provided                                                                             |

## Tested in vehicle

Record each run here: date, car (model, year, drivetrain), I-step, cluster-render version, theme,
result, issues.

| Date          | Car                               | I-step       | cluster-render | Themes                      | Result                                                                                |
| ------------- | --------------------------------- | ------------ | -------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| November 2026 | X4 M Competition (F98), 2021, ICE | not recorded | not recorded   | Performance, Supercar Track | installs from the Store (Branch channel, `main`), draws, turning off restores factory |

Not checked in that run: telltales and pop-ups on top, values against the factory gauges, other
themes and palettes, USB themes, images and animations.

## Installing from the Store

Add `ALMSTRA/idv7lol` with the **Branch** channel (`main`). The Tags channel skips pre-release
tags such as `v0.2.0-beta.1`, so idv7lol is not listed there until a plain version tag exists.
