// Pre-deploy checklist · slug parity, counts, seed rows.
// Usage: node scripts/preflight.mjs
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const artists = JSON.parse(await readFile(join(ROOT, 'data/artists.json'), 'utf8'));
const bios = JSON.parse(await readFile(join(ROOT, 'data/bios.json'), 'utf8'));
const seedSql = await readFile(join(ROOT, 'db/0002_seed_artists.sql'), 'utf8');

const slugs = artists.artists.map(a => a.slug);
const bioKeys = Object.keys(bios.bios || {});
const metaN = artists._meta?.total_artists;
const seedRows = (seedSql.match(/^\('/gm) || []).length;

const missingSlug = artists.artists.filter(a => !a.slug).map(a => a.stage_name);
const missBios = slugs.filter(s => s && !bioKeys.includes(s));
const extraBios = bioKeys.filter(s => !slugs.includes(s));
const noIg = artists.artists.filter(a => !a.instagram_handle).map(a => a.slug);
const noWiki = artists.artists.filter(a => !a.wikipedia_url).length;
const nullName = artists.artists.filter(a => a.real_name == null).map(a => a.slug);

const checks = [
  ['meta total_artists', metaN, metaN === slugs.length],
  ['artists array length', slugs.length, slugs.length === metaN],
  ['bios keys', bioKeys.length, bioKeys.length === slugs.length],
  ['seed SQL rows', seedRows, seedRows === slugs.length],
  ['slug parity', missBios.length + extraBios.length, missBios.length === 0 && extraBios.length === 0],
  ['missing slug field', missingSlug.length, missingSlug.length === 0],
];

let ok = true;
for (const [label, val, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${label}: ${val}`);
  if (!pass) ok = false;
}
console.log(`\ninfo · instagram null: ${noIg.length} ${noIg.length ? `(${noIg.join(', ')})` : ''}`);
console.log(`info · wikipedia null: ${noWiki}`);
console.log(`info · real_name null (documented): ${nullName.join(', ')}`);
if (missBios.length) console.log('missing bios:', missBios);
if (extraBios.length) console.log('extra bios:', extraBios);
process.exit(ok ? 0 : 1);
