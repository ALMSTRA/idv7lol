import { useState } from 'react';
import { REQUIRED_PALETTE_TOKENS, type DriveMode, type Palette } from '@idv7lol/theme-schema';
import { contrastRatio, parseColor, toHex } from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { useT } from '../i18n/index.js';

const MODES: DriveMode[] = ['ECO_PRO', 'COMFORT', 'SPORT', 'SPORT_PLUS', 'ADAPTIVE', 'TRACK'];

export function PalettePanel(): JSX.Element {
  const t = useT();
  const theme = useProjectStore((s) => s.theme);
  const patch = useProjectStore((s) => s.patchTheme);
  const setPreview = useUiStore((s) => s.setPreviewPalette);
  const ids = Object.keys(theme.palettes);
  const [active, setActive] = useState(ids[0] ?? '');
  const pal = theme.palettes[active] ?? theme.palettes[ids[0] ?? ''];
  const [newToken, setNewToken] = useState('');
  if (!pal) return <div className="empty">—</div>;

  const setPalette = (id: string, p: Palette) =>
    patch({ palettes: { ...theme.palettes, [id]: p } });
  const addPalette = () => {
    let i = ids.length + 1;
    while (theme.palettes[`palette-${i}`]) i++;
    const id = `palette-${i}`;
    setPalette(id, { name: `Palette ${i}`, colors: { ...pal.colors } });
    setActive(id);
  };
  const removePalette = (id: string) => {
    if (ids.length <= 1 || id === theme.palette.default) return;
    const rest = { ...theme.palettes };
    delete rest[id];
    const byDriveMode = Object.fromEntries(
      Object.entries(theme.palette.byDriveMode).filter(([, v]) => v !== id),
    );
    patch({ palettes: rest, palette: { ...theme.palette, byDriveMode } });
    setActive(theme.palette.default);
  };
  const bg = parseColor(pal.colors['background'] ?? '#000');

  return (
    <div className="panel-body">
      <div className="section">
        <div className="section-body">
          <div className="row" style={{ display: 'flex', gap: 4 }}>
            <select
              value={active}
              onChange={(e) => (setActive(e.target.value), setPreview(e.target.value))}
              style={{ flex: 1 }}
            >
              {ids.map((id) => (
                <option key={id} value={id}>
                  {theme.palettes[id]?.name ?? id} ({id})
                </option>
              ))}
            </select>
            <button className="icon" title={t('palettes.add')} onClick={addPalette}>
              +
            </button>
            <button
              className="icon danger"
              title={t('palettes.remove')}
              disabled={ids.length <= 1 || active === theme.palette.default}
              onClick={() => removePalette(active)}
            >
              ×
            </button>
          </div>
          <div className="field">
            <label>{t('inspector.name')}</label>
            <div className="row">
              <input
                type="text"
                value={pal.name}
                onChange={(e) => setPalette(active, { ...pal, name: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>{t('palettes.default')}</label>
            <div className="row">
              <input
                type="checkbox"
                checked={theme.palette.default === active}
                onChange={() => patch({ palette: { ...theme.palette, default: active } })}
              />
            </div>
          </div>
          <div className="field">
            <label>{t('palettes.allowManual')}</label>
            <div className="row">
              <input
                type="checkbox"
                checked={theme.palette.allowManual}
                onChange={(e) =>
                  patch({ palette: { ...theme.palette, allowManual: e.target.checked } })
                }
              />
            </div>
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">{t('palettes.tokens')}</div>
        <div className="section-body">
          {Object.entries(pal.colors).map(([token, color]) => {
            const required = (REQUIRED_PALETTE_TOKENS as readonly string[]).includes(token);
            const ratio = token.startsWith('text') ? contrastRatio(bg, parseColor(color)) : null;
            return (
              <div className="field" key={token}>
                <label title={token}>${token}</label>
                <div className="row">
                  <input
                    type="color"
                    value={toHex(parseColor(color)).slice(0, 7)}
                    onChange={(e) =>
                      setPalette(active, {
                        ...pal,
                        colors: { ...pal.colors, [token]: e.target.value },
                      })
                    }
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) =>
                      setPalette(active, {
                        ...pal,
                        colors: { ...pal.colors, [token]: e.target.value },
                      })
                    }
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  {ratio !== null && (
                    <span
                      className={`badge ${ratio < 3 ? 'error' : ratio < 4.5 ? 'warning' : 'ok'}`}
                      title={t('palettes.contrast')}
                    >
                      {ratio.toFixed(1)}
                    </span>
                  )}
                  {!required && (
                    <button
                      className="icon ghost"
                      onClick={() => {
                        const colors = { ...pal.colors };
                        delete colors[token];
                        setPalette(active, { ...pal, colors });
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="row" style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              placeholder="token-name"
              value={newToken}
              onChange={(e) => setNewToken(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
            <button
              disabled={!newToken || !!pal.colors[newToken]}
              onClick={() => {
                // add the token to every palette so themes stay valid
                const palettes = Object.fromEntries(
                  Object.entries(theme.palettes).map(([id, p]) => [
                    id,
                    { ...p, colors: { ...p.colors, [newToken]: p.colors[newToken] ?? '#888888' } },
                  ]),
                );
                patch({ palettes });
                setNewToken('');
              }}
            >
              {t('palettes.addToken')}
            </button>
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">{t('palettes.byMode')}</div>
        <div className="section-body">
          {MODES.map((m) => (
            <div className="field" key={m}>
              <label>{m}</label>
              <div className="row">
                <select
                  value={theme.palette.byDriveMode[m] ?? ''}
                  onChange={(e) => {
                    const byDriveMode = { ...theme.palette.byDriveMode };
                    if (e.target.value) byDriveMode[m] = e.target.value;
                    else delete byDriveMode[m];
                    patch({ palette: { ...theme.palette, byDriveMode } });
                  }}
                >
                  <option value="">({t('palettes.default')})</option>
                  {ids.map((id) => (
                    <option key={id} value={id}>
                      {theme.palettes[id]?.name ?? id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
