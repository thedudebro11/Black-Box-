import { History, ChevronRight } from 'lucide-react'

const MOCK_SESSIONS = [
  {
    id: '1',
    date: 'Apr 27, 2026',
    issueType: 'Crash',
    appName: 'Valorant.exe',
    outcome: 'GPU Driver Instability',
    confidence: 'HIGH' as const,
  },
  {
    id: '2',
    date: 'Apr 25, 2026',
    issueType: 'Freeze',
    appName: 'Chrome.exe',
    outcome: 'App Hang / Disk Latency',
    confidence: 'MEDIUM' as const,
  },
  {
    id: '3',
    date: 'Apr 20, 2026',
    issueType: 'BSOD',
    appName: 'Windows',
    outcome: 'Inconclusive',
    confidence: null,
  },
]

const CONFIDENCE_STYLES: Record<string, string> = {
  HIGH: 'text-confidence-high bg-confidence-high/10 border-confidence-high/30',
  MEDIUM: 'text-confidence-medium bg-confidence-medium/10 border-confidence-medium/30',
}

export default function HistoryScreen() {
  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <History size={20} className="text-accent" />
        <div>
          <h2 className="text-primary font-semibold text-lg">Session History</h2>
          <p className="text-secondary text-sm">All past recording sessions, most recent first</p>
        </div>
      </div>

      {/* Session list */}
      <div className="space-y-2">
        {MOCK_SESSIONS.map(({ id, date, issueType, appName, outcome, confidence }) => (
          <button
            key={id}
            className="w-full flex items-center gap-4 bg-surface border border-app-border hover:border-accent/30 rounded-lg px-4 py-3.5 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-primary text-sm font-medium truncate">{appName}</span>
                <span className="text-secondary/50 text-xs">·</span>
                <span className="text-secondary text-xs">{issueType}</span>
              </div>
              <div className="text-secondary text-xs">{outcome}</div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {confidence ? (
                <span
                  className={`px-2 py-0.5 text-xs font-mono rounded border ${CONFIDENCE_STYLES[confidence]}`}
                >
                  {confidence}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-mono rounded border text-confidence-low bg-confidence-low/10 border-confidence-low/30">
                  INCONCLUSIVE
                </span>
              )}
              <span className="text-secondary/40 text-xs font-mono">{date}</span>
              <ChevronRight size={14} className="text-secondary/40" />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-10 pt-5 border-t border-app-border">
        <p className="text-xs text-secondary font-mono">
          PHASE 1 PLACEHOLDER — real sessions from DB wired in Phase 11
        </p>
      </div>
    </div>
  )
}
