/** Naive scripted players used to calibrate AI difficulty against human-like play. */
import { AGES, AGE_UNITS, LANE_COUNT, TICK } from '../src/sim/data.ts';
import { Rng } from '../src/sim/rng.ts';
import type { Team } from '../src/sim/types.ts';
import type { World } from '../src/sim/world.ts';
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import type { Difficulty } from '../src/ai/ai.ts';
import { World as WorldClass } from '../src/sim/world.ts';

export type BotKind = 'spam' | 'focus' | 'reactive';

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
    for (let i = 0; i < 2; i++) {
      const def = this.rng.pick(roster);
      let lane = this.kind === 'focus' ? 1 : this.rng.int(LANE_COUNT);
      if (this.kind === 'reactive') {
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
      w.apply({ type: 'train', team: this.team, unitId: def.id, lane });
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
  for (const bot of ['spam', 'focus', 'reactive'] as BotKind[]) {
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
