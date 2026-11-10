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
