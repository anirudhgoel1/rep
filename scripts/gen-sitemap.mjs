// Generate sitemap.xml · static pages + one entry per votable artist profile.
// Run after roster edits: node scripts/gen-sitemap.mjs (or npm run gen:sitemap)
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://rep.anirudhgoel.xyz';
const artists = JSON.parse(await readFile(join(ROOT, 'data/artists.json'), 'utf8'));

const staticPages = [
  '/', '/leaderboard.html', '/build.html', '/tier.html', '/compare.html',
  '/mixtape.html', '/city.html', '/beefs.html', '/timeline.html',
  '/cyphers.html', '/labels.html', '/producers.html', '/slang.html',
];
// artist profiles · canonical form matches what the worker injects (/artist?slug=)
const artistPages = artists.artists
  .filter(a => a.is_votable !== 0)
  .map(a => `/artist?slug=${a.slug}`);

const urls = [...staticPages, ...artistPages]
  .map(u => `  <url><loc>${ORIGIN}${u}</loc></url>`)
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
await writeFile(join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml · ${staticPages.length} static + ${artistPages.length} artists = ${staticPages.length + artistPages.length} urls`);
