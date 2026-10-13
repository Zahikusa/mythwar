import { AI_PROFILES } from '../ai/ai.ts';
import type { Difficulty } from '../ai/ai.ts';
import type { RoomInfo } from '../net/protocol.ts';
import { TRIALS } from '../sim/data.ts';
import type { TrialId } from '../sim/data.ts';
import type { Team } from '../sim/types.ts';

/** The battle room as one player saw it at one moment (to tell what the other player changed). */
export interface RoomView {
  foe: { name: string; ready: boolean; trials: TrialId[]; away?: boolean; connected?: boolean } | null;
  /** This player's own seat is Ready. */
  meReady: boolean;
  coop: Difficulty | null;
}

export function roomView(room: RoomInfo, seat: Team | null): RoomView {
  const foe = seat === null ? null : room.seats[seat === 0 ? 1 : 0];
  return {
    foe: foe ? { name: foe.name, ready: foe.ready, trials: foe.trials.slice(), away: foe.away || !foe.connected, connected: foe.connected } : null,
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

/**
 * In a co-op battle, what the ally just did ('' = nothing new): the one who stays must know they
 * now fight alone (the battle doesn't wait for one ally — backlog 191).
 */
export function allyNews(prev: RoomView | null, now: RoomView): string {
  const was = prev?.foe ?? null;
  const ally = now.foe;
  if (was && !ally) return `${was.name} left the battle — you fight on alone.`;
  if (!was || !ally || ally.name !== was.name) return '';
  if (ally.away && !was.away) return `${ally.name} is away — you fight on; the battle waits only if you go too.`;
  if (!ally.away && was.away) return `${ally.name} is back.`;
  return '';
}

/** What to do when the server no longer seats us in the room we had (MpClient.sessionLost). */
export interface LostSessionPlan {
  /** Put the battle or its results away and show the lobby. */
  toLobby: boolean;
  /** Join the lost room again (its seat may still be free). */
  rejoin: boolean;
  /** Said on the lobby (or the room, once rejoined). */
  note: string;
}

/**
 * `state`: the app's ('title' | 'playing' | 'over'), `menu`: the screen showing, `netBattle`: an
 * online battle is loaded, `lostRoom`: the room's code. An expired seat mid-battle first gets the
 * battle's ending replayed (results follow), so the lobby waits; after a restart or a fault the
 * battle is gone at once. A phone that locked in the room (no wake lock over plain http) — or on
 * the results — lost its seat after a minute: it joins the same room again.
 */
export function lostSessionPlan(lost: 'restart' | 'expired' | 'fault', state: 'title' | 'playing' | 'over', menu: string, netBattle: boolean, lostRoom: string | null): LostSessionPlan {
  const toLobby = netBattle && state !== 'title' && (lost !== 'expired' || state === 'over');
  const onRoomScreens = toLobby || (state === 'title' && (menu === 'mp' || menu === 'room'));
  const rejoin = lost === 'expired' && !!lostRoom && onRoomScreens;
  const note = rejoin
    ? 'You were away a while and lost your seat — joining the room again…'
    : lost === 'fault'
      ? 'The game server ran into a fault and stopped your battle — sorry. It doesn’t count for anyone.'
      : lost === 'restart'
        ? 'The game server no longer knows your session (it restarted, or you were away a long time).'
        : 'You were away too long and lost your seat in the room.';
  return { toLobby, rejoin, note };
}

/** Where the other player's quick message shows, and with which sound (null: not at all). */
export interface EmoteRoute {
  /** results: by the results' chips; menu: on the menu over the battle; ally: a co-op call by our side; bubble: by their citadel. */
  to: 'results' | 'menu' | 'ally' | 'bubble';
  text: string;
  sound: 'select' | 'ready';
}

/**
 * `mine`: our own message echoed back; `state` / `menu`: the app's; `enabled`: the quick-messages
 * setting; `speaker`: the sender's seat name; `ally`: our co-op ally's name (null in a duel).
 */
export function emoteRoute(o: { mine: boolean; state: 'title' | 'playing' | 'over'; menu: string; enabled: boolean; speaker: string; ally: string | null; phrase: string }): EmoteRoute | null {
  if (o.mine || o.state === 'title' || !o.enabled) return null;
  // After the battle the results cover the HUD: their words appear by the result chips.
  if (o.state === 'over' && o.menu === 'over') return { to: 'results', text: `${o.speaker}: ${o.phrase}`, sound: 'select' };
  // A menu covers the battle (online it may run on behind it): their words on the menu, as the
  // speech bubbles hide under menus.
  if (o.menu === 'pause') return { to: 'menu', text: `${o.speaker}: ${o.phrase}`, sound: 'select' };
  // An ally's call: by our own side, with their name (a lane call also lights the lane).
  if (o.ally !== null) return { to: 'ally', text: `${o.ally}: ${o.phrase}`, sound: 'ready' };
  return { to: 'bubble', text: o.phrase, sound: 'select' };
}
