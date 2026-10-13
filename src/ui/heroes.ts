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

/** The name a creature earns (stable for one creature: from its kind and its unit id). */
export function heroName(defId: string, unitId: number): string {
  const list = NAMES[defId];
  if (!list) return '';
  return list[(Math.imul(unitId, 0x9e3779b1) >>> 0) % list.length];
}
