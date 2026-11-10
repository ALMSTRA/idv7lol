import { EntryIcon } from '../ui/componentIcons.js';
import { useState } from 'react';
import { LIBRARY, LIBRARY_GROUPS } from '../lib/componentLibrary.js';
import { useProjectStore } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { ImagesPanel } from './ImagesPanel.js';
import { usePiecesStore } from '../lib/savedPieces.js';
import { TypeIcon } from '../ui/componentIcons.js';
import { Pencil, X } from 'lucide-react';

function MyPieces({ query }: { query: string }): JSX.Element | null {
  const t = useT();
  const pieces = usePiecesStore((s) => s.pieces);
  const [renaming, setRenaming] = useState<string | null>(null);
  const shown = pieces.filter((p) => !query || p.name.toLowerCase().includes(query));
  if (query && !shown.length) return null;
  return (
    <div>
      <div className="library-group">{t('library.myPieces')}</div>
      {!pieces.length && <div className="hint library-empty">{t('library.piecesEmpty')}</div>}
      {shown.map((p) => (
        <div
          key={p.id}
          className="library-item"
          draggable={renaming !== p.id}
          onDragStart={(ev) => {
            ev.dataTransfer.setData('application/x-idv7lol-piece', p.id);
            ev.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => renaming !== p.id && usePiecesStore.getState().insert(p.id)}
          title={t('library.pieceHint')}
        >
          <span className="glyph">
            <TypeIcon type={p.components.length > 1 ? 'group' : p.components[0]!.type} />
          </span>
          {renaming === p.id ? (
            <input
              className="library-rename"
              autoFocus
              defaultValue={p.name}
              maxLength={48}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                usePiecesStore.getState().rename(p.id, e.target.value);
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <span className="label">{p.name}</span>
          )}
          <button
            className="icon library-remove"
            title={t('library.renamePiece')}
            onClick={(e) => {
              e.stopPropagation();
              setRenaming(p.id);
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            className="icon library-remove"
            title={t('library.removePiece')}
            onClick={(e) => {
              e.stopPropagation();
              usePiecesStore.getState().remove(p.id);
            }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

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
        <MyPieces query={query} />
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
                  <span className="glyph">
                    <EntryIcon entry={e} />
                  </span>
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
