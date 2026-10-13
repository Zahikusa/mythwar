/**
 * Brute-force check of the riddles (src/sim/puzzles.ts): every way of spending the purse — how
 * many of each creature, into which lanes (each lane gets one kind, ordered in one go at the
 * start), and for riddles with a god power, casting it into a lane after 0–16 s — is played out.
 *   node scripts/puzzlecheck.ts [id]       prints the share of answers that win, and the winners
 */
import { AGE_UNITS, LANE_COUNT, TICK } from '../src/sim/data.ts';
import { PUZZLES, puzzleRules, puzzleStatus, puzzleWorld } from '../src/sim/puzzles.ts';
import type { Puzzle } from '../src/sim/puzzles.ts';

export interface Attempt {
  /** Creatures ordered at the start: [lane, creature id]. */
  orders: [number, string][];
  /** Cast the power into this lane after `castAt` seconds. */
  cast?: { lane: number; at: number };
}

export function play(pz: Puzzle, a: Attempt): 'won' | 'lost' {
  const w = puzzleWorld(pz);
  for (const [lane, unitId] of a.orders) w.apply({ type: 'train', team: 0, unitId, lane });
  puzzleRules(w, pz);
  let cast = !a.cast;
  for (let i = 0; i < pz.limit / TICK + 2; i++) {
    if (!cast && w.time >= a.cast!.at) cast = w.apply({ type: 'power', team: 0, lane: a.cast!.lane }).ok || w.time > a.cast!.at + 3;
    w.step();
    w.drainEvents();
    puzzleRules(w, pz);
    const s = puzzleStatus(w, pz);
    if (s) return s;
  }
  return 'lost';
}

/**
 * Every attempt worth trying: any mix of the age's creatures in each lane the foe uses (five at
 * most — the queue's size), within the purse; in each lane Guardians are ordered first, then
 * Hunters, then Mystics (a front line before its support), lanes interleaved. Riddles with a god
 * power are also tried with it cast into each lane at 0–16 s, and without it.
 */
export function attempts(pz: Puzzle): Attempt[] {
  const units = AGE_UNITS[pz.age].filter((u) => u.cls !== 'legend');
  const lanes = [...new Set(pz.foes.map((f) => f[0]))].sort();
  const out: Attempt[] = [];
  const mixes: number[][] = [];
  for (let g = 0; g <= 5; g++) for (let h = 0; g + h <= 5; h++) for (let m = 0; g + h + m <= 5; m++) mixes.push([g, h, m]);
  const rec = (i: number, picked: number[][], n: number, spent: number) => {
    if (i === lanes.length) {
      if (n === 0) return;
      const perLane = picked.map((mix) => mix.flatMap((c, k) => Array.from({ length: c }, () => units[k].id)));
      const orders: [number, string][] = [];
      for (let k = 0; k < 5; k++) perLane.forEach((ids, j) => k < ids.length && orders.push([lanes[j], ids[k]]));
      out.push({ orders });
      return;
    }
    for (const mix of mixes) {
      const c = mix.reduce((s, x, k) => s + x * units[k].cost, 0);
      const cnt = mix[0] + mix[1] + mix[2];
      if (spent + c > pz.gold || n + cnt > 5) continue;
      rec(i + 1, [...picked, mix], n + cnt, spent + c);
    }
  };
  rec(0, [], 0, 0);
  if (!pz.power) return out;
  const withPower: Attempt[] = [...out];
  for (const a of out) for (const lane of lanes) for (const at of [0, 4, 8, 12, 16]) withPower.push({ ...a, cast: { lane, at } });
  return withPower;
}

const describe = (a: Attempt) => {
  const parts: string[] = [];
  for (let l = 0; l < LANE_COUNT; l++) {
    const ids = a.orders.filter(([lane]) => lane === l).map(([, id]) => id);
    const count = new Map<string, number>();
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
    if (ids.length) parts.push(`L${l}: ${[...count].map(([id, c]) => `${c}× ${id}`).join(' + ')}`);
  }
  if (a.cast) parts.push(`power L${a.cast.lane} @${a.cast.at}s`);
  return parts.join(', ');
};

if ((process.argv[1] ?? '').endsWith('puzzlecheck.ts')) {
  const only = process.argv[2];
  for (const pz of PUZZLES.filter((p) => !only || p.id === only)) {
    const all = attempts(pz);
    const wins = all.filter((a) => play(pz, a) === 'won');
    console.log(`${pz.id.padEnd(8)} ${wins.length}/${all.length} answers win (${((wins.length / all.length) * 100).toFixed(1)}%)`);
    for (const a of wins.slice(0, 12)) console.log(`   ${describe(a)}`);
  }
}
