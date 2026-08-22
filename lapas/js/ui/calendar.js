/* Lapas — mėnesio kalendorius. Faktas ir prognozė atskiriami akimirksniu:
 * užpildytas skritulys = buvo, punktyrinis kontūras = prognozuojama.
 */

'use strict';

import { el, esc, $$, tap } from './dom.js';
import { t, monthName } from '../i18n.js';
import * as C from '../cycle.js';

let cursor = null;   // rodomas mėnuo, ISO pirmoji diena

export function resetCursor() { cursor = null; }

function monthGrid(state, year, month, weekStart) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() - weekStart + 7) % 7;

  const from = C.addDays(first, -firstDow - 7);
  const to = C.addDays(first, daysInMonth + 14);
  const paint = C.paintRange(state, from, to);
  const today = state.today;

  const cells = [];
  for (let i = 0; i < firstDow; i++) {
    const d = C.addDays(first, i - firstDow);
    cells.push({ d, out: true });
  }
  for (let i = 0; i < daysInMonth; i++) cells.push({ d: C.addDays(first, i), out: false });
  while (cells.length % 7) cells.push({ d: C.addDays(first, cells.length - firstDow), out: true });

  const wd = t('weekdays');
  const head = Array.from({ length: 7 }, (_, i) => wd[(i + weekStart) % 7]);

  return `
    <div class="cal-grid">
      ${head.map(w => `<div class="cal-wd">${esc(w)}</div>`).join('')}
      ${cells.map(({ d, out }) => {
        const p = paint[d];
        const future = C.daysBetween(today, d) > 0;
        const has = state.days?.[d] && Object.keys(state.days[d]).length;
        const cls = [
          'cal-cell',
          out ? 'out' : '',
          future ? 'future' : '',
          d === today ? 'today' : '',
          p ? 'k-' + p.kind : '',
          p?.predicted ? 'pred' : '',
        ].filter(Boolean).join(' ');
        return `<button class="${cls}" data-d="${d}">${+d.slice(-2)}${
          has && !p ? '<span class="cal-dot"></span>' : ''}</button>`;
      }).join('')}
    </div>`;
}

export function renderCalendar(ctx) {
  const { state, settings } = ctx;
  if (!cursor) cursor = state.today.slice(0, 7) + '-01';
  const [y, m] = cursor.split('-').map(Number);
  const weekStart = settings.weekStart ?? 1;

  const node = el(`<div class="screen">
    <div class="head"><h1>${esc(t('nav_calendar'))}</h1></div>
    <div class="card">
      <div class="cal-head">
        <b>${esc(monthName(m - 1))} ${y}</b>
        <div class="cal-nav">
          <button data-nav="-1" aria-label="prev">‹</button>
          <button data-nav="today">•</button>
          <button data-nav="1" aria-label="next">›</button>
        </div>
      </div>
      ${monthGrid(state, y, m - 1, weekStart)}
      <div class="legend">
        <span><i style="background:var(--accent)"></i>${esc(t('legend_period'))}</span>
        <span><i style="border:2px dashed var(--accent);background:transparent"></i>${esc(t('legend_predicted'))}</span>
        <span><i style="background:var(--accent-bg);border-color:var(--accent-2)"></i>${esc(t('legend_window'))}</span>
        <span><i style="background:var(--sage-bg)"></i>${esc(t('legend_fertile'))}</span>
        <span><i style="background:var(--sage)"></i>${esc(t('legend_ovulation'))}</span>
      </div>
    </div>
    <div class="foot-note">${esc(t('future_note'))}</div>
  </div>`);

  node.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      tap();
      if (nav.dataset.nav === 'today') cursor = state.today.slice(0, 7) + '-01';
      else {
        const step = +nav.dataset.nav;
        const dt = new Date(Date.UTC(y, m - 1 + step, 1));
        cursor = dt.toISOString().slice(0, 8) + '01';
      }
      ctx.rerender();
      return;
    }
    const cell = e.target.closest('.cal-cell');
    if (cell) {
      const d = cell.dataset.d;
      if (C.daysBetween(state.today, d) > 0) return;   // ateities nežymim
      tap();
      ctx.onLog(d);
    }
  });

  return node;
}
