import { serializeTheme, type Theme } from '@idv7lol/theme-schema';
import { validateTheme } from '@idv7lol/theme-compiler';
import { downloadBlob, isTauri, openExternal, pickFolder } from '../host/files.js';
import { TEMPLATES } from './templates.js';

/**
 * Sharing a theme with the project: save the theme file and a picture of it,
 * then open the theme submission form on GitHub where both get attached.
 * Nothing is uploaded from here; the person attaches the files themselves.
 */

const REPO = 'https://github.com/ALMSTRA/idv7lol';

export type ShareBlock =
  { reason: 'errors'; count: number } | { reason: 'author' } | { reason: 'id'; id: string };

/** What stops a theme from being shared, or null when it is ready. */
export function shareBlock(theme: Theme): ShareBlock | null {
  const report = validateTheme(theme);
  if (!report.ok) return { reason: 'errors', count: report.errors.length };
  if (!theme.author.trim()) return { reason: 'author' };
  // A theme started from a template keeps its id; shared as is, it would replace the template.
  if (TEMPLATES.some((t) => t.theme.id === theme.id)) return { reason: 'id', id: theme.id };
  return null;
}

/** The new-issue link with the theme submission form and a title filled in. */
export function submissionUrl(theme: Theme): string {
  const q = new URLSearchParams({
    template: 'theme_submission.yml',
    title: `Theme: ${theme.name}`,
  });
  return `${REPO}/issues/new?${q.toString()}`;
}

/** The theme as it is shared: the Studio's own file, stamped like a save. */
export function shareText(theme: Theme, now = new Date()): string {
  return serializeTheme({
    ...theme,
    meta: { ...theme.meta, createdWith: 'idv7lol Studio', modified: now.toISOString() },
  });
}

/**
 * Save `<id>.idv7theme.json` and `<id>.png` (in a folder the person picks, or as
 * downloads in a browser) and open the form. Returns the file names, or null
 * when the folder dialog was cancelled.
 */
export async function shareTheme(
  theme: Theme,
  png: Blob,
  pickTitle: string,
): Promise<string[] | null> {
  // GitHub attachments take .json but not .idv7theme; the Studio opens both.
  const names = [`${theme.id}.idv7theme.json`, `${theme.id}.png`];
  const text = shareText(theme);
  if (isTauri) {
    const folder = await pickFolder(pickTitle);
    if (!folder) return null;
    const { writeFile, writeTextFile } = await import('@tauri-apps/plugin-fs');
    const sep = folder.includes('\\') ? '\\' : '/';
    const base = folder.replace(/[\\/]+$/, '');
    await writeTextFile(`${base}${sep}${names[0]}`, text);
    await writeFile(`${base}${sep}${names[1]}`, new Uint8Array(await png.arrayBuffer()));
  } else {
    downloadBlob(new Blob([text], { type: 'application/json' }), names[0]!);
    downloadBlob(png, names[1]!);
  }
  await openExternal(submissionUrl(theme));
  return names;
}
