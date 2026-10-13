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

describe('the chronicle names heroes like the battlefield does (backlog 17)', () => {
  it('registers every veteran, so the hero of the battle has the same name as on its hover label', async () => {
    const { UNITS } = await import('../src/sim/data.ts');
    const { HeroNames } = await import('../src/ui/heroes.ts');
    const w = new World({ seed: 3 });
    const first = w.spawnUnit(0, 1, UNITS.minotaur, 300);
    const second = w.spawnUnit(0, 1, UNITS.minotaur, 320);
    const c = new Chronicle(0, 'Odin');
    const view = new HeroNames(); // what the renderer keeps
    const vet = (u: typeof first) => ({ type: 'veteran' as const, unitId: u.id, team: 0 as const, lane: 1, x: u.x, defId: 'minotaur' });
    for (const u of [first, second]) {
      view.rise(0, 'minotaur', u.id);
      c.onEvents([vet(u)], w);
    }
    second.kills = 7;
    first.kills = 3;
    c.onEvents([{ type: 'death', unitId: 999, team: 1, lane: 1, x: 340, defId: 'redcap', flying: false, gold: 5, killer: second.id }], w);
    c.onEvents([{ type: 'gameOver', winner: 0 }], w);
    const hero = c.lines().find((l) => l.includes('Hero of the battle'))!;
    expect(hero).toContain(`Hero of the battle: ${view.name('minotaur', second.id)}, your Minotaur — 7 foes felled.`);
    expect(view.name('minotaur', second.id)).not.toBe(view.name('minotaur', first.id));
  });
});
