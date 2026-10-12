import { AGES, AGE_TURRETS, AGE_UNITS, BLESSING_MAX_RANK, CLASS_ORDER, LANE_COUNT, LANE_LENGTH, UNITS, blessingCost, counterOf } from '../sim/data.ts';
import type { BlessingId } from '../sim/data.ts';
import type { TurretDef, UnitClass, UnitDef } from '../sim/data.ts';
import { Rng } from '../sim/rng.ts';
import type { Team } from '../sim/types.ts';
import type { World } from '../sim/world.ts';

export type Difficulty = 'novice' | 'adept' | 'master' | 'mythic';

export interface AiProfile {
  id: Difficulty;
  name: string;
  blurb: string;
  /** Seconds between decisions. */
  think: number;
  /** Probability of choosing the class that counters the lane's enemies. */
  counterSkill: number;
  /** Probability of reinforcing the lane that needs it most. */
  laneSkill: number;
  /** Probability per decision of ascending when able (and safe); also the share of the tithe it
   *  holds back once it has the XP... */
  ascendSkill: number;
  /** ...plus this much per 100% of XP past the requirement (a slow saver still gets there). */
  saveRamp: number;
  /** Probability per decision of considering a turret. */
  turretSkill: number;
  /** Probability of aiming the god power well (else it is cast at a random lane with enemies). */
  powerSkill: number;
  /** Probability per decision of buying a blessing with spare gold. */
  blessSkill: number;
  /** Gold kept in hand after buying a blessing, in units of the age's cheapest creature. */
  blessMargin: number;
  /** Holds summons back to mount an up-to-date turret on a lane the foe has pushed into. */
  plansTurrets: boolean;
  /** Never ascends past the opponent's age: it follows the player up the ages instead of leading. */
  followsAge?: boolean;
  /** Max summons waiting in the queue. */
  maxQueue: number;
  /** Seconds before the AI first considers turrets. */
  turretDelay: number;
  incomeMult: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  novice: {
    id: 'novice',
    name: 'Novice',
    blurb: 'A wandering spirit. Slow to react, easily outwitted — and it only ascends after you do.',
    think: 2.8,
    counterSkill: 0.15,
    laneSkill: 0.35,
    // Ascends readily, but only into ages the player has already reached: a beginner sees the
    // war escalate with them, and is never out-tiered for not ascending yet.
    ascendSkill: 0.7,
    saveRamp: 0.6,
    followsAge: true,
    turretSkill: 0.15,
    powerSkill: 0.3,
    blessSkill: 0.1,
    blessMargin: 4,
    plansTurrets: false,
    maxQueue: 2,
    turretDelay: 150,
    incomeMult: 0.5,
  },
  adept: {
    id: 'adept',
    name: 'Adept',
    blurb: 'A cunning warlord who answers threats — eventually.',
    think: 1.6,
    counterSkill: 0.5,
    laneSkill: 0.65,
    ascendSkill: 0.6,
    saveRamp: 0,
    turretSkill: 0.45,
    powerSkill: 0.7,
    blessSkill: 0.4,
    blessMargin: 2,
    plansTurrets: false,
    maxQueue: 3,
    turretDelay: 90,
    incomeMult: 0.9,
  },
  master: {
    id: 'master',
    name: 'Master',
    blurb: 'A seasoned general. Counters your creatures and punishes mistakes.',
    think: 0.65,
    counterSkill: 0.85,
    laneSkill: 0.9,
    ascendSkill: 0.95,
    saveRamp: 0,
    turretSkill: 0.8,
    powerSkill: 0.95,
    blessSkill: 0.8,
    blessMargin: 1,
    plansTurrets: false,
    maxQueue: 5,
    turretDelay: 45,
    incomeMult: 1,
  },
  mythic: {
    id: 'mythic',
    name: 'Mythic',
    blurb: 'A god of war. Flawless, relentless — and favoured by fortune (+20% income).',
    think: 0.35,
    counterSkill: 1,
    laneSkill: 1,
    ascendSkill: 1,
    saveRamp: 0,
    turretSkill: 1,
    powerSkill: 1,
    blessSkill: 1,
    // Keeps its blessings coming instead of sinking every coin into the queue, and mounts
    // turrets before the foe reaches its gates (the two things that most often beat it).
    blessMargin: 0,
    plansTurrets: true,
    maxQueue: 5,
    turretDelay: 30,
    incomeMult: 1.2,
  },
};

export const DIFFICULTIES: Difficulty[] = ['novice', 'adept', 'master', 'mythic'];

interface LaneInfo {
  lane: number;
  enemyValue: number;
  enemyThreat: number; // value weighted by proximity to our citadel
  myValue: number;
  enemyByClass: Record<UnitClass, number>;
  frontClass: UnitClass | null; // class of the enemy creature closest to us
  enemyFront: number; // distance (0..1) of the closest enemy from our citadel, 1 = far away
  myFrontClass: UnitClass | null;
  enemyCount: number;
  need: number;
}

function unitValue(def: UnitDef, hp: number, maxHp: number): number {
  return def.cost * (0.35 + 0.65 * (hp / maxHp));
}

export class AiController {
  readonly team: Team;
  readonly profile: AiProfile;
  private readonly world: World;
  private readonly rng: Rng;
  private timer: number;
  /** Lane chosen for "push" summons when nothing is threatening. */
  private pushLane: number;

  constructor(world: World, team: Team, profile: AiProfile, seed = 99) {
    this.world = world;
    this.team = team;
    this.profile = profile;
    this.rng = new Rng(seed);
    this.timer = 1 + this.rng.range(0, profile.think);
    this.pushLane = this.rng.int(LANE_COUNT);
    world.players[team].incomeMult = profile.incomeMult;
  }

  /** Decision-loop state for save games. */
  snapshot(): { timer: number; pushLane: number; rng: number } {
    return { timer: this.timer, pushLane: this.pushLane, rng: this.rng.state };
  }

  restore(s: { timer: number; pushLane: number; rng: number }): void {
    this.timer = s.timer;
    this.pushLane = s.pushLane;
    this.rng.state = s.rng;
  }

  update(dt: number): void {
    if (this.world.winner !== null) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.profile.think * this.rng.range(0.75, 1.25);
    this.decide();
  }

  /** Distance from our citadel, normalised 0 (at our gate) .. 1 (at theirs). */
  private distFromHome(x: number): number {
    return this.team === 0 ? x / LANE_LENGTH : 1 - x / LANE_LENGTH;
  }

  private assess(): LaneInfo[] {
    const w = this.world;
    const me = w.players[this.team];
    const out: LaneInfo[] = [];
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const info: LaneInfo = {
        lane,
        enemyValue: 0,
        enemyThreat: 0,
        myValue: 0,
        enemyByClass: { guardian: 0, hunter: 0, mystic: 0, legend: 0 },
        frontClass: null,
        enemyFront: 1,
        myFrontClass: null,
        enemyCount: 0,
        need: 0,
      };
      let myFront = -1;
      for (const u of w.lanes[lane]) {
        if (!u.alive) continue;
        const v = unitValue(u.def, u.hp, u.maxHp);
        const d = this.distFromHome(u.x);
        if (u.team === this.team) {
          info.myValue += v;
          if (d > myFront) {
            myFront = d;
            info.myFrontClass = u.def.cls;
          }
        } else {
          info.enemyCount++;
          info.enemyValue += v;
          info.enemyThreat += v * (1 + 2.5 * (1 - d));
          info.enemyByClass[u.def.cls] += v;
          if (d < info.enemyFront) {
            info.enemyFront = d;
            info.frontClass = u.def.cls;
          }
        }
      }
      for (const q of me.queue) if (q.lane === lane) info.myValue += UNITS[q.unitId].cost;
      const turret = me.turrets[lane].def;
      const turretValue = turret ? turret.cost * 0.8 * (info.enemyFront < 0.3 ? 1 : 0.3) : 0;
      const shrine = w.shrines[lane];
      const shrineBonus = shrine.owner === this.team ? 0 : 12 * AGE_COST_SCALE(me.age);
      // A Ley Surge (foretold or running) makes this shrine worth a march; skilled AIs answer it.
      const surge = w.surge?.lane === lane ? (shrine.owner === this.team ? 15 : 35) * AGE_COST_SCALE(me.age) * this.profile.laneSkill : 0;
      info.need = info.enemyThreat - info.myValue * 1.1 - turretValue + shrineBonus + surge;
      // Enemies at the gate are an emergency: they are hitting the citadel.
      if (info.enemyFront < 0.25) info.need += 40 * AGE_COST_SCALE(me.age) + info.enemyValue * 2;
      out.push(info);
    }
    return out;
  }

  private decide(): void {
    const w = this.world;
    const me = w.players[this.team];
    const p = this.profile;
    const lanes = this.assess();
    const danger = Math.max(...lanes.map((l) => l.need));
    const unitCost = AGE_UNITS[me.age][0].cost;
    const underSiege = lanes.some((l) => l.enemyFront < 0.2 && l.enemyValue > l.myValue);

    // 1. God power.
    if (me.powerCooldown <= 0) this.considerPower(lanes);

    // 2. Ascend.
    let reserve = 0;
    // Under siege, gold normally goes straight into defenders — but not while the foe is an age
    // ahead and we could ascend: their creatures out-tier ours, so spending on more of ours is a
    // death spiral, and ascending also reinforces the citadel.
    let saveThroughSiege = false;
    const foeAge = w.players[this.team === 0 ? 1 : 0].age;
    if (me.age < AGES.length - 1 && !(p.followsAge && me.age >= foeAge)) {
      const next = AGES[me.age + 1];
      const xpReady = me.xp >= next.xpRequired;
      if (xpReady) {
        // Ascending also reinforces the citadel, so it is worth doing even under siege.
        if (me.gold >= next.ascendCost && this.rng.chance(p.ascendSkill)) {
          if (w.apply({ type: 'ageUp', team: this.team }).ok) return;
        }
        saveThroughSiege = w.players[this.team === 0 ? 1 : 0].age > me.age;
        // Save up for the tithe (less strictly while the citadel is in trouble). Less able AIs
        // are slow to commit: they hold back part of it at first and all of it once their XP is
        // well past the mark (otherwise a Novice practically never ascended).
        const resolve = Math.min(1, p.ascendSkill + p.saveRamp * (me.xp / next.xpRequired - 1));
        reserve = next.ascendCost * resolve * (underSiege && !saveThroughSiege ? 0.5 : 1);
      } else if (me.xp >= next.xpRequired * 0.8 && !underSiege) {
        reserve = next.ascendCost * 0.5 * p.ascendSkill;
      }
    }
    const keep = underSiege && !saveThroughSiege ? 0 : reserve;

    // 3. Turrets. A planning AI mounts one as soon as foes push past midfield in a lane without
    // an up-to-date turret, and holds further summons back until it can afford it.
    let maxQueue = p.maxQueue;
    const plan = p.plansTurrets ? this.turretPlan(lanes) : null;
    if (plan) {
      if (me.gold >= plan.def.cost) w.apply({ type: 'buildTurret', team: this.team, lane: plan.lane, turretId: plan.def.id });
      else maxQueue = Math.min(maxQueue, Math.max(1, me.queue.length));
    }
    if (w.time >= p.turretDelay && this.rng.chance(p.turretSkill)) this.considerTurret(lanes, reserve, saveThroughSiege);

    // 4. Blessings with clearly spare gold.
    if (this.rng.chance(p.blessSkill)) this.considerBlessing(reserve, unitCost, underSiege);

    // 5. Summons.
    let guard = 0;
    while (me.queue.length < maxQueue && guard++ < 6) {
      const lane = this.pickLane(lanes, danger, unitCost);
      const def = this.pickUnit(lanes[lane]);
      if (!def) break;
      const affordable = me.gold - def.cost >= keep;
      if (!affordable) {
        // Weaker AIs fall back to whatever they can afford; stronger ones wait for the right unit.
        if (this.rng.chance(1 - p.counterSkill)) {
          const cheap = AGE_UNITS[me.age].filter((u) => u.cost <= me.gold - keep && w.trainBlocker(this.team, u.id) === null);
          if (cheap.length === 0) break;
          const alt = this.rng.pick(cheap);
          if (!w.apply({ type: 'train', team: this.team, unitId: alt.id, lane }).ok) break;
          lanes[lane].myValue += alt.cost;
          lanes[lane].need -= alt.cost * 1.1;
          continue;
        }
        break;
      }
      if (!w.apply({ type: 'train', team: this.team, unitId: def.id, lane }).ok) break;
      lanes[lane].myValue += def.cost;
      lanes[lane].need -= def.cost * 1.1;
    }
  }

  private pickLane(lanes: LaneInfo[], danger: number, unitCost: number): number {
    const p = this.profile;
    if (!this.rng.chance(p.laneSkill)) return this.rng.int(LANE_COUNT);
    const sorted = [...lanes].sort((a, b) => b.need - a.need);
    if (sorted[0].need > unitCost * 0.5 || danger > 0) return sorted[0].lane;
    // Calm: push the chosen lane, occasionally switching. During Ragnarök, skilled AIs pile
    // into the weakest-defended lane, since anything that reaches the citadel hits hard.
    if (this.world.ragnarokStarted && p.laneSkill >= 0.9) {
      this.pushLane = [...lanes].sort((a, b) => a.enemyValue - b.enemyValue)[0].lane;
    } else if (this.rng.chance(0.2)) this.pushLane = this.rng.int(LANE_COUNT);
    return this.pushLane;
  }

  private pickUnit(info: LaneInfo): UnitDef | null {
    const w = this.world;
    const me = w.players[this.team];
    const roster = AGE_UNITS[me.age].filter((u) => w.trainBlocker(this.team, u.id) !== 'Not available in this age');
    const dragon = roster.find((u) => u.cls === 'legend');
    if (dragon && w.trainBlocker(this.team, dragon.id) === null && this.rng.chance(0.6 * this.profile.counterSkill + 0.2)) return dragon;
    const basics = roster.filter((u) => u.cls !== 'legend');
    if (!this.rng.chance(this.profile.counterSkill)) return this.rng.pick(basics);

    let want: UnitClass;
    if (info.enemyCount > 0) {
      // Counter the dominant enemy class, with extra weight on the creature at the front.
      const weights: Record<UnitClass, number> = { ...info.enemyByClass };
      if (info.frontClass) weights[info.frontClass] += info.enemyValue * 0.5;
      let dominant: UnitClass = 'guardian';
      for (const c of CLASS_ORDER) if (weights[c] > weights[dominant]) dominant = c;
      want = counterOf(dominant) ?? 'guardian';
      // Don't send squishy mystics into a lane without a frontline.
      if (want === 'mystic' && !info.myFrontClass && info.enemyFront < 0.6) want = this.rng.chance(0.5) ? 'guardian' : 'mystic';
    } else {
      // Empty lane: frontline first, then support.
      if (!info.myFrontClass || info.myFrontClass === 'mystic') want = this.rng.chance(0.6) ? 'guardian' : 'hunter';
      else want = this.rng.chance(0.55) ? 'mystic' : this.rng.pick(['guardian', 'hunter'] as UnitClass[]);
    }
    return basics.find((u) => u.cls === want) ?? this.rng.pick(basics);
  }

  private considerBlessing(reserve: number, unitCost: number, underSiege: boolean): void {
    const w = this.world;
    const me = w.players[this.team];
    const hurt = me.baseHp < me.baseMaxHp * 0.5;
    let options: BlessingId[] = ['might', 'vitality'];
    if (hurt || underSiege) options = ['bastion', ...options];
    options = options.filter((b) => me.blessings[b] < BLESSING_MAX_RANK);
    if (options.length === 0) return;
    // Cheapest rank first (keeps the tracks even), bastion first when the citadel is hurt.
    const pick = hurt && options[0] === 'bastion' ? 'bastion' : options.sort((a, b) => me.blessings[a] - me.blessings[b])[0];
    const cost = blessingCost(me.blessings[pick], me.age);
    if (me.gold - cost < reserve + unitCost * this.profile.blessMargin) return;
    w.apply({ type: 'bless', team: this.team, blessing: pick });
  }

  private considerPower(lanes: LaneInfo[]): void {
    const w = this.world;
    const me = w.players[this.team];
    const unitCost = AGE_UNITS[me.age][0].cost;
    const ranked = [...lanes].sort((a, b) => b.enemyThreat - a.enemyThreat);
    const best = ranked[0];
    const worthIt = best.enemyCount >= 3 || best.enemyThreat > unitCost * 6 || (best.enemyFront < 0.25 && best.enemyCount >= 1);
    if (!worthIt) return;
    let lane = best.lane;
    if (!this.rng.chance(this.profile.powerSkill)) {
      const withEnemies = lanes.filter((l) => l.enemyCount > 0);
      lane = this.rng.pick(withEnemies.length ? withEnemies : lanes).lane;
    }
    w.apply({ type: 'power', team: this.team, lane });
  }

  /** The turret a planning AI wants next: for the most threatened lane foes have pushed into. */
  private turretPlan(lanes: LaneInfo[]): { lane: number; def: TurretDef } | null {
    const me = this.world.players[this.team];
    let target: LaneInfo | null = null;
    for (const l of lanes) {
      const cur = me.turrets[l.lane].def;
      if ((cur && cur.age >= me.age) || l.enemyFront >= 0.5) continue;
      if (!target || l.enemyThreat > target.enemyThreat) target = l;
    }
    if (!target) return null;
    const [bolt, blast] = AGE_TURRETS[me.age];
    return { lane: target.lane, def: target.enemyCount >= 3 ? blast : bolt };
  }

  private considerTurret(lanes: LaneInfo[], reserve: number, saving: boolean): void {
    const w = this.world;
    const me = w.players[this.team];
    const [bolt, blast] = AGE_TURRETS[me.age];
    // Most threatened lane that lacks an up-to-date turret.
    const candidates = [...lanes]
      .filter((l) => {
        const cur = me.turrets[l.lane].def;
        return !cur || cur.age < me.age;
      })
      .sort((a, b) => b.enemyThreat - a.enemyThreat);
    if (candidates.length === 0) return;
    const target = candidates[0];
    const def = target.enemyCount >= 3 ? blast : bolt;
    const spare = me.gold - reserve - def.cost;
    // Only build when there is clearly spare gold, or the lane is under real pressure.
    const pressured = target.enemyFront < 0.35 && target.enemyValue > target.myValue;
    // (Not while saving to ascend out of an age deficit: an outdated turret won't hold them.)
    if (spare < AGE_UNITS[me.age][0].cost * 2 && !(pressured && !saving && me.gold >= def.cost)) return;
    w.apply({ type: 'buildTurret', team: this.team, lane: target.lane, turretId: def.id });
  }
}

function AGE_COST_SCALE(age: number): number {
  return AGE_UNITS[age][0].cost / AGE_UNITS[0][0].cost;
}
