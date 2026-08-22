/* Lapas — PIN užraktas. Kol neatrakinta, saugykla lieka užšifruota. */

'use strict';

import { el, esc, $, $$, tap } from './dom.js';
import { t } from '../i18n.js';
import * as DB from '../db.js';

export function showLock(onUnlocked) {
  const node = el(`<div class="lock">
    <div class="leaf">🍃</div>
    <h2>${esc(t('unlock_title'))}</h2>
    <div class="dots">${'<i></i>'.repeat(4)}</div>
    <div class="err"></div>
    <div class="keypad">
      ${[1,2,3,4,5,6,7,8,9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
      <button class="blank"></button>
      <button data-k="0">0</button>
      <button data-k="del">⌫</button>
    </div>
  </div>`);
  document.body.append(node);

  let pin = '';
  const dots = $('.dots', node), err = $('.err', node);

  const paint = () => {
    const n = Math.max(4, pin.length);
    dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('');
  };

  node.addEventListener('click', async e => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    tap();
    err.textContent = '';
    if (b.dataset.k === 'del') { pin = pin.slice(0, -1); paint(); return; }
    pin += b.dataset.k;
    paint();
    if (pin.length >= 4) {
      const ok = await DB.unlock(pin);
      if (ok) {
        node.remove();
        onUnlocked();
      } else if (pin.length >= 8) {
        err.textContent = t('set_pin_wrong');
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 420);
        pin = ''; paint();
      }
    }
  });
  paint();
}
