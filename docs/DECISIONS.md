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

All open decisions resolved as of 2026-05-11.

| ID | Question | Relevant Phase | Status |
|----|----------|---------------|--------|
| OD-001 | What GPU metrics library to use — systeminformation vs node-gpu-info vs PowerShell? | Phase 3 | RESOLVED → ADR-011 |
| OD-002 | How to handle sessions where PowerShell execution is blocked by security policy? | Phase 3 | RESOLVED → ADR-012 |
| OD-003 | Should trace files be compressed after analysis completes? | Phase 5 | RESOLVED → ADR-013 |
| OD-004 | Maximum trace file size limit before truncation? | Phase 5 | RESOLVED → ADR-014 |
| OD-005 | Should the Results screen support printing? | Phase 7 | RESOLVED → ADR-015 |

---

## ADR-011 — GPU Metrics via systeminformation

**Decision:** Use the `systeminformation` npm package for GPU utilization,
VRAM used, and VRAM total during recording sessions.

**Reason:** `systeminformation` supports both NVIDIA and AMD GPUs, returns
structured typed data, is actively maintained, and requires no PowerShell
invocation for metrics — reducing the number of child_process calls during
recording. `node-gpu-info` is less maintained. Raw PowerShell via
`Get-WmiObject` does not expose real-time utilization data reliably.

**Implications:** Add `systeminformation` to production dependencies in Phase 3.
GPU data is accessed via `si.graphics()` which returns controller array.
Use `controllers[0]` as the primary GPU. If `utilizationGpu` is undefined
(some drivers don't expose it), log a warning and record `gpu_pct: null`
rather than crashing.

---

## ADR-012 — wevtutil.exe as Primary Event Log Reader

**Decision:** Windows Event Log is queried using `wevtutil.exe`, a built-in
Windows system executable, not a PowerShell script. PowerShell is retained
only for the process list and hardware profile collectors.

**Reason:** `wevtutil.exe` ships on every Windows install since Vista and
lives at `%SystemRoot%\System32\wevtutil.exe`. It is a plain Win32 executable
invoked via `child_process.spawn` — completely outside PowerShell's execution
policy. Group Policy restrictions on PowerShell script execution have zero
effect on it. This means the most critical collector (Event Log) works on
every Windows machine regardless of security policy.

**Implementation:**

Event log collection uses two `wevtutil` invocations (System log and
Application log) with XPath filters for the specific event IDs needed:

```
wevtutil qe System
  /q:"*[System[(EventID=153 or EventID=14 or EventID=13 or EventID=4101
        or EventID=141 or EventID=1001 or EventID=2004 or EventID=1)
        and TimeCreated[@SystemTime>='<ISO_START>']]]"
  /f:XML /rd:true /c:500

wevtutil qe Application
  /q:"*[System[(EventID=1000 or EventID=1002)
        and TimeCreated[@SystemTime>='<ISO_START>']]]"
  /f:XML /rd:true /c:500
```

Output is XML, parsed using `fast-xml-parser` (lightweight, no native deps).
The parser extracts: Provider Name, EventID, Level, TimeCreated, Channel, and
the first EventData/Data element as the message.

Level integer mapping: 1=Critical, 2=Error, 3=Warning, 4=Information.

**PowerShell scope (reduced):** PowerShell is only used for:
- `get-processes.ps1` — process list with CPU% and memory
- `get-system-info.ps1` — hardware profile (GPU model, driver, OS, RAM)

These use `powershell.exe -ExecutionPolicy Bypass -Command "..."` (inline
command, not `-File`) as an additional resilience layer — some GPO
configurations block `.ps1` files but allow inline `-Command` execution.

**Fallback if process/hardware PowerShell is still blocked:**
Return partial data — `HardwareProfile` fields default to `null`, process
list returns `[]`. The rules engine handles null hardware gracefully.
Event log data is always available via wevtutil regardless.

**Implications:**
- Add `fast-xml-parser` to production dependencies in Phase 3
- `scripts/powershell/get-events.ps1` is no longer needed — delete it
- `src/collectors/wevtutil.ts` replaces the PowerShell runner for events
- The "execution_policy_blocked" error path only applies to process/hardware
  collectors now, not event log collection

---

## ADR-013 — No Trace File Compression in V1

**Decision:** Trace files are stored as plain NDJSON after analysis completes.
No gzip compression in V1.

**Reason:** A 10-minute recording session generates approximately 1–2MB of
trace data. Storage cost is negligible. Keeping files uncompressed means
they are readable in any text editor, useful for debugging, and require
no decompression step before analysis. Compression adds complexity with
no meaningful benefit at V1 scale.

**Implications:** Trace files stay in `%APPDATA%/black-box/traces/` as `.ndjson`
files indefinitely until the user deletes a session. Session delete in Phase 11
must also delete the corresponding trace file.

---

## ADR-014 — 50MB Maximum Trace File Size

**Decision:** Cap trace file writes at 50MB. If a write would push the file
past this limit, stop appending and set `trace_truncated: true` on the session
record in the database.

**Reason:** In normal use a 30-minute session produces well under 10MB.
The 50MB cap is a safety valve for pathological edge cases (extremely long
sessions, very high metric sampling rate). The cap prevents disk exhaustion
without affecting any realistic use case.

**Implications:** Add a `trace_truncated` boolean column to the `sessions`
table in the Phase 2 migration. The analysis pipeline reads this flag and
includes it in the inconclusive reason if truncation occurred:
"Session trace was truncated due to size — analysis may be incomplete."

---

## ADR-015 — No Print Support on Results Screen

**Decision:** The Results screen has no Print button in V1.

**Reason:** The Export Report feature (Phase 8) produces a markdown file the
user can open in any text editor and print from there. Adding a dedicated
print dialog to the Results screen duplicates this value with additional
complexity. Users who want to print can export first.

**Implications:** The Results screen has two footer actions only:
"Export Report" and "Start New Session". No print option.
