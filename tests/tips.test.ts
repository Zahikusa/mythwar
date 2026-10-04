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
