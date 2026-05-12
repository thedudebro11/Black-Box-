import { useState } from 'react'
import { X, CheckCircle2, Clock, XCircle, Send } from 'lucide-react'

interface FollowUpModalProps {
  followUpId: string
  sessionId: string
  onClose: () => void
}

type Response = 'yes' | 'no' | 'still_working'

const RESPONSE_OPTIONS: { value: Response; label: string; Icon: typeof CheckCircle2 }[] = [
  { value: 'yes',           label: 'Yes, I fixed it',       Icon: CheckCircle2 },
  { value: 'still_working', label: 'Not yet',                Icon: Clock        },
  { value: 'no',            label: 'No, still happening',   Icon: XCircle      },
]

export default function FollowUpModal({ followUpId, sessionId: _sessionId, onClose }: FollowUpModalProps) {
  const [selected, setSelected]     = useState<Response | null>(null)
  const [notes, setNotes]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)

  async function handleSubmit() {
    if (!selected) return
    setSubmitting(true)
    try {
      await window.electron.followUp.submit({
        followUpId,
        response: selected,
        notes: notes.trim() || null,
      })
      setSubmitted(true)
      // Auto-close after a brief thank-you display
      setTimeout(onClose, 2200)
    } catch (err) {
      console.error('[FollowUpModal] submit failed', err)
      setSubmitting(false)
    }
  }

  async function handleDismiss() {
    try {
      await window.electron.followUp.dismiss()
    } catch (err) {
      console.error('[FollowUpModal] dismiss failed', err)
    }
    onClose()
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-up-title"
    >
      {/* Modal panel */}
      <div className="bg-surface border border-app-border rounded-lg max-w-md w-full mx-4 shadow-2xl">

        {submitted ? (
          /* ── Thank-you state ─────────────────────────────────────── */
          <div className="px-6 py-8 flex flex-col items-center text-center gap-3">
            <CheckCircle2 size={32} className="text-confidence-high" />
            <p className="text-primary font-semibold">Thanks for the update.</p>
            <p className="text-secondary text-sm leading-relaxed">
              Your response helps improve Black Box's diagnosis accuracy for everyone.
            </p>
          </div>
        ) : (
          /* ── Form state ──────────────────────────────────────────── */
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
              <h2 id="follow-up-title" className="text-primary font-semibold text-base">
                Did you fix it?
              </h2>
              <button
                onClick={handleDismiss}
                className="text-secondary hover:text-primary transition-colors focus:outline-none"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              <p className="text-secondary text-sm leading-relaxed">
                Black Box couldn't identify the cause of your issue. Did you figure out what happened?
              </p>

              {/* Response options */}
              <div className="space-y-2">
                {RESPONSE_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    onClick={() => setSelected(value)}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-3 rounded border text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-accent/50',
                      selected === value
                        ? 'bg-accent/10 border-accent text-primary'
                        : 'bg-app-bg border-app-border text-secondary hover:text-primary hover:border-app-border/80',
                    ].join(' ')}
                    aria-pressed={selected === value}
                  >
                    <Icon
                      size={16}
                      className={selected === value ? 'text-accent' : 'text-secondary'}
                    />
                    {label}
                  </button>
                ))}
              </div>

              {/* Notes field — only shown after "Yes, I fixed it" */}
              {selected === 'yes' && (
                <div>
                  <label
                    htmlFor="follow-up-notes"
                    className="block text-xs font-mono text-secondary uppercase tracking-wider mb-1.5"
                  >
                    What fixed it? (optional)
                  </label>
                  <textarea
                    id="follow-up-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. updated GPU driver, increased virtual memory..."
                    rows={3}
                    className="w-full bg-app-bg border border-app-border rounded px-3 py-2 text-primary text-sm placeholder-secondary/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/60"
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-app-border">
              <button
                onClick={handleDismiss}
                className="text-secondary hover:text-primary text-sm transition-colors focus:outline-none"
              >
                Dismiss
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selected || submitting}
                className={[
                  'flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50',
                  selected && !submitting
                    ? 'bg-accent hover:bg-accent/90 text-white'
                    : 'bg-accent/30 text-white/40 cursor-not-allowed',
                ].join(' ')}
              >
                <Send size={13} />
                {submitting ? 'Sending...' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
