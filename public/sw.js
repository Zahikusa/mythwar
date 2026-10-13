// Offline support: cache-first for hashed build assets (they never change), network-first for
// everything else — the page, the manifest, icons — so an update reaches installed copies too.
const CACHE = 'mythwar-v4';
/** How long a page load waits for the network before the saved copy is shown (ms). */
const NAV_WAIT = 4000;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon.svg', './icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

/** "index-C8zgltL0.js" → "index.js": a bundle's name without its content hash. */
const stem = (file) => file.replace(/-[A-Za-z0-9_-]{8}(\.[a-z0-9]+)$/, '$1');

/**
 * Stores a fresh copy of the page and drops older builds of the bundles it references (same
 * name, other hash). Chunks the page loads lazily (not named in it) are left alone.
 */
async function storePage(res) {
  const c = await caches.open(CACHE);
  const html = await res.clone().text();
  await c.put('./', res);
  const current = new Set([...html.matchAll(/assets\/([^"'?#\s]+)/g)].map((m) => m[1]));
  const stems = new Set([...current].map(stem));
  for (const key of await c.keys()) {
    const path = new URL(key.url).pathname;
    const i = path.lastIndexOf('/assets/');
    if (i < 0) continue;
    const file = path.slice(i + 8);
    if (!current.has(file) && stems.has(stem(file))) await c.delete(key);
  }
}

/** Drops cached builds of `path`'s bundle other than this one ("qrcode-OLD.js" for "qrcode-NEW.js"). */
async function dropOlder(path) {
  const c = await caches.open(CACHE);
  const file = path.slice(path.lastIndexOf('/assets/') + 8);
  for (const key of await c.keys()) {
    const p = new URL(key.url).pathname;
    const i = p.lastIndexOf('/assets/');
    if (i < 0) continue;
    const other = p.slice(i + 8);
    if (other !== file && stem(other) === stem(file)) await c.delete(key);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    let stored = Promise.resolve();
    const net = fetch(req).then((res) => {
      if (res.ok) stored = storePage(res.clone()).catch(() => {});
      return res;
    });
    e.waitUntil(net.then(() => stored, () => {}));
    // The network first — but a server that's gone while the Wi-Fi is up doesn't fail, it hangs
    // (a phone waits tens of seconds for the timeout): after NAV_WAIT the saved page is shown.
    e.respondWith(
      new Promise((resolve) => {
        let done = false;
        const answer = (res) => {
          if (done || !res) return;
          done = true;
          clearTimeout(timer);
          resolve(res);
        };
        const timer = setTimeout(() => caches.match('./').then(answer), NAV_WAIT);
        net.then(answer, () => caches.match('./').then((hit) => answer(hit || Response.error())));
      }),
    );
    return;
  }
  const store = (res) => {
    if (res.ok) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
    }
    return res;
  };
  // ("index-C8zgltL0.js": a content hash in the name — that exact file never changes.)
  const path = new URL(req.url).pathname;
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/.test(path)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // A newer build of a chunk the page loads lazily (named nowhere in it, so storePage
            // can't tell): the older copies of the same name go.
            if (res.ok) e.waitUntil(dropOlder(path).catch(() => {}));
            return store(res);
          }),
      ),
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then(store)
      .catch(() => caches.match(req).then((hit) => hit || Response.error())),
  );
});
