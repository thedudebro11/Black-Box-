# Agent: NOTIFICATION

## Role

You are responsible for Phase 10 of the Black Box V1 build: the follow-up
notification system. When a session is inconclusive, Black Box schedules a
single Electron notification 48 hours later asking if the user resolved the
issue. One notification per session, never repeated.

This feature is a data collection mechanism, not a support workflow. Keep
it simple, non-intrusive, and honest about its purpose.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — V1 scope, UI tone (calm, not alarming)
2. `docs/PHASES.md` — Phase 10 deliverables and completion gate
3. `docs/DATA_SCHEMA.md` — `follow_ups` table schema
4. `docs/DECISIONS.md` — ADR-008 (one follow-up only, 48-hour delay, 7-day expiry)
5. `agents/HANDOFF.md` — Confirm Phase 7 is COMPLETE
6. `agents/CONTRACTS.md` — Contract 4 (AnalysisResult)

---

## Prerequisites

Before you begin, verify in HANDOFF.md:

- [ ] Phase 7 (Results Screen) status is COMPLETE
- [ ] `src/db/follow-ups.ts` exists and is implemented (Phase 2 deliverable)
- [ ] `follow_ups` table exists in the database

---

## Deliverables

### Follow-Up Scheduler

**`src/notifications/scheduler.ts`**

```typescript
export function scheduleFollowUp(sessionId: string): void
```

Called by the PIPELINE after an inconclusive analysis result is written to DB.

Flow:
1. Check if a follow_up row already exists for this sessionId — if yes, return early
2. Compute `scheduled_for`: `new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()`
3. Compute `expires_at`: `new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()`
4. Call `createFollowUp(sessionId)` from `src/db/follow-ups.ts`

```typescript
export async function checkAndFirePendingFollowUps(
  mainWindow: BrowserWindow
): Promise<void>
```

Called at app startup and on a scheduled interval (every 15 minutes while app is open).

Flow:
1. Call `getPendingFollowUps()` — returns follow_ups where:
   - `sent_at` is NULL (not yet fired)
   - `scheduled_for` <= NOW (time has come)
   - `expires_at` > NOW (not expired)
   - `response` is NULL (not already responded to)
2. For each pending follow-up: call `fireFollowUpNotification(followUp, mainWindow)`

```typescript
async function fireFollowUpNotification(
  followUp: FollowUp,
  mainWindow: BrowserWindow
): Promise<void>
```

Flow:
1. Call `markFollowUpSent(followUp.id)` first — prevents double-fire
2. Create Electron `Notification`:
   ```typescript
   new Notification({
     title: 'Black Box',
     body: 'Did you figure out what caused your crash? If you found the fix, let us know — it helps improve Black Box for everyone.',
     icon: join(process.resourcesPath, 'icon.png'),  // if exists, else omit
   })
   ```
3. On notification `click` event: bring main window to front, navigate to
   resolution form for this session
4. Show the notification

---

### Resolution Form

**`src/screens/FollowUpResponse.tsx`**

A simple form screen shown when user clicks the follow-up notification.

Content:
- Context line: "You had an inconclusive session on [date] for [app name]."
- Question: "Did you figure out what caused the issue?"
- Three response buttons (not a dropdown — make each a distinct card):
  - "Yes, I found the fix"
  - "No, still not sure"
  - "Not working on it anymore"
- If "Yes" selected: show optional text area:
  "What fixed it? (optional — your answer helps improve Black Box)"
  Max 500 characters, plain text only
- "Submit" button

Behavior:
- On submit: call `store.submitFollowUpResponse(followUpId, response, notes)`
- After submit: `navigateTo('welcome')`
- If user closes without responding: no action (null response stays)

### IPC Navigation for Notification Click

When the notification is clicked, the main process must tell the renderer
to navigate to the FollowUpResponse screen for that session.

In `electron/main.ts`, add a handler for notification click:
```typescript
// Store the pending follow-up session context for when renderer is ready
let pendingFollowUpSessionId: string | null = null

// When notification is clicked:
notification.on('click', () => {
  mainWindow.show()
  mainWindow.focus()
  pendingFollowUpSessionId = followUp.session_id
  mainWindow.webContents.send('followup:show', { sessionId: followUp.session_id })
})
```

In `electron/preload.ts`, add:
```typescript
followUp: {
  onShow: (callback: (payload: { sessionId: string }) => void) =>
    ipcRenderer.on('followup:show', (_, payload) => callback(payload)),
  submit: (params: { followUpId: string; response: string; notes: string | null }) =>
    ipcRenderer.invoke('followup:submit', params),
}
```

### Startup Check

**Update `electron/main.ts`:**

Add to `app.whenReady()`:
```typescript
// Check for pending follow-ups on startup
app.whenReady().then(async () => {
  // ... existing init code ...
  await checkAndFirePendingFollowUps(win)

  // Recheck every 15 minutes while app is running
  setInterval(() => checkAndFirePendingFollowUps(win), 15 * 60 * 1000)
})
```

### Zustand Store Actions

Add to `src/store/index.ts`:
```typescript
pendingFollowUpSessionId: string | null
submitFollowUpResponse: (followUpId: string, response: string, notes: string | null) => Promise<void>
loadFollowUpSession: (sessionId: string) => Promise<void>
```

`submitFollowUpResponse`:
1. Calls `window.electron.followUp.submit(...)` via IPC
2. If telemetry opted-in: also upload the response update to Supabase
   (this is handled by TELEMETRY agent's uploader — just trigger it)
3. Clear `pendingFollowUpSessionId`

### Dev Mode Testing

In development mode, the 48-hour delay can be reduced to 30 seconds:
```typescript
const FOLLOW_UP_DELAY_MS = process.env['NODE_ENV'] === 'development'
  ? 30 * 1000           // 30 seconds for testing
  : 48 * 60 * 60 * 1000 // 48 hours in production
```

Document this in code with a comment explaining it's dev-only behavior.

---

## Tests

**`tests/unit/notifications/scheduler.test.ts`**

Test cases:
- `scheduleFollowUp` creates a follow_up row with correct timestamps
- `scheduleFollowUp` does not create duplicate rows for same session
- `checkAndFirePendingFollowUps` fires for overdue unfired follow-ups
- `checkAndFirePendingFollowUps` skips expired follow-ups (past 7-day window)
- `checkAndFirePendingFollowUps` skips already-fired follow-ups (sent_at not null)

---

## Completion Gate

Phase 10 is complete when:
1. `npm test -- tests/unit/notifications` passes with zero failures
2. An inconclusive session triggers a follow-up notification (verified with
   30-second dev mode delay)
3. Clicking the notification opens the resolution form for the correct session
4. Submitting a response saves it to the database
5. The follow_up row is marked as sent — restarting the app does not fire
   another notification for the same session
6. An expired follow-up (past 7 days) does not fire

---

## When Complete

Update `agents/HANDOFF.md`:
1. Set Phase 10 status to COMPLETE
2. Set Gate Met to YES
3. Write Completion Certificate confirming the dev-mode test was run
