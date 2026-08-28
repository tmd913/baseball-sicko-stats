---
name: sicko-overview
description: The Overview — the app's front page, its first tab and a connected reader's default landing page, which answers "how is it going" out of reads other pages already make: this week's matchup card, then every day of the matchup period as a swipeable carousel of day cards, each printing the day's totals in the league's own scoring categories and naming the three men who did most for them (with today drawn as a projection until its first game starts). Also `categoryValue.ts`, which is how a day is scored — the rate contributions, the measured per-player-day scales, and why a batter's day and a pitcher's day are comparable at all. Use when editing OverviewView.tsx or categoryValue.ts, when changing what the Overview shows, how a performer is ranked or how the carousel behaves, when touching which view a bare URL lands on, when adding a scoring category the day blocks can compute, or when refreshing the scales for a new season.
---

# The Overview

`components/OverviewView.tsx` — the app's front page, the first of its four tabs
(**Overview · Roster · Research · League**) and the page a bare URL lands on when
a league is connected. Two blocks and no controls: this week's matchup card, then
**Your days** — **every day of the matchup period** as a carousel that opens on
Today — each card printing the day's totals in the league's own scoring
categories and naming the three men who did most for them. **Today is drawn as a
projection until its first game starts.**

**The carousel is the whole matchup period**, not three days of it — the
period's own span, widened to hold yesterday, today and tomorrow wherever its
edges fall — and every card past those three is read **as the reader swipes to
it**: one `/api/report` for the whole played half, one projection each for the
unplayed one. Every card with anything on it also opens its **whole day, ranked**
in a popup (`Rank all N`), which costs no read at all.

It is a **composition, not a data source**: the matchup is the same
`/api/espn/scoreboard` the Roster's own `Matchup` button reads, the two played
days are `/api/report` over a one-day range (which also carries that day's
lineup), and tomorrow is `/api/projection/roster` over one day. No new endpoint,
no new cache, no version bumped.

`client/src/categoryValue.ts` is the arithmetic — rate contributions as
*numerator above baseline*, divided by a **measured** per-player-day scale, and
averaged over the categories the player's own side of the ball scores.

## What to read

- **Read `docs/claude/client-overview.md`** before editing `OverviewView.tsx` or
  `categoryValue.ts`, before changing what the page shows or how a performer is
  ranked, and before touching the scales. It covers: the carousel and why it is
  one mechanism at every width; the bleed that *is* the peek; which view a bare
  URL lands on and the want that resolves it; why the categories are the reading
  rather than a stat line; why the totals are the *lineup's* and the
  verification against ESPN that establishes it (10 of 10 over a 14-day period,
  and the older-period drift that check found); the three steps of `dayValue`
  and why scarcity is value; the ten-date sample the scales were measured off
  and when to refresh them; the period-long row, the two read shapes behind it
  and the flick that was asking for every day it crossed; the `Rank all N`
  dialog, why it is a popup rather than a URL param, and the foot that holds two
  doors; the standard 5×5 fallback for a reader with no
  league; the three doors off the page; and the measured layout, breakpoint and
  bundle.

## Related

`sicko-league` for `MatchupCard`, `categoryGroups` and the scoreboard the first
block draws. `sicko-espn` for `STAT_META` — where a category's side of the ball
and its format come from — and for the per-day lineup read. `sicko-client` for
`App.tsx`'s `today`, the tab strip and the loading discipline. `sicko-roster`
and `sicko-client`'s date-bar reference for the page `See the day →` lands on.
