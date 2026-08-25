---
name: sicko-mlb
description: The MLB view — the league itself rather than a roster or a fantasy league, and the one page that needs nothing of the reader. Its three tabs (Scoreboard, one ET day's games each a door into its own page, with a single-day date bar; Standings, three groupings and five spans over one read; News, the league's ten biggest stories ranked on the server), the four URL params, and why the fantasy tab is called Fantasy now. Use when editing MlbView.tsx, MlbScoreboard.tsx, MlbStandings.tsx or MlbNews.tsx, when changing the main tab strip, or when touching mlbScoreboard.ts, mlbStandings.ts or getLeagueNews.
---

# The MLB view

The fifth main tab, last in the row, and the only one of the five gated on
nothing — no watchlist, no fantasy league, no connection. Three tabs, three
questions: what happened today, who is any good, what is going on.

## What to read

- **Read `docs/claude/client-mlb.md`** before editing `MlbView.tsx`,
  `MlbScoreboard.tsx`, `MlbStandings.tsx` or `MlbNews.tsx`, or before touching
  the main tab strip. It covers why this is a tab and why it is last; why the
  fantasy tab is called `Fantasy` while `view=league` is untouched; the
  single-day date bar and `DateCalendar`'s `single` mode; the game card and what
  it deliberately does not draw; the three standings groupings off one read, the
  five spans and what a window may not carry; the three measured decisions in
  that table (the gutter, the club column's collapse to 0px, and the
  abbreviation swap at 900); the measured pinned edge; the top-ten news list; and
  the four URL params.

- **Read the two server modules themselves** — `server/src/mlbScoreboard.ts`
  and `server/src/mlbStandings.ts` — before changing what is on the wire. The
  second carries the measurement the whole windowed board rests on: computed
  records match MLB's own standings on all thirty clubs, and the one line of
  deduplication that match depends on.

- **Read `server/src/recentNews.ts`** before touching the news feed. One sweep
  answers both the research board's news marks and this view's stories, and the
  ranking — the kind-of-event table, the graded recency, the chatter proxy, and
  the prominence signal deliberately not modeled — lives there.

## Related

`sicko-server` for the three routes. `sicko-game-page` for the page a card
opens, `sicko-team-page` for the page a standings row opens, `sicko-client` for
the date bar and the loading discipline, `sicko-player-page` for `NewsList`.
