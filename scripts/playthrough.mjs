// Plays through the real UI (keys + clicks) at 4x speed and screenshots periodically.
// node scripts/playthrough.mjs [seconds=60] [w=1600] [h=900] [mobile=0]
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { chromePath } from './chrome.ts';
const [secs = '60', w = '1600', h = '900', mobile = '0', diff = 'adept'] = process.argv.slice(2);
const root = resolve('dist');
const server = createServer(async (req, res) => { const u = new URL(req.url, 'http://x'); let p = join(root, u.pathname); if (u.pathname === '/' || !extname(p)) p = join(root, 'index.html'); try { const b = await readFile(p); res.writeHead(200, { 'content-type': extname(p) === '.js' ? 'text/javascript' : extname(p) === '.css' ? 'text/css' : 'text/html' }); res.end(b); } catch { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
await mkdir('screenshots/play', { recursive: true });
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const isMobile = mobile === '1';
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1, isMobile, hasTouch: isMobile });
await page.goto(`http://127.0.0.1:${server.address().port}/?play=${diff}&seed=31`);
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.__mythwar.game.speed = 4; });
const lanes = ['q', 'a', 'z'];
let shot = 0;
const t0 = Date.now();
while (Date.now() - t0 < +secs * 1000) {
  const s = await page.evaluate(() => { const a = window.__mythwar; const g = a.game; const p = g.world.players[0]; return { over: g.over, gold: p.gold, xp: p.xp, age: p.age, cd: p.powerCooldown, menu: a.menus.current }; });
  if (s.over || s.menu === 'over') break;
  // Behave like a casual player.
  await page.keyboard.press(lanes[Math.floor(Math.random() * 3)]);
  await page.keyboard.press(String(1 + Math.floor(Math.random() * 3)));
  if (s.cd <= 0) await page.keyboard.press(' ');
  if (Math.random() < 0.2) await page.keyboard.press('u');
  if (Math.random() < 0.05) {
    await page.keyboard.press('t');
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => document.querySelector('.trow .tbuy')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.keyboard.press('t');
  }
  await new Promise((r) => setTimeout(r, 700));
  if ((Date.now() - t0) / 1000 > shot * 15) {
    await page.screenshot({ path: `screenshots/play/${String(shot).padStart(2, '0')}.png` });
    shot++;
  }
}
const final = await page.evaluate(() => { const g = window.__mythwar.game; return { time: g.world.time, ages: [g.world.players[0].age, g.world.players[1].age], hp: [Math.round(g.world.players[0].baseHp), Math.round(g.world.players[1].baseHp)], over: g.over }; });
console.log(JSON.stringify(final), 'errors:', errors.length ? errors : 'none', 'shots:', shot);
await browser.close(); server.close();
