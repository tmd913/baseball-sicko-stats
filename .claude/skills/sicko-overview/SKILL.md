---
name: sicko-overview
description: The Overview — the app's front page, its first tab and a connected reader's default landing page, which answers "how is it going" out of reads other pages already make: this week's matchup card, then yesterday, today and tomorrow as a swipeable carousel of day cards, each printing the day's totals in the league's own scoring categories and naming the three men who did most for them (with today drawn as a projection until its first game starts), then a Matchup leaders card per manager — crest, top three, and hot/level/cold counts, over a Summary-or-Projected switch. Every one of those lists opens its whole ranked population in a popup, and each count badge opens its own cut of it. Also `categoryValue.ts`, which is how a day is scored — the rate contributions, the measured per-player-day scales, and why a batter's day and a pitcher's day are comparable at all. Use when editing OverviewView.tsx or categoryValue.ts, when changing what the Overview shows, how a performer is ranked or how the carousel behaves, when touching which view a bare URL lands on, when adding a scoring category the day blocks can compute, or when refreshing the scales for a new season.
---

# The Overview

`components/OverviewView.tsx` — the app's front page, the first of its four tabs
(**Overview · Roster · Research · League**) and the page a bare URL lands on when
a league is connected. Two blocks and no controls: this week's matchup card, then
**Your days** — **Yesterday · Today · Tomorrow** as a carousel that opens on
Today — each card printing the day's totals in the league's own scoring
categories and naming the three men who did most for them. **Today is drawn as a
projection until its first game starts.**

**Every list of performers on the page opens in full** — `Rank all N` on a day
card and on each side of the leaders block — in a popup that costs no read, with
a diverging chip under each value ranked across both rosters.

**`Matchup leaders`** is the one block that needs a read of its own: one
`/api/report` over the matchup span per manager (a span answers with each game's
own date and a lineup per date), scored a day at a time and added up, plus one
projection apiece on the first press of `Projected` (`lead=proj`).

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
  and when to refresh them; the `Rank all N` dialog, why it is a popup rather than
  a URL param and why its value chips are colored where the cards' are not; the
  `Matchup leaders` block, its two read shapes, its `Summary`/`Projected` switch,
  the two **measured** pairs of hot/cold cuts and the badges that open them; the
  measured budget the Spotlight's notes are written to; the period-long carousel that
  was built and pulled back; the standard 5×5 fallback for a reader with no
  league; the three doors off the page; and the measured layout, breakpoint and
  bundle.

## Related

`sicko-league` for `MatchupCard`, `categoryGroups` and the scoreboard the first
block draws. `sicko-espn` for `STAT_META` — where a category's side of the ball
and its format come from — and for the per-day lineup read. `sicko-client` for
`App.tsx`'s `today`, the tab strip and the loading discipline. `sicko-roster`
and `sicko-client`'s date-bar reference for the page `See the day →` lands on.
