/* Lapas — prognozės matematika.
 *
 * Modelis: log-normalus hierarchinis Bajeso su Normal-Inverse-Gamma prior.
 * Viskas uždaromis formulėmis — skaičiuojasi telefone per milisekundes,
 * be serverio, be treniravimo, be kitų moterų duomenų.
 *
 * Kodėl būtent taip (šaltiniai README-MOKSLAS.md):
 *  - Ciklo ilgio pasiskirstymas dešiniojo šleifo → log skalė, ne normalus skirstinys.
 *  - Tarpasmeninis kintamumas ~3× didesnis už vidinį → hierarchija su shrinkage:
 *    kol savų ciklų mažai, remiamės populiacija; kai daug — savais.
 *  - Ciklo vidurkis dreifuoja su amžiumi (−0,176 d/metus) → senesni ciklai sveria mažiau.
 *  - Anomalūs ciklai (liga, stresas) NEŠALINAMI, tik mažinamas jų svoris: šalinimas
 *    dirbtinai susiaurintų intervalą, o tai pavojingiausias gedimo būdas.
 */

'use strict';

// ---------------------------------------------------------- statistika

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Reguliarizuota nepilna beta funkcija — Stjudento t pasiskirstymui. */
function betacf(a, b, x) {
  const TINY = 1e-30, EPS = 3e-12;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b)
    + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? front * betacf(a, b, x) / a
    : 1 - front * betacf(b, a, 1 - x) / b;
}

/** P(T ≤ t) Stjudento skirstiniui su df laisvės laipsnių. */
export function studentCDF(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * ibeta(df / 2, 0.5, x);
  return t > 0 ? 1 - p : p;
}

/** Stjudento kvantilis — bisekcija, nes tikslumo užtenka ir kodas lieka skaidrus. */
export function studentQuantile(p, df) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -60, hi = 60;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (studentCDF(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ------------------------------------------------------ populiacijos prior

/** Vidutinis ciklo ilgis pagal amžių (Bull 2019: −0,176 d/metus tarp 25 ir 45). */
export function populationMean(age) {
  if (age == null) return 29.3;
  if (age < 20) return 30.5;              // paauglystėje ciklai ilgesni ir kintamesni
  if (age < 25) return 30.0;
  if (age <= 45) return 29.3 - 0.176 * (age - 30);
  return 28.5;
}

/** Vidutinis ASMENINIS ciklo SD pagal amžių (Bull 2019, per-user variation). */
export function populationSD(age, bmi) {
  let s;
  if (age == null) s = 3.4;               // nežinant amžiaus — atsargesnis (AWHS realistiškesnis)
  else if (age < 25) s = 2.9;
  else if (age < 30) s = 2.8;
  else if (age < 35) s = 2.6;
  else if (age < 40) s = 2.3;
  else if (age < 45) s = 2.4;
  else s = 3.5;                           // perimenopauzė — kintamumas šoka
  if (bmi != null && bmi >= 35) s *= 1.14;
  return s;
}

/**
 * Normal-Inverse-Gamma prior log skalėje.
 *
 * kappa0 nusako, kaip stipriai populiacija traukia asmeninį vidurkį. NIG modelyje
 * SD(μ) = σ/√kappa0, todėl kappa0 turi atspindėti TARPASMENINĮ kintamumą, ne vidinį:
 * Bull 2019 populiacijos SD 5,2 d, vidinis 2,6 d → tarpasmeninis ≈ √(5,2²−2,6²) ≈ 4,5 d.
 * Iš σ/√kappa0 = 4,5 su σ ≈ 2,6 gauname kappa0 ≈ 0,33; imame 1,5 kaip atsargesnį
 * vidurį, kad vienas triukšmingas ciklas dar nepersvertų populiacijos.
 *
 * Praktinis rezultatas: po 4 ciklų populiacija sveria ~27 %, po 12 — ~11 %.
 * Su kappa0 = 4 (grynai formalus pasirinkimas) moteris, kurios ciklai nuosekliai
 * 26 d, net po metų matytų prognozę 26,8 — matomą, nepagrįstą paklaidą.
 */
export function prior({ age = null, bmi = null, usualLength = null } = {}) {
  // Jei moteris nurodė savo įprastą ciklą, jis ir yra prior centras: ji apie save
  // žino daugiau nei populiacijos vidurkis. Populiacija lieka atsarginiu variantu.
  const M0 = usualLength && usualLength >= 15 && usualLength <= 60
    ? usualLength : populationMean(age);
  const sdDays = populationSD(age, bmi);
  const s0 = sdDays / M0;                   // santykinis SD ≈ SD log skalėje
  const a0 = 3;
  return { m0: Math.log(M0), kappa0: 1.5, a0, b0: a0 * s0 * s0, M0, sd0: sdDays };
}

/**
 * Theil–Sen nuolydis: medianinis porinių nuolydžių. Robustiškas — vienas
 * nukrypęs ciklas jo nepasuka, skirtingai nei mažiausių kvadratų tiesė.
 * @returns {number} dienų pokytis per ciklą
 */
export function trendPerCycle(lengths) {
  if (lengths.length < 4) return 0;
  const slopes = [];
  for (let i = 0; i < lengths.length; i++)
    for (let j = i + 1; j < lengths.length; j++)
      slopes.push((lengths[j] - lengths[i]) / (j - i));
  return median(slopes);
}

/**
 * Atminties ilgis. Du atskiri dalykai verčia trumpinti atmintį:
 *  - triukšmas (didelis CLD) — sena informacija ir taip menkai padeda;
 *  - TRENDAS — ciklai nuosekliai ilgėja ar trumpėja (po gimdymo, perimenopauzėje,
 *    nutraukus kontraceptikus). Trendo CLD nemato: nuosekliai mažėjanti seka
 *    34→28 turi CLD = 1, atrodo „labai reguliari", ir ilga atmintis paliktų
 *    prognozę praeityje.
 * Tyrimas: ρ = 0,95 labai reguliarioms, 0,85 nestabilioms.
 */
export function decayFor(lengths) {
  const c = cld(lengths);
  if (c == null) return DECAY;
  const base = c <= 2 ? 0.95 : c <= 5 ? 0.90 : 0.85;
  return Math.abs(trendPerCycle(lengths)) > 0.3 ? Math.min(base, 0.80) : base;
}

// --------------------------------------------------------------- modelis

export const DECAY = 0.9;      // n_eff ≈ 9,5 ciklo — tiek, kiek naudoja publikuoti modeliai
const HUBER_K = 2.5;

/**
 * Posterior iš ciklų istorijos.
 * @param {number[]} lengths chronologiškai, paskutinis — naujausias
 * @returns {{m:number, kappa:number, a:number, b:number, nEff:number, weights:number[]}}
 */
export function fit(lengths, opts = {}) {
  const { m0, kappa0, a0, b0 } = prior(opts);
  const rho = opts.rho ?? decayFor(lengths);
  const K = lengths.length;
  if (!K) return { m: m0, kappa: kappa0, a: a0, b: b0, nEff: 0, weights: [] };

  const x = lengths.map(Math.log);
  let w = lengths.map((_, k) => Math.pow(rho, K - 1 - k));

  // Robustiškas pradinis mastelis (MAD). Su paprasta dispersija vienas 61 d ciklas
  // pats išpučia sigma, jo standartizuota liekana lieka maža, ir Huber jo nepastebi.
  const med = median(x);
  const mad = median(x.map(v => Math.abs(v - med)));
  const floorScale = Math.sqrt(b0 / a0) * 0.5;      // neleidžiam mastelio nunulinti
  let scale0 = Math.max(mad * 1.4826, floorScale);

  let out;
  // Anomalūs ciklai netraukiami lauk, tik nusveriami — kad intervalas liktų sąžiningas.
  for (let iter = 0; iter < 3; iter++) {
    const sw = w.reduce((s, v) => s + v, 0);
    const nEff = sw * sw / w.reduce((s, v) => s + v * v, 0);
    const xbar = x.reduce((s, v, i) => s + w[i] * v, 0) / sw;
    const S = x.reduce((s, v, i) => s + w[i] * (v - xbar) ** 2, 0) * (nEff / sw);

    const kappa = kappa0 + nEff;
    const m = (kappa0 * m0 + nEff * xbar) / kappa;
    const a = a0 + nEff / 2;
    const b = b0 + S / 2 + (kappa0 * nEff * (xbar - m0) ** 2) / (2 * kappa);
    out = { m, kappa, a, b, nEff, weights: [...w] };

    if (iter === 2 || K < 3) break;
    const sigma = iter === 0 ? scale0 : Math.max(Math.sqrt(b / a), floorScale);
    const base = lengths.map((_, k) => Math.pow(rho, K - 1 - k));
    w = x.map((v, i) => {
      const r = Math.abs(v - m) / sigma;
      return r > HUBER_K ? base[i] * (HUBER_K / r) ** 2 : base[i];
    });
  }
  return out;
}

/**
 * Kito ciklo ilgio prognozė. Log skalėje tai Stjudento t.
 * @returns {{median:number, lo:number, hi:number, sigmaDays:number, df:number}}
 */
export function predict(post, coverage = 0.8) {
  const { m, kappa, a, b } = post;
  const scale = Math.sqrt((b / a) * (1 + 1 / kappa));
  const df = 2 * a;
  const q = studentQuantile(0.5 + coverage / 2, df);
  const med = Math.exp(m);
  return {
    median: med,
    lo: Math.exp(m - q * scale),
    hi: Math.exp(m + q * scale),
    // apytikslis SD dienomis (log-normalaus skirstinio, mažoms sklaidoms)
    sigmaDays: med * scale * Math.sqrt(df / Math.max(df - 2, 1e-9)),
    m, df, scale,
  };
}

/**
 * Prognozė ciklui vykstant: žinome, kad mėnesinės dar neprasidėjo, tad
 * skirstinys nupjaunamas ties šiandiena ir normalizuojamas iš naujo.
 * Būtent čia modelis nurungia paprastą vidurkį (Li 2021).
 * @param {number} elapsed kiek dienų ciklas jau trunka (dayOfCycle)
 */
export function predictGiven(post, elapsed, coverage = 0.8) {
  const base = predict(post, coverage);
  if (!(elapsed > 0)) return base;
  const { m, scale, df } = base;
  const z = d => (Math.log(d) - m) / scale;
  const F = d => studentCDF(z(d), df);
  const Finv = p => Math.exp(m + studentQuantile(p, df) * scale);

  const passed = F(elapsed);                     // tikimybė, kad ciklas jau būtų pasibaigęs
  if (passed > 0.999) return { ...base, exhausted: true };
  const rescale = p => Finv(passed + p * (1 - passed));
  return {
    ...base,
    median: rescale(0.5),
    lo: rescale((1 - coverage) / 2),
    hi: rescale(0.5 + coverage / 2),
    passed,
    exhausted: false,
  };
}

// ------------------------------------------------------------- ovuliacija

/**
 * Ovuliacijos ciklo diena pagal ciklo ilgį — Johnson, Marriott & Zinaman 2018
 * (949 moterys, kasdienis šlapimo LH). Lentelė, ne „ilgis minus 14":
 * „minus 14" trumpiems ciklams nustumia ovuliaciją per anksti apie 4 dienas.
 */
const OVU = {
  23: [13.15, 2.41], 24: [13.16, 1.99], 25: [13.72, 1.81], 26: [14.22, 1.51],
  27: [15.14, 1.71], 28: [15.76, 1.91], 29: [16.77, 1.61], 30: [17.56, 1.75],
  31: [18.87, 2.26], 32: [19.23, 1.50], 33: [20.55, 2.02], 34: [21.60, 1.63],
  35: [21.82, 2.51],
};

/** @returns {{day:number, sd:number}} ovuliacijos ciklo diena (1-indexed) */
export function ovulationDay(cycleLength) {
  const L = Math.round(cycleLength);
  if (OVU[L]) return { day: OVU[L][0], sd: OVU[L][1] };
  return { day: 0.80 * cycleLength - 6.19, sd: 1.83 };   // regresija iš tos pačios lentelės
}

/**
 * Ovuliacijos neapibrėžtumas = ciklo ilgio neapibrėžtumas + liekamoji sklaida.
 * Abi komponentės nepriklausomos, todėl sudedamos kvadratais.
 */
export function ovulationUncertainty(cycleSigmaDays) {
  return Math.sqrt((0.80 * cycleSigmaDays) ** 2 + 1.83 ** 2);
}

/**
 * Vaisingas langas. Wilcox 1995: pastojimas įmanomas tik 6 dienų lange,
 * kuris baigiasi ovuliacijos dieną. Prie to pridedamas prognozės neapibrėžtumas —
 * kitaip rodytume 6 dienų langą, kurio tikslumu patys netikime.
 */
export function fertileWindow(ovDay, sd, coverage = 0.8) {
  const z = studentQuantile(0.5 + coverage / 2, 30);
  return {
    from: ovDay - 5 - z * sd,
    to: ovDay + z * sd,
    core: { from: ovDay - 5, to: ovDay },      // siaurasis langas, jei ovuliacija patvirtinta
  };
}

// ------------------------------------------------------- duomenų kokybė

/** CLD — gretimų ciklų skirtumų medianos modulis. Pagrindinis reguliarumo matas. */
export function cld(lengths) {
  if (lengths.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < lengths.length; i++) diffs.push(Math.abs(lengths[i] - lengths[i - 1]));
  return median(diffs);
}

/**
 * Ar šis ciklas greičiausiai yra keli nepažymėti ciklai?
 * Apple Women's Health Study riba: mediana + median(CLD) + 15 dienų.
 * Ten taip pažymėta 3,9 % ciklų.
 */
export function looksSkipped(length, history) {
  if (history.length < 3) return null;
  const med = median(history);
  const limit = med + (cld(history) ?? 0) + 15;
  if (length <= limit) return null;
  const c = Math.round(length / med);
  const plausible = c >= 2 && Math.abs(length - c * med) <= 0.15 * c * med;
  return { limit, likelyCycles: plausible ? c : null, effective: plausible ? length / c : null };
}
