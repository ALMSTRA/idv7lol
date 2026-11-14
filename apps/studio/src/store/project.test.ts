import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme, type Component } from '@idv7lol/theme-schema';
import { findComponent } from '@idv7lol/theme-engine';
import { useProjectStore } from './project.js';

const box = (id: string, x: number, y: number) =>
  createComponent('rect', { id, x, y, width: 40, height: 40 });

function load(components: Component[]) {
  const s = useProjectStore.getState();
  s.loadTheme({ ...createEmptyTheme({ id: 't', name: 'T' }), components }, null);
  return useProjectStore.getState;
}

describe('groups inside groups', () => {
  it('groups and ungroups siblings inside a group, keeping their places', () => {
    const outer = createComponent('group', {
      id: 'outer',
      x: 100,
      y: 100,
      width: 300,
      height: 200,
      props: { children: [box('a', 10, 10), box('b', 100, 50), box('c', 200, 100)], clip: false },
    });
    const get = load([outer]);
    get().select(['a', 'b']);
    get().groupSelected();
    const inner = get().selection[0]!;
    const g = findComponent(get().theme.components, inner);
    expect(g?.type).toBe('group');
    expect(g).toMatchObject({ x: 10, y: 10, width: 130, height: 80 });
    const o = findComponent(get().theme.components, 'outer');
    expect(o?.type === 'group' && o.props.children.map((c) => c.id)).toEqual([inner, 'c']);

    get().ungroupSelected();
    expect(get().selection).toEqual(['a', 'b']);
    expect(findComponent(get().theme.components, 'b')).toMatchObject({ x: 100, y: 50 });
  });

  it("won't group components that live in different groups", () => {
    const g = createComponent('group', {
      id: 'g',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      props: { children: [box('in', 0, 0)], clip: false },
    });
    const get = load([g, box('out', 200, 200)]);
    get().select(['in', 'out']);
    const before = get().theme;
    get().groupSelected();
    expect(get().theme).toBe(before);
  });

  it('Escape steps from a child to its group', () => {
    const g = createComponent('group', {
      id: 'g',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      props: { children: [box('in', 0, 0)], clip: false },
    });
    const get = load([g]);
    get().select(['in']);
    expect(get().selectParent()).toBe(true);
    expect(get().selection).toEqual(['g']);
    expect(get().selectParent()).toBe(false);
  });
});

describe('ordering', () => {
  const order = (get: typeof useProjectStore.getState) => get().theme.components.map((c) => c.id);

  it('brings several components to the front keeping their order, in one undo step', () => {
    const get = load([box('a', 0, 0), box('b', 0, 0), box('c', 0, 0)]);
    get().select(['a', 'b']);
    get().reorderSelected('top');
    expect(order(get)).toEqual(['c', 'a', 'b']);
    get().undo();
    expect(order(get)).toEqual(['a', 'b', 'c']);
    get().select(['b', 'c']);
    get().reorderSelected('bottom');
    expect(order(get)).toEqual(['b', 'c', 'a']);
  });

  it('moves components inside a group', () => {
    const g = createComponent('group', {
      id: 'g',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      props: { children: [box('x', 0, 0), box('y', 0, 0)], clip: false },
    });
    const get = load([g]);
    get().select(['x']);
    get().reorderSelected('up');
    const grp = findComponent(get().theme.components, 'g');
    expect(grp?.type === 'group' && grp.props.children.map((c) => c.id)).toEqual(['y', 'x']);
  });
});

describe('named text styles in the store', () => {
  it('saves a look as a style, changes every text that uses it, and keeps the look on removal', () => {
    const a = createComponent('text', { id: 'a', props: { text: 'A', style: { size: 20 } } });
    const b = createComponent('text', {
      id: 'b',
      props: { text: 'B', style: { size: 30, align: 'right' } },
    });
    const get = load([a, b]);
    const style = (id: string) =>
      (findComponent(get().theme.components, id)!.props as { style: Record<string, unknown> })
        .style;
    const sid = get().addTextStyle('Label', style('a') as never);
    get().updateProps('a', { style: { ...style('a'), use: sid } });
    get().updateProps('b', { style: { ...style('b'), use: sid, size: 20 } });
    get().updateTextStyle(sid, { size: 44, color: '$accent' });
    expect(style('a')).toMatchObject({ size: 44, color: '$accent', use: sid });
    expect(style('b')).toMatchObject({ size: 44, color: '$accent', align: 'right' });
    get().undo();
    expect(style('a').size).toBe(20);
    get().redo();
    get().removeTextStyle(sid);
    expect(get().theme.textStyles[sid]).toBeUndefined();
    expect(style('b')).toMatchObject({ size: 44, align: 'right' });
    expect(style('b').use).toBeUndefined();
  });
});
