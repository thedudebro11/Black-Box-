import { BarChart2, ChevronDown, Download, RotateCcw } from 'lucide-react'
import { useStore } from '../store'

export default function Results() {
  const navigate = useStore((s) => s.navigate)

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} className="text-accent" />
          <div>
            <h2 className="text-primary font-semibold text-lg">Session Results</h2>
            <p className="text-secondary text-sm">Valorant.exe — crash — 2 min ago</p>
          </div>
        </div>
        <button
          onClick={() => navigate('welcome')}
          className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors"
        >
          <RotateCcw size={12} /> New Session
        </button>
      </div>

      {/* Primary cause card */}
      <div className="bg-surface border border-app-border rounded-lg p-5 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-secondary">
              Most Likely Cause
            </span>
            <h3 className="text-primary font-semibold text-base mt-0.5">
              GPU Driver Instability / TDR
            </h3>
          </div>
          <span className="px-2.5 py-1 text-xs font-mono font-semibold rounded bg-confidence-high/15 text-confidence-high border border-confidence-high/30">
            HIGH
          </span>
        </div>
        <p className="text-secondary text-sm leading-relaxed mb-4">
          A GPU driver reset was detected 12 seconds before the crash. GPU utilization was at 94%
          at the time. This strongly indicates GPU driver instability.
        </p>

        {/* Evidence list */}
        <div className="border-t border-app-border pt-4 mb-4">
          <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
            Evidence Found
          </div>
          <div className="space-y-2">
            {[
              { id: 'Event 153 — nvlddmkm', plain: 'GPU driver reset (TDR) occurred', rel: '12s before crash' },
              { id: 'GPU utilization 94%', plain: 'High GPU load in incident window', rel: '10s before crash' },
              { id: 'Event 141 — LiveKernelEvent', plain: 'Kernel detected GPU hang', rel: '8s before crash' },
            ].map(({ id, plain, rel }) => (
              <div key={id} className="bg-app-bg rounded p-3">
                <div className="font-mono text-xs text-accent mb-0.5">{id}</div>
                <div className="text-secondary text-xs">{plain}</div>
                <div className="text-secondary/50 text-xs font-mono mt-0.5">{rel}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Fix recommendations */}
        <div className="border-t border-app-border pt-4">
          <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
            Fix Recommendations
          </div>
          <ol className="space-y-2 list-none">
            {[
              'Open Device Manager → Display Adapters → update GPU driver',
              'If recently updated, roll back driver to previous version',
              'Monitor GPU temperatures under load — target below 85°C',
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="font-mono text-accent text-xs mt-0.5 flex-shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-secondary">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Secondary causes (collapsed) */}
      <button className="w-full flex items-center justify-between px-4 py-3 bg-surface border border-app-border rounded-lg text-sm text-secondary hover:text-primary transition-colors mb-6">
        <span>Other possible causes (1)</span>
        <ChevronDown size={14} />
      </button>

      {/* Actions */}
      <button className="flex items-center gap-2 border border-app-border hover:border-accent/50 text-secondary hover:text-primary text-sm font-medium px-4 py-2.5 rounded transition-colors">
        <Download size={14} />
        Export Session Report
      </button>

      <div className="mt-10 pt-5 border-t border-app-border">
        <p className="text-xs text-secondary font-mono">
          PHASE 1 PLACEHOLDER — real data wired in Phase 7; showing design preview
        </p>
      </div>
    </div>
  )
}
