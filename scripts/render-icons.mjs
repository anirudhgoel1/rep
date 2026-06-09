// Render PWA icons from the favicon design (kraft / carbon R / orange dot).
// Usage: node scripts/render-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// scale 0..1 shrinks the mark toward center (maskable safe zone)
const art = (scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#F4EFE6"/>
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
    <text x="50" y="78" text-anchor="middle"
          font-family="Anton, Impact, sans-serif"
          font-size="92" font-weight="400"
          fill="#1B1B1B" letter-spacing="-2">R</text>
    <circle cx="78" cy="72" r="8" fill="#ED8B40"/>
  </g>
</svg>`;

const jobs = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable.png', 512, 0.66],
];
for (const [name, size, scale] of jobs) {
  await sharp(Buffer.from(art(scale)), { density: 72 * (size / 100) })
    .resize(size, size)
    .png()
    .toFile(join(ROOT, name));
  console.log('rendered ·', name);
}
