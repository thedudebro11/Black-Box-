/**
 * sanitizer.ts — strips everything not on the allowed upload list.
 *
 * Every telemetry payload must pass through this module before leaving
 * the machine. No personally identifiable information is ever included.
 * See CLAUDE.md §Privacy for the canonical allowed-list.
 */

import type { AnalysisResult } from '../types/global'

export interface SanitizedPayload {
  session_id: string
  event_ids_fired: number[]
  process_names: string[]
  metrics_summary: {
    avg_cpu_pct: number
    peak_cpu_pct: number
    avg_ram_pct: number
    peak_ram_pct: number
    avg_gpu_pct: number
    peak_gpu_pct: number
  }
  hardware_profile: {
    gpu_model: string
    gpu_driver_version: string
    os_version: string
    ram_total_mb: number
  }
  diagnosis_outcome: 'diagnosed' | 'inconclusive' | 'error'
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | null
  primary_rule_pack_id: string | null
}

/**
 * Parses an Event ID number out of the technical field of a signal.
 *
 * Examples that must parse:
 *   "Event ID 153 — nvlddmkm"  → 153
 *   "Event ID 1002"             → 1002
 *   "EventID 4101"              → 4101   (no space variant)
 *
 * Returns null if no integer can be extracted.
 */
function parseEventId(technical: string): number | null {
  // Match "Event ID <number>" or "EventID <number>", case-insensitive
  const match = /event\s*id\s+(\d+)/i.exec(technical)
  if (!match || !match[1]) return null
  const id = parseInt(match[1], 10)
  return isNaN(id) ? null : id
}

/**
 * Extracts the process name from the technical field of a process signal.
 *
 * We accept the first whitespace-delimited token as the process name.
 * Path separators and arguments must never be included — we take only
 * the basename up to the first space.
 *
 * Example: "explorer.exe (PID 1234)" → "explorer.exe"
 */
function parseProcessName(technical: string): string {
  // Take first token; strip any path separators in case one slipped through
  const token = technical.split(/\s/)[0] ?? ''
  // Strip leading path separators to prevent leaking file paths
  const slashIdx = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
  return slashIdx >= 0 ? token.slice(slashIdx + 1) : token
}

/**
 * Sanitizes an AnalysisResult into a SanitizedPayload safe for upload.
 *
 * Derives what it can from all_signals_found:
 * - event_ids_fired: from signals where type === 'event'
 * - process_names:   from signals where type === 'process'
 *
 * metrics_summary defaults to zeros because raw metric samples are not
 * stored inside AnalysisResult in Phase 9 (they live in the NDJSON trace
 * file, which is not uploaded). This is noted so Phase 9+ can enrich it
 * when the trace reader is wired in.
 *
 * hardware_profile defaults to 'unknown' values for the same reason.
 */
export function sanitize(result: AnalysisResult): SanitizedPayload {
  const eventIds: number[] = []
  const processNames: string[] = []

  for (const signal of result.all_signals_found) {
    if (signal.type === 'event') {
      const id = parseEventId(signal.technical)
      if (id !== null && !eventIds.includes(id)) {
        eventIds.push(id)
      }
    } else if (signal.type === 'process') {
      const name = parseProcessName(signal.technical)
      if (name.length > 0 && !processNames.includes(name)) {
        processNames.push(name)
      }
    }
    // metric signals are not extracted — only numeric summaries are allowed
  }

  return {
    session_id: result.session_id,
    event_ids_fired: eventIds,
    process_names: processNames,
    // Phase 9 note: raw metric samples are not stored in AnalysisResult.
    // Defaults to zeros; a future phase can enrich this from the trace file.
    metrics_summary: {
      avg_cpu_pct: 0,
      peak_cpu_pct: 0,
      avg_ram_pct: 0,
      peak_ram_pct: 0,
      avg_gpu_pct: 0,
      peak_gpu_pct: 0,
    },
    // Phase 9 note: hardware profile is not stored in AnalysisResult.
    // Defaults to 'unknown'; a future phase can populate from the driver collector.
    hardware_profile: {
      gpu_model: 'unknown',
      gpu_driver_version: 'unknown',
      os_version: 'unknown',
      ram_total_mb: 0,
    },
    diagnosis_outcome: result.outcome,
    confidence_level: result.primary_confidence,
    primary_rule_pack_id: result.primary_rule_pack_id,
  }
}
