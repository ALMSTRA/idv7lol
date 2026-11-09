import { SIGNALS, type SignalDef } from './catalog.js';

/**
 * A vehicle profile lists which catalog signals a kind of car exposes. Themes
 * declare the profile they target; the validator warns when a theme binds a
 * signal the profile does not provide, and the simulator only generates the
 * profile's signals so previews are honest about what the car can show.
 */
export interface VehicleProfile {
  id: string;
  name: string;
  description: string;
  /** Signals that are not available on this kind of car. */
  excluded: readonly string[];
  /** Overrides of the catalog's defaults for this profile (e.g. redline). */
  overrides?: Readonly<Record<string, Partial<Pick<SignalDef, 'min' | 'max'>>>>;
}

const HYBRID_SIGNALS = SIGNALS.filter((s) => s.group === 'Hybrid').map((s) => s.id);
const TURBO_SIGNALS = ['engine.boost'];
const COMBUSTION_SIGNALS = SIGNALS.filter(
  (s) => s.group === 'Engine' || s.group === 'Fuel' || s.id.startsWith('engine.'),
).map((s) => s.id);

export const PROFILES: readonly VehicleProfile[] = [
  {
    id: 'generic-ice',
    name: 'Combustion engine (generic)',
    description:
      'Petrol or diesel car without turbo-specific or hybrid signals. The safest default.',
    excluded: [...HYBRID_SIGNALS, ...TURBO_SIGNALS],
  },
  {
    id: 'turbo-ice',
    name: 'Turbocharged combustion engine',
    description: 'Petrol or diesel car with charge pressure available.',
    excluded: [...HYBRID_SIGNALS],
  },
  {
    id: 'turbo-ice-sport',
    name: 'Turbocharged, high-revving (M / M Performance)',
    description: 'Turbo engine with a 7500+ rpm redline and sport transmission modes.',
    excluded: [...HYBRID_SIGNALS],
    overrides: { 'engine.rpm': { max: 8000 }, 'engine.rpm.redline': { max: 8000 } },
  },
  {
    id: 'phev',
    name: 'Plug-in hybrid',
    description: 'Combustion engine plus a traction battery (xDrive45e, 330e, 530e…).',
    excluded: [],
  },
  {
    id: 'bev',
    name: 'Battery electric',
    description: 'Electric drivetrain only (iX3, i4…): no engine speed, fuel or oil signals.',
    excluded: [...COMBUSTION_SIGNALS, 'transmission.oil.temp', 'transmission.shift.up'],
  },
];

export function getProfile(id: string): VehicleProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}

export function profileSignals(profile: VehicleProfile): SignalDef[] {
  const excluded = new Set(profile.excluded);
  return SIGNALS.filter((s) => !excluded.has(s.id)).map((s) => {
    const o = profile.overrides?.[s.id];
    return o ? { ...s, ...o } : s;
  });
}

export function profileHasSignal(profile: VehicleProfile, signalId: string): boolean {
  return !profile.excluded.includes(signalId) && SIGNALS.some((s) => s.id === signalId);
}

export const DEFAULT_PROFILE_ID = 'turbo-ice';
