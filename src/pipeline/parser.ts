// parser.ts — Trace file reader and ParsedSession assembler.
//
// Reads an NDJSON trace file produced by session-manager.ts during recording
// and assembles the ParsedSession the rules engine expects (Contract 2).
//
// Events are NOT in the trace file — they are collected fresh from the Windows
// Event Log at analysis time and passed in via the `events` parameter.  This
// ensures accurate time-bounded queries regardless of when analysis runs.

import { readFileSync } from 'fs'
import type {
  EventRecord,
  MetricSample,
  ParsedSession,
  TimeWindows,
  HardwareProfile,
  ProcessSnapshot,
  TraceRecord,
} from '../collectors/types'
import type { IssueType } from '../types/global'
import { buildProcessRecords } from '../collectors/processes'

// Fixed window durations from docs/CLAUDE.md
const BASELINE_BEFORE_MS = 5 * 60 * 1000  // 5 minutes
const INCIDENT_BEFORE_MS = 60 * 1000       // 60 seconds
const AFTERMATH_AFTER_MS = 2 * 60 * 1000  // 2 minutes

function computeWindows(markerTs: string | null, stoppedAt: string): TimeWindows {
  const refMs = markerTs
    ? new Date(markerTs).getTime()
    : new Date(stoppedAt).getTime()

  return {
    baseline_start: new Date(refMs - BASELINE_BEFORE_MS).toISOString(),
    baseline_end: new Date(refMs - INCIDENT_BEFORE_MS).toISOString(),
    incident_start: new Date(refMs - INCIDENT_BEFORE_MS).toISOString(),
    incident_end: new Date(refMs).toISOString(),
    aftermath_start: new Date(refMs).toISOString(),
    aftermath_end: new Date(refMs + AFTERMATH_AFTER_MS).toISOString(),
  }
}

/**
 * Reads a session trace file and assembles a ParsedSession for the rules engine.
 *
 * @param filePath     Path to the .ndjson trace file
 * @param sessionId    Session UUID
 * @param issueType    From the Session record
 * @param appName      From the Session record
 * @param hardware     Hardware profile collected at analysis time
 * @param events       Windows Event Log records collected fresh at analysis time
 */
export function parseTraceFile(
  filePath: string,
  sessionId: string,
  issueType: IssueType,
  appName: string,
  hardware: HardwareProfile,
  events: EventRecord[]
): ParsedSession {
  let raw = ''
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (err) {
    console.error('[parser] cannot read trace file — using empty trace', err)
  }

  let startedAt = new Date().toISOString()
  let stoppedAt = new Date().toISOString()
  let markerAt: string | null = null
  const processSnapshots: ProcessSnapshot[] = []
  const metrics: MetricSample[] = []

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue

    let record: unknown
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }

    if (typeof record !== 'object' || record === null) continue
    const r = record as TraceRecord

    switch (r.type) {
      case 'session_start':
        startedAt = r.ts
        break
      case 'session_stop':
        stoppedAt = r.ts
        break
      case 'issue_marker':
        markerAt = r.ts
        break
      case 'process_snapshot':
        processSnapshots.push({ ts: r.ts, processes: r.processes })
        break
      case 'metrics':
        metrics.push({
          ts: r.ts,
          cpu_pct: r.cpu_pct,
          ram_used_mb: r.ram_used_mb,
          ram_total_mb: r.ram_total_mb,
          ram_pct: r.ram_pct,
          disk_latency_ms: r.disk_latency_ms,
          gpu_pct: r.gpu_pct,
          vram_used_mb: r.vram_used_mb,
          vram_total_mb: r.vram_total_mb,
        })
        break
      case 'event':
        // Events written to trace during recording are not used here — we rely
        // on the fresh wevtutil query passed in via the events parameter.
        break
    }
  }

  const processes = buildProcessRecords(processSnapshots)
  const windows = computeWindows(markerAt, stoppedAt)

  return {
    id: sessionId,
    issue_type: issueType,
    app_name: appName,
    started_at: startedAt,
    stopped_at: stoppedAt,
    issue_marker_at: markerAt,
    windows,
    events,
    processes,
    metrics,
    hardware,
  }
}
