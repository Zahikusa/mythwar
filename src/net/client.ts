import { simFingerprint } from '../sim/fingerprint.ts';
import type { Team } from '../sim/types.ts';
import type { TrialId } from '../sim/data.ts';
import { Connection } from './connection.ts';
import type { ConnState, SocketLike } from './connection.ts';
import { NetGame } from './netgame.ts';
import { PROTOCOL_VERSION, cleanName } from './protocol.ts';
import type { EmoteId, ErrorCode, OpenRoom, RoomInfo, ServerMsg } from './protocol.ts';

export interface MpClientOptions {
  name: string;
  url?: string;
  socket?: (url: string) => SocketLike;
  /** Where the session token lives (per tab, so two tabs are two players). */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
}

export interface MpListener {
  /** Anything about the connection, room or lobby list changed. */
  changed?(): void;
  /** A battle starts (or is rejoined after a reload). */
  battle?(game: NetGame): void;
  error?(code: ErrorCode, message: string): void;
  /** The opponent sent a quick message. */
  emote?(seat: Team, id: EmoteId): void;
}

const TOKEN_KEY = 'mythwar.mp.session';

/**
 * The multiplayer session as the UI sees it: connection state, our room and seat, the list of
 * open rooms on this server, and the battle in progress.
 */
export class MpClient {
  readonly conn: Connection;
  name: string;
  room: RoomInfo | null = null;
  seat: Team | null = null;
  openRooms: OpenRoom[] = [];
  game: NetGame | null = null;
  /** Set once the server has greeted us (and after every reconnect). */
  welcomed = false;
  /** The server no longer knows our room: 'restart' (it forgot us) or 'expired' (away too long). */
  sessionLost: 'restart' | 'expired' | null = null;
  /** This session was taken over by another tab or device. */
  replaced = false;
  /** The server runs another version of the game: no point reconnecting until a reload. */
  versionMismatch = false;
  /** Addresses the server says other devices can reach the game at. */
  lanUrls: string[] = [];
  private token: string | null;
  private watching = false;
  /** We left a room while offline: tell the server on reconnect, and ignore that battle. */
  private leaving = false;
  private readonly listeners = new Set<MpListener>();
  private readonly storage: MpClientOptions['storage'];
  private readonly now: () => number;

  constructor(opts: MpClientOptions) {
    this.name = cleanName(opts.name);
    this.storage = opts.storage === undefined ? safeSessionStorage() : opts.storage;
    this.now = opts.now ?? (() => performance.now());
    this.token = this.storage?.getItem(TOKEN_KEY) ?? null;
    this.conn = new Connection({
      url: opts.url,
      socket: opts.socket,
      now: this.now,
      hello: () => ({
        type: 'hello',
        v: PROTOCOL_VERSION,
        sim: simFingerprint(),
        name: this.name,
        token: this.token ?? undefined,
        battle: !!this.game && !this.game.over,
        away: typeof document !== 'undefined' && document.hidden,
      }),
    });
    this.conn.onMessage = (m, at) => this.onMessage(m, at);
    this.conn.onState = (s) => this.onState(s);
    this.conn.onRefused = (code) => {
      // 4001: another tab took over this session; 4000: a different game version.
      if (code === 4001) this.replaced = true;
      else this.versionMismatch = true;
      if (this.game && !this.game.over) this.game.abandon();
      this.emit((l) => l.changed?.());
    };
  }

  get state(): ConnState {
    return this.conn.state;
  }

  listen(l: MpListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  start(): void {
    // A duplicated browser tab inherits this tab's session token: if another open tab is
    // using it, start a fresh session instead of fighting over the seat.
    const token = this.token;
    if (!token || typeof BroadcastChannel === 'undefined') {
      this.answerTokenQueries();
      this.conn.open();
      return;
    }
    const ch = new BroadcastChannel('mythwar.mp');
    ch.onmessage = (e) => {
      if (e.data?.taken === token) {
        this.token = null;
        this.storage?.removeItem(TOKEN_KEY);
      }
    };
    ch.postMessage({ ask: token });
    setTimeout(() => {
      ch.close();
      this.answerTokenQueries();
      this.conn.open();
    }, 150);
  }

  /** Tells newly opened (duplicated) tabs that our session token is in use. */
  private answerTokenQueries(): void {
    if (typeof BroadcastChannel === 'undefined' || this.tokenChannel) return;
    this.tokenChannel = new BroadcastChannel('mythwar.mp');
    this.tokenChannel.onmessage = (e) => {
      if (this.token && e.data?.ask === this.token && this.conn.state !== 'offline') this.tokenChannel?.postMessage({ taken: this.token });
    };
  }

  private tokenChannel: BroadcastChannel | null = null;

  /** Disconnects for good (leaving the multiplayer screens). */
  stop(): void {
    this.tokenChannel?.close();
    this.tokenChannel = null;
    this.conn.close();
    this.welcomed = false;
  }

  /** Forgets the session (this tab won't try to rejoin a room after a reload). */
  forget(): void {
    this.token = null;
    this.storage?.removeItem(TOKEN_KEY);
  }

  setName(name: string): void {
    this.name = cleanName(name);
    this.conn.send({ type: 'name', name: this.name });
  }

  watchRooms(on: boolean): void {
    this.watching = on;
    this.conn.send({ type: 'watchRooms', on });
  }

  host(): void {
    this.conn.send({ type: 'host' });
  }

  join(code: string): void {
    this.conn.send({ type: 'join', code });
  }

  ready(ready: boolean): void {
    if (!this.conn.send({ type: 'ready', ready })) return;
    // Show it right away; the server's room update confirms (or corrects) it.
    const mine = this.seat !== null ? this.room?.seats[this.seat] : null;
    if (mine) {
      mine.ready = ready;
      this.emit((l) => l.changed?.());
    }
  }

  /** This player's own handicaps for the next battle (shown to both; un-readies both seats). */
  setTrials(trials: TrialId[]): void {
    if (!this.conn.send({ type: 'trials', trials })) return;
    const mine = this.seat !== null ? this.room?.seats[this.seat] : null;
    if (mine) {
      mine.trials = trials;
      this.emit((l) => l.changed?.());
    }
  }

  leave(): void {
    // Offline: the server still seats us; say it as soon as we're back.
    this.leaving = !this.conn.send({ type: 'leave' });
    this.room = null;
    this.seat = null;
    if (this.game && !this.game.over) this.game.abandon();
    this.emit((l) => l.changed?.());
  }

  pause(): void {
    this.conn.send({ type: 'pause' });
  }

  resume(): void {
    this.conn.send({ type: 'resume' });
  }

  emote(id: EmoteId): boolean {
    return this.conn.send({ type: 'emote', id });
  }

  /** Take the win: the opponent has been away too long (the server checks). */
  claim(): void {
    this.conn.send({ type: 'claim' });
  }

  /** The app went to the background (or came back). */
  away(away: boolean): void {
    if (!this.game || this.game.over) return;
    if (!away) this.conn.nudge();
    this.conn.send({ type: 'away', away });
  }

  private onMessage(msg: ServerMsg, at: number): void {
    switch (msg.type) {
      case 'welcome': {
        const hadRoom = this.room !== null;
        this.welcomed = true;
        this.token = msg.token;
        this.storage?.setItem(TOKEN_KEY, msg.token);
        this.lanUrls = Array.isArray(msg.lan) ? msg.lan : [];
        if (this.leaving) {
          // We left while offline: make it so (any battle that follows is ignored until 'left').
          this.conn.send({ type: 'leave' });
          if (this.watching) this.conn.send({ type: 'watchRooms', on: true });
          break;
        }
        this.room = msg.room;
        this.seat = msg.seat;
        // We thought we were in a room but the server doesn't seat us any more.
        this.sessionLost = hadRoom && !msg.room ? (msg.resumed ? 'expired' : 'restart') : null;
        // (A battle that ended meanwhile is replayed to us by the server; a restart lost it.)
        if (this.sessionLost === 'restart' && this.game && !this.game.over) this.game.abandon();
        if (this.watching) this.conn.send({ type: 'watchRooms', on: true });
        break;
      }
      case 'room':
        if (this.leaving) return;
        this.room = msg.room;
        this.seat = msg.seat;
        this.sessionLost = null;
        break;
      case 'rooms':
        this.openRooms = msg.rooms;
        break;
      case 'left':
        this.leaving = false;
        this.room = null;
        this.seat = null;
        break;
      case 'start':
        if (this.leaving) return;
        this.startGame(new NetGame({ seat: msg.seat, names: msg.names, seed: msg.seed, countdown: msg.countdown, trials: msg.trials, send: (m) => this.conn.send(m), now: this.now }));
        return;
      case 'snapshot':
        if (this.leaving) return;
        if (this.game && !this.game.over && this.game.seat === msg.seat) this.game.receive(msg, at);
        else this.startGame(new NetGame({ seat: msg.seat, names: msg.names, snapshot: msg, send: (m) => this.conn.send(m), now: this.now }));
        return;
      case 'turn':
      case 'paused':
      case 'resuming':
      case 'resumed':
      case 'over':
        this.game?.receive(msg, at);
        if (msg.type === 'turn') return;
        break;
      case 'error':
        if (msg.code === 'version') {
          this.versionMismatch = true;
          this.conn.close();
        }
        this.emit((l) => l.error?.(msg.code, msg.message));
        this.emit((l) => l.changed?.());
        return;
      case 'pong':
        return;
      case 'emote':
        this.emit((l) => l.emote?.(msg.seat, msg.id));
        return;
    }
    this.emit((l) => l.changed?.());
  }

  private startGame(game: NetGame): void {
    if (this.game && !this.game.over) this.game.abandon();
    this.game = game;
    game.online = this.conn.state === 'online';
    this.emit((l) => l.battle?.(game));
    this.emit((l) => l.changed?.());
  }

  private onState(s: ConnState): void {
    if (s !== 'online') this.welcomed = false;
    if (this.game) this.game.online = s === 'online';
    this.emit((l) => l.changed?.());
  }

  private emit(fn: (l: MpListener) => void): void {
    for (const l of [...this.listeners]) fn(l);
  }
}

/** This tab was in a multiplayer session before (a reload): it may still have a room or battle. */
export function hasStoredSession(): boolean {
  return !!safeSessionStorage()?.getItem(TOKEN_KEY);
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}
