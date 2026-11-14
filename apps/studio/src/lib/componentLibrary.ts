import type { ComponentType } from '@idv7lol/theme-schema';

export type LibraryGroup = 'blocks' | 'gauges' | 'readouts' | 'indicators' | 'text' | 'decor';

export interface LibraryPart {
  type: ComponentType;
  /** createComponent overrides; x and y are relative to the block's top-left. */
  overrides: Record<string, unknown>;
}

export interface LibraryEntry {
  id: string;
  group: LibraryGroup;
  /** For a block, the type its icon shows (`group`). */
  type: ComponentType;
  /** i18n keys under `presets.` */
  nameKey: string;
  descKey?: string;
  /** Overrides passed to createComponent (size, binding, props…). */
  overrides: Record<string, unknown>;
  /** Several components added together, already arranged. */
  parts?: LibraryPart[];
}

const label = (text: string, x: number, y: number, w: number, extra: object = {}): LibraryPart => ({
  type: 'text',
  overrides: {
    x,
    y,
    width: w,
    height: 24,
    props: {
      text,
      style: {
        size: 16,
        weight: 'medium',
        color: '$text-muted',
        align: 'center',
        letterSpacing: 2,
      },
      ...extra,
    },
  },
});

const telltale = (
  id: string,
  icon: string,
  signal: string,
  nameKey: string,
  onColor: string,
): LibraryEntry => ({
  id,
  group: 'indicators',
  type: 'telltale',
  nameKey,
  overrides: { width: 48, height: 48, binding: { signal }, props: { icon, onColor } },
});

const modeText = (signal: string, size: number, w: number, h: number) => ({
  width: w,
  height: h,
  binding: { signal, fallback: 'hide' },
  props: {
    text: '{value}',
    style: { size, weight: 'bold', color: '$text', align: 'center', uppercase: true },
  },
});

/** Blocks: a few components arranged together, added in one go. */
const BLOCKS: LibraryEntry[] = [
  {
    id: 'block-speed-gear',
    group: 'blocks',
    type: 'group',
    nameKey: 'blockSpeedGear',
    descKey: 'blockSpeedGearDesc',
    overrides: {},
    parts: [
      {
        type: 'value.digital',
        overrides: {
          x: 0,
          y: 10,
          width: 300,
          height: 160,
          binding: { signal: 'vehicle.speed' },
          props: { format: '0', unit: 'kmh', showUnit: true, valueStyle: { size: 120 } },
        },
      },
      { type: 'indicator.gear', overrides: { x: 320, y: 0, width: 150, height: 170 } },
      { type: 'text', overrides: { x: 320, y: 176, ...modeText('drive.mode', 20, 150, 28) } },
    ],
  },
  {
    id: 'block-turn-pair',
    group: 'blocks',
    type: 'group',
    nameKey: 'blockTurnPair',
    descKey: 'blockTurnPairDesc',
    overrides: {},
    parts: [
      {
        type: 'telltale',
        overrides: {
          x: 0,
          y: 0,
          width: 56,
          height: 56,
          binding: { signal: 'light.turn.left' },
          props: { icon: 'turn-left', hideWhenOff: true },
        },
      },
      {
        type: 'telltale',
        overrides: {
          x: 504,
          y: 0,
          width: 56,
          height: 56,
          binding: { signal: 'light.turn.right' },
          props: { icon: 'turn-right', hideWhenOff: true },
        },
      },
    ],
  },
  {
    id: 'block-temps-columns',
    group: 'blocks',
    type: 'group',
    nameKey: 'blockTemps',
    descKey: 'blockTempsDesc',
    overrides: {},
    parts: [
      label('OIL', 0, 0, 70),
      {
        type: 'gauge.bar',
        overrides: {
          x: 12,
          y: 30,
          width: 46,
          height: 220,
          binding: { signal: 'engine.oil.temp', min: 50, max: 170, smoothing: 0.3 },
          props: {
            orientation: 'vertical',
            fill: {
              mode: 'segments',
              segments: 14,
              segmentGap: 3,
              zones: [{ from: 130, to: 170, color: '$danger' }],
            },
          },
        },
      },
      label('WATER', 90, 0, 70),
      {
        type: 'gauge.bar',
        overrides: {
          x: 102,
          y: 30,
          width: 46,
          height: 220,
          binding: { signal: 'engine.coolant.temp', min: 50, max: 130, smoothing: 0.3 },
          props: {
            orientation: 'vertical',
            fill: {
              mode: 'segments',
              segments: 14,
              segmentGap: 3,
              zones: [{ from: 115, to: 130, color: '$danger' }],
            },
          },
        },
      },
      label('°C', 0, 256, 160),
    ],
  },
  {
    id: 'block-info-row',
    group: 'blocks',
    type: 'group',
    nameKey: 'blockInfoRow',
    descKey: 'blockInfoRowDesc',
    overrides: {},
    parts: (
      [
        ['Oil', 'engine.oil.temp', 'celsius', '0'],
        ['Coolant', 'engine.coolant.temp', 'celsius', '0'],
        ['Boost', 'engine.boost', 'bar', '0.0'],
      ] as const
    ).map(([name, signal, unit, format], i) => ({
      type: 'value.digital' as const,
      overrides: {
        x: i * 196,
        y: 0,
        width: 180,
        height: 110,
        binding: { signal, unit, smoothing: 0.3 },
        props: {
          format,
          unit,
          showUnit: true,
          label: name,
          valueStyle: { size: 44, weight: 'medium', align: 'left' },
          unitStyle: { size: 16, align: 'left' },
          labelStyle: { size: 16, align: 'left', letterSpacing: 2 },
          background: '$surface',
          radius: 10,
          padding: 14,
        },
      },
    })),
  },
  {
    id: 'block-mode-strip',
    group: 'blocks',
    type: 'group',
    nameKey: 'blockModes',
    descKey: 'blockModesDesc',
    overrides: {},
    parts: [
      { type: 'text', overrides: { x: 0, y: 0, ...modeText('drive.mode', 24, 200, 36) } },
      {
        type: 'line',
        overrides: {
          x: 210,
          y: 4,
          width: 2,
          height: 28,
          props: { direction: 'vertical', stroke: { color: '$track', width: 2 } },
        },
      },
      { type: 'text', overrides: { x: 222, y: 0, ...modeText('transmission.mode', 24, 120, 36) } },
    ],
  },
];

export const LIBRARY: LibraryEntry[] = [
  ...BLOCKS,
  {
    id: 'tachometer',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'tachometer',
    descKey: 'tachometerDesc',
    overrides: {
      width: 480,
      height: 480,
      binding: { signal: 'engine.rpm', min: 0, max: 8000, smoothing: 0.06 },
      props: {
        fill: {
          mode: 'segments',
          segments: 48,
          segmentGap: 1.2,
          zones: [{ from: 7000, to: 8000, color: '$danger' }],
        },
        labels: { divisor: 1000 },
        redline: { show: true, from: 7000 },
        ticks: { redlineColor: '$danger' },
        glow: { show: true },
      },
    },
  },
  {
    id: 'analog-speed',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'analogSpeed',
    descKey: 'analogSpeedDesc',
    overrides: {
      width: 420,
      height: 420,
      binding: { signal: 'vehicle.speed', min: 0, max: 260, smoothing: 0.12 },
      props: {
        track: { width: 3 },
        fill: { show: false },
        ticks: { major: 13, minor: 1 },
        labels: { every: 2 },
        needle: { show: true, length: 0.9, tail: 0.14, width: 7 },
        valueText: { show: true, format: '0', showUnit: true, offsetY: 90 },
      },
    },
  },
  {
    id: 'boost',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'boost',
    descKey: 'boostDesc',
    overrides: {
      width: 280,
      height: 280,
      binding: { signal: 'engine.boost', unit: 'bar', min: -1, max: 2, smoothing: 0.1 },
      props: {
        track: { width: 10 },
        fill: { width: 10, zones: [{ from: 1.6, to: 2, color: '$danger' }] },
        ticks: { major: 6, minor: 1, majorLength: 10, minorLength: 5 },
        labels: { show: false },
        needle: { show: true, width: 4, length: 0.72, cap: { radius: 8 } },
        valueText: {
          show: true,
          format: '+0.00',
          showUnit: true,
          offsetY: 56,
          style: { size: 40 },
        },
      },
    },
  },
  {
    id: 'ring',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'ring',
    descKey: 'ringDesc',
    overrides: {
      width: 220,
      height: 220,
      binding: { signal: 'fuel.level' },
      props: {
        startAngle: -90,
        sweepAngle: 360,
        track: { width: 12 },
        fill: { width: 12, cap: 'round' },
        ticks: { major: 0 },
        labels: { show: false },
        valueText: { show: true, format: '0', showUnit: true, style: { size: 56 } },
      },
    },
  },
  {
    id: 'linear-tacho',
    group: 'gauges',
    type: 'gauge.bar',
    nameKey: 'linearTacho',
    descKey: 'linearTachoDesc',
    overrides: {
      width: 800,
      height: 18,
      binding: { signal: 'engine.rpm', min: 0, max: 7000, smoothing: 0.06 },
      props: {
        fill: { zones: [{ from: 6000, to: 7000, color: '$danger' }] },
        ticks: { show: true, count: 8 },
        marker: { show: true, value: 6000, color: '$danger' },
        glow: { show: true },
      },
    },
  },
  {
    id: 'fuel-bar',
    group: 'gauges',
    type: 'gauge.bar',
    nameKey: 'fuel',
    descKey: 'fuelDesc',
    overrides: {
      width: 400,
      height: 14,
      binding: { signal: 'fuel.level', smoothing: 0.5 },
      props: {
        fill: {
          mode: 'segments',
          segments: 20,
          segmentGap: 3,
          zones: [{ from: 0, to: 15, color: '$danger' }],
        },
        marker: { show: true, value: 15, color: '$text-muted' },
      },
    },
  },
  {
    id: 'temp-bar',
    group: 'gauges',
    type: 'gauge.bar',
    nameKey: 'temp',
    descKey: 'tempDesc',
    overrides: {
      width: 400,
      height: 14,
      binding: { signal: 'engine.oil.temp', min: 40, max: 160, smoothing: 0.3 },
      props: {
        fill: {
          zones: [
            { from: 40, to: 75, color: '$accent' },
            { from: 130, to: 160, color: '$danger' },
          ],
        },
        marker: { show: true, value: 75, color: '$text-muted' },
      },
    },
  },
  {
    id: 'sweep-tach',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'sweepTach',
    descKey: 'sweepTachDesc',
    overrides: {
      width: 640,
      height: 640,
      binding: { signal: 'engine.rpm', min: 0, max: 8000, smoothing: 0.06 },
      props: {
        startAngle: 190,
        sweepAngle: 160,
        track: { width: 36 },
        fill: {
          width: 36,
          mode: 'segments',
          segments: 64,
          segmentGap: 1,
          zones: [{ from: 6500, to: 8000, color: '$danger' }],
        },
        ticks: { major: 9, minor: 1 },
        labels: { divisor: 1000, style: { size: 34 } },
        redline: { show: true, from: 6500 },
      },
    },
  },
  {
    id: 'half-tach',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'halfTach',
    descKey: 'halfTachDesc',
    overrides: {
      width: 420,
      height: 420,
      binding: { signal: 'engine.rpm', min: 0, max: 7000, smoothing: 0.06 },
      props: {
        startAngle: 180,
        sweepAngle: 180,
        fill: { cap: 'round', zones: [{ from: 6000, to: 7000, color: '$danger' }] },
        ticks: { major: 8, minor: 1 },
        labels: { divisor: 1000 },
        valueText: { show: true, format: '0', offsetY: -30, style: { size: 48 } },
      },
    },
  },
  {
    id: 'g-meter',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'gMeter',
    descKey: 'gMeterDesc',
    overrides: {
      width: 260,
      height: 260,
      binding: { signal: 'chassis.accel.lat', min: -1.5, max: 1.5, smoothing: 0.2 },
      props: {
        startAngle: 210,
        sweepAngle: 120,
        fill: { show: false },
        ticks: { major: 7, minor: 1 },
        labels: { show: false },
        needle: { show: true, width: 4, length: 0.8, cap: { radius: 7 } },
        valueText: { show: true, format: '0.00', showUnit: true, offsetY: 40, style: { size: 32 } },
      },
    },
  },
  {
    id: 'oil-column',
    group: 'gauges',
    type: 'gauge.bar',
    nameKey: 'oilColumn',
    descKey: 'oilColumnDesc',
    overrides: {
      width: 46,
      height: 220,
      binding: { signal: 'engine.oil.temp', min: 50, max: 170, smoothing: 0.3 },
      props: {
        orientation: 'vertical',
        fill: {
          mode: 'segments',
          segments: 14,
          segmentGap: 3,
          zones: [{ from: 130, to: 170, color: '$danger' }],
        },
      },
    },
  },
  {
    id: 'oil-pressure',
    group: 'gauges',
    type: 'gauge.bar',
    nameKey: 'oilPressure',
    descKey: 'oilPressureDesc',
    overrides: {
      width: 360,
      height: 14,
      binding: { signal: 'engine.oil.pressure', min: 0, max: 6, smoothing: 0.3 },
      props: {
        fill: { zones: [{ from: 0, to: 1, color: '$danger' }] },
        ticks: { show: true, count: 7 },
      },
    },
  },
  {
    id: 'torque-ring',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'torqueRing',
    descKey: 'torqueRingDesc',
    overrides: {
      width: 240,
      height: 240,
      binding: { signal: 'engine.torque', min: 0, max: 700, smoothing: 0.1 },
      props: {
        startAngle: 135,
        sweepAngle: 270,
        track: { width: 14 },
        fill: { width: 14, cap: 'round' },
        ticks: { major: 0 },
        labels: { show: false },
        valueText: { show: true, format: '0', showUnit: true, style: { size: 48 } },
      },
    },
  },
  {
    id: 'speed',
    group: 'readouts',
    type: 'value.digital',
    nameKey: 'speed',
    descKey: 'speedDesc',
    overrides: {
      width: 320,
      height: 170,
      binding: { signal: 'vehicle.speed' },
      props: {
        format: '0',
        unit: 'kmh',
        showUnit: true,
        valueStyle: { size: 126, letterSpacing: -2 },
      },
    },
  },
  {
    id: 'card',
    group: 'readouts',
    type: 'value.digital',
    nameKey: 'card',
    descKey: 'cardDesc',
    overrides: {
      width: 180,
      height: 110,
      binding: { signal: 'engine.coolant.temp', smoothing: 0.3 },
      props: {
        format: '0',
        unit: 'celsius',
        showUnit: true,
        label: 'Coolant',
        valueStyle: { size: 44, weight: 'medium', align: 'left' },
        unitStyle: { size: 16, align: 'left' },
        labelStyle: { size: 16, align: 'left', letterSpacing: 2 },
        background: '$surface',
        radius: 10,
        padding: 14,
      },
    },
  },
  {
    id: 'battery',
    group: 'readouts',
    type: 'value.digital',
    nameKey: 'battery',
    descKey: 'batteryDesc',
    overrides: {
      width: 200,
      height: 90,
      binding: { signal: 'electrical.battery.voltage' },
      props: {
        format: '0.0',
        unit: 'volt',
        showUnit: true,
        label: 'Battery',
        layout: 'inline',
        valueStyle: { size: 40 },
      },
    },
  },
  {
    id: 'panel',
    group: 'readouts',
    type: 'status.panel',
    nameKey: 'panel',
    descKey: 'panelDesc',
    overrides: {
      width: 360,
      height: 160,
      props: { background: '$surface', divider: { color: '$track', width: 1 } },
    },
  },
  {
    id: 'alert-fuel',
    group: 'indicators',
    type: 'alert',
    nameKey: 'alertFuel',
    descKey: 'alertDesc',
    overrides: {
      width: 420,
      height: 72,
      visibleWhen: { signal: 'fuel.low', op: 'truthy' },
      props: {
        text: 'Low fuel',
        icon: 'fuel',
        iconColor: '$warning',
        priority: 4,
        stroke: { color: '$warning', width: 3 },
      },
    },
  },
  {
    id: 'alert-hot',
    group: 'indicators',
    type: 'alert',
    nameKey: 'alertHot',
    descKey: 'alertDesc',
    overrides: {
      width: 420,
      height: 72,
      visibleWhen: { signal: 'engine.coolant.temp', op: 'gt', value: 115 },
      props: { text: 'Engine hot', icon: 'coolant', priority: 8, flash: true },
    },
  },
  {
    id: 'clock',
    group: 'readouts',
    type: 'clock',
    nameKey: 'clock',
    descKey: 'clockDesc',
    overrides: { width: 200, height: 48 },
  },
  {
    id: 'drive-mode',
    group: 'readouts',
    type: 'text',
    nameKey: 'driveMode',
    descKey: 'driveModeDesc',
    overrides: modeText('drive.mode', 24, 200, 36),
  },
  {
    id: 'outside-temp',
    group: 'readouts',
    type: 'text',
    nameKey: 'outsideTemp',
    descKey: 'outsideTempDesc',
    overrides: {
      width: 140,
      height: 36,
      binding: { signal: 'environment.outside.temp' },
      props: { text: '{value}{unit}', format: '0.0', style: { size: 28, weight: 'bold' } },
    },
  },
  {
    id: 'odometer',
    group: 'readouts',
    type: 'text',
    nameKey: 'odometer',
    descKey: 'odometerDesc',
    overrides: {
      width: 240,
      height: 36,
      binding: { signal: 'vehicle.odometer' },
      props: { text: '{value} {unit}', format: '000000', style: { size: 26, weight: 'bold' } },
    },
  },
  {
    id: 'torque',
    group: 'readouts',
    type: 'value.digital',
    nameKey: 'torque',
    descKey: 'torqueDesc',
    overrides: {
      width: 200,
      height: 100,
      binding: { signal: 'engine.torque', smoothing: 0.1 },
      props: { format: '0', unit: 'nm', showUnit: true, label: 'Torque', valueStyle: { size: 48 } },
    },
  },
  {
    id: 'big-gear',
    group: 'indicators',
    type: 'indicator.gear',
    nameKey: 'bigGear',
    descKey: 'bigGearDesc',
    overrides: { width: 260, height: 300 },
  },
  {
    id: 'gear',
    group: 'indicators',
    type: 'indicator.gear',
    nameKey: 'gear',
    descKey: 'gearDesc',
    overrides: { width: 160, height: 180 },
  },
  {
    id: 'shift',
    group: 'indicators',
    type: 'indicator.shiftlights',
    nameKey: 'shift',
    descKey: 'shiftDesc',
    overrides: {
      width: 600,
      height: 28,
      binding: { signal: 'engine.rpm', min: 0, max: 8000 },
      props: { count: 10, shape: 'pill', gap: 6, from: 5000, to: 7000, flashAbove: 7200 },
    },
  },
  {
    id: 'turn-left',
    group: 'indicators',
    type: 'telltale',
    nameKey: 'turnLeft',
    overrides: {
      width: 48,
      height: 48,
      binding: { signal: 'light.turn.left' },
      props: { icon: 'turn-left' },
    },
  },
  {
    id: 'turn-right',
    group: 'indicators',
    type: 'telltale',
    nameKey: 'turnRight',
    overrides: {
      width: 48,
      height: 48,
      binding: { signal: 'light.turn.right' },
      props: { icon: 'turn-right' },
    },
  },
  telltale('high-beam', 'high-beam', 'light.high.beam', 'highBeam', '$accent'),
  telltale('low-beam', 'low-beam', 'light.low.beam', 'lowBeam', '$success'),
  telltale('fog-rear', 'fog-rear', 'light.fog.rear', 'fogRear', '$warning'),
  telltale('parking-brake', 'parking-brake', 'chassis.handbrake', 'parkingBrake', '$danger'),
  telltale('cruise', 'cruise', 'vehicle.cruise.active', 'cruise', '$success'),
  telltale('fuel-low', 'fuel', 'fuel.low', 'fuelLow', '$warning'),
  {
    id: 'shift-led',
    group: 'indicators',
    type: 'indicator.shiftlights',
    nameKey: 'shiftLed',
    descKey: 'shiftLedDesc',
    overrides: {
      width: 900,
      height: 20,
      binding: { signal: 'engine.rpm', min: 0, max: 8000 },
      props: { count: 15, shape: 'rect', gap: 4, from: 4500, to: 7000, flashAbove: 7200 },
    },
  },
  {
    id: 'text',
    group: 'text',
    type: 'text',
    nameKey: 'text',
    descKey: 'textDesc',
    overrides: { width: 240, height: 40, props: { text: 'Label', style: { size: 24 } } },
  },
  {
    id: 'rect',
    group: 'text',
    type: 'rect',
    nameKey: 'rect',
    overrides: { props: { fill: '$surface', radius: 12 } },
  },
  {
    id: 'ellipse',
    group: 'text',
    type: 'ellipse',
    nameKey: 'ellipse',
    overrides: { props: { fill: '$surface' } },
  },
  {
    id: 'line',
    group: 'text',
    type: 'line',
    nameKey: 'line',
    overrides: { width: 300, height: 2, props: { stroke: { color: '$track', width: 2 } } },
  },
  {
    id: 'arc',
    group: 'decor',
    type: 'arc',
    nameKey: 'arc',
    overrides: { props: { stroke: { color: '$track', width: 10 } } },
  },
];

export const LIBRARY_GROUPS: LibraryGroup[] = [
  'blocks',
  'gauges',
  'readouts',
  'indicators',
  'text',
  'decor',
];

export function libraryEntry(id: string): LibraryEntry | undefined {
  return LIBRARY.find((e) => e.id === id);
}
