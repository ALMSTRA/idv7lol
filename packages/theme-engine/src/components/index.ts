import type { Component, ComponentType } from '@idv7lol/theme-schema';
import type { ComponentRenderer } from './types.js';
import { arcRenderer, ellipseRenderer, lineRenderer, rectRenderer } from './shapes.js';
import { clockRenderer, textRenderer } from './text.js';
import { arcGaugeRenderer, barGaugeRenderer } from './gauges.js';
import {
  digitalValueRenderer,
  gearIndicatorRenderer,
  shiftLightsRenderer,
  statusPanelRenderer,
  telltaleRenderer,
} from './indicators.js';
import { imageRenderer } from './image.js';

export type { ComponentRenderer } from './types.js';
export { shiftLightsLit } from './indicators.js';
export { resolveText, textOrigin, wrapText } from './text.js';
export { drawIcon, type IconName } from './icons.js';

type AnyRenderer = ComponentRenderer<Component>;

/** Registry of renderers by component type. Groups are handled by the renderer itself. */
export const RENDERERS: Readonly<Record<Exclude<ComponentType, 'group'>, AnyRenderer>> = {
  rect: rectRenderer as AnyRenderer,
  ellipse: ellipseRenderer as AnyRenderer,
  line: lineRenderer as AnyRenderer,
  arc: arcRenderer as AnyRenderer,
  text: textRenderer as AnyRenderer,
  image: imageRenderer as AnyRenderer,
  'gauge.arc': arcGaugeRenderer as AnyRenderer,
  'gauge.bar': barGaugeRenderer as AnyRenderer,
  'value.digital': digitalValueRenderer as AnyRenderer,
  'indicator.gear': gearIndicatorRenderer as AnyRenderer,
  'indicator.shiftlights': shiftLightsRenderer as AnyRenderer,
  clock: clockRenderer as AnyRenderer,
  telltale: telltaleRenderer as AnyRenderer,
  'status.panel': statusPanelRenderer as AnyRenderer,
};

export function rendererFor(type: ComponentType): AnyRenderer | undefined {
  return type === 'group' ? undefined : RENDERERS[type];
}
