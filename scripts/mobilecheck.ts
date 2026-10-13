/**
 * Phones, screen by screen: WebKit iPhones and Chromium Androids, upright and sideways, in a
 * browser tab (the viewport left by the browser's bars) and installed (the whole screen, with the
 * notch and home bar as safe-area insets). Every screen must keep the page itself still (no
 * scrolling document, no zoom), keep every control on screen and clear of the notch, give every
 * control a 44-px target, and let panels that overflow scroll inside themselves.
 *
 *   npm run build && node scripts/mobilecheck.ts [--device iphone-se] [--screen title]
 *     [--mode tab|app] [--orient p|l] [--no-shots]
 *   (filters match as substrings; several of one kind are comma-separated)
 *
 * Screenshots: screenshots/mobile/<device>-<tab|app>-<p|l>-<screen>.png — look at them: a check
 * that passes on a screen that looks wrong is a bug in the check.
 *
 * Needs Playwright's WebKit inside the project (PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install
 * webkit) and a local Chrome/Edge for the Androids (scripts/chrome.ts).
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { attachMultiplayer } from '../server/net.ts';
import { serveStatic } from '../server/static.ts';
import { findChrome } from './chrome.ts';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';

type Insets = { t: number; r: number; b: number; l: number };
interface View {
  w: number;
  h: number;
  safe: Insets;
}
interface Device {
  name: string;
  engine: 'webkit' | 'chromium';
  ua: string;
  dpr: number;
  /** In a browser tab: what the browser's bars leave (portrait, landscape). */
  tab: [View, View];
  /** Installed (home screen): the whole screen, the notch and home bar as insets. */
  app: [View, View];
}

const NO: Insets = { t: 0, r: 0, b: 0, l: 0 };
const ios = (v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v.split('_')[0]}.0 Mobile/15E148 Safari/604.1`;
const android = (model: string) => `Mozilla/5.0 (Linux; Android 14; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36`;

// Viewports: Safari's bars (iOS 18 layout: status bar + bottom toolbar upright, the address bar
// on top sideways — the content then reaches the screen's bottom and sides, so the home bar and
// notch are insets); Chrome's status, address and navigation bars on Android.
const DEVICES: Device[] = [
  {
    name: 'iphone-se',
    engine: 'webkit',
    ua: ios('18_5'),
    dpr: 2,
    tab: [{ w: 375, h: 553, safe: NO }, { w: 667, h: 325, safe: NO }],
    app: [{ w: 375, h: 667, safe: { ...NO, t: 20 } }, { w: 667, h: 375, safe: NO }],
  },
  {
    name: 'iphone-15',
    engine: 'webkit',
    ua: ios('18_5'),
    dpr: 3,
    tab: [{ w: 393, h: 659, safe: NO }, { w: 852, h: 343, safe: { t: 0, r: 59, b: 21, l: 59 } }],
    app: [{ w: 393, h: 852, safe: { t: 59, r: 0, b: 34, l: 0 } }, { w: 852, h: 393, safe: { t: 0, r: 59, b: 21, l: 59 } }],
  },
  {
    name: 'iphone-16-pro-max',
    engine: 'webkit',
    ua: ios('26_0'),
    dpr: 3,
    tab: [{ w: 440, h: 763, safe: NO }, { w: 956, h: 390, safe: { t: 0, r: 62, b: 21, l: 62 } }],
    app: [{ w: 440, h: 956, safe: { t: 62, r: 0, b: 34, l: 0 } }, { w: 956, h: 440, safe: { t: 0, r: 62, b: 21, l: 62 } }],
  },
  {
    name: 'pixel-7',
    engine: 'chromium',
    ua: android('Pixel 7'),
    dpr: 2.625,
    tab: [{ w: 412, h: 839, safe: NO }, { w: 863, h: 360, safe: NO }],
    app: [{ w: 412, h: 915, safe: { ...NO, t: 31 } }, { w: 915, h: 412, safe: { ...NO, l: 31 } }],
  },
  {
    name: 'galaxy-s23',
    engine: 'chromium',
    ua: android('SM-S911B'),
    dpr: 3,
    tab: [{ w: 360, h: 668, safe: NO }, { w: 780, h: 292, safe: NO }],
    app: [{ w: 360, h: 780, safe: { ...NO, t: 28 } }, { w: 780, h: 360, safe: { ...NO, l: 28 } }],
  },
];

interface Step {
  name: string;
  query: string;
  /** JS predicate (an expression over `a`, the app) the screen is ready on. */
  ready: string;
  /** JS run once ready (`a` is the app); then `ready2`, if any, is waited for. */
  script?: string;
  ready2?: string;
  after?: number;
}

const battle = 'play=novice&seed=4';
const inBattle = `a.state === 'playing' && a.game && a.game.world.tick > 20`;
const STEPS: Step[] = [
  { name: 'title', query: '', ready: `a.menus.current === 'title'`, after: 900 },
  { name: 'journey', query: 'screen=difficulty', ready: `a.menus.current === 'difficulty'`, after: 700 },
  { name: 'riddles', query: 'screen=difficulty', ready: `a.menus.current === 'difficulty'`, script: `a.menus.show('riddles')`, ready2: `a.menus.current === 'riddles'`, after: 700 },
  { name: 'howto', query: 'screen=howto', ready: `a.menus.current === 'howto'`, after: 700 },
  { name: 'settings', query: 'screen=settings', ready: `a.menus.current === 'settings'`, after: 700 },
  { name: 'bestiary', query: 'screen=bestiary', ready: `a.menus.current === 'bestiary'`, after: 700 },
  { name: 'feats', query: 'screen=feats', ready: `a.menus.current === 'feats'`, after: 700 },
  { name: 'battle', query: battle, ready: inBattle, after: 1500 },
  { name: 'turrets', query: battle, ready: inBattle, script: `a.game.world.players[0].gold = 900; a.hud.togglePanel('turret')`, after: 700 },
  { name: 'blessings', query: battle, ready: inBattle, script: `a.game.world.players[0].gold = 900; a.hud.togglePanel('bless')`, after: 700 },
  { name: 'pause', query: battle, ready: inBattle, script: `a.pause()`, ready2: `a.menus.current === 'pause'`, after: 700 },
  { name: 'results', query: battle, ready: inBattle, script: `const w = a.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0)`, ready2: `a.menus.current === 'over'`, after: 1200 },
  { name: 'lobby', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, after: 900 },
  { name: 'room', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, script: `a.mp.host()`, ready2: `a.menus.current === 'room'`, after: 1000 },
];

interface Problem {
  kind: 'scroll' | 'zoom' | 'outside' | 'clipped' | 'small' | 'panel' | 'error';
  what: string;
}

/** Runs in the page: what the player could touch, and whether anything moves the page. */
function inspect(safe: Insets): Problem[] {
  const out: Problem[] = [];
  const de = document.documentElement;
  const vw = innerWidth;
  const vh = innerHeight;
  // The document itself: no overflow to scroll to, even programmatically.
  scrollTo(37, 91);
  const moved = scrollX !== 0 || scrollY !== 0;
  scrollTo(0, 0);
  if (de.scrollHeight > de.clientHeight || de.scrollWidth > de.clientWidth || moved)
    out.push({ kind: 'scroll', what: `document ${de.scrollWidth}×${de.scrollHeight} in ${de.clientWidth}×${de.clientHeight}${moved ? ', scrollTo moved it' : ''}` });
  const scale = visualViewport?.scale ?? 1;
  if (Math.abs(scale - 1) > 0.01) out.push({ kind: 'zoom', what: `visual viewport scale ${scale}` });
  if (visualViewport && (visualViewport.offsetTop !== 0 || visualViewport.offsetLeft !== 0)) out.push({ kind: 'scroll', what: `visual viewport offset ${visualViewport.offsetLeft},${visualViewport.offsetTop}` });

  const name = (el: Element) => {
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ''}`;
  };
  type Box = { l: number; t: number; r: number; b: number };
  const box = (r: DOMRect): Box => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  const cut = (a: Box, b: Box): Box => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const empty = (a: Box) => a.r - a.l < 1 || a.b - a.t < 1;
  const scrolls = (el: Element, cs: CSSStyleDeclaration) =>
    (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1);

  const safeBox: Box = { l: safe.l, t: safe.t, r: vw - safe.r, b: vh - safe.b };
  const sel = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="slider"]';
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.pointerEvents === 'none') continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let clip: Box = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    let scroller: Element | null = null;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
      clip = cut(clip, box(p.getBoundingClientRect()));
      if (!scroller && scrolls(p, ps)) scroller = p;
    }
    const seen = cut(box(r), clip);
    if (empty(seen)) continue; // scrolled out of its panel (or clipped away on purpose)
    // Covered by something else (a sheet over the HUD): not the player's to touch now.
    const hit = document.elementFromPoint((seen.l + seen.r) / 2, (seen.t + seen.b) / 2);
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;
    const whole = box(r);
    const cutOff = whole.l < clip.l - 1 || whole.t < clip.t - 1 || whole.r > clip.r + 1 || whole.b > clip.b + 1;
    if (cutOff && !scroller) out.push({ kind: 'clipped', what: `${name(el)} cut by its container` });
    if (seen.l < safeBox.l - 1 || seen.t < safeBox.t - 1 || seen.r > safeBox.r + 1 || seen.b > safeBox.b + 1)
      out.push({ kind: 'outside', what: `${name(el)} at ${Math.round(seen.l)},${Math.round(seen.t)}–${Math.round(seen.r)},${Math.round(seen.b)} (safe ${safeBox.l},${safeBox.t}–${safeBox.r},${safeBox.b})` });
    const size = Math.min(r.width, r.height);
    if (size < 44 - 0.5) out.push({ kind: 'small', what: `${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}` });
  }
  // A menu screen never scrolls as a whole (its title and buttons would go with it): only its body.
  for (const el of document.querySelectorAll<HTMLElement>('.screen.active')) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY)) out.push({ kind: 'scroll', what: `${name(el)} scrolls as a whole` });
    else if (el.scrollHeight > el.clientHeight + 2) out.push({ kind: 'clipped', what: `${name(el)} is ${el.scrollHeight} px tall in ${el.clientHeight}` });
  }
  // Panels with more than they show must scroll themselves (and keep the scroll to themselves).
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    if (el.scrollHeight <= el.clientHeight + 2 || el.clientHeight < 20) continue;
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY) || cs.visibility !== 'visible') continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const top = el.scrollTop;
    el.scrollTop = 1e6;
    const went = el.scrollTop > 0;
    el.scrollTop = top;
    if (!went) out.push({ kind: 'panel', what: `${name(el)} overflows (${el.scrollHeight} in ${el.clientHeight}) but does not scroll` });
    else if (cs.overscrollBehaviorY === 'auto') out.push({ kind: 'panel', what: `${name(el)} scrolls but passes its overscroll on (overscroll-behavior auto)` });
  }
  return out;
}

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1].split(',') : null;
};
const fDevice = opt('--device');
const fScreen = opt('--screen');
const fMode = opt('--mode');
const fOrient = opt('--orient');
const shots = !args.includes('--no-shots');
const match = (f: string[] | null, v: string) => !f || f.some((x) => v.includes(x));

let failures = 0;
const tally = new Map<string, number>();

async function runView(browser: Browser, base: string, d: Device, mode: 'tab' | 'app', orient: 'p' | 'l'): Promise<string[]> {
  const v = d[mode][orient === 'p' ? 0 : 1];
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    screen: { width: v.w, height: v.h },
    deviceScaleFactor: d.dpr,
    isMobile: true,
    hasTouch: true,
    userAgent: d.ua,
  });
  const standalone = mode === 'app';
  await ctx.addInitScript((sa: boolean) => {
    // Installed or not, as the page would see it (display-mode and iOS's navigator.standalone).
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q: string) =>
      mm(q.replace(/\(\s*display-mode:\s*(standalone|fullscreen|minimal-ui)\s*\)/g, sa ? '(min-width: 0px)' : '(max-width: 0px)').replace(/\(\s*display-mode:\s*browser\s*\)/g, sa ? '(max-width: 0px)' : '(min-width: 0px)'));
    if (/iPhone|iPad/.test(navigator.userAgent)) Object.defineProperty(navigator, 'standalone', { configurable: true, value: sa });
  }, standalone);
  const lines: string[] = [];
  const tag = `${d.name}-${mode}-${orient}`;
  for (const s of STEPS) {
    if (!match(fScreen, s.name)) continue;
    const page: Page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const q = [s.query, `safe=${v.safe.t},${v.safe.r},${v.safe.b},${v.safe.l}`].filter(Boolean).join('&');
    const problems: Problem[] = [];
    try {
      await page.goto(`${base}/?${q}`);
      const wait = (expr: string) => page.waitForFunction(`(() => { const a = window.__mythwar; return !!a && (${expr}); })()`, undefined, { timeout: 15000 });
      await wait(s.ready);
      if (s.script) await page.evaluate(`(() => { const a = window.__mythwar; ${s.script}; })()`);
      if (s.ready2) await wait(s.ready2);
      await page.waitForTimeout(s.after ?? 500);
      problems.push(...(await page.evaluate(inspect, v.safe)));
      if (shots) await page.screenshot({ path: `screenshots/mobile/${tag}-${s.name}.png` });
    } catch (e) {
      problems.push({ kind: 'error', what: (e as Error).message.split('\n')[0] });
    }
    for (const m of errors) problems.push({ kind: 'error', what: `page error: ${m}` });
    await page.close();
    const seen = new Set<string>();
    for (const p of problems) {
      const key = `${p.kind}: ${p.what}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`FAIL  ${tag} ${s.name}  ${key}`);
      tally.set(p.kind, (tally.get(p.kind) ?? 0) + 1);
      failures++;
    }
    if (!problems.length) lines.push(`ok    ${tag} ${s.name}`);
  }
  await ctx.close();
  return lines;
}

async function main(): Promise<void> {
  const root = resolve('dist');
  if (!existsSync(join(root, 'index.html'))) throw new Error('Run "npm run build" first');
  mkdirSync('screenshots/mobile', { recursive: true });
  const http = createServer(serveStatic(root));
  const mp = attachMultiplayer(http, { countdown: 1 });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const { chromium, webkit } = await import('playwright');
  const chrome = findChrome();
  const browsers: Partial<Record<Device['engine'], Browser>> = {};
  try {
    browsers.webkit = await webkit.launch();
    if (chrome) browsers.chromium = await chromium.launch({ executablePath: chrome });
    else console.log('(no Chrome/Edge found: the Android profiles are skipped)');
    const jobs: (() => Promise<string[]>)[] = [];
    for (const d of DEVICES) {
      const b = browsers[d.engine];
      if (!b || !match(fDevice, d.name)) continue;
      for (const mode of ['tab', 'app'] as const)
        for (const orient of ['p', 'l'] as const) if (match(fMode, mode) && match(fOrient, orient)) jobs.push(() => runView(b, base, d, mode, orient));
    }
    // A few views at a time (each is a fresh phone: its own storage).
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) for (const line of await jobs[next++]()) console.log(line);
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } finally {
    for (const b of Object.values(browsers)) await b?.close();
    mp.close();
    http.close();
  }
  if (failures) console.log(`\n${failures} problem(s): ${[...tally].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  else console.log('\nEvery screen holds still and fits, on every phone');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
