// processes.ts — Process list collection via get-processes.ps1
//
// Polls every 5 seconds during a recording session.
// Tracks first_seen / last_seen and sets exit_detected when a process disappears.
// Privacy: process names only — no arguments, no file paths, no user info.

import path from 'path'
import type { ProcessRecord, ProcessSnapshot } from './types'
import { runPowerShellScript } from './powershell'

// ── Script path — relative to project root ────────────────────────────────────

const SCRIPT_PATH = path.join(
  __dirname,
  '..',
  '..',
  'scripts',
  'powershell',
  'get-processes.ps1'
)

// ── Raw shape returned by the PowerShell script ────────────────────────────────

interface RawProcess {
  Name?: unknown
  Id?: unknown
  cpu_pct?: unknown
  memory_mb?: unknown
}

// ── Name normalization ─────────────────────────────────────────────────────────

/**
 * Ensure process name has .exe suffix.
 * Get-Process returns names without extension — normalize for consistent matching.
 */
function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const name = raw.trim()
  // Privacy: name only — no arguments or file paths
  return name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`
}

// ── Parse raw JSON output from the PowerShell script ──────────────────────────

function parseProcessJson(json: string): ProcessSnapshot['processes'] {
  if (!json.trim()) return []

  try {
    const raw = JSON.parse(json) as unknown

    // PowerShell ConvertTo-Json wraps a single object outside an array
    const items: unknown[] = Array.isArray(raw) ? raw : [raw]

    const result: ProcessSnapshot['processes'] = []

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue
      const proc = item as RawProcess

      const name = normalizeName(proc.Name)
      if (!name) continue

      const pid =
        typeof proc.Id === 'number' ? proc.Id : parseInt(String(proc.Id ?? '0'), 10)
      const cpu_pct =
        typeof proc.cpu_pct === 'number'
          ? proc.cpu_pct
          : parseFloat(String(proc.cpu_pct ?? '0'))
      const memory_mb =
        typeof proc.memory_mb === 'number'
          ? proc.memory_mb
          : parseFloat(String(proc.memory_mb ?? '0'))

      result.push({
        name,
        pid: isNaN(pid) ? 0 : pid,
        cpu_pct: isNaN(cpu_pct) ? 0 : cpu_pct,
        memory_mb: isNaN(memory_mb) ? 0 : memory_mb,
      })
    }

    return result
  } catch (err) {
    console.error('[collector:processes] JSON parse error', err)
    return []
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Take a single snapshot of the running process list.
 * Returns { ts, processes: [] } on error — never throws.
 */
export async function snapshotProcesses(): Promise<ProcessSnapshot> {
  const ts = new Date().toISOString()

  try {
    const result = await runPowerShellScript(SCRIPT_PATH)

    if (result.exitCode !== 0) {
      console.error('[collector:processes] script failed', result.stderr)
      return { ts, processes: [] }
    }

    return { ts, processes: parseProcessJson(result.stdout) }
  } catch (err) {
    console.error('[collector:processes] snapshotProcesses error', err)
    return { ts, processes: [] }
  }
}

/**
 * Start polling the process list at a regular interval.
 * Tracks lifecycle (first_seen, last_seen, exit_detected) across snapshots.
 * Returns a stop function — call it to end polling.
 *
 * The onSnapshot callback receives each raw snapshot.
 * The caller (analysis pipeline) converts the ProcessRecord map to an array.
 */
export function startProcessPolling(
  onSnapshot: (snapshot: ProcessSnapshot) => void,
  intervalMs = 5_000
): () => void {
  // Track lifecycle across snapshots: key = process name (normalized)
  const lifecycle = new Map<
    string,
    { first_seen: string; last_seen: string; exit_detected: boolean }
  >()

  // Processes seen in the most recent snapshot (for exit detection)
  let previousNames = new Set<string>()

  let stopped = false

  const poll = async (): Promise<void> => {
    if (stopped) return

    const snapshot = await snapshotProcesses()
    const currentNames = new Set(snapshot.processes.map((p) => p.name))

    // Update lifecycle tracking
    for (const proc of snapshot.processes) {
      const existing = lifecycle.get(proc.name)
      if (!existing) {
        // First time we have seen this process
        lifecycle.set(proc.name, {
          first_seen: snapshot.ts,
          last_seen: snapshot.ts,
          exit_detected: false,
        })
      } else {
        existing.last_seen = snapshot.ts
        existing.exit_detected = false
      }
    }

    // Detect exits — processes in previous snapshot that are gone now
    for (const name of previousNames) {
      if (!currentNames.has(name)) {
        const entry = lifecycle.get(name)
        if (entry) {
          entry.exit_detected = true
        }
      }
    }

    previousNames = currentNames

    if (!stopped) {
      onSnapshot(snapshot)
    }
  }

  // Run immediately, then on interval
  void poll()
  const handle = setInterval(() => void poll(), intervalMs)

  return () => {
    stopped = true
    clearInterval(handle)
  }
}

/**
 * Convert the internal lifecycle map to a ProcessRecord[] for rule pack consumption.
 * Merges the latest metric values from the most recent snapshot with lifecycle data.
 */
export function buildProcessRecords(
  snapshots: ProcessSnapshot[]
): ProcessRecord[] {
  if (snapshots.length === 0) return []

  // Key: process name → lifecycle tracking
  const lifecycle = new Map<
    string,
    {
      pid: number
      cpu_pct: number
      memory_mb: number
      first_seen: string
      last_seen: string
      exit_detected: boolean
    }
  >()

  for (const snapshot of snapshots) {
    const currentNames = new Set(snapshot.processes.map((p) => p.name))

    for (const proc of snapshot.processes) {
      const existing = lifecycle.get(proc.name)
      if (!existing) {
        lifecycle.set(proc.name, {
          pid: proc.pid,
          cpu_pct: proc.cpu_pct,
          memory_mb: proc.memory_mb,
          first_seen: snapshot.ts,
          last_seen: snapshot.ts,
          exit_detected: false,
        })
      } else {
        existing.last_seen = snapshot.ts
        existing.cpu_pct = proc.cpu_pct
        existing.memory_mb = proc.memory_mb
        existing.pid = proc.pid
        existing.exit_detected = false
      }
    }

    // Mark exits — any process not in this snapshot
    for (const [name, entry] of lifecycle) {
      if (!currentNames.has(name) && !entry.exit_detected) {
        entry.exit_detected = true
      }
    }
  }

  const records: ProcessRecord[] = []
  for (const [name, entry] of lifecycle) {
    records.push({
      name,
      pid: entry.pid,
      cpu_pct: entry.cpu_pct,
      memory_mb: entry.memory_mb,
      first_seen: entry.first_seen,
      last_seen: entry.last_seen,
      exit_detected: entry.exit_detected,
    })
  }

  return records
}
