import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { Server as TlsServer } from 'node:tls';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { MP_PATH } from '../src/net/protocol.ts';
import { lanAddresses, networkOf } from './lan.ts';
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
}

/** Seconds without any sign of life before a connection is considered dead. */
const DEAD_AFTER = 12;
const HEARTBEAT = 4;

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

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '').split('?')[0];
    if (!path.endsWith(MP_PATH)) return; // e.g. Vite's own HMR socket
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  http.on('upgrade', onUpgrade);

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const forwarded = opts.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
    const network = networkOf(forwarded || req.socket.remoteAddress);
    // Small frames, sent as they happen: no Nagle delay.
    (ws as unknown as { _socket?: { setNoDelay?: (v: boolean) => void } })._socket?.setNoDelay?.(true);
    const lag = opts.latency || opts.jitter ? { up: laggy(opts), down: laggy(opts) } : null;
    const handlers = lobby.connect({
      send: (data) => {
        const go = () => ws.readyState === ws.OPEN && ws.send(data);
        if (lag) lag.down(go);
        else go();
      },
      close: (code, reason) => ws.close(code, reason),
    }, network);
    alive.set(ws, performance.now());
    ws.on('message', (data, isBinary) => {
      alive.set(ws, performance.now());
      if (isBinary) return;
      const text = data.toString();
      if (lag) lag.up(() => handlers.message(text));
      else handlers.message(text);
    });
    ws.on('pong', () => alive.set(ws, performance.now()));
    ws.on('close', () => {
      alive.delete(ws);
      if (lag) lag.up(() => handlers.close());
      else handlers.close();
    });
    ws.on('error', () => ws.terminate());
  });

  // Rooms and battles advance on a fast timer (the simulation runs at 60 Hz).
  const loop = setInterval(() => lobby.update(), 4);
  // Phones that lose Wi-Fi or get suspended don't always close their sockets: ping them.
  const heartbeat = setInterval(() => {
    const now = performance.now();
    for (const [ws, seen] of alive) {
      if (now - seen > DEAD_AFTER * 1000) ws.terminate();
      else if (ws.readyState === ws.OPEN) ws.ping();
    }
  }, HEARTBEAT * 1000);

  return {
    lobby,
    close() {
      clearInterval(loop);
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
