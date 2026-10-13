import type { Difficulty } from '../ai/ai.ts';

/**
 * When a general speaks: at their own deeds, and at the player's (`foe…`: the player ascends,
 * strikes them with a god power, takes a shrine back from them). `meet` opens a battle against a
 * general not beaten yet: who they are to the others (Lens #79, the character web).
 * `ragnarok` (once, as the end of the world begins) shows what each one is at odds with inside
 * (Lens #82, inner contradiction); `nemesis` is said when the player first fields the creature a
 * general dreads (only Odin has one: Fenrir, fated to swallow him at Ragnarök).
 */
export type TauntEvent = 'start' | 'meet' | 'ageUp' | 'power' | 'shrine' | 'foeAge' | 'foePower' | 'foeShrine' | 'ragnarok' | 'nemesis' | 'losing' | 'winning' | 'won' | 'lost';

export interface Persona {
  /** The general's name ("Puck"). */
  name: string;
  /** "Puck, the Wandering Spirit". */
  title: string;
  lines: Record<TauntEvent, string[]>;
  /** Lines that address the player by name ({name}), used alternately when a name is set. */
  named: Partial<Record<TauntEvent, string[]>>;
  /** The creature this general dreads (its `nemesis` lines are said when the player fields it). */
  nemesis?: string;
}

/**
 * Each AI difficulty is a general out of myth with a voice of its own: a playful fae trickster, a
 * proud Amazon queen, the far-seeing All-Father, the god of war himself. Their lines appear in a
 * speech bubble by their side of the field (the "Opponent's quick messages" setting silences them).
 *
 * Each stands somewhere else on the interpersonal circumplex (Lens #78: friendly ↔ hostile,
 * dominant ↔ submissive), and it shows most in how they take the player's blows: Puck is
 * friendly and yielding (admires, whimpers), Hippolyta friendly and dominant (respects, then
 * commands), Odin cold and dominant (aloof, unimpressed), Ares hostile and dominant (threatens).
 */
export const PERSONAS: Record<Difficulty, Persona> = {
  novice: {
    name: 'Puck',
    title: 'Puck, the Wandering Spirit',
    lines: {
      start: ['Oh, a game! I love games.', 'Shall we play at war?'],
      meet: ['Oberon says I may play with you! He never lets me play.', 'The fairy king is watching. Let’s give him a show!'],
      ageUp: ['Look, I can do it too!', 'Ooh, shiny new friends!'],
      power: ['Whee! Brambles for everyone!', 'Hee hee — surprise!'],
      shrine: ['Finders keepers!', 'Mine now, mine now!'],
      foeAge: ['Ooh! Can I play with those?', 'Pretty! Are they friendly?'],
      foePower: ['Ow! Ow ow ow!', 'Hey! That tickled… a lot.'],
      foeShrine: ['Aww, I was playing with that!', 'Okay, okay — you can have it.'],
      // The trickster who loves games — until the game is real.
      ragnarok: ['I don’t like this game any more. Can we stop now?'],
      nemesis: [],
      losing: ['This isn’t fun any more…', 'Wait, wait — no fair!'],
      winning: ['Am I… winning?', 'Ha! Too easy!'],
      won: ['I won? I won!'],
      lost: ['Fine. Best of three?'],
    },
    named: { start: ['Oh, {name}! A game! I love games.'], won: ['I beat {name}! I beat {name}!'], lost: ['Fine, {name}. Best of three?'] },
  },
  adept: {
    name: 'Hippolyta',
    title: 'Hippolyta, Queen of the Amazons',
    lines: {
      start: ['Draw your line, then. I will cross it.', 'Show me what your gods are worth.'],
      meet: ['Puck says you play rough. Good.', 'My father Ares gave me this girdle. You will not take it.'],
      ageUp: ['My warband grows.', 'New blades for an old queen.'],
      power: ['Feel the favour of the gods!', 'Break, and run!'],
      shrine: ['This ground is mine.', 'Hold it, sisters!'],
      foeAge: ['Good. Now it is a fight.', 'Stronger allies. I approve.'],
      foePower: ['A fine blow. Mine will be finer.', 'Your gods answer you. Well struck.'],
      foeShrine: ['Well taken. I will take it back.', 'Hold it, if you can.'],
      // The warrior queen who would have made peace: she meant to give Heracles her girdle.
      ragnarok: ['I would have given Heracles my girdle freely. Someone always makes it a war.'],
      nemesis: [],
      losing: ['You fight well. Too well.', 'I have bled before.'],
      winning: ['Kneel, and it ends.', 'Your walls are paper.'],
      won: ['A worthy hunt.'],
      lost: ['I yield. This once.'],
    },
    named: { start: ['So you are {name}. Draw your line.'], won: ['Rise, {name}. Train harder.'], lost: ['Well fought, {name}. My sisters will know your name.'] },
  },
  master: {
    name: 'Odin',
    title: 'Odin, the All-Father',
    lines: {
      start: ['I gave an eye for wisdom. What will you give?', 'My ravens have watched you.'],
      meet: ['Mímir counsels you, I hear. My old friend has chosen a side.', 'I gave Mímir an eye for one drink from his well. What did he ask of you?'],
      ageUp: ['The ravens bring me new allies.', 'Another saga begins.'],
      power: ['Huginn saw this coming.', 'As the runes foretold.'],
      shrine: ['Every crossing is watched.', 'The ley lines answer me.'],
      foeAge: ['You climb. I watch.', 'A new age. I have seen nine worlds.'],
      foePower: ['I foresaw that blow.', 'Is that the best your gods can do?'],
      foeShrine: ['Keep it a while. It changes nothing.', 'The ravens saw you take it.'],
      // The all-knowing god who gave an eye to know his own doom — and cannot unknow it.
      ragnarok: ['I gave an eye to learn how this ends. Some days I wish I had kept it.'],
      nemesis: ['The wolf. It was always going to be the wolf.', 'Fenrir… not yet. Not today.'],
      losing: ['The Norns did not tell me this.', 'Hm. A thread I did not see.'],
      winning: ['As foreseen.', 'Your end is already woven.'],
      won: ['It was always going to end so.'],
      lost: ['Well played. The skalds will sing of you.'],
    },
    nemesis: 'fenrir',
    named: { start: ['I have seen you in the well, {name}.'], won: ['Your thread is long yet, {name}. Come back.'], lost: ['The skalds will sing of {name}.'] },
  },
  mythic: {
    name: 'Ares',
    title: 'Ares, God of War',
    lines: {
      start: ['War. At last.', 'I have waited for you.'],
      meet: ['So you are the one my daughter speaks of.', 'Odin watches. Mímir whispers. I simply kill.'],
      ageUp: ['More. Bring me more.', 'Rise, my legions!'],
      power: ['Burn!', 'Feel war itself!'],
      shrine: ['Bleed for it.', 'Take it back — if you can.'],
      foeAge: ['New toys. I will break them.', 'Bring them. All of them.'],
      foePower: ['You will pay for that.', 'You dare strike ME?'],
      foeShrine: ['Thief! I will have it back in blood.', 'Enjoy it. Briefly.'],
      // War itself, hated by the father whose love he fights for.
      ragnarok: ['My own father calls me the most hateful of the gods. Then let him watch.'],
      nemesis: [],
      losing: ['Impossible. I AM war.', 'You dare?'],
      winning: ['Crawl back to your wood.', 'Is that all?'],
      won: ['Victory is mine. As always.'],
      lost: ['…This is not over.'],
    },
    named: { start: ['{name}. Another mortal for the pyre.'], won: ['Kneel, {name}.'], lost: ['Who ARE you, {name}?'] },
  },
};

/** A line for this moment (rotating through the general's lines, so repeats are spaced). */
export function tauntLine(d: Difficulty, event: TauntEvent, n: number, name = ''): string {
  // With a name, the general speaks to the player in person every other time (Lens #64).
  const named = PERSONAS[d].named[event];
  if (name && named && n % 2 === 0) return named[(n >> 1) % named.length].replace(/\{name\}/g, name);
  const lines = PERSONAS[d].lines[event];
  return lines.length ? lines[n % lines.length] : '';
}

/**
 * The hero's journey (Lens #68): the four generals are the chapters of one war — the call, the
 * threshold, the ordeal, the return. A chapter is told when its general is faced for the first
 * time (until beaten), and named on the foe screen.
 */
export const JOURNEY: Record<Difficulty, { chapter: string; text: string; close: string }> = {
  novice: { chapter: 'I · The Call', text: 'A wandering spirit has claimed the old crossing, and the ley lines answer whoever holds it. Someone must go. You go.', close: 'The spirit flits away, laughing. The crossing is quiet — for now.' },
  adept: { chapter: 'II · The Threshold', text: 'Word of your victory has reached the Amazons. Their queen does not believe it. Cross into her lands and prove it.', close: 'The queen lowers her spear. Her sisters will speak your name.' },
  master: { chapter: 'III · The Ordeal', text: 'The All-Father once gave an eye to drink from Mímir’s well — and now Mímir counsels you against him. His ravens know how you fight. Fight better.', close: 'The ravens fly home with news the All-Father did not foresee.' },
  mythic: { chapter: 'IV · The Return', text: 'Only the god of war — Hippolyta’s father — stands between you and the end of this war. Win, and the crossing is yours for good.', close: 'Ares falls silent. The war is over and the crossing is yours. The skalds have their song.' },
};
