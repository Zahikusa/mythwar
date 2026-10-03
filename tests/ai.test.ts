import { describe, expect, it } from 'vitest';
import { playMatch } from '../scripts/sim.ts';
import { AI_PROFILES, AiController, DIFFICULTIES } from '../src/ai/ai.ts';
import { TICK } from '../src/sim/data.ts';
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

  it('mirror matches finish (Ragnarök resolves stalemates)', () => {
    for (let i = 0; i < 3; i++) {
      const r = playMatch('master', 'master', 900 + i, 45 * 60);
      expect(r.winner).not.toBeNull();
    }
  });
});
