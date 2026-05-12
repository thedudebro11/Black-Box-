// session-manager.ts — In-memory singleton for the active recording session.
//
// Owns the collector lifetimes during recording and writes to the trace file.
// One session can be active at a time.  All functions throw if called in the
// wrong state — IPC handlers are responsible for catching and surfacing errors.

import path from 'path'
import { mkdirSync } from 'fs'
import type { IssueType } from '../types/global'
import type { ProcessSnapshot } from '../collectors/types'
import { createSession, updateSession } from '../db/sessions'
import { TraceWriter } from './trace-writer'
import { startMetricsSampling } from '../collectors/metrics'
import { startProcessPolling } from '../collectors/processes'

interface ActiveSession {
  sessionId: string
  issueType: IssueType
  appName: string
  traceFilePath: string
  writer: TraceWriter
  stopMetrics: () => void
  stopProcesses: () => void
}

let active: ActiveSession | null = null

export function hasActiveSession(): boolean {
  return active !== null
}

/**
 * Start a recording session: create a DB row, open the trace file, and begin
 * sampling metrics and processes.
 *
 * @param tracesDir  Absolute path to the directory where trace files live.
 *                   Created if it doesn't exist.
 */
export async function startRecording(params: {
  issueType: IssueType
  appName: string
  description: string | null
  tracesDir: string
  onMetricsSample?: (sample: { cpu_pct: number; ram_pct: number; gpu_pct: number; disk_latency_ms: number }) => void
}): Promise<string> {
  if (active) {
    throw new Error('[session-manager] a recording is already in progress')
  }

  const session = createSession({
    issue_type: params.issueType,
    app_name: params.appName,
    description: params.description,
  })

  mkdirSync(params.tracesDir, { recursive: true })
  const traceFilePath = path.join(params.tracesDir, `${session.id}.ndjson`)
  const writer = new TraceWriter(traceFilePath)

  writer.append({ type: 'session_start', ts: new Date().toISOString() })

  const stopMetrics = startMetricsSampling((sample) => {
    writer.append({
      type: 'metrics',
      ts: sample.ts,
      cpu_pct: sample.cpu_pct,
      ram_used_mb: sample.ram_used_mb,
      ram_total_mb: sample.ram_total_mb,
      ram_pct: sample.ram_pct,
      disk_latency_ms: sample.disk_latency_ms,
      gpu_pct: sample.gpu_pct,
      vram_used_mb: sample.vram_used_mb,
      vram_total_mb: sample.vram_total_mb,
    })
    params.onMetricsSample?.({
      cpu_pct: sample.cpu_pct,
      ram_pct: sample.ram_pct,
      gpu_pct: sample.gpu_pct,
      disk_latency_ms: sample.disk_latency_ms,
    })
  })

  const stopProcesses = startProcessPolling((snapshot: ProcessSnapshot) => {
    writer.append({
      type: 'process_snapshot',
      ts: snapshot.ts,
      processes: snapshot.processes,
    })
  })

  updateSession(session.id, { trace_file_path: traceFilePath })

  active = {
    sessionId: session.id,
    issueType: params.issueType,
    appName: params.appName,
    traceFilePath,
    writer,
    stopMetrics,
    stopProcesses,
  }

  return session.id
}

/**
 * Stamp the issue marker timestamp in the trace and the DB.
 * Returns the ISO timestamp of the marker.
 */
export function markIssue(): string {
  if (!active) throw new Error('[session-manager] no active recording')

  const ts = new Date().toISOString()
  active.writer.append({ type: 'issue_marker', ts })
  updateSession(active.sessionId, { issue_marker_at: ts })
  return ts
}

/**
 * Stop collectors, close the trace file, and mark the session as 'analyzing'.
 * Returns the sessionId so the caller can hand it to the analyzer.
 */
export function stopRecording(): { sessionId: string; traceFilePath: string } {
  if (!active) throw new Error('[session-manager] no active recording')

  active.stopMetrics()
  active.stopProcesses()

  const stoppedAt = new Date().toISOString()
  active.writer.append({ type: 'session_stop', ts: stoppedAt })

  const truncated = active.writer.isTruncated
  const { sessionId, traceFilePath } = active

  updateSession(sessionId, {
    stopped_at: stoppedAt,
    status: 'analyzing',
    trace_truncated: truncated,
  })

  active = null

  return { sessionId, traceFilePath }
}
