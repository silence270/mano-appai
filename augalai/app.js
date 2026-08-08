/* Žaliasis dienoraštis — MVP (be backend'o).
 * Duomenys saugomi telefone (localStorage). Orai — Open-Meteo (be rakto).
 * Vėliau: Supabase sinchronizacijai + kasdienis agentas el. laiškui/push.
 */

'use strict';

// ---------- Saugykla ----------
const DB = {
  get plants()   { return read('plants', []); },
  set plants(v)  { write('plants', v); },
  get journal()  { return read('journal', []); },
  set journal(v) { write('journal', v); },
  get settings() { return read('settings', {}); },
  set settings(v){ write('settings', v); },
};
function read(k, fallback) {
  try { return JSON.parse(localStorage.getItem('zd.' + k)) ?? fallback; }
  catch { return fallback; }
}
function write(k, v) { localStorage.setItem('zd.' + k, JSON.stringify(v)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---------- Augalų žinynas (paprastos euristikos) ----------
// baseDays = kas kiek dienų vidutiniškai laistyti normaliomis sąlygomis.
const POT_FACTOR = { small: 0.7, medium: 1.0, large: 1.4 };   // mažas vazonas greičiau išdžiūsta
const LOC_BASE   = { indoor: 5, outdoor: 3 };                  // bazinis intervalas
const EMOJI = ['🪴','🌿','🌱','🌵','🌴','🍀','☘️','🌻','🌺'];

function emojiFor(plant) {
  const n = (plant.species || plant.name || '').toLowerCase();
  if (/kakt|sukulent|alij/.test(n)) return '🌵';
  if (/orchid|orhid/.test(n)) return '🌸';
  if (/palm|monster|fikus|ficus/.test(n)) return '🌴';
  if (/žol|zol|veja/.test(n)) return '🌱';
  return EMOJI[hash(plant.id || n) % EMOJI.length];
}
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

function intervalDays(plant) {
  const base = LOC_BASE[plant.location] ?? 5;
  const pot = POT_FACTOR[plant.potSize] ?? 1.0;
  return Math.max(1, Math.round(base * pot));
}
function daysSince(iso) {
  if (!iso) return Infinity;
  const ms = startOfDay(new Date()) - startOfDay(new Date(iso));
  return Math.floor(ms / 86400000);
}
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function todayISO() { return startOfDay(new Date()).toISOString().slice(0,10); }

// ---------- Rekomendacija vienam augalui ----------
// weather = { today, recentRain, maxTemp, minHumidity } arba null
function recommend(plant, weather) {
  const interval = intervalDays(plant);
  const since = daysSince(plant.lastWatered);
  let due = since >= interval;
  const extras = [];
  let reason = '';

  const wateredEver = isFinite(since);

  if (plant.location === 'outdoor' && weather) {
    if (weather.recentRain >= 6) {
      // Neseniai gerai palijo — atidedam
      due = since >= interval + 2;
      reason = `Per pastarąsias dienas palijo ~${weather.recentRain} mm — dirvožemis dar drėgnas.`;
    } else if (weather.today.rain >= 4) {
      due = false;
      reason = `Šiandien laukiama ~${weather.today.rain} mm lietaus — gamta palaistys.`;
    }
  }

  // Karštis / sausas oras — paspartina
  if (weather && due === false && wateredEver) {
    if (weather.today.tmax >= 27) {
      due = since >= Math.max(1, interval - 1);
      if (due) reason = `Karšta (~${Math.round(weather.today.tmax)}°C) — verta palaistyti anksčiau.`;
    }
  }
  if (weather && weather.today.tmax >= 30) extras.push('Karšta — apipurkšk lapus / patrauk nuo tiesioginės saulės.');

  if (!wateredEver) { due = true; reason = 'Dar nepažymėta, kada laistyta — pradėk nuo šiandien.'; }

  if (!reason) {
    reason = due
      ? `Praėjo ${since} d. nuo laistymo (intervalas ~${interval} d.).`
      : `Laistyta prieš ${since} d. Kita kartą maždaug po ${interval - since} d.`;
  }

  // Tręšimo priminimas (augimo sezonas: balandis–rugsėjis)
  const month = new Date().getMonth() + 1;
  if (month >= 4 && month <= 9 && daysSince(plant.lastFertilized) >= 28) {
    extras.push('Augimo sezonas — laikas patręšti (~kartą per mėnesį).');
  }

  return { plant, due, reason, extras, interval, since };
}

// ---------- Orai (Open-Meteo, be API rakto, CORS leidžiamas) ----------
let weatherCache = null;
async function getWeather() {
  const s = DB.settings;
  if (!s.city || s.city.lat == null) return null;
  if (weatherCache && weatherCache.date === todayISO() && weatherCache.key === cityKey(s.city)) {
    return weatherCache.data;
  }
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.city.lat}&longitude=${s.city.lon}`
    + `&daily=precipitation_sum,temperature_2m_max,relative_humidity_2m_mean`
    + `&past_days=2&forecast_days=2&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json();
  const d = j.daily;
  // index 2 = šiandien (past_days=2 -> [-2,-1,0,+1])
  const ti = 2;
  const data = {
    today: {
      rain: round1(d.precipitation_sum[ti] ?? 0),
      tmax: d.temperature_2m_max[ti],
      hum: d.relative_humidity_2m_mean?.[ti],
    },
    recentRain: round1((d.precipitation_sum[0] || 0) + (d.precipitation_sum[1] || 0)),
  };
  weatherCache = { date: todayISO(), key: cityKey(s.city), data };
  return data;
}
function cityKey(c) { return `${c.lat},${c.lon}`; }
function round1(n) { return Math.round(n * 10) / 10; }

async function geocode(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=lt`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('geocode ' + r.status);
  const j = await r.json();
  return (j.results || []).map(x => ({
    name: x.name, country: x.country, admin1: x.admin1, lat: x.latitude, lon: x.longitude,
  }));
}

// ---------- Žurnalo įrašai ----------
function logEntry(plantId, action, note) {
  const j = DB.journal;
  j.unshift({ id: uid(), ts: new Date().toISOString(), plantId, action, note: note || '' });
  DB.journal = j;
}

function markWatered(plant) {
  const plants = DB.plants;
  const p = plants.find(x => x.id === plant.id);
  if (!p) return;
  p.lastWatered = new Date().toISOString();
  DB.plants = plants;
  logEntry(p.id, 'water', `Palaistyta: ${p.name}`);
  toast(`💧 Pažymėta: ${p.name}`);
  render();
}
function markFertilized(plant) {
  const plants = DB.plants;
  const p = plants.find(x => x.id === plant.id);
  if (!p) return;
  p.lastFertilized = new Date().toISOString();
  DB.plants = plants;
  logEntry(p.id, 'fertilize', `Patręšta: ${p.name}`);
  toast(`🌱 Patręšta: ${p.name}`);
  render();
}

// ---------- Rodiniai ----------
const view = document.getElementById('view');
let activeTab = 'today';

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(b =>
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  render();
}

async function render() {
  if (activeTab === 'today') return renderToday();
  if (activeTab === 'plants') return renderPlants();
  if (activeTab === 'journal') return renderJournal();
  if (activeTab === 'settings') return renderSettings();
}

function plantName(id) { return (DB.plants.find(p => p.id === id) || {}).name || '—'; }

async function renderToday() {
  const s = DB.settings;
  const plants = DB.plants;
  updateCityBadge();

  if (!plants.length) {
    view.innerHTML = emptyState(
      '🌱', 'Dar nepridėjai augalų',
      'Pridėk pirmąjį augalą — ir kasryt matysi, ką su juo daryti.',
      'Pridėti augalą', "go('plants')");
    return;
  }

  view.innerHTML = `<div class="spinner">Tikrinu orus ${s.city ? '· ' + s.city.name : ''}…</div>`;
  let weather = null, weatherErr = false;
  try { weather = await getWeather(); } catch { weatherErr = true; }

  if (activeTab !== 'today') return; // vartotojas perjungė

  const recs = plants.map(p => recommend(p, weather));
  const due = recs.filter(r => r.due);
  const ok = recs.filter(r => !r.due);

  let html = '';

  if (s.city && weather) {
    html += `<div class="card" style="display:flex;gap:14px;align-items:center">
      <div style="font-size:30px">${weather.today.rain >= 1 ? '🌧️' : weather.today.tmax >= 25 ? '☀️' : '⛅'}</div>
      <div>
        <div style="font-weight:600">${escapeHtml(s.city.name)} · šiandien</div>
        <div class="muted" style="font-size:13px">
          ${Math.round(weather.today.tmax)}°C · krituliai ${weather.today.rain} mm
          ${weather.recentRain >= 1 ? ` · per 2 d. palijo ${weather.recentRain} mm` : ''}
        </div>
      </div></div>`;
  } else if (!s.city) {
    html += `<div class="card"><div class="sub" style="margin:0">
      📍 Nurodyk miestą <a href="#" onclick="go('settings');return false">Nustatymuose</a>,
      kad rekomendacijos atsižvelgtų į orus.</div></div>`;
  } else if (weatherErr) {
    html += `<div class="card"><div class="sub" style="margin:0">⚠️ Nepavyko gauti orų — rodau pagal laistymo intervalus.</div></div>`;
  }

  html += `<div class="section-title">Šiandienos užduotys (${due.length})</div>`;
  if (!due.length) {
    html += `<div class="card center muted">✅ Šiandien laistyti nieko nereikia. Gražu!</div>`;
  } else {
    html += `<div class="card">` + due.map(taskRow).join('') + `</div>`;
  }

  if (ok.length) {
    html += `<div class="section-title">Tvarkingi (${ok.length})</div>`;
    html += `<div class="card">` + ok.map(taskRow).join('') + `</div>`;
  }

  view.innerHTML = html;
}

function taskRow(r) {
  const p = r.plant;
  const pill = r.due
    ? `<span class="pill water">💧 Laistyti</span>`
    : `<span class="pill skip">✓ Gerai</span>`;
  const extras = r.extras.map(e => `<div class="reason">💡 ${escapeHtml(e)}</div>`).join('');
  const actions = r.due
    ? `<div class="btn-row" style="margin-top:10px">
         <button class="btn small" onclick="actWater('${p.id}')">💧 Palaisčiau</button>
         <button class="btn small ghost" onclick="actSnooze('${p.id}')">Atidėti</button>
       </div>`
    : '';
  return `<div class="plant">
    <div class="emoji">${emojiFor(p)}</div>
    <div class="body">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span class="name">${escapeHtml(p.name)}</span>${pill}
      </div>
      <div class="meta">${locLabel(p.location)} · ${potLabel(p.potSize)}</div>
      <div class="reason">${escapeHtml(r.reason)}</div>
      ${extras}
      ${actions}
    </div></div>`;
}

function renderPlants() {
  const plants = DB.plants;
  updateCityBadge();
  if (!plants.length) {
    view.innerHTML = emptyState('🪴', 'Augalų sąrašas tuščias',
      'Pridėk augalą — pavadinimą, ar viduje/lauke ir vazono dydį.',
      'Pridėti augalą', 'openPlantForm()');
    return;
  }
  let html = `<button class="btn" onclick="openPlantForm()">+ Pridėti augalą</button>
    <div style="height:14px"></div>`;
  html += `<div class="card">` + plants.map(p => {
    const since = daysSince(p.lastWatered);
    return `<div class="plant">
      <div class="emoji">${emojiFor(p)}</div>
      <div class="body">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="meta">${locLabel(p.location)} · ${potLabel(p.potSize)} ·
          ${isFinite(since) ? `laistyta prieš ${since} d.` : 'dar nelaistyta'}</div>
        ${p.notes ? `<div class="reason muted">${escapeHtml(p.notes)}</div>` : ''}
        <div class="btn-row" style="margin-top:10px">
          <button class="btn small secondary" onclick="actWater('${p.id}')">💧 Palaisčiau</button>
          <button class="btn small ghost" onclick="openPlantForm('${p.id}')">Redaguoti</button>
        </div>
      </div></div>`;
  }).join('') + `</div>`;
  view.innerHTML = html;
}

function renderJournal() {
  const j = DB.journal;
  updateCityBadge();
  if (!j.length) {
    view.innerHTML = emptyState('📔', 'Dienoraštis tuščias',
      'Kai pažymėsi laistymą ar tręšimą — viskas atsiras čia.', null, null);
    return;
  }
  const ico = { water: '💧', fertilize: '🌱', note: '📝' };
  let html = '', lastDay = '';
  for (const e of j) {
    const d = new Date(e.ts);
    const day = d.toLocaleDateString('lt-LT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (day !== lastDay) { html += `<div class="log-day">${day}</div>`; lastDay = day; }
    const time = d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="log-item">
      <span>${ico[e.action] || '•'}</span>
      <span style="flex:1">${escapeHtml(e.note || plantName(e.plantId))}</span>
      <span class="when">${time}</span></div>`;
  }
  view.innerHTML = `<div class="card">${html}</div>`;
}

function renderSettings() {
  const s = DB.settings;
  updateCityBadge();
  view.innerHTML = `
    <div class="card">
      <h2>📍 Miestas</h2>
      <p class="sub">Naudojamas orų prognozei (Open-Meteo, nemokama).</p>
      <div id="city-current" class="muted" style="margin-bottom:10px">
        ${s.city ? '✓ ' + escapeHtml(cityFull(s.city)) : 'Dar nenurodyta'}
      </div>
      <label class="field">
        <span class="lbl">Miesto paieška</span>
        <input id="city-input" placeholder="pvz. Kaunas" value="" />
      </label>
      <button class="btn secondary small" onclick="searchCity()">Ieškoti</button>
      <div id="city-results" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h2>ℹ️ Apie</h2>
      <p class="sub" style="margin:0">
        MVP versija — duomenys saugomi šiame telefone. Vėliau prijungsim sinchronizaciją
        tarp įrenginių ir kasdienį priminimą el. paštu / pranešimu.
      </p>
    </div>

    <div class="card">
      <h2>🗑️ Duomenys</h2>
      <div class="btn-row">
        <button class="btn ghost small" onclick="exportData()">Eksportuoti (JSON)</button>
        <button class="btn ghost small" onclick="resetData()">Ištrinti viską</button>
      </div>
    </div>`;
}

// ---------- Augalo forma (modalas) ----------
function openPlantForm(id) {
  const p = id ? DB.plants.find(x => x.id === id) : null;
  const m = document.createElement('div');
  m.className = 'modal-backdrop';
  m.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h2 style="margin-top:0">${p ? 'Redaguoti augalą' : 'Naujas augalas'}</h2>
      <label class="field"><span class="lbl">Pavadinimas</span>
        <input id="f-name" value="${p ? escapeAttr(p.name) : ''}" placeholder="pvz. Monstera prie lango" /></label>
      <label class="field"><span class="lbl">Rūšis (nebūtina)</span>
        <input id="f-species" value="${p ? escapeAttr(p.species || '') : ''}" placeholder="pvz. kaktusas, orchidėja…" /></label>
      <div class="row2">
        <label class="field"><span class="lbl">Vieta</span>
          <select id="f-loc">
            <option value="indoor"${!p||p.location==='indoor'?' selected':''}>Viduje</option>
            <option value="outdoor"${p&&p.location==='outdoor'?' selected':''}>Lauke</option>
          </select></label>
        <label class="field"><span class="lbl">Vazono dydis</span>
          <select id="f-pot">
            <option value="small"${p&&p.potSize==='small'?' selected':''}>Mažas</option>
            <option value="medium"${!p||p.potSize==='medium'?' selected':''}>Vidutinis</option>
            <option value="large"${p&&p.potSize==='large'?' selected':''}>Didelis</option>
          </select></label>
      </div>
      <label class="field"><span class="lbl">Kada paskutinį kartą laistyta?</span>
        <input id="f-last" type="date" value="${p && p.lastWatered ? p.lastWatered.slice(0,10) : ''}" max="${todayISO()}" /></label>
      <label class="field"><span class="lbl">Pastabos (nebūtina)</span>
        <textarea id="f-notes" rows="2" placeholder="pvz. mėgsta drėgmę, nemėgsta tiesioginės saulės">${p ? escapeHtml(p.notes || '') : ''}</textarea></label>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn" style="flex:1" onclick="savePlant('${id || ''}')">Išsaugoti</button>
        ${p ? `<button class="btn ghost small" onclick="deletePlant('${id}')">Ištrinti</button>` : ''}
      </div>
      <button class="btn ghost small" style="margin-top:8px;width:100%" onclick="closeModal()">Atšaukti</button>
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) closeModal(); });
  document.body.appendChild(m);
  setTimeout(() => document.getElementById('f-name').focus(), 50);
}

function savePlant(id) {
  const name = val('f-name').trim();
  if (!name) { toast('Įrašyk pavadinimą'); return; }
  const lastDate = val('f-last');
  const data = {
    name,
    species: val('f-species').trim(),
    location: val('f-loc'),
    potSize: val('f-pot'),
    notes: val('f-notes').trim(),
    lastWatered: lastDate ? new Date(lastDate + 'T09:00:00').toISOString() : null,
  };
  const plants = DB.plants;
  if (id) {
    const p = plants.find(x => x.id === id);
    Object.assign(p, data);
  } else {
    plants.push({ id: uid(), ...data, lastFertilized: null, createdAt: new Date().toISOString() });
  }
  DB.plants = plants;
  closeModal();
  toast(id ? 'Atnaujinta' : `Pridėta: ${name}`);
  render();
}

function deletePlant(id) {
  if (!confirm('Ištrinti šį augalą?')) return;
  DB.plants = DB.plants.filter(p => p.id !== id);
  closeModal();
  toast('Ištrinta');
  render();
}

function closeModal() { document.querySelector('.modal-backdrop')?.remove(); }

// ---------- Veiksmai ----------
function actWater(id) { const p = DB.plants.find(x => x.id === id); if (p) markWatered(p); }
function actSnooze(id) {
  const plants = DB.plants;
  const p = plants.find(x => x.id === id);
  if (!p) return;
  // „Atidėti" = perkelti paskutinį laistymą dieną atgal nuo intervalo (priminti rytoj)
  const d = new Date(); d.setDate(d.getDate() - (intervalDays(p) - 1));
  p.lastWatered = d.toISOString();
  DB.plants = plants;
  toast('Atidėta rytdienai');
  render();
}

async function searchCity() {
  const q = val('city-input').trim();
  const box = document.getElementById('city-results');
  if (!q) return;
  box.innerHTML = '<div class="muted">Ieškau…</div>';
  try {
    const list = await geocode(q);
    if (!list.length) { box.innerHTML = '<div class="muted">Nieko nerasta.</div>'; return; }
    box.innerHTML = list.map((c, i) =>
      `<button class="btn ghost small" style="width:100%;margin-bottom:6px;text-align:left"
        onclick='pickCity(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
        📍 ${escapeHtml(cityFull(c))}</button>`).join('');
  } catch {
    box.innerHTML = '<div class="muted">Klaida ieškant. Bandyk dar kartą.</div>';
  }
}
function pickCity(c) {
  const s = DB.settings;
  s.city = c;
  DB.settings = s;
  weatherCache = null;
  toast('Miestas išsaugotas');
  setTab('today');
}

function exportData() {
  const blob = new Blob([JSON.stringify({
    plants: DB.plants, journal: DB.journal, settings: DB.settings, exportedAt: new Date().toISOString(),
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zaliasis-dienorastis.json';
  a.click();
}
function resetData() {
  if (!confirm('Ištrinti VISUS augalus, dienoraštį ir nustatymus? Šito atšaukti negalima.')) return;
  ['plants', 'journal', 'settings'].forEach(k => localStorage.removeItem('zd.' + k));
  weatherCache = null;
  toast('Išvalyta');
  setTab('today');
}

// ---------- Pagalbinės ----------
function go(tab) { setTab(tab); }
function val(id) { return document.getElementById(id).value; }
function locLabel(l) { return l === 'outdoor' ? '🌳 Lauke' : '🏠 Viduje'; }
function potLabel(p) { return ({ small: 'mažas vazonas', medium: 'vidutinis vazonas', large: 'didelis vazonas' })[p] || p; }
function cityFull(c) { return [c.name, c.admin1, c.country].filter(Boolean).join(', '); }
function updateCityBadge() {
  const b = document.getElementById('city-badge');
  const s = DB.settings;
  if (s.city) { b.hidden = false; b.textContent = '📍 ' + s.city.name; }
  else b.hidden = true;
}
function emptyState(big, title, text, btnLabel, btnAction) {
  return `<div class="empty">
    <div class="big">${big}</div>
    <h2 style="margin:8px 0 0">${title}</h2>
    <p>${text}</p>
    ${btnLabel ? `<button class="btn" style="max-width:260px;margin:0 auto" onclick="${btnAction}">${btnLabel}</button>` : ''}
  </div>`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Paleidimas ----------
document.querySelectorAll('.tab').forEach(b =>
  b.addEventListener('click', () => setTab(b.dataset.tab)));

// Modalų stilius įterpiamas čia, kad CSS liktų tvarkingas
const style = document.createElement('style');
style.textContent = `
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:40;display:flex;
  align-items:flex-end;justify-content:center;padding:0}
.modal{background:#fff;width:100%;max-width:640px;border-radius:18px 18px 0 0;padding:20px 16px
  calc(20px + env(safe-area-inset-bottom));max-height:92dvh;overflow:auto;
  box-shadow:0 -8px 30px rgba(0,0,0,.18)}
@media(min-width:560px){.modal-backdrop{align-items:center}.modal{border-radius:18px}}`;
document.head.appendChild(style);

// Service worker — offline + įsidiegimas
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Globalios funkcijos, naudojamos iš onclick atributų
Object.assign(window, {
  go, openPlantForm, savePlant, deletePlant, closeModal, actWater, actSnooze,
  searchCity, pickCity, exportData, resetData,
});

setTab('today');
