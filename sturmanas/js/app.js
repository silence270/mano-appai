/* Šturmanas · valdiklis */
'use strict';
import { RoadDB, SEV_COLOR, SEV_NAME, HAZ_LT, HAZ_ICON, SURF_LT, PLACE, dist, bearing,
         callText, callPhrase, callDistance, fmtDist, fmtDur } from './core.js';
import { Router, MODES } from './router.js';

const $ = s => document.querySelector(s);
const el = id => document.getElementById(id);
const db = new RoadDB();
const router = new Router(db);
let map, driveMap, layerRoads, layerRoute, layerMe, driveMe, driveLine;
let route = null, mode = 'fun', pickMode = false;

/* ── Įkrovimas ─────────────────────────────────────────────────────────── */
(async function boot() {
  const bar = el('bootBar'), st = el('bootSt');
  let p = 10;
  const step = (t, pct) => { st.textContent = t; bar.style.width = (p = pct) + '%'; };
  try {
    await db.load(t => step(t, Math.min(70, p + 18)));
    step('Ruošiamas maršrutų grafas…', 82);
    await router.load();
    step('Beveik…', 95);
    initMap(); initUI();
    el('mapPill').textContent = db.ways.length.toLocaleString('lt') + ' kelių';
    el('mapSub').textContent = `Kaunas + Kauno r. · ${db.best.length} vertų kelių`;
    setTimeout(() => el('boot').classList.add('done'), 260);
  } catch (e) {
    st.innerHTML = 'Klaida: ' + e.message + '<br><small>Patikrink, ar yra data/ aplankas</small>';
    console.error(e);
  }
})();

/* ── Žemėlapis ─────────────────────────────────────────────────────────── */
function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true, preferCanvas: true })
        .setView([54.898, 23.904], 11);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap · CARTO',
  }).addTo(map);
  layerRoads = L.layerGroup().addTo(map);
  layerRoute = L.layerGroup().addTo(map);
  layerMe = L.layerGroup().addTo(map);
  map.on('moveend', () => { drawRoads(); drawPlaces(); });
  map.on('click', e => {
    if (!pickMode) return;
    pickMode = false;
    makeRouteTo(e.latlng.lat, e.latlng.lng);
  });
  drawRoads();
  locateMe(false);
}

/** Kelio -> geriausios grandinės balas (kad nutolinus rodytume tik vertus kelius). */
let wayScore = null;
function buildWayScores() {
  wayScore = new Map();
  db.best.forEach(r => r.ways.forEach(i => {
    if (!wayScore.has(i) || wayScore.get(i) < r.score) wayScore.set(i, r.score);
  }));
}

/** Spalva pagal važiavimo vertę (ne pagal smulkius vingiukus). */
function roadColor(score) {
  return score > 220 ? '#ff2d55' : score > 150 ? '#ff5e3a' : score > 100 ? '#ff9500'
       : score > 60 ? '#ffcc00' : '#8ee000';
}

/**
 * Nutolinus — tik tikri važiavimo keliai (įvertintos grandinės).
 * Priartinus — visi keliai, spalva pagal vingiuotumą.
 */
function drawRoads() {
  if (!map) return;
  if (!wayScore) buildWayScores();
  layerRoads.clearLayers();
  const z = map.getZoom(), b = map.getBounds().pad(0.12);
  const inView = w => {
    for (let i = 0; i < w.pts.length; i += Math.max(1, w.pts.length >> 2))
      if (b.contains(w.pts[i])) return true;
    return b.contains(w.pts[w.pts.length - 1]);
  };
  let n = 0;
  if (z < 14) {
    // ── kuruotas vaizdas: tik geri keliai ──
    const minScore = z < 11 ? 90 : z < 12.5 ? 55 : 30;
    for (const [wid, sc] of wayScore) {
      if (sc < minScore) continue;
      const w = db.ways[wid];
      if (!w || !inView(w)) continue;
      if (++n > 1800) break;
      const line = L.polyline(w.pts, {
        color: roadColor(sc), weight: sc > 150 ? 4.5 : 3.5, opacity: .95,
        lineCap: 'round', lineJoin: 'round',
        dashArray: w.surf === 'unpaved' ? '6,7' : null,
      });
      line.on('click', ev => { L.DomEvent.stop(ev); showRoad(w); });
      layerRoads.addLayer(line);
    }
  } else {
    // ── detalus vaizdas: visi keliai ──
    for (const w of db.ways) {
      if (w.len < 30 || !inView(w)) continue;
      if (++n > 2400) break;
      const q = w.curv / Math.max(w.len, 1);
      const sc = wayScore.get(w.id) || 0;
      const col = sc >= 30 ? roadColor(sc)
                : q > .55 ? '#ff9500' : q > .25 ? '#ffcc00' : q > .1 ? '#6f7b93' : '#39404f';
      const line = L.polyline(w.pts, {
        color: col, weight: sc >= 30 ? 4.5 : q > .25 ? 3 : 2,
        opacity: sc >= 30 ? .95 : q > .1 ? .8 : .5, lineCap: 'round',
        dashArray: w.surf === 'unpaved' ? '5,6' : null,
      });
      line.on('click', ev => { L.DomEvent.stop(ev); showRoad(w); });
      layerRoads.addLayer(line);
    }
  }
}

/* ── Gražios vietos ─────────────────────────────────────────────────────── */
let layerPlaces = null, placesOn = false;
function drawPlaces() {
  if (!layerPlaces) layerPlaces = L.layerGroup().addTo(map);
  layerPlaces.clearLayers();
  if (!placesOn) return;
  const z = map.getZoom(), b = map.getBounds().pad(0.1);
  const minScore = z < 12 ? 8 : z < 14 ? 5 : 3;
  for (const p of db.places) {
    if (p.s < minScore || !b.contains([p.lat, p.lon])) continue;
    const m = PLACE[p.c] || { i: '📍', n: '' };
    L.marker([p.lat, p.lon], { icon: L.divIcon({
      className: '', iconSize: [30, 30], iconAnchor: [15, 15],
      html: `<div style="width:30px;height:30px;border-radius:50%;background:rgba(18,20,27,.94);
        border:1.5px solid #3d465c;display:flex;align-items:center;
        justify-content:center;font-size:15px;box-shadow:0 3px 10px rgba(0,0,0,.6)">${m.i}</div>` }) })
      .on('click', ev => { L.DomEvent.stop(ev); showPlace(p); })
      .addTo(layerPlaces);
  }
}
function showPlace(p) {
  const m = PLACE[p.c] || { i: '📍', n: '' };
  openSheet(`<div style="font-size:38px;line-height:1">${m.i}</div>
    <h2 style="margin:6px 0 3px;font-size:21px">${esc(p.n)}</h2>
    <div class="mut" style="font-size:12.5px;margin-bottom:14px">${m.n}</div>
    <button class="btn pri" onclick="window.__routeTo(${p.lat},${p.lon})">Sudaryti maršrutą čia</button>
    <button class="btn gost" style="margin-top:8px"
      onclick="window.open('https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}','_blank')">
      Atidaryti žemėlapiuose</button>`);
}

function locateMe(fly = true) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: la, longitude: lo } = pos.coords;
    window.MY = [la, lo];
    layerMe.clearLayers();
    L.circleMarker([la, lo], { radius: 7, color: '#fff', weight: 2.5,
      fillColor: '#0a84ff', fillOpacity: 1 }).addTo(layerMe);
    if (fly) map.flyTo([la, lo], 13);
  }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
}

/* ── Kelio detalės ─────────────────────────────────────────────────────── */
function showRoad(w) {
  const sev = {}; w.corners.forEach(c => sev[c.sev] = (sev[c.sev] || 0) + 1);
  const bumps = w.haz.filter(h => h.kind === 'bump').length;
  const cams = w.haz.filter(h => h.kind === 'camera').length;
  openSheet(`
    <h2 style="margin:2px 0 4px;font-size:21px">${esc(w.name || w.ref || 'Bevardis kelias')}</h2>
    <div class="mut" style="font-size:12.5px;margin-bottom:12px">
      ${w.hw} · ${SURF_LT[w.surf]} · ${w.speed} km/h</div>
    <div class="grid4">
      ${stat(fmtDist(w.len), 'ilgis')}
      ${stat(w.corners.length, 'posūkių')}
      ${stat(Math.round(w.curv / Math.max(w.len, 1) * 1000), 'vingių/km')}
      ${stat(bumps + cams, 'trukdžių', bumps + cams ? 'warn' : 'good')}
    </div>
    ${sevBar(sev)}
    ${w.corners.length ? `<h3 style="margin:16px 0 8px">Posūkiai iš eilės</h3>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${w.corners.slice(0, 40).map(c =>
        `<span class="chip" style="border-color:${SEV_COLOR[c.sev]}55;color:${SEV_COLOR[c.sev]}">
          ${c.dir === 'L' ? '↰' : '↱'} ${c.sev}${c.shape === 'tightens' ? '▾' : c.shape === 'opens' ? '▴' : ''}</span>`).join('')}</div>` : ''}
    <button class="btn pri" style="margin-top:16px" onclick="window.__routeTo(${w.pts[0][0]},${w.pts[0][1]})">
      Nuvažiuoti čia</button>`);
  map.fitBounds(L.polyline(w.pts).getBounds(), { padding: [50, 50] });
}
const stat = (v, k, cls = '') => `<div class="stat ${cls}"><div class="v num">${v}</div><div class="k">${k}</div></div>`;
function sevBar(sev) {
  const tot = Object.values(sev).reduce((a, b) => a + b, 0);
  if (!tot) return '';
  return `<div style="margin-top:12px"><div style="display:flex;height:9px;border-radius:99px;overflow:hidden;background:var(--bg2)">
    ${[1,2,3,4,5,6].map(s => sev[s] ? `<i style="width:${sev[s]/tot*100}%;background:${SEV_COLOR[s]}"></i>` : '').join('')}
  </div><div class="row" style="gap:11px;margin-top:6px;font-size:10.5px;color:var(--mut);flex-wrap:wrap">
    ${[1,2,3,4,5,6].filter(s => sev[s]).map(s =>
      `<span><b style="color:${SEV_COLOR[s]}">${s}</b> ${SEV_NAME[s]} ×${sev[s]}</span>`).join('')}
  </div></div>`;
}
const esc = s => String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

function openSheet(html) {
  el('sheetBody').innerHTML = html;
  el('sheet').classList.add('on'); el('mask').classList.add('on');
}
function closeSheet() { el('sheet').classList.remove('on'); el('mask').classList.remove('on'); }

/* ── Maršrutai ─────────────────────────────────────────────────────────── */
window.__routeTo = (lat, lon) => { closeSheet(); makeRouteTo(lat, lon); };

async function makeRouteTo(lat, lon) {
  const me = window.MY;
  if (!me) { toast('Nerandu tavo vietos — įjunk GPS'); return; }
  busy('Skaičiuojamas maršrutas…');
  await tick();
  const r = router.route(me[0], me[1], lat, lon, mode, el('pavedOnly')?.checked);
  if (!r) { busy(null); toast('Nepavyko rasti kelio ten'); return; }
  setRoute(r); busy(null); switchTo('route');
}

async function makeLoop() {
  const me = window.MY;
  if (!me) { toast('Nerandu tavo vietos — įjunk GPS'); locateMe(); return; }
  busy('Ieškoma gražios kilpos…'); await tick();
  const km = +el('loopKm').value;
  const r = router.loop(me[0], me[1], km, mode, el('pavedOnly')?.checked);
  busy(null);
  if (!r) { toast('Nepavyko sudėlioti kilpos — pabandyk kitą ilgį'); return; }
  setRoute(r);
}

function setRoute(r) {
  route = r;
  el('routeOut').innerHTML = routeCard(r);
  layerRoute.clearLayers();
  L.polyline(r.pts, { color: '#000', weight: 9, opacity: .5 }).addTo(layerRoute);
  L.polyline(r.pts, { color: 'var(--amber)' === '' ? '#ffb300' : '#ffb300', weight: 5, opacity: .95 }).addTo(layerRoute);
  for (const c of r.corners) {
    if (c.sev > 3) continue;
    const w = db.ways[0]; // pozicija imama iš maršruto taškų
  }
  r.hazards.forEach(h => {
    const w = h.way;
  });
  map.fitBounds(L.polyline(r.pts).getBounds(), { padding: [40, 40] });
}

function routeCard(r) {
  const tight = r.tight;
  return `<div class="card">
    <div class="row" style="justify-content:space-between;margin-bottom:12px">
      <div>${r.tourName ? `<div style="font-size:13px;font-weight:800;color:var(--amber);margin-bottom:2px">
        ${r.tourEmoji} ${esc(r.tourName)}</div>` : ''}
        <div style="font-size:26px;font-weight:900" class="num">${r.km.toFixed(1)} km</div>
        <div class="mut" style="font-size:12.5px">${fmtDur(r.timeMin)} · ${MODES[r.mode].label}</div></div>
      <div style="text-align:right"><div style="font-size:26px;font-weight:900;color:var(--amber)" class="num">${Math.round(r.curvPerKm)}</div>
        <div class="mut" style="font-size:11px">vingių/km</div></div>
    </div>
    <div class="grid4">
      ${stat(r.bumps, 'kalneliai', r.bumps ? 'warn' : 'good')}
      ${stat(r.cams, 'kameros', r.cams ? 'bad' : 'good')}
      ${stat(r.pavedPct + '%', 'asfalto', r.pavedPct > 92 ? 'good' : 'warn')}
      ${stat(r.corners.length, 'posūkių')}
    </div>
    ${sevBar(r.sev)}
    ${r.roads.length ? `<div class="mut" style="font-size:12px;margin-top:12px">
      <b class="amber">Keliai:</b> ${r.roads.map(esc).join(' → ')}</div>` : ''}
    ${(() => { const st = stopsAlong(r); return st.length ? `
      <div style="margin-top:14px">
        <div class="mut" style="font-size:11px;font-weight:800;letter-spacing:.08em;
             text-transform:uppercase;margin-bottom:7px">Sustojimai pakeliui</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${st.map(p => {
          const m = PLACE[p.c] || { i: '📍' };
          return `<span class="chip" style="cursor:pointer" onclick="window.__place(${p.lat},${p.lon})">
            ${m.i} ${esc(p.n.length > 22 ? p.n.slice(0, 21) + '…' : p.n)}</span>`; }).join('')}</div>
      </div>` : ''; })()}
    <div class="row" style="gap:8px;margin-top:14px">
      <button class="btn pri" onclick="window.__drive()">▶ Važiuoti</button>
      <button class="btn sm" onclick="window.__save()">💾</button>
    </div>
  </div>`;
}
window.__drive = () => { switchTo('drive'); startDrive(); };
window.__save = () => {
  if (!route) return;
  const s = JSON.parse(localStorage.sturmanas_routes || '[]');
  s.unshift({ t: Date.now(), km: route.km, curv: route.curvPerKm, mode: route.mode,
              pts: route.pts.filter((_, i) => i % 3 === 0), name: route.roads.slice(0, 2).join(' → ') });
  localStorage.sturmanas_routes = JSON.stringify(s.slice(0, 40));
  toast('Išsaugota'); renderSaved();
};

/* ── ŠTURMANAS: važiavimo režimas ──────────────────────────────────────── */
let watchId = null, voiceOn = true, called = new Set(), wakeLock = null, simTimer = null;
let lastPos = null, curSpeed = 0;

function initDriveMap() {
  if (driveMap) return;
  driveMap = L.map('driveMap', { zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false, preferCanvas: true }).setView([54.9, 23.9], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd' }).addTo(driveMap);
  driveLine = L.layerGroup().addTo(driveMap);
  driveMe = L.circleMarker([54.9, 23.9], { radius: 7, color: '#fff', weight: 2.5,
    fillColor: '#ffb300', fillOpacity: 1 }).addTo(driveMap);
}

function startDrive() {
  initDriveMap();
  setTimeout(() => driveMap.invalidateSize(), 120);
  if (watchId != null || simTimer) return stopDrive();
  called.clear();
  driveRoute = route; routeCum = null;
  el('driveIdle').classList.add('hide');
  el('btnDrive').textContent = '⏹ STOP';
  speak(voiceLT ? 'Šturmanas pasiruošęs' : 'Co-driver ready', true);
  requestWake();
  if (route && new URLSearchParams(location.search).has('sim')) return simulate();
  if (!navigator.geolocation) { toast('Nėra GPS'); return simulate(); }
  watchId = navigator.geolocation.watchPosition(onPos, err => {
    toast('GPS klaida: ' + err.message);
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 });
}

function stopDrive() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (simTimer) clearInterval(simTimer); simTimer = null;
  el('btnDrive').textContent = '▶ START';
  driveRoute = null; routeCum = null;
  el('driveIdle').classList.remove('hide');
  el('callWrap').classList.add('hide');
  if (wakeLock) { wakeLock.release?.(); wakeLock = null; }
}

async function requestWake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) {}
}

function onPos(pos) {
  const { latitude: la, longitude: lo, speed, heading } = pos.coords;
  curSpeed = speed != null && speed >= 0 ? speed * 3.6
           : (lastPos ? dist(lastPos[0], lastPos[1], la, lo) / Math.max(.5, (Date.now() - lastPos[2]) / 1000) * 3.6 : 0);
  const hd = heading != null && !isNaN(heading) ? heading
           : (lastPos ? bearing(lastPos[0], lastPos[1], la, lo) : null);
  lastPos = [la, lo, Date.now()];
  updateDrive(la, lo, hd);
}

function updateDrive(la, lo, hd) {
  el('spd').textContent = Math.round(curSpeed);
  driveMe.setLatLng([la, lo]);
  driveMap.setView([la, lo], 15, { animate: false });
  const snap = db.snap(la, lo, hd, 70);
  if (!snap) { el('curRoad').textContent = 'ne kelyje'; el('curInfo').textContent = '—'; return; }
  const w = snap.way;
  el('curRoad').textContent = w.name || w.ref || w.hw;
  el('curInfo').textContent = `${SURF_LT[w.surf]} · ${w.speed} km/h`;
  driveLine.clearLayers();
  L.polyline(driveRoute ? driveRoute.pts : w.pts,
    { color: '#ffb300', weight: 4, opacity: driveRoute ? .9 : .7 }).addTo(driveLine);

  const horizon = Math.max(500, curSpeed * 18);
  // Jei važiuojam maršrutu — sekam maršrutą (tiksliausia). Kitaip — sekam jungtinius kelius.
  const items = (driveRoute ? routeAhead(la, lo, horizon) : followAhead(snap, horizon));
  renderCall(items);
  // balso kvietimai
  const lead = callDistance(curSpeed, 5);
  for (let k = 0; k < Math.min(4, items.length); k++) {
    const it = items[k];
    const key = `${it.way ? it.way.id : 'r'}:${it.type}:${it.i}:${Math.round((it.at ?? 0) / 25)}`;
    if (called.has(key)) continue;
    if (it.dist <= lead) {
      called.add(key);
      const nxt = items[k + 1];
      const txt = callPhrase(it, nxt, voiceLT);
      if (txt) speak(txt);
      // jei kitas iškart po šio — jį jau pasakėm, nekartojam
      if (nxt && nxt.type === 'corner' && nxt.dist - it.dist < 90)
        called.add(`${nxt.way ? nxt.way.id : 'r'}:${nxt.type}:${nxt.i}:${Math.round((nxt.at ?? 0) / 25)}`);
    }
  }
  if (called.size > 400) called.clear();
}

/* ── Kas laukia priekyje ────────────────────────────────────────────────── */
let driveRoute = null, routeCum = null, connIdx = null;

/** Sankryžų indeksas: koordinatė -> kurie keliai joje susieina. */
function buildConn() {
  connIdx = new Map();
  const k = (la, lo) => la.toFixed(6) + ',' + lo.toFixed(6);
  for (const w of db.ways) {
    for (const idx of [0, w.pts.length - 1]) {
      const key = k(w.pts[idx][0], w.pts[idx][1]);
      if (!connIdx.has(key)) connIdx.set(key, []);
      connIdx.get(key).push([w.id, idx]);
    }
  }
}

/** Laisvai važiuojant: seka kelią ir už sankryžos pasirenka tiesiausią tęsinį. */
function followAhead(snap, ahead) {
  if (!connIdx) buildConn();
  const out = [];
  let w = snap.way, fwd = snap.forward;
  let here = db.distanceAlong(w, snap.i, snap.t);
  let base = 0, hops = 0;
  const k = (la, lo) => la.toFixed(6) + ',' + lo.toFixed(6);
  while (hops < 4 && base < ahead) {
    const total = db.distanceAlong(w, w.pts.length - 1, 0);
    for (const c of w.corners) {
      const d = db.distanceAlong(w, c.i, 0);
      const rel = base + (fwd ? d - here : here - d);
      if (rel > 3 && rel < ahead) out.push({ type: 'corner', ...c, dist: rel, way: w });
    }
    for (const h of w.haz) {
      const d = db.distanceAlong(w, h.i, 0);
      const rel = base + (fwd ? d - here : here - d);
      if (rel > 3 && rel < ahead) out.push({ type: 'hazard', ...h, dist: rel, way: w });
    }
    const toEnd = fwd ? total - here : here;
    base += toEnd;
    if (base >= ahead) break;
    // kur toliau: tos pačios krypties tęsinys
    const endPt = fwd ? w.pts[w.pts.length - 1] : w.pts[0];
    const prevPt = fwd ? w.pts[w.pts.length - 2] : w.pts[1];
    if (!prevPt) break;
    const hd = bearing(prevPt[0], prevPt[1], endPt[0], endPt[1]);
    const cands = (connIdx.get(k(endPt[0], endPt[1])) || []).filter(([id]) => id !== w.id);
    let pick = null, bestDiff = 70;
    for (const [id, idx] of cands) {
      const nw = db.ways[id];
      const nextPt = idx === 0 ? nw.pts[1] : nw.pts[nw.pts.length - 2];
      if (!nextPt) continue;
      const nb = bearing(endPt[0], endPt[1], nextPt[0], nextPt[1]);
      const diff = Math.abs(((nb - hd + 540) % 360) - 180);
      if (diff < bestDiff) { bestDiff = diff; pick = { w: nw, fwd: idx === 0 }; }
    }
    if (!pick) break;
    w = pick.w; fwd = pick.fwd;
    here = fwd ? 0 : db.distanceAlong(w, w.pts.length - 1, 0);
    hops++;
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/** Važiuojant maršrutu: projekcija ant maršruto + kas priekyje. */
function routeAhead(lat, lon, ahead) {
  const r = driveRoute;
  if (!routeCum) {
    routeCum = [0];
    for (let i = 1; i < r.pts.length; i++)
      routeCum.push(routeCum[i - 1] + dist(r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]));
  }
  // artimiausias maršruto taškas
  let bi = 0, bd = Infinity;
  for (let i = 0; i < r.pts.length; i++) {
    const d = dist(lat, lon, r.pts[i][0], r.pts[i][1]);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bd > 120) return followAhead(db.snap(lat, lon, null, 90) || {}, ahead);
  const s = routeCum[bi];
  const out = [];
  for (const c of r.corners) if (c.at > s + 3 && c.at < s + ahead)
    out.push({ type: 'corner', ...c, dist: c.at - s });
  for (const h of r.hazards) if (h.at > s + 3 && h.at < s + ahead)
    out.push({ type: 'hazard', ...h, dist: h.at - s });
  el('curInfo').textContent = `maršrute · liko ${fmtDist(Math.max(0, routeCum[routeCum.length - 1] - s))}`;
  return out.sort((a, b) => a.dist - b.dist);
}

function renderCall(items) {
  const c = items.find(x => x.type === 'corner');
  const first = items[0];
  const wrap = el('callWrap');
  if (!first) { wrap.classList.add('hide'); el('driveIdle').classList.remove('hide');
                el('driveIdle').textContent = 'Tiesus kelias'; return; }
  el('driveIdle').classList.add('hide'); wrap.classList.remove('hide');
  if (first.type === 'hazard') {
    el('cArrow').textContent = HAZ_ICON[first.kind] || '⚠️';
    el('cSev').textContent = ''; el('cTxt').textContent = (HAZ_LT[first.kind] || '').toUpperCase();
    el('cSub').textContent = ''; el('cDist').textContent = fmtDist(first.dist);
  } else {
    el('cArrow').textContent = first.dir === 'L' ? '↰' : '↱';
    el('cArrow').style.color = SEV_COLOR[first.sev];
    el('cSev').textContent = first.sev; el('cSev').style.color = SEV_COLOR[first.sev];
    el('cTxt').textContent = first.dir === 'L' ? 'KAIRĖ' : 'DEŠINĖ';
    el('cSub').textContent = first.shape === 'tightens' ? 'siaurėja'
                           : first.shape === 'opens' ? 'veriasi'
                           : (first.len > 140 ? 'ilga' : `~${first.v} km/h`);
    el('cDist').textContent = fmtDist(first.dist);
  }
  el('nextList').innerHTML = items.slice(1, 6).map(x => `<div class="nx">
    <div class="d num">${fmtDist(x.dist)}</div>
    <div class="c" style="color:${x.type === 'corner' ? SEV_COLOR[x.sev] : '#ffb300'}">
      ${x.type === 'corner' ? (x.dir === 'L' ? '↰ ' : '↱ ') + x.sev : (HAZ_ICON[x.kind] || '⚠')}</div></div>`).join('');
}

/* ── Balsas ────────────────────────────────────────────────────────────── */
let voice = null, voiceReady = false;
let voiceLT = true;
function pickVoice() {
  const vs = speechSynthesis.getVoices();
  const lt = vs.find(v => v.lang && v.lang.toLowerCase().startsWith('lt'));
  voice = lt || vs.find(v => v.lang && v.lang.toLowerCase().startsWith('en')) || vs[0];
  voiceLT = !!lt;                       // nėra lietuviško balso -> tarptautinės ralio komandos
  voiceReady = true;
}
speechSynthesis?.addEventListener?.('voiceschanged', pickVoice);
setTimeout(pickVoice, 300);

function speak(text, force = false) {
  if (!voiceOn && !force) return;
  if (!('speechSynthesis' in window)) return;
  if (!voiceReady) pickVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || (voiceLT ? 'lt-LT' : 'en-GB');
  u.rate = 1.15; u.pitch = 1; u.volume = 1;
  speechSynthesis.speak(u);
}

/* ── Simuliacija (testavimui be važiavimo) ─────────────────────────────── */
function simulate() {
  const pts = route ? route.pts : db.ways.find(w => w.corners.length > 6)?.pts;
  if (!pts) return toast('Nėra maršruto simuliacijai');
  let i = 0, t = 0;
  curSpeed = 70;
  simTimer = setInterval(() => {
    if (i >= pts.length - 2) { stopDrive(); speak(voiceLT ? 'Maršrutas baigtas' : 'Route finished'); return; }
    const step = curSpeed / 3.6 * 0.5;         // 0,5 s žingsnis
    let moved = 0;
    while (moved < step && i < pts.length - 2) {
      const d = dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      moved += d; i++;
    }
    const hd = bearing(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    updateDrive(pts[i][0], pts[i][1], hd);
  }, 500);
}

/* ── Sąsaja ────────────────────────────────────────────────────────────── */
function initUI() {
  document.querySelectorAll('.tabs button').forEach(b =>
    b.onclick = () => switchTo(b.dataset.s));
  el('mask').onclick = closeSheet;
  el('modeSeg').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    el('modeSeg').querySelectorAll('button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); mode = b.dataset.m;
  };
  el('loopKm').oninput = e => el('loopKmV').textContent = e.target.value + ' km';
  el('btnLoop').onclick = makeLoop;
  el('btnPick').onclick = () => { pickMode = true; switchTo('map'); toast('Bakstelėk žemėlapį — ten nuvešiu'); };
  el('btnDrive').onclick = () => (watchId != null || simTimer) ? stopDrive() : startDrive();
  el('btnVoice').onclick = () => {
    voiceOn = !voiceOn; el('btnVoice').textContent = voiceOn ? '🔊' : '🔇';
    if (voiceOn) speak(voiceLT ? 'Balsas įjungtas' : 'Voice on', true);
  };
  el('btnPlaces').onclick = () => {
    placesOn = !placesOn;
    el('btnPlaces').style.background = placesOn ? 'rgba(255,179,0,.92)' : 'rgba(18,20,27,.92)';
    el('btnPlaces').style.color = placesOn ? '#151005' : '#fff';
    drawPlaces();
    if (placesOn) toast(`${db.places.length} gražių vietų ir sustojimų`);
  };
  renderSaved();
  renderBest();
  renderTours();
}

function switchTo(s) {
  document.querySelectorAll('.screen').forEach(x => x.classList.remove('on'));
  el('s-' + s).classList.add('on');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  if (s === 'map') setTimeout(() => map.invalidateSize(), 60);
  if (s === 'drive' && driveMap) setTimeout(() => driveMap.invalidateSize(), 60);
}

function renderBest() {
  // geriausi keliai — rodomi lakšte iš „Atrask" mygtuko
  const list = db.best.slice(0, 60).map((r, i) => `
    <div class="road" onclick="window.__showBest(${i})">
      <div class="sc"><b style="color:${r.score > 250 ? '#ff2d55' : r.score > 150 ? '#ff9500' : '#ffcc00'}">${r.score}</b><i>BALAS</i></div>
      <div style="min-width:0;flex:1">
        <div class="nm">${esc(r.name || 'Bevardis kelias')}</div>
        <div class="mt"><span>${r.km.toFixed(1)} km</span><span>${r.corners} posūkių</span>
          <span>${r.paved}% asfalto</span>${r.bumps ? `<span>🛑${r.bumps}</span>` : ''}</div>
      </div></div>`).join('');
  window.__bestHtml = `<h2 style="margin:2px 0 12px;font-size:20px">Geriausi keliai netoliese</h2>${list}`;
}
window.__showBest = i => {
  const r = db.best[i];
  const w = db.ways[r.ways[0]];
  closeSheet(); switchTo('map');
  const all = r.ways.map(x => db.ways[x]).filter(Boolean);
  layerRoute.clearLayers();
  all.forEach(x => L.polyline(x.pts, { color: '#ffb300', weight: 5, opacity: .95 }).addTo(layerRoute));
  map.fitBounds(L.polyline(all.flatMap(x => x.pts)).getBounds(), { padding: [40, 40] });
  setTimeout(() => showRoad(w), 400);
};

/* ── Suprojektuoti vaizdingi maršrutai ──────────────────────────────────── */
/** Rato ilgis pagal taškus (tiesė × 1,3 — realaus kelio pataisa). */
function tourKm(t) {
  let m = 0;
  for (let i = 0; i < t.wp.length - 1; i++)
    m += dist(t.wp[i][0], t.wp[i][1], t.wp[i + 1][0], t.wp[i + 1][1]);
  return Math.round(m / 1000 * 1.3 / 5) * 5;
}
function renderTours() {
  const box = el('tourList'); if (!box) return;
  box.innerHTML = (db.tours || []).map((t, i) => `
    <div class="road" onclick="window.__tour(${i})" style="align-items:flex-start">
      <div class="sc" style="font-size:22px">${t.emoji}</div>
      <div style="min-width:0;flex:1">
        <div class="nm">${esc(t.name)}</div>
        <div class="mt" style="white-space:normal;line-height:1.45;margin-top:5px">${esc(t.desc)}</div>
        <div class="mt" style="margin-top:6px">
          <span class="chip">${tourKm(t)} km ratas</span>
          <span class="chip">${MODES[t.mode].label}</span>
          <span class="chip">${t.wp.length} sustojimai</span></div>
        <div class="mut" style="font-size:10.5px;margin-top:4px">+ kelias nuo tavęs ir atgal</div>
      </div></div>`).join('');
}
window.__tour = async i => {
  const t = db.tours[i]; if (!t) return;
  busy(`Braižomas „${t.name}"…`); await tick();
  const me = window.MY;
  const wp = me ? [me, ...t.wp, me] : t.wp;      // nuo tavęs ir atgal
  const r = router.routeVia(wp, t.mode, el('pavedOnly')?.checked);
  busy(null);
  if (!r) { toast('Nepavyko nubrėžti šio maršruto'); return; }
  r.tourName = t.name; r.tourEmoji = t.emoji;
  setRoute(r); switchTo('route');
  el('routeOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** Vietos, pro kurias eina maršrutas (sustojimai). */
function stopsAlong(r, maxM = 1200) {
  const out = [];
  const step = Math.max(1, Math.floor(r.pts.length / 400));
  for (const p of db.places) {
    if (p.s < 6) continue;
    let best = Infinity, at = 0, acc = 0;
    for (let i = 0; i < r.pts.length; i += step) {
      const d = dist(p.lat, p.lon, r.pts[i][0], r.pts[i][1]);
      if (d < best) { best = d; at = i; }
    }
    if (best <= maxM) out.push({ ...p, d: best, at });
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(0, 14);
}

function renderSaved() {
  const s = JSON.parse(localStorage.sturmanas_routes || '[]');
  el('savedList').innerHTML = `
    <div class="card"><h3>Greita pradžia</h3>
      <button class="btn" onclick="openSheet(window.__bestHtml)">🏆 Geriausi keliai netoliese</button></div>` +
    (s.length ? s.map((r, i) => `<div class="road" onclick="window.__loadSaved(${i})">
      <div class="sc"><b class="amber">${r.km.toFixed(0)}</b><i>KM</i></div>
      <div style="min-width:0;flex:1"><div class="nm">${esc(r.name || 'Maršrutas')}</div>
      <div class="mt"><span>${Math.round(r.curv)} vingių/km</span>
        <span>${new Date(r.t).toLocaleDateString('lt')}</span></div></div></div>`).join('')
     : `<div class="card mut" style="text-align:center;font-size:13px">Dar nieko neišsaugojai.<br>
        Sukurk maršrutą ir spausk 💾</div>`);
}
window.openSheet = openSheet;
window.__place = (lat, lon) => {
  const p = db.places.find(x => x.lat === lat && x.lon === lon);
  closeSheet(); switchTo('map');
  map.setView([lat, lon], 15);
  if (!placesOn) { placesOn = true; el('btnPlaces').style.background = 'rgba(255,179,0,.9)'; drawPlaces(); }
  if (p) setTimeout(() => showPlace(p), 350);
};
window.__loadSaved = i => {
  const r = JSON.parse(localStorage.sturmanas_routes || '[]')[i];
  if (!r) return;
  layerRoute.clearLayers();
  L.polyline(r.pts, { color: '#ffb300', weight: 5 }).addTo(layerRoute);
  map.fitBounds(L.polyline(r.pts).getBounds(), { padding: [40, 40] });
  switchTo('map');
};

/* ── Smulkmenos ────────────────────────────────────────────────────────── */
function toast(msg) {
  let t = el('__toast');
  if (!t) { t = document.createElement('div'); t.id = '__toast';
    t.style.cssText = `position:fixed;left:50%;bottom:calc(74px + env(safe-area-inset-bottom));transform:translateX(-50%);
      background:#242938;color:#fff;padding:11px 18px;border-radius:12px;font-size:13.5px;font-weight:700;z-index:900;
      box-shadow:0 8px 30px rgba(0,0,0,.5);border:1px solid #333a4d;max-width:88vw;text-align:center`;
    document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = 1;
  clearTimeout(t.__h); t.__h = setTimeout(() => t.style.opacity = 0, 2600);
}
function busy(msg) {
  if (!msg) { el('routeOut').querySelector('.__busy')?.remove(); return; }
  el('routeOut').innerHTML = `<div class="card __busy" style="text-align:center">
    <div class="bar" style="margin:6px auto"><i style="width:60%;animation:none"></i></div>
    <div class="mut" style="font-size:13px;margin-top:8px">${msg}</div></div>`;
}
const tick = () => new Promise(r => setTimeout(r, 30));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
