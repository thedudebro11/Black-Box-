import { randomUUID } from 'crypto'
import { getDatabase } from './schema'
import type { Session, IssueType, SessionStatus } from '../types/global'

export interface CreateSessionParams {
  issue_type: IssueType
  app_name: string
  description: string | null
}

export function createSession(params: CreateSessionParams): Session {
  const db = getDatabase()
  const now = new Date().toISOString()
  const id = randomUUID()

  db.prepare(`
    INSERT INTO sessions
      (id, status, issue_type, app_name, description, started_at, created_at, updated_at)
    VALUES
      (@id, @status, @issue_type, @app_name, @description, @started_at, @created_at, @updated_at)
  `).run({
    id,
    status: 'recording' as SessionStatus,
    issue_type: params.issue_type,
    app_name: params.app_name,
    description: params.description,
    started_at: now,
    created_at: now,
    updated_at: now,
  })

  return getSession(id) as Session
}

export function getSession(id: string): Session | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
  return row ? rowToSession(row as Record<string, unknown>) : null
}

export function updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'created_at'>>): Session {
  const db = getDatabase()
  const fields = Object.keys(updates)
    .map(k => `${k} = @${k}`)
    .join(', ')

  db.prepare(`UPDATE sessions SET ${fields}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...updates, id, updated_at: new Date().toISOString() })

  return getSession(id) as Session
}

export function listSessions(limit = 100): Session[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Record<string, unknown>[]
  return rows.map(rowToSession)
}

export function deleteSession(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
}

function rowToSession(r: Record<string, unknown>): Session {
  return {
    id: r['id'] as string,
    status: r['status'] as SessionStatus,
    issue_type: r['issue_type'] as IssueType,
    app_name: r['app_name'] as string,
    description: (r['description'] as string | null) ?? null,
    started_at: r['started_at'] as string,
    stopped_at: (r['stopped_at'] as string | null) ?? null,
    issue_marker_at: (r['issue_marker_at'] as string | null) ?? null,
    analyzed_at: (r['analyzed_at'] as string | null) ?? null,
    trace_file_path: (r['trace_file_path'] as string | null) ?? null,
    trace_truncated: r['trace_truncated'] === 1,
    created_at: r['created_at'] as string,
    updated_at: r['updated_at'] as string,
  }
}
