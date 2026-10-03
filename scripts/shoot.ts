/**
 * Screenshot harness: serves dist/ and captures scenarios with the local Chrome.
 *   npm run build && node scripts/shoot.ts [filter] [--query "a=1&b=2"] [--wait ms]
 * Output: screenshots/<name>.png
 */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

interface Scenario {
  name: string;
  query: string;
  w: number;
  h: number;
  mobile?: boolean;
  dpr?: number;
  wait?: number;
  /** JS evaluated in the page before the screenshot. */
  script?: string;
}

const SCENARIOS: Scenario[] = [
  { name: 'desktop-early', query: 'demo&ff=75&seed=3', w: 1600, h: 900 },
  { name: 'desktop-mid', query: 'demo&ff=420&seed=5', w: 1600, h: 900 },
  { name: 'desktop-late', query: 'demo&ff=900&seed=5', w: 1600, h: 900 },
  { name: 'mobile-land', query: 'demo&ff=120&seed=3', w: 844, h: 390, mobile: true, dpr: 3 },
  { name: 'mobile-port', query: 'demo&ff=120&seed=3', w: 390, h: 844, mobile: true, dpr: 3 },
  { name: 'menu-title', query: '', w: 1600, h: 900, wait: 2500 },
  { name: 'menu-diff', query: 'screen=difficulty', w: 1600, h: 900, wait: 2000 },
  { name: 'menu-howto', query: 'screen=howto', w: 1600, h: 900, wait: 2000 },
  { name: 'menu-settings', query: 'screen=settings', w: 1600, h: 900, wait: 2000 },
  { name: 'mobile-title', query: '', w: 844, h: 390, mobile: true, dpr: 3, wait: 2500 },
  { name: 'mobile-diff', query: 'screen=difficulty', w: 844, h: 390, mobile: true, dpr: 3, wait: 2000 },
  { name: 'play-start', query: 'play=adept&seed=4', w: 1600, h: 900, wait: 3000 },
];

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const filter = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const qIdx = args.indexOf('--query');
  const wIdx = args.indexOf('--wait');
  const extraQuery = qIdx >= 0 ? args[qIdx + 1] : '';
  const extraWait = wIdx >= 0 ? Number(args[wIdx + 1]) : 0;
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
  await mkdir('screenshots', { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu-sandbox'] });
  try {
    const list = SCENARIOS.filter((s) => !filter || s.name.includes(filter));
    for (const sc of list) {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warn') errors.push(`${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`));
      await page.setViewport({ width: sc.w, height: sc.h, deviceScaleFactor: sc.dpr ?? 1, isMobile: !!sc.mobile, hasTouch: !!sc.mobile });
      const q = [sc.query, extraQuery].filter(Boolean).join('&');
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, (sc.wait ?? 1500) + extraWait));
      if (sc.script) await page.evaluate(sc.script);
      const fps = await page.evaluate(() => (window as unknown as { __fps?: number }).__fps ?? -1);
      await page.screenshot({ path: `screenshots/${sc.name}.png` });
      console.log(`${sc.name}: ${Date.now() - t0}ms fps=${fps}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  await writeFile('screenshots/.last', new Date().toISOString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
