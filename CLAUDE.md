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

The current season is pinned in **eleven places** that must stay in sync: `hfSea=2026` in `savant.ts`, `CURRENT_SEASON` in `percentiles.ts`, and `SEASON` in `xwoba.ts`, `pitcherArsenal.ts`, `expectedStats.ts`, `armAngle.ts`, `research.ts`, `teamResearch.ts`, `parkFactors.ts` (Savant's park-factor board, whose `year=` decides which season's parks are read), `espn.ts` (which uses it for both the ESPN league endpoint's season segment and the MLB name index it matches against — a mismatch there matches nobody and quietly makes the whole league free agents) and `rotowire.ts` (RotoWire's own player tables, which **reject the request** without it rather than defaulting to the current year, so this one fails loudly — and it is in the blob key, so a stale season leaves last year's index on disk under its own name). Update all eleven (and check date-default logic, plus the league constants in `leagueRates.ts` and `pitchLeague.ts`, whose per-hand table is read off one season's league board) when the season rolls over. **Check the count against the code rather than trusting this sentence** — `grep -rln "hfSea\|CURRENT_SEASON = \|SEASON = " server/src/` is what it is derived from, and it has been one behind **twice**: `teamResearch.ts` arrived with the board's Teams reading and declares a `SEASON` of its own, and this sentence said **nine** until it was counted again; `parkFactors.ts` arrived with the park-factor board and did the same, and it said **ten**.

**That grep answers with one file more than the count, and always will.** It returns **twelve**, because `playerSplits.ts` answers the `hfSea` half of the pattern while *importing* `SEASON` from `research.ts` rather than declaring one — a **use**, not a pin, and nothing to update when the year rolls over. So the reading is: twelve files answer, eleven of them declare, and the one that doesn't says so in a comment above its `hfSea`.

**Count the declarations, not the filenames — and know that the declaration grep is itself one short.** `grep -rn "hfSea=\|CURRENT_SEASON = \|SEASON = " server/src/ | grep -v '\${SEASON}'` answers **ten**, one under the eleven, and the missing one is `savant.ts`: it spells the pin `hfSea: '2026|'` as an object value, so the `hfSea=` half of that pattern never matches it and every other file reaches the board through a `SEASON` const the first half catches. It is the only file that writes the year into a Savant parameter literally. So the arithmetic that actually holds is **ten from the const grep, plus `savant.ts`, is eleven** — which is why the list above is the thing to update and the greps are only the check on it.

### The rest of the architecture

**The architecture is documented per surface, and those documents are loaded on
demand rather than imported.** They come to 1.6MB — importing them cost ~415k
tokens on every session and every subagent, which put a subagent over its own
context limit before it had read a line of code.

So each surface is a **skill**. The harness lists their descriptions; invoking
one reads its document. **Invoke the skill for the surface you are touching
before you edit it** — these documents are the record of *why* each rule is
what it is, and most of them are not recoverable from the code.

| you are editing | invoke |
| --- | --- |
| `savant.ts` `mlbStats.ts` `research.ts` `statcastWindow.ts` `percentiles.ts` `teamHitting.ts` `leagueWoba.ts` `xwoba.ts` `expectedStats.ts` `armAngle.ts` `pitcherArsenal.ts` `parkFactors.ts` | `sicko-server` |
| `index.ts` (routes) `etDate.ts` `schedule.ts` `rotations.ts` `gameLog.ts` `stints.ts` `nextGame.ts` `news.ts` `recentNews.ts` `rotowire.ts` `projectedStarts.ts` `warmer.ts` `revisions.ts` `mlbScoreboard.ts` `mlbStandings.ts` | `sicko-server` |
| `store.ts` `storage.ts` `auth.ts` `cognito.ts` `auth.tsx` `invite.ts` | `sicko-server` |
| `espn.ts` `projection.ts` `EspnSettings.tsx` `LeagueOnboarding.tsx` | `sicko-espn` |
| `App.tsx` `hooks.ts` `lib.ts` `api.ts` `PlayerAdder.tsx` `Loading.tsx` `DateControls.tsx` `DateRangePicker.tsx` `simulate.ts` | `sicko-client` |
| `OverviewView.tsx` `categoryValue.ts` | `sicko-overview` |
| `SummaryTable.tsx` `PlayerIdentity.tsx` `PhotoStatus.tsx` `schedule.tsx` `ScheduleControl.tsx` `ExpandButton.tsx` | `sicko-roster` |
| `ResearchTable.tsx` `researchColumns.tsx` `ColumnPicker.tsx` `columnRanks.tsx` `TurnPicker.tsx` `WatchStar` `LockMark.tsx` `NewsMark.tsx` | `sicko-research` |
| `LiveFeed.tsx` `PlayerDay.tsx` `PlateAppearanceCard.tsx` `FeedFilters.tsx` `BaseDiamond.tsx` `ClipVideo.tsx` | `sicko-feed` |
| `PlayerDetails.tsx` `PlayerOverview.tsx` `PlayerSchedule.tsx` `GameLog.tsx` `PlatoonSplits.tsx` `RollingXwoba.tsx` `PlayerWindowTable.tsx` `PlayerNews.tsx` `PlayerOrderEditor.tsx` `Tutorial.tsx` `DetailsShell.tsx` | `sicko-player-page` |
| `TeamDetails.tsx` `DetailsShell.tsx` `ParkFactors.tsx` | `sicko-team-page` |
| `GamePage.tsx` `game.ts` `teamGames.ts` `DetailsShell.tsx` | `sicko-game-page` |
| `LeagueView.tsx` `LeagueMatchup.tsx` `LeagueRankings.tsx` `LeagueTransactions.tsx` `LeagueTeam.tsx` `MatchupSeriesChart.tsx` `Projection.tsx` | `sicko-league` |
| `MlbView.tsx` `MlbScoreboard.tsx` `MlbStandings.tsx` `MlbNews.tsx`, the main tab strip | `sicko-mlb` |
| `PitcherCard.tsx` `Arsenal.tsx` `ArsenalCharts.tsx` `Innings.tsx` `OutingPage.tsx` `OpponentTable.tsx` `PitchSequence.tsx` `StrikeZone.tsx` | `sicko-pitchers` |
| `Modal.tsx` `InfoKey.tsx`, `useDismissable`, anything that opens a popup | `sicko-dialogs` |
| `styles.css` tokens or colors, `theme.ts` `ThemePicker.tsx` | `sicko-theming` |
| `infra/` | `deploy` |
| landing branches, resolving conflicts | `merge` |

A file in two rows wants both. A change that spans surfaces — a new column on a
wide table, a field crossing the wire — wants the server one and the client one.

**`docs/claude/*.md` is where the documents themselves live**, unmoved: they
cross-reference each other by title constantly, `docs/` is already served by
`npm run docs`, and they stay greppable. A skill is a router pointing at them,
not a copy of them.

**A few passages inside those documents say their cross-references resolve
"because all of them are imported together."** The references still resolve — the
sibling is one `Read` away and usually one skill away — but the reason given is
now historical. Those sentences are left as written rather than edited, which is
the same rule the documents apply to their own superseded reasoning.

**Where to write a new rule.** If it is true whatever file you are in, it
belongs in `RULES.md` below. If it is about one surface, it belongs in that
surface's document, in the voice the rest of that file uses — the measurement
that establishes it, and the alternative that was rejected.

**These files no longer need to stay under 150k chars.** That limit existed
because everything was imported into every session; nothing is now. Split a file
when it covers two surfaces, not when it passes a byte count.

@docs/claude/RULES.md
