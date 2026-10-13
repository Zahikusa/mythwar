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
import { findChrome } from './chrome.ts';

const CHROME = findChrome();
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

/** Polls a condition that spans both pages (node side) until it holds; a FAIL if it never does. */
async function until(what: string, fn: () => Promise<boolean>, timeout = 8000): Promise<boolean> {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > end) {
      check(`waiting for: ${what}`, false, 'timed out');
      return false;
    }
    await sleep(50);
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
  let mp = attachMultiplayer(http, { latency, jitter, countdown: 3, claimAfter: 4 });
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
    await waitFor(a, 'the name taken', () => (window as any).__mythwar.mp.name === 'Ada', 4000);
    // (Backlog 131) Connected with nothing open: the list says so (not the offline "—").
    await waitFor(a, 'the empty list says None yet', () => (document.querySelector('.mplist')?.textContent ?? '').includes('None yet'), 4000);
    await shot(a, '1-lobby-desktop');
    // A has taken the moon as sigil (Lens #85): B should see it on A's keep and by A's name.
    await a.evaluate(() => {
      const app = (window as any).__mythwar;
      app.settings.sigil = 1;
      app.mp.setIdentity(0, 1);
    });
    await press(a, '.screen.mp', 'Host a battle');
    await waitFor(a, 'A in a room', () => (window as any).__mythwar.menus.current === 'room');
    const code = (await info(a)).room!;
    check('room code', /^[A-Z0-9]{4}$/.test(code), code);
    // (The QR library loads on demand.)
    await waitFor(a, 'the invite QR', () => !!document.querySelector('.rqr svg'));
    const invite = await a.evaluate(() => ({ qr: !!document.querySelector('.rqr svg'), link: document.querySelector('.rlink')?.textContent ?? '' }));
    check('invite QR and link', invite.qr && invite.link.includes(`?join=${code}`), invite.link);
    // (Backlog 140) Ready can't be pressed alone — and says why.
    const why = await a.evaluate(() => {
      const b = [...document.querySelectorAll<HTMLButtonElement>('.screen.room button')].find((x) => x.textContent?.trim() === 'Ready')!;
      return { disabled: b.disabled, desc: b.getAttribute('aria-description') };
    });
    check('room: a disabled Ready says why', why.disabled && why.desc === 'Waits for a second player to join', JSON.stringify(why));
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
    // (The welcome carries the session's room: once welcomed, a taken-over seat would show.)
    await waitFor(dup, 'duplicate tab welcomed', () => (window as any).__mythwar.mp.welcomed === true);
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
    // (With A's sigil before it, as in the lobby list.)
    await waitFor(b, 'B sees the new name, with the sigil', () => [...document.querySelectorAll('.rseat .sname')].some((e) => /^☾\S* Ada L$/u.test(e.textContent ?? '')));
    await shot(b, '3-room-phone');

    console.log('== battle ==');
    await press(a, '.screen.room', 'Ready');
    await waitFor(a, 'A ready, waiting for B', () => (document.querySelector('.rnote')?.textContent ?? '').includes('Waiting'), 4000);
    await press(b, '.screen.room', 'Ready');
    await waitFor(a, 'A battle', () => (window as any).__mythwar.state === 'playing');
    await waitFor(b, 'B battle', () => (window as any).__mythwar.state === 'playing');
    const countdown = await a.evaluate(() => document.querySelector('.ncount')?.textContent ?? '');
    check('countdown shows', /^[123]$/.test(countdown), countdown);
    // (Backlog 148) The number sits below the opening banner's words, not on them (both screens).
    for (const [p, who] of [[a, 'desktop'], [b, 'phone']] as const) {
      const clear = await p.evaluate(() => {
        const n = document.querySelector('.ncount.show');
        const words = [...document.querySelectorAll('.hud .banner.show :is(.bkick, .btitle, .bsub, .blore)')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
        if (!n || !words.length) return { ok: false, why: `count ${!!n}, banner lines ${words.length}` };
        const r = n.getBoundingClientRect();
        // (Rotated phones turn the stage: compare along the stage's vertical, whichever axis that is.)
        const rotated = (window as any).__mythwar.rotated;
        const mid = rotated ? innerWidth - (r.left + r.width / 2) : r.top + r.height / 2;
        const end = Math.max(...words.map((w) => (rotated ? innerWidth - w.left : w.bottom)));
        return { ok: mid > end, why: `count centre ${Math.round(mid)}, banner ends ${Math.round(end)}` };
      });
      check(`countdown below the opening banner (${who})`, clear.ok, clear.why);
    }
    await shot(b, '4-countdown-phone');
    const ia = await info(a);
    const ib = await info(b);
    check('online games, seats 0 and 1', ia.online && ib.online && ia.seat === 0 && ib.seat === 1);
    check('right-side player sees a mirrored field', !ia.mirror && ib.mirror);
    // (The badge fills in on the HUD's next update after the battle starts.)
    await waitFor(b, "A's name in B's badge", () => (document.querySelector('.hud .nfoe')?.textContent ?? '') !== '', 4000);
    const sig = await b.evaluate(() => ({ keeps: (window as any).__mythwar.renderer.sigils, badge: document.querySelector('.hud .nfoe')?.textContent ?? '' }));
    check("B sees A's sigil on A's keep and by A's name", sig.keeps[0] === 1 && sig.keeps[1] === -1 && sig.badge.includes('☾'), JSON.stringify(sig));
    await waitFor(a, 'battle running', () => !(window as any).__mythwar.game.paused, 6000);
    // A summons with the keyboard, B taps a card.
    await a.keyboard.press('1');
    await a.keyboard.press('2');
    const card = await b.evaluate(() => {
      const r = document.querySelector('.card')!.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await b.touchscreen.tap(card.x, card.y);
    // (Orders take a turn or two to cross; the ticks show both clocks running.)
    await until('orders crossed over, both clocks past tick 200', async () => {
      const [x, y] = [await info(a), await info(b)];
      return y.summoned[0] >= 2 && x.summoned[1] >= 1 && x.tick > 200 && y.tick > 200;
    }, 12_000);
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
    // Quick message: A sends "Good luck!", B's screen shows it by A's citadel (right for B).
    // (The picker closes when you tap elsewhere.)
    await a.click('.emotebtn');
    await a.mouse.click(700, 400);
    check('quick-message picker closes on an outside tap', await a.evaluate(() => document.querySelector('.emotes')!.classList.contains('hidden')));
    await a.click('.emotebtn');
    await press(a, '.emotes', 'Good luck!');
    await waitFor(b, 'B sees the quick message', () => document.querySelector('.ebubble.theirs.show')?.textContent === 'Good luck!');
    await shot(b, '6b-emote-phone');
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
    await until('B ticking again', async () => (await info(b)).tick > t0, 4000);
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
    // (A desync would show within a few seconds of turns: let both run ~150 more ticks.)
    await until('both run on after the reload', async () => (await info(a)).tick > b4.tick + 150 && (await info(b)).tick > b4.tick + 150, 10_000);
    const a5 = await info(a);
    const b5 = await info(b);
    check('no desyncs', a5.desyncs === 0 && b5.desyncs === 0, `${a5.desyncs} / ${b5.desyncs}`);

    console.log('== leaving forfeits ==');
    await b.keyboard.press('Escape'); // (a phone keyboard isn't a thing, but the key works)
    await waitFor(b, 'B pause menu', () => (window as any).__mythwar.menus.current === 'pause');
    // (Backlog 125) A's quick message reaches B on the menu (bubbles hide under menus).
    // (The server takes one quick message per 1.5 s and drops the rest: send until it lands.)
    await until('B reads A on the menu', async () => {
      await a.evaluate(() => (window as any).__mythwar.mp.emote('gl'));
      await sleep(300);
      return b.evaluate(() => /: Good luck!/.test(document.querySelector('.screen.pause .vemoteline')?.textContent ?? ''));
    }, 5000);
    await press(b, '.screen.pause', 'Leave battle');
    await waitFor(a, 'A wins', () => (window as any).__mythwar.game.over && (window as any).__mythwar.game.world.winner === 0);
    await waitFor(a, 'A results', () => (window as any).__mythwar.menus.current === 'over', 6000);
    const res = await a.evaluate(() => ({ verdict: document.querySelector('.verdict')?.textContent ?? '', note: document.querySelector('.rmatch')?.textContent ?? '' }));
    check('results: victory by forfeit', res.verdict.includes('Victory') && res.verdict.includes('left'), res.verdict);
    check('results: opponent left the room', res.note.includes('left the room'), res.note);
    // (The chronicle ends with what happened — no citadel fell.)
    const story = await a.evaluate(() => document.querySelector('.screen.over')?.textContent ?? '');
    // (Backlog 147) The other player gone: one way back to the room, not "Room" and "Back to room".
    const shown = await a.evaluate(() => [...document.querySelectorAll<HTMLElement>('.screen.over .mrow button')].filter((e) => e.offsetParent !== null).map((e) => e.textContent?.trim()));
    check('results: once the opponent left, one button leads back to the room', shown.includes('Back to room') && !shown.includes('Room'), JSON.stringify(shown));
    check("results: the chronicle says the opponent left", /Victory: [^.]+ leaves the battle\./.test(story) && !story.includes('citadel falls'), story.slice(0, 120));
    await waitFor(b, 'B back in the lobby', () => (window as any).__mythwar.menus.current === 'mp');
    // (Backlog 54) Both sides count it: the leaver a defeat (and the journal notes it).
    {
      const tally = (p: Page) =>
        p.evaluate(() => {
          const s = (window as any).__mythwar.settings;
          return { online: s.online, last: s.journal.at(-1) };
        });
      const ta = await tally(a);
      const tb = await tally(b);
      const aName = await a.evaluate(() => (window as any).__mythwar.mp.name);
      const bName = await b.evaluate(() => (window as any).__mythwar.mp.name);
      check('leaving counts as a defeat on both sides', ta.online[bName]?.w >= 1 && tb.online[aName]?.l >= 1 && tb.last?.mode === 'online' && tb.last?.won === false, JSON.stringify({ a: ta.online[bName], b: tb.online[aName], journal: tb.last?.mode }));
    }
    await waitFor(b, 'room listed', () => document.querySelectorAll('.mproom').length === 1);
    await shot(b, '10-lobby-phone');
    await shot(a, '9-results-desktop');

    console.log('== rematch ==');
    // B joins again from the open-battles list.
    await waitFor(b, 'room listed', () => document.querySelectorAll('.mproom').length === 1);
    await press(b, '.mplist', 'Join');
    await waitFor(b, 'B in room again', () => (window as any).__mythwar.menus.current === 'room');
    await waitFor(a, 'A offered a rematch', () => [...document.querySelectorAll('.screen.over button')].some((b) => b.textContent?.trim() === 'Rematch'));
    await press(a, '.screen.over', 'Rematch');
    await waitFor(a, 'A ready for the rematch', () => !!(window as any).__mythwar.mp.room?.seats[0]?.ready);
    // (Backlog #29) B switches to another app just as the rematch starts: the battle must wait
    // for B like for any other absence, and run once B is back.
    await b.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
    await press(b, '.screen.room', 'Ready');
    await waitFor(a, 'A in a new battle', () => (window as any).__mythwar.state === 'playing' && (window as any).__mythwar.game.world.tick < 200, 8000);
    await waitFor(b, 'B in a new battle', () => (window as any).__mythwar.state === 'playing', 8000);
    await waitFor(a, 'A waits for B (hidden as it started)', () => ((window as any).__mythwar.game.netPause?.reason ?? '') === 'away', 6000);
    const held = await info(a);
    check('a battle starting in a hidden tab waits for that player', held.netPause === 'away:1' && held.tick < 60, `${held.netPause} at tick ${held.tick}`);
    // (Backlog 145) "Bo is away" takes the intro banner's place instead of showing through it.
    await waitFor(a, 'the away notice shows', () => !!document.querySelector('.netoverlay .nbanner.show'), 4000);
    const intro = await a.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hud .banner.show')].map((e) => getComputedStyle(e).visibility));
    check('the away notice hides the intro banner under it', intro.every((v) => v === 'hidden'), JSON.stringify(intro));
    await shot(a, '12a-away-at-start');
    await b.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(a, 'B back: the rematch runs', () => !(window as any).__mythwar.game.netPause && !(window as any).__mythwar.game.paused, 10000);
    await waitFor(a, 'the rematch past its first ticks', () => (window as any).__mythwar.game.world.tick > 30, 8000);
    const a6 = await info(a);
    check('rematch running', a6.tick > 30 && !a6.paused, `tick ${a6.tick}`);

    console.log('== claiming the win from an absent player ==');
    await b.evaluate(() => (window as any).__mythwar.mp.away(true));
    await waitFor(a, 'A can claim after a while', () => {
      const btn = document.querySelector('.nclaim') as HTMLElement | null;
      return !!btn && !btn.classList.contains('hidden');
    }, 30_000);
    await shot(a, '12-claim-desktop');
    await press(a, '.netoverlay', 'Claim victory');
    await waitFor(a, 'A results after claiming', () => (window as any).__mythwar.menus.current === 'over', 8000);
    await waitFor(b, 'B results (lost: away too long)', () => (window as any).__mythwar.menus.current === 'over', 8000);
    {
      const [ta, tb] = await Promise.all([a, b].map((p) => p.evaluate(() => document.querySelector('.screen.over')?.textContent ?? '')));
      check('results: the chronicle tells a claimed win as an absence on both sides', ta.includes('was away too long.') && tb.includes('Defeat: you were away too long.'), `${ta.slice(-80)} | ${tb.slice(-80)}`);
    }
    // After the battle B says "Well played!" from the results; A reads it on theirs (backlog #25).
    await press(b, '.screen.over', 'Well played!');
    await waitFor(a, 'A hears B on the results', () => (document.querySelector('.screen.over .vemoteline')?.textContent ?? '').includes('Well played!'), 4000);
    const said = await a.evaluate(() => document.querySelector('.screen.over .vemoteline')?.textContent ?? '');
    const own = await b.evaluate(() => document.querySelector('.screen.over .vemoteline')?.textContent ?? '');
    check('results: a quick message after the battle reaches the other player', said.endsWith(': Well played!') && own === 'You: Well played!', `${said} | ${own}`);
    await shot(b, '11-results-phone');
    // (Backlog 105) The online results' buttons (Leave room · Share · Room · Rematch) all fit a
    // small phone, without overlapping.
    for (const [w, h] of [[640, 360], [360, 640]] as const) {
      await b.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await sleep(400);
      const fit = await b.evaluate(() => {
        const rs = [...document.querySelectorAll('.screen.over .mrow button')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
        const inside = rs.every((r) => r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1);
        const overlap = rs.some((r, i) => rs.some((q, j) => j > i && r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1));
        return { n: rs.length, inside, overlap, boxes: rs.map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]) };
      });
      check(`online results: all buttons fit a ${w}×${h} phone`, fit.n === 4 && fit.inside && !fit.overlap, JSON.stringify(fit));
    }
    await b.setViewport({ width: portrait ? 390 : 844, height: portrait ? 844 : 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    // (Backlog 88/100) B's connection drops on the results: A's rematch note says so — not
    // "Waiting for Bo…" for the minute the seat is kept.
    await b.evaluate(() => (window as any).__mythwar.mp.conn.close());
    await waitFor(a, 'A told B lost the connection', () => (document.querySelector('.screen.over .rmatch')?.textContent ?? '').includes('lost the connection'), 6000);
    check('results: the rematch note says when the other player lost the connection', true);
    await b.evaluate(() => (window as any).__mythwar.mp.conn.open());
    await waitFor(a, 'B back: the note clears', () => !(document.querySelector('.screen.over .rmatch')?.textContent ?? '').includes('lost the connection'), 8000);

    // (Backlog 109) Every control on the online results — the chips, Leave room, Share, Room,
    // Rematch — can be reached with a gamepad's D-pad (a breadth-first walk over the app's moves).
    const reach = await a.evaluate(() => {
      const app = (window as any).__mythwar;
      const screen = document.querySelector('.screen.over') as HTMLElement;
      const all = [...screen.querySelectorAll<HTMLElement>('button')].filter((b) => b.offsetParent !== null && !(b as HTMLButtonElement).disabled);
      const label = (b: HTMLElement) => b.textContent?.trim() ?? '';
      const start = screen.querySelector<HTMLElement>('.mbtn.primary')!;
      const seen = new Set<HTMLElement>([start]);
      const queue = [start];
      while (queue.length) {
        const from = queue.shift()!;
        for (const dir of ['up', 'down', 'left', 'right']) {
          app.setPadFocus(from);
          app.padMenu(dir);
          const to = app.padFocus as HTMLElement | null;
          if (to && !seen.has(to)) {
            seen.add(to);
            queue.push(to);
          }
        }
      }
      app.setPadFocus(null);
      return { all: all.map(label), unreachable: all.filter((b) => !seen.has(b)).map(label) };
    });
    check('gamepad: every control on the online results is reachable with the D-pad', reach.unreachable.length === 0 && reach.all.includes('Room') && reach.all.includes('Well played!'), JSON.stringify(reach));

    console.log('== leaving the room ==');
    // (Backlog 87) A goes back to the room from the results — still seated — and leaves from there.
    await press(a, '.screen.over', 'Room');
    await waitFor(a, 'A back in the room from the results', () => (window as any).__mythwar.menus.current === 'room' && (window as any).__mythwar.state === 'title', 6000);
    check('results → Room: back in the battle room, still seated', await a.evaluate(() => (window as any).__mythwar.mp.seat !== null && !!(window as any).__mythwar.mp.room));
    await press(a, '.screen.room', 'Leave room');
    await waitFor(a, 'A in lobby', () => (window as any).__mythwar.menus.current === 'mp');
    // The server's Hall of champions remembers both battles (Lens #86).
    await waitFor(a, 'hall shown', () => (document.querySelector('.mphall')?.textContent ?? '').includes('Champions'), 4000);
    const hallText = await a.evaluate(() => document.querySelector('.mphall')?.textContent ?? '');
    check('lobby: the Hall of champions counts the battles', /Ada L 2–0/.test(hallText), hallText);
    await shot(a, '13-lobby-hall');
    await press(a, '.screen.mp', 'Back');
    await waitFor(a, 'A at title', () => (window as any).__mythwar.menus.current === 'title');

    console.log('== co-op against the AI ==');
    // B (still in the room, at the results; A has left) goes back to the room and makes it a
    // co-op room; A comes back and joins.
    await press(b, '.screen.over', 'Back to room');
    await waitFor(b, 'B back in the room from the results', () => (window as any).__mythwar.menus.current === 'room' && (window as any).__mythwar.state === 'title', 6000);
    check('results → Back to room (the other player gone): still seated', await b.evaluate(() => (window as any).__mythwar.mp.seat !== null && !!(window as any).__mythwar.mp.room));
    const coopCode = await b.evaluate(() => (window as any).__mythwar.mp.room.code as string);
    await b.evaluate(() => (window as any).__mythwar.mp.setCoop('novice'));
    await a.evaluate((c) => (window as any).__mythwar.openMultiplayer(c), coopCode);
    await waitFor(a, 'A in the co-op room', () => (window as any).__mythwar.mp?.room?.coop === 'novice' && (window as any).__mythwar.menus.current === 'room', 8000);
    const vs = await a.evaluate(() => document.querySelector('.screen.room .rvs')?.textContent ?? '');
    check('co-op room shows the allies together', vs === '&', vs);
    // (Backlog 90) A takes a handicap: B is told why their Ready went (in words, not only a re-render).
    await a.evaluate(() => (window as any).__mythwar.mp.setTrials(['glass']));
    await waitFor(b, 'B told about the handicap', () => /now fights under Glass Citadel/.test(document.querySelector('.screen.room .mpflash')?.textContent ?? ''), 4000);
    // (B wasn't Ready: nothing to press "again".)
    const told = await b.evaluate(() => document.querySelector('.screen.room .mpflash')?.textContent ?? '');
    check('room: a handicap change says "press Ready again" only to a player who was Ready', !told.includes('again'), told);
    await a.evaluate(() => (window as any).__mythwar.mp.setTrials([]));
    // (A Ready sent before the room's latest change is ignored as stale — backlog 96: both wait
    // until they see the handicap gone.)
    for (const p of [a, b]) await waitFor(p, 'the handicap gone', () => ((window as any).__mythwar.mp.room?.seats[0]?.trials.length ?? 1) === 0, 4000);
    for (const p of [a, b]) await p.evaluate(() => (window as any).__mythwar.mp.ready(true));
    await waitFor(a, 'A in the co-op battle', () => (window as any).__mythwar.state === 'playing' && (window as any).__mythwar.game.coop === 'novice', 8000);
    await waitFor(b, 'B in the co-op battle', () => (window as any).__mythwar.state === 'playing' && (window as any).__mythwar.game.coop === 'novice', 8000);
    await waitFor(a, 'co-op battle running', () => !(window as any).__mythwar.game.paused && (window as any).__mythwar.game.world.tick > 30, 8000);
    // Both allies summon for the left side; the server's AI fights back on the right.
    for (const p of [a, b]) await p.evaluate(() => (window as any).__mythwar.game.command({ type: 'train', team: 0, unitId: 'redcap', lane: 1 }));
    await waitFor(a, 'the AI summons', () => (window as any).__mythwar.game.world.players[1].stats.summoned > 0, 20_000);
    await until('both allies see both orders', async () => (await info(a)).summoned[0] >= 2 && (await info(b)).summoned[0] >= 2, 8000);
    const ca = await info(a);
    const cb2 = await info(b);
    check('co-op: both allies play the left side, unmirrored', ca.seat === 0 && cb2.seat === 0 && !ca.mirror && !cb2.mirror, JSON.stringify([ca.seat, cb2.seat, ca.mirror, cb2.mirror]));
    check('co-op: both orders went to the shared side', ca.summoned[0] >= 2 && cb2.summoned[0] >= 2, JSON.stringify([ca.summoned, cb2.summoned]));
    check('co-op: no desyncs with the server-run AI', ca.desyncs === 0 && cb2.desyncs === 0, `${ca.desyncs} / ${cb2.desyncs}`);
    const ally = await b.evaluate(() => document.querySelector('.hud .agerow.left .agename')?.textContent ?? document.querySelector('.hud .agerow.left')?.textContent ?? '');
    check('co-op: the HUD names the ally', ally.includes('You &'), ally);
    // Allies call lanes: A asks for help in the middle; B sees the call and the lane lights up.
    const menu = await a.evaluate(() => [...document.querySelectorAll('.hud .emotes .emote')].map((e) => e.textContent).join('|'));
    check('co-op: quick messages are tactical calls', menu.includes('Help middle!') && !menu.includes('Good luck!'), menu);
    await a.evaluate(() => (window as any).__mythwar.hud.sendEmote('help1'));
    await waitFor(b, 'B hears the lane call', () => (document.querySelector('.hud .ebubble.mine')?.textContent ?? '').includes('Help middle!'), 4000);
    const lit = await b.evaluate(() => (window as any).__mythwar.renderer.lanePingT[1] > 0);
    check('co-op: a lane call lights that lane for the ally', lit);
    // A steps out of the battle: B fights on alone.
    await a.evaluate(() => (window as any).__mythwar.leaveRoom());
    // (B is told A left — the seat empties — and the battle must keep running after that.)
    await waitFor(b, 'B sees the ally leave', () => (window as any).__mythwar.mp.room?.seats.filter(Boolean).length === 1, 6000);
    const leftAt = (await info(b)).tick;
    await until('B plays on', async () => (await info(b)).tick > leftAt + 60, 6000);
    const solo = await info(b);
    check('co-op: the ally plays on when the other leaves', !solo.over && !solo.paused && solo.netPause === null, JSON.stringify(solo));
    await b.evaluate(() => (window as any).__mythwar.leaveRoom());
    await waitFor(b, 'B in the lobby after co-op', () => (window as any).__mythwar.menus.current === 'mp', 8000);
    // (B waits in a fresh room for the restart check below.)
    await b.evaluate(() => (window as any).__mythwar.mp.host());
    await waitFor(b, 'B hosting again', () => (window as any).__mythwar.menus.current === 'room', 8000);
    // A, back in the lobby, knows B from two battles: listed as an old rival with the record (Lens #84).
    await waitFor(a, 'A in the lobby after co-op', () => (window as any).__mythwar.menus.current === 'mp', 8000);
    await waitFor(a, "B's room listed for A", () => document.querySelectorAll('.mproom').length === 1, 8000);
    const rival = await a.evaluate(() => ({ friend: !!document.querySelector('.mproom.friend'), text: document.querySelector('.mproom .mphost span')?.textContent ?? '' }));
    check('lobby: a returning opponent is recognised with your record', rival.friend && rival.text.includes('you 2 – 0'), JSON.stringify(rival));

    console.log('== server restart ==');
    // B sits on the results in its room; the game server restarts and forgets everyone.
    mp.close();
    mp = attachMultiplayer(http, { latency, jitter, countdown: 3, claimAfter: 4 });
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
