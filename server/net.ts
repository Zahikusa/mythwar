import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { Server as TlsServer } from 'node:tls';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { MP_PATH } from '../src/net/protocol.ts';
import { lanAddresses, networkOf, wideOf } from './lan.ts';
import { Lobby } from './lobby.ts';
import type { LobbyOptions } from './lobby.ts';

export interface Multiplayer {
  lobby: Lobby;
  close(): void;
}

export interface AttachOptions extends LobbyOptions {
  /** Behind a reverse proxy (internet deployment): take the client address from X-Forwarded-For. */
  trustProxy?: boolean;
  /** Testing aid: delay (ms) added to every message in both directions, plus random jitter. */
  latency?: number;
  jitter?: number;
  /**
   * Something else on this HTTP server takes its own WebSocket upgrades (Vite's HMR socket): leave
   * other paths alone. Otherwise they are refused — an upgrade nobody answers would stay open.
   */
  sharedUpgrades?: boolean;
  /** Testing aid: seconds without a sign of life before a link counts as dead (default 12). */
  deadAfter?: number;
  /** Simultaneous connections in all (default MAX_SOCKETS). */
  maxSockets?: number;
}

/** Simultaneous connections from one address (a household has a few devices; a script many). */
const MAX_PER_ADDRESS = 32;
/** ...and from one IPv6 /48 (see wideOf: a /56's 256 /64s would each have their own 32). */
const MAX_PER_WIDE = 4 * MAX_PER_ADDRESS;
/** Simultaneous connections in all. */
const MAX_SOCKETS = 5000;
/** Seconds without any sign of life before a connection is considered dead. */
const DEAD_AFTER = 12;
const HEARTBEAT = 4;
/** How often (ms) the lobby is driven while a battle is on — the simulation runs at 60 Hz — and while none is. */
const BUSY_TICK = 4;
const IDLE_TICK = 100;
/**
 * Bytes waiting to go out on one socket before it is closed: a client that stops reading (a
 * script; nothing a phone does — a stalled link is held as away after 4 s) would otherwise have
 * the server queue for it until memory runs out. A whole battle's snapshot is ~12 kB.
 */
const MAX_BUFFERED = 1024 * 1024;

/**
 * Hosts multiplayer on an existing HTTP server: WebSocket upgrades on MP_PATH go to a lobby
 * that runs every room and battle. Used by both `npm run lan` and the Vite dev server.
 */
export function attachMultiplayer(http: Server, opts: AttachOptions = {}): Multiplayer {
  const lanUrls = () => {
    const addr = http.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;
    const scheme = (http as unknown) instanceof TlsServer ? 'https' : 'http';
    return port ? lanAddresses().map((ip) => `${scheme}://${ip}:${port}/`) : [];
  };
  const lobby = new Lobby({ lanUrls, ...opts });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
  const alive = new Map<WebSocket, number>();
  const perAddress = new Map<string, number>();

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0];
    if (!path.endsWith(MP_PATH)) {
      if (!opts.sharedUpgrades) socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  http.on('upgrade', onUpgrade);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // First of all: a socket error nobody listens for (a malformed frame, even on a socket being
    // refused below) would be thrown — and take the whole server down.
    ws.on('error', () => ws.terminate());
    // Behind a proxy the client address is the entry the proxy itself appended (the rightmost);
    // anything left of it came from the client and could be forged.
    const forwarded = opts.trustProxy ? (String(req.headers['x-forwarded-for'] ?? '').split(',').pop() ?? '').trim() : '';
    const address = forwarded || req.socket.remoteAddress || '?';
    const network = networkOf(address);
    // Limits count per public address (an IPv6 /64 counts as one). Local-network clients of a
    // LAN server are exempt: everyone there is trusted, and testing opens many tabs.
    const quota = network === 'lan' && !opts.trustProxy ? '' : network === 'lan' ? address : network;
    const wide = wideOf(quota);
    const keys = [quota, wide && `wide ${wide}`].filter(Boolean);
    if (alive.size >= (opts.maxSockets ?? MAX_SOCKETS) || (quota && (perAddress.get(quota) ?? 0) >= MAX_PER_ADDRESS) || (wide && (perAddress.get(`wide ${wide}`) ?? 0) >= MAX_PER_WIDE)) {
      ws.close(1013, 'too many connections');
      return;
    }
    for (const key of keys) perAddress.set(key, (perAddress.get(key) ?? 0) + 1);
    ws.once('close', () => {
      for (const key of keys) {
        const n = (perAddress.get(key) ?? 1) - 1;
        if (n > 0) perAddress.set(key, n);
        else perAddress.delete(key);
      }
    });
    // Small frames, sent as they happen: no Nagle delay.
    (ws as unknown as { _socket?: { setNoDelay?: (v: boolean) => void } })._socket?.setNoDelay?.(true);
    const lag = opts.latency || opts.jitter ? { up: laggy(opts), down: laggy(opts) } : null;
    const handlers = lobby.connect({
      send: (data) => {
        const go = () => {
          if (ws.readyState !== ws.OPEN) return;
          if (ws.bufferedAmount > MAX_BUFFERED) return ws.terminate();
          ws.send(data);
        };
        if (lag) lag.down(go);
        else go();
      },
      close: (code, reason) => ws.close(code, reason),
    }, network, quota);
    alive.set(ws, performance.now());
    ws.on('message', (data, isBinary) => {
      alive.set(ws, performance.now());
      if (isBinary) return;
      const text = data.toString();
      if (lag) lag.up(() => (handlers.message(text), wake()));
      else {
        handlers.message(text);
        wake();
      }
    });
    ws.on('pong', () => alive.set(ws, performance.now()));
    ws.on('close', () => {
      alive.delete(ws);
      if (lag) lag.up(() => handlers.close());
      else handlers.close();
    });
  });

  // Rooms and battles advance on a fast timer while a battle is on, a slow one otherwise: an idle
  // server (rooms waiting, nobody there) mustn't keep the host's laptop from resting.
  let loop: ReturnType<typeof setTimeout>;
  let idle = false;
  const tick = () => {
    lobby.update();
    idle = !lobby.busy;
    loop = setTimeout(tick, idle ? IDLE_TICK : BUSY_TICK);
  };
  // (A message that starts a battle — both Ready — needn't wait for the slow tick.)
  const wake = () => {
    if (!idle || !lobby.busy) return;
    clearTimeout(loop);
    idle = false;
    loop = setTimeout(tick, BUSY_TICK);
  };
  loop = setTimeout(tick, BUSY_TICK);
  // Phones that lose Wi-Fi or get suspended don't always close their sockets: ping them.
  const deadAfter = opts.deadAfter ?? DEAD_AFTER;
  const heartbeat = setInterval(() => {
    const now = performance.now();
    for (const [ws, seen] of alive) {
      if (now - seen > deadAfter * 1000) ws.terminate();
      else if (ws.readyState === ws.OPEN) ws.ping();
    }
  }, (HEARTBEAT * deadAfter * 1000) / DEAD_AFTER);

  return {
    lobby,
    close() {
      lobby.flush(true);
      clearTimeout(loop);
      clearInterval(heartbeat);
      http.off('upgrade', onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}

/** Delays callbacks by latency + random jitter while keeping their order (like TCP). */
function laggy(opts: AttachOptions): (fn: () => void) => void {
  // One queue and one timer: separate setTimeouts per message can fire out of order when their
  // due times are under a millisecond apart (timers are scheduled from the loop's cached clock).
  const queue: { at: number; fn: () => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  const pump = () => {
    timer = null;
    const now = performance.now();
    while (queue.length && queue[0].at <= now) queue.shift()!.fn();
    if (queue.length) timer = setTimeout(pump, Math.max(1, queue[0].at - now));
  };
  return (fn) => {
    const at = Math.max(last, performance.now() + (opts.latency ?? 0) + Math.random() * (opts.jitter ?? 0));
    last = at;
    queue.push({ at, fn });
    timer ??= setTimeout(pump, Math.max(1, at - performance.now()));
  };
}
