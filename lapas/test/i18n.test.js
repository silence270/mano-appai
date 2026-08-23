/* Kalbų vientisumas: nė vienas ekranas neturi likti pusiau išverstas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../js/i18n.js';

test('LT ir EN turi tuos pačius raktus', () => {
  const lt = new Set(Object.keys(dictionaries.lt)), en = new Set(Object.keys(dictionaries.en));
  const missingEn = [...lt].filter(k => !en.has(k));
  const missingLt = [...en].filter(k => !lt.has(k));
  assert.deepEqual(missingEn, [], 'trūksta angliškų vertimų');
  assert.deepEqual(missingLt, [], 'trūksta lietuviškų vertimų');
  assert.ok(lt.size > 150, `per mažai eilučių: ${lt.size}`);
  for (const k of lt) {
    const a = dictionaries.lt[k], b = dictionaries.en[k];
    assert.equal(Array.isArray(a), Array.isArray(b), `${k}: skirtingi tipai`);
    if (Array.isArray(a)) assert.equal(a.length, b.length, `${k}: skirtingas ilgis`);
    else assert.ok(String(b).trim().length, `${k}: tuščias angliškas vertimas`);
  }
});

test('katalogo elementai turi abu vertimus ir unikalius id', () => {
  const cat = readFileSync(new URL('../js/catalog.js', import.meta.url), 'utf8');
  const items = [...cat.matchAll(/\{ id: '([a-z_0-9]+)',[^}]*lt: '([^']+)',\s*en: '([^']+)'/g)];
  assert.ok(items.length >= 45, `per mažai elementų: ${items.length}`);
  const ids = items.map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'pasikartojantys id');
  for (const [, id, lt, en] of items) {
    assert.ok(lt.trim() && en.trim(), `tuščias vertimas: ${id}`);
  }
});

test('perjungus kalbą tekstai iš tikrųjų keičiasi', async () => {
  const { setLang, t, cycleCount, dayCount, formatRange, formatDate } = await import('../js/i18n.js');
  setLang('lt');
  const lt = t('nav_today');
  assert.equal(cycleCount(1), '1 ciklą');
  assert.equal(cycleCount(4), '4 ciklus');
  assert.equal(cycleCount(11), '11 ciklų');
  assert.equal(cycleCount(21), '21 ciklą');
  assert.equal(dayCount(2), '2 dienos');
  assert.equal(formatRange('2026-09-04', '2026-09-12'), 'rugsėjo 4–12 d.');
  assert.equal(formatDate('2026-08-23'), 'rugpjūčio 23 d.');
  setLang('en');
  assert.notEqual(t('nav_today'), lt);
  assert.equal(cycleCount(1), '1 cycle');
  assert.equal(cycleCount(4), '4 cycles');
  assert.equal(formatRange('2026-09-04', '2026-09-12'), '4–12 September');
  setLang('lt');
});

test('klaidos pranešimas atskiria saugyklos problemą nuo bendros', async () => {
  const { setLang, t } = await import('../js/i18n.js');
  setLang('lt');
  const route = m => /indexeddb|database|quota|LOCKED|storage/i.test(m) ? t('err_storage') : t('err_generic');
  assert.match(route('Failed to open indexedDB'), /privačiame naršymo režime/);
  assert.match(route('QuotaExceededError'), /privačiame naršymo režime/);
  assert.match(route('netikėta klaida'), /uždaryti ir atidaryti/);
});

test('visi mėnesių kilmininkai teisingi (priebalsių kaita)', async () => {
  const { setLang, formatDate } = await import('../js/i18n.js');
  setLang('lt');
  const want = ['sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
                'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio'];
  want.forEach((w, i) => {
    const iso = `2026-${String(i + 1).padStart(2, '0')}-15`;
    assert.equal(formatDate(iso), `${w} 15 d.`, `${i + 1} mėnuo`);
  });
});

test('kiekvienas kode naudojamas raktas egzistuoja žodyne', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../js/', import.meta.url).pathname;

  const files = [];
  (function walk(dir) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) files.push(p);
    }
  })(root);

  const known = new Set(Object.keys(dictionaries.lt));
  const missing = new Set();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-z][a-z_0-9]*_?)'/g)) {
      const key = m[1];
      if (key.endsWith('_')) {
        // dinamiškai sudaromas raktas, pvz. t('phase_' + phase) — tikrinam, kad
        // žodyne apskritai yra tokio prefikso eilučių
        if (![...known].some(k => k.startsWith(key))) missing.add(`${f.split('/js/')[1]}: ${key}* (nėra nė vienos)`);
      } else if (!known.has(key)) {
        missing.add(`${f.split('/js/')[1]}: ${key}`);
      }
    }
  }
  assert.deepEqual([...missing], [], 'kode naudojami raktai be vertimo');
});
