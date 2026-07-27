/**
 * ESPN data layer.
 *
 * ESPN's public site API serves Premier League fixtures, live scores and crests
 * with open CORS (access-control-allow-origin: *), so we call it straight from
 * the browser — no server, no proxy.
 */
import { ESPN_LEAGUE } from '../config'
import type { Team } from './teams'

// In dev, go through Vite's proxy (see vite.config.ts) to sidestep any browser
// network sandbox; in production, call ESPN directly (its CORS is open).
const ESPN_HOST = import.meta.env.DEV ? '/espn' : 'https://site.api.espn.com'
const BASE = `${ESPN_HOST}/apis/site/v2/sports/soccer/${ESPN_LEAGUE}`

export type MatchState = 'pre' | 'in' | 'post'
export type Outcome = 'win' | 'draw' | 'loss' | 'pending'

export interface FixtureSide {
  teamId: string
  name: string
  fullName: string
  abbr: string
  crest: string
  score: number | null
}

export interface Fixture {
  id: string
  date: string // ISO kickoff time
  state: MatchState
  completed: boolean
  statusText: string // e.g. "FT", "45'", "Sat 3:00 PM"
  home: FixtureSide
  away: FixtureSide
}

function fmt(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function crestFor(teamId: string, fallback?: string): string {
  return fallback || `https://a.espncdn.com/i/teamlogos/soccer/500/${teamId}.png`
}

function sideFrom(c: any): FixtureSide {
  const t = c.team ?? {}
  const score = c.score === undefined || c.score === '' ? null : Number(c.score)
  return {
    teamId: String(t.id ?? ''),
    name: t.shortDisplayName ?? t.displayName ?? t.name ?? '',
    fullName: t.displayName ?? t.name ?? '',
    abbr: t.abbreviation ?? '',
    crest: crestFor(String(t.id ?? ''), t.logo),
    score: Number.isNaN(score as number) ? null : score,
  }
}

function mapEvent(e: any): Fixture | null {
  const comp = e.competitions?.[0]
  if (!comp) return null
  const competitors = comp.competitors ?? []
  const home = competitors.find((c: any) => c.homeAway === 'home')
  const away = competitors.find((c: any) => c.homeAway === 'away')
  if (!home || !away) return null
  const st = e.status?.type ?? {}
  const state = (st.state ?? 'pre') as MatchState
  return {
    id: String(e.id),
    date: e.date,
    state,
    completed: Boolean(st.completed),
    statusText: st.shortDetail ?? st.detail ?? st.description ?? '',
    home: sideFrom(home),
    away: sideFrom(away),
  }
}

/** Fetch fixtures/results for a date range (inclusive), YYYY-MM-DD strings. */
export async function fetchFixtures(start: string, end: string): Promise<Fixture[]> {
  const url = `${BASE}/scoreboard?dates=${fmt(start)}-${fmt(end)}&limit=200`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN fixtures ${res.status}`)
  const data = await res.json()
  const events: any[] = data.events ?? []
  return events
    .map(mapEvent)
    .filter((f): f is Fixture => f !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Load the season's 20 teams from ESPN. */
export async function loadTeams(): Promise<Team[]> {
  const res = await fetch(`${BASE}/teams`)
  if (!res.ok) throw new Error(`ESPN teams ${res.status}`)
  const data = await res.json()
  const raw: any[] = data.sports?.[0]?.leagues?.[0]?.teams ?? []
  return raw
    .map((x) => x.team)
    .filter(Boolean)
    .map((t: any) => ({
      id: String(t.id),
      abbr: t.abbreviation ?? '',
      name: t.shortDisplayName ?? t.displayName ?? '',
      fullName: t.displayName ?? t.name ?? '',
      crest: crestFor(String(t.id), (t.logos ?? [])[0]?.href),
    }))
    .sort((a: Team, b: Team) => a.name.localeCompare(b.name))
}

/** Grade one team's result within a fixture. */
export function outcomeFor(fx: Fixture, teamId: string): Outcome {
  const isHome = fx.home.teamId === teamId
  const isAway = fx.away.teamId === teamId
  if (!isHome && !isAway) return 'pending'
  if (!fx.completed || fx.home.score === null || fx.away.score === null) return 'pending'
  const me = isHome ? fx.home.score : fx.away.score
  const them = isHome ? fx.away.score : fx.home.score
  if (me > them) return 'win'
  if (me === them) return 'draw'
  return 'loss'
}

/**
 * The fixture that COUNTS for a team in a round — always their FIRST match by
 * kickoff. This is what makes double gameweeks fair: if a team plays twice, only
 * their earliest game decides their result, so a team that loses (or draws)
 * their first match can't be rescued by winning a later one in the same round.
 * Both result grading and the pick card use this, so the rule holds everywhere.
 */
export function fixtureForTeam(fixtures: Fixture[], teamId: string): Fixture | undefined {
  let first: Fixture | undefined
  for (const f of fixtures) {
    if (f.home.teamId === teamId || f.away.teamId === teamId) {
      if (!first || f.date < first.date) first = f
    }
  }
  return first
}
