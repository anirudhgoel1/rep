// Smoke-test Worker API (local or prod). No secrets required.
// Usage: node scripts/smoke-api.mjs [baseUrl]
//   node scripts/smoke-api.mjs http://127.0.0.1:8787
//   node scripts/smoke-api.mjs https://rep.anirudhgoel.xyz
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');

async function get(path) {
  const r = await fetch(`${base}/api${path}`);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; }
  return { status: r.status, json };
}

const routes = [
  ['/health', (j) => j.ok === true],
  ['/leaderboard?type=top5&scope=all', (j) => Array.isArray(j.rows)],
  ['/daily', (j) => j.artist_a && j.artist_b],
  ['/defend?sort=top&limit=3', (j) => Array.isArray(j)],
  ['/suggestions?limit=3', (j) => Array.isArray(j)],
];

let ok = true;
console.log(`smoke · ${base}`);
for (const [path, validate] of routes) {
  try {
    const { status, json } = await get(path);
    const pass = status === 200 && validate(json);
    console.log(`${pass ? '✓' : '✗'} ${status} ${path}`);
    if (!pass) { ok = false; console.log('  ', JSON.stringify(json).slice(0, 200)); }
  } catch (e) {
    ok = false;
    console.log(`✗ ERR ${path} · ${e.message}`);
  }
}
process.exit(ok ? 0 : 1);
