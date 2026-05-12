/**
 * src/engine/rules/gpu-driver.ts
 *
 * Rule Pack 1 — GPU Driver Instability / TDR
 *
 * Detects GPU driver resets (TDR — Timeout Detection and Recovery) that occur
 * during the incident window.  Evidence-first: this rule only fires when a TDR
 * or display driver event is actually present in the collected signal data.
 *
 * Primary trigger: Event ID 153 from nvlddmkm OR Event ID 4101 from Display,
 * within the incident window.
 */

import type { ParsedSession, RuleResult, SignalMatch, FixStep } from '../types'
import {
  eventsInWindow,
  findEvents,
  peakMetric,
  secondsBeforeMarker,
} from '../utils'

// Overlay DLL names — used to check disqualification toward Rule Pack 2.
// Kept minimal here; full list is in overlay-conflict.ts.
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

// Anti-cheat process names — used to check disqualification toward Rule Pack 3.
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
    title: 'Clean-install GPU drivers with DDU',
    detail:
      'Download Display Driver Uninstaller (DDU), boot into Safe Mode, and run a ' +
      'full clean uninstall before installing the latest driver from your GPU ' +
      "manufacturer's website.",
    link: 'https://www.guru3d.com/files-details/display-driver-uninstaller-download.html',
  },
  {
    order: 2,
    title: 'Check GPU temperatures with HWiNFO64',
    detail:
      'Download HWiNFO64 and run a logging session during gaming. GPU temperatures ' +
      'above 90 °C (NVIDIA) or 100 °C (AMD) indicate a thermal problem.',
    link: 'https://www.hwinfo.com/',
  },
  {
    order: 3,
    title: 'Reseat GPU power connectors',
    detail:
      'Power off, unplug from the wall, then firmly re-seat the PCIe power ' +
      'connectors on the GPU.  A loose connector can cause intermittent resets ' +
      'under load.',
  },
  {
    order: 4,
    title: 'Test with GPU underclocked by 10%',
    detail:
      'Use MSI Afterburner or AMD Adrenalin to reduce the GPU core clock by ~10%. ' +
      'If the crashes stop, the GPU may be overclocked beyond its stable limit or ' +
      'experiencing voltage instability.',
  },
  {
    order: 5,
    title: 'Check for VBIOS updates',
    detail:
      "Visit your GPU manufacturer's support page and check whether a VBIOS update " +
      'is available for your card model.  Some TDR issues are fixed in firmware.',
  },
]

export function evaluate(session: ParsedSession): RuleResult {
  const { windows, events, processes, metrics, issue_marker_at, app_name } = session
  const signals: SignalMatch[] = []
  const disqualifiedBy: string[] = []

  // ── Disqualification checks (run before anything else) ─────────────────────

  // If an anti-cheat process exits before the game process in the incident
  // window, redirect to Rule Pack 3 (anti-cheat conflict).
  const incidentEvents = eventsInWindow(events, windows, 'incident')
  const gameProcName = app_name

  const gameProcess = processes.find(
    (p) => p.name.toLowerCase() === gameProcName.toLowerCase() && p.exit_detected,
  )
  const gameExitTs = gameProcess?.last_seen ?? null

  const antiCheatExit = processes.find((p) => {
    if (!ANTI_CHEAT_PROCESSES.includes(p.name)) return false
    if (!p.exit_detected || !p.last_seen) return false
    if (!gameExitTs) return false
    // Anti-cheat must exit before the game and within the incident window
    const acExitMs = Date.parse(p.last_seen)
    const gameExitMs = Date.parse(gameExitTs)
    const incidentStartMs = Date.parse(windows.incident_start)
    const incidentEndMs = Date.parse(windows.incident_end)
    return acExitMs < gameExitMs && acExitMs >= incidentStartMs && acExitMs <= incidentEndMs
  })

  if (antiCheatExit !== undefined) {
    disqualifiedBy.push('anti-cheat')
  }

  // If the faulting module in Event ID 1000 matches an overlay DLL, redirect
  // to Rule Pack 2 (overlay conflict).
  const appErrorEvents = findEvents(incidentEvents, 1000)
  const overlayFaultingModule = appErrorEvents.find((e) =>
    OVERLAY_DLLS.some((dll) => e.message.toLowerCase().includes(dll.toLowerCase())),
  )

  if (overlayFaultingModule !== undefined) {
    disqualifiedBy.push('overlay-conflict')
  }

  // If disqualification applies, do not fire this rule.
  if (disqualifiedBy.length > 0) {
    return {
      rulePackId: 'gpu-driver',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Primary trigger check ───────────────────────────────────────────────────

  // TDR events: Event ID 153 from nvlddmkm OR Event ID 4101 from Display.
  const tdrEvents = [
    ...findEvents(incidentEvents, 153, 'nvlddmkm'),
    ...findEvents(incidentEvents, 4101, 'Display'),
  ]

  if (tdrEvents.length === 0) {
    // No primary trigger — rule does not fire.
    return {
      rulePackId: 'gpu-driver',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // Record primary trigger signals.
  for (const e of tdrEvents) {
    const secs = secondsBeforeMarker(e.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: `GPU driver reset (TDR) detected ${Math.abs(secs).toFixed(0)} seconds before the crash`,
      technical: `Event ID ${e.event_id} — ${e.provider} — ${e.ts}`,
      window: 'incident',
      severity: 'critical',
      ts: e.ts,
      seconds_before_marker: secs,
    })
  }

  // ── Supporting signal checks ────────────────────────────────────────────────

  let supportingSignalCount = 0

  // Event IDs 14 and 13 from nvlddmkm (additional TDR / driver events).
  const additionalTdrEvents = [
    ...findEvents(incidentEvents, 14, 'nvlddmkm'),
    ...findEvents(incidentEvents, 13, 'nvlddmkm'),
  ]
  for (const e of additionalTdrEvents) {
    const secs = secondsBeforeMarker(e.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: `Additional GPU driver event logged ${Math.abs(secs).toFixed(0)} seconds before the crash`,
      technical: `Event ID ${e.event_id} — ${e.provider} — ${e.ts}`,
      window: 'incident',
      severity: 'supporting',
      ts: e.ts,
      seconds_before_marker: secs,
    })
    supportingSignalCount++
  }

  // Event ID 141 from Microsoft-Windows-Kernel-PnP (LiveKernelEvent).
  const liveKernelEvents = findEvents(events, 141, 'Microsoft-Windows-Kernel-PnP')
  for (const e of liveKernelEvents) {
    const secs = secondsBeforeMarker(e.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: 'Windows reported a live kernel event related to a hardware device',
      technical: `Event ID 141 — Microsoft-Windows-Kernel-PnP — ${e.ts}`,
      window: 'incident',
      severity: 'supporting',
      ts: e.ts,
      seconds_before_marker: secs,
    })
    supportingSignalCount++
  }

  // GPU utilization above 90% in the incident window.
  const peakGpu = peakMetric(metrics, 'gpu_pct', windows, 'incident')
  const gpuHighLoad = peakGpu > 90
  if (gpuHighLoad) {
    const highGpuSample = metrics
      .filter((m) => {
        const ts = Date.parse(m.ts)
        return (
          ts >= Date.parse(windows.incident_start) &&
          ts <= Date.parse(windows.incident_end) &&
          m.gpu_pct > 90
        )
      })
      .sort((a, b) => b.gpu_pct - a.gpu_pct)[0]

    if (highGpuSample !== undefined) {
      const secs = secondsBeforeMarker(highGpuSample.ts, issue_marker_at)
      signals.push({
        type: 'metric',
        description: `GPU utilization was at ${highGpuSample.gpu_pct.toFixed(1)}% — well above the safe threshold`,
        technical: `gpu_pct=${highGpuSample.gpu_pct.toFixed(1)} — ${highGpuSample.ts}`,
        window: 'incident',
        severity: 'supporting',
        ts: highGpuSample.ts,
        seconds_before_marker: secs,
      })
      supportingSignalCount++
    }
  }

  // Game process exit detected near the incident end (within 5 seconds).
  const gameExitDetected = (() => {
    if (gameProcess === undefined || !gameProcess.exit_detected) return false
    const exitMs = Date.parse(gameProcess.last_seen)
    const incidentEndMs = Date.parse(windows.incident_end)
    // Allow 5 seconds after the incident end for exit to be recorded
    return Math.abs(exitMs - incidentEndMs) <= 5000
  })()

  if (gameExitDetected && gameProcess !== undefined) {
    const secs = secondsBeforeMarker(gameProcess.last_seen, issue_marker_at)
    signals.push({
      type: 'process',
      description: `${gameProcess.name} process exited at the time of the crash`,
      technical: `process=${gameProcess.name} pid=${gameProcess.pid} last_seen=${gameProcess.last_seen} exit_detected=true`,
      window: 'incident',
      severity: 'supporting',
      ts: gameProcess.last_seen,
      seconds_before_marker: secs,
    })
    supportingSignalCount++
  }

  // BSOD codes 0x117 or 0x116 in Event ID 1001.
  const bsodEvents = findEvents(events, 1001)
  for (const e of bsodEvents) {
    if (
      e.message.includes('0x117') ||
      e.message.includes('0x116') ||
      e.message.toLowerCase().includes('video_tdr')
    ) {
      const secs = secondsBeforeMarker(e.ts, issue_marker_at)
      signals.push({
        type: 'event',
        description: 'BSOD crash was caused by a GPU driver failure (VIDEO_TDR_FAILURE)',
        technical: `Event ID 1001 — BugCheck — ${e.ts} — ${e.message.slice(0, 80)}`,
        window: 'incident',
        severity: 'critical',
        ts: e.ts,
        seconds_before_marker: secs,
      })
      supportingSignalCount++
    }
  }

  // ── Confidence determination ────────────────────────────────────────────────

  // HIGH: primary trigger + GPU util > 90% + game process exit detected
  // HIGH: primary trigger + 2 or more supporting signals
  // MEDIUM: primary trigger alone
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW'

  if (gpuHighLoad && gameExitDetected) {
    confidence = 'HIGH'
  } else if (supportingSignalCount >= 2) {
    confidence = 'HIGH'
  } else {
    confidence = 'MEDIUM'
  }

  // ── Output text ─────────────────────────────────────────────────────────────

  // Use the most recent TDR event for the timing reference in the output text.
  // tdrEvents is guaranteed non-empty at this point (early return above if empty).
  const sortedTdrEvents = tdrEvents.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
  const primaryTdrTs = sortedTdrEvents[0]?.ts ?? windows.incident_end
  const tdrSecs = Math.abs(secondsBeforeMarker(primaryTdrTs, issue_marker_at))

  let outputText: string
  if (confidence === 'HIGH') {
    const gpuStr = gpuHighLoad ? ` GPU utilization was at ${peakGpu.toFixed(1)}% at the time.` : ''
    outputText =
      `A GPU driver reset (TDR) was detected ${tdrSecs.toFixed(0)} seconds before the crash.` +
      gpuStr +
      ' This strongly indicates GPU driver instability or a hardware-level GPU fault.'
  } else {
    outputText =
      'A GPU driver timeout event was logged near the time of the crash. ' +
      'This is consistent with driver instability, though other causes cannot be ' +
      'ruled out without additional signal data.'
  }

  return {
    rulePackId: 'gpu-driver',
    fired: true,
    confidence,
    signals,
    disqualifiedBy,
    fixRecommendations: FIX_RECOMMENDATIONS,
    outputText,
  }
}
