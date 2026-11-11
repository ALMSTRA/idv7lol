import { createComponent, type Component } from '@idv7lol/theme-schema';
import { useProjectStore } from '../store/project.js';
import type { LibraryEntry } from './componentLibrary.js';

/** The components of a block, laid out from (0, 0). Ids are placeholders; insertion renumbers them. */
export function blockComponents(entry: LibraryEntry): Component[] {
  return (entry.parts ?? []).map((p, i) =>
    createComponent(p.type, { id: `${entry.id}-${i}`, ...(p.overrides as object) }),
  );
}

/**
 * Add a library entry to the theme, centred on `at` (layout pixels) or on the
 * layout when no point is given. A block's components are added together and
 * left selected, so they can be moved or grouped at once.
 */
export function placeLibraryEntry(entry: LibraryEntry, at?: { x: number; y: number }): void {
  const store = useProjectStore.getState();
  if (!entry.parts) {
    store.addComponent(entry.type, at, entry.overrides);
    return;
  }
  const parts = blockComponents(entry);
  const w = Math.max(...parts.map((c) => c.x + c.width));
  const h = Math.max(...parts.map((c) => c.y + c.height));
  const { width, height } = store.theme.layout;
  const cx = at ? at.x : width / 2;
  const cy = at ? at.y : height / 2;
  store.insertComponents(parts, {
    x: Math.max(0, Math.round(cx - w / 2)),
    y: Math.max(0, Math.round(cy - h / 2)),
  });
}
