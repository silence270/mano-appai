/* Lapas — užrakto ekranas.
 *
 * Tris kartus tas pats ekranas: PIN kūrimas, kasdienis atrakinimas ir
 * atrakinimas atkūrimo kodu. Skaitmenys niekada nerodomi — tik taškai.
 */

'use strict';

import { el, esc, $, $$, tap, toast } from './dom.js';
import { t } from '../i18n.js';
import * as DB from '../db.js';
import * as V from '../vault.js';

const MIN_PIN = 6;      // keturi skaitmenys perrenkami net su Argon2id

function keypad(extra = '') {
  return `<div class="keypad">
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}" aria-label="${n}">${n}</button>`).join('')}
    ${extra || '<button class="blank" aria-hidden="true" tabindex="-1"></button>'}
    <button data-k="0" aria-label="0">0</button>
    <button data-k="del" aria-label="⌫">⌫</button>
  </div>`;
}

const dots = (n, min = MIN_PIN) =>
  Array.from({ length: Math.max(min, n) }, (_, i) => `<i class="${i < n ? 'f' : ''}"></i>`).join('');

function fmtWait(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m} min` : `${Math.ceil(m / 60)} val.`;
}

// ------------------------------------------------------- PIN kūrimas

/** Kiek laiko užtruktų perrinkti — žmogaus kalba, ne bitais. */
function crackTime(bits) {
  const perTry = 0.113 / 40;                 // Argon2id 64 MB, vaizdo plokštė
  const sec = Math.pow(2, bits) * perTry / 2;
  if (sec < 60) return t('crack_instant');
  if (sec < 86400) return t('crack_minutes');
  if (sec < 3.15e7) return t('crack_days');
  if (sec < 3.15e14) return t('crack_years');
  return t('crack_forever');
}

function strengthLabel(bits) {
  return bits < 25 ? t('strength_weak') : bits < 45 ? t('strength_ok')
       : bits < 60 ? t('strength_good') : t('strength_best');
}

/**
 * Pirmas paleidimas. Pirmiausia klausiama, kuo užrakinti: frazė ar PIN.
 * Frazė siūloma pirma sąmoningai — trumpą kodą perrinkti įmanoma, ir tai
 * pasakoma tiesiai, o ne paslepiama.
 */
export function showSetup(onCreate) {
  const node = el(`<div class="lock" style="justify-content:center">
    <div class="leaf">🍃</div>
    <h2>${esc(t('setup_how'))}</h2>
    <div class="picks" style="width:100%;max-width:340px;margin-top:8px">
      <button class="pick" data-w="phrase"><span class="mark"></span>
        <span class="txt"><b>${esc(t('setup_phrase'))} · ${esc(t('setup_phrase_best'))}</b>
        <span>${esc(t('setup_phrase_note'))}</span></span></button>
      <button class="pick" data-w="pin"><span class="mark"></span>
        <span class="txt"><b>${esc(t('setup_pin'))}</b>
        <span>${esc(t('setup_pin_note'))}</span></span></button>
    </div>
  </div>`);
  document.body.append(node);

  node.addEventListener('click', async e => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    tap();
    node.remove();
    if (b.dataset.w === 'phrase') showPhraseSetup(onCreate);
    else showPinSetup(onCreate);
  });
  return node;
}

/** Frazė: sugeneruojama, parodoma, tada prašoma perrašyti — kad tikrai išsaugotų. */
async function showPhraseSetup(onCreate) {
  let phrase = await V.makePassphrase();
  const node = el(`<div class="lock" style="justify-content:flex-start;padding-top:calc(var(--safe-t) + 36px)">
    <div class="leaf">🔑</div>
    <h2>${esc(t('phrase_yours'))}</h2>
    <p class="lock-why">${esc(t('phrase_write'))}</p>
    <div class="rec-code" id="ph"></div>
    <div class="row" style="width:100%;max-width:340px;gap:8px">
      <button class="btn ghost sm" data-a="copy">${esc(t('rec_copy'))}</button>
      <button class="btn ghost sm" data-a="again">${esc(t('phrase_new'))}</button>
    </div>
    <div class="field" style="width:100%;max-width:340px;margin-top:18px">
      <label>${esc(t('phrase_confirm'))}</label>
      <input id="ph-in" autocomplete="off" autocapitalize="none" spellcheck="false"
             style="text-align:center;font-size:15px">
    </div>
    <div class="err" role="status"></div>
    <button class="btn" style="min-width:220px" data-a="go">${esc(t('onb_start'))}</button>
  </div>`);
  document.body.append(node);

  const paint = () => {
    $('#ph', node).innerHTML = phrase.split('-').map(w => `<span>${esc(w)}</span>`).join('');
  };
  paint();

  node.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    tap();
    if (a === 'again') { phrase = await V.makePassphrase(); paint(); return; }
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(phrase); toast(t('rec_copied')); } catch {}
      return;
    }
    if (a === 'go') {
      if (V.normalisePhrase($('#ph-in', node).value) !== V.normalisePhrase(phrase)) {
        $('.err', node).textContent = t('phrase_wrong');
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 420);
        return;
      }
      const code = await onCreate(phrase);
      node.remove();
      if (code) showRecoveryCode(code, () => document.dispatchEvent(new Event('lapas:setup-done')));
      else document.dispatchEvent(new Event('lapas:setup-done'));
    }
  });
  return node;
}

/** PIN — kaip anksčiau, tik minimumas šeši skaitmenys ir matomas stiprumas. */
function showPinSetup(onCreate) {
  const node = el(`<div class="lock">
    <div class="leaf">🍃</div>
    <h2 id="lk-title">${esc(t('lock_welcome'))}</h2>
    <p class="lock-why" id="lk-why">${esc(t('lock_why'))}</p>
    <div class="dots"></div>
    <div class="strength" id="lk-str"></div>
    <div class="err" role="status"></div>
    ${keypad()}
  </div>`);
  document.body.append(node);

  let first = null, pin = '';
  const paint = () => {
    $('.dots', node).innerHTML = dots(pin.length);
    const st = $('#lk-str', node);
    if (!pin.length || first !== null) { st.textContent = ''; return; }
    const { bits } = V.strengthOf(pin);
    st.textContent = `${strengthLabel(bits)} · ${t('strength_crack', { n: crackTime(bits) })}`;
    st.className = `strength ${bits < 25 ? 'weak' : bits < 45 ? 'ok' : 'good'}`;
  };
  const fail = msg => {
    $('.err', node).textContent = msg;
    node.classList.add('shake');
    setTimeout(() => node.classList.remove('shake'), 420);
    pin = ''; paint();
  };

  node.addEventListener('click', async e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    tap();
    $('.err', node).textContent = '';

    if (b.dataset.k === 'del') { pin = pin.slice(0, -1); paint(); return; }
    if (pin.length >= 12) return;
    pin += b.dataset.k;
    paint();

    if (pin.length < MIN_PIN) {
      if (pin.length >= 4) $('.err', node).textContent = t('pin_min6');
      return;
    }
    // laukiam, ar ji ves daugiau skaitmenų; patvirtina ilgesnė pauzė arba 12 skaitmenų
    clearTimeout(node._t);
    node._t = setTimeout(async () => {
      if (first === null) {
        first = pin; pin = '';
        $('#lk-title', node).textContent = t('lock_repeat');
        $('#lk-why', node).textContent = '';
        paint();
      } else if (first !== pin) {
        first = null;
        $('#lk-title', node).textContent = t('lock_welcome');
        fail(t('lock_mismatch'));
      } else {
        const code = await onCreate(first);
        node.remove();
        if (code) showRecoveryCode(code, () => document.dispatchEvent(new Event('lapas:setup-done')));
        else document.dispatchEvent(new Event('lapas:setup-done'));
      }
    }, 900);
  });
  paint();
  return node;
}

// ------------------------------------------------------ atkūrimo kodas

/** Rodomas vieną kartą. Nuo šio ekrano priklauso, ar duomenys atkuriami. */
export function showRecoveryCode(code, onDone) {
  const node = el(`<div class="lock" style="justify-content:flex-start;padding-top:calc(var(--safe-t) + 40px)">
    <div class="leaf">🔑</div>
    <h2>${esc(t('rec_title'))}</h2>
    <p class="lock-why">${esc(t('rec_intro'))}</p>
    <div class="rec-code" id="rc">${code.split('-').map(g =>
      `<span>${esc(g)}</span>`).join('')}</div>
    <div class="row" style="width:100%;max-width:320px;gap:8px">
      <button class="btn ghost sm" data-a="copy">${esc(t('rec_copy'))}</button>
      <button class="btn ghost sm" data-a="save">${esc(t('rec_download'))}</button>
    </div>
    <button class="btn" style="margin-top:18px;min-width:220px" data-a="done">${esc(t('rec_confirm'))}</button>
  </div>`);
  document.body.append(node);

  node.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    tap();
    if (a === 'copy') {
      try { await navigator.clipboard.writeText(code); toast(t('rec_copied')); }
      catch { toast(t('rec_copy')); }
    }
    if (a === 'save') {
      const blob = new Blob([`${t('rec_title')}\n\n${code}\n\n${t('rec_intro')}\n`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'kodas.txt';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    if (a === 'done') {
      if (!confirm(t('rec_confirm_ask'))) return;
      node.remove();
      onDone?.();
    }
  });
  return node;
}

// ---------------------------------------------------------- atrakinimas

/**
 * Kasdienis atrakinimas.
 * @param {Function} onUnlocked kviečiama atrakinus
 */
export async function showLock(onUnlocked) {
  const canBio = await V.biometricsEnabled().catch(() => false);
  const node = el(`<div class="lock">
    <div class="leaf">🍃</div>
    <h2 id="lk-title">${esc(t('lock_enter'))}</h2>
    <div class="dots">${dots(0)}</div>
    <div class="err" role="status"></div>
    ${keypad(canBio ? `<button data-k="bio" aria-label="${esc(t('lock_face'))}">☺</button>` : '')}
    <button class="link-btn" data-a="forgot">${esc(t('lock_forgot'))}</button>
  </div>`);
  document.body.append(node);

  let pin = '';
  let waitTimer = null;
  const paint = () => { $('.dots', node).innerHTML = dots(pin.length); };

  const showWait = async () => {
    const g = await DB.guardState();
    if (g.waitMs <= 0) {
      $('.err', node).textContent = '';
      $$('[data-k]', node).forEach(b => { b.disabled = false; });
      clearInterval(waitTimer); waitTimer = null;
      return false;
    }
    $('.err', node).innerHTML =
      `${esc(t('lock_wait', { n: fmtWait(g.waitMs) }))}<br><small style="opacity:.8">${esc(t('lock_wait_why'))}</small>`;
    $$('[data-k]', node).forEach(b => { b.disabled = true; });
    if (!waitTimer) waitTimer = setInterval(showWait, 1000);
    return true;
  };
  await showWait();

  const done = () => { clearInterval(waitTimer); node.remove(); onUnlocked(); };

  const tryUnlock = async secret => {
    const r = await DB.unlock(secret);
    if (r.ok) return done();
    pin = ''; paint();
    if (r.waitMs) { await showWait(); return; }
    $('.err', node).textContent = t('lock_wrong');
    node.classList.add('shake');
    setTimeout(() => node.classList.remove('shake'), 420);
  };

  node.addEventListener('click', async e => {
    if (e.target.closest('[data-a="forgot"]')) { tap(); showRecovery(node, done); return; }

    const b = e.target.closest('[data-k]');
    if (!b || b.disabled) return;
    tap();

    if (b.dataset.k === 'bio') {
      const r = await DB.unlockBiometric();
      if (r.ok) return done();
      $('.err', node).textContent = r.reason === 'CANCELLED' ? '' : t('lock_face_fail');
      return;
    }
    if (b.dataset.k === 'del') { pin = pin.slice(0, -1); paint(); $('.err', node).textContent = ''; return; }

    $('.err', node).textContent = '';
    if (pin.length >= 12) return;
    pin += b.dataset.k;
    paint();
    if (pin.length >= MIN_PIN) {
      clearTimeout(node._t);
      node._t = setTimeout(() => tryUnlock(pin), 700);
    }
  });
  return node;
}

/** Atkūrimo kodo įvedimas — klaviatūra, nes kodas ilgas. */
function showRecovery(lockNode, done) {
  const box = el(`<div class="lock">
    <div class="leaf">🔑</div>
    <h2>${esc(t('lock_use_code'))}</h2>
    <p class="lock-why">${esc(t('lock_code_hint'))}</p>
    <div class="field" style="width:100%;max-width:340px">
      <input id="rec-in" autocapitalize="characters" autocomplete="off" spellcheck="false"
             placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
             style="text-align:center;letter-spacing:.06em;font-size:15px">
    </div>
    <div class="err" role="status"></div>
    <button class="btn" style="min-width:200px" data-a="go">${esc(t('done'))}</button>
    <button class="link-btn" data-a="back">${esc(t('cancel'))}</button>
  </div>`);
  document.body.append(box);
  lockNode.style.display = 'none';
  $('#rec-in', box).focus();

  box.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'back') { box.remove(); lockNode.style.display = ''; return; }
    if (a !== 'go') return;
    const r = await DB.unlock($('#rec-in', box).value.trim());
    if (r.ok) { box.remove(); lockNode.remove(); done(); return; }
    $('.err', box).textContent = r.waitMs ? t('lock_wait', { n: fmtWait(r.waitMs) }) : t('lock_wrong');
  });
  return box;
}
