/**
 * The rules engine.
 *
 * Rules: each round pick ONE team. Only a WIN is safe — a draw or loss costs a
 * life. A missed pick (no selection by the deadline) also costs a life. You have
 * `lives` lives (default 3); at 0 you're eliminated. A team can never be re-used.
 */
import type { Player } from './sheet'
import { gwKey } from './sheet'
import type { Team } from './teams'
import { findTeam } from './teams'
import type { Fixture, Outcome } from './espn'
import { fixtureForTeam, outcomeFor } from './espn'

// 'void' = the picked team had no game that round (fixture postponed / blank
// gameweek). Treated as safe (no life lost) — you can't lose on a game that
// wasn't played. 'pending' = result/ fixtures not in yet.
export type Grade = Outcome | 'missed' | 'void' | 'out'

export interface PickResult {
  round: number
  pickRaw: string | null
  team?: Team
  fixture?: Fixture
  grade: Grade
}

export interface Standing {
  player: Player
  results: PickResult[]
  livesLost: number
  livesLeft: number
  out: boolean
  eliminatedRound?: number
}

/** Teams this player has already used (any round). */
export function usedTeams(player: Player, teams: Team[]): Team[] {
  const out: Team[] = []
  const seen = new Set<string>()
  for (const raw of Object.values(player.picks)) {
    const t = findTeam(teams, raw)
    if (t && !seen.has(t.id)) {
      seen.add(t.id)
      out.push(t)
    }
  }
  return out
}

/** Teams still available to this player (not yet used). */
export function remainingTeams(player: Player, teams: Team[]): Team[] {
  const used = new Set(usedTeams(player, teams).map((t) => t.id))
  return teams.filter((t) => !used.has(t.id))
}

/** A draw, loss or missed pick each cost a life. */
function costsLife(g: Grade): boolean {
  return g === 'draw' || g === 'loss' || g === 'missed'
}

/**
 * Grade a player across every round whose deadline has passed.
 * `roundFixtures` maps round number -> that round's fixtures (from ESPN).
 */
export function computeStanding(
  player: Player,
  teams: Team[],
  roundFixtures: Map<number, Fixture[]>,
  playedRoundNums: number[],
  lives: number,
): Standing {
  const results: PickResult[] = []
  let livesLost = 0
  let out = false
  let eliminatedRound: number | undefined

  for (const round of [...playedRoundNums].sort((a, b) => a - b)) {
    const pickRaw = player.picks[gwKey(round)] ?? null
    const team = findTeam(teams, pickRaw) ?? undefined
    const fixtures = roundFixtures.get(round) ?? []
    const fixture = team ? fixtureForTeam(fixtures, team.id) : undefined

    if (out) {
      results.push({ round, pickRaw, team, fixture, grade: 'out' })
      continue
    }

    let grade: Grade
    if (!pickRaw) {
      grade = 'missed'
    } else if (!team) {
      grade = 'pending' // couldn't match the pick name to a team
    } else if (fixture) {
      grade = outcomeFor(fixture, team.id)
    } else if (fixtures.length > 0) {
      grade = 'void' // round loaded but this team has no game — postponed/blank GW
    } else {
      grade = 'pending' // round's fixtures not loaded yet
    }

    if (costsLife(grade)) {
      livesLost += 1
      if (livesLost >= lives) {
        out = true
        eliminatedRound = round
      }
    }
    results.push({ round, pickRaw, team, fixture, grade })
  }

  return {
    player,
    results,
    livesLost,
    livesLeft: Math.max(0, lives - livesLost),
    out,
    eliminatedRound,
  }
}

/** Sort standings: survivors first (most lives), then eliminated (latest out first). */
export function sortStandings(a: Standing, b: Standing): number {
  if (a.out !== b.out) return a.out ? 1 : -1
  if (!a.out && !b.out) {
    if (b.livesLeft !== a.livesLeft) return b.livesLeft - a.livesLeft
    return a.player.name.localeCompare(b.player.name)
  }
  // both out: later elimination ranks higher
  return (b.eliminatedRound ?? 0) - (a.eliminatedRound ?? 0)
}
