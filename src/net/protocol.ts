/**
 * Multiplayer wire protocol, shared by the browser client (`src/net`) and the Node server
 * (`server/`). JSON text frames over one WebSocket.
 *
 * Model: the server owns the clock and runs the authoritative simulation. Clients send
 * commands; the server applies each one right before a tick of its choosing and broadcasts
 * "turns" listing every command with that tick. Clients run the same deterministic simulation
 * and apply the same commands before the same ticks, so all replicas stay identical. State
 * hashes are compared now and then; a snapshot repairs a client that is behind or diverged.
 */
import type { Command, Team } from '../sim/types.ts';
import { TRIAL_ORDER } from '../sim/data.ts';
import type { TrialId } from '../sim/data.ts';
import type { Difficulty } from '../ai/ai.ts';
import { AI_PROFILES } from '../ai/ai.ts';
import { World } from '../sim/world.ts';
import type { WorldSnapshot } from '../sim/world.ts';

/** Bump whenever messages or simulation rules change incompatibly. */
export const PROTOCOL_VERSION = 14;

/** WebSocket endpoint path on the game's own host. */
export const MP_PATH = '/mp';

/** Seconds a player may be away (disconnected, app in the background) before forfeiting. */
export const AWAY_GRACE = 90;
/** After this many seconds away, the other player may claim the victory instead of waiting. */
export const CLAIM_AFTER = 20;
/** Countdown before a battle starts and after it resumes, in seconds. */
export const START_COUNTDOWN = 3;
export const RESUME_COUNTDOWN = 3;
/**
 * Pauses each player may call in one battle (Lens #87): enough for a real need, too few to
 * grief the other with a pause/resume loop. Being away (app in the background, link lost) is a
 * separate, uncapped hold with its own forfeit timer.
 */
export const PAUSES_PER_BATTLE = 3;
/** A state hash is broadcast every this many ticks (60 ticks = 1 s). */
export const HASH_EVERY = 60;

export const NAME_MAX = 16;

/** Quick messages players can send during a battle (no free text: nothing to moderate). */
export const EMOTES = {
  gl: 'Good luck!',
  wp: 'Well played!',
  wow: 'Wow!',
  oops: 'Oops!',
  thx: 'Thanks!',
  // Co-op calls between allies (a lane call also flashes that lane on the ally's screen).
  help0: 'Help top!',
  help1: 'Help middle!',
  help2: 'Help bottom!',
  save: 'Saving gold!',
  push: 'Push now!',
} as const;
export type EmoteId = keyof typeof EMOTES;
/** The quick messages offered in a versus battle and between co-op allies. */
export const VERSUS_EMOTES: EmoteId[] = ['gl', 'wp', 'wow', 'oops', 'thx'];
export const COOP_EMOTES: EmoteId[] = ['help0', 'help1', 'help2', 'save', 'push', 'thx'];
/** The lane a co-op lane call points at (-1 for other messages). */
export function emoteLane(id: EmoteId): number {
  return id === 'help0' ? 0 : id === 'help1' ? 1 : id === 'help2' ? 2 : -1;
}
/** Room code alphabet: no 0/O, 1/I/L, 5/S, 2/Z look-alikes. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY346789';
export const CODE_LENGTH = 4;

/** A player's command as sent by a client (the server fills in the team from the seat). */
export type NetCommand = DistributiveOmit<Command, 'team'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** One command scheduled by the server: applied just before the world steps to `tick`. */
export interface ScheduledCommand {
  tick: number;
  team: Team;
  cmd: NetCommand;
  /** The sender's sequence number (lets the sender match results to its own commands). */
  seq: number;
  /** The sender's seat (co-op: both seats command team 0); absent for the AI's orders. */
  seat?: Team;
}

export interface SeatInfo {
  name: string;
  connected: boolean;
  ready: boolean;
  /** Away: connected but the app is in the background (or disconnected) — the match waits. */
  away: boolean;
  /** Matches won in this room (rematches). */
  wins: number;
  /** Round-trip time to the server as the player's device measures it (ms; 0 = unknown). */
  ping: number;
  /** Handicaps this player takes in the next battle (to give a less experienced friend a chance). */
  trials: TrialId[];
  /** The player's standing (index into RANKS). */
  rank: number;
  /** The player's sigil (index into SIGILS, -1 = none). */
  sigil: number;
}

/** waiting: seats filling / getting ready; playing: a battle runs (incl. its countdown); over: results, rematch. */
export type RoomPhase = 'waiting' | 'playing' | 'over';

export interface RoomInfo {
  code: string;
  phase: RoomPhase;
  /** Seat 0 is the left side (team 0), seat 1 the right side (team 1) — or, co-op, both left. */
  seats: [SeatInfo | null, SeatInfo | null];
  /** Co-op: both players share the left side against this AI (null = against each other). */
  coop: Difficulty | null;
}

/** An open room in the lobby list. */
export interface OpenRoom {
  code: string;
  host: string;
  /** The host's standing (index into RANKS) and sigil (index into SIGILS, -1 = none). */
  rank: number;
  sigil: number;
  /** Seconds since the room was opened. */
  age: number;
}

/**
 * One player in a network's Hall of champions (Lens #86): head-to-head battles won and lost on
 * this server, across rooms, and co-op victories over the AI. Kept by the server per network
 * (until it restarts), by name.
 */
export interface HallEntry {
  name: string;
  sigil: number;
  w: number;
  l: number;
  coop: number;
  /** Server-side only (Lens #93): on how many different days they battled here, and the last. */
  days?: number;
  last?: number;
  /** Server-side only: what the hall knows them by (a hashed device id, or the lower-case name). */
  key?: string;
}

export interface HistorySample {
  t: number;
  army: [number, number];
}

export interface AgeUpMark {
  t: number;
  team: Team;
  age: number;
}

export type PauseReason = 'pause' | 'away';

export interface PauseState {
  reason: PauseReason;
  /** Seat that paused / is away. */
  seat: Team;
  /** Seconds left before the absent player forfeits (away only). */
  forfeitIn?: number;
  /** Seconds until the other player may claim the win instead (away only). */
  claimIn?: number;
  /** Pauses each seat has left in this battle. */
  pausesLeft?: [number, number];
}

export type EndReason = 'citadel' | 'forfeit' | 'timeout';

// ---------------------------------------------------------------------------
// Client → server
// ---------------------------------------------------------------------------

export type ClientMsg =
  | {
      type: 'hello';
      v: number;
      /** simFingerprint() of the client's build: both sides must run the very same rules. */
      sim: number;
      name: string;
      /** The player's standing (index into RANKS). */
      rank?: number;
      /** The player's sigil (index into SIGILS, -1 = none). */
      sigil?: number;
      /**
       * A random id this browser keeps (localStorage): the Hall of champions knows a player by it
       * rather than by name. Never shown to anyone; the server keeps only a salted hash.
       */
      device?: string;
      /** Session token from an earlier welcome (reconnect). */
      token?: string;
      /** The client still shows a battle in progress (it may have missed how it ended). */
      battle?: boolean;
      /** The app is in the background right now (a reconnect from a hidden tab). */
      away?: boolean;
    }
  | { type: 'name'; name: string; rank?: number; sigil?: number }
  | { type: 'watchRooms'; on: boolean }
  | { type: 'host' }
  | { type: 'join'; code: string }
  | { type: 'ready'; ready: boolean }
  /** This player's own handicaps for the next battle (between battles only). */
  | { type: 'trials'; trials: TrialId[] }
  /** Versus (null) or co-op against an AI of this difficulty (between battles only). */
  | { type: 'coop'; coop: Difficulty | null }
  | { type: 'leave' }
  | { type: 'cmd'; seq: number; cmd: NetCommand }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'away'; away: boolean }
  | { type: 'resync' }
  /** The opponent has been away for CLAIM_AFTER seconds: take the win now. */
  | { type: 'claim' }
  | { type: 'emote'; id: EmoteId }
  /** `rtt`: this client's smoothed round-trip time so far (shown to the other player). */
  | { type: 'ping'; t: number; rtt?: number };

// ---------------------------------------------------------------------------
// Server → client
// ---------------------------------------------------------------------------

export type ServerMsg =
  | {
      type: 'welcome';
      v: number;
      token: string;
      /** Room the session is still seated in (reconnect). */
      room: RoomInfo | null;
      seat: Team | null;
      /** Addresses other devices can open the game at (e.g. http://192.168.1.20:8787/). */
      lan: string[];
      /** The token was recognised (false: a fresh session — e.g. the server restarted). */
      resumed: boolean;
    }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'rooms'; rooms: OpenRoom[]; hall?: HallEntry[] }
  | { type: 'room'; room: RoomInfo; seat: Team }
  | { type: 'left' }
  | { type: 'start'; seed: number; seat: Team; names: [string, string]; countdown: number; trials: [TrialId[], TrialId[]]; coop: Difficulty | null }
  | { type: 'turn'; tick: number; cmds?: ScheduledCommand[]; hash?: [number, number] }
  | {
      type: 'snapshot';
      tick: number;
      world: WorldSnapshot;
      seat: Team;
      names: [string, string];
      /** Co-op: the AI the two players face together. */
      coop?: Difficulty | null;
      paused: PauseState | null;
      /** Seconds left of a start / resume countdown (0 = none). */
      countdown?: number;
      /** Pauses each seat has left in this battle. */
      pausesLeft?: [number, number];
      /** Results-chart bookkeeping from before the snapshot. */
      history: HistorySample[];
      ageUps: AgeUpMark[];
    }
  | { type: 'paused'; state: PauseState }
  | { type: 'resuming'; seconds: number }
  | { type: 'resumed'; tick: number }
  | { type: 'over'; winner: Team; reason: EndReason; tick: number }
  | { type: 'pong'; t: number; tick: number }
  /** A quick message from the player in `seat`. */
  | { type: 'emote'; seat: Team; id: EmoteId };

export type ErrorCode = 'version' | 'no-room' | 'room-full' | 'bad-request' | 'not-in-room' | 'rate';

/**
 * The trials each side fights under, from the seats' handicaps: in co-op both allies' handicaps
 * apply to the shared left side (server and every replica must agree on this exactly).
 */
export function sideTrials(trials: [TrialId[], TrialId[]] | undefined, coop: Difficulty | null | undefined): [TrialId[], TrialId[]] | undefined {
  if (!trials) return undefined;
  return coop ? [cleanTrials([...trials[0], ...trials[1]]), []] : trials;
}

/**
 * The world a new online battle starts from — built the same way by the server and by every
 * replica: the seats' handicaps, and in co-op the AI's income handicap on the right side.
 */
export function battleWorld(seed: number, trials: [TrialId[], TrialId[]] | undefined, coop: Difficulty | null | undefined): World {
  const w = new World({ seed, trials: sideTrials(trials, coop) });
  if (coop) w.players[1].incomeMult = AI_PROFILES[coop].incomeMult;
  return w;
}

/** Keeps only known trials, once each, in their usual order. */
export function cleanTrials(raw: unknown): TrialId[] {
  return Array.isArray(raw) ? TRIAL_ORDER.filter((t) => raw.includes(t)) : [];
}

/**
 * A player's standing among players (Lens #80): how far up the ladder of generals their own
 * journey has taken them — none beaten, then Puck, Hippolyta, Odin, Ares, and Legend of the Ages
 * (three stars against every general). Shown by their name in the battle room and the open-battle
 * list. Self-declared: progress lives on the player's device (an internet server with accounts
 * would keep it itself).
 */
export const RANKS = ['Recruit', 'Warden', 'Champion', 'Warlord', 'Conqueror', 'Legend'] as const;

/**
 * Sigils a player can take as their emblem (Lens #75; text presentation, so phones don't draw
 * emoji). Online, each player's flies on their keep for both to see (Lens #85).
 */
export const SIGILS = ['☀︎', '☾︎', '✦', '♛︎', '⚔︎', '❖'];

/** A device id as the client sends it (16–32 hex digits), or '' if it isn't one. */
export function cleanDevice(raw: unknown): string {
  return typeof raw === 'string' && /^[0-9a-f]{16,32}$/.test(raw) ? raw : '';
}

/** A sigil index, or -1 (none). */
export function cleanSigil(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= -1 && raw < SIGILS.length ? raw : -1;
}

export function cleanRank(raw: unknown): number {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < RANKS.length ? raw : 0;
}

/** Sanitizes a player name (printable, trimmed, at most NAME_MAX characters). */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  // eslint-disable-next-line no-control-regex
  const clean = s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return [...clean].slice(0, NAME_MAX).join('') || 'Player';
}

/** Normalizes a typed room code (case, spaces); null if it can't be one. */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}
