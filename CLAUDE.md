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

## Spelling: American, with two exceptions

Prose, comments, documentation and every user-visible string in this repo are
written in **American English** — color, center, behavior, gray, canceled,
labeled, recognize. The whole corpus was swept for it in one pass (79 files,
842 lines), so a British spelling introduced now is a spelling that will read
as a typo against everything around it.

**Two things are deliberately not swept, and both would be silent breakages
rather than cosmetic ones:**

- **Values that come off the wire.** MLB spells a called-off game
  `Cancelled` in `status.detailedState` — measured, 3 games of the 2026 season
  — so `schedule.ts::stateOf` compares against *that* spelling and carries a
  comment saying so. Americanizing it does not fail the build; it quietly files
  a postponement as a game played, which the comment above that function names
  as "the one error that would make the per-row game count lie". The same rule
  covers any ESPN or Savant value.
- **Names the platform owns.** `aria-labelledby` is a DOM attribute, not a word
  we chose. `overscroll-behavior`, `color` and the rest of CSS are already
  American and were never at issue.

And note two words that only *look* British: **`analysis`/`analyses`** are the
correct American spellings (only `analyse`/`analysed` would move), and
**`cancellation`** keeps its double `l` on both sides of the Atlantic.

## Architecture

Two npm workspaces — `server/` (Express 5 + TypeScript, ESM, run via `tsx`) and `client/` (React 19 + Vite). The client talks to the server through a single typed `fetch` layer (`client/src/api.ts`). `client/src/types.ts` mirrors `server/src/types.ts` by hand — **keep them in sync when changing the data model.**

### Season is hardcoded

The current season is pinned in **nine places** that must stay in sync: `hfSea=2026` in `savant.ts`, `CURRENT_SEASON` in `percentiles.ts`, and `SEASON` in `xwoba.ts`, `pitcherArsenal.ts`, `expectedStats.ts`, `armAngle.ts`, `research.ts`, `espn.ts` (which uses it for both the ESPN league endpoint's season segment and the MLB name index it matches against — a mismatch there matches nobody and quietly makes the whole league free agents) and `rotowire.ts` (RotoWire's own player tables, which **reject the request** without it rather than defaulting to the current year, so this one fails loudly — and it is in the blob key, so a stale season leaves last year's index on disk under its own name). Update all nine (and check date-default logic, plus the league constants in `leagueRates.ts` and `pitchLeague.ts`, whose per-hand table is read off one season's league board) when the season rolls over. **Check the count against the code rather than trusting this sentence** — `grep -rln "hfSea\|CURRENT_SEASON = \|SEASON = " server/src/` is what it is derived from, and it has been one behind before.

### The rest of the architecture

Split across `docs/claude/` and imported below — those files are part of this one and
are loaded with it. Keep each under the 150k-char limit; split a file again rather than
letting it grow past it.

**Data sources, join keys and caching** — MLB Stats API primary, Savant enrichment, the research board, percentiles, and every cache layer.

@docs/claude/data-sources.md

**Roster, watchlist, users and auth** — the two per-user player lists (the roster the views report on, the watchlist the research board follows) and the saved prefs, DynamoDB/file backends, Cognito sign-in and session handling.

@docs/claude/auth-and-storage.md

**ESPN fantasy league** — reading a league with the user's cookies, the name+team join, free agents, which day's lineup, a range of rosters, the scoring-period anchor and the injury designation.

@docs/claude/espn.md

**ESPN — connecting and sharing a league** — the `espn_s2` credential and how it is handled, the connect form, the nine routes, the invite link, and what naming a team for the first time does.

@docs/claude/espn-connection.md

**ESPN — the per-player marks a league buys** — roster %, position eligibility, the padlock, and the five trend columns, all off one cookie-free player list.

@docs/claude/espn-players.md

**ESPN — the league's own numbers** — the scoreboard and the day `cumulativeScore` leaves off, acquisitions, the stat-id table, the matchup window, the Rankings spans and the transactions feed.

@docs/claude/espn-scoreboard.md

**Deployment** — the CDK app: S3 + CloudFront, Lambda, custom domain, warmers.

@docs/claude/deployment.md

**Date handling and server routing** — the 3am ET baseball day, every API route, video resolution.

@docs/claude/server.md

**Client** — the shell every view sits in: the roster and the watchlist, player keys, the pinned chrome and the app's scroll behavior, the loading system, the kind tabs, the header and its search, the date controls and the hide-injured filter. It was one 443KB file and is now six, split by the surface being described rather than by size; this one closes with a map of the other five.

@docs/claude/client.md

**Client — the Roster view** — the summary table, its identity block and color legend, the `Starters` filter, and the full-page mode all three wide tables share.

@docs/claude/client-summary.md

**Client — the research board** — its columns and their picker, the sort, the include buttons and the watchlist star, the position row and what a position means, the window tabs and the control bar.

@docs/claude/client-research.md

**Client — the player page** — `PlayerDetails`, the reorder screen, the how-to page, and the **Overview** tab: his day, his next game, his projected starts, his latest news and his last five games. It opens on **anybody**, which is the fact most of its design follows from.

@docs/claude/client-player-page.md

**Client — the player page's reading tabs** — **News** (and the eleven dead ends behind it), **Stats** (the research board transposed onto one man), **Game Log** (and the outing a pitcher's row opens) and **Charts**.

@docs/claude/client-player-tabs.md

**Client — the player page's Splits tab** — the platoon comparison, its diverging bar, and the five rounds of measured geometry that bar has taken.

@docs/claude/client-player-splits.md

**Client — the League view** — the fantasy league's own page: why it earns a pill, its three tabs and their strip, the poll, the four ESPN league formats and which two of them it refuses to guess at, and the **Scoreboard** tab.

@docs/claude/client-league.md

**Client — a league matchup** — the page opened from a scoreboard card: the Summary page's categories down the middle, its scale, the acquisitions and moves under it, and the two team pages.

@docs/claude/client-league-matchup.md

**Client — the League view's Rankings tab** — every team against every category over one of five spans, the three summary columns, and the rank badge that colors it.

@docs/claude/client-league-rankings.md

**Client — the League view's Transactions tab** — who added, dropped and traded whom, and the dot on the tab.

@docs/claude/client-league-transactions.md

**Themes** — the palette as a set of tokens, the six color schemes (the plain Dark and Light pair off VS Code's own `2026 Dark`/`2026 Light` defaults, of which **Dark is the app's default** and which lead the picker; Midnight, the navy original and still what `:root` declares; Lavender, dark gray and violet; and Maroon and Powder Blue, the dark and light halves of a 1980 road uniform), the picker in the settings menu, why every theme is stamped on `<html>` now that the default and `:root` are two different things, and why the choice is the one thing in this app mirrored into localStorage.

@docs/claude/theming.md

**Client — popups** — the app-wide dialog rules: why details are popups rather than accordions, the layer ladder, what a popup has to cover (including the one element an opaque box does not cover — a `<video>`, whose compositing layer paints over it), and why one press of Escape undoes exactly one thing.

@docs/claude/client-dialogs.md

**Client — the Feed view** — its three sections, the base-event vocabulary, and what the feed lost when its grouped reading became the player page's Overview tab.

@docs/claude/client-feed.md

**Pitchers on the roster** — the pitcher-side pipeline and cards.

@docs/claude/pitchers.md
