// FitFuel Pro — Service Worker v10
// Aggressive caching: everything goes in on install; serves fully offline thereafter.

const CACHE_NAME = 'fitfuel-v10';

const PRECACHE = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './sw.js',
];

const CDN = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.tailwindcss.com',
];

// ── Install: cache everything ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache local files — must succeed
    await cache.addAll(PRECACHE);
    // Cache CDN — best effort with retries
    await Promise.allSettled(
      CDN.map(async url => {
        try {
          const res = await fetch(url, { cache: 'force-cache' });
          if (res.ok) await cache.put(url, res);
        } catch {
          // Will try again on first fetch
        }
      })
    );
  })());
  // Take over immediately without waiting for old SW to die
  self.skipWaiting();
});

// ── Activate: clean old caches ───────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ── Fetch strategy ───────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // CDN resources: cache-first (these rarely change)
  const isCDN = CDN.some(c => url.startsWith(c.split('?')[0]));
  if (isCDN) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res && res.ok) {
            caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
          }
          return res;
        }).catch(() => caches.match(request));
      })
    );
    return;
  }

  // Local app files: cache-first with background refresh
  // This means: serve cache instantly (fast + offline), then update cache in background
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchAndUpdate = fetch(request).then(res => {
        if (res && res.ok) {
          caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
        }
        return res;
      }).catch(() => cached || caches.match('./index.html'));

      // Return cache immediately if available, otherwise wait for network
      return cached || fetchAndUpdate;
    })
  );
});
