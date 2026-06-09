---
name: Rep
slug: rep
type: app
status: active
live_url: https://rep.anirudhgoel.xyz
repo: anirudhgoel1/rep
last_updated: 2026-06-10
last_shipped: 2026-06-10 (preview version uploaded · prod cutover pending owner go)
tags: [cluster-app, music, dhh, hip-hop, pwa]
---

## What it is
DHH (Desi Hip Hop) ranking and discovery platform. Top 5, tier list, India Top 50, city pride, defend wall, daily 1v1. Vanilla HTML/CSS/JS on Cloudflare Workers Static Assets, no build step. v5 Direction B (gully zine) · kraft + Anton Black + halftone + brutalist tiles.

## Where we are (2026-06-10 hardening pass)
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

## To go fully live (owner go-ahead, ~2 min)
1. `npm run db:remote` · applies schema + seeds 90 artists to remote D1
2. `npm run deploy` · ships worker + assets to rep.anirudhgoel.xyz
3. `gh secret set CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` on the repo · CI deploy

## Autonomous tooling
`npm run preflight` · `bump` · `verify:wiki` · `gen:seed` · `render:og` · `smoke:api`
plus `node scripts/render-icons.mjs` (PWA icons) and `node scripts/add-meta.mjs` (og tags, idempotent)

## Key files
- `wrangler.toml` · the only config · worker + D1 + `[[routes]] custom_domain` on rep.anirudhgoel.xyz
- `.github/workflows/deploy.yml` · caller of cluster-cli reusable workflow (still needs repo secrets)
- `index.html` + `app.js` + `styles.css` · v5 main entry
- `*.v4-rejected.{html,css}.bak` · v4 graveyard, kept in repo, excluded from deploy
- `scripts/` · local utility scripts
- `data/` + `db/` · DHH artist/song data + D1 schema/seed

## Known remaining risks
- Sybil voting is rate-limited per IP but not solved · real fix is Turnstile on POSTs (owner call).
- No moderation endpoint · `is_hidden` exists in schema, flipping it is manual D1 for now.
- `/X.html` 307-redirects to `/X` (Workers assets default) while canonicals say `.html` · cosmetic.

## Cross-deps
- None hard. Standalone app within the cluster.
- Reciprocal cross-link strip in credits modal (Pavilion + Quiz Battle + Portfolio)

## Memory
रेप watermark = offensive Hindi loanword, never reintroduce. Design taste: minimal/editorial,
iterate on the accepted v5 base, no rebuilds (see cluster memory design-taste-anti-ai-slop).
