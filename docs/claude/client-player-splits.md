### The Splits tab: four comparisons, each drawn whole

**It was one card and it is four.** `Platoon`, `Home vs Away`, `Player vs
League` and `1st Half vs 2nd Half` — in that order, stacked down one tab, every
one of them the same card with its own labels and its own measured scale
(`SplitCard`, which the whole of this file is about). The titles name **both
sides** rather than the subject (they read `Platoon splits`, `Home and away`,
`Against the league`, `First half and second`): three of the four are `X vs Y`,
which is what the card draws, and a reader scanning four heads down a tab is
reading them as a set.

**Three of them arrived from the percentile card's cut control**, which offered
`vs RHP · vs LHP · Home · Away · Last 100 AB` and now offers the two halves of
the season alone. The reason is the one thing this tab exists to say: a *cut*
card shows one side of a comparison at a time, so asking *is he a different
hitter against left-handers* there meant flipping a pill and holding two cards in
your head; this tab prints both columns on one row with the gap between them
measured, which is the arithmetic the reader was doing. What stayed on the card
is the cut that is a **span** — which part of the season — because a span reads
honestly one-sided.

**The order is the reader's rather than the data's.** The parks and the halves
are cuts of his season and the league is not, and the league sits *between* them
because it is the question the other two are usually asked in service of — *is
this man good* — asked directly.

**Every card is drawn or not drawn on its own.** The server fetches the platoon
pair, the four cuts and the league line in three separate reads, each failing to
null in its own `try`, so a man with no second half still gets the other three
and a dead league board costs one card rather than the tab.

**The `full` scale is the *card's*, not the row's**, which is what lets one row
definition serve four comparisons: a `.100` OPS gap is an ordinary platoon split
and a large gap against the league. `SplitStat` carries no `full` any more and
`SplitCard` takes a table of them; the eight tables and the populations they were
measured over are in *The four scales* below.

**Measured on the rendered page**, Ohtani at 1200×900 and 390×844: all four cards
are **680 / 358px** wide with **434 / 173px** rails and **34px** rows, and — the
figure that says they are one card rather than four that agree — all four are
**389.2px** tall at 1200 and **383.2** at 390, byte-identical to the platoon
card's own. Worst `fillWidth − half` is **−3.000px** (the inset) on every card,
so no fill exceeds its half of the rail; the page and the overlay each overflow
by **0**. The gap between stacked cards is **16px** (`.pct-card + .pct-card`,
declared on the later card so a one-card view gains no trailing space).

**Two label changes were forced by that last figure and are worth writing down.**
The league card's heads read `His season` / `League avg` and the halves' `1st
half` / `2nd half` — and the head column is `--spl-val-w` (54px, 46 on a phone),
which is what a *figure* needs. Both wrapped, `1ST` / `HALF` and `156,399` / `PA`,
which is a quantity parted from its unit and a phrase broken mid-way — the fault
the percentile card's `— vs LHP` title took a `nowrap` for. So the labels are one
word each (`Season` / `League` / `First` / `Second`) and `.spl-head-side` takes
`white-space: nowrap`: the head sits above the rails rather than beside them, its
middle cell is empty and there is a 10px gutter either side, so a line a pixel
wider than its column lands on nothing. Before → after, the league card:
**401.2 → 389.2px** at 1200 and **395.2 → 383.2** at 390, heads `25.2 / 37.2 →
25.2 / 25.2`.

**The key lost one preposition.** It read *"toward the side he is **stronger**
against"*, which is right for two hands and wrong for three of the four cards — a
hitter is not stronger "against" home. It reads *"toward the **stronger** of the
two columns"* now, and its second sentence says *each stat, and each comparison,
has its own scale*, which is the thing the four `full` tables buy.

### The four scales, measured off the 2026 league

`full` — the gap that fills the rail end to end — is the **90th percentile** of
that comparison's own gap distribution, rounded, so a full bar means one thing on
every row of every card: *one of the biggest gaps in the league for that stat, in
that comparison*. Each population is the men for whom the comparison is a
comparison — **100 PA (or BF) on each side** — which is the bar the platoon table
was measured against, applied to the parks and the halves. The league card is the
exception and takes **≥200 PA/BF on the season**, which is the same amount of
evidence asked of one line instead of two.

| | population | OPS | AVG | OBP | SLG | ISO | HR% | K% | BB% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Batter, platoon | 167 | .300 | .090 | .090 | .200 | .140 | 3.5 | 8.5 | 6.5 |
| Batter, parks | **313** | .240 | .075 | .080 | .170 | .120 | 3.0 | 8.0 | 5.0 |
| Batter, halves | **213** | .230 | .080 | .085 | .160 | .110 | 2.8 | 8.0 | 5.0 |
| Batter, league | **327** | .135 | .045 | .050 | .100 | .085 | 2.2 | 10 | 5.0 |

| | population | OPS | AVG | FIP | WHIP | K% | BB% | HR% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pitcher, platoon | 202 | .260 | .080 | 2.40 | 0.60 | 9 | 6.5 | 3 |
| Pitcher, parks | **269** | .250 | .090 | 2.10 | 0.50 | 8.5 | 5.0 | 3.0 |
| Pitcher, halves | **134** | .200 | .075 | 2.05 | 0.45 | 8.0 | 4.2 | 2.6 |
| Pitcher, league | **301** | .150 | .055 | 1.55 | 0.32 | 8.0 | 4.0 | 1.8 |

Four things in those numbers are findings rather than arithmetic:

- **The parks are a hair tighter than the platoon.** The *ordinary* home-road gap
  is the same size as the ordinary platoon gap (.103 against .101 of OPS median)
  and the **tail** is shorter — park effects are bounded where a real platoon
  weakness is not. A shared scale would have drawn every extreme home-road split
  short.
- **The halves are the tightest of the three cuts** (median .083 of OPS, 2.6
  points of K%), which is what you would expect of one man against himself with
  nothing but time between the two lines.
- **A man differs from himself twice as much as he differs from the league.**
  Median .103 of OPS between his own halves against **.055** against the league
  average. Drawn on the platoon scale every league bar would be a stub and the
  card would say that nobody is far from average, which is false — which is the
  whole reason the fourth table exists.
- **K% breaks the pattern and is worth naming.** Its league gap (p90 **10.3**
  points) is *wider* than its platoon, park or half gap. Strikeout rate is the
  most spread-out thing a hitter has — the league runs from about 10% to 35% — so
  the distance from average is genuinely larger than the distance between any two
  cuts of one man.

### The league column is a line, not an average of players

`Against the league` compares his whole season with the league's whole season,
and the second column is **thirty club lines summed with the rates taken once at
the end** (`server/src/leagueAverage.ts`) — the same rule `teamHitting.ts` states
for aggregating anything: counts add, rates do not. MLB publishes no league-total
line; `/api/v1/stats?stats=season&group=hitting` is a *leaderboard*, one row per
player, and `/teams/stats` is the board that answers.

**The check that says the sum is over the right population** is the identity that
has to hold: the league's batters and its pitchers face each other, so the two
boards must agree on the total. Measured through Aug 31 2026 — hitting **156,337
PA** and pitching **156,337 BF**, the same number, with AVG `.2437`, OBP `.3183`,
SLG `.4000`, OPS `.7183`, K% `22.08`, BB% `8.92`, HR% `3.03` falling out of both
sides identically. A board missing a club, or double-counting one, breaks it; the
module also refuses a board of fewer than 30 rows outright, which is the
join-to-null rule one number wide.

Both boards are still fetched, because they do not carry the same columns: the
pitching one has `outs`, `hitBatsmen` and `earnedRuns` (WHIP, FIP, ERA) and the
hitting one has `hitByPitch` and `sacFlies` (OBP's denominator). League FIP comes
to **4.23** against a league ERA of **4.16**, which is exactly what
`FIP_CONSTANT`'s own comment says an approximated constant costs.

**The league head says `AVG` where every other head says a sample.** Its count is
**156,399 plate appearances** — a figure no reader acts on, three times the width
of every other head on the tab, and one that reads as a *sample* when what it is
is the whole league. `rightSampleText` on `SplitCard` replaces the printed count
for that column alone; the **number is untouched underneath**, which is the point
of it being a label rather than a smaller `rightSample`: the two sample gates
take `Math.min(left, right)`, so a league column of 156,399 is what makes the
thin-sample rules on this card answer for *his* line alone, which is the only
side of it that can be thin. Everything else still prints its count, grouped
(`sample.toLocaleString()`), which no player's card can see — every sample on a
split of one man is three figures at most.

### The platoon comparison, and the geometry the whole tab inherits

Split out of `client-player-page.md`, which holds the page this tab sits in. One
tab and one card, and it earns a file because the bar it draws has taken five
rounds of measured geometry — the scale, the clamp, the two caps and the ⓘ that
explains them — which is the densest argument on the player page and the one
most likely to grow again.

**The platoon card said what a player did against each hand and left the
comparison to the reader's own subtraction.** Three blocks of stat pills —
Overall, vs LHP, vs RHP — twenty-odd numbers, and the one thing anybody opens a
platoon split *for* was not among them: nobody comes here to learn a hitter's OPS
against lefties, they come to learn whether he is a **different hitter** against
them. So the tab (`components/PlatoonSplits.tsx`) draws each stat **once**, as a
bar that says which side he is stronger against and by how much, and the reader
sees "Perez mashes lefties" without doing any arithmetic at all.

**The bar's zero is the center of the rail, and the fill grows toward the side he
is *better* against.** Length is the size of that edge measured against a
per-stat `full`; the two figures are printed either side of the track, the
stronger one in the accent and the weaker one muted, so the direction is stated
twice and the exact numbers are never hidden behind the picture. Each row's
tooltip spells the whole thing out in a sentence, gap and all (`On-base plus
slugging — .750 vs LHP, .587 vs RHP: .163 better vs LHP.`).

### The key is behind an ⓘ, and the caveat is not

**The sentence that says how to read a bar has been over the bars and under
them, and is now behind an icon on the card's title row.** It is a key to a chart
— *"Each bar runs from the center toward the side he is **stronger** against — the
further it runs, the bigger the split. A full bar is one of the biggest splits in
the league for that stat. Each stat has its own scale, so a long OPS bar and a
long K% bar mean the same thing."* — and moving it from the top of the card to
the foot of it fixed the half that was wrong (a key read *before* the chart is a
paragraph of instructions for something the reader has not seen) while leaving the
half that was expensive. It is **four lines, 70px** at 390 wherever it sits, spent
on a tab whose whole content is eight bars, to say a thing a reader needs **once**.
The second time anybody opens this tab it is 70px of something they have read.

So it is a disclosure now: an ⓘ at the right of the title, opening a popover
holding the key. **Measured on the real card, before → after**: at 1200 the card
goes **427 → 389.2px** and at 390 **455.8 → 383.2px**, i.e. the key costs the tab
**37.8px on a desktop and 72.6px on a phone** and now costs it nothing. The same
saving on every card checked — Sale 393 → 355.2 and 421.8 → 349.2, the thin-sample
Nick Allen 456.4 → 418.6 and 502.5 → 430.

**Its second sentence used to be the statistic rather than the fact, and that
was the half a reader tripped on.** It read *"A full bar is a gap bigger than
nine players in ten have in that stat"*, which is `full`'s own definition — the
90th percentile of that stat's measured platoon gaps — handed over as a riddle. A
reader wants to know whether a long bar is a big split and whether two rows can
be read against each other; a quantile is the machinery that answers those, not
the answer. So it says the answer: **one of the biggest splits in the league for
that stat**, and **each stat has its own scale**, which is the comparability the
per-stat `full` exists to buy. Nothing under it moved — both tables of constants
are the same measured numbers — and the ⓘ stays, because the popover was never
what was complained about and the measured reason it exists (below) is unchanged
by making the sentence inside it plainer. The second paragraph is one line
shorter for having lost the chevron it used to name.

**Why a popover, and not the three things it could have been.** A bare `title`
attribute is **invisible on a phone**, and roughly half this app's traffic has no
hover to give — the rule the research board's `WatchStar` already follows by
drawing on every row rather than on hover — so the tooltip rides along on the
button for a pointer and is not the answer on its own. A **`Modal`** is the wrong
size, and the app has already written down why: the Columns dialog left the
board's control row for one stated reason, *volume*, holding an order row and 48
checkboxes; two sentences are the other end of that scale, and dimming the page,
pinning the body and portalling out to a dialog layer to deliver them is ceremony
the content cannot pay for. And an **inline reveal in the card body** is what the
key already was with a switch on it — it fails on distance, the control being at
the top of the card and the text appearing 300px below it and, on a phone, under
the fold. A disclosure has to reveal something beside itself.

**It is the app's own popover rather than a box that resembles one.**
`.settings-popover` on the panel — literally the class the header's settings gear
and fantasy button open — with only two things of its own: the anchor (it opens
leftward *into* the card, from the card's own right edge) and prose rules, that
box having only ever held controls. The button is
`.app-dialog-close`, the app's 30px icon button, so there is a real touch target
rather than a bare glyph, and it fills with the accent while its panel is showing
the way every other disclosure in the app does. **Measured: panel 320×138.3 at
both widths, landing at x=597 at 1200 and x=41 at 390** — inside the viewport on a
phone, which is what the width cap is for. It needs an explicit `width` where the
gear's menu does not, and the reason is worth keeping: the containing block was
the **30px button**, so a shrink-to-fit resolved against 30px and the box fell
back to the shared `min-width: 180px`, turning two sentences into a 225px-tall
column. (The containing block is `.spl-card-head` now — see below — which is a
*wide* box, so a shrink-to-fit there would be wrong in the other direction. The
explicit width answers both, and is part of why the panel's rect is identical
either side of that move.)

### The ⓘ sits beside the title, and its panel did not move at all

**It was at the far right of the card, which is not where a key goes.** The
button was `position: absolute; right: 0` on the card head, and what that bought
was worth having — a title centered in the card with the control out of flow — at
a price nobody had priced: **228px between the ⓘ and the words it belongs to at
1200, and 77px at 390** (658.66 → 887 and 253.66 → 331, measured). At that
distance the icon reads as a control over the
*card* rather than as a key to the heading, and a reader looking for the key
looks at the heading. So it is laid out immediately after the title instead.

**The title still sits exactly where it did**, which is the half of the old rule
worth keeping rather than trading: `.pct-card-head` is shared with the percentile
card, whose title is centered by `text-align`, so one tab's heading sitting 19px
off where every other tab's sits is a difference nothing on screen explains. The
button is in flow after the title and **gives its own width back** — 4px on the
left, 4 + its own 30 returned on the right, which is exactly 0 of the flex line's
main size — so the line centers as though the button were not there and the
button hangs to the right of it. Measured before → after, at 1200 and 390: the
title's box is **byte-identical** (541.34 → 658.66, 117.31 wide at 1200; 136.34 →
253.66 at 390), the head and the card are unchanged, and the only thing that
moved is the button, 887 → **662.66** at 1200 and 331 → **257.66** at 390 — which
is the title's right edge plus 4 in each case.

**And the panel's own rect is unchanged, which is the neat part.** The obvious
consequence of moving a button is that its popover moves with it, and at 390 that
is fatal: anchored to a button that now spans 257.66 → 287.66, a 320px panel runs
**257.7 → 577.7** opening rightward, or **287.7 → −32.3** opening leftward, i.e.
off the screen either way. What the change actually does is **re-parent the
containing block**
rather than flip the side — `.spl-key` becomes `position: static`, so `right: 0`
resolves against `.spl-card-head` instead of against the button, and 0 is now the
card's own right edge, which is exactly where the button used to be. Measured
before → after with the panel open: **597 → 917 at 1200 and 41 → 361 at 390,
320 × 138.34 in both**, identical to the pixel. `left: 0` was the other option and
is worse at the wide end — the panel would run 283 → 603 and stop **60px short of
its own trigger**, which reads as a popover belonging to something else.

**The stacking rule this key has always had to obey is kept, and `static` is a
second guarantee of it.** The first version of the button used `transform:
translateY(-50%)` to center itself, which makes a stacking context and trapped the
popover's `z-index: 40` inside a box that paints *before* the table — so the key
opened underneath the very bars it explains. A static, untransformed box cannot
make one at all. Checked rather than assumed: with the panel open,
`elementFromPoint` at a point where the panel overlaps a `.spl-fill` returns the
panel, at 1200 and at 390.

**The rule is written two classes deep** (`.spl-card-head .spl-key`) because
`InfoKey` is shared now and the `.info-key*` family is the *component's*, where
the anchor is this caller's: a `position: relative` arriving on `.info-key` later
would otherwise silently put the panel back on the button, which is the state the
390 measurement above says is off the screen.

**Real keyboard access and a real name, driven rather than assumed.** It is a
`<button>` with `aria-label`, `aria-expanded` and `aria-controls`; driven in a
browser at **1200×900 and 390×844** after the move, seven presses in sequence:
a click opens it (`aria-expanded` true, the panel in the viewport, painting over
the bars) and a second click closes it; **Enter opens it**; **Escape closes the
key and leaves the player page standing** (still on the Splits tab, focus back on
the button); **Space opens it**; an outside press closes it and is spent on the
dismissal, the tab behind it unchanged; and a final Escape — with nothing open —
closes the player page. Page and overlay overflow are 0 throughout.

**The sample-size caveat stays in the body, and the two are not the same kind of
thing.** The key is *instructions* — true of every player, true of every chart on
the tab, read once. The amber line is a *caveat about this player's numbers*: it
fires only when a side is thin, it is `--hr` amber precisely to be caught sight
of, and it changes how the bars **on screen** should be read. Hiding a conditional
warning behind an icon that gives no hint it is holding one is how a warning goes
unread — and a reader who has not pressed the ⓘ has no way to learn there was
anything to press it for. So the general note is behind the button and the
particular one is on the card, which is the order the two were already in when
both were captions. Checked on Nick Allen (31 PA vs LHP) at 390: the amber line
sits under the bars and the key opens over them, both reachable at once.

**`.spl-intro` is gone from the stylesheet**, and with it the two arguments its
rule used to carry — both of which were right and neither of which applies any
more. Folding the key into `.spl-note`'s rule stopped one drifting a pixel from
the other, and there is now one of them; left-aligning it matched it to the caveat
under it, and it is not under it.

**Direction carries the polarity and nothing else does**, which is the decision
the whole shape was chosen for. A row where less is better — a pitcher's FIP and
WHIP, a batter's K% — is **not** drawn with a reversed scale or a different
color: `lowerBetter` flips which side counts as stronger and flips nothing else,
so a bar pointing left means the same sentence on every row of the card. That is
what a center anchor buys, and it is why the obvious alternative was rejected:
`RateBar` (`Arsenal.tsx`) is anchored at the left and scaled to a share, and
expressing this as L/(L+R) would **invert its meaning** on exactly those rows and
flatten every other one — .900 against .700 is a 56/44 bar, which is not what a
.200 OPS gap looks like. Five of the pitcher card's seven rows are `lowerBetter`,
so that is the ordinary case rather than the corner. The percentile card's
**dumbbell** was the other component considered and is a different object again:
its rail is a 0–100 league percentile and its two marks are two readings of one
population (an actual and its expected), where these are two populations on a
rail whose units are the stat's own. So this is a third bar, deliberately, and
the CSS says so by borrowing `.pct-card` for the box and the head and adding only
the grid, the rail and the two thin-sample states under `.spl-*`.

**`full` is measured off the league rather than chosen**, which is what makes a
full bar mean something rather than look dramatic. Every 2026 batter with at
least 100 PA against each hand (**167** of them) and every pitcher who faced 100
batters of each hand (**202**) had his gap in each stat computed, and `full` is
the **90th percentile** of that distribution, rounded — so a bar that reaches the
end of the rail is a top-decile split in that stat, and two rows of different
stats are readable against each other. Batters: OPS .283 → **.300**, AVG .087 →
.090, OBP .091 → .090, SLG .204 → .200, ISO **.140**, HR% 3.34 → 3.5, K% 8.51 →
8.5, BB% 6.61 → 6.5. Pitchers, over their own population: OPS .255 → **.260**,
AVG **.080**, FIP 2.38 → 2.40, WHIP 0.61 → **0.60**, K% 8.81 → 9, BB% 6.69 → 6.5,
HR% 3.10 → 3. The two kinds deliberately **do not share a scale** where their
distributions differ (a pitcher's OPS-against spreads a little tighter than a
hitter's OPS): a platoon gap is measured against the population it was drawn
from. The medians are worth stating too, since they are what an ordinary row
looks like — .101 of OPS and 3.3 points of K% for a batter — so the typical split
fills about a third of the rail and the end of it is a real place. A gap past
`full` clamps, which about one qualified player in
ten does on any given row by construction; Cristopher Sánchez is among the
league's most extreme cases and clamps four of his seven (his `.317` OPS against
lefties and `.762` against righties is a .445 gap). **A clamped bar is drawn no
differently from one at full scale** and says it is clamped in the row's own
tooltip alone — see *The clamp is a sentence, not a mark* below, which is where
the two marks that used to draw it, and why neither survived, are set out.

**The fill can never exceed its half of the rail, and for a while it could — by
1.43px, at the one place a reader would look.** This paragraph used to assert the
clamp above and stop there, and the clamp was never the thing that was broken:
`Math.min(1, gap / full)` was right, the width came out at exactly 50% of the
track, and the DOM agreed the fill's *box* sat inside the rail's *box* — measured
on Willson Contreras's clamped K% row, `fill.left − track.left` was **0.00px** at
1200 and at 390 alike. **The rail is painted as a pill**, though, and the fill was
inset 3px top and bottom and **nothing at all at the ends**, so a bar drawn to the
box ran past the ink: a rail of height 16 caps at radius 8, whose edge has already
receded **1.76px** by the fill's top row of pixels, and a clamped bar — which is the
bar you look at, being the one that reaches the end, and whose outer end was
squared off at the time — put its corner out there. Walking the fill's painted boundary against the rail's
pill in closed form, every clamped row in the league overhung by **+1.430px**
while every unclamped row cleared it by 3px. That is the whole bug, and it is the
third of the three shapes this kind of fault comes in: not a missing clamp, not a
clamp a `NaN` escaped, but **the rail's own box and the fill's box disagreeing**.

So the fill is inset on all four sides: `--spl-inset` (3px) top and bottom, which
makes it the rail's own pill inset by 3 — a radius-5 cap inside a radius-8 one,
the two concentric. The squared-off end was untouched by that fix and read
better for it, a squared cap nested inside a rounded one being unmistakable beside
the rounded cap of a bar that merely came close. It did not survive being looked
at twice more; see below. (**"All four sides" is now three**: the two long ones
and the *outer* end. The horizontal inset was only ever spent at the outer end —
it is subtracted from the fill's length while the inner edge is pinned to the
rail's center — and the inner **cap** went flat in the fourth round, so there is
nothing there to nest inside anything. The sentence is left as it was written
because the nesting argument it makes is the outer end's and is still exactly
right.)

### The clamp is a sentence, not a mark

**Three things have been tried at the outer end of a clamped bar and the third
is nothing.** (Marks, not rounds — the round count in the summary above is over
the whole geometry, and these three fall in its third and fifth.) A gap past
`full` is clamped by `railFraction`, the
row's tooltip says *"Bigger than the bar can show, so it stops at the end."*, and
the rail itself draws a clamped bar exactly as it draws one at full scale. Two
earlier rounds put a mark there and both were complained about; what follows is
the record of them, because the reasons they failed are the reasons nothing
replaces them.

**The first squared the fill's outer end off.** That reads as a bar with its
corner cut off, and it cost real geometry: a square corner sits at the fill's
extreme height, 5px off the rail's center line, where the rail's own cap has
already receded `8 − √(8² − 5²)` = **1.76px** — so at the sides' 3px inset it had
1.24px of rail beside it against its own midline's 3px, and the ends had to take
a larger token of their own (`--spl-inset-x`, 5px). Its quietest fault was that
**nothing on the card said what it meant**: a reader met a differently-shaped bar
end with no key to it.

**The second made every cap round again and knocked a chevron out of the fill
just inside its tip**, with the key behind the ⓘ to explain it — which is what
made a mark defensible at all, and is also what retires `--spl-inset-x`. A
radius-5 cap 3px inside a radius-8 one **shares its center**, so the track shows
exactly 3px of itself at *every* angle rather than 5px at the midline and 3.24 at
the corner, and every bar is **2px longer** than it was. **That is still the
geometry today**, and these are its measurements: a clamped bar's tightest row
went **4.196px → 3.000px** of clearance and its midline 5px → 3.000px, with
`fillWidth − half` going **−5.000px → −3.000px**. The
tightest clearance *falls* by 1.196px and that is the right trade, because a
constant margin reads as a margin where a varying one reads as a corner running
out of room.

**The third is this one, and it removes the mark rather than redrawing it.**
The chevron was complained about too, and by then it had cost a pseudo-element
pair, four direction rules, 14px of solid accent laid under it so it stayed
legible on a hatched fill, and a stub of bar in the key's popover to explain it —
all to say a thing the row was already saying in words.

**What decides it is the two figures printed either side of the rail.** The
picture gives up precision at the end of its scale; the exact numbers it gave up
are ten pixels away on the same row, in the accent and the muted gray. So the
mark was flagging a loss the reader could already read off, in a glyph they had
to open a popover to decode — which is the same fault the squared end was
retired for, arrived at from the other direction. And the sentence a full bar makes is true of
a clamped one as well: *one of the biggest splits in the league in that stat*. A
1.0× bar and a 3.2× one really do both say that, so the two reading alike is not
a claim anybody has to be warned about.

**The hatched-and-clamped row is where it reads best**, and it is not a rare
shape — a row can be thin *and* clamped, and on Josh Hader's card **six of seven
rows are both**. The chevron needed a solid ground to be seen against the hatch,
so it laid 14px of solid accent over the end of a fill whose whole point is that
it is *not* solid: the sample-size texture broke, on nearly every bar, to make
room for a mark about something else entirely. The hatch now runs uninterrupted
to a clean round cap and says one thing.

**Nothing about the length or the invariant moved**, which is the property this
had to preserve. `railFraction` is untouched and still total; the inline width is
still `calc(frac × (50% − var(--spl-inset)))`; `max-width` still says it again at
the last moment; the inner end is still flat and the outer still round. What goes
is `.spl-fill--over` and its six rules, `.spl-key-chevron` and its own, and the
`over` class on the fill — `over` itself stays in `SplitRow`, read off `frac` as
before so the sentence and the length cannot disagree, and feeding the tooltip
alone. **Length stays monotonic in the gap** and now does so with nothing to
protect it: the shortest clamped bar is never shorter than the longest unclamped
one, checked on every drawn card (tightest case Sánchez at 1200, 214 against
207.66, and at 390 83.5 against 81.06).

**Measured on the rendered pixels, before → after**, by walking each fill's ink
one device row at a time against the rail's own painted pill (computed in closed
form from the track box, which is a stadium of radius h/2), at ×4 device
resolution, over ten real 2026 players at 1200×900 and 390×844. **Knocked-out
pixels strictly inside a clamped fill's own hull: 9.5 CSS px² → 0.0**, on every
clamped solid row of every card; `::before` and `::after` both compute `none` on
every drawn fill where they were `""` on the clamped ones. Everything else is
byte-identical: worst outer clearance **2.881px**, worst `fillWidth − half`
**−3.000px**, inner recess **0.000 at 1200** (0.500 at 390, where the rail's
center falls on a half-pixel), rows **34px**, rails **434 / 173**, cards **680 /
358**, and page and overlay overflow **0 / 0** at both widths. The one figure
that is not identical is Josh Hader's clearance, **2.881 → 2.952px**, and it is
the hatch rather than the cap — on a striped fill the outermost accent pixel is
decided by the stripe phase, which is the same caveat the round below records.

**The tooltip's wording went with the mark.** It read *"Bigger than the rail's
full scale, so the bar stops at the end."* and now reads *"Bigger than the bar
can show, so it stops at the end."* — plainer for the same reason the key is:
with the two figures beside the bar, what a reader needs is that the picture
stopped, not the name of the thing it stopped against. Checked on Sánchez,
Turang and Hader at both widths; on Hader it composes with the thin-sample
clause, reading *"… so it stops at the end. Sample too thin to lean on."*

**Those two paragraphs are the first two of five rounds on this one geometry.**
The third and fifth are above — *The clamp is a sentence, not a mark*, which
holds both: the round that retired `--spl-inset-x` along with the square cap it
was written for and moved back to a single 3px inset, and the round that took the
chevron off the bar altogether and left the clamp to the tooltip. The fourth is
below — *The inner end is flat* — and it is about the **other** end entirely,
which is why it is not a reversal of either however much it sounds like one. The
figures here are kept as the record of how the fill came to be nested at all;
where they name 5px at the ends, read the third round, and where they describe
the fill as a pill, read the fourth.

**Bundle over that round: 451.63 → 452.70 KB of JS** (133.68 → 133.86 gzipped)
and **103.44 → 104.46 KB of CSS** (18.46 → 18.65), which is 1.1KB and 1.0KB raw
for a disclosure, a popover, a chevron and its solid tip — and nearly all of the
CSS half is the comments arguing them. **The fifth round gives some of it back**:
**485.25 → 485.14 KB of JS** (143.98 → 143.94 gzipped) and **112.93 → 112.14 KB
of CSS** (20.12 → 19.97), both *down*, which is what removing seven rules and a
span costs when the comments replacing them are shorter than the ones they
argue away.

### The inner end is flat, because the bar grows out of the zero

**A bar anchored at a center must look anchored at it, and a round cap there says
the opposite.** Both ends of the fill were pills, so the ink pulled away from the
rail's center everywhere except one row through the fill's own middle: measured on
Perez's card at 1200, **3px of recess** at the rows a reader takes the shape from,
5px at the extreme rows in principle. What that draws is a lozenge sitting *near*
the middle of the rail, which is a picture of a quantity that begins somewhere
vague — where the whole device is a quantity measured **from zero**, and every
diverging bar chart ever drawn meets its baseline square. So the inner end is
flat and the outer one stays round: `.spl-fill--r` rounds its right end and
squares its left, `.spl-fill--l` the reverse.

**The round before this took a square cap out and this puts one back, and the
two are not in conflict — they are opposite ends of the bar.** That cap was the
**clamp marker** on the *outer* end, and it went for three stated reasons; not
one of them reaches this end, which is worth walking through rather than
asserting. (The marker itself is gone entirely now — see *The clamp is a
sentence, not a mark* above — which retires the first and third of those three
outright and leaves this end exactly as this round left it.)

- It *"looked wrong at the end of a bar"* — and the outer end is where a bar
  stops, where a squared-off tip reads as damage. The inner end is where a bar
  **starts**, and a flat edge at an origin is the only thing that reads as an
  origin at all.
- It *"costs the clamp mark nothing (that is the outer end's)"*, which was true
  when there was one and is now true for free.
- It *"forced the ends onto an inset of their own"* (`--spl-inset-x`, 5px),
  because a square corner sits at the fill's extreme height where the rail's own
  cap has already receded 1.76px. **The inner end has no such problem and takes
  no inset**: the horizontal inset is spent entirely at the outer end, by being
  subtracted from the fill's *length*, while the inner edge is pinned to the
  rail's center by `left: 50%` / `right: 50%`. The rail is straight-sided there —
  it is 217px from either cap — so there is nothing for a corner to run into. The
  token stays a single 3px and `--spl-inset-x` stays retired.
- It *"was never explained anywhere on the card"*, which is the sharpest of the
  three and the one that decides this. A clamp marker is a **claim** — *this bar
  is not the real number* — and a claim a reader cannot decode is worse than
  none. A flat edge on the zero is not a claim, it is the shape of the
  measurement, and it needs no key: the card already says the center is zero,
  with a dashed guide down it. (That sentence outlived the mark it was written
  about: the chevron *was* explained, behind the ⓘ, and went anyway — a claim a
  reader has to open a popover to decode is not much better than one they
  cannot.)

**Nothing about the length moved**, which is the property the invariant rests on.
The inline width is still `calc(frac × (50% − var(--spl-inset)))`, `railFraction`
is untouched, and `max-width: calc(50% - var(--spl-inset))` still says the same
thing at the last moment. Only `border-radius` changed, and only on which corners
it lands.

**Measured on the rendered pixels, before → after**, by walking each fill's ink
row by row against the rail — the same scan the third round used, run on real
screenshots at device-pixel resolution. On the six solid cards (Perez, Turang,
Contreras, Sánchez, Betts, Sale) the worst inner recess goes **3 → 0.000 at
1200**; at 390, where the rail's center falls on a half-pixel, it goes 2.5–3.5 →
−0.5–0.5, which is the sampling grid rather than a recess. `fillWidth − half`
is unchanged on every row of every card and still **≤ 0** (−3.000 on a clamped
row, −50.56 down to −189.17 on Perez's unclamped ones), and the outer clearance
is identical before and after everywhere.

**The hatched card had to be measured with its hatch off, and that is stated
rather than glossed.** On Nick Allen the fill is accent stripes over transparent
gaps, so "the leftmost accent pixel in this row" is decided by the stripes and
not by the cap — the raw scan reads 7 → 5 and means nothing. Neutralising
`.spl-fill--thin` to a solid **in the page, in both builds, on the same eight
rows**: inner recess **3 → 0 on all eight**, with the widths byte-identical
(214 / 211.61 / 183.08 / 214 / 214 / 197.23 / 214 / 108.5) and the outer clearance
byte-identical too. Four of those eight rows are thin *and* clamped, which is the
one row shape that has to survive every change to this bar.

**The clamp mark was untouched by this round, counted rather than eyeballed** —
and has since gone entirely, so what follows is the record of it holding still
while the *inner* end changed. The chevron was a knock-out inside the fill's
outer 14px tip, countable as non-accent pixels in that window: **22 per clamped
row on a solid fill and 16 on a hatched one, identical before and after**, over
Sánchez (4 clamped), Turang (3), Contreras (1) and Allen (4, all hatched), at
1200 and 390. The hatched rows were still hatched. `.spl-key-chevron` — the stub
of bar in the key's popover — deliberately stayed a full pill, being a detached
fragment of an **outer** end. All of that is gone with the mark; the flat inner
cap this round is about is not, and re-measures at **0.000** inner recess at 1200
after its removal.

**The zero guide costs two device pixels, and nothing about it changed.**
`.spl-track::before` is a 1px dashed border-left at the rail's center, drawn
6px proud of the rail top and bottom, so it is a ~28px column of which the fill
can only ever reach 10. A **right**-pointing bar starts on that column and so
covers a little of it; a **left**-pointing one stops at its edge and covers none.
Measured over the same cards: a right-pointing row's tick ink goes **14 → 12**
(covered 6 → 10) and a left-pointing row's is **18 → 18**. Raising the tick above
the fills was considered and refused — a guide drawn *over* the data would say
the line is in front of the bar, where the truth is that the bar begins at the
line.

**The two ends of the length range were forced onto a real row**, since the
formulas did not move but the caps did. A width of `0` resolves to the **3px
`min-width` nub** (a D of ink with its flat edge on the center and its outer end
rounded), `overHalf −214`, inner edge **0.000** off the center; a width of
`5000px` resolves to **214** against a half of 217, `overHalf −3`, inner edge
0.000. Both directions, both radii sets, checked.

**Everything else this card is measured against is unchanged** at 390 and 1200 on
all six players: row height **34px**, rail width **173 / 434**, card width
**358 / 680**, and page and overlay overflow **0 / 0**.

**Bundle: JS unchanged at 454.23 KB** (134.39 gzipped) — the only change to a
component was a comment — and **CSS 104.65 → 104.73 KB** (18.69 → 18.71), which
is 80 bytes raw and 20 over the wire for two directional rules and the paragraphs
above restated where they apply.

**Sample size is on the card whatever it is, and changes how the bars are drawn
twice.** The column heads carry it always — `vs LHP · 76 PA` — and two thresholds
sit under it, because the two failures are different things. Under
**`MIN_SAMPLE` (25 PA / 25 BF)** on the thinner side **no bar is drawn at all**:
a .400 average over 15 PA is one good week, and the tab becomes two columns of
figures with a line saying so (`Only 24 PA vs LHP — a handful of plate
appearances is not a platoon split, so the figures are here and the bars are
not.`). Between there and **`THIN_SAMPLE` (100)** the comparison is worth showing
and not worth leaning on, so the fill is **hatched** rather than solid — this
card's version of the percentile card's dotted bubble, where a broken mark has
meant "our estimate, not a measurement" since it was written — under a line
naming the thin side. Neither number is a stabilisation point and neither is
claimed as one (none of these stabilises at 100); the point is that the reader is
told which side is thin, and how thin, in the same glance as the bar. A side with
**no** split at all gets its own sentence and dashes rather than a zero.

**Which stats, and the counting stats are the interesting omission.** A batter's
rows are OPS, AVG, OBP, SLG, ISO, HR%, K%, BB% — the slash line and its headline
in reading order, then power net of average, then the two three-true-outcome
rates, which is where a platoon split usually *comes from*: a right-handed
hitter's trouble with a right-handed slider shows up in K% long before it shows
up in OPS, and K% is also the batter card's one `lowerBetter` row. A pitcher's
are OPS-against, AVG-against, FIP, WHIP, K%, BB%, HR%. **HR, RBI, AB and hits are
not on either**, because every one of them scales with how often he faced that
hand — a right-handed hitter takes about 70% of his plate appearances against
right-handers, so a raw count says which side he *saw more of*, which is a fact
about the schedule rather than about him. Everything comparable is therefore a
rate, and power appears as ISO and as home runs per PA. **R and SB are out
twice over**: they are counts, and MLB returns both as **0 on every platoon
split for every player**, which the old card handled by gating them on its
`whole` flag and which this card handles by never asking.

**ERA is absent from the pitcher's rows and FIP stands in for it.** MLB does not
split earned runs, so a platoon half has no ERA at all — but it has the counts
FIP is made of, and `PlatoonSplits` reads the `fip` the server already computes
per split off `leagueRates.ts::fipLike`, the same function (and so the same
`FIP_CONSTANT`) the pitcher card, the game log and the research board use. It
honors that function's own floor: a half under three innings carries null and
**dashes** rather than reporting one afternoon as a season (checked on a 5-BF
side, which dashes while the 12-BF side beside it reads 2.88).

**Two fields were added to the data model for it, and both were checked to exist
on a split before being asked for.** `SeasonStats` gains `strikeOuts` and
`baseOnBalls` — counts rather than rates, because a rate over a split has to be
divided by *that split's* own PA and only this object knows it — which is what
K% and BB% are drawn from; and `PitcherSeasonStats` gains **`opsAgainst`**, MLB's
own `ops` off the pitching split, which is the only single-figure summary a half
has now that ERA is missing from one and is the direct analogue of the batter
tab's headline row. Both are filled in `mlbStats.ts`'s two `to*SeasonStats`
parsers and mirrored by hand into `client/src/types.ts`. **No cache version moves
for either**: `playerStatsCache`/`pitcherStatsCache` are memory-only on a
30-minute TTL, `withEstimators` copies by spread, and although a `PlayerReport`
rides in a `day-{date}-v{N}` snapshot, `getReport` reads only `games` off a day
and builds the report itself — the same test that passage sets for `teamId`,
`team` and `position`: not whether the shape rides in a blob, but whether
anything reads it back out of one.

**The tab keys were swapped and the swap is the honest one.** `splits` used to
name the tab labeled **Stats**, a leftover from when that tab *was* the platoon
card, kept through the rename on the reasoning that a key in no URL is not worth
churning. That stops being true the moment a tab called Splits exists beside it:
two tabs, one named after the other's subject, reads fine today and is a trap the
next time anybody touches the file. So the window table is **`stats`** and the
platoon comparison is **`splits`**, each named for what it holds. Nothing outside
`PlayerDetails.tsx` had to change but one prop type — the open tab is component
state and is in no URL, and `PlayerOverview`'s `Stats →` link (`onTab`) is the
only caller, which is a compile error rather than a silent change of behavior if
it is missed.

**It costs no request.** The splits fetch is the page's own **eager** one, made
on open because the Overview tab's season line reads it, so this tab is never the
first thing on screen to be waiting — unlike the Stats, Game Log, Arsenal and
Charts tabs, which are lazy on first open. The `Reading the platoon splits` wait
and the error line moved across with the card.

**The card has a second caller now, and it takes an optional `highlight`.** The
feed's **Upcoming** row draws `BatterSplitsTab` in its dialog with the announced
starter's half marked — the same component, the same `SeasonStats` objects (the
report's `splitVsLeft`/`splitVsRight` are what `getPlayerStats` puts on the
splits route as well), the marked column taking `.spl-head-side--on`'s accent
color and the pitcher's hand and name on the head's own tooltip. This tab
passes no `highlight`, so neither is rendered at all here and every figure this
section records is unmoved (re-measured: heads 25.19px, card 680 / 358, row
34px, rail 434 / 173). The whole of that argument — why the row shows the
comparison rather than the one half, and why the mark used to carry a third
line and doesn't any more — is in **Client — the Feed view**, *The Upcoming
dialog is the Splits card*.

**Where it sits**: directly after **Percentile Rankings**, so the strip reads
`Overview · Percentile Rankings · [Arsenal] · Splits · Stats · Game Log ·
Charts`. That is a **seventh** tab on a pitcher and needed nothing:
`.details-tabs` already scrolls sideways and scrolls the active tab into view
with a 24px peek (checked at 390 on a batter and a pitcher — every one of the six
and seven tabs lands fully inside the strip when selected, and every tab switch
still resets the view's scroll to 0).

**This paragraph used to place it after Stats, and the argument it gave was a
good one — it is overruled rather than refuted.** What it said was: *after Stats
and before the Game Log, which is the order the season is cut in — the whole of
it, then the same season cut by handedness, then the games it is made of.* That
is a true description of the three tabs and it orders them by **how the data is
sliced**, which is a fact about the app rather than about the reader. Ordered by
what the reader is doing instead, the pair that belongs together is the
percentile card and this: both are a picture of *what kind of player he is* — one
against the league, one against the two hands he faces — where Stats and the Game
Log are the numbers he has actually put up. So a reader deciding about a stranger
now takes both pictures without a table between them, and the cutting order
survives intact one place along (`Stats → Game Log`, the season then the games it
is made of). Nothing about the tab's contents, its fetch or its keys moved; this
is one button's position in the strip.

**Measured in a browser at 1200×900 and 390×844, against the live server, in
each of the five states the card can be in.** *Solid* — Salvador Perez, 131 PA
vs LHP against 342 vs RHP: eight rows, seven pointing left, `.750`/`.587` on OPS
at 27% of the rail, K% pointing **left** at 13% on 17.6% against 20.8% (the
polarity, drawn right). *Extreme* — Cristopher Sánchez, 153 BF / 493 BF, all
seven rows left with four clamped at the rail's end, each ending in the same
round cap an unclamped bar ends in. *Thin* — Aaron Judge at 76 PA vs LHP and Josh
Hader at 30 BF vs LHB: every fill hatched, the amber line naming the side, and on
Hader six of the seven both hatched and clamped, the hatch running unbroken to
the cap. *Too thin* — Eduardo Valencia at 22 PA vs LHP: no fills at all, the
rails empty, the figures still there. And *one-sided* — Gage Workman at 0 PA vs
LHP: dashes down the left column, no bars, and a line saying there is nothing to
compare against. The card is **680px at 1200 and 358 at 390** (the reading column
and the overlay's gutters), the rail 434 and 173, the row **34px** at both, and
the **page and the overlay each overflow by 0** at both widths in every state;
the whole tab fits one screen at 900px tall without scrolling.

**And the invariants were driven against stubbed hostile shapes**, the way the
rounds above were: a 2.000 OPS against a .200 over 40 PA, a −4.00 against an
18.00, a null / an empty string / the server's em-dash / the literal `NaN`, two
identical halves, and a zero PA denominator. At both widths, **no row's fill
exceeds its half of the rail** (worst `fillWidth − half` **−3.000px** on the
clamped cases) and none is a non-finite length; the null rows dash with no bar,
the dead-even rows draw the 3px nub at the center, and the zero-PA card draws no
bars and says `No plate appearances vs LHP this season, so there is nothing to
compare against.`

**Bundle: 445.46 → 448.22 KB of JS** (131.59 → 132.68 gzipped) and **99.98 →
101.82 KB of CSS** (17.80 → 18.12 gzipped) — 2.8KB and 1.8KB raw, 1.1KB and
0.3KB over the wire, for a component that replaced a card and a stylesheet block
that is mostly the paragraphs above restated where the rules are.

### The card has three callers, and the third one got no bars

**The Splits tab is not the only place this card is drawn.** The feed's Upcoming
row opens it in a dialog with one half marked, and — since the player page grew
a **Schedule** tab — an upcoming game row on that tab opens exactly the same
thing, from `PlayerSchedule.tsx`, in the same `Modal` under the same
`.play-detail-box`. That third caller shipped with **no bars at all**.

**Both halves of the complaint were one fault, and it is the one this stylesheet
already documents.** `.pct-card` centers itself with `margin: 0 auto`, which is
right in the block flow of the Splits tab; inside the dialog's flex column that
auto cross-axis margin **suppresses the item's stretch**, so the card shrink-to-
fits. `.upcoming-detail .pct-card { width: 100% }` was written for exactly this
when the feed's Upcoming row went from an accordion to a popup. The player
page's wrapper, `.start-detail`, was folded onto `.upcoming-detail` for the flex
column above it and **not onto this line**, so the fault was reintroduced one
caller along.

**What that costs, measured on Ohtani's Aug 20 row (178 PA vs LHP, 357 vs RHP,
so no amber note):**

| | dialog | card | rail track | fills painted | row |
| --- | --- | --- | --- | --- | --- |
| 1400 before | 800 | **246** | **0** | **0 / 8** | 34 |
| 1400 after | 800 | 680 | 434 | 8 / 8 | 34 |
| 390 before | 358 | **185** | **0** | **0 / 8** | 34 |
| 390 after | 358 | 328 | 143 | 8 / 8 | 34 |
| 320 before | 288 | **185** | **0** | **0 / 8** | 34 |
| 320 after | 288 | 258 | 73 | 8 / 8 | 34 |

The **dialog's own width never moved** — `min(--card-column, 100%)` on
`.play-detail-box`, 800 / 358 / 288 before and after, and the page overflows by
0 at every width in both states. What read as a narrow popup was a 246px card
adrift in a 774px body. And 246 is not a new number: it is the same 246 the
feed's own fix recorded, arrived at the same way.

**The fills were rendered, not missing** — eight `.spl-fill` nodes on every row
of the broken card, each carrying its inline `calc(frac × (50% −
var(--spl-inset)))`. The `1fr` rail track has no intrinsic content, so it
contributes nothing to the table's max-content and collapses to 0 in a shrink-to-
fit card; 50% of 0 is 0. That is worth knowing because it is the reason the bug
survived: the card looks *complete*, a tidy column of figures with empty rails,
rather than like something that failed.

**Which player it opens on decides whether you see it at all.** The amber
thin-sample note is a paragraph inside `.pct-card`, and its own max-content is
**623.75px** — wider than the table's 200 — so on a thin-split card the shrink-
to-fit lands at 669.75, a hair under the 680 cap, and the bars come back by
accident. Aaron Judge's card (76 PA vs LHP) looked right at 1400; Ohtani's was
the 246. A layout bug you can only reproduce on half your roster is a layout bug
that gets reported as "sometimes".

**Three other fixes were tried on the live card at 1400 and all three lose.**
`align-self: stretch` on the card: **246, track 0, 0 / 8** — unchanged. The same
declared as `align-items: stretch` on the wrapper: **246, track 0, 0 / 8** —
also unchanged, and both for the reason the trap is a trap. An auto margin in
the cross axis does not *lose* to alignment, it makes the item **ignore
alignment entirely** and center at its hypothetical size, so neither
declaration is even in the argument. A `min-width` on `.spl-track` does put ink
back — **446px card, 200px track, 8 / 8 painted** — and is the wrong shape of
answer twice over: it is a declared constant where the right number is *the
width the box has to give*, which is this repo's standing rule, and it still
leaves the card floating 328px short of its body. `width: 100%` reads the
container, and it is the line that was already there. So the fix is one selector
folded onto an existing rule rather than a rule of its own — two wrappers that
are the same object, which is the other standing rule.

**The hatch survives**, which is the thing a width fix could quietly break: an
estimate never wears a measurement's clothes. Judge at 1400 / 390 / 320 after
the fix draws **8 hatched fills of 8** on cards of 680 / 328 / 258, and Ohtani
draws **0 hatched of 8** on the same three widths. Solid still means measured.

**The feed caller is byte-identical before and after**, which is what a folded
selector should be: the same Upcoming dialog at 1400 / 390 / 320 measured 800 /
358 / 288 wide, cards 680 / 328 / 258, tracks 434 / 143 / 73, 8 / 8 painted, row
34px, overflow 0 — every figure the same on both runs. The two callers now agree
at every width, which they always claimed to.

**Bundle: CSS 158,320 → 158,344 raw (28,282 → 28,286 gzipped), JS 600,229 raw
and 176,931 gzipped, unchanged.** 24 bytes of stylesheet, 4 over the wire, for a
selector; the rest of the diff is the comment above the rule saying why it has
two.
