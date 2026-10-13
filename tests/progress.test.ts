import { describe, expect, it } from 'vitest';
import { exportProgress, importProgress } from '../src/ui/progress.ts';
import { loadSettings } from '../src/ui/settings.ts';

describe('progress codes', () => {
  it('carry records, feats, ages and online tallies — merged, never lost, idempotent', () => {
    const pc = loadSettings();
    pc.records = { novice: { wins: 5, losses: 1, best: 300, streak: 2, stars: 2 }, master: { wins: 1, losses: 4, best: 900, streak: -1, stars: 1 } };
    pc.feats = ['first', 'novice', 'dragon'];
    pc.ageSeen = 4;
    pc.online = { 'Swift Griffin': { w: 2, l: 1 } };
    pc.playerName = 'Zoë';
    const code = exportProgress(pc);
    expect(code.startsWith('MW1:')).toBe(true);

    const phone = loadSettings();
    phone.records = { novice: { wins: 7, losses: 0, best: 250, streak: 7, stars: 3 } };
    phone.feats = ['first', 'shrines'];
    phone.ageSeen = 1;
    phone.playerName = 'Phone';
    expect(importProgress(phone, `  ${code}\n`)).toBe(true);
    expect(phone.records.novice).toEqual({ wins: 7, losses: 1, best: 250, streak: 7, stars: 3 });
    expect(phone.records.master).toEqual({ wins: 1, losses: 4, best: 900, streak: 0, stars: 1 });
    expect(phone.feats.sort()).toEqual(['dragon', 'first', 'novice', 'shrines']);
    expect(phone.ageSeen).toBe(4);
    expect(phone.online['Swift Griffin']).toEqual({ w: 2, l: 1 });
    expect(phone.playerName).toBe('Phone');
    const once = JSON.stringify(phone);
    importProgress(phone, code);
    expect(JSON.stringify(phone)).toBe(once);
  });

  it('carry solved riddles; unknown feats and riddles are left out; older codes still load', () => {
    const pc = loadSettings();
    pc.riddles = ['pack', 'wall'];
    pc.feats = ['first', 'made-up'];
    const phone = loadSettings();
    phone.riddles = ['winter'];
    expect(importProgress(phone, exportProgress(pc))).toBe(true);
    expect(phone.riddles.sort()).toEqual(['pack', 'wall', 'winter']);
    expect(phone.feats).toEqual(['first']);
    const forged = (p: object) => 'MW1:' + btoa(JSON.stringify(p));
    const s = loadSettings();
    expect(importProgress(s, forged({ r: {}, f: Array.from({ length: 200 }, (_, i) => `junk${i}`), a: 0, o: {}, q: ['nope', 'pack'] }))).toBe(true);
    expect(s.feats).toEqual([]);
    expect(s.riddles).toEqual(['pack']);
    // A code from before riddles were carried.
    const old = loadSettings();
    expect(importProgress(old, forged({ r: {}, f: ['first'], a: 2, o: {} }))).toBe(true);
    expect(old.riddles).toEqual([]);
    expect(old.ageSeen).toBe(2);
  });

  it('a "__proto__" name in the online tallies is ignored (no prototype swap)', () => {
    const s = loadSettings();
    expect(importProgress(s, 'MW1:' + btoa('{"r":{},"f":[],"a":0,"o":{"__proto__":{"w":3,"l":1},"Ada":{"w":1,"l":0}}}'))).toBe(true);
    expect(Object.getPrototypeOf(s.online)).toBe(Object.prototype);
    expect(Object.keys(s.online)).toEqual(['Ada']);
  });

  it('rejects anything that is not a progress code', () => {
    const s = loadSettings();
    const before = JSON.stringify(s);
    for (const bad of ['', 'hello', 'MW1:!!!', 'MW1:' + btoa('not json'), 'MW1:' + btoa('42')]) expect(importProgress(s, bad)).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});
