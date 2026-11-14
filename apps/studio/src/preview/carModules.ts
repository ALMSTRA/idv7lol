/**
 * The car app's own engine (CommonJS for Node 8), loaded through the Vite
 * plugin in vite.config.ts so the shader preview runs exactly the code the
 * head unit runs.
 */
import engine from '../../../idv7lol/engine.js?car';

export interface CarEngine {
  shown: boolean;
  tick(): void;
  setTheme(theme: unknown, fonts?: unknown): void;
  setShown(want: boolean): void;
  status(): { layers: number; failed: boolean; shown: boolean };
}

export type CarEngineClass = new (opts: Record<string, unknown>) => CarEngine;

export function carEngineClass(): CarEngineClass {
  return (engine as { ClusterEngine: CarEngineClass }).ClusterEngine;
}

/** Where the car app ends a layout so the cluster's own bottom strip shows (its default). */
export function carStripY(): number {
  return (engine as { STRIP_Y: number }).STRIP_Y;
}
