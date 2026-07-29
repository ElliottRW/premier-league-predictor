import { useState } from 'react'
import type { GameData } from '../lib/useGameData'
import type { AdminPlayer } from '../lib/sheet'
import { adminAddPlayer, adminData, adminRemovePlayer } from '../lib/sheet'
import { findTeam } from '../lib/teams'
import { Crest } from '../components/ui'

const gwNum = (k: string) => Number(k.replace(/\D/g, ''))
function fmtTime(iso?: string): string {
  if (!iso) return 'before logging'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function Admin({ data, onExit }: { data: GameData; onExit: () => void }) {
  const { teams } = data
  const [pass, setPass] = useState('')
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  async function login() {
    setLoading(true)
    setError(null)
    try {
      const res = await adminData(pass)
      if (res.ok) setPlayers(res.players)
      else setError(res.error || 'Login failed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  async function reload() {
    const res = await adminData(pass)
    if (res.ok) setPlayers(res.players)
  }

  async function addPlayer() {
    if (!newName.trim()) return
    setBusy(true)
    setActionMsg(null)
    try {
      const res = await adminAddPlayer(pass, newName.trim(), newPin.trim())
      if (!res.ok) {
        setActionMsg(res.error || 'Could not add player')
      } else {
        setNewName('')
        setNewPin('')
        setActionMsg(`Added ${newName.trim()}`)
        await reload()
        data.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  async function removePlayer(name: string) {
    if (!confirm(`Remove ${name}? This deletes their row from the sheet.`)) return
    setBusy(true)
    setActionMsg(null)
    try {
      const res = await adminRemovePlayer(pass, name)
      if (!res.ok) {
        setActionMsg(res.error || 'Could not remove player')
      } else {
        setActionMsg(`Removed ${name}`)
        await reload()
        data.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  /* ----- Login gate ----- */
  if (!players) {
    return (
      <div className="mx-auto max-w-sm">
        <button onClick={onExit} className="mb-4 text-sm text-white/50 hover:text-white/80">
          ‹ Back to app
        </button>
        <div className="card p-6">
          <div className="mb-1 text-2xl">🔐</div>
          <h1 className="text-lg font-bold">Admin</h1>
          <p className="mt-1 text-sm text-white/50">Enter the admin password to manage players.</p>
          <input
            type="password"
            autoFocus
            value={pass}
            onChange={(e) => {
              setPass(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && pass && !loading && login()}
            placeholder="Admin password"
            className="mt-4 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 outline-none focus:border-[var(--color-brand)]"
          />
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          <button
            disabled={!pass || loading}
            onClick={login}
            className="mt-4 w-full rounded-lg bg-[var(--color-brand)] py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40"
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </div>
      </div>
    )
  }

  /* ----- Admin panel ----- */
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">Admin</h1>
          <p className="text-sm text-white/45">{players.length} players</p>
        </div>
        <button onClick={onExit} className="text-sm text-white/50 hover:text-white/80">
          ‹ Back to app
        </button>
      </div>

      {/* Add player */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-white/50">Add a player</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Player name"
            className="flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
          />
          <input
            inputMode="numeric"
            maxLength={2}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="PIN"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2.5 text-center text-sm tracking-widest outline-none focus:border-[var(--color-brand)] sm:w-24"
          />
          <button
            disabled={!newName.trim() || busy}
            onClick={addPlayer}
            className="rounded-lg bg-[var(--color-brand)] px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {actionMsg && <p className="mt-2 text-sm text-white/60">{actionMsg}</p>}
      </section>

      {/* Players + picks + timestamps */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white/50">
          Players &amp; picks
        </h2>
        {players.map((p) => {
          const picks = Object.keys(p.picks).sort((a, b) => gwNum(a) - gwNum(b))
          return (
            <div key={p.name} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-white/40">
                    PIN {p.pin || '—'} · {p.paid ? 'Paid' : 'Unpaid'}
                  </div>
                </div>
                <button
                  onClick={() => removePlayer(p.name)}
                  disabled={busy}
                  className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>

              {picks.length === 0 ? (
                <p className="mt-3 text-sm text-white/35">No picks yet.</p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  {picks.map((gw) => {
                    const team = findTeam(teams, p.picks[gw])
                    return (
                      <div key={gw} className="flex items-center gap-2 text-sm">
                        <span className="w-12 shrink-0 font-medium text-white/50">{gw}</span>
                        <Crest team={team} size={18} />
                        <span className="font-medium">{team?.name ?? p.picks[gw]}</span>
                        <span className="ml-auto text-xs text-white/40">{fmtTime(p.times[gw])}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
