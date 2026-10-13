/**
 * Phones, screen by screen: WebKit iPhones and Chromium Androids, upright and sideways, in a
 * browser tab (the viewport left by the browser's bars) and installed (the whole screen, with the
 * notch and home bar as safe-area insets). Every screen must keep the page itself still (no
 * scrolling document, no zoom), keep every control on screen and clear of the notch, give every
 * control a 44-px target, and let panels that overflow scroll inside themselves; no control or
 * text on top of a control, no text under 10 px, no text field under 16 px (iOS zooms into it).
 * Some screens are turned while open; online ones get a friend (a client run here).
 *
 *   npm run build && node scripts/mobilecheck.ts [--device iphone-se] [--screen title]
 *     [--mode tab|app] [--orient p|l] [--no-shots] [--quick]
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
import { MpClient } from '../src/net/client.ts';

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
    // A tablet: Safari's bar on top only; installed, the status bar and the home bar.
    name: 'ipad-mini',
    engine: 'webkit',
    ua: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    dpr: 2,
    tab: [{ w: 744, h: 1059, safe: NO }, { w: 1133, h: 670, safe: NO }],
    app: [{ w: 744, h: 1133, safe: { t: 24, r: 0, b: 20, l: 0 } }, { w: 1133, h: 744, safe: { t: 24, r: 0, b: 20, l: 0 } }],
  },
  {
    // A bigger-logo-for-its-size tablet: the 10.2" iPad (810×1080).
    name: 'ipad-10',
    engine: 'webkit',
    ua: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    dpr: 2,
    tab: [{ w: 810, h: 1010, safe: NO }, { w: 1080, h: 740, safe: NO }],
    app: [{ w: 810, h: 1080, safe: { t: 20, r: 0, b: 0, l: 0 } }, { w: 1080, h: 810, safe: { t: 20, r: 0, b: 0, l: 0 } }],
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
  /** Only in a tab, or only installed. */
  only?: 'tab' | 'app';
  /**
   * A friend (a client run here) joins the room the page hosts and readies up; then `script3`
   * runs and `ready3` is waited for. With `guestLeaves`, the friend then leaves (mid-battle: a
   * forfeit) and that predicate is waited for.
   */
  guest?: boolean;
  script3?: string;
  ready3?: string;
  guestLeaves?: string;
  /**
   * Turned once it's ready: the phone is rotated (the other orientation's viewport) and the
   * screen checked again as it is then. (Only where both orientations have the same insets:
   * `?safe=` is read once.)
   */
  turn?: boolean;
}

const battle = 'play=novice&seed=4';
const inBattle = `a.state === 'playing' && a.game && a.game.world.tick > 20`;
const STEPS: Step[] = [
  { name: 'title', query: '', ready: `a.menus.current === 'title'`, after: 900 },
  // A returning player with a battle saved: Continue joins the title's buttons.
  { name: 'title-continue', query: '', ready: `a.menus.current === 'title'`, script: `a.menus.setContinue('Fae Wilds · 3:12'); a.menus.show('title')`, after: 900 },
  { name: 'journey', query: 'screen=difficulty', ready: `a.menus.current === 'difficulty'`, after: 700 },
  { name: 'riddles', query: 'screen=difficulty', ready: `a.menus.current === 'difficulty'`, script: `a.menus.show('riddles')`, ready2: `a.menus.current === 'riddles'`, after: 700 },
  { name: 'howto', query: 'screen=howto', ready: `a.menus.current === 'howto'`, after: 700 },
  { name: 'settings', query: 'screen=settings', ready: `a.menus.current === 'settings'`, after: 700 },
  { name: 'bestiary', query: 'screen=bestiary', ready: `a.menus.current === 'bestiary'`, after: 700 },
  { name: 'feats', query: 'screen=feats', ready: `a.menus.current === 'feats'`, after: 700 },
  { name: 'battle', query: battle, ready: inBattle, after: 1500 },
  { name: 'turrets', query: battle, ready: inBattle, script: `a.game.world.players[0].gold = 900; a.hud.togglePanel('turret')`, after: 700 },
  { name: 'blessings', query: battle, ready: inBattle, script: `a.game.world.players[0].gold = 900; a.hud.togglePanel('bless')`, after: 700 },
  // The first minutes' overlays: a coach tip, the next age's preview (a long
  // press on Ascend) and a card's details (a long press on a card).
  // (Whatever tip comes first: the earlier screens of this phone may have used some up.)
  { name: 'tip', query: battle, ready: inBattle, script: `a.settings.hints = true; a.settings.hintsSeen = []; a.game.speed = 4`, ready2: `!!document.querySelector('.coach.show')`, after: 700 },
  { name: 'preview', query: battle, ready: inBattle, script: `document.querySelector('.act.ascend').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))`, ready2: `!document.querySelector('.tooltip').classList.contains('hidden')`, after: 500 },
  { name: 'card', query: battle, ready: inBattle, script: `a.hud.showTooltip(window.__mythwarData.UNITS.treant, document.querySelector('.card'))`, ready2: `!document.querySelector('.tooltip').classList.contains('hidden')`, after: 500 },
  { name: 'pause', query: battle, ready: inBattle, script: `a.pause()`, ready2: `a.menus.current === 'pause'`, after: 700 },
  { name: 'results', query: battle, ready: inBattle, script: `a.game.speed = 4; const w = a.game.world; w.players[1].baseHp = 1; w.damageBase(1, 10, 0, 0)`, ready2: `a.menus.current === 'over'`, after: 1200 },
  { name: 'lobby', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, after: 900 },
  // Getting the app (ui/install.ts): the sheet in a tab, the first launch's welcome installed.
  { name: 'install', query: '', ready: `a.menus.current === 'title'`, script: `a.install.open()`, ready2: `!!document.querySelector('.isheetback.show')`, after: 700, only: 'tab' },
  { name: 'welcome', query: '', ready: `a.menus.current === 'title'`, script: `a.settings.appWelcome = false; a.install.welcome()`, ready2: `!!document.querySelector('.isheetback.show')`, after: 700, only: 'app' },
  // The LAN game server's page: the title offers only full screen (Android), Settings says in
  // one line where the installable app comes from.
  { name: 'lan-title', query: 'lanpreview', ready: `a.menus.current === 'title'`, after: 700, only: 'tab' },
  { name: 'lan-settings', query: 'lanpreview&screen=settings', ready: `a.menus.current === 'settings'`, script: `document.querySelector('.sapp')?.scrollIntoView({ block: 'center' })`, after: 700, only: 'tab' },
  // Typing a name in the lobby (upright phones: the upright echo of the turned field).
  { name: 'typing', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, script: `const f = document.querySelector('.screen.mp .mpname'); f.focus(); f.value = 'Ada Lovelace'; f.dispatchEvent(new Event('input', { bubbles: true }))`, after: 600 },
  { name: 'room', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, script: `a.mp.host()`, ready2: `a.menus.current === 'room'`, after: 1000 },
  // Rotated while open (TASK A: "after rotating"): the battle, a menu screen, the install sheet.
  { name: 'turned-battle', query: battle, ready: inBattle, turn: true, after: 1200 },
  { name: 'turned-settings', query: 'screen=settings', ready: `a.menus.current === 'settings'`, turn: true, after: 900 },
  { name: 'turned-install', query: '', ready: `a.menus.current === 'title'`, script: `a.install.open()`, ready2: `!!document.querySelector('.isheetback.show')`, turn: true, after: 900, only: 'tab' },
  // With a friend: the full room (seats, battle modes, handicaps), an online battle (quick
  // messages, the connection) and its results (rematch, quick messages).
  { name: 'room2', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, script: `a.mp.host()`, ready2: `a.menus.current === 'room'`, guest: true, ready3: `!!a.mp.room?.seats[1]?.ready`, after: 1000 },
  { name: 'online', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, script: `a.mp.host()`, ready2: `a.menus.current === 'room'`, guest: true, script3: `a.mp.ready(true)`, ready3: inBattle, after: 1500 },
  { name: 'online-over', query: 'mp', ready: `a.menus.current === 'mp' && !!a.mp?.welcomed`, script: `a.mp.host()`, ready2: `a.menus.current === 'room'`, guest: true, script3: `a.mp.ready(true)`, ready3: inBattle, guestLeaves: `a.menus.current === 'over'`, after: 1200 },
];

interface Problem {
  kind: 'scroll' | 'zoom' | 'outside' | 'clipped' | 'small' | 'panel' | 'tiny' | 'zoomfield' | 'overlap' | 'error';
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
  const touchable: { el: HTMLElement; b: Box }[] = [];
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
    touchable.push({ el, b: seen });
    const cutOff = whole.l < clip.l - 1 || whole.t < clip.t - 1 || whole.r > clip.r + 1 || whole.b > clip.b + 1;
    if (cutOff && !scroller) out.push({ kind: 'clipped', what: `${name(el)} cut by its container` });
    if (seen.l < safeBox.l - 1 || seen.t < safeBox.t - 1 || seen.r > safeBox.r + 1 || seen.b > safeBox.b + 1)
      out.push({ kind: 'outside', what: `${name(el)} at ${Math.round(seen.l)},${Math.round(seen.t)}–${Math.round(seen.r)},${Math.round(seen.b)} (safe ${safeBox.l},${safeBox.t}–${safeBox.r},${safeBox.b})` });
    // The finger's target: the box, or a larger hit area drawn by a positioned ::before/::after
    // (a small dot with a finger-sized ring around it). Measured unturned (offset sizes).
    let tw = el.offsetWidth || r.width;
    let th = el.offsetHeight || r.height;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none' || ps.content === 'normal' || ps.position !== 'absolute' || ps.pointerEvents === 'none' || ps.display === 'none') continue;
      tw = Math.max(tw, parseFloat(ps.width) || 0);
      th = Math.max(th, parseFloat(ps.height) || 0);
    }
    const size = Math.min(tw, th);
    if (size < 44 - 0.5) out.push({ kind: 'small', what: `${name(el)} ${Math.round(tw)}×${Math.round(th)}` });
  }
  // Controls side by side, not on top of each other (one inside the other is a part of it).
  for (let i = 0; i < touchable.length; i++)
    for (let j = i + 1; j < touchable.length; j++) {
      const a = touchable[i];
      const b = touchable[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const o = cut(a.b, b.b);
      if (o.r - o.l > 4 && o.b - o.t > 4) out.push({ kind: 'overlap', what: `${name(a.el)} and ${name(b.el)} overlap by ${Math.round(o.r - o.l)}×${Math.round(o.b - o.t)}` });
    }
  // Text over a control (a footer line across a button): the text's own lines, as drawn (clipped
  // by scrolling panels), against every control it isn't part of — where the text is on top.
  // (Hit-tested with every element hit-testable: a footer line ignores the finger but is drawn
  // over the button. The battle's floating notes — the opening banner, a coach tip, a card's
  // details — come and go over the lane buttons on purpose.)
  const over = new Set<string>();
  const allHit = document.createElement('style');
  allHit.textContent = '* { pointer-events: auto !important; }';
  document.head.appendChild(allHit);
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
    if (!texts.length || touchable.some((t) => t.el.contains(el)) || el.closest('.banner, .coach, .tooltip')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || el.closest('.sronly') || (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) continue;
    let clip: Box = { l: 0, t: 0, r: vw, b: vh };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX !== 'visible' || ps.overflowY !== 'visible') clip = cut(clip, box(p.getBoundingClientRect()));
    }
    for (const n of texts) {
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const line of range.getClientRects()) {
        const seen = cut(box(line), clip);
        if (empty(seen)) continue;
        for (const t of touchable) {
          if (el.contains(t.el)) continue;
          const o = cut(seen, t.b);
          if (o.r - o.l <= 4 || o.b - o.t <= 4) continue;
          // The topmost thing drawn there (see-through ones, like a faded-out toast, don't count).
          const top = document
            .elementsFromPoint((o.l + o.r) / 2, (o.t + o.b) / 2)
            .find((x) => !x.checkVisibility || x.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
          if (top && (top === el || el.contains(top))) over.add(`${name(el)} over ${name(t.el)}`);
        }
      }
    }
  }
  allHit.remove();
  for (const o of over) out.push({ kind: 'overlap', what: `text ${o}` });
  // Readable text: nothing on screen below 10 px (the HUD's small numbers are 10).
  const tiny = new Set<string>();
  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || el.closest('.sronly') || (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))) continue;
    if (parseFloat(cs.fontSize) < 9.95) tiny.add(`${name(el)} ${cs.fontSize}`);
  }
  for (const t of tiny) out.push({ kind: 'tiny', what: `text ${t}` });
  // Text fields at 16 px or more: iOS zooms the page into a smaller one when it gets the focus
  // (and with pinch off there's no way back). Hidden ones too — a tap shows them (the seat's name).
  for (const el of document.querySelectorAll<HTMLElement>('input:not([type="range"], [type="checkbox"], [type="radio"]), textarea, select')) {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 15.95) out.push({ kind: 'zoomfield', what: `${name(el)} ${fs}px (iOS zooms in on focus)` });
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

/**
 * Real finger gestures (Chromium only: WebKit has no way to synthesize them): a pinch and swipes
 * must leave the page where it is; a swipe on a screen's body that has more to show scrolls it
 * (on an upright phone the stage is turned, so "down the screen" is sideways under the finger).
 */
async function gestures(page: Page): Promise<Problem[]> {
  const out: Problem[] = [];
  const cdp = await page.context().newCDPSession(page);
  const vw = page.viewportSize()!.width;
  const vh = page.viewportSize()!.height;
  const still = () =>
    page.evaluate(() => ({ x: scrollX, y: scrollY, scale: visualViewport?.scale ?? 1, top: visualViewport?.offsetTop ?? 0, left: visualViewport?.offsetLeft ?? 0 }));
  const moved = (s: Awaited<ReturnType<typeof still>>) => s.x !== 0 || s.y !== 0 || Math.abs(s.scale - 1) > 0.01 || s.top !== 0 || s.left !== 0;
  // A finger (or two) dragged in steps, as a hand would.
  const drag = async (from: [number, number][], dx: number, dy: number, spread = 0) => {
    const at = (i: number) => from.map(([x, y], k) => ({ x: x + (dx * i) / 10 + (k ? spread : -spread) * (i / 10), y: y + (dy * i) / 10, id: k }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i) });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
  };
  const c: [number, number] = [vw / 2, vh / 2];
  await drag([[c[0] - 30, c[1]], [c[0] + 30, c[1]]], 0, 0, 90);
  let s = await still();
  if (moved(s)) out.push({ kind: 'zoom', what: `a pinch zoomed the page (${JSON.stringify(s)})` });
  for (const [dx, dy] of [[0, 160], [0, -160], [160, 0], [-160, 0]]) {
    await drag([c], dx, dy);
    s = await still();
    if (moved(s)) {
      out.push({ kind: 'scroll', what: `a swipe (${dx},${dy}) moved the page (${JSON.stringify(s)})` });
      await page.evaluate(() => scrollTo(0, 0));
    }
  }
  const body = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('.screen.active > .sbody');
    if (!b || b.scrollHeight <= b.clientHeight + 40) return null;
    b.scrollTop = 0;
    const r = b.getBoundingClientRect();
    // (Not on a text field: a sideways drag there moves the caret — the player swipes elsewhere.)
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7], [0.2, 0.2], [0.8, 0.8]]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (!document.elementFromPoint(x, y)?.closest('input, textarea')) return { x, y, rotated: !!document.querySelector('#stage.rotated') };
    }
    return null;
  });
  if (body) {
    // (Finger towards the stage's top: up the screen, or rightwards on a turned stage.)
    await drag([[body.x, body.y]], body.rotated ? 120 : 0, body.rotated ? 0 : -120);
    const top = await page.evaluate(() => document.querySelector<HTMLElement>('.screen.active > .sbody')!.scrollTop);
    if (top < 20) out.push({ kind: 'panel', what: `a swipe on the screen's body did not scroll it (scrollTop ${top})` });
    s = await still();
    if (moved(s)) out.push({ kind: 'scroll', what: `a swipe on the screen's body moved the page (${JSON.stringify(s)})` });
  }
  await cdp.detach();
  return out;
}

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1].split(',') : null;
};
// --quick: three phones that span the range (the smallest iPhone, an Android, a tablet) — for
// iterating; the whole matrix before committing a layout change.
const fDevice = opt('--device') ?? (args.includes('--quick') ? ['iphone-se', 'pixel-7', 'ipad-mini'] : null);
const fScreen = opt('--screen');
const fMode = opt('--mode');
const fOrient = opt('--orient');
const shots = !args.includes('--no-shots');
const match = (f: string[] | null, v: string) => !f || f.some((x) => v.includes(x));

let failures = 0;
const tally = new Map<string, number>();

/** The friend: joins room `code` on the check's server and readies up for the battle. */
function friend(base: string, code: string): MpClient {
  const mp = new MpClient({ name: 'Bo', url: base.replace(/^http/, 'ws') + '/mp', storage: null });
  let asked = false;
  mp.listen({
    changed: () => {
      if (mp.welcomed && !asked) {
        asked = true;
        mp.join(code);
      }
      const room = mp.room;
      if (room && mp.seat !== null && room.phase !== 'playing' && room.phase !== 'over' && !room.seats[mp.seat]?.ready) mp.ready(true);
    },
  });
  mp.start();
  return mp;
}

async function runView(browser: Browser, base: string, d: Device, mode: 'tab' | 'app', orient: 'p' | 'l'): Promise<string[]> {
  const v = d[mode][orient === 'p' ? 0 : 1];
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    screen: { width: v.w, height: v.h },
    // (At most 2: the game draws at 2x at most anyway, and headless WebKit rasterizes on the CPU —
    // at 3x a big installed phone ran the battle at a third of its speed.)
    deviceScaleFactor: Math.min(2, d.dpr),
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
    // Each screen in its settled state: no transitions or entrance animations (under load,
    // headless WebKit sometimes didn't advance them — a sheet stayed at its invisible first frame).
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }';
      document.head.appendChild(st);
    });
    // (The welcome and the after-battle offer were seen: each has a screen of its own here.)
    if (!localStorage.getItem('mythwar.settings.v1')) localStorage.setItem('mythwar.settings.v1', JSON.stringify({ appWelcome: true, installSheet: true }));
  }, standalone);
  const lines: string[] = [];
  const tag = `${d.name}-${mode}-${orient}`;
  for (const s of STEPS) {
    if (!match(fScreen, s.name) || (s.only && s.only !== mode)) continue;
    // (Turned: the screen ends up in the other orientation — checked against that one's insets.)
    const turned = d[mode][orient === 'p' ? 1 : 0];
    if (s.turn && JSON.stringify(turned.safe) !== JSON.stringify(v.safe)) continue;
    const page: Page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const q = [s.query, `safe=${v.safe.t},${v.safe.r},${v.safe.b},${v.safe.l}`].filter(Boolean).join('&');
    const problems: Problem[] = [];
    let guest: MpClient | null = null;
    try {
      await page.goto(`${base}/?${q}`);
      const wait = (expr: string) => page.waitForFunction(`(() => { const a = window.__mythwar; return !!a && (${expr}); })()`, undefined, { timeout: 45000 });
      await wait(s.ready);
      if (s.script) await page.evaluate(`(() => { const a = window.__mythwar; ${s.script}; })()`);
      if (s.ready2) await wait(s.ready2);
      if (s.guest) {
        const code = (await page.evaluate(`window.__mythwar.mp.room.code`)) as string;
        guest = friend(base, code);
        // (Seated and ready first: a newcomer takes both seats out of Ready.)
        await wait(`!!a.mp.room?.seats[1]?.ready`);
        if (s.script3) await page.evaluate(`(() => { const a = window.__mythwar; ${s.script3}; })()`);
        if (s.ready3) await wait(s.ready3);
        if (s.guestLeaves) {
          guest.leave();
          await wait(s.guestLeaves);
        }
      }
      if (s.turn) {
        await page.waitForTimeout(400);
        await page.setViewportSize({ width: turned.w, height: turned.h });
      }
      await page.waitForTimeout(s.after ?? 500);
      problems.push(...(await page.evaluate(inspect, v.safe)));
      if (shots) await page.screenshot({ path: `screenshots/mobile/${tag}-${s.name}.png` });
      if (d.engine === 'chromium') problems.push(...(await gestures(page)));
    } catch (e) {
      problems.push({ kind: 'error', what: (e as Error).message.split('\n')[0] });
    }
    for (const m of errors) problems.push({ kind: 'error', what: `page error: ${m}` });
    guest?.stop();
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
  // (A browser per view: WebKit throttles the animations of pages it doesn't consider in front,
  // so with several views in one browser a sheet could stay at its first, invisible frame.)
  const launch: Partial<Record<Device['engine'], () => Promise<Browser>>> = { webkit: () => webkit.launch() };
  if (chrome) launch.chromium = () => chromium.launch({ executablePath: chrome });
  else console.log('(no Chrome/Edge found: the Android profiles are skipped)');
  try {
    const jobs: (() => Promise<string[]>)[] = [];
    for (const d of DEVICES) {
      const start = launch[d.engine];
      if (!start || !match(fDevice, d.name)) continue;
      for (const mode of ['tab', 'app'] as const)
        for (const orient of ['p', 'l'] as const)
          if (match(fMode, mode) && match(fOrient, orient))
            jobs.push(async () => {
              const b = await start();
              try {
                return await runView(b, base, d, mode, orient);
              } finally {
                await b.close();
              }
            });
    }
    // A few views at a time (each is a fresh phone: its own storage).
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) for (const line of await jobs[next++]()) console.log(line);
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } finally {
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
