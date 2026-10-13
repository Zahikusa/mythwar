import { createReadStream, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Text files worth compressing (images are already compressed). */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);

/**
 * Compressed copies, one per file and encoding (a rebuild replaces the entry instead of piling up
 * old versions). Hashed bundles get new names on every build, so the oldest-used copies are
 * dropped beyond COMPRESSED_MAX (a server left running through many rebuilds). Compression runs
 * off the main thread's critical path (zlib's thread pool), so serving a fresh build never
 * stalls the battles running in the same process.
 */
const compressed = new Map<string, { mtime: number; body: Promise<Buffer> }>();
export const COMPRESSED_MAX = 48;

function compressedCopy(file: string, mtime: number, encoding: 'br' | 'gzip'): Promise<Buffer> {
  const key = `${file}|${encoding}`;
  const hit = compressed.get(key);
  compressed.delete(key);
  if (hit && hit.mtime === mtime) {
    // (Most recently used last: Map keeps insertion order.)
    compressed.set(key, hit);
    return hit.body;
  }
  const body = readFile(file).then((raw) => (encoding === 'br' ? brotliAsync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : gzipAsync(raw, { level: 9 })));
  compressed.set(key, { mtime, body });
  for (const old of compressed.keys()) {
    if (compressed.size <= COMPRESSED_MAX) break;
    compressed.delete(old);
  }
  // A failed read (file vanished mid-rebuild) must not stay cached.
  body.catch(() => compressed.get(key)?.body === body && compressed.delete(key));
  return body;
}

/** How many compressed copies are cached (for tests). */
export function compressedCached(): number {
  return compressed.size;
}

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

/** Serves the built game from `root` (GET/HEAD only, no directory escapes). */
export function serveStatic(root: string): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
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
    let stat: Stats | null = null;
    try {
      // (One check: a file can vanish between two, e.g. while the game is being rebuilt.)
      if (file.startsWith(root + sep)) stat = statSync(file);
    } catch {
      stat = null;
    }
    if (!stat || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const hashed = /[-.][A-Za-z0-9_-]{8,}\.(js|css)$/.test(file) && file.includes(`${sep}assets${sep}`);
    const ext = extname(file).toLowerCase();
    const headers: Record<string, string> = {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      // Hashed build assets never change; everything else must be re-checked so updates arrive.
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      Vary: 'Accept-Encoding',
    };
    const accept = String(req.headers['accept-encoding'] ?? '');
    const encoding = !COMPRESSIBLE.has(ext) ? null : /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
    if (encoding) {
      compressedCopy(file, stat.mtimeMs, encoding).then(
        (body) => {
          res.writeHead(200, { ...headers, 'Content-Encoding': encoding, 'Content-Length': String(body.length) });
          res.end(req.method === 'HEAD' ? undefined : body);
        },
        () => {
          if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
          else res.destroy();
        },
      );
      return;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    // (A file removed meanwhile — e.g. a rebuild — must not take the server down.)
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };
}
