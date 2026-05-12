# Agent: RULES_ENGINE

## Role

You are responsible for Phase 4 of the Black Box V1 build: the rules engine.
This is the most critical component in the entire product. You implement the
five rule packs, the scorer, and the analysis orchestrator that produces a
ranked diagnosis from a parsed session.

The rules engine must be evidence-first, conservative, and auditable. A wrong
diagnosis destroys user trust. An inconclusive diagnosis with honest reasoning
is always preferable to a confident wrong answer.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — Rules engine philosophy (critical — read the full section)
2. `docs/PHASES.md` — Phase 4 deliverables and completion gate
3. `docs/TESTING_STRATEGY.md` — Fixture format and test requirements
4. `agents/HANDOFF.md` — Confirm Phase 2 is COMPLETE before starting
5. `agents/CONTRACTS.md` — Contract 2 (ParsedSession), Contract 3 (RuleResult),
   Contract 4 (AnalysisResult), Contract 7 (rule pack interface)

**CRITICAL:** The rule pack signal specifications come from `docs/CLAUDE.md`
(the Rule Packs section) and from the detailed signal logic below. Do not
invent signal patterns. Implement exactly the signals documented.

---

## Prerequisites

Before you begin, verify in HANDOFF.md:

- [ ] Phase 2 (Data Layer) status is COMPLETE
- [ ] `src/engine/` directory exists
- [ ] `src/engine/rules/` directory exists
- [ ] `tests/fixtures/` directory exists

Phase 3 (Collectors) does NOT need to be complete. You work entirely
with fixture data and defined types. The collectors feed the same
`ParsedSession` type you consume.

---

## Deliverables

### Core Types

**`src/engine/types.ts`**

Define all engine types here. This is the single source of truth for the
rules engine type system. Match exactly the contracts in `agents/CONTRACTS.md`.

```typescript
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type IssueType = 'crash' | 'freeze' | 'bsod' | 'app_hang'
export type SessionStatus = 'recording' | 'analyzing' | 'complete' | 'inconclusive' | 'error' | 'interrupted'

export interface TimeWindows { ... }
export interface EventRecord { ... }
export interface ProcessRecord { ... }
export interface MetricSample { ... }
export interface HardwareProfile { ... }
export interface ParsedSession { ... }

export interface SignalMatch {
  type: 'event' | 'metric' | 'process'
  description: string
  technical: string
  window: 'baseline' | 'incident' | 'aftermath'
  severity: 'critical' | 'supporting' | 'informational'
  ts: string
  seconds_before_marker: number
}

export interface FixStep {
  order: number
  title: string
  detail: string
  link?: string
}

export interface RuleResult {
  rulePackId: string
  fired: boolean
  confidence: Confidence | null
  signals: SignalMatch[]
  disqualifiedBy: string[]
  fixRecommendations: FixStep[]
  outputText: string
}

export interface AnalysisResult {
  id: string
  session_id: string
  outcome: 'diagnosed' | 'inconclusive' | 'error'
  primary_rule_pack_id: string | null
  primary_confidence: Confidence | null
  primary_cause_name: string | null
  primary_output_text: string | null
  secondary_results: RuleResult[]
  all_signals_found: SignalMatch[]
  fix_recommendations: FixStep[]
  inconclusive_reason: string | null
  created_at: string
}
```

---

### Rule Pack 1 — GPU Driver Instability / TDR

**File:** `src/engine/rules/gpu-driver.ts`

**Rule Pack ID:** `'gpu-driver'`

**Primary trigger (required to fire):**
Event ID 153 from provider `nvlddmkm` within the incident window OR
Event ID 4101 from provider `Display` within the incident window

**Supporting signals (boost confidence):**
- Event ID 14 or 13 from `nvlddmkm` (additional TDR events)
- Event ID 141 from `Microsoft-Windows-Kernel-PnP` (LiveKernelEvent)
- GPU utilization above 90% in any metric sample in the incident window
- Game process exit detected (last_seen within 5 seconds of incident_end)
- BSOD code 0x117 or 0x116 in Event ID 1001 message

**Confidence logic:**
- HIGH: Primary trigger + GPU util > 90% + game process exit detected
- HIGH: Primary trigger + 2 or more supporting signals
- MEDIUM: Primary trigger alone (no supporting signals)
- LOW: Event ID 141 only (no TDR event) + GPU util > 90%
- Does not fire: No primary trigger event in incident window

**Disqualification (sets fired = false or redirects):**
- Anti-cheat process exits before game process in incident window
  → disqualifiedBy: ['anti-cheat'] — redirect to Rule Pack 3
- Faulting module in Event ID 1000 matches overlay DLL list
  → disqualifiedBy: ['overlay-conflict'] — redirect to Rule Pack 2

**Fix recommendations (in order):**
1. Update GPU drivers — DDU clean install recommended
2. Check GPU temperatures with HWiNFO64
3. Reseat GPU power connectors
4. Test with GPU underclocked by 10%
5. Check for VBIOS updates from GPU manufacturer

**Output text templates:**

HIGH: "A GPU driver reset (TDR) was detected [N] seconds before the crash.
GPU utilization was at [X]% at the time. This strongly indicates GPU driver
instability or a hardware-level GPU fault."

MEDIUM: "A GPU driver timeout event was logged near the time of the crash.
This is consistent with driver instability, though other causes cannot be
ruled out without additional signal data."

---

### Rule Pack 2 — Overlay Conflict

**File:** `src/engine/rules/overlay-conflict.ts`

**Rule Pack ID:** `'overlay-conflict'`

**Known overlay process names** (check against process list):
```typescript
const OVERLAY_PROCESSES = [
  'Discord.exe', 'DiscordOverlay.exe',
  'steam.exe', 'GameOverlayUI.exe',
  'EpicGamesLauncher.exe',
  'GeForceExperience.exe', 'NVIDIA Share.exe', 'nvsphelper64.exe',
  'RadeonSoftware.exe', 'AMDRSServ.exe',
  'MSIAfterburner.exe', 'RTSS.exe',  // RivaTuner Statistics Server
  'OBS64.exe', 'obs-browser-plugin64.dll',
  'XboxGameBar.exe',
]
```

**Known overlay DLL names** (check against Event ID 1000 faulting module):
```typescript
const OVERLAY_DLLS = [
  'GameOverlayRenderer64.dll',
  'discord_overlay.dll', 'DiscordHook64.dll',
  'nvui.dll', 'nvspcap64.dll',
  'RTSS.dll', 'RTSSHooks64.dll',
  'obs-browser-plugin64.dll',
]
```

**Primary trigger (required to fire):**
Silent crash — game process exit detected with NO Event ID 1000 (Application Error)
AND NO BSOD event AND NO anti-cheat exit event

**Supporting signals:**
- 2 or more overlay processes active simultaneously during recording
- Faulting module in Event ID 1000 (if present) matches overlay DLL list
- Game crash occurred immediately after a known overlay event

**Confidence logic:**
- HIGH: Silent crash + faulting module matches overlay DLL + 2+ overlay processes
- MEDIUM: Silent crash + 2+ overlay processes active (no faulting module data)
- LOW: Silent crash + 1 overlay process active
- Does not fire: Event ID 1000 present with non-overlay faulting module

**Disqualification:**
- GPU TDR event present → disqualifiedBy: ['gpu-driver']
- Anti-cheat exit before game → disqualifiedBy: ['anti-cheat']

**Fix recommendations:**
1. Disable all overlays and test (Discord, Steam, GeForce Experience, Xbox Game Bar)
2. Re-enable overlays one at a time to identify the conflict
3. Update all overlay software to latest versions
4. If RTSS is installed, update or remove RivaTuner Statistics Server

**Output text templates:**

HIGH: "The game crashed silently — no exception was logged — and multiple
overlay programs were active at the time. The faulting module ([module name])
is a known overlay component. Overlay conflicts are the most likely cause."

MEDIUM: "The game crashed without generating a crash report, and [N] overlay
programs were running simultaneously. This pattern is consistent with an
overlay conflict, though it cannot be confirmed without faulting module data."

---

### Rule Pack 3 — Anti-Cheat Conflict

**File:** `src/engine/rules/anti-cheat.ts`

**Rule Pack ID:** `'anti-cheat'`

**Known anti-cheat process names:**
```typescript
const ANTI_CHEAT_PROCESSES = [
  'EasyAntiCheat.exe', 'EasyAntiCheat_EOS.exe',
  'BEService.exe', 'BELauncher.exe',  // BattlEye
  'nProtect.exe', 'GameGuard.des',    // nProtect GameGuard
  'vgc.exe', 'vgtray.exe',            // Valorant/Vanguard
  'ricochet.exe',                      // Call of Duty Ricochet
]
```

**Known anti-cheat event patterns:**
- Event ID 1 from `Microsoft-Windows-FilterManager`: anti-cheat driver unload
- EasyAntiCheat process exit with exit code 0xC0000005 (access violation)
- BEService.exe process exits before game process in incident window

**Primary trigger (required to fire):**
Anti-cheat process exits within the incident window before the game process exits.

**Supporting signals:**
- FilterManager Event ID 1 logged within 10 seconds of anti-cheat exit
- Anti-cheat exit code is non-zero (error exit, not clean shutdown)
- No BSOD event present (excludes kernel-level crashes)

**Confidence logic:**
- HIGH: Anti-cheat exits before game + FilterManager Event ID 1 + non-zero exit code
- MEDIUM: Anti-cheat exits before game + non-zero exit code (no FilterManager event)
- LOW: Anti-cheat exits before game with exit code 0 (clean — may be normal shutdown)
- Does not fire: Anti-cheat process not present during session

**Disqualification:**
- No anti-cheat process detected in session → does not fire
- GPU TDR event present and more recent than anti-cheat exit
  → disqualifiedBy: ['gpu-driver'] if TDR is within 5 seconds

**Fix recommendations:**
1. Verify anti-cheat software is up to date
2. Run the anti-cheat repair tool if available
3. Reinstall the game (anti-cheat requires clean game files)
4. Check Windows update — some anti-cheat drivers conflict with recent Windows updates
5. Check for conflicting security software (some AV products conflict with EAC/BE)

**Output text templates:**

HIGH: "The anti-cheat service ([process name]) stopped [N] seconds before the
game closed, and a driver unload event was logged at the same time. This
indicates the anti-cheat process terminated abnormally, causing the game to shut down."

MEDIUM: "The anti-cheat service exited before the game process ended. This is
consistent with an anti-cheat conflict, though without a driver event it cannot
be confirmed."

---

### Rule Pack 4 — Memory Exhaustion

**File:** `src/engine/rules/memory-exhaustion.ts`

**Rule Pack ID:** `'memory-exhaustion'`

**Primary trigger (required to fire):**
Event ID 2004 from `Microsoft-Windows-Resource-Exhaustion-Detector` during
the incident window OR commit charge above 95% of commit limit in metrics.

**Supporting signals:**
- RAM % above 90% sustained for 3 or more consecutive metric samples
- Game process is the top memory consumer (highest memory_mb in process list)
- OOM exception code `0xe00000008` in Event ID 1000 message
- Page file usage spike (disk latency > 300ms in incident window — page file thrashing)

**Confidence logic:**
- HIGH: Event ID 2004 + RAM > 90% sustained + game is top consumer
- MEDIUM: Event ID 2004 alone OR RAM > 95% in incident window
- LOW: RAM > 90% in incident window without Event ID 2004
- Does not fire: RAM below 85% throughout session

**Disqualification:**
- GPU TDR event present and RAM below 85% → disqualifiedBy: ['gpu-driver']

**Fix recommendations:**
1. Close background applications before gaming (browser tabs, streaming apps)
2. Check Windows Task Manager for memory leaks in other processes
3. Consider upgrading RAM if regularly above 90%
4. Reduce in-game texture quality settings to lower VRAM pressure
5. Check Windows page file size — auto-managed is recommended

**Output text templates:**

HIGH: "The system ran out of available memory during the session. Windows logged
a resource exhaustion event, RAM usage was at [X]% and [game] was the top memory
consumer. Memory exhaustion caused the crash."

MEDIUM: "RAM usage was critically high during the session ([X]% at peak). This
is consistent with memory exhaustion, though a definitive Windows resource event
was not logged."

---

### Rule Pack 5 — App Hang / Freeze

**File:** `src/engine/rules/app-hang.ts`

**Rule Pack ID:** `'app-hang'`

**Primary trigger (required to fire):**
Event ID 1002 from `Application Hang` in the Application log during or
shortly after the incident window (within 2 minutes of issue marker).

**Supporting signals:**
- Disk latency above 500ms in any metric sample during incident window
- Process marked as non-responsive (Event ID 1002 message contains the app name)
- CPU usage drops to near-zero for the game process while disk latency spikes
- Hang duration > 30 seconds before game closes

**Confidence logic:**
- HIGH: Event ID 1002 + disk latency > 500ms + app name matches
- MEDIUM: Event ID 1002 matching app name (no disk spike)
- LOW: Disk latency > 500ms in incident window with no Event ID 1002
- Does not fire: No Event ID 1002 and disk latency below 300ms

**Disqualification:**
- GPU TDR event present → disqualifiedBy: ['gpu-driver']
- Anti-cheat exit before hang → disqualifiedBy: ['anti-cheat']

**Fix recommendations:**
1. Check disk health with CrystalDiskInfo (high latency = disk problem)
2. Check for Windows Update or background indexing running during gaming
3. Verify the game is installed on an SSD, not a slow HDD
4. Run `chkdsk /scan` to check for disk errors
5. Check Task Manager for disk usage % during gaming

**Output text templates:**

HIGH: "The application stopped responding and was flagged as not responding
by Windows ([N] seconds into the session). Disk latency spiked to [X]ms at
the same time, suggesting a disk I/O bottleneck caused the freeze."

MEDIUM: "Windows logged an application hang event for [app name]. This
indicates the application stopped responding, though the underlying cause
(disk, CPU saturation, or software bug) could not be determined from the
available signals."

---

### Scorer

**File:** `src/engine/scorer.ts`

Applies the ranking logic from `docs/CLAUDE.md` (Confidence Scoring section).

```typescript
export function rankResults(results: RuleResult[]): {
  primary: RuleResult | null
  secondary: RuleResult[]
  outcome: 'diagnosed' | 'inconclusive'
  inconclusiveReason: string | null
}
```

Ranking logic (apply in order):
1. Filter to only `fired === true` results
2. If no results fired: return `{ primary: null, secondary: [], outcome: 'inconclusive' }`
3. Sort fired results by:
   a. Confidence: HIGH > MEDIUM > LOW
   b. Tiebreak: count of `signals` (more signals wins)
   c. Tiebreak: average `seconds_before_marker` (closer to crash wins)
   d. Tiebreak: presence of specific Event IDs over generic ones
4. If highest confidence is LOW only: return inconclusive
   (reason: "No rule pack reached MEDIUM confidence — signals present but insufficient")
5. If two results both reach MEDIUM or higher:
   - primary = highest ranked
   - secondary = [second result] labeled as contributing factor
6. Return the ranked output

---

### Analyzer Orchestrator

**File:** `src/engine/analyzer.ts`

```typescript
export function analyzeSession(session: ParsedSession): AnalysisResult
```

This function:
1. Runs all five `evaluate()` functions with the session
2. Passes all results to `rankResults()`
3. Assembles the `AnalysisResult` object
4. Returns it — does NOT write to database (that is the Pipeline's job)

All rule packs run every time. Disqualification is encoded in `RuleResult.disqualifiedBy`,
not by skipping rule packs. This ensures full transparency in the output.

---

### Fixture Files and Tests

Create fixtures for all five rule packs, minimum 3 per pack:

```
tests/fixtures/
├── gpu-driver/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   ├── no-match.json
│   └── disqualified-by-overlay.json
├── overlay-conflict/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   └── no-match.json
├── anti-cheat/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   └── no-match.json
├── memory-exhaustion/
│   ├── high-confidence.json
│   ├── medium-confidence.json
│   └── no-match.json
└── app-hang/
    ├── high-confidence.json
    ├── medium-confidence.json
    └── no-match.json
```

Use the fixture format from `docs/TESTING_STRATEGY.md` exactly.

**Unit test files** (one per rule pack + one for scorer):
- `tests/unit/engine/gpu-driver.test.ts`
- `tests/unit/engine/overlay-conflict.test.ts`
- `tests/unit/engine/anti-cheat.test.ts`
- `tests/unit/engine/memory-exhaustion.test.ts`
- `tests/unit/engine/app-hang.test.ts`
- `tests/unit/engine/scorer.test.ts`
- `tests/unit/engine/analyzer.test.ts`

Use the test template from `docs/TESTING_STRATEGY.md` exactly.

---

## Code Style Rules (from docs/CLAUDE.md)

- Zero `any` types — `ParsedSession` is your input, `RuleResult` is your output
- Named exports only — `export function evaluate(...)` not `export default`
- Every rule pack is a pure function — no side effects, no I/O, no state
- No imports from `electron`, `better-sqlite3`, or Node built-ins
- Conservative confidence — if in doubt, go MEDIUM not HIGH
- The `outputText` field must be human-readable plain language — no jargon

---

## Completion Gate

Phase 4 is complete when:
1. All unit tests pass: `npm test -- tests/unit/engine`
2. Zero skipped tests
3. Zero `any` types in `src/engine/`
4. Running `analyzeSession()` against each fixture produces the expected
   confidence level and `fired` state
5. All five rule packs return `fired: false` for their no-match fixtures

---

## When Complete

Update `agents/HANDOFF.md`:
1. Set Phase 4 status to COMPLETE
2. Set Gate Met to YES
3. Write Completion Certificate with test results
4. Note any signal ambiguities discovered that need DECISIONS.md updates

Phase 5 (Pipeline) depends on both Phase 3 and Phase 4. Notify that
Phase 4 is done so Phase 5 can start when Phase 3 also completes.
