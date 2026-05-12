import { ipcMain, BrowserWindow } from 'electron'
import { getSession, updateSession } from '../../src/db/sessions'
import { createAnalysisResult } from '../../src/db/analysis'
import { collectEvents } from '../../src/collectors/events'
import { getHardwareProfile } from '../../src/collectors/drivers'
import { parseTraceFile } from '../../src/pipeline/parser'
import { analyzeSession } from '../../src/engine/analyzer'
import { scheduleFollowUp } from '../../src/notifications/follow-up-scheduler'

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

      // Extend the collection window to cover the aftermath window (2 min after
      // the issue marker). WER logs Event 1002 when the hung process is closed —
      // which can happen after the user stops recording. Capped at now so we
      // never query into the future.
      const AFTERMATH_MS = 2 * 60 * 1000
      const baseEnd = session.stopped_at ? new Date(session.stopped_at) : new Date()
      const markerEnd = session.issue_marker_at
        ? new Date(new Date(session.issue_marker_at).getTime() + AFTERMATH_MS)
        : baseEnd
      const endTime = markerEnd > baseEnd ? new Date(Math.min(markerEnd.getTime(), Date.now())) : baseEnd

      console.log(`[analyzer] collecting events ${startTime.toISOString()} → ${endTime.toISOString()}`)
      const t0 = Date.now()

      const [events, hardware] = await Promise.all([
        collectEvents(startTime, endTime).then((r) => {
          const summary = r.reduce<Record<number, number>>((acc, e) => {
            acc[e.event_id] = (acc[e.event_id] ?? 0) + 1
            return acc
          }, {})
          console.log(`[analyzer] collectEvents done in ${Date.now() - t0}ms, ${r.length} events:`, JSON.stringify(summary))
          return r
        }),
        getHardwareProfile().then((r) => {
          console.log(`[analyzer] getHardwareProfile done in ${Date.now() - t0}ms, gpu=${r.gpu_model}`)
          return r
        }),
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

      // Schedule a follow-up notification for inconclusive sessions.
      // The notification fires 48 h later (30 s in test env) if the user
      // has not responded and the 7-day expiry window has not elapsed.
      if (engineResult.outcome === 'inconclusive') {
        try {
          scheduleFollowUp(session.id)
        } catch (err) {
          console.error('[analyzer] failed to schedule follow-up', err)
        }
      }

      pushStatus('complete', 100)

      console.log(`[analyzer:analyze] complete — outcome=${engineResult.outcome}`)
      return { ok: true, result: dbResult }
    } catch (err) {
      console.error('[analyzer:analyze] error', err)
      updateSession(session.id, { status: 'error' })
      pushStatus('error', 0)
      return { ok: false, error: String(err) }
    }
  })
}
