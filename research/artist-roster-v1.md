# Rep artist roster v1 — inclusion criteria

**Canonical data:** `data/artists.json` (90 artists, v2.0 as of 2026-06-07).  
**Bios:** `data/bios.json` (90/90).  
**Audit log:** `research/roster-audit.md`.

## Purpose

Rep is not a complete database of Indian hip hop. It is an **editorial 90-artist roster** for hardcore Desi Hip Hop fans: ranking, discovery, city pride, and argument — with facts that survive Wikipedia and press cross-checks.

## Inclusion rules

1. **Scene relevance** — Artist must matter to DHH discourse (gully wave, regional language rap, NE cypher ecosystem, Punjabi wave, conscious Delhi, etc.), not only Bollywood playback.
2. **Verifiable identity** — Stage name, and `real_name` when published in reliable sources. If no legal name exists publicly, leave `real_name` null and document in `note`.
3. **Geography** — `city_represented` = where they rep in music; `city_of_origin` = birthplace or upbringing when known. Use specific cities (Mankhurd, Tarn Taran), not only state names, when sources allow.
4. **Spotify anchor** — `spotify_url` HTTP-verified (see `_meta.notes` in artists.json).
5. **Respect tier** — `respect_tier` S–D reflects hardcore-head reverence; `is_crossover: 1` buries Bollywood-pop from default rankings but keeps search and “by streams” mode.
6. **Bio bar** — Every slug gets a bio: lowercase headline + three paragraphs; no invented facts (see `bios.json` `_meta.principle`).

## Excluded by design (examples)

Added in v2.0 (2026-06-07): Spitfire, EPR, Arivu, Dee MC, Kaam Bhaari.

**Roster expansion is closed at 90** (2026-06-08). Candidates for a future v3 pass only:

- Gully Boy adjacent: MC Heam  
- Regional giants: Hard Kaur  
- Label depth: Flowbo, Hellac, Thoratt, Saud, Riar Saab  

Community nominations go to the homepage **“who’s missing?”** API — not automatic admission.

## Data maintenance

| Step | Command / file |
|------|----------------|
| Edit roster | `data/artists.json` |
| Edit bios | `data/bios.json` |
| Wikipedia batch check | `node scripts/verify-wikipedia.mjs` |
| Regenerate D1 seed | `node scripts/gen-seed.mjs` → `db/0002_seed_artists.sql` |
| Changelog | `research/roster-audit.md` + `_meta.data_corrections_v*` |

After metadata changes, bump `?v=` on `artists.json` / `bios.json` fetches in `app.js` and redeploy static assets.

## Ranking honesty (product)

- **No ballots:** Order is a **deterministic seed** from `respect_tier` (or `popularity_tier` in streams mode) + slug hash — stable for preview and cold start.
- **With ballots:** `/api/leaderboard` live points override the seed when `ballots > 0`.
- Copy must never imply “ranked by you” when only the seed is active.

## Expansion checklist (artist #91+)

1. Press/Wikipedia fact sheet  
2. Spotify URL verify  
3. Add to `artists.json` (increment `_meta.total_artists`)  
4. Write bio in `bios.json`  
5. Bump `data-roster-count` / `syncRosterCountUI` (via `loadArtists`)  
6. Regenerate seed SQL (`node scripts/gen-seed.mjs`)  
7. Entry in `roster-audit.md`
