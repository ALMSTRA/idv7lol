import { Download } from 'lucide-react';
import { useUiStore } from '../store/ui.js';
import { useT } from '../i18n/index.js';
import { openExternal } from '../host/files.js';
import { RELEASE } from '../lib/release.js';
import { installUpdate } from '../lib/updater.js';

/** A newer release was found: asks whether to update now. */
export function UpdateBanner(): JSX.Element | null {
  const t = useT();
  const update = useUiStore((s) => s.update);
  const setUpdate = useUiStore((s) => s.setUpdate);
  if (!update) return null;
  return (
    <div className="update-banner" role="status">
      <span>{t('update.available', { version: update.version, current: RELEASE })}</span>
      {update.install ? (
        <button
          className="primary"
          onClick={() => {
            setUpdate(null);
            void installUpdate(update);
          }}
        >
          <Download size={14} />
          {t('update.install')}
        </button>
      ) : (
        <button className="primary" onClick={() => update.url && void openExternal(update.url)}>
          <Download size={14} />
          {t('update.download')}
        </button>
      )}
      <button className="ghost" onClick={() => setUpdate(null)}>
        {t('update.later')}
      </button>
    </div>
  );
}
