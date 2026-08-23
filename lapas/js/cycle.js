/* Lapas — ciklo variklis.
 *
 * Grynos funkcijos: jokio DOM, jokio tinklo, jokio localStorage.
 * Tas pats failas veikia naršyklėje ir `node --test` testuose.
 *
 * Pagrindiniai principai:
 *  - Prognozę skaičiuoja predict.js: log-normalus Bajeso modelis, kuris mokosi
 *    iš pačios moters ciklų ir grąžina ne dieną, o intervalą su pasitikėjimo lygiu.
 *  - Ovuliacija imama iš Johnson 2018 lentelės (949 moterys, kasdienis LH),
 *    o NE iš „ciklo ilgis minus 14": ta taisyklė trumpiems ciklams nustumia
 *    ovuliaciją per anksti apie 4 dienas, ir tik ~24 % ovuliacijų įvyksta 14–15 d.
 *  - Kūno požymiai (BBT, gleivės, LH) VIRŠIJA kalendorių: jei temperatūra patvirtino
 *    ovuliaciją, kalendoriaus spėjimas atmetamas.
 *  - Kur duomenų per mažai — grąžinamas platus langas ir žemas `confidence`,
 *    o ne apsimestinis tikslumas.
 */

'use strict';

import * as P from './predict.js';

// ---------------------------------------------------------------- konstantos

export const FLOW = { NONE: 0, SPOT: 1, LIGHT: 2, MEDIUM: 3, HEAVY: 4 };

/** Srautas nuo kurio diena laikoma menstruacine. Lašeliai (SPOT) — ne:
 *  priešmėnesinis rudas išskyrimas neturi pradėti naujo ciklo. */
const MENSTRUAL_MIN = FLOW.LIGHT;

/** Kiek tuščių dienų menstruacijų viduryje dar laikoma tuo pačiu epizodu. */
const EPISODE_GAP = 2;

/** Ciklai už šių ribų — akivaizdžiai ne ciklai (praleistas žymėjimas, klaida). */
export const CYCLE_MIN = 15;
export const CYCLE_MAX = 90;

/** Kiek paskutinių ciklų imama į prognozę. */
const HISTORY = 12;

/** Naujesnio ciklo svoris didesnis: svoris = HALF_LIFE ^ (kiek ciklų atgal). */
const DECAY = 0.85;

export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
/** Liuteininė fazė = dienų PO ovuliacijos iki kitų mėnesinių.
 *  28 d. ciklas su 14 d. liuteinine → ovuliacija 14-ą ciklo dieną. */
export const DEFAULT_LUTEAL = 12;   // Bull 2019: 12,4 ± 2,4 d (NE 14)
const LUTEAL_MIN = 9, LUTEAL_MAX = 17;

/** Vaisingas langas: spermatozoidai gyvena iki 5 d., kiaušinėlis ~1 d. */
const FERTILE_BEFORE = 5, FERTILE_AFTER = 1;

/** PMS langas prieš prognozuojamas mėnesines. */
const PMS_DAYS = 5;

export const PHASE = {
  MENSTRUAL: 'menstrual',
  FOLLICULAR: 'follicular',
  FERTILE: 'fertile',
  OVULATION: 'ovulation',
  LUTEAL: 'luteal',
  PMS: 'pms',
  PREGNANT: 'pregnant',
  UNKNOWN: 'unknown',
};

// ------------------------------------------------------------------- datos
// Visur dirbama su „YYYY-MM-DD" eilutėmis ir vidurdienio UTC laiku —
// taip vasaros/žiemos laikas niekada nepaslenka dienos per vieną.

export function iso(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toUTC(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 12, 0, 0);
}

export function addDays(isoStr, n) {
  return new Date(toUTC(isoStr) + n * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function todayISO(now = new Date()) { return iso(now); }

export function rangeDays(from, to) {
  const out = [];
  for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

// ------------------------------------------------------------- statistika

/** Svertinė mediana: reikšmė, ties kuria sukauptas svoris peržengia pusę. */
export function weightedMedian(values, weights) {
  if (!values.length) return null;
  const pairs = values.map((v, i) => [v, weights[i]]).sort((a, b) => a[0] - b[0]);
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let acc = 0;
  for (const [v, w] of pairs) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return pairs[pairs.length - 1][0];
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Robustiška sklaida: MAD × 1.4826 ≈ σ, bet atsparus vienam nukrypusiam ciklui. */
export function robustSigma(values) {
  if (values.length < 2) return null;
  const med = median(values);
  const mad = median(values.map(v => Math.abs(v - med)));
  // Grynai vienodų ciklų atveju MAD = 0 — vis tiek paliekam realistišką 1 d. paklaidą.
  return Math.max(mad * 1.4826, 0.75);
}

function decayWeights(n) {
  // paskutinis elementas = naujausias ciklas = didžiausias svoris
  return Array.from({ length: n }, (_, i) => Math.pow(DECAY, n - 1 - i));
}

// ------------------------------------------------------- epizodai ir ciklai

/**
 * Menstruaciniai epizodai iš dienų žemėlapio.
 * @param {Object<string,Object>} days  { '2026-08-01': {flow:3,…}, … }
 * @returns {{start:string,end:string,length:number,days:string[]}[]} chronologiškai
 */
export function periodEpisodes(days) {
  const marked = Object.keys(days)
    .filter(d => (days[d]?.flow ?? 0) >= MENSTRUAL_MIN)
    .sort();
  const eps = [];
  for (const d of marked) {
    const last = eps[eps.length - 1];
    if (last && daysBetween(last.end, d) <= EPISODE_GAP + 1) {
      last.end = d;
      last.days.push(d);
    } else {
      eps.push({ start: d, end: d, days: [d] });
    }
  }
  for (const e of eps) e.length = daysBetween(e.start, e.end) + 1;
  return eps;
}

/**
 * Ciklai = tarpai tarp epizodų pradžių. Paskutinis (vykstantis) ciklas
 * neįtraukiamas — jo ilgio dar nežinome.
 * @returns {{start:string,next:string,length:number,periodLength:number,valid:boolean}[]}
 */
export function cyclesFrom(days) {
  const eps = periodEpisodes(days);
  const out = [];
  for (let i = 0; i < eps.length - 1; i++) {
    const length = daysBetween(eps[i].start, eps[i + 1].start);
    out.push({
      start: eps[i].start,
      next: eps[i + 1].start,
      length,
      periodLength: eps[i].length,
      valid: length >= CYCLE_MIN && length <= CYCLE_MAX,
    });
  }
  return out;
}

// ------------------------------------------------------ kūno požymiai (BBT)

/**
 * Klasikinė simptoterminė „3 virš 6" taisyklė.
 * Ovuliacija patvirtinta, kai 3 dienos iš eilės aukštesnės už 6 ankstesnių
 * dienų aukščiausią, o trečioji — bent 0,2 °C aukščiau.
 * Ovuliacijos diena ≈ paskutinė žema diena (diena prieš pirmą pakilimą).
 *
 * @param {string[]} cycleDays  ciklo dienos chronologiškai
 * @returns {{ovulation:string, shiftStart:string, coverline:number}|null}
 */
export function bbtShift(days, cycleDays) {
  const pts = cycleDays
    .map(d => ({ d, t: days[d]?.bbt }))
    .filter(p => typeof p.t === 'number' && p.t > 30 && p.t < 42);
  if (pts.length < 9) return null;

  for (let i = 6; i <= pts.length - 3; i++) {
    const base = pts.slice(i - 6, i).map(p => p.t);
    const coverline = Math.max(...base);
    const rise = pts.slice(i, i + 3);
    if (rise.every(p => p.t > coverline) && rise[2].t >= coverline + 0.2) {
      return { ovulation: pts[i - 1].d, shiftStart: rise[0].d, coverline: +coverline.toFixed(2) };
    }
  }
  return null;
}

/** Gleivių „peak day" — paskutinė vaisingo tipo diena prieš sausėjimą. */
export function mucusPeak(days, cycleDays) {
  const FERTILE_MUCUS = new Set(['watery', 'eggwhite']);
  let peak = null;
  for (let i = 0; i < cycleDays.length; i++) {
    const m = days[cycleDays[i]]?.mucus;
    if (!FERTILE_MUCUS.has(m)) continue;
    const after = cycleDays.slice(i + 1, i + 4).map(d => days[d]?.mucus);
    if (after.length && after.every(x => !FERTILE_MUCUS.has(x))) peak = cycleDays[i];
    else if (i === cycleDays.length - 1) peak = cycleDays[i];
  }
  return peak;
}

/** LH pikas: teigiamas testas → ovuliacija maždaug po paros. */
export function lhSurge(days, cycleDays) {
  for (const d of cycleDays) if (days[d]?.lh === 'pos') return addDays(d, 1);
  return null;
}

/**
 * Sujungta ovuliacijos data vienam ciklui — kūnas viršija kalendorių.
 * @returns {{date:string, source:'bbt'|'lh'|'mucus'|'calendar', confirmed:boolean}|null}
 */
export function ovulationFor(days, cycleDays, cycleStart, predictedLength, lutealDays) {
  const bbt = bbtShift(days, cycleDays);
  if (bbt) return { date: bbt.ovulation, source: 'bbt', confirmed: true, coverline: bbt.coverline };

  const lh = lhSurge(days, cycleDays);
  if (lh) return { date: lh, source: 'lh', confirmed: false };

  const peak = mucusPeak(days, cycleDays);
  if (peak) return { date: addDays(peak, 1), source: 'mucus', confirmed: false };

  if (predictedLength && cycleStart) {
    // Johnson 2018 lentelė vietoj „ilgis minus 14". Jei iš patvirtintų ovuliacijų
    // jau žinome jos pačios liuteininę fazę, ji svarbesnė už populiacijos lentelę.
    const known = lutealDays && lutealDays !== DEFAULT_LUTEAL;
    // abi šakos grąžina CIKLO DIENĄ (1 = pirma mėnesinių diena)
    const cycleDay = known
      ? predictedLength - lutealDays
      : P.ovulationDay(predictedLength).day;
    return { date: addDays(cycleStart, Math.round(cycleDay) - 1), source: 'calendar',
             confirmed: false, personal: !!known };
  }
  return null;
}

/** Reali liuteininė fazė iš patvirtintų ovuliacijų — asmeninė, ne vadovėlinė. */
export function lutealLength(days, cycles) {
  const lens = [];
  for (const c of cycles) {
    if (!c.valid) continue;
    const cycleDays = rangeDays(c.start, addDays(c.next, -1));
    const shift = bbtShift(days, cycleDays);
    if (shift) {
      const len = daysBetween(shift.ovulation, c.next) - 1;
      if (len >= LUTEAL_MIN && len <= LUTEAL_MAX) lens.push(len);
    }
  }
  if (lens.length >= 2) return Math.round(median(lens));
  return DEFAULT_LUTEAL;
}

// -------------------------------------------------------------- prognozė

/**
 * Pilna ciklo būsena ir prognozė.
 *
 * @param {Object} data
 *   days      — { iso: DayEntry }
 *   settings  — { avgCycle, avgPeriod, mode, pregnancyStart, … }
 *   today     — ISO (testams)
 * @returns {Object} plati būsena UI'ui
 */
export function analyze({ days = {}, settings = {}, today = todayISO() } = {}) {
  const eps = periodEpisodes(days);
  const cycles = cyclesFrom(days);
  const valid = cycles.filter(c => c.valid);
  const recent = valid.slice(-24);
  const lengths = recent.map(c => c.length);

  const age = ageFrom(settings.birthYear, today);
  const opts = { age, bmi: settings.bmi ?? null, usualLength: settings.avgCycle ?? null };

  const post = P.fit(lengths, opts);
  const base = P.predict(post, 0.8);

  const lastPeriod = eps.length ? eps[eps.length - 1].start : null;
  const cycleStart = lastPeriod;
  const dayOfCycle = cycleStart ? daysBetween(cycleStart, today) + 1 : null;

  // Ar dabartinis „ciklas" iš tikrųjų yra keli nepažymėti ciklai?
  const skipped = dayOfCycle != null ? P.looksSkipped(dayOfCycle, lengths) : null;
  const stale = dayOfCycle != null && (dayOfCycle > CYCLE_MAX || !!skipped);

  // Prognozė ciklui vykstant: žinome, kad mėnesinės dar neprasidėjo, tad
  // skirstinys nupjaunamas ties šiandiena. Būtent čia modelis nurungia vidurkį.
  const live = cycleStart && !stale ? P.predictGiven(post, dayOfCycle - 1, 0.8) : base;

  const avgCycle = Math.round(base.median);
  const sigma = base.sigmaDays;
  const window = clamp(Math.round((live.hi - live.lo) / 2), 1, 21);

  const epLens = eps.slice(-24).map(e => e.length);
  const avgPeriod = epLens.length
    ? Math.round(P.median(epLens))
    : clamp(settings.avgPeriod ?? DEFAULT_PERIOD, 1, 14);

  const lutealDays = lutealLength(days, valid);
  const spread = P.cld(lengths);

  let nextPeriod = null, nextPeriodRange = null, ovulation = null, fertile = null;
  if (cycleStart && !stale) {
    nextPeriod = addDays(cycleStart, Math.round(live.median));
    nextPeriodRange = { from: addDays(cycleStart, Math.round(live.lo)),
                        to: addDays(cycleStart, Math.round(live.hi)) };

    const cycleDays = rangeDays(cycleStart, today);
    const ov = ovulationFor(days, cycleDays, cycleStart, base.median, lutealDays);
    if (ov) {
      ovulation = ov;
      const sd = ov.confirmed ? 0.6 : P.ovulationUncertainty(sigma);
      const ovDay = daysBetween(cycleStart, ov.date);   // poslinkis nuo ciklo pradžios
      const w = P.fertileWindow(ovDay, ov.source === 'calendar' ? sd : Math.min(sd, 1.6), 0.8);
      fertile = {
        from: addDays(cycleStart, Math.round(w.from)),
        to: addDays(cycleStart, Math.round(w.to)),
        core: { from: addDays(ov.date, -5), to: ov.date },
        sd: +sd.toFixed(2),
      };
    }
  }

  const daysUntilPeriod = nextPeriod ? daysBetween(today, nextPeriod) : null;
  // Vėlavimas matuojamas nuo pradinės (ciklo pradžioje duotos) prognozės — sąlyginė
  // prognozė ciklui vykstant visada slenka į priekį, tad pagal ją niekada nevėluotum.
  const expected = cycleStart && !stale ? addDays(cycleStart, Math.round(base.median)) : null;
  const late = expected && !stale ? Math.max(0, daysBetween(expected, today)) : 0;

  const quality = dataQuality({ lengths, spread, age, settings, today, cycleStart, dayOfCycle, skipped });
  const confidence = quality.level === 'none' ? 'low'
    : window <= 2 ? 'high' : window <= 5 ? 'medium' : 'low';

  const phase = currentPhase({
    days, today, cycleStart, dayOfCycle, avgPeriod,
    nextPeriod, ovulation, fertile, settings, stale,
  });

  return {
    today, days,
    mode: settings.mode || 'track',
    cycleStart, dayOfCycle: stale ? null : dayOfCycle, stale, skipped,
    avgCycle, avgPeriod, sigma: +sigma.toFixed(2), spread,
    window, confidence, quality,
    basis: lengths.length >= 2 ? 'history' : lengths.length ? 'single' : 'default',
    lutealDays, age,
    cycles, validCycles: valid, episodes: eps,
    nextPeriod, nextPeriodRange,
    ovulation, fertile,
    daysUntilPeriod, late,
    phase,
    post, prediction: live,
    pregnancy: settings.mode === 'pregnancy'
      ? pregnancyInfo(settings.pregnancyStart || lastPeriod, today, avgCycle) : null,
  };
}

/** Amžius iš gimimo metų. Prognozės prior priklauso nuo amžiaus (Bull 2019). */
export function ageFrom(birthYear, today = todayISO()) {
  if (!birthYear) return null;
  const age = +today.slice(0, 4) - birthYear;
  return age >= 9 && age <= 65 ? age : null;
}

/**
 * Kada app'as privalo pasakyti „nežinau" vietoj netikros prognozės.
 * Kiekviena priežastis paremta literatūra — žr. README-MOKSLAS.md.
 * @returns {{level:'none'|'weak'|'ok', reasons:string[]}}
 */
export function dataQuality({ lengths, spread, age, settings, today, cycleStart, dayOfCycle, skipped }) {
  const reasons = [];

  if (lengths.length < 3) reasons.push('few_cycles');            // <3 ciklų — nėra iš ko vertinti kintamumo
  if (spread != null && spread >= 6) reasons.push('irregular');  // median(CLD) ≥ 6 d — 31 % moterų
  if (lengths.length >= 3) {
    const short = lengths.filter(l => l < 21).length;
    const long = lengths.filter(l => l > 38).length;
    if (short >= 2 || long >= 2) reasons.push('out_of_range');   // FIGO: <24 trumpas, >38 ilgas
  }
  if (age != null && age >= 45 && spread != null && spread >= 7) reasons.push('perimenopause');
  if (age != null && age < 20) reasons.push('young');            // nusistovi ~6 ginekologiniais metais
  if (settings.mode === 'postpartum' || settings.postpartumUntil) reasons.push('postpartum');
  if (settings.contraceptionStoppedAt &&
      daysBetween(settings.contraceptionStoppedAt, today) < 60) reasons.push('after_hormones');
  if (skipped) reasons.push('maybe_skipped');
  if (cycleStart && dayOfCycle > 90) reasons.push('very_long');  // >90 d — ne prognozės klausimas

  const blocking = reasons.some(r =>
    ['few_cycles', 'perimenopause', 'after_hormones', 'very_long', 'maybe_skipped'].includes(r));
  return {
    level: reasons.length === 0 ? 'ok' : blocking ? 'none' : 'weak',
    reasons,
  };
}

function currentPhase({ days, today, cycleStart, dayOfCycle, avgPeriod,
                        nextPeriod, ovulation, fertile, settings, stale }) {
  if (settings.mode === 'pregnancy') return PHASE.PREGNANT;
  if (!cycleStart || stale) return PHASE.UNKNOWN;

  if ((days[today]?.flow ?? 0) >= MENSTRUAL_MIN) return PHASE.MENSTRUAL;
  if (dayOfCycle <= avgPeriod && (days[today]?.flow ?? 0) > 0) return PHASE.MENSTRUAL;

  if (ovulation && ovulation.date === today) return PHASE.OVULATION;
  const core = fertile?.core;
  if (core && daysBetween(core.from, today) >= 0 && daysBetween(today, core.to) >= 0)
    return PHASE.FERTILE;

  if (nextPeriod && daysBetween(today, nextPeriod) <= PMS_DAYS && daysBetween(today, nextPeriod) >= 0)
    return PHASE.PMS;

  if (ovulation && daysBetween(ovulation.date, today) > 0) return PHASE.LUTEAL;
  return PHASE.FOLLICULAR;
}

/**
 * Nėštumo informacija. Naegele 280 d. nuo paskutinių mėnesinių prielaida yra
 * 28 d. ciklas su ovuliacija 14-ą dieną. Ilgesniam ar trumpesniam ciklui
 * apvaisinimas įvyksta atitinkamai vėliau ar anksčiau, todėl terminas slenka
 * kartu (Parikh korekcija). 32 d. ciklui tai +4 dienos.
 */
export function pregnancyInfo(lmp, today = todayISO(), cycleLength = 28) {
  if (!lmp) return null;
  const days = daysBetween(lmp, today);
  if (days < 0) return null;
  const shift = clamp(Math.round((cycleLength || 28) - 28), -7, 14);
  const week = Math.floor(days / 7);
  return {
    lmp, cycleShift: shift,
    due: addDays(lmp, 280 + shift),
    day: days,
    week,
    dayOfWeek: days % 7,
    trimester: week < 13 ? 1 : week < 27 ? 2 : 3,
    daysLeft: 280 + shift - days,
  };
}

// --------------------------------------------------- kalendoriaus dažymas

/**
 * Kiekvienai dienai — ką rodyti kalendoriuje.
 * @returns {Object<string,{kind:string, predicted:boolean}>}
 */
export function paintRange(state, from, to) {
  const out = {};
  const { avgCycle, avgPeriod, window, cycleStart, lutealDays } = state;
  // Kuo mažesnis skaičius, tuo svarbiau. Faktas visada virš prognozės.
  const RANK = {
    'period': 0, 'ovulation': 1, 'fertile': 2, 'fertile-wide': 3, 'period-window': 4,
  };
  const rank = (kind, predicted) => RANK[kind] + (predicted ? 10 : 0);
  const mark = (d, kind, predicted) => {
    if (daysBetween(from, d) < 0 || daysBetween(d, to) < 0) return;
    const prev = out[d];
    if (prev && rank(prev.kind, prev.predicted) <= rank(kind, predicted)) return;
    out[d] = { kind, predicted };
  };

  // faktinės mėnesinės
  for (const e of state.episodes) for (const d of e.days) mark(d, 'period', false);

  // patvirtinta ovuliacija istorijoje
  for (const c of state.validCycles) {
    const cd = rangeDays(c.start, addDays(c.next, -1));
    const shift = bbtShift(state.days || {}, cd);
    if (shift) mark(shift.ovulation, 'ovulation', false);
  }

  if (!cycleStart || state.stale) return out;

  // prognozuojami ciklai į priekį, kol telpa į langą
  let start = cycleStart;
  for (let i = 0; i < 24; i++) {
    const next = addDays(start, avgCycle);
    if (daysBetween(to, next) > 40) break;

    for (let k = -window; k <= window; k++) mark(addDays(next, k), 'period-window', true);
    for (let k = 0; k < avgPeriod; k++) mark(addDays(next, k), 'period', true);

    const ov = addDays(next, Math.round(P.ovulationDay(avgCycle).day) - 1);
    const ovSd = P.ovulationUncertainty(state.sigma || 3);
    const spread = Math.min(9, Math.round(1.28 * ovSd));
    for (let k = -5 - spread; k <= spread; k++) mark(addDays(ov, k), 'fertile-wide', true);
    for (let k = -5; k <= 0; k++) mark(addDays(ov, k), 'fertile', true);
    mark(ov, 'ovulation', true);

    start = next;
  }

  // dabartinio ciklo vaisingas langas — faktas, jei kūnas patvirtino
  if (state.fertile) {
    const pred = !state.ovulation?.confirmed;
    for (const d of rangeDays(state.fertile.from, state.fertile.to)) mark(d, 'fertile-wide', pred);
    for (const d of rangeDays(state.fertile.core.from, state.fertile.core.to)) mark(d, 'fertile', pred);
    if (state.ovulation) mark(state.ovulation.date, 'ovulation', pred);
  }
  return out;
}

/**
 * Kiek app'as klysta BŪTENT ŠIAI moteriai.
 *
 * Skaičiuojama retrospektyviai: kiekvienam ciklui prognozė sudaroma tik iš
 * ankstesnių ciklų, tada lyginama su tuo, kas iš tikrųjų įvyko. Nieko saugoti
 * nereikia, ir skaičius teisingas net ką tik įkėlus duomenis iš kito telefono.
 *
 * @returns {{n:number, mae:number, coverage:number, errors:number[]}|null}
 */
export function calibration(state, minHistory = 3) {
  const lengths = state.validCycles.map(c => c.length);
  if (lengths.length < minHistory + 2) return null;

  const errors = [];
  let covered = 0;
  const opts = { age: state.age, usualLength: null };
  for (let i = minHistory; i < lengths.length; i++) {
    const past = lengths.slice(0, i);
    const pred = P.predict(P.fit(past, opts), 0.8);
    const actual = lengths[i];
    errors.push(actual - pred.median);
    if (actual >= pred.lo && actual <= pred.hi) covered++;
  }
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  return {
    n: errors.length,
    mae: +P.median(abs).toFixed(1),
    coverage: +(covered / errors.length).toFixed(2),
    errors: errors.map(e => +e.toFixed(1)),
  };
}

// ------------------------------------------------------------- įžvalgos

/** Ciklo ilgio istorija su nuokrypiais — grafikui. */
export function cycleHistory(state) {
  return state.cycles.map(c => ({
    start: c.start,
    length: c.length,
    periodLength: c.periodLength,
    valid: c.valid,
    deviation: c.valid ? c.length - state.avgCycle : null,
  }));
}

/**
 * Reguliarumas. Matas — median(CLD), gretimų ciklų skirtumų mediana: būtent jį
 * naudoja publikuoti modeliai, ir jis nemeluoja, kai ciklai nuosekliai slenka
 * (max−min tokiu atveju rodytų netaisyklingumą ten, kur jo nėra).
 *
 * Ribos iš populiacijos duomenų (Grieger 2020, 1,09 mln. moterų):
 *   25 % moterų svyruoja 0–1,5 d.; 69 % — mažiau nei 6 d.; 31 % — 6 d. ir daugiau.
 */
export function regularity(state) {
  const lengths = state.validCycles.map(c => c.length);
  const n = lengths.length;
  if (n < 3) return { level: 'unknown', spread: null, n, percentile: null };
  const c = P.cld(lengths.slice(-24));
  const level = c <= 1.5 ? 'very_regular' : c < 3.5 ? 'regular' : c < 6 ? 'variable' : 'irregular';
  // Kiek moterų svyruoja labiau už ją — grubus, bet sąžiningas palyginimas.
  const percentile = c <= 1.5 ? 75 : c < 3.5 ? 55 : c < 6 ? 31 : 15;
  return {
    level, n, cld: c, percentile,
    spread: Math.max(...lengths.slice(-24)) - Math.min(...lengths.slice(-24)),
    min: Math.min(...lengths.slice(-24)), max: Math.max(...lengths.slice(-24)),
  };
}

/**
 * Simptomų dažnis pagal ciklo fazę — „kada man labiausiai skauda galvą".
 * @returns {Object<string, {total:number, byPhase:Object<string,number>, peak:string}>}
 */
export function symptomPatterns(days, state) {
  const stats = {};
  const phaseOfDay = dayPhaseMap(days, state);
  for (const [d, entry] of Object.entries(days)) {
    const ph = phaseOfDay[d];
    if (!ph) continue;
    const all = [...(entry.symptoms || []), ...(entry.mood || []).map(m => 'mood:' + m)];
    for (const s of all) {
      const st = stats[s] || (stats[s] = { total: 0, byPhase: {} });
      st.total++;
      st.byPhase[ph] = (st.byPhase[ph] || 0) + 1;
    }
  }
  for (const st of Object.values(stats)) {
    st.peak = Object.entries(st.byPhase).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  return stats;
}

/** Kiekvienai turimai dienai priskiria ciklo fazę (retrospektyviai). */
export function dayPhaseMap(days, state) {
  const map = {};
  const cycles = [...state.cycles];
  if (state.cycleStart) cycles.push({ start: state.cycleStart, next: addDays(state.today, 1), valid: true });

  for (const c of cycles) {
    if (!c.valid) continue;
    const cd = rangeDays(c.start, addDays(c.next, -1));
    const ov = ovulationFor(days, cd, c.start, c.length, state.lutealDays);
    const periodEnd = c.start;
    for (const d of cd) {
      const n = daysBetween(c.start, d) + 1;
      let ph;
      if ((days[d]?.flow ?? 0) >= MENSTRUAL_MIN) ph = PHASE.MENSTRUAL;
      else if (ov && d === ov.date) ph = PHASE.OVULATION;
      else if (ov && Math.abs(daysBetween(ov.date, d)) <= 2) ph = PHASE.FERTILE;
      else if (daysBetween(d, c.next) <= PMS_DAYS) ph = PHASE.PMS;
      else if (ov && daysBetween(ov.date, d) > 0) ph = PHASE.LUTEAL;
      else ph = PHASE.FOLLICULAR;
      map[d] = ph;
    }
  }
  return map;
}

/**
 * Kurį ciklą verta rodyti temperatūros grafike: dabartinį, jei jame jau yra
 * matavimų, kitaip — paskutinį, kuriame jų pakanka. Tuščias grafikas nieko
 * nepasako, o praėjusio ciklo kreivė su šuoliu — pasako daug.
 */
export function bbtCycleToShow(days, state, minPoints = 4) {
  const count = (from, to) => rangeDays(from, to).filter(d => typeof days[d]?.bbt === 'number').length;
  if (state.cycleStart && count(state.cycleStart, state.today) >= minPoints) {
    return { start: state.cycleStart, end: state.today, current: true };
  }
  for (let i = state.validCycles.length - 1; i >= 0; i--) {
    const c = state.validCycles[i];
    const end = addDays(c.next, -1);
    if (count(c.start, end) >= minPoints) return { start: c.start, end, current: false };
  }
  return state.cycleStart ? { start: state.cycleStart, end: state.today, current: true } : null;
}

/** BBT grafiko taškai dabartiniam (ar nurodytam) ciklui. */
export function bbtChart(days, cycleStart, until) {
  const cd = rangeDays(cycleStart, until);
  const shift = bbtShift(days, cd);
  return {
    points: cd.map((d, i) => ({ d, day: i + 1, t: days[d]?.bbt ?? null })),
    coverline: shift?.coverline ?? null,
    ovulation: shift?.ovulation ?? null,
  };
}

// ------------------------------------------------------------------ misc

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Ar verta paklausti, ar mėnesinės tęsiasi. Be šio klausimo moterys dažnai
 * pažymi tik pirmą dieną, ir mėnesinių trukmė lieka neteisinga — o ji naudojama
 * ir kalendoriuje, ir prognozėje.
 */
export function shouldAskStillBleeding(days, today = todayISO()) {
  const y = days[addDays(today, -1)];
  if (!y || (y.flow ?? 0) < MENSTRUAL_MIN) return false;
  const t = days[today] || {};
  // „nepažymėta" ir „pažymėta, kad nebėra" yra skirtingi dalykai: pirmu atveju
  // klausiame, antru — nutylime. Todėl atsakymas „baigėsi" saugomas atskirai.
  return t.flow === undefined && !t.periodEnded;
}

/** Ar verta pasiūlyti nėštumo testą (be dramos: tik po realaus vėlavimo). */
export function suggestTest(state) {
  return state.mode !== 'pregnancy' && state.late >= 7 && !state.stale;
}
