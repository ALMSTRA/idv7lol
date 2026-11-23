import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme, parseTheme } from '@idv7lol/theme-schema';
import { buildThemePackage, compileTheme, validateTheme } from './index.js';
import { declaredUniforms, lintShader, SHADERS } from './glsl.js';

function theme() {
  const doc = createEmptyTheme({ id: 'map-test', name: 'Map test' });
  doc.components.push(
    createComponent('rect', {
      id: 'bg',
      x: 0,
      y: 0,
      width: 1920,
      height: 720,
      props: { fill: '#000000' },
    }),
    createComponent('rect', {
      id: 'card',
      x: 100,
      y: 200,
      width: 300,
      height: 200,
      props: { fill: '#202020' },
    }),
    createComponent('map', {
      id: 'map',
      x: 600,
      y: 150,
      width: 720,
      height: 480,
      props: { radius: 16, stroke: { color: '#ffffff', width: 2 } },
    }),
  );
  return doc;
}

describe('the map window', () => {
  it('is a component of the format, with a fill for when no map is there', () => {
    const parsed = parseTheme(theme());
    expect(parsed.ok).toBe(true);
    const map = createComponent('map', { id: 'm', x: 0, y: 0 });
    expect(map).toMatchObject({ type: 'map', width: 540, height: 360, props: { radius: 0 } });
    expect(map.props.fill).toMatch(/^#/);
  });

  it('compiles to one layer and opens the rectangles under it', () => {
    const { compiled, report } = compileTheme(theme());
    expect(report.errors).toEqual([]);
    const byKey = Object.fromEntries(compiled!.pieces.map((p) => [p.key, p]));
    expect(byKey['map']).toMatchObject({ shader: 'map', x: 600, y: 150, w: 720, h: 480 });
    expect(byKey['map']!.statics).toMatchObject({ u_shape: [16, 2, 0, 0], u_on: [0] });
    // the backdrop is cut open where the window is, in its own pixels, with the window's corners
    expect(byKey['bg']).toMatchObject({ shader: 'flat-hole' });
    expect(byKey['bg']!.statics).toMatchObject({ u_hole: [600, 150, 720, 480], u_hole_r: [16] });
    // a rectangle elsewhere stays as it was
    expect(byKey['card']!.shader).toBe('flat');
    expect(compiled!.shaders['map']).toBe(SHADERS['map']);
    expect(compiled!.shaders['flat-hole']).toBe(SHADERS['flat-hole']);
    expect(report.warnings.filter((w) => w.code === 'map.covered')).toEqual([]);
    expect(report.infos.some((i) => i.code === 'map.needs')).toBe(true);
    // a package with a map window asks for the app that can show it
    expect(buildThemePackage({ compiled: compiled!, report, files: [] }).minAppVersion).toBe(
      '0.2.21',
    );
  });

  it('leaves themes without a window exactly as before', () => {
    const doc = theme();
    doc.components = doc.components.filter((c) => c.id !== 'map');
    const result = compileTheme(doc);
    expect(result.compiled!.pieces.map((p) => p.shader)).toEqual(['flat', 'flat']);
    expect(buildThemePackage(result).minAppVersion).toBe('0.2.0');
  });

  it('says what the car would draw over the map', () => {
    const doc = theme();
    doc.components.splice(
      1,
      0,
      createComponent('ellipse', {
        id: 'glow',
        x: 700,
        y: 200,
        width: 300,
        height: 300,
        props: { fill: '#113355' },
      }),
    );
    // above the window in the layers: meant to be over the map, no warning
    doc.components.push(
      createComponent('text', { id: 'label', x: 620, y: 170, width: 200, height: 40 }),
    );
    const report = validateTheme(doc);
    const covered = report.warnings.filter((w) => w.code === 'map.covered');
    expect(covered.map((w) => w.componentId)).toEqual(['glow']);
  });

  it('refuses a second window, one too small and one outside the layout', () => {
    const two = theme();
    two.components.push(
      createComponent('map', { id: 'map2', x: 100, y: 450, width: 200, height: 120 }),
    );
    expect(validateTheme(two).errors.map((e) => e.code)).toContain('map.multiple');

    const small = theme();
    Object.assign(
      small.components.find((c) => c.id === 'map')!,
      { width: 60, height: 30 },
    );
    expect(validateTheme(small).errors.map((e) => e.code)).toContain('map.small');

    const out = theme();
    Object.assign(
      out.components.find((c) => c.id === 'map')!,
      { x: 1500 },
    );
    expect(validateTheme(out).errors.map((e) => e.code)).toContain('map.outside');
  });

  it('has shaders the renderer takes', () => {
    expect(lintShader(SHADERS['map'])).toEqual([]);
    expect(lintShader(SHADERS['flat-hole'])).toEqual([]);
    expect(declaredUniforms(SHADERS['map'])).toEqual(
      expect.arrayContaining(['u_fill', 'u_stroke', 'u_shape', 'u_on']),
    );
    const hole = SHADERS['flat-hole'];
    expect(hole.match(/void main\(\)/g)).toHaveLength(1);
    expect(declaredUniforms(hole)).toEqual(
      expect.arrayContaining(['u_fill', 'u_shape', 'u_hole', 'u_hole_r']),
    );
  });
});
