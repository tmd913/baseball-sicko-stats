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

Three blocks and no controls:

1. **Your matchup** — this week's scoreboard card.
2. **Your days** — **Yesterday · Today · Tomorrow**, a card each, as a carousel
   that opens on Today.
3. **Their days** — the same three cards for whoever you are playing this week,
   where there is somebody.

**It is a reader-with-a-league's default page**, and the first tab either way —
see *The tab is the league's, and so is the default* below.

### It is a composition, not a data source

**Every read behind it already existed, and no cache version was bumped.**

- The matchup is `/api/espn/scoreboard`, which the Roster view already reads for
  its own `Matchup` button — the same request, the same minute of server cache,
  put to a heavier use.
- Today and Yesterday are `/api/report` over a **one-day range**, which is also
  where each day's **lineup** comes from: that response carries `lineups` keyed
  by date whenever it is reading a fantasy team.
- Tomorrow is `/api/projection/roster` over one day, whose `lineup.days` is the
  plan the projected block cuts by — **and so is Today**, for the hours before
  it starts (below). Two dates, two requests: the engine hands back a span total
  and no per-day breakdown, so a two-day read could not be split back apart.

What is new is the arithmetic that makes a page out of them, and it is all in
`client/src/categoryValue.ts`.

**The reads are gated on the view and kept**, the way the League page's tabs
are: a reader who never opens the Overview pays nothing, one who crosses to the
Roster and back does not pay twice. **Each fails on its own** — a dead
projection leaves Today and Yesterday standing, and each block says what it has
rather than the view becoming a message. **Sequence-numbered per block rather
than per view**, because the three land independently and a slow projection must
not discard a fresh Today.

**Four reads now, and the fourth is a judgment about mornings.** Today's
projection is fired alongside the other three rather than after the report has
said whether it is wanted. A dependent read is cheaper — it would cost nothing
in the evening, when the day has started and the projection will not be drawn —
and it would put a **second wait in front of the one card a reader opens this
page for**, which is the wrong side to save on. It is one more answer off an
engine this page is already asking, behind the server's own cache.

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
which cuts *days* rather than rows). **The head said `Lineup · 20 of 29` and no longer does.** It was argued for and
the argument was about arithmetic: a lineup total and a roster total are
different numbers, only one of them agrees with the scoreboard above, and the
head said which. All of that is still true and none of it is the reader's
question. Three lines of head — the day, the date, a count of men — put the
thing a manager came for one line lower on a card that is already the second
block of the page, to answer something nobody standing in front of it was
asking. The fact survives where it is load-bearing: here, and in the ESPN check
below, which is what establishes the agreement in the first place.

**The projected block cuts by the *plan* rather than a lineup**, a day nobody
has played having none: what the engine can say is which seat it would start him
in (`ProjectedPlayerLine.lineup.days`), and a man it would bench every day of
the span is in neither the count nor the block.

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

### The three days are a carousel

**One mechanism at every width, and there is no carousel *mode*.** `.ov-days` is
a scroll-snap flex row always; what the 900px breakpoint changes is the cards'
flex basis — `0 0 100%` of the row below it, `1 1 0` above. So above 900 the row
does not overflow, nothing scrolls, nothing snaps and the dots are not drawn.
**The desktop layout is what a carousel that fits looks like**, which is why
there is no second set of rules for it and nothing for a reader to be in.

**Chronological, where the blocks used to read `Today · Yesterday · Tomorrow`.**
That was the order a manager *asks* after them and it is wrong for a row you
swipe, whose whole grammar is that left is back and right is forward. It costs
nothing: the row opens on Today, so what leads is unchanged and what moved is
where the other two are — and it reads better on a desk too, three columns
left-to-right being a timeline rather than a ranking. `DAYS` is the one place
the order is stated and `OPENS_ON` is derived from it, so re-ordering the array
cannot leave the opening card behind.

**The bleed is the peek.** The row gives back `--table-bleed` — the app's own
22px gutter, declared by the container as that token always is — so the cards
stay at **exactly the width they had when they stacked** and 22px of the
neighboring day shows at each edge. That is not a nicety: at 320 a card is 276px
and its category line wants 248 inside 12px of padding a side, so a peek carved
out of the *card* would have put that line back to scrolling inside itself,
which is the fault the 900px breakpoint exists to prevent, arrived at from the
other direction. `scroll-padding-inline` matches it, which is what lets the
first and last cards reach the middle at all — without it `scrollLeft` cannot go
below 0 and Yesterday could never be centered.

**`useOverflowArrows` does the measuring**, folded rather than copied: that hook
is `TabStrip.tsx`'s general answer to *does this row overflow*, it already
measures on every render (a day block gains rows when its read lands, and a
`ResizeObserver` on the box hears nothing when the content is what moved) and it
already owns the one observer. What this file adds is the two things that are a
carousel's rather than a scrolling row's — which card is centered, and putting
one there.

**Opening on Today is a layout effect keyed on `over`**, which is what makes it
fire at the two moments it has to and no other: on mount, when the hook's own
layout effect flips `over` false → true and this runs on the flush that follows,
still before paint so nobody sees Yesterday for a frame; and on a window
crossing 900px downward, where a row that could not scroll now can and would
otherwise sit at `scrollLeft: 0`. It deliberately re-centers on nothing else — a
reader who has swiped to Tomorrow must not be carried back because a projection
landed, which is *never over data* one axis over.

**The scroll is written as a `scrollTo` on the row**, never `scrollIntoView` —
the rule the League page's week list already records, that one walking every
scrollable ancestor and carrying the whole page with it. And the offset is
measured off the two rects rather than computed from a card width and a gap:
those are a percentage and a token, and the arithmetic would be a third opinion
about a number the browser already has.

**No `touch-action`, deliberately.** The two gestures differ in *axis* — the row
scrolls sideways, the page down — which is the one case the browser already
arbitrates correctly. The app's rule is to declare it only where an element
genuinely consumes a gesture, and this one consumes nothing the page wanted.
`overscroll-behavior-x: none` is declared, in the one axis this box scrolls, so
a flick that runs out of days does not carry the page.

**Three dots, drawn only while the row overflows** — the measurement deciding
rather than the breakpoint. They are buttons as well as a position: a pointer
user has no swipe, and the peek is the only other thing saying there is more.
The active one is **larger as well as brighter**, a color alone being a whole
statement resting on a hue.

Driven at 390, with the row scrolled programmatically and by its own dots:

| | scrollLeft | showing | snapped | dot |
| --- | --- | --- | --- | --- |
| open | 358 | `TODAY` | yes | 2 of 3 |
| `scrollBy(+100)` | 716 | `TOMORROW` | yes | 3 of 3 |
| `scrollBy(-400)` | 358 | `TODAY` | yes | 2 of 3 |
| press dot 1 | 0 | `YESTERDAY` | yes | 1 of 3 |

`window.scrollY` is **0** at every one of them, which is the `scrollIntoView`
rule holding. (A finger could not be synthesized here — neither
`Input.dispatchTouchEvent` nor `Input.synthesizeScrollGesture` moved this row in
headless, measured at 0px over six attempts — so what is verified is the snap,
the dots, the centering and the page staying put; the touch-drag itself is the
browser's own `scroll-snap-type: x mandatory`.)

### And the same three days for the opponent

**It is the second half of the question the first block asks.** A matchup card
says you are down five categories to four; *why* is two rosters, and the page
held one of them. So the foot of the page is `Their days` — the same three
cards, read for the other manager.

**One component drawn twice, not two rows that agree today.** The carousel was
written inline in the view while there was one of it; two copies of a
scroll-snap row with its own centering, its own dot state and its own measuring
is the thing this codebase folds on sight, so it came out as `DayCarousel` and
the second section is a second call. `DayBlock`, `scorePlayed`, `scoreProjected`
and `dayValue` are all the same functions — which is also what guarantees the
two halves of the page are scored the same way, a guarantee two copies could
not make.

**Whose days it is, is a `teamId`** on the two routes the page already reads
(`/api/report` and `/api/projection/roster` both take one, and `LeagueTeam` next
door already reads a leaguemate's roster this way). No new endpoint again.

**Its four reads are their own effect**, because they depend on something the
reader's own four do not: a board that has landed with a two-sided matchup on
it. Folding them in would put the *whole* page behind a read only its foot
needs. The opponent's team id is in the deps, so stepping the scoreboard's week
re-reads them — four cards about last week's opponent would be four cards about
the wrong manager. Eight reads can be in flight at once and each is
sequence-numbered on its own.

**Absent rather than empty, on all three of the ways it can have no subject** —
no league, no matchup this period, and a **bye**, where the reader has a matchup
and no opponent in it. `opponentName` is null in each, and the section is drawn
on that being non-null, so none of the three needs a message.

**His day starts when *his* first game does.** Two managers' rosters are two
sets of clubs, so `TODAY` can be measured on one half of the page and projected
on the other for an hour of an afternoon. That reads oddly for a moment and is
the truth; the alternative is telling the reader a projection is a result
because somebody else's game had started.

**`See the day →` is not drawn on these cards**, and it is the one thing that is
not simply the same component. The door it opens is the Roster view, which is
*yours*: a press promising somebody else's Tuesday and delivering your own would
be worse than no press at all. A leaguemate's roster is read on the matchup
page, which is one press away through the card at the top of this one. So
`onSeeDay` is nullable and a null draws no foot.

Driven at 390 with the live league:

| | headings | carousels | dots each | opens on | foot buttons |
| --- | --- | --- | --- | --- | --- |
| | `Your days · Aug 24 – Aug 26`, `Their days · Baldy's Bozos` | 2 | 3 | `TODAY` / `TODAY` | 3 / **0** |

with the opponent's four requests carrying `teamId=12` against the reader's own
`teamId=6`, three ranked performers on his card, no console errors and 0
page-body overflow.

### Today is a projection until the day starts

**A card of noughts under `No games played yet.` is a true statement and a
useless one.** At nine in the morning the thing a manager wants off this page is
*what is my day worth* — which is the question the Tomorrow block already
answers, with an engine this page is already asking. So until the first game on
this roster is under way, `TODAY` draws the projection, dashed and muted and
tagged `PROJECTED` exactly as Tomorrow is, and swaps to the measured reading the
moment a game starts.

**The test is a game of *this roster's* that is live or final**, which is what
`DayLine.games` already counts — `lineOf` puts a scheduled fixture in neither.
Not MLB's first pitch of the day, which is a fact about somebody else's
afternoon; and not *has anybody had a plate appearance*, which would leave the
card projected through the top of the first.

**Two reads behind one card, and one wait.** Until both have answered, a block
drawn off either is a block the other may be about to replace — the flicker the
loading discipline exists to prevent, and the only case on this page where a
card waits on more than its own read. **A failed or absent projection falls back
to the measured block**, which is the rule that a failure costs its own column
and never the request: the noughts are honest, and they are what the card showed
before this.

### The tab is the league's, and so is the default

**Drawn for a connected league and for nobody else, and it is that reader's
default page.**

Three of the four blocks would stand on a saved watchlist — a watchlist has days
and top performers like any roster, and `STANDARD_5X5` exists so the ranking has
a meaning without a league. What it would lose is the block that makes this a
*front* page: the matchup. Without one it is three cards a reader can already
reach by setting a date, so the tab is not offered and `summary` stays the
default it has always been.

**A bare URL is not a link anybody wrote.** The seed's own note used to argue the
opposite — *an omitted param is the default, so moving a default changes what
somebody else's link says* — and the half of that which is still true is why the
change is shaped as it is: every link naming a view still opens that view,
`?view=summary` included, and `view=` is written out in full the moment anything
but the Overview is on screen. What the argument missed is *which* link. `?` on
its own is the app being **opened**, and the page a manager wants when they open
it is the one that says how it is going.

**It cannot be decided in the seed**, `/api/espn` not having answered on that
render, so it is a **want resolved once** — `wantOverview`, the shape
`wantMyMatchup` uses one param over. It fires on the first render at which
`espnStatusSettled` is true and clears the flag **whichever way the answer
goes**, so a reader with no league stays where a bare URL has always put them
and no poll can re-open the page under them. Nothing can have moved under it
either: the tab strip is gated on `initialLoadSettled`, which includes this very
status, so there is no render on which a reader could have pressed a tab first —
which is why it needs no *unless they have already navigated* test, and why that
test is what to add if the gate ever moves.

**A `?view=overview` link is honored either way**, which is the courtesy
`view=league` already extends: the page works without a league — the standard
5×5 and no matchup block — and dropping somebody who was handed a link onto a
different page is the direction this app declines to fail in.

Driven from a bare URL with the status stubbed both ways:

| | lands on | tab lit | tabs drawn |
| --- | --- | --- | --- |
| league connected | `?view=overview` | Overview | Overview · Roster · Research · League |
| no league | `?` (unchanged) | Roster | Roster · Research |

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

**The list is of men who *played*, which is a filter the totals do not take.** A
man in the lineup whose club was idle contributes 0 to every counting category
and nothing at all to the rates, so counting him in the day's *figures* is right
and costs nothing — and ranking him is not: a score of exactly `+0.0` for having
done nothing sorts **above** a man who went 0-for-4, whose OPS contribution is
genuinely negative. Found at 4am ET the morning after this shipped, which is the
hour that makes it visible: the baseball day had rolled to a card with no games
played on it, and `TODAY` listed three men at `0-0` and `+0.0` under a category
line of noughts — where the block has a sentence for exactly that state and was
one empty list away from saying it. A **projected** block takes no such filter:
every line in it is a fraction of a game nobody has played.

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

**The caption that said so is gone, and the fact is in a `title`.** It printed
`board.leagueName` first and read as a non-sequitur under a list of players —
`THETA CHI. WHY NOT?` says nothing about how anybody was ranked — and then
`10 league categories`, which is true, is the same on all three cards, and is
the same on every card any reader will ever see, a league's categories not
changing. **A mark that would be on every row marks nothing**, and this one was
on nine of them. What it was for survives where a fact of that kind belongs: as
the `title` of the control it shares its row with (`Ranked over your league's 10
categories — R · HR · RBI · …`), and in this file, whose `STANDARD_5X5` note
covers the one reader who could get the answer wrong.

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

### The foot is one control, and it is drawn as one

`See the day →` was accent text at the right end of a row whose left end held
that caption, and both halves were wrong for the box. A bare accent phrase in
the corner of a card reads as a footnote rather than as the one thing in the
block you can press — and on a phone it was an 11px target in a card 320px wide.
The foot is now a single **outlined pill at the width of the card**, taking the
app's own `--control-radius` and border, measured **320 × 33** at 390. The arrow
went with the text styling: a bordered control does not need a glyph to say it
is pressable.

### A performer row takes no `:active` paint, which is a deliberate exception

The standing rule is that **`:active` and `:focus-visible` are never scoped** —
that rule is about *hover*, and it holds wherever a press and a scroll can be
told apart. Inside this carousel they cannot: the rows sit in a **horizontally
scrolling** row on a page that scrolls vertically, so a finger landing on a
player is the first frame of a swipe as often as it is a press. `:active`
matches for the whole of that swipe, and the row a reader is dragging past
lights up as though they had chosen it. Reported off the shipped page, in those
words.

Nothing the app promises is lost: `:focus-visible` still rings the row for a
keyboard, hover still tints it for a pointer (scoped to `(hover: hover)`, the
standing rule for a full-width row in a list), and what a touch press gets as
feedback is the player page opening. The app's own press discipline says the
same thing from the other side — *a press arms on `pointerdown` and decides on
release*, because a scroll begins with a `pointerdown` on whatever is under the
finger.

### The section has a heading of its own

The block had none: the three cards each name their day, so the section looked
like it was already saying what it was. As a **carousel** it is not — one card is
on screen and the other two are 22px of edge, so the page went from a labeled
block to an unlabeled one that happened to begin with the word `TODAY`. `Your
days` is the section's name where the card heads are the items', which is the
same split `Your matchup` makes above it.

**Its note is the span** (`Aug 24 – Aug 26`), which is the one fact a carousel
takes away: with only the middle card in view, nothing on screen says the row
reaches back to yesterday and on to tomorrow. Same shape as the matchup
heading's `through Aug 25` an inch above.

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

**Layout, driven at eight widths on the live league's ten categories.** Page-body
overflow is **0** at every one, the category lines never scroll inside
themselves at any of them, and the row opens centered on `TODAY` at every width
that scrolls.

| window | scrollport | card | scrollable | dots | row runs |
| --- | --- | --- | --- | --- | --- |
| 320 | 320 | 276 × 3 | yes | 3 | 0 → 320 |
| 390 | 390 | 346 × 3 | yes | 3 | 0 → 390 |
| 640 | 640 | 596 × 3 | yes | 3 | 0 → 640 |
| 768 | 768 | 724 × 3 | yes | 3 | 0 → 768 |
| 899 | 899 | 855 × 3 | yes | 3 | 0 → 899 |
| 900 | 856 | 277 × 3 | no | — | 22 → 878 |
| 1200 | 1120 | 365 × 3 | no | — | 40 → 1160 |
| 1920 | 1120 | 365 × 3 | no | — | 400 → 1520 |

The `row runs` column is the bleed doing its work: below 900 the scrollport is
the **window**, edge to edge, so the peek lands in the app's own gutters; above
it the row is back inside them. The cards are the same width they were when they
stacked at every one of the five scrolling widths.

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
| CSS | 178,368 → 182,679 | 31,919 → **32,692** |
| JS | 693,662 → 710,530 | 202,673 → **207,924** |

+773 bytes of CSS and +5.2KB of JS gzipped, for a view, a scoring module, a
measured constant table, the narrow-screen tab rule above, the carousel and the
opponent's half of the page — which costs no CSS at all, being the same
component drawn a second time.

### Presentation, and the two rules it leans on hardest

**No separator between the day and the tag.** `TODAY · ↗ PROJECTED` became
`TODAY ↗ PROJECTED`: the two are not two facts of equal weight with a dot to
hold them apart — `PROJECTED` *qualifies* `TODAY`, where the roster face's own
`SCHEDULE · WEEK 19` really is two. What holds them apart is 7px and the glyph,
which is what a qualifier gets.

**The two headings set the page's rhythm and are the only things that do.**
`Your matchup` sat hard against the chrome seam above it and read as a caption
on the bar rather than as the title of the block under it, so the view takes
10px of `padding-top`. And the gap under each heading is now the **same 8px**,
measured off the rendered page both ways — which took a *negative* margin under
`Your days`, that one being a direct child of the column flex and so already
carrying the container's own 18px where `.ov-matchup`'s heading carries only its
own. The value that looks smaller is the one that comes out even.

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
