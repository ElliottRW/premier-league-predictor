import { useEffect, useMemo, useState } from 'react'
import type { GameData } from '../lib/useGameData'
import { gwKey, submitPick, verifyPin } from '../lib/sheet'
import { findTeam } from '../lib/teams'
import type { Team } from '../lib/teams'
import type { Fixture } from '../lib/espn'
import { fetchFixtures, fixtureForTeam } from '../lib/espn'
import { Crest, Countdown } from '../components/ui'

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function MakePick({
  data,
  onDone,
  goHome,
}: {
  data: GameData
  onDone: () => void
  goHome: () => void
}) {
  const { current, players, teams, schedule, roundFixtures, now } = data
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [pickRound, setPickRound] = useState<number>(current?.round ?? 1)
  const [onDemand, setOnDemand] = useState<Map<number, Fixture[]>>(new Map())
  const [fxLoading, setFxLoading] = useState(false)
  const [pending, setPending] = useState<Team | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ team: Team; round: number } | null>(null)

  const player = players.find((p) => p.name === name)
  const roundMeta = schedule?.rounds.find((r) => r.round === pickRound) ?? null

  // Rounds you can still pick for: the current one onwards (all future ones too).
  const selectableRounds =
    schedule && current ? schedule.rounds.filter((r) => r.round >= current.round) : []

  // Fixtures for the selected round: current/cached come from roundFixtures;
  // future rounds are fetched from ESPN once, on demand.
  const fixtures = roundFixtures.get(pickRound) ?? onDemand.get(pickRound) ?? null
  useEffect(() => {
    if (fixtures || !roundMeta) return
    let cancelled = false
    setFxLoading(true)
    fetchFixtures(roundMeta.start, roundMeta.end)
      .then((list) => !cancelled && setOnDemand((m) => new Map(m).set(pickRound, list)))
      .catch(() => {})
      .finally(() => !cancelled && setFxLoading(false))
    return () => {
      cancelled = true
    }
  }, [pickRound, fixtures, roundMeta])

  const currentPickRaw = player ? player.picks[gwKey(pickRound)] : undefined
  const currentPickTeam = findTeam(teams, currentPickRaw)

  // Available = teams not used in any OTHER round (past picks or other advance
  // picks). The selected round's own pick stays selectable so it can be changed.
  const available = useMemo(() => {
    if (!player) return []
    const usedElsewhere = new Set<string>()
    for (const [k, v] of Object.entries(player.picks)) {
      if (k === gwKey(pickRound)) continue
      const t = findTeam(teams, v)
      if (t) usedElsewhere.add(t.id)
    }
    return teams.filter((t) => !usedElsewhere.has(t.id))
  }, [player, pickRound, teams])

  const isAdvance = current ? pickRound > current.round : false
  const lockedRound = roundMeta ? now.getTime() >= new Date(roundMeta.deadline).getTime() : true

  function resetPlayer() {
    setName('')
    setPin('')
    setVerified(false)
    setPending(null)
    setError(null)
    setPickRound(current?.round ?? 1)
  }

  if (!current) return <p className="card p-4 text-white/60">The season hasn’t started yet.</p>

  if (done) {
    return (
      <div className="card mx-auto max-w-lg p-6 text-center fade-up">
        <div className="text-4xl mb-2">🎉</div>
        <p className="font-semibold text-lg">Pick locked in!</p>
        <div className="my-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2">
          <Crest team={done.team} size={28} />
          <span className="font-semibold">{done.team.name}</span>
        </div>
        <p className="text-white/50 text-sm">
          {name} · GW{done.round}. You can change it any time before the deadline.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => setDone(null)}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15"
          >
            Pick another week
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

  async function handleVerify() {
    setVerifying(true)
    setError(null)
    try {
      const res = await verifyPin(name, pin)
      if (res.ok) setVerified(true)
      else setError(res.error || 'Could not verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      {/* Deadline banner (for the selected round) */}
      <div className="card px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">
            GW{pickRound} pick
            {isAdvance && (
              <span className="ml-2 rounded-full bg-[var(--color-brand)]/20 px-2 py-0.5 text-[11px] font-medium text-[var(--color-brand)]">
                advance
              </span>
            )}
          </div>
          <div className="text-xs text-white/45">
            {lockedRound ? 'Deadline passed' : <>Locks in <Countdown to={roundMeta!.deadline} /></>}
          </div>
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
            setPin('')
            setVerified(false)
            setPending(null)
            setError(null)
          }}
          disabled={verified}
          className="w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-3 text-base outline-none focus:border-[var(--color-brand)] disabled:opacity-60"
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

      {/* Step 2: verify PIN (gate — reveals nothing until confirmed) */}
      {player && !verified && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-white/70">
            2 · Enter your 2-digit PIN
          </label>
          <div className="flex gap-2">
            <input
              autoFocus
              inputMode="numeric"
              maxLength={2}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 2))
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pin.length === 2 && !verifying) handleVerify()
              }}
              placeholder="••"
              className="w-28 text-center tracking-[0.5em] text-2xl rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] px-4 py-3 outline-none focus:border-[var(--color-brand)]"
            />
            <button
              disabled={pin.length !== 2 || verifying}
              onClick={handleVerify}
              className="flex-1 rounded-xl bg-[var(--color-brand)] px-4 text-sm font-semibold hover:opacity-90 disabled:opacity-40"
            >
              {verifying ? 'Checking…' : 'Continue'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          <p className="mt-2 text-xs text-white/40">
            Your PIN keeps your pick private — nobody can view or change it without it.
          </p>
        </div>
      )}

      {/* Step 3: choose the gameweek + pick a team (after PIN verified) */}
      {player && verified && (
        <>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-semibold text-white/70">2 · Gameweek</label>
              <button
                onClick={resetPlayer}
                className="text-xs font-medium text-white/45 hover:text-white/80"
              >
                Not you? Change
              </button>
            </div>
            <select
              value={pickRound}
              onChange={(e) => {
                setPickRound(Number(e.target.value))
                setPending(null)
                setError(null)
              }}
              className="w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-3 text-base outline-none focus:border-[var(--color-brand)]"
            >
              {selectableRounds.map((r) => {
                const has = player.picks[gwKey(r.round)]
                const t = findTeam(teams, has)
                return (
                  <option key={r.round} value={r.round}>
                    GW{r.round} — locks {shortDate(r.deadline)}
                    {r.round === current.round ? ' (this week)' : ''}
                    {has ? ` · picked ${t?.name ?? has}` : ''}
                  </option>
                )
              })}
            </select>
            <p className="mt-1.5 text-xs text-white/40">
              Going away? Pick future weeks in advance — you can change them any time before each
              deadline.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white/70">
              3 · Pick a team{' '}
              <span className="font-normal text-white/40">
                ({available.length} left{currentPickTeam ? ` · now: ${currentPickTeam.name}` : ''})
              </span>
            </label>

            {/* Fixture-change warning: your pick's team no longer plays this round */}
            {currentPickTeam &&
              fixtures &&
              fixtures.length > 0 &&
              !fixtureForTeam(fixtures, currentPickTeam.id) && (
                <div className="mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  ⚠️ <strong>{currentPickTeam.name}</strong> aren’t playing in GW{pickRound} anymore —
                  the fixture was moved. Pick another team below before the deadline, or you’ll lose a
                  life.
                </div>
              )}

            {lockedRound ? (
              <p className="card p-4 text-sm text-white/50">
                GW{pickRound} is locked — its deadline has passed.
              </p>
            ) : fxLoading && !fixtures ? (
              <p className="card p-4 text-sm text-white/50">Loading GW{pickRound} fixtures…</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {available.map((t) => {
                  const fx = fixtures ? fixtureForTeam(fixtures, t.id) : undefined
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
            )}
          </div>
        </>
      )}

      {/* Confirm sheet (identity already verified — just confirm the team) */}
      {pending && player && verified && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-sm p-5 fade-up">
            <div className="flex items-center gap-3">
              <Crest team={pending} size={40} />
              <div>
                <div className="font-bold text-lg">{pending.name}</div>
                <div className="text-xs text-white/45">
                  {name} · GW{pickRound}
                  {isAdvance ? ' (advance)' : ''}
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-white/60">
              Lock in <span className="font-semibold text-white/90">{pending.name}</span> for GW
              {pickRound}?
            </p>
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
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    const res = await submitPick(name, pin, pickRound, pending.name)
                    if (!res.ok) {
                      setError(res.error || 'Could not submit pick')
                    } else {
                      setDone({ team: pending, round: pickRound })
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
