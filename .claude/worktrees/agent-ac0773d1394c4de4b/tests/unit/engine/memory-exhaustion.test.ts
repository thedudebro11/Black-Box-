import { describe, it, expect } from 'vitest'
import { evaluate } from '../../../src/engine/rules/memory-exhaustion'
import type { ParsedSession } from '../../../src/engine/types'
import highConfidenceFixture from '../../fixtures/memory-exhaustion/high-confidence.json'
import mediumConfidenceFixture from '../../fixtures/memory-exhaustion/medium-confidence.json'
import noMatchFixture from '../../fixtures/memory-exhaustion/no-match.json'

const asSession = (json: unknown): ParsedSession => json as ParsedSession

describe('Rule Pack 4 — Memory Exhaustion', () => {
  it('fires with HIGH confidence when Event 2004 + sustained high RAM + game is top consumer', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('HIGH')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
    expect(result.outputText).toBeTruthy()
    expect(result.rulePackId).toBe('memory-exhaustion')
  })

  it('HIGH result has a critical event signal for Event 2004', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const eventSignals = result.signals.filter(
      (s) => s.type === 'event' && s.severity === 'critical',
    )
    expect(eventSignals.length).toBeGreaterThan(0)
    expect(eventSignals[0].technical).toMatch(/2004/)
  })

  it('HIGH result output text mentions RAM percentage', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.outputText).toMatch(/RAM|memory/i)
    expect(result.outputText).toMatch(/%/)
  })

  it('HIGH result has a metric signal for RAM usage', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const metricSignals = result.signals.filter((s) => s.type === 'metric')
    expect(metricSignals.length).toBeGreaterThan(0)
  })

  it('fires with MEDIUM confidence when Event 2004 present but RAM not sustained above 90%', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('MEDIUM')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
  })

  it('does not fire when RAM stays below 85% throughout session', () => {
    const result = evaluate(asSession(noMatchFixture))
    expect(result.fired).toBe(false)
    expect(result.confidence).toBeNull()
  })

  it('no-match result has empty outputText', () => {
    const result = evaluate(asSession(noMatchFixture))
    expect(result.outputText).toBe('')
  })

  it('disqualifiedBy is empty when rule fires normally', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.disqualifiedBy).toEqual([])
  })
})
