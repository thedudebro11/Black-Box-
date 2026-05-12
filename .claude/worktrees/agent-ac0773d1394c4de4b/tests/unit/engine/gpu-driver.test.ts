import { describe, it, expect } from 'vitest'
import { evaluate } from '../../../src/engine/rules/gpu-driver'
import type { ParsedSession } from '../../../src/engine/types'
import highConfidenceFixture from '../../fixtures/gpu-driver/high-confidence.json'
import mediumConfidenceFixture from '../../fixtures/gpu-driver/medium-confidence.json'
import noMatchFixture from '../../fixtures/gpu-driver/no-match.json'

// Cast fixtures through unknown to satisfy strict typing — the JSON shape
// matches ParsedSession exactly per the fixture format spec.
const asSession = (json: unknown): ParsedSession => json as ParsedSession

describe('Rule Pack 1 — GPU Driver Instability / TDR', () => {
  it('fires with HIGH confidence when TDR event + high GPU util + game exit are present', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('HIGH')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
    expect(result.outputText).toBeTruthy()
    expect(result.rulePackId).toBe('gpu-driver')
  })

  it('HIGH result has at least one critical signal', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const criticalSignals = result.signals.filter((s) => s.severity === 'critical')
    expect(criticalSignals.length).toBeGreaterThan(0)
  })

  it('HIGH result output text references the TDR event', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.outputText).toMatch(/TDR|driver reset/i)
  })

  it('fires with MEDIUM confidence when TDR event present but no supporting signals', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('MEDIUM')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
  })

  it('MEDIUM result has TDR signal in incident window', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    const tdrSignal = result.signals.find((s) => s.type === 'event' && s.window === 'incident')
    expect(tdrSignal).toBeDefined()
  })

  it('does not fire when no TDR signals are present', () => {
    const result = evaluate(asSession(noMatchFixture))
    expect(result.fired).toBe(false)
    expect(result.confidence).toBeNull()
    expect(result.signals.length).toBe(0)
    expect(result.fixRecommendations.length).toBe(0)
  })

  it('no-match result has empty outputText', () => {
    const result = evaluate(asSession(noMatchFixture))
    expect(result.outputText).toBe('')
  })

  it('fix recommendations are ordered starting from 1', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const orders = result.fixRecommendations.map((f) => f.order)
    expect(orders[0]).toBe(1)
    orders.forEach((order, i) => {
      if (i > 0) expect(order).toBeGreaterThan(orders[i - 1])
    })
  })

  it('all signals have required fields', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    for (const signal of result.signals) {
      expect(signal.type).toBeTruthy()
      expect(signal.description).toBeTruthy()
      expect(signal.technical).toBeTruthy()
      expect(signal.window).toMatch(/^(baseline|incident|aftermath)$/)
      expect(signal.severity).toMatch(/^(critical|supporting|informational)$/)
      expect(signal.ts).toBeTruthy()
      expect(typeof signal.seconds_before_marker).toBe('number')
    }
  })
})
