/* Lapas — ciklo variklis.
 *
 * Grynos funkcijos: jokio DOM, jokio tinklo, jokio localStorage.
 * Tas pats failas veikia naršyklėje ir `node --test` testuose.
 *
 * Pagrindiniai principai:
 *  - Prognozė remiasi SVERTINE MEDIANA (naujesni ciklai sveria daugiau), ne vidurkiu:
 *    vienas 60 dienų ciklas po ligos neturi sugriauti visos prognozės.
 *  - Ovuliacija skaičiuojama ATGAL nuo kitų mėnesinių (liuteininė fazė stabili ~13 d.),
 *    o ne „ciklo vidurys" — tai vienintelis būdas teisingai prognozuoti netaisyklingą ciklą.
 *  - Kūno požymiai (BBT, gleivės, LH) VIRŠIJA kalendorių: jei temperatūra patvirtino
 *    ovuliaciją, kalendoriaus spėjimas atmetamas.
 *  - Kur duomenų per mažai — grąžinamas platus langas ir žemas `confidence`,
 *    o ne apsimestinis tikslumas.
 */

'use strict';

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
export const DEFAULT_LUTEAL = 14;
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
export function ovulationFor(days, cycleDays, predictedNextPeriod, lutealDays) {
  const bbt = bbtShift(days, cycleDays);
  if (bbt) return { date: bbt.ovulation, source: 'bbt', confirmed: true, coverline: bbt.coverline };

  const lh = lhSurge(days, cycleDays);
  if (lh) return { date: lh, source: 'lh', confirmed: false };

  const peak = mucusPeak(days, cycleDays);
  if (peak) return { date: peak, source: 'mucus', confirmed: false };

  if (predictedNextPeriod) {
    return { date: ovulationDate(predictedNextPeriod, lutealDays), source: 'calendar', confirmed: false };
  }
  return null;
}

/** Ovuliacijos data iš mėnesinių datos: tarp jų telpa dar `luteal` pilnų dienų. */
export function ovulationDate(nextPeriod, lutealDays) {
  return addDays(nextPeriod, -(lutealDays + 1));
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
  const recent = valid.slice(-HISTORY);
  const lengths = recent.map(c => c.length);

  // --- vidutinis ciklas
  let avgCycle, sigma, confidence, basis;
  if (lengths.length >= 2) {
    const w = decayWeights(lengths.length);
    avgCycle = Math.round(weightedMedian(lengths, w));
    sigma = robustSigma(lengths);
    basis = 'history';
    confidence = lengths.length >= 3 && sigma <= 2 ? 'high'
               : sigma <= 5 ? 'medium' : 'low';
  } else if (lengths.length === 1) {
    avgCycle = lengths[0];
    sigma = 4;
    basis = 'single';
    confidence = 'low';
  } else {
    avgCycle = clamp(settings.avgCycle ?? DEFAULT_CYCLE, CYCLE_MIN, CYCLE_MAX);
    sigma = 4;
    basis = 'default';
    confidence = 'low';
  }

  // --- mėnesinių trukmė
  const epLens = eps.slice(-HISTORY).map(e => e.length);
  const avgPeriod = epLens.length
    ? Math.round(weightedMedian(epLens, decayWeights(epLens.length)))
    : clamp(settings.avgPeriod ?? DEFAULT_PERIOD, 1, 14);

  // --- prognozės paklaida dienomis
  const window = clamp(Math.round(sigma), 1, 7);

  const lastPeriod = eps.length ? eps[eps.length - 1].start : null;
  const cycleStart = lastPeriod;
  const dayOfCycle = cycleStart ? daysBetween(cycleStart, today) + 1 : null;

  // Jei šiandien esame giliai už prognozuoto ciklo (>CYCLE_MAX), žymėjimas nutrūkęs —
  // nerodom „vėluoja 200 dienų", o sakom, kad duomenys pasenę.
  const stale = dayOfCycle != null && dayOfCycle > CYCLE_MAX;

  const lutealDays = lutealLength(days, valid);

  let nextPeriod = null, nextPeriodRange = null, ovulation = null, fertile = null;
  if (cycleStart && !stale) {
    nextPeriod = addDays(cycleStart, avgCycle);
    nextPeriodRange = { from: addDays(nextPeriod, -window), to: addDays(nextPeriod, window) };

    const cycleDays = rangeDays(cycleStart, today);
    const ov = ovulationFor(days, cycleDays, nextPeriod, lutealDays);
    if (ov) {
      ovulation = ov;
      fertile = {
        from: addDays(ov.date, -FERTILE_BEFORE),
        to: addDays(ov.date, FERTILE_AFTER),
      };
    }
  }

  const daysUntilPeriod = nextPeriod ? daysBetween(today, nextPeriod) : null;
  const late = daysUntilPeriod != null && daysUntilPeriod < 0 && !stale
    ? -daysUntilPeriod : 0;

  const phase = currentPhase({
    days, today, cycleStart, dayOfCycle, avgPeriod,
    nextPeriod, ovulation, fertile, settings, stale,
  });

  return {
    today,
    days,
    mode: settings.mode || 'track',
    cycleStart,
    dayOfCycle: stale ? null : dayOfCycle,
    stale,
    avgCycle, avgPeriod, sigma: sigma == null ? null : +sigma.toFixed(2),
    window, confidence, basis,
    lutealDays,
    cycles, validCycles: valid, episodes: eps,
    nextPeriod, nextPeriodRange,
    ovulation, fertile,
    daysUntilPeriod, late,
    phase,
    pregnancy: settings.mode === 'pregnancy'
      ? pregnancyInfo(settings.pregnancyStart || lastPeriod, today) : null,
  };
}

function currentPhase({ days, today, cycleStart, dayOfCycle, avgPeriod,
                        nextPeriod, ovulation, fertile, settings, stale }) {
  if (settings.mode === 'pregnancy') return PHASE.PREGNANT;
  if (!cycleStart || stale) return PHASE.UNKNOWN;

  if ((days[today]?.flow ?? 0) >= MENSTRUAL_MIN) return PHASE.MENSTRUAL;
  if (dayOfCycle <= avgPeriod && (days[today]?.flow ?? 0) > 0) return PHASE.MENSTRUAL;

  if (ovulation && ovulation.date === today) return PHASE.OVULATION;
  if (fertile && daysBetween(fertile.from, today) >= 0 && daysBetween(today, fertile.to) >= 0)
    return PHASE.FERTILE;

  if (nextPeriod && daysBetween(today, nextPeriod) <= PMS_DAYS && daysBetween(today, nextPeriod) >= 0)
    return PHASE.PMS;

  if (ovulation && daysBetween(ovulation.date, today) > 0) return PHASE.LUTEAL;
  return PHASE.FOLLICULAR;
}

/** Nėštumo informacija: standartinis Naegele 280 d. nuo paskutinių mėnesinių. */
export function pregnancyInfo(lmp, today = todayISO()) {
  if (!lmp) return null;
  const days = daysBetween(lmp, today);
  if (days < 0) return null;
  const week = Math.floor(days / 7);
  return {
    lmp,
    due: addDays(lmp, 280),
    day: days,
    week,
    dayOfWeek: days % 7,
    trimester: week < 13 ? 1 : week < 27 ? 2 : 3,
    daysLeft: 280 - days,
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
    'period': 0, 'ovulation': 1, 'fertile': 2, 'period-window': 3,
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

    const ov = ovulationDate(next, lutealDays);
    for (let k = -5; k <= 1; k++) mark(addDays(ov, k), 'fertile', true);
    mark(ov, 'ovulation', true);

    start = next;
  }

  // dabartinio ciklo vaisingas langas — faktas, jei kūnas patvirtino
  if (state.fertile) {
    const pred = !state.ovulation?.confirmed;
    for (const d of rangeDays(state.fertile.from, state.fertile.to)) mark(d, 'fertile', pred);
    if (state.ovulation) mark(state.ovulation.date, 'ovulation', pred);
  }
  return out;
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

/** Reguliarumo vertinimas žmonių kalba. */
export function regularity(state) {
  const n = state.validCycles.length;
  if (n < 3) return { level: 'unknown', spread: null, n };
  const lens = state.validCycles.slice(-HISTORY).map(c => c.length);
  const spread = Math.max(...lens) - Math.min(...lens);
  const level = spread <= 4 ? 'regular' : spread <= 9 ? 'variable' : 'irregular';
  return { level, spread, n, min: Math.min(...lens), max: Math.max(...lens) };
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
    const ov = ovulationFor(days, cd, c.next, state.lutealDays);
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

/** Ar verta pasiūlyti nėštumo testą (be dramos: tik po realaus vėlavimo). */
export function suggestTest(state) {
  return state.mode !== 'pregnancy' && state.late >= 7 && !state.stale;
}
