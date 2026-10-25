/**
 * Deterministic image generator (sharp).
 * Writes 60 gallery JPEGs + 1 hero JPEG to public/images/.
 *
 * PERF-BUG #3: images are ~3000px wide and 1–2 MB each, served as-is.
 */
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const OUT_DIR = join(process.cwd(), "public", "images");
const GALLERY_COUNT = 60;
const GALLERY_W = 3000;
const GALLERY_H = 2000;
const HERO_W = 4000;
const HERO_H = 1600;
const NOISE = 48; // higher = less compressible = bigger files

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function render(w: number, h: number, seed: number): Buffer {
  const rand = mulberry32(seed);
  const buf = Buffer.alloc(w * h * 3);
  const c1 = [rand() * 255, rand() * 255, rand() * 255];
  const c2 = [rand() * 255, rand() * 255, rand() * 255];
  const fx = 2 + rand() * 6;
  const fy = 2 + rand() * 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const wave = 0.5 + 0.5 * Math.sin(u * fx * Math.PI + Math.cos(v * fy * Math.PI) * 2);
      const i = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const base = c1[c] * wave + c2[c] * (1 - wave);
        const n = (rand() - 0.5) * NOISE;
        buf[i + c] = Math.max(0, Math.min(255, base + n));
      }
    }
  }
  return buf;
}

async function write(name: string, w: number, h: number, seed: number) {
  const file = join(OUT_DIR, name);
  await sharp(render(w, h, seed), { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 88, mozjpeg: false })
    .toFile(file);
  return statSync(file).size;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let total = 0;
  const heroSize = await write("hero.jpg", HERO_W, HERO_H, 9999);
  total += heroSize;
  console.log(`hero.jpg ${(heroSize / 1024 / 1024).toFixed(2)} MB`);
  for (let i = 1; i <= GALLERY_COUNT; i++) {
    const name = `photo-${String(i).padStart(2, "0")}.jpg`;
    const size = await write(name, GALLERY_W, GALLERY_H, i);
    total += size;
    if (i === 1 || i % 10 === 0) console.log(`${name} ${(size / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB in ${OUT_DIR}`);
}

main();
