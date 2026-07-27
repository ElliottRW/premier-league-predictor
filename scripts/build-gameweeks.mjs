#!/usr/bin/env node
/**
 * Generate public/data/gameweeks.json — the round (gameweek) schedule.
 *
 * PRIMARY source: the official Fantasy Premier League API, which tags every
 * fixture with its official gameweek number (`event`). That's authoritative:
 * it groups double gameweeks under one event and follows reschedules, so our
 * round numbers match the real Premier League gameweeks (and your spreadsheet).
 *
 * FALLBACK: if FPL is unreachable, cluster ESPN fixtures by date gaps instead.
 *
 * FPL can't be called from the browser (no CORS), so we resolve the schedule
 * here at build time; the app fetches live results from ESPN by each round's
 * date window at runtime.
 *
 * Re-run any time (new season, or after reschedules):  npm run gameweeks
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../public/data/gameweeks.json', import.meta.url))
const TEAMS_OUT = fileURLToPath(new URL('../public/data/teams.json', import.meta.url))
const RESULTS_OUT = fileURLToPath(new URL('../public/data/results.json', import.meta.url))
const UA = 'Mozilla/5.0 (compatible; LastManStanding/1.0; +github-pages)'

const dayKey = (iso) => iso.slice(0, 10)
const seasonLabel = (year) => `${year}-${String((year + 1) % 100).padStart(2, '0')}`

// How many ms a time zone is ahead of UTC at a given instant.
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = dtf.formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {})
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour === '24' ? 0 : p.hour, p.minute, p.second)
  return asUTC - date.getTime()
}

// 12:00 UK time on a given calendar date (handles BST/GMT), as a UTC epoch ms.
function noonLondonMs(y, m, d) {
  const guess = Date.UTC(y, m - 1, d, 12, 0, 0)
  return guess - tzOffsetMs(new Date(guess), 'Europe/London') // 12:00 BST -> 11:00Z
}

// The picks deadline for a round. It's an office pool, so nobody can pick over
// the weekend: if the round's first match is on a Sat/Sun, the deadline is the
// FRIDAY of that week at 12:00 UK; otherwise it's 12:00 UK on the first match's
// day. Never later than the first kickoff (safety net). Handles BST/GMT.
function deadlineFor(firstKickoffISO) {
  const [y, m, d] = dayKey(firstKickoffISO).split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=Sun .. 6=Sat
  let deadlineDayMs = Date.UTC(y, m - 1, d)
  if (dow === 6) deadlineDayMs -= 1 * 86400000 // Saturday -> Friday
  else if (dow === 0) deadlineDayMs -= 2 * 86400000 // Sunday -> Friday
  // Friday and midweek (Mon–Thu) rounds keep their own day.
  const dd = new Date(deadlineDayMs)
  const noon = noonLondonMs(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate())
  return new Date(Math.min(noon, new Date(firstKickoffISO).getTime())).toISOString()
}

/* ----------------------------- FPL (primary) ----------------------------- */

async function buildFromFPL() {
  const res = await fetch('https://fantasy.premierleague.com/api/fixtures/', {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`FPL ${res.status}`)
  const fixtures = await res.json()

  // Group by official gameweek (event); skip any not yet assigned a GW.
  const byEvent = new Map()
  for (const f of fixtures) {
    if (!f.event || !f.kickoff_time) continue
    if (!byEvent.has(f.event)) byEvent.set(f.event, [])
    byEvent.get(f.event).push(f.kickoff_time)
  }
  if (byEvent.size === 0) throw new Error('FPL returned no scheduled fixtures')

  const rounds = [...byEvent.keys()]
    .sort((a, b) => a - b)
    .map((event) => {
      const kickoffs = byEvent.get(event).sort()
      return {
        round: event,
        start: dayKey(kickoffs[0]),
        end: dayKey(kickoffs[kickoffs.length - 1]),
        deadline: deadlineFor(kickoffs[0]), // noon UK (Fri if weekend opener)
        fixtureCount: kickoffs.length,
      }
    })

  const year = new Date(rounds[0].deadline).getUTCFullYear()
  return { source: 'fpl', season: seasonLabel(year), rounds }
}

/* --------------------------- ESPN (fallback) ----------------------------- */

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1'
const yyyymmdd = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`

async function buildFromESPN() {
  const now = await (await fetch(`${ESPN}/scoreboard`)).json()
  const seasonYear = now?.season?.year ?? new Date().getUTCFullYear()
  const from = new Date(Date.UTC(seasonYear, 6, 1))
  const to = new Date(Date.UTC(seasonYear + 1, 5, 30))

  const byId = new Map()
  const cursor = new Date(from)
  while (cursor <= to) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 27)
    const end = chunkEnd > to ? to : chunkEnd
    const url = `${ESPN}/scoreboard?dates=${yyyymmdd(cursor)}-${yyyymmdd(end)}&limit=500`
    const data = await (await fetch(url)).json()
    for (const e of data.events ?? []) byId.set(String(e.id), e)
    cursor.setUTCDate(cursor.getUTCDate() + 28)
  }

  const fixtures = [...byId.values()]
    .map((e) => e.date)
    .sort()
  if (fixtures.length === 0) throw new Error('ESPN returned no fixtures')

  const rounds = []
  let cur = null
  let lastDay = null
  for (const date of fixtures) {
    const day = dayKey(date)
    const gap = lastDay ? (new Date(day) - new Date(lastDay)) / 86400000 : 0
    if (!cur || gap > 2) {
      cur = []
      rounds.push(cur)
    }
    cur.push(date)
    lastDay = day
  }

  return {
    source: 'espn',
    season: seasonLabel(seasonYear),
    rounds: rounds.map((dates, i) => ({
      round: i + 1,
      start: dayKey(dates[0]),
      end: dayKey(dates[dates.length - 1]),
      deadline: deadlineFor(dates[0]),
      fixtureCount: dates.length,
    })),
  }
}

/* ------------------------------- Teams ----------------------------------- */

// ESPN's /teams endpoint has no CORS headers, so the browser can't call it.
// We fetch it here (Node, no CORS) and write teams.json for the app to load
// same-origin. Crest images are <img> tags, which aren't subject to CORS.
async function buildTeams() {
  const res = await fetch(`${ESPN}/teams`)
  if (!res.ok) throw new Error(`ESPN /teams ${res.status}`)
  const data = await res.json()
  const raw = data.sports?.[0]?.leagues?.[0]?.teams ?? []
  const teams = raw
    .map((x) => x.team)
    .filter(Boolean)
    .map((t) => ({
      id: String(t.id),
      abbr: t.abbreviation ?? '',
      name: t.shortDisplayName ?? t.displayName ?? '',
      fullName: t.displayName ?? t.name ?? '',
      crest: (t.logos ?? [])[0]?.href || `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return teams
}

/* ------------------------------ Results ---------------------------------- */

// Cache the fixtures + final scores of FINISHED rounds into results.json, so the
// app loads old results from one static file instead of hitting ESPN once per
// past round on every page load. Shape matches the app's Fixture type (espn.ts),
// so the runtime can use it as-is. Live/in-progress rounds are still read from
// ESPN in the browser.
const yyyymmddStr = (d) => d.replaceAll('-', '')

function mapEvent(e) {
  const comp = e.competitions?.[0]
  if (!comp) return null
  const cs = comp.competitors ?? []
  const home = cs.find((c) => c.homeAway === 'home')
  const away = cs.find((c) => c.homeAway === 'away')
  if (!home || !away) return null
  const st = e.status?.type ?? {}
  const side = (c) => {
    const t = c.team ?? {}
    const score = c.score === undefined || c.score === '' ? null : Number(c.score)
    return {
      teamId: String(t.id ?? ''),
      name: t.shortDisplayName ?? t.displayName ?? '',
      fullName: t.displayName ?? t.name ?? '',
      abbr: t.abbreviation ?? '',
      crest: t.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${t.id}.png`,
      score: Number.isNaN(score) ? null : score,
    }
  }
  return {
    id: String(e.id),
    date: e.date,
    state: st.state ?? 'pre',
    completed: Boolean(st.completed),
    statusText: st.shortDetail ?? st.detail ?? st.description ?? '',
    home: side(home),
    away: side(away),
  }
}

async function fetchRoundFixtures(round) {
  const url = `${ESPN}/scoreboard?dates=${yyyymmddStr(round.start)}-${yyyymmddStr(round.end)}&limit=200`
  const data = await (await fetch(url)).json()
  return (data.events ?? [])
    .map(mapEvent)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function buildResults(schedule) {
  const now = Date.now()
  const rounds = {}
  for (const r of schedule.rounds) {
    // Only rounds whose window has fully passed are candidates for the cache.
    if (new Date(`${r.end}T23:59:59Z`).getTime() > now) continue
    try {
      const fx = await fetchRoundFixtures(r)
      // Store only fully-finalised rounds; anything unfinished stays live.
      if (fx.length && fx.every((f) => f.completed)) rounds[r.round] = fx
    } catch {
      /* skip this round; the app will fall back to live ESPN */
    }
  }
  return { generatedAt: new Date().toISOString(), rounds }
}

/* -------------------------------- main ----------------------------------- */

async function main() {
  let schedule
  try {
    process.stdout.write('  fetching official gameweeks from FPL…\n')
    schedule = await buildFromFPL()
  } catch (err) {
    console.warn(`  ! FPL unavailable (${err.message}) — falling back to ESPN clustering`)
    schedule = await buildFromESPN()
  }
  schedule.generatedAt = new Date().toISOString()

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(schedule, null, 2) + '\n')

  // Teams (for the pick grid + mapping picks to fixtures).
  const teams = await buildTeams()
  await writeFile(
    TEAMS_OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: teams.length, teams }, null, 2) + '\n',
  )
  console.log(`✓ ${teams.length} teams → ${TEAMS_OUT}`)
  if (teams.length !== 20) console.warn(`  ! expected 20 teams, got ${teams.length}`)

  // Cached results of finished rounds (speeds up load; empty pre-season).
  const results = await buildResults(schedule)
  await writeFile(RESULTS_OUT, JSON.stringify(results) + '\n')
  console.log(`✓ ${Object.keys(results.rounds).length} finished rounds cached → ${RESULTS_OUT}`)

  const dgw = schedule.rounds.filter((r) => r.fixtureCount > 10)
  console.log(
    `✓ ${schedule.rounds.length} rounds · season ${schedule.season} · source: ${schedule.source}`,
  )
  console.log(
    `  R1 ${schedule.rounds[0].start} (${schedule.rounds[0].fixtureCount} games) … ` +
      `R${schedule.rounds.length} ${schedule.rounds.at(-1).start}`,
  )
  if (dgw.length) {
    console.log(
      `  double gameweeks detected: ${dgw.map((r) => `GW${r.round} (${r.fixtureCount})`).join(', ')}`,
    )
  }
  console.log(`  → ${OUT}`)
}

main().catch((err) => {
  console.error('\n✗', err.message)
  process.exit(1)
})
