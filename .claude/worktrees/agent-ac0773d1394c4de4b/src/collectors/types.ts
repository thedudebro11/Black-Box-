// Collector domain types — defined here for use within src/collectors/
// and consumed by the rules engine via Contract 2 and Contract 9 (agents/CONTRACTS.md).
// Do not import from global.d.ts here — IssueType is re-exported from there.

import type { IssueType } from '../types/global'

// ── Time window definitions (docs/CLAUDE.md — fixed definitions) ───────────────

export interface TimeWindows {
  baseline_start: string   // 5 minutes before issue marker
  baseline_end: string
  incident_start: string   // 60 seconds before issue marker
  incident_end: string     // issue marker time
  aftermath_start: string  // issue marker time
  aftermath_end: string    // 2 minutes after crash point
}

// ── Event record — from wevtutil XML output ────────────────────────────────────

export interface EventRecord {
  type: 'event'
  ts: string          // ISO 8601 — from TimeCreated @_SystemTime
  source: string      // 'System' | 'Application'
  provider: string    // e.g. 'nvlddmkm'
  event_id: number
  level: string       // 'Error' | 'Warning' | 'Information' | 'Critical'
  message: string     // truncated to 500 chars — privacy rule
  collected_at: string
}

// ── Process record — from get-processes.ps1, tracked across snapshots ──────────

export interface ProcessRecord {
  name: string          // process name with .exe suffix, no args (privacy rule)
  pid: number
  cpu_pct: number
  memory_mb: number
  first_seen: string    // ISO 8601
  last_seen: string     // ISO 8601
  exit_detected: boolean
}

// ── Process snapshot — intermediate type used within processes.ts ──────────────

export interface ProcessSnapshot {
  ts: string
  processes: Array<{
    name: string
    pid: number
    cpu_pct: number
    memory_mb: number
  }>
}

// ── Metric sample — from systeminformation ─────────────────────────────────────

export interface MetricSample {
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

// ── Hardware profile — from get-system-info.ps1 ────────────────────────────────

export interface HardwareProfile {
  gpu_model: string
  gpu_driver_version: string
  os_version: string
  ram_total_mb: number
}

// ── Parsed session — enriched session handed to the rules engine ───────────────
// Contract 2 in agents/CONTRACTS.md

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

// ── NDJSON trace record union — Contract 9 in agents/CONTRACTS.md ─────────────

export interface EventTraceRecord {
  type: 'event'
  ts: string
  source: string
  provider: string
  event_id: number
  level: string
  message: string
  collected_at: string
}

export interface ProcessSnapshotRecord {
  type: 'process_snapshot'
  ts: string
  processes: Array<{
    name: string
    pid: number
    cpu_pct: number
    memory_mb: number
  }>
}

export interface MetricsTraceRecord {
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

export interface IssueMarkerRecord {
  type: 'issue_marker'
  ts: string
}

export interface SessionBoundaryRecord {
  type: 'session_start' | 'session_stop'
  ts: string
}

export type TraceRecord =
  | EventTraceRecord
  | ProcessSnapshotRecord
  | MetricsTraceRecord
  | IssueMarkerRecord
  | SessionBoundaryRecord
