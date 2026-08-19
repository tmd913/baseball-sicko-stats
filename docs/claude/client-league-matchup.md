### The matchup's Summary: the categories down the middle

Split out of `client-league.md`, which holds the view this is opened from. A
matchup is a **page over** that view rather than a tab in it, and this file is
the whole of it: the Summary page's category comparison and its scale, the
acquisitions and the moves under them, and the two team pages, which are the
app's own Roster and Feed views read for one manager.

**One matchup read the way a manager reads one**, and the shape is the whole of
it: the categories run **down the middle** with each side's figure beside its
own name, left and right. (It was a *tab* of the League view when this was
written and is the middle page of a matchup's own now — see *A matchup is a
page, not a tab* below. Everything here about the shape is unchanged.)

**Why that is not the scoreboard's card enlarged.** The Scoreboard answers *is
anybody winning* — ten cards, each a headline and a category line squeezed into
five columns a side — and it is read by scanning. This answers *am I beating
him*, which is read one category at a time, down: is he ahead in saves, by how
much, and is it worth chasing. Those are two questions about the same numbers
and they want two shapes, which is the same argument that made Rankings its own
tab rather than a block under the scoreboard. On the card the two sides are two
rows several categories apart and the eye has to hold a column to compare them;
here the two numbers being compared are on one line with the thing they measure
between them.

**A rule under each heading** (`BATTERS`, `PITCHERS`, `MOVES`), at the same
weight as the one under the two team names — the card's own divider. The rows
below carry a 55% hairline each, so a full-weight line reads as the start of a
section rather than as one more row boundary, which is what a heading with
nothing under it left the eye to infer from spacing alone.

**Batters first, then pitchers**, in the same order as the Scoreboard and the
Rankings table — `categoryGroups`, the one place in the client that splits them,
which reads the server's own `side`/`order` rather than guessing from a label
(`H` is a hit and a hit allowed; see *Which side a category is on*). On the live
league that is `R · HR · RBI · SB · OPS` then `K · W · ERA · WHIP · SVHD`.

**Green takes the category and the loser goes quiet**, which is the scoreboard's
own pair rather than a second one: a red loser would be half the page shouting
where the job is to mark a winner. The winner is computed here from the two
figures (`winnerOf`, `outcome`'s twin) for the reason that one is — ESPN fills
its own `result` only once a matchup is over, so a live week would say nothing —
and the two are deliberately the same arithmetic, which `espn.ts` has checked
against ESPN's answer on 1,080 finished categories.

**Any matchup in the league**, and **the scoreboard card is what names it**:
every card carries a **`Breakdown →`** door through to its own page. There was a
`<select>` here as well, listing every matchup of the period with the reader's
own marked `— yours`, and it went with the tab — a picker for *which page you
are on*, sitting on the page it selected. The board behind it is that picker,
and it is a better one: it shows the score of each matchup rather than only its
two names.

**The whole card is the door**, where a `Breakdown →` text link at its foot used
to be. That link was argued from accessibility rather than from the reader —
wrapping the card in one control would put a hundred titled cells inside a
single tab stop and one accessible name — and both halves of that are
answerable: an **`aria-label` names the two teams** (`Baldy's Bozos vs Sho me
the Parlay — breakdown`) rather than the whole grid being read out, and the
titles were never in the tab order to begin with. A card *is* a matchup, and a
press on it should open it, which is what every row of the research board and of
the Game Log already does.

So it is `role="button"` with a `tabIndex`, Enter and Space (the latter with
`preventDefault`, so it does not also scroll the board underneath), a pointer,
and a hover **scoped to `(hover: hover)`** for the reason every pressable
surface in this app is: on touch there is no pointer to move away, so the tint
sticks to the last card a finger crossed. Checked out of the CSSOM rather than
by reading the file: `.lg-matchup:hover` resolves `inside (hover: hover)`.

**A bye is a real shape** — the live league's first playoff round is two
matchups and eight of them — and it is now the one card that draws its team's
own week rather than announcing that there is no matchup: see *A bye card shows
his week* above.

### The Summary page is drawn, not just listed

**Everything above was true of the page and the page still read as a column of
numbers.** Twenty figures in the middle third of an 800px card, each pair a
subtraction the reader had to do in their head, ten times over — and the two
ends of the card, which is where the two teams are named, empty. The numbers
were right and the page did not say what they came to.

**The figures moved to the edges and a bar went between them.** A category row
is now `value · track · CATEGORY · track · value`, so each figure sits under the
team it belongs to and the bar between them runs **from the label toward
whoever is ahead**. That is the shape a duel wants: the direction is who, the
length is by how much, and the reader is left with the one question a
comparison actually asks rather than with its inputs.

**The length is `|a−b| / (|a|+|b|)`, and the point of it is that it needs no
calibration.** The Splits card's own diverging bar — the app's precedent for
this shape, and where the flat inner cap comes from (*a bar grows out of its
zero*) — measures a platoon gap against `full`, the 90th percentile of the
league's real gaps in that stat, because one hitter's split means nothing until
you know what a big split is. Here the comparison is already complete: two
teams, one week, one category. So the pair is measured against itself, the
result is in [0, 1] by construction (nothing can clamp, and a full bar means one
side has the lot), and what it says is **how close the category is** — which is
what a manager reads a matchup for. On the live league: `K 64–66` is a 2%
sliver and is a coin flip with three days to go; `HR 12–2` is a 71% bar and is
gone. It is deliberately not a probability and not a projection, and the two
figures are printed either side of it.

**Green and only green**, which is the page's existing rule rather than a new
one: the winning figure in a row is green, so the bar that says the same thing
is the same green, and the loser's track stays empty rather than taking a red.
A tie fills neither side. The track itself is `--border` at **32%** — measured
down from 50 because there are twenty of these and only one of each pair is
ever filled, and at full weight the empty halves were the loudest thing on the
card. What the rail is for is the *scale*, and that survives at a third of it.

**The whole matchup is one bar under the two records** (`.mup-meter`) — the
categories each side holds with the ties between them, so the boundary sitting
left or right of center is the week at a glance. Only the **leader's** run is
green; the trailing run is `--faint` and the ties are dimmer again, which is the
honest ordering, a tied category being one nobody holds. The counts are the
**server's own tally** (`side.wins/losses/ties`), the one checked against ESPN
on all 1,080 category comparisons of the league's settled weeks, and the triples
in the heads read those same three numbers — so the bar and the score cannot
come to disagree.

**Who is *ahead* is not who *won*, and reading the second for the first left the
live page marked with neither.** `matchup.winner` is null for the whole of the
week being played — the server sets it only once the period is settled
(`espn.ts`: `else if (live) winner = null`), because a winner is a settled fact
and ESPN's own field says `UNDECIDED` until it is one. Taken straight, that gave
the *live* matchup — the one anybody is looking at — two gray triples, an
unmarked pair of names and a meter with no green in it. So the page reads the
tally instead (`ahead`), which is the same comparison the server makes when it
does settle one (`hw > aw ? 'home' : …`) and which agrees with ESPN's own
`winner` on every one of the league's 108 settled matchups. `away.losses` is
`home.wins` by construction, so the two tests cannot both hold and a dead-level
week marks neither.

**Each side of the ball carries its own tally** — `5-0-0` and `0-5-0` at the two
ends of the `BATTERS` heading — which is the one thing this page could not say
before and the thing a manager acts on: *you are winning the bats and losing the
arms*. It is `winnerOf` over that group alone, the same function the rows
themselves use, so a heading and the green figures under it are one arithmetic;
the server publishes a tally for the matchup and not for half of it.

**The heading takes the row's own grid**, so the label centers over the column
of category names it heads and each tally lands in the column its own figures
are in. It was a left-aligned word at the card's edge, which named the group and
pointed at nothing in it.

**And the two columns are numbers rather than `auto`, which is what makes them
columns at all.** Each row is a grid of its own, so under `1fr auto 1fr` every
row sized its own middle column to its own label and `SVHD` pushed its figures
further out than `R` did — measured at 1200, `31` at x=927 against `.769` at
x=913. `--mup-val-w` and `--mup-cat-w` are declared on the card because four
things have to agree about them, and **each is re-derived whenever the type
moves** rather than carried forward — which is what the scale below made
necessary. They are **64px** and **52px**, measured by rendering the widest
strings this card can hold into the real cells at the real weights: the widest
figure a matchup period can produce is five tabular characters, and `1.024` and
`10.50` come to **53.53px** at 18px/700, leaving 10.5px of slack; the widest
label the league scores is `SVHD` at **39.16px** at 13px/700. The group tallies
share the figure column and are well inside it (`5-0-0` 38.4px, `10/10` 38.9 at
13px), so they never decide the width. They were 54 and 46 against a 15px figure
and an 11px label, i.e. the same slack at the smaller size. A figure past either
overflows into the track beside it, which is a legible overlap rather than a
clipped number.

**The `Moves` row draws no rails**, its two track cells being empty spans that
hold the grid's shape: nobody is winning acquisitions, and a rail says a
comparison is being drawn.

**One ⓘ covers both bars — and the gesture — and it sits beside the strip of
three pages.** The app's own `InfoKey`, for that component's stated reason (a
`title` is invisible on a phone, a `Modal` is ceremony two sentences cannot pay
for, an inline reveal fails on distance). Three paragraphs: the meter, a
category's own bar, and the press that opens that category's chart — see *The
gesture is named in the ⓘ* below, which is where the third one came from and
what moving it cost.

**It sat beside the meter it describes**, which is where a key usually belongs
and is the one place on this page it could not stay. The meter is a *row in a
card that scrolls*, so the key scrolled away with it — and what it explains is
not that bar alone but the ten under it, which the reader is still going down
when the button has gone. In the pinned head it is on screen for the whole of
that reading.

**It spent a round in the band's far corner and that was too far.** Absolutely
positioned against `.mup-chrome` it really was at the top right of the *screen* —
measured 16px from the edge at every width — and at 1920 that is a thousand
pixels from anything it explains, with the Back row made to reserve 34px for a
box it knew nothing about (measured, the week block reached x=371 against a
button starting at 344 at 390, and `PROJECTED` was drawn underneath it). Beside
the tabs it is where the reader's eye already is, and the reservation goes with
it: the band is back to **114px at 375 through 1920 and 145 at 320**.

**The row keeps the tabs centered *and* holds the key**, which a centered flex
row cannot do — `[strip][gap][key]` centered as a group puts the strip 19px left
of the middle, and the tabs are what a reader aims at. `.mup-nav-row` is a
three-column grid (`minmax(0, 1fr) auto minmax(auto, 1fr)`) with the strip named
into the middle column and the key into the third: the middle is centered between
two equal ones, and the **asymmetric minimums** are what make it give way the
right way round — the left column may collapse to nothing where the right may not
go under the key it holds, so a row that runs out of width slides the strip left
rather than pushing the button off the end. Measured, the strip's center is
**exactly the row's at 360 through 1920** and 12.1px left of it at 320, with the
key 8px past the strip at every width.

**Naming the columns is the whole of it**, and leaving them to auto-flow was the
one fault this arrangement had: the strip landed in the first column — a `1fr`
gutter — and centered itself *within that*, which at 1920 put it **483px left of
the row's middle** with the key 337px past it. One line says which column each
item is in.

**The narrowest screen pays 26px of tab label for the key's 30**, which has to
come from somewhere: at 320 the strip's own minimum is 262.3 in a row of 288, so
strip + gap + key came to 300.3 and the button hung 4.3px off the side of the
page. A third of an em off each *team* label under 360px frees more than enough,
and `Summary` is untouched — it is the tab a reader lands on and the one this
file already refuses to shrink.

**The panel is anchored to the band rather than to the button**, which is
`.roll-key`'s measured trick: a shrink-to-fit against a 30px box resolves to the
shared `min-width`, and a button in the middle of the screen has no edge for a
panel to open inside of. `.mup-chrome` is `position: sticky` and so already a
containing block, so `right: 16px` is the page's own gutter and the panel drops
clear of the whole band — measured 320 × 216 landing at x=54 of a 390px screen
and 276 × 233 at x=28 of a 320px one, inside the viewport at every width.

**And the headline went 15px → 19px**, and has since gone to **26px** with
everything else on the card — see *The card reads a size up* below, which is
where the whole scale is argued and measured. It was the same size as a category
figure ten rows below it, on the page whose whole subject it is.

**Measured at 320 / 390 / 900 / 1200 / 1920, live and settled.** No horizontal
overflow of the page body or of the overlay's own scroller at any width
(**0** everywhere); the card is 288 at 320, 358 at 390, **868 at 900 and 896
from 1100 up**; ten category rows plus the `Moves` heading that carries the two
acquisition counts. The bars are the arithmetic above, read off the rendered
boxes at 1200: `R 31–23` fills **47.5 of a 321px track** (15%), `HR 12–2`
**229.3** (71%), `RBI 28–27` **5.8** (1.8%, the honest fraction rather than the
2px floor), and on a settled week `ERA 0.96–3.12` **170.2**. The meter is
571 / 163 tied / 82 on the live 5-2-3 and 573 / 245 on a settled 5-5-0. Ties
draw no fill on either side (`K 66–66`, `W 5–5`), the leading team's name
computes `rgb(56, 189, 248)` and the other `rgb(232, 238, 252)`, and the group
tallies read `5-0-0` / `0-5-0` and `2-1-2` / `1-2-2`. The ⓘ opens a 320 × 173
panel at x=29 of a 390px screen (fully inside), and **Escape unwinds one rung
per press** — the key first, the matchup page second, `[inert]` back to 0. A bye
page draws no card, no meter and no strip, as it always did.

**One state is guarded rather than measured**: a **points** league has one number
a side, so the meter is null there twice over (`away && board.format !==
'h2h-points'`, and the render tests both) and the page draws its existing note.
There is one league to test against and it is a category league — the same
caveat the points card on the Scoreboard already carries.

### The card reads a size up

**Reported as "everything looks a bit small", and the diagnosis is that nothing
on this page was ever sized for the page it became.** Every figure, label and
rail on it was inherited from a *scoreboard card* — one of ten in a list, where
10px labels and a 6px rail are right — and then reused on a page whose whole
content is that one card. Measured before: the headline 19px, a category figure
15, a category label 11, the group heading 10, its tally 11, a Moves name 13, the
category rails **6px** and the whole-matchup meter **10**; and the card capped at
the app's own `--card-column` (800px), which is the width of a column of *prose*.
So the loudest thing on a page about two teams was 1.27× the smallest, and the
bars — which are what the page was redrawn around — were hairlines.

**The scale is spent on the reading order rather than evenly**, which is the
whole of the judgment. What a manager reads in this order gets the room in that
order:

- **The headline triple `19 → 26px`** — the one number the page is about, and now
  1.44× the category figure under it rather than 1.27×.
- **The category figure `15 → 18px`** and its label `11 → 13`, which are the pair
  the eye runs down; the figure keeps its lead over the label.
- **The two bars, which is where the picture actually lives.** A category rail
  `6 → 9px` and the whole-matchup meter `10 → 14`. Those are the largest
  proportional moves on the card (1.5× and 1.4×) and they are the point: the
  bars carry the comparison, and at 6px a fill of a few percent was a mark you
  had to look for.
- **The group heading `10 → 12` and its tally `11 → 13`**, which is what makes
  `BATTERS 5-0-0` read as a section rather than as small print.
- **The Moves names `13 → 15`** and their direction headings `11 → 12`, the one
  block on the card that is a list of people rather than of numbers.

**And the rhythm grows with the type**, because scaling the ink alone would have
tightened the card rather than opening it: a category row's padding `6 → 9px`
(the row itself 31 → 40), the group heading's `14/6 → 18/8`, the meter row's
`12/4 → 16/4`, the card's own padding `14 → 16`, and every gap on the head from 8
to 10.

**The card's own cap is derived rather than raised by eye.** `--card-column` is
the app's *prose* width and this card is a two-column comparison, so it is
`--mup-card-w` now, and the number falls out of the one thing on the card that
can genuinely run out of room: the team name in the wide head, which is
`0.5 × card − 176` (the badge, the headline column and the gaps). Swept in 10px
steps, the longest name in the live league — `Brian&Tom's Excellent Adventure`,
**268.9px** at 17px/700 — needs a card of **890**, where 848 gives it 247.8 and
880 gives it 263.8 and clips by five pixels. **896** is that with 2.9px in hand
and is what the token holds. It takes the category tracks from 294 to **321px**,
which is the same 27px the name got, spent twice over on the picture.

**The head is scaled inside `.mup-heads` alone, and that scoping is load-bearing
rather than tidy.** The team badge goes **34 × 26 → 44 × 34** (`--lg-logo-w` /
`-h` / `-glyph`, redeclared on the comparison head), the name `15 → 17px` and the
record `12 → 13`. The **bye** head is `.mup-team-head` and lives in the pinned
chrome above a *roster table* rather than over this card — it is one line naming
a team, not the subject of a page — so it keeps the scoreboard's own sizes and is
byte-identical: measured, `.mup-chrome` is **145px at 320 and 114 above it before
and after**, with the badge still 34 × 26. That is also why the name and record
rules are written `.mup-heads .mup-side-name`, two classes deep: `.mup-side-id`
is the bye head's block too, which is the same trap the phone reorder already
records one section down.

**The phone reorder moved 480 → 640, and it is a re-derivation rather than a
tidy-up.** That breakpoint was measured against a head whose badge was 26px wide
and whose headline was 19px; at 44px and 26px the wide head spends 44 more
pixels on the badge and about 30 on the triple, so the name column runs out
sooner. Measured with the old 480 in place, `Sho me the Parlay` (146px) clipped
into a 128px column at **640** and stayed clipped down to 481 — i.e. the old
breakpoint had become 160px of new clipping. At 640 the stacked head gives the
name **207px at 641 and 282 at 900**, and the only widths that still clip are
**650–670**, and only the two longest names in the league. 640 is also the app's
own narrow threshold, which is what the block was reaching for in the first
place.

### The narrow-screen blocks had never applied, and measuring them is what found it

**Five of the ten declarations in `@media (max-width: 480px)` had been dead since
they were written**, and nothing on screen said so. A media query adds no
specificity, so a rule inside one loses to a later rule of equal specificity —
and that block sat *above* `.mup-group-head`, `.mup-row`, `.mup-cat`, `.mup-val`
and `.mup-move`, every one of which is declared further down the file. So the
≤480 tier was drawing the **desktop** figure and label sizes, the **base** row
gap, and a category track 8–9px narrower than the tier intended, on the one width
class the block exists for. Measured at 320 before the move: the row gap resolved
to the base 8px against the block's 6, and `--mup-val-w` / `--mup-cat-w` to the
desktop pair.

**It is the same trap this stylesheet already documents three times** — the
narrow-screen rhythm block being last in the file, `.date-row .date-presets`
going two classes deep, and the `.starters-toggle` glyph rules that had to move
below `.research-toggle`. The fix here is the file-order one rather than the
specificity one, because it is a whole block rather than a rule: both media
blocks now sit **after `.mup-note`**, which is the last `.mup-*` rule they
override, with a comment at the top of them saying so.

**What that fixes is a tier nobody had seen**, so the ≤480 numbers are set
against the new scale rather than restored: `--mup-val-w` 52 / `--mup-cat-w` 42
(the same slack the desktop pair has, at 16px and 12px type), `--mup-track-h` 8,
the card's padding 12, the row and heading gaps 6, the figure 16, the label 12,
the Moves name 14, the headline 18 and the head's name / record 14 / 12.

**The narrow tier scales less than the wide one, and both places it stops short
are measured.** The **tracks**: at 320 the card has 264px of content, so three
fixed columns and four gaps take 170 and each track keeps **47px** against the
54 it had — seven pixels, where matching the desktop's 64/52 would have cost 20
and left a bar too short to read a share off. And the **name**, which is the one
thing here that cannot grow at all: the reorder buys it a **161px** column at
390, and against the live league's twelve names that column holds all but **one
at 13px and 14px and all but three from 15px up** — so the desktop's 17 would
ellipsize a quarter of the league where 14 ellipsizes only the name no phone can
hold at any size (`Brian&Tom's Excellent Adventure`, 268.9px at 17px, which is
the same measurement `--mup-card-w` is derived from). The phone was never the
complaint and its budget was already spent to the pixel.

### Measured — the scale

**At 320 / 375 / 390 / 640 / 900 / 1200 / 1920, before → after**, on the live
league's Summary page (`mup=110`), each figure read off the rendered boxes:

| | 320 | 390 | 640 | 1200 |
| --- | --- | --- | --- | --- |
| card | 288 → 288 | 358 → 358 | 608 → 608 | **800 → 896** |
| category row | 31 → **37** | 31 → **37** | 31 → **40** | 31 → **40** |
| category track | 49.0 → 46.0 | 84.0 → 81.0 | 198 → **177** | 294 → **321** |
| track height | 6 → **8** | 6 → **8** | 6 → **9** | 6 → **9** |
| meter height | 10 → **14** | 10 → **14** | 10 → **14** | 10 → **14** |
| figure / label | 15/11 → **16/12** | 15/11 → **16/12** | 15/11 → **18/13** | 15/11 → **18/13** |
| headline | 14 → **18** | 14 → **18** | 19 → **26** | 19 → **26** |
| group label / tally | 10/11 → **12/13** | 10/11 → **12/13** | 10/11 → **12/13** | 10/11 → **12/13** |
| heads block | 71 → **85** | 71 → **85** | 41 → **89** | 41 → **51** |
| name column | 127 → 126 | 162 → 161 | 169.5 → **282** | 265.5 → **271.8** |
| page overflow | 0 → **0** | 0 → **0** | 0 → **0** | 0 → **0** |

The two narrow columns *lose* three pixels of track, which is the tier's own
larger figure column paid for out of the rail — the right way round on a screen
where the figures are what is read and the bar is a hint. **640 is the width the
reorder moved**, which is why its heads block and name column jump: it draws the
stacked head now, and the name goes from 169.5px to 282.

**Clipping, which is what the widths are actually for.** Over the ten category
figures, the two names, the two records, the two headlines, the group labels and
the tallies, at every one of the seven widths: **0 clipped cells after**, against
2 at 481 and 1 at 520 before (the two longest names, in the wide head the old
breakpoint left them in). The bye page is unchanged in both builds — its own head
clips `Brian&Tom's Excellent Adventure` at 320 / 375 / 390 exactly as it did, that
name being longer than any phone can hold and the head carrying a `title` for it.

**The pinned chrome does not move**, which is the thing a scale change most
easily breaks: `.mup-chrome` is **145px at 320 and 114 at every other width,
before and after**, on the Summary page and on a bye page alike.

**And the interactions were driven rather than reasoned about**, at 1200×900 and
390×844: the ⓘ opens a **320 × 173.13** panel at x=169 and x=29 — inside the
viewport at both — Escape closes the key and then the matchup page (`inert` back
to `[]`), a Moves name opens the player page over the matchup and Escape unwinds
`player → matchup → nothing`, and page and view overflow are 0 in every state. A
trade week (`mp=15`) draws its 21 `Trade` tags with no row overflow at 320, 390
or 1200, and a week past the feed's reach draws its own sentence.

**The rest of the League view is untouched, checked rather than assumed.** The
scoreboard's cards are 800 / 346 with `.lg-side` at 37.98 and **0 overflow on all
20 category blocks**; the Rankings table is 1463.45px; the Transactions tab
overflows by 0. None of those reads a `.mup-*` rule.

**Bundle: JS unchanged at 526.70 KB** (155.69 gzipped) and **CSS 127.38 → 127.90
KB** (22.59 → 22.69) — 0.52KB raw and 0.10KB over the wire, nearly all of it the
comments arguing the two derivations and the cascade fix. The JS is flat because
nothing about the components moved: this is `styles.css` alone.

### The Projected toggle

**The Summary's figures are where the week has got to, and one press swaps them
for where it is heading** — and this is the **one place in the app** that does
it. The control was the Scoreboard's and was then drawn in both; it is here
alone now, because with the button off that head a lens carried back to the
board would be ten dashed cards with nothing on screen to turn them off. The
whole of that argument, and what the board gave up, is in **Client — the League
view**, *The Projected toggle is the matchup page's, not this board's*; where
the projection itself comes from is **ESPN fantasy league**, *Where a live
matchup is heading*.

**It is `ProjectedTools` and `asProjected`, both of which the Scoreboard still
owns the code for** — the button and the swap live in `LeagueView` and are drawn
from here, so the file that holds the card's own arithmetic holds the lens over
it too. The card's
whole job is to set two sides against each other across the categories and mark
the winner, and that arithmetic is identical whether the figures are what has
happened or what is going to, so the **data** is swapped and every line below it
is code that was already checked: the rows, the bars, the group tallies, the
meter and the leading name are untouched.

**Three things say it is a projection**, which is this app's standing rule that an
estimate never wears the same clothes as a measurement. The head's tag reads
**`Projected`** in the accent where it read `Live` — *replacing* it rather than
joining it, since the tag says what the figures **are** and two of them would be
the page claiming to be both. The dates beside it run to the **end of the period**
(`projection.end`) where `board.end` truncates at today, which is right for
figures that are what has happened and a lie over figures that reach the end of
the week. The card takes a **dashed border** (`.mup-proj`), at the size of the
whole card rather than per cell: every figure on it is projected, so marking each
one would be the same claim made twenty times.

**And the bars stay solid, which reverses a round and is worth reading rather
than deleting.** They were hatched — the whole-matchup meter and the ten category
fills, in `.spl-fill--thin`'s own 115° at 3px on and 4px off — on the argument
that the border marks the *card* where the bars are what the card is **read
with**, so a solid one says *this is the measurement* in exactly the register a
projection must not use.

**The rule is right and this is the wrong place to spend it.** Every other broken
mark in the app — the percentile card's dotted bubble, the Splits card's hatched
fill, the Schedule grid's dashed chip — marks **one row among solid ones**, so the
texture is a distinction the reader can act on. Here *every* figure on the card is
projected at once, so the hatch distinguished nothing and only made the picture
harder to read: a 9px rail striped 3-on-4-off is more gap than ink, on the one
element the whole page exists to be read from. What is left is what a broken mark
would have been *adding* to — a dashed card, the head's `Projected` tag and dates
running to the end of the period, all of it in the chrome rather than in the data.

**Nothing about which side is ahead ever depended on it**: green marks the winner,
the trailing run of the meter stays `--faint` and its ties dimmer again, exactly
as they do on a live card. The two ordering notes the hatch rules carried go with
them — they were about three striped selectors beating `.mup-meter-lead`'s own
`background`, which nothing now overrides.

**Measured on the live 12-team league at 1200×900**, reading the computed styles
back rather than the stylesheet: on the projected card the ten category fills and
both meter runs compute `background-image: none` — **0 of 12 striped, where all
12 were** — with the card still `border-style: dashed`, the head still reading
`Projected` and its dates still running to Aug 23; the live card is unchanged at
`solid` with the same `none` on every bar. **Bundle: CSS 155.30 → 154.82 KB**
(27.76 → 27.71 gzipped) and **JS unchanged at 572.58** (170.34) — four rules
removed and nothing in a component but a comment.

**Above `Moves`, at the foot of the categories — not in the head.** It sat at the
far end of the Back row, beside the `Projected` tag it lights, which is the
Scoreboard's own arrangement and the wrong one here for two reasons that page does
not have. The head is **shared by three pages**, so a control belonging to one of
them had to be gated out of the other two and cost the band a wrapped line on a
phone whichever page was on screen; and it is the **card** whose figures it swaps,
so below them it reads as the comparison's own control where above them it read as
one more thing about the week alongside the dates.

**Directly above `Moves`** because that is where the categories end: everything
under it — the acquisitions, the two lists of pickups — is a fact about the period
so far and is not projected either way, so the toggle is the last line of the
thing it governs rather than the first line of the thing it does not. **The button itself is centered and the key hangs off its right**, which is a
different thing from centering the pair: as one flex group the button sat 19px
left of the card's middle, which on a symmetric comparison reads as a control
misaligned with everything above it. `.mup-proj-row` is `.mup-nav-row`'s grid —
the button named into the middle column, the key into the third — and
`.lg-proj-tools` goes `display: contents` so the two are items of that row rather
than of a wrapper, which is the trick `.research-bar` uses to put its own groups
in the app's tab row. Measured, the button's center is **the row's to the pixel
at 320 through 1920**, with the key 8px past it.

**On the Summary page alone**, which now needs no gate of its own: the toggle is
inside the card and the card *is* that page, which is the tidier version of the
same rule — a control cannot be on a page it has nothing to act on if it lives in
the thing it acts on. What keeps its own gate is the **tag**, the head being
shared: without it `Projected` would sit over a roster table calling that
manager's stats a projection. Crossing to a team page and back leaves the lens
where the reader put it.

**Its key opens upward** (`drop="up"`), which is the other half of moving the
button to the foot of a long card: opening downward left the panel at
`usePopoverFit`'s own 120px floor — a four-paragraph key read through a letterbox
— where upward it draws at its natural 311px with the page above it to use.
`InfoKey` gained the flag rather than the hook guessing, and the two have to agree
by hand: `top` resolves to a used pixel value on an absolutely positioned box
whether or not the author wrote `auto`, so the stylesheet cannot be interrogated
for the answer. Measured on both: **311px fully in view** with the row where it
opens, and at the degenerate end — the row scrolled to the top of the window —
**120px and scrolling**, which is the floor doing what it is for and is never off
the top.

**And on a live categories week alone**, which is the Scoreboard's own pair of
gates: a points league's Summary is one number a side and the projection fills
categories, and a settled week has nothing left to happen — which the server says
in as many words (`ok: false`, `note: 'settled'`), and which is why the button is
**absent rather than disabled**, a disabled control inviting the reader to work
out why. A **bye** has no Summary page at all, so it has no toggle either.

**What the chart behind a row is, is unchanged**, and the row's title says so
while projected: the series is a **running total of the days played**, which a
projection is not, so a reader pressing a projected `63` and finding a line
ending at 35 is told before they press rather than after. The two keys stay two
panels — `How to read these bars` in the screen's top right corner and `How the
projection works` beside this button — because they are two questions.

**The key was tightened and is now written plainly, which are two edits and the
second undid a little of the first.** The tightening was right about the
scaffolding and went one step too far into the *subjects*: `each man in a lineup
slot blends his season rate with his last month (up to 40%)` is short and leaves
a reader asking *40% of what*, and `nothing moves a figure by more than a fifth`
is shorter than `no one adjustment changes a figure by more than 20%` and says
less. Each paragraph now opens on a full sentence naming what it is about — what
a figure **is**, how a player's rate and his remaining chances are worked out,
what the opposition does to it, and what it cannot know — and it says two things
it never did: that only players in a **lineup slot** count, so a bench or IL
player adds nothing, and that whoever is in one **now** is counted for the rest
of the week.

**And `5½%` went**, which is the formatting half of it: a fraction glyph in the
middle of a run of percentages has to be looked at twice to be read as five and a
half, and the figure it stands for is a league-wide platoon edge measured at 5.5%
— `about 5% across the league` is what a reader would say and is no less true.
The label went `How the projection is worked out` → **`How the projection
works`** and the button's tooltip `Show where each matchup is heading by the end
of the week` → **`Project every total to the end of the week`**, which is also
the truer sentence on a page about one matchup. All of it is shared with the
Scoreboard, one control drawn twice.

Measured, the panel is **520px against 380** at 390 — clarity bought with height
rather than sold for it — which is why it opens upward and why it is capped and
scrolls on a short window: 480px at 390×620 and 280 at 900×420, in view at both.

**Measured on the live 12-team league, matchup 110, at 1200×900**, pressing the
toggle and pressing it back:

| | live | projected |
| --- | --- | --- |
| head tag | `Live` (`lg-state-live`) | **`Projected`** (`lg-state-proj`) |
| dates | Aug 10 – Aug 18 | **Aug 10 – Aug 23** |
| card | `mup-card`, `border-style: solid` | **`mup-card mup-proj`, dashed** |
| a category fill's `background-image` | `none` | **`repeating-linear-gradient(115deg, …)`** in `--win` |
| the meter's leading run | `none` | **the same gradient in `--win`** |
| `R` | 35 – 27 | **63 – 57** |
| `HR` | 13 – 2 | **24 – 11** |
| URL | *(no `proj`)* | **`proj=1`** |
| the button's own box | 111.5 × 36, centered above `Moves` | **unchanged** |

and pressing it back gives the live column byte for byte — `border-style: solid`
and `background-image: none` on both bars, checked on a card opened with no
`proj=1` at all.

**And the board behind it stays live**, which is the check the scoping is for:
`?view=league&proj=1` with no `mup=` draws **0 toggles, `Live`, 0 dashed cards**
and drops the param from the URL.

**The four gates were driven rather than reasoned about**, each scoped to the page
rather than to the document — the League view *behind* the overlay draws its own
`Projected` button, which is what made a first pass read as the toggle leaking
onto every page:

| | toggle in the page | head tag |
| --- | --- | --- |
| Summary, live week | **yes** | `Projected` |
| a team page (`mt=`) | **no** | `Live` |
| a bye (`mup=109`) | **no** | `Live` |
| a settled week (`mp=18`) | **no** | `Final` |

**The ladder is unmoved**, one press of Escape undoing one thing: with the key
open, the first press closes the key and leaves the page (`[inert]` still
`.app-chrome`, `.league-view`, `.float-btn`), and the second closes the page,
clearing `mup=`, keeping `proj=1` on the board behind it and leaving **0** inert.

**It costs the head nothing**, which is what moving it into the card bought:
`.mup-chrome` measures **114px at 375 through 1920 and 145 at 320**, where with
the toggle in the Back row it was 160 and 191 — and the bars key beside the tabs
costs that band nothing either, where in the corner it had cost a wrapped line at
320 and 390. The row inside the card is **54px** and there is **0 horizontal
overflow of the page body or the view** at 320 / 360 / 375 / 390 / 430 / 480 /
640 / 900 / 1200 / 1920.

**The key's panel is anchored to `.mup-proj-row`** (`position: relative`):
`.lg-proj-key` is `position: static` so a 320px panel hangs off the **row** rather
than off a 30px button, and without a positioned row here the nearest one is the
overlay itself, which would drop the panel the height of the page. Measured at
390: **320 × 520 at x=41, fully inside the viewport**, and at 320 **276 × 624**.

**Bundle, over the three rounds**: **568.44 → 569.58 KB of JS** (169.15 → 169.46
gzipped) and **153.52 → 154.21 KB of CSS** (27.39 → 27.62) — 1.1KB and 0.7KB raw,
0.3KB and 0.2KB over the wire, for a control drawn twice, three moved anchors, two
grids, a popover that knows which way it opens and a key written to be read once
and understood.

**The press leaves a mark now, which it did not.** The read behind this button is
386–715ms with the boards warm, and for the whole of it the page did nothing at
all — no spinner, no state, the button simply sitting there until the figures
changed under it. That reads as a control that has not worked, on the one press
this page exists for.

`ProjectedTools` takes a `loading` and swaps the glyph for the app's own
`SpinningBaseball` at `sm`, which is exactly what `ProjectedToggle` — the Roster
view's and the team page's plain switch — has always done; the two say the same
thing with the same mark because they take it from the same place. `aria-busy`
rides with it, so the button says it is working rather than only looking like it.

**No `MIN_SPIN` floor**, which is a decision rather than an omission. That floor
exists so a press whose answer comes back instantly still leaves a trace, and its
one caller is `Refresh from ESPN`, where the answer often *is* instant off a warm
cache. Here the read is a few hundred milliseconds at its fastest and the figures
on screen change when it lands, so the press has a visible consequence either
way; a floor would only hold a ball up after the thing it was about had finished.
And it is **not** `useDelayedFlag`'s 250ms delay either — that is the rule for a
wait nobody asked for, and this is a press.

**The flag is cleared on the way out as well as on the way in.** Turning the lens
off while a read is in flight cancels the run, so its `finally` never fires — and
a flag left true is a ball spinning for ever on a button that is no longer doing
anything. The same shape is why the roster and team-page reads clear theirs in
the same place.

**Measured by sampling the button through a press on a cold server**, at 1400×950:
`aria-busy="true"` with one `.ball-spin` at **t=22ms**, back to absent at
**t=300ms**, against a projection request of **286ms** — and the same on the
Rankings tab's own toggle (283ms). The button keeps one `<svg>` throughout, so
nothing about its box moves while it works.


### A category row opens its chart

**A row of the comparison is a press, and it draws that category day by day for
both sides of the matchup.** `R 31–23` is where the week got to; the chart is
how it got there, which is the half a manager can still act on — a lead built on
the Monday and defended since reads identically on the card to one taken on the
Saturday.

**This is where the press moved to, and the move is the interesting part.** It
was first built on the **scoreboard**, hung off a single figure in a matchup
card, and it shipped working and undiscoverable — it had to be reported (*"how
do I view it? I don't see it"*) before anyone found it. Two things were wrong
and only one of them was the affordance. A scoreboard card is a **summary**: ten
of them on one page, each a grid of twenty figures, read by scanning. A chart of
one category is a thing you **study**. And the card is *itself* a press into the
matchup, so the plain reading is "the card is the button" and the figures in it
are text — which is what they looked like, a four-character number on a
transparent ground. Marking those numbers harder (a dotted underline, measured
to 3:1 across four themes, and a hint line) was answering the wrong question,
and all of it went with the press.

**The matchup page is where the question is already being asked.** It is the
page you open to study one matchup; its rows *are* the category comparison, each
carrying both figures, both bars and the category between them; and a row is one
object about one category, so pressing any part of it asks the obvious thing.
Measured, the target goes from four characters to **862 × 40px** at 1200 and the
full width of the card at every width.

**A real `<button>`, not a `role="button"` div**, because here it can be one —
nothing inside the row is interactive, so Enter and Space come from the browser
rather than from a keydown handler of ours. That costs a reset (`appearance`,
border, background, font, color, text-align) and a `width: 100%`, a button being
shrink-to-fit; and it costs **no layout at all**. Measured before → after at 320
/ 390 / 1200, the row is **37 / 37 / 40px**, the grid resolves
`52px 46px 42px 46px 52px` / `52px 81px 42px 81px 52px` /
`64px 321px 52px 321px 64px`, the group head resolves the *same* template, the
category label still centers on the row's own category column (160 / 195 / 600)
and the card is 1038.47 / 1038.47 / 1061.50 — every figure byte-identical.

**The hover is scoped to `(hover: hover)`**, the app-wide rule: a touch device
has no pointer to move away, so an unscoped tint stays on the last row a finger
crossed and reads as a selection the page then declines to act on.

**The gesture is named in the ⓘ, where a line of its own over the comparison
used to say it.** *Press any category for a day-by-day chart of the week.* was a
12px `--muted` caption centered over the group heads; it is the **third
paragraph of the key** now, after the two that say what the bars are.

**It belongs there because the key is already the answer to the question it
completes.** That panel says what the whole-matchup meter is and what a category
row's own bar measures; what you can *do* to one is the last sentence of that
rather than a separate caption, and moving it gives the page back a row of prose
on a card read as a list of ten. Measured, that is **25px**: the card goes
**1111 → 1086px at 1200** and **1086 → 1061 at 390**, and the panel takes it —
**173 → 216px** tall, at the same 320px width and still inside the viewport at
both.

**What it costs is real and is why the passage this replaces existed.** A reader
now has to open the key to be told, and this feature has already shipped
invisible once — on the scoreboard, where it had to be reported before anyone
found it. What is different here is the **target**: a category row is the full
width of the card with a hover tint on it, where the scoreboard's was four
characters inside a card that was itself a press, so the affordance is doing most
of the work and the sentence is the backstop rather than the whole of it.

**It keeps its own gate rather than inheriting the panel's**, so a categories
league with nothing to press is not told to press it: the paragraph is drawn on
`groups.length > 0`, which is exactly the condition the caption carried. The
points-league case needs no test of its own — the meter, and so the ⓘ with it, is
null there, which is the same reason the caption named the format.

**Measured after the move, at 320 / 390 / 1200**: **0** `.mup-cat-hint` on the
page, the key three paragraphs, and the panel **276 × 233 at 320** and 320 × 216
above it — inside the viewport at every one, including the narrowest, where it
is the width the button could never have anchored. Enter opens it with focus
staying on the button (`aria-label` `How to read these bars`, `aria-expanded`
following), and **Escape closes the key and leaves the matchup page standing**.
Page and card overflow **0** at all three.

**Measured end to end on the live league**, with a real dispatched mouse click
rather than a synthetic one: 10 rows, each a `BUTTON` with `cursor: pointer` and
an `aria-label` naming the category; the press opens `Runs — week 19` with its
chart drawn at **z-index 49** — the matchup page is 48, so this is the next rung
of the ladder — with 4 elements `inert` behind it; one Escape closes the chart
and **leaves the matchup page standing**, a second closes the page, clearing
`mup=` and leaving **0** inert. Page and view overflow are **0** at 320, 390 and
1200.

**A bye has no Summary page at all**, so it has no category rows and nothing to
press — the door on a bye card goes straight to that manager's roster. Worth
knowing when testing: in a playoff week 8 of the 10 cards are byes, and clicking
the first card lands on a roster rather than a comparison.

### The chart itself

`components/MatchupSeriesChart.tsx`, in the app's shared `Modal` — so it
inherits the layer ladder, the body lock, the `inert` background and the rule
that one press of Escape undoes one thing. Measured: `inert` is `#root` while it
is open, one Escape closes it and leaves the League view standing, and nothing is
left inert afterwards.

**Every figure is a running total after that day**, which is the only reading
that ends where the card above it does. Checked in a browser rather than
inferred: over **all 20 category charts of one card, at 1200 and at 390, the
last point of a series equals the cell that opened it — 0 mismatches at either
width**.

**The house style is `RollingXwoba`'s and each borrowing is deliberate.**

- **Labels are sized in rendered pixels, not viewBox units.** A viewBox unit is
  a different number of pixels in every box this is drawn in — the dialog is
  720px wide on a desktop and 358 inside a phone's — so a label declared in
  units renders at half the size at one of them. `--mser-font` carries the unit
  count that renders at 12px whatever the width, published from a
  `ResizeObserver` exactly as `--roll-font` is. Measured, the label's line box
  is **15px at both widths**.
- **`touch-action: pan-y` on the plot.** This chart consumes no gesture at all,
  so the declaration claims nothing; it is there because `none` is the mistake
  `.roll-chart` already records, where a thumb landing on the plot could not
  scroll the page under it.
- **A legend under the chart rather than labels inside the plot**, for the
  reason that one records: a label painted at the end of a line sits exactly
  where the *other* line is most likely to be. Each item is the swatch, the
  team's **full name** and its final figure, and `.mser-legend` is folded onto
  `.summary-legend`'s rule — the app has one legend. The name rather than the
  abbreviation, which is what it drew first: this legend is the one place the
  chart says whose line is whose, and it has a whole row under the plot to say
  it in, where the tab strip's `BOZO` is a compression forced by three tabs
  sharing 262px. Measured at 390 and 1200 on the live league, `Baldy's Bozos 33`
  and `Sho me the Parlay 26` are **128.5px and 151.3px** and share **one row**
  of the same **25px** the abbreviations took, with the dialog body and the page
  each overflowing by 0; the row wraps (`flex-wrap` on the legend, `nowrap`
  inside each item), so a longer pair stacks rather than overflowing. The
  abbreviation stays as the fallback for a team with no name at all.

**Color marks state, and the state is who is taking the category**: `--win` for
the side ahead at the last day both are known for, `--muted` for the other. That
is the same pair the card's own cells use, so the reader has one key rather than
two, and it is the same comparison `outcome` makes — a tie leaves both lines
muted, which is what a tie looks like. The swatch carries the class itself
rather than inheriting it, which was a bug worth measuring: with the class on the
wrapping `<svg>` both swatches came back `--muted` in all three themes.

**The axis is in round numbers.** Three intervals over a `nice` step, so the four
gridlines land on figures a reader recognizes — `0 · 15 · 30 · 45` rather than
the `0 · 11.9 · 23.8 · 35.6` a bare min-to-max range produces. A counting
category is anchored at **zero** besides, which is what makes the shape of a week
readable: a run of home runs from 9 to 13 on its own range is a cliff and on a
zero axis is four home runs. **The step has to cover the range as well as be
round** — the bottom line is snapped down to a multiple of the step, so three
intervals from there need not reach the top — and walking the ladder until it
does makes clipping a point off the plot impossible rather than unlikely
(checked over 13 hostile shapes including a flat series, a zero range and a
0–0.001 one: **0 uncovered**).

**The x ticks are walked back from the last day**, which keeps the spacing even
*and* always labels the day the reader cares most about. Forward, an eight-day
week labeled `Aug 10 · 12 · 14 · 16` and then forced the 17th on as well, so the
two ran together at the right edge of a phone.

**A bye is one line and says so**, which is a real shape rather than a failure —
the live league's first playoff round is two matchups and eight byes. Measured on
the reader's own bye: one path, one legend item, and no `--win` mark, there being
nobody to be ahead of. **A points league has no category line at all** so nothing
is pressable, and a roto league has no matchups; neither can reach this.

**What the chart cannot say for itself, it says in a line under the legend —
and that is now a *gap* alone.** A series short of its days names them:
measured with the last three days marked unreadable, the note reads `ESPN would
not answer for the last 3 days of this period, so the lines stop where the
totals stop being knowable`, the lines stop at five points and the legend shows
the last **known** figure (19/17 rather than 33/25) rather than a total it
cannot stand behind.

**A second note used to sit beside it on a live week** — `The last point is
today so far — the day is still being played` — and it is gone. It was
restating the page rather than qualifying the chart: the header above already
prints the week and its `Live` tag, the x axis already ends on today, and a
running total that stops at the current day is what a live week *is*. A caveat
that every reader of a live chart sees, saying what the chart already shows, is
a line that trains people to skip the line that matters — which is the one
above it, drawn only when a day genuinely could not be read.

**`EspnMatchupSeries.live` went with it**, both halves of the hand-mirrored
pair, on this repo's own rule that a field nobody reads is a field nobody
misses: that flag existed for exactly this label — its doc comment said so —
and had no other reader in either workspace. The **local** `live` in
`getMatchupSeries` stays and is load-bearing, being what `const frozen = !live`
reads to decide whether the period takes a blob with no freshness test. Nothing
versioned moved: a stored blob carrying the extra field simply deserializes
without anything reading it.

**The read is lazy and one per page**, held by the matchup page rather than
by the card: the series is a fact about the *week*, so one read serves all ten
cards and a second category costs nothing. A period change throws it away. A
failed read draws the server's own message inside the box (`Couldn't read the
day-by-day totals: Upstream is having a day`) and, because the request is marked
answered only once it *is* answered, pressing again retries it.

**Measured at 1200×900 and 390×844**: the box is **720 × (svg 694 × 289)** and
**358 × (332 × 138)**, the dialog body and the page body each overflow by **0**,
`touch-action` computes `pan-y`, and the chart draws in all four color schemes
with the two lines resolving each theme's own `--win` and `--muted` (Midnight
`rgb(56, 189, 248)` / `rgb(142, 160, 196)`, Maroon `rgb(143, 192, 234)` /
`rgb(189, 163, 174)`, Powder Blue `rgb(140, 37, 69)` / `rgb(85, 64, 74)`).

**Bundle for both features together: 550.02 → 557.30 KB of JS** (163.06 → 165.46
gzipped) and **147.02 → 148.08 KB of CSS** (26.21 → 26.42) — 7.3KB and 1.1KB
raw, 2.4KB and 0.21KB over the wire, for a chart, a route, a shared toggle, a
shared projection and the paragraphs above restated where the rules are.

### The chart is scrubbed, and the scrub is the rolling chart's

**The axis names about seven days and the plot draws nine** — or fourteen on a
fortnight — so most of what this chart is read for was in the days it drew and
never labeled. The reading a manager opens it for is *when* ("the lead went on
the Friday"), and the axis could only answer it to the nearest two days.
Dragging a finger or a pointer across the plot now names every one: a crosshair
snapped to the nearest day, **both sides' running totals in the colors their own
lines carry**, and the date under them.

**The readout is the scoreboard cell for one day.** `31 – 23` over `Aug 16` is
the same notation and the same order as the `R 31–23` on the card this chart was
opened from, so there is no second form to learn — the chart is that cell walked
back through the week. A side the series cannot answer for draws the app's own
`—`, and the separator is `--faint` so it belongs to neither side.

**The mechanic is `components/chartScrub.tsx`, extracted from `RollingXwoba`
rather than copied out of it.** The hit test, the crosshair (`ScrubCross`) and
the readout box (`ScrubTip`) are one object both charts use; what each keeps is
what is genuinely its own — the rolling chart's single accent dot and its `PA
144 · 5/24`, this one's two team-colored dots and its `31 – 23`. That is the
rule this repo already applies (`Modal` came out of the Columns dialog the
moment a second dialog wanted it, `.kind-switch` is folded onto `.view-switch`),
and the half that would have drifted silently is the arithmetic: a snap to the
nearest point is right about which day is under the finger or it is off by one,
and nothing on the screen says which. **It is arithmetically identical on the
rolling side rather than merely similar** — that chart's `Math.round(paGuess -
xMin)` over a series whose PA numbers step by one *is* the rounded fraction of
the way across the plot the shared test computes. `.roll-cross`/`.roll-tip*`
are `.chart-cross`/`.chart-tip*` with the move, one rule for one component.

**Measured on the live league**, week 19's `Runs` chart for Baldy's Bozos /
Sho me the Parlay (`mup=110`), with the readout checked at six x positions
against `/api/espn/matchup-series` itself — **18 of 18 right, 0 mismatches**
across 1200×900, 390×844 and 320×700:

| | 1200 | 390 | 320 |
| --- | --- | --- | --- |
| svg | 694 × 289.16 | 332 × 138.33 | 262 × 109.16 |
| the six readouts | `4–3 Aug 10` · `4–3 Aug 10` · `13–15 Aug 12` · `19–17 Aug 14` · `31–23 Aug 16` · `40–30 Aug 18` | `4–3` · `4–3` · `8–7 Aug 11` · `19–17 Aug 14` · `31–23` · `40–30` | `4–3` · `4–3` · `8–7` · `16–17 Aug 13` · `31–23` · `40–30` |
| crosshair, user units | 47.3 · 210.0 · 372.7 · 535.3 · 698.0 | 88.1 · 163.8 · 391.0 · 542.5 · 694.0 | 108.9 · 181.2 · 325.7 · 542.5 · 687.0 |

The three widths land on **different days at the same fraction of the box**, and
that is the geometry rather than a wobble: the plot's left pad is `3em` of a
label whose *rendered* size is fixed, so in viewBox units it is 47.3 at 1200 and
108.9 at 320 — a fifth of the plot at the narrow end. The crosshair sits on a
plotted day at every one of the eighteen, and each series' own point is picked
out by its own dot a size up (`r` 3 → 5) ringed in `--panel`, which is
`.roll-dot`'s shape against its one accent line.

**The readout takes no layout.** `.mser-chart-wrap` is the `position: relative`
box the tip is absolute inside, so the chart's height is **289.16 / 138.33 /
109.16 with the tip up, and the same three after the pointer leaves** — a box
appearing under a finger must not shove the page it is being read on. Page and
dialog overflow are **0** at all three widths and at every sampled position,
including the last day, where the box hangs 12.6px past the right edge of the
plot at 1200 and still clears the viewport by **7.2px at 390 and at 320**.

**That 7.2px is the `Runs` readout's, and a category of rates does not have
it** — which is how the box came to be clamped. `43–40 · Aug 19` is **67.6px**
wide; `OPS`'s last day reads `.705–.668 · Aug 19` and is **94.6px**, and half of
the difference is more than the clearance: measured on the same matchup, the box
ran to `x = 396.3` in a **390** window and **326.3** in a **320** one — **6.3px
off the screen in both**, the second side's figure and the date past the edge.
After: **386.0** and **316.0**, each **4px inside**, on a nudge of
**−10.29px**. At **1200** it ends at 973.1 in a 1200 window and does not move,
which is the clamp declining to fix what is not broken — it hangs 26.1px past
the svg's right edge there and every pixel of that is inside the dialog. The
`Runs` box is unmoved at all three widths (**959.6 / 382.8 / 312.8**, nudge
`0.00px`), and so is the first day at the left end (**251.3 / 22.3 / 21.3**),
the plot's left pad being wider than half a readout at every width.

**The clamp is one nudge in `ScrubTip`, and it is a measurement.** The width
being corrected is the width of the box's own text — a font this app does not
choose, and one that changes with the category — so it is read off the rendered
box in a layout effect on every move and published as `--chart-tip-nudge`, which
the stylesheet adds inside the existing `translate(-50%, -140%)`. That is the
rule `--roll-font` and `--clip-w` already follow, and it is one fix for both
charts rather than two that agree today, which is what the extraction was for.
**It clamps to the window and not to the wrap**, deliberately: clamping into the
chart would have moved that same box **35.3px**, the wrap having 29px of card
either side of the plot at 390, for a fault of 6.3 — and every pixel of that is
the readout walking away from the day it names. A box floating over the page is
bounded by the edge of the screen; the plot's edge is not an edge at all.

**Under a real finger, both gestures still answer.** At **390×260**, where the
dialog has **69px** of range, an upward `Input.dispatchTouchEvent` drag starting
a quarter of the way down the plot moves it **69px** — the whole range, and
exactly what the same drag starting 8px above the plot moves — with
`touch-action` computing `pan-y`. The horizontal drag across the same plot reads
`.677–.669 · Aug 10`, `.679–.776 · Aug 14` and `.705–.668 · Aug 19`, the last of
them clamped to a right edge of **386.0**, and **0** readouts survive the
`touchEnd`. The chart's own height is **138.33** with the tip up and after it
clears, and page overflow stays **0**.

**The xwOBA chart is unregressed** — the other caller of the thing that
changed. Its readouts, crosshair positions, dot, dash, `--roll-font` and wrap
heights are identical before and after at 1200, 390 and 320; the only rows that
differ are the two the clamp exists for. Its figures are in **Client — the
player page's tabs**, *Charts*.

**Bundle: 568.00 → 568.33 KB of JS** (167.58 → 167.73 gzipped) and **152.67 →
152.70 KB of CSS** (27.30 → 27.31) — 0.36KB and 0.04KB raw, 0.15KB and 0.02KB
over the wire, for the clamp and the paragraphs arguing it.

**Under a finger it is a real touch drag, and the page still scrolls.**
Dispatched as `Input.dispatchTouchEvent` at 390×844 with touch emulation on, a
drag across the plot reads the same six days and the readout clears on
`touchEnd` (**0** tips left). `touch-action` computes `pan-y`, which is what
arbitrates the two gestures — they differ in *axis*, so the browser keeps the
vertical pan and the chart keeps the horizontal drag. Measured at 390×260, where
the dialog body has **48px of range**: a 110px upward drag starting at the
center of the plot moves it **48px**, which is exactly what the same drag
starting 8px above the plot moves it. Nothing listens on `pointerdown`,
deliberately — a scroll begins with one on whatever is under the finger, so
reading it would flash a readout on every flick that starts on the chart.

**The two figures are the two lines by construction, in every theme.** Checked
in Dark, Light, Midnight and Maroon: the readout's two spans resolve to exactly
the two `path.mser-line` strokes and the two marker fills — Dark
`rgb(99, 180, 216)` / `rgb(158, 161, 162)`, Light `rgb(0, 74, 139)` /
`rgb(84, 87, 89)`, Midnight `rgb(56, 189, 248)` / `rgb(142, 160, 196)`, Maroon
`rgb(143, 192, 234)` / `rgb(189, 163, 174)`. The crosshair is `--muted` at **1
unit dashed 3 3** against series lines that are 2 units and solid, which is what
keeps it from reading as a third line on a chart where `--muted` *is* one of the
two teams.

**A day the plot will not draw is a day the readout will not print.** Both read
one `reach` — the leading run of days ESPN answered for — because a running
total past a hole is not a missing point but a wrong one. Measured with the last
three days of the week marked unreadable on the way in: **12 dots** for six
days, the gap note drawn, and the readout past the gap reads `— – —` with **0**
markers and the box pinned to the top of the plot. The legend follows the same
`reach` now and reads `26 · 20` where it read `40 · 30` — the same pair the
readout gives for Aug 15, which is where the lines stop.

**Nothing here is ever a projection.** The chart is fed by `series` off
`/api/espn/matchup-series` and the page passes it nothing else, so `proj=1`
cannot reach it: every figure a scrub prints is measured, and the app's
solid-means-measured rule needs nothing spent on this box.

**The xwOBA chart is unregressed, which is the failure this change could
cause.** The same script run against the commit before and after, on the same
player at 1200×900 and 390×844, reads **byte-identical**: `.375 / PA 144 · 5/24`,
`.404 / PA 202 · 6/7`, `.300 / PA 259 · 7/8` at 1200 with the crosshair at
**178.9 · 360.3 · 538.5** (the 179 and 539 that file already records), and
`.370 / PA 137 · 5/22`, `.412 / PA 198 · 6/6`, `.307 / PA 258 · 7/8` at 390 with
the crosshair at **179.8 · 361.1 · 539.4**; the dot stays `r=4` on the same x,
the crosshair's dash stays `3px, 3px`, `--roll-font` stays 13.63px and 26.02px,
the wrap stays 264.16 and 138.33 tall, and the tip still clears on leave. The
only thing that moved is the class on the box — `roll-tip` → `chart-tip`, which
is how the before run was confirmed to be the before run.

**Bundle: 578.64 → 579.84 KB of JS** (172.36 → 172.77 gzipped) and **155.43 →
155.61 KB of CSS** (27.82 → 27.86) — 1.2KB and 0.18KB raw, 0.41KB and 0.04KB
over the wire, for a shared scrub module, a readout on a second chart and the
paragraphs above.

### The Summary page ends on the acquisitions

**It is the one thing a category matchup turns on that is not a category.** A
manager two behind in saves with `2/10` left has a move to make and one at
`10/10` has not, and the page said nothing about it. So the comparison ends on a
`Moves` group, its two counts at the ends of its **heading** — `5/10 · MOVES ·
7/10` — in the same grid as every category above it, so each figure lands under
the name it belongs to. It is **at the foot rather than the head** because it is
what a manager does *about* the categories rather than one of them, and it takes
**no color**: neither side is winning acquisitions.

**The counts are the heading and there is no `Acq` row.** They were a category
row of their own under a bare `MOVES` label, which is two lines spent on a
heading and a subtitle for one section — and which drew a *category*'s shape
around the one figure on this card that is not one: nobody is winning
acquisitions, so that row had no bar, no color, and two deliberately empty
track cells whose only job was to hold its figures in the right columns. The
heading is the row now, exactly as `BATTERS` carries its own side's
won-lost-tied at the same two edges — one line, the same grid, the same
`.mup-group-tally`, and the lists start where the row used to. Re-measured at
320, 390 and 1100 after the card was scaled up: the two figures land in **exactly
the columns every category figure above them lands in** (x=119 and right=981 at
1100, against a first row's 119 and 981; x=29 and right=291 at 320), the card is
one row shorter, and **nothing clips at any of the three**.

**`5/10` where the league limits them per period and a bare count where it does
not**, which is the honest reading of a league with no cap — the number is still
worth having and the denominator is not ours to invent. A manager ESPN reports
no counter for at all is a dash. Where the limit comes from, and the 185
team-periods it was checked against, is in **ESPN fantasy league**, *How many
acquisitions a manager gets*.

### And it names them

**`5/10` says a manager has moved five times and not whom he moved**, which on a
page about two teams' week is the more interesting half by some way: a category
swinging back is usually somebody's pickup, and this is where the pickup gets a
name. Under the heading that carries those counts are two columns — mirrored
like every other pair on this card, each hugging the edge its own team's figures
are on — of the players that side took **In** and let **Out**.

**Grouped by direction rather than labeled per row.** The Transactions tab's
own shape is the move's word before each name, and it fails on the one case this
page has that the tab has not: a trade between *these two teams* puts the same
man in both columns, and `Traded` on both says nothing about which way he went.
Naming the direction per row instead (`Traded away`) is the widest label on the
card in the narrowest column on the page. A heading says it once for every row
under it, and a trade needs no case of its own. What the grouping gives up is
the claim-against-pickup distinction that tab spends a word on; the row's
tooltip carries it, with the day and the bid.

**No color, which is this card's own rule rather than a new one.** That tab
draws an add in `--hit`, right on a page whose only color it is; here green
means **ahead in this category** and the accent means **the side that is
ahead**, so a green `Added` or a column of blue names would each be a second
meaning for a color that already has one. The direction is said by the heading
and by the weight under it: a man coming in reads at full strength, one going
out reads muted. Every name that joined to exactly one major leaguer opens his
page on the app's one route in, which on the live league is 412 of 415 rows —
`matchMlbPlayer`'s standing rule, and the same one the tab draws.

### Which week a move belongs to, measured against ESPN's own counter

**The count above is the one number ESPN publishes here, so a list under it that
counts differently is a contradiction the reader can see.** ESPN's activity feed
carries no scoring period on a topic, only an instant, so the span has to be the
period's own days and the whole difficulty is *which day* an instant falls on.

**A matchup period's moves run from 13:00 ET on the day before its first day to
13:00 ET on its last.** Which is to say ESPN books an acquisition against the
next scoring period once the day's games have started — invisible on six days of
seven, because the next scoring period is still this matchup period, and
decisive on the seventh, where a Sunday-afternoon pickup spends next week's
allowance.

**Swept rather than assumed.** Against the counter over **seven matchup periods
and 84 team-periods** of the live league: the app's own baseball day (3am ET)
and the plain calendar day both reproduce **67 of 84**, and a 13:00 ET boundary
reproduces **84 of 84**. The 24 topics the two rules disagree about are **every
one of them on a Sunday after 13:00**, and the knee is bracketed to
**12:55–13:23 ET** by the 51 topics filed on the seven last-days: 12:55, 12:05,
12:03, 11:58 and 11:22 stay put, 13:23 and 13:46 move. 13:00 ET is when a Sunday
slate starts, which is the mechanism that reading implies. The honest caveat is
that this is one league's seven weeks and ESPN documents none of it, so the
constant is a **measurement rather than a spec** — and where it is ever wrong,
the count is ESPN's own and is the authority.

**A trade is an add and is not an acquisition**, which the same sweep measured:
team 11's seven adds in period 15 are seven trade arrivals and ESPN's counter
for that week is **0**. They are still players the manager took in, so they are
in the list, and the row that came by trade wears a faint `Trade` tag — without
it a week with a trade in it is a list of seven names under a count of nought
with nothing on screen to reconcile them.

**Attribution is per player rather than per topic.** A topic is one act by one
manager and can move players in both directions and between three teams, so a
side's list is built from `toTeamId`/`fromTeamId` on each **player**. That gives
a trade both of its halves for free: the man who came the other way is a drop on
one list and an add on the other, with no case of its own.

**The feed does not reach the whole season, and the section says so.** It is
read at the server's own limit — 250 topics against a season of 770 on the live
league, reaching back about two months — so an old period is simply not in it,
and drawing two empty columns under a count of five would be the page saying
nobody moved when what it means is that it cannot see that far. The oldest topic
in hand is the horizon; past it the section reads `ESPN's activity feed doesn't
reach back to this week.` A side that genuinely made no move reads `No moves`,
which is a different sentence for a different fact.

**It costs no read.** The feed is the League view's own, fetched on entry to that
view and kept, and this page is opened from it.

**Measured in a browser against the live league.** On every matchup checked the
list reconciles with the count the page itself prints — the non-trade `In` count
equals the `Acq` figure on **12 of 12 sides** over four matchup periods,
including the trade week (10 in, 6 of them non-trade, under `6/10`). The three
states draw: a quiet week `No moves` on both sides under `0/5`, a week past the
feed's reach its own sentence, and a trade week nine `Trade` tags. Re-measured
after the card was scaled up: the columns are **121 / 156 / 421px** at 320 / 390
/ 1200, **0 names clipped** at any of them (they wrap rather than truncate), and
the page body overflows by **0** at 320, 390, 1100 and 1200. A name opens the player page over the
matchup (`?player=pitcher-702070`, the matchup going `inert` beneath it) and
**Escape unwinds one rung per press** — the player, then the matchup, `[inert]`
back to 0.

**A bye carries it in its head instead**, and that is not a flourish: the
Summary page is where the two counts are compared and **a bye has no Summary
page**, so without this the one manager most likely to be reading his own bye
week — the reader, on the week his own team has one — could not see his own
figure at all.

**The two of them are a column at the right end** — `Bye` over `Acquisitions:
5/10` — which makes this head two blocks that mirror each other: the team's own
two lines on the left, who he is and how his season has gone, and the week's two
on the right, why there is one team here and what he has spent of his allowance
while there was nobody to spend it against. The count read `ACQ 5/10` on the row
itself for a while and then sat under the record as a third line of the identity
block; what a line of its own buys either way is the word rather than the
abbreviation.

**The block is what carries the `margin-left: auto`** the two items used to
carry separately — and `.mup-side-id`'s grow goes with them. It is `flex: 1 1 0`
for its place on a scoreboard card, where a name has to shrink and ellipsize
beside a headline triple, and on this head it took every pixel of free space and
left the right-hand pair with none of it: measured at 1200 that put `Bye` at
**x=910** and then, with the acquisitions no longer holding the end of the row,
**976**. The name keeps its shrink and its `min-width: 0`, so a long one still
ellipsizes on a phone.

**Measured before → after** at 320, 390 and 1200: the head is **30 → 31px** and
the chrome **108 → 109** — the right-hand column is two lines against the
identity block's two, so the head is the same height it was when the count sat
on the row, and a line shorter than it was under the record (45 / 123). The two
blocks land at the card's own edges (name at 242, the pair right-aligned to
1000 at 1200), and the page overflows by **0** at all three.

**The one cost is 28px of name at the narrow end**, and it is paid to the
longest name in the live league: `Acquisitions: 5/10` is 108px against the 90
that `Bye` and `ACQ 5/10` took side by side, so `Brian&Tom's Excellent
Adventure` ellipsizes at 390 where it just fitted. So the name carries a `title`
here **and nowhere else on this page** — a bye has no tab strip, so this head is
the only thing naming the team, where every other surface that truncates a team
name has the strip or a card head to fall back on.

### A matchup is a page, not a tab

**It was the League view's first tab and is a full-screen page over it**, opened
from the scoreboard card that names it, with a Back button rather than a tab to
leave by. The tab could not say *which* matchup it was about and answered that
with a dropdown of ten pairs of team names sitting above the thing it selected;
a card pressed is what names a matchup, the way a research-board row names the
player its page opens on.

**It takes `PlayerDetails`' shape wholesale** — `.mup-view` is folded onto
`.details-view` in the stylesheet, so the fixed box, its own scroller,
`overscroll-behavior: none`, the reserved scrollbar gutter, the gutters and the
`--table-bleed` its two wide tables take back are all one definition. And the
same conventions in the component: `useLockBodyScroll`, `useOverlayFocus` (focus
in on open, back out on close, the background `inert`), and an Escape handler
that goes through `answersEscape` so a ladder unwinds one rung per press.

**It sits at `z-index: 48`** — below the player page's 50 and above the
full-page table box's 45 — which is what makes the stack behave with no special
case at all: a name pressed on a team page opens the player *over* this, a
dialog opened inside here takes 49 from `DialogLayerContext`, and the how-to and
league-settings overlays keep their 60. `.mup-view` joins `OVERLAYS` so the
stacking test both consults it and sees it. Measured: the player page at 50 over
the matchup at 48 with the matchup `inert`, one press of Escape closing the
player and a second closing the matchup, `mup=` cleared and no `inert` left.

**The Back button is the app's own**, which it looked like and was not. Four
overlays — the player page, the how-to page, the ESPN league page and the
highlight reel — carried an inline SVG chevron copied between them, and this
page carried the text `‹ Back` under the same `.details-back` class: measured, a
**65.03 × 31** button beside an **80.08 × 34** one, a different width and a
different *height*, an 18px icon's line box being taller than a text glyph's.
That class's padding (`7px 14px 7px 10px`, less on the leading side) is written
for an icon, so the text one was sitting in a box tuned for something it hadn't
got. It is `components/BackButton.tsx` now and all five draw it — extracted
rather than fixed in place, the rule that pulled `Modal` out of the Columns
dialog and `InfoKey` out of the Splits card, four copies of an eight-line path
being four chances for the next change to reach three of them. Re-measured,
every one of the five is **80.08 × 34**; the head's bar grows 43 → 46px with the
taller button (74 → 77 at 320, where it wraps) and nothing overflows.

**No week selector and no matchup picker**, which were both controls over
*which matchup* — a question this page no longer asks, being opened on one from
the board that lists them all. The week is **printed** rather than navigable
(`Week 19 · Aug 10 – Aug 16 · Live`), because the numbers are meaningless
without it and a live period's totals cover the days played so far; the arrows
stay on the Scoreboard, which is the page about which week.

**Three pages inside it**: the away team, the comparison, the home team — two
teams with the comparison between them, which is the shape of the thing being
read and the same arrangement each category has on the card.

**The two team tabs are short names** (`BOZO · Summary · BETS`), because full
ones do not fit: measured at 320, `Baldy's Bozos` and `Sho me the Parlay`
**both clipped mid-word**, and above that width three full names filled the
strip at 346px. `LeagueView.tsx::teamAbbrev` reads **ESPN's own abbreviation**
where the manager has set one, which is what ESPN's own scoreboard shows and so
what a leaguemate already recognizes — and which is often *not* derivable from
the name (`GREG` for The Homewreckers, `HOFF` for THE BRONX FLOATERS, `BETS`
for Sho me the Parlay), the strongest argument for reading it rather than
computing one. On the live league all twelve have one, 2 to 4 characters.

**Derived only where that field is empty**: initials of the significant words,
or the first four letters where one word is left, with articles and
conjunctions dropped so `The` cannot be a team's whole abbreviation. Driven
through the page with the field blanked, name by name: `Baldy's Bozos` → `BB`,
`Sho me the Parlay` → `SMP`, `Homewreckers` → `HOME`, `Peña's Team` → `PT`,
`A Team of Four Words Here` → `TFWH`, and a name with no letters or digits in it
at all (`The`, `⚾🔥`, whitespace) → the team's id, which is what every other
unnameable team on this view falls back to.

**The full name is on the tab's `title`** and on the two surfaces with room for
it — the scoreboard card's head and a rankings row — both checked to be
unchanged. The strip goes **288px clipped (320) / 346px (above) → 262px at
every width, with 0 clipped labels** and all three tabs the same 83px.

**One consequence worth stating**: on a *team* page the strip is the only thing
naming the team, so the full name is in the tooltip alone there — the Summary
page still prints both in full at the head of its card, an inch below the
strip. **Summary is the
middle one and the default**, being the question the page is opened with; each
manager's roster is one press away, in the direction his own figures are on.

**The strip is in the pinned head rather than on the page.** It is this page's
own navigation — which of the three readings is on screen — and that is the one
thing that must not scroll away from under a reader partway down a team's feed;
it is the argument `.details-chrome` makes for the player page's tabs and
`.app-chrome` makes for the view bar, one page along. Measured, the head is
**99px** at 390 and up (130 at 320, where the Back-and-week row wraps), against
the player page's 139/193.

**A bye has no pages at all**, and that is the point rather than a degenerate
case. There is one team and nothing to compare it against, so a `Summary` of one
side would be a page whose whole content is the line the scoreboard card already
draws, and a strip of one tab is a control with no choice in it. The page goes
**straight to his roster and feed** — which is what a manager on a bye week came
for — and the head names the team where the strip would have been: logo, name,
record and the word `Bye`, at **109px**. That tag drops the `margin-left: auto`
it has on a card: there it sits opposite the headline triple, where a reader's
eye already is, and here there is no second column so it read as a word adrift
700px from the team it belongs to.

**Its card carries the door too** — on a week the reader's own team is on a bye,
which in a 12-team league's first playoff round is eight of the ten cards,
leaving it off would put his own team out of reach entirely.

### A team page is the app's own Roster and Feed views

**`components/LeagueTeam.tsx` draws `SummaryTable` and `LiveFeed`**, the very
components the Roster and Feed views are made of, over a `PlayerReport[]` of
exactly their shape. A row on a leaguemate's page therefore reads as the same
row does on your own: opponent cell, lineup pip, IL code, slot chip, clips in
the feed, `Load more`, full-page mode, and a name that opens the player page.

**Roster and Feed are two tabs rather than a stack.** They were stacked, on the
reasoning that they are two halves of one question about one team over one week
where a third tier of tabs would be chrome bought to save a scroll. What that
missed is that they are not one question at a time: the table is *what his week
came to* and the stream is *what happened in it*, which is exactly the split the
app makes one tier up — and stacking them put a feed of thirty clips under a
table nobody had finished reading. They are the app's own `.view-switch`, so the
two read as the two views they are.

**And a team page carries the roster views' own controls**, because it *is*
those views: which reading, which kind, the Schedule view and its span, and the
dates. The date pieces are `components/DateControls.tsx` — extracted from
`App.tsx` rather than copied, which is the rule this codebase applies to a
control drawn twice, so `Today` cannot come to mean two things and every rule in
the stylesheet that decides how they read (the pills above 640, the `<select>`
below it, the range bubble on the toggle's corner) applies to both callers by
construction. What each caller keeps is the *state*, that being the only half
the two answer differently.

**The days start at today on the week being played**, not at the matchup's week
— that is the reading a manager arrives with (*what is his team doing right
now*) and it is what the app's own roster views open on, which is the point of
these pages being those views. The week is one press away as a preset of its
own: **`Matchup` leads the list**, and it is the one named range that means
something only here — the days the categories on the Summary page were summed
over, so picking it makes every row the arithmetic behind a category. It is
absent where the period has no dates to name, the rule the Rankings span strip
already follows for a half with no matchup period in it.

### A settled matchup opens on its own days

**That paragraph said "the days start at today" flatly, and the four words added
to it are the whole of this change: the argument is right about the week being
played and plainly wrong about one that is over.** On last week's matchup
`Today` names days that are not in the matchup **at all**, so the roster table
had nothing to do with the categories the Summary page an inch away is drawn
from — and a page opened on a finished week is opened to read that week. So the
live matchup keeps `Today` and a settled one opens on **`Matchup`**, which is
the two halves of the argument each applied where it holds rather than one of
them applied everywhere.

**The test is `board.live`** — the flag the header's own `Live` / `Final` tag
reads, so the page cannot say `Final` beside the week and open on today.
Deliberately not a second definition of "current" worked out from the dates:
`start`/`end` are the **observed** span and truncate at today for the week being
played (*The matchup window*, above), so a date test would be reading the
symptom of the thing the flag states outright. It also gets the ~90-minute
window right for nothing — between our 3am rollover and ESPN's nightly batch the
board is the week that has just ended and says `Final`, and the page then opens
on that week's days, which is exactly what it is showing.

**The fallback is `Today`**, because `Matchup` is only in the preset row when
there are dates to name it with, and a date button marking a preset the row does
not contain is worse than the old default. Both halves read one `matchupSpan`,
hoisted above the state it seeds and the preset list it builds, so the two
cannot come to disagree about whether there is a matchup span at all.

**It is seeded, not corrected.** A lazy `useState` initialiser rather than an
effect — the rule the page's own `sideTab` already follows: the board is a prop
at mount (App draws this page only once the scoreboard has landed), so the first
paint is already the right span, where an effect would draw today's rows, fetch
them, and swap a frame later. And it applies **once**: a week that settles under
a reader who has the page open must not move the days out from under them, nor
must the League page's own minute poll re-running with a newer board, and the
reader's own pick — a preset or a custom range — is the last word from the
moment they make it. That costs nothing in reach, because closing the page
unmounts it and stepping the period on the Scoreboard clears `mup=`, so every
other matchup is a fresh mount and a fresh default.

**This is the team pages' control and reaches nothing else.** The whole `tools`
row is drawn only where a side is selected, so the Summary page has no date
control to default — checked at both widths on both kinds of matchup: **0**
`.date-toggle` on it.

**Measured on the live 12-team league at 1200×900 and 390×844, before → after.**
The **live** matchup (week 19, `Live`, Aug 10 – Aug 16) is unchanged: the date
button reads **`Today`** with an `8/16` bubble, 13 rows, `Total 10/38 · 5 R` —
one day. The **settled** one (week 18, `Final`, Aug 3 – Aug 9) goes from that to
**`Matchup`** with an `8/3–8/9` bubble, **13 → 16 rows** (the week's union of
rosters against today's team) and `Total 13/46 · 10 R` → **`76/278 · 50 R`**,
with every opponent cell a game of that week. The preset row offers `Matchup ·
Today · Tomorrow · Yesterday · This week · Last 15 days` and marks the one the
page opened on. Page and overlay overflow **0** at both widths in every state.

**The reader's own pick wins, driven rather than reasoned about.** On the
settled matchup, picking `Today` against the default takes the button to
`Today · 8/16` and 15 rows, and it **survives** crossing to Summary, on to the
other manager's page (`5/32 · 3 R`, his own team over the same day), back again
(`13/46 · 10 R`, unchanged) and a switch to Pitchers — identical at both widths.

**And the no-dates fallback was driven with `board.start`/`end` stubbed away**:
the header loses its week dates, the preset row is `Today · Tomorrow ·
Yesterday · This week · Last 15 days` with **no `Matchup` in it**, and the page
opens on **`Today`** with `Today` marked — the pre-change behavior exactly, at
both widths, with 0 overflow.

**Bundle: 526.70 → 526.77 KB of JS** (155.69 → 155.72 gzipped), **CSS unchanged
at 127.38** (22.59) — 70 bytes raw and 30 over the wire for a lazy initialiser
and a hoisted memo; the paragraphs arguing them cost the bundle nothing.

**The roster reading is a fixed-height column, so the table's own header and
total row stick.** A sticky row sticks to the box that *scrolls*, and without
that the box that scrolls is the overlay: the table grows to its rows, the
overlay takes the scroll, and the header slides away under the pinned head
exactly as it would on a page. `.mup-view.roster-mode` is `.app.summary-mode`'s
answer to the same problem one level up, and `.details-view.gamelog-mode`'s one
page along — the head and the tools keep their natural height, only the pane
flexes, and the head goes **static**, which is the trap both of those rules
already record (`overflow: hidden` makes this a scrollport of its own, and a
sticky box in one is held against its *padding* box). Measured: scrolled 283px
into the pane, the header row sits **1px** below its top and the total row 1px
above its bottom — which is the border, and the same pair the Roster view
measures.

**On the roster reading alone.** The feed is a stream of cards with nothing to
pin, and bounding its height would put a second scroller inside a page that is
already one — checked: on the Feed tab the class is absent and the overlay
scrolls, with 25 items in it.

**The Schedule view is on the roster table alone**, there being nothing in a
stream of things that have happened for a fixture list to replace, and it reads
the **same window the app's own copy of the mode reads**: that data takes no
parameters at all — one window for every club, sliced per reader — so App holds
the one read and this page asks for it (`onNeedSchedule`) rather than making a
second. Each surface keeps its own span, since every span is a slice of a window
already in hand.

**Its span run carries `This Matchup` and `Next Matchup` like everywhere else**,
and it is a connected league that puts them there rather than this page: the two
dates come from App's own once-per-session read (`matchupWindow`), shared down
exactly as the schedule window beside it is. Deliberately **not** derived from
`board.start`/`board.end`, which are the *observed* span and truncate at today
for the week being played — the same two dates this page prints in its head and
the wrong two to draw a forward-looking grid from (see **ESPN fantasy league**,
*The matchup window*).

**A team page carries the `Starters` filter too, and this reverses the paragraph
that stood here.** What it said was: *what a team page does **not** carry is the
`Starters` filter, and that is a scope line rather than an oversight — that
control reads the day-by-day lineup map, which the app has for the reader's own
team and no route returns for anybody else's. It would be a server change to
add.* Every clause of that was true, and the last one was the whole of the
objection: it *was* a server change, and it is one field.

**The lineups were being computed and thrown away.** `fantasyWatchlist` has read
one roster per day since a range became a range of rosters — it is where `held`
comes from, and it has taken a `teamId` override since the team pages were
written — so `/api/report?source=fantasy&teamId=` already knew, for every day of
the range, exactly who this manager had in his lineup. It answered with the
players and the days each was *held* and dropped the lineups on the floor. They
ride on the response now, and the filter therefore costs this page **no upstream
read at all**: measured, the field is **1,252 bytes of a 2,026,989-byte report
(0.06%)**, and 220 bytes of it over the wire once `compression()` has had it.

**It rides on the report rather than on `/api/espn/roster`**, which is where the
reader's own views take the same map from, and the reason is worth stating: the
team page fetches this report anyway, so the filter costs it no second request —
and the lineups then describe **exactly** the rows beside them, which two reads a
moment apart cannot promise.

**It cuts days rather than only rows**, which is the whole of what the filter
means over a range: a man started on Monday and benched on Wednesday keeps
Monday's line and loses Wednesday's. That is not a second implementation of the
app's own rule — `lib.ts::projectStarters` is what both surfaces run, lifted out
of `App.tsx` for this, with `startedOn` and `rangeDatesOf` beside it. Which is
also why a shared helper rather than a copy: two projections of one idea are two
things that will one day disagree about a day.

**Measured on the live 12-team league**, The Homewreckers over their own matchup
week (Aug 10–17), off → on:

| | rows | totals |
| --- | --- | --- |
| batters | 14 → **13** | `70/294 · 41 R · 10 HR · 32 RBI · .701` → **`70/291 · 41 R · 10 HR · 32 RBI · .708`** |
| pitchers | 18 → **16** | `109.2 IP · 51 ER · 89 K · 4.19 ERA · 1.26 WHIP` → **`106.0 IP · 44 ER · 87 K · 3.74 ERA · 1.22 WHIP`** |

**The days are what moved, not only the rows**, which is the property a row
filter could not produce and which was checked player by player against the
route: **3 batters and 8 pitchers stayed on the table and lost days** — Geraldo
Perdomo and Vladimir Guerrero Jr. 7 games to 6, Kaelen Culpepper 3 to 2, Logan
Henderson **7 to 2** — while 1 batter and 2 pitchers were dropped outright for
having been in the lineup on none of the days.

**The end-of-range roster is the fallback**, exactly as it is on the reader's own
roster: where the per-day map is missing — an older server, or a read that failed
— the single `starting` flag on the roster this page already fetched for its slot
chips keeps or drops a whole row. Driven with `lineups` stripped from the
response: 13 rows → 11, which is the pre-per-day behavior rather than an empty
table.

**The toggle is `components/StartersToggle.tsx`, shared with the roster row**
rather than a lookalike — the same `.starters-toggle` class folded onto
`.research-toggle`, the same lineup-card glyph, the same `.on` and never
`.active`, and the same phone rule: measured, **105px with its label at 1200 and
a 36px square at 390** with the label visually hidden rather than removed. It was
inline in `App.tsx` while the roster row was its only home; a second button would
be two controls that will one day differ, which is the rule that pulled
`DateControls` out of the same file when these pages needed the dates.

**It sits in the icon pair, between the reading and the days** — the roster row's
own order, the questions coming as *which page, which kind, which reading of it,
which players, which days*. It costs the row no line at either width: measured,
`.mup-tools` is **36px at 1200 and 84px at 390 with the filter on or off**, and
the page body and the view each overflow by **0**.

**The overlay owns the flag**, for the reason it owns the reading, the kind and
the dates: those are chrome above *both* team pages and must not reset when the
reader crosses from one manager to the other (checked — it survives the crossing
and re-applies to the other side's rows). And it is **state rather than anything
in the URL**, which is where every other control on this page sits: `mup` and
`mt` are the whole of what a matchup link carries.

**It is always offered**, unlike the roster row's own, which is hidden over a
range with no today in it. That gate exists because the *MLB* reading of the word
is a fact about tonight, and there is no MLB reading here: a leaguemate's lineup
is a real fact about every day of every range, and where the per-day map is
missing the end-of-range roster answers for it.

**The empty state names its cause in the wording that is true here** — it is
*his* lineup, not the reader's, so neither of the app's own two sentences would
do. Driven with every day's lineup emptied: `Nothing to show — none of these
batters were in The Homewreckers’ lineup on any of these days` over a range and
`… are in The Homewreckers’ lineup` on a single day, both over `Turn off
“Starters” in the row above to see his whole team — the days he had these players
on his bench or his IL are what it is leaving out`. It takes `possessive()`, the
helper the slot chip's own owner already uses, which is what stops the live
league producing `The Homewreckers’s`.

**What it costs the page**, measured through the route on the live league: a team
page's report is **2.00s genuinely cold** (a fresh process with that team's
per-day roster blobs deleted), **759ms from the blobs in a fresh process** and
**5.9ms warm**, for a 1.5MB response — the per-day reads being the same seven
`espn-lineup-…` blobs (**32,830 bytes** for a week of one team) the held-days map
already paid for. The filter itself adds nothing to any of those three: it is
that response read a second way.


**The chrome sits on the page rather than in the pinned head**, which holds the
way back and the week alone: this row belongs to two of the three pages and
would be an empty band on the third. **The two icon buttons travel as a pair**
(`.mup-tool-icons`), which is `.view-bar-tabs`' own rule one page down — a group
breaks to the next line whole. Measured at 390 the four groups come to 382
against the 358 the box has, so the row wraps, and left loose it wrapped the
*date* button by itself: a lone 36px square under two full-width switches with
its range bubble hanging over nothing.

**One trap worth recording**: `.date-control` is `display: none` by default and
undone only by `.app.date-open`, which is a class on the app's own shell and
reaches nothing inside this overlay. Measured before the rule that fixes it, the
row rendered at **0 × 0** with `flex: 1 1 100%` computing correctly and nothing
on screen — a control that is laid out and invisible, which no amount of reading
the flex rules would have found.

**And the row's gap is 12px, which is the app's own view bar's** — the same
wrapping row of the same controls one page down. The number matters for one of
them: the date toggle's range bubble hangs 8px above its button, so at the 8px
gap this row used to carry, a wrapped second row put the bubble **1px** under
the switches above it and it read as clipped. Measured, 12 gives it the **5px**
the app's own row gives it, and costs no wrap at any width — 2 rows at 320 and
390, 1 from 480 up, before and after.

**The slot chip says whose lineup it is.** `FantasySlot` gained an optional
`owner` — the team name in the possessive, null for the reader's own — because
the chip has read `In your fantasy lineup` since it was written and over a
leaguemate's bench that is a lie of exactly the kind the `day` field was added
to stop for a day. A name already ending in `s` takes the bare apostrophe
(`Baldy's Bozos’`), which a plain `+ "'s"` got wrong on the live league. Every
other caller passes nothing and the chip reads exactly as it always has —
checked on the reader's own Roster view: `In your fantasy lineup today at C`.

**`startedDays`/`rangeDays` are null on a team page**, which is honest rather
than lazy: that count comes off a per-day lineup map and this page reads one
day's roster (the span's last, which is what a slot is a fact about). The chip
then simply does not claim a count, which is what it already does on a
single-day range and against an older server.

**The two reads are one `Promise.all`** — the report the tables draw and the
roster the chips come from — because they are one page, and drawing the first
without the second would put every chip on it a beat after the rows they sit in.
A failed roster read costs the chips and not the page. And **no ref guard on the
effect**: the dependency array is the whole of the guard, and marking a request
answered before it is answered is what leaves a spinner up for ever under
StrictMode (below).

**The page is keyed on the team alone**, so the span, the kind and the reading
change what is drawn without remounting it — only crossing to the other manager
is a fresh page rather than one team's rows under the other's name while the
read is out.

### A team page carries the projected lens too

**The team page is the app's Roster view read for somebody else, and it was one
reading short of it.** The Schedule view had already come across — the days
ahead in place of the stat columns — and the third reading of the same cells had
not: *what is this manager going to get out of these players over the days still
to be played*, which on a matchup page is the question directly under every
category on the Summary next door. So the `mup-tools` row carries
**`ProjectedToggle`**, the same shared control the roster row draws, and
`LeagueTeam` takes a `projection` and hands it to the same `SummaryTable`.

**It is not the Summary page's `Projected`**, and the two are a lens each on a
different object rather than one control drawn twice. That one projects the
**matchup** — every side's final total in each of the league's own categories —
and lives inside the card it acts on, gated on a live categories week
(`projectable`). This projects **a line per player**, off
`/api/projection/roster`, which is the same engine asked the same question the
main roster view asks it: a row here and a row there are one arithmetic, and
`asProjected` and `ProjectedPlayerLine` never meet. They can be in force at
once and say nothing about each other; only one of them is ever on screen,
`.mup-tools` and the card being two different pages of the strip.

**On the roster reading alone**, for the reason the Schedule view is: a feed is a
record of things that happened and there is no honest projected version of one.
**And whatever week the matchup is** — unlike the Summary's, which is refused on
a settled period. A settled *matchup* has nothing left to happen; a settled
matchup's *manager* still has a roster and next week's games, and the caption
over the table says which days the figures cover while the head above goes on
saying `Week 18 · Aug 3 – Aug 9 · Final`, which is a fact about the matchup and
stays true.

**Pressing it moves the reader to the days it is about**, the main roster view's
own rule and for its reason: a team page opens on `Matchup` for a settled week
and on `Today` for a live one, and a projection over days that have been played
is a projection of nothing. The end is **`matchupWindow`'s rather than
`board.end`**, which is the trap this file's own head already documents — the
board's dates are the *observed* span and truncate at today for the week being
played, so projecting to them would be projecting to yesterday; with no window
at all it is the week ahead, which is what a reader with no league gets on the
roster view. The date control is untouched, so the reader is free to move off
it, and turning the lens off puts the span back **preset and all**, so `Matchup`
goes back to *being* Matchup rather than to the two dates it happened to mean.

**Exclusive with the Schedule view, stated from both sides.** That mode replaces
the stat *columns* with days and this replaces the *figures* in them, so they
are two readings of one set of cells; each toggle turns the other off, and the
range the lens moved the reader to stays when Schedule takes over, the days
ahead being exactly what a schedule is for.

**The overlay owns the flag and the read**, for the reason it owns the reading,
the kind, the dates and `starters`: they are chrome above *both* team pages and
must not reset when the reader crosses from one manager to the other. And it is
**state rather than anything in the URL** — `mup` and `mt` are the whole of what
a matchup link carries.

**The projection is held with the team it was read for.** Crossing to the other
manager must not draw one team's lines over the other's roster in the beat
before the new read lands: the keys would mostly miss and every row would
quietly fall back to its real figures under a `Projected` caption, which is the
one failure this app's own loading rules forbid outright. So the state is
`{ teamId, p }` and the prop is `teamProjection?.teamId === sideTeamId ?
teamProjection.p : null` — exact, and it needs no clearing effect.

**`addDays` moved to `lib.ts` for it**, which is the third surface to want it:
the app's own date presets, the roster view's projected lens, and this. It was
`App.tsx`-local, and a copy here would have been a second definition of a
UTC-safe date step — the same economy that moved `baseballDay`, `startedOn` and
`projectStarters` there when these pages needed them.

**Measured, driven against the live 12-team league.** On matchup 110's team
page: the toggle lights, the date button goes `Today 8/16` → **`8/18 – 8/23`**,
the caption reads `Projected · Aug 18 – Aug 23 · 5 days still to play`, the
header goes `Opponent` → **`G`**, and the first row goes `0/1` → `3.9/17.1` with
a `G` of 5; the `Total` reads `60.3 · 50.4/204.5 · 26.3 R`. Pressing it back
restores `Today` and the Opponent column. **Crossing managers with the lens on**
keeps it lit and draws the other team's own figures (`5.6 · 4.8/19.5` for his
catcher). The pitcher tab draws its own `G` with **dashes** for a starter whose
turn falls outside the span. A **settled** matchup (week 18) opens on `Matchup
8/3–8/9`, projects to `8/18 – 8/23`, and comes back to `Matchup`. A **bye** page
carries it too, going straight to that manager's roster. The **Feed** tab draws
**0** projected toggles and **0** schedule toggles. And the Summary page is
untouched: no `mup-tools` at all, its own `lg-proj-btn` still writing `proj=1`
and dashing the card.

**Exclusivity both ways, on both pages**: with `Projected` on, pressing
`Schedule` leaves it unlit with the day columns drawn and the span strip up;
pressing `Projected` with `Schedule` on does the reverse. Checked on the matchup
team page and on the main roster page alike.

**What it costs the tools row is one wrapped line at 480 and nothing anywhere
else**, A/B'd by hiding the button on the same page at 320 / 360 / 375 / 390 /
480 / 640 / 900 / 1400: `.mup-tools` is **132 / 84 / 84 / 84 / 36→84 / 36 / 36 /
36px** with the button against 132 / 84 / 84 / 84 / **36** / 36 / 36 / 36
without, and the icon group **168px against 124** below 640 (three 36px squares
against two) and **443 against 321** above it, where all three carry their
labels. **Page-body overflow and view overflow are 0 at every one of those
widths**, in both states, and the table keeps its 58.00px row and its 51.00px
header row.

### The server change is one optional parameter

`/api/report?source=fantasy` takes a **`teamId`**, absent meaning the reader's
own — which is what every caller but this one asks for. `fantasyWatchlist` reads
that team out of the same `getOwnership` payload it already reads the reader's
own out of (that call returns *every* team's roster in the league, and has since
free agency was first read as the complement of ownership), so the per-day
rosters, the held days and the roster order all come for free and a leaguemate's
week is built by exactly the code that builds your own. A team id is not a
credential, so the check that matters is **membership**: an id this league has
no team for is a 409 rather than an empty roster, which would read as a manager
who had dropped everybody. Measured through the route: `teamId=999` → `409 No
team 999 in this league.`, `teamId=abc` → `400 teamId must be a positive
integer`.

**What it costs: a report per team page, and the second one is free.** Measured
against the live 12-team league over the live week (7 days, 27 players):
**4.24s** for a team nothing had read before and **10ms** warm — so a reader
crossing between the two managers and back pays once, and the block wait behind
`WAIT_DELAY` never appears on the way back.

**And a stale dev server is what "both teams show my roster" looks like**, which
is worth recording because it will happen again: an old server ignores an
unknown query param and answers with the reader's own team, so the two pages
draw the same roster with nothing on screen to say why. Reproduced against a
process that predated the parameter; the current build answers three teams with
three rosters.

### `Rosters` is gone, because the team tabs are it

**It opened both teams' rosters side by side, slot by slot, behind a toggle in
the controls row** — and the paragraph that stood here argued for keeping it
beside the team pages on the grounds that it is *both managers' lineups against
each other* where they are one manager's week in depth. That reads well and it
is not what a reader met: two ways into the same rosters an inch apart, one of
them a slot list with nothing any of those players had done and the other the
same names with their week beside them.

**The team pages answer it better and answer more of it.** A slot chip leads
every name on those tables — the same `slot` off the same read, drawn by the
same component the app draws its own with — so the lineup is still there, with
the stats it exists to be read against. What is lost is seeing both lineups in
one glance, which is one press of the strip away and was never the thing the
tab was for.

So the toggle, the `Rosters` component, its per-matchup read and the ~90 lines
of `.mup-roster*` / `.mup-player*` / `.mup-slot*` CSS behind it are all gone,
along with `LeagueMatchupTab`'s `onOpenPlayer` prop — the roster list was its
only caller, the team pages naming a player by the app's own key instead.
**`/api/espn/rosters` stays**, being what a team page reads its slot chips from,
and so does the Transactions tab's own `onOpenPlayer` one level up.

### The roster read hung under StrictMode, and the guard was the cause

**Reported as: the response comes back quickly and the spinner never goes.** It
did, and only under `npm run dev` — which is why it survived being driven
against the built client, React double-invoking effects in **development builds
alone**.

**The `Rosters` half of this has since been deleted with the control it served**
(above), and the section is kept whole rather than trimmed to the opponent
table: the rule it establishes outlived both readers and is what the team
pages' own read was written against. Read `Rosters` below as the shape the
mistake took, not as code that is still there.

**The guard was the bug.** The effect marked the request as asked *before*
firing it and bailed on a second pass that found the mark:

```
if (asked.current === key) return;
asked.current = key;
let live = true;
… .then(r => live && setRosters(r.rosters)).finally(() => live && setLoading(false));
return () => { live = false; };
```

StrictMode mounts, tears down and re-runs. **Pass one** sets the mark and fires
— and its teardown sets `live` false, so when the answer lands neither
`setRosters` nor `setLoading(false)` runs. **Pass two** sees the mark and
returns. `loading` stays true for ever, `rosters` stays null, and the block wait
is the only thing the component can draw. Reproduced on the dev build:
`{block: true, rosters: 0, players: 0}` four seconds after the press.

**It is the trap this codebase has already recorded twice** — `auth.tsx`'s
`exchangeOnce` ("StrictMode made the exchange impossible in development: the
boot effect runs twice, `exchangeCode` consumes the single-use verifier on the
first pass, and the second found nothing stashed") and the research board's
scroll memory ("StrictMode runs a mounting effect, tears it down and runs it
again, which a flag reads as a second visit"). Both were fixed by making the
second pass *join* the first rather than be turned away; this is the same
mistake in a third shape.

**The fix is to delete the ref**, because the dependency array was already doing
its job: `key` is the two team ids and the date, so an unrelated re-render
re-runs nothing and a genuine change is exactly when a re-read is wanted. The
double invoke now costs a second **request** in development and nothing in
production — and not even a second ESPN read, `getTeamRoster`'s `inFlight` map
deduping the pair server-side.

**The opponent table had the identical fault** and took the identical fix, one
step better: it tests `boards[window]`, the state it already holds, rather than
a ref. That is both simpler and self-healing — a span present in `boards` is a
span that genuinely landed, where a mark set up-front is only a claim that one
was asked for — and it makes the failed-read retry fall out for nothing, a span
that errored being absent from `boards` and so asked again the moment `attempt`
moves. It costs `boards` a place in the dependency list, which re-runs the
effect on each arrival and returns immediately.

**The rule to carry away: never mark a request answered before it is answered**,
or unmark it in the cleanup. `App.tsx`'s `rankPopulationsInFlight` was audited
against it and is sound — it deletes the key in an unconditional `finally` and
sets its state with no `live` gate, so a double invoke dedupes and the answer
still lands.

**Measured after, on the dev build (5176) and the built client (4000) alike.**
Rosters: `{rosters: 2, players: 53, block: false}` on both. The opponent table
steps `Season 124 → 30d 28 → Away 16 → 7d 2` games on dev and `30d 28 → Home 12
→ Season 63` on prod, with no wait left standing at any step. Both retry paths
still work: a stubbed failure draws its own line and pressing the control again
lands the read (`opponent 60d → 52 games`, `rosters → 2 / 53`).

### The strip sat on the band's own hairline

**The head's bottom spacing was a `margin` and margins collapse.** `.mup-sides`
said `margin: 0 auto 16px` and `.mup-chrome` had **no bottom padding and no
bottom border**, so that margin collapsed straight out of the band: the chrome
ended *on* the pills, its `inset 0 -1px 0 var(--border)` hairline ran along the
bottom edge of a segmented control, and the 16px it was supposed to spend landed
outside the sticky box as the gap to the card. Measured at 390 before: the strip
occupied **y=63…99** in a chrome **99px** tall — 0px of head under it — with the
card at 115.

**The bye head next door never had it**, and that is what makes the fault worth
one note rather than two: `.mup-team-head` said the same thing with
`padding-bottom: 16px`, which cannot collapse, so one of the two branches had a
band and the other did not.

**So the number lives on `.mup-chrome` and neither child carries one**:
`padding: 20px 16px 12px`, which is `.mup-bar`'s own gap to the strip, so the
band reads **20 / 12 / 12** down. The 16px gap to the content stays where it was
— outside the sticky box, on `.details-chrome`'s argument that it must not ride
down the page with it.

**The player page's tabs are the counter-example and are deliberately
untouched.** `.details-tabs` sits *on* its chrome's rule with 0 below it, and
that is right there: those are underline tabs whose active one draws a 2px
accent on that very line. These are pills, which have no business touching it.

**Measured at 320 / 390 / 480 / 640 / 1200**, before → after: the chrome grows
by the 12 it now holds (**99 → 111px** at 390, 130 → 142 at 320 where the Back
row wraps), the strip ends **12px** above the band's hairline at every one of
them, the card follows at the same 16px gap (115 → 127), and the page overflows
by **0** at each. The bye head reads the same 12 (its 16 inside the band became
the chrome's 12) with its own row unchanged: logo, name, `Bye`, `Acq`.

### The headline sits beside the badge on a phone, where it stacked under the name

**This reverses the passage below it, which is kept because its measurement is
still the reason the layout breaks at all.** What it said: `1fr auto 1fr` with a
score on each side leaves a team about **120px at 390**, which truncates every
name in the live league to three characters — so below **480** the headline
dropped to its own line, the `vs` went with the column it was filling, and each
name had the full half. The breakpoint is measured and unchanged: at 640 the
names fit whole.

**What that arrangement left was the name still sharing its line with the
badge**, which is where the 120px went — and it was sharing it with the one
thing on the row that does not need width. So the wrap is the other way round
now: **badge and headline on the first line, name and record on the second**,
which are the two things read at a glance and the two things read after them.
The name gets the whole half — **162px against 120 at 390** — and stops
truncating: `Sho me the Parlay` reads whole where it read `Sho me the Par…`.

**It is an `order`, so the markup stays written for the wide case.** The DOM is
badge / name / score, which is what a row that fits wants; the phone gives the
score `order: 1` and the identity block `order: 2` with `flex-basis: 100%`.
`.mup-side-right` is `row-reverse`, so the right team mirrors for free — its
badge at the outer edge with the triple beside it.

**And the auto margins come off there.** `margin-left: auto` exists to push the
triple to the far end of a row the *name* is sharing; with the name gone from
that row it would have stranded the two headlines in the middle of the card,
against the `vs` column that is not drawn at this width. Off, each sits beside
the badge it belongs to.

**The rule that reorders is scoped to `.mup-heads`, and that was a real bug for
one round.** `.mup-side-id` is the **bye head's** block too, where there is no
score to make room for — measured unscoped, `order: 2` put the team's name
*after* the `Bye` and `Acq` tags that trail it (`logo · BYE · ACQ 5/10 ·
Brian&Tom's Excellent Advent…`). Scoped, the bye head is byte-identical to what
it was: logo at 16, name at 58, `Bye` at 284, `Acq` at 316.

**Measured at 320 and 390**, before → after: the score moves from its own line
under the name (y=180) to beside the badge (y=145, x=71 — the badge's 26px and
the row's 8px gap), the identity block drops to y=170 at the half's full 162px,
the head is **80 → 71px** tall, and neither name clips at either width. 481 and
up is untouched: the same `1fr auto 1fr` row, badge / name / score, measured
identical.

**The 480 in both paragraphs above is now 640**, and it is the same measurement
taken again against a bigger head rather than a change of mind: the badge is
44px wide where it was 26 and the headline 26px where it was 19, so the wide
row spends about 74 more pixels before the name, and at 640 the longest names in
the league clipped again. See *The card reads a size up*, where the sweep is set
out — the arrangement, the `order`, the auto margins and the `.mup-heads`
scoping are all exactly as described here, and only the width they turn at has
moved.

### The headline stacks under the name on a phone

`1fr auto 1fr` with a score on each side leaves a team about **120px at 390**,
which truncates every name in the live league to three characters — and the name
is what the row is about. Below **480** the headline drops to its own line
inside each side, the `vs` goes with the column it was filling, and each name
has the full half. 480 rather than 640 because it is measured: at 640 the names
fit whole.

**And `.mup-side-id` shrinks rather than wraps**, which is what that layout
turns on. `.mup-side` wraps there so the score can take its own line, and
without `flex: 1 1 0` the *name block* was the thing that wrapped instead — the
logo alone on one row with the name under it, and the two sides then starting at
different heights.

### Measured — the Matchup tab

**Driven against the built client and the live 12-team league at 320 / 390 / 480
/ 560 / 640 / 900 / 1200 / 1920**, on a settled week (18) and the live one (19):

- **Page-body overflow 0 at every width**, on all four tabs, before and after.
- The breakdown reads `9-1-0` / `1-9-0` over **`Batters` then `Pitchers`** and
  ten rows — `R 48/32 · HR 10/7 · RBI 44/31 · SB 6/9 · OPS .859/.837` then
  `K 60/22 · W 3/2 · ERA 2.98/7.67 · WHIP 1.13/1.81 · SVHD 10/3` — with the
  winning figure green in each, `SB` correctly going the other way.
- The card is **346px at 390 and 800 at 900 up**, ten rows at every width, and
  the two names are unclipped from 900. *(Both figures are the tab's: on the page
  it became, the card takes the page's own gutters at 358 and its own
  `--mup-card-w` at 896 — see* The card reads a size up*, where the width is
  derived and the names are re-measured against it.)*
- **The picker moves the matchup**: option 0 gives `mup=103` and
  `The Homewreckers / THE BRONX FLOATERS`, option 4 `mup=107` and the reader's
  own. A `mup=999999` falls back to the reader's own with no error. *(The picker
  is gone with the tab, and so is that fallback — an id this period has no row
  for now draws an honest empty state with a Back button rather than quietly
  showing a different matchup. Measured: `That matchup isn't in week 19`.)*
- **The door works**: pressing the third card's `Breakdown →` on the Scoreboard
  writes `mup=104`, selects the Matchup tab and draws `Pirates Cove / Sho me the
  Parlay`. *(It opens the page over the board now; measured, the second card's
  door writes `mup=111` and draws `The Homewreckers · Summary · Cochabamba
  Crushers` at `z-index: 48`.)*
- **Stepping the period clears it**: `‹` from `mp=18&mup=104` gives `mp=17` with
  no `mup`, on the reader's own matchup for that week.
- **Rosters**: 28 and 25 players, 20 and 19 in a lineup, 53 of the 53 names a
  press, injury chips on the ten who carry one; one column at 390 and two at
  1200. *(That control is gone — see `Rosters` is gone, because the team tabs
  are it. The figures are kept as the record of what it did.)*
- The reader's own matchup in the **live** period is a bye, and draws as one —
  no headline, no rule under the name, and the roster view still offered.

**Bundle: 500.20 → 510.02 KB of JS** (147.93 → 150.32 gzipped) and **116.82 →
121.64 KB of CSS** (20.76 → 21.54) — 9.8KB and 4.8KB raw, 2.4KB and 0.8KB over
the wire, for a tab, a route, a component and the paragraphs above restated
where the rules are.

### Measured — the matchup page

**Driven against the built client and the live 12-team league at 320 / 390 /
640 / 1200 / 1920**, on the live week (19):

- **0 horizontal overflow of the page body and of the overlay's own scroller at
  every width**, on the Summary page and on both team pages.
- **The strip**: `Baldy's Bozos · Summary · Sho me the Parlay` at 87/83/104 at
  320 and 112/83/137 from 390 up, one row at each.
- **A team page**: the tools row is `Roster · Feed`, `Batters · Pitchers`,
  Schedule and the date button reading **`Today`** — one row from 640 up and two
  below it, the two icon buttons paired on the second. 13 rows with **13 slot
  chips**, and the feed 18 items.
- **The date row** opens on a line of its own under the button, offering
  **`Matchup · Today · Tomorrow · Yesterday · This week · Last 15 days`**;
  picking `Matchup` takes the label to `Matchup`, the table to **14 rows** (the
  week's union of rosters against today's 13) and closes the row.
- **The Schedule view** swaps the stat columns for `G · Today 8/16 · Mon 8/17 ·
  …` with its `Next 7 / Next 14` spans, and is absent on the Feed tab.
- **The stack**: a name on a team table opens the player page at **50** over the
  matchup at **48** with the matchup `inert`; one press of Escape closes the
  player, a second closes the matchup, leaving `mup=` cleared, the scoreboard's
  10 cards behind it and **0 `inert`** anywhere.
- **Back** does the same as that second press.
- **A bye** draws **no pages at all** — its card's `Team →` door opens straight
  onto the team's roster, with the head naming him (`Brian&Tom's Excellent
  Adventure · 13-4-1 · Bye`), 0 strips, 0 `.mup-card`s and 14 rows. On the board
  its card carries the week's own line, `R 24 · HR 7 · RBI 27 · SB 4 · OPS .677`
  over `K 61 · W 2 · ERA 2.73 · WHIP 0.91 · SVHD 5`, with **0 of 10 cells
  colored** (nobody to be winning against).
- **The strip is pinned**: scrolled 219px into a team page, `.mup-chrome` is
  still at `top: 0` with the three tabs in it.
- **Legacy links**: `?lt=matchup` opens the Scoreboard with `lt` dropped;
  `?lt=matchup&mup=110` opens the page over it.
- **The app's own date control is untouched** by the extraction, checked at 1200
  and 390: the toggle reads `Today` with an `8/16` bubble, the row opens on its
  own line with the five presets and the range picker, picking `Yesterday`
  writes `?preset=Yesterday` and closes the row, and below 640 the pills give
  way to the `<select>`.

**Bundle: 512.11 → 512.20 KB of JS** (150.86 → 151.29 gzipped) and **121.41 →
122.47 KB of CSS** (21.56 → 21.78) — **90 bytes** of JS and 1.1KB of CSS raw,
0.4KB and 0.2KB over the wire. The JS is flat because the change is mostly a
*move*: a tab became a page, and extracting the date controls took two copies of
that markup down to one.

**And the round that followed — the bye card's own line, the bye page going
straight to its roster, and the strip moving into the head: 512.20 → 512.03 KB
of JS** (151.29 → 151.28 gzipped) and **122.47 → 122.64 KB of CSS** (21.78 →
21.80). The JS falls: one card shape instead of two, and one strip rendered in
one place.

**And the round after it — the acquisitions line, the whole card as the press
target, and the sticky roster table: 512.03 → 513.27 KB of JS** (151.28 → 151.56
gzipped) and **122.64 → 123.10 KB of CSS** (21.80 → 21.87), which is 1.2KB and
0.5KB raw for a derivation, a row, a `role="button"` and a fixed-height column.

**Measured, that round.** The scoreboard draws **0 `.lg-open-matchup` doors** at
320 / 390 / 640 / 1200 / 1920 with **0 page overflow** at each; a card carries
`role="button"`, `tabIndex="0"`, `cursor: pointer` and an `aria-label` naming
both teams, and a press **on a category cell** — the deepest thing in it —
opens the page. The keyboard works: focus draws the accent ring, **Enter** opens
`mup=110`, **Space** opens, and Escape closes with 0 `inert` left. The Summary
page ends on `Moves · 5/10 · Acq · 7/10` at every width, titled `5 of 10
acquisitions used this matchup period`; a bye's head reads `Bye · Acq 5/10`.
Scrolled 283px into a team's roster pane, the header row is **1px** from its top
and the total row 1px from its bottom, while the Feed tab keeps the ordinary
scrolling page. Through the route, the limit is **10** on period 19 (a fortnight's
playoff round), **5** on 18, **10** on 15 (the All-Star break) and **9** on 1
(a 12-day opening stretch), with a team at exactly 9 on that first one.
