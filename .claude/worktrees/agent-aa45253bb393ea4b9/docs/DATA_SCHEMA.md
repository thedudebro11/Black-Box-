# Black Box — Data Schema V1

## Local SQLite Schema

All tables live in a single SQLite file at:
`%APPDATA%/black-box/blackbox.db`

---

## Table: settings

Stores app-level configuration. Single row only.

```sql
CREATE TABLE settings (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  anonymous_session_id  TEXT NOT NULL,        -- UUID generated at first launch, never changes
  telemetry_opt_in      INTEGER NOT NULL DEFAULT 0,  -- 0 = opted out, 1 = opted in
  first_launch_complete INTEGER NOT NULL DEFAULT 0,  -- 0 = not shown onboarding, 1 = shown
  app_version           TEXT NOT NULL,
  created_at            TEXT NOT NULL,        -- ISO 8601
  updated_at            TEXT NOT NULL         -- ISO 8601
);
```

---

## Table: sessions

One row per recording session.

```sql
CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,   -- UUID, generated locally
  status            TEXT NOT NULL,      -- 'recording' | 'analyzing' | 'complete' | 'inconclusive' | 'error' | 'interrupted'
  issue_type        TEXT NOT NULL,      -- 'crash' | 'freeze' | 'bsod' | 'app_hang'
  app_name          TEXT NOT NULL,      -- user-entered app or game name
  description       TEXT,              -- optional user description
  started_at        TEXT NOT NULL,      -- ISO 8601
  stopped_at        TEXT,              -- ISO 8601, null if recording interrupted
  issue_marker_at   TEXT,              -- ISO 8601, null if user never pressed marker
  analyzed_at       TEXT,              -- ISO 8601, null until analysis completes
  trace_file_path   TEXT,              -- path to NDJSON trace file
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
```

---

## Table: analysis_results

One row per completed analysis. Linked to sessions.

```sql
CREATE TABLE analysis_results (
  id                    TEXT PRIMARY KEY,   -- UUID
  session_id            TEXT NOT NULL REFERENCES sessions(id),
  outcome               TEXT NOT NULL,      -- 'diagnosed' | 'inconclusive' | 'error'
  primary_rule_pack_id  TEXT,              -- null if inconclusive
  primary_confidence    TEXT,              -- 'HIGH' | 'MEDIUM' | 'LOW' | null
  primary_cause_name    TEXT,              -- plain language cause name
  primary_output_text   TEXT,              -- plain language explanation
  secondary_results     TEXT,              -- JSON array of secondary RuleResult objects
  all_signals_found     TEXT NOT NULL,     -- JSON array of all SignalMatch objects
  fix_recommendations   TEXT,              -- JSON array of FixStep objects
  inconclusive_reason   TEXT,              -- plain language if outcome = inconclusive
  created_at            TEXT NOT NULL
);
```

---

## Table: follow_ups

One row per inconclusive session that has a follow-up scheduled.

```sql
CREATE TABLE follow_ups (
  id                TEXT PRIMARY KEY,   -- UUID
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  scheduled_for     TEXT NOT NULL,      -- ISO 8601 — 48 hours after analysis
  sent_at           TEXT,              -- ISO 8601, null until notification fires
  response          TEXT,              -- 'yes' | 'no' | 'still_working' | null
  resolution_notes  TEXT,              -- free text from user, null if no response
  uploaded          INTEGER DEFAULT 0, -- 0 = not uploaded, 1 = uploaded to Supabase
  expires_at        TEXT NOT NULL,     -- ISO 8601 — 7 days after scheduled_for
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
```

---

## NDJSON Trace File Format

Each recording session writes a `.ndjson` trace file at:
`%APPDATA%/black-box/traces/{session_id}.ndjson`

Each line is a JSON object representing one event or sample.

### Event record (from Windows Event Log)
```json
{
  "type": "event",
  "ts": "2024-01-15T14:23:45.123Z",
  "source": "System",
  "provider": "nvlddmkm",
  "event_id": 153,
  "level": "Error",
  "message": "Reset TDR occurred on GPUID:100",
  "collected_at": "2024-01-15T14:23:47.000Z"
}
```

### Process record (snapshot)
```json
{
  "type": "process_snapshot",
  "ts": "2024-01-15T14:23:45.000Z",
  "processes": [
    {
      "name": "Discord.exe",
      "pid": 4821,
      "cpu_pct": 1.2,
      "memory_mb": 284
    }
  ]
}
```

### Metrics sample
```json
{
  "type": "metrics",
  "ts": "2024-01-15T14:23:45.000Z",
  "cpu_pct": 72.4,
  "ram_used_mb": 14200,
  "ram_total_mb": 16384,
  "ram_pct": 86.7,
  "disk_latency_ms": 12,
  "gpu_pct": 94.1,
  "vram_used_mb": 7800,
  "vram_total_mb": 8192
}
```

### Issue marker
```json
{
  "type": "issue_marker",
  "ts": "2024-01-15T14:23:50.000Z"
}
```

### Session boundary events
```json
{ "type": "session_start", "ts": "2024-01-15T14:18:45.000Z" }
{ "type": "session_stop", "ts": "2024-01-15T14:24:15.000Z" }
```

---

## Supabase Schema (Telemetry Only)

Table: `bb_sessions`

This is the only table in Supabase for V1.
It receives anonymized session data from opted-in users.

```sql
CREATE TABLE bb_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_session_id     TEXT NOT NULL,        -- anonymous, matches local session ID
  anonymous_device_id   TEXT NOT NULL,        -- anonymous_session_id from settings table
  app_version           TEXT NOT NULL,
  issue_type            TEXT NOT NULL,
  os_version            TEXT NOT NULL,        -- e.g. "Windows 11 23H2"
  gpu_model             TEXT,                 -- e.g. "NVIDIA GeForce RTX 4090"
  gpu_driver_version    TEXT,
  ram_total_gb          INTEGER,
  event_ids_fired       JSONB NOT NULL,       -- array of {event_id, provider, count}
  overlay_processes     JSONB,                -- array of process names only
  anti_cheat_processes  JSONB,                -- array of process names only
  metrics_summary       JSONB,                -- {peak_cpu_pct, peak_ram_pct, peak_gpu_pct}
  diagnosis_outcome     TEXT NOT NULL,        -- 'diagnosed' | 'inconclusive' | 'error'
  primary_rule_pack_id  TEXT,
  primary_confidence    TEXT,
  follow_up_response    TEXT,                 -- populated later if user responds
  resolution_notes      TEXT,                 -- populated later if user provides
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  follow_up_updated_at  TIMESTAMPTZ
);
```

### Supabase RLS Policy
```sql
-- Anonymous inserts allowed (no auth required)
CREATE POLICY "anonymous insert"
ON bb_sessions FOR INSERT
WITH CHECK (true);

-- No reads allowed from client (write-only from app)
CREATE POLICY "no client reads"
ON bb_sessions FOR SELECT
USING (false);
```

---

## Migration System

Migrations live in `src/db/migrations/`.
Each migration is a numbered SQL file: `001_initial.sql`, `002_add_field.sql` etc.

The migration runner in `src/db/schema.ts` runs on every app start,
applies any pending migrations in order, and records applied migrations
in a `_migrations` table.

```sql
CREATE TABLE _migrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT NOT NULL UNIQUE,
  applied_at  TEXT NOT NULL
);
```
