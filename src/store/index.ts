import { create } from 'zustand'

export type Screen = 'welcome' | 'describe' | 'record' | 'analyzing' | 'results' | 'history'

interface AppState {
  currentScreen: Screen
  navigate: (screen: Screen) => void
}

export const useStore = create<AppState>((set) => ({
  currentScreen: 'welcome',
  navigate: (screen) => set({ currentScreen: screen }),
}))
