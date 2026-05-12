# Agent: COLLECTORS

## Role

You are responsible for Phase 3 of the Black Box V1 build: all system data
collection modules. You implement the Node.js modules that query Windows
Event Log via `wevtutil.exe`, the PowerShell scripts for process and hardware
data, and the metrics sampler that polls CPU/RAM/GPU/disk during recording.

This is Windows-specific code. Every collector must handle errors gracefully
and return structured typed data. The rules engine depends entirely on the
quality of data you collect.

---

## Mandatory Reading (Do This First, Every Session)

1. `docs/CLAUDE.md` — Tech stack, privacy rules, code style
2. `docs/PHASES.md` — Phase 3 deliverables and completion gate
3. `docs/DECISIONS.md` — ADR-002, ADR-011, ADR-012 (read ADR-012 in full)
4. `docs/TESTING_STRATEGY.md` — Fixture format for collector parsers
5. `agents/HANDOFF.md` — Confirm Phase 2 is COMPLETE before starting
6. `agents/CONTRACTS.md` — Contract 2 (ParsedSession), Contract 9 (TraceRecord types)

---

## Prerequisites

Before you begin, verify in HANDOFF.md:

- [ ] Phase 2 (Data Layer) status is COMPLETE
- [ ] OD-001 is resolved (use `systeminformation` for GPU metrics)
- [ ] OD-002 is resolved (wevtutil.exe for event log — see ADR-012)
- [ ] `src/collectors/` directory exists

If prerequisites are not met, stop and write a Blocker in HANDOFF.md.

---

## Deliverables

### npm Install
```
npm install systeminformation fast-xml-parser
```

`fast-xml-parser` is used to parse wevtutil XML output.
`systeminformation` is used for GPU, CPU, RAM, and disk metrics.

---

## Event Log Collection — wevtutil.exe (Primary)

**Do not use PowerShell for event log collection.** See ADR-012.

`wevtutil.exe` is a built-in Windows executable. It is not subject to
PowerShell execution policy. It is available on every Windows machine.

### `src/collectors/wevtutil.ts`

Internal utility. Not exported beyond the collectors domain.

```typescript
import { spawn } from 'child_process'

interface WevtutilResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function queryEventLog(
  logName: 'System' | 'Application',
  eventIds: number[],
  startTime: Date,
  maxCount = 500
): Promise<WevtutilResult>
```

Implementation notes:
- Executable: `wevtutil.exe` — do not qualify with a path, it is always on PATH
- Arguments: `qe`, logName, `/q:...`, `/f:XML`, `/rd:true`, `/c:${maxCount}`
- XPath query format:
  ```
  *[System[(EventID=153 or EventID=14 or ...) and TimeCreated[@SystemTime>='2024-01-15T14:00:00.000Z']]]
  ```
- Build the `EventID=N` OR chain from the `eventIds` array
- Timestamp format for XPath must be ISO 8601 UTC: `startTime.toISOString()`
- Collect stdout line by line into a string buffer
- Enforce 30-second timeout — kill the process if exceeded
- Never throw — return the exitCode and stderr for the caller to handle

```typescript
export function buildXPathQuery(eventIds: number[], startTime: Date): string {
  const idFilter = eventIds.map(id => `EventID=${id}`).join(' or ')
  const timeFilter = `TimeCreated[@SystemTime>='${startTime.toISOString()}']`
  return `*[System[(${idFilter}) and ${timeFilter}]]`
}
```

### `src/collectors/events.ts`

```typescript
export async function collectEvents(
  startTime: Date,
  endTime?: Date
): Promise<EventRecord[]>
```

Flow:
1. Call `queryEventLog('System', SYSTEM_EVENT_IDS, startTime)` via wevtutil
2. Call `queryEventLog('Application', APP_EVENT_IDS, startTime)` via wevtutil
3. Parse both XML results with `fast-xml-parser`
4. Map parsed nodes to `EventRecord[]`
5. Filter by `endTime` if provided (wevtutil doesn't support end time in XPath easily)
6. Sort by timestamp ascending
7. Return combined array

```typescript
const SYSTEM_EVENT_IDS = [153, 14, 13, 4101, 141, 1001, 2004, 1]
const APP_EVENT_IDS    = [1000, 1002]
```

XML parsing with `fast-xml-parser`:
```typescript
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function parseWevtutilXml(xml: string): EventRecord[] {
  if (!xml.trim()) return []

  const parsed = parser.parse(`<Events>${xml}</Events>`)
  const events = Array.isArray(parsed.Events?.Event)
    ? parsed.Events.Event
    : parsed.Events?.Event
      ? [parsed.Events.Event]
      : []

  return events.map((e: unknown) => mapEventNode(e)).filter(Boolean)
}

function mapEventNode(node: unknown): EventRecord | null {
  // Extract from node.System: Provider @_Name, EventID, Level, TimeCreated @_SystemTime, Channel
  // Extract message from node.EventData.Data (may be string or array — take first)
  // Map Level integer: 1=Critical→Error, 2=Error, 3=Warning, 4=Information
  // Return null if any required field is missing — filter(Boolean) drops nulls
}
```

The `EventRecord` shape must match Contract 9 in `agents/CONTRACTS.md` exactly:
```typescript
{
  type: 'event',
  ts: string,           // from TimeCreated @_SystemTime
  source: string,       // from Channel ('System' | 'Application')
  provider: string,     // from Provider @_Name
  event_id: number,     // from EventID
  level: string,        // mapped from Level integer
  message: string,      // from first EventData/Data element
  collected_at: string, // new Date().toISOString() at parse time
}
```

```typescript
export async function getEventCollectionStatus(): Promise<{
  available: boolean
  error: string | null
}>
```

Tests whether wevtutil is reachable by running a trivial query.
Returns `{ available: false, error: 'wevtutil not found' }` if spawn fails.
This should never fail on any Windows machine — log a warning if it does.

---

## Process Collection — PowerShell (Secondary)

PowerShell is used here because `wevtutil` cannot list processes.
Uses `-Command` inline (not `-File`) for extra resilience against GPO
configurations that block `.ps1` files but allow inline commands.

### `scripts/powershell/get-processes.ps1`

Returns all running processes with CPU% and memory as JSON.

```powershell
$processes = Get-Process | Select-Object Name, Id,
  @{N='cpu_pct'; E={[math]::Round($_.CPU, 1)}},
  @{N='memory_mb'; E={[math]::Round($_.WorkingSet64 / 1MB, 1)}}
$processes | ConvertTo-Json -Compress
```

Output format:
```json
[
  { "Name": "Discord", "Id": 4821, "cpu_pct": 1.2, "memory_mb": 284 }
]
```

Note: `Get-Process` returns `Name` without `.exe` extension. The collector
module must normalize: append `.exe` if not already present.

### `src/collectors/processes.ts`

```typescript
export async function snapshotProcesses(): Promise<ProcessSnapshot>
```

Calls `get-processes.ps1` via the PowerShell runner. Returns typed snapshot
with timestamp. On error: returns `{ ts: now, processes: [] }` and logs error.

```typescript
export function startProcessPolling(
  onSnapshot: (snapshot: ProcessSnapshot) => void,
  intervalMs = 5000
): () => void
```

- Calls `snapshotProcesses()` every `intervalMs` milliseconds
- Tracks `first_seen` and `last_seen` per process name across snapshots
- Sets `exit_detected = true` when a process disappears from the list
- Returns a stop function that clears the interval

---

## Hardware Profile — PowerShell (Secondary)

### `scripts/powershell/get-system-info.ps1`

Returns hardware profile as JSON. Called once at session start.

```powershell
$gpu = Get-WmiObject Win32_VideoController | Select-Object -First 1
$os = Get-WmiObject Win32_OperatingSystem
$ram = [math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1MB)

@{
  gpu_model          = $gpu.Caption
  gpu_driver_version = $gpu.DriverVersion
  os_version         = "$($os.Caption) $($os.BuildNumber)"
  ram_total_mb       = $ram
} | ConvertTo-Json -Compress
```

### `src/collectors/drivers.ts`

```typescript
export async function getHardwareProfile(): Promise<HardwareProfile>
```

Calls `get-system-info.ps1` via the PowerShell runner.
On error (policy block or WMI failure): returns a `HardwareProfile` with
all string fields set to `'unknown'` and `ram_total_mb` set to `0`.
Never throws. Never returns null.

---

## Metrics Sampling — systeminformation (No PowerShell)

### `src/collectors/metrics.ts`

```typescript
export function startMetricsSampling(
  onSample: (sample: MetricSample) => void,
  intervalMs = 10000
): () => void
```

Uses `systeminformation` exclusively — no PowerShell involved:

```typescript
import si from 'systeminformation'

async function takeSample(): Promise<MetricSample> {
  const [load, mem, disk, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.disksIO(),
    si.graphics(),
  ])

  const gpu = graphics.controllers[0]

  return {
    ts: new Date().toISOString(),
    cpu_pct: Math.round(load.currentLoad * 10) / 10,
    ram_used_mb: Math.round(mem.active / (1024 * 1024)),
    ram_total_mb: Math.round(mem.total / (1024 * 1024)),
    ram_pct: Math.round((mem.active / mem.total) * 1000) / 10,
    disk_latency_ms: disk.rIO_sec ?? 0,
    gpu_pct: gpu?.utilizationGpu ?? 0,
    vram_used_mb: gpu?.memoryUsed ?? 0,
    vram_total_mb: gpu?.memoryTotal ?? 0,
  }
}
```

If `gpu.utilizationGpu` is undefined (some drivers don't expose it), log
a one-time warning and use `0`. Do not crash or skip the sample.

---

## PowerShell Runner (for process + hardware scripts only)

### `src/collectors/powershell.ts`

Internal utility. Not exported beyond the collectors domain.

```typescript
export async function runPowerShellScript(
  scriptPath: string,
  args: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number }>
```

- Command: `powershell.exe -ExecutionPolicy Bypass -NonInteractive -File <scriptPath> <args>`
- 30-second timeout — kill the process if exceeded
- Never throws — returns exitCode and stderr for the caller to handle
- On ExecutionPolicy block (detected via stderr containing "not digitally signed"
  or "execution of scripts is disabled"): log a warning, return
  `{ stdout: '', stderr: message, exitCode: 1 }`

The caller (`processes.ts`, `drivers.ts`) handles the error and returns
safe empty/default values. Event log collection never touches this runner.

---

## Fixture Data and Tests

**`tests/fixtures/collectors/events-sample.json`**
A realistic `EventRecord[]` array. Include at least one event from each
of the key providers: `nvlddmkm`, `Microsoft-Windows-FilterManager`,
`Application Error`, `Application Hang`.

**`tests/fixtures/collectors/processes-sample.json`**
A realistic `ProcessSnapshot`. Include at least 5 processes including
`Discord.exe`, `steam.exe`, `EasyAntiCheat.exe`.

**`tests/fixtures/collectors/wevtutil-system-output.xml`**
Raw wevtutil XML output for the System log. Use realistic Event ID 153
and 141 data. Used to test the XML parser in isolation.

**`tests/unit/collectors/events.test.ts`**
Tests the XML parser and mapper in isolation — does NOT spawn wevtutil:
- `parseWevtutilXml` correctly maps a valid XML string to `EventRecord[]`
- `parseWevtutilXml` returns `[]` for empty input
- `parseWevtutilXml` returns `[]` for malformed XML (does not throw)
- Single event node (not array) is handled correctly
- Level integer maps to correct string: `2 → 'Error'`, `3 → 'Warning'`
- Provider name is extracted from the XML attribute correctly

**`tests/unit/collectors/metrics.test.ts`**
Tests that metric samples match the `MetricSample` interface shape.
Mock `systeminformation` — do not call real hardware APIs in tests.

**`tests/unit/collectors/wevtutil.test.ts`**
Tests `buildXPathQuery`:
- Correct OR chain for multiple event IDs
- Correct ISO timestamp in the TimeCreated filter
- Single event ID produces valid XPath (no trailing `or`)

---

## Privacy Rules (from docs/CLAUDE.md)

**Collect only:**
- Event IDs, providers, and level — trim message text to 500 chars max
- Process names only — normalize to include `.exe` suffix
- Numeric metrics: CPU%, RAM MB, GPU%, disk latency ms
- Hardware profile: GPU model, driver version, OS version, RAM total

**Never collect:**
- Full event message text beyond 500 characters
- Process command-line arguments or file paths
- Usernames from process ownership or WMI queries
- Network state or open connections
- Registry values or file system contents

---

## Code Style Rules

- TypeScript strict mode — zero `any` types
- All collector functions are async
- All external calls (wevtutil, PowerShell, systeminformation) wrapped in
  try/catch — never propagate uncaught errors to callers
- Log errors as `console.error('[collector:events]', error)` with module prefix
- Named exports only
- No side effects at module level — all init happens inside function calls

---

## Completion Gate

Phase 3 is complete when:
1. `npm test -- tests/unit/collectors` passes with zero failures
2. Running the collector modules on a real Windows machine returns structured
   JSON with no errors (verify via a quick test script in `scripts/`)
3. `wevtutil.exe` returns parsed events correctly on the test machine
4. `get-processes.ps1` and `get-system-info.ps1` execute without errors
5. The trace file written during a manual test run is valid NDJSON

---

## When Complete

Update `agents/HANDOFF.md`:
1. Set Phase 3 status to COMPLETE
2. Set Gate Met to YES
3. Write Completion Certificate with test results
4. Note any Windows-specific behaviors discovered that affect Phase 5

Phase 5 (Pipeline) depends on both Phase 3 and Phase 4. Notify that
Phase 3 is done so Phase 5 can start when Phase 4 also completes.
