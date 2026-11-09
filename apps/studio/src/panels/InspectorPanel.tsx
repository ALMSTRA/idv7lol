import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnimationRef,
  Binding,
  Comparison,
  Component,
  ImageComponent,
  Condition,
  StatusPanelComponent,
  TextStyle,
  Theme,
  Zone,
} from '@idv7lol/theme-schema';
import { getProfile, getSignal, profileHasSignal, unitSymbol } from '@idv7lol/vehicle-signals';
import { buildPieces } from '@idv7lol/theme-compiler';
import { findComponent, resolveColor } from '@idv7lol/theme-engine';
import { useProjectStore, useThemeForPanels } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { useUiStore } from '../store/ui.js';
import { replaceImage } from '../lib/imageActions.js';
import { imageResolver, subscribeImages } from '../lib/imageStore.js';
import { DESCRIPTORS, getPath, patchFor, type FieldDescriptor } from '../inspector/descriptors.js';
import {
  Checkbox,
  ColorInput,
  ColorsListInput,
  Field,
  FillInput,
  FormatInput,
  NumberInput,
  Select,
  SignalSelect,
  StrokeInput,
  TextStyleInput,
  UnitSelect,
  ZonesInput,
} from '../inspector/fields.js';

const ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
].map((v) => ({ value: v, label: v }));
const OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'truthy', 'falsy', 'stale'].map(
  (v) => ({ value: v, label: v }),
);

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-title" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span>{title}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export function InspectorPanel(): JSX.Element {
  const t = useT();
  const theme = useThemeForPanels();
  const selection = useProjectStore((s) => s.selection);
  const comps = useMemo(
    () =>
      selection.map((id) => findComponent(theme.components, id)).filter((c): c is Component => !!c),
    [theme, selection],
  );
  const update = useProjectStore((s) => s.updateComponent);
  const updateProps = useProjectStore((s) => s.updateProps);

  if (comps.length === 0) return <div className="empty">{t('inspector.nothing')}</div>;
  if (comps.length > 1) {
    return (
      <div>
        <div className="empty">{t('inspector.multiple', { n: comps.length })}</div>
        <CommonSection comps={comps} theme={theme} />
      </div>
    );
  }
  const c = comps[0]!;
  void selection;
  return (
    <div>
      <CommonSection comps={[c]} theme={theme} />
      {c.type === 'image' && <ImageSection c={c} theme={theme} />}
      <BindingSection c={c} theme={theme} />
      {c.type !== 'group' && (
        <PropsSections c={c} theme={theme} onProps={(patch) => updateProps(c.id, patch)} />
      )}
      {c.type === 'group' && (
        <Section title={t('components.group')}>
          <Field label="Clip">
            <Checkbox value={c.props.clip} onChange={(clip) => updateProps(c.id, { clip })} />
          </Field>
        </Section>
      )}
      <VisibilitySection
        c={c}
        onChange={(visibleWhen) => update(c.id, { visibleWhen } as Partial<Component>)}
      />
      <AnimationsSection
        c={c}
        theme={theme}
        onChange={(animations) => update(c.id, { animations } as Partial<Component>)}
      />
      <Section title={t('inspector.notes')} defaultOpen={false}>
        <textarea
          rows={3}
          value={c.notes ?? ''}
          onChange={(e) => update(c.id, { notes: e.target.value } as Partial<Component>, false)}
          onBlur={() => useProjectStore.getState().setTheme(useProjectStore.getState().theme)}
        />
      </Section>
    </div>
  );
}

/** The picture as it looks with its edits applied. */
function EditedThumb({
  c,
  theme,
  onClick,
}: {
  c: ImageComponent;
  theme: Theme;
  onClick: () => void;
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const palette = theme.palettes[theme.palette.default];
    const draw = () => {
      const img = imageResolver.get(c.props.asset, c.props.edits, (x) =>
        palette ? resolveColor(x, palette) : x,
      );
      const cv = ref.current;
      if (!img || !cv) return;
      const s = Math.min(1, 560 / Math.max(img.width, img.height));
      cv.width = Math.max(1, Math.round(img.width * s));
      cv.height = Math.max(1, Math.round(img.height * s));
      cv.getContext('2d')!.drawImage(img.image as CanvasImageSource, 0, 0, cv.width, cv.height);
    };
    draw();
    return subscribeImages(draw);
  }, [c.props.asset, c.props.edits, theme.palettes, theme.palette.default]);
  return <canvas ref={ref} className="inspector-thumb" onClick={onClick} />;
}

function ImageSection({ c, theme }: { c: ImageComponent; theme: Theme }): JSX.Element {
  const t = useT();
  const open = useUiStore((s) => s.setImageEditorFor);
  const updateProps = useProjectStore((s) => s.updateProps);
  const makeBackground = useProjectStore((s) => s.makeBackground);
  const asset = theme.assets[c.props.asset];
  return (
    <Section title={t('image.picture')}>
      {asset?.data ? (
        <EditedThumb c={c} theme={theme} onClick={() => open(c.id)} />
      ) : (
        <div className="hint">{t('image.noData')}</div>
      )}
      <button
        className="primary"
        style={{ justifyContent: 'center' }}
        disabled={!asset?.data}
        onClick={() => open(c.id)}
      >
        {t('image.edit')}
      </button>
      <div className="row" style={{ display: 'flex', gap: 4 }}>
        <button
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => void replaceImage(c.id)}
        >
          {t('image.replace')}
        </button>
        <button style={{ flex: 1, justifyContent: 'center' }} onClick={() => makeBackground(c.id)}>
          {t('image.background')}
        </button>
      </div>
      {asset?.animation && (
        <>
          <div className="hint">{t('image.animated', { n: asset.animation.frames })}</div>
          <Field label={t('image.speed')}>
            <input
              type="range"
              min={0.1}
              max={4}
              step={0.05}
              value={c.props.speed}
              onChange={(e) => updateProps(c.id, { speed: parseFloat(e.target.value) })}
            />
            <span style={{ flex: 'none', width: 40, textAlign: 'right' }}>
              {c.props.speed.toFixed(2)}×
            </span>
          </Field>
        </>
      )}
      <Field label={t('image.fit')}>
        <Select
          value={c.props.fit}
          options={(['contain', 'cover', 'stretch'] as const).map((v) => ({
            value: v,
            label: t(`image.fits.${v}`),
          }))}
          onChange={(fit) => updateProps(c.id, { fit })}
        />
      </Field>
    </Section>
  );
}

function CommonSection({ comps, theme }: { comps: Component[]; theme: Theme }): JSX.Element {
  const t = useT();
  const update = useProjectStore((s) => s.updateComponent);
  const c = comps[0]!;
  const multi = comps.length > 1;
  const apply = (patch: Partial<Component>) => {
    for (const cc of comps) update(cc.id, patch);
  };
  const cost = useMemo(() => {
    try {
      const pieces = buildPieces({ ...theme, components: comps });
      return pieces.pieces.length + pieces.images.length;
    } catch {
      return 0;
    }
  }, [theme, comps]);
  return (
    <Section title={multi ? t('inspector.common') : `${t(`components.${c.type}`)} · ${c.id}`}>
      {!multi && (
        <Field label={t('inspector.name')}>
          <input
            type="text"
            value={c.name ?? ''}
            placeholder={c.id}
            onChange={(e) => update(c.id, { name: e.target.value } as Partial<Component>, false)}
            onBlur={() => useProjectStore.getState().setTheme(useProjectStore.getState().theme)}
          />
        </Field>
      )}
      <Field label={t('inspector.position')}>
        <div className="field-pair" style={{ width: '100%' }}>
          <label>
            <span>X</span>
            <NumberInput value={c.x} onChange={(x) => apply({ x } as Partial<Component>)} />
          </label>
          <label>
            <span>Y</span>
            <NumberInput value={c.y} onChange={(y) => apply({ y } as Partial<Component>)} />
          </label>
        </div>
      </Field>
      <Field label={t('inspector.size')}>
        <div className="field-pair" style={{ width: '100%' }}>
          <label>
            <span>W</span>
            <NumberInput
              value={c.width}
              min={1}
              onChange={(width) => apply({ width: Math.max(1, width) } as Partial<Component>)}
            />
          </label>
          <label>
            <span>H</span>
            <NumberInput
              value={c.height}
              min={1}
              onChange={(height) => apply({ height: Math.max(1, height) } as Partial<Component>)}
            />
          </label>
        </div>
      </Field>
      <Field label={t('inspector.rotation')}>
        <NumberInput
          value={c.rotation}
          min={-360}
          max={360}
          step={0.5}
          onChange={(rotation) => apply({ rotation } as Partial<Component>)}
        />
        <Select
          value={c.anchor}
          options={ANCHORS}
          onChange={(anchor) => apply({ anchor } as Partial<Component>)}
        />
      </Field>
      <Field label={t('inspector.opacity')}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={c.opacity}
          onChange={(e) => apply({ opacity: parseFloat(e.target.value) } as Partial<Component>)}
        />
        <span style={{ flex: 'none', width: 36, textAlign: 'right' }}>
          {Math.round(c.opacity * 100)}%
        </span>
      </Field>
      <Field label="">
        <Checkbox
          value={c.visible}
          onChange={(visible) => apply({ visible } as Partial<Component>)}
          label={t('inspector.visible')}
        />
        <Checkbox
          value={c.locked}
          onChange={(locked) => apply({ locked } as Partial<Component>)}
          label={t('inspector.locked')}
        />
      </Field>
      <div className="hint">{t('inspector.layersCost', { n: cost })}</div>
    </Section>
  );
}

function BindingSection({ c, theme }: { c: Component; theme: Theme }): JSX.Element | null {
  const t = useT();
  const update = useProjectStore((s) => s.updateComponent);
  if (
    c.type === 'group' ||
    c.type === 'rect' ||
    c.type === 'ellipse' ||
    c.type === 'line' ||
    c.type === 'arc' ||
    c.type === 'image' ||
    c.type === 'clock' ||
    c.type === 'status.panel'
  )
    return null;
  const b = c.binding;
  const def = b ? getSignal(b.signal) : undefined;
  const profile = getProfile(theme.vehicleProfile);
  const set = (patch: Partial<Binding>) => {
    const base: Binding = b ?? {
      signal: 'engine.rpm',
      scale: 1,
      offset: 0,
      clamp: true,
      smoothing: 0,
      fallback: 'dash',
    };
    update(c.id, { binding: { ...base, ...patch } } as Partial<Component>);
  };
  return (
    <Section title={t('inspector.binding')}>
      <Field label={t('inspector.signal')}>
        <SignalSelect
          value={b?.signal}
          allowNone
          onChange={(signal) =>
            signal
              ? set({ signal, min: undefined, max: undefined, unit: undefined })
              : update(c.id, { binding: undefined } as Partial<Component>)
          }
        />
      </Field>
      {b && def && (
        <>
          <div className="hint">
            {t('inspector.signalInfo', {
              min: def.min,
              max: def.max,
              unit: unitSymbol(def.unit) || '—',
              availability: def.availability,
            })}
            {profile && !profileHasSignal(profile, b.signal) && (
              <div style={{ color: 'var(--warning)' }}>{t('inspector.notInProfile')}</div>
            )}
          </div>
          <Field label={t('inspector.unit')}>
            <UnitSelect value={b.unit} signalId={b.signal} onChange={(unit) => set({ unit })} />
          </Field>
          <Field label={t('inspector.range')}>
            <div className="field-pair" style={{ width: '100%' }}>
              <label>
                <span>{t('inspector.min').slice(0, 1)}</span>
                <NumberInput value={b.min ?? def.min} onChange={(min) => set({ min })} />
              </label>
              <label>
                <span>{t('inspector.max').slice(0, 1)}</span>
                <NumberInput value={b.max ?? def.max} onChange={(max) => set({ max })} />
              </label>
            </div>
          </Field>
          <Field label={t('inspector.smoothing')}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={b.smoothing}
              onChange={(e) => set({ smoothing: parseFloat(e.target.value) })}
            />
            <span style={{ flex: 'none', width: 36, textAlign: 'right' }}>
              {b.smoothing.toFixed(2)}
            </span>
          </Field>
          <Field label={t('inspector.fallback')}>
            <Select
              value={b.fallback}
              options={(['dash', 'hide', 'last', 'zero'] as const).map((v) => ({
                value: v,
                label: t(`inspector.fallbacks.${v}`),
              }))}
              onChange={(fallback) => set({ fallback: fallback as Binding['fallback'] })}
            />
          </Field>
        </>
      )}
    </Section>
  );
}

function PropsSections({
  c,
  theme,
  onProps,
}: {
  c: Exclude<Component, { type: 'group' }>;
  theme: Theme;
  onProps: (patch: Record<string, unknown>) => void;
}): JSX.Element {
  const t = useT();
  const sections = DESCRIPTORS[c.type];
  return (
    <>
      {sections.map((sec, i) => (
        <Section key={sec.title} title={sec.title} defaultOpen={i < 3}>
          {sec.fields.map((f) => (
            <PropField
              key={f.path}
              c={c}
              f={f}
              theme={theme}
              onChange={(v) => onProps(patchFor(f.path, v))}
              addZoneLabel={t('inspector.addZone')}
            />
          ))}
        </Section>
      ))}
    </>
  );
}

function PropField({
  c,
  f,
  theme,
  onChange,
  addZoneLabel,
}: {
  c: Component;
  f: FieldDescriptor;
  theme: Theme;
  onChange: (v: unknown) => void;
  addZoneLabel: string;
}): JSX.Element | null {
  const value = getPath(c.props, f.path);
  switch (f.kind) {
    case 'number':
      return (
        <Field label={f.label} hint={f.hint}>
          <NumberInput
            value={typeof value === 'number' ? value : 0}
            min={f.min}
            max={f.max}
            step={f.step}
            onChange={onChange}
          />
        </Field>
      );
    case 'bool':
      return (
        <Field label={f.label} hint={f.hint}>
          <Checkbox value={!!value} onChange={onChange} />
        </Field>
      );
    case 'text':
      return (
        <Field label={f.label} hint={f.hint}>
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case 'select':
      return (
        <Field label={f.label} hint={f.hint}>
          <Select value={String(value ?? '')} options={f.options ?? []} onChange={onChange} />
        </Field>
      );
    case 'color':
      return (
        <Field label={f.label} hint={f.hint}>
          <ColorInput
            value={value as string | undefined}
            onChange={onChange}
            theme={theme}
            allowNone={f.path === 'manualColor' || f.path === 'tint'}
          />
        </Field>
      );
    case 'fill':
      return (
        <Field label={f.label} hint={f.hint}>
          <FillInput
            value={value as never}
            onChange={onChange}
            theme={theme}
            allowNone={f.path === 'background' || f.path === 'fill' || f.path === 'tint'}
          />
        </Field>
      );
    case 'stroke':
      return (
        <Field label={f.label} hint={f.hint}>
          <StrokeInput value={value as never} onChange={onChange} theme={theme} />
        </Field>
      );
    case 'textstyle':
      return (
        <Field label={f.label} hint={f.hint}>
          <TextStyleInput value={value as TextStyle} onChange={onChange} theme={theme} />
        </Field>
      );
    case 'zones':
      return (
        <Field label={f.label} hint={f.hint}>
          <ZonesInput
            value={(value as Zone[]) ?? []}
            onChange={onChange}
            theme={theme}
            addLabel={addZoneLabel}
          />
        </Field>
      );
    case 'colors':
      return (
        <Field label={f.label} hint={f.hint}>
          <ColorsListInput value={(value as string[]) ?? []} onChange={onChange} theme={theme} />
        </Field>
      );
    case 'unit':
      return (
        <Field label={f.label} hint={f.hint}>
          <UnitSelect value={value as never} signalId={c.binding?.signal} onChange={onChange} />
        </Field>
      );
    case 'format':
      return (
        <Field label={f.label} hint={f.hint}>
          <FormatInput value={String(value ?? '0')} onChange={onChange} />
        </Field>
      );
    case 'rows':
      return <RowsEditor c={c as StatusPanelComponent} onChange={onChange} />;
  }
  return null;
}

function RowsEditor({
  c,
  onChange,
}: {
  c: StatusPanelComponent;
  onChange: (rows: StatusPanelComponent['props']['rows']) => void;
}): JSX.Element {
  const rows = c.props.rows;
  const set = (i: number, patch: Partial<StatusPanelComponent['props']['rows'][number]>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gap: 4,
            padding: 6,
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        >
          <div className="row" style={{ display: 'flex', gap: 4 }}>
            <input
              type="text"
              value={r.label}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <button
              className="icon ghost"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              disabled={rows.length <= 1}
            >
              ×
            </button>
          </div>
          <SignalSelect
            value={r.binding.signal}
            onChange={(signal) =>
              signal && set(i, { binding: { ...r.binding, signal }, unit: undefined })
            }
          />
          <div className="row" style={{ display: 'flex', gap: 4 }}>
            <FormatInput value={r.format} onChange={(format) => set(i, { format })} />
            <UnitSelect
              value={r.unit}
              signalId={r.binding.signal}
              onChange={(unit) => set(i, { unit })}
            />
          </div>
        </div>
      ))}
      <button
        disabled={rows.length >= 12}
        onClick={() =>
          onChange([
            ...rows,
            {
              label: 'Label',
              binding: {
                signal: 'vehicle.speed',
                scale: 1,
                offset: 0,
                clamp: true,
                smoothing: 0,
                fallback: 'dash',
              },
              format: '0',
              showUnit: true,
            },
          ])
        }
      >
        +
      </button>
    </div>
  );
}

function ConditionEditor({
  value,
  onChange,
}: {
  value: Comparison;
  onChange: (c: Comparison) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 4, width: '100%' }}>
      <SignalSelect
        value={value.signal}
        onChange={(signal) => signal && onChange({ ...value, signal })}
      />
      <div className="row" style={{ display: 'flex', gap: 4 }}>
        <Select
          value={value.op}
          options={OPS}
          onChange={(op) => onChange({ ...value, op: op as Comparison['op'] })}
        />
        {!['truthy', 'falsy', 'stale'].includes(value.op) && (
          <input
            type="text"
            value={value.value === undefined ? '' : String(value.value)}
            onChange={(e) => {
              const raw = e.target.value;
              const n = Number(raw);
              onChange({
                ...value,
                value: raw === '' ? undefined : Number.isFinite(n) && raw.trim() !== '' ? n : raw,
              });
            }}
          />
        )}
        {value.op === 'between' && (
          <NumberInput
            value={value.value2 ?? 0}
            onChange={(value2) => onChange({ ...value, value2 })}
          />
        )}
      </div>
    </div>
  );
}

function VisibilitySection({
  c,
  onChange,
}: {
  c: Component;
  onChange: (v: Condition | undefined) => void;
}): JSX.Element {
  const t = useT();
  const cond = c.visibleWhen;
  const simple =
    cond && !('all' in cond) && !('any' in cond) && !('not' in cond) ? cond : undefined;
  return (
    <Section title={t('inspector.visibleWhen')} defaultOpen={!!cond}>
      <Field label={t('inspector.condition')}>
        <Checkbox
          value={!!cond}
          onChange={(on) => onChange(on ? { signal: 'engine.running', op: 'truthy' } : undefined)}
          label={cond ? '' : t('inspector.always')}
        />
      </Field>
      {simple && <ConditionEditor value={simple} onChange={onChange} />}
      {cond && !simple && <div className="hint">Complex condition (edit in JSON)</div>}
    </Section>
  );
}

function AnimationsSection({
  c,
  theme,
  onChange,
}: {
  c: Component;
  theme: Theme;
  onChange: (a: AnimationRef[]) => void;
}): JSX.Element {
  const t = useT();
  const clips = Object.keys(theme.animations);
  const refs = c.animations;
  const set = (i: number, patch: Partial<AnimationRef>) =>
    onChange(refs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const triggers = (['load', 'always', 'while', 'rising', 'falling', 'change'] as const).map(
    (v) => ({ value: v, label: t(`inspector.triggers.${v}`) }),
  );
  return (
    <Section title={t('inspector.animations')} defaultOpen={refs.length > 0}>
      {refs.map((r, i) => {
        const trig = r.trigger;
        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gap: 4,
              padding: 6,
              border: '1px solid var(--border)',
              borderRadius: 6,
            }}
          >
            <div className="row" style={{ display: 'flex', gap: 4 }}>
              <Select
                value={r.clip}
                options={clips.map((v) => ({ value: v, label: theme.animations[v]?.name ?? v }))}
                onChange={(clip) => set(i, { clip })}
              />
              <button
                className="icon ghost"
                onClick={() => onChange(refs.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <div className="row" style={{ display: 'flex', gap: 4 }}>
              <Select
                value={trig.on}
                options={triggers}
                onChange={(on) => {
                  const next: AnimationRef['trigger'] =
                    on === 'change'
                      ? { on: 'change', signal: 'transmission.gear' }
                      : on === 'while' || on === 'rising' || on === 'falling'
                        ? { on, condition: { signal: 'engine.rpm', op: 'gte', value: 6500 } }
                        : { on: on as 'load' | 'always' };
                  set(i, { trigger: next });
                }}
              />
              <NumberInput
                value={r.delay}
                min={0}
                step={50}
                onChange={(delay) => set(i, { delay })}
              />
            </div>
            {trig.on === 'change' && (
              <SignalSelect
                value={trig.signal}
                onChange={(signal) => signal && set(i, { trigger: { on: 'change', signal } })}
              />
            )}
            {'condition' in trig &&
              !('all' in trig.condition) &&
              !('any' in trig.condition) &&
              !('not' in trig.condition) && (
                <ConditionEditor
                  value={trig.condition}
                  onChange={(cond) =>
                    set(i, { trigger: { ...trig, condition: cond } as AnimationRef['trigger'] })
                  }
                />
              )}
          </div>
        );
      })}
      <button
        disabled={clips.length === 0}
        onClick={() => onChange([...refs, { clip: clips[0]!, trigger: { on: 'load' }, delay: 0 }])}
      >
        {t('inspector.addAnimation')}
      </button>
      {clips.length === 0 && <div className="hint">{t('timeline.none')}</div>}
    </Section>
  );
}
