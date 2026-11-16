import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme, parseTheme, type Theme } from '@idv7lol/theme-schema';
import { compileTheme } from './compile.js';
import { validateTheme } from './validate.js';

describe('an alert with no room for its text', () => {
  it('compiles with a warning instead of throwing', () => {
    const theme = createEmptyTheme({ id: 'square-alert', name: 'Square alert' });
    theme.components.push(
      createComponent('rect', {
        id: 'bg',
        x: 0,
        y: 0,
        width: 1920,
        height: 720,
        props: { fill: '#000000' },
      }),
      createComponent('alert', {
        id: 'hot',
        x: 900,
        y: 300,
        width: 72,
        height: 72,
        props: { text: 'Engine hot', icon: 'coolant' },
      }),
    );
    const doc = parseOk(theme);
    const report = validateTheme(doc);
    expect(report.ok).toBe(true);
    expect(report.warnings.map((f) => f.code)).toContain('alert.no-room');
    const { compiled } = compileTheme(doc);
    // the box and the icon, and no text
    expect(compiled?.pieces.filter((p) => p.alert === 'hot')).toHaveLength(2);
  });
});

function parseOk(theme: Theme): Theme {
  const r = parseTheme(JSON.parse(JSON.stringify(theme)));
  if (!r.ok) throw new Error('theme does not parse: ' + JSON.stringify(r));
  return r.theme;
}
