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
  await page.goto(`${base}/?play=adept&seed=13`, { waitUntil: 'load' });
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
  // Leaving the battle abandons the save.
  await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.toTitle());
  await sleep(300);
  const gone = await page.evaluate(() => document.querySelector('.mbtn.continue')!.classList.contains('hidden'));
  check('leaving a battle discards its autosave', gone);
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
    const q0 = s.queue;
    await page.keyboard.press('3');
    await sleep(50);
    s = await state(page);
    check('number key summons', s.queue === Math.min(5, q0 + 1), `queue=${s.queue}`);
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
    await page.keyboard.press('Enter');
    await sleep(80);
    const q2 = (await state(page)).queue;
    check('Tab to a card + Enter summons it', q2 === Math.min(5, q1 + 1) && tabs < 40, `tabs=${tabs} queue ${q1} → ${q2}`);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  }

  // Queue chips mirror the queue; tapping one cancels it (refund).
  {
    const before = await page.evaluate(() => ({ q: (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue.length, chips: document.querySelectorAll('.qchip').length }));
    check('queue chips match the queue', before.q === before.chips && before.q > 0, JSON.stringify(before));
    const chip = await center(page, '.qchip:last-of-type');
    if (viewport.mobile) await page.touchscreen.tap(chip.x, chip.y);
    else await page.mouse.click(chip.x, chip.y);
    await sleep(120);
    const after = await page.evaluate(() => ({ q: (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue.length, chips: document.querySelectorAll('.qchip').length }));
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

  // God power: make it ready, press it, choose a lane
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].powerCooldown = 0));
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
      page.on('pageerror', (e) => errors.push(`${vp.label}: ${String(e)}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`${vp.label}: ${m.text()}`);
      });
      await run(page, vp.label, vp);
      await page.close();
    }
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`resume: ${String(e)}`));
    await resumeFlow(page);
    await page.close();
    const page2 = await browser.newPage();
    page2.on('pageerror', (e) => errors.push(`rotated menus: ${String(e)}`));
    await rotatedMenusFlow(page2);
    await page2.close();
    const page4 = await browser.newPage();
    page4.on('pageerror', (e) => errors.push(`tutorial: ${String(e)}`));
    await tutorialHandoffFlow(page4);
    await page4.close();
    const page3 = await browser.newPage();
    page3.on('pageerror', (e) => errors.push(`large desktop: ${String(e)}`));
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
