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
import type { WorldSnapshot } from '../sim/world.ts';

/** Bump whenever messages or simulation rules change incompatibly. */
export const PROTOCOL_VERSION = 6;

/** WebSocket endpoint path on the game's own host. */
export const MP_PATH = '/mp';

/** Seconds a player may be away (disconnected, app in the background) before forfeiting. */
export const AWAY_GRACE = 90;
/** After this many seconds away, the other player may claim the victory instead of waiting. */
export const CLAIM_AFTER = 20;
/** Countdown before a battle starts and after it resumes, in seconds. */
export const START_COUNTDOWN = 3;
export const RESUME_COUNTDOWN = 3;
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
} as const;
export type EmoteId = keyof typeof EMOTES;
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
}

/** waiting: seats filling / getting ready; playing: a battle runs (incl. its countdown); over: results, rematch. */
export type RoomPhase = 'waiting' | 'playing' | 'over';

export interface RoomInfo {
  code: string;
  phase: RoomPhase;
  /** Seat 0 is the left side (team 0), seat 1 the right side (team 1). */
  seats: [SeatInfo | null, SeatInfo | null];
}

/** An open room in the lobby list. */
export interface OpenRoom {
  code: string;
  host: string;
  /** Seconds since the room was opened. */
  age: number;
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
      /** Session token from an earlier welcome (reconnect). */
      token?: string;
      /** The client still shows a battle in progress (it may have missed how it ended). */
      battle?: boolean;
      /** The app is in the background right now (a reconnect from a hidden tab). */
      away?: boolean;
    }
  | { type: 'name'; name: string }
  | { type: 'watchRooms'; on: boolean }
  | { type: 'host' }
  | { type: 'join'; code: string }
  | { type: 'ready'; ready: boolean }
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
  | { type: 'rooms'; rooms: OpenRoom[] }
  | { type: 'room'; room: RoomInfo; seat: Team }
  | { type: 'left' }
  | { type: 'start'; seed: number; seat: Team; names: [string, string]; countdown: number }
  | { type: 'turn'; tick: number; cmds?: ScheduledCommand[]; hash?: [number, number] }
  | {
      type: 'snapshot';
      tick: number;
      world: WorldSnapshot;
      seat: Team;
      names: [string, string];
      paused: PauseState | null;
      /** Seconds left of a start / resume countdown (0 = none). */
      countdown?: number;
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
