/* Šifravimo testai: PIN užraktas ir eksporto slaptažodis remiasi šiuo failu. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../js/crypto.js';

test('užšifruotas objektas grįžta nepakitęs', async () => {
  const obj = { days: { '2026-08-22': { flow: 3, notes: 'ąčęėįšųūž ir emoji 🍃' } }, n: 42 };
  const blob = await X.encryptJSON(obj, 'slaptas');
  assert.equal(X.isEncrypted(blob), true);
  assert.ok(!JSON.stringify(blob).includes('ąčęėįšųūž'), 'atviro teksto neturi likti');
  assert.deepEqual(await X.decryptJSON(blob, 'slaptas'), obj);
});

test('blogas slaptažodis meta WRONG_SECRET, o ne šiukšles', async () => {
  const blob = await X.encryptJSON({ a: 1 }, 'teisingas');
  await assert.rejects(() => X.decryptJSON(blob, 'neteisingas'), e => e.code === 'WRONG_SECRET');
});

test('kiekvienas šifravimas turi savo druską ir iv', async () => {
  const a = await X.encryptJSON({ x: 1 }, 'tas pats');
  const b = await X.encryptJSON({ x: 1 }, 'tas pats');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct, 'tas pats turinys neturi duoti tos pačios šifrogramos');
});

test('baitų šifravimas (QR srautui) grįžta bit į bitą', async () => {
  const bytes = X.randomBytes(5000);
  const enc = await X.encryptBytes(bytes, '123456');
  assert.equal(enc.length, bytes.length + 28 + 16, 'salt + iv + GCM žyma');
  const back = await X.decryptBytes(enc, '123456');
  assert.deepEqual([...back], [...bytes]);
});

test('sugadinta šifrograma neiššifruojama (GCM aptinka pakeitimą)', async () => {
  const enc = await X.encryptBytes(new Uint8Array([1, 2, 3, 4, 5]), 'kodas');
  enc[40] ^= 0xFF;
  await assert.rejects(() => X.decryptBytes(enc, 'kodas'), e => e.code === 'WRONG_SECRET');
});

test('per trumpas blob neapsimeta iššifruojamu', async () => {
  await assert.rejects(() => X.decryptBytes(new Uint8Array(10), 'x'), e => e.code === 'WRONG_SECRET');
});

test('PIN patikra: tas pats PIN duoda tą pačią maišą, kitas — kitą', async () => {
  const salt = X.b64(X.randomBytes(16));
  const a = await X.pinCheck('1234', salt);
  const b = await X.pinCheck('1234', salt);
  const c = await X.pinCheck('1235', salt);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.length > 40, 'maiša turi būti pilno ilgio');
});

test('ta pati PIN reikšmė su kita druska duoda kitą maišą', async () => {
  const a = await X.pinCheck('1234', X.b64(X.randomBytes(16)));
  const b = await X.pinCheck('1234', X.b64(X.randomBytes(16)));
  assert.notEqual(a, b);
});

test('base64 išlaiko bet kokius baitus, įskaitant didelius kiekius', () => {
  // WebCrypto vienu kvietimu duoda ne daugiau kaip 65 536 B, o b64 dirba 32 768 B gabalais —
  // testas turi peržengti abu skaičius.
  const bytes = new Uint8Array(200000);
  for (let i = 0; i < bytes.length; i += 60000) bytes.set(X.randomBytes(Math.min(60000, bytes.length - i)), i);
  assert.deepEqual([...X.unb64(X.b64(bytes))], [...bytes]);
});
