import { randomUUID } from 'crypto'
import { getDatabase } from './schema'
import type { AnalysisResult } from '../types/global'

export function createAnalysisResult(
  result: Omit<AnalysisResult, 'id' | 'created_at'>
): AnalysisResult {
  const db = getDatabase()
  const id = randomUUID()
  const created_at = new Date().toISOString()

  db.prepare(`
    INSERT INTO analysis_results (
      id, session_id, outcome,
      primary_rule_pack_id, primary_confidence, primary_cause_name, primary_output_text,
      secondary_results, all_signals_found, fix_recommendations,
      inconclusive_reason, created_at
    ) VALUES (
      @id, @session_id, @outcome,
      @primary_rule_pack_id, @primary_confidence, @primary_cause_name, @primary_output_text,
      @secondary_results, @all_signals_found, @fix_recommendations,
      @inconclusive_reason, @created_at
    )
  `).run({
    id,
    created_at,
    session_id: result.session_id,
    outcome: result.outcome,
    primary_rule_pack_id: result.primary_rule_pack_id ?? null,
    primary_confidence: result.primary_confidence ?? null,
    primary_cause_name: result.primary_cause_name ?? null,
    primary_output_text: result.primary_output_text ?? null,
    secondary_results: JSON.stringify(result.secondary_results),
    all_signals_found: JSON.stringify(result.all_signals_found),
    fix_recommendations: JSON.stringify(result.fix_recommendations),
    inconclusive_reason: result.inconclusive_reason ?? null,
  })

  return getAnalysisResult(result.session_id) as AnalysisResult
}

export function getAnalysisResult(sessionId: string): AnalysisResult | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM analysis_results WHERE session_id = ?')
    .get(sessionId)
  return row ? rowToAnalysisResult(row as Record<string, unknown>) : null
}

function rowToAnalysisResult(r: Record<string, unknown>): AnalysisResult {
  return {
    id: r['id'] as string,
    session_id: r['session_id'] as string,
    outcome: r['outcome'] as AnalysisResult['outcome'],
    primary_rule_pack_id: (r['primary_rule_pack_id'] as string | null) ?? null,
    primary_confidence: (r['primary_confidence'] as AnalysisResult['primary_confidence']) ?? null,
    primary_cause_name: (r['primary_cause_name'] as string | null) ?? null,
    primary_output_text: (r['primary_output_text'] as string | null) ?? null,
    secondary_results: JSON.parse((r['secondary_results'] as string | null) ?? '[]'),
    all_signals_found: JSON.parse((r['all_signals_found'] as string | null) ?? '[]'),
    fix_recommendations: JSON.parse((r['fix_recommendations'] as string | null) ?? '[]'),
    inconclusive_reason: (r['inconclusive_reason'] as string | null) ?? null,
    created_at: r['created_at'] as string,
  }
}
