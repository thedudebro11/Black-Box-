import { useEffect, useState } from 'react'
import {
  Settings as SettingsIcon,
  ExternalLink,
  Shield,
  Info,
  ToggleLeft,
  ToggleRight,
  Loader,
} from 'lucide-react'

interface SettingsState {
  telemetry_opt_in: boolean
  anonymous_session_id: string
  app_version: string
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    void loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    setError(null)
    try {
      const s = await window.electron.settings.get()
      setSettings({
        telemetry_opt_in: s.telemetry_opt_in,
        anonymous_session_id: s.anonymous_session_id,
        app_version: s.app_version,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleTelemetryToggle() {
    if (!settings || saving) return
    const newValue = !settings.telemetry_opt_in
    setSaving(true)
    try {
      await window.electron.settings.setTelemetryOptIn(newValue)
      setSettings((prev) => (prev ? { ...prev, telemetry_opt_in: newValue } : prev))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (err) {
      console.error('[settings] toggle telemetry failed', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <Loader size={18} className="text-accent animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-8 py-10 max-w-2xl">
        <p className="text-red-400 text-sm font-mono">{error}</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon size={20} className="text-accent" />
        <div>
          <h2 className="text-primary font-semibold text-lg">Settings</h2>
          <p className="text-secondary text-sm">Privacy and application preferences</p>
        </div>
      </div>

      {/* Telemetry section */}
      <section className="mb-8">
        <div className="flex items-start gap-2 mb-4">
          <Shield size={14} className="text-secondary mt-0.5 flex-shrink-0" />
          <span className="text-xs font-mono text-secondary uppercase tracking-wider">
            Anonymous Telemetry
          </span>
        </div>

        <div className="bg-surface border border-app-border rounded-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-primary text-sm font-medium mb-1">
                Contribute anonymous session data
              </p>
              <p className="text-secondary text-xs leading-relaxed">
                When enabled, Black Box uploads a sanitized summary of each session — which signals
                fired, hardware profile, and diagnosis outcome. No file names, no account data, no
                personal information of any kind. Your anonymous session ID is never linked to your
                identity.
              </p>
              <p className="text-secondary/50 text-xs font-mono mt-3">
                Session ID: …{settings?.anonymous_session_id.slice(-8) ?? '—'}
              </p>
            </div>
            <button
              onClick={handleTelemetryToggle}
              disabled={saving}
              aria-pressed={settings?.telemetry_opt_in ?? false}
              aria-label="Toggle anonymous telemetry"
              className="flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-accent/50 rounded"
            >
              {settings?.telemetry_opt_in ? (
                <ToggleRight size={28} className="text-accent" />
              ) : (
                <ToggleLeft size={28} className="text-secondary/50" />
              )}
            </button>
          </div>

          {savedFlash && <p className="text-xs text-confidence-high font-mono mt-3">Saved.</p>}
        </div>

        <p className="text-secondary/50 text-xs mt-3 leading-relaxed">
          You can change this at any time. Disabling telemetry takes effect immediately — no pending
          data is sent after you turn it off.
        </p>
      </section>

      {/* About section */}
      <section>
        <div className="flex items-start gap-2 mb-4">
          <Info size={14} className="text-secondary mt-0.5 flex-shrink-0" />
          <span className="text-xs font-mono text-secondary uppercase tracking-wider">
            About Black Box
          </span>
        </div>

        <div className="bg-surface border border-app-border rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-secondary text-sm">Version</span>
            <span className="text-primary text-sm font-mono">
              v{settings?.app_version ?? '1.0.0'}
            </span>
          </div>

          <div className="border-t border-app-border pt-4">
            <p className="text-secondary text-xs leading-relaxed mb-3">
              Black Box is a session recorder and diagnostic tool for Windows. It captures system
              events during a PC crash or problem and identifies the most likely cause using a
              rules-based analysis engine.
            </p>
            <p className="text-secondary text-xs leading-relaxed">
              <span className="text-primary font-medium">Privacy summary: </span>
              Black Box does not collect screenshots, file contents, account names, or any
              personally identifiable information. Telemetry is opt-in, sanitized on-device before
              upload, and contains only anonymous diagnostic metadata.
            </p>
          </div>

          <div className="border-t border-app-border pt-4 flex items-center gap-4">
            <a
              href="https://github.com/blackbox-app/black-box"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-accent text-xs hover:underline focus:outline-none focus:ring-2 focus:ring-accent/50 rounded"
            >
              View on GitHub <ExternalLink size={11} />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
