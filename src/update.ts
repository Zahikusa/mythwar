/**
 * A newer build of the game on its server while this copy stays open — an installed app can run
 * for days without ever being reloaded. Checked when the game comes back to the foreground (at
 * most once a minute) and every quarter of an hour; `onReady` then offers a restart on the title
 * screen. Nothing reloads by itself: a running battle is never cut short. Returns a check that
 * runs at once (null where there's nothing to watch: a dev server, a file).
 */
export function watchForUpdate(onReady: () => void): (() => Promise<void>) | null {
  if (!import.meta.env.PROD || location.protocol === 'file:') return null;
  const mine = bundleOf(document.documentElement.outerHTML);
  if (!mine) return null;
  let found = false;
  let last = Date.now();
  const check = async (now = false) => {
    if (found || document.hidden || (!now && Date.now() - last < 60_000)) return;
    last = Date.now();
    try {
      const res = await fetch('./', { cache: 'no-store' });
      const theirs = res.ok ? bundleOf(await res.text()) : null;
      if (theirs && theirs !== mine) {
        found = true;
        onReady();
      }
    } catch {
      // Offline, or the LAN server is gone: nothing to offer.
    }
  };
  document.addEventListener('visibilitychange', () => void check());
  setInterval(() => void check(), 15 * 60_000);
  // (A check right now, for scripts/smoke.ts.)
  return () => check(true);
}

/** The page's main bundle ("index-C8zgltL0.js"): its name changes with every build. */
export function bundleOf(html: string): string | null {
  return /<script\b[^>]*\btype="module"[^>]*\bsrc="[^"]*assets\/([^"/]+\.js)"/.exec(html)?.[1] ?? null;
}
