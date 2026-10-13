import { describe, expect, it, vi } from 'vitest';
import { exportProgress, importProgress } from '../src/ui/progress.ts';
import { loadSettings, onlineRecord, recordOnline, saveSettings } from '../src/ui/settings.ts';

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

  it('opponents named like Object members are names like any other (no prototype pollution)', () => {
    const s = loadSettings();
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(onlineRecord(s, name)).toBeNull();
      recordOnline(s, name, true);
      recordOnline(s, name, false);
    }
    expect(({} as { w?: unknown }).w).toBeUndefined();
    expect(Object.getPrototypeOf(s.online)).toBe(Object.prototype);
    expect(Object.keys(s.online)).toEqual(['__proto__', 'constructor', 'toString', 'hasOwnProperty']);
    expect(onlineRecord(s, '__proto__')).toEqual({ w: 1, l: 1 });
    // Saved and loaded again, and through a progress code.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
    try {
      saveSettings(s);
      const again = loadSettings();
      expect(onlineRecord(again, '__proto__')).toEqual({ w: 1, l: 1 });
      expect(onlineRecord(again, 'constructor')).toEqual({ w: 1, l: 1 });
      expect(Object.getPrototypeOf(again.online)).toBe(Object.prototype);
    } finally {
      vi.unstubAllGlobals();
    }
    const phone = loadSettings();
    importProgress(phone, exportProgress(s));
    expect(onlineRecord(phone, '__proto__')).toEqual({ w: 1, l: 1 });
    expect(Object.getPrototypeOf(phone.online)).toBe(Object.prototype);
  });
});
