import { create } from 'zustand';
import type { Asset, Component } from '@idv7lol/theme-schema';
import { findComponent, flattenComponents } from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { translate } from '../i18n/index.js';

/**
 * "My pieces": components the user saved to reuse in any theme. They live in
 * this computer's Studio storage, with the pictures they use.
 */
export interface SavedPiece {
  id: string;
  name: string;
  savedAt: number;
  components: Component[];
  assets: Record<string, Asset>;
}

const KEY = 'idv7lol.studio.pieces';
const MAX_PIECES = 60;

function read(): SavedPiece[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedPiece[]) : [];
    return Array.isArray(list) ? list.filter((p) => p && Array.isArray(p.components)) : [];
  } catch {
    return [];
  }
}

/** Write the list; false when the browser storage is full or unavailable. */
function write(list: SavedPiece[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

interface PiecesState {
  pieces: SavedPiece[];
  /** Save the selected components; returns the new piece, or null when nothing was saved. */
  saveSelection(): SavedPiece | 'full' | null;
  rename(id: string, name: string): void;
  remove(id: string): void;
  insert(id: string, at?: { x: number; y: number }): void;
}

function pieceName(components: Component[]): string {
  const lang = useUiStore.getState().lang;
  if (components.length > 1) return translate(lang, 'library.pieceCount', { n: components.length });
  const c = components[0]!;
  return (c.name || translate(lang, `components.${c.type}`)).slice(0, 48);
}

export const usePiecesStore = create<PiecesState>((set, get) => ({
  pieces: typeof localStorage === 'undefined' ? [] : read(),
  saveSelection: () => {
    const { theme, selection } = useProjectStore.getState();
    const sel = new Set(selection);
    // Top-level picks only: a selected group brings its children along.
    const components = flattenComponents(theme.components)
      .filter((f) => sel.has(f.component.id) && !f.parents.some((p) => sel.has(p)))
      .map((f) => structuredClone(f.component));
    if (!components.length) return null;
    const used = new Set<string>();
    const walk = (list: Component[]) =>
      list.forEach((c) => {
        if (c.type === 'image') used.add(c.props.asset);
        if (c.type === 'group') walk(c.props.children);
      });
    walk(components);
    const assets = Object.fromEntries(
      [...used].filter((id) => theme.assets[id]).map((id) => [id, theme.assets[id]!]),
    );
    const piece: SavedPiece = {
      id: `piece-${Date.now().toString(36)}`,
      name: pieceName(components),
      savedAt: Date.now(),
      components,
      assets,
    };
    const list = [piece, ...get().pieces].slice(0, MAX_PIECES);
    if (!write(list)) return 'full';
    set({ pieces: list });
    return piece;
  },
  rename: (id, name) => {
    const list = get().pieces.map((p) =>
      p.id === id ? { ...p, name: name.trim().slice(0, 48) || p.name } : p,
    );
    if (write(list)) set({ pieces: list });
  },
  remove: (id) => {
    const list = get().pieces.filter((p) => p.id !== id);
    if (write(list)) set({ pieces: list });
  },
  insert: (id, at) => {
    const p = get().pieces.find((x) => x.id === id);
    if (!p) return;
    useProjectStore.getState().pasteComponents(p.components, p.assets, at);
  },
}));

/** True when the current selection has something worth saving as a piece. */
export function canSavePiece(): boolean {
  const { theme, selection } = useProjectStore.getState();
  return selection.some((id) => !!findComponent(theme.components, id));
}
