### The Overview

**The app's front page, and the one view that answers a question rather than
offering a reading.**

`components/OverviewView.tsx` draws it, and it is the first of the app's four
tabs. The other three are each a *reading* — the Roster is your players over a
range you choose, the Feed is those same players' day as a stream, Research is
the whole league's season, the League page is the fantasy league's own three
questions. All four are good pages once you know what you are looking for. None
of them answers **how is it going**, which is the question somebody actually
opens this app with, and which used to take three presses and a date change to
assemble by hand: cross to the League page for the matchup, come back, set the
date to today, read the table, set it to yesterday, read it again, turn on
`Projected` and set it to tomorrow.

Four blocks and no controls:

1. **Your matchup** — this week's scoreboard card.
2. **Today**, 3. **Yesterday**, 4. **Tomorrow** — a day block each, in the order
   a manager asks after them rather than in calendar order.

### It is a composition, not a data source

**Every read behind it already existed, and no cache version was bumped.**

- The matchup is `/api/espn/scoreboard`, which the Roster view already reads for
  its own `Matchup` button — the same request, the same minute of server cache,
  put to a heavier use.
- Today and Yesterday are `/api/report` over a **one-day range**, which is also
  where each day's **lineup** comes from: that response carries `lineups` keyed
  by date whenever it is reading a fantasy team.
- Tomorrow is `/api/projection/roster` over one day, whose `lineup.days` is the
  plan the projected block cuts by.

What is new is the arithmetic that makes a page out of them, and it is all in
`client/src/categoryValue.ts`.

**The reads are gated on the view and kept**, the way the League page's tabs
are: a reader who never opens the Overview pays nothing, one who crosses to the
Roster and back does not pay twice. **Each fails on its own** — a dead
projection leaves Today and Yesterday standing, and each block says what it has
rather than the view becoming a message. **Sequence-numbered per block rather
than per view**, because the three land independently and a slow projection must
not discard a fresh Today.

**The clock is in the deps**, which is the one dependency worth naming: `today`
moves on resume (see **Client**, *Reopening the app shows what a reload would
show*), and a `TODAY` block over yesterday's games is exactly the fault that
state exists to prevent.

### The day blocks print the league's own categories

This is the decision the rest of the page hangs off.

A generic `12 H · 2 HR · 6 RBI` is a fact about baseball. `R 6 · HR 2 · RBI 6 ·
SB 1 · OPS .812` is a fact about **the matchup directly above it**, in the same
columns and the same order, so the eye carries straight from the week's figure
to the day that moved it. The split into `BATTERS` and `PITCHERS` is
`LeagueView`'s own `categoryGroups` — the same function the scoreboard card and
the Rankings table read, so a cell, its header and the block it belongs to
cannot come to disagree about which column is which.

**The line is `.lg-cats` and `.lg-cat-row` outright, folded in the JSX rather
than restyled.** A category line under a side-of-the-ball label is the same
object here as it is on a scoreboard card; two rules that agree about a grid
today are two rules that will one day differ.

**And it is the same arithmetic on both sides of that fold, with one exception
that needs its own function.** A rate over an aggregate is not the sum of the
rates: nine men's OPS added together is nothing at all. `categoryTotal` computes
the day's OBP over the day's own OBP denominator and the day's SLG over the
day's at-bats, and the counting categories go through the same table `dayValue`
reads so `SVHD` cannot mean two things.

### The totals are the lineup's, not the roster's

ESPN banks a man only on the scoring periods he held a starting slot for, so
counting the bench prints a day that reads **higher than the scoreboard directly
above it**. That is the same fault, and the same fix, `LeagueTeam`'s Summary
reading records (**Client — a league matchup**, and `lib.ts::projectStarters`,
which cuts *days* rather than rows). The head says `Lineup · 20 of 29` so the
reading is never a guess, and it says `Watchlist · 16` where there is no lineup
to be a subset of — a fantasy team whose per-day read failed falls back to the
second form, which is the honest direction: it counted everybody, so it says so.

**The count is the intersection rather than the lineup's own size.** ESPN's
published lineup can name a man this roster read does not carry — somebody
dropped since — and the block draws what it drew.

**The projected block's is the *plan* rather than a lineup**, tomorrow having
none: what the engine can say is which seat it would start him in
(`ProjectedPlayerLine.lineup.days`), and a man it would bench every day of the
span is in neither the count nor the block.

### Verified against ESPN, and the verification found the edge

**Over a whole completed matchup period, summed a day at a time, all ten
categories reproduce ESPN's own figures exactly.** Period 19 of the live league
(Aug 10 – Aug 23, **14 days**), the reader's own team, each day read through
`/api/report`, cut by that day's `lineups`, aggregated and put through
`categoryTotal`:

| | R | HR | RBI | W | ERA | SB | WHIP | K | OPS | SVHD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours | 76 | 29 | 89 | 9 | 2.9277 | 13 | 1.0753 | 116 | .8163 | 15 |
| ESPN | 76 | 29 | 89 | 9 | 2.9277 | 13 | 1.0753 | 116 | .8163 | 15 |

**10 of 10**, the three rates to four places. That is the lineup cut, the
per-day aggregation and the rate arithmetic all checked at once, against a
figure this app did not compute.

**And the same check on older periods drifts, which is worth writing down
because it is not this page's arithmetic.** Periods 16, 17 and 18 came back
7/10, 0/10 and 8/10. Driven day by day against ESPN's own per-day series
(`/api/espn/matchup-series`, running totals differenced), period 17's whole
disagreement is in its **first three days** — Jul 27, 28 and 29 — and its last
four are exact:

| day | ESPN R | ours | ESPN K | ours |
| --- | --- | --- | --- | --- |
| 2026-07-27 | 2 | **3** | 1 | 1 |
| 2026-07-28 | 7 | **8** | 4 | **13** |
| 2026-07-29 | 4 | 4 | 6 | **15** |
| 2026-07-30 | 3 | 3 | 8 | 8 |
| 2026-07-31 | 10 | 10 | 5 | 5 |
| 2026-08-01 | 8 | 8 | 10 | 10 |
| 2026-08-02 | 2 | 2 | 6 | 6 |

So it is **per-day and old**, not systematic: the lineup ESPN answers with for a
day some weeks back is not the lineup it scored. Every day from **Aug 10**
onward is exact, and **the Overview never reads a day older than yesterday** —
which is why this is recorded here as a property of the upstream rather than
fixed. Anything that starts reading this page's arithmetic over an older span
should re-measure first.

### Top performers, and what "top" means

**A categories league is won category by category, so *who had the best day* has
no answer until somebody says which categories count.** A home run is worth a
great deal in a league scoring HR and nothing at all in one scoring OBP and
total bases; a seven-inning shutout with two strikeouts is a fine day in a
league scoring ERA and WHIP and an ordinary one in a league scoring K. So the
ranking is built from `EspnScoreboard.categories` — the league's own list — and
the block says which set it used.

`categoryValue.ts::dayValue` is three steps and each is a decision:

1. **A contribution per category, in that category's own units.** For a counting
   category that is his count. For a **rate** category it is *numerator above
   baseline* — `H − lgAVG × AB`, `TB − lgSLG × AB`, `lgERA × IP / 9 − ER`,
   `lgWHIP × IP − (H + BB)` — which read as hits above average, earned runs
   saved, baserunners saved. Those are additive, signed the right way round, and
   zero rather than a division by nought on a day with no plate appearance.
   **OPS is its two halves added**, not a rate of its own: OBP and SLG have
   different denominators, so `(hisOPS − lgOPS) × PA` would be an average of two
   things measured against two different counts.
2. **Divided by that category's own scale**, so a home run and a strikeout are
   comparable. The scale is the standard deviation of a **single player-day** in
   that category.
3. **Averaged over the categories his side of the ball scores.** This is what
   makes a batter's day and a pitcher's day comparable at all: a league scoring
   six batting categories and four pitching ones would otherwise rank every
   hitter above every arm by construction, the hitter having six chances to
   accumulate and the arm four. It is why one list can hold both.

**A category the table cannot compute is not scored and is not counted in the
divisor either.** `GIDP`, `CG` and the rest are absent from a combined line, and
**quality starts in particular cannot be recovered from one** — six innings and
three earned runs is a quality start over one game and says nothing at all
summed over two. `GP` falls out through the same door by a different route: its
scale is measured at exactly **0**, a pitcher-day being one appearance 1,252
times out of 1,252, and a scale of zero means *not a differentiator* rather than
a division to guard.

**Scarcity is value, and that is the reading rather than a bug.** One stolen
base is worth 3.84 per-day standard deviations against a home run's 2.89,
because a steal is the rarer event and moves the SB column further than a home
run moves the HR column. Driven on the live league's Aug 23: Crow-Armstrong's
`2-4, 2 R, HR, 3 RBI, SB` leads at `+3.1`, McGonigle's `2-4, R, HR, 2B, 3 RBI`
is `+2.1`, Snell's `6.0 IP, 6 K, 0 ER, W` is `+1.8`, and Ohtani's `0-3` with a
run and a steal still places — which is what a 5×5 says about that afternoon and
what a stat line alone does not.

### Where the scales come from, and when to refresh them

**Measured off MLB's own boxscores, in the spirit `leagueRates.ts` sets out for
the FIP constant**: a handful of numbers that move a little year to year and are
not worth a second data source.

**The sample: ten dates spread evenly across the 2026 season** — Apr 10, Apr 25,
May 9, May 23, Jun 6, Jun 20, Jul 4, Jul 18, Aug 1, Aug 15 — every final game on
each, giving **3,008 batter-days** (every man with a plate appearance) and
**1,252 pitcher-days** (every man who recorded an out or faced a batter). The
baselines that fell out: `.2414 / .3169 / .3979` AVG/OBP/SLG, a `4.1331` ERA, a
`1.2844` WHIP, a `.2383` opponent average, `8.8225` K/9 — each within a
hundredth or two of the season's published figures, which is what a ten-date
sample of ~150 games should give.

**The four rate scales are the standard deviation of the *contribution*, not of
the rate**, which is why they are stated rather than derived: an OPS
contribution has a mean of exactly 0 by construction and a spread of `2.4066`
over a player-day, and neither number is recoverable from `.7147`.

**Refresh them when the season rolls over**, alongside the season pins
`CLAUDE.md` lists. Nothing breaks if they drift — a scale a few percent stale
reorders nothing, the numbers being a *ranking* rather than a published stat —
which is exactly why they are a constant table and not a request.

### A reader with no league still has days

**The blocks stand without one**, a watchlist having days and top performers
like any roster, and something has to say what "top" means: `STANDARD_5X5`, the
set every rotisserie league has scored since the game was invented. It is
declared in `EspnCategory`'s own shape so that **one function scores both**,
which is the whole reason it is spelled out rather than special-cased inside
`dayValue`.

**The caption says which set, not which league.** It printed `board.leagueName`
for a while and read as a non-sequitur under a list of players — `THETA CHI. WHY
NOT?` says nothing about how anybody was ranked. What the line is for is the one
thing a reader cannot infer: whether the ordering was his league's or a default,
which is a question only somebody *without* a league can get wrong. So it reads
`10 league categories` or `standard 5×5`, with the categories themselves in its
`title`.

**And the matchup block is absent rather than empty without a league**, the
app's own rule for a mark with nothing behind it: a heading reading `Your
matchup` over a message saying there isn't one is chrome for a feature the
reader hasn't got, and the three day blocks are a whole page on their own.

### The card's own `Your matchup` tag is suppressed here

**A mark that would be on every row marks nothing.** On the League page's board
the label is what says *which* of ten cards is yours; here there is exactly one
card and it is yours by construction. `MatchupCard` grew a `mineTag` prop for
it — the accent border stays either way, costing no space and carrying the
statement into a screenshot.

### Three doors, and each opens the page that owns the subject

- **The matchup card** opens the matchup page over the view, exactly as the
  Scoreboard's cards do (`mup=`). Driven: one press writes `mup=119`,
  `.app-chrome` goes `inert`, and one press of Escape returns to
  `?view=overview` with the Overview pill still lit.
- **A performer row** opens that player's page (`player=`). The whole row rather
  than the name, which is what every other list of players in this app does — a
  name that is a link beside a line that is not would be two targets for one
  subject.
- **`See the day →`** crosses to the Roster over that one day. It **carries the
  preset rather than the dates**, all three of the Overview's days being named
  ones, so a link copied off the Roster afterwards re-derives on the recipient's
  own today. It read `preset: null` at first and landed on `Custom range · Mon,
  Aug 24` for the day the bar three lines up was calling `Today`.

  **And tomorrow opens the Projected reading**, because that is the block it was
  pressed on: a played day's door is the stat table, and the Roster over a day
  nobody has played is a grid of dashes where the lens is the same estimate the
  block is drawn from, one row per man instead of three. Its range is written to
  the `projected` scope **by name**, which is `toggleRosterProjected`'s own rule
  and for its reason — `setRange` writes whichever scope `dateScopeRef` is
  pointing at, and on this commit that is still the view being left.

  Driven, all three:

  | block | lands on | date face |
  | --- | --- | --- |
  | `TODAY` | `?preset=Today` | `TODAY · Mon, Aug 24` |
  | `YESTERDAY` | `?preset=Yesterday` | `YESTERDAY · Sun, Aug 23` |
  | `TOMORROW` | `?preset=Tomorrow&rproj=1` | `PROJECTED · Tue, Aug 25` |

### Measured

**Layout, driven at seven widths on the live league's ten categories.**
Page-body overflow is **0** at 320 / 390 / 640 / 768 / 1024 / 1200 / 1920, and
the category lines never scroll inside themselves at any of them.

| window | view | matchup card | day block |
| --- | --- | --- | --- |
| 320 | 276 | 276 | 276 |
| 390 | 346 | 346 | 346 |
| 640 | 596 | 596 | 596 |
| 768 | 724 | 724 | 724 |
| 1024 | 980 | 800 | 319 × 3 |
| 1200 | 1120 | 800 | 365 × 3 |
| 1920 | 1120 | 800 | 365 × 3 |

**Three across from 900, and 900 is measured.** It was declared at 860 and the
measurement moved it: a block's category line is a grid with a 58px leading
column and a `minmax(36px, 1fr)` per category, and it scrolls sideways inside
itself the moment the block is narrower than five of those want.

| window | block | line overflow |
| --- | --- | --- |
| 860 | 264px | **10px** |
| 880 | 271px | **3px** |
| 900 | 277px | 0 |
| 920 | 284px | 0 |
| 960 | 297px | 0 |

**The fourth tab costs the strip no height**, `.main-tab` being `flex: 1 1 0` —
four equal columns whatever their words are. Measured with three tabs and with
four: **37px at 320 / 375 / 390 / 640 / 900 / 1200 / 1920** either way, and the
pinned chrome 148 / 100 / 100 / 100 / 102 / 102 / 102 either way. What it costs
is width *per* tab, and below 350 the two longest words ran out of it —
`Overview` and `Research` clipping 4px at 320, 2 at 330, 1 at 340 and 0 from
350. They ellipsized rather than bursting the page, which is what `min-width: 0`
is there for, but `Overvie…` on the tab that leads the strip is the row failing
to name the page it points at. A point of type and half the side padding below
350 clears all four at 320, 340 and 350, and costs the strip a pixel of height
(37 → 36).

**Two columns is deliberately not a step.** Three blocks in two columns is a row
of two and an orphan, and the orphan is `TOMORROW` — the one of the three whose
figures are estimates and the one least worth a whole row of its own.

**The bundle**, raw and gzipped, before → after:

| | raw | gzip |
| --- | --- | --- |
| CSS | 178,368 → 181,797 | 31,919 → **32,449** |
| JS | 693,662 → 707,238 | 202,673 → **206,827** |

+530 bytes of CSS and +4.1KB of JS gzipped, for a view, a scoring module, a
measured constant table and the narrow-screen tab rule above.

### Presentation, and the two rules it leans on hardest

**An estimate never wears the same clothes as a measurement.** The projected
block takes the **dashed border** `.lg-matchup.lg-proj` already uses — at the
size of a whole block because every figure in it is one, marking each of twelve
cells being one claim made twelve times — and its category figures and its
values go muted besides. The second mark is worth it: the category line is the
one row a reader's eye crosses between the three blocks, so the difference has
to be legible with the border out of view. The projected *line* keeps its
decimals for the same reason — `0.7 H` reads as an expectation where `1 H` would
read as a hit somebody got.

**Color is spent on state, not on emphasis.** The value column is monochrome:
the number is already the reason the row is where it is in the list, and a green
scale down three rows would be the ranking said twice.

**Three rows, and it is the block's own height rather than a taste.** A fourth
is one press away — the whole roster's day is the Roster view with the date set
to that day, which is where `See the day →` goes.

**Every empty state names its own cause**, and there are three of them because
*no games yet* and *nobody did anything* are the same empty box and very
different mornings.

### Where the rest of this documentation lives

**Client — the league view** for `MatchupCard`, `categoryGroups` and the
scoreboard the first block is drawn from. **ESPN fantasy league** for
`STAT_META`, which is where a category's side of the ball and its format come
from, and for the per-day lineup read. **Client — the roster view** for the
table `See the day →` lands on, and **Client — the date bar** for the presets it
carries. **Client** for `today`, the tab strip and the loading discipline every
block follows.
