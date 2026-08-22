/* Lapas — duomenų išnešimas ir perkėlimas.
 *
 * Du keliai, abu be jokio serverio:
 *   1) Failas — .json, pasirenkamai užšifruotas slaptažodžiu.
 *   2) QR — senas telefonas rodo kadrų srautą, naujas nuskaito kamera.
 *
 * QR srauto formatas (viena teksto eilutė kadre):
 *   LP1|<seq>|<total>|<baitų viso>|<gabalo dydis>|<crc32>|<vėliavos>|<base64 gabalas>
 * Vėliavos: „z" suspausta, „e" užšifruota (gali būti „ze").
 * Gabalo dydis header'yje leidžia atmesti sugadintą kadrą iškart, o ne sugriūti
 * pačioje pabaigoje surenkant.
 *
 * Tvarka svarbi: suspaudžiama PIRMA, šifruojama PASKUI. Atvirkščiai gzip neturėtų
 * ką spausti — šifrograma statistiškai atsitiktinė, ir kadrų būtų ~40 % daugiau.
 * Kadrai rodomi maišyta tvarka: jei kamera reguliariai praleidžia kas antrą
 * kadrą, cikliška tvarka amžinai praleistų tuos pačius gabalus.
 */

'use strict';

import { encryptJSON, decryptJSON, encryptBytes, decryptBytes, isEncrypted, b64, unb64 } from './crypto.js';

export const FILE_VERSION = 1;

// ------------------------------------------------------------ suspaudimas

const hasCompression = typeof CompressionStream !== 'undefined';

async function gzip(bytes) {
  if (!hasCompression) return { z: false, bytes };
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return { z: true, bytes: new Uint8Array(await new Response(s).arrayBuffer()) };
}

async function gunzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// ------------------------------------------------------------------ crc32

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return ((c ^ 0xFFFFFFFF) >>> 0).toString(36);
}

// ------------------------------------------------------------------ failas

export function buildPayload(days, settings) {
  return {
    app: 'lapas',
    v: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    dayCount: Object.keys(days).length,
    days,
    settings: { ...settings, onboarded: true },
  };
}

/** @returns {{blob:Blob, filename:string}} */
export async function exportFile(days, settings, password) {
  let payload = buildPayload(days, settings);
  if (password) {
    payload = { app: 'lapas', v: FILE_VERSION, exportedAt: payload.exportedAt, enc: await encryptJSON(payload, password) };
  }
  const json = JSON.stringify(payload, null, password ? 0 : 1);
  return {
    blob: new Blob([json], { type: 'application/json' }),
    filename: `lapas-${new Date().toISOString().slice(0, 10)}${password ? '-enc' : ''}.json`,
  };
}

/**
 * @throws Error su .code: BAD_FILE | NEED_PASSWORD | WRONG_SECRET
 */
export async function parseFile(text, password) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw codeErr('BAD_FILE'); }
  if (!obj || obj.app !== 'lapas') throw codeErr('BAD_FILE');
  if (obj.enc) {
    if (!password) throw codeErr('NEED_PASSWORD');
    if (!isEncrypted(obj.enc)) throw codeErr('BAD_FILE');
    obj = await decryptJSON(obj.enc, password);          // meta WRONG_SECRET
  }
  if (!obj.days || typeof obj.days !== 'object') throw codeErr('BAD_FILE');
  return obj;
}

function codeErr(code) { const e = new Error(code); e.code = code; return e; }

/** Sujungimas: naujesnis įrašas laimi tik ten, kur senojo lauko nebuvo. */
export function mergeDays(current, incoming) {
  const out = { ...current };
  for (const [d, entry] of Object.entries(incoming)) {
    out[d] = out[d] ? { ...entry, ...out[d] } : entry;
  }
  return out;
}

// --------------------------------------------------------------- QR srautas

const MAGIC = 'LP1';
const CHUNK = 560;            // baitų viename kadre — telpa į patogiai skaitomą QR

/**
 * Duomenys → kadrų tekstai.
 * @param {Object} payload
 * @param {string} [code] perdavimo kodas; su juo srautas užšifruojamas
 */
export async function buildFrames(payload, code) {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  const { z, bytes: packed } = await gzip(raw);
  const bytes = code ? await encryptBytes(packed, code) : packed;
  const flags = `${z ? 'z' : ''}${code ? 'e' : ''}` || '-';
  const sum = crc32(bytes);
  const total = Math.ceil(bytes.length / CHUNK);
  const frames = [];
  for (let i = 0; i < total; i++) {
    const part = bytes.subarray(i * CHUNK, (i + 1) * CHUNK);
    frames.push(`${MAGIC}|${i}|${total}|${bytes.length}|${CHUNK}|${sum}|${flags}|${b64(part)}`);
  }
  return frames;
}

/** Rinkėjas: maitini nuskaitytais tekstais, jis pasako, kada viskas surinkta. */
export function createCollector() {
  const parts = new Map();
  let total = null, len = null, sum = null, zip = null, enc = null, chunk = null;

  return {
    get progress() { return total ? parts.size / total : 0; },
    get total() { return total; },
    get got() { return parts.size; },
    /** @returns {'ok'|'dup'|'bad'|'done'} */
    feed(text) {
      if (typeof text !== 'string' || !text.startsWith(MAGIC + '|')) return 'bad';
      const [, seqS, totalS, lenS, chunkS, sumS, flags, data] = text.split('|');
      const seq = +seqS, tot = +totalS, ln = +lenS, ch = +chunkS;
      if (![seq, tot, ln, ch].every(Number.isInteger) || tot < 1 || ch < 1 || ln < 1) return 'bad';
      if (seq < 0 || seq >= tot || Math.ceil(ln / ch) !== tot) return 'bad';
      if (total === null) { total = tot; len = ln; sum = sumS; zip = flags.includes('z'); enc = flags.includes('e'); chunk = ch; }
      else if (tot !== total || sumS !== sum || ln !== len) return 'bad';  // kitas siuntimas
      if (parts.has(seq)) return 'dup';

      let bytes;
      try { bytes = unb64(data); } catch { return 'bad'; }
      // Sugadintą kadrą atmetame čia: siuntėjas jį parodys dar kartą kitame rate.
      const expect = seq === total - 1 ? len - (total - 1) * chunk : chunk;
      if (bytes.length !== expect) return 'bad';

      parts.set(seq, bytes);
      return parts.size === total ? 'done' : 'ok';
    },
    /** @throws CRC_MISMATCH | WRONG_SECRET */
    async assemble(code) {
      if (total === null || parts.size !== total) throw codeErr('INCOMPLETE');
      const buf = new Uint8Array(len);
      let at = 0;
      for (let i = 0; i < total; i++) {
        const p = parts.get(i);
        if (!p || at + p.length > len) throw codeErr('CRC_MISMATCH');
        buf.set(p, at); at += p.length;
      }
      if (at !== len || crc32(buf) !== sum) throw codeErr('CRC_MISMATCH');
      let bytes = buf;
      if (enc) {
        if (!code) throw codeErr('NEED_PASSWORD');
        bytes = await decryptBytes(bytes, code);       // meta WRONG_SECRET
      }
      const raw = zip ? await gunzip(bytes) : bytes;
      return JSON.parse(new TextDecoder().decode(raw));
    },
    reset() { parts.clear(); total = len = sum = zip = enc = chunk = null; },
  };
}

/** Kadrų tvarka: kas ratą kita permutacija, kad kamera nepraleistų tų pačių. */
export function shuffleOrder(n, round) {
  const idx = Array.from({ length: n }, (_, i) => i);
  // deterministinis maišymas be Math.random — kad kadrų eilė būtų atkuriama
  let seed = (round * 2654435761 + 1) >>> 0;
  for (let i = n - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** 6 skaitmenų perdavimo kodas. */
export function transferCode() {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return String(((b[0] << 16 | b[1] << 8 | b[2]) % 900000) + 100000);
}

// ---------------------------------------------------- bibliotekų įkėlimas

const loaded = {};
export function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('LIB_FAIL'));
    document.head.append(s);
  });
  return loaded[src];
}
