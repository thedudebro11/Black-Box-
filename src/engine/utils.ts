/**
 * src/engine/utils.ts
 *
 * Shared helper functions used by all rule packs.
 * Pure functions — no side effects, no I/O, no state.
 */

import type { EventRecord, MetricSample, TimeWindows } from './types'

// ── Window membership helpers ─────────────────────────────────────────────────

/**
 * Returns all events whose timestamp falls within the named window.
 * Uses inclusive range: start <= ts <= end.
 */
export function eventsInWindow(
  events: EventRecord[],
  windows: TimeWindows,
  windowName: 'baseline' | 'incident' | 'aftermath',
): EventRecord[] {
  const start = windowStart(windows, windowName)
  const end = windowEnd(windows, windowName)
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)

  return events.filter((e) => {
    const ts = Date.parse(e.ts)
    return ts >= startMs && ts <= endMs
  })
}

/**
 * Returns all metric samples whose timestamp falls within the named window.
 */
export function metricsInWindow(
  metrics: MetricSample[],
  windows: TimeWindows,
  windowName: 'baseline' | 'incident' | 'aftermath',
): MetricSample[] {
  const start = windowStart(windows, windowName)
  const end = windowEnd(windows, windowName)
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)

  return metrics.filter((m) => {
    const ts = Date.parse(m.ts)
    return ts >= startMs && ts <= endMs
  })
}

// ── Event ID helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if any event in the array matches the given event_id.
 * When provider is supplied, the provider field must also match
 * (case-insensitive substring match to handle minor naming variants).
 */
export function hasEventId(
  events: EventRecord[],
  id: number,
  provider?: string,
): boolean {
  return events.some(
    (e) =>
      e.event_id === id &&
      (provider === undefined ||
        e.provider.toLowerCase().includes(provider.toLowerCase())),
  )
}

/**
 * Returns all events matching the given event_id (and optional provider).
 */
export function findEvents(
  events: EventRecord[],
  id: number,
  provider?: string,
): EventRecord[] {
  return events.filter(
    (e) =>
      e.event_id === id &&
      (provider === undefined ||
        e.provider.toLowerCase().includes(provider.toLowerCase())),
  )
}

// ── Metric helpers ────────────────────────────────────────────────────────────

/**
 * Returns the peak (maximum) value of a numeric MetricSample field
 * across all samples in the given window.  Returns 0 if no samples exist.
 */
export function peakMetric(
  metrics: MetricSample[],
  field: keyof MetricSample,
  windows: TimeWindows,
  windowName: 'baseline' | 'incident' | 'aftermath',
): number {
  const samples = metricsInWindow(metrics, windows, windowName)
  if (samples.length === 0) return 0

  return samples.reduce((max, s) => {
    const val = s[field]
    const num = typeof val === 'number' ? val : 0
    return num > max ? num : max
  }, 0)
}

/**
 * Returns the average value of a numeric MetricSample field across
 * all samples in the given window.  Returns 0 if no samples exist.
 */
export function avgMetric(
  metrics: MetricSample[],
  field: keyof MetricSample,
  windows: TimeWindows,
  windowName: 'baseline' | 'incident' | 'aftermath',
): number {
  const samples = metricsInWindow(metrics, windows, windowName)
  if (samples.length === 0) return 0

  const total = samples.reduce((sum, s) => {
    const val = s[field]
    return sum + (typeof val === 'number' ? val : 0)
  }, 0)

  return total / samples.length
}

/**
 * Returns how many consecutive metric samples (from the start of the window)
 * have the named field above the given threshold.
 */
export function consecutiveSamplesAbove(
  metrics: MetricSample[],
  field: keyof MetricSample,
  threshold: number,
  windows: TimeWindows,
  windowName: 'baseline' | 'incident' | 'aftermath',
): number {
  // We want sustained high values anywhere in the window, not just from the
  // start — so count the longest run of consecutive samples above threshold.
  const samples = metricsInWindow(metrics, windows, windowName)
  let maxRun = 0
  let run = 0

  for (const s of samples) {
    const val = s[field]
    if (typeof val === 'number' && val > threshold) {
      run++
      if (run > maxRun) maxRun = run
    } else {
      run = 0
    }
  }

  return maxRun
}

// ── Timing helpers ────────────────────────────────────────────────────────────

/**
 * Returns how many seconds before the issue marker the given event occurred.
 * Positive value means the event is before the marker (earlier in time).
 * Negative value means the event is after the marker.
 *
 * If markerTs is null the session had no issue marker — return 0.
 */
export function secondsBeforeMarker(eventTs: string, markerTs: string | null): number {
  if (markerTs === null) return 0
  const markerMs = Date.parse(markerTs)
  const eventMs = Date.parse(eventTs)
  return (markerMs - eventMs) / 1000
}

// ── Private window boundary helpers ──────────────────────────────────────────

function windowStart(windows: TimeWindows, name: 'baseline' | 'incident' | 'aftermath'): string {
  switch (name) {
    case 'baseline':  return windows.baseline_start
    case 'incident':  return windows.incident_start
    case 'aftermath': return windows.aftermath_start
  }
}

function windowEnd(windows: TimeWindows, name: 'baseline' | 'incident' | 'aftermath'): string {
  switch (name) {
    case 'baseline':  return windows.baseline_end
    case 'incident':  return windows.incident_end
    case 'aftermath': return windows.aftermath_end
  }
}
