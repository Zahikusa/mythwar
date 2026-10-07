import { simFingerprint } from '../sim/fingerprint.ts';
import type { Team } from '../sim/types.ts';
import { Connection } from './connection.ts';
import type { ConnState, SocketLike } from './connection.ts';
import { NetGame } from './netgame.ts';
import { PROTOCOL_VERSION, cleanName } from './protocol.ts';
import type { ErrorCode, OpenRoom, RoomInfo, ServerMsg } from './protocol.ts';

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
  /** The server dropped our session (e.g. it restarted). */
  sessionLost = false;
  /** The server runs another version of the game: no point reconnecting until a reload. */
  versionMismatch = false;
  /** Addresses the server says other devices can reach the game at. */
  lanUrls: string[] = [];
  private token: string | null;
  private watching = false;
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
      hello: () => ({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint(), name: this.name, token: this.token ?? undefined }),
    });
    this.conn.onMessage = (m, at) => this.onMessage(m, at);
    this.conn.onState = (s) => this.onState(s);
  }

  get state(): ConnState {
    return this.conn.state;
  }

  listen(l: MpListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  start(): void {
    this.conn.open();
  }

  /** Disconnects for good (leaving the multiplayer screens). */
  stop(): void {
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

  leave(): void {
    this.conn.send({ type: 'leave' });
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
        this.room = msg.room;
        this.seat = msg.seat;
        this.lanUrls = Array.isArray(msg.lan) ? msg.lan : [];
        // We thought we were in a room but the server doesn't know us (it restarted).
        this.sessionLost = hadRoom && !msg.room;
        if (this.sessionLost && this.game && !this.game.over) this.game.abandon();
        if (this.watching) this.conn.send({ type: 'watchRooms', on: true });
        break;
      }
      case 'room':
        this.room = msg.room;
        this.seat = msg.seat;
        this.sessionLost = false;
        break;
      case 'rooms':
        this.openRooms = msg.rooms;
        break;
      case 'left':
        this.room = null;
        this.seat = null;
        break;
      case 'start':
        this.startGame(new NetGame({ seat: msg.seat, names: msg.names, seed: msg.seed, countdown: msg.countdown, send: (m) => this.conn.send(m), now: this.now }));
        return;
      case 'snapshot':
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
