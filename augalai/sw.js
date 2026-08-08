/* Service worker — offline app shell. Versiją keisk, kai atnaujini failus. */
const CACHE = 'zd-v1';
const ASSETS = [
  '.', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Orų/geokodavimo užklausos — visada iš tinklo (niekada necache'inam)
  if (url.hostname.endsWith('open-meteo.com')) return;

  // App shell: stale-while-revalidate
  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(resp => {
        if (resp.ok && url.origin === location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
