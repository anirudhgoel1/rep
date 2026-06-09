-- DHH-App · D1 schema migration v1
-- Run via: wrangler d1 execute <db-name> --file=db/0001_init.sql
-- Order: tables first, then indexes. SQLite-flavored.

-- ============================================================
-- 1. Static reference: artists (seeded from data/artists.json)
-- ============================================================
CREATE TABLE artists (
  slug TEXT PRIMARY KEY,
  stage_name TEXT NOT NULL,
  real_name TEXT,
  city_represented TEXT NOT NULL,
  city_of_origin TEXT,
  state TEXT,
  era TEXT NOT NULL,
  subgenre TEXT NOT NULL,
  language TEXT NOT NULL,            -- JSON array
  tags TEXT NOT NULL,                -- JSON array
  notable_tracks TEXT NOT NULL,      -- JSON array
  popularity_tier TEXT NOT NULL CHECK (popularity_tier IN ('S','A','B','C','D')),
  active_status TEXT NOT NULL CHECK (active_status IN ('Active','Hiatus','RIP','Comeback Era')),
  label TEXT,
  spotify_url TEXT,
  spotify_id TEXT,
  wikipedia_url TEXT,
  instagram_handle TEXT,
  image_url TEXT,
  is_votable INTEGER NOT NULL DEFAULT 1,
  is_collective INTEGER NOT NULL DEFAULT 0,
  is_duo INTEGER NOT NULL DEFAULT 0,
  rip_date TEXT,
  note TEXT,
  disambiguation TEXT
);
CREATE INDEX idx_artists_city ON artists(city_represented);
CREATE INDEX idx_artists_state ON artists(state);
CREATE INDEX idx_artists_era ON artists(era);
CREATE INDEX idx_artists_subgenre ON artists(subgenre);
CREATE INDEX idx_artists_tier ON artists(popularity_tier);

-- ============================================================
-- 2. User-generated lists (top5, tier, scoped variants)
-- ============================================================
CREATE TABLE lists (
  id TEXT PRIMARY KEY,                              -- 6-char base62
  user_id TEXT NOT NULL,
  username TEXT,                                    -- optional @handle
  type TEXT NOT NULL CHECK (type IN ('top5','tier','city','subgenre','era')),
  scope TEXT,                                       -- e.g. 'mumbai', 'punjabi-wave', null = all-India
  picks TEXT NOT NULL,                              -- JSON
  defense TEXT,                                     -- "defend my #1" line, <=140 chars
  created_at INTEGER NOT NULL,
  share_count INTEGER NOT NULL DEFAULT 0,
  upvotes INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,           -- soft moderation flag
  is_hidden INTEGER NOT NULL DEFAULT 0              -- soft moderation flag
);
CREATE INDEX idx_lists_user ON lists(user_id);
CREATE INDEX idx_lists_type_scope ON lists(type, scope, created_at DESC);
CREATE INDEX idx_lists_upvotes ON lists(upvotes DESC, created_at DESC) WHERE is_hidden = 0;
CREATE INDEX idx_lists_featured ON lists(is_featured DESC, upvotes DESC) WHERE is_hidden = 0;

-- ============================================================
-- 3. Aggregation source: votes (one row per user × artist × type × scope)
-- ============================================================
CREATE TABLE votes (
  user_id TEXT NOT NULL,
  artist_slug TEXT NOT NULL,
  list_type TEXT NOT NULL CHECK (list_type IN ('top5','tier')),
  rank INTEGER,                                     -- 1..5 for top5; S=5/A=4/B=3/C=2/D=1 for tier
  scope TEXT,                                       -- mirrors lists.scope
  list_id TEXT NOT NULL,                            -- back-pointer
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, artist_slug, list_type, scope),
  FOREIGN KEY (artist_slug) REFERENCES artists(slug) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);
CREATE INDEX idx_votes_aggregate ON votes(artist_slug, list_type, scope);
CREATE INDEX idx_votes_list ON votes(list_id);

-- ============================================================
-- 4. Daily 1v1
-- ============================================================
CREATE TABLE daily_matchup (
  date TEXT PRIMARY KEY,                            -- YYYY-MM-DD Asia/Kolkata
  artist_a TEXT NOT NULL,
  artist_b TEXT NOT NULL,
  votes_a INTEGER NOT NULL DEFAULT 0,
  votes_b INTEGER NOT NULL DEFAULT 0,
  theme TEXT,
  FOREIGN KEY (artist_a) REFERENCES artists(slug),
  FOREIGN KEY (artist_b) REFERENCES artists(slug)
);

CREATE TABLE daily_votes (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  pick TEXT NOT NULL,                               -- artist_slug
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (date) REFERENCES daily_matchup(date),
  FOREIGN KEY (pick) REFERENCES artists(slug)
);
CREATE INDEX idx_daily_votes_date_pick ON daily_votes(date, pick);

-- ============================================================
-- 5. Defense-wall upvotes (one per user per list)
-- ============================================================
CREATE TABLE list_upvotes (
  user_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, list_id),
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. v2 hook tables (created empty now so we don't migrate later)
-- ============================================================
CREATE TABLE beef_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_on TEXT NOT NULL,                        -- YYYY-MM-DD
  actor_a TEXT NOT NULL,
  actor_b TEXT,
  type TEXT NOT NULL,                               -- 'diss-track','reply','reconciliation','beef-start','beef-end'
  title TEXT NOT NULL,
  source_url TEXT,
  notes TEXT,
  FOREIGN KEY (actor_a) REFERENCES artists(slug),
  FOREIGN KEY (actor_b) REFERENCES artists(slug)
);
CREATE INDEX idx_beef_actor_a ON beef_events(actor_a);
CREATE INDEX idx_beef_actor_b ON beef_events(actor_b);

CREATE TABLE predictions (
  user_id TEXT NOT NULL,
  artist_slug TEXT NOT NULL,
  predicted_at INTEGER NOT NULL,
  threshold_monthly_listeners INTEGER NOT NULL DEFAULT 1000000,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER,
  was_correct INTEGER,
  PRIMARY KEY (user_id, artist_slug),
  FOREIGN KEY (artist_slug) REFERENCES artists(slug)
);

CREATE TABLE bars (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt_date TEXT NOT NULL,
  text TEXT NOT NULL,
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  is_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_bars_prompt ON bars(prompt_date, upvotes DESC);

CREATE TABLE suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  justification TEXT,
  upvotes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','admitted','rejected')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_suggestions_status ON suggestions(status, upvotes DESC);

CREATE TABLE suggestion_upvotes (
  user_id TEXT NOT NULL,
  suggestion_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, suggestion_id),
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE
);

-- per-IP hourly write budget · see rateLimited() in src/worker.js
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,            -- '<ip>:<hour-bucket>'
  bucket INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- 7. Metadata / kvish settings
-- ============================================================
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Seed default settings
INSERT INTO settings (key, value, updated_at) VALUES
  ('leaderboard_last_aggregated', '0', strftime('%s','now')),
  ('photo_pipeline_last_run', '0', strftime('%s','now')),
  ('schema_version', '1', strftime('%s','now'));
