import { AI_PROFILES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import type { RoomInfo } from '../net/protocol.ts';
import { TRIALS } from '../sim/data.ts';
import type { TrialId } from '../sim/data.ts';
import type { Team } from '../sim/types.ts';

/** The battle room as one player saw it at one moment (to tell what the other player changed). */
export interface RoomView {
  foe: { name: string; ready: boolean; trials: TrialId[] } | null;
  /** This player's own seat is Ready. */
  meReady: boolean;
  coop: Difficulty | null;
}

export function roomView(room: RoomInfo, seat: Team | null): RoomView {
  const foe = seat === null ? null : room.seats[seat === 0 ? 1 : 0];
  return {
    foe: foe ? { name: foe.name, ready: foe.ready, trials: foe.trials.slice() } : null,
    meReady: seat !== null && !!room.seats[seat]?.ready,
    coop: room.coop,
  };
}

export interface RoomNews {
  /** A little sound: someone sat down, the other player got ready, or left. */
  chime: 'ready' | 'bless' | 'cancel' | null;
  /**
   * What the other player changed, in words ('' = nothing to say): the room just re-rendering
   * (Ready undone, the score reset, an empty seat) looked like a tap that failed.
   */
  said: string;
}

/**
 * What changed between two looks at the room. `prev`: null when there was no room before.
 * `ownMode`: this player switched the mode a moment ago (their own change needs no telling).
 */
export function roomNews(prev: RoomView | null, now: RoomView, ownMode: boolean): RoomNews {
  const foe = now.foe;
  const was = prev?.foe ?? null;
  const chime = foe && !was ? 'ready' : foe && was && foe.ready && !was.ready ? 'bless' : !foe && was ? 'cancel' : null;
  // (A handicap change takes both seats out of Ready: "again" only to a player who was Ready.)
  const again = prev?.meReady ? ' — press Ready again.' : '.';
  let said = '';
  if (!foe && was) said = `${was.name} left the room.`;
  else if (foe && was && foe.name === was.name && foe.trials.join(',') !== was.trials.join(',')) {
    said = foe.trials.length ? `${foe.name} now fights under ${foe.trials.map((t) => TRIALS[t].name).join(', ')}${again}` : `${foe.name} dropped their handicaps${again}`;
  } else if (prev && now.coop !== prev.coop && !ownMode) {
    said = `${foe?.name ?? 'The other player'} switched to ${now.coop ? `co-op against the ${AI_PROFILES[now.coop].name} AI` : 'a duel'} — the score starts over.`;
  }
  return { chime, said };
}
