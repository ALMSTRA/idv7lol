import { describe, expect, it } from 'vitest';
import { translate } from './index.js';

describe('translate', () => {
  it('finds keys whose names hold dots, such as component types', () => {
    expect(translate('en', 'components.gauge.arc')).toBe('Circular gauge');
    expect(translate('es', 'components.value.digital')).not.toBe('components.value.digital');
  });

  it('still finds ordinary nested keys and fills in values', () => {
    expect(translate('en', 'library.pieceCount', { n: 3 })).toBe('3 pieces');
  });
});

describe('Inspector fields in Spanish', () => {
  it('has a Spanish name for every field and section', async () => {
    const { DESCRIPTORS } = await import('../inspector/descriptors.js');
    const { ES_FIELD_LABELS } = await import('./es.js');
    const missing = new Set<string>();
    for (const sections of Object.values(DESCRIPTORS))
      for (const sec of sections) {
        if (!ES_FIELD_LABELS[sec.title]) missing.add(sec.title);
        for (const f of sec.fields) if (!ES_FIELD_LABELS[f.label]) missing.add(f.label);
      }
    expect([...missing]).toEqual([]);
  });
});
