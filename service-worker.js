const CACHE = 'wolfpack-vb-v1';
const ASSETS = ['./','./index.html','./site.webmanifest','./logo-192.png','./logo-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(caches.match(event.request).then((c) => c || fetch(event.request)));
  }
});
