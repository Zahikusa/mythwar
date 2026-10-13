/**
 * Where the game is running, and the one best next step for the player there (TASK goal C):
 * already installed, an iPhone/iPad browser (Safari, or Chrome/Edge/Firefox — they can add to the
 * Home Screen since iOS 16.4), an Android browser, a computer, or an app's built-in browser
 * (WhatsApp, Instagram, …) where nothing can be installed. Pure functions of what the browser
 * says about itself, so they are tested with real user-agent strings (tests/platform.test.ts).
 */

export type Os = 'ios' | 'android' | 'desktop';
export type Browser = 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'opera' | 'other';
/** Apps whose built-in browser opens shared links. */
export type InApp = 'whatsapp' | 'instagram' | 'facebook' | 'messenger' | 'telegram' | 'snapchat' | 'linkedin' | 'tiktok' | 'x' | 'line' | 'wechat' | 'pinterest' | 'google' | 'webview';

export interface Situation {
  os: Os;
  /** iPad (also when it asks for desktop sites and calls itself a Mac). */
  tablet: boolean;
  /** iOS version as major + minor / 100 (16.4 → 16.04; Safari 26's frozen "iPhone OS 18_6" corrected
   * by its Version/26), else 0. */
  ios: number;
  browser: Browser;
  inApp: InApp | null;
  /** Running from the home screen / as an installed app already. */
  installed: boolean;
  /** A secure context (https or localhost): a service worker, offline play, Android's install. */
  secure: boolean;
  /** Served by a LAN game server (http://192.168…): another origin than the public game's. */
  lan: boolean;
}

export interface Environment {
  ua: string;
  /** `navigator.maxTouchPoints` (an iPad asking for desktop sites says "Macintosh"). */
  touchPoints?: number;
  /** `display-mode: standalone | fullscreen | minimal-ui` matches, or iOS's `navigator.standalone`. */
  standalone?: boolean;
  secure?: boolean;
  hostname?: string;
}

const IN_APP: [RegExp, InApp][] = [
  [/WhatsApp/i, 'whatsapp'],
  [/Instagram/i, 'instagram'],
  [/FBAN\/Messenger|MessengerForiOS|Orca-Android|FB_IAB\/MESSENGER/i, 'messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/, 'facebook'],
  [/Telegram/i, 'telegram'],
  [/Snapchat/i, 'snapchat'],
  [/LinkedInApp/i, 'linkedin'],
  [/musical_ly|BytedanceWebview|TikTok|ByteLocale/i, 'tiktok'],
  [/Twitter|TwitterAndroid/i, 'x'],
  [/\bLine\//, 'line'],
  [/MicroMessenger/i, 'wechat'],
  [/Pinterest/i, 'pinterest'],
  [/\bGSA\//, 'google'],
];

/** A private-network address (the LAN game server) — not localhost, which is a dev machine. */
function isLanHost(host: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) || /\.local$/i.test(host) || /^\[?f[cd][0-9a-f]{2}:/i.test(host);
}

export function detect(env: Environment): Situation {
  const ua = env.ua;
  const ipadDesktop = /Macintosh/.test(ua) && (env.touchPoints ?? 0) > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || ipadDesktop;
  const android = !ios && /Android/i.test(ua);
  const os: Os = ios ? 'ios' : android ? 'android' : 'desktop';
  let inApp: InApp | null = null;
  for (const [re, app] of IN_APP) if (re.test(ua)) {
    inApp = app;
    break;
  }
  // An Android WebView ("; wv)") or an iOS page without "Safari/" in it: some app's browser.
  if (!inApp && android && /;\s*wv\)/.test(ua)) inApp = 'webview';
  if (!inApp && ios && !ipadDesktop && !/Safari\//.test(ua)) inApp = 'webview';
  let browser: Browser = 'other';
  if (ios) {
    browser = /CriOS/.test(ua) ? 'chrome' : /EdgiOS/.test(ua) ? 'edge' : /FxiOS/.test(ua) ? 'firefox' : /OPiOS|OPT\//.test(ua) ? 'opera' : /Version\/[\d.]+.*Safari\//.test(ua) || ipadDesktop ? 'safari' : 'other';
  } else {
    browser = /SamsungBrowser/.test(ua)
      ? 'samsung'
      : /EdgA?\//.test(ua)
        ? 'edge'
        : /OPR\/|Opera/.test(ua)
          ? 'opera'
          : /Firefox\//.test(ua)
            ? 'firefox'
            : /Chrome\//.test(ua)
              ? 'chrome'
              : /Version\/[\d.]+.*Safari\//.test(ua)
                ? 'safari'
                : 'other';
  }
  let iosVersion = 0;
  if (ios) {
    const osv = /OS (\d+)_(\d+)/.exec(ua);
    iosVersion = osv ? Number(osv[1]) + Number(osv[2]) / 100 : 0;
    // Safari 26 freezes the OS token at 18_6 (and an iPad as a Mac has none): its own version
    // follows the system's.
    const sv = /Version\/(\d+)(?:\.(\d+))?/.exec(ua);
    const safariV = sv ? Number(sv[1]) + Number(sv[2] ?? 0) / 100 : 0;
    if (browser === 'safari' && sv && (safariV > iosVersion || ipadDesktop)) iosVersion = safariV;
  }
  const host = env.hostname ?? '';
  return {
    os,
    tablet: ios ? /iPad/.test(ua) || ipadDesktop : android && !/Mobile/.test(ua),
    ios: iosVersion,
    browser,
    inApp,
    installed: !!env.standalone,
    secure: env.secure ?? true,
    lan: isLanHost(host) || (env.secure === false && host !== 'localhost' && host !== '127.0.0.1' && host !== ''),
  };
}

/**
 * The one right next step:
 * - `none`: installed already — nothing to offer.
 * - `escape`: an app's built-in browser — open the game in the real browser first.
 * - `ios-add`: an iPhone/iPad browser that can add to the Home Screen (Safari; others on 16.4+).
 * - `ios-safari`: an iPhone browser that can't (older iOS): open the game in Safari.
 * - `install`: the browser's own install dialog is ready (`beforeinstallprompt`).
 * - `android-menu`: Android without that dialog — the browser menu's steps, and fullscreen.
 * - `qr`: a computer — play on the phone: a QR code to the game.
 * - `lan`: the LAN server's page — play in the tab (fullscreen on Android); the app comes from
 *   the public address.
 */
export type Advice = 'none' | 'escape' | 'ios-add' | 'ios-safari' | 'install' | 'android-menu' | 'qr' | 'lan';

export function advise(s: Situation, canPrompt: boolean): Advice {
  if (s.installed) return 'none';
  if (s.inApp) return 'escape';
  if (s.lan) return 'lan';
  if (canPrompt && s.os !== 'ios') return 'install';
  // (Other iPhone browsers reach "Add to Home Screen" through the share sheet since iOS 16.4.)
  if (s.os === 'ios') return s.browser === 'safari' || ((s.browser === 'chrome' || s.browser === 'edge' || s.browser === 'firefox') && s.ios >= 16.04) ? 'ios-add' : 'ios-safari';
  if (s.os === 'android') return 'android-menu';
  return 'qr';
}

/** What this page knows about itself (the live browser). */
export function currentSituation(): Situation {
  const mm = (q: string) => typeof matchMedia !== 'undefined' && matchMedia(q).matches;
  const standalone = mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || mm('(display-mode: minimal-ui)') || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // (?lanpreview: as on a LAN game server's page — scripts/mobilecheck.ts shoots it.)
  const lan = new URLSearchParams(location.search).has('lanpreview');
  return detect({ ua: navigator.userAgent, touchPoints: navigator.maxTouchPoints, standalone, secure: lan ? false : window.isSecureContext, hostname: lan ? '192.168.1.20' : location.hostname });
}
