/* Leaf — apsauga nuo duomenų praradimo.
 *
 * KODĖL ŠIS FAILAS APSKRITAI YRA:
 * Safari ištrina svetainių saugyklą (IndexedDB, localStorage), jei su svetaine
 * nesąveikauta 7 dienas. Į pagrindinį ekraną įsidėti app'ai turi atskirą
 * skaitiklį ir jiems tai negalioja — bet vartotoja, kuri tiesiog atsidarė
 * nuorodą naršyklėje, po savaitės netektų visko.
 *
 * Šiame app'e duomenys yra TIK telefone. Vienas toks atvejis — ir prarasti
 * metai įrašų be jokios atkūrimo galimybės. Todėl:
 *   1. iškart prašoma „persistent storage" (naršyklė pažada netrinti);
 *   2. jei app'as atidarytas naršyklėje, o ne iš pagrindinio ekrano, apie tai
 *      pasakoma tiesiai, dar prieš įvedant duomenis;
 *   3. primenama pasidaryti kopiją, kai ji pasensta.
 */

'use strict';

import { el, esc, $, tap, sheet } from './dom.js';
import { t } from '../i18n.js';

/** Ar app'as paleistas iš pagrindinio ekrano (tada Safari saugykla saugi). */
export function isStandalone() {
  return (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) ||
         (typeof navigator !== 'undefined' && navigator.standalone === true);
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Naršyklės pažadas netrinti duomenų. Chrome jį duoda pagal naudojimo istoriją,
 * Safari — įsidėjus į pagrindinį ekraną. Prašoma kuo anksčiau, nes vėliau
 * prašyti nebėra prasmės: duomenys jau gali būti dingę.
 */
export async function ensurePersistence() {
  try {
    if (!navigator.storage?.persisted) return { supported: false, persisted: false };
    let persisted = await navigator.storage.persisted();
    if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
    return { supported: true, persisted };
  } catch {
    return { supported: false, persisted: false };
  }
}

/**
 * Ekranas, rodomas prieš pirmą naudojimą, jei app'as atidarytas naršyklėje.
 * Sąmoningai neblokuojantis: kai kurios vartotojos negali arba nenori diegti,
 * ir uždaryti jas nuo app'o būtų blogiau nei įspėti. Bet įspėjimas yra tiesus.
 */
export function showInstallPrompt(onContinue) {
  const node = el(`<div class="lock" style="justify-content:center">
    <div class="leaf">🍃</div>
    <h2>${esc(t('install_title'))}</h2>
    <p class="lock-why">${esc(t('install_why'))}</p>
    <div class="note warn" style="max-width:340px">
      ${esc(isIOS() ? t('install_how_ios') : t('install_how_android'))}
    </div>
    <button class="btn" style="min-width:220px;margin-top:14px" data-a="done">${esc(t('install_done'))}</button>
    <button class="link-btn" data-a="skip">${esc(t('install_continue'))}</button>
    <div class="foot-note" style="max-width:320px">${esc(t('install_risk'))}</div>
  </div>`);
  document.body.append(node);

  node.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    tap();
    // „Įsidėjau" tik uždaro ekraną — patikrinti to iš app'o pusės neįmanoma,
    // nes įsidėtas app'as paleidžiamas atskirai.
    node.remove();
    onContinue(a === 'done');
  });
  return node;
}

/** Ar jau laikas priminti apie kopiją. */
export function backupOverdue(settings, today, days = 30) {
  const at = settings?.backupReminderAt;
  if (!at) return true;
  const diff = Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${at}T12:00:00Z`)) / 86400000);
  return diff > days ? diff : 0;
}
