---
name: sicko-game-page
description: The game page (GamePage) — one game as a full-screen page and its three tabs (Overview with the line score, decisions and scoring plays; Box Score with both clubs' lines, benches and bullpens; Plays), the two-club head, the three doors into it (the roster's opponent cell, a club's Results tab, a club's fixture rows), the game= URL param and its one step of memory back, and the server module behind it. Use when editing GamePage.tsx or server/src/game.ts or teamGames.ts, when changing what a game's page shows, when touching the /api/games/:gamePk or /api/teams/:id/games routes, or when a box score, line score or play stream reads wrongly.
---

# The game page

`GamePage.tsx` — one game, whole: the line score, both clubs' box scores and
rosters, and every play in the order it happened. Three tabs (**Overview · Box
Score · Plays**), reachable from the summary table's opponent cell once a game
is live or over, from a club's **Results** tab, and from a club's fixture rows.

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
  Overview is (played, not played, postponed); why `x` in a line score is a
  client-side judgment; the box score's slot arithmetic and the pitchers it
  drops; the play stream's grouping and its live row; the two-club head; why a
  name is a door only where `knownPlayers` can resolve it; the live poll and its
  bumped sequence number; the server module's three reasons for existing and its
  measured field filter; the three doors and `GameDoorContext`; and the rule that
  `player=`, `team=` and `game=` are one page at a time with one step of memory
  back.

## Related

`sicko-team-page` for the club's page, which is where the Results tab lives and
which this page's `Back` returns to. `sicko-player-page` for the shell's own
reasoning, which was written and found there. `sicko-roster` for the summary
table's opponent cell, the first door in. `sicko-server` for `mlbStats.ts`,
whose feed cache and status predicates this module borrows and must move with.
`sicko-pitchers` for `OutingPage`, the other full-screen reading of a game — a
pitcher's night rather than the game itself.
