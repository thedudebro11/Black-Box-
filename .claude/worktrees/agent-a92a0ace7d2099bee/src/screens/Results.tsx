import { useState } from 'react'
import {
  BarChart2, ChevronDown, ChevronUp, Download, RotateCcw,
  AlertTriangle, HelpCircle, ExternalLink, ArrowLeft,
} from 'lucide-react'
import { useStore } from '../store'
import type { Confidence, SignalMatch, FixStep, RuleResult } from '../types/global'

// ── Cause name lookup ──────────────────────────────────────────────────────────

const CAUSE_NAMES: Record<string, string> = {
  'gpu-driver':        'GPU Driver Instability / TDR',
  'overlay-conflict':  'Overlay Conflict',
  'anti-cheat':        'Anti-Cheat Conflict',
  'memory-exhaustion': 'Memory Exhaustion',
  'app-hang':          'App Hang / Freeze',
}

// ── Confidence badge ───────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
  const styles: Record<string, string> = {
    HIGH:   'bg-confidence-high/15 text-confidence-high border-confidence-high/30',
    MEDIUM: 'bg-confidence-medium/15 text-confidence-medium border-confidence-medium/30',
    LOW:    'bg-confidence-low/15 text-confidence-low border-confidence-low/30',
  }
  const label = confidence ?? 'INCONCLUSIVE'
  const cls = confidence ? styles[confidence] : styles['LOW']
  return (
    <span
      className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border flex-shrink-0 ${cls}`}
      aria-label={`Confidence: ${label}`}
    >
      {label}
    </span>
  )
}

// ── Relative time formatter ────────────────────────────────────────────────────

function formatRelativeTime(seconds: number): string {
  if (seconds === 0) return 'at issue marker'
  const abs = Math.abs(Math.round(seconds))
  const mins = Math.floor(abs / 60)
  const secs = abs % 60
  const dir = seconds > 0 ? 'before' : 'after'
  if (mins > 0 && secs > 0) return `${mins}m ${secs}s ${dir} issue marker`
  if (mins > 0) return `${mins}m ${dir} issue marker`
  return `${secs}s ${dir} issue marker`
}

// ── Evidence list ──────────────────────────────────────────────────────────────

function EvidenceList({ signals }: { signals: SignalMatch[] }) {
  if (signals.length === 0) return null
  const sorted = [...signals].sort((a, b) => {
    const sev = { critical: 0, supporting: 1, informational: 2 }
    if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity]
    return a.seconds_before_marker - b.seconds_before_marker
  })

  return (
    <div className="space-y-2">
      {sorted.map((sig, i) => (
        <div key={i} className="bg-app-bg rounded p-3 border border-app-border/50">
          <div className="font-mono text-xs text-accent mb-0.5 break-all">{sig.technical}</div>
          <div className="text-secondary text-xs leading-relaxed">{sig.description}</div>
          <div className="text-secondary/50 text-xs font-mono mt-1">
            {formatRelativeTime(sig.seconds_before_marker)}
            {sig.window !== 'incident' && (
              <span className="ml-2 opacity-60">({sig.window})</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Fix recommendations ────────────────────────────────────────────────────────

function FixList({ steps }: { steps: FixStep[] }) {
  if (steps.length === 0) return null
  const sorted = [...steps].sort((a, b) => a.order - b.order)
  return (
    <ol className="space-y-3 list-none">
      {sorted.map((step) => (
        <li key={step.order} className="flex gap-3">
          <span className="font-mono text-accent text-xs mt-0.5 flex-shrink-0 w-5 text-right">
            {String(step.order).padStart(2, '0')}
          </span>
          <div>
            <div className="text-primary text-sm font-medium mb-0.5">{step.title}</div>
            <div className="text-secondary text-sm leading-relaxed">{step.detail}</div>
            {step.link && (
              <a
                href={step.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent text-xs mt-1 hover:underline"
              >
                Reference <ExternalLink size={10} />
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

// ── Secondary result row ───────────────────────────────────────────────────────

function SecondaryResult({ result }: { result: RuleResult }) {
  const [open, setOpen] = useState(false)
  const name = CAUSE_NAMES[result.rulePackId] ?? result.rulePackId

  return (
    <div className="border border-app-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-secondary hover:text-primary hover:bg-surface-raised transition-colors focus:outline-none"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <ConfidenceBadge confidence={result.confidence} />
          <span className="font-medium">{name}</span>
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-app-border">
          <p className="text-secondary text-sm leading-relaxed pt-3">{result.outputText}</p>
          {result.signals.length > 0 && (
            <div>
              <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-2">
                Signals Found
              </div>
              <EvidenceList signals={result.signals} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Results screen ────────────────────────────────────────────────────────

export default function Results() {
  const { navigate, resetSession, analysisResult, viewingHistoricResult, setViewingHistoricResult } =
    useStore()
  const [secondaryOpen, setSecondaryOpen] = useState(false)

  function handleNewSession() {
    resetSession()
    setViewingHistoricResult(false)
    navigate('welcome')
  }

  function handleBackToHistory() {
    setViewingHistoricResult(false)
    navigate('history')
  }

  // ── Empty / loading state ────────────────────────────────────────────────────
  if (!analysisResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-screen px-8 py-16">
        <div className="text-center max-w-sm">
          <HelpCircle size={32} className="text-secondary/40 mx-auto mb-4" />
          <p className="text-secondary text-sm mb-6">No session results to display.</p>
          {viewingHistoricResult ? (
            <button
              onClick={handleBackToHistory}
              className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors mx-auto"
            >
              <ArrowLeft size={14} /> Back to History
            </button>
          ) : (
            <button
              onClick={handleNewSession}
              className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors mx-auto"
            >
              <RotateCcw size={14} /> Start a New Session
            </button>
          )}
        </div>
      </div>
    )
  }

  const { outcome, primary_confidence, primary_cause_name, primary_output_text,
          secondary_results, all_signals_found, fix_recommendations, inconclusive_reason } = analysisResult

  // ── Error outcome ────────────────────────────────────────────────────────────
  if (outcome === 'error') {
    return (
      <div className="px-8 py-10 max-w-2xl">
        {viewingHistoricResult && (
          <button
            onClick={handleBackToHistory}
            className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors mb-6 focus:outline-none"
          >
            <ArrowLeft size={12} /> Back to History
          </button>
        )}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-400" />
            <h2 className="text-primary font-semibold text-lg">Analysis Error</h2>
          </div>
          {!viewingHistoricResult && (
            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors"
            >
              <RotateCcw size={12} /> New Session
            </button>
          )}
        </div>
        <div className="bg-surface border border-red-500/20 rounded-lg p-5">
          <p className="text-secondary text-sm leading-relaxed mb-3">
            {inconclusive_reason ?? 'An unexpected error occurred during analysis.'}
          </p>
          <p className="text-secondary/60 text-xs">
            The session data has been saved. You can export the raw session report to share
            with a support channel.
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          {viewingHistoricResult ? (
            <button
              onClick={handleBackToHistory}
              className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors"
            >
              <ArrowLeft size={14} /> Back to History
            </button>
          ) : (
            <button
              onClick={handleNewSession}
              className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors"
            >
              <RotateCcw size={14} /> Start New Session
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Inconclusive outcome ─────────────────────────────────────────────────────
  if (outcome === 'inconclusive') {
    return (
      <div className="px-8 py-10 max-w-2xl">
        {viewingHistoricResult && (
          <button
            onClick={handleBackToHistory}
            className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors mb-6 focus:outline-none"
          >
            <ArrowLeft size={12} /> Back to History
          </button>
        )}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <BarChart2 size={20} className="text-secondary" />
            <div>
              <h2 className="text-primary font-semibold text-lg">Session Results</h2>
            </div>
          </div>
          {!viewingHistoricResult && (
            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors"
            >
              <RotateCcw size={12} /> New Session
            </button>
          )}
        </div>

        <div className="bg-surface border border-app-border rounded-lg p-5 mb-4">
          <div className="flex items-start gap-3 mb-3">
            <HelpCircle size={18} className="text-confidence-low mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-secondary block mb-0.5">
                Result
              </span>
              <h3 className="text-primary font-semibold text-base">Inconclusive</h3>
            </div>
            <ConfidenceBadge confidence={null} />
          </div>
          <p className="text-secondary text-sm leading-relaxed mb-4">
            {inconclusive_reason ??
              "Black Box couldn't identify the cause with enough confidence to recommend a specific fix. " +
              "Here's what was found — you can take this report to a forum or support channel for additional help."}
          </p>
          {all_signals_found.length > 0 && (
            <div className="border-t border-app-border pt-4">
              <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
                Signals Detected
              </div>
              <EvidenceList signals={all_signals_found} />
            </div>
          )}
          {all_signals_found.length === 0 && (
            <p className="text-secondary/50 text-xs font-mono border-t border-app-border pt-4">
              No diagnostic signals were detected during the session window.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {viewingHistoricResult ? (
            <button
              onClick={handleBackToHistory}
              className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <ArrowLeft size={14} /> Back to History
            </button>
          ) : (
            <button
              onClick={handleNewSession}
              className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <RotateCcw size={14} /> Start New Session
            </button>
          )}
          <button
            disabled
            className="flex items-center gap-2 border border-app-border text-secondary/50 text-sm font-medium px-4 py-2.5 rounded cursor-not-allowed"
            title="Export available in a future update"
          >
            <Download size={14} /> Export Report
          </button>
        </div>
      </div>
    )
  }

  // ── Diagnosed outcome ────────────────────────────────────────────────────────
  const causeName = primary_cause_name ?? 'Unknown Cause'
  const outputText = primary_output_text ?? ''
  const firedSecondary = secondary_results.filter((r) => r.fired)

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Back to history link — shown when viewing a historic result */}
      {viewingHistoricResult && (
        <button
          onClick={handleBackToHistory}
          className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors mb-6 focus:outline-none"
        >
          <ArrowLeft size={12} /> Back to History
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} className="text-accent" />
          <div>
            <h2 className="text-primary font-semibold text-lg">Session Results</h2>
          </div>
        </div>
        {!viewingHistoricResult && (
          <button
            onClick={handleNewSession}
            className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors focus:outline-none"
          >
            <RotateCcw size={12} /> New Session
          </button>
        )}
      </div>

      {/* Primary cause card */}
      <div className="bg-surface border border-app-border rounded-lg p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-secondary block mb-0.5">
              Most Likely Cause
            </span>
            <h3 className="text-primary font-semibold text-base">{causeName}</h3>
          </div>
          <ConfidenceBadge confidence={primary_confidence} />
        </div>

        <p className="text-secondary text-sm leading-relaxed mb-4">{outputText}</p>

        {all_signals_found.length > 0 && (
          <div className="border-t border-app-border pt-4 mb-4">
            <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
              Evidence Found
            </div>
            <EvidenceList signals={all_signals_found} />
          </div>
        )}

        {fix_recommendations.length > 0 && (
          <div className="border-t border-app-border pt-4">
            <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
              Fix Recommendations
            </div>
            <FixList steps={fix_recommendations} />
          </div>
        )}
      </div>

      {/* Secondary causes */}
      {firedSecondary.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setSecondaryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-surface border border-app-border rounded-lg text-sm text-secondary hover:text-primary transition-colors focus:outline-none"
            aria-expanded={secondaryOpen}
          >
            <span>
              Other possible cause{firedSecondary.length !== 1 ? 's' : ''} ({firedSecondary.length})
            </span>
            {secondaryOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {secondaryOpen && (
            <div className="mt-2 space-y-2">
              {firedSecondary.map((r) => (
                <SecondaryResult key={r.rulePackId} result={r} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 mt-6">
        {viewingHistoricResult ? (
          <button
            onClick={handleBackToHistory}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <ArrowLeft size={14} /> Back to History
          </button>
        ) : (
          <button
            onClick={handleNewSession}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <RotateCcw size={14} /> Start New Session
          </button>
        )}
        <button
          disabled
          className="flex items-center gap-2 border border-app-border text-secondary/50 text-sm font-medium px-4 py-2.5 rounded cursor-not-allowed"
          title="Export available in a future update"
        >
          <Download size={14} /> Export Report
        </button>
      </div>
    </div>
  )
}
