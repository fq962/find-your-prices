// Rasteriza el mismo mark que src/app/icon.svg a PNG e ICO.
// Coordenadas en el espacio 0..32 del SVG, con supersampling 4x4.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { argv } from "node:process";

const BG = [0x08, 0x08, 0x0a];
const ACCENT = [0x29, 0x97, 0xff];
const WHITE = [0xff, 0xff, 0xff];

const S = 32; // lado del espacio de diseño

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inRoundedRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  if (x >= r && x <= size - r) return y >= 0 && y <= size;
  if (y >= r && y <= size - r) return x >= 0 && x <= size;
  return Math.hypot(x - cx, y - cy) <= r;
}

/** Color del punto (x,y) en el espacio 0..32, o null si es transparente. */
function sample(x, y) {
  // Flecha blanca (encima de todo)
  const arrow =
    segDist(x, y, 14, 9.6, 14, 15.5) <= 1.15 ||
    segDist(x, y, 11.4, 12.9, 14, 15.6) <= 1.15 ||
    segDist(x, y, 16.6, 12.9, 14, 15.6) <= 1.15;
  if (arrow) return WHITE;

  // Aro de la lupa + mango, en el azul de acento
  const ring = Math.abs(Math.hypot(x - 14, y - 13.4) - 6.1) <= 1.45;
  const handle = segDist(x, y, 18.6, 18.1, 24.4, 23.9) <= 1.8;
  if (ring || handle) return ACCENT;

  if (inRoundedRect(x, y, S, 7)) return BG;
  return null;
}

function render(px) {
  const scale = S / px;
  const sub = 4;
  const data = Buffer.alloc(px * px * 4);
  for (let py = 0; py < px; py++) {
    for (let pxi = 0; pxi < px; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const x = (pxi + (sx + 0.5) / sub) * scale;
          const y = (py + (sy + 0.5) / sub) * scale;
          const c = sample(x, y);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = sub * sub;
      const i = (py * px + pxi) * 4;
      const cov = a / n;
      // Premultiplicado inverso: el color medio sólo cuenta las muestras opacas.
      const opaque = a / 255 || 1;
      data[i] = Math.round(r / opaque);
      data[i + 1] = Math.round(g / opaque);
      data[i + 2] = Math.round(b / opaque);
      data[i + 3] = Math.round(cov);
    }
  }
  return data;
}

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(px, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const raw = Buffer.alloc(px * (px * 4 + 1));
  for (let y = 0; y < px; y++) {
    raw[y * (px * 4 + 1)] = 0; // filtro None
    rgba.copy(raw, y * (px * 4 + 1) + 1, y * px * 4, (y + 1) * px * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO con entradas PNG (soportado por todo lo que importa desde Vista). */
function ico(sizes) {
  const images = sizes.map((s) => png(s, render(s)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((s, i) => {
    const e = Buffer.alloc(16);
    e[0] = s >= 256 ? 0 : s;
    e[1] = s >= 256 ? 0 : s;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4);   // planos
    e.writeUInt16LE(32, 6);  // bits por píxel
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

const out = argv[2];
writeFileSync(`${out}/favicon.ico`, ico([16, 32, 48]));
writeFileSync(`${out}/apple-icon.png`, png(180, render(180)));
console.log("favicon.ico + apple-icon.png escritos en", out);
