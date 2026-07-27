import type { Fixture } from '../lib/espn'
import { Crest, Pill } from './ui'

function kickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Compact match row with crests, score/kickoff and status. */
export function FixtureCard({ fx }: { fx: Fixture }) {
  const live = fx.state === 'in'
  const done = fx.state === 'post'
  const showScore = live || done

  return (
    <div className="card px-3 py-2.5 flex items-center gap-3">
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        <span className="truncate text-sm font-medium text-right">{fx.home.name}</span>
        <Crest team={crestTeam(fx.home)} size={24} />
      </div>

      <div className="shrink-0 text-center min-w-[64px]">
        {showScore ? (
          <div className="text-base font-bold tabular-nums">
            {fx.home.score}<span className="text-white/30 px-1">–</span>{fx.away.score}
          </div>
        ) : (
          <div className="text-[11px] leading-tight text-white/50">{kickoff(fx.date)}</div>
        )}
        <div className="mt-0.5 flex justify-center">
          {live ? (
            <Pill tone="live">{fx.statusText || 'LIVE'}</Pill>
          ) : done ? (
            <Pill tone="neutral">FT</Pill>
          ) : null}
        </div>
      </div>

      <div className="flex-1 flex items-center gap-2 min-w-0">
        <Crest team={crestTeam(fx.away)} size={24} />
        <span className="truncate text-sm font-medium">{fx.away.name}</span>
      </div>
    </div>
  )
}

// Adapt a FixtureSide into the shape <Crest> wants.
function crestTeam(side: Fixture['home']) {
  return { id: side.teamId, abbr: side.abbr, name: side.name, fullName: side.fullName, crest: side.crest }
}
