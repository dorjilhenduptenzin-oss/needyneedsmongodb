// NeedyNeeds service worker
// Strategy:
//  - /api/*            -> never touched by the SW (always live network)
//  - navigations (HTML) -> network-first, fall back to cached shell offline
//  - hashed build assets -> cache-first (they are immutable, content-hashed)
// Bump CACHE_VERSION whenever this file changes so old caches are purged.
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `needy-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `needy-assets-${CACHE_VERSION}`;

// Best-effort precache of the app shell. Missing entries must not fail install.
const SHELL_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;      // let cross-origin go straight to network
  if (url.pathname.startsWith('/api/')) return;         // never cache API traffic

  // App navigations: network-first so a new deploy is picked up immediately.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match('/index.html') || await caches.match('/');
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  // Hashed static assets: cache-first, populate on first use.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const resp = await fetch(request);
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, resp.clone());
      }
      return resp;
    })());
    return;
  }

  // Everything else (fonts config, manifest, icons): stale-while-revalidate.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then((resp) => {
      if (resp && resp.status === 200 && resp.type === 'basic') {
        caches.open(ASSET_CACHE).then((cache) => cache.put(request, resp.clone()));
      }
      return resp;
    }).catch(() => cached);
    return cached || network;
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
  }
});
