# ⚽ Last Man Standing — Premier League Predictor

A modern, mobile-first web app for running a **Last Man Standing** (Survivor)
Premier League pool. Replaces the spreadsheet: players pick a team each gameweek,
only a **win** keeps them alive, and the last player standing wins.

- **Free to host** — static site on **GitHub Pages**, data in a **Google Sheet**.
- **No accounts** — players pick their name from a dropdown and confirm with a
  **2-digit PIN**.
- **Automatic fixtures & results** — pulled live from ESPN's public API. Nobody
  enters scores; standings settle themselves.

## The rules

| | |
| --- | --- |
| Each round | Pick **one** team from that week's fixtures |
| Safe | **Only a win.** A draw or loss (or no pick) **costs a life** |
| Lives | **3** — lose all three and you're out |
| Teams | **Can't be re-used** — your options shrink every week |

## How it works

```
Build time (Node)
  └─ official gameweek schedule ──▶ Fantasy Premier League API ──▶ gameweeks.json

Browser (GitHub Pages, React)
  ├─ fixtures + live results ──▶ ESPN public API (open CORS, no key)
  └─ players + picks ──▶ Google Apps Script Web App ──▶ Google Sheet
Standings (lives, eliminations) are computed in the browser from picks × results.
```

Two football data sources, each where it's strongest: the **FPL API** tags every
fixture with its official gameweek, so it defines the rounds (used at build time —
it has no CORS for browsers); **ESPN** has open CORS, so the app pulls live
fixtures & scores straight from the browser. They're cross-checked and agree on
every gameweek. Because rounds come from official gameweeks, **double gameweeks**
are grouped correctly — and only a team's *first* match in a round counts.

## Quick start

```bash
npm install
npm run dev      # runs in demo mode until you connect a sheet
```

To go live (Google Sheet + GitHub Pages), follow **[docs/SETUP.md](docs/SETUP.md)**.

## Project layout

| Path | What |
| --- | --- |
| `src/lib/espn.ts` | Fetch & grade fixtures/results from ESPN |
| `src/lib/game.ts` | Rules engine — remaining teams, lives, eliminations |
| `src/lib/sheet.ts` | Read/write players & picks (Sheet or localStorage mock) |
| `src/pages/` | Dashboard · Make Pick · Standings |
| `apps-script/Code.gs` | Google Sheet backend (paste into Apps Script) |
| `scripts/build-gameweeks.mjs` | Generate the round schedule from the FPL API (ESPN fallback) |
| `public/data/gameweeks.json` | Round → date-window schedule (official gameweeks) |

## Scripts

- `npm run dev` — local dev server (proxies ESPN)
- `npm run build` — production build to `dist/`
- `npm run gameweeks` — regenerate the round schedule from ESPN (new season)
