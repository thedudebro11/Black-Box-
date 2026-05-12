import { ipcMain, dialog } from 'electron'
import { writeFileSync } from 'fs'

interface SaveReportPayload {
  markdown: string
  filename: string
}

interface SaveReportResult {
  ok: boolean
  filePath?: string
  error?: string
}

export function registerExportHandlers(): void {
  ipcMain.handle(
    'export:save-report',
    async (_event, payload: SaveReportPayload): Promise<SaveReportResult> => {
      const { markdown, filename } = payload

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Session Report',
        defaultPath: filename,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (canceled || filePath == null) {
        return { ok: false, error: 'Save dialog cancelled' }
      }

      try {
        writeFileSync(filePath, markdown, { encoding: 'utf8' })
        return { ok: true, filePath }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message }
      }
    },
  )
}
