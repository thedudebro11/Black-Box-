# Black Box — Build Phases (V1 MVP)

## How To Use This File

This file defines the exact build order for Black Box V1 MVP.
Each phase has a clear scope, a completion gate, and a list of files
that must exist and work before the next phase begins.

Claude Code must read this file at the start of every session.
Identify the current phase by checking which completion gates have been met.
Never begin a new phase until the current phase gate is fully satisfied.

---

## Phase Map

```
Phase 1 → Project Scaffold
Phase 2 → Data Layer
Phase 3 → System Collectors
Phase 4 → Rules Engine
Phase 5 → Analysis Pipeline
Phase 6 → UI — Core Screens
Phase 7 → Results Screen
Phase 8 → Session Report Export
Phase 9 → Telemetry
Phase 10 → Follow-Up Notification
Phase 11 → Session History
Phase 12 → Integration + Polish
```

---

## Phase 1 — Project Scaffold

### Objective
A running Electron + React + TypeScript application with correct folder
structure, navigation shell, and design system tokens. Nothing functional
yet — just the skeleton that everything else builds on.

### Deliverables
- [ ] Electron main process boots without errors
- [ ] React renderer loads in Electron window
- [ ] Vite build pipeline works (dev and build scripts)
- [ ] TypeScript strict mode configured and passing
- [ ] Tailwind CSS configured and rendering
- [ ] Lucide React installed
- [ ] Zustand store initialized (empty)
- [ ] All folders from CLAUDE.md folder structure created
- [ ] Navigation shell renders all screen placeholders
- [ ] Preload script with contextBridge stub in place
- [ ] IPC channel stubs in place (recorder, analyzer, telemetry)
- [ ] ESLint + Prettier configured

### Completion Gate
Running `npm run dev` opens an Electron window showing a navigation shell
that can switch between placeholder screens with no console errors.

### Do Not Build In This Phase
- No real data collection
- No database
- No rules engine logic
- No PowerShell scripts

---

## Phase 2 — Data Layer

### Objective
SQLite database fully operational with all V1 tables defined, migration
system in place, and CRUD operations working for sessions.

### Deliverables
- [ ] better-sqlite3 installed and connecting
- [ ] Schema defined for all V1 tables (see DATA_SCHEMA.md)
- [ ] Migration runner implemented
- [ ] Session CRUD operations: create, read, update, list
- [ ] Session event stream: append events, read by session ID
- [ ] Anonymous session ID generated at first launch and persisted
- [ ] Settings table: telemetry opt-in flag, first launch flag
- [ ] Database initialized on app startup without errors
- [ ] Unit tests for CRUD operations passing

### Completion Gate
Unit tests pass for all session CRUD operations.
Database file is created on first run, persists between app restarts,
and all tables exist with correct schema.

### Do Not Build In This Phase
- No UI connected to database yet
- No telemetry upload
- No analysis logic

---

## Phase 3 — System Collectors

### Objective
All system data collection modules working and returning structured data.
PowerShell scripts execute successfully, process monitoring works,
metrics sampling runs at correct intervals.

### Deliverables
- [ ] get-events.ps1: queries Windows Event Log, returns JSON array
- [ ] get-processes.ps1: returns process list with names, PIDs, CPU%, memory
- [ ] get-system-info.ps1: returns hardware profile (GPU, driver, OS, RAM)
- [ ] events.ts: calls get-events.ps1, parses result, returns typed EventRecord[]
- [ ] processes.ts: polls process list at 5-second intervals during recording
- [ ] metrics.ts: samples CPU%, RAM%, disk latency, GPU% at 10-second intervals
- [ ] drivers.ts: retrieves installed driver inventory on session start
- [ ] All collectors return typed data structures (no any types)
- [ ] All collectors handle PowerShell execution errors gracefully
- [ ] Collector output written to NDJSON trace file during recording
- [ ] Unit tests with fixture data passing for all parsers

### Event Log Queries Required (minimum)
- System log: Event IDs 153, 14, 13 (nvlddmkm)
- System log: Event ID 4101 (Display)
- System log: Event ID 141 (LiveKernelEvent)
- System log: Event ID 1001 (BugCheck / WER)
- System log: Event ID 2004 (Resource-Exhaustion-Detector)
- System log: Event ID 1 (FilterManager — anti-cheat unload)
- Application log: Event ID 1000 (Application Error)
- Application log: Event ID 1002 (Application Hang)
- Time window: last 30 minutes (configurable)

### Completion Gate
Running the collector modules manually (via test script) on a real Windows
machine returns structured JSON with no errors. Fixture-based unit tests
pass for all parser functions.

### Do Not Build In This Phase
- No recording session management yet
- No rules engine
- No UI integration

---

## Phase 4 — Rules Engine

### Objective
All five rule packs implemented and passing unit tests against fixture data.
The scorer and analyzer orchestrator in place. This is the core intelligence
of the product — it must be correct before anything else touches it.

### Reference
RULE_PACKS.md is the source of truth for all signal logic in this phase.
Do not deviate from the specifications in that file without explicit instruction.

### Deliverables
- [ ] types.ts: Session, EventRecord, ProcessRecord, MetricSample, RuleResult,
      AnalysisResult types fully defined
- [ ] Rule Pack 1 (gpu-driver.ts): evaluate() function passing all fixture tests
- [ ] Rule Pack 2 (overlay-conflict.ts): evaluate() function passing all fixture tests
- [ ] Rule Pack 3 (anti-cheat.ts): evaluate() function passing all fixture tests
- [ ] Rule Pack 4 (memory-exhaustion.ts): evaluate() function passing all fixture tests
- [ ] Rule Pack 5 (app-hang.ts): evaluate() function passing all fixture tests
- [ ] scorer.ts: ranks results, applies confidence scoring logic from CLAUDE.md
- [ ] analyzer.ts: orchestrates rule packs, handles inconclusive output
- [ ] Fixture files created for each rule pack (at least 3 scenarios each:
      high confidence match, medium confidence match, no match)
- [ ] All unit tests passing with no skipped tests

### Rule Pack Interface Contract
Every rule pack must implement exactly this interface:
```typescript
export function evaluate(session: Session): RuleResult
```
Where RuleResult contains:
- rulePackId: string
- fired: boolean
- confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null
- signals: SignalMatch[] (what was found)
- disqualifiedBy: string[] (what ruled other things out)
- fixRecommendations: FixStep[]
- outputText: string (plain language explanation)

### Completion Gate
All unit tests pass. Running analyzer.ts against each fixture scenario
returns the expected RuleResult with correct confidence level and
correct output text. Zero skipped tests. Zero any types.

### Do Not Build In This Phase
- No UI
- No live data (fixtures only)
- No database writes from the engine

---

## Phase 5 — Analysis Pipeline

### Objective
The full analysis pipeline connected end-to-end: session data flows from
the database through the collectors, through the rules engine, and produces
a complete AnalysisResult. The recording session lifecycle is managed.

### Deliverables
- [ ] Recording session lifecycle: start, mark issue, stop, save to DB
- [ ] Session trace file written during recording (NDJSON)
- [ ] IPC handlers for recorder.ts: startRecording, markIssue, stopRecording
- [ ] IPC handler for analyzer.ts: analyzeSession(sessionId)
- [ ] Timeline normalizer: sorts all events by timestamp, assigns windows
- [ ] Analysis orchestrator connects collectors → rules engine → DB write
- [ ] AnalysisResult written to database on completion
- [ ] Error handling: partial sessions, interrupted recordings
- [ ] Analysis runs in main process (not renderer)
- [ ] Analysis status communicated to renderer via IPC events

### Completion Gate
Starting a recording session, waiting 30 seconds, stopping the session,
and calling analyzeSession() produces an AnalysisResult written to the
database without errors. The result is readable via the DB layer.
Test this with a real Windows Event Log even if no crash is present —
inconclusive result is acceptable and correct.

### Do Not Build In This Phase
- No UI rendering of results yet
- No telemetry upload yet
- No follow-up notification

---

## Phase 6 — UI Core Screens

### Objective
All non-results screens built and connected to real state. The user can
flow from Welcome → Describe → Record → Analyzing with real data being
captured and processed.

### Design Direction
Dark industrial utility aesthetic. Not consumer-friendly and soft.
Not aggressive or alarming. Think: a serious tool for a frustrated person.
Dark background (#0A0A0F), muted slate grays for surfaces, single accent
color for active states and confidence indicators. Monospace font for
technical data display. Clean sans-serif for UI chrome.

Colors:
- Background: #0A0A0F
- Surface: #13131A
- Surface raised: #1C1C26
- Border: #2A2A38
- Text primary: #E8E8F0
- Text secondary: #8888A0
- Accent: #4F6EF7 (blue — used sparingly)
- HIGH confidence: #22C55E (green)
- MEDIUM confidence: #F59E0B (amber)
- LOW confidence: #6B7280 (gray)
- Inconclusive: #6B7280 (gray)

### Deliverables
- [ ] Welcome.tsx: app name, one-line description, Start button
- [ ] Describe.tsx: issue type selector, app/game name input, brief description field
- [ ] Record.tsx: recording state indicator, issue marker button (prominent),
      elapsed time, stop recording button, live signal indicators
- [ ] Analyzing.tsx: processing state with progress indication,
      "Black Box is analyzing your session" messaging
- [ ] Navigation flow: Welcome → Describe → Record → Analyzing → Results
- [ ] Zustand store wired to IPC for recording state
- [ ] All screens match design direction above
- [ ] Keyboard accessible (tab order, Enter to confirm)

### Completion Gate
User can flow through Welcome → Describe → Record (with real recording
running in background) → click issue marker → stop recording → see
Analyzing screen while analysis runs → no UI errors at any step.

### Do Not Build In This Phase
- Results screen (Phase 7)
- Session history (Phase 11)
- Settings screen (Phase 12)

---

## Phase 7 — Results Screen

### Objective
The Results screen fully built and rendering real AnalysisResult data.
This is the most important screen in the product. It must be clear,
evidence-forward, and honest about confidence levels.

### Deliverables
- [ ] Results.tsx connected to real AnalysisResult from database
- [ ] Primary cause section: confidence badge, cause name, evidence list
- [ ] Evidence list: each signal shown with its Event ID and plain language meaning
- [ ] Fix recommendations: ordered steps, numbered, clear action language
- [ ] Secondary causes section: collapsed by default, expandable
- [ ] Inconclusive state: distinct visual treatment, session report prompt
- [ ] Confidence badge: HIGH (green), MEDIUM (amber), LOW / inconclusive (gray)
- [ ] "Start New Session" button
- [ ] "Export Report" button (connects to Phase 8)
- [ ] Results persisted — navigating away and back shows same result

### Evidence Display Format
Each signal in the evidence list must show:
- Event ID and source (technical, monospace)
- Plain language translation (human readable)
- Timestamp relative to issue marker (e.g. "12 seconds before crash")

### Completion Gate
Results screen renders correctly for all four states:
HIGH confidence result, MEDIUM confidence result, LOW confidence result,
and inconclusive result. All four tested with real or fixture data.
Evidence is readable. Fix steps are clear. Confidence badge is correct color.

---

## Phase 8 — Session Report Export

### Objective
Exportable session report generated as a markdown file the user can save
and share on forums or with support channels.

### Deliverables
- [ ] Report generator: takes AnalysisResult, produces markdown string
- [ ] Report includes: session date/time, issue type, app name, diagnosis,
      confidence level, evidence list, fix recommendations, raw signal list
- [ ] Report explicitly states: "Generated by Black Box" with version
- [ ] Privacy check: report contains zero personally identifiable information
- [ ] Export dialog: user chooses save location
- [ ] Export button on Results screen triggers save dialog
- [ ] Exported file opens correctly in any text editor

### Report Header Format
```
# Black Box Session Report
Date: [date]
Issue Type: [type]
App / Game: [name]
Session ID: [anonymous ID — last 8 chars only]

## Diagnosis
Confidence: [HIGH / MEDIUM / LOW / INCONCLUSIVE]
Most Likely Cause: [cause name]

## Evidence Found
[list of signals with Event IDs and plain language]

## Fix Recommendations
[ordered steps]

## All Signals Detected
[full technical signal list for forum posting]

---
Generated by Black Box v1.0.0
```

### Completion Gate
Clicking Export Report on any Results screen produces a valid markdown
file at the chosen location containing all required sections with no
personally identifiable information present.

---

## Phase 9 — Telemetry

### Objective
Anonymous session telemetry uploading to Supabase when user has opted in.
Sanitizer running on all data before upload. Opt-in presented at first launch.

### Deliverables
- [ ] First launch telemetry opt-in screen (shown once, never again)
- [ ] Opt-in state persisted in settings table
- [ ] Telemetry opt-in / opt-out in settings (reachable at any time)
- [ ] sanitizer.ts: strips everything not on the allowed list from CLAUDE.md
- [ ] uploader.ts: sends sanitized session to Supabase after analysis completes
- [ ] Upload only fires if opt-in is true
- [ ] Upload failure is silent — never surfaces to user, logged locally only
- [ ] Supabase table: bb_sessions (schema in DATA_SCHEMA.md)
- [ ] Upload includes: session_id (anonymous), event_ids_fired, process_names,
      metrics_summary, hardware_profile, diagnosis_outcome, confidence_level
- [ ] Upload excludes: everything else

### Completion Gate
With opt-in enabled: completing an analysis session results in a new row
in the Supabase bb_sessions table containing only the allowed fields.
Inspecting the uploaded row confirms zero personally identifiable data.
With opt-in disabled: no upload occurs, confirmed by checking Supabase.

### Do Not Build In This Phase
- No user accounts
- No session sharing
- No community features

---

## Phase 10 — Follow-Up Notification

### Objective
When a session is inconclusive, Black Box schedules a single follow-up
notification 48 hours later asking if the user resolved the issue.
One notification per session. Never a second follow-up.

### Deliverables
- [ ] Follow-up scheduled only for inconclusive sessions
- [ ] Notification fires 48 hours after inconclusive result (Electron notification)
- [ ] Notification text: "Did you figure out what caused your crash?
      If you found the fix, let us know — it helps improve Black Box for everyone."
- [ ] Clicking notification opens Black Box to a simple resolution form
- [ ] Resolution form: Yes / No / Still working on it
- [ ] If "Yes": free text field "What fixed it?" (optional, plain text only)
- [ ] Response saved to local database
- [ ] Response uploaded to Supabase if telemetry opt-in is enabled
- [ ] Follow-up marked as sent in database — never fires twice for same session
- [ ] If app is not running when notification fires: fires next time app opens
      if within 7-day window, otherwise expires silently

### Completion Gate
An inconclusive session triggers a follow-up notification (testable by
setting the delay to 30 seconds in dev mode). Clicking it opens the
resolution form. Submitting a response saves it to the database and
marks the follow-up as complete. Restarting the app does not trigger
another notification for the same session.

---

## Phase 11 — Session History

### Objective
A history screen showing all past sessions with key metadata.
Local only. Simple list view.

### Deliverables
- [ ] History.tsx: list of past sessions, most recent first
- [ ] Each row: date, issue type, app name, diagnosis outcome, confidence badge
- [ ] Clicking a session navigates to its Results screen (read-only)
- [ ] Empty state: friendly message when no sessions exist yet
- [ ] Sessions with pending follow-up visually indicated
- [ ] Delete session: right-click or swipe, confirmation required
- [ ] Deleted sessions removed from local DB only (telemetry upload not affected)

### Completion Gate
History screen shows all past sessions correctly ordered. Clicking any
session shows its Results screen with correct data. Empty state renders
correctly on first launch. Delete works and requires confirmation.

---

## Phase 12 — Integration + Polish

### Objective
Everything connected and working end-to-end. Edge cases handled.
Error states designed. App feels complete and ready to test with
real users.

### Deliverables
- [ ] Settings screen: telemetry opt-in toggle, app version, open source link
- [ ] Error states designed for all failure scenarios:
      - PowerShell execution fails
      - Analysis produces an error
      - Database write fails
      - Telemetry upload fails (silent)
      - Recording interrupted (app closed mid-session)
- [ ] Interrupted session recovery: on next launch, offers to analyze
      any session that was recording when app closed
- [ ] Loading states on all async operations
- [ ] App window minimum size enforced (900px × 600px)
- [ ] Windows taskbar icon and system tray icon
- [ ] About screen: version, GitHub link, privacy statement summary
- [ ] End-to-end test: full flow from Describe → Record → Results → Export
- [ ] All // DECISION NEEDED: comments resolved
- [ ] Zero console errors in production build
- [ ] electron-builder configured for Windows installer (.exe)

### Completion Gate
Full end-to-end flow works without errors on a clean Windows machine.
All error states render correctly when failures are simulated.
Production build compiles and installs via .exe installer.
No console errors. No TypeScript errors. All tests passing.

---

## Phase Status Tracking

Update this section at the end of each session.

| Phase | Status | Last Updated | Notes |
|-------|--------|-------------|-------|
| 1 — Scaffold | COMPLETE | 2026-04-27 | electron-vite build passes, all types clean, all folders created |
| 2 — Data Layer | NOT STARTED | — | |
| 3 — Collectors | NOT STARTED | — | |
| 4 — Rules Engine | NOT STARTED | — | |
| 5 — Analysis Pipeline | NOT STARTED | — | |
| 6 — UI Core | NOT STARTED | — | |
| 7 — Results Screen | NOT STARTED | — | |
| 8 — Report Export | NOT STARTED | — | |
| 9 — Telemetry | NOT STARTED | — | |
| 10 — Follow-Up | NOT STARTED | — | |
| 11 — History | NOT STARTED | — | |
| 12 — Integration | NOT STARTED | — | |
