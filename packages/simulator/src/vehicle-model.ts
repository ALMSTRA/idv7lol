import type { DriveMode } from '@idv7lol/theme-schema';

/**
 * A deliberately simple but believable vehicle model. It is not a physics
 * engine: it produces plausible, smooth signals for previewing clusters.
 * Everything is in catalog units (km/h, rpm, °C, bar, %, litres).
 */

export type GearMode = 'D' | 'S' | 'M';
export type GearPosition = 'P' | 'R' | 'N' | 'D';

export interface VehicleParams {
  /** Idle speed, rpm. */
  idleRpm: number;
  /** Rev limiter, rpm. */
  redlineRpm: number;
  /** Rev limiter while the oil is cold. */
  coldRedlineRpm: number;
  /** Speed in km/h per 1000 rpm for each forward gear (1-based). */
  kmhPer1000Rpm: number[];
  /** Peak acceleration at full throttle in 1st gear, km/h per second. */
  peakAccel: number;
  /** Deceleration at full brake, km/h per second. */
  brakeDecel: number;
  /** Coast-down deceleration at 100 km/h, km/h per second. */
  dragAt100: number;
  /** Top speed, km/h. */
  topSpeed: number;
  /** Fuel tank, litres. */
  tankLitres: number;
  /** Litres per hour at idle and at full load. */
  idleLph: number;
  fullLoadLph: number;
  /** Has a turbocharger (boost signal). */
  turbo: boolean;
  /** Peak boost, bar. */
  peakBoost: number;
  /** Has a traction battery. */
  hybrid: boolean;
  /** Mass-like time constant for engine speed changes, seconds. */
  rpmTau: number;
}

export const DEFAULT_PARAMS: VehicleParams = {
  idleRpm: 750,
  redlineRpm: 7000,
  coldRedlineRpm: 4500,
  kmhPer1000Rpm: [8.5, 14.5, 21.5, 29, 37, 46, 56, 68],
  peakAccel: 22,
  brakeDecel: 35,
  dragAt100: 2.2,
  topSpeed: 250,
  tankLitres: 59,
  idleLph: 0.8,
  fullLoadLph: 45,
  turbo: true,
  peakBoost: 1.4,
  hybrid: false,
  rpmTau: 0.12,
};

export interface VehicleInputs {
  /** Ignition / running. */
  ignition: boolean;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  gearPosition: GearPosition;
  gearMode: GearMode;
  /** Gear requested in manual mode, 1-based. */
  manualGear: number;
  driveMode: DriveMode;
  turnLeft: boolean;
  turnRight: boolean;
  highBeam: boolean;
  lowBeam: boolean;
  handbrake: boolean;
  cruiseSpeed: number;
  outsideTemp: number;
}

export const DEFAULT_INPUTS: VehicleInputs = {
  ignition: true,
  throttle: 0,
  brake: 0,
  gearPosition: 'D',
  gearMode: 'D',
  manualGear: 1,
  driveMode: 'COMFORT',
  turnLeft: false,
  turnRight: false,
  highBeam: false,
  lowBeam: true,
  handbrake: false,
  cruiseSpeed: 0,
  outsideTemp: 18,
};

export interface VehicleState {
  speed: number;
  rpm: number;
  /** Engaged forward gear, 1-based (0 when in P/N/R). */
  gear: number;
  coolantTemp: number;
  oilTemp: number;
  transmissionTemp: number;
  intakeTemp: number;
  fuelLitres: number;
  boost: number;
  batteryVoltage: number;
  odometerKm: number;
  tripKm: number;
  /** Litres consumed on the trip (for averages). */
  tripLitres: number;
  instantConsumption: number;
  accelLon: number;
  accelLat: number;
  steeringAngle: number;
  hybridSoc: number;
  hybridPower: number;
  /** Seconds since the model started. */
  time: number;
  /** Turn-signal lamp phase (true = lit). */
  blinkPhase: boolean;
  /** Last shift time, for shift animation triggers. */
  lastShiftAt: number;
}

export function initialState(params: VehicleParams, cold = true): VehicleState {
  return {
    speed: 0,
    rpm: params.idleRpm,
    gear: 1,
    coolantTemp: cold ? 18 : 90,
    oilTemp: cold ? 18 : 95,
    transmissionTemp: cold ? 18 : 70,
    intakeTemp: 22,
    fuelLitres: params.tankLitres * 0.62,
    boost: 0,
    batteryVoltage: 14.2,
    odometerKm: 48213,
    tripKm: 0,
    tripLitres: 0,
    instantConsumption: 0,
    accelLon: 0,
    accelLat: 0,
    steeringAngle: 0,
    hybridSoc: 68,
    hybridPower: 0,
    time: 0,
    blinkPhase: false,
    lastShiftAt: -10,
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const approach = (cur: number, target: number, tau: number, dt: number) =>
  tau <= 0 ? target : cur + (target - cur) * (1 - Math.exp(-dt / tau));

export class VehicleModel {
  params: VehicleParams;
  inputs: VehicleInputs;
  state: VehicleState;

  constructor(params: Partial<VehicleParams> = {}, cold = true) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.inputs = { ...DEFAULT_INPUTS };
    this.state = initialState(this.params, cold);
  }

  reset(cold = true): void {
    this.state = initialState(this.params, cold);
  }

  get redline(): number {
    const p = this.params;
    const warm = clamp((this.state.oilTemp - 40) / 40, 0, 1);
    return p.coldRedlineRpm + (p.redlineRpm - p.coldRedlineRpm) * warm;
  }

  /** Advance the model by dt seconds. */
  step(dt: number): void {
    if (dt <= 0) return;
    const p = this.params;
    const s = this.state;
    const i = this.inputs;
    s.time += dt;

    const sportMode =
      i.driveMode === 'SPORT' || i.driveMode === 'SPORT_PLUS' || i.driveMode === 'TRACK';
    const throttle = clamp(i.throttle, 0, 1);
    const brake = clamp(i.brake, 0, 1);
    const moving = i.gearPosition === 'D' || i.gearPosition === 'R';

    if (!i.ignition) {
      // Everything winds down.
      s.rpm = approach(s.rpm, 0, 0.6, dt);
      s.speed = Math.max(
        0,
        s.speed - (p.dragAt100 * (s.speed / 100) + brake * p.brakeDecel + 1) * dt,
      );
      s.boost = approach(s.boost, 0, 0.3, dt);
      this.cool(dt);
      s.batteryVoltage = approach(s.batteryVoltage, 12.4, 5, dt);
      s.accelLon = 0;
      return;
    }

    // --- Gear selection
    const gears = p.kmhPer1000Rpm.length;
    if (!moving) {
      s.gear = 0;
    } else {
      if (i.gearMode === 'M') {
        const g = clamp(Math.round(i.manualGear), 1, gears);
        if (g !== s.gear) {
          s.gear = g;
          s.lastShiftAt = s.time;
        }
      } else {
        if (s.gear === 0) s.gear = 1;
        const rpmNow = this.rpmForSpeed(s.speed, s.gear);
        const up = sportMode || i.gearMode === 'S' ? this.redline * 0.95 : 2200 + throttle * 3300;
        const down = sportMode || i.gearMode === 'S' ? 3200 : 1300 + throttle * 1200;
        if (rpmNow > up && s.gear < gears && s.time - s.lastShiftAt > 0.5) {
          s.gear += 1;
          s.lastShiftAt = s.time;
        } else if (rpmNow < down && s.gear > 1 && s.time - s.lastShiftAt > 0.4) {
          s.gear -= 1;
          s.lastShiftAt = s.time;
        }
      }
    }

    // --- Engine speed target
    const limiter = this.redline;
    let rpmTarget: number;
    if (!moving || s.speed < 3) {
      rpmTarget = p.idleRpm + throttle * (limiter - p.idleRpm);
      if (moving && throttle > 0 && s.speed < 3) rpmTarget = Math.max(rpmTarget, 1400);
    } else {
      rpmTarget = this.rpmForSpeed(s.speed, Math.max(1, s.gear));
      if (rpmTarget > limiter) rpmTarget = limiter - 40 + Math.sin(s.time * 50) * 40; // bouncing off the limiter
    }
    s.rpm = approach(s.rpm, rpmTarget, p.rpmTau, dt);

    // --- Longitudinal dynamics
    let accel = 0;
    if (moving && throttle > 0 && s.rpm < limiter - 20) {
      // Torque curve: strong mid-range, tapering at the top; weaker in high gears.
      const rpmNorm = clamp(s.rpm / p.redlineRpm, 0, 1);
      const torque = 0.55 + 0.45 * Math.sin(Math.PI * clamp(rpmNorm * 1.1, 0, 1));
      const gearFactor = 1 / Math.pow(1.45, Math.max(0, s.gear - 1));
      const sportBoost = sportMode ? 1.08 : 1;
      accel += p.peakAccel * throttle * torque * gearFactor * sportBoost;
      if (i.gearPosition === 'R') accel *= 0.5;
    }
    const drag = p.dragAt100 * Math.pow(s.speed / 100, 2) + (s.speed > 0 ? 0.6 : 0);
    accel -= drag;
    accel -= brake * p.brakeDecel;
    if (i.handbrake && s.speed < 5) accel -= 10;
    if (i.cruiseSpeed > 0 && throttle === 0 && brake === 0 && moving) {
      const err = i.cruiseSpeed - s.speed;
      accel += clamp(err * 0.8, -4, 6);
    }
    const prevSpeed = s.speed;
    s.speed = clamp(s.speed + accel * dt, 0, p.topSpeed);
    if (s.speed <= 0 && accel < 0) s.speed = 0;
    s.accelLon = (s.speed - prevSpeed) / 3.6 / dt / 9.80665;
    s.accelLat = approach(s.accelLat, (s.steeringAngle / 90) * (s.speed / 100) * 0.8, 0.3, dt);

    // --- Distance and fuel
    const km = (s.speed / 3600) * dt;
    s.odometerKm += km;
    s.tripKm += km;
    const load = clamp(throttle * 0.8 + (s.rpm / p.redlineRpm) * 0.2, 0, 1);
    const lph = p.idleLph + (p.fullLoadLph - p.idleLph) * load * (s.speed > 2 ? 1 : 0.4);
    const litres = (lph / 3600) * dt;
    s.fuelLitres = Math.max(0, s.fuelLitres - litres);
    s.tripLitres += litres;
    const instant = s.speed > 5 ? (lph / s.speed) * 100 : 0;
    s.instantConsumption = approach(s.instantConsumption, clamp(instant, 0, 60), 0.5, dt);

    // --- Boost
    if (p.turbo) {
      const spool = clamp((s.rpm - 1500) / 2000, 0, 1);
      const target =
        throttle > 0.1
          ? -0.3 + (p.peakBoost + 0.3) * throttle * spool
          : -0.6 + 0.4 * (s.rpm / p.redlineRpm);
      s.boost = approach(s.boost, target, throttle > 0.1 ? 0.35 : 0.15, dt);
    } else {
      s.boost = 0;
    }

    // --- Thermals
    const heat = 0.3 + load * 1.2 + (s.speed > 2 ? 0.2 : 0);
    s.coolantTemp = approach(s.coolantTemp, 88 + load * 8, 90 / heat, dt);
    s.oilTemp = approach(s.oilTemp, 92 + load * 28 - (s.speed > 120 ? 4 : 0), 220 / heat, dt);
    s.transmissionTemp = approach(s.transmissionTemp, 70 + load * 25, 260 / heat, dt);
    s.intakeTemp = approach(s.intakeTemp, i.outsideTemp + 6 + Math.max(0, s.boost) * 18, 8, dt);
    s.batteryVoltage = approach(s.batteryVoltage, s.rpm > 400 ? 14.3 - load * 0.3 : 12.3, 2, dt);

    // --- Hybrid
    if (p.hybrid) {
      const power =
        throttle > 0.05 ? throttle * 80 : brake > 0.05 ? -brake * 60 : s.speed > 2 ? -6 : 0;
      s.hybridPower = approach(s.hybridPower, power, 0.4, dt);
      s.hybridSoc = clamp(s.hybridSoc - (s.hybridPower / 3600) * dt * 7, 0, 100);
    }

    // --- Lamps
    s.blinkPhase = Math.floor(s.time / 0.4) % 2 === 0;
  }

  private cool(dt: number): void {
    const s = this.state;
    const amb = this.inputs.outsideTemp;
    s.coolantTemp = approach(s.coolantTemp, amb, 900, dt);
    s.oilTemp = approach(s.oilTemp, amb, 1500, dt);
    s.transmissionTemp = approach(s.transmissionTemp, amb, 1800, dt);
    s.intakeTemp = approach(s.intakeTemp, amb, 60, dt);
  }

  rpmForSpeed(kmh: number, gear: number): number {
    const ratio = this.params.kmhPer1000Rpm[clamp(gear, 1, this.params.kmhPer1000Rpm.length) - 1]!;
    return Math.max(this.params.idleRpm, (kmh / ratio) * 1000);
  }

  /** Gear string as the factory cluster would show it. */
  gearLabel(): string {
    const i = this.inputs;
    if (i.gearPosition !== 'D') return i.gearPosition;
    // The factory cluster shows "D" in Drive and the engaged gear in Sport/Manual.
    if (i.gearMode === 'D') return 'D';
    return String(Math.max(1, this.state.gear));
  }

  fuelPercent(): number {
    return (this.state.fuelLitres / this.params.tankLitres) * 100;
  }

  rangeKm(): number {
    const avg = this.state.tripKm > 0.5 ? (this.state.tripLitres / this.state.tripKm) * 100 : 7.5;
    return avg > 0 ? (this.state.fuelLitres / avg) * 100 : 0;
  }

  averageConsumption(): number {
    return this.state.tripKm > 0.05 ? (this.state.tripLitres / this.state.tripKm) * 100 : 0;
  }
}
