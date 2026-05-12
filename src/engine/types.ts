/**
 * src/engine/types.ts
 *
 * Engine-specific types for the rules engine and analysis pipeline.
 * These are the canonical definitions consumed by rule packs, the scorer,
 * and the pipeline agent. They match exactly the shapes in agents/CONTRACTS.md.
 *
 * Types already defined in src/types/global.d.ts (Confidence, IssueType,
 * SessionStatus, SignalMatch, FixStep, RuleResult, AnalysisResult) are
 * imported and re-exported here so that engine code has a single import target.
 */

// Import so types are in scope for use within this file, then re-export so
// engine modules only need to import from this single target.
import type {
  Confidence,
  IssueType,
  SessionStatus,
  SignalMatch,
  FixStep,
  RuleResult,
  AnalysisResult,
} from '../types/global'

export type {
  Confidence,
  IssueType,
  SessionStatus,
  SignalMatch,
  FixStep,
  RuleResult,
  AnalysisResult,
}

// ── Time Windows ──────────────────────────────────────────────────────────────

/**
 * The three analysis windows computed relative to the issue marker.
 * Definitions are fixed per docs/CLAUDE.md:
 *   Baseline  : 5 minutes before issue marker
 *   Incident  : 60 seconds before issue marker → marker time
 *   Aftermath : marker time → 2 minutes after crash point
 */
export interface TimeWindows {
  baseline_start: string   // ISO 8601 — 5 minutes before issue marker
  baseline_end: string     // ISO 8601 — equals incident_start
  incident_start: string   // ISO 8601 — 60 seconds before issue marker
  incident_end: string     // ISO 8601 — issue marker time
  aftermath_start: string  // ISO 8601 — issue marker time
  aftermath_end: string    // ISO 8601 — 2 minutes after crash point
}

// ── Collector Output Types ────────────────────────────────────────────────────

/**
 * A single Windows Event Log record collected during a session.
 * Matches EventTraceRecord from agents/CONTRACTS.md Contract 9.
 */
export interface EventRecord {
  type: 'event'
  ts: string           // ISO 8601 — event timestamp from Windows
  source: string       // 'System' | 'Application'
  provider: string     // e.g. 'nvlddmkm', 'Display', 'Application Hang'
  event_id: number
  level: string        // 'Error' | 'Warning' | 'Information'
  message: string
  collected_at: string // ISO 8601 — when the collector retrieved it
}

/**
 * A snapshot of a running process observed during a session.
 * Process records are accumulated over the session lifetime — last_seen
 * is updated each polling cycle.  exit_detected is set true when the
 * process disappears from the process list.
 */
export interface ProcessRecord {
  name: string
  pid: number
  cpu_pct: number
  memory_mb: number
  first_seen: string    // ISO 8601
  last_seen: string     // ISO 8601
  exit_detected: boolean
}

/**
 * A single system metrics sample taken at 10-second intervals.
 */
export interface MetricSample {
  ts: string             // ISO 8601
  cpu_pct: number
  ram_used_mb: number
  ram_total_mb: number
  ram_pct: number        // 0–100
  disk_latency_ms: number
  gpu_pct: number        // 0–100
  vram_used_mb: number
  vram_total_mb: number
}

/**
 * Hardware profile captured once at session start.
 */
export interface HardwareProfile {
  gpu_model: string
  gpu_driver_version: string
  os_version: string
  ram_total_mb: number
}

// ── ParsedSession ─────────────────────────────────────────────────────────────

/**
 * The fully-hydrated session object passed to every rule pack's evaluate().
 * Assembled by the pipeline from the NDJSON trace file after recording stops.
 * Matches Contract 2 in agents/CONTRACTS.md exactly.
 */
export interface ParsedSession {
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

// Re-export IssueType is already handled above via the export type block.
// ParsedSession is the primary engine input type.
