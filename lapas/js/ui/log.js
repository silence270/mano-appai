/* Lapas — vienos dienos žymėjimas.
 * Viskas viename lape: paspaudei, pažymėjai, uždarei. Be daugiapakopių vedlių.
 */

'use strict';

import { el, esc, sheet, tap, $, $$ } from './dom.js';
import { t, formatDate, getLang, name } from '../i18n.js';
import { FLOW_LEVELS, MOODS, SYMPTOM_GROUPS, MUCUS, SEX, TESTS, MEDS, itemOf } from '../catalog.js';

/** Iš pažymėtų testų išvedami laukai, kuriuos naudoja ciklo variklis. */
export function normalize(entry) {
  const e = { ...entry };
  const tests = e.tests || [];
  e.lh = tests.includes('lh_pos') ? 'pos' : tests.includes('lh_neg') ? 'neg' : undefined;
  e.preg = tests.includes('preg_pos') ? 'pos' : tests.includes('preg_neg') ? 'neg' : undefined;
  if (!e.lh) delete e.lh;
  if (!e.preg) delete e.preg;
  return e;
}

function chipRow(items, selected, { sage = false, field = '' } = {}) {
  const lang = getLang();
  return `<div class="chips" data-multi="${field}">${items.map(i => `
    <button class="chip ${selected.includes(i.id) ? 'on' : ''} ${sage ? 'sage' : ''}" data-id="${esc(i.id)}">
      <span class="e">${i.e}</span>${esc(lang === 'en' ? i.en : i.lt)}
    </button>`).join('')}</div>`;
}

function group(title, inner) {
  return `<div class="grp"><h3>${esc(title)}</h3>${inner}</div>`;
}

/**
 * @param {string} iso diena
 * @param {Object} entry esamas įrašas
 * @param {(iso:string, patch:Object)=>Promise} save
 */
/** Greitoji eilutė: tai, ką ji žymi dažniausiai — viršuje, be slinkimo. */
function frequentRow(frequent, draft) {
  const items = [
    ...frequent.symptoms.map(id => ({ id, field: 'symptoms', item: itemOf(id) })),
    ...frequent.mood.map(id => ({ id, field: 'mood', item: itemOf(id) })),
  ].filter(x => x.item);
  if (items.length < 3) return '';
  const lang = getLang();
  return group(t('log_frequent'), `<div class="chips" data-quick="1">
    ${items.map(({ id, field, item }) => `
      <button class="chip ${draft[field].includes(id) ? 'on' : ''}" data-id="${esc(id)}" data-field="${esc(field)}">
        <span class="e">${item.e}</span>${esc(lang === 'en' ? item.en : item.lt)}
      </button>`).join('')}</div>`);
}

export function openLog(iso, entry, save, opts = {}) {
  const draft = {
    flow: entry?.flow ?? 0,
    mood: [...(entry?.mood || [])],
    symptoms: [...(entry?.symptoms || [])],
    mucus: entry?.mucus ?? null,
    sex: [...(entry?.sex || [])],
    tests: [...(entry?.tests || [])],
    meds: [...(entry?.meds || [])],
    bbt: entry?.bbt ?? null,
    weight: entry?.weight ?? null,
    energy: entry?.energy ?? null,
    sleep: entry?.sleep ?? null,
    notes: entry?.notes ?? '',
  };

  const s = sheet({
    title: formatDate(iso),
    action: t('save'),
    onAction: async (close) => { await save(iso, normalize(draft)); close(); },
  });

  const lang = getLang();
  s.body.innerHTML = `
    ${opts.frequent ? frequentRow(opts.frequent, draft) : ''}
    ${group(t('log_flow'), `<div class="flow-row">${FLOW_LEVELS.map(f => `
      <button class="flow-btn ${draft.flow === f.v ? 'on' : ''}" data-flow="${f.v}">
        <span class="drops">${f.v === 0 ? '<i></i>' : Array.from({ length: 4 }, (_, i) =>
          `<i class="${i < f.v ? 'f' : ''}"></i>`).join('')}</span>
        ${esc(lang === 'en' ? f.en : f.lt)}
      </button>`).join('')}</div>`)}

    ${group(t('log_mood'), chipRow(MOODS, draft.mood, { field: 'mood' }))}

    ${SYMPTOM_GROUPS.map(g => group(`${g.e} ${lang === 'en' ? g.en : g.lt}`,
        chipRow(g.items, draft.symptoms, { field: 'symptoms' }))).join('')}

    ${group(t('log_mucus'), `<div class="chips" data-single="mucus">${MUCUS.map(m => `
      <button class="chip ${draft.mucus === m.id ? 'on sage' : ''}" data-id="${esc(m.id)}">
        <span class="e">${m.e}</span>${esc(lang === 'en' ? m.en : m.lt)}
      </button>`).join('')}</div>`)}

    ${group(t('log_sex'), chipRow(SEX, draft.sex, { field: 'sex' }))}
    ${group(t('log_tests'), chipRow(TESTS, draft.tests, { field: 'tests' }))}
    ${group(t('log_meds'), chipRow(MEDS, draft.meds, { field: 'meds' }))}

    ${group(t('log_bbt'), `
      <div class="stepper" data-num="bbt">
        <button data-d="-0.05">−</button>
        <div class="val">${draft.bbt ? draft.bbt.toFixed(2) : '—'}<small>°C</small></div>
        <button data-d="0.05">+</button>
      </div>
      <div class="field"><div class="hint">${esc(t('bbt_hint'))}</div></div>`)}

    ${group(t('log_energy'), `<div class="chips" data-single="energy">${[1, 2, 3, 4, 5].map(v => `
      <button class="chip ${draft.energy === v ? 'on' : ''}" data-id="${v}">${'▁▃▅▆█'[v - 1]} ${v}</button>`).join('')}</div>`)}

    ${group(t('log_sleep'), `
      <div class="stepper" data-num="sleep">
        <button data-d="-0.5">−</button>
        <div class="val">${draft.sleep != null ? draft.sleep : '—'}<small>${esc(t('hours'))}</small></div>
        <button data-d="0.5">+</button>
      </div>`)}

    ${group(t('log_weight'), `
      <div class="stepper" data-num="weight">
        <button data-d="-0.1">−</button>
        <div class="val">${draft.weight != null ? draft.weight.toFixed(1) : '—'}<small>kg</small></div>
        <button data-d="0.1">+</button>
      </div>`)}

    ${group(t('log_notes'), `<div class="field">
      <textarea id="lg-notes" placeholder="${esc(t('notes_placeholder'))}">${esc(draft.notes)}</textarea>
    </div>`)}

    <div style="margin:22px 0 10px">
      <button class="btn block danger sm" data-act="clear">${esc(t('clear_day'))}</button>
    </div>`;

  // --- srautas
  $$('.flow-btn', s.body).forEach(b => b.onclick = () => {
    draft.flow = +b.dataset.flow; tap();
    $$('.flow-btn', s.body).forEach(x => x.classList.toggle('on', x === b));
  });

  // --- chip'ai: laukas nurodytas ant konteinerio, ne spėjamas pagal poziciją
  s.body.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const box = chip.parentElement;
    const single = box.dataset.single;
    tap();

    if (single === 'mucus') {
      draft.mucus = draft.mucus === chip.dataset.id ? null : chip.dataset.id;
      $$('.chip', box).forEach(x => x.classList.toggle('on', x.dataset.id === draft.mucus));
      $$('.chip', box).forEach(x => x.classList.toggle('sage', x.classList.contains('on')));
      return;
    }
    if (single === 'energy') {
      const v = +chip.dataset.id;
      draft.energy = draft.energy === v ? null : v;
      $$('.chip', box).forEach(x => x.classList.toggle('on', +x.dataset.id === draft.energy));
      return;
    }

    // greitosios eilutės chip'as pats nurodo, kuriam laukui priklauso
    const field = box.dataset.quick ? chip.dataset.field : box.dataset.multi;
    if (!field || !Array.isArray(draft[field])) return;
    const arr = draft[field];
    const id = chip.dataset.id;
    const at = arr.indexOf(id);
    if (at >= 0) arr.splice(at, 1); else arr.push(id);
    // tas pats simptomas gali būti ir greitojoje eilutėje, ir savo grupėje
    for (const el of $$(`[data-id="${CSS.escape(id)}"]`, s.body)) el.classList.toggle('on', at < 0);
  });

  // --- skaitiniai laukai
  const DEFAULTS = { bbt: 36.50, sleep: 7.5, weight: 60 };
  const FMT = { bbt: v => v.toFixed(2), sleep: v => (Math.round(v * 2) / 2).toString(), weight: v => v.toFixed(1) };
  const LIMITS = { bbt: [34, 40], sleep: [0, 16], weight: [25, 250] };
  $$('[data-num]', s.body).forEach(box => {
    const key = box.dataset.num;
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      tap();
      const d = +b.dataset.d;
      let v = draft[key] ?? DEFAULTS[key];
      if (draft[key] != null) v += d;
      v = Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], v));
      draft[key] = +v.toFixed(2);
      $('.val', box).innerHTML = `${FMT[key](draft[key])}${$('.val small', box).outerHTML}`;
    });
  });

  $('#lg-notes', s.body).addEventListener('input', e => { draft.notes = e.target.value; });

  $('[data-act="clear"]', s.body).onclick = async () => {
    await save(iso, {
      flow: 0, mood: [], symptoms: [], mucus: null, sex: [], tests: [], meds: [],
      bbt: null, weight: null, energy: null, sleep: null, notes: '', lh: null, preg: null,
    });
    s.close();
  };

  return s;
}
