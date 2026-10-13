import { CODE_ALPHABET, CODE_LENGTH, EMOTES, PROTOCOL_VERSION, START_COUNTDOWN, cleanCode, cleanDevice, cleanName, cleanRank, cleanSigil, cleanTrials } from '../src/net/protocol.ts';
import type { ClientMsg, HallEntry, OpenRoom, RoomInfo, RoomPhase, ServerMsg } from '../src/net/protocol.ts';
import { createHash, randomBytes, scrypt, scryptSync } from 'node:crypto';
import type { ServerStore } from './store.ts';
import type { TrialId } from '../src/sim/data.ts';
import { DIFFICULTIES } from '../src/ai/ai.ts';
import type { Difficulty } from '../src/ai/ai.ts';
import type { Team } from '../src/sim/types.ts';
import { simFingerprint } from '../src/sim/fingerprint.ts';
import { Match } from './match.ts';
import { validateCommand } from './validate.ts';

/** A client connection, as far as the lobby is concerned (a WebSocket in production). */
export interface Conn {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface LobbyOptions {
  /** Wall clock in ms (injectable for tests). */
  now?: () => number;
  random?: () => number;
  /** Ticks per turn message. */
  turnTicks?: number;
  /** Seconds a player may be away mid-battle before forfeiting. */
  awayGrace?: number;
  /** Seconds before a battle starts. */
  countdown?: number;
  /** Seconds a player must have been away before the other may claim the win. */
  claimAfter?: number;
  log?: (line: string) => void;
  /** Where other devices in the network can open the game (shown as invite link / QR code). */
  lanUrls?: () => string[];
  /** Server-wide limits (defaults suit a small public server). */
  maxRooms?: number;
  maxSessions?: number;
  /** Where the Hall of champions survives restarts (none: kept in memory only). */
  store?: ServerStore;
  /**
   * Words no player name may contain (case-insensitive; a name with one becomes "Player"). For a
   * public server, where strangers see each other's names (`--names <file>`, one word per line).
   */
  blockedWords?: string[];
  /** Today as a day number (injectable for tests; default: localDay()). */
  today?: () => number;
  /** Hall keys kept at hand (default HALL_KEYS_MAX; small in tests). */
  hallKeysMax?: number;
  /** The slow hash behind a public network's hall key (tests pass a fast one; default scrypt). */
  hallHash?: (network: string, salt: string) => string;
}

/**
 * A word as the name blocklist compares it: compatibility-decomposed with accents dropped (so
 * full-width "ｂａｄ" and "bäd" are "bad"), lower case, letters and digits only (so "b.a.d" and
 * "b a d" are too).
 */
export function flatWord(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Today as a day number in the server's own calendar (local midnight, not UTC: a European
 * evening running past 01:00 is still one evening).
 */
export function localDay(at = new Date()): number {
  return Math.floor((at.getTime() - at.getTimezoneOffset() * 60_000) / 86_400_000);
}

/** The Hall of champions is saved at most this often (ms) when it changed. */
const SAVE_EVERY = 5000;

/** Seconds a disconnected player keeps their seat in a room that isn't fighting. */
const SEAT_GRACE = 60;
/** Seconds a session without connection and room is remembered (reconnect token). */
const SESSION_TTL = 10 * 60;
/** Commands per second a player may send (a human manages a handful). */
const CMD_RATE = 25;
/** Server-wide limits (a public server must not be exhausted by one script). */
const MAX_ROOMS = 2000;
const MAX_SESSIONS = 10000;
/** Per public address / IPv6 /64 (LAN addresses are exempt). */
const MAX_SESSIONS_PER_ADDRESS = 64;
const MAX_ROOMS_PER_ADDRESS = 8;
/** Hall of champions: names kept per network, networks kept, entries shown. */
const HALL_NAMES = 64;
const HALL_NETWORKS = 256;
const HALL_SHOWN = 5;
/** Networks whose hall key (a slow hash each) is kept at hand. */
const HALL_KEYS_MAX = 4096;
/** Open-battle lists go out at most this often (ms). */
const ROOM_LIST_EVERY = 250;
/** Minimum ms between two emotes from one player. */
const EMOTE_GAP = 1500;
/** Minimum ms between two away/back changes from one player (more are coalesced, not dropped). */
const AWAY_GAP = 250;
const MSG_RATE = 120;

interface Session {
  token: string;
  name: string;
  /** Standing (RANKS index), as the client declares it. */
  rank: number;
  /** Sigil (SIGILS index, -1 = none). */
  sigil: number;
  /** The browser's own id ('' = none sent): how the Hall of champions knows this player. */
  device: string;
  conn: Conn | null;
  room: Room | null;
  seat: Team | null;
  watching: boolean;
  /** When the connection dropped (null while connected). */
  goneAt: number | null;
  /** The client's network (see networkOf): the open-battles list only shows rooms from it. */
  network: string;
  /** Key for per-address quotas ('' = exempt: a local-network client). */
  quota: string;
  /** When the session last sent an emote (rate limit). */
  lastEmote: number;
  /** When this player's away/back last took effect, and a change waiting for AWAY_GAP. */
  awayAt: number;
  awayWanted: boolean | null;
  /** The client's own round-trip measurement (ms). */
  rtt: number;
  /** How the session's last battle ended (final snapshot + result), for a client that missed it. */
  lastOver: { snapshot: ServerMsg; over: ServerMsg } | null;
}

interface Seat {
  session: Session;
  ready: boolean;
  wins: number;
  trials: TrialId[];
}

interface Room {
  code: string;
  createdAt: number;
  phase: RoomPhase;
  seats: [Seat | null, Seat | null];
  match: Match | null;
  /** Co-op against this AI (null = the two players fight each other). */
  coop: Difficulty | null;
  /** Changes to the terms (see RoomInfo.rev). */
  rev: number;
}

/**
 * Rooms, seats and sessions: everything between "a socket connected" and "a battle runs".
 * Transport-agnostic and clock-injectable, so tests can drive it directly.
 */
export class Lobby {
  private readonly sessions = new Map<string, Session>();
  private readonly rooms = new Map<string, Room>();
  /** Hall of champions per network (most recently active last). */
  private readonly halls = new Map<string, Map<string, HallEntry>>();
  private hallDirty = false;
  /** Salt for the halls' network keys (kept with them; see hallKey). */
  private hallSalt = randomBytes(16).toString('hex');
  /** Hall keys of the networks seen (see hallKey: each costs a slow hash once). */
  private readonly hallKeys = new Map<string, string>();
  private readonly hallKeyPending = new Set<string>();
  /** Players with an away/back change waiting (see AWAY_GAP). */
  private readonly awayWaiting = new Set<Session>();
  private lastHallSave = -Infinity;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly opts: LobbyOptions;
  private roomsDirty = false;
  private lastRoomList = -Infinity;
  private lastSweep = -Infinity;

  constructor(opts: LobbyOptions = {}) {
    this.opts = opts;
    this.now = opts.now ?? (() => performance.now());
    this.random = opts.random ?? Math.random;
    this.loadHalls();
  }

  /** A player's name as others will see it: sanitized, and not one with a blocked word in it. */
  private playerName(raw: unknown): string {
    const name = cleanName(raw);
    const words = this.opts.blockedWords;
    if (!words?.length) return name;
    const flat = flatWord(name);
    return words.some((w) => {
      const f = flatWord(w);
      return f && flat.includes(f);
    })
      ? 'Player'
      : name;
  }

  /** Restores the Hall of champions from the store (sanitized: the file may be hand-edited). */
  private loadHalls(): void {
    const state = this.opts.store?.load();
    if (!state) return;
    if (typeof state.salt === 'string' && state.salt.length >= 16) this.hallSalt = state.salt;
    const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    for (const [network, entries] of Object.entries(state.halls).slice(-HALL_NETWORKS)) {
      if (!Array.isArray(entries)) continue;
      const hall = new Map<string, HallEntry>();
      for (const e of entries.slice(-HALL_NAMES)) {
        if (!e || typeof e !== 'object') continue;
        // (A name saved before a blocklist was set is checked like a new one.)
        const name = this.playerName(e.name);
        const key = typeof e.key === 'string' && /^d:[\w-]{22}$/.test(e.key) ? e.key : name.toLowerCase();
        hall.set(key, { name, sigil: cleanSigil(e.sigil), w: n(e.w), l: n(e.l), coop: n(e.coop), days: n(e.days), last: n(e.last), key });
      }
      if (hall.size) this.halls.set(network, hall);
    }
  }

  /**
   * Saves the Hall of champions if it changed — in the background, or (`final`, on shutdown)
   * before returning.
   */
  flush(final = false): void {
    // (On shutdown always: a background save may still be under way, and exiting cuts it off.)
    if (!this.opts.store || (!this.hallDirty && !(final && this.halls.size))) return;
    this.hallDirty = false;
    this.lastHallSave = this.now();
    const halls: Record<string, HallEntry[]> = {};
    for (const [network, hall] of this.halls) halls[network] = [...hall.values()];
    const state = { v: 1 as const, salt: this.hallSalt, halls };
    if (final && this.opts.store.saveNow) this.opts.store.saveNow(state);
    else this.opts.store.save(state);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** A new connection. Returns the handlers the transport calls for its messages and close. */
  /**
   * `network`: see networkOf; `quota`: the key per-address limits count against ('' = none, for
   * trusted local-network clients).
   */
  connect(conn: Conn, network = 'lan', quota = ''): { message: (data: string) => void; close: () => void } {
    this.warmHallKey(network);
    let session: Session | null = null;
    const rate = { start: this.now(), msgs: 0, cmds: 0 };
    return {
      message: (data) => {
        let msg: ClientMsg;
        try {
          msg = JSON.parse(data) as ClientMsg;
        } catch {
          return this.error(conn, 'bad-request', 'Not JSON');
        }
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return this.error(conn, 'bad-request', 'Bad message');
        const now = this.now();
        if (now - rate.start >= 1000) {
          rate.start = now;
          rate.msgs = 0;
          rate.cmds = 0;
        }
        if (++rate.msgs > MSG_RATE) return;
        // (A fault while handling one message — a bug, whatever the input — is logged and that
        // message dropped; thrown on, it would end the process and every battle in it.)
        try {
          if (msg.type === 'hello') {
            if (session) return;
            session = this.hello(conn, msg, network, quota);
            return;
          }
          if (!session || session.conn !== conn) return this.error(conn, 'bad-request', 'Say hello first');
          if (msg.type === 'cmd' && ++rate.cmds > CMD_RATE) return this.error(conn, 'rate', 'Too many commands');
          this.handle(session, msg);
        } catch (e) {
          this.fault(`error handling "${msg.type}" from ${session?.name ?? 'a new connection'}: ${(e as Error)?.stack ?? e}`);
        }
      },
      close: () => {
        if (session && session.conn === conn) this.disconnected(session);
      },
    };
  }

  /** Drives matches and expiries; call every few milliseconds. */
  update(): void {
    const now = this.now();
    for (const s of this.awayWaiting) if (now - s.awayAt >= AWAY_GAP && s.awayWanted !== null) this.applyAway(s, s.awayWanted, now);
    for (const room of this.rooms.values()) {
      try {
        room.match?.update(now);
      } catch (e) {
        this.matchFault(room, e);
        continue;
      }
      if (room.phase !== 'playing') {
        for (const seat of [0, 1] as Team[]) {
          const s = room.seats[seat];
          if (s && s.session.goneAt !== null && now - s.session.goneAt > SEAT_GRACE * 1000) this.removeFromRoom(s.session);
        }
      }
    }
    if (this.hallDirty && now - this.lastHallSave >= SAVE_EVERY) this.flush();
    if (now - this.lastSweep > 1000) {
      this.lastSweep = now;
      for (const s of this.sessions.values()) {
        if (s.conn === null && s.room === null && s.goneAt !== null && now - s.goneAt > SESSION_TTL * 1000) this.sessions.delete(s.token);
      }
    }
    if (this.roomsDirty && now - this.lastRoomList >= ROOM_LIST_EVERY) {
      this.lastRoomList = now;
      this.sendRoomLists();
    }
  }

  /** A player's away/back takes effect (see 'away'). */
  private applyAway(s: Session, away: boolean, now: number): void {
    s.awayAt = now;
    s.awayWanted = null;
    this.awayWaiting.delete(s);
    const room = s.room;
    if (!room?.match || s.seat === null || room.phase !== 'playing') return;
    room.match.setAway(s.seat, away, now);
    this.broadcastRoom(room);
  }

  /**
   * A battle threw (a bug in some rare state): it alone stops, the server and every other battle
   * go on. Its players are forgotten as after a restart — their pages drop the battle and say so
   * in the lobby (no result counts).
   */
  private matchFault(room: Room, e: unknown): void {
    this.fault(`the battle in room ${room.code} was stopped by a fault: ${(e as Error)?.stack ?? e}`);
    this.rooms.delete(room.code);
    this.roomsDirty = true;
    for (const x of room.seats) {
      if (!x) continue;
      const s = x.session;
      s.room = null;
      s.seat = null;
      s.lastOver = null;
      this.sessions.delete(s.token);
      const conn = s.conn;
      s.conn = null;
      // (4002: the page then knows why the server no longer knows it.)
      conn?.close(4002, 'fault');
    }
  }

  // -------------------------------------------------------------------------

  private hello(conn: Conn, msg: Extract<ClientMsg, { type: 'hello' }>, network: string, quota: string): Session | null {
    if (msg.v !== PROTOCOL_VERSION || msg.sim !== simFingerprint()) {
      this.error(conn, 'version', 'This page and the game server are different versions — reload the page (or restart the server).');
      conn.close(4000, 'version');
      this.log(`refused ${cleanName(msg.name)}: different game version (reload the page)`);
      return null;
    }
    let s = typeof msg.token === 'string' ? this.sessions.get(msg.token) : undefined;
    const resumed = !!s;
    if (s) {
      // Same player again (reconnect, or a second tab taking over).
      if (s.conn && s.conn !== conn) {
        this.sendTo(s.conn, { type: 'error', code: 'bad-request', message: 'Connected from another tab' });
        s.conn.close(4001, 'replaced');
      }
      s.conn = conn;
      s.goneAt = null;
      s.network = network;
      // (Held away/back changes belong to the old link.)
      s.awayWanted = null;
      this.awayWaiting.delete(s);
      if (msg.name !== undefined) s.name = this.playerName(msg.name);
      if (msg.rank !== undefined) s.rank = cleanRank(msg.rank);
      if (msg.sigil !== undefined) s.sigil = cleanSigil(msg.sigil);
      if (msg.device !== undefined) s.device = cleanDevice(msg.device);
    } else {
      // Full (overall, or for this address): make room by forgetting the oldest idle session.
      const max = this.opts.maxSessions ?? MAX_SESSIONS;
      const ofQuota = () => (quota ? [...this.sessions.values()].filter((x) => x.quota === quota) : []);
      if (quota && ofQuota().length >= MAX_SESSIONS_PER_ADDRESS) this.evictIdle(ofQuota());
      if (this.sessions.size >= max) this.evictIdle([...this.sessions.values()]);
      if (this.sessions.size >= max || (quota !== '' && ofQuota().length >= MAX_SESSIONS_PER_ADDRESS)) {
        this.error(conn, 'rate', 'The server is full right now — try again in a minute.');
        conn.close(1013, 'full');
        return null;
      }
      s = {
        token: this.makeToken(),
        name: this.playerName(msg.name),
        rank: cleanRank(msg.rank),
        sigil: cleanSigil(msg.sigil),
        device: cleanDevice(msg.device),
        conn,
        room: null,
        seat: null,
        watching: false,
        goneAt: null,
        network,
        quota,
        lastEmote: -Infinity,
        awayAt: -Infinity,
        awayWanted: null,
        rtt: 0,
        lastOver: null,
      };
      this.sessions.set(s.token, s);
    }
    const room = s.room;
    this.send(s, { type: 'welcome', v: PROTOCOL_VERSION, token: s.token, room: room ? this.info(room) : null, seat: s.seat, lan: this.opts.lanUrls?.() ?? [], resumed });
    const m = room?.match;
    if (room && s.seat !== null && m && room.phase === 'playing') {
      this.send(s, m.snapshotFor(s.seat, this.now()));
      // (A tab reconnecting in the background is still away.)
      m.setAway(s.seat, msg.away === true, this.now());
    } else if (msg.battle && s.lastOver) {
      // The battle ended while this client was gone: show it how.
      this.send(s, s.lastOver.snapshot);
      this.send(s, s.lastOver.over);
    }
    if (room) this.broadcastRoom(room);
    this.log(`hello ${s.name}${room ? ` (back in ${room.code})` : ''}`);
    return s;
  }

  private handle(s: Session, msg: ClientMsg): void {
    const room = s.room;
    const seat = s.seat;
    const now = this.now();
    switch (msg.type) {
      case 'name':
        s.name = this.playerName(msg.name);
        if (msg.rank !== undefined) s.rank = cleanRank(msg.rank);
        if (msg.sigil !== undefined) s.sigil = cleanSigil(msg.sigil);
        if (room) {
          this.broadcastRoom(room);
          // (Only an open room's host name appears in the lists.)
          if (room.phase === 'waiting') this.roomsDirty = true;
        }
        return;
      case 'watchRooms':
        s.watching = !!msg.on;
        if (s.watching) this.send(s, { type: 'rooms', rooms: this.openRooms(s.network), hall: this.hallOf(s.network) });
        return;
      case 'host': {
        // Already waiting alone in an open room (a double tap): keep it.
        if (room && room.phase === 'waiting' && room.seats.filter((x) => x).length === 1) return this.broadcastRoom(room);
        const hostedHere = s.quota ? [...this.rooms.values()].filter((r) => r.seats.some((x) => x?.session.quota === s.quota)).length : 0;
        if (this.rooms.size >= (this.opts.maxRooms ?? MAX_ROOMS) || hostedHere >= MAX_ROOMS_PER_ADDRESS) return this.error(s.conn, 'rate', 'The server is full right now — try again in a minute.');
        if (room) this.removeFromRoom(s);
        const r: Room = { code: this.makeCode(), createdAt: now, phase: 'waiting', seats: [null, null], match: null, coop: null, rev: 0 };
        this.rooms.set(r.code, r);
        this.seat(s, r, 0);
        this.log(`${s.name} opened room ${r.code}`);
        return;
      }
      case 'join': {
        const code = cleanCode(msg.code);
        const r = code ? this.rooms.get(code) : undefined;
        if (!r) return this.error(s.conn, 'no-room', 'No battle with that code here.');
        if (r === room) return this.broadcastRoom(r);
        const free = r.seats[0] === null ? 0 : r.seats[1] === null ? 1 : -1;
        // The same device back in a new tab (a phone that dropped the page, a re-scanned QR): its
        // own seat, left without a connection, is its to take back — score and handicaps kept.
        // (Whether or not the other seat is free: a host whose page dropped must not end up as
        // their own guest. Mid-battle too: Android's Back closes a tab opened from a QR code, and
        // its session — kept in that tab — goes with it; scanning again picks the battle up.)
        const own = s.device ? ([0, 1] as Team[]).find((i) => !!r.seats[i] && r.seats[i]!.session !== s && r.seats[i]!.session.conn === null && r.seats[i]!.session.device === s.device) : undefined;
        if (own !== undefined) {
          if (room) this.removeFromRoom(s);
          const old = r.seats[own]!;
          old.session.room = null;
          old.session.seat = null;
          r.seats[own] = { ...old, session: s, ready: false };
          s.room = r;
          s.seat = own;
          if (r.phase === 'over') r.phase = 'waiting';
          this.broadcastRoom(r);
          if (r.phase === 'playing' && r.match) {
            this.send(s, r.match.snapshotFor(own, this.now()));
            r.match.setAway(own, false, this.now());
            this.broadcastRoom(r); // (no longer away)
          }
          this.roomsDirty = true;
          this.log(`${s.name} took their seat in room ${r.code} back`);
          return;
        }
        if (free < 0 || r.phase === 'playing') return this.error(s.conn, 'room-full', 'That battle already has two players.');
        if (room) this.removeFromRoom(s);
        this.seat(s, r, free as Team);
        this.log(`${s.name} joined room ${r.code}`);
        return;
      }
      case 'leave':
        if (room) this.removeFromRoom(s);
        this.send(s, { type: 'left' });
        return;
      case 'trials': {
        if (!room || seat === null || (room.phase !== 'waiting' && room.phase !== 'over')) return;
        room.seats[seat]!.trials = cleanTrials(msg.trials);
        // Nobody starts against handicaps they haven't seen: a change takes both seats out of Ready.
        for (const x of room.seats) if (x) x.ready = false;
        room.rev++;
        this.broadcastRoom(room);
        return;
      }
      case 'coop': {
        if (!room || seat === null || (room.phase !== 'waiting' && room.phase !== 'over')) return;
        const coop = DIFFICULTIES.includes(msg.coop as Difficulty) ? (msg.coop as Difficulty) : null;
        if (coop === room.coop) return;
        room.coop = coop;
        room.rev++;
        // A different kind of battle: both confirm again, and the running score starts over.
        for (const x of room.seats) {
          if (!x) continue;
          x.ready = false;
          x.wins = 0;
        }
        this.broadcastRoom(room);
        return;
      }
      case 'ready': {
        if (!room || seat === null || (room.phase !== 'waiting' && room.phase !== 'over')) return;
        // A Ready sent before a change of terms reached this player is for terms they never saw.
        if (msg.ready && typeof msg.rev === 'number' && msg.rev !== room.rev) return this.broadcastRoom(room);
        room.seats[seat]!.ready = !!msg.ready;
        if (room.seats.every((x) => x && x.ready && x.session.conn)) this.startMatch(room);
        else this.broadcastRoom(room);
        return;
      }
      case 'cmd': {
        if (!room?.match || seat === null || room.phase !== 'playing') return;
        const cmd = validateCommand(msg.cmd);
        if (!cmd || !Number.isInteger(msg.seq)) return this.error(s.conn, 'bad-request', 'Bad command');
        room.match.command(seat, msg.seq, cmd);
        return;
      }
      case 'pause':
        if (room?.match && seat !== null && room.phase === 'playing') room.match.requestPause(seat, now);
        return;
      case 'resume':
        if (room?.match && seat !== null && room.phase === 'playing') room.match.requestResume(now);
        return;
      case 'away':
        if (room?.match && seat !== null && room.phase === 'playing') {
          // (Each change pauses or resumes both screens: a client flipping it many times a
          // second has the latest wish applied once AWAY_GAP has passed.)
          if (now - s.awayAt < AWAY_GAP) {
            s.awayWanted = !!msg.away;
            this.awayWaiting.add(s);
            return;
          }
          this.applyAway(s, !!msg.away, now);
        }
        return;
      case 'emote': {
        // Only in a room with an opponent, at most one every 1.5 s, and only known phrases.
        const id = msg.id;
        if (!room || seat === null || typeof id !== 'string' || !Object.hasOwn(EMOTES, id) || now - s.lastEmote < EMOTE_GAP) return;
        s.lastEmote = now;
        const other = room.seats[seat === 0 ? 1 : 0];
        if (other) this.send(other.session, { type: 'emote', seat, id });
        return;
      }
      case 'claim':
        if (room?.match && seat !== null && room.phase === 'playing') room.match.claim(seat, now);
        return;
      case 'resync':
        if (room?.match && seat !== null && room.phase === 'playing') this.send(s, room.match.snapshotFor(seat, now));
        return;
      case 'ping': {
        this.send(s, { type: 'pong', t: Number(msg.t) || 0, tick: room?.match?.tick ?? 0 });
        const rtt = Math.max(0, Math.min(9999, Math.round(Number(msg.rtt) || 0)));
        // Seats show each player's ping before a battle: refresh when it changes noticeably.
        const changed = Math.abs(rtt - s.rtt) > Math.max(5, s.rtt * 0.25);
        s.rtt = rtt;
        if (changed && room && room.phase !== 'playing') this.broadcastRoom(room);
        return;
      }
      default:
        this.error(s.conn, 'bad-request', 'Unknown message');
    }
  }

  private startMatch(room: Room): void {
    const [a, b] = room.seats as [Seat, Seat];
    a.ready = false;
    b.ready = false;
    const seed = (this.random() * 2 ** 31) | 0;
    const names: [string, string] = [this.nameIn(room, 0), this.nameIn(room, 1)];
    const countdown = this.opts.countdown ?? START_COUNTDOWN;
    const trials: [TrialId[], TrialId[]] = [[...a.trials], [...b.trials]];
    room.phase = 'playing';
    const coop = room.coop;
    room.match = new Match({ seed, names, countdown, trials, coop, turnTicks: this.opts.turnTicks, awayGrace: this.opts.awayGrace, claimAfter: this.opts.claimAfter }, this.now(), {
      broadcast: (msg) => {
        const text = JSON.stringify(msg);
        for (const s of room.seats) if (s?.session.conn) s.session.conn.send(text);
      },
      send: (seat, msg) => {
        const s = room.seats[seat];
        if (s) this.send(s.session, msg);
      },
      ended: (winner, reason) => {
        room.phase = 'over';
        const match = room.match;
        if (match) {
          for (const seat of [0, 1] as Team[]) {
            const x = room.seats[seat];
            if (x) x.session.lastOver = { snapshot: match.snapshotFor(seat, this.now()), over: { type: 'over', winner, reason, tick: match.tick } };
          }
        }
        // (Co-op: a victory counts for both allies; the AI's wins aren't kept.)
        // (Two tabs of one browser are one player to the Hall: a battle between them isn't
        // counted, and allies on one device share one co-op victory.)
        const sameDevice = !!room.seats[0]?.session.device && room.seats[0]?.session.device === room.seats[1]?.session.device;
        if (coop) {
          if (winner === 0)
            room.seats.forEach((x, i) => {
              if (!x) return;
              x.wins++;
              if (!(sameDevice && i === 1)) this.hallEntry(x.session).coop++;
            });
        } else {
          const w = room.seats[winner];
          const l = room.seats[winner === 0 ? 1 : 0];
          if (w) w.wins++;
          // (A battle abandoned by a server shutdown never gets here; a forfeit does count.)
          if (w && !sameDevice) this.hallEntry(w.session).w++;
          if (l && !sameDevice) this.hallEntry(l.session).l++;
        }
        this.roomsDirty = true;
        this.log(`room ${room.code}: ${coop ? (winner === 0 ? `${names.join(' & ')} beat the ${coop} AI` : `the ${coop} AI wins`) : `${names[winner]} wins`} (${reason})`);
        // (The 'over' message went out first; now the room with the new score.)
        this.broadcastRoom(room);
      },
    });
    for (const seat of [0, 1] as Team[]) {
      const s = room.seats[seat]!.session;
      s.lastOver = null;
      this.send(s, { type: 'start', seed, seat, names, countdown, trials, coop });
    }
    this.broadcastRoom(room);
    this.roomsDirty = true;
    this.log(`room ${room.code}: ${names[0]} vs ${names[1]} (seed ${seed})`);
  }

  private seat(s: Session, room: Room, seat: Team): void {
    room.seats[seat] = { session: s, ready: false, wins: 0, trials: [] };
    for (const other of room.seats) if (other) other.ready = false;
    room.rev++;
    s.room = room;
    s.seat = seat;
    if (room.phase === 'over') room.phase = 'waiting';
    this.broadcastRoom(room);
    this.roomsDirty = true;
  }

  private removeFromRoom(s: Session): void {
    const room = s.room;
    const seat = s.seat;
    s.room = null;
    s.seat = null;
    if (!room || seat === null) return;
    if (room.match && room.phase === 'playing') {
      room.match.forfeit(seat);
      // Co-op with an ally still in the battle: they play on alone; the room stays as it is.
      if (room.match.coop && room.seats[1 - seat] && room.phase === 'playing') {
        room.seats[seat] = null;
        this.broadcastRoom(room);
        this.roomsDirty = true;
        return;
      }
    }
    room.seats[seat] = null;
    room.match = null;
    room.phase = 'waiting';
    const other = room.seats[1 - seat];
    if (other) {
      other.ready = false;
      other.wins = 0;
      this.broadcastRoom(room);
    } else this.rooms.delete(room.code);
    this.roomsDirty = true;
  }

  private disconnected(s: Session): void {
    s.conn = null;
    // (An away/back change still held back — see AWAY_GAP — came from the link that just closed.)
    s.awayWanted = null;
    this.awayWaiting.delete(s);
    s.watching = false;
    s.goneAt = this.now();
    const room = s.room;
    if (room && s.seat !== null) {
      if (room.match && room.phase === 'playing') room.match.setAway(s.seat, true, this.now());
      const seat = room.seats[s.seat];
      if (seat) seat.ready = false;
      this.broadcastRoom(room);
      this.roomsDirty = true;
    }
    this.log(`${s.name} disconnected`);
  }

  private info(room: Room): RoomInfo {
    const seat = (i: Team) => {
      const x = room.seats[i];
      if (!x) return null;
      return { name: this.nameIn(room, i), connected: x.session.conn !== null, ready: x.ready, away: room.match?.isAway(i) ?? false, wins: x.wins, ping: x.session.rtt, trials: x.trials, rank: x.session.rank, sigil: x.session.sigil };
    };
    return { code: room.code, phase: room.phase, seats: [seat(0), seat(1)], coop: room.coop, rev: room.rev };
  }

  /** A seat's name as shown in its room: "Ada" vs "Ada" becomes "Ada" vs "Ada (2)". */
  private nameIn(room: Room, seat: Team): string {
    const name = room.seats[seat]?.session.name ?? '';
    const other = room.seats[seat === 0 ? 1 : 0]?.session.name;
    return seat === 1 && other !== undefined && other.toLowerCase() === name.toLowerCase() ? `${name} (2)` : name;
  }

  private broadcastRoom(room: Room): void {
    const info = this.info(room);
    for (const seat of [0, 1] as Team[]) {
      const s = room.seats[seat];
      if (s) this.send(s.session, { type: 'room', room: info, seat });
    }
  }

  private openRooms(network: string): OpenRoom[] {
    const now = this.now();
    const out: OpenRoom[] = [];
    for (const r of this.rooms.values()) {
      if (r.phase !== 'waiting') continue;
      const seated = r.seats.filter((x) => x !== null);
      if (seated.length !== 1 || !seated[0]!.session.conn || seated[0]!.session.network !== network) continue;
      out.push({ code: r.code, host: seated[0]!.session.name, rank: seated[0]!.session.rank, sigil: seated[0]!.session.sigil, age: Math.round((now - r.createdAt) / 1000) });
    }
    return out.sort((a, b) => a.age - b.age);
  }

  /** A player's line in their network's Hall of champions (created, and moved to most recent). */
  private hallEntry(s: Session): HallEntry {
    const net = this.hallKey(s.network);
    let hall = this.halls.get(net);
    if (hall) this.halls.delete(net);
    else hall = new Map();
    this.halls.set(net, hall);
    if (this.halls.size > HALL_NETWORKS) this.halls.delete(this.halls.keys().next().value!);
    // A player is known by their browser's id (hashed), or — an older client without one — by
    // name. A line made under the name before ids existed is adopted by the first device to play
    // under it, so nobody loses their record. (Two people called Ada now get a line each.)
    const byName = s.name.toLowerCase();
    const key = s.device ? `d:${createHash('sha256').update(this.hallSalt).update(s.device).digest('base64url').slice(0, 22)}` : byName;
    let e = hall.get(key);
    if (!e && key !== byName && hall.get(byName) && !hall.get(byName)!.key?.startsWith('d:')) {
      e = hall.get(byName);
      hall.delete(byName);
    }
    e ??= { name: s.name, sigil: s.sigil, w: 0, l: 0, coop: 0 };
    e.key = key;
    hall.delete(key);
    e.name = s.name;
    e.sigil = s.sigil;
    // Do players come back for another evening? (Lens #93: the question for the crystal ball.)
    const today = this.opts.today?.() ?? localDay();
    if (e.last !== today) {
      e.days = (e.days ?? 0) + 1;
      e.last = today;
    }
    hall.set(key, e);
    if (hall.size > HALL_NAMES) hall.delete(hall.keys().next().value!);
    this.hallDirty = true;
    return e;
  }

  /**
   * The key a network's hall is kept under (Lens #98): on a public server a network is a home's
   * public IP address, which must not end up in a file — so it is a salted hash ('lan' stays).
   */
  /**
   * Starts a network's slow hash in the background when it first connects (see hallKey), so the
   * server's loop never waits for it; the lists are sent again once it is ready.
   */
  private warmHallKey(network: string): void {
    if (network === 'lan' || this.hallKeys.has(network) || this.hallKeyPending.has(network)) return;
    this.hallKeyPending.add(network);
    const fast = this.opts.hallHash;
    if (fast) {
      // (Still later, as scrypt would be: the first list goes out without this network's Hall.)
      queueMicrotask(() => {
        this.hallKeyPending.delete(network);
        if (this.hallKeys.has(network)) return;
        this.cacheHallKey(network, `n:${fast(network, this.hallSalt)}`);
        this.roomsDirty = true;
      });
      return;
    }
    scrypt(network, this.hallSalt, 16, { N: 16384, r: 8, p: 1 }, (err, buf) => {
      this.hallKeyPending.delete(network);
      if (err || this.hallKeys.has(network)) return;
      this.cacheHallKey(network, `n:${buf.toString('base64url')}`);
      this.roomsDirty = true;
    });
  }

  /**
   * Keeps a network's hall key, least recently used first out past HALL_KEYS_MAX (a whole cache
   * thrown away at once would hide every connected network's Hall and send each battle's end
   * through a slow hash on the server's loop).
   */
  private cacheHallKey(network: string, key: string): void {
    this.hallKeys.delete(network);
    this.hallKeys.set(network, key);
    for (const old of this.hallKeys.keys()) {
      if (this.hallKeys.size <= (this.opts.hallKeysMax ?? HALL_KEYS_MAX)) break;
      this.hallKeys.delete(old);
    }
  }

  private hallKey(network: string): string {
    if (network === 'lan') return 'lan';
    // A slow, memory-hard hash (scrypt, ~20 ms and 16 MB each): the salt is kept with the file,
    // so a quick hash would let whoever has the file try all ~4 billion IPv4 addresses in
    // minutes; this makes that years of work. Computed once per network and cached.
    const key = this.hallKeys.get(network) ?? `n:${this.opts.hallHash ? this.opts.hallHash(network, this.hallSalt) : scryptSync(network, this.hallSalt, 16, { N: 16384, r: 8, p: 1 }).toString('base64url')}`;
    // (Used now: to the back of the queue.)
    this.cacheHallKey(network, key);
    return key;
  }

  /** The network's champions: most head-to-head wins first (then fewest losses, co-op wins). */
  private hallOf(network: string): HallEntry[] {
    // (Not ready yet — its slow hash is still running: no Hall in this list; the next one has it.)
    if (network !== 'lan' && !this.hallKeys.has(network)) {
      // (Dropped from the cache meanwhile: hashed again in the background.)
      this.warmHallKey(network);
      return [];
    }
    const hall = this.halls.get(this.hallKey(network));
    if (!hall) return [];
    // (Champions only — someone with a victory — before the top five are taken: a co-op hero
    // mustn't vanish behind four players who have only lost.)
    return [...hall.values()]
      .filter((e) => e.w > 0 || e.coop > 0)
      .sort((a, b) => b.w - a.w || a.l - b.l || b.coop - a.coop)
      .slice(0, HALL_SHOWN)
      .map((e) => ({ name: e.name, sigil: e.sigil, w: e.w, l: e.l, coop: e.coop }));
  }

  /** Players remembered across all halls, and how many of them battled here on more than one day. */
  hallStats(): { players: number; returning: number } {
    let players = 0;
    let returning = 0;
    for (const hall of this.halls.values()) {
      for (const e of hall.values()) {
        players++;
        if ((e.days ?? 0) > 1) returning++;
      }
    }
    return { players, returning };
  }

  private sendRoomLists(): void {
    this.roomsDirty = false;
    const lists = new Map<string, ServerMsg>();
    for (const s of this.sessions.values()) {
      if (!s.watching || !s.conn) continue;
      let msg = lists.get(s.network);
      if (!msg) lists.set(s.network, (msg = { type: 'rooms', rooms: this.openRooms(s.network), hall: this.hallOf(s.network) }));
      this.send(s, msg);
    }
  }

  private makeCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Forgets the longest-idle session among `list` that has no connection and no room. */
  private evictIdle(list: Session[]): void {
    let oldest: Session | null = null;
    for (const x of list) if (x.conn === null && x.room === null && (!oldest || (x.goneAt ?? 0) < (oldest.goneAt ?? 0))) oldest = x;
    if (oldest) this.sessions.delete(oldest.token);
  }

  private makeToken(): string {
    return globalThis.crypto.randomUUID();
  }

  private send(s: Session, msg: ServerMsg): void {
    if (s.conn) this.sendTo(s.conn, msg);
  }

  private sendTo(conn: Conn, msg: ServerMsg): void {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      // The socket is closing; its close handler cleans up.
    }
  }

  private error(conn: Conn | null, code: Extract<ServerMsg, { type: 'error' }>['code'], message: string): void {
    if (conn) this.sendTo(conn, { type: 'error', code, message });
  }

  private log(line: string): void {
    this.opts.log?.(line);
  }

  /** A server fault: always reported (to the log, or the console when it's quiet). */
  private fault(line: string): void {
    (this.opts.log ?? console.error)(line);
  }
}
