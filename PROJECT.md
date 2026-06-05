---
name: Rep
slug: rep
type: app
status: active
live_url: https://rep.anirudhgoel.xyz
repo: anirudhgoel1/rep
last_updated: 2026-05-23
last_shipped: 2026-06-07 (pending — run scripts/deploy.ps1)
tags: [cluster-app, music, dhh, hip-hop, pwa]
---

## What it is
DHH (Desi Hip Hop) ranking and discovery platform. Top 5, tier list, India Top 50, city pride, defend wall, daily 1v1. Vanilla HTML/CSS/JS on Cloudflare Workers Static Assets, no build step. v5 Direction B (gully zine) — kraft + Anton Black + halftone + brutalist tiles.

## Where we are
Local repo: **90 artists**, bios parity, preflight green, `og.png` regenerated, API seed-fallback UX. Production still **85** until deploy.

Production has **no Worker API** (`/api/*` → 404). Client shows seed-mode banner; ballots API copy is honest.

## What's next (needs your Cloudflare auth once)
1. `.\scripts\deploy.ps1` — ships static 90-artist bundle
2. Paste D1 `database_id` in `wrangler.api.toml` → `npm run deploy:api` + `npm run db:remote`
3. `gh secret set CLOUDFLARE_API_TOKEN` on repo — CI deploy

## Autonomous tooling
`npm run preflight` · `bump` · `verify:wiki` · `gen:seed` · `render:og` · `smoke:api`

## Key files
- `wrangler.toml` — `[[routes]] custom_domain = true` on `rep.anirudhgoel.xyz`
- `.github/workflows/deploy.yml` — caller of cluster-cli reusable workflow (currently failing on missing secret)
- `index.html` + `app.js` + `styles.css` — v5 main entry
- `*.v4-rejected.{html,css}.bak` — kept as v4 graveyard, do not restore
- `scripts/` — local utility scripts
- `data/` + `db/` — DHH artist/song data

## Cross-deps
- None hard. Standalone app within the cluster.
- Reciprocal cross-link strip in credits modal (Pavilion + Quiz Battle + Portfolio)

## Memory
Long-form dossier: `~/.claude-warp/.../memory/project_rep_dhh.md`
Failure modes: `feedback_rep_design_failure_modes.md` — read BEFORE touching styles. रेप watermark = offensive Hindi loanword, never reintroduce.
Case study: `case-study-rep.md`
