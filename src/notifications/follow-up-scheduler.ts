/**
 * Follow-up notification scheduler.
 *
 * Runs in the Electron main process only — never import this from the renderer.
 * Schedules and fires native OS notifications for inconclusive sessions.
 */

import { Notification } from 'electron'
import { createFollowUp, getPendingFollowUps, markFollowUpSent } from '../db/follow-ups'

/**
 * Record a follow-up for an inconclusive session.
 * The actual notification fires the next time checkAndFirePendingFollowUps() runs
 * (on startup, or on the next polling interval if one is added later).
 */
export function scheduleFollowUp(sessionId: string): void {
  createFollowUp(sessionId)
}

/**
 * Check the database for any due follow-ups and fire a native notification for each.
 * Safe to call on every app startup — markFollowUpSent() prevents duplicate fires.
 *
 * @param onFollowUpFired  Called when the user clicks a notification so the renderer
 *                         can open the FollowUpModal for the right session.
 */
export function checkAndFirePendingFollowUps(
  onFollowUpFired: (followUpId: string, sessionId: string) => void
): void {
  let pending: ReturnType<typeof getPendingFollowUps>
  try {
    pending = getPendingFollowUps()
  } catch (err) {
    console.error('[follow-up] failed to query pending follow-ups', err)
    return
  }

  if (pending.length === 0) return

  for (const followUp of pending) {
    try {
      const notification = new Notification({
        title: 'Black Box — Did you fix it?',
        body: 'Did you figure out what caused your crash? If you found the fix, let us know — it helps improve Black Box for everyone.',
      })

      notification.on('click', () => {
        onFollowUpFired(followUp.id, followUp.session_id)
      })

      notification.show()
      markFollowUpSent(followUp.id)
    } catch (err) {
      // Never surface notification errors to the user — log only.
      console.error('[follow-up] notification failed for follow-up', followUp.id, err)
    }
  }
}
