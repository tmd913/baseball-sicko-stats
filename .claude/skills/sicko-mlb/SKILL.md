---
name: sicko-mlb
description: The MLB view — the league itself rather than a roster or a fantasy league, and the one page that needs nothing of the reader. Its two tabs (Scoreboard, one ET day's games each a door into its own page, with a single-day date bar; Standings, three groupings over one read, with the last thirty games and the two halves of the season as columns), the three URL params, why the News tab was removed and what went with it, and why the fantasy tab is called Fantasy now. Use when editing MlbView.tsx, MlbScoreboard.tsx or MlbStandings.tsx, when changing the main tab strip, or when touching mlbScoreboard.ts or mlbStandings.ts.
---

# The MLB view

The fifth main tab, last in the row, and the only one of the five gated on
nothing — no watchlist, no fantasy league, no connection. Two tabs, two
questions: what happened today, and who is any good. There was a third, `News`,
and the document below records what it was and why it went.

## What to read

- **Read `docs/claude/client-mlb.md`** before editing `MlbView.tsx`,
  `MlbScoreboard.tsx` or `MlbStandings.tsx`, or before touching the main tab
  strip. It covers why this is a tab and why it is last; why the
  fantasy tab is called `Fantasy` while `view=league` is untouched; the
  single-day date bar and `DateCalendar`'s `single` mode; the game card and what
  it deliberately does not draw; the three standings groupings off one
  read and the three computed columns that replaced a span control; the measured
  decisions in that table (the gutter, the club column's collapse to 0px, the
  abbreviation swap at 900, the Safari sticky-cell fault and why there is no
  pinned edge); the sticky date bar; the three URL params; and **what the News
  tab was and everything that came out with it**.

- **Read the two server modules themselves** — `server/src/mlbScoreboard.ts`
  and `server/src/mlbStandings.ts` — before changing what is on the wire. The
  second carries the measurement the whole windowed board rests on: computed
  records match MLB's own standings on all thirty clubs, and the one line of
  deduplication that match depends on.

- **Read `server/src/recentNews.ts`** before touching the news mark. That sweep
  once had two readers and has one again — the research board's marks — this
  view's stories having gone with its News tab, and the ranking that served them
  with it. Two things it kept for the second reader are deliberate and say so
  where they are declared: the seven-day reach and the stored shape.

## Related

`sicko-server` for the two routes. `sicko-game-page` for the page a card opens,
`sicko-team-page` for the page a standings row opens, `sicko-client` for the
date bar and the loading discipline, `sicko-player-page` for `NewsList` — which
is now drawn on that page alone.
