import { useMemo, useState, useSyncExternalStore } from 'react';
import { flattenComponents } from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { browseAndPlace, importAndPlace } from '../lib/imageActions.js';
import { getThumb, imageFilesOf, imagesVersion, subscribeImages } from '../lib/imageStore.js';
import { openAssetMenu } from '../lib/contextMenus.js';

/** The theme's pictures: add from the computer, drag onto the layout, reuse. */
export function ImagesPanel(): JSX.Element {
  const t = useT();
  const theme = useProjectStore((s) => s.theme);
  const place = useProjectStore((s) => s.placeAsset);
  const remove = useProjectStore((s) => s.removeAsset);
  const [over, setOver] = useState(false);
  useSyncExternalStore(subscribeImages, imagesVersion);

  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flattenComponents(theme.components)) {
      if (f.component.type === 'image')
        m.set(f.component.props.asset, (m.get(f.component.props.asset) ?? 0) + 1);
    }
    return m;
  }, [theme.components]);

  const entries = Object.entries(theme.assets).filter(([, a]) => a.data);

  return (
    <div className="img-panel">
      <button
        className={`img-drop ${over ? 'over' : ''}`}
        onClick={() => void browseAndPlace()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          void importAndPlace(imageFilesOf(e.dataTransfer.files));
        }}
      >
        <strong>{t('image.add')}</strong>
        <small>{t('image.addHint')}</small>
      </button>
      {entries.length > 0 && (
        <div className="img-grid">
          {entries.map(([id, a]) => (
            <div
              key={id}
              className="img-tile"
              draggable
              title={t('image.tileHint')}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-idv7lol-asset', id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => place(id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openAssetMenu(e.clientX, e.clientY, id);
              }}
            >
              <img src={getThumb(id) ?? a.data} alt={a.name ?? id} draggable={false} />
              <button
                className="img-del"
                aria-label={t('misc.remove')}
                onClick={(e) => {
                  e.stopPropagation();
                  const n = uses.get(id) ?? 0;
                  if (n === 0 || window.confirm(t('image.confirmDelete', { n }))) remove(id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
