# Black Box — Project Context for Claude Code

## What This File Is
This is the master context file for the Black Box project. Read this entire file before writing
any code, generating any documentation, or making any architectural decisions. Every decision
made in every session must be consistent with what is defined here.

**Related docs:**
- `docs/PHASES.md` — build phases and current status
- `docs/V2-ROADMAP.md` — V2 feature vision (do not build any of this in V1)

---

## What Black Box Is

Black Box is a Windows desktop application that records system events during a PC crash or
problem, analyzes what happened using a rules-based engine grounded in real documented Windows
signals, and tells the user in plain language what most likely caused the issue and what to do
about it — with evidence and a confidence level attached to every conclusion.

It is not a system scanner. It is not a PC optimizer. It is not a tool that guesses without
evidence. It watches a specific problem happen, correlates real Windows signals against known
crash patterns, and produces a ranked diagnosis with actionable fix recommendations.

The one-line description: "Describe the problem. Record what happens. Black Box tells you
what went wrong and how to fix it."

The positioning analogy: "A flight recorder for PCs."

---

## Current Build Scope — V1 MVP ONLY

**This is a V1 MVP build. Do not suggest, scaffold, or build anything outside this scope.**

If a feature is not listed below it does not exist yet. Do not reference future features in
code comments, UI copy, or architecture decisions unless explicitly asked.

### V1 MVP Feature List

1. **Problem description intake** — user describes their issue, selects issue type
   (crash, freeze, BSOD, app hang), and names the app or game affected

2. **Session recorder** — user clicks Start Recording, reproduces the problem,
   clicks Stop Recording. Black Box captures everything in between.

3. **Issue marker** — a button the user can press at the exact moment something
   feels wrong during recording, used to anchor the incident window in analysis

4. **Analysis pipeline** — processes the captured session against the rules engine,
   normalizes the timeline, scores candidate causes, ranks results

5. **Results screen** — shows the top ranked cause with confidence level, the
   evidence that supports it, other possible causes, and ordered fix recommendations

6. **Exportable session report** — a plain text or markdown summary of the session
   the user can share on forums or with support

7. **Anonymous telemetry opt-in** — at first launch, user is asked if they want to
   contribute anonymous session data to improve Black Box. Opt-in only. Can be
   turned off in settings at any time.

8. **Unresolved session follow-up** — when analysis is inconclusive, Black Box
   schedules a follow-up notification asking if the user figured it out. One
   notification only. Not a recurring nag.

9. **Basic session history** — list of past sessions with issue type, date, and
   diagnosis outcome. Local only in V1.

### What Is NOT In V1 — Do Not Build or Reference

- Background Investigation Mode (V2)
- Resolution readback / "what changed while you fixed it" (V2)
- Script generation (V2)
- Community ticket system (V3)
- Bounty system (V4)
- AI fallback diagnosis via Claude API (V2)
- Manufacturer data partnerships (future)
- Multi-machine IT management (future)
- Supabase user accounts (V1 uses anonymous session IDs only)

---

## Tech Stack — Use Exactly This. Do Not Substitute.

### Frontend / App Shell
- **Electron** — desktop app shell for Windows
- **React 18** — UI framework
- **TypeScript** — throughout, strict mode enabled
- **Vite** — build tool for the renderer process
- **Tailwind CSS** — styling, utility classes only
- **Lucide React** — icons

### Data Layer (Local)
- **SQLite via better-sqlite3** — local session storage, synchronous API preferred
  for simplicity in V1
- **JSON / NDJSON** — raw trace file format for session event streams

### System Data Collection
- **PowerShell scripts** — called from Electron main process via Node child_process
  for Windows Event Log collection and system information queries
- **Node.js native bindings via node-windows or systeminformation** — process
  monitoring, CPU/RAM/disk metrics sampling
- **No ETW direct consumption in V1** — PowerShell Get-WinEvent is sufficient
  for V1 signal collection. Native ETW sidecar is V2.

### Backend (Telemetry Only in V1)
- **Supabase** — anonymous session telemetry upload, no user accounts in V1
- **Anonymous session ID** — generated locally at first launch, never tied to
  personal identity

### Notifications
- **Electron native notifications** — for unresolved session follow-up.
  No Twilio in V1.

### Testing
- **Vitest** — unit tests for rules engine logic
- **Playwright** — E2E tests for critical UI flows

---

## Project Folder Structure

```
black-box/
├── electron/
│   ├── main.ts              # Electron main process entry point
│   ├── preload.ts           # Preload script, contextBridge setup
│   └── ipc/                 # IPC handlers organized by domain
│       ├── recorder.ts
│       ├── analyzer.ts
│       └── telemetry.ts
├── src/
│   ├── components/          # React UI components
│   ├── screens/             # Full screen views
│   │   ├── Welcome.tsx
│   │   ├── Describe.tsx     # Problem intake
│   │   ├── Record.tsx       # Active recording screen
│   │   ├── Analyzing.tsx    # Processing state
│   │   ├── Results.tsx      # Diagnosis output
│   │   └── History.tsx      # Past sessions
│   ├── engine/              # Rules engine and analyzer
│   │   ├── analyzer.ts      # Main analysis orchestrator
│   │   ├── scorer.ts        # Cause scoring and ranking
│   │   ├── rules/           # Individual rule pack modules
│   │   │   ├── gpu-driver.ts
│   │   │   ├── overlay-conflict.ts
│   │   │   ├── anti-cheat.ts
│   │   │   ├── memory-exhaustion.ts
│   │   │   └── app-hang.ts
│   │   └── types.ts         # Shared engine types
│   ├── collectors/          # System data collection modules
│   │   ├── events.ts        # Windows Event Log collection
│   │   ├── processes.ts     # Process monitoring
│   │   ├── metrics.ts       # CPU/RAM/GPU/disk sampling
│   │   └── drivers.ts       # Driver inventory
│   ├── db/                  # SQLite database layer
│   │   ├── schema.ts        # Table definitions
│   │   ├── sessions.ts      # Session CRUD
│   │   └── migrations/
│   ├── telemetry/           # Anonymous data upload
│   │   ├── sanitizer.ts     # Strips anything identifiable before upload
│   │   └── uploader.ts
│   ├── hooks/               # React hooks
│   ├── store/               # App state (Zustand)
│   └── types/               # Global TypeScript types
├── scripts/
│   └── powershell/          # PowerShell collection scripts
│       ├── get-events.ps1
│       ├── get-processes.ps1
│       └── get-system-info.ps1
├── tests/
│   ├── unit/
│   │   └── engine/          # Rules engine unit tests
│   └── fixtures/            # Sample event log data for testing
├── CLAUDE.md                # This file
├── RULE_PACKS.md            # Rules engine specification (source of truth)
└── package.json
```

---

## Language and Terminology — Always Use These Terms

These are the canonical terms for this product. Use them consistently in code,
comments, UI copy, and documentation. Never substitute synonyms.

| Use This | Never This |
|----------|------------|
| **session** | log, recording, capture, trace |
| **confidence level** | score, probability, certainty, rating |
| **Investigation Mode** | background mode, passive mode, monitoring mode |
| **issue marker** | timestamp, flag, bookmark, event pin |
| **cause** | culprit, reason, error, problem source |
| **signal** | event, log entry, indicator, data point |
| **rule pack** | rule set, detection module, pattern |
| **fix recommendations** | solutions, suggestions, steps, advice |
| **session report** | log export, diagnostic export, summary |
| **confidence: HIGH / MEDIUM / LOW** | high confidence / medium / low (always caps) |
| **incident window** | crash window, failure window, event window |
| **baseline window** | normal window, pre-crash period |
| **aftermath window** | post-crash period, recovery window |

---

## Rules Engine — Core Philosophy

This is the most important section. Every decision about the rules engine must
follow these principles.

### Evidence First, Always
Black Box never concludes without evidence. If a rule pack fires it must point
to specific signals — Event IDs, process states, metric values — that justify
the conclusion. A cause is never suggested because it is common. It is suggested
because the session data supports it.

### Conservative Confidence
When in doubt, report lower confidence. A LOW confidence result with honest
uncertainty language is more trustworthy than a HIGH confidence result that
turns out to be wrong. Trust is the entire product. Overconfidence destroys it.

### Show the Reasoning
Every diagnosis must include the evidence that produced it. Not just "GPU driver
instability detected" — but "Event ID 153 from nvlddmkm was logged 12 seconds
before the game process exited, and GPU utilization was at 94% in the incident
window." Users must be able to verify the reasoning themselves.

### Inconclusive Is Valid
If no rule pack reaches MEDIUM confidence, the correct output is inconclusive.
Never force a diagnosis when the evidence doesn't support one. Inconclusive with
a full session report is more useful than a confident wrong answer.

### Disqualification Matters
Every rule pack has signals that disqualify it or redirect to another rule pack.
The analysis is not just about finding matches — it is about ruling things out.
A diagnosis is stronger when it has explicitly eliminated other candidates.

---

## Rule Packs — V1 Coverage

Five rule packs are in scope for V1. Full signal specifications are in RULE_PACKS.md.
Always reference RULE_PACKS.md as the source of truth for signal logic.

### Rule Pack 1 — GPU Driver Instability / TDR
Primary signals: Event ID 153, 14, 13 (nvlddmkm), Event ID 4101 (Display),
Event ID 141 (LiveKernelEvent), BSOD codes 0x117 and 0x116
Key pattern: TDR event within 60 seconds of game process exit + GPU util above 90%

### Rule Pack 2 — Overlay Conflict
Primary signals: Silent crash (no dump, no exception code), faulting module
matches overlay DLL list, multiple overlay processes active simultaneously
Key pattern: Silent crash + 2 or more overlay processes confirmed active

### Rule Pack 3 — Anti-Cheat Conflict
Primary signals: FilterManager Event ID 1 (anti-cheat service unload at crash
time), anti-cheat process exits before game process, EAC exit code 0xC0000005
Key pattern: Anti-cheat service stops immediately before game process exits

### Rule Pack 4 — Memory Exhaustion
Primary signals: Event ID 2004 (Resource-Exhaustion-Detector), commit charge
above 95% of limit, OOM exception code 0xe00000008
Key pattern: Event 2004 + game is top memory consumer + RAM above 90% sustained

### Rule Pack 5 — App Hang / Freeze
Primary signals: Event ID 1002 (Application Hang), process marked non-responsive
Key pattern: Event 1002 + disk latency spike above 500ms in incident window

---

## Time Windows — Always Apply These Definitions

Every analysis uses these three windows relative to the issue marker or detected
crash point. These definitions are fixed and must be used consistently across
all rule packs and analysis code.

- **Baseline window**: 5 minutes before the issue marker
- **Incident window**: 60 seconds before the issue marker to the crash point
- **Aftermath window**: 2 minutes after the crash point or system recovery

---

## Confidence Scoring — Fixed Logic

When multiple rule packs fire in the same session use this ranking logic in order:

1. Most confirmed signals wins
2. Timing proximity to crash point wins (signals closer to crash rank higher)
3. Specific Event ID beats generic Event ID (153 = TDR beats 1001 = generic WER)
4. HIGH confidence beats MEDIUM even with fewer total signals

When two rule packs both reach MEDIUM or higher confidence report both:
- Primary cause: highest confidence / most signals
- Contributing factor: second cause labeled clearly as secondary

When no rule pack reaches MEDIUM confidence report inconclusive. Never force
a primary cause when the evidence does not support one.

---

## Privacy — Non-Negotiable Rules

These rules apply to every line of code that touches user data.

**Never collect:**
- Any personally identifiable information
- File names or file contents
- Screenshots or screen recordings
- Usernames, account names, or profile data
- Geographic location beyond country/region (optional, never required)
- Browsing history or non-system-event application data

**Only collect with explicit opt-in:**
- Anonymous session ID (generated locally, never tied to identity)
- Which Event IDs fired during the session
- Process names only (not process arguments or file paths)
- System metrics (numbers only — CPU%, RAM bytes, GPU%, disk latency)
- Hardware profile (GPU model, driver version, OS version, RAM total)
- Diagnosis outcome (which rule pack fired, confidence level)
- User confirmation response (yes / no / partial / no response)

**Sanitizer requirement:**
Every telemetry upload must pass through `telemetry/sanitizer.ts` before
leaving the machine. The sanitizer is responsible for stripping anything
not on the allowed list above. No exceptions. No bypasses.

---

## UI Tone and Copy Guidelines

Black Box is a serious technical tool for people who are frustrated. The UI
copy must be:

- **Direct** — say what it found, not what it might have found
- **Honest** — never claim more confidence than the evidence supports
- **Human** — translate technical signals into plain language always
- **Calm** — the user is already frustrated, do not add alarm or urgency
- **Specific** — reference actual findings, not generic diagnostic language

### Example Copy Patterns

**Good HIGH confidence output:**
"A GPU driver reset was detected 12 seconds before the crash. GPU utilization
was at 94% at the time. This strongly indicates GPU driver instability."

**Good MEDIUM confidence output:**
"A GPU driver timeout event was logged near the time of the crash. This is
consistent with driver instability, though other causes cannot be ruled out."

**Good inconclusive output:**
"Black Box couldn't identify the cause with enough confidence to recommend
a specific fix. Here's what was found during the session — you can take this
report to a forum or support channel for additional help."

**Never write:**
- "Your PC has a serious problem"
- "Critical error detected"
- "We found the issue!" (before confirming with evidence)
- "This is definitely caused by..." (unless confidence is HIGH and evidence is strong)

---

## Code Style Rules

- TypeScript strict mode always on
- No `any` types — use `unknown` and narrow properly
- Async/await preferred over raw Promises
- Named exports preferred over default exports for engine modules
- Every rule pack module exports a single `evaluate(session: Session): RuleResult` function
- Error handling: never swallow errors silently, always log with context
- Comments: explain why, not what — the code shows what, the comment shows intent
- PowerShell scripts: include error handling and return structured JSON always

---

## What To Do When Uncertain

If a requirement is ambiguous or a decision is not covered by this file:

1. Default to the most conservative option (less collection, lower confidence claim,
   simpler implementation)
2. Flag the ambiguity in a comment with `// DECISION NEEDED:` prefix
3. Do not invent requirements — ask before assuming

If a feature request appears to be outside V1 MVP scope:

1. Note that it is a future feature
2. Do not scaffold or stub it
3. Do not design the current architecture around it unless it is explicitly
   mentioned as a V2 consideration in this file

---

## The One Thing To Never Do

Do not build the platform. Build the tool.

V1 is a session recorder with a rules engine and a results screen. Everything
else comes after V1 proves the core loop works. Stay inside the scope defined
in this file. The vision is real and the platform will be built — but not until
the foundation is solid.

Every great platform started as a focused tool that did one thing well enough
that people trusted it. That is what V1 is for.
