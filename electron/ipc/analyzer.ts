import { ipcMain } from 'electron'

export function registerAnalyzerHandlers(): void {
  ipcMain.handle('analyzer:analyze', (_event, _sessionId: string) => {
    // STUB — implemented in Phase 5
    return { ok: true, resultId: null }
  })
}
