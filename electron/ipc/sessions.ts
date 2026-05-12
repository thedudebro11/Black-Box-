import { ipcMain } from 'electron'
import { listSessions, getSession, deleteSession } from '../../src/db/sessions'
import { getAnalysisResult } from '../../src/db/analysis'
import type { Session, AnalysisResult } from '../../src/types/global'

export function registerSessionHandlers(): void {
  // sessions:list — returns Session[] most recent first
  ipcMain.handle('sessions:list', (): Session[] => {
    return listSessions(100)
  })

  // sessions:get-with-result — returns { session, result } or null
  ipcMain.handle(
    'sessions:get-with-result',
    (_event, sessionId: string): { session: Session; result: AnalysisResult | null } | null => {
      const session = getSession(sessionId)
      if (!session) return null
      const result = getAnalysisResult(sessionId)
      return { session, result }
    }
  )

  // sessions:delete — deletes session by ID, returns { ok: boolean }
  ipcMain.handle(
    'sessions:delete',
    (_event, sessionId: string): { ok: boolean; error?: string } => {
      try {
        deleteSession(sessionId)
        return { ok: true }
      } catch (err) {
        console.error('[sessions:delete] error', err)
        return { ok: false, error: String(err) }
      }
    }
  )
}
