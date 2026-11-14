import type { Binding, Color, Condition, Theme, Zone } from '@idv7lol/theme-schema';

/** Severity of a validation finding. Errors block compilation. */
export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  /** Stable machine code, e.g. "signal.unknown". */
  code: string;
  message: string;
  /** JSON path or component id the finding refers to. */
  path?: string;
  componentId?: string;
  /** Suggested fix, when there is an obvious one. */
  hint?: string;
}

export interface ValidationReport {
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  infos: Finding[];
  /** The parsed theme when the schema was valid. */
  theme?: Theme;
  /** Exact layer count from the compiler mapping. */
  layers?: number;
}

/* -------------------------------------------------------------------------- */
/* Compiled output consumed by the MGU runtime                                */
/* -------------------------------------------------------------------------- */

export type ShaderKind =
  | 'flat'
  | 'arc-band'
  | 'arc-ticks'
  | 'needle'
  | 'bar'
  | 'bar-ticks'
  | 'text'
  | 'shiftlights'
  | 'telltale'
  | 'panel'
  | 'sprite';

/** A static uniform: numbers sent once when the layer is made. */
export type StaticUniforms = Record<string, number[]>;

/** Colour uniforms: palette tokens or literals, resolved by the runtime per palette. */
export type ColorUniforms = Record<string, Color>;

export interface CompiledBinding extends Binding {
  /** Catalog range in display units, filled by the compiler. */
  rangeMin: number;
  rangeMax: number;
  /** Signal kind from the catalog. */
  kind: 'number' | 'boolean' | 'enum' | 'string';
  /** Unit the catalog delivers the signal in (before display conversion). */
  catalogUnit: string;
  /** Unit symbol in display units. */
  unitSymbol: string;
}

/** How the runtime derives dynamic state for a piece. */
export type Dynamic =
  | { kind: 'norm'; uniform: string; binding: CompiledBinding }
  | { kind: 'angle'; uniform: string; binding: CompiledBinding; from: number; sweep: number }
  | {
      kind: 'text';
      binding?: CompiledBinding;
      /** Literal text, with {value} and {unit} placeholders. */
      template: string;
      format: string;
      /** 0 left, 0.5 centre, 1 right */
      align: number;
      tracking: number;
      uppercase: boolean;
      /** Secondary text appended with the secondary colour (e.g. a unit). */
      secondary?: { text: string; scale: number };
      zones?: Zone[];
    }
  | {
      kind: 'shiftlights';
      binding: CompiledBinding;
      from: number;
      to: number;
      count: number;
      flashAbove: number;
      flashRateHz: number;
    }
  | { kind: 'zone-color'; uniform: string; binding: CompiledBinding; zones: Zone[]; base: Color }
  | {
      kind: 'telltale';
      binding: CompiledBinding;
      onColor: Color;
      offColor: Color;
      hideWhenOff: boolean;
    }
  | {
      kind: 'clock';
      format: '24h' | '12h';
      showSeconds: boolean;
      showSuffix: boolean;
      blinkColon: boolean;
      align: number;
    }
  | {
      kind: 'gear';
      binding: CompiledBinding;
      mapping: Record<string, string>;
      modeSignal: string;
      manualColor?: Color;
    }
  | { kind: 'mode-text'; modeSignal: string };

export interface CompiledAnimationTrack {
  property: string;
  keyframes: Array<{ t: number; value: number | string; easing?: string }>;
}

export interface CompiledAnimation {
  clip: string;
  duration: number;
  loop: boolean | number;
  direction: 'normal' | 'reverse' | 'alternate';
  easing: string;
  trigger: { on: string; condition?: Condition; signal?: string };
  delay: number;
  tracks: CompiledAnimationTrack[];
}

export interface CompiledPiece {
  /** Unique key within the theme, derived from the component id. */
  key: string;
  componentId: string;
  shader: ShaderKind;
  /** Layer rect in panel pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Order within the content class. */
  z: number;
  rotation: number;
  opacity: number;
  /** The layer binds the glyph atlas as `u_font`. */
  usesFont: boolean;
  /** The layer wants `u_time` from the renderer. */
  usesTime: boolean;
  statics: StaticUniforms;
  colors: ColorUniforms;
  dynamics: Dynamic[];
  visibleWhen?: Condition;
  animations: CompiledAnimation[];
}

export interface CompiledImage {
  key: string;
  componentId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** Image width/height of the pixel data. */
  iw: number;
  ih: number;
  /** File name of the pixel data in the bundle: raw RGBA8, or etc2rgba blocks with `format`. */
  file: string;
  /**
   * `etc2rgba` for an animation's atlas (cluster-render 0.5.9): ETC2 RGBA with EAC alpha, one
   * byte a pixel, sent once as an asset. Absent: raw RGBA8.
   */
  format?: 'etc2rgba';
  opacity: number;
  rotation: number;
  /** Rotation pivot in pixels from the layer's top-left. */
  pivotX: number;
  pivotY: number;
  /** Set for animated pictures: `iw`×`ih` is then the atlas holding every frame. */
  sprite?: {
    columns: number;
    rows: number;
    cellW: number;
    cellH: number;
    frames: number;
    durations: number[];
  };
  /**
   * Set when the playback speed follows a signal: `durations` are at speed `slow`, and the car
   * plays them faster up to `fast` as the signal goes from `from` to `to`.
   */
  speedFrom?: { signal: string; from: number; to: number; slow: number; fast: number };
  visibleWhen?: Condition;
}

export interface CompiledTheme {
  format: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  compiledWith: string;
  compiledAt: string;
  target: { display: string; renderTarget: string; width: number; height: number };
  vehicleProfile: string;
  /** Colours by palette id, then token, as "#rrggbb[aa]". */
  palettes: Record<string, { name: string; colors: Record<string, string> }>;
  paletteSelection: Theme['palette'];
  /** Background colour of the layout (a token or literal); `transparent` keeps the factory cluster visible. */
  background: Color;
  /** Font families used by text pieces; each needs an atlas in the bundle. */
  fonts: string[];
  /** Shader sources by kind; pieces reference them by kind to keep the bundle small. */
  shaders: Record<string, string>;
  pieces: CompiledPiece[];
  images: CompiledImage[];
  /** Every signal the runtime must subscribe to. */
  signals: string[];
  /** Layer count including images. */
  layers: number;
  warnings: Finding[];
}

export interface BundleFile {
  path: string;
  data: Uint8Array | string;
}

export interface CompileResult {
  report: ValidationReport;
  compiled?: CompiledTheme;
  /** Files to write: theme JSON, shaders, atlases, images. */
  files: BundleFile[];
}
