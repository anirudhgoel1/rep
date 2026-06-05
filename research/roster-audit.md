# Rep roster audit — 2026-06-07 (v2.0 expansion)

Source of truth: `data/artists.json` (v2.0). Bios: `data/bios.json`.  
Wikipedia API batch: `research/wikipedia-audit-results.json` (from `node scripts/verify-wikipedia.mjs`).

## Coverage

| Check | Status |
|-------|--------|
| Artist count | 90 |
| Bio coverage | 90/90 (headline + 3 paragraphs) |
| Slug parity | artists ↔ bios keys match |
| Wikipedia URLs | 33+ artists; Emiway `wikipedia_url` null (no stable en WP) |

## v2.0 expansion (2026-06-07)

| Slug | `real_name` | City / state | `respect_tier` | Notes |
|------|-------------|--------------|----------------|-------|
| `spitfire` | Nitin Mishra | Chhatarpur, MP | B | Gully Boy / scene |
| `epr` | Santhanam Srinivasan Iyer | Kolkata, WB | A | Emcee Poet Rapper |
| `arivu` | Arivarasu Kalainesan | Chennai / Arakkonam, TN | A | Tamil conscious |
| `dee-mc` | Deepa Unnikrishnan | Kalyan, MH | B | Female MC |
| `kaam-bhaari` | Kunal Anand Pandagle | Mumbai / Kandivali | B | Gully Boy |

Spotify IDs oEmbed-verified; images via oEmbed where available.

**Data fix (same pass):** `arpit-bala` was missing `slug` in `artists.json` (broke BY_SLUG lookup); slug restored.

## v1.9 corrections (2026-06-06)

| Slug | Field | Was | Now | Source |
|------|--------|-----|-----|--------|
| `emiway-bantai` | `wikipedia_url` | broken en links | null + note | No en WP article found 2026-06-06 |
| `channi-nattan` | `real_name` | Chamandeep Singh | Chanveer Natt | IMDb |
| `channi-nattan` | `city_*`, `state` | Toronto/Punjab | Surrey, British Columbia | Billboard, IMDb |
| `diljit-dosanjh` | `real_name` | Diljit Dosanjh | Daljit Singh Dosanjh | IMDb |
| `sunny-malton` | `city_of_origin` | Punjab | Malton | Wikipedia |
| `talwiinder` | `city_*` | Punjab | Tarn Taran | Wikipedia |
| `tsumyoki` | `city_of_origin` | Goa | Margao | Bio / press |
| `tegi-pannu` | `real_name` | Tegi Pannu | Tegbir Singh Pannu | Press |
| `raf-saperra` | `city_of_origin` | UK | London | Bio |
| `young-galib` | `real_name` | null | Faisal Sheikh | bantai.in |
| `moksh-meghalaya` | `real_name` | null | Mrinal Paul | Rolling Stone India |
| `sikdar` | `real_name` | null | Saurab Sikdar | Northeast Today |
| `arpit-bala` | `city_represented`, `state` | Faridabad/Delhi, Delhi NCR | Faridabad, Haryana | Press; origin Ranchi kept |

Bio updates: `channi-nattan`, `young-galib`, `arpit-bala` (Ranchi birth).

## v1.8 corrections (2026-06-05)

| Slug | Field | Was | Now |
|------|--------|-----|-----|
| `shah-rule` | name / origin | Shahrukh Kotwal, Mumbai | Rahul Shahani, Hong Kong |
| `devil` | `real_name` | null | Dhaval Parab |
| `vijay-dk` | cities | Pune | Mumbai / Mankhurd |
| `reble`, `minimi`, `sikdar` | origins | metro | Nangbah, Nalbari, Chabua |
| `sambata` | name / city | Sambata, Maharashtra | Pratham Jogdand, Pune |
| `naam-sujal` | cities | null | Nagpur |
| `mc-square` | origin spelling | Bhavana | Bhawana |

## Wikipedia API pass (33 with URLs)

- **Verified OK (sample):** Divine, Naezy, MC Stan, Seedhe Maut, Shubh, Brodha V, Ikka, Raftaar, Honey Singh, Bohemia, AP Dhillon, Jassa Dhillon, Paal Dabba, Tsumyoki.
- **False alarm:** Badshah — full name includes Sisodia; lead extract omits it.
- **Fixed from API:** Sunny Malton origin → Malton.
- **Rate-limited (re-check manually):** KRSNA, King, Prabh Deep, Sidhu Moose Wala, Karan Aujla, Raja Kumari, Yashraj, G'nie, Macnivil.

## `real_name` still null (4 artists)

| Slug | Reason |
|------|--------|
| `vijay-dk` | No published legal name found |
| `jelo` | No public legal name (Azadi / press use JELO only) |
| `freakyy` | No public legal name (Tripura scene) |
| `samad-khan` | Indie artist; no legal name in press (not Samad King) |

## Still monitor (not wrong, but fuzzy)

| Slug | Note |
|------|------|
| `bohemia` | Rep “Punjab”; born Karachi, US career — intentional region tag |
| `lil-golu` | Delhi in roster; some tabloids say Mumbai — Delhi + Mafia Mundeer era preferred |
| `hanumankind` | Kerala origin; Bengaluru rep — Wikipedia “Hyderabad” in extract is noise |
| `samad-khan` | Gurugram roots, Mumbai base — distinct from electronic artist Samad King |

## Expansion candidates (not on 90)

Hard Kaur, Saud, Poetik Justis, Flowbo/Hellac/Thoratt, Riar Saab, MC Heam, Srushti Tawade — add only with full metadata + bio pass.

## Social + Wikipedia (2026-06-07)

| Slug | Instagram | en.wikipedia |
|------|-----------|--------------|
| `spitfire` | @ntnmshra (IncInk / YouTube credits) | none — left null |
| `epr` | @epr_svnslas_iyer | [Underground Authority](https://en.wikipedia.org/wiki/Underground_Authority) (band article; solo page N/A) |
| `arivu` | @therukural | [Arivu](https://en.wikipedia.org/wiki/Arivu) |
| `dee-mc` | @deemcofficial (already set) | none — left null |
| `kaam-bhaari` | @kaambhaari | none — left null |

Full API pass: `npm run verify:wiki` → **34 URLs checked, 0 errors, 0 name mismatches, 0 city flags** (see `research/wikipedia-audit-results.json`). Script v1.1: word-boundary place hints, state/region matching, band-article name skip.

## Data hygiene (2026-06-08)

| Check | Status |
|-------|--------|
| Instagram null | 0 (was 2: `sikdar` → @sikdarofficial, `freakyy` → @freakyyxaxa) |
| `real_name` null | 4 documented: `vijay-dk`, `jelo`, `freakyy`, `samad-khan` |
| Wikipedia null | 56 artists — no stable en page; 34 with URLs audited via `verify:wiki` |
| Roster expansion | **closed** at 90 — candidates in doc only |

## Ops

```bash
npm run preflight                   # slug/bio/seed parity before ship
npm run verify:wiki                 # refresh API audit JSON
npm run gen:seed                    # D1 seed from artists.json (90 rows)
npm run bump                        # cache-bust HTML + app.js fetches
npm run render:og                   # og.png from roster count
npm run smoke:api                   # local Worker smoke (after npm run dev)
npm run deploy                      # Cloudflare static assets
npm run deploy:api                  # Worker + D1 (wrangler.api.toml)
npm run db:remote                   # production D1 (after database_id set)
node .preview-server.mjs            # http://localhost:8080/
```
