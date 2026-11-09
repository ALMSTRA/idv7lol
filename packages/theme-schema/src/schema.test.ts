import { describe, expect, it } from 'vitest';
import {
  COMPONENT_TYPES,
  ComponentSchema,
  ConditionSchema,
  DEFAULT_SIZES,
  createComponent,
  createEmptyTheme,
  parseTheme,
  parseThemeJson,
  serializeTheme,
} from './index.js';

describe('createComponent', () => {
  it('creates every component type with defaults applied', () => {
    for (const type of COMPONENT_TYPES) {
      const c = createComponent(type, { x: 10, y: 20 });
      expect(c.type).toBe(type);
      expect(c.width).toBe(DEFAULT_SIZES[type].width);
      expect(c.opacity).toBe(1);
      expect(c.visible).toBe(true);
      expect(c.animations).toEqual([]);
    }
  });

  it('fills nested defaults for gauges', () => {
    const g = createComponent('gauge.arc', { id: 'tacho' });
    expect(g.id).toBe('tacho');
    if (g.type !== 'gauge.arc') throw new Error('type');
    expect(g.props.startAngle).toBe(135);
    expect(g.props.ticks.major).toBe(8);
    expect(g.props.needle.show).toBe(false);
    expect(g.props.needle.cap.radius).toBe(14);
    expect(g.binding?.signal).toBe('engine.rpm');
  });

  it('merges partial props over the defaults', () => {
    const g = createComponent('gauge.arc', { props: { needle: { show: true, color: '#ff0000' } } });
    if (g.type !== 'gauge.arc') throw new Error('type');
    expect(g.props.needle.show).toBe(true);
    expect(g.props.needle.color).toBe('#ff0000');
    expect(g.props.needle.width).toBe(6);
  });

  it('parses nested groups recursively', () => {
    const group = ComponentSchema.parse({
      id: 'g',
      type: 'group',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      props: {
        children: [
          { id: 'r', type: 'rect', x: 0, y: 0, width: 10, height: 10 },
          {
            id: 'g2',
            type: 'group',
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            props: {
              children: [
                { id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10, props: { text: 'hi' } },
              ],
            },
          },
        ],
      },
    });
    if (group.type !== 'group') throw new Error('type');
    expect(group.props.clip).toBe(false);
    expect(group.props.children).toHaveLength(2);
    const inner = group.props.children[1];
    if (inner?.type !== 'group') throw new Error('type');
    expect(inner.props.children[0]?.type).toBe('text');
  });

  it('rejects bad ids and colours with readable messages', () => {
    const r = ComponentSchema.safeParse({
      id: 'Bad Id',
      type: 'rect',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      props: { fill: 'red' },
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const messages = r.error.issues.map((i) => i.message).join('\n');
    expect(messages).toMatch(/kebab-case/);
    expect(messages).toMatch(/colour|palette/);
  });
});

describe('conditions', () => {
  it('accepts nested all/any/not', () => {
    const c = ConditionSchema.parse({
      all: [
        { signal: 'engine.rpm', op: 'gt', value: 3000 },
        {
          any: [
            { signal: 'drive.mode', op: 'eq', value: 'SPORT' },
            { not: { signal: 'engine.running', op: 'truthy' } },
          ],
        },
      ],
    });
    expect('all' in c).toBe(true);
  });
});

describe('theme documents', () => {
  it('creates a valid empty theme and round-trips through JSON', () => {
    const t = createEmptyTheme({ id: 'demo', name: 'Demo' });
    expect(t.layout.width).toBe(1920);
    expect(t.palette.default).toBe('night');
    const text = serializeTheme(t);
    const back = parseThemeJson(text);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.theme).toEqual(t);
  });

  it('reports issues with JSON paths', () => {
    const t = createEmptyTheme();
    const broken = JSON.parse(serializeTheme(t));
    broken.components = [{ id: 'x', type: 'gauge.arc', x: 0, y: 0, width: -5, height: 10 }];
    broken.version = 'one';
    const r = parseTheme(broken);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const paths = r.issues.map((i) => i.path);
    expect(paths).toContain('version');
    expect(paths.some((p) => p.startsWith('components[0]'))).toBe(true);
  });

  it('migrates documents without a schemaVersion', () => {
    const t = createEmptyTheme();
    const doc = JSON.parse(serializeTheme(t));
    delete doc.schemaVersion;
    const r = parseTheme(doc);
    expect(r.ok).toBe(true);
  });

  it('rejects invalid JSON text', () => {
    const r = parseThemeJson('{ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.code).toBe('invalid_json');
  });
});
