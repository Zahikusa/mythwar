/**
 * Economy probe (Lens #46): where gold comes from, where it goes, and how much lies idle, per age.
 *   node scripts/economy.ts [games=12] [who=ai|smart]
 * ai: even Master-vs-Master battles (both sides counted) · smart: the scripted player vs Adept
 * (the player's side only — closest to a human). Prints, per age the side was in:
 *   time in the age · gold earned per minute by source · spent per minute by sink ·
 *   mean banked gold · "idle" = share of seconds the side held ≥ 3 of its dearest creature's cost
 *   while its training queue was full (it could not have spent it on creatures).
 */
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import { AGES, AGE_UNITS, QUEUE_MAX, TICK } from '../src/sim/data.ts';
import type { Command } from '../src/sim/types.ts';
import { World } from '../src/sim/world.ts';
import { Bot } from './bots.ts';

const games = Number(process.argv[2] ?? 12);
const who = (process.argv[3] ?? 'ai') as 'ai' | 'smart';

type Sink = 'creatures' | 'turrets' | 'blessings' | 'ascend';
interface AgeAcc {
  secs: number;
  earned: { passive: number; kills: number; surge: number };
  spent: Record<Sink, number>;
  banked: number;
  idle: number;
  overQueue: number;
}
const acc: AgeAcc[] = AGES.map(() => ({ secs: 0, earned: { passive: 0, kills: 0, surge: 0 }, spent: { creatures: 0, turrets: 0, blessings: 0, ascend: 0 }, banked: 0, idle: 0, overQueue: 0 }));
const sinkOf: Partial<Record<Command['type'], Sink>> = { train: 'creatures', cancel: 'creatures', buildTurret: 'turrets', sellTurret: 'turrets', bless: 'blessings', ageUp: 'ascend' };

for (let g = 0; g < games; g++) {
  const seed = 5000 + g * 13;
  const w = new World({ seed });
  const counted = who === 'ai' ? [0, 1] : [0];
  const actors =
    who === 'ai'
      ? [new AiController(w, 0, AI_PROFILES.master, seed * 3 + 1), new AiController(w, 1, AI_PROFILES.master, seed * 7 + 5)]
      : [new Bot(w, 0, 'smart', seed + 1), new AiController(w, 1, AI_PROFILES.adept, seed + 2)];
  // Spending by sink: wrap apply and measure the gold change of each accepted command.
  const apply = w.apply.bind(w);
  w.apply = (cmd: Command) => {
    const p = w.players[cmd.team];
    const age = p.age;
    const before = p.gold;
    const r = apply(cmd);
    const sink = sinkOf[cmd.type];
    if (r.ok && sink && counted.includes(cmd.team)) acc[cmd.type === 'ageUp' ? age : p.age].spent[sink] += before - p.gold;
    return r;
  };
  let nextSample = 1;
  while (w.winner === null && w.time < 40 * 60) {
    const before = w.players.map((p) => ({ earned: p.stats.goldEarned, surge: p.stats.surgeGold, income: w.incomeOf(p.team) * TICK }));
    for (const a of actors) a.update(TICK);
    w.step();
    w.drainEvents();
    for (const t of counted) {
      const p = w.players[t];
      const a = acc[p.age];
      const b = before[t];
      const gained = p.stats.goldEarned - b.earned;
      const surge = p.stats.surgeGold - b.surge;
      a.earned.passive += b.income;
      a.earned.surge += surge;
      a.earned.kills += gained - b.income - surge;
    }
    if (w.time >= nextSample) {
      nextSample += 1;
      for (const t of counted) {
        const p = w.players[t];
        const a = acc[p.age];
        a.secs++;
        a.banked += p.gold;
        const dearest = Math.max(...AGE_UNITS[p.age].filter((u) => u.cls !== 'legend').map((u) => u.cost));
        if (p.gold >= 3 * dearest) {
          a.overQueue++;
          if (p.queue.length >= QUEUE_MAX) a.idle++;
        }
      }
    }
  }
}

const per = (x: number, secs: number) => (secs ? ((x / secs) * 60).toFixed(0) : '-').padStart(6);
console.log(`${who === 'ai' ? 'Master vs Master (both sides)' : 'smart player vs Adept (player side)'} — ${games} battles`);
console.log('age          min/side  earn/min: passive  kills  surge | spend/min: creat  turret  bless  ascend | banked  ≥3×dearest  of which queue full');
for (let i = 0; i < AGES.length; i++) {
  const a = acc[i];
  if (!a.secs) continue;
  const sides = who === 'ai' ? games * 2 : games;
  console.log(
    `${AGES[i].name.padEnd(12)} ${(a.secs / 60 / sides).toFixed(1).padStart(8)}  ${per(a.earned.passive, a.secs)}  ${per(a.earned.kills, a.secs)} ${per(a.earned.surge, a.secs)}  |  ${per(a.spent.creatures, a.secs)}  ${per(a.spent.turrets, a.secs)} ${per(a.spent.blessings, a.secs)}  ${per(a.spent.ascend, a.secs)}  | ${(a.banked / a.secs).toFixed(0).padStart(6)}  ${((a.overQueue / a.secs) * 100).toFixed(0).padStart(5)}%  ${((a.idle / a.secs) * 100).toFixed(0).padStart(5)}%`,
  );
}
