### Rankings

Split out of `client-league.md`, which holds the view this tab sits in. Every
team against every category the league scores, over a span the reader picks,
with each figure's standing under it — the table, its three summary columns, the
rank badge that colors it, and the press that opens a team's matchup.

**Each cell carries the rank under the figure, and carries the figure**, because
a rank with no number behind it cannot be acted on: `1st` is what you are looking
for and `12th` is what you are looking for, and the value is what you do about
it. The badge is **`.col-rank`**, the research board's own percentile badge,
folded onto rather than restyled — a second line under a number is one object in
this app.

**First place is marked and nothing else is**, which is the scoreboard's rule
arriving here rather than a new one: the winning side of a category is green and
the loser goes quiet, because ten red cells down one side of a card would be the
row shouting where the job is to mark a winner. A twelve-row table of ranks is
that same picture turned on its side.

### Three summary columns: `OVR`, then `BAT` and `PIT`

**Each side of the ball gets one column — `BAT` and `PIT` — carrying that
team's roto points over the side's categories with its rank under them, like
every category beside it, and `OVR` leads them with the same figure over every
category at once.**

**`OVR` is `BAT` + `PIT`**, by construction rather than coincidence (one
function, two lists of categories — see **ESPN fantasy league**), and it leads
them for that reason: the three read as a summary and its two parts rather than
as three peers, and a reader can check the derived figure by adding the two
columns beside it. It is drawn only where there is more than one side to
combine — the server declines to compute it otherwise, and the client reads that
decision rather than repeating the test. **It takes no color of its own**, which is a reversal: it
had the accent for a round, on the argument that the summary of a row should be
a shade louder than the two halves it is made of. That lost to the rule this
table already states at length — **color here is the rank badge's**, a
red-to-blue scale over twelve teams, and it is the one thing on the page
carrying meaning in hue. An accent column beside it is a second color system in
the same row, saying *this column is important* where everything else colored
is saying *this figure is good*. What marks `OVR` is where it sits and the
weight `.lg-side-col` gives all three summary columns, which is what a summary
needs. Measured after: the `OVR` cell computes `rgb(232, 238, 252)` at weight
800 — identical to `BAT` beside it, against a category cell's 600 — while its
badge still carries the scale.
 It is the question a column of ten ranks cannot
answer at a glance: a manager reading `2nd · 5th · 1st · 9th · 3rd` down his
batting run is doing arithmetic in his head. Where the number comes from, why it
is points rather than a mean of ranks, and what a tie does to it is in **ESPN
fantasy league**, *One column per side of the ball*.

**It leads its group rather than trailing it.** A totals column usually trails,
and here it is what the run under it *comes to* — read left to right, the
summary introduces the five columns that make it. It also puts the two overalls
at fixed positions, one straight after the name and one straight after the
batting run, so a reader finds them without counting columns.

**`BAT` and `PIT` rather than `Batting` and `Pitching`**, because the header row
reads `R · HR · RBI · SB · OPS` and a word among them would be the one column
shouting. What the abbreviation cannot say, the header's own `title` does
(`Batters · overall — points from all 5 batting categories, current matchup`),
which is the same job that row's titles already do for `H` and `K` on a league
scoring both sides. A stat id `STAT_META` has never been read against falls into
its own `other` group and is headed `OTH` — the same honesty the group ordering
already has.

**It is set a shade stronger than the columns it totals** (`.lg-side-col` —
`--text` at weight 800 against the categories' 600) and takes **no rule down its
left edge**. A hairline between two runs is exactly what this table removed when
the spanning `BATTERS` / `PITCHERS` header row went, on the grounds that a bare
seam says there is a break here without saying what is on either side of it;
reintroducing one for the same two runs would be that argument lost by default.

**And they are the one thing on this table that needs a key**, which is why the
caption line above the table carries an ⓘ. Every other column is a figure and
its standing, and both explain themselves; `OVR`, `BAT` and `PIT` are a figure
the app *made up* out of the ranks beside them, and a number nobody can derive by
looking at the page is a number that has to be explained somewhere. It is the
app's own `InfoKey` — the same disclosure the Splits tab and the Charts tab open
— rather than a paragraph under the strip, for that component's stated reason: a
key is read once and is in the way ever after.

**It is written from the league rather than about one.** The team count and the
category counts come off the rankings themselves, so a twelve-team 5×5 reads
*"1st of 12 is worth 12"* and *"the 5 categories on that side"*, and its `OVR`
sentence closes on *"120 is first in all 10 and 10 is last in all of them"* —
where an eight-team league reads its own numbers. A worked example in the
reader's own figures beats a formula, and it costs one pass over data already in
hand. **`OVR` gets a sentence of its own and it is the one worth having**: that
it is `BAT` + `PIT`, which is what makes a derived figure checkable against the
page. The tie rule is the last paragraph, being the one thing the table cannot
show: *a tie takes the better points, exactly as it shares a rank*. Where a
league has only one side the `OVR` sentence is replaced by the plain
first-and-last one, there being no column to explain.

**The panel is anchored to the caption row, not to its button**, which is
`.roll-key`'s trick and is here for the same measured reason: the ⓘ sits after a
caption that is 200px of dates, so at 390 the button lands at **x=223** and a
320px panel opening from it would run to −97. `position: static` on the key
hands the containing block back to the row, and `left: 0` then means the row's
own left edge — measured, the panel opens at **x=22 and ends at 342 of 390**,
inside the viewport at every width.

**What it costs is 15px of table**: the caption row goes 15 → 30px, the button's
own height, and the pane under it 732 → 717 on a 900px window. That is the price
of a real 30px touch target rather than a bare glyph, which is the rule
`InfoKey` already states.

**Driven rather than assumed**: a press opens it and a second closes it, Escape
closes it and leaves the League view standing, an outside press closes it and is
spent on the dismissal alone (`useDismissable`'s own rule — the press that
dismissed it does not also press the table underneath), and the button carries
`aria-expanded` and a real accessible name (`How OVR, BAT and PIT are worked out`).

**They sort like any other column, and on their rank** — which is the one order
the whole table shares. Sorting on the points would be the same order said in a
second currency, and would break the rule that every column of this table opens
on first place. Measured: one press of `BAT` gives `Swaggy Latinos 59 · 1st`,
`Let's Go Mets 53 · 2nd`, `Baldy's Bozos 42 · 3rd` and one of `OVR` gives
`Baldy's Bozos 88 · 1st`, `Swaggy Latinos 81 · 2nd`, `Brian&Tom's 80 · 3rd`; a
second press reverses either, and `aria-sort` reads `ascending` on the first.

**Measured at 320 / 390 / 640 / 1200 / 1920**, both spans: **15 columns** (two
identity, three summary, ten categories), the table 956.6 → 1920px inside a pane
of the window's width, the badge column pinned at **0** with the pane scrolled
to its far right, the header row **1px** inside it (the border) with it scrolled
down, and **no horizontal overflow of the page body at any width**. On a phone
`OVR` is the first stat column after the name — the one most worth having on
screen without scrolling.

### The Rankings table groups its columns and does not label them

**The two sections order the columns and are not drawn.** The `<thead>` was two
rows — `BATTERS` and `PITCHERS` spanning their own runs, over the sort headers —
with an inset-shadow hairline where the runs met. Both are gone, along with the
second sticky row and the `--lg-group-h` offset that held the sort headers under
it.

**What the labels said, the columns already say.** The argument for them was
that a bare rule between two columns *"says there is a seam here without saying
what is on either side of it"*, and that is true of the **rule**; it is not an
argument for the **words**, which on a ten-column table nobody needs — no reader
takes `ERA` for a batting stat or `RBI` for a pitching one. So a whole extra
pinned header row, a second pinning offset for the row under it, and a hairline
were being spent on a label the data carries.

**The grouping itself stays and is load-bearing**, which is why `groups` is
still what the table renders rather than the league's own array: it is the
server's `side`/`order` (see **ESPN fantasy league**, *`STAT_META` says which
side of the ball, and in what order*), and it is the only thing keeping the
batting run ahead of the pitching one. Measured after: `R · HR · RBI · SB · OPS`
then `K · W · ERA · WHIP · SVHD`, unchanged.

**And the side is still named per column, in the sort header's `title`** — which
is not a consolation prize but the half that matters. `H` is a hit and a hit
allowed, `K` a strikeout taken and one thrown, and `BB`, `HR`, `HBP` and `IBB`
are each two categories in `STAT_META` under one abbreviation, so on a league
scoring both sides the label alone is genuinely ambiguous where the tooltip is
not. Measured: `Batters · Runs — season`, `Batters · Home runs — season`.

**The caption above the table is the research board's spacing now**, which is
the other half of this change and was a plain inconsistency. `.lg-span-detail`
carried `margin: 10px 0 6px` on the reasoning that the first thing under a
pinned bar needs air — true, and the air was already there: the chrome's own
`margin-bottom` is 14px, so the caption's 10 sat on top of it and the line
landed **24px** down where the board's own count line lands at 14. They are the
same object — the one line between the controls and the rows, saying what is
under them — so the margin goes and the two now measure the same: **14px above
and 10 below**, the 10 being the pane's own margin exactly as it is over there.

**Measured at 390 and 1200, after.** Caption **14 above / 10 below** at both
(24 / 16 before). One `<thead>` row where there were two, **0** `.lg-group-row`,
**0** `.lg-group-start` and **0** cells painting an inset shadow. The single
header row pins at **1px** (the border) with the pane scrolled down, and the
badge column still pins at **0** with it scrolled to its far right. Rows
**61.55px**, table **824.7 / 1200px**, page-body overflow **0**.

**The scoreboard's own `BATTERS` / `PITCHERS` labels are deliberately kept**,
and the two cases are not the same one. There they head *a block of five
categories inside a matchup card*, which is what stopped that line overflowing a
phone by 118px (see the section above); the labels are the block's own heading
rather than a second header row over a table, and a card has no sticky head for
them to compete with. Checked after the change: all 10 matchup cards still draw
both.

### The rank is a badge and the badge is the scale

**More red the better the rank, more blue the worse, gray in the middle** — a
diverging scale over the teams ranked in one category. **It is on the chip,
where it used to wash the whole cell**, and the reader's own row is marked by a
ring on its team badge where it used to be washed accent-blue across all twelve
cells. The three changes are one change: there were three color systems on this
table and now there is one.

**Why the cell wash went.** It had to be a translucent layer over whatever
ground the row resolved — that is what made it compose with the zebra stripe —
so it could only ever be faint (22% at its strongest, and 2% either side of the
middle, where it said nothing at all), and it painted a color across the
**value** as well as the rank. A figure tinted by its own standing is the one
thing a raw number on this page is there to avoid: the whole argument for
carrying the value beside the rank is that *a rank with no number behind it
cannot be acted on*, and washing the number is that argument half taken back. On
the chip the scale can be strong enough to read at a glance and it stops where
the claim stops — `1st` is red, and the figure beside it is just the figure.

**Why the row wash went with it.** The reader's own row was a 12% accent
`--cell-bg`, which is one wash too many once every rank cell carries a color of
its own: an accent-blue row under a column of blue-to-red badges is two scales
competing for one reading, and on the cold end of a category the two were very
nearly the same ink. The team's badge is where the row says who it is anyway —
the logo, the name and the record are all in those two cells — so the mark goes
there and the numbers are left to mean one thing. A **ring rather than a
border**, which is this app's own idiom for exactly this (the live-role ring is
a 2px `box-shadow` outside a 1px border): every image in the app is
`border-box`, so a real border would eat 2px out of a 26px badge and shrink the
picture, where a shadow is drawn outside it and costs the layout nothing. It
composes with `.lg-logo-none`'s own hairline, so a team with no logo is marked
as plainly as one with, and the cell's `title` names it in words
(`… — your team`) since a ring is a thing you see rather than a thing you can
read.

**The departure from the research board's rule is unchanged and still worth
saying plainly.** That board's stat columns are deliberately **monochrome** and
its percentile badges deliberately `--faint`, on the stated grounds that
*"color is reserved for state"* — a heat scale there would be a second color
system beside the live inning, the postponement and the trend. That rule is
right for what it governs: a six-hundred-row leaderboard whose job is to be
**scanned for names**. This table is the other thing. It is **twelve rows read
for standing**, it carries no live state at all, and where the board says *here
is a number, judge it* a league table says *here is where you are*. The color
**is** the reading, and at this size it is the difference between finding your
weak category at a glance and reading a hundred and twenty ordinals. The board
is untouched, and `.col-rank` is still one object in this app — the League table
adds a fill to it and the two other callers draw it bare.

**It colors the rank and never the value**, which is what makes `lowerBetter`
need no special case at all: the server has already computed the rank with the
direction baked in (`rankBy`, 1 is best whichever way the category runs), so a
3.29 ERA and 232 home runs are both `1st` and both take the deepest red.
**Ties share a rank and so share a color** by the same construction. `n` is the
teams *ranked in that category* rather than the twelve rows, matching the
badge's own denominator, so a team with no figure gets no badge at all any more
than it gets a rank.

**The fill carries the scale and the text does not**, and that is a measurement
rather than a preference. Coloring the *text* is the obvious first move — it is
what the old badge did on top of the wash — and it puts a mid-luminance red on a
mid-luminance ground: `--rank-hot` on the reddest chip is **3.09:1**, under the
4.5 an 11px label owes a reader, and no amount of tuning the tint fixes it
because both ends of the pair move together. `--text` on the same grounds is
**5.12:1 at its worst and 11.72 at its best**, measured over all 120 badges the
live board draws. `--panel-2` is the base the tone is mixed into, which is what
makes the middle of a category a plain neutral chip and the scale pass through
gray rather than through nothing.

**48% at the ends**, and the scale is symmetric and monotone in the rank —
measured on the live twelve-team board, `1st` resolves to `rgb(133, 76, 92)` and
`12th` to `rgb(60, 100, 158)`, with 6th and 7th within a few points of
`--panel-2` (`#1b2949`) either side of it. Opaque rather than a
`color-mix(…, transparent)` layer, unlike the wash it replaces: that one had to
let the zebra stripe through because it covered a whole cell, where a badge is a
discrete object and reads as one ink.

**The `1st`-in-green mark is gone**, and the paragraph it replaces argued for
keeping it: *it is a different layer from the wash — text over ground — and it
is the same green the scoreboard's winning category takes, so a reader who has
learned it on one tab reads it on the other.* That is true and it lost to the
scale. The scoreboard's rule is right for a card showing **one matchup**, where
the job is to mark a *winner*; this is twelve teams ranked in one category,
where the job is to say **where each of them stands**, and a green `1st` inside
a red-to-blue scale is a third color system saying what the reddest chip
already says. First place is marked by being at the end of the scale.

**What it costs is 5px a row**, which is the honest price of turning a bare
second line into a chip: `56.55 → 61.55px`, measured by neutralising the pill's
own padding and margin in the page and reading the row back. It is the rank cell
that sets the row height (the team cell's own block is 28.78px inside 24px of
padding), so the whole of the 5px is the badge and none of it is anything else.

**Nothing else about the table moved**, re-measured at 390 / 1200 / 1920 on the
live twelve-team league: page-body overflow **0** at every width, the badge
column pinned at **0** with the pane scrolled to its far right, **120 badges on
12 rows**, the pane bleeding to **0 from both edges**, and no row hover or
pointer (`cursor: auto`). The reader's own row resolves the ordinary zebra
ground it shares with everybody else (`rgb(11, 18, 32)` against the striped
`rgb(22, 33, 58)`) where it used to resolve the accent mix, its badge carries
`rgb(56, 189, 248) 0 0 0 2px` and no other row's does, and `background-image` on
a rank cell is **`none`**. Sorting is untouched and was driven rather than
assumed — one press of `HR` gives ranks `1, 2, 2, 4 … 12` with the tie sharing
its rank, the group row still drawn and `aria-sort` naming exactly one column.

**Bundle: 498.60 → 498.59 KB of JS** (147.48 → 147.47 gzipped) and **117.22 →
117.10 KB of CSS** (20.83 → 20.82) — both *down*, which is what removing a
per-cell gradient layer, a row-wash rule and a green first-place override costs
when what replaces them is one pill rule and one ring.

### The table takes the page

**The fourth of the app's wide tables to offer it**, and the one with the most
chrome above it: a tab strip, a span strip and a caption, over fifteen columns
on the live league every one of which is wanted at once. The button is
`ExpandButton` — the same control the summary table, the research board and the
game log carry — in **the badge column's header cell**, which is this table's
own version of the cell those three put it in: the one pinned on *both* axes, so
the way back out is on screen wherever the reader has scrolled to. It costs the
table nothing: measured at 390, 1100 and 1920, the badge column is **48.8 /
75.8 / 90px with the button and byte-identical without it**, the button being
26px inside a column already wider than that, and the table is unchanged at
996.8 / 1408.2 / 1920.

**It needs no `.expanded-chrome` row, which is the one way it parts from the
other three.** The caption it already carries *is* the chrome — `Week 19 · Aug
10 – Aug 16 · so far` and the ⓘ that explains OVR/BAT/PIT — which is exactly
the context the span strip up in the tab row can no longer give once this box
covers it, and it is the table's caption besides. So the box keeps that line and
hides everything else, which is the research board's own rule (it keeps its
count line for the same reason) applied with one fewer element.

**Driven in a browser at 1200×800.** Closed, the box is 1356 × 757 at (22, 129);
expanded it is **1400 × 900 at (0, 0)** with the background `inert` (2 held) and
the two children `.lg-span-detail` and `.league-scroll` and no empty state.
Scrolled 600 across and 200 down inside it, the badge column pins at **0** and
the header row at **1px** — the border — with the button still on screen at
x=27. Sorting still works from inside the box (one press of `HR` puts the
leaders on top), the ⓘ still opens, and **Escape unwinds one rung per press**:
the key first, the full-page box second, `[inert]` back to 0.

**Sorting is on the rank rather than the value**, which is the one thing this
table does that the season table did not, and it buys the reader a rule they no
longer have to know: **every column opens on first place**, whichever direction
the category itself runs. It comes to the same thing where every team has a
figure, and where one doesn't it keeps that team out of the order rather than
filing him at one end of it — nulls to the bottom in both directions, the board's
own rule. The **span column sorts like any other column** and time order is what
sorting by it *is*, which is the Stats tab's answer to the same problem: a table
that already has an order must have a way back to it as cheap as the way out, and
a press on the leftmost header is that way in the grammar the reader has just
used to leave it.

**The span strip is drawn from what the server says it can serve**, not from a
list held here — so a league that publishes no matchup count has no halves at
all, and April has no second half, rather than either being offered and
answering with an empty table. It is folded onto `.view-switch` / `.view-tab`
alongside the League strip itself, which is this stylesheet's standing rule: the
League tabs are the view switch one tier down and the span tabs are the research
board's window tabs asking the same shape of question about a different thing, so
both are that control and only their placement is their own.

**What each span covers is printed beside the tabs** — `Weeks 1–9 · Mar 25 –
May 31`, `Week 19 · Aug 10 – Aug 15 · so far`, `ESPN's own season line` — and it
is not decoration. `First half` is a phrase, and which weeks and which days it is
made of is the whole of what makes the numbers under it readable, which is the
same argument the scoreboard's header makes for printing its dates beside `Week
19`. `so far` is the other half of it: a span reaching into the week being played
is a total to date, and a bare `Season` over a figure that stops on Tuesday would
be a claim.

**`Current matchup` means the week being played, not the week the Scoreboard tab
is navigated to.** The tabs are independent pages of one view — which is the
whole reason the period arrows belong to the Scoreboard — and a span labeled
`Current matchup` that silently followed somebody else's arrows would be a label
that is false as often as it is true. Which week it is, is printed under the tabs.

**Where the five spans come from, which are ESPN's own and which are summed,
and why the halves are the regular season alone** are all in **ESPN fantasy
league**, *The Rankings tab, and the five spans*. The one thing worth repeating
here is the last of those, because a reader can see it: the two halves add up to
the season for the four teams in the winners' bracket and fall short by their
live week for the other eight, and `season` is kept as **ESPN's own figure**
deliberately — it is the number on ESPN's site and the number the old table drew.

### The Rankings table is the research board's, not the game log's

**It was folded onto `.glog-table` / `.glog-scroll` and that was the wrong table
to be.** The reasoning at the time was that both are "the app's plain wide stat
table with a sticky first column", which is true as far as it goes and misses
what the log actually is: a list of *one player's games*, read **down**, inside
an overlay. Its rows are presses, its table is `width: 100%` because fourteen
columns have to fit a box, and its cells paint an opaque `--bg` because nothing
underneath them ever changes color. None of those three holds for twelve teams
by ten categories read **across**, which is the research board's shape exactly.

**Three faults came out of that one fold, and all three had a single cause.**
The team `<th>` carried `display: flex` — which takes a cell out of table layout
altogether, the trap this stylesheet already records for the game log's own
corner header, and which nothing in the build or the DOM reports. Measured on
the live 12-team league, before:

| | 1200×900 | 390×844 |
| --- | --- | --- |
| team cell width | **168px** | **168px** |
| its own header cell | 318.34px | 257.34px |
| pane horizontal scroll | **0** | 353px |

So the column and its header disagreed by 150px and 89px — the misalignment —
and the reader's own row wash (`.lg-row-mine`, a 12% accent over `--bg`) painted
**168px of a 318px column**, which is the *dark blue rectangle in the team
column* that was reported. The third symptom is the same sentence: with the
table still `width: 100%` there was nothing to scroll sideways at 1200 while the
cells were crushed to fit.

**What it takes from the board instead**, each answering one of those:

- **A table sized to its content** (`width: max-content; min-width: 100%`) inside
  a scrollport of its own, so a wide table overflows and the pane scrolls under
  it rather than the columns being squeezed into the window.
- **A ground named once as `--cell-bg`**, the rule the summary table states at
  length. The pinned column must paint the same color as the row it belongs to,
  and a second declaration of that color is a second thing to keep in step —
  which is precisely how the row wash became a rectangle. `.lg-row-mine` sets the
  variable rather than a `background`, so it resolves on every cell of the row
  including the sticky one.
- **The identity block is a `<span>` inside the cell**, not the cell itself —
  what `.row-id` already does on the two tables that draw one.
- **Both axes pinned**: the header row to the top, the team column to the left,
  the corner above both.

**And the tab is a fixed-height column** (`.app.league-rank-mode`), which is the
board's own `.app.research-mode` applied to the one League tab that is a table
rather than a list of cards. A sticky header can only stick to a box that
scrolls; without it the page grew, the header scrolled away with it, and reading
across meant taking the whole window along. **Scoped to the tab**: Scoreboard and
Transactions are card lists and keep the ordinary scrolling page (measured: the
`-mode` class is absent on both, and the document scrolls 275px and 1,668px
where Rankings scrolls 0 and its pane scrolls instead).

**No row hover and no pointer**, on the **category** cells — which is every cell
but the two that identify the team, and that qualifier is new: this passage read
*"nothing in this table is pressable"* until the identity became a door into
that team's matchup (see *A Rankings row opens that team's matchup* below). The
argument is unchanged where it still applies. The log's rows carry both because
a press there opens that game; a figure is not pressable, so a tint following
the cursor across ten of them offers something that is not there — and on touch,
where `:hover` has no way to end, it leaves the last row a finger crossed
looking selected, which is the app-wide rule set out in **Client**, *A card
doesn't highlight when you scroll past it*. The header buttons keep their own
hover: those really are controls. So do the two presses, scoped to
`(hover: hover)` by that same rule.

**The pinned column is capped, because it is paid for out of the stats beside
it.** The board makes this trade explicitly — it pins the 42px headshot at every
width and only pins the *name* column from 820px up, on the grounds that below
that the pinned pair would eat two fifths of the screen. Uncapped, the longest
team name here took the column to **257px of a 390px phone**, two thirds of it,
leaving two categories reachable. Now the pinned column is the badge alone and
**the name is neither capped nor ellipsized**: it scrolls with the stats it is
being compared against, so it costs the reader nothing but the scrolling they
are already doing, and `Brian&Tom's Excellent Adventure` reading
`Brian&Tom's Excellent…` is the one thing a league table must not do — the row
*is* the team. Measured: 0 of 12 names truncated at either width.

**Measured after, at 1200×900 and 390×844:**

| | before | after |
| --- | --- | --- |
| team cell vs its header | 168 vs 318 / 168 vs 257 | **318 vs 318 / 257 vs 257** |
| `display` on the body `<th>` | `flex` | **`table-cell`** |
| distinct cell grounds on the reader's row | 2 | **1** |
| cells cover the row's width | no | **yes** |
| header row after scrolling down | scrolls away | **pinned, 1px** (the border) |
| team column after scrolling right 300px | — | **pinned, 0px** |
| row `cursor` | `pointer` | **`auto`** |
| background under the pointer | tints | **unchanged** |
| page-body overflow | 0 | **0** |

Sorting, the span strip and the URL are unchanged and were driven rather than
assumed: `HR` sorts to the leaders and reverses, `First half` loads and writes
`lspan=first` with `Weeks 1–15 · Mar 25 – Jul 19` under the strip, and switching
to Transactions from the navbar drops the fixed-height mode and draws 302 rows.

### Only the badge pins, and it is a rounded rectangle

**The pinned column was the whole identity block** — logo, name and record — and
a pinned column is paid for out of the categories beside it. Uncapped, the
longest team name took it to **257px of a 390px phone**, two thirds of the
screen; capping and ellipsizing the name got it to 168 and four categories,
which was better and still the wrong shape. The board's own rule is the answer:
it pins the 42px headshot at *every* width and pins the **name** only from 820px
up, on the grounds that below that the pinned pair eats two fifths of the
screen. So the cell is two cells here — a `.lg-logo-col` holding the badge
alone, pinned, and a `.lg-name-col` holding the name over its record, which
scrolls away with the stats it is being compared against.

Measured: the pinned column is one badge in its own gutters — **79.6px at 1200
and 48.8 at 390**, and 49/33 when the badge was a 26px circle with one gutter — against the 318/257 it was; after scrolling right the badge
sits at **0** from the pane's left edge while the name column has gone to
**−267**, which is the whole point of the split. The sort that belonged to the
team's identity stays on the **name** header — a badge column carries no label
and nothing to sort by — and the club's name and record are the badge cell's
`title`, so the row is still identifiable from the pinned part alone.

**The badges were circles and are rounded rectangles**, and the reversal is
about what the picture *is* rather than about the app's idiom. The circle was
argued from the headshot on three tables and the portrait on the player page —
*"a 6px corner made this the one mark in the app that wasn't"* — and those are
photographs of a **person**, cropped to a face. A fantasy badge is a picture
somebody uploaded at whatever aspect ratio they had, and `object-fit: contain`
(which stays, for the reason it always had: `cover` crops a wide badge to its
middle) then fits it inside the circle's *inscribed* box, so a landscape badge
is drawn at a fraction of the room the row is already giving it. **34 × 26 on a
5px radius**, so the height — which is what every row this sits in was measured
against — does not move and only the width grows.

**What that width costs is 8px, in one place.** The pinned column of the
Rankings table is the badge in its own gutters, so it goes **71.6 → 79.6px at
1200 and 40.8 → 48.8 at 390**; the row is **61.55px** either way, since it is
the rank badge that sets it, and the page overflows by 0 at both. Nothing else
pays: the scoreboard's own rows and the Transactions feed both hold the badge
in a flex line the name is the elastic member of.

**The size is `--lg-logo-w` / `--lg-logo-h` rather than two numbers**, because
the scoreboard now draws the badge at two sizes — 34 × 26 on a matchup row and
**24 × 18** on a category row, where it is a mark inside a 12px line — and
`--lg-logo-glyph` shrinks the fallback baseball with it, the SVG's own
`width`/`height` being presentation attributes that lose to a rule.

**A team with no logo gets a default image rather than its initials.** Three
letters in a circle read as a *broken* logo — the eye takes it as text that
failed to become a picture — where a plain mark reads as the absence of one,
which is the honest statement: this manager has not set one, or ESPN's URL for
it is dead. On a real league that is the ordinary case rather than the exception
(measured: **1 of 12** teams on the live league), which is why it is drawn with
as much care as the real thing. It is a baseball, because the app already has
one: `BaseballMark`'s own shape in `--faint`, so the default sits in the same
vocabulary as the roster mark and the spinner rather than importing a silhouette
from somewhere else. The abbreviation is not lost — it rides on the cell's
`title` with the name and the record.

### Four spacing and shape faults, and where each came from

Reported together after the rebuild, and each has its own cause rather than a
shared one.

**The pinned bar had a 14px strip of page above it, which no other view shows.**
`.app.league-rank-mode` is a fixed-height column with `overflow: hidden`, and
this stylesheet already records what that does to a sticky child: it makes the
column a scrollport of its own, and a sticky box in one is held against its
**padding** box, which undoes the chrome's negative top margin. The two views
that were fixed-height before this opt out of sticky explicitly for exactly that
reason (`.app.summary-mode .app-chrome, .app.research-mode .app-chrome`), and
the new mode simply had not joined the list. Measured: the bar sat at **y=14** on
Rankings against **y=0** on Research and Roster, and joining the list puts it at
0. Worth noting as a maintenance hazard — that rule is a list of modes, and a
mode added anywhere else in the app has to be added to it too.

**The caption had no air above it.** It is the first thing under the bar and
carried a bottom margin only, so it sat against the bar's own hairline as
though it were part of the chrome rather than the table's caption. `10px` on
top; measured 24px below the chrome and 16px above the pane once the strip
above went.

**The badge column had no gutter on its right.** It was given `padding-right: 0`
when it still held the whole identity block and the name sat beside the badge
inside the cell; with the name in its own column that put the image hard against
the column boundary, which on a pinned column reads as the picture having been
clipped. It takes the table's own gutter on both sides now — measured 22.8px at
1200 and 7.41px at 390, symmetric.

**The team name was truncated.** See the passage above: the cap and the ellipsis
were bought when the name was *pinned* and every pixel of it was paid for out of
the categories held beside it. That argument died with the pin and the rules
outlived it.

### A Rankings row opens that team's matchup

**The table says where twelve managers stand and gave the reader nowhere to go
with it.** A column of ranks answers *who is winning the home runs*; the next
thing anybody asks is *what has he got* — and the only door into a matchup was a
press on a scoreboard card, one tab away, where the reader then had to find the
manager they had just been reading about. So a press on a team's **badge or
name** opens that team's current matchup, **on his own page** rather than on the
Summary.

**On his page rather than on Summary, which is the whole of the point.** A card
on the Scoreboard names a *pair* and knows nothing about which of the two the
reader cares about, so it opens in the middle; a Rankings row names **one team**,
and landing on the comparison would be the page throwing away the one thing the
press knew. The Summary is one press of the strip away either way.

**Both cells are the press, and this is the app's own answer rather than a new
one.** The Transactions feed makes a headshot and the name beside it two doors
to one page, having overturned in as many words the argument that *"the name is
8px away, so a second target is redundant"*. Here they are not 8px apart at all:
the badge column is **pinned** and the name column **scrolls** (see *Only the
badge pins*), so out at `SVHD` the name has gone and the badge is the only door,
and on a phone with the pane at its left edge the name is the bigger target.
Whichever is on screen is the way in, which is the one thing neither alone
could give. The cost is the one every other table in the app already pays: two
tab stops a row, 24 on a twelve-team league.

**A real `<button>` inside each cell**, which is the reverse of the Game Log's
rows and of a scoreboard card — and for the reason those two record: *"a `<tr>`
cannot hold a button without leaving table layout and the whole row is the
target"*. Neither clause holds here. The target is a **cell's contents**, which a
button can be, so the `<td>` stays a cell and the `<th scope="row">` stays a row
header for a screen reader — and Enter and Space come from the browser rather
than from a keydown handler, which is what the Columns dialog's reorder chips
already prefer for the same reason (*"the press is the browser's own"*). Space
does not scroll the pane, a button swallowing it by construction. Each carries
an `aria-label` naming the team and what the press does (`Baldy's Bozos — open
this week's matchup on his page`) rather than reading the row's twelve figures
out, which is the fix the scoreboard card's own label already makes.

**Which matchup is a map from App, and it is the gate.** `matchupTeams` is team
id → matchup id off `scoreboard.matchups`, derived where the board lives rather
than inside the table: `LeagueRankings` holds one span's rows and has never been
handed a scoreboard, and giving it one to search would be a second reader of a
payload App already parses. **A bye is in the map like any other matchup** (the
`home` side alone), which is what makes the press work in a playoff round —
eight of the live league's ten matchups are byes, and the page a bye row opens
goes straight to that manager's roster with no strip at all.

**Null until the board lands, and a team the period has no row for is simply not
in it** — either way the identity draws exactly as it always did: plain text, no
pointer, no hover, no tab stop, its own `title` back on the cell. That is the
gate, and it is deliberately a gate rather than a wait. A control that leads
nowhere is worse than no control, and the alternative — draw the press always
and hold the reader while the board arrives — needs an overlay with nothing in
it, on a page that has no board to draw one from. Measured, there is nothing to
hold for: both reads fire together on entry to the tab, and the presses arrive
**within one 25ms sample of the table** (three runs: 0ms, 27ms, 0ms).

**And it degrades coherently rather than by luck.** The two reads share a
credential, so a league that cannot be read has no rankings *and* no board — a
table of twelve names with silent identities is not a state a reader can reach.
Measured with `/api/espn/scoreboard` blocked: **0 presses on 12 rows**, `cursor:
auto`, the identity's own title on the cell, and the table byte-identical at
1463.45px with the page overflowing by 0.

### The Rankings tab reads the board, and it is the cheapest read on this view

`App`'s scoreboard effect was gated on `leagueTab === 'scoreboard'` (plus the
matchup page, which shares that read). It now answers a boolean —
`needsScoreboard`, true on the Scoreboard **or the Rankings tab** or with a
matchup open — and the Rankings tab is in it because **its rows are doors into
the board**: the map above cannot be built without it.

**What that costs is one 10KB read on entry to a tab**, cached a minute per
league on the server and ~2ms warm (measured through the route, in **ESPN
fantasy league**). It is an order of magnitude less than the **transactions**
feed, which this view already reads on entry to *any* tab so the dot on its tab
can be drawn — so the laziness this spends is the smallest on the page. The
Transactions tab is untouched and reads no board (measured: **0**
`/api/espn/scoreboard` requests on entry to it).

**A boolean rather than the three tests it is made of**, which is what keeps it
one request: with `matchupId` in the dependency list, opening a matchup from a
tab that already needed the board would re-run the effect and spend a request to
be handed the board it is holding. Measured on entry to Rankings and then
opening a matchup from a row: **1 read, then 1** — the same one.

**The poll widened by the same clause**, which is *"poll what is on screen"* read
honestly now that a matchup page can be opened from a tab that is not the
Scoreboard: `(leagueTab === 'scoreboard' || matchupId != null) && scoreboardLive`.
Its two rules are untouched — the week has to be live, and the tick goes through
the server's own minute — and without it a matchup opened from Rankings would
sit still for as long as it was open, which is exactly the staleness *The page
updates itself* was written to remove.

### Measured — the Rankings press

**Driven against the built client and the live 12-team league at 1200×900 and
390×844.**

- **The table does not move.** Before → after, with the pane scrolled to its far
  right and its foot: rows **61.55px**, header row **47px**, table **1463.45 /
  996.81px**, badge column **79.59 / 48.81**, badge pinned at **0**, header row
  at **1px** (the border), page-body overflow **0** — every figure byte-identical
  either side of the change, at both widths. 12 rows, **24 presses**.
- **The press works with a mouse, a real touch tap and the keyboard.** A press on
  a **name** writes `mup=111&mt=4` and opens with `WAXM` active; on a **badge**,
  `mup=110&mt=12` with `BOZO` active and 13 roster rows drawn. **Enter** on a
  focused name and **Space** on a focused badge both open (`mup=109&mt=6` and
  `mup=110&mt=5`) with `window.scrollY` still 0, and the focus ring is the app's
  own `rgb(56, 189, 248) solid 2px`. At 390 a genuine `touchStart`/`touchEnd` on
  the **pinned** badge opens `mup=111&mt=4` with the page overflowing by 0.
- **A bye opens as a bye**: `mup=112&mt=9`, no strip at all, the head naming
  `Pirates Cove`.
- **Hover is scoped and was audited out of the CSSOM.** With a mouse at 1200 the
  name goes `rgb(232, 238, 252)` → **`rgb(56, 189, 248)`** and the badge takes a
  55% accent ring; under touch emulation at 390 both stay at their resting
  values with `matchMedia('(hover: hover)')` **false**, and both rules resolve
  `inside (hover: hover)`. On the reader's **own** row the `.lg-row-mine` ring
  wins the cascade and stays the flat accent, which is the right way round: a
  standing fact about the row beats a passing one about the pointer.
- **The URL says which page is open, live.** `?mup=110&mt=5` opens on `BETS`;
  pressing `Summary` drops `mt=`; pressing the other team writes `mt=12`; a
  hand-made `mt=999` opens the Summary and **drops the param**; a scoreboard card
  still opens with no `mt=` at all.
- **The Escape ladder is unmoved.** A player page opened from a team page's table
  sits at **50** over the matchup at **48** (which goes `inert`), and one press
  per rung unwinds `player → matchup`, clearing `mup=` and `mt=` and leaving
  **0** `inert` marks. Inside the **full-page** box the presses are all 24, a
  press opens the matchup *over* the expanded table (48 against 45), and two
  presses close the matchup and then the box.
- **The other three views are untouched**: Roster, Feed and Research all draw,
  with the chrome at 115 / 115 / 207px and 0 page overflow.

**Bundle: 522.29 → 523.52 KB of JS** (154.38 → 154.79 gzipped) and **126.34 →
126.82 KB of CSS** (22.44 → 22.51) — 1.2KB and 0.5KB raw, 0.4KB and 0.07KB over
the wire, for a map, two buttons a row, a URL param and the paragraphs above
restated where the rules are.

### The span strip is in the tab row, and its caption is on the table

**Both halves of that sentence were wrong before and they were wrong in opposite
directions.** The strip sat on the page with its caption beside it; the strip
belongs in the tab row with every other control of its kind, and the caption
does not belong with the strip at all.

**The strip** is the research board's window tabs asking the same shape of
question about a different thing — *which games are these numbers drawn from* —
so it takes that control's answers exactly: pills on a desktop, a native
`<select>` under 640px, **both rendered and swapped by one media query** rather
than by a JS media test that could drift from the CSS, which is the rule every
"pills on a desktop, dropdown on a phone" control in this app follows.
`.lg-span-select` is folded onto `.date-presets-select` / `.research-window-select`
/ `.research-pos-select` so all four are one control by construction, and the
pill row is hidden two classes deep (`.view-bar-tabs .lg-span-row`) for the
reason `.research-bar .research-window-row` is: the shared `.view-switch` rule
sets `display: inline-flex` later in the file and would otherwise leave both on
screen at once. Measured at 1200 the pills are `flex` and the select `none`; at
390 the reverse.

It is drawn from **`rankings.spans`** — the spans the server says it can serve
honestly — rather than from a list in the client, so a league that publishes no
matchup count has no halves and April has no second half, instead of either
being offered and coming back empty. It renders only on the
Rankings tab, so the Scoreboard and Transactions carry no empty slot for it
(checked: absent on both).

**The caption** — `Weeks 1–9 · Mar 25 – May 31`, and `· so far` where the span
reaches into the week being played — sat beside the strip, on the reasoning that
it was a caption on the *control*. With the strip a tier away in the tab row
that would have stranded it up among the buttons, describing something two boxes
below it. It is the **table's** caption and now sits directly above the table,
which is where the research board keeps its count line and for the same reason:
the one thing between the controls and the rows describes what is under them.
Measured 16px above the pane at both widths.

Driven rather than assumed: the desktop pill and the phone `<select>` each write
`lspan=` and redraw the caption (`First half` → `Weeks 1–9 · Mar 25 – May 31`,
`Second half` → `Weeks 10–18 · Jun 1 – Aug 9`), the select keeps its
value across the reload, and sorting is untouched.

### The Projected reading: where the table is heading

**A rank is read to answer *where will I finish*, and the table could only say
where everybody had got to.** The Scoreboard answers *am I winning this
category* — that is what a matchup card is — and the question a manager brings
to a league table is the other one: two roto points off third in saves with five
days left is a week to do something about, and two off with one day left is not.
So the app's tab row carries a **`Projected`** toggle, and pressing it draws
every figure, every rank and all three summary columns against the **end of the
matchup period** rather than against today. It stood in the table's own caption
row until now and the argument for the move is below, under *The toggle is in
the tab row, and the caption stayed behind* — read the two together, because
most of what follows was written of the caption's copy and every word of it
except the address still holds.

**Only on `Current matchup`, and that is not a limitation so much as the only
span the question has an answer for.** There is no such thing as a projected
season line or a projected first half — those are records of weeks that have
been played — so the other four spans draw no toggle at all. **Absent rather
than disabled**, the rule this app applies to every control with nothing to do:
a disabled button invites the reader to work out why, where an absent one leaves
the caption exactly as it has always been.

**And a settled week draws none either**, which is the same rule read one step
finer: the week being played is what a projection is *of*, so a period that is
over has nothing left to happen. Which weeks those are is the **server's**
answer (`projectable` on the response) rather than a rule kept here — see
**ESPN fantasy league**, *The Rankings tab*, where the test is `liveDay != null`
and costs no read at all.

### The re-ranking is the server's, and that is the whole of the design

**Everything that turns a figure into a standing lives in
`espn.ts::getRankings`** — `rankBy`'s competition ranking with `lowerBetter`
baked in (so 1 is the best ERA and the most home runs alike), the per-category
population a roto point is worth, `totalOver`, and the identity that makes
`OVR` equal `BAT` + `PIT` *by construction* rather than by two arithmetics that
agree. A projected table ranked in the client would be a second definition of
every one of those, free to drift from the live one the next time either moved,
with nothing on screen to say which of the two a reader was looking at.

So the projection replaces the **values** and nothing downstream is told: the
same ranks come out, the same points, the same `OVR` identity, over different
numbers. `?projected=1` on `/api/espn/rankings` is what asks for it, and the
figures come off `getProjection` for the current period — **the same read the
matchup page's own lens makes**, cached per league on its own minute, so a
reader who has already opened a card pays nothing for this and one who has not
pays for it once.

**Where this parts from the two other projections in the app** is worth stating,
because all three are the same engine: the matchup page projects **a side's
totals** and the Roster view **a player's line**, and neither of them ranks
anything. This is the only one where the projection is an *input* to an
arithmetic rather than the answer itself, which is exactly why it could not be
done anywhere but where that arithmetic is.

**A bye is a real shape and its own totals are projected all the same** — the
matchup has a `home` and no `away`, so both sides of every matchup are walked
rather than the pairs. A team the projection has no side for keeps **no
figures** rather than its live ones, which is the rule every absent figure on
this table follows: a row half projected and half not would be a row nobody
could read.

### The caption says so, because a table of guesses under `so far` would be a lie

`Week 19 · Aug 10 – Aug 18 · so far` becomes **`Week 19 · projected to Aug 23 ·
5 days still to play`**. The week keeps its name — a reader still has to know
which week — and the two halves that were true of ESPN's own figures give way to
what replaced them: the day the projection runs to, and how much of it is still
a guess. That last figure is the one that matters most and nothing else on the
page carries it: a table projected over five days is a different thing from one
projected over one.

**The days come off the response** (`projectedDaysLeft`) rather than being
counted here, and the ⓘ's own first paragraph reads the same number — so the
caption, the key and the table cannot come to disagree about how far ahead they
are looking.

**Two ⓘs in one row, and only while the lens is on.** `RankKey` explains `OVR`,
`BAT` and `PIT`, which is the one thing on this table a reader cannot work out
by looking; the second is the projection's own key, and it arrives with the
button because it is *part of* that button — `ProjectedTools` is the control and
its key as one object, which is how the matchup page draws it. It is that
component rather than a lookalike, so the mark, the lit state and the four
paragraphs are the ones the rest of the app already uses: one account of one
method. What it gained for this caller is a **`days`** prop, because this tab
reads the figure off its own response and holds no `EspnProjection` at all.

### The toggle is in the tab row, and the caption stayed behind

**A reversal, and a small one: the button moved a tier up and nothing else about
it changed.** It was put in the caption row on the reasoning that a control
saying what the figures *are* belongs against the figures, which is true and is
still why the *caption* is there. What it missed is what the button actually
does — it changes **which numbers the table draws**, which is the same kind of
statement as the research board's include buttons and the Roster view's own
`Projected`, and both of those are in the tab row. That last one
is the whole argument in a line: the app already draws a projected toggle up
there, so drawing the League's copy two tiers lower made one control look like
two.

**What makes the move safe is that the sentence never depended on the button.**
The caption reads `Week 19 · projected to Aug 23 · 5 days still to play` whether
or not the control is beside it — it is written off `rankings.projected` and
`projectedDaysLeft`, which come off the response — so a table of guesses is
still named against the numbers with its control a row away. What is left in
`.lg-span-detail` is a caption and the one ⓘ that explains a column of it, which
is what that row was for.

**And that is also what the full-page box keeps.** The tab row is *covered*
there — measured, `.app-chrome` is `inert` while the box is up — so the toggle
is out of reach in that mode where it used to travel in with the caption. That
is the research board's own rule rather than a loss: an expanded table **states**
its settings and the way to change one is the button that expanded it. Here the
statement is the caption itself, which the box already keeps
(`.lg-rankings.is-expanded > :not(.league-scroll):not(.lg-span-detail)`), and
Escape leaves the mode with `rankproj=1` still on.

**`ProjectedTools` moved whole**, the button and its key being one object by
that component's own design, so `LeagueRankings` lost `projected`, `onProjected`
and `busy` and `LeagueView` lost the threading for all three — a prop nobody
reads is a prop nobody misses. The undelayed flag is now read where it is held:
`App` passes `rankingsLoading` to the control and `showRankingsWait` to the
pane, which is the same pair of answers to the same two questions, one hop
earlier.

**Two CSS declarations, each undoing something written for the row it left.**
`.lg-proj-tools` carries `margin-left: auto`, which is right at the far end of
the Scoreboard's head row and wrong in a bar that wraps: each line has its own
slack, so the toggle would strand itself at the right edge of whichever line it
landed on — a control walking away from the group it belongs to as the window
narrows. `.view-bar-tabs .lg-proj-tools { margin-left: 0 }` puts it at the row's
ordinary 12px gap after the span strip. And the key's anchor becomes
**`.view-bar`** rather than the group: `.lg-proj-key` is `position: static`
precisely so a 340px panel hangs off a *row* rather than off a 30px button, and
this group sits part-way along the tab row — at 390 the button starts at x=187 —
so `right: 0` against the group would open the panel leftward off the screen.
Against `.view-bar`, which is the full content width at every size, `right: 0`
is the app's own gutter. **Nothing else in that bar changes hands**, checked
rather than assumed: the two absolutely positioned things under there are the
transactions dot and the calendar's date bubble, anchored to `.lg-tab` and
`.date-toggle` (which has since become a bar and dropped both the bubble and the `position: relative` that anchored it), both of which declare `position: relative` for exactly that
purpose, and the date picker's popover hangs off `.drp`.

**The label goes at 640 for the same reason it went before, in a new place.**
The rule named `.lg-span-detail .lg-proj-label` and now names
`.view-bar-tabs .lg-proj-label`, which puts it beside `.projected-toggle-label`
— the Roster view's copy of this control, in this same row, losing its word at
this same width. Measured on this tab: with the label the group is **145px** and
the tab row takes a *third* line at 320 and at 640 (**132 → 180** and
**84 → 132**, i.e. 48px of pinned chrome off the one tab that is a table); at
**77px** it packs onto the line the span dropdown is on and the row is 132 and
84, exactly what it was before this control joined it.

### What the move costs, measured

Driven in a browser against the live 12-team league, `.view-bar` and
`.app-chrome` heights before → after, with the caption beside them:

| width | tab row | pinned chrome | caption | net page |
| --- | --- | --- | --- | --- |
| 320 | 132 → **132** | 255 → **255** | 70 → **30** | **−40** |
| 390 | 132 → **132** | 207 → **207** | 36 → **30** | **−6** |
| 640 | 84 → **84** | 159 → **159** | 36 → **30** | **−6** |
| 900 | 82 → **82** | 161 → **161** | 36 → **30** | **−6** |
| 1024 | 82 → **82** | 161 → **161** | 36 → **30** | **−6** |
| 1200 | 36 → **82** | 115 → **161** | 36 → **30** | **+40** |
| 1440 | 36 → **36** | 115 → **115** | 36 → **30** | **−6** |
| 1920 | 36 → **36** | 115 → **115** | 36 → **30** | **−6** |

**1200 is the one width that pays, and it pays a whole line — and it is
structural rather than a tuning failure.** The row's four groups measure 289
(view switch) + 297 (League tabs) + 470 (span pills) + 145 (this) with 12px
gaps, i.e. **1237px** against the **1156** a 1200px window leaves; without the
label it is 1169, still 13px over. So there is no width for this control at 1200
in any dress it can wear, and hiding the word above 640 would buy nothing while
costing every wider screen its name. What the reader gets back is 6px of caption
and a control among the other filters; what it costs is 46px of pinned chrome at
that one width. Stated rather than smoothed over: it is the honest price of the
move.

**Everything else was driven rather than reasoned about**, at 390 and 1200:
a press writes `rankproj=1`, swaps the caption to `Week 19 · projected to Aug 23
· 5 days still to play` and a row's first four cells from
`98 1st · 53 1st · 47 1st · 19 1st` to **`98 1st · 52 1st · 73 2nd · 27 1st`**,
and pressing again puts all three back; at t+300ms of a cold read the button
carries `aria-busy` with the caption and the twelve live rows still standing;
the button is **43px** throughout at 390 and **111px** throughout at 1200, so it
does not move under the finger; the four other spans draw **0 toggles** and drop
`rankproj=1` from the URL; the key opens **276px at x=22** of a 320 screen and
**320px at x=48** of a 390 one, on screen at 320/390/640/1200/1920; and the
Roster, Feed, Research, Scoreboard and Transactions views render with **0
overflow**, no banner, and `.view-bar` heights and a date-picker popover rect
**identical to `main`** at 390 and 1200 — which is the check `.view-bar`'s new
`position: relative` owed.

**Bundle: 578.64 → 578.52 KB of JS** (172.36 → 172.32 gzipped) and **155.43 →
155.49 KB of CSS** (27.82 → 27.83) — the JS down 120 bytes on three props and
their prose, the CSS up 60 on two declarations and the argument for them.

### `rankproj=1`, and why it is a third param rather than a reuse

In the URL by the rule `hideil=1` and `sched=` follow: it changes
*what the numbers are*, so a link that carries it describes a different table.

**A third param rather than either of the two the app already has**, because
neither means this: `proj=1` is a **matchup's** figures and `rproj=1` is a
**player's**, and one param meaning three things in three views is exactly the
trap `lspan=` avoids by not being `win=` — a link is read before anything on
screen can say which view it was written on. None of the app's other params can
collide with it (`preset`, `start`, `end`, `player`, `view`, `kind`, `sim`,
`hideil`, `starters`, `sched`, `plays`, `newplays`, `roster`, `pos`, `cols`,
`inc`, `scope`, `watch`, `win`, `help`, `mp`, `mup`, `mt`, `lt`, `lspan`,
`proj`, `rproj`, `league`).

**Written only on the span it can act on.** Moving to `Season` drops it and
coming back writes it again, so a link to a season table never carries a lens
that table has no answer for. **Not a saved preference**, by the line every
lens in this app sits the far side of: which figures a reader wants in front of
them is a lens for an afternoon rather than a standing fact about the reader, and
a saved copy would be a table of guesses drawn a fortnight later.

**And it does not outlive the tab.** Leaving the Rankings tab — for the
Scoreboard, for Transactions, or off the League view altogether — puts the lens
away, so the tab opens on the figures so far unless a link said otherwise. It
had to: `lt=` is remembered, so `Rankings` projected → `Roster` → `League` came
back lit, measured, and a reader who had forgotten the press was reading guesses
under a caption they had stopped seeing. One effect on
`[view, leagueTab, rankProjected]`, and it costs nothing on the wire — the read
below is gated on the tab, so putting the lens away off the tab sends no
request; the live table is read on the next entry, which is the read that entry
was going to make anyway.

**The span strip is not a leaving**, which is the other half of the same rule: a
span is a sub-selection inside this tab, not another page, so `Season` and back
is the round trip described above — measured, `lspan=season` drops the param and
`Current matchup` writes it again with the button still lit. Mirroring the URL
gate exactly was the alternative, and it was rejected for that and because the
gate has a `projectable` in it that arrives *after* an inbound link does.

**A matchup page opened over this tab is not a leaving either.** It is a page
over the view and leaves `view` and `lt=` where they are: measured, a press on a
Rankings row with the lens on gives `?…&lt=rankings&mup=112&mt=9&rankproj=1`
with the caption and the lit button still behind it, and `Back` returns to both.
The rule and the three reasons it overturns are in **Client — the Roster view**,
*A page opens measured, unless a link says otherwise*.

**An inbound link is untouched**: `view`, `lt=` and `lspan=` are all seeded
synchronously from the query string, so `?view=league&lt=rankings&rankproj=1` is
already on its own surface at the first render — measured, it opens on `Week 19
· projected to Aug 23 · 5 days still to play` under `lg-proj-btn on`.

### Never over data, and the mark goes inside the button

The live table stands while the projected one is in flight — `setRankings` is
called on success alone, which is rule 1 — so the only mark a press leaves is
the spinning ball inside the control that started it. A **failed** read leaves
the last table standing too, with no banner over it.

The toggle's own flag is the **undelayed** one (`rankingsBusy`), where the block
wait below it is gated on `useDelayedFlag`'s 250ms floor. The two answer
different questions: that floor is for a wait nobody asked for, and a press is
owed no delay at all.

**No `MIN_SPIN` floor, and that is a decision rather than an omission.** That
constant is a floor on how long a mark stays up once a press has put it there,
and it earns its keep on `Refresh from ESPN`, whose result is a change in a page
behind a popover that may look identical — without a floor a warm press leaves
no evidence at all. Here the result **is** the evidence: every figure and every
rank on the table changes at once, which is the loudest confirmation this page
can give, and a floor would only hold an answer back from a reader who already
has it. Measured, the warm press lands in **1.2ms** and the cold one in
**1.69s**; the case a floor would buy is the first of those, and it is the case
that needs it least.

### Measured

**The projected ranks were recomputed independently** from `/api/espn/projection`
and compared with `/api/espn/rankings?span=matchup&projected=1`, cell by cell, on
the live 12-team league: every team's projected value equals its own projected
`scores` entry (**120 of 120 cells, 0 mismatches**, 12 rows, 12 projected
sides); every rank is the competition rank of those values with `lowerBetter`
honored, checked per category on the direction as well as the ordering (**120 of
120, 0 mismatches, 10 categories**); and every points total is
`sum(n + 1 − rank)` over its side with `OVR` equal to `BAT` + `PIT` (**24 side
totals, 12 of 12 overall totals, 0 mismatches**).

**The live table is byte-identical to `main`** on all five spans, bar the four
new fields — checked by fetching both servers and diffing the responses.

**Driven in a browser at 390×844 and 1200×900**, against the live league:

| | live | projected |
| --- | --- | --- |
| caption | `Week 19 · Aug 10 – Aug 18 · so far` | **`Week 19 · projected to Aug 23 · 5 days still to play`** |
| the button | `lg-proj-btn` | **`lg-proj-btn on`** |
| URL | *(no `rankproj`)* | **`rankproj=1`** |
| a row's first four cells | `100 1st · 54 1st · 47 1st · 19 1st` | **`100 1st · 52 1st · 73 2nd · 27 1st`** |
| rows | 12 | 12 |

**Of the caption's copy of the button**, which is where it stood when this was
measured — see *The toggle is in the tab row, and the caption stayed behind*
above for where it is now and what the move cost. **The caption row grows and
the table does not**: `.lg-span-detail` goes
**30 → 36px** at 390, 640, 1200 and 1920 and **30 → 70** at 320, where this bar
already pays a line for everything; the table is **956.61 / 996.81 / 1142.06 /
1463.45 / 1920px** and the row **61.55px** at 320 / 390 / 640 / 1200 / 1920 in
both states, with the badge column pinned at **0** with the pane scrolled to its
far right and **page-body overflow 0 at every width in both states**. The
projected caption is the one thing that wraps at 390 (36 → 70), which is the
sentence being longer rather than the control taking room.

**The label goes on a phone**, folded onto the block that already hides
`.research-toggle-label` and `.projected-toggle-label` and scoped to this
caption row alone — with it, the pair wrapped and the row was **70px** at 390,
which is two thirds of a table row taken off the one tab that *is* a table. The
matchup card's copy of the same button keeps its word, being centered on a row
of its own.

**The spinner is genuinely on screen**, driven with the read held 2.5s: at
t+300ms and t+1.5s the button carries `aria-busy` and one `ball-spin` and no
glyph, the caption still reads the live one and the table still draws its
**12 rows with the live figures**; at t+3.7s the caption, the lit state and the
figures all swap together. The button is **111.48px wide throughout** — see
*The ball is the size of the mark it replaces* in **Client — the Roster view**,
which is the rule that had to be added to make that true.

**Every other state was driven rather than reasoned about.** The four other
spans draw **0 toggles** and their own live captions, with the `rankproj=1` link
still in hand; a **settled week** (the response stubbed to `projectable: false`,
which is what the server sends for one) draws **0 toggles** and the live caption
under a request that is still standing; the **full-page** box carries the
caption, the toggle and the lens, and Escape leaves full page with the lens
still on; the projection key opens at **320 × 533 at x=48 of a 390px screen**,
in view, reading `over the 5 days left`; and the Roster, Feed, Research,
Scoreboard and Transactions views all render with **0 overflow** and no error
banner.

**Bundle: 574.32 → 575.40 KB of JS** (170.85 → 171.17 gzipped) and **154.95 →
155.08 KB of CSS** (27.73 → 27.77) — 1.1KB and 0.13KB raw, 0.32KB and 0.04KB
over the wire, and that figure carries the two spinner fixes below as well as
this. Through the route, the response goes **12,206 → 12,240 bytes**, which is
the four new fields.
