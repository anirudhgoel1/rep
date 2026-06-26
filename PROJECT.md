---
name: Rep
slug: rep
type: app
status: active
live_url: https://rep.anirudhgoel.xyz
repo: anirudhgoel1/rep
last_updated: 2026-06-26
last_shipped: 2026-06-26 (release-readiness pass · CSP/Turnstile blocker fixed, live via CI)
tags: [cluster-app, music, dhh, hip-hop, pwa]
---

## What it is
DHH (Desi Hip Hop) ranking and discovery platform. Top 5, tier list, India Top 50, city pride, defend wall, daily 1v1. Vanilla HTML/CSS/JS on Cloudflare Workers Static Assets, no build step. v5 Direction B (gully zine) · kraft + Anton Black + halftone + brutalist tiles.

## Live since 2026-06-14 · release-readiness pass 2026-06-26 (commit b472622)
Prod has been live since 2026-06-14. The 2026-06-26 pass found and fixed a hidden
blocker: the `_headers` CSP did not allowlist `challenges.cloudflare.com` while
Turnstile enforcement was on, so the widget was CSP-blocked and every ballot/tier/
suggestion POST 403'd. Voting was silently dead (0 ballots, misread as "no votes").
Fixed and verified live in-browser (widget mints a token, zero CSP violations).
Same pass: closed a `user_id` leak (impersonation), made hidden-ballot moderation
actually remove votes from the leaderboard, capped tier ballots, swept 276 em/en
dashes from the data + code, switched canonicals + sitemap to the extensionless
(200) form, made versioned assets cache immutable, and made the D1 reseed
non-destructive (was: `DELETE FROM artists` cascade-wiped votes). uid-dedup bypass
on upvotes/daily accepted for launch (leaderboard is Turnstile-gated). After ANY
Turnstile/CSP change, load /build in a real browser and confirm the token mints.

## Earlier state (2026-06-10 hardening pass)
- **Single wrangler.toml** (worker + D1 + assets). `wrangler.api.toml` deleted · the old
  dual-config foot-gun (static deploy silently killing /api) is gone.
- **Worker hardened**: picks validated against the artists table (dupes and unknown slugs 400),
  list+votes written in one atomic batch, suggestion upvotes deduped per user
  (suggestion_upvotes table), per-IP hourly write cap (rate_limits table, 60/h),
  500s no longer leak err.message, /api/health probes a real table.
- **PWA fixed**: sw.js now actually registered from app.js, icon-192/512/maskable rendered
  (scripts/render-icons.mjs) and referenced everywhere.
- **Tier ballots now POST to the API** on export (was top5-only).
- All data fetches versioned (?v=), /data/* has Cache-Control, og/twitter meta on all 14 pages,
  full sitemap.xml, research/ + .cursor/ + *.bak no longer ship publicly.
- **D1 created**: rep-db `114f992a-2099-4a0c-a3a5-011b15638c46`, id wired into wrangler.toml.
  Schema NOT yet applied remotely (owner gate).
- Preview version: https://4b539f95-rep.anirudhgoyal55.workers.dev (live site untouched).

## Deploy (live, automated)
Push to `main` auto-deploys via CI (`.github/workflows/deploy.yml`, the cluster-cli
reusable workflow; CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set as repo secrets).
`npm run deploy` is the manual hatch. D1 schema/seed are already applied to prod;
`npm run db:remote` is now idempotent + non-destructive (safe to re-run).
After every deploy: `node scripts/smoke-api.mjs https://rep.anirudhgoel.xyz`.

## Autonomous tooling
`npm run preflight` · `bump` · `verify:wiki` · `gen:seed` · `render:og` · `smoke:api`
plus `node scripts/render-icons.mjs` (PWA icons) and `node scripts/add-meta.mjs` (og tags, idempotent)

## Key files
- `wrangler.toml` · the only config · worker + D1 + `[[routes]] custom_domain` on rep.anirudhgoel.xyz
- `.github/workflows/deploy.yml` · caller of cluster-cli reusable workflow (repo secrets set, auto-deploy green)
- `index.html` + `app.js` + `styles.css` · v5 main entry
- `*.v4-rejected.{html,css}.bak` · v4 graveyard, kept in repo, excluded from deploy
- `scripts/` · local utility scripts
- `data/` + `db/` · DHH artist/song data + D1 schema/seed

## Known remaining risks
- uid dedup: the anonymous `rep_uid` cookie is unsigned, so rotating it defeats per-user
  dedup on upvotes + daily 1v1. Leaderboard ballots are Turnstile-gated so those are safe.
  Accepted for launch; harden (Turnstile on upvotes, or HMAC-sign the uid) only if abuse shows.
- Moderation is API-only (`/api/admin/*`, ADMIN_TOKEN). Hiding a list now also drops its
  votes from the leaderboard. Still no admin UI · curl or a tiny authed page.
- CI reuses `anirudhgoel1/cluster-cli/...@main` (mutable ref); Node version + whether it runs
  preflight/smoke live in that repo. Pin to a tag/SHA and confirm Node 22 when next in cluster-cli.

## Cross-deps
- None hard. Standalone app within the cluster.
- Reciprocal cross-link strip in credits modal (Pavilion + Quiz Battle + Portfolio)

## Memory
रेप watermark = offensive Hindi loanword, never reintroduce. Design taste: minimal/editorial,
iterate on the accepted v5 base, no rebuilds (see cluster memory design-taste-anti-ai-slop).
