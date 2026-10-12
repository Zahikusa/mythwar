import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/lobby.ts';
import { networkOf } from '../server/lan.ts';
import { validateCommand } from '../server/validate.ts';
import { PROTOCOL_VERSION } from '../src/net/protocol.ts';
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

  constructor(lobby: Lobby) {
    this.lobby = lobby;
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
    });
  }

  private receive(m: ServerMsg): void {
    this.inbox.push(m);
    if (m.type === 'welcome') this.token = m.token;
    if (m.type === 'start') this.world = new World({ seed: m.seed });
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

  hello(name: string, token?: string, extra: { battle?: boolean; away?: boolean } = {}): void {
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

function setup(opts: { awayGrace?: number } = {}) {
  let now = 1000;
  let r = 0.37;
  const lobby = new Lobby({
    now: () => now,
    random: () => (r = (r * 9301 + 49297) % 233280 / 233280),
    countdown: 3,
    awayGrace: opts.awayGrace ?? 90,
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
function battle(opts: { awayGrace?: number } = {}) {
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
    expect(a.last('paused')!.state).toEqual({ reason: 'pause', seat: 0 });
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

  it('pause and resume by either player', () => {
    const { run, a, b } = battle();
    run(1000);
    a.send({ type: 'pause' });
    expect(b.last('paused')!.state).toEqual({ reason: 'pause', seat: 0 });
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
