import { Activity } from 'lucide-react'
import { useStore } from '../store'

const STEPS = [
  { label: 'Reading Windows Event Log', done: true },
  { label: 'Parsing session trace', done: true },
  { label: 'Assigning time windows', done: true },
  { label: 'Running rule packs', done: false },
  { label: 'Scoring candidate causes', done: false },
  { label: 'Generating output', done: false },
]

export default function Analyzing() {
  const navigate = useStore((s) => s.navigate)

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen px-8 py-16">
      <div className="w-full max-w-md">
        {/* Icon + heading */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-12 h-12 rounded-full border border-accent/40 flex items-center justify-center mb-4">
            <Activity size={22} className="text-accent animate-pulse" />
          </div>
          <h2 className="text-primary text-xl font-semibold mb-1">Analyzing Your Session</h2>
          <p className="text-secondary text-sm">
            Black Box is correlating signals against known crash patterns.
          </p>
        </div>

        {/* Step list */}
        <div className="space-y-2 mb-10">
          {STEPS.map(({ label, done }, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className={[
                  'w-1.5 h-1.5 rounded-full flex-shrink-0',
                  done ? 'bg-confidence-high' : 'bg-app-border',
                ].join(' ')}
              />
              <span
                className={[
                  'text-sm font-mono',
                  done ? 'text-secondary line-through' : 'text-primary',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Dev skip button */}
        <button
          onClick={() => navigate('results')}
          className="text-xs text-secondary hover:text-accent font-mono underline transition-colors"
        >
          [dev] skip to results →
        </button>

        <div className="mt-10 pt-5 border-t border-app-border text-center">
          <p className="text-xs text-secondary font-mono">
            PHASE 1 PLACEHOLDER — processing state, progress indication, analysis messaging
          </p>
        </div>
      </div>
    </div>
  )
}
