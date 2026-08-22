/* Lapas — service worker.
 * Viskas iš talpyklos: app'as turi veiktų lėktuvo režimu ir po metų be interneto.
 * Tinklas naudojamas tik naujesnei versijai parsisiųsti fone.
 */

const V = 'lapas-v1';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.json',
  './js/app.js', './js/cycle.js', './js/db.js', './js/crypto.js',
  './js/i18n.js', './js/catalog.js', './js/transfer.js',
  './js/ui/dom.js', './js/ui/today.js', './js/ui/calendar.js',
  './js/ui/insights.js', './js/ui/settings.js', './js/ui/log.js',
  './js/ui/lock.js', './js/ui/onboarding.js', './js/ui/qr.js',
  './lib/qrcode-generator.js', './lib/jsqr.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V)
    .then(c => c.addAll(ASSETS))
    .catch(() => {})
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V && k.startsWith('lapas-')).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      // šviežinam fone, bet atsakom iškart iš talpyklos
      const net = fetch(req).then(res => {
        if (res.ok) caches.open(V).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
