import { describe, expect, it } from 'vitest';
import { battleName, placeName } from '../src/ui/places.ts';
import { World } from '../src/sim/world.ts';

describe('battlefield names', () => {
  it('are fixed by the seed and varied across seeds', () => {
    expect(placeName(42)).toBe(placeName(42));
    const names = new Set<string>();
    for (let s = 0; s < 400; s++) names.add(placeName(s));
    expect(names.size).toBeGreaterThan(250);
    // Both shapes appear: "Weeping Ford" and "the Vale of Ravens".
    expect([...names].some((n) => n.startsWith('the '))).toBe(true);
    expect([...names].some((n) => !n.startsWith('the '))).toBe(true);
    expect(battleName(7)).toBe(`The Battle of ${placeName(7)}`);
  });

  it('survive a snapshot (saves, reconnects)', () => {
    const w = new World({ seed: 987654 });
    expect(World.deserialize(w.serialize()).seed).toBe(987654);
  });
});

describe('the generals address the player by name', () => {
  it('every other line, when a name is set', async () => {
    const { tauntLine, PERSONAS } = await import('../src/ui/personas.ts');
    expect(tauntLine('master', 'start', 0, 'Zoë')).toBe('I have seen you in the well, Zoë.');
    expect(tauntLine('master', 'start', 1, 'Zoë')).not.toContain('Zoë');
    expect(tauntLine('master', 'start', 0)).toBe(PERSONAS.master.lines.start[0]);
    // Events without named lines never show a placeholder.
    expect(tauntLine('mythic', 'power', 0, 'Zoë')).not.toContain('{name}');
    for (const d of ['novice', 'adept', 'master', 'mythic'] as const) for (const ev of ['start', 'won', 'lost'] as const) expect(tauntLine(d, ev, 0, 'Q')).toContain('Q');
  });
});

describe('a custom start (Lens #71)', () => {
  it('puts both sides in the chosen age, with its citadel and prices, and survives a save', async () => {
    const { COST_SCALE, START_GOLD, AGES } = await import('../src/sim/data.ts');
    const w = new World({ seed: 5, startAge: 2, trials: [[], []] });
    for (const p of w.players) {
      expect(p.age).toBe(2);
      expect(p.baseMaxHp).toBe(AGES[2].baseHp);
      expect(p.baseHp).toBe(p.baseMaxHp);
      expect(p.gold).toBe(Math.round(START_GOLD * COST_SCALE[2]));
    }
    expect(World.deserialize(w.serialize()).startAge).toBe(2);
    expect(new World({ seed: 5 }).startAge).toBe(0);
  });
});
