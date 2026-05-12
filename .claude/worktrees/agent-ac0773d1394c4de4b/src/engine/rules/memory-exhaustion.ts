/**
 * src/engine/rules/memory-exhaustion.ts
 *
 * Rule Pack 4 — Memory Exhaustion
 *
 * Detects crashes caused by the system running out of available memory,
 * forcing Windows to terminate the game process or causing an OOM exception.
 *
 * Primary trigger: Event ID 2004 from Resource-Exhaustion-Detector OR
 * commit charge above 95% of commit limit in the incident window metrics.
 *
 * Rule does not fire if RAM stays below 85% throughout the session — that
 * threshold eliminates incidental RAM readings from unrelated activity.
 */

import type { ParsedSession, RuleResult, SignalMatch, FixStep } from '../types'
import {
  eventsInWindow,
  findEvents,
  hasEventId,
  peakMetric,
  secondsBeforeMarker,
  consecutiveSamplesAbove,
} from '../utils'

const FIX_RECOMMENDATIONS: FixStep[] = [
  {
    order: 1,
    title: 'Close background applications before gaming',
    detail:
      'Close browser tabs, streaming apps (Spotify, Discord, Twitch), and other ' +
      'background applications before launching the game. Each one reduces the ' +
      'available memory pool.',
  },
  {
    order: 2,
    title: 'Check for memory leaks',
    detail:
      'Open Task Manager (Ctrl+Shift+Esc), click the Memory column to sort by usage, ' +
      'and watch for processes that grow continuously over time. A process with a memory ' +
      'leak will consume increasing RAM even when idle.',
  },
  {
    order: 3,
    title: 'Consider a RAM upgrade',
    detail:
      'If RAM usage is regularly above 90% during normal gaming, the system has ' +
      'insufficient memory for your workload. Modern games commonly require 16 GB; ' +
      'some require 32 GB for smooth operation.',
  },
  {
    order: 4,
    title: 'Reduce in-game texture quality',
    detail:
      'High texture quality settings increase both RAM and VRAM requirements. ' +
      'Reducing texture quality from Ultra to High or Medium can significantly ' +
      'reduce memory pressure.',
  },
  {
    order: 5,
    title: 'Check Windows page file settings',
    detail:
      "Open System Properties → Advanced → Performance → Settings → Advanced. " +
      'Set the virtual memory (page file) to "System managed size" if it has been ' +
      'set to a custom value. An undersized page file worsens memory exhaustion.',
  },
]

export function evaluate(session: ParsedSession): RuleResult {
  const { windows, events, processes, metrics, issue_marker_at, app_name } = session
  const signals: SignalMatch[] = []
  const disqualifiedBy: string[] = []

  const incidentEvents = eventsInWindow(events, windows, 'incident')

  // ── Disqualification ───────────────────────────────────────────────────────

  // GPU TDR event present and RAM below 85% → this is a GPU issue, not memory exhaustion.
  const hasTdr =
    hasEventId(incidentEvents, 153, 'nvlddmkm') ||
    hasEventId(incidentEvents, 4101, 'Display')

  const peakRamIncident = peakMetric(metrics, 'ram_pct', windows, 'incident')
  const peakRamBaseline = peakMetric(metrics, 'ram_pct', windows, 'baseline')
  const peakRamOverall = Math.max(peakRamIncident, peakRamBaseline)

  if (hasTdr && peakRamOverall < 85) {
    disqualifiedBy.push('gpu-driver')
    return {
      rulePackId: 'memory-exhaustion',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Hard floor: RAM never exceeded 85% during session ─────────────────────

  if (peakRamOverall < 85) {
    // Memory pressure never reached the threshold to suspect exhaustion.
    return {
      rulePackId: 'memory-exhaustion',
      fired: false,
      confidence: null,
      signals,
      disqualifiedBy,
      fixRecommendations: [],
      outputText: '',
    }
  }

  // ── Primary trigger check ──────────────────────────────────────────────────

  // Option A: Event ID 2004 from Resource-Exhaustion-Detector during the incident window.
  const exhaustionEvents = findEvents(
    incidentEvents,
    2004,
    'Microsoft-Windows-Resource-Exhaustion-Detector',
  )

  const hasEvent2004 = exhaustionEvents.length > 0

  // Option B: RAM % above 95% in incident window metrics.
  const peakRamPctIncident = peakMetric(metrics, 'ram_pct', windows, 'incident')
  const commitAbove95 = peakRamPctIncident > 95

  if (!hasEvent2004 && !commitAbove95) {
    // Neither primary trigger met — but RAM is above 85%, so check for LOW.
    const ramAbove90 = peakRamOverall > 90
    if (!ramAbove90) {
      return {
        rulePackId: 'memory-exhaustion',
        fired: false,
        confidence: null,
        signals,
        disqualifiedBy,
        fixRecommendations: [],
        outputText: '',
      }
    }
    // RAM > 90% but < 95%, no Event 2004 → LOW confidence only (not firing at useful level).
    // Per spec: LOW confidence without Event 2004. We still fire but at LOW.
  }

  // Record Event 2004 signals.
  for (const e of exhaustionEvents) {
    const secs = secondsBeforeMarker(e.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: 'Windows detected that the system was running out of memory',
      technical: `Event ID 2004 — Microsoft-Windows-Resource-Exhaustion-Detector — ${e.ts}`,
      window: 'incident',
      severity: 'critical',
      ts: e.ts,
      seconds_before_marker: secs,
    })
  }

  // Record peak RAM metric signal.
  const peakRamSample = metrics
    .filter((m) => {
      const ts = Date.parse(m.ts)
      return (
        ts >= Date.parse(windows.incident_start) &&
        ts <= Date.parse(windows.incident_end) &&
        m.ram_pct === peakRamPctIncident
      )
    })
    .sort((a, b) => b.ram_pct - a.ram_pct)[0]

  if (peakRamSample !== undefined) {
    const secs = secondsBeforeMarker(peakRamSample.ts, issue_marker_at)
    signals.push({
      type: 'metric',
      description: `RAM usage peaked at ${peakRamSample.ram_pct.toFixed(1)}% during the incident`,
      technical: `ram_pct=${peakRamSample.ram_pct.toFixed(1)} ram_used_mb=${peakRamSample.ram_used_mb} ram_total_mb=${peakRamSample.ram_total_mb} — ${peakRamSample.ts}`,
      window: 'incident',
      severity: 'critical',
      ts: peakRamSample.ts,
      seconds_before_marker: secs,
    })
  }

  // ── Supporting signals ─────────────────────────────────────────────────────

  // RAM > 90% sustained for 3+ consecutive samples.
  const sustainedHighRam = consecutiveSamplesAbove(metrics, 'ram_pct', 90, windows, 'incident')
  const hasHighRamSustained = sustainedHighRam >= 3

  if (hasHighRamSustained) {
    signals.push({
      type: 'metric',
      description: `RAM usage was above 90% for ${sustainedHighRam} consecutive samples — sustained high memory pressure`,
      technical: `consecutive_samples_above_90pct=${sustainedHighRam} window=incident`,
      window: 'incident',
      severity: 'supporting',
      ts: windows.incident_start,
      seconds_before_marker: secondsBeforeMarker(windows.incident_start, issue_marker_at),
    })
  }

  // Game is the top memory consumer.
  const gameProcess = processes.find(
    (p) => p.name.toLowerCase() === app_name.toLowerCase(),
  )
  const isTopConsumer = (() => {
    if (!gameProcess) return false
    return processes.every(
      (p) => p.name === gameProcess.name || p.memory_mb <= gameProcess.memory_mb,
    )
  })()

  if (isTopConsumer && gameProcess !== undefined) {
    signals.push({
      type: 'process',
      description: `${gameProcess.name} was the top memory consumer at ${gameProcess.memory_mb} MB`,
      technical: `process=${gameProcess.name} memory_mb=${gameProcess.memory_mb}`,
      window: 'incident',
      severity: 'supporting',
      ts: windows.incident_end,
      seconds_before_marker: secondsBeforeMarker(windows.incident_end, issue_marker_at),
    })
  }

  // OOM exception code 0xe00000008 in Event ID 1000.
  const appErrorEvents = findEvents(incidentEvents, 1000)
  const oomEvent = appErrorEvents.find((e) =>
    e.message.toLowerCase().includes('0xe00000008'),
  )

  if (oomEvent !== undefined) {
    const secs = secondsBeforeMarker(oomEvent.ts, issue_marker_at)
    signals.push({
      type: 'event',
      description: 'Application crash was caused by an out-of-memory exception',
      technical: `Event ID 1000 — exception_code=0xe00000008 — ${oomEvent.ts}`,
      window: 'incident',
      severity: 'critical',
      ts: oomEvent.ts,
      seconds_before_marker: secs,
    })
  }

  // Page file thrashing: disk latency > 300ms in incident window.
  const peakDiskLatency = peakMetric(metrics, 'disk_latency_ms', windows, 'incident')
  if (peakDiskLatency > 300) {
    const thrashSample = metrics
      .filter((m) => {
        const ts = Date.parse(m.ts)
        return (
          ts >= Date.parse(windows.incident_start) &&
          ts <= Date.parse(windows.incident_end) &&
          m.disk_latency_ms === peakDiskLatency
        )
      })
      .sort((a, b) => b.disk_latency_ms - a.disk_latency_ms)[0]

    if (thrashSample !== undefined) {
      const secs = secondsBeforeMarker(thrashSample.ts, issue_marker_at)
      signals.push({
        type: 'metric',
        description: `Disk latency spiked to ${peakDiskLatency.toFixed(0)}ms — consistent with page file thrashing`,
        technical: `disk_latency_ms=${peakDiskLatency.toFixed(0)} — ${thrashSample.ts}`,
        window: 'incident',
        severity: 'supporting',
        ts: thrashSample.ts,
        seconds_before_marker: secs,
      })
    }
  }

  // ── Confidence determination ───────────────────────────────────────────────

  // HIGH: Event ID 2004 + RAM > 90% sustained + game is top consumer
  // MEDIUM: Event ID 2004 alone OR RAM > 95% in incident window
  // LOW: RAM > 90% in incident window without Event ID 2004

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW'

  if (hasEvent2004 && hasHighRamSustained && isTopConsumer) {
    confidence = 'HIGH'
  } else if (hasEvent2004 || commitAbove95) {
    confidence = 'MEDIUM'
  } else {
    // RAM > 90% but < 95%, no Event 2004 → LOW
    confidence = 'LOW'
  }

  // ── Output text ────────────────────────────────────────────────────────────

  const peakRamForText = Math.max(peakRamPctIncident, peakRamOverall)
  let outputText: string

  if (confidence === 'HIGH') {
    outputText =
      `The system ran out of available memory during the session. Windows logged ` +
      `a resource exhaustion event, RAM usage was at ${peakRamForText.toFixed(1)}% ` +
      `and ${app_name} was the top memory consumer. Memory exhaustion caused the crash.`
  } else if (confidence === 'MEDIUM') {
    outputText =
      `RAM usage was critically high during the session (${peakRamForText.toFixed(1)}% at peak). ` +
      `This is consistent with memory exhaustion, though a definitive Windows resource event ` +
      `was not logged.`
  } else {
    outputText =
      `RAM usage was elevated during the session (${peakRamForText.toFixed(1)}% at peak). ` +
      `Memory pressure may have contributed to the crash, but the evidence is insufficient ` +
      `to confirm memory exhaustion as the primary cause.`
  }

  return {
    rulePackId: 'memory-exhaustion',
    fired: true,
    confidence,
    signals,
    disqualifiedBy,
    fixRecommendations: FIX_RECOMMENDATIONS,
    outputText,
  }
}
