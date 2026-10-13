/**
 * The real server process with its flags (backlog 32): `node server/main.ts --data … --names …`
 * hosts a battle over real WebSockets, saves the Hall of champions, and has it back after a
 * restart — with a blocked name shown as "Player". (Everything else about the server is tested on
 * the Lobby class; this checks main.ts wires the flags through.)
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/net/protocol.ts';
import type { ServerMsg } from '../src/net/protocol.ts';
// (The same rules fingerprint as the server process computes: since backlog 33 it no longer
// depends on how the test runner lays out the data module's exports.)
import { simFingerprint } from '../src/sim/fingerprint.ts';

const dir = mkdtempSync(join(tmpdir(), 'mythwar-server-'));
writeFileSync(join(dir, 'index.html'), '<!doctype html><title>test</title>');
writeFileSync(join(dir, 'names.txt'), 'badword\n');
const data = join(dir, 'data.json');
let port = 0;

function start(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['server/main.ts', '--port', String(port), '--dir', dir, '--data', data, '--names', join(dir, 'names.txt'), '--quiet'], { stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let out = '';
    child.stdout!.on('data', (d) => {
      out += String(d);
      // (Started with --port 0 the first time: the server says which port it got.)
      const m = /localhost:(\d+)\//.exec(out);
      if (out.includes('Mythwar is running') && m) {
        port = Number(m[1]);
        resolve(child);
      }
    });
    child.stderr!.on('data', (d) => (out += String(d)));
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.removeAllListeners('exit');
    child.on('exit', () => resolve());
    child.kill();
  });
}

function open(name: string): Promise<{ ws: WebSocket; inbox: ServerMsg[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/mp`);
    const inbox: ServerMsg[] = [];
    ws.onmessage = (e) => inbox.push(JSON.parse(String(e.data)));
    ws.onerror = reject;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint(), name }));
      resolve({ ws, inbox });
    };
  });
}

async function until(cond: () => boolean, ms = 6000): Promise<void> {
  for (let t = 0; t < ms && !cond(); t += 20) await new Promise((r) => setTimeout(r, 20));
  expect(cond()).toBe(true);
}

describe('the server process', () => {
  it('saves the Hall with --data, has it back after a restart, and applies --names', async () => {
    let server = await start();
    try {
      const a = await open('B.A.D.W.O.R.D');
      const b = await open('Bo');
      await until(() => a.inbox.some((m) => m.type === 'welcome') && b.inbox.some((m) => m.type === 'welcome'));
      a.ws.send(JSON.stringify({ type: 'host' }));
      await until(() => a.inbox.some((m) => m.type === 'room'));
      const code = (a.inbox.find((m) => m.type === 'room') as Extract<ServerMsg, { type: 'room' }>).room.code;
      b.ws.send(JSON.stringify({ type: 'join', code }));
      await until(() => b.inbox.some((m) => m.type === 'room'));
      a.ws.send(JSON.stringify({ type: 'ready', ready: true }));
      b.ws.send(JSON.stringify({ type: 'ready', ready: true }));
      // The countdown, then a few turns of battle; then Bo leaves: a forfeit.
      await until(() => b.inbox.filter((m) => m.type === 'turn').length >= 3, 8000);
      b.ws.send(JSON.stringify({ type: 'leave' }));
      await until(() => a.inbox.some((m) => m.type === 'over'));
      a.ws.close();
      b.ws.close();
      // The Hall is saved in the background within ~5 s.
      await new Promise((r) => setTimeout(r, 5600));
      await stop(server);
      server = await start();
      const c = await open('Cy');
      c.ws.send(JSON.stringify({ type: 'watchRooms', on: true }));
      await until(() => c.inbox.some((m) => m.type === 'rooms'));
      const rooms = c.inbox.find((m) => m.type === 'rooms') as Extract<ServerMsg, { type: 'rooms' }>;
      expect(rooms.hall?.map((e) => `${e.name} ${e.w}–${e.l}`)).toEqual(['Player 1–0']);
      c.ws.close();
    } finally {
      await stop(server);
    }
  }, 40_000);
});

describe('the server process refuses bad numbers plainly (backlog 70)', () => {
  it('--port abc: a one-line message and exit code 1, no stack trace', async () => {
    const child = spawn(process.execPath, ['server/main.ts', '--port', 'abc', '--dir', dir, '--no-save'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr!.on('data', (d) => (err += String(d)));
    const code = await new Promise<number | null>((r) => child.on('exit', r));
    expect(code).toBe(1);
    expect(err.trim()).toBe('--port needs a whole number from 0 to 65535 (got "abc").');
  });
});
