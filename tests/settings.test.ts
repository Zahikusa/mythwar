import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, mergeFromOtherTab, recordResult, resetRecords, saveSettings } from '../src/ui/settings.ts';

/** localStorage for one browser profile (shared by its tabs). */
let store: Map<string, string>;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

describe('settings saved by several tabs and builds (backlog 92)', () => {
  it('a tab saving its settings never undoes progress another tab saved meanwhile', () => {
    const tabA = loadSettings();
    const tabB = loadSettings();
    recordResult(tabA, 'master', true, 600, 3, false);
    tabA.feats.push('master');
    tabA.riddles.push('pack');
    saveSettings(tabA);
    // Tab B, loaded before, only moves a slider.
    tabB.music = 0.3;
    saveSettings(tabB);
    const now = loadSettings();
    expect(now.music).toBe(0.3);
    expect(now.records.master).toMatchObject({ wins: 1, stars: 3 });
    expect(now.feats).toContain('master');
    expect(now.riddles).toEqual(['pack']);
  });

  it('an older build that saves without the fields it doesn’t know loses nothing', () => {
    const s = loadSettings();
    s.riddles.push('pack', 'wall');
    recordResult(s, 'adept', true, 500, 2, false);
    saveSettings(s);
    // The older build reads, drops riddles and stars, and writes back.
    const old = JSON.parse(store.get('mythwar.settings.v1')!);
    delete old.riddles;
    delete old.records.adept.stars;
    store.set('mythwar.settings.v1', JSON.stringify(old));
    const back = loadSettings();
    expect(back.riddles.sort()).toEqual(['pack', 'wall']);
    expect(back.records.adept?.stars).toBe(2);
  });

  it('a storage event from another tab brings its progress into this tab (backlog 95)', () => {
    const tabA = loadSettings();
    const tabB = loadSettings();
    recordResult(tabA, 'mythic', true, 900, 1, false);
    tabA.feats.push('mythic');
    saveSettings(tabA);
    expect(mergeFromOtherTab(tabB, 'some.other.key')).toBe(false);
    expect(tabB.records.mythic).toBeUndefined();
    expect(mergeFromOtherTab(tabB, 'mythwar.settings.v1')).toBe(true);
    expect(tabB.records.mythic).toMatchObject({ wins: 1 });
    expect(tabB.feats).toContain('mythic');
  });

  it('Reset records does take records back (the one save without a merge)', () => {
    const s = loadSettings();
    recordResult(s, 'novice', true, 300, 3, false);
    s.online.Ada = { w: 2, l: 1 };
    saveSettings(s);
    resetRecords(s);
    saveSettings(s);
    const back = loadSettings();
    expect(back.records).toEqual({});
    expect(back.online).toEqual({});
  });
});
