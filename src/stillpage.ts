/**
 * The page itself never moves (a game, not a website): no rubber-band bounce, no pull-to-refresh,
 * no zoom, no callout or text selection on a long press. Only panels with more than they show
 * scroll — inside themselves — and text fields work as text fields.
 * (CSS does most of it — see style.css; this covers what CSS can't on iPhone Safari.)
 */

/** A text field: the one place a touch may select, zoom never happens (16-px text). */
function typing(el: EventTarget | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/** Whether a touch on `t` may pan: it is in a panel that has more to scroll to, or on a field. */
function pannable(t: EventTarget | null): boolean {
  for (let el = t instanceof Element ? t : null; el && el !== document.body; el = el.parentElement) {
    if (typing(el)) return true;
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) return true;
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}

export function holdPageStill(): void {
  // iOS Safari ignores user-scalable=no: block its pinch/rotate gestures and double-tap zoom.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now();
      // (Not while the page is scrolling: that touchend can't be cancelled — the browser says so.)
      if (now - lastTouchEnd < 300 && e.cancelable && !typing(e.target)) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  // A drag that didn't start in a panel with room to scroll moves nothing: without this, iPhone
  // Safari bounces the whole page under the finger (touch-action alone doesn't stop it there).
  let free = false;
  document.addEventListener(
    'touchstart',
    (e) => {
      free = e.touches.length === 1 && pannable(e.target);
    },
    { passive: true, capture: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if ((!free || e.touches.length > 1) && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );

  // A long press shows no "Copy / Look up / Save image" menu on a phone (desktop keeps its
  // right-click menu; text fields keep theirs).
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (coarse) document.addEventListener('contextmenu', (e) => !typing(e.target) && e.preventDefault());

  // The page has nowhere to scroll to — but iOS scrolls it anyway to bring a focused field above
  // the keyboard, and sometimes leaves it there once the keyboard is gone. Back to the top as soon
  // as nobody is typing.
  const settle = () => {
    if (!typing(document.activeElement) && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
  };
  window.addEventListener('scroll', settle, { passive: true });
  document.addEventListener('focusout', () => setTimeout(settle, 60));
}
