import { describe, expect, it } from 'vitest';
import { FEATS, FeatTracker } from '../src/ui/feats.ts';
import { World } from '../src/sim/world.ts';
import type { SimEvent } from '../src/sim/types.ts';

function tracker(have: string[] = []) {
  const got: string[] = [];
  const t = new FeatTracker(have, (f) => got.push(f.id));
  return { t, got };
}

const death = (lane: number): SimEvent => ({ type: 'death', unitId: 1, team: 1, lane, x: 500, defId: 'redcap', flying: false, gold: 10 });

describe('feats', () => {
  it('have unique ids', () => {
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(FEATS.length);
  });

  it('nine foes falling in one lane at once is an Annihilation (once)', () => {
    const w = new World();
    const { t, got } = tracker();
    t.start(w, 0);
    t.onEvents([death(0), death(0), death(0), death(0), death(1), death(1), death(1), death(1)], w);
    expect(got).toEqual([]);
    t.onEvents(Array.from({ length: 9 }, () => death(2)), w);
    t.onEvents(Array.from({ length: 9 }, () => death(2)), w);
    expect(got).toEqual(['annihilation']);
  });

  it('victory feats depend on the foe, the time and the citadel', () => {
    const w = new World();
    w.winner = 0;
    w.time = 7 * 60;
    const { t, got } = tracker(['first']);
    t.start(w, 0);
    w.players[0].baseHp = w.players[0].baseMaxHp * 0.1;
    t.onEvents([], w);
    w.players[0].baseHp = w.players[0].baseMaxHp;
    t.onEnd(w, 'master');
    expect(got).toEqual(['master', 'swift', 'unbreached', 'comeback']);
    expect(t.earned.map((f) => f.id)).toEqual(got);
  });

  it('all three trials against the Adept or harder: Trial by Fire', () => {
    const w = new World({ trials: [['glass', 'godless', 'nowalls'], []] });
    w.winner = 0;
    w.time = 15 * 60;
    const { t, got } = tracker(['first', 'adept']);
    t.start(w, 0);
    t.onEnd(w, 'adept');
    expect(got).toContain('trials');
  });

  it('nothing for a defeat; an online win is a Worthy Rival', () => {
    const w = new World();
    w.winner = 1;
    const a = tracker();
    a.t.start(w, 0);
    a.t.onEnd(w, 'mythic');
    expect(a.got).toEqual([]);
    w.winner = 0;
    w.time = 100;
    const b = tracker();
    b.t.start(w, 0);
    b.t.onEnd(w, null);
    expect(b.got).toEqual(['first', 'online']);
  });
});
