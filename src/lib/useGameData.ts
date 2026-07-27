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
    now: new Date(),
  })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const now = new Date()
      const [teams, schedule, playersRes, cachedResults] = await Promise.all([
        loadTeams(),
        loadSchedule(),
        fetchPlayers(),
        loadResults(),
      ])

      const current = currentRound(schedule, now) ?? null
      const played = playedRounds(schedule, now)

      // Rounds we need fixtures for: everything played + the current round.
      const needed = new Map<number, Round>()
      for (const r of played) needed.set(r.round, r)
      if (current) needed.set(current.round, current)

      // Seed from the static results cache (finished rounds) — fast, no network.
      // Then fetch from ESPN only for rounds not cached, plus always the current
      // round (which may be in progress and needs live scores).
      const roundFixtures = new Map<number, Fixture[]>(cachedResults)
      await Promise.all(
        [...needed.values()].map(async (r) => {
          const isCurrent = current?.round === r.round
          if (!isCurrent && roundFixtures.has(r.round)) return // cached, skip network
          try {
            roundFixtures.set(r.round, await fixturesForRound(r))
          } catch {
            if (!roundFixtures.has(r.round)) roundFixtures.set(r.round, [])
          }
        }),
      )

      const playedNums = played.map((r) => r.round)
      const standings = playersRes.players
        .map((p) => computeStanding(p, teams, roundFixtures, playedNums, playersRes.lives))
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
