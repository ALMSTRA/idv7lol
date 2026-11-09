# Compatibility

Status words: **developed**, **tested locally**, **compiled**, **published**, **tested in
vehicle**. Nothing below has reached _tested in vehicle_ yet.

## Head units

| Platform                  | Status                    | Notes                                                                                        |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| BMW iDrive 7 (MGU, "ID7") | developed, tested locally | target of this project; `cluster-render` `panel` 1920×720                                    |
| BMW iDrive 8 (MGU, "ID8") | not supported             | cluster-render has no `panel` target on ID8 (only `map` 874×749); the app logs and stays off |

The development car reports software `20w44.1-1-3`. That identifier names the head-unit
software release (I-step), **not** the renderer or the cluster. Capabilities are detected at run
time from cluster-render's `hello` (`backend`, `targets`), never assumed from that string.

## Dependencies on the head unit

| Component                                    | Minimum                           | Source                      |
| -------------------------------------------- | --------------------------------- | --------------------------- |
| MGU Store (mgu-deploy, app-privacy, updater) | current                           | robertnisipeanu/mgu-store   |
| cluster-render                               | 0.4.2 (64 layers/app)             | robertnisipeanu/idrive-apps |
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

| OS             | Status                                                            |
| -------------- | ----------------------------------------------------------------- |
| Windows 11 x64 | developed, tested locally (dev build)                             |
| Windows 10 x64 | expected to work (WebView2 required), not tested                  |
| macOS / Linux  | the web front end runs in a browser; no desktop build is provided |

## Tested in vehicle

None yet. When a run happens, record here: date, car (model, year, drivetrain), I-step,
cluster-render version, theme, result, issues.
