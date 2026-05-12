# Agent: TELEMETRY

## Role

You are responsible for Phase 9 of the Black Box V1 build: anonymous
session telemetry. You implement the sanitizer that strips any personally
identifiable information before data leaves the machine, the uploader that
sends clean data to Supabase, and the opt-in flow shown at first launch.

Privacy is non-negotiable. Every line of code you write that touches user
data must conform to the rules in `docs/CLAUDE.md` Privacy section.
The sanitizer is the last gate before any data reaches the internet.
It must be aggressive — strip everything not explicitly allowed.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — Privacy rules section (read in full — this is your spec)
2. `docs/PHASES.md` — Phase 9 deliverables and completion gate
3. `docs/DATA_SCHEMA.md` — Supabase `bb_sessions` table schema
4. `docs/DECISIONS.md` — ADR-006 (write-only telemetry), ADR-007 (no accounts)
5. `agents/HANDOFF.md` — Confirm Phase 7 is COMPLETE
6. `agents/CONTRACTS.md` — Contract 4 (AnalysisResult), Contract 6 (AppSettings)

---

## Prerequisites

Before you begin, verify in HANDOFF.md:

- [ ] Phase 7 (Results Screen) status is COMPLETE
- [ ] Supabase project is set up and `bb_sessions` table created
   (if not set up, create it using the schema from docs/DATA_SCHEMA.md)

---

## Environment Setup

The Supabase URL and anon key must be environment variables, not hardcoded.
They go in a `.env` file at project root (already in `.gitignore`):

```
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=[anon key]
```

These are read in the main process only. The renderer never touches Supabase.

Install Supabase client:
```
npm install @supabase/supabase-js
```

---

## Deliverables

### Sanitizer

**`src/telemetry/sanitizer.ts`**

```typescript
export interface SanitizedSession {
  client_session_id: string       // anonymous session ID (last 8 chars only? No — full anonymous ID)
  anonymous_device_id: string     // from settings.anonymous_session_id
  app_version: string
  issue_type: string
  os_version: string
  gpu_model: string | null
  gpu_driver_version: string | null
  ram_total_gb: number | null
  event_ids_fired: EventIdSummary[]
  overlay_processes: string[] | null
  anti_cheat_processes: string[] | null
  metrics_summary: MetricsSummary | null
  diagnosis_outcome: string
  primary_rule_pack_id: string | null
  primary_confidence: string | null
}

interface EventIdSummary {
  event_id: number
  provider: string
  count: number
}

interface MetricsSummary {
  peak_cpu_pct: number
  peak_ram_pct: number
  peak_gpu_pct: number
}

export function sanitizeSession(
  session: Session,
  result: AnalysisResult,
  settings: AppSettings,
  hardware: HardwareProfile,
  allSignals: SignalMatch[]
): SanitizedSession
```

**What the sanitizer must strip (never pass through):**
- `session.description` — free text, may contain PII
- `session.app_name` — user-entered, may contain file path or username
- `session.trace_file_path` — contains filesystem path with username
- Any process arguments or command-line strings
- Any file paths or directory paths
- Full session UUID (only the `client_session_id` field = full local session ID
  for anonymous correlation, never tied to identity since device ID is random)
- Any message text from Windows Events (may contain file paths or usernames)
  Only pass through: event_id numbers, provider names, counts

**What the sanitizer allows (explicit allowlist):**
- `event_ids_fired`: array of `{ event_id: number, provider: string, count: number }`
  — NO message text, NO timestamp, just the ID + count
- `overlay_processes`: process names only from the known overlay list
  — never an arbitrary process name, only names in the OVERLAY_PROCESSES list
- `anti_cheat_processes`: same rule — only names in ANTI_CHEAT_PROCESSES list
- `metrics_summary`: peak values only (3 numbers)
- `hardware`: gpu_model, gpu_driver_version, os_version, ram_total_gb
- `diagnosis_outcome`: the string outcome
- `primary_rule_pack_id`, `primary_confidence`: rule engine output strings

**Sanitizer test:** Run the output through a second pass validator:
```typescript
export function validateSanitized(data: SanitizedSession): { valid: boolean; violations: string[] }
```
This checks that no field contains filesystem separators (`/`, `\`),
no field contains `@` (email indicator), no field contains `Users` or
`AppData` (path fragments), no field is longer than 200 characters.

### Uploader

**`src/telemetry/uploader.ts`**

```typescript
export async function uploadSession(
  sessionId: string
): Promise<{ success: boolean; error?: string }>
```

Flow:
1. Get settings — if `telemetry_opt_in === false`, return `{ success: false }` immediately
2. Get session from DB by sessionId
3. Get analysis result from DB
4. Get hardware profile (cached from session, or query again)
5. Pass everything through `sanitizeSession()`
6. Validate the sanitized output — if any violations, log and abort upload
7. Upload to Supabase `bb_sessions` table
8. Return `{ success: true }` on success
9. On any error: log locally, return `{ success: false, error: message }` — NEVER throw
10. Upload failure must be completely silent to the user

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env['VITE_SUPABASE_URL']!,
  process.env['VITE_SUPABASE_ANON_KEY']!
)
```

The upload is fire-and-forget from the UI's perspective. The PIPELINE calls
`uploadSession()` after `createAnalysisResult()` completes, but does not
await it blocking the UI. Handle it as a background task.

### IPC Handler

**`electron/ipc/telemetry.ts`** (replace the stub)

```typescript
export function registerTelemetryHandlers(): void
```

Handle these channels:
- `telemetry:upload` → calls `uploadSession(sessionId)`
- `settings:get` → returns `getSettings()` from DB
- `settings:set-telemetry-opt-in` → calls `setTelemetryOptIn(optIn)`

### First Launch Opt-In

**`src/components/TelemetryOptIn.tsx`**

A modal overlay shown once at first launch before the user can do anything.
If `settings.first_launch_complete === false`, this renders on top of Welcome.

Content:
- Heading: "Help improve Black Box"
- Body copy:
  "Black Box can anonymously share crash data to help improve future diagnoses.
  No personal information is collected. Only: which Windows events fired, process
  names, hardware model, and diagnosis outcome. You can change this in Settings at
  any time."
- Two buttons:
  - "Yes, share anonymously" (primary)
  - "No thanks" (secondary)

Behavior:
- Either button → `setTelemetryOptIn(chosen)` then `markFirstLaunchComplete()` via IPC
- After both DB writes: dismiss modal, allow navigation
- Never show again once `first_launch_complete === true`

Wire this into `src/App.tsx` — show it conditionally based on settings.

### Settings Toggle (for Phase 12)

**`src/components/TelemetryToggle.tsx`**

Simple toggle component for the Settings screen (Phase 12 wires it).

```typescript
interface TelemetryToggleProps {
  currentValue: boolean
  onChange: (value: boolean) => void
}
```

---

## Tests

**`tests/unit/telemetry/sanitizer.test.ts`**

Test cases:
- Session with description → description stripped from output
- Signal messages containing file paths → messages not in output
- Process names not in overlay/anti-cheat lists → not included
- Output passes `validateSanitized()` check
- GPU model and OS version pass through correctly
- Metrics peak values computed correctly from sample array
- `client_session_id` is the session ID (not truncated — it's already anonymous)

---

## Completion Gate

Phase 9 is complete when:
1. `npm test -- tests/unit/telemetry` passes with zero failures
2. With opt-in enabled: completing a session results in a new row in
   Supabase `bb_sessions` containing only allowed fields
3. Inspecting the uploaded row confirms: no description text, no file paths,
   no usernames, no full event messages
4. With opt-in disabled: no upload occurs (confirmed via Supabase dashboard)
5. Telemetry opt-in modal shows on first launch and never again after

---

## When Complete

Update `agents/HANDOFF.md`:
1. Set Phase 9 status to COMPLETE
2. Set Gate Met to YES
3. Write Completion Certificate noting Supabase upload was verified
