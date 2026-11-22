import { describe, expect, it } from 'vitest';
import { createComponent, createEmptyTheme } from '@idv7lol/theme-schema';
import { compileTheme } from './compile.js';
import type { CompiledPiece } from './types.js';

const compile = (components: unknown[]) => {
  const r = compileTheme(
    { ...createEmptyTheme({ id: 'units', name: 'Units' }), components },
    { force: true },
  );
  if (!r.compiled) throw new Error('not compiled');
  return r.compiled;
};
const bindingsOf = (p: CompiledPiece) =>
  p.dynamics.flatMap((d) => ('binding' in d && d.binding ? [d.binding] : []));

describe('a compiled theme in other units', () => {
  const compiled = compile([
    createComponent('gauge.arc', {
      id: 'speedo',
      binding: { signal: 'vehicle.speed', min: 0, max: 260 },
      props: { ticks: { major: 13 }, labels: { show: true, every: 2 }, needle: { show: true } },
    }),
    createComponent('value.digital', {
      id: 'oil',
      binding: { signal: 'engine.oil.temp' },
      props: { showUnit: true },
    }),
    createComponent('value.digital', { id: 'revs', binding: { signal: 'engine.rpm' } }),
    createComponent('text', { id: 'unit', props: { text: 'km/h' } }),
  ]);

  it('brings only the pieces that differ, each in the place of one with its key', () => {
    const units = compiled.units!;
    expect(Object.keys(units).sort()).toEqual(['speed', 'temperature']);
    const keys = new Set(compiled.pieces.map((p) => p.key));
    const seen = new Set<string>();
    for (const set of Object.values(units))
      for (const [key, piece] of Object.entries(set!)) {
        expect(keys.has(key)).toBe(true);
        expect(piece.key).toBe(key);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        const base = compiled.pieces.find((p) => p.key === key)!;
        expect(piece.shader).toBe(base.shader);
        expect(piece.z).toBe(base.z);
        expect([piece.x, piece.y, piece.w, piece.h]).toEqual([base.x, base.y, base.w, base.h]);
      }
    // the rev counter is in no group
    expect([...seen].some((k) => k.startsWith('revs'))).toBe(false);
  });

  it('reads the car in km/h and shows miles on a round scale', () => {
    const speed = Object.values(compiled.units!.speed!);
    const speedo = speed.filter((p) => p.componentId === 'speedo');
    expect(speedo.length).toBeGreaterThan(0);
    for (const b of speedo.flatMap(bindingsOf)) {
      expect(b.catalogUnit).toBe('kmh');
      expect(b.unit).toBe('mph');
      expect([b.rangeMin, b.rangeMax]).toEqual([0, 160]);
    }
    const ticks = speedo.find((p) => p.statics['u_range']);
    expect(ticks!.statics['u_range']!.slice(0, 2)).toEqual([0, 160]);
    const label = speed.find((p) => p.componentId === 'unit')!;
    expect(JSON.stringify(label.dynamics)).toContain('mph');
    const oil = Object.values(compiled.units!.temperature!).flatMap(bindingsOf);
    expect(oil.every((b) => b.unit === 'fahrenheit' && b.catalogUnit === 'celsius')).toBe(true);
    expect(JSON.stringify(compiled.units!.temperature)).toContain('°F');
  });

  it('is left out where nothing is shown in a unit that changes', () => {
    expect(
      compile([createComponent('value.digital', { id: 'revs', binding: { signal: 'engine.rpm' } })])
        .units,
    ).toBeUndefined();
  });
});
