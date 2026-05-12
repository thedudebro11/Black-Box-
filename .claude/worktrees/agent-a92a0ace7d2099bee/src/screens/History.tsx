import { useEffect, useState } from 'react'
import { History, ChevronRight, Trash2, AlertCircle, Plus, Loader } from 'lucide-react'
import { useStore } from '../store'
import type { Session, SessionStatus, IssueType, AnalysisResult } from '../types/global'

// ── Formatters ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  crash:    'Crash',
  freeze:   'Freeze',
  bsod:     'BSOD',
  app_hang: 'App Hang',
}

// ── Status / outcome badge ─────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: SessionStatus
}

function StatusBadge({ status }: StatusBadgeProps) {
  const styles: Partial<Record<SessionStatus, string>> = {
    complete:     'text-confidence-high bg-confidence-high/10 border-confidence-high/30',
    inconclusive: 'text-confidence-low bg-confidence-low/10 border-confidence-low/30',
    error:        'text-red-400 bg-red-500/10 border-red-500/30',
    interrupted:  'text-amber-400 bg-amber-500/10 border-amber-500/30',
    recording:    'text-accent bg-accent/10 border-accent/30',
    analyzing:    'text-accent bg-accent/10 border-accent/30',
  }

  const labels: Record<SessionStatus, string> = {
    complete:     'Diagnosed',
    inconclusive: 'Inconclusive',
    error:        'Error',
    interrupted:  'Interrupted',
    recording:    'Recording',
    analyzing:    'Analyzing',
  }

  const cls = styles[status] ?? 'text-confidence-low bg-confidence-low/10 border-confidence-low/30'

  return (
    <span className={`px-2 py-0.5 text-xs font-mono rounded border flex-shrink-0 ${cls}`}>
      {labels[status]}
    </span>
  )
}

// ── Issue type badge ───────────────────────────────────────────────────────────

function IssueTypeBadge({ issueType }: { issueType: IssueType }) {
  return (
    <span className="px-2 py-0.5 text-xs font-mono rounded border text-secondary bg-surface-raised border-app-border flex-shrink-0">
      {ISSUE_TYPE_LABELS[issueType] ?? issueType}
    </span>
  )
}

// ── Delete confirmation inline ─────────────────────────────────────────────────

interface DeleteConfirmProps {
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirm({ onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div className="flex items-center gap-2 text-xs flex-shrink-0">
      <span className="text-secondary font-mono">Delete? Cannot be undone.</span>
      <button
        onClick={(e) => { e.stopPropagation(); onConfirm() }}
        className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-colors font-mono"
      >
        Confirm
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onCancel() }}
        className="px-2 py-0.5 rounded bg-surface-raised border border-app-border text-secondary hover:text-primary transition-colors font-mono"
      >
        Cancel
      </button>
    </div>
  )
}

// ── Session row ────────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: Session
  onOpen: (session: Session) => void
  onDelete: (sessionId: string) => void
}

function SessionRow({ session, onOpen, onDelete }: SessionRowProps) {
  const [hovered, setHovered] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    onDelete(session.id)
  }

  // The row itself is clickable to open results, but trash icon and confirm
  // buttons stop propagation so they don't trigger navigation.
  const isClickable = session.status !== 'recording' && session.status !== 'analyzing'

  return (
    <div
      className={[
        'relative flex items-center gap-4 bg-surface border border-app-border rounded-lg px-4 py-3.5 transition-colors group',
        isClickable
          ? 'hover:border-accent/30 cursor-pointer'
          : 'cursor-default opacity-70',
      ].join(' ')}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmingDelete(false) }}
      onClick={() => { if (isClickable) onOpen(session) }}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen(session)
        }
      }}
    >
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top line: app name + issue type */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-primary text-sm font-medium truncate">{session.app_name}</span>
          <IssueTypeBadge issueType={session.issue_type} />
        </div>
        {/* Date line */}
        <div className="text-secondary/60 text-xs font-mono">
          {formatDate(session.created_at)}
        </div>
      </div>

      {/* Right side: status / confirm / chevron */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {confirmingDelete ? (
          <DeleteConfirm
            onConfirm={handleDelete}
            onCancel={() => setConfirmingDelete(false)}
          />
        ) : (
          <>
            <StatusBadge status={session.status} />

            {/* Trash icon — visible on hover, only for non-active sessions */}
            {hovered && !deleting && isClickable && (
              <button
                title="Delete session"
                aria-label="Delete session"
                onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }}
                className="p-1 rounded text-secondary/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}

            {deleting && (
              <Loader size={13} className="text-secondary/40 animate-spin" />
            )}

            {isClickable && !hovered && (
              <ChevronRight size={14} className="text-secondary/30" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  const navigate = useStore((s) => s.navigate)
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <History size={36} className="text-secondary/20 mb-4" />
      <p className="text-primary text-sm font-medium mb-1">No sessions yet</p>
      <p className="text-secondary text-xs mb-6">
        Start a new session to begin diagnosing your issue.
      </p>
      <button
        onClick={() => navigate('describe')}
        className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-5 py-2.5 rounded text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <Plus size={14} /> Start Session
      </button>
    </div>
  )
}

// ── Error state ────────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <AlertCircle size={36} className="text-red-400/50 mb-4" />
      <p className="text-primary text-sm font-medium mb-1">Failed to load sessions</p>
      <p className="text-secondary text-xs max-w-xs">{message}</p>
    </div>
  )
}

// ── Main History screen ────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { navigate, setAnalysisResult, setViewingHistoricResult } = useStore()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load sessions on mount
  useEffect(() => {
    void loadSessions()
  }, [])

  async function loadSessions() {
    setLoading(true)
    setError(null)
    try {
      const list = await window.electron.sessions.list()
      setSessions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleOpen(session: Session) {
    try {
      const data = await window.electron.sessions.getWithResult(session.id)
      if (!data) return
      if (data.result) {
        setAnalysisResult(data.result as AnalysisResult)
      }
      setViewingHistoricResult(true)
      navigate('results')
    } catch (err) {
      console.error('[history] failed to open session', err)
    }
  }

  async function handleDelete(sessionId: string) {
    try {
      const res = await window.electron.sessions.delete(sessionId)
      if (res.ok) {
        // Remove from local state — no re-fetch needed
        setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      } else {
        console.error('[history] delete failed:', res.error)
      }
    } catch (err) {
      console.error('[history] delete error', err)
    }
  }

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <History size={20} className="text-accent" />
          <div>
            <h2 className="text-primary font-semibold text-lg">Session History</h2>
            <p className="text-secondary text-sm">
              All past recording sessions, most recent first
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('describe')}
          className="flex items-center gap-1.5 text-secondary hover:text-primary text-xs font-mono transition-colors focus:outline-none"
          title="Start a new session"
        >
          <Plus size={12} /> New Session
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-12 justify-center">
          <Loader size={18} className="text-accent animate-spin" />
          <span className="text-secondary text-sm font-mono">Loading sessions…</span>
        </div>
      )}

      {/* Error */}
      {!loading && error !== null && <ErrorState message={error} />}

      {/* Empty */}
      {!loading && error === null && sessions.length === 0 && <EmptyState />}

      {/* List */}
      {!loading && error === null && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onOpen={handleOpen}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
