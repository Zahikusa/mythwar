import { botMatch } from './bots.ts';
import type { BotKind } from './bots.ts';
import type { Difficulty } from '../src/ai/ai.ts';
const bot = (process.argv[2] ?? 'spam') as BotKind;
const ai = (process.argv[3] ?? 'novice') as Difficulty;
const n = Number(process.argv[4] ?? 30);
let w = 0;
let t = 0;
for (let i = 0; i < n; i++) {
  const r = botMatch(bot, ai, 1000 + i * 7);
  if (r.winner === 0) w++;
  t += r.time;
}
console.log(`${bot} vs ${ai}: bot wins ${w}/${n}, avg ${(t / n / 60).toFixed(1)}m`);
