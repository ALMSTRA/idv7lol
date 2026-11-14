import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme } from './factory.js';
import { parseTheme } from './parse.js';
import { resolveTextStyles, unknownTextStyles } from './text-styles.js';
import type { Theme } from './theme.js';

function themeWith(): Theme {
  const base = createEmptyTheme({ id: 'styles', name: 'Styles' });
  const title = createComponent('text', {
    id: 'title',
    props: { text: 'RPM', style: { size: 20, align: 'right', use: 'label' } },
  });
  const plain = createComponent('text', { id: 'plain', props: { text: 'x', style: { size: 30 } } });
  const speed = createComponent('value.digital', {
    id: 'speed',
    props: { valueStyle: { size: 90, use: 'big' }, unitStyle: { size: 18, use: 'label' } },
  });
  const r = parseTheme({
    ...base,
    textStyles: {
      label: {
        name: 'Label',
        size: 16,
        weight: 'bold',
        color: '$text-muted',
        letterSpacing: 2,
        uppercase: true,
      },
      big: { name: 'Big number', size: 140, weight: 'bold', color: '$accent' },
    },
    components: [title, plain, speed],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.theme;
}

describe('named text styles', () => {
  it('give a text the named style, keeping its own alignment', () => {
    const t = resolveTextStyles(themeWith());
    const title = t.components.find((c) => c.id === 'title')!;
    expect((title.props as { style: object }).style).toMatchObject({
      size: 16,
      weight: 'bold',
      color: '$text-muted',
      letterSpacing: 2,
      uppercase: true,
      align: 'right',
      use: 'label',
    });
  });

  it('reach styles inside any prop, and leave texts without a style alone', () => {
    const src = themeWith();
    const t = resolveTextStyles(src);
    const speed = t.components.find((c) => c.id === 'speed')!.props as {
      valueStyle: { size: number; color: string };
      unitStyle: { size: number };
    };
    expect(speed.valueStyle).toMatchObject({ size: 140, color: '$accent' });
    expect(speed.unitStyle.size).toBe(16);
    expect(t.components.find((c) => c.id === 'plain')).toBe(
      src.components.find((c) => c.id === 'plain'),
    );
  });

  it('come back as the same theme when there are none, and are cached', () => {
    const plain = createEmptyTheme({ id: 'p', name: 'P' });
    expect(resolveTextStyles(plain)).toBe(plain);
    const t = themeWith();
    expect(resolveTextStyles(t)).toBe(resolveTextStyles(t));
  });

  it('report a style a text uses that the theme lacks', () => {
    const t = themeWith();
    const lost = { ...t, textStyles: { label: t.textStyles['label']! } };
    expect(unknownTextStyles(lost)).toEqual(['big']);
    expect(unknownTextStyles(t)).toEqual([]);
  });
});

describe('detaching and naming text styles', () => {
  it('keeps the look of the texts that used a removed style', async () => {
    const { detachTextStyle, newTextStyleId } = await import('./text-styles.js');
    const t = themeWith();
    const out = detachTextStyle(t, 'label');
    expect(out.textStyles['label']).toBeUndefined();
    const title = out.components.find((c) => c.id === 'title')!.props as {
      style: { size: number; use?: string; uppercase: boolean };
    };
    expect(title.style.size).toBe(16);
    expect(title.style.uppercase).toBe(true);
    expect(title.style.use).toBeUndefined();
    const speed = out.components.find((c) => c.id === 'speed')!.props as {
      valueStyle: { use?: string };
    };
    expect(speed.valueStyle.use).toBe('big');
    expect(newTextStyleId(t, 'Label')).toBe('label-2');
    expect(newTextStyleId(t, 'Número grande!')).toBe('numero-grande');
  });
});
