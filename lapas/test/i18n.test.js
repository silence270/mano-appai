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
