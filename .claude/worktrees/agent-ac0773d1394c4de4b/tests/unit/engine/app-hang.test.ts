import { describe, it, expect } from 'vitest'
import { evaluate } from '../../../src/engine/rules/app-hang'
import type { ParsedSession } from '../../../src/engine/types'
import highConfidenceFixture from '../../fixtures/app-hang/high-confidence.json'
import mediumConfidenceFixture from '../../fixtures/app-hang/medium-confidence.json'
import noMatchFixture from '../../fixtures/app-hang/no-match.json'

const asSession = (json: unknown): ParsedSession => json as ParsedSession

describe('Rule Pack 5 — App Hang / Freeze', () => {
  it('fires with HIGH confidence when Event 1002 + disk latency > 500ms + app name matches', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('HIGH')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
    expect(result.outputText).toBeTruthy()
    expect(result.rulePackId).toBe('app-hang')
  })

  it('HIGH result has a critical event signal for Event 1002', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const hangSignal = result.signals.find(
      (s) => s.type === 'event' && s.technical.includes('1002'),
    )
    expect(hangSignal).toBeDefined()
    expect(hangSignal?.severity).toBe('critical')
  })

  it('HIGH result has a disk latency metric signal', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const diskSignal = result.signals.find(
      (s) => s.type === 'metric' && s.description.toLowerCase().includes('disk'),
    )
    expect(diskSignal).toBeDefined()
  })

  it('HIGH result output text mentions disk latency', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.outputText).toMatch(/disk|latency/i)
  })

  it('fires with MEDIUM confidence when Event 1002 matches app name but no disk spike', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('MEDIUM')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
  })

  it('MEDIUM result output text mentions the app name or hang', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    expect(result.outputText).toMatch(/PuzzleGame|hang|stopped responding/i)
  })

  it('does not fire when no Event 1002 and disk latency is below 300ms', () => {
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
