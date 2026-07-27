import type { GameData } from '../lib/useGameData'
import { gwKey } from '../lib/sheet'
import { findTeam } from '../lib/teams'
import { fixtureForTeam, outcomeFor } from '../lib/espn'
import { Crest, Hearts, Countdown, StatCard, Pill } from '../components/ui'
import { FixtureCard } from '../components/FixtureCard'

export function Dashboard({ data }: { data: GameData }) {
  const { current, currentFixtures, standings, lives, teams, now } = data
  const survivors = standings.filter((s) => !s.out)
  const eliminated = standings.filter((s) => s.out)
  const locked = current ? now.getTime() >= new Date(current.deadline).getTime() : false

  return (
    <div className="space-y-5">
      {/* Stat row */}
      <div className="flex gap-3">
        <StatCard label="Round" value={current ? `GW${current.round}` : '—'} accent />
        <StatCard
          label={locked ? 'Status' : 'Picks lock in'}
          value={current ? locked ? 'Locked' : <Countdown to={current.deadline} /> : '—'}
        />
        <StatCard label="Still in" value={`${survivors.length}`} />
      </div>

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
                      {oc === 'pending' && <Pill tone={fx?.state === 'in' ? 'live' : 'neutral'}>
                        {fx?.state === 'in' ? 'Live' : 'To play'}
                      </Pill>}
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

      {/* Fixtures */}
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-white/50">
          {current ? `GW${current.round} fixtures` : 'Fixtures'}
        </h2>
        <div className="space-y-2">
          {currentFixtures.length === 0 && (
            <p className="card p-4 text-sm text-white/50">No fixtures found for this round.</p>
          )}
          {currentFixtures.map((fx) => (
            <FixtureCard key={fx.id} fx={fx} />
          ))}
        </div>
      </section>
    </div>
  )
}
