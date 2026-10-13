import { DIFFICULTIES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import { BLESSING_MAX_RANK, MAX_AGE } from '../sim/data.ts';
import type { SimEvent, Team } from '../sim/types.ts';
import type { World } from '../sim/world.ts';

/** A feat: a deed worth being proud of, earned once and kept (Settings.feats). */
export interface Feat {
  id: string;
  name: string;
  desc: string;
}

export const FEATS: Feat[] = [
  { id: 'first', name: 'First Victory', desc: 'Win a battle.' },
  { id: 'novice', name: 'Spirit Banished', desc: 'Defeat the Novice.' },
  { id: 'adept', name: 'Warlord Humbled', desc: 'Defeat the Adept.' },
  { id: 'master', name: 'General Outwitted', desc: 'Defeat the Master.' },
  { id: 'mythic', name: 'Godslayer', desc: 'Defeat the Mythic god of war.' },
  { id: 'online', name: 'Worthy Rival', desc: 'Win a battle against another player.' },
  { id: 'coop', name: 'Shoulder to Shoulder', desc: 'Win a co-op battle together with a friend.' },
  { id: 'celestial', name: 'Among the Gods', desc: 'Ascend to the Celestial age.' },
  { id: 'dragon', name: 'Wyrmcaller', desc: 'Summon the Elder Dragon.' },
  { id: 'annihilation', name: 'Annihilation', desc: 'Fell nine foes in one lane within a few seconds.' },
  { id: 'shrines', name: 'Ley Lord', desc: 'Hold all three Ley Shrines at once.' },
  { id: 'surges', name: 'Surge Rider', desc: 'Draw gold from three Ley Surges in one battle.' },
  { id: 'blessed', name: 'Favoured', desc: 'Raise a blessing to its fifth rank.' },
  { id: 'swift', name: 'Swift Conquest', desc: 'Defeat the Adept or harder in under 8 minutes.' },
  { id: 'unbreached', name: 'Unbreached', desc: 'Defeat the Adept or harder with your citadel above 75% health.' },
  { id: 'comeback', name: 'Back from the Brink', desc: 'Win after your citadel fell below 15% health.' },
  { id: 'trials', name: 'Trial by Fire', desc: 'Defeat the Adept or harder under all three trials.' },
  { id: 'legend', name: 'Legend of the Ages', desc: 'Earn all three stars against every general.' },
];

/**
 * The top of the pyramid (Lens #51): one rare goal every battle against the AI builds toward —
 * three stars from Puck, Hippolyta, Odin and Ares alike.
 */
export const PINNACLE = 'legend';
export const MAX_STARS = DIFFICULTIES.length * 3;

/** Best stars earned against all generals together (0–12). */
export function starTotal(records: Partial<Record<Difficulty, { stars?: number }>>): number {
  return DIFFICULTIES.reduce((n, d) => n + Math.min(3, records[d]?.stars ?? 0), 0);
}

/**
 * The player's standing among players (index into RANKS, Lens #80): the highest general beaten
 * (0 = none yet, 1 = Puck … 4 = Ares), or 5 once Legend of the Ages is earned.
 */
export function playerRank(records: Partial<Record<Difficulty, { wins?: number }>>, feats: string[]): number {
  if (feats.includes(PINNACLE)) return DIFFICULTIES.length + 1;
  let rank = 0;
  DIFFICULTIES.forEach((d, i) => {
    if (records[d]?.wins) rank = i + 1;
  });
  return rank;
}

/**
 * Watches one battle for feats. `unlock` is called once per newly earned feat (already-earned
 * ones are skipped). Not for attract mode or the sandbox.
 */
export class FeatTracker {
  private readonly have: Set<string>;
  private readonly unlock: (f: Feat) => void;
  private me: Team = 0;
  private kills: number[][] = [[], [], []];
  private surgesDrawn = 0;
  private lowest = 1;
  /** Feats earned in the current battle (for the results screen). */
  earned: Feat[] = [];

  constructor(have: string[], unlock: (f: Feat) => void) {
    this.have = new Set(have);
    this.unlock = unlock;
  }

  start(world: World, me: Team): void {
    this.me = me;
    this.kills = [[], [], []];
    this.surgesDrawn = 0;
    this.lowest = world.players[me].baseHp / world.players[me].baseMaxHp;
    this.earned = [];
  }

  /** Grants a feat earned outside the battle's events (the pinnacle, after the records update). */
  award(id: string): void {
    this.give(id);
  }

  private give(id: string): void {
    if (this.have.has(id)) return;
    const f = FEATS.find((x) => x.id === id);
    if (!f) return;
    this.have.add(id);
    this.earned.push(f);
    this.unlock(f);
  }

  onEvents(events: SimEvent[], world: World): void {
    const me = this.me;
    const p = world.players[me];
    for (const e of events) {
      if (e.type === 'ageUp' && e.team === me && e.age === MAX_AGE) this.give('celestial');
      else if (e.type === 'spawn' && e.team === me && e.defId === 'dragon') this.give('dragon');
      else if (e.type === 'death' && e.team !== me) {
        const list = this.kills[e.lane];
        list.push(world.time);
        while (list.length && world.time - list[0] > 2.5) list.shift();
        if (list.length >= 9) this.give('annihilation');
      } else if (e.type === 'shrine' && e.owner === me && world.shrines.every((s) => s.owner === me)) this.give('shrines');
      else if (e.type === 'surge' && e.phase === 'end' && e.gained[me] >= 1 && ++this.surgesDrawn >= 3) this.give('surges');
      else if (e.type === 'blessing' && e.team === me && e.rank >= BLESSING_MAX_RANK) this.give('blessed');
    }
    this.lowest = Math.min(this.lowest, p.baseHp / p.baseMaxHp);
  }

  /** The battle is over: victory feats. `difficulty` is null online; `coop`: allies vs the AI. */
  onEnd(world: World, difficulty: Difficulty | null, coop = false): void {
    const me = this.me;
    if (world.winner !== me) return;
    const p = world.players[me];
    this.give('first');
    if (difficulty) this.give(difficulty);
    else this.give(coop ? 'coop' : 'online');
    const hard = difficulty !== null && difficulty !== 'novice';
    if (hard && world.time < 8 * 60) this.give('swift');
    if (hard && p.baseHp / p.baseMaxHp > 0.75) this.give('unbreached');
    if (this.lowest < 0.15) this.give('comeback');
    if (hard && p.trials.length >= 3) this.give('trials');
  }
}
