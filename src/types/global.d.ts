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
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
