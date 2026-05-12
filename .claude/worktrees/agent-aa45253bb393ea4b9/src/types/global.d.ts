export interface SignalMatch {
  type: 'event' | 'metric' | 'process'
  description: string
  technical: string
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
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null
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
  primary_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null
  primary_cause_name: string | null
  primary_output_text: string | null
  secondary_results: RuleResult[]
  all_signals_found: SignalMatch[]
  fix_recommendations: FixStep[]
  inconclusive_reason: string | null
  created_at: string
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
  export: {
    saveReport: (payload: {
      markdown: string
      filename: string
    }) => Promise<{ ok: boolean; filePath?: string; error?: string }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
