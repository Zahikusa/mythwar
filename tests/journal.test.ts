import { describe, expect, it, vi } from 'vitest';
import { addJournal, journalText, loadSettings } from '../src/ui/settings.ts';
import type { JournalEntry } from '../src/ui/settings.ts';

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  at: new Date(2026, 9, 13, 7, 5).getTime(),
  mode: 'ai',
  foe: 'adept',
  won: true,
  secs: 754,
  stars: 2,
  age: 3,
  summons: [10, 14, 8, 0],
  kills: 40,
  losses: 31,
  powers: 6,
  quick: false,
  startAge: 0,
  trials: 0,
  ...over,
});

describe('the playtest journal (Lens #91)', () => {
  it('keeps the last 30 battles and reads as one line per battle', () => {
    const s = loadSettings();
    for (let i = 0; i < 35; i++) addJournal(s, entry({ secs: i }));
    expect(s.journal.length).toBe(30);
    expect(s.journal[0].secs).toBe(5);
    s.journal = [entry(), entry({ mode: 'online', foe: 'Ada', won: false, stars: 0, summons: [1, 2, 3, 1], quick: true })];
    const lines = journalText(s, '1.0.0').split('\n');
    expect(lines[0]).toBe('Mythwar playtest journal (v1.0.0) — 2 battle(s), oldest first');
    expect(lines[1]).toBe('2026-10-13 07:05 | ai vs adept | WON in 12:34 | 2★ | age 4 | summons G10 H14 M8 | kills 40 lost 31 | powers 6');
    expect(lines[2]).toBe('2026-10-13 07:05 | online vs Ada | lost in 12:34 | age 4 | summons G1 H2 M3 D1 | kills 40 lost 31 | powers 6 | quick');
  });

  it('survives a hand-edited or older save', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    store.set('mythwar.settings.v1', JSON.stringify({ journal: [null, 'x', { mode: 'evil', secs: -5, stars: 9, summons: 'no', foe: 7 }, entry()] }));
    const s = loadSettings();
    expect(s.journal.length).toBe(2);
    expect(s.journal[0]).toMatchObject({ mode: 'ai', secs: 0, stars: 3, summons: [0, 0, 0, 0], foe: '' });
    expect(s.journal[1]).toEqual(entry());
    store.set('mythwar.settings.v1', JSON.stringify({ master: 0.5 }));
    expect(loadSettings().journal).toEqual([]);
    vi.unstubAllGlobals();
  });
});
