import { useEffect, useState } from 'react'
import type { Team } from '../lib/teams'

/** Team crest with graceful fallback to a coloured monogram. */
export function Crest({ team, size = 28 }: { team?: Team; size?: number }) {
  const [failed, setFailed] = useState(false)
  const dim = { width: size, height: size }
  if (!team) {
    return (
      <div
        style={dim}
        className="rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)]"
      />
    )
  }
  if (failed) {
    return (
      <div
        style={dim}
        className="grid place-items-center rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[10px] font-bold text-white/70"
      >
        {team.abbr.slice(0, 3)}
      </div>
    )
  }
  return (
    <img
      src={team.crest}
      alt={team.name}
      style={dim}
      className="object-contain"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/** Lives as hearts. */
export function Hearts({ left, total }: { left: number; total: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`${left} of ${total} lives`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i < left ? 'text-rose-400' : 'text-white/15'}>
          {i < left ? '♥' : '♡'}
        </span>
      ))}
    </span>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/60">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[var(--color-brand)]" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

/** Live-updating countdown to a deadline. */
export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const diff = new Date(to).getTime() - now
  if (diff <= 0) return <span className="text-rose-400 font-semibold">Locked</span>
  const s = Math.floor(diff / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  // Keep it compact so it fits a stat card: days+hours when far out,
  // full h/m/s in the final day when it actually matters.
  const parts = d > 0 ? [`${d}d`, `${h}h`] : [`${h}h`, `${m}m`, `${sec}s`]
  return <span className="tabular-nums font-semibold">{parts.join(' ')}</span>
}

export function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: React.ReactNode
  accent?: boolean
}) {
  return (
    <div className="card p-3.5 flex-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-white/45 truncate">{label}</div>
      <div
        className={`mt-1 text-lg font-bold truncate ${accent ? 'text-[var(--color-brand)]' : 'text-white'}`}
      >
        {value}
      </div>
    </div>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'green' | 'red' | 'amber' | 'live'
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/5 text-white/60 border-white/10',
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    red: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    live: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {tone === 'live' && (
        <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
      )}
      {children}
    </span>
  )
}
