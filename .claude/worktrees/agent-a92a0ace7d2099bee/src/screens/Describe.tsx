import { FileText, ArrowRight, ArrowLeft } from 'lucide-react'
import { useStore } from '../store'

const ISSUE_TYPES = [
  { id: 'crash', label: 'Crash', desc: 'App or game suddenly closed' },
  { id: 'freeze', label: 'Freeze', desc: 'System or app became unresponsive' },
  { id: 'bsod', label: 'BSOD', desc: 'Blue screen of death' },
  { id: 'app_hang', label: 'App Hang', desc: 'App stopped responding but stayed open' },
]

export default function Describe() {
  const navigate = useStore((s) => s.navigate)

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <FileText size={20} className="text-accent" />
        <div>
          <h2 className="text-primary font-semibold text-lg">Describe the Problem</h2>
          <p className="text-secondary text-sm">Tell Black Box what happened before recording</p>
        </div>
      </div>

      {/* Issue type selector */}
      <div className="mb-6">
        <label className="block text-xs font-mono text-secondary uppercase tracking-wider mb-3">
          Issue Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ISSUE_TYPES.map(({ id, label, desc }) => (
            <button
              key={id}
              className="text-left p-3 rounded border border-app-border bg-surface hover:border-accent/50 hover:bg-surface-raised transition-colors"
            >
              <div className="text-primary text-sm font-medium">{label}</div>
              <div className="text-secondary text-xs mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* App name input */}
      <div className="mb-6">
        <label className="block text-xs font-mono text-secondary uppercase tracking-wider mb-2">
          App / Game Name
        </label>
        <input
          type="text"
          placeholder="e.g. Valorant, Chrome, Premiere Pro"
          className="w-full bg-surface border border-app-border rounded px-3 py-2.5 text-primary text-sm placeholder-secondary/50 focus:outline-none focus:border-accent/60"
        />
      </div>

      {/* Description textarea */}
      <div className="mb-8">
        <label className="block text-xs font-mono text-secondary uppercase tracking-wider mb-2">
          Brief Description{' '}
          <span className="text-secondary/50 normal-case tracking-normal">(optional)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Describe what you were doing when it happened…"
          className="w-full bg-surface border border-app-border rounded px-3 py-2.5 text-primary text-sm placeholder-secondary/50 focus:outline-none focus:border-accent/60 resize-none"
        />
      </div>

      {/* Nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('welcome')}
          className="flex items-center gap-1.5 text-secondary hover:text-primary text-sm transition-colors"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={() => navigate('record')}
          className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors"
        >
          Start Recording <ArrowRight size={14} />
        </button>
      </div>

      <div className="mt-10 pt-5 border-t border-app-border">
        <p className="text-xs text-secondary font-mono">
          PHASE 1 PLACEHOLDER — issue type selector, app/game name input, brief description field
        </p>
      </div>
    </div>
  )
}
