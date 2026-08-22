/* Lapas — perkėlimas QR kodais.
 *
 * Siuntėjas: rodo kadrų srautą pilname ekrane, kas ratą kita tvarka.
 * Gavėjas: kamera + jsQR, kol progreso juosta užsipildo.
 * Abu telefonai gali būti lėktuvo režimu — niekas niekur nesijungia.
 */

'use strict';

import { el, esc, sheet, toast, $, tap } from './dom.js';
import { t } from '../i18n.js';
import * as T from '../transfer.js';

const QR_LIB = '../../lib/qrcode-generator.js';
const JSQR_LIB = '../../lib/jsqr.js';

function libURL(rel) { return new URL(rel, import.meta.url).href; }

/** QR piešimas į canvas — be DOM tarpinių elementų, tik pikseliai. */
function drawQR(canvas, text) {
  const qr = window.qrcode(0, 'M');           // 0 = automatinė versija
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const px = Math.max(2, Math.floor(canvas.width / (n + 4)));
  const size = px * (n + 4);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const off = Math.floor((canvas.width - size) / 2) + px * 2;
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(off + c * px, off + r * px, px, px);
    }
  }
}

// ------------------------------------------------------------------ siuntimas

export async function sendSheet(payload) {
  const s = sheet({ title: t('qr_title') });
  s.body.innerHTML = `<div class="empty">…</div>`;

  try { await T.loadScript(libURL(QR_LIB)); }
  catch { s.body.innerHTML = `<div class="empty">${esc(t('qr_lib_fail'))}</div>`; return; }

  const code = T.transferCode();
  const frames = await T.buildFrames(payload, code);

  s.body.innerHTML = `
    <div class="qr-stage">
      <div class="note acc" style="width:100%;text-align:center">
        ${esc(t('qr_code_label'))}: <b style="font-size:22px;letter-spacing:.18em">${esc(code)}</b>
      </div>
      <canvas class="qr-canvas" width="640" height="640"></canvas>
      <div class="progress" style="width:100%"><i style="width:0%"></i></div>
      <div style="font-size:12.5px;color:var(--ink-3);text-align:center" id="qr-status"></div>
      <div class="note">${esc(t('qr_hold'))}</div>
      <div class="seg" style="width:100%">
        <button data-sp="220">${esc(t('qr_slower'))}</button>
        <button data-sp="130" aria-pressed="true">${esc(t('qr_speed'))}</button>
        <button data-sp="80">${esc(t('qr_faster'))}</button>
      </div>
    </div>`;

  const canvas = $('.qr-canvas', s.body);
  const status = $('#qr-status', s.body);
  const bar = $('.progress i', s.body);

  let delay = 130, round = 0, order = T.shuffleOrder(frames.length, 0), at = 0, stop = false;

  const step = () => {
    if (stop) return;
    if (at >= order.length) { at = 0; order = T.shuffleOrder(frames.length, ++round); }
    const i = order[at++];
    drawQR(canvas, frames[i]);
    status.textContent = t('qr_frame', { i: at, n: frames.length });
    bar.style.width = `${Math.round((at / order.length) * 100)}%`;
    setTimeout(step, delay);
  };
  step();

  s.body.addEventListener('click', e => {
    const b = e.target.closest('[data-sp]');
    if (!b) return;
    delay = +b.dataset.sp; tap();
    [...b.parentElement.children].forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });

  const origClose = s.close;
  s.close = (skip) => { stop = true; origClose(skip); };
  s.node.addEventListener('remove', () => { stop = true; });

  // ekranas neturi užgesti perdavimo metu
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}
  const release = () => { try { wake?.release(); } catch {} };
  const obs = new MutationObserver(() => { if (!document.body.contains(s.node)) { stop = true; release(); obs.disconnect(); } });
  obs.observe(document.body, { childList: true });
}

// ------------------------------------------------------------------ priėmimas

/**
 * @param {(payload:Object)=>Promise} onDone  gavus pilną siuntą
 */
export async function receiveSheet(onDone) {
  const s = sheet({ title: t('qr_title') });
  s.body.innerHTML = `
    <div class="field">
      <label>${esc(t('qr_code_enter'))}</label>
      <input id="qr-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000"
             style="font-size:24px;letter-spacing:.2em;text-align:center">
      <div class="hint">${esc(t('qr_encrypted_note'))}</div>
    </div>
    <div style="margin-top:16px"><button class="btn block" id="qr-go">${esc(t('qr_receive'))}</button></div>`;

  $('#qr-go', s.body).onclick = () => start($('#qr-code', s.body).value.trim());

  async function start(code) {
    if (!/^\d{6}$/.test(code)) { toast(t('qr_code_enter')); return; }
    s.body.innerHTML = `<div class="qr-stage">
      <video class="qr-video" playsinline muted></video>
      <div class="progress" style="width:100%"><i style="width:0%"></i></div>
      <div style="font-size:13px;color:var(--ink-3)" id="qr-status">${esc(t('qr_receiving'))}</div>
      <div class="note">${esc(t('qr_hold'))}</div>
    </div>`;

    const video = $('.qr-video', s.body);
    const bar = $('.progress i', s.body);
    const status = $('#qr-status', s.body);
    let stream = null, raf = null, stopped = false;

    const cleanup = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(tr => tr.stop());
    };
    const origClose = s.close;
    s.close = (skip) => { cleanup(); origClose(skip); };

    try { await T.loadScript(libURL(JSQR_LIB)); } catch { status.textContent = t('qr_lib_fail'); return; }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
    } catch (e) {
      status.textContent = e?.name === 'NotAllowedError' ? t('qr_camera_denied') : t('qr_camera_none');
      return;
    }

    video.srcObject = stream;
    await video.play().catch(() => {});

    const col = T.createCollector();
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });

    const tick = async () => {
      if (stopped) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = Math.min(720, video.videoWidth), h = Math.min(720, video.videoHeight);
        if (w && h) {
          cv.width = w; cv.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const hit = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (hit?.data) {
            const r = col.feed(hit.data);
            if (r === 'ok' || r === 'done') tap();
            bar.style.width = `${Math.round(col.progress * 100)}%`;
            status.textContent = t('qr_progress', { n: Math.round(col.progress * 100) });
            if (r === 'done') {
              cleanup();
              try {
                const payload = await col.assemble(code);
                await onDone(payload);
                s.close(true);
                toast(t('qr_done', { n: Object.keys(payload.days || {}).length }));
              } catch (err) {
                status.textContent = err.code === 'WRONG_SECRET' ? t('import_wrong_pass') : t('import_bad_file');
              }
              return;
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }
}
