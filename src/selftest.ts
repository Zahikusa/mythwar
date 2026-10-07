import { AI_PROFILES, AiController } from './ai/ai.ts';
import { simFingerprint } from './sim/fingerprint.ts';
import { hashWorld } from './sim/hash.ts';
import { World } from './sim/world.ts';

/**
 * Cross-engine determinism probe (scripts/enginecheck.ts): an AI-vs-AI battle whose state hash
 * is taken every `every` ticks. Every JavaScript engine must produce exactly the same list —
 * that is what lets a phone and a PC replay the same online battle.
 */
export function battleHashes(seed: number, seconds: number, every = 600): { fingerprint: number; hashes: number[]; ticks: number } {
  const w = new World({ seed });
  const ais = [new AiController(w, 0, AI_PROFILES.mythic, seed + 1), new AiController(w, 1, AI_PROFILES.master, seed + 2)];
  const hashes: number[] = [];
  const end = Math.round(seconds * 60);
  while (w.tick < end && w.winner === null) {
    for (const ai of ais) ai.update(1 / 60);
    w.step();
    w.drainEvents();
    if (w.tick % every === 0) hashes.push(hashWorld(w));
  }
  hashes.push(hashWorld(w));
  return { fingerprint: simFingerprint(), hashes, ticks: w.tick };
}
