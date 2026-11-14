import type { AlertComponent, Component } from '@idv7lol/theme-schema';
import { flattenComponents } from './bounds.js';

/** Every alert of the layout, in layout order (inside groups too). */
export function alertsOf(components: readonly Component[]): AlertComponent[] {
  return flattenComponents(components)
    .map((f) => f.component)
    .filter((c): c is AlertComponent => c.type === 'alert');
}

/**
 * The alert that shows: of those visible whose condition holds, the highest priority, the first
 * in the layout on a tie. `preview` (an alert the designer has selected) shows whatever holds.
 */
export function topAlert(
  components: readonly Component[],
  holds: (c: AlertComponent) => boolean,
  preview?: string,
): string | null {
  let best: AlertComponent | null = null;
  for (const a of alertsOf(components)) {
    if (preview && a.id === preview) return a.id;
    if (!a.visible || !holds(a)) continue;
    if (!best || a.props.priority > best.props.priority) best = a;
  }
  return best ? best.id : null;
}
