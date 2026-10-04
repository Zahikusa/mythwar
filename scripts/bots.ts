/** Naive scripted players used to calibrate AI difficulty against human-like play. */
import { AGES, AGE_TURRETS, AGE_UNITS, BLESSING_ORDER, LANE_COUNT, TICK, blessingCost, counterOf } from '../src/sim/data.ts';
import type { UnitClass } from '../src/sim/data.ts';
import { Rng } from '../src/sim/rng.ts';
import type { Team } from '../src/sim/types.ts';
import type { World } from '../src/sim/world.ts';
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import type { Difficulty } from '../src/ai/ai.ts';
import { World as WorldClass } from '../src/sim/world.ts';

/**
 * spam: random creatures, random lanes · focus: everything down the middle · reactive: defends the
 * most threatened lane · counter: reactive + follows the Counter! badge · smart: counter + mounts
 * turrets on threatened lanes and buys blessings with spare gold (closest to a real player).
 */
export type BotKind = 'spam' | 'focus' | 'reactive' | 'counter' | 'smart';

export class Bot {
  private rng: Rng;
  private timer = 0;
  private world: World;
  private team: Team;
  private kind: BotKind;
  constructor(world: World, team: Team, kind: BotKind, seed: number) {
    this.world = world;
    this.team = team;
    this.kind = kind;
    this.rng = new Rng(seed);
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5 + this.rng.next();
    const w = this.world;
    const me = w.players[this.team];
    if (me.age < AGES.length - 1 && w.ageUpBlocker(this.team) === null) w.apply({ type: 'ageUp', team: this.team });
    if (me.powerCooldown <= 0) {
      let lane = 1;
      if (this.kind !== 'focus') {
        let best = -1;
        for (let l = 0; l < LANE_COUNT; l++) {
          const n = w.enemiesInLane(this.team, l).length;
          if (n > best) {
            best = n;
            lane = l;
          }
        }
      }
      w.apply({ type: 'power', team: this.team, lane });
    }
    const roster = AGE_UNITS[me.age].filter((u) => u.cls !== 'legend');
    // The smart bot saves the tithe once it has the XP, unless foes are close to its gates.
    if (this.kind === 'smart' && me.age < AGES.length - 1 && me.xp >= AGES[me.age + 1].xpRequired) {
      let near = false;
      for (let l = 0; l < LANE_COUNT; l++) for (const e of w.enemiesInLane(this.team, l)) if ((this.team === 0 ? e.x : 1000 - e.x) < 350) near = true;
      if (!near) return;
    }
    for (let i = 0; i < 2; i++) {
      let def = this.rng.pick(roster);
      let lane = this.kind === 'focus' ? 1 : this.rng.int(LANE_COUNT);
      if (this.kind === 'reactive' || this.kind === 'counter' || this.kind === 'smart') {
        // Sends to the lane where enemies are closest to home.
        let bestD = Infinity;
        for (let l = 0; l < LANE_COUNT; l++) {
          for (const e of w.enemiesInLane(this.team, l)) {
            const d = this.team === 0 ? e.x : 1000 - e.x;
            if (d < bestD) {
              bestD = d;
              lane = l;
            }
          }
        }
      }
      if (this.kind === 'counter' || this.kind === 'smart') {
        // Like a player following the "Counter!" badge for the lane they are defending.
        const weight: Record<string, number> = { guardian: 0, hunter: 0, mystic: 0, legend: 0 };
        for (const e of w.enemiesInLane(this.team, lane)) weight[e.def.cls] += e.def.cost;
        let dom: UnitClass = 'guardian';
        for (const c of ['hunter', 'mystic'] as UnitClass[]) if (weight[c] > weight[dom]) dom = c;
        const want = weight[dom] > 0 ? counterOf(dom) : null;
        def = roster.find((u) => u.cls === want) ?? def;
      }
      w.apply({ type: 'train', team: this.team, unitId: def.id, lane });
    }
    if (this.kind === 'smart') this.invest();
  }

  /** Turrets where foes come closest (when missing or outdated), blessings when gold piles up. */
  private invest(): void {
    const w = this.world;
    const me = w.players[this.team];
    let lane = -1;
    let bestD = Infinity;
    for (let l = 0; l < LANE_COUNT; l++) {
      const cur = me.turrets[l].def;
      if (cur && cur.age >= me.age) continue;
      for (const e of w.enemiesInLane(this.team, l)) {
        const d = this.team === 0 ? e.x : 1000 - e.x;
        if (d < bestD) {
          bestD = d;
          lane = l;
        }
      }
    }
    const [bolt, blast] = AGE_TURRETS[me.age];
    if (lane >= 0 && bestD < 600) {
      const def = w.enemiesInLane(this.team, lane).length >= 3 ? blast : bolt;
      if (me.gold >= def.cost + 60) w.apply({ type: 'buildTurret', team: this.team, lane, turretId: def.id });
    }
    for (const id of BLESSING_ORDER) {
      const cost = blessingCost(me.blessings[id], me.age);
      if (me.gold > cost + 400) w.apply({ type: 'bless', team: this.team, blessing: id });
    }
  }
}

export function botMatch(bot: BotKind, ai: Difficulty, seed: number): { winner: Team | null; time: number } {
  const w = new WorldClass({ seed });
  const b = new Bot(w, 0, bot, seed + 1);
  const a = new AiController(w, 1, AI_PROFILES[ai], seed + 2);
  while (w.winner === null && w.time < 45 * 60) {
    b.update(TICK);
    a.update(TICK);
    w.step();
    w.drainEvents();
  }
  return { winner: w.winner, time: w.time };
}

if ((process.argv[1] ?? '').endsWith('bots.ts')) {
  const n = Number(process.argv[2] ?? 10);
  for (const bot of ['spam', 'focus', 'reactive', 'counter', 'smart'] as BotKind[]) {
    const row: string[] = [];
    for (const ai of ['novice', 'adept', 'master', 'mythic'] as Difficulty[]) {
      let botWins = 0;
      let t = 0;
      for (let i = 0; i < n; i++) {
        const r = botMatch(bot, ai, 300 + i);
        if (r.winner === 0) botWins++;
        t += r.time;
      }
      row.push(`${ai}: bot ${botWins}/${n} (${(t / n / 60).toFixed(1)}m)`);
    }
    console.log(`${bot.padEnd(8)} ${row.join('  ')}`);
  }
}
