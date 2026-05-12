# Agent: DATA_LAYER

## Role

You are responsible for Phase 2 of the Black Box V1 build: the local SQLite
data layer. You implement the database schema, migration system, and all
session CRUD operations. Everything in Phases 3–12 reads from or writes to
the database you build — your work is the foundation of the entire product.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — Code style, tech stack, constraints
2. `docs/DATA_SCHEMA.md` — The authoritative schema (implement exactly this)
3. `docs/DECISIONS.md` — ADR-003 (synchronous SQLite), ADR-007 (no accounts)
4. `agents/HANDOFF.md` — Confirm Phase 1 is COMPLETE before starting
5. `agents/CONTRACTS.md` — Contract 1 (Session type), Contract 6 (AppSettings)

---

## Prerequisites

Before you begin, verify these are true by checking HANDOFF.md:

- [ ] Phase 1 (Scaffold) status is COMPLETE
- [ ] `better-sqlite3` is either installed or you install it now
- [ ] `src/db/` directory exists (it does from Phase 1 scaffold)
- [ ] `src/db/migrations/` directory exists

If any prerequisite is not met, stop and write a Blocker entry in HANDOFF.md.

---

## Deliverables

You must produce every file below. Do not mark Phase 2 complete until all exist.

### Install
```
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

### Files to Create

**`src/db/schema.ts`**
- Opens/creates the SQLite database at `%APPDATA%/black-box/blackbox.db`
- Runs the migration system on every call to `initDatabase()`
- Exports: `initDatabase(): Database`, `getDatabase(): Database`
- The database handle is a module singleton — opened once, reused

**`src/db/migrations/001_initial.sql`**
- Creates all tables from docs/DATA_SCHEMA.md in one migration:
  - `_migrations` table (self-referential — migration runner tracks itself)
  - `settings` table
  - `sessions` table
  - `analysis_results` table
  - `follow_ups` table

**`src/db/sessions.ts`**
Exports these functions (all synchronous, no async/await):
- `createSession(params: CreateSessionParams): Session`
- `getSession(id: string): Session | null`
- `updateSession(id: string, updates: Partial<Session>): Session`
- `listSessions(limit?: number): Session[]`
- `deleteSession(id: string): void`

**`src/db/analysis.ts`**
Exports:
- `createAnalysisResult(result: AnalysisResult): AnalysisResult`
- `getAnalysisResult(sessionId: string): AnalysisResult | null`

**`src/db/follow-ups.ts`**
Exports:
- `createFollowUp(sessionId: string): FollowUp`
- `getFollowUp(sessionId: string): FollowUp | null`
- `markFollowUpSent(id: string): void`
- `recordFollowUpResponse(id: string, response: string, notes: string | null): void`
- `markFollowUpUploaded(id: string): void`
- `getPendingFollowUps(): FollowUp[]`

**`src/db/settings.ts`**
Exports:
- `getSettings(): AppSettings`
- `setTelemetryOptIn(optIn: boolean): void`
- `markFirstLaunchComplete(): void`
- `initSettings(appVersion: string): void` — called at startup, creates row if missing

**`src/types/global.d.ts`** (update existing file)
Add or update the Session, AppSettings, FollowUp interfaces to match
exactly the contracts defined in `agents/CONTRACTS.md` Contract 1 and 6.

**`tests/unit/db/sessions.test.ts`**
Unit tests covering:
- `createSession` creates a row and returns it
- `getSession` returns null for missing ID
- `getSession` returns correct data for existing ID
- `updateSession` changes only the specified fields
- `listSessions` returns most recent first
- `deleteSession` removes the row

**`tests/unit/db/settings.test.ts`**
Unit tests covering:
- `initSettings` creates the settings row if missing
- `initSettings` does not duplicate if called twice
- `getSettings` returns the correct row
- `setTelemetryOptIn` persists the value

---

## Implementation Notes

### Database Path
```typescript
import { app } from 'electron'
import { join } from 'path'

const DB_PATH = join(app.getPath('userData'), 'blackbox.db')
```

In test environments, use a temp path or in-memory database:
```typescript
const DB_PATH = process.env['NODE_ENV'] === 'test'
  ? ':memory:'
  : join(app.getPath('userData'), 'blackbox.db')
```

### Migration Runner Pattern
```typescript
function runMigrations(db: Database): void {
  // ensure _migrations table exists
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`)

  // read all .sql files from migrations/ directory
  // sort by filename (001_, 002_, etc.)
  // for each file: check if already in _migrations
  // if not: db.exec(sql), then insert into _migrations
}
```

### Anonymous Session ID
Generated at first launch and stored in settings. Use `crypto.randomUUID()`.
This ID never changes for the lifetime of the installation.

```typescript
import { randomUUID } from 'crypto'

function initSettings(appVersion: string): void {
  const existing = db.prepare('SELECT * FROM settings WHERE id = 1').get()
  if (existing) return

  db.prepare(`INSERT INTO settings (...) VALUES (...)`).run({
    anonymous_session_id: randomUUID(),
    telemetry_opt_in: 0,
    first_launch_complete: 0,
    app_version: appVersion,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
}
```

### JSON Serialization
Fields marked as JSON in the schema (`secondary_results`, `all_signals_found`,
`fix_recommendations`, `event_ids_fired`, etc.) are stored as JSON strings.
Always parse on read and stringify on write. Never store raw objects.

```typescript
// When writing:
db.prepare('INSERT INTO analysis_results ...').run({
  ...result,
  secondary_results: JSON.stringify(result.secondary_results),
  all_signals_found: JSON.stringify(result.all_signals_found),
  fix_recommendations: JSON.stringify(result.fix_recommendations),
})

// When reading:
const row = db.prepare('SELECT * FROM analysis_results WHERE ...').get()
return {
  ...row,
  secondary_results: JSON.parse(row.secondary_results),
  all_signals_found: JSON.parse(row.all_signals_found),
  fix_recommendations: JSON.parse(row.fix_recommendations),
}
```

### Main Process Only
The database module runs in the Electron main process only. The renderer
never imports from `src/db/` directly — it calls via IPC. Do not import
`better-sqlite3` in any renderer-side file.

---

## Startup Wiring

After implementing the data layer, update `electron/main.ts` to initialize
the database on startup. Add before `createWindow()`:

```typescript
import { initDatabase } from '../src/db/schema'  // adjust path as needed
import { initSettings } from '../src/db/settings'

app.whenReady().then(() => {
  const db = initDatabase()
  initSettings(app.getVersion())
  // ... rest of existing startup
})
```

---

## Code Style Rules (from docs/CLAUDE.md)

- TypeScript strict mode — zero `any` types
- Synchronous API only — no async/await in DB operations (ADR-003)
- Named exports only
- No comments explaining what the code does — only why if non-obvious
- Error handling: never swallow, always log with context
- Use `unknown` + narrowing instead of `any` for JSON parse results

---

## Completion Gate

Phase 2 is complete when:
1. `npm test -- tests/unit/db` passes with zero failures, zero skipped tests
2. The database file is created on first run at the correct path
3. The database persists between app restarts (sessions survive restart)
4. All tables exist with the correct schema (verify with `.schema` in sqlite3 CLI)
5. The anonymous session ID is generated once and never changes

---

## When Complete

Update `agents/HANDOFF.md`:
1. Set Phase 2 status to COMPLETE
2. Set Gate Met to YES
3. Write a Completion Certificate with evidence that the gate was met
4. Set Last Updated to today's date

Then notify the ORCHESTRATOR that Phase 2 is complete so Phases 3 and 4
can be delegated in parallel.
