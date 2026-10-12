import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world.ts';
import { battleTip } from '../src/ui/menus.ts';

describe('results tip', () => {
  it('after a win, suggests the next difficulty', () => {
    const w = new World();
    w.winner = 0;
    expect(battleTip(w, 0, 'novice', [])).toMatch(/Try Adept/);
    expect(battleTip(w, 0, 'mythic', [])).toMatch(/faster/);
  });

  it('after a loss, points at the biggest mistake first', () => {
    const w = new World();
    w.winner = 1;
    w.time = 400;
    // Fell an age behind and never caught up.
    expect(battleTip(w, 0, 'adept', [{ t: 120, team: 1, age: 1 }])).toMatch(/reached Olympus and you never did/);
    // Caught up late.
    expect(battleTip(w, 0, 'adept', [{ t: 120, team: 1, age: 1 }, { t: 240, team: 0, age: 1 }])).toMatch(/2:00 before you/);
    // Same pace, but never used the god power.
    expect(battleTip(w, 0, 'adept', [{ t: 120, team: 1, age: 1 }, { t: 130, team: 0, age: 1 }])).toMatch(/god power/);
    w.players[0].stats.powersCast = 3;
    expect(battleTip(w, 0, 'adept', [])).toMatch(/turrets/);
    w.players[0].turrets[1].def = w.players[0].turrets[1].def ?? ({ id: 'thornspitter' } as never);
    // Out-drawn at the Ley Surges.
    w.players[1].stats.surgeGold = 300;
    w.players[0].stats.surgeGold = 50;
    expect(battleTip(w, 0, 'adept', [])).toMatch(/Ley Surges/);
    w.players[1].stats.surgeGold = 0;
    // Nothing specific: the counter advice — or, with it switched off, the triangle itself.
    expect(battleTip(w, 0, 'adept', [])).toMatch(/Counter! badge/);
    expect(battleTip(w, 0, 'adept', [], false)).toMatch(/Hunters beat Mystics/);
  });
});

describe('results tip with older saves', () => {
  it("doesn't claim you never reached an age you are in", () => {
    const w = new World();
    w.winner = 1;
    w.time = 600;
    w.players[0].age = 1; // reached before a reload that lost the ascension times
    w.players[0].stats.powersCast = 2;
    expect(battleTip(w, 0, 'adept', [{ t: 300, team: 1, age: 1 }])).not.toMatch(/never did/);
  });
});

describe('recommended foe', () => {
  it('is the easiest difficulty not beaten yet', async () => {
    const { recommendedDifficulty } = await import('../src/ui/menus.ts');
    expect(recommendedDifficulty({})).toBe('novice');
    expect(recommendedDifficulty({ novice: { wins: 0, losses: 3, best: 0 } })).toBe('novice');
    expect(recommendedDifficulty({ novice: { wins: 2, losses: 0, best: 300 } })).toBe('adept');
    expect(recommendedDifficulty({ novice: { wins: 1, losses: 0, best: 300 }, adept: { wins: 1, losses: 0, best: 300 }, master: { wins: 1, losses: 0, best: 300 }, mythic: { wins: 1, losses: 0, best: 300 } })).toBe('mythic');
  });
});

describe('flow between battles', () => {
  it('suggests the next foe after a win, an easier one after three defeats in a row', async () => {
    const { flowSuggestion } = await import('../src/ui/menus.ts');
    expect(flowSuggestion(true, 'adept', 1)).toBe('master');
    expect(flowSuggestion(true, 'mythic', 4)).toBeNull();
    expect(flowSuggestion(false, 'master', -2)).toBeNull();
    expect(flowSuggestion(false, 'master', -3)).toBe('adept');
    expect(flowSuggestion(false, 'novice', -5)).toBeNull();
  });

  it('records count the current run of wins or defeats', async () => {
    const { loadSettings, recordResult } = await import('../src/ui/settings.ts');
    const s = loadSettings();
    recordResult(s, 'master', false, 300);
    recordResult(s, 'master', false, 300);
    expect(s.records.master!.streak).toBe(-2);
    recordResult(s, 'master', true, 300);
    expect(s.records.master!.streak).toBe(1);
    recordResult(s, 'master', true, 300);
    expect(s.records.master!.streak).toBe(2);
  });
});
