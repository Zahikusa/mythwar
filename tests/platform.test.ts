import { describe, expect, it } from 'vitest';
import { advise, detect } from '../src/platform.ts';
import type { Environment } from '../src/platform.ts';

// Real user-agent strings, as each browser sends them.
const UA = {
  iosSafari18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  // Safari 26 freezes the OS token at 18_6; Version/ carries the real one.
  iosSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  // An iPad asking for desktop sites (the default): a Mac, but with a touch screen.
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iosChromeOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/108.0.5359.112 Mobile/15E148 Safari/604.1',
  iosEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.56 Mobile/15E148 Safari/605.1.15',
  iosFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iosInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.3.18.85 (iPhone15,3; iOS 17_4; en_US; en; scale=3.00; 1290x2796; 597327428)',
  iosFacebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/459.0.0.40.104;FBBV/602318104;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]',
  iosSnapchat: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/12.80.0.40 (like Safari/8617.2.4.10.8, panda)',
  iosLinkedIn: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.6150',
  iosTikTok: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_33.8.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US',
  iosGoogleApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/313.0.624182448 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidEdge: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  androidInstagram: 'Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/121.0.6167.178 Mobile Safari/537.36 Instagram 319.0.0.43.110 Android (33/13; 480dpi; 1080x2340; samsung; SM-S911B; dm1q; qcom; en_US; 567067392)',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.105 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0.0.43.109;]',
  androidMessenger: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.105 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/447.0.0.27.105;]',
  androidTelegram: 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 Telegram-Android/10.12.0 (Samsung SM-S911B; Android 14; SDK 34; AVERAGE)',
  androidWhatsApp: 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 WhatsApp/2.24.2.76',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.105 Mobile Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

const at = (ua: string, more: Partial<Environment> = {}) => detect({ ua, touchPoints: /iPhone|iPad|Android/.test(ua) ? 5 : 0, secure: true, hostname: 'zahikusa.github.io', ...more });

describe('detect: where the game runs', () => {
  it('knows iPhone Safari and its version — Safari 26 too, despite the frozen OS token', () => {
    expect(at(UA.iosSafari18)).toMatchObject({ os: 'ios', browser: 'safari', inApp: null, tablet: false, ios: 18.05 });
    expect(at(UA.iosSafari26)).toMatchObject({ os: 'ios', browser: 'safari', ios: 26 });
  });
  it('knows an iPad, also when it calls itself a Mac — and a real Mac is a computer', () => {
    expect(at(UA.ipadSafari)).toMatchObject({ os: 'ios', tablet: true, browser: 'safari' });
    expect(at(UA.ipadAsMac, { touchPoints: 5 })).toMatchObject({ os: 'ios', tablet: true, browser: 'safari', ios: 18.05 });
    expect(at(UA.macSafari, { touchPoints: 0 })).toMatchObject({ os: 'desktop', browser: 'safari' });
  });
  it('tells the other iPhone browsers apart', () => {
    expect(at(UA.iosChrome)).toMatchObject({ os: 'ios', browser: 'chrome', inApp: null, ios: 17.05 });
    expect(at(UA.iosEdge)).toMatchObject({ os: 'ios', browser: 'edge', inApp: null });
    expect(at(UA.iosFirefox)).toMatchObject({ os: 'ios', browser: 'firefox', inApp: null });
  });
  it('spots the built-in browsers of apps', () => {
    expect(at(UA.iosInstagram).inApp).toBe('instagram');
    expect(at(UA.iosFacebook).inApp).toBe('facebook');
    expect(at(UA.iosSnapchat).inApp).toBe('snapchat');
    expect(at(UA.iosLinkedIn).inApp).toBe('linkedin');
    expect(at(UA.iosTikTok).inApp).toBe('tiktok');
    expect(at(UA.iosGoogleApp).inApp).toBe('google');
    expect(at(UA.androidInstagram)).toMatchObject({ os: 'android', inApp: 'instagram' });
    expect(at(UA.androidFacebook).inApp).toBe('facebook');
    expect(at(UA.androidMessenger).inApp).toBe('messenger');
    expect(at(UA.androidTelegram).inApp).toBe('telegram');
    expect(at(UA.androidWhatsApp).inApp).toBe('whatsapp');
    expect(at(UA.androidWebView).inApp).toBe('webview');
  });
  it('tells the Android browsers apart', () => {
    expect(at(UA.androidChrome)).toMatchObject({ os: 'android', browser: 'chrome', inApp: null, tablet: false });
    expect(at(UA.androidTablet)).toMatchObject({ os: 'android', tablet: true });
    expect(at(UA.androidSamsung).browser).toBe('samsung');
    expect(at(UA.androidEdge).browser).toBe('edge');
    expect(at(UA.androidFirefox)).toMatchObject({ os: 'android', browser: 'firefox' });
  });
  it('knows computers', () => {
    expect(at(UA.winChrome)).toMatchObject({ os: 'desktop', browser: 'chrome' });
    expect(at(UA.winEdge)).toMatchObject({ os: 'desktop', browser: 'edge' });
    expect(at(UA.linuxFirefox)).toMatchObject({ os: 'desktop', browser: 'firefox' });
  });
  it('knows the LAN game server from the public address and from a dev machine', () => {
    expect(at(UA.androidChrome, { hostname: '192.168.1.20', secure: false }).lan).toBe(true);
    expect(at(UA.androidChrome, { hostname: '10.0.0.5', secure: false }).lan).toBe(true);
    expect(at(UA.androidChrome, { hostname: 'mypc.local', secure: false }).lan).toBe(true);
    expect(at(UA.androidChrome).lan).toBe(false);
    expect(at(UA.winChrome, { hostname: 'localhost', secure: true }).lan).toBe(false);
  });
});

describe('advise: the one next step', () => {
  it('offers nothing once installed', () => {
    for (const ua of Object.values(UA)) expect(advise(at(ua, { standalone: true }), true)).toBe('none');
  });
  it('sends an app’s built-in browser out to the real one first', () => {
    for (const ua of [UA.iosInstagram, UA.iosFacebook, UA.androidTelegram, UA.androidWhatsApp, UA.androidWebView]) expect(advise(at(ua), false)).toBe('escape');
  });
  it('shows iPhone steps where they work, and Safari where they don’t (before iOS 16.4)', () => {
    expect(advise(at(UA.iosSafari26), false)).toBe('ios-add');
    expect(advise(at(UA.iosSafari18), false)).toBe('ios-add');
    expect(advise(at(UA.iosChrome), false)).toBe('ios-add');
    expect(advise(at(UA.iosEdge), false)).toBe('ios-add');
    expect(advise(at(UA.iosFirefox), false)).toBe('ios-add');
    expect(advise(at(UA.iosChromeOld), false)).toBe('ios-safari');
  });
  it('uses the real install dialog when the browser has one, else the menu', () => {
    expect(advise(at(UA.androidChrome), true)).toBe('install');
    expect(advise(at(UA.androidChrome), false)).toBe('android-menu');
    expect(advise(at(UA.androidFirefox), false)).toBe('android-menu');
    expect(advise(at(UA.winChrome), true)).toBe('install');
  });
  it('shows a computer the QR code to the phone', () => {
    expect(advise(at(UA.winChrome), false)).toBe('qr');
    expect(advise(at(UA.macSafari), false)).toBe('qr');
  });
  it('doesn’t push installing the LAN server’s page', () => {
    expect(advise(at(UA.androidChrome, { hostname: '192.168.1.20', secure: false }), false)).toBe('lan');
    expect(advise(at(UA.iosSafari18, { hostname: '192.168.1.20', secure: false }), false)).toBe('lan');
  });
});
