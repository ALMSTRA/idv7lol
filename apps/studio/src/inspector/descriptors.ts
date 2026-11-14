import type { ComponentType } from '@idv7lol/theme-schema';

/**
 * Inspector field descriptors per component type. Paths are relative to the
 * component's `props`. The inspector renders them generically.
 */
export type FieldKind =
  | 'number'
  | 'bool'
  | 'color'
  | 'fill'
  | 'select'
  | 'text'
  | 'textstyle'
  | 'stroke'
  | 'zones'
  | 'unit'
  | 'format'
  | 'rows'
  | 'colors'
  | 'asset';

export interface FieldDescriptor {
  path: string;
  label: string;
  kind: FieldKind;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
}

export interface SectionDescriptor {
  title: string;
  fields: FieldDescriptor[];
  /** Section is relevant only when this prop path is truthy (e.g. "needle.show"). */
  when?: string;
}

const opt = (values: string[]) => values.map((v) => ({ value: v, label: v }));

const TRACK = (prefix: string): FieldDescriptor[] => [
  { path: `${prefix}.show`, label: 'Show', kind: 'bool' },
  { path: `${prefix}.color`, label: 'Colour', kind: 'color' },
  { path: `${prefix}.width`, label: 'Width', kind: 'number', min: 0, max: 200 },
];

export const DESCRIPTORS: Record<Exclude<ComponentType, 'group'>, SectionDescriptor[]> = {
  'gauge.arc': [
    {
      title: 'Arc',
      fields: [
        {
          path: 'startAngle',
          label: 'Start angle',
          kind: 'number',
          min: -360,
          max: 360,
          hint: '0° = 3 o’clock, clockwise',
        },
        { path: 'sweepAngle', label: 'Sweep', kind: 'number', min: -360, max: 360 },
      ],
    },
    {
      title: 'Track',
      fields: [
        ...TRACK('track'),
        { path: 'track.cap', label: 'Cap', kind: 'select', options: opt(['butt', 'round']) },
      ],
    },
    {
      title: 'Fill',
      fields: [
        { path: 'fill.show', label: 'Show', kind: 'bool' },
        { path: 'fill.color', label: 'Colour', kind: 'fill' },
        { path: 'fill.width', label: 'Width', kind: 'number', min: 0, max: 200 },
        { path: 'fill.mode', label: 'Mode', kind: 'select', options: opt(['solid', 'segments']) },
        { path: 'fill.segments', label: 'Segments', kind: 'number', min: 2, max: 120 },
        { path: 'fill.segmentGap', label: 'Gap (°)', kind: 'number', min: 0, max: 45, step: 0.1 },
        { path: 'fill.zones', label: 'Zones', kind: 'zones' },
      ],
    },
    {
      title: 'Ticks',
      fields: [
        { path: 'ticks.major', label: 'Major', kind: 'number', min: 0, max: 100 },
        { path: 'ticks.minor', label: 'Minor', kind: 'number', min: 0, max: 20 },
        { path: 'ticks.majorLength', label: 'Major length', kind: 'number', min: 0, max: 100 },
        { path: 'ticks.minorLength', label: 'Minor length', kind: 'number', min: 0, max: 100 },
        {
          path: 'ticks.majorWidth',
          label: 'Major width',
          kind: 'number',
          min: 0,
          max: 20,
          step: 0.5,
        },
        {
          path: 'ticks.minorWidth',
          label: 'Minor width',
          kind: 'number',
          min: 0,
          max: 20,
          step: 0.5,
        },
        { path: 'ticks.color', label: 'Colour', kind: 'color' },
        { path: 'ticks.inset', label: 'Inset', kind: 'number', min: -50, max: 200 },
      ],
    },
    {
      title: 'Labels',
      fields: [
        { path: 'labels.show', label: 'Show', kind: 'bool' },
        { path: 'labels.every', label: 'Every n ticks', kind: 'number', min: 1, max: 20 },
        { path: 'labels.divisor', label: 'Divisor', kind: 'number', min: 0.001, max: 100000 },
        { path: 'labels.inset', label: 'Inset', kind: 'number', min: -50, max: 200 },
        { path: 'labels.style', label: 'Style', kind: 'textstyle' },
      ],
    },
    {
      title: 'Needle',
      fields: [
        { path: 'needle.show', label: 'Show', kind: 'bool' },
        { path: 'needle.image', label: 'Needle picture', kind: 'asset' },
        { path: 'needle.color', label: 'Colour', kind: 'color' },
        { path: 'needle.width', label: 'Width', kind: 'number', min: 0.5, max: 40, step: 0.5 },
        { path: 'needle.length', label: 'Length', kind: 'number', min: 0, max: 1.2, step: 0.01 },
        { path: 'needle.tail', label: 'Tail', kind: 'number', min: 0, max: 0.5, step: 0.01 },
        {
          path: 'needle.shape',
          label: 'Shape',
          kind: 'select',
          options: opt(['tapered', 'bar', 'arrow']),
        },
        { path: 'needle.cap.show', label: 'Hub', kind: 'bool' },
        { path: 'needle.cap.radius', label: 'Hub radius', kind: 'number', min: 0, max: 100 },
        { path: 'needle.cap.color', label: 'Hub colour', kind: 'color' },
      ],
    },
    {
      title: 'Redline',
      fields: [
        { path: 'redline.show', label: 'Show', kind: 'bool' },
        { path: 'redline.from', label: 'From value', kind: 'number' },
        { path: 'redline.color', label: 'Colour', kind: 'color' },
        { path: 'redline.width', label: 'Width', kind: 'number', min: 0, max: 60 },
        {
          path: 'redline.placement',
          label: 'Placement',
          kind: 'select',
          options: opt(['outer', 'track']),
        },
      ],
    },
    {
      title: 'Value text',
      fields: [
        { path: 'valueText.show', label: 'Show', kind: 'bool' },
        { path: 'valueText.format', label: 'Format', kind: 'format' },
        { path: 'valueText.showUnit', label: 'Show unit', kind: 'bool' },
        { path: 'valueText.unit', label: 'Unit', kind: 'unit' },
        { path: 'valueText.offsetX', label: 'Offset X', kind: 'number' },
        { path: 'valueText.offsetY', label: 'Offset Y', kind: 'number' },
        { path: 'valueText.style', label: 'Style', kind: 'textstyle' },
        { path: 'valueText.unitStyle', label: 'Unit style', kind: 'textstyle' },
      ],
    },
    {
      title: 'Glow',
      fields: [
        { path: 'glow.show', label: 'Show', kind: 'bool' },
        { path: 'glow.color', label: 'Colour', kind: 'color' },
        { path: 'glow.blur', label: 'Blur', kind: 'number', min: 0, max: 80 },
      ],
    },
  ],
  'gauge.bar': [
    {
      title: 'Bar',
      fields: [
        {
          path: 'orientation',
          label: 'Orientation',
          kind: 'select',
          options: opt(['horizontal', 'vertical']),
        },
        {
          path: 'direction',
          label: 'Direction',
          kind: 'select',
          options: opt(['forward', 'reverse']),
        },
      ],
    },
    {
      title: 'Track',
      fields: [
        { path: 'track.show', label: 'Show', kind: 'bool' },
        { path: 'track.color', label: 'Colour', kind: 'color' },
        { path: 'track.radius', label: 'Radius', kind: 'number', min: 0, max: 100 },
      ],
    },
    {
      title: 'Fill',
      fields: [
        { path: 'fill.color', label: 'Colour', kind: 'fill' },
        { path: 'fill.radius', label: 'Radius', kind: 'number', min: 0, max: 100 },
        { path: 'fill.mode', label: 'Mode', kind: 'select', options: opt(['solid', 'segments']) },
        { path: 'fill.segments', label: 'Segments', kind: 'number', min: 2, max: 200 },
        { path: 'fill.segmentGap', label: 'Gap (px)', kind: 'number', min: 0, max: 50 },
        { path: 'fill.zones', label: 'Zones', kind: 'zones' },
      ],
    },
    {
      title: 'Ticks & labels',
      fields: [
        { path: 'ticks.show', label: 'Ticks', kind: 'bool' },
        { path: 'ticks.count', label: 'Count', kind: 'number', min: 2, max: 50 },
        { path: 'ticks.length', label: 'Length', kind: 'number', min: 0, max: 60 },
        { path: 'ticks.width', label: 'Width', kind: 'number', min: 0, max: 10, step: 0.5 },
        { path: 'ticks.color', label: 'Colour', kind: 'color' },
        {
          path: 'ticks.side',
          label: 'Side',
          kind: 'select',
          options: opt(['before', 'after', 'both']),
        },
        { path: 'labels.show', label: 'Labels', kind: 'bool' },
        { path: 'labels.divisor', label: 'Divisor', kind: 'number', min: 0.001 },
        { path: 'labels.offset', label: 'Offset', kind: 'number' },
        { path: 'labels.style', label: 'Label style', kind: 'textstyle' },
      ],
    },
    {
      title: 'Marker',
      fields: [
        { path: 'marker.show', label: 'Show', kind: 'bool' },
        { path: 'marker.value', label: 'Value', kind: 'number' },
        { path: 'marker.color', label: 'Colour', kind: 'color' },
        { path: 'marker.width', label: 'Width', kind: 'number', min: 0, max: 20 },
      ],
    },
    {
      title: 'Glow',
      fields: [
        { path: 'glow.show', label: 'Show', kind: 'bool' },
        { path: 'glow.color', label: 'Colour', kind: 'color' },
        { path: 'glow.blur', label: 'Blur', kind: 'number', min: 0, max: 80 },
      ],
    },
  ],
  'value.digital': [
    {
      title: 'Readout',
      fields: [
        { path: 'format', label: 'Format', kind: 'format' },
        { path: 'unit', label: 'Unit', kind: 'unit' },
        { path: 'showUnit', label: 'Show unit', kind: 'bool' },
        { path: 'label', label: 'Label', kind: 'text' },
        {
          path: 'layout',
          label: 'Layout',
          kind: 'select',
          options: opt(['stacked', 'inline', 'label-left']),
        },
        { path: 'tabular', label: 'Tabular digits', kind: 'bool' },
        { path: 'zones', label: 'Colour zones', kind: 'zones' },
      ],
    },
    {
      title: 'Styles',
      fields: [
        { path: 'valueStyle', label: 'Value', kind: 'textstyle' },
        { path: 'unitStyle', label: 'Unit', kind: 'textstyle' },
        { path: 'labelStyle', label: 'Label', kind: 'textstyle' },
      ],
    },
    {
      title: 'Panel',
      fields: [
        { path: 'background', label: 'Background', kind: 'fill' },
        { path: 'radius', label: 'Radius', kind: 'number', min: 0, max: 100 },
        { path: 'padding', label: 'Padding', kind: 'number', min: 0, max: 100 },
        { path: 'stroke', label: 'Border', kind: 'stroke' },
      ],
    },
  ],
  'indicator.gear': [
    {
      title: 'Gear',
      fields: [
        { path: 'style', label: 'Style', kind: 'textstyle' },
        { path: 'showMode', label: 'Show D/S/M', kind: 'bool' },
        { path: 'modeStyle', label: 'Mode style', kind: 'textstyle' },
        { path: 'manualColor', label: 'Manual colour', kind: 'color' },
        { path: 'background', label: 'Background', kind: 'fill' },
        { path: 'radius', label: 'Radius', kind: 'number', min: 0, max: 100 },
      ],
    },
  ],
  'indicator.shiftlights': [
    {
      title: 'Lights',
      fields: [
        { path: 'count', label: 'Count', kind: 'number', min: 1, max: 32 },
        { path: 'shape', label: 'Shape', kind: 'select', options: opt(['circle', 'rect', 'pill']) },
        { path: 'gap', label: 'Gap', kind: 'number', min: 0, max: 60 },
        { path: 'from', label: 'First light at', kind: 'number' },
        { path: 'to', label: 'All lights at', kind: 'number' },
        { path: 'flashAbove', label: 'Flash above', kind: 'number', hint: '0 disables' },
        {
          path: 'flashRateHz',
          label: 'Flash rate (Hz)',
          kind: 'number',
          min: 0.5,
          max: 20,
          step: 0.5,
        },
        { path: 'symmetric', label: 'Symmetric', kind: 'bool' },
        { path: 'glow', label: 'Glow', kind: 'bool' },
        { path: 'colors', label: 'Colours', kind: 'colors' },
        { path: 'offColor', label: 'Off colour', kind: 'color' },
      ],
    },
  ],
  clock: [
    {
      title: 'Clock',
      fields: [
        { path: 'format', label: 'Format', kind: 'select', options: opt(['24h', '12h']) },
        { path: 'showSeconds', label: 'Seconds', kind: 'bool' },
        { path: 'showSuffix', label: 'AM/PM', kind: 'bool' },
        { path: 'blinkColon', label: 'Blink colon', kind: 'bool' },
        { path: 'style', label: 'Style', kind: 'textstyle' },
      ],
    },
  ],
  telltale: [
    {
      title: 'Telltale',
      fields: [
        {
          path: 'icon',
          label: 'Icon',
          kind: 'select',
          options: opt([
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
          ]),
        },
        { path: 'asset', label: 'Icon picture', kind: 'asset' },
        { path: 'onColor', label: 'On colour', kind: 'color' },
        { path: 'offColor', label: 'Off colour', kind: 'color' },
        { path: 'hideWhenOff', label: 'Hide when off', kind: 'bool' },
      ],
    },
  ],
  alert: [
    {
      title: 'Alert',
      fields: [
        { path: 'text', label: 'Text', kind: 'text' },
        { path: 'priority', label: 'Priority', kind: 'number', min: 1, max: 9 },
        { path: 'flash', label: 'Flash', kind: 'bool' },
        {
          path: 'icon',
          label: 'Icon',
          kind: 'select',
          options: opt([
            'none',
            'fuel',
            'coolant',
            'oil',
            'battery',
            'engine',
            'parking-brake',
            'snowflake',
            'high-beam',
            'cruise',
            'custom',
          ]),
        },
        { path: 'asset', label: 'Icon picture', kind: 'asset' },
        { path: 'iconColor', label: 'Icon colour', kind: 'color' },
      ],
    },
    {
      title: 'Style',
      fields: [
        { path: 'style', label: 'Style', kind: 'textstyle' },
        { path: 'fill', label: 'Fill', kind: 'fill' },
        { path: 'stroke', label: 'Border', kind: 'stroke' },
        { path: 'radius', label: 'Radius', kind: 'number', min: 0, max: 200 },
      ],
    },
  ],
  'status.panel': [
    {
      title: 'Rows',
      fields: [
        { path: 'rows', label: 'Rows', kind: 'rows' },
        { path: 'rowHeight', label: 'Row height', kind: 'number', min: 16, max: 200 },
      ],
    },
    {
      title: 'Styles',
      fields: [
        { path: 'labelStyle', label: 'Label', kind: 'textstyle' },
        { path: 'valueStyle', label: 'Value', kind: 'textstyle' },
        { path: 'unitStyle', label: 'Unit', kind: 'textstyle' },
      ],
    },
    {
      title: 'Panel',
      fields: [
        { path: 'background', label: 'Background', kind: 'fill' },
        { path: 'radius', label: 'Radius', kind: 'number', min: 0, max: 100 },
        { path: 'padding', label: 'Padding', kind: 'number', min: 0, max: 100 },
        { path: 'divider', label: 'Divider', kind: 'stroke' },
      ],
    },
  ],
  text: [
    {
      title: 'Text',
      fields: [
        {
          path: 'text',
          label: 'Text',
          kind: 'text',
          hint: '{value} and {unit} insert the bound signal',
        },
        { path: 'format', label: 'Format', kind: 'format' },
        { path: 'style', label: 'Style', kind: 'textstyle' },
        { path: 'wrap', label: 'Wrap', kind: 'bool' },
        { path: 'lineHeight', label: 'Line height', kind: 'number', min: 0.8, max: 3, step: 0.05 },
        { path: 'clip', label: 'Clip to box', kind: 'bool' },
      ],
    },
  ],
  rect: [
    {
      title: 'Rectangle',
      fields: [
        { path: 'fill', label: 'Fill', kind: 'fill' },
        { path: 'radius', label: 'Radius', kind: 'number', min: 0, max: 500 },
        { path: 'stroke', label: 'Border', kind: 'stroke' },
      ],
    },
  ],
  ellipse: [
    {
      title: 'Ellipse',
      fields: [
        { path: 'fill', label: 'Fill', kind: 'fill' },
        { path: 'stroke', label: 'Border', kind: 'stroke' },
      ],
    },
  ],
  line: [
    {
      title: 'Line',
      fields: [
        {
          path: 'direction',
          label: 'Direction',
          kind: 'select',
          options: opt(['horizontal', 'vertical', 'diagonal', 'diagonal-flip']),
        },
        { path: 'stroke', label: 'Stroke', kind: 'stroke' },
      ],
    },
  ],
  arc: [
    {
      title: 'Arc',
      fields: [
        { path: 'startAngle', label: 'Start angle', kind: 'number', min: -360, max: 360 },
        { path: 'sweepAngle', label: 'Sweep', kind: 'number', min: -360, max: 360 },
        { path: 'stroke', label: 'Stroke', kind: 'stroke' },
        { path: 'fill', label: 'Pie fill', kind: 'fill' },
      ],
    },
  ],
  // The picture has its own section and editor (InspectorPanel, ImageEditor).
  image: [],
};

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Build a nested patch object { a: { b: value } } from a dotted path. */
export function patchFor(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  const root: Record<string, unknown> = {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next: Record<string, unknown> = {};
    cur[parts[i]!] = next;
    cur = next;
  }
  cur[parts[parts.length - 1]!] = value;
  return root;
}
