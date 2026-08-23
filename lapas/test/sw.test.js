/* Service worker testai.
 * SW registracijos naršyklėje automatiškai patikrinti negalime, todėl failas
 * paleidžiamas su suklastotu `self` ir tikrinamas jo elgesys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Paleidžia sw.js izoliuotai ir grąžina užregistruotus klausytojus. */
function loadSW() {
  const src = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listeners = {};
  const cacheStore = new Map();
  const self = {
    addEventListener: (ev, fn) => { (listeners[ev] ||= []).push(fn); },
    skipWaiting: () => { self._skipped = true; },
    clients: { claim: async () => { self._claimed = true; } },
    _skipped: false, _claimed: false,
  };
  const caches = {
    open: async name => ({
      addAll: async urls => cacheStore.set(name, urls),
      put: async () => {},
      keys: async () => (cacheStore.get(name) || []).map(u => ({ url: u })),
    }),
    keys: async () => [...cacheStore.keys()],
    delete: async k => cacheStore.delete(k),
    match: async () => undefined,
  };
  new Function('self', 'caches', 'location', 'fetch', src)(
    self, caches, { origin: 'http://x' }, async () => ({ ok: true, clone: () => ({}) }));
  return { self, listeners, cacheStore };
}

test('service worker užsikrauna ir užregistruoja visus klausytojus', () => {
  const { listeners } = loadSW();
  for (const ev of ['install', 'activate', 'fetch', 'message'])
    assert.ok(listeners[ev]?.length, `trūksta „${ev}" klausytojo`);
});

test('naujas kodas nepradeda veikti be vartotojos sutikimo', async () => {
  const { self, listeners } = loadSW();
  const waits = [];
  await listeners.install[0]({ waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  assert.equal(self._skipped, false,
    'install neturi kviesti skipWaiting — kodas pasikeistų vidury žymėjimo');

  // ...bet paprašius — pradeda
  listeners.message[0]({ data: { type: 'SKIP_WAITING' } });
  assert.equal(self._skipped, true);
});

test('svetimas pranešimas neperjungia versijos', () => {
  const { self, listeners } = loadSW();
  listeners.message[0]({ data: { type: 'KAŽKAS_KITA' } });
  listeners.message[0]({});
  listeners.message[0]({ data: null });
  assert.equal(self._skipped, false);
});

test('įdiegimas sudeda į talpyklą visus modulius ir pagrindinius failus', async () => {
  const { listeners, cacheStore } = loadSW();
  const waits = [];
  await listeners.install[0]({ waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  const urls = [...cacheStore.values()][0] || [];
  for (const must of ['./index.html', './styles.css', './js/app.js', './js/predict.js',
                      './js/sanitize.js', './lib/jsqr.js'])
    assert.ok(urls.includes(must), `talpykloje trūksta ${must}`);
});

test('aktyvavus išvalomos tik senos ŠIO app’o talpyklos', async () => {
  const { self, listeners, cacheStore } = loadSW();
  cacheStore.set('lapas-v1', []);
  cacheStore.set('kito-app-cache', []);
  const waits = [];
  await listeners.install[0]({ waitUntil: p => waits.push(p) });
  await Promise.all(waits);
  const w2 = [];
  await listeners.activate[0]({ waitUntil: p => w2.push(p) });
  await Promise.all(w2);
  assert.ok(!cacheStore.has('lapas-v1'), 'sena versija turi būti pašalinta');
  assert.ok(cacheStore.has('kito-app-cache'), 'svetimų talpyklų neliečiam');
  assert.equal(self._claimed, true);
});
