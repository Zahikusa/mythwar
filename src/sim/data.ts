/**
 * Static game data: creatures, turrets, god powers and ages.
 * All balance numbers live here. Stats are authored as an age-1 class template
 * multiplied by per-age power/cost scales, plus per-creature tweaks.
 */

export type UnitClass = 'guardian' | 'hunter' | 'mystic' | 'legend';
export const CLASS_ORDER: readonly UnitClass[] = ['guardian', 'hunter', 'mystic'];

/** Who each class beats. Guardian > Hunter > Mystic > Guardian. */
export const COUNTERS: Record<UnitClass, UnitClass | null> = {
  guardian: 'hunter',
  hunter: 'mystic',
  mystic: 'guardian',
  legend: null,
};

export const COUNTER_BONUS = 1.5;
export const COUNTER_PENALTY = 0.75;

export function counterMultiplier(attacker: UnitClass | null, defender: UnitClass): number {
  if (!attacker) return 1;
  if (COUNTERS[attacker] === defender) return COUNTER_BONUS;
  if (COUNTERS[defender] === attacker) return COUNTER_PENALTY;
  return 1;
}

/** The class that beats `cls`. */
export function counterOf(cls: UnitClass): UnitClass | null {
  for (const c of CLASS_ORDER) if (COUNTERS[c] === cls) return c;
  return null;
}

export type Trait =
  | { kind: 'regen'; perSec: number } // fraction of max hp per second
  | { kind: 'charge'; mult: number; after: number } // first hit after moving `after`s deals mult×
  | { kind: 'slow'; factor: number; duration: number } // on-hit slow (move + attack speed)
  | { kind: 'cleave'; targets: number; falloff: number } // melee hits extra adjacent enemies
  | { kind: 'lifesteal'; frac: number }
  | { kind: 'flying' } // not blocked by allies, does not block allies
  | { kind: 'enrage'; below: number; attackSpeed: number }
  | { kind: 'bounce'; count: number; falloff: number; range: number }
  | { kind: 'slam'; radius: number; falloff: number } // melee splash around target
  | { kind: 'rebirth'; hpFrac: number } // revive once
  | { kind: 'splash'; radius: number }; // projectile splash

export type TraitKind = Trait['kind'];

export type ProjectileKind =
  | 'spark'
  | 'gaze'
  | 'spear'
  | 'foxfire'
  | 'flame'
  | 'dragonfire'
  | 'thorn'
  | 'spore'
  | 'bolt'
  | 'firepot'
  | 'rune'
  | 'iceboulder'
  | 'arrow'
  | 'rocket'
  | 'sunbeam'
  | 'starorb'
  | 'ward';

export interface ProjectileSpec {
  kind: ProjectileKind;
  speed: number; // world units / second
  arc: number; // parabola height in world units (0 = straight)
}

export interface UnitDef {
  id: string;
  name: string;
  age: number;
  cls: UnitClass;
  cost: number;
  hp: number;
  damage: number;
  cooldown: number; // seconds between attacks
  windup: number; // seconds from attack start to impact / release
  range: number; // edge-to-edge distance
  speed: number; // world units / second
  trainTime: number;
  radius: number; // half body width along the lane
  projectile?: ProjectileSpec;
  traits: Trait[];
  maxAlive?: number;
  blurb: string;
  traitText?: string;
}

export interface TurretDef {
  id: string;
  name: string;
  age: number;
  kind: 'bolt' | 'blast';
  cost: number;
  damage: number;
  cooldown: number;
  range: number;
  splash: number;
  slow?: { factor: number; duration: number };
  projectile: ProjectileSpec;
  blurb: string;
}

export type PowerKind = 'briar' | 'zeus' | 'fimbul' | 'spiritdragon' | 'starfall';

export interface PowerDef {
  id: PowerKind;
  name: string;
  age: number;
  cooldown: number;
  damage: number;
  blurb: string;
}

export interface AgeDef {
  index: number;
  id: string;
  name: string;
  subtitle: string;
  /** One line of the war's story, told when a side reaches this age. */
  lore: string;
  units: string[]; // unit ids available in this age (card order)
  turrets: string[]; // [bolt, blast]
  power: PowerKind;
  xpRequired: number; // total XP needed to ascend INTO this age
  ascendCost: number; // gold tithe to ascend INTO this age
  baseHp: number;
  income: number; // passive gold / second
  shrineIncome: number; // extra gold / second per held shrine
}

// ---------------------------------------------------------------------------
// World constants
// ---------------------------------------------------------------------------

export const LANE_COUNT = 3;
export const LANE_LENGTH = 1000;
export const SHRINE_X = LANE_LENGTH / 2;
export const SHRINE_RADIUS = 80;
export const SHRINE_CAPTURE_TIME = 4;
/** A lane told to hold the line: its creatures advance no further than this far past the shrine. */
export const HOLD_PAST_SHRINE = 25; // seconds from neutral to owned with uncontested presence
export const QUEUE_MAX = 5;
export const START_GOLD = 150;
export const START_POWER_COOLDOWN = 25;
export const PASSIVE_XP = 1.5; // xp / second
export const KILL_GOLD_MULT = 0.75;
export const KILL_XP_MULT = 1.0;
export const BASE_DAMAGE_XP = 0.15; // xp per point of base damage, divided by attacker age power scale
export const SELL_REFUND = 0.5;
/** Frozen creatures are brittle: every blow against them (creature, turret, ward, power) deals this much more. */
export const BRITTLE_MULT = 1.5;
export const TICK = 1 / 60;

/**
 * Ragnarök — the late-game finisher. It begins at RAGNAROK_TIME, or RAGNAROK_AFTER_FINAL seconds
 * after both sides reached the final age (whichever is first). From then on the gate wards fall
 * silent and creatures deal escalating damage to citadels (+RAGNAROK_RAMP x per minute).
 */
export const RAGNAROK_TIME = 18 * 60;
export const RAGNAROK_AFTER_FINAL = 3 * 60;
export const RAGNAROK_RAMP = 1;
/**
 * Every battle ends: this long into Ragnarök both citadels start to crumble, losing
 * RAGNAROK_CRUMBLE of their full health per second, so the healthier one outlasts the other
 * (armies grinding in midfield forever stalled ~1% of evenly matched AI battles past 45 min).
 */
export const RAGNAROK_CRUMBLE_AFTER = 10 * 60;
export const RAGNAROK_CRUMBLE = 0.005;

/**
 * Ley Surge — a seeded surprise. Now and then the ley lines flare under one lane's shrine: an omen
 * gives SURGE_OMEN seconds of warning, then for SURGE_TIME seconds whoever holds that shrine draws
 * SURGE_INCOME x their passive age income on top (about a creature every few seconds — worth
 * marching for). Never the same lane twice in a row; no surges once Ragnarok has begun.
 */
export const SURGE_FIRST: readonly [number, number] = [100, 150];
export const SURGE_GAP: readonly [number, number] = [100, 160];
export const SURGE_OMEN = 10;
export const SURGE_TIME = 20;
export const SURGE_INCOME = 1.5;

/** Every citadel gate has a built-in ward that shoots the nearest enemy (damage scales with age). */
export const WARD: { damage: number; cooldown: number; range: number; projectile: ProjectileSpec } = {
  damage: 8,
  cooldown: 1.1,
  range: 170,
  projectile: { kind: 'ward', speed: 700, arc: 10 },
};

/**
 * Power (hp/damage) and cost scale per age. Combat value ~ hp x dps ~ power^2, so value per
 * gold grows ~1.3x per age: ascending is a real edge, but not an instant win.
 */
export const POWER_SCALE = [1, 1.65, 2.75, 4.5, 7.4];
export const COST_SCALE = [1, 2.1, 4.4, 9.2, 19];

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------

type Template = Omit<UnitDef, 'id' | 'name' | 'age' | 'cls' | 'traits' | 'blurb'>;

const TEMPLATES: Record<Exclude<UnitClass, 'legend'>, Template> = {
  guardian: {
    cost: 30,
    hp: 170,
    damage: 10,
    cooldown: 1.1,
    windup: 0.45,
    range: 6,
    speed: 22,
    trainTime: 1.6,
    radius: 14,
  },
  hunter: {
    cost: 25,
    hp: 95,
    damage: 9,
    cooldown: 0.65,
    windup: 0.22,
    range: 6,
    speed: 40,
    trainTime: 1.1,
    radius: 12,
  },
  mystic: {
    cost: 35,
    hp: 60,
    damage: 13,
    cooldown: 1.4,
    windup: 0.5,
    range: 150,
    speed: 26,
    trainTime: 1.8,
    radius: 10,
  },
};

interface UnitSpec {
  id: string;
  name: string;
  cls: Exclude<UnitClass, 'legend'>;
  blurb: string;
  traitText?: string;
  traits?: Trait[];
  projectile?: ProjectileSpec;
  /** Multiplicative tweaks applied on top of the scaled template. */
  mul?: Partial<Record<'cost' | 'hp' | 'damage' | 'cooldown' | 'range' | 'speed' | 'trainTime' | 'radius' | 'windup', number>>;
}

function makeUnit(age: number, s: UnitSpec): UnitDef {
  const t = TEMPLATES[s.cls];
  const m = s.mul ?? {};
  const p = POWER_SCALE[age];
  const k = COST_SCALE[age];
  return {
    id: s.id,
    name: s.name,
    age,
    cls: s.cls,
    cost: Math.round(t.cost * k * (m.cost ?? 1)),
    hp: Math.round(t.hp * p * (m.hp ?? 1)),
    damage: Math.round(t.damage * p * (m.damage ?? 1) * 10) / 10,
    cooldown: t.cooldown * (m.cooldown ?? 1),
    windup: t.windup * (m.windup ?? 1),
    range: t.range * (m.range ?? 1),
    speed: t.speed * (m.speed ?? 1),
    trainTime: t.trainTime * (m.trainTime ?? 1) * (1 + age * 0.08),
    radius: t.radius * (m.radius ?? 1) * (1 + age * 0.06),
    projectile: s.projectile,
    traits: s.traits ?? [],
    blurb: s.blurb,
    traitText: s.traitText,
  };
}

const UNIT_SPECS: UnitSpec[][] = [
  // Age 1 — Fae Wilds
  [
    {
      id: 'treant',
      name: 'Treant Warden',
      cls: 'guardian',
      blurb: 'A walking oak that shrugs off blades.',
      traitText: 'Regrowth: slowly regenerates health.',
      traits: [{ kind: 'regen', perSec: 0.012 }],
      mul: { speed: 0.92 },
    },
    {
      id: 'redcap',
      name: 'Redcap Raider',
      cls: 'hunter',
      blurb: 'A vicious goblin who dips his cap in his foes’ blood.',
    },
    {
      id: 'pixie',
      name: 'Pixie Sprite',
      cls: 'mystic',
      blurb: 'A mischievous fae that hurls stinging sparks.',
      projectile: { kind: 'spark', speed: 380, arc: 6 },
    },
  ],
  // Age 2 — Olympus
  [
    {
      id: 'minotaur',
      name: 'Minotaur',
      cls: 'guardian',
      blurb: 'The labyrinth’s bull-headed sentinel.',
      mul: { hp: 1.05, radius: 1.05 },
    },
    {
      id: 'centaur',
      name: 'Centaur Lancer',
      cls: 'hunter',
      blurb: 'Half horse, all fury.',
      traitText: 'Charge: first strike after galloping deals double damage.',
      traits: [{ kind: 'charge', mult: 2, after: 0.8 }],
      mul: { speed: 1.15, radius: 1.2 },
    },
    {
      id: 'gorgon',
      name: 'Gorgon',
      cls: 'mystic',
      blurb: 'Her gaze turns flesh to sluggish stone.',
      traitText: 'Petrifying Gaze: hits slow the target.',
      traits: [{ kind: 'slow', factor: 0.55, duration: 1.6 }],
      projectile: { kind: 'gaze', speed: 900, arc: 0 },
      mul: { damage: 0.92 },
    },
  ],
  // Age 3 — Asgard
  [
    {
      id: 'jotunn',
      name: 'Frost Jötunn',
      cls: 'guardian',
      blurb: 'A giant of the frozen wastes.',
      traitText: 'Cleave: each swing strikes a second foe at full force.',
      traits: [{ kind: 'cleave', targets: 2, falloff: 1 }],
      mul: { radius: 1.15, speed: 0.95 },
    },
    {
      id: 'fenrir',
      name: 'Fenrir Wolf',
      cls: 'hunter',
      blurb: 'The world-devouring wolf, unchained.',
      traitText: 'Devour: heals for a quarter of the damage it deals.',
      traits: [{ kind: 'lifesteal', frac: 0.25 }],
      mul: { radius: 1.1 },
    },
    {
      id: 'valkyrie',
      name: 'Valkyrie',
      cls: 'mystic',
      blurb: 'A winged chooser of the slain.',
      traitText: 'Flight: soars over allies instead of queueing.',
      traits: [{ kind: 'flying' }],
      projectile: { kind: 'spear', speed: 520, arc: 18 },
      mul: { hp: 1.1 },
    },
  ],
  // Age 4 — Jade Empire
  [
    {
      id: 'oni',
      name: 'Oni Brute',
      cls: 'guardian',
      blurb: 'A horned demon with an iron club.',
      traitText: 'Enrage: attacks much faster below half health.',
      traits: [{ kind: 'enrage', below: 0.5, attackSpeed: 1.5 }],
      mul: { radius: 1.1 },
    },
    {
      id: 'byakko',
      name: 'Byakko Tiger',
      cls: 'hunter',
      blurb: 'The White Tiger of the West, swift as wind.',
      traitText: 'Flurry: rapid claw strikes.',
      mul: { cooldown: 0.62, damage: 0.66, speed: 1.15, radius: 1.15 },
    },
    {
      id: 'kitsune',
      name: 'Kitsune',
      cls: 'mystic',
      blurb: 'A nine-tailed fox spirit wreathed in foxfire.',
      traitText: 'Foxfire: bolts leap to two more foes.',
      traits: [{ kind: 'bounce', count: 2, falloff: 0.6, range: 90 }],
      projectile: { kind: 'foxfire', speed: 420, arc: 10 },
    },
  ],
  // Age 5 — Celestial
  [
    {
      id: 'titan',
      name: 'Titan',
      cls: 'guardian',
      blurb: 'An elder god of the primordial world.',
      traitText: 'Earthshaker: blows crush nearby foes too.',
      traits: [{ kind: 'slam', radius: 45, falloff: 0.5 }],
      mul: { radius: 1.25, speed: 0.9 },
    },
    {
      id: 'griffin',
      name: 'Griffin',
      cls: 'hunter',
      blurb: 'Eagle and lion, sovereign of sky and earth.',
      traitText: 'Flight: soars over allies instead of queueing.',
      traits: [{ kind: 'flying' }],
      mul: { speed: 1.25, radius: 1.2 },
    },
    {
      id: 'phoenix',
      name: 'Phoenix',
      cls: 'mystic',
      blurb: 'The undying firebird.',
      traitText: 'Rebirth: rises from its ashes once. Flight.',
      traits: [{ kind: 'flying' }, { kind: 'rebirth', hpFrac: 0.5 }],
      projectile: { kind: 'flame', speed: 460, arc: 0 },
      mul: { hp: 0.9 },
    },
  ],
];

export const UNITS: Record<string, UnitDef> = {};
export const AGE_UNITS: UnitDef[][] = UNIT_SPECS.map((specs, age) =>
  specs.map((s) => {
    const def = makeUnit(age, s);
    UNITS[def.id] = def;
    return def;
  }),
);

/** The final-age Legend. */
export const DRAGON: UnitDef = {
  id: 'dragon',
  name: 'Elder Dragon',
  age: 4,
  cls: 'legend',
  cost: Math.round(30 * COST_SCALE[4] * 4.5),
  hp: Math.round(170 * POWER_SCALE[4] * 5),
  damage: Math.round(10 * POWER_SCALE[4] * 4),
  cooldown: 2.2,
  windup: 0.7,
  range: 130,
  speed: 17,
  trainTime: 6,
  radius: 30,
  projectile: { kind: 'dragonfire', speed: 520, arc: 0 },
  traits: [{ kind: 'flying' }, { kind: 'splash', radius: 55 }],
  maxAlive: 1,
  blurb: 'The first and last of all wyrms. Neither strong nor weak against any class.',
  traitText: 'Dragonfire: breath scorches every foe near the target. Flight. One at a time.',
};
UNITS[DRAGON.id] = DRAGON;
AGE_UNITS[4].push(DRAGON);

// ---------------------------------------------------------------------------
// Turrets
// ---------------------------------------------------------------------------

interface TurretSpec {
  id: string;
  name: string;
  kind: 'bolt' | 'blast';
  blurb: string;
  projectile: ProjectileSpec;
  slow?: { factor: number; duration: number };
  mul?: Partial<Record<'cost' | 'damage' | 'cooldown' | 'range' | 'splash', number>>;
}

const TURRET_BASE = {
  bolt: { cost: 110, damage: 14, cooldown: 1.0, range: 280, splash: 0 },
  blast: { cost: 150, damage: 11, cooldown: 2.2, range: 230, splash: 45 },
};

const TURRET_SPECS: [TurretSpec, TurretSpec][] = [
  [
    { id: 'thornspitter', name: 'Thornspitter', kind: 'bolt', blurb: 'A briar bulb that spits thorns.', projectile: { kind: 'thorn', speed: 620, arc: 4 } },
    { id: 'sporepod', name: 'Spore Mortar', kind: 'blast', blurb: 'Lobs bursting toadstool spores.', projectile: { kind: 'spore', speed: 300, arc: 70 } },
  ],
  [
    { id: 'ballista', name: 'Ballista', kind: 'bolt', blurb: 'A bronze siege bow.', projectile: { kind: 'bolt', speed: 760, arc: 6 } },
    { id: 'brazier', name: 'Greek Fire Brazier', kind: 'blast', blurb: 'Hurls pots of liquid fire.', projectile: { kind: 'firepot', speed: 320, arc: 75 } },
  ],
  [
    { id: 'runestone', name: 'Rune Sentinel', kind: 'bolt', blurb: 'A carved stone that crackles with runes.', projectile: { kind: 'rune', speed: 700, arc: 0 } },
    {
      id: 'frostcatapult',
      name: 'Frost Catapult',
      kind: 'blast',
      blurb: 'Flings boulders of glacier ice that slow.',
      projectile: { kind: 'iceboulder', speed: 300, arc: 80 },
      slow: { factor: 0.6, duration: 1.5 },
    },
  ],
  [
    { id: 'repeater', name: 'Repeating Crossbow', kind: 'bolt', blurb: 'A jade-lacquered rapid crossbow.', projectile: { kind: 'arrow', speed: 800, arc: 5 }, mul: { cooldown: 0.5, damage: 0.55 } },
    { id: 'rocketrack', name: 'Fire-Lance Rack', kind: 'blast', blurb: 'Volleys of black-powder rockets.', projectile: { kind: 'rocket', speed: 380, arc: 50 } },
  ],
  [
    { id: 'sunspire', name: 'Sunlance Spire', kind: 'bolt', blurb: 'Focuses sunlight into a searing lance.', projectile: { kind: 'sunbeam', speed: 1400, arc: 0 } },
    { id: 'starforge', name: 'Starforge', kind: 'blast', blurb: 'Hurls fragments of fallen stars.', projectile: { kind: 'starorb', speed: 360, arc: 60 }, mul: { splash: 1.2 } },
  ],
];

export const TURRETS: Record<string, TurretDef> = {};
export const AGE_TURRETS: TurretDef[][] = TURRET_SPECS.map((pair, age) =>
  pair.map((s) => {
    const b = TURRET_BASE[s.kind];
    const m = s.mul ?? {};
    const def: TurretDef = {
      id: s.id,
      name: s.name,
      age,
      kind: s.kind,
      cost: Math.round(b.cost * COST_SCALE[age] * (m.cost ?? 1)),
      damage: Math.round(b.damage * POWER_SCALE[age] * (m.damage ?? 1) * 10) / 10,
      cooldown: b.cooldown * (m.cooldown ?? 1),
      range: b.range * (m.range ?? 1),
      splash: b.splash * (m.splash ?? 1),
      slow: s.slow,
      projectile: s.projectile,
      blurb: s.blurb,
    };
    TURRETS[def.id] = def;
    return def;
  }),
);

// ---------------------------------------------------------------------------
// God powers
// ---------------------------------------------------------------------------

export const POWERS: Record<PowerKind, PowerDef> = {
  briar: {
    id: 'briar',
    name: 'Briar Snare',
    age: 0,
    cooldown: 50,
    damage: 45 * POWER_SCALE[0],
    blurb: 'Thorned vines erupt beneath every foe in the lane, rooting them in place.',
  },
  zeus: {
    id: 'zeus',
    name: 'Wrath of Zeus',
    age: 1,
    cooldown: 55,
    damage: 90 * POWER_SCALE[1],
    blurb: 'Seven thunderbolts strike enemies in the lane.',
  },
  fimbul: {
    id: 'fimbul',
    name: 'Fimbulwinter',
    age: 2,
    cooldown: 60,
    damage: 45 * POWER_SCALE[2],
    blurb: 'A killing frost freezes every foe in the lane solid. Frozen foes are brittle: they take 50% more damage until they thaw.',
  },
  spiritdragon: {
    id: 'spiritdragon',
    name: 'Spirit Dragon',
    age: 3,
    cooldown: 60,
    damage: 110 * POWER_SCALE[3],
    blurb: 'A celestial serpent sweeps the whole lane.',
  },
  starfall: {
    id: 'starfall',
    name: 'Starfall',
    age: 4,
    cooldown: 65,
    damage: 85 * POWER_SCALE[4],
    blurb: 'Stars rain down upon the lane.',
  },
};

// ---------------------------------------------------------------------------
// Blessings — permanent upgrades bought with gold
// ---------------------------------------------------------------------------

export type BlessingId = 'might' | 'vitality' | 'bastion';

export interface BlessingDef {
  id: BlessingId;
  name: string;
  perRank: number;
  blurb: string;
}

export const BLESSINGS: Record<BlessingId, BlessingDef> = {
  might: { id: 'might', name: 'Might', perRank: 0.1, blurb: '+10% damage for all your creatures.' },
  vitality: { id: 'vitality', name: 'Vitality', perRank: 0.1, blurb: '+10% health for newly summoned creatures.' },
  bastion: { id: 'bastion', name: 'Bastion', perRank: 0.15, blurb: '+15% citadel health and +7.5% ward and turret damage.' },
};
export const BLESSING_ORDER: BlessingId[] = ['might', 'vitality', 'bastion'];
export const BLESSING_MAX_RANK = 5;

/**
 * Blessings never cost less than in this age. They are permanent, so at first-age prices
 * (120 gold for +10% damage for the rest of the battle) they were the best buy in the game:
 * a bot that bought Might and Vitality as soon as it could went from 22% to 53% wins vs Master.
 */
export const BLESSING_PRICE_FLOOR_AGE = 2;

/** Cost of buying the next rank (rank = ranks already owned). Scales with the current age. */
export function blessingCost(rank: number, age: number): number {
  return Math.round(120 * (rank + 1) * COST_SCALE[Math.max(age, BLESSING_PRICE_FLOOR_AGE)]);
}

// ---------------------------------------------------------------------------
// Ages
// ---------------------------------------------------------------------------

export const AGES: AgeDef[] = [
  { index: 0, id: 'fae', name: 'Fae Wilds', subtitle: 'Age of Whispers', lore: 'In a moonlit wood the ley lines wake. Oaks walk, goblins grin — and two citadels claim the same crossing.', units: [], turrets: [], power: 'briar', xpRequired: 0, ascendCost: 0, baseHp: 2500, income: 3, shrineIncome: 0.6 },
  { index: 1, id: 'olympus', name: 'Olympus', subtitle: 'Age of Heroes', lore: 'The gods of the mountain take notice. Minotaurs, centaurs and gorgons answer your call.', units: [], turrets: [], power: 'zeus', xpRequired: 800, ascendCost: 150, baseHp: 4000, income: 5.5, shrineIncome: 1.1 },
  { index: 2, id: 'asgard', name: 'Asgard', subtitle: 'Age of Sagas', lore: 'The skalds begin to sing of this war. Frost giants stride from the north, wolves at their heels.', units: [], turrets: [], power: 'fimbul', xpRequired: 2800, ascendCost: 400, baseHp: 6500, income: 10, shrineIncome: 2 },
  { index: 3, id: 'jade', name: 'Jade Empire', subtitle: 'Age of Dynasties', lore: 'Spirits of the East join the struggle: demons with iron clubs, tigers of the wind, nine-tailed foxes.', units: [], turrets: [], power: 'spiritdragon', xpRequired: 8000, ascendCost: 1000, baseHp: 10500, income: 19, shrineIncome: 3.8 },
  { index: 4, id: 'celestial', name: 'Celestial', subtitle: 'Age of Gods', lore: 'Titans wake and firebirds descend. No legend is left to call on — only the gods themselves.', units: [], turrets: [], power: 'starfall', xpRequired: 20000, ascendCost: 2400, baseHp: 17000, income: 36, shrineIncome: 7.2 },
];
for (const age of AGES) {
  age.units = AGE_UNITS[age.index].map((u) => u.id);
  age.turrets = AGE_TURRETS[age.index].map((t) => t.id);
}

export const MAX_AGE = AGES.length - 1;
