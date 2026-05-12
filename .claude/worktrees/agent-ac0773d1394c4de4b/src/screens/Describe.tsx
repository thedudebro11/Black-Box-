import { FileText, ArrowRight, ArrowLeft } from 'lucide-react'
import { useStore } from '../store'
import type { IssueType } from '../types/global'

const ISSUE_TYPES: { id: IssueType; label: string; desc: string }[] = [
  { id: 'crash',    label: 'Crash',    desc: 'App or game suddenly closed' },
  { id: 'freeze',   label: 'Freeze',   desc: 'System or app became unresponsive' },
  { id: 'bsod',     label: 'BSOD',     desc: 'Blue screen of death' },
  { id: 'app_hang', label: 'App Hang', desc: 'App stopped responding but stayed open' },
]

export default function Describe() {
  const {
    navigate,
    issueType, setIssueType,
    appName, setAppName,
    description, setDescription,
  } = useStore()

  const canContinue = appName.trim().length > 0

  function handleStart() {
    if (!canContinue) return
    navigate('record')
  }

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
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Issue type">
          {ISSUE_TYPES.map(({ id, label, desc }) => {
            const selected = issueType === id
            return (
              <button
                key={id}
                onClick={() => setIssueType(id)}
                className={[
                  'text-left p-3 rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50',
                  selected
                    ? 'border-accent/60 bg-accent/10 text-primary'
                    : 'border-app-border bg-surface hover:border-accent/40 hover:bg-surface-raised text-secondary hover:text-primary',
                ].join(' ')}
                aria-pressed={selected}
              >
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs mt-0.5 text-secondary">{desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* App name input */}
      <div className="mb-6">
        <label
          htmlFor="app-name"
          className="block text-xs font-mono text-secondary uppercase tracking-wider mb-2"
        >
          App / Game Name
        </label>
        <input
          id="app-name"
          type="text"
          value={appName}
          onChange={(e) => setAppName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleStart()}
          placeholder="e.g. Valorant, Chrome, Premiere Pro"
          className="w-full bg-surface border border-app-border rounded px-3 py-2.5 text-primary text-sm placeholder-secondary/50 focus:outline-none focus:border-accent/60"
          autoFocus
        />
      </div>

      {/* Description textarea */}
      <div className="mb-8">
        <label
          htmlFor="description"
          className="block text-xs font-mono text-secondary uppercase tracking-wider mb-2"
        >
          Brief Description{' '}
          <span className="text-secondary/50 normal-case tracking-normal">(optional)</span>
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you were doing when it happened…"
          className="w-full bg-surface border border-app-border rounded px-3 py-2.5 text-primary text-sm placeholder-secondary/50 focus:outline-none focus:border-accent/60 resize-none"
        />
      </div>

      {/* Nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('welcome')}
          className="flex items-center gap-1.5 text-secondary hover:text-primary text-sm transition-colors focus:outline-none"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={handleStart}
          disabled={!canContinue}
          className="flex items-center gap-2 bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          Start Recording <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
