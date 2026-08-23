/* Kalbų vientisumas.
 * Su 24 kalbomis rankinė peržiūra nebeįmanoma, todėl viską tikrina testai:
 * ar niekur netrūksta eilutės, ar nesumaišyti kintamieji, ar Intl duoda
 * teisingas datas ir daugiskaitą kiekvienai kalbai.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as I from '../js/i18n.js';

const LANG_DIR = new URL('../js/lang/', import.meta.url);
const files = readdirSync(LANG_DIR).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));

async function dict(id) { return (await import(`../js/lang/${id}.js`)).default; }

test('anglų kalba yra visada — ji yra atsarga visoms kitoms', () => {
  assert.ok(files.includes('en'));
});

test('visos kalbos turi tuos pačius raktus kaip anglų', async () => {
  const en = await dict('en');
  const enKeys = Object.keys(en);
  for (const id of files) {
    if (id === 'en') continue;
    const d = await dict(id);
    const missing = enKeys.filter(k => !(k in d));
    const extra = Object.keys(d).filter(k => !(k in en));
    assert.deepEqual(missing, [], `${id}: trūksta ${missing.length} eilučių`);
    assert.deepEqual(extra, [], `${id}: perteklinės eilutės`);
  }
});

test('kintamieji {n}, {range} sutampa visose kalbose', async () => {
  const en = await dict('en');
  const varsOf = v => {
    const s = typeof v === 'string' ? v : Object.values(v || {}).join(' ');
    return [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
  };
  for (const id of files) {
    if (id === 'en') continue;
    const d = await dict(id);
    for (const [k, v] of Object.entries(en)) {
      const a = varsOf(v), b = varsOf(d[k]);
      assert.deepEqual(b, a, `${id}/${k}: kintamieji nesutampa (${b} vs ${a})`);
    }
  }
});

test('daugiskaitos formos atitinka kalbos taisykles', async () => {
  for (const id of files) {
    const d = await dict(id);
    const need = new Set([...new Intl.PluralRules(id).resolvedOptions().pluralCategories]);
    for (const key of ['n_cycles', 'n_days']) {
      const forms = d[key];
      assert.ok(forms && typeof forms === 'object', `${id}/${key}: turi būti formų objektas`);
      for (const rule of need)
        assert.ok(rule in forms, `${id}/${key}: trūksta „${rule}" formos`);
    }
  }
});

test('nė viena eilutė nėra tuščia ar palikta angliškai kopijuojant', async () => {
  const en = await dict('en');
  for (const id of files) {
    if (id === 'en') continue;
    const d = await dict(id);
    let same = 0;
    for (const [k, v] of Object.entries(d)) {
      const s = typeof v === 'string' ? v : Object.values(v).join('');
      assert.ok(String(s).trim().length, `${id}/${k}: tuščia`);
      if (typeof v === 'string' && typeof en[k] === 'string' && v === en[k] && v.length > 12) same++;
    }
    // kelios sutampančios eilutės normalu („Face ID"), bet ne pusė failo
    assert.ok(same < Object.keys(en).length * 0.25,
      `${id}: ${same} eilučių sutampa su anglų — panašu, kad neišversta`);
  }
});

// --- Intl ------------------------------------------------------------------

test('datos teisingos kiekvienai kalbai', async () => {
  const seen = new Set();
  for (const id of files) {
    await I.loadLang(id);
    const d = I.formatDate('2026-08-23');
    assert.ok(d.includes('23'), `${id}: dienos nėra datoje „${d}"`);
    assert.ok(d.length > 4, `${id}: data per trumpa`);
    seen.add(d);
  }
  if (files.length > 4) assert.ok(seen.size > 3, 'skirtingos kalbos turi duoti skirtingas datas');
});

test('lietuvių kalba gauna kilmininką ir „d." — be rankinio darbo', async () => {
  await I.loadLang('lt');
  assert.equal(I.formatDate('2026-08-23'), 'rugpjūčio 23 d.');
  assert.equal(I.formatDate('2026-11-05'), 'lapkričio 5 d.');
  assert.equal(I.formatDate('2026-04-01'), 'balandžio 1 d.');
  assert.equal(I.formatRange('2026-09-04', '2026-09-12'), 'rugsėjo 4–12 d.');
});

test('lietuvių daugiskaita: 1 ciklą, 4 ciklus, 11 ciklų', async () => {
  await I.loadLang('lt');
  assert.equal(I.cycleCount(1), '1 ciklą');
  assert.equal(I.cycleCount(4), '4 ciklus');
  assert.equal(I.cycleCount(11), '11 ciklų');
  assert.equal(I.cycleCount(21), '21 ciklą');
  assert.equal(I.dayCount(2), '2 dienos');
});

test('anglų daugiskaita', async () => {
  await I.loadLang('en');
  assert.equal(I.cycleCount(1), '1 cycle');
  assert.equal(I.cycleCount(4), '4 cycles');
});

test('savaitės dienos prasideda nuo sekmadienio (Date.getUTCDay tvarka)', async () => {
  await I.loadLang('en');
  const w = I.weekdayLetters();
  assert.equal(w.length, 7);
  assert.equal(w[0], 'S');
  assert.equal(w[1], 'M');
});

test('nežinoma kalba nesulaužo app’o', async () => {
  assert.equal(await I.loadLang('zz'), 'en');
  assert.equal(await I.loadLang(undefined), 'en');
});

test('trūkstamas vertimas krenta į anglišką, o ne į raktą', async () => {
  await I.loadLang('lt');
  assert.notEqual(I.t('nav_today'), 'nav_today');
  assert.equal(I.t('visai_nesamones_raktas'), 'visai_nesamones_raktas');
});

// --- kodas ir vertimai ------------------------------------------------------

test('kiekvienas kode naudojamas raktas egzistuoja', async () => {
  const en = await dict('en');
  const known = new Set(Object.keys(en));
  const root = new URL('../js/', import.meta.url).pathname;
  const jsFiles = [];
  (function walk(dir) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { if (f !== 'lang') walk(p); }
      else if (f.endsWith('.js')) jsFiles.push(p);
    }
  })(root);

  const missing = new Set();
  for (const f of jsFiles) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-z][a-z_0-9]*_?)'/g)) {
      const key = m[1];
      if (key.endsWith('_')) {
        if (![...known].some(k => k.startsWith(key))) missing.add(`${f.split('/js/')[1]}: ${key}*`);
      } else if (!known.has(key)) missing.add(`${f.split('/js/')[1]}: ${key}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('katalogo elementai turi bent anglišką ir lietuvišką pavadinimą', async () => {
  const cat = readFileSync(new URL('../js/catalog.js', import.meta.url), 'utf8');
  const items = [...cat.matchAll(/\{ id: '([a-z_0-9]+)',[^}]*lt: '([^']+)',\s*en: '([^']+)'/g)];
  assert.ok(items.length >= 45, `per mažai elementų: ${items.length}`);
  const ids = items.map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'pasikartojantys id');
});
