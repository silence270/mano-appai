/* Lapas — jungtis. Krauna duomenis, skaičiuoja būseną, perjungia ekranus.
 *
 * Visas srautas vienpusis: DB → analyze() → ekranas. Ekranai patys nieko
 * nesaugo — jie kviečia atgalinius, o čia perkraunama būsena ir perpiešiama.
 */

'use strict';

import { $, el, toast, ICON, tap } from './ui/dom.js';
import { t, setLang, detectLang, getLang } from './i18n.js';
import * as C from './cycle.js';
import * as DB from './db.js';
import * as T from './transfer.js';
import { renderToday } from './ui/today.js';
import { renderCalendar, resetCursor } from './ui/calendar.js';
import { renderInsights } from './ui/insights.js';
import { renderSettings } from './ui/settings.js';
import { openLog, normalize } from './ui/log.js';
import { showLock } from './ui/lock.js';
import { renderOnboarding } from './ui/onboarding.js';

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
  hasPin: false,
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
  app.hasPin = await DB.hasPin();
  app.state = C.analyze({ days: app.days, settings: app.settings, today: C.todayISO() });
  setLang(app.settings.lang || detectLang());
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

/** Priminti apie kopiją, jei nedaryta > 45 d. ir yra ką prarasti. */
function needsBackup() {
  const n = Object.keys(app.days).length;
  if (n < 12) return false;
  const at = app.settings.backupReminderAt;
  if (!at) return true;
  return C.daysBetween(at, C.todayISO()) > 45;
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

async function quickPeriod(ending) {
  const today = C.todayISO();
  await saveDay(today, ending ? { flow: 0 } : { flow: 3 });
  toast(ending ? t('quick_period_end') : t('quick_period'));
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
  return Object.keys(incoming).length;
}

function log(iso) {
  openLog(iso, app.days[iso], saveDay);
}

// ------------------------------------------------------------------- ekranas

function render() {
  const root = $('#app');
  const ctx = {
    state: app.state,
    settings: app.settings,
    storage: app.storage,
    hasPin: app.hasPin,
    autoLang: detectLang(),
    entry: app.days[app.state.today],
    needsBackup: needsBackup(),
    onLog: log,
    onQuickPeriod: quickPeriod,
    onPill: markPill,
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
  root.append(screen, tabbar());
  root.scrollTop = 0;
}

function tabbar() {
  const bar = el(`<nav class="tabbar">
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

async function boot() {
  applyTheme('auto');
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((app.settings?.theme || 'auto') === 'auto') applyTheme('auto');
  });

  if (await DB.isLocked()) {
    await new Promise(res => showLock(res));
  }

  await reload();
  app.storage = await DB.storageInfo();

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

  // grįžus po paros — perskaičiuojam „šiandien"
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if (app.state?.today !== C.todayISO()) { await reload(); render(); }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: './' }).catch(() => {});
}

boot().catch(err => {
  document.getElementById('app').innerHTML =
    `<div class="screen"><div class="empty"><span class="e">🍃</span>${err.message}</div></div>`;
});
