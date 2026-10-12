/**
 * End-to-end smoke test: drives the built game in Chrome like a player would.
 *   npm run build && node scripts/smoke.ts
 * Exits non-zero on any failed check or console error.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Page } from 'puppeteer-core';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function state(page: Page): Promise<{ gold: number; queue: number; summoned: number; lane: number; paused: boolean; turrets: (string | null)[]; age: number; menu: string; over: boolean }> {
  return page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const g = app.game;
    const p = g.world.players[0];
    return {
      gold: p.gold,
      queue: p.queue.length,
      summoned: p.stats.summoned,
      lane: g.view.selectedLane,
      paused: g.paused,
      turrets: p.turrets.map((t: any) => (t.def ? t.def.id : null)),
      age: p.age,
      menu: app.menus.current,
      over: g.over,
    };
  });
}

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await (await page.$(selector))!.boundingBox();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Centre of the first button under `scope` whose text is `text`. */
async function centerText(page: Page, scope: string, text: string): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (scope, text) => {
      const b = [...document.querySelectorAll<HTMLElement>(`${scope} button`)].find((el) => el.textContent?.trim() === text)!;
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    scope,
    text,
  );
}

async function laneScreen(page: Page, lane: number, frac = 0.4): Promise<{ x: number; y: number }> {
  return page.evaluate(
    (lane, frac) => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      const g = app.renderer.layout.lanes[lane];
      const sx = g.x0 + (g.x1 - g.x0) * frac;
      const sy = g.y - 10;
      // Stage → client coordinates (the stage is rotated 90° on portrait phones).
      return app.rotated ? { x: window.innerWidth - sy, y: sx } : { x: sx, y: sy };
    },
    lane,
    frac,
  );
}

async function resumeFlow(page: Page): Promise<void> {
  console.log('== autosave / continue ==');
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/?play=adept&seed=13&ff=25`, { waitUntil: 'load' });
  await sleep(1500);
  const saved = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const g = app.game;
    g.world.players[0].gold = 500;
    g.command({ type: 'train', team: 0, unitId: 'treant', lane: 2 });
    app.persist();
    return { time: g.world.time, gold: g.world.players[0].gold };
  });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await sleep(1200);
  const visible = await page.evaluate(() => !document.querySelector('.mbtn.continue')!.classList.contains('hidden'));
  check('title offers "Continue battle" after an autosave', visible);
  // Enter presses the title's primary button (here: Continue).
  await page.keyboard.press('Enter');
  await sleep(500);
  const st = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const g = app.game;
    return { state: app.state, paused: g.paused, time: g.world.time, gold: g.world.players[0].gold, queue: g.world.players[0].queue.length, menu: app.menus.current };
  });
  // (pagehide saves again on navigation, so allow a few ticks of difference.)
  check('continue restores the battle, paused', st.state === 'playing' && st.paused && st.menu === 'pause' && Math.abs(st.time - saved.time) < 0.25 && Math.abs(st.gold - saved.gold) < 2 && st.queue === 1, JSON.stringify({ saved, st }));
  const summary = await page.evaluate(() => document.querySelector('.psummary')?.textContent ?? '');
  check('the continued battle shows its pause summary', summary.includes('foes slain'), summary);
  // Creatures already on the field are drawn in full while paused (not mid fade-in at alpha 0).
  const shown = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const w = app.game.world;
    const old = w.units.filter((u: any) => u.alive && w.time - u.bornAt > 0.5);
    return { creatures: old.length, faded: old.filter((u: any) => (app.renderer.vis.get(u.id)?.spawn ?? 0) < 1).length };
  });
  check('a continued battle shows its creatures while paused', shown.creatures > 0 && shown.faded === 0, JSON.stringify(shown));
  // Leaving the battle abandons the save.
  await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.toTitle());
  await sleep(300);
  const gone = await page.evaluate(() => document.querySelector('.mbtn.continue')!.classList.contains('hidden'));
  check('leaving a battle discards its autosave', gone);
  // A new battle from the title replaces the autosave: the difficulty screen warns, and a battle
  // past its first minute is counted as a defeat (as leaving it from the pause menu would be).
  {
    const app = () => (window as unknown as { __mythwar: any }).__mythwar;
    await page.goto(`${base}/?play=adept&seed=13&ff=70`, { waitUntil: 'load' });
    await sleep(600);
    await page.evaluate(`(${app})().persist()`);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await sleep(900);
    const before = await page.evaluate(`(() => { const a = (${app})(); a.settings.tutorialSeen = true; return a.settings.records.adept?.losses ?? 0; })()`);
    const nb = await centerText(page, '.screen.title', 'New battle');
    await page.mouse.click(nb.x, nb.y);
    await sleep(500);
    const note = await page.evaluate(() => !document.querySelector('.dnote')!.classList.contains('hidden'));
    const bb = await centerText(page, '.screen.difficulty', 'Begin Battle');
    await page.mouse.click(bb.x, bb.y);
    await sleep(500);
    const after = (await page.evaluate(`(() => { const a = (${app})(); return { losses: a.settings.records.adept?.losses ?? 0, state: a.state }; })()`)) as { losses: number; state: string };
    check('a new battle from the title warns about and forfeits the autosave', note && after.losses === (before as number) + 1 && after.state === 'playing', JSON.stringify({ note, before, after }));
    // Leave it (discarding its autosave) so navigating away doesn't save it again.
    await page.evaluate(`(${app})().toTitle()`);
    await sleep(200);
  }
  // Corrupted storage (older build / hand-edited) must not stop the game from loading.
  await page.evaluate(() => {
    localStorage.setItem('mythwar.battle.v1', JSON.stringify({ v: 1, difficulty: 'godlike', world: { players: [{ age: 42 }], time: 'soon' } }));
    localStorage.setItem('mythwar.settings.v1', JSON.stringify({ master: 'loud', difficulty: 'godlike', hintsSeen: 7, records: { novice: 3 }, speed: 9 }));
  });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await sleep(900);
  const boot = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    return { menu: app.menus.current, cont: !document.querySelector('.mbtn.continue')!.classList.contains('hidden'), master: app.settings.master, diff: app.settings.difficulty, saved: localStorage.getItem('mythwar.battle.v1') };
  });
  check('a malformed autosave / settings still boots to the title', boot.menu === 'title' && !boot.cont && boot.master === 0.8 && boot.diff === 'novice' && boot.saved === null, JSON.stringify(boot));
  await page.evaluate(() => localStorage.clear());
}

/** Offline cache: the service worker keeps the current build's bundles and drops older ones. */
async function serviceWorkerFlow(page: Page): Promise<void> {
  console.log('== service worker ==');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  // A bundle left over from an earlier build…
  await page.evaluate(async () => {
    const c = await caches.open('mythwar-v3');
    await c.put(new Request('./assets/index-OLDBUILD.js'), new Response('// old'));
    // …and a lazily loaded chunk the page doesn't name (must survive).
    await c.put(new Request('./assets/lazy-ABCDEFGH.js'), new Response('// lazy'));
  });
  await page.reload({ waitUntil: 'load' });
  await sleep(800);
  const keys = await page.evaluate(async () => (await (await caches.open('mythwar-v3')).keys()).map((r) => new URL(r.url).pathname));
  const current = await page.evaluate(() => [...document.querySelectorAll('script[src], link[rel=stylesheet]')].map((e) => new URL((e as HTMLScriptElement).src || (e as HTMLLinkElement).href).pathname));
  check('service worker drops bundles of older builds', !keys.some((k) => k.includes('OLDBUILD')), JSON.stringify(keys));
  check('service worker caches the current bundles', current.every((c) => keys.includes(c)), JSON.stringify({ current, keys }));
  check('service worker keeps lazily loaded chunks', keys.some((k) => k.includes('lazy-ABCDEFGH')), JSON.stringify(keys));
}

/** Esc out of the first-run how-to must not leave its "then start a battle" hand-off behind. */
async function tutorialHandoffFlow(page: Page): Promise<void> {
  console.log('== first-run tutorial hand-off ==');
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await sleep(1200);
  const play = await center(page, '.screen.title .mbtn.primary:not(.hidden)');
  await page.mouse.click(play.x, play.y);
  await sleep(500);
  const begin = await center(page, '.screen.difficulty .mbtn.primary');
  await page.mouse.click(begin.x, begin.y);
  await sleep(500);
  await page.keyboard.press('Escape');
  await sleep(400);
  const menu = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.menus.current);
  check('Esc leaves the first-run how-to', menu === 'difficulty', menu);
  await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    app.play('novice');
    app.pause();
  });
  await sleep(400);
  const hb = await center(page, '.screen.pause .mbtn:nth-child(2)');
  await page.mouse.click(hb.x, hb.y);
  await sleep(400);
  const r = await page.evaluate(() => ({
    menu: (window as unknown as { __mythwar: any }).__mythwar.menus.current,
    skipHidden: document.querySelector('.screen.howto .hskip')!.classList.contains('hidden'),
  }));
  check('how-to from the pause menu offers no "Skip to battle"', r.menu === 'howto' && r.skipHidden, JSON.stringify(r));
  await page.evaluate(() => localStorage.clear());
}

/** Small landscape phones: each menu's main button is on screen without scrolling. */
async function phoneMenusFit(page: Page): Promise<void> {
  console.log('== phone menus fit ==');
  for (const [w, h] of [[844, 390], [640, 360]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(`${base}/?screen=settings`, { waitUntil: 'load' });
    await sleep(900);
    const visible = (sel: string) =>
      page.evaluate((sel) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), fits: r.top >= 0 && r.bottom <= innerHeight };
      }, sel);
    const done = await visible('.screen.settings .mbtn.primary');
    check(`${w}x${h}: Settings' Done button is on screen`, done.fits, JSON.stringify(done));
    await page.goto(`${base}/?play=adept&seed=4`, { waitUntil: 'load' });
    await sleep(1000);
    await page.evaluate(() => {
      const w = (window as unknown as { __mythwar: any }).__mythwar.game.world;
      w.players[1].baseHp = 1;
      w.damageBase(1, 10, 0, 0);
    });
    await sleep(3600);
    const rematch = await visible('.screen.over .mbtn.primary');
    check(`${w}x${h}: Results' Rematch button is on screen`, rematch.fits, JSON.stringify(rematch));
  }
}

/** A page error with where it was thrown (first stack frames), for errors that are hard to reproduce. */
function pageError(label: string, e: unknown): string {
  const frames = ((e as Error).stack ?? '').split('\n').slice(1, 4).map((f) => f.trim()).join(' / ');
  return `${label}: ${String(e)}${frames ? ` @ ${frames}` : ''}`;
}

async function rotatedMenusFlow(page: Page): Promise<void> {
  console.log('== rotated portrait menus ==');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await sleep(1500);
  const playBtn = await center(page, '.screen.title .mbtn.primary:not(.hidden)');
  await page.touchscreen.tap(playBtn.x, playBtn.y);
  await sleep(600);
  let menu = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.menus.current);
  check('rotated: Play opens the difficulty screen', menu === 'difficulty', menu);
  const begin = await center(page, '.screen.difficulty .mbtn.primary');
  const inView = begin.x > 0 && begin.x < 390 && begin.y > 0 && begin.y < 844;
  check('rotated: Begin Battle is on screen', inView, JSON.stringify(begin));
  await page.touchscreen.tap(begin.x, begin.y);
  await sleep(600);
  // A first-time player sees the how-to first, with a Skip button straight into battle.
  menu = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.menus.current);
  check('rotated: first battle opens the how-to first', menu === 'howto', menu);
  const skip = await center(page, '.screen.howto .hskip');
  await page.touchscreen.tap(skip.x, skip.y);
  await sleep(600);
  const st = await page.evaluate(() => ({ state: (window as unknown as { __mythwar: any }).__mythwar.state, menu: (window as unknown as { __mythwar: any }).__mythwar.menus.current }));
  check('rotated: Skip starts the battle', st.state === 'playing' && st.menu === 'none', JSON.stringify(st));
  // Notch + home bar (upright iPhone, standalone): the rotated stage stays inside the insets and
  // taps still land on the right lane.
  const ins = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    app.safeArea = () => ({ l: 0, r: 0, t: 47, b: 34 });
    app.resize();
    const r = document.getElementById('stage')!.getBoundingClientRect();
    const g = app.renderer.layout.lanes[2];
    // Stage → client for the rotated stage: x' = vw - inset.r - y, y' = inset.t + x.
    const lane = { x: window.innerWidth - 0 - (g.y - 10), y: 47 + (g.x0 + (g.x1 - g.x0) * 0.4) };
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, lane };
  });
  check('rotated: stage keeps clear of notch and home bar', Math.abs(ins.top - 47) < 1 && Math.abs(ins.bottom - (844 - 34)) < 1, JSON.stringify(ins));
  await page.touchscreen.tap(ins.lane.x, ins.lane.y);
  await sleep(150);
  const laneSel = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.view.selectedLane);
  check('rotated with insets: tapping a lane selects it', laneSel === 2, `lane=${laneSel}`);
  await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    delete app.safeArea;
    app.resize();
  });
  // Slow-device fallback: 4 s under 40 fps mid-battle switches to battery saver once.
  const q = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    app.game.world.time = 30;
    for (let i = 0; i < 4; i++) app.watchPerformance(25);
    const r = { low: app.settings.lowQuality, quality: app.renderer.quality };
    app.settings.lowQuality = false;
    app.applySettings(app.settings);
    return r;
  });
  check('slow frame rate switches to battery saver', q.low === true && q.quality === 'low', JSON.stringify(q));
}

/** 2560x1440 desktop: the HUD is zoomed; hit areas, tooltips and the bottom inset must still line up. */
async function largeDesktopFlow(page: Page): Promise<void> {
  console.log('== large desktop (QHD) ==');
  await page.setViewport({ width: 2560, height: 1440, deviceScaleFactor: 1 });
  await page.goto(`${base}/?play=novice&seed=4`, { waitUntil: 'load' });
  await sleep(900);
  const info = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const box = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height };
    };
    return { zoom: app.renderer.layout.hud, inset: app.renderer.layout.insets.bottom, card: box('.card'), topbar: box('.topbar'), sys: box('.sys') };
  });
  check('HUD zooms on large screens', info.zoom > 1.2 && info.card.h > 130, JSON.stringify({ zoom: info.zoom, cardH: info.card.h }));
  check('zoomed cards sit inside the bottom inset', info.card.t >= 1440 - info.inset && info.card.b <= 1440, JSON.stringify({ inset: info.inset, card: info.card }));
  check('top bar stays clear of the system buttons', info.topbar.r <= info.sys.l + 1, JSON.stringify({ topbar: info.topbar.r, sys: info.sys.l }));
  const card = await center(page, '.card');
  await page.mouse.move(card.x, card.y);
  await sleep(250);
  const tip = await page.evaluate(() => {
    const r = document.querySelector('.tooltip')!.getBoundingClientRect();
    const c = document.querySelector('.card')!.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, cardTop: c.top, hidden: document.querySelector('.tooltip')!.classList.contains('hidden') };
  });
  check('card tooltip sits above the card, on screen', !tip.hidden && tip.b <= tip.cardTop && tip.t >= 0 && tip.l >= 0 && tip.r <= 2560, JSON.stringify(tip));
  const tab = await center(page, '.lanetab:nth-child(1)');
  const lane0 = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const g = app.renderer.layout.lanes[0];
    return { x: g.x0, y: g.y };
  });
  await page.mouse.click(tab.x, tab.y);
  await sleep(100);
  const s = await state(page);
  check('zoomed lane tab sits by its gate and selects the lane', s.lane === 0 && Math.abs(tab.y - lane0.y) < 80 && tab.x < lane0.x, JSON.stringify({ tab, lane0, lane: s.lane }));
  // The cursor shows what's clickable: lanes, and your gates (with a tooltip).
  {
    const pts = await page.evaluate(() => {
      const L = (window as unknown as { __mythwar: any }).__mythwar.renderer.layout;
      const g = L.lanes[1];
      return { lane: { x: (g.x0 + g.x1) / 2, y: g.y - 10 }, gate: { x: g.x0 - 15, y: g.y - 20 }, sky: { x: L.width / 2, y: 80 } };
    });
    const cur: Record<string, string[]> = {};
    for (const [k, pt] of Object.entries(pts)) {
      await page.mouse.move(pt.x, pt.y);
      await sleep(50);
      cur[k] = await page.evaluate(() => {
        const c = document.querySelector('canvas')!;
        return [c.style.cursor, c.title];
      });
    }
    check('cursor marks lanes and gates as clickable', cur.lane[0] === 'pointer' && cur.gate[0] === 'pointer' && cur.gate[1].includes('turret') && cur.sky[0] === '', JSON.stringify(cur));
  }
  // Dragging a card: the (zoomed) ghost follows the pointer.
  {
    const c = await center(page, '.card');
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    const to = { x: 1100, y: 700 };
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(c.x + ((to.x - c.x) * i) / 6, c.y + ((to.y - c.y) * i) / 6);
      await sleep(16);
    }
    const gr = await page.evaluate(() => {
      const r = document.querySelector('.drag-ghost')!.getBoundingClientRect();
      return { cx: r.left + r.width / 2, top: r.top, bottom: r.bottom, w: r.width };
    });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    check('zoomed drag ghost sits over the pointer', Math.abs(gr.cx - to.x) < 3 && gr.top < to.y && gr.bottom > to.y - 10 && gr.w > 70, JSON.stringify(gr));
  }
  // Coach: with the XP for the next age but never the gold, a tip teaches saving up (after 40 s).
  {
    const r = await page.evaluate(async () => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      const hints = app.settings.hintsSeen.slice();
      app.settings.hintsSeen = ['summon', 'lanes', 'counters', 'packs', 'jammed', 'wards', 'power', 'shrine', 'ascend', 'turret', 'portals', 'bless'];
      const g = app.game;
      app.coach.attach(g);
      const me = g.world.players[0];
      me.xp = 900;
      me.gold = 20;
      app.coach.update();
      const early = document.querySelector('.coach')!.classList.contains('show');
      g.world.time += 45;
      app.coach.update();
      const text = document.querySelector('.coach')!.classList.contains('show') ? document.querySelector('.coach .ctext')!.textContent : '';
      app.settings.hintsSeen = hints;
      app.coach.attach(g);
      return { early, text };
    });
    check('coach teaches saving up for the tithe', !r.early && /Save up to Ascend/.test(r.text ?? ''), JSON.stringify(r));
    // A tip covered by a panel for longer than it shows is still there afterwards (not used up).
    const r2 = await page.evaluate(async () => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      const hints = app.settings.hintsSeen.slice();
      app.settings.hintsSeen = ['summon'];
      const g = app.game;
      app.coach.attach(g);
      g.world.players[0].stats.summoned = 3;
      app.coach.update();
      const first = document.querySelector('.coach .ctext')!.textContent ?? '';
      app.coach.update(true);
      g.world.time += 20;
      app.coach.update(true);
      app.coach.update();
      const after = document.querySelector('.coach')!.classList.contains('show') ? (document.querySelector('.coach .ctext')!.textContent ?? '') : '';
      app.settings.hintsSeen = hints;
      app.coach.attach(g);
      return { first: first.slice(0, 30), after: after.slice(0, 30) };
    });
    check('a coach tip covered by a panel is not used up', /lane/.test(r2.first) && r2.after === r2.first, JSON.stringify(r2));
  }
  // Narrow desktop windows (half a laptop screen) stack the bottom bar in two rows; with the four
  // final-age cards nothing may overlap (a card under the power button would cast the power).
  for (const [w, h] of [[683, 768], [900, 600], [560, 700]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await sleep(300);
    const r = await page.evaluate(() => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      app.game.world.players[0].age = 4;
      return new Promise<{ overlaps: string[]; cards: number; bottomOk: boolean }>((done) =>
        setTimeout(() => {
          const boxes = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetParent).map((e) => ({ sel, r: e.getBoundingClientRect() }));
          const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          const groups = [boxes('.hud .card'), boxes('.hud .act'), boxes('.hud .res'), boxes('.hud .topbar .side, .hud .topbar .mid'), boxes('.hud .sysbtn')];
          const overlaps: string[] = [];
          for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) for (const a of groups[i]) for (const b of groups[j]) if (hit(a.r, b.r)) overlaps.push(`${a.sel} × ${b.sel}`);
          const inset = app.renderer.layout.insets.bottom;
          const bottomOk = groups[0].every((c) => c.r.top >= innerHeight - inset - 1 && c.r.bottom <= innerHeight);
          done({ overlaps: [...new Set(overlaps)], cards: groups[0].length, bottomOk });
        }, 400),
      );
    });
    check(`narrow desktop ${w}x${h}: HUD parts don't overlap`, r.cards === 4 && r.overlaps.length === 0 && r.bottomOk, JSON.stringify(r));
  }
  // A window squeezed to a sliver (degenerate layout) must not kill the render loop.
  for (const [w, h] of [[120, 300], [1, 1]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await sleep(300);
  }
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const t0 = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.time);
  await sleep(700);
  const t1 = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.time);
  check('the game survives a sliver-sized window', t1 - t0 > 0.4, `advanced ${(t1 - t0).toFixed(2)}s`);
}

async function run(page: Page, label: string, viewport: { width: number; height: number; mobile: boolean }): Promise<void> {
  console.log(`\n== ${label} ==`);
  await page.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.mobile, hasTouch: viewport.mobile, deviceScaleFactor: 1 });
  await page.goto(`${base}/?play=adept&seed=11`, { waitUntil: 'load' });
  await sleep(800);
  let s = await state(page);
  check('game starts in the middle lane', s.lane === 1 && s.menu === 'none');

  // Click a lane on the field to select it
  const l0 = await laneScreen(page, 0);
  if (viewport.mobile) await page.touchscreen.tap(l0.x, l0.y);
  else await page.mouse.click(l0.x, l0.y);
  await sleep(100);
  s = await state(page);
  check('clicking a lane selects it', s.lane === 0, `lane=${s.lane}`);
  await sleep(150);
  const audioOk = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.audio.ready === true);
  check('audio starts after the first interaction', audioOk);

  // Tap a card → summons into the selected lane
  const g0 = s.gold;
  const card = await center(page, '.card:nth-child(2)');
  if (viewport.mobile) await page.touchscreen.tap(card.x, card.y);
  else await page.mouse.click(card.x, card.y);
  await sleep(100);
  s = await state(page);
  check('tapping a card queues a creature', s.queue === 1 && s.gold < g0, `queue=${s.queue} gold=${s.gold.toFixed(0)}`);
  const laneOfQueued = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue[0]?.lane);
  check('queued creature goes to the selected lane', laneOfQueued === 0, `lane=${laneOfQueued}`);

  // Drag a card onto the bottom lane
  const c1 = await center(page, '.card:nth-child(1)');
  const l2 = await laneScreen(page, 2, 0.5);
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].gold = 500));
  if (viewport.mobile) {
    // Touch drag via CDP touch events
    const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c1.x, y: c1.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c1.x + ((l2.x - c1.x) * i) / 8, y: c1.y + ((l2.y - c1.y) * i) / 8 }] });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(c1.x, c1.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(c1.x + ((l2.x - c1.x) * i) / 8, c1.y + ((l2.y - c1.y) * i) / 8);
      await sleep(16);
    }
    await page.mouse.up();
  }
  await sleep(120);
  const lanes = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue.map((q: any) => q.lane));
  check('dragging a card onto a lane summons there', lanes.includes(2), `queue lanes=${JSON.stringify(lanes)}`);
  if (!viewport.mobile) {
    // Esc mid-drag drops the drag: releasing over a lane afterwards summons nothing.
    const q0 = (await state(page)).queue;
    await page.mouse.move(c1.x, c1.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(c1.x + ((l2.x - c1.x) * i) / 6, c1.y + ((l2.y - c1.y) * i) / 6);
      await sleep(16);
    }
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await sleep(120);
    const after = await state(page);
    const ghost = await page.evaluate(() => document.querySelector('.drag-ghost')!.classList.contains('hidden'));
    check('Esc cancels a card drag', after.queue === q0 && ghost && !after.paused, JSON.stringify({ q0, q: after.queue, ghost, paused: after.paused }));
  }

  // Keyboard (desktop only)
  if (!viewport.mobile) {
    await page.keyboard.press('s');
    await sleep(50);
    s = await state(page);
    check('S moves lane selection down', s.lane === 2 || s.lane === 1, `lane=${s.lane}`);
    {
      // The mouse wheel over the battlefield steps the selected lane.
      const before = s.lane;
      const box = await page.evaluate(() => {
        const r = (window as unknown as { __mythwar: any }).__mythwar.canvas.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await page.mouse.move(box.x, box.y);
      await page.mouse.wheel({ deltaY: -120 });
      await sleep(60);
      const up = (await state(page)).lane;
      await page.mouse.wheel({ deltaY: 120 });
      await sleep(60);
      s = await state(page);
      check('mouse wheel steps the selected lane', up === Math.max(0, before - 1) && s.lane === Math.min(2, up + 1), JSON.stringify({ before, up, down: s.lane }));
    }
    // (Counted as queued + summoned: a creature may step out of the queue meanwhile.)
    await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].gold = 1000));
    s = await state(page);
    const q0 = s.queue + s.summoned;
    const full = s.queue >= 5;
    await page.keyboard.press('3');
    await sleep(50);
    s = await state(page);
    check('number key summons', full || s.queue + s.summoned === q0 + 1, `queued+summoned ${q0} → ${s.queue + s.summoned}`);
    await page.keyboard.press('m');
    await sleep(50);
    const muted = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.settings.muted);
    await page.keyboard.press('m');
    await sleep(50);
    const unmuted = await page.evaluate(() => !(window as unknown as { __mythwar: any }).__mythwar.settings.muted);
    check('M toggles mute', muted && unmuted);
    // (Training keeps running: restart it so nothing steps out during the check.)
    await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].trainProgress = 0));
    const before = await state(page);
    await page.keyboard.press('Backspace');
    await sleep(50);
    s = await state(page);
    check('Backspace cancels the last summon with a refund', s.queue === before.queue - 1 && s.gold > before.gold, `queue ${before.queue} → ${s.queue}`);
    // Keyboard users can Tab to a card and press Enter to summon it.
    let tabs = 0;
    while (tabs++ < 40 && !(await page.evaluate(() => document.activeElement?.classList.contains('card')))) await page.keyboard.press('Tab');
    await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].trainProgress = 0));
    const q1 = (await state(page)).queue;
    // Held down: key repeats must not summon again.
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await sleep(80);
    const q2 = (await state(page)).queue;
    check('Tab to a card + Enter summons it once (even held)', q2 === Math.min(5, q1 + 1) && tabs < 40, `tabs=${tabs} queue ${q1} → ${q2}`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  // Queue chips mirror the queue; tapping one cancels it (refund).
  {
    const before = await page.evaluate(() => ({ q: (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue.length, chips: document.querySelectorAll('.qchip').length }));
    check('queue chips match the queue', before.q === before.chips && before.q > 0, JSON.stringify(before));
    const chip = await center(page, '.qchip:last-of-type');
    if (viewport.mobile) await page.touchscreen.tap(chip.x, chip.y);
    else await page.mouse.click(chip.x, chip.y);
    // (The chips follow on the next rendered frame: poll rather than guess a delay.)
    let after = { q: -1, chips: -2 };
    for (let i = 0; i < 20 && (after.q !== before.q - 1 || after.chips !== after.q); i++) {
      await sleep(50);
      after = await page.evaluate(() => ({ q: (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue.length, chips: document.querySelectorAll('.qchip').length }));
    }
    check('tapping a queue chip cancels that summon', after.q === before.q - 1 && after.chips === after.q, JSON.stringify(after));
  }

  // Touch: press and hold on a creature shows its label (view.inspect), release hides it.
  if (viewport.mobile) {
    const pt = await page.evaluate(() => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      const w = app.game.world;
      const u = w.spawnUnit(1, 1, (window as unknown as { __mythwarData: any }).__mythwarData.UNITS.treant, 600);
      u.def = { ...u.def, speed: 0 };
      const p = app.renderer.unitScreen(u, 1);
      const sx = p.x;
      const sy = p.y - 20;
      return app.rotated ? { x: window.innerWidth - sy, y: sx } : { x: sx, y: sy };
    });
    const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
    await sleep(550);
    const held = await page.evaluate(() => !!(window as unknown as { __mythwar: any }).__mythwar.game.view.inspect);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(80);
    const released = await page.evaluate(() => !(window as unknown as { __mythwar: any }).__mythwar.game.view.inspect);
    check('press-and-hold inspects a creature; release dismisses', held && released, JSON.stringify({ held, released }));
  }

  // Turret panel: open and build
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].gold = 1000));
  const tb = await center(page, '.turretbtn');
  if (viewport.mobile) await page.touchscreen.tap(tb.x, tb.y);
  else await page.mouse.click(tb.x, tb.y);
  await sleep(150);
  const panelVisible = await page.evaluate(() => !document.querySelector('.turretpanel')!.classList.contains('hidden'));
  check('turret panel opens', panelVisible);
  const buy = await center(page, '.trow[data-lane="1"] .tbuy');
  if (viewport.mobile) await page.touchscreen.tap(buy.x, buy.y);
  else await page.mouse.click(buy.x, buy.y);
  await sleep(100);
  s = await state(page);
  check('buying a turret mounts it', s.turrets[1] !== null, JSON.stringify(s.turrets));

  // God power: make it ready, press it, choose a lane (with foes in every lane: a power is
  // refused on an empty one).
  await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const w = app.game.world;
    w.players[0].powerCooldown = 0;
    for (let lane = 0; lane < 3; lane++) {
      const u = w.spawnUnit(1, lane, (window as unknown as { __mythwarData: any }).__mythwarData.UNITS.treant, 780);
      u.hp = u.maxHp = 1e6;
    }
  });
  await sleep(50);
  const pw = await center(page, '.act.power');
  if (viewport.mobile) await page.touchscreen.tap(pw.x, pw.y);
  else await page.mouse.click(pw.x, pw.y);
  await sleep(100);
  const targeting = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.view.targeting);
  check('power button enters lane targeting', targeting === 'power', targeting);
  const lp = await laneScreen(page, 1, 0.7);
  if (viewport.mobile) await page.touchscreen.tap(lp.x, lp.y);
  else await page.mouse.click(lp.x, lp.y);
  await sleep(100);
  const cast = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].stats.powersCast);
  check('choosing a lane casts the power', cast === 1, `cast=${cast}`);

  // Keyboard after clicking HUD buttons: Space must cast, not re-activate the focused button.
  if (!viewport.mobile) {
    const tb2 = await center(page, '.turretbtn');
    await page.mouse.click(tb2.x, tb2.y); // open the panel…
    await sleep(80);
    await page.mouse.click(tb2.x, tb2.y); // …and close it again (the button keeps focus)
    await sleep(80);
    await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].powerCooldown = 0));
    await page.keyboard.press(' ');
    await sleep(120);
    const r = await page.evaluate(() => ({
      cast: (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].stats.powersCast,
      panel: !document.querySelector('.turretpanel')!.classList.contains('hidden'),
    }));
    check('Space casts the power without toggling a focused button', r.cast === 2 && !r.panel, JSON.stringify(r));
  }

  // Ascend
  await page.evaluate(() => {
    const p = (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0];
    p.xp = 99999;
    p.gold = 99999;
  });
  await sleep(60);
  const asc = await center(page, '.act.ascend');
  if (viewport.mobile) await page.touchscreen.tap(asc.x, asc.y);
  else await page.mouse.click(asc.x, asc.y);
  await sleep(300);
  s = await state(page);
  check('ascend button advances the age', s.age === 1, `age=${s.age}`);
  const cards = await page.evaluate(() => [...document.querySelectorAll('.card')].length);
  check('new age shows its creature cards', cards === 3);

  // Blessings
  const bb = await center(page, '.blessbtn');
  if (viewport.mobile) await page.touchscreen.tap(bb.x, bb.y);
  else await page.mouse.click(bb.x, bb.y);
  await sleep(150);
  const buyB = await center(page, '.brow.b-might .buy');
  if (viewport.mobile) await page.touchscreen.tap(buyB.x, buyB.y);
  else await page.mouse.click(buyB.x, buyB.y);
  await sleep(100);
  const might = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].blessings.might);
  check('buying a blessing ranks it up', might === 1, `might=${might}`);

  // Pause and resume
  const pb = await center(page, '.sys .sysbtn:last-child');
  if (viewport.mobile) await page.touchscreen.tap(pb.x, pb.y);
  else await page.mouse.click(pb.x, pb.y);
  await sleep(450);
  s = await state(page);
  check('pause button pauses with menu', s.paused && s.menu === 'pause', `paused=${s.paused} menu=${s.menu}`);
  {
    // A paused battle is a still frame: no new particles from projectiles in flight, no shake.
    const p0 = await page.evaluate(() => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      app.renderer.shake = 12;
      return app.renderer.fx.particles.length;
    });
    await sleep(500);
    const p1 = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.renderer.fx.particles.length);
    check('pausing freezes effects (no new particles)', p1 === p0, `${p0} → ${p1}`);
  }
  if (!viewport.mobile) {
    // Escape inside a sub-menu of the pause menu goes back instead of resuming.
    const hb = await center(page, '.screen.pause .mbtn:nth-child(2)');
    await page.mouse.click(hb.x, hb.y);
    await sleep(400);
    await page.keyboard.press('Escape');
    await sleep(400);
    s = await state(page);
    check('Escape in How to Play returns to the pause menu', s.paused && s.menu === 'pause', `paused=${s.paused} menu=${s.menu}`);
  }
  const rb = await center(page, '.screen.pause .mbtn.primary');
  if (viewport.mobile) await page.touchscreen.tap(rb.x, rb.y);
  else await page.mouse.click(rb.x, rb.y);
  await sleep(450);
  s = await state(page);
  check('resume continues the battle', !s.paused && s.menu === 'none');
  if (!viewport.mobile) {
    // The clicked Pause button keeps focus; Enter must press Resume, not the button behind the menu.
    const pb = await center(page, '.sys .sysbtn:last-child');
    await page.mouse.click(pb.x, pb.y);
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(400);
    s = await state(page);
    check('Enter on the pause menu resumes (HUD inert behind menus)', !s.paused && s.menu === 'none', `paused=${s.paused} menu=${s.menu}`);
  }

  // Resize mid-battle (window resize / phone rotation): layout follows, input still maps.
  {
    const before = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.renderer.layout.width);
    await page.setViewport({ width: viewport.height, height: viewport.width, isMobile: viewport.mobile, hasTouch: viewport.mobile, deviceScaleFactor: 1 });
    await sleep(400);
    await page.setViewport({ width: viewport.width, height: viewport.height, isMobile: viewport.mobile, hasTouch: viewport.mobile, deviceScaleFactor: 1 });
    await sleep(400);
    const l1 = await laneScreen(page, 1);
    if (viewport.mobile) await page.touchscreen.tap(l1.x, l1.y);
    else await page.mouse.click(l1.x, l1.y);
    await sleep(100);
    const after = await page.evaluate(() => ({ w: (window as unknown as { __mythwar: any }).__mythwar.renderer.layout.width, lane: (window as unknown as { __mythwar: any }).__mythwar.game.view.selectedLane }));
    check('resizing mid-battle keeps layout and input working', after.w === before && after.lane === 1, JSON.stringify({ before, after }));
  }

  // Win the game → results screen
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[1].baseHp = 1));
  await page.evaluate(() => {
    const w = (window as unknown as { __mythwar: any }).__mythwar.game.world;
    w.damageBase(1, 10, 0, 0);
  });
  await sleep(3600);
  s = await state(page);
  check('destroying the citadel ends the game with results', s.over && s.menu === 'over', `over=${s.over} menu=${s.menu}`);
  const verdict = await page.evaluate(() => document.querySelector('.verdict .vt')?.textContent);
  check('results show Victory', verdict === 'Victory', String(verdict));
  const tip = await page.evaluate(() => document.querySelector('.screen.over .vtip')?.textContent ?? '');
  check('results suggest the next difficulty after a win', /Try Master/.test(tip), tip);
  // "Change foe", then Back: returns to the results (not a broken title over the battlefield).
  {
    const tapAt = async (p: { x: number; y: number }) => {
      if (viewport.mobile) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
      await sleep(250);
    };
    const menuState = () => page.evaluate(() => ({ menu: (window as unknown as { __mythwar: any }).__mythwar.menus.current, state: (window as unknown as { __mythwar: any }).__mythwar.state }));
    await tapAt(await centerText(page, '.screen.over', 'Change foe'));
    const opened = await menuState();
    await tapAt(await centerText(page, '.screen.difficulty', 'Back'));
    const back = await menuState();
    check('results → Change foe → Back returns to the results', opened.menu === 'difficulty' && back.menu === 'over' && back.state === 'over', JSON.stringify({ opened, back }));
  }
  // Rematch: a fresh battle with the HUD back (phones hide it under menus).
  const rm = await center(page, '.screen.over .mbtn.primary');
  if (viewport.mobile) await page.touchscreen.tap(rm.x, rm.y);
  else await page.mouse.click(rm.x, rm.y);
  await sleep(500);
  const re = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    return { state: app.state, menu: app.menus.current, over: app.game.over, time: app.game.world.time, hud: getComputedStyle(app.hud.root).visibility, inert: app.hud.root.inert };
  });
  check('rematch starts a fresh battle with the HUD visible', re.state === 'playing' && re.menu === 'none' && !re.over && re.time < 5 && re.hud === 'visible' && !re.inert, JSON.stringify(re));
}

let base = '';

async function main(): Promise<void> {
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
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors: string[] = [];
  try {
    for (const vp of [
      { label: 'desktop', width: 1600, height: 900, mobile: false },
      { label: 'phone landscape', width: 844, height: 390, mobile: true },
      { label: 'phone portrait (rotated)', width: 390, height: 844, mobile: true },
    ]) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errors.push(pageError(vp.label, e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`${vp.label}: ${m.text()}`);
      });
      await run(page, vp.label, vp);
      await page.close();
    }
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(pageError('resume', e)));
    await resumeFlow(page);
    await page.close();
    const page2 = await browser.newPage();
    page2.on('pageerror', (e) => errors.push(pageError('rotated menus', e)));
    await rotatedMenusFlow(page2);
    await page2.close();
    const page6 = await browser.newPage();
    page6.on('pageerror', (e) => errors.push(pageError('phone menus', e)));
    await phoneMenusFit(page6);
    await page6.close();
    const page5 = await browser.newPage();
    page5.on('pageerror', (e) => errors.push(pageError('service worker', e)));
    await serviceWorkerFlow(page5);
    await page5.close();
    const page4 = await browser.newPage();
    page4.on('pageerror', (e) => errors.push(pageError('tutorial', e)));
    await tutorialHandoffFlow(page4);
    await page4.close();
    const page3 = await browser.newPage();
    page3.on('pageerror', (e) => errors.push(pageError('large desktop', e)));
    page3.on('console', (m) => {
      if (m.type() === 'error') errors.push(`large desktop: ${m.text()}`);
    });
    await largeDesktopFlow(page3);
    await page3.close();
  } finally {
    await browser.close();
    server.close();
  }
  check('no console errors', errors.length === 0, errors.join(' | '));
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
