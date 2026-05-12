import { randomUUID } from 'crypto'
import { getDatabase } from './schema'
import type { AppSettings } from '../types/global'

export function initSettings(appVersion: string): void {
  const db = getDatabase()
  const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get()
  if (existing) return

  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO settings
      (id, anonymous_session_id, telemetry_opt_in, first_launch_complete, app_version, created_at, updated_at)
    VALUES
      (1, @anonymous_session_id, 0, 0, @app_version, @created_at, @updated_at)
  `).run({
    anonymous_session_id: randomUUID(),
    app_version: appVersion,
    created_at: now,
    updated_at: now,
  })
}

export function getSettings(): AppSettings {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get()
  if (!row) throw new Error('[db:settings] Not initialized — call initSettings() first')
  const r = row as Record<string, unknown>
  return {
    anonymous_session_id: r['anonymous_session_id'] as string,
    telemetry_opt_in: r['telemetry_opt_in'] === 1,
    first_launch_complete: r['first_launch_complete'] === 1,
    app_version: r['app_version'] as string,
  }
}

export function setTelemetryOptIn(optIn: boolean): void {
  const db = getDatabase()
  db.prepare('UPDATE settings SET telemetry_opt_in = ?, updated_at = ? WHERE id = 1').run(
    optIn ? 1 : 0,
    new Date().toISOString()
  )
}

export function markFirstLaunchComplete(): void {
  const db = getDatabase()
  db.prepare('UPDATE settings SET first_launch_complete = 1, updated_at = ? WHERE id = 1').run(
    new Date().toISOString()
  )
}
