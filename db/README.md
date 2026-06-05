# Rep · D1 database

## Files

| File | Purpose |
|------|---------|
| `0001_init.sql` | Schema (artists, votes, lists, suggestions, daily) |
| `0002_seed_artists.sql` | Auto-generated from `data/artists.json` |

## Regenerate seed

```bash
npm run gen:seed
```

## Local dev (Worker + D1)

1. Paste real `database_id` into `wrangler.api.toml` (or use `--local` without remote id).
2. `npm run db:local`
3. `npm run dev`
4. `npm run smoke:api`

## Production

```bash
npm run db:remote   # after wrangler auth + database_id set
npm run deploy:api
```

Static-only deploy (`npm run deploy`) does **not** need D1 — rankings use client-side seed until API ships.
