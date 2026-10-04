import { describe, expect, it } from 'vitest';
import { playMatch } from '../scripts/sim.ts';
import { AI_PROFILES, AiController, DIFFICULTIES } from '../src/ai/ai.ts';
import { LANE_LENGTH, TICK, UNITS, blessingCost } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';

describe('ai', () => {
  it('every difficulty spends gold and summons creatures', () => {
    for (const d of DIFFICULTIES) {
      const w = new World({ seed: 3 });
      const ai = new AiController(w, 1, AI_PROFILES[d], 5);
      for (let i = 0; i < 60 / TICK; i++) {
        ai.update(TICK);
        w.step();
      }
      expect(w.players[1].stats.summoned, d).toBeGreaterThan(3);
    }
  });

  it('a harder AI beats an easier one', () => {
    let wins = 0;
    for (let i = 0; i < 4; i++) if (playMatch('master', 'novice', 500 + i).winner === 0) wins++;
    expect(wins).toBe(4);
  });

  it('Mythic saves up for a turret once foes push past midfield; Master just summons', () => {
    const setup = (d: 'mythic' | 'master') => {
      const w = new World({ seed: 1 });
      const ai = new AiController(w, 1, AI_PROFILES[d], 2);
      const foe = w.spawnUnit(0, 1, UNITS.treant, LANE_LENGTH * 0.7);
      foe.def = { ...foe.def, speed: 0, damage: 0 };
      w.players[1].gold = 100; // a bolt turret costs 110
      for (let i = 0; i < 3 / TICK; i++) ai.update(TICK);
      return { w, ai, me: w.players[1] };
    };
    const master = setup('master');
    expect(master.me.queue.length).toBeGreaterThan(1);
    const { ai, me } = setup('mythic');
    expect(me.queue.length).toBe(1);
    expect(me.turrets[1].def).toBeNull();
    me.gold += 100;
    for (let i = 0; i < 1 / TICK; i++) ai.update(TICK);
    expect(me.turrets[1].def?.kind).toBe('bolt');
  });

  it('Mythic buys blessings without hoarding gold first', () => {
    const blessingsWith = (d: 'mythic' | 'master', gold: number) => {
      const w = new World({ seed: 1 });
      const ai = new AiController(w, 1, AI_PROFILES[d], 2);
      w.players[1].gold = gold;
      for (let i = 0; i < 3 / TICK; i++) ai.update(TICK);
      return w.players[1].blessings.might + w.players[1].blessings.vitality;
    };
    // Mythic buys with any gold to spare; Master keeps a creature's cost (30) in hand.
    const cost = blessingCost(0, 0);
    expect(blessingsWith('mythic', cost + 20)).toBe(1);
    expect(blessingsWith('master', cost + 20)).toBe(0);
  });

  it('mirror matches finish (Ragnarök resolves stalemates)', () => {
    for (let i = 0; i < 3; i++) {
      const r = playMatch('master', 'master', 900 + i, 45 * 60);
      expect(r.winner).not.toBeNull();
    }
  });
});
