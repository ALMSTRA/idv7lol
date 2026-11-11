import { describe, expect, it } from 'vitest';
import {
  ComponentSchema,
  createComponent,
  createEmptyTheme,
  type Component,
} from '@idv7lol/theme-schema';
import { compileTheme, validateTheme } from '@idv7lol/theme-compiler';
import { LIBRARY, LIBRARY_GROUPS } from './componentLibrary.js';
import { blockComponents } from './libraryActions.js';
import { en } from '../i18n/en.js';
import { es } from '../i18n/es.js';

/** Every entry as the Studio adds it, moved to an open spot of the panel. */
function componentsOf(entry: (typeof LIBRARY)[number]): Component[] {
  const list = entry.parts
    ? blockComponents(entry)
    : [createComponent(entry.type, { id: entry.id, ...(entry.overrides as object) })];
  return list.map((c) => ({ ...c, x: c.x + 420, y: c.y + 140 }) as Component);
}

describe('component library', () => {
  it('has unique ids, a known group and names in both languages', () => {
    const ids = LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of LIBRARY) {
      expect(LIBRARY_GROUPS).toContain(e.group);
      for (const dict of [en, es]) {
        const presets = dict.presets as Record<string, string>;
        expect(presets[e.nameKey], `${e.id} name`).toBeTruthy();
        if (e.descKey) expect(presets[e.descKey], `${e.id} description`).toBeTruthy();
      }
    }
    for (const g of LIBRARY_GROUPS) {
      expect((en.library.groups as Record<string, string>)[g]).toBeTruthy();
      expect((es.library.groups as Record<string, string>)[g]).toBeTruthy();
    }
  });

  for (const entry of LIBRARY) {
    it(`${entry.id} makes valid components that compile for the car`, () => {
      const components = componentsOf(entry);
      for (const c of components) expect(ComponentSchema.safeParse(c).success).toBe(true);
      const theme = { ...createEmptyTheme({ id: 'lib', name: 'Lib' }), components };
      const report = validateTheme(theme);
      expect(report.errors).toEqual([]);
      const result = compileTheme(theme);
      expect(result.report.errors).toEqual([]);
      expect(result.compiled?.pieces.length).toBeGreaterThan(0);
    });
  }
});
