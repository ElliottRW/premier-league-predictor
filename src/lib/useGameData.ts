/**
 * Loads everything the app needs and derives standings.
 *  - teams + fixtures/results from ESPN
 *  - round schedule from gameweeks.json
 *  - players + picks from the sheet (or mock)
 */
import { useCallback, useEffect, useState } from 'react'
import type { Team } from './teams'
import type { Fixture } from './espn'
import { fetchFixtures, loadTeams } from './espn'
import type { GameweekSchedule, Round } from './gameweeks'
import { currentRound, loadSchedule, playedRounds } from './gameweeks'
import type { Player } from './sheet'
import { fetchPlayers } from './sheet'
import type { Standing } from './game'
import { computeStanding, sortStandings } from './game'
import { loadResults } from './results'
import { LIVES } from '../config'

const fixtureCache = new Map<string, Fixture[]>()

async function fixturesForRound(r: Round): Promise<Fixture[]> {
  const key = `${r.start}_${r.end}`
  const cached = fixtureCache.get(key)
  if (cached) return cached
  const fx = await fetchFixtures(r.start, r.end)
  fixtureCache.set(key, fx)
  return fx
}

export interface GameData {
  loading: boolean
  error: string | null
  teams: Team[]
  schedule: GameweekSchedule | null
  players: Player[]
  lives: number
  current: Round | null
  currentFixtures: Fixture[]
  roundFixtures: Map<number, Fixture[]>
  standings: Standing[]
  /** Gameweek numbers voided by the admin (last-minute fixture change). */
  voided: number[]
  now: Date
  refresh: () => void
}

export function useGameData(): GameData {
  const [state, setState] = useState<Omit<GameData, 'refresh'>>({
    loading: true,
    error: null,
    teams: [],
    schedule: null,
    players: [],
    lives: LIVES,
    current: null,
    currentFixtures: [],
    roundFixtures: new Map(),
    standings: [],
    voided: [],
    now: new Date(),
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const now = new Date()

      // The Google Sheet (players/picks) call is by far the slowest thing we
      // fetch — kick it off now and let it run alongside everything else
      // instead of gating fixture fetches behind it.
      const playersPromise = fetchPlayers()
      const [teams, schedule, cachedResults] = await Promise.all([
        loadTeams(),
        loadSchedule(),
        loadResults(),
      ])

      const current = currentRound(schedule, now) ?? null
      const played = playedRounds(schedule, now)

      // Seed from the static results cache (every round except the one in
      // progress) — fast, no network.
      const roundFixtures = new Map<number, Fixture[]>(cachedResults)
      const fetchRound = async (r: Round) => {
        const isCurrent = current?.round === r.round
        if (!isCurrent && roundFixtures.has(r.round)) return // cached, skip network
        try {
          roundFixtures.set(r.round, await fixturesForRound(r))
        } catch {
          if (!roundFixtures.has(r.round)) roundFixtures.set(r.round, [])
        }
      }

      // Rounds we need fixtures for regardless of picks: everything played +
      // the current round. These don't depend on player data, so fetch them
      // from ESPN now, in parallel with the still-pending players call.
      const baseNeeded = new Map<number, Round>()
      for (const r of played) baseNeeded.set(r.round, r)
      if (current) baseNeeded.set(current.round, current)
      const baseFixturesPromise = Promise.all([...baseNeeded.values()].map(fetchRound))

      const playersRes = await playersPromise
      await baseFixturesPromise

      // Every round anyone has picked for (so advance picks can be checked
      // against the latest fixtures and flagged if their team stops playing).
      // Only knowable once players have loaded, so this wave runs after.
      const extra = new Map<number, Round>()
      for (const p of playersRes.players) {
        for (const key of Object.keys(p.picks)) {
          const n = Number(key.replace(/\D/g, ''))
          if (baseNeeded.has(n) || roundFixtures.has(n)) continue
          const r = schedule.rounds.find((x) => x.round === n)
          if (r) extra.set(n, r)
        }
      }
      await Promise.all([...extra.values()].map(fetchRound))

      const playedNums = played.map((r) => r.round)
      const voidedSet = new Set(playersRes.voided)
      const standings = playersRes.players
        .map((p) => computeStanding(p, teams, roundFixtures, playedNums, playersRes.lives, voidedSet))
        .sort(sortStandings)

      setState({
        loading: false,
        error: null,
        teams,
        schedule,
        players: playersRes.players,
        lives: playersRes.lives,
        current,
        currentFixtures: current ? (roundFixtures.get(current.round) ?? []) : [],
        roundFixtures,
        standings,
        voided: playersRes.voided,
        now,
      })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load',
      }))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, refresh: load }
}
