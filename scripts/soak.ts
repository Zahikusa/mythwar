/**
 * Soak test: runs fast AI-vs-AI battles in Chrome through all ages and reports
 * console errors, frame rate and progress.
 *   npm run build && node scripts/soak.ts [seconds=45] [speed=16]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { findChrome } from './chrome.ts';

const CHROME = findChrome();
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

async function main(): Promise<void> {
  const seconds = Number(process.argv[2] ?? 45);
  const speed = Number(process.argv[3] ?? 16);
  const root = resolve('dist');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = join(root, decodeURIComponent(url.pathname));
    if (url.pathname === '/' || !extname(path)) path = join(root, 'index.html');
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  let bad = 0;
  try {
    for (const [seed, vp] of [
      [21, { width: 1600, height: 900, isMobile: false, hasTouch: false }],
      [22, { width: 844, height: 390, isMobile: true, hasTouch: true }],
    ] as const) {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.setViewport({ ...vp, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${port}/?demo&seed=${seed}&speed=${speed}&difficulty=master`, { waitUntil: 'load' });
      await page.mouse.click(5, 5); // unlock audio
      const fps: number[] = [];
      for (let t = 0; t < seconds; t += 5) {
        await new Promise((r) => setTimeout(r, 5000));
        const s = await page.evaluate(() => {
          const a = (window as unknown as { __mythwar: any; __fps: number }).__mythwar;
          const w = a.game.world;
          return { fps: (window as unknown as { __fps: number }).__fps, time: w.time, ages: [w.players[0].age, w.players[1].age], units: w.lanes.reduce((n: number, l: unknown[]) => n + l.length, 0), parts: a.renderer.fx.particles.length, over: a.game.over };
        });
        fps.push(s.fps);
        console.log(`seed ${seed} ${vp.width}x${vp.height}: t=${(s.time / 60).toFixed(1)}m ages=${s.ages.join('/')} units=${s.units} particles=${s.parts} fps=${s.fps}${s.over ? ' (over)' : ''}`);
        if (s.over) break;
      }
      const min = Math.min(...fps);
      console.log(`  min fps ${min}, errors: ${errors.length ? errors.join(' | ') : 'none'}`);
      if (errors.length) bad++;
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
