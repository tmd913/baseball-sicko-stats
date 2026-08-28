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

**Bundle**, for the whole-page wait below: **711.34 → 711.76 KB** of JS
(210.21 → 210.36 gzipped) and **182.69 → 182.72 KB** of CSS (32.73 → 32.74
gzipped) — 0.42KB and 0.03KB raw, 0.16KB over the wire between them, for one
derived boolean, two latches, a gate and one `padding-top`.

#### And `See the day` is drawn on them now

*(This reverses the paragraph above it, which is left as written because what
changed is not the button.)*

That paragraph said: *the door it opens is the Roster view, which is yours — a
press promising somebody else's Tuesday and delivering your own would be worse
than no press at all*. Every word of it was true, and it was an argument about
the **destination** rather than about the card. The Roster view has an
`Opponent` switch now (**Client — the Roster view**, *This week's matchup, and
this week's opponent*), so the destination can be about him: the same table, the
same day, his players. The foot that could not be drawn is the foot this block
most wanted — a card that says his Tuesday came to 5 runs and two homers, with a
press that answers *which of his men*.

**The same button and the same `onSeeDay`; what differs is where it lands.**
`onSeeOppDay` is a prop of its own rather than a flag on the first one, because
the two are different destinations and the page that owns a destination is
`App.tsx`: one callback taking *whose* would put half a navigation decision in
the component that only knows which card was pressed. It is null where the app
cannot offer it, which is `myOpponent`'s own three-way absence — so the foot is
drawn on his cards exactly when there is a page behind it, and `onSeeDay`'s
nullability goes on doing the job it was written for.

**The door sets the switch in both directions**, which is the half that makes it
safe: `openOverviewDay(date, opponent)` writes `rosterOpp` rather than leaving
it, so a press on your own card clears it and a press on his sets it. A Tuesday
that arrived on the wrong roster because the switch happened to be lit is
precisely the fault the foot was withheld for.

**Its `title` names him rather than the categories.** On your own cards that
tooltip carries which set the ranking was made over, which is the more useful
fact there and is also on the `Top Performers` heading; here the useful fact is
*whose page this opens*. `seeDayTitle` is the one optional prop that goes down
to `DayBlock` for it, and it reads `Read Baldy's Bozos’ roster over this day` —
through `lib.ts::possessive`, because half this league's names end in an `s` and
`Baldy's Bozos’s` reads as a typo. That function was `LeagueTeam.tsx`'s own,
where it put a team name in a slot chip's title; it is in `lib.ts` now for
`wideRange`'s reason one function along — a second caller.

**Driven at 1200 on the live league.** Both carousels draw **three** feet each;
the reader's three read `See the day` with the categories in the tooltip, his
three read `See the day` with
`Read Baldy's Bozos’ roster over this day`. Pressing his `TODAY` foot lands on
`?preset=Today&view=summary&opp=1&roster=fantasy`, with the **Roster** tab
active, `Opponent` lit, the bar on `TODAY · Tue, Aug 25` and **28** of his rows
in the table.

### The card opens the Roster's reading, and stops marking itself

**Two changes to the one card at the head of this page**, and both come from the
same fact about it: it is the reader's **own** matchup and can never be
anybody else's.

**It opened the overlay and now opens the Roster view's `Matchup` reading** —
the identical `MatchupCard` off the identical board, in place of the roster
table (**Client — the Roster view**, *This week's matchup, and this week's
opponent*). The overlay is right where the reader has **picked** a subject: the
Scoreboard's cards and the Rankings' rows can name any of the league's ten, so a
page you come back from is the shape for it. This block is drawn on `mine`, so
there is one subject and the reader has picked nothing; covering the page to
show it was a popup for a card the app can simply *be* on. Driven: a press goes
to `?preset=Today&view=summary&rmup=1&roster=fantasy`, **Roster** active, the
card in the page and no `.mup-view` anywhere.

**A bye still opens the overlay**, which is a branch rather than an
inconsistency: a bye has a *page* — its own head over that manager's roster and
feed — and no *card*, a comparison of one team being the line this block already
draws. The Roster's reading is the card, so it does not offer one either, and
`myComparison` is the single test both sides read.

**And the card no longer marks itself as the reader's own.** `mineTag` is
`markMine` now and governs the accent border with the label. That prop already
suppressed the `Your matchup` tag here on the rule that *a mark which would be
on every row marks nothing*; what it left was the border, on the stated grounds
that it costs no space and carries the statement into a screenshot. Costing no
space is not the test — **marking one row among others** is, and on a page with
one card there are no others, so an accent border reads as a state the card is
*in* rather than as which card it is. Measured after: `class="lg-matchup"` with
no `lg-mine`, border `rgb(70, 65, 90)` (the plain `--border`), and no
`.lg-mine-tag` on the page. The Scoreboard's ten are untouched — they pass the
default.

### `Top Performers` sits off the category line

**The label was flush on the twenty figures above it.** Measured at 1200 on a
live card, the block's rhythm is 8px between every pair of children — head →
categories 8, list → foot 8 — and this one pair was **0**, so a heading whose
whole job is to say *what the three rows under it are* read as the last line of
the thing above it.

**14 above against the list's 8 below**, deliberately unequal: at 8/8 a label is
equidistant from the thing it names and the thing it does not. 14 is the app's
own second interval — the chrome's gap, `.app`'s own padding — rather than a
number invented for this card. Measured at 1200 and 390: gap above **0 → 14**,
gap below **8** unchanged and page-body overflow 0. The card grows by the 14 —
**354 → 368px at 1200**, and 370 at 390, where the carousel stretches its three
to one height and the tallest of them sets it.

**The rule was written three times and only the third one was doing anything.**
`.ov-perfs-head`'s six declarations appeared **twice** in the top-performers
section — byte-identical, each under its own copy of the same comment — and a
third time in the trending block, where `.trend-row-head` folded onto it by
restating them in a shared selector list. A later single-class rule wins on
source order, so `margin: 0` down there beat anything written up here: the top
margin was put in the first copy and **measured no change**, which is how the
duplication was found. The fold stands and is where the shape lives; the two
copies are gone, and the one thing that is this label's alone and not the rail's
— the gap — is declared immediately after it. It is the trap
`.date-row .date-presets` and the narrow-screen blocks already record, arrived at
from a third direction.

### The page arrives all at once, or not at all

**Nine reads answer over about a second, and the page used to draw each of them
the moment it had it.** From a chair that is not a page loading, it is a page
assembling itself: the matchup card lands and pushes the two headings below it
down; the three day cards swap their own waits for figures one at a time, each a
different height, resizing the carousel under a finger that may already be
dragging it; and then the board answers, `Their days` appears out of nothing and
the page grows by a second carousel.

Measured at 1200×900 on a warm local server, recording every distinct layout the
first load passes through:

| | `.overview-view` height | document height | day cards | headings | matchup | carousels |
| --- | --- | --- | --- | --- | --- | --- |
| | — | 900 | 0 | 0 | 0 | 0 |
| | **127** | 900 | 3 | 1 | 0 | 1 |
| | **798** | 957 | 6 | 2 | 1 | 2 |
| | **1004** | 1163 | 6 | 2 | 1 | 2 |
| | 1004 | **1200** | 6 | 2 | 1 | 2 |

**Five states and four reflows to reach one page** — and not one of the blocks
was doing anything wrong. Every one of them was keeping rule 2 correctly: a
block wait belongs where there is nothing to show yet, and each card
individually had nothing to show. **The unit was wrong.** Three cards of one
carousel are not three panes, and a heading that appears a beat after the block
it names was never one either.

So the body is gated on **all** of it — `App.tsx::overviewSettled` — and the
same measurement becomes three states and one:

| | `.overview-view` height | document height | day cards | headings | matchup | carousels |
| --- | --- | --- | --- | --- | --- | --- |
| | — | 900 | 0 | 0 | 0 | 0 |
| | 0 | 900 | 0 | 0 | 0 | 0 |
| | **1004** | **1200** | 6 | 2 | 1 | 2 |

**The question is only answerable in `App.tsx`**, which is why the view takes it
as a prop rather than working it out from the eight loading flags it already
holds. Those flags cannot say that four of them have not been *raised* yet — a
fantasy reader's own four wait on `espnStatusSettled`, and the opponent's four
wait on a board that lands later still — and *not started* and *finished* look
identical from outside: nothing in flight, nothing in hand. `ovFired` and
`ovOppFired` are the two latches that tell them apart, and `espnStatusSettled`
plus `scoreboard`-or-`scoreboardError` is the third term, for the block whose
absence is itself an answer.

**A dead upstream must not spin this page for ever**, which is the `scoreboardError`
half of that term and the app's own rule that a failure costs its own column and
never the request. Driven with `*scoreboard*` blocked at the network layer: the
page settles at **495ms** on **3 day cards, one heading, one carousel and no
matchup card** — the reader's own days standing, the two blocks that needed the
board absent rather than waited on. A failed *day* read settles the same way,
`loading` going false whether it answered or threw, and the card draws the empty
state it already had (`Nothing to report on — no roster is being read.`) —
drawing that is finishing, not failing to finish.

**And once drawn, never curtained again.** `overviewSettled` goes false on every
re-read, and two of those are ordinary: crossing to another tab and back
**unmounts and remounts** this view so its effects re-fire, and the clock rolling
on resume does the same. Both leave the last answers in `App.tsx`'s own state, so
a curtain over them would be rule 1 broken — a wait standing in front of data.
The latch is `ovDrawn` and it is held in `App.tsx` for exactly that reason: a
`useRef` in `OverviewView` is a *new* ref on every remount, which is the case it
would be needed for. Driven — settle, press `Research`, press `Overview` — the
page comes back in **one** state at its full 1004px with six cards and no wait
drawn at any point. The live tick never moves it at all, being quiet.

**The wait is the ball at `lg`, and this is the second place in the app that
takes 44px.** The other is the boot splash, and the reason is the same one that
document gives: this wait owns the entire view with nothing behind it to
protect, and at `md` a 28px ball with that much room around it reads as a pane
still arriving rather than as the page being read. It says `Reading your days`,
which is the app's empty-state rule applied to waits.

**`WAIT_DELAY` before the ball, and nothing before that.** It matters more here
than anywhere else in the app, because a gate this wide is one that a warm load
clears inside it: measured, the whole page settles at **226ms** warm, so the
common case draws no ball at all and goes straight from blank to page. The
*content* stays gated on `ready` itself and never on the delayed flag — gate it
on the delayed one and a fast load shows an empty page for a quarter of a second
instead of showing the page.

**The per-card waits stay and are not dead.** They are what a **re**-read draws:
a card whose day has rolled over on resume is a block with genuinely nothing in
it under headings that are already on screen, which is exactly the case `md` and
`LoadingBlock` were written for.

Geometry, measured at 1200×900 and 390×844 with the reads held open at 500ms
latency: the ball **44px**, four seams animating, the block **centered** (offset
0 from the view's own center) and its top **54px** below the pinned bar's border
edge at both widths, with 0 page-body overflow. **54 is the app's own number for
a wait sitting directly under the bar** — the block's own 40 plus the bar's 14 —
and here it arrives by *removing* a declaration rather than adding one:
`.overview-wait` zeroes the section's `padding-top`, which is air under the bar
for a heading and there is no heading. Measured: **64px** with the padding left
in, **54** without, and **68** for an earlier draft that declared the 54 itself
and stacked it on the bar's own 14. Settled, the class comes off and the section
is byte-for-byte what it was — `padding-top` back to 10px, first child 24px
below the seam.

### The `TODAY` card follows the day it is about

**Every other card on this page is settled** — yesterday is played, tomorrow is
an estimate — **and today is the one that moves.** Left alone it was the figure
the page happened to open on: a card opened at noon still read noon's line at
four, and the projection it had opened as never swapped for the result.

**The same twenty seconds the roster's own live poll uses** (`LIVE_POLL_MS`),
and the same gate: *a real game is under way*, read off the report already in
hand rather than off a clock. Nothing ticks in the morning before first pitch or
at midnight after the last out, which is what makes a poll on a page a reader
leaves open all evening affordable.

**The opponent's card rides the same tick**, for the reason the roster's
projection rides its own one view over: the two halves of this page are one
comparison, and a page where your afternoon updated and his did not would be two
different minutes read as a matchup.

**Quietly** — the loader takes a `quiet` flag the entry read does not pass, so a
re-read never puts a wait over a card that already has figures on it. And **the
swap out of the projected reading needs nothing of its own**: `todayStarted` is
derived from the report, so the first tick carrying a live game turns the
estimate into the result.

**Driven by flipping today's games to `live` in flight.** On load the card is
`TODAY` with no dashed border and no `PROJECTED` tag — it has left the estimate
— and no wait is drawn over it at any point; over the next 24 seconds the page
makes **three** further today-reads (this card, the opponent's, and the roster
report's own live poll, which is not this view's and was already there).

**It made a fourth empty state visible**, and the card had been wrong about it.
Between first pitch and the first plate appearance the games have started and
nobody has done anything, and `No games played yet.` is flatly untrue of that
stretch. The two facts are different and the card holds both — `games` counts
fixtures under way or over, `anyPlay` asks whether anything has happened in them
— so it now reads **`Games are under way — nothing on the board yet.`**

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

*(The last sentence is superseded: the prop is `markMine` and the border goes
with the label. See* The card opens the Roster's reading, and stops marking
itself *above, which is where the reversal is argued.)*

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

**A played row is a line and a projected row is the categories, and neither is a
phrase of this file's choosing.** That is the rule the four notes below arrive
at; the first two were a step towards it and are kept because they are still
what the batter's row does.

**A played pitcher's row is a pitching line, in a pitching line's order** —
`IP, H, R, ER, K, BB`, then his decision. It was `IP, K, ER, H, BB`: the
categories first and the line's own order nowhere. A **result** has a form every
reader of a box score already knows, and a manager reading `6.0 IP, 3 H, 0 R,
0 ER, 2 BB, 7 K` is not decoding it. **Every term, including the noughts**,
which reverses the note that stood here about dropping a term at zero: that rule
is right for a phrase and wrong for a line, `0 R, 0 ER` being the whole story of
a shutout and a silent omission leaving the reader counting commas. **`R` as
well as `ER`**, which a phrase had no room for and a line must have — they
differ exactly where an error has come into it. A **loss** is the one decision
that cannot be drawn: `PitchingLine` carries wins, saves and holds and no
losses. Measured on the live league: `5.0 IP, 5 H, 2 R, 2 ER, 5 K, 2 BB, W` and
`6.0 IP, 3 H, 1 R, 1 ER, 5 K, 0 BB, W`.

**A projected row is the league's own five categories, in the order the block
above it prints them.** It was a fixed phrase — `4.4 PA, 0.9 H, 0.7 R, 0.6 RBI`
— chosen for readability and answering a question nobody on this page is asking:
**plate appearances are not a category**, and neither are hits in a league that
scores OPS. The block is headed by five columns and the row under it is now
those five figures for this man, so the eye carries from `HR 1.7` on the team's
line to the `0.2 HR` that is his share of it. `categoryGroups` gives both the
set and the order — the same function the header row is drawn from, so the two
cannot disagree about which five or in what order, and a league scoring
something else gets its own five for free. **A count keeps one decimal and a
rate is formatted as itself**: `fmtValue` is right about `.842` and `2.91` and
wrong about a projected count, where it would print `0.943` off a figure that is
an expectation to a tenth at best. A category the line cannot produce is a dash,
not a nought. Measured: `0.7 R, 0.2 HR, 0.6 RBI, 0.2 SB, .842 OPS` on a batter
and `5.5 K, 0.4 W, 2.91 ERA, 1.10 WHIP` on a pitcher — each in its own block's
header order.

**And a projected pitcher gets one decision, not both.** He can earn a win or a
save-and-hold and never the pair, so a line offering him `0.4 W` *and*
`0.0 SVHD` was spending a term on a category he is not in. Which one is not a
guess: **the engine has already answered it in the credits it projected**, so
the credits lead — more saves and holds coming than wins is a man out of the
bullpen — and **innings break the tie**, at nine of them.

The tie-break is the half that had to be measured rather than assumed. On one
read of the live league's two rosters:

| | projected | called |
| --- | --- | --- |
| Walbert Ureña | `5.3 IP · 0.40 W · 0.00 SVHD` | starter, on the credits alone |
| **Ian Seymour** | `3.1 IP · 0.00 W · 0.00 SVHD` | **starter, on the innings** |
| Adrian Morejon | `0.5 IP · 0.10 W · 0.20 SVHD` | reliever, on the larger of the two |
| six others | `0.3–0.5 IP · 0.00 W · 0.10–0.30 SVHD` | relievers |

Seymour is why: a starter with no credit either way, whom `wins >= svhd` would
have called a starter *by accident* and `wins > svhd` would have called a
reliever outright. Driven in the page by dropping the batters from the
projection so the relievers rise into the top three — starters read
`5.5 K, 0.4 W, 2.91 ERA, 1.10 WHIP`, relievers read
`0.5 K, 3.86 ERA, 1.07 WHIP, 0.2 SVHD`, each keeping the block's order around
the term that was dropped.

**The two sets are stat ids rather than a test on `SVHD`**, so a league scoring
`SV` and `HD` separately — or scoring `L` — is covered by the same rule without
knowing about it.

**And the row under a *batter's* name is still a phrase, with two terms taken
out of it.** The row is there to answer *why is this man first today*, which is
narrower than *what happened in this game*:

- **No strikeouts on a batter's row.** A strikeout is part of what happened and
  is never why anybody led the day, so `3 K` sat in the middle of the best line
  on the roster. `lib.ts::lineSummary` takes a `strikeouts` option rather than
  growing a twin — the feed and the player card still print it, those being
  records rather than rankings, and one implementation cannot come to disagree
  with itself about how a double is spelled. Checked both ways: the default
  reads `2-4, 2 R, 2B, 3 RBI, SB, BB, 3 K, 1.350 OPS` and the Overview's reads
  the same line without the `3 K`.
- **And `5 BR` is gone from the pitcher's**, which was the step before that row
  became a line outright. It is the WHIP numerator and nothing a reader thinks
  in: five hits and no walks is a different outing from one hit and four, and
  the term was spending a word to hide which.

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


---

## The performer lists say what they are

`TOP PERFORMERS`, over the three rows on every day card. They were three named
rows under a category line with nothing between them, and the reading had to be
inferred from the shape — a rank, a face and a figure, which is a leaderboard
but not necessarily one *of* anything a reader could name. The card's head says
which day; this says what the rows under it are.

The heading carries the `title` that names which categories the ranking was made
over — the fact the `See the day` button used to hold. A caption spelling them
out was cut for being on every card; a *heading* that is on every card is where
a fact of that kind belongs.

**And the figure at the right end of every row says what it is.** `VALUE`, on
the same line as the heading and over the column it names. The rows carry a
rank, a face, a line and a number, and the number was the one column on the card
with nothing over it — the card's own category line above it labels every one of
*its* figures, so a bold `+1.4` beside a batting line with no heading read as
one more stat rather than as the thing the three rows are sorted by.

**It is the word the other three surfaces already use.** The roster lens and a
matchup team page print `Value`, the research lens `VAL`; one figure, four
surfaces, one word — which is the point of naming it here rather than
captioning it, a caption having to explain what a heading can just say. The
sentence it would have carried is the label's `title` instead.

**A sibling of the `h4`, not a second half of it.** The heading names the list,
and a column label is not part of that name: inside it, a screen reader
navigating headings would announce `Top Performers Value`. So the two sit in a
flex row that carries the 14px the label used to, and the label's shape folds
onto `.ov-perfs-head` rather than restating it.

Measured at 1400: the label's right edge **1247 → 1243px**, against the three
values' **1243** — the 4px is `.ov-perf`'s own row padding, not a nudge — and
351 against 351 on the same card at 390. **The card does not grow for it**, the
two labels being one line: 370px with the label and 370 with it hidden, and
page-body overflow 0 at both widths.

---

## Player Spotlight

The block at the foot of the page: **three side-scrolling rows of ten cards,
split by seat, every card a door into that player's page** — and a switch that
says which thirty men they are.

It was two sections stacked, `Trending Players` over `High Value Players`, and
that was the wrong shape for what they are: the same rows of the same cards,
ranked two ways. Stacked, the page ended in six seat headings and sixty cards,
and the reader had to hold *which rail am I in* the whole way down — where the
question is one question with two answers, which is what a switch is for.

It is the only block here that is not about the reader's own roster. Everything
above answers *how is my week going*; this answers *what should I do about it*,
from the two directions a manager weighs against each other:

- **Trending** — who the league has been picking up. The question the research
  board's `Ros%` and `Δ` columns exist for, read there by sorting six hundred
  rows and read here by looking.
- **High Value** — who the projection says is worth the most over the days this
  matchup has left. The same figure the board's `VAL` column prints under the
  projected lens, and the same arithmetic (`categoryValue.ts::dayValue`) the day
  cards rank their performers by.

The pair is the reading. A man on both is one the league has noticed *and* the
projection likes; a man on the second alone is the pickup nobody has got to yet,
which is the best card on the page.

**The note is the tab's, not the block's.** `Player Spotlight` says what the
section is and cannot say what the figure on the card means; the note beside it
does, and changes with the switch — `added most in the last 3 days` against
`most projected value through Sep 6`. So the heading never carries both and the
card never has to explain itself.

**Trending leads**, which is the order a manager reads the two in — *what has
everybody else decided* is the cheaper question — and it is also the earlier of
the two to land, the value rail waiting on two board reads. So the tab a reader
arrives on is the tab that is ready.

**In the URL as `spot=value`**, by the rule every other tab strip in this app
follows: which data a view shows belongs in the link. Absent means trending. A
`spot=value` that arrives before the value rail does — or on a matchup with no
days left, which has none — **falls back rather than emptying the view**: the
section picks the first tab it actually has.

### Three rows, split by seat

A manager streaming a starter and a manager chasing saves are two different
errands, and a mixed list makes each of them scan past the other's answers. It is
ESPN's own eligibility that says which — the same join the padlock and the slot
chip run on — so a swingman listed at both reads as a starter, which is what a
league that lets you start him there means by it. A pitcher ESPN cannot place
falls to `starter` on the trending rail and to the projected row's own
server-computed `starter` flag on the value rail, which is the one place the
second can do better than the first.

**Free agents only, on both.** A man being added in three thousand leagues is
news; a man being added in three thousand leagues *who is already on somebody's
roster in this one* is news the reader can do nothing whatever about — and half
the rail was that. The test is the research board's own: absent from `ownedIds`
is available, where present means rostered by anybody, the reader included. The
same sentence holds one step further on for the value rail: a rail of the best
players in baseball is a rail of men nobody can have.

Note what this does **not** filter on. `Ros%` is ESPN-wide and ownership is this
league, so a man at 45% across ESPN who nobody here has taken stays on the rail —
which is exactly the card worth drawing. Measured on the live league when the
filter went in: the three rows went from `Sogard · Adell · Raleigh` to
`Sogard · Lee · Gasper`, dropping the 80%-rostered catcher and keeping the 45%
second baseman, and all three rows still filled their ten.

**A null `ownedIds` draws nothing rather than everything.** The read has not
landed, and the board states the failure this avoids in as many words: the
alternative is a list that silently claims every player is available.

**Both need a connected league and say nothing without one.** Roster percentages
are ESPN's and so is the category list a value is scored over, so a reader with
no league has neither rail — absent rather than empty, the app's rule that a
section with nothing to say is not a section. So is a quiet morning on which
nobody moved.

The rails scroll sideways rather than wrapping: ten cards is two lines on a
desktop and five on a phone, and a block that changes height by three lines
between widths is a page that reads differently on every screen. They bleed
through the app's gutters so the rail reaches the glass, which is what says
*there is more of this*; `overscroll-behavior-x: none` in the one axis they
scroll, the app's standing rule.

### The card's figure is a small table

A trending card prints **three windows — `1D`, `3D`, `7D`** — where it printed
one. One figure was the wrong number to be alone with: a four-point move
overnight is a different player depending on whether the week behind it reads
`+4` or `+20`, and a single figure cannot tell them apart. Three spans read as a
shape — flat then sharp is a man who has just done something, a steady climb is a
man the league has been coming round to all week.

Three rather than five, because `15d` and `30d` answer *is he established*, which
is a question about the season and belongs beside a stat line you can sort.

**And they are drawn as a table** — a head row, a rule under it, the figures
below, two column rules and a border round the lot. Three numbers at one weight
in three equal tracks read as one long number before they read as three readings:
`+0.7 +1.1 +1.4` with nothing between them is a run the eye has to be told where
to cut. The rules are the whole of what says otherwise, and they are the
vocabulary every other table in this app already uses.

Three things about how it is built, each of which the obvious alternative gets
wrong:

- **The head rule is a grid item spanning `1 / -1`**, not a `border-bottom` on
  the labels. A border stops at the cell it is on, so it would come out as three
  segments with a break at each column rule; a spanning row crosses the gaps and
  is one line by construction. It carries `margin-inline: calc(-1 * var(--win-pad))`
  so it meets the box's border the way a table's does.
- **The column rules are absolutely positioned on the container**, not
  `border-left` on the tracks. A border there is drawn at the track's edge —
  the whole gap from the column before it and hard against the one after — and,
  box sizing being border-box, it takes a pixel out of a track that has none to
  give. It also could not run past the head rule, which is what makes the block
  look like a table rather than two blocks that happen to line up.
- **Their arithmetic is exact rather than `33%`.** An absolutely positioned
  element's `100%` is the *padding box*, so a track is
  `(100% − 2 × pad − 2 × gap) / 3` and the first gap's center is a pad plus a
  track plus half a gap along. `33.3%` misses it by a sixth of the gap plus the
  padding — a visible lean at this size.

A window with **no baseline is left off** and one whose player ESPN has no roster
% for is **null**; both draw an em dash, and neither is a nought. Those are
`rosterTrends`' own two absences, read here the way the board reads them. The
figures are **colored by direction**, off the board's own `formatTrend` and
`trendDirection` rather than a second copy of them, so the two cannot come to
disagree about the minus sign or about what a flat `0.0` looks like.

### The window is a switch, and the ranked column is marked

Printing three spans while ranking on the first is half an offer: *added most in
the last day* and *added most in the last week* are different lists of men, and
the second is the one a manager plans a week around. So the same three windows
are a second switch beside the first, and the rail is ranked on whichever is
pressed. Measured on the live league, the batters' row: `Sogard · Gasper · Lee ·
Tawa · Keaschall` on `1D`, `Sogard · Lee · Gasper · Tawa · Keaschall` on `3D`,
`Sogard · McNeil · Gasper · Lee · Flores Jr.` on `7D`.

**The ranked column is named on the card, not only on the switch.** Thirty cards
ordered by a figure that looks like the two beside it is a list whose order is a
puzzle; one brighter label answers it where the reader is looking. It marks
something precisely *because* it is one of three — the rule against a mark on
every row is about marks that distinguish nothing. A step in brightness rather
than a color: nothing is rising or falling about being the sorted column, and the
two colors under it already mean something else.

**`spotw=3` in the URL**, one day being the default and so writing nothing, and
scoped one step further in than `spot=`: a window on a link that opens the value
rail names a ranking nothing on screen is made of. It is **separate state from
the tab**, so a reader who picks `7D`, looks at the value rail and comes back
finds `7D` where they left it — a sub-selection inside a page is not a leaving.

**A window the ownership read has no baseline for falls back** to the first one
it does have, and the rail carries the window it *actually* used so the switch
marks that one. An empty rail under a pressed tab would read as *nobody moved*
rather than as *that span cannot be measured yet*. The switch offers only the
windows there are, and is not drawn at all when there is one — a control with one
live option marks nothing, the same rule that suppresses the kind tabs on a
watchlist of one kind. The rails' switch goes the same way when the value rail
has not landed.

Both switches sit in one wrapping row. Measured: the pair needs 324.3px
(180.4 + 8 + 135.9) and the app's 22px gutters leave 346 at 390 — one line on a
phone — against 276 at 320, where the second drops to a line of its own and the
row grows 36 → 80px. Wrapping rather than scrolling because both are *controls*:
a rail can be half off the screen and still say there is more of it, where half a
control off the screen is a reading the reader cannot reach.

### The rail reads two ways, and the switch says which

**The span undivided was the only reading for as long as there was one**, and it
is still the default and still the right one for the question a projected board
is usually opened for. What it cannot answer is the other one. *Who will give me
the most over these days* and *how good is he on a day he plays* are different
questions, the second is what a manager streaming one open day is asking, and a
rail that only ever answered the first was half an offer — the same sentence
*The window is a switch* makes about printing three spans and ranking on one.

So `Total | Per G` sits beside the rails' switch, exactly where the trending
rail's windows sit and drawn by the same component, and the rail is ranked on
whichever is pressed.

**It is a second list rather than a re-ordering at the margin**, which is the
test the windows' switch was held to. Measured on the live league over
2026-08-26 → 09-06, the batters' row: `Crow-Armstrong · Alonso · Witt Jr. ·
Alvarez · Ohtani` by the total and `Tolbert · Durbin · Bell · Ruiz · Hernández`
per appearance among the free agents the rail actually draws. On the starters'
row Gerrit Cole leads the total on three turns and is off the top eight per
turn.

**The card says which**, in the box's own label (`Value` / `Val/G`) as well as
in the note under the heading — the rule the ranked trend column already
follows, and for its reason: the reader is looking at the card rather than at
the control, and a bold signed number is not self-evidently one figure rather
than the other. **Two decimals per appearance against the total's one**, forced
rather than chosen: the whole live spread of the per-appearance figure inside a
seat is about 0.55–0.65 for batters, so one decimal prints seven of a top eight
as `0.6` and the order of the rail becomes a puzzle. The cell is the same width
either way — `+0.65` and `+13.8` are both five characters against a 35.33px
track.

**`spotv=avg` in the URL**, the total writing nothing, and scoped one step
further in than `spot=` exactly as `spotw=` is: a reading on a link that opens
the *trending* rail names a divisor nothing on screen is made of. Separate state
from the tab, so it survives a crossing of the switch — a sub-selection inside a
page is not a leaving.

**The switch is never suppressed**, where the other two are. That rule is that a
control with one live option marks nothing; this one always has exactly two, and
both are answerable off figures the rail is already built from.

#### A per-appearance figure needs a floor, and the first measurement of it was taken on the wrong population

**Under one projected appearance there is no figure** —
`projectedRowValuePerGame` is null, the rail drops the row, and the board's
`VAL/G` cell prints a dash.

The worry is the obvious one: a tiny denominator dividing a man to the top.
Measured over the **whole** board — 984 scored rows, 149 of them under a game —
it looked like a non-issue, the best thin row ranking **24th** among batters,
because the projection is *linear in chances* and `value / games` therefore
recovers a stable per-appearance rate at any count.

**That was an answer about a list nobody is shown.** The rail is **free agents
only**, and everybody good has been taken out of that pool. Re-measured over its
722 rows, **five of the batters' per-game top ten were under one game** and the
leader was Davis Wendzel at **0.1 G for a total of 0.0** — a card reading *he is
excellent when he plays, and he is not going to play*. The sweep:

| floor | under 1 G in the top ten | leader |
| --- | --- | --- |
| none | **5** | Wendzel **0.49** (0.1 G) |
| 0.5 | 4 | Tolbert 0.46 (7.3 G) |
| **1** | **0** | Tolbert 0.46 (7.3 G) |
| 2 | 0 | Tolbert 0.46 (7.3 G) |

**One is where the effect saturates and the last point that costs nothing**: the
batters' top ten is identical at 1 and 2, and the starters' row is untouched at
1 but loses Randy Vásquez — a legitimate single-turn starter at exactly 1.0 G —
at 1.5. The relievers' row has no row under 3.3 G and never moves.

**The floor is on the figure, not on the rail**, and that is the second thing
this section is a record of. Putting it in the rail alone was tried first and
broke the row-by-row match the `See more` door is held to: the rail read
`Tolbert · Durbin · Bell` and the board it opened read `Wendzel · Tolbert ·
Kingery`, because the board had no floor. One rule in one function makes the
rail, the column and the door agree by construction — verified after, both
reading `Tolbert · Durbin · Bell · Ruiz`.

And a dash is the honest cell rather than a hidden one: dividing by less than one
projected appearance does not produce a per-appearance figure, it produces his
rate with no appearance under it. The board already dashes `G` where there is
nothing to project rather than printing a `0` that claims a measurement.

### The value card is the same box with one column

The value rail's figure is drawn in **the same bordered table**, one column,
headed `VALUE`. That is what makes the two rails' cards the same height *by
construction* rather than by a `min-height` somebody measured once — so nothing
on the page moves when the switch is pressed. Measured: **167px on both tabs**,
the boxes 45px on both.

The one thing that differs is the size of the figure — 15px against the deltas'
11 — so both value rows carry a **declared `line-height: 18px`**. A line box
declared rather than derived is the same height whatever is in it. Declared
rather than measured because it is a number this stylesheet chooses; the
alternative is a height off a font the app does not pick, which is the thing that
rule warns against.

**And the box is as wide as its contents, not as wide as the card.** The trending
box is full width because it has three columns to divide and they have to line up
down the rail; one column stretched to the same 126px is a box with a figure
adrift in the middle of it, which is what the rail shipped as. `width: auto` with
a 72px floor — half the card, centered by the card's own `align-items` — and the
height is untouched, which is the whole point of the box being shared.

It also **names the figure**, which the day cards' own performer lists needed for
the same reason: a bold signed number beside a batting line is not self-evidently
a ranking.

**The figure is monochrome, where trending's is colored**, and the difference is
the app's rule rather than a taste: a move is a *state* — rising, falling — and
gets a color for it; a value is a ranking figure, already said by where the card
sits on the rail. It is drawn at `.ov-perf-val`'s own size and weight, one decimal
and always signed, so the one arithmetic reads as one figure on both blocks. Under
it, `11 G · 6% rostered`: what the figure is made of, then whether anybody else
has noticed.

### The card is 144px, and every pixel of the growth is accounted for

It was 116. Measured at 11px tabular, the widest cell on the live rail is `+13.8`
at **34.5px**, and a third of the old card's 98px of content was 30.7 — which it
does not fit at all. A track is now `(144 − 2 card border − 16 card padding − 2
box border − 2 × 3 box padding − 2 × 6 gap) / 3` = **35.33px**, and nothing on
any of the sixty cards overflows one or is ellipsized. Page-body overflow is 0 at
1400, 390 and 320.

**The club is the abbreviation.** `SeasonPlayer.team` is the full name — right in
a table cell and three characters too many on a card this wide: measured at 116,
every card on the rail ellipsized its second line and half of them lost the
position with it. The value rail needs no such lookup — a `ResearchRow` already
carries the abbreviation.

### What the value rail is drawn over, and what it costs

**The days the matchup has left** — today through the period's last day, and
today rather than tomorrow because a manager reading this at nine in the morning
has every one of today's games still to come. The server clamps a start behind
today forward on its own (`BoardProjection.start`), so a period under way needs
no arithmetic here beyond the max. **Past the end of the period the rail is
absent**: `matchupWindow.next` is deliberately not read for it, a projection of a
matchup that has not started being a different reading with a different heading —
the same decision the roster's Schedule view records about a `Next matchup` pill.
The note names the last day (`most projected value through Sep 6`) so the reader
never has to work out how far ahead the figure looks.

**The span undivided**, which is the reading a projected board is opened for: six
games of a good hitter outscore three of an equal one, and *who will give me the
most this week* is the question. It is therefore **not** comparable to a day
card's `+1.4`, which is one day, and the two notes say which each is.

**Two board reads, and no new endpoint.** It is `/api/research/projected` for
each kind over that span — the same request the research board's lens makes and
the same server cache behind it, which is this page's own rule kept: a
composition, not a data source. Measured against the running server, warm: **58KB
gzipped for the batters and 57 for the pitchers, both under 30ms**. A reader who
has opened the lens has already paid for it; one who has not is warming it for
himself.

**It is not on the boot gate.** `App` holds the frame behind the `Splash` until
the roster, the report and the league status have answered; a rail at the foot of
the page is not worth a page that waits for it. The block is absent until it
lands and then appears whole.

**A row with no value, and a row with no game, are not on it.**
`projectedRowValue` is null where the league scores nothing computable on his side
of the ball, and a rail ranked on a figure has nothing to say about a man without
one. `games` of nought is the same reading the lens's own `Games` column takes —
*there is nothing here to project*, which is not a measurement of zero.

**Built in `App`, drawn here.** Every input is App's and none is the view's: the
ownership read's trend windows, the roster percentages beside them, the season
roster for a name and a club, `teamById` for the abbreviation, ESPN's eligibility
for the seat, and the two projected boards. The view draws cards.

### And the last card in every row is a door into the board it is a top ten of

A rail is ten men off a board of six hundred, so it has always had an eleventh
answer it could not give: *and who else*. The research board is where that is
answered — the same population, the same free-agent cut, the same figure in a
column — and reaching it was **four presses**: the tab, the position pill, the
Columns dialog for the window the rail is ranked on, and the header to sort it.
`See more` is that, done.

**At the end of the row rather than in the heading**, which is where the
question is asked: a reader who wants more has scrolled the row to its end, and
a door at the far end is the one thing a scrolling row can offer that a heading
cannot — it is *found* by the gesture that produced the want. It is drawn once
per seat, so the door is about the row it is in.

**It is a `.trend-card` with two rules added**, not a link in the margin: it
sits in the flex row, takes the same 144px and the same border, and scrolls with
the ten ahead of it. What it has not got is a face, so the 46px circle a
headshot occupies is an arrow at that size — which is what keeps the card's
height and the baseline of the line under it the same as its neighbors' by
construction rather than by a measured floor (checked: **144 × 167 at 390**, the
player card beside it 167). The permanent accent tint is the same `color-mix`
every card in the row already uses on hover, held on, which says *pressable and
not one of these* without spending a hue.

#### What `openSpotlightBoard` sets, and what it deliberately does not

Six things, and each of them is *what the rail is* rather than a tidying-up:

- **The view and the reading** — `research`, on the player board rather than the
  clubs (`board=teams` is thirty rows and has no roster % at all), with the
  Schedule mode off, that mode replacing the stat columns with days.
- **The position pill**, off the seat the card was in: `batters`, `SP`, `RP`.
  It is what makes the board the *row* that was pressed rather than the block.
- **Free agents only** — which both rails are, and which the board's own default
  already is. **Set locally rather than through `setResearchInclude`, so nothing
  is written to the reader's record**: the door states a reading for this
  errand, and a saved preference changed by a press nobody made on the buttons
  that own it is the kind of quiet write this app declines to make.
  `researchIncludeTouched` goes up with it, or a late `/api/prefs` would put the
  reader's own set back over the top.
- **The lens and its span, on the value rail.** `VAL` exists only under the
  projected reading, and the span is `valueSpan` — the very days the rail was
  drawn over, so the board's figure is the card's figure rather than a second
  projection over a different week.
- **The sort**, on the rail's own column, descending: `trendKey(window)` for
  whichever window the switch is on, and for the value rail `projValue` or
  **`projValueRate`** depending on which way it is being read. The second is
  `DEFAULT_OFF`, so it is exactly the case the bullet below exists for — a rail
  ranked per appearance opening a board ordered by the total would be a press
  that looks like it did nothing.
- **That column made visible**, and this one is not cosmetic. **A sort naming a
  column the table has not got silently falls back to the board's default**
  (`ResearchTable::sortableKey`), and four of the five trend windows are
  `DEFAULT_OFF` — so a rail ranked on `1D` or `3D` would land on a board ordered
  by `Ros%` and look like the door had done nothing. `withColumn` puts it at its
  canonical place among whatever the reader has on, and `withProjectedColumn` is
  its twin against the lens's vocabulary. **Nothing is written where the column
  is already on**: an absent entry means *follow the defaults as they change*,
  and seeding it with a copy of today's would freeze that and make
  `isDefaultColumns` answer false for a set nobody had touched. In practice the
  door pins a list only for the four held-back windows.

**What it leaves alone is the reader's own work**: a search, a stat filter, a
`Starting` day set. Those are authored, they are on screen, and the count line
above the table says how many rows they left — where clearing them would be a
door destroying something to make room for itself. The paging is not authored
and does go back to the first page, off `freshResearchUi().shown` so the number
cannot come to disagree with the board opened cold.

#### Driven, and the two lists compared row by row

Pressed from the Batters row on `7D`, the rail and the board it opened read the
same top ten in the same order and with the same figures: **+14.1, +4.3, +3.9,
+3.8, +3.5, +3.5, +3.4, +3.0, +2.7, +2.2** — the one transposition is a tie at
`+3.5` the two sorts break differently — and the board then goes on where the
rail stopped, `+2.0` and `+1.8`. The URL is
`?view=research&pos=SP&cols=…rosterTrend3…` with `▼Δ3d` lit from the SP row on
`3D`, and the count line reads `284 of 626 pitchers`.

From the High Value row: `?view=research&bproj=1&start=2026-08-25&end=2026-09-06`
with `▼VAL` lit, and the top six matching the rail's cards figure for figure
(`+4.6, +4.3, +4.3, +4.2, +4.2, +4.1`). The `cols=` on that URL is the reader's
own saved projected set — verified by opening `?view=research&bproj=1` cold and
getting the identical list, which is the check that the door wrote no columns.

**The bundle**: JS **742,494 → 744,096** raw and **216,837 → 217,332** gzipped;
CSS **192,020 → 192,406** and **34,187 → 34,243**.

---

## `Rank all N` opens the whole day over the page

**Three rows is the card's own height and always was.** The note on `TOP_N` ends
*a fourth is one press away — the whole roster's day is the Roster view with the
date set to that day*, and that is true and it is the wrong press for this
question. The Roster view answers **what did each of my men do**: a wide table of
stat columns in roster order, on another view, with the date bar moved. *Who was
fourth* is this list with more of it — the same rows, the same arithmetic, the
same order — and asking it should not cost the reader the page they are on.

So every card with anything on it offers `Rank all 14`, and it opens the whole
day ranked in a popup.

**It costs no read.** `performers` is already the whole day — the card was
slicing it — so the dialog is free, and the filter and the sort are one
extracted function (`rankDay`), which is what makes the dialog's first three
rows the card's three rows *by construction*. That extraction is the whole of
the change to `DayBlock`: two copies of *who is on the board* are two copies
that will one day disagree.

**A popup rather than a taller card**, which is the app's answer wherever a
detail belongs to one thing on screen. The alternative was a card that grows,
and a 25-row block inside a scroll-snap row would put a vertical scroller inside
a horizontal one on a page that scrolls vertically as well — three scrolls under
one finger, which is precisely the geometry `touch-action` exists to arbitrate
and **cannot**, the two inner ones differing in neither place nor axis.

**And it is deliberately not in the URL.** *Which data a view shows belongs in
the link* is about what the page **is** — a view, a span, a lens, a subject
(`player=`, `team=`, `mup=`). This is a drill-down on one card of one row, opened
and closed inside a reading the URL already describes in full, and it is the same
shape as every other panel in this app that stays out of the query string: the
Columns dialog, the stat filter builder, `InfoKey`. *Two params must never mean
two things*, and a param for a box only ever reachable by a press on a card it
can be read from would have been the third `proj=`-shaped mistake this app has
recorded.

**The open list is held as *which* day of *which* row**, never as the rows
themselves: `TODAY`'s twenty-second tick rewrites its performers, and a dialog
holding the list it was opened with would go on printing the afternoon it opened
at while the card underneath moved on. Two characters of state (`{ day, opp }`)
also let **one** dialog serve both carousels rather than two that would have to
agree.

### The foot is two doors and the row is still one control wide

`.ov-day-foot` went from `display: block` to a grid of equal columns. With one
door that draws it at the width of the card **exactly as it did** — the argument
under `.ov-day-more` about a bordered pill at card width is untouched — and the
second door divides the row rather than stacking under it and growing every card
in the carousel by 41px. Measured: the card **370px at 390 and 1200,
unchanged**, the two pills **156px** each at 390 and **121px** each at 320,
neither clipped.

They are in this order deliberately: `Rank all` is more of what the reader is
already looking at and stays on the page, so it sits beside the list it extends;
`See the day` leaves for another view and goes last, which is where this app puts
a door out. The button is **absent where there is nothing to rank**, which is
every empty state — the same test the list itself takes.

### The dialog is a card, moved

**460px, where the app's dialog default is `min(720px, 100%)`.** At 720 a rank, a
26px face, a name and a signed number sit at the two ends of a line with four
inches of nothing between them, which reads as a table missing its columns rather
than as a list.

**The day's category totals are not in it, and they were.** The box opened with
the card's own `.lg-cats` line at the head, on the argument that a dialog opened
*out of* a card should read as more of that card rather than as a second opinion
about the day. That argument is about *continuity* and it was answering a
question nobody asked this box: the totals are on the card the press came from,
four lines up and still on the page behind it, and they are the same twenty
figures whichever day is open. What the box is for is the **list** — a ten-column
block above it put the first rank **150px down** a 460px box and, once the list
was scrolled, left a row of category labels sliced through the middle under the
fixed head. So the list starts at the top.

**The head is the name over the days, with the badge beside it.** It was one line
— `Baldy's Bozos — Aug 28 – Sep 6 ↗ PROJECTED` — and those are not three facts of
equal weight held apart by a dash: the name is *whose list this is*, the dates are
*what it is over*, and that is the lead-over-date relationship the day cards' own
heads already draw and draw the same way. The badge is `LeagueView`'s own
`TeamLogo` (which draws the app's baseball where a logo is missing or the URL is
dead, the ordinary case on a real league) and it is what makes the head legible at
a glance: a fantasy team name is chosen by its manager and half of them are jokes,
where the picture is what the reader already recognises off the scoreboard card at
the top of the page. **A dialog with no name has no second line and no badge** —
which is what your own day card passes, it being about you by construction.

**Both sides of both carousels wear the head now, and only a reader with no
league gets the bare form.** The sentence above is the *Matchup leaders* block's
rule read onto the day cards, where it does not hold: the rule it rests on — a
mark that would be on every row marks nothing — is about a mark **inside a
list**, and this is the head of a box. Two of these are opened one after the
other on this page (your card, then the opponent's), and the reading a manager is
making is *which of us*; a title that says whose list it is on only one of the
two makes the reader supply the other from memory, off a page where the crest is
the thing they already recognise. The block above the carousels had reached that
conclusion for its own two sides already, so this is the day cards catching up
rather than a new idea. Reported as: *"rank all" popup for my day card should
match that of my opponent*.

The gate is `myTeamId != null` and not `who` itself: with no league there is no
team, no crest, and no name worth printing (`myName`'s fallback is the literal
word `You`), and no opponent card to be told apart from — so that reader keeps
the subject alone on one line, which is the whole of what the old branch was
right about. Measured at 430px, your own card's dialog:
`Brian&Tom's Excellent Adventure` over `Today, Aug 28 ↗ PROJECTED`, one crest,
the list starting where it did.

**The label row sits in the body's own padding.** Measured off the rendered
dialog, `22 RANKED` / `VALUE` had **26px** above it and **18** below, against a
13px line — a label with more air round it than height, three times over. Neither
number was about this box: `.ov-perfs-head-row`'s 14px top margin exists because
on a **card** it separates the list from the category totals above it, and there
are no totals in here. The label takes the body's 12px above and **4px** below —
the gap between two rows of the list it heads, which is what a caption on a list
should be nearer to than to the head of the dialog. After: **26 → 12** above and
**18 → 14** below. The box itself does not move, being already against
`.app-dialog-box`'s `min(80dvh, 720px)` cap at 22 rows, so what the fourteen
pixels buy is a row and a half of list.

**The two sentences under the list are the part of the list that is missing**,
counted apart because they are different facts about a man and the app's rule is
that an empty state names its own cause: `14 more in the lineup had no game.` and
`1 more is unranked — your league scores nothing this table can compute on his
side of the ball.` A span says `did not play`, a day names the cause, and a
projected day says `have no game to play`.

### The value wears a chip, and the card deliberately does not

Every value in the dialog carries `columnRanks.tsx::rankFill`'s own `--rank-bg`
— red (`--strikeout`) at the top of the population, blue (`--walk`) at the
bottom, the plain `--panel-2` through the middle. One function, three surfaces:
the League rankings' badge and the research board's team reading draw the same
scale, and the tokens resolve per surface so the sheet owns the color and the
function owns the strength.

**Ranked across both rosters, not this one.** A list of your own men ranked
against your own men says only what the order already says; against the forty-odd
on the two rosters the chip answers what the block exists for — whether your ninth
best week beats his third. `pool` is that population, and the rank is the
**competition** convention (`1 + strictly better`, ties sharing the top) that
`columnRanks.tsx::rankOf` and `espn.ts::rankAll` already use.

**And the day cards stay monochrome**, which is the app's rule rather than an
inconsistency. *Color is spent on state, not on emphasis*: on a card of **three**
rows the order is the whole reading and a scale down three of them is the ranking
said twice. In a list of twenty-two ranked against forty-five the scale genuinely
*is* a reading the order cannot give — which is exactly the ground the League
rankings' badge is argued on.

**The chipped figure is 12px where a card's is 13**, which is the pill's own
doing: a chip is a box round the number, so at the card's size it stands taller
than the two-line identity beside it and the row's rhythm follows the box instead
of the man. A point down and the pill's outside edge sits where the bare number's
did — the same trade `.trend-win-val` makes inside its own box.

Driven at 1200 on the live league, the reader's own side: 22 rows, **22 chipped**,
`+2.8` at `srgb(0.487 0.306 0.272)` down through `+0.0` to `−0.6` at
`srgb(0.293 0.404 0.570)`, and the values still right-aligned to the `VALUE`
label to the pixel.

---

## Matchup leaders

**The block under `Their days`: who has actually won the week, both sides, as two
cards.**

It is the question the two blocks above it leave open. The card at the top of the
page says you are down five categories to four; the day cards say how Tuesday
went. Neither says **which men** did it over the days the scoreboard is scoring —
which is the thing a manager asks next, about their own roster and about the one
they are playing.

Driven on the live league (period 20, Aug 24 – Sep 6, five days played):
`Brian&Tom's Excellent Adventure` **🥵 5 😐 10 🥶 7**, `Sale +2.8`, `Turang +1.7`,
`Stewart +1.6`, `Rank all 22`; against `Baldy's Bozos` **🥵 9 😐 7 🥶 5**,
`Alonso +4.3`, `Langford +2.9`, `Rodríguez +2.9`, `Rank all 21`.

### It is one read apiece, and it is on the settle gate

`/api/report` over the matchup span, once for each manager — a **span** read
rather than a day read, and one apiece rather than one a day, because that route
answers a range with every game's own date on it and a `lineups` map keyed by
date. So the view can score each day against the lineup that was actually set for
it and add the days up.

Measured against the running server over the five played days: **395ms cold and
11–24ms warm**, 888KB and 874KB uncompressed. It is the heaviest read this page
makes and it is made twice — and both are on `overviewSettled`, with the
opponent's four, because the block is a heading and a card and *a heading that
appears a beat after the page it belongs to* is precisely the reflow that gate
exists to prevent. `ovSpanFired` goes up even where there is no span, so a dead
matchup-window read settles rather than spinning.

**Its own effect**, because its deps are not the opponent's four: those wait on a
board with a two-sided matchup, these wait on that *and* on `matchupSpan`, which
comes off `/api/espn/matchup-window`. Folded together, a window landing second
would have re-fired four day reads for nothing.

**`matchupSpan`** — the period clamped to today, which is what *so far* means and
is the same span the roster's `Matchup` preset takes, so the block and that table
cannot come to disagree about which days the week has had.

### The value is the sum of his days, and it is one call

`spanPerformer` cuts by the lineup **that was set for each day**, one day at a
time, which is the whole reason it is a loop: ESPN banks a man only on the periods
he held a starting slot for, and a week's lineup is seven different lineups. A day
he did not play adds nothing and is not in the line, so the row under his name is
*what he did while started*.

**The value, though, is one `dayValue` on the summed line — and it is the sum of
his days by arithmetic rather than by luck.** Every contribution is linear in the
counts: a counting category is his count, and a rate category is *numerator above
baseline* (`H − lgAVG × AB`, `lgERA × IP / 9 − ER`), which sums over days to the
same expression on the totals. Written as a per-day loop first and checked against
the shortcut; the two agreed to the last place, which is what says the shortcut is
one. So `+5.0` here means the same thing about a player-day as `+1.0` does on a
day card.

### Each side is a card, and there is no card around them

They were two columns of **one** box with a rule between them, which is the mark a
day card's `BATTERS` and `PITCHERS` blocks take — the right mark for *two parts of
one thing*. These are not two parts of one thing: they are two rosters belonging
to two managers, and the reading is the comparison. A rule says *and*; two cards
say *against*.

*(Both were then put inside a parent card, and the parent came out again. It
bought nothing the section heading was not already buying — a heading is what says
where a block begins on this page — and it cost a second border and a second
ground around two boxes that are the same two boxes without it. It is also what
had forced the sides onto `--panel-2`: a card on a card needs a different ground,
and two cards on the page do not.)*

So a side is `.ov-day`'s own surface, and not folded onto that selector: half of
what `.ov-day` is is `flex: 0 0 100%` and `scroll-snap-align`, which belong to a
carousel item and not to this.

**Two across from 720, and 720 is measured from the other direction.** It was
declared at 620 and the measurement moved it. The number that decides is not where
two columns *fit*, it is where a column is wide enough to hold a performer row —
and the app's own floor for that is **276px**, a day card at a 320px window, the
narrowest that row is drawn anywhere else in the app.

| window | card | content | the six lines |
| --- | --- | --- | --- |
| 620 | 282 | **256** | 26px apiece — every one wrapped |
| 719 (one column) | 675 | 649 | 13px apiece |
| 720 | 332 | **306** | 13, 13, 13, 26, 26, 13 |
| 1200 | 554 | 528 | 13px apiece |

Two columns *narrower than the one they replaced* is the layout getting worse at a
breakpoint, which is the fault; a wrap at 306 is not — `.ov-perf-line` wraps
rather than clipping and two lines is its documented worst case at every width.
The two doors are the same width at every one of them (302/302 at 390, 306/306 at
720, 528/528 at 1200), and page-body overflow is 0.

*(An earlier draft put the trough between the columns in `padding` rather than
`gap`, so a divider drawn on the second side could sit near the middle of it
without making that side's content box narrower than the first's — measured,
`Rank all` came out **536px against 513px** at 1200, two identical controls
visibly different sizes. Two cards need no divider, so the trough is the grid's
own `gap` and the tracks are equal by construction.)*

### Read downward: whose, the three, the shape of the rest, the door

**The crest and the manager's name, on a line of their own.** The name shared the
`Value` label's row for a build and is not a column heading — it is what the whole
side *is*, and half this league's names are long enough
(`Brian&Tom's Excellent Adventure`) to crowd anything beside them in a 300px
column. The crest is `LeagueView`'s own `TeamLogo`, at 22×17 rather than the
League table's 34×26 (the two variables that size it come down with the type, the
split that shape was built with), and it is the same pairing the scoreboard card
above and the ranked dialog's head both make: a fantasy team name is chosen by its
manager and half of them are jokes, where the picture is what the reader already
recognises.

**Then `TOP PERFORMERS` and `VALUE`, which is exactly what a day card draws.** The
heat counts held this row for a build, and what belongs on it is what belongs on
it everywhere else in this app: the name of the list and the name of the column
its numbers are in. A block that draws the identical three rows under a
*different* caption is a block a reader has to check is the same thing.
`Top Performers` is a **span** rather than the day cards' `h4` — a fact about this
card, not about the label: the heading of a side here is the manager's name one
line up, and a second `h4` under it would have a screen reader announce two
headings for one list.

**Then the three rows, then the heat counts, then the door.** The counts moved to
the foot because the head of a list is where you say what the list *is*, and they
are not about the list — they are about the population it was cut from, which is
what the control immediately under them opens. **Centered**, being the only row on
the card that belongs to the whole of it rather than to a column of it: flush left
under three right-aligned figures it read as a fourth row of the list. It carries
the `margin-top: auto` the foot used to, so a short side still puts its last two
rows at the bottom — two `auto` margins in one column would split the slack and
put a gap between a row and the door it belongs to.

Measured after the move, at 320 / 390 / 720 / 1200: the badge row centered to the
pixel, the door **0px** under it (the foot's own 10px of padding is the gap), the
two sides one height at every width the two-up layout draws, and page-body
overflow 0.

**A badge's own padding was too tight on the thing inside it**, and reported as
such. `1px 9px 1px 7px` round a 20px glyph on a 20px line box is a **24px** pill
with the emoji's ink all but touching the border top and bottom, and 5px between
it and the count it labels. An emoji is not a letterform — it fills its em box
where a digit sits well inside one — so the padding that reads as comfortable
round `5` reads as cramped round `🥵`. It is `4px 12px 4px 10px` with an 8px gap:
measured at 1400, the badge goes **24 → 30px tall and 51.8 → 60.8 wide** and the
leaders card **270 → 276**, six pixels on a card whose height is not a row of
anything. The horizontal asymmetry moves with the rest (10 left, 12 right), the
glyph carrying its own side bearing where the count has none.

**30px is the app's own control height**, which is what decides between 28 and
30: these are *doors*, each opening its own cut of the ranked list, and the
header's gear, a dialog's ✕ and the saved-things row's four icon buttons are all
30. And it costs no width where width is scarce — at 390 the three badges and
their two 6px gaps are **194.4px in a 320px row**, `scrollWidth` equal to
`clientWidth` and document overflow 0, so the phone has 125px spare. The row gap
stays at 6: the complaint was about the space *inside* a badge, and three boxes
6px apart already read as three.

### Hot, neutral and cold — two measured pairs of cuts

**The reading is value *per appearance*, not the total.** A total says who has
given the most, which is what the three rows already say; *hot* is a question
about form, and a man who has played six days and one who has played two are not
comparable until the days are divided out. `line.games` is the divisor on both
readings — days started and played on the summary side, days the engine would
start him on the projected one.

**Played: `+0.50` and `0`.** Measured over both rosters (43 men who had played,
5 days): min **−0.52**, p25 **−0.04**, median **+0.14**, p75 **+0.61**, max
**+2.80**, mean **+0.35**. Strongly right-skewed, and it floors near −0.5 — a fact
about the arithmetic rather than about the week, every counting category
contributing zero or more, so the only way down is a rate below the league's and
the only way up has no ceiling.

| cuts | hot / neutral / cold |
| --- | --- |
| ±0.50 (symmetric) | 14 / 28 / **1** |
| **+0.50 / 0** | **14 / 17 / 12** |

A category that fires once in forty-three is not a category. At `+0.5 / 0` the two
sides read 5/10/7 against 9/7/5, which is the shape of a matchup one manager is
winning.

**Projected: `+0.70` and `+0.35`, and both are positive**, because a projection is
an *expectation* and there is no such thing as a negative one. Measured over the
same two rosters across the ten days the period had left (45 men with an
appearance projected): min **+0.135**, p25 **+0.326**, median **+0.451**, p75
**+0.706**, max **+1.409**, mean **+0.528**. The played cuts applied here give
**cold = 0 on both sides** — the very fault the asymmetry above was chosen to
avoid, arrived at from the other end. At `0.70 / 0.35` it is **12 / 19 / 14**, the
two cuts sitting at that distribution's own quartiles.

So *hot* means the same **kind** of thing on both readings — near the top of what
this population does per appearance — and deliberately not the same number, the
two populations having different floors. The switch says which reading is in force
and the heading's note says over which days.

**The three add up to the door's own count**, both being the men the block ranks,
which is what lets the row read as a breakdown rather than as three unrelated
figures. **A count of nought is drawn and dimmed rather than dropped**, for the
same reason: a row that lost a cell would be read as a different set of counts.

**The glyphs are emoji, and this is the only place in the app they appear.** A hot
face (🥵), a neutral one (😐) and a cold one (🥶) say it in a way three words at 11px
in a 300px column do not, and this row has to survive being glanced at rather than
read. Each cell carries its own `title` and the row an `aria-label`, so nothing is
said by the picture alone.

**Each count is a badge of its own**, where the three were three pairs a 12px gap
apart on a bare line: two glyphs and two digits with nothing round them read as
one run the eye has to be told where to cut — the same fault the trending card's
three windows record, and the same fix one step simpler (a box each rather than
rules between them, three being few enough that a box is cheaper than a table).
`--panel-2` inside a `--border`, fully round — the shape this app reserves for a
thing you read, and the same two tokens the ranked dialog's chip resolves to at
the middle of its scale, so a badge on this page means one thing whichever block
it is on. **Deliberately not tinted**: the emoji is already carrying hot and cold,
and painting the box behind it would be the same statement made twice.

**The count is 13px against the glyph's 16 and the `VALUE` label's 11.** It was
14, where the number and the mark carried equal weight and the badge read as a
*pair* — what it is is a mark with a number on it.

### And each badge is a door onto its own three

The foot under them opens the whole list, and the counts were the one thing on the
card that named a group the reader could not then look at — *nine of them are hot*
with no way to ask *which nine*. So a badge is a button, and it opens the same
`RankedDialog` with the same rows in the same order, cut to the men it counts.

**It is free.** `heatOf` is already computing the answer to draw the number, so
the cut and the count cannot come to disagree — the same guarantee `rankDay` gives
the card's three rows and the whole list.

**The label over the rows says which cut is open, in the badge's own words**:
`🥵 5 hot` where a whole list says `22 ranked`. The glyph is what the reader
pressed, so it is what says where they are.

**The chips do not change with the cut.** The scale is the whole matchup's — every
value on both rosters — so a hot man's chip is the same red among the five as
among the forty-five, which is what makes this a *filter* rather than a second
ranking.

**The two sentences under the list do not draw on a cut**, being about the whole
population: `14 more in the lineup had no game` under a list of five hot men is a
sentence about a list nobody is looking at.

**A count of nought does not press.** There is nothing behind it, and a control
that opens an empty list is worse than a figure that is plainly a nought — the
same rule as a switch with one live option. Driven: the hot badge on the reader's
own side opens `🥵 5 hot` with five chipped rows and no tail, and the cold badge on
the opponent's opens `🥶 5 cold` under his name.

**And a man with nothing projected is not on the projected list.** `rankDay`
deliberately skips the played-men filter for a projected block — a projected *day*
is a fraction of one game — but over a whole span *no appearances at all* is an
honest absence (`ProjectedPlayerLine.chances` of nought: a club with no game left,
a starter whose turn does not fall in the span, a man the plan benches
throughout). Left in, five of them sat at the foot of the list at `+0.0` and,
worse, counted as **cold** — a reading about form made about somebody who is not
going to play.

### The switch: `Summary` and `Projected`

Two readings of one question rather than two blocks: *who is winning me this week*
and *who is going to*. A manager reads the second against the first — a cold
roster with a good week ahead is a different Wednesday from a cold roster with
three off-days.

- **`.view-switch` outright**, the app's own switch and the same one the
  spotlight's two readings take.
- **In the heading, beside the note rather than at the far end of the line.** It
  was pushed right with `margin-inline-start: auto`, which is what this stylesheet
  does with a control that has a *row* to itself; this one has a heading beside
  it, and with two headings and two carousels above, a control at the opposite end
  of the line makes the eye travel the width of the page to find out what it
  switches. Beside the note the three read as one phrase: what the block is, over
  which days, on which reading. Measured: the switch at **x = 237** inside a
  1120px heading at 720 and 1200, and on a second line of its own at 320 and 390
  (heading 57px against 36), where the row wraps.
- **The note changes with it** — `Aug 24 – Aug 28` against `through Sep 6` —
  because it is a different set of days and `+5.0` means nothing until you know
  how many.
- **The cards go dashed**, which is the app's standing rule that an estimate never
  wears the same clothes as a measurement.
- **Offered only where there is something behind both sides of it**: past the end
  of a period there are no days left, and a control with one live option marks
  nothing.

**`lead=proj` in the URL**, the summary writing nothing — a lens changes what the
numbers are, so a link that carries it describes a different card. A **fourth**
name rather than a reuse of `proj`, `rproj` or `rankproj`, none of which means
this. **And it goes off with the page**, beside those three: a projected reading is
a press about the page it was made on, and a page opens measured unless a link
says otherwise. Driven — press `Projected`, cross to `Roster`, come back — the URL
returns to `?view=overview` with `Summary` lit.

**Its reads are made on the first press and kept**, which is the League page's own
rule for a tab and this page's own rule for itself: one `/api/projection/roster`
apiece over **`valueSpan`** — deliberately the spotlight's own span, so the two
forward-looking blocks on this page look at the same days. A reader who never
presses the switch pays nothing; one who crosses back and forth does not pay
twice. Keyed rather than latched, so the day rolling over or the week stepping to
another opponent re-reads and a re-entry does not, and the answers stay on screen
until the new ones land.

**The projected mark is on the two cards, not on the box holding them** — which
this shipped wrong for one build: the container kept the `is-proj` class after its
own border was taken away, and `border-style` with no width resolves to the
initial `medium`, so the projected reading drew a **3px** dashed rectangle round a
group of two solid cards.

### A projected figure is drawn at full strength, and it used to be muted

The rule that stood was: *a projected figure is muted where a measured one is not
— a second mark inside a block the dashed border has already marked, and worth
it, the category line being the one row a reader's eye crosses between the three
blocks*. The reasoning about the **mark** is still right, and it is why the dashed
border and the `PROJECTED` tag stay.

What it did not weigh is what the second mark costs the figure it is made on.
`--muted` on a 15px tabular number is a number you have to look at twice, and it
was reported off the shipped page in exactly those words — **hard to read**. The
worst case was the one the ranked dialog then made: a muted value sitting on a
`--rank-bg` chip is two washes over one number.

The app's rule is that an estimate never wears the same clothes as a measurement,
and it does not: the whole block is dashed and the head says `PROJECTED`. Neither
of those is paid for in legibility, which is what makes them the right marks and
this the wrong one. **A mark must not be paid for in the readability of the thing
it marks** — the same trade this file already makes when it says a broken border
rather than a hue is what says *ours*. `.ov-cat-val.is-proj` and
`.ov-perf-val.is-proj` are `--text` now.

### Absent rather than empty

On every way it can have no subject — no league, no matchup, a bye, no matchup
window, or a read that failed — which is the same three-way absence `Their days`
above it already takes plus the two reads' own. A heading over a message saying
there is nothing to compare is chrome for a week that has not got one.

---

## The row that reached the whole matchup, and why it does not any more

**`Your days` was extended to a card a day across the whole matchup period, and it
was pulled back to the three.** It is recorded because the machinery was real and
measured, and because the reason it came out is a fact about the page rather than
about the code.

It worked: fourteen cards on the live period, fourteen dots (190px of the 276 a
320px window leaves), the three named days wherever they fell, opening on today at
every width, an `is-span` class that kept the row a carousel above 900 with each
card at a third of the row so the desktop layout at *three* cards was unchanged by
construction. The reads were two shapes — one `/api/report` for the whole played
half (a span answers with each game's own date and a lineup per date) and one
projection **each** for the unplayed one (the engine hands back a span total with
no per-day breakdown) — both lazy, off the settle gate, with a 200ms `READ_SETTLE`
after a flick was measured asking for **nine projections to look at one day**.

**What it got wrong was the offer, not the drawing.** Fourteen cards is a
fortnight to swipe through to reach the two a manager opens this page for, eleven
of them estimates, and the days *behind* today are a fact the `Matchup leaders`
block now states in two cards without any swiping at all. The forward half was
worse: a projection of a day nine days out is an estimate of an estimate, and this
app already has two surfaces for the days ahead that say so in their headings.

So the row is yesterday, today and tomorrow again — and the two things the
experiment left behind are the ones worth keeping: the `Rank all N` door on every
card, and a block that answers *what has this week come to* without a carousel at
all.

---

## The Spotlight's note fits on the heading's line

**`Player Spotlight` and a note, and the note was dropping to a second line.**
`.ov-heading` is a wrapping flex row, so a note too long for what is left of the
line takes one of its own and the switches below it move down. Reported off the
shipped page on the value rail's **per-game** reading, which was the longest of
the five.

Measured in the heading's own type (11px/700): the words `PLAYER SPOTLIGHT` are
**126px** and the gap is 8, so a note's budget is the line less 134 —

| window | line | budget |
| --- | --- | --- |
| 320 | 276 | **142** |
| 350 | 306 | 172 |
| 375 | 331 | **197** |
| 390 | 346 | 212 |

— against notes of 153, 170, 169, **207** and **264**. So both value notes wrapped
at 375 and the per-game one still wrapped at 390; at 320 all five did.

The five, before → after, measured on the live league (period ending `Sep 6`; a
two-digit day is about 7px more):

| note | was | is |
| --- | --- | --- |
| trending, 1 day | `added most in the last day` 153 | `added most, last day` **121** |
| trending, 3 days | 170 | `added most, last 3 days` **138** |
| trending, 7 days | 169 | **137** |
| value, total | `most projected value through Sep 6` 207 | `projected value to Sep 6` **141** |
| value, per game | `most projected value per game through Sep 6` 264 | `projected value/game to Sep 6` **176** |

Driven at 320 / 350 / 375 / 390 / 430 / 1200 after: **nothing wraps from 375 up**,
and the three trending notes fit at 320.

Each cut is a word doing a job something else already does:

- **`most` goes** — the rail is *ordered* by the figure, and a list whose first
  row is the largest does not need to say so.
- **`through` → `to`** loses a shade of inclusivity and keeps the fact the note is
  for, which is how far ahead the figure looks. The tab's `title` still spells the
  whole sentence out.
- **`per game` → `/game`** is the card's own box label (`Val/G`) read out loud.

**What was not done is shortening it further.** Below 375 the per-game note is
still over budget, and there is no wording for it that is not a telegram: at 320
the budget is 142px, about **23 characters** of this type. That is the width at
which every one of these notes wrapped before, and the width at which this page's
own tab strip already drops a point of type to fit five words.

**And the reading is still named**, which is the constraint the wording had to
keep: `Total` and `Per G` are different lists of men, so a note that read the same
on both would be claiming they are one reading. It is said three times over — on
the switch, on every card's own box label, and here.

**The bundle**, against the commit this replaced (which carried the period-long
row): JS **778,270 → 782,830** raw and **229,050 → 230,100** gzipped; CSS
**204,640 → 206,420** and **36,180 → 36,460**.
