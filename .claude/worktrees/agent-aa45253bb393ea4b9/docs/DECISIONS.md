# Black Box — Architecture Decision Log

## What This File Is

This file records every significant architectural decision made during the
build of Black Box V1. Claude Code must read this file before making any
decision that touches architecture, tech stack, or core design.

If a decision is recorded here it is final for V1. It does not get
re-evaluated mid-build. If a recorded decision needs to change, note it
here with a reason before changing anything in code.

---

## ADR-001 — Electron over Tauri

**Decision:** Use Electron for the desktop app shell, not Tauri.

**Reason:** The system collectors require Node.js child_process to execute
PowerShell scripts. Electron's main process is a full Node.js environment
making this native and straightforward. Tauri's Rust-based backend would
require additional FFI work to execute PowerShell and parse results.
Electron's larger binary size is acceptable for V1. Tauri is a valid V2
consideration once PowerShell collection is replaced by a native ETW sidecar.

**Implications:** App binary will be larger (~150MB installed). Acceptable.

---

## ADR-002 — PowerShell for Event Collection in V1

**Decision:** Use PowerShell Get-WinEvent called from Node child_process
for Windows Event Log collection. No native ETW consumer in V1.

**Reason:** Get-WinEvent is sufficient for the Event IDs needed in V1
rule packs. ETW direct consumption requires a native C# or Rust sidecar
which significantly increases complexity. PowerShell approach is buildable
with AI assistance. ETW sidecar is architected for V2.

**Implications:** Collection has higher latency than native ETW (~500ms per
query vs real-time). Acceptable for V1 where collection is post-hoc
(analyzing what happened) rather than real-time streaming.

---

## ADR-003 — Synchronous SQLite via better-sqlite3

**Decision:** Use better-sqlite3 with synchronous API for local database.

**Reason:** Simplifies V1 code significantly. No async/await chains for
database operations. The main process handles all DB writes. The renderer
only reads via IPC. Synchronous access is safe in this pattern because
DB writes only happen in the main process.

**Implications:** Database operations block the main process thread briefly.
Acceptable for V1 given operation frequency and data sizes.

---

## ADR-004 — Analysis Runs in Main Process

**Decision:** The analysis pipeline executes entirely in the Electron
main process, not the renderer process.

**Reason:** The analysis pipeline calls PowerShell scripts, reads the
filesystem, and writes to the database — all Node.js operations not
available in the renderer. Keeping analysis in main process keeps the
architecture clean and avoids serialization overhead.

**Implications:** Analysis results are communicated to renderer via IPC
events. The renderer shows Analyzing screen while waiting. Main process
sends 'analysis:complete' or 'analysis:error' IPC events when done.

---

## ADR-005 — Rules Engine in TypeScript, Not ML

**Decision:** The rules engine is entirely deterministic TypeScript logic
based on documented Windows signal patterns. No machine learning, no
neural networks, no probabilistic models in V1.

**Reason:** ML models require training data we don't have yet. The rules
engine is more auditable, more debuggable, and more trustworthy at launch.
ML layer is a Phase 3+ consideration once the database has scale.
Deterministic rules also make it easier for community contributors to
add rule packs — they need domain knowledge, not ML expertise.

**Implications:** Accuracy is bounded by the quality of the rule packs.
Unknown crash patterns return inconclusive. This is correct behavior.

---

## ADR-006 — Telemetry Is Write-Only From Client

**Decision:** The Supabase telemetry table is write-only from the client.
No client-side reads of the bb_sessions table.

**Reason:** The database is a learning tool, not a sync layer. In V1 the
app has no features that require reading back from the telemetry database.
Enforced via RLS policy. This also limits the blast radius if the anonymous
session ID is ever compromised — the client cannot enumerate other sessions.

**Implications:** Supabase is one-way in V1. Reads for analytics happen
via Supabase dashboard only.

---

## ADR-007 — No User Accounts in V1

**Decision:** V1 has no user accounts, no login, no authentication.
All data is local. Telemetry uses an anonymous device ID only.

**Reason:** User accounts add complexity (auth flow, password reset, email
verification) that does not improve the core product in V1. The product
value is diagnosis, not personalization or sync. Accounts are a V2+
consideration when community features require identity.

**Implications:** Session history is local only. If user reinstalls app,
history is lost. Anonymous device ID resets on reinstall. Acceptable for V1.

---

## ADR-008 — One Follow-Up Notification Per Session

**Decision:** Inconclusive sessions trigger exactly one follow-up
notification, 48 hours after the inconclusive result. Never a second
notification for the same session.

**Reason:** The follow-up is a data collection mechanism, not a support
workflow. Sending more than one notification would feel like harassment
for a utility tool. The 48-hour window is enough time for the user to
have resolved the issue or given up. The 7-day expiry ensures stale
notifications don't fire.

**Implications:** If user ignores the notification and never responds,
the session remains in the database as unresolved with no follow-up
response. This is correct — forced responses are not useful data.

---

## ADR-009 — NDJSON for Raw Trace Files

**Decision:** Session event streams are stored as NDJSON files, not in
SQLite rows.

**Reason:** Event streams can be large (thousands of events over a
recording session). NDJSON allows append-only writes during recording
without loading the entire dataset. Parsing is simpler than a binary
format. Readable in any text editor for debugging. SQLite is used for
structured queryable data (sessions, results, settings) not raw streams.

**Implications:** Analysis pipeline reads the NDJSON trace file from disk,
not from the database. Trace files are stored in %APPDATA%/black-box/traces/.

---

## ADR-010 — Confidence Levels Are Strings Not Numbers

**Decision:** Confidence levels are the strings 'HIGH', 'MEDIUM', 'LOW'
not numeric scores (e.g. 0.0–1.0).

**Reason:** Numeric scores imply false precision. The rules engine does not
produce calibrated probabilities — it produces evidence-based assessments.
String levels are more honest, easier to display, and harder to misinterpret.
Users should not see "83% confident" — they should see "HIGH confidence"
with the evidence shown.

**Implications:** Comparison logic uses string matching not numeric
comparison. Ranking logic uses the fixed order: HIGH > MEDIUM > LOW.

---

## OPEN DECISIONS

Issues that have not yet been resolved. Each must be resolved before
the relevant phase begins.

| ID | Question | Relevant Phase | Status |
|----|----------|---------------|--------|
| OD-001 | What GPU metrics library to use — systeminformation vs node-gpu-info vs PowerShell? | Phase 3 | OPEN |
| OD-002 | How to handle sessions where PowerShell execution is blocked by security policy? | Phase 3 | OPEN |
| OD-003 | Should trace files be compressed after analysis completes? | Phase 5 | OPEN |
| OD-004 | Maximum trace file size limit before truncation? | Phase 5 | OPEN |
| OD-005 | Should the Results screen support printing? | Phase 7 | OPEN |
