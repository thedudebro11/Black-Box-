import { Zap, FileText, Radio, Activity, BarChart2, History, type LucideIcon } from 'lucide-react'
import { useStore, type Screen } from './store'
import Welcome from './screens/Welcome'
import Describe from './screens/Describe'
import Record from './screens/Record'
import Analyzing from './screens/Analyzing'
import Results from './screens/Results'
import HistoryScreen from './screens/History'

const SCREENS: { id: Screen; label: string; Icon: LucideIcon }[] = [
  { id: 'welcome', label: 'Welcome', Icon: Zap },
  { id: 'describe', label: 'Describe', Icon: FileText },
  { id: 'record', label: 'Record', Icon: Radio },
  { id: 'analyzing', label: 'Analyzing', Icon: Activity },
  { id: 'results', label: 'Results', Icon: BarChart2 },
  { id: 'history', label: 'History', Icon: History },
]

const SCREEN_MAP: Record<Screen, React.FC> = {
  welcome: Welcome,
  describe: Describe,
  record: Record,
  analyzing: Analyzing,
  results: Results,
  history: HistoryScreen,
}

export default function App() {
  const { currentScreen, navigate } = useStore()
  const CurrentScreen = SCREEN_MAP[currentScreen]

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
          <p className="text-secondary text-xs mt-1 font-mono">v1.0.0 — scaffold</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {SCREENS.map(({ id, label, Icon }) => {
            const active = currentScreen === id
            return (
              <button
                key={id}
                onClick={() => navigate(id)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors text-left',
                  active
                    ? 'bg-surface-raised text-primary border border-app-border'
                    : 'text-secondary hover:text-primary hover:bg-surface-raised',
                ].join(' ')}
              >
                <Icon size={15} className={active ? 'text-accent' : ''} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* Dev notice */}
        <div className="px-4 py-4 border-t border-app-border">
          <p className="text-xs text-secondary font-mono leading-relaxed">
            Phase 1 — Scaffold
            <br />
            <span className="text-accent">Navigation active</span>
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <CurrentScreen />
      </main>
    </div>
  )
}
