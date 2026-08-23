/* Lapas — duomenų valymas.
 *
 * Naudojamas dviejose vietose: importuojant failą ar QR srautą (duomenys iš
 * išorės) ir skaitant saugyklą (duomenys galėjo būti įrašyti senesnės versijos
 * arba sugadinti). Vienas sugadintas laukas neturi sulaužyti grafiko ar prognozės.
 */

'use strict';

const ID_RE = /^[a-z][a-z_0-9]{0,39}$/;
const MAX_NOTES = 2000;

/** Ar tai tikra kalendorinė data „YYYY-MM-DD" (ne 2026-13-45). */
export function isRealDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (y < 1900 || y > 2200 || m < 1 || m > 12) return false;
  return d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const num = (v, lo, hi, dec = 2) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n) || n < lo || n > hi) return undefined;
  return +n.toFixed(dec);
};

/** Sąrašas trumpų id — be gilių objektų, be dublikatų, ribotas ilgis. */
const ids = v => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter(x => typeof x === 'string' && ID_RE.test(x)))].slice(0, 60);
  return out.length ? out : undefined;
};

/**
 * Importuoti duomenys ateina iš failo ar QR — t. y. iš vietos, kurios app'as
 * nekontroliuoja. Netikrinti jų reikštų leisti vienam sugadintam laukui sulaužyti
 * grafikus ar prognozę. Nežinomi laukai išmetami, blogos reikšmės — irgi;
 * likusi diena išsaugoma.
 *
 * ID pagal katalogą NEfiltruojami sąmoningai: senesnėje versijoje pažymėtas
 * simptomas turi išlikti net jei katalogas nuo tada pasikeitė.
 *
 * @returns {{days:Object, kept:number, dropped:number, cleaned:number}}
 */
export function sanitizeDays(raw) {
  const days = {};
  let dropped = 0, cleaned = 0;
  if (!raw || typeof raw !== 'object') return { days, kept: 0, dropped: 0, cleaned: 0 };

  for (const [iso, entry] of Object.entries(raw)) {
    if (!isRealDate(iso) || !entry || typeof entry !== 'object' || Array.isArray(entry)) { dropped++; continue; }

    const before = Object.keys(entry).length;
    const e = {};
    const flow = num(entry.flow, 0, 4, 0);
    if (flow !== undefined && flow > 0) e.flow = Math.round(flow);

    for (const k of ['symptoms', 'mood', 'sex', 'tests', 'meds']) {
      const v = ids(entry[k]);
      if (v) e[k] = v;
    }
    if (typeof entry.mucus === 'string' && ID_RE.test(entry.mucus)) e.mucus = entry.mucus;
    if (entry.lh === 'pos' || entry.lh === 'neg') e.lh = entry.lh;
    if (entry.preg === 'pos' || entry.preg === 'neg') e.preg = entry.preg;
    if (entry.periodEnded === true) e.periodEnded = true;

    const bbt = num(entry.bbt, 30, 45);
    if (bbt !== undefined) e.bbt = bbt;
    const weight = num(entry.weight, 20, 400, 1);
    if (weight !== undefined) e.weight = weight;
    const energy = num(entry.energy, 1, 5, 0);
    if (energy !== undefined) e.energy = Math.round(energy);
    const sleep = num(entry.sleep, 0, 24, 1);
    if (sleep !== undefined) e.sleep = sleep;

    if (typeof entry.notes === 'string' && entry.notes.trim()) e.notes = entry.notes.slice(0, MAX_NOTES);

    if (Object.keys(e).length) {
      days[iso] = e;
      if (Object.keys(e).length !== before) cleaned++;
    } else dropped++;
  }
  return { days, kept: Object.keys(days).length, dropped, cleaned };
}

/** Nustatymai iš svetimo failo — tik žinomi laukai ir tik prasmingos reikšmės. */
export function sanitizeSettings(raw) {
  const s = {};
  if (!raw || typeof raw !== 'object') return s;
  const year = new Date().getUTCFullYear();
  // 24 ES kalbos — sąrašas laikomas čia, kad valymas neatmestų teisėtos kalbos
  const LANG_IDS = ['bg','cs','da','de','el','en','es','et','fi','fr','ga','hr',
                    'hu','it','lt','lv','mt','nl','pl','pt','ro','sk','sl','sv'];
  if (LANG_IDS.includes(raw.lang)) s.lang = raw.lang;
  if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
  if (['track', 'ttc', 'pregnancy', 'contraception', 'perimenopause'].includes(raw.mode)) s.mode = raw.mode;
  const cyc = num(raw.avgCycle, 15, 90, 0);
  if (cyc !== undefined) s.avgCycle = Math.round(cyc);
  const per = num(raw.avgPeriod, 1, 14, 0);
  if (per !== undefined) s.avgPeriod = Math.round(per);
  const by = num(raw.birthYear, year - 70, year - 8, 0);
  if (by !== undefined) s.birthYear = Math.round(by);
  if (raw.weekStart === 0 || raw.weekStart === 1) s.weekStart = raw.weekStart;
  for (const k of ['pregnancyStart', 'contraceptionStoppedAt', 'backupReminderAt']) {
    if (isRealDate(raw[k])) s[k] = raw[k];
  }
  return s;
}


