import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { translate } from '../i18n/index.js';
import { ensureSource, importFiles, pickImageFiles } from './imageStore.js';

/**
 * Imports run one after another: each picks asset names from the theme as it is
 * when it starts, so two quick pastes must not both take the same name.
 */
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => undefined);
  return run;
}

/** Import image files and place each on the layout, at `at` when given. */
export function importAndPlace(files: File[], at?: { x: number; y: number }): Promise<void> {
  if (!files.length) return Promise.resolve();
  return inTurn(() => importNow(files, at));
}

async function importNow(files: File[], at?: { x: number; y: number }): Promise<void> {
  const ui = useUiStore.getState();
  const progress = (name: string, f: number) =>
    ui.setBusy(translate(ui.lang, 'image.processing', { name, pct: Math.round(f * 100) }));
  const { images, failed, trimmed } = await importFiles(
    files,
    useProjectStore.getState().theme.assets,
    progress,
  ).finally(() => ui.setBusy(null));
  await Promise.all(images.map((i) => ensureSource(i.id, i.data, i.animation)));
  if (trimmed.length)
    ui.showToast(translate(ui.lang, 'image.trimmed', { names: trimmed.join(', ') }));
  if (images.length) {
    useProjectStore.getState().importImages(images, at);
    ui.setRightTab('inspector');
    ui.logMessage('info', translate(ui.lang, 'image.imported', { n: images.length }));
    if (!trimmed.length) ui.showToast(translate(ui.lang, 'image.imported', { n: images.length }));
  }
  if (failed.length) {
    const message = translate(ui.lang, 'image.failed', { names: failed.join(', ') });
    ui.logMessage('error', message);
    window.alert(message);
  }
}

export async function browseAndPlace(): Promise<void> {
  await importAndPlace(await pickImageFiles(true));
}

/** Swap a component's picture for another file, starting from clean edits. */
export async function replaceImage(componentId: string): Promise<void> {
  const files = await pickImageFiles(false);
  if (!files.length) return;
  return inTurn(() => replaceNow(componentId, files));
}

async function replaceNow(componentId: string, files: File[]): Promise<void> {
  const ui = useUiStore.getState();
  const { images, failed } = await importFiles(files, useProjectStore.getState().theme.assets);
  const img = images[0];
  if (!img) {
    window.alert(translate(ui.lang, 'image.failed', { names: failed.join(', ') }));
    return;
  }
  await ensureSource(img.id, img.data, img.animation);
  useProjectStore.getState().replaceImageAsset(componentId, img);
}
