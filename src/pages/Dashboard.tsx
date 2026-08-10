import { useEffect, useState } from 'react'
import type { GameData } from '../lib/useGameData'
import { gwKey } from '../lib/sheet'
import { findTeam } from '../lib/teams'
import type { Fixture } from '../lib/espn'
import { fetchFixtures, fixtureForTeam, outcomeFor } from '../lib/espn'
import { Crest, Hearts, Countdown, StatCard, Pill } from '../components/ui'
import { FixtureCard } from '../components/FixtureCard'

export function Dashboard({ data }: { data: GameData }) {
  const { current, currentFixtures, standings, lives, teams, now, schedule, roundFixtures } = data
  const survivors = standings.filter((s) => !s.out)
  const eliminated = standings.filter((s) => s.out)
  const locked = current ? now.getTime() >= new Date(current.deadline).getTime() : false

  // Any upcoming round (this week or an advance pick) where a survivor's pick is
  // for a team that no longer plays that round — flag as early as possible.
  const affectedRounds: { round: number; count: number }[] = []
  if (current && schedule) {
    for (const r of schedule.rounds) {
      if (r.round < current.round) continue // past rounds are already settled
      const fixtures = roundFixtures.get(r.round)
      if (!fixtures || fixtures.length === 0) continue // fixtures not loaded — can't tell
      let count = 0
      for (const s of survivors) {
        const raw = s.player.picks[gwKey(r.round)]
        const t = findTeam(teams, raw)
        if (raw && t && !fixtureForTeam(fixtures, t.id)) count++
      }
      if (count > 0) affectedRounds.push({ round: r.round, count })
    }
  }

  return (
    <div className="space-y-5">
      {/* Stat row — full width across the top */}
      <div className="flex gap-3">
        <StatCard label="Round" value={current ? `GW${current.round}` : '—'} accent />
        <StatCard
          label={locked ? 'Status' : 'Picks lock in'}
          value={current ? locked ? 'Locked' : <Countdown to={current.deadline} /> : '—'}
        />
        <StatCard label="Still in" value={`${survivors.length}`} />
      </div>

      {/* Fixture-change nudge — covers this week and any advance picks */}
      {affectedRounds.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          ⚠️ Fixtures changed — some picks are for teams no longer playing:{' '}
          <span className="font-semibold">
            {affectedRounds.map((a) => `GW${a.round} (${a.count})`).join(', ')}
          </span>
          . Those players must re-pick before that week's deadline or they'll lose a life.
        </div>
      )}

      {/* Two columns on desktop: standings left, fixtures right. Stacks on mobile. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
      {/* Still standing */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-white/50">
          Still standing · {survivors.length}
        </h2>
        <div className="card divide-y divide-[var(--color-border)] overflow-hidden">
          {survivors.length === 0 && (
            <p className="p-4 text-sm text-white/50">No survivors loaded yet.</p>
          )}
          {survivors.map((s) => {
            const pickRaw = current ? s.player.picks[gwKey(current.round)] : undefined
            const pickTeam = findTeam(teams, pickRaw)
            const fx = pickTeam ? fixtureForTeam(currentFixtures, pickTeam.id) : undefined
            const oc = fx && pickTeam ? outcomeFor(fx, pickTeam.id) : 'pending'
            const noGame = Boolean(pickTeam) && currentFixtures.length > 0 && !fx
            return (
              <div key={s.player.name} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.player.name}</div>
                  <Hearts left={s.livesLeft} total={lives} />
                </div>
                {/* Current-round pick: hidden until deadline */}
                <div className="shrink-0">
                  {!current ? null : !pickRaw ? (
                    <Pill tone="amber">No pick</Pill>
                  ) : !locked ? (
                    <Pill tone="green">Picked ✓</Pill>
                  ) : pickTeam ? (
                    <div className="flex items-center gap-1.5">
                      <Crest team={pickTeam} size={22} />
                      {oc === 'win' && <Pill tone="green">Won</Pill>}
                      {oc === 'loss' && <Pill tone="red">Lost</Pill>}
                      {oc === 'draw' && <Pill tone="red">Drew</Pill>}
                      {oc === 'pending' &&
                        (noGame ? (
                          <Pill tone="amber">No game</Pill>
                        ) : (
                          <Pill tone={fx?.state === 'in' ? 'live' : 'neutral'}>
                            {fx?.state === 'in' ? 'Live' : 'To play'}
                          </Pill>
                        ))}
                    </div>
                  ) : (
                    <Pill tone="neutral">{pickRaw}</Pill>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Eliminated */}
      {eliminated.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-white/40">
            Eliminated · {eliminated.length}
          </h2>
          <div className="card px-3 py-3 flex flex-wrap gap-x-3 gap-y-1">
            {eliminated.map((s) => (
              <span key={s.player.name} className="text-sm text-white/35 line-through">
                {s.player.name}
                {s.eliminatedRound ? ` (GW${s.eliminatedRound})` : ''}
              </span>
            ))}
          </div>
        </section>
      )}
        </div>

        {/* Fixtures — right column on desktop, with gameweek navigation */}
        <FixturesPanel data={data} />
      </div>
    </div>
  )
}

/** Fixtures for a round, with ‹ › navigation to browse any gameweek's results. */
function FixturesPanel({ data }: { data: GameData }) {
  const { schedule, current, roundFixtures } = data
  const lastRound = schedule?.rounds.length ?? 1
  const [viewRound, setViewRound] = useState(current?.round ?? 1)
  const [onDemand, setOnDemand] = useState<Map<number, Fixture[]>>(new Map())
  const [loading, setLoading] = useState(false)

  // Cached (finished) and current rounds are already in roundFixtures; other
  // rounds (e.g. future) are fetched from ESPN once, on demand.
  const fixtures = roundFixtures.get(viewRound) ?? onDemand.get(viewRound) ?? null
  const meta = schedule?.rounds.find((r) => r.round === viewRound)

  useEffect(() => {
    if (fixtures || !meta) return
    let cancelled = false
    setLoading(true)
    fetchFixtures(meta.start, meta.end)
      .then((list) => !cancelled && setOnDemand((m) => new Map(m).set(viewRound, list)))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [viewRound, fixtures, meta])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white/50">
          GW{viewRound} fixtures
          {current?.round === viewRound && <span className="ml-2 text-[var(--color-brand)]">· now</span>}
        </h2>
        <div className="flex items-center gap-1">
          <NavBtn disabled={viewRound <= 1} onClick={() => setViewRound((r) => Math.max(1, r - 1))}>
            ‹
          </NavBtn>
          {current && current.round !== viewRound && (
            <button
              onClick={() => setViewRound(current.round)}
              className="rounded-md px-2 py-1 text-xs font-medium text-white/50 hover:text-white/80"
            >
              Today
            </button>
          )}
          <NavBtn
            disabled={viewRound >= lastRound}
            onClick={() => setViewRound((r) => Math.min(lastRound, r + 1))}
          >
            ›
          </NavBtn>
        </div>
      </div>
      <div className="space-y-2">
        {loading && !fixtures ? (
          <p className="card p-4 text-sm text-white/50">Loading GW{viewRound}…</p>
        ) : !fixtures || fixtures.length === 0 ? (
          <p className="card p-4 text-sm text-white/50">No fixtures found for this round.</p>
        ) : (
          fixtures.map((fx) => <FixtureCard key={fx.id} fx={fx} />)
        )}
      </div>
    </section>
  )
}

function NavBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border border-[var(--color-border)] bg-white/5 text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}
