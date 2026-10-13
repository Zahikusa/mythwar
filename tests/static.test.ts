import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPRESSED_MAX, compressedCached, serveStatic } from '../server/static.ts';

describe('serveStatic', () => {
  let root: string;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'mythwar-static-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Mythwar</title>');
    // Many builds' worth of hashed bundles (each rebuild names them anew).
    for (let i = 0; i < COMPRESSED_MAX + 20; i++) writeFileSync(join(root, 'assets', `index-B${String(i).padStart(7, '0')}.js`), `console.log(${i});`.repeat(50));
    server = createServer(serveStatic(root));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  });

  it('serves the page, compressed and re-checked; hashed bundles cached for good', async () => {
    const page = await fetch(`${base}/`, { headers: { 'accept-encoding': 'gzip' } });
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(await page.text()).toContain('<title>Mythwar</title>');
    const js = await fetch(`${base}/assets/index-B0000001.js`);
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(js.headers.get('content-type')).toContain('text/javascript');
  });

  it('takes its folder in any spelling — forward slashes, a trailing one (backlog 295)', async () => {
    for (const dir of [root.replace(/\\/g, '/'), `${root}/`]) {
      const other = createServer(serveStatic(dir));
      await new Promise<void>((r) => other.listen(0, '127.0.0.1', () => r()));
      try {
        const res = await fetch(`http://127.0.0.1:${(other.address() as { port: number }).port}/`);
        expect(res.status).toBe(200);
        await res.text();
      } finally {
        await new Promise<void>((r) => other.close(() => r()));
      }
    }
  });

  it('keeps no more than COMPRESSED_MAX compressed copies, however many builds it served', async () => {
    // (fetch would decompress on its own; a raw request shows the gzip body as sent.)
    const raw = (path: string) =>
      new Promise<{ enc: string | undefined; body: Buffer }>((done, fail) => {
        request(`${base}${path}`, { headers: { 'accept-encoding': 'gzip' } }, (res) => {
          const parts: Buffer[] = [];
          res.on('data', (c: Buffer) => parts.push(c));
          res.on('end', () => done({ enc: res.headers['content-encoding'], body: Buffer.concat(parts) }));
        })
          .on('error', fail)
          .end();
      });
    for (let i = 0; i < COMPRESSED_MAX + 20; i++) {
      const r = await raw(`/assets/index-B${String(i).padStart(7, '0')}.js`);
      expect(r.enc).toBe('gzip');
      expect(gunzipSync(r.body).toString()).toBe(`console.log(${i});`.repeat(50));
    }
    expect(compressedCached()).toBeLessThanOrEqual(COMPRESSED_MAX);
  });

  it('refuses paths outside its folder and other methods', async () => {
    expect((await fetch(`${base}/..%2fpackage.json`)).status).toBe(404);
    expect((await fetch(`${base}/assets/none.js`)).status).toBe(404);
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/%E0%A4%A`)).status).toBe(400);
  });
});
