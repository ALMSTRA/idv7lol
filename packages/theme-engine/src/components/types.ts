import type { Component } from '@idv7lol/theme-schema';
import type { RenderContext } from '../render-context.js';

/**
 * A component renderer draws one component type in local coordinates: the
 * origin is the component's top-left corner and the box is `w` × `h`.
 */
export interface ComponentRenderer<C extends Component = Component> {
  type: C['type'];
  draw(rc: RenderContext, c: C, w: number, h: number): void;
  /**
   * Estimated number of cluster-render effect layers the compiler emits for
   * this component. Used for the layer budget and the Studio cost column.
   */
  layers(c: C): number;
}
