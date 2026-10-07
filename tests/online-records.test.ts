import { describe, expect, it } from 'vitest';
import { loadSettings, recordOnline } from '../src/ui/settings.ts';

describe('online records', () => {
  it('counts wins and losses per opponent, newest last, capped', () => {
    const s = loadSettings();
    recordOnline(s, 'Bo', true);
    recordOnline(s, 'Bo', false);
    recordOnline(s, 'Cy', true);
    recordOnline(s, 'Bo', true);
    expect(s.online.Bo).toEqual({ w: 2, l: 1 });
    expect(Object.keys(s.online)).toEqual(['Cy', 'Bo']);
    for (let i = 0; i < 60; i++) recordOnline(s, `P${i}`, true);
    expect(Object.keys(s.online).length).toBe(40);
    expect(s.online.Bo).toBeUndefined();
    expect(s.online.P59).toEqual({ w: 1, l: 0 });
  });
});
