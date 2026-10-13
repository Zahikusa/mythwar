/**
 * Names for creatures that earn one (Lens #88, Love): a veteran (#81) is no longer one of many —
 * it takes a name out of its own myth (the Minotaur's true name was Asterion; Sköll and Hati are
 * Fenrir's sons; Brynhild and Skögul ride with the Valkyries; Tamamo-no-Mae was the most famous
 * kitsune…), and the chronicle remembers the battle's hero by it.
 */
const NAMES: Record<string, string[]> = {
  treant: ['Oldbark', 'Mossbeard', 'Rootwarden', 'Elderleaf'],
  redcap: ['Bloodcap', 'Grimtooth', 'Nettle', 'Skulk'],
  pixie: ['Thistle', 'Glimmer', 'Wisp', 'Bramblewing'],
  minotaur: ['Asterion', 'Bronzehorn', 'Labyrinthos', 'Stampede'],
  centaur: ['Pholus', 'Nessus', 'Eurytion', 'Swiftmane'],
  gorgon: ['Stheno', 'Euryale', 'Stonegaze', 'Coil'],
  jotunn: ['Thrym', 'Hymir', 'Bergelmir', 'Rimebeard'],
  fenrir: ['Sköll', 'Hati', 'Grey-Fang', 'Gleipnir-Bane'],
  valkyrie: ['Brynhild', 'Skögul', 'Göndul', 'Hildr'],
  oni: ['Shuten', 'Ibaraki', 'Akaoni', 'Aooni'],
  byakko: ['Baihu', 'Westwind', 'Autumnclaw', 'Silverstripe'],
  kitsune: ['Tamamo', 'Kuzunoha', 'Ninetails', 'Will-o’-Fox'],
  titan: ['Hyperion', 'Iapetus', 'Oceanus', 'Atlas'],
  griffin: ['Aquila', 'Goldtalon', 'Sunfeather', 'Skyking'],
  phoenix: ['Bennu', 'Fenghuang', 'Emberheart', 'Ashborn'],
  dragon: ['Fáfnir', 'Níðhöggr', 'Ladon', 'Tiamat'],
};

/** The names a kind of creature's veterans can earn (the Bestiary lists them). */
export function heroNamesOf(defId: string): readonly string[] {
  return NAMES[defId] ?? [];
}

/** The name a creature earns (stable for one creature: from its kind and its unit id). */
export function heroName(defId: string, unitId: number): string {
  const list = NAMES[defId];
  if (!list) return '';
  return list[pick(unitId) % list.length];
}

function pick(unitId: number): number {
  return Math.imul(unitId, 0x9e3779b1) >>> 0;
}

const ROMAN = ['', '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/**
 * The names given in one battle, so no two veterans of a kind on one side share a name (a fifth
 * Minotaur veteran becomes "Asterion II"). Every view that names veterans keeps its own — the
 * renderer and the chronicle — and they agree, because they see the same veteran events in the
 * same order. A creature that rose before this view saw it (a resync) falls back to heroName().
 */
export class HeroNames {
  private byUnit = new Map<number, string>();
  private used = new Map<string, Set<string>>();

  /** A creature rises a veteran: give it the first free name of its kind. */
  rise(team: number, defId: string, unitId: number): string {
    const list = NAMES[defId];
    if (!list) return '';
    const key = `${team}:${defId}`;
    const used = this.used.get(key) ?? new Set<string>();
    this.used.set(key, used);
    const start = pick(unitId);
    let name = '';
    for (let n = 0; !name; n++) {
      const gen = Math.floor(n / list.length) + 1;
      const cand = `${list[(start + n) % list.length]}${gen < ROMAN.length ? ROMAN[gen] : ` ${gen}`}`;
      if (!used.has(cand)) name = cand;
    }
    used.add(name);
    this.byUnit.set(unitId, name);
    return name;
  }

  name(defId: string, unitId: number): string {
    return this.byUnit.get(unitId) ?? heroName(defId, unitId);
  }

  /** Whether this creature rose a veteran in this view. */
  has(unitId: number): boolean {
    return this.byUnit.has(unitId);
  }
}
