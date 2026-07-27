/**
 * Team helpers.
 *
 * The 20 Premier League teams change every season, so we do NOT hardcode them.
 * The canonical list is loaded from ESPN at runtime (see espn.ts `loadTeams`).
 * This module only holds the shared `Team` type plus name-normalisation used to
 * match a pick stored in the sheet back to an ESPN team.
 */

export interface Team {
  /** ESPN numeric id, e.g. "359" for Arsenal. Stable within a season. */
  id: string
  /** ESPN abbreviation, e.g. "ARS". */
  abbr: string
  /** Human short name we store in the sheet, e.g. "Arsenal", "Man City". */
  name: string
  /** Full display name, e.g. "Arsenal", "Manchester City". */
  fullName: string
  /** Crest image URL. */
  crest: string
}

/**
 * Normalise a team name for loose comparison: lowercase, strip punctuation and
 * common filler words ("afc", "fc", "united", "city", "&", "hove albion"...).
 * Lets a sheet value like "Man Utd" match ESPN's "Man United" / "Manchester United".
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(afc|fc|cf)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Hand-written aliases for the awkward ones (short pool name -> ESPN-ish). */
const ALIASES: Record<string, string> = {
  spurs: 'tottenham',
  tottenham: 'tottenham',
  'man utd': 'man united',
  'man u': 'man united',
  'manchester utd': 'man united',
  villa: 'aston villa',
  palace: 'crystal palace',
  'c palace': 'crystal palace',
  forest: 'nottingham forest',
  'nottm forest': 'nottingham forest',
  wolves: 'wolverhampton',
  brighton: 'brighton',
  bournemouth: 'bournemouth',
  newcastle: 'newcastle',
  leeds: 'leeds',
}

/** A stripped, alias-resolved key used for matching. */
export function matchKey(name: string): string {
  const n = normalizeName(name)
  const aliased = ALIASES[n] ?? name
  return normalizeName(aliased)
    // drop trailing generic words so "manchester united" ~ "man united"
    .replace(/\b(united|city|town|albion|hove|wanderers|hotspur|and)\b/g, '')
    .replace(/\bmanchester\b/g, 'man')
    .replace(/\bwolverhampton\b/g, 'wolves')
    .replace(/\bnottingham\b/g, 'nottm')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Find a team from a stored pick string. Returns undefined if not matched. */
export function findTeam(teams: Team[], pick: string | undefined | null): Team | undefined {
  if (!pick) return undefined
  const key = matchKey(pick)
  return (
    teams.find((t) => t.name.toLowerCase() === pick.toLowerCase()) ??
    teams.find((t) => t.abbr.toLowerCase() === pick.toLowerCase()) ??
    teams.find((t) => matchKey(t.name) === key || matchKey(t.fullName) === key)
  )
}
