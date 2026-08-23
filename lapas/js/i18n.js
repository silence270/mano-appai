/* Lapas — kalbos.
 *
 * Kalbos gyvena atskiruose failuose (js/lang/*.js) ir įkeliamos tik tada, kai
 * prireikia — kitaip 24 kalbos gultų į kiekvieną paleidimą.
 *
 * Datos, mėnesių pavadinimai, savaitės dienos ir daugiskaita NĖRA verčiami
 * rankomis. Tai daro naršyklės Intl: jis moka ir lietuvišką kilmininką
 * („rugpjūčio 23 d."), ir lenkišką daugiskaitą, ir graikišką abėcėlę. Rankomis
 * to padaryti 24 kalboms neįmanoma nesuklystant.
 */

'use strict';

/**
 * Kalbos, kurios IŠ TIKRŲJŲ išverstos. Sąrašas trumpas sąmoningai: rodyti
 * kalbą, kurios nėra, reikštų parodyti vartotojai pusiau anglišką app'ą.
 * Naujos pridedamos čia tik kartu su js/lang/<id>.js failu.
 */
export const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'lt', label: 'Lietuvių' },
  { id: 'de', label: 'Deutsch' },
  { id: 'pl', label: 'Polski' },
];

const KNOWN = new Set(LANGS.map(l => l.id));
const loaded = {};              // { lt: {...}, en: {...} }
let current = 'en';
let fallback = {};              // EN — visada įkelta

/** Įkelia kalbą. EN visada pasilieka atsargai, jei kur nors trūktų eilutės. */
export async function loadLang(lang) {
  const id = KNOWN.has(lang) ? lang : 'en';
  if (!loaded.en) loaded.en = (await import('./lang/en.js')).default;
  fallback = loaded.en;
  if (!loaded[id]) {
    try { loaded[id] = (await import(`./lang/${id}.js`)).default; }
    catch { loaded[id] = loaded.en; }
  }
  current = id;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = id;
    document.documentElement.dir = 'ltr';     // ES kalbose RTL nėra
  }
  return id;
}

export function setLang(lang) {
  const id = KNOWN.has(lang) ? lang : 'en';
  if (loaded[id]) {
    current = id;
    if (typeof document !== 'undefined') document.documentElement.lang = id;
  }
  return current;
}

export const getLang = () => current;
export const isLoaded = lang => !!loaded[lang];

export function detectLang() {
  const list = (typeof navigator !== 'undefined' && navigator.languages) || ['en'];
  for (const l of list) {
    const base = String(l).toLowerCase().split('-')[0];
    if (KNOWN.has(base)) return base;
  }
  return 'en';
}

/** t('period_in_days', {n: 3}). Trūkstamas vertimas krenta į anglišką. */
export function t(key, vars) {
  let s = loaded[current]?.[key] ?? fallback[key] ?? key;
  if (vars && typeof s === 'string') {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

/** Testams ir vientisumo patikroms. */
export const dictionaries = loaded;

// ---------------------------------------------------------------- Intl

const cache = new Map();
function fmt(opts) {
  const key = current + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat(current, { timeZone: 'UTC', ...opts }));
  return cache.get(key);
}

const asDate = iso => new Date(`${iso}T12:00:00Z`);

/** „rugpjūčio 23 d." · „23 August" · „23. August" — kiekvienoje kalboje savaip. */
export function formatDate(iso, opts = {}) {
  return fmt({ day: 'numeric', month: 'long', ...(opts.year ? { year: 'numeric' } : {}) })
    .format(asDate(iso));
}

/**
 * Datų intervalas be kartojimosi: „rugsėjo 4–12 d."
 * Intl duoda „rugsėjo 4–12", bet lietuviškai data baigiasi „d." — tą uodegą
 * prideda pati kalba per raktą `date_range`, nes ne visose ji reikalinga.
 */
export function formatRange(from, to) {
  const f = fmt({ day: 'numeric', month: 'long' });
  const range = f.formatRange ? f.formatRange(asDate(from), asDate(to))
                              : `${formatDate(from)} – ${formatDate(to)}`;
  const tpl = loaded[current]?.date_range ?? fallback.date_range;
  return tpl ? tpl.replaceAll('{range}', range) : range;
}

/**
 * Mėnesio pavadinimas kalendoriaus antraštei. Su metais — kad kalbose, kuriose
 * mėnuo linksniuojamas (graikų, lietuvių), Intl duotų antraštei tinkamą formą,
 * o ne kilmininką iš datos.
 */
export function monthName(i, year = new Date().getUTCFullYear()) {
  return fmt({ month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, i, 15, 12)));
}

/** Savaitės dienų raidės, indeksuotos pagal Date.getUTCDay() (0 = sekmadienis). */
export function weekdayLetters() {
  const f = fmt({ weekday: 'narrow' });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 7 + i, 12))));
}

export function formatShort(iso) { return iso.slice(5); }

// ------------------------------------------------------------ daugiskaita

/**
 * Skaičiuotiniai linksniai per Intl.PluralRules. Vertimų faile kiekviena tokia
 * eilutė yra objektas: { one: '{n} ciklą', few: '{n} ciklus', other: '{n} ciklų' }.
 * Lietuvių, lenkų ar airių taisyklės skiriasi, bet Intl jas žino.
 */
export function plural(key, n) {
  const forms = loaded[current]?.[key] ?? fallback[key];
  if (!forms) return `${n}`;
  if (typeof forms === 'string') return forms.replaceAll('{n}', n);
  const rule = new Intl.PluralRules(current).select(n);
  const s = forms[rule] ?? forms.other ?? forms.one ?? `${n}`;
  return s.replaceAll('{n}', n);
}

export const cycleCount = n => plural('n_cycles', n);
export const dayCount = n => plural('n_days', n);

/** Katalogo elemento pavadinimas dabartine kalba. */
export function name(item) {
  if (!item) return '';
  return item[current] || item.en || item.lt || '';
}
