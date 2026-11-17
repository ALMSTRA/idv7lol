import { isTauri } from '../host/files.js';
import { confirmDialog } from '../host/confirm.js';
import { translate } from '../i18n/index.js';
import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { RELEASE, checkForUpdate } from './release.js';

/** A release newer than this one: installable in place, or only a page to download it from. */
export interface FoundUpdate {
  version: string;
  url?: string;
  install?: (onProgress: (pct: number) => void) => Promise<void>;
}

/**
 * Looks for a newer Studio. The desktop app reads the signed update list first; where that
 * is not there to read, the list of releases on GitHub still tells whether one exists.
 */
export async function findUpdate(): Promise<FoundUpdate | null> {
  if (!isTauri) return null;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const found = await check();
    if (!found) return null;
    return {
      version: found.version,
      install: async (onProgress) => {
        let total = 0;
        let got = 0;
        await found.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength ?? 0;
          else if (e.event === 'Progress') {
            got += e.data.chunkLength;
            if (total) onProgress(Math.min(100, Math.round((got * 100) / total)));
          }
        });
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      },
    };
  } catch {
    return checkForUpdate(RELEASE);
  }
}

const say = (key: string, vars?: Record<string, string | number>) =>
  translate(useUiStore.getState().lang, key, vars);

/** Downloads and installs an update, after asking about unsaved work. The app restarts at the end. */
export async function installUpdate(update: FoundUpdate): Promise<void> {
  if (!update.install) return;
  if (useProjectStore.getState().dirty && !(await confirmDialog(say('confirm.discard')))) return;
  const ui = useUiStore.getState();
  const progress = (pct: number) =>
    ui.setBusy(say('update.installing', { version: update.version, pct }));
  progress(0);
  try {
    await update.install(progress);
  } catch (e) {
    ui.showToast(
      say('update.installFailed', { error: e instanceof Error ? e.message : String(e) }),
    );
  } finally {
    ui.setBusy(null);
  }
}

/**
 * At startup, or from the menu (`asked`): tells about a newer release and offers it, or
 * installs it straight away when the user chose that and nothing unsaved is open.
 */
export async function lookForUpdate(asked: boolean): Promise<void> {
  const ui = useUiStore.getState();
  try {
    const found = await findUpdate();
    if (!found) {
      if (asked) ui.showToast(say('update.upToDate', { current: RELEASE }));
      return;
    }
    if (!asked && ui.autoUpdate && found.install && !useProjectStore.getState().dirty)
      await installUpdate(found);
    else ui.setUpdate(found);
  } catch (e) {
    // no network at startup is nobody's news
    if (asked)
      ui.showToast(say('update.failed', { error: e instanceof Error ? e.message : String(e) }));
  }
}
