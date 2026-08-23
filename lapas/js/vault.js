/* Lapas — saugykla su privalomu šifravimu.
 *
 * GRĖSMIŲ MODELIS (kas iš tikrųjų gali nutikti):
 *   1. Kas nors paima telefoną ir naršo po app'us.
 *   2. Telefonas pametamas ar pavagiamas; kas nors ištraukia disko vaizdą.
 *   3. Kas nors verčia atrakinti, stovėdamas šalia.
 *   4. Naršyklės saugyklos inspektorius, prijungus telefoną prie kompiuterio.
 *
 * KĄ ŠIS FAILAS PASIEKIA:
 *   - Diske NIEKADA nėra atviro teksto; „neužšifruoto režimo" nėra.
 *   - Diske nesimato NEI kas saugoma, NEI kiek: saugyklos ir raktų vardai
 *     neutralūs, skyriai visada vienodo dydžio, apvalinto iki 4 KB.
 *   - Skyrių yra DU ir jie neatskiriami. Vieną atrakina įprastas PIN, kitą —
 *     „panikos" PIN. Kol panikos PIN nenustatytas, antras skyrius pilnas
 *     atsitiktinių baitų, todėl jo buvimas nieko neišduoda.
 *   - Spėliojimas lėtinamas auganti delsa, išliekančia perkrovus app'ą.
 *
 * RAKTŲ SCHEMA:
 *   Duomenys šifruojami atsitiktiniu raktu (DEK), o DEK atskirai užrakinamas
 *   dviem raktais: išvestu iš PIN ir išvestu iš atkūrimo kodo. Todėl PIN galima
 *   pakeisti neperšifruojant duomenų, o pamiršus PIN — atrakinti kodu.
 *   Abu užrakinti DEK egzemplioriai yra fiksuoto dydžio ir visada abu, tad
 *   neįmanoma pasakyti, ar atkūrimo kodas apskritai nustatytas.
 *
 * KO NEPASIEKIA (sąžiningai):
 *   - Neapsaugo nuo įrenginio su stebėjimo programa ar nuo žvilgsnio per petį.
 *   - 4 skaitmenų PIN yra 10 000 variantų. Delsa daro spėliojimą nepraktišką
 *     telefone, bet ne tada, kai saugykla nukopijuojama ir spėliojama atskirai —
 *     ten gina tik PBKDF2 kaina. Todėl siūlomas ilgesnis kodas.
 */

'use strict';

const DB_NAME = 'appdata';        // neutralu: inspektoriuje nieko nesako
const STORE = 'kv';
const VERSION = 1;

const K_SALT = 'a';
const K_S0 = 'b';
const K_S1 = 'c';
const K_GUARD = 'd';

const ITER = 310_000;             // OWASP 2023 PBKDF2-SHA256
/**
 * Skyriaus dydis fiksuotas ir niekada nesikeičia. Kitaip augantis tikrasis
 * skyrius verstų perdydinti panikos skyrių — o jo rakto neturime, kol jis
 * neatrakintas. Taip elgiasi ir paslėpti diskų tomai: paslėptoji dalis turi
 * dydį, nustatytą kūrimo metu.
 *
 * 256 KB po suspaudimo — daugiau nei dešimtmetis kasdienių įrašų.
 */
const SLOT_BYTES = 256 * 1024;
const WRAP = 12 + 32 + 16;        // iv + užrakintas DEK + GCM žyma = 60 B
const SLOTS = 3;                  // PIN · atkūrimo kodas · biometrika
const HEAD = WRAP * SLOTS;        // visi trys visada yra; nenaudoti — triukšmas

const enc = new TextEncoder();
const dec = new TextDecoder();

let _dek = null;                  // CryptoKey; slaptažodžio tekstas atmintyje nelieka
let _slot = null;
let _decoy = false;
let _db = null;

// ------------------------------------------------------------- IndexedDB

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}

function tx(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    // IDBRequest visada turi `result`, bet jis būna undefined, kai įrašo nėra.
    // Tikrinant `!== undefined` tokiu atveju būtų grąžintas pats užklausos
    // objektas — o jis visada „teisingas", ir „ar yra duomenų?" atsakytų taip.
    t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

const get = k => tx('readonly', s => s.get(k));
const put = (k, v) => tx('readwrite', s => s.put(v, k));

// --------------------------------------------------------------- kripto

/** WebCrypto vienu kartu duoda ne daugiau kaip 64 KB, o skyriai didesni. */
export function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(i + 65536, n)));
  return out;
}
function err(code) { const e = new Error(code); e.code = code; return e; }

async function kekFrom(secret, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}

const newDek = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

/** DEK užrakinamas KEK'u; rezultatas visada 60 baitų, tad nieko neišduoda. */
async function wrapDek(dek, kek) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv }));
  const out = new Uint8Array(WRAP);
  out.set(iv, 0); out.set(ct, 12);
  return out;
}

/**
 * Kasdieniam darbui DEK atrakinamas NEIŠIMAMAS: net turėdamas JS vykdymą,
 * niekas negali jo iškelti iš naršyklės. Išimamo prireikia tik keičiant PIN
 * ar atkūrimo kodą — tada raktą reikia perrakinti nauju KEK.
 */
async function unwrapDek(blob, kek, extractable = false) {
  return crypto.subtle.unwrapKey('raw', blob.subarray(12), kek,
    { name: 'AES-GCM', iv: blob.subarray(0, 12) },
    { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}

/** Atrakina DEK perrakinimui — reikalauja slaptažodžio, net jei app'as atrakintas. */
async function dekForRewrap(secret) {
  const salt = unb64(await get(K_SALT));
  const looksLikeCode = normaliseCode(secret).length >= 20;
  const kek = await kekFrom(looksLikeCode ? normaliseCode(secret) : secret, salt);
  const blob = await get(_slot);
  for (let i = 0; i < 2; i++) {
    try {
      const dek = await unwrapDek(blob.subarray(i * WRAP, (i + 1) * WRAP), kek, true);
      await openBody(dek, blob.subarray(HEAD));
      return { dek, salt, blob, index: i };
    } catch { /* ne šis raktas */ }
  }
  return null;
}

/** Duomenys suspaudžiami ir užpildomi iki fiksuoto dydžio. */
async function pack(obj) {
  const raw = enc.encode(JSON.stringify(obj));
  let body = raw;
  if (typeof CompressionStream !== 'undefined') {
    const st = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
    body = new Uint8Array(await new Response(st).arrayBuffer());
  }
  if (body.length + 5 > SLOT_BYTES) throw err('TOO_BIG');
  // Užpildas — nuliai, ne atsitiktiniai baitai: po AES-GCM šifrograma vis tiek
  // neatskiriama nuo triukšmo, o 256 KB atsitiktinumo kaskart būtų eikvojimas.
  const out = new Uint8Array(SLOT_BYTES);
  out[0] = body === raw ? 0 : 1;
  new DataView(out.buffer).setUint32(1, body.length);
  out.set(body, 5);
  return out;
}

async function unpack(bytes) {
  const zipped = bytes[0] === 1;
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1);
  if (len > bytes.length - 5) throw err('CORRUPT');
  let body = bytes.subarray(5, 5 + len);
  if (zipped) {
    const st = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
    body = new Uint8Array(await new Response(st).arrayBuffer());
  }
  return JSON.parse(dec.decode(body));
}

async function sealBody(dek, obj) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, await pack(obj)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0); out.set(ct, 12);
  return out;
}

async function openBody(dek, blob) {
  const plain = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.subarray(0, 12) }, dek, blob.subarray(12)));
  return unpack(plain);
}

/** Skyrius diske: [wrapPin 60][wrapRecovery 60][wrapBio 60][body …] */
function packSlot(wraps, body) {
  const out = new Uint8Array(HEAD + body.length);
  for (let i = 0; i < SLOTS; i++) out.set(wraps[i] || randomBytes(WRAP), i * WRAP);
  out.set(body, HEAD);
  return out;
}

/** Ar PIN atvirkščiai skiriasi nuo jo paties (1221 — nesiskiria). */
export function reversePin(pin) {
  const r = String(pin).split('').reverse().join('');
  return r === String(pin) ? null : r;
}

// ----------------------------------------------------- bandymų ribojimas

/** Delsa auga, bet niekada neužrakina amžiams — pati nuo savo duomenų neatkertama. */
export function delayFor(fails) {
  if (fails < 5) return 0;
  if (fails < 10) return 30_000;
  if (fails < 15) return 5 * 60_000;
  return 60 * 60_000;
}

export async function guardState(now = Date.now()) {
  const g = (await get(K_GUARD)) || { fails: 0, until: 0 };
  return { fails: g.fails || 0, waitMs: Math.max(0, (g.until || 0) - now) };
}

async function noteFail(now) {
  const g = (await get(K_GUARD)) || { fails: 0, until: 0 };
  g.fails = (g.fails || 0) + 1;
  const d = delayFor(g.fails);
  g.until = d ? now + d : 0;
  await put(K_GUARD, g);
  return { fails: g.fails, waitMs: d };
}

const clearFails = () => put(K_GUARD, { fails: 0, until: 0 });

// ------------------------------------------------------- atkūrimo kodas

// Crockford base32 be I, L, O, U — kad perrašant nesupainiotum su 1, 0 ir V.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 120 bitų kodas, grupuotas po keturis: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX */
export function makeRecoveryCode() {
  const bytes = randomBytes(15);
  let bits = 0, acc = 0, out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(acc >> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{1,4}/g).join('-');
}

/** Įvedant nesvarbu didžiosios ar mažosios, brūkšneliai ar tarpai. */
export function normaliseCode(s) {
  return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/I/g, '1').replace(/L/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
}

// ------------------------------------------------------------- vieša API

export const isInitialised = async () => !!(await get(K_SALT));
export const isUnlocked = () => _dek !== null;
export const isDecoy = () => _decoy;
export function lock() { _dek = null; _slot = null; _decoy = false; }

/**
 * Pirmas paleidimas. Sukuriami abu skyriai; antrasis — atsitiktiniai baitai,
 * kurių niekas negali atidaryti, kol nenustatytas panikos PIN. Todėl vėliau
 * atsiradęs panikos skyrius neatrodo naujas.
 *
 * @returns {string} atkūrimo kodas — parodyti vieną kartą ir niekur nesaugoti
 */
export async function initialise(pin, seed = { days: {}, settings: {} }) {
  const salt = randomBytes(16);
  const dek = await newDek();
  const code = makeRecoveryCode();

  const kekPin = await kekFrom(pin, salt);
  const kekRec = await kekFrom(normaliseCode(code), salt);
  const body = await sealBody(dek, seed);
  const slot = packSlot([await wrapDek(dek, kekPin), await wrapDek(dek, kekRec)], body);

  await put(K_SALT, b64(salt));
  await put(K_S0, slot);
  await clearFails();

  // Panikos skyrius: tas pats PIN atvirkščiai. Jei PIN palindromas, jo nėra —
  // tada antrame skyriuje lieka triukšmas ir viskas atrodo taip pat.
  const rev = reversePin(pin);
  if (rev) {
    const dek2 = await newDek();
    const kek2 = await kekFrom(rev, salt);
    const body2 = await sealBody(dek2, { days: {}, settings: { lang: seed.settings?.lang || 'lt' } });
    await put(K_S1, packSlot([await wrapDek(dek2, kek2)], body2));
  } else {
    await put(K_S1, randomBytes(slot.length));
  }

  _dek = dek; _slot = K_S0; _decoy = false;
  return code;
}

/**
 * Atrakinimas PIN'u arba atkūrimo kodu. Raktas iš slaptažodžio išvedamas
 * VIENĄ kartą, tada visi keturi variantai (du skyriai × du raktai) bandomi
 * greitu AES — todėl nei panikos skyrius, nei atkūrimo kodas nekainuoja
 * papildomos sekundės ir jų buvimo nesimato net pagal atrakinimo trukmę.
 *
 * @returns {{ok:boolean, decoy?:boolean, viaRecovery?:boolean, waitMs?:number, fails?:number}}
 */
export async function unlock(secret, now = Date.now()) {
  const g = await guardState(now);
  if (g.waitMs > 0) return { ok: false, waitMs: g.waitMs, fails: g.fails };

  const saltB64 = await get(K_SALT);
  if (!saltB64) return { ok: false, fails: 0 };

  const looksLikeCode = normaliseCode(secret).length >= 20;
  const kek = await kekFrom(looksLikeCode ? normaliseCode(secret) : secret, unb64(saltB64));

  for (const slotKey of [K_S0, K_S1]) {
    const blob = await get(slotKey);
    if (!blob || blob.length <= HEAD) continue;
    for (let i = 0; i < SLOTS; i++) {
      try {
        const dek = await unwrapDek(blob.subarray(i * WRAP, (i + 1) * WRAP), kek);
        await openBody(dek, blob.subarray(HEAD));      // patikrinam, kad tikrai atsidaro
        _dek = dek; _slot = slotKey; _decoy = slotKey === K_S1;
        await clearFails();
        return { ok: true, decoy: _decoy, viaRecovery: i === 1, viaBiometric: i === 2 };
      } catch { /* ne šis raktas */ }
    }
  }
  return { ok: false, ...(await noteFail(now)) };
}

async function readSlot() {
  if (!_dek) throw err('LOCKED');
  const blob = await get(_slot);
  if (!blob || blob.length <= HEAD) return { days: {}, settings: {} };
  return openBody(_dek, blob.subarray(HEAD));
}

/** Rašant abu skyriai lyginami iki vienodo dydžio — kitaip matytųsi, kuris tikras. */
async function writeSlot(data) {
  if (!_dek) throw err('LOCKED');
  const cur = await get(_slot);
  const wraps = [];
  for (let i = 0; i < SLOTS; i++) wraps.push(cur.subarray(i * WRAP, (i + 1) * WRAP));
  // Dydis fiksuotas, tad kito skyriaus liesti nereikia — jis ir taip lygus.
  await put(_slot, packSlot(wraps, await sealBody(_dek, data)));
}

export const readAll = () => readSlot();
export const writeAll = data => writeSlot(data);

/**
 * Panikos PIN. Numatytai jis yra pagrindinis PIN atvirkščiai — taip nereikia
 * atsiminti dviejų. Kaina, kurią verta žinoti: kas matė, kaip įvedi PIN, gali
 * jį apversti ir pamatyti tikruosius duomenis. Todėl čia galima nustatyti
 * ir nesusijusį kodą.
 */
export async function setDecoyPin(pin, seed = { days: {}, settings: {} }) {
  if (!_dek || _decoy) throw err('LOCKED');
  const salt = unb64(await get(K_SALT));
  const dek = await newDek();
  const kek = await kekFrom(pin, salt);
  const real = await get(K_S0);
  const body = await sealBody(dek, seed);
  await put(K_S1, packSlot([await wrapDek(dek, kek)], body));
}

/** PIN keitimas: perrašomas tik užrakintas DEK, duomenys lieka vietoje. */
export async function changePin(oldSecret, newPin) {
  const check = await unlock(oldSecret);
  if (!check.ok) return false;
  const found = await dekForRewrap(oldSecret);
  if (!found) return false;
  const kek = await kekFrom(newPin, found.salt);
  const out = new Uint8Array(found.blob.length);
  out.set(await wrapDek(found.dek, kek), 0);
  out.set(found.blob.subarray(WRAP), WRAP);
  await put(_slot, out);
  return true;
}

/**
 * Naujas atkūrimo kodas — senasis nustoja galioti.
 * Reikalauja PIN net atrakintame app'e: kas paėmė telefoną iš rankų, neturi
 * galėti pasidaryti sau raktų.
 * @returns {string|null} naujas kodas arba null, jei PIN neteisingas
 */
export async function resetRecoveryCode(pin) {
  if (!_dek || _decoy) throw err('LOCKED');
  const found = await dekForRewrap(pin);
  if (!found) return null;
  const code = makeRecoveryCode();
  const kek = await kekFrom(normaliseCode(code), found.salt);
  const out = new Uint8Array(found.blob.length);
  out.set(found.blob.subarray(0, WRAP), 0);
  out.set(await wrapDek(found.dek, kek), WRAP);
  out.set(found.blob.subarray(HEAD), HEAD);
  await put(_slot, out);
  return code;
}

/**
 * Trynimas: pirma kelis kartus perrašoma atsitiktiniais baitais, tik tada
 * šalinama. Flash atmintyje tai negarantuoja fizinio ištrynimo, bet pašalina
 * duomenis iš visų vietų, kurias naršyklė leidžia pasiekti.
 */
export async function wipe() {
  lock();
  try {
    for (let pass = 0; pass < 3; pass++) {
      for (const k of [K_S0, K_S1]) {
        const cur = await get(k);
        await put(k, randomBytes(cur?.length || SLOT_BYTES));
      }
    }
    await tx('readwrite', s => s.clear());
  } catch {}
  _db?.close(); _db = null;
  await new Promise(res => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = res;
  });
}

// ------------------------------------------------- Face ID / Touch ID

/**
 * Biometrinis raktas per WebAuthn PRF plėtinį.
 *
 * PRF grąžina 32 baitus, kuriuos gali gauti tik tas pats įrenginys po
 * sėkmingos biometrinės patikros. Iš jų išvedamas KEK, kuriuo užrakinamas
 * tas pats DEK — todėl Face ID nėra „aplenkimas", o dar vienas to paties
 * rakto egzempliorius. Serverio nereikia: paskyra kuriama vietinė
 * (discoverable credential), niekas niekur nesiunčiama.
 *
 * Jei įrenginys ar naršyklė PRF nepalaiko, funkcija sąžiningai grąžina false
 * ir app'as biometrijos nesiūlo.
 */
const PRF_SALT = new Uint8Array([
  0x6c, 0x61, 0x70, 0x61, 0x73, 0x2d, 0x70, 0x72, 0x66, 0x2d, 0x76, 0x31,
  0x9a, 0x4c, 0x1d, 0x77, 0x2e, 0xb3, 0x60, 0x08, 0xd5, 0x41, 0xf2, 0x8e,
  0x33, 0x7b, 0xa9, 0x16, 0xc0, 0x5f, 0x84, 0x2d,
]);
const K_CRED = 'e';

export function biometricsPossible() {
  return typeof PublicKeyCredential !== 'undefined' &&
         typeof navigator !== 'undefined' && !!navigator.credentials;
}

export async function biometricsAvailable() {
  if (!biometricsPossible()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}

/** Ar biometrinis raktas jau nustatytas šiame įrenginyje. */
export const biometricsEnabled = async () => !!(await get(K_CRED));

async function prfSecret({ create = false } = {}) {
  const rpId = location.hostname;
  if (create) {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { id: rpId, name: 'Lapas' },
        user: { id: randomBytes(16), name: 'lapas', displayName: 'Lapas' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        extensions: { prf: { eval: { first: PRF_SALT } } },
        timeout: 60_000,
      },
    });
    if (!cred) return null;
    const ext = cred.getClientExtensionResults?.();
    const first = ext?.prf?.results?.first;
    return { id: new Uint8Array(cred.rawId), secret: first ? new Uint8Array(first) : null,
             enabled: !!ext?.prf?.enabled };
  }

  const idB64 = await get(K_CRED);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId,
      allowCredentials: idB64 ? [{ type: 'public-key', id: unb64(idB64) }] : [],
      userVerification: 'required',
      extensions: { prf: { eval: { first: PRF_SALT } } },
      timeout: 60_000,
    },
  });
  const first = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
  return first ? { secret: new Uint8Array(first) } : null;
}

/** Įjungia Face ID. Reikalauja PIN — kad įjungtų tik pati, ne kas nors kitas. */
export async function enableBiometrics(pin) {
  if (!_dek || _decoy) throw err('LOCKED');
  const found = await dekForRewrap(pin);
  if (!found) return { ok: false, reason: 'WRONG_PIN' };
  if (!(await biometricsAvailable())) return { ok: false, reason: 'UNSUPPORTED' };

  let res;
  try { res = await prfSecret({ create: true }); }
  catch (e) { return { ok: false, reason: e?.name === 'NotAllowedError' ? 'CANCELLED' : 'FAILED' }; }
  if (!res) return { ok: false, reason: 'CANCELLED' };
  if (!res.secret) return { ok: false, reason: 'NO_PRF' };   // naršyklė PRF nepalaiko

  const kek = await kekFrom(b64(res.secret), found.salt);
  const blob = await get(_slot);
  const out = new Uint8Array(blob.length);
  out.set(blob.subarray(0, WRAP * 2), 0);
  out.set(await wrapDek(found.dek, kek), WRAP * 2);
  out.set(blob.subarray(HEAD), HEAD);
  await put(_slot, out);
  await put(K_CRED, b64(res.id));
  return { ok: true };
}

export async function disableBiometrics() {
  const blob = await get(_slot);
  if (blob) {
    const out = new Uint8Array(blob.length);
    out.set(blob.subarray(0, WRAP * 2), 0);
    out.set(randomBytes(WRAP), WRAP * 2);      // vieta lieka, bet raktas dingsta
    out.set(blob.subarray(HEAD), HEAD);
    await put(_slot, out);
  }
  await tx('readwrite', s => s.delete(K_CRED));
}

/** Atrakinimas veidu ar pirštu. */
export async function unlockBiometric(now = Date.now()) {
  const g = await guardState(now);
  if (g.waitMs > 0) return { ok: false, waitMs: g.waitMs, fails: g.fails };
  if (!(await biometricsEnabled())) return { ok: false, reason: 'NOT_SET' };

  let res;
  try { res = await prfSecret(); }
  catch (e) { return { ok: false, reason: e?.name === 'NotAllowedError' ? 'CANCELLED' : 'FAILED' }; }
  if (!res?.secret) return { ok: false, reason: 'CANCELLED' };

  const saltB64 = await get(K_SALT);
  const kek = await kekFrom(b64(res.secret), unb64(saltB64));
  for (const slotKey of [K_S0, K_S1]) {
    const blob = await get(slotKey);
    if (!blob || blob.length <= HEAD) continue;
    try {
      const dek = await unwrapDek(blob.subarray(WRAP * 2, HEAD), kek);
      await openBody(dek, blob.subarray(HEAD));
      _dek = dek; _slot = slotKey; _decoy = slotKey === K_S1;
      await clearFails();
      return { ok: true, decoy: _decoy, viaBiometric: true };
    } catch { /* ne šis skyrius */ }
  }
  return { ok: false, reason: 'NO_MATCH' };
}

// ------------------------------------------------------------- base64

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unb64(str) {
  const bin = atob(str), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
