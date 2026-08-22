/* Lapas — ekranas „Šiandien". Ciklo žiedas, prognozė, greitas žymėjimas. */

'use strict';

import { el, esc, ICON } from './dom.js';
import { t, formatDate, formatRange, getLang, cycleCount } from '../i18n.js';
import * as C from '../cycle.js';
import { FLOW_LEVELS, labelOf, fetusSize } from '../catalog.js';

const R = 84, CIRC = 2 * Math.PI * R;

/** Lankas nuo ciklo dienos `a` iki `b` imtinai (1-indexed). */
function arc(a, b, cycle, cls, width = 13) {
  const from = Math.max(0, a - 1), to = Math.min(cycle, b);
  if (to <= from) return '';
  const len = CIRC * (to - from) / cycle;
  return `<circle class="${cls}" cx="100" cy="100" r="${R}" fill="none"
    stroke-width="${width}" stroke-linecap="butt"
    stroke-dasharray="${len.toFixed(2)} ${(CIRC - len).toFixed(2)}"
    stroke-dashoffset="${(-CIRC * from / cycle).toFixed(2)}"/>`;
}

function ring(state) {
  const cycle = state.avgCycle;
  const day = state.dayOfCycle;
  const period = state.avgPeriod;

  let ovDay = null, fertFrom = null, fertTo = null;
  if (state.ovulation && state.cycleStart) {
    ovDay = C.daysBetween(state.cycleStart, state.ovulation.date) + 1;
    fertFrom = C.daysBetween(state.cycleStart, state.fertile.from) + 1;
    fertTo = C.daysBetween(state.cycleStart, state.fertile.to) + 1;
  }

  let marker = '';
  if (day != null && day <= cycle) {
    const th = 2 * Math.PI * (day - 0.5) / cycle;
    const mx = (100 + R * Math.cos(th)).toFixed(2), my = (100 + R * Math.sin(th)).toFixed(2);
    marker = `<circle class="ring-halo" cx="${mx}" cy="${my}" r="8.5" stroke-width="4"/>
              <circle class="ring-marker" cx="${mx}" cy="${my}" r="5"/>`;
  }

  return `<svg viewBox="0 0 200 200" aria-hidden="true">
    <circle cx="100" cy="100" r="${R}" fill="none" stroke="var(--ring-track)" stroke-width="13"/>
    ${fertFrom ? arc(fertFrom, fertTo, cycle, '', 13).replace('class=""', 'stroke="var(--sage-bg)"') : ''}
    ${arc(1, period, cycle, '', 13).replace('class=""', 'stroke="var(--accent)"')}
    ${ovDay ? arc(ovDay, ovDay, cycle, '', 13).replace('class=""', 'stroke="var(--sage)"') : ''}
    ${marker}
  </svg>`;
}

function phaseClass(phase) {
  return [C.PHASE.FERTILE, C.PHASE.OVULATION].includes(phase) ? 'sage' : '';
}

/** Kodėl prognozės nerodome — sąrašas priežasčių žmogaus kalba. */
function unknownCard(state) {
  const rs = state.quality.reasons.filter(r => r !== 'irregular' || state.quality.level === 'none');
  return `<div class="card">
    <h2>${esc(t('unknown_title'))}</h2>
    <div style="font-size:14.5px;line-height:1.5;color:var(--ink-2)">${esc(t('unknown_intro'))}</div>
    <div class="list" style="margin-top:10px">
      ${rs.map(r => `<div class="item"><span class="ico">·</span>
        <span class="txt"><b style="font-weight:600;font-size:14px">${esc(t('q_' + r))}</b></span></div>`).join('')}
    </div>
  </div>`;
}

function prediction(state) {
  if (state.stale && !state.skipped) {
    return `<div class="headline"><div class="big">${esc(t('stale_title'))}</div>
      <div class="small">${esc(t('stale_note'))}</div></div>`;
  }
  if (!state.cycleStart) {
    return `<div class="headline"><div class="big">${esc(t('no_data_yet'))}</div>
      <div class="small">${esc(t('start_hint'))}</div></div>`;
  }

  const r = state.nextPeriodRange;

  // Kai duomenų nepakanka, taškinė diena būtų apsimestinis tikslumas — rodom tik langą.
  if (state.quality.level === 'none') {
    return `<div class="headline">
      <div class="big" style="font-size:18px">${esc(r && r.from !== r.to
        ? t('period_maybe_range', { range: formatRange(r.from, r.to) })
        : t('no_data_yet'))}</div>
    </div>`;
  }

  const n = state.daysUntilPeriod;
  let big;
  if (state.late > 0) big = `<div class="big late">${esc(t('late_by', { n: state.late }))}</div>`;
  else if (n === 0) big = `<div class="big">${esc(t('period_today'))}</div>`;
  else if (n === 1) big = `<div class="big">${esc(t('period_tomorrow'))}</div>`;
  else big = `<div class="big">${esc(t('period_in_days', { n }))}</div>`;
  // Diena rodoma kartu su langu — taškinė prognozė be neapibrėžtumo yra pažadas,
  // kurio modelis negali ištesėti.
  const lines = [t('likely_on', { date: formatDate(state.nextPeriod) })];
  if (r && r.from !== r.to) {
    lines.push(t('window_80', { range: formatRange(r.from, r.to) }));
  }

  return `<div class="headline">${big}
    <div class="small">${esc(lines.join(' · '))}</div>
  </div>`;
}

function pregnancyCard(p) {
  if (!p) return '';
  const size = fetusSize(p.week);
  return `<div class="card">
    <div class="ring-wrap" style="padding-bottom:10px">
      <div class="ring-num" style="font-size:52px">${p.week}</div>
      <div class="ring-phase sage">${esc(t('preg_week', { n: p.week }))} · ${esc(t('preg_day_of_week', { n: p.dayOfWeek }))}</div>
    </div>
    <div class="stats" style="margin-top:8px">
      <div class="stat flat"><div class="k">${esc(t('preg_due'))}</div><div class="v" style="font-size:19px">${esc(formatDate(p.due, { year: true }))}</div></div>
      <div class="stat flat"><div class="k">${esc(t('preg_trimester', { n: p.trimester }))}</div><div class="v">${p.daysLeft}<small>${esc(t('days_short'))}</small></div></div>
    </div>
    ${size ? `<div class="note" style="display:flex;align-items:center;gap:10px">
      <span style="font-size:24px">${size.e}</span>
      <span>${esc(t('preg_size'))} ${esc(getLang() === 'en' ? size.en : size.lt)}</span></div>` : ''}
  </div>`;
}

/** „Bandau pastoti": kur šiandien ciklo atžvilgiu ir ką verta daryti. */
function ttcCard(state) {
  if (!state.ovulation || !state.fertile) return '';
  const { today, ovulation, fertile } = state;
  const toOv = C.daysBetween(today, ovulation.date);
  const inWindow = C.daysBetween(fertile.from, today) >= 0 && C.daysBetween(today, fertile.to) >= 0;

  const headline = toOv === 0 ? t('ttc_ovulation_today')
    : inWindow ? t('ttc_fertile_now')
    : toOv > 0 ? t('ttc_days_to_ov', { n: toOv })
    : t('ttc_after_ov', { n: -toOv });

  const source = ovulation.confirmed ? t('ov_source_bbt')
    : ovulation.source === 'lh' ? t('ov_source_lh')
    : ovulation.source === 'mucus' ? t('ov_source_mucus')
    : ovulation.personal ? t('ov_source_personal')
    : t('ov_source_calendar');

  const tip = ovulation.confirmed ? ''
    : toOv > 0 && toOv <= 5 ? t('ttc_tip_lh')
    : toOv > 5 ? t('ttc_tip_wait')
    : t('ttc_tip_bbt');

  return `<div class="card">
    <h2>${esc(t('ttc_title'))}</h2>
    <div style="display:flex;align-items:baseline;gap:9px;flex-wrap:wrap">
      <b style="font-size:19px;color:${inWindow || toOv === 0 ? 'var(--sage)' : 'var(--ink)'}">${esc(headline)}</b>
      <span style="font-size:12.5px;color:var(--ink-3);font-weight:600">${esc(source)}</span>
    </div>
    <div class="stats" style="margin-top:14px">
      <div class="stat flat"><div class="k">${esc(t('fertile_core'))}</div>
        <div class="v" style="font-size:17px">${esc(fertile.core.from.slice(5))} – ${esc(fertile.core.to.slice(5))}</div></div>
      <div class="stat flat"><div class="k">${esc(t('fertile_wide'))}</div>
        <div class="v" style="font-size:17px">${esc(fertile.from.slice(5))} – ${esc(fertile.to.slice(5))}</div></div>
    </div>
    ${!ovulation.confirmed && fertile.sd >= 1.5
      ? `<div class="note">${esc(t('ov_precision', { n: Math.round(fertile.sd) }))}</div>` : ''}
    ${tip ? `<div class="note">${esc(tip)}</div>` : ''}
  </div>`;
}

/** Kontracepcijos režimas: tabletė šiandien ir kaip sekasi laikytis. */
function pillCard(state, entry) {
  const meds = entry?.meds || [];
  const taken = meds.includes('pill_taken');

  let streak = 0;
  for (let i = taken ? 0 : 1; i < 90; i++) {
    const d = C.addDays(state.today, -i);
    if ((state.days[d]?.meds || []).includes('pill_taken')) streak++;
    else break;
  }
  let missed = 0;
  for (let i = 0; i < 30; i++) {
    if ((state.days[C.addDays(state.today, -i)]?.meds || []).includes('pill_missed')) missed++;
  }

  return `<div class="card">
    <h2>${esc(t('pill_title'))}</h2>
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:26px">${taken ? '✅' : '💊'}</span>
      <div style="flex:1">
        <b style="font-size:16px">${esc(taken ? t('pill_taken_today') : t('pill_not_yet'))}</b>
        <div style="font-size:12.5px;color:var(--ink-3);margin-top:2px">
          ${streak ? esc(t('pill_streak', { n: streak })) : ''}${missed ? ' · ' + esc(t('pill_missed_recent', { n: missed })) : ''}
        </div>
      </div>
      ${taken ? '' : `<button class="btn sm" data-act="pill">${esc(t('pill_take'))}</button>`}
    </div>
  </div>`;
}

/** Ką šiandien jau pažymėta — kad matytųsi be atskiro paspaudimo. */
function todaySummary(entry) {
  if (!entry || !Object.keys(entry).length) return '';
  const lang = getLang();
  const bits = [];
  if (entry.flow) bits.push(`${FLOW_LEVELS[entry.flow].e} ${lang === 'en' ? FLOW_LEVELS[entry.flow].en : FLOW_LEVELS[entry.flow].lt}`);
  for (const m of entry.mood || []) bits.push(labelOf(m, lang));
  for (const s of entry.symptoms || []) bits.push(labelOf(s, lang));
  if (entry.mucus) bits.push(labelOf(entry.mucus, lang));
  for (const s of entry.sex || []) bits.push(labelOf(s, lang));
  for (const s of entry.tests || []) bits.push(labelOf(s, lang));
  for (const s of entry.meds || []) bits.push(labelOf(s, lang));
  if (entry.bbt) bits.push(`🌡 ${entry.bbt.toFixed(2)}°`);
  if (entry.weight) bits.push(`⚖️ ${entry.weight}`);
  if (!bits.length && !entry.notes) return '';
  return `<div class="card flat">
    <h2>${esc(t('today'))}</h2>
    <div class="chips">${bits.map(b => `<span class="chip">${esc(b)}</span>`).join('')}</div>
    ${entry.notes ? `<div class="note" style="margin-top:12px">${esc(entry.notes)}</div>` : ''}
  </div>`;
}

/**
 * @param {Object} ctx { state, entry, onLog, onQuickPeriod, onBackup, needsBackup }
 */
export function renderToday(ctx) {
  const { state, entry } = ctx;
  const isPregnancy = state.mode === 'pregnancy';
  const phase = state.phase;
  const inPeriod = phase === C.PHASE.MENSTRUAL;

  const node = el(`<div class="screen">
    <div class="head">
      <h1>${esc(t('app'))}</h1>
      <div class="sub">${esc(formatDate(state.today))}</div>
    </div>

    ${isPregnancy ? pregnancyCard(state.pregnancy) : `
      <div class="card">
        <div class="ring-wrap">
          <div class="ring">
            ${ring(state)}
            <div class="ring-center">
              ${state.dayOfCycle != null ? `
                <div class="ring-day">${esc(t('day_of_cycle'))}</div>
                <div class="ring-num">${state.dayOfCycle}</div>` : `
                <div class="ring-num" style="font-size:40px">🍃</div>`}
              <div class="ring-phase ${phaseClass(phase)}">${esc(t('phase_' + phase))}</div>
              ${t('phase_' + phase + '_note') !== 'phase_' + phase + '_note'
                ? `<div class="ring-note">${esc(t('phase_' + phase + '_note'))}</div>` : ''}
            </div>
          </div>
        </div>
        ${prediction(state)}
      </div>`}

    ${state.skipped ? `<div class="note warn note-row">
      <span>${esc(t('skipped_ask', { n: C.daysBetween(state.cycleStart, state.today) + 1 }))}</span>
      <button class="btn sm ghost" data-act="log">${esc(t('skipped_yes'))}</button></div>` : ''}
    ${state.quality.level === 'none' && !isPregnancy ? unknownCard(state) : ''}
    ${state.quality.level === 'weak' && !isPregnancy
      ? `<div class="note">${state.quality.reasons.map(r => esc(t('q_' + r))).join(' ')}</div>` : ''}
    ${state.mode === 'ttc' ? ttcCard(state) : ''}
    ${state.mode === 'contraception' ? pillCard(state, entry) : ''}

    ${state.late >= 7 && !isPregnancy ? `<div class="note warn">${esc(t('suggest_test'))}</div>` : ''}
    ${ctx.needsBackup ? `<div class="note warn note-row">
      <span>${esc(t('backup_nudge'))}</span>
      <button class="btn sm ghost" data-act="backup">${esc(t('backup_now'))}</button></div>` : ''}

    <div class="row" style="margin:14px 0 4px">
      <button class="btn block" data-act="log">${esc(t('log_today'))}</button>
    </div>
    ${!isPregnancy ? `<div class="row" style="margin-bottom:8px">
      <button class="btn block ghost" data-act="quick">${esc(inPeriod ? t('quick_period_end') : t('quick_period'))}</button>
    </div>` : ''}

    ${todaySummary(entry)}

    <div class="foot-note">${esc(t('disc_not_contraception'))}</div>
  </div>`);

  node.querySelector('[data-act="log"]')?.addEventListener('click', () => ctx.onLog(state.today));
  node.querySelector('[data-act="quick"]')?.addEventListener('click', () => ctx.onQuickPeriod(inPeriod));
  node.querySelector('[data-act="backup"]')?.addEventListener('click', () => ctx.onBackup());
  node.querySelector('[data-act="pill"]')?.addEventListener('click', () => ctx.onPill());
  return node;
}
