// drivers.ts — Hardware profile collection via get-system-info.ps1
//
// Called once at session start to collect GPU model, driver version, OS version,
// and total RAM. Returns safe defaults on any error — never throws, never returns null.

import path from 'path'
import type { HardwareProfile } from './types'
import { runPowerShellScript } from './powershell'

// ── Script path ────────────────────────────────────────────────────────────────

const SCRIPT_PATH = path.join(
  __dirname,
  '..',
  '..',
  'scripts',
  'powershell',
  'get-system-info.ps1'
)

// ── Safe default — used when PowerShell is blocked or WMI fails ────────────────

const DEFAULT_PROFILE: HardwareProfile = {
  gpu_model: 'unknown',
  gpu_driver_version: 'unknown',
  os_version: 'unknown',
  ram_total_mb: 0,
}

// ── Raw shape returned by the PowerShell script ────────────────────────────────

interface RawHardwareProfile {
  gpu_model?: unknown
  gpu_driver_version?: unknown
  os_version?: unknown
  ram_total_mb?: unknown
}

// ── JSON parser ────────────────────────────────────────────────────────────────

function parseHardwareJson(json: string): HardwareProfile {
  if (!json.trim()) return { ...DEFAULT_PROFILE }

  try {
    const raw = JSON.parse(json) as unknown
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PROFILE }

    const profile = raw as RawHardwareProfile

    return {
      gpu_model:
        typeof profile.gpu_model === 'string' && profile.gpu_model
          ? profile.gpu_model
          : 'unknown',
      gpu_driver_version:
        typeof profile.gpu_driver_version === 'string' && profile.gpu_driver_version
          ? profile.gpu_driver_version
          : 'unknown',
      os_version:
        typeof profile.os_version === 'string' && profile.os_version
          ? profile.os_version
          : 'unknown',
      ram_total_mb:
        typeof profile.ram_total_mb === 'number' && !isNaN(profile.ram_total_mb)
          ? profile.ram_total_mb
          : 0,
    }
  } catch (err) {
    console.error('[collector:drivers] JSON parse error', err)
    return { ...DEFAULT_PROFILE }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Collect the hardware profile from the local machine.
 * Returns DEFAULT_PROFILE on any failure — callers must handle the 'unknown' case.
 * Never throws. Never returns null.
 */
export async function getHardwareProfile(): Promise<HardwareProfile> {
  try {
    const result = await runPowerShellScript(SCRIPT_PATH)

    if (result.exitCode !== 0) {
      console.error('[collector:drivers] get-system-info.ps1 failed', result.stderr)
      return { ...DEFAULT_PROFILE }
    }

    return parseHardwareJson(result.stdout)
  } catch (err) {
    console.error('[collector:drivers] getHardwareProfile error', err)
    return { ...DEFAULT_PROFILE }
  }
}
