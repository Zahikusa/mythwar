import { describe, expect, it } from 'vitest';
import { scoreLine } from '../src/ui/menus.ts';
import type { OnlineResult } from '../src/ui/menus.ts';

const duel = (o: Partial<OnlineResult>): OnlineResult => ({ foe: 'Bo', reason: 'citadel', score: null, ...o });

describe('the online results: the line under the verdict', () => {
  it('a duel with the room score shows the score, however it ended', () => {
    for (const reason of ['citadel', 'forfeit', 'timeout'] as const) {
      expect(scoreLine(duel({ reason, score: [2, 1] }), true)).toBe('Score in this room: you 2 – 1 Bo');
    }
  });

  it('without a score (the other left the room): praise only for a battle fought out (backlog 234)', () => {
    expect(scoreLine(duel({}), true)).toBe('Well fought!');
    expect(scoreLine(duel({}), false)).toBe('Well fought!');
    expect(scoreLine(duel({ reason: 'forfeit' }), true)).toBe('A win by walkover.');
    expect(scoreLine(duel({ reason: 'timeout' }), true)).toBe('A win by walkover.');
    expect(scoreLine(duel({ reason: 'forfeit' }), false)).toBe('');
    expect(scoreLine(duel({ reason: 'timeout' }), false)).toBe('');
  });

  it('co-op: the allies’ victories, or a word for one who finished alone', () => {
    const coop = (o: Partial<OnlineResult>) => duel({ foe: 'Novice', ally: 'Bo', coop: 'novice', ...o });
    expect(scoreLine(coop({ score: [3, 0] }), true)).toBe('Victories together in this room: 3');
    expect(scoreLine(coop({}), true)).toBe('Well fought, together!');
    expect(scoreLine(coop({ alone: true }), true)).toBe('Well fought — alone at the end!');
  });
});
