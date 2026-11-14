import {
  ComponentSchema,
  type Component,
  type ComponentInput,
  type ComponentType,
} from './components.js';
import { ThemeSchema, type Theme, type ThemeInput, SCHEMA_VERSION } from './theme.js';
import { DEFAULT_DISPLAY_PROFILE_ID, getDisplayProfile } from './display-profiles.js';

/** Default box size for a freshly dropped component, in layout pixels. */
export const DEFAULT_SIZES: Readonly<Record<ComponentType, { width: number; height: number }>> = {
  rect: { width: 200, height: 120 },
  ellipse: { width: 160, height: 160 },
  line: { width: 300, height: 2 },
  arc: { width: 300, height: 300 },
  text: { width: 240, height: 48 },
  image: { width: 200, height: 200 },
  'gauge.arc': { width: 520, height: 520 },
  'gauge.bar': { width: 600, height: 40 },
  'value.digital': { width: 320, height: 160 },
  'indicator.gear': { width: 160, height: 160 },
  'indicator.shiftlights': { width: 700, height: 40 },
  clock: { width: 200, height: 48 },
  telltale: { width: 64, height: 64 },
  'status.panel': { width: 360, height: 220 },
  alert: { width: 420, height: 72 },
  group: { width: 400, height: 300 },
};

/** Minimal props a component type needs beyond its defaults. */
function requiredProps(type: ComponentType): Record<string, unknown> {
  switch (type) {
    case 'line':
      return { stroke: { color: '$text-muted', width: 2 } };
    case 'arc':
      return { stroke: { color: '$track', width: 12 } };
    case 'image':
      return { asset: 'logo' };
    case 'status.panel':
      return {
        rows: [
          { label: 'Oil', binding: { signal: 'engine.oil.temp' }, format: '0', unit: 'celsius' },
          {
            label: 'Coolant',
            binding: { signal: 'engine.coolant.temp' },
            format: '0',
            unit: 'celsius',
          },
          {
            label: 'Battery',
            binding: { signal: 'electrical.battery.voltage' },
            format: '0.0',
            unit: 'volt',
          },
        ],
      };
    case 'group':
      return { children: [] };
    default:
      return {};
  }
}

/** Default binding for component types that are useless without data. */
function defaultBinding(type: ComponentType): ComponentInput['binding'] | undefined {
  switch (type) {
    case 'gauge.arc':
      return { signal: 'engine.rpm', smoothing: 0.08 };
    case 'gauge.bar':
      return { signal: 'fuel.level' };
    case 'value.digital':
      return { signal: 'vehicle.speed' };
    case 'indicator.gear':
      return { signal: 'transmission.gear' };
    case 'indicator.shiftlights':
      return { signal: 'engine.rpm' };
    case 'telltale':
      return { signal: 'light.turn.left' };
    default:
      return undefined;
  }
}

let counter = 0;
export function nextComponentId(type: ComponentType, existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  const base = type.replace(/\./g, '-');
  let id = '';
  do {
    counter += 1;
    id = `${base}-${counter}`;
  } while (taken.has(id));
  return id;
}

/**
 * Create a component with every default applied. `overrides` may set any
 * field, including partial `props`.
 */
export function createComponent(
  type: ComponentType,
  overrides: Partial<Omit<ComponentInput, 'type' | 'props'>> & {
    props?: Record<string, unknown>;
  } = {},
): Component {
  const size = DEFAULT_SIZES[type];
  const binding = defaultBinding(type);
  const input = {
    id: overrides.id ?? nextComponentId(type),
    type,
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    ...(binding ? { binding } : {}),
    ...overrides,
    props: { ...requiredProps(type), ...(overrides.props ?? {}) },
  } as ComponentInput;
  return ComponentSchema.parse(input);
}

/** A complete, valid, empty theme for the default display, ready for the Studio. */
export function createEmptyTheme(
  init: Partial<Pick<ThemeInput, 'id' | 'name' | 'author' | 'vehicleProfile'>> = {},
): Theme {
  const display = getDisplayProfile(DEFAULT_DISPLAY_PROFILE_ID)!;
  const input: ThemeInput = {
    schemaVersion: SCHEMA_VERSION,
    id: init.id ?? 'untitled-theme',
    name: init.name ?? 'Untitled theme',
    version: '0.1.0',
    author: init.author ?? '',
    vehicleProfile: init.vehicleProfile ?? 'turbo-ice',
    target: { display: display.id },
    layout: {
      width: display.width,
      height: display.height,
      background: '$background',
      reservedZones: display.reservedZones,
    },
    palettes: {
      night: {
        name: 'Night',
        colors: {
          background: '#000000',
          surface: '#15181d',
          text: '#f4f6f8',
          'text-muted': '#8d96a3',
          accent: '#3f8cff',
          track: '#262b33',
          success: '#3ddc84',
          warning: '#ffb020',
          danger: '#ff3b3b',
        },
      },
      sport: {
        name: 'Sport',
        colors: {
          background: '#000000',
          surface: '#1a1214',
          text: '#ffffff',
          'text-muted': '#a08a90',
          accent: '#ff2d2d',
          track: '#2a1b1e',
          success: '#3ddc84',
          warning: '#ffb020',
          danger: '#ff3b3b',
        },
      },
    },
    palette: { default: 'night', byDriveMode: { SPORT: 'sport', SPORT_PLUS: 'sport' } },
    fonts: { default: { family: 'sans' } },
    components: [],
    meta: { createdWith: 'idv7lol Studio', created: new Date().toISOString(), tags: [] },
  };
  return ThemeSchema.parse(input);
}
