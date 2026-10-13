/** Tiny DOM builder. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> | null = null,
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'text') el.textContent = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Sets textContent only when it changed (avoids layout churn in per-frame updates). */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function toggle(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function setStyle(el: HTMLElement, prop: string, value: string): void {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

export function fmt(n: number): string {
  const v = Math.floor(n);
  if (v >= 100000) return `${Math.round(v / 1000)}k`;
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Tap/click handler driven by pointer events, so buttons also work during multi-touch
 * (browsers do not synthesize `click` for a second finger). Keyboard activation
 * (Enter/Space → click with detail 0) still works.
 */
export function onTap(el: HTMLElement, fn: (e: Event) => void): void {
  let down: { id: number; x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
    fn(e);
  });
  el.addEventListener('pointercancel', () => (down = null));
  el.addEventListener('click', (e) => {
    if ((e as MouseEvent).detail === 0) fn(e);
  });
}

/**
 * Copies `text` to the clipboard; resolves whether it worked. The Clipboard API exists only in
 * secure contexts (https, localhost) — a game opened at its LAN address (http://192.168…) has
 * none, so there the old way: a hidden text area, selected, `execCommand('copy')`. Call it from
 * the tap's own handler (browsers allow copying only in answer to the player).
 */
export function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  } catch {
    // (fall through to the old way)
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  const before = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  // (Off to the side, not display:none — hidden text can't be selected; 16 px: iOS doesn't zoom.)
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;font-size:16px;';
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length); // (iOS selects nothing with select() alone)
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  before?.focus?.({ preventScroll: true });
  return ok;
}
