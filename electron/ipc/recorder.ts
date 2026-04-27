import { ipcMain } from 'electron'

export function registerRecorderHandlers(): void {
  ipcMain.handle('recorder:start', (_event, _params: unknown) => {
    // STUB — implemented in Phase 5
    return { ok: true, sessionId: null }
  })

  ipcMain.handle('recorder:mark-issue', () => {
    // STUB — implemented in Phase 5
    return { ok: true, markedAt: null }
  })

  ipcMain.handle('recorder:stop', () => {
    // STUB — implemented in Phase 5
    return { ok: true }
  })
}
