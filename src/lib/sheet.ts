/**
 * Player + pick storage.
 *
 * Real mode  -> Google Sheet via an Apps Script Web App (see apps-script/Code.gs).
 * Mock  mode -> browser localStorage, so the whole app is usable before Google
 *               is wired up (config.MOCK_MODE, i.e. no SHEET_URL set).
 *
 * The `gw` key format is "GW1", "GW2", ... matching the spreadsheet columns.
 */
import { SHEET_URL, MOCK_MODE, LIVES } from '../config'

// In dev, route the Apps Script backend through Vite's proxy (see
// vite.config.ts) to sidestep browser network sandboxes; in production, call it
// directly (Apps Script returns open CORS headers).
const SHEET_BASE = import.meta.env.DEV
  ? SHEET_URL.replace(/^https:\/\/script\.google\.com/, '/sheet')
  : SHEET_URL

export interface Player {
  name: string
  paid: boolean
  /** { "GW1": "Arsenal", "GW2": "Chelsea", ... } — value is the team short name. */
  picks: Record<string, string>
}

export interface PlayersResponse {
  players: Player[]
  lives: number
  /** Gameweek numbers voided by the admin (last-minute fixture change). */
  voided: number[]
}

export function gwKey(round: number): string {
  return `GW${round}`
}

/* ------------------------------------------------------------------ *
 * Real backend (Apps Script)
 * ------------------------------------------------------------------ */

async function realFetchPlayers(): Promise<PlayersResponse> {
  const res = await fetch(`${SHEET_BASE}?action=players&t=${Date.now()}`)
  if (!res.ok) throw new Error(`Sheet read ${res.status}`)
  const data = await res.json()
  return { players: data.players ?? [], lives: data.lives ?? LIVES, voided: data.voided ?? [] }
}

async function realSubmitPick(name: string, pin: string, round: number, team: string) {
  // text/plain avoids the CORS preflight that Apps Script can't answer.
  const res = await fetch(SHEET_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'pick', name, pin, gw: gwKey(round), team }),
  })
  if (!res.ok) throw new Error(`Sheet write ${res.status}`)
  return (await res.json()) as { ok: boolean; error?: string }
}

async function realVerify(name: string, pin: string) {
  const res = await fetch(SHEET_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'verify', name, pin }),
  })
  if (!res.ok) throw new Error(`Verify ${res.status}`)
  return (await res.json()) as { ok: boolean; error?: string }
}

/* ------------------------------------------------------------------ *
 * Mock backend (localStorage)
 * ------------------------------------------------------------------ */

const MOCK_KEY = 'lms.mock.v1'

interface MockStore {
  players: (Player & { pin: string })[]
  voided?: number[]
}

function seed(): MockStore {
  const mk = (name: string, pin: string, picks: Record<string, string> = {}): Player & { pin: string } => ({
    name,
    pin,
    paid: true,
    picks,
  })
  return {
    players: [
      mk('Sear Sadat', '11', { GW1: 'Arsenal', GW2: 'Man City' }),
      mk('Nick Nathan', '22', { GW1: 'Chelsea', GW2: 'Man City' }),
      mk('Adam Esposito', '33', { GW1: 'Arsenal' }),
      mk('Curtis Astbury', '44', { GW1: 'Chelsea', GW2: 'Aston Villa' }),
      mk('Brad Vaile', '55', { GW1: 'Leeds' }),
      mk('Ian Burrell', '99'),
      mk('Elliott Wilson', '00'),
    ],
  }
}

function readMock(): MockStore {
  try {
    const raw = localStorage.getItem(MOCK_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  const s = seed()
  localStorage.setItem(MOCK_KEY, JSON.stringify(s))
  return s
}

function writeMock(s: MockStore) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(s))
}

async function mockFetchPlayers(): Promise<PlayersResponse> {
  const s = readMock()
  return {
    lives: LIVES,
    players: s.players.map(({ pin: _pin, ...p }) => p), // never expose PINs
    voided: s.voided ?? [],
  }
}

async function mockSubmitPick(name: string, pin: string, round: number, team: string) {
  const s = readMock()
  const p = s.players.find((x) => x.name === name)
  if (!p) return { ok: false, error: 'Player not found' }
  if (p.pin !== pin) return { ok: false, error: 'Incorrect PIN' }
  p.picks[gwKey(round)] = team
  writeMock(s)
  return { ok: true }
}

async function mockVerify(name: string, pin: string) {
  const p = readMock().players.find((x) => x.name === name)
  if (!p) return { ok: false, error: 'Player not found' }
  if (p.pin !== pin) return { ok: false, error: 'Incorrect PIN' }
  return { ok: true }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function fetchPlayers(): Promise<PlayersResponse> {
  return MOCK_MODE ? mockFetchPlayers() : realFetchPlayers()
}

export function submitPick(name: string, pin: string, round: number, team: string) {
  return MOCK_MODE ? mockSubmitPick(name, pin, round, team) : realSubmitPick(name, pin, round, team)
}

/** Confirm name + PIN before revealing that player's picks. */
export function verifyPin(name: string, pin: string) {
  return MOCK_MODE ? mockVerify(name, pin) : realVerify(name, pin)
}

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

export interface AdminPlayer {
  name: string
  pin: string
  paid: boolean
  picks: Record<string, string>
  /** { "GW1": ISO string } — when each pick was last submitted (from the Log). */
  times: Record<string, string>
}

export interface AdminDataResponse {
  ok: boolean
  error?: string
  players: AdminPlayer[]
  lives: number
  voided: number[]
}

type AdminResult = { ok: boolean; error?: string }

async function realAdmin(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(SHEET_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'admin', ...payload }),
  })
  if (!res.ok) throw new Error(`Admin ${res.status}`)
  return res.json()
}

// Mock admin password for local/demo use.
const MOCK_ADMIN_PASS = 'admin'

async function mockAdmin(payload: Record<string, any>): Promise<any> {
  if (payload.pass !== MOCK_ADMIN_PASS) return { ok: false, error: 'Wrong password' }
  const s = readMock()
  if (payload.sub === 'data') {
    return {
      ok: true,
      lives: LIVES,
      voided: s.voided ?? [],
      players: s.players.map((p) => ({
        name: p.name,
        pin: p.pin,
        paid: p.paid,
        picks: p.picks,
        times: {},
      })),
    }
  }
  if (payload.sub === 'setVoid') {
    const gw = Number(payload.gw)
    if (!gw) return { ok: false, error: 'Bad gameweek' }
    const list = new Set(s.voided ?? [])
    if (payload.void) list.add(gw)
    else list.delete(gw)
    s.voided = [...list].sort((a, b) => a - b)
    writeMock(s)
    return { ok: true, voided: s.voided }
  }
  if (payload.sub === 'add') {
    const name = String(payload.name || '').trim()
    if (!name) return { ok: false, error: 'Name required' }
    if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return { ok: false, error: 'Player already exists' }
    s.players.push({ name, pin: String(payload.pin || ''), paid: false, picks: {} })
    writeMock(s)
    return { ok: true }
  }
  if (payload.sub === 'remove') {
    const i = s.players.findIndex(
      (p) => p.name.toLowerCase() === String(payload.name || '').toLowerCase(),
    )
    if (i < 0) return { ok: false, error: 'Player not found' }
    s.players.splice(i, 1)
    writeMock(s)
    return { ok: true }
  }
  if (payload.sub === 'setPaid') {
    const p = s.players.find(
      (x) => x.name.toLowerCase() === String(payload.name || '').toLowerCase(),
    )
    if (!p) return { ok: false, error: 'Player not found' }
    p.paid = Boolean(payload.paid)
    writeMock(s)
    return { ok: true }
  }
  return { ok: false, error: 'Unknown admin action' }
}

const admin = (payload: Record<string, unknown>) =>
  MOCK_MODE ? mockAdmin(payload) : realAdmin(payload)

export function adminData(pass: string): Promise<AdminDataResponse> {
  return admin({ sub: 'data', pass })
}
export function adminAddPlayer(pass: string, name: string, pin: string): Promise<AdminResult> {
  return admin({ sub: 'add', pass, name, pin })
}
export function adminRemovePlayer(pass: string, name: string): Promise<AdminResult> {
  return admin({ sub: 'remove', pass, name })
}
export function adminSetPaid(pass: string, name: string, paid: boolean): Promise<AdminResult> {
  return admin({ sub: 'setPaid', pass, name, paid })
}
export function adminSetVoid(
  pass: string,
  gw: number,
  isVoid: boolean,
): Promise<AdminResult & { voided?: number[] }> {
  return admin({ sub: 'setVoid', pass, gw, void: isVoid })
}

/** Wipe mock data (dev helper, exposed on window in App). */
export function resetMock() {
  if (MOCK_MODE) localStorage.removeItem(MOCK_KEY)
}
