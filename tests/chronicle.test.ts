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

describe('a battle taken up midway (backlog 66)', () => {
  it('tells no false first blood, no citadel brought low that already was; names agree with the field', async () => {
    const { HeroNames } = await import('../src/ui/heroes.ts');
    const w = new World({ seed: 11 });
    const ais = [new AiController(w, 0, AI_PROFILES.master, 1), new AiController(w, 1, AI_PROFILES.master, 2)];
    const play = (until: () => boolean, c?: Chronicle, view?: InstanceType<typeof HeroNames>) => {
      while (w.winner === null && !until()) {
        for (const a of ais) a.update(TICK);
        w.step();
        const ev = w.drainEvents();
        for (const e of ev) if (e.type === 'veteran') view?.rise(e.team, e.defId, e.unitId);
        c?.onEvents(ev, w);
      }
    };
    // Until there are veterans on the field (and blood long spilled).
    play(() => w.time > 60 && w.lanes.flat().some((u) => u.alive && u.veteran));
    expect(w.winner).toBeNull();
    w.players[1].baseHp = w.players[1].baseMaxHp * 0.2;
    const c = new Chronicle(0, 'Odin');
    c.resume(w);
    const view = new HeroNames(); // the renderer's, as after Continue
    view.adopt(w.lanes);
    const resumedAt = w.time;
    play(() => w.time > resumedAt + 30, c, view);
    const lines = c.lines();
    expect(lines.some((l) => /First blood/.test(l)), lines.join(' | ')).toBe(false);
    expect(lines.some((l) => /Odin's citadel is brought below/.test(l)), lines.join(' | ')).toBe(false);
    // The veterans already standing have the same names in the story as on the field.
    for (const u of w.lanes.flat().filter((x) => x.alive && x.veteran)) {
      const story = (c as unknown as { names: InstanceType<typeof HeroNames> }).names;
      expect(story.name(u.def.id, u.id)).toBe(view.name(u.def.id, u.id));
    }
  });
});

describe('a continued battle keeps its story (backlog 74)', () => {
  it('restores the saved moments in front of the new ones, ignoring anything malformed', () => {
    const w = new World({ seed: 2 });
    const before = new Chronicle(0, 'Odin');
    before.moments.push({ t: 25, text: 'First blood: the enemy’s Redcap falls in the top lane.', weight: 4 }, { t: 200, text: 'You ascend to Olympus.', weight: 3 });
    const saved = JSON.parse(JSON.stringify([...before.moments, { t: 'x', text: 5 }, null, { t: 1, text: 'ok', weight: Infinity }]));
    const after = new Chronicle(0, 'Odin');
    w.time = 300;
    after.resume(w);
    after.restore(saved);
    after.onEvents([{ type: 'ragnarok' } as never], w);
    expect(after.lines()).toEqual(['0:25 — First blood: the enemy’s Redcap falls in the top lane.', '3:20 — You ascend to Olympus.', '5:00 — Ragnarök: the wards fall silent.']);
  });
});

describe('an online battle that ends without a fallen citadel', () => {
  it('says the opponent left or was away too long, not that a citadel fell', () => {
    const w = new World({ seed: 3 });
    const end = (me: 0 | 1, winner: 0 | 1, reason?: 'citadel' | 'forfeit' | 'timeout') => {
      const c = new Chronicle(me, 'Ada');
      c.onEvents([{ type: 'gameOver', winner }], w, reason);
      return c.lines().at(-1);
    };
    expect(end(0, 0, 'forfeit')).toMatch(/Victory: Ada leaves the battle\.$/);
    expect(end(1, 0, 'forfeit')).toMatch(/Defeat: you leave the battle\.$/);
    expect(end(0, 0, 'timeout')).toMatch(/Victory: Ada was away too long\.$/);
    expect(end(1, 0, 'timeout')).toMatch(/Defeat: you were away too long\.$/);
    expect(end(0, 0, 'citadel')).toMatch(/Victory: Ada's citadel falls\.$/);
    expect(end(1, 0)).toMatch(/Defeat: your citadel falls to Ada\.$/);
  });
});
