import { describe, expect, it } from 'vitest';
import { AGES, AGE_UNITS, BLESSINGS, BLESSING_PRICE_FLOOR_AGE, LANE_LENGTH, MAX_AGE, POWERS, RAGNAROK_AFTER_FINAL, RAGNAROK_CRUMBLE, RAGNAROK_CRUMBLE_AFTER, RAGNAROK_TIME, SHRINE_X, HOLD_PAST_SHRINE, SURGE_FIRST, SURGE_INCOME, SURGE_OMEN, SURGE_TIME, TICK, UNITS, blessingCost, counterMultiplier } from '../src/sim/data.ts';
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

  it('a jammed gate does not hold up summons for other lanes', () => {
    const w = new World();
    rich(w);
    // Our own creature stands in the top-lane gateway (rooted in place).
    const blocker = w.spawnUnit(0, 0, UNITS.treant, UNITS.treant.radius + 2);
    blocker.def = { ...blocker.def, speed: 0 };
    w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 0 });
    w.apply({ type: 'train', team: 0, unitId: 'redcap', lane: 2 });
    run(w, UNITS.redcap.trainTime * 2 + 0.2);
    expect(w.lanes[2].some((u) => u.team === 0)).toBe(true);
    expect(w.players[0].queue).toHaveLength(1);
    expect(w.players[0].queue[0].ready).toBe(true);
    // Once the gate clears, the waiting creature steps out.
    blocker.alive = false;
    run(w, 0.1);
    expect(w.players[0].queue).toHaveLength(0);
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

describe('lane stance', () => {
  it('a lane told to hold stops just past the shrine, and marches on when released', () => {
    const w = new World();
    expect(w.apply({ type: 'stance', team: 0, lane: 1, hold: true }).ok).toBe(true);
    const u = w.spawnUnit(0, 1, UNITS.redcap, 200);
    const v = w.spawnUnit(0, 1, UNITS.valkyrie, 150); // flyers hold too
    run(w, 30);
    expect(u.x + u.def.radius).toBeCloseTo(SHRINE_X + HOLD_PAST_SHRINE, 3);
    expect(v.x + v.def.radius).toBeLessThanOrEqual(SHRINE_X + HOLD_PAST_SHRINE + 1e-6);
    expect(w.shrines[1].owner).toBe(0);
    // The other side's lane and the other lanes are unaffected.
    const o = w.spawnUnit(0, 2, UNITS.redcap, 200);
    run(w, 10);
    expect(o.x).toBeGreaterThan(SHRINE_X + 100);
    w.apply({ type: 'stance', team: 0, lane: 1, hold: false });
    run(w, 3);
    expect(u.x).toBeGreaterThan(SHRINE_X + HOLD_PAST_SHRINE + 20);
  });

  it('mirrors for the right-hand side and survives a save', () => {
    const w = new World();
    w.apply({ type: 'stance', team: 1, lane: 0, hold: true });
    const u = w.spawnUnit(1, 0, UNITS.redcap, 800);
    run(w, 30);
    expect(LANE_LENGTH - (u.x - u.def.radius)).toBeCloseTo(SHRINE_X + HOLD_PAST_SHRINE, 3);
    expect(World.deserialize(w.serialize()).players[1].hold).toEqual([true, false, false]);
  });
});

describe('ley surges', () => {
  it('are foretold, pay the shrine holder while they run, then the next one is scheduled', () => {
    const w = new World({ seed: 9 });
    expect(w.nextSurgeAt).toBeGreaterThanOrEqual(SURGE_FIRST[0]);
    expect(w.nextSurgeAt).toBeLessThanOrEqual(SURGE_FIRST[1]);
    const events: string[] = [];
    run(w, w.nextSurgeAt + TICK);
    const s = w.surge!;
    expect(s).not.toBeNull();
    expect(w.drainEvents().some((e) => e.type === 'surge' && e.phase === 'omen' && e.lane === s.lane)).toBe(true);
    // Hold the surging shrine with team 0.
    w.shrines[s.lane].owner = 0;
    w.shrines[s.lane].capture = -1;
    const gold = w.players[0].gold;
    const foeGold = w.players[1].gold;
    run(w, SURGE_OMEN + SURGE_TIME + 0.1);
    for (const e of w.drainEvents()) if (e.type === 'surge') events.push(e.phase);
    expect(events).toEqual(['start', 'end']);
    expect(w.surge).toBeNull();
    const extra = w.players[0].gold - gold - (w.players[1].gold - foeGold); // both earn the same base income
    const shrineIncome = AGES[0].shrineIncome * (SURGE_OMEN + SURGE_TIME + 0.1);
    expect(extra - shrineIncome).toBeCloseTo(AGES[0].income * SURGE_INCOME * SURGE_TIME, 0);
    expect(w.nextSurgeAt).toBeGreaterThan(w.time + 90);
  });

  it('never strike the same lane twice in a row, and survive a save', () => {
    const w = new World({ seed: 3 });
    const lanes: number[] = [];
    for (let i = 0; i < 6; i++) {
      run(w, w.nextSurgeAt - w.time + TICK);
      lanes.push(w.surge!.lane);
      if (i === 2) {
        const copy = World.deserialize(w.serialize());
        expect(copy.surge).toEqual(w.surge);
        expect(copy.nextSurgeAt).toBe(w.nextSurgeAt);
        expect(copy.surgeRng.state).toBe(w.surgeRng.state);
      }
      run(w, SURGE_OMEN + SURGE_TIME + TICK);
    }
    for (let i = 1; i < lanes.length; i++) expect(lanes[i]).not.toBe(lanes[i - 1]);
  });

  it('stop once Ragnarok has begun', () => {
    const w = new World({ seed: 4 });
    w.ragnarokStarted = true;
    run(w, w.nextSurgeAt + 1);
    expect(w.surge).toBeNull();
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

  it('frozen foes are brittle: they take 50% more damage until they thaw', () => {
    const w = new World();
    const e = w.spawnUnit(1, 0, UNITS.jotunn, 700);
    const hp = e.hp;
    w.damageUnit(e, 100, null, 'turret', null);
    expect(hp - e.hp).toBeCloseTo(100);
    e.freezeTimer = 1;
    const hp2 = e.hp;
    w.damageUnit(e, 100, null, 'turret', null);
    expect(hp2 - e.hp).toBeCloseTo(150);
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

  it('never cost less than at the Asgard price (no first-age bargain)', () => {
    for (let rank = 0; rank < 5; rank++) {
      expect(blessingCost(rank, 0)).toBe(blessingCost(rank, BLESSING_PRICE_FLOOR_AGE));
      expect(blessingCost(rank, 1)).toBe(blessingCost(rank, BLESSING_PRICE_FLOOR_AGE));
    }
    expect(AGES[BLESSING_PRICE_FLOOR_AGE].name).toBe('Asgard');
    expect(blessingCost(0, 3)).toBeGreaterThan(blessingCost(0, 2));
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

  it('ends every battle: long into it both citadels crumble and the sturdier one stands', () => {
    const w = new World();
    w.ragnarokAt = 1;
    for (const p of w.players) p.baseHp = p.baseMaxHp;
    w.players[1].baseHp = w.players[1].baseMaxHp * 0.6;
    run(w, 2 + RAGNAROK_CRUMBLE_AFTER - 1);
    expect(w.players[0].baseHp).toBe(w.players[0].baseMaxHp); // not yet
    const log: string[] = [];
    for (let i = 0; i < 3 / TICK; i++) {
      w.step();
      for (const e of w.drainEvents()) log.push(e.type);
    }
    expect(log.filter((t) => t === 'crumble').length).toBe(1);
    expect(w.players[0].baseHp).toBeLessThan(w.players[0].baseMaxHp);
    run(w, 1 / RAGNAROK_CRUMBLE, () => w.winner !== null);
    expect(w.winner).toBe(0);
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

describe('fairness between the sides', () => {
  it('mirror duels end in mutual destruction (update order picks no winner)', () => {
    for (const id of Object.keys(UNITS)) expect(duel(id, id), id).toBeNull();
  });

  it('swapping sides never changes who wins a duel', () => {
    const ids = Object.keys(UNITS);
    for (const a of ids) {
      for (const b of ids) {
        if (a >= b) continue;
        const first = duel(a, b);
        const swapped = duel(b, a);
        const winner = (r: Team | null, left: string, right: string) => (r === null ? null : r === 0 ? left : right);
        expect(winner(swapped, b, a), `${a} vs ${b}`).toBe(winner(first, a, b));
      }
    }
  });

  it('mirrored armies end even for every creature (packs, flyers, lifesteal, splash)', () => {
    /** Waves of `count` creatures per side at mirrored spots and times; returns the survivor side. */
    const mirrored = (id: string, count: number, gap: number, spacing: number): Team | null => {
      const w = new World();
      let spawned = 0;
      for (let t = 0; t < 120; t += TICK) {
        if (spawned < count && t >= spawned * gap) {
          const x = 300 - spawned * spacing;
          w.spawnUnit(0, 0, UNITS[id], x);
          w.spawnUnit(1, 0, UNITS[id], LANE_LENGTH - x);
          spawned++;
        }
        w.step();
        const alive = w.lanes[0].filter((u) => u.alive);
        const a0 = alive.some((u) => u.team === 0);
        const a1 = alive.some((u) => u.team === 1);
        if (spawned === count && (!a0 || !a1)) return a0 ? 0 : a1 ? 1 : null;
      }
      return null;
    };
    for (const id of Object.keys(UNITS)) {
      for (const count of [3, 5]) {
        for (const gap of [0, 0.4]) for (const spacing of [0, 7]) expect(mirrored(id, count, gap, spacing), `${id} ×${count} gap ${gap} spacing ${spacing}`).toBeNull();
      }
    }
  });

  it('a dead heat when both citadels fall is a coin toss, not a win for team 0', () => {
    const winners = new Set<Team | null>();
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World({ seed });
      for (const p of w.players) p.baseHp = 1;
      w.damageBase(0, 10, 0, 1);
      w.damageBase(1, 10, 0, 0);
      w.step();
      winners.add(w.winner);
    }
    expect([...winners].sort()).toEqual([0, 1]);
  });

  it('when both citadels fall in the same tick, the harder-hitting side wins', () => {
    for (const strong of [0, 1] as Team[]) {
      const w = new World();
      w.players[strong].stats.damageToBase = 500;
      for (const p of w.players) p.baseHp = 1;
      w.damageBase(0, 10, 0, 1);
      w.damageBase(1, 10, 0, 0);
      w.step();
      expect(w.winner).toBe(strong);
    }
  });
});

describe('splash damage', () => {
  /** One blow from `attacker` (team 0) into a target with a foe packed right behind it. */
  function blow(attacker: string): { target: number; neighbour: number } {
    const w = new World();
    const a = w.spawnUnit(0, 0, UNITS[attacker], 470);
    a.def = { ...a.def, cooldown: 99 };
    const t = w.spawnUnit(1, 0, UNITS.redcap, 470 + a.def.radius + UNITS.redcap.radius + 2);
    const n = w.spawnUnit(1, 0, UNITS.redcap, t.x + 4);
    for (const u of [t, n]) {
      u.def = { ...u.def, damage: 0, speed: 0 };
      u.hp = u.maxHp = 1e6;
    }
    run(w, 2);
    return { target: u0(t), neighbour: u0(n) };
    function u0(u: { hp: number; maxHp: number }): number {
      return u.maxHp - u.hp;
    }
  }

  it('sweep, cleave and slam do not stack on one foe', () => {
    for (const id of ['treant', 'jotunn', 'titan']) {
      const r = blow(id);
      expect(r.target, id).toBeGreaterThan(0);
      expect(r.neighbour, id).toBeGreaterThan(0);
      expect(r.neighbour, id).toBeLessThanOrEqual(r.target + 1e-9);
    }
  });

  it('cleave strikes a second foe in reach', () => {
    const w = new World();
    const a = w.spawnUnit(0, 0, UNITS.jotunn, 470);
    a.def = { ...a.def, cooldown: 99 };
    const t = w.spawnUnit(1, 0, UNITS.minotaur, 470 + a.def.radius + UNITS.minotaur.radius + 2);
    const n = w.spawnUnit(1, 0, UNITS.minotaur, t.x + 20);
    for (const u of [t, n]) {
      u.def = { ...u.def, damage: 0, speed: 0 };
      u.hp = u.maxHp = 1e6;
    }
    run(w, 2);
    expect(n.maxHp - n.hp).toBeGreaterThan(0);
  });
});
