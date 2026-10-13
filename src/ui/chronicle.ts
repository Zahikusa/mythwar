/**
 * The chronicle (Lens #65): a battle told as a handful of dated moments — first blood, every
 * ascension, Ley Surges won, the Elder Dragon, a citadel brought low, Ragnarök, the end — kept
 * from the simulation's events and shown on the results (and in the copied result). Every
 * battle writes a different little story; the player retells it.
 */
import { AGES, UNITS } from '../sim/data.ts';
import type { SimEvent, Team } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { fmtTime } from './dom.ts';
import { HeroNames } from './heroes.ts';
import { VETERAN_KILLS } from '../sim/data.ts';

const LANES = ['top', 'middle', 'bottom'];

export interface Moment {
  t: number;
  text: string;
  /** Kept when the story is cut short (lower = dropped first). */
  weight: number;
}

export class Chronicle {
  private readonly me: Team;
  private readonly foe: string;
  readonly moments: Moment[] = [];
  private firstBlood = false;
  private low: [boolean, boolean] = [false, false];
  private veteran: [boolean, boolean] = [false, false];
  /** The player's creature with the most kills so far (Lens #88: the hero of the battle). */
  private hero: { defId: string; id: number; kills: number } | null = null;
  private readonly names = new HeroNames();

  /** `foe`: the opponent's name as the story calls them ("Hippolyta", "Ada"). */
  constructor(me: Team, foe: string) {
    this.me = me;
    this.foe = foe;
  }

  private who(team: Team): string {
    return team === this.me ? 'You' : this.foe;
  }

  private add(t: number, text: string, weight: number): void {
    this.moments.push({ t, text, weight });
  }

  onEvents(events: SimEvent[], world: World): void {
    const t = world.time;
    for (const e of events) {
      if (e.type === 'death' && !this.firstBlood) {
        this.firstBlood = true;
        const name = UNITS[e.defId]?.name ?? 'a creature';
        this.add(t, e.team === this.me ? `First blood to ${this.foe}: your ${name} falls in the ${LANES[e.lane]} lane.` : `First blood: the enemy's ${name} falls in the ${LANES[e.lane]} lane.`, 4);
      } else if (e.type === 'ageUp') {
        this.add(t, `${this.who(e.team)} ${e.team === this.me ? 'ascend' : 'ascends'} to ${AGES[e.age].id === 'jade' ? 'the ' : ''}${AGES[e.age].name}.`, e.team === this.me ? 3 : 2);
      } else if (e.type === 'surge' && e.phase === 'end') {
        const mine = Math.round(e.gained[this.me]);
        const theirs = Math.round(e.gained[this.me === 0 ? 1 : 0]);
        if (mine > 0 || theirs > 0) this.add(t, mine >= theirs ? `You draw ${mine} gold from a Ley Surge at the ${LANES[e.lane]} shrine.` : `${this.foe} draws ${theirs} gold from a Ley Surge at the ${LANES[e.lane]} shrine.`, 1);
      } else if (e.type === 'spawn' && e.defId === 'dragon') {
        this.add(t, e.team === this.me ? `Your Elder Dragon takes wing in the ${LANES[e.lane]} lane.` : `${this.foe}'s Elder Dragon takes wing in the ${LANES[e.lane]} lane.`, 3);
      } else if (e.type === 'death' && e.defId === 'dragon') {
        this.add(t, e.team === this.me ? 'Your Elder Dragon is brought down.' : `${this.foe}'s Elder Dragon is brought down.`, 3);
      } else if (e.type === 'veteran') {
        // Every veteran gets its name (the renderer gives the same ones, in the same order); each
        // side's first is told (Lens #81).
        const called = this.names.rise(e.team, e.defId, e.unitId);
        if (this.veteran[e.team]) continue;
        this.veteran[e.team] = true;
        const name = UNITS[e.defId]?.name ?? 'creature';
        this.add(t, e.team === this.me ? `Your ${name}${called ? `, ${called},` : ''} rises a veteran in the ${LANES[e.lane]} lane.` : `${this.foe}'s ${name} rises a veteran in the ${LANES[e.lane]} lane.`, e.team === this.me ? 2 : 1);
      } else if (e.type === 'ragnarok') {
        this.add(t, 'Ragnarök: the wards fall silent.', 2);
      } else if (e.type === 'gameOver') {
        const h = this.hero;
        // (Only one that rose a veteran — and so has its name — is the hero.)
        if (h && h.kills >= VETERAN_KILLS && this.names.has(h.id)) this.add(t, `Hero of the battle: ${this.names.name(h.defId, h.id)}, your ${UNITS[h.defId]?.name ?? 'creature'} — ${h.kills} foes felled.`, 5);
        this.add(t, e.winner === this.me ? `Victory: ${this.foe}'s citadel falls.` : `Defeat: your citadel falls to ${this.foe}.`, 9);
      }
    }
    // Kills change only when something dies: then look for a new hero among your creatures.
    if (events.some((e) => e.type === 'death')) {
      for (const lane of world.lanes) {
        for (const u of lane) {
          if (u.alive && u.team === this.me && u.kills > (this.hero?.kills ?? 0)) this.hero = { defId: u.def.id, id: u.id, kills: u.kills };
        }
      }
    }
    // A citadel brought below a quarter — the turning point of many battles (once per side).
    for (const team of [0, 1] as Team[]) {
      const p = world.players[team];
      if (!this.low[team] && p.baseHp > 0 && p.baseHp < p.baseMaxHp * 0.25) {
        this.low[team] = true;
        this.add(t, team === this.me ? 'Your citadel is brought below a quarter of its strength.' : `${this.foe}'s citadel is brought below a quarter of its strength.`, 3);
      }
    }
  }

  /** The story as dated lines, at most `max` (the least important moments go first). */
  lines(max = 10): string[] {
    let kept = this.moments.slice();
    while (kept.length > max) {
      // Drop the lowest-weight moment, the latest of equals (early surges set the scene).
      let drop = 0;
      for (let i = 1; i < kept.length; i++) if (kept[i].weight < kept[drop].weight || (kept[i].weight === kept[drop].weight && kept[i].t >= kept[drop].t)) drop = i;
      kept = kept.filter((_, i) => i !== drop);
    }
    return kept.map((m) => `${fmtTime(m.t)} — ${m.text}`);
  }
}
