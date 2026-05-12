import { contextBridge, ipcRenderer } from 'electron'
import type { AnalysisResult, IssueType, LiveMetricsSample, AnalyzerStatusPayload } from '../src/types/global'

contextBridge.exposeInMainWorld('electron', {
  recorder: {
    startRecording: (params: {
      issueType: IssueType
      appName: string
      description: string | null
    }) => ipcRenderer.invoke('recorder:start', params),
    markIssue: () => ipcRenderer.invoke('recorder:mark-issue'),
    stopRecording: () => ipcRenderer.invoke('recorder:stop'),
    onLiveMetrics: (cb: (sample: LiveMetricsSample) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, sample: LiveMetricsSample) => cb(sample)
      ipcRenderer.on('recorder:live-metrics', listener)
      return () => ipcRenderer.removeListener('recorder:live-metrics', listener)
    },
  },
  analyzer: {
    analyzeSession: (sessionId: string): Promise<{ ok: boolean; result?: AnalysisResult; error?: string }> =>
      ipcRenderer.invoke('analyzer:analyze', sessionId),
    onStatus: (cb: (payload: AnalyzerStatusPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: AnalyzerStatusPayload) =>
        cb(payload)
      ipcRenderer.on('analyzer:status', listener)
      // Return a cleanup function so the renderer can unsubscribe
      return () => ipcRenderer.removeListener('analyzer:status', listener)
    },
  },
  telemetry: {
    uploadSession: (sessionId: string) => ipcRenderer.invoke('telemetry:upload', sessionId),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setTelemetryOptIn: (optIn: boolean) =>
      ipcRenderer.invoke('settings:set-telemetry-opt-in', { optIn }),
    completeFirstLaunch: () => ipcRenderer.invoke('settings:complete-first-launch'),
  },
})
