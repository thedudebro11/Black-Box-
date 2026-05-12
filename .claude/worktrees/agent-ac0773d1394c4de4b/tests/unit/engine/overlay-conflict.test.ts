import { describe, it, expect } from 'vitest'
import { evaluate } from '../../../src/engine/rules/overlay-conflict'
import type { ParsedSession } from '../../../src/engine/types'
import highConfidenceFixture from '../../fixtures/overlay-conflict/high-confidence.json'
import mediumConfidenceFixture from '../../fixtures/overlay-conflict/medium-confidence.json'
import noMatchFixture from '../../fixtures/overlay-conflict/no-match.json'

const asSession = (json: unknown): ParsedSession => json as ParsedSession

describe('Rule Pack 2 — Overlay Conflict', () => {
  it('fires with HIGH confidence when silent crash + overlay DLL faulting module + 2+ overlay processes', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('HIGH')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
    expect(result.outputText).toBeTruthy()
    expect(result.rulePackId).toBe('overlay-conflict')
  })

  it('HIGH result output text mentions the overlay faulting module', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.outputText).toMatch(/GameOverlayRenderer64\.dll/i)
  })

  it('HIGH result has process signals for the overlay processes', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    const processSignals = result.signals.filter((s) => s.type === 'process')
    expect(processSignals.length).toBeGreaterThan(1)
  })

  it('fires with MEDIUM confidence when silent crash + 2+ overlay processes (no faulting module)', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    expect(result.fired).toBe(true)
    expect(result.confidence).toBe('MEDIUM')
    expect(result.signals.length).toBeGreaterThan(0)
    expect(result.fixRecommendations.length).toBeGreaterThan(0)
  })

  it('MEDIUM result output text mentions overlay programs', () => {
    const result = evaluate(asSession(mediumConfidenceFixture))
    expect(result.outputText).toMatch(/overlay/i)
  })

  it('does not fire when Event 1000 names a non-overlay faulting module', () => {
    const result = evaluate(asSession(noMatchFixture))
    expect(result.fired).toBe(false)
    expect(result.confidence).toBeNull()
    expect(result.fixRecommendations.length).toBe(0)
  })

  it('no-match result has empty outputText', () => {
    const result = evaluate(asSession(noMatchFixture))
    expect(result.outputText).toBe('')
  })

  it('disqualifiedBy is empty when rule fires normally', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.disqualifiedBy).toEqual([])
  })

  it('fix recommendations include disabling overlays as first step', () => {
    const result = evaluate(asSession(highConfidenceFixture))
    expect(result.fixRecommendations[0].order).toBe(1)
    expect(result.fixRecommendations[0].detail).toMatch(/overlay/i)
  })
})
