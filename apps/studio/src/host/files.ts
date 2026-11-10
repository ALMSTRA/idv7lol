/**
 * File access for the Studio. Inside Tauri we use the dialog and fs
 * plugins; in a plain browser (development, demos) we fall back to file
 * inputs and downloads so the editor stays usable.
 */
import type { BundleFile } from '@idv7lol/theme-compiler';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface OpenedFile {
  path: string | null;
  name: string;
  text: string;
}

const THEME_FILTERS = [
  { name: 'idv7lol theme', extensions: ['idv7theme', 'json'] },
  { name: 'All files', extensions: ['*'] },
];

export async function openThemeFile(): Promise<OpenedFile | null> {
  if (isTauri) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: THEME_FILTERS,
      title: 'Open theme',
    });
    if (!selected || Array.isArray(selected)) return null;
    const text = await readTextFile(selected);
    return { path: selected, name: baseName(selected), text };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.idv7theme,.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ path: null, name: f.name, text: await f.text() });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function readTextAt(path: string): Promise<string> {
  if (!isTauri) throw new Error('readTextAt needs the desktop app');
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  return readTextFile(path);
}

/** Save text to `path`, or ask for a location when `path` is null. Returns the path used. */
export async function saveThemeFile(
  text: string,
  path: string | null,
  suggestedName: string,
): Promise<string | null> {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    let target = path;
    if (!target) {
      target = await save({
        filters: THEME_FILTERS,
        defaultPath: `${suggestedName}.idv7theme`,
        title: 'Save theme',
      });
      if (!target) return null;
    }
    await writeTextFile(target, text);
    return target;
  }
  downloadBlob(new Blob([text], { type: 'application/json' }), `${suggestedName}.idv7theme`);
  return null;
}

export async function pickFolder(title: string): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}

/** Write a compiled bundle under `folder/<themeId>/`. In the browser, files download one by one. */
export async function writeBundleFiles(
  folder: string | null,
  themeId: string,
  files: BundleFile[],
): Promise<string> {
  if (isTauri && folder) {
    const { mkdir, writeFile, writeTextFile, exists } = await import('@tauri-apps/plugin-fs');
    const sep = folder.includes('\\') ? '\\' : '/';
    const base = `${folder}${sep}${themeId}`;
    for (const f of files) {
      const parts = f.path.split('/');
      const dir = [base, ...parts.slice(0, -1)].join(sep);
      if (!(await exists(dir))) await mkdir(dir, { recursive: true });
      const full = `${dir}${sep}${parts[parts.length - 1]}`;
      if (typeof f.data === 'string') await writeTextFile(full, f.data);
      else await writeFile(full, f.data);
    }
    return base;
  }
  for (const f of files) {
    const data: BlobPart =
      typeof f.data === 'string' ? f.data : (f.data as Uint8Array<ArrayBuffer>);
    downloadBlob(new Blob([data]), `${themeId}-${f.path.replace(/\//g, '_')}`);
  }
  return themeId;
}

/**
 * Save a theme package for the car. On the desktop you pick the USB stick and
 * the file goes to idv7lol/themes/ on it, where the car app looks; in a
 * browser it downloads and you copy it there yourself. Returns where it went,
 * or null when cancelled.
 */
export async function saveThemePackage(
  data: Uint8Array,
  fileName: string,
  title: string,
): Promise<string | null> {
  if (isTauri) {
    const folder = await pickFolder(title);
    if (!folder) return null;
    const { mkdir, writeFile, exists } = await import('@tauri-apps/plugin-fs');
    const sep = folder.includes('\\') ? '\\' : '/';
    const dir = [folder.replace(/[\\/]+$/, ''), 'idv7lol', 'themes'].join(sep);
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });
    const full = `${dir}${sep}${fileName}`;
    await writeFile(full, data);
    return full;
  }
  downloadBlob(new Blob([data as Uint8Array<ArrayBuffer>]), fileName);
  return fileName;
}

export async function savePng(blob: Blob, suggestedName: string): Promise<boolean> {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const target = await save({
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      defaultPath: `${suggestedName}.png`,
    });
    if (!target) return false;
    await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  downloadBlob(blob, `${suggestedName}.png`);
  return true;
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/** Fetch a static asset bundled with the Studio (e.g. a baked font atlas). */
export async function fetchStatic(path: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return i >= 0 ? path.slice(i + 1) : path;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ----- recent files (desktop only; browser has no paths) ----- */

const RECENT_KEY = 'idv7lol.studio.recent';

export function recentFiles(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberRecent(path: string): void {
  const list = [path, ...recentFiles().filter((p) => p !== path)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}
