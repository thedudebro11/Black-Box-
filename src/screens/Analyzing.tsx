import { useEffect, useRef } from 'react'
import { Activity, CheckCircle, Circle, AlertCircle } from 'lucide-react'
import { useStore } from '../store'
import type { AnalyzerPhase } from '../types/global'

const STEPS: { phase: AnalyzerPhase; label: string; progressThreshold: number }[] = [
  { phase: 'collecting', label: 'Reading Windows Event Log',    progressThreshold: 10 },
  { phase: 'parsing',    label: 'Parsing session trace',        progressThreshold: 40 },
  { phase: 'scoring',    label: 'Running rule packs',           progressThreshold: 70 },
  { phase: 'complete',   label: 'Generating output',            progressThreshold: 100 },
]

function stepStatus(
  stepThreshold: number,
  currentProgress: number,
  phase: AnalyzerPhase | null
): 'done' | 'active' | 'pending' | 'error' {
  if (phase === 'error') return stepThreshold <= (currentProgress || 0) ? 'error' : 'pending'
  if (currentProgress >= stepThreshold) return 'done'
  if (currentProgress >= stepThreshold - 30) return 'active'
  return 'pending'
}

export default function Analyzing() {
  const {
    navigate,
    sessionId,
    analyzerPhase, analyzerProgress,
    setAnalyzerStatus, setAnalysisResult,
  } = useStore()

  const analysisStarted = useRef(false)

  useEffect(() => {
    if (analysisStarted.current) return
    analysisStarted.current = true

    if (!sessionId) {
      navigate('welcome')
      return
    }

    // Subscribe to push events for progress display only
    const unsubscribe = window.electron.analyzer.onStatus((payload) => {
      setAnalyzerStatus(payload.phase, payload.progress)
    })

    window.electron.analyzer
      .analyzeSession(sessionId)
      .then((res) => {
        unsubscribe()
        if (res.ok && res.result) {
          setAnalysisResult(res.result)
          // Small delay so the user sees the complete state before navigating
          setTimeout(() => navigate('results'), 600)
        } else {
          setAnalyzerStatus('error', 0)
        }
      })
      .catch(() => {
        unsubscribe()
        setAnalyzerStatus('error', 0)
      })

    return unsubscribe
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isError = analyzerPhase === 'error'

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen px-8 py-16">
      <div className="w-full max-w-md">
        {/* Icon + heading */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div
            className={[
              'w-12 h-12 rounded-full border flex items-center justify-center mb-4',
              isError
                ? 'border-red-500/40'
                : 'border-accent/40',
            ].join(' ')}
          >
            {isError ? (
              <AlertCircle size={22} className="text-red-400" />
            ) : (
              <Activity
                size={22}
                className={analyzerPhase === 'complete' ? 'text-confidence-high' : 'text-accent animate-pulse'}
              />
            )}
          </div>
          <h2 className="text-primary text-xl font-semibold mb-1">
            {isError ? 'Analysis Failed' : 'Analyzing Your Session'}
          </h2>
          <p className="text-secondary text-sm">
            {isError
              ? 'An error occurred during analysis. The session data has been saved.'
              : 'Black Box is correlating signals against known crash patterns.'}
          </p>
        </div>

        {/* Progress bar */}
        {!isError && (
          <div className="mb-6 h-1 bg-app-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${analyzerProgress}%` }}
            />
          </div>
        )}

        {/* Step list */}
        <div className="space-y-3 mb-8">
          {STEPS.map(({ label, progressThreshold }) => {
            const status = stepStatus(progressThreshold, analyzerProgress, analyzerPhase)
            return (
              <div key={label} className="flex items-center gap-3">
                {status === 'done' ? (
                  <CheckCircle size={14} className="text-confidence-high flex-shrink-0" />
                ) : status === 'active' ? (
                  <Circle size={14} className="text-accent flex-shrink-0 animate-pulse" />
                ) : status === 'error' ? (
                  <AlertCircle size={14} className="text-red-400/60 flex-shrink-0" />
                ) : (
                  <Circle size={14} className="text-app-border flex-shrink-0" />
                )}
                <span
                  className={[
                    'text-sm font-mono',
                    status === 'done'
                      ? 'text-secondary line-through'
                      : status === 'active'
                        ? 'text-primary'
                        : 'text-secondary/50',
                  ].join(' ')}
                >
                  {label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Error recovery */}
        {isError && (
          <button
            onClick={() => navigate('welcome')}
            className="w-full py-2.5 border border-app-border rounded text-sm text-secondary hover:text-primary transition-colors focus:outline-none"
          >
            Start a New Session
          </button>
        )}
      </div>
    </div>
  )
}
