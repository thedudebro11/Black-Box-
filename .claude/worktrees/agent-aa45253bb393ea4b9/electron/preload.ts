import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  recorder: {
    startRecording: (params: { issueType: string; appName: string; description: string }) =>
      ipcRenderer.invoke('recorder:start', params),
    markIssue: () => ipcRenderer.invoke('recorder:mark-issue'),
    stopRecording: () => ipcRenderer.invoke('recorder:stop'),
  },
  analyzer: {
    analyzeSession: (sessionId: string) => ipcRenderer.invoke('analyzer:analyze', sessionId),
  },
  telemetry: {
    uploadSession: (sessionId: string) => ipcRenderer.invoke('telemetry:upload', sessionId),
  },
  export: {
    saveReport: (payload: { markdown: string; filename: string }) =>
      ipcRenderer.invoke('export:save-report', payload),
  },
})
