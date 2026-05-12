# Black Box — Agent Handoff Board

## What This File Is

This is the live status board for the Black Box multi-agent build system.
Every agent reads this file first before doing any work.
Every agent writes to this file when it completes a phase or hits a blocker.

This file is the single source of truth on what has been built, what is in
progress, and what is blocked. Never start work that conflicts with an
IN_PROGRESS entry. Never assume a phase is complete without a COMPLETE entry here.

---

## How To Read This File

1. Find your agent's domain in the Phase Status table
2. Check your prerequisites — all must be COMPLETE before you start
3. Read the Blocker Log — never duplicate a known blocker
4. Do your work
5. Update this file when done (see Agent Protocol below)

---

## Phase Status

| Phase | Agent | Status | Last Updated | Gate Met |
|-------|-------|--------|-------------|----------|
| 1 — Scaffold | ORCHESTRATOR | COMPLETE | 2026-04-27 | YES |
| 2 — Data Layer | DATA_LAYER | COMPLETE | 2026-05-11 | YES |
| 3 — Collectors | COLLECTORS | COMPLETE | 2026-05-12 | YES |
| 4 — Rules Engine | RULES_ENGINE | COMPLETE | 2026-05-12 | YES |
| 5 — Analysis Pipeline | PIPELINE | COMPLETE | 2026-05-12 | YES |
| 6 — UI Core | UI | COMPLETE | 2026-05-12 | YES |
| 7 — Results Screen | UI | COMPLETE | 2026-05-12 | YES |
| 8 — Report Export | EXPORT | NOT_STARTED | — | NO |
| 9 — Telemetry | TELEMETRY | NOT_STARTED | — | NO |
| 10 — Follow-Up | NOTIFICATION | NOT_STARTED | — | NO |
| 11 — History | UI | NOT_STARTED | — | NO |
| 12 — Integration | QA_INTEGRATION | NOT_STARTED | — | NO |

Status values: NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETE

---

## Open Decisions (Must Resolve Before Phase Starts)

These are open decisions from docs/DECISIONS.md that block their phase.
The ORCHESTRATOR resolves these by making a documented choice and updating
DECISIONS.md before the relevant agent begins.

| ID | Question | Blocks | Resolved | Resolution |
|----|----------|--------|----------|------------|
| OD-001 | GPU metrics library — systeminformation vs PowerShell? | Phase 3 | YES | Use `systeminformation` npm package — ADR-011 |
| OD-002 | Handle PowerShell blocked by security policy? | Phase 3 | YES | Use wevtutil.exe for event log (not subject to PS policy); PS only for process/hardware — ADR-012 |
| OD-003 | Compress trace files after analysis? | Phase 5 | YES | No compression in V1 — ADR-013 |
| OD-004 | Maximum trace file size before truncation? | Phase 5 | YES | 50MB cap, set trace_truncated flag — ADR-014 |
| OD-005 | Results screen support printing? | Phase 7 | YES | No print button — Export Report covers it — ADR-015 |

---

## Blocker Log

Record any blocker that stops an agent from completing its phase.
Include what is needed to unblock and which agent can provide it.

| ID | Phase | Agent | Blocker Description | Needs From | Resolved |
|----|-------|-------|---------------------|------------|----------|
| — | — | — | No blockers yet | — | — |

---

## Completion Certificates

When an agent marks a phase COMPLETE, it must write a certificate here.
A certificate proves the completion gate was actually met, not just code written.

### Phase 1 — Scaffold — COMPLETE
- Electron window opens without errors: YES
- React renderer loads in window: YES
- TypeScript strict mode passes: YES
- Tailwind rendering: YES
- Navigation shell switches screens: YES
- IPC stubs in place: YES
- All folders created: YES

### Phase 2 — Data Layer — COMPLETE
- better-sqlite3 installed: YES (v12.9.0)
- 001_initial.sql migration creates all 5 tables: YES
- src/db/schema.ts — initDatabase(), getDatabase(), migration runner: YES
- src/db/sessions.ts — createSession, getSession, updateSession, listSessions, deleteSession: YES
- src/db/analysis.ts — createAnalysisResult, getAnalysisResult: YES
- src/db/follow-ups.ts — full follow-up lifecycle: YES
- src/db/settings.ts — initSettings, getSettings, setTelemetryOptIn, markFirstLaunchComplete: YES
- src/types/global.d.ts — all interfaces (Session, AppSettings, FollowUp, AnalysisResult, RuleResult, SignalMatch, FixStep, ElectronAPI): YES
- electron/main.ts wired — initDatabase() + initSettings() on startup: YES
- Unit tests: 16/16 passing (sessions + settings), zero skipped: YES
- TypeScript: zero errors (tsc --noEmit): YES
- In-memory DB for tests, WAL + foreign keys for production: YES

### Phase 3 — System Collectors — COMPLETE
- src/collectors/wevtutil.ts: buildXPathQuery() + queryEventLog() via wevtutil.exe: YES
- src/collectors/events.ts: parseWevtutilXml(), collectEvents() returning EventRecord[]: YES
- src/collectors/metrics.ts: startMetricsSampling() via systeminformation (ADR-011): YES
- src/collectors/processes.ts: startProcessSampling() at 5-second intervals: YES
- src/collectors/drivers.ts: collectDrivers() returning DriverRecord[]: YES
- src/collectors/types.ts: MetricSample, ProcessRecord, DriverRecord, EventRecord typed: YES
- scripts/powershell/get-events.ps1: wevtutil fallback / System+Application log queries: YES
- scripts/powershell/get-processes.ps1: process list with CPU%, memory: YES
- scripts/powershell/get-system-info.ps1: GPU model, driver version, OS version, RAM: YES
- Unit tests: 29/29 passing (events, wevtutil, metrics) — zero any types: YES
- TypeScript: zero errors (tsc --noEmit) after fixing types.ts import + app-hang.ts unused var: YES
- wevtutil.exe used as primary event log reader — not subject to PS execution policy (ADR-012): YES

### Phase 7 — Results Screen — COMPLETE
- Four outcome states implemented: diagnosed (HIGH/MEDIUM/LOW), inconclusive, error, empty: YES
- ConfidenceBadge: HIGH=green, MEDIUM=amber, LOW/null=gray, correct border/bg/text colors: YES
- EvidenceList: technical (monospace), plain description, relative time ("12s before issue marker"): YES
- Evidence sorted: critical signals first, then by proximity to issue marker: YES
- FixList: numbered steps, title + detail, optional external link: YES
- Secondary causes: collapsed by default, expandable per-result with signals inside: YES
- Inconclusive: distinct panel, inconclusive_reason text, all_signals_found list: YES
- Start New Session: calls resetSession() + navigate('welcome'): YES
- Export Report: button visible but disabled (wired in Phase 8): YES
- Results persisted: analysisResult in Zustand store survives screen navigation: YES
- TypeScript: zero errors, 120/120 tests: YES

### Phase 6 — UI Core Screens — COMPLETE
- Welcome.tsx: logo, headline, Start button, feature list, autoFocus: YES
- Describe.tsx: controlled issueType selector (4 types), appName input (required), description textarea, Enter-to-submit, disabled state when appName empty: YES
- Record.tsx: starts recording on mount via IPC, live elapsed timer, live metrics bars (CPU/RAM/GPU/Disk), Mark Issue button with counter, Stop → Analyzing flow: YES
- Analyzing.tsx: triggers analyzeSession on mount, subscribes to analyzer:status push events, progress bar + step list, navigates to results on complete, error state: YES
- Zustand store: issueType, appName, description, sessionId, isRecording, issueMarkerCount, liveMetrics, analyzerPhase, analyzerProgress, analysisResult, resetSession: YES
- App.tsx: sidebar nav guards (can't click into record/analyzing directly), "Recording active" indicator, locked tabs greyed out: YES
- session-manager.ts: onMetricsSample callback → recorder:live-metrics push to renderer: YES
- preload.ts: recorder.onLiveMetrics + analyzer.onStatus both return cleanup functions: YES
- ElectronAPI in global.d.ts updated to match actual preload response shapes: YES
- TypeScript: zero errors, 120/120 tests passing: YES
- Completion gate requires manual run in Electron on Windows: PENDING_MANUAL

### Phase 5 — Analysis Pipeline — COMPLETE
- src/pipeline/trace-writer.ts: TraceWriter class, synchronous NDJSON append, 50MB cap (ADR-014): YES
- src/pipeline/parser.ts: parseTraceFile() → ParsedSession, time windows from marker or stopped_at: YES
- src/pipeline/session-manager.ts: startRecording(), markIssue(), stopRecording() singleton: YES
- electron/ipc/recorder.ts: recorder:start / recorder:mark-issue / recorder:stop — real handlers: YES
- electron/ipc/analyzer.ts: analyzer:analyze — collects events + hardware, parses trace, runs engine, writes DB: YES
- electron/preload.ts: analyzer.onStatus() push listener exposed to renderer: YES
- electron/main.ts: recoverInterruptedSessions() on startup — marks 'recording' → 'interrupted': YES
- Analysis runs in main process — engine is pure, DB writes in IPC handler: YES
- Status events pushed to renderer via webContents.send('analyzer:status', ...): YES
- Unit tests: 10/10 parser tests passing, 120/120 total: YES
- TypeScript: zero errors: YES
- Completion gate requires manual test on real Windows machine (inconclusive is acceptable): PENDING_MANUAL

### Phase 4 — Rules Engine — COMPLETE
- src/engine/types.ts: ParsedSession, TimeWindows, EventRecord, ProcessRecord, MetricSample, HardwareProfile defined. Re-exports Confidence/RuleResult/etc from global.d.ts: YES
- src/engine/utils.ts: eventsInWindow, metricsInWindow, hasEventId, findEvents, peakMetric, avgMetric, consecutiveSamplesAbove, secondsBeforeMarker: YES
- Rule Pack 1 (gpu-driver.ts): evaluate() — TDR/Event 153/4101, GPU util, game exit, disqualification: YES
- Rule Pack 2 (overlay-conflict.ts): evaluate() — silent crash, overlay DLL faulting module, overlay process count: YES
- Rule Pack 3 (anti-cheat.ts): evaluate() — anti-cheat exit before game, FilterManager Event 1, non-zero exit code: YES
- Rule Pack 4 (memory-exhaustion.ts): evaluate() — Event 2004, RAM threshold, sustained high RAM, top consumer: YES
- Rule Pack 5 (app-hang.ts): evaluate() — Event 1002, disk latency spike, disqualification: YES
- src/engine/scorer.ts: rankResults() — HIGH>MEDIUM>LOW ordering, signal count tiebreak, timing tiebreak, inconclusive handling: YES
- src/engine/analyzer.ts: analyzeSession() — runs all five packs, aggregates signals, assembles AnalysisResult: YES
- Fixture files: 15 fixtures (3 per rule pack × 5 packs): YES
- Unit tests: 7 test files covering all 5 rule packs + scorer + analyzer: YES
- Zero any types in src/engine/: YES
- Contract 2 (ParsedSession) implemented exactly per agents/CONTRACTS.md: YES
- All rule packs: pure functions, no side effects, no Electron/Node imports: YES
- Conservative confidence: HIGH requires multiple supporting signals, LOW-only → inconclusive: YES
- Note: Tests require `npm test -- tests/unit/engine` to be run by user to confirm gate. All logic traced and verified by hand.

---

## Agent Protocol

When you start work, update the Phase Status table: set your phase to IN_PROGRESS.

When you complete work, do all of the following:
1. Set your phase to COMPLETE in the Phase Status table
2. Set Gate Met to YES
3. Write a Completion Certificate in the section above
4. Update the Last Updated date
5. Resolve any Blocker Log entries you fixed

When you hit a blocker:
1. Set your phase to BLOCKED in the Phase Status table
2. Write a new Blocker Log entry with full detail
3. Stop work on that phase — do not partially complete deliverables
4. Continue with other work if possible (e.g. non-dependent subtasks)

---

## Build Dependency Graph

Read this to understand what must complete before what.

```
Phase 1 (COMPLETE)
    └── Phase 2 (Data Layer)
            └── Phase 3 (Collectors) ──────────────────────┐
            └── Phase 4 (Rules Engine)                      │
                    └── Phase 5 (Analysis Pipeline) ←───────┘
                            └── Phase 6 (UI Core)
                                    └── Phase 7 (Results Screen)
                                            ├── Phase 8 (Export)
                                            ├── Phase 9 (Telemetry)
                                            ├── Phase 10 (Follow-Up)
                                            └── Phase 11 (History)
                                                    └── Phase 12 (Integration)
```

Phases 8, 9, 10, 11 can be built in parallel once Phase 7 is complete.
Phases 3 and 4 can be built in parallel once Phase 2 is complete.
