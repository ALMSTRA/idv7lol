/**
 * Yes/no questions. Inside Tauri the dialog plugin replaces `window.confirm`
 * with a function that returns a promise, so `if (!window.confirm(...))` never
 * stops anything there. Everything that asks goes through here and waits.
 */
import { isTauri } from './files.js';

export async function confirmDialog(message: string): Promise<boolean> {
  if (isTauri) {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    return confirm(message, { title: 'idv7lol Studio', kind: 'warning' });
  }
  // `=== true` so that anything but the browser's own "yes" counts as a no.
  return (window.confirm(message) as unknown) === true;
}
