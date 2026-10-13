import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world.ts';
import { battleTip } from '../src/ui/menus.ts';

describe('results tip', () => {
  it('after a win, suggests the next difficulty', () => {
    const w = new World();
    w.winner = 0;
    expect(battleTip(w, 0, 'novice', [])).toMatch(/flawless/);
    expect(battleTip(w, 0, 'mythic', [])).toMatch(/Trials/);
    w.players[0].baseHp = w.players[0].baseMaxHp * 0.4;
    expect(battleTip(w, 0, 'adept', [])).toMatch(/second star/);
    w.players[0].baseHp = w.players[0].baseMaxHp;
    w.time = 13 * 60;
    expect(battleTip(w, 0, 'adept', [])).toMatch(/within 12 minutes for the third star/);
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
    // Fed the enemy: creatures thrown away paid for its army.
    w.players[1].stats.killGold = 4000;
    w.players[0].stats.killGold = 2000;
    expect(battleTip(w, 0, 'adept', [])).toMatch(/paid the enemy 4000 gold/);
    w.players[0].stats.killGold = 3000;
    expect(battleTip(w, 0, 'adept', [])).not.toMatch(/paid the enemy/);
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

describe('battle stars', () => {
  it('one each for the victory, a citadel above half and the par time', async () => {
    const { battleStars, loadSettings, recordResult } = await import('../src/ui/settings.ts');
    expect(battleStars(true, 0.9, 5 * 60, 'adept').stars).toBe(3);
    expect(battleStars(true, 0.3, 5 * 60, 'adept').stars).toBe(2);
    expect(battleStars(true, 0.9, 13 * 60, 'adept').stars).toBe(2);
    expect(battleStars(true, 0.9, 13 * 60, 'master').stars).toBe(3);
    expect(battleStars(false, 1, 60, 'novice').stars).toBe(0);
    const s = loadSettings();
    recordResult(s, 'adept', true, 300, 2);
    recordResult(s, 'adept', true, 300, 1);
    expect(s.records.adept!.stars).toBe(2);
    // Quick battles: a par of two thirds, and no best time.
    expect(battleStars(true, 0.9, 9 * 60, 'adept', true).stars).toBe(2);
    expect(battleStars(true, 0.9, 7 * 60, 'adept', true).stars).toBe(3);
    recordResult(s, 'adept', true, 100, 3, true);
    expect(s.records.adept!.best).toBe(300);
  });
});

describe('star goals in the pause menu', () => {
  it('say which stars are still in reach', async () => {
    const { starGoals } = await import('../src/ui/menus.ts');
    const w = new World();
    w.time = 9 * 60 + 21;
    expect(starGoals(w, 0, 'adept')).toBe('Stars to win: ★ Victory · ★ Citadel above half (now 100%) · ★ Within 12 minutes (2:39 left)');
    w.players[0].baseHp = w.players[0].baseMaxHp * 0.3;
    w.time = 13 * 60;
    expect(starGoals(w, 0, 'adept')).toMatch(/☆ Citadel above half \(now 30%\) · ☆ Within 12 minutes \(passed\)/);
  });
});

describe('counter skill', () => {
  it('creature damage is split by class matchup, and a poor counterer is told so', async () => {
    const { UNITS } = await import('../src/sim/data.ts');
    const w = new World();
    const hunter = w.spawnUnit(1, 0, UNITS.redcap, 500);
    const mystic = w.spawnUnit(1, 1, UNITS.pixie, 500);
    w.damageUnit(hunter, 10, 'guardian', 'unit', null); // guardian beats hunter: ×1.5
    w.damageUnit(mystic, 10, 'guardian', 'unit', null); // mystic beats guardian: ×0.75
    w.damageUnit(mystic, 10, null, 'turret', null); // not a creature: not counted
    const cd = w.players[0].stats.classDamage;
    expect(cd[0]).toBeCloseTo(22.5);
    expect(cd[1]).toBeCloseTo(15);
    expect(cd[2]).toBeCloseTo(7.5);
    w.winner = 1;
    w.time = 400;
    w.players[0].stats.powersCast = 2;
    w.players[0].turrets[0].def = { id: 'thornspitter' } as never;
    w.players[0].stats.classDamage = [1000, 200, 500];
    expect(battleTip(w, 0, 'adept', [])).toMatch(/only 20% of your creatures’ damage hit a class they beat, and 50%/);
  });
});
