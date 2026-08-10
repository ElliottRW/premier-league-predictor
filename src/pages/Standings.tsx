import type { GameData } from '../lib/useGameData'
import type { Grade, Standing } from '../lib/game'
import type { PickResult } from '../lib/game'
import { gwKey } from '../lib/sheet'
import { Crest, Hearts } from '../components/ui'

const gradeStyle: Record<Grade, string> = {
  win: 'bg-emerald-500/20 border-emerald-500/40',
  draw: 'bg-rose-500/20 border-rose-500/40',
  loss: 'bg-rose-500/25 border-rose-500/50',
  missed: 'bg-amber-500/20 border-amber-500/40',
  void: 'bg-orange-500/20 border-orange-500/50 border-dashed',
  voidweek: 'bg-white/5 border-white/15 opacity-50',
  pending: 'bg-white/5 border-white/10',
  out: 'bg-black/40 border-white/5',
}

export function Standings({ data }: { data: GameData }) {
  const { standings, schedule, current, lives, now } = data
  if (!schedule) return null

  const lastRound = current?.round ?? schedule.rounds.length
  const rounds = Array.from({ length: lastRound }, (_, i) => i + 1)
  const lockedCurrent = current
    ? now.getTime() >= new Date(current.deadline).getTime()
    : true

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-white/50 flex-wrap">
        <Legend className="bg-emerald-500/30" label="Win" />
        <Legend className="bg-rose-500/30" label="Draw / Loss" />
        <Legend className="bg-amber-500/30" label="No pick" />
        <Legend className="bg-orange-500/30" label="No game (−1 life)" />
        <Legend className="bg-white/10" label="To play" />
        <Legend className="bg-white/10 opacity-50" label="Void week" />
      </div>

      <div className="card overflow-x-auto no-scrollbar">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-[var(--color-surface)] px-3 py-2 text-left font-semibold text-white/60">
                Player
              </th>
              <th className="px-2 py-2 text-center font-semibold text-white/60">Lives</th>
              {rounds.map((r) => (
                <th
                  key={r}
                  className="px-1 py-2 text-center font-semibold text-white/40 min-w-[42px]"
                >
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <Row
                key={s.player.name}
                s={s}
                rounds={rounds}
                lives={lives}
                currentRound={current?.round}
                lockedCurrent={lockedCurrent}
              />
            ))}
          </tbody>
        </table>
      </div>

      {standings.length === 0 && <p className="text-white/50 text-sm">No players yet.</p>}
    </div>
  )
}

function Row({
  s,
  rounds,
  lives,
  currentRound,
  lockedCurrent,
}: {
  s: Standing
  rounds: number[]
  lives: number
  currentRound?: number
  lockedCurrent: boolean
}) {
  const byRound = new Map<number, PickResult>()
  for (const r of s.results) byRound.set(r.round, r)

  return (
    <tr className={s.out ? 'opacity-45' : ''}>
      <td className="sticky left-0 z-10 bg-[var(--color-surface)] px-3 py-2 border-t border-[var(--color-border)]">
        <div className={`font-medium truncate max-w-[130px] ${s.out ? 'line-through' : ''}`}>
          {s.player.name}
        </div>
        {s.out && (
          <div className="text-[10px] text-rose-400/70">
            OUT{s.eliminatedRound ? ` · GW${s.eliminatedRound}` : ''}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-center border-t border-[var(--color-border)] whitespace-nowrap">
        <Hearts left={s.livesLeft} total={lives} />
      </td>
      {rounds.map((r) => {
        const res = byRound.get(r)
        const isCurrentUnlocked = r === currentRound && !lockedCurrent
        const pickedThisRound = s.player.picks[gwKey(r)]
        return (
          <td key={r} className="px-1 py-1.5 text-center border-t border-[var(--color-border)]">
            <Cell res={res} maskedPicked={isCurrentUnlocked ? Boolean(pickedThisRound) : undefined} />
          </td>
        )
      })}
    </tr>
  )
}

function Cell({ res, maskedPicked }: { res?: PickResult; maskedPicked?: boolean }) {
  // Current round before lock: don't reveal the team.
  if (maskedPicked !== undefined) {
    return (
      <div className="mx-auto grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-white/5 text-xs">
        {maskedPicked ? '🔒' : ''}
      </div>
    )
  }
  if (!res) {
    return <div className="mx-auto h-9 w-9 rounded-md" />
  }
  if (res.grade === 'missed') {
    return (
      <div
        className={`mx-auto grid h-9 w-9 place-items-center rounded-md border text-xs text-amber-300 ${gradeStyle.missed}`}
        title="No pick"
      >
        —
      </div>
    )
  }
  return (
    <div
      className={`mx-auto grid h-9 w-9 place-items-center rounded-md border ${gradeStyle[res.grade]}`}
      title={`${res.team?.name ?? res.pickRaw ?? ''} · ${
        res.grade === 'void'
          ? 'no game (−1 life)'
          : res.grade === 'voidweek'
            ? 'gameweek voided (safe)'
            : res.grade
      }`}
    >
      {res.team ? <Crest team={res.team} size={22} /> : <span className="text-[10px]">?</span>}
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${className}`} />
      {label}
    </span>
  )
}
