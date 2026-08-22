/* Lapas — šifravimas.
 *
 * Naudojamas dviem vietoms:
 *   1) PIN užraktas — visa saugykla telefone laikoma užšifruota.
 *   2) Eksporto failas — .lapas failas, kurio be slaptažodžio neatidarys niekas.
 *
 * PBKDF2-SHA256 → AES-GCM-256. Viskas per WebCrypto, be jokių bibliotekų.
 * Iteracijų daug (PIN dažnai trumpas — lėtas raktų vedimas yra vienintelė gynyba).
 */

'use strict';

const ITER = 310_000;                 // OWASP 2023 rekomendacija PBKDF2-SHA256
const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }

async function deriveKey(secret, salt, iterations = ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @returns {{v:1, salt:string, iv:string, iter:number, ct:string}}
 */
export async function encryptJSON(obj, secret) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await deriveKey(secret, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, salt: b64(salt), iv: b64(iv), iter: ITER, ct: b64(new Uint8Array(ct)) };
}

/** Meta klaidą `WRONG_SECRET`, jei slaptažodis netinka (AES-GCM pats tai aptinka). */
export async function decryptJSON(blob, secret) {
  const salt = unb64(blob.salt), iv = unb64(blob.iv);
  const key = await deriveKey(secret, salt, blob.iter || ITER);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, unb64(blob.ct));
  } catch {
    const e = new Error('WRONG_SECRET'); e.code = 'WRONG_SECRET'; throw e;
  }
  return JSON.parse(dec.decode(plain));
}

/** Šifravimas baitams (ne objektui): srautui, kur pirma suspaudžiama, tada šifruojama.
 *  Grąžina salt(16) + iv(12) + šifrogramą viename masyve. */
export async function encryptBytes(bytes, secret) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = await deriveKey(secret, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(28 + ct.length);
  out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
  return out;
}

/** @throws WRONG_SECRET */
export async function decryptBytes(blob, secret) {
  if (blob.length <= 28) { const e = new Error('WRONG_SECRET'); e.code = 'WRONG_SECRET'; throw e; }
  const key = await deriveKey(secret, blob.subarray(0, 16));
  try {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.subarray(16, 28) }, key, blob.subarray(28)));
  } catch {
    const e = new Error('WRONG_SECRET'); e.code = 'WRONG_SECRET'; throw e;
  }
}

export function isEncrypted(x) {
  return !!x && typeof x === 'object' && x.v === 1 && typeof x.ct === 'string' && typeof x.salt === 'string';
}

// --- base64 be tarpinių eilučių -------------------------------------------

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function unb64(str) {
  const bin = atob(str), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** PIN patikrai — kad nereikėtų iššifruoti visos saugyklos vien dėl užrakto ekrano. */
export async function pinCheck(pin, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unb64(salt), iterations: ITER, hash: 'SHA-256' }, base, 256);
  return b64(new Uint8Array(bits));
}
