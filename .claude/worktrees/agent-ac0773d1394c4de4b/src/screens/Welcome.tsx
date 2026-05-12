import { Zap, ArrowRight } from 'lucide-react'
import { useStore } from '../store'

export default function Welcome() {
  const navigate = useStore((s) => s.navigate)

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen px-8 py-16">
      <div className="w-full max-w-lg">
        {/* Logo mark */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded bg-accent/10 border border-accent/30 flex items-center justify-center">
            <Zap size={20} className="text-accent" />
          </div>
          <span className="font-mono text-xl text-primary font-semibold tracking-wider uppercase">
            Black Box
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-3xl font-semibold text-primary leading-tight mb-3">
          A flight recorder for PCs.
        </h1>
        <p className="text-secondary text-base leading-relaxed mb-10">
          Describe the problem. Record what happens.
          <br />
          Black Box tells you what went wrong and how to fix it.
        </p>

        {/* CTA */}
        <button
          onClick={() => navigate('describe')}
          className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white font-medium px-6 py-3 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50"
          autoFocus
        >
          Start a New Session
          <ArrowRight size={16} />
        </button>

        {/* Feature list */}
        <div className="mt-12 pt-6 border-t border-app-border space-y-2">
          {[
            'Records system events during the problem',
            'Correlates signals against known crash patterns',
            'Tells you the cause with evidence — not a guess',
          ].map((line) => (
            <div key={line} className="flex items-start gap-2.5">
              <span className="w-1 h-1 rounded-full bg-accent/60 mt-2 flex-shrink-0" />
              <p className="text-secondary text-sm">{line}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
