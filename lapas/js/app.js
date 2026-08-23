/* Lapas — jungtis. Krauna duomenis, skaičiuoja būseną, perjungia ekranus.
 *
 * Visas srautas vienpusis: DB → analyze() → ekranas. Ekranai patys nieko
 * nesaugo — jie kviečia atgalinius, o čia perkraunama būsena ir perpiešiama.
 */

'use strict';

import { $, el, toast, ICON, tap } from './ui/dom.js';
import { t, loadLang, setLang, detectLang, getLang } from './i18n.js';
import * as C from './cycle.js';
import * as DB from './db.js';
import * as T from './transfer.js';
import { renderToday } from './ui/today.js';
import { renderCalendar, resetCursor } from './ui/calendar.js';
import { renderInsights } from './ui/insights.js';
import { renderSettings } from './ui/settings.js';
import { openLog, normalize } from './ui/log.js';
import { showLock, showSetup, showRecoveryCode } from './ui/lock.js';
import { renderOnboarding } from './ui/onboarding.js';
import { isStandalone, ensurePersistence, showInstallPrompt, backupOverdue } from './ui/install.js';

const TABS = [
  { id: 'today', icon: ICON.today, label: 'nav_today' },
  { id: 'calendar', icon: ICON.calendar, label: 'nav_calendar' },
  { id: 'insights', icon: ICON.insights, label: 'nav_insights' },
  { id: 'settings', icon: ICON.settings, label: 'nav_settings' },
];

const app = {
  tab: 'today',
  days: {},
  settings: null,
  state: null,
  storage: { usage: null, persisted: false },
  bio: { available: false, enabled: false },
  wipeAfter: 0,
};

// ------------------------------------------------------------------- tema

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' ||
    (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#120e15' : '#fbf6f6');
}

// ------------------------------------------------------------------ būsena

async function reload() {
  app.days = await DB.getDays();
  app.settings = await DB.getSettings();
  app.wipeAfter = await import('./vault.js').then(V => V.getWipeAfter()).catch(() => 0);
  app.bio = {
    available: await DB.biometricsAvailable().catch(() => false),
    enabled: await DB.biometricsEnabled().catch(() => false),
  };
  app.state = C.analyze({ days: app.days, settings: app.settings, today: C.todayISO() });
  await loadLang(app.settings.lang || detectLang());
  applyTheme(app.settings.theme || 'auto');
  updateBadge();
}

/** Ženkliukas ant ikonos — kiek dienų iki mėnesinių (kur naršyklė palaiko). */
function updateBadge() {
  try {
    const n = app.state?.daysUntilPeriod;
    if (navigator.setAppBadge && n != null && n >= 0 && n <= 3) navigator.setAppBadge(n || 1);
    else navigator.clearAppBadge?.();
  } catch {}
}

/**
 * Priminti apie kopiją. Riba sumažinta nuo 45 iki 30 dienų ir pridėta
 * antra sąlyga: jei naršyklė nepažadėjo duomenų saugoti, priminti anksčiau —
 * ten realiai gresia Safari valymas.
 */
function needsBackup() {
  const n = Object.keys(app.days).length;
  if (n < 8) return false;
  const limit = app.storage.persisted ? 30 : 10;
  return !!backupOverdue(app.settings, C.todayISO(), limit);
}

// ------------------------------------------------------------------ veiksmai

async function saveDay(iso, patch) {
  app.days = await DB.saveDay(iso, patch);
  await reload();
  render();
}

/** Vienas paspaudimas kontracepcijos režime — tabletė šiandien. */
async function markPill() {
  const today = C.todayISO();
  const meds = new Set(app.days[today]?.meds || []);
  meds.add('pill_taken'); meds.delete('pill_missed');
  await saveDay(today, { meds: [...meds] });
  toast(t('pill_taken_today'));
}

async function quickPeriod(ending, when) {
  const day = when || C.todayISO();
  await saveDay(day, ending ? { flow: 0 } : { flow: 3 });
  toast(ending ? t('quick_period_end') : t('quick_period'));
}

/** Atsakymas į „ar mėnesinės tęsiasi": „ne" pažymima kaip nulinis srautas,
 *  kad epizodas užsidarytų ir nebūtų klausiama kas dieną. */
async function stillBleeding(yes) {
  const today = C.todayISO();
  const yFlow = app.days[C.addDays(today, -1)]?.flow ?? 3;
  await saveDay(today, yes
    ? { flow: Math.max(2, yFlow - 1) }
    : { flow: 0, periodEnded: true });
}

/** „Kita diena…" — nusiunčia į kalendorių, kur galima pasirinkti bet kurią praeities dieną. */
function pickDay() {
  app.tab = 'calendar';
  render();
  toast(t('when_started'));
}

async function onSettings(patch, silent) {
  app.settings = await DB.updateSettings(patch);
  await reload();
  if (!silent) render();
}

async function readAll() {
  return { days: await DB.getDays(), settings: await DB.getSettings() };
}

async function applyImport(payload, mode) {
  const incoming = payload.days || {};
  const merged = mode === 'replace' ? incoming : T.mergeDays(app.days, incoming);
  await DB.putDays(merged);
  if (payload.settings) {
    const keep = { ...payload.settings };
    delete keep.onboarded;
    await DB.updateSettings({ ...keep, onboarded: true });
  }
  await reload();
  resetCursor();
  render();
  return { n: Object.keys(incoming).length, dropped: payload._clean?.dropped || 0 };
}

function log(iso) {
  openLog(iso, app.days[iso], saveDay, { frequent: C.mostUsed(app.days, C.todayISO()) });
}

// ------------------------------------------------------------------- ekranas

function render() {
  const root = $('#app');
  const ctx = {
    state: app.state,
    settings: app.settings,
    storage: app.storage,
    bio: app.bio,
    isDecoy: DB.isDecoy(),
    wipeAfter: app.wipeAfter,
    autoLang: detectLang(),
    entry: app.days[app.state.today],
    needsBackup: needsBackup(),
    storageRisk: !app.storage.persisted || !isStandalone(),
    daysSinceBackup: backupOverdue(app.settings, C.todayISO(), 0) || 0,
    onLog: log,
    onQuickPeriod: quickPeriod,
    onPill: markPill,
    onPickDay: pickDay,
    onStillBleeding: stillBleeding,
    onLockNow: lockNow,
    isDecoy: DB.isDecoy(),
    askStillBleeding: C.shouldAskStillBleeding(app.days, app.state.today),
    onSettings,
    onBackup: () => { app.tab = 'settings'; render(); },
    readAll,
    applyImport,
    rerender: render,
  };

  const screen =
    app.tab === 'calendar' ? renderCalendar(ctx) :
    app.tab === 'insights' ? renderInsights(ctx) :
    app.tab === 'settings' ? renderSettings(ctx) :
    renderToday(ctx);

  root.innerHTML = '';
  screen.setAttribute('role', 'main');
  root.append(screen, tabbar());
  root.scrollTop = 0;
}

function tabbar() {
  const bar = el(`<nav class="tabbar" aria-label="${t('app')}">
    ${TABS.map(tb => `<button data-tab="${tb.id}" ${app.tab === tb.id ? 'aria-current="page"' : ''}>
      ${tb.icon}<span>${t(tb.label)}</span></button>`).join('')}
  </nav>`);
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === app.tab) return;
    tap();
    app.tab = b.dataset.tab;
    render();
  });
  return bar;
}

// ------------------------------------------------------------------- startas

/**
 * Turinio slėpimas. iOS, perjungiant app'us, nufotografuoja ekraną ir rodo tą
 * nuotrauką perjungiklyje. Uždengiame turinį PRIEŠ tai — kitaip ciklo duomenys
 * matytųsi bet kam, kas atveria app'ų perjungiklį.
 */
function privacyShield(on) {
  let sh = document.getElementById('shield');
  if (on) {
    if (!sh) {
      sh = el('<div id="shield" class="shield" aria-hidden="true"><div class="leaf">🍃</div></div>');
      document.body.append(sh);
    }
    sh.hidden = false;
  } else if (sh) sh.hidden = true;
}

/** Perkelia duomenis iš senosios, neužšifruotos versijos ir ją pašalina. */
async function migrateLegacy() {
  const legacy = await import('./vault.js').then(V => V.findLegacy?.()).catch(() => null);
  return legacy || null;
}

async function boot() {
  // Kalba įkeliama pirmiausia: be jos net užrakto ekranas būtų angliškas
  // žmogui, kuris angliškai nemoka.
  await loadLang(detectLang());
  applyTheme('auto');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((app.settings?.theme || 'auto') === 'auto') applyTheme('auto');
  });

  // Ekranas paslepiamas iškart, kai app'as praranda dėmesį, ir užrakinamas.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      privacyShield(true);
      if (!DB.isLocked()) { DB.lock(); app.days = {}; app.state = null; }
      return;
    }
    privacyShield(false);
    if (await DB.isInitialised() && DB.isLocked()) {
      document.getElementById('app').innerHTML = '';
      await new Promise(res => showLock(res));
      await afterUnlock();
    } else if (app.state && app.state.today !== C.todayISO()) {
      await reload(); render();
    }
  });
  window.addEventListener('pagehide', () => { privacyShield(true); DB.lock(); });

  // Senoji, neužšifruota saugykla šalinama visada — ne tik perkėlimo metu.
  // Kitaip ji liktų telefone tiems, kas app'ą jau buvo paleidę anksčiau,
  // ir visas naujas užraktas nieko neduotų.
  if (await DB.isInitialised()) {
    // Klaida čia nutildoma sąmoningai (senosios saugyklos gali ir nebūti),
    // bet į konsolę įrašoma — tylus catch jau buvo paslėpęs tai, kad šitos
    // funkcijos apskritai nebuvo.
    import('./vault.js')
      .then(V => V.dropLegacy())
      .catch(e => console.warn('senosios saugyklos šalinimas:', e));
  }

  if (!(await DB.isInitialised())) {
    // Prieš pirmą įrašą — įspėjimas apie Safari. Vėliau įspėti nebėra prasmės:
    // duomenys jau gali būti sukurti ir po savaitės dingę.
    if (!isStandalone()) {
      await new Promise(res => showInstallPrompt(res));
      if (isStandalone()) { /* jei per tą laiką paleido iš ekrano */ }
    }
    await ensurePersistence();

    const legacy = await migrateLegacy();
    showSetup(async pin => {
      const seed = legacy ? { days: legacy.days || {}, settings: legacy.settings || {} } : undefined;
      const code = await DB.initialise(pin, seed);
      // Senoji saugykla šalinama VISADA, ne tik po sėkmingo perkėlimo: joje
      // duomenys gulėjo be šifravimo, todėl palikti ją telefone reikštų, kad
      // visas naujas užraktas nieko neduoda.
      const { dropLegacy } = await import('./vault.js');
      await dropLegacy();
      return code;
    });
    // atkūrimo kodo ekranas pats iškviečia onboarding'ą
    document.addEventListener('lapas:setup-done', () => afterUnlock(), { once: true });
    return;
  }

  await new Promise(res => showLock(res));
  await afterUnlock();
}

/** Bendras kelias po atrakinimo: krauna duomenis ir parodo tinkamą ekraną. */
async function afterUnlock() {
  await reload();
  app.storage = await DB.storageInfo();
  // Pažadas galioja tik tol, kol jo neatšaukė naršyklė — tikrinam kaskart.
  if (!app.storage.persisted) app.storage.persisted = (await ensurePersistence()).persisted;

  if (!app.settings.onboarded) {
    const root = $('#app');
    root.innerHTML = '';
    root.append(renderOnboarding({
      onDone: async ({ lang, cycleLen, lastPeriod, birthYear }) => {
        await DB.updateSettings({ lang, avgCycle: cycleLen, birthYear, onboarded: true });
        if (lastPeriod) {
          const days = {};
          for (let i = 0; i < 4; i++) days[C.addDays(lastPeriod, i)] = { flow: i < 3 ? 3 : 2 };
          await DB.putDays({ ...(await DB.getDays()), ...days });
        }
        await DB.requestPersistence();
        await reload();
        app.storage = await DB.storageInfo();
        render();
      },
    }));
    return;
  }
  render();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: './' })
    .then(reg => {
      const offer = worker => {
        if (!worker || !navigator.serviceWorker.controller) return;
        toast(`${t('update_ready')} · ${t('update_now')}`);
        const bar = document.querySelector('.toast');
        if (bar) {
          bar.style.cursor = 'pointer';
          bar.setAttribute('role', 'button');
          bar.tabIndex = 0;
          const go = () => { worker.postMessage({ type: 'SKIP_WAITING' }); };
          bar.onclick = go;
          bar.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') go(); };
        }
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
    })
    .catch(() => {});

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

/** Užrakinti rankiniu būdu — mygtukas nustatymuose. */
async function lockNow() {
  DB.lock();
  app.days = {}; app.state = null;
  document.getElementById('app').innerHTML = '';
  await new Promise(res => showLock(res));
  await afterUnlock();
}

boot().catch(err => {
  loadLang(detectLang());         // nustatymai neužsikrovė, tad kalba — iš telefono
  // Dažniausia priežastis — privatus naršymo režimas, kur IndexedDB uždaryta.
  // Techninis pranešimas čia nieko nepasako, todėl sakoma, ką daryti.
  const storageBroken = /indexeddb|database|quota|LOCKED|storage/i.test(err?.message || '');
  const msg = storageBroken ? t('err_storage') : t('err_generic');
  document.getElementById('app').innerHTML =
    `<div class="screen"><div class="empty" style="padding-top:80px">
      <span class="e">🍃</span>
      <div style="font-size:15px;color:var(--ink);font-weight:600;margin-bottom:8px">${msg}</div>
      <div style="font-size:12px;opacity:.7">${(err?.message || '').slice(0, 120)}</div>
    </div></div>`;
  console.error(err);
});
