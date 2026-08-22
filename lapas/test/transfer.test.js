/* Perkėlimo testai: duomenys turi grįžti bit-į-bitą, net kai kamera praleidžia kadrus. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../js/transfer.js';
import { encryptJSON, decryptJSON } from '../js/crypto.js';

function fakeDays(n) {
  const days = {};
  let d = new Date(Date.UTC(2025, 0, 1));
  for (let i = 0; i < n; i++) {
    const iso = d.toISOString().slice(0, 10);
    days[iso] = {
      flow: i % 28 < 5 ? 3 : 0,
      symptoms: i % 3 ? ['cramps', 'bloating'] : ['headache'],
      mood: ['calm'],
      bbt: 36.4 + (i % 7) * 0.05,
      notes: i % 10 ? '' : 'Ilgesnis užrašas su lietuviškomis raidėmis: ąčęėįšųūž',
    };
    d = new Date(d.getTime() + 86400000);
  }
  return days;
}

test('failo eksportas ir importas grąžina tuos pačius duomenis', async () => {
  const days = fakeDays(120), settings = { lang: 'lt', avgCycle: 29 };
  const { blob, filename } = await T.exportFile(days, settings);
  assert.match(filename, /^lapas-\d{4}-\d{2}-\d{2}\.json$/);
  const back = await T.parseFile(await blob.text());
  assert.deepEqual(back.days, days);
  assert.equal(back.settings.avgCycle, 29);
  assert.equal(back.dayCount, 120);
});

test('užšifruoto failo be slaptažodžio neatidarysi, su blogu — irgi ne', async () => {
  const days = fakeDays(30);
  const { blob, filename } = await T.exportFile(days, {}, 'slapta123');
  assert.match(filename, /-enc\.json$/);
  const text = await blob.text();

  assert.ok(!text.includes('cramps'), 'užšifruotame faile neturi likti atviro turinio');
  await assert.rejects(() => T.parseFile(text), e => e.code === 'NEED_PASSWORD');
  await assert.rejects(() => T.parseFile(text, 'blogas'), e => e.code === 'WRONG_SECRET');

  const back = await T.parseFile(text, 'slapta123');
  assert.deepEqual(back.days, days);
});

test('svetimas ar sugadintas failas atmetamas aiškiu kodu', async () => {
  await assert.rejects(() => T.parseFile('{nesamone'), e => e.code === 'BAD_FILE');
  await assert.rejects(() => T.parseFile('{"app":"kitas"}'), e => e.code === 'BAD_FILE');
  await assert.rejects(() => T.parseFile('{"app":"lapas","v":1}'), e => e.code === 'BAD_FILE');
});

test('sujungimas nesunaikina esamų įrašų', () => {
  const cur = { '2026-01-01': { flow: 3, notes: 'mano' } };
  const inc = { '2026-01-01': { flow: 1, symptoms: ['cramps'] }, '2026-01-02': { flow: 2 } };
  const out = T.mergeDays(cur, inc);
  assert.equal(out['2026-01-01'].flow, 3, 'esamas laukas nekeičiamas');
  assert.deepEqual(out['2026-01-01'].symptoms, ['cramps'], 'trūkstamas laukas pridedamas');
  assert.equal(out['2026-01-02'].flow, 2);
});

test('QR srautas: metų duomenys telpa į protingą kadrų skaičių', async () => {
  const payload = T.buildPayload(fakeDays(365), { lang: 'lt' });
  const frames = await T.buildFrames(payload);
  assert.ok(frames.length <= 60, `per daug kadrų: ${frames.length}`);
  assert.ok(frames.every(f => f.length < 1000), 'kadras per ilgas QR kodui');
});

test('QR srautas surenkamas net praleidus kas antrą kadrą', async () => {
  const days = fakeDays(200);
  const payload = T.buildPayload(days, { avgCycle: 31 });
  const frames = await T.buildFrames(payload);
  const col = T.createCollector();

  // imituojam kamerą: kas antras kadras prarandamas, siuntėjas maišo tvarką kas ratą
  let round = 0, seen = 0;
  while (col.progress < 1 && round < 12) {
    for (const i of T.shuffleOrder(frames.length, round)) {
      seen++;
      if (seen % 2 === 0) continue;
      col.feed(frames[i]);
    }
    round++;
  }
  assert.equal(col.progress, 1, `nesurinkta po ${round} ratų`);
  const back = await col.assemble();
  assert.deepEqual(back.days, days);
});

test('maišymas kas ratą duoda kitą tvarką (kitaip praleidimai kartotųsi)', () => {
  const a = T.shuffleOrder(12, 0).join(), b = T.shuffleOrder(12, 1).join();
  assert.notEqual(a, b);
  assert.deepEqual([...T.shuffleOrder(12, 3)].sort((x, y) => x - y), [...Array(12).keys()]);
  assert.equal(T.shuffleOrder(9, 5).join(), T.shuffleOrder(9, 5).join(), 'ta pati eilė turi būti atkuriama');
});

test('sumaišyti dviejų skirtingų siuntimų kadrai neužteršia rezultato', async () => {
  const f1 = await T.buildFrames(T.buildPayload(fakeDays(40), {}));
  const f2 = await T.buildFrames(T.buildPayload(fakeDays(41), {}));
  const col = T.createCollector();
  col.feed(f1[0]);
  assert.equal(col.feed(f2[0]), 'bad', 'kito siuntimo kadras turi būti atmestas');
  for (const f of f1) col.feed(f);
  const back = await col.assemble();
  assert.equal(Object.keys(back.days).length, 40);
});

test('sugadintas kadras atmetamas iškart, o pakartotas — priimamas', async () => {
  const days = fakeDays(300);
  const frames = await T.buildFrames(T.buildPayload(days, {}));
  assert.ok(frames.length > 2, `testui reikia kelių kadrų, gauta ${frames.length}`);

  const broken = (() => { const p = frames[1].split('|'); p[7] = p[7].slice(0, -4) + 'AAAA'; return p.join('|'); })();
  const col = T.createCollector();
  assert.equal(col.feed(frames[0]), 'ok');
  assert.equal(col.feed(broken), 'bad', 'ne to ilgio gabalas neturi patekti į srautą');
  for (let i = 2; i < frames.length; i++) col.feed(frames[i]);
  await assert.rejects(() => col.assemble(), e => e.code === 'INCOMPLETE');

  col.feed(frames[1]);                       // kitas ratas — kadras nuskaitytas švariai
  assert.deepEqual((await col.assemble()).days, days);
});

test('melagingas header (neatitinkantis kadrų skaičius) atmetamas', () => {
  const col = T.createCollector();
  assert.equal(col.feed('LP1|0|5|100|560|abc|z|AAAA'), 'bad', '5 kadrai × 560 B ≠ 100 B');
  assert.equal(col.feed('LP1|9|2|1000|560|abc|z|AAAA'), 'bad', 'seq už ribų');
  assert.equal(col.feed('kaskita'), 'bad');
});

test('QR perdavimas su kodu užšifruotas ir be kodo neatsidaro', async () => {
  const days = fakeDays(25);
  const code = T.transferCode();
  assert.match(code, /^\d{6}$/);
  const frames = await T.buildFrames(T.buildPayload(days, {}), code);
  assert.ok(!frames.join('').includes('cramps'));

  const col = T.createCollector();
  for (const f of frames) col.feed(f);
  await assert.rejects(() => col.assemble(), e => e.code === 'NEED_PASSWORD');
  await assert.rejects(() => col.assemble('000000'), e => e.code === 'WRONG_SECRET');
  const back = await col.assemble(code);
  assert.deepEqual(back.days, days);
});

test('nepilnas srautas nepateikia pusės duomenų', async () => {
  const frames = await T.buildFrames(T.buildPayload(fakeDays(60), {}));
  const col = T.createCollector();
  frames.slice(0, -1).forEach(f => col.feed(f));
  assert.ok(col.progress < 1);
  await assert.rejects(() => col.assemble(), e => e.code === 'INCOMPLETE');
});

// --- QR talpa: kadras privalo tilpti į kodą, kurį telefonas realiai nuskaito ---

import { readFileSync } from 'node:fs';

/** Biblioteka yra UMD, o projektas — ESM: įkeliam ją taip, kaip tai daro naršyklė. */
function loadQrcode() {
  const src = readFileSync(new URL('../lib/qrcode-generator.js', import.meta.url), 'utf8');
  const mod = { exports: {} };
  return new Function('module', 'exports',
    `${src}\nreturn typeof qrcode !== 'undefined' ? qrcode : module.exports;`)(mod, mod.exports);
}

test('metų duomenys telpa į skaitomus QR kodus ir surenkami atgal', async () => {
  const days = fakeDays(365);
  const payload = T.buildPayload(days, { lang: 'lt' });
  const code = '123456';
  const frames = await T.buildFrames(payload, code);

  const qrcode = loadQrcode();
  const longest = frames.reduce((a, b) => (b.length > a.length ? b : a));
  const qr = qrcode(0, 'M');
  qr.addData(longest, 'Byte');
  qr.make();
  const version = (qr.getModuleCount() - 17) / 4;

  // 25 versija ≈ 117 modulių — dar patikimai nuskaitoma telefono kamera nuo ekrano
  assert.ok(version <= 25, `QR versija ${version} per tanki telefonui`);
  assert.ok(frames.length <= 50, `${frames.length} kadrų — perdavimas užtruktų per ilgai`);

  const col = T.createCollector();
  for (const f of frames) col.feed(f);
  assert.deepEqual((await col.assemble(code)).days, days);
});

test('suspaudimas prieš šifravimą duoda mažiau kadrų nei atvirkščiai', async () => {
  const payload = T.buildPayload(fakeDays(365), {});
  const plain = await T.buildFrames(payload);
  const enc = await T.buildFrames(payload, '123456');
  // šifruotas srautas gali būti tik nežymiai didesnis (salt+iv+tag), o ne trečdaliu
  assert.ok(enc.length <= plain.length + 1,
    `šifravimas išpūtė srautą: ${plain.length} → ${enc.length} kadrų`);
});
