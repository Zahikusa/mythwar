/**
 * Healthy play (Lens #98): after every full hour of battles in one sitting, the results suggest a
 * break — once per hour. `playedSecs`: time in battle this sitting; `notedHours`: hours already
 * mentioned. Returns the note (or null) and the hours mentioned from now on.
 */
export function breakNoteFor(playedSecs: number, notedHours: number): { note: string | null; hours: number } {
  const hours = Math.floor(playedSecs / 3600);
  if (hours <= notedHours) return { note: null, hours: notedHours };
  return { note: `You have been at war for over ${hours === 1 ? 'an hour' : `${hours} hours`}. The gods will wait — a good moment for a break.`, hours };
}

/** Half an hour without a battle ends a sitting (a tab left open overnight doesn't add up). */
export const SITTING_GAP = 30 * 60;

/** Time in battle in one sitting, and the break notes said in it. */
export class Sitting {
  private played = 0;
  private noted = 0;
  private lastAt = -Infinity;

  /** A frame of battle: `now` and `dt` in seconds (wall clock). */
  battle(now: number, dt: number): void {
    if (now - this.lastAt > SITTING_GAP) {
      this.played = 0;
      this.noted = 0;
    }
    this.lastAt = now;
    this.played += dt;
  }

  /** The break note for the results now showing, if one is due (said once per hour). */
  note(): string | null {
    const { note, hours } = breakNoteFor(this.played, this.noted);
    this.noted = hours;
    return note;
  }
}
