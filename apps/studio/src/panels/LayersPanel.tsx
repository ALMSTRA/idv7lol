import { TypeIcon } from '../ui/componentIcons.js';
import { Eye, EyeOff, Group, Lock, LockOpen, Ungroup } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Component } from '@idv7lol/theme-schema';
import { findComponent, RENDERER_LIMITS } from '@idv7lol/theme-engine';
import { buildPieces } from '@idv7lol/theme-compiler';
import { useProjectStore, useThemeForPanels } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { openLayerMenu } from '../lib/contextMenus.js';

export function LayersPanel(): JSX.Element {
  const t = useT();
  const theme = useThemeForPanels();
  const selection = useProjectStore((s) => s.selection);
  const select = useProjectStore((s) => s.select);
  const update = useProjectStore((s) => s.updateComponent);
  const reorder = useProjectStore((s) => s.reorder);
  const moveToIndex = useProjectStore((s) => s.moveToIndex);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const cost = useMemo(() => {
    const m = new Map<string, number>();
    try {
      const b = buildPieces(theme);
      for (const p of b.pieces) m.set(p.componentId, (m.get(p.componentId) ?? 0) + 1);
      for (const p of b.images) m.set(p.componentId, (m.get(p.componentId) ?? 0) + 1);
    } catch {
      /* invalid theme */
    }
    return m;
  }, [theme]);
  const total = [...cost.values()].reduce((a, b) => a + b, 0);

  const rows: Array<{ c: Component; depth: number; parentId: string | null }> = [];
  const walk = (list: Component[], depth: number, parentId: string | null) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i]!;
      rows.push({ c, depth, parentId });
      if (c.type === 'group') walk(c.props.children, depth + 1, c.id);
    }
  };
  walk(theme.components, 0, null);

  const groupCost = (c: Component): number =>
    c.type === 'group'
      ? c.props.children.reduce((a, ch) => a + groupCost(ch), 0)
      : (cost.get(c.id) ?? 0);

  return (
    <>
      <div className="panel-header" style={{ fontWeight: 400 }}>
        <span
          className={`badge ${total > RENDERER_LIMITS.layersPerApp ? 'error' : total > RENDERER_LIMITS.layersRecommended ? 'warning' : 'ok'}`}
        >
          {t('layers.total', { n: total, max: RENDERER_LIMITS.layersPerApp })}
        </span>
        <span className="grow" />
        <button
          className="icon ghost"
          title={t('layers.group')}
          disabled={selection.length < 2}
          onClick={() => useProjectStore.getState().groupSelected()}
        >
          <Group size={14} />
        </button>
        <button
          className="icon ghost"
          title={t('layers.ungroup')}
          disabled={!selection.some((id) => findComponent(theme.components, id)?.type === 'group')}
          onClick={() => useProjectStore.getState().ungroupSelected()}
        >
          <Ungroup size={14} />
        </button>
      </div>
      <div className="panel-body">
        {rows.length === 0 && <div className="empty">{t('layers.empty')}</div>}
        {rows.map(({ c, depth, parentId }) => {
          const selected = selection.includes(c.id);
          const n = groupCost(c);
          return (
            <div
              key={c.id}
              className={`layer-row ${selected ? 'selected' : ''} ${c.visible ? '' : 'hidden'}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              draggable={parentId === null}
              onDragStart={() => setDragId(c.id)}
              onDragOver={(e) => {
                if (dragId && parentId === null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragId || dragId === c.id || parentId !== null) return;
                const idx = theme.components.findIndex((x) => x.id === c.id);
                moveToIndex(dragId, idx);
                setDragId(null);
              }}
              onClick={(e) => select([c.id], e.shiftKey || e.ctrlKey)}
              onDoubleClick={() => setEditing(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openLayerMenu(e.clientX, e.clientY, c.id);
              }}
            >
              <span className="type" title={c.type}>
                <TypeIcon type={c.type} size={14} />
              </span>
              <span className="name">
                {editing === c.id ? (
                  <input
                    autoFocus
                    type="text"
                    defaultValue={c.name ?? c.id}
                    onBlur={(e) => {
                      update(c.id, { name: e.target.value } as Partial<Component>);
                      setEditing(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  (c.name ?? c.id)
                )}
              </span>
              <span className={`cost ${n >= 6 ? 'hot' : ''}`} title={t('layers.cost')}>
                {n}
              </span>
              <button
                className="icon"
                title={t('inspector.visible')}
                onClick={(e) => (
                  e.stopPropagation(),
                  update(c.id, { visible: !c.visible } as Partial<Component>)
                )}
              >
                {c.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                className="icon"
                title={t('inspector.locked')}
                onClick={(e) => (
                  e.stopPropagation(),
                  update(c.id, { locked: !c.locked } as Partial<Component>)
                )}
              >
                {c.locked ? <Lock size={13} /> : <LockOpen size={13} />}
              </button>
              {parentId === null && (
                <>
                  <button
                    className="icon"
                    title={t('layers.up')}
                    onClick={(e) => (e.stopPropagation(), reorder(c.id, 'up'))}
                  >
                    ▲
                  </button>
                  <button
                    className="icon"
                    title={t('layers.down')}
                    onClick={(e) => (e.stopPropagation(), reorder(c.id, 'down'))}
                  >
                    ▼
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
