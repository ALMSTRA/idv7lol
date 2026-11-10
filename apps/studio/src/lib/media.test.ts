import { describe, expect, it } from 'vitest';
import { frameScale } from './media.js';

describe('frameScale', () => {
  it('keeps small animations at full size', () => {
    expect(frameScale(200, 100, 10)).toBe(1);
  });

  it('shrinks big or long videos while decoding, not after', () => {
    const s = frameScale(1920, 1080, 120);
    // every kept frame together stays within the sheet limit (4 megapixels)
    expect(120 * 1920 * s * 1080 * s).toBeLessThanOrEqual(4_000_001);
    expect(1920 * frameScale(1920, 1080, 2)).toBeLessThanOrEqual(640);
  });
});
