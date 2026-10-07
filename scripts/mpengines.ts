/**
 * Online battles across browser engines: a Chrome / Firefox player hosts, a WebKit player
 * (the engine of every iPhone browser) joins through an invite link, both keep sending orders
 * for a while, and neither replica may ever disagree with the server.
 *
 *   npm run build && node scripts/mpengines.ts [seconds=90]
 *
 * Needs Playwright's WebKit/Firefox inside the project:
 *   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install webkit firefox
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser, Page } from 'playwright';
import { attachMultiplayer } from '../server/net.ts';
import { serveStatic } from '../server/static.ts';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';
const seconds = Number(process.argv[2] ?? 90);
let failures = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type App = { state: string; mp: any; game: any; menus: { current: string } };
const app = (page: Page) => (fn: (a: App) => unknown) => page.evaluate(`(${fn.toString()})(window.__mythwar)`);

async function duel(hostName: string, launchHost: () => Promise<Browser>, launchGuest: () => Promise<Browser>, base: string): Promise<void> {
  console.log(`== ${hostName} hosts, WebKit joins ==`);
  const hb = await launchHost();
  const gb = await launchGuest();
  try {
    const host = await (await hb.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const guest = await (await gb.newContext({ viewport: { width: 844, height: 390 }, isMobile: false, hasTouch: true })).newPage();
    const errors: string[] = [];
    for (const [p, who] of [[host, hostName], [guest, 'webkit']] as const) p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    await host.goto(`${base}/?mp`);
    await host.waitForFunction(() => (window as any).__mythwar?.mp?.welcomed === true);
    await app(host)((a) => a.mp.host());
    await host.waitForFunction(() => !!(window as any).__mythwar.mp.room);
    const code = (await app(host)((a) => a.mp.room.code)) as string;
    await guest.goto(`${base}/?join=${code}`);
    await guest.waitForFunction(() => !!(window as any).__mythwar?.mp?.room);
    await app(host)((a) => a.mp.ready(true));
    await app(guest)((a) => a.mp.ready(true));
    await host.waitForFunction(() => (window as any).__mythwar.state === 'playing' && !(window as any).__mythwar.game.paused, undefined, { timeout: 15000 });
    await guest.waitForFunction(() => (window as any).__mythwar.state === 'playing' && !(window as any).__mythwar.game.paused, undefined, { timeout: 15000 });
    // Both sides keep summoning into varying lanes (whatever they can afford).
    const order = (a: App) => {
      const g = a.game;
      const me = g.world.players[g.playerTeam];
      const units = Object.values((window as any).__mythwarData.UNITS).filter((u: any) => u.age === me.age) as { id: string }[];
      const u = units[Math.floor(Math.random() * units.length)];
      g.command({ type: 'train', team: g.playerTeam, unitId: u.id, lane: Math.floor(Math.random() * 3) });
      if (Math.random() < 0.2) g.command({ type: 'ageUp', team: g.playerTeam });
      if (Math.random() < 0.1) g.command({ type: 'power', team: g.playerTeam, lane: Math.floor(Math.random() * 3) });
    };
    const until = Date.now() + seconds * 1000;
    while (Date.now() < until) {
      await app(host)(order);
      await app(guest)(order);
      await sleep(1500);
    }
    const stat = (a: App) => ({ tick: a.game.world.tick, desyncs: a.game.desyncs, resyncs: a.game.resyncs, summoned: a.game.world.players.map((p: any) => p.stats.summoned) });
    const h = (await app(host)(stat)) as { tick: number; desyncs: number; resyncs: number; summoned: number[] };
    const g = (await app(guest)(stat)) as typeof h;
    check('battle ran with orders from both sides', h.tick > seconds * 50 && h.summoned[0] > 5 && h.summoned[1] > 5, JSON.stringify(h.summoned));
    check(`${hostName} replica never disagreed with the server`, h.desyncs === 0 && h.resyncs === 0, `desyncs ${h.desyncs}`);
    check('WebKit replica never disagreed with the server', g.desyncs === 0 && g.resyncs === 0, `desyncs ${g.desyncs}`);
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await hb.close();
    await gb.close();
  }
}

async function main(): Promise<void> {
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) throw new Error('Run "npm run build" first');
  const http = createServer(serveStatic(root));
  const mp = attachMultiplayer(http, { countdown: 1 });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const { chromium, firefox, webkit } = await import('playwright');
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
  try {
    if (chrome) await duel('Chrome', () => chromium.launch({ executablePath: chrome }), () => webkit.launch(), base);
    await duel('Firefox', () => firefox.launch(), () => webkit.launch(), base);
  } finally {
    mp.close();
    http.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nCross-engine online battles stayed in sync');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
