import { describe, expect, it } from 'vitest';
import { advise, detect } from '../src/platform.ts';
import { guideFor } from '../src/ui/install.ts';

const at = (ua: string, more = {}) => detect({ ua, touchPoints: 5, secure: true, hostname: 'zahikusa.github.io', ...more });
const SAFARI_26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const SAFARI_18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.3.18.85 (iPhone15,3; iOS 17_4; en_US; en; scale=3.00; 1290x2796; 597327428)';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const TELEGRAM = 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 Telegram-Android/10.12.0 (Samsung SM-S911B; Android 14; SDK 34; AVERAGE)';

const text = (g: ReturnType<typeof guideFor>) => [g!.title, g!.lead, ...g!.steps.map((s) => s.text), g!.note ?? ''].join(' | ');

describe('guideFor: the steps for this browser', () => {
  it('iOS 26 Safari: ⋯ → Share → Add to Home Screen → Open as Web App, the arrow at the ⋯', () => {
    const s = at(SAFARI_26);
    const g = guideFor(s, advise(s, false))!;
    expect(text(g)).toMatch(/⋯.*Share.*Add to Home Screen.*Open as Web App/);
    expect(g.spot.portrait).toBe('bottom-right');
  });
  it('older Safari: the Share icon in the toolbar, the arrow at the bottom', () => {
    const s = at(SAFARI_18);
    const g = guideFor(s, advise(s, false))!;
    expect(g.steps[0].pic).toBe('share');
    expect(text(g)).not.toMatch(/Open as Web App/);
    expect(g.spot.portrait).toBe('bottom');
  });
  it('Chrome on iPhone: Share in its address bar', () => {
    const s = at(IOS_CHROME);
    expect(text(guideFor(s, advise(s, false)))).toMatch(/Share in the address bar/);
  });
  it('an app’s browser: open it in the real browser, named after the app', () => {
    const s = at(INSTAGRAM);
    expect(text(guideFor(s, advise(s, false)))).toMatch(/Instagram.*Safari/);
    const t = at(TELEGRAM);
    expect(text(guideFor(t, advise(t, false)))).toMatch(/Telegram.*Chrome/);
  });
  it('each app browser in its own words', () => {
    const ig = at(INSTAGRAM);
    expect(text(guideFor(ig, advise(ig, false)))).toMatch(/⋯ \(top right\).*Open in external browser/);
    const tg = at(TELEGRAM);
    const t = guideFor(tg, advise(tg, false))!;
    expect(t.steps[0].text).toMatch(/Open in Chrome below/);
    expect(text(t)).toMatch(/Or: tap the menu ⋮.*Open in Chrome/);
  });
  it('Samsung Internet: its own menu', () => {
    const s = at(SAMSUNG);
    expect(text(guideFor(s, advise(s, false)))).toMatch(/≡.*Add page to/);
  });
  it('the LAN page says where the app comes from', () => {
    const s = at(SAMSUNG, { hostname: '192.168.1.20', secure: false });
    expect(guideFor(s, 'lan')!.note).toMatch(/zahikusa\.github\.io\/mythwar/);
  });
  it('a computer with an install dialog clicks, and gets a window (not a home screen)', () => {
    const s = detect({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', touchPoints: 0, secure: true, hostname: 'zahikusa.github.io' });
    const t = text(guideFor(s, advise(s, true)));
    expect(t).toMatch(/Click Install app.*own window/);
    expect(t).not.toMatch(/Tap|home screen/i);
  });
  it('every offer has words (and nothing is offered once installed)', () => {
    for (const a of ['escape', 'ios-add', 'ios-safari', 'install', 'android-menu', 'qr', 'lan'] as const) expect(guideFor(at(SAMSUNG), a)?.title).toBeTruthy();
    expect(guideFor(at(SAMSUNG), 'none')).toBeNull();
  });
});
