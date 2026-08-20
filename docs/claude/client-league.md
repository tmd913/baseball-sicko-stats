### The League view

Split into four files, because it had grown past the 150k-char limit
`CLAUDE.md` sets for these. This one is the view itself — why it earns a pill,
its three tabs and their strip, what the URL carries, the poll, the four ESPN
formats — and the **Scoreboard** tab, whose cards are the door to a matchup. The
matchup page, the Rankings tab and the Transactions tab are each their own file;
all three are listed again at the foot of this one.

Split into its own file for the reason `client.md`'s closing map gives: the
division is by **the surface being described**, and this is one — the only page
in the app about the *fantasy league* rather than about players.
`components/LeagueView.tsx` draws it; **ESPN fantasy league**, *The league
scoreboard*, is where the reads behind it and their caching live.

**It is a fourth pill rather than an entry in the fantasy popover**, and both
halves of that were live options so the argument is worth stating.

The popover is where everything fantasy already lives — the roster-source
toggle, `Refresh from ESPN`, the doorway to the league's settings form — and
that is exactly what it holds: **controls over the app**. Which list the roster
views read, a cache bypass, a form. A scoreboard is none of those; it is a
**page of data** a manager comes back to through a week, and putting it behind
a popover would file the app's second-largest table under a menu whose other
three entries are switches.

The app's own test for what earns a pill is the one that collapsed Games into
the Feed: **a sort order is not a page, a different question is.** Roster and
Feed are the same players over the same days read two ways; Research is the
whole league over a season. This is a fourth question — *how is my team doing
against the league* — and it is the only view that holds a matchup at all.
Nothing in it is a re-reading of anything: no other page in the app knows the
league has weeks.

**It needs a league where Research needs no roster**, which is the one way it
parts from the pill beside it. Research is always present precisely because it
depends on nothing the reader has to have set up; this depends on a connected
ESPN league, and a pill leading to a page that could only ever say *connect a
league* is chrome for a feature the reader hasn't got. So `espnConnected` gates
it — in **either** roster mode, since the league's matchups are a fact about the
league rather than about which list the roster views happen to be reading.

**`view=league` is nonetheless read off the URL before that status has landed**,
and the view's own empty state says why if there turns out to be no league.
Silently dropping a link to Roster would leave somebody who was handed one with
nothing on screen to explain where it went, which is the direction this app
declines to fail in.

**What it costs the tab row, measured on the same page in one browser** by
drawing the bar with the pill and then again with it removed, at 320 / 375 / 390
/ 640 / 900 / 1200 / 1920. The view switch goes **216 → 289px** at every width.
The bar's own height is **unchanged on the Roster, Feed and League views at all
seven** (159 / 111 / 111 / 111 / 115 / 115 / 115), and moves on the **research**
view at two of them: **207 → 255px at 390** and **115 → 161 at 1920**, which is
one wrapped line each. That is the same 46–48px the three include buttons cost
1920 and that dropping `Qualified` won back, spent again — and it is spent on
the board alone, because that is the one page whose tab row already carries a
whole control set. **No horizontal overflow of the page body at any of the seven
widths on any of the four views.**

### What is on the page

Two blocks, in the order the two questions come in, and the second is why the
page is worth having twice: the scoreboard answers *am I winning*, the table
answers *why*.

**The scoreboard** is a card per matchup — `.lg-matchup`, the app's own panel
gradient on `--radius` — with both teams named, their badge beside them and
their record under the name, the headline number at the right end of each row,
and the category line under both, each side's row of it carrying that side's
badge and its head row naming the side of the ball in the same column. **The reader's own matchup leads**, which is a sort rather than a
mark and is what actually gets it on screen without scrolling on a phone; the
accent border and the `Your matchup` label are what say *which* one it is once
several are in view. Both were needed: on a 12-team league the board is ten
cards, so a mark alone would have been a mark you had to go and find.

**The winning side of each category is green and the losing side muted**, which
is deliberately *not* the `--hit`/`--strikeout` pair this app uses for a delta.
Red on the loser would put ten red cells on one side of every card — the whole
row shouting where the job is to mark a winner — so the app's rule that color
is spent on **state** is honored by marking one state and letting the other go
quiet. A tie is `--faint`, neither. Each cell's `title` spells it out in words
(`Runs: 32 — winning so far`), the `so far` appearing on a live period alone.

### The headline is a triple, because a categories matchup has no single score

**A head-to-head categories matchup is won category by category**, so what a
side *has* is not one number: it is how many categories it is winning, losing
and tied in. A team up in six, down in three and level in one reads **`6-3-1`**.
The card printed the wins alone — a `6` beside a `3` — which left the reader to
work out how many of the ten were still level, or whether the other seven had
even been played.

**The triple is the server's own tally rather than a second count**, and that
matters because the tally is the thing that has been *checked*: ESPN fills its
`cumulativeScore` only once a matchup is over, so `espn.ts` computes it for
every matchup live and final alike, and the computed answer matched ESPN's on
all 1,080 category comparisons of the league's eighteen completed periods (see
**ESPN fantasy league**, *The category winner is computed here, not read*). The
client's own `outcome()` still decides the *cell* colors, which is a per-cell
question the tally cannot answer; what it does not do is add itself up into a
second definition of who is winning a category.

**All three terms, always**, where the season record beside it drops a zero tie
count (`record()` — `7-7` rather than `7-7-0`). Two reasons and the second is
the load-bearing one: the three are a partition of the categories, so the sum is
a fact a reader can check against the header above, which `6-3` cannot be; and
`7-7` as a season record and `7-7` as this week's categories would be the same
string meaning two different things an inch apart on one row.

**Only a categories league has this shape.** A points league has one number a
side and `score()` still prints `fmtPoints(side.points)`; a roto league has no
matchups at all and draws its own empty state. Both were driven with the
response stubbed rather than reasoned about — the points card reads `812.5` /
`774.25` with **no category grid at all**, and the roto one reads `No matchups
in this league`.

**Verified against ESPN over every settled matchup period of the live league**
(1–18, 108 matchups, 216 sides): the triple **sums to the ten categories on
216 of 216 sides**, **matches ESPN's own `cumulativeScore` on 216 of 216**, and
the side the triple implies is the winner agrees with ESPN's `winner` **and**
with the card's own `matchup.winner` on **108 of 108**. Live, week 19 reads
`7-1-2` / `1-7-2` and `3-5-2` / `5-3-2`.

### Batters and pitchers are two blocks, not one ten-column run

**The league's own category order interleaves the two sides of the ball** — the
live league scores `R HR RBI W ERA SB WHIP K OPS SVHD` — so a manager wanting to
know how his *pitchers* were doing had to pick four columns out of ten by eye.
A category league is read as two halves, because a manager's bats and his arms
are two rosters doing two jobs. So the line is two blocks, each with its own
head and its own two rows, under a small-caps `BATTERS` / `PITCHERS` label.

**And it is what stops the line overflowing a phone.** Ten columns at the grid's
`minmax(42px, 1fr)` want 438px inside a card that is 318px wide at 390 —
measured before the change, the category line **overflowed its own card by
118px** and scrolled sideways. Split, each half is five columns: measured after,
`scrollWidth - clientWidth` is **0 on both blocks at 320, 375, 390, 640, 900,
1200 and 1920**, with no horizontal overflow of the page body at any of them.
Each block's own `border-top` is the rule between the two, so the split costs no
new mark.

**The label was a line above each block and is now the head row's leading
column**, which reverses the paragraph that stood here: *a left-hand label
column costs the card about 52px of width where a line costs it 14px of height,
and this card is width-bound rather than height-bound.* The arithmetic was
right and it was the arithmetic of the **ten-column** line this very section
splits in two. Split, each block is five columns with 15px of slack apiece at
390 — so the column is free there, and paid for at 320 by taking the category
floor from 42px to 36 (still above the ~30px the widest header in it needs).
See *The name over the record* below for the measurement. The card is 800px at
1200 and 346 at 390, unchanged.

### Which side a category is on is the server's answer

**`categoryGroups` in `LeagueView.tsx` is the one place the split happens**, and
both the scoreboard's line and the Rankings table read it — so a cell, its
header and the block it belongs to cannot come to disagree about which column is
which. The two surfaces use it differently and deliberately: the scoreboard
*draws* the split (a labeled block per side, which is also what stops that line
overflowing a phone), where the Rankings table only *orders* by it and names the
side in each header's tooltip — see **The Rankings table groups its columns and
does not label them**, which is where that asymmetry is argued.

**It groups, it does not decide.** The side and the reading order ride on
`EspnCategory` off `STAT_META`, which is the only place that can say either: a
**label cannot**, because `H` is a hit and a hit allowed, `K` a strikeout taken
and a strikeout thrown, and `BB`, `HR`, `HBP` and `IBB` are each two categories
in that table under one abbreviation. Pattern-matching the labels here would get
four of them wrong on a league that scores both sides. See **ESPN fantasy
league**, *`STAT_META` says which side of the ball, and in what order*.

**The array on the wire stays in the league's own order**, and the client
regroups. The payload is a faithful record of what the league scores; grouping
is presentation, and putting it in the client means nothing server-side had to
learn about it — `sideFrom`, `getRankings` and the blob keys all index by
`statId` and are untouched.

**A category the table cannot place is drawn rather than dropped**, in a third
group called **`Other`** at the end. That is the honest bucket for an ESPN stat
id `STAT_META` has never been read against — the same one whose header already
reads `Stat 62` — because filing it under Batters would be a claim where a group
of its own is an admission. Driven with one category rewritten to an unknown id:
the card draws `Batters` (four), `Pitchers` (five) and `Other` (one), with
nothing lost from either real group. A group with nothing in it is not drawn at
all, so an ordinary league sees two — and on the Rankings table the group
**header row is not drawn at all below two groups**, a single spanning label
over every column being a row spent saying nothing.

### A bye card shows his week

**A bye is a real shape, not a failed read.** The live 12-team league's first
playoff round is 2 matchups and **8 byes**, so a card with one team on it is the
ordinary case in mid-September rather than an error state.

**It drew a name, the word `Bye` and nothing else**, on the reasoning that a
category grid with one row in it is not a comparison. True, and it threw away
the thing a manager on a bye week actually wants: **his own numbers**. ESPN
fills `cumulativeScore` for a bye exactly as it does for a matchup — checked on
the live league, all 23 stats with the period's own figures (`R 24 · HR 7 ·
RBI 27 · SB 4 · OPS .677` over the week rather than the season) — so the line
was there all along and the card simply declined to draw it.

**So the card is one shape with one or two sides.** `sides` is `[away, home]` or
`[home]`, and the grid draws a row per side; what a bye loses is only what it
genuinely hasn't got — an **opponent** to be winning or losing against, so the
cells take no color (measured: 0 colored of 10), and the **headline triple**,
which is a count of categories won and is nothing at all with nobody to win them
from. The word `Bye` takes the slot that triple would have had, which is where a
reader's eye already is.

**And its door reads `Team →` rather than `Breakdown →`**, there being no
breakdown to open — the page goes straight to his roster (below).

**The period is navigable and its dates are printed.** `‹ WEEK 19 · Aug 10 –
Aug 14 · Live ›`, with the two arrows as the app's `--control-h` icon square and
the middle the app's own date face, which opens the league's weeks as a list —
see *The week reads like the app's date face* below. The dates are not
decoration and the `Live`/`Final` tag beside them is what makes them readable: a **live** period's totals cover the days played *so far*
(ESPN's `pointsByScoringPeriod` truncates at its own current day), so the span
and the tag have to be read together or the numbers claim a whole week they have
not had. Measured on the live league: week 19 reads `Aug 10 – Aug 14 · Live`
against week 18's `Aug 3 – Aug 9 · Final`.

**The forward arrow is disabled on the week being played and stays that way**,
because ESPN materialises no future matchup period at all — there is nothing to
navigate to. Disabled rather than hidden: a control that comes and goes is
harder to aim at than one that dims, and its absence would say nothing about
why.

**`mp=` is in the URL only once the reader has navigated off the current
period.** Absent means *the one being played*, which is a **rule rather than a
value** — the same reasoning that keeps a date preset in the URL as its label
rather than as two dates, so a link shared this week opens on the week the
recipient is in rather than on a frozen one. Driven in a browser: the current
period writes no `mp`, `‹` writes `mp=18`, `‹` again `mp=17`, `›` back to
`mp=18`, and `?view=league&mp=14` opens on `Week 14 · Jun 29 – Jul 5 · Final`.

**The season table** is every team against every one of the league's own
categories, sortable per column, with the reader's own row marked by an accent
ring on its team badge — see *The rank is a badge and the badge is the scale*
below, which is also where the 12% accent row wash this sentence used to
describe went and why. The team cell carries the logo, the name, and the record,
streak and (in a points league) the points total on a second line.

**A logo is an arbitrary third-party URL and is treated as one.** ESPN lets a
manager upload anything: the live league carries images on `thespun.com` and
`pbs.twimg.com` beside ESPN's own CDN. `onError` swaps to the club's
abbreviation rather than leaving a broken-image glyph, which is the fallback
`TeamMark` already makes for an MLB cap that fails to load.

**A second small sort rather than the research board's, and that is the lesser
evil.** The board's sort is written against its `Column` vocabulary —
`value`, `toValue`, `ascFirst`, forty definitions of a derived rate — and none
of that exists here: these columns are **discovered at runtime** from the
league's own `scoringItems`, so there is no `Column` to reuse and nothing but a
comparison over `Record<number, number>`. What *is* reused is everything a
reader can see. `.league-table` is folded onto `.glog-table`'s selector lists
(one gutter clamp, one zebra stripe, one pinned first column, one set of
paddings) and onto the board's `.research-sort` / `.research-arrow` rules, which
is where the reserved arrow box, the accent-on-active header and the focus ring
come from — so a sorted header here is the same object as a sorted header on the
board, by construction rather than by care. Two of the board's own rules come
with it: **`ascFirst` per column**, so ERA and WHIP open on their good end
(checked: one press of `ERA` gives ▲ and `3.29 · 3.45 · 3.61` down from the top,
where `HR` gives ▼ and `232 · 223 · 221`), and **nulls to the bottom in both
directions**, a team with no figure not having a bad one.

### The name over the record, a badge on every category row, and the label beside them

**The record was beside the name and is under it.** The two are not the same
kind of fact — the name is who this is, the record is how their season has gone
— and on one line they read as a single run of text: the record sat *between*
the name and the headline score, so it competed for the very slack the name
needs to ellipsize into and it moved about the row as the name grew. Stacked
(`.lg-side-id`), the name has the whole width and the record is a caption on
it, which is the shape the Rankings table's own team cell has had all along
(`.lg-row-name` over `.lg-row-sub`) — so a manager reads the same two lines on
both tabs.

**It gives the name width rather than costing it.** The row is logo, identity,
score; taking the record out of the line hands the name about 40px and the
wider badge takes 8 of it back. Measured at 320 — the width where this card
first truncates — **2 of 12 names ellipsize**, against a row that had the
record in the middle of it. Height is unchanged: the two lines are 30px inside
a `.lg-side` that is **37.98px** at every width, the row having been set by its
26px badge and its padding rather than by one line of text.

**And each side's category row carries that side's badge.** The two rows under
`BATTERS` are in the same order as the two names above them — which is a thing
the reader has to hold in their head, and has to hold **twice** on a card that
draws a batting block and a pitching one. The badge says it on the row.

It is a **column of the same grid** rather than anything laid beside it:
`grid-template-columns` names the first column and `grid-auto-columns` goes on
sizing every implicit one after it, so the categories share the slack however
many of them a league scores. That is the whole of the change to a block whose
column count is the league's rather than ours.

**And the `BATTERS` / `PITCHERS` label is what that column holds in the head
row**, where it was a line of its own above the block — 15px a block and **30px
a card**, on a card that is read as a list of ten. The head row had to hold a
cell there anyway (a grid row whose first cell is missing puts every label a
column left of its own numbers), so what was an empty spacer now carries the
word, and the word sits directly over the badges it names. It is
**left-aligned** with no side padding where every other cell in the row is
centered, which puts its left edge on the badges below it and on the matchup
row's own badge above — one edge down the card.

**The column is 58px and the category floor pays for it.** 58 is `PITCHERS` at
this type with a pixel to spare (against the badge's 24), and the floor comes
down `minmax(42px, 1fr)` → `minmax(36px, 1fr)`, which is what keeps a 320px
phone from scrolling: 58 + 5×36 + 10 of gaps is 248 against the 250 the card
has there. 36 is still above what any cell in this block needs — the widest
header is `SVHD` at ~30px and the widest value a four-character rate — and the
row's own `min-width: min-content` is what makes a longer-labeled league
scroll rather than clip.

**It costs the block no scroll**, which is the measurement that mattered: the
split into a batting block and a pitching one is what stopped this line
overflowing a phone by 118px, and spending that back on a leading column would
have undone it. Measured on the live 12-team league, `scrollWidth -
clientWidth` is **0 on all four blocks at 320, 375, 390, 640 and 1200**, with
the page body overflowing by 0 at each and **no cell clipped at any of them**
(the label included, which clipped by exactly 1px until its side padding went).
The badge lands at the same x as the matchup row's own (35 at 390, 213 at
1200), the value rows are **21px** against the head's 18 — an 18px mark inside
a line that was already 19px of text and padding — and the block itself is
**84 → 69px**, taking a matchup card from **281.97 → 251.97**.

### The Projected toggle is the matchup page's, not this board's

**This replaces seven sections, and the reversal is worth reading rather than
deleting.** The `Projected` toggle was built here — at the right of the period
head, beside the `Live`/`Final` tag it lit — and it swapped every figure on every
card for its projected final total: dashed borders on ten cards, `Projected` in
place of `Live`, and the header's dates running to the end of the period rather
than to today. Then it was given to the matchup page as well, on the argument
that the three objections to putting it there had each been paid. It is now the
matchup page's **alone**.

**What made keeping both untenable is one press.** With the button gone from
this head — which is what was asked for — a lens turned on over there and
carried back here would leave ten dashed cards under a tag reading `Projected`
with **nothing on screen to turn it off**: a mode with no visible way out, which
is the one thing this app's own rules name outright. The alternatives were to
keep a control that had just been removed, or to have the board silently ignore
a param the page beside it honors. So the lens is scoped to the page that owns
the toggle, and this board says what has happened, full stop.

**And that is the better division anyway, for the reason the category chart's
own move records one section down.** A board is **ten summaries scanned at a
glance** — it answers *is anybody winning* — where a projection is a thing to
**study**, which is what the matchup page is for. Putting the study lens on the
summary was the same mistake as hanging a day-by-day chart off a four-character
cell: right in the sense that the data was there, wrong about which page the
reader is on when they want it. The two questions now come in the order they are
asked: this page says who is ahead, and the page it opens says where that is
heading.

**What went with it.** `Scoreboard` lost its `projection` / `projected` /
`onProjected` props, `MatchupCard` lost its `projected` prop, `.lg-matchup.lg-proj`
lost its rule (nothing sets the class), the header's state tag is two values
again, and a cell's tooltip says `so far` or nothing rather than choosing between
two tenses. **`asProjected` stays exported** — it is what the matchup page swaps
its own figures with, and it is deliberately the *same* function rather than a
second one that agrees today. `.lg-state-proj` stays too, being that page's tag.

**`proj=1` is scoped one question tighter**, and the projection read with it.
The param is written only where a matchup is open (`view === 'league' && matchupId
!= null`), and the read is gated on the same test — so a reader who never opens a
card never pays for four league-wide boards joined against every roster in the
league, where before entering the Scoreboard tab with the toggle on was enough.
Rankings and Transactions drop it exactly as they did; a link carrying it opens
the matchup it names with the lens in force.

**Two things it did not touch.** The live poll still reads the board on the
Scoreboard tab *or* with a matchup open (`scoreboardLive`), because the matchup
page is drawn from that same board and would otherwise sit still while it was
open. And the key that explains the method is unchanged and is now genuinely
shared — see below.

### The key and the glyph are one component, in `components/Projection.tsx`

**There are two projections in the app now and neither owns the idea.** The
League page projects a **matchup** — a team's total added to what ESPN has
already scored — and the Roster view projects a **player** over a span of days
(see **Client — the Roster view**, *The Projected reading*). Both are the same
engine (`server/src/projection.ts`) asked a different question, so the mark on
the toggle and the account of the method are shared rather than copied: two
glyphs would be two marks for one concept, and two keys would be two accounts of
one method, free to drift the next time the engine moves with nothing on screen
to say which was stale.

`ProjectedGlyph` is the rising line; `ProjectionKey` is the four paragraphs, and
it takes **`days`** rather than a whole `EspnProjection` — which is what let the
second caller use it at all. Its `categories` prop is the League page's half and
is **absent on the Roster view**: there the figures are a player's line rather
than a side's score in the league's own categories, so a sentence about them
would be a sentence about nothing, and the first paragraph says *what he has
already done plus what he should add* instead. `ProjectedTools` — the button and
the key as one row, with `.lg-proj-tools`' own layout — stays in `LeagueView`,
being the matchup page's control rather than a shared one.

**`prettyDate` moved to `lib.ts` in the same breath**, for the same reason one
level down: four surfaces print a span of days now (this view's period header,
the Rankings caption, a matchup's head and the Roster view's projection note),
and the fourth is not a league page at all. `LeagueView` re-exports it so its two
neighbors' import sites are untouched.

### A category's chart is on the matchup page, not here

**This section used to describe a press on a scoreboard cell, and the press has
moved.** What stood here was the whole of it — the value cell as the target, a
real `<button>` stopping the press reaching the card, 20 tab stops a card and
200 on a ten-card board, the dotted underline and the measured 50%, and a hint
line under the period head. It shipped working and **nobody could find it**,
which is on the record because it had to be reported: *"how do I view it? I
don't see it."*

**The placement was the fault rather than the affordance.** A card here is a
*summary* — ten of them, each a grid of twenty figures, on a page whose job is
to be scanned — and a chart of one category is a thing you *study*. Hanging the
study tool off one number of the summary put the two at odds: the figure is four
characters wide, and the card around it is itself a press into the matchup, so
the plain reading is "the card is the button" and the numbers in it are text.
Marking the numbers harder was answering the wrong question; the underline and
the hint are gone with the press.

**It is the matchup page's now**, where the rows *are* the category comparison
and a row is 862 × 40px rather than four characters — see **Client — a league
matchup**, *A category row opens its chart*. The scoreboard cell is a plain
`<span>` again with its title, exactly as it was before any of this: measured on
the built client, **0** `.lg-cat-btn`, **0** `.lg-cat-hint`, and
`text-decoration: none` on the cell.

**What survives untouched is everything below the press** — the route, its
caching, the series semantics and the chart component — which is why moving it
cost the server nothing at all.

### The four league formats, and the two it refuses to guess at

**The view is honest about the league it is looking at**, which took reading
`mSettings.scoringSettings.scoringType` rather than assuming head-to-head
categories:

- **`H2H_CATEGORY` / `H2H_MOST_CATEGORIES`** — matchups with a category line.
  This is what the live league is (`H2H_MOST_CATEGORIES`) and what everything
  above was measured on. The two share a bucket because the scoreboard is the
  same object either way: what differs is only how the league's *standings* are
  kept, and those are read off `mTeam` rather than computed.
- **`H2H_POINTS`** — matchups with one number a side. Drawn: the card's headline
  number becomes `totalPoints` and the category grid is not rendered at all,
  since there is none. **Unverified against a real league** — there was one
  league to test against and it is a category league — so this is the one part
  of the page a reviewer should be skeptical of.
- **`ROTO` / `TOTAL_POINTS`** — no matchups by design. The scoreboard half says
  so, naming ESPN's own word for the format, and the table stands alone, which
  in a roto league is the whole of what the league *is*.
- **Anything else** — named and refused: `This league's scoring isn't supported
  yet`, with `scoringType` printed. The table still draws, since `valuesByStat`
  is there whatever the format. A wrong scoreboard drawn confidently is the
  failure being avoided; a named refusal is one a reader can act on.

### Loading, and every state that has nothing to show

The app's own discipline, unchanged. **Never over data**: the previous board is
left standing while the next is in flight (`setScoreboard` is called on success
alone), so pressing `‹` does not blank the page. A **block wait** only when
there is nothing yet, behind `useDelayedFlag`'s `WAIT_DELAY` — the spinning
baseball over `Reading your league's scoreboard`, which names what is being
read the way every other wait in the app does.

**Each empty state names its own cause**, driven in a browser with the relevant
response stubbed:

| state | what it says |
| --- | --- |
| no league connected | `No fantasy league connected`, over a button that opens the league page |
| cookies expired (409 `espn-auth`) | `Couldn't read your league` over ESPN's own message — *the espn_s2 cookie expires — sign in to ESPN again and re-copy it* |
| roto / total points | `No matchups in this league`, naming `scoringType` |
| a scoring type this page has not been read against | `This league's scoring isn't supported yet`, naming `scoringType` |
| a period ESPN has no schedule for | `No matchups in week N` |
| no teams at all | `No teams in this league` — usually a league id for another season |

**The 409 is handled rather than swallowed**, which is what the route's
`code: 'espn-auth'` is for: `api.ts` treats a 401 as an expired *Cognito* token
and retries it, so a credential problem answered as 401 would be a silent retry
loop. Measured with the scoreboard route stubbed to 409: the page draws
`Couldn't read your league` with ESPN's sentence under it, and the League pill,
the other three views and the page's own chrome are all untouched.

### What it draws and what it deliberately does not

The League page is neither a roster reading nor the board, so it carries **no
kind tabs, no date control, no `Starters` toggle** and none of the report's own
waits or empty states. Every one of those was gated on `view !== 'research'` —
right while Research was the only page that is not a roster reading, and the
League view is the second — so the nine render sites now read
`isRosterView(view)`, a named test over `summary | feed`. **The three *effects*
that carried the same string were left naming the board**, which is what they
always meant: the ownership read the board depends on, the statuses map it
draws, and the board's own fetch. Measured: on the League view `kind-switch`,
`date-toggle` (`date-bar` since) and `starters-toggle` are each **0**, and on Roster and Feed each
is **1**, unchanged.

**The scroll offset keys on the view alone** (`'league'`), exactly as the
research board's does, because this page has no kind: it is one board about one
league.

### Measured

Driven against the built client and the live 2026 league at **390×844 and
1200×900**:

- **Page-body overflow 0** at both, and at 320 / 375 / 640 / 900 / 1920 as well,
  on all four views. (One real overflow was found and fixed on the way: at 320
  the `Bye` card's name carried `flex: none` beside `white-space: nowrap`, so a
  long team name pushed the `Bye` tag **3px past the edge of the page**. The
  name is elastic like every other row's now, `margin-left: auto` on the tag
  being what puts it at the right end.)
- **Week 19 · Aug 10 – Aug 14 · Live**, 10 matchups of which **8 are byes**, the
  reader's own first and the only one carrying `.lg-mine`.
- The category head reads `R · HR · RBI · W · ERA · SB · WHIP · K · OPS · SVHD`
  — the league's own ten, in the league's own order — and the two real matchups
  carry **17 wins, 17 losses and 6 ties** across the 40 cells they have between
  them.
- The table draws **12 rows** with **1** on the accent wash, its header the same
  ten categories, the pane bleeding to **0 from both edges** at 390 (`paneW`
  390, `paneL` 0) with the table itself 739px inside it.
- The card column is **346px at 390**, which is the app's own gutters.

**Bundle: 466.09 → 475.20 KB of JS** (138.60 → 141.24 gzipped) and **106.85 →
111.03 KB of CSS** (19.09 → 19.77 gzipped) — 9.1KB and 4.2KB raw, 2.6KB and
0.7KB over the wire, for a view, a route, a component and the paragraphs above
restated where the rules are.

### Three tabs, because they are three questions

**The page above is described as two blocks and is now three tabs** —
`Scoreboard`, `Rankings`, `Transactions` — and the passage before this one is
kept as written because its argument for the *page* is unchanged: this is still
the one view about the fantasy league rather than about players, and it still
earns a pill rather than an entry in the fantasy popover. What changed is that
one page holding a scoreboard with a season table stacked under it was a page
with one question and a half, and it has three:

1. **Scoreboard** — every matchup of one period, the category line under both
   sides. *Is anybody winning.*
2. **Rankings** — every team's figure in every category and where that figure
   stands, over a span the reader picks. *Why.*
3. **Transactions** — who added, dropped and traded whom. *What has been going
   on.*

**The season table moved into Rankings rather than staying beside the
scoreboard**, which is what makes the split three questions rather than two and
a leftover: it *is* the answer to "why", read the other way round.

**It was four for a while**, a `Matchup` tab leading them, and that is the one
of the four that did not belong: the other three are three readings of *the
league*, where a matchup is **one row of the first of them opened up**. A tab
row is a set of siblings, and one of the four sat at a different depth from the
rest — which showed in what the strip could not name. A tab has to say what its
page is about, and `Matchup` could not say *which*: the page answered that with
a dropdown of ten pairs of team names, sitting above the very thing it selected.

It is a **page over this view** now, opened from the scoreboard card that names
it — see *A matchup is a page, not a tab* below. `lt=` goes back to omitting
`scoreboard`, and an older `lt=matchup` is read as the board that matchup was
always a row of (checked: the link opens on the Scoreboard with `lt` dropped
from the URL, and one carrying `mup=` as well opens the page over it).

### The week reads like the app's date face, and it opens the league's weeks

Two changes to one control, made together because they are one question: *which
week is this, and how do I get to another one.*

#### It printed the same kind of fact as the date bar, in the opposite order

**`.lg-period-label` was `Week 19` at 15px bold over `Aug 10 – Aug 19` at 12px
muted** — the qualifier large, the days small. Four lines of chrome above it, on
the Roster and the Feed, the app's own date face prints the qualifier as 10.5px
small caps *above* the days at 15px bold. Two faces stating "which days these
numbers are of", inverted with respect to each other, on pages a reader crosses
between in one press.

Printed side by side before this, at 1400:

| | upper line | lower line |
| --- | --- | --- |
| Roster's date face | `TODAY` (10.5px, 800, muted, small caps) | `Wed, Aug 19` (15px, 800) |
| Scoreboard's week | `Week 19` (15px, 700) | `Aug 10 – Aug 19` (12px, muted) |

**They are the same object now**: `.date-face` outright, folded onto in the JSX
rather than restyled here, with `.date-face-lead` carrying `Week 19` and
`.date-face-range` the days. The three rules it replaced —
`.lg-period-label`, `.lg-period-n`, `.lg-period-dates` — are gone.

**And the days go through `wideRange`, not a second `prettyDate` pair.** The two
functions agree on a range (`Aug 10 – Aug 19` either way) and part on a single
day: `prettyDate` says `Aug 19` and `wideRange` says `Wed, Aug 19`. That is not
a cosmetic difference here — the **first day of a live period** is exactly a
one-day observed span, so the header's own commonest edge case is the one the
two spellings disagree about. One function, and the weekday rides where it is
worth something, which is the roster face's own rule.

Measured after, off the two rendered pages at 1400, the computed styles are
identical line for line — upper `10.5px / 800 / uppercase / rgb(158, 161, 162)`,
lower `15px / 800 / none / rgb(223, 225, 226)` — reading `TODAY · Wed, Aug 19`
on the Roster and `WEEK 19 · Aug 10 – Aug 19` here. The face is **172 × 39** at
1400, 390 and 320 alike against the roster face's 200 × 39 — one height, one
shape, and the week and its days on one line at every width. (172 is declared rather than inherited:
`.date-face` is `max-content` with a percentage floor, which is right in a grid
column that is already the middle of a full-width bar and wrong between two
arrows in a shrink-to-fit row, where the percentage resolves against an
indefinite width. The old label reserved 108 and wrapped.)

#### And the face opens the league's weeks as a list

**‹ and › step one period, so week 3 from week 19 is sixteen presses** — and a
reader who wants *the week of the trade deadline* has no way to ask for it at
all. The face opens the league's own matchup weeks, each named and dated, and
picking one calls the very same `onPeriod` the arrows call: one door, two ways
in, not two mechanisms.

**Driven at 1400, the arrow and the row are byte-identical**:

| move | face | tag | cards | URL |
| --- | --- | --- | --- | --- |
| — | `WEEK 19` · Aug 10 – Aug 19 | Live | 10 | `?view=league` |
| ‹ | `WEEK 18` · Aug 3 – Aug 9 | Final | 6 | `&mp=18` |
| › | `WEEK 19` · Aug 10 – Aug 19 | Live | 10 | `&mp=19` |
| list → `Week 18` | `WEEK 18` · Aug 3 – Aug 9 | Final | 6 | `&mp=18` |
| list → `Week 3` | `WEEK 3` · Apr 13 – Apr 19 | Final | 6 | `&mp=3` |

The last row is the point: one press for what sixteen would have been, and
`mp=` still carries the period the same way, so a link out of the list is the
link the arrows would have written.

**No new upstream, and that was the constraint.** `leagueMeta.periods` is
already in hand on every scoreboard read — it is what `prevPeriod` and
`nextPeriod` are computed from — and `dateForPeriod` is one cached anchor plus
`addDays`. So `EspnScoreboard` gained a `periods: EspnPeriodSpan[]`, filled from
the same two calls the header's own `start`/`end` are filled from, and the whole
list costs no request. Checked on the live league: **19 materialised periods,
contiguous, no gaps**, `Week 1 · Mar 25 – Apr 5` through `Week 19 · Aug 10 – Aug
19`, and the entry for the live period is byte-identical to the header's own
dates. **No cache version was bumped and none was owed**: the scoreboard's
frozen blob holds `EspnMatchup[]` and nothing else, so nothing reads this field
back out of one.

**The dates are the observed span, deliberately** — the same truncation the
header carries on the live week. A list whose row for the week you are on read
further than the face above it does would be two dates for one week, and the
face's is the one the numbers on screen actually are. The whole-period reading
exists and has its own route (`/api/espn/matchup-window`), for the
forward-looking question that answers.

**Newest first.** The board opens on the week being played and the weeks a
manager looks back at are the ones just behind it; ascending, the live week is
nineteen rows down a scrolling list and the common errand is the expensive one.
Reversed on the client rather than on the wire — the server publishes the
schedule's own order, which is what `prevPeriod` and `nextPeriod` index into.
The **selected** week is brought into view on open regardless, written as a
`scrollTop` rather than `scrollIntoView`, which scrolls every scrollable
ancestor including the page and would carry the board out from under a popover
that has just opened. Driven at 390 on `?mp=3`: the list opens at `scrollTop`
46 of a possible 46, with `Week 3` visible.

**It hangs off the head row, not off its own group** — `.lg-proj-key`'s measured
trick, one edge over. The group sits behind the ‹ arrow, so its own left edge is
**62px** in at 320, and a 260px panel from there runs 62 → 322 against a 320
window: measured at **2px of page-body overflow** before the anchor moved.
Against `.lg-head`, which is the content width at every size, `left: 0` is the
app's own gutter. Measured, open:

| | panel | runs | foot | window | overflow-x |
| --- | --- | --- | --- | --- | --- |
| 1400 × 900 | 260 × 658 | 300 → 560 | 834 | 900 | 0 |
| 390 × 844 | 260 × **612** (capped) | 22 → 282 | 832 | 844 | 0 |
| 320 × 844 | 260 × **531** (capped) | 22 → 282 | 832 | 844 | 0 |

The cap is `usePopoverFit`'s `--popover-max-h`, and it is doing work rather than
sitting there: the list's natural height is **656** at every width — 19 rows —
so a phone is 44 to 125px short of it and scrolls inside the panel, with
`overscroll-behavior-y: none` so a flick that runs out of weeks does not carry
the board under it.

**It dismisses like every other popover in this app.** `useDismissable`, so
Escape undoes exactly this one thing and an outside press is spent on the
closing: driven at 1400 with the list open, a single press on the matchup card
behind it **closed the list and did not open the matchup** (`?view=league`
unchanged, no `mup=`), and a second press on the same spot opened it
(`&mup=109&mt=6`) — which is what a first press dismissing means and what every
platform does.

### The period arrows live inside the Scoreboard tab

**A control above the strip is a control over the page, and this one governs
exactly one third of it.** Rankings has a span filter of its own — four named
cuts rather than a week at a time, which is a *different* question — and
Transactions is a feed with no period on it at all. Left above the strip,
`‹ Week 19 ›` would sit over two tabs it says nothing about, and a reader
pressing it on the Transactions tab would watch nothing happen.

The app's own precedent is the **date control**, which sits with the roster tabs
it qualifies and is hidden on the research board it does not. So the arrows, the
`Live`/`Final` tag and the dates go inside the tab they belong to, and
`Scoreboard` is a component of its own holding all four.

**`mp=` is therefore the Scoreboard tab's parameter alone**, and nothing about it
moved: absent still means the period being played, and `‹` still writes `mp=18`.
The matchup page has no arrows of its own for the same reason read the other
way — it is opened on one week's matchup, and *which week* is a question the
board it was opened from asks.

### Which tab is open is in the URL, and so is the span

**`lt=` for the tab and `lspan=` for the Rankings span**, both by the rule
`view=`, `win=` and `mp=` follow: each decides what data is on screen, so a link
that leaves one out describes a different page. The Scoreboard is the default and
is omitted, so a bare `?view=league` opens where the page always opened; the
span default is **`matchup`** and is omitted the same way — which also means a
link shared without one opens on the *recipient's* own current matchup rather
than on the sharer's, the rule a date preset already follows by carrying its
label rather than two dates.

**`mup=` is on that list too and is not a tab**: it names the matchup whose
*page* is open over the view, the way `player=` names the player whose page is
open over everything. So it is written whatever tab is behind it, and it is what
makes a matchup shareable — which is the whole reason the page needs no picker
of its own. Stepping the period clears it, a matchup id belonging to one week.

**And `mt=` beside it names which page *of* that matchup is open**, as the team
whose page it is — absent meaning the Summary in the middle. It is written only
alongside `mup=`, since a side with no matchup to be a side of says nothing, and
it is **a running record rather than an opening**: the page reports its strip
back up (`onSideTeam`) so the link describes what is in front of the reader
rather than only what it was opened on. Pressing `Summary` therefore drops it,
and a link that names a team this matchup has no side for self-corrects to the
Summary and drops it too. See *A Rankings row opens that team's matchup* below,
which is what needed it.

**A team id rather than `away`/`home`**, because a team id is what every caller
knows: a scoreboard card knows the pair and names neither, a Rankings row knows
one team and nothing about which side of a matchup he is. Working that out is
the page's job, it being the one thing holding the matchup — and the id survives
a reading a side never could, a **bye** having a home and no away at all.

**`lspan=` is deliberately not `win=`.** That one is the research board's own
window and means five different spans of a different thing; one parameter meaning
two things in two views is exactly the trap `cols=` avoids by being scoped to the
board `pos=` names. Neither name can collide, nor does `mt=`: the app's other
params are `preset`, `start`, `end`, `player`, `view`, `kind`, `sim`, `hideil`,
`starters`, `sched`, `plays`, `newplays`, `roster`, `pos`, `cols`, `inc`, `scope`,
`watch`, `win`, `help`, `mp`, `proj`, `mup` and `league`.

**Each tab's data is read on its first open and kept**, the way the player page's
tabs are — the rankings read is gated on `leagueTab === 'rankings'`, and each of
the responses carries its own `teams`, so no tab depends on another having been
opened. Nobody who only looks at the scoreboard pays for a 300KB aggregation of
the first half.

**Matchup and Scoreboard share one read**, which is `isBoardTab`'s whole job: a
matchup breakdown *is* one card of that board turned on its side, so the tab
needs no fetch of its own, switching between the two costs nothing, and the two
can never disagree about a figure. The live poll below is gated on the same
test.

**The transactions feed is the exception and is read on entry to the *view***,
any tab of it, and then kept (a `transactionsRef`, so the effect does not re-run
on its own result). It was gated on its own tab, on exactly the reasoning above,
and the dot below is what overrules it: *there are moves you haven't seen* is a
claim the tab row has to be able to make **before** the tab is opened, and
nothing else on the wire carries it. So the read moves one level out and the
86KB is paid on entry — answered from the server's own minute-long cache, and
about a tenth of that over the wire once `compression()` has had it.

### The page updates itself, a minute at a time

**Polling was half the fix, and on its own it fixed nothing.** The page was
still reported stale after the poll shipped, and the cause was not on this side
of the wire at all: ESPN's `cumulativeScore` — the figure every matchup cell is
drawn from — **stops at yesterday**, covering every scoring period of the week
except the one being played. A poll can only be as live as the number it
re-reads, and that number does not move until ESPN's nightly batch. The server
adds the missing day now; the whole of that measurement, the two guards that
keep it from double-counting at the rollover, and the `cumulativeScoreLive` dead
end are in **ESPN fantasy league**, *`cumulativeScore` stops at yesterday*. What
follows is the client half, which is unchanged by it.

**The three tabs are the one part of this app that describes something which
moves while you watch it**, and until now all three were read on entry and then
left: a matchup's category totals climb through an evening's games, the standings
under them climb with them, a leaguemate can drop somebody at any hour, and a
page anybody actually sits on quietly went stale. It polls now
(`App.tsx::LEAGUE_POLL_MS`), and the whole of the design is four rules.

**A minute, not the report's twenty seconds**, and the difference is what is
being watched. That poll tracks a *plate appearance* — the bases, the count, the
batter at the plate — where this tracks a **week's** totals, which ESPN's own
scoreboard does not move faster than about a minute anyway. The number is matched
to `espn.ts::LIVE_TTL_MS` so that a tick either reads a cache under a minute old
or goes and asks, which is the cheapest way to be a minute behind ESPN and no
more.

**A projected card is polled with the board it is drawn over.** Half of what one
shows is what the side has *already* scored and half is what the projection adds
to it, and only the first half was on this tick — so an evening's play moved one
half of every category and left the other where it was pressed. It is worse than
it sounds, because the projection's own share of a week only *shrinks* as games
are played (the engine projects the games that have not started), so the two
drifted apart in the one direction nobody can see on screen. The read rides the
same rules as the board: the lens on, a card open, and the week still live —
`App.tsx::pollLeague`, and `LeagueMatchup`'s **team pages** set their own timer
by the same minute for the same reason (`LEAGUE_POLL_MS`, which moved to
`lib.ts` when the second file needed it). Measured on the live league with a
card open and `proj=1`: `espn/projection` on the open, then paired with
`espn/scoreboard` at 60s and at 120s — one read a minute, on the same tick,
with **0** spinners on the button.

**Only what is on screen, and only what can still change.** The scoreboard is
polled when its tab is open **and the week it is showing is still being played**
— a settled period is read back off a blob with no freshness test at all, so
asking again every minute would be a request a minute to be told a fact. The
rankings are polled when their tab is open and the span can still move, which is
the span's own `live` flag **plus `season`**: that flag answers a different
question (*do these numbers include a week still being played*, which is what
puts `so far` on the caption) and is `false` for the season, whose figure is
ESPN's running total and accrues all year. The transactions feed is polled
whatever tab is open, because the dot in the tab row is drawn from it.

**Quiet, which is rule 1 of the app's loading discipline stated for a read
nobody asked for.** No wait goes up, nothing is blanked, and a tick that *fails*
leaves the last good answer standing with no error banner over it — a page that
has been readable for ten minutes must not become a message because one poll lost
its connection. Component state survives it by construction: the Rankings table's
sort and the Transactions list's paging are plain `useState` with nothing keyed
on the data, so a new object underneath them changes the numbers and not the
reading position.

**A hidden tab is skipped**, which is where this parts from the report poll
deliberately: a league read is 10–120KB upstream against a league that has no
idea we are doing it, and a forgotten background tab polling it all night buys
nobody anything. Becoming visible fires a tick immediately rather than waiting
out the interval, so what a reader returns to is current — which is also what
keeps the dot honest.

**What it costs upstream is one league's worth per minute, not one per
reader**, and that is the measurement the cadence rests on: the server's cache
is keyed by league, so twelve leaguemates all sitting on the page cost the same
one read a minute that one of them does. Measured through the route on the live
league, with no poller running: a live scoreboard is **536ms** at the first ask
past the minute and **3.7ms** inside it; a settled week is **271ms** (its
`leagueMeta`, since the matchups themselves come off the frozen blob) and 1.4ms;
the transactions feed 140ms and 3.2ms.

**`Refresh from ESPN` changed with it, and in two ways that were wrong before.**
It used to *drop* the client's copy of the feed, which re-read the same
ten-minute server cache — so the one button whose whole purpose is "I have just
made a move" could not actually reach past it. It now asks with `?refresh=1`,
and it **sets** the answer rather than blanking first, so the tab stays readable
while the read is out where a null left it empty until the reader navigated away
and came back. Only when there is a feed to refresh: a reader who has never
opened the League page is not made to pay for one by pressing it.

### The League strip scrolls on a phone, where it used to wrap

Every group in `.view-bar-tabs` is `flex: none`, which is that row's own rule and
the right one: a group travels whole and the line breaks *between* two rather
than inside one. Four tabs is where that stops fitting — measured, the strip is
**377px against the 346** a 390px phone leaves inside the app's gutters.

**It wrapped within itself for a while** — the lesser evil `.research-tools`
names for a run of buttons that has outgrown a phone — and that rule is about a
*run of buttons*, where this is a **segmented control**: half of one on a second
line reads as two controls rather than as one that did not fit. It also spent a
row on the one view whose page wants its height. So below 640 it scrolls
sideways instead, which is the answer the app already gives every other strip of
pills that outgrows its width — the research board's position row, the window
tabs, the player page's tab strip and the tutorial's jump strip.

**Two declarations make it scroll rather than push**, and each answers a
different box:

- **`min-width: 0` on the strip.** A flex item's automatic minimum is its
  `min-content`, so `flex: 1 1 100%` alone left it at its full 377px and it
  never scrolled.
- **`min-width: 0` on `.view-bar-tabs` too.** That row is itself a wrapping flex
  item with the default `min-width: auto`, so its intrinsic width was the widest
  thing in it and the *row* overflowed the page while the strip inside sat there
  unscrolled. Measured at 390 with only the first: `.view-bar` 346 against a 377
  scroll width, **9px of page overflow** (79 at 320, 24 at 375).

**It hugs its pills rather than taking the row**, and that is a correction to
what stood here. It was `flex: 1 1 100%` — a full row of its own — argued from
four tabs and **377px** of content against a 346px phone, where the strip could
not share a line with the view switch anyway and the full width was what made
the overflow the strip's rather than the page's. With the Matchup tab gone it
has three tabs and **295px**, which fits every width from 375 up, and a basis of
100% then stretched the *shell* of a segmented control across the whole row with
its three pills bunched at the left end: measured, a **596px** band at 640 and
346 at 390 standing in for a control 295 wide.

`flex: 0 1 auto` is the row's own rule with the shrink left on: the group
travels whole and breaks between groups, and below its content width it gives
way rather than pushing the page. Measured after, the strip is **297px at 375
through 1920** and shrinks to 276 with a scroll at 320 — which is the one width
it still genuinely overflows — with **0 page overflow at every one**, and the
pinned chrome unchanged at 159px at 390.

**And the selected tab is scrolled into view**, by hand rather than with
`scrollIntoView`, which walks up every scrollable ancestor and would drag the
page with it — the rule the research board's position row already follows, peek
and all. `espnConnected` is in that effect's dependency list because it is what
*draws* the strip: on a `?lt=transactions` deep link the tab and the view are
already their final values when the effect first runs and the row does not exist
yet, so without it the effect ran once against a null ref and never again.
Measured at 390 before: `scrollLeft` 0 with `Transactions` off the right edge;
after, `scrollLeft` 31 with it fully visible, and the other three tabs untouched
at 0. (With three tabs the strip only scrolls at 320, and it still holds there:
`?lt=transactions` opens with `scrollLeft` 21 and the tab fully visible.)

**Measured, wrapping → scrolling**, on the live league: the pinned chrome goes
**232 → 207px at 320** and **184 → 159 at 375 and 390** — a row of pills back on
the one view that most wants it — and is byte-identical from 430 up, where the
strip fits on one line and keeps the row's `flex: none`. **0 horizontal overflow
of the page body** at 320 / 375 / 390 / 430 / 640 / 900 / 1200 / 1920.

**The `min-width: 0` on `.view-bar-tabs` is a no-op everywhere else**, which is
what had to be checked rather than assumed: it only bites where something inside
that row is genuinely wider than the window. A/B'd on the same page at eight
widths, the Roster, Feed and Research views are **identical in chrome height,
row count and overflow at every one** (roster 255/159/159/159/159/115/115/115,
feed 207/159/159/159/111/115/115/115, research 347/255/255/207/159/207/207/161).

### The three tabs are in the app's tab row

**They rendered on the page, directly above what they selected**, which is where
a tab strip belongs when the page is all there is — and this app already has a
row for exactly that statement. `.view-bar-tabs` holds the view switch, the kind
tabs and the roster row's own controls, and its whole rule is that each group is
`flex: none` so the row fits as many whole groups per line as the width allows.
A second strip of tabs an inch under the first read as a different kind of
control rather than as one tier down of the same one.

So `App` draws them there, beside where the kind tabs go and under the same
condition — **only on the League view**, exactly as the kind tabs are drawn only
on the two roster views, so no other page carries an empty slot. `LeagueView`
keeps the vocabulary (`LEAGUE_TABS`, exported) and has no `onTab` prop any more.
The strip is still folded onto `.view-switch` / `.view-tab`, so it is the same
object as the pills above it by construction.

**The Rankings span strip followed it there, and the `Projected` toggle after
that** — so on that tab the row reads *which page · which tab · which span ·
which figures*, which is the order the questions come in. The toggle's own
argument, and what a line of pinned chrome at 1200 costs, is in **Rankings**,
*The toggle is in the tab row, and the caption stayed behind*.

**The span strip lost its reading column with it.** It carried
`max-width: var(--card-column); margin: 0 auto` from when the page under it was
a list of cards; the table under it now spans the window, so a strip centered in
an 800px column floated in the middle of the page with the thing it governs
running past it on both sides. It sits at the app's gutters now, over a table
that bleeds past them — which is the arrangement the research board's own count
line already has.

### Where the rest of the League view's documentation lives

This file was 183KB — 17k of it added in one session — and is now four, on
`CLAUDE.md`'s own 150k-per-file rule and by the division `client.md` already made
one level up: **by the surface being described, not by size**. What is above is
the view itself and the **Scoreboard** tab, whose cards are the door to a
matchup.

- **`client-league-matchup.md`** — a matchup as a **page over** this view: the
  Summary page's categories down the middle, its scale, the acquisitions and the
  moves under them, and the two team pages, which are the app's own Roster and
  Feed views read for one manager.
- **`client-league-rankings.md`** — the **Rankings** tab: every team against
  every category over one of five spans, the three summary columns, the rank
  badge that colors it, and the press that opens a team's own matchup.
- **`client-league-transactions.md`** — the **Transactions** tab: the feed, what
  a row says about a player, and the dot on the tab.

Nothing was rewritten to fit its new file; **every one of the 2,502 non-blank
lines of the original is present exactly once across the four**, with nothing
added but the paragraph at the head of each. **Three sections did move** — the
two describing this view's own tab strip, which sat in the middle of matchup
material, and the Transactions dot, which sat between two matchup measurements —
and they moved with their wording intact. References elsewhere to "see **Client —
the League view**" still resolve, all four being imported together.
