import { describe, it, expect, vi } from 'vitest'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// Mock the processes collector — buildProcessRecords is tested separately
vi.mock('../../../src/collectors/processes', () => ({
  buildProcessRecords: vi.fn(() => []),
  startProcessPolling: vi.fn(() => () => {}),
}))

import { parseTraceFile } from '../../../src/pipeline/parser'
import type { HardwareProfile, EventRecord } from '../../../src/collectors/types'

const HARDWARE: HardwareProfile = {
  gpu_model: 'NVIDIA RTX 4090',
  gpu_driver_version: '537.34',
  os_version: 'Windows 11 22H2',
  ram_total_mb: 32768,
}

const NO_EVENTS: EventRecord[] = []

function writeTempTrace(lines: object[]): string {
  const dir = join(tmpdir(), `bb-test-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, 'trace.ndjson')
  writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8')
  return filePath
}

describe('parseTraceFile', () => {
  const SESSION_ID = 'test-session-id'
  const STARTED = '2024-06-01T10:00:00.000Z'
  const STOPPED = '2024-06-01T10:15:00.000Z'
  const MARKER  = '2024-06-01T10:12:00.000Z'

  it('parses session boundaries from trace', () => {
    const fp = writeTempTrace([
      { type: 'session_start', ts: STARTED },
      { type: 'session_stop',  ts: STOPPED },
    ])

    const result = parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, NO_EVENTS)

    expect(result.started_at).toBe(STARTED)
    expect(result.stopped_at).toBe(STOPPED)
    expect(result.issue_marker_at).toBeNull()
  })

  it('captures issue marker timestamp', () => {
    const fp = writeTempTrace([
      { type: 'session_start',  ts: STARTED },
      { type: 'issue_marker',   ts: MARKER },
      { type: 'session_stop',   ts: STOPPED },
    ])

    const result = parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, NO_EVENTS)

    expect(result.issue_marker_at).toBe(MARKER)
  })

  it('computes correct time windows from issue marker', () => {
    const fp = writeTempTrace([
      { type: 'session_start', ts: STARTED },
      { type: 'issue_marker',  ts: MARKER },
      { type: 'session_stop',  ts: STOPPED },
    ])

    const result = parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, NO_EVENTS)
    const w = result.windows

    const markerMs = new Date(MARKER).getTime()

    expect(new Date(w.baseline_start).getTime()).toBe(markerMs - 5 * 60 * 1000)
    expect(new Date(w.incident_start).getTime()).toBe(markerMs - 60 * 1000)
    expect(new Date(w.incident_end).getTime()).toBe(markerMs)
    expect(new Date(w.aftermath_end).getTime()).toBe(markerMs + 2 * 60 * 1000)
    // baseline_end should equal incident_start
    expect(w.baseline_end).toBe(w.incident_start)
  })

  it('falls back to stopped_at for windows when no marker present', () => {
    const fp = writeTempTrace([
      { type: 'session_start', ts: STARTED },
      { type: 'session_stop',  ts: STOPPED },
    ])

    const result = parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, NO_EVENTS)
    const w = result.windows

    const stoppedMs = new Date(STOPPED).getTime()
    expect(new Date(w.incident_end).getTime()).toBe(stoppedMs)
  })

  it('extracts metric samples from trace', () => {
    const metricRecord = {
      type: 'metrics',
      ts: MARKER,
      cpu_pct: 78.5,
      ram_used_mb: 14000,
      ram_total_mb: 32768,
      ram_pct: 42.7,
      disk_latency_ms: 12,
      gpu_pct: 94,
      vram_used_mb: 6144,
      vram_total_mb: 8192,
    }

    const fp = writeTempTrace([
      { type: 'session_start', ts: STARTED },
      metricRecord,
      { type: 'session_stop', ts: STOPPED },
    ])

    const result = parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, NO_EVENTS)

    expect(result.metrics).toHaveLength(1)
    expect(result.metrics[0].cpu_pct).toBe(78.5)
    expect(result.metrics[0].gpu_pct).toBe(94)
    expect(result.metrics[0].ts).toBe(MARKER)
  })

  it('passes events through unchanged from the parameter', () => {
    const fp = writeTempTrace([
      { type: 'session_start', ts: STARTED },
      { type: 'session_stop',  ts: STOPPED },
    ])

    const events: EventRecord[] = [
      {
        type: 'event',
        ts: MARKER,
        source: 'System',
        provider: 'nvlddmkm',
        event_id: 153,
        level: 'Error',
        message: 'GPU reset',
        collected_at: MARKER,
      },
    ]

    const result = parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, events)

    expect(result.events).toHaveLength(1)
    expect(result.events[0].event_id).toBe(153)
  })

  it('returns empty events and metrics for an empty trace file', () => {
    const fp = writeTempTrace([])

    const result = parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, NO_EVENTS)

    expect(result.metrics).toHaveLength(0)
    expect(result.events).toHaveLength(0)
    expect(result.processes).toHaveLength(0)
  })

  it('handles a missing trace file gracefully', () => {
    const result = parseTraceFile(
      '/tmp/does-not-exist-bb-test.ndjson',
      SESSION_ID,
      'crash',
      'game.exe',
      HARDWARE,
      NO_EVENTS
    )

    expect(result.metrics).toHaveLength(0)
    expect(result.events).toHaveLength(0)
  })

  it('skips malformed JSON lines without throwing', () => {
    const dir = join(tmpdir(), `bb-test-${randomUUID()}`)
    mkdirSync(dir, { recursive: true })
    const fp = join(dir, 'trace.ndjson')
    writeFileSync(
      fp,
      [
        JSON.stringify({ type: 'session_start', ts: STARTED }),
        'not valid json {{{',
        JSON.stringify({ type: 'session_stop', ts: STOPPED }),
      ].join('\n'),
      'utf8'
    )

    expect(() =>
      parseTraceFile(fp, SESSION_ID, 'crash', 'game.exe', HARDWARE, NO_EVENTS)
    ).not.toThrow()
  })

  it('sets session metadata correctly', () => {
    const fp = writeTempTrace([
      { type: 'session_start', ts: STARTED },
      { type: 'session_stop',  ts: STOPPED },
    ])

    const result = parseTraceFile(fp, SESSION_ID, 'app_hang', 'myapp.exe', HARDWARE, NO_EVENTS)

    expect(result.id).toBe(SESSION_ID)
    expect(result.issue_type).toBe('app_hang')
    expect(result.app_name).toBe('myapp.exe')
    expect(result.hardware).toBe(HARDWARE)
  })
})
