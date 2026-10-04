import {
  AGES,
  BLESSINGS,
  BLESSING_MAX_RANK,
  BASE_DAMAGE_XP,
  KILL_GOLD_MULT,
  KILL_XP_MULT,
  LANE_COUNT,
  LANE_LENGTH,
  MAX_AGE,
  PASSIVE_XP,
  RAGNAROK_AFTER_FINAL,
  RAGNAROK_RAMP,
  RAGNAROK_TIME,
  POWER_SCALE,
  POWERS,
  QUEUE_MAX,
  SELL_REFUND,
  SHRINE_CAPTURE_TIME,
  SHRINE_RADIUS,
  SHRINE_X,
  START_GOLD,
  START_POWER_COOLDOWN,
  TICK,
  TURRETS,
  UNITS,
  WARD,
  blessingCost,
  counterMultiplier,
} from './data.ts';
import type { BlessingId, Trait, TraitKind, UnitClass, UnitDef } from './data.ts';
import { Rng } from './rng.ts';
import { castPower, updatePowers } from './powers.ts';
import { BASE_TARGET, NO_TARGET } from './types.ts';
import type { TurretSlot } from './types.ts';
import type {
  Command,
  CommandResult,
  PlayerState,
  PowerInstance,
  Projectile,
  Shrine,
  SimEvent,
  Team,
  Unit,
} from './types.ts';

const ALLY_SPACING = 3;
/** Guardians' blows also hit enemies whose centre is this close to the target's. */
const GUARDIAN_SWEEP = 10;
const GUARDIAN_SWEEP_FALLOFF = 0.8;
/** Extra reach allowed when an attack resolves (target may have stepped back a little). */
const RESOLVE_SLACK = 14;

export interface WorldOptions {
  seed?: number;
  incomeMult?: [number, number];
}

export function trait<K extends TraitKind>(def: UnitDef, kind: K): Extract<Trait, { kind: K }> | undefined {
  for (const t of def.traits) if (t.kind === kind) return t as Extract<Trait, { kind: K }>;
  return undefined;
}

/** Hunters do not block each other (pack behaviour). Flyers are handled separately. */
function packs(a: UnitDef, b: UnitDef): boolean {
  return a.cls === 'hunter' && b.cls === 'hunter';
}

export function other(team: Team): Team {
  return team === 0 ? 1 : 0;
}

/** Direction of travel along the lane for a team. */
export function dirOf(team: Team): 1 | -1 {
  return team === 0 ? 1 : -1;
}

/** JSON-safe snapshot of a world (unit/turret definitions stored by id). */
export interface WorldSnapshot {
  v: 1;
  time: number;
  tick: number;
  rng: number;
  nextId: number;
  winner: Team | null;
  ragnarokAt: number;
  ragnarokStarted: boolean;
  finalAgeAt: number | null;
  players: (Omit<PlayerState, 'turrets'> & { turrets: (Omit<TurretSlot, 'def'> & { def: string | null })[] })[];
  lanes: (Omit<Unit, 'def'> & { def: string })[][];
  shrines: Shrine[];
  projectiles: Projectile[];
  powers: PowerInstance[];
}

export class World {
  time = 0;
  tick = 0;
  readonly rng: Rng;
  readonly players: [PlayerState, PlayerState];
  readonly lanes: Unit[][] = [];
  readonly shrines: Shrine[] = [];
  readonly projectiles: Projectile[] = [];
  readonly powers: PowerInstance[] = [];
  readonly unitById = new Map<number, Unit>();
  winner: Team | null = null;
  /** Sim time at which Ragnarök begins (may move earlier once both sides reach the final age). */
  ragnarokAt = RAGNAROK_TIME;
  ragnarokStarted = false;
  private finalAgeAt: number | null = null;
  private nextId = 1;
  private events: SimEvent[] = [];

  constructor(opts: WorldOptions = {}) {
    this.rng = new Rng(opts.seed ?? 12345);
    const mult = opts.incomeMult ?? [1, 1];
    this.players = [this.makePlayer(0, mult[0]), this.makePlayer(1, mult[1])];
    for (let i = 0; i < LANE_COUNT; i++) {
      this.lanes.push([]);
      this.shrines.push({ lane: i, capture: 0, owner: -1, contested: false });
    }
  }

  private makePlayer(team: Team, incomeMult: number): PlayerState {
    return {
      team,
      gold: START_GOLD,
      xp: 0,
      age: 0,
      baseHp: AGES[0].baseHp,
      baseMaxHp: AGES[0].baseHp,
      queue: [],
      trainProgress: 0,
      powerCooldown: START_POWER_COOLDOWN,
      turrets: Array.from({ length: LANE_COUNT }, () => ({ def: null, cooldown: 0, lastFire: -10, aimX: team === 0 ? 200 : LANE_LENGTH - 200 })),
      incomeMult,
      wardCooldown: Array.from({ length: LANE_COUNT }, () => 0),
      blessings: { might: 0, vitality: 0, bastion: 0 },
      stats: { summoned: 0, summonedBy: {}, kills: 0, killsByLane: [0, 0, 0], losses: 0, goldEarned: 0, goldSpent: 0, damageToBase: 0, powersCast: 0 },
      lastBaseHit: -10,
    };
  }

  /** Serializable snapshot of the whole simulation (for save games). */
  serialize(): WorldSnapshot {
    const snap: WorldSnapshot = {
      v: 1,
      time: this.time,
      tick: this.tick,
      rng: this.rng.state,
      nextId: this.nextId,
      winner: this.winner,
      ragnarokAt: this.ragnarokAt,
      ragnarokStarted: this.ragnarokStarted,
      finalAgeAt: this.finalAgeAt,
      players: this.players.map((p) => ({ ...p, turrets: p.turrets.map((t) => ({ ...t, def: t.def ? t.def.id : null })) })),
      lanes: this.lanes.map((l) => l.filter((u) => u.alive).map((u) => ({ ...u, def: u.def.id }))),
      shrines: this.shrines,
      projectiles: this.projectiles.filter((p) => !p.done),
      powers: this.powers.filter((p) => !p.done),
    };
    return JSON.parse(JSON.stringify(snap)) as WorldSnapshot;
  }

  /** Rebuilds a world from `serialize()` output. Throws on unknown data. */
  static deserialize(snap: WorldSnapshot): World {
    if (!snap || snap.v !== 1) throw new Error('Unsupported save');
    const w = new World();
    w.time = snap.time;
    w.tick = snap.tick;
    w.rng.state = snap.rng;
    w.nextId = snap.nextId;
    w.winner = snap.winner;
    w.ragnarokAt = snap.ragnarokAt;
    w.ragnarokStarted = snap.ragnarokStarted;
    w.finalAgeAt = snap.finalAgeAt;
    for (let i = 0; i < 2; i++) {
      const p = snap.players[i];
      // Older saves may predate some stats fields.
      p.stats.killsByLane ??= [0, 0, 0];
      p.stats.summonedBy ??= {};
      w.players[i] = {
        ...p,
        turrets: p.turrets.map((t) => {
          const def = t.def ? TURRETS[t.def] : null;
          if (t.def && !def) throw new Error(`Unknown turret ${t.def}`);
          return { ...t, def };
        }),
      };
    }
    w.unitById.clear();
    snap.lanes.forEach((lane, i) => {
      w.lanes[i] = lane.map((u) => {
        const def = UNITS[u.def];
        if (!def) throw new Error(`Unknown creature ${u.def}`);
        const unit: Unit = { ...u, def };
        w.unitById.set(unit.id, unit);
        return unit;
      });
    });
    w.shrines.splice(0, w.shrines.length, ...snap.shrines);
    w.projectiles.splice(0, w.projectiles.length, ...snap.projectiles);
    // JSON turns the NaN "already landed" markers of pending meteors into null.
    for (const p of snap.powers) p.hit = p.hit.map((v) => (v === null ? NaN : v));
    w.powers.splice(0, w.powers.length, ...snap.powers);
    return w;
  }

  newId(): number {
    return this.nextId++;
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  /** Returns and clears all events emitted since the last drain. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  get units(): Unit[] {
    const out: Unit[] = [];
    for (const l of this.lanes) for (const u of l) if (u.alive) out.push(u);
    return out;
  }

  enemiesInLane(team: Team, lane: number): Unit[] {
    return this.lanes[lane].filter((u) => u.alive && u.team !== team);
  }

  alliesInLane(team: Team, lane: number): Unit[] {
    return this.lanes[lane].filter((u) => u.alive && u.team === team);
  }

  aliveCount(team: Team, defId: string): number {
    let n = 0;
    for (const l of this.lanes) for (const u of l) if (u.alive && u.team === team && u.def.id === defId) n++;
    return n;
  }

  shrinesHeld(team: Team): number {
    let n = 0;
    for (const s of this.shrines) if (s.owner === team) n++;
    return n;
  }

  /** Multiplier on damage dealt to citadels (1 before Ragnarök). */
  siegeMult(): number {
    if (!this.ragnarokStarted) return 1;
    return 1 + ((this.time - this.ragnarokAt) / 60) * RAGNAROK_RAMP;
  }

  incomeOf(team: Team): number {
    const p = this.players[team];
    const age = AGES[p.age];
    return (age.income + this.shrinesHeld(team) * age.shrineIncome) * p.incomeMult;
  }

  /** Front coordinate of a team's citadel along the lane. */
  baseFront(team: Team): number {
    return team === 0 ? 0 : LANE_LENGTH;
  }

  /** Edge-to-edge distance from unit `u` to enemy unit `e` (positive = gap). */
  edgeDist(u: Unit, e: Unit): number {
    return u.team === 0 ? e.x - e.def.radius - (u.x + u.def.radius) : u.x - u.def.radius - (e.x + e.def.radius);
  }

  /** Edge distance from unit `u` to the enemy citadel. */
  baseDist(u: Unit): number {
    return u.team === 0 ? LANE_LENGTH - (u.x + u.def.radius) : u.x - u.def.radius;
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  /** Why a train command would fail, or null if it would succeed. */
  trainBlocker(team: Team, unitId: string): string | null {
    const p = this.players[team];
    const def = UNITS[unitId];
    if (!def) return 'Unknown creature';
    if (def.age !== p.age) return 'Not available in this age';
    if (p.queue.length >= QUEUE_MAX) return 'Summoning queue is full';
    if (def.maxAlive !== undefined) {
      const queued = p.queue.filter((q) => q.unitId === unitId).length;
      if (this.aliveCount(team, unitId) + queued >= def.maxAlive) return `Only ${def.maxAlive} ${def.name} at a time`;
    }
    if (p.gold < def.cost) return 'Not enough gold';
    return null;
  }

  ageUpBlocker(team: Team): string | null {
    const p = this.players[team];
    if (p.age >= MAX_AGE) return 'Already in the final age';
    const next = AGES[p.age + 1];
    if (p.xp < next.xpRequired) return 'Not enough XP';
    if (p.gold < next.ascendCost) return 'Not enough gold';
    return null;
  }

  turretBlocker(team: Team, lane: number, turretId: string): string | null {
    const p = this.players[team];
    const def = TURRETS[turretId];
    if (!def) return 'Unknown turret';
    if (lane < 0 || lane >= LANE_COUNT) return 'Invalid lane';
    if (def.age > p.age) return 'Not available yet';
    const cur = p.turrets[lane].def;
    if (cur && cur.id === turretId) return 'Already built';
    const refund = cur ? Math.floor(cur.cost * SELL_REFUND) : 0;
    if (p.gold + refund < def.cost) return 'Not enough gold';
    return null;
  }

  powerBlocker(team: Team): string | null {
    const p = this.players[team];
    if (p.powerCooldown > 0) return 'God power is recharging';
    return null;
  }

  blessingBlocker(team: Team, id: BlessingId): string | null {
    const p = this.players[team];
    if (!BLESSINGS[id]) return 'Unknown blessing';
    if (p.blessings[id] >= BLESSING_MAX_RANK) return 'Fully blessed';
    if (p.gold < blessingCost(p.blessings[id], p.age)) return 'Not enough gold';
    return null;
  }

  mightMult(team: Team): number {
    return 1 + this.players[team].blessings.might * BLESSINGS.might.perRank;
  }

  vitalityMult(team: Team): number {
    return 1 + this.players[team].blessings.vitality * BLESSINGS.vitality.perRank;
  }

  /** Citadel health multiplier from Bastion. */
  bastionMult(team: Team): number {
    return 1 + this.players[team].blessings.bastion * BLESSINGS.bastion.perRank;
  }

  /** Ward/turret damage multiplier from Bastion (half as strong as the health bonus). */
  defenseMult(team: Team): number {
    return 1 + this.players[team].blessings.bastion * BLESSINGS.bastion.perRank * 0.5;
  }

  /** Citadel max HP for a team at its current age and Bastion rank. */
  baseMaxHpFor(team: Team): number {
    return AGES[this.players[team].age].baseHp * this.bastionMult(team);
  }

  apply(cmd: Command): CommandResult {
    if (this.winner !== null) return { ok: false, reason: 'The battle is over' };
    const p = this.players[cmd.team];
    switch (cmd.type) {
      case 'train': {
        if (cmd.lane < 0 || cmd.lane >= LANE_COUNT) return { ok: false, reason: 'Invalid lane' };
        const why = this.trainBlocker(cmd.team, cmd.unitId);
        if (why) return { ok: false, reason: why };
        const def = UNITS[cmd.unitId];
        p.gold -= def.cost;
        p.stats.goldSpent += def.cost;
        p.queue.push({ unitId: cmd.unitId, lane: cmd.lane });
        if (p.queue.length === 1) this.emit({ type: 'trainStart', team: cmd.team });
        return { ok: true };
      }
      case 'cancel': {
        const item = p.queue[cmd.index];
        if (!item) return { ok: false, reason: 'Nothing to cancel' };
        const def = UNITS[item.unitId];
        p.queue.splice(cmd.index, 1);
        p.gold += def.cost;
        p.stats.goldSpent -= def.cost;
        if (cmd.index === 0) p.trainProgress = 0;
        return { ok: true };
      }
      case 'ageUp': {
        const why = this.ageUpBlocker(cmd.team);
        if (why) return { ok: false, reason: why };
        const next = AGES[p.age + 1];
        p.gold -= next.ascendCost;
        p.stats.goldSpent += next.ascendCost;
        p.age += 1;
        const newMax = this.baseMaxHpFor(cmd.team);
        const gained = newMax - p.baseMaxHp;
        p.baseMaxHp = newMax;
        p.baseHp = Math.min(p.baseMaxHp, p.baseHp + gained);
        p.powerCooldown = Math.min(p.powerCooldown, 8);
        this.emit({ type: 'ageUp', team: cmd.team, age: p.age });
        return { ok: true };
      }
      case 'buildTurret': {
        const why = this.turretBlocker(cmd.team, cmd.lane, cmd.turretId);
        if (why) return { ok: false, reason: why };
        const slot = p.turrets[cmd.lane];
        if (slot.def) p.gold += Math.floor(slot.def.cost * SELL_REFUND);
        const def = TURRETS[cmd.turretId];
        p.gold -= def.cost;
        p.stats.goldSpent += def.cost;
        slot.def = def;
        slot.cooldown = 0.5;
        this.emit({ type: 'turretBuilt', team: cmd.team, lane: cmd.lane, turretId: def.id });
        return { ok: true };
      }
      case 'sellTurret': {
        const slot = p.turrets[cmd.lane];
        if (!slot || !slot.def) return { ok: false, reason: 'No turret there' };
        p.gold += Math.floor(slot.def.cost * SELL_REFUND);
        slot.def = null;
        this.emit({ type: 'turretBuilt', team: cmd.team, lane: cmd.lane, turretId: null });
        return { ok: true };
      }
      case 'bless': {
        const why = this.blessingBlocker(cmd.team, cmd.blessing);
        if (why) return { ok: false, reason: why };
        const cost = blessingCost(p.blessings[cmd.blessing], p.age);
        p.gold -= cost;
        p.stats.goldSpent += cost;
        p.blessings[cmd.blessing]++;
        if (cmd.blessing === 'bastion') {
          const newMax = this.baseMaxHpFor(cmd.team);
          p.baseHp += newMax - p.baseMaxHp;
          p.baseMaxHp = newMax;
        }
        this.emit({ type: 'blessing', team: cmd.team, blessing: cmd.blessing, rank: p.blessings[cmd.blessing] });
        return { ok: true };
      }
      case 'power': {
        if (cmd.lane < 0 || cmd.lane >= LANE_COUNT) return { ok: false, reason: 'Invalid lane' };
        const why = this.powerBlocker(cmd.team);
        if (why) return { ok: false, reason: why };
        const def = POWERS[AGES[p.age].power];
        p.powerCooldown = def.cooldown;
        p.stats.powersCast++;
        castPower(this, cmd.team, cmd.lane, def.id, p.age);
        return { ok: true };
      }
    }
  }

  // -------------------------------------------------------------------------
  // Simulation step
  // -------------------------------------------------------------------------

  step(dt: number = TICK): void {
    if (this.winner !== null) return;
    this.time += dt;
    this.tick++;
    for (const lane of this.lanes) for (const u of lane) u.px = u.x;
    for (const pr of this.projectiles) pr.px = pr.x;
    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateRagnarok();
    for (let lane = 0; lane < LANE_COUNT; lane++) this.updateLane(lane, dt);
    this.updateTurrets(dt);
    this.updateProjectiles(dt);
    updatePowers(this, dt);
    this.updateShrines(dt);
    this.cleanup();
    this.checkWin();
  }

  private updateRagnarok(): void {
    if (this.ragnarokStarted) return;
    if (this.players[0].age === MAX_AGE && this.players[1].age === MAX_AGE) {
      this.ragnarokAt = Math.min(this.ragnarokAt, Math.max(this.time, this.finalAgeAt ?? this.time) + RAGNAROK_AFTER_FINAL);
      this.finalAgeAt ??= this.time;
    }
    if (this.time >= this.ragnarokAt) {
      this.ragnarokStarted = true;
      this.ragnarokAt = this.time;
      this.emit({ type: 'ragnarok' });
    }
  }

  private updatePlayer(p: PlayerState, dt: number): void {
    const income = this.incomeOf(p.team) * dt;
    p.gold += income;
    p.stats.goldEarned += income;
    p.xp += PASSIVE_XP * dt;
    if (p.powerCooldown > 0) p.powerCooldown = Math.max(0, p.powerCooldown - dt);

    if (p.queue.length > 0) {
      const item = p.queue[0];
      const def = UNITS[item.unitId];
      p.trainProgress = Math.min(def.trainTime, p.trainProgress + dt);
      if (p.trainProgress >= def.trainTime && this.canSpawn(p.team, item.lane, def)) {
        this.spawnUnit(p.team, item.lane, def);
        p.queue.shift();
        p.trainProgress = 0;
        if (p.queue.length > 0) this.emit({ type: 'trainStart', team: p.team });
      }
    }
  }

  spawnX(team: Team, def: UnitDef): number {
    return team === 0 ? def.radius + 2 : LANE_LENGTH - def.radius - 2;
  }

  canSpawn(team: Team, lane: number, def: UnitDef): boolean {
    if (trait(def, 'flying')) return true;
    const x = this.spawnX(team, def);
    for (const u of this.lanes[lane]) {
      if (!u.alive || u.team !== team || u.flying) continue;
      if (u.def.projectile && !def.projectile) continue; // melee may pass ranged allies
      if (packs(u.def, def)) continue; // hunters crowd together
      const gap = team === 0 ? u.x - u.def.radius - (x + def.radius) : x - def.radius - (u.x + u.def.radius);
      if (gap < ALLY_SPACING) return false;
    }
    return true;
  }

  spawnUnit(team: Team, lane: number, def: UnitDef, x?: number): Unit {
    const sx = x ?? this.spawnX(team, def);
    const u: Unit = {
      id: this.newId(),
      def,
      team,
      lane,
      x: sx,
      px: sx,
      hp: def.hp * this.vitalityMult(team),
      maxHp: def.hp * this.vitalityMult(team),
      alive: true,
      flying: !!trait(def, 'flying'),
      bornAt: this.time,
      attackTimer: 0,
      windupTimer: 0,
      pendingTarget: NO_TARGET,
      attackStart: -1,
      moving: false,
      movedFor: 0,
      charged: false,
      slowTimer: 0,
      slowFactor: 1,
      rootTimer: 0,
      freezeTimer: 0,
      enraged: false,
      rebirthUsed: false,
      lastHitAt: -10,
      kills: 0,
      renderKey: 0,
    };
    this.lanes[lane].push(u);
    this.unitById.set(u.id, u);
    const st = this.players[team].stats;
    st.summoned++;
    st.summonedBy[def.id] = (st.summonedBy[def.id] ?? 0) + 1;
    this.emit({ type: 'spawn', unitId: u.id, team, lane, defId: def.id });
    return u;
  }

  private updateLane(lane: number, dt: number): void {
    const list = this.lanes[lane];
    list.sort((a, b) => a.x - b.x);
    // Front-most units first so followers can close up within the same tick.
    for (let i = list.length - 1; i >= 0; i--) if (list[i].team === 0 && list[i].alive) this.updateUnit(list[i], list, dt);
    for (let i = 0; i < list.length; i++) if (list[i].team === 1 && list[i].alive) this.updateUnit(list[i], list, dt);
  }

  /** Nearest enemy unit (or the citadel) in front of `u`. */
  findTarget(u: Unit, list: Unit[]): { target: Unit | null; dist: number } {
    let best: Unit | null = null;
    let bestDist = this.baseDist(u);
    for (const e of list) {
      if (!e.alive || e.team === u.team) continue;
      const d = this.edgeDist(u, e);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return { target: best, dist: bestDist };
  }

  private allyGap(u: Unit, list: Unit[]): number {
    let gap = Infinity;
    for (const a of list) {
      if (a === u || !a.alive || a.team !== u.team || a.flying) continue;
      // Ranged creatures hang back and let melee allies through to the front line.
      if (a.def.projectile && !u.def.projectile) continue;
      // Hunters fight as a pack: they crowd together and strike the same foe at once.
      if (packs(a.def, u.def)) continue;
      if (u.team === 0 ? a.x <= u.x : a.x >= u.x) continue;
      const g = u.team === 0 ? a.x - a.def.radius - (u.x + u.def.radius) : u.x - u.def.radius - (a.x + a.def.radius);
      if (g - ALLY_SPACING < gap) gap = g - ALLY_SPACING;
    }
    return gap;
  }

  private updateUnit(u: Unit, list: Unit[], dt: number): void {
    const def = u.def;
    if (u.slowTimer > 0) {
      u.slowTimer -= dt;
      if (u.slowTimer <= 0) u.slowFactor = 1;
    }
    if (u.rootTimer > 0) u.rootTimer -= dt;
    const regen = trait(def, 'regen');
    if (regen && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + regen.perSec * u.maxHp * dt);
    if (u.freezeTimer > 0) {
      u.freezeTimer -= dt;
      u.windupTimer = 0;
      u.moving = false;
      return;
    }
    const enrage = trait(def, 'enrage');
    u.enraged = !!enrage && u.hp < u.maxHp * enrage.below;
    const speedMult = u.slowTimer > 0 ? u.slowFactor : 1;
    const atkRate = speedMult * (u.enraged && enrage ? enrage.attackSpeed : 1);
    if (u.attackTimer > 0) u.attackTimer -= dt * atkRate;

    if (u.windupTimer > 0) {
      u.moving = false;
      u.windupTimer -= dt * atkRate;
      if (u.windupTimer <= 0) this.resolveAttack(u, list);
      return;
    }

    const { target, dist } = this.findTarget(u, list);
    if (dist <= def.range) {
      u.moving = false;
      u.movedFor = 0;
      if (u.attackTimer <= 0) {
        u.windupTimer = def.windup;
        u.attackTimer = def.cooldown;
        u.pendingTarget = target ? target.id : BASE_TARGET;
        u.attackStart = this.time;
        this.emit({ type: 'attack', unitId: u.id, team: u.team, lane: u.lane, defId: def.id, ranged: !!def.projectile });
      }
      return;
    }

    if (u.rootTimer > 0) {
      u.moving = false;
      return;
    }
    let step = def.speed * speedMult * dt;
    step = Math.min(step, Math.max(0, dist - def.range + 0.5));
    if (!u.flying) step = Math.min(step, Math.max(0, this.allyGap(u, list)));
    u.x += dirOf(u.team) * step;
    u.moving = step > 1e-4;
    if (u.moving) {
      u.movedFor += dt;
      const charge = trait(def, 'charge');
      if (charge && u.movedFor >= charge.after) u.charged = true;
    } else {
      u.movedFor = 0;
    }
  }

  private resolveAttack(u: Unit, list: Unit[]): void {
    const def = u.def;
    let target: Unit | null = null;
    let dist: number;
    if (u.pendingTarget >= 0) {
      const t = this.unitById.get(u.pendingTarget);
      if (t && t.alive) {
        target = t;
        dist = this.edgeDist(u, t);
      } else {
        const found = this.findTarget(u, list);
        target = found.target;
        dist = found.dist;
      }
    } else {
      const found = this.findTarget(u, list);
      target = found.target;
      dist = found.dist;
    }
    if (dist > def.range + RESOLVE_SLACK) {
      // Target escaped or died with nothing else in reach: recover quickly.
      u.attackTimer = Math.min(u.attackTimer, 0.15);
      return;
    }
    if (def.projectile) {
      this.fireProjectileFromUnit(u, target);
    } else {
      this.meleeHit(u, target, list);
    }
  }

  private meleeHit(u: Unit, target: Unit | null, list: Unit[]): void {
    const def = u.def;
    let dmg = def.damage * this.mightMult(u.team);
    const charge = trait(def, 'charge');
    if (charge && u.charged) {
      dmg *= charge.mult;
      u.charged = false;
    }
    if (!target) {
      this.damageBase(other(u.team), dmg, u.lane, u.team);
      return;
    }
    const dealt = this.damageUnit(target, dmg, def.cls, 'unit', u);
    const lifesteal = trait(def, 'lifesteal');
    if (lifesteal) u.hp = Math.min(u.maxHp, u.hp + dealt * lifesteal.frac);
    const cleave = trait(def, 'cleave');
    if (cleave) {
      const extra = list
        .filter((e) => e.alive && e.team !== u.team && e !== target && this.edgeDist(u, e) <= def.range + 30)
        .sort((a, b) => this.edgeDist(u, a) - this.edgeDist(u, b))
        .slice(0, cleave.targets - 1);
      for (const e of extra) this.damageUnit(e, dmg * cleave.falloff, def.cls, 'unit', u);
    }
    // Guardians' sweeping blows also catch foes crowded around the target (breaks hunter packs).
    if (def.cls === 'guardian') {
      for (const e of list) {
        if (!e.alive || e.team === u.team || e === target) continue;
        if (Math.abs(e.x - target.x) <= GUARDIAN_SWEEP) this.damageUnit(e, dmg * GUARDIAN_SWEEP_FALLOFF, def.cls, 'unit', u);
      }
    }
    const slam = trait(def, 'slam');
    if (slam) {
      for (const e of list) {
        if (!e.alive || e.team === u.team || e === target) continue;
        if (Math.abs(e.x - target.x) <= slam.radius + e.def.radius) this.damageUnit(e, dmg * slam.falloff, def.cls, 'unit', u);
      }
    }
  }

  private fireProjectileFromUnit(u: Unit, target: Unit | null): void {
    const def = u.def;
    const spec = def.projectile!;
    const x0 = u.x + dirOf(u.team) * def.radius * 0.6;
    const tx = target ? target.x : this.baseFront(other(u.team));
    const slow = trait(def, 'slow');
    const bounce = trait(def, 'bounce');
    const splash = trait(def, 'splash');
    this.addProjectile({
      team: u.team,
      lane: u.lane,
      kind: spec.kind,
      sourceId: u.id,
      fromTurret: false,
      targetId: target ? target.id : BASE_TARGET,
      x0,
      tx,
      speed: spec.speed,
      arc: spec.arc,
      damage: def.damage * this.mightMult(u.team),
      cls: def.cls,
      splash: splash ? splash.radius : 0,
      slow: slow ? { factor: slow.factor, duration: slow.duration } : undefined,
      bounce: bounce ? { count: bounce.count, falloff: bounce.falloff, range: bounce.range, hit: [] } : undefined,
    });
  }

  addProjectile(o: {
    team: Team;
    lane: number;
    kind: Projectile['kind'];
    sourceId: number;
    fromTurret: boolean;
    targetId: number;
    x0: number;
    tx: number;
    speed: number;
    arc: number;
    damage: number;
    cls: UnitClass | null;
    splash: number;
    slow?: Projectile['slow'];
    bounce?: Projectile['bounce'];
  }): Projectile {
    const p: Projectile = {
      id: this.newId(),
      team: o.team,
      lane: o.lane,
      kind: o.kind,
      sourceId: o.sourceId,
      fromTurret: o.fromTurret,
      targetId: o.targetId,
      x0: o.x0,
      x: o.x0,
      px: o.x0,
      tx: o.tx,
      t: 0,
      dur: Math.max(0.06, Math.abs(o.tx - o.x0) / o.speed),
      arc: o.arc,
      damage: o.damage,
      cls: o.cls,
      splash: o.splash,
      slow: o.slow,
      bounce: o.bounce,
      done: false,
    };
    this.projectiles.push(p);
    this.emit({ type: 'projectile', projId: p.id, team: p.team, lane: p.lane, kind: p.kind, fromTurret: p.fromTurret });
    return p;
  }

  private updateTurrets(dt: number): void {
    for (const p of this.players) {
      const ward = WARD;
      const scale = POWER_SCALE[p.age];
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        const slot = p.turrets[lane];
        if (slot.cooldown > 0) slot.cooldown -= dt;
        if (p.wardCooldown[lane] > 0) p.wardCooldown[lane] -= dt;
        // The enemy closest to our citadel.
        let best: Unit | null = null;
        let bestD = Infinity;
        for (const e of this.lanes[lane]) {
          if (!e.alive || e.team === p.team) continue;
          const d = p.team === 0 ? e.x - e.def.radius : LANE_LENGTH - (e.x + e.def.radius);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (!best) continue;
        // During Ragnarök the gate wards fall silent.
        if (!this.ragnarokStarted && bestD <= ward.range && p.wardCooldown[lane] <= 0) {
          p.wardCooldown[lane] = ward.cooldown;
          this.addProjectile({
            team: p.team,
            lane,
            kind: ward.projectile.kind,
            sourceId: -(lane + 20),
            fromTurret: true,
            targetId: best.id,
            x0: this.baseFront(p.team),
            tx: best.x,
            speed: ward.projectile.speed,
            arc: ward.projectile.arc,
            damage: ward.damage * scale * this.defenseMult(p.team),
            cls: null,
            splash: 0,
          });
        }
        const def = slot.def;
        if (!def || bestD > def.range) continue;
        slot.aimX = best.x;
        if (slot.cooldown > 0) continue;
        slot.cooldown = def.cooldown;
        slot.lastFire = this.time;
        this.addProjectile({
          team: p.team,
          lane,
          kind: def.projectile.kind,
          sourceId: -(lane + 10),
          fromTurret: true,
          targetId: best.id,
          x0: this.baseFront(p.team),
          tx: best.x,
          speed: def.projectile.speed,
          arc: def.projectile.arc,
          damage: def.damage * this.defenseMult(p.team),
          cls: null,
          splash: def.splash,
          slow: def.slow,
        });
        this.emit({ type: 'turretFire', team: p.team, lane });
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      if (pr.done) continue;
      if (pr.targetId >= 0) {
        const t = this.unitById.get(pr.targetId);
        if (t && t.alive) pr.tx = t.x;
      }
      pr.t = Math.min(1, pr.t + dt / pr.dur);
      pr.x = pr.x0 + (pr.tx - pr.x0) * pr.t;
      if (pr.t >= 1) this.impactProjectile(pr);
    }
  }

  private impactProjectile(pr: Projectile): void {
    pr.done = true;
    const source = pr.fromTurret ? 'turret' : 'projectile';
    const attacker = pr.fromTurret ? null : (this.unitById.get(pr.sourceId) ?? null);
    this.emit({ type: 'impact', team: pr.team, lane: pr.lane, x: pr.tx, kind: pr.kind, splash: pr.splash });
    if (pr.targetId === BASE_TARGET) {
      this.damageBase(other(pr.team), pr.damage, pr.lane, pr.team);
      return;
    }
    const target = this.unitById.get(pr.targetId);
    if (pr.splash > 0) {
      for (const e of this.lanes[pr.lane]) {
        if (!e.alive || e.team === pr.team) continue;
        if (Math.abs(e.x - pr.tx) <= pr.splash + e.def.radius) {
          const falloff = e === target ? 1 : 0.75;
          this.damageUnit(e, pr.damage * falloff, pr.cls, source, attacker);
          if (pr.slow && e.alive) this.applySlow(e, pr.slow.factor, pr.slow.duration);
        }
      }
      return;
    }
    if (!target || !target.alive) return;
    this.damageUnit(target, pr.damage, pr.cls, source, attacker);
    if (pr.slow && target.alive) this.applySlow(target, pr.slow.factor, pr.slow.duration);
    if (pr.bounce && pr.bounce.count > 0) {
      const hit = [...pr.bounce.hit, target.id];
      let next: Unit | null = null;
      let nd = Infinity;
      for (const e of this.lanes[pr.lane]) {
        if (!e.alive || e.team === pr.team || hit.includes(e.id)) continue;
        const d = Math.abs(e.x - target.x);
        if (d <= pr.bounce.range + e.def.radius && d < nd) {
          nd = d;
          next = e;
        }
      }
      if (next) {
        this.addProjectile({
          team: pr.team,
          lane: pr.lane,
          kind: pr.kind,
          sourceId: pr.sourceId,
          fromTurret: pr.fromTurret,
          targetId: next.id,
          x0: target.x,
          tx: next.x,
          speed: 420,
          arc: pr.arc * 0.6,
          damage: pr.damage * pr.bounce.falloff,
          cls: pr.cls,
          splash: 0,
          bounce: { count: pr.bounce.count - 1, falloff: pr.bounce.falloff, range: pr.bounce.range, hit },
        });
      }
    }
  }

  applySlow(u: Unit, factor: number, duration: number): void {
    u.slowFactor = Math.min(u.slowTimer > 0 ? u.slowFactor : 1, factor);
    u.slowTimer = Math.max(u.slowTimer, duration);
  }

  /** Deals damage (after class counters) and returns the amount dealt. */
  damageUnit(
    target: Unit,
    amount: number,
    cls: UnitClass | null,
    source: 'unit' | 'turret' | 'power' | 'projectile',
    attacker: Unit | null,
  ): number {
    if (!target.alive) return 0;
    const mult = counterMultiplier(cls, target.def.cls);
    const dealt = amount * mult;
    target.hp -= dealt;
    target.lastHitAt = this.time;
    this.emit({ type: 'hit', targetId: target.id, team: target.team, lane: target.lane, x: target.x, amount: dealt, mult, source });
    if (target.hp <= 0) this.killUnit(target, attacker);
    return dealt;
  }

  killUnit(u: Unit, attacker: Unit | null): void {
    const rebirth = trait(u.def, 'rebirth');
    if (rebirth && !u.rebirthUsed) {
      u.rebirthUsed = true;
      u.hp = u.maxHp * rebirth.hpFrac;
      u.slowTimer = 0;
      u.slowFactor = 1;
      u.rootTimer = 0;
      u.freezeTimer = 0;
      this.emit({ type: 'rebirth', unitId: u.id, team: u.team, lane: u.lane, x: u.x });
      return;
    }
    u.alive = false;
    u.hp = 0;
    const killer = this.players[other(u.team)];
    const gold = Math.round(u.def.cost * KILL_GOLD_MULT);
    killer.gold += gold;
    killer.xp += u.def.cost * KILL_XP_MULT;
    killer.stats.kills++;
    killer.stats.killsByLane[u.lane]++;
    killer.stats.goldEarned += gold;
    this.players[u.team].stats.losses++;
    if (attacker) attacker.kills++;
    this.emit({ type: 'death', unitId: u.id, team: u.team, lane: u.lane, x: u.x, defId: u.def.id, flying: u.flying, gold });
  }

  damageBase(team: Team, rawAmount: number, lane: number, attackerTeam: Team): void {
    const p = this.players[team];
    if (p.baseHp <= 0) return;
    const amount = rawAmount * this.siegeMult();
    p.baseHp = Math.max(0, p.baseHp - amount);
    p.lastBaseHit = this.time;
    const att = this.players[attackerTeam];
    att.stats.damageToBase += amount;
    att.xp += (amount * BASE_DAMAGE_XP) / POWER_SCALE[att.age];
    this.emit({ type: 'baseHit', team, lane, amount });
  }

  private updateShrines(dt: number): void {
    const rate = dt / SHRINE_CAPTURE_TIME;
    for (const s of this.shrines) {
      let n0 = 0;
      let n1 = 0;
      for (const u of this.lanes[s.lane]) {
        if (!u.alive || Math.abs(u.x - SHRINE_X) > SHRINE_RADIUS) continue;
        if (u.team === 0) n0++;
        else n1++;
      }
      s.contested = n0 > 0 && n1 > 0;
      if (n0 > 0 && n1 === 0) s.capture = Math.max(-1, s.capture - rate);
      else if (n1 > 0 && n0 === 0) s.capture = Math.min(1, s.capture + rate);
      let owner = s.owner;
      if (s.capture <= -1) owner = 0;
      else if (s.capture >= 1) owner = 1;
      else if (s.owner === 0 && s.capture > 0) owner = -1;
      else if (s.owner === 1 && s.capture < 0) owner = -1;
      if (owner !== s.owner) {
        s.owner = owner;
        this.emit({ type: 'shrine', lane: s.lane, owner });
      }
    }
  }

  private cleanup(): void {
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = this.lanes[i];
      if (lane.some((u) => !u.alive)) {
        for (const u of lane) if (!u.alive) this.unitById.delete(u.id);
        this.lanes[i] = lane.filter((u) => u.alive);
      }
    }
    if (this.projectiles.some((p) => p.done)) {
      const keep = this.projectiles.filter((p) => !p.done);
      this.projectiles.length = 0;
      this.projectiles.push(...keep);
    }
    if (this.powers.some((p) => p.done)) {
      const keep = this.powers.filter((p) => !p.done);
      this.powers.length = 0;
      this.powers.push(...keep);
    }
  }

  private checkWin(): void {
    for (const p of this.players) {
      if (p.baseHp <= 0 && this.winner === null) {
        this.winner = other(p.team);
        this.emit({ type: 'gameOver', winner: this.winner });
      }
    }
  }
}
