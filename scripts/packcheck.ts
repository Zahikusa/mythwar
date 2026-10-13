/**
 * The release package works as shipped (backlog 185): starts its bundled `server.mjs` (not the
 * source) from the package folder, fetches the game page and a script from it, and plays a lobby
 * round trip over a real WebSocket (hello → welcome, host → a room). A bundling slip — a module the
 * bundle misses, a path that only exists in the repository — shows here, not on a user's PC.
 *
 *   npm run package && node scripts/packcheck.ts      (npm run package:check does both)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROTOCOL_VERSION } from '../src/net/protocol.ts';
import { simFingerprint } from '../src/sim/fingerprint.ts';

const dir = resolve('release', 'mythwar-server');
if (!existsSync(join(dir, 'server.mjs'))) {
  console.error('No package in release/mythwar-server — run "npm run package" first.');
  process.exit(1);
}
let failures = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

// (From the package folder, as the starters run it.)
const child = spawn(process.execPath, ['server.mjs', '--port', '0', '--no-save', '--quiet'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
const port = await new Promise<number>((done, fail) => {
  const timer = setTimeout(() => fail(new Error(`no start within 10 s: ${out}`)), 10_000);
  child.stdout.on('data', (d) => {
    out += String(d);
    const m = /localhost:(\d+)\//.exec(out);
    if (out.includes('Mythwar is running') && m) {
      clearTimeout(timer);
      done(Number(m[1]));
    }
  });
  child.stderr.on('data', (d) => (out += String(d)));
  child.on('exit', (code) => fail(new Error(`server.mjs exited (${code}): ${out}`)));
}).catch((e: Error) => {
  check('the packaged server starts', false, e.message);
  process.exit(1);
});
child.removeAllListeners('exit');
check('the packaged server starts', true, `port ${port}`);
try {
  const page = await fetch(`http://127.0.0.1:${port}/`);
  const html = await page.text();
  check('it serves the game page', page.ok && html.includes('<title'), `${page.status}`);
  const script = /<script[^>]*\ssrc="([^"]+\.js)"/.exec(html)?.[1];
  const js = script ? await fetch(new URL(script, `http://127.0.0.1:${port}/`)) : null;
  check("…and the page's script", !!js?.ok, script ?? 'no <script src> in the page');

  const inbox: { type: string; room?: { code: string } }[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/mp`);
  await new Promise<void>((done, fail) => {
    ws.onopen = () => done();
    ws.onerror = () => fail(new Error('WebSocket failed'));
  });
  ws.onmessage = (e) => inbox.push(JSON.parse(String(e.data)));
  ws.send(JSON.stringify({ type: 'hello', v: PROTOCOL_VERSION, sim: simFingerprint(), name: 'Packcheck' }));
  const until = async (cond: () => boolean) => {
    for (let t = 0; t < 5000 && !cond(); t += 20) await new Promise((r) => setTimeout(r, 20));
    return cond();
  };
  check('a lobby hello is welcomed (same protocol and rules as this checkout)', await until(() => inbox.some((m) => m.type === 'welcome')), JSON.stringify(inbox.find((m) => m.type === 'error') ?? ''));
  ws.send(JSON.stringify({ type: 'host' }));
  check('hosting gives a room', await until(() => inbox.some((m) => m.type === 'room' && !!m.room?.code)));
  ws.close();
} catch (e) {
  check('the packaged server answers', false, String(e));
} finally {
  child.kill();
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nThe release package works');
process.exit(failures ? 1 : 0);
