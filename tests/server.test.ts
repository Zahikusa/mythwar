import { describe, expect, it } from 'vitest';
import { Lobby, localDay } from '../server/lobby.ts';
import { fileStore, memoryStore } from '../server/store.ts';
import type { ServerStore } from '../server/store.ts';
import { networkOf } from '../server/lan.ts';
import { validateCommand } from '../server/validate.ts';
import { PROTOCOL_VERSION, battleWorld } from '../src/net/protocol.ts';
import type { ClientMsg, ServerMsg } from '../src/net/protocol.ts';
import { simFingerprint } from '../src/sim/fingerprint.ts';
import { hashWorld } from '../src/sim/hash.ts';
import { World } from '../src/sim/world.ts';

/** A scripted client that keeps its own replica of the battle from the server's turns. */
class FakeClient {
  readonly inbox: ServerMsg[] = [];
  open = true;
  world: World | null = null;
  hashChecks = 0;
  private handlers: { message: (d: string) => void; close: () => void };
  token = '';
  seq = 0;

  readonly lobby: Lobby;
  readonly network: string;

  constructor(lobby: Lobby, network = 'lan') {
    this.lobby = lobby;
    this.network = network;
    this.handlers = this.connect();
  }

  private connect() {
    this.open = true;
    return this.lobby.connect({
      send: (d) => {
        if (this.open) this.receive(JSON.parse(d) as ServerMsg);
      },
      close: () => {
        this.open = false;
      },
    }, this.network);
  }

  private receive(m: ServerMsg): void {
    this.inbox.push(m);
    if (m.type === 'welcome') this.token = m.token;
    if (m.type === 'start') this.world = battleWorld(m.seed, m.trials, m.coop);
    if (m.type === 'snapshot') this.world = World.deserialize(m.world);
    if (m.type === 'turn' && this.world) {
      const w = this.world;
      if (m.tick <= w.tick) return;
      const cmds = (m.cmds ?? []).filter((c) => c.tick > w.tick);
      while (w.tick < m.tick) {
        for (const c of cmds) if (c.tick === w.tick + 1) w.apply({ ...c.cmd, team: c.team } as never);
        w.step();
        w.drainEvents();
        if (m.hash && m.hash[0] === w.tick) {
          expect(hashWorld(w)).toBe(m.hash[1]);
          this.hashChecks++;
        }
      }
    }
  }

  send(m: ClientMsg): void {
    this.handlers.message(JSON.stringify(m));
  }

  hello(name: string, token?: string, extra: { battle?: boolean; away?: boolean; rank?: number; device?: string } = {}): void {
    this.send({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint(), name, token, ...extra });
  }

  disconnect(): void {
    this.open = false;
    this.handlers.close();
  }

  reconnect(extra: { battle?: boolean; away?: boolean } = {}): void {
    this.handlers = this.connect();
    this.hello('again', this.token, extra);
  }

  last<T extends ServerMsg['type']>(type: T): Extract<ServerMsg, { type: T }> | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) if (this.inbox[i].type === type) return this.inbox[i] as Extract<ServerMsg, { type: T }>;
    return undefined;
  }
}

function setup(opts: { awayGrace?: number; store?: ServerStore; today?: () => number } = {}) {
  let now = 1000;
  let r = 0.37;
  const lobby = new Lobby({
    now: () => now,
    random: () => (r = (r * 9301 + 49297) % 233280 / 233280),
    countdown: 3,
    awayGrace: opts.awayGrace ?? 90,
    store: opts.store,
    today: opts.today,
  });
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 5) {
      now += 5;
      lobby.update();
    }
  };
  return { lobby, run };
}

/** Two players in a running battle. */
function battle(opts: { awayGrace?: number; store?: ServerStore; today?: () => number } = {}) {
  const { lobby, run } = setup(opts);
  const a = new FakeClient(lobby);
  const b = new FakeClient(lobby);
  a.hello('Ada');
  b.hello('Bo');
  a.send({ type: 'host' });
  const code = a.last('room')!.room.code;
  b.send({ type: 'join', code });
  a.send({ type: 'ready', ready: true });
  b.send({ type: 'ready', ready: true });
  run(3100);
  return { lobby, run, a, b, code };
}

describe('lobby', () => {
  it('lists open rooms, joins by code and starts when both are ready', () => {
    const { lobby, run } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('Ada');
    b.hello('Bo');
    expect(a.last('welcome')!.token).not.toBe(b.last('welcome')!.token);
    b.send({ type: 'watchRooms', on: true });
    expect(b.last('rooms')!.rooms).toEqual([]);
    a.send({ type: 'host' });
    const room = a.last('room')!;
    expect(room.seat).toBe(0);
    expect(room.room.code).toMatch(/^[A-Z0-9]{4}$/);
    run(10);
    expect(b.last('rooms')!.rooms.map((r) => r.host)).toEqual(['Ada']);

    b.send({ type: 'join', code: room.room.code.toLowerCase() });
    expect(b.last('room')!.seat).toBe(1);
    expect(a.last('room')!.room.seats[1]!.name).toBe('Bo');
    run(300); // (lists are sent at most every 250 ms)
    expect(b.last('rooms')!.rooms).toEqual([]);

    a.send({ type: 'ready', ready: true });
    expect(a.last('start')).toBeUndefined();
    b.send({ type: 'ready', ready: true });
    const sa = a.last('start')!;
    const sb = b.last('start')!;
    expect(sa.seed).toBe(sb.seed);
    expect([sa.seat, sb.seat]).toEqual([0, 1]);
    expect(sa.names).toEqual(['Ada', 'Bo']);
  });

  it('players may take handicaps (trials): shown to both, un-ready both, applied to the battle', () => {
    const { lobby, run } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('Ada');
    b.hello('Bo');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    b.send({ type: 'ready', ready: true });
    a.send({ type: 'trials', trials: ['nowalls', 'glass', 'bogus' as never, 'glass'] });
    const seats = b.last('room')!.room.seats;
    expect(seats[0]!.trials).toEqual(['glass', 'nowalls']);
    expect(seats[1]!.trials).toEqual([]);
    expect(seats[1]!.ready).toBe(false);
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    const start = b.last('start')!;
    expect(start.trials).toEqual([['glass', 'nowalls'], []]);
    run(3100);
    expect(b.world!.players[0].baseMaxHp).toBe(b.world!.players[1].baseMaxHp / 2);
    expect(b.world!.players[0].trials).toEqual(['glass', 'nowalls']);
    // (The replicas keep hashing equal with the handicaps applied: FakeClient checks every hash.)
    run(2000);
    expect(b.hashChecks).toBeGreaterThan(0);
  });

  it('co-op: both players command the left side against an AI run by the server, in lockstep', () => {
    const { lobby, run } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('Ada');
    b.hello('Bo');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    b.send({ type: 'ready', ready: true });
    // (Mythic: its +20% income must be applied identically by the server and the replicas.)
    a.send({ type: 'coop', coop: 'mythic' });
    expect(b.last('room')!.room.coop).toBe('mythic');
    expect(b.last('room')!.room.seats[1]!.ready).toBe(false);
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    expect(b.last('start')!.coop).toBe('mythic');
    run(3100);
    // Both seats order creatures for team 0.
    a.send({ type: 'cmd', seq: 1, cmd: { type: 'train', unitId: 'redcap', lane: 0 } });
    b.send({ type: 'cmd', seq: 1, cmd: { type: 'train', unitId: 'pixie', lane: 2 } });
    run(60 * 1000);
    const turns = b.inbox.filter((m) => m.type === 'turn') as Extract<ServerMsg, { type: 'turn' }>[];
    const cmds = turns.flatMap((t) => t.cmds ?? []);
    const players = cmds.filter((c) => c.seat !== undefined);
    expect(players.map((c) => [c.seat, c.team])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    // The AI's orders reach the clients like any other (team 1, no seat).
    expect(cmds.some((c) => c.team === 1 && c.seat === undefined && c.cmd.type === 'train')).toBe(true);
    expect(a.hashChecks).toBeGreaterThan(30);
    expect(b.hashChecks).toBeGreaterThan(30);
    expect(hashWorld(a.world!)).toBe(hashWorld(b.world!));
    // One ally leaves: the other plays on (no forfeit, no pause).
    a.send({ type: 'leave' });
    run(1000);
    expect(b.last('over')).toBeUndefined();
    expect(b.last('paused')).toBeUndefined();
    const tick = b.world!.tick;
    run(1000);
    expect(b.world!.tick).toBeGreaterThan(tick);
  });

  it('refuses unknown codes, full rooms and old versions', () => {
    const { lobby } = setup();
    const [a, b, c] = [new FakeClient(lobby), new FakeClient(lobby), new FakeClient(lobby)];
    a.hello('A');
    b.hello('B');
    c.hello('C');
    b.send({ type: 'join', code: 'QQQQ' });
    expect(b.last('error')!.code).toBe('no-room');
    a.send({ type: 'host' });
    const code = a.last('room')!.room.code;
    b.send({ type: 'join', code });
    c.send({ type: 'join', code });
    expect(c.last('error')!.code).toBe('room-full');
    const old = new FakeClient(lobby);
    old.send({ type: 'hello', v: PROTOCOL_VERSION - 1, sim: simFingerprint(), name: 'x' });
    expect(old.last('error')!.code).toBe('version');
    expect(old.open).toBe(false);
    // Same protocol, different rules (e.g. a rebalanced build): refused too.
    const other = new FakeClient(lobby);
    other.send({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint() ^ 1, name: 'y' });
    expect(other.last('error')!.code).toBe('version');
  });

  it('two players with the same name are told apart', () => {
    const { lobby } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('Ada');
    b.hello('ada');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    expect(a.last('room')!.room.seats.map((s) => s!.name)).toEqual(['Ada', 'ada (2)']);
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    expect(b.last('start')!.names).toEqual(['Ada', 'ada (2)']);
  });

  it("each seat shows the player's standing (Lens #80), sanitized, and updated with the name", () => {
    const { lobby } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    const watcher = new FakeClient(lobby);
    a.hello('Ada', undefined, { rank: 3 });
    b.hello('Bo', undefined, { rank: 99 });
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    a.send({ type: 'host' });
    lobby.update();
    expect(watcher.last('rooms')!.rooms.map((r) => r.rank)).toEqual([3]);
    b.send({ type: 'join', code: a.last('room')!.room.code });
    expect(a.last('room')!.room.seats.map((s) => s!.rank)).toEqual([3, 0]);
    b.send({ type: 'name', name: 'Bo', rank: 2 });
    expect(a.last('room')!.room.seats.map((s) => s!.rank)).toEqual([3, 2]);
    // A rename without a rank keeps it.
    b.send({ type: 'name', name: 'Bob' });
    expect(a.last('room')!.room.seats.map((s) => s!.rank)).toEqual([3, 2]);
    // Sigils too (Lens #85): none by default, sanitized, shown to both.
    expect(a.last('room')!.room.seats.map((s) => s!.sigil)).toEqual([-1, -1]);
    b.send({ type: 'name', name: 'Bob', sigil: 4 });
    a.send({ type: 'name', name: 'Ada', sigil: 77 });
    expect(b.last('room')!.room.seats.map((s) => s!.sigil)).toEqual([-1, 4]);
  });

  it('lists only rooms from the same network (LAN = all private addresses)', () => {
    expect(networkOf('192.168.1.20')).toBe('lan');
    expect(networkOf('::ffff:10.0.0.5')).toBe('lan');
    expect(networkOf('127.0.0.1')).toBe('lan');
    expect(networkOf('fe80::1')).toBe('lan');
    expect(networkOf('::1')).toBe('lan');
    expect(networkOf('203.0.113.7')).toBe('203.0.113.7');
    expect(networkOf('2001:db8:1:2:aaaa::5')).toBe('2001:db8:1:2');
    // Compressed and full spellings of one /64 are the same home.
    expect(networkOf('2001:db8:1::5')).toBe('2001:db8:1:0');
    expect(networkOf('2001:0db8:0001:0000:a:b:c:d')).toBe('2001:db8:1:0');
    const { lobby, run } = setup();
    const mk = (network: string) => {
      const c = new FakeClient(lobby);
      (c as unknown as { handlers: unknown }).handlers = lobby.connect({ send: (d) => c.inbox.push(JSON.parse(d)), close: () => {} }, network);
      return c;
    };
    const home = mk('203.0.113.7');
    const sameHome = mk('203.0.113.7');
    const elsewhere = mk('198.51.100.9');
    home.hello('Ada');
    sameHome.hello('Bo');
    elsewhere.hello('Cy');
    sameHome.send({ type: 'watchRooms', on: true });
    elsewhere.send({ type: 'watchRooms', on: true });
    home.send({ type: 'host' });
    run(10);
    expect(sameHome.last('rooms')!.rooms.map((r) => r.host)).toEqual(['Ada']);
    expect(elsewhere.last('rooms')!.rooms).toEqual([]);
    // The room code still works from anywhere.
    elsewhere.send({ type: 'join', code: home.last('room')!.room.code });
    expect(elsewhere.last('room')!.seat).toBe(1);
  });

  it('seats show each player ping, refreshed when it changes noticeably', () => {
    const { lobby } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('A');
    b.hello('B');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    b.send({ type: 'ping', t: 1, rtt: 40 });
    expect(a.last('room')!.room.seats[1]!.ping).toBe(40);
    const n = a.inbox.length;
    b.send({ type: 'ping', t: 2, rtt: 42 }); // small change: no extra room update
    expect(a.inbox.length).toBe(n);
    b.send({ type: 'ping', t: 3, rtt: 300 });
    expect(a.last('room')!.room.seats[1]!.ping).toBe(300);
  });

  it('a full server makes room by forgetting the longest-idle session', () => {
    const lobby = new Lobby({ maxSessions: 2 });
    const [a, b, c] = [new FakeClient(lobby), new FakeClient(lobby), new FakeClient(lobby)];
    a.hello('A');
    a.disconnect(); // idle, in no room
    b.hello('B');
    c.hello('C');
    expect(c.last('welcome')).toBeDefined();
    expect(c.last('error')).toBeUndefined();
  });

  it('refuses new rooms and sessions when the server is full', () => {
    const lobby = new Lobby({ maxRooms: 1, maxSessions: 2 });
    const [a, b, c] = [new FakeClient(lobby), new FakeClient(lobby), new FakeClient(lobby)];
    a.hello('A');
    b.hello('B');
    c.hello('C');
    expect(c.last('error')!.code).toBe('rate');
    expect(c.open).toBe(false);
    a.send({ type: 'host' });
    b.send({ type: 'host' });
    expect(b.last('error')!.code).toBe('rate');
    expect(lobby.roomCount).toBe(1);
  });

  it('an empty room disappears', () => {
    const { lobby } = setup();
    const a = new FakeClient(lobby);
    a.hello('A');
    a.send({ type: 'host' });
    expect(lobby.roomCount).toBe(1);
    a.send({ type: 'leave' });
    expect(lobby.roomCount).toBe(0);
    expect(a.last('left')).toBeDefined();
  });
});

describe('battle', () => {
  it('both replicas follow the server tick for tick, commands included', () => {
    const { run, a, b } = battle();
    run(1000);
    expect(a.world!.tick).toBeGreaterThanOrEqual(58);
    a.send({ type: 'cmd', seq: 1, cmd: { type: 'train', unitId: 'redcap', lane: 0 } });
    b.send({ type: 'cmd', seq: 1, cmd: { type: 'train', unitId: 'treant', lane: 2 } });
    run(20_000);
    const cmds = a.inbox.flatMap((m) => (m.type === 'turn' ? (m.cmds ?? []) : []));
    expect(cmds.map((c) => [c.team, c.cmd.type, c.seq])).toEqual([
      [0, 'train', 1],
      [1, 'train', 1],
    ]);
    expect(a.world!.tick).toBe(b.world!.tick);
    expect(hashWorld(a.world!)).toBe(hashWorld(b.world!));
    expect(a.hashChecks).toBeGreaterThan(15);
    expect(a.world!.players[0].stats.summoned).toBe(1);
    expect(b.world!.players[1].stats.summoned).toBe(1);
  });

  it('pauses while a player is away, resumes when they are back and resyncs them', () => {
    const { run, a, b } = battle();
    run(5000);
    b.disconnect();
    run(50);
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
    const tickAtPause = a.world!.tick;
    run(10_000);
    expect(a.world!.tick).toBe(tickAtPause);
    // A command while paused is ignored.
    a.send({ type: 'cmd', seq: 2, cmd: { type: 'train', unitId: 'redcap', lane: 0 } });
    b.world = null;
    b.reconnect();
    expect(b.last('welcome')!.room!.code).toBeTruthy();
    expect(b.last('snapshot')!.tick).toBe(tickAtPause);
    expect(b.world!.tick).toBe(tickAtPause);
    expect(a.last('resuming')!.seconds).toBe(3);
    run(3100);
    expect(a.last('resumed')).toBeDefined();
    run(5000);
    expect(a.world!.tick).toBeGreaterThan(tickAtPause + 250);
    expect(hashWorld(a.world!)).toBe(hashWorld(b.world!));
    expect(a.world!.players[0].stats.summoned).toBe(0);
  });

  it('someone away during the countdown: the start waits for them', () => {
    const { lobby, run } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('A');
    b.hello('B');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    run(1000);
    b.send({ type: 'away', away: true });
    run(5000);
    expect(a.world!.tick).toBe(0);
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
    b.send({ type: 'away', away: false });
    expect(a.last('resuming')!.seconds).toBe(3);
    run(3100);
    expect(a.last('resumed')).toBeDefined();
    run(1000);
    expect(a.world!.tick).toBeGreaterThan(50);
  });

  it('leaving during the countdown still forfeits after the grace period', () => {
    const { lobby, run } = setup({ awayGrace: 30 });
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('A');
    b.hello('B');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    run(500);
    b.disconnect();
    run(31_000);
    expect(a.last('over')).toMatchObject({ winner: 0, reason: 'timeout' });
  });

  it('a client that missed the end of its battle is told on reconnect', () => {
    const { run, a, b } = battle();
    run(3000);
    b.disconnect();
    run(100);
    a.send({ type: 'leave' }); // a gives up while b is offline
    run(100);
    const before = b.inbox.length;
    b.reconnect({ battle: true });
    const got = b.inbox.slice(before).map((m) => m.type);
    expect(got.slice(0, 3)).toEqual(['welcome', 'snapshot', 'over']);
    expect(b.last('over')).toMatchObject({ winner: 1, reason: 'forfeit' });
  });

  it('a tab reconnecting in the background stays away', () => {
    const { run, a, b } = battle();
    run(2000);
    b.send({ type: 'away', away: true });
    b.disconnect();
    run(100);
    b.reconnect({ away: true });
    run(5000);
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
    expect(a.last('resumed')?.tick ?? 0).toBe(0);
  });

  it('"Paused by" keeps naming who paused, even after someone was away meanwhile', () => {
    const { run, a, b } = battle();
    run(1000);
    a.send({ type: 'pause' });
    b.send({ type: 'away', away: true });
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
    b.send({ type: 'away', away: false });
    expect(a.last('paused')!.state).toMatchObject({ reason: 'pause', seat: 0 });
  });

  it('the waiting player may claim the win after a while', () => {
    const { run, a, b } = battle();
    run(2000);
    b.send({ type: 'away', away: true });
    run(5000);
    a.send({ type: 'claim' });
    expect(a.last('over')).toBeUndefined(); // too early
    b.send({ type: 'claim' }); // the absent player can't claim anything
    run(16_000);
    a.send({ type: 'claim' });
    expect(a.last('over')).toMatchObject({ winner: 0, reason: 'timeout' });
  });

  it('relays quick messages to the opponent, rate-limited, known phrases only', () => {
    const { run, a, b } = battle();
    a.send({ type: 'emote', id: 'gl' });
    a.send({ type: 'emote', id: 'wp' }); // too soon: dropped
    a.send({ type: 'emote', id: 'hello there' as never }); // not a phrase: dropped
    expect(b.inbox.filter((m) => m.type === 'emote')).toEqual([{ type: 'emote', seat: 0, id: 'gl' }]);
    expect(a.inbox.filter((m) => m.type === 'emote')).toEqual([]);
    run(1600);
    a.send({ type: 'emote', id: 'wp' });
    expect(b.last('emote')).toEqual({ type: 'emote', seat: 0, id: 'wp' });
  });

  it('a player who stays away forfeits', () => {
    const { run, a, b } = battle({ awayGrace: 30 });
    run(2000);
    b.send({ type: 'away', away: true });
    run(29_000);
    expect(a.last('over')).toBeUndefined();
    expect(a.last('paused')!.state.forfeitIn).toBe(30);
    run(1100);
    expect(a.last('over')).toMatchObject({ winner: 0, reason: 'timeout' });
    expect(a.last('room')!.room.phase).toBe('over');
  });

  it('leaving mid-battle forfeits; the room survives for a new opponent', () => {
    const { lobby, run, a, b, code } = battle();
    run(2000);
    b.send({ type: 'leave' });
    expect(a.last('over')).toMatchObject({ winner: 0, reason: 'forfeit' });
    run(10);
    expect(a.last('room')!.room.phase).toBe('waiting');
    expect(a.last('room')!.room.seats[1]).toBeNull();
    const c = new FakeClient(lobby);
    c.hello('Cy');
    c.send({ type: 'join', code });
    expect(c.last('room')!.seat).toBe(1);
  });

  it('the Hall of champions counts battles per player across rooms (Lens #86)', () => {
    const { lobby, run, b } = battle();
    const watcher = new FakeClient(lobby);
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    expect(watcher.last('rooms')!.hall).toEqual([]);
    run(2000);
    b.send({ type: 'leave' });
    run(300);
    expect(watcher.last('rooms')!.hall).toEqual([
      { name: 'Ada', sigil: -1, w: 1, l: 0, coop: 0 },
      { name: 'Bo', sigil: -1, w: 0, l: 1, coop: 0 },
    ]);
  });

  it('the Hall of champions survives a server restart (Lens #92)', () => {
    const store = memoryStore();
    const { run, b } = battle({ store });
    run(2000);
    b.send({ type: 'leave' });
    run(5100);
    expect(store.saves).toBe(1);
    // A new server with the same store: the hall is back, sanitized.
    store.saved!.halls.lan?.push({ name: '<b>Eve</b>', sigil: 99, w: -3, l: 2.7, coop: 1 } as never);
    const { lobby: again } = setup({ store });
    const watcher = new FakeClient(again);
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    const hall = watcher.last('rooms')!.hall!;
    expect(hall.map((e) => [e.name, e.w, e.l])).toContainEqual(['Ada', 1, 0]);
    expect(hall.map((e) => [e.name, e.w, e.l])).toContainEqual(['Bo', 0, 1]);
    expect(hall.find((e) => e.name.includes('Eve'))).toMatchObject({ name: 'bEve/b', sigil: -1, w: 0, l: 2 });
  });

  it('the hall knows who came back on another day (Lens #93), and keeps it to itself', () => {
    let day = 20000;
    const store = memoryStore();
    const play = () => {
      const { lobby, run, b } = battle({ store, today: () => day });
      run(2000);
      b.send({ type: 'leave' });
      run(5100);
      return lobby;
    };
    play();
    play(); // the same evening
    expect(new Lobby({ store }).hallStats()).toEqual({ players: 2, returning: 0 });
    day++;
    const lobby = play();
    expect(lobby.hallStats()).toEqual({ players: 2, returning: 2 });
    const watcher = new FakeClient(lobby);
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    expect(Object.keys(watcher.last('rooms')!.hall![0]).sort()).toEqual(['coop', 'l', 'name', 'sigil', 'w']);
  });

  it("a public network's hall is stored under a salted hash, never its address (Lens #98)", () => {
    const store = memoryStore();
    const { lobby, run } = setup({ store });
    const a = new FakeClient(lobby, '203.0.113.7');
    const b = new FakeClient(lobby, '203.0.113.7');
    a.hello('Ada');
    b.hello('Bo');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    run(3100);
    b.send({ type: 'leave' });
    run(5100);
    const text = JSON.stringify(store.saved);
    expect(text).not.toContain('203.0.113');
    expect(Object.keys(store.saved!.halls)).toEqual([expect.stringMatching(/^n:/)]);
    // After a restart the same network finds its hall again (same salt); another doesn't.
    const { lobby: again } = setup({ store });
    const home = new FakeClient(again, '203.0.113.7');
    home.hello('Cy');
    home.send({ type: 'watchRooms', on: true });
    expect(home.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Ada', 'Bo']);
    const elsewhere = new FakeClient(again, '198.51.100.1');
    elsewhere.hello('Dee');
    elsewhere.send({ type: 'watchRooms', on: true });
    expect(elsewhere.last('rooms')!.hall).toEqual([]);
  });

  it('a day is the server’s local calendar day, not UTC (backlog)', () => {
    // 23:30 and 00:30 local are two days; 00:30 and 23:30 local of one date are one.
    expect(localDay(new Date(2026, 9, 13, 0, 30))).toBe(localDay(new Date(2026, 9, 13, 23, 30)));
    expect(localDay(new Date(2026, 9, 14, 0, 30))).toBe(localDay(new Date(2026, 9, 13, 23, 30)) + 1);
  });

  it('the hall knows players by their device, not their name (backlog)', () => {
    const store = memoryStore();
    const { lobby, run } = setup({ store });
    // A line from before device ids, under the name Ada.
    const duel = (an: string, ad: string | undefined, bn: string, bd: string | undefined) => {
      const a = new FakeClient(lobby);
      const b = new FakeClient(lobby);
      a.hello(an, undefined, ad ? { device: ad } : {});
      b.hello(bn, undefined, bd ? { device: bd } : {});
      a.send({ type: 'host' });
      b.send({ type: 'join', code: a.last('room')!.room.code });
      a.send({ type: 'ready', ready: true });
      b.send({ type: 'ready', ready: true });
      run(3100);
      b.send({ type: 'leave' });
      run(300);
      a.send({ type: 'leave' });
      run(100);
    };
    duel('Ada', undefined, 'Bo', undefined); // legacy: Ada 1–0 by name
    duel('Ada', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'Bo', 'bbbbbbbbbbbbbbbbbbbbbbbb'); // Ada's device adopts the line: 2–0
    duel('Ada', 'cccccccccccccccccccccccc', 'Bo', 'bbbbbbbbbbbbbbbbbbbbbbbb'); // another Ada: a line of her own
    duel('Queen Ada', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'Bo', 'bbbbbbbbbbbbbbbbbbbbbbbb'); // the first Ada, renamed
    const watcher = new FakeClient(lobby);
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    const hall = watcher.last('rooms')!.hall!;
    expect(hall.map((e) => `${e.name} ${e.w}–${e.l}`)).toEqual(['Queen Ada 3–0', 'Ada 1–0', 'Bo 0–4']);
    expect(Object.keys(hall[0])).not.toContain('key');
    // The ids stay out of the file (hashed) and the lines come back after a restart.
    run(5100);
    expect(JSON.stringify(store.saved)).not.toContain('aaaaaaaa');
    const { lobby: again } = setup({ store });
    const w2 = new FakeClient(again);
    w2.hello('Dee');
    w2.send({ type: 'watchRooms', on: true });
    expect(w2.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Queen Ada', 'Ada', 'Bo']);
  });

  it('a blocklist keeps unwanted names off a public server (backlog)', () => {
    const lobby = new Lobby({ blockedWords: ['badword'] });
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('B.a.d W-o-r-d');
    b.hello('Ada');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    expect(b.last('room')!.room.seats.map((s) => s!.name)).toEqual(['Player', 'Ada']);
    a.send({ type: 'name', name: 'xXbadwordXx' });
    expect(b.last('room')!.room.seats[0]!.name).toBe('Player');
    a.send({ type: 'name', name: 'Bo' });
    expect(b.last('room')!.room.seats[0]!.name).toBe('Bo');
  });

  it('the file store writes atomically and reads back; a broken file means an empty hall', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'mythwar-'));
    const path = join(dir, 'sub', 'data.json');
    const store = fileStore(path);
    expect(store.load()).toBeNull();
    // In the background, one write at a time; the newest state waiting wins.
    store.save({ v: 1, halls: { lan: [{ name: 'Ada', sigil: 1, w: 2, l: 0, coop: 0 }] } });
    store.save({ v: 1, halls: { lan: [{ name: 'Ada', sigil: 1, w: 3, l: 0, coop: 0 }] } });
    store.save({ v: 1, halls: { lan: [{ name: 'Ada', sigil: 1, w: 4, l: 0, coop: 0 }] } });
    await store.idle();
    expect(store.load()!.halls.lan[0].w).toBe(4);
    // On shutdown: written before returning, and nothing from the background lands after it.
    store.save({ v: 1, halls: { lan: [{ name: 'Ada', sigil: 1, w: 5, l: 0, coop: 0 }] } });
    store.saveNow!({ v: 1, halls: { lan: [{ name: 'Ada', sigil: 1, w: 6, l: 0, coop: 0 }] } });
    expect(store.load()!.halls.lan[0].w).toBe(6);
    await store.idle();
    expect(store.load()!.halls.lan[0].w).toBe(6);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(join(dir, 'sub')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    writeFileSync(path, '{ not json');
    const lines: string[] = [];
    expect(fileStore(path, (l) => lines.push(l)).load()).toBeNull();
    expect(lines.length).toBe(1);
  });

  it('orders not yet applied when the battle pauses are dropped', () => {
    const { run, a, b } = battle();
    run(1000);
    a.send({ type: 'cmd', seq: 9, cmd: { type: 'train', unitId: 'redcap', lane: 0 } });
    b.send({ type: 'pause' }); // before the server's next tick
    b.send({ type: 'resume' });
    run(5000);
    const cmds = a.inbox.flatMap((m) => (m.type === 'turn' ? (m.cmds ?? []) : []));
    expect(cmds).toEqual([]);
    expect(a.world!.players[0].stats.summoned + a.world!.players[0].queue.length).toBe(0);
  });

  it('each player may pause three times a battle; being away is not capped (Lens #87)', () => {
    const { run, a, b } = battle();
    run(500);
    for (let i = 0; i < 3; i++) {
      b.send({ type: 'pause' });
      expect(a.last('paused')!.state).toMatchObject({ reason: 'pause', seat: 1, pausesLeft: [3, 2 - i] });
      a.send({ type: 'resume' });
      run(3500);
      expect(a.last('resumed')).toBeDefined();
    }
    const before = a.inbox.length;
    b.send({ type: 'pause' });
    expect(a.inbox.slice(before).some((m) => m.type === 'paused')).toBe(false);
    // A still has all of theirs, and the count travels with a snapshot.
    a.send({ type: 'pause' });
    expect(a.last('paused')!.state.pausesLeft).toEqual([2, 0]);
    b.send({ type: 'resync' });
    expect(b.last('snapshot')!.pausesLeft).toEqual([2, 0]);
  });

  it('pause and resume by either player', () => {
    const { run, a, b } = battle();
    run(1000);
    a.send({ type: 'pause' });
    expect(b.last('paused')!.state).toEqual({ reason: 'pause', seat: 0, pausesLeft: [2, 3] });
    const t = b.world!.tick;
    run(5000);
    expect(b.world!.tick).toBe(t);
    b.send({ type: 'resume' });
    run(3100 + 1000);
    expect(b.world!.tick).toBeGreaterThan(t + 50);
  });

  it('rematch after the battle', () => {
    const { run, a, b } = battle();
    run(500);
    b.send({ type: 'leave' });
    const code = a.last('room')!.room.code;
    b.send({ type: 'join', code });
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    expect(b.last('start')!.seat).toBe(1);
    run(4000);
    expect(b.world!.tick).toBeGreaterThan(30);
  });

  it('ignores malformed commands', () => {
    expect(validateCommand({ type: 'train', unitId: 'nope', lane: 0 })).toBeNull();
    expect(validateCommand({ type: 'train', unitId: 'redcap', lane: 3 })).toBeNull();
    expect(validateCommand({ type: 'train', unitId: 'redcap', lane: '1' })).toBeNull();
    expect(validateCommand({ type: 'train', unitId: 'constructor', lane: 1 })).toBeNull();
    expect(validateCommand({ type: 'bless', blessing: 'toString' })).toBeNull();
    expect(validateCommand({ type: 'cancel', index: 1.5 })).toBeNull();
    expect(validateCommand({ type: 'power', lane: 1, team: 1 })).toEqual({ type: 'power', lane: 1 });
    expect(validateCommand({ type: 'stance', lane: 2, hold: true, team: 0 })).toEqual({ type: 'stance', lane: 2, hold: true });
    expect(validateCommand({ type: 'stance', lane: 2, hold: 'yes' })).toBeNull();
    expect(validateCommand({ type: 'stance', lane: 5, hold: false })).toBeNull();
    expect(validateCommand(null)).toBeNull();
  });
});

describe('over a real WebSocket', () => {
  it('two clients host, join and receive turns', async () => {
    const { createServer } = await import('node:http');
    const { attachMultiplayer } = await import('../server/net.ts');
    const http = createServer();
    const mp = attachMultiplayer(http, { countdown: 0.2 });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    const port = (http.address() as { port: number }).port;
    const open = (name: string) =>
      new Promise<{ ws: WebSocket; inbox: ServerMsg[] }>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/mp`);
        const inbox: ServerMsg[] = [];
        ws.onmessage = (e) => inbox.push(JSON.parse(String(e.data)));
        ws.onerror = reject;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint(), name }));
          resolve({ ws, inbox });
        };
      });
    const until = async (cond: () => boolean) => {
      for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
      expect(cond()).toBe(true);
    };
    try {
      const a = await open('Ada');
      const b = await open('Bo');
      await until(() => a.inbox.some((m) => m.type === 'welcome') && b.inbox.some((m) => m.type === 'welcome'));
      a.ws.send(JSON.stringify({ type: 'host' }));
      await until(() => a.inbox.some((m) => m.type === 'room'));
      const code = (a.inbox.find((m) => m.type === 'room') as Extract<ServerMsg, { type: 'room' }>).room.code;
      b.ws.send(JSON.stringify({ type: 'join', code }));
      await until(() => b.inbox.some((m) => m.type === 'room'));
      a.ws.send(JSON.stringify({ type: 'ready', ready: true }));
      b.ws.send(JSON.stringify({ type: 'ready', ready: true }));
      await until(() => b.inbox.filter((m) => m.type === 'turn').length >= 5);
      const ticks = b.inbox.flatMap((m) => (m.type === 'turn' ? [m.tick] : []));
      expect(ticks).toEqual([...ticks].sort((x, y) => x - y));
      a.ws.close();
      b.ws.close();
    } finally {
      mp.close();
      await new Promise((r) => http.close(r));
    }
  });
});
