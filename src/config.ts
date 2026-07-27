/**
 * App configuration.
 *
 * SHEET_URL  – the Google Apps Script Web App URL (see docs/SETUP.md).
 *              Leave empty to run in MOCK mode (data stored in the browser's
 *              localStorage) so the whole app works before Google is wired up.
 *
 * You can also set it at build time with an env var: VITE_SHEET_URL=...
 */
export const SHEET_URL: string =
  (import.meta.env.VITE_SHEET_URL as string | undefined) ?? ''

/** Number of lives every player starts with. */
export const LIVES = 3

/** ESPN league slug for the English Premier League. */
export const ESPN_LEAGUE = 'eng.1'

/** When true (no SHEET_URL configured), reads/writes go to localStorage. */
export const MOCK_MODE = SHEET_URL.trim() === ''
