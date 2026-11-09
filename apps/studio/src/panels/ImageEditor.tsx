import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ImageEditsSchema,
  type ImageEdits,
  type ImageComponent,
  type Theme,
} from '@idv7lol/theme-schema';
import {
  applyImageEdits,
  displayToSource,
  editedSize,
  findComponent,
  resolveColor,
  toHex,
  type Raster,
} from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { useT } from '../i18n/index.js';
import { frameRaster } from '@idv7lol/theme-engine';
import {
  ensureSource,
  imageResolver,
  previewOf,
  rasterToCanvas,
  renderLatest,
  subscribeImages,
  withResolvedTint,
} from '../lib/imageStore.js';
import { engine } from '../canvas/CanvasView.js';

type Tool = 'adjust' | 'crop' | 'background' | 'brush' | 'effects' | 'looks';
type Backdrop = 'checker' | 'black' | 'white';
type T = (key: string, vars?: Record<string, string | number>) => string;
type Crop = NonNullable<ImageEdits['crop']>;

const CLEAN = ImageEditsSchema.parse({});
const FULL: Crop = { x: 0, y: 0, width: 1, height: 1 };

const LOOKS: Array<{ id: string; edits: Partial<ImageEdits> }> = [
  { id: 'original', edits: {} },
  {
    id: 'night',
    edits: { brightness: -22, contrast: 18, saturation: -18, temperature: -30, vignette: 45 },
  },
  { id: 'neon', edits: { contrast: 35, saturation: 70, hue: -18 } },
  { id: 'mono', edits: { grayscale: true, contrast: 22 } },
  { id: 'warm', edits: { temperature: 55, saturation: 10, brightness: 4 } },
  { id: 'cold', edits: { temperature: -60, contrast: 8 } },
  { id: 'punch', edits: { contrast: 55, saturation: 25, sharpen: 35 } },
  { id: 'muted', edits: { saturation: -45, contrast: -12, brightness: 6 } },
];
const LOOK_FIELDS = [
  'brightness',
  'contrast',
  'saturation',
  'hue',
  'temperature',
  'sharpen',
  'grayscale',
  'invert',
  'vignette',
] as const;

function withLook(e: ImageEdits, look: Partial<ImageEdits>): ImageEdits {
  const out = { ...e } as Record<string, unknown>;
  for (const f of LOOK_FIELDS) out[f] = CLEAN[f];
  return { ...(out as ImageEdits), ...look };
}

/* ----- icons: one 20×20 stroke set, so the rail reads as a single family ----- */

const ICONS: Record<Tool, React.ReactNode> = {
  adjust: <path d="M4 6h7M15 6h1M4 14h1M9 14h7M13 3.5v5M7 11.5v5" />,
  crop: <path d="M6 2v12h12M2 6h12v12" />,
  background: <path d="M3 17 17 3M4 4h5M4 4v5M16 16h-5M16 16v-5" />,
  brush: <path d="M12 3.5 16.5 8 9 15.5H4.500V11zM10 5.500 14.500 10" />,
  effects: (
    <path d="M10 2.500 11.800 8.200 17.500 10 11.800 11.800 10 17.500 8.200 11.800 2.500 10 8.200 8.200z" />
  ),
  looks: (
    <path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13l4-4 3 3 3-2 4 4" />
  ),
};
const Icon = ({ tool }: { tool: Tool }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ICONS[tool]}
  </svg>
);

/* ----- slider ----- */

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onStart: () => void;
  onChange: (v: number) => void;
  reset?: number;
}): JSX.Element {
  const { label, value, min, max, step = 1, suffix = '', onStart, onChange, reset = 0 } = props;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const a = Math.min(pct(reset), pct(value));
  const b = Math.max(pct(reset), pct(value));
  return (
    <div className={`ie-slider ${value !== reset ? 'changed' : ''}`}>
      <div className="ie-slider-head">
        <button
          type="button"
          className="ie-slider-label"
          onDoubleClick={() => (onStart(), onChange(reset))}
          title={label}
        >
          {label}
        </button>
        <output>
          {value > 0 && min < 0 ? '+' : ''}
          {Math.round(value)}
          {suffix}
        </output>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--a': `${a}%`, '--b': `${b}%` } as React.CSSProperties}
        onPointerDown={onStart}
        onKeyDown={onStart}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

/* ----- crop overlay ----- */

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

function CropOverlay({
  crop,
  aspect,
  onStart,
  onChange,
}: {
  crop: Crop;
  aspect: number | null;
  onStart: () => void;
  onChange: (c: Crop) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    handle: string;
    x: number;
    y: number;
    start: Crop;
    w: number;
    h: number;
  } | null>(null);
  const begin = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    const box = ref.current!.parentElement!.getBoundingClientRect();
    (e.target as Element).setPointerCapture(e.pointerId);
    onStart();
    drag.current = { handle, x: e.clientX, y: e.clientY, start: crop, w: box.width, h: box.height };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / d.w;
    const dy = (e.clientY - d.y) / d.h;
    const s = d.start;
    const min = 0.02;
    if (d.handle === 'move') {
      onChange({
        ...s,
        x: Math.max(0, Math.min(1 - s.width, s.x + dx)),
        y: Math.max(0, Math.min(1 - s.height, s.y + dy)),
      });
      return;
    }
    let left = s.x;
    let top = s.y;
    let right = s.x + s.width;
    let bottom = s.y + s.height;
    if (d.handle.includes('w')) left = Math.max(0, Math.min(right - min, left + dx));
    if (d.handle.includes('e')) right = Math.min(1, Math.max(left + min, right + dx));
    if (d.handle.includes('n')) top = Math.max(0, Math.min(bottom - min, top + dy));
    if (d.handle.includes('s')) bottom = Math.min(1, Math.max(top + min, bottom + dy));
    if (aspect) {
      // `aspect` is expressed in normalised units here: width / height of the rect.
      const widthLed = d.handle.includes('e') || d.handle.includes('w');
      let w = right - left;
      let h = bottom - top;
      if (widthLed) h = w / aspect;
      else w = h * aspect;
      if (d.handle.includes('n')) top = bottom - h;
      else bottom = top + h;
      if (d.handle.includes('w')) left = right - w;
      else right = left + w;
      if (left < 0 || top < 0 || right > 1 || bottom > 1) return;
    }
    onChange({ x: left, y: top, width: right - left, height: bottom - top });
  };
  const end = () => {
    drag.current = null;
  };
  const box = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.width * 100}%`,
    height: `${crop.height * 100}%`,
  };
  return (
    <>
      <div className="ie-crop-mask">
        <i style={box} />
      </div>
      <div
        ref={ref}
        className="ie-crop"
        style={box}
        onPointerDown={(e) => begin(e, 'move')}
        onPointerMove={move}
        onPointerUp={end}
      >
        <i className="ie-third v1" />
        <i className="ie-third v2" />
        <i className="ie-third h1" />
        <i className="ie-third h2" />
        {HANDLES.map((h) => (
          <b key={h} className={`ie-handle ${h}`} onPointerDown={(e) => begin(e, h)} />
        ))}
      </div>
    </>
  );
}

/* ----- editor ----- */

export function ImageEditor(): JSX.Element | null {
  const id = useUiStore((s) => s.imageEditorFor);
  return id ? <Editor key={id} componentId={id} /> : null;
}

function Editor({ componentId }: { componentId: string }): JSX.Element {
  const t = useT() as T;
  const close = useUiStore((s) => s.setImageEditorFor);
  const theme = useProjectStore((s) => s.theme);
  const update = useProjectStore((s) => s.updateComponent);
  const comp = findComponent(theme.components, componentId) as ImageComponent | undefined;
  const asset = comp ? theme.assets[comp.props.asset] : undefined;

  const [source, setSource] = useState<Raster | null>(null);
  const [failed, setFailed] = useState(false);
  const [edits, setEdits] = useState<ImageEdits>(() => comp?.props.edits ?? CLEAN);
  const [past, setPast] = useState<ImageEdits[]>([]);
  const [future, setFuture] = useState<ImageEdits[]>([]);
  const [tool, setTool] = useState<Tool>('adjust');
  const [backdrop, setBackdrop] = useState<Backdrop>('checker');
  const [before, setBefore] = useState(false);
  const [aspect, setAspect] = useState<{ id: string; ratio: number | null }>({
    id: 'free',
    ratio: null,
  });
  const [brush, setBrush] = useState({
    mode: 'erase' as 'erase' | 'restore',
    size: 8,
    hardness: 70,
  });
  const [stage, setStage] = useState({ w: 800, h: 500 });
  const [out, setOut] = useState({ w: 1, h: 1 });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animation = asset?.animation;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const editsRef = useRef(edits);
  editsRef.current = edits;

  useEffect(() => {
    if (!asset?.data) {
      setFailed(true);
      return;
    }
    let live = true;
    void ensureSource(comp!.props.asset, asset.data, asset.animation).then((r) => {
      if (!live) return;
      if (r) setSource(asset.animation ? frameRaster(r, asset.animation, 0) : r);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
    // The asset of an open editor does not change.
  }, []);

  const palette = theme.palettes[theme.palette.default];
  const resolve = useCallback((c: string) => (palette ? resolveColor(c, palette) : c), [palette]);

  const view = useMemo<ImageEdits>(() => {
    if (before) return CLEAN;
    return tool === 'crop' ? { ...edits, crop: undefined } : edits;
  }, [edits, tool, before]);

  /* ----- draw the working image; the worker keeps the interface free ----- */
  useEffect(() => {
    if (!source || !comp) return;
    renderLatest(
      'editor',
      comp.props.asset,
      withResolvedTint(view, resolve),
      1400,
      (r) => {
        const c = canvasRef.current;
        if (!c) return;
        if (c.width !== r.width || c.height !== r.height) {
          c.width = r.width;
          c.height = r.height;
        } else {
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
        }
        c.getContext('2d')!.drawImage(r.image, 0, 0);
        setOut({ w: r.width, h: r.height });
      },
      animation ? frame : undefined,
    );
    // `comp` only supplies the asset id, which is fixed for an open editor.
  }, [source, view, resolve, frame, animation]);

  useEffect(() => {
    if (!playing || !animation) return;
    const h = setTimeout(
      () => setFrame((f) => (f + 1) % animation.frames),
      animation.durations[frame] ?? 100,
    );
    return () => clearTimeout(h);
  }, [playing, animation, frame]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----- the picture in place on the cluster, after the last change settles ----- */
  const [imagesTick, setImagesTick] = useState(0);
  useEffect(() => subscribeImages(() => setImagesTick((n) => n + 1)), []);
  useEffect(() => {
    const h = setTimeout(() => {
      const c = miniRef.current;
      if (!c || !comp) return;
      const scale = c.width / theme.layout.width;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const apply = (list: Theme['components']): Theme['components'] =>
        list.map((x) => {
          if (x.id === componentId && x.type === 'image')
            return { ...x, props: { ...x.props, edits } };
          if (x.type === 'group')
            return { ...x, props: { ...x.props, children: apply(x.props.children) } };
          return x;
        });
      engine.render(ctx, { ...theme, components: apply(theme.components) }, performance.now(), {
        images: imageResolver,
      });
    }, 160);
    return () => clearTimeout(h);
  }, [edits, theme, comp, componentId, imagesTick]);

  /* ----- history ----- */
  const remember = useCallback(() => {
    setPast((p) =>
      p[p.length - 1] === editsRef.current ? p : [...p.slice(-60), editsRef.current],
    );
    setFuture([]);
  }, []);
  const patch = useCallback((p: Partial<ImageEdits>) => setEdits((e) => ({ ...e, ...p })), []);
  const change = useCallback(
    (p: Partial<ImageEdits>) => {
      remember();
      patch(p);
    },
    [remember, patch],
  );
  const undo = useCallback(() => {
    setPast((p) => {
      const last = p[p.length - 1];
      if (!last) return p;
      setFuture((f) => [editsRef.current, ...f]);
      setEdits(last);
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((f) => {
      const next = f[0];
      if (!next) return f;
      setPast((p) => [...p, editsRef.current]);
      setEdits(next);
      return f.slice(1);
    });
  }, []);

  const dirty = JSON.stringify(edits) !== JSON.stringify(comp?.props.edits ?? CLEAN);
  const cancel = useCallback(() => {
    if (!dirty || window.confirm(t('image.discard'))) close(null);
  }, [dirty, close, t]);
  const apply = () => {
    if (comp)
      update(comp.id, {
        props: { ...comp.props, edits: ImageEditsSchema.parse(edits) },
      } as Partial<ImageComponent>);
    close(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement && e.target.type !== 'range';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') cancel();
      else if (!typing && e.key === '[') setBrush((b) => ({ ...b, size: Math.max(1, b.size - 1) }));
      else if (!typing && e.key === ']')
        setBrush((b) => ({ ...b, size: Math.min(40, b.size + 1) }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, cancel]);

  /* ----- geometry of the working image on screen ----- */
  const fit = Math.min((stage.w - 56) / out.w, (stage.h - 56) / out.h, 3);
  const dispW = Math.max(1, out.w * fit * zoom);
  const dispH = Math.max(1, out.h * fit * zoom);
  const zoomBy = (f: number) => setZoom((z) => Math.max(0.2, Math.min(12, z * f)));
  const zoomFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const pointAt = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      nx: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      ny: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      sx: e.clientX - r.left,
      sy: e.clientY - r.top,
    };
  };

  const sourcePoint = (nx: number, ny: number) => {
    const p = displayToSource(edits, nx, ny);
    return [Math.round(p.x * 10000) / 10000, Math.round(p.y * 10000) / 10000] as const;
  };

  const sampleColor = (nx: number, ny: number) => {
    if (!source) return;
    const p = displayToSource(edits, nx, ny);
    const x = Math.min(source.width - 1, Math.floor(p.x * source.width));
    const y = Math.min(source.height - 1, Math.floor(p.y * source.height));
    const i = (y * source.width + x) * 4;
    const color = toHex({
      r: source.data[i]!,
      g: source.data[i + 1]!,
      b: source.data[i + 2]!,
      a: 1,
    });
    change({
      colorKey: {
        tolerance: edits.colorKey?.tolerance ?? 15,
        softness: edits.colorKey?.softness ?? 10,
        color,
      },
    });
  };

  const detectBackground = () => {
    if (!source) return;
    const { width: w, height: h, data: d } = source;
    let r = 0;
    let g = 0;
    let b = 0;
    const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
    for (const i of corners) {
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
    }
    change({
      colorKey: {
        tolerance: 18,
        softness: 10,
        color: toHex({ r: r / 4, g: g / 4, b: b / 4, a: 1 }),
      },
    });
  };

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      panning.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    if (e.button !== 0) return;
    const { nx, ny } = pointAt(e);
    if (tool === 'background') {
      sampleColor(nx, ny);
    } else if (tool === 'brush') {
      (e.target as Element).setPointerCapture(e.pointerId);
      painting.current = true;
      remember();
      const [x, y] = sourcePoint(nx, ny);
      patch({
        strokes: [
          ...editsRef.current.strokes,
          {
            mode: brush.mode,
            size: brush.size / 100,
            hardness: brush.hardness / 100,
            points: [x, y],
          },
        ],
      });
    }
  };
  const onStageMove = (e: React.PointerEvent) => {
    if (panning.current) {
      const g = panning.current;
      setPan({ x: g.px + e.clientX - g.x, y: g.py + e.clientY - g.y });
      return;
    }
    const { nx, ny, sx, sy } = pointAt(e);
    if (tool === 'brush') setPointer({ x: sx, y: sy });
    if (!painting.current) return;
    const strokes = editsRef.current.strokes;
    const last = strokes[strokes.length - 1];
    if (!last) return;
    const [x, y] = sourcePoint(nx, ny);
    const px = last.points[last.points.length - 2]!;
    const py = last.points[last.points.length - 1]!;
    if (Math.hypot(x - px, y - py) < 0.003) return;
    patch({ strokes: [...strokes.slice(0, -1), { ...last, points: [...last.points, x, y] }] });
  };
  const onStageUp = () => {
    painting.current = false;
    panning.current = null;
  };

  /* ----- crop helpers ----- */
  const view0 = source
    ? editedSize({ ...edits, crop: undefined }, source.width, source.height)
    : { width: 1, height: 1 };
  const normRatio = (ratio: number) => ratio / (view0.width / view0.height);
  const chooseAspect = (id: string, ratio: number | null) => {
    setAspect({ id, ratio });
    if (ratio === null) return;
    const n = normRatio(ratio);
    let w = 1;
    let h = w / n;
    if (h > 1) {
      h = 1;
      w = n;
    }
    change({ crop: { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h } });
  };
  const rotateBy = (delta: number) =>
    change({
      rotate: ((edits.rotate + delta + 360) % 360) as ImageEdits['rotate'],
      crop: undefined,
    });

  /* ----- looks ----- */
  const lookThumbs = useMemo(() => {
    if (!source) return {} as Record<string, string>;
    const small = previewOf(source, 150);
    return Object.fromEntries(
      LOOKS.map((l) => [
        l.id,
        rasterToCanvas(applyImageEdits(small, withLook(CLEAN, l.edits))).toDataURL('image/png'),
      ]),
    );
  }, [source]);

  const brushPx = source
    ? (brush.size / 100) *
      Math.min(source.width, source.height) *
      (dispW / editedSize(edits, source.width, source.height).width)
    : 0;
  const slider = (
    key:
      | 'brightness'
      | 'contrast'
      | 'saturation'
      | 'hue'
      | 'temperature'
      | 'sharpen'
      | 'blur'
      | 'vignette'
      | 'radius',
    min: number,
    max: number,
    suffix?: string,
  ) => (
    <Slider
      label={t(`image.${key}`)}
      value={edits[key]}
      min={min}
      max={max}
      suffix={suffix}
      onStart={remember}
      onChange={(v) => patch({ [key]: v })}
    />
  );

  const tools: Tool[] = ['adjust', 'looks', 'crop', 'background', 'brush', 'effects'];
  const cursor = tool === 'background' ? 'crosshair' : tool === 'brush' ? 'none' : 'default';

  return (
    <div className="ie" role="dialog" aria-label={t('image.title')}>
      <header className="ie-top">
        <strong>{asset?.name ?? comp?.props.asset}</strong>
        {source && (
          <span className="ie-dim">
            {source.width} × {source.height}
          </span>
        )}
        <span className="ie-grow" />
        <button className="ghost" onClick={undo} disabled={!past.length} title="Ctrl+Z">
          {t('menu.undo')}
        </button>
        <button className="ghost" onClick={redo} disabled={!future.length} title="Ctrl+Y">
          {t('menu.redo')}
        </button>
        <button
          className="ghost"
          onClick={() => change({ ...CLEAN })}
          disabled={JSON.stringify(edits) === JSON.stringify(CLEAN)}
        >
          {t('image.resetAll')}
        </button>
        <span className="ie-sep" />
        <button onClick={cancel}>{t('misc.cancel')}</button>
        <button className="primary" onClick={apply}>
          {t('image.apply')}
        </button>
      </header>

      <nav className="ie-rail" aria-label={t('image.tools')}>
        {tools.map((x) => (
          <button
            key={x}
            className={tool === x ? 'on' : ''}
            onClick={() => setTool(x)}
            aria-pressed={tool === x}
          >
            <Icon tool={x} />
            <span>{t(`image.tool.${x}`)}</span>
          </button>
        ))}
      </nav>

      <main
        ref={stageRef}
        className="ie-stage"
        onPointerLeave={() => setPointer(null)}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12)}
      >
        {failed && <p className="ie-empty">{t('image.noData')}</p>}
        <div
          className={`ie-sheet bg-${backdrop}`}
          style={{
            width: dispW,
            height: dispH,
            cursor,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
          onPointerDown={onStageDown}
          onPointerMove={onStageMove}
          onPointerUp={onStageUp}
          onPointerCancel={onStageUp}
        >
          <canvas ref={canvasRef} />
          {tool === 'crop' && !before && (
            <CropOverlay
              crop={edits.crop ?? FULL}
              aspect={aspect.ratio ? normRatio(aspect.ratio) : null}
              onStart={remember}
              onChange={(c) => patch({ crop: c })}
            />
          )}
          {tool === 'brush' && pointer && (
            <i
              className={`ie-brush ${brush.mode}`}
              style={{ left: pointer.x, top: pointer.y, width: brushPx, height: brushPx }}
            />
          )}
        </div>
        <div className="ie-stagebar">
          {animation && (
            <>
              <button
                className="ghost icon"
                onClick={() => setPlaying(!playing)}
                aria-label={t(playing ? 'sim.pause' : 'sim.play')}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <input
                className="ie-scrub"
                type="range"
                aria-label={t('image.frame')}
                min={0}
                max={animation.frames - 1}
                value={frame}
                onChange={(e) => {
                  setPlaying(false);
                  setFrame(parseInt(e.target.value));
                }}
              />
              <span className="ie-dim">
                {frame + 1}/{animation.frames}
              </span>
              <span className="ie-sep" />
            </>
          )}
          <button className="ghost icon" onClick={() => zoomBy(1 / 1.25)} aria-label="-">
            −
          </button>
          <button className="ghost" onClick={zoomFit} title={t('canvas.fit')}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="ghost icon" onClick={() => zoomBy(1.25)} aria-label="+">
            +
          </button>
          <span className="ie-sep" />
          {(['checker', 'black', 'white'] as const).map((b) => (
            <button
              key={b}
              className={`ie-swatch s-${b} ${backdrop === b ? 'on' : ''}`}
              onClick={() => setBackdrop(b)}
              title={t(`image.backdrop.${b}`)}
              aria-label={t(`image.backdrop.${b}`)}
            />
          ))}
          <span className="ie-sep" />
          <button
            className="ghost"
            onPointerDown={() => setBefore(true)}
            onPointerUp={() => setBefore(false)}
            onPointerLeave={() => setBefore(false)}
          >
            {t('image.holdOriginal')}
          </button>
        </div>
      </main>

      <aside className="ie-side">
        <div className="ie-controls">
          <h3>{t(`image.tool.${tool}`)}</h3>
          {tool === 'adjust' && (
            <>
              {slider('brightness', -100, 100)}
              {slider('contrast', -100, 100)}
              {slider('saturation', -100, 100)}
              {slider('temperature', -100, 100)}
              {slider('hue', -180, 180, '°')}
              <p className="ie-tip">{t('image.resetTip')}</p>
            </>
          )}
          {tool === 'looks' && (
            <div className="ie-looks">
              {LOOKS.map((l) => (
                <button key={l.id} onClick={() => change(withLook(editsRef.current, l.edits))}>
                  {lookThumbs[l.id] && <img src={lookThumbs[l.id]} alt="" />}
                  <span>{t(`image.look.${l.id}`)}</span>
                </button>
              ))}
            </div>
          )}
          {tool === 'crop' && (
            <>
              <div className="ie-chips">
                {[
                  ['free', null, t('image.aspectFree')],
                  ['box', comp ? comp.width / comp.height : null, t('image.aspectBox')],
                  ['cluster', 1920 / 720, t('image.aspectCluster')],
                  ['16-9', 16 / 9, '16:9'],
                  ['1-1', 1, '1:1'],
                ].map(([id, ratio, label]) => (
                  <button
                    key={id as string}
                    className={aspect.id === id ? 'on' : ''}
                    onClick={() => chooseAspect(id as string, ratio as number | null)}
                  >
                    {label as string}
                  </button>
                ))}
              </div>
              <div className="ie-row">
                <button onClick={() => rotateBy(-90)}>{t('image.rotateLeft')}</button>
                <button onClick={() => rotateBy(90)}>{t('image.rotateRight')}</button>
              </div>
              <div className="ie-row">
                <button
                  className={edits.flipH ? 'active' : ''}
                  onClick={() => change({ flipH: !edits.flipH, crop: undefined })}
                >
                  {t('image.flipH')}
                </button>
                <button
                  className={edits.flipV ? 'active' : ''}
                  onClick={() => change({ flipV: !edits.flipV, crop: undefined })}
                >
                  {t('image.flipV')}
                </button>
              </div>
              <button onClick={() => change({ crop: undefined })} disabled={!edits.crop}>
                {t('image.clearCrop')}
              </button>
              <p className="ie-tip">{t('image.cropTip')}</p>
            </>
          )}
          {tool === 'background' && (
            <>
              <p className="ie-tip">{t('image.keyTip')}</p>
              <button onClick={detectBackground}>{t('image.keyAuto')}</button>
              {edits.colorKey && (
                <>
                  <div className="ie-row ie-keycolor">
                    <span style={{ background: edits.colorKey.color }} />
                    <code>{edits.colorKey.color}</code>
                    <button className="ghost" onClick={() => change({ colorKey: undefined })}>
                      {t('misc.remove')}
                    </button>
                  </div>
                  <Slider
                    label={t('image.tolerance')}
                    value={edits.colorKey.tolerance}
                    min={0}
                    max={100}
                    onStart={remember}
                    onChange={(v) => patch({ colorKey: { ...edits.colorKey!, tolerance: v } })}
                  />
                  <Slider
                    label={t('image.softness')}
                    value={edits.colorKey.softness}
                    min={0}
                    max={100}
                    onStart={remember}
                    onChange={(v) => patch({ colorKey: { ...edits.colorKey!, softness: v } })}
                  />
                  <p className="ie-tip">{t('image.keyTip2')}</p>
                </>
              )}
            </>
          )}
          {tool === 'brush' && (
            <>
              <div className="ie-chips">
                <button
                  className={brush.mode === 'erase' ? 'on' : ''}
                  onClick={() => setBrush({ ...brush, mode: 'erase' })}
                >
                  {t('image.erase')}
                </button>
                <button
                  className={brush.mode === 'restore' ? 'on' : ''}
                  onClick={() => setBrush({ ...brush, mode: 'restore' })}
                >
                  {t('image.restore')}
                </button>
              </div>
              <Slider
                label={t('image.brushSize')}
                value={brush.size}
                min={1}
                max={40}
                reset={8}
                onStart={() => undefined}
                onChange={(v) => setBrush({ ...brush, size: v })}
              />
              <Slider
                label={t('image.hardness')}
                value={brush.hardness}
                min={0}
                max={100}
                reset={70}
                onStart={() => undefined}
                onChange={(v) => setBrush({ ...brush, hardness: v })}
              />
              <button onClick={() => change({ strokes: [] })} disabled={!edits.strokes.length}>
                {t('image.clearBrush')}
              </button>
              <p className="ie-tip">{t('image.brushTip')}</p>
            </>
          )}
          {tool === 'effects' && (
            <>
              {slider('blur', 0, 100)}
              {slider('sharpen', 0, 100)}
              {slider('vignette', 0, 100)}
              {slider('radius', 0, 50)}
              <div className="ie-row">
                <button
                  className={edits.grayscale ? 'active' : ''}
                  onClick={() => change({ grayscale: !edits.grayscale })}
                >
                  {t('image.grayscale')}
                </button>
                <button
                  className={edits.invert ? 'active' : ''}
                  onClick={() => change({ invert: !edits.invert })}
                >
                  {t('image.invert')}
                </button>
              </div>
              <label className="ie-check">
                <input
                  type="checkbox"
                  checked={!!edits.tint}
                  onChange={(e) =>
                    change({
                      tint: e.target.checked ? { color: '$accent', amount: 60 } : undefined,
                    })
                  }
                />
                {t('image.tint')}
              </label>
              {edits.tint && (
                <>
                  <div className="ie-row">
                    <select
                      value={edits.tint.color.startsWith('$') ? edits.tint.color : '#custom'}
                      onChange={(e) =>
                        change({
                          tint: {
                            ...edits.tint!,
                            color:
                              e.target.value === '#custom'
                                ? resolve(edits.tint!.color)
                                : e.target.value,
                          },
                        })
                      }
                    >
                      {Object.keys(palette?.colors ?? {}).map((k) => (
                        <option key={k} value={`$${k}`}>
                          ${k}
                        </option>
                      ))}
                      <option value="#custom">{t('misc.custom')}</option>
                    </select>
                    <input
                      type="color"
                      value={resolve(edits.tint.color).slice(0, 7)}
                      onPointerDown={remember}
                      onChange={(e) => patch({ tint: { ...edits.tint!, color: e.target.value } })}
                    />
                  </div>
                  <Slider
                    label={t('image.tintAmount')}
                    value={edits.tint.amount}
                    min={0}
                    max={100}
                    reset={60}
                    onStart={remember}
                    onChange={(v) => patch({ tint: { ...edits.tint!, amount: v } })}
                  />
                </>
              )}
            </>
          )}
        </div>
        <figure className="ie-cluster">
          <figcaption>{t('image.onCluster')}</figcaption>
          <canvas ref={miniRef} width={640} height={240} />
        </figure>
      </aside>
    </div>
  );
}
