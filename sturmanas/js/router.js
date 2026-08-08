/* Šturmanas · maršrutų variklis — A* su „linksmumo" kaina.
   Veikia visiškai telefone: jokių API raktų, veikia ir be interneto. */
'use strict';
import { dist, decodePolyline } from './core.js';

/** Režimai: kiek kelio „linksmumas" nusveria atstumą. */
export const MODES = {
  fun:   { label: 'Vingiuotas',  curveBonus: 0.60, bump: 260, cam: 120, stop: 55,
           surf: { paved: 1, unknown: 1.5, cobble: 2.4, unpaved: 3.4 },
           cls:  { motorway: 3.0, trunk: 1.7, primary: 1.15, secondary: 0.92,
                   tertiary: 0.9, unclassified: 1.0, residential: 1.7, living_street: 3 } },
  fast:  { label: 'Greičiausias', curveBonus: 0.0, bump: 60, cam: 0, stop: 25,
           surf: { paved: 1, unknown: 1.2, cobble: 1.8, unpaved: 2.2 },
           cls:  { motorway: 0.55, trunk: 0.65, primary: 0.8, secondary: 0.95,
                   tertiary: 1.05, unclassified: 1.25, residential: 1.6, living_street: 2.5 } },
  scenic:{ label: 'Vaizdingas',  curveBonus: 0.42, bump: 180, cam: 90, stop: 45,
           surf: { paved: 1, unknown: 1.1, cobble: 1.3, unpaved: 1.35 },
           cls:  { motorway: 4.0, trunk: 2.2, primary: 1.3, secondary: 0.95,
                   tertiary: 0.85, unclassified: 0.8, residential: 1.5, living_street: 2.5 } },
};

export class Router {
  constructor(db) { this.db = db; this.ready = false; }

  async load() {
    const g = await (await fetch('data/graph.json')).json();
    this.nodes = g.nodes;                       // [[lat,lon],…]
    this.edges = g.edges.map(e => ({
      w: e[0], a: e[1], b: e[2], i0: e[3], i1: e[4],
      len: e[5], curv: e[6], nb: e[7], ncam: e[8], nstop: e[9],
    }));
    this.adj = new Map();
    this.edges.forEach((e, idx) => {
      const w = this.db.ways[e.w];
      if (!this.adj.has(e.a)) this.adj.set(e.a, []);
      this.adj.get(e.a).push([e.b, idx, true]);
      if (!w.oneway) {
        if (!this.adj.has(e.b)) this.adj.set(e.b, []);
        this.adj.get(e.b).push([e.a, idx, false]);
      }
    });
    // mazgų tinklelis artimiausiam radimui
    this.ncell = 0.01;
    this.ngrid = new Map();
    this.nodes.forEach(([lat, lon], i) => {
      const k = Math.floor(lat / this.ncell) + ':' + Math.floor(lon / this.ncell);
      if (!this.ngrid.has(k)) this.ngrid.set(k, []);
      this.ngrid.get(k).push(i);
    });
    this.ready = true;
    return this;
  }

  nearestNode(lat, lon) {
    let best = -1, bd = Infinity;
    for (let ring = 0; ring <= 4 && best < 0; ring++) {
      const ci = Math.floor(lat / this.ncell), cj = Math.floor(lon / this.ncell);
      for (let i = -ring; i <= ring; i++)
        for (let j = -ring; j <= ring; j++) {
          if (ring > 0 && Math.abs(i) !== ring && Math.abs(j) !== ring) continue;
          for (const n of (this.ngrid.get((ci + i) + ':' + (cj + j)) || [])) {
            const d = dist(lat, lon, this.nodes[n][0], this.nodes[n][1]);
            if (d < bd) { bd = d; best = n; }
          }
        }
    }
    return best;
  }

  /** Briaunos kaina metrais („jaučiamas" ilgis). */
  cost(e, M, penalty) {
    const w = this.db.ways[e.w];
    if (this.pavedOnly && (w.surf === 'unpaved' || w.surf === 'cobble')) return 1e7;
    const q = Math.min(1, e.curv / Math.max(e.len, 1));       // 0 tiesė … 1 labai vingiuota
    let c = e.len * (1 - M.curveBonus * q);
    c *= (M.surf[w.surf] || 1.3);
    c *= (M.cls[w.hw.replace('_link', '')] || 1.1);
    c += e.nb * M.bump + e.ncam * M.cam + e.nstop * M.stop;
    if (penalty && penalty.has(e.w)) c *= 3.2;                 // vengti kartotis (kilpoms)
    return Math.max(5, c);
  }

  /** A* tarp mazgų. Grąžina {edges:[…], nodes:[…]} arba null. */
  search(startN, goalN, mode = 'fun', penalty = null, maxExpand = 220000) {
    const M = MODES[mode] || MODES.fun;
    const [glat, glon] = this.nodes[goalN];
    const h = n => dist(this.nodes[n][0], this.nodes[n][1], glat, glon) * (1 - M.curveBonus) * 0.88;
    const g = new Map([[startN, 0]]);
    const from = new Map();
    const seen = new Set();
    // ── dvejetainė krūva (be jos A* dideliame grafe būtų O(n²)) ──
    const hk = [], hv = [];                     // prioritetai / mazgai
    const push = (p, n) => {
      hk.push(p); hv.push(n);
      let i = hk.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1;
        if (hk[par] <= hk[i]) break;
        [hk[par], hk[i]] = [hk[i], hk[par]]; [hv[par], hv[i]] = [hv[i], hv[par]]; i = par;
      }
    };
    const pop = () => {
      const top = hv[0];
      const lk = hk.pop(), lv = hv.pop();
      if (hk.length) {
        hk[0] = lk; hv[0] = lv;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let s = i;
          if (l < hk.length && hk[l] < hk[s]) s = l;
          if (r < hk.length && hk[r] < hk[s]) s = r;
          if (s === i) break;
          [hk[s], hk[i]] = [hk[i], hk[s]]; [hv[s], hv[i]] = [hv[i], hv[s]]; i = s;
        }
      }
      return top;
    };
    push(h(startN), startN);
    let expanded = 0;
    while (hk.length) {
      const cur = pop();
      if (cur === goalN) break;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (++expanded > maxExpand) break;
      for (const [nb, ei, dirFwd] of (this.adj.get(cur) || [])) {
        const nc = g.get(cur) + this.cost(this.edges[ei], M, penalty);
        if (nc < (g.get(nb) ?? Infinity)) {
          g.set(nb, nc); from.set(nb, [cur, ei, dirFwd]);
          push(nc + h(nb), nb);
        }
      }
    }
    if (!from.has(goalN) && startN !== goalN) return null;
    const path = [];
    let cur = goalN;
    while (cur !== startN) {
      const p = from.get(cur);
      if (!p) return null;
      path.unshift({ edge: this.edges[p[1]], fwd: p[2], from: p[0], to: cur });
      cur = p[0];
    }
    return path;
  }

  /** Maršrutas tarp koordinačių. */
  route(fromLat, fromLon, toLat, toLon, mode = 'fun', pavedOnly = false) {
    this.pavedOnly = pavedOnly;
    const a = this.nearestNode(fromLat, fromLon), b = this.nearestNode(toLat, toLon);
    if (a < 0 || b < 0 || a === b) return null;
    const path = this.search(a, b, mode);
    return path ? this.describe(path, mode) : null;
  }

  /**
   * Maršrutas per kelis taškus iš eilės (vaizdingiems maršrutams).
   * @param {Array<[lat,lon]>} pts — taškai eilės tvarka
   */
  routeVia(pts, mode = 'scenic', pavedOnly = false) {
    this.pavedOnly = pavedOnly;
    const nodes = pts.map(p => this.nearestNode(p[0], p[1])).filter(n => n >= 0);
    if (nodes.length < 2) return null;
    const full = [];
    const used = new Set();
    for (let i = 0; i < nodes.length - 1; i++) {
      if (nodes[i] === nodes[i + 1]) continue;
      const seg = this.search(nodes[i], nodes[i + 1], mode, used);
      if (!seg) continue;                       // praleidžiam nepasiekiamą tarpą
      seg.forEach(s => used.add(s.edge.w));
      full.push(...seg);
    }
    return full.length ? this.describe(full, mode) : null;
  }

  /**
   * Kilpa: išvažiuoji ir grįžti į tą pačią vietą, ~targetKm.
   * Renkam tolimą tašką ant gero kelio, važiuojam per jį ir grįžtam kitu keliu.
   */
  loop(lat, lon, targetKm = 60, mode = 'fun', pavedOnly = false) {
    this.pavedOnly = pavedOnly;
    const start = this.nearestNode(lat, lon);
    if (start < 0) return null;
    const reach = targetKm * 1000 / 3.1;
    // kandidatai: geri keliai tinkamu atstumu, įvairiomis kryptimis
    const cands = [];
    for (const r of (this.db.best || [])) {
      const w = this.db.ways[r.ways[0]];
      if (!w) continue;
      const p = w.pts[Math.floor(w.pts.length / 2)];
      const d = dist(lat, lon, p[0], p[1]);
      if (d > reach * 0.55 && d < reach * 1.5)
        cands.push({ lat: p[0], lon: p[1], score: r.score, d,
                     bear: Math.atan2(p[1] - lon, p[0] - lat) });
    }
    if (!cands.length) return null;
    // po geriausią kandidatą kiekvienam iš 8 krypčių sektorių — kilpa apims skirtingas puses
    const sector = new Map();
    for (const c of cands) {
      const s = Math.floor(((c.bear + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4));
      if (!sector.has(s) || sector.get(s).score < c.score) sector.set(s, c);
    }
    const top = [...sector.values()].sort((x, y) => y.score - x.score);
    let best = null, tried = 0;
    outer:
    for (let i = 0; i < top.length; i++) {
      const n1 = this.nearestNode(top[i].lat, top[i].lon);
      if (n1 < 0 || n1 === start) continue;
      const p1 = this.search(start, n1, mode);
      if (!p1) continue;
      for (let j = 0; j < top.length; j++) {
        if (i === j) continue;
        let da = Math.abs(top[i].bear - top[j].bear);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (da < 1.1) continue;                     // priešinga pusė = tikra kilpa
        const n2 = this.nearestNode(top[j].lat, top[j].lon);
        if (n2 < 0 || n2 === n1) continue;
        const used = new Set(p1.map(s => s.edge.w));
        const p2 = this.search(n1, n2, mode, used);
        if (!p2) continue;
        p2.forEach(s => used.add(s.edge.w));
        const p3 = this.search(n2, start, mode, used);
        if (!p3) continue;
        const full = [...p1, ...p2, ...p3];
        const L = full.reduce((s, x) => s + x.edge.len, 0);
        const km = L / 1000;
        const err = Math.abs(km - targetKm) / targetKm;
        const curv = full.reduce((s, x) => s + x.edge.curv, 0) / Math.max(1, L) * 1000;
        const sc = curv * (1 - Math.min(0.9, err * 1.5));
        if (km > targetKm * 0.5 && km < targetKm * 1.8 && (!best || sc > best.sc))
          best = { sc, path: full };
        if (++tried >= 9 || (best && best.sc > 320 && err < 0.3)) break outer;
      }
    }
    return best ? this.describe(best.path, mode) : null;
  }

  /** Iš kelio atkarpų sudaro pilną maršruto aprašą su geometrija ir suvestine.
   *  SVARBU: kiekvienam posūkiui/pavojui apskaičiuojam TIKSLŲ atstumą nuo maršruto
   *  pradžios (`at`) — be to šturmanas nežinotų, kada kviesti. */
  describe(path, mode) {
    const pts = [], corners = [], hazards = [], legs = [];
    let len = 0, curv = 0, timeMin = 0, paved = 0;
    const sev = {}; const seenName = [];
    for (const step of path) {
      const e = step.edge, w = this.db.ways[e.w];
      const idx = [];                            // sub[k] atitinka kelio tašką idx[k]
      for (let k = e.i0; k <= e.i1; k++) idx.push(k);
      let sub = w.pts.slice(e.i0, e.i1 + 1);
      if (!step.fwd) { sub = sub.slice().reverse(); idx.reverse(); }
      const cs = w.corners.filter(c => c.i >= e.i0 && c.i <= e.i1);
      const hz = w.haz.filter(hh => hh.i >= e.i0 && hh.i <= e.i1);
      // sujungiam be dubliavimo
      let drop = 0;
      if (pts.length && dist(pts[pts.length - 1][0], pts[pts.length - 1][1], sub[0][0], sub[0][1]) < 3) drop = 1;
      const startLen = len;                      // maršruto ilgis iki šios atkarpos
      const posOf = new Map();                   // kelio taško nr. -> atstumas maršrute
      let run = startLen;
      for (let k = 0; k < sub.length; k++) {
        if (k > 0) run += dist(sub[k - 1][0], sub[k - 1][1], sub[k][0], sub[k][1]);
        posOf.set(idx[k], run);
        if (k >= drop) pts.push(sub[k]);
      }
      for (const c of cs) { corners.push({ ...c, at: posOf.get(c.i) ?? startLen }); sev[c.sev] = (sev[c.sev] || 0) + 1; }
      for (const hh of hz) hazards.push({ ...hh, at: posOf.get(hh.i) ?? startLen });
      len = run;
      curv += e.curv;
      if (w.surf === 'paved') paved += e.len;
      timeMin += (e.len / 1000) / Math.max(20, w.speed * (w.surf === 'paved' ? 1 : 0.65)) * 60
                 + e.nb * 0.12 + e.nstop * 0.08;
      const nm = w.name || w.ref;
      if (nm && seenName[seenName.length - 1] !== nm) seenName.push(nm);
      legs.push({ way: w.id, len: e.len, name: nm, at: startLen, surf: w.surf, speed: w.speed });
    }
    corners.sort((a, b) => a.at - b.at);
    hazards.sort((a, b) => a.at - b.at);
    return {
      mode, pts, corners, hazards, legs,
      km: len / 1000, timeMin,
      // curvPerKm — vidinis vingiuotumo matas (0–1000‰), naudojamas variantams rikiuoti.
      // Rodyti vartotojui reikia cornersPerKm — TIKRAS posūkių tankis (kaip Rods).
      curvPerKm: len ? curv / len * 1000 : 0,
      cornersPerKm: len ? corners.length / (len / 1000) : 0,
      pavedPct: len ? Math.round(paved / len * 100) : 0,
      bumps: hazards.filter(h => h.kind === 'bump').length,
      cams: hazards.filter(h => h.kind === 'camera').length,
      stops: hazards.filter(h => ['stop', 'giveway', 'railway'].includes(h.kind)).length,
      sev, tight: (sev[1] || 0) + (sev[2] || 0) + (sev[3] || 0),
      roads: seenName.slice(0, 8),
    };
  }
}
