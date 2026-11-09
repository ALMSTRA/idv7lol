import { useState } from 'react';
import { LIBRARY, LIBRARY_GROUPS } from '../lib/componentLibrary.js';
import { useProjectStore } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { ImagesPanel } from './ImagesPanel.js';

export function LibraryPanel(): JSX.Element {
  const t = useT();
  const [q, setQ] = useState('');
  const add = useProjectStore((s) => s.addComponent);
  const query = q.trim().toLowerCase();
  return (
    <>
      <div className="library-search">
        <input
          type="search"
          placeholder={t('library.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="panel-body">
        <ImagesPanel />
        {LIBRARY_GROUPS.map((g) => {
          const items = LIBRARY.filter((e) => e.group === g).filter(
            (e) =>
              !query ||
              t(`presets.${e.nameKey}`).toLowerCase().includes(query) ||
              e.type.includes(query),
          );
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="library-group">{t(`library.groups.${g}`)}</div>
              {items.map((e) => (
                <div
                  key={e.id}
                  className="library-item"
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData('application/x-idv7lol-library', e.id);
                    ev.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => add(e.type, undefined, e.overrides)}
                  title={t('library.hint')}
                >
                  <span className="glyph">{e.glyph}</span>
                  <span className="label">
                    {t(`presets.${e.nameKey}`)}
                    {e.descKey && <small>{t(`presets.${e.descKey}`)}</small>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
