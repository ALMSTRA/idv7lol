import type { ComponentType } from '@idv7lol/theme-schema';

export type LibraryGroup = 'gauges' | 'readouts' | 'indicators' | 'text' | 'decor';

export interface LibraryEntry {
  id: string;
  group: LibraryGroup;
  type: ComponentType;
  /** i18n keys under `presets.` */
  nameKey: string;
  descKey?: string;
  glyph: string;
  /** Overrides passed to createComponent (size, binding, props…). */
  overrides: Record<string, unknown>;
}

export const LIBRARY: LibraryEntry[] = [
  {
    id: 'tachometer',
    group: 'gauges',
    type: 'gauge.arc',
    nameKey: 'tachometer',
    descKey: 'tachometerDesc',
    glyph: '◔',
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
    glyph: '◷',
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
    glyph: '◕',
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
    glyph: '◯',
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
    glyph: '▬',
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
    glyph: '▮',
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
    glyph: '▭',
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
    id: 'speed',
    group: 'readouts',
    type: 'value.digital',
    nameKey: 'speed',
    descKey: 'speedDesc',
    glyph: '88',
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
    glyph: '▣',
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
    glyph: '⚡',
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
    glyph: '☰',
    overrides: {
      width: 360,
      height: 160,
      props: { background: '$surface', divider: { color: '$track', width: 1 } },
    },
  },
  {
    id: 'clock',
    group: 'readouts',
    type: 'clock',
    nameKey: 'clock',
    descKey: 'clockDesc',
    glyph: '◴',
    overrides: { width: 200, height: 48 },
  },
  {
    id: 'gear',
    group: 'indicators',
    type: 'indicator.gear',
    nameKey: 'gear',
    descKey: 'gearDesc',
    glyph: 'D',
    overrides: { width: 160, height: 180 },
  },
  {
    id: 'shift',
    group: 'indicators',
    type: 'indicator.shiftlights',
    nameKey: 'shift',
    descKey: 'shiftDesc',
    glyph: '●●●',
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
    glyph: '⇦',
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
    glyph: '⇨',
    overrides: {
      width: 48,
      height: 48,
      binding: { signal: 'light.turn.right' },
      props: { icon: 'turn-right' },
    },
  },
  {
    id: 'text',
    group: 'text',
    type: 'text',
    nameKey: 'text',
    descKey: 'textDesc',
    glyph: 'T',
    overrides: { width: 240, height: 40, props: { text: 'Label', style: { size: 24 } } },
  },
  {
    id: 'rect',
    group: 'text',
    type: 'rect',
    nameKey: 'rect',
    glyph: '▭',
    overrides: { props: { fill: '$surface', radius: 12 } },
  },
  {
    id: 'ellipse',
    group: 'text',
    type: 'ellipse',
    nameKey: 'ellipse',
    glyph: '◯',
    overrides: { props: { fill: '$surface' } },
  },
  {
    id: 'line',
    group: 'text',
    type: 'line',
    nameKey: 'line',
    glyph: '—',
    overrides: { width: 300, height: 2, props: { stroke: { color: '$track', width: 2 } } },
  },
  {
    id: 'arc',
    group: 'decor',
    type: 'arc',
    nameKey: 'arc',
    glyph: '◠',
    overrides: { props: { stroke: { color: '$track', width: 10 } } },
  },
  {
    id: 'image',
    group: 'decor',
    type: 'image',
    nameKey: 'image',
    glyph: '🖼',
    overrides: { props: { asset: 'logo' } },
  },
];

export const LIBRARY_GROUPS: LibraryGroup[] = ['gauges', 'readouts', 'indicators', 'text', 'decor'];

export function libraryEntry(id: string): LibraryEntry | undefined {
  return LIBRARY.find((e) => e.id === id);
}
