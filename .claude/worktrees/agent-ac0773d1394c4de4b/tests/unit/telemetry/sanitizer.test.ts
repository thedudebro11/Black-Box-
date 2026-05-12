import { describe, it, expect } from 'vitest'
import { sanitize } from '../../../src/telemetry/sanitizer'
import type { AnalysisResult, SignalMatch } from '../../../src/types/global'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignal(
  overrides: Partial<SignalMatch> & Pick<SignalMatch, 'type' | 'technical'>
): SignalMatch {
  return {
    description: 'test signal',
    window: 'incident',
    severity: 'critical',
    ts: '2024-01-15T14:23:38.000Z',
    seconds_before_marker: 12,
    ...overrides,
  }
}

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    id: 'result-id-000',
    session_id: 'session-id-abc123',
    outcome: 'diagnosed',
    primary_rule_pack_id: 'gpu-driver',
    primary_confidence: 'HIGH',
    primary_cause_name: 'GPU Driver Instability / TDR',
    primary_output_text: 'A GPU driver reset was detected.',
    secondary_results: [],
    all_signals_found: [],
    fix_recommendations: [],
    inconclusive_reason: null,
    created_at: '2024-01-15T14:24:00.000Z',
    ...overrides,
  }
}

// ── event_ids_fired extraction ────────────────────────────────────────────────

describe('sanitize — event_ids_fired', () => {
  it('extracts event IDs from event-type signals', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'event', technical: 'Event ID 153 — nvlddmkm' }),
        makeSignal({ type: 'event', technical: 'Event ID 1002 — Application Hang' }),
      ],
    })
    const payload = sanitize(result)
    expect(payload.event_ids_fired).toContain(153)
    expect(payload.event_ids_fired).toContain(1002)
    expect(payload.event_ids_fired).toHaveLength(2)
  })

  it('deduplicates repeated event IDs', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'event', technical: 'Event ID 153 — nvlddmkm' }),
        makeSignal({ type: 'event', technical: 'Event ID 153 — nvlddmkm (second occurrence)' }),
      ],
    })
    const payload = sanitize(result)
    expect(payload.event_ids_fired).toEqual([153])
  })

  it('ignores non-event signals when extracting event IDs', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'process', technical: 'TestGame.exe (PID 1234)' }),
        makeSignal({ type: 'metric', technical: 'GPU at 94%' }),
      ],
    })
    const payload = sanitize(result)
    expect(payload.event_ids_fired).toHaveLength(0)
  })

  it('handles EventID (no space) variant', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'event', technical: 'EventID 4101 — Display driver stopped' }),
      ],
    })
    const payload = sanitize(result)
    expect(payload.event_ids_fired).toContain(4101)
  })

  it('returns empty array when all_signals_found is empty', () => {
    const result = makeResult({ all_signals_found: [] })
    const payload = sanitize(result)
    expect(payload.event_ids_fired).toEqual([])
  })
})

// ── process_names extraction ──────────────────────────────────────────────────

describe('sanitize — process_names', () => {
  it('extracts process names from process-type signals', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'process', technical: 'TestGame.exe (PID 9200)' }),
        makeSignal({ type: 'process', technical: 'Discord.exe (PID 4821)' }),
      ],
    })
    const payload = sanitize(result)
    expect(payload.process_names).toContain('TestGame.exe')
    expect(payload.process_names).toContain('Discord.exe')
    expect(payload.process_names).toHaveLength(2)
  })

  it('deduplicates repeated process names', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'process', technical: 'TestGame.exe (PID 9200)' }),
        makeSignal({ type: 'process', technical: 'TestGame.exe (PID 9200, second snapshot)' }),
      ],
    })
    const payload = sanitize(result)
    expect(payload.process_names).toEqual(['TestGame.exe'])
  })

  it('strips path separators to prevent leaking file paths', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'process', technical: 'C:\\Windows\\System32\\svchost.exe' }),
      ],
    })
    const payload = sanitize(result)
    // Must contain only the basename, not the full path
    expect(payload.process_names).toContain('svchost.exe')
    expect(payload.process_names[0]).not.toContain('\\')
    expect(payload.process_names[0]).not.toContain('C:')
  })

  it('returns empty array when no process signals exist', () => {
    const result = makeResult({
      all_signals_found: [
        makeSignal({ type: 'event', technical: 'Event ID 153 — nvlddmkm' }),
      ],
    })
    const payload = sanitize(result)
    expect(payload.process_names).toEqual([])
  })
})

// ── session_id passthrough ────────────────────────────────────────────────────

describe('sanitize — session_id', () => {
  it('passes the session_id through unchanged', () => {
    const result = makeResult({ session_id: 'anon-uuid-1234-5678' })
    const payload = sanitize(result)
    expect(payload.session_id).toBe('anon-uuid-1234-5678')
  })
})

// ── diagnosis outcome and confidence ─────────────────────────────────────────

describe('sanitize — outcome and confidence', () => {
  it('passes through "diagnosed" outcome with HIGH confidence', () => {
    const result = makeResult({ outcome: 'diagnosed', primary_confidence: 'HIGH' })
    const payload = sanitize(result)
    expect(payload.diagnosis_outcome).toBe('diagnosed')
    expect(payload.confidence_level).toBe('HIGH')
  })

  it('passes through "inconclusive" outcome with null confidence', () => {
    const result = makeResult({
      outcome: 'inconclusive',
      primary_confidence: null,
      primary_rule_pack_id: null,
    })
    const payload = sanitize(result)
    expect(payload.diagnosis_outcome).toBe('inconclusive')
    expect(payload.confidence_level).toBeNull()
  })

  it('passes through "error" outcome', () => {
    const result = makeResult({ outcome: 'error', primary_confidence: null })
    const payload = sanitize(result)
    expect(payload.diagnosis_outcome).toBe('error')
  })

  it('passes through MEDIUM confidence', () => {
    const result = makeResult({ primary_confidence: 'MEDIUM' })
    const payload = sanitize(result)
    expect(payload.confidence_level).toBe('MEDIUM')
  })

  it('passes through LOW confidence', () => {
    const result = makeResult({ primary_confidence: 'LOW' })
    const payload = sanitize(result)
    expect(payload.confidence_level).toBe('LOW')
  })
})

// ── primary_rule_pack_id ──────────────────────────────────────────────────────

describe('sanitize — primary_rule_pack_id', () => {
  it('passes through a non-null rule pack ID', () => {
    const result = makeResult({ primary_rule_pack_id: 'memory-exhaustion' })
    const payload = sanitize(result)
    expect(payload.primary_rule_pack_id).toBe('memory-exhaustion')
  })

  it('passes through null when inconclusive', () => {
    const result = makeResult({ primary_rule_pack_id: null })
    const payload = sanitize(result)
    expect(payload.primary_rule_pack_id).toBeNull()
  })
})

// ── metrics_summary defaults ──────────────────────────────────────────────────

describe('sanitize — metrics_summary', () => {
  it('returns zero defaults for metrics_summary (not in AnalysisResult in Phase 9)', () => {
    const payload = sanitize(makeResult())
    expect(payload.metrics_summary.avg_cpu_pct).toBe(0)
    expect(payload.metrics_summary.peak_cpu_pct).toBe(0)
    expect(payload.metrics_summary.avg_ram_pct).toBe(0)
    expect(payload.metrics_summary.peak_ram_pct).toBe(0)
    expect(payload.metrics_summary.avg_gpu_pct).toBe(0)
    expect(payload.metrics_summary.peak_gpu_pct).toBe(0)
  })
})

// ── hardware_profile defaults ─────────────────────────────────────────────────

describe('sanitize — hardware_profile', () => {
  it('returns unknown defaults for hardware_profile (not in AnalysisResult in Phase 9)', () => {
    const payload = sanitize(makeResult())
    expect(payload.hardware_profile.gpu_model).toBe('unknown')
    expect(payload.hardware_profile.gpu_driver_version).toBe('unknown')
    expect(payload.hardware_profile.os_version).toBe('unknown')
    expect(payload.hardware_profile.ram_total_mb).toBe(0)
  })
})

// ── No personally identifiable fields ────────────────────────────────────────

describe('sanitize — PII exclusion', () => {
  it('does not include any field not on the allowed list', () => {
    const result = makeResult({
      primary_cause_name: 'GPU Driver Instability / TDR',
      primary_output_text: 'A GPU driver reset was detected.',
      fix_recommendations: [{ order: 1, title: 'Update GPU driver', detail: 'Open Device Manager.' }],
      secondary_results: [],
      inconclusive_reason: null,
      created_at: '2024-01-15T14:24:00.000Z',
    })
    const payload = sanitize(result)

    // Whitelist check — only these keys must exist
    const allowedKeys = new Set([
      'session_id',
      'event_ids_fired',
      'process_names',
      'metrics_summary',
      'hardware_profile',
      'diagnosis_outcome',
      'confidence_level',
      'primary_rule_pack_id',
    ])

    for (const key of Object.keys(payload)) {
      expect(allowedKeys.has(key), `unexpected key "${key}" in payload`).toBe(true)
    }

    // Explicitly must NOT include these fields
    const payloadRecord = payload as unknown as Record<string, unknown>
    expect(payloadRecord['primary_cause_name']).toBeUndefined()
    expect(payloadRecord['primary_output_text']).toBeUndefined()
    expect(payloadRecord['fix_recommendations']).toBeUndefined()
    expect(payloadRecord['secondary_results']).toBeUndefined()
    expect(payloadRecord['inconclusive_reason']).toBeUndefined()
    expect(payloadRecord['created_at']).toBeUndefined()
    expect(payloadRecord['id']).toBeUndefined()
  })
})
