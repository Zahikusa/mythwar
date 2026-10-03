/**
 * Headless AI-vs-AI balance runner.
 *   node scripts/sim.ts [games=20] [difficultyA=master] [difficultyB=master]
 */
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import type { Difficulty } from '../src/ai/ai.ts';
import { TICK } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';

export interface MatchResult {
  winner: 0 | 1 | null;
  time: number;
  ages: [number, number];
  kills: [number, number];
  summoned: [number, number];
  byUnit: Record<string, number>;
  ageTimes: string[];
}

export function playMatch(a: Difficulty, b: Difficulty, seed: number, maxTime = 40 * 60): MatchResult {
  const w = new World({ seed });
  const ais = [new AiController(w, 0, AI_PROFILES[a], seed * 3 + 1), new AiController(w, 1, AI_PROFILES[b], seed * 7 + 5)];
  const byUnit: Record<string, number> = {};
  const ageTimes: string[] = [];
  while (w.winner === null && w.time < maxTime) {
    for (const ai of ais) ai.update(TICK);
    w.step();
    for (const e of w.drainEvents()) {
      if (e.type === 'spawn') byUnit[e.defId] = (byUnit[e.defId] ?? 0) + 1;
      if (e.type === 'ageUp') ageTimes.push(`${'AB'[e.team]}${e.age + 1}@${(w.time / 60).toFixed(1)}`);
    }
  }
  return {
    winner: w.winner,
    time: w.time,
    ages: [w.players[0].age, w.players[1].age],
    kills: [w.players[0].stats.kills, w.players[1].stats.kills],
    summoned: [w.players[0].stats.summoned, w.players[1].stats.summoned],
    byUnit,
    ageTimes,
  };
}

const isMain = (process.argv[1] ?? '').endsWith('sim.ts');
if (isMain) {
  const games = Number(process.argv[2] ?? 20);
  const a = (process.argv[3] ?? 'master') as Difficulty;
  const b = (process.argv[4] ?? 'master') as Difficulty;
  const wins = [0, 0, 0];
  let total = 0;
  const units: Record<string, number> = {};
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const r = playMatch(a, b, 1000 + i);
    wins[r.winner === null ? 2 : r.winner]++;
    total += r.time;
    for (const [k, v] of Object.entries(r.byUnit)) units[k] = (units[k] ?? 0) + v;
    console.log(
      `#${i} winner=${r.winner} t=${(r.time / 60).toFixed(1)}m ages=${r.ages.join('/')} kills=${r.kills.join('/')} summoned=${r.summoned.join('/')} ${r.ageTimes.join(' ')}`,
    );
  }
  console.log(`\n${a} vs ${b}: ${wins[0]} - ${wins[1]} (draws ${wins[2]}), avg ${(total / games / 60).toFixed(1)} min, ${(Date.now() - t0) / 1000}s wall`);
  console.log('summons:', Object.entries(units).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}:${v}`).join(' '));
}
