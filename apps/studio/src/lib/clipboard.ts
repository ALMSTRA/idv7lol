import { applyImageEdits, findComponent, frameRaster, resolveColor } from '@idv7lol/theme-engine';
import type { Asset, Component } from '@idv7lol/theme-schema';
import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { importAndPlace } from './imageActions.js';
import { getSource, imageFilesOf, rasterToCanvas } from './imageStore.js';

/**
 * Copy and paste through the system clipboard. Components travel as JSON, so
 * they can move between Studio windows; pictures and text from other apps
 * become images and text components.
 */
const FORMAT = 'idv7lol/components@1';
type Point = { x: number; y: number };

interface Payload {
  format: typeof FORMAT;
  components: Component[];
  assets: Record<string, Asset>;
}

function payload(): Payload | null {
  const { theme, clipboard } = useProjectStore.getState();
  if (!clipboard.length) return null;
  const used = new Set<string>();
  const walk = (list: Component[]) =>
    list.forEach((c) => {
      if (c.type === 'image') used.add(c.props.asset);
      if (c.type === 'group') walk(c.props.children);
    });
  walk(clipboard);
  const assets = Object.fromEntries(
    [...used].filter((id) => theme.assets[id]).map((id) => [id, theme.assets[id]!]),
  );
  return { format: FORMAT, components: clipboard, assets };
}

async function writeSystem(): Promise<void> {
  const p = payload();
  if (p) await navigator.clipboard?.writeText(JSON.stringify(p)).catch(() => undefined);
}

export function copySelection(): void {
  useProjectStore.getState().copySelected();
  void writeSystem();
}

export function cutSelection(): void {
  useProjectStore.getState().copySelected();
  void writeSystem();
  useProjectStore.getState().deleteSelected();
}

function parsePayload(text: string): Payload | null {
  if (!text.includes(FORMAT)) return null;
  try {
    const p = JSON.parse(text) as Payload;
    return p.format === FORMAT && Array.isArray(p.components) ? p : null;
  } catch {
    return null;
  }
}

function pasteText(text: string, at?: Point): void {
  const value = text.trim().slice(0, 200);
  if (!value) return;
  useProjectStore.getState().addComponent('text', at, {
    width: Math.min(800, 40 + value.length * 14),
    height: 48,
    name: value.slice(0, 40),
    props: { text: value },
  });
}

function pasteResolved(files: File[], text: string, at?: Point): void {
  const store = useProjectStore.getState();
  if (files.length) {
    void importAndPlace(files, at);
    return;
  }
  const p = text ? parsePayload(text) : null;
  if (p) store.pasteComponents(p.components, p.assets, at);
  else if (text.trim()) pasteText(text, at);
  else store.paste(at);
}

/** Handle a browser paste event (Ctrl+V). */
export function pasteFromEvent(e: ClipboardEvent): void {
  const files = imageFilesOf(e.clipboardData?.items);
  const text = e.clipboardData?.getData('text/plain') ?? '';
  e.preventDefault();
  pasteResolved(files, text);
}

/** Paste from a menu: asks the system clipboard, falling back to the Studio's own. */
export async function pasteFromMenu(at?: Point): Promise<void> {
  const files: File[] = [];
  let text = '';
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((x) => x.startsWith('image/'));
      if (type) {
        const blob = await item.getType(type);
        files.push(new File([blob], `pasted.${type.split('/')[1] ?? 'png'}`, { type }));
      } else if (item.types.includes('text/plain')) {
        text = await (await item.getType('text/plain')).text();
      }
    }
  } catch {
    useProjectStore.getState().paste(at);
    return;
  }
  pasteResolved(files, text, at);
}

/** Put a picture, with its edits, on the system clipboard for other apps. */
export async function copyImageToSystem(componentId: string): Promise<void> {
  const { theme } = useProjectStore.getState();
  const c = findComponent(theme.components, componentId);
  const src = c?.type === 'image' ? getSource(c.props.asset) : undefined;
  if (c?.type !== 'image' || !src) return;
  const palette = theme.palettes[theme.palette.default];
  const anim = theme.assets[c.props.asset]?.animation;
  const out = applyImageEdits(anim ? frameRaster(src, anim, 0) : src, c.props.edits, (x) =>
    palette ? resolveColor(x, palette) : x,
  );
  const blob = await new Promise<Blob | null>((r) => rasterToCanvas(out).toBlob(r, 'image/png'));
  if (!blob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (e) {
    useUiStore.getState().logMessage('error', `Clipboard: ${(e as Error).message}`);
  }
}
