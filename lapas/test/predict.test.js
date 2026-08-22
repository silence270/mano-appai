/* Prognozės variklio testai.
 * Skaičiai sutikrinti su moksline literatūra (žr. README-MOKSLAS.md) — jei kas nors
 * pakeis modelį taip, kad jis nustos atitikti duomenis, šie testai kris.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/predict.js';

// --- matematinis pamatas ---------------------------------------------------

test('Stjudento kvantiliai sutampa su lentelėmis', () => {
  const cases = [[0.9, 10, 1.3722], [0.95, 10, 1.8125], [0.975, 20, 2.0860],
                 [0.975, 6, 2.4469], [0.99, 30, 2.4573], [0.75, 8, 0.7064]];
  for (const [p, df, want] of cases) {
    assert.ok(Math.abs(P.studentQuantile(p, df) - want) < 0.001,
      `t(${p}, ${df}) = ${P.studentQuantile(p, df).toFixed(4)}, laukta ${want}`);
  }
});

test('Stjudento CDF simetriška ir monotoniška', () => {
  assert.ok(Math.abs(P.studentCDF(0, 10) - 0.5) < 1e-9);
  assert.ok(Math.abs(P.studentCDF(-1.5, 12) + P.studentCDF(1.5, 12) - 1) < 1e-9);
  assert.ok(P.studentCDF(1, 5) < P.studentCDF(2, 5));
});

// --- populiacijos prior ----------------------------------------------------

test('populiacijos vidurkis seka Bull 2019 regresiją', () => {
  // −0,176 d/metus tarp 25 ir 45; ties 30 m. — 29,3 d
  assert.ok(Math.abs(P.populationMean(30) - 29.3) < 0.01);
  assert.ok(Math.abs(P.populationMean(40) - P.populationMean(30) + 1.76) < 0.01);
  assert.ok(P.populationMean(25) > P.populationMean(45), 'jaunesnių ciklai ilgesni');
});

test('asmeninis SD mažiausias 35–39 m., didžiausias perimenopauzėje', () => {
  assert.ok(P.populationSD(37) < P.populationSD(22));
  assert.ok(P.populationSD(47) > P.populationSD(37));
  assert.ok(Math.abs(P.populationSD(37) - 2.3) < 0.01, 'Bull: 2,3 d ties 35–39');
  assert.ok(P.populationSD(30, 38) > P.populationSD(30), 'KMI ≥ 35 didina kintamumą');
});

test('be jokių ciklų prognozė lygi populiacijos vidurkiui, bet plačiu langu', () => {
  const post = P.fit([], { age: 30 });
  const pr = P.predict(post, 0.8);
  assert.ok(Math.abs(pr.median - 29.3) < 0.3);
  assert.ok(pr.hi - pr.lo > 6, `langas turi būti platus, gautas ${(pr.hi - pr.lo).toFixed(1)} d`);
});

// --- mokymasis pagal moterį ------------------------------------------------

test('savi ciklai palaipsniui nustelbia populiaciją', () => {
  const of = n => P.predict(P.fit(Array(n).fill(26), { age: 30 })).median;
  const [a, b, c] = [of(1), of(4), of(12)];
  assert.ok(a > b && b > c, 'kiekvienas ciklas turi artinti prie 26');
  assert.ok(a > 27.5, `po vieno ciklo dar remiamės populiacija, gauta ${a.toFixed(1)}`);
  assert.ok(Math.abs(c - 26) < 0.6, `po 12 ciklų turi būti ~26, gauta ${c.toFixed(1)}`);
  // moteris, nurodžiusi savo įprastą ciklą, neturi būti traukiama link populiacijos
  const told = P.predict(P.fit(Array(12).fill(26), { age: 30, usualLength: 26 })).median;
  assert.ok(Math.abs(told - 26) < 0.15, `su nurodytu įprastu ilgiu gauta ${told.toFixed(2)}`);
});

test('reguliariai moteriai langas siauras, netaisyklingai — platus', () => {
  const reg = P.predict(P.fit([28, 28, 29, 28, 27, 28, 28, 29], { age: 30 }));
  const irr = P.predict(P.fit([24, 45, 31, 38, 26, 41, 29, 35], { age: 30 }));
  assert.ok(reg.hi - reg.lo < 6, `reguliarios langas ${(reg.hi - reg.lo).toFixed(1)} d`);
  assert.ok(irr.hi - irr.lo > 12, `netaisyklingos langas ${(irr.hi - irr.lo).toFixed(1)} d`);
});

test('vienas ciklas po ligos nepatraukia prognozės, bet praplečia langą', () => {
  const base = [28, 27, 29, 28, 28, 27];
  const a = P.predict(P.fit(base, { age: 30 }));
  const b = P.predict(P.fit([...base, 61], { age: 30 }));
  assert.ok(Math.abs(b.median - a.median) < 3.5,
    `mediana pašoko nuo ${a.median.toFixed(1)} iki ${b.median.toFixed(1)}`);
  assert.ok(b.hi - b.lo > a.hi - a.lo, 'neapibrėžtumas privalo išaugti');
});

test('naujesni ciklai sveria daugiau — ciklai trumpėja', () => {
  const p = P.predict(P.fit([34, 33, 32, 30, 29, 28, 28], { age: 30 })).median;
  assert.ok(p < 30, `prognozė turi sekti naujausius ciklus, gauta ${p.toFixed(1)}`);
});

// --- KALIBRAVIMAS: ar 80 % langas iš tikrųjų dengia 80 %? ------------------

/** Deterministinis pseudoatsitiktinis generatorius — testas turi būti atkuriamas. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function normal(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

test('80 % intervalas dengia ~80 % tikrų ciklų (Monte Carlo)', () => {
  const rand = rng(20260822);
  let inside = 0, total = 0;
  for (let woman = 0; woman < 300; woman++) {
    const mu = 25 + rand() * 10;                 // 25–35 d
    const sd = 1 + rand() * 4;                   // 1–5 d asmeninis SD
    const hist = [];
    for (let c = 0; c < 14; c++) {
      const len = Math.max(15, Math.round(mu + sd * normal(rand)));
      if (hist.length >= 4) {
        const pr = P.predict(P.fit(hist, { age: 30 }), 0.8);
        total++;
        if (len >= pr.lo - 0.5 && len <= pr.hi + 0.5) inside++;
      }
      hist.push(len);
    }
  }
  const coverage = inside / total;
  assert.ok(coverage > 0.75 && coverage < 0.90,
    `80 % langas dengia ${(coverage * 100).toFixed(1)} % (n=${total}) — turi būti ~80 %`);
});

test('gyvenimiškuose duomenyse modelis nurungia paprastą vidurkį', () => {
  // Tikri ciklai nėra stacionarūs: vidurkis lėtai slenka, pasitaiko ligos/streso
  // ciklų (~26 % „overdispersed", Sci Rep 2021) ir nepažymėtų ciklų (~4 %, AWHS).
  const rand = rng(7777);
  let errModel = 0, errMean = 0, n = 0;
  for (let woman = 0; woman < 250; woman++) {
    let mu = 24 + rand() * 12;
    const sd = 1 + rand() * 3;
    const drift = (rand() - 0.5) * 0.4;             // iki ±0,2 d per ciklą
    const hist = [];
    for (let c = 0; c < 16; c++) {
      mu += drift;
      let len = mu + sd * normal(rand);
      if (rand() < 0.10) len += 6 + rand() * 14;     // liga / stresas / kelionė
      len = Math.max(15, Math.round(len));
      if (hist.length >= 5) {
        const m = P.predict(P.fit(hist, { age: 30 })).median;
        const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
        errModel += (m - len) ** 2;
        errMean += (avg - len) ** 2;
        n++;
      }
      hist.push(len);
    }
  }
  const rmseModel = Math.sqrt(errModel / n), rmseMean = Math.sqrt(errMean / n);
  assert.ok(rmseModel < rmseMean,
    `modelis (RMSE ${rmseModel.toFixed(2)}) turi nurungti vidurkį (${rmseMean.toFixed(2)})`);
});

// --- prognozė ciklui vykstant ---------------------------------------------

test('ciklui užsitęsus prognozė pasistumia, o ne lieka praeityje', () => {
  const post = P.fit([28, 29, 28, 27, 28, 28], { age: 30 });
  const day0 = P.predict(post);
  const day33 = P.predictGiven(post, 33);
  assert.ok(day33.median > 33, `33-ią dieną prognozė turi būti ateityje, gauta ${day33.median.toFixed(1)}`);
  assert.ok(day33.median > day0.median, 'prognozė turi pasislinkti į priekį');
  assert.ok(day33.lo >= 33, 'apatinė riba negali būti praeityje');
});

test('anksti cikle sąlyginė prognozė beveik nesiskiria nuo pradinės', () => {
  const post = P.fit([28, 28, 29, 28], { age: 30 });
  const a = P.predict(post), b = P.predictGiven(post, 5);
  assert.ok(Math.abs(a.median - b.median) < 0.5);
});

// --- ovuliacija ------------------------------------------------------------

test('ovuliacijos diena atitinka Johnson 2018 lentelę, o ne „ilgis minus 14"', () => {
  assert.equal(P.ovulationDay(28).day, 15.76);
  assert.equal(P.ovulationDay(24).day, 13.16);
  // „minus 14" 24 d ciklui duotų 10-ą dieną — tai per anksti trimis dienomis
  assert.ok(P.ovulationDay(24).day - (24 - 14) > 2.5);
});

test('už lentelės ribų regresija lieka biologiškai prasminga', () => {
  const short = P.ovulationDay(20), long = P.ovulationDay(45);
  assert.ok(short.day > 8 && short.day < 12, `20 d ciklas → ${short.day.toFixed(1)}`);
  assert.ok(long.day > 24 && long.day < 32, `45 d ciklas → ${long.day.toFixed(1)}`);
  assert.ok(long.day < 45, 'ovuliacija negali būti po mėnesinių');
});

test('ovuliacijos neapibrėžtumas sudeda abi komponentes', () => {
  // reguliari moteris: ciklo SD 2,6 → sqrt((0,8·2,6)² + 1,83²) ≈ 2,77
  assert.ok(Math.abs(P.ovulationUncertainty(2.6) - 2.77) < 0.02);
  assert.ok(P.ovulationUncertainty(0) >= 1.83, 'liekamoji sklaida niekur nedingsta');
  assert.ok(P.ovulationUncertainty(8) > P.ovulationUncertainty(2));
});

test('vaisingas langas platesnis už 6 dienas, kai ovuliacija tik spėjama', () => {
  const w = P.fertileWindow(15.8, P.ovulationUncertainty(2.6), 0.8);
  const width = w.to - w.from;
  assert.ok(width > 10, `spėjamas langas ${width.toFixed(1)} d — turi būti ~11`);
  assert.equal(w.core.to - w.core.from, 5, 'patvirtintas langas lieka 6 dienų (Wilcox)');
});

// --- duomenų kokybė --------------------------------------------------------

test('CLD skiria reguliarią nuo netaisyklingos', () => {
  assert.ok(P.cld([28, 28, 29, 28, 28]) <= 1);
  assert.ok(P.cld([24, 45, 31, 38, 26]) >= 7);
  assert.equal(P.cld([28]), null);
});

test('praleistas ciklas atpažįstamas, o ne priimamas kaip 60 dienų ciklas', () => {
  const hist = [28, 29, 28, 27, 28];
  const skip = P.looksSkipped(57, hist);
  assert.ok(skip, 'du ciklai iš eilės turi būti pastebėti');
  assert.equal(skip.likelyCycles, 2);
  assert.ok(Math.abs(skip.effective - 28.5) < 1);
  assert.equal(P.looksSkipped(31, hist), null, 'normalus ciklas nekaltinamas');
  assert.equal(P.looksSkipped(44, hist), null, 'ties riba dar nekaltiname');
  const unclear = P.looksSkipped(46, hist);
  assert.ok(unclear && unclear.likelyCycles === null,
    '46 d nėra nei normalus, nei tikėtinas dvigubas — pažymim kaip neaiškų, bet nedalijam');
});
