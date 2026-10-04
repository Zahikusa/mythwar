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

  it('refuses to resume a battle that is already decided', async () => {
    const { Game } = await import('../src/game.ts');
    const g = new Game({ difficulty: 'novice', seed: 1 });
    g.world.players[1].baseHp = 1;
    g.world.damageBase(1, 10, 0, 0);
    g.world.step();
    expect(() => Game.fromSave(g.toSave())).toThrow();
  });

  it('rejects unknown data', () => {
    expect(() => World.deserialize({ v: 2 } as never)).toThrow();
  });
});

describe('fast-forward', () => {
  it('keeps ascensions, chart history and the game over', async () => {
    const { Game } = await import('../src/game.ts');
    const g = new Game({ difficulty: 'mythic', seed: 5, demo: true });
    const seen: string[] = [];
    g.onEvents((ev) => seen.push(...ev.map((e) => e.type)));
    g.fastForward(60 * 60);
    expect(g.world.winner).not.toBeNull();
    expect(g.over).toBe(true);
    expect(seen).toEqual(['gameOver']);
    expect(g.ageUps.length).toBeGreaterThan(0);
    for (const a of g.ageUps) expect(a.t).toBeLessThanOrEqual(g.world.time);
    expect(g.history.length).toBeGreaterThan(10);
  });
});

describe('snapshots', () => {
  it('deserializing leaves the snapshot untouched and unshared', () => {
    const w = new World({ seed: 9 });
    w.players[0].gold = 1e4;
    w.apply({ type: 'train', team: 0, unitId: 'treant', lane: 0 });
    const snap = w.serialize();
    const before = JSON.stringify(snap);
    const a = World.deserialize(snap);
    const b = World.deserialize(snap);
    a.players[0].queue.length = 0;
    a.shrines[0].capture = 0.5;
    a.step();
    expect(JSON.stringify(snap)).toBe(before);
    expect(b.players[0].queue.length).toBe(1);
    expect(b.shrines[0].capture).not.toBe(0.5);
  });
});
