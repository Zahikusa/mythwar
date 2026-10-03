import { describe, expect, it } from 'vitest';
import { shade, mix, rgba } from '../src/render/theme.ts';

describe('colour helpers', () => {
  it('shade / mix / rgba produce valid CSS colours', () => {
    expect(shade('#808080', 0.5)).toBe('rgb(191,191,191)');
    expect(shade('#808080', -0.5)).toBe('rgb(64,64,64)');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#7f7f7f');
    expect(rgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
  });
});
