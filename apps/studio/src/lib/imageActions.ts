import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { translate } from '../i18n/index.js';
import { ensureSource, importFiles, pickImageFiles } from './imageStore.js';

/** Import image files and place each on the layout, at `at` when given. */
export async function importAndPlace(files: File[], at?: { x: number; y: number }): Promise<void> {
  if (!files.length) return;
  const ui = useUiStore.getState();
  const { images, failed } = await importFiles(files, useProjectStore.getState().theme.assets);
  await Promise.all(images.map((i) => ensureSource(i.id, i.data)));
  if (images.length) {
    useProjectStore.getState().importImages(images, at);
    ui.setRightTab('inspector');
    ui.logMessage('info', translate(ui.lang, 'image.imported', { n: images.length }));
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
  const ui = useUiStore.getState();
  const { images, failed } = await importFiles(files, useProjectStore.getState().theme.assets);
  const img = images[0];
  if (!img) {
    window.alert(translate(ui.lang, 'image.failed', { names: failed.join(', ') }));
    return;
  }
  await ensureSource(img.id, img.data);
  useProjectStore.getState().replaceImageAsset(componentId, img);
}
