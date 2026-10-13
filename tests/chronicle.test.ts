import { describe, expect, it } from 'vitest';
import { AI_PROFILES, AiController } from '../src/ai/ai.ts';
import { TICK } from '../src/sim/data.ts';
import { World } from '../src/sim/world.ts';
import { Chronicle } from '../src/ui/chronicle.ts';

describe('the chronicle', () => {
  it('tells a whole battle in a few dated lines, ending with its verdict', () => {
    const w = new World({ seed: 11 });
    const ais = [new AiController(w, 0, AI_PROFILES.master, 1), new AiController(w, 1, AI_PROFILES.master, 2)];
    const c = new Chronicle(0, 'Odin');
    while (w.winner === null && w.time < 40 * 60) {
      for (const a of ais) a.update(TICK);
      w.step();
      c.onEvents(w.drainEvents(), w);
    }
    const lines = c.lines();
    expect(lines.length).toBeGreaterThan(4);
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines[0]).toMatch(/^\d+:\d\d — First blood/);
    expect(lines.some((l) => /ascends? to Olympus/.test(l))).toBe(true);
    // The battle's hero is remembered by the name it earned (Lens #88).
    expect(lines.some((l) => /Hero of the battle: [^,]+, your [A-Za-zö ]+ — \d+ foes felled\./.test(l)), lines.join(' | ')).toBe(true);
    expect(lines.at(-1)).toMatch(w.winner === 0 ? /Victory: Odin's citadel falls/ : /Defeat: your citadel falls to Odin/);
    // In order of time.
    const secs = lines.map((l) => { const [m, s] = l.split(' ')[0].split(':').map(Number); return m * 60 + s; });
    expect(secs).toEqual([...secs].sort((a, b) => a - b));
  });
});
