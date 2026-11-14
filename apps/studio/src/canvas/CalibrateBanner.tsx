import { useState } from 'react';
import { getSignal } from '@idv7lol/vehicle-signals';
import { calibratedNeedle, useCalibrateStore, type Point } from '../lib/calibrate.js';
import { NumberInput, SignalSelect } from '../inspector/fields.js';
import { useProjectStore } from '../store/project.js';
import { useT } from '../i18n/index.js';
import { toScreen, type View } from './view.js';

/**
 * The steps of "Needle on a photo" over the canvas: three clicks on the dial, then its signal and
 * range, and a needle-only gauge is made.
 */
export function CalibrateBanner(): JSX.Element | null {
  const t = useT();
  const { active, points, cancel, back } = useCalibrateStore();
  const [signal, setSignal] = useState<string>('vehicle.speed');
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(260);
  const [clockwise, setClockwise] = useState(true);
  if (!active) return null;
  const step = points.length;
  const prompts = [t('calibrate.center'), t('calibrate.start'), t('calibrate.end')];
  const pickSignal = (id: string | undefined) => {
    if (!id) return;
    setSignal(id);
    const def = getSignal(id);
    if (def && typeof def.min === 'number' && typeof def.max === 'number') {
      setMin(def.min);
      setMax(def.max);
    }
  };
  const make = () => {
    const [center, start, end] = points as [Point, Point, Point];
    const c = calibratedNeedle(
      { center, start, end },
      {
        id: 'needle',
        name: t('calibrate.needleName'),
        signal,
        min,
        max,
        clockwise,
      },
    );
    useProjectStore.getState().insertComponents([c]);
    cancel();
  };
  return (
    <div className="calibrate-banner" role="dialog" aria-label={t('calibrate.title')}>
      <strong>{t('calibrate.title')}</strong>
      {step < 3 ? (
        <span>
          {t('calibrate.step', { n: step + 1 })} {prompts[step]}
        </span>
      ) : (
        <div className="calibrate-form">
          <SignalSelect value={signal} onChange={pickSignal} />
          <label>
            {t('calibrate.min')}
            <NumberInput value={min} onChange={setMin} />
          </label>
          <label>
            {t('calibrate.max')}
            <NumberInput value={max} onChange={setMax} />
          </label>
          <select
            value={clockwise ? 'cw' : 'ccw'}
            onChange={(e) => setClockwise(e.target.value === 'cw')}
          >
            <option value="cw">{t('calibrate.clockwise')}</option>
            <option value="ccw">{t('calibrate.counter')}</option>
          </select>
          <button className="primary" onClick={make}>
            {t('calibrate.make')}
          </button>
        </div>
      )}
      {step > 0 && (
        <button className="ghost" onClick={back}>
          {t('calibrate.back')}
        </button>
      )}
      <button className="ghost" onClick={cancel}>
        {t('calibrate.cancel')}
      </button>
    </div>
  );
}

/** The clicks so far on the canvas: the centre, the first and the last mark, and the arc. */
export function drawCalibration(ctx: CanvasRenderingContext2D, v: View, points: Point[]): void {
  if (!points.length) return;
  const [c, a, b] = points.map((p) => toScreen(v, p.x, p.y));
  ctx.save();
  ctx.lineWidth = 2;
  if (c && a) {
    ctx.strokeStyle = 'rgba(63,140,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(a.x, a.y);
    if (b) {
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  const dot = (p: { x: number; y: number } | undefined, color: string, label: string) => {
    if (!p) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(label, p.x + 9, p.y - 9);
  };
  if (c) {
    ctx.strokeStyle = '#3f8cff';
    ctx.beginPath();
    ctx.moveTo(c.x - 10, c.y);
    ctx.lineTo(c.x + 10, c.y);
    ctx.moveTo(c.x, c.y - 10);
    ctx.lineTo(c.x, c.y + 10);
    ctx.stroke();
  }
  dot(a, '#2fd06f', 'min');
  dot(b, '#ff4b3e', 'max');
  ctx.restore();
}
