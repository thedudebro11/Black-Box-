import { ipcMain, BrowserWindow } from 'electron'
import { getSession, updateSession } from '../../src/db/sessions'
import { createAnalysisResult } from '../../src/db/analysis'
import { collectEvents } from '../../src/collectors/events'
import { getHardwareProfile } from '../../src/collectors/drivers'
import { parseTraceFile } from '../../src/pipeline/parser'
import { analyzeSession } from '../../src/engine/analyzer'
type AnalyzerPhase = 'collecting' | 'parsing' | 'scoring' | 'complete' | 'error'

function pushStatus(phase: AnalyzerPhase, progress: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('analyzer:status', { phase, progress })
  }
}

export function registerAnalyzerHandlers(): void {
  ipcMain.handle('analyzer:analyze', async (_event, sessionId: string) => {
    const session = getSession(sessionId)
    if (!session) {
      return { ok: false, error: `session ${sessionId} not found` }
    }
    if (!session.trace_file_path) {
      return { ok: false, error: 'session has no trace file' }
    }

    try {
      pushStatus('collecting', 10)

      const startTime = new Date(session.started_at)
      const endTime = session.stopped_at ? new Date(session.stopped_at) : new Date()

      const [events, hardware] = await Promise.all([
        collectEvents(startTime, endTime),
        getHardwareProfile(),
      ])

      pushStatus('parsing', 40)

      const parsed = parseTraceFile(
        session.trace_file_path,
        session.id,
        session.issue_type,
        session.app_name,
        hardware,
        events
      )

      pushStatus('scoring', 70)

      const engineResult = analyzeSession(parsed)

      const dbResult = createAnalysisResult({
        session_id: session.id,
        outcome: engineResult.outcome,
        primary_rule_pack_id: engineResult.primary_rule_pack_id,
        primary_confidence: engineResult.primary_confidence,
        primary_cause_name: engineResult.primary_cause_name,
        primary_output_text: engineResult.primary_output_text,
        secondary_results: engineResult.secondary_results,
        all_signals_found: engineResult.all_signals_found,
        fix_recommendations: engineResult.fix_recommendations,
        inconclusive_reason: engineResult.inconclusive_reason,
      })

      const finalStatus =
        engineResult.outcome === 'inconclusive' ? 'inconclusive' : 'complete'

      updateSession(session.id, {
        status: finalStatus,
        analyzed_at: new Date().toISOString(),
      })

      // DECISION NEEDED: Phase 10 will schedule a follow-up notification here
      // for inconclusive sessions (see PHASES.md §Phase 10).

      pushStatus('complete', 100)

      return { ok: true, result: dbResult }
    } catch (err) {
      console.error('[analyzer:analyze] error', err)
      updateSession(session.id, { status: 'error' })
      pushStatus('error', 0)
      return { ok: false, error: String(err) }
    }
  })
}
