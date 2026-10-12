/**
 * The design's success criteria (DESIGN.md, "Problem statement"), measured headlessly.
 *   node scripts/designcheck.ts [games=30]      (npm run designcheck)
 * Each criterion prints PASS/FAIL with the measured value; exit code 1 if any fails.
 * Uses the scripted "smart" player from scripts/bots.ts as a stand-in for a competent human,
 * and AI-vs-AI battles for pacing and variety. Takes about a minute and a half at 30 games.
 */
import { botMatch } from './bots.ts';
import { playMatch } from './sim.ts';
import { DIFFICULTIES } from '../src/ai/ai.ts';
import { AGE_UNITS } from '../src/sim/data.ts';

const games = Number(process.argv[2] ?? 30);
let failed = 0;
function check(name: string, ok: boolean, value: string): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${value}`);
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const t0 = Date.now();

// 1. A ladder of challenge: a competent player beats Novice almost always, Mythic rarely, and
//    every step up is harder than the last.
const rates = DIFFICULTIES.map((d) => {
  let w = 0;
  for (let i = 0; i < games; i++) if (botMatch('smart', d, 1000 + i * 7).winner === 0) w++;
  return w / games;
});
check('Novice is beatable (competent player wins ≥ 85%)', rates[0] >= 0.85, pct(rates[0]));
check('Mythic is a real challenge (competent player wins ≤ 20%)', rates[3] <= 0.2, pct(rates[3]));
check('each difficulty is harder than the one before', rates.every((r, i) => i === 0 || r <= rates[i - 1] + 0.05), DIFFICULTIES.map((d, i) => `${d} ${pct(rates[i])}`).join(', '));

// 2. Pacing: evenly matched battles last long enough to climb the ages, short enough for a
//    session on the sofa.
const n = Math.max(10, Math.round(games / 2));
const matches = Array.from({ length: n }, (_, i) => playMatch('master', 'master', 2000 + i));
const mins = matches.map((m) => m.time / 60).sort((a, b) => a - b);
const median = mins[Math.floor(mins.length / 2)];
check('even battles take 8–20 minutes (median)', median >= 8 && median <= 20, `${median.toFixed(1)} min (range ${mins[0].toFixed(1)}–${mins[mins.length - 1].toFixed(1)})`);
const finalAge = matches.filter((m) => Math.max(...m.ages) >= 3).length / n;
check('most even battles reach the Jade Empire or later', finalAge >= 0.6, pct(finalAge));

// 3. Variety: every class gets summoned in every age (no creature is a trap) and no single
//    creature dominates its age.
const usage: Record<string, number> = {};
for (const m of matches) for (const [k, v] of Object.entries(m.byUnit)) usage[k] = (usage[k] ?? 0) + v;
const shares: string[] = [];
let varied = true;
for (const age of AGE_UNITS) {
  const total = age.reduce((s, u) => s + (usage[u.id] ?? 0), 0);
  if (total === 0) continue;
  for (const u of age) {
    const share = (usage[u.id] ?? 0) / total;
    if (u.cls !== 'legend' && (share < 0.12 || share > 0.6)) varied = false;
  }
  shares.push(age.map((u) => `${u.id} ${pct((usage[u.id] ?? 0) / total)}`).join(' '));
}
check('every class is used in every age (12–60% of that age’s summons)', varied, shares.join(' | '));

// 4. Fairness: neither side of the field is favoured.
const sideWins = matches.filter((m) => m.winner === 0).length / n;
check('even AI battles: left side wins 30–70%', sideWins >= 0.3 && sideWins <= 0.7, pct(sideWins));

console.log(`\n${failed ? `${failed} criteria failed` : 'All design criteria met'} (${games} games per difficulty, ${n} even battles, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(failed ? 1 : 0);
