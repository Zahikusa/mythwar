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

  hello(name: string, token?: string, extra: { battle?: boolean; away?: boolean; rank?: number; device?: string; sigil?: number } = {}): void {
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

function setup(opts: { awayGrace?: number; silentAway?: number; store?: ServerStore; today?: () => number; hallKeysMax?: number; hallHash?: (network: string, salt: string) => string } = {}) {
  let now = 1000;
  let r = 0.37;
  const lobby = new Lobby({
    now: () => now,
    random: () => (r = (r * 9301 + 49297) % 233280 / 233280),
    countdown: 3,
    awayGrace: opts.awayGrace ?? 90,
    // (These fake clients don't ping as pages do: silence means nothing unless a test says so.)
    silentAway: opts.silentAway ?? 0,
    store: opts.store,
    today: opts.today,
    hallKeysMax: opts.hallKeysMax,
    hallHash: opts.hallHash,
  });
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 5) {
      now += 5;
      lobby.update();
    }
  };
  /** Time passes without the server running at all (a stalled process). */
  const stall = (ms: number) => void (now += ms);
  return { lobby, run, stall };
}

/** Two players in a running battle. */
function battle(opts: { awayGrace?: number; silentAway?: number; store?: ServerStore; today?: () => number } = {}) {
  const { lobby, run, stall } = setup(opts);
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
  return { lobby, run, stall, a, b, code };
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

  it('co-op: an ally leaving while the other is away for a moment doesn’t lose the battle (backlog 188)', () => {
    const coopBattle = () => {
      const { lobby, run } = setup({ awayGrace: 10 });
      const a = new FakeClient(lobby);
      const b = new FakeClient(lobby);
      a.hello('Ada');
      b.hello('Bo');
      a.send({ type: 'host' });
      b.send({ type: 'join', code: a.last('room')!.room.code });
      a.send({ type: 'coop', coop: 'novice' });
      a.send({ type: 'ready', ready: true, rev: a.last('room')!.room.rev });
      b.send({ type: 'ready', ready: true, rev: b.last('room')!.room.rev });
      expect(b.last('start')!.coop).toBe('novice');
      run(4000);
      return { run, a, b };
    };
    // B switches apps for two seconds; A leaves meanwhile: the battle waits for B, then runs on.
    {
      const { run, a, b } = coopBattle();
      b.send({ type: 'away', away: true });
      run(500);
      a.send({ type: 'leave' });
      run(1500);
      expect(b.last('over')).toBeUndefined();
      expect(b.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
      b.send({ type: 'away', away: false });
      run(5000);
      expect(b.last('over')).toBeUndefined();
      expect(b.inbox.at(-1)?.type).toBe('turn');
    }
    // …but if B stays away past their own grace, the side is lost (nobody is left).
    {
      const { run, a, b } = coopBattle();
      b.send({ type: 'away', away: true });
      run(500);
      a.send({ type: 'leave' });
      run(11_000);
      expect(b.last('over')).toMatchObject({ winner: 1, reason: 'timeout' });
    }
  });

  it('co-op: a win counts for the allies still in it; a room its ally left opens again (backlog 190, 192)', () => {
    const { lobby, run } = setup({ awayGrace: 10 });
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    const watcher = new FakeClient(lobby);
    a.hello('Ada');
    b.hello('Bo');
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    a.send({ type: 'host' });
    const code = a.last('room')!.room.code;
    b.send({ type: 'join', code });
    a.send({ type: 'coop', coop: 'novice' });
    a.send({ type: 'ready', ready: true, rev: a.last('room')!.room.rev });
    b.send({ type: 'ready', ready: true, rev: b.last('room')!.room.rev });
    run(4000);
    // Bo's tab closes and never comes back; Ada fights on and wins after Bo's grace ran out.
    b.disconnect();
    run(12_000);
    const room = (lobby as unknown as { rooms: Map<string, { match: { finish(w: number, r: string): void } }> }).rooms.get(code)!;
    (room.match as unknown as { finish(w: number, r: string): void }).finish(0, 'citadel');
    run(300);
    expect(a.last('over')).toMatchObject({ winner: 0 });
    expect(watcher.last('rooms')!.hall).toEqual([{ name: 'Ada', sigil: -1, w: 0, l: 0, coop: 1 }]);
    // A second battle: Bo is back in, then leaves mid-battle; Ada wins alone.
    const c = new FakeClient(lobby);
    c.hello('Bo2');
    a.send({ type: 'leave' });
    a.send({ type: 'host' });
    const code2 = a.last('room')!.room.code;
    c.send({ type: 'join', code: code2 });
    a.send({ type: 'coop', coop: 'novice' });
    a.send({ type: 'ready', ready: true, rev: a.last('room')!.room.rev });
    c.send({ type: 'ready', ready: true, rev: c.last('room')!.room.rev });
    run(4000);
    c.send({ type: 'leave' });
    run(1000);
    const room2 = (lobby as unknown as { rooms: Map<string, { match: unknown }> }).rooms.get(code2)!;
    (room2.match as { finish(w: number, r: string): void }).finish(0, 'citadel');
    run(300);
    // The room is open again — listed, the score starting over — for a new ally.
    expect(a.last('room')!.room).toMatchObject({ phase: 'waiting' });
    expect(a.last('room')!.room.seats[0]!.wins).toBe(0);
    expect(watcher.last('rooms')!.rooms.map((r) => r.code)).toContain(code2);
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
    a.hello('Ada', undefined, { rank: 3, sigil: 2 });
    b.hello('Bo', undefined, { rank: 99 });
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    a.send({ type: 'host' });
    lobby.update();
    expect(watcher.last('rooms')!.rooms.map((r) => [r.rank, r.sigil])).toEqual([[3, 2]]);
    b.send({ type: 'join', code: a.last('room')!.room.code });
    expect(a.last('room')!.room.seats.map((s) => s!.rank)).toEqual([3, 0]);
    b.send({ type: 'name', name: 'Bo', rank: 2 });
    expect(a.last('room')!.room.seats.map((s) => s!.rank)).toEqual([3, 2]);
    // A rename without a rank keeps it.
    b.send({ type: 'name', name: 'Bob' });
    expect(a.last('room')!.room.seats.map((s) => s!.rank)).toEqual([3, 2]);
    // Sigils too (Lens #85): none by default, sanitized, shown to both.
    expect(a.last('room')!.room.seats.map((s) => s!.sigil)).toEqual([2, -1]);
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

  it('a player gone quiet in a battle counts as away until heard from again (backlog 222)', () => {
    const { run, a, b } = battle({ silentAway: 4 });
    // Pages ping every second; a phone out of the Wi-Fi leaves its socket open and says nothing.
    const step = (secs: number, quiet: FakeClient | null = null) => {
      for (let i = 0; i < secs; i++) {
        for (const c of [a, b]) if (c !== quiet) c.send({ type: 'ping', t: 0, rtt: 20 });
        run(1000);
      }
    };
    step(3);
    expect(a.last('paused')).toBeUndefined();
    step(3, b);
    expect(a.last('paused')).toBeUndefined(); // (a blip)
    step(2, b);
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
    const held = a.world!.tick;
    step(3, b);
    expect(a.world!.tick).toBe(held);
    b.send({ type: 'ping', t: 0, rtt: 20 });
    expect(a.last('resuming')).toBeDefined();
    step(4);
    expect(a.world!.tick).toBeGreaterThan(held);
    // A page that said it's in the background and went quiet stays away when it's heard from.
    b.send({ type: 'away', away: true });
    step(6, b);
    const before = a.inbox.length;
    b.send({ type: 'ping', t: 0, rtt: 20 });
    step(1);
    expect(a.inbox.slice(before).some((m) => m.type === 'resuming')).toBe(false);
    b.send({ type: 'away', away: false });
    expect(a.last('resuming')).toBeDefined();
  });

  it('silence: a battle that ended while away, a quiet first word, a stalled server (backlog 222)', () => {
    const { lobby, run, stall, a, b } = battle({ silentAway: 4 });
    const step = (secs: number, quiet: FakeClient | null = null) => {
      for (let i = 0; i < secs; i++) {
        for (const c of [a, b]) if (c !== quiet) c.send({ type: 'ping', t: 0, rtt: 20 });
        run(1000);
      }
    };
    // B's page goes to the background and A claims the win: B never says "back" (that's only
    // said in a battle). In the rematch a quiet spell of B's ends when B is heard from again.
    b.send({ type: 'away', away: true });
    step(21, b);
    a.send({ type: 'claim' });
    expect(a.last('over')).toMatchObject({ winner: 0, reason: 'timeout' });
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    step(4);
    expect(b.last('start')).toBeDefined();
    let before = a.inbox.length;
    step(6, b);
    expect(a.inbox.slice(before).some((m) => m.type === 'paused')).toBe(true);
    b.send({ type: 'ping', t: 0, rtt: 20 });
    expect(a.last('resuming')).toBeDefined();
    step(4);
    // A quiet player's first word is "away" (the page went to the background meanwhile): no
    // flicker of "resuming" before the pause.
    step(6, b);
    before = a.inbox.length;
    b.send({ type: 'away', away: true });
    step(1);
    expect(a.inbox.slice(before).some((m) => m.type === 'resuming')).toBe(false);
    b.send({ type: 'away', away: false });
    step(4);
    // The server itself stalls for 6 s (the host's laptop dozed): nobody was silent.
    before = a.inbox.length;
    stall(6000);
    lobby.update();
    step(2);
    expect(a.inbox.slice(before).some((m) => m.type === 'paused')).toBe(false);
  });

  it('a host whose phone reconnects is listed again (backlog 226)', () => {
    const { lobby, run } = setup();
    const a = new FakeClient(lobby);
    const watcher = new FakeClient(lobby);
    a.hello('Ada');
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    a.send({ type: 'host' });
    run(300);
    expect(watcher.last('rooms')!.rooms.map((r) => r.host)).toEqual(['Ada']);
    a.disconnect(); // (the phone locks)
    run(300);
    expect(watcher.last('rooms')!.rooms).toEqual([]);
    a.reconnect();
    run(300);
    expect(watcher.last('rooms')!.rooms.map((r) => r.code)).toEqual([a.last('room')!.room.code]);
  });

  it('a seat gone during a battle is kept for the full grace after the result (backlog 225)', () => {
    // Co-op: Bo's phone locks early; Ada wins alone minutes later.
    const { lobby, run } = setup({ awayGrace: 600 });
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('Ada');
    b.hello('Bo');
    a.send({ type: 'host' });
    const code = a.last('room')!.room.code;
    b.send({ type: 'join', code });
    a.send({ type: 'coop', coop: 'novice' });
    a.send({ type: 'ready', ready: true, rev: a.last('room')!.room.rev });
    b.send({ type: 'ready', ready: true, rev: b.last('room')!.room.rev });
    run(4000);
    b.disconnect();
    run(120_000);
    const room = (lobby as unknown as { rooms: Map<string, { match: { finish(w: number, r: string): void } }> }).rooms.get(code)!;
    room.match.finish(0, 'citadel');
    run(300);
    expect(a.last('over')).toMatchObject({ winner: 0 });
    // Bo still has a seat (a minute from the result), and Ada's victory still counts.
    expect(a.last('room')!.room.seats[1]).toMatchObject({ name: 'Bo', connected: false });
    expect(a.last('room')!.room.seats[0]!.wins).toBe(1);
    b.reconnect();
    run(300);
    expect(b.last('welcome')!.room?.code).toBe(code);
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
    run(300); // (a change right after another takes effect a moment later — backlog 71)
    expect(a.last('paused')!.state).toMatchObject({ reason: 'pause', seat: 0 });
  });

  it('away/back flipped many times a second is coalesced, the last wish kept (backlog 71)', () => {
    const { run, a, b } = battle();
    run(1000);
    const before = a.inbox.length;
    for (let i = 0; i < 50; i++) {
      b.send({ type: 'away', away: i % 2 === 0 });
      run(20);
    }
    // (The last message said "back".)
    run(500);
    const pauses = a.inbox.slice(before).filter((m) => m.type === 'paused').length;
    expect(pauses).toBeLessThanOrEqual(5);
    expect(a.last('resuming')).toBeDefined();
    run(4000);
    expect(a.inbox.slice(before).map((m) => m.type).lastIndexOf('resumed')).toBeGreaterThan(a.inbox.slice(before).map((m) => m.type).lastIndexOf('paused'));
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

  it('going away and back over and over cannot hold the battle forever (backlog 46)', () => {
    const { run, a, b } = battle();
    run(2000);
    // 19 s away, a moment back, away again: the claim clock does not start over.
    b.send({ type: 'away', away: true });
    run(19_000);
    b.send({ type: 'away', away: false });
    run(100);
    b.send({ type: 'away', away: true });
    run(1500);
    a.send({ type: 'claim' });
    expect(a.last('over')).toMatchObject({ winner: 0, reason: 'timeout' });
  });

  it('away and back within each resume countdown cannot hold the battle forever either (backlog 227)', () => {
    const { run, a, b } = battle();
    run(2000);
    const t0 = a.world!.tick;
    // 2 s away, 2.5 s "back" — but the battle only runs 3 s after a return: not a tick is played.
    for (let i = 0; i < 12; i++) {
      b.send({ type: 'away', away: true });
      run(2000);
      b.send({ type: 'away', away: false });
      run(2500);
    }
    b.send({ type: 'away', away: true });
    run(500);
    expect(a.world!.tick - t0).toBeLessThan(5);
    a.send({ type: 'claim' });
    expect(a.last('over')).toMatchObject({ winner: 0, reason: 'timeout' });
  });

  it('a short absence long after another starts its clocks afresh', () => {
    const { run, a, b } = battle();
    run(2000);
    b.send({ type: 'away', away: true });
    run(19_000);
    b.send({ type: 'away', away: false });
    // Back for longer than the absence: it is forgotten.
    run(25_000);
    b.send({ type: 'away', away: true });
    run(5000);
    a.send({ type: 'claim' });
    expect(a.last('over')).toBeUndefined();
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1, claimIn: 20 });
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

  it('the last turn goes out before the end of the battle, not after (backlog 49)', () => {
    const { run, a, b } = battle();
    run(2000);
    // (Turns go out every few ticks: leave between two, with a tick played but not yet sent.)
    const sent = () => (a.inbox.filter((m) => m.type === 'turn').at(-1) as { tick: number }).tick;
    const before = sent();
    while (sent() === before) run(5);
    run(20);
    b.send({ type: 'leave' });
    const types = a.inbox.map((m) => m.type);
    const over = types.lastIndexOf('over');
    expect(over).toBeGreaterThan(0);
    expect(types.slice(over)).not.toContain('turn');
    const last = a.inbox.slice(0, over).filter((m) => m.type === 'turn').at(-1) as { tick: number };
    expect(last.tick).toBe((a.inbox[over] as { tick: number }).tick);
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

  it('the same device in a new tab takes its dropped seat back; another device can’t (backlog 89)', () => {
    const { lobby, run, a, b, code } = battle();
    const bDevice = 'b0b0b0b0b0b0b0b0b0b0b0b0';
    run(2000);
    const rooms = (lobby as unknown as { rooms: Map<string, { seats: ({ session: { device: string } } | null)[] }> }).rooms;
    rooms.get(code)!.seats[1]!.session.device = bDevice;
    b.disconnect();
    run(100);
    const stranger = new FakeClient(lobby);
    stranger.hello('Cy', undefined, { device: 'c0c0c0c0c0c0c0c0c0c0c0c0' });
    // (Mid-battle the seat waits for its own tab: the battle ends — A leaves — and a host is back.)
    a.send({ type: 'leave' });
    run(10);
    const host = new FakeClient(lobby);
    host.hello('Ada');
    host.send({ type: 'join', code });
    run(10);
    const again = new FakeClient(lobby);
    again.hello('Bo', undefined, { device: bDevice });
    stranger.send({ type: 'join', code });
    expect(stranger.last('error')?.code).toBe('room-full');
    again.send({ type: 'join', code });
    expect(again.last('error')).toBeUndefined();
    expect(again.last('room')!.seat).toBe(1);
    expect(host.last('room')!.room.seats[1]).toMatchObject({ name: 'Bo', connected: true });
  });

  it('mid-battle too: a tab closed by Back and a QR scanned again picks the battle up (backlog 159)', () => {
    const { lobby, run, a, b, code } = battle();
    const bDevice = 'b0b0b0b0b0b0b0b0b0b0b0b0';
    run(2000);
    const rooms = (lobby as unknown as { rooms: Map<string, { seats: ({ session: { device: string } } | null)[] }> }).rooms;
    rooms.get(code)!.seats[1]!.session.device = bDevice;
    b.disconnect();
    run(500);
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
    // Another device can't take the seat of a running battle…
    const stranger = new FakeClient(lobby);
    stranger.hello('Cy', undefined, { device: 'c0c0c0c0c0c0c0c0c0c0c0c0' });
    stranger.send({ type: 'join', code });
    expect(stranger.last('error')?.code).toBe('room-full');
    // …the same phone, in a fresh tab (no session token), can.
    const again = new FakeClient(lobby);
    again.hello('Bo', undefined, { device: bDevice });
    again.send({ type: 'join', code });
    expect(again.last('error')).toBeUndefined();
    expect(again.last('room')!.seat).toBe(1);
    expect(again.last('snapshot')).toMatchObject({ seat: 1 });
    run(5000);
    // The battle runs on: B is no longer away, and A's orders reach the new tab.
    expect(a.last('room')!.room.seats[1]).toMatchObject({ connected: true, away: false });
    const before = again.inbox.filter((m) => m.type === 'turn').length;
    run(1000);
    expect(again.inbox.filter((m) => m.type === 'turn').length).toBeGreaterThan(before);
  });

  it('a Ready sent before the other player changed the terms is ignored (backlog 96)', () => {
    const { lobby } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('Ada');
    b.hello('Bo');
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    const seen = a.last('room')!.room.rev;
    b.send({ type: 'trials', trials: ['glass'] });
    // A's Ready was on its way while B's handicap reached the server first.
    a.send({ type: 'ready', ready: true, rev: seen });
    expect(a.last('room')!.room.seats[0]!.ready).toBe(false);
    a.send({ type: 'ready', ready: true, rev: a.last('room')!.room.rev });
    expect(a.last('room')!.room.seats[0]!.ready).toBe(true);
  });

  it('a held "back" from a link that closed doesn’t mark the gone player present (backlog 116)', () => {
    const { run, a, b } = battle();
    run(1000);
    b.send({ type: 'away', away: true });
    run(50);
    b.send({ type: 'away', away: false }); // (held back: within 250 ms of the last change)
    run(20);
    b.disconnect();
    run(1000);
    expect(a.last('paused')!.state).toMatchObject({ reason: 'away', seat: 1 });
    expect(a.last('room')!.room.seats[1]).toMatchObject({ connected: false });
    const resumedAfter = a.inbox.slice(-20).some((m) => m.type === 'resuming');
    expect(resumedAfter).toBe(false);
  });

  it('a host whose page dropped takes their own seat back, not the free guest seat (backlog 117)', () => {
    const { lobby } = setup();
    const dev = 'a1a1a1a1a1a1a1a1a1a1a1a1';
    const a = new FakeClient(lobby);
    a.hello('Ada', undefined, { device: dev });
    a.send({ type: 'host' });
    const code = a.last('room')!.room.code;
    a.disconnect();
    const again = new FakeClient(lobby);
    again.hello('Ada', undefined, { device: dev });
    again.send({ type: 'join', code });
    expect(again.last('room')!.seat).toBe(0);
    expect(again.last('room')!.room.seats[1]).toBeNull();
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
    // (Bo, without a victory, isn't listed — but kept: see the file test.)
    expect(hall.map((e) => e.name)).not.toContain('Bo');
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

  it("a public network's hall is stored under a salted hash, never its address (Lens #98)", async () => {
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
    const { lobby: again, run: runAgain } = setup({ store });
    const home = new FakeClient(again, '203.0.113.7');
    home.hello('Cy');
    home.send({ type: 'watchRooms', on: true });
    // (The network's slow hash runs in the background: the first list has no Hall yet — the
    // server's loop doesn't wait — and the next list, once it's ready, has.)
    expect(home.last('rooms')!.hall).toEqual([]);
    const elsewhere = new FakeClient(again, '198.51.100.1');
    elsewhere.hello('Dee');
    elsewhere.send({ type: 'watchRooms', on: true });
    for (let i = 0; i < 50 && !home.last('rooms')!.hall!.length; i++) {
      await new Promise((r) => setTimeout(r, 20));
      runAgain(300);
    }
    expect(home.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Ada']);
    expect(elsewhere.last('rooms')!.hall).toEqual([]);
  });

  it('a full hall-key cache drops the least recently used network, and a live one finds its Hall again (backlog 47)', async () => {
    // (A fast stand-in for scrypt: this test is about the cache, not the hash.)
    const { lobby, run } = setup({ hallKeysMax: 2, hallHash: (n, salt) => Buffer.from(`${salt}|${n}`).toString('base64url') });
    const settle = async (until: () => boolean) => {
      for (let i = 0; i < 100 && !until(); i++) {
        await new Promise((r) => setTimeout(r, 20));
        run(300);
      }
    };
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
    run(300);
    const home = new FakeClient(lobby, '203.0.113.7');
    home.hello('Cy');
    home.send({ type: 'watchRooms', on: true });
    await settle(() => !!home.last('rooms')?.hall?.length);
    expect(home.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Ada']);
    // (A network whose lists keep going out keeps its key fresh; this one looks away a while.)
    home.send({ type: 'watchRooms', on: false });
    // Three other networks show up: the home network's key is pushed out of the cache…
    const others = ['198.51.100.1', '198.51.100.2', '198.51.100.3'].map((ip, i) => {
      const c = new FakeClient(lobby, ip);
      c.hello(`Guest ${i}`);
      return c;
    });
    const keys = (lobby as unknown as { hallKeys: Map<string, string> }).hallKeys;
    await settle(() => !keys.has('203.0.113.7'));
    expect(others.length).toBe(3);
    // …and is hashed again in the background: the Hall comes back without a reconnect.
    home.send({ type: 'watchRooms', on: true });
    expect(home.last('rooms')!.hall).toEqual([]);
    await settle(() => !!home.last('rooms')?.hall?.length);
    expect(home.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Ada']);
  });

  it('a fault while handling a message is logged, not thrown (it would end every battle)', () => {
    const lines: string[] = [];
    const lobby = new Lobby({ log: (l) => lines.push(l) });
    const a = new FakeClient(lobby);
    a.hello('Ada');
    (lobby as unknown as { handle: () => void }).handle = () => {
      throw new Error('boom');
    };
    expect(() => a.send({ type: 'host' })).not.toThrow();
    expect(lines.some((l) => l.includes('"host" from Ada') && l.includes('boom'))).toBe(true);
  });

  it('a battle that throws stops alone; its players are told the server lost it (backlog 51)', () => {
    const lines: string[] = [];
    const { lobby, run, a, b } = battle();
    (lobby as unknown as { opts: { log: (l: string) => void } }).opts.log = (l) => lines.push(l);
    // Another battle on the same server.
    const c = new FakeClient(lobby);
    const d = new FakeClient(lobby);
    c.hello('Cy');
    d.hello('Dee');
    c.send({ type: 'host' });
    d.send({ type: 'join', code: c.last('room')!.room.code });
    c.send({ type: 'ready', ready: true });
    d.send({ type: 'ready', ready: true });
    run(3100);
    const rooms = (lobby as unknown as { rooms: Map<string, { match: { update: () => void } }> }).rooms;
    rooms.get(a.last('room')!.room.code)!.match.update = () => {
      throw new Error('boom');
    };
    const tick = c.last('turn')!.tick;
    expect(() => run(1000)).not.toThrow();
    expect(lines.filter((l) => l.includes('boom'))).toHaveLength(1);
    expect(a.open).toBe(false);
    expect(b.open).toBe(false);
    // The other battle runs on.
    expect(c.last('turn')!.tick).toBeGreaterThan(tick + 50);
    // Back, the session is unknown: the page drops the battle (as after a restart).
    a.reconnect({ battle: true });
    expect(a.last('welcome')).toMatchObject({ room: null, resumed: false });
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
    expect(hall.map((e) => `${e.name} ${e.w}–${e.l}`)).toEqual(['Queen Ada 3–0', 'Ada 1–0']);
    expect(Object.keys(hall[0])).not.toContain('key');
    // The ids stay out of the file (hashed) and the lines come back after a restart.
    run(5100);
    expect(JSON.stringify(store.saved)).not.toContain('aaaaaaaa');
    const { lobby: again } = setup({ store });
    const w2 = new FakeClient(again);
    w2.hello('Dee');
    w2.send({ type: 'watchRooms', on: true });
    expect(w2.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Queen Ada', 'Ada']);
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
    // Full-width and accented look-alikes (backlog 20).
    for (const trick of ['ＢＡＤＷＯＲＤ', 'bädwörd']) {
      a.send({ type: 'name', name: trick });
      expect(b.last('room')!.room.seats[0]!.name, trick).toBe('Player');
    }
    // A name saved in the Hall before the blocklist was set is checked when loaded.
    const store = memoryStore({ v: 1, halls: { lan: [{ name: 'Bad Word', sigil: -1, w: 3, l: 0, coop: 0 }] } });
    const strict = new Lobby({ store, blockedWords: ['badword'] });
    const w = new FakeClient(strict);
    w.hello('Cy');
    w.send({ type: 'watchRooms', on: true });
    expect(w.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Player']);
  });

  it('two tabs of one browser are one player to the Hall: their battle is not counted (backlog 21)', () => {
    const { lobby, run } = setup();
    const a = new FakeClient(lobby);
    const b = new FakeClient(lobby);
    a.hello('Ada', undefined, { device: 'dddddddddddddddddddddddd' });
    b.hello('Ada too', undefined, { device: 'dddddddddddddddddddddddd' });
    a.send({ type: 'host' });
    b.send({ type: 'join', code: a.last('room')!.room.code });
    a.send({ type: 'ready', ready: true });
    b.send({ type: 'ready', ready: true });
    run(3100);
    b.send({ type: 'leave' });
    run(300);
    expect(a.last('over')).toMatchObject({ winner: 0 });
    const watcher = new FakeClient(lobby);
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    expect(watcher.last('rooms')!.hall).toEqual([]);
  });

  it('a co-op champion is listed even behind many players who only lost (backlog 19)', () => {
    const losers = Array.from({ length: 6 }, (_, i) => ({ name: `L${i}`, sigil: -1, w: 0, l: 1, coop: 0 }));
    const store = memoryStore({ v: 1, halls: { lan: [...losers, { name: 'Ada', sigil: -1, w: 0, l: 3, coop: 12 }, { name: 'Bob', sigil: -1, w: 5, l: 0, coop: 0 }] } });
    const { lobby } = setup({ store });
    const watcher = new FakeClient(lobby);
    watcher.hello('Cy');
    watcher.send({ type: 'watchRooms', on: true });
    expect(watcher.last('rooms')!.hall!.map((e) => e.name)).toEqual(['Bob', 'Ada']);
  });

  it('shutting down mid-save still leaves the newest Hall on disk (backlog 16)', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const store = fileStore(join(mkdtempSync(join(tmpdir(), 'mythwar-')), 'data.json'));
    const { lobby, run, b } = battle({ store });
    run(2000);
    b.send({ type: 'leave' });
    run(5100); // a background save has started (and isn't finished)
    lobby.flush(true); // Ctrl+C
    expect(store.load()!.halls.lan.map((e) => [e.name, e.w, e.l])).toEqual([['Ada', 1, 0], ['Bo', 0, 1]]);
    await store.idle();
    expect(store.load()!.halls.lan.length).toBe(2);
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
    const again = fileStore(path, (l) => lines.push(l));
    expect(again.load()).toBeNull();
    expect(lines.length).toBe(1);
    // (Backlog 65) The unreadable file is kept aside, not overwritten by the next save.
    again.save({ v: 1, halls: {} });
    await again.idle();
    const aside = readdirSync(join(dir, 'sub')).filter((f) => f.startsWith('data.json.unreadable-'));
    expect(aside).toHaveLength(1);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(join(dir, 'sub', aside[0]), 'utf8')).toBe('{ not json');
    expect(lines[0]).toContain(aside[0]);
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
