import { describe, expect, it } from 'vitest';
import { AGES, TICK, UNITS } from '../src/sim/data.ts';
import type { PowerKind } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';
import type { SimEvent, Team, Unit } from '../src/sim/types.ts';

/** Steps the world, collecting every event. */
function run(w: World, seconds: number, log: SimEvent[] = []): SimEvent[] {
  for (let i = 0; i < Math.round(seconds / TICK); i++) {
    w.step();
    log.push(...w.drainEvents());
  }
  return log;
}

/** A harmless, immobile, near-unkillable target. */
function dummy(w: World, team: Team, x: number, id = 'treant'): Unit {
  const u = w.spawnUnit(team, 0, UNITS[id], x);
  u.def = { ...u.def, damage: 0, speed: 0, traits: [] };
  u.hp = u.maxHp = 1e7;
  return u;
}

const hitsOn = (log: SimEvent[], id: number, source?: string) =>
  log.filter((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit' && e.targetId === id && (!source || e.source === source));

describe('creature traits', () => {
  it('regrowth heals the Treant over time', () => {
    const w = new World();
    const t = w.spawnUnit(0, 0, UNITS.treant, 100);
    t.hp = t.maxHp * 0.5;
    run(w, 3);
    expect(t.hp).toBeGreaterThan(t.maxHp * 0.5 + t.maxHp * 0.012 * 2.9);
  });

  it("the Centaur's charge doubles its first blow after running", () => {
    const w = new World();
    w.spawnUnit(0, 0, UNITS.centaur, 300);
    const d = dummy(w, 1, 520, 'minotaur');
    const hits = hitsOn(run(w, 8), d.id, 'unit');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0].amount / hits[1].amount).toBeCloseTo(2, 5);
  });

  it("the Gorgon's gaze slows its target", () => {
    const w = new World();
    w.spawnUnit(0, 0, UNITS.gorgon, 400);
    const d = dummy(w, 1, 520);
    run(w, 3);
    expect(d.slowTimer).toBeGreaterThan(0);
    expect(d.slowFactor).toBeCloseTo(0.55, 5);
  });

  it('Fenrir heals for a fifth of the damage it deals', () => {
    const w = new World();
    const f = w.spawnUnit(0, 0, UNITS.fenrir, 480);
    f.hp = f.maxHp * 0.5;
    const d = dummy(w, 1, 520);
    const hits = hitsOn(run(w, 3), d.id, 'unit');
    const dealt = hits.reduce((a, h) => a + h.amount, 0);
    expect(dealt).toBeGreaterThan(0);
    expect(f.hp).toBeCloseTo(f.maxHp * 0.5 + dealt * 0.2, 3);
  });

  it("Fenrir's lifesteal counts only the health its victim had left", () => {
    const w = new World();
    const f = w.spawnUnit(0, 0, UNITS.fenrir, 480);
    f.hp = f.maxHp * 0.5;
    const victim = w.spawnUnit(1, 0, UNITS.redcap, 520);
    victim.def = { ...victim.def, damage: 0, speed: 0 };
    victim.hp = 2;
    run(w, 3);
    expect(victim.alive).toBe(false);
    expect(f.hp).toBeCloseTo(f.maxHp * 0.5 + 2 * 0.2, 3);
  });

  it('the Oni attacks faster once enraged', () => {
    const attacks = (hpFrac: number) => {
      const w = new World();
      const o = w.spawnUnit(0, 0, UNITS.oni, 480);
      o.hp = o.maxHp * hpFrac;
      dummy(w, 1, 520);
      const log = run(w, 12);
      return { n: log.filter((e) => e.type === 'attack' && e.unitId === o.id).length, enraged: o.enraged };
    };
    const calm = attacks(1);
    const angry = attacks(0.4);
    expect(calm.enraged).toBe(false);
    expect(angry.enraged).toBe(true);
    expect(angry.n / calm.n).toBeGreaterThan(1.3);
  });

  it("the Kitsune's foxfire bounces to nearby foes", () => {
    const w = new World();
    w.spawnUnit(0, 0, UNITS.kitsune, 380);
    const ds = [dummy(w, 1, 520), dummy(w, 1, 560), dummy(w, 1, 600)];
    const log = run(w, 2.5);
    for (const d of ds) expect(hitsOn(log, d.id).length, `dummy at ${d.x}`).toBeGreaterThan(0);
  });

  it("the Elder Dragon's fire splashes around the target", () => {
    const w = new World();
    w.spawnUnit(0, 0, UNITS.dragon, 380);
    const near = [dummy(w, 1, 520), dummy(w, 1, 545)];
    const far = dummy(w, 1, 700);
    const log = run(w, 4);
    for (const d of near) expect(hitsOn(log, d.id).length).toBeGreaterThan(0);
    expect(hitsOn(log, far.id).length).toBe(0);
  });
});

describe('god powers', () => {
  function cast(kind: PowerKind, foes: number[]): { w: World; log: SimEvent[]; units: Unit[] } {
    const w = new World();
    const units = foes.map((x) => dummy(w, 1, x));
    for (const u of units) u.hp = u.maxHp = 1e7;
    w.players[0].age = AGES.findIndex((a) => a.power === kind);
    w.players[0].powerCooldown = 0;
    expect(w.apply({ type: 'power', team: 0, lane: 0 }).ok).toBe(true);
    const log = run(w, 4);
    return { w, log, units };
  }

  it('Briar Snare damages and roots every foe in the lane', () => {
    const { log, units } = cast('briar', [500, 600, 700]);
    for (const u of units) {
      expect(hitsOn(log, u.id, 'power').length).toBe(1);
    }
    // Roots last a while after the strike (checked right after it lands).
    const w = new World();
    const u = dummy(w, 1, 500);
    w.players[0].powerCooldown = 0;
    w.apply({ type: 'power', team: 0, lane: 0 });
    run(w, 0.5);
    expect(u.rootTimer).toBeGreaterThan(1);
  });

  it('Wrath of Zeus throws all its bolts, favouring unstruck foes', () => {
    const { log, units } = cast('zeus', [450, 600, 750]);
    const strikes = log.filter((e) => e.type === 'strike' && e.kind === 'zeus');
    expect(strikes.length).toBe(7);
    for (const u of units) expect(hitsOn(log, u.id, 'power').length).toBeGreaterThan(0);
  });

  it('the Spirit Dragon strikes each foe exactly once', () => {
    const { log, units } = cast('spiritdragon', [300, 500, 700, 900]);
    for (const u of units) expect(hitsOn(log, u.id, 'power').length).toBe(1);
  });

  it('Starfall meteors damage foes where they land', () => {
    const { log, units } = cast('starfall', [600]);
    expect(log.filter((e) => e.type === 'meteor').length).toBe(14);
    expect(hitsOn(log, units[0].id, 'power').length).toBeGreaterThan(5);
  });
});

describe('reach', () => {
  it('melee creatures only start a swing at a foe within reach', async () => {
    const { AI_PROFILES, AiController } = await import('../src/ai/ai.ts');
    const w = new World({ seed: 77 });
    const ais = [new AiController(w, 0, AI_PROFILES.master, 1), new AiController(w, 1, AI_PROFILES.master, 2)];
    let checked = 0;
    for (let i = 0; i < Math.round(240 / TICK) && w.winner === null; i++) {
      for (const a of ais) a.update(TICK);
      w.step();
      for (const e of w.drainEvents()) {
        if (e.type !== 'attack' || e.ranged) continue;
        const u = w.unitById.get(e.unitId);
        const t = u && u.pendingTarget >= 0 ? w.unitById.get(u.pendingTarget) : undefined;
        if (!u || !t) continue; // (base attacks, or the target fell later in the same tick)
        expect(w.edgeDist(u, t), `${u.def.id} → ${t.def.id}`).toBeLessThanOrEqual(u.def.range + 1e-6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('reach after a shared target falls', () => {
  it("a pack-mate doesn't start swinging at the next foe a step away", () => {
    const w = new World();
    const a = w.spawnUnit(0, 0, UNITS.redcap, 401);
    const b = w.spawnUnit(0, 0, UNITS.redcap, 400);
    const x = dummy(w, 1, a.x + a.def.radius + UNITS.treant.radius + 2);
    x.hp = 0.5;
    const y = dummy(w, 1, x.x + 12);
    for (const u of [x, y]) u.freezeTimer = 99;
    // a's blow lands this tick (killing x); b is just ready to swing.
    a.windupTimer = 1e-6;
    a.pendingTarget = x.id;
    a.attackTimer = 1;
    b.attackTimer = TICK * 0.5;
    w.step();
    expect(x.alive).toBe(false);
    expect(w.edgeDist(b, y)).toBeGreaterThan(b.def.range);
    expect(b.attackStart).not.toBe(w.time); // it steps in instead of swinging at thin air
  });
});
