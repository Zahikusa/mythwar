/**
 * End-to-end smoke test: drives the built game in Chrome like a player would.
 *   npm run build && node scripts/smoke.ts
 * Exits non-zero on any failed check or console error.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import type { Page } from 'puppeteer-core';
import { findChrome } from './chrome.ts';

const CHROME = findChrome();
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
  // The whole ladder of generals is on the title from the start, unbeaten ones dimmed.
  const ladder = await page.evaluate(() => [...document.querySelectorAll('.laurels .laurel:not(.featchip)')].map((l) => `${l.textContent}${l.classList.contains('dim') ? ':dim' : ''}`));
  check('the title shows all four generals, none beaten yet', ladder.length === 4 && ladder.every((l) => l.endsWith('☆☆☆:dim')), JSON.stringify(ladder));
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

/** Sandbox: X switches the cards to the foe's (a mode that shows), and summons go to the foe. */
async function sandboxFlow(page: Page): Promise<void> {
  console.log('== sandbox ==');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${base}/?sandbox&seed=3`, { waitUntil: 'load' });
  await sleep(1200);
  await page.keyboard.press('x');
  await sleep(200);
  const foe = await page.evaluate(() => !!document.querySelector('.hud.foeside'));
  check('sandbox: X turns the cards into the foe’s (marked)', foe, String(foe));
  const card = await center(page, '.card.cls-hunter');
  await page.mouse.click(card.x, card.y);
  await sleep(200);
  const q = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.players.map((p: any) => p.queue.length));
  check('sandbox: in foe mode a card summons for the foe', q[0] === 0 && q[1] === 1, JSON.stringify(q));
  // (Backlog 61) The queue shown is the foe's — and its chip cancels the foe's order.
  await sleep(200);
  const chips = await page.evaluate(() => document.querySelectorAll('.hud .qchip').length);
  const chip = await center(page, '.hud .qchip');
  await page.mouse.click(chip.x, chip.y);
  await sleep(200);
  const q2 = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.game.world.players.map((p: any) => p.queue.length));
  check('sandbox: in foe mode the queue shows the foe’s orders, and a chip cancels one', chips === 1 && q2[0] === 0 && q2[1] === 0, JSON.stringify({ chips, q2 }));
  await page.keyboard.press('x');
  await sleep(200);
  const back = await page.evaluate(() => !document.querySelector('.hud.foeside'));
  check('sandbox: X again switches back to your side', back, String(back));
}

/**
 * (Backlog 39) Healthy play and playtests in the real flow: after an hour in battle the results
 * suggest a break, once; each battle lands in the playtest journal, and Settings → Copy
 * playtest journal copies it.
 */
async function journalFlow(page: Page): Promise<void> {
  console.log('== break note and playtest journal ==');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${base}/?play=novice&seed=6`, { waitUntil: 'load' });
  await sleep(900);
  const before = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.settings.journal.length as number);
  // (Backlog 53) A menu over a battle that runs on (online, no pauses left): battle keys wait.
  {
    await page.evaluate(() => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      app.game.world.players[0].gold = 500;
      app.menus.show('settings');
    });
    for (const k of ['1', ' ', 'ArrowDown'] as const) await page.keyboard.press(k);
    const r = await page.evaluate(() => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      const out = { queue: app.game.world.players[0].queue.length, lane: app.game.view.selectedLane, paused: app.game.paused, menu: app.menus.current };
      app.menus.show('none');
      return out;
    });
    check('battle keys do nothing while a menu covers a running battle', r.queue === 0 && r.lane === 1 && !r.paused && r.menu === 'settings', JSON.stringify(r));
  }
  const win = async () => {
    await page.evaluate(() => {
      const app = (window as unknown as { __mythwar: any }).__mythwar;
      app.game.world.players[1].baseHp = 1;
      app.game.world.damageBase(1, 10, 0, 0);
    });
    await sleep(3600);
    return page.evaluate(() => {
      const el = document.querySelector('.screen.over');
      return {
        menu: (window as unknown as { __mythwar: any }).__mythwar.menus.current as string,
        note: el?.querySelector('.vbreak')?.textContent ?? '',
        next: !!el?.querySelector('.vtip button'),
      };
    });
  };
  // An hour of battle in this sitting so far (frames keep the sitting alive).
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.sitting.played = 3605));
  const first = await win();
  check('after an hour of battle the results suggest a break (instead of the next foe)', first.menu === 'over' && /over an hour/.test(first.note) && !first.next, JSON.stringify(first));
  const stored = await page.evaluate(() => {
    const j = JSON.parse(localStorage.getItem('mythwar.settings.v1') ?? '{}').journal ?? [];
    return { n: j.length as number, last: j.at(-1) };
  });
  check('the battle is noted in the saved playtest journal', stored.n === Math.min(before + 1, 30) && stored.last?.mode === 'ai' && stored.last?.foe === 'novice' && stored.last?.won === true && stored.last?.secs >= 0, JSON.stringify(stored));
  const rm = await center(page, '.screen.over .mbtn.primary');
  await page.mouse.click(rm.x, rm.y);
  await sleep(600);
  const second = await win();
  check('the break note is said once per hour (not after the next battle)', second.menu === 'over' && second.note === '' && second.next, JSON.stringify(second));
  // Main menu → Settings → Copy playtest journal (the clipboard stubbed to see what's copied).
  await page.evaluate(() => {
    const copied = ((window as unknown as { __copied: string[] }).__copied = [] as string[]);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } });
  });
  for (const [scope, text] of [['.screen.over', 'Main menu'], ['.screen.title', 'Settings'], ['.screen.settings', 'Copy playtest journal']]) {
    await page.evaluate((scope, text) => [...document.querySelectorAll(`${scope} button`)].find((el) => el.textContent?.trim() === text)?.scrollIntoView({ block: 'center' }), scope, text);
    const p = await centerText(page, scope, text);
    await page.mouse.click(p.x, p.y);
    await sleep(300);
  }
  const copy = await page.evaluate(() => ({
    text: (window as unknown as { __copied: string[] }).__copied[0] ?? '',
    status: document.querySelector('.screen.settings .sprog > .sprogstatus:last-child')?.textContent ?? '',
    n: (window as unknown as { __mythwar: any }).__mythwar.settings.journal.length as number,
  }));
  const lines = copy.text.split('\n');
  check(
    'Settings → Copy playtest journal copies every noted battle',
    /^Mythwar playtest journal/.test(lines[0]) && lines.length === copy.n + 1 && /\| ai vs novice \| WON in \d+:\d\d \| \d★/.test(lines.at(-1) ?? '') && copy.status.startsWith(`${copy.n} battle(s) copied`),
    JSON.stringify({ head: lines[0], last: lines.at(-1), n: copy.n, status: copy.status }),
  );
}

/** A stubbed standard gamepad: menus by D-pad and A, then a battle by buttons. */
async function gamepadFlow(page: Page): Promise<void> {
  console.log('== gamepad ==');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('mythwar.settings.v1', JSON.stringify({ tutorialSeen: true, hints: false }));
    // (No autosave left by earlier flows: A would rightly press "Continue battle".)
    localStorage.removeItem('mythwar.battle.v1');
    const pad = { id: 'Test Pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await sleep(1000);
  // Press and release a button across a few frames.
  const tap = async (i: number) => {
    await page.evaluate((b) => ((window as unknown as { __pad: any }).__pad.buttons[b].pressed = true), i);
    await sleep(120);
    await page.evaluate((b) => ((window as unknown as { __pad: any }).__pad.buttons[b].pressed = false), i);
    await sleep(120);
  };
  const menu = () => page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.menus.current);
  // Title: A presses the main button (Play → the foe screen).
  await tap(0);
  await sleep(300);
  check('gamepad: A on the title presses Play', (await menu()) === 'difficulty', await menu());
  // D-pad picks a button; B goes back.
  await tap(15);
  const focused = await page.evaluate(() => document.querySelector('.padfocus')?.textContent ?? '');
  check('gamepad: the D-pad highlights a button', focused.length > 0, focused);
  await tap(1);
  await sleep(300);
  check('gamepad: B goes back', (await menu()) === 'title', await menu());
  await page.goto(`${base}/?play=adept&seed=4`, { waitUntil: 'load' });
  await sleep(1500);
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].gold = 500));
  await tap(2); // X: the first card
  await tap(12); // up: the top lane
  await tap(0); // A: the second card
  const st = await page.evaluate(() => {
    const g = (window as unknown as { __mythwar: any }).__mythwar.game;
    return { queue: g.world.players[0].queue.map((q: any) => `${q.unitId}@${q.lane}`), lane: g.view.selectedLane };
  });
  check('gamepad: X and A summon the first two cards, the D-pad changes lane', st.queue.join() === 'treant@1,redcap@0' && st.lane === 0, JSON.stringify(st));
  await tap(9); // Start: pause
  await sleep(200);
  check('gamepad: Start pauses', (await menu()) === 'pause', await menu());
  await tap(9);
  await sleep(200);
  check('gamepad: Start again resumes', (await menu()) === 'none', await menu());
  // (Backlog 28) On the results every control can be reached with the D-pad: a breadth-first walk
  // over the app's own D-pad moves, from the main button. (A few seconds first, so the summons
  // step out: a champion, and with it the report's tabs.)
  await sleep(6000);
  await page.evaluate(() => {
    const w = (window as unknown as { __mythwar: any }).__mythwar.game.world;
    w.players[1].baseHp = 1;
    w.damageBase(1, 10, 0, 0);
  });
  await sleep(3600);
  const reach = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
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
  check('gamepad: every control on the results is reachable with the D-pad', reach.unreachable.length === 0 && reach.all.includes('Legend') && reach.all.includes('Rematch'), JSON.stringify(reach));
}

/** A card tapped before it can be paid for is armed, and summons itself once the gold is there. */
async function armedFlow(page: Page): Promise<void> {
  console.log('== armed summons ==');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('mythwar.settings.v1', JSON.stringify({ tutorialSeen: true, hints: false })));
  await page.goto(`${base}/?play=adept&seed=4`, { waitUntil: 'load' });
  await sleep(1200);
  // (Income is a few gold a second: 5 gold stays short of a 30-gold Guardian for a while.)
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].gold = 5));
  const card = await center(page, '.card.cls-guardian');
  await page.mouse.click(card.x, card.y);
  await sleep(200);
  const armed = await page.evaluate(() => ({ armed: !!document.querySelector('.card.cls-guardian.armed'), queue: (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue.length }));
  check('tapping a card you cannot afford arms it (nothing summoned yet)', armed.armed && armed.queue === 0, JSON.stringify(armed));
  await page.evaluate(() => {
    const g = (window as unknown as { __mythwar: any }).__mythwar.game;
    g.world.players[0].gold = 200;
  });
  await sleep(300);
  const after = await page.evaluate(() => ({ armed: !!document.querySelector('.card.armed'), queue: (window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].queue.map((q: any) => q.unitId) }));
  check('the armed card summons itself once the gold is there', !after.armed && after.queue.length === 1, JSON.stringify(after));
  // Tapping an armed card again disarms it.
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].gold = 5));
  await page.mouse.click(card.x, card.y);
  await sleep(100);
  await page.mouse.click(card.x, card.y);
  await sleep(150);
  const off = await page.evaluate(() => !!document.querySelector('.card.armed'));
  check('tapping the armed card again disarms it', !off, String(off));
  // A citadel below 30% has a heartbeat that quickens as it falls.
  const beats = await page.evaluate(async () => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const P = app.game.world.players[0];
    let n = 0;
    app.audio.heartbeat = () => n++;
    const count = async (frac: number) => {
      n = 0;
      P.baseHp = P.baseMaxHp * frac;
      await new Promise((r) => setTimeout(r, 3000));
      return n;
    };
    return { healthy: await count(0.8), low: await count(0.25), dire: await count(0.03) };
  });
  check('a citadel in danger has a heartbeat, faster as it falls', beats.healthy === 0 && beats.low >= 1 && beats.dire > beats.low, JSON.stringify(beats));
  // Ragnarök is foretold three minutes ahead, with a warning at one minute.
  const rag = await page.evaluate(async () => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    const P = app.game.world.players[0];
    P.baseHp = P.baseMaxHp;
    const w = app.game.world;
    const text = () => document.querySelector('.ragnarok')?.textContent ?? '';
    w.time = w.ragnarokAt - 170;
    await new Promise((r) => setTimeout(r, 200));
    const early = text();
    w.time = w.ragnarokAt - 50;
    await new Promise((r) => setTimeout(r, 200));
    const late = text();
    // (Toasts queue: the jump in time also trips the par-time star toast first.)
    let toast = '';
    for (let i = 0; i < 25 && !toast.includes('one minute'); i++) {
      toast = document.querySelector('.toast')?.textContent ?? '';
      await new Promise((r) => setTimeout(r, 200));
    }
    return { early, late, toast };
  });
  check('Ragnarök is counted down from three minutes, with a one-minute warning', rag.early.startsWith('Ragnarök in 2:') && rag.late.startsWith('Ragnarök in 0:') && rag.toast.includes('one minute'), JSON.stringify(rag));
}

/** Riddles of war: foe screen → Riddles → the first riddle, solved by tapping cards → its result. */
async function riddleFlow(page: Page): Promise<void> {
  console.log('== riddles ==');
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => localStorage.setItem('mythwar.settings.v1', JSON.stringify({ tutorialSeen: true, hintsSeen: [] })));
  await page.goto(`${base}/?screen=difficulty`, { waitUntil: 'load' });
  await sleep(900);
  const chips = () => page.evaluate(() => [...document.querySelectorAll('.screen.difficulty .trial')].filter((c) => (c as HTMLElement).offsetParent !== null).map((c) => c.textContent));
  const freshChips = await chips();
  check('a newcomer’s foe screen offers Quick battle but no trials yet', freshChips.length === 1 && freshChips[0] === 'Quick battle', JSON.stringify(freshChips));
  await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    app.settings.records.novice = { wins: 1, losses: 0, best: 600, stars: 1 };
    app.menus.show('title');
    app.menus.show('difficulty');
  });
  const wonChips = await chips();
  check('after a first victory the trials appear', wonChips.length === 4, JSON.stringify(wonChips));
  const btn = await centerText(page, '.screen.difficulty', 'Riddles');
  await page.mouse.click(btn.x, btn.y);
  await sleep(400);
  const list = await page.evaluate(() => [...document.querySelectorAll('.riddle')].map((r) => `${(r as HTMLButtonElement).disabled ? 'sealed' : 'open'}`));
  check('the riddles screen lists the riddles, later ages sealed', list.length >= 4 && list[0] === 'open' && list.at(-1) === 'sealed', JSON.stringify(list));
  const first = await center(page, '.riddle');
  await page.mouse.click(first.x, first.y);
  await sleep(600);
  const st = await page.evaluate(() => {
    const g = (window as unknown as { __mythwar: any }).__mythwar.game;
    return { riddle: g.riddle?.id, gold: g.world.players[0].gold, foes: g.world.lanes[1].filter((u: any) => u.alive && u.team === 1).length, counter: !!document.querySelector('.card.advised') };
  });
  check('a riddle starts with its purse and the foe on the field, no "Counter!" badge', st.riddle === 'pack' && st.gold === 120 && st.foes === 6 && !st.counter, JSON.stringify(st));
  // The answer: four Treant Wardens down the middle (the selected lane), by tapping the card.
  const card = await center(page, '.card.cls-guardian');
  for (let i = 0; i < 4; i++) {
    await page.mouse.click(card.x, card.y);
    await sleep(120);
  }
  await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.speed = 2));
  let menu = '';
  for (let i = 0; i < 60 && menu !== 'over'; i++) {
    await sleep(500);
    menu = await page.evaluate(() => (window as unknown as { __mythwar: any }).__mythwar.menus.current);
  }
  const res = await page.evaluate(() => ({ verdict: document.querySelector('.screen.over .vt')?.textContent, solved: JSON.parse(localStorage.getItem('mythwar.settings.v1')!).riddles }));
  check('four Guardians solve the Redcap Pack; the result says so and it is remembered', menu === 'over' && res.verdict === 'Solved' && res.solved.includes('pack'), JSON.stringify({ menu, ...res }));
  // (Backlog 52) Out of a riddle by Riddles → Back → Back: the real title (the riddle put away),
  // from which Multiplayer works.
  for (const [scope, text] of [['.screen.over', 'Riddles'], ['.screen.riddles', 'Back'], ['.screen.difficulty', 'Back']]) {
    const p = await centerText(page, scope, text);
    await page.mouse.click(p.x, p.y);
    await sleep(300);
  }
  const home = await page.evaluate(() => {
    const app = (window as unknown as { __mythwar: any }).__mythwar;
    return { state: app.state, menu: app.menus.current, demo: !!app.game?.options.demo, hud: !!app.hud.game };
  });
  check('riddle result → Riddles → Back → Back reaches the real title', home.state === 'title' && home.menu === 'title' && home.demo && !home.hud, JSON.stringify(home));
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
    await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].trainProgress = [0, 0, 0]));
    const before = await state(page);
    await page.keyboard.press('Backspace');
    await sleep(50);
    s = await state(page);
    check('Backspace cancels the last summon with a refund', s.queue === before.queue - 1 && s.gold > before.gold, `queue ${before.queue} → ${s.queue}`);
    // Keyboard users can Tab to a card and press Enter to summon it.
    let tabs = 0;
    while (tabs++ < 40 && !(await page.evaluate(() => document.activeElement?.classList.contains('card')))) await page.keyboard.press('Tab');
    await page.evaluate(() => ((window as unknown as { __mythwar: any }).__mythwar.game.world.players[0].trainProgress = [0, 0, 0]));
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
  check('results suggest the next difficulty after a win', /Face the Master/.test(tip), tip);
  // (Improvement backlog) The results in their fullest form — new feats, a new best, a closing
  // chapter, a break note, a full chronicle — still fit a desktop and a laptop window.
  if (!viewport.mobile) {
    const fits: string[] = [];
    for (const [w, h] of [[1600, 900], [1366, 768]]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await sleep(250);
      const fit = await page.evaluate(() => {
        const app = (window as unknown as { __mythwar: any }).__mythwar;
        const m = app.menus;
        const g = app.game;
        m.featsEarned = ['First Victory', 'Warlord Humbled', 'Swift Conquest', 'Unbreached'].map((name, i) => ({ id: `f${i}`, name, desc: '' }));
        m.newBestStars = 3;
        m.epilogue = { chapter: 'II · The Threshold', close: 'The queen lowers her spear. Her sisters will speak your name.' };
        m.breakNote = 'You have been at war for over an hour. The gods will wait — a good moment for a break.';
        m.chronicle = Array.from({ length: 10 }, (_, i) => `${i + 1}:00 — Something worth remembering happened in this battle, in the middle lane.`);
        m.showResults(g.world, g.playerTeam, app.difficulty, g.history, g.ageUps);
        const el = document.querySelector('.screen.over') as HTMLElement;
        // (Room to spare: the screen's height minus its content's, from the children's boxes.)
        const boxes = [...el.children].map((k) => k.getBoundingClientRect()).filter((r) => r.height > 0);
        const used = Math.max(...boxes.map((r) => r.bottom)) - Math.min(...boxes.map((r) => r.top));
        // (The report's tabs are real tabs: one selected, each tied to its panel.)
        const tabs = [...el.querySelectorAll('[role="tablist"] [role="tab"]')];
        const tabsOk = tabs.length >= 2 && tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length === 1 && tabs.every((t) => !!document.getElementById(t.getAttribute('aria-controls') ?? '')?.getAttribute('role'));
        const out = { scroll: el.scrollHeight, client: el.clientHeight, spare: Math.round(el.clientHeight - used), tabs: tabs.length, tabsOk };
        m.featsEarned = [];
        m.newBestStars = 0;
        m.epilogue = null;
        m.breakNote = null;
        m.chronicle = [];
        m.showResults(g.world, g.playerTeam, app.difficulty, g.history, g.ageUps);
        return out;
      });
      fits.push(`${w}×${h}: ${fit.scroll}/${fit.client}, ${fit.spare} px to spare`);
      check(`results in their fullest form fit ${w}×${h}`, fit.scroll <= fit.client + 1, fits.at(-1));
      if (w === 1600) check('the battle report has accessible tabs', fit.tabsOk, `${fit.tabs} tabs`);
    }
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await sleep(250);
  }
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
    const page10 = await browser.newPage();
    page10.on('pageerror', (e) => errors.push(pageError('sandbox', e)));
    await sandboxFlow(page10);
    await page10.close();
    const page9 = await browser.newPage();
    page9.on('pageerror', (e) => errors.push(pageError('gamepad', e)));
    await gamepadFlow(page9);
    await page9.close();
    const page8 = await browser.newPage();
    page8.on('pageerror', (e) => errors.push(pageError('armed', e)));
    await armedFlow(page8);
    await page8.close();
    const page7 = await browser.newPage();
    page7.on('pageerror', (e) => errors.push(pageError('riddles', e)));
    await riddleFlow(page7);
    await page7.close();
    const page11 = await browser.newPage();
    page11.on('pageerror', (e) => errors.push(pageError('journal', e)));
    await journalFlow(page11);
    await page11.close();
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
