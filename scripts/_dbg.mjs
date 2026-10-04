import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
const root = resolve('dist');
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = join(root, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !extname(path)) path = join(root, 'index.html');
  try { const body = await readFile(path); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(path)] ?? 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 1600, height: 900 });
await p.goto(`${base}/?play=adept&seed=11`);
await new Promise((r) => setTimeout(r, 800));
const q = () => p.evaluate(() => { const g = window.__mythwar.game; return { q: g.world.players[0].queue.map((x) => x.unitId + '@' + x.lane + (x.ready ? '!' : '')), gold: Math.round(g.world.players[0].gold), log: window.__log }; });
await p.evaluate(() => {
  const g = window.__mythwar.game; g.world.players[0].gold = 1000;
  window.__log = [];
  const orig = g.command.bind(g);
  g.command = (c) => { const r = orig(c); window.__log.push(c.type + ':' + (c.index ?? c.unitId) + ':' + r.ok); return r; };
});
await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3');
console.log('after 3 keys', JSON.stringify(await q()));
await p.keyboard.press('Backspace');
await new Promise((r) => setTimeout(r, 50));
console.log('after backspace', JSON.stringify(await q()));
await b.close(); server.close();
