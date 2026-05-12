/**
 * src/engine/scorer.ts
 *
 * Applies the confidence ranking logic from docs/CLAUDE.md to a set of
 * RuleResult objects and returns a ranked primary cause and secondary results.
 *
 * Ranking logic (applied in order):
 * 1. Filter to only fired === true results
 * 2. Sort by confidence: HIGH > MEDIUM > LOW
 * 3. Tiebreak: more signals wins
 * 4. Tiebreak: average seconds_before_marker (closer to crash wins — lower abs value)
 * 5. Tiebreak: specific Event IDs over generic ones (resolved by signal severity)
 * 6. If highest confidence among fired rules is LOW only → inconclusive
 * 7. If two results both reach MEDIUM or higher → primary + secondary
 */

import type { RuleResult, Confidence } from './types'

// Numeric rank for confidence levels — higher is better.
const CONFIDENCE_RANK: Record<Confidence, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

export interface RankOutput {
  primary: RuleResult | null
  secondary: RuleResult[]
  outcome: 'diagnosed' | 'inconclusive'
  inconclusiveReason: string | null
}

/**
 * Ranks a set of RuleResults and returns the primary cause, any secondary
 * contributing factors, and the overall diagnosis outcome.
 *
 * All five rule pack results are expected.  Results with fired === false
 * are included in the return value for audit transparency but do not
 * affect ranking.
 */
export function rankResults(results: RuleResult[]): RankOutput {
  // Step 1: filter to fired results only for ranking.
  const firedResults = results.filter((r) => r.fired)

  if (firedResults.length === 0) {
    return {
      primary: null,
      secondary: [],
      outcome: 'inconclusive',
      inconclusiveReason: 'No rule pack detected a recognisable signal pattern in this session.',
    }
  }

  // Step 2-5: sort by confidence, then tiebreakers.
  const sorted = [...firedResults].sort((a, b) => {
    const aConf = a.confidence !== null ? CONFIDENCE_RANK[a.confidence] : 0
    const bConf = b.confidence !== null ? CONFIDENCE_RANK[b.confidence] : 0

    // Primary sort: confidence level descending.
    if (bConf !== aConf) return bConf - aConf

    // Tiebreak 1: more confirmed signals wins.
    if (b.signals.length !== a.signals.length) return b.signals.length - a.signals.length

    // Tiebreak 2: average seconds_before_marker — lower absolute value = closer to crash.
    const aAvgSecs = averageSecondsBeforeMarker(a)
    const bAvgSecs = averageSecondsBeforeMarker(b)
    if (Math.abs(aAvgSecs) !== Math.abs(bAvgSecs)) {
      return Math.abs(aAvgSecs) - Math.abs(bAvgSecs)
    }

    // Tiebreak 3: presence of critical signals over supporting (via severity count).
    const aCritical = a.signals.filter((s) => s.severity === 'critical').length
    const bCritical = b.signals.filter((s) => s.severity === 'critical').length
    return bCritical - aCritical
  })

  // Step 6: if the highest confidence is LOW only → inconclusive.
  // sorted is guaranteed non-empty (firedResults was non-empty before sorting).
  const topResult = sorted[0]
  if (topResult === undefined) {
    // Safety guard — unreachable given the firedResults.length === 0 check above.
    return {
      primary: null,
      secondary: [],
      outcome: 'inconclusive',
      inconclusiveReason: 'No rule pack detected a recognisable signal pattern in this session.',
    }
  }

  const topConfidence = topResult.confidence

  if (topConfidence === null || topConfidence === 'LOW') {
    return {
      primary: null,
      secondary: sorted,
      outcome: 'inconclusive',
      inconclusiveReason:
        'No rule pack reached MEDIUM confidence — signals present but insufficient to confirm a cause.',
    }
  }

  // Step 7: collect secondary results that also reach MEDIUM or higher.
  // Exclude the primary result.  Label them as contributing factors by
  // including them in the secondary array.
  const atLeastMedium = sorted.filter(
    (r, idx) => idx > 0 && r.confidence !== null && CONFIDENCE_RANK[r.confidence] >= 2,
  )

  return {
    primary: topResult,
    secondary: atLeastMedium,
    outcome: 'diagnosed',
    inconclusiveReason: null,
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Computes the average seconds_before_marker across all signals in a result.
 * Signals closer to 0 (closer to the crash point) indicate tighter timing.
 * Returns a large positive number if there are no signals (sorts last).
 */
function averageSecondsBeforeMarker(result: RuleResult): number {
  if (result.signals.length === 0) return 9999
  const total = result.signals.reduce((sum, s) => sum + s.seconds_before_marker, 0)
  return total / result.signals.length
}
