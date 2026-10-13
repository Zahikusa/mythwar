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
