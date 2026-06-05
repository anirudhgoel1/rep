// Generate db/0002_seed_artists.sql from data/artists.json so the D1 `artists`
// table (which votes FK into) is populated. Re-run after editing the roster.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..';
const artists = JSON.parse(await readFile(join(ROOT, 'data/artists.json'), 'utf8')).artists;

const TIERS = new Set(['S', 'A', 'B', 'C', 'D']);
const STATUS = new Set(['Active', 'Hiatus', 'RIP', 'Comeback Era']);
const q = (v) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
const jq = (v) => `'${JSON.stringify(v ?? []).replace(/'/g, "''")}'`;

const rows = artists.map(a => {
  const tier = TIERS.has(a.popularity_tier) ? a.popularity_tier : 'C';
  const status = STATUS.has(a.active_status) ? a.active_status : 'Active';
  return `(${[
    q(a.slug), q(a.stage_name), q(a.real_name), q(a.city_represented || 'India'),
    q(a.city_of_origin), q(a.state), q(a.era || 'New Wave'), q(a.subgenre || 'Gully Rap'),
    jq(a.language), jq(a.tags), jq(a.notable_tracks), q(tier), q(status),
    q(a.label), q(a.spotify_url), q(a.spotify_id), q(a.wikipedia_url),
    q(a.instagram_handle), q(a.image_url), a.is_votable === 0 ? 0 : 1,
  ].join(',')})`;
});

const cols = `slug,stage_name,real_name,city_represented,city_of_origin,state,era,subgenre,language,tags,notable_tracks,popularity_tier,active_status,label,spotify_url,spotify_id,wikipedia_url,instagram_handle,image_url,is_votable`;

const sql = `-- AUTO-GENERATED from data/artists.json by scripts/gen-seed.mjs · do not edit by hand
DELETE FROM artists;
INSERT INTO artists (${cols}) VALUES
${rows.join(',\n')};
`;

await writeFile(join(ROOT, 'db/0002_seed_artists.sql'), sql);
console.log(`wrote db/0002_seed_artists.sql · ${rows.length} artists`);
