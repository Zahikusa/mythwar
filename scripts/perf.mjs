// Measures average renderer.render() time over N frames in a busy late battle.
// node scripts/perf.mjs [ff=900] [w=1600] [h=900]
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { chromePath } from './chrome.ts';
const [ff = '900', w = '1600', h = '900'] = process.argv.slice(2);
const root = resolve('dist');
const server = createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); let p = join(root, u.pathname); if (u.pathname === '/' || !extname(p)) p = join(root, 'index.html'); try { const b = await readFile(p); res.writeHead(200, { 'content-type': extname(p) === '.js' ? 'text/javascript' : extname(p) === '.css' ? 'text/css' : 'text/html' }); res.end(b); } catch { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h });
await page.goto(`http://127.0.0.1:${server.address().port}/?demo&ff=${ff}&seed=5`);
await new Promise((r) => setTimeout(r, 1500));
const r = await page.evaluate(() => {
  const a = window.__mythwar;
  const g = a.game;
  g.paused = true;
  // Stress: fill every lane with creatures of the current ages.
  const D = window.__mythwarData.UNITS;
  const ids = Object.keys(D);
  for (let lane = 0; lane < 3; lane++) for (let i = 0; i < 40; i++) g.world.spawnUnit(i % 2, lane, D[ids[(i * 7 + lane) % ids.length]], 100 + i * 20);
  for (let i = 0; i < 5; i++) a.renderer.render(g.world, 1, 1 / 60, g.view);
  const t0 = performance.now();
  const N = 120;
  for (let i = 0; i < N; i++) a.renderer.render(g.world, 1, 1 / 60, g.view);
  const total = performance.now() - t0;
  let units = 0;
  for (const l of g.world.lanes) units += l.length;
  return { avgMs: +(total / N).toFixed(2), units, particles: a.renderer.fx.particles.length };
});
console.log(JSON.stringify(r));
await browser.close(); server.close();
