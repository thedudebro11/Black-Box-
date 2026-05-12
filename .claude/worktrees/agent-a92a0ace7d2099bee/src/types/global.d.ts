export type SessionStatus =
  | 'recording'
  | 'analyzing'
  | 'complete'
  | 'inconclusive'
  | 'error'
  | 'interrupted'

export type IssueType = 'crash' | 'freeze' | 'bsod' | 'app_hang'

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Session {
  id: string
  status: SessionStatus
  issue_type: IssueType
  app_name: string
  description: string | null
  started_at: string
  stopped_at: string | null
  issue_marker_at: string | null
  analyzed_at: string | null
  trace_file_path: string | null
  trace_truncated: boolean
  created_at: string
  updated_at: string
}

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
  response: string | null
  resolution_notes: string | null
  uploaded: boolean
  expires_at: string
  created_at: string
  updated_at: string
}

export interface ElectronAPI {
  recorder: {
    startRecording: (params: {
      issueType: string
      appName: string
      description: string
    }) => Promise<{ ok: boolean; sessionId: string | null }>
    markIssue: () => Promise<{ ok: boolean; markedAt: string | null }>
    stopRecording: () => Promise<{ ok: boolean }>
  }
  analyzer: {
    analyzeSession: (sessionId: string) => Promise<{ ok: boolean; resultId: string | null }>
  }
  telemetry: {
    uploadSession: (sessionId: string) => Promise<{ ok: boolean }>
  }
  sessions: {
    list: () => Promise<Session[]>
    getWithResult: (
      sessionId: string
    ) => Promise<{ session: Session; result: AnalysisResult | null } | null>
    delete: (sessionId: string) => Promise<{ ok: boolean; error?: string }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
