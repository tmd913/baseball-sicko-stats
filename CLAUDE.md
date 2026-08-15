# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # installs root + all three workspaces
npm run dev          # dev: API on :4000 + client on :5173 (Vite proxies /api → :4000)
npm run build        # builds client (tsc -b + vite), then compiles server (tsc)
npm start            # prod: server serves API + built client on :4000
npm run docs         # serve docs/ (MLB Stats API references) on :4001
npm run deploy       # build, then cdk deploy (see docs/claude/deployment.md)
npm run cdk -- diff  # any cdk subcommand, run in infra/
```

Per-workspace: `npm run dev --workspace server` (tsx watch), `npm run dev --workspace client` (vite).

There is **no test runner and no linter** configured. "Verifying" a change means running `npm run build` (typecheck via `tsc`) and exercising the flow in the running app.

## Architecture

Two npm workspaces — `server/` (Express 5 + TypeScript, ESM, run via `tsx`) and `client/` (React 19 + Vite). The client talks to the server through a single typed `fetch` layer (`client/src/api.ts`). `client/src/types.ts` mirrors `server/src/types.ts` by hand — **keep them in sync when changing the data model.**

### Season is hardcoded

The current season is pinned in **nine places** that must stay in sync: `hfSea=2026` in `savant.ts`, `CURRENT_SEASON` in `percentiles.ts`, and `SEASON` in `xwoba.ts`, `pitcherArsenal.ts`, `teamStats.ts`, `expectedStats.ts`, `research.ts`, `espn.ts` (which uses it for both the ESPN league endpoint's season segment and the MLB name index it matches against — a mismatch there matches nobody and quietly makes the whole league free agents) and `rotowire.ts` (RotoWire's own player tables, which **reject the request** without it rather than defaulting to the current year, so this one fails loudly — and it is in the blob key, so a stale season leaves last year's index on disk under its own name). Update all nine (and check date-default logic, plus the league constants in `leagueRates.ts`) when the season rolls over.

### The rest of the architecture

Split across `docs/claude/` and imported below — those files are part of this one and
are loaded with it. Keep each under the 150k-char limit; split a file again rather than
letting it grow past it.

**Data sources, join keys and caching** — MLB Stats API primary, Savant enrichment, the research board, percentiles, and every cache layer.

@docs/claude/data-sources.md

**Roster, watchlist, users and auth** — the two per-user player lists (the roster the views report on, the watchlist the research board follows) and the saved prefs, DynamoDB/file backends, Cognito sign-in and session handling.

@docs/claude/auth-and-storage.md

**ESPN fantasy league** — reading a league with the user's cookies, the name+team join, free agents, roster %, trending, invite sharing.

@docs/claude/espn.md

**Deployment** — the CDK app: S3 + CloudFront, Lambda, custom domain, warmers.

@docs/claude/deployment.md

**Date handling and server routing** — the 3am ET baseball day, every API route, video resolution.

@docs/claude/server.md

**Client** — the shell every view sits in: the roster and the watchlist, player keys, the pinned chrome and the app's scroll behaviour, the loading system, the kind tabs, the header and its search, the date controls and the hide-injured filter. It was one 443KB file and is now six, split by the surface being described rather than by size; this one closes with a map of the other five.

@docs/claude/client.md

**Client — the Roster view** — the summary table, its identity block and colour legend, the `Starters` filter, and the full-page mode all three wide tables share.

@docs/claude/client-summary.md

**Client — the research board** — its columns and their picker, the sort, the include buttons and the watchlist star, the position row and what a position means, the window tabs and the control bar.

@docs/claude/client-research.md

**Client — the player page** — `PlayerDetails` and its tabs (Overview, Percentile Rankings, Splits, News, Stats, Game Log, Arsenal, Charts), plus the reorder screen and the how-to page. It opens on **anybody**, which is the fact most of its design follows from.

@docs/claude/client-player-page.md

**Client — the League view** — the fantasy league's own page: the matchup scoreboard, the season table, the four ESPN league formats and which two of them it refuses to guess at.

@docs/claude/client-league.md

**Client — popups** — the app-wide dialog rules: why details are popups rather than accordions, the layer ladder, what a popup has to cover, and why one press of Escape undoes exactly one thing.

@docs/claude/client-dialogs.md

**Client — the Feed view** — its three sections, the base-event vocabulary, and what the feed lost when its grouped reading became the player page's Overview tab.

@docs/claude/client-feed.md

**Pitchers on the roster** — the pitcher-side pipeline and cards.

@docs/claude/pitchers.md
