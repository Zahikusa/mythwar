import { describe, expect, it } from 'vitest';
import { AGES, AGE_UNITS, BLESSINGS, LANE_LENGTH, MAX_AGE, POWERS, RAGNAROK_AFTER_FINAL, RAGNAROK_TIME, SHRINE_X, TICK, UNITS, blessingCost, counterMultiplier } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';
import type { Team } from '../src/sim/types.ts';

function run(w: World, seconds: number, until?: () => boolean): void {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n; i++) {
    w.step();
    if (until && until()) return;
  }
}

function rich(w: World, team: Team = 0, gold = 1e6): void {
  w.players[team].gold = gold;
}

/** Puts both players into a given age (and makes them rich). */
function setAge(w: World, age: number): void {
  for (const p of w.players) {
    p.age = age;
    p.gold = 1e7;
    p.baseHp = p.baseMaxHp = AGES[age].baseHp;
  }
}

describe('data', () => {
  it('has three creatures per age (+ dragon in the last)', () => {
    for (let a = 0; a <= MAX_AGE; a++) {
      const n = a === MAX_AGE ? 4 : 3;
      expect(AGE_UNITS[a]).toHaveLength(n);
      expect(AGE_UNITS[a].slice(0, 3).map((u) => u.cls)).toEqual(['guardian', 'hunter', 'mystic']);
    }
  });

  it('counter triangle multipliers', () => {
    expect(counterMultiplier('guardian', 'hunter')).toBe(1.5);
    expect(counterMultiplier('hunter', 'mystic')).toBe(1.5);
    expect(counterMultiplier('mystic', 'guardian')).toBe(1.5);
    expect(counterMultiplier('hunter', 'guardian')).toBe(0.75);
    expect(counterMultiplier('guardian', 'guardian')).toBe(1);
    expect(counterMultiplier('legend', 'hunter')).toBe(1);
    expect(counterMultiplier(null, 'mystic')).toBe(1);
  });

  it('later ages are stronger and costlier', () => {
    for (let a = 1; a <= MAX_AGE; a++) {
      for (let c = 0; c < 3; c++) {
        expect(AGE_UNITS[a][c].hp).toBeGreaterThan(AGE_UNITS[a - 1][c].hp);
        expect(AGE_UNITS[a][c].cost).toBeGreaterThan(AGE_UNITS[a - 1][c].cost);
      }
      expect(AGES[a].xpRequired).toBeGreaterThan(AGES[a - 1].xpRequired);
    }
  });
});

describe('training and movement', () => {
  it('spends gold, queues and spawns after train time', () => {
    const w = new World();
    const g0 = w.players[0].gold;
    expect(w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 1 }).ok).toBe(true);
    expect(w.players[0].gold).toBe(g0 - UNITS.redcap.cost);
    expect(w.lanes[1]).toHaveLength(0);
    run(w, UNITS.redcap.trainTime + 0.05);
    expect(w.lanes[1]).toHaveLength(1);
    expect(w.lanes[1][0].team).toBe(0);
  });

  it('rejects creatures from other ages and full queues', () => {
    const w = new World();
    rich(w);
    expect(w.apply({ type: 'train', team: 0, unitId: 'minotaur', lane: 0 }).ok).toBe(false);
    for (let i = 0; i < 5; i++) expect(w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 0 }).ok).toBe(true);
    const r = w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 0 });
    expect(r.ok).toBe(false);
  });

  it('cancel refunds', () => {
    const w = new World();
    const g0 = w.players[0].gold;
    w.apply({ type: 'train', team: 0, unitId: 'pixie', lane: 2 });
    w.apply({ type: 'cancel', team: 0, index: 0 });
    expect(w.players[0].gold).toBe(g0);
    expect(w.players[0].queue).toHaveLength(0);
  });

  it('units walk toward the enemy and queue behind allies', () => {
    const w = new World();
    rich(w);
    w.apply({ type: 'train', team: 0, unitId: 'treant', lane: 0 });
    w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 0 });
    run(w, 10);
    const [a, b] = [...w.lanes[0]].sort((x, y) => y.x - x.x);
    expect(a.def.id).toBe('treant');
    expect(b.def.id).toBe('redcap');
    // The faster redcap is stuck behind the treant, not overlapping it.
    expect(a.x - a.def.radius - (b.x + b.def.radius)).toBeGreaterThanOrEqual(2.5);
  });

  it('a lone creature reaches and damages the enemy citadel', () => {
    const w = new World();
    w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 2 });
    run(w, 60);
    expect(w.players[1].baseHp).toBeLessThan(w.players[1].baseMaxHp);
    expect(w.players[0].stats.damageToBase).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed', () => {
    const play = () => {
      const w = new World({ seed: 7 });
      rich(w, 0);
      rich(w, 1);
      for (const id of ['treant', 'pixie', 'redcap']) {
        w.apply({ type: 'train', team: 0, unitId: id, lane: 1 });
        w.apply({ type: 'train', team: 1, unitId: id, lane: 1 });
      }
      run(w, 40);
      return w.units.map((u) => `${u.def.id}:${u.x.toFixed(3)}:${u.hp.toFixed(3)}`).join('|');
    };
    expect(play()).toBe(play());
  });
});

/** Spawns a single unit per side in lane 0 and fights to the death; returns the winning team. */
function duel(a: string, b: string): Team | null {
  const w = new World();
  w.spawnUnit(0, 0, UNITS[a], 400);
  w.spawnUnit(1, 0, UNITS[b], 600);
  run(w, 60, () => w.lanes[0].filter((u) => u.alive).length < 2);
  const alive = w.lanes[0].filter((u) => u.alive);
  return alive.length === 1 ? alive[0].team : null;
}

describe('combat', () => {
  it('counter triangle wins 1v1 in every age', () => {
    for (let age = 0; age <= MAX_AGE; age++) {
      const [g, h, m] = AGE_UNITS[age];
      expect(duel(g.id, h.id), `${g.id} vs ${h.id}`).toBe(0);
      expect(duel(h.id, m.id), `${h.id} vs ${m.id}`).toBe(0);
      expect(duel(m.id, g.id), `${m.id} vs ${g.id}`).toBe(0);
    }
  });

  it('a later-age creature beats an earlier-age one of the same class', () => {
    expect(duel('minotaur', 'treant')).toBe(0);
    expect(duel('fenrir', 'centaur')).toBe(0);
  });

  it('kills reward gold and xp to the killer', () => {
    const w = new World();
    w.spawnUnit(0, 1, UNITS.treant, 450);
    w.spawnUnit(1, 1, UNITS.redcap, 550);
    const g = w.players[0].gold;
    run(w, 30, () => w.players[0].stats.kills > 0);
    expect(w.players[0].stats.kills).toBe(1);
    expect(w.players[0].xp).toBeGreaterThanOrEqual(UNITS.redcap.cost);
    expect(w.players[0].gold).toBeGreaterThan(g + UNITS.redcap.cost * 0.8);
  });

  it('phoenix is reborn once', () => {
    const w = new World();
    const ph = w.spawnUnit(1, 0, UNITS.phoenix, 600);
    w.damageUnit(ph, ph.maxHp * 2, null, 'power', null);
    expect(ph.alive).toBe(true);
    expect(ph.hp).toBeCloseTo(ph.maxHp * 0.5);
    w.damageUnit(ph, ph.maxHp * 2, null, 'power', null);
    expect(ph.alive).toBe(false);
  });

  it('ranged creatures shoot over their frontline', () => {
    const w = new World();
    w.spawnUnit(0, 0, UNITS.treant, 480);
    const pix = w.spawnUnit(0, 0, UNITS.pixie, 400);
    w.spawnUnit(1, 0, UNITS.treant, 520);
    run(w, 3);
    expect(w.drainEvents().some((e) => e.type === 'projectile')).toBe(true);
    expect(pix.x).toBeLessThan(470);
  });

  it('melee creatures walk past their ranged allies to the front', () => {
    const w = new World();
    w.spawnUnit(0, 0, UNITS.pixie, 300);
    const t = w.spawnUnit(0, 0, UNITS.treant, 250);
    w.spawnUnit(1, 0, UNITS.treant, 520);
    run(w, 8);
    expect(t.x).toBeGreaterThan(330);
  });

  it('flyers pass over allied creatures', () => {
    const w = new World();
    setAge(w, 2);
    w.spawnUnit(0, 0, UNITS.jotunn, 300);
    const v = w.spawnUnit(0, 0, UNITS.valkyrie, 250);
    run(w, 6);
    expect(v.x).toBeGreaterThan(300);
  });

  it('turrets defend their lane', () => {
    const w = new World();
    rich(w, 0);
    expect(w.apply({ type: 'buildTurret', team: 0, lane: 1, turretId: 'thornspitter' }).ok).toBe(true);
    const e = w.spawnUnit(1, 1, UNITS.redcap, 260);
    run(w, 20, () => !e.alive);
    expect(e.alive).toBe(false);
    expect(w.players[0].baseMaxHp - w.players[0].baseHp).toBeLessThan(UNITS.redcap.damage * 3);
  });

  it('replacing a turret refunds half of the old one', () => {
    const w = new World();
    rich(w, 0, 1000);
    w.apply({ type: 'buildTurret', team: 0, lane: 2, turretId: 'thornspitter' });
    const g = w.players[0].gold;
    expect(w.apply({ type: 'buildTurret', team: 0, lane: 2, turretId: 'sporepod' }).ok).toBe(true);
    expect(w.players[0].gold).toBe(g + Math.floor(110 * 0.5) - 150);
    expect(w.players[0].turrets[2].def?.id).toBe('sporepod');
    expect(w.apply({ type: 'buildTurret', team: 0, lane: 2, turretId: 'sporepod' }).ok).toBe(false);
  });

  it('selling a turret refunds half', () => {
    const w = new World();
    rich(w, 0, 1000);
    w.apply({ type: 'buildTurret', team: 0, lane: 0, turretId: 'sporepod' });
    const g = w.players[0].gold;
    w.apply({ type: 'sellTurret', team: 0, lane: 0 });
    expect(w.players[0].gold).toBe(g + Math.floor(150 * 0.5));
    expect(w.players[0].turrets[0].def).toBeNull();
  });
});

describe('ages', () => {
  it('ascending needs xp and gold, then upgrades the citadel', () => {
    const w = new World();
    expect(w.apply({ type: 'ageUp', team: 0 }).ok).toBe(false);
    w.players[0].xp = AGES[1].xpRequired;
    w.players[0].gold = AGES[1].ascendCost;
    const hpBefore = w.players[0].baseHp;
    expect(w.apply({ type: 'ageUp', team: 0 }).ok).toBe(true);
    expect(w.players[0].age).toBe(1);
    expect(w.players[0].baseMaxHp).toBe(AGES[1].baseHp);
    expect(w.players[0].baseHp).toBe(hpBefore + AGES[1].baseHp - AGES[0].baseHp);
    expect(w.apply({ type: 'train', team: 0, unitId: 'treant', lane: 0 }).ok).toBe(false);
    w.players[0].gold = 1000;
    expect(w.apply({ type: 'train', team: 0, unitId: 'centaur', lane: 0 }).ok).toBe(true);
  });

  it('only one elder dragon at a time', () => {
    const w = new World();
    setAge(w, 4);
    expect(w.apply({ type: 'train', team: 0, unitId: 'dragon', lane: 0 }).ok).toBe(true);
    expect(w.apply({ type: 'train', team: 0, unitId: 'dragon', lane: 1 }).ok).toBe(false);
  });
});

describe('shrines', () => {
  it('are captured by uncontested presence and add income', () => {
    const w = new World();
    const before = w.incomeOf(0);
    const u = w.spawnUnit(0, 1, UNITS.treant, SHRINE_X);
    u.def = { ...u.def, speed: 0 };
    run(w, 4.2);
    expect(w.shrines[1].owner).toBe(0);
    expect(w.incomeOf(0)).toBeCloseTo(before + AGES[0].shrineIncome);
  });

  it('contested shrines do not change hands', () => {
    const w = new World();
    const a = w.spawnUnit(0, 2, UNITS.treant, SHRINE_X - 30);
    const b = w.spawnUnit(1, 2, UNITS.treant, SHRINE_X + 30);
    a.def = { ...a.def, damage: 0 };
    b.def = { ...b.def, damage: 0 };
    run(w, 6);
    expect(w.shrines[2].owner).toBe(-1);
    expect(w.shrines[2].contested).toBe(true);
  });
});

describe('god powers', () => {
  const kinds = [0, 1, 2, 3, 4];
  for (const age of kinds) {
    it(`${AGES[age].power} damages only enemies in the target lane`, () => {
      const w = new World();
      setAge(w, age);
      w.players[0].powerCooldown = 0;
      const def = AGE_UNITS[age][0];
      const inLane = [w.spawnUnit(1, 1, def, 700), w.spawnUnit(1, 1, def, 800)];
      const other = w.spawnUnit(1, 0, def, 700);
      const friend = w.spawnUnit(0, 1, def, 300);
      for (const u of [...inLane, other, friend]) u.def = { ...u.def, speed: 0, damage: 0 };
      expect(w.apply({ type: 'power', team: 0, lane: 1 }).ok).toBe(true);
      expect(w.apply({ type: 'power', team: 0, lane: 1 }).ok).toBe(false);
      run(w, 5);
      for (const u of inLane) expect(u.hp, POWERS[AGES[age].power].name).toBeLessThan(u.maxHp);
      expect(other.hp).toBe(other.maxHp);
      expect(friend.hp).toBe(friend.maxHp);
    });
  }

  it('fimbulwinter freezes enemies', () => {
    const w = new World();
    setAge(w, 2);
    w.players[0].powerCooldown = 0;
    const e = w.spawnUnit(1, 0, UNITS.jotunn, 700);
    w.apply({ type: 'power', team: 0, lane: 0 });
    run(w, 1);
    const x = e.x;
    run(w, 1.5);
    expect(e.x).toBe(x);
  });
});

describe('victory', () => {
  it('destroying a citadel ends the game', () => {
    const w = new World();
    w.players[1].baseHp = 5;
    w.spawnUnit(0, 0, UNITS.redcap, LANE_LENGTH - 30);
    run(w, 5);
    expect(w.winner).toBe(0);
    const ev = w.drainEvents();
    expect(ev.some((e) => e.type === 'gameOver')).toBe(true);
    expect(w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 0 }).ok).toBe(false);
  });
});

describe('blessings', () => {
  it('cost gold, rank up and cap at five', () => {
    const w = new World();
    w.players[0].gold = blessingCost(0, 0) - 1;
    expect(w.apply({ type: 'bless', team: 0, blessing: 'might' }).ok).toBe(false);
    w.players[0].gold = 1e6;
    for (let i = 0; i < 5; i++) expect(w.apply({ type: 'bless', team: 0, blessing: 'might' }).ok).toBe(true);
    expect(w.players[0].blessings.might).toBe(5);
    expect(w.apply({ type: 'bless', team: 0, blessing: 'might' }).ok).toBe(false);
    expect(blessingCost(1, 0)).toBeGreaterThan(blessingCost(0, 0));
    expect(blessingCost(0, 4)).toBeGreaterThan(blessingCost(0, 0));
  });

  it('might raises creature damage', () => {
    const hitFor = (rank: number) => {
      const w = new World();
      w.players[0].blessings.might = rank;
      w.spawnUnit(0, 0, UNITS.redcap, 480);
      const e = w.spawnUnit(1, 0, UNITS.redcap, 520);
      run(w, 5, () => e.hp < e.maxHp);
      return e.maxHp - e.hp;
    };
    expect(hitFor(3)).toBeCloseTo(hitFor(0) * (1 + 3 * BLESSINGS.might.perRank), 5);
  });

  it('vitality raises the health of new creatures', () => {
    const w = new World();
    w.players[0].blessings.vitality = 2;
    const u = w.spawnUnit(0, 0, UNITS.treant);
    expect(u.maxHp).toBeCloseTo(UNITS.treant.hp * 1.2);
  });

  it('bastion raises citadel health immediately and after ascending', () => {
    const w = new World();
    w.players[0].gold = 1e6;
    const before = w.players[0].baseMaxHp;
    w.apply({ type: 'bless', team: 0, blessing: 'bastion' });
    expect(w.players[0].baseMaxHp).toBeCloseTo(before * (1 + BLESSINGS.bastion.perRank));
    expect(w.players[0].baseHp).toBeCloseTo(w.players[0].baseMaxHp);
    w.players[0].xp = AGES[1].xpRequired;
    w.apply({ type: 'ageUp', team: 0 });
    expect(w.players[0].baseMaxHp).toBeCloseTo(AGES[1].baseHp * (1 + BLESSINGS.bastion.perRank));
  });
});

describe('ragnarok', () => {
  it('begins on time, silences wards and ramps citadel damage', () => {
    const w = new World();
    w.time = RAGNAROK_TIME - 0.01;
    run(w, 0.1);
    expect(w.ragnarokStarted).toBe(true);
    expect(w.drainEvents().some((e) => e.type === 'ragnarok')).toBe(true);
    // Wards do not fire any more.
    w.spawnUnit(1, 0, UNITS.redcap, 60);
    run(w, 2);
    expect(w.projectiles.filter((p) => p.fromTurret).length).toBe(0);
    // Damage to citadels grows over time.
    const m0 = w.siegeMult();
    run(w, 30);
    expect(w.siegeMult()).toBeGreaterThan(m0);
  });

  it('comes early once both sides reach the final age', () => {
    const w = new World();
    setAge(w, MAX_AGE);
    run(w, 1);
    expect(w.ragnarokAt).toBeLessThanOrEqual(1 + RAGNAROK_AFTER_FINAL + 0.01);
  });
});

describe('formations', () => {
  it('hunters crowd into a pack instead of queueing', () => {
    const w = new World();
    const a = w.spawnUnit(0, 0, UNITS.redcap, 100);
    const b = w.spawnUnit(0, 0, UNITS.redcap, 60);
    w.spawnUnit(1, 0, UNITS.treant, 400);
    w.lanes[0][2].def = { ...UNITS.treant, speed: 0, damage: 0 };
    run(w, 10);
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
  });

  it("guardians' blows sweep through packed foes", () => {
    const w = new World();
    w.spawnUnit(0, 0, UNITS.treant, 470);
    const h1 = w.spawnUnit(1, 0, UNITS.redcap, 500);
    const h2 = w.spawnUnit(1, 0, UNITS.redcap, 504);
    for (const h of [h1, h2]) h.def = { ...h.def, damage: 0, speed: 0 };
    run(w, 3);
    expect(h1.hp).toBeLessThan(h1.maxHp);
    expect(h2.hp).toBeLessThan(h2.maxHp);
  });
});

describe('counter triangle at army scale (equal gold)', async () => {
  const { battle } = await import('../scripts/classwar.ts');
  for (let age = 0; age <= MAX_AGE; age++) {
    it(`holds in age ${age + 1}`, () => {
      const [g, h, m] = AGE_UNITS[age];
      const budget = g.cost * 10;
      expect(battle([g], [h], budget), 'guardians beat hunters').toBeGreaterThan(0);
      expect(battle([h], [m], budget), 'hunters beat mystics').toBeGreaterThan(0);
      expect(battle([m], [g], budget), 'mystics beat guardians').toBeGreaterThan(0);
    });
  }
});
