/* Paleidiklio service worker — kad atsidarytų ir be interneto */
const V = 'launcher-v1';
self.addEventListener('install', e => e.waitUntil(
  caches.open(V).then(c => c.addAll(['./', './index.html', './manifest.json',
    './icons/icon-192.png'])).catch(() => {}).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k !== V && k.startsWith('launcher')).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
