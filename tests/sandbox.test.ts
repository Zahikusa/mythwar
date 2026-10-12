import { describe, expect, it } from 'vitest';
import { Game } from '../src/game.ts';
import { AGE_UNITS } from '../src/sim/data.ts';

describe('sandbox', () => {
  it('has no foe AI, endless gold and unbreakable citadels', () => {
    const g = new Game({ difficulty: 'novice', seed: 3, sandbox: true });
    expect(g.ai).toBeNull();
    g.advance(0.1);
    expect(g.world.players[0].gold).toBeGreaterThanOrEqual(99999);
    g.world.players[1].baseHp = 1;
    g.world.damageBase(1, 1e6, 0, 0);
    g.advance(0.05);
    expect(g.world.winner).toBeNull();
    expect(g.world.players[1].baseHp).toBe(g.world.players[1].baseMaxHp);
  });

  it('summons for either side, and both sides ascend together', () => {
    const g = new Game({ difficulty: 'novice', seed: 3, sandbox: true });
    g.advance(0.05);
    expect(g.command({ type: 'train', team: 0, unitId: AGE_UNITS[0][0].id, lane: 1 }).ok).toBe(true);
    g.sandboxFoe = true;
    expect(g.command({ type: 'train', team: 0, unitId: AGE_UNITS[0][1].id, lane: 2 }).ok).toBe(true);
    expect(g.world.players[0].queue).toHaveLength(1);
    expect(g.world.players[1].queue).toEqual([expect.objectContaining({ unitId: AGE_UNITS[0][1].id, lane: 2 })]);
    expect(g.command({ type: 'ageUp', team: 0 }).ok).toBe(true);
    expect(g.world.players.map((p) => p.age)).toEqual([1, 1]);
  });
});
