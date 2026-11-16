import { describe, expect, it } from 'vitest';
import {
  createComponent,
  createEmptyTheme,
  serializeTheme,
  type Component,
} from '@idv7lol/theme-schema';
import { DESCRIPTORS } from '../inspector/descriptors.js';
import { useProjectStore } from '../store/project.js';
import {
  MAX_COMPONENT_NAME,
  MAX_TEXT_STYLE_NAME,
  clampNumber,
  unsavableReasons,
} from './limits.js';

describe('clampNumber', () => {
  it('keeps a typed number inside the range of its field', () => {
    expect(clampNumber(12, 1, 9)).toBe(9);
    expect(clampNumber(-3, 1, 9)).toBe(1);
    expect(clampNumber(5, 1, 9)).toBe(5);
  });

  it('leaves a field without limits alone', () => {
    expect(clampNumber(1e6)).toBe(1e6);
    expect(clampNumber(-40, undefined, 10)).toBe(-40);
    expect(clampNumber(2.5, 0)).toBe(2.5);
  });

  it('rounds only the fields that take whole numbers', () => {
    expect(clampNumber(2.6, 1, 9, true)).toBe(3);
    expect(clampNumber(9.4, 1, 9, true)).toBe(9);
    expect(clampNumber(2.6, 1, 9)).toBe(2.6);
  });

  it('holds the alert priority to what the schema accepts', () => {
    const f = DESCRIPTORS.alert.flatMap((s) => s.fields).find((d) => d.path === 'priority');
    expect(f).toMatchObject({ min: 1, max: 9, integer: true });
  });
});

describe('unsavableReasons', () => {
  const withAlert = (priority: number, name?: string) => {
    const alert = createComponent('alert', { id: 'a1' });
    const theme = createEmptyTheme({ id: 'my-cluster', name: 'My cluster' });
    // the way the editor can end up holding it: the store keeps what the schema refuses
    const held = { ...alert, name, props: { ...alert.props, priority } } as Component;
    return serializeTheme({ ...theme, components: [held] });
  };

  it('lets through a theme the Studio can open again', () => {
    expect(unsavableReasons(withAlert(9, 'n'.repeat(MAX_COMPONENT_NAME)))).toEqual([]);
  });

  it('names the value that would stop the file from opening', () => {
    const priority = unsavableReasons(withAlert(12));
    expect(priority).toHaveLength(1);
    expect(priority[0]).toContain('components[0].props.priority');

    const name = unsavableReasons(withAlert(5, 'n'.repeat(MAX_COMPONENT_NAME + 1)));
    expect(name).toHaveLength(1);
    expect(name[0]).toContain('components[0].name');
  });
});

describe('named text styles', () => {
  it('never hold a name longer than the schema takes', () => {
    const store = useProjectStore.getState();
    store.newTheme();
    const text = createComponent('text', { id: 't1' });
    if (text.type !== 'text') throw new Error('not a text');
    const from = text.props.style;
    const id = useProjectStore.getState().addTextStyle('s'.repeat(80), from);
    expect(useProjectStore.getState().theme.textStyles[id]!.name).toHaveLength(MAX_TEXT_STYLE_NAME);
    useProjectStore.getState().renameTextStyle(id, 'r'.repeat(80));
    expect(useProjectStore.getState().theme.textStyles[id]!.name).toBe(
      'r'.repeat(MAX_TEXT_STYLE_NAME),
    );
    expect(unsavableReasons(serializeTheme(useProjectStore.getState().theme))).toEqual([]);
  });
});
