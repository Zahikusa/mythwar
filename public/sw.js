// Offline support: network-first for the page, cache-first for hashed assets.
const CACHE = 'mythwar-v3';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon.svg', './icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

/** Stores a fresh copy of the page and drops bundles of earlier builds it no longer references. */
async function storePage(res) {
  const c = await caches.open(CACHE);
  const html = await res.clone().text();
  await c.put('./', res);
  for (const key of await c.keys()) {
    const path = new URL(key.url).pathname;
    const i = path.lastIndexOf('/assets/');
    if (i >= 0 && !html.includes(path.slice(i + 1))) await c.delete(key);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) e.waitUntil(storePage(res.clone()).catch(() => {}));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
