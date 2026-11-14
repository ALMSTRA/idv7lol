import { useEffect, useRef, useState } from 'react';
import type { CompiledTheme } from '@idv7lol/theme-compiler';
import { selectPaletteId } from '@idv7lol/theme-engine';
import type { Theme } from '@idv7lol/theme-schema';
import { useProjectStore } from '../store/project.js';
import { simulator } from '../store/sim.js';
import { useT } from '../i18n/index.js';
import { compileForCar, loadBakedFont, type BakedFont } from '../lib/carCompile.js';
import type { View } from '../canvas/view.js';
import { carEngineClass, carStripY, type CarEngine } from './carModules.js';
import { WebGLClusterClient } from './webglClient.js';
import type { ThemeEngine } from '@idv7lol/theme-engine';

type Status =
  { kind: 'compiling' } | { kind: 'ok'; layers: number } | { kind: 'error'; message: string };

const COMPILE_DELAY_MS = 350;

/**
 * The layout drawn by the car app's engine and shaders. It sits under the
 * editor canvas, which keeps drawing the selection, guides and rulers on top.
 */
export function CarPreview({
  view,
  editorEngine,
}: {
  view: View;
  editorEngine: ThemeEngine;
}): JSX.Element {
  const t = useT();
  const theme = useProjectStore((s) => s.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef<{
    client: WebGLClusterClient;
    engine: CarEngine | null;
    source: Theme;
    compiled: CompiledTheme | null;
    images: Map<string, Uint8Array>;
  } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'compiling' });
  const { width, height } = theme.layout;

  // WebGL client and draw loop, for as long as the preview is open.
  useEffect(() => {
    const canvas = canvasRef.current!;
    let client: WebGLClusterClient;
    try {
      client = new WebGLClusterClient(canvas, width, height, () => Date.now());
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
      return;
    }
    live.current = {
      client,
      engine: null,
      source: useProjectStore.getState().theme,
      compiled: null,
      images: new Map(),
    };
    if (import.meta.env.DEV) (window as unknown as { __carPreview?: unknown }).__carPreview = live;
    let raf = 0;
    let shownCount = -1;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const l = live.current;
      if (!l?.engine) return;
      try {
        l.engine.tick();
      } catch (e) {
        console.warn('car engine tick', e);
      }
      client.draw();
      // The engine builds on its first tick, so the count is read here.
      if (client.layerCount !== shownCount) {
        shownCount = client.layerCount;
        setStatus((st) => (st.kind === 'ok' ? { kind: 'ok', layers: shownCount } : st));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      live.current?.engine?.setShown(false);
      client.dispose();
      live.current = null;
    };
  }, [width, height]);

  // Recompile shortly after the theme stops changing.
  useEffect(() => {
    let cancelled = false;
    setStatus((s) => (s.kind === 'ok' ? s : { kind: 'compiling' }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await compileForCar(theme);
          if (cancelled || !live.current) return;
          const compiled = result.compiled;
          if (!compiled) {
            const first = result.report.errors[0];
            setStatus({ kind: 'error', message: first ? first.message : 'compile failed' });
            return;
          }
          const fonts: Record<string, BakedFont> = {};
          for (const fam of compiled.fonts) {
            const f = await loadBakedFont(fam);
            if (f) fonts[fam] = f;
          }
          if (cancelled || !live.current) return;
          const l = live.current;
          l.images = new Map(
            result.files
              .filter((f) => typeof f.data !== 'string' && f.path.startsWith('images/'))
              .map((f) => [f.path, f.data as Uint8Array]),
          );
          l.source = theme;
          l.compiled = compiled;
          if (!l.engine) {
            const Engine = carEngineClass();
            l.engine = new Engine({
              client: l.client,
              log: { info: () => undefined, warn: (m: string) => console.warn('car engine:', m) },
              theme: compiled,
              fonts,
              signals: {
                // The simulator keeps its own clock; the preview treats every sample as fresh.
                get: (id: string) => {
                  const s = simulator.bus.get(id);
                  return s ? { value: s.value, valid: s.valid, at: Date.now() } : undefined;
                },
              },
              enabled: () => true,
              live: () => true,
              sweep: () => false,
              now: () => Date.now(),
              utcOffsetMinutes: () => -new Date().getTimezoneOffset(),
              paletteId: () => {
                const cur = live.current;
                const id = cur ? selectPaletteId(cur.source, editorEngine.state) : '';
                return cur?.compiled?.palettes[id]
                  ? id
                  : (cur?.compiled?.paletteSelection.default ?? id);
              },
              loadImage: (img: { file: string }) => live.current?.images.get(img.file) ?? null,
              // As the car app draws by default: cut at the cluster's own bottom strip.
              stripY: () => carStripY(),
            });
          } else {
            l.engine.setTheme(compiled, fonts);
          }
          const st = l.engine.status();
          setStatus(
            st.failed
              ? { kind: 'error', message: 'the car engine could not build this layout' }
              : l.client.errors.length
                ? { kind: 'error', message: l.client.errors[l.client.errors.length - 1]! }
                : { kind: 'ok', layers: st.layers },
          );
        } catch (e) {
          if (!cancelled) setStatus({ kind: 'error', message: (e as Error).message });
        }
      })();
    }, COMPILE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [theme, editorEngine]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="car-preview"
        width={width}
        height={height}
        style={{
          left: view.panX,
          top: view.panY,
          width: width * view.zoom,
          height: height * view.zoom,
        }}
      />
      <div className={`car-preview-status ${status.kind}`}>
        {status.kind === 'ok'
          ? t('canvas.carPreviewOn', { n: status.layers })
          : status.kind === 'compiling'
            ? t('canvas.carPreviewCompiling')
            : t('canvas.carPreviewFailed', { error: status.message })}
      </div>
    </>
  );
}
