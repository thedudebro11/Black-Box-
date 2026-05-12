import { useEffect, useRef, useState } from 'react'
import { Radio, Flag, Square } from 'lucide-react'
import { useStore } from '../store'

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function MetricBar({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  const pct = value !== null ? Math.min(100, Math.max(0, value)) : 0
  const color =
    pct >= 90 ? 'bg-confidence-medium' : pct >= 70 ? 'bg-accent/80' : 'bg-accent/50'

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-mono text-secondary w-8 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-app-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-secondary w-16 text-right">
        {value !== null ? `${value.toFixed(1)}${unit}` : '—'}
      </span>
    </div>
  )
}

export default function Record() {
  const {
    navigate,
    issueType, appName, description,
    sessionId, setSessionId,
    isRecording, setIsRecording,
    setRecordingStartedAt,
    issueMarkerCount, incrementIssueMarkerCount,
    liveMetrics, setLiveMetrics,
  } = useStore()

  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [markingIssue, setMarkingIssue] = useState(false)
  const [stopping, setStopping] = useState(false)
  const startedRef = useRef(false)

  // Start recording on mount (once)
  useEffect(() => {
    if (startedRef.current || isRecording) return
    startedRef.current = true

    window.electron.recorder
      .startRecording({ issueType, appName, description: description || null })
      .then((res) => {
        if (!res.ok || !res.sessionId) {
          setError(res.error ?? 'Failed to start recording')
          return
        }
        setSessionId(res.sessionId)
        setIsRecording(true)
        setRecordingStartedAt(new Date().toISOString())
      })
      .catch((err: unknown) => {
        setError(String(err))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer
  useEffect(() => {
    if (!isRecording) return
    const id = setInterval(() => setElapsed((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [isRecording])

  // Live metrics subscription
  useEffect(() => {
    const cleanup = window.electron.recorder.onLiveMetrics((sample) => {
      setLiveMetrics(sample)
    })
    return cleanup
  }, [setLiveMetrics])

  async function handleMarkIssue() {
    if (!isRecording || markingIssue) return
    setMarkingIssue(true)
    try {
      await window.electron.recorder.markIssue()
      incrementIssueMarkerCount()
    } catch {
      // non-fatal — recording continues
    } finally {
      setMarkingIssue(false)
    }
  }

  async function handleStop() {
    if (!isRecording || stopping) return
    setStopping(true)
    try {
      const res = await window.electron.recorder.stopRecording()
      if (!res.ok || !res.sessionId) {
        setError(res.error ?? 'Failed to stop recording')
        setStopping(false)
        return
      }
      setIsRecording(false)
      navigate('analyzing')
    } catch (err) {
      setError(String(err))
      setStopping(false)
    }
  }

  if (error) {
    return (
      <div className="px-8 py-10 max-w-2xl">
        <div className="bg-surface border border-red-500/30 rounded-lg p-5">
          <p className="text-sm text-red-400 font-mono mb-3">{error}</p>
          <button
            onClick={() => navigate('describe')}
            className="text-xs text-secondary hover:text-primary transition-colors"
          >
            ← Back to Describe
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center gap-2">
          {isRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          <Radio size={18} className={isRecording ? 'text-red-400' : 'text-secondary'} />
        </div>
        <div>
          <h2 className="text-primary font-semibold text-lg">
            {isRecording ? 'Recording Session' : 'Starting…'}
          </h2>
          <p className="text-secondary text-sm">
            {isRecording ? 'Reproduce the problem, then press Stop' : 'Initializing collectors'}
          </p>
        </div>
      </div>

      {/* Timer + session info */}
      <div className="bg-surface border border-app-border rounded-lg p-6 mb-6 font-mono">
        <div className="text-xs text-secondary uppercase tracking-wider mb-2">Elapsed Time</div>
        <div className="text-4xl text-primary font-semibold tabular-nums">
          {formatElapsed(elapsed)}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-secondary">{appName}</span>
          {issueMarkerCount > 0 && (
            <span className="text-xs font-mono text-confidence-medium">
              {issueMarkerCount} issue marker{issueMarkerCount !== 1 ? 's' : ''} set
            </span>
          )}
        </div>
      </div>

      {/* Issue marker */}
      <button
        onClick={handleMarkIssue}
        disabled={!isRecording || markingIssue}
        className="w-full flex items-center justify-center gap-3 bg-amber-500/10 border-2 border-amber-500/40 hover:border-amber-500/70 hover:bg-amber-500/15 disabled:opacity-50 disabled:cursor-not-allowed text-amber-400 font-semibold py-5 rounded-lg mb-4 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
      >
        <Flag size={18} />
        {markingIssue ? 'Marking…' : 'Mark Issue — Press When Something Feels Wrong'}
      </button>

      {/* Stop recording */}
      <button
        onClick={handleStop}
        disabled={!isRecording || stopping}
        className="w-full flex items-center justify-center gap-2 bg-surface border border-app-border hover:border-red-500/40 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-primary font-medium py-3 rounded-lg transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30"
      >
        <Square size={14} />
        {stopping ? 'Stopping…' : 'Stop Recording'}
      </button>

      {/* Live metrics */}
      <div className="mt-6 bg-surface border border-app-border rounded-lg p-4">
        <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
          Live Signals
        </div>
        <div className="space-y-3">
          <MetricBar label="CPU"  value={liveMetrics?.cpu_pct  ?? null} unit="%" />
          <MetricBar label="RAM"  value={liveMetrics?.ram_pct  ?? null} unit="%" />
          <MetricBar label="GPU"  value={liveMetrics?.gpu_pct  ?? null} unit="%" />
          <MetricBar
            label="Disk"
            value={liveMetrics?.disk_latency_ms ?? null}
            unit=" ms"
          />
        </div>
        {!liveMetrics && (
          <p className="text-xs text-secondary/50 font-mono mt-3">
            Waiting for first sample (10 s interval)…
          </p>
        )}
      </div>

      {/* Session ID (debug) */}
      {sessionId && (
        <p className="mt-4 text-xs text-secondary/40 font-mono">
          Session {sessionId.slice(-8)}
        </p>
      )}
    </div>
  )
}
