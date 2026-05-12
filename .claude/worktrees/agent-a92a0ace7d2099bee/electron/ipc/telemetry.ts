import { ipcMain } from 'electron'

export function registerTelemetryHandlers(): void {
  ipcMain.handle('telemetry:upload', (_event, _sessionId: string) => {
    // STUB — implemented in Phase 9
    return { ok: true }
  })
}
