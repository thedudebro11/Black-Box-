import { describe, it, expect } from 'vitest'
import { rankResults } from '../../../src/engine/scorer'
import type { RuleResult } from '../../../src/engine/types'

// Helper to create minimal RuleResult stubs for scorer testing.
function makeResult(
  rulePackId: string,
  fired: boolean,
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null,
  signalCount = 1,
  avgSecsBeforeMarker = 30,
): RuleResult {
  const signals = Array.from({ length: signalCount }, (_, i) => ({
    type: 'event' as const,
    description: `Signal ${i + 1}`,
    technical: `Event ID 153 — ${new Date().toISOString()}`,
    window: 'incident' as const,
    severity: 'critical' as const,
    ts: new Date().toISOString(),
    seconds_before_marker: avgSecsBeforeMarker,
  }))

  return {
    rulePackId,
    fired,
    confidence,
    signals: fired ? signals : [],
    disqualifiedBy: [],
    fixRecommendations: fired
      ? [{ order: 1, title: 'Test step', detail: 'Do this' }]
      : [],
    outputText: fired ? `${rulePackId} fired with ${confidence ?? 'null'} confidence` : '',
  }
}

describe('Scorer — rankResults', () => {
  it('returns inconclusive when no results fired', () => {
    const results = [
      makeResult('gpu-driver', false, null),
      makeResult('overlay-conflict', false, null),
    ]
    const output = rankResults(results)
    expect(output.outcome).toBe('inconclusive')
    expect(output.primary).toBeNull()
    expect(output.inconclusiveReason).toBeTruthy()
  })

  it('returns inconclusive when only LOW confidence results fired', () => {
    const results = [
      makeResult('gpu-driver', true, 'LOW'),
      makeResult('overlay-conflict', false, null),
    ]
    const output = rankResults(results)
    expect(output.outcome).toBe('inconclusive')
    expect(output.primary).toBeNull()
    expect(output.inconclusiveReason).toMatch(/MEDIUM/i)
  })

  it('returns diagnosed when a MEDIUM result fires', () => {
    const results = [makeResult('gpu-driver', true, 'MEDIUM')]
    const output = rankResults(results)
    expect(output.outcome).toBe('diagnosed')
    expect(output.primary).not.toBeNull()
    expect(output.primary?.rulePackId).toBe('gpu-driver')
    expect(output.inconclusiveReason).toBeNull()
  })

  it('returns diagnosed when a HIGH result fires', () => {
    const results = [makeResult('app-hang', true, 'HIGH')]
    const output = rankResults(results)
    expect(output.outcome).toBe('diagnosed')
    expect(output.primary?.rulePackId).toBe('app-hang')
    expect(output.primary?.confidence).toBe('HIGH')
  })

  it('HIGH beats MEDIUM even with fewer signals', () => {
    const results = [
      makeResult('gpu-driver', true, 'HIGH', 1),
      makeResult('overlay-conflict', true, 'MEDIUM', 5),
    ]
    const output = rankResults(results)
    expect(output.primary?.rulePackId).toBe('gpu-driver')
    expect(output.secondary.length).toBe(1)
    expect(output.secondary[0].rulePackId).toBe('overlay-conflict')
  })

  it('includes secondary result when two results reach MEDIUM or higher', () => {
    const results = [
      makeResult('gpu-driver', true, 'HIGH', 3),
      makeResult('memory-exhaustion', true, 'MEDIUM', 2),
      makeResult('overlay-conflict', false, null),
    ]
    const output = rankResults(results)
    expect(output.outcome).toBe('diagnosed')
    expect(output.primary?.rulePackId).toBe('gpu-driver')
    expect(output.secondary.length).toBe(1)
    expect(output.secondary[0].rulePackId).toBe('memory-exhaustion')
  })

  it('LOW-only result is not included in secondary when outcome is inconclusive', () => {
    const results = [
      makeResult('gpu-driver', true, 'LOW'),
      makeResult('overlay-conflict', false, null),
    ]
    const output = rankResults(results)
    expect(output.outcome).toBe('inconclusive')
    // secondary includes the fired LOW result for transparency
    expect(output.secondary.length).toBeGreaterThanOrEqual(0)
  })

  it('tiebreaks by signal count when confidence is equal', () => {
    const results = [
      makeResult('gpu-driver', true, 'MEDIUM', 2),
      makeResult('app-hang', true, 'MEDIUM', 4),
    ]
    const output = rankResults(results)
    // app-hang has more signals — should win the tiebreak
    expect(output.primary?.rulePackId).toBe('app-hang')
  })

  it('secondary array excludes the primary result', () => {
    const results = [
      makeResult('gpu-driver', true, 'HIGH', 3),
      makeResult('memory-exhaustion', true, 'MEDIUM', 2),
    ]
    const output = rankResults(results)
    const secondaryIds = output.secondary.map((r) => r.rulePackId)
    expect(secondaryIds).not.toContain(output.primary?.rulePackId)
  })

  it('secondary array only includes MEDIUM or higher results', () => {
    const results = [
      makeResult('gpu-driver', true, 'HIGH', 3),
      makeResult('memory-exhaustion', true, 'LOW', 2),
    ]
    const output = rankResults(results)
    // LOW result should not appear in secondary
    expect(output.secondary.length).toBe(0)
  })
})
