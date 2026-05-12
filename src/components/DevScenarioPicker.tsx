import { useState } from 'react'
import { X, Zap, MemoryStick, PauseCircle, Loader } from 'lucide-react'
import { useStore } from '../store'

interface Scenario {
  id: string
  label: string
  confidence: 'HIGH' | 'MEDIUM'
  description: string
  icon: React.ReactNode
}

const SCENARIOS: Scenario[] = [
  {
    id: 'gpu-driver',
    label: 'GPU Driver Crash',
    confidence: 'HIGH',
    description: 'TDR event (ID 153) + Display driver event (ID 4101) + GPU at 94% + game process exit. Rule Pack 1.',
    icon: <Zap size={16} />,
  },
  {
    id: 'memory-exhaustion',
    label: 'Memory Exhaustion',
    confidence: 'HIGH',
    description: 'Resource exhaustion event (ID 2004) + RAM sustained at 97–99% + game is top consumer. Rule Pack 4.',
    icon: <MemoryStick size={16} />,
  },
  {
    id: 'app-hang',
    label: 'App Hang / Freeze',
    confidence: 'HIGH',
    description: 'Application Hang event (ID 1002) + disk latency spiking to 1450ms. Rule Pack 5.',
    icon: <PauseCircle size={16} />,
  },
]

interface Props {
  onClose: () => void
}

export default function DevScenarioPicker({ onClose }: Props) {
  const { setSessionId, setAnalysisResult, navigate } = useStore()
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (scenarioId: string) => {
    if (!window.electron.devtools) return
    setRunning(scenarioId)
    setError(null)

    try {
      const res = await window.electron.devtools.simulateScenario(scenarioId)
      if (res.ok && res.sessionId && res.result) {
        setSessionId(res.sessionId)
        setAnalysisResult(res.result)
        navigate('results')
      } else {
        setError(res.error ?? 'Unknown error')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-app-surface border border-app-border rounded-lg w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <div>
            <p className="text-primary font-semibold text-sm">Test Scenarios</p>
            <p className="text-secondary text-xs mt-0.5">Dev mode — not shown in production builds</p>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors focus:outline-none"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scenario list */}
        <div className="p-4 space-y-2">
          {SCENARIOS.map((s) => {
            const isRunning = running === s.id
            return (
              <button
                key={s.id}
                onClick={() => run(s.id)}
                disabled={running !== null}
                className={[
                  'w-full text-left px-4 py-3 rounded border transition-colors focus:outline-none',
                  running !== null && !isRunning
                    ? 'border-app-border opacity-40 cursor-not-allowed'
                    : 'border-app-border hover:border-accent/40 hover:bg-accent/5 cursor-pointer',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-secondary mt-0.5 flex-shrink-0">
                    {isRunning ? <Loader size={16} className="animate-spin text-accent" /> : s.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-primary text-sm font-medium">{s.label}</span>
                      <span
                        className={[
                          'text-xs font-mono px-1.5 py-0.5 rounded',
                          s.confidence === 'HIGH'
                            ? 'text-confidence-high bg-confidence-high/10'
                            : 'text-confidence-medium bg-confidence-medium/10',
                        ].join(' ')}
                      >
                        {s.confidence}
                      </span>
                    </div>
                    <p className="text-secondary text-xs leading-relaxed">{s.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mx-4 mb-4 px-3 py-2 rounded border border-red-500/30 bg-red-500/10">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}
      </div>
    </div>
  )
}
