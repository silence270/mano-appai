/* Ikonų generatorius — savas PNG rašytojas, nes ImageMagick šioje mašinoje nėra.
 * Lapas = dviejų apskritimų sankirta (vesica), pasukta 45°, su gysla ir šonine
 * lapkočio linija. Paleisti: node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const CRC = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

/** Atstumas nuo taško iki atkarpos — gyslos piešiamos kaip storos atkarpos. */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Antialiasing: kiekvienas pikselis skaičiuojamas 3×3 pomėginiais. */
function render(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const BG1 = [34, 26, 42], BG2 = [17, 13, 20];
  const LEAF1 = [150, 205, 173], LEAF2 = [86, 146, 118];
  const VEIN = [28, 52, 41];
  const S = maskable ? 0.58 : 0.70;              // maskable turi tilpti į saugų apskritimą
  const R = size * S * 0.70;                     // apskritimų, kurių sankirta yra lapas, spindulys
  const OFF = R * 0.50;                          // centrų poslinkis: mažesnis = putlesnis lapas
  const HALF = Math.sqrt(R * R - OFF * OFF);     // lapo pusilgis išilgai
  const WIDE = R - OFF;                          // lapo pusplotis skersai

  const cx = size / 2, cy = size / 2;
  const cos = Math.SQRT1_2, sin = Math.SQRT1_2;  // pasukimas 45°

  // šoninės gyslos: nuo centrinės gyslos taško į lapo kraštą, kaip tikram lapui
  const veins = [];
  for (let i = -3; i <= 3; i++) {
    if (!i) continue;
    const u0 = i * HALF * 0.20;
    const reach = 1 - Math.abs(u0) / HALF;                 // arčiau galo — trumpesnės
    for (const sgn of [1, -1]) {
      veins.push([u0, 0, u0 + Math.sign(i || 1) * HALF * 0.30 * reach, sgn * WIDE * 0.78 * reach]);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const px = x + (sx + 0.5) / 3, py = y + (sy + 0.5) / 3;

        const dr = Math.hypot(px - cx * 0.78, py - cy * 0.72) / size;
        let col = mix(BG1, BG2, Math.min(1, dr * 1.75));

        const dx = px - cx, dy = py - cy;
        const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;

        if (Math.hypot(u, v - OFF) <= R && Math.hypot(u, v + OFF) <= R) {
          col = mix(LEAF1, LEAF2, Math.min(1, Math.max(0, (u / HALF + 1) / 2)));
          if (Math.abs(v) < R * 0.020 && Math.abs(u) < HALF * 0.92) col = mix(col, VEIN, 0.5);
          for (const [ax, ay, bx, by] of veins) {
            if (segDist(u, v, ax, ay, bx, by) < R * 0.014) { col = mix(col, VEIN, 0.3); break; }
          }
        }
        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
      }
      const i = (y * size + x) * 4;
      buf[i] = acc[0] / 9; buf[i + 1] = acc[1] / 9; buf[i + 2] = acc[2] / 9; buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [file, size, opt] of [
  ['icon-180.png', 180, {}],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-512-maskable.png', 512, { maskable: true }],
]) {
  writeFileSync(new URL('../icons/' + file, import.meta.url), render(size, opt));
  console.log('✓', file);
}
