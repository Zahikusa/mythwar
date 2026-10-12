/**
 * Per-frame cost budget: the game's own JavaScript per frame (simulation + AI, renderer command
 * generation, HUD update) in a busy late-game battle on a landscape-phone viewport, with both
 * sides casting their god powers. A budget phone runs JavaScript ~4-6x slower than a desktop, so
 * the budget here is 3 ms/frame (≈ 12-18 ms on such a phone, inside a 60 fps frame).
 *   npm run build && node scripts/perfcheck.ts [seconds=8]
 * (Rasterization isn't measured: headless Chrome draws canvases on the CPU, phones on the GPU;
 * CPU throttling in DevTools mostly measures that software raster, so it isn't used here. The
 * game's automatic battery-saver mode covers phones whose GPU can't keep up.)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const seconds = Number(process.argv[2] ?? 8);
const BUDGET_MS = 3;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = resolve('dist');
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', 'http://x');
  let p = join(root, u.pathname);
  if (u.pathname === '/' || !extname(p)) p = join(root, 'index.html');
  try {
    const b = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(`http://127.0.0.1:${port}/?demo&ff=780&seed=5&difficulty=master`);
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  type Fn = (...args: unknown[]) => unknown;
  const a = (window as unknown as { __mythwar: Record<string, Record<string, Fn>> }).__mythwar;
  const acc: Record<string, number> = { sim: 0, render: 0, hud: 0, frames: 0 };
  (window as unknown as { __acc: typeof acc }).__acc = acc;
  const wrap = (obj: Record<string, Fn>, name: string, key: string) => {
    const f = obj[name].bind(obj);
    obj[name] = (...args: unknown[]) => {
      const t = performance.now();
      const r = f(...args);
      acc[key] += performance.now() - t;
      if (key === 'render') acc.frames++;
      return r;
    };
  };
  wrap(a.game, 'advance', 'sim');
  wrap(a.renderer, 'render', 'render');
  wrap(a.hud, 'update', 'hud');
});
for (let s = 0; s < seconds + 2; s++) {
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate((reset) => {
    const a = (window as unknown as { __mythwar: { game: { world: { players: { powerCooldown: number }[] }; command(c: unknown): void } } }).__mythwar;
    // Keep the battle busy: both sides cast their god powers whenever they can.
    for (const team of [0, 1]) if (a.game.world.players[team].powerCooldown <= 0) a.game.command({ type: 'power', team, lane: (Date.now() / 1000) % 3 | 0 });
    if (reset) {
      const acc = (window as unknown as { __acc: Record<string, number> }).__acc;
      for (const k in acc) acc[k] = 0;
    }
  }, s === 1); // the first seconds include start-up work
}
const acc = await page.evaluate(() => (window as unknown as { __acc: Record<string, number> }).__acc);
const per = (k: string) => acc[k] / Math.max(1, acc.frames);
const total = per('sim') + per('render') + per('hud');
const ok = total <= BUDGET_MS && errors.length === 0;
console.log(`${ok ? 'PASS' : 'FAIL'}  ${total.toFixed(2)} ms of game JavaScript per frame (budget ${BUDGET_MS} ms): simulation + AI ${per('sim').toFixed(2)}, renderer ${per('render').toFixed(2)}, HUD ${per('hud').toFixed(2)} — ${acc.frames} frames${errors.length ? ` — errors: ${errors.join('; ')}` : ''}`);
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
