import { describe, expect, it } from 'vitest';
import { AGE_UNITS, DRAGON, TICK, UNITS } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';
import type { SimEvent } from '../src/sim/types.ts';
import { TEMPERS, gestureAt } from '../src/render/creatures/tempers.ts';

describe('creature tempers (Lens #77)', () => {
  it('every creature has a temper, and every gesture stays sane and ends where it began', () => {
    for (const def of [...AGE_UNITS.flat(), DRAGON]) {
      const t = TEMPERS[def.id];
      expect(t, def.id).toBeDefined();
      for (let i = 0; i <= 20; i++) {
        const g = gestureAt(t.gesture, i / 20);
        expect(Math.abs(g.sx)).toBeGreaterThan(0.05);
        expect(g.sy).toBeGreaterThan(0.5);
        expect(Math.abs(g.rot)).toBeLessThan(0.5);
        expect(g.lift).toBeLessThanOrEqual(1e-9);
      }
      for (const k of [0, 1]) {
        const g = gestureAt(t.gesture, k);
        expect(g.sx).toBeCloseTo(1, 5);
        expect(g.sy).toBeCloseTo(1, 5);
        expect(g.rot).toBeCloseTo(0, 5);
        expect(g.lift).toBeCloseTo(0, 5);
      }
    }
  });

  it('a death names the creature that dealt the blow, and -1 for a turret or power', () => {
    const w = new World();
    const killer = w.spawnUnit(0, 0, UNITS.redcap, 400);
    const victim = w.spawnUnit(1, 0, UNITS.pixie, 430);
    victim.hp = 1;
    const log: SimEvent[] = [];
    for (let i = 0; i < Math.round(3 / TICK) && victim.alive; i++) {
      w.step();
      log.push(...w.drainEvents());
    }
    const death = log.find((e) => e.type === 'death' && e.unitId === victim.id);
    expect(death && death.type === 'death' && death.killer).toBe(killer.id);

    const lone = w.spawnUnit(1, 1, UNITS.pixie, 500);
    w.killUnit(lone, null);
    const d2 = w.drainEvents().find((e) => e.type === 'death' && e.unitId === lone.id);
    expect(d2 && d2.type === 'death' && d2.killer).toBe(-1);
  });
});
