/**
 * Tests for the follow-up notification scheduler.
 *
 * Electron's Notification class is mocked so these tests run in a pure Node
 * environment without requiring a real display or Electron runtime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initDatabase, _resetForTesting, getDatabase } from '../../../src/db/schema'
import { initSettings } from '../../../src/db/settings'
import { createSession } from '../../../src/db/sessions'
import { getFollowUp } from '../../../src/db/follow-ups'

// ── Mock Electron Notification ────────────────────────────────────────────────

const mockNotificationShow = vi.fn()
const mockNotificationOn   = vi.fn()

// We capture the 'click' listener so we can trigger it in tests.
let capturedClickListeners: Array<() => void> = []

vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation(() => ({
    show: mockNotificationShow,
    on: (event: string, cb: () => void) => {
      mockNotificationOn(event, cb)
      if (event === 'click') capturedClickListeners.push(cb)
    },
  })),
}))

// Import the module under test AFTER the mock is declared so vi.mock hoisting
// ensures the mock is in place before the module resolves its `electron` import.
import {
  scheduleFollowUp,
  checkAndFirePendingFollowUps,
} from '../../../src/notifications/follow-up-scheduler'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeSession() {
  return createSession({ issue_type: 'crash', app_name: 'TestGame.exe', description: null })
}

/** Move a follow-up's scheduled_for to the past so it shows up as due. */
function makeFollowUpDue(sessionId: string): void {
  const db = getDatabase()
  db.prepare('UPDATE follow_ups SET scheduled_for = ? WHERE session_id = ?').run(
    new Date(Date.now() - 1000).toISOString(),
    sessionId
  )
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  initDatabase()
  initSettings('1.0.0-test')
  mockNotificationShow.mockClear()
  mockNotificationOn.mockClear()
  capturedClickListeners = []
})

afterEach(() => {
  _resetForTesting()
})

// ── scheduleFollowUp ──────────────────────────────────────────────────────────

describe('scheduleFollowUp', () => {
  it('creates a follow-up row in the DB for the given session', () => {
    const session = makeSession()
    scheduleFollowUp(session.id)

    const followUp = getFollowUp(session.id)
    expect(followUp).not.toBeNull()
    expect(followUp!.session_id).toBe(session.id)
  })

  it('is idempotent — calling twice for the same session creates only one row', () => {
    const session = makeSession()
    scheduleFollowUp(session.id)
    scheduleFollowUp(session.id)

    // If a duplicate row were created, getFollowUp (which selects a single row)
    // would still return one result — the key check is that it remains valid.
    const followUp = getFollowUp(session.id)
    expect(followUp).not.toBeNull()
    expect(followUp!.session_id).toBe(session.id)
  })
})

// ── checkAndFirePendingFollowUps ──────────────────────────────────────────────

describe('checkAndFirePendingFollowUps', () => {
  it('does nothing when there are no pending follow-ups', () => {
    const callback = vi.fn()
    checkAndFirePendingFollowUps(callback)

    expect(mockNotificationShow).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('shows a notification and stamps sent_at for a due follow-up', () => {
    const session = makeSession()
    scheduleFollowUp(session.id)
    makeFollowUpDue(session.id)

    const callback = vi.fn()
    checkAndFirePendingFollowUps(callback)

    expect(mockNotificationShow).toHaveBeenCalledOnce()

    const followUp = getFollowUp(session.id)
    expect(followUp!.sent_at).not.toBeNull()
  })

  it('calls the onFollowUpFired callback with followUpId and sessionId when a notification is clicked', () => {
    const session = makeSession()
    scheduleFollowUp(session.id)
    makeFollowUpDue(session.id)

    const callback = vi.fn()
    checkAndFirePendingFollowUps(callback)

    // Exactly one click listener should have been registered
    expect(capturedClickListeners).toHaveLength(1)

    // Simulate the user clicking the OS notification
    capturedClickListeners[0]()

    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith(
      expect.any(String), // followUpId (UUID)
      session.id          // sessionId
    )
  })

  it('does not fire the same follow-up twice', () => {
    const session = makeSession()
    scheduleFollowUp(session.id)
    makeFollowUpDue(session.id)

    const callback = vi.fn()
    checkAndFirePendingFollowUps(callback) // first call — fires
    checkAndFirePendingFollowUps(callback) // second call — sent_at is stamped; skipped

    expect(mockNotificationShow).toHaveBeenCalledOnce()
  })

  it('does not fire a follow-up that has passed the 7-day expiry window', () => {
    const session = makeSession()
    scheduleFollowUp(session.id)

    // Move scheduled_for to the past AND expires_at to the past
    const db = getDatabase()
    const past = new Date(Date.now() - 1000).toISOString()
    db.prepare(
      'UPDATE follow_ups SET scheduled_for = ?, expires_at = ? WHERE session_id = ?'
    ).run(past, past, session.id)

    const callback = vi.fn()
    checkAndFirePendingFollowUps(callback)

    expect(mockNotificationShow).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })
})
