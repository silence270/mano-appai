/* Saugyklos testai — tikrinama ne tik „ar veikia", bet ir „ko NEMATYTI diske". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-idb.js';

const idb = installFakeIndexedDB();
const V = await import('../js/vault.js');

const SAMPLE = {
  days: { '2026-08-01': { flow: 3, symptoms: ['cramps'], notes: 'labai slaptas užrašas' } },
  settings: { lang: 'lt', birthYear: 1993 },
};

/** Švari pradžia. wipe() svarbus: jis uždaro vault'o turimą jungtį — be jo
 *  saugykla rašytų į „pamirštą" duomenų bazę, o testas tikrintų tuščią. */
async function fresh(pin = '4821', seed = SAMPLE) {
  await V.wipe();
  idb.reset();
  return V.initialise(pin, seed);
}

/** Viskas, kas gula į „diską", kaip vienas baitų srautas. */
function diskBytes() {
  const map = idb.raw();
  const parts = [];
  for (const v of map.values()) {
    if (v instanceof Uint8Array) parts.push(v);
    else parts.push(new TextEncoder().encode(JSON.stringify(v)));
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// --- ką matyti diske -------------------------------------------------------

test('diske nėra nė vieno atviro teksto gabalo', async () => {
  await fresh();
  const disk = new TextDecoder('utf-8', { fatal: false }).decode(diskBytes());
  // Trumpos sekos (pvz. „lt") atsitiktinai pasitaiko 256 KB triukšmo, todėl
  // tikrinam tik tokias, kurių atsitiktinumas praktiškai neduotų.
  for (const secret of ['labai slaptas užrašas', 'cramps', '2026-08-01', 'settings', 'birthYear', 'flow'])
    assert.ok(!disk.includes(secret), `diske matyti „${secret}"`);
  assert.ok(!/"days"|"lang"/.test(disk), 'JSON struktūra neturi matytis');
});

test('saugyklos ir raktų vardai nieko nesako apie app’ą', async () => {
  await fresh();
  const map = idb.raw();
  assert.ok(map, 'saugykla turi vadintis „appdata", ne „lapas"');
  for (const k of map.keys())
    assert.ok(/^[a-d]$/.test(k), `raktas „${k}" per daug pasakoja`);
  assert.equal(idb.raw('lapas', 'vault'), null, 'senojo vardo nebeturi likti');
});

test('abu skyriai vienodo dydžio — nematyti, kuriame kas nors yra', async () => {
  await fresh();
  const map = idb.raw();
  assert.equal(map.get('b').length, map.get('c').length);
  // pridėjus daug duomenų, abu vis tiek lygūs
  const big = { days: {}, settings: {} };
  for (let i = 0; i < 400; i++) big.days[`2025-01-${String((i % 28) + 1).padStart(2, '0')}`] =
    { flow: 3, symptoms: ['cramps', 'bloating'], notes: 'x'.repeat(50) };
  await V.writeAll(big);
  assert.equal(idb.raw().get('b').length, idb.raw().get('c').length, 'po įrašymo irgi');
});

test('duomenų kiekis apvalinamas iki 4 KB — nematyti, kiek jų yra', async () => {
  await fresh('4821', { days: {}, settings: {} });
  const empty = idb.raw().get('b').length;
  await fresh('4821', SAMPLE);
  assert.equal(idb.raw().get('b').length, empty, 'tuščias ir pilnas skyrius vienodi');
});

// --- atrakinimas -----------------------------------------------------------

test('teisingas PIN atrakina, neteisingas — ne', async () => {
  await fresh('4821');
  V.lock();
  assert.equal((await V.unlock('0000')).ok, false);
  const r = await V.unlock('4821');
  assert.equal(r.ok, true);
  assert.equal(r.decoy, false);
  assert.deepEqual((await V.readAll()).days, SAMPLE.days);
});

test('užrakinus duomenys nepasiekiami', async () => {
  await fresh();
  V.lock();
  await assert.rejects(() => V.readAll(), e => e.code === 'LOCKED');
  await assert.rejects(() => V.writeAll({ days: {} }), e => e.code === 'LOCKED');
});

// --- atkūrimo kodas --------------------------------------------------------

test('atkūrimo kodas atrakina tuos pačius duomenis', async () => {
  const code = await fresh('4821');
  assert.match(code, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/);
  V.lock();
  const r = await V.unlock(code);
  assert.equal(r.ok, true);
  assert.equal(r.viaRecovery, true);
  assert.deepEqual((await V.readAll()).days, SAMPLE.days);
});

test('kodas priimamas ir be brūkšnelių, ir mažosiomis', async () => {
  const code = await fresh('4821');
  V.lock();
  assert.equal((await V.unlock(code.replace(/-/g, '').toLowerCase())).ok, true);
});

test('kodo entropija — 120 bitų ir be painių simbolių', () => {
  const codes = new Set();
  for (let i = 0; i < 200; i++) codes.add(V.makeRecoveryCode());
  assert.equal(codes.size, 200, 'kodai neturi kartotis');
  const c = V.normaliseCode(V.makeRecoveryCode());
  assert.equal(c.length, 24);
  assert.ok(!/[ILOU]/.test(c), 'I, L, O, U painiojami perrašant');
});

test('naujam atkūrimo kodui reikia PIN — net atrakintame app’e', async () => {
  await fresh('4821');
  assert.equal(await V.resetRecoveryCode('0000'), null, 'be teisingo PIN — ne');
});

test('naujas atkūrimo kodas panaikina senąjį', async () => {
  const old = await fresh('4821');
  const fresh2 = await V.resetRecoveryCode('4821');
  assert.notEqual(old, fresh2);
  V.lock();
  assert.equal((await V.unlock(old)).ok, false, 'senas kodas turi nustoti galioti');
  V.lock();
  assert.equal((await V.unlock(fresh2)).ok, true);
});

// --- panikos skyrius -------------------------------------------------------

test('panikos PIN atveria tuščią app’ą, o tikri duomenys lieka', async () => {
  await fresh('4821');
  await V.setDecoyPin('1111', { days: {}, settings: { lang: 'lt' } });

  V.lock();
  const d = await V.unlock('1111');
  assert.equal(d.ok, true);
  assert.equal(d.decoy, true);
  assert.deepEqual((await V.readAll()).days, {}, 'panikos skyrius tuščias');

  V.lock();
  const real = await V.unlock('4821');
  assert.equal(real.decoy, false);
  assert.deepEqual((await V.readAll()).days, SAMPLE.days, 'tikri duomenys nepaliesti');
});

test('rašymas panikos skyriuje nepaliečia tikrojo', async () => {
  await fresh('4821');
  await V.setDecoyPin('1111');
  V.lock();
  await V.unlock('1111');
  await V.writeAll({ days: { '2026-01-01': { flow: 2 } }, settings: {} });

  V.lock();
  await V.unlock('4821');
  assert.deepEqual((await V.readAll()).days, SAMPLE.days);
});

test('panikos skyrius neturi atkūrimo kodo — tik tikri duomenys', async () => {
  const code = await fresh('4821');
  await V.setDecoyPin('1111');
  V.lock();
  const r = await V.unlock(code);
  assert.equal(r.ok, true);
  assert.equal(r.decoy, false, 'kodas turi vesti į tikrus duomenis');
});

test('be panikos PIN antras skyrius neatidaromas niekuo', async () => {
  await fresh('4821');
  const noise = idb.raw().get('c');
  assert.ok(noise instanceof Uint8Array && noise.length > 0, 'antras skyrius visada yra');
  V.lock();
  for (const guess of ['1111', '0000', '4821']) {
    V.lock();
    const r = await V.unlock(guess);
    if (r.ok) assert.equal(r.decoy, false, `„${guess}" neturi atverti antrojo skyriaus`);
  }
});

// --- PIN keitimas ----------------------------------------------------------

test('pakeitus PIN senasis nustoja veikti, duomenys lieka', async () => {
  await fresh('4821');
  assert.equal(await V.changePin('4821', '9137'), true);
  V.lock();
  assert.equal((await V.unlock('4821')).ok, false);
  V.lock();
  assert.equal((await V.unlock('9137')).ok, true);
  assert.deepEqual((await V.readAll()).days, SAMPLE.days);
});

test('PIN keitimas su neteisingu senuoju atmetamas', async () => {
  await fresh('4821');
  assert.equal(await V.changePin('0000', '9137'), false);
  V.lock();
  assert.equal((await V.unlock('4821')).ok, true, 'senasis turi likti galiojantis');
});

test('pakeitus PIN atkūrimo kodas vis dar veikia', async () => {
  const code = await fresh('4821');
  await V.changePin('4821', '9137');
  V.lock();
  assert.equal((await V.unlock(code)).ok, true);
});

// --- spėliojimo lėtinimas --------------------------------------------------

test('delsa auga ir išlieka perkrovus app’ą', async () => {
  await fresh('4821');
  V.lock();
  let now = 1_000_000;
  for (let i = 0; i < 5; i++) await V.unlock('0000', now);
  const g = await V.guardState(now);
  assert.ok(g.waitMs > 0, 'po penkių klaidų turi būti pauzė');
  assert.equal(g.fails, 5);

  // teisingas PIN pauzės metu irgi nepriimamas — kitaip pauzės nebūtų
  const blocked = await V.unlock('4821', now);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.waitMs > 0);

  // pasibaigus pauzei — atrakina ir skaitiklis nusinulina
  now += 31_000;
  const ok = await V.unlock('4821', now);
  assert.equal(ok.ok, true);
  assert.equal((await V.guardState(now)).fails, 0);
});

test('delsa pakopomis, bet niekada ne amžinai', () => {
  assert.equal(V.delayFor(4), 0, 'pirmos klaidos nebaudžiamos');
  assert.equal(V.delayFor(5), 30_000);
  assert.equal(V.delayFor(10), 5 * 60_000);
  assert.equal(V.delayFor(15), 60 * 60_000);
  assert.equal(V.delayFor(500), 60 * 60_000, 'riba nesikeičia — nuo savo duomenų neatkertam');
});

// --- trynimas --------------------------------------------------------------

test('ištrynus diske nelieka nieko', async () => {
  await fresh();
  await V.wipe();
  assert.equal(idb.raw(), null);
  assert.equal(await V.isInitialised(), false);
  assert.equal(V.isUnlocked(), false);
});

// --- atvirkštinis panikos PIN ---------------------------------------------

test('PIN atvirkščiai atveria tuščią app’ą', async () => {
  await fresh('4821');
  V.lock();
  const d = await V.unlock('1284');
  assert.equal(d.ok, true);
  assert.equal(d.decoy, true);
  assert.deepEqual((await V.readAll()).days, {});

  V.lock();
  const real = await V.unlock('4821');
  assert.equal(real.decoy, false);
  assert.deepEqual((await V.readAll()).days, SAMPLE.days);
});

test('rašant panikos skyriuje tikrieji duomenys nepaliečiami', async () => {
  await fresh('4821');
  V.lock();
  await V.unlock('1284');
  await V.writeAll({ days: { '2026-03-03': { flow: 1 } }, settings: {} });
  V.lock();
  await V.unlock('4821');
  assert.deepEqual((await V.readAll()).days, SAMPLE.days);
});

test('palindrominis PIN neturi atvirkštinio — ir tai nesimato diske', async () => {
  assert.equal(V.reversePin('1221'), null);
  assert.equal(V.reversePin('4821'), '1284');
  await fresh('1221');
  const map = idb.raw();
  assert.equal(map.get('b').length, map.get('c').length, 'skyriai vis tiek vienodi');
  V.lock();
  assert.equal((await V.unlock('1221')).decoy, false);
});

test('panikos skyrius auga kartu su tikruoju ir lieka neatskiriamas', async () => {
  await fresh('4821');
  const big = { days: {}, settings: {} };
  for (let i = 0; i < 500; i++)
    big.days[`2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`] =
      { flow: 3, symptoms: ['cramps', 'bloating', 'headache'], notes: 'ilgas užrašas '.repeat(4) };
  await V.writeAll(big);
  assert.equal(idb.raw().get('b').length, idb.raw().get('c').length);

  // ir panikos PIN po to vis dar atrakina savo skyrių
  V.lock();
  const d = await V.unlock('1284');
  assert.equal(d.ok, true);
  assert.equal(d.decoy, true);
});

test('trys raktų vietos — nenaudotos neatskiriamos nuo naudotų', async () => {
  await fresh('4821');
  const slot = idb.raw().get('b');
  const wrapPin = slot.subarray(0, 60), wrapRec = slot.subarray(60, 120), wrapBio = slot.subarray(120, 180);
  assert.equal(wrapBio.length, 60, 'biometrijos vieta visada yra');
  // nė viena iš trijų neturi būti vien nuliai ar akivaizdžiai tuščia
  for (const [name, w] of [['pin', wrapPin], ['kodas', wrapRec], ['bio', wrapBio]])
    assert.ok(w.some(b => b !== 0), `${name} vieta neturi būti tuščia`);
});

// --- biometrika ------------------------------------------------------------

test('be WebAuthn palaikymo biometrika tiesiog nesiūloma', async () => {
  await fresh('4821');
  assert.equal(V.biometricsPossible(), false, 'node aplinkoje jos nėra');
  assert.equal(await V.biometricsAvailable(), false);
  assert.equal(await V.biometricsEnabled(), false);
  const r = await V.enableBiometrics('4821');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'UNSUPPORTED', 'turi pasakyti kodėl, o ne nutylėti');
});

test('biometrikos įjungimui reikia teisingo PIN', async () => {
  await fresh('4821');
  const r = await V.enableBiometrics('0000');
  assert.equal(r.reason, 'WRONG_PIN', 'PIN tikrinamas PRIEŠ WebAuthn');
});

test('biometrinis atrakinimas be nustatytos biometrikos nieko neatveria', async () => {
  await fresh('4821');
  V.lock();
  const r = await V.unlockBiometric();
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'NOT_SET');
});

test('biometrikos vieta rakte yra visada — net kai neįjungta', async () => {
  await fresh('4821');
  const slot = idb.raw().get('b');
  assert.equal(slot.subarray(120, 180).length, 60);
  assert.ok(slot.subarray(120, 180).some(b => b !== 0), 'turi atrodyti kaip tikras raktas');
});
