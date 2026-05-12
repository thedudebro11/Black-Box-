// wevtutil.ts — Windows Event Log query via wevtutil.exe
//
// wevtutil.exe is a built-in Windows executable on every system since Vista.
// It is NOT subject to PowerShell execution policy — see ADR-012 in docs/DECISIONS.md.
// This module is internal to the collectors domain and not exported beyond it.

import { spawn } from 'child_process'

// ── Types ──────────────────────────────────────────────────────────────────────

interface WevtutilResult {
  stdout: string
  stderr: string
  exitCode: number
}

// ── XPath query builder ────────────────────────────────────────────────────────

/**
 * Build a wevtutil-compatible XPath 1.0 query string.
 * Filters by a list of event IDs and a start time.
 *
 * Example output:
 *   *[System[(EventID=153 or EventID=14) and TimeCreated[@SystemTime>='2024-01-01T00:00:00.000Z']]]
 */
export function buildXPathQuery(eventIds: number[], startTime: Date): string {
  const idFilter = eventIds.map((id) => `EventID=${id}`).join(' or ')
  const timeFilter = `TimeCreated[@SystemTime>='${startTime.toISOString()}']`
  return `*[System[(${idFilter}) and ${timeFilter}]]`
}

// ── Event log query ────────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000

/**
 * Query a Windows Event Log channel using wevtutil.exe.
 *
 * Uses /f:XML to get structured output, /rd:true to read oldest-first,
 * and /c to cap results. Returns raw stdout + stderr + exit code.
 * Never throws — callers handle errors via exitCode and stderr.
 */
export async function queryEventLog(
  logName: 'System' | 'Application',
  eventIds: number[],
  startTime: Date,
  maxCount = 500
): Promise<WevtutilResult> {
  return new Promise<WevtutilResult>((resolve) => {
    const xpathQuery = buildXPathQuery(eventIds, startTime)
    const args = [
      'qe',
      logName,
      `/q:${xpathQuery}`,
      '/f:XML',
      '/rd:true',
      `/c:${maxCount}`,
    ]

    let stdout = ''
    let stderr = ''
    let settled = false

    let child: ReturnType<typeof spawn>

    try {
      child = spawn('wevtutil.exe', args)
    } catch (err) {
      // spawn itself failed — wevtutil not on PATH (should never happen on Windows)
      console.error('[collector:wevtutil] spawn failed', err)
      resolve({ stdout: '', stderr: String(err), exitCode: 1 })
      return
    }

    // Kill after 30 seconds — pathological queries or a frozen wevtutil process
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          child.kill()
        } catch {
          // ignore kill errors
        }
        console.error('[collector:wevtutil] timeout after 30s for log', logName)
        resolve({ stdout, stderr: 'timeout', exitCode: 1 })
      }
    }, TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ stdout, stderr, exitCode: code ?? 1 })
      }
    })

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        console.error('[collector:wevtutil] process error', err)
        resolve({ stdout: '', stderr: String(err), exitCode: 1 })
      }
    })
  })
}
