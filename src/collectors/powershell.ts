// powershell.ts — PowerShell runner for process and hardware scripts only
//
// This runner is ONLY used by processes.ts and drivers.ts.
// Event log collection uses wevtutil.ts directly — see ADR-012.
//
// Uses -ExecutionPolicy Bypass as an additional resilience layer.
// If still blocked by GPO, returns exitCode=1 and the caller returns safe defaults.

import { spawn } from 'child_process'
import path from 'path'

const TIMEOUT_MS = 12_000

interface PowerShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Run a PowerShell script with arguments.
 * args is a Record<string, string> of -ParamName value pairs.
 *
 * Never throws — returns exitCode and stderr for callers to handle.
 * On ExecutionPolicy block: detects the specific error text and logs a warning.
 */
export async function runPowerShellScript(
  scriptPath: string,
  args: Record<string, string> = {}
): Promise<PowerShellResult> {
  return new Promise<PowerShellResult>((resolve) => {
    // Build -Key Value pairs for script parameters
    const paramArgs = Object.entries(args).flatMap(([k, v]) => [`-${k}`, v])

    const psArgs = [
      '-ExecutionPolicy',
      'Bypass',
      '-NonInteractive',
      '-File',
      path.resolve(scriptPath),
      ...paramArgs,
    ]

    let stdout = ''
    let stderr = ''
    let settled = false

    let child: ReturnType<typeof spawn>

    try {
      child = spawn('powershell.exe', psArgs)
    } catch (err) {
      console.error('[collector:powershell] spawn failed', err)
      resolve({ stdout: '', stderr: String(err), exitCode: 1 })
      return
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          child.kill()
        } catch {
          // ignore
        }
        console.error('[collector:powershell] timeout after 30s for script', scriptPath)
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

        // Detect execution policy blocks — log a warning so the user can diagnose
        if (
          stderr.includes('not digitally signed') ||
          stderr.includes('execution of scripts is disabled')
        ) {
          console.warn(
            '[collector:powershell] execution policy blocked script:',
            scriptPath,
            '— collector will return default values'
          )
        }

        resolve({ stdout, stderr, exitCode: code ?? 1 })
      }
    })

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        console.error('[collector:powershell] process error', err)
        resolve({ stdout: '', stderr: String(err), exitCode: 1 })
      }
    })
  })
}
