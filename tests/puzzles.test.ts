import { describe, expect, it } from 'vitest';
import { PUZZLES, puzzleById, puzzleWorld } from '../src/sim/puzzles.ts';
import { attempts, play } from '../scripts/puzzlecheck.ts';
import type { Attempt } from '../scripts/puzzlecheck.ts';

// The intended answers (one per riddle).
const ANSWERS: Record<string, Attempt> = {
  pack: { orders: [[1, 'treant'], [1, 'treant'], [1, 'treant'], [1, 'treant']] },
  labyrinth: { orders: [[1, 'gorgon'], [1, 'gorgon'], [1, 'gorgon']] },
  wall: { orders: [[2, 'jotunn'], [2, 'valkyrie'], [2, 'valkyrie']] },
  winter: { orders: [[0, 'fenrir'], [0, 'fenrir'], [0, 'fenrir']], cast: { lane: 0, at: 8 } },
};

describe('riddles of war', () => {
  it('open with a fixed purse, no income and the foe on the field', () => {
    const w = puzzleWorld(puzzleById('pack')!);
    expect(w.players[0].gold).toBe(120);
    expect(w.incomeOf(0)).toBe(0);
    expect(w.lanes[1].filter((u) => u.team === 1)).toHaveLength(6);
    expect(w.players[0].trials).toContain('godless');
  });

  for (const pz of PUZZLES) {
    it(`${pz.name}: the answer wins, most other ways of spending the purse don't`, () => {
      expect(play(pz, ANSWERS[pz.id])).toBe('won');
      const all = attempts(pz);
      const wins = all.filter((a) => play(pz, a) === 'won');
      expect(wins.length / all.length).toBeLessThan(0.25);
      // Doing nothing loses.
      expect(play(pz, { orders: [] })).toBe('lost');
      // The power riddle can't be solved without the power.
      if (pz.power) expect(wins.every((a) => a.cast)).toBe(true);
    });
  }
});
