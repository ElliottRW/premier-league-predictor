/**
 * Gameweek (round) schedule.
 *
 * `public/data/gameweeks.json` maps each round number to a date window and a
 * deadline (first kickoff). It's generated once from ESPN by
 * `scripts/build-gameweeks.mjs`, then committed. This decouples our pool's
 * round numbering from ESPN's date-based grouping.
 */

export interface Round {
  round: number
  start: string // YYYY-MM-DD (inclusive)
  end: string // YYYY-MM-DD (inclusive)
  deadline: string // ISO datetime of first kickoff — picks lock here
}

export interface GameweekSchedule {
  season: string
  rounds: Round[]
}

let cache: GameweekSchedule | null = null

export async function loadSchedule(): Promise<GameweekSchedule> {
  if (cache) return cache
  // cache-bust so a browser never serves a stale schedule (it refreshes daily)
  const res = await fetch(`${import.meta.env.BASE_URL}data/gameweeks.json?t=${Date.now()}`)
  if (!res.ok) throw new Error(`gameweeks.json ${res.status}`)
  cache = (await res.json()) as GameweekSchedule
  return cache
}

/** The round players should currently be picking for. */
export function currentRound(schedule: GameweekSchedule, now = new Date()): Round | undefined {
  const rounds = schedule.rounds
  if (rounds.length === 0) return undefined
  // First round whose deadline is still in the future...
  const upcoming = rounds.find((r) => new Date(r.deadline).getTime() > now.getTime())
  if (upcoming) return upcoming
  // ...otherwise the season is over — show the last round.
  return rounds[rounds.length - 1]
}

export function roundByNumber(schedule: GameweekSchedule, n: number): Round | undefined {
  return schedule.rounds.find((r) => r.round === n)
}

/** Rounds that have already started (deadline passed) — used to grade history. */
export function playedRounds(schedule: GameweekSchedule, now = new Date()): Round[] {
  return schedule.rounds.filter((r) => new Date(r.deadline).getTime() <= now.getTime())
}
