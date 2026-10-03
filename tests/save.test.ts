import { describe, expect, it } from 'vitest';
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import { TICK } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';

function fingerprint(w: World): string {
  const units = w.units.map((u) => `${u.id}:${u.def.id}:${u.x.toFixed(4)}:${u.hp.toFixed(4)}`).join('|');
  const p = w.players.map((pl) => `${pl.gold.toFixed(3)}:${pl.xp.toFixed(3)}:${pl.age}:${pl.baseHp.toFixed(3)}:${pl.queue.length}`).join('/');
  return `${w.time.toFixed(3)}#${p}#${units}#${w.projectiles.length}#${w.shrines.map((s) => s.capture.toFixed(4)).join(',')}`;
}

describe('save games', () => {
  it('a restored battle continues exactly like the original', () => {
    const w = new World({ seed: 42 });
    const ais = [new AiController(w, 0, AI_PROFILES.master, 1), new AiController(w, 1, AI_PROFILES.mythic, 2)];
    const steps = (world: World, ctrls: AiController[], seconds: number) => {
      for (let i = 0; i < seconds / TICK; i++) {
        for (const c of ctrls) c.update(TICK);
        world.step();
        world.drainEvents();
      }
    };
    steps(w, ais, 420);
    // Force some in-flight power state into the snapshot.
    w.players[0].age = 4;
    w.players[0].powerCooldown = 0;
    w.apply({ type: 'power', team: 0, lane: 1 });
    steps(w, ais, 0.5);

    const snap = JSON.parse(JSON.stringify(w.serialize()));
    const aiSnaps = ais.map((a) => a.snapshot());
    const w2 = World.deserialize(snap);
    const ais2 = [new AiController(w2, 0, AI_PROFILES.master, 999), new AiController(w2, 1, AI_PROFILES.mythic, 999)];
    ais2.forEach((a, i) => a.restore(aiSnaps[i]));
    expect(fingerprint(w2)).toBe(fingerprint(w));

    steps(w, ais, 90);
    steps(w2, ais2, 90);
    expect(fingerprint(w2)).toBe(fingerprint(w));
  });

  it('rejects unknown data', () => {
    expect(() => World.deserialize({ v: 2 } as never)).toThrow();
  });
});
