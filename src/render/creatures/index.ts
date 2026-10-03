import { circle, glowDot, oval } from '../draw.ts';
import { pixie, redcap, treant } from './fae.ts';
import { centaur, gorgon, minotaur } from './olympus.ts';
import { fenrir, jotunn, valkyrie } from './asgard.ts';
import { byakko, kitsune, oni } from './jade.ts';
import { dragon, griffin, phoenix, titan } from './celestial.ts';
import type { CreatureArt } from './types.ts';

const placeholder: CreatureArt = {
  height: 40,
  fly: 0,
  scale: 1,
  muzzle: [10, -20],
  body: [0, -18],
  draw(ctx, p) {
    const bob = p.moving ? -Math.abs(Math.sin(p.walk)) * 2 : 0;
    oval(ctx, 0, -18 + bob, 11, 16, '#8a7fa8');
    circle(ctx, 6, -26 + bob, 4, '#ffffff');
    glowDot(ctx, 7, -26 + bob, 1.5, p.tc.main);
  },
};

export const CREATURES: Record<string, CreatureArt> = {
  treant,
  redcap,
  pixie,
  minotaur,
  centaur,
  gorgon,
  jotunn,
  fenrir,
  valkyrie,
  oni,
  byakko,
  kitsune,
  titan,
  griffin,
  phoenix,
  dragon,
};

export function artFor(defId: string): CreatureArt {
  return CREATURES[defId] ?? placeholder;
}
