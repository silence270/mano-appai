/* Lapas — mažas UI įrankių rinkinys. Jokių bibliotekų.
 * innerHTML naudojamas tik šablonams; visas vartotojo tekstas eina per esc().
 */

'use strict';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Vartotojo įvestis į HTML — visada per čia. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function on(root, sel, ev, fn) {
  root.addEventListener(ev, e => {
    const m = e.target.closest(sel);
    if (m && root.contains(m)) fn(e, m);
  });
}

/** Trumpas vibro atsakas, kur telefonas leidžia. */
export function tap() { try { navigator.vibrate?.(8); } catch {} }

// ------------------------------------------------------------------ sheet

let openSheets = 0;

/**
 * Apatinis lapas. Grąžina { body, close } — turinys pildomas iš išorės.
 * @param {{title:string, action?:string, onAction?:Function, onClose?:Function, foot?:HTMLElement}} o
 */
export function sheet({ title, action, onAction, onClose, closeLabel = '✕' }) {
  const scrim = el('<div class="sheet-scrim"></div>');
  const node = el(`
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grab"></div>
      <div class="sheet-head">
        <button class="x" aria-label="close">${esc(closeLabel)}</button>
        <b>${esc(title)}</b>
        <button class="a">${action ? esc(action) : ''}</button>
      </div>
      <div class="sheet-body"></div>
    </div>`);
  document.body.append(scrim, node);
  document.body.style.overflow = 'hidden';
  openSheets++;
  requestAnimationFrame(() => { scrim.classList.add('in'); node.classList.add('in'); });

  let closed = false;
  const close = (skipCb) => {
    if (closed) return; closed = true;
    scrim.classList.remove('in'); node.classList.remove('in');
    setTimeout(() => {
      scrim.remove(); node.remove();
      if (--openSheets <= 0) { openSheets = 0; document.body.style.overflow = ''; }
    }, 300);
    if (!skipCb) onClose?.();
  };
  scrim.onclick = () => close();
  $('.x', node).onclick = () => close();
  if (action) $('.a', node).onclick = () => onAction?.(close);

  // brūkštelėjimas žemyn uždaro
  let y0 = null;
  node.addEventListener('touchstart', e => {
    y0 = $('.sheet-body', node).scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  node.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) node.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  node.addEventListener('touchend', e => {
    if (y0 === null) return;
    const dy = (e.changedTouches[0].clientY - y0);
    node.style.transform = '';
    if (dy > 110) close();
    y0 = null;
  });

  return { node, body: $('.sheet-body', node), foot: null, close, addFoot(html) {
    const f = el(`<div class="sheet-foot">${html}</div>`);
    node.append(f); return f;
  } };
}

// ------------------------------------------------------------------ toast

let toastTimer = null;
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = el('<div class="toast"></div>'); document.body.append(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('in'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('in');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

/** Patvirtinimas be naršyklės confirm() — tas pats stilius visur. */
export function confirmSheet({ title, text, confirm, danger = true }) {
  return new Promise(res => {
    let done = false;
    const s = sheet({ title, onClose: () => { if (!done) res(false); } });
    s.body.innerHTML = `<p style="font-size:14.5px;line-height:1.55;color:var(--ink-2);margin:4px 2px 18px">${esc(text)}</p>`;
    const f = s.addFoot(`<button class="btn block ${danger ? 'danger' : ''}">${esc(confirm)}</button>`);
    $('.btn', f).onclick = () => { done = true; res(true); s.close(true); };
  });
}

// ---------------------------------------------------------------- ikonos

export const ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  insights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
  chevron: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
  left: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
};
