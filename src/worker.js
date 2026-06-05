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
const DAILY_POOL = [
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
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: 'server_error', detail: String(err && err.message || err) }, 500);
      }
    }
    // everything else is the static site
    return env.ASSETS.fetch(request);
  },
};

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

/* returns { uid, setCookie? } — issues a stable anonymous id on first contact */
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

/* ---------------------------------------------------------------- router */

async function handleApi(request, env, url) {
  const { uid, setCookie } = identify(request);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const db = env.DB;

  const route = (m, re) => method === m && re.test(path);
  const param = (re) => (path.match(re) || [])[1];

  // health -------------------------------------------------------------
  if (route('GET', /^\/api\/health$/)) {
    let dbOk = false;
    try { await db.prepare('SELECT 1').first(); dbOk = true; } catch {}
    return withCookie(json({ ok: true, db: dbOk, uid }), setCookie);
  }

  // leaderboard --------------------------------------------------------
  if (route('GET', /^\/api\/leaderboard$/)) {
    const type = (url.searchParams.get('type') === 'tier') ? 'tier' : 'top5';
    const scope = url.searchParams.get('scope') || 'all';
    const scopeClause = scope === 'all' ? 'scope IS NULL' : 'scope = ?2';
    const binds = scope === 'all' ? [type] : [type, scope];

    const pointsExpr = type === 'top5'
      ? 'SUM(6 - rank)'
      : 'SUM(rank)';
    const rows = await db.prepare(
      `SELECT artist_slug AS slug, ${pointsExpr} AS points, COUNT(DISTINCT list_id) AS ballots
       FROM votes WHERE list_type = ?1 AND ${scopeClause}
       GROUP BY artist_slug ORDER BY points DESC`
    ).bind(...binds).all();

    const data = rows.results || [];
    const totalPoints = data.reduce((s, r) => s + (r.points || 0), 0) || 1;
    const ballotRow = await db.prepare(
      `SELECT COUNT(DISTINCT list_id) AS n FROM votes WHERE list_type = ?1 AND ${scopeClause}`
    ).bind(...binds).first();
    const ballots = (ballotRow && ballotRow.n) || 0;

    const result = data.map(r => ({ slug: r.slug, points: r.points, pct: (r.points / totalPoints) * 100, ballots: r.ballots }));
    return withCookie(json({ source: ballots > 0 ? 'votes' : 'seed', type, scope, ballots, rows: result }), setCookie);
  }

  // create a list (top5 / tier) + cast aggregate votes -----------------
  if (route('POST', /^\/api\/lists$/)) {
    const body = await readJson(request);
    const type = ['top5', 'tier', 'city', 'subgenre', 'era'].includes(body.type) ? body.type : 'top5';
    const scope = body.scope ? String(body.scope).slice(0, 40) : null;
    const picks = body.picks;
    const defense = body.defense ? String(body.defense).slice(0, 140) : null;
    const username = body.username ? String(body.username).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) : null;

    if (!picks || (Array.isArray(picks) && picks.length === 0) || (typeof picks === 'object' && Object.keys(picks).length === 0)) {
      return withCookie(json({ error: 'picks_required' }, 400), setCookie);
    }

    const id = b62(6);
    const now = Date.now();
    await db.prepare(
      `INSERT INTO lists (id, user_id, username, type, scope, picks, defense, created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`
    ).bind(id, uid, username, type, scope, JSON.stringify(picks), defense, now).run();

    // translate the list into aggregate votes (top5 / tier only)
    if (type === 'top5' || type === 'tier') {
      // clear this user's prior ballot for this type+scope so re-voting updates
      await db.prepare(
        `DELETE FROM votes WHERE user_id = ?1 AND list_type = ?2 AND scope IS ?3`
      ).bind(uid, type, scope).run();

      const stmts = [];
      if (type === 'top5' && Array.isArray(picks)) {
        picks.slice(0, 5).forEach((slug, i) => {
          stmts.push(db.prepare(
            `INSERT OR REPLACE INTO votes (user_id, artist_slug, list_type, rank, scope, list_id, created_at)
             VALUES (?1,?2,'top5',?3,?4,?5,?6)`
          ).bind(uid, slug, i + 1, scope, id, now));
        });
      } else if (type === 'tier' && typeof picks === 'object') {
        const tierRank = { S: 5, A: 4, B: 3, C: 2, D: 1 };
        for (const [tier, slugs] of Object.entries(picks)) {
          if (!tierRank[tier] || !Array.isArray(slugs)) continue;
          slugs.forEach(slug => {
            stmts.push(db.prepare(
              `INSERT OR REPLACE INTO votes (user_id, artist_slug, list_type, rank, scope, list_id, created_at)
               VALUES (?1,?2,'tier',?3,?4,?5,?6)`
            ).bind(uid, slug, tierRank[tier], scope, id, now));
          });
        }
      }
      if (stmts.length) await db.batch(stmts);
    }

    return withCookie(json({ id }), setCookie);
  }

  // fetch a single list ------------------------------------------------
  if (route('GET', /^\/api\/lists\/[a-zA-Z0-9]+$/)) {
    const id = param(/^\/api\/lists\/([a-zA-Z0-9]+)$/);
    const row = await db.prepare(`SELECT * FROM lists WHERE id = ?1 AND is_hidden = 0`).bind(id).first();
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
      const idx = dayIndex(date) % DAILY_POOL.length;
      const [a, b, theme] = DAILY_POOL[idx];
      try {
        await db.prepare(
          `INSERT INTO daily_matchup (date, artist_a, artist_b, theme) VALUES (?1,?2,?3,?4)`
        ).bind(date, a, b, theme).run();
      } catch { /* race: another request created it */ }
      m = await db.prepare(`SELECT * FROM daily_matchup WHERE date = ?1`).bind(date).first();
    }
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

  if (route('POST', /^\/api\/suggestions\/[0-9]+\/upvote$/)) {
    const id = parseInt(param(/^\/api\/suggestions\/([0-9]+)\/upvote$/), 10);
    await db.prepare(`UPDATE suggestions SET upvotes = upvotes + 1 WHERE id = ?1`).bind(id).run();
    const row = await db.prepare(`SELECT upvotes FROM suggestions WHERE id = ?1`).bind(id).first();
    return withCookie(json({ upvotes: (row && row.upvotes) || 0 }), setCookie);
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
