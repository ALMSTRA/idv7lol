import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  CarFront,
  Grid3x3,
  Group,
  Info,
  Magnet,
  Minus,
  Pause,
  Play,
  Plus,
  Ruler,
  Shield,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CarPreview } from '../preview/CarPreview.js';
import { usePiecesStore } from '../lib/savedPieces.js';
import type { Component, Theme } from '@idv7lol/theme-schema';
import {
  EngineState,
  ThemeEngine,
  drawZones,
  flattenComponents,
  findComponent,
  hitTest,
  type FlatComponent,
} from '@idv7lol/theme-engine';
import { useProjectStore } from '../store/project.js';
import { useUiStore } from '../store/ui.js';
import { simulator, useSimStore } from '../store/sim.js';
import { libraryEntry } from '../lib/componentLibrary.js';
import { placeLibraryEntry } from '../lib/libraryActions.js';
import { useT } from '../i18n/index.js';
import { perf } from '../lib/perf.js';
import { openCanvasMenu } from '../lib/contextMenus.js';
import { useShallow } from 'zustand/react/shallow';
import { imageFilesOf, imageResolver } from '../lib/imageStore.js';
import { importAndPlace } from '../lib/imageActions.js';
import {
  CURSORS,
  HANDLE_SIZE,
  fitView,
  handlePositions,
  hitHandle,
  marqueeSelect,
  normalizeRect,
  resizeRect,
  scaleItems,
  type ScaleItem,
  selectionGeometry,
  snapBox,
  toLayout,
  toScreen,
  type Guide,
  type HandleId,
  type Rect,
  type View,
} from './view.js';

export const engine = new ThemeEngine(new EngineState(simulator.bus, performance.now()));

type Mode =
  | { kind: 'idle' }
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | {
      kind: 'move';
      sx: number;
      sy: number;
      start: Map<string, { x: number; y: number }>;
      bbox: Rect;
      moved: boolean;
    }
  | { kind: 'resize'; handle: HandleId; sx: number; sy: number; id: string; start: Rect }
  | {
      kind: 'resize-many';
      handle: HandleId;
      sx: number;
      sy: number;
      bbox: Rect;
      items: ScaleItem[];
    }
  | {
      kind: 'rotate';
      id: string;
      cx: number;
      cy: number;
      startAngle: number;
      startRotation: number;
    }
  | { kind: 'marquee'; sx: number; sy: number; ex: number; ey: number; additive: boolean };

const RULER = 20;

function applyRects(
  theme: Theme,
  rects: Map<string, Partial<Rect> & { rotation?: number }>,
): Theme {
  const walk = (list: Component[]): Component[] =>
    list.map((c) => {
      const r = rects.get(c.id);
      let out = c;
      if (r)
        out = {
          ...c,
          ...(r.x !== undefined ? { x: r.x } : {}),
          ...(r.y !== undefined ? { y: r.y } : {}),
          ...(r.width !== undefined ? { width: r.width } : {}),
          ...(r.height !== undefined ? { height: r.height } : {}),
          ...(r.rotation !== undefined ? { rotation: r.rotation } : {}),
        } as Component;
      if (out.type === 'group')
        out = { ...out, props: { ...out.props, children: walk(out.props.children) } };
      return out;
    });
  return { ...theme, components: walk(theme.components) };
}

export function CanvasView(): JSX.Element {
  perf.canvasRenders += 1;
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ zoom: 0.5, panX: 40, panY: 40 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const modeRef = useRef<Mode>({ kind: 'idle' });
  const guidesRef = useRef<Guide[]>([]);
  const spaceRef = useRef(false);
  const [cursor, setCursor] = useState('default');
  const fittedFor = useRef<string | null>(null);
  const bgFor = useRef({ scheme: '', color: '#0a0b0e' });
  const [fileDrag, setFileDrag] = useState(0);

  const themeId = useProjectStore((s) => s.theme.id);
  const selection = useProjectStore((s) => s.selection);
  const ui = useUiStore(
    useShallow((s) => ({
      showZones: s.showZones,
      showGrid: s.showGrid,
      snap: s.snap,
      showRulers: s.showRulers,
      carPreview: s.carPreview,
      toggle: s.toggle,
    })),
  );
  const running = useSimStore((s) => s.running);
  const editingText = useUiStore((s) => s.editingText);

  // Read at use, so edits and drags never re-render this component.
  const themeRef = useMemo(
    () => ({
      get current() {
        return useProjectStore.getState().theme;
      },
    }),
    [],
  );
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    setView(fitView(themeRef.current, el.clientWidth, el.clientHeight));
  }, []);

  // Fit when a different theme is loaded.
  useEffect(() => {
    if (fittedFor.current !== themeId) {
      fittedFor.current = themeId;
      fit();
    }
  }, [themeId, fit]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // keep the layout centred on resize when it was fitted
      if (fittedFor.current === themeRef.current.id) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Expose a fit action for the toolbar/keyboard.
  useEffect(() => {
    (window as unknown as { __idv7fit?: () => void }).__idv7fit = fit;
  }, [fit]);

  /* ----- render loop ----- */
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const now = performance.now();
      if (useSimStore.getState().running) simulator.tick(now);
      const frameStart = now;
      const v = viewRef.current;
      const th = themeRef.current;
      const uiState = useUiStore.getState();
      engine.state.manualPalette = uiState.previewPalette;

      // Nothing to draw behind the full-window image editor.
      if (uiState.imageEditorFor) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (bgFor.current.scheme !== uiState.scheme) {
        bgFor.current = {
          scheme: uiState.scheme,
          color: getComputedStyle(wrap).getPropertyValue('--canvas-bg') || '#0a0b0e',
        };
      }
      ctx.fillStyle = bgFor.current.color;
      ctx.fillRect(0, 0, W, H);

      // layout shadow + content
      ctx.save();
      ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 24 / v.zoom;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, th.layout.width, th.layout.height);
      ctx.shadowBlur = 0;
      if (uiState.carPreview) {
        // The car's engine draws underneath (CarPreview); leave the layout see-through.
        ctx.clearRect(0, 0, th.layout.width, th.layout.height);
        if (uiState.showZones) drawZones(ctx, th);
      } else {
        engine.render(ctx, th, now, {
          images: imageResolver,
          showReservedZones: uiState.showZones,
          showBounds: uiState.showBounds,
          // a selected alert shows whatever its condition, so it can be designed
          showAlert: selectedAlert(th, useProjectStore.getState().selection),
        });
      }
      ctx.restore();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawOverlays(
        ctx,
        W,
        H,
        v,
        th,
        uiState.showGrid ? uiState.gridSize : 0,
        uiState.showRulers,
        selectionRef.current,
        useProjectStore.getState().hover,
        modeRef.current,
        guidesRef.current,
      );
      perf.frames += 1;
      perf.renderMs += performance.now() - frameStart;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ----- pointer handling ----- */
  const screenPoint = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const { sx, sy } = screenPoint(e);
    const v = viewRef.current;
    const store = useProjectStore.getState();
    if (e.button === 1 || spaceRef.current || (e.button === 0 && e.altKey)) {
      modeRef.current = { kind: 'pan', sx, sy, panX: v.panX, panY: v.panY };
      setCursor('grabbing');
      return;
    }
    if (e.button !== 0) return;
    const th = themeRef.current;
    const sel = selectionRef.current;
    const geo = selectionGeometry(th, sel);
    // handles
    if (geo.bbox && sel.length) {
      const h = hitHandle(v, geo.bbox, sx, sy);
      if (h) {
        const single = sel.length === 1 ? geo.items[0] : undefined;
        if (h === 'rotate') {
          if (!single) return;
          const c = single.component;
          const centre = toScreen(v, single.absX + c.width / 2, single.absY + c.height / 2);
          const startAngle = (Math.atan2(sy - centre.y, sx - centre.x) * 180) / Math.PI;
          store.beginTxn();
          modeRef.current = {
            kind: 'rotate',
            id: c.id,
            cx: centre.x,
            cy: centre.y,
            startAngle,
            startRotation: c.rotation,
          };
          return;
        }
        if (!single) {
          // Several components: scale them together inside the selection box.
          // A child whose group is also selected moves with the group.
          const ids = new Set(sel);
          const items: ScaleItem[] = geo.items
            .filter((it) => !it.component.locked && !it.parents.some((p) => ids.has(p)))
            .map((it) => ({
              id: it.component.id,
              absX: it.absX,
              absY: it.absY,
              x: it.component.x,
              y: it.component.y,
              width: it.component.width,
              height: it.component.height,
            }));
          if (!items.length) return;
          store.beginTxn();
          modeRef.current = { kind: 'resize-many', handle: h, sx, sy, bbox: geo.bbox, items };
          return;
        }
        if (single && !single.component.locked) {
          store.beginTxn();
          modeRef.current = {
            kind: 'resize',
            handle: h,
            sx,
            sy,
            id: single.component.id,
            start: {
              x: single.component.x,
              y: single.component.y,
              width: single.component.width,
              height: single.component.height,
            },
          };
          return;
        }
      }
    }
    const p = toLayout(v, sx, sy);
    const hit = hitTest(th, p.x, p.y, { respectLocks: true });
    if (hit) {
      const id = hit.component.id;
      let newSel = sel;
      if (e.shiftKey) {
        store.select([id], true);
        newSel = useProjectStore.getState().selection;
      } else if (!sel.includes(id)) {
        store.select([id]);
        newSel = [id];
      }
      const items = selectionGeometry(th, newSel).items;
      const start = new Map<string, { x: number; y: number }>();
      for (const it of items)
        if (!it.component.locked)
          start.set(it.component.id, { x: it.component.x, y: it.component.y });
      const bbox = selectionGeometry(th, [...start.keys()]).bbox ?? {
        x: p.x,
        y: p.y,
        width: 0,
        height: 0,
      };
      store.beginTxn();
      modeRef.current = { kind: 'move', sx, sy, start, bbox, moved: false };
      return;
    }
    if (!e.shiftKey) store.select([]);
    modeRef.current = { kind: 'marquee', sx, sy, ex: sx, ey: sy, additive: e.shiftKey };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = screenPoint(e);
    const v = viewRef.current;
    const store = useProjectStore.getState();
    const th = themeRef.current;
    const m = modeRef.current;
    const p = toLayout(v, sx, sy);
    useUiStore.getState().setCursor({ x: Math.round(p.x), y: Math.round(p.y) });
    switch (m.kind) {
      case 'idle': {
        const sel = selectionRef.current;
        const geo = selectionGeometry(th, sel);
        const h = geo.bbox && sel.length ? hitHandle(v, geo.bbox, sx, sy) : null;
        if (h) setCursor(CURSORS[h]);
        else {
          const hit = hitTest(th, p.x, p.y, { respectLocks: true });
          store.setHover(hit?.component.id ?? null);
          setCursor(hit ? 'move' : spaceRef.current ? 'grab' : 'default');
        }
        return;
      }
      case 'pan':
        setView({ ...v, panX: m.panX + (sx - m.sx), panY: m.panY + (sy - m.sy) });
        return;
      case 'move': {
        let dx = (sx - m.sx) / v.zoom;
        let dy = (sy - m.sy) / v.zoom;
        if (!m.moved && Math.hypot(sx - m.sx, sy - m.sy) < 3) return;
        m.moved = true;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const uiState = useUiStore.getState();
        guidesRef.current = [];
        if (uiState.snap && !e.ctrlKey) {
          const moving = { ...m.bbox, x: m.bbox.x + dx, y: m.bbox.y + dy };
          const others = flattenComponents(th.components)
            .filter((f) => !m.start.has(f.component.id) && f.component.type !== 'group')
            .map((f) => ({
              x: f.absX,
              y: f.absY,
              width: f.component.width,
              height: f.component.height,
            }));
          const snap = snapBox(
            moving,
            others,
            th.layout,
            6 / v.zoom,
            uiState.showGrid ? uiState.gridSize : null,
          );
          dx += snap.dx;
          dy += snap.dy;
          guidesRef.current = snap.guides;
        }
        const rects = new Map<string, Partial<Rect>>();
        for (const [id, s] of m.start)
          rects.set(id, { x: Math.round(s.x + dx), y: Math.round(s.y + dy) });
        store.setTheme(applyRects(th, rects), false);
        return;
      }
      case 'resize': {
        const dx = (sx - m.sx) / v.zoom;
        const dy = (sy - m.sy) / v.zoom;
        // Pictures keep their proportions unless Shift is held; other components the reverse.
        const isImage = findComponent(th.components, m.id)?.type === 'image';
        const r = resizeRect(m.start, m.handle, dx, dy, isImage ? !e.shiftKey : e.shiftKey);
        const uiState = useUiStore.getState();
        if (uiState.snap && uiState.showGrid && !e.ctrlKey) {
          const g = uiState.gridSize;
          if (m.handle.includes('e'))
            r.width = Math.max(4, Math.round((r.x + r.width) / g) * g - r.x);
          if (m.handle.includes('s'))
            r.height = Math.max(4, Math.round((r.y + r.height) / g) * g - r.y);
        }
        store.setTheme(applyRects(th, new Map([[m.id, r]])), false);
        return;
      }
      case 'resize-many': {
        const dx = (sx - m.sx) / v.zoom;
        const dy = (sy - m.sy) / v.zoom;
        // Proportions stay unless Shift is held, as with pictures.
        const box = resizeRect(m.bbox, m.handle, dx, dy, !e.shiftKey);
        store.setTheme(applyRects(th, scaleItems(m.bbox, box, m.items)), false);
        return;
      }
      case 'rotate': {
        const a = (Math.atan2(sy - m.cy, sx - m.cx) * 180) / Math.PI;
        let rot = m.startRotation + (a - m.startAngle);
        if (e.shiftKey) rot = Math.round(rot / 15) * 15;
        rot = Math.round(rot * 10) / 10;
        if (rot > 180) rot -= 360;
        if (rot < -180) rot += 360;
        store.setTheme(applyRects(th, new Map([[m.id, { rotation: rot }]])), false);
        return;
      }
      case 'marquee':
        m.ex = sx;
        m.ey = sy;
        return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const m = modeRef.current;
    const store = useProjectStore.getState();
    const v = viewRef.current;
    if (m.kind === 'marquee') {
      const a = toLayout(v, m.sx, m.sy);
      const b = toLayout(v, m.ex, m.ey);
      const r = normalizeRect(a.x, a.y, b.x, b.y);
      if (r.width > 2 || r.height > 2) store.select(marqueeSelect(themeRef.current, r), m.additive);
    } else if (
      m.kind === 'move' ||
      m.kind === 'resize' ||
      m.kind === 'resize-many' ||
      m.kind === 'rotate'
    ) {
      store.endTxn();
    }
    guidesRef.current = [];
    modeRef.current = { kind: 'idle' };
    setCursor(spaceRef.current ? 'grab' : 'default');
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const { sx, sy } = screenPoint(e);
    const v = viewRef.current;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const zoom = Math.max(0.05, Math.min(6, v.zoom * factor));
      const lp = toLayout(v, sx, sy);
      setView({ zoom, panX: sx - lp.x * zoom, panY: sy - lp.y * zoom });
      fittedFor.current = null;
    } else {
      const dx = e.shiftKey ? e.deltaY : e.deltaX;
      const dy = e.shiftKey ? 0 : e.deltaY;
      setView({ ...v, panX: v.panX - dx, panY: v.panY - dy });
      fittedFor.current = null;
    }
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        spaceRef.current = true;
        if (modeRef.current.kind === 'idle') setCursor('grab');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        if (modeRef.current.kind === 'idle') setCursor('default');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { sx, sy } = screenPoint(e);
    const p = toLayout(viewRef.current, sx, sy);
    // Locked components are included so they can be unlocked from here.
    const hit = hitTest(themeRef.current, p.x, p.y);
    openCanvasMenu(
      e.clientX,
      e.clientY,
      { x: Math.round(p.x), y: Math.round(p.y) },
      hit?.component.id,
    );
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const { sx, sy } = screenPoint(e);
    const p = toLayout(viewRef.current, sx, sy);
    const hit = hitTest(themeRef.current, p.x, p.y, { respectLocks: true });
    if (hit?.component.type === 'image') useUiStore.getState().setImageEditorFor(hit.component.id);
    if (hit?.component.type === 'text') {
      useProjectStore.getState().select([hit.component.id]);
      useUiStore.getState().setEditingText(hit.component.id);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setFileDrag(0);
    const { sx: dropX, sy: dropY } = screenPoint(e);
    const dropAt = toLayout(viewRef.current, dropX, dropY);
    const files = imageFilesOf(e.dataTransfer.files);
    if (files.length) {
      void importAndPlace(files, { x: Math.round(dropAt.x), y: Math.round(dropAt.y) });
      return;
    }
    const assetId = e.dataTransfer.getData('application/x-idv7lol-asset');
    if (assetId) {
      useProjectStore
        .getState()
        .placeAsset(assetId, { x: Math.round(dropAt.x), y: Math.round(dropAt.y) });
      return;
    }
    const piece = e.dataTransfer.getData('application/x-idv7lol-piece');
    if (piece) {
      usePiecesStore.getState().insert(piece, { x: Math.round(dropAt.x), y: Math.round(dropAt.y) });
      return;
    }
    const id = e.dataTransfer.getData('application/x-idv7lol-library');
    if (!id) return;
    const entry = libraryEntry(id);
    if (!entry) return;
    const { sx, sy } = screenPoint(e);
    const p = toLayout(viewRef.current, sx, sy);
    placeLibraryEntry(entry, { x: Math.round(p.x), y: Math.round(p.y) });
  };

  const zoomTo = (z: number) => {
    const el = wrapRef.current!;
    const v = viewRef.current;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    const lp = toLayout(v, cx, cy);
    setView({ zoom: z, panX: cx - lp.x * z, panY: cy - lp.y * z });
    fittedFor.current = null;
  };

  const zoomPct = useMemo(() => Math.round(view.zoom * 100), [view.zoom]);
  const multi = selection.length > 1;

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) setFileDrag((n) => n + 1);
      }}
      onDragLeave={(e) => {
        if (e.dataTransfer.types.includes('Files')) setFileDrag((n) => Math.max(0, n - 1));
      }}
      onDrop={onDrop}
    >
      {ui.carPreview && <CarPreview view={view} editorEngine={engine} />}
      {editingText && <TextEditor id={editingText} view={view} />}
      <canvas
        ref={canvasRef}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />
      <div className="canvas-toolbar">
        <button
          className={`icon ${ui.showZones ? 'active' : ''}`}
          title={t('canvas.zones')}
          onClick={() => ui.toggle('showZones')}
        >
          <Shield size={15} />
        </button>
        <button
          className={`icon ${ui.showGrid ? 'active' : ''}`}
          title={t('canvas.grid')}
          onClick={() => ui.toggle('showGrid')}
        >
          <Grid3x3 size={15} />
        </button>
        <button
          className={`icon ${ui.snap ? 'active' : ''}`}
          title={t('canvas.snap')}
          onClick={() => ui.toggle('snap')}
        >
          <Magnet size={15} />
        </button>
        <button
          className={`icon ${ui.showRulers ? 'active' : ''}`}
          title={t('canvas.rulers')}
          onClick={() => ui.toggle('showRulers')}
        >
          <Ruler size={15} />
        </button>
        <button
          className={`icon ${ui.carPreview ? 'active' : ''}`}
          title={t('canvas.carPreview')}
          onClick={() => ui.toggle('carPreview')}
        >
          <CarFront size={15} />
        </button>
        <span className="sep" style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        <button
          className="icon"
          title={t('canvas.alignLeft')}
          disabled={!selection.length}
          onClick={() => useProjectStore.getState().align('left')}
        >
          <AlignStartVertical size={15} />
        </button>
        <button
          className="icon"
          title={t('canvas.alignCenter')}
          disabled={!selection.length}
          onClick={() => useProjectStore.getState().align('center')}
        >
          <AlignCenterVertical size={15} />
        </button>
        <button
          className="icon"
          title={t('canvas.alignRight')}
          disabled={!selection.length}
          onClick={() => useProjectStore.getState().align('right')}
        >
          <AlignEndVertical size={15} />
        </button>
        <button
          className="icon"
          title={t('canvas.alignTop')}
          disabled={!selection.length}
          onClick={() => useProjectStore.getState().align('top')}
        >
          <AlignStartHorizontal size={15} />
        </button>
        <button
          className="icon"
          title={t('canvas.alignMiddle')}
          disabled={!selection.length}
          onClick={() => useProjectStore.getState().align('middle')}
        >
          <AlignCenterHorizontal size={15} />
        </button>
        <button
          className="icon"
          title={t('canvas.alignBottom')}
          disabled={!selection.length}
          onClick={() => useProjectStore.getState().align('bottom')}
        >
          <AlignEndHorizontal size={15} />
        </button>
        <button
          className="icon"
          title={t('canvas.distributeH')}
          disabled={selection.length < 3}
          onClick={() => useProjectStore.getState().distribute('h')}
        >
          <AlignHorizontalDistributeCenter size={15} />
        </button>
        <button
          className="icon"
          title={t('canvas.distributeV')}
          disabled={selection.length < 3}
          onClick={() => useProjectStore.getState().distribute('v')}
        >
          <AlignVerticalDistributeCenter size={15} />
        </button>
        {multi && (
          <button
            className="icon"
            title={t('layers.group')}
            onClick={() => useProjectStore.getState().groupSelected()}
          >
            <Group size={15} />
          </button>
        )}
      </div>
      <div className="canvas-zoom">
        <button className="icon" onClick={() => zoomTo(view.zoom / 1.25)}>
          <Minus size={15} />
        </button>
        <span style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
          {zoomPct}%
        </span>
        <button className="icon" onClick={() => zoomTo(view.zoom * 1.25)}>
          <Plus size={15} />
        </button>
        <button onClick={fit}>{t('canvas.fit')}</button>
        <span className="canvas-info" title={t('canvas.note')}>
          <Info size={14} />
        </span>
        <button
          className={`icon ${running ? 'active' : ''}`}
          title={t('menu.simulate')}
          onClick={() => useSimStore.getState().setRunning(!running)}
        >
          {running ? <Pause size={15} /> : <Play size={15} />}
        </button>
      </div>
      {fileDrag > 0 && <div className="canvas-dropzone">{t('image.drop')}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  v: View,
  theme: Theme,
  grid: number,
  rulers: boolean,
  selection: string[],
  hover: string | null,
  mode: Mode,
  guides: Guide[],
): void {
  const accent = '#3f8cff';
  // grid
  if (grid > 0 && grid * v.zoom >= 6) {
    ctx.save();
    ctx.beginPath();
    const o = toScreen(v, 0, 0);
    const e = toScreen(v, theme.layout.width, theme.layout.height);
    ctx.rect(o.x, o.y, e.x - o.x, e.y - o.y);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= theme.layout.width; x += grid) {
      const sx = Math.round(toScreen(v, x, 0).x) + 0.5;
      ctx.moveTo(sx, o.y);
      ctx.lineTo(sx, e.y);
    }
    for (let y = 0; y <= theme.layout.height; y += grid) {
      const sy = Math.round(toScreen(v, 0, y).y) + 0.5;
      ctx.moveTo(o.x, sy);
      ctx.lineTo(e.x, sy);
    }
    ctx.stroke();
    ctx.restore();
  }
  // hover
  const flat = flattenComponents(theme.components);
  const byId = new Map<string, FlatComponent>(flat.map((f) => [f.component.id, f]));
  if (hover && !selection.includes(hover)) {
    const f = byId.get(hover);
    if (f) strokePoly(ctx, v, f, 'rgba(63,140,255,0.6)', 1);
  }
  // selection
  const geo = selectionGeometry(theme, selection);
  for (const it of geo.items) strokePoly(ctx, v, it, accent, 1.5);
  if (geo.bbox && selection.length) {
    const tl = toScreen(v, geo.bbox.x, geo.bbox.y);
    const br = toScreen(v, geo.bbox.x + geo.bbox.width, geo.bbox.y + geo.bbox.height);
    if (selection.length > 1) {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x, br.y - tl.y);
      ctx.setLineDash([]);
    }
    const single = selection.length === 1 ? geo.items[0] : undefined;
    for (const h of handlePositions(v, geo.bbox)) {
      if (h.id === 'rotate') {
        if (!single) continue;
        ctx.beginPath();
        ctx.moveTo((tl.x + br.x) / 2, tl.y);
        ctx.lineTo(h.x, h.y + 6);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        continue;
      }
      if (single?.component.locked) continue;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(
        h.x - HANDLE_SIZE / 2 + 0.5,
        h.y - HANDLE_SIZE / 2 + 0.5,
        HANDLE_SIZE - 1,
        HANDLE_SIZE - 1,
      );
    }
    // size label
    if (mode.kind === 'move' || mode.kind === 'resize' || mode.kind === 'resize-many') {
      const label =
        mode.kind === 'move'
          ? `${Math.round(geo.bbox.x)}, ${Math.round(geo.bbox.y)}`
          : `${Math.round(geo.bbox.width)} × ${Math.round(geo.bbox.height)}`;
      ctx.font = '11px system-ui, sans-serif';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(20,24,32,0.9)';
      ctx.fillRect(br.x - w, br.y + 6, w, 18);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(label, br.x - w + 5, br.y + 15);
    }
  }
  // guides
  if (guides.length) {
    ctx.strokeStyle = '#ff4fd8';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    for (const g of guides) {
      ctx.beginPath();
      if (g.axis === 'x') {
        const x = Math.round(toScreen(v, g.pos, 0).x) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      } else {
        const y = Math.round(toScreen(v, 0, g.pos).y) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // marquee
  if (mode.kind === 'marquee') {
    const r = normalizeRect(mode.sx, mode.sy, mode.ex, mode.ey);
    ctx.fillStyle = 'rgba(63,140,255,0.12)';
    ctx.fillRect(r.x, r.y, r.width, r.height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.width, r.height);
  }
  // rulers
  if (rulers) drawRulers(ctx, W, H, v, theme);
}

function strokePoly(
  ctx: CanvasRenderingContext2D,
  v: View,
  f: FlatComponent & { corners?: Array<{ x: number; y: number }> },
  color: string,
  width: number,
): void {
  const corners =
    f.corners ??
    selectionGeometry({ components: [f.component] } as Theme, [f.component.id]).items[0]?.corners ??
    [];
  if (!corners.length) return;
  ctx.beginPath();
  corners.forEach((p, i) => {
    const s = toScreen(v, p.x, p.y);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawRulers(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  v: View,
  theme: Theme,
): void {
  ctx.save();
  // Follow the app's light or dark scheme.
  const light = document.documentElement.dataset['theme'] === 'light';
  ctx.fillStyle = light ? 'rgba(244,246,249,0.95)' : 'rgba(20,23,30,0.92)';
  ctx.fillRect(0, 0, W, RULER);
  ctx.fillRect(0, 0, RULER, H);
  ctx.strokeStyle = light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
  ctx.fillStyle = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.lineWidth = 1;
  const step = v.zoom > 1.5 ? 50 : v.zoom > 0.6 ? 100 : v.zoom > 0.3 ? 200 : 500;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let x = 0; x <= theme.layout.width; x += step) {
    const sx = Math.round(toScreen(v, x, 0).x) + 0.5;
    if (sx < RULER || sx > W) continue;
    ctx.beginPath();
    ctx.moveTo(sx, RULER - 6);
    ctx.lineTo(sx, RULER);
    ctx.stroke();
    ctx.fillText(String(x), sx + 2, 2);
  }
  for (let y = 0; y <= theme.layout.height; y += step) {
    const sy = Math.round(toScreen(v, 0, y).y) + 0.5;
    if (sy < RULER || sy > H) continue;
    ctx.beginPath();
    ctx.moveTo(RULER - 6, sy);
    ctx.lineTo(RULER, sy);
    ctx.stroke();
    ctx.save();
    ctx.translate(2, sy + 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.fillText(String(y), 0, 0);
    ctx.restore();
  }
  ctx.fillStyle = light ? 'rgba(244,246,249,1)' : 'rgba(20,23,30,1)';
  ctx.fillRect(0, 0, RULER, RULER);
  ctx.restore();
}

/** Render the theme at 1:1 into a fresh canvas (for PNG export and thumbnails). */
export function renderToCanvas(theme: Theme, scale = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(theme.layout.width * scale);
  canvas.height = Math.round(theme.layout.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  engine.render(ctx, theme, performance.now(), { images: imageResolver });
  return canvas;
}

/** In-place editor for a text component, laid over it on the canvas. */
function TextEditor({ id, view }: { id: string; view: View }): JSX.Element | null {
  const theme = useProjectStore((s) => s.theme);
  const close = () => useUiStore.getState().setEditingText(null);
  const flat = flattenComponents(theme.components).find((f) => f.component.id === id);
  const c = flat?.component;
  const [value, setValue] = useState(c?.type === 'text' ? c.props.text : '');
  const done = useRef(false);
  if (!flat || c?.type !== 'text') return null;
  const tl = toScreen(view, flat.absX, flat.absY);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    if (value !== c.props.text) useProjectStore.getState().updateProps(id, { text: value });
    close();
  };
  return (
    <input
      className="canvas-text-edit"
      autoFocus
      maxLength={200}
      value={value}
      style={{
        left: tl.x,
        top: tl.y,
        width: Math.max(80, c.width * view.zoom),
        height: Math.max(22, c.height * view.zoom),
        fontSize: Math.max(11, Math.min(48, c.height * view.zoom * 0.55)),
        transform: c.rotation ? `rotate(${c.rotation}deg)` : undefined,
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          done.current = true;
          close();
        }
      }}
    />
  );
}

/** The alert selected on its own, if any: the canvas shows it whatever its condition. */
function selectedAlert(theme: Theme, selection: readonly string[]): string | undefined {
  if (selection.length !== 1) return undefined;
  const c = findComponent(theme.components, selection[0]!);
  return c?.type === 'alert' ? c.id : undefined;
}
