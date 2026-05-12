/**
 * src/engine/rules/overlay-conflict.ts
 *
 * Rule Pack 2 — Overlay Conflict
 *
 * Detects crashes caused by conflicts between overlay software (Discord overlay,
 * Steam overlay, GeForce Experience, etc.) and the game process.
 *
 * Primary trigger: Silent crash — game process exits with NO Event ID 1000
 * (Application Error) logged AND no BSOD AND no anti-cheat exit event.
 *
 * Overlay conflicts are typically silent crashes because the overlay injects
 * into the game process and the crash produces no standard exception record.
 */

import type { ParsedSession, RuleResult, SignalMatch, FixStep } from '../types'
import {
  eventsInWindow,
  findEvents,
  hasEventId,
  secondsBeforeMarker,
} from '../utils'

// Known overlay process names that inject into game processes.
// Matches RULES_ENGINE.md exactly.
const OVERLAY_PROCESSES = [
  'Discord.exe',
  'DiscordOverlay.exe',
  'steam.exe',
  'GameOverlayUI.exe',
  'EpicGamesLauncher.exe',
  'GeForceExperience.exe',
  'NVIDIA Share.exe',
  'nvsphelper64.exe',
  'RadeonSoftware.exe',
  'AMDRSServ.exe',
  'MSIAfterburner.exe',
  'RTSS.exe',
  'OBS64.exe',
  'obs-browser-plugin64.dll',
  'XboxGameBar.exe',
]

// Known overlay DLL names found in Event ID 1000 faulting module field.
const OVERLAY_DLLS = [
  'GameOverlayRenderer64.dll',
  'discord_overlay.dll',
  'DiscordHook64.dll',
  'nvui.dll',
  'nvspcap64.dll',
  'RTSS.dll',
  'RTSSHooks64.dll',
  'obs-browser-plugin64.dll',
]

// Anti-cheat processes used for disqualification — must match anti-cheat.ts.
const ANTI_CHEAT_PROCESSES = [
  'EasyAntiCheat.exe',
  'EasyAntiCheat_EOS.exe',
  'BEService.exe',
  'BELauncher.exe',
  'nProtect.exe',
  'GameGuard.des',
  'vgc.exe',
  'vgtray.exe',
  'ricochet.exe',
]

const FIX_RECOMMENDATIONS: FixStep[] = [
  {
    order: 1,
    title: 'Disable all overlays and test',
    detail:
      'Disable overlays in Discord (Settings → Overlay → disable), Steam ' +
      '(Settings → In-Game → disable Steam Overlay), GeForce Experience ' +
      '(Alt+Z → Settings → disable), and Xbox Game Bar (Windows Settings → ' +
      'Gaming → Xbox Game Bar → off). Relaunch the game and test.',
  },
  {
    order: 2,
    title: 'Re-enable overlays one at a time',
    detail:
      'Once the game is stable with all overlays disabled, re-enable them ' +
      'one at a time with a test session after each. The one that triggers ' +
      'the crash is the conflicting overlay.',
  },
  {
    order: 3,
    title: 'Update all overlay software',
    detail:
      'Outdated overlay software is a common source of conflicts. Update ' +
      'Discord, Steam, GeForce Experience, and any other overlay tools to ' +
      'their latest versions.',
  },
  {
    order: 4,
    title: 'Remove or update RivaTuner Statistics Server',
    detail:
      'If MSI Afterburner or RivaTuner Statistics Server (RTSS) is installed, ' +
      'update to the latest version. RTSS uses aggressive hooking that can ' +
      'conflict with other overlays and anti-cheat software.',
    link: 'https://www.guru3d.com/files-details/rivatuner-statistics-server-download.html',
  },
]

export function evaluate(session: ParsedSession): RuleResult {
  const { windows, events, processes, issue_marker_at, app_name } = session
  const signals: SignalMatch[] = []
  const disqualifiedBy: string[] = []

  const incidentEvents = eventsInWindow(events, windows, 'incident')

  // ── Disqualification checks ────────────────────────────────────────────────

  // GPU TDR event present → redirect to Rule Pack 1 (gpu-driver).
  if (
    hasEventId(incidentEvents, 153, 'nvlddmkm') ||
    hasEventId(incidentEvents, 4101, 'Display')
  ) {
    disqualifiedBy.push('gpu-driver')
  }

  // Anti-cheat process exits before game in incident window → Rule Pack 3.
  const gameProcess = processes.find(
    (p) => p.name.toLowerCase() === app_name.toLowerCase() && p.exit_detected,
  )
  const gameExitTs = gameProcess?.last_seen ?? null

  const antiCheatExit = processes.find((p) => {
    if (!ANTI_CHEAT_PROCESSES.includes(p.name)) return false
    if (!p.exit_detected || !p.last_seen || !gameExitTs) return false
    const acExitMs = Date.parse(p.last_seen)
    const gameExitMs = Date.parse(gameExitTs)
    const incidentStartMs = Date.parse(windows.incident_start)
    const incidentEndMs = Date.parse(windows.incident_end)
    return acExitMs < gameExitMs && acExitMs >= incidentStartMs && acExitMs <= incidentEndMs
  })

  if (antiCheatExit !== undefined) {
    disqualifiedBy.push('anti-cheat')
  }

  if (disqualifiedBy.length > 0) {
    return {
      rulePackId: 'overlay-conflict',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Primary trigger: silent crash detection ────────────────────────────────

  // A silent crash is: game process exited in incident window with no
  // Application Error (Event ID 1000), no BSOD (Event ID 1001 with BugCheck),
  // and no anti-cheat exit.

  // Check: game process exit detected in or near incident window.
  const gameExitInIncident = (() => {
    if (!gameProcess || !gameProcess.exit_detected) return false
    const exitMs = Date.parse(gameProcess.last_seen)
    const incidentStartMs = Date.parse(windows.incident_start)
    const aftermathEndMs = Date.parse(windows.aftermath_end)
    return exitMs >= incidentStartMs && exitMs <= aftermathEndMs
  })()

  if (!gameExitInIncident || gameProcess === undefined) {
    // No game process exit detected — cannot evaluate overlay conflict.
    return {
      rulePackId: 'overlay-conflict',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // At this point gameProcess is defined and exit_detected is true.
  // Check: is this a silent crash?
  // Silent = no Event ID 1000 (Application Error) with a non-overlay module AND
  // no BSOD event.
  const appErrorEvents = findEvents(incidentEvents, 1000)
  const bsodEvents = findEvents(events, 1001)
  const hasBsod = bsodEvents.length > 0

  if (hasBsod) {
    // BSOD is a kernel crash — not an overlay conflict.
    return {
      rulePackId: 'overlay-conflict',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // Check if Event ID 1000 is present with a non-overlay faulting module.
  // If a specific non-overlay faulting module is named, this is not a silent crash.
  const nonOverlayError = appErrorEvents.find(
    (e) => !OVERLAY_DLLS.some((dll) => e.message.toLowerCase().includes(dll.toLowerCase())),
  )

  if (nonOverlayError !== undefined) {
    // Explicit non-overlay faulting module → do not fire overlay rule.
    return {
      rulePackId: 'overlay-conflict',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // We have a silent crash (or one with an overlay DLL as faulting module).
  // Record the game process exit as a signal.
  const gameExitSecs = secondsBeforeMarker(gameProcess.last_seen, issue_marker_at)
  signals.push({
    type: 'process',
    description: `${gameProcess.name} exited silently — no crash report was generated`,
    technical: `process=${gameProcess.name} pid=${gameProcess.pid} last_seen=${gameProcess.last_seen} exit_detected=true`,
    window: 'incident',
    severity: 'critical',
    ts: gameProcess.last_seen,
    seconds_before_marker: gameExitSecs,
  })

  // ── Supporting signals ─────────────────────────────────────────────────────

  // Count active overlay processes during the session.
  const activeOverlayProcesses = processes.filter((p) =>
    OVERLAY_PROCESSES.includes(p.name),
  )
  const overlayCount = activeOverlayProcesses.length

  for (const op of activeOverlayProcesses) {
    signals.push({
      type: 'process',
      description: `Overlay program ${op.name} was active during the session`,
      technical: `process=${op.name} pid=${op.pid} first_seen=${op.first_seen} last_seen=${op.last_seen}`,
      window: 'incident',
      severity: 'supporting',
      ts: op.last_seen,
      seconds_before_marker: secondsBeforeMarker(op.last_seen, issue_marker_at),
    })
  }

  // Check for overlay DLL in Event ID 1000 faulting module (if any 1000 exists).
  const overlayFaultEvent = appErrorEvents.find((e) =>
    OVERLAY_DLLS.some((dll) => e.message.toLowerCase().includes(dll.toLowerCase())),
  )

  let faultingModuleName: string | null = null
  if (overlayFaultEvent !== undefined) {
    // Extract the matching DLL name for the output text.
    for (const dll of OVERLAY_DLLS) {
      if (overlayFaultEvent.message.toLowerCase().includes(dll.toLowerCase())) {
        faultingModuleName = dll
        break
      }
    }
    const secs = secondsBeforeMarker(overlayFaultEvent.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: `Crash report names an overlay component (${faultingModuleName ?? 'unknown'}) as the faulting module`,
      technical: `Event ID 1000 — ${overlayFaultEvent.ts} — faulting module: ${faultingModuleName ?? 'overlay dll'}`,
      window: 'incident',
      severity: 'critical',
      ts: overlayFaultEvent.ts,
      seconds_before_marker: secs,
    })
  }

  // ── Confidence determination ───────────────────────────────────────────────

  // HIGH: silent crash + faulting module matches overlay DLL + 2+ overlay processes
  // MEDIUM: silent crash + 2+ overlay processes active (no faulting module data)
  // LOW: silent crash + 1 overlay process active
  // Does not fire: Event ID 1000 present with non-overlay faulting module (handled above)

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW'

  if (faultingModuleName !== null && overlayCount >= 2) {
    confidence = 'HIGH'
  } else if (overlayCount >= 2) {
    confidence = 'MEDIUM'
  } else if (overlayCount >= 1) {
    confidence = 'LOW'
  } else {
    // No overlay processes detected — cannot support overlay conflict diagnosis.
    return {
      rulePackId: 'overlay-conflict',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Output text ────────────────────────────────────────────────────────────

  let outputText: string
  if (confidence === 'HIGH' && faultingModuleName !== null) {
    outputText =
      `The game crashed silently — no exception was logged — and multiple ` +
      `overlay programs were active at the time. The faulting module (${faultingModuleName}) ` +
      `is a known overlay component. Overlay conflicts are the most likely cause.`
  } else {
    outputText =
      `The game crashed without generating a crash report, and ${overlayCount} overlay ` +
      `program${overlayCount === 1 ? '' : 's'} ${overlayCount === 1 ? 'was' : 'were'} running simultaneously. ` +
      `This pattern is consistent with an overlay conflict, though it cannot be confirmed ` +
      `without faulting module data.`
  }

  return {
    rulePackId: 'overlay-conflict',
    fired: true,
    confidence,
    signals,
    disqualifiedBy,
    fixRecommendations: FIX_RECOMMENDATIONS,
    outputText,
  }
}
