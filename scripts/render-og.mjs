// Generate og.png (1200×630) for social previews.
// Usage: node scripts/render-og.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const artists = JSON.parse(await readFile(join(ROOT, 'data/artists.json'), 'utf8'));
const n = artists._meta?.total_artists || artists.artists?.length || 90;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0E0E10"/>
  <rect x="0" y="0" width="1200" height="8" fill="#ED8B40"/>
  <text x="60" y="120" fill="#ED8B40" font-family="monospace" font-size="22" letter-spacing="4">DESI HIP HOP · RANKED BY THE HEADS</text>
  <text x="60" y="280" fill="#F4EFE6" font-family="Impact, Arial Black, sans-serif" font-size="200" font-weight="900">REP</text>
  <circle cx="330" cy="268" r="18" fill="#ED8B40"/>
  <text x="60" y="360" fill="#9A9A9A" font-family="Georgia, serif" font-size="28" font-style="italic">the asli DHH top 5 · arguments encouraged</text>
  <text x="60" y="520" fill="#F4EFE6" font-family="monospace" font-size="36" letter-spacing="2">${n} ARTISTS · 10 CITIES · SEED UNTIL BALLOTS SHIP</text>
  <rect x="0" y="622" width="1200" height="8" fill="#ED8B40"/>
</svg>`;

await writeFile(join(ROOT, 'og-source.svg'), svg);

let pngOk = false;
try {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(svg)).png().toFile(join(ROOT, 'og.png'));
  pngOk = true;
  console.log(`wrote og.png + og-source.svg · ${n} artists`);
} catch {
  await writeFile(join(ROOT, 'og.svg'), svg);
  console.log(`wrote og.svg + og-source.svg (install sharp for og.png) · ${n} artists`);
  console.log('  npm install sharp --save-dev && node scripts/render-og.mjs');
}
if (!pngOk) process.exit(0);
