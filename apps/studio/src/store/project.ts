import { useEffect, useState } from 'react';
import { create } from 'zustand';
import {
  ComponentSchema,
  ImageEditsSchema,
  createComponent,
  createEmptyTheme,
  nextComponentId,
  type Component,
  type ComponentType,
  type Theme,
} from '@idv7lol/theme-schema';
import { findComponent, flattenComponents } from '@idv7lol/theme-engine';
import type { ImportedImage } from '../lib/imageStore.js';

const HISTORY_LIMIT = 100;

export interface ProjectState {
  theme: Theme;
  filePath: string | null;
  dirty: boolean;
  past: Theme[];
  future: Theme[];
  selection: string[];
  hover: string | null;
  clipboard: Component[];
  /** Snapshot taken at the start of a drag; committed at the end. */
  txn: Theme | null;

  loadTheme(theme: Theme, filePath: string | null): void;
  newTheme(template?: Theme): void;
  markSaved(filePath: string | null): void;
  /** Replace the theme. Records history unless `record` is false (live drags). */
  setTheme(theme: Theme, record?: boolean): void;
  patchTheme(patch: Partial<Theme>): void;
  beginTxn(): void;
  endTxn(): void;
  undo(): void;
  redo(): void;

  select(ids: string[], additive?: boolean): void;
  setHover(id: string | null): void;
  addComponent(
    type: ComponentType,
    at?: { x: number; y: number },
    overrides?: Record<string, unknown>,
  ): string;
  insertComponents(components: Component[], at?: { x: number; y: number }): string[];
  updateComponent(id: string, patch: Partial<Component>, record?: boolean): void;
  updateProps(id: string, patch: Record<string, unknown>, record?: boolean): void;
  importImages(images: ImportedImage[], at?: { x: number; y: number }): string[];
  placeAsset(assetId: string, at?: { x: number; y: number }): string | null;
  removeAsset(assetId: string): void;
  replaceImageAsset(componentId: string, image: ImportedImage): void;
  makeBackground(componentId: string): void;
  deleteSelected(): void;
  duplicateSelected(): void;
  copySelected(): void;
  paste(at?: { x: number; y: number }): void;
  pasteComponents(
    components: Component[],
    assets: Theme['assets'],
    at?: { x: number; y: number },
  ): void;
  moveSelected(dx: number, dy: number, record?: boolean): void;
  reorder(id: string, direction: 'up' | 'down' | 'top' | 'bottom'): void;
  moveToIndex(id: string, index: number): void;
  groupSelected(): void;
  ungroupSelected(): void;
  align(mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void;
  distribute(axis: 'h' | 'v'): void;
}

/* ----- immutable tree helpers ----- */

function mapTree(components: Component[], fn: (c: Component) => Component | null): Component[] {
  const out: Component[] = [];
  for (const c of components) {
    const r = fn(c);
    if (!r) continue;
    if (r.type === 'group')
      out.push({ ...r, props: { ...r.props, children: mapTree(r.props.children, fn) } });
    else out.push(r);
  }
  return out;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      cur &&
      typeof cur === 'object' &&
      !Array.isArray(cur)
    ) {
      out[k] = deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** An image component at a sensible size: natural, or shrunk to fit part of the layout. */
function imageComponent(
  theme: Theme,
  assetId: string,
  width: number,
  height: number,
  name: string,
  taken: string[],
  at: { x: number; y: number } | undefined,
  index: number,
): Component {
  const scale = Math.min(
    1,
    (theme.layout.width * 0.4) / width,
    (theme.layout.height * 0.6) / height,
  );
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));
  const cx = at ? at.x : theme.layout.width / 2;
  const cy = at ? at.y : theme.layout.height / 2;
  return createComponent('image', {
    id: nextComponentId('image', taken),
    name: name.slice(0, 64),
    x: Math.round(cx - w / 2 + index * 28),
    y: Math.round(cy - h / 2 + index * 28),
    width: w,
    height: h,
    props: { asset: assetId },
  });
}

/** Move pasted components so their group is centred on a layout point. */
function placeClones(clones: Component[], at?: { x: number; y: number }): void {
  if (!at || !clones.length) return;
  const minX = Math.min(...clones.map((c) => c.x));
  const minY = Math.min(...clones.map((c) => c.y));
  const maxX = Math.max(...clones.map((c) => c.x + c.width));
  const maxY = Math.max(...clones.map((c) => c.y + c.height));
  const dx = Math.round(at.x - (minX + maxX) / 2);
  const dy = Math.round(at.y - (minY + maxY) / 2);
  for (const c of clones) {
    c.x += dx;
    c.y += dy;
  }
}

export function allIds(theme: Theme): string[] {
  return flattenComponents(theme.components).map((f) => f.component.id);
}

function cloneWithNewIds(c: Component, taken: Set<string>): Component {
  const id = nextComponentId(c.type, taken);
  taken.add(id);
  const copy = structuredClone(c) as Component;
  copy.id = id;
  if (copy.type === 'group')
    copy.props.children = copy.props.children.map((ch) => cloneWithNewIds(ch, taken));
  return copy;
}

function selectedTopLevel(theme: Theme, selection: string[]): Component[] {
  // Components whose parent is not also selected (so groups move as units).
  const flat = flattenComponents(theme.components);
  const sel = new Set(selection);
  return flat
    .filter((f) => sel.has(f.component.id) && !f.parents.some((p) => sel.has(p)))
    .map((f) => f.component);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  theme: createEmptyTheme(),
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  selection: [],
  hover: null,
  clipboard: [],
  txn: null,

  loadTheme: (theme, filePath) =>
    set({ theme, filePath, dirty: false, past: [], future: [], selection: [], txn: null }),
  newTheme: (template) => {
    const theme = template ? structuredClone(template) : createEmptyTheme();
    set({ theme, filePath: null, dirty: false, past: [], future: [], selection: [], txn: null });
  },
  markSaved: (filePath) => set({ filePath, dirty: false }),

  setTheme: (theme, record = true) => {
    const s = get();
    if (record) {
      set({ theme, dirty: true, past: [...s.past.slice(-HISTORY_LIMIT + 1), s.theme], future: [] });
    } else {
      set({ theme, dirty: true });
    }
  },
  patchTheme: (patch) => get().setTheme({ ...get().theme, ...patch }),
  beginTxn: () => {
    if (!get().txn) set({ txn: get().theme });
  },
  endTxn: () => {
    const s = get();
    if (!s.txn) return;
    if (s.txn !== s.theme)
      set({
        past: [...s.past.slice(-HISTORY_LIMIT + 1), s.txn],
        future: [],
        txn: null,
        dirty: true,
      });
    else set({ txn: null });
  },
  undo: () => {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    const ids = new Set(allIds(prev));
    set({
      theme: prev,
      past: s.past.slice(0, -1),
      future: [s.theme, ...s.future],
      dirty: true,
      selection: s.selection.filter((id) => ids.has(id)),
    });
  },
  redo: () => {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    const ids = new Set(allIds(next));
    set({
      theme: next,
      past: [...s.past, s.theme],
      future: s.future.slice(1),
      dirty: true,
      selection: s.selection.filter((id) => ids.has(id)),
    });
  },

  select: (ids, additive = false) => {
    const s = get();
    if (!additive) {
      set({ selection: ids });
      return;
    }
    const cur = new Set(s.selection);
    for (const id of ids) {
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
    }
    set({ selection: [...cur] });
  },
  setHover: (hover) => set({ hover }),

  addComponent: (type, at, overrides = {}) => {
    const s = get();
    const taken = allIds(s.theme);
    const id = nextComponentId(type, taken);
    const c = createComponent(type, { id, ...(overrides as object) });
    const x = at
      ? Math.round(at.x - c.width / 2)
      : Math.round((s.theme.layout.width - c.width) / 2);
    const y = at
      ? Math.round(at.y - c.height / 2)
      : Math.round((s.theme.layout.height - c.height) / 2);
    const placed = { ...c, x: Math.max(0, x), y: Math.max(0, y) } as Component;
    s.setTheme({ ...s.theme, components: [...s.theme.components, placed] });
    set({ selection: [id] });
    return id;
  },
  insertComponents: (components, at) => {
    const s = get();
    const taken = new Set(allIds(s.theme));
    const clones = components.map((c) => cloneWithNewIds(c, taken));
    if (at) {
      const minX = Math.min(...clones.map((c) => c.x));
      const minY = Math.min(...clones.map((c) => c.y));
      for (const c of clones) {
        c.x = Math.round(c.x - minX + at.x);
        c.y = Math.round(c.y - minY + at.y);
      }
    }
    s.setTheme({ ...s.theme, components: [...s.theme.components, ...clones] });
    const ids = clones.map((c) => c.id);
    set({ selection: ids });
    return ids;
  },
  updateComponent: (id, patch, record = true) => {
    const s = get();
    const components = mapTree(s.theme.components, (c) =>
      c.id === id ? ({ ...c, ...patch } as Component) : c,
    );
    s.setTheme({ ...s.theme, components }, record);
  },
  updateProps: (id, patch, record = true) => {
    const s = get();
    const components = mapTree(s.theme.components, (c) => {
      if (c.id !== id) return c;
      const merged = deepMerge(c.props as Record<string, unknown>, patch);
      // Re-parse through the schema so defaults and constraints hold; fall back to the raw merge.
      const parsed = ComponentSchema.safeParse({ ...c, props: merged });
      return parsed.success ? parsed.data : ({ ...c, props: merged } as Component);
    });
    s.setTheme({ ...s.theme, components }, record);
  },
  importImages: (images, at) => {
    const s = get();
    const assets = { ...s.theme.assets };
    const taken = allIds(s.theme);
    const added: Component[] = [];
    images.forEach((img, i) => {
      assets[img.id] = {
        type: 'image',
        name: img.name,
        data: img.data,
        width: img.width,
        height: img.height,
      };
      const c = imageComponent(
        s.theme,
        img.id,
        img.width,
        img.height,
        img.name,
        [...taken, ...added.map((a) => a.id)],
        at,
        i,
      );
      added.push(c);
    });
    s.setTheme({ ...s.theme, assets, components: [...s.theme.components, ...added] });
    const ids = added.map((c) => c.id);
    set({ selection: ids });
    return ids;
  },
  placeAsset: (assetId, at) => {
    const s = get();
    const a = s.theme.assets[assetId];
    if (!a) return null;
    const c = imageComponent(
      s.theme,
      assetId,
      a.width ?? 400,
      a.height ?? 400,
      a.name ?? assetId,
      allIds(s.theme),
      at,
      0,
    );
    s.setTheme({ ...s.theme, components: [...s.theme.components, c] });
    set({ selection: [c.id] });
    return c.id;
  },
  removeAsset: (assetId) => {
    const s = get();
    const assets = { ...s.theme.assets };
    delete assets[assetId];
    const components = mapTree(s.theme.components, (c) =>
      c.type === 'image' && c.props.asset === assetId ? null : c,
    );
    const ids = new Set(flattenComponents(components).map((f) => f.component.id));
    s.setTheme({ ...s.theme, assets, components });
    set({ selection: s.selection.filter((id) => ids.has(id)) });
  },
  replaceImageAsset: (componentId, img) => {
    const s = get();
    const assets = {
      ...s.theme.assets,
      [img.id]: {
        type: 'image' as const,
        name: img.name,
        data: img.data,
        width: img.width,
        height: img.height,
      },
    };
    const components = mapTree(s.theme.components, (c) =>
      c.id === componentId && c.type === 'image'
        ? { ...c, props: { ...c.props, asset: img.id, edits: ImageEditsSchema.parse({}) } }
        : c,
    );
    s.setTheme({ ...s.theme, assets, components });
  },
  makeBackground: (componentId) => {
    const s = get();
    const list = s.theme.components;
    const self = list.find((c) => c.id === componentId);
    if (!self || self.type !== 'image') return;
    const { width, height } = s.theme.layout;
    const rest = list.filter((c) => c !== self);
    // Stay above a solid full-layout background rectangle, or it would hide the picture.
    let index = 0;
    while (index < rest.length) {
      const c = rest[index]!;
      if (c.type === 'rect' && c.x <= 0 && c.y <= 0 && c.width >= width && c.height >= height)
        index += 1;
      else break;
    }
    const moved: Component = {
      ...self,
      x: 0,
      y: 0,
      width,
      height,
      rotation: 0,
      props: { ...self.props, fit: 'cover' },
    };
    rest.splice(index, 0, moved);
    s.setTheme({ ...s.theme, components: rest });
  },
  deleteSelected: () => {
    const s = get();
    if (!s.selection.length) return;
    const sel = new Set(s.selection);
    s.setTheme({
      ...s.theme,
      components: mapTree(s.theme.components, (c) => (sel.has(c.id) ? null : c)),
    });
    set({ selection: [] });
  },
  duplicateSelected: () => {
    const s = get();
    const items = selectedTopLevel(s.theme, s.selection);
    if (!items.length) return;
    const taken = new Set(allIds(s.theme));
    const clones = items.map((c) => {
      const cl = cloneWithNewIds(c, taken);
      cl.x += 20;
      cl.y += 20;
      return cl;
    });
    s.setTheme({ ...s.theme, components: [...s.theme.components, ...clones] });
    set({ selection: clones.map((c) => c.id) });
  },
  copySelected: () => {
    const s = get();
    set({ clipboard: selectedTopLevel(s.theme, s.selection).map((c) => structuredClone(c)) });
  },
  paste: (at) => {
    const s = get();
    if (!s.clipboard.length) return;
    const taken = new Set(allIds(s.theme));
    const clones = s.clipboard.map((c) => {
      const cl = cloneWithNewIds(c, taken);
      cl.x += 20;
      cl.y += 20;
      return cl;
    });
    placeClones(clones, at);
    s.setTheme({ ...s.theme, components: [...s.theme.components, ...clones] });
    set({ selection: clones.map((c) => c.id), clipboard: clones.map((c) => structuredClone(c)) });
  },
  pasteComponents: (components, incoming, at) => {
    const s = get();
    const assets = { ...s.theme.assets };
    const rename = new Map<string, string>();
    for (const [id, a] of Object.entries(incoming)) {
      if (!assets[id]) assets[id] = a;
      else if (assets[id]!.data !== a.data) {
        let n = 2;
        while (assets[`${id}-${n}`]) n++;
        assets[`${id}-${n}`] = a;
        rename.set(id, `${id}-${n}`);
      }
    }
    const remap = (c: Component): Component => {
      if (c.type === 'image' && rename.has(c.props.asset))
        return { ...c, props: { ...c.props, asset: rename.get(c.props.asset)! } };
      if (c.type === 'group')
        return { ...c, props: { ...c.props, children: c.props.children.map(remap) } };
      return c;
    };
    const taken = new Set(allIds(s.theme));
    const clones = components.map((c) => {
      const cl = cloneWithNewIds(remap(c), taken);
      cl.x += 20;
      cl.y += 20;
      return cl;
    });
    placeClones(clones, at);
    s.setTheme({ ...s.theme, assets, components: [...s.theme.components, ...clones] });
    set({ selection: clones.map((c) => c.id) });
  },
  moveSelected: (dx, dy, record = true) => {
    const s = get();
    const top = new Set(selectedTopLevel(s.theme, s.selection).map((c) => c.id));
    const components = mapTree(s.theme.components, (c) =>
      top.has(c.id) && !c.locked ? ({ ...c, x: c.x + dx, y: c.y + dy } as Component) : c,
    );
    s.setTheme({ ...s.theme, components }, record);
  },
  reorder: (id, direction) => {
    const s = get();
    const reorderIn = (list: Component[]): Component[] => {
      const i = list.findIndex((c) => c.id === id);
      if (i < 0)
        return list.map((c) =>
          c.type === 'group'
            ? { ...c, props: { ...c.props, children: reorderIn(c.props.children) } }
            : c,
        );
      const out = [...list];
      const [item] = out.splice(i, 1);
      const target =
        direction === 'up'
          ? Math.min(out.length, i + 1)
          : direction === 'down'
            ? Math.max(0, i - 1)
            : direction === 'top'
              ? out.length
              : 0;
      out.splice(target, 0, item!);
      return out;
    };
    s.setTheme({ ...s.theme, components: reorderIn(s.theme.components) });
  },
  moveToIndex: (id, index) => {
    const s = get();
    const list = s.theme.components;
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return;
    const out = [...list];
    const [item] = out.splice(i, 1);
    out.splice(Math.max(0, Math.min(out.length, index)), 0, item!);
    s.setTheme({ ...s.theme, components: out });
  },
  groupSelected: () => {
    const s = get();
    const items = selectedTopLevel(s.theme, s.selection);
    // Only top-level components can be grouped in this version.
    const topIds = new Set(s.theme.components.map((c) => c.id));
    const members = items.filter((c) => topIds.has(c.id));
    if (members.length < 2) return;
    const minX = Math.min(...members.map((c) => c.x));
    const minY = Math.min(...members.map((c) => c.y));
    const maxX = Math.max(...members.map((c) => c.x + c.width));
    const maxY = Math.max(...members.map((c) => c.y + c.height));
    const taken = allIds(s.theme);
    const gid = nextComponentId('group', taken);
    const group = createComponent('group', {
      id: gid,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      props: {
        children: members.map((c) => ({ ...c, x: c.x - minX, y: c.y - minY })),
        clip: false,
      },
    });
    const memberIds = new Set(members.map((c) => c.id));
    const firstIndex = s.theme.components.findIndex((c) => memberIds.has(c.id));
    const rest = s.theme.components.filter((c) => !memberIds.has(c.id));
    rest.splice(firstIndex, 0, group);
    s.setTheme({ ...s.theme, components: rest });
    set({ selection: [gid] });
  },
  ungroupSelected: () => {
    const s = get();
    const groups = s.theme.components.filter(
      (c) => s.selection.includes(c.id) && c.type === 'group',
    );
    if (!groups.length) return;
    const out: Component[] = [];
    const newSel: string[] = [];
    for (const c of s.theme.components) {
      if (c.type === 'group' && groups.includes(c)) {
        for (const ch of c.props.children) {
          out.push({ ...ch, x: ch.x + c.x, y: ch.y + c.y } as Component);
          newSel.push(ch.id);
        }
      } else out.push(c);
    }
    s.setTheme({ ...s.theme, components: out });
    set({ selection: newSel });
  },
  align: (mode) => {
    const s = get();
    const items = selectedTopLevel(s.theme, s.selection).filter((c) => !c.locked);
    if (items.length === 0) return;
    const single = items.length === 1;
    const bounds = single
      ? { x: 0, y: 0, w: s.theme.layout.width, h: s.theme.layout.height }
      : {
          x: Math.min(...items.map((c) => c.x)),
          y: Math.min(...items.map((c) => c.y)),
          w: Math.max(...items.map((c) => c.x + c.width)) - Math.min(...items.map((c) => c.x)),
          h: Math.max(...items.map((c) => c.y + c.height)) - Math.min(...items.map((c) => c.y)),
        };
    const ids = new Set(items.map((c) => c.id));
    const components = mapTree(s.theme.components, (c) => {
      if (!ids.has(c.id)) return c;
      switch (mode) {
        case 'left':
          return { ...c, x: bounds.x } as Component;
        case 'center':
          return { ...c, x: Math.round(bounds.x + (bounds.w - c.width) / 2) } as Component;
        case 'right':
          return { ...c, x: bounds.x + bounds.w - c.width } as Component;
        case 'top':
          return { ...c, y: bounds.y } as Component;
        case 'middle':
          return { ...c, y: Math.round(bounds.y + (bounds.h - c.height) / 2) } as Component;
        case 'bottom':
          return { ...c, y: bounds.y + bounds.h - c.height } as Component;
      }
    });
    s.setTheme({ ...s.theme, components });
  },
  distribute: (axis) => {
    const s = get();
    const items = selectedTopLevel(s.theme, s.selection).filter((c) => !c.locked);
    if (items.length < 3) return;
    const sorted = [...items].sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const totalSize = sorted.reduce((a, c) => a + (axis === 'h' ? c.width : c.height), 0);
    const span = axis === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y;
    const gap = (span - totalSize) / (sorted.length - 1);
    const positions = new Map<string, number>();
    let cursor = axis === 'h' ? first.x : first.y;
    for (const c of sorted) {
      positions.set(c.id, Math.round(cursor));
      cursor += (axis === 'h' ? c.width : c.height) + gap;
    }
    const components = mapTree(s.theme.components, (c) =>
      positions.has(c.id)
        ? ({ ...c, [axis === 'h' ? 'x' : 'y']: positions.get(c.id)! } as Component)
        : c,
    );
    s.setTheme({ ...s.theme, components });
  },
}));

export function selectedComponents(state: ProjectState): Component[] {
  return state.selection
    .map((id) => findComponent(state.theme.components, id))
    .filter((c): c is Component => !!c);
}

/**
 * The theme, for panels: live while editing, but at most ten updates a second
 * during a canvas drag, so the drag itself stays smooth.
 */
export function useThemeForPanels(): Theme {
  const [theme, setTheme] = useState(() => useProjectStore.getState().theme);
  useEffect(() => {
    let shown = useProjectStore.getState().theme;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setTheme(shown);
    const flush = () => {
      timer = null;
      const t = useProjectStore.getState().theme;
      if (t !== shown) {
        shown = t;
        setTheme(t);
      }
    };
    const unsubscribe = useProjectStore.subscribe((s) => {
      if (s.theme === shown) return;
      if (!s.txn) {
        if (timer) clearTimeout(timer);
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, 100);
      }
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return theme;
}
