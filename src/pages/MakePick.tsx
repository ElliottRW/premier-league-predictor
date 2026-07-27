import { useMemo, useState } from 'react'
import type { GameData } from '../lib/useGameData'
import { gwKey, submitPick } from '../lib/sheet'
import { findTeam } from '../lib/teams'
import type { Team } from '../lib/teams'
import { fixtureForTeam } from '../lib/espn'
import { Crest, Countdown } from '../components/ui'

export function MakePick({
  data,
  onDone,
  goHome,
}: {
  data: GameData
  onDone: () => void
  goHome: () => void
}) {
  const { current, currentFixtures, players, teams, now } = data
  const [name, setName] = useState('')
  const [pending, setPending] = useState<Team | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Team | null>(null)

  const player = players.find((p) => p.name === name)
  const locked = current ? now.getTime() >= new Date(current.deadline).getTime() : true
  const currentPick = player && current ? player.picks[gwKey(current.round)] : undefined
  const currentPickTeam = findTeam(teams, currentPick)

  // Teams available to pick = all teams not used in OTHER rounds (current-round
  // pick is changeable, so it stays selectable/highlighted).
  const available = useMemo(() => {
    if (!player || !current) return []
    const usedElsewhere = new Set<string>()
    for (const [k, v] of Object.entries(player.picks)) {
      if (k === gwKey(current.round)) continue
      const t = findTeam(teams, v)
      if (t) usedElsewhere.add(t.id)
    }
    return teams.filter((t) => !usedElsewhere.has(t.id))
  }, [player, current, teams])

  if (!current) return <p className="card p-4 text-white/60">The season hasn’t started yet.</p>

  if (locked) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-center">
        <div className="text-3xl mb-2">🔒</div>
        <p className="font-semibold">Picks are locked for GW{current.round}</p>
        <p className="text-white/50 text-sm mt-1">
          The deadline has passed. Head to Standings to see everyone’s picks and results.
        </p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-center fade-up">
        <div className="text-4xl mb-2">🎉</div>
        <p className="font-semibold text-lg">Pick locked in!</p>
        <div className="my-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2">
          <Crest team={done} size={28} />
          <span className="font-semibold">{done.name}</span>
        </div>
        <p className="text-white/50 text-sm">
          {name} · GW{current.round}. You can change it any time before the deadline.
        </p>
        <div className="mt-5 flex gap-2 justify-center">
          <button
            onClick={() => {
              setDone(null)
              setName('')
            }}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
          >
            Another player
          </button>
          <button
            onClick={goHome}
            className="rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {/* Deadline banner */}
      <div className="card px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">GW{current.round} pick</div>
          <div className="text-xs text-white/45">Locks in <Countdown to={current.deadline} /></div>
        </div>
        <span className="text-2xl">✅</span>
      </div>

      {/* Step 1: who are you */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-white/70">1 · Your name</label>
        <select
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setPending(null)
            setError(null)
          }}
          className="w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-3 text-base outline-none focus:border-[var(--color-brand)]"
        >
          <option value="">Select your name…</option>
          {[...players]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
        </select>
      </div>

      {/* Step 2: pick a team */}
      {player && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-white/70">
            2 · Pick a team{' '}
            <span className="font-normal text-white/40">
              ({available.length} left{currentPickTeam ? ` · now: ${currentPickTeam.name}` : ''})
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {available.map((t) => {
              const fx = fixtureForTeam(currentFixtures, t.id)
              const isHome = fx?.home.teamId === t.id
              const opp = fx ? (isHome ? fx.away : fx.home) : undefined
              const noGame = !fx
              const selected = currentPickTeam?.id === t.id
              return (
                <button
                  key={t.id}
                  disabled={noGame}
                  onClick={() => {
                    setPending(t)
                    setPin('')
                    setError(null)
                  }}
                  className={`card p-3 text-left transition ${
                    noGame
                      ? 'opacity-35 cursor-not-allowed'
                      : selected
                        ? 'ring-2 ring-[var(--color-brand)] border-transparent'
                        : 'hover:border-white/25 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Crest team={t} size={30} />
                    <span className="font-semibold text-sm truncate">{t.name}</span>
                  </div>
                  <div className="mt-1.5 text-[11px] text-white/45 truncate">
                    {noGame ? 'No game this week' : `${isHome ? 'vs' : '@'} ${opp?.name}`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Confirm sheet */}
      {pending && player && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm p-5 fade-up">
            <div className="flex items-center gap-3">
              <Crest team={pending} size={40} />
              <div>
                <div className="font-bold text-lg">{pending.name}</div>
                <div className="text-xs text-white/45">
                  {name} · GW{current.round}
                </div>
              </div>
            </div>

            <label className="mt-4 mb-1.5 block text-sm font-semibold text-white/70">
              Enter your 2-digit PIN to confirm
            </label>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={2}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="••"
              className="w-full text-center tracking-[0.5em] text-2xl rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-4 py-3 outline-none focus:border-[var(--color-brand)]"
            />
            {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setPending(null)
                  setError(null)
                }}
                className="flex-1 rounded-lg bg-white/10 py-2.5 text-sm font-semibold hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                disabled={pin.length !== 2 || busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    const res = await submitPick(name, pin, current.round, pending.name)
                    if (!res.ok) {
                      setError(res.error || 'Could not submit pick')
                    } else {
                      setDone(pending)
                      setPending(null)
                      onDone()
                    }
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Network error')
                  } finally {
                    setBusy(false)
                  }
                }}
                className="flex-1 rounded-lg bg-[var(--color-brand)] py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Confirm pick'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
