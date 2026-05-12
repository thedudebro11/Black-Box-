import { create } from 'zustand'
import type { AnalysisResult } from '../types/global'

export type Screen = 'welcome' | 'describe' | 'record' | 'analyzing' | 'results' | 'history'

interface AppState {
  currentScreen: Screen
  navigate: (screen: Screen) => void

  // Session intake data
  appName: string
  issueType: string
  sessionId: string
  sessionStartedAt: string

  setSessionIntake: (params: { appName: string; issueType: string }) => void
  setSessionId: (sessionId: string, startedAt: string) => void

  // Analysis result
  analysisResult: AnalysisResult | null
  setAnalysisResult: (result: AnalysisResult) => void
}

export const useStore = create<AppState>((set) => ({
  currentScreen: 'welcome',
  navigate: (screen) => set({ currentScreen: screen }),

  appName: '',
  issueType: '',
  sessionId: '',
  sessionStartedAt: '',

  setSessionIntake: ({ appName, issueType }) => set({ appName, issueType }),
  setSessionId: (sessionId, startedAt) =>
    set({ sessionId, sessionStartedAt: startedAt }),

  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
}))
