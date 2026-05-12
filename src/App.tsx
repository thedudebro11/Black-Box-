import { useEffect, useState } from 'react'
import { Zap, FileText, Radio, Activity, BarChart2, History, type LucideIcon } from 'lucide-react'
import { useStore, type Screen } from './store'
import Welcome from './screens/Welcome'
import Describe from './screens/Describe'
import Record from './screens/Record'
import Analyzing from './screens/Analyzing'
import Results from './screens/Results'
import HistoryScreen from './screens/History'
import FollowUpModal from './components/FollowUpModal'
import TelemetryOptIn from './components/TelemetryOptIn'

const SCREENS: { id: Screen; label: string; Icon: LucideIcon }[] = [
  { id: 'welcome',   label: 'Welcome',   Icon: Zap },
  { id: 'describe',  label: 'Describe',  Icon: FileText },
  { id: 'record',    label: 'Record',    Icon: Radio },
  { id: 'analyzing', label: 'Analyzing', Icon: Activity },
  { id: 'results',   label: 'Results',   Icon: BarChart2 },
  { id: 'history',   label: 'History',   Icon: History },
]

// These screens manage their own transitions and should not be jumped to directly.
const LOCKED_DURING_SESSION: Screen[] = ['record', 'analyzing']

const SCREEN_MAP: Record<Screen, React.FC> = {
  welcome:   Welcome,
  describe:  Describe,
  record:    Record,
  analyzing: Analyzing,
  results:   Results,
  history:   HistoryScreen,
}

export default function App() {
  const {
    currentScreen, navigate, isRecording,
    pendingFollowUp, showFollowUpModal,
    setPendingFollowUp, setShowFollowUpModal,
  } = useStore()
  const CurrentScreen = SCREEN_MAP[currentScreen]

  // showOptIn starts as null (loading) so we don't flash the modal before
  // we know whether first launch is already complete.
  const [showOptIn, setShowOptIn] = useState<boolean | null>(null)

  useEffect(() => {
    window.electron.settings
      .get()
      .then((s) => {
        setShowOptIn(!s.first_launch_complete)
      })
      .catch((err) => {
        // If settings cannot be loaded we skip the modal — better to show the
        // app than to block the user on a recoverable error.
        console.error('[App] failed to load settings for opt-in check:', err)
        setShowOptIn(false)
      })
  }, [])

  // Subscribe to follow-up:show push events from the main process.
  // Fires when the user clicks an OS notification for an inconclusive session.
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
    // Prevent jumping into recording/analyzing screens via the sidebar
    if (LOCKED_DURING_SESSION.includes(id)) return
    // Don't interrupt an active recording mid-flow
    if (isRecording && id !== 'record') return
    navigate(id)
  }

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
            const locked =
              LOCKED_DURING_SESSION.includes(id) || (isRecording && id !== 'record')
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" role="main">
        <CurrentScreen />
      </main>

      {/* Follow-up modal — rendered outside the main layout so it overlays everything */}
      {showFollowUpModal && pendingFollowUp && (
        <FollowUpModal
          followUpId={pendingFollowUp.followUpId}
          sessionId={pendingFollowUp.sessionId}
          onClose={handleFollowUpClose}
        />
      )}

      {/* First-launch telemetry opt-in overlay */}
      {showOptIn === true && (
        <TelemetryOptIn onDismiss={() => setShowOptIn(false)} />
      )}
    </div>
  )
}
