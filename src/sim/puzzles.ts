/**
 * Riddles of war (Lens #52): small hand-made battles with one clear question each. A fixed purse
 * (no income, kills pay nothing), no gate wards, the foe's creatures already on the field — and
 * one goal: clear the field before any of them reaches your citadel. Every riddle is checked by
 * brute force (`scripts/puzzlecheck.ts`, tests/puzzles.test.ts): its answer wins, and most
 * other ways of spending the purse don't.
 */
import { AGE_UNITS, AGES, LANE_COUNT, UNITS } from './data.ts';
import { World } from './world.ts';

export interface Puzzle {
  id: string;
  name: string;
  /** The question, as the player reads it before starting. */
  brief: string;
  /** Shown after a failed attempt. */
  hint: string;
  age: number;
  gold: number;
  /** The god power may be cast (once — it won't recharge in time). */
  power: boolean;
  /** Seconds to clear the field. */
  limit: number;
  /** The foe's creatures: [lane, creature id, x on the lane (0 = your gate, 1000 = theirs)]. */
  foes: [number, string, number][];
}

const row = (lane: number, id: string, n: number, x: number, gap = 26): [number, string, number][] =>
  Array.from({ length: n }, (_, i) => [lane, id, x + i * gap] as [number, string, number]);

export const PUZZLES: Puzzle[] = [
  {
    id: 'pack',
    name: 'The Redcap Pack',
    brief: 'A pack of Redcap Raiders charges down the middle lane. You have 120 gold. Stop them all.',
    hint: 'Hunters run in packs and tear through Mystics — but Guardians beat Hunters.',
    age: 0,
    gold: 120,
    power: false,
    limit: 90,
    foes: row(1, 'redcap', 6, 640, 14),
  },
  {
    id: 'labyrinth',
    name: 'The Labyrinth’s Guard',
    brief: 'Minotaurs march down the middle lane, Gorgons behind them. You have 260 gold.',
    hint: 'Orbs beat shields: Gorgons break a Minotaur line — and they can trade gazes with the Gorgons behind it.',
    age: 1,
    gold: 260,
    power: false,
    limit: 90,
    foes: [...row(1, 'minotaur', 2, 620, 36), ...row(1, 'gorgon', 2, 720, 30)],
  },
  {
    id: 'wall',
    name: 'The Giants’ Wall',
    brief: 'Frost Jötnar stride down the bottom lane, wolves at their heels. 500 gold to break them.',
    hint: 'Valkyries break a line of giants — but they need a Guardian in front to keep the wolves off them.',
    age: 2,
    gold: 500,
    power: false,
    limit: 100,
    foes: [...row(2, 'jotunn', 3, 640, 40), ...row(2, 'fenrir', 2, 760, 20)],
  },
  {
    id: 'winter',
    name: 'Fimbulwinter',
    brief: 'A warband too strong for your purse marches down the top lane. You have 500 gold — and your god power, once.',
    hint: 'Frozen foes are brittle and take half again as much damage. Freeze them when they meet your creatures, not before.',
    age: 2,
    gold: 500,
    power: true,
    limit: 100,
    foes: [...row(0, 'fenrir', 5, 620, 18), ...row(0, 'valkyrie', 3, 740, 30)],
  },
  {
    id: 'tigers',
    name: 'The White Tigers',
    brief: 'A pack of Byakko Tigers runs down the bottom lane, a Kitsune behind it. You have 900 gold.',
    hint: 'Shields beat fangs: Oni Brutes break a tiger pack — two of them, and something more to reach the fox.',
    age: 3,
    gold: 900,
    power: false,
    limit: 100,
    foes: [...row(2, 'byakko', 4, 640, 14), ...row(2, 'kitsune', 1, 760, 24)],
  },
  {
    id: 'skystone',
    name: 'Sky and Stone',
    brief: 'Griffins swoop down the top lane while Titans march along the bottom. 1,400 gold — and Starfall, once.',
    hint: 'Orbs beat shields: Phoenixes for the Titans. And a god power can hold a whole lane by itself.',
    age: 4,
    gold: 1400,
    power: true,
    limit: 100,
    foes: [...row(0, 'griffin', 3, 660, 16), ...row(2, 'titan', 2, 640, 44)],
  },
];

export function puzzleById(id: string): Puzzle | undefined {
  return PUZZLES.find((p) => p.id === id);
}

/** The riddle's opening position. */
export function puzzleWorld(pz: Puzzle): World {
  // (No Walls: no turrets; Godless: no power — the HUD shows it locked.)
  const w = new World({ seed: 7, trials: [pz.power ? ['nowalls'] : ['nowalls', 'godless'], ['nowalls', 'godless']] });
  for (const p of w.players) {
    p.age = pz.age;
    p.baseMaxHp = p.baseHp = AGES[pz.age].baseHp;
    p.gold = 0;
    p.xp = 0;
    p.powerCooldown = 0;
    // No income at all (the HUD shows +0/s): the purse is all there is.
    p.incomeMult = 0;
  }
  w.players[0].gold = pz.gold;
  // No Ley Surges either: nothing but the question.
  w.nextSurgeAt = 1e9;
  for (const [lane, id, x] of pz.foes) w.spawnUnit(1, lane, UNITS[id], x);
  return w;
}

/** The riddle's rules, applied after every step: a fixed purse, no wards, one cast of the power. */
export function puzzleRules(w: World, pz: Puzzle): void {
  const [me, foe] = w.players;
  me.gold = Math.max(0, pz.gold - me.stats.goldSpent);
  foe.gold = 0;
  me.xp = foe.xp = 0;
  // One cast only: then the gods fall silent.
  if (me.stats.powersCast > 0 && !me.trials.includes('godless')) me.trials.push('godless');
  for (const p of w.players) for (let l = 0; l < LANE_COUNT; l++) p.wardCooldown[l] = 1e9;
}

/** 'won' once the field is clear, 'lost' when a foe reached the citadel, time ran out or nothing is left to try. */
export function puzzleStatus(w: World, pz: Puzzle): 'won' | 'lost' | null {
  const me = w.players[0];
  let foes = 0;
  let mine = 0;
  for (const lane of w.lanes) for (const u of lane) if (u.alive) u.team === 1 ? foes++ : mine++;
  if (foes === 0) return 'won';
  if (me.baseHp < me.baseMaxHp || w.time >= pz.limit) return 'lost';
  const cheapest = Math.min(...AGE_UNITS[pz.age].map((u) => u.cost));
  const canCast = pz.power && me.stats.powersCast === 0;
  if (mine === 0 && me.queue.length === 0 && me.gold < cheapest && !canCast && w.powers.length === 0) return 'lost';
  return null;
}
