import { describe, it, expect } from 'vitest'
import { evaluate } from '../../../src/engine/rules/anti-cheat'
import type { ParsedSession } from '../../../src/engine/types'
import highConfidenceFixture from '../../fixtures/anti-cheat/high-confidence.json'
import mediumConfidenceFixture from '../../fixtures/anti-cheat/medium-confidence.json'
import noMatchFixture from '../../fixtures/anti-cheat/no-match.json'

const asSession = (json: unknown): ParsedSession => json as ParsedSession

describe('Rule Pack 3 — Anti-Cheat Conflict', () => {
  it('fires with HIGH confidence when anti-cheat exits before game + FilterManager event + error exit code', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('HIGH')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
    expect(result.outputText).toBeTruthy()
    expect(result.rulePackId).toBe('anti-cheat')
  })

  it('HIGH result output text names the anti-cheat process', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.outputText).toMatch(/EasyAntiCheat\.exe/i)
  })

  it('HIGH result has a process signal for the anti-cheat exit', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const processSignals = result.signals.filter((s) => s.type === 'process')
    expect(processSignals.length).toBeGreaterThan(0)
    expect(processSignals[0].description).toMatch(/EasyAntiCheat|anti-cheat/i)
  })

  it('HIGH result has an event signal for the FilterManager event', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const eventSignals = result.signals.filter((s) => s.type === 'event')
    expect(eventSignals.length).toBeGreaterThan(0)
  })

  it('fires with MEDIUM confidence when anti-cheat exits with error but no FilterManager event', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('MEDIUM')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
  })

  it('does not fire when no anti-cheat process is present in session', () => {
    const result = evaluate(asSession(noMatchFixture))
    expect(result.fired).toBe(false)
    expect(result.confidence).toBeNull()
    expect(result.signals.length).toBe(0)
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
