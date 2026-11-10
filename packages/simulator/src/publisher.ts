import type { SignalBus } from '@idv7lol/vehicle-signals';
import { getProfile, profileHasSignal, type VehicleProfile } from '@idv7lol/vehicle-signals';
import type { VehicleModel } from './vehicle-model.js';

export interface FaultState {
  /** Signals reported as unavailable. */
  dropped: Set<string>;
  /** Stop every update (the app lost its link to the vehicle bus). */
  commLoss: boolean;
  /** Extra age added to every sample, ms (simulates latency). */
  latencyMs: number;
}

export type SignalOverrides = Map<string, number | string | boolean>;

/** Values the model produces for each catalog signal it knows about. */
export function modelSignals(
  m: VehicleModel,
  nowDate: Date,
): Record<string, number | string | boolean> {
  const s = m.state;
  const i = m.inputs;
  const redline = m.redline;
  return {
    'vehicle.speed': Math.round(s.speed),
    'vehicle.speed.gps': Math.round(s.speed * 0.98),
    'vehicle.odometer': Math.floor(s.odometerKm),
    'vehicle.trip.distance': Math.round(s.tripKm * 10) / 10,
    'vehicle.range': Math.round(m.rangeKm()),
    'vehicle.cruise.speed': i.cruiseSpeed,
    'vehicle.cruise.active': i.cruiseSpeed > 0 && i.brake === 0,
    'vehicle.speed.limit': s.speed > 80 ? 120 : s.speed > 40 ? 50 : 30,
    'engine.rpm': Math.round(s.rpm),
    'engine.rpm.redline': Math.round(redline),
    'engine.running': i.ignition,
    'engine.throttle': Math.round(i.throttle * 100),
    'engine.load': Math.round(Math.min(100, i.throttle * 80 + (s.rpm / m.params.redlineRpm) * 20)),
    'engine.torque': Math.round(
      i.throttle * 480 * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, s.rpm / m.params.redlineRpm))),
    ),
    'engine.power': Math.round(
      (i.throttle *
        480 *
        (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, s.rpm / m.params.redlineRpm))) *
        s.rpm) /
        9549,
    ),
    'engine.boost': Math.round(s.boost * 100) / 100,
    'engine.intake.temp': Math.round(s.intakeTemp),
    'engine.oil.temp': Math.round(s.oilTemp),
    'engine.oil.pressure': Math.round((1.2 + (s.rpm / 1000) * 0.9) * 10) / 10,
    'engine.coolant.temp': Math.round(s.coolantTemp),
    'engine.fuel.pressure': Math.round(100 + i.throttle * 150),
    'transmission.gear': m.gearLabel(),
    'transmission.mode': i.gearMode,
    'transmission.oil.temp': Math.round(s.transmissionTemp),
    'transmission.shift.up': s.rpm > redline * 0.9 && i.gearMode === 'M',
    'fuel.level': Math.round(m.fuelPercent()),
    'fuel.volume': Math.round(s.fuelLitres * 10) / 10,
    'fuel.consumption.instant': Math.round(s.instantConsumption * 10) / 10,
    'fuel.consumption.average': Math.round(m.averageConsumption() * 10) / 10,
    'fuel.low': m.fuelPercent() < 12,
    'electrical.battery.voltage': Math.round(s.batteryVoltage * 10) / 10,
    'electrical.battery.current': Math.round(s.rpm > 400 ? 18 - i.throttle * 6 : -12),
    'hybrid.battery.soc': Math.round(s.hybridSoc),
    'hybrid.battery.power': Math.round(s.hybridPower * 10) / 10,
    'hybrid.battery.temp': Math.round(24 + Math.abs(s.hybridPower) * 0.1),
    'hybrid.electric.range': Math.round(s.hybridSoc * 0.45),
    'hybrid.mode': i.driveMode === 'SPORT' ? 'SPORT' : 'HYBRID',
    'drive.mode': i.driveMode,
    'chassis.brake': Math.round(i.brake * 100),
    'chassis.steering.angle': Math.round(s.steeringAngle),
    'chassis.accel.lon': Math.round(s.accelLon * 100) / 100,
    'chassis.accel.lat': Math.round(s.accelLat * 100) / 100,
    'chassis.yaw.rate': Math.round(s.accelLat * 30),
    'chassis.handbrake': i.handbrake,
    'chassis.tyre.pressure.fl': 2.4,
    'chassis.tyre.pressure.fr': 2.4,
    'chassis.tyre.pressure.rl': 2.6,
    'chassis.tyre.pressure.rr': 2.6,
    'light.turn.left': i.turnLeft && s.blinkPhase,
    'light.turn.right': i.turnRight && s.blinkPhase,
    'light.high.beam': i.highBeam,
    'light.low.beam': i.lowBeam,
    'light.fog.rear': false,
    'environment.outside.temp': Math.round(i.outsideTemp * 10) / 10,
    'environment.night': nowDate.getHours() >= 19 || nowDate.getHours() < 7,
    'environment.brightness': 80,
    'time.hours': nowDate.getHours(),
    'time.minutes': nowDate.getMinutes(),
    'time.seconds': nowDate.getSeconds(),
    'system.renderer.connected': true,
  };
}

/**
 * Writes the model's signals into a bus, respecting the vehicle profile,
 * manual overrides and injected faults.
 */
export class SignalPublisher {
  profile: VehicleProfile;
  readonly overrides: SignalOverrides = new Map();
  readonly faults: FaultState = { dropped: new Set(), commLoss: false, latencyMs: 0 };

  constructor(profileId = 'turbo-ice') {
    this.profile = getProfile(profileId) ?? getProfile('turbo-ice')!;
  }

  setProfile(id: string): void {
    const p = getProfile(id);
    if (p) this.profile = p;
  }

  publish(bus: SignalBus, model: VehicleModel, now: number, wall: Date = new Date()): string[] {
    if (this.faults.commLoss) {
      // Nothing arrives, so the values go stale; the health reading says so.
      bus.set('system.signal.health', 0, now);
      return [];
    }
    const values = modelSignals(model, wall);
    const written: string[] = [];
    const at = now - this.faults.latencyMs;
    for (const [id, raw] of Object.entries(values)) {
      if (!profileHasSignal(this.profile, id)) continue;
      if (this.faults.dropped.has(id)) {
        bus.invalidate(id, at);
        continue;
      }
      const v = this.overrides.has(id) ? this.overrides.get(id)! : raw;
      bus.set(id, v, at);
      written.push(id);
    }
    // health = share of signals actually written this pass
    const total = written.length + this.faults.dropped.size;
    bus.set('system.signal.health', total ? Math.round((written.length / total) * 100) : 0, at);
    return written;
  }
}
