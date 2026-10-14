import { MP_PATH } from './protocol.ts';
import type { ClientMsg, ServerMsg } from './protocol.ts';

export type ConnState = 'connecting' | 'online' | 'offline';

/** Anything shaped like the browser's WebSocket (tests pass a fake). */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((e: unknown) => void) | null;
  onclose: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface ConnectionOptions {
  url?: string;
  /** Socket factory (defaults to the browser WebSocket). */
  socket?: (url: string) => SocketLike;
  /** Called on every (re)connect before anything else is sent: the hello message. */
  hello: () => ClientMsg;
  now?: () => number;
}

const PING_EVERY = 1000;
/** A probe (see probe()) unanswered for this long (ms) means the link is gone. */
const PROBE_WAIT = 1500;
/** No message at all for this long ⇒ the link is dead (Wi-Fi gone, phone asleep): reconnect. */
const SILENT_LIMIT = 6000;
const BACKOFF = [250, 500, 1000, 2000, 3000];
/**
 * A socket still not open after this long is stuck — a phone that changed Wi-Fi mid-dial can
 * wait a minute for the browser to give up. Later attempts wait longer (a slow link still gets
 * through): 5 s, 7.5 s, … up to 15 s.
 */
export function dialLimit(attempt: number): number {
  return 5000 + 2500 * Math.min(attempt, 4);
}

/**
 * False on a plain static host (the GitHub Pages build, `vite build --mode pages`): there is no
 * multiplayer server next to the page there — unless `?server=` points at one. (`?noserver`: as
 * there, in any build — scripts/mobilecheck.ts shoots that lobby.)
 */
export function hasMpServer(): boolean {
  if (import.meta.env.VITE_STATIC_HOST !== '1') return !new URLSearchParams(location.search).has('noserver');
  return !!(new URLSearchParams(location.search).get('server') ?? import.meta.env.VITE_MP_SERVER);
}

/** The multiplayer server's address: same host as the page unless `?server=` says otherwise. */
export function defaultServerUrl(): string {
  const params = new URLSearchParams(location.search);
  const override = params.get('server') ?? (import.meta.env.VITE_MP_SERVER as string | undefined);
  const secure = location.protocol === 'https:';
  if (override) {
    if (/^wss?:\/\//.test(override)) return override;
    return `${secure ? 'wss' : 'ws'}://${override.replace(/\/$/, '')}${MP_PATH}`;
  }
  // The game may live in a sub-folder (base './'): the server listens next to index.html.
  const dir = location.pathname.replace(/[^/]*$/, '');
  return `${secure ? 'wss' : 'ws'}://${location.host}${dir.replace(/\/$/, '')}${MP_PATH}`;
}

/**
 * One WebSocket to the multiplayer server that keeps itself alive: reconnects with backoff,
 * pings every second (round-trip time) and notices a silently dead link.
 */
export class Connection {
  state: ConnState = 'offline';
  /** Smoothed round-trip time in ms (0 until measured). */
  rtt = 0;
  onMessage: (msg: ServerMsg, at: number) => void = () => {};
  onState: (state: ConnState) => void = () => {};
  /** The code the last link was closed with (4002: the server stopped our battle on a fault). */
  lastClose = 0;
  /** The server closed the link for good (4000 = other version, 4001 = taken over elsewhere). */
  onRefused: (code: number) => void = () => {};
  private ws: SocketLike | null = null;
  private wanted = false;
  private attempt = 0;
  private lastHeard = 0;
  private dialedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly url: string;
  private readonly opts: ConnectionOptions;
  private readonly now: () => number;
  /** The device's network came back (Wi-Fi rejoined): dial at once rather than after a backoff. */
  private readonly netUp = () => this.nudge();

  constructor(opts: ConnectionOptions) {
    this.opts = opts;
    this.url = opts.url ?? defaultServerUrl();
    this.now = opts.now ?? (() => performance.now());
  }

  get serverUrl(): string {
    return this.url;
  }

  /** Starts (or keeps) connecting until close() is called. */
  open(): void {
    this.wanted = true;
    if (!this.ws && !this.retry) this.dial();
    if (!this.timer) {
      this.timer = setInterval(() => this.tickle(), PING_EVERY);
      if (typeof window !== 'undefined') window.addEventListener('online', this.netUp);
    }
  }

  /** Reconnects right away (e.g. the page became visible again), skipping any backoff. */
  nudge(): void {
    if (!this.wanted) return;
    if (this.state === 'online' && this.now() - this.lastHeard < 2500) return;
    this.drop();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.attempt = 0;
    this.dial();
  }

  /**
   * Back on the page, the link may have died meanwhile — or only gone quiet (iOS suspends a page in
   * the background, its pings with it). Ask with a ping; reconnect only if no answer comes within
   * PROBE_WAIT: a socket that lived through a short spell away is kept (dropping it would take a
   * room's Ready with it).
   */
  probe(): void {
    if (!this.wanted) return;
    if (this.state !== 'online') return this.nudge();
    if (this.now() - this.lastHeard < 2500) return;
    const asked = this.now();
    this.ping();
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      if (this.lastHeard < asked) this.nudge();
    }, PROBE_WAIT);
  }

  close(): void {
    this.wanted = false;
    if (this.probeTimer) clearTimeout(this.probeTimer);
    this.probeTimer = null;
    if (this.timer) {
      clearInterval(this.timer);
      if (typeof window !== 'undefined') window.removeEventListener('online', this.netUp);
    }
    if (this.retry) clearTimeout(this.retry);
    this.timer = null;
    this.retry = null;
    this.drop();
    this.setState('offline');
  }

  send(msg: ClientMsg): boolean {
    // (A socket that is already closing would only log an error.)
    if (!this.ws || this.state !== 'online' || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private dial(): void {
    this.setState('connecting');
    let ws: SocketLike;
    try {
      ws = this.opts.socket ? this.opts.socket(this.url) : (new WebSocket(this.url) as unknown as SocketLike);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    this.dialedAt = this.now();
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.lastHeard = this.now();
      this.setState('online');
      ws.send(JSON.stringify(this.opts.hello()));
      this.ping();
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws) return;
      const at = this.now();
      this.lastHeard = at;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'pong') {
        const sample = at - msg.t;
        if (sample >= 0 && sample < 10_000) this.rtt = this.rtt ? this.rtt * 0.8 + sample * 0.2 : sample;
      }
      this.onMessage(msg, at);
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const code = (e as { code?: number } | null)?.code ?? 0;
      this.lastClose = code;
      if (code === 4000 || code === 4001) {
        // Reconnecting would only repeat this (and, for 4001, steal the seat back).
        this.close();
        this.onRefused(code);
        return;
      }
      this.scheduleRetry();
    };
    ws.onerror = () => {
      // onclose follows.
    };
  }

  private scheduleRetry(): void {
    if (!this.wanted) return;
    this.setState('connecting');
    const wait = BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)];
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.wanted && !this.ws) this.dial();
    }, wait);
  }

  private tickle(): void {
    if (this.state === 'connecting' && this.ws && this.now() - this.dialedAt > dialLimit(this.attempt)) {
      this.drop();
      this.scheduleRetry();
      return;
    }
    if (this.state !== 'online') return;
    if (this.now() - this.lastHeard > SILENT_LIMIT) {
      this.drop();
      this.scheduleRetry();
      return;
    }
    this.ping();
  }

  private ping(): void {
    this.send({ type: 'ping', t: this.now(), rtt: Math.round(this.rtt) });
  }

  private drop(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    // (A live link given up on here, not closed by the server: no close code to remember.)
    this.lastClose = 0;
    ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
    try {
      ws.close();
    } catch {
      // already closed
    }
  }

  private setState(s: ConnState): void {
    if (this.state === s) return;
    this.state = s;
    this.onState(s);
  }
}
