/* ============================================================================
   REP · Cloudflare Worker · the real backend
   ----------------------------------------------------------------------------
   - Serves the static site via the ASSETS binding.
   - Exposes a JSON API under /api/* backed by D1 (binding: DB).
   - Anonymous identity via an httpOnly `rep_uid` cookie (no signup, by design).
   - Schema lives in db/0001_init.sql. Artists are seeded from data/artists.json
     (see scripts/gen-seed.mjs -> db/0002_seed_artists.sql).
   ============================================================================ */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

/* curated marquee 1v1s · cycled by day so the daily debate stays interesting
   without needing a cron. each is [a_slug, b_slug, theme]. */
export const DAILY_POOL = [
  ['krsna', 'seedhe-maut', 'delhi pen game · solo vs duo'],
  ['hanumankind', 'mc-altaf', 'global trap vs dharavi street'],
  ['yashraj', 'the-siege', 'mumbai new wave · two pens'],
  ['divine', 'naezy', 'the gully wave · founder vs cult OG'],
  ['prabh-deep', 'ahmer', 'punjabi conscience vs kashmiri conscience'],
  ['mc-stan', 'chaar-diwaari', 'pune drill vs delhi avant-rage'],
  ['krsna', 'raftaar', 'the pen vs the machine'],
  ['seedhe-maut', 'divine', 'the duo vs the founder'],
  ['hanumankind', 'prabh-deep', 'the global breakout vs the lyricist'],
  ['tienas', 'yashraj', 'mumbai oddball vs mumbai romantic'],
  ['sikander-kahlon', 'wazir-patar', 'punjab · the parallel kingdom'],
  ['paal-dabba', 'yelhomie', 'tamil wave vs northeast nucleus'],
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error('api error', url.pathname, err);
        return json({ error: 'server_error' }, 500);
      }
    }
    if (path.startsWith('/img/')) return handleImage(request, env, url);
    if (path.startsWith('/cards/')) return handleCard(request, env, url);
    if (/^\/l\/[a-zA-Z0-9]{4,12}$/.test(path)) return handleListPage(request, env, url);
    if (path === '/artist' || path === '/artist.html') return handleArtistPage(request, env, url);
    // everything else is the static site
    return env.ASSETS.fetch(request);
  },
};

/* ---------------------------------------------------------- page injection
   Artist pages and ballot share pages get their meta tags rewritten
   server-side so WhatsApp/Twitter scrapers (which run no JS) see the real
   title, description and image. Any failure falls back to the raw asset. */

const ORIGIN = 'https://rep.anirudhgoel.xyz';

let _rosterPromise = null;
function loadRoster(env, url) {
  if (!_rosterPromise) {
    _rosterPromise = Promise.all([
      env.ASSETS.fetch(new URL('/data/artists.json', url)).then(r => r.json()),
      env.ASSETS.fetch(new URL('/data/bios.json', url)).then(r => r.json()).catch(() => ({})),
    ]).then(([a, b]) => ({
      bySlug: Object.fromEntries((a.artists || []).map(x => [x.slug, x])),
      bios: (b && b.bios) || {},
    })).catch(err => { _rosterPromise = null; throw err; });
  }
  return _rosterPromise;
}

function setContent(value) {
  return { element(e) { e.setAttribute('content', value); } };
}

function rewriteMeta(assetResp, { title, desc, canonical, ogImage, jsonLd }) {
  let rw = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"]', setContent(desc))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[property="og:description"]', setContent(desc))
    .on('meta[property="og:url"]', setContent(canonical))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[name="twitter:description"]', setContent(desc))
    .on('link[rel="canonical"]', { element(e) { e.setAttribute('href', canonical); } });
  if (ogImage) {
    rw = rw
      .on('meta[property="og:image"]', setContent(ogImage.url))
      .on('meta[property="og:image:width"]', setContent(String(ogImage.w)))
      .on('meta[property="og:image:height"]', setContent(String(ogImage.h)))
      .on('meta[name="twitter:image"]', setContent(ogImage.url));
  }
  if (jsonLd) {
    const safe = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
    rw = rw.on('head', { element(e) { e.append(`<script type="application/ld+json">${safe}</script>`, { html: true }); } });
  }
  return rw.transform(assetResp);
}

async function handleArtistPage(request, env, url) {
  const asset = () => env.ASSETS.fetch(new URL('/artist', url));
  try {
    const slug = url.searchParams.get('slug') || '';
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return asset();
    const { bySlug, bios } = await loadRoster(env, url);
    const a = bySlug[slug];
    if (!a) return asset();
    const bio = bios[slug];
    const title = `${a.stage_name} · Rep`;
    const desc = (bio && bio.headline
      ? `${bio.headline} · ${(a.city_represented || 'india').toLowerCase()} · rank, tracks, 1v1s on Rep`
      : `${a.stage_name} · ${a.city_represented || 'DHH'} · profile, tracks and rank on Rep`).slice(0, 200);
    const canonical = `${ORIGIN}/artist?slug=${slug}`;
    const ogImage = a.image_url ? { url: `${ORIGIN}/img/${slug}`, w: 640, h: 640 } : null;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'MusicGroup',
      name: a.stage_name,
      url: canonical,
      genre: a.subgenre || 'Hip Hop',
      ...(a.real_name ? { alternateName: a.real_name } : {}),
      ...(a.image_url ? { image: `${ORIGIN}/img/${slug}` } : {}),
      ...(bio && bio.headline ? { description: bio.headline } : {}),
      ...(a.city_represented ? { foundingLocation: { '@type': 'Place', name: a.city_represented } } : {}),
      sameAs: [
        a.spotify_url,
        a.wikipedia_url,
        a.instagram_handle ? 'https://instagram.com/' + String(a.instagram_handle).replace(/^@/, '') : null,
      ].filter(Boolean),
    };
    return rewriteMeta(await asset(), { title, desc, canonical, ogImage, jsonLd });
  } catch (err) {
    console.error('artist inject failed', err);
    return asset();
  }
}

async function handleListPage(request, env, url) {
  const asset = () => env.ASSETS.fetch(new URL('/l', url));
  try {
    const id = url.pathname.split('/')[2];
    const row = await env.DB.prepare(
      `SELECT id, username, type, picks, defense FROM lists WHERE id = ?1 AND is_hidden = 0`
    ).bind(id).first().catch(() => null);
    if (!row) return asset();
    const { bySlug } = await loadRoster(env, url);
    const picks = safeParse(row.picks);
    let names = [];
    if (Array.isArray(picks)) {
      names = picks.map(s => (bySlug[s] && bySlug[s].stage_name) || s);
    } else if (picks && typeof picks === 'object') {
      names = [...(picks.S || []), ...(picks.A || [])].map(s => (bySlug[s] && bySlug[s].stage_name) || s);
    }
    const who = row.username ? `@${row.username}` : 'someone';
    const title = row.type === 'tier' ? `${who} tiered the scene · Rep` : `${who} dropped a DHH top 5 · Rep`;
    const body = row.type === 'tier'
      ? `top of the board: ${names.slice(0, 5).join(', ')}`
      : names.slice(0, 5).map((n, i) => `${i + 1}. ${n}`).join(' · ');
    const desc = (body + (row.defense ? ` · "${row.defense}"` : '') + ' · agree? drop your own.').slice(0, 240);
    const hasCard = await env.MEDIA.head(`cards/${id}.png`).catch(() => null);
    const ogImage = hasCard
      ? { url: `${ORIGIN}/cards/${id}.png`, w: 1080, h: 1350 }
      : { url: `${ORIGIN}/og.png`, w: 1200, h: 630 };
    return rewriteMeta(await asset(), { title, desc, canonical: `${ORIGIN}/l/${id}`, ogImage });
  } catch (err) {
    console.error('list inject failed', err);
    return asset();
  }
}

/* ---------------------------------------------------------- media routes */

/* /img/:slug · R2 mirror first, then live roster image_url, else 404 */
async function handleImage(request, env, url) {
  const m = url.pathname.match(/^\/img\/([a-z0-9-]{1,60})$/);
  if (!m) return new Response('not found', { status: 404 });
  try {
    const obj = await env.MEDIA.get(`img/${m[1]}.jpg`);
    if (obj) {
      return new Response(obj.body, {
        headers: {
          'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg',
          'cache-control': 'public, max-age=604800',
          'x-content-type-options': 'nosniff',
          etag: obj.httpEtag,
        },
      });
    }
  } catch { /* R2 hiccup: fall through to redirect */ }
  try {
    const { bySlug } = await loadRoster(env, url);
    const a = bySlug[m[1]];
    if (a && a.image_url) return Response.redirect(a.image_url, 302);
  } catch { /* roster unavailable */ }
  return new Response('not found', { status: 404 });
}

/* /cards/:id.png · ballot share card from R2, falls back to the site OG */
async function handleCard(request, env, url) {
  const m = url.pathname.match(/^\/cards\/([a-zA-Z0-9]{4,12})\.png$/);
  if (!m) return new Response('not found', { status: 404 });
  try {
    const obj = await env.MEDIA.get(`cards/${m[1]}.png`);
    if (obj) {
      return new Response(obj.body, {
        headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', etag: obj.httpEtag },
      });
    }
  } catch { /* fall through */ }
  return Response.redirect(new URL('/og.png', url).toString(), 302);
}

/* ---------------------------------------------------------- turnstile */

/* fail-closed on an explicit "no", fail-open if siteverify itself is down:
   a broken bot-check must never kill real ballots. */
async function turnstileOk(env, request, token) {
  if (!env.TURNSTILE_SECRET) return true;            // not configured yet
  if (env.TURNSTILE_ENFORCE !== '1') return true;    // soft mode
  if (!token || typeof token !== 'string' || token.length > 3000) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get('cf-connecting-ip') || undefined,
      }),
    });
    const j = await r.json();
    return !!j.success;
  } catch {
    return true;
  }
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function adminOk(env, request) {
  const h = request.headers.get('authorization') || '';
  return !!env.ADMIN_TOKEN && safeEqual(h, `Bearer ${env.ADMIN_TOKEN}`);
}

/* ---------------------------------------------------------------- helpers */

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function b62(n = 16) {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < n; i++) s += a[buf[i] % a.length];
  return s;
}

function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('cookie') || '';
  raw.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/* returns { uid, setCookie? } · issues a stable anonymous id on first contact */
function identify(request) {
  const cookies = parseCookies(request);
  if (cookies.rep_uid && /^[a-zA-Z0-9]{8,40}$/.test(cookies.rep_uid)) {
    return { uid: cookies.rep_uid, setCookie: null };
  }
  const uid = b62(16);
  const oneYear = 60 * 60 * 24 * 365;
  const setCookie = `rep_uid=${uid}; Path=/; Max-Age=${oneYear}; SameSite=Lax; HttpOnly; Secure`;
  return { uid, setCookie };
}

function withCookie(resp, setCookie) {
  if (!setCookie) return resp;
  const h = new Headers(resp.headers);
  h.append('set-cookie', setCookie);
  return new Response(resp.body, { status: resp.status, headers: h });
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

/* IST date key, e.g. 2026-06-03 (UTC+5:30) */
function istDateKey(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

function rankPoints(listType, rank) {
  if (listType === 'top5') return Math.max(0, 6 - rank);      // #1 -> 5 ... #5 -> 1
  // tier: S=5 A=4 B=3 C=2 D=1 already stored as 1..5 in `rank`
  return rank || 0;
}

/* slugs must exist in the artists table · returns the validated subset order-preserved,
   or null if any slug is unknown */
async function validSlugs(db, slugs) {
  const clean = [...new Set(slugs.filter(s => typeof s === 'string' && /^[a-z0-9-]{1,60}$/.test(s)))];
  if (clean.length !== slugs.length || !clean.length) return null;
  const q = clean.map((_, i) => `?${i + 1}`).join(',');
  const rows = await db.prepare(`SELECT slug FROM artists WHERE slug IN (${q})`).bind(...clean).all();
  return (rows.results || []).length === clean.length ? clean : null;
}

/* one write-budget per IP per hour · D1-backed, no KV needed */
const WRITE_CAP = 60;
async function rateLimited(db, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const bucket = Math.floor(Date.now() / 3600000);
  const row = await db.prepare(
    `INSERT INTO rate_limits (key, bucket, n) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n`
  ).bind(ip + ':' + bucket, bucket).first();
  if (row && row.n === 1) {
    // first write this hour from this ip · piggyback stale-bucket cleanup
    await db.prepare(`DELETE FROM rate_limits WHERE bucket < ?1`).bind(bucket).run();
  }
  return !!row && row.n > WRITE_CAP;
}

/* ---------------------------------------------------------------- router */

async function handleApi(request, env, url) {
  const { uid, setCookie } = identify(request);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const db = env.DB;

  const route = (m, re) => method === m && re.test(path);
  const param = (re) => (path.match(re) || [])[1];

  if (method === 'POST' && await rateLimited(db, request)) {
    return withCookie(json({ error: 'slow_down' }, 429), setCookie);
  }

  // health -------------------------------------------------------------
  if (route('GET', /^\/api\/health$/)) {
    let dbOk = false;
    // probe a real table so an unseeded database honestly reports db:false
    try { dbOk = !!(await db.prepare('SELECT COUNT(*) AS n FROM artists').first()); } catch {}
    return withCookie(json({ ok: true, db: dbOk, uid }), setCookie);
  }

  // leaderboard --------------------------------------------------------
  if (route('GET', /^\/api\/leaderboard$/)) {
    const type = (url.searchParams.get('type') === 'tier') ? 'tier' : 'top5';
    const scope = url.searchParams.get('scope') || 'all';
    const scopeClause = scope === 'all' ? 'scope IS NULL' : 'scope = ?2';
    const binds = scope === 'all' ? [type] : [type, scope];
    // hidden ballots must not count toward the rankings (moderation)
    const liveClause = 'list_id NOT IN (SELECT id FROM lists WHERE is_hidden = 1)';

    const pointsExpr = type === 'top5'
      ? 'SUM(6 - rank)'
      : 'SUM(rank)';
    const rows = await db.prepare(
      `SELECT artist_slug AS slug, ${pointsExpr} AS points, COUNT(DISTINCT list_id) AS ballots
       FROM votes WHERE list_type = ?1 AND ${scopeClause} AND ${liveClause}
       GROUP BY artist_slug ORDER BY points DESC`
    ).bind(...binds).all();

    const data = rows.results || [];
    const totalPoints = data.reduce((s, r) => s + (r.points || 0), 0) || 1;
    const ballotRow = await db.prepare(
      `SELECT COUNT(DISTINCT list_id) AS n FROM votes WHERE list_type = ?1 AND ${scopeClause} AND ${liveClause}`
    ).bind(...binds).first();
    const ballots = (ballotRow && ballotRow.n) || 0;

    const result = data.map(r => ({ slug: r.slug, points: r.points, pct: (r.points / totalPoints) * 100, ballots: r.ballots }));
    return withCookie(json({ source: ballots > 0 ? 'votes' : 'seed', type, scope, ballots, rows: result }), setCookie);
  }

  // create a list (top5 / tier) + cast aggregate votes -----------------
  if (route('POST', /^\/api\/lists$/)) {
    const body = await readJson(request);
    if (!(await turnstileOk(env, request, body.ts))) {
      return withCookie(json({ error: 'turnstile' }, 403), setCookie);
    }
    const type = ['top5', 'tier', 'city', 'subgenre', 'era'].includes(body.type) ? body.type : 'top5';
    const scope = body.scope ? String(body.scope).slice(0, 40) : null;
    const picks = body.picks;
    const defense = body.defense ? String(body.defense).slice(0, 140) : null;
    const username = body.username ? String(body.username).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) : null;

    // validate picks BEFORE writing anything · [slug, rank] pairs for votes
    const tierRank = { S: 5, A: 4, B: 3, C: 2, D: 1 };
    let ranked = null;   // null = invalid
    let storedPicks = picks;
    if (type === 'tier') {
      if (picks && typeof picks === 'object' && !Array.isArray(picks)) {
        const flat = [];
        storedPicks = {};
        for (const [t, slugs] of Object.entries(picks)) {
          if (!tierRank[t] || !Array.isArray(slugs)) continue;
          const capped = slugs.slice(0, 30);
          storedPicks[t] = capped;
          capped.forEach(slug => flat.push([slug, tierRank[t]]));
        }
        const ok = flat.length && flat.length <= 60 && await validSlugs(db, flat.map(p => p[0]));
        if (ok) ranked = flat;
      }
    } else if (Array.isArray(picks)) {
      const slugs = await validSlugs(db, picks.slice(0, 5));
      if (slugs) {
        storedPicks = slugs;
        ranked = slugs.map((slug, i) => [slug, type === 'top5' ? i + 1 : 0]);
      }
    }
    if (!ranked) return withCookie(json({ error: 'bad_picks' }, 400), setCookie);

    const id = b62(6);
    const now = Date.now();
    const stmts = [db.prepare(
      `INSERT INTO lists (id, user_id, username, type, scope, picks, defense, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
    ).bind(id, uid, username, type, scope, JSON.stringify(storedPicks), defense, now)];

    // translate the list into aggregate votes (top5 / tier only) · re-vote replaces
    if (type === 'top5' || type === 'tier') {
      stmts.push(db.prepare(
        `DELETE FROM votes WHERE user_id = ?1 AND list_type = ?2 AND scope IS ?3`
      ).bind(uid, type, scope));
      ranked.forEach(([slug, rank]) => {
        stmts.push(db.prepare(
          `INSERT INTO votes (user_id, artist_slug, list_type, rank, scope, list_id, created_at)
           VALUES (?1,?2,?3,?4,?5,?6,?7)`
        ).bind(uid, slug, type, rank, scope, id, now));
      });
    }
    await db.batch(stmts);

    return withCookie(json({ id }), setCookie);
  }

  // fetch a single list ------------------------------------------------
  if (route('GET', /^\/api\/lists\/[a-zA-Z0-9]+$/)) {
    const id = param(/^\/api\/lists\/([a-zA-Z0-9]+)$/);
    const row = await db.prepare(
      `SELECT id, username, type, scope, picks, defense, upvotes, created_at
       FROM lists WHERE id = ?1 AND is_hidden = 0`
    ).bind(id).first();
    if (!row) return withCookie(json({ error: 'not_found' }, 404), setCookie);
    row.picks = safeParse(row.picks);
    return withCookie(json(row), setCookie);
  }

  // recent / top lists -------------------------------------------------
  if (route('GET', /^\/api\/lists$/)) {
    const type = url.searchParams.get('type') || 'top5';
    const sort = url.searchParams.get('sort') === 'top' ? 'upvotes DESC, created_at DESC' : 'created_at DESC';
    const limit = clampInt(url.searchParams.get('limit'), 20, 1, 60);
    const rows = await db.prepare(
      `SELECT id, username, type, scope, picks, defense, upvotes, created_at
       FROM lists WHERE type = ?1 AND is_hidden = 0 ORDER BY ${sort} LIMIT ?2`
    ).bind(type, limit).all();
    const out = (rows.results || []).map(r => ({ ...r, picks: safeParse(r.picks) }));
    return withCookie(json(out), setCookie);
  }

  // upvote a list (toggle) --------------------------------------------
  if (route('POST', /^\/api\/lists\/[a-zA-Z0-9]+\/upvote$/)) {
    const id = param(/^\/api\/lists\/([a-zA-Z0-9]+)\/upvote$/);
    const target = await db.prepare(`SELECT 1 FROM lists WHERE id = ?1 AND is_hidden = 0`).bind(id).first();
    if (!target) return withCookie(json({ error: 'not_found' }, 404), setCookie);
    const existing = await db.prepare(`SELECT 1 FROM list_upvotes WHERE user_id = ?1 AND list_id = ?2`).bind(uid, id).first();
    if (existing) {
      await db.batch([
        db.prepare(`DELETE FROM list_upvotes WHERE user_id = ?1 AND list_id = ?2`).bind(uid, id),
        db.prepare(`UPDATE lists SET upvotes = MAX(0, upvotes - 1) WHERE id = ?1`).bind(id),
      ]);
    } else {
      await db.batch([
        db.prepare(`INSERT INTO list_upvotes (user_id, list_id, created_at) VALUES (?1,?2,?3)`).bind(uid, id, Date.now()),
        db.prepare(`UPDATE lists SET upvotes = upvotes + 1 WHERE id = ?1`).bind(id),
      ]);
    }
    const row = await db.prepare(`SELECT upvotes FROM lists WHERE id = ?1`).bind(id).first();
    return withCookie(json({ upvotes: (row && row.upvotes) || 0, voted: !existing }), setCookie);
  }

  // defend wall · lists that carry a defense line ----------------------
  if (route('GET', /^\/api\/defend$/)) {
    const sort = url.searchParams.get('sort') === 'new' ? 'created_at DESC' : 'upvotes DESC, created_at DESC';
    const limit = clampInt(url.searchParams.get('limit'), 24, 1, 60);
    const rows = await db.prepare(
      `SELECT id, username, picks, defense, upvotes, created_at FROM lists
       WHERE type = 'top5' AND is_hidden = 0 AND defense IS NOT NULL AND defense != ''
       ORDER BY ${sort} LIMIT ?1`
    ).bind(limit).all();
    const mine = new Set();
    const up = await db.prepare(`SELECT list_id FROM list_upvotes WHERE user_id = ?1`).bind(uid).all();
    (up.results || []).forEach(r => mine.add(r.list_id));
    const out = (rows.results || []).map(r => {
      const picks = safeParse(r.picks);
      const defending = Array.isArray(picks) ? picks[0] : null;
      return { id: r.id, username: r.username, defending, defense: r.defense, upvotes: r.upvotes, voted: mine.has(r.id) };
    });
    return withCookie(json(out), setCookie);
  }

  // daily 1v1 ----------------------------------------------------------
  if (route('GET', /^\/api\/daily$/)) {
    const date = istDateKey();
    let m = await db.prepare(`SELECT * FROM daily_matchup WHERE date = ?1`).bind(date).first();
    if (!m) {
      const [a, b, theme] = await pickDailyPair(db, date);
      try {
        await db.prepare(
          `INSERT INTO daily_matchup (date, artist_a, artist_b, theme) VALUES (?1,?2,?3,?4)`
        ).bind(date, a, b, theme).run();
      } catch { /* race: another request created it */ }
      m = await db.prepare(`SELECT * FROM daily_matchup WHERE date = ?1`).bind(date).first();
    }
    if (!m) return withCookie(json({ error: 'no_matchup' }, 503), setCookie);
    const myVote = await db.prepare(`SELECT pick FROM daily_votes WHERE user_id = ?1 AND date = ?2`).bind(uid, date).first();
    return withCookie(json({
      date, artist_a: m.artist_a, artist_b: m.artist_b, theme: m.theme,
      votes_a: m.votes_a, votes_b: m.votes_b,
      voted: !!myVote, pick: myVote ? myVote.pick : null,
    }), setCookie);
  }

  if (route('POST', /^\/api\/daily\/vote$/)) {
    const date = istDateKey();
    const body = await readJson(request);
    const pick = String(body.pick || '');
    const m = await db.prepare(`SELECT * FROM daily_matchup WHERE date = ?1`).bind(date).first();
    if (!m) return withCookie(json({ error: 'no_matchup' }, 400), setCookie);
    if (pick !== m.artist_a && pick !== m.artist_b) return withCookie(json({ error: 'bad_pick' }, 400), setCookie);

    const already = await db.prepare(`SELECT pick FROM daily_votes WHERE user_id = ?1 AND date = ?2`).bind(uid, date).first();
    if (!already) {
      const col = pick === m.artist_a ? 'votes_a' : 'votes_b';
      await db.batch([
        db.prepare(`INSERT INTO daily_votes (user_id, date, pick, created_at) VALUES (?1,?2,?3,?4)`).bind(uid, date, pick, Date.now()),
        db.prepare(`UPDATE daily_matchup SET ${col} = ${col} + 1 WHERE date = ?1`).bind(date),
      ]);
    }
    const fresh = await db.prepare(`SELECT votes_a, votes_b FROM daily_matchup WHERE date = ?1`).bind(date).first();
    return withCookie(json({ votes_a: fresh.votes_a, votes_b: fresh.votes_b, pick: (already && already.pick) || pick }), setCookie);
  }

  // suggestions · "who's missing?" ------------------------------------
  if (route('POST', /^\/api\/suggestions$/)) {
    const body = await readJson(request);
    if (!(await turnstileOk(env, request, body.ts))) {
      return withCookie(json({ error: 'turnstile' }, 403), setCookie);
    }
    const name = String(body.stage_name || '').trim().slice(0, 60);
    const why = body.justification ? String(body.justification).slice(0, 200) : null;
    if (!name) return withCookie(json({ error: 'name_required' }, 400), setCookie);
    const res = await db.prepare(
      `INSERT INTO suggestions (user_id, stage_name, justification, created_at) VALUES (?1,?2,?3,?4)`
    ).bind(uid, name, why, Date.now()).run();
    return withCookie(json({ id: res.meta.last_row_id }), setCookie);
  }

  if (route('GET', /^\/api\/suggestions$/)) {
    const limit = clampInt(url.searchParams.get('limit'), 20, 1, 50);
    const rows = await db.prepare(
      `SELECT id, stage_name, justification, upvotes FROM suggestions
       WHERE status = 'pending' ORDER BY upvotes DESC, created_at DESC LIMIT ?1`
    ).bind(limit).all();
    return withCookie(json(rows.results || []), setCookie);
  }

  // ballot share card · creator uploads the rendered PNG once ----------
  if (route('POST', /^\/api\/lists\/[a-zA-Z0-9]+\/card$/)) {
    const id = param(/^\/api\/lists\/([a-zA-Z0-9]+)\/card$/);
    const owner = await db.prepare(`SELECT user_id FROM lists WHERE id = ?1 AND is_hidden = 0`).bind(id).first();
    if (!owner || owner.user_id !== uid) return withCookie(json({ error: 'not_yours' }, 403), setCookie);
    const buf = await request.arrayBuffer();
    if (buf.byteLength < 8 || buf.byteLength > 2000000) return withCookie(json({ error: 'bad_size' }, 400), setCookie);
    const sig = new Uint8Array(buf.slice(0, 8));
    const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!PNG.every((b, i) => sig[i] === b)) {
      return withCookie(json({ error: 'not_png' }, 400), setCookie);
    }
    await env.MEDIA.put(`cards/${id}.png`, buf, { httpMetadata: { contentType: 'image/png' } });
    return withCookie(json({ ok: true, url: `/cards/${id}.png` }), setCookie);
  }

  // admin · moderation, token-gated ------------------------------------
  if (route('GET', /^\/api\/admin\/suggestions$/)) {
    if (!adminOk(env, request)) return json({ error: 'forbidden' }, 403);
    const status = url.searchParams.get('status') || 'pending';
    const rows = await db.prepare(
      `SELECT * FROM suggestions WHERE status = ?1 ORDER BY upvotes DESC, created_at DESC LIMIT 100`
    ).bind(status).all();
    return json(rows.results || []);
  }

  if (route('GET', /^\/api\/admin\/lists$/)) {
    if (!adminOk(env, request)) return json({ error: 'forbidden' }, 403);
    const rows = await db.prepare(
      `SELECT id, username, type, picks, defense, upvotes, is_hidden, created_at
       FROM lists ORDER BY created_at DESC LIMIT 100`
    ).all();
    return json((rows.results || []).map(r => ({ ...r, picks: safeParse(r.picks) })));
  }

  if (route('POST', /^\/api\/admin\/lists\/[a-zA-Z0-9]+\/hide$/)) {
    if (!adminOk(env, request)) return json({ error: 'forbidden' }, 403);
    const id = param(/^\/api\/admin\/lists\/([a-zA-Z0-9]+)\/hide$/);
    const body = await readJson(request);
    const hidden = body.hidden === false ? 0 : 1;
    await db.prepare(`UPDATE lists SET is_hidden = ?2 WHERE id = ?1`).bind(id, hidden).run();
    return json({ id, is_hidden: hidden });
  }

  if (route('POST', /^\/api\/admin\/suggestions\/[0-9]+\/status$/)) {
    if (!adminOk(env, request)) return json({ error: 'forbidden' }, 403);
    const id = parseInt(param(/^\/api\/admin\/suggestions\/([0-9]+)\/status$/), 10);
    const body = await readJson(request);
    const status = ['pending', 'admitted', 'rejected'].includes(body.status) ? body.status : null;
    if (!status) return json({ error: 'bad_status' }, 400);
    await db.prepare(`UPDATE suggestions SET status = ?2 WHERE id = ?1`).bind(id, status).run();
    return json({ id, status });
  }

  if (route('POST', /^\/api\/suggestions\/[0-9]+\/upvote$/)) {
    const id = parseInt(param(/^\/api\/suggestions\/([0-9]+)\/upvote$/), 10);
    const target = await db.prepare(`SELECT 1 FROM suggestions WHERE id = ?1`).bind(id).first();
    if (!target) return withCookie(json({ error: 'not_found' }, 404), setCookie);
    const existing = await db.prepare(`SELECT 1 FROM suggestion_upvotes WHERE user_id = ?1 AND suggestion_id = ?2`).bind(uid, id).first();
    if (existing) {
      await db.batch([
        db.prepare(`DELETE FROM suggestion_upvotes WHERE user_id = ?1 AND suggestion_id = ?2`).bind(uid, id),
        db.prepare(`UPDATE suggestions SET upvotes = MAX(0, upvotes - 1) WHERE id = ?1`).bind(id),
      ]);
    } else {
      await db.batch([
        db.prepare(`INSERT INTO suggestion_upvotes (user_id, suggestion_id, created_at) VALUES (?1,?2,?3)`).bind(uid, id, Date.now()),
        db.prepare(`UPDATE suggestions SET upvotes = upvotes + 1 WHERE id = ?1`).bind(id),
      ]);
    }
    const row = await db.prepare(`SELECT upvotes FROM suggestions WHERE id = ?1`).bind(id).first();
    return withCookie(json({ upvotes: (row && row.upvotes) || 0, voted: !existing }), setCookie);
  }

  return withCookie(json({ error: 'not_found' }, 404), setCookie);
}

/* ---------------------------------------------------------------- utils */

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }
function clampInt(v, dflt, lo, hi) { const n = parseInt(v, 10); if (isNaN(n)) return dflt; return Math.max(lo, Math.min(hi, n)); }
function dayIndex(dateKey) {
  // days since epoch from a YYYY-MM-DD key
  return Math.floor(Date.parse(dateKey + 'T00:00:00Z') / 86400000);
}

/* daily pair · every 3rd day a curated classic, otherwise generated from the
   roster: same city or same era, within one popularity tier, deterministic
   per date so every visitor sees the same matchup. */
async function pickDailyPair(db, date) {
  const di = dayIndex(date);
  if (di % 3 === 0) return DAILY_POOL[Math.floor(di / 3) % DAILY_POOL.length];
  try {
    const res = await db.prepare(
      `SELECT slug, city_represented AS city, era, popularity_tier AS tier
       FROM artists WHERE is_votable = 1 ORDER BY slug`
    ).all();
    const rows = res.results || [];
    const tierN = { S: 5, A: 4, B: 3, C: 2, D: 1 };
    const pairs = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const sameCity = a.city && a.city === b.city;
        const sameEra = !sameCity && a.era && a.era === b.era;
        if (!sameCity && !sameEra) continue;
        if (Math.abs((tierN[a.tier] || 3) - (tierN[b.tier] || 3)) > 1) continue;
        pairs.push([
          a.slug, b.slug,
          sameCity ? `${a.city.toLowerCase()} · city pride 1v1` : `${a.era.toLowerCase()} · era battle`,
        ]);
      }
    }
    if (pairs.length) {
      // golden-ratio hash spreads consecutive days across the pair space
      const idx = Math.abs(Math.imul(di, 2654435761)) % pairs.length;
      return pairs[idx];
    }
  } catch { /* unseeded db · fall back to curated */ }
  return DAILY_POOL[di % DAILY_POOL.length];
}
