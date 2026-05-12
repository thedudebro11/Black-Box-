/**
 * src/engine/analyzer.ts
 *
 * Analysis orchestrator.  Runs all five rule packs against a ParsedSession
 * and returns a complete AnalysisResult.
 *
 * This function is purely deterministic — it does NOT write to the database,
 * read from disk, or have any side effects.  The pipeline agent is responsible
 * for persisting the result.
 *
 * All five rule packs run every time.  Disqualification is encoded in
 * RuleResult.disqualifiedBy, not by skipping rule packs — this ensures full
 * transparency in the output.
 */

import type { ParsedSession, AnalysisResult, SignalMatch, FixStep, RuleResult } from './types'
import { evaluate as evaluateGpuDriver } from './rules/gpu-driver'
import { evaluate as evaluateOverlayConflict } from './rules/overlay-conflict'
import { evaluate as evaluateAntiCheat } from './rules/anti-cheat'
import { evaluate as evaluateMemoryExhaustion } from './rules/memory-exhaustion'
import { evaluate as evaluateAppHang } from './rules/app-hang'
import { rankResults } from './scorer'

// Generate a pseudo-random UUID without importing Node's crypto module.
// The engine is a pure module that runs in both Node (tests, main process)
// and the browser renderer — so we avoid Node-only imports here.
// The pipeline agent will replace these IDs with proper UUIDs when writing
// results to the database.
function generateId(): string {
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(0, 3)}-${(Math.floor(Math.random() * 4) + 8).toString(16)}${hex().slice(0, 3)}-${hex()}${hex().slice(0, 4)}`
}

// Human-readable cause names keyed by rule pack ID.
const CAUSE_NAMES: Record<string, string> = {
  'gpu-driver': 'GPU Driver Instability / TDR',
  'overlay-conflict': 'Overlay Conflict',
  'anti-cheat': 'Anti-Cheat Conflict',
  'memory-exhaustion': 'Memory Exhaustion',
  'app-hang': 'App Hang / Freeze',
}

/**
 * Runs all five rule packs against the provided session and returns a ranked
 * AnalysisResult.  Never throws — returns an error outcome if an exception
 * occurs inside a rule pack evaluation.
 */
export function analyzeSession(session: ParsedSession): AnalysisResult {
  const now = new Date().toISOString()

  let ruleResults: RuleResult[]

  try {
    ruleResults = [
      evaluateGpuDriver(session),
      evaluateOverlayConflict(session),
      evaluateAntiCheat(session),
      evaluateMemoryExhaustion(session),
      evaluateAppHang(session),
    ]
  } catch (err: unknown) {
    // If any rule pack throws (should never happen with well-typed fixtures,
    // but defensive coding required), return an error outcome so the pipeline
    // can surface it appropriately.
    const message =
      err instanceof Error ? err.message : 'Unknown error during rule pack evaluation'
    return {
      id: generateId(),
      session_id: session.id,
      outcome: 'error',
      primary_rule_pack_id: null,
      primary_confidence: null,
      primary_cause_name: null,
      primary_output_text: null,
      secondary_results: [],
      all_signals_found: [],
      fix_recommendations: [],
      inconclusive_reason: `Analysis failed: ${message}`,
      created_at: now,
    }
  }

  // Rank results using the scorer.
  const { primary, secondary, outcome, inconclusiveReason } = rankResults(ruleResults)

  // Aggregate all signals found across all fired rule packs for the full
  // signal list included in session reports and telemetry.
  const allSignalsFound: SignalMatch[] = ruleResults
    .filter((r) => r.fired)
    .flatMap((r) => r.signals)

  // Use the primary result's fix recommendations.  If inconclusive, include
  // recommendations from the first fired result if any (gives user something
  // to try even without a confirmed cause).
  const fixRecommendations: FixStep[] =
    primary !== null
      ? primary.fixRecommendations
      : (secondary[0]?.fixRecommendations ?? [])

  return {
    id: generateId(),
    session_id: session.id,
    outcome,
    primary_rule_pack_id: primary !== null ? primary.rulePackId : null,
    primary_confidence: primary !== null ? primary.confidence : null,
    primary_cause_name: primary !== null ? (CAUSE_NAMES[primary.rulePackId] ?? primary.rulePackId) : null,
    primary_output_text: primary !== null ? primary.outputText : null,
    secondary_results: secondary,
    all_signals_found: allSignalsFound,
    fix_recommendations: fixRecommendations,
    inconclusive_reason: inconclusiveReason,
    created_at: now,
  }
}
