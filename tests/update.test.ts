import { describe, expect, it } from 'vitest';
import { bundleOf } from '../src/update.ts';

describe('bundleOf (a newer build on the server)', () => {
  it('finds the main bundle in the built page', () => {
    const html = '<head><script>(function(){})()</script><script type="module" crossorigin src="./assets/index-BnLRK5n3.js"></script><link rel="stylesheet" crossorigin href="./assets/index-Dx1.css"></head>';
    expect(bundleOf(html)).toBe('index-BnLRK5n3.js');
  });
  it('tells two builds apart and finds nothing in a page without one', () => {
    expect(bundleOf('<script type="module" src="/mythwar/assets/index-AAAAAAAA.js"></script>')).not.toBe(bundleOf('<script type="module" src="/mythwar/assets/index-BBBBBBBB.js"></script>'));
    expect(bundleOf('<script type="module" src="./src/main.ts"></script>')).toBeNull();
  });
});
