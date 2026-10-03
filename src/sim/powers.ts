import { LANE_LENGTH, POWERS } from './data.ts';
import type { PowerKind } from './data.ts';
import type { PowerInstance, Team, Unit } from './types.ts';
import type { World } from './world.ts';

/** Timing constants shared with the renderer so visuals line up with damage. */
export const POWER_TIMING = {
  briar: { delay: 0.35, root: 2.6 },
  zeus: { bolts: 7, start: 0.25, interval: 0.22, radius: 22 },
  fimbul: { delay: 0.7, freeze: 3.2, duration: 3.6 },
  spiritdragon: { duration: 2.4 },
  starfall: { count: 14, start: 0.2, interval: 0.17, fall: 0.55, radius: 50 },
} as const;

export function castPower(world: World, team: Team, lane: number, kind: PowerKind, age: number): void {
  const inst: PowerInstance = {
    id: world.newId(),
    kind,
    team,
    lane,
    age,
    t: 0,
    damage: POWERS[kind].damage,
    fired: 0,
    hit: [],
    done: false,
  };
  world.powers.push(inst);
  world.emit({ type: 'power', team, lane, kind, instanceId: inst.id });
}

function enemies(world: World, inst: PowerInstance): Unit[] {
  return world.enemiesInLane(inst.team, inst.lane);
}

/** A random x in the half of the lane nearer the enemy (used when no target exists). */
function randomEnemySideX(world: World, team: Team): number {
  const r = world.rng.range(0.35, 0.95) * LANE_LENGTH;
  return team === 0 ? r : LANE_LENGTH - r;
}

export function updatePowers(world: World, dt: number): void {
  for (const inst of world.powers) {
    if (inst.done) continue;
    inst.t += dt;
    switch (inst.kind) {
      case 'briar':
        updateBriar(world, inst);
        break;
      case 'zeus':
        updateZeus(world, inst);
        break;
      case 'fimbul':
        updateFimbul(world, inst);
        break;
      case 'spiritdragon':
        updateSpiritDragon(world, inst);
        break;
      case 'starfall':
        updateStarfall(world, inst);
        break;
    }
  }
}

function updateBriar(world: World, inst: PowerInstance): void {
  const T = POWER_TIMING.briar;
  if (inst.t < T.delay) return;
  for (const e of enemies(world, inst)) {
    world.emit({ type: 'strike', team: inst.team, lane: inst.lane, x: e.x, kind: 'briar', radius: e.def.radius });
    world.damageUnit(e, inst.damage, null, 'power', null);
    if (e.alive) e.rootTimer = Math.max(e.rootTimer, T.root);
  }
  inst.done = true;
}

function updateZeus(world: World, inst: PowerInstance): void {
  const T = POWER_TIMING.zeus;
  while (inst.fired < T.bolts && inst.t >= T.start + inst.fired * T.interval) {
    inst.fired++;
    const list = enemies(world, inst);
    // Prefer targets that have not been struck yet.
    const fresh = list.filter((u) => !inst.hit.includes(u.id));
    const pool = fresh.length > 0 ? fresh : list;
    if (pool.length === 0) {
      world.emit({ type: 'strike', team: inst.team, lane: inst.lane, x: randomEnemySideX(world, inst.team), kind: 'zeus', radius: T.radius });
      continue;
    }
    const target = world.rng.pick(pool);
    inst.hit.push(target.id);
    const x = target.x;
    world.emit({ type: 'strike', team: inst.team, lane: inst.lane, x, kind: 'zeus', radius: T.radius });
    for (const e of list) {
      if (!e.alive) continue;
      if (e === target) world.damageUnit(e, inst.damage, null, 'power', null);
      else if (Math.abs(e.x - x) <= T.radius + e.def.radius) world.damageUnit(e, inst.damage * 0.5, null, 'power', null);
    }
  }
  if (inst.fired >= T.bolts) inst.done = true;
}

function updateFimbul(world: World, inst: PowerInstance): void {
  const T = POWER_TIMING.fimbul;
  if (inst.fired === 0 && inst.t >= T.delay) {
    inst.fired = 1;
    for (const e of enemies(world, inst)) {
      world.emit({ type: 'strike', team: inst.team, lane: inst.lane, x: e.x, kind: 'fimbul', radius: e.def.radius });
      world.damageUnit(e, inst.damage, null, 'power', null);
      if (e.alive) {
        e.freezeTimer = Math.max(e.freezeTimer, T.freeze);
        e.windupTimer = 0;
      }
    }
  }
  if (inst.t >= T.duration) inst.done = true;
}

/** Head position of the spirit dragon along the lane at time t. */
export function spiritDragonHead(team: Team, t: number): number {
  const k = Math.min(1, t / POWER_TIMING.spiritdragon.duration);
  return team === 0 ? -60 + k * (LANE_LENGTH + 120) : LANE_LENGTH + 60 - k * (LANE_LENGTH + 120);
}

function updateSpiritDragon(world: World, inst: PowerInstance): void {
  const head = spiritDragonHead(inst.team, inst.t);
  for (const e of enemies(world, inst)) {
    if (inst.hit.includes(e.id)) continue;
    const passed = inst.team === 0 ? e.x <= head : e.x >= head;
    if (!passed) continue;
    inst.hit.push(e.id);
    world.emit({ type: 'strike', team: inst.team, lane: inst.lane, x: e.x, kind: 'spiritdragon', radius: e.def.radius });
    world.damageUnit(e, inst.damage, null, 'power', null);
  }
  if (inst.t >= POWER_TIMING.spiritdragon.duration) inst.done = true;
}

/** Meteors are launched first (renderer shows the fall), then land `fall` seconds later. */
function updateStarfall(world: World, inst: PowerInstance): void {
  const T = POWER_TIMING.starfall;
  // `hit` stores pending impact x positions (rounded) paired with impact times via fired index.
  while (inst.fired < T.count && inst.t >= T.start + inst.fired * T.interval) {
    inst.fired++;
    const list = enemies(world, inst);
    const x = list.length > 0 ? world.rng.pick(list).x + world.rng.range(-30, 30) : randomEnemySideX(world, inst.team);
    inst.hit.push(x);
    world.emit({ type: 'meteor', team: inst.team, lane: inst.lane, x, fall: T.fall });
  }
  // Resolve impacts whose fall time has elapsed.
  for (let i = 0; i < inst.hit.length; i++) {
    const launchedAt = T.start + i * T.interval;
    if (Number.isNaN(inst.hit[i]) || inst.t < launchedAt + T.fall) continue;
    const x = inst.hit[i];
    inst.hit[i] = NaN;
    world.emit({ type: 'strike', team: inst.team, lane: inst.lane, x, kind: 'starfall', radius: T.radius });
    for (const e of enemies(world, inst)) {
      if (Math.abs(e.x - x) <= T.radius + e.def.radius) world.damageUnit(e, inst.damage, null, 'power', null);
    }
  }
  if (inst.fired >= T.count && inst.hit.every((v) => Number.isNaN(v))) inst.done = true;
}
