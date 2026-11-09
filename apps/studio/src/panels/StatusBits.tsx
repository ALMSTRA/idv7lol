import { useEffect, useRef, useState } from 'react';
import { RENDERER_LIMITS } from '@idv7lol/theme-engine';
import { useUiStore } from '../store/ui.js';
import { simulator } from '../store/sim.js';
import { useT } from '../i18n/index.js';
import { useValidation } from '../lib/useValidation.js';
import { perf } from '../lib/perf.js';

/*
 * Small pieces that change often. Each subscribes on its own, so a mouse move
 * or a drag updates one number instead of re-rendering the whole window.
 */

export function CursorReadout(): JSX.Element {
  const t = useT();
  const cursor = useUiStore((s) => s.cursor);
  return <span>{cursor ? t('status.cursor', { x: cursor.x, y: cursor.y }) : ''}</span>;
}

export function LayerCount(): JSX.Element {
  const t = useT();
  const report = useValidation();
  return (
    <span>
      {t('validation.layers', { n: report?.layers ?? 0, max: RENDERER_LIMITS.layersPerApp })}
    </span>
  );
}

export function ValidateButton(): JSX.Element {
  const t = useT();
  const report = useValidation();
  const open = useUiStore((s) => s.setBottomTab);
  const errors = report?.errors.length ?? 0;
  const warnings = report?.warnings.length ?? 0;
  return (
    <button onClick={() => open('validation')} className={errors ? 'danger' : ''}>
      ✓ {t('menu.validate')}
      {report && (
        <span className={`badge ${errors ? 'error' : warnings ? 'warning' : 'ok'}`}>
          {errors || warnings || '✓'}
        </span>
      )}
    </button>
  );
}

export function ValidationTabBadge(): JSX.Element | null {
  const report = useValidation();
  const errors = report?.errors.length ?? 0;
  const warnings = report?.warnings.length ?? 0;
  return errors || warnings ? (
    <span className={`badge ${errors ? 'error' : 'warning'}`}>{errors || warnings}</span>
  ) : null;
}

/** Frame rate, draw time and signal health, written straight to the DOM twice a second. */
export function LiveStats(): JSX.Element {
  const t = useT();
  const ref = useRef<HTMLSpanElement>(null);
  const [label] = useState(() => t('sim.health'));
  useEffect(() => {
    let frames = perf.frames;
    let ms = perf.renderMs;
    let at = performance.now();
    const h = setInterval(() => {
      const now = performance.now();
      const f = perf.frames - frames;
      const fps = Math.round((f * 1000) / (now - at));
      const draw = f ? (perf.renderMs - ms) / f : 0;
      frames = perf.frames;
      ms = perf.renderMs;
      at = now;
      if (ref.current)
        ref.current.textContent = `${fps} fps · ${draw.toFixed(1)} ms · ${label} ${Math.round(simulator.bus.number('system.signal.health', 0))}%`;
    }, 500);
    return () => clearInterval(h);
  }, [label]);
  return <span ref={ref} title="Frames per second and time spent drawing each frame" />;
}
