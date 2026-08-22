/* Ciklo variklio testai: node --test test/
 * Scenarijai parinkti pagal tikras situacijas, ne pagal patogų 28 dienų idealą.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/cycle.js';

// --- pagalbinės ------------------------------------------------------------

/** Sukuria dienas: ciklai pagal ilgių sąrašą, mėnesinės po `period` dienų. */
function build(startISO, lengths, period = 5, extra = {}) {
  const days = {};
  let d = startISO;
  for (const len of lengths) {
    for (let i = 0; i < period; i++) {
      days[C.addDays(d, i)] = { flow: i === 0 ? 3 : i < period - 1 ? 3 : 2 };
    }
    d = C.addDays(d, len);
  }
  // paskutinio (vykstančio) ciklo mėnesinės
  for (let i = 0; i < period; i++) days[C.addDays(d, i)] = { flow: i < period - 1 ? 3 : 2 };
  return { days, lastStart: d, ...extra };
}

// --- datos -----------------------------------------------------------------

test('datos nepaslenka per vasaros/žiemos laiko keitimą', () => {
  assert.equal(C.addDays('2026-03-28', 2), '2026-03-30');   // LT laikrodis persuka 03-29
  assert.equal(C.addDays('2026-10-24', 2), '2026-10-26');   // ir atgal 10-25
  assert.equal(C.daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(C.daysBetween('2026-10-24', '2026-10-26'), 2);
});

test('daysBetween skaičiuoja per metų ribą', () => {
  assert.equal(C.daysBetween('2025-12-30', '2026-01-02'), 3);
  assert.equal(C.addDays('2026-02-27', 2), '2026-03-01'); // 2026 ne keliamieji
});

// --- epizodai --------------------------------------------------------------

test('lašeliai (spotting) nepradeda naujo ciklo', () => {
  const days = {
    '2026-08-01': { flow: 3 }, '2026-08-02': { flow: 3 }, '2026-08-03': { flow: 2 },
    '2026-08-25': { flow: 1 },                              // priešmėnesinis rudas
    '2026-08-29': { flow: 3 }, '2026-08-30': { flow: 3 },
  };
  const eps = C.periodEpisodes(days);
  assert.equal(eps.length, 2);
  assert.equal(eps[1].start, '2026-08-29', 'ciklas turi prasidėti nuo tikro srauto');
});

test('vienos dienos pertrūkis mėnesinių viduryje nesuskaldo epizodo', () => {
  const days = {
    '2026-08-01': { flow: 3 }, '2026-08-02': { flow: 3 },
    /* 08-03 tuščia */          '2026-08-04': { flow: 2 },
  };
  const eps = C.periodEpisodes(days);
  assert.equal(eps.length, 1);
  assert.equal(eps[0].length, 4);
});

// --- prognozė --------------------------------------------------------------

test('taisyklingas 28 d. ciklas: prognozė tiksli, pasitikėjimas aukštas', () => {
  const { days, lastStart } = build('2026-04-06', [28, 28, 28, 28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 10) });
  assert.equal(s.avgCycle, 28);
  assert.equal(s.nextPeriod, C.addDays(lastStart, 28));
  assert.equal(s.confidence, 'high');
  assert.ok(s.window <= 2, `langas turi būti siauras, gautas ${s.window}`);
  assert.equal(s.dayOfCycle, 11);
});

test('vienas nukrypęs ciklas po ligos nesugriauna prognozės', () => {
  const { days, lastStart } = build('2026-01-05', [28, 27, 29, 61, 28, 28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 5) });
  assert.ok(Math.abs(s.avgCycle - 28) <= 1,
    `svertinė mediana turi likti ~28, gauta ${s.avgCycle}`);
});

test('netaisyklingas ciklas: platus langas ir žemas pasitikėjimas, o ne netikras tikslumas', () => {
  const { days, lastStart } = build('2025-10-01', [24, 45, 31, 38, 26, 41]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 3) });
  assert.equal(s.confidence, 'low');
  assert.ok(s.window >= 5, `langas turi būti platus, gautas ${s.window}`);
  const r = C.regularity(s);
  assert.equal(r.level, 'irregular');
});

test('naujesni ciklai sveria daugiau — ciklas po gimdymo trumpėja', () => {
  const { days, lastStart } = build('2025-09-01', [45, 42, 38, 33, 30, 29]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 2) });
  assert.ok(s.avgCycle <= 36,
    `prognozė turi sekti naujausius ciklus, gauta ${s.avgCycle}`);
});

test('be istorijos naudojamas numatytasis ilgis ir žemas pasitikėjimas', () => {
  const days = { '2026-08-10': { flow: 3 }, '2026-08-11': { flow: 3 }, '2026-08-12': { flow: 2 } };
  const s = C.analyze({ days, today: '2026-08-15', settings: { avgCycle: 30 } });
  assert.equal(s.avgCycle, 30);
  assert.equal(s.basis, 'default');
  assert.equal(s.confidence, 'low');
  assert.equal(s.nextPeriod, '2026-09-09');
});

test('nutrūkęs žymėjimas: nerodoma „vėluoja 200 dienų"', () => {
  const days = { '2026-01-05': { flow: 3 }, '2026-01-06': { flow: 3 } };
  const s = C.analyze({ days, today: '2026-08-22' });
  assert.equal(s.stale, true);
  assert.equal(s.late, 0);
  assert.equal(s.dayOfCycle, null);
  assert.equal(s.phase, C.PHASE.UNKNOWN);
});

test('realus vėlavimas skaičiuojamas ir po 7 d. siūlomas testas', () => {
  const { days, lastStart } = build('2026-03-01', [28, 28, 28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 36) });
  assert.equal(s.late, 8);
  assert.equal(C.suggestTest(s), true);
});

// --- ovuliacija ------------------------------------------------------------

test('ovuliacija skaičiuojama atgal nuo mėnesinių, ne nuo ciklo vidurio', () => {
  const { days, lastStart } = build('2026-01-01', [35, 35, 35]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 5) });
  // 35 d. ciklas: ovuliacija ~22 d., o ne 17 („vidurys")
  const ovDay = C.daysBetween(lastStart, s.ovulation.date) + 1;
  assert.ok(ovDay >= 19 && ovDay <= 23, `ovuliacija turi būti ~21 d., gauta ${ovDay}`);
  assert.equal(s.ovulation.source, 'calendar');
});

test('BBT „3 virš 6" patvirtina ovuliaciją ir nustelbia kalendorių', () => {
  const start = '2026-08-01';
  const days = {};
  for (let i = 0; i < 5; i++) days[C.addDays(start, i)] = { flow: 3 };
  // 1–14 d. žema fazė, nuo 15 d. — pakilimas
  const low  = [36.35, 36.40, 36.30, 36.38, 36.42, 36.36, 36.40, 36.34, 36.38, 36.30, 36.36, 36.40, 36.32, 36.38];
  const high = [36.62, 36.70, 36.68, 36.72, 36.66, 36.70, 36.74];
  low.forEach((t, i) => { const d = C.addDays(start, i); days[d] = { ...(days[d] || {}), bbt: t }; });
  high.forEach((t, i) => { days[C.addDays(start, 14 + i)] = { bbt: t }; });

  const s = C.analyze({ days, today: C.addDays(start, 20), settings: { avgCycle: 28 } });
  assert.equal(s.ovulation.source, 'bbt');
  assert.equal(s.ovulation.confirmed, true);
  assert.equal(s.ovulation.date, C.addDays(start, 13), '14-a diena = paskutinė žema');
  assert.equal(s.phase, C.PHASE.LUTEAL);
});

test('nepakankamas temperatūros pakilimas nelaikomas ovuliacija', () => {
  const start = '2026-08-01';
  const days = {};
  for (let i = 0; i < 20; i++) days[C.addDays(start, i)] = { bbt: 36.40 + (i % 3) * 0.03 };
  const cd = C.rangeDays(start, C.addDays(start, 19));
  assert.equal(C.bbtShift(days, cd), null);
});

test('LH testas prognozuoja ovuliaciją kitą dieną', () => {
  const days = { '2026-08-14': { lh: 'pos' } };
  assert.equal(C.lhSurge(days, C.rangeDays('2026-08-01', '2026-08-20')), '2026-08-15');
});

test('gleivių peak day randamas prieš sausėjimą', () => {
  const days = {
    '2026-08-10': { mucus: 'creamy' }, '2026-08-11': { mucus: 'watery' },
    '2026-08-12': { mucus: 'eggwhite' }, '2026-08-13': { mucus: 'eggwhite' },
    '2026-08-14': { mucus: 'sticky' }, '2026-08-15': { mucus: 'dry' }, '2026-08-16': { mucus: 'dry' },
  };
  assert.equal(C.mucusPeak(days, C.rangeDays('2026-08-01', '2026-08-20')), '2026-08-13');
});

test('vaisingas langas apima 5 d. prieš ovuliaciją ir 1 po', () => {
  const { days, lastStart } = build('2026-02-01', [28, 28, 28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 8) });
  assert.equal(C.daysBetween(s.fertile.from, s.ovulation.date), 5);
  assert.equal(C.daysBetween(s.ovulation.date, s.fertile.to), 1);
});

test('asmeninė liuteininė fazė mokoma iš patvirtintų ovuliacijų', () => {
  // du ciklai su BBT pakilimu, liuteininė fazė 11 d.
  const days = {};
  let start = '2026-01-01';
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < 4; i++) days[C.addDays(start, i)] = { flow: 3 };
    for (let i = 0; i < 17; i++) days[C.addDays(start, i)] = { ...(days[C.addDays(start, i)] || {}), bbt: 36.35 + (i % 3) * 0.03 };
    for (let i = 17; i < 28; i++) days[C.addDays(start, i)] = { bbt: 36.70 + (i % 2) * 0.03 };
    start = C.addDays(start, 28);
  }
  const s = C.analyze({ days, today: C.addDays(start, 3) });
  assert.ok(s.lutealDays >= 10 && s.lutealDays <= 12,
    `liuteininė fazė turi būti ~11 d., gauta ${s.lutealDays}`);
});

// --- fazės -----------------------------------------------------------------

test('fazė teisinga per visą ciklą', () => {
  const { days, lastStart } = build('2026-01-05', [28, 28, 28]);
  const at = n => C.analyze({ days, today: C.addDays(lastStart, n) }).phase;
  // 28 d. ciklas, liuteininė 14 → ovuliacija 14-ą ciklo dieną (lastStart + 13)
  assert.equal(at(0), C.PHASE.MENSTRUAL);
  assert.equal(at(6), C.PHASE.FOLLICULAR);
  assert.equal(at(8), C.PHASE.FERTILE, 'vaisingas langas prasideda 5 d. prieš ovuliaciją');
  assert.equal(at(13), C.PHASE.OVULATION);
  assert.equal(at(14), C.PHASE.FERTILE, 'kiaušinėlis gyvas dar parą');
  assert.equal(at(20), C.PHASE.LUTEAL);
  assert.equal(at(25), C.PHASE.PMS);
});

// --- nėštumas --------------------------------------------------------------

test('28 d. ciklas ovuliuoja 14-ą dieną, kaip vadovėlyje', () => {
  const { days, lastStart } = build('2026-01-05', [28, 28, 28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 5) });
  assert.equal(C.daysBetween(lastStart, s.ovulation.date) + 1, 14);
});

test('nėštumo savaitė ir terminas', () => {
  const p = C.pregnancyInfo('2026-01-01', '2026-04-02');   // 91 d. = 13 sav. lygiai
  assert.equal(p.week, 13);
  assert.equal(p.due, '2026-10-08');
  assert.equal(p.trimester, 2);
  assert.equal(p.daysLeft, 189);
});

// --- kalendorius -----------------------------------------------------------

test('kalendorius: faktas nustelbia prognozę toje pačioje dienoje', () => {
  const { days, lastStart } = build('2026-05-01', [28, 28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 3) });
  const paint = C.paintRange(s, C.addDays(lastStart, -60), C.addDays(lastStart, 60));
  assert.equal(paint[lastStart].kind, 'period');
  assert.equal(paint[lastStart].predicted, false);
  const next = C.addDays(lastStart, 28);
  assert.equal(paint[next].kind, 'period');
  assert.equal(paint[next].predicted, true);
});

test('kalendorius pažymi prognozuojamą vaisingą langą ateities cikle', () => {
  const { days, lastStart } = build('2026-05-01', [28, 28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 3) });
  const paint = C.paintRange(s, lastStart, C.addDays(lastStart, 60));
  const ovNext = C.ovulationDate(C.addDays(lastStart, 28), s.lutealDays);
  assert.equal(paint[ovNext].kind, 'ovulation');
});

// --- įžvalgos --------------------------------------------------------------

test('simptomai grupuojami pagal fazę', () => {
  const { days, lastStart } = build('2026-01-05', [28, 28, 28]);
  // galvos skausmas visada 2 d. prieš mėnesines
  let s0 = '2026-01-05';
  for (let i = 0; i < 3; i++) {
    const pre = C.addDays(s0, 26);
    days[pre] = { ...(days[pre] || {}), symptoms: ['headache'] };
    s0 = C.addDays(s0, 28);
  }
  const st = C.analyze({ days, today: C.addDays(lastStart, 5) });
  const pat = C.symptomPatterns(days, st);
  assert.equal(pat.headache.total, 3);
  assert.equal(pat.headache.peak, C.PHASE.PMS);
});

test('reguliarumas: 3+ ciklų reikia išvadai', () => {
  const { days, lastStart } = build('2026-04-01', [28]);
  const s = C.analyze({ days, today: C.addDays(lastStart, 2) });
  assert.equal(C.regularity(s).level, 'unknown');
});

test('statistika ignoruoja absurdiškus ciklus, bet istorijoje juos rodo', () => {
  const days = {
    '2026-01-01': { flow: 3 }, '2026-01-02': { flow: 3 },
    '2026-01-10': { flow: 3 },                              // 9 d. „ciklas" — klaida
    '2026-02-07': { flow: 3 }, '2026-02-08': { flow: 3 },
    '2026-03-07': { flow: 3 },
  };
  const s = C.analyze({ days, today: '2026-03-10' });
  assert.equal(s.cycles.length, 3);
  assert.equal(s.validCycles.length, 2, '9 d. ciklas turi būti atmestas');
  assert.ok(C.cycleHistory(s).some(c => !c.valid));
});
