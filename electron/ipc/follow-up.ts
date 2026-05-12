import { ipcMain } from 'electron'
import { recordFollowUpResponse } from '../../src/db/follow-ups'

/**
 * Register IPC handlers for the follow-up resolution flow.
 *
 * @param onFollowUpClicked  Callback triggered when the user clicks a notification.
 *                           The main process calls this to push the show event to
 *                           the renderer so it can open the FollowUpModal.
 */
export function registerFollowUpHandlers(
  onFollowUpClicked: (followUpId: string, sessionId: string) => void
): void {
  // follow-up:submit — renderer calls this when the user submits their resolution response
  ipcMain.handle(
    'follow-up:submit',
    (
      _event,
      params: {
        followUpId: string
        response: 'yes' | 'no' | 'still_working'
        notes: string | null
      }
    ) => {
      try {
        recordFollowUpResponse(params.followUpId, params.response, params.notes ?? null)
      } catch (err) {
        // Never surface DB errors to the user — log only.
        console.error('[follow-up:submit] failed to save response', err)
      }
    }
  )

  // follow-up:dismiss — renderer calls this when the user closes the modal without responding.
  // No state change is needed: sent_at is stamped by checkAndFirePendingFollowUps before the
  // notification is shown, so a dismissed follow-up will not fire again.
  ipcMain.handle('follow-up:dismiss', () => {
    /* intentional no-op */
  })

  // The onFollowUpClicked callback is passed into the scheduler (checkAndFirePendingFollowUps)
  // from main.ts so that notification click events are forwarded to the renderer windows.
  // It is not needed directly inside this file, but is kept in the function signature so
  // the registration call site in main.ts has a single, consistent wiring point.
  void onFollowUpClicked
}
