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
