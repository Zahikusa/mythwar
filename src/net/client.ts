import { simFingerprint } from '../sim/fingerprint.ts';
import type { Team } from '../sim/types.ts';
import type { TrialId } from '../sim/data.ts';
import type { Difficulty } from '../ai/ai.ts';
import { Connection } from './connection.ts';
import type { ConnState, SocketLike } from './connection.ts';
import { NetGame } from './netgame.ts';
import { PROTOCOL_VERSION, cleanName, cleanRank, cleanSigil } from './protocol.ts';
import type { EmoteId, ErrorCode, HallEntry, OpenRoom, RoomInfo, ServerMsg } from './protocol.ts';

export interface MpClientOptions {
  name: string;
  /** The player's standing (RANKS index). */
  rank?: number;
  /** The player's sigil (SIGILS index, -1 = none). */
  sigil?: number;
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
  rank: number;
  sigil: number;
  room: RoomInfo | null = null;
  seat: Team | null = null;
  openRooms: OpenRoom[] = [];
  /** This network's Hall of champions (best first). */
  hall: HallEntry[] = [];
  game: NetGame | null = null;
  /** Set once the server has greeted us (and after every reconnect). */
  welcomed = false;
  /** The server no longer knows our room: 'restart' (it forgot us) or 'expired' (away too long). */
  sessionLost: 'restart' | 'expired' | 'fault' | null = null;
  /** With `sessionLost`: the code of the room we were in. */
  lostRoom: string | null = null;
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
    this.rank = cleanRank(opts.rank);
    this.sigil = cleanSigil(opts.sigil);
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
        rank: this.rank,
        sigil: this.sigil,
        device: deviceId(),
        token: this.token ?? undefined,
        battle: !!this.game && !this.game.over,
        away: typeof document !== 'undefined' && document.hidden,
      }),
    });
    this.conn.onMessage = (m, at) => this.onMessage(m, at);
    this.conn.onState = (s) => this.onState(s);
    this.conn.onRefused = (code) => {
      // 4001: another tab took over this session; 4000: a different game version.
      this.refused(code === 4001);
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
    this.conn.send({ type: 'name', name: this.name, rank: this.rank, sigil: this.sigil });
  }

  /** The player's standing or sigil changed since the lobby was last opened. */
  setIdentity(rank: number, sigil: number): void {
    if (cleanRank(rank) === this.rank && cleanSigil(sigil) === this.sigil) return;
    this.rank = cleanRank(rank);
    this.sigil = cleanSigil(sigil);
    this.conn.send({ type: 'name', name: this.name, rank: this.rank, sigil: this.sigil });
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
    if (!this.conn.send({ type: 'ready', ready, rev: this.room?.rev })) return;
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
      this.termsChanged();
      this.emit((l) => l.changed?.());
    }
  }

  /** Versus (null) or co-op against an AI of this difficulty. */
  setCoop(coop: Difficulty | null): void {
    if (!this.conn.send({ type: 'coop', coop })) return;
    if (this.room) {
      if (coop !== this.room.coop) this.termsChanged();
      this.room.coop = coop;
      this.emit((l) => l.changed?.());
    }
  }

  /**
   * The server counts each change of a room's terms (`rev`; a Ready for older terms is stale). A
   * Ready pressed right after our own change — before the server's word on it is back — must
   * carry the count our change makes: TCP delivers the change first.
   */
  private termsChanged(): void {
    const room = this.room;
    if (room && (room.phase === 'waiting' || room.phase === 'over')) room.rev++;
  }

  leave(): void {
    // Until the server says 'left', room news and battle starts already on their way are about
    // the room we left: ignored. (Offline the server still seats us: we say it once we're back.)
    this.leaving = true;
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

  emote(id: EmoteId): boolean {
    return this.conn.send({ type: 'emote', id });
  }

  /** Take the win: the opponent has been away too long (the server checks). */
  claim(): void {
    this.conn.send({ type: 'claim' });
  }

  /** The app went to the background (or came back). */
  away(away: boolean): void {
    // Back on the page — in a battle, the room or the lobby: a link that went quiet while the
    // phone slept is redialled now, not after the silence limit. (Outside a battle only once a
    // ping has gone unanswered: a short app switch mustn't drop the room's Ready — backlog 264.)
    const inBattle = !!this.game && !this.game.over;
    if (!away) {
      if (inBattle) this.conn.nudge();
      else this.conn.probe();
    }
    if (!inBattle) return;
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
        const had = this.room?.code ?? null;
        this.room = msg.room;
        this.seat = msg.seat;
        // We thought we were in a room but the server doesn't seat us any more.
        this.sessionLost = hadRoom && !msg.room ? (msg.resumed ? 'expired' : this.conn.lastClose === 4002 ? 'fault' : 'restart') : null;
        this.lostRoom = this.sessionLost ? had : null;
        // (A battle that ended meanwhile is replayed to us by the server; a restart lost it.)
        if ((this.sessionLost === 'restart' || this.sessionLost === 'fault') && this.game && !this.game.over) this.game.abandon();
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
        this.hall = msg.hall ?? [];
        break;
      case 'left':
        this.leaving = false;
        this.room = null;
        this.seat = null;
        break;
      case 'start':
        if (this.leaving) return;
        this.startGame(new NetGame({ seat: msg.seat, names: msg.names, seed: msg.seed, countdown: msg.countdown, trials: msg.trials, coop: msg.coop, send: (m) => this.conn.send(m), now: this.now }));
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
          this.refused(false);
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

  /**
   * This page won't hear from the server again (another tab took over, or it runs another
   * version): no battle or room is left to wait for — the lobby says why and to reload.
   */
  private refused(replaced: boolean): void {
    if (replaced) this.replaced = true;
    else this.versionMismatch = true;
    if (this.game && !this.game.over) this.game.abandon();
    this.room = null;
    this.seat = null;
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

const DEVICE_KEY = 'mythwar.device';

/** This browser's random id for the Hall of champions (made once, kept in localStorage). */
function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[0-9a-f]{16,32}$/.test(id)) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return undefined; // (no storage: the hall falls back to the name)
  }
}

/** Gives this browser a new id from the next connection on (Settings → Reset records). */
export function forgetDevice(): void {
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    // (no storage, no id)
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}
