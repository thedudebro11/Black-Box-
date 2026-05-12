/**
 * electron/ipc/telemetry.ts — IPC handlers for telemetry and settings.
 *
 * Handles:
 *   settings:get                — returns current AppSettings
 *   settings:set-telemetry-opt-in — persists the user's opt-in choice
 *   settings:complete-first-launch — marks first launch as complete
 *   telemetry:upload            — sanitizes and uploads a session if opted in
 */

import { ipcMain } from 'electron'
import { getSettings, setTelemetryOptIn, markFirstLaunchComplete } from '../../src/db/settings'
import { getAnalysisResult } from '../../src/db/analysis'
import { sanitize } from '../../src/telemetry/sanitizer'
import { uploadSession } from '../../src/telemetry/uploader'

export function registerTelemetryHandlers(): void {
  // ── settings:get ─────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => {
    try {
      return getSettings()
    } catch (err) {
      console.error('[ipc:settings:get]', err)
      // Return a safe default so the renderer can still render
      return {
        anonymous_session_id: '',
        telemetry_opt_in: false,
        first_launch_complete: false,
        app_version: '1.0.0',
      }
    }
  })

  // ── settings:set-telemetry-opt-in ─────────────────────────────────────────────
  ipcMain.handle('settings:set-telemetry-opt-in', (_event, { optIn }: { optIn: boolean }) => {
    try {
      setTelemetryOptIn(optIn)
    } catch (err) {
      console.error('[ipc:settings:set-telemetry-opt-in]', err)
    }
  })

  // ── settings:complete-first-launch ────────────────────────────────────────────
  ipcMain.handle('settings:complete-first-launch', () => {
    try {
      markFirstLaunchComplete()
    } catch (err) {
      console.error('[ipc:settings:complete-first-launch]', err)
    }
  })

  // ── telemetry:upload ──────────────────────────────────────────────────────────
  ipcMain.handle('telemetry:upload', async (_event, sessionId: string) => {
    try {
      const settings = getSettings()
      if (!settings.telemetry_opt_in) {
        return { success: true }
      }

      const result = getAnalysisResult(sessionId)
      if (!result) {
        console.warn(`[ipc:telemetry:upload] no analysis result found for session ${sessionId.slice(-8)}`)
        return { success: false }
      }

      const payload = sanitize(result)
      await uploadSession(payload)

      return { success: true }
    } catch (err) {
      // Upload errors must never crash the app or surface to the user
      console.error('[ipc:telemetry:upload]', err)
      return { success: false }
    }
  })
}
