---
name: sicko-game-page
description: The game page (GamePage) — one game as a full-screen page and its three tabs (Overview with the line score and decisions, its cells doors onto a half-inning popup; Box Score, one club at a time; Plays, drawn as the feed's own items grouped by half-inning and paged an inning at a time) plus the Live tab a game being played opens on (the count and the matchup, the at-bat's pitches in the zone, who is due up between halves, the half's plays newest first), the two-club head, the three doors into it (the roster's opponent cell, a club's Results tab, a club's fixture rows), the game= URL param, the route stack behind Back and the tab and scroll a page comes back to, and the server modules. Use when editing GamePage.tsx or server/src/game.ts or teamGames.ts, when changing what a game's page shows, when touching the /api/games/:gamePk, /api/games/:gamePk/plays or /api/teams/:id/games routes, or when a box score, line score or play stream reads wrongly.
---

# The game page

`GamePage.tsx` — one game, whole: the line score, both clubs' box scores and
rosters, and every play in the order it happened. Three tabs (**Overview · Box
Score · Plays**), reachable from the summary table's opponent cell once a game
is live or over, from a club's **Results** tab, and from a club's fixture rows —
and a **Live** tab ahead of them while the game is being played, which is where
a live game's page opens: the count and the matchup, the at-bat's pitches in the
zone, who is due up between halves, and the half's plays newest first, built
off `GameReport.live` (`game.ts::buildLive`, MLB's `currentPlay` and the
linescore's offense/defense blocks).

The **Plays** tab draws the *feed's own items* — `playerDayEntries` and
`FeedItem`, off the day pipeline — so a change to a feed item shape reaches this
page too, and so does the half-inning dialog a line-score cell opens.

It is the **third** thing in this app to be a full-screen page, and it rides on
**`DetailsShell.tsx`** like the other two: the fixed page, its layer, the pinned
chrome and measured `--details-chrome-h`, the back button, the tab strip, the
scroll reset and the Escape ladder. A change there reaches the player page and
the team page too.

Its server module is **`server/src/game.ts`**, which reads MLB's `feed/live`
again rather than widening `StatsApiGame` — the reasoning is worth reading
before anything is moved between the two.

## What to read

- **Read `docs/claude/client-game-page.md`** before editing `GamePage.tsx`,
  `server/src/game.ts` or `server/src/teamGames.ts`, before adding a tab, and
  before changing where the page is reached from. It covers: what makes a game a
  page rather than a dialog; the three tabs and the three different pages the
  Overview is (played, not played, postponed); the Live tab, why it is offered
  only past first pitch and reads as Overview otherwise, its three blocks and
  the wire behind them; why `x` in a line score is a
  client-side judgment and why every other cell is a door onto a half-inning
  dialog; the box score's club switch, its slot arithmetic and the pitchers it
  drops; the play stream as feed items, its inning paging, the bare runs it
  drops and the `sameGame` prop that came with it; the two-club head; why a name
  is a door only where `knownPlayers` can resolve it; the live poll and its
  bumped sequence number; the server module's three reasons for existing and its
  measured field filter; the plays route and why it is the day pipeline; the
  three doors and `GameDoorContext`; the route stack that makes `Back` undo
  exactly one thing across all three pages; and the layout caches that let a
  page come back on the tab and at the offset it was left.

## Related

`sicko-team-page` for the club's page, which is where the Results tab lives and
which this page's `Back` returns to. `sicko-player-page` for the shell's own
reasoning, which was written and found there. `sicko-roster` for the summary
table's opponent cell, the first door in. `sicko-server` for `mlbStats.ts`,
whose feed cache and status predicates this module borrows and must move with.
`sicko-pitchers` for `OutingPage`, the other full-screen reading of a game — a
pitcher's night rather than the game itself.
