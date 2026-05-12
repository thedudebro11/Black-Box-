import { ipcMain, app, BrowserWindow } from 'electron'
import path from 'path'
import type { IssueType } from '../../src/types/global'
import {
  startRecording,
  markIssue,
  stopRecording,
  hasActiveSession,
} from '../../src/pipeline/session-manager'

function tracesDir(): string {
  return path.join(app.getPath('userData'), 'traces')
}

export function registerRecorderHandlers(): void {
  ipcMain.handle(
    'recorder:start',
    async (
      _event,
      params: { issueType: IssueType; appName: string; description: string | null }
    ) => {
      if (hasActiveSession()) {
        return { ok: false, error: 'A recording is already in progress' }
      }

      try {
        const sessionId = await startRecording({
          issueType: params.issueType,
          appName: params.appName,
          description: params.description ?? null,
          tracesDir: tracesDir(),
          onMetricsSample: (sample) => {
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send('recorder:live-metrics', sample)
            }
          },
        })
        return { ok: true, sessionId }
      } catch (err) {
        console.error('[recorder:start] error', err)
        return { ok: false, error: String(err) }
      }
    }
  )

  ipcMain.handle('recorder:mark-issue', () => {
    try {
      const ts = markIssue()
      return { ok: true, ts }
    } catch (err) {
      console.error('[recorder:mark-issue] error', err)
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('recorder:stop', () => {
    try {
      const { sessionId } = stopRecording()
      return { ok: true, sessionId }
    } catch (err) {
      console.error('[recorder:stop] error', err)
      return { ok: false, error: String(err) }
    }
  })
}
