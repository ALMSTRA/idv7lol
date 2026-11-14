import { describe, expect, it } from 'vitest';
import { angleOf, calibratedNeedle, dialArc } from './calibrate.js';

describe('needle on a photo', () => {
  const center = { x: 500, y: 400 };

  it('measures angles clockwise from 3 o’clock on the screen', () => {
    expect(angleOf(center, { x: 600, y: 400 })).toBe(0);
    expect(angleOf(center, { x: 500, y: 500 })).toBe(90); // straight down
    expect(angleOf(center, { x: 400, y: 400 })).toBe(180);
    expect(angleOf(center, { x: 500, y: 300 })).toBe(270); // straight up
  });

  it('turns a usual dial clockwise from bottom left to bottom right', () => {
    // 0 at 7:30 (135 deg), the last mark at 4:30 (45 deg): 270 deg of sweep
    const d = 100 / Math.SQRT2;
    const cal = {
      center,
      start: { x: 500 - d, y: 400 + d },
      end: { x: 500 + d, y: 400 + d },
    };
    expect(dialArc(cal, true)).toEqual({ startAngle: 135, sweepAngle: 270 });
    expect(dialArc(cal, false)).toEqual({ startAngle: 135, sweepAngle: -90 });
  });

  it('makes a needle-only gauge that reaches the marks', () => {
    const c = calibratedNeedle(
      { center, start: { x: 380, y: 400 }, end: { x: 500, y: 280 } },
      {
        id: 'speed-needle',
        name: 'Speed needle',
        signal: 'vehicle.speed',
        min: 0,
        max: 260,
        clockwise: true,
      },
    );
    expect(c).toMatchObject({ type: 'gauge.arc', x: 380, y: 280, width: 240, height: 240 });
    if (c.type !== 'gauge.arc') throw new Error('not a gauge');
    expect(c.props.startAngle).toBe(180);
    expect(c.props.sweepAngle).toBe(90);
    expect(c.props.needle.show).toBe(true);
    expect(c.props.track.show).toBe(false);
    expect(c.props.ticks.major).toBe(0);
    expect(c.binding).toMatchObject({ signal: 'vehicle.speed', min: 0, max: 260 });
  });
});
