import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATES, TEMPLATE_THEME_IDS, loadLargeTemplates } from './templates.js';

describe('templates', () => {
  it('offers every bundled theme, the large ones once loaded', async () => {
    const large = await loadLargeTemplates();
    const ids = new Set([...TEMPLATES, ...large].map((t) => t.id));
    const bundled = readdirSync(new URL('../../../../themes/', import.meta.url), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory() && d.name !== 'community' && d.name !== 'examples')
      .map((d) => d.name);
    for (const id of bundled) expect(ids, id).toContain(id);
  });

  it('loads VDO Classic M with its pictures and knows its id before', async () => {
    expect(TEMPLATE_THEME_IDS.has('vdo-classic-m')).toBe(true);
    const vdo = (await loadLargeTemplates()).find((t) => t.id === 'vdo-classic-m');
    expect(vdo?.theme.name).toBe('VDO Classic M');
    expect(Object.keys(vdo?.theme.assets ?? {}).length).toBeGreaterThan(0);
    expect(vdo?.community).toBe(false);
  });
});
