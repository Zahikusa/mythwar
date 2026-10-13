import { advise, currentSituation } from '../platform.ts';
import type { Advice, InApp, Situation } from '../platform.ts';
import type { Settings } from './settings.ts';
import { exportProgress } from './progress.ts';
import { copyText, h, onTap } from './dom.ts';
import { qrSvg } from './mpmenus.ts';

/** The public game address: where the installable app lives (the LAN server's page can't be it). */
export const PUBLIC_URL = 'https://zahikusa.github.io/mythwar/';

/** How long an offer that was put away stays away before it comes back (once). */
const OFFER_AGAIN_MS = 4 * 24 * 3600 * 1000;

/** Chrome's install dialog, held until the player asks for it. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Pictures of the browser buttons a step asks for (24×24, currentColor). */
const PIC = {
  share: '<path d="M12 3v11M8 7l4-4 4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" stroke-linecap="round"/>',
  dots: '<circle cx="12" cy="12" r="9.5"/><circle cx="7.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="16.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  vdots: '<circle cx="12" cy="5.5" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.8" fill="currentColor" stroke="none"/>',
  burger: '<path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round"/>',
  add: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8" stroke-linecap="round"/>',
  toggle: '<rect x="2.5" y="7" width="19" height="10" rx="5" fill="#4cd964" stroke="#4cd964"/><circle cx="16.5" cy="12" r="3.6" fill="#fff" stroke="none"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" stroke-linecap="round"/>',
  home: '<path d="M4 11l8-7 8 7v8.5A1.5 1.5 0 0 1 18.5 21H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z" stroke-linejoin="round"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke-linecap="round" stroke-linejoin="round"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3" stroke-linecap="round"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
};
const pic = (k: keyof typeof PIC) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${PIC[k]}</svg>`;

/** Where the browser button a step points at sits on the screen (the arrow's place), if known. */
type Spot = 'bottom' | 'bottom-right' | 'top-right' | null;

interface Step {
  pic: keyof typeof PIC;
  text: string;
}

interface Guide {
  title: string;
  lead: string;
  steps: Step[];
  /** The first step's button, for the arrow (upright phone / sideways phone). */
  spot: { portrait: Spot; landscape: Spot };
  /** One more line under the steps. */
  note?: string;
}

const APP_NAMES: Record<InApp, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  telegram: 'Telegram',
  snapchat: 'Snapchat',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  x: 'X',
  line: 'LINE',
  wechat: 'WeChat',
  pinterest: 'Pinterest',
  google: 'the Google app',
  webview: 'this app',
};

/** The phone is held sideways (the browser's bars sit elsewhere then). */
const sideways = () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight;

/** The browser to escape to, by name. */
const realBrowser = (s: Situation) => (s.os === 'ios' ? 'Safari' : s.os === 'android' ? 'Chrome' : 'your browser');

/** The words and pictures for one situation. Exported for the tests and the screenshots. */
export function guideFor(s: Situation, advice: Advice): Guide | null {
  const lead = 'Full screen, no browser bars, one tap from your Home Screen — and it plays offline.';
  const none = { portrait: null, landscape: null };
  switch (advice) {
    case 'ios-add': {
      const add: Step = { pic: 'add', text: 'Scroll down and tap Add to Home Screen.' };
      const where = s.tablet ? 'top right' : sideways() ? 'at the top' : 'at the bottom';
      if (s.browser === 'safari' && s.ios >= 26)
        return {
          title: 'Play Mythwar as an app',
          lead,
          steps: [
            { pic: 'dots', text: `Tap ⋯ beside the address${s.tablet ? '' : sideways() ? ' (top right)' : ' (bottom right)'}.` },
            { pic: 'share', text: 'Tap Share.' },
            add,
            { pic: 'toggle', text: 'Keep “Open as Web App” on, then tap Add.' },
          ],
          spot: s.tablet ? { portrait: 'top-right', landscape: 'top-right' } : { portrait: 'bottom-right', landscape: 'top-right' },
        };
      if (s.browser === 'safari')
        return {
          title: 'Play Mythwar as an app',
          lead,
          steps: [{ pic: 'share', text: `Tap Share in Safari’s toolbar (${where}).` }, add, { pic: 'home', text: 'Tap Add.' }],
          spot: s.tablet ? { portrait: 'top-right', landscape: 'top-right' } : { portrait: 'bottom', landscape: 'top-right' },
        };
      if (s.browser === 'chrome')
        return {
          title: 'Play Mythwar as an app',
          lead,
          steps: [{ pic: 'share', text: 'Tap Share in the address bar (top right).' }, add, { pic: 'home', text: 'Tap Add.' }],
          spot: { portrait: 'top-right', landscape: 'top-right' },
        };
      if (s.browser === 'firefox')
        return {
          title: 'Play Mythwar as an app',
          lead,
          steps: [{ pic: 'burger', text: 'Tap the menu ≡ (bottom right).' }, { pic: 'share', text: 'Tap Share.' }, add, { pic: 'home', text: 'Tap Add.' }],
          spot: { portrait: 'bottom-right', landscape: null },
        };
      return {
        title: 'Play Mythwar as an app',
        lead,
        steps: [{ pic: 'dots', text: 'Open the browser’s menu ⋯.' }, { pic: 'share', text: 'Tap Share.' }, add, { pic: 'home', text: 'Tap Add.' }],
        spot: none,
      };
    }
    case 'ios-safari':
      return {
        title: 'Open Mythwar in Safari',
        lead: 'This browser can’t put the game on your Home Screen on this iOS version — Safari can, as a full-screen app.',
        steps: [{ pic: 'copy', text: 'Copy the link (below).' }, { pic: 'open', text: 'Open Safari and paste it in the address bar.' }, { pic: 'share', text: 'There: Share → Add to Home Screen.' }],
        spot: none,
      };
    case 'install':
      return { title: 'Install Mythwar', lead, steps: [{ pic: 'add', text: 'Tap Install app, then Install.' }, { pic: 'home', text: 'Mythwar opens from your home screen, full screen.' }], spot: none };
    case 'android-menu': {
      const menu: Record<string, [Step, Step, Spot]> = {
        chrome: [{ pic: 'vdots', text: 'Tap the menu ⋮ (top right).' }, { pic: 'add', text: 'Tap Add to home screen (or Install app), then Install.' }, 'top-right'],
        samsung: [{ pic: 'burger', text: 'Tap the menu ≡ (bottom right).' }, { pic: 'add', text: 'Tap Add page to → Home screen.' }, 'bottom-right'],
        firefox: [{ pic: 'vdots', text: 'Tap the menu ⋮.' }, { pic: 'add', text: 'Tap Add app to Home screen.' }, null],
        edge: [{ pic: 'dots', text: 'Tap the menu ⋯ (bottom).' }, { pic: 'add', text: 'Tap Add to phone.' }, 'bottom'],
      };
      const [a, b, spot] = menu[s.browser] ?? [{ pic: 'vdots', text: 'Open the browser’s menu.' }, { pic: 'add', text: 'Tap Add to Home screen.' }, null];
      return { title: 'Play Mythwar as an app', lead, steps: [a, b], spot: { portrait: spot, landscape: spot }, note: 'Or just play full screen in this tab.' };
    }
    case 'escape': {
      const app = APP_NAMES[s.inApp ?? 'webview'];
      const browser = realBrowser(s);
      return {
        title: `Open Mythwar in ${browser}`,
        lead: `You’re in ${app}’s built-in browser: here the game can’t go full screen or be installed. ${browser} can do both.`,
        steps:
          s.os === 'android'
            ? [{ pic: 'open', text: `Tap Open in ${browser} below.` }, { pic: 'vdots', text: `Or: the menu ⋮ (top right) → Open in ${browser}.` }]
            : [{ pic: 'dots', text: 'Tap ⋯ or the share button (top or bottom right).' }, { pic: 'open', text: `Tap Open in ${browser} (or Open in browser).` }],
        spot: { portrait: 'top-right', landscape: 'top-right' },
      };
    }
    case 'qr':
      return { title: 'Play on your phone', lead: 'Mythwar is made for phones: scan this with the camera, then put it on your Home Screen like an app.', steps: [], spot: none };
    case 'lan':
      return {
        title: 'Playing over your Wi-Fi',
        lead: 'This page comes from the game server on this network — play right here in the tab.',
        steps: [],
        spot: none,
        note: `The installable app (Home Screen, offline) comes from the public address, ${PUBLIC_URL.replace('https://', '').replace(/\/$/, '')} — battles with friends still use this server.`,
      };
    default:
      return null;
  }
}

export interface InstallHooks {
  settings: Settings;
  save(): void;
  sound(kind: string): void;
  /** Full screen (Android): from a tap, so it's allowed. */
  fullscreen(): void;
  /** Whether full screen is possible here (Android browsers; not iPhone Safari). */
  canFullscreen(): boolean;
  /** A sheet opened: Back should close it (the app keeps a history entry for that). */
  opened(): void;
}

/**
 * Guides every player to the best way to play (TASK goal C), never in the way of playing:
 * a small offer in the title's corner, the full sheet once after a finished battle, a
 * permanent entry in Settings, a welcome the first time the installed app opens.
 */
export class InstallGuide {
  readonly situation: Situation;
  private prompt: InstallPrompt | null = null;
  /** The app is installed on this device, but this is a tab (Android: getInstalledRelatedApps). */
  private elsewhere = false;
  private notes: HTMLElement | null = null;
  private chip: HTMLButtonElement | null = null;
  private sheet: HTMLElement | null = null;
  private arrow: HTMLElement | null = null;
  private readonly hooks: InstallHooks;
  /** What the open sheet shows (redrawn when the phone turns: the steps name where to tap). */
  private showing: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(hooks: InstallHooks, situation = currentSituation()) {
    this.hooks = hooks;
    let wasSideways = sideways();
    window.addEventListener('resize', () => {
      if (sideways() === wasSideways) return;
      wasSideways = sideways();
      this.showing?.();
    });
    this.situation = situation;
    window.addEventListener('beforeinstallprompt', (e) => {
      // (Held for the player's own tap — no browser banner of its own over the game.)
      e.preventDefault();
      this.prompt = e as InstallPrompt;
      this.changed();
    });
    window.addEventListener('appinstalled', () => {
      this.prompt = null;
      this.elsewhere = true;
      this.close();
      this.changed();
    });
    const related = (navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
    if (related && !situation.installed)
      related
        .call(navigator)
        .then((apps) => {
          this.elsewhere = apps.length > 0;
          this.changed();
        })
        .catch(() => {});
  }

  /** The one next step here (see platform.ts). */
  get advice(): Advice {
    const a = advise(this.situation, !!this.prompt);
    // The LAN page offers full screen where there is one, nothing to install.
    if (a === 'lan' && !this.hooks.canFullscreen()) return 'none';
    return this.elsewhere && a !== 'none' ? 'none' : a;
  }

  /** Something to offer at all (Settings shows its entry then). */
  get offered(): boolean {
    return this.advice !== 'none' && !this.situation.installed;
  }

  /** The label of the permanent entry (Settings). */
  get label(): string {
    switch (this.advice) {
      case 'install':
        return 'Install the app';
      case 'escape':
      case 'ios-safari':
        return `Open in ${this.situation.os === 'ios' ? 'Safari' : realBrowser(this.situation)}`;
      case 'qr':
        return 'Play on your phone';
      case 'lan':
        return 'Play full screen';
      default:
        return 'Get the app';
    }
  }

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  private changed(): void {
    this.renderChip();
    for (const fn of this.listeners) fn();
  }

  // -------------------------------------------------------------------------
  // The title's offer
  // -------------------------------------------------------------------------

  /** Shows the offer in the title's corner (`notes`: Menus.titleNotes). */
  attachTitle(notes: HTMLElement): void {
    this.notes = notes;
    this.renderChip();
  }

  private renderChip(): void {
    if (!this.notes) return;
    this.chip?.remove();
    this.chip = null;
    const s = this.hooks.settings;
    if (this.elsewhere && !this.situation.installed) {
      // A tab while the app is installed: say where the better copy is (no sheet to open).
      if (s.installHint === -1) return;
      this.chip = this.makeChip(pic('home'), 'You have the app — open Mythwar from your home screen', () => {});
      this.notes.appendChild(this.chip);
      return;
    }
    if (!this.offered) return;
    // Put away: a small round button stays (the permanent entry); the full offer comes back
    // once, days later — no nagging.
    const away = s.installHint === -1 || (s.installHint > 0 && Date.now() - s.installHint < OFFER_AGAIN_MS);
    const icon = this.advice === 'qr' ? pic('phone') : this.advice === 'lan' ? pic('full') : this.advice === 'escape' || this.advice === 'ios-safari' ? pic('open') : pic('add');
    this.chip = this.makeChip(icon, away ? '' : this.label, () => this.act(), !away);
    this.chip.setAttribute('aria-label', this.label);
    this.notes.appendChild(this.chip);
  }

  private makeChip(icon: string, text: string, act: () => void, closable = true): HTMLButtonElement {
    const chip = h('button', { class: `tnote tinstall${text ? '' : ' small'}` }, h('i', { html: icon }), text ? h('span', { text }) : null) as HTMLButtonElement;
    onTap(chip, (e) => {
      if ((e.target as Element).closest('.tclose')) return;
      this.hooks.sound('click');
      act();
    });
    if (text && closable) {
      const x = h('span', { class: 'tclose', role: 'button', 'aria-label': 'Not now', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' });
      onTap(x, () => this.putAway());
      chip.appendChild(x);
    }
    return chip;
  }

  /** "Not now" on the offer: remembered; it comes back once, days later. */
  private putAway(): void {
    const s = this.hooks.settings;
    s.installHint = s.installHint > 0 ? -1 : Date.now();
    this.hooks.save();
    this.hooks.sound('click');
    this.renderChip();
  }

  /** The offer's own action: the real install dialog, full screen, or the sheet with the steps. */
  act(): void {
    const a = this.advice;
    if (a === 'install' && this.prompt) {
      const p = this.prompt;
      this.prompt = null;
      void p.prompt().then(() => p.userChoice).then(() => this.changed(), () => this.changed());
      return;
    }
    if (a === 'lan') {
      this.hooks.fullscreen();
      return;
    }
    this.open();
  }

  // -------------------------------------------------------------------------
  // The sheet
  // -------------------------------------------------------------------------

  get isOpen(): boolean {
    return !!this.sheet;
  }

  /** After a finished battle (the results are showing): the full offer, once ever. */
  afterBattle(stillOnResults: () => boolean): void {
    const s = this.hooks.settings;
    if (s.installSheet || !this.offered || this.advice === 'lan') return;
    setTimeout(() => {
      if (!stillOnResults() || this.isOpen || s.installSheet) return;
      s.installSheet = true;
      this.hooks.save();
      this.open();
    }, 1600);
  }

  /** The first launch of the installed app: a short welcome. */
  welcome(): void {
    const s = this.hooks.settings;
    if (!this.situation.installed || s.appWelcome) return;
    s.appWelcome = true;
    this.hooks.save();
    const fresh = !Object.values(s.records).some((r) => r && r.wins + r.losses > 0) && !s.feats.length;
    this.show(
      {
        title: 'Welcome to the Mythwar app',
        lead: 'It opens full screen from your Home Screen and battles the gods offline too.',
        steps: [],
        spot: { portrait: null, landscape: null },
        note:
          fresh && this.situation.os === 'ios'
            ? 'Played in Safari before? The app keeps its own records: in Safari open Settings → Copy my code, then paste it here in Settings.'
            : undefined,
      },
      [this.button('Let’s play', 'primary', () => this.close())],
    );
  }

  /** The sheet for this situation (Settings' entry, the offer, after the first battle). */
  open(): void {
    const g = guideFor(this.situation, this.advice);
    if (!g) return;
    const actions: HTMLElement[] = [];
    const a = this.advice;
    if (a === 'install' && this.prompt) actions.push(this.button('Install app', 'primary', () => (this.close(), this.act())));
    if ((a === 'android-menu' || a === 'lan') && this.hooks.canFullscreen())
      actions.push(this.button('Play full screen', a === 'lan' ? 'primary' : '', () => (this.close(), this.hooks.fullscreen())));
    if (a === 'escape' && this.situation.os === 'android') {
      const url = new URL(location.href);
      const intent = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
      actions.push(this.button('Open in Chrome', 'primary', () => (location.href = intent)));
    }
    if (a === 'escape' || a === 'ios-safari') {
      const copy = this.button('Copy link', a === 'ios-safari' ? 'primary' : '', () => {
        void copyText(location.href.split('#')[0]).then((ok) => (copy.querySelector('span')!.textContent = ok ? 'Link copied' : 'Copy failed'));
      });
      actions.push(copy);
    }
    // iPhone: the app on the Home Screen keeps its own records — they can come along.
    const s = this.hooks.settings;
    const played = Object.values(s.records).some((r) => r && r.wins + r.losses > 0) || s.feats.length > 0;
    let note = g.note;
    if (a === 'ios-add' && played) {
      note = 'The app keeps its own records. To bring yours: copy your progress now, then paste it in the app’s Settings.';
      const copy = this.button('Copy my progress', '', () => {
        void copyText(exportProgress(s)).then((ok) => (copy.querySelector('span')!.textContent = ok ? 'Progress copied' : 'Copy failed'));
      });
      actions.push(copy);
    }
    actions.push(this.button('Not now', 'ghost', () => this.close()));
    this.show({ ...g, note }, actions);
    this.showing = () => this.open();
  }

  private button(label: string, cls: string, fn: () => void): HTMLButtonElement {
    const b = h('button', { class: `mbtn ${cls}`.trim() }, h('span', { text: label })) as HTMLButtonElement;
    onTap(b, () => {
      this.hooks.sound('click');
      fn();
    });
    return b;
  }

  private show(g: Guide, actions: HTMLElement[]): void {
    this.close(true);
    const steps = g.steps.length
      ? h('ol', { class: 'isteps' }, ...g.steps.map((st, i) => h('li', null, h('span', { class: 'inum', text: String(i + 1) }), h('i', { class: 'ipic', html: pic(st.pic) }), h('span', { text: st.text }))))
      : null;
    const qr = this.advice === 'qr' && g.title === 'Play on your phone' ? h('div', { class: 'iqr', role: 'img', 'aria-label': 'QR code to the game' }) : null;
    if (qr) {
      const target = this.situation.lan ? location.href : PUBLIC_URL;
      void qrSvg(target).then((svg) => (qr.innerHTML = svg));
    }
    const card = h(
      'div',
      { class: 'isheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': g.title },
      h('div', { class: 'igrab', 'aria-hidden': 'true' }),
      h('div', { class: 'ibody' }, h('h3', { text: g.title }), h('p', { class: 'ilead', text: g.lead }), qr, steps, g.note ? h('p', { class: 'inote', text: g.note }) : null),
      h('div', { class: 'iactions' }, ...actions),
    );
    const back = h('div', { class: 'isheetback' }, card);
    onTap(back, (e) => {
      if (e.target === back) this.close();
    });
    this.swipeToClose(card);
    // (On the page, not the stage: upright like the browser whose buttons it shows — the stage
    // is turned on an upright phone.)
    document.body.appendChild(back);
    this.sheet = back;
    this.hooks.opened();
    requestAnimationFrame(() => back.classList.add('show'));
    // (Room under the buttons for an arrow at the bottom edge.)
    if (this.showArrow(g.spot)?.startsWith('bottom')) card.classList.add('arrowbelow');
    (card.querySelector('.mbtn.primary') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** Closes the sheet; false if none was open. */
  close(instant = false): boolean {
    const back = this.sheet;
    if (!back) return false;
    this.sheet = null;
    this.showing = null;
    this.arrow?.remove();
    this.arrow = null;
    if (instant) back.remove();
    else {
      back.classList.remove('show');
      setTimeout(() => back.remove(), 260);
    }
    return true;
  }

  /** A sheet follows the finger down and goes when let go far enough (or flicked). */
  private swipeToClose(card: HTMLElement): void {
    let start: { id: number; y: number; t: number } | null = null;
    let dy = 0;
    const body = () => card.querySelector<HTMLElement>('.ibody')!;
    card.addEventListener('pointerdown', (e) => {
      // (Not from inside the steps while they are scrolled: that drag scrolls them back up.)
      if (e.pointerType === 'mouse' || (body().contains(e.target as Node) && body().scrollTop > 0)) return;
      start = { id: e.pointerId, y: e.clientY, t: performance.now() };
      dy = 0;
    });
    card.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      dy = Math.max(0, e.clientY - start.y);
      if (dy > 6) {
        card.style.transition = 'none';
        card.style.transform = `translateY(${dy}px)`;
      }
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const fast = dy / Math.max(1, performance.now() - start.t) > 0.6;
      start = null;
      card.style.transition = '';
      card.style.transform = '';
      if (dy > Math.min(140, card.offsetHeight * 0.35) || (fast && dy > 40)) this.close();
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  /**
   * An arrow at the screen's edge, pointing at the browser button of the first step. Drawn in
   * the screen's own orientation (outside the turned stage): the browser's bars don't turn.
   */
  private showArrow(spot: Guide['spot']): Spot {
    const where = sideways() ? spot.landscape : spot.portrait;
    if (!where) return null;
    const a = h('div', { class: `iarrow ${where}`, 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M12 3v16M5 12l7 7 7-7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    document.body.appendChild(a);
    this.arrow = a;
    return where;
  }
}
