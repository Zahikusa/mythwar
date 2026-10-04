/**
 * Screenshot harness: serves dist/ and captures scenarios with the local Chrome.
 *   npm run build && node scripts/shoot.ts [filter] [--query "a=1&b=2"] [--wait ms] [--size 667x375]
 *   (--size overrides the viewport of the selected scenarios; the file name gets a -WxH suffix)
 *   node scripts/shoot.ts --list      (scenario names; the filter matches substrings)
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
  /** Extra wait after the script ran. */
  after?: number;
}

const cast = (age: number, lane: number) =>
  `(() => { const a = window.__mythwar; const w = a.game.world; const p = w.players[0]; p.age = ${age}; p.powerCooldown = 0; a.game.command({ type: 'power', team: 0, lane: ${lane} }); })()`;

const SCENARIOS: Scenario[] = [
  { name: 'desktop-early', query: 'demo&ff=75&seed=3', w: 1600, h: 900 },
  { name: 'desktop-mid', query: 'demo&ff=420&seed=5', w: 1600, h: 900 },
  { name: 'desktop-jade', query: 'demo&ff=560&seed=11', w: 1600, h: 900 },
  { name: 'desktop-ultrawide', query: 'demo&ff=300&seed=5', w: 2560, h: 1080 },
  { name: 'desktop-laptop', query: 'demo&ff=200&seed=5', w: 1366, h: 768 },
  { name: 'desktop-qhd', query: 'demo&ff=300&seed=5', w: 2560, h: 1440 },
  { name: 'desktop-short', query: 'demo&ff=300&seed=5', w: 1920, h: 600 },
  { name: 'desktop-small', query: 'demo&ff=300&seed=5', w: 1024, h: 640 },
  { name: 'desktop-small-late', query: 'demo&ff=900&seed=5', w: 1024, h: 640 },
  { name: 'desktop-late', query: 'demo&ff=900&seed=5', w: 1600, h: 900 },
  { name: 'mobile-land', query: 'demo&ff=120&seed=3', w: 844, h: 390, mobile: true, dpr: 3 },
  { name: 'mobile-port', query: 'demo&ff=120&seed=3', w: 390, h: 844, mobile: true, dpr: 3 },
  { name: 'menu-title', query: '', w: 1600, h: 900, wait: 2500 },
  { name: 'menu-diff', query: 'screen=difficulty', w: 1600, h: 900, wait: 2000 },
  { name: 'menu-diff-qhd', query: 'screen=difficulty', w: 2560, h: 1440, wait: 2000 },
  { name: 'menu-howto', query: 'screen=howto', w: 1600, h: 900, wait: 2000 },
  { name: 'menu-settings', query: 'screen=settings', w: 1600, h: 900, wait: 2000 },
  { name: 'mobile-title', query: '', w: 844, h: 390, mobile: true, dpr: 3, wait: 2500 },
  { name: 'mobile-diff', query: 'screen=difficulty', w: 844, h: 390, mobile: true, dpr: 3, wait: 2000 },
  { name: 'mobile-howto', query: 'screen=howto', w: 844, h: 390, mobile: true, dpr: 2, wait: 2000, script: `(() => { const b = document.querySelector('.hnext'); b.click(); b.click(); })()`, after: 500 },
  { name: 'mobile-howto-4', query: 'screen=howto', w: 844, h: 390, mobile: true, dpr: 2, wait: 2000, script: `(() => { const b = document.querySelector('.hnext'); for (let i = 0; i < 3; i++) b.click(); })()`, after: 500 },
  { name: 'mobile-howto-5', query: 'screen=howto', w: 667, h: 375, mobile: true, dpr: 2, wait: 2000, script: `(() => { const b = document.querySelector('.hnext'); for (let i = 0; i < 4; i++) b.click(); })()`, after: 500 },
  { name: 'mobile-pause', query: 'play=novice&seed=4', w: 844, h: 390, mobile: true, dpr: 2, wait: 1500, script: `window.__mythwar.pause()`, after: 500 },
  { name: 'mobile-port-title', query: '', w: 390, h: 844, mobile: true, dpr: 2, wait: 2500 },
  { name: 'mobile-diff-se', query: 'screen=difficulty', w: 667, h: 375, mobile: true, dpr: 2, wait: 2000 },
  { name: 'mobile-port-diff', query: 'screen=difficulty', w: 390, h: 844, mobile: true, dpr: 2, wait: 2000 },
  { name: 'power-briar', query: 'demo&ff=60&seed=3', w: 1600, h: 900, script: cast(0, 1), after: 700 },
  { name: 'power-zeus', query: 'demo&ff=200&seed=3', w: 1600, h: 900, script: cast(1, 1), after: 900 },
  { name: 'power-fimbul', query: 'demo&ff=300&seed=2', w: 1600, h: 900, script: cast(2, 1), after: 1300 },
  { name: 'power-dragon', query: 'demo&ff=500&seed=5', w: 1600, h: 900, script: cast(3, 1), after: 1100 },
  { name: 'power-starfall', query: 'demo&ff=800&seed=5', w: 1600, h: 900, script: cast(4, 1), after: 1400 },
  {
    name: 'gameover-collapse',
    query: 'play=adept&seed=4',
    w: 1600,
    h: 900,
    wait: 2000,
    script: `(() => { const w = window.__mythwar.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0); })()`,
    after: 1400,
  },
  {
    name: 'gameover-results',
    query: 'play=adept&seed=4',
    w: 1600,
    h: 900,
    wait: 2000,
    script: `(() => { const w = window.__mythwar.game.world; w.players[0].baseHp = 1; w.damageBase(0, 10, 0, 1); })()`,
    after: 3600,
  },
  ...[0, 2, 4].map((age) => ({
    name: `turrets-age${age}`,
    query: `play=adept&seed=4&theme=${age}`,
    w: 1600,
    h: 900,
    wait: 1200,
    script: `(() => { const g = window.__mythwar.game; const w = g.world; for (const p of w.players) { p.age = ${age}; p.gold = 1e6; } const ids = { 0: ['thornspitter','sporepod'], 2: ['runestone','frostcatapult'], 4: ['sunspire','starforge'] }[${age}]; for (const t of [0,1]) { g.command({type:'buildTurret', team:t, lane:0, turretId: ids[0]}); g.command({type:'buildTurret', team:t, lane:2, turretId: ids[1]}); } const U = { 0: 'redcap', 2: 'fenrir', 4: 'griffin' }[${age}]; const D = window.__mythwarData.UNITS; for (let i = 0; i < 3; i++) { w.spawnUnit(1, 0, D[U], 180 + i * 40); w.spawnUnit(1, 2, D[U], 170 + i * 40); w.spawnUnit(0, 0, D[U], 820 - i * 40); w.spawnUnit(0, 2, D[U], 830 - i * 40); } })()`,
    after: 700,
  })),
  {
    name: 'mobile-turretpanel',
    query: 'play=adept&seed=4',
    w: 844,
    h: 390,
    mobile: true,
    dpr: 2,
    wait: 1200,
    script: `(() => { const a = window.__mythwar; a.game.world.players[0].gold = 900; a.hud.togglePanel('turret'); })()`,
    after: 400,
  },
  {
    name: 'mobile-blesspanel',
    query: 'play=adept&seed=4',
    w: 844,
    h: 390,
    mobile: true,
    dpr: 2,
    wait: 1200,
    script: `(() => { const a = window.__mythwar; a.game.world.players[0].gold = 900; a.hud.togglePanel('bless'); })()`,
    after: 400,
  },
  {
    name: 'mobile-results',
    query: 'play=adept&seed=4',
    w: 844,
    h: 390,
    mobile: true,
    dpr: 2,
    wait: 1200,
    script: `(() => { const w = window.__mythwar.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0); })()`,
    after: 3600,
  },
  { name: 'gallery', query: 'gallery&scale=2', w: 1440, h: 2000, wait: 1200 },
  { name: 'mobile-play-start', query: 'play=novice&seed=4', w: 844, h: 390, mobile: true, dpr: 2, wait: 2500 },
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
  if (args.includes('--list')) {
    for (const sc of SCENARIOS) console.log(`${sc.name.padEnd(22)} ${sc.w}x${sc.h}${sc.mobile ? ' mobile' : ''}  ?${sc.query}`);
    return;
  }
  const filter = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
  const qIdx = args.indexOf('--query');
  const wIdx = args.indexOf('--wait');
  const extraQuery = qIdx >= 0 ? args[qIdx + 1] : '';
  const extraWait = wIdx >= 0 ? Number(args[wIdx + 1]) : 0;
  const sIdx = args.indexOf('--size');
  const size = sIdx >= 0 ? /^(\d+)x(\d+)$/.exec(args[sIdx + 1] ?? '') : null;
  if (sIdx >= 0 && !size) throw new Error('--size expects WIDTHxHEIGHT, e.g. 667x375');
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
      const w = size ? Number(size[1]) : sc.w;
      const hgt = size ? Number(size[2]) : sc.h;
      const name = size ? `${sc.name}-${w}x${hgt}` : sc.name;
      await page.setViewport({ width: w, height: hgt, deviceScaleFactor: sc.dpr ?? 1, isMobile: !!sc.mobile, hasTouch: !!sc.mobile });
      const q = [sc.query, extraQuery].filter(Boolean).join('&');
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, (sc.wait ?? 1500) + extraWait));
      if (sc.script) {
        await page.evaluate(sc.script);
        await new Promise((r) => setTimeout(r, sc.after ?? 0));
      }
      const fps = await page.evaluate(() => (window as unknown as { __fps?: number }).__fps ?? -1);
      await page.screenshot({ path: `screenshots/${name}.png` });
      console.log(`${name}: ${Date.now() - t0}ms fps=${fps}${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
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
