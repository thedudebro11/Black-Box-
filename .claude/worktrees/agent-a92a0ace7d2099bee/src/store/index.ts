import { create } from 'zustand'
import type { AnalysisResult, Session } from '../types/global'

export type Screen = 'welcome' | 'describe' | 'record' | 'analyzing' | 'results' | 'history'

interface AppState {
  // ── Navigation ──────────────────────────────────────────────────────────────
  currentScreen: Screen
  navigate: (screen: Screen) => void

  // ── Analysis result ─────────────────────────────────────────────────────────
  analysisResult: AnalysisResult | null
  setAnalysisResult: (result: AnalysisResult) => void

  // ── History ─────────────────────────────────────────────────────────────────
  historySessions: Session[]
  setHistorySessions: (sessions: Session[]) => void

  // ── Historic result view (read-only from history) ────────────────────────────
  viewingHistoricResult: boolean
  setViewingHistoricResult: (v: boolean) => void

  // ── Reset ────────────────────────────────────────────────────────────────────
  resetSession: () => void
}

export const useStore = create<AppState>((set) => ({
  currentScreen: 'welcome',
  navigate: (screen) => set({ currentScreen: screen }),

  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),

  historySessions: [],
  setHistorySessions: (sessions) => set({ historySessions: sessions }),

  viewingHistoricResult: false,
  setViewingHistoricResult: (v) => set({ viewingHistoricResult: v }),

  resetSession: () =>
    set({
      analysisResult: null,
    }),
}))
