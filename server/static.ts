import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/** Text files worth compressing (images are already compressed). */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.txt']);
/** Compressed copies by path, encoding and modification time (a rebuild invalidates them). */
const compressed = new Map<string, Buffer>();

function compressedCopy(file: string, mtime: number, encoding: 'br' | 'gzip'): Buffer {
  const key = `${file}|${encoding}|${mtime}`;
  let out = compressed.get(key);
  if (!out) {
    const raw = readFileSync(file);
    out = encoding === 'br' ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : gzipSync(raw, { level: 9 });
    compressed.set(key, out);
  }
  return out;
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
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    const hashed = /[-.][A-Za-z0-9_-]{8,}\.(js|css)$/.test(file) && file.includes(`${sep}assets${sep}`);
    const ext = extname(file).toLowerCase();
    const headers: Record<string, string> = {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      // Hashed build assets never change; everything else must be re-checked so updates arrive.
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    const accept = String(req.headers['accept-encoding'] ?? '');
    const encoding = !COMPRESSIBLE.has(ext) ? null : /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
    if (encoding) {
      let body: Buffer;
      try {
        body = compressedCopy(file, statSync(file).mtimeMs, encoding);
      } catch {
        res.writeHead(500).end();
        return;
      }
      res.writeHead(200, { ...headers, 'Content-Encoding': encoding, 'Content-Length': String(body.length), Vary: 'Accept-Encoding' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(200, { ...headers, Vary: 'Accept-Encoding' });
    if (req.method === 'HEAD') res.end();
    // (A file removed meanwhile — e.g. a rebuild — must not take the server down.)
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  };
}
