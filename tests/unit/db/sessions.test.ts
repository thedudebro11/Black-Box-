import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, _resetForTesting } from '../../../src/db/schema'
import { initSettings } from '../../../src/db/settings'
import {
  createSession,
  getSession,
  updateSession,
  listSessions,
  deleteSession,
} from '../../../src/db/sessions'

beforeEach(() => {
  initDatabase()
  initSettings('1.0.0-test')
})

afterEach(() => {
  _resetForTesting()
})

describe('createSession', () => {
  it('creates a row and returns the session', () => {
    const session = createSession({
      issue_type: 'crash',
      app_name: 'TestGame.exe',
      description: null,
    })

    expect(session.id).toBeTruthy()
    expect(session.status).toBe('recording')
    expect(session.issue_type).toBe('crash')
    expect(session.app_name).toBe('TestGame.exe')
    expect(session.description).toBeNull()
    expect(session.trace_truncated).toBe(false)
    expect(session.started_at).toBeTruthy()
    expect(session.created_at).toBeTruthy()
  })

  it('stores an optional description', () => {
    const session = createSession({
      issue_type: 'freeze',
      app_name: 'SomeApp.exe',
      description: 'Froze after 10 minutes',
    })
    expect(session.description).toBe('Froze after 10 minutes')
  })
})

describe('getSession', () => {
  it('returns null for a non-existent ID', () => {
    expect(getSession('does-not-exist')).toBeNull()
  })

  it('returns the correct session for an existing ID', () => {
    const created = createSession({ issue_type: 'bsod', app_name: 'App.exe', description: null })
    const fetched = getSession(created.id)

    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.issue_type).toBe('bsod')
  })
})

describe('updateSession', () => {
  it('changes only the specified fields', () => {
    const session = createSession({ issue_type: 'app_hang', app_name: 'Hang.exe', description: null })
    const stoppedAt = new Date().toISOString()

    const updated = updateSession(session.id, {
      status: 'complete',
      stopped_at: stoppedAt,
    })

    expect(updated.status).toBe('complete')
    expect(updated.stopped_at).toBe(stoppedAt)
    expect(updated.issue_type).toBe('app_hang')
    expect(updated.app_name).toBe('Hang.exe')
  })
})

describe('listSessions', () => {
  it('returns sessions most recent first', async () => {
    createSession({ issue_type: 'crash', app_name: 'First.exe', description: null })
    await new Promise(r => setTimeout(r, 5))
    createSession({ issue_type: 'freeze', app_name: 'Second.exe', description: null })

    const sessions = listSessions()
    expect(sessions[0].app_name).toBe('Second.exe')
    expect(sessions[1].app_name).toBe('First.exe')
  })

  it('respects the limit parameter', () => {
    createSession({ issue_type: 'crash', app_name: 'A.exe', description: null })
    createSession({ issue_type: 'crash', app_name: 'B.exe', description: null })
    createSession({ issue_type: 'crash', app_name: 'C.exe', description: null })

    expect(listSessions(2)).toHaveLength(2)
  })
})

describe('deleteSession', () => {
  it('removes the row — getSession returns null after delete', () => {
    const session = createSession({ issue_type: 'crash', app_name: 'Del.exe', description: null })
    deleteSession(session.id)
    expect(getSession(session.id)).toBeNull()
  })
})
