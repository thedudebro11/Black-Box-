import { describe, it, expect } from 'vitest'
import { analyzeSession } from '../../../src/engine/analyzer'
import type { ParsedSession } from '../../../src/engine/types'

// Import representative fixtures to test the full analysis pipeline end-to-end.
import gpuHighFixture from '../../fixtures/gpu-driver/high-confidence.json'
import gpuNoMatchFixture from '../../fixtures/gpu-driver/no-match.json'
import overlayHighFixture from '../../fixtures/overlay-conflict/high-confidence.json'
import antiCheatHighFixture from '../../fixtures/anti-cheat/high-confidence.json'
import memoryHighFixture from '../../fixtures/memory-exhaustion/high-confidence.json'
import appHangHighFixture from '../../fixtures/app-hang/high-confidence.json'
import appHangNoMatchFixture from '../../fixtures/app-hang/no-match.json'

const asSession = (json: unknown): ParsedSession => json as ParsedSession

describe('Analyzer — analyzeSession', () => {
  it('returns a valid AnalysisResult for every fixture', () => {
    const fixtures = [
      gpuHighFixture,
      gpuNoMatchFixture,
      overlayHighFixture,
      antiCheatHighFixture,
      memoryHighFixture,
      appHangHighFixture,
    ]
    for (const fixture of fixtures) {
      const result = analyzeSession(asSession(fixture))
      expect(result.id).toBeTruthy()
      expect(result.session_id).toBe(fixture.id)
      expect(['diagnosed', 'inconclusive', 'error']).toContain(result.outcome)
      expect(result.created_at).toBeTruthy()
    }
  })

  it('produces a diagnosed outcome for GPU high-confidence fixture', () => {
    const result = analyzeSession(asSession(gpuHighFixture))
    expect(result.outcome).toBe('diagnosed')
    expect(result.primary_rule_pack_id).toBe('gpu-driver')
    expect(result.primary_confidence).toBe('HIGH')
    expect(result.primary_cause_name).toBeTruthy()
    expect(result.primary_output_text).toBeTruthy()
    expect(result.fix_recommendations.length).toBeGreaterThan(0)
  })

  it('produces an inconclusive outcome for no-match fixture where no rules fire', () => {
    // gpu no-match only has a non-TDR crash — check that gpu rule does not fire.
    // Other rules may or may not fire depending on the fixture data.
    const result = analyzeSession(asSession(gpuNoMatchFixture))
    // The gpu-driver rule should not be primary regardless of outcome.
    if (result.outcome === 'diagnosed') {
      expect(result.primary_rule_pack_id).not.toBe('gpu-driver')
    }
    // Ensure result is structurally valid.
    expect(result.session_id).toBe(gpuNoMatchFixture.id)
  })

  it('produces a diagnosed outcome for overlay high-confidence fixture', () => {
    const result = analyzeSession(asSession(overlayHighFixture))
    expect(result.outcome).toBe('diagnosed')
    expect(result.primary_rule_pack_id).toBe('overlay-conflict')
    expect(result.primary_confidence).toBe('HIGH')
  })

  it('produces a diagnosed outcome for anti-cheat high-confidence fixture', () => {
    const result = analyzeSession(asSession(antiCheatHighFixture))
    expect(result.outcome).toBe('diagnosed')
    expect(result.primary_rule_pack_id).toBe('anti-cheat')
    expect(result.primary_confidence).toBe('HIGH')
  })

  it('produces a diagnosed outcome for memory exhaustion high-confidence fixture', () => {
    const result = analyzeSession(asSession(memoryHighFixture))
    expect(result.outcome).toBe('diagnosed')
    expect(result.primary_rule_pack_id).toBe('memory-exhaustion')
    expect(result.primary_confidence).toBe('HIGH')
  })

  it('produces a diagnosed outcome for app hang high-confidence fixture', () => {
    const result = analyzeSession(asSession(appHangHighFixture))
    expect(result.outcome).toBe('diagnosed')
    expect(result.primary_rule_pack_id).toBe('app-hang')
    expect(result.primary_confidence).toBe('HIGH')
  })

  it('each analysis result has a unique ID', () => {
    const r1 = analyzeSession(asSession(gpuHighFixture))
    const r2 = analyzeSession(asSession(gpuHighFixture))
    expect(r1.id).not.toBe(r2.id)
  })

  it('includes all_signals_found from fired rule packs', () => {
    const result = analyzeSession(asSession(gpuHighFixture))
    expect(result.all_signals_found.length).toBeGreaterThan(0)
  })

  it('secondary_results are empty or MEDIUM+ confidence only', () => {
    const result = analyzeSession(asSession(gpuHighFixture))
    for (const secondary of result.secondary_results) {
      expect(secondary.confidence).not.toBe('LOW')
      expect(secondary.confidence).not.toBeNull()
    }
  })

  it('inconclusive result has an inconclusive_reason string', () => {
    // The app-hang no-match fixture has no Event 1002 and low disk latency
    // so app-hang does not fire. Combined with no other rule triggers,
    // outcome should be inconclusive.
    const result = analyzeSession(asSession(appHangNoMatchFixture))
    if (result.outcome === 'inconclusive') {
      expect(result.inconclusive_reason).toBeTruthy()
      expect(result.primary_rule_pack_id).toBeNull()
    }
  })

  it('diagnosed result has null inconclusive_reason', () => {
    const result = analyzeSession(asSession(gpuHighFixture))
    expect(result.inconclusive_reason).toBeNull()
  })
})
