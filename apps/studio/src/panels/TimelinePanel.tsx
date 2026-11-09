import { useState } from 'react';
import type { AnimationClip, Easing, Theme } from '@idv7lol/theme-schema';
import { flattenComponents } from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { NumberInput, Select } from '../inspector/fields.js';

const EASINGS: Easing[] = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'ease-in-cubic',
  'ease-out-cubic',
  'ease-in-out-cubic',
  'ease-out-back',
  'ease-out-elastic',
  'ease-out-bounce',
  'step',
];
const PROPERTIES = [
  'opacity',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scale',
  'props.style.color',
  'props.fill.color',
  'props.needle.color',
  'props.valueStyle.color',
];

export function TimelinePanel(): JSX.Element {
  const t = useT();
  const theme = useProjectStore((s) => s.theme);
  const patch = useProjectStore((s) => s.patchTheme);
  const ids = Object.keys(theme.animations);
  const [selected, setSelected] = useState<string | null>(ids[0] ?? null);
  const clip = selected ? theme.animations[selected] : undefined;

  const setClip = (id: string, c: AnimationClip) =>
    patch({ animations: { ...theme.animations, [id]: c } });
  const addClip = () => {
    let i = 1;
    while (theme.animations[`clip-${i}`]) i++;
    const id = `clip-${i}`;
    setClip(id, {
      name: `Clip ${i}`,
      duration: 1000,
      easing: 'ease-in-out',
      loop: false,
      direction: 'normal',
      tracks: [
        {
          property: 'opacity',
          keyframes: [
            { t: 0, value: 0 },
            { t: 1, value: 1 },
          ],
        },
      ],
    });
    setSelected(id);
  };
  const removeClip = (id: string) => {
    const rest = { ...theme.animations };
    delete rest[id];
    // detach from components
    const strip = (list: Theme['components']): Theme['components'] =>
      list.map(
        (c) =>
          ({
            ...c,
            animations: c.animations.filter((a) => a.clip !== id),
            ...(c.type === 'group'
              ? { props: { ...c.props, children: strip(c.props.children) } }
              : {}),
          }) as Theme['components'][number],
      );
    useProjectStore
      .getState()
      .setTheme({ ...theme, animations: rest, components: strip(theme.components) });
    setSelected(Object.keys(rest)[0] ?? null);
  };
  const usedBy = (id: string) =>
    flattenComponents(theme.components).filter((f) =>
      f.component.animations.some((a) => a.clip === id),
    ).length;

  return (
    <div className="timeline">
      <div className="clips">
        <div className="panel-header" style={{ fontWeight: 400 }}>
          <span>{t('timeline.clips')}</span>
          <span className="grow" />
          <button className="icon" onClick={addClip} title={t('timeline.addClip')}>
            +
          </button>
        </div>
        {ids.map((id) => (
          <div
            key={id}
            className={`clip ${selected === id ? 'selected' : ''}`}
            onClick={() => setSelected(id)}
          >
            <div>{theme.animations[id]?.name ?? id}</div>
            <small className="hint">
              {theme.animations[id]?.duration} ms · {t('timeline.usedBy', { n: usedBy(id) })}
            </small>
          </div>
        ))}
        {ids.length === 0 && <div className="empty">{t('timeline.none')}</div>}
      </div>
      <div className="editor">
        {clip && selected && (
          <>
            <div className="row" style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={clip.name ?? ''}
                onChange={(e) => setClip(selected, { ...clip, name: e.target.value })}
              />
              <button className="danger" onClick={() => removeClip(selected)}>
                {t('misc.remove')}
              </button>
            </div>
            <div
              className="row"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}
            >
              <label>
                <div className="hint">{t('timeline.duration')}</div>
                <NumberInput
                  value={clip.duration}
                  min={16}
                  max={60000}
                  step={50}
                  onChange={(duration) =>
                    setClip(selected, { ...clip, duration: Math.round(duration) })
                  }
                />
              </label>
              <label>
                <div className="hint">{t('timeline.easing')}</div>
                <Select
                  value={clip.easing}
                  options={EASINGS.map((e) => ({ value: e, label: e }))}
                  onChange={(easing) => setClip(selected, { ...clip, easing: easing as Easing })}
                />
              </label>
              <label>
                <div className="hint">{t('timeline.loop')}</div>
                <Select
                  value={
                    clip.loop === true
                      ? 'forever'
                      : clip.loop === false
                        ? 'once'
                        : String(clip.loop)
                  }
                  options={[
                    { value: 'once', label: 'once' },
                    { value: 'forever', label: 'forever' },
                    { value: '2', label: '2×' },
                    { value: '3', label: '3×' },
                    { value: '5', label: '5×' },
                  ]}
                  onChange={(v) =>
                    setClip(selected, {
                      ...clip,
                      loop: v === 'forever' ? true : v === 'once' ? false : parseInt(v),
                    })
                  }
                />
              </label>
              <label>
                <div className="hint">{t('timeline.direction')}</div>
                <Select
                  value={clip.direction}
                  options={['normal', 'reverse', 'alternate'].map((v) => ({ value: v, label: v }))}
                  onChange={(direction) =>
                    setClip(selected, {
                      ...clip,
                      direction: direction as AnimationClip['direction'],
                    })
                  }
                />
              </label>
            </div>
            <div className="hint">{t('timeline.carNote')}</div>
            {clip.tracks.map((track, ti) => (
              <div
                key={ti}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}
              >
                <div className="track-head">
                  <input
                    list="idv7-props"
                    type="text"
                    value={track.property}
                    onChange={(e) =>
                      setClip(selected, {
                        ...clip,
                        tracks: clip.tracks.map((tr, j) =>
                          j === ti ? { ...tr, property: e.target.value } : tr,
                        ),
                      })
                    }
                    style={{ width: 220 }}
                  />
                  <datalist id="idv7-props">
                    {PROPERTIES.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                  <span className="grow" />
                  <button
                    className="icon ghost"
                    onClick={() =>
                      setClip(selected, { ...clip, tracks: clip.tracks.filter((_, j) => j !== ti) })
                    }
                    disabled={clip.tracks.length <= 1}
                  >
                    ×
                  </button>
                </div>
                <TimelineBar track={track} />
                {track.keyframes.map((k, ki) => (
                  <div className="kf-row" key={ki}>
                    <NumberInput
                      value={k.t}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(tt) =>
                        setClip(selected, {
                          ...clip,
                          tracks: clip.tracks.map((tr, j) =>
                            j === ti
                              ? {
                                  ...tr,
                                  keyframes: tr.keyframes.map((kk, m) =>
                                    m === ki ? { ...kk, t: Math.max(0, Math.min(1, tt)) } : kk,
                                  ),
                                }
                              : tr,
                          ),
                        })
                      }
                    />
                    <input
                      type="text"
                      value={String(k.value)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = Number(raw);
                        setClip(selected, {
                          ...clip,
                          tracks: clip.tracks.map((tr, j) =>
                            j === ti
                              ? {
                                  ...tr,
                                  keyframes: tr.keyframes.map((kk, m) =>
                                    m === ki
                                      ? {
                                          ...kk,
                                          value: raw.trim() !== '' && Number.isFinite(n) ? n : raw,
                                        }
                                      : kk,
                                  ),
                                }
                              : tr,
                          ),
                        });
                      }}
                    />
                    <Select
                      value={k.easing ?? ''}
                      options={[
                        { value: '', label: '(clip)' },
                        ...EASINGS.map((e) => ({ value: e, label: e })),
                      ]}
                      onChange={(es) =>
                        setClip(selected, {
                          ...clip,
                          tracks: clip.tracks.map((tr, j) =>
                            j === ti
                              ? {
                                  ...tr,
                                  keyframes: tr.keyframes.map((kk, m) =>
                                    m === ki
                                      ? { ...kk, easing: (es || undefined) as Easing | undefined }
                                      : kk,
                                  ),
                                }
                              : tr,
                          ),
                        })
                      }
                    />
                    <button
                      className="icon ghost"
                      disabled={track.keyframes.length <= 1}
                      onClick={() =>
                        setClip(selected, {
                          ...clip,
                          tracks: clip.tracks.map((tr, j) =>
                            j === ti
                              ? { ...tr, keyframes: tr.keyframes.filter((_, m) => m !== ki) }
                              : tr,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const last = track.keyframes[track.keyframes.length - 1]!;
                    setClip(selected, {
                      ...clip,
                      tracks: clip.tracks.map((tr, j) =>
                        j === ti
                          ? {
                              ...tr,
                              keyframes: [
                                ...tr.keyframes,
                                { t: Math.min(1, last.t + 0.25), value: last.value },
                              ],
                            }
                          : tr,
                      ),
                    });
                  }}
                >
                  + {t('timeline.addKeyframe')}
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setClip(selected, {
                  ...clip,
                  tracks: [
                    ...clip.tracks,
                    {
                      property: 'opacity',
                      keyframes: [
                        { t: 0, value: 1 },
                        { t: 1, value: 1 },
                      ],
                    },
                  ],
                })
              }
            >
              + {t('timeline.addTrack')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TimelineBar({ track }: { track: AnimationClip['tracks'][number] }): JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        height: 18,
        margin: '6px 0',
        background: 'var(--bg-input)',
        borderRadius: 4,
      }}
    >
      {track.keyframes.map((k, i) => (
        <span
          key={i}
          title={`${k.t} → ${k.value}`}
          style={{
            position: 'absolute',
            left: `calc(${k.t * 100}% - 5px)`,
            top: 4,
            width: 10,
            height: 10,
            transform: 'rotate(45deg)',
            background: 'var(--accent)',
          }}
        />
      ))}
    </div>
  );
}
