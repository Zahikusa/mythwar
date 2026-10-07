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
import { terminalQr } from './qr.ts';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(arg('port') ?? process.env.PORT ?? 8787);
const root = resolve(arg('dir') ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'));
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
const mp = attachMultiplayer(http, { latency, jitter, trustProxy: args.includes('--trust-proxy'), log: quiet ? undefined : (l) => console.log(stamp(l)) });

http.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already in use — try: node server/main.ts --port ${port + 1}`);
  else console.error(e);
  process.exit(1);
});

http.listen(port, '0.0.0.0', () => {
  const urls = lanAddresses().map((ip) => `${scheme}://${ip}:${port}/`);
  console.log('\n  Mythwar is running.\n');
  console.log(`  On this computer:   ${scheme}://localhost:${port}/`);
  if (urls.length) {
    console.log(`  Other devices in this Wi-Fi:`);
    for (const u of urls) console.log(`    ${u}`);
    console.log('\n  Scan to open on a phone:\n');
    console.log(terminalQr(urls[0]));
  } else {
    console.log('  (No network address found — connect this computer to the Wi-Fi.)');
  }
  if (latency || jitter) console.log(`  Simulating network lag: ${latency} ms + up to ${jitter} ms jitter.\n`);
  console.log('  If phones can\'t connect: allow Node.js through the firewall for private networks,');
  console.log('  and make sure the devices are on the same Wi-Fi (not a guest network). Ctrl+C stops.\n');
});

const stop = () => {
  mp.close();
  http.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
