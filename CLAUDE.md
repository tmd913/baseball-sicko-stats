# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # installs root + both workspaces
npm run dev          # dev: API on :4000 + client on :5173 (Vite proxies /api → :4000)
npm run build        # builds client (tsc -b + vite), then compiles server (tsc)
npm start            # prod: server serves API + built client on :4000
npm run docs         # serve docs/ (MLB Stats API references) on :4001
```

Per-workspace: `npm run dev --workspace server` (tsx watch), `npm run dev --workspace client` (vite).

There is **no test runner and no linter** configured. "Verifying" a change means running `npm run build` (typecheck via `tsc`) and exercising the flow in the running app.

## Architecture

Two npm workspaces — `server/` (Express 5 + TypeScript, ESM, run via `tsx`) and `client/` (React 19 + Vite). The client talks to the server through a single typed `fetch` layer (`client/src/api.ts`). `client/src/types.ts` mirrors `server/src/types.ts` by hand — **keep them in sync when changing the data model.**

### Data sources — MLB Stats API is primary (README is out of date here)

The README describes Baseball Savant CSV as the primary source. **The code has since inverted this:**

- **MLB Stats API** (`server/src/mlbStats.ts`) is now the primary source. `getStatsApiGame(gamePk)` pulls the `feed/live` play-by-play and builds the full nested model — plate appearances, pitches, official scoring (runs, RBI, SB, CS), and hit data (exit velo, launch angle, distance).
- **Baseball Savant CSV** (`server/src/savant.ts`, `savantUrl`) is now **enrichment only** — it supplies the handful of Statcast fields with no Stats API equivalent: `batSpeed`, `swingLength`, `xba`/`xwoba` (expected BA/wOBA), and `deltaRunExp` (per-PA run value → `runValue`). If the CSV fetch fails, the report still renders; those fields are just null.

`savant.ts::getDay(date)` orchestrates both: build the Stats API day, then merge CSV enrichment keyed by `batterId|gamePk|atBatNumber` (and `|pitchNumber` for pitches). `getReport(start, end, watchlist)` fans `getDay` across an inclusive date range and merges each player's games chronologically.

### Report join keys

- Stats API at-bats ↔ Savant CSV rows: `at_bat_number == atBatIndex + 1`.
- Players are matched by MLB id, with a **fallback to `savantName`** (`toSavantName` in `names.ts` converts "First Last" → "Last, First") if the id isn't present that day.

### Caching (multiple layers, all in `server/data/`, gitignored)

- `cache/{date}.csv` — Savant CSV, downloaded once per date, kept forever (delete to refresh).
- Stats API responses cached to `cache/` on disk **and** in-memory.
- **Live-game freshness:** a game for the current day is re-fetched via `diffPatch` deltas at most once per `LIVE_GAME_TTL` (10s); the parsed day is memoized with a `TODAY_TTL` (10min). Past dates are treated as immutable.
- `getSeasonPlayers` (roster for the add-player search) cached with a 1h TTL.
- `watchlist.json` (in `server/data/`, **not** under `cache/`) persists the watchlist via `store.ts`.

### Date handling

"Previous day" is computed in **America/New_York** (games end after midnight ET), not UTC. `server/src/index.ts::previousDay()` and `client/src/App.tsx::previousDay()` **must agree** — the server default and client default both rely on ET. `/api/report` accepts `start`/`end` (or legacy `date`), swaps if reversed, and caps the span at `MAX_RANGE_DAYS` (62).

### Server routing notes

- All async routes are wrapped in `asyncRoute()`, which catches and returns `502 { error }`. The client's `api.ts` unwraps that `error` field into thrown `Error`s.
- Express 5 (path-to-regexp v8) rejects a bare `'*'` route — the SPA fallback is path-less middleware that serves `client/dist/index.html` for non-`/api` GETs.
- **Video** (`/api/video/:playId`) is resolved lazily: it scrapes Savant's `sporty-videos` page for the direct `sporty-clips.mlb.com/*.mp4` URL only when a clip is opened, then caches it. The clip streams directly to the browser `<video>` (hotlink-protected by User-Agent, which a real browser satisfies) — the server never byte-proxies it.

### Client

`App.tsx` holds all top-level state and persists date range, active preset, and collapsed player-card ids in the **URL query string** (seeded from `window.location.search` on load, synced via `history.replaceState`) — so a reload or shared link restores the same view. There is no `localStorage`. Components: `PlayerCard` (per-player panel + stat pills, collapsible), `PlateAppearanceCard` (one PA: outcome badge + pitch table), `StrikeZone` (SVG pitch-location plot), `PlayerAdder` (roster search). `lib.ts` holds display helpers (labels, colors, formatting).

### Season is hardcoded

Savant queries pin `hfSea=2026` in `savant.ts`. Update this (and check date-default logic) when the season rolls over.
