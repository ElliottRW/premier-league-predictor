# Setup guide

Getting Last Man Standing live has three one-time steps:

1. **Google Sheet + backend** — where picks are stored (needs your Google login)
2. **Connect the app** — paste the backend URL into a config value
3. **Deploy to GitHub Pages** — free hosting (needs your GitHub account)

Until step 2 is done the app runs in **demo mode** (fake players, data saved only
in your browser) so you can click around first. `npm run dev` and open it.

---

## Step 1 · Google Sheet + Apps Script backend

### 1a. The sheet

Use your existing spreadsheet or make a new one. It needs a tab named **`Picks`**
with this header row (row 1):

| Name | Paid? | PIN | GW1 | GW2 | … | GW38 |
| ---- | ----- | --- | --- | --- | - | ---- |

- **Name** — the player's name (this is what shows in the dropdown).
- **Paid?** — `Y`/`N` (optional, just tracked).
- **PIN** — each player's **2-digit** PIN. You set these and tell each player
  theirs. It stops people picking as the wrong person.
- **GW1…GW38** — leave blank; the app fills these in as people pick. (You can add
  just GW1–GW10 to start and add more columns later.)

Add one row per player.

### 1b. The Apps Script

1. In the sheet: **Extensions ▸ Apps Script**.
2. Delete the placeholder code, paste the entire contents of
   [`apps-script/Code.gs`](../apps-script/Code.gs), and **Save**.
3. **Deploy ▸ New deployment**. Click the gear ▸ **Web app**. Set:
   - **Execute as:** _Me_
   - **Who has access:** _Anyone_
4. **Deploy**, authorise when prompted, and copy the **Web app URL**
   (it ends in `/exec`).

**Test it:** open `<your /exec URL>?action=players` in a browser — you should see
JSON with your players (and **no PINs** — those never leave the sheet).

---

## Step 2 · Connect the app to your sheet

Put the `/exec` URL into `VITE_SHEET_URL`.

**For local development** — create a file named `.env` in the project root:

```
VITE_SHEET_URL=https://script.google.com/macros/s/AKfy..../exec
```

**For the live site** — in your GitHub repo go to **Settings ▸ Secrets and
variables ▸ Actions ▸ Variables ▸ New repository variable**:

- Name: `VITE_SHEET_URL`
- Value: your `/exec` URL

(If you skip this, the deployed site just runs in demo mode.)

---

## Step 3 · Deploy to GitHub Pages

1. Create a GitHub repo and push this project to the `main` branch:
   ```bash
   git init && git add . && git commit -m "Last Man Standing"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In the repo: **Settings ▸ Pages ▸ Build and deployment ▸ Source: GitHub Actions**.
3. That's it — the included workflow ([deploy.yml](../.github/workflows/deploy.yml))
   builds and publishes on every push. Your site appears at
   `https://<you>.github.io/<repo>/`.

---

## Running locally

```bash
npm install
npm run dev
```

Then open the printed URL. The dev server proxies ESPN so it works behind any
browser network restrictions.

---

## Running the pool

- **Fixtures & results are automatic.** They come live from ESPN — you never
  enter scores. The standings (lives, who's out) update themselves as games
  finish.
- **Add a player mid-season:** add a row (Name + PIN) in the sheet. They appear
  in the dropdown next refresh.
- **Fix a pick:** edit the cell directly in the sheet, or the player can re-pick
  any time before the deadline.
- **Deadlines:** picks lock at **12:00 UK on the day of the round's first match —
  or the Friday before, if that match is on a weekend** (office pool: no weekend
  picking). Before the deadline every pick is hidden (shown as “Picked ✓” / a
  padlock); **the moment the deadline passes, everyone's team is revealed**, with
  results filling in as games are played.

## Admin screen (add/remove players, see picks & timestamps)

There's a password-protected Admin screen — the **⚙️ icon** in the app header.

To enable it:

1. In `apps-script/Code.gs`, set `ADMIN_PASSWORD` to a private password.
2. **Re-deploy** the web app (Manage deployments ▸ edit ▸ New version — keeps the
   same URL). Reminder: editing `Code.gs` only takes effect once you re-deploy.

Then click ⚙️, enter the password, and you can:

- **Add a player** (name + 2-digit PIN) or **remove one** — writes straight to the
  `Picks` tab.
- See **every player's picks**, their PINs, and **when each pick was submitted**.

Every pick is timestamped to an auto-created **`Log`** tab in your sheet, so you
also have a full audit trail (including changes) right in the spreadsheet.

## Keeping fixtures up to date

The round schedule lives in [`public/data/gameweeks.json`](../public/data/gameweeks.json).
It's generated from the **official Fantasy Premier League API**, which tags every
fixture with its real gameweek number — so rounds match the actual Premier League
gameweeks, double gameweeks are grouped correctly, and reschedules are followed.
(ESPN is used as an automatic fallback if FPL is ever unreachable.)

Regenerate it any time — new season, or after fixtures move:

```bash
npm run gameweeks
```

The included [refresh-fixtures](../.github/workflows/refresh-fixtures.yml) workflow
runs this **automatically every day** and commits any changes, so the schedule
stays current and each finished round's results get cached (for fast loading)
without you doing anything. (Live scores are separate — the app reads those from
ESPN in real time, so in-progress results are always up to the minute.)

---

## The rules the app enforces

- Pick **one** team per round from that round's fixtures.
- **Only a win is safe** — a **draw or loss costs a life**. A missed pick also
  costs a life.
- **3 lives.** Lose all three and you're eliminated.
- **No team twice** — once you've picked a team it's gone for the season, so your
  options shrink each week.

## Troubleshooting

- **App shows “demo data”** → `VITE_SHEET_URL` isn't set (locally: `.env`; live:
  repo variable), or you didn't rebuild after setting it.
- **“Incorrect PIN”** → the PIN column value doesn't match. PINs are compared as
  text; make sure the sheet cell isn't reformatting `01` into `1`
  (format the PIN column as **Plain text**).
- **“Player not found”** → the name in the dropdown must match the sheet's Name
  cell exactly.
- **Picks not saving** → confirm the Apps Script deployment access is **Anyone**
  and you copied the `/exec` (not `/dev`) URL.
