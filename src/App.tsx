import { useEffect, useState } from 'react'
import {
  Zap,
  FileText,
  Radio,
  Activity,
  BarChart2,
  History,
  Settings as SettingsIcon,
  AlertTriangle,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useStore, type Screen } from './store'
import Welcome from './screens/Welcome'
import Describe from './screens/Describe'
import Record from './screens/Record'
import Analyzing from './screens/Analyzing'
import Results from './screens/Results'
import HistoryScreen from './screens/History'
import SettingsScreen from './screens/Settings'
import FollowUpModal from './components/FollowUpModal'
import TelemetryOptIn from './components/TelemetryOptIn'
import type { Session } from './types/global'

const SCREENS: { id: Screen; label: string; Icon: LucideIcon }[] = [
  { id: 'welcome', label: 'Welcome', Icon: Zap },
  { id: 'describe', label: 'Describe', Icon: FileText },
  { id: 'record', label: 'Record', Icon: Radio },
  { id: 'analyzing', label: 'Analyzing', Icon: Activity },
  { id: 'results', label: 'Results', Icon: BarChart2 },
  { id: 'history', label: 'History', Icon: History },
]

// These screens manage their own transitions and should not be jumped to directly.
const LOCKED_DURING_SESSION: Screen[] = ['record', 'analyzing']

const SCREEN_MAP: Record<Screen, React.FC> = {
  welcome: Welcome,
  describe: Describe,
  record: Record,
  analyzing: Analyzing,
  results: Results,
  history: HistoryScreen,
  settings: SettingsScreen,
}

export default function App() {
  const {
    currentScreen,
    navigate,
    isRecording,
    setSessionId,
    setAnalyzerStatus,
    pendingFollowUp,
    showFollowUpModal,
    setPendingFollowUp,
    setShowFollowUpModal,
  } = useStore()
  const CurrentScreen = SCREEN_MAP[currentScreen]

  const [showOptIn, setShowOptIn] = useState<boolean | null>(null)
  const [interruptedSessions, setInterruptedSessions] = useState<Session[]>([])
  const [interruptedDismissed, setInterruptedDismissed] = useState(false)

  useEffect(() => {
    window.electron.settings
      .get()
      .then((s) => {
        setShowOptIn(!s.first_launch_complete)
      })
      .catch((err) => {
        console.error('[App] failed to load settings for opt-in check:', err)
        setShowOptIn(false)
      })
  }, [])

  // Check for sessions that were left recording when the app was last closed.
  useEffect(() => {
    window.electron.sessions
      .list()
      .then((list) => {
        const interrupted = list.filter((s) => s.status === 'interrupted')
        setInterruptedSessions(interrupted)
      })
      .catch(() => {
        /* non-fatal */
      })
  }, [])

  useEffect(() => {
    const cleanup = window.electron.followUp.onShow((payload) => {
      setPendingFollowUp(payload)
      setShowFollowUpModal(true)
    })
    return cleanup
  }, [setPendingFollowUp, setShowFollowUpModal])

  function handleFollowUpClose() {
    setShowFollowUpModal(false)
    setPendingFollowUp(null)
  }

  function handleNavClick(id: Screen) {
    if (LOCKED_DURING_SESSION.includes(id)) return
    if (isRecording && id !== 'record') return
    navigate(id)
  }

  function handleAnalyzeInterrupted(session: Session) {
    setInterruptedSessions((prev) => prev.filter((s) => s.id !== session.id))
    setSessionId(session.id)
    setAnalyzerStatus('collecting', 0)
    navigate('analyzing')
  }

  const showInterruptedBanner =
    !interruptedDismissed && interruptedSessions.length > 0 && !isRecording

  return (
    <div className="flex h-screen bg-app-bg overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 flex flex-col bg-surface border-r border-app-border">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-app-border">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-accent" />
            <span className="text-primary font-mono text-sm font-semibold tracking-widest uppercase">
              Black Box
            </span>
          </div>
          <p className="text-secondary text-xs mt-1 font-mono">v1.0.0</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5" aria-label="Main navigation">
          {SCREENS.map(({ id, label, Icon }) => {
            const active = currentScreen === id
            const locked = LOCKED_DURING_SESSION.includes(id) || (isRecording && id !== 'record')
            return (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                disabled={locked && !active}
                tabIndex={locked && !active ? -1 : 0}
                aria-current={active ? 'page' : undefined}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors text-left',
                  active
                    ? 'bg-surface-raised text-primary border border-app-border'
                    : locked
                      ? 'text-secondary/30 cursor-default'
                      : 'text-secondary hover:text-primary hover:bg-surface-raised',
                ].join(' ')}
              >
                <Icon size={15} className={active ? 'text-accent' : ''} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* Recording indicator */}
        {isRecording && (
          <div className="px-4 py-3 border-t border-app-border flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-xs text-red-400 font-mono">Recording active</span>
          </div>
        )}

        {/* Settings footer */}
        <div className="px-2 pb-3 border-t border-app-border pt-2">
          <button
            onClick={() => handleNavClick('settings')}
            aria-current={currentScreen === 'settings' ? 'page' : undefined}
            className={[
              'w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors text-left',
              currentScreen === 'settings'
                ? 'bg-surface-raised text-primary border border-app-border'
                : 'text-secondary hover:text-primary hover:bg-surface-raised',
            ].join(' ')}
          >
            <SettingsIcon size={15} className={currentScreen === 'settings' ? 'text-accent' : ''} />
            Settings
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col" role="main">
        {/* Interrupted session recovery banner */}
        {showInterruptedBanner && (
          <div className="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-xs font-mono truncate">
                {interruptedSessions.length === 1
                  ? `Session "${interruptedSessions[0].app_name}" was interrupted — analyze it now?`
                  : `${interruptedSessions.length} sessions were interrupted — analyze the most recent?`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleAnalyzeInterrupted(interruptedSessions[0])}
                className="px-3 py-1 text-xs font-medium rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors focus:outline-none"
              >
                Analyze
              </button>
              <button
                onClick={() => setInterruptedDismissed(true)}
                aria-label="Dismiss"
                className="p-1 text-amber-400/60 hover:text-amber-300 transition-colors focus:outline-none rounded"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <CurrentScreen />
        </div>
      </main>

      {showFollowUpModal && pendingFollowUp && (
        <FollowUpModal
          followUpId={pendingFollowUp.followUpId}
          sessionId={pendingFollowUp.sessionId}
          onClose={handleFollowUpClose}
        />
      )}

      {showOptIn === true && <TelemetryOptIn onDismiss={() => setShowOptIn(false)} />}
    </div>
  )
}
