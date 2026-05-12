import { ipcMain, app } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createSession, updateSession } from '../../src/db/sessions'
import { createAnalysisResult } from '../../src/db/analysis'
import { analyzeSession } from '../../src/engine/analyzer'
import type { IssueType } from '../../src/types/global'

type Scenario = 'gpu-driver' | 'memory-exhaustion' | 'app-hang'

const SCENARIO_META: Record<Scenario, { appName: string; issueType: IssueType }> = {
  'gpu-driver':        { appName: 'TestGame.exe',  issueType: 'crash'    },
  'memory-exhaustion': { appName: 'HeavyGame.exe', issueType: 'crash'    },
  'app-hang':          { appName: 'MyApp.exe',     issueType: 'app_hang' },
}

function buildParsedSession(scenario: Scenario, sessionId: string) {
  const T = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()

  const markerTs = iso(T)
  const windows = {
    baseline_start: iso(T - 5 * 60_000),
    baseline_end:   iso(T - 60_000),
    incident_start: iso(T - 60_000),
    incident_end:   markerTs,
    aftermath_start: markerTs,
    aftermath_end:  iso(T + 2 * 60_000),
  }

  const hardware = {
    gpu_model:          'NVIDIA GeForce RTX 4060',
    gpu_driver_version: '536.23',
    os_version:         'Windows 11 Pro 22631',
    ram_total_mb:       16_000,
  }

  const base = {
    id: sessionId,
    started_at: iso(T - 120_000),
    stopped_at:  iso(T + 5_000),
    issue_marker_at: markerTs,
    windows,
    hardware,
  }

  if (scenario === 'gpu-driver') {
    return {
      ...base,
      issue_type: 'crash' as IssueType,
      app_name: 'TestGame.exe',
      events: [
        {
          type: 'event' as const,
          ts: iso(T - 15_000),
          source: 'System',
          provider: 'Display',
          event_id: 4101,
          level: 'Error',
          message: 'Display driver stopped responding and has successfully recovered.',
          collected_at: iso(T),
        },
        {
          type: 'event' as const,
          ts: iso(T - 12_000),
          source: 'System',
          provider: 'nvlddmkm',
          event_id: 153,
          level: 'Error',
          message: 'Reset to device, \\Device\\RaidPort0, was issued.',
          collected_at: iso(T),
        },
      ],
      metrics: [
        { ts: iso(T - 50_000), cpu_pct: 45, ram_used_mb: 9920,  ram_total_mb: 16_000, ram_pct: 62.0, disk_latency_ms: 8,  gpu_pct: 94, vram_used_mb: 7200, vram_total_mb: 8000 },
        { ts: iso(T - 40_000), cpu_pct: 47, ram_used_mb: 10_000, ram_total_mb: 16_000, ram_pct: 62.5, disk_latency_ms: 10, gpu_pct: 94, vram_used_mb: 7350, vram_total_mb: 8000 },
        { ts: iso(T - 30_000), cpu_pct: 44, ram_used_mb: 9800,  ram_total_mb: 16_000, ram_pct: 61.0, disk_latency_ms: 9,  gpu_pct: 94, vram_used_mb: 7100, vram_total_mb: 8000 },
        { ts: iso(T - 20_000), cpu_pct: 46, ram_used_mb: 10_100, ram_total_mb: 16_000, ram_pct: 63.0, disk_latency_ms: 11, gpu_pct: 94, vram_used_mb: 7250, vram_total_mb: 8000 },
        { ts: iso(T - 10_000), cpu_pct: 48, ram_used_mb: 10_200, ram_total_mb: 16_000, ram_pct: 63.7, disk_latency_ms: 12, gpu_pct: 94, vram_used_mb: 7400, vram_total_mb: 8000 },
      ],
      processes: [
        { name: 'TestGame.exe', pid: 9800, cpu_pct: 22, memory_mb: 3200, first_seen: iso(T - 60_000), last_seen: iso(T - 3_000), exit_detected: true },
        { name: 'explorer.exe', pid: 1234, cpu_pct: 1,  memory_mb: 120,  first_seen: iso(T - 60_000), last_seen: iso(T),         exit_detected: false },
      ],
    }
  }

  if (scenario === 'memory-exhaustion') {
    return {
      ...base,
      issue_type: 'crash' as IssueType,
      app_name: 'HeavyGame.exe',
      events: [
        {
          type: 'event' as const,
          ts: iso(T - 20_000),
          source: 'System',
          provider: 'Microsoft-Windows-Resource-Exhaustion-Detector',
          event_id: 2004,
          level: 'Warning',
          message: 'Windows successfully diagnosed a low virtual memory condition. The following programs consumed the most virtual memory: HeavyGame.exe (1234)',
          collected_at: iso(T),
        },
      ],
      metrics: [
        { ts: iso(T - 55_000), cpu_pct: 65, ram_used_mb: 15_360, ram_total_mb: 16_000, ram_pct: 96.0, disk_latency_ms: 280, gpu_pct: 45, vram_used_mb: 4000, vram_total_mb: 8000 },
        { ts: iso(T - 45_000), cpu_pct: 70, ram_used_mb: 15_520, ram_total_mb: 16_000, ram_pct: 97.0, disk_latency_ms: 310, gpu_pct: 44, vram_used_mb: 4100, vram_total_mb: 8000 },
        { ts: iso(T - 35_000), cpu_pct: 72, ram_used_mb: 15_600, ram_total_mb: 16_000, ram_pct: 97.5, disk_latency_ms: 320, gpu_pct: 43, vram_used_mb: 4050, vram_total_mb: 8000 },
        { ts: iso(T - 25_000), cpu_pct: 75, ram_used_mb: 15_680, ram_total_mb: 16_000, ram_pct: 98.0, disk_latency_ms: 350, gpu_pct: 44, vram_used_mb: 4200, vram_total_mb: 8000 },
        { ts: iso(T - 15_000), cpu_pct: 78, ram_used_mb: 15_840, ram_total_mb: 16_000, ram_pct: 99.0, disk_latency_ms: 380, gpu_pct: 42, vram_used_mb: 4150, vram_total_mb: 8000 },
      ],
      processes: [
        { name: 'HeavyGame.exe', pid: 4400, cpu_pct: 35, memory_mb: 8200, first_seen: iso(T - 60_000), last_seen: iso(T - 2_000), exit_detected: true },
        { name: 'chrome.exe',    pid: 1200, cpu_pct: 5,  memory_mb: 2000, first_seen: iso(T - 60_000), last_seen: iso(T),         exit_detected: false },
        { name: 'explorer.exe',  pid: 1234, cpu_pct: 1,  memory_mb: 120,  first_seen: iso(T - 60_000), last_seen: iso(T),         exit_detected: false },
      ],
    }
  }

  // app-hang
  return {
    ...base,
    issue_type: 'app_hang' as IssueType,
    app_name: 'MyApp.exe',
    events: [
      {
        type: 'event' as const,
        ts: iso(T - 30_000),
        source: 'Application',
        provider: 'Application Hang',
        event_id: 1002,
        level: 'Error',
        message: 'The program MyApp.exe version 1.2.0.0 stopped interacting with Windows and was closed. Hang type: Unknown.',
        collected_at: iso(T),
      },
    ],
    metrics: [
      { ts: iso(T - 55_000), cpu_pct: 50, ram_used_mb: 8000, ram_total_mb: 16_000, ram_pct: 50.0, disk_latency_ms: 45,   gpu_pct: 30, vram_used_mb: 2000, vram_total_mb: 8000 },
      { ts: iso(T - 45_000), cpu_pct: 52, ram_used_mb: 8100, ram_total_mb: 16_000, ram_pct: 50.6, disk_latency_ms: 820,  gpu_pct: 28, vram_used_mb: 2000, vram_total_mb: 8000 },
      { ts: iso(T - 35_000), cpu_pct: 48, ram_used_mb: 8050, ram_total_mb: 16_000, ram_pct: 50.3, disk_latency_ms: 1200, gpu_pct: 25, vram_used_mb: 1950, vram_total_mb: 8000 },
      { ts: iso(T - 25_000), cpu_pct: 10, ram_used_mb: 8000, ram_total_mb: 16_000, ram_pct: 50.0, disk_latency_ms: 1450, gpu_pct: 5,  vram_used_mb: 1900, vram_total_mb: 8000 },
      { ts: iso(T - 15_000), cpu_pct: 5,  ram_used_mb: 7900, ram_total_mb: 16_000, ram_pct: 49.4, disk_latency_ms: 280,  gpu_pct: 2,  vram_used_mb: 1900, vram_total_mb: 8000 },
    ],
    processes: [
      { name: 'MyApp.exe',    pid: 8888, cpu_pct: 5, memory_mb: 3500, first_seen: iso(T - 60_000), last_seen: iso(T - 5_000), exit_detected: true },
      { name: 'explorer.exe', pid: 1234, cpu_pct: 1, memory_mb: 120,  first_seen: iso(T - 60_000), last_seen: iso(T),         exit_detected: false },
    ],
  }
}

export function registerDevtoolsHandlers(): void {
  ipcMain.handle('devtools:simulate-scenario', async (_event, scenario: string) => {
    try {
      const meta = SCENARIO_META[scenario as Scenario]
      if (!meta) return { ok: false, error: `Unknown scenario: ${scenario}` }

      const session = createSession({
        issue_type: meta.issueType,
        app_name:   meta.appName,
        description: `[DEV] Simulated: ${scenario}`,
      })

      const tracesDir = join(app.getPath('userData'), 'traces')
      mkdirSync(tracesDir, { recursive: true })
      const traceFilePath = join(tracesDir, `${session.id}.ndjson`)
      const now = new Date().toISOString()
      writeFileSync(
        traceFilePath,
        [
          JSON.stringify({ type: 'session_start', ts: new Date(Date.now() - 120_000).toISOString() }),
          JSON.stringify({ type: 'issue_marker',  ts: now }),
          JSON.stringify({ type: 'session_stop',  ts: new Date(Date.now() + 5_000).toISOString() }),
        ].join('\n') + '\n',
        'utf8'
      )

      updateSession(session.id, {
        trace_file_path: traceFilePath,
        stopped_at: new Date(Date.now() + 5_000).toISOString(),
        issue_marker_at: now,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = buildParsedSession(scenario as Scenario, session.id) as any
      const engineResult = analyzeSession(parsed)

      const dbResult = createAnalysisResult({
        session_id:             session.id,
        outcome:                engineResult.outcome,
        primary_rule_pack_id:   engineResult.primary_rule_pack_id,
        primary_confidence:     engineResult.primary_confidence,
        primary_cause_name:     engineResult.primary_cause_name,
        primary_output_text:    engineResult.primary_output_text,
        secondary_results:      engineResult.secondary_results,
        all_signals_found:      engineResult.all_signals_found,
        fix_recommendations:    engineResult.fix_recommendations,
        inconclusive_reason:    engineResult.inconclusive_reason,
      })

      const finalStatus = engineResult.outcome === 'inconclusive' ? 'inconclusive' : 'complete'
      updateSession(session.id, { status: finalStatus, analyzed_at: new Date().toISOString() })

      console.log(`[devtools] simulated ${scenario} → outcome=${engineResult.outcome} confidence=${engineResult.primary_confidence}`)
      return { ok: true, sessionId: session.id, result: dbResult }
    } catch (err) {
      console.error('[devtools] simulate-scenario error', err)
      return { ok: false, error: String(err) }
    }
  })
}
