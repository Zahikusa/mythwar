import {
  AGES,
  BLESSINGS,
  BLESSING_MAX_RANK,
  BASE_DAMAGE_XP,
  BRITTLE_MULT,
  RUSH_COST,
  RUSH_XP,
  GLASS_CITADEL,
  KILL_GOLD_MULT,
  KILL_XP_MULT,
  LANE_COUNT,
  LANE_LENGTH,
  MAX_AGE,
  PASSIVE_XP,
  RAGNAROK_AFTER_FINAL,
  RAGNAROK_CRUMBLE,
  RAGNAROK_CRUMBLE_AFTER,
  RAGNAROK_RAMP,
  RAGNAROK_TIME,
  QUICK,
  POWER_SCALE,
  POWERS,
  QUEUE_MAX,
  SELL_REFUND,
  SHRINE_CAPTURE_TIME,
  HOLD_PAST_SHRINE,
  SHRINE_RADIUS,
  SHRINE_X,
  START_GOLD,
  START_POWER_COOLDOWN,
  SURGE_FIRST,
  SURGE_GAP,
  SURGE_INCOME,
  SURGE_OMEN,
  SURGE_TIME,
  TICK,
  TURRETS,
  UNITS,
  WARD,
  blessingCost,
  counterMultiplier,
} from './data.ts';
import type { BlessingId, Trait, TraitKind, TrialId, UnitClass, UnitDef } from './data.ts';
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
  Surge,
  Team,
  Unit,
} from './types.ts';

const ALLY_SPACING = 3;
/** Guardians' blows also hit enemies whose centre is this close to the target's. */
const GUARDIAN_SWEEP = 10;
const GUARDIAN_SWEEP_FALLOFF = 0.8;
/** Extra reach allowed when an attack resolves (target may have stepped back a little). */
const RESOLVE_SLACK = 14;

/**
 * "Is foe `e` at distance `d` nearer than the best so far?" Equally near foes (pack hunters and
 * flyers stack at the same x) go to the older one, the same way for both sides — scanning the
 * x-sorted lane would otherwise pick the front foe for one side and the rear one for the other.
 */
function nearer(d: number, e: Unit, bestD: number, best: Unit | null): boolean {
  return d < bestD - 1e-6 || (d <= bestD + 1e-6 && best !== null && e.id < best.id);
}

export interface WorldOptions {
  seed?: number;
  incomeMult?: [number, number];
  /** Trials per side (single player: the human's handicaps). */
  trials?: [TrialId[], TrialId[]];
  /** A quick battle (see QUICK). */
  quick?: boolean;
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
  /** Ley Surge state (absent in saves from before surges existed). */
  surge?: Surge | null;
  nextSurgeAt?: number;
  surgeRng?: number;
  lastSurgeLane?: number;
  /** A quick battle (absent in older saves: a standard one). */
  quick?: boolean;
  /** The battle's seed (names the battlefield; absent in older saves). */
  seed?: number;
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
  /** The seed the battle began with (only names the battlefield; never read by the rules). */
  seed: number;
  readonly players: [PlayerState, PlayerState];
  readonly lanes: Unit[][] = [];
  readonly shrines: Shrine[] = [];
  readonly projectiles: Projectile[] = [];
  readonly powers: PowerInstance[] = [];
  readonly unitById = new Map<number, Unit>();
  winner: Team | null = null;
  /** A quick battle: faster XP, more starting gold, an earlier Ragnarök (QUICK). */
  quick = false;
  /** Sandbox (single player only): citadels can't fall, the battle never ends. */
  endless = false;
  /** Sim time at which Ragnarök begins (may move earlier once both sides reach the final age). */
  ragnarokAt = RAGNAROK_TIME;
  ragnarokStarted = false;
  private finalAgeAt: number | null = null;
  /** The Ley Surge foretold or running (null between surges). */
  surge: Surge | null = null;
  nextSurgeAt: number;
  lastSurgeLane = -1;
  /** Surges draw from their own stream, so they don't shift any other random outcome. */
  readonly surgeRng: Rng;
  private nextId = 1;
  private events: SimEvent[] = [];
  /** Scratch: each unit's distance to its target at the start of the lane update. */
  private startDist: number[] = [];
  /** Lifesteal earned during a lane update, applied once both sides have struck. */
  private heals: { u: Unit; amount: number }[] = [];

  constructor(opts: WorldOptions = {}) {
    this.seed = opts.seed ?? 12345;
    this.rng = new Rng(this.seed);
    this.surgeRng = new Rng(((opts.seed ?? 12345) ^ 0x51ed2705) >>> 0);
    this.nextSurgeAt = this.surgeRng.range(SURGE_FIRST[0], SURGE_FIRST[1]);
    const mult = opts.incomeMult ?? [1, 1];
    this.players = [this.makePlayer(0, mult[0]), this.makePlayer(1, mult[1])];
    if (opts.quick) {
      this.quick = true;
      this.ragnarokAt = QUICK.ragnarok;
      for (const p of this.players) p.gold = QUICK.gold;
    }
    if (opts.trials) {
      for (const p of this.players) {
        p.trials = [...opts.trials[p.team]];
        p.baseHp = p.baseMaxHp = this.baseMaxHpFor(p.team);
      }
    }
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
      stats: { summoned: 0, summonedBy: {}, kills: 0, killsByLane: [0, 0, 0], losses: 0, goldEarned: 0, goldSpent: 0, damageToBase: 0, powersCast: 0, surgeGold: 0, classDamage: [0, 0, 0] },
      lastBaseHit: -10,
      hold: [false, false, false],
      trials: [],
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
      surge: this.surge,
      nextSurgeAt: this.nextSurgeAt,
      surgeRng: this.surgeRng.state,
      lastSurgeLane: this.lastSurgeLane,
      quick: this.quick,
      seed: this.seed,
      players: this.players.map((p) => ({ ...p, turrets: p.turrets.map((t) => ({ ...t, def: t.def ? t.def.id : null })) })),
      lanes: this.lanes.map((l) => l.filter((u) => u.alive).map((u) => ({ ...u, def: u.def.id }))),
      shrines: this.shrines,
      projectiles: this.projectiles.filter((p) => !p.done),
      powers: this.powers.filter((p) => !p.done),
    };
    return JSON.parse(JSON.stringify(snap)) as WorldSnapshot;
  }

  /** Rebuilds a world from `serialize()` output. Throws on unknown data. */
  static deserialize(source: WorldSnapshot): World {
    if (!source || source.v !== 1) throw new Error('Unsupported save');
    // Work on a copy: the world must not share (or patch) the caller's snapshot objects.
    const snap = structuredClone(source);
    const w = new World();
    w.time = snap.time;
    w.tick = snap.tick;
    w.rng.state = snap.rng;
    w.nextId = snap.nextId;
    w.winner = snap.winner;
    w.ragnarokAt = snap.ragnarokAt;
    w.ragnarokStarted = snap.ragnarokStarted;
    w.finalAgeAt = snap.finalAgeAt;
    w.quick = !!snap.quick;
    w.seed = snap.seed ?? 0;
    if (typeof snap.nextSurgeAt === 'number') {
      w.surge = snap.surge ?? null;
      w.nextSurgeAt = snap.nextSurgeAt;
      w.surgeRng.state = snap.surgeRng ?? 0;
      w.lastSurgeLane = snap.lastSurgeLane ?? -1;
    } else w.nextSurgeAt = Math.max(w.nextSurgeAt, w.time + SURGE_GAP[0]);
    for (let i = 0; i < 2; i++) {
      const p = snap.players[i];
      // Older saves may predate some stats fields.
      p.stats.killsByLane ??= [0, 0, 0];
      p.stats.summonedBy ??= {};
      p.stats.surgeGold ??= 0;
      p.stats.classDamage ??= [0, 0, 0];
      p.hold ??= [false, false, false];
      p.trials ??= [];
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

  /** Extra gold per second `team` draws from a running Ley Surge (0 unless it holds that shrine). */
  surgeIncomeOf(team: Team): number {
    const s = this.surge;
    if (!s || this.time < s.start || this.shrines[s.lane].owner !== team) return 0;
    const p = this.players[team];
    return AGES[p.age].income * SURGE_INCOME * p.incomeMult;
  }

  /** Seconds into Ragnarök after which both citadels crumble. */
  get crumbleAfter(): number {
    return this.quick ? QUICK.crumbleAfter : RAGNAROK_CRUMBLE_AFTER;
  }

  /** XP comes this much faster (quick battles). */
  get xpMult(): number {
    return this.quick ? QUICK.xp : 1;
  }

  /** Multiplier on damage dealt to citadels (1 before Ragnarök). */
  siegeMult(): number {
    if (!this.ragnarokStarted) return 1;
    return 1 + ((this.time - this.ragnarokAt) / 60) * (this.quick ? QUICK.ramp : RAGNAROK_RAMP);
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
    return this.edgeDistTo(u, e, e.x);
  }

  /** Edge-to-edge distance from `u` to enemy `e` standing at `ex`. */
  private edgeDistTo(u: Unit, e: Unit, ex: number): number {
    return u.team === 0 ? ex - e.def.radius - (u.x + u.def.radius) : u.x - u.def.radius - (ex + e.def.radius);
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
    if (p.xp < next.xpRequired * RUSH_XP) return 'Not enough XP';
    if (p.gold < this.ascendCost(team)) return 'Not enough gold';
    return null;
  }

  /** The tithe to ascend now: the age's tithe, doubled when rushing (XP short of the mark). */
  ascendCost(team: Team): number {
    const p = this.players[team];
    const next = AGES[Math.min(MAX_AGE, p.age + 1)];
    return p.xp >= next.xpRequired ? next.ascendCost : next.ascendCost * RUSH_COST;
  }

  turretBlocker(team: Team, lane: number, turretId: string): string | null {
    const p = this.players[team];
    const def = TURRETS[turretId];
    if (!def) return 'Unknown turret';
    if (lane < 0 || lane >= LANE_COUNT) return 'Invalid lane';
    if (def.age > p.age) return 'Not available yet';
    if (p.trials.includes('nowalls')) return 'No turrets (No Walls trial)';
    const cur = p.turrets[lane].def;
    if (cur && cur.id === turretId) return 'Already built';
    const refund = cur ? Math.floor(cur.cost * SELL_REFUND) : 0;
    if (p.gold + refund < def.cost) return 'Not enough gold';
    return null;
  }

  /** Why a god power can't be cast now (in `lane`, when given), or null. */
  powerBlocker(team: Team, lane = -1): string | null {
    const p = this.players[team];
    if (p.trials.includes('godless')) return 'The gods are silent (Godless trial)';
    if (p.powerCooldown > 0) return 'God power is recharging';
    // A power cast on an empty lane would be wasted (usually a slip): refuse it, keep the charge.
    if (lane >= 0 && lane < LANE_COUNT && !this.lanes[lane].some((u) => u.alive && u.team !== team)) return 'No foes in that lane';
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
    const p = this.players[team];
    return AGES[p.age].baseHp * this.bastionMult(team) * (p.trials.includes('glass') ? GLASS_CITADEL : 1);
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
        let index = cmd.index;
        // Multiplayer orders arrive a moment late: if the queue has moved on (the creature in
        // front stepped out), cancel the nearest earlier item of the same kind instead.
        if (cmd.unitId !== undefined && p.queue[index]?.unitId !== cmd.unitId) {
          index = Math.min(index, p.queue.length - 1);
          while (index >= 0 && p.queue[index].unitId !== cmd.unitId) index--;
        }
        const item = p.queue[index];
        if (!item) return { ok: false, reason: 'Nothing to cancel' };
        const def = UNITS[item.unitId];
        const wasTraining = index === this.trainingIndex(cmd.team);
        p.queue.splice(index, 1);
        p.gold += def.cost;
        p.stats.goldSpent -= def.cost;
        if (wasTraining) p.trainProgress = 0;
        return { ok: true };
      }
      case 'ageUp': {
        const why = this.ageUpBlocker(cmd.team);
        if (why) return { ok: false, reason: why };
        const tithe = this.ascendCost(cmd.team);
        p.gold -= tithe;
        p.stats.goldSpent += tithe;
        p.age += 1;
        const newMax = this.baseMaxHpFor(cmd.team);
        const gained = newMax - p.baseMaxHp;
        p.baseMaxHp = newMax;
        p.baseHp = Math.min(p.baseMaxHp, p.baseHp + gained);
        p.powerCooldown = Math.min(p.powerCooldown, 8);
        this.emit({ type: 'ageUp', team: cmd.team, age: p.age, t: this.time });
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
      case 'stance': {
        if (cmd.lane < 0 || cmd.lane >= LANE_COUNT) return { ok: false, reason: 'Invalid lane' };
        p.hold[cmd.lane] = !!cmd.hold;
        this.emit({ type: 'stance', team: cmd.team, lane: cmd.lane, hold: !!cmd.hold });
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
        const why = this.powerBlocker(cmd.team, cmd.lane);
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
    this.updateRagnarok(dt);
    this.updateSurge(dt);
    for (let lane = 0; lane < LANE_COUNT; lane++) this.updateLane(lane, dt);
    this.updateTurrets(dt);
    this.updateProjectiles(dt);
    updatePowers(this, dt);
    this.updateShrines(dt);
    this.cleanup();
    this.checkWin();
  }

  private updateRagnarok(dt: number): void {
    if (this.ragnarokStarted) {
      // Long into Ragnarök both citadels crumble, so every battle ends (healthier one wins).
      const into = this.time - this.ragnarokAt;
      const after = this.crumbleAfter;
      if (into < after) return;
      if (into - dt < after) this.emit({ type: 'crumble' });
      for (const p of this.players) p.baseHp = Math.max(0, p.baseHp - p.baseMaxHp * RAGNAROK_CRUMBLE * dt);
      return;
    }
    if (this.players[0].age === MAX_AGE && this.players[1].age === MAX_AGE) {
      this.ragnarokAt = Math.min(this.ragnarokAt, Math.max(this.time, this.finalAgeAt ?? this.time) + (this.quick ? QUICK.afterFinal : RAGNAROK_AFTER_FINAL));
      this.finalAgeAt ??= this.time;
    }
    if (this.time >= this.ragnarokAt) {
      this.ragnarokStarted = true;
      this.ragnarokAt = this.time;
      this.emit({ type: 'ragnarok' });
    }
  }

  /** Ley Surges: foretell one, pay the holder of its shrine while it runs, schedule the next. */
  private updateSurge(dt: number): void {
    const s = this.surge;
    if (s) {
      if (this.time < s.start) return;
      if (this.time - dt < s.start) this.emit({ type: 'surge', lane: s.lane, phase: 'start', gained: [0, 0] });
      const owner = this.shrines[s.lane].owner;
      if (owner !== -1) {
        const p = this.players[owner];
        const gold = this.surgeIncomeOf(owner) * dt;
        p.gold += gold;
        p.stats.goldEarned += gold;
        p.stats.surgeGold += gold;
        s.gained[owner] += gold;
      }
      if (this.time >= s.end) {
        this.surge = null;
        this.nextSurgeAt = this.time + this.surgeRng.range(SURGE_GAP[0], SURGE_GAP[1]);
        this.emit({ type: 'surge', lane: s.lane, phase: 'end', gained: [s.gained[0], s.gained[1]] });
      }
      return;
    }
    if (this.ragnarokStarted || this.time < this.nextSurgeAt) return;
    const lane = this.lastSurgeLane < 0 ? this.surgeRng.int(LANE_COUNT) : (this.lastSurgeLane + 1 + this.surgeRng.int(LANE_COUNT - 1)) % LANE_COUNT;
    this.lastSurgeLane = lane;
    this.surge = { lane, start: this.time + SURGE_OMEN, end: this.time + SURGE_OMEN + SURGE_TIME, gained: [0, 0] };
    this.emit({ type: 'surge', lane, phase: 'omen', gained: [0, 0] });
  }

  private updatePlayer(p: PlayerState, dt: number): void {
    const income = this.incomeOf(p.team) * dt;
    p.gold += income;
    p.stats.goldEarned += income;
    p.xp += PASSIVE_XP * dt * this.xpMult;
    if (p.powerCooldown > 0) p.powerCooldown = Math.max(0, p.powerCooldown - dt);

    // Trained creatures waiting for room at a jammed gate step out as soon as it clears.
    for (let i = 0; i < p.queue.length; i++) {
      const item = p.queue[i];
      if (!item.ready) continue;
      const def = UNITS[item.unitId];
      if (this.canSpawn(p.team, item.lane, def)) {
        this.spawnUnit(p.team, item.lane, def);
        p.queue.splice(i, 1);
        i--;
      }
    }
    // Training works on the first creature that isn't ready yet.
    const idx = p.queue.findIndex((q) => !q.ready);
    if (idx >= 0) {
      const item = p.queue[idx];
      const def = UNITS[item.unitId];
      p.trainProgress = Math.min(def.trainTime, p.trainProgress + dt);
      if (p.trainProgress >= def.trainTime) {
        p.trainProgress = 0;
        if (this.canSpawn(p.team, item.lane, def)) {
          this.spawnUnit(p.team, item.lane, def);
          p.queue.splice(idx, 1);
        } else {
          item.ready = true; // don't hold up summons bound for other lanes
        }
        if (p.queue.some((q) => !q.ready)) this.emit({ type: 'trainStart', team: p.team });
      }
    }
  }

  /** Index of the queue item currently in training (-1 when everything left is ready/empty). */
  trainingIndex(team: Team): number {
    return this.players[team].queue.findIndex((q) => !q.ready);
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
    // Team 0 walks this list backwards, team 1 forwards: creatures standing at the same x (packs;
    // compared to 1e-4, as their positions pick up rounding noise) are ordered so that both
    // sides update the older one first.
    list.sort((a, b) => Math.round(a.x * 1e4) - Math.round(b.x * 1e4) || a.team - b.team || (a.team === 0 ? b.id - a.id : a.id - b.id));
    // Both sides decide whether a foe is in reach from the same start-of-tick positions, so the
    // side updated second doesn't get the first blow by seeing the other's step already made.
    const startDist = this.startDist;
    startDist.length = list.length;
    for (let i = 0; i < list.length; i++) {
      const u = list[i];
      startDist[i] = this.findTarget(u, list).dist;
      // Enrage also follows start-of-tick health, for the same reason, and regrowth happens
      // before anyone strikes.
      const enrage = trait(u.def, 'enrage');
      u.enraged = !!enrage && u.hp < u.maxHp * enrage.below;
      const regen = trait(u.def, 'regen');
      if (regen && u.alive && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + regen.perSec * u.maxHp * dt);
    }
    // Front-most units first so followers can close up within the same tick.
    for (let i = list.length - 1; i >= 0; i--) if (list[i].team === 0) this.updateOrLastBlow(list[i], list, dt, startDist[i]);
    for (let i = 0; i < list.length; i++) if (list[i].team === 1) this.updateOrLastBlow(list[i], list, dt, startDist[i]);
    // Blows in one tick are simultaneous: lifesteal only heals a creature that survived them all.
    for (const { u, amount } of this.heals) if (u.alive) u.hp = Math.min(u.maxHp, u.hp + amount);
    this.heals.length = 0;
  }

  private updateOrLastBlow(u: Unit, list: Unit[], dt: number, startDist: number): void {
    if (u.alive) {
      this.updateUnit(u, list, dt, startDist);
      return;
    }
    // Slain this very tick by a unit updated earlier: blows that land in the same tick are
    // simultaneous, so a swing finishing now still lands (update order mustn't pick the winner).
    if (u.windupTimer > 0 && u.freezeTimer <= 0) {
      const enrage = trait(u.def, 'enrage');
      const atkRate = (u.slowTimer > 0 ? u.slowFactor : 1) * (u.enraged && enrage ? enrage.attackSpeed : 1);
      u.windupTimer -= dt * atkRate;
      if (u.windupTimer <= 0) this.resolveAttack(u, list);
    }
  }

  /**
   * Nearest enemy unit (or the citadel) in front of `u`. With `atStart`, foes are measured where
   * they stood at the start of the tick, so the side updated second doesn't see the other's step.
   */
  findTarget(u: Unit, list: Unit[], atStart = false): { target: Unit | null; dist: number } {
    let best: Unit | null = null;
    let bestDist = this.baseDist(u);
    for (const e of list) {
      if (!e.alive || e.team === u.team) continue;
      const d = atStart ? this.edgeDistTo(u, e, e.px) : this.edgeDist(u, e);
      if (nearer(d, e, bestDist, best)) {
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

  private updateUnit(u: Unit, list: Unit[], dt: number, startDist: number): void {
    const def = u.def;
    if (u.slowTimer > 0) {
      u.slowTimer -= dt;
      if (u.slowTimer <= 0) u.slowFactor = 1;
    }
    if (u.rootTimer > 0) u.rootTimer -= dt;
    if (u.freezeTimer > 0) {
      u.freezeTimer -= dt;
      u.windupTimer = 0;
      u.moving = false;
      return;
    }
    const enrage = trait(def, 'enrage');
    const speedMult = u.slowTimer > 0 ? u.slowFactor : 1;
    const atkRate = speedMult * (u.enraged && enrage ? enrage.attackSpeed : 1);
    if (u.attackTimer > 0) u.attackTimer -= dt * atkRate;

    if (u.windupTimer > 0) {
      u.moving = false;
      u.windupTimer -= dt * atkRate;
      if (u.windupTimer <= 0) this.resolveAttack(u, list);
      return;
    }

    const { target, dist } = this.findTarget(u, list, true);
    // In reach since the start of the tick, and still in reach now (if the foe just died, the
    // next one must be in reach too — no swinging at a foe a step away).
    // (A hair of tolerance: mirrored positions round differently on the two sides.)
    if (startDist <= def.range + 1e-6 && dist <= def.range + 1e-6) {
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
    // Holding the line: no further than just past the shrine (those already beyond stand fast).
    if (this.players[u.team].hold[u.lane]) {
      const front = u.team === 0 ? SHRINE_X + HOLD_PAST_SHRINE - (u.x + def.radius) : u.x - def.radius - (LANE_LENGTH - SHRINE_X - HOLD_PAST_SHRINE);
      step = Math.min(step, Math.max(0, front));
    }
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
    // Foes are measured where they stood at the start of the tick (as in updateUnit), so a
    // blow redirected after its target fell doesn't favour the side updated second.
    const t = u.pendingTarget >= 0 ? this.unitById.get(u.pendingTarget) : undefined;
    if (t && t.alive) {
      target = t;
      dist = this.edgeDistTo(u, t, t.px);
    } else {
      const found = this.findTarget(u, list, true);
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
    const hpBefore = target.hp;
    const dealt = this.damageUnit(target, dmg, def.cls, 'unit', u);
    const lifesteal = trait(def, 'lifesteal');
    // Heals for the damage actually taken (no overkill), once the tick's blows are all in.
    if (lifesteal) this.heals.push({ u, amount: Math.min(dealt, Math.max(0, hpBefore)) * lifesteal.frac });
    // Splash around the target: Guardians' sweeping blows catch foes crowded around it (breaks
    // hunter packs), cleave strikes the nearest other foes in reach, a slam crushes everyone close
    // by. Shares don't stack: each foe takes the largest one that applies.
    const cleave = trait(def, 'cleave');
    const slam = trait(def, 'slam');
    if (def.cls !== 'guardian' && !cleave && !slam) return;
    const cleaved = cleave
      ? list
          .filter((e) => e.alive && e.team !== u.team && e !== target && this.edgeDist(u, e) <= def.range + 30)
          .sort((a, b) => this.edgeDist(u, a) - this.edgeDist(u, b) || a.id - b.id)
          .slice(0, cleave.targets - 1)
      : null;
    for (const e of list) {
      if (!e.alive || e.team === u.team || e === target) continue;
      const dx = Math.abs(e.x - target.x);
      let share = def.cls === 'guardian' && dx <= GUARDIAN_SWEEP ? GUARDIAN_SWEEP_FALLOFF : 0;
      if (slam && dx <= slam.radius + e.def.radius) share = Math.max(share, slam.falloff);
      if (cleave && cleaved!.includes(e)) share = Math.max(share, cleave.falloff);
      if (share > 0) this.damageUnit(e, dmg * share, def.cls, 'unit', u);
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
          if (nearer(d, e, bestD, best)) {
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
        // (In Ragnarök the gate turrets fire at half their rate: stalemates break.)
        slot.cooldown = def.cooldown * (this.ragnarokStarted ? 2 : 1);
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
    this.emit({ type: 'impact', id: pr.id, team: pr.team, lane: pr.lane, x: pr.tx, kind: pr.kind, splash: pr.splash });
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
        if (d <= pr.bounce.range + e.def.radius && nearer(d, e, nd, next)) {
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
    // Frozen solid, a creature is brittle: whatever hits it before it thaws hits harder.
    const dealt = amount * mult * (target.freezeTimer > 0 ? BRITTLE_MULT : 1);
    // How well each side counters: its creatures' damage, split by the class matchup.
    if (cls) {
      const cd = this.players[other(target.team)].stats.classDamage;
      cd[0] += dealt;
      if (mult > 1) cd[1] += dealt;
      else if (mult < 1) cd[2] += dealt;
    }
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
    killer.xp += u.def.cost * KILL_XP_MULT * this.xpMult;
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
    att.xp += ((amount * BASE_DAMAGE_XP) / POWER_SCALE[att.age]) * this.xpMult;
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
    if (this.winner !== null || this.endless) return;
    const [p0, p1] = this.players;
    const fallen0 = p0.baseHp <= 0;
    const fallen1 = p1.baseHp <= 0;
    if (!fallen0 && !fallen1) return;
    // Both citadels falling in the same tick (Ragnarök makes it possible): the side that dealt
    // more siege damage over the battle wins, rather than whichever is checked first (a dead
    // heat on that too is a coin toss, not a win for the side checked first).
    if (fallen0 && fallen1) {
      const d0 = p0.stats.damageToBase;
      const d1 = p1.stats.damageToBase;
      this.winner = d0 !== d1 ? (d0 > d1 ? 0 : 1) : this.rng.chance(0.5) ? 0 : 1;
    } else this.winner = fallen0 ? 1 : 0;
    this.emit({ type: 'gameOver', winner: this.winner });
  }
}
