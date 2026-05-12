import { useState } from 'react'
import { BarChart2, ChevronDown, Download, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { generateReport } from '../export/report-generator'
import type { AnalysisResult, SignalMatch, FixStep } from '../types/global'

// ---------------------------------------------------------------------------
// Helpers for rendering confidence badges
// ---------------------------------------------------------------------------
function confidenceBadgeClass(confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null): string {
  switch (confidence) {
    case 'HIGH':
      return 'bg-confidence-high/15 text-confidence-high border-confidence-high/30'
    case 'MEDIUM':
      return 'bg-confidence-medium/15 text-confidence-medium border-confidence-medium/30'
    default:
      return 'bg-confidence-low/15 text-confidence-low border-confidence-low/30'
  }
}

function formatRelativeTime(secondsBefore: number): string {
  if (secondsBefore === 0) return 'at crash point'
  const abs = Math.abs(secondsBefore)
  if (secondsBefore > 0) return `${abs}s before crash`
  return `${abs}s after crash`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function EvidenceItem({ signal }: { signal: SignalMatch }) {
  return (
    <div className="bg-app-bg rounded p-3">
      <div className="font-mono text-xs text-accent mb-0.5">{signal.technical}</div>
      <div className="text-secondary text-xs">{signal.description}</div>
      <div className="text-secondary/50 text-xs font-mono mt-0.5">
        {formatRelativeTime(signal.seconds_before_marker)}
      </div>
    </div>
  )
}

function FixStepItem({ step }: { step: FixStep }) {
  return (
    <li className="flex gap-3 text-sm">
      <span className="font-mono text-accent text-xs mt-0.5 flex-shrink-0">
        {String(step.order).padStart(2, '0')}
      </span>
      <span className="text-secondary">{step.title}</span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Inconclusive state
// ---------------------------------------------------------------------------
function InconclusiveCard({ reason }: { reason: string | null }) {
  return (
    <div className="bg-surface border border-app-border rounded-lg p-5 mb-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-secondary">
            Diagnosis
          </span>
          <h3 className="text-primary font-semibold text-base mt-0.5">Inconclusive</h3>
        </div>
        <span className="px-2.5 py-1 text-xs font-mono font-semibold rounded bg-confidence-low/15 text-confidence-low border border-confidence-low/30">
          INCONCLUSIVE
        </span>
      </div>
      <p className="text-secondary text-sm leading-relaxed">
        {reason ??
          "Black Box couldn't identify the cause with enough confidence to recommend a specific fix. Here's what was found during the session — you can take this report to a forum or support channel for additional help."}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diagnosed state
// ---------------------------------------------------------------------------
function DiagnosedCard({ result }: { result: AnalysisResult }) {
  const confidence = result.primary_confidence
  const badgeClass = confidenceBadgeClass(confidence)

  return (
    <div className="bg-surface border border-app-border rounded-lg p-5 mb-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-secondary">
            Most Likely Cause
          </span>
          <h3 className="text-primary font-semibold text-base mt-0.5">
            {result.primary_cause_name ?? 'Unknown Cause'}
          </h3>
        </div>
        <span
          className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border ${badgeClass}`}
        >
          {confidence ?? 'LOW'}
        </span>
      </div>

      {result.primary_output_text != null && (
        <p className="text-secondary text-sm leading-relaxed mb-4">
          {result.primary_output_text}
        </p>
      )}

      {/* Evidence list */}
      {result.all_signals_found.length > 0 && (
        <div className="border-t border-app-border pt-4 mb-4">
          <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
            Evidence Found
          </div>
          <div className="space-y-2">
            {result.all_signals_found.map((signal, i) => (
              <EvidenceItem key={`${signal.technical}-${i}`} signal={signal} />
            ))}
          </div>
        </div>
      )}

      {/* Fix recommendations */}
      {result.fix_recommendations.length > 0 && (
        <div className="border-t border-app-border pt-4">
          <div className="text-xs font-mono text-secondary uppercase tracking-wider mb-3">
            Fix Recommendations
          </div>
          <ol className="space-y-2 list-none">
            {[...result.fix_recommendations]
              .sort((a, b) => a.order - b.order)
              .map((step) => (
                <FixStepItem key={step.order} step={step} />
              ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Results screen
// ---------------------------------------------------------------------------
export default function Results() {
  const navigate = useStore((s) => s.navigate)
  const analysisResult = useStore((s) => s.analysisResult)
  const appName = useStore((s) => s.appName)
  const issueType = useStore((s) => s.issueType)
  const sessionId = useStore((s) => s.sessionId)
  const sessionStartedAt = useStore((s) => s.sessionStartedAt)

  const [isExporting, setIsExporting] = useState(false)
  const [secondaryExpanded, setSecondaryExpanded] = useState(false)

  const handleExport = async () => {
    if (analysisResult == null) return
    setIsExporting(true)
    try {
      const { markdown, filename } = generateReport(analysisResult, {
        appName: appName || 'Unknown',
        issueType: issueType || 'Unknown',
        sessionId: sessionId || 'unknown-session',
        startedAt: sessionStartedAt || new Date().toISOString(),
      })
      await window.electron.export.saveReport({ markdown, filename })
    } finally {
      setIsExporting(false)
    }
  }

  // Header subtitle
  const subtitleApp = appName || 'Unknown app'
  const subtitleIssue = issueType || 'unknown issue'

  const secondaryResults = analysisResult?.secondary_results.filter((r) => r.fired) ?? []

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} className="text-accent" />
          <div>
            <h2 className="text-primary font-semibold text-lg">Session Results</h2>
            <p className="text-secondary text-sm">
              {subtitleApp} — {subtitleIssue}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('welcome')}
          className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors"
        >
          <RotateCcw size={12} /> New Session
        </button>
      </div>

      {/* Primary result card */}
      {analysisResult == null || analysisResult.outcome === 'inconclusive' ? (
        <InconclusiveCard reason={analysisResult?.inconclusive_reason ?? null} />
      ) : (
        <DiagnosedCard result={analysisResult} />
      )}

      {/* Secondary causes (collapsed by default) */}
      {secondaryResults.length > 0 && (
        <>
          <button
            onClick={() => setSecondaryExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-surface border border-app-border rounded-lg text-sm text-secondary hover:text-primary transition-colors mb-4"
          >
            <span>Other possible causes ({secondaryResults.length})</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${secondaryExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {secondaryExpanded && (
            <div className="space-y-3 mb-4">
              {secondaryResults.map((r) => (
                <div
                  key={r.rulePackId}
                  className="bg-surface border border-app-border rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-primary text-sm font-medium">{r.rulePackId}</span>
                    <span
                      className={`px-2 py-0.5 text-xs font-mono font-semibold rounded border ${confidenceBadgeClass(r.confidence)}`}
                    >
                      {r.confidence ?? 'LOW'}
                    </span>
                  </div>
                  <p className="text-secondary text-xs leading-relaxed">{r.outputText}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Export button */}
      <div className="mt-6">
        <button
          onClick={() => void handleExport()}
          disabled={isExporting || analysisResult == null}
          className="flex items-center gap-2 border border-app-border hover:border-accent/50 text-secondary hover:text-primary text-sm font-medium px-4 py-2.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={14} className={isExporting ? 'animate-pulse' : ''} />
          {isExporting ? 'Saving…' : 'Export Session Report'}
        </button>
      </div>
    </div>
  )
}
