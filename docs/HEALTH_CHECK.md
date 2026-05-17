# Black Box — Deep Codebase Health Check

**Run this document at any point during development or before any major release.**
Work top-to-bottom. The first section uses automation — stop and fix failures before
continuing to manual layers. A clean run from top to bottom means the codebase is healthy.

---

## How To Use This Document

1. Run Section 1 (automated commands). Fix every failure before proceeding.
2. Work through Sections 2–10 manually, checking each item against the actual files.
3. Mark findings with `[PASS]`, `[FAIL]`, or `[SKIP — reason]`.
4. Any `[FAIL]` must be addressed before shipping a phase or making a release build.
5. The Phase 12 Readiness Gate at the bottom is the final go/no-go checklist.

This document is intentionally exhaustive. Not every item will apply on every run.
Skip items that are out of scope for your current phase, but note why.

---

## Section 1 — Automated Health Commands

Run all of these. Every command must exit with code 0 before proceeding.

```bash
# TypeScript — strict mode, zero type errors, both processes
npm run typecheck

# Linting — zero warnings or errors
npm run lint

# Tests — all pass, zero skipped
npm run test

# Verify the build output compiles without errors (not just type-check)
npm run build
```

**Expected results:**
- `typecheck`: zero errors in both `tsconfig.node.json` and `tsconfig.web.json`
- `lint`: zero warnings, zero errors across all `.ts` and `.tsx` files
- `test`: all tests pass with a count matching the last recorded total in `docs/PHASES.md`
- `build`: `out/` directory populated, no rollup/vite errors

If any command fails, **stop here**. Fix it before any manual review.

### Test count verification

The Phase Status table in `docs/PHASES.md` records the test count for each phase.
After running `npm run test`, verify the passing count has not regressed:

```bash
npm run test -- --reporter=verbose 2>&1 | grep -E "Tests|passed|failed|skipped"
```

Expected baseline (Phases 1–11): **≥ 120 tests passing, 0 skipped, 0 failed**.
If the count drops, find the removed or skipped test and restore it.

---

## Section 2 — TypeScript Quality

Work through these checks manually after the automated pass.

### 2.1 — No `any` Types

```bash
grep -rn ": any" src/ electron/ tests/ --include="*.ts" --include="*.tsx"
grep -rn "as any" src/ electron/ tests/ --include="*.ts" --include="*.tsx"
grep -rn "<any>" src/ electron/ tests/ --include="*.ts" --include="*.tsx"
```

Every result is a failure. The contract: `unknown` with narrowing, never `any`.
For external PowerShell output or JSON.parse results, the allowed pattern is:
```typescript
const raw: unknown = JSON.parse(output)
// then narrow with type guard or zod-style assertion
```

### 2.2 — Non-null Assertions (`!`)

```bash
grep -rn "!" src/ electron/ --include="*.ts" --include="*.tsx" | grep -v "!=" | grep -v "!==" | grep -v "// "
```

Every `!` suffix (non-null assertion) is a code smell. Each one should have a
comment explaining why null is structurally impossible at that call site.
If you can't write that explanation, the assertion is wrong.

### 2.3 — Exhaustive Union Handling

Every `Confidence` union (`'HIGH' | 'MEDIUM' | 'LOW' | null`) and `IssueType`
union must be exhaustively handled in switch statements. Check:

```bash
grep -rn "switch" src/ electron/ --include="*.ts" --include="*.tsx" -A 20 | grep -v "default:"
```

Any switch block without a `default:` branch is a potential silent gap.

### 2.4 — Import Discipline

Engine modules import types from `./types` (single import target), never directly
from `../types/global`. Verify the pattern is consistent:

```bash
grep -rn "from '../types/global'" src/engine/ --include="*.ts"
```

This should return zero results. All engine imports go through `src/engine/types.ts`.

### 2.5 — Named Exports

Per `CLAUDE.md`, engine modules use named exports, not default exports.

```bash
grep -rn "export default" src/engine/ --include="*.ts"
grep -rn "export default" src/collectors/ --include="*.ts"
grep -rn "export default" src/pipeline/ --include="*.ts"
grep -rn "export default" src/telemetry/ --include="*.ts"
```

Every result is a violation. Only `src/screens/` and `src/components/` (React) use default exports.

---

## Section 3 — Architecture & Contract Integrity

### 3.1 — Rule Pack Interface Contract

Every rule pack in `src/engine/rules/` must export exactly one function with this signature:

```typescript
export function evaluate(session: ParsedSession): RuleResult
```

Verify for each file:

```bash
grep -n "export function evaluate" src/engine/rules/gpu-driver.ts
grep -n "export function evaluate" src/engine/rules/overlay-conflict.ts
grep -n "export function evaluate" src/engine/rules/anti-cheat.ts
grep -n "export function evaluate" src/engine/rules/memory-exhaustion.ts
grep -n "export function evaluate" src/engine/rules/app-hang.ts
```

Each must return exactly one result. No early returns that bypass `RuleResult` shape.

### 3.2 — RuleResult Shape Completeness

Every rule pack's `evaluate()` return value must populate all required fields:

| Field | Required? | Notes |
|---|---|---|
| `rulePackId` | Yes | Must match the file name convention (e.g. `'gpu-driver'`) |
| `fired` | Yes | `true` only when confidence is MEDIUM or higher |
| `confidence` | Yes | `null` when `fired` is `false` |
| `signals` | Yes | Non-empty array when `fired` is `true` |
| `disqualifiedBy` | Yes | May be empty array, never omitted |
| `fixRecommendations` | Yes | Non-empty when `fired` is `true` |
| `outputText` | Yes | Plain language string, never empty string |

Check: if `fired` is `true` and `signals` is empty, the rule pack is broken.
If `fired` is `true` and `fixRecommendations` is empty, the rule pack is broken.

### 3.3 — Analyzer Purity

`src/engine/analyzer.ts` must have zero side effects. Verify:

```bash
grep -n "import.*fs" src/engine/analyzer.ts
grep -n "import.*better-sqlite3" src/engine/analyzer.ts
grep -n "import.*db/" src/engine/analyzer.ts
grep -n "writeFile\|readFile\|mkdirSync" src/engine/analyzer.ts
```

All results are architecture violations. The analyzer is a pure function:
input → output, no I/O, no database, no disk.

### 3.4 — IPC Handler Domain Boundaries

IPC handlers in `electron/ipc/` must not contain business logic.
They are thin wrappers: receive IPC call → call into `src/` modules → return result.

Check each IPC file for inline logic that belongs in `src/`:

```bash
wc -l electron/ipc/recorder.ts electron/ipc/analyzer.ts electron/ipc/telemetry.ts \
        electron/ipc/export.ts electron/ipc/sessions.ts electron/ipc/follow-up.ts
```

If any IPC handler file exceeds ~80 lines, examine it for business logic that
should be extracted into a module in `src/`.

### 3.5 — Main Process vs Renderer Boundary

Verify that modules in `src/db/`, `src/pipeline/`, `src/engine/`, `src/collectors/`,
`src/telemetry/`, and `src/notifications/` are NOT imported anywhere in `src/screens/`
or `src/components/`. The renderer process communicates only through `window.electron`.

```bash
grep -rn "from '.*db/" src/screens/ src/components/ --include="*.tsx" --include="*.ts"
grep -rn "from '.*engine/" src/screens/ src/components/ --include="*.tsx" --include="*.ts"
grep -rn "from '.*collectors/" src/screens/ src/components/ --include="*.tsx" --include="*.ts"
grep -rn "from '.*pipeline/" src/screens/ src/components/ --include="*.tsx" --include="*.ts"
```

Every result is a boundary violation. The renderer only uses `window.electron.*`.

### 3.6 — Preload Surface Coverage

Every `window.electron.*` call in `src/screens/` and `src/components/` must have
a corresponding handler in `electron/preload.ts`. Audit both sides:

1. List all `window.electron.X.Y` calls in the renderer.
2. Confirm each one is exposed in `preload.ts` via `contextBridge.exposeInMainWorld`.
3. Confirm each one has a corresponding `ipcMain.handle('channel:name', ...)` in an IPC handler.

```bash
grep -rn "window\.electron\." src/ --include="*.tsx" --include="*.ts" | grep -v "global.d.ts"
```

Compare against what is declared in `electron/preload.ts`.

---

## Section 4 — Rules Engine Correctness

This is the most critical section. The rules engine is the product's core claim.
Every item here must pass. No exceptions.

### 4.1 — Time Window Definitions

The three windows are defined in `CLAUDE.md` and must be implemented exactly in
`src/pipeline/parser.ts`. Verify the constants:

| Window | Duration | Relative To |
|---|---|---|
| Baseline | 5 minutes before | Issue marker |
| Incident | 60 seconds before | Issue marker |
| Aftermath | 2 minutes after | Crash point / issue marker |

```bash
grep -n "baseline\|incident\|aftermath\|300\|60000\|120000" src/pipeline/parser.ts
```

The numbers `300000` (5 min in ms), `60000` (60 sec in ms), and `120000` (2 min in ms)
must appear and be applied in the correct direction relative to the issue marker timestamp.

### 4.2 — Confidence Scoring Logic

`src/engine/scorer.ts` must implement the ranking logic from `CLAUDE.md` in this order:
1. Most confirmed signals wins
2. Timing proximity to crash wins (signals closer to crash rank higher)
3. Specific Event ID beats generic Event ID
4. HIGH beats MEDIUM even with fewer signals

Verify the scorer never promotes a rule pack to HIGH if it only has metric signals
(no Event ID signals) — metrics alone cannot drive HIGH confidence.

### 4.3 — Inconclusive Output Correctness

When no rule pack reaches MEDIUM or higher confidence, the analyzer must return
`outcome: 'inconclusive'`. Verify:

```bash
grep -n "inconclusive" src/engine/analyzer.ts src/engine/scorer.ts
```

The `inconclusive_reason` field must be a non-empty human-readable string when
`outcome === 'inconclusive'`. It must never say "undefined" or be left blank.

### 4.4 — Rule Pack Signal Accuracy

For each rule pack, verify the primary signal Event IDs match `CLAUDE.md` exactly:

| Rule Pack | File | Primary Event IDs |
|---|---|---|
| GPU Driver | `src/engine/rules/gpu-driver.ts` | 153, 14, 13 (nvlddmkm), 4101, 141, 1001 |
| Overlay Conflict | `src/engine/rules/overlay-conflict.ts` | Silent crash, faulting module check |
| Anti-Cheat | `src/engine/rules/anti-cheat.ts` | FilterManager Event ID 1, EAC exit 0xC0000005 |
| Memory Exhaustion | `src/engine/rules/memory-exhaustion.ts` | Event ID 2004, commit >95%, OOM 0xe00000008 |
| App Hang | `src/engine/rules/app-hang.ts` | Event ID 1002, disk latency >500ms |

```bash
grep -n "153\|4101\|141" src/engine/rules/gpu-driver.ts
grep -n "2004\|0xe0000008\|commit" src/engine/rules/memory-exhaustion.ts
grep -n "1002\|500" src/engine/rules/app-hang.ts
grep -n "FilterManager\|0xC0000005" src/engine/rules/anti-cheat.ts
```

### 4.5 — Disqualification Integrity

Every rule pack must have disqualification logic — signals that rule it out or redirect
to another pack. A rule pack with zero disqualification logic is incomplete.

```bash
grep -n "disqualifiedBy" src/engine/rules/gpu-driver.ts
grep -n "disqualifiedBy" src/engine/rules/overlay-conflict.ts
grep -n "disqualifiedBy" src/engine/rules/anti-cheat.ts
grep -n "disqualifiedBy" src/engine/rules/memory-exhaustion.ts
grep -n "disqualifiedBy" src/engine/rules/app-hang.ts
```

Each file must have at least one `disqualifiedBy` entry in the non-fired path.

### 4.6 — Output Text Quality

Every `outputText` in every rule pack must:
- Name specific evidence (Event ID, process name, or metric value)
- Include a timing reference (e.g. "12 seconds before")
- Use plain language (no raw hex codes without explanation)
- Match the confidence level in tone (HIGH = definitive, MEDIUM = consistent with, LOW = possible)

Manually read all five `outputText` strings from the fixture test expectations and verify
they match the format from `CLAUDE.md §UI Tone and Copy Guidelines`.

### 4.7 — Fixture Coverage

Each rule pack must have at least three fixture test scenarios:
- HIGH or MEDIUM confidence match
- LOW or no-match (inconclusive path)
- Edge case (signals present but disqualified)

```bash
ls tests/unit/engine/
ls tests/fixtures/ 2>/dev/null || echo "check test fixture locations"
```

If any rule pack has fewer than three distinct test scenarios, test coverage is insufficient.

---

## Section 5 — Data Layer & Session Integrity

### 5.1 — Schema Completeness

Verify every table in `src/db/schema.ts` has a corresponding test in `tests/unit/db/`.

Expected tables: `sessions`, `analysis_results`, `settings`, `follow_ups`

```bash
grep -n "CREATE TABLE" src/db/schema.ts
```

Cross-reference: every table name that appears in `schema.ts` must appear in at
least one test file in `tests/unit/db/`.

### 5.2 — Migration Safety

```bash
ls src/db/migrations/
```

Migrations must be numbered sequentially with no gaps. Each migration file must be
idempotent — safe to run twice without corrupting the database. Verify there are no
raw `DROP TABLE` statements without a safety check:

```bash
grep -n "DROP TABLE" src/db/migrations/
```

Any `DROP TABLE` without `IF EXISTS` is a data-loss risk.

### 5.3 — Session State Machine

Sessions must flow through states in this exact order only:
`recording` → `analyzing` → `complete` | `error` | `interrupted`

Verify no code sets `status: 'complete'` without first going through `'analyzing'`:

```bash
grep -rn "status.*complete\|status.*recording\|status.*analyzing\|status.*error\|status.*interrupted" \
     src/db/ src/pipeline/ electron/ipc/ --include="*.ts"
```

Check that `updateSession` calls always move forward in the state machine,
never backward (e.g., setting `recording` from `complete`).

### 5.4 — Anonymous Session ID Format

The anonymous session ID must be generated once at first launch and persisted
in the `settings` table. It must never be regenerated on subsequent launches.

```bash
grep -rn "anonymous_session_id\|generateAnonymousId\|session_id" src/db/settings.ts
```

Verify: the ID is never a username, email, hostname, or anything derivable from
the user's identity. It should be a random UUID or similar entropy-based value.

### 5.5 — NDJSON Trace File Integrity

The trace file at `{tracesDir}/{sessionId}.ndjson` must:
- Contain one JSON object per line
- Begin with a `session_start` event
- End with a `session_stop` event (if recording ended normally)
- Have all intermediate events between those two markers

```bash
grep -n "session_start\|session_stop\|issue_marker" src/pipeline/trace-writer.ts
grep -n "session_start\|session_stop\|issue_marker" src/pipeline/parser.ts
```

Verify the parser handles missing `session_stop` (interrupted session) without throwing.

---

## Section 6 — IPC Surface & Electron Security

### 6.1 — Context Isolation

`electron/main.ts` must have `contextIsolation: true` and `nodeIntegration: false`.

```bash
grep -n "contextIsolation\|nodeIntegration\|sandbox" electron/main.ts
```

Expected:
```
contextIsolation: true
nodeIntegration: false
```

Any deviation from this is a critical security issue.

### 6.2 — No Shell Injection

Every PowerShell call in `src/collectors/` must use argument arrays, not string
concatenation. Look for any string template literals being passed directly to `exec`:

```bash
grep -rn "exec\|spawn\|execFile" src/collectors/ electron/ --include="*.ts" -A 2
```

Check: arguments to PowerShell must be sanitized. Time windows, session IDs, and
any user-provided strings must never be interpolated directly into a command string
without escaping. Event time window parameters (the `30` minute lookback) are
constants, not user input — verify no user-supplied data reaches shell commands.

### 6.3 — IPC Channel Namespacing

All IPC channel names in `electron/ipc/` must follow the `domain:action` format.
No arbitrary string channel names.

```bash
grep -rn "ipcMain.handle\|ipcRenderer.invoke\|ipcRenderer.on" electron/ src/ --include="*.ts"
```

Verify: every channel name in `ipcMain.handle` has a corresponding `ipcRenderer.invoke`
or `ipcRenderer.on` in `preload.ts`, and no channel exists without a handler on both sides.

### 6.4 — No Undeclared Channels

The preload script is the authoritative list of what the renderer can call.
Any `ipcMain.handle` channel that is NOT declared in `preload.ts` is either
dead code or a security gap (accessible via DevTools console injection).

```bash
grep -n "ipcMain.handle" electron/ipc/*.ts | awk -F"'" '{print $2}' | sort
grep -n "ipcRenderer.invoke\|ipcRenderer.on" electron/preload.ts | awk -F"'" '{print $2}' | sort
```

These two lists must match (allowing for event-based channels that only go main → renderer).

### 6.5 — DevTools Handler Scope

`electron/ipc/devtools.ts` must only be registered in development mode.

```bash
grep -n "devtools\|simulateScenario" electron/main.ts
```

Verify the devtools IPC handler registration is inside an `if (isDev)` or
`if (process.env.NODE_ENV !== 'production')` guard. If it's unconditional, it
exposes the scenario simulator in production builds.

---

## Section 7 — Privacy & Telemetry Hygiene

This section is non-negotiable. Every item must pass before any build is released.

### 7.1 — Sanitizer Coverage

`src/telemetry/sanitizer.ts` must strip everything not on the allowed list.
The allowed list from `CLAUDE.md`:

```
session_id (anonymous only)
event_ids_fired (numbers only)
process_names (names only, no paths, no arguments)
metrics_summary (aggregated numbers only)
hardware_profile (model names and version strings only)
diagnosis_outcome
confidence_level
primary_rule_pack_id
```

Verify the sanitizer does NOT include:
- File names or file paths
- Process command-line arguments
- Usernames or account names
- Raw message strings from event logs (these can contain PII)
- IP addresses or hostnames

```bash
grep -n "message\|args\|arguments\|path\|filename\|username\|hostname\|computer" \
     src/telemetry/sanitizer.ts
```

Any match in the output (not in comments) is a potential privacy leak.

### 7.2 — Upload Gate

The uploader must check the opt-in flag before every upload attempt. Not just once
at app start — before every individual upload.

```bash
grep -n "telemetryOptIn\|opt_in\|optIn" src/telemetry/uploader.ts
```

The pattern must be: `if (!optIn) return` as the first thing in the upload function.

### 7.3 — Silent Failure

Upload failures must never surface to the user. They must be caught and logged locally only.

```bash
grep -n "catch\|try\|throw" src/telemetry/uploader.ts
grep -n "console.error\|console.warn\|logger" src/telemetry/uploader.ts
```

Verify: the catch block does not re-throw, does not show a notification, and does not
update any UI state. Log to console only.

### 7.4 — Sanitizer Test Coverage

The sanitizer must have tests that explicitly verify PII does NOT appear in output:

```bash
grep -n "should not\|must not\|excludes\|strips\|removes" tests/unit/telemetry/sanitizer.test.ts
```

If the sanitizer tests only verify what IS present, they're incomplete. They must
also verify what is NOT present (negative assertions).

### 7.5 — Event Log Messages Not Uploaded

Raw event log `message` fields can contain file paths, usernames, and app-specific data.
Verify that no raw message strings from `EventRecord.message` appear in the telemetry payload:

```bash
grep -n "\.message" src/telemetry/sanitizer.ts
```

The sanitizer must only extract Event IDs (numbers) from signals, never the message text.

---

## Section 8 — UI & State Quality

### 8.1 — Design Token Consistency

Every screen must use only the color tokens defined in `CLAUDE.md §Design Direction`.
No hardcoded hex values outside of `tailwind.config.js`:

```bash
grep -rn "#[0-9A-Fa-f]\{3,6\}" src/screens/ src/components/ --include="*.tsx"
```

Allowed exceptions: `#0A0A0F`, `#13131A`, `#1C1C26`, `#2A2A38`, `#E8E8F0`, `#8888A0`,
`#4F6EF7`, `#22C55E`, `#F59E0B`, `#6B7280` — but these should be in `tailwind.config.js`,
not inline. Any other hex value is a design deviation.

### 8.2 — Four Result States

`src/screens/Results.tsx` must handle all four outcome states:
`diagnosed-high`, `diagnosed-medium`, `diagnosed-low`, and `inconclusive`.
The `'error'` outcome from the analyzer must also be handled gracefully.

```bash
grep -n "HIGH\|MEDIUM\|LOW\|inconclusive\|error" src/screens/Results.tsx
```

Verify: the inconclusive state has distinct visual treatment (not just the diagnosed
state with empty fields). The error state must not crash the screen.

### 8.3 — Confidence Badge Colors

Per `CLAUDE.md`:
- HIGH → `#22C55E` (green)
- MEDIUM → `#F59E0B` (amber)
- LOW / inconclusive → `#6B7280` (gray)

```bash
grep -n "HIGH\|MEDIUM\|LOW\|green\|amber\|gray" src/screens/Results.tsx src/screens/History.tsx
```

Verify the confidence badge component maps confidence levels to the correct colors,
not similar colors (e.g., yellow instead of amber, or red for LOW).

### 8.4 — Zustand Store Completeness

`src/store/index.ts` must contain all state required by active screens. Look for
any screen that accesses `window.electron.*` directly in a `useEffect` without
going through the store:

```bash
grep -rn "window\.electron\." src/screens/ src/components/ --include="*.tsx"
```

Compare: for each `window.electron.*` call in the renderer, there should be a
corresponding store action or local effect that manages the result. Direct `window.electron`
calls in component render bodies (not effects or event handlers) are bugs.

### 8.5 — Keyboard Accessibility

Per `CLAUDE.md §UI`, all screens must be keyboard accessible.

```bash
grep -rn "tabIndex\|role=\|aria-\|onKeyDown\|onKeyUp" src/screens/ src/components/ --include="*.tsx"
```

Verify: the Record screen's issue marker button is reachable via Tab and activatable
via Enter/Space. The Describe screen's form can be submitted with Enter.
The Results screen's expandable secondary causes section can be opened with keyboard.

### 8.6 — Loading States

Every async IPC call must have a loading state. No screen should show stale or
empty content while waiting for an IPC response.

```bash
grep -rn "isLoading\|loading\|isPending\|isFetching" src/screens/ src/store/ --include="*.tsx" --include="*.ts"
```

Check: `Analyzing.tsx` must show active progress indication, not a static screen.
`History.tsx` must show a loading state while `sessions:list` is in flight.

---

## Section 9 — Test Coverage & Fixture Quality

### 9.1 — Test File Mapping

Every source module must have a corresponding test file. Check for gaps:

| Source Module | Expected Test File |
|---|---|
| `src/engine/rules/gpu-driver.ts` | `tests/unit/engine/gpu-driver.test.ts` |
| `src/engine/rules/overlay-conflict.ts` | `tests/unit/engine/overlay-conflict.test.ts` |
| `src/engine/rules/anti-cheat.ts` | `tests/unit/engine/anti-cheat.test.ts` |
| `src/engine/rules/memory-exhaustion.ts` | `tests/unit/engine/memory-exhaustion.test.ts` |
| `src/engine/rules/app-hang.ts` | `tests/unit/engine/app-hang.test.ts` |
| `src/engine/scorer.ts` | `tests/unit/engine/scorer.test.ts` |
| `src/engine/analyzer.ts` | `tests/unit/engine/analyzer.test.ts` |
| `src/pipeline/parser.ts` | `tests/unit/pipeline/parser.test.ts` |
| `src/telemetry/sanitizer.ts` | `tests/unit/telemetry/sanitizer.test.ts` |
| `src/export/report-generator.ts` | `tests/unit/export/report-generator.test.ts` |
| `src/notifications/follow-up-scheduler.ts` | `tests/unit/notifications/follow-up-scheduler.test.ts` |
| `src/db/sessions.ts` | `tests/unit/db/sessions.test.ts` |
| `src/db/settings.ts` | `tests/unit/db/settings.test.ts` |

```bash
ls tests/unit/engine/ tests/unit/pipeline/ tests/unit/telemetry/ \
   tests/unit/export/ tests/unit/notifications/ tests/unit/db/
```

Any module in the left column without a file in the right column is a coverage gap.

### 9.2 — Fixture Scenario Balance

For every rule pack test file, verify at least three distinct scenarios exist:

```bash
grep -n "describe\|it(\|test(" tests/unit/engine/gpu-driver.test.ts
grep -n "describe\|it(\|test(" tests/unit/engine/overlay-conflict.test.ts
grep -n "describe\|it(\|test(" tests/unit/engine/anti-cheat.test.ts
grep -n "describe\|it(\|test(" tests/unit/engine/memory-exhaustion.test.ts
grep -n "describe\|it(\|test(" tests/unit/engine/app-hang.test.ts
```

Required per rule pack:
1. High-signal match (should fire at MEDIUM or HIGH)
2. No-signal / low-signal (should not fire)
3. Disqualification scenario (signals present but a disqualifier exists)

### 9.3 — No Skipped Tests

```bash
grep -rn "\.skip\|test.skip\|it.skip\|xit\|xdescribe\|describe.skip" tests/ --include="*.ts"
```

Every skipped test is unacceptable unless accompanied by an active GitHub issue number
in the skip comment. A skipped test is a promise that something is broken.

### 9.4 — Realistic Fixture Data

Fixture event data must use real Windows Event IDs and realistic timestamps.
Look for placeholder values:

```bash
grep -rn "event_id: 0\|event_id: 1\b\|provider: ''\|ts: ''" tests/ --include="*.ts"
```

A fixture with `event_id: 0` or an empty provider string is not a realistic test.
It may pass but won't catch regressions from real event log data.

### 9.5 — Collector Tests Use Fixture Data

Collector tests must not invoke real PowerShell scripts. Verify they use fixture
JSON strings or mocked child_process output:

```bash
grep -rn "child_process\|execFile\|spawnSync" tests/unit/collectors/ --include="*.ts"
```

Any real process invocation in a test file makes the tests environment-dependent.
Collector unit tests must be offline and deterministic.

---

## Section 10 — Terminology Drift

The canonical terminology from `CLAUDE.md` must be used consistently in all
user-facing copy, comments, and documentation. Check for banned substitutions:

### 10.1 — UI Copy Scan

```bash
# "log" used instead of "session"
grep -rn '"log\b\|'\''log\b' src/screens/ src/components/ --include="*.tsx"

# "score" or "probability" instead of "confidence level"
grep -rn "probability\|score\b\|certainty\|rating\b" src/screens/ src/components/ --include="*.tsx"

# "solution" or "suggestion" instead of "fix recommendation"
grep -rn '"solution\|suggestion\|advice\b' src/screens/ src/components/ --include="*.tsx"

# "culprit" or "reason" instead of "cause"
grep -rn '"culprit\|"reason\b' src/screens/ src/components/ --include="*.tsx"

# "log export" instead of "session report"
grep -rn '"log export\|diagnostic export' src/screens/ --include="*.tsx"
```

### 10.2 — Confidence Level Casing

Confidence levels must always be rendered as ALL CAPS: `HIGH`, `MEDIUM`, `LOW`.
Never `High`, `high`, or `High confidence`.

```bash
grep -rn '"High"\|"Medium"\|"Low"\|'\''High'\''\|'\''Medium'\''\|'\''Low'\''' \
     src/screens/ src/components/ --include="*.tsx"
```

The only exception is inside TypeScript type definitions where the string literal
matches the union type — but even then, verify it renders as uppercase in the UI.

### 10.3 — Forbidden UI Copy Patterns

Per `CLAUDE.md §UI Tone`, these phrases must never appear in any user-facing string:

```bash
grep -rn "serious problem\|Critical error\|We found the issue\|definitely caused" \
     src/screens/ src/components/ --include="*.tsx"
```

Any result is a copy failure that violates the product's trust model.

---

## Section 11 — Session Report Export

### 11.1 — Report Header Compliance

`src/export/report-generator.ts` must produce a report with exactly the header
format specified in `PHASES.md §Phase 8`. Verify:

```bash
grep -n "Black Box Session Report\|Session ID\|Confidence:\|Generated by Black Box" \
     src/export/report-generator.ts
```

The Session ID must show only the last 8 characters of the anonymous ID:

```bash
grep -n "slice\|substr\|substring" src/export/report-generator.ts
```

The report must include: Date, Issue Type, App/Game, Session ID (truncated),
Diagnosis, Confidence, Evidence Found, Fix Recommendations, All Signals Detected,
and the generator footer.

### 11.2 — PII Scan on Report Output

The report generator must never include file paths, usernames, or raw event log
messages in its output:

```bash
grep -n "\.message\b" src/export/report-generator.ts
```

Raw `EventRecord.message` values from Windows Event Log can contain file paths,
process arguments, and user account names. They must not appear in the exported report.

---

## Section 12 — Code Hygiene

### 12.1 — Open Decision Comments

```bash
grep -rn "DECISION NEEDED" src/ electron/ --include="*.ts" --include="*.tsx"
```

Every `// DECISION NEEDED:` comment is a documented ambiguity that must be resolved
before the app is considered production-ready. List all results and close each one.

### 12.2 — TODO and Fixme Debt

```bash
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ electron/ --include="*.ts" --include="*.tsx"
```

Each result must be justified. TODOs that reference future phases are acceptable
with an explicit phase label (e.g., `// TODO Phase 12:`). Undated or unlabeled
TODOs are tech debt that must be either fixed or converted to a decision comment.

### 12.3 — Console Logging in Production Code

```bash
grep -rn "console\.log\b" src/ electron/ --include="*.ts" --include="*.tsx" | grep -v test | grep -v ".test."
```

`console.log` in production code is acceptable during V1 development but should be
audited before any public release. Flag every instance that logs user-derived data
(process names, session content, file paths) — these are potential privacy leaks
even if telemetry is disabled.

### 12.4 — Silently Swallowed Errors

```bash
grep -rn "catch.*{}" src/ electron/ --include="*.ts" --include="*.tsx"
grep -rn "catch (e) {}" src/ electron/ --include="*.ts" --include="*.tsx"
```

Every empty catch block is a silent failure. Errors must be logged with context,
never dropped. The only acceptable pattern is: `catch { /* intentional no-op — reason */ }`.

### 12.5 — PowerShell Script Health

```bash
grep -n "try\|catch\|error\|ErrorAction\|StopAction" scripts/powershell/get-processes.ps1
grep -n "try\|catch\|error\|ErrorAction\|StopAction" scripts/powershell/get-system-info.ps1
```

Every PowerShell script must:
- Use `try/catch` blocks around all WMI or Event Log queries
- Return structured JSON even on failure (with an `error` field)
- Use `-ErrorAction Stop` to ensure errors are catchable
- Never exit with a non-zero code silently

---

## Section 13 — Phase 12 Readiness Gate

Complete this section only when preparing for Phase 12 or a production build.
Every checkbox must be `[x]` before declaring the app release-ready.

### Automated Quality Gate
- [ ] `npm run typecheck` exits 0 — zero TypeScript errors
- [ ] `npm run lint` exits 0 — zero ESLint warnings or errors
- [ ] `npm run test` exits 0 — all tests pass, zero skipped
- [ ] `npm run build` exits 0 — production bundle compiles without warnings

### Architecture Gate
- [ ] Zero `any` types in the codebase
- [ ] Zero main-process modules imported in renderer
- [ ] Analyzer is a pure function (no I/O, confirmed)
- [ ] All five rule pack `evaluate()` functions have correct return shapes
- [ ] IPC channel list in `preload.ts` matches `ipcMain.handle` registrations
- [ ] DevTools IPC handler is gated behind `isDev` in `electron/main.ts`

### Rules Engine Gate
- [ ] All five rule packs implement the correct primary signals from `CLAUDE.md`
- [ ] Time windows are exactly 5 min / 60 sec / 2 min
- [ ] Inconclusive output returns a non-empty `inconclusive_reason`
- [ ] Every rule pack has disqualification logic
- [ ] All fixture tests pass for all three scenarios per rule pack

### Privacy Gate
- [ ] Sanitizer strips raw event log messages
- [ ] Sanitizer strips process arguments and file paths
- [ ] Upload is gated behind opt-in check on every call
- [ ] Upload failure is silent (no UI, no notification)
- [ ] Session report contains no PII
- [ ] Session ID in report is truncated to last 8 characters

### UI Gate
- [ ] All four result states render correctly in `Results.tsx`
- [ ] Confidence badges use the correct colors from the design spec
- [ ] Keyboard navigation works for all interactive elements
- [ ] All screens have loading states for async operations
- [ ] No hardcoded hex colors outside `tailwind.config.js`
- [ ] No banned UI copy phrases present

### Data Gate
- [ ] Database initializes on first run without errors
- [ ] Migrations run idempotently
- [ ] Session state machine moves forward only
- [ ] NDJSON trace files are written and readable by the parser
- [ ] Parser handles missing `session_stop` without throwing

### Security Gate
- [ ] `contextIsolation: true`, `nodeIntegration: false` in `BrowserWindow`
- [ ] No shell injection vectors in collector PowerShell invocations
- [ ] All IPC channels namespaced as `domain:action`
- [ ] No undeclared IPC channels accessible from renderer
- [ ] AgentShield scan passes with no new critical or high findings (`npx ecc-agentshield scan --path . --format text`)
- [ ] `.claude/settings.local.json` deny list covers: `rm -rf`, force push, `curl|sh`, `sudo`, `ssh`, device writes
- [ ] `CLAUDE.md` and `docs/CLAUDE.md` locked to owner-only via Windows ACL (`icacls /inheritance:r /grant:r`)

### Hygiene Gate
- [ ] Zero `// DECISION NEEDED:` comments
- [ ] Zero empty catch blocks (`catch {}`)
- [ ] No `console.log` calls that expose user-derived data in production code
- [ ] All TODO comments reference a specific phase or issue

---

## Scoring Reference

Use this to track runs over time. Record the date and score after each full review.

| Date | Auto Gates | Architecture | Engine | Privacy | UI | Tests | Score |
|---|---|---|---|---|---|---|---|
| | /4 | /6 | /7 | /5 | /5 | /5 | /32 |

**Score interpretation:**
- 32/32 — Ship it
- 28–31 — Minor issues, fix before release
- 24–27 — Moderate issues, do not ship
- <24 — Stop. Fix foundational problems first.

---

*Last updated: 2026-05-17*
*This document is authoritative. When CLAUDE.md or PHASES.md change, update this document to match.*
