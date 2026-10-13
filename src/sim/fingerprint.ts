import * as DATA from './data.ts';
import { hashWorld } from './hash.ts';
import { World } from './world.ts';

let cached: number | null = null;

/**
 * A fingerprint of the game rules: every balance table plus a short scripted battle. Two builds
 * with the same fingerprint simulate identically, so multiplayer refuses to pair builds that
 * differ (they would drift apart at once). Takes a few milliseconds; computed once.
 */
export function simFingerprint(): number {
  if (cached !== null) return cached;
  const w = new World({ seed: 20261007 });
  for (const p of w.players) p.gold = 1e6;
  for (let t = 0; t < 60 * 30; t++) {
    if (t % 90 === 0) {
      for (const team of [0, 1] as const) {
        const p = w.players[team];
        const units = DATA.AGE_UNITS[p.age];
        w.apply({ type: 'train', team, unitId: units[(t / 90 + team) % units.length].id, lane: (t / 90 + team * 2) % DATA.LANE_COUNT });
        if (t % 900 === 450) {
          p.xp += 1e5;
          w.apply({ type: 'ageUp', team });
          w.apply({ type: 'power', team, lane: 1 });
        }
      }
    }
    w.step();
    w.drainEvents();
  }
  let h = hashWorld(w);
  // (Keys in sorted order, as a native module namespace lists them: test runners and bundlers may
  // present the namespace in declaration order, which would change the fingerprint.)
  const text = JSON.stringify(Object.fromEntries(Object.keys(DATA).sort().map((k) => [k, (DATA as Record<string, unknown>)[k]])));
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  cached = h >>> 0;
  return cached;
}
