// ── Domain types ──────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'recording'
  | 'analyzing'
  | 'complete'
  | 'inconclusive'
  | 'error'
  | 'interrupted'

export type IssueType = 'crash' | 'freeze' | 'bsod' | 'app_hang'

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

// ── Database entities ──────────────────────────────────────────────────────────

export interface Session {
  id: string
  status: SessionStatus
  issue_type: IssueType
  app_name: string
  description: string | null
  started_at: string        // ISO 8601
  stopped_at: string | null
  issue_marker_at: string | null
  analyzed_at: string | null
  trace_file_path: string | null
  trace_truncated: boolean  // true if trace hit the 50MB cap (ADR-014)
  created_at: string
  updated_at: string
}

export interface AppSettings {
  anonymous_session_id: string
  telemetry_opt_in: boolean
  first_launch_complete: boolean
  app_version: string
}

export interface FollowUp {
  id: string
  session_id: string
  scheduled_for: string
  sent_at: string | null
  response: string | null   // 'yes' | 'no' | 'still_working'
  resolution_notes: string | null
  uploaded: boolean
  expires_at: string
  created_at: string
  updated_at: string
}

export interface AnalysisResult {
  id: string
  session_id: string
  outcome: 'diagnosed' | 'inconclusive' | 'error'
  primary_rule_pack_id: string | null
  primary_confidence: Confidence | null
  primary_cause_name: string | null
  primary_output_text: string | null
  secondary_results: RuleResult[]
  all_signals_found: SignalMatch[]
  fix_recommendations: FixStep[]
  inconclusive_reason: string | null
  created_at: string
}

// ── Rules engine types ─────────────────────────────────────────────────────────

export interface SignalMatch {
  type: 'event' | 'metric' | 'process'
  description: string
  technical: string
  window: 'baseline' | 'incident' | 'aftermath'
  severity: 'critical' | 'supporting' | 'informational'
  ts: string
  seconds_before_marker: number
}

export interface FixStep {
  order: number
  title: string
  detail: string
  link?: string
}

export interface RuleResult {
  rulePackId: string
  fired: boolean
  confidence: Confidence | null
  signals: SignalMatch[]
  disqualifiedBy: string[]
  fixRecommendations: FixStep[]
  outputText: string
}

// ── IPC / Electron bridge ──────────────────────────────────────────────────────

export type AnalyzerPhase = 'collecting' | 'parsing' | 'scoring' | 'complete' | 'error'

export interface AnalyzerStatusPayload {
  phase: AnalyzerPhase
  progress: number
}

export interface LiveMetricsSample {
  cpu_pct: number
  ram_pct: number
  gpu_pct: number
  disk_latency_ms: number
}

export interface SimulateScenarioResult {
  ok: boolean
  sessionId?: string
  result?: AnalysisResult
  error?: string
}

export interface ElectronAPI {
  recorder: {
    startRecording: (params: {
      issueType: IssueType
      appName: string
      description: string | null
    }) => Promise<{ ok: boolean; sessionId?: string; error?: string }>
    markIssue: () => Promise<{ ok: boolean; ts?: string; error?: string }>
    stopRecording: () => Promise<{ ok: boolean; sessionId?: string; error?: string }>
    onLiveMetrics: (cb: (sample: LiveMetricsSample) => void) => () => void
  }
  analyzer: {
    analyzeSession: (
      sessionId: string
    ) => Promise<{ ok: boolean; result?: AnalysisResult; error?: string }>
    onStatus: (cb: (payload: AnalyzerStatusPayload) => void) => () => void
  }
  telemetry: {
    uploadSession: (sessionId: string) => Promise<{ success: boolean }>
  }
  settings: {
    get: () => Promise<AppSettings>
    setTelemetryOptIn: (optIn: boolean) => Promise<void>
    completeFirstLaunch: () => Promise<void>
  }
  export: {
    saveReport: (payload: { markdown: string; filename: string }) => Promise<{
      success: boolean
      filePath: string | null
    }>
  }
  sessions: {
    list: () => Promise<Session[]>
    getWithResult: (sessionId: string) => Promise<{ session: Session; result: AnalysisResult | null } | null>
    delete: (sessionId: string) => Promise<{ ok: boolean; error?: string }>
  }
  devtools?: {
    simulateScenario: (scenario: string) => Promise<SimulateScenarioResult>
  }
  followUp: {
    onShow: (callback: (payload: { followUpId: string; sessionId: string }) => void) => () => void
    submit: (params: {
      followUpId: string
      response: 'yes' | 'no' | 'still_working'
      notes: string | null
    }) => Promise<void>
    dismiss: () => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
