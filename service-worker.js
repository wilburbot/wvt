self.addEventListener('install', e => {
  e.waitUntil(
    caches.open('wolfpack-cache').then(cache => {
      return cache.addAll([
        './index.html',
        './logo-192.png',
        './logo-512.png',
        './site.webmanifest'
      ]);
    })
  );
});
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});