import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNITS } from '../src/sim/data.ts';
import { Lobby } from '../server/lobby.ts';
import { MpClient } from '../src/net/client.ts';
import type { SocketLike } from '../src/net/connection.ts';
import type { NetGame } from '../src/net/netgame.ts';
import { hashWorld } from '../src/sim/hash.ts';

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
        for (const c of this.clients) c.game?.advance(1 / 60);
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
      close: () => this.close(),
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

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.net.later(() => this.handlers.close(), this.up);
    this.net.later(() => this.onclose?.({}), this.down);
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
    expect(gb.netPause).toEqual({ reason: 'pause', seat: 0 });
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
