import { useEffect, useRef } from 'react';
import type { Theme } from '@idv7lol/theme-schema';
import { EngineState, ThemeEngine } from '@idv7lol/theme-engine';
import { SignalBus } from '@idv7lol/vehicle-signals';
import { TEMPLATES, blankTemplate } from '../lib/templates.js';
import { useT } from '../i18n/index.js';
import { isTauri, recentFiles } from '../host/files.js';

const thumbBus = new SignalBus();
thumbBus.set('vehicle.speed', 112);
thumbBus.set('engine.rpm', 4300);
thumbBus.set('transmission.gear', '4');
thumbBus.set('transmission.mode', 'S');
thumbBus.set('fuel.level', 62);
thumbBus.set('engine.oil.temp', 96);
thumbBus.set('engine.coolant.temp', 90);
thumbBus.set('engine.boost', 0.8);
thumbBus.set('vehicle.range', 410);
thumbBus.set('electrical.battery.voltage', 14.1);
thumbBus.set('environment.outside.temp', 18.5);
thumbBus.set('drive.mode', 'COMFORT');
thumbBus.set('vehicle.odometer', 48213);
thumbBus.set('fuel.consumption.average', 7.4);
const thumbEngine = new ThemeEngine(new EngineState(thumbBus, 0));

function Thumb({ theme }: { theme: Theme }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const scale = 480 / theme.layout.width;
    c.width = 480;
    c.height = Math.round(theme.layout.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    const now = performance.now() + 5000; // past the load animations
    for (const id of thumbBus.ids()) thumbBus.set(id, thumbBus.get(id)!.value, now);
    thumbEngine.render(ctx, theme, now, {});
  }, [theme]);
  return <canvas ref={ref} />;
}

export function WelcomeDialog({
  onPick,
  onOpen,
  onOpenRecent,
  onClose,
}: {
  onPick: (theme: Theme) => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const recent = isTauri ? recentFiles() : [];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('welcome.title')}</h2>
        <p className="lead">{t('welcome.lead')}</p>
        <div className="template-grid">
          {TEMPLATES.map((tp) => (
            <button key={tp.id} className="template-card" onClick={() => onPick(tp.theme)}>
              <div className="thumb">
                <Thumb theme={tp.theme} />
              </div>
              <strong>{tp.name}</strong>
              <small>{tp.description}</small>
            </button>
          ))}
          <button className="template-card" onClick={() => onPick(blankTemplate())}>
            <div className="thumb" />
            <strong>{t('welcome.blank')}</strong>
            <small>{t('welcome.blankDesc')}</small>
          </button>
        </div>
        {recent.length > 0 && (
          <>
            <h4 style={{ margin: '16px 0 6px' }}>{t('welcome.recent')}</h4>
            <div style={{ display: 'grid', gap: 4 }}>
              {recent.map((p) => (
                <button
                  key={p}
                  className="ghost"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => onOpenRecent(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="actions">
          <button onClick={onOpen}>{t('welcome.open')}</button>
          <button className="ghost" onClick={onClose}>
            {t('welcome.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
