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
