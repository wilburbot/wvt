const CACHE_VERSION = 'wolfpack-cache-v2';
const ASSETS = [
  './index.html',
  './logo-16.png',
  './logo-32.png',
  './logo-192.png',
  './logo-512.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './site.webmanifest'
];

self.addEventListener('install', e => {
  self.skipWaiting(); // take over from the previous service worker right away
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // The app shell (index.html / a navigation) goes network-first: whoever
  // has a connection always gets today's version, and only falls back to
  // the cached copy when actually offline. A fixed cache-first policy here
  // was the bug — once a browser cached index.html once, it would keep
  // serving that exact copy forever, even after new versions were deployed,
  // because nothing ever asked the network again.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match(e.request).then(resp => resp || caches.match('./index.html')))
    );
    return;
  }
  // Static assets (logos, manifest) change rarely, so cache-first is fine
  // there and keeps things fast/offline-friendly.
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});
