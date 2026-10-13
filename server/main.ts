/**
 * Mythwar LAN server: serves the built game (dist/) and hosts multiplayer battles.
 *
 *   npm run lan                      # build, then serve on port 8787
 *   node server/main.ts --port 9000  # serve an existing build
 *   node server/main.ts --latency 80 --jitter 60   # simulate a bad network (testing)
 *   node server/main.ts --cert cert.pem --key key.pem   # https (e.g. a mkcert certificate)
 *
 * Every device in the same Wi-Fi opens the printed address (or scans the QR code).
 */
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from './lan.ts';
import { flatWord } from './lobby.ts';
import { attachMultiplayer } from './net.ts';
import { serveStatic } from './static.ts';
import { fileStore } from './store.ts';
import { terminalQr } from './qr.ts';

const args = process.argv.slice(2);
// How this server was started, for the messages below: the release package runs the bundled
// server.mjs; a source checkout runs server/main.ts (or `npm run lan`).
const packaged = basename(fileURLToPath(import.meta.url)) === 'server.mjs';
const command = packaged ? 'node server.mjs' : 'node server/main.ts';
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Mythwar LAN server — serves the game and hosts multiplayer battles.

  ${command} [options]${packaged ? '' : '          (npm run lan = build + this)'}

  --port <n>           port (default $PORT or 8787; if busy and not given, the next free one up to 8797)
  --dir <path>         built game to serve (default: game/ next to the server, else dist/)
  --cert <pem> --key <pem>   serve https/wss (wake lock + app install on phones)
  --trust-proxy        behind a reverse proxy: client addresses from X-Forwarded-For
  --latency <ms> --jitter <ms>   simulate a bad network (testing)
  --data <file>        where the Hall of champions is kept (default: mythwar-data.json
                       next to the server)
  --no-save            keep the Hall of champions in memory only
  --names <file>       words no player name may contain, one per line (a public server)
  --quiet              no log lines for joins, battles and results
  --help               this text`);
  process.exit(0);
}
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
/** A number option, or a plain message and exit (not a stack trace from deep inside Node). */
const num = (name: string, raw: string | undefined, fallback: number, max: number): number => {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(n) || n < 0 || n > max) {
    console.error(`--${name} needs a whole number from 0 to ${max} (got "${raw}").`);
    process.exit(1);
  }
  return n;
};
const fixedPort = arg('port') ?? process.env.PORT;
let port = num('port', fixedPort, 8787, 65535);
// The built game: dist/ in the repository, or game/ next to the bundled server (release package).
const here = fileURLToPath(new URL('.', import.meta.url));
const builds = [join(here, 'game'), join(here, '..', 'dist')];
const root = resolve(arg('dir') ?? builds.find((d) => existsSync(join(d, 'index.html'))) ?? builds[1]);
const quiet = args.includes('--quiet');

if (!existsSync(join(root, 'index.html'))) {
  console.error(packaged ? `No game found in ${root} — the game/ folder belongs next to server.mjs (unpack the whole zip).` : `No build found in ${root} — run "npm run build" first (or use "npm run lan").`);
  process.exit(1);
}

// --cert / --key: serve https (phones then allow the screen wake lock and installing the app).
const certFile = arg('cert');
const keyFile = arg('key');
const secure = !!(certFile && keyFile);
const http: Server = secure
  ? (createHttpsServer({ cert: readFileSync(certFile!), key: readFileSync(keyFile!) }, serveStatic(root)) as unknown as Server)
  : createServer(serveStatic(root));
const scheme = secure ? 'https' : 'http';

const latency = num('latency', arg('latency'), 0, 10_000);
const jitter = num('jitter', arg('jitter'), 0, 10_000);
/** "18:42:07  Ada opened room QH7K" */
const stamp = (line: string) => `  ${new Date().toTimeString().slice(0, 8)}  ${line}`;
// --trust-proxy: behind a reverse proxy (internet deployment), client addresses come from it.
const log = quiet ? undefined : (l: string) => console.log(stamp(l));
// The Hall of champions survives restarts in a small JSON file (Lens #92), unless --no-save.
const dataFile = resolve(arg('data') ?? join(here, 'mythwar-data.json'));
const store = args.includes('--no-save') ? undefined : fileStore(dataFile, (l) => console.log(stamp(l)));
// --names: a blocklist for names strangers will see (one word per line, compared case- and
// punctuation-blind).
const namesFile = arg('names');
const blockedWords = namesFile
  ? readFileSync(namesFile, 'utf8')
      .split(/\r?\n/)
      .map((w) => flatWord(w))
      .filter(Boolean)
  : undefined;
const mp = attachMultiplayer(http, { latency, jitter, trustProxy: args.includes('--trust-proxy'), log, store, blockedWords });

/** The default port that was busy, if the server moved up from it. */
let movedFrom = 0;
http.on('error', (e: NodeJS.ErrnoException) => {
  // The default port is busy (another copy running?): try the next few, unless one was asked for.
  if (e.code === 'EADDRINUSE' && !fixedPort && port < 8797) {
    if (!movedFrom) movedFrom = port;
    port++;
    http.listen(port, '0.0.0.0');
    return;
  }
  if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already in use (is Mythwar running already?) — try: ${command} --port ${port + 1}`);
  else console.error(e);
  process.exit(1);
});

http.listen(port, '0.0.0.0');
http.on('listening', () => {
  // (The port actually bound: --port 0 asks the system for any free one.)
  port = (http.address() as { port: number }).port;
  const urls = lanAddresses().map((ip) => `${scheme}://${ip}:${port}/`);
  console.log('\n  Mythwar is running.\n');
  const hall = mp.lobby.hallStats();
  if (hall.players) console.log(`  Hall of champions: ${hall.players} player${hall.players === 1 ? '' : 's'} remembered, ${hall.returning} came back on another day.\n`);
  // (Busy usually means another copy is running — and phones may still be on that one.)
  if (movedFrom) console.log(`  Port ${movedFrom} was busy (is Mythwar running already, in another window?) — using ${port}.\n`);
  console.log(`  On this computer:   ${scheme}://localhost:${port}/`);
  if (urls.length) {
    console.log(`  Other devices in this Wi-Fi:`);
    for (const u of urls) console.log(`    ${u}`);
    console.log('\n  Scan to open on a phone:\n');
    console.log(terminalQr(urls[0], !!process.stdout.isTTY));
  } else {
    console.log('  (No network address found — connect this computer to the Wi-Fi.)');
  }
  if (latency || jitter) console.log(`  Simulating network lag: ${latency} ms + up to ${jitter} ms jitter.\n`);
  console.log('  If phones can\'t connect: allow Node.js through the firewall — and check that this');
  console.log('  computer counts the Wi-Fi as a private network (Windows often files a new one as');
  console.log('  "Public", which the firewall blocks: Settings → Network → Wi-Fi → your network →');
  console.log('  Private). The devices must be on the same Wi-Fi (not a guest network). Ctrl+C stops.\n');
});

const stop = () => {
  mp.close(); // (saves the Hall of champions if it changed since the last save)
  http.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Closing the terminal window (macOS / Linux: SIGHUP; Windows: the console's close, Ctrl+Break:
// SIGBREAK) also saves the Hall first.
process.on('SIGHUP', stop);
if (process.platform === 'win32') process.on('SIGBREAK', stop);
// Last resort: a fault outside the lobby's contained paths (the static files, the socket layer)
// still ends the process — but says what happened and saves the Hall of champions first. (Start
// it again — or let a supervisor; battles in progress are lost either way.)
process.on('uncaughtException', (e) => {
  console.error(stamp(`the server stopped on a fault: ${e?.stack ?? e}`));
  try {
    mp.lobby.flush(true);
  } catch {
    // (nothing more to save)
  }
  process.exit(1);
});
