import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, dialLimit } from '../src/net/connection.ts';
import type { SocketLike } from '../src/net/connection.ts';
import type { ServerMsg } from '../src/net/protocol.ts';

/** A socket under the test's control: it opens, talks and closes when told to. */
class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: { type: string }[] = [];
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as { type: string });
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  hear(msg: ServerMsg): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  lose(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

describe('Connection', () => {
  let sockets: FakeSocket[];
  let conn: Connection;
  let states: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    states = [];
    conn = new Connection({
      url: 'ws://test/mp',
      socket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      hello: () => ({ type: 'hello' }) as never,
      now: () => Date.now(),
    });
    conn.onState = (s) => states.push(s);
  });
  afterEach(() => {
    conn.close();
    vi.useRealTimers();
  });

  it('says hello first, then pings every second', () => {
    conn.open();
    sockets[0].open();
    expect(conn.state).toBe('online');
    expect(sockets[0].sent.map((m) => m.type)).toEqual(['hello', 'ping']);
    vi.advanceTimersByTime(3000);
    expect(sockets[0].sent.filter((m) => m.type === 'ping').length).toBe(4);
  });

  it('reconnects with growing waits after the link drops', () => {
    conn.open();
    sockets[0].open();
    sockets[0].lose();
    expect(conn.state).toBe('connecting');
    vi.advanceTimersByTime(249);
    expect(sockets.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(sockets.length).toBe(2);
    sockets[1].lose();
    vi.advanceTimersByTime(499);
    expect(sockets.length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(sockets.length).toBe(3);
    // Once through, the next drop starts from the shortest wait again.
    sockets[2].open();
    sockets[2].lose();
    vi.advanceTimersByTime(250);
    expect(sockets.length).toBe(4);
  });

  it('a silent link (no message for 6 s) is dropped and dialled again', () => {
    conn.open();
    sockets[0].open();
    vi.advanceTimersByTime(5000);
    expect(sockets.length).toBe(1);
    vi.advanceTimersByTime(2500);
    expect(sockets[0].closed).toBe(true);
    expect(sockets.length).toBe(2);
  });

  it('a dial that never opens is given up and tried again, waiting longer each time', () => {
    conn.open();
    // (Checked each second: given up at 6 s, dialled again 250 ms later.)
    vi.advanceTimersByTime(6300);
    expect(sockets[0].closed).toBe(true);
    expect(sockets.length).toBe(2);
    // The second try gets 7.5 s before it, too, is given up (at 14 s; dialled again at 14.5 s).
    vi.advanceTimersByTime(13_900 - 6300);
    expect(sockets.length).toBe(2);
    vi.advanceTimersByTime(14_600 - 13_900);
    expect(sockets.length).toBe(3);
    sockets[2].open();
    expect(conn.state).toBe('online');
    expect(dialLimit(10)).toBe(15000);
  });

  it('a slow dial that opens in time is kept', () => {
    conn.open();
    vi.advanceTimersByTime(dialLimit(0) - 1000);
    sockets[0].open();
    // (Past the dial limit, well inside the silent-link one.)
    vi.advanceTimersByTime(4000);
    expect(sockets.length).toBe(1);
    expect(conn.state).toBe('online');
  });

  it('refusals (other version, seat taken elsewhere) stop for good', () => {
    const refused: number[] = [];
    conn.onRefused = (c) => refused.push(c);
    conn.open();
    sockets[0].open();
    sockets[0].lose(4001);
    vi.advanceTimersByTime(30_000);
    expect(sockets.length).toBe(1);
    expect(refused).toEqual([4001]);
    expect(conn.state).toBe('offline');
  });

  it('measures the round trip from pongs', () => {
    conn.open();
    sockets[0].open();
    const t = Date.now();
    vi.advanceTimersByTime(40);
    sockets[0].hear({ type: 'pong', t } as ServerMsg);
    expect(conn.rtt).toBe(40);
  });

  it('dials at once when the device’s network comes back (and not after close)', () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    try {
      conn.open();
      sockets[0].open();
      sockets[0].lose();
      vi.advanceTimersByTime(250);
      sockets[1].lose();
      win.dispatchEvent(new Event('online'));
      expect(sockets.length).toBe(3);
      conn.close();
      win.dispatchEvent(new Event('online'));
      expect(sockets.length).toBe(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('nudge skips the backoff when the page comes back', () => {
    conn.open();
    sockets[0].open();
    sockets[0].lose();
    vi.advanceTimersByTime(250);
    sockets[1].lose();
    // (Now waiting 500 ms; a nudge dials at once.)
    conn.nudge();
    expect(sockets.length).toBe(3);
    expect(states.at(-1)).toBe('connecting');
  });
});
