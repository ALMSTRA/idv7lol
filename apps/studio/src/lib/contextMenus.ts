import { findComponent, flattenComponents } from '@idv7lol/theme-engine';
import type { Component } from '@idv7lol/theme-schema';
import { allIds, useProjectStore } from '../store/project.js';
import { useUiStore, type MenuItem } from '../store/ui.js';
import { translate } from '../i18n/index.js';
import { LIBRARY, LIBRARY_GROUPS } from './componentLibrary.js';
import { browseAndPlace, replaceImage } from './imageActions.js';
import { copyImageToSystem, copySelection, cutSelection, pasteFromMenu } from './clipboard.js';

type Point = { x: number; y: number };
const SEP: MenuItem = { separator: true };

const tr = (key: string, vars?: Record<string, string | number>) =>
  translate(useUiStore.getState().lang, key, vars);

function reorderSelected(dir: 'up' | 'down' | 'top' | 'bottom'): void {
  const p = useProjectStore.getState();
  const order = p.theme.components.map((c) => c.id).filter((id) => p.selection.includes(id));
  // Moving towards the top starts from the frontmost, so the group keeps its order.
  const list = dir === 'up' || dir === 'top' ? order : [...order].reverse();
  const sequence =
    dir === 'top' ? [...list].reverse() : dir === 'bottom' ? [...list].reverse() : list;
  sequence.forEach((id) => useProjectStore.getState().reorder(id, dir));
}

function setOnSelection(patch: Partial<Component>): void {
  const p = useProjectStore.getState();
  p.selection.forEach((id) => useProjectStore.getState().updateComponent(id, patch));
}

function arrangeItems(): MenuItem {
  return {
    label: tr('ctx.arrange'),
    items: [
      { label: tr('ctx.front'), shortcut: 'Ctrl+Shift+]', onSelect: () => reorderSelected('top') },
      { label: tr('layers.up'), shortcut: 'Ctrl+]', onSelect: () => reorderSelected('up') },
      { label: tr('layers.down'), shortcut: 'Ctrl+[', onSelect: () => reorderSelected('down') },
      {
        label: tr('ctx.back'),
        shortcut: 'Ctrl+Shift+[',
        onSelect: () => reorderSelected('bottom'),
      },
    ],
  };
}

function alignItems(count: number): MenuItem {
  const a = (mode: Parameters<ReturnType<typeof useProjectStore.getState>['align']>[0]) => () =>
    useProjectStore.getState().align(mode);
  return {
    label: tr('ctx.align'),
    items: [
      { label: tr('canvas.alignLeft'), onSelect: a('left') },
      { label: tr('canvas.alignCenter'), onSelect: a('center') },
      { label: tr('canvas.alignRight'), onSelect: a('right') },
      SEP,
      { label: tr('canvas.alignTop'), onSelect: a('top') },
      { label: tr('canvas.alignMiddle'), onSelect: a('middle') },
      { label: tr('canvas.alignBottom'), onSelect: a('bottom') },
      SEP,
      {
        label: tr('canvas.distributeH'),
        disabled: count < 3,
        onSelect: () => useProjectStore.getState().distribute('h'),
      },
      {
        label: tr('canvas.distributeV'),
        disabled: count < 3,
        onSelect: () => useProjectStore.getState().distribute('v'),
      },
    ],
  };
}

function selectionItems(at?: Point): MenuItem[] {
  const p = useProjectStore.getState();
  const comps = p.selection
    .map((id) => findComponent(p.theme.components, id))
    .filter((c): c is Component => !!c);
  const first = comps[0];
  const image = comps.length === 1 && first?.type === 'image' ? first : null;
  const allLocked = comps.every((c) => c.locked);
  const allHidden = comps.every((c) => !c.visible);
  const topGroup = comps.some((c) => c.type === 'group');
  const items: MenuItem[] = [];
  if (image) {
    items.push(
      {
        label: tr('image.edit'),
        onSelect: () => useUiStore.getState().setImageEditorFor(image.id),
      },
      { label: tr('ctx.copyImage'), onSelect: () => void copyImageToSystem(image.id) },
      { label: tr('image.replace'), onSelect: () => void replaceImage(image.id) },
      {
        label: tr('image.background'),
        onSelect: () => useProjectStore.getState().makeBackground(image.id),
      },
      SEP,
    );
  }
  items.push(
    { label: tr('ctx.cut'), shortcut: 'Ctrl+X', onSelect: cutSelection },
    { label: tr('ctx.copy'), shortcut: 'Ctrl+C', onSelect: copySelection },
    { label: tr('ctx.paste'), shortcut: 'Ctrl+V', onSelect: () => void pasteFromMenu(at) },
    {
      label: tr('layers.duplicate'),
      shortcut: 'Ctrl+D',
      onSelect: () => useProjectStore.getState().duplicateSelected(),
    },
    SEP,
    arrangeItems(),
    alignItems(comps.length),
    {
      label: tr('layers.group'),
      shortcut: 'Ctrl+G',
      disabled: comps.length < 2,
      onSelect: () => useProjectStore.getState().groupSelected(),
    },
    {
      label: tr('layers.ungroup'),
      shortcut: 'Ctrl+Shift+G',
      disabled: !topGroup,
      onSelect: () => useProjectStore.getState().ungroupSelected(),
    },
    SEP,
    {
      label: allLocked ? tr('ctx.unlock') : tr('ctx.lock'),
      shortcut: 'Ctrl+L',
      onSelect: () => setOnSelection({ locked: !allLocked }),
    },
    {
      label: allHidden ? tr('ctx.show') : tr('ctx.hide'),
      shortcut: 'Ctrl+Shift+H',
      onSelect: () => setOnSelection({ visible: allHidden }),
    },
    SEP,
    {
      label: tr('layers.delete'),
      shortcut: 'Supr',
      danger: true,
      onSelect: () => useProjectStore.getState().deleteSelected(),
    },
  );
  return items;
}

function emptyItems(at: Point): MenuItem[] {
  const ui = useUiStore.getState();
  const place = (id: string) => {
    const entry = LIBRARY.find((e) => e.id === id);
    if (entry) useProjectStore.getState().addComponent(entry.type, at, entry.overrides);
  };
  return [
    { label: tr('ctx.paste'), shortcut: 'Ctrl+V', onSelect: () => void pasteFromMenu(at) },
    { label: tr('image.add'), onSelect: () => void browseAndPlace() },
    {
      label: tr('ctx.addComponent'),
      items: LIBRARY_GROUPS.map((g) => ({
        label: tr(`library.groups.${g}`),
        items: LIBRARY.filter((e) => e.group === g).map((e) => ({
          label: tr(`presets.${e.nameKey}`),
          onSelect: () => place(e.id),
        })),
      })),
    },
    SEP,
    {
      label: tr('ctx.selectAll'),
      shortcut: 'Ctrl+A',
      onSelect: () =>
        useProjectStore
          .getState()
          .select(useProjectStore.getState().theme.components.map((c) => c.id)),
    },
    {
      label: tr('canvas.fit'),
      shortcut: 'Ctrl+0',
      onSelect: () => (window as unknown as { __idv7fit?: () => void }).__idv7fit?.(),
    },
    SEP,
    {
      label: tr('canvas.zones'),
      checked: ui.showZones,
      onSelect: () => useUiStore.getState().toggle('showZones'),
    },
    {
      label: tr('canvas.grid'),
      checked: ui.showGrid,
      onSelect: () => useUiStore.getState().toggle('showGrid'),
    },
    {
      label: tr('canvas.snap'),
      checked: ui.snap,
      onSelect: () => useUiStore.getState().toggle('snap'),
    },
    {
      label: tr('canvas.rulers'),
      checked: ui.showRulers,
      onSelect: () => useUiStore.getState().toggle('showRulers'),
    },
  ];
}

/** Right click on the layout: `hitId` is the component under the pointer, if any. */
export function openCanvasMenu(x: number, y: number, at: Point, hitId: string | undefined): void {
  const p = useProjectStore.getState();
  if (hitId) {
    if (!p.selection.includes(hitId)) p.select([hitId]);
    useUiStore.getState().openMenu(x, y, selectionItems(at));
  } else {
    p.select([]);
    useUiStore.getState().openMenu(x, y, emptyItems(at));
  }
}

export function openLayerMenu(x: number, y: number, id: string): void {
  const p = useProjectStore.getState();
  if (!p.selection.includes(id)) p.select([id]);
  useUiStore.getState().openMenu(x, y, selectionItems());
}

export function openAssetMenu(x: number, y: number, assetId: string): void {
  const p = useProjectStore.getState();
  const uses = flattenComponents(p.theme.components).filter(
    (f) => f.component.type === 'image' && f.component.props.asset === assetId,
  ).length;
  useUiStore.getState().openMenu(x, y, [
    {
      label: tr('ctx.addToLayout'),
      onSelect: () => useProjectStore.getState().placeAsset(assetId),
    },
    SEP,
    {
      label: tr('misc.remove'),
      danger: true,
      onSelect: () => {
        if (uses === 0 || window.confirm(tr('image.confirmDelete', { n: uses })))
          useProjectStore.getState().removeAsset(assetId);
      },
    },
  ]);
}

export { allIds };
