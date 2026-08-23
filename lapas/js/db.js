/* Lapas — saugykla.
 *
 * IndexedDB, ne localStorage: Safari ITP gali išvalyti localStorage po 7 dienų
 * nenaudojimo, o čia guli metų duomenys. IndexedDB pridėtame į pagrindinį ekraną
 * app'e yra „ilgaamžė" saugykla.
 *
 * Nieko niekur nesiunčia. Vienintelis kelias duomenims išeiti — eksportas arba QR.
 */

'use strict';

import { encryptJSON, decryptJSON, isEncrypted, randomBytes, b64, pinCheck } from './crypto.js';

const DB_NAME = 'lapas';
const STORE = 'vault';
const VERSION = 1;

let _db = null;
let _key = null;          // atrakinimo slaptažodis (PIN) atmintyje, kol app'as atidarytas

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
    const s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out?.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

const rawGet = k => tx('readonly', s => s.get(k));
const rawPut = (k, v) => tx('readwrite', s => s.put(v, k));
const rawDel = k => tx('readwrite', s => s.delete(k));

// --- vieša API -------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  lang: null,                 // null = pagal telefoną
  theme: 'auto',              // auto | light | dark
  mode: 'track',              // track | ttc | pregnancy | contraception
  avgCycle: 28,
  avgPeriod: 5,
  birthYear: null,
  contraceptionStoppedAt: null,
  pregnancyStart: null,
  weekStart: 1,               // 1 = pirmadienis
  units: 'metric',
  showFertile: true,
  backupReminderAt: null,
  onboarded: false,
};

/** Ar saugykla užrakinta PIN'u ir dar neatrakinta šioje sesijoje. */
export async function isLocked() {
  const meta = await rawGet('meta');
  return !!(meta?.pin) && _key === null;
}

export async function hasPin() {
  const meta = await rawGet('meta');
  return !!meta?.pin;
}

export async function unlock(pin) {
  const meta = await rawGet('meta');
  if (!meta?.pin) return true;
  const hash = await pinCheck(pin, meta.pin.salt);
  if (hash !== meta.pin.hash) return false;
  _key = pin;
  return true;
}

export function lock() { _key = null; }

export async function setPin(pin) {
  const days = await getDays(), settings = await getSettings();   // nuskaitom dar sena forma
  if (pin) {
    const salt = randomBytes(16);
    _key = pin;
    await rawPut('meta', { pin: { salt: b64(salt), hash: await pinCheck(pin, b64(salt)) } });
  } else {
    _key = null;
    await rawDel('meta');
  }
  await putDays(days);                                            // perrašom nauja forma
  await putSettings(settings);
}

async function readVal(key, fallback) {
  const v = await rawGet(key);
  if (v === undefined) return fallback;
  if (isEncrypted(v)) {
    if (_key === null) throw new Error('LOCKED');
    return decryptJSON(v, _key);
  }
  return v;
}

async function writeVal(key, value) {
  await rawPut(key, _key === null ? value : await encryptJSON(value, _key));
}

export const getDays = () => readVal('days', {});
export const putDays = d => writeVal('days', d);
export const getSettings = async () => ({ ...DEFAULT_SETTINGS, ...(await readVal('settings', {})) });
export const putSettings = s => writeVal('settings', s);

/** Vienos dienos įrašas — sujungiamas, o ne perrašomas. Tušti laukai išvalomi. */
export async function saveDay(iso, patch) {
  const days = await getDays();
  const merged = { ...(days[iso] || {}), ...patch };
  for (const [k, v] of Object.entries(merged)) {
    if (v === false) { delete merged[k]; continue; }
    if (v === null || v === undefined || v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (k === 'flow' && v === 0)) delete merged[k];
  }
  if (Object.keys(merged).length === 0) delete days[iso];
  else days[iso] = merged;
  await putDays(days);
  return days;
}

export async function updateSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  await putSettings(s);
  return s;
}

/** Viskas lauk — be atkūrimo. */
export async function wipe() {
  _key = null;
  await tx('readwrite', s => s.clear());
  _db?.close(); _db = null;
  await new Promise(res => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = res; });
}

/** Kiek vietos užima ir ar naršyklė pažadėjo duomenų netrinti. */
export async function storageInfo() {
  const out = { usage: null, persisted: false };
  try {
    if (navigator.storage?.estimate) out.usage = (await navigator.storage.estimate()).usage;
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch {}
  return out;
}

/** Paprašo naršyklės nelaikyti mūsų duomenų vienkartiniais. */
export async function requestPersistence() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; }
  catch { return false; }
}
