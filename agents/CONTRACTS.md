# Black Box — Agent Interface Contracts

## What This File Is

This file defines the TypeScript interface contracts that agents must
implement or consume. If you are writing code that crosses an agent boundary
(e.g., the Pipeline agent consumes types the Data Layer agent defines), this
file is the authoritative reference for what those interfaces look like.

No agent may change a contract without updating this file and flagging the
change in HANDOFF.md. Breaking a contract breaks every downstream agent.

---

## Contract 1 — Session (Data Layer → All)

Defined by: DATA_LAYER agent in `src/types/global.d.ts` and `src/engine/types.ts`
Consumed by: RULES_ENGINE, PIPELINE, UI, EXPORT, TELEMETRY

```typescript
interface Session {
  id: string                          // UUID
  status: SessionStatus
  issue_type: IssueType
  app_name: string
  description: string | null
  started_at: string                  // ISO 8601
  stopped_at: string | null           // ISO 8601
  issue_marker_at: string | null      // ISO 8601
  analyzed_at: string | null          // ISO 8601
  trace_file_path: string | null
  created_at: string
  updated_at: string
}

type SessionStatus = 'recording' | 'analyzing' | 'complete' | 'inconclusive' | 'error' | 'interrupted'
type IssueType = 'crash' | 'freeze' | 'bsod' | 'app_hang'
```

---

## Contract 2 — ParsedSession (Collectors → Rules Engine)

Defined by: COLLECTORS agent in `src/engine/types.ts`
Consumed by: RULES_ENGINE, PIPELINE

This is the enriched session object the rules engine receives — includes
parsed events, processes, metrics, hardware, and time windows.

```typescript
interface ParsedSession {
  id: string
  issue_type: IssueType
  app_name: string
  started_at: string
  stopped_at: string
  issue_marker_at: string | null
  windows: TimeWindows
  events: EventRecord[]
  processes: ProcessRecord[]
  metrics: MetricSample[]
  hardware: HardwareProfile
}

interface TimeWindows {
  baseline_start: string      // 5 minutes before issue marker
  baseline_end: string
  incident_start: string      // 60 seconds before issue marker
  incident_end: string        // issue marker time
  aftermath_start: string     // issue marker time
  aftermath_end: string       // 2 minutes after crash point
}

interface EventRecord {
  type: 'event'
  ts: string                  // ISO 8601
  source: string              // 'System' | 'Application'
  provider: string            // e.g. 'nvlddmkm'
  event_id: number
  level: string               // 'Error' | 'Warning' | 'Information'
  message: string
  collected_at: string
}

interface ProcessRecord {
  name: string
  pid: number
  cpu_pct: number
  memory_mb: number
  first_seen: string
  last_seen: string
  exit_detected: boolean
}

interface MetricSample {
  ts: string
  cpu_pct: number
  ram_used_mb: number
  ram_total_mb: number
  ram_pct: number
  disk_latency_ms: number
  gpu_pct: number
  vram_used_mb: number
  vram_total_mb: number
}

interface HardwareProfile {
  gpu_model: string
  gpu_driver_version: string
  os_version: string
  ram_total_mb: number
}
```

---

## Contract 3 — RuleResult (Rules Engine → Pipeline → UI)

Defined by: RULES_ENGINE agent in `src/engine/types.ts`
Consumed by: PIPELINE, UI, EXPORT

```typescript
interface RuleResult {
  rulePackId: string                // e.g. 'gpu-driver' | 'overlay-conflict' | etc.
  fired: boolean
  confidence: Confidence | null     // null if fired is false
  signals: SignalMatch[]
  disqualifiedBy: string[]          // rule pack IDs that were ruled out
  fixRecommendations: FixStep[]
  outputText: string                // plain language explanation
}

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

interface SignalMatch {
  type: 'event' | 'metric' | 'process'
  description: string               // plain language: "GPU driver reset 12 seconds before crash"
  technical: string                 // raw: "Event ID 153 — nvlddmkm — 2024-01-15T14:23:38Z"
  window: 'baseline' | 'incident' | 'aftermath'
  severity: 'critical' | 'supporting' | 'informational'
  ts: string                        // ISO 8601
  seconds_before_marker: number     // negative = after marker
}

interface FixStep {
  order: number
  title: string                     // short action label
  detail: string                    // full instruction
  link?: string                     // optional support URL
}
```

---

## Contract 4 — AnalysisResult (Pipeline → UI → Export → Telemetry)

Defined by: PIPELINE agent, written to DB by PIPELINE, read by UI/EXPORT/TELEMETRY
Stored in: `analysis_results` SQLite table (see docs/DATA_SCHEMA.md)

```typescript
interface AnalysisResult {
  id: string
  session_id: string
  outcome: 'diagnosed' | 'inconclusive' | 'error'
  primary_rule_pack_id: string | null
  primary_confidence: Confidence | null
  primary_cause_name: string | null
  primary_output_text: string | null
  secondary_results: RuleResult[]   // serialized as JSON in DB
  all_signals_found: SignalMatch[]  // serialized as JSON in DB
  fix_recommendations: FixStep[]    // serialized as JSON in DB
  inconclusive_reason: string | null
  created_at: string
}
```

---

## Contract 5 — IPC Channels (Main Process ↔ Renderer)

Defined by: PIPELINE agent in `electron/preload.ts`
Must not be changed without updating preload.ts and all call sites.

### Recorder channels
```
recorder:start      → params: { issueType, appName, description } → returns: { sessionId: string }
recorder:mark-issue → params: none → returns: { ts: string }
recorder:stop       → params: none → returns: { sessionId: string }
```

### Analyzer channels
```
analyzer:analyze    → params: sessionId: string → returns: AnalysisResult
analyzer:status     → event pushed from main: { phase: 'collecting' | 'parsing' | 'scoring' | 'complete' | 'error', progress: number }
```

### Telemetry channels
```
telemetry:upload    → params: sessionId: string → returns: { success: boolean }
```

### Settings channels (added in Phase 9)
```
settings:get        → params: none → returns: AppSettings
settings:set-telemetry-opt-in → params: { optIn: boolean } → returns: void
```

---

## Contract 6 — AppSettings (Data Layer → Telemetry → UI)

```typescript
interface AppSettings {
  anonymous_session_id: string
  telemetry_opt_in: boolean
  first_launch_complete: boolean
  app_version: string
}
```

---

## Contract 7 — Rule Pack Interface (all rule packs)

Every rule pack module in `src/engine/rules/` must export exactly this function.
No other exports. No side effects. Pure function.

```typescript
export function evaluate(session: ParsedSession): RuleResult
```

---

## Contract 8 — SessionReport (Export Agent)

Defined by: EXPORT agent in `src/engine/types.ts` or inline
Consumed by: UI (export button)

```typescript
interface SessionReport {
  markdown: string              // full report as markdown string
  filename: string              // suggested save filename
  session_id_short: string      // last 8 chars of session ID
}
```

---

## Contract 9 — Collector Output Types

Defined by: COLLECTORS agent
Consumed by: PIPELINE (trace file reader)

All collectors write to the NDJSON trace file using the union type:

```typescript
type TraceRecord =
  | EventTraceRecord
  | ProcessSnapshotRecord
  | MetricsTraceRecord
  | IssueMarkerRecord
  | SessionBoundaryRecord

interface EventTraceRecord {
  type: 'event'
  ts: string
  source: string
  provider: string
  event_id: number
  level: string
  message: string
  collected_at: string
}

interface ProcessSnapshotRecord {
  type: 'process_snapshot'
  ts: string
  processes: Array<{
    name: string
    pid: number
    cpu_pct: number
    memory_mb: number
  }>
}

interface MetricsTraceRecord {
  type: 'metrics'
  ts: string
  cpu_pct: number
  ram_used_mb: number
  ram_total_mb: number
  ram_pct: number
  disk_latency_ms: number
  gpu_pct: number
  vram_used_mb: number
  vram_total_mb: number
}

interface IssueMarkerRecord {
  type: 'issue_marker'
  ts: string
}

interface SessionBoundaryRecord {
  type: 'session_start' | 'session_stop'
  ts: string
}
```

---

## Versioning

If a contract changes:
1. Update this file
2. Update HANDOFF.md with a note in the Blocker Log
3. Find every agent doc that references the changed contract
4. Verify no existing code breaks (check all files in the affected agent's domain)

Contract version: **1.0** — established Phase 2 start
