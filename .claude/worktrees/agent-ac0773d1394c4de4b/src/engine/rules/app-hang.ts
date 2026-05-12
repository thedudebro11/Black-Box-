/**
 * src/engine/rules/app-hang.ts
 *
 * Rule Pack 5 — App Hang / Freeze
 *
 * Detects application freezes where the process stops responding but does not
 * crash immediately.  Windows Application Hang events (Event ID 1002) are the
 * definitive signal.  Disk I/O latency spikes are a strong supporting signal
 * because page file thrashing or slow disk reads can stall the game loop.
 *
 * Primary trigger: Event ID 1002 from Application Hang in the Application log,
 * within or shortly after the incident window (within 2 minutes of issue marker).
 *
 * Does not fire: No Event ID 1002 AND disk latency below 300ms throughout.
 */

import type { ParsedSession, RuleResult, SignalMatch, FixStep } from '../types'
import {
  eventsInWindow,
  findEvents,
  hasEventId,
  peakMetric,
  secondsBeforeMarker,
  metricsInWindow,
} from '../utils'

const FIX_RECOMMENDATIONS: FixStep[] = [
  {
    order: 1,
    title: 'Check disk health with CrystalDiskInfo',
    detail:
      'Download CrystalDiskInfo and look at the S.M.A.R.T. data for your drives. ' +
      'Any "Caution" or "Bad" status means the drive is failing and should be replaced. ' +
      'High latency during gaming often indicates a failing or overloaded drive.',
    link: 'https://crystalmark.info/en/software/crystaldiskinfo/',
  },
  {
    order: 2,
    title: 'Check for Windows Update or background indexing',
    detail:
      'Windows Update, Windows Search indexing, and antivirus scans can cause disk ' +
      'latency spikes during gaming. Open Task Manager, click the Disk column, and ' +
      'check what is consuming disk I/O during the freeze.',
  },
  {
    order: 3,
    title: 'Verify game is installed on an SSD',
    detail:
      'Modern games require fast disk access for asset streaming. Installing on a ' +
      'mechanical hard drive (HDD) can cause frequent freezes due to slow seek times. ' +
      'Move the game to an SSD if possible.',
  },
  {
    order: 4,
    title: 'Run chkdsk to check for disk errors',
    detail:
      'Open an administrator Command Prompt and run: chkdsk C: /scan ' +
      '(replace C: with your game drive letter). Fix any errors found before continuing.',
  },
  {
    order: 5,
    title: 'Monitor disk usage during gaming',
    detail:
      'Open Task Manager → Performance → Disk. If disk usage hits 100% during the ' +
      'freeze, the disk is unable to keep up with the game\'s I/O demands. This ' +
      'confirms either a slow drive or a competing process consuming disk bandwidth.',
  },
]

export function evaluate(session: ParsedSession): RuleResult {
  const { windows, events, metrics, processes, issue_marker_at, app_name } = session
  const signals: SignalMatch[] = []
  const disqualifiedBy: string[] = []

  const incidentEvents = eventsInWindow(events, windows, 'incident')

  // ── Disqualification ───────────────────────────────────────────────────────

  // GPU TDR event present → redirect to Rule Pack 1.
  if (
    hasEventId(incidentEvents, 153, 'nvlddmkm') ||
    hasEventId(incidentEvents, 4101, 'Display')
  ) {
    disqualifiedBy.push('gpu-driver')
  }

  // Anti-cheat exit before hang → redirect to Rule Pack 3.
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

  const gameProcess = processes.find(
    (p) => p.name.toLowerCase() === app_name.toLowerCase() && p.exit_detected,
  )
  const gameExitMs = gameProcess !== undefined ? Date.parse(gameProcess.last_seen) : Infinity

  const antiCheatExit = processes.find((p) => {
    if (!ANTI_CHEAT_PROCESSES.includes(p.name)) return false
    if (!p.exit_detected || !p.last_seen) return false
    const acExitMs = Date.parse(p.last_seen)
    const incidentStartMs = Date.parse(windows.incident_start)
    const incidentEndMs = Date.parse(windows.incident_end)
    return acExitMs < gameExitMs && acExitMs >= incidentStartMs && acExitMs <= incidentEndMs
  })

  if (antiCheatExit !== undefined) {
    disqualifiedBy.push('anti-cheat')
  }

  if (disqualifiedBy.length > 0) {
    return {
      rulePackId: 'app-hang',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Primary trigger check ──────────────────────────────────────────────────

  // Event ID 1002 must be in Application log, within the incident window OR
  // within 2 minutes of the issue marker (aftermath window).
  const windowsToSearch = [
    ...eventsInWindow(events, windows, 'incident'),
    ...eventsInWindow(events, windows, 'aftermath'),
  ]

  // Deduplicate by timestamp to avoid double-counting.
  const seen = new Set<string>()
  const searchEvents = windowsToSearch.filter((e) => {
    if (seen.has(e.ts + e.event_id)) return false
    seen.add(e.ts + e.event_id)
    return true
  })

  const hangEvents = findEvents(searchEvents, 1002)

  // Filter to events that mention the app name in their message.
  const appHangEvents = hangEvents.filter((e) =>
    e.message.toLowerCase().includes(app_name.toLowerCase().replace('.exe', '')),
  )

  // If no Event ID 1002 at all AND disk latency is below 300ms → does not fire.
  const peakDiskLatency = peakMetric(metrics, 'disk_latency_ms', windows, 'incident')
  const hasLowDiskLatency = peakDiskLatency < 300

  if (hangEvents.length === 0 && hasLowDiskLatency) {
    return {
      rulePackId: 'app-hang',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // No Event 1002 but disk latency is high enough → LOW confidence only.
  if (hangEvents.length === 0) {
    // Disk latency > 300ms but no Event 1002 — LOW signal only.
    const highDiskSample = metricsInWindow(metrics, windows, 'incident')
      .filter((m) => m.disk_latency_ms > 300)
      .sort((a, b) => b.disk_latency_ms - a.disk_latency_ms)[0]

    if (highDiskSample !== undefined) {
      const secs = secondsBeforeMarker(highDiskSample.ts, issue_marker_at)
      signals.push({
        type: 'metric',
        description: `Disk latency spiked to ${highDiskSample.disk_latency_ms.toFixed(0)}ms — consistent with a disk I/O bottleneck`,
        technical: `disk_latency_ms=${highDiskSample.disk_latency_ms.toFixed(0)} — ${highDiskSample.ts}`,
        window: 'incident',
        severity: 'supporting',
        ts: highDiskSample.ts,
        seconds_before_marker: secs,
      })
    }

    return {
      rulePackId: 'app-hang',
      fired: true,
      confidence: 'LOW',
      signals,
      disqualifiedBy,
      fixRecommendations: FIX_RECOMMENDATIONS,
      outputText:
        `Disk latency spiked to ${peakDiskLatency.toFixed(0)}ms during the incident window. ` +
        `This may have caused a freeze, but no Windows Application Hang event was logged to confirm it.`,
    }
  }

  // ── Event 1002 found — record signals ─────────────────────────────────────

  // Use the best matching hang event (app name match preferred).
  // hangEvents is guaranteed non-empty at this point (early returns above if empty).
  const sortedHangEvents = (
    appHangEvents.length > 0 ? appHangEvents : hangEvents
  ).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
  const primaryHangEvent = sortedHangEvents[0]

  if (primaryHangEvent === undefined) {
    // Safety guard — should be unreachable given the guards above.
    return {
      rulePackId: 'app-hang',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  const hangSecs = secondsBeforeMarker(primaryHangEvent.ts, issue_marker_at)

  // How long before the session end did the hang occur?
  const sessionStartMs = Date.parse(session.started_at)
  const hangMs = Date.parse(primaryHangEvent.ts)
  const secondsIntoSession = (hangMs - sessionStartMs) / 1000

  signals.push({
    type: 'event',
    description: `Windows flagged ${app_name} as not responding ${Math.abs(hangSecs).toFixed(0)} seconds ${hangSecs >= 0 ? 'before' : 'after'} the issue marker`,
    technical: `Event ID 1002 — Application Hang — ${primaryHangEvent.ts} — ${primaryHangEvent.message.slice(0, 80)}`,
    window: 'incident',
    severity: 'critical',
    ts: primaryHangEvent.ts,
    seconds_before_marker: hangSecs,
  })

  // ── Supporting signals ─────────────────────────────────────────────────────

  // Disk latency above 500ms in incident window.
  const hasDiskSpike = peakDiskLatency > 500
  if (hasDiskSpike) {
    const highDiskSample = metricsInWindow(metrics, windows, 'incident')
      .filter((m) => m.disk_latency_ms > 500)
      .sort((a, b) => b.disk_latency_ms - a.disk_latency_ms)[0]

    if (highDiskSample !== undefined) {
      const secs = secondsBeforeMarker(highDiskSample.ts, issue_marker_at)
      signals.push({
        type: 'metric',
        description: `Disk latency spiked to ${highDiskSample.disk_latency_ms.toFixed(0)}ms — a disk I/O bottleneck may have stalled the application`,
        technical: `disk_latency_ms=${highDiskSample.disk_latency_ms.toFixed(0)} — ${highDiskSample.ts}`,
        window: 'incident',
        severity: 'supporting',
        ts: highDiskSample.ts,
        seconds_before_marker: secs,
      })
    }
  }

  // App name confirmed in Event 1002 message.
  const appNameConfirmed = appHangEvents.length > 0

  // Hang duration > 30 seconds (inferred from Event 1002 message if available).
  const hangDuration30 = (() => {
    // Event 1002 messages typically contain "hang time: XXXXX ms".
    const match = primaryHangEvent.message.match(/hang[_ ]?time[:\s]+(\d+)/i)
    if (match) {
      return parseInt(match[1], 10) > 30000
    }
    return false
  })()

  if (hangDuration30) {
    signals.push({
      type: 'event',
      description: 'The application was non-responsive for more than 30 seconds before Windows reported it',
      technical: `Event ID 1002 — hang duration > 30s — ${primaryHangEvent.message.slice(0, 80)}`,
      window: 'incident',
      severity: 'supporting',
      ts: primaryHangEvent.ts,
      seconds_before_marker: hangSecs,
    })
  }

  // ── Confidence determination ───────────────────────────────────────────────

  // HIGH: Event ID 1002 + disk latency > 500ms + app name matches
  // MEDIUM: Event ID 1002 matching app name (no disk spike)
  // MEDIUM: Event ID 1002 present (app name not in message)
  // LOW: disk latency > 500ms in incident window with no Event ID 1002 (handled above)

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW'

  if (hasDiskSpike && appNameConfirmed) {
    confidence = 'HIGH'
  } else {
    confidence = 'MEDIUM'
  }

  // ── Output text ────────────────────────────────────────────────────────────

  let outputText: string

  if (confidence === 'HIGH') {
    outputText =
      `The application stopped responding and was flagged as not responding ` +
      `by Windows (${secondsIntoSession.toFixed(0)} seconds into the session). ` +
      `Disk latency spiked to ${peakDiskLatency.toFixed(0)}ms at the same time, ` +
      `suggesting a disk I/O bottleneck caused the freeze.`
  } else {
    outputText =
      `Windows logged an application hang event for ${app_name}. This indicates ` +
      `the application stopped responding, though the underlying cause (disk, ` +
      `CPU saturation, or software bug) could not be determined from the available signals.`
  }

  return {
    rulePackId: 'app-hang',
    fired: true,
    confidence,
    signals,
    disqualifiedBy,
    fixRecommendations: FIX_RECOMMENDATIONS,
    outputText,
  }
}
