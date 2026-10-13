import { describe, expect, it } from 'vitest';
import { breakNoteFor } from '../src/ui/wellbeing.ts';

describe('the break note (Lens #98)', () => {
  it('speaks once per full hour of battles, never before the first', () => {
    expect(breakNoteFor(59 * 60, 0)).toEqual({ note: null, hours: 0 });
    const first = breakNoteFor(61 * 60, 0);
    expect(first.note).toMatch(/^You have been at war for over an hour\./);
    expect(first.hours).toBe(1);
    // The same hour again: quiet.
    expect(breakNoteFor(90 * 60, first.hours)).toEqual({ note: null, hours: 1 });
    // The second hour.
    const second = breakNoteFor(121 * 60, 1);
    expect(second.note).toMatch(/over 2 hours/);
    expect(second.hours).toBe(2);
    // A long battle that crosses two hours at once names the latest.
    expect(breakNoteFor(3 * 3600 + 5, 1).note).toMatch(/over 3 hours/);
  });
});

describe('a sitting (backlog 29)', () => {
  it('ends after half an hour without a battle', async () => {
    const { Sitting, SITTING_GAP } = await import('../src/ui/wellbeing.ts');
    const s = new Sitting();
    let t = 1000;
    // 61 minutes of battle, frame by frame (in one-second steps here).
    for (let i = 0; i < 61 * 60; i++) s.battle((t += 1), 1);
    expect(s.note()).toMatch(/over an hour/);
    expect(s.note()).toBeNull();
    // Next morning (the tab left open): a minute of battle is a new sitting — no note.
    t += 10 * 3600;
    for (let i = 0; i < 60; i++) s.battle((t += 1), 1);
    expect(s.note()).toBeNull();
    // A short pause between battles doesn't end the sitting.
    for (let i = 0; i < 59 * 60; i++) s.battle((t += 1), 1);
    t += SITTING_GAP - 5;
    for (let i = 0; i < 120; i++) s.battle((t += 1), 1);
    expect(s.note()).toMatch(/over an hour/);
  });
});
