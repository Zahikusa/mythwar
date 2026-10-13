import { CODE_ALPHABET, CODE_LENGTH, EMOTES, PROTOCOL_VERSION, START_COUNTDOWN, cleanCode, cleanName, cleanRank, cleanSigil, cleanTrials } from '../src/net/protocol.ts';
import type { ClientMsg, HallEntry, OpenRoom, RoomInfo, RoomPhase, ServerMsg } from '../src/net/protocol.ts';
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
  /** Today as a day number (injectable for tests; default: UTC days since 1970). */
  today?: () => number;
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
/** Open-battle lists go out at most this often (ms). */
const ROOM_LIST_EVERY = 250;
/** Minimum ms between two emotes from one player. */
const EMOTE_GAP = 1500;
const MSG_RATE = 120;

interface Session {
  token: string;
  name: string;
  /** Standing (RANKS index), as the client declares it. */
  rank: number;
  /** Sigil (SIGILS index, -1 = none). */
  sigil: number;
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

  /** Restores the Hall of champions from the store (sanitized: the file may be hand-edited). */
  private loadHalls(): void {
    const state = this.opts.store?.load();
    if (!state) return;
    const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    for (const [network, entries] of Object.entries(state.halls).slice(-HALL_NETWORKS)) {
      if (!Array.isArray(entries)) continue;
      const hall = new Map<string, HallEntry>();
      for (const e of entries.slice(-HALL_NAMES)) {
        if (!e || typeof e !== 'object') continue;
        const name = cleanName(e.name);
        hall.set(name.toLowerCase(), { name, sigil: cleanSigil(e.sigil), w: n(e.w), l: n(e.l), coop: n(e.coop), days: n(e.days), last: n(e.last) });
      }
      if (hall.size) this.halls.set(network, hall);
    }
  }

  /** Saves the Hall of champions now if it changed (also called on shutdown). */
  flush(): void {
    if (!this.hallDirty || !this.opts.store) return;
    this.hallDirty = false;
    this.lastHallSave = this.now();
    const halls: Record<string, HallEntry[]> = {};
    for (const [network, hall] of this.halls) halls[network] = [...hall.values()];
    this.opts.store.save({ v: 1, halls });
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
        if (msg.type === 'hello') {
          if (session) return;
          session = this.hello(conn, msg, network, quota);
          return;
        }
        if (!session || session.conn !== conn) return this.error(conn, 'bad-request', 'Say hello first');
        if (msg.type === 'cmd' && ++rate.cmds > CMD_RATE) return this.error(conn, 'rate', 'Too many commands');
        this.handle(session, msg);
      },
      close: () => {
        if (session && session.conn === conn) this.disconnected(session);
      },
    };
  }

  /** Drives matches and expiries; call every few milliseconds. */
  update(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      room.match?.update(now);
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
      if (msg.name !== undefined) s.name = cleanName(msg.name);
      if (msg.rank !== undefined) s.rank = cleanRank(msg.rank);
      if (msg.sigil !== undefined) s.sigil = cleanSigil(msg.sigil);
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
        name: cleanName(msg.name),
        rank: cleanRank(msg.rank),
        sigil: cleanSigil(msg.sigil),
        conn,
        room: null,
        seat: null,
        watching: false,
        goneAt: null,
        network,
        quota,
        lastEmote: -Infinity,
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
        s.name = cleanName(msg.name);
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
        const r: Room = { code: this.makeCode(), createdAt: now, phase: 'waiting', seats: [null, null], match: null, coop: null };
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
        this.broadcastRoom(room);
        return;
      }
      case 'coop': {
        if (!room || seat === null || (room.phase !== 'waiting' && room.phase !== 'over')) return;
        const coop = DIFFICULTIES.includes(msg.coop as Difficulty) ? (msg.coop as Difficulty) : null;
        if (coop === room.coop) return;
        room.coop = coop;
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
          room.match.setAway(seat, !!msg.away, now);
          this.broadcastRoom(room);
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
        if (coop) {
          if (winner === 0)
            for (const x of room.seats) {
              if (!x) continue;
              x.wins++;
              this.hallEntry(x.session).coop++;
            }
        } else {
          const w = room.seats[winner];
          const l = room.seats[winner === 0 ? 1 : 0];
          if (w) w.wins++;
          // (A battle abandoned by a server shutdown never gets here; a forfeit does count.)
          if (w) this.hallEntry(w.session).w++;
          if (l) this.hallEntry(l.session).l++;
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
    return { code: room.code, phase: room.phase, seats: [seat(0), seat(1)], coop: room.coop };
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
      out.push({ code: r.code, host: seated[0]!.session.name, rank: seated[0]!.session.rank, age: Math.round((now - r.createdAt) / 1000) });
    }
    return out.sort((a, b) => a.age - b.age);
  }

  /** A player's line in their network's Hall of champions (created, and moved to most recent). */
  private hallEntry(s: Session): HallEntry {
    let hall = this.halls.get(s.network);
    if (hall) this.halls.delete(s.network);
    else hall = new Map();
    this.halls.set(s.network, hall);
    if (this.halls.size > HALL_NETWORKS) this.halls.delete(this.halls.keys().next().value!);
    const key = s.name.toLowerCase();
    const e = hall.get(key) ?? { name: s.name, sigil: s.sigil, w: 0, l: 0, coop: 0 };
    hall.delete(key);
    e.name = s.name;
    e.sigil = s.sigil;
    // Do players come back for another evening? (Lens #93: the question for the crystal ball.)
    const today = this.opts.today?.() ?? Math.floor(Date.now() / 86_400_000);
    if (e.last !== today) {
      e.days = (e.days ?? 0) + 1;
      e.last = today;
    }
    hall.set(key, e);
    if (hall.size > HALL_NAMES) hall.delete(hall.keys().next().value!);
    this.hallDirty = true;
    return e;
  }

  /** The network's champions: most head-to-head wins first (then fewest losses, co-op wins). */
  private hallOf(network: string): HallEntry[] {
    const hall = this.halls.get(network);
    if (!hall) return [];
    return [...hall.values()]
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
}
