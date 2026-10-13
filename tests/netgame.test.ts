import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNITS } from '../src/sim/data.ts';
import { Lobby } from '../server/lobby.ts';
import { MpClient } from '../src/net/client.ts';
import type { SocketLike } from '../src/net/connection.ts';
import type { NetGame } from '../src/net/netgame.ts';
import { hashWorld } from '../src/sim/hash.ts';
import type { World } from '../src/sim/world.ts';

/**
 * A simulated network on a fake clock: an in-process server, sockets with latency, jitter and
 * outages, and clients rendering frames at 60 fps.
 */
class SimNet {
  now = 0;
  latency = 5;
  jitter = 0;
  private seed = 12345;
  private queue: { at: number; n: number; fn: () => void }[] = [];
  private n = 0;
  readonly lobby: Lobby;
  readonly clients: MpClient[] = [];
  /** Clients whose page renders no frames (a frozen / throttled tab). */
  readonly frozen = new Set<MpClient>();
  /** Sockets currently "unplugged" (messages dropped, as on a dead Wi-Fi link). */
  readonly cut = new Set<FakeSocket>();

  constructor() {
    this.lobby = new Lobby({ now: () => this.now, countdown: 1, awayGrace: 60 });
  }

  rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  later(fn: () => void, lane: { last: number }): void {
    const at = Math.max(lane.last, this.now + this.latency + this.rand() * this.jitter);
    lane.last = at;
    this.queue.push({ at, n: this.n++, fn });
  }

  client(name: string): MpClient {
    const c = new MpClient({ name, url: 'ws://test/mp', storage: null, now: () => this.now, socket: () => new FakeSocket(this) });
    this.clients.push(c);
    c.start();
    return c;
  }

  /** Advances the fake clock; clients render a frame every ~16.7 ms. */
  run(ms: number, onFrame?: () => void): void {
    const end = this.now + ms;
    let nextFrame = this.now;
    while (this.now < end) {
      this.now += 1;
      this.queue.sort((a, b) => a.at - b.at || a.n - b.n);
      while (this.queue.length && this.queue[0].at <= this.now) this.queue.shift()!.fn();
      vi.advanceTimersByTime(1);
      if (this.now % 4 === 0) this.lobby.update();
      if (this.now >= nextFrame) {
        nextFrame += 1000 / 60;
        for (const c of this.clients) if (!this.frozen.has(c)) c.game?.advance(1 / 60);
        onFrame?.();
      }
    }
  }
}

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  private up = { last: 0 };
  private down = { last: 0 };
  private handlers: { message: (d: string) => void; close: () => void };
  private readonly net: SimNet;

  constructor(net: SimNet) {
    this.net = net;
    this.handlers = net.lobby.connect({
      send: (data) => {
        if (this.net.cut.has(this)) return;
        net.later(() => this.readyState === 1 && this.onmessage?.({ data }), this.down);
      },
      close: (code) => this.close(code),
    });
    net.later(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, this.down);
  }

  send(data: string): void {
    if (this.net.cut.has(this)) return;
    this.net.later(() => this.handlers.message(data), this.up);
  }

  close(code?: number): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.net.later(() => this.handlers.close(), this.up);
    this.net.later(() => this.onclose?.({ code }), this.down);
  }

  /** The link dies silently; the server notices (heartbeat) and the socket closes. */
  kill(): void {
    this.net.cut.add(this);
    this.readyState = 3;
    this.handlers.close();
    this.onclose?.({});
  }
}

let net: SimNet;
// Reconnect backoff and pings run on (fake) timers in step with the simulated clock.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  for (const c of net?.clients ?? []) c.stop();
  vi.useRealTimers();
});

function twoPlayers(setup?: (n: SimNet) => void): { a: MpClient; b: MpClient; ga: NetGame; gb: NetGame } {
  net = new SimNet();
  setup?.(net);
  const a = net.client('Ada');
  const b = net.client('Bo');
  net.run(400);
  a.host();
  net.run(400);
  b.join(a.room!.code);
  net.run(400);
  a.ready(true);
  b.ready(true);
  net.run(400);
  expect(a.game).not.toBeNull();
  expect(b.game).not.toBeNull();
  return { a, b, ga: a.game!, gb: b.game! };
}

/** Both replicas at the same tick have the same state. */
function expectInSync(ga: NetGame, gb: NetGame): void {
  // Let the trailing one catch up to the other's tick, then compare.
  for (let i = 0; i < 200 && ga.world.tick !== gb.world.tick; i++) net.run(5);
  expect(ga.world.tick).toBe(gb.world.tick);
  expect(hashWorld(ga.world)).toBe(hashWorld(gb.world));
}

describe('NetGame over a simulated network', () => {
  it('counts down, then both players see the same battle', () => {
    const { a, b, ga, gb } = twoPlayers();
    expect(ga.seat).toBe(0);
    expect(gb.seat).toBe(1);
    expect(ga.foeName).toBe('Bo');
    expect(ga.paused).toBe(true); // countdown
    net.run(1200);
    expect(ga.paused).toBe(false);
    expect(ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: 1 }).ok).toBe(true);
    expect(gb.command({ type: 'train', team: 1, unitId: 'pixie', lane: 1 }).ok).toBe(true);
    // Someone else's side is refused locally.
    expect(gb.command({ type: 'train', team: 0, unitId: 'pixie', lane: 1 }).ok).toBe(false);
    net.run(30_000);
    expect(ga.world.players[0].stats.summoned).toBe(1);
    expect(gb.world.players[1].stats.summoned).toBe(1);
    expectInSync(ga, gb);
    expect(ga.desyncs + gb.desyncs).toBe(0);
    expect(a.room!.phase).toBe('playing');
    expect(b.state).toBe('online');
  });

  it('local checks count orders still on their way (no double spending)', () => {
    const { ga } = twoPlayers();
    net.run(1200);
    // Enough gold for one redcap, not two (on this replica; the server has its own copy).
    ga.world.players[0].gold = UNITS.redcap.cost * 1.5;
    const first = ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: 0 });
    const second = ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: 0 });
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: 'Not enough gold' });
    // The HUD already shows the gold as spent and the summon as pending.
    expect(ga.displayGold()).toBeCloseTo(UNITS.redcap.cost * 0.5, 5);
    expect(ga.pendingTrains()).toEqual([{ unitId: 'redcap', lane: 0 }]);
    net.run(400);
    expect(ga.pendingTrains()).toEqual([]);
  });

  it('plays smoothly on jittery Wi-Fi: steady pace, no desync', () => {
    const { ga, gb } = twoPlayers((n) => {
      n.latency = 20;
      n.jitter = 120;
    });
    net.run(1500);
    let last = ga.world.tick;
    const steps: number[] = [];
    net.run(20_000, () => {
      steps.push(ga.world.tick - last);
      last = ga.world.tick;
    });
    // At 60 fps and 60 ticks/s nearly every frame advances exactly one tick.
    const smooth = steps.filter((s) => s === 1).length / steps.length;
    if (process.env.NET_STATS) process.stderr.write(`smooth ${smooth.toFixed(3)} buffer ${ga.bufferMs.toFixed(0)} max ${Math.max(...steps)}\n`);
    expect(smooth).toBeGreaterThan(0.9);
    expect(Math.max(...steps)).toBeLessThanOrEqual(3);
    expect(ga.bufferMs).toBeLessThan(250);
    expectInSync(ga, gb);
  });

  it('a phone that drops off reconnects into the same battle', () => {
    const { a, ga, gb, b } = twoPlayers();
    net.run(5000);
    ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: 2 });
    net.run(500);
    // Kill b's socket silently.
    const sock = (b.conn as unknown as { ws: FakeSocket }).ws;
    sock.kill();
    net.run(300);
    expect(ga.netPause).toMatchObject({ reason: 'away', seat: 1 });
    expect(ga.paused).toBe(true);
    expect(gb.paused).toBe(true); // offline
    net.run(4000); // backoff retry reconnects
    expect(b.state).toBe('online');
    expect(b.game).toBe(gb);
    expect(gb.resyncs).toBe(1);
    net.run(3500); // resume countdown
    expect(ga.paused).toBe(false);
    net.run(5000);
    expectInSync(ga, gb);
    expect(a.room!.seats[1]!.connected).toBe(true);
  });

  it('a page frozen for 15 s catches up at once, without effects, and stays in sync', () => {
    const { b, ga, gb } = twoPlayers();
    net.run(3000);
    let events = 0;
    gb.onEvents((ev) => (events += ev.length));
    net.frozen.add(b);
    for (let i = 0; i < 5; i++) {
      ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: i % 3 });
      net.run(3000);
    }
    expect(gb.backlog).toBeGreaterThan(800);
    net.frozen.delete(b);
    net.run(100);
    expect(gb.backlog).toBeLessThan(20);
    expect(events).toBeLessThan(40); // the skipped stretch made no fireworks
    expect(gb.desyncs).toBe(0);
    expectInSync(ga, gb);
  });

  it('leaving while offline sticks: the reconnect does not pull you back into the battle', () => {
    const { a, b, ga, gb } = twoPlayers();
    net.run(3000);
    (b.conn as unknown as { ws: FakeSocket }).ws.kill();
    net.run(50);
    b.leave(); // the player quits from the menu while the Wi-Fi is down
    expect(b.room).toBeNull();
    net.run(5000); // reconnects, then tells the server
    expect(b.state).toBe('online');
    expect(b.room).toBeNull();
    expect(b.game).toBe(gb);
    expect(gb.over).toBe(true);
    expect(ga.result).toEqual({ winner: 0, reason: 'forfeit' });
    expect(a.room!.seats[1]).toBeNull();
  });

  it('leaving while the start is on its way does not start that battle (backlog 48)', () => {
    net = new SimNet();
    net.latency = 50;
    const a = net.client('Ada');
    const b = net.client('Bo');
    net.run(400);
    a.host();
    net.run(400);
    b.join(a.room!.code);
    net.run(400);
    b.ready(true);
    net.run(200);
    a.ready(true); // the server starts the battle at once; 'start' reaches Ada 100 ms from now
    net.run(70);
    a.leave();
    net.run(1000);
    expect(a.game).toBeNull();
    expect(a.room).toBeNull();
    expect(b.room!.seats[0]).toBeNull();
    // And she can host again straight away.
    a.host();
    net.run(400);
    expect(a.room?.seats[0]?.name).toBe('Ada');
  });

  it('a battle the server stopped on a fault is dropped on both pages, like after a restart', () => {
    const { a, b, ga, gb } = twoPlayers();
    net.run(2000);
    const rooms = (net.lobby as unknown as { rooms: Map<string, { match: { update: () => void } }> }).rooms;
    const errors = console.error;
    console.error = () => {};
    try {
      rooms.get(a.room!.code)!.match.update = () => {
        throw new Error('boom');
      };
      net.run(3000);
    } finally {
      console.error = errors;
    }
    for (const [c, g] of [[a, ga], [b, gb]] as const) {
      expect(c.state).toBe('online');
      expect(c.room).toBeNull();
      expect(c.sessionLost).toBe('fault');
      expect(g.over).toBe(true);
      expect(g.result).toBeNull();
    }
  });

  it('a Ready right after one’s own handicap change is not taken as stale (backlog 229)', () => {
    net = new SimNet();
    net.latency = 60;
    const a = net.client('Ada');
    const b = net.client('Bo');
    net.run(400);
    a.host();
    net.run(400);
    b.join(a.room!.code);
    net.run(400);
    b.ready(true);
    net.run(400);
    // Ada takes a handicap and presses Ready at once (the server's word on the handicap is
    // still on its way); Bo, told of it, readies again.
    a.setTrials(['glass']);
    a.ready(true);
    net.run(400);
    expect(a.room!.seats[0]).toMatchObject({ ready: true, trials: ['glass'] });
    b.ready(true);
    net.run(400);
    expect(a.game).not.toBeNull();
  });

  it('a phone that lost its seat while away knows which room it was (backlog 160)', () => {
    net = new SimNet();
    const a = net.client('Ada');
    const b = net.client('Bo');
    net.run(400);
    a.host();
    net.run(400);
    const code = a.room!.code;
    b.join(code);
    net.run(400);
    const conn = (b as unknown as { conn: { close(): void; open(): void } }).conn;
    conn.close(); // (the phone locks)
    net.run(75_000); // longer than the seat is kept for a room that isn't fighting
    expect(a.room!.seats[1]).toBeNull();
    conn.open();
    net.run(2000);
    expect(b.sessionLost).toBe('expired');
    expect(b.lostRoom).toBe(code);
    expect(b.room).toBeNull();
    // (The app joins it again; the free seat is there to take.)
    b.join(b.lostRoom!);
    net.run(400);
    expect(b.room?.code).toBe(code);
    expect(a.room!.seats[1]).toMatchObject({ name: 'Bo', connected: true });
  });

  it('refused for good (another version, another tab): no battle or room left waiting (backlog 220)', () => {
    const { a, b, ga, gb } = twoPlayers();
    net.run(2000);
    // The server was restarted with another build: it refuses this page's hello.
    (b as unknown as { onMessage(m: unknown, at: number): void }).onMessage({ type: 'error', code: 'version', message: 'reload' }, net.now);
    expect(b.versionMismatch).toBe(true);
    expect(gb.over).toBe(true);
    expect(b.room).toBeNull();
    expect(b.seat).toBeNull();
    // Another tab took over this session (close code 4001).
    (a.conn as unknown as { onRefused(code: number): void }).onRefused(4001);
    expect(a.replaced).toBe(true);
    expect(ga.over).toBe(true);
    expect(a.room).toBeNull();
  });

  it('a phone that missed the end of the battle sees the result when it reconnects', () => {
    const { a, b, ga, gb } = twoPlayers();
    net.run(3000);
    (b.conn as unknown as { ws: FakeSocket }).ws.kill();
    net.run(50);
    a.leave();
    net.run(5000);
    expect(ga.over).toBe(true);
    expect(gb.result).toEqual({ winner: 1, reason: 'forfeit' });
    expect(gb.over).toBe(true);
    expect(b.room!.phase).toBe('waiting');
  });

  it('a phone that missed a citadel’s fall sees the result when it reconnects (backlog 218)', () => {
    // Co-op (the battle goes on while one ally is away): Bo's phone locks, Ada wins alone.
    net = new SimNet();
    const a = net.client('Ada');
    const b = net.client('Bo');
    net.run(400);
    a.host();
    net.run(400);
    a.setCoop('novice');
    b.join(a.room!.code);
    net.run(400);
    a.ready(true);
    b.ready(true);
    net.run(3400);
    const gb = b.game!;
    let ended = 0;
    gb.onEvents((ev) => (ended += ev.filter((e) => e.type === 'gameOver').length));
    b.conn.close();
    net.run(1000);
    const match = (net.lobby as unknown as { rooms: Map<string, { match: { world: World } }> }).rooms.get(a.room!.code)!.match;
    match.world.players[1].baseHp = 1;
    match.world.damageBase(1, 10, 0, 0);
    net.run(5000);
    expect(a.game!.result).toMatchObject({ winner: 0 });
    expect(gb.over).toBe(false);
    // Back: the battle's end is replayed (a snapshot of the fallen citadel, then 'over').
    b.conn.open();
    net.run(2000);
    expect(gb.result).toMatchObject({ winner: 0 });
    expect(gb.over).toBe(true);
    expect(ended).toBe(1);
  });

  it('a replica that reaches the last tick before the verdict waits for it (backlog 219)', () => {
    const { ga } = twoPlayers();
    net.run(3000);
    const ends: (string | null)[] = [];
    ga.onEvents((ev) => ev.some((e) => e.type === 'gameOver') && ends.push(ga.result?.reason ?? null));
    // The citadel falls on this replica's last tick, but the server's 'over' is late (a lost
    // packet resent): no results yet — they'd say nothing of who won or why.
    ga.world.players[1].baseHp = 1;
    ga.world.damageBase(1, 10, 0, 0);
    ga.world.step();
    (ga as unknown as { publish(): void }).publish();
    expect(ends).toEqual([]);
    expect(ga.over).toBe(false);
    (ga as unknown as { onOver(m: unknown): void }).onOver({ type: 'over', winner: 0, reason: 'citadel' });
    expect(ends).toEqual(['citadel']);
    expect(ga.over).toBe(true);
  });

  it('repairs a diverged replica from a snapshot', () => {
    const { ga, gb } = twoPlayers();
    net.run(3000);
    gb.world.players[1].gold += 1; // something went wrong on this device
    net.run(3000);
    expect(gb.desyncs).toBe(1);
    expect(gb.resyncs).toBe(1);
    net.run(2000);
    expectInSync(ga, gb);
  });

  it('away during the countdown: both start once they are back', () => {
    const { b, ga, gb } = twoPlayers();
    b.away(true);
    net.run(3000);
    expect(ga.paused).toBe(true);
    expect(ga.world.tick).toBe(0);
    // Orders during the countdown are refused locally (the server would drop them).
    expect(ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: 0 }).ok).toBe(false);
    b.away(false);
    net.run(4500);
    expect(ga.paused).toBe(false);
    expect(gb.paused).toBe(false);
    expect(ga.world.tick).toBeGreaterThan(30);
    expect(ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: 0 }).ok).toBe(true);
    net.run(500);
    expect(ga.world.players[0].stats.summoned + ga.world.players[0].queue.length).toBe(1);
    expectInSync(ga, gb);
  });

  it('pause by one player, resume by the other', () => {
    const { a, b, ga, gb } = twoPlayers();
    net.run(3000);
    a.pause();
    net.run(100);
    expect(gb.netPause).toEqual({ reason: 'pause', seat: 0, pausesLeft: [2, 3] });
    expect(gb.pausesLeft).toEqual([2, 3]);
    const t = gb.world.tick;
    net.run(2000);
    expect(gb.world.tick).toBe(t);
    expect(ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: 2 }).ok).toBe(false);
    b.resume();
    net.run(3500);
    expect(gb.world.tick).toBeGreaterThan(t + 10);
    expectInSync(ga, gb);
  });

  it('leaving forfeits: the other player wins', () => {
    const { a, b, ga, gb } = twoPlayers();
    net.run(3000);
    let ended = 0;
    gb.onEvents((ev) => (ended += ev.filter((e) => e.type === 'gameOver').length));
    a.leave();
    net.run(200);
    expect(gb.result).toEqual({ winner: 1, reason: 'forfeit' });
    expect(gb.over).toBe(true);
    expect(ended).toBe(1);
    expect(ga.over).toBe(true);
    expect(b.room!.phase).toBe('waiting');
  });

  it('a long, busy battle stays in sync', () => {
    const { ga, gb } = twoPlayers();
    net.run(2000);
    for (let i = 0; i < 40; i++) {
      ga.command({ type: 'train', team: 0, unitId: 'redcap', lane: i % 3 });
      net.run(3000);
      if (ga.over) break;
    }
    expectInSync(ga, gb);
    expect(ga.desyncs + gb.desyncs).toBe(0);
  });
});

describe('NetGame on its own', () => {
  it('the HUD’s blocker counts orders still on their way (no "ready" button that a tap refuses — backlog 63)', async () => {
    const { NetGame } = await import('../src/net/netgame.ts');
    const { AGES, AGE_UNITS } = await import('../src/sim/data.ts');
    const g = new NetGame({ seat: 0, names: ['A', 'B'], seed: 5, countdown: 0, send: () => true, now: () => 0 });
    const me = g.world.players[0];
    const tithe = AGES[1].ascendCost;
    const guardian = AGE_UNITS[0][0];
    me.xp = AGES[1].xpRequired;
    me.gold = tithe + guardian.cost - 1;
    expect(g.blocker({ type: 'ageUp', team: 0 })).toBeNull();
    expect(g.command({ type: 'train', team: 0, unitId: guardian.id, lane: 1 }).ok).toBe(true);
    // The summon is on its way: the gold left is short of the tithe, as the counter shows.
    expect(g.displayGold()).toBe(tithe - 1);
    expect(g.blocker({ type: 'ageUp', team: 0 })).toBe('Not enough gold');
  });

  it('asks for a snapshot at once when orders arrive for ticks already played', async () => {
    const { NetGame } = await import('../src/net/netgame.ts');
    const sent: string[] = [];
    let now = 0;
    const g = new NetGame({ seat: 0, names: ['A', 'B'], seed: 5, countdown: 0, send: (m) => (sent.push(m.type), true), now: () => now });
    g.receive({ type: 'turn', tick: 2 }, 0);
    g.receive({ type: 'turn', tick: 4 }, 33);
    now = 500;
    g.advance(0.5);
    expect(g.world.tick).toBe(4);
    // A turn whose order was for tick 3 — already simulated here.
    g.receive({ type: 'turn', tick: 6, cmds: [{ tick: 3, team: 1, seq: 1, cmd: { type: 'train', unitId: 'redcap', lane: 0 } }] }, 520);
    expect(sent).toContain('resync');
    expect(g.desyncs).toBe(1);
    g.advance(0.016);
    expect(g.paused).toBe(true); // waits for the snapshot
  });
});
