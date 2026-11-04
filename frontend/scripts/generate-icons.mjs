// Generates PWA PNG icons without external dependencies (tiny PNG encoder + supersampled rasteriser).
// Usage: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const distToSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Glyph: an upward "flow" trend line with an end dot, in unit coordinates.
const LINE = [
  [0.22, 0.66],
  [0.4, 0.5],
  [0.53, 0.6],
  [0.76, 0.36],
];
const DOT = [0.76, 0.36];

function render(size, { rounded, glyphScale }) {
  const SS = 4; // supersampling
  const buf = Buffer.alloc(size * size * 4);
  const radius = rounded ? 0.225 : 0;
  const stroke = 0.075 * glyphScale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0, white = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          // rounded-square mask
          let inside = true;
          if (radius) {
            const cx = Math.min(Math.max(u, radius), 1 - radius);
            const cy = Math.min(Math.max(v, radius), 1 - radius);
            inside = Math.hypot(u - cx, v - cy) <= radius;
          }
          if (!inside) continue;
          a++;
          // glyph space (centered scaling)
          const gu = (u - 0.5) / glyphScale + 0.5;
          const gv = (v - 0.5) / glyphScale + 0.5;
          let d = Infinity;
          for (let i = 0; i < LINE.length - 1; i++) d = Math.min(d, distToSeg(gu, gv, ...LINE[i], ...LINE[i + 1]));
          const onLine = d * glyphScale <= stroke / 2;
          const onDot = Math.hypot(gu - DOT[0], gv - DOT[1]) * glyphScale <= stroke * 0.95;
          if (onLine || onDot) white++;
        }
      }
      const total = SS * SS;
      const i = (y * size + x) * 4;
      // diagonal gradient #3B82F6 → #1D4ED8
      const t = (x + y) / (2 * size);
      const r = Math.round(59 + (29 - 59) * t), g = Math.round(130 + (78 - 130) * t), b = Math.round(246 + (216 - 246) * t);
      const w = white / Math.max(a, 1);
      buf[i] = Math.round(r + (255 - r) * w);
      buf[i + 1] = Math.round(g + (255 - g) * w);
      buf[i + 2] = Math.round(b + (255 - b) * w);
      buf[i + 3] = Math.round((a / total) * 255);
    }
  }
  return png(size, buf);
}

mkdirSync(path.join(out, 'icons'), { recursive: true });
writeFileSync(path.join(out, 'icons', 'icon-192.png'), render(192, { rounded: true, glyphScale: 1 }));
writeFileSync(path.join(out, 'icons', 'icon-512.png'), render(512, { rounded: true, glyphScale: 1 }));
writeFileSync(path.join(out, 'icons', 'maskable-512.png'), render(512, { rounded: false, glyphScale: 0.78 }));
writeFileSync(path.join(out, 'apple-touch-icon.png'), render(180, { rounded: false, glyphScale: 0.9 }));
writeFileSync(path.join(out, 'favicon-32.png'), render(32, { rounded: true, glyphScale: 1 }));
console.log('✅ Icons generated in public/');
