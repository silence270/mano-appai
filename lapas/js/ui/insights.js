/* Lapas — įžvalgos. Tik tai, kas išplaukia iš tavo pačios įrašų. */

'use strict';

import { el, esc } from './dom.js';
import { t, formatDate, getLang, cycleCount } from '../i18n.js';
import * as C from '../cycle.js';
import { labelOf } from '../catalog.js';

function statCard(k, v, unit, note) {
  return `<div class="stat"><div class="k">${esc(k)}</div>
    <div class="v">${esc(v)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    ${note ? `<div class="n">${esc(note)}</div>` : ''}</div>`;
}

function cycleBars(state) {
  const hist = C.cycleHistory(state).slice(-14);
  if (hist.length < 2) return `<div class="empty">${esc(t('ins_cycles_empty'))}</div>`;
  const max = Math.max(...hist.map(h => h.length), state.avgCycle + 4);
  return `<div class="bars">${hist.map(h => {
    const pw = (h.periodLength / max) * 100;
    const rw = ((h.length - h.periodLength) / max) * 100;
    return `<div class="bar-row ${h.valid ? '' : 'bad'}">
      <span class="lbl">${esc(h.start.slice(5))}</span>
      <span class="track">
        <span class="fill p" style="width:${pw.toFixed(1)}%"></span>
        <span class="fill rest" style="width:${Math.max(0, rw).toFixed(1)}%"></span>
      </span>
      <span class="num">${h.valid ? h.length : '·'}</span>
    </div>`;
  }).join('')}</div>`;
}

function bbtChart(state) {
  const pick = C.bbtCycleToShow(state.days, state);
  if (!pick) return `<div class="empty">${esc(t('ins_bbt_empty'))}</div>`;
  const { points, coverline, ovulation } = C.bbtChart(state.days, pick.start, pick.end);
  const withT = points.filter(p => p.t != null);
  if (withT.length < 4) return `<div class="empty">${esc(t('ins_bbt_empty'))}</div>`;

  const W = 320, H = 150, PAD_L = 28, PAD_B = 18, PAD_T = 8;
  const temps = withT.map(p => p.t);
  const lo = Math.min(...temps) - 0.08, hi = Math.max(...temps) + 0.08;
  const nDays = Math.max(points.length, 10);
  const x = i => PAD_L + (i / (nDays - 1)) * (W - PAD_L - 6);
  const y = v => PAD_T + (1 - (v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);

  const path = withT.map((p, i) => `${i ? 'L' : 'M'}${x(p.day - 1).toFixed(1)},${y(p.t).toFixed(1)}`).join('');
  const ticks = [lo + (hi - lo) * 0.15, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.85];

  const label = pick.current ? '' :
    `<div style="font-size:11.5px;color:var(--ink-3);margin-bottom:6px">${esc(formatDate(pick.start))} – ${esc(formatDate(pick.end))}</div>`;

  return `${label}<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${ticks.map(v => `<line class="grid-line" x1="${PAD_L}" x2="${W - 4}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
      <text x="2" y="${(y(v) + 3).toFixed(1)}">${v.toFixed(2)}</text>`).join('')}
    ${coverline ? `<line class="cover" x1="${PAD_L}" x2="${W - 4}" y1="${y(coverline).toFixed(1)}" y2="${y(coverline).toFixed(1)}"/>` : ''}
    ${ovulation ? (() => {
      const d = C.daysBetween(pick.start, ovulation);
      return `<line class="ovline" x1="${x(d).toFixed(1)}" x2="${x(d).toFixed(1)}" y1="${PAD_T}" y2="${H - PAD_B}"/>`;
    })() : ''}
    <path class="curve" d="${path}"/>
    ${withT.map(p => `<circle class="dot" cx="${x(p.day - 1).toFixed(1)}" cy="${y(p.t).toFixed(1)}" r="2.6"/>`).join('')}
    <text x="${PAD_L}" y="${H - 4}">1</text>
    <text x="${(W - 12).toFixed(0)}" y="${H - 4}">${nDays}</text>
  </svg>
  ${ovulation ? `<div class="note" style="margin-top:4px">🌿 ${esc(t('ins_confirmed_ov'))}: ${esc(formatDate(ovulation))}</div>` : ''}`;
}

/** Tikroji šio app'o paklaida šiai moteriai — matuota iš jos pačios istorijos. */
function calibrationBlock(state) {
  const cal = C.calibration(state);
  if (!cal) return `<div class="empty">${esc(t('cal_none'))}</div>`;
  const good = cal.mae <= 2;
  return `<div>
    <div style="font-size:16px;font-weight:650;line-height:1.45">
      ${esc(t('cal_line', { n: cal.n, mae: cal.mae.toString().replace('.', ',') }))}
    </div>
    <div class="note" style="margin-top:10px">
      ${esc(t('cal_coverage', { n: Math.round(cal.coverage * 100) }))}${good ? ' · ' + esc(t('cal_good')) : ''}
    </div>
    <div class="bars" style="margin-top:12px">
      ${cal.errors.slice(-8).map(e => {
        const w = Math.min(50, Math.abs(e) * 6);
        const neg = e < 0;
        return `<div class="bar-row">
          <span class="lbl">${e > 0 ? '+' : ''}${String(e).replace('.', ',')}</span>
          <span class="track" style="position:relative">
            <span style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--line)"></span>
            <span class="fill" style="position:absolute;${neg ? 'right:50%' : 'left:50%'};
              width:${w}%;height:100%;background:${Math.abs(e) <= 2 ? 'var(--sage-2)' : 'var(--accent-2)'};
              border-radius:${neg ? '6px 0 0 6px' : '0 6px 6px 0'}"></span>
          </span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function patterns(state) {
  const pat = C.symptomPatterns(state.days, state);
  const lang = getLang();
  const rows = Object.entries(pat)
    .filter(([, v]) => v.total >= 2 && v.peak)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);
  if (!rows.length) return `<div class="empty">${esc(t('ins_no_patterns'))}</div>`;
  return `<div class="list">${rows.map(([id, v]) => `
    <div class="item">
      <span class="ico">${esc(labelOf(id, lang).split(' ')[0])}</span>
      <span class="txt"><b>${esc(labelOf(id, lang).split(' ').slice(1).join(' '))}</b>
        <span>${esc(t('phase_' + v.peak))} · ${v.byPhase[v.peak]} ${esc(t('of_times', { n: v.total }))}</span></span>
      <span class="val">${v.total}×</span>
    </div>`).join('')}</div>`;
}

export function renderInsights(ctx) {
  const { state } = ctx;
  const reg = C.regularity(state);
  const cldTxt = reg.cld != null ? String(reg.cld).replace('.', ',') : '';
  const regNote = reg.level === 'unknown' ? t('reg_unknown_note')
    : reg.level === 'very_regular' ? t('reg_very_regular_note')
    : t('reg_' + reg.level + '_note', { n: cldTxt });

  return el(`<div class="screen">
    <div class="head"><h1>${esc(t('nav_insights'))}</h1>
      <div class="sub">${state.validCycles.length ? esc(cycleCount(state.validCycles.length)) : ''}</div></div>

    <div class="card">
      <h2>${esc(t('ins_overview'))}</h2>
      <div class="stats">
        ${statCard(t('ins_avg_cycle'), state.avgCycle, t('ins_days'),
          state.basis === 'default' ? t('based_on_default', { n: state.avgCycle }) : t('based_on_cycles', { c: cycleCount(state.validCycles.length) }))}
        ${statCard(t('ins_avg_period'), state.avgPeriod, t('ins_days'))}
        ${statCard(t('ins_regularity'), t('reg_' + reg.level), '',
          reg.spread != null ? `${reg.min}–${reg.max} ${t('ins_days')}` : '')}
        ${statCard(t('ins_luteal'), state.lutealDays, t('ins_days'))}
      </div>
      <div class="note">${esc(regNote)}${
        reg.percentile ? ' ' + esc(t('reg_percentile', { n: reg.percentile })) : ''}</div>
    </div>

    <div class="card"><h2>${esc(t('ins_history'))}</h2>${cycleBars(state)}</div>
    <div class="card"><h2>${esc(t('ins_bbt'))}</h2>${bbtChart(state)}</div>
    <div class="card"><h2>${esc(t('ins_patterns'))}</h2>${patterns(state)}</div>
    <div class="card"><h2>${esc(t('cal_title'))}</h2>${calibrationBlock(state)}</div>

    <div class="card flat">
      <h2>${esc(t('disc_title'))}</h2>
      <div class="list">
        ${[['🚫', t('disc_not_contraception')], ['📉', t('disc_calendar_odds')],
           ['🩺', t('disc_not_diagnosis')], ['🦠', t('disc_no_sti')],
           ['⚖️', t('disc_accuracy')]].map(([e, txt]) => `
          <div class="item"><span class="ico">${e}</span>
            <span class="txt"><b style="font-weight:500;font-size:13.5px;line-height:1.5">${esc(txt)}</b></span></div>`).join('')}
      </div>
    </div>
  </div>`);
}
