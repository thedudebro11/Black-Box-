import { create } from 'zustand'
import type { IssueType, AnalysisResult, AnalyzerPhase, LiveMetricsSample, Session } from '../types/global'

export type Screen = 'welcome' | 'describe' | 'record' | 'analyzing' | 'results' | 'history'

interface AppState {
  // ── Navigation ──────────────────────────────────────────────────────────────
  currentScreen: Screen
  navigate: (screen: Screen) => void

  // ── Session intake (Describe screen) ────────────────────────────────────────
  issueType: IssueType
  appName: string
  description: string
  setIssueType: (v: IssueType) => void
  setAppName: (v: string) => void
  setDescription: (v: string) => void

  // ── Recording state (Record screen) ─────────────────────────────────────────
  sessionId: string | null
  isRecording: boolean
  recordingStartedAt: string | null
  issueMarkerCount: number
  liveMetrics: LiveMetricsSample | null
  setSessionId: (id: string) => void
  setIsRecording: (v: boolean) => void
  setRecordingStartedAt: (ts: string) => void
  incrementIssueMarkerCount: () => void
  setLiveMetrics: (m: LiveMetricsSample) => void

  // ── Analysis state (Analyzing screen) ───────────────────────────────────────
  analyzerPhase: AnalyzerPhase | null
  analyzerProgress: number
  analysisResult: AnalysisResult | null
  setAnalyzerStatus: (phase: AnalyzerPhase, progress: number) => void
  setAnalysisResult: (result: AnalysisResult) => void

  // ── Follow-up modal ──────────────────────────────────────────────────────────
  pendingFollowUp: { followUpId: string; sessionId: string } | null
  showFollowUpModal: boolean
  setPendingFollowUp: (payload: { followUpId: string; sessionId: string } | null) => void
  setShowFollowUpModal: (v: boolean) => void

  // ── Session history ──────────────────────────────────────────────────────────
  historySessions: Session[]
  setHistorySessions: (sessions: Session[]) => void
  viewingHistoricResult: boolean
  setViewingHistoricResult: (v: boolean) => void

  // ── Reset ────────────────────────────────────────────────────────────────────
  resetSession: () => void
}

export const useStore = create<AppState>((set) => ({
  currentScreen: 'welcome',
  navigate: (screen) => set({ currentScreen: screen }),

  issueType: 'crash',
  appName: '',
  description: '',
  setIssueType: (v) => set({ issueType: v }),
  setAppName: (v) => set({ appName: v }),
  setDescription: (v) => set({ description: v }),

  sessionId: null,
  isRecording: false,
  recordingStartedAt: null,
  issueMarkerCount: 0,
  liveMetrics: null,
  setSessionId: (id) => set({ sessionId: id }),
  setIsRecording: (v) => set({ isRecording: v }),
  setRecordingStartedAt: (ts) => set({ recordingStartedAt: ts }),
  incrementIssueMarkerCount: () => set((s) => ({ issueMarkerCount: s.issueMarkerCount + 1 })),
  setLiveMetrics: (m) => set({ liveMetrics: m }),

  analyzerPhase: null,
  analyzerProgress: 0,
  analysisResult: null,
  setAnalyzerStatus: (phase, progress) => set({ analyzerPhase: phase, analyzerProgress: progress }),
  setAnalysisResult: (result) => set({ analysisResult: result }),

  pendingFollowUp: null,
  showFollowUpModal: false,
  setPendingFollowUp: (payload) => set({ pendingFollowUp: payload }),
  setShowFollowUpModal: (v) => set({ showFollowUpModal: v }),

  historySessions: [],
  setHistorySessions: (sessions) => set({ historySessions: sessions }),
  viewingHistoricResult: false,
  setViewingHistoricResult: (v) => set({ viewingHistoricResult: v }),

  resetSession: () =>
    set({
      sessionId: null,
      isRecording: false,
      recordingStartedAt: null,
      issueMarkerCount: 0,
      liveMetrics: null,
      analyzerPhase: null,
      analyzerProgress: 0,
      analysisResult: null,
      appName: '',
      description: '',
      issueType: 'crash',
    }),
}))
