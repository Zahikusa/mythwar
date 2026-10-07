/**
 * Mythwar LAN server: serves the built game (dist/) and hosts multiplayer battles.
 *
 *   npm run lan                      # build, then serve on port 8787
 *   node server/main.ts --port 9000  # serve an existing build
 *   node server/main.ts --latency 80 --jitter 60   # simulate a bad network (testing)
 *
 * Every device in the same Wi-Fi opens the printed address (or scans the QR code).
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachMultiplayer } from './net.ts';
import { terminalQr } from './qr.ts';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(arg('port') ?? process.env.PORT ?? 8787);
const root = resolve(arg('dir') ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist'));
const quiet = args.includes('--quiet');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build found in ${root} — run "npm run build" first (or use "npm run lan").`);
  process.exit(1);
}

const http = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  const hashed = /[-.][A-Za-z0-9_-]{8,}\.(js|css)$/.test(file) && file.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    // Hashed build assets never change; everything else must be re-checked so updates arrive.
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
});

const latency = Number(arg('latency') ?? 0);
const jitter = Number(arg('jitter') ?? 0);
const mp = attachMultiplayer(http, { latency, jitter, log: quiet ? undefined : (l) => console.log(`  · ${l}`) });

http.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already in use — try: node server/main.ts --port ${port + 1}`);
  else console.error(e);
  process.exit(1);
});

http.listen(port, '0.0.0.0', () => {
  const urls = lanAddresses().map((ip) => `http://${ip}:${port}/`);
  console.log('\n  Mythwar is running.\n');
  console.log(`  On this computer:   http://localhost:${port}/`);
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

/** IPv4 addresses of this machine's network interfaces, likely Wi-Fi / LAN first. */
function lanAddresses(): string[] {
  const out: { ip: string; score: number }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const n = name.toLowerCase();
      // Virtual adapters (WSL, Hyper-V, Docker, VPNs) can't be reached from a phone.
      const virtual = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|loopback|utun|tun|tap/.test(n);
      const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      const wifi = /wi-?fi|wlan|wireless|en0|en1/.test(n);
      out.push({ ip: a.address, score: (virtual ? -10 : 0) + (priv ? 5 : 0) + (wifi ? 2 : 0) });
    }
  }
  return out.sort((a, b) => b.score - a.score).map((a) => a.ip);
}
