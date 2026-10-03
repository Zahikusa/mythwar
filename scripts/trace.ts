/** Prints a coarse timeline of one AI-vs-AI match. node scripts/trace.ts [seed] [a] [b] */
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import type { Difficulty } from '../src/ai/ai.ts';
import { TICK } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';

const seed = Number(process.argv[2] ?? 1006);
const a = (process.argv[3] ?? 'master') as Difficulty;
const b = (process.argv[4] ?? 'master') as Difficulty;
const w = new World({ seed });
const ais = [new AiController(w, 0, AI_PROFILES[a], seed * 3 + 1), new AiController(w, 1, AI_PROFILES[b], seed * 7 + 5)];
let next = 0;
while (w.winner === null && w.time < 3600) {
  for (const ai of ais) ai.update(TICK);
  w.step();
  w.drainEvents();
  if (w.time >= next) {
    next += 15;
    const lanes = w.lanes.map((l) => {
      const A = l.filter((u) => u.team === 0);
      const B = l.filter((u) => u.team === 1);
      const fa = A.length ? Math.max(...A.map((u) => u.x)) : 0;
      const fb = B.length ? Math.min(...B.map((u) => u.x)) : 1000;
      return `${A.length}v${B.length}[${fa.toFixed(0)}|${fb.toFixed(0)}]`;
    });
    const p = w.players;
    const tur = (i: number) => p[i].turrets.map((t) => (t.def ? t.def.kind[0] : '-')).join('');
    console.log(
      `${(w.time / 60).toFixed(2)}m  A hp ${p[0].baseHp.toFixed(0)} g ${p[0].gold.toFixed(0)} xp ${p[0].xp.toFixed(0)} age ${p[0].age} t ${tur(0)} | B hp ${p[1].baseHp.toFixed(0)} g ${p[1].gold.toFixed(0)} xp ${p[1].xp.toFixed(0)} age ${p[1].age} t ${tur(1)} | ${lanes.join(' ')} shr ${w.shrines.map((s) => s.owner).join(',')}`,
    );
  }
}
console.log('winner', w.winner, (w.time / 60).toFixed(1));
