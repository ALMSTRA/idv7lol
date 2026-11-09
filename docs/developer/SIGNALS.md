# Signals

_Generated from `packages/vehicle-signals/src/catalog.ts` by `tools/development/gen-signals-doc.ts`. Do not edit by hand._

Themes bind components to **catalog signal ids**. The catalog is idv7lol's own stable naming; the MGU app maps each id to the head unit's SOME/IP fields (see `apps/idv7lol/vehicle.js`). Values are stored in the canonical unit of each signal; components may display another unit of the same dimension.

## Availability

| Level           | Meaning                                                         |
| --------------- | --------------------------------------------------------------- |
| core            | present on every iDrive 7 MGU car; safe to require              |
| common          | present on most cars; may be missing on some engines or markets |
| model-dependent | only on some drivetrains (turbo, hybrid, xDrive…)               |
| experimental    | observed but not verified on real hardware by this project      |

**Mapped on the car today** (`apps/idv7lol/vehicle.js`): `engine.rpm`, `vehicle.speed`, `engine.coolant.temp`, `engine.oil.temp`, `engine.running`, `engine.torque`, `engine.boost`, `chassis.accel.lon`, `chassis.accel.lat`, `transmission.gear`, `transmission.mode`, `transmission.oil.temp`, `drive.mode`, `environment.outside.temp`. Everything else shows the component's fallback until a provider is added. Nothing has been verified in a vehicle by idv7lol yet.

## Catalog

### Vehicle

| Id                      | Name          | Kind   | Unit | Range       | Rate      | Availability | Description                                                                         |
| ----------------------- | ------------- | ------ | ---- | ----------- | --------- | ------------ | ----------------------------------------------------------------------------------- |
| `vehicle.speed`         | Vehicle speed | number | km/h | 0 … 330     | 20 Hz     | core         | Road speed as displayed by the factory cluster (includes the legal display offset). |
| `vehicle.speed.gps`     | GPS speed     | number | km/h | 0 … 330     | 1 Hz      | experimental | Speed from the navigation receiver; may lag.                                        |
| `vehicle.odometer`      | Odometer      | number | km   | 0 … 2000000 | on change | core         | Total distance. Read-only; never written by idv7lol.                                |
| `vehicle.trip.distance` | Trip distance | number | km   | 0 … 99999   | 1 Hz      | common       | Current trip distance.                                                              |

### Fuel

| Id                         | Name                | Kind    | Unit    | Range        | Rate | Availability | Description                                      |
| -------------------------- | ------------------- | ------- | ------- | ------------ | ---- | ------------ | ------------------------------------------------ |
| `vehicle.range`            | Remaining range     | number  | km      | 0 … 2000     | 1 Hz | core         | Estimated remaining range on the current energy. |
| `fuel.level`               | Fuel level          | number  | %       | 0 … 100      | 1 Hz | core         | Tank level in percent.                           |
| `fuel.volume`              | Fuel volume         | number  | l       | 0 … 120      | 1 Hz | common       | Fuel in the tank.                                |
| `fuel.consumption.instant` | Instant consumption | number  | l/100km | 0 … 60       | 2 Hz | common       | Instantaneous fuel consumption.                  |
| `fuel.consumption.average` | Average consumption | number  | l/100km | 0 … 60       | 1 Hz | common       | Average consumption of the current trip.         |
| `fuel.low`                 | Low fuel            | boolean | —       | true / false | 1 Hz | core         | Reserve warning active.                          |

### Driver

| Id                      | Name                 | Kind    | Unit | Range                                                | Rate  | Availability | Description                                             |
| ----------------------- | -------------------- | ------- | ---- | ---------------------------------------------------- | ----- | ------------ | ------------------------------------------------------- |
| `vehicle.cruise.speed`  | Cruise set speed     | number  | km/h | 0 … 250                                              | 2 Hz  | common       | Set speed of the cruise control / ACC, 0 when inactive. |
| `vehicle.cruise.active` | Cruise active        | boolean | —    | true / false                                         | 2 Hz  | common       | Cruise control or ACC is regulating.                    |
| `engine.throttle`       | Accelerator position | number  | %    | 0 … 100                                              | 20 Hz | core         | Accelerator pedal position.                             |
| `drive.mode`            | Driving mode         | enum    | —    | ECO_PRO, COMFORT, SPORT, SPORT_PLUS, ADAPTIVE, TRACK | 1 Hz  | core         | Driving Experience Control mode.                        |
| `chassis.brake`         | Brake pedal          | number  | %    | 0 … 100                                              | 20 Hz | common       | Brake pressure / pedal position.                        |

### Environment

| Id                         | Name                | Kind    | Unit | Range        | Rate   | Availability    | Description                                                 |
| -------------------------- | ------------------- | ------- | ---- | ------------ | ------ | --------------- | ----------------------------------------------------------- |
| `vehicle.speed.limit`      | Speed limit         | number  | km/h | 0 … 200      | 1 Hz   | model-dependent | Speed limit recognised by the camera / map, 0 when unknown. |
| `environment.outside.temp` | Outside temperature | number  | °C   | -50 … 70     | 0.2 Hz | core            | Ambient temperature.                                        |
| `environment.night`        | Night mode          | boolean | —    | true / false | 0.2 Hz | core            | The cluster is in night illumination.                       |
| `environment.brightness`   | Display brightness  | number  | %    | 0 … 100      | 1 Hz   | common          | Cluster backlight level.                                    |

### Engine

| Id                   | Name           | Kind    | Unit | Range        | Rate      | Availability | Description                                                    |
| -------------------- | -------------- | ------- | ---- | ------------ | --------- | ------------ | -------------------------------------------------------------- |
| `engine.rpm`         | Engine speed   | number  | rpm  | 0 … 9000     | 20 Hz     | core         | Crankshaft speed.                                              |
| `engine.rpm.redline` | Redline        | number  | rpm  | 0 … 9000     | on change | common       | Current maximum engine speed (lower while the engine is cold). |
| `engine.running`     | Engine running | boolean | —    | true / false | 2 Hz      | core         | The combustion engine is running.                              |
| `engine.load`        | Engine load    | number  | %    | 0 … 100      | 10 Hz     | common       | Calculated engine load.                                        |
| `engine.torque`      | Engine torque  | number  | Nm   | -200 … 1000  | 10 Hz     | common       | Actual engine torque.                                          |
| `engine.power`       | Engine power   | number  | kW   | 0 … 600      | 10 Hz     | common       | Actual engine power.                                           |

### Pressures

| Id                     | Name               | Kind   | Unit | Range   | Rate  | Availability    | Description                                                                               |
| ---------------------- | ------------------ | ------ | ---- | ------- | ----- | --------------- | ----------------------------------------------------------------------------------------- |
| `engine.boost`         | Boost pressure     | number | bar  | -1 … 3  | 20 Hz | model-dependent | Charge pressure relative to atmosphere; negative under vacuum. Turbocharged engines only. |
| `engine.oil.pressure`  | Oil pressure       | number | bar  | 0 … 10  | 5 Hz  | model-dependent | Engine oil pressure.                                                                      |
| `engine.fuel.pressure` | Fuel rail pressure | number | bar  | 0 … 400 | 5 Hz  | model-dependent | High-pressure fuel rail.                                                                  |

### Temperatures

| Id                      | Name                         | Kind   | Unit | Range     | Rate | Availability    | Description                            |
| ----------------------- | ---------------------------- | ------ | ---- | --------- | ---- | --------------- | -------------------------------------- |
| `engine.intake.temp`    | Intake air temperature       | number | °C   | -40 … 120 | 2 Hz | common          | Air temperature after the intercooler. |
| `engine.oil.temp`       | Oil temperature              | number | °C   | -40 … 160 | 1 Hz | core            | Engine oil temperature.                |
| `engine.coolant.temp`   | Coolant temperature          | number | °C   | -40 … 140 | 1 Hz | core            | Engine coolant temperature.            |
| `transmission.oil.temp` | Transmission oil temperature | number | °C   | -40 … 160 | 1 Hz | model-dependent | Gearbox oil temperature.               |

### Transmission

| Id                      | Name              | Kind    | Unit | Range                                     | Rate | Availability | Description                                              |
| ----------------------- | ----------------- | ------- | ---- | ----------------------------------------- | ---- | ------------ | -------------------------------------------------------- |
| `transmission.gear`     | Gear              | enum    | —    | P, R, N, D, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 | 5 Hz | core         | Selected / engaged gear as the factory cluster shows it. |
| `transmission.mode`     | Transmission mode | enum    | —    | D, S, M                                   | 2 Hz | core         | Drive, Sport or Manual shifting.                         |
| `transmission.shift.up` | Upshift request   | boolean | —    | true / false                              | 5 Hz | common       | The factory shift indicator asks for an upshift.         |

### Electrical

| Id                           | Name            | Kind   | Unit | Range      | Rate | Availability | Description                                   |
| ---------------------------- | --------------- | ------ | ---- | ---------- | ---- | ------------ | --------------------------------------------- |
| `electrical.battery.voltage` | Battery voltage | number | V    | 0 … 18     | 1 Hz | core         | 12 V on-board battery voltage.                |
| `electrical.battery.current` | Battery current | number | A    | -300 … 300 | 1 Hz | common       | 12 V battery current, positive when charging. |

### Hybrid

| Id                      | Name                             | Kind   | Unit | Range                                    | Rate  | Availability    | Description                                                      |
| ----------------------- | -------------------------------- | ------ | ---- | ---------------------------------------- | ----- | --------------- | ---------------------------------------------------------------- |
| `hybrid.battery.soc`    | High-voltage battery charge      | number | %    | 0 … 100                                  | 1 Hz  | model-dependent | State of charge of the traction battery (PHEV/BEV).              |
| `hybrid.battery.power`  | High-voltage battery power       | number | kW   | -200 … 400                               | 10 Hz | model-dependent | Power flow of the traction battery; negative while recuperating. |
| `hybrid.battery.temp`   | High-voltage battery temperature | number | °C   | -40 … 80                                 | 1 Hz  | model-dependent | Traction battery temperature.                                    |
| `hybrid.electric.range` | Electric range                   | number | km   | 0 … 800                                  | 1 Hz  | model-dependent | Range on electric power only.                                    |
| `hybrid.mode`           | Hybrid mode                      | enum   | —    | HYBRID, ELECTRIC, SPORT, BATTERY_CONTROL | 1 Hz  | model-dependent | eDrive operating mode.                                           |

### Chassis

| Id                         | Name                      | Kind    | Unit | Range        | Rate      | Availability    | Description                                         |
| -------------------------- | ------------------------- | ------- | ---- | ------------ | --------- | --------------- | --------------------------------------------------- |
| `chassis.steering.angle`   | Steering angle            | number  | °    | -720 … 720   | 20 Hz     | common          | Steering wheel angle, positive to the left.         |
| `chassis.accel.lon`        | Longitudinal acceleration | number  | g    | -2 … 2       | 20 Hz     | common          | Acceleration along the car, positive forward.       |
| `chassis.accel.lat`        | Lateral acceleration      | number  | g    | -2 … 2       | 20 Hz     | common          | Acceleration across the car, positive to the right. |
| `chassis.yaw.rate`         | Yaw rate                  | number  | °    | -200 … 200   | 20 Hz     | experimental    | Rotation rate around the vertical axis, deg/s.      |
| `chassis.handbrake`        | Parking brake             | boolean | —    | true / false | 1 Hz      | core            | Parking brake engaged.                              |
| `chassis.tyre.pressure.fl` | Tyre pressure front left  | number  | bar  | 0 … 5        | on change | model-dependent | Tyre pressure, front left.                          |
| `chassis.tyre.pressure.fr` | Tyre pressure front right | number  | bar  | 0 … 5        | on change | model-dependent | Tyre pressure, front right.                         |
| `chassis.tyre.pressure.rl` | Tyre pressure rear left   | number  | bar  | 0 … 5        | on change | model-dependent | Tyre pressure, rear left.                           |
| `chassis.tyre.pressure.rr` | Tyre pressure rear right  | number  | bar  | 0 … 5        | on change | model-dependent | Tyre pressure, rear right.                          |

### Lighting

| Id                 | Name              | Kind    | Unit | Range        | Rate | Availability | Description                                   |
| ------------------ | ----------------- | ------- | ---- | ------------ | ---- | ------------ | --------------------------------------------- |
| `light.turn.left`  | Turn signal left  | boolean | —    | true / false | 5 Hz | core         | Left indicator lamp currently lit (flashes).  |
| `light.turn.right` | Turn signal right | boolean | —    | true / false | 5 Hz | core         | Right indicator lamp currently lit (flashes). |
| `light.high.beam`  | High beam         | boolean | —    | true / false | 1 Hz | common       | High beam on.                                 |
| `light.low.beam`   | Low beam          | boolean | —    | true / false | 1 Hz | common       | Low beam on.                                  |
| `light.fog.rear`   | Rear fog light    | boolean | —    | true / false | 1 Hz | common       | Rear fog light on.                            |

### Time

| Id             | Name   | Kind   | Unit | Range  | Rate | Availability | Description          |
| -------------- | ------ | ------ | ---- | ------ | ---- | ------------ | -------------------- |
| `time.hours`   | Hour   | number | —    | 0 … 23 | 1 Hz | core         | Local time, hours.   |
| `time.minutes` | Minute | number | —    | 0 … 59 | 1 Hz | core         | Local time, minutes. |
| `time.seconds` | Second | number | —    | 0 … 59 | 1 Hz | core         | Local time, seconds. |

### System

| Id                          | Name               | Kind    | Unit | Range        | Rate | Availability | Description                                             |
| --------------------------- | ------------------ | ------- | ---- | ------------ | ---- | ------------ | ------------------------------------------------------- |
| `system.signal.health`      | Signal health      | number  | %    | 0 … 100      | 1 Hz | core         | Share of bound signals currently delivering fresh data. |
| `system.renderer.connected` | Renderer connected | boolean | —    | true / false | 1 Hz | core         | The cluster renderer accepted our layer.                |

## Vehicle profiles

A theme declares the profile it targets; the validator warns when it binds a signal the profile does not provide and the simulator only produces the profile's signals.

| Profile           | Description                                                                        | Signals not available                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generic-ice`     | Petrol or diesel car without turbo-specific or hybrid signals. The safest default. | `engine.boost`, `hybrid.battery.soc`, `hybrid.battery.power`, `hybrid.battery.temp`, `hybrid.electric.range`, `hybrid.mode`                                                                                                                                                                                                                                                                                                |
| `turbo-ice`       | Petrol or diesel car with charge pressure available.                               | `hybrid.battery.soc`, `hybrid.battery.power`, `hybrid.battery.temp`, `hybrid.electric.range`, `hybrid.mode`                                                                                                                                                                                                                                                                                                                |
| `turbo-ice-sport` | Turbo engine with a 7500+ rpm redline and sport transmission modes.                | `hybrid.battery.soc`, `hybrid.battery.power`, `hybrid.battery.temp`, `hybrid.electric.range`, `hybrid.mode`                                                                                                                                                                                                                                                                                                                |
| `phev`            | Combustion engine plus a traction battery (xDrive45e, 330e, 530e…).                | —                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `bev`             | Electric drivetrain only (iX3, i4…): no engine speed, fuel or oil signals.         | `vehicle.range`, `engine.rpm`, `engine.rpm.redline`, `engine.running`, `engine.throttle`, `engine.load`, `engine.torque`, `engine.power`, `engine.boost`, `engine.intake.temp`, `engine.oil.temp`, `engine.oil.pressure`, `engine.coolant.temp`, `engine.fuel.pressure`, `transmission.oil.temp`, `transmission.shift.up`, `fuel.level`, `fuel.volume`, `fuel.consumption.instant`, `fuel.consumption.average`, `fuel.low` |

## Units

| Unit         | Symbol    | Dimension    |
| ------------ | --------- | ------------ |
| `none`       | —         | none         |
| `kmh`        | km/h      | speed        |
| `mph`        | mph       | speed        |
| `rpm`        | rpm       | rotation     |
| `celsius`    | °C        | temperature  |
| `fahrenheit` | °F        | temperature  |
| `bar`        | bar       | pressure     |
| `psi`        | psi       | pressure     |
| `kpa`        | kPa       | pressure     |
| `volt`       | V         | voltage      |
| `ampere`     | A         | current      |
| `kw`         | kW        | power        |
| `hp`         | hp        | power        |
| `nm`         | Nm        | torque       |
| `percent`    | %         | ratio        |
| `km`         | km        | distance     |
| `mi`         | mi        | distance     |
| `m`          | m         | distance     |
| `liter`      | l         | volume       |
| `gallon_us`  | gal       | volume       |
| `l_100km`    | l/100km   | consumption  |
| `mpg_us`     | mpg       | consumption  |
| `kwh_100km`  | kWh/100km | consumption  |
| `g`          | g         | acceleration |
| `ms2`        | m/s²      | acceleration |
| `deg`        | °         | angle        |
| `seconds`    | s         | time         |
| `minutes`    | min       | time         |
| `hours`      | h         | time         |
