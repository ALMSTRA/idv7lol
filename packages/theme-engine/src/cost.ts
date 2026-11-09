import type { Component, Theme } from '@idv7lol/theme-schema';
import { rendererFor } from './components/index.js';

/** Hard limits of the cluster renderer (cluster-render ≥ 0.4.2). */
export const RENDERER_LIMITS = {
  /** Effect layers one client (app) may hold. */
  layersPerApp: 64,
  /** Layers across all clients; other apps may be using some. */
  layersTotal: 96,
  /** Comfortable budget idv7lol aims for, leaving room for other apps. */
  layersRecommended: 48,
  uniformsPerLayer: 32,
  floatsPerLayer: 4096,
  glyphsPerTextLayer: 32,
  /** CPU pixel memory of the service, shared by all images and atlases of all apps. */
  pixelMemoryBytes: 16 * 1024 * 1024,
  /** Largest image layer the renderer accepts. */
  imageMaxWidth: 1920,
  imageMaxHeight: 720,
} as const;

export interface ComponentCost {
  id: string;
  type: Component['type'];
  layers: number;
  /** Estimated relative GPU/CPU weight, 1 = a flat rectangle. */
  weight: number;
}

export interface ThemeCost {
  layers: number;
  weight: number;
  components: ComponentCost[];
  overBudget: boolean;
  overLimit: boolean;
}

const WEIGHTS: Record<Component['type'], number> = {
  rect: 1,
  ellipse: 1,
  line: 1,
  arc: 1.5,
  text: 2,
  image: 1.5,
  'gauge.arc': 6,
  'gauge.bar': 3,
  'value.digital': 3,
  'indicator.gear': 2,
  'indicator.shiftlights': 2,
  clock: 2,
  telltale: 1.5,
  'status.panel': 4,
  group: 0,
};

export function componentCost(c: Component): ComponentCost {
  if (c.type === 'group') {
    let layers = 0;
    let weight = 0;
    for (const child of c.props.children) {
      const cc = componentCost(child);
      layers += cc.layers;
      weight += cc.weight;
    }
    return { id: c.id, type: c.type, layers, weight };
  }
  const r = rendererFor(c.type);
  const layers = r ? r.layers(c) : 1;
  const animated = c.animations.length > 0 ? 1.5 : 1;
  return { id: c.id, type: c.type, layers, weight: WEIGHTS[c.type] * animated };
}

export function themeCost(theme: Theme): ThemeCost {
  const components = theme.components.map(componentCost);
  const layers = components.reduce((a, c) => a + c.layers, 0);
  const weight = components.reduce((a, c) => a + c.weight, 0);
  return {
    layers,
    weight,
    components,
    overBudget: layers > RENDERER_LIMITS.layersRecommended,
    overLimit: layers > RENDERER_LIMITS.layersPerApp,
  };
}
