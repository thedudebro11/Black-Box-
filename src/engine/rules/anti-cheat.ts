/**
 * src/engine/rules/anti-cheat.ts
 *
 * Rule Pack 3 — Anti-Cheat Conflict
 *
 * Detects crashes caused by anti-cheat software terminating unexpectedly,
 * which forces the protected game to shut down.
 *
 * Primary trigger: Anti-cheat process exits within the incident window
 * before the game process exits.
 *
 * Evidence-first: this rule only fires when an anti-cheat process was
 * present during the session AND exited before the game in the incident
 * window.  A clean anti-cheat shutdown (exit code 0) only reaches LOW
 * confidence — it may be normal game shutdown ordering.
 */

import type { ParsedSession, RuleResult, SignalMatch, FixStep } from '../types'
import {
  eventsInWindow,
  findEvents,
  secondsBeforeMarker,
} from '../utils'

// Known anti-cheat process names.  Matches RULES_ENGINE.md exactly.
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
    title: 'Update the anti-cheat software',
    detail:
      'Launch the game launcher (Steam, Epic, EA App) and check for updates. ' +
      'Anti-cheat components are typically updated alongside the game itself.',
  },
  {
    order: 2,
    title: 'Run the anti-cheat repair tool',
    detail:
      'EasyAntiCheat: navigate to the game folder and run EasyAntiCheat_Setup.exe, ' +
      'then choose Repair. BattlEye: run the BattlEye installer in the game directory. ' +
      'This forces a clean reinstall of the anti-cheat driver.',
  },
  {
    order: 3,
    title: 'Reinstall the game',
    detail:
      'Anti-cheat software validates game file integrity at launch. Corrupted game ' +
      'files can cause the anti-cheat to terminate abnormally. A full reinstall ' +
      'ensures clean game files.',
  },
  {
    order: 4,
    title: 'Check Windows Update',
    detail:
      'Some anti-cheat kernel drivers conflict with recent Windows updates. ' +
      'Check if a Windows update was installed recently and whether a game ' +
      'update is available that addresses the compatibility issue.',
  },
  {
    order: 5,
    title: 'Check for conflicting security software',
    detail:
      'Some antivirus and endpoint security products conflict with EasyAntiCheat ' +
      'and BattlEye. Try temporarily disabling third-party antivirus and test ' +
      'whether the crash still occurs.',
  },
]

export function evaluate(session: ParsedSession): RuleResult {
  const { windows, events, processes, issue_marker_at, app_name } = session
  const signals: SignalMatch[] = []
  const disqualifiedBy: string[] = []

  const incidentEvents = eventsInWindow(events, windows, 'incident')

  // ── Prerequisite: anti-cheat process must have been present ───────────────

  const antiCheatProcesses = processes.filter((p) => ANTI_CHEAT_PROCESSES.includes(p.name))

  if (antiCheatProcesses.length === 0) {
    // No anti-cheat detected in this session — rule does not fire.
    return {
      rulePackId: 'anti-cheat',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Identify game process exit ─────────────────────────────────────────────

  const gameProcess = processes.find(
    (p) => p.name.toLowerCase() === app_name.toLowerCase() && p.exit_detected,
  )

  // ── Primary trigger: anti-cheat exits before game in incident window ───────

  // Find the anti-cheat process that exited earliest in the incident window.
  const incidentStartMs = Date.parse(windows.incident_start)
  const incidentEndMs = Date.parse(windows.incident_end)
  const gameExitMs = gameProcess !== undefined ? Date.parse(gameProcess.last_seen) : Infinity

  const exitedAntiCheat = antiCheatProcesses.find((p) => {
    if (!p.exit_detected || !p.last_seen) return false
    const acExitMs = Date.parse(p.last_seen)
    // Must exit within incident window and before the game process.
    return acExitMs >= incidentStartMs && acExitMs <= incidentEndMs && acExitMs < gameExitMs
  })

  if (exitedAntiCheat === undefined) {
    // Anti-cheat was present but did not exit before the game in the incident
    // window — primary trigger not met.
    return {
      rulePackId: 'anti-cheat',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Disqualification: GPU TDR more recent than anti-cheat exit ────────────

  const tdrEvents = [
    ...findEvents(incidentEvents, 153, 'nvlddmkm'),
    ...findEvents(incidentEvents, 4101, 'Display'),
  ]

  if (tdrEvents.length > 0) {
    const acExitMs = Date.parse(exitedAntiCheat.last_seen)
    const sortedTdr = tdrEvents.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    const mostRecentTdrTs = sortedTdr[0]?.ts ?? windows.incident_end
    const tdrMs = Date.parse(mostRecentTdrTs)
    // If TDR is within 5 seconds after the anti-cheat exit, redirect to gpu-driver.
    if (tdrMs >= acExitMs && tdrMs - acExitMs <= 5000) {
      disqualifiedBy.push('gpu-driver')
      return {
        rulePackId: 'anti-cheat',
        fired: false,
        confidence: null,
        signals,
        disqualifiedBy,
        fixRecommendations: [],
        outputText: '',
      }
    }
  }

  // ── Record primary signal ──────────────────────────────────────────────────

  const acExitSecs = secondsBeforeMarker(exitedAntiCheat.last_seen, issue_marker_at)
  signals.push({
    type: 'process',
    description: `${exitedAntiCheat.name} (anti-cheat) stopped ${Math.abs(acExitSecs).toFixed(0)} seconds before the game closed`,
    technical: `process=${exitedAntiCheat.name} pid=${exitedAntiCheat.pid} last_seen=${exitedAntiCheat.last_seen} exit_detected=true`,
    window: 'incident',
    severity: 'critical',
    ts: exitedAntiCheat.last_seen,
    seconds_before_marker: acExitSecs,
  })

  // ── Supporting signal: FilterManager Event ID 1 ───────────────────────────

  // Event ID 1 from Microsoft-Windows-FilterManager means a file system filter
  // driver (which anti-cheat kernel components register as) was unloaded.
  // Within 10 seconds of the anti-cheat exit this is strong corroborating evidence.
  const filterManagerEvents = findEvents(events, 1, 'Microsoft-Windows-FilterManager')
  const acExitMs2 = Date.parse(exitedAntiCheat.last_seen)

  const relevantFilterEvent = filterManagerEvents.find((e) => {
    const eMs = Date.parse(e.ts)
    return Math.abs(eMs - acExitMs2) <= 10000
  })

  const hasFilterManagerEvent = relevantFilterEvent !== undefined
  if (relevantFilterEvent !== undefined) {
    const secs = secondsBeforeMarker(relevantFilterEvent.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: 'Windows logged an anti-cheat driver unload event at the time of the crash',
      technical: `Event ID 1 — Microsoft-Windows-FilterManager — ${relevantFilterEvent.ts}`,
      window: 'incident',
      severity: 'supporting',
      ts: relevantFilterEvent.ts,
      seconds_before_marker: secs,
    })
  }

  // ── Supporting signal: non-zero exit code ─────────────────────────────────

  // Look for EAC-specific exit code 0xC0000005 (access violation) in Event ID 1000.
  const appErrorEvents = findEvents(incidentEvents, 1000)
  const eacErrorEvent = appErrorEvents.find((e) => {
    const msgLower = e.message.toLowerCase()
    return (
      msgLower.includes('0xc0000005') ||
      (msgLower.includes('easyanticheat') ||
        msgLower.includes('battleye') ||
        msgLower.includes(exitedAntiCheat.name.toLowerCase()))
    )
  })

  const hasNonZeroExitCode = eacErrorEvent !== undefined
  if (eacErrorEvent !== undefined) {
    const secs = secondsBeforeMarker(eacErrorEvent.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: 'Anti-cheat process terminated with an error (access violation)',
      technical: `Event ID 1000 — ${eacErrorEvent.ts} — ${eacErrorEvent.message.slice(0, 80)}`,
      window: 'incident',
      severity: 'supporting',
      ts: eacErrorEvent.ts,
      seconds_before_marker: secs,
    })
  }

  // Record game process exit signal if present.
  if (gameProcess !== undefined) {
    const gameSecs = secondsBeforeMarker(gameProcess.last_seen, issue_marker_at)
    signals.push({
      type: 'process',
      description: `${gameProcess.name} closed after the anti-cheat service stopped`,
      technical: `process=${gameProcess.name} pid=${gameProcess.pid} last_seen=${gameProcess.last_seen}`,
      window: 'incident',
      severity: 'supporting',
      ts: gameProcess.last_seen,
      seconds_before_marker: gameSecs,
    })
  }

  // ── Confidence determination ───────────────────────────────────────────────

  // HIGH: anti-cheat exits before game + FilterManager Event ID 1 + non-zero exit code
  // MEDIUM: anti-cheat exits before game + non-zero exit code (no FilterManager event)
  // MEDIUM: anti-cheat exits before game + FilterManager event (no exit code evidence)
  // LOW: anti-cheat exits before game, exit code 0 (clean shutdown — may be normal)

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW'

  if (hasFilterManagerEvent && hasNonZeroExitCode) {
    confidence = 'HIGH'
  } else if (hasNonZeroExitCode || hasFilterManagerEvent) {
    confidence = 'MEDIUM'
  } else {
    // Clean exit only — could be normal shutdown ordering.
    confidence = 'LOW'
  }

  // ── Output text ────────────────────────────────────────────────────────────

  const acSecsAbs = Math.abs(acExitSecs).toFixed(0)
  let outputText: string

  if (confidence === 'HIGH') {
    const driverNote = hasFilterManagerEvent
      ? ' A driver unload event was logged at the same time.'
      : ''
    outputText =
      `The anti-cheat service (${exitedAntiCheat.name}) stopped ${acSecsAbs} seconds before ` +
      `the game closed.${driverNote} This indicates the anti-cheat process terminated ` +
      `abnormally, causing the game to shut down.`
  } else if (confidence === 'MEDIUM') {
    outputText =
      `The anti-cheat service exited before the game process ended. This is consistent ` +
      `with an anti-cheat conflict, though without sufficient corroborating evidence it ` +
      `cannot be confirmed.`
  } else {
    outputText =
      `The anti-cheat service (${exitedAntiCheat.name}) exited before the game, but the ` +
      `shutdown appeared clean. This may be normal game shutdown ordering rather than a conflict.`
  }

  return {
    rulePackId: 'anti-cheat',
    fired: true,
    confidence,
    signals,
    disqualifiedBy,
    fixRecommendations: FIX_RECOMMENDATIONS,
    outputText,
  }
}
