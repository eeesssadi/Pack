
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS studies (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'Maroc',
  variants_json TEXT NOT NULL DEFAULT '[]',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'A_VERIFIER',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (study_id)
    REFERENCES studies(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_competitors_study
ON competitors(study_id);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  competitor_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL,
  unit TEXT,
  period_start TEXT,
  period_end TEXT,
  collected_at TEXT NOT NULL,
  source_url TEXT,
  method TEXT NOT NULL DEFAULT 'MANUEL',
  status TEXT NOT NULL DEFAULT 'A_VERIFIER',
  evidence TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (competitor_id)
    REFERENCES competitors(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_observations_competitor
ON observations(competitor_id);
