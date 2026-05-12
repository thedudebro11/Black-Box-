import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, _resetForTesting } from '../../../src/db/schema'
import { initSettings } from '../../../src/db/settings'
import { createSession, getSession, listSessions, deleteSession } from '../../../src/db/sessions'
import { createAnalysisResult, getAnalysisResult } from '../../../src/db/analysis'

// ── Test setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  initDatabase()
  initSettings('1.0.0-test')
})

afterEach(() => {
  _resetForTesting()
})

// ── listSessions ───────────────────────────────────────────────────────────────

describe('listSessions', () => {
  it('returns sessions in descending order (most recent first)', async () => {
    createSession({ issue_type: 'crash', app_name: 'First.exe', description: null })
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 5))
    createSession({ issue_type: 'freeze', app_name: 'Second.exe', description: null })
    await new Promise((r) => setTimeout(r, 5))
    createSession({ issue_type: 'bsod', app_name: 'Third.exe', description: null })

    const sessions = listSessions()

    expect(sessions).toHaveLength(3)
    expect(sessions[0].app_name).toBe('Third.exe')
    expect(sessions[1].app_name).toBe('Second.exe')
    expect(sessions[2].app_name).toBe('First.exe')
  })

  it('returns an empty array when no sessions exist', () => {
    expect(listSessions()).toHaveLength(0)
  })

  it('respects the limit parameter', () => {
    createSession({ issue_type: 'crash', app_name: 'A.exe', description: null })
    createSession({ issue_type: 'crash', app_name: 'B.exe', description: null })
    createSession({ issue_type: 'crash', app_name: 'C.exe', description: null })

    const limited = listSessions(2)
    expect(limited).toHaveLength(2)
  })
})

// ── deleteSession ──────────────────────────────────────────────────────────────

describe('deleteSession', () => {
  it('removes the session — getSession returns null after delete', () => {
    const session = createSession({ issue_type: 'crash', app_name: 'DeleteMe.exe', description: null })
    deleteSession(session.id)
    expect(getSession(session.id)).toBeNull()
  })

  it('removes only the targeted session, leaving others intact', () => {
    const a = createSession({ issue_type: 'crash', app_name: 'Keep.exe', description: null })
    const b = createSession({ issue_type: 'freeze', app_name: 'Delete.exe', description: null })

    deleteSession(b.id)

    expect(getSession(a.id)).not.toBeNull()
    expect(getSession(b.id)).toBeNull()
  })

  it('listSessions does not include deleted session', () => {
    const session = createSession({ issue_type: 'bsod', app_name: 'Gone.exe', description: null })
    deleteSession(session.id)

    const remaining = listSessions()
    expect(remaining.find((s) => s.id === session.id)).toBeUndefined()
  })
})

// ── getSession + getAnalysisResult ─────────────────────────────────────────────

describe('getSession + getAnalysisResult', () => {
  it('returns the session when it exists', () => {
    const session = createSession({ issue_type: 'app_hang', app_name: 'Hang.exe', description: 'test' })
    const fetched = getSession(session.id)

    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(session.id)
    expect(fetched!.app_name).toBe('Hang.exe')
    expect(fetched!.description).toBe('test')
  })

  it('returns null for a non-existent session ID', () => {
    expect(getSession('no-such-id')).toBeNull()
  })

  it('returns the analysis result when both session and result exist', () => {
    const session = createSession({ issue_type: 'crash', app_name: 'Game.exe', description: null })

    const result = createAnalysisResult({
      session_id: session.id,
      outcome: 'diagnosed',
      primary_rule_pack_id: 'gpu-driver',
      primary_confidence: 'HIGH',
      primary_cause_name: 'GPU Driver Instability / TDR',
      primary_output_text: 'A TDR event was detected 12s before the crash.',
      secondary_results: [],
      all_signals_found: [],
      fix_recommendations: [],
      inconclusive_reason: null,
    })

    const fetchedSession = getSession(session.id)
    const fetchedResult = getAnalysisResult(session.id)

    expect(fetchedSession).not.toBeNull()
    expect(fetchedResult).not.toBeNull()
    expect(fetchedResult!.id).toBe(result.id)
    expect(fetchedResult!.outcome).toBe('diagnosed')
    expect(fetchedResult!.primary_confidence).toBe('HIGH')
    expect(fetchedResult!.primary_rule_pack_id).toBe('gpu-driver')
  })

  it('returns null for analysis result when no result has been created', () => {
    const session = createSession({ issue_type: 'freeze', app_name: 'NoResult.exe', description: null })
    expect(getAnalysisResult(session.id)).toBeNull()
  })

  it('creates and retrieves an inconclusive result', () => {
    const session = createSession({ issue_type: 'bsod', app_name: 'Mystery.exe', description: null })

    createAnalysisResult({
      session_id: session.id,
      outcome: 'inconclusive',
      primary_rule_pack_id: null,
      primary_confidence: null,
      primary_cause_name: null,
      primary_output_text: null,
      secondary_results: [],
      all_signals_found: [],
      fix_recommendations: [],
      inconclusive_reason: 'No rule pack reached MEDIUM confidence.',
    })

    const result = getAnalysisResult(session.id)
    expect(result).not.toBeNull()
    expect(result!.outcome).toBe('inconclusive')
    expect(result!.inconclusive_reason).toBe('No rule pack reached MEDIUM confidence.')
    expect(result!.primary_confidence).toBeNull()
  })
})
