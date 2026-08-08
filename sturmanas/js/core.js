/* Šturmanas · branduolys — duomenys, geometrija, erdvinis indeksas, GPS prilipdymas */
'use strict';

export const SEV_NAME = { 1: 'plaukų segtukas', 2: 'labai aštrus', 3: 'aštrus', 4: 'vidutinis', 5: 'greitas', 6: 'lengvas' };
export const SEV_COLOR = { 1: '#ff2d55', 2: '#ff5e3a', 3: '#ff9500', 4: '#ffcc00', 5: '#8ee000', 6: '#34c759' };
export const HAZ = ['bump', 'camera', 'railway', 'stop', 'giveway', 'rumble'];
export const HAZ_LT = { bump: 'greičio kalnelis', camera: 'greičio kamera', railway: 'pervaža', stop: 'STOP', giveway: 'duoti kelią', rumble: 'grubus ruožas' };
export const HAZ_ICON = { bump: '🛑', camera: '📷', railway: '🚂', stop: '✋', giveway: '⚠️', rumble: '〰️' };
export const SURF_LT = { paved: 'asfaltas', unpaved: 'žvyras', cobble: 'grindinys', unknown: 'nežinoma' };

/* ── Geometrija ─────────────────────────────────────────────────────────── */
export const R_EARTH = 6371000;
export const rad = d => d * Math.PI / 180;
export const deg = r => r * 180 / Math.PI;

/** Atstumas metrais (pakankamai tikslus mūsų regionui). */
export function dist(aLat, aLon, bLat, bLon) {
  const kx = 111320 * Math.cos(rad((aLat + bLat) / 2));
  return Math.hypot((bLon - aLon) * kx, (bLat - aLat) * 110574);
}

/** Azimutas laipsniais (0 = šiaurė, 90 = rytai). */
export function bearing(aLat, aLon, bLat, bLon) {
  const y = Math.sin(rad(bLon - aLon)) * Math.cos(rad(bLat));
  const x = Math.cos(rad(aLat)) * Math.sin(rad(bLat)) -
            Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLon - aLon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Mažiausias skirtumas tarp dviejų azimutų (−180..180). */
export function angleDiff(a, b) { let d = ((b - a + 540) % 360) - 180; return d; }

/** Google polyline dekodavimas. */
export function decodePolyline(str, precision = 5) {
  const factor = Math.pow(10, precision);
  let index = 0, lat = 0, lon = 0;
  const out = [];
  while (index < str.length) {
    let shift = 0, result = 0, byte;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lon += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([lat / factor, lon / factor]);
  }
  return out;
}

/* ── Duomenų bazė ───────────────────────────────────────────────────────── */
export class RoadDB {
  constructor() { this.ways = []; this.grid = new Map(); this.cell = 0.005; /* ~450 m */ }

  async load(onProgress) {
    onProgress && onProgress('Kraunami keliai…');
    const roads = await (await fetch('data/roads.json')).json();
    this.bbox = roads.bbox;
    onProgress && onProgress('Iškoduojama geometrija…');
    this.ways = roads.ways.map((w, id) => ({
      id, name: w.n, ref: w.r, hw: w.h, surf: w.s, speed: w.v, oneway: !!w.o,
      len: w.L, curv: w.c, pts: decodePolyline(w.g),
      corners: w.k.map(k => ({ i: k[0], dir: k[1] ? 'L' : 'R', sev: k[2], r: k[3],
                               len: k[4], ang: k[5], v: k[6],
                               shape: ['', 'tightens', 'opens'][k[7]] })),
      haz: w.z.map(z => ({ i: z[0], kind: HAZ[z[1]] })),
    }));
    onProgress && onProgress('Statomas indeksas…');
    this.buildIndex();
    onProgress && onProgress('Kraunami maršrutų duomenys…');
    try {
      this.best = await (await fetch('data/best.json')).json();
    } catch (e) { this.best = []; }
    return this;
  }

  /** Erdvinis tinklelis: kiekvienam kelio taškui — langelis. */
  buildIndex() {
    this.grid.clear();
    for (const w of this.ways) {
      for (let i = 0; i < w.pts.length; i++) {
        const key = this.key(w.pts[i][0], w.pts[i][1]);
        let a = this.grid.get(key);
        if (!a) { a = []; this.grid.set(key, a); }
        const last = a[a.length - 1];
        if (!last || last[0] !== w.id) a.push([w.id, i]);
      }
    }
  }
  key(lat, lon) { return Math.floor(lat / this.cell) + ':' + Math.floor(lon / this.cell); }

  /** Keliai netoli taško (langelių kaimynystėje). */
  nearbyWays(lat, lon, ring = 1) {
    const ci = Math.floor(lat / this.cell), cj = Math.floor(lon / this.cell);
    const seen = new Set();
    for (let i = -ring; i <= ring; i++)
      for (let j = -ring; j <= ring; j++) {
        const a = this.grid.get((ci + i) + ':' + (cj + j));
        if (a) for (const [wid] of a) seen.add(wid);
      }
    return [...seen].map(id => this.ways[id]);
  }

  /**
   * GPS „prilipdymas" prie kelio. Su kryptimi renkasi tą kelią, kuris sutampa
   * su judėjimo kryptimi — todėl lygiagretūs keliai nesupainiojami.
   * @returns {{way, i, t, lat, lon, d, forward}|null}
   */
  snap(lat, lon, heading = null, maxDist = 60) {
    let best = null;
    for (const w of this.nearbyWays(lat, lon)) {
      for (let i = 0; i < w.pts.length - 1; i++) {
        const [aLat, aLon] = w.pts[i], [bLat, bLon] = w.pts[i + 1];
        const kx = 111320 * Math.cos(rad(lat));
        const ax = (aLon - lon) * kx, ay = (aLat - lat) * 110574;
        const bx = (bLon - lon) * kx, by = (bLat - lat) * 110574;
        const dx = bx - ax, dy = by - ay;
        const L2 = dx * dx + dy * dy;
        if (L2 < 1e-6) continue;
        let t = -(ax * dx + ay * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        const px = ax + t * dx, py = ay + t * dy;
        const d = Math.hypot(px, py);
        if (d > maxDist) continue;
        let score = d, forward = true;
        if (heading != null) {
          const segBear = bearing(aLat, aLon, bLat, bLon);
          const diff = Math.abs(angleDiff(heading, segBear));
          forward = diff <= 90;
          // bauda už kryptį: 90° nuokrypis ≈ +45 m
          score = d + Math.min(diff, 180 - diff) * 0.5;
          if (w.oneway && !forward) score += 120;
        }
        if (!best || score < best.score) {
          best = { way: w, i, t, score, d, forward,
                   lat: aLat + (bLat - aLat) * t, lon: aLon + (bLon - aLon) * t };
        }
      }
    }
    return best;
  }

  /** Atstumas metrais nuo kelio pradžios iki taško (i, t). */
  distanceAlong(w, i, t) {
    let s = 0;
    for (let k = 0; k < i; k++) s += dist(w.pts[k][0], w.pts[k][1], w.pts[k + 1][0], w.pts[k + 1][1]);
    if (i < w.pts.length - 1)
      s += dist(w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1]) * t;
    return s;
  }

  /**
   * Kas laukia priekyje: posūkiai ir pavojai iki `ahead` metrų.
   * Eina per sujungtus kelius, tad matai ir už sankryžos.
   */
  lookAhead(snapped, ahead = 900) {
    const out = [];
    if (!snapped) return out;
    const w = snapped.way, fwd = snapped.forward;
    const here = this.distanceAlong(w, snapped.i, snapped.t);
    const total = this.distanceAlong(w, w.pts.length - 1, 0);
    const push = (item, dAlong) => {
      const rel = fwd ? dAlong - here : here - dAlong;
      if (rel > 2 && rel < ahead) out.push({ ...item, dist: rel, way: w });
    };
    for (const c of w.corners) push({ type: 'corner', ...c }, this.distanceAlong(w, c.i, 0));
    for (const h of w.haz)     push({ type: 'hazard', ...h }, this.distanceAlong(w, h.i, 0));
    // dangos pasikeitimas kelio gale (jei toliau kitas kelias) — pridedam ribą
    const toEnd = fwd ? total - here : here;
    if (toEnd < ahead) out.push({ type: 'end', dist: toEnd, way: w });
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }
}

/* ── Rally kvietimai (šturmano kalba) ───────────────────────────────────── */
export function callText(item, mode = 'number') {
  if (item.type === 'hazard') {
    return { bump: 'kalnelis', camera: 'kamera', railway: 'pervaža',
             stop: 'stop', giveway: 'duoti kelią', rumble: 'grubus' }[item.kind] || '';
  }
  if (item.type !== 'corner') return '';
  const dir = item.dir === 'L' ? 'kairė' : 'dešinė';
  let s = dir + ' ' + item.sev;
  if (item.shape === 'tightens') s += ', siaurėja';
  else if (item.shape === 'opens') s += ', veriasi';
  if (item.len > 140) s += ', ilga';
  return s;
}

/** Kada kviesti: pagal laiką iki posūkio (šturmanas kviečia iš anksto). */
export function callDistance(speedKmh, leadSeconds = 5) {
  const v = Math.max(8, speedKmh) / 3.6;
  return Math.max(60, Math.min(400, v * leadSeconds));
}

export function fmtDist(m) {
  if (m < 1000) return Math.round(m / 10) * 10 + ' m';
  return (m / 1000).toFixed(1) + ' km';
}
export function fmtDur(min) {
  if (min < 60) return Math.round(min) + ' min';
  return Math.floor(min / 60) + ' h ' + Math.round(min % 60) + ' min';
}
