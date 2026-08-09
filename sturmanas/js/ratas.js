/* ══════════════════ ŠTURMANAS — RATAS ══════════════════
   Paskyra · draugų ratas · laikų lentelė · savos trasos.
   Ekranas piešiamas iš naujo po kiekvieno veiksmo — būsenų
   mažai, tad paprasčiau ir saugiau nei taškinis atnaujinimas. */

import * as C from './debesis.js';
import { encodePolyline, decodePolyline } from './core.js';

let A = {};                 // ryšys su app.js (toast, esc, switchTo…)
let ratai = [], trasos = [], vardas = '';
let režimas = 'jungtis';    // 'jungtis' | 'nauja'
let klaida = '';
let dirba = false;

export function init(api) {
  A = api;
  C.seka(() => { piešk(); if (C.prisijungęs()) įkelk(); });
  // Grįžus ryšiui — išsiunčiam tai, kas laukė eilėje nuo važiavimo be signalo
  window.addEventListener('online', async () => {
    const n = await C.išsiųstiEilę();
    if (n) { A.toast(`Išsiųsti ${n} rezultatai`); piešk(); }
  });
  if (C.prisijungęs()) C.išsiųstiEilę();
  nuorodosSvečias();
}

/* ── Duomenys ─────────────────────────────────────────────── */

async function įkelk() {
  try {
    [vardas, ratai, trasos] = await Promise.all([
      C.profilis().catch(() => ''), C.manoRatai().catch(() => []), C.manoTrasos().catch(() => [])
    ]);
    // Vardai rodomi prie kiekvieno rato — kad matytum, kas jau prisijungė
    for (const r of ratai) r.nariai = await C.ratoNariai(r.id).catch(() => []);
  } catch (e) { klaida = e.message; }
  piešk();
}

/* ── Piešimas ─────────────────────────────────────────────── */

export function piešk() {
  const box = document.getElementById('ratasBody');
  if (!box) return;
  const u = C.kas();
  document.getElementById('ratasSub').textContent = u
    ? (vardas || u.email) : 'Lenktyniauk su draugais';
  const pill = document.getElementById('ratasPill');
  pill.style.display = u && ratai.length ? '' : 'none';
  if (u && ratai.length) pill.textContent = ratai.length === 1 ? '1 ratas' : ratai.length + ' ratai';

  box.innerHTML = u ? viduje() : lauke();
}

/* — Neprisijungus — */
function lauke() {
  const n = režimas === 'nauja';
  return `
  <div class="card">
    <h3>Kodėl paskyra</h3>
    <div class="hint">
      🏁 <b>Laikai</b> — kas greičiausiai įveikė tą pačią trasą.<br>
      👥 <b>Ratas</b> — matai tik savo draugų rezultatus, niekas kitas tavųjų nemato.<br>
      🔗 <b>Savos trasos</b> — sukuri, pasidalini kodu, važiuojat tą patį kelią.<br>
      📱 Pakeitus telefoną rezultatai lieka.
    </div>
  </div>
  <div class="card">
    <div class="seg" style="margin-bottom:12px">
      <button class="${n ? '' : 'on'}" onclick="window.__ratRež('jungtis')">Jungtis</button>
      <button class="${n ? 'on' : ''}" onclick="window.__ratRež('nauja')">Nauja paskyra</button>
    </div>
    ${n ? `<input class="fld" id="rVardas" placeholder="Tavo vardas (matys draugai)" autocomplete="nickname" maxlength="24">` : ''}
    <input class="fld" id="rPaštas" type="email" placeholder="El. paštas" autocomplete="email"
      autocapitalize="off" spellcheck="false" inputmode="email">
    <input class="fld" id="rSlapt" type="password" placeholder="Slaptažodis${n ? ' (bent 6 simboliai)' : ''}"
      autocomplete="${n ? 'new-password' : 'current-password'}">
    ${klaida ? `<div class="err">${A.esc(klaida)}</div>` : ''}
    <button class="btn pri" onclick="window.__ratAuth()" ${dirba ? 'disabled' : ''}>
      ${dirba ? 'Palauk…' : n ? 'Susikurti paskyrą' : 'Prisijungti'}</button>
    <div class="hint" style="margin-top:10px;text-align:center">
      Paštas naudojamas tik prisijungimui. Važiavimo maršrutai lieka telefone —
      į debesį keliauja tik laikas ir trasos ID.</div>
  </div>`;
}

/* — Prisijungus — */
function viduje() {
  const u = C.kas();
  const eilė = C.eilėsIlgis();
  return `
  <div class="card">
    <h3>Profilis</h3>
    <input class="fld" id="rVardas2" value="${A.esc(vardas || '')}" maxlength="24" placeholder="Vardas">
    <div class="row" style="gap:8px">
      <button class="btn sm" onclick="window.__ratVardas()">Išsaugoti vardą</button>
      <button class="btn sm gost" style="margin-left:auto" onclick="window.__ratIšeiti()">Atsijungti</button>
    </div>
    <div class="hint" style="margin-top:9px">${A.esc(u.email)}</div>
    ${eilė ? `<div class="hint" style="color:var(--s4);margin-top:6px">
      ⏳ ${eilė} rezultat${eilė === 1 ? 'as laukia' : 'ai laukia'} išsiuntimo (nėra ryšio)</div>` : ''}
  </div>

  <div class="card">
    <h3>Draugų ratai</h3>
    ${ratai.length ? ratai.map(r => `
      <div class="rat">
        <div class="row">
          <div style="min-width:0;flex:1">
            <div class="nm">${A.esc(r.pavadinimas)}</div>
            <div class="who">${r.nariai && r.nariai.length
              ? r.nariai.map(x => A.esc(x.vardas)).join(' · ')
              : 'Tik tu — pakviesk draugų'}</div>
          </div>
          <div class="kodas">${r.kodas}</div>
        </div>
        <div class="row" style="gap:7px;margin-top:11px">
          <button class="btn sm" onclick="window.__ratKviesk('${r.kodas}','${jsStr(r.pavadinimas)}')">🔗 Pakviesti</button>
          <button class="btn sm gost" style="margin-left:auto"
            onclick="window.__ratPalik('${r.id}','${jsStr(r.pavadinimas)}')">Išeiti</button>
        </div>
      </div>`).join('')
    : `<div class="hint" style="margin-bottom:12px">Dar nesi jokiame rate. Sukurk savo arba įvesk draugo kodą.</div>`}
    <input class="fld" id="rNaujas" placeholder="Naujo rato pavadinimas" maxlength="40">
    <button class="btn" onclick="window.__ratKurk()">＋ Sukurti ratą</button>
    <div style="height:10px"></div>
    <input class="fld" id="rKodas" placeholder="RALIS-XXXXX" maxlength="11"
      autocapitalize="characters" spellcheck="false" style="text-transform:uppercase">
    <button class="btn" onclick="window.__ratJunk()">Jungtis pagal kodą</button>
  </div>

  <div class="card">
    <h3>Trasos</h3>
    ${trasos.length ? trasos.map(t => `
      <div class="rat" onclick="window.__ratLentelė('${t.hash}','${jsStr(t.pavadinimas)}')" style="cursor:pointer">
        <div class="row">
          <div style="min-width:0;flex:1">
            <div class="nm">${A.esc(t.pavadinimas)}</div>
            <div class="who">${(+t.km).toFixed(1)} km · ${t.posukiu || 0} posūkių${
              t.savininkas === C.kas().id ? '' : ' · draugo'}</div>
          </div>
          <div class="kodas" style="font-size:14px">${t.kodas}</div>
        </div>
        <div class="row" style="gap:7px;margin-top:11px">
          <button class="btn sm" onclick="event.stopPropagation();window.__ratTrasąDalink('${t.kodas}','${jsStr(t.pavadinimas)}')">🔗 Dalintis</button>
          <button class="btn sm" onclick="event.stopPropagation();window.__ratTrasąAtverk('${t.id}')">Žemėlapyje</button>
          ${t.savininkas === C.kas().id
            ? `<button class="btn sm gost" style="margin-left:auto"
                 onclick="event.stopPropagation();window.__ratTrasąTrink('${t.id}')">🗑</button>` : ''}
        </div>
      </div>`).join('')
    : `<div class="hint" style="margin-bottom:12px">
        Trasų dar nėra. Sukurk maršrutą, eik į <b>Važiuoti</b> ir spausk
        „🔗 Dalintis trasa" — ji atsiras čia su kodu draugams.</div>`}
    <input class="fld" id="rTrasKodas" placeholder="TRASA-XXXXX" maxlength="11"
      autocapitalize="characters" spellcheck="false" style="text-transform:uppercase">
    <button class="btn" onclick="window.__ratTrasąImk()">Įkelti draugo trasą</button>
  </div>`;
}

/* ── Veiksmai ─────────────────────────────────────────────── */

/* Tekstas, keliaujantis į onclick="…('tekstas')" — saugus ir JS, ir HTML. */
const jsStr = s => String(s || '')
  .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const v = id => (document.getElementById(id) || {}).value || '';

window.__ratRež = r => { režimas = r; klaida = ''; piešk(); };

window.__ratAuth = async () => {
  if (dirba) return;
  // Laukelius nuskaitom PRIEŠ perpiešimą — piešk() juos sukuria iš naujo ir ištuština
  const p = v('rPaštas').trim(), s = v('rSlapt'), vrd = v('rVardas').trim();
  if (!p || !s) { klaida = 'Įvesk paštą ir slaptažodį'; return piešk(); }
  dirba = true; klaida = ''; piešk();
  try {
    if (režimas === 'nauja') await C.registruotis(p, s, vrd);
    else await C.jungtis(p, s);
    A.toast('Sveikas, ' + (vrd || p.split('@')[0]) + '!');
    await C.išsiųstiEilę();
    await įkelk();                           // kad iškart matytum tikrą vardą ir ratus
    laukiantisRatas();                       // jei atėjai per pakvietimo nuorodą
  } catch (e) { klaida = e.message; }
  dirba = false; piešk();
};

window.__ratIšeiti = () => {
  C.atsijungti();
  ratai = []; trasos = []; vardas = ''; klaida = '';
  A.toast('Atsijungei — rezultatai lieka telefone');
  piešk();
};

window.__ratVardas = async () => {
  try { vardas = await C.profilis(v('rVardas2')); A.toast('Vardas išsaugotas'); piešk(); }
  catch (e) { A.toast(e.message); }
};

window.__ratKurk = async () => {
  try {
    const r = await C.sukurtiRatą(v('rNaujas'));
    A.toast('Ratas sukurtas · kodas ' + r.kodas);
    await įkelk();
  } catch (e) { A.toast(e.message); }
};

window.__ratJunk = async () => {
  const k = v('rKodas').trim();
  if (!k) return;
  try { const r = await C.jungtisĮRatą(k); A.toast('Prisijungei: ' + r.pavadinimas); await įkelk(); }
  catch (e) { A.toast(e.message); }
};

window.__ratPalik = async (id, pav) => {
  if (!confirm(`Išeiti iš rato „${pav}"?\nDraugų laikų nebematysi.`)) return;
  try { await C.palikti(id); await įkelk(); } catch (e) { A.toast(e.message); }
};

window.__ratKviesk = (kodas, pav) => dalinkis(
  `Prisijunk prie mano ralio rato „${pav}" — kodas ${kodas}`,
  nuoroda('ratas', kodas));

window.__ratTrasąDalink = (kodas, pav) => dalinkis(
  `Trasa „${pav}" — pažiūrim, kas greičiau. Kodas ${kodas}`,
  nuoroda('trasa', kodas));

/* Trasos lentelė — kas greičiausias. Rodoma lakšte. */
window.__ratLentelė = async (hash, pav) => {
  window.openSheet(`<h2 style="margin:2px 0 10px;font-size:19px">${A.esc(pav)}</h2>
    <div class="hint">Kraunami laikai…</div>`);
  try {
    const l = await C.lentelė(hash);
    window.openSheet(`<h2 style="margin:2px 0 4px;font-size:19px">${A.esc(pav)}</h2>
      <div class="hint" style="margin-bottom:10px">Geriausias kiekvieno laikas</div>` + lentelėHTML(l));
  } catch (e) {
    window.openSheet(`<h2 style="margin:2px 0 10px;font-size:19px">${A.esc(pav)}</h2>
      <div class="err">${A.esc(e.message)}</div>`);
  }
};

window.__ratTrasąAtverk = async id => {
  const t = trasos.find(x => x.id === id);
  if (!t) return;
  A.rodytiTrasą(decodePolyline(t.geometrija), t.pavadinimas, t.hash);
};

window.__ratTrasąTrink = async id => {
  if (!confirm('Ištrinti šią trasą? Laikai liks.')) return;
  try { await C.trintiTrasą(id); await įkelk(); } catch (e) { A.toast(e.message); }
};

window.__ratTrasąImk = async () => {
  const k = v('rTrasKodas').trim();
  if (!k) return;
  try {
    const t = await C.trasaPagalKodą(k);
    A.toast('Trasa „' + t.pavadinimas + '" atidaryta');
    A.rodytiTrasą(decodePolyline(t.geometrija), t.pavadinimas, t.hash);
    įkelk();
  } catch (e) { A.toast(e.message); }
};

/* ── Trasos įkėlimas iš „Važiuoti" ekrano ─────────────────── */

/** Dabartinį maršrutą paverčiam bendrinama trasa. */
export async function dalinkTrasą(r) {
  if (!C.prisijungęs()) {
    A.toast('Pirma susikurk paskyrą — skiltis „Ratas"');
    return A.switchTo('ratas');
  }
  const siūlomas = (r.roads || []).slice(0, 2).join(' → ') || 'Mano trasa';
  const pav = prompt('Trasos pavadinimas:', siūlomas);
  if (pav === null) return;
  try {
    const t = await C.įkeltiTrasą({
      pavadinimas: pav || siūlomas, hash: A.routeHash(r), km: +r.km.toFixed(1),
      posūkių: r.corners.length, cpk: +(r.cornersPerKm || 0).toFixed(1),
      // Kas trečias taškas — formai užtenka, o eilutė lieka trumpa
      geometrija: encodePolyline(r.pts.filter((_, i) => i % 3 === 0)),
      vieša: true
    });
    A.toast('Trasa įkelta · kodas ' + t.kodas);
    dalinkis(`Trasa „${t.pavadinimas}" — pažiūrim, kas greičiau. Kodas ${t.kodas}`, nuoroda('trasa', t.kodas));
    įkelk();
  } catch (e) { A.toast(e.message); }
}

/* ── Lentelė peržiūroje ───────────────────────────────────── */

export function lentelėHTML(l) {
  if (!l || !l.length) return '<div class="hint">Šios trasos dar niekas neįveikė.</div>';
  const lyderis = l[0].sek;
  const M = ['', 'au', 'si', 'br'];
  return '<div class="lent">' + l.map(x => `
    <div class="le${x.aš ? ' man' : ''}">
      <div class="vt ${M[x.vieta] || ''}">${x.vieta}</div>
      <div class="nm">${A.esc(x.vardas)}${x.aš ? ' <span style="color:var(--amber)">(tu)</span>' : ''}</div>
      <div class="lk num">${sek(x.sek)}</div>
      <div class="dl num">${x.vieta === 1 ? `${x.maksV || 0} km/h` : '+' + sek(x.sek - lyderis)}</div>
    </div>`).join('') + '</div>';
}

/** Trasos lentelė į „Važiuoti" peržiūrą (tyliai — be ryšio tiesiog nerodoma). */
export async function lentelėĮPeržiūrą(hash) {
  const box = document.getElementById('pvLent');
  if (!box) return;
  if (!C.prisijungęs() || !ratai.length) { box.innerHTML = ''; return; }
  try {
    const l = await C.lentelė(hash);
    // Rodom, jei yra bent vienas draugo laikas — savasis jau matyti legendoje
    box.innerHTML = l.some(x => !x.aš)
      ? `<div class="hint" style="margin:2px 0 6px">Laikai šioje trasoje</div>` + lentelėHTML(l)
      : '';
  } catch { box.innerHTML = ''; }
}

/** Po finišo — rezultatas į debesį. */
export async function siųsk(rec, pavadinimas) {
  if (!C.prisijungęs()) return;
  const ok = await C.siųstiRezultatą(rec, pavadinimas);
  if (!ok) A.toast('Nėra ryšio — laikas išsiųstas bus vėliau');
}

export const prisijungęs = () => C.prisijungęs();

/* ── Nuorodos ir dalijimasis ──────────────────────────────── */

const nuoroda = (tipas, kodas) =>
  location.origin + location.pathname + '?' + tipas + '=' + encodeURIComponent(kodas);

async function dalinkis(tekstas, url) {
  try {
    if (navigator.share) return await navigator.share({ title: 'Šturmanas', text: tekstas, url });
  } catch { return; }                          // vartotojas atšaukė — tylim
  try { await navigator.clipboard.writeText(tekstas + '\n' + url); A.toast('Nuoroda nukopijuota'); }
  catch { prompt('Nukopijuok ir nusiųsk draugui:', url); }
}

/* Atėjus per pakvietimo nuorodą: kodą įsimenam, panaudojam po prisijungimo. */
function nuorodosSvečias() {
  const p = new URLSearchParams(location.search);
  const r = p.get('ratas'), t = p.get('trasa');
  if (r) sessionStorage.setItem('sturm_kvietimas', r);
  if (t) sessionStorage.setItem('sturm_trasa', t);
  if (r || t) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => { A.switchTo('ratas'); laukiantisRatas(); }, 900);
  }
}

async function laukiantisRatas() {
  if (!C.prisijungęs()) {
    if (sessionStorage.getItem('sturm_kvietimas')) A.toast('Susikurk paskyrą — ir būsi rate');
    return;
  }
  const k = sessionStorage.getItem('sturm_kvietimas');
  const t = sessionStorage.getItem('sturm_trasa');
  if (k) {
    sessionStorage.removeItem('sturm_kvietimas');
    try { const r = await C.jungtisĮRatą(k); A.toast('Prisijungei: ' + r.pavadinimas); } catch (e) { A.toast(e.message); }
  }
  if (t) {
    sessionStorage.removeItem('sturm_trasa');
    try {
      const tr = await C.trasaPagalKodą(t);
      A.toast('Trasa „' + tr.pavadinimas + '" atidaryta');
      A.rodytiTrasą(decodePolyline(tr.geometrija), tr.pavadinimas, tr.hash);
    } catch (e) { A.toast(e.message); }
  }
  if (k || t) įkelk();
}

const sek = s => {
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
};
