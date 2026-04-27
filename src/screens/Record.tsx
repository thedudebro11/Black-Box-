import { Radio, Flag, Square, Clock } from 'lucide-react'
import { useStore } from '../store'

export default function Record() {
  const navigate = useStore((s) => s.navigate)

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <Radio size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="text-primary font-semibold text-lg">Recording Session</h2>
          <p className="text-secondary text-sm">Reproduce the problem, then press Stop</p>
        </div>
      </div>

      {/* Timer display */}
      <div className="bg-surface border border-app-border rounded-lg p-6 mb-6 font-mono">
        <div className="text-xs text-secondary uppercase tracking-wider mb-2">Elapsed Time</div>
        <div className="text-4xl text-primary font-semibold">00:00:00</div>
        <div className="text-xs text-secondary mt-2">Recording active — Valorant.exe</div>
      </div>

      {/* Issue marker — prominent button */}
      <button className="w-full flex items-center justify-center gap-3 bg-amber-500/10 border-2 border-amber-500/40 hover:border-amber-500/70 hover:bg-amber-500/15 text-amber-400 font-semibold py-5 rounded-lg mb-4 transition-colors text-sm">
        <Flag size={18} />
        Mark Issue — Press When Something Feels Wrong
      </button>

      {/* Stop recording */}
      <button
        onClick={() => navigate('analyzing')}
        className="w-full flex items-center justify-center gap-2 bg-surface border border-app-border hover:border-red-500/40 hover:text-red-400 text-primary font-medium py-3 rounded-lg transition-colors text-sm"
      >
        <Square size={14} />
        Stop Recording
      </button>

      {/* Live signal indicators (placeholder) */}
      <div className="mt-6 bg-surface border border-app-border rounded-lg p-4">
        <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
          Live Signals
        </div>
        <div className="space-y-2">
          {['CPU', 'RAM', 'GPU', 'Disk'].map((metric) => (
            <div key={metric} className="flex items-center justify-between">
              <span className="text-xs font-mono text-secondary">{metric}</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-app-border rounded-full overflow-hidden">
                  <div className="h-full bg-accent/60 rounded-full w-1/3" />
                </div>
                <span className="text-xs font-mono text-secondary w-10 text-right">—</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 text-xs text-secondary font-mono">
        <Clock size={11} />
        Issue markers, elapsed time, live CPU/RAM/GPU/disk signals, stop button
      </div>
    </div>
  )
}
