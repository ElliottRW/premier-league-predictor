import { useState } from 'react'
import { useGameData } from './lib/useGameData'
import { Spinner } from './components/ui'
import { Dashboard } from './pages/Dashboard'
import { MakePick } from './pages/MakePick'
import { Standings } from './pages/Standings'
import { MOCK_MODE } from './config'

type Tab = 'home' | 'pick' | 'standings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'pick', label: 'Make Pick', icon: '✅' },
  { id: 'standings', label: 'Standings', icon: '🏆' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const data = useGameData()

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl lg:max-w-6xl flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-lg bg-[var(--color-bg)]/70 border-b border-[var(--color-border)]">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
              <span>⚽</span> Premier League Predictor
            </h1>
            <p className="text-xs text-white/45">
              Last Man Standing {data.schedule ? `· ${data.schedule.season}` : ''}
              {MOCK_MODE && <span className="ml-2 text-amber-400">· demo data</span>}
            </p>
          </div>
          <button
            onClick={data.refresh}
            title="Refresh"
            className="rounded-full h-9 w-9 grid place-items-center bg-white/5 hover:bg-white/10 border border-[var(--color-border)] transition"
          >
            ↻
          </button>
        </div>
        {/* Tabs — equal thirds on mobile, compact & left-aligned on desktop */}
        <nav className="px-2 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 lg:flex-none lg:px-8 py-2.5 text-sm font-semibold rounded-t-lg transition relative ${
                tab === t.id ? 'text-white' : 'text-white/45 hover:text-white/70'
              }`}
            >
              <span className="mr-1">{t.icon}</span>
              {t.label}
              {tab === t.id && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-[var(--color-brand)]" />
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Body */}
      <main className="flex-1 px-4 py-5">
        {data.loading && !data.schedule ? (
          <Spinner label="Loading fixtures & players…" />
        ) : data.error ? (
          <ErrorBox message={data.error} onRetry={data.refresh} />
        ) : (
          <div className="fade-up" key={tab}>
            {tab === 'home' && <Dashboard data={data} />}
            {tab === 'pick' && <MakePick data={data} onDone={data.refresh} goHome={() => setTab('home')} />}
            {tab === 'standings' && <Standings data={data} />}
          </div>
        )}
      </main>

      <footer className="px-4 py-6 text-center text-xs text-white/30">
        Only a win keeps you alive · draw or loss costs a life · 3 lives · no team twice
      </footer>
    </div>
  )
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card p-6 text-center">
      <div className="text-2xl mb-2">⚠️</div>
      <p className="text-white/80 font-medium">Couldn’t load data</p>
      <p className="text-white/40 text-sm mt-1">{message}</p>
      <button
        onClick={onRetry}
        className="mt-4 rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold hover:opacity-90"
      >
        Try again
      </button>
    </div>
  )
}
