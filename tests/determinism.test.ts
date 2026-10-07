import { describe, expect, it } from 'vitest';
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import { cleanCode, cleanName } from '../src/net/protocol.ts';
import { hashWorld } from '../src/sim/hash.ts';
import type { Command } from '../src/sim/types.ts';
import { World } from '../src/sim/world.ts';

/** Plays an AI-vs-AI battle, recording every command the AIs issue together with its tick. */
function recordBattle(seed: number, ticks: number): { world: World; log: { tick: number; cmd: Command }[]; hashes: number[] } {
  const world = new World({ seed });
  const log: { tick: number; cmd: Command }[] = [];
  const apply = world.apply.bind(world);
  world.apply = (cmd: Command) => {
    log.push({ tick: world.tick + 1, cmd: structuredClone(cmd) });
    return apply(cmd);
  };
  const ais = [new AiController(world, 0, AI_PROFILES.mythic, seed + 1), new AiController(world, 1, AI_PROFILES.master, seed + 2)];
  const hashes: number[] = [];
  for (let i = 0; i < ticks && world.winner === null; i++) {
    for (const ai of ais) ai.update(1 / 60);
    world.step();
    world.drainEvents();
    hashes.push(hashWorld(world));
  }
  world.apply = apply;
  return { world, log, hashes };
}

/** Replays a command log on a fresh world (what a multiplayer client does). */
function replay(world: World, log: { tick: number; cmd: Command }[], untilTick: number, hashes?: number[]): void {
  let i = log.findIndex((e) => e.tick > world.tick);
  if (i < 0) i = log.length;
  while (world.tick < untilTick && world.winner === null) {
    while (i < log.length && log[i].tick === world.tick + 1) world.apply(log[i++].cmd);
    world.step();
    world.drainEvents();
    if (hashes) expect(hashWorld(world)).toBe(hashes[world.tick - 1]);
  }
}

describe('lockstep determinism', () => {
  it('replaying the command log reproduces the battle tick for tick', () => {
    const { world, log, hashes } = recordBattle(77, 60 * 60 * 6);
    expect(log.length).toBeGreaterThan(50);
    const copy = new World({ seed: 77 });
    // AI controllers set the income multipliers; a multiplayer world uses the defaults.
    copy.players[0].incomeMult = AI_PROFILES.mythic.incomeMult;
    copy.players[1].incomeMult = AI_PROFILES.master.incomeMult;
    replay(copy, log, world.tick, hashes);
    expect(hashWorld(copy)).toBe(hashWorld(world));
  });

  it('a snapshot taken mid-battle continues identically (reconnect / resync)', () => {
    const { world, log, hashes } = recordBattle(4242, 60 * 60 * 8);
    const copy = new World({ seed: 4242 });
    copy.players[0].incomeMult = AI_PROFILES.mythic.incomeMult;
    copy.players[1].incomeMult = AI_PROFILES.master.incomeMult;
    replay(copy, log, 60 * 60 * 3 + 17);
    // Over the wire and back.
    const restored = World.deserialize(JSON.parse(JSON.stringify(copy.serialize())));
    expect(hashWorld(restored)).toBe(hashWorld(copy));
    replay(restored, log, world.tick, hashes);
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });

  it('the hash notices small differences', () => {
    const a = new World({ seed: 1 });
    const b = new World({ seed: 1 });
    expect(hashWorld(a)).toBe(hashWorld(b));
    b.players[1].gold += 1e-9;
    expect(hashWorld(a)).not.toBe(hashWorld(b));
    const c = new World({ seed: 2 });
    expect(hashWorld(a)).not.toBe(hashWorld(c));
  });
});

describe('late cancel orders', () => {
  it('cancel follows the creature when the queue has moved on', () => {
    const w = new World({ seed: 3 });
    w.players[0].gold = 1000;
    w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 0 });
    w.apply({ type: 'train', team: 0, unitId: 'pixie', lane: 1 });
    // The player tapped the pixie (index 1) but meanwhile the redcap stepped out.
    w.players[0].queue.shift();
    const gold = w.players[0].gold;
    expect(w.apply({ type: 'cancel', team: 0, index: 1, unitId: 'pixie' }).ok).toBe(true);
    expect(w.players[0].queue.length).toBe(0);
    expect(w.players[0].gold).toBeGreaterThan(gold);
    expect(w.apply({ type: 'cancel', team: 0, index: 0, unitId: 'pixie' }).ok).toBe(false);
  });
});

describe('protocol helpers', () => {
  it('cleans names', () => {
    expect(cleanName('  Ada \n Lovelace  ')).toBe('Ada Lovelace');
    expect(cleanName('<script>')).toBe('script');
    expect(cleanName('')).toBe('Player');
    expect(cleanName(42)).toBe('Player');
    expect([...cleanName('x'.repeat(40))].length).toBe(16);
  });

  it('cleans room codes', () => {
    expect(cleanCode(' abcd ')).toBe('ABCD');
    expect(cleanCode('AB-CD')).toBe('ABCD');
    expect(cleanCode('ABC')).toBeNull();
    expect(cleanCode('AB0D')).toBeNull();
    expect(cleanCode(null)).toBeNull();
  });
});
