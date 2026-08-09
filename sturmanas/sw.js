/* Šturmanas · service worker — veikia ir be interneto (išskyrus žemėlapio plyteles) */
const V = 'sturmanas-v3';
const SHELL = [
  './', './index.html', './manifest.json',
  './js/app.js', './js/core.js', './js/router.js', './js/ratas.js', './js/debesis.js',
  './data/roads.json', './data/graph.json', './data/best.json',
  './data/places.json', './data/tours.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { mode: 'no-cors' }))))
    .catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Paskyros ir rezultatai — visada gyvai (talpinti prisijungimą būtų klaida)
  if (url.hostname.endsWith('.supabase.co') || e.request.method !== 'GET') return;
  // žemėlapio plytelės — iš tinklo, bet talpinam paskutines
  if (url.hostname.includes('basemaps.cartocdn.com')) {
    e.respondWith(
      caches.open('tiles').then(async c => {
        const hit = await c.match(e.request);
        const net = fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      }));
    return;
  }
  // viskas kita — pirma talpykla (app veikia be ryšio)
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    if (r.ok && e.request.method === 'GET' && url.origin === location.origin) {
      const cl = r.clone(); caches.open(V).then(c => c.put(e.request, cl));
    }
    return r;
  }).catch(() => hit)));
});
