// Cross-check artists.json real_name + origin cities against English Wikipedia summaries.
// Usage: node scripts/verify-wikipedia.mjs [--slugs=krsna,king] [--delay=800]
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const artists = JSON.parse(await readFile(join(ROOT, 'data/artists.json'), 'utf8')).artists;

const argSlugs = process.argv.find((a) => a.startsWith('--slugs='))?.slice(8)?.split(',').filter(Boolean);
const delayMs = Number(process.argv.find((a) => a.startsWith('--delay='))?.slice(8)) || 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wikiTitleFromUrl(url) {
  const m = url.match(/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1].replace(/_/g, ' ')) : null;
}

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function nameInText(realName, stageName, text) {
  if (!text) return null;
  const t = norm(text);
  if (stageName) {
    const st = norm(stageName).replace(/\s+/g, '');
    if (st.length > 2 && t.replace(/\s+/g, '').includes(st)) return true;
  }
  if (!realName) return null;
  const parts = realName.split(/[+&,]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) return null; // skip collectives
  const n = norm(realName);
  if (t.includes(n)) return true;
  const words = n.split(' ').filter(Boolean);
  if (words.length >= 2) {
    const core = words.slice(0, -1).join(' ');
    if (core.length > 5 && t.includes(core)) return true;
  }
  const last = words[words.length - 1];
  if (last && last.length > 3 && t.includes(last)) return 'partial';
  return false;
}

function placeHints(text) {
  const t = norm(text);
  const cities = [];
  const patterns = [
    'mumbai', 'delhi', 'pune', 'bengaluru', 'bangalore', 'chennai', 'hyderabad',
    'kolkata', 'lucknow', 'amritsar', 'jalandhar', 'chandigarh', 'dehradun',
    'shillong', 'guwahati', 'srinagar', 'goa', 'margao', 'nagpur', 'faridabad',
    'gurugram', 'gurgaon', 'ranchi', 'kochi', 'malappuram', 'kohima', 'imphal',
    'gangtok', 'agartala', 'aizawl', 'itanagar', 'mankhurd', 'dharavi', 'kurla',
    'hong kong', 'london', 'brampton', 'toronto', 'vancouver', 'surrey',
    'los angeles', 'oakland', 'karachi', 'lahore', 'hoshiarpur', 'trivandrum',
    'thiruvananthapuram', 'mohali', 'karnal', 'nangal', 'mansa', 'moosa',
    'tarn taran', 'claremont', 'malton', 'mississauga', 'dosanjh kalan',
    'nangbah', 'nalbari', 'chabua', 'gorakhpur', 'roorkee', 'bhawana', 'palwal',
    'kerala', 'arunachal', 'mizoram', 'nagaland',
  ];
  for (const p of patterns) {
    const re = new RegExp(`\\b${p.replace(/\s+/g, '\\s+')}\\b`);
    if (re.test(t)) cities.push(p);
  }
  return cities;
}

function cityLikelyOk(a, hints) {
  if (!hints.length) return true;
  const rep = norm(a.city_represented);
  const orig = norm(a.city_of_origin);
  const st = norm(a.state);
  return hints.some((h) => {
    if (rep.includes(h) || orig.includes(h) || st.includes(h)) return true;
    if (h === 'kerala' && (orig.includes('malappuram') || rep.includes('bengaluru') || st.includes('karnataka'))) return true;
    if (h === 'mizoram' && (rep.includes('aizawl') || orig.includes('aizawl'))) return true;
    if (h === 'nagaland' && (rep.includes('kohima') || orig.includes('kohima'))) return true;
    return rep.includes(h.split(' ')[0]);
  });
}

let withWiki = artists.filter((a) => a.wikipedia_url);
if (argSlugs?.length) withWiki = withWiki.filter((a) => argSlugs.includes(a.slug));

const results = [];

for (const a of withWiki) {
  const title = wikiTitleFromUrl(a.wikipedia_url);
  if (!title) {
    results.push({ slug: a.slug, error: 'bad wikipedia_url' });
    continue;
  }
  const api = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  let summary;
  try {
    const res = await fetch(api, { headers: { 'User-Agent': 'RepRosterAudit/1.1 (rep.anirudhgoel.xyz; contact@anirudhgoel.xyz)' } });
    if (!res.ok) {
      results.push({ slug: a.slug, title, error: `HTTP ${res.status}` });
      await sleep(delayMs);
      continue;
    }
    summary = await res.json();
  } catch (e) {
    results.push({ slug: a.slug, title, error: String(e) });
    await sleep(delayMs);
    continue;
  }

  const text = [summary.description, summary.extract].filter(Boolean).join(' ');
  let nameMatch = nameInText(a.real_name, a.stage_name, text);
  if (/hip hop duo|rock band|band from/i.test(summary.extract || '')) nameMatch = null;
  const hints = placeHints(text);
  const cityOk = cityLikelyOk(a, hints);

  results.push({
    slug: a.slug,
    stage_name: a.stage_name,
    wiki_title: title,
    real_name_json: a.real_name,
    city_represented: a.city_represented,
    city_of_origin: a.city_of_origin,
    name_match: nameMatch,
    wiki_places: hints,
    city_likely_ok: cityOk,
    extract_snip: (summary.extract || '').slice(0, 280),
    description: summary.description || '',
  });
  await sleep(delayMs);
}

const prev = JSON.parse(await readFile(join(ROOT, 'research/wikipedia-audit-results.json'), 'utf8').catch(() => '{}'));
const mergedAll = argSlugs?.length
  ? [...(prev.all || []).filter((r) => !argSlugs.includes(r.slug)), ...results]
  : results;

const report = {
  generated_at: new Date().toISOString(),
  checked: mergedAll.length,
  subset: argSlugs || null,
  name_mismatch: mergedAll.filter((r) => r.name_match === false),
  name_partial: mergedAll.filter((r) => r.name_match === 'partial'),
  city_flag: mergedAll.filter((r) => r.city_likely_ok === false && r.wiki_places?.length),
  errors: mergedAll.filter((r) => r.error),
  all: mergedAll,
};

await writeFile(join(ROOT, 'research/wikipedia-audit-results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  checked: results.length,
  name_mismatch: report.name_mismatch.map((x) => x.slug),
  city_flag: report.city_flag.map((x) => ({ slug: x.slug, json: [x.city_represented, x.city_of_origin], wiki: x.wiki_places })),
  errors: report.errors.map((x) => ({ slug: x.slug, error: x.error })),
}, null, 2));
