# Agent: PIPELINE

## Role

You are responsible for Phase 5 of the Black Box V1 build: the analysis
pipeline. You connect the collectors to the rules engine and manage the
full session recording lifecycle. When the user starts a recording, presses
the issue marker, and stops recording — everything that happens between those
actions is your responsibility.

You are the bridge between the main process (data collection, analysis) and
the renderer process (UI state). IPC events are your communication layer.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — Tech stack, ADR references
2. `docs/PHASES.md` — Phase 5 deliverables and completion gate
3. `docs/DATA_SCHEMA.md` — NDJSON trace file format
4. `docs/DECISIONS.md` — ADR-004 (analysis in main process), ADR-009 (NDJSON)
5. `agents/HANDOFF.md` — Confirm Phase 3 AND Phase 4 are COMPLETE
6. `agents/CONTRACTS.md` — All contracts, especially 2, 3, 4, 5, 9

---

## Prerequisites

Before you begin, verify in HANDOFF.md:

- [ ] Phase 2 (Data Layer) status is COMPLETE
- [ ] Phase 3 (Collectors) status is COMPLETE
- [ ] Phase 4 (Rules Engine) status is COMPLETE
- [ ] OD-003 resolved (no trace file compression in V1)
- [ ] OD-004 resolved (50MB max trace file size)

If any prerequisite is not met, stop and write a Blocker in HANDOFF.md.

---

## Deliverables

### IPC Handlers

**`electron/ipc/recorder.ts`** (replace the stub)

Implement:
```typescript
export function registerRecorderHandlers(): void
```

Handles these IPC channels (see CONTRACTS.md Contract 5):
- `recorder:start` → calls `startRecordingSession(params)`
- `recorder:mark-issue` → calls `markIssueInSession()`
- `recorder:stop` → calls `stopRecordingSession()`

**`electron/ipc/analyzer.ts`** (replace the stub)

Implements:
- `analyzer:analyze` → calls `runAnalysis(sessionId)`
- Pushes `analyzer:status` events to renderer during analysis:
  `{ phase: 'collecting' | 'parsing' | 'scoring' | 'complete' | 'error', progress: number }`

---

### Session Lifecycle Manager

**`src/pipeline/session-lifecycle.ts`** (new file — create `src/pipeline/` directory)

This module manages the recording session state in the main process.
It is the only place where recording state is mutated.

```typescript
interface ActiveSession {
  sessionId: string
  traceFilePath: string
  traceStream: fs.WriteStream
  processPoller: () => void    // stop function
  metricsSampler: () => void   // stop function
  startedAt: Date
  issueMarkerAt: Date | null
}

let activeSession: ActiveSession | null = null

export async function startRecordingSession(params: {
  issueType: string
  appName: string
  description: string
}): Promise<{ sessionId: string }>

export function markIssueInSession(): { ts: string }

export async function stopRecordingSession(): Promise<{ sessionId: string }>
```

**`startRecordingSession` flow:**
1. Create session in DB via `createSession()` with status `'recording'`
2. Create trace file at `%APPDATA%/black-box/traces/{sessionId}.ndjson`
3. Write `{ type: 'session_start', ts: now }` to trace file
4. Call `getHardwareProfile()` from collectors — write to trace as a special
   `{ type: 'hardware', ...profile }` record
5. Start process polling via `startProcessPolling()` — write each snapshot to trace
6. Start metrics sampling via `startMetricsSampling()` — write each sample to trace
7. Collect initial events via `collectEvents()` — write to trace
8. Store `activeSession` reference
9. Return `{ sessionId }`

**`markIssueInSession` flow:**
1. Verify `activeSession` exists — throw if not
2. Record timestamp
3. Write `{ type: 'issue_marker', ts: now }` to trace file
4. Update `activeSession.issueMarkerAt`
5. Return `{ ts }`

**`stopRecordingSession` flow:**
1. Verify `activeSession` exists
2. Stop process polling and metrics sampling (call stop functions)
3. Do a final event collection run
4. Write `{ type: 'session_stop', ts: now }` to trace file
5. Close the trace file stream
6. Update session in DB: status → `'analyzing'`, stopped_at, issue_marker_at, trace_file_path
7. Clear `activeSession`
8. Return `{ sessionId }`

---

### Trace File Writer

**`src/pipeline/trace-writer.ts`**

```typescript
export function createTraceWriter(filePath: string): {
  write: (record: TraceRecord) => void
  close: () => Promise<void>
}
```

- Opens a NDJSON write stream
- `write()` appends a JSON line + newline
- Enforces 50MB limit: if file size exceeds limit, stops writing and logs warning
- `close()` flushes and closes the stream
- Never throws from `write()` — log errors, continue

---

### Analysis Orchestrator

**`src/pipeline/analysis-orchestrator.ts`**

```typescript
export async function runAnalysis(
  sessionId: string,
  onStatus: (status: AnalysisStatus) => void
): Promise<AnalysisResult>
```

```typescript
interface AnalysisStatus {
  phase: 'collecting' | 'parsing' | 'scoring' | 'complete' | 'error'
  progress: number   // 0–100
  message: string
}
```

**Analysis flow:**
1. `onStatus({ phase: 'collecting', progress: 10 })` — emit status
2. Get session from DB, get trace file path
3. Read trace file: parse all NDJSON lines into typed `TraceRecord[]`
4. Collect any final events from Windows Event Log for the session window
5. `onStatus({ phase: 'parsing', progress: 40 })`
6. Build `ParsedSession` object:
   - Separate trace records by type into events[], processes[], metrics[]
   - Compute `TimeWindows` from issue_marker_at (or session midpoint if no marker)
   - Deduplicate events by (provider, event_id, ts) — PowerShell may return overlaps
   - Merge process snapshots into `ProcessRecord[]` (tracking first_seen/last_seen/exit_detected)
7. `onStatus({ phase: 'scoring', progress: 70 })`
8. Call `analyzeSession(parsedSession)` from `src/engine/analyzer.ts`
9. `onStatus({ phase: 'complete', progress: 100 })`
10. Update session status in DB to `'complete'` or `'inconclusive'`
11. Write `AnalysisResult` to DB via `createAnalysisResult()`
12. Return `AnalysisResult`

**Error handling:**
- If trace file is missing: return `{ outcome: 'error', ... }`
- If NDJSON parsing fails on a line: skip that line, log it, continue
- If analysis throws: catch, set session status to `'error'`, return error result

---

### Timeline Normalizer

**`src/pipeline/timeline.ts`**

```typescript
export function computeTimeWindows(
  session: Pick<Session, 'started_at' | 'stopped_at' | 'issue_marker_at'>
): TimeWindows
```

Rules from `docs/CLAUDE.md`:
- Baseline window: 5 minutes before issue marker (or session start if shorter)
- Incident window: 60 seconds before issue marker to issue marker time
- Aftermath window: issue marker time to 2 minutes after

If `issue_marker_at` is null:
- Use the session midpoint as the anchor
- Document this in the `inconclusiveReason` field

```typescript
export function assignEventToWindow(
  eventTs: string,
  windows: TimeWindows
): 'baseline' | 'incident' | 'aftermath' | 'outside'

export function secondsBeforeMarker(
  eventTs: string,
  markerTs: string
): number  // negative means after marker
```

---

### IPC Wiring (preload.ts update)

Update `electron/preload.ts` to add settings and analysis status listener:

```typescript
contextBridge.exposeInMainWorld('electron', {
  recorder: { ... },  // existing
  analyzer: {
    analyzeSession: (sessionId: string) =>
      ipcRenderer.invoke('analyzer:analyze', sessionId),
    onStatus: (callback: (status: AnalysisStatus) => void) =>
      ipcRenderer.on('analyzer:status', (_, status) => callback(status)),
    removeStatusListener: () =>
      ipcRenderer.removeAllListeners('analyzer:status'),
  },
  telemetry: { ... },  // existing
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setTelemetryOptIn: (optIn: boolean) =>
      ipcRenderer.invoke('settings:set-telemetry-opt-in', { optIn }),
  },
})
```

---

### Session Recovery

**`src/pipeline/recovery.ts`**

```typescript
export async function checkForInterruptedSessions(): Promise<Session[]>
export async function recoverSession(sessionId: string): Promise<void>
```

Called at app startup. Finds sessions with status `'recording'` or `'analyzing'`
that have a `stopped_at` older than 5 minutes (the app closed mid-session).

For interrupted sessions:
- Update status to `'interrupted'`
- Attempt to run analysis on whatever trace data exists
- If analysis fails: status stays `'interrupted'`

This will be surfaced by the UI Agent in Phase 12 as a recovery dialog.

---

## Tests

**`tests/unit/pipeline/timeline.test.ts`**
- Correct baseline/incident/aftermath windows with all three scenarios:
  marker at start, marker at middle, no marker (midpoint)
- `assignEventToWindow` returns correct window for each time zone
- `secondsBeforeMarker` returns negative for post-marker events

---

## Completion Gate

Phase 5 is complete when:
1. `npm test -- tests/unit/pipeline` passes with zero failures
2. Starting a recording session, waiting 30 seconds, stopping, and calling
   `runAnalysis()` produces an `AnalysisResult` written to the database
3. The `AnalysisResult` is readable via `getAnalysisResult(sessionId)`
4. An inconclusive result is produced correctly when no crash signals exist
5. The trace file exists at the correct path and is valid NDJSON

---

## When Complete

Update `agents/HANDOFF.md`:
1. Set Phase 5 status to COMPLETE
2. Set Gate Met to YES
3. Write Completion Certificate with evidence
4. Note any IPC channel changes that the UI agent needs to know

Phase 6 (UI Core) depends on Phase 5. Notify that the pipeline is ready.
