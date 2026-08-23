---
name: sicko-team-page
description: The team page (TeamDetails) — a club's own full-screen page and its six tabs (Overview, Schedule, Roster, Splits, Park, Stats), the side switch and the three tabs that follow it, the crest and record in its head, the three doors into it (the research board's team rows, a player's Overview, the header search), and DetailsShell, the overlay shell it shares with the player page. Use when editing TeamDetails.tsx or DetailsShell.tsx, when changing what a club's page shows, when adding a tab to either details page, or when touching the team=/tside= URL params or the /api/teams and /api/teams/:id/windows routes.
---

# The team page

`TeamDetails.tsx` — a club's page, and the second thing in this app to be one.
Six tabs (**Overview · Schedule · Roster · Splits · Park · Stats**), reachable from
the research board's team rows, from a player's Overview and from the header
search.

Its box is **`DetailsShell.tsx`**, extracted from `PlayerDetails` when this page
was written: the fixed page, its layer, the pinned chrome and measured
`--details-chrome-h`, the back button, the tab strip, the scroll reset and the
Escape ladder. **Both details pages ride on it**, so a change there reaches the
player page too.

## What to read

- **Read `docs/claude/client-team-page.md`** before editing `TeamDetails.tsx` or
  `DetailsShell.tsx`, before adding a tab to either details page, and before
  changing where the page is reached from. It covers: the shell and what it
  deliberately does not know; the six tabs and the **four the page refuses**
  (and why each refusal is about the club rather than the work); the crest and
  the record folded onto the hand token; the side switch and `tside=`; the
  fixture row and why it is not `UpcomingGames`; the Roster tab's join on
  `SeasonPlayer.teamId`; the Splits tab, which follows the side switch and is the
  same nine cuts of a club at the plate or in the field; the Stats tab's `teams` prop, its population and its missing
  cut control; the two server routes; the three doors; and the rule that
  `team=` and `player=` are one page at a time rather than a stack.

## Related

`sicko-player-page` is the other caller of the shell, and carries the reasoning
behind every rule the shell enforces. `sicko-research` owns the board's team
reading, whose rows are the first door in, and the column vocabulary the Stats
tab draws. `sicko-server` for `teamResearch.ts` and `teamHitting.ts`, which both
routes read. `sicko-client` for `App`'s URL-as-state and the header search.
