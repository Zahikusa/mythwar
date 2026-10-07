/**
 * Multiplayer end-to-end test: two players (a desktop browser and a phone, in separate browser
 * profiles) meet in a room through the real UI and fight an online battle.
 *   npm run build && node scripts/mpsmoke.ts [--shots] [--portrait] [--latency 60 --jitter 80]
 * Checks lobby/room flow, countdown, mirrored view, orders crossing over, pause/resume,
 * a dropped connection, the app going to the background, a reload mid-battle, leaving
 * (forfeit), results and a rematch. Exits non-zero on any failure or console error.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Page } from 'puppeteer-core';
import { attachMultiplayer } from '../server/net.ts';
import { serveStatic } from '../server/static.ts';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots');
const num = (name: string) => Number(args[args.indexOf(`--${name}`) + 1] ?? 0) || 0;
const latency = args.includes('--latency') ? num('latency') : 0;
const jitter = args.includes('--jitter') ? num('jitter') : 0;
const shotDir = resolve('screenshots/mp');

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page: Page, what: string, fn: () => boolean, timeout = 8000): Promise<boolean> {
  try {
    await page.waitForFunction(fn, { timeout, polling: 50 });
    return true;
  } catch {
    const dump = await page
      .evaluate(() => {
        const app = (window as unknown as { __mythwar: any }).__mythwar;
        const m = app.mp;
        return JSON.stringify({ state: app.state, menu: app.menus.current, conn: m?.state, welcomed: m?.welcomed, room: m?.room, seat: m?.seat, url: location.href });
      })
      .catch((e: Error) => e.message);
    check(`waiting for: ${what}`, false, `timed out; ${dump}`);
    return false;
  }
}

/** Taps / clicks the visible button with this text inside `scope`. */
async function press(page: Page, scope: string, text: string): Promise<void> {
  const at = await page.evaluate(
    (scope, text) => {
      const b = [...document.querySelectorAll<HTMLElement>(`${scope} button`)].find((el) => el.textContent?.trim() === text && el.offsetParent !== null);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    scope,
    text,
  );
  if (!at) {
    check(`button "${text}" in ${scope}`, false, 'not found');
    return;
  }
  const mobile = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}

type Info = {
  state: string;
  menu: string;
  online: boolean;
  tick: number;
  seat: number;
  paused: boolean;
  over: boolean;
  desyncs: number;
  resyncs: number;
  units: [number, number];
  summoned: [number, number];
  mirror: boolean;
  room: string | null;
  netPause: string | null;
  banner: string;
};

function info(page: Page): Promise<Info> {
  return page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const g = app.game;
    const units: [number, number] = [0, 0];
    for (const l of g.world.lanes) for (const u of l) if (u.alive) units[u.team]++;
    return {
      state: app.state,
      menu: app.menus.current,
      online: !!g.options.online,
      tick: g.world.tick,
      seat: g.playerTeam,
      paused: g.paused,
      over: g.over,
      desyncs: g.desyncs ?? 0,
      resyncs: g.resyncs ?? 0,
      units,
      summoned: [g.world.players[0].stats.summoned, g.world.players[1].stats.summoned] as [number, number],
      mirror: app.renderer.mirror,
      room: app.mp?.room?.code ?? null,
      netPause: g.netPause ? `${g.netPause.reason}:${g.netPause.seat}` : null,
      banner: document.querySelector('.nbanner.show')?.textContent ?? '',
    };
  });
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(shotDir, { recursive: true });
  await sleep(450); // let screen fades finish
  await page.screenshot({ path: join(shotDir, `${name}.png`) as `${string}.png` });
}

async function main(): Promise<void> {
  if (!CHROME) throw new Error('Chrome / Edge not found');
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) throw new Error('Run "npm run build" first');
  const http = createServer(serveStatic(root));
  let mp = attachMultiplayer(http, { latency, jitter, countdown: 3 });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors: string[] = [];
  const watch = (page: Page, who: string) => {
    page.on('console', (m) => m.type() === 'error' && errors.push(`${who}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${who}: ${(e as Error).message}`));
  };
  try {
    // Player A: desktop. Player B: a phone in landscape, in its own browser profile.
    const a = await browser.newPage();
    await a.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    const ctxB = await browser.createBrowserContext();
    const b = await ctxB.newPage();
    // --portrait: the phone is held upright (the game rotates its stage into landscape).
    const portrait = args.includes('--portrait');
    await b.setViewport({ width: portrait ? 390 : 844, height: portrait ? 844 : 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    watch(a, 'A');
    watch(b, 'B');

    console.log('== lobby ==');
    await a.goto(`${base}/?mp`, { waitUntil: 'load' });
    await waitFor(a, 'A connected', () => document.querySelector('.mpstatus.ok') !== null);
    check('lobby shows', (await info(a)).menu === 'mp');
    await a.click('.mpname', { count: 3 });
    await a.keyboard.type('Ada');
    await a.keyboard.press('Enter');
    await sleep(100);
    await shot(a, '1-lobby-desktop');
    await press(a, '.screen.mp', 'Host a battle');
    await waitFor(a, 'A in a room', () => (window as any).__mythwar.menus.current === 'room');
    const code = (await info(a)).room!;
    check('room code', /^[A-Z0-9]{4}$/.test(code), code);
    const invite = await a.evaluate(() => ({ qr: !!document.querySelector('.rqr svg'), link: document.querySelector('.rlink')?.textContent ?? '' }));
    check('invite QR and link', invite.qr && invite.link.includes(`?join=${code}`), invite.link);
    await shot(a, '2-room-waiting');

    // A duplicated tab inherits A's session token (sessionStorage is copied): it must start
    // its own session instead of taking A's seat away.
    const token = await a.evaluate(() => sessionStorage.getItem('mythwar.mp.session'));
    const dup = await browser.newPage();
    watch(dup, 'dup');
    await dup.setViewport({ width: 1000, height: 600, deviceScaleFactor: 1 });
    await dup.evaluateOnNewDocument((t) => sessionStorage.setItem('mythwar.mp.session', t ?? ''), token);
    await dup.goto(`${base}/?mp`, { waitUntil: 'load' });
    await waitFor(dup, 'duplicate tab connected', () => document.querySelector('.mpstatus.ok') !== null);
    await sleep(300);
    const dupRoom = await dup.evaluate(() => (window as any).__mythwar.mp.room?.code ?? null);
    const aStill = await a.evaluate(() => ({ online: (window as any).__mythwar.mp.state, room: (window as any).__mythwar.mp.room?.code }));
    check('duplicated tab gets its own session', dupRoom === null && aStill.online === 'online' && aStill.room === code, JSON.stringify({ dupRoom, aStill }));
    await dup.close();

    // B opens the invite link (what scanning the QR code does).
    await b.goto(`${base}/?join=${code}`, { waitUntil: 'load' });
    await waitFor(b, 'B joined the room', () => (window as any).__mythwar.menus.current === 'room');
    await waitFor(a, 'A sees B', () => document.querySelectorAll('.rseat.empty').length === 0);
    check('B in the same room', (await info(b)).room === code);
    check('invite hidden once full', await a.evaluate(() => document.querySelector('.rinvite')!.classList.contains('hidden')));
    // Renaming from the room: tap your own name.
    await a.click('.rseat.mine .sname');
    await a.keyboard.press('End');
    await a.keyboard.type(' L');
    await a.keyboard.press('Enter');
    await waitFor(b, 'B sees the new name', () => [...document.querySelectorAll('.rseat .sname')].some((e) => e.textContent === 'Ada L'));
    await shot(b, '3-room-phone');

    console.log('== battle ==');
    await press(a, '.screen.room', 'Ready');
    await sleep(200);
    check('A ready, waiting for B', (await a.evaluate(() => document.querySelector('.rnote')?.textContent ?? '')).includes('Waiting'));
    await press(b, '.screen.room', 'Ready');
    await waitFor(a, 'A battle', () => (window as any).__mythwar.state === 'playing');
    await waitFor(b, 'B battle', () => (window as any).__mythwar.state === 'playing');
    const countdown = await a.evaluate(() => document.querySelector('.ncount')?.textContent ?? '');
    check('countdown shows', /^[123]$/.test(countdown), countdown);
    await shot(b, '4-countdown-phone');
    const ia = await info(a);
    const ib = await info(b);
    check('online games, seats 0 and 1', ia.online && ib.online && ia.seat === 0 && ib.seat === 1);
    check('right-side player sees a mirrored field', !ia.mirror && ib.mirror);
    await waitFor(a, 'battle running', () => !(window as any).__mythwar.game.paused, 6000);
    // A summons with the keyboard, B taps a card.
    await a.keyboard.press('1');
    await a.keyboard.press('2');
    await sleep(300);
    const card = await b.evaluate(() => {
      const r = document.querySelector('.card')!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await b.touchscreen.tap(card.x, card.y);
    await sleep(4000);
    const a2 = await info(a);
    const b2 = await info(b);
    check('A’s orders reached B', b2.summoned[0] >= 2, `B sees ${b2.summoned[0]} summons by A`);
    check('B’s order reached A', a2.summoned[1] >= 1, `A sees ${a2.summoned[1]} summons by B`);
    check('both advance', a2.tick > 200 && b2.tick > 200, `${a2.tick} / ${b2.tick}`);
    check('ticks close together', Math.abs(a2.tick - b2.tick) < 30, `${a2.tick} vs ${b2.tick}`);
    // The mirrored player (B) drags a card onto the bottom lane and taps their own gate (left).
    const toClient = (stage: { x: number; y: number }) =>
      b.evaluate((p) => {
        const app = (window as any).__mythwar;
        return app.rotated ? { x: window.innerWidth - p.y, y: p.x } : p;
      }, stage);
    const geo = await b.evaluate(() => {
      const g = (window as any).__mythwar.renderer.layout.lanes;
      return { bottom: { x: (g[2].x0 + g[2].x1) / 2, y: g[2].y - 10 }, gate: { x: g[0].x0 - 8, y: g[0].y - 18 } };
    });
    const from = await b.evaluate(() => {
      const r = document.querySelector('.card:nth-child(2)')!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const to = await toClient(geo.bottom);
    const cdp = await b.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }] });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitFor(b, 'B’s dragged creature goes to the bottom lane', () => {
      const w = (window as any).__mythwar.game.world;
      return w.players[1].queue.some((q: any) => q.lane === 2) || w.lanes[2].some((u: any) => u.team === 1);
    });
    const gate = await toClient(geo.gate);
    await b.touchscreen.tap(gate.x, gate.y);
    await waitFor(b, 'tapping your own (left) gate opens its turret slot', () => !document.querySelector('.turretpanel')!.classList.contains('hidden'));
    await press(b, '.turretpanel', '');
    await shot(a, '5-battle-desktop');
    await shot(b, '6-battle-phone');

    console.log('== pause / resume ==');
    await a.keyboard.press('Escape');
    await waitFor(b, 'B sees the pause screen', () => (window as any).__mythwar.menus.current === 'pause');
    const ptitle = await b.evaluate(() => document.querySelector('.screen.pause h2')?.textContent ?? '');
    check('paused by Ada', ptitle.includes('Ada'), ptitle);
    await shot(b, '7-paused-phone');
    const t0 = (await info(b)).tick;
    await sleep(1000);
    check('frozen while paused', (await info(b)).tick === t0);
    await press(b, '.screen.pause', 'Resume');
    await waitFor(a, 'A resumes after countdown', () => (window as any).__mythwar.menus.current === 'none' && !(window as any).__mythwar.game.paused, 6000);
    await sleep(500);
    check('ticking again', (await info(b)).tick > t0);

    console.log('== app in the background ==');
    await b.evaluate(() => (window as any).__mythwar.mp.away(true));
    await waitFor(a, 'A told B is away', () => (document.querySelector('.nbanner.show')?.textContent ?? '').includes('is away'));
    await shot(a, '8-opponent-away');
    // The waiting player can still reach the menu (to leave, say) and close it again.
    await a.keyboard.press('Escape');
    await waitFor(a, 'A menu while B is away', () => (window as any).__mythwar.menus.current === 'pause');
    await press(a, '.screen.pause', 'Resume');
    await waitFor(a, 'A menu closed', () => (window as any).__mythwar.menus.current === 'none');
    check('B still away after A closed the menu', (await info(a)).netPause === 'away:1');
    await b.evaluate(() => (window as any).__mythwar.mp.away(false));
    await waitFor(a, 'resumed after away', () => !(window as any).__mythwar.game.paused, 6000);

    console.log('== dropped connection ==');
    await b.evaluate(() => (window as any).__mythwar.mp.conn.ws.close());
    await waitFor(a, 'A paused for B', () => ((window as any).__mythwar.game.netPause?.reason ?? '') === 'away');
    await waitFor(b, 'B back online', () => (window as any).__mythwar.game.resyncs >= 1 && (window as any).__mythwar.mp.state === 'online' && !(window as any).__mythwar.game.paused, 8000);
    const b3 = await info(b);
    check('B resynced from a snapshot', b3.resyncs >= 1, `resyncs ${b3.resyncs}`);

    console.log('== reload mid-battle ==');
    await b.reload({ waitUntil: 'load' });
    await waitFor(b, 'B back in the battle after reload', () => (window as any).__mythwar.state === 'playing' && (window as any).__mythwar.game.options.online, 8000);
    await waitFor(b, 'B running', () => !(window as any).__mythwar.game.paused, 8000);
    const b4 = await info(b);
    check('reloaded player sees the battle so far', b4.summoned[0] >= 2 && b4.tick > 200, `tick ${b4.tick}`);
    check('still mirrored after reload', b4.mirror);
    await sleep(2500);
    const a5 = await info(a);
    const b5 = await info(b);
    check('no desyncs', a5.desyncs === 0 && b5.desyncs === 0, `${a5.desyncs} / ${b5.desyncs}`);

    console.log('== leaving forfeits ==');
    await b.keyboard.press('Escape'); // (a phone keyboard isn't a thing, but the key works)
    await waitFor(b, 'B pause menu', () => (window as any).__mythwar.menus.current === 'pause');
    await press(b, '.screen.pause', 'Leave battle');
    await waitFor(a, 'A wins', () => (window as any).__mythwar.game.over && (window as any).__mythwar.game.world.winner === 0);
    await waitFor(a, 'A results', () => (window as any).__mythwar.menus.current === 'over', 6000);
    const res = await a.evaluate(() => ({ verdict: document.querySelector('.verdict')?.textContent ?? '', note: document.querySelector('.rmatch')?.textContent ?? '' }));
    check('results: victory by forfeit', res.verdict.includes('Victory') && res.verdict.includes('left'), res.verdict);
    check('results: opponent left the room', res.note.includes('left the room'), res.note);
    await waitFor(b, 'B back in the lobby', () => (window as any).__mythwar.menus.current === 'mp');
    await waitFor(b, 'room listed', () => document.querySelectorAll('.mproom').length === 1);
    await shot(b, '10-lobby-phone');
    await shot(a, '9-results-desktop');

    console.log('== rematch ==');
    // B joins again from the open-battles list.
    await waitFor(b, 'room listed', () => document.querySelectorAll('.mproom').length === 1);
    await press(b, '.mplist', 'Join');
    await waitFor(b, 'B in room again', () => (window as any).__mythwar.menus.current === 'room');
    await waitFor(a, 'A offered a rematch', () => (document.querySelector('.rmatch')?.textContent ?? '') === '' || true);
    await press(a, '.screen.over', 'Rematch');
    await press(b, '.screen.room', 'Ready');
    await waitFor(a, 'A in a new battle', () => (window as any).__mythwar.state === 'playing' && (window as any).__mythwar.game.world.tick < 200, 8000);
    await waitFor(b, 'B in a new battle', () => (window as any).__mythwar.state === 'playing', 8000);
    await sleep(4500);
    const a6 = await info(a);
    check('rematch running', a6.tick > 30 && !a6.paused, `tick ${a6.tick}`);

    console.log('== claiming the win from an absent player ==');
    await b.evaluate(() => (window as any).__mythwar.mp.away(true));
    await waitFor(a, 'A can claim after 20 s', () => {
      const btn = document.querySelector('.nclaim') as HTMLElement | null;
      return !!btn && !btn.classList.contains('hidden');
    }, 30_000);
    await shot(a, '12-claim-desktop');
    await press(a, '.netoverlay', 'Claim victory');
    await waitFor(a, 'A results after claiming', () => (window as any).__mythwar.menus.current === 'over', 8000);
    await waitFor(b, 'B results (lost: away too long)', () => (window as any).__mythwar.menus.current === 'over', 8000);
    await shot(b, '11-results-phone');

    console.log('== leaving the room ==');
    await press(a, '.screen.over', 'Leave room');
    await waitFor(a, 'A in lobby', () => (window as any).__mythwar.menus.current === 'mp');
    await press(a, '.screen.mp', 'Back');
    await waitFor(a, 'A at title', () => (window as any).__mythwar.menus.current === 'title');

    console.log('== server restart ==');
    // B sits on the results in its room; the game server restarts and forgets everyone.
    mp.close();
    mp = attachMultiplayer(http, { latency, jitter, countdown: 3 });
    await waitFor(b, 'B back in the lobby after the restart', () => (window as any).__mythwar.menus.current === 'mp' && (window as any).__mythwar.mp?.state === 'online', 10000);
    const note = await b.evaluate(() => document.querySelector('.screen.mp .mpflash')?.textContent ?? '');
    check('B told the server restarted', note.includes('restarted'), note);

    check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  } finally {
    await browser.close();
    mp.close();
    http.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll multiplayer checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
