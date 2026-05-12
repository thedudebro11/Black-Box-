/**
 * TelemetryOptIn.tsx — first-launch modal overlay asking the user whether
 * they want to share anonymous session data.
 *
 * Shown once on first launch (first_launch_complete === false).
 * On either choice: saves the opt-in preference, marks first launch complete,
 * and dismisses the overlay.
 *
 * This component deliberately makes no network requests itself — it delegates
 * to window.electron.settings IPC calls, keeping all data decisions in the
 * main process.
 */

import { useState } from 'react'
import { Shield, X } from 'lucide-react'

interface TelemetryOptInProps {
  onDismiss: () => void
}

export default function TelemetryOptIn({ onDismiss }: TelemetryOptInProps) {
  const [busy, setBusy] = useState(false)

  async function handleChoice(optIn: boolean) {
    if (busy) return
    setBusy(true)
    try {
      await window.electron.settings.setTelemetryOptIn(optIn)
      await window.electron.settings.completeFirstLaunch()
    } catch (err) {
      // If the IPC call fails, we still dismiss — the user made their choice.
      console.error('[TelemetryOptIn] failed to persist opt-in choice:', err)
    } finally {
      setBusy(false)
      onDismiss()
    }
  }

  return (
    /* Full-screen overlay — sits above all other content */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="telemetry-title"
      aria-describedby="telemetry-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="w-full max-w-md mx-4 bg-surface border border-app-border rounded-lg shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-app-border flex items-start gap-3">
          <Shield size={20} className="text-accent mt-0.5 flex-shrink-0" />
          <div>
            <h2
              id="telemetry-title"
              className="text-primary font-semibold text-base"
            >
              Help improve Black Box
            </h2>
            <p className="text-secondary text-xs font-mono mt-0.5">
              One-time setup
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p
            id="telemetry-desc"
            className="text-secondary text-sm leading-relaxed"
          >
            Would you like to share anonymous session data? This helps improve
            detection accuracy over time.
          </p>

          <div className="mt-4 space-y-2 text-xs text-secondary">
            <p className="flex items-start gap-2">
              <X size={12} className="mt-0.5 flex-shrink-0 text-low-confidence" />
              No personal information is ever collected
            </p>
            <p className="flex items-start gap-2">
              <X size={12} className="mt-0.5 flex-shrink-0 text-low-confidence" />
              No file names, screenshots, or account data
            </p>
            <p className="flex items-start gap-2">
              <X size={12} className="mt-0.5 flex-shrink-0 text-low-confidence" />
              Only: which Event IDs fired, process names, system metrics
            </p>
          </div>

          <p className="mt-4 text-xs text-secondary">
            You can change this at any time in Settings.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            onClick={() => handleChoice(true)}
            disabled={busy}
            className={[
              'flex-1 px-4 py-2.5 rounded text-sm font-medium transition-colors',
              busy
                ? 'bg-accent/50 text-primary/50 cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
            ].join(' ')}
          >
            Yes, contribute data
          </button>
          <button
            onClick={() => handleChoice(false)}
            disabled={busy}
            className={[
              'flex-1 px-4 py-2.5 rounded text-sm font-medium transition-colors',
              busy
                ? 'text-secondary/50 cursor-not-allowed'
                : 'text-secondary hover:text-primary hover:bg-surface-raised border border-app-border focus:outline-none focus:ring-2 focus:ring-app-border focus:ring-offset-2 focus:ring-offset-surface',
            ].join(' ')}
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  )
}
