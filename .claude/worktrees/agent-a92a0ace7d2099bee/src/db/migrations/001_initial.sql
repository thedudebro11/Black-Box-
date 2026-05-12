CREATE TABLE IF NOT EXISTS _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  anonymous_session_id  TEXT NOT NULL,
  telemetry_opt_in      INTEGER NOT NULL DEFAULT 0,
  first_launch_complete INTEGER NOT NULL DEFAULT 0,
  app_version           TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  status            TEXT NOT NULL,
  issue_type        TEXT NOT NULL,
  app_name          TEXT NOT NULL,
  description       TEXT,
  started_at        TEXT NOT NULL,
  stopped_at        TEXT,
  issue_marker_at   TEXT,
  analyzed_at       TEXT,
  trace_file_path   TEXT,
  trace_truncated   INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES sessions(id),
  outcome               TEXT NOT NULL,
  primary_rule_pack_id  TEXT,
  primary_confidence    TEXT,
  primary_cause_name    TEXT,
  primary_output_text   TEXT,
  secondary_results     TEXT,
  all_signals_found     TEXT NOT NULL,
  fix_recommendations   TEXT,
  inconclusive_reason   TEXT,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  scheduled_for     TEXT NOT NULL,
  sent_at           TEXT,
  response          TEXT,
  resolution_notes  TEXT,
  uploaded          INTEGER NOT NULL DEFAULT 0,
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
