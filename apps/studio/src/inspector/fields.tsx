import { useMemo, useState } from 'react';
import type { Color, Fill, Gradient, Stroke, TextStyle, Theme, Zone } from '@idv7lol/theme-schema';
import {
  SIGNALS,
  UNITS,
  getSignal,
  sameDimension,
  signalsByGroup,
  type UnitId,
} from '@idv7lol/vehicle-signals';
import { parseColor, toHex } from '@idv7lol/theme-engine';

/* ----- primitives ----- */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}): JSX.Element {
  return (
    <div className="field" title={hint}>
      <label>{label}</label>
      <div className="row">{children}</div>
    </div>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  commit,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  commit?: () => void;
}): JSX.Element {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      value={text ?? (Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '')}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        setText(null);
        commit?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function Checkbox({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}): JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ----- colour ----- */

export function ColorInput({
  value,
  onChange,
  theme,
  allowNone,
}: {
  value: Color | undefined;
  onChange: (v: Color | undefined) => void;
  theme: Theme;
  allowNone?: boolean;
}): JSX.Element {
  const palette = theme.palettes[theme.palette.default];
  const tokens = Object.keys(palette?.colors ?? {});
  const isToken = !!value && value.startsWith('$');
  const literal = !value
    ? '#ff00ff'
    : isToken
      ? (palette?.colors[value.slice(1)] ?? '#ff00ff')
      : value;
  const hex = toHex(parseColor(literal)).slice(0, 7);
  return (
    <>
      <select
        value={!value ? '' : isToken ? value : '#custom'}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') onChange(undefined);
          else if (v === '#custom') onChange(hex);
          else onChange(v);
        }}
        style={{ flex: 1 }}
      >
        {allowNone && <option value="">—</option>}
        {tokens.map((tk) => (
          <option key={tk} value={`$${tk}`}>
            ${tk}
          </option>
        ))}
        <option value="#custom">custom</option>
      </select>
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} title={literal} />
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          background: literal,
          border: '1px solid var(--border)',
          flex: 'none',
        }}
      />
    </>
  );
}

export function FillInput({
  value,
  onChange,
  theme,
  allowNone,
}: {
  value: Fill | undefined;
  onChange: (v: Fill | undefined) => void;
  theme: Theme;
  allowNone?: boolean;
}): JSX.Element {
  const kind = !value ? 'none' : typeof value === 'string' ? 'solid' : value.type;
  const g = typeof value === 'object' ? value : undefined;
  const setKind = (k: string) => {
    if (k === 'none') onChange(undefined);
    else if (k === 'solid')
      onChange(typeof value === 'string' ? value : (g?.stops[0]?.color ?? '$accent'));
    else {
      const base: Gradient = g ?? {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: typeof value === 'string' ? value : '$accent' },
          { offset: 1, color: '$background' },
        ],
      };
      onChange({ ...base, type: k as Gradient['type'] });
    }
  };
  return (
    <div style={{ display: 'grid', gap: 4, width: '100%' }}>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {allowNone !== false && <option value="none">none</option>}
          <option value="solid">solid</option>
          <option value="linear">linear gradient</option>
          <option value="radial">radial gradient</option>
        </select>
        {typeof value === 'string' && (
          <ColorInput value={value} onChange={(c) => onChange(c ?? '$accent')} theme={theme} />
        )}
      </div>
      {g && (
        <>
          <div className="row">
            <ColorInput
              value={g.stops[0]!.color}
              onChange={(c) =>
                onChange({
                  ...g,
                  stops: [{ ...g.stops[0]!, color: c ?? '$accent' }, ...g.stops.slice(1)],
                })
              }
              theme={theme}
            />
          </div>
          <div className="row">
            <ColorInput
              value={g.stops[g.stops.length - 1]!.color}
              onChange={(c) =>
                onChange({
                  ...g,
                  stops: [
                    ...g.stops.slice(0, -1),
                    { ...g.stops[g.stops.length - 1]!, color: c ?? '$background' },
                  ],
                })
              }
              theme={theme}
            />
          </div>
          {g.type !== 'radial' && (
            <div className="row">
              <span className="hint" style={{ flex: 'none' }}>
                angle
              </span>
              <NumberInput
                value={g.angle}
                min={-360}
                max={360}
                onChange={(a) => onChange({ ...g, angle: a })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ----- text style ----- */

const WEIGHTS = ['light', 'regular', 'medium', 'bold'].map((v) => ({ value: v, label: v }));
const ALIGNS = ['left', 'center', 'right'].map((v) => ({ value: v, label: v }));
const BASELINES = ['top', 'middle', 'bottom', 'alphabetic'].map((v) => ({ value: v, label: v }));

export function TextStyleInput({
  value,
  onChange,
  theme,
}: {
  value: TextStyle;
  onChange: (v: TextStyle) => void;
  theme: Theme;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const fonts = Object.keys(theme.fonts).map((f) => ({ value: f, label: f }));
  return (
    <div style={{ display: 'grid', gap: 4, width: '100%' }}>
      <div className="row">
        <NumberInput
          value={value.size}
          min={4}
          max={600}
          onChange={(size) => onChange({ ...value, size })}
        />
        <Select
          value={value.weight}
          options={WEIGHTS}
          onChange={(weight) => onChange({ ...value, weight: weight as TextStyle['weight'] })}
        />
        <button className="icon ghost" onClick={() => setOpen(!open)} title="More">
          {open ? '▾' : '▸'}
        </button>
      </div>
      <div className="row">
        <ColorInput
          value={value.color}
          onChange={(c) => onChange({ ...value, color: c ?? '$text' })}
          theme={theme}
        />
      </div>
      {open && (
        <>
          <div className="row">
            <Select
              value={value.align}
              options={ALIGNS}
              onChange={(align) => onChange({ ...value, align: align as TextStyle['align'] })}
            />
            <Select
              value={value.baseline}
              options={BASELINES}
              onChange={(baseline) =>
                onChange({ ...value, baseline: baseline as TextStyle['baseline'] })
              }
            />
          </div>
          <div className="row">
            <Select
              value={value.font}
              options={fonts}
              onChange={(font) => onChange({ ...value, font })}
            />
            <NumberInput
              value={value.letterSpacing}
              min={-20}
              max={60}
              step={0.5}
              onChange={(letterSpacing) => onChange({ ...value, letterSpacing })}
            />
            <Checkbox
              value={value.uppercase}
              onChange={(uppercase) => onChange({ ...value, uppercase })}
              label="ABC"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ----- stroke ----- */

export function StrokeInput({
  value,
  onChange,
  theme,
}: {
  value: Stroke | undefined;
  onChange: (v: Stroke | undefined) => void;
  theme: Theme;
}): JSX.Element {
  return (
    <>
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) =>
          onChange(e.target.checked ? { color: '$track', width: 2, cap: 'butt' } : undefined)
        }
      />
      {value && (
        <>
          <ColorInput
            value={value.color}
            onChange={(c) => onChange({ ...value, color: c ?? '$track' })}
            theme={theme}
          />
          <NumberInput
            value={value.width}
            min={0}
            max={100}
            step={0.5}
            onChange={(width) => onChange({ ...value, width })}
          />
        </>
      )}
    </>
  );
}

/* ----- zones ----- */

export function ZonesInput({
  value,
  onChange,
  theme,
  addLabel,
}: {
  value: Zone[];
  onChange: (v: Zone[]) => void;
  theme: Theme;
  addLabel: string;
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 4, width: '100%' }}>
      {value.map((z, i) => (
        <div className="zone-row" key={i}>
          <NumberInput
            value={z.from}
            onChange={(from) => onChange(value.map((zz, j) => (j === i ? { ...zz, from } : zz)))}
          />
          <NumberInput
            value={z.to}
            onChange={(to) => onChange(value.map((zz, j) => (j === i ? { ...zz, to } : zz)))}
          />
          <input
            type="color"
            value={toHex(
              parseColor(
                z.color.startsWith('$')
                  ? (theme.palettes[theme.palette.default]?.colors[z.color.slice(1)] ?? '#ff00ff')
                  : z.color,
              ),
            ).slice(0, 7)}
            onChange={(e) =>
              onChange(value.map((zz, j) => (j === i ? { ...zz, color: e.target.value } : zz)))
            }
            title={z.color}
          />
          <button className="icon ghost" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <div className="row">
        <select
          onChange={(e) => {
            const tk = e.target.value;
            if (!tk) return;
            onChange([...value, { from: 0, to: 100, color: tk }]);
            e.target.value = '';
          }}
          defaultValue=""
        >
          <option value="">{addLabel}</option>
          {Object.keys(theme.palettes[theme.palette.default]?.colors ?? {}).map((tk) => (
            <option key={tk} value={`$${tk}`}>
              ${tk}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function ColorsListInput({
  value,
  onChange,
  theme,
}: {
  value: Color[];
  onChange: (v: Color[]) => void;
  theme: Theme;
}): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 4, width: '100%' }}>
      {value.map((c, i) => (
        <div className="row" key={i}>
          <ColorInput
            value={c}
            onChange={(nc) => onChange(value.map((x, j) => (j === i ? (nc ?? x) : x)))}
            theme={theme}
          />
          <button
            className="icon ghost"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            disabled={value.length <= 1}
          >
            ×
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...value, value[value.length - 1] ?? '$accent'])}>+</button>
    </div>
  );
}

/* ----- signals & units ----- */

export function SignalSelect({
  value,
  onChange,
  allowNone,
  profileId,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  allowNone?: boolean;
  profileId?: string;
}): JSX.Element {
  const groups = useMemo(() => [...signalsByGroup().entries()], []);
  void profileId;
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowNone && <option value="">—</option>}
      {groups.map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.id})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function UnitSelect({
  value,
  onChange,
  signalId,
}: {
  value: UnitId | undefined;
  onChange: (v: UnitId | undefined) => void;
  signalId?: string;
}): JSX.Element {
  const def = signalId ? getSignal(signalId) : undefined;
  const units = Object.values(UNITS).filter((u) => !def || sameDimension(u.id, def.unit));
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || undefined) as UnitId | undefined)}
    >
      <option value="">{def ? `${UNITS[def.unit].symbol || def.unit} (catalog)` : '—'}</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.symbol || u.id} · {u.id}
        </option>
      ))}
    </select>
  );
}

export const FORMAT_PRESETS = ['0', '0.0', '0.00', '00', '+0', '+0.0', '0,0', '0 km/h', '0%'];

export function FormatInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <>
      <input
        type="text"
        list="idv7-formats"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="idv7-formats">
        {FORMAT_PRESETS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </>
  );
}

export const SIGNAL_OPTIONS = SIGNALS.map((s) => ({ value: s.id, label: `${s.name} (${s.id})` }));
