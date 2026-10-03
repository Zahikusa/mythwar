/** Equal-gold army battles between classes, per age. node scripts/classwar.ts */
import { AGE_UNITS, TICK } from '../src/sim/data.ts';
import type { UnitDef } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';

export function battle(a: UnitDef[], b: UnitDef[], budget: number): number {
  const w = new World({ seed: 1 });
  for (const p of w.players) p.baseHp = p.baseMaxHp = 1e9;
  // Spread each army behind its line, alternating unit types.
  const place = (team: 0 | 1, defs: UnitDef[]) => {
    let gold = budget;
    let i = 0;
    let x = team === 0 ? 420 : 580;
    while (true) {
      const d = defs[i % defs.length];
      if (gold < d.cost) break;
      gold -= d.cost;
      w.spawnUnit(team, 0, d, x);
      x += (team === 0 ? -1 : 1) * (d.radius * 2 + 4);
      i++;
    }
  };
  place(0, a);
  place(1, b);
  for (let t = 0; t < 240 / TICK; t++) {
    w.step();
    const alive = w.lanes[0].filter((u) => u.alive);
    if (!alive.some((u) => u.team === 0) || !alive.some((u) => u.team === 1)) break;
  }
  let v = 0;
  for (const u of w.lanes[0]) if (u.alive) v += (u.team === 0 ? 1 : -1) * u.def.cost * (u.hp / u.maxHp);
  return v / budget; // + means A won, magnitude = remaining value share
}

const names = ['G', 'H', 'M'];
if ((process.argv[1] ?? '').endsWith('classwar.ts')) for (let age = 0; age < 5; age++) {
  const [g, h, m] = AGE_UNITS[age];
  const budget = g.cost * 10;
  const row: string[] = [];
  for (const [i, a] of [g, h, m].entries()) {
    for (const [j, b] of [g, h, m].entries()) {
      if (j <= i) continue;
      row.push(`${names[i]}v${names[j]} ${battle([a], [b], budget).toFixed(2)}`);
    }
  }
  const mixed = [g, h, m];
  for (const [j, b] of [g, h, m].entries()) row.push(`Mix v ${names[j]} ${battle(mixed, [b], budget).toFixed(2)}`);
  row.push(`GM v GH ${battle([g, m], [g, h], budget).toFixed(2)}`);
  console.log(`age ${age + 1}: ${row.join('  ')}`);
}
