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
