import { z } from 'zod';
import {
  AnchorSchema,
  ColorSchema,
  FillSchema,
  IdSchema,
  NumberFormatSchema,
  ShadowSchema,
  StrokeSchema,
  TextStyleSchema,
} from './primitives.js';
import {
  BindingSchema,
  ConditionSchema,
  SignalIdSchema,
  UnitIdSchema,
  ZoneSchema,
} from './bindings.js';
import { AnimationRefSchema } from './animation.js';

/* -------------------------------------------------------------------------- */
/* Base                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fields shared by every component. Positions are in layout pixels relative to
 * the parent (the layout or a group). `rotation` is in degrees, clockwise,
 * around the anchor point.
 */
export const BaseComponentSchema = z.object({
  id: IdSchema,
  /** Display name in the Studio layers panel. */
  name: z.string().max(64).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  /** Studio-only: prevents accidental edits. Ignored by the runtime. */
  locked: z.boolean().default(false),
  anchor: AnchorSchema.default('top-left'),
  binding: BindingSchema.optional(),
  /** The component is drawn only while this holds. */
  visibleWhen: ConditionSchema.optional(),
  animations: z.array(AnimationRefSchema).default([]),
  /** Free-form notes for theme authors. */
  notes: z.string().max(500).optional(),
});
export type BaseComponent = z.infer<typeof BaseComponentSchema>;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export const RectPropsSchema = z.object({
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
  radius: z.number().min(0).default(0),
  shadow: ShadowSchema.optional(),
});

export const EllipsePropsSchema = z.object({
  fill: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
  shadow: ShadowSchema.optional(),
});

/** A straight line across the component box, corner to corner or along an axis. */
export const LinePropsSchema = z.object({
  stroke: StrokeSchema,
  /** `diagonal` runs from top-left to bottom-right, `diagonal-flip` from bottom-left to top-right. */
  direction: z.enum(['horizontal', 'vertical', 'diagonal', 'diagonal-flip']).default('horizontal'),
});

/** A decorative elliptical arc inscribed in the box. Angles in degrees, 0 = 3 o'clock, clockwise. */
export const ArcPropsSchema = z.object({
  startAngle: z.number().default(135),
  sweepAngle: z.number().min(-360).max(360).default(270),
  stroke: StrokeSchema,
  /** Optional pie fill between the arc and the centre. */
  fill: FillSchema.optional(),
});

export const TextPropsSchema = z.object({
  /**
   * Literal text. With a binding, "{value}" is replaced by the formatted
   * value and "{unit}" by the unit symbol; without "{value}" the value is
   * appended. Omit the text to show just the value.
   */
  text: z.string().max(200).default(''),
  style: TextStyleSchema.prefault({}),
  format: NumberFormatSchema,
  /** When true the component box clips the text; otherwise it may overflow. */
  clip: z.boolean().default(false),
  /** Wrap long literal text onto several lines inside the box. */
  wrap: z.boolean().default(false),
  lineHeight: z.number().positive().default(1.2),
});

/** One brush stroke of the image editor; points are [x0, y0, x1, y1…] normalised to the source. */
export const ImageStrokeSchema = z.object({
  mode: z.enum(['erase', 'restore']),
  /** Brush diameter as a fraction of the source's shorter side. */
  size: z.number().positive().max(1),
  hardness: z.number().min(0).max(1).default(0.7),
  points: z.array(z.number()).min(2),
});

/**
 * Non-destructive image edits. The original asset is never changed; the
 * Studio previews these and the compiler bakes them for the car. Every value
 * is resolution-independent.
 */
export const ImageEditsSchema = z.object({
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  /** Normalised to the image after rotation and flip. */
  crop: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .optional(),
  brightness: z.number().min(-100).max(100).default(0),
  contrast: z.number().min(-100).max(100).default(0),
  saturation: z.number().min(-100).max(100).default(0),
  hue: z.number().min(-180).max(180).default(0),
  temperature: z.number().min(-100).max(100).default(0),
  sharpen: z.number().min(0).max(100).default(0),
  blur: z.number().min(0).max(100).default(0),
  invert: z.boolean().default(false),
  grayscale: z.boolean().default(false),
  /** Colourise with a colour or palette token; amount 0..100. */
  tint: z
    .object({ color: ColorSchema, amount: z.number().min(0).max(100).default(100) })
    .optional(),
  vignette: z.number().min(0).max(100).default(0),
  /** Corner radius as a percentage of the shorter side. */
  radius: z.number().min(0).max(50).default(0),
  /** Remove a background colour. */
  colorKey: z
    .object({
      color: z.string(),
      tolerance: z.number().min(0).max(100).default(15),
      softness: z.number().min(0).max(100).default(10),
    })
    .optional(),
  strokes: z.array(ImageStrokeSchema).default([]),
});
export type ImageEdits = z.infer<typeof ImageEditsSchema>;

/**
 * Plays an animated picture faster as a signal rises: at its `speed` while the
 * signal is at `from` or below, at `fastSpeed` from `to` up, in between in
 * proportion. Values are in the signal's catalog unit (vehicle.speed: km/h).
 */
export const ImageSpeedFromSchema = z.object({
  signal: SignalIdSchema,
  from: z.number().default(0),
  to: z.number().default(200),
  fastSpeed: z.number().min(0.1).max(4).default(4),
});
export type ImageSpeedFrom = z.infer<typeof ImageSpeedFromSchema>;

export const ImagePropsSchema = z.object({
  /** Id of an entry in the theme's `assets` table. */
  asset: IdSchema,
  fit: z.enum(['contain', 'cover', 'stretch']).default('contain'),
  edits: ImageEditsSchema.prefault({}),
  /** Playback speed of animated pictures. */
  speed: z.number().min(0.1).max(4).default(1),
  /** Ties the playback speed to a signal, such as the car's speed. */
  speedFrom: ImageSpeedFromSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Gauges                                                                     */
/* -------------------------------------------------------------------------- */

export const TicksSchema = z.object({
  /** Number of major intervals (0 disables ticks). */
  major: z.number().int().min(0).max(100).default(8),
  /** Minor ticks between two major ticks. */
  minor: z.number().int().min(0).max(20).default(4),
  majorLength: z.number().min(0).default(14),
  minorLength: z.number().min(0).default(7),
  majorWidth: z.number().min(0).default(3),
  minorWidth: z.number().min(0).default(1.5),
  color: ColorSchema.default('$text'),
  minorColor: ColorSchema.optional(),
  /** Distance from the outer edge of the gauge to the ticks. */
  inset: z.number().default(0),
  /** Ticks inside the redline zone use this colour. */
  redlineColor: ColorSchema.optional(),
});

export const GaugeLabelsSchema = z.object({
  show: z.boolean().default(true),
  /** Label every n-th major tick. */
  every: z.number().int().min(1).default(1),
  style: TextStyleSchema.prefault({ size: 22, align: 'center', baseline: 'middle' }),
  /** Value divisor for labels, e.g. 1000 to label rpm as 1..8. */
  divisor: z.number().positive().default(1),
  format: NumberFormatSchema,
  /** Distance from the ticks towards the centre. */
  inset: z.number().default(30),
});

export const NeedleSchema = z.object({
  show: z.boolean().default(true),
  color: ColorSchema.default('$accent'),
  /** Width at the base in pixels. */
  width: z.number().min(0.5).default(6),
  /** Needle length as a fraction of the gauge radius. */
  length: z.number().min(0).max(1.2).default(0.9),
  /** Tail length as a fraction of the radius (behind the pivot). */
  tail: z.number().min(0).max(0.5).default(0.1),
  shape: z.enum(['tapered', 'bar', 'arrow']).default('tapered'),
  cap: z
    .object({
      show: z.boolean().default(true),
      radius: z.number().min(0).default(14),
      color: ColorSchema.default('$surface'),
    })
    .prefault({}),
  shadow: ShadowSchema.optional(),
});

export const GaugeValueTextSchema = z.object({
  show: z.boolean().default(false),
  style: TextStyleSchema.prefault({
    size: 64,
    align: 'center',
    baseline: 'middle',
    weight: 'bold',
  }),
  format: NumberFormatSchema,
  unit: UnitIdSchema.optional(),
  showUnit: z.boolean().default(false),
  unitStyle: TextStyleSchema.prefault({ size: 22, align: 'center', baseline: 'middle' }),
  /** Offset from the gauge centre, in pixels. */
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
});

/**
 * Circular gauge: tachometer, analog speedometer, boost gauge, progress ring.
 * The arc is inscribed in the component box; the value sweeps from
 * startAngle over sweepAngle (degrees, 0 = 3 o'clock, positive clockwise).
 */
export const ArcGaugePropsSchema = z.object({
  startAngle: z.number().default(135),
  sweepAngle: z.number().min(-360).max(360).default(270),
  track: z
    .object({
      show: z.boolean().default(true),
      color: ColorSchema.default('$track'),
      width: z.number().min(0).default(16),
      cap: z.enum(['butt', 'round']).default('butt'),
    })
    .prefault({}),
  fill: z
    .object({
      show: z.boolean().default(true),
      color: FillSchema.default('$accent'),
      width: z.number().min(0).default(16),
      /** `solid` sweeps a bar; `segments` lights discrete blocks. */
      mode: z.enum(['solid', 'segments']).default('solid'),
      segments: z.number().int().min(2).max(120).default(40),
      segmentGap: z.number().min(0).max(45).default(1.5),
      cap: z.enum(['butt', 'round']).default('butt'),
      /** Colour overrides by value range. */
      zones: z.array(ZoneSchema).default([]),
    })
    .prefault({}),
  ticks: TicksSchema.prefault({}),
  labels: GaugeLabelsSchema.prefault({}),
  needle: NeedleSchema.prefault({ show: false }),
  redline: z
    .object({
      show: z.boolean().default(false),
      /** Value where the redline zone starts (in the binding's unit). */
      from: z.number().default(6500),
      color: ColorSchema.default('$danger'),
      width: z.number().min(0).default(10),
      /** Draw the redline arc outside (`outer`) or on the track (`track`). */
      placement: z.enum(['outer', 'track']).default('outer'),
    })
    .prefault({}),
  valueText: GaugeValueTextSchema.prefault({}),
  /** Glow around the lit part of the arc. */
  glow: z
    .object({
      show: z.boolean().default(false),
      color: ColorSchema.default('$accent'),
      blur: z.number().min(0).default(18),
    })
    .prefault({}),
});

/** Linear gauge: bars for fuel, temperatures, boost, rev bars. */
export const BarGaugePropsSchema = z.object({
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
  /** `forward` fills left to right (or bottom to top), `reverse` the other way. */
  direction: z.enum(['forward', 'reverse']).default('forward'),
  track: z
    .object({
      show: z.boolean().default(true),
      color: ColorSchema.default('$track'),
      radius: z.number().min(0).default(4),
      stroke: StrokeSchema.optional(),
    })
    .prefault({}),
  fill: z
    .object({
      color: FillSchema.default('$accent'),
      radius: z.number().min(0).default(4),
      mode: z.enum(['solid', 'segments']).default('solid'),
      segments: z.number().int().min(2).max(200).default(20),
      segmentGap: z.number().min(0).default(3),
      zones: z.array(ZoneSchema).default([]),
    })
    .prefault({}),
  ticks: z
    .object({
      show: z.boolean().default(false),
      count: z.number().int().min(2).max(50).default(5),
      color: ColorSchema.default('$text'),
      length: z.number().min(0).default(8),
      width: z.number().min(0).default(2),
      /** Where ticks sit relative to the bar. */
      side: z.enum(['before', 'after', 'both']).default('after'),
    })
    .prefault({}),
  labels: z
    .object({
      show: z.boolean().default(false),
      style: TextStyleSchema.prefault({ size: 18, align: 'center', baseline: 'middle' }),
      format: NumberFormatSchema,
      divisor: z.number().positive().default(1),
      offset: z.number().default(16),
    })
    .prefault({}),
  /** A marker drawn at a value (e.g. a cold-limit tick). */
  marker: z
    .object({
      show: z.boolean().default(false),
      value: z.number().default(0),
      color: ColorSchema.default('$text'),
      width: z.number().min(0).default(3),
    })
    .prefault({}),
  glow: z
    .object({
      show: z.boolean().default(false),
      color: ColorSchema.default('$accent'),
      blur: z.number().min(0).default(14),
    })
    .prefault({}),
});

/* -------------------------------------------------------------------------- */
/* Readouts and indicators                                                    */
/* -------------------------------------------------------------------------- */

/** Numeric readout with optional label, unit and background: digital speed, a data card… */
export const DigitalValuePropsSchema = z.object({
  format: NumberFormatSchema,
  unit: UnitIdSchema.optional(),
  showUnit: z.boolean().default(true),
  label: z.string().max(40).default(''),
  layout: z.enum(['stacked', 'inline', 'label-left']).default('stacked'),
  valueStyle: TextStyleSchema.prefault({
    size: 96,
    weight: 'bold',
    align: 'center',
    baseline: 'middle',
  }),
  unitStyle: TextStyleSchema.prefault({
    size: 24,
    align: 'center',
    baseline: 'middle',
    color: '$text-muted',
  }),
  labelStyle: TextStyleSchema.prefault({
    size: 20,
    align: 'center',
    baseline: 'middle',
    color: '$text-muted',
    uppercase: true,
  }),
  /** Colour overrides by value range (replaces the value colour). */
  zones: z.array(ZoneSchema).default([]),
  background: FillSchema.optional(),
  stroke: StrokeSchema.optional(),
  radius: z.number().min(0).default(0),
  padding: z.number().min(0).default(0),
  /** Keep the width constant with tabular digits (recommended for speed). */
  tabular: z.boolean().default(true),
});

export const GearIndicatorPropsSchema = z.object({
  style: TextStyleSchema.prefault({
    size: 120,
    weight: 'bold',
    align: 'center',
    baseline: 'middle',
  }),
  /** Show D/S/M next to the gear (bound to transmission.mode). */
  showMode: z.boolean().default(true),
  modeStyle: TextStyleSchema.prefault({
    size: 36,
    align: 'center',
    baseline: 'middle',
    color: '$text-muted',
  }),
  modeSignal: z.string().default('transmission.mode'),
  /** Colour used while the transmission is in manual mode. */
  manualColor: ColorSchema.optional(),
  /** Remap gear values to display strings, e.g. {"N": "N", "P": "P"}. */
  mapping: z.record(z.string(), z.string()).prefault({}),
  background: FillSchema.optional(),
  radius: z.number().min(0).default(0),
});

export const ShiftLightsPropsSchema = z.object({
  count: z.number().int().min(1).max(32).default(10),
  shape: z.enum(['circle', 'rect', 'pill']).default('circle'),
  gap: z.number().min(0).default(8),
  /** Value where the first light turns on and where all are on (binding unit). */
  from: z.number().default(5000),
  to: z.number().default(7000),
  /** Above this value all lights flash. 0 disables. */
  flashAbove: z.number().default(0),
  flashRateHz: z.number().min(0.5).max(20).default(6),
  /** Colour per light; shorter arrays repeat the last colour. */
  colors: z
    .array(ColorSchema)
    .min(1)
    .default([
      '$success',
      '$success',
      '$success',
      '$warning',
      '$warning',
      '$warning',
      '$danger',
      '$danger',
      '$danger',
      '$accent',
    ]),
  offColor: ColorSchema.default('$track'),
  /** Light from the outside in (both ends towards the centre). */
  symmetric: z.boolean().default(false),
  glow: z.boolean().default(true),
});

export const ClockPropsSchema = z.object({
  format: z.enum(['24h', '12h']).default('24h'),
  showSeconds: z.boolean().default(false),
  showSuffix: z.boolean().default(true),
  style: TextStyleSchema.prefault({ size: 36, align: 'center', baseline: 'middle' }),
  /** Blink the colon every second. */
  blinkColon: z.boolean().default(false),
});

export const TelltaleIconSchema = z.enum([
  'turn-left',
  'turn-right',
  'high-beam',
  'low-beam',
  'fog-rear',
  'parking-brake',
  'cruise',
  'battery',
  'fuel',
  'engine',
  'oil',
  'coolant',
  'snowflake',
  'custom',
]);

/**
 * Informational indicator lamp. It never replaces the factory telltales; it
 * mirrors a signal for layouts that want their own visual language.
 */
export const TelltalePropsSchema = z.object({
  icon: TelltaleIconSchema.default('turn-left'),
  /** Asset id for `custom` icons. */
  asset: IdSchema.optional(),
  onColor: ColorSchema.default('$success'),
  offColor: ColorSchema.default('$track'),
  hideWhenOff: z.boolean().default(false),
});

/**
 * A warning that takes over a box of the layout while its condition (the component's
 * `visibleWhen`) holds. When several hold, only the highest `priority` shows (the first in the
 * layout on a tie), so alerts on the same spot never pile up.
 */
export const AlertPropsSchema = z.object({
  text: z.string().max(80).default('Warning'),
  /** 1 (lowest) to 9 (highest). */
  priority: z.number().int().min(1).max(9).default(5),
  /** A built-in icon, a `custom` one (`asset`), or none. */
  icon: z.union([TelltaleIconSchema, z.literal('none')]).default('none'),
  asset: IdSchema.optional(),
  iconColor: ColorSchema.default('$danger'),
  style: TextStyleSchema.prefault({
    size: 26,
    weight: 'bold',
    align: 'center',
    baseline: 'middle',
  }),
  fill: FillSchema.default('$surface'),
  stroke: StrokeSchema.prefault({ color: '$danger', width: 3 }),
  radius: z.number().min(0).default(16),
  /** Blink twice a second while shown. */
  flash: z.boolean().default(false),
});

export const StatusRowSchema = z.object({
  label: z.string().max(40),
  binding: BindingSchema,
  format: NumberFormatSchema,
  unit: UnitIdSchema.optional(),
  showUnit: z.boolean().default(true),
});

/** A panel of labelled values. */
export const StatusPanelPropsSchema = z.object({
  rows: z.array(StatusRowSchema).min(1).max(12),
  rowHeight: z.number().positive().default(44),
  labelStyle: TextStyleSchema.prefault({
    size: 20,
    align: 'left',
    baseline: 'middle',
    color: '$text-muted',
  }),
  valueStyle: TextStyleSchema.prefault({
    size: 26,
    align: 'right',
    baseline: 'middle',
    weight: 'medium',
  }),
  unitStyle: TextStyleSchema.prefault({
    size: 18,
    align: 'left',
    baseline: 'middle',
    color: '$text-muted',
  }),
  background: FillSchema.optional(),
  radius: z.number().min(0).default(12),
  padding: z.number().min(0).default(16),
  divider: StrokeSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/* Union                                                                      */
/* -------------------------------------------------------------------------- */

const C = <T extends string, P extends z.ZodTypeAny>(type: T, props: P) =>
  BaseComponentSchema.extend({ type: z.literal(type), props });

export const RectComponentSchema = C('rect', RectPropsSchema.prefault({}));
export const EllipseComponentSchema = C('ellipse', EllipsePropsSchema.prefault({}));
export const LineComponentSchema = C('line', LinePropsSchema);
export const ArcComponentSchema = C('arc', ArcPropsSchema);
export const TextComponentSchema = C('text', TextPropsSchema.prefault({}));
export const ImageComponentSchema = C('image', ImagePropsSchema);
export const ArcGaugeComponentSchema = C('gauge.arc', ArcGaugePropsSchema.prefault({}));
export const BarGaugeComponentSchema = C('gauge.bar', BarGaugePropsSchema.prefault({}));
export const DigitalValueComponentSchema = C('value.digital', DigitalValuePropsSchema.prefault({}));
export const GearIndicatorComponentSchema = C(
  'indicator.gear',
  GearIndicatorPropsSchema.prefault({}),
);
export const ShiftLightsComponentSchema = C(
  'indicator.shiftlights',
  ShiftLightsPropsSchema.prefault({}),
);
export const ClockComponentSchema = C('clock', ClockPropsSchema.prefault({}));
export const TelltaleComponentSchema = C('telltale', TelltalePropsSchema.prefault({}));
export const StatusPanelComponentSchema = C('status.panel', StatusPanelPropsSchema);
export const AlertComponentSchema = C('alert', AlertPropsSchema.prefault({}));

export type RectComponent = z.infer<typeof RectComponentSchema>;
export type EllipseComponent = z.infer<typeof EllipseComponentSchema>;
export type LineComponent = z.infer<typeof LineComponentSchema>;
export type ArcComponent = z.infer<typeof ArcComponentSchema>;
export type TextComponent = z.infer<typeof TextComponentSchema>;
export type ImageComponent = z.infer<typeof ImageComponentSchema>;
export type ArcGaugeComponent = z.infer<typeof ArcGaugeComponentSchema>;
export type BarGaugeComponent = z.infer<typeof BarGaugeComponentSchema>;
export type DigitalValueComponent = z.infer<typeof DigitalValueComponentSchema>;
export type GearIndicatorComponent = z.infer<typeof GearIndicatorComponentSchema>;
export type ShiftLightsComponent = z.infer<typeof ShiftLightsComponentSchema>;
export type ClockComponent = z.infer<typeof ClockComponentSchema>;
export type TelltaleComponent = z.infer<typeof TelltaleComponentSchema>;
export type StatusPanelComponent = z.infer<typeof StatusPanelComponentSchema>;
export type AlertComponent = z.infer<typeof AlertComponentSchema>;

export interface GroupComponent extends BaseComponent {
  type: 'group';
  props: {
    children: Component[];
    /** Clip children to the group box. */
    clip: boolean;
  };
}

export type Component =
  | RectComponent
  | EllipseComponent
  | LineComponent
  | ArcComponent
  | TextComponent
  | ImageComponent
  | ArcGaugeComponent
  | BarGaugeComponent
  | DigitalValueComponent
  | GearIndicatorComponent
  | ShiftLightsComponent
  | ClockComponent
  | TelltaleComponent
  | StatusPanelComponent
  | AlertComponent
  | GroupComponent;

export type ComponentType = Component['type'];

type NonGroupInput =
  | z.input<typeof RectComponentSchema>
  | z.input<typeof EllipseComponentSchema>
  | z.input<typeof LineComponentSchema>
  | z.input<typeof ArcComponentSchema>
  | z.input<typeof TextComponentSchema>
  | z.input<typeof ImageComponentSchema>
  | z.input<typeof ArcGaugeComponentSchema>
  | z.input<typeof BarGaugeComponentSchema>
  | z.input<typeof DigitalValueComponentSchema>
  | z.input<typeof GearIndicatorComponentSchema>
  | z.input<typeof ShiftLightsComponentSchema>
  | z.input<typeof ClockComponentSchema>
  | z.input<typeof TelltaleComponentSchema>
  | z.input<typeof StatusPanelComponentSchema>
  | z.input<typeof AlertComponentSchema>;

export interface GroupComponentInput extends z.input<typeof BaseComponentSchema> {
  type: 'group';
  props: { children: ComponentInput[]; clip?: boolean };
}

export type ComponentInput = NonGroupInput | GroupComponentInput;

export const GroupComponentSchema: z.ZodType<GroupComponent, GroupComponentInput> =
  BaseComponentSchema.extend({
    type: z.literal('group'),
    props: z.object({
      children: z.array(z.lazy(() => ComponentSchema)),
      clip: z.boolean().default(false),
    }),
  }) as unknown as z.ZodType<GroupComponent, GroupComponentInput>;

export const ComponentSchema: z.ZodType<Component, ComponentInput> = z.lazy(() =>
  z.discriminatedUnion('type', [
    RectComponentSchema,
    EllipseComponentSchema,
    LineComponentSchema,
    ArcComponentSchema,
    TextComponentSchema,
    ImageComponentSchema,
    ArcGaugeComponentSchema,
    BarGaugeComponentSchema,
    DigitalValueComponentSchema,
    GearIndicatorComponentSchema,
    ShiftLightsComponentSchema,
    ClockComponentSchema,
    TelltaleComponentSchema,
    StatusPanelComponentSchema,
    AlertComponentSchema,
    GroupComponentSchema as unknown as typeof RectComponentSchema,
  ]),
) as unknown as z.ZodType<Component, ComponentInput>;

export const COMPONENT_TYPES: readonly ComponentType[] = [
  'rect',
  'ellipse',
  'line',
  'arc',
  'text',
  'image',
  'gauge.arc',
  'gauge.bar',
  'value.digital',
  'indicator.gear',
  'indicator.shiftlights',
  'clock',
  'telltale',
  'status.panel',
  'alert',
  'group',
];

/** Per-type props schemas, for the Studio inspector and for `createComponent`. */
export const COMPONENT_PROPS_SCHEMAS = {
  rect: RectPropsSchema,
  ellipse: EllipsePropsSchema,
  line: LinePropsSchema,
  arc: ArcPropsSchema,
  text: TextPropsSchema,
  image: ImagePropsSchema,
  'gauge.arc': ArcGaugePropsSchema,
  'gauge.bar': BarGaugePropsSchema,
  'value.digital': DigitalValuePropsSchema,
  'indicator.gear': GearIndicatorPropsSchema,
  'indicator.shiftlights': ShiftLightsPropsSchema,
  clock: ClockPropsSchema,
  telltale: TelltalePropsSchema,
  'status.panel': StatusPanelPropsSchema,
  alert: AlertPropsSchema,
} as const;
