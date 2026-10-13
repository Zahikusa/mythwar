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
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses } from './lan.ts';
import { attachMultiplayer } from './net.ts';
import { serveStatic } from './static.ts';
import { fileStore } from './store.ts';
import { terminalQr } from './qr.ts';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Mythwar LAN server — serves the game and hosts multiplayer battles.

  node server/main.ts [options]          (npm run lan = build + this)

  --port <n>           port (default 8787; the next free one if busy and not given)
  --dir <path>         built game to serve (default: dist/)
  --cert <pem> --key <pem>   serve https/wss (wake lock + app install on phones)
  --trust-proxy        behind a reverse proxy: client addresses from X-Forwarded-For
  --latency <ms> --jitter <ms>   simulate a bad network (testing)
  --data <file>        where the Hall of champions is kept (default: mythwar-data.json
                       next to the server)
  --no-save            keep the Hall of champions in memory only
  --quiet              no log lines for joins, battles and results
  --help               this text`);
  process.exit(0);
}
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fixedPort = arg('port') ?? process.env.PORT;
let port = Number(fixedPort ?? 8787);
// The built game: dist/ in the repository, or game/ next to the bundled server (release package).
const here = fileURLToPath(new URL('.', import.meta.url));
const builds = [join(here, 'game'), join(here, '..', 'dist')];
const root = resolve(arg('dir') ?? builds.find((d) => existsSync(join(d, 'index.html'))) ?? builds[1]);
const quiet = args.includes('--quiet');

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build found in ${root} — run "npm run build" first (or use "npm run lan").`);
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

const latency = Number(arg('latency') ?? 0);
const jitter = Number(arg('jitter') ?? 0);
/** "18:42:07  Ada opened room QH7K" */
const stamp = (line: string) => `  ${new Date().toTimeString().slice(0, 8)}  ${line}`;
// --trust-proxy: behind a reverse proxy (internet deployment), client addresses come from it.
const log = quiet ? undefined : (l: string) => console.log(stamp(l));
// The Hall of champions survives restarts in a small JSON file (Lens #92), unless --no-save.
const dataFile = resolve(arg('data') ?? join(here, 'mythwar-data.json'));
const store = args.includes('--no-save') ? undefined : fileStore(dataFile, (l) => console.log(stamp(l)));
const mp = attachMultiplayer(http, { latency, jitter, trustProxy: args.includes('--trust-proxy'), log, store });

http.on('error', (e: NodeJS.ErrnoException) => {
  // The default port is busy (another copy running?): try the next few, unless one was asked for.
  if (e.code === 'EADDRINUSE' && !fixedPort && port < 8797) {
    port++;
    http.listen(port, '0.0.0.0');
    return;
  }
  if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already in use — try: node server/main.ts --port ${port + 1}`);
  else console.error(e);
  process.exit(1);
});

http.listen(port, '0.0.0.0');
http.on('listening', () => {
  const urls = lanAddresses().map((ip) => `${scheme}://${ip}:${port}/`);
  console.log('\n  Mythwar is running.\n');
  const hall = mp.lobby.hallStats();
  if (hall.players) console.log(`  Hall of champions: ${hall.players} player${hall.players === 1 ? '' : 's'} remembered, ${hall.returning} came back on another day.\n`);
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
  console.log('  If phones can\'t connect: allow Node.js through the firewall for private networks,');
  console.log('  and make sure the devices are on the same Wi-Fi (not a guest network). Ctrl+C stops.\n');
});

const stop = () => {
  mp.close(); // (saves the Hall of champions if it changed since the last save)
  http.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
