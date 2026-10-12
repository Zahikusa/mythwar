/**
 * Every battle is fought somewhere: a place name drawn from the battle's seed ("Weeping Ford",
 * "the Vale of Ravens"). Only a name — what weeps at the ford is left to the player. The seed is
 * shared online, so both players fight at the same place, and it survives saves and reconnects.
 */

const ADJECTIVES = [
  'Weeping', 'Ashen', 'Hollow', 'Silver', 'Gloaming', 'Sunken', 'Howling', 'Amber', 'Whispering',
  'Broken', 'Starlit', 'Crimson', 'Misted', 'Thorned', 'Drowned', 'Golden', 'Sleeping', 'Burning',
  'Frostbitten', 'Nine-Barrow', 'Raven’s', 'Wyrm’s', 'Giant’s', 'Widow’s',
];
const NOUNS = [
  'Ford', 'Crossing', 'Vale', 'Barrow', 'Causeway', 'Fen', 'Moor', 'Downs', 'Tor', 'Mere', 'Reach',
  'Glen', 'Hill', 'Pass', 'Bridge', 'Marches',
];
/** "the Vale of …" */
const OF_PLACES = ['Vale', 'Ford', 'Field', 'Pass', 'Plain', 'Fen', 'Hill', 'Gate', 'Shore', 'Weald'];
const OF_THINGS = [
  'Ravens', 'Antlers', 'Broken Spears', 'Lost Crowns', 'Seven Stones', 'Bells', 'Owls', 'Ash',
  'Whispers', 'the Hanged Moon', 'Wolves', 'Blue Fire', 'Sorrows', 'Kings',
];

/** A well-mixed 32-bit hash of the seed (so neighbouring seeds don't share a name). */
function mix(seed: number, salt: number): number {
  let x = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** The battlefield's name, e.g. "Weeping Ford" or "the Vale of Ravens". */
export function placeName(seed: number): string {
  const pick = <T>(list: T[], salt: number) => list[mix(seed, salt) % list.length];
  if (mix(seed, 1) % 3 === 0) return `the ${pick(OF_PLACES, 2)} of ${pick(OF_THINGS, 3)}`;
  return `${pick(ADJECTIVES, 4)} ${pick(NOUNS, 5)}`;
}

/** "The Battle of Weeping Ford" / "The Battle of the Vale of Ravens". */
export function battleName(seed: number): string {
  return `The Battle of ${placeName(seed)}`;
}
