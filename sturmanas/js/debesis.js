/* ══════════════════ ŠTURMANAS — DEBESIS ══════════════════
   Paskyros, draugų ratas, rezultatai, savos trasos.
   Savas mažas klientas vietoj bibliotekos iš CDN — appas turi
   veikti ir be ryšio (kaime jo dažnai nėra), o rezultatai
   išsiunčiami vėliau iš eilės.                              */

const URL_ = 'https://ezwsqwryfxoqbgfzdvuy.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6d3Nxd3J5ZnhvcWJnZnpkdnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNjQ4NzMsImV4cCI6MjEwMTg0MDg3M30.JX_YRhapFlK6ZYvBijRVxZo6ujucjM4-g74ycuD7eYA';

const SESIJA = 'sturm_sesija';
const EILE = 'sturm_eile';        // neišsiųsti rezultatai (be ryšio)

let ses = null;
try { ses = JSON.parse(localStorage.getItem(SESIJA) || 'null'); } catch {}

/** Kas prisijungęs (arba null). */
export function kas() { return ses && ses.user ? ses.user : null; }
export function prisijungęs() { return !!kas(); }

const klausytojai = [];
export function seka(fn) { klausytojai.push(fn); fn(kas()); }
function pranešk() { klausytojai.forEach(f => { try { f(kas()); } catch {} }); }

function įrašyk(s) {
  ses = s;
  if (s) localStorage.setItem(SESIJA, JSON.stringify(s));
  else localStorage.removeItem(SESIJA);
  pranešk();
}

/* ── Auth ─────────────────────────────────────────────────── */

async function authPost(kelias, kūnas) {
  const r = await fetch(`${URL_}/auth/v1/${kelias}`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(kūnas)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(klaidosTekstas(j, r.status));
  return j;
}

/** Supabase klaidas verčiam į žmogišką lietuvišką sakinį. */
function klaidosTekstas(j, kodas) {
  const m = (j.msg || j.message || j.error_description || j.error || '').toLowerCase();
  if (m.includes('invalid login')) return 'Neteisingas paštas arba slaptažodis';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Toks paštas jau užregistruotas — junkis';
  if (m.includes('password') && m.includes('6')) return 'Slaptažodis — bent 6 simboliai';
  if (m.includes('email') && m.includes('invalid')) return 'Netinkamas pašto adresas';
  if (m.includes('rate limit') || kodas === 429) return 'Per daug bandymų — palauk minutę';
  return j.msg || j.message || `Klaida (${kodas})`;
}

function išsaugokSesiją(j) {
  įrašyk({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    iki: Date.now() + (j.expires_in || 3600) * 1000,
    user: { id: j.user.id, email: j.user.email }
  });
}

export async function registruotis(paštas, slapt, vardas) {
  const j = await authPost('signup', {
    email: paštas.trim(), password: slapt,
    data: { vardas: (vardas || '').trim() || paštas.split('@')[0] }
  });
  if (!j.access_token) throw new Error('Patvirtink paštą ir junkis iš naujo');
  išsaugokSesiją(j);
  await profilis(vardas);          // vardas — kad draugai atpažintų
  return kas();
}

export async function jungtis(paštas, slapt) {
  const j = await authPost('token?grant_type=password', { email: paštas.trim(), password: slapt });
  išsaugokSesiją(j);
  return kas();
}

export function atsijungti() { įrašyk(null); }

/** Prieigos raktas galioja valandą — atnaujinam tyliai, prieš pat baigiantis. */
async function raktas() {
  if (!ses) return null;
  if (Date.now() < ses.iki - 60000) return ses.access_token;
  try {
    const j = await authPost('token?grant_type=refresh_token', { refresh_token: ses.refresh_token });
    išsaugokSesiją(j);
    return ses.access_token;
  } catch {
    įrašyk(null);                  // raktas nebegalioja — reikia jungtis iš naujo
    return null;
  }
}

/* ── REST ─────────────────────────────────────────────────── */

async function rest(kelias, opt = {}) {
  const t = await raktas();
  if (!t) throw new Error('Neprisijungta');
  const h = { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' };
  if (opt.prefer) h.Prefer = opt.prefer;
  const r = await fetch(`${URL_}/rest/v1/${kelias}`, { method: opt.method || 'GET', headers: h, body: opt.body });
  const tekstas = await r.text();
  const j = tekstas ? JSON.parse(tekstas) : null;
  if (!r.ok) throw new Error(klaidosTekstas(j || {}, r.status));
  return j;
}

const kūnas = o => JSON.stringify(o);

/* ── Profilis ─────────────────────────────────────────────── */

export async function profilis(vardas) {
  const u = kas(); if (!u) return null;
  if (vardas != null) {
    await rest('profiliai', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: kūnas({ id: u.id, vardas: vardas.trim().slice(0, 24) || 'Vairuotojas' })
    });
    return vardas;
  }
  const r = await rest(`profiliai?id=eq.${u.id}&select=vardas`);
  return r && r[0] ? r[0].vardas : null;
}

/* ── Draugų ratas ─────────────────────────────────────────── */

/** Kodas, kurį patogu perskaityti balsu ir įvesti telefone. */
function naujasKodas(priešdėlis) {
  const R = 'ACDEFGHJKLMNPQRTUVWXY34679';   // be panašių simbolių (O/0, I/1, S/5)
  // 5 simboliai ≈ 12 mln. derinių — atspėti neįmanoma, perskaityti balsu lengva
  let k = '';
  for (let i = 0; i < 5; i++) k += R[Math.floor(Math.random() * R.length)];
  return priešdėlis + '-' + k;
}

export async function sukurtiRatą(pavadinimas) {
  const u = kas(); if (!u) throw new Error('Neprisijungta');
  for (let bandymas = 0; bandymas < 5; bandymas++) {
    const kodas = naujasKodas('RALIS');
    try {
      const r = await rest('ratai', {
        method: 'POST', prefer: 'return=representation',
        body: kūnas({ kodas, pavadinimas: (pavadinimas || '').trim() || 'Mano ratas', savininkas: u.id })
      });
      const ratas = r[0];
      await rest('rato_nariai', { method: 'POST', prefer: 'return=minimal',
        body: kūnas({ ratas: ratas.id, vartotojas: u.id }) });
      return ratas;
    } catch (e) {
      if (!String(e.message).includes('duplicate') && bandymas === 4) throw e;   // kodas sutapo — bandom kitą
    }
  }
  throw new Error('Nepavyko sukurti rato');
}

export async function jungtisĮRatą(kodas) {
  const r = await rest('rpc/jungtis_i_rata', {
    method: 'POST', body: kūnas({ p_kodas: (kodas || '').trim().toUpperCase() })
  });
  if (!r || !r.length) throw new Error('Tokio rato nėra');
  return r[0];
}

export async function manoRatai() {
  return await rest('ratai?select=id,kodas,pavadinimas,savininkas&order=sukurta.asc');
}

export async function palikti(ratasId) {
  const u = kas();
  await rest(`rato_nariai?ratas=eq.${ratasId}&vartotojas=eq.${u.id}`, { method: 'DELETE' });
}

/** Rato draugai su vardais. */
export async function ratoNariai(ratasId) {
  const n = await rest(`rato_nariai?ratas=eq.${ratasId}&select=vartotojas`);
  if (!n.length) return [];
  const ids = n.map(x => x.vartotojas).join(',');
  return await rest(`profiliai?id=in.(${ids})&select=id,vardas`);
}

/* ── Rezultatai ───────────────────────────────────────────── */

/** Rezultatas į debesį. Be ryšio — į eilę, išsiųsim vėliau. */
export async function siųstiRezultatą(rec, trasosVardas) {
  const u = kas(); if (!u) return false;
  const eilutė = {
    vartotojas: u.id, trasa: rec.hash, trasos_vardas: (trasosVardas || '').slice(0, 60),
    km: rec.km, sek: rec.sek, vid_v: rec.vidV, maks_v: rec.maxV, sklandumas: rec.sklandumas
  };
  try {
    await rest('rezultatai', { method: 'POST', prefer: 'return=minimal', body: kūnas(eilutė) });
    return true;
  } catch {
    const e = JSON.parse(localStorage.getItem(EILE) || '[]');
    e.push(eilutė); localStorage.setItem(EILE, JSON.stringify(e.slice(-50)));
    return false;
  }
}

/** Grįžus ryšiui — išsiunčiam susikaupusius. */
export async function išsiųstiEilę() {
  const e = JSON.parse(localStorage.getItem(EILE) || '[]');
  if (!e.length || !kas()) return 0;
  try {
    await rest('rezultatai', { method: 'POST', prefer: 'return=minimal', body: kūnas(e) });
    localStorage.removeItem(EILE);
    return e.length;
  } catch { return 0; }
}
export function eilėsIlgis() { return JSON.parse(localStorage.getItem(EILE) || '[]').length; }

/**
 * Trasos lentelė: geriausias KIEKVIENO draugo laikas, greičiausias viršuje.
 * RLS pasirūpina, kad matytum tik savo rato žmones.
 */
export async function lentelė(hash) {
  const r = await rest(`rezultatai?trasa=eq.${encodeURIComponent(hash)}&select=vartotojas,sek,km,vid_v,maks_v,sklandumas,sukurta&order=sek.asc`);
  if (!r || !r.length) return [];
  const geriausi = new Map();
  for (const x of r) if (!geriausi.has(x.vartotojas)) geriausi.set(x.vartotojas, x);   // jau surikiuota pagal laiką
  const ids = [...geriausi.keys()].join(',');
  const prof = await rest(`profiliai?id=in.(${ids})&select=id,vardas`);
  const vardai = Object.fromEntries(prof.map(p => [p.id, p.vardas]));
  const mano = kas().id;
  return [...geriausi.values()].map((x, i) => ({
    vieta: i + 1, vardas: vardai[x.vartotojas] || 'Vairuotojas',
    aš: x.vartotojas === mano, sek: x.sek, vidV: x.vid_v, maksV: x.maks_v,
    sklandumas: x.sklandumas, data: x.sukurta
  }));
}

/* ── Savos trasos ─────────────────────────────────────────── */

export async function įkeltiTrasą(t) {
  const u = kas(); if (!u) throw new Error('Neprisijungta');
  const kodas = naujasKodas('TRASA');
  const r = await rest('trasos', {
    method: 'POST', prefer: 'return=representation',
    body: kūnas({
      kodas, savininkas: u.id, pavadinimas: (t.pavadinimas || 'Mano trasa').slice(0, 60),
      hash: t.hash, km: t.km, posukiu: t.posūkių, cpk: t.cpk, geometrija: t.geometrija,
      vieša: !!t.vieša
    })
  });
  return r[0];
}

export async function manoTrasos() {
  return await rest('trasos?select=id,kodas,pavadinimas,hash,km,posukiu,cpk,savininkas,vieša,sukurta&order=sukurta.desc&limit=100');
}

export async function trasaPagalKodą(kodas) {
  // Per funkciją, ne per lentelę: kodo žinojimas atrakina TĄ trasą ir nieko daugiau
  const r = await rest('rpc/trasa_pagal_koda', {
    method: 'POST', body: kūnas({ p_kodas: (kodas || '').trim().toUpperCase() })
  });
  if (!r || !r.length) throw new Error('Tokios trasos nėra (arba ji nepasidalinta)');
  return r[0];
}

export async function trintiTrasą(id) { await rest(`trasos?id=eq.${id}`, { method: 'DELETE' }); }
