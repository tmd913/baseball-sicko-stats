---
name: sicko-league
description: The League view — the fantasy league's own page, its three tabs (Scoreboard, Rankings, Transactions) and their strip, the minute-by-minute poll, the four ESPN scoring formats and the two it refuses to guess at, a matchup as a page over the view (the category comparison, its bars and meter, the acquisitions and moves, the two team pages), the rank badge scale, and the unread-transactions dot. Use when editing LeagueView.tsx, LeagueMatchup.tsx, LeagueRankings.tsx, LeagueTransactions.tsx, LeagueTeam.tsx, MatchupSeriesChart.tsx or Projection.tsx.
---

# The League view

The one page in the app about the **fantasy league** rather than about players.
It earns a pill rather than a menu entry because it is a fourth question, and it
is gated on a connected ESPN league. Four references, split by surface.

## What to read

- **Read `docs/claude/client-league.md`** before editing `LeagueView.tsx` or
  changing the tab strip, the poll or the period navigation — the view itself,
  why it earns a pill, the three tabs and what each URL param carries, the
  minute-long poll and why a hidden tab skips it, the four ESPN formats, and the
  **Scoreboard** tab whose cards are the door to a matchup.

- **Read `docs/claude/client-league-matchup.md`** before editing
  `LeagueMatchup.tsx`, `LeagueTeam.tsx`, `MatchupSeriesChart.tsx` or
  `Projection.tsx` — the matchup as a page over the view: the Summary's
  categories down the middle, the bar scale and the whole-matchup meter, the
  Projected toggle (this page's alone), the acquisitions and moves, the
  day-by-day category chart, and the two team pages, which are the app's own
  Roster and Feed views read for one manager.

- **Read `docs/claude/client-league-rankings.md`** before editing
  `LeagueRankings.tsx` — every team against every category over five spans, the
  three summary columns (OVR/BAT/PIT), the diverging rank badge and why it
  departs from the board's monochrome rule, and the press that opens a team's
  matchup.

- **Read `docs/claude/client-league-transactions.md`** before editing
  `LeagueTransactions.tsx` — the feed, what a row says about a player, and the
  red dot that says there are moves you have not seen.

## Related

`sicko-espn` for every read behind this page and for `STAT_META`.
`sicko-roster` and `sicko-feed`, which a team page draws.
