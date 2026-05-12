import { randomUUID } from 'crypto'
import { getDatabase } from './schema'
import type { FollowUp } from '../types/global'

const FOLLOW_UP_DELAY_MS = process.env['VITEST']
  ? 30 * 1000              // 30 seconds in test/dev — matches NOTIFICATION agent spec
  : 48 * 60 * 60 * 1000   // 48 hours in production

const FOLLOW_UP_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

export function createFollowUp(sessionId: string): FollowUp {
  const db = getDatabase()
  const existing = getFollowUp(sessionId)
  if (existing) return existing

  const now = new Date()
  const id = randomUUID()
  const created_at = now.toISOString()
  const scheduled_for = new Date(now.getTime() + FOLLOW_UP_DELAY_MS).toISOString()
  const expires_at = new Date(now.getTime() + FOLLOW_UP_EXPIRY_MS).toISOString()

  db.prepare(`
    INSERT INTO follow_ups
      (id, session_id, scheduled_for, expires_at, created_at, updated_at)
    VALUES
      (@id, @session_id, @scheduled_for, @expires_at, @created_at, @updated_at)
  `).run({ id, session_id: sessionId, scheduled_for, expires_at, created_at, updated_at: created_at })

  return getFollowUp(sessionId) as FollowUp
}

export function getFollowUp(sessionId: string): FollowUp | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM follow_ups WHERE session_id = ?')
    .get(sessionId)
  return row ? rowToFollowUp(row as Record<string, unknown>) : null
}

export function markFollowUpSent(id: string): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare('UPDATE follow_ups SET sent_at = ?, updated_at = ? WHERE id = ?').run(now, now, id)
}

export function recordFollowUpResponse(
  id: string,
  response: string,
  notes: string | null
): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE follow_ups SET response = ?, resolution_notes = ?, updated_at = ? WHERE id = ?'
  ).run(response, notes, new Date().toISOString(), id)
}

export function markFollowUpUploaded(id: string): void {
  const db = getDatabase()
  db.prepare('UPDATE follow_ups SET uploaded = 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  )
}

export function getPendingFollowUps(): FollowUp[] {
  const db = getDatabase()
  const now = new Date().toISOString()
  const rows = db.prepare(`
    SELECT * FROM follow_ups
    WHERE sent_at IS NULL
      AND response IS NULL
      AND scheduled_for <= ?
      AND expires_at > ?
  `).all(now, now) as Record<string, unknown>[]
  return rows.map(rowToFollowUp)
}

function rowToFollowUp(r: Record<string, unknown>): FollowUp {
  return {
    id: r['id'] as string,
    session_id: r['session_id'] as string,
    scheduled_for: r['scheduled_for'] as string,
    sent_at: (r['sent_at'] as string | null) ?? null,
    response: (r['response'] as string | null) ?? null,
    resolution_notes: (r['resolution_notes'] as string | null) ?? null,
    uploaded: r['uploaded'] === 1,
    expires_at: r['expires_at'] as string,
    created_at: r['created_at'] as string,
    updated_at: r['updated_at'] as string,
  }
}
