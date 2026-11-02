export const SCHEMA = `
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  custom_url TEXT,
  country TEXT,
  thumbnail_url TEXT,
  subscriber_count INTEGER,
  view_count INTEGER,
  video_count INTEGER,
  details_fetched_at TEXT,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','completed','partial','failed')),
  trigger TEXT NOT NULL DEFAULT 'manual',
  options TEXT,
  videos_found INTEGER DEFAULT 0,
  new_videos INTEGER DEFAULT 0,
  snapshots_created INTEGER DEFAULT 0,
  quota_used INTEGER DEFAULT 0,
  errors TEXT
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  title TEXT NOT NULL,
  description TEXT,
  published_at TEXT NOT NULL,
  category_id TEXT,
  primary_category TEXT,
  thumbnail_url TEXT,
  url TEXT NOT NULL,
  duration_seconds INTEGER,
  tags TEXT,
  default_language TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(primary_category);

CREATE TABLE IF NOT EXISTS video_categories (
  id TEXT NOT NULL,
  region_code TEXT NOT NULL,
  title TEXT NOT NULL,
  assignable INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (id, region_code)
);

CREATE TABLE IF NOT EXISTS video_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL REFERENCES videos(id),
  run_id INTEGER NOT NULL REFERENCES collection_runs(id),
  region_code TEXT NOT NULL,
  category_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('most_popular','search')),
  query TEXT NOT NULL DEFAULT '',
  rank INTEGER,
  UNIQUE (video_id, run_id, region_code, category_key, source, query)
);
CREATE INDEX IF NOT EXISTS idx_sources_video ON video_sources(video_id);
CREATE INDEX IF NOT EXISTS idx_sources_region ON video_sources(region_code, category_key);

CREATE TABLE IF NOT EXISTS video_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL REFERENCES videos(id),
  run_id INTEGER REFERENCES collection_runs(id),
  captured_at TEXT NOT NULL,
  view_count INTEGER NOT NULL,
  like_count INTEGER,
  comment_count INTEGER,
  views_gained INTEGER,
  hours_since_prev REAL,
  views_per_hour REAL,
  views_per_day REAL,
  engagement_rate REAL,
  video_age_hours REAL,
  velocity_basis TEXT NOT NULL CHECK (velocity_basis IN ('snapshot_delta','lifetime_average','none')),
  UNIQUE (video_id, run_id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_video_time ON video_snapshots(video_id, captured_at);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  keywords TEXT,
  first_detected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topic_videos (
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  similarity REAL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (topic_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_topic_videos_video ON topic_videos(video_id);

CREATE TABLE IF NOT EXISTS trend_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  computed_at TEXT NOT NULL,
  score REAL NOT NULL,
  confidence REAL,
  trend_status TEXT,
  components TEXT,
  weights TEXT
);
CREATE INDEX IF NOT EXISTS idx_scores_topic_time ON trend_scores(topic_id, computed_at);

CREATE TABLE IF NOT EXISTS research_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  model TEXT,
  report TEXT NOT NULL,
  sources TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_topic ON research_reports(topic_id);

CREATE TABLE IF NOT EXISTS animation_ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  research_report_id INTEGER REFERENCES research_reports(id) ON DELETE SET NULL,
  concept_index INTEGER NOT NULL,
  idea TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ideas_topic ON animation_ideas(topic_id);

CREATE TABLE IF NOT EXISTS saved_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  animation_idea_id INTEGER REFERENCES animation_ideas(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN
    ('discovered','researching','approved','scripting','asset_preparation','animation','editing','published')),
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON saved_projects(status);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quota_usage (
  day TEXT PRIMARY KEY,   -- Pacific Time date, matches YouTube's quota reset
  units INTEGER NOT NULL DEFAULT 0
);
`;