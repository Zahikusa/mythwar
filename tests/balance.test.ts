import { describe, expect, it } from 'vitest';
import { AGE_UNITS } from '../src/sim/data.ts';
import { duel } from '../scripts/classwar.ts';

describe('the counter triangle', () => {
  // Equal-gold armies (ten guardians' worth), each once on either side. Every age's counters
  // must clearly win — and comparably: Lens #47 found Asgard's giant barely beating the wolf
  // (+0.09) and Jade's tiger barely beating the fox (+0.2) while other ages sat at +0.4–0.65.
  it('holds in every age with comparable margins', () => {
    for (let age = 0; age < AGE_UNITS.length; age++) {
      const [g, h, m] = AGE_UNITS[age];
      const budget = g.cost * 10;
      const gh = duel([g], [h], budget);
      const hm = duel([h], [m], budget);
      const mg = duel([m], [g], budget);
      expect(gh, `age ${age + 1} guardian vs hunter`).toBeGreaterThan(0.3);
      expect(hm, `age ${age + 1} hunter vs mystic`).toBeGreaterThan(0.3);
      expect(mg, `age ${age + 1} mystic vs guardian`).toBeGreaterThan(0.3);
    }
  });
});
