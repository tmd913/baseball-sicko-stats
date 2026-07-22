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

A third source: `server/src/percentiles.ts` **scrapes the Savant player page** for the percentile-ranking card, parsing the `serverVals.statcast` blob embedded in the HTML. The `SECTIONS` table maps each displayed row to its `percent_rank_*` (0–100 rank) and raw-value fields; metrics where lower is better carry `lowerBetter` (only used by the estimated-percentile fallback — Savant's own `percent_rank_` fields already bake direction in). Cached on disk; the current season re-scrapes every 6h, past seasons are immutable.

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
- Endpoints: `/api/players` (season roster), `/api/watchlist` (GET/POST/DELETE `:id`, plus `PUT /order` for drag-to-reorder), `/api/report`, `/api/percentiles/:playerId`, `/api/players/:playerId/splits`, `/api/players/:playerId/xwoba`, `/api/video/:playId`. The splits route exists only for the details view of a player who **isn't** watchlisted — the report already carries splits for watchlisted players. The xwoba route (`xwoba.ts`) fetches a batter's full-season Savant statcast-search CSV (`batters_lookup[]`) and returns the per-PA xwOBA sequence for the details view's rolling-xwOBA chart; the client computes the rolling averages. Cached in-memory 6h.
- `store.ts::reorderPlayers` deliberately appends any watchlist players missing from the submitted `ids`, so a stale client can't drop players.
- Express 5 (path-to-regexp v8) rejects a bare `'*'` route — the SPA fallback is path-less middleware that serves `client/dist/index.html` for non-`/api` GETs.
- **Video** (`/api/video/:playId`) is resolved lazily: it scrapes Savant's `sporty-videos` page for the direct `sporty-clips.mlb.com/*.mp4` URL only when a clip is opened, then caches it. The clip streams directly to the browser `<video>` (hotlink-protected by User-Agent, which a real browser satisfies) — the server never byte-proxies it. The **highlight reel** (`GameReel.tsx`, the "Highlights" button on a final game's block) is purely client-side: it resolves each of the player's at-bats' last-play clips via the same `/api/video` route (sequentially, so the first call warms the per-game highlight cache) and plays them back to back in one `<video>`. There is no server-side concatenation.

### Client

`App.tsx` holds all top-level state and persists it in the **URL query string** (seeded from `window.location.search` on load, synced via `history.replaceState`) — so a reload or shared link restores the same view. There is no `localStorage`. Params: date range, active preset, expanded player-card ids, open details player, `view=feed`, `sim=1`.

Three views, toggled in the nav (persisted as `view=players` / `view=feed`; `summary` is the default and omitted from the URL):

- **summary** (`SummaryTable.tsx`, the default, listed first) — a full-page stat table over the range (one row per player: opponent/score, H/AB, R, HR, RBI, SB, OPS, BB, K; aggregate `Total` row pinned at the bottom). The opponent column shows the matchup pre-game, the live score + inning while a game is on, and the final score once it's over — for a representative game picked the same way the nav does (live, then scheduled, then most recent). Hides the search bar, overall-stats chips, and player-nav; the `.app.summary-mode` class turns the app into a fixed-height flex column so only the table scrolls. Headshot and name are separate columns so only the narrow headshot column sticks on horizontal scroll (the name scrolls away, freeing room for stats on a phone); the header/total rows stick on vertical scroll (pure CSS `position: sticky`). In the table, the headshot opens `PlayerDetails` and the name jumps to that player's at-bats on the players view.
- **players** — one `PlayerCard` per watchlisted player (stat pills, collapsible), each containing `PlateAppearanceCard`s (outcome badge + pitch table + `StrikeZone` SVG plot). `PlayerDetails` overlays a tabbed view: percentile card, rolling xwOBA chart (`RollingXwoba.tsx` — a client-computed rolling average over a 50/100/250-PA window, lazily fetched only when its tab opens), and platoon splits. `PlayerAdder` searches the season roster.
- **feed** (`LiveFeed.tsx`) — a chronological "Recent plays" stream across all watched players: completed plate appearances **interleaved with base events** (stolen bases + runs scored, from `PlayerGame.baseEvents`), plus the day's upcoming games. Each at-bat shows its clip directly (`InlineVideoClip`, `preload="none"`, no Watch button). `BaseDiamond` renders runners on base. Base events are captured server-side per runner in `mlbStats.ts` (`StatsApiGame.baseEvents`); a run on the runner's own home run is omitted (the at-bat already shows it).

Expansion state is split by view: the player view uses `expandedIds` (numeric player ids, in the URL); the feed uses `feedOpenKeys` (string keys, **not** persisted). "Collapse all" clears whichever the active view uses. `hooks.ts::useScrollIntoViewOnExpand` handles the closed→open scroll for every collapsible.

**Live polling:** while any *real* game is in progress (`status.state === 'live'`), `App.tsx` re-polls `/api/report` every 20s to track scores, bases, and the nav's at-bat/on-deck/on-base highlights.

**Simulate mode** (`simulate.ts`, the `sim=1` toggle) overlays a synthetic live day onto the fetched reports so the live-only UI can be demoed when nothing is on. It derives values from player ids (never `Math.random`) so the picture is stable across re-renders, never mutates the source reports, and does **not** drive polling. Everything rendered reads `displayReports`; raw `reports` still back polling and reordering.

### Pitchers on the watchlist

The watchlist holds both batters and pitchers, discriminated by `WatchPlayer.kind` / `PlayerReport.kind` (`'batter' | 'pitcher'`). The whole pipeline is written so **batter code paths are untouched**: `PlayerGame` gained one optional field `pitching: PitcherGame | null` (null for batters), and every client component branches on `report.kind === 'pitcher'`.

- **Server**: `getStatsApiGame` builds a `pitchers` map by regrouping the SAME `allPlays` loop on `matchup.pitcher.id` (faced batters + all pitches); the authoritative per-game line comes from the boxscore (`parsePitchingLines`, needs `stats`/`pitching` in `FEED_FIELDS` — bumping `FEED_CACHE_VERSION` re-fetches cached finals). `savant.ts::buildStatsApiDay` assembles the `PitcherGame` (whiff%/CSW%/pitch-mix from the pitches; season/league arsenal filled per-pitcher in `getReport`). New modules: `pitcherArsenal.ts` (per-pitch-type season avg velo/spin/break — note the feed's `breakHorizontal` = `−pfx_x`, `breakVerticalInduced` = `pfx_z`, both ×12 to inches), `pitchLeague.ts` (a curated league-average table). `getPitcherStats` mirrors `getPlayerStats` with `group=[pitching]`. `percentiles.ts` has a `PITCHER_SECTIONS` table + the `statcast-r-pitching-mlb` page; `xwoba.ts` takes a `kind` for xwOBA-**against**. The percentile/xwoba/splits routes take `?type=pitcher`.
- **Client**: `PitcherCard.tsx` (faced-batter result rows + aggregate `StatPill`s + arsenal rows with velo/spin/break vs season & league arrows); `SummaryTable` renders a pitcher sub-table; `LiveFeed` interleaves faced-batter entries + a `'pitching'` live role; `PlayerDetails` gains an `isPitcher` prop.

### Season is hardcoded

The current season is pinned in **four places** that must stay in sync: `hfSea=2026` in `savant.ts`, `CURRENT_SEASON` in `percentiles.ts`, and `SEASON` in both `xwoba.ts` and `pitcherArsenal.ts`. Update all four (and check date-default logic) when the season rolls over.
