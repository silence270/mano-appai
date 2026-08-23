/* Lapas — nustatymai. Čia gyvena viskas, kas susiję su duomenų likimu. */

'use strict';

import { el, esc, $, $$, sheet, toast, confirmSheet, ICON, tap } from './dom.js';
import { t, LANGS, formatDate } from '../i18n.js';
import * as DB from '../db.js';
import * as T from '../transfer.js';
import { sendSheet, receiveSheet } from './qr.js';

const MODES = ['track', 'ttc', 'pregnancy', 'contraception', 'perimenopause'];

function item(icon, title, sub, right = '', attrs = '') {
  return `<button class="item" ${attrs}>
    <span class="ico">${icon}</span>
    <span class="txt"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
    ${right ? `<span class="val">${esc(right)}</span>` : ''}
    <span class="chev">${ICON.chevron}</span>
  </button>`;
}

/** Pasirinkimo eilutė — aiškiau nei keturi segmentai vienas ant kito. */
function pick(group, value, active, title, sub) {
  return `<button class="pick" data-pick="${esc(group)}" data-v="${esc(value)}" aria-pressed="${active}">
    <span class="mark"></span>
    <span class="txt"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
  </button>`;
}

function stepper(id, value, unit, min, max) {
  return `<div class="stepper" data-step="${id}" data-min="${min}" data-max="${max}">
    <button data-d="-1">−</button>
    <div class="val">${value}<small>${esc(unit)}</small></div>
    <button data-d="1">+</button>
  </div>`;
}

export function renderSettings(ctx) {
  const { settings, state, storage } = ctx;

  const node = el(`<div class="screen">
    <div class="head"><h1>${esc(t('nav_settings'))}</h1></div>

    <div class="card">
      <h2>${esc(t('mode'))}</h2>
      <div class="picks">
        ${MODES.map(m => pick('mode', m, settings.mode === m, t('mode_' + m), t('mode_' + m + '_note'))).join('')}
      </div>
      ${settings.mode === 'pregnancy' ? `
        <div class="field" style="margin-top:14px"><label>${esc(t('preg_start'))}</label>
          <input type="date" id="preg-start" value="${esc(settings.pregnancyStart || state.cycleStart || '')}" max="${esc(state.today)}">
        </div>` : ''}
    </div>

    <div class="card">
      <h2>${esc(t('set_language'))}</h2>
      <div class="seg" data-seg="lang">
        ${LANGS.map(l => `<button data-v="${l.id}" aria-pressed="${(settings.lang || ctx.autoLang) === l.id}">${esc(l.label)}</button>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>${esc(t('set_theme'))}</h2>
      <div class="seg" data-seg="theme">
        ${['auto', 'light', 'dark'].map(th => `<button data-v="${th}" aria-pressed="${settings.theme === th}">${esc(t('theme_' + th))}</button>`).join('')}
      </div>
    </div>

    <div class="card">
      <h2>${esc(t('set_about_you') || '')}</h2>
      <div class="field"><label>${esc(t('set_birth_year'))}</label>
        <input type="number" id="birth-year" inputmode="numeric" min="1960"
               max="${new Date().getFullYear() - 9}" value="${esc(settings.birthYear || '')}"
               placeholder="—">
        <div class="hint">${esc(t('birth_year_why'))}</div>
      </div>
      <div class="field" style="margin-top:14px"><label>${esc(t('set_stopped_hormones'))}</label>
        <input type="date" id="stopped-hormones" max="${esc(state.today)}"
               value="${esc(settings.contraceptionStoppedAt || '')}">
      </div>
    </div>

    <div class="card">
      <h2>${esc(t('set_cycle_defaults'))}</h2>
      <div class="field"><label>${esc(t('set_avg_cycle'))}</label>${stepper('avgCycle', settings.avgCycle, t('ins_days'), 15, 60)}</div>
      <div class="field" style="margin-top:16px"><label>${esc(t('set_avg_period'))}</label>${stepper('avgPeriod', settings.avgPeriod, t('ins_days'), 1, 12)}</div>
      <div class="field" style="margin-top:16px"><label>${esc(t('set_week_start'))}</label>
        <div class="seg" data-seg="weekStart">
          <button data-v="1" aria-pressed="${settings.weekStart === 1}">${esc(t('week_mon'))}</button>
          <button data-v="0" aria-pressed="${settings.weekStart === 0}">${esc(t('week_sun'))}</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>${esc(t('set_privacy'))}</h2>
      <div class="list">
        ${item('🔒', t('set_pin'), ctx.hasPin ? '' : t('set_pin_note'), ctx.hasPin ? t('set_pin_on') : t('set_pin_off'), 'data-act="pin"')}
      </div>
    </div>

    <div class="card">
      <h2>${esc(t('set_data'))}</h2>
      <div class="list">
        ${item('⬇️', t('set_export'), '', '', 'data-act="export"')}
        ${item('⬆️', t('set_import'), '', '', 'data-act="import"')}
        ${item('📱', t('set_qr'), '', '', 'data-act="qr"')}
      </div>
      <div class="note">${esc(t('export_note'))}</div>
    </div>

    <div class="card">
      <h2>${esc(t('set_about'))}</h2>
      <div class="note">${esc(t('disclaimer'))}</div>
      <div class="note" style="margin-top:10px">
        ${esc(t('set_storage', { n: storage.usage ? (storage.usage / 1024).toFixed(0) + ' KB' : '—' }))}<br>
        ${esc(storage.persisted ? t('set_persist_on') : t('set_persist_off'))}
      </div>
      ${!storage.persisted ? `<button class="btn ghost sm" data-act="persist" style="margin-top:12px">${esc(t('set_persist_btn'))}</button>` : ''}
      <div class="list" style="margin-top:8px">
        ${item('🗑', t('set_wipe'), '', '', 'data-act="wipe" class="item danger"')}
      </div>
    </div>

    <div class="foot-note">Lapas · ${esc(state.today)}</div>
  </div>`);

  node.addEventListener('click', async e => {
    const p = e.target.closest('[data-pick]');
    if (p) { tap(); await ctx.onSettings({ [p.dataset.pick]: p.dataset.v }); return; }

    const seg = e.target.closest('[data-seg] button');
    if (seg) {
      const key = seg.closest('[data-seg]').dataset.seg;
      let v = seg.dataset.v;
      if (key === 'weekStart') v = +v;
      tap();
      await ctx.onSettings({ [key]: v });
      return;
    }

    const step = e.target.closest('[data-step] button');
    if (step) {
      const box = step.closest('[data-step]');
      const key = box.dataset.step;
      const d = +step.dataset.d;
      const v = Math.min(+box.dataset.max, Math.max(+box.dataset.min, (ctx.settings[key] || 0) + d));
      tap();
      $('.val', box).innerHTML = `${v}${$('.val small', box).outerHTML}`;
      ctx.settings[key] = v;
      await ctx.onSettings({ [key]: v }, true);
      return;
    }

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    tap();
    if (act === 'export') exportSheet(ctx);
    if (act === 'import') importSheet(ctx);
    if (act === 'qr') qrSheet(ctx);
    if (act === 'pin') pinSheet(ctx);
    if (act === 'persist') {
      const ok = await DB.requestPersistence();
      toast(ok ? t('set_persist_on') : t('set_persist_off'));
      ctx.rerender();
    }
    if (act === 'wipe') {
      if (await confirmSheet({ title: t('set_wipe'), text: t('wipe_confirm'), confirm: t('wipe_confirm_yes') })) {
        await DB.wipe();
        toast(t('wiped'));
        location.reload();
      }
    }
  });

  const byInput = $('#birth-year', node);
  if (byInput) byInput.addEventListener('change', () => {
    const v = parseInt(byInput.value, 10);
    ctx.onSettings({ birthYear: Number.isFinite(v) ? v : null });
  });
  const shInput = $('#stopped-hormones', node);
  if (shInput) shInput.addEventListener('change', () => ctx.onSettings({ contraceptionStoppedAt: shInput.value || null }));

  const pregInput = $('#preg-start', node);
  if (pregInput) pregInput.addEventListener('change', () => ctx.onSettings({ pregnancyStart: pregInput.value }));

  return node;
}

// ------------------------------------------------------------------ eksportas

function exportSheet(ctx) {
  const s = sheet({ title: t('export_title') });
  s.body.innerHTML = `
    <div class="note">${esc(t('export_note'))}</div>
    <div class="field" style="margin-top:14px">
      <label><input type="checkbox" id="ex-enc" style="width:auto;margin-right:8px">${esc(t('export_encrypt'))}</label>
    </div>
    <div class="field" id="ex-pass-box" hidden>
      <label>${esc(t('export_password'))}</label>
      <input type="password" id="ex-pass" autocomplete="new-password">
    </div>
    <div class="note warn" id="ex-warn">${esc(t('export_plain_warn'))}</div>
    <div style="margin:18px 0 8px"><button class="btn block" id="ex-go">${esc(t('export_do'))}</button></div>`;

  const enc = $('#ex-enc', s.body);
  enc.onchange = () => {
    $('#ex-pass-box', s.body).hidden = !enc.checked;
    $('#ex-warn', s.body).hidden = enc.checked;
  };

  $('#ex-go', s.body).onclick = async () => {
    const pass = enc.checked ? $('#ex-pass', s.body).value : '';
    if (enc.checked && pass.length < 4) { toast(t('set_pin_short')); return; }
    const { days, settings } = await ctx.readAll();
    const { blob, filename } = await T.exportFile(days, settings, pass || undefined);
    downloadBlob(blob, filename);
    await ctx.onSettings({ backupReminderAt: new Date().toISOString().slice(0, 10) });
    toast(t('exported'));
    s.close();
  };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ------------------------------------------------------------------ importas

function importSheet(ctx) {
  const s = sheet({ title: t('import_title') });
  s.body.innerHTML = `
    <div class="field">
      <input type="file" id="im-file" accept="application/json,.json">
    </div>
    <div class="field" id="im-pass-box" hidden>
      <label>${esc(t('import_password'))}</label>
      <input type="password" id="im-pass">
    </div>
    <div class="grp"><h3>${esc(t('import_mode'))}</h3>
      <div class="seg" id="im-mode">
        <button data-v="merge" aria-pressed="true">${esc(t('import_merge'))}</button>
        <button data-v="replace">${esc(t('import_replace'))}</button>
      </div>
      <div class="note" id="im-note">${esc(t('import_merge_note'))}</div>
    </div>
    <div style="margin:18px 0 8px"><button class="btn block" id="im-go">${esc(t('import_do'))}</button></div>`;

  let mode = 'merge';
  $('#im-mode', s.body).onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.v;
    $$('#im-mode button', s.body).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#im-note', s.body).textContent = t(mode === 'merge' ? 'import_merge_note' : 'import_replace_note');
  };

  $('#im-go', s.body).onclick = async () => {
    const f = $('#im-file', s.body).files?.[0];
    if (!f) { toast(t('import_choose')); return; }
    const text = await f.text();
    const pass = $('#im-pass', s.body).value;
    try {
      const payload = await T.parseFile(text, pass || undefined);
      const n = await ctx.applyImport(payload, mode);
      toast(t('imported', { n }));
      s.close();
    } catch (e) {
      if (e.code === 'NEED_PASSWORD') { $('#im-pass-box', s.body).hidden = false; toast(t('import_password')); }
      else if (e.code === 'WRONG_SECRET') toast(t('import_wrong_pass'));
      else toast(t('import_bad_file'));
    }
  };
}

// ------------------------------------------------------------------------ QR

function qrSheet(ctx) {
  const s = sheet({ title: t('qr_title') });
  s.body.innerHTML = `
    <div class="note">${esc(t('qr_intro'))}</div>
    <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px">
      <button class="btn block" data-q="send">📤 ${esc(t('qr_send'))}</button>
      <button class="btn block ghost" data-q="recv">📥 ${esc(t('qr_receive'))}</button>
    </div>`;
  s.body.onclick = async e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    s.close(true);
    if (b.dataset.q === 'send') {
      const { days, settings } = await ctx.readAll();
      sendSheet(T.buildPayload(days, settings));
    } else {
      receiveSheet(async payload => { await ctx.applyImport(payload, 'replace'); });
    }
  };
}

// ----------------------------------------------------------------------- PIN

function pinSheet(ctx) {
  const s = sheet({ title: t('set_pin') });
  if (ctx.hasPin) {
    s.body.innerHTML = `
      <div class="note">${esc(t('set_pin_note'))}</div>
      <div style="margin:18px 0 8px"><button class="btn block danger" id="pin-off">${esc(t('set_pin_remove'))}</button></div>`;
    $('#pin-off', s.body).onclick = async () => {
      await DB.setPin(null);
      toast(t('set_pin_off'));
      s.close(); ctx.rerender();
    };
    return;
  }
  s.body.innerHTML = `
    <div class="note">${esc(t('set_pin_note'))}</div>
    <div class="field"><label>${esc(t('set_pin_new'))}</label>
      <input type="password" id="pin-a" inputmode="numeric" maxlength="8" autocomplete="new-password"></div>
    <div class="field"><label>${esc(t('set_pin_repeat'))}</label>
      <input type="password" id="pin-b" inputmode="numeric" maxlength="8" autocomplete="new-password"></div>
    <div style="margin:18px 0 8px"><button class="btn block" id="pin-on">${esc(t('save'))}</button></div>`;
  $('#pin-on', s.body).onclick = async () => {
    const a = $('#pin-a', s.body).value, b = $('#pin-b', s.body).value;
    if (a.length < 4) { toast(t('set_pin_short')); return; }
    if (a !== b) { toast(t('set_pin_mismatch')); return; }
    await DB.setPin(a);
    toast(t('set_pin_on'));
    s.close(); ctx.rerender();
  };
}
