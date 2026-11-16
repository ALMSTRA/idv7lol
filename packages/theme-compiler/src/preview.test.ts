import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme, parseTheme, type Theme } from '@idv7lol/theme-schema';
import { PREVIEW_MAX, themePreview } from './preview.js';

const bundled = (id: string): Theme => {
  const doc = JSON.parse(
    readFileSync(new URL(`../../../themes/${id}/theme.json`, import.meta.url), 'utf8'),
  ) as unknown;
  const r = parseTheme(doc);
  if (!r.ok) throw new Error(`${id} does not parse`);
  return r.theme;
};

describe('theme sketch for the car app', () => {
  it('draws a gauge, a bar and a reading where the theme has them', () => {
    const theme = createEmptyTheme({ id: 'sketch', name: 'Sketch' });
    theme.components.push(
      createComponent('gauge.arc', {
        id: 'revs',
        x: 100,
        y: 100,
        width: 400,
        height: 400,
        binding: { signal: 'engine.rpm', min: 0, max: 8000 },
      }),
      createComponent('gauge.bar', {
        id: 'fuel',
        x: 600,
        y: 600,
        width: 400,
        height: 20,
        binding: { signal: 'fuel.level' },
      }),
      createComponent('value.digital', {
        id: 'speed',
        x: 800,
        y: 200,
        width: 300,
        height: 120,
        binding: { signal: 'vehicle.speed' },
      }),
    );
    const prims = themePreview(parseOk(theme));
    // the track, then the fill up to 4300 of 8000 rpm: 135° + 90° to 135° + 270° × 0.5375 + 90°
    expect(prims[0]).toEqual(['a', 300, 300, 184, 200, 225, 495, '$track']);
    expect(prims[1]).toEqual(['a', 300, 300, 184, 200, 225, 370, '$accent']);
    // the bar's track, and its fill at 62 %
    expect(prims[2]).toEqual(['r', 600, 600, 400, 20, 4, '$track']);
    expect(prims[3]).toEqual(['r', 600, 600, 248, 20, 4, '$accent']);
    // the speed, centred in its box
    expect(prims[4]).toEqual(['t', '112', 950, 260, 96, '$text', 1, 1]);
  });

  it('leaves out what is hidden or only shows on a condition, and turns literals into hex', () => {
    const theme = createEmptyTheme({ id: 'sketch-2', name: 'Sketch 2' });
    theme.components.push(
      createComponent('rect', {
        id: 'panel',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        props: { fill: 'rgb(255, 0, 0)', radius: 8 },
      }),
      createComponent('rect', { id: 'ghost', visible: false, props: { fill: '#ffffff' } }),
      createComponent('text', {
        id: 'warning',
        props: { text: 'HOT' },
        visibleWhen: { signal: 'engine.coolant.temp', op: 'gt', value: 110 },
      }),
    );
    expect(themePreview(parseOk(theme))).toEqual([['r', 0, 0, 100, 50, 8, '#ff0000']]);
  });

  it('gives every bundled theme a sketch the car app can draw', () => {
    const ids = readdirSync(new URL('../../../themes/', import.meta.url), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'community' && d.name !== 'examples')
      .map((d) => d.name);
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) {
      const prims = themePreview(bundled(id));
      expect(prims.length, id).toBeGreaterThan(0);
      expect(prims.length, id).toBeLessThanOrEqual(PREVIEW_MAX);
      for (const p of prims) {
        const colourOf = p[p.length - (p[0] === 't' ? 3 : 1)] as string;
        expect(colourOf, `${id} ${JSON.stringify(p)}`).toMatch(/^(\$[a-z0-9-]+|#[0-9a-f]{6,8})$/);
        for (const v of p)
          if (typeof v === 'number')
            expect(Number.isFinite(v), `${id} ${JSON.stringify(p)}`).toBe(true);
      }
    }
  });
});

function parseOk(theme: Theme): Theme {
  const r = parseTheme(JSON.parse(JSON.stringify(theme)));
  if (!r.ok) throw new Error('theme does not parse: ' + JSON.stringify(r));
  return r.theme;
}
