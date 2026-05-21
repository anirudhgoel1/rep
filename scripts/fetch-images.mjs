// fetch artist images via Spotify oEmbed (no auth required)
// usage: node scripts/fetch-images.mjs
import { readFile, writeFile } from 'node:fs/promises';

const ROSTER = new URL('../data/artists.json', import.meta.url);
const CONCURRENCY = 8;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchOEmbed(spotifyUrl) {
  const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`http ${res.status}`);
  const j = await res.json();
  return { thumbnail: j.thumbnail_url, title: j.title };
}

async function pool(tasks, n) {
  const results = new Array(tasks.length);
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      try { results[idx] = await tasks[idx](); }
      catch (e) { results[idx] = { error: e.message }; }
    }
  });
  await Promise.all(workers);
  return results;
}

const raw = JSON.parse(await readFile(ROSTER, 'utf8'));
const artists = raw.artists;
console.log(`fetching photos for ${artists.length} artists...`);

const tasks = artists.map((a) => async () => {
  if (!a.spotify_url) return { slug: a.slug, skip: 'no spotify_url' };
  const r = await fetchOEmbed(a.spotify_url);
  return { slug: a.slug, ...r };
});

const start = Date.now();
const results = await pool(tasks, CONCURRENCY);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

let ok = 0, fail = 0, skip = 0;
const bySlug = new Map();
for (const r of results) {
  if (r.skip) { skip++; }
  else if (r.error) { fail++; console.log(`  fail · ${r.slug} · ${r.error}`); }
  else { ok++; bySlug.set(r.slug, r.thumbnail); }
}

// merge image_url back into roster
for (const a of artists) {
  if (bySlug.has(a.slug)) a.image_url = bySlug.get(a.slug);
}

raw._meta.version = 'v1.6';
raw._meta.images_fetched_at = new Date().toISOString().slice(0, 10);
raw._meta.notes = `${raw._meta.notes || ''} Artist photos populated via Spotify oEmbed ${new Date().toISOString().slice(0,10)}.`;

await writeFile(ROSTER, JSON.stringify(raw, null, 2) + '\n');

console.log(`\ndone in ${elapsed}s. ok=${ok} fail=${fail} skip=${skip}`);
