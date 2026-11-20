const CACHE = 'personalhub-public-offline-v1';
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html'))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys =>
  Promise.all(keys.filter(key => key.startsWith('personalhub-public-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.mode === 'navigate' && request.method === 'GET' && url.origin === self.location.origin && url.pathname === '/') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
  }
});
