/* Lapas — pirmas paleidimas. Trys klausimai, jokių paskyrų. */

'use strict';

import { el, esc, $, $$, tap } from './dom.js';
import { t, LANGS, setLang, detectLang } from '../i18n.js';
import * as C from '../cycle.js';

export function renderOnboarding(ctx) {
  const today = C.todayISO();
  let lang = detectLang();
  let lastPeriod = '';
  let cycleLen = 28;

  const node = el(`<div class="screen" style="display:flex;flex-direction:column;justify-content:center;min-height:100vh">
    <div style="text-align:center;margin-bottom:26px">
      <div style="font-size:52px">🍃</div>
      <h1 style="font-size:27px;margin-top:10px" id="ob-hi">${esc(t('onb_welcome'))}</h1>
    </div>

    <div class="seg" data-seg="lang" style="margin-bottom:18px">
      ${LANGS.map(l => `<button data-v="${l.id}" aria-pressed="${l.id === lang}">${esc(l.label)}</button>`).join('')}
    </div>

    <div class="card">
      <div class="note" id="ob-intro">${esc(t('onb_intro'))}</div>

      <div class="field" style="margin-top:16px">
        <label id="ob-lp">${esc(t('onb_last_period'))}</label>
        <input type="date" id="ob-date" max="${esc(today)}" min="${esc(C.addDays(today, -400))}">
      </div>

      <div class="field">
        <label id="ob-cl">${esc(t('onb_cycle_len'))}</label>
        <div class="stepper" id="ob-cycle">
          <button data-d="-1">−</button>
          <div class="val">28<small id="ob-days">${esc(t('ins_days'))}</small></div>
          <button data-d="1">+</button>
        </div>
      </div>
    </div>

    <button class="btn block" id="ob-go" style="margin-top:8px">${esc(t('onb_start'))}</button>
    <div class="foot-note" id="ob-backup">${esc(t('onb_backup'))}</div>
  </div>`);

  const retext = () => {
    $('#ob-hi', node).textContent = t('onb_welcome');
    $('#ob-intro', node).textContent = t('onb_intro');
    $('#ob-lp', node).textContent = t('onb_last_period');
    $('#ob-cl', node).textContent = t('onb_cycle_len');
    $('#ob-go', node).textContent = t('onb_start');
    $('#ob-backup', node).textContent = t('onb_backup');
    $('#ob-days', node).textContent = t('ins_days');
  };

  node.addEventListener('click', e => {
    const l = e.target.closest('[data-seg="lang"] button');
    if (l) {
      lang = l.dataset.v; setLang(lang); tap();
      $$('[data-seg="lang"] button', node).forEach(x => x.setAttribute('aria-pressed', String(x === l)));
      retext();
      return;
    }
    const st = e.target.closest('#ob-cycle button');
    if (st) {
      cycleLen = Math.min(60, Math.max(15, cycleLen + (+st.dataset.d)));
      tap();
      $('#ob-cycle .val', node).innerHTML = `${cycleLen}<small id="ob-days">${esc(t('ins_days'))}</small>`;
    }
  });

  $('#ob-go', node).onclick = async () => {
    lastPeriod = $('#ob-date', node).value;
    await ctx.onDone({ lang, cycleLen, lastPeriod });
  };

  return node;
}
