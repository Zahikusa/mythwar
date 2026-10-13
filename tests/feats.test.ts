import { describe, expect, it } from 'vitest';
import { FEATS, FeatTracker, playerRank } from '../src/ui/feats.ts';
import { World } from '../src/sim/world.ts';
import type { SimEvent } from '../src/sim/types.ts';

function tracker(have: string[] = []) {
  const got: string[] = [];
  const t = new FeatTracker(have, (f) => got.push(f.id));
  return { t, got };
}

const death = (lane: number): SimEvent => ({ type: 'death', unitId: 1, team: 1, lane, x: 500, defId: 'redcap', flying: false, gold: 10, killer: -1 });

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

  it("co-op: a dragon, the last ascension, a full blessing count only for the ally who ordered it (backlog 198)", async () => {
    const { BLESSING_MAX_RANK, MAX_AGE } = await import('../src/sim/data.ts');
    const w = new World();
    const dragon: SimEvent = { type: 'spawn', unitId: 9, team: 0, lane: 1, defId: 'dragon' };
    const ascend: SimEvent = { type: 'ageUp', team: 0, age: MAX_AGE, t: 600 };
    const bless: SimEvent = { type: 'blessing', team: 0, blessing: 'might', rank: BLESSING_MAX_RANK };
    // The other ally's deeds: nothing for us.
    const a = tracker();
    a.t.start(w, 0, true);
    a.t.onEvents([dragon, ascend, bless], w);
    expect(a.got).toEqual([]);
    // Our own orders: ours.
    const b = tracker();
    b.t.start(w, 0, true);
    b.t.ordered({ type: 'train', team: 0, unitId: 'dragon', lane: 1 }, w);
    b.t.ordered({ type: 'bless', team: 0, blessing: 'might' }, w);
    w.players[0].age = MAX_AGE;
    b.t.ordered({ type: 'ageUp', team: 0 }, w);
    b.t.onEvents([dragon, ascend, bless], w);
    expect(b.got.sort()).toEqual(['blessed', 'celestial', 'dragon']);
    // One dragon ordered, two step out (the ally's too): one feat moment, no double count.
    const c = tracker();
    c.t.start(w, 0, true);
    c.t.ordered({ type: 'train', team: 0, unitId: 'dragon', lane: 1 }, w);
    c.t.onEvents([dragon], w);
    expect(c.got).toEqual(['dragon']);
    // Outside co-op, the side is the player's: as before.
    const d = tracker();
    d.t.start(w, 0);
    d.t.onEvents([dragon, bless], w);
    expect(d.got.sort()).toEqual(['blessed', 'dragon']);
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

  it('Swift Conquest is for a full battle: not a quick one, nor one begun in a later age (backlog 68)', () => {
    for (const opts of [{ quick: true }, { startAge: 2 }]) {
      const w = new World(opts);
      w.winner = 0;
      w.time = 6 * 60;
      const { t, got } = tracker(['first', 'master']);
      t.start(w, 0);
      t.onEnd(w, 'master');
      expect(got, JSON.stringify(opts)).not.toContain('swift');
    }
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

describe('the pinnacle', () => {
  it('counts the best stars against every general, and is awarded once', async () => {
    const { FeatTracker, MAX_STARS, PINNACLE, starTotal } = await import('../src/ui/feats.ts');
    expect(MAX_STARS).toBe(12);
    expect(starTotal({})).toBe(0);
    expect(starTotal({ novice: { stars: 3 }, adept: { stars: 2 }, mythic: { stars: 9 } })).toBe(8);
    const got: string[] = [];
    const t = new FeatTracker([], (f) => got.push(f.id));
    t.award(PINNACLE);
    t.award(PINNACLE);
    expect(got).toEqual([PINNACLE]);
    expect(t.earned.map((f) => f.id)).toEqual([PINNACLE]);
  });

  it('can be completed by merging a progress code', async () => {
    const { exportProgress, importProgress } = await import('../src/ui/progress.ts');
    const { loadSettings } = await import('../src/ui/settings.ts');
    const pc = loadSettings();
    pc.records = { master: { wins: 2, losses: 0, best: 600, stars: 3 }, mythic: { wins: 1, losses: 9, best: 700, stars: 3 } };
    const phone = loadSettings();
    phone.records = { novice: { wins: 2, losses: 0, best: 400, stars: 3 }, adept: { wins: 2, losses: 0, best: 500, stars: 3 } };
    importProgress(phone, exportProgress(pc));
    expect(phone.feats).toContain('legend');
  });
});

describe('standing among players (Lens #80)', () => {
  it('is the highest general beaten, or Legend with the pinnacle feat', () => {
    expect(playerRank({}, [])).toBe(0);
    expect(playerRank({ novice: { wins: 2 } }, ['first'])).toBe(1);
    expect(playerRank({ novice: { wins: 2 }, master: { wins: 1 }, adept: { wins: 0 } }, [])).toBe(3);
    expect(playerRank({ mythic: { wins: 1 } }, [])).toBe(4);
    expect(playerRank({}, ['legend'])).toBe(5);
  });
});
