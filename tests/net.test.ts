import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachMultiplayer } from '../server/net.ts';
import type { Multiplayer } from '../server/net.ts';
import { MP_PATH } from '../src/net/protocol.ts';

/** A raw socket that sends an upgrade request for `path` and resolves once the server answers. */
function rawUpgrade(port: number, path: string, from: string): Promise<{ sock: Socket; head: string; closed: Promise<void> }> {
  return new Promise((done, fail) => {
    const sock = connect(port, '127.0.0.1');
    const closed = new Promise<void>((r) => sock.on('close', () => r()));
    let head = '';
    sock.on('error', () => {});
    sock.on('connect', () =>
      sock.write(
        `GET ${path} HTTP/1.1\r\nHost: test\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nX-Forwarded-For: ${from}\r\n\r\n`,
      ),
    );
    sock.on('data', (d) => {
      if (head) return;
      head = d.toString('latin1');
      done({ sock, head, closed });
    });
    sock.on('close', () => (head ? undefined : done({ sock, head, closed })));
    setTimeout(() => fail(new Error('no answer')), 3000);
  });
}

describe('the multiplayer endpoint', () => {
  let http: Server;
  let mp: Multiplayer;
  let port: number;
  const open: WebSocket[] = [];

  beforeEach(async () => {
    http = createServer((_, res) => res.writeHead(404).end());
    mp = attachMultiplayer(http, { trustProxy: true });
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
    port = (http.address() as { port: number }).port;
  });
  afterEach(async () => {
    for (const ws of open.splice(0)) ws.terminate();
    mp.close();
    http.closeAllConnections();
    await new Promise<void>((r) => http.close(() => r()));
  });

  const client = (from: string) =>
    new Promise<WebSocket>((done, fail) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}${MP_PATH}`, { headers: { 'X-Forwarded-For': from } });
      open.push(ws);
      ws.on('open', () => done(ws));
      ws.on('error', fail);
    });

  it('a malformed frame on a socket refused for the per-address limit does not take the server down', async () => {
    for (let i = 0; i < 32; i++) await client('8.8.8.8');
    const { sock, head } = await rawUpgrade(port, MP_PATH, '8.8.8.8');
    expect(head).toMatch(/^HTTP\/1\.1 101/);
    // An unmasked frame from a client is a protocol error on the server's side.
    sock.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
    await new Promise((r) => setTimeout(r, 200));
    sock.destroy();
    // Still serving.
    const other = await client('9.9.9.9');
    expect(other.readyState).toBe(WebSocket.OPEN);
  });

  it('upgrades for other paths are refused, not left hanging', async () => {
    const { head, closed } = await rawUpgrade(port, '/nope', '8.8.4.4');
    expect(head).toBe('');
    await closed;
  });
});
