### Where the control set lives

*(One-line update: the board's bar is portalled into **`.view-tools`**, a band
directly under the app's main tabs, rather than into the tab row itself — the
tabs became a full-width underlined strip and everything that says which
*reading* of a page you are on moved down one row together. See **Client**, *The
tabs are the width of the window*. `.research-chrome` and `.research-bar` are
still `display: contents` for the same reason and the same wrap rule applies, so
every measurement below holds; passages saying "the tab row" mean that band.
What did change: the band is in the page rather than in the pinned box, so it
scrolls away with the board — and on this view it has since moved once more,
into the board's own scroller, which is what makes "scrolls away" true rather
than merely intended. See **The page scrolls, and the head stays**, below.)*

### The bar is three rows that scroll, and it condenses when the head sticks

*(This supersedes the shape both sections below describe: one wrapping row of
five groups. What they say about where the band is drawn and what sticks is
unchanged. **And the line it sticks at has since moved up to the third row** —
everything below about the rail, the sentinel and the measured `--research-cond-h`
holds, but the offsets it quotes are the old ones. See* **The bar stops at its
third row**, *directly after this section.)*

**Three runs, in the order the questions come in** — *which players* (Watchlist,
Free Agents, My Roster, Other Rosters), *which slice* (span, position, Teams),
*what to do with the board* (Search, Filters, Schedule, Columns, Ranks). Each is
a `ScrollRow`: too wide for the window and it gives up its end to an arrow
rather than wrapping onto a line the table pays for. Left-aligned, not centered
— `.tool-scroll-inner`'s auto margin is right for the app's one-group band over
a centered date bar and wrong for three stacked runs, whose left edges otherwise
stepped in and out against each other and against the count.

**Watchlist leads and the sets run widest-first.** `INCLUDE_ORDER` is a reading
order distinct from `RESEARCH_INCLUDE_KEYS`, which stays the state's own list —
what exists, what a URL round-trips, what `allDefault` walks. Reordering that to
suit a row would move the vocabulary to suit the furniture.

**Every button keeps its word at every width, and its mark beside it.** Six
classes were visually hidden below 640px and the include buttons went further,
swapping a full label for an abbreviation at 640 and a two-letter code at 480.
All of it is gone: a row that scrolls has no line to buy back, and a `title` is
a tooltip no touch device fires. The mark now leads the label at every width
(`order: -1`), which is what the rest of the bar already did. **Free Agents got
a real one** — a padlock swung open, since the closed one already means "somebody
else has him", where it used to be the letters `FA` and `FA Free Agents` is a
label saying itself twice.

**The two dropdowns stay.** Span and position still become `<select>`s below
640px, and they are the one width swap that survived. The other four were
*buttons*, whose label is their name; these two are a four-pill run and an
eleven-pill run, and eleven pills behind a horizontal scroll is a control you
have to drag through to find `SS`.

**The badges are the filters and nothing else.** The row used to carry one badge
per setting on the argument that a control set scrolled off the top leaves
`of 622` meaning nothing. That was right about the problem and wrong about the
answer — it restated the controls in a row you cannot act on. The condensed run
is the answer instead: every one of those settings is a *lit button*, on screen
and pressable at every offset. What is left is the one setting with no button to
be lit, a stat threshold living inside the Filters panel. One row, and it
scrolls rather than wrapping; no arrows, because these are labels and an arrow
is a control.

**When the head sticks, it carries the whole control set again, condensed.** One
run instead of three, marks instead of words — and the list of labels it hides
is by *name* rather than by one shared class, because Schedule is
`ScheduleControl`'s button, shared with the Roster view, and carries that view's
`.schedule-toggle-label` rather than the board's. It was the one word left
standing in a run of marks — the shape the bar used to take on
a phone at rest, kept for the one case that argument was always right about. The
elements are the same consts the bar renders (`rowWho`, `rowSlice`, `rowTools`),
from the same props and calling the same callbacks, so the two copies cannot
disagree.

**The run rides a zero-height rail, and that is the whole of why the scroll is
smooth.** It was a child of `.research-head`, which grew that box by 52px on the
stick — and a sticky box keeps its place in flow, so every row below moved under
the finger. That was answered by putting the difference onto `scrollTop` from a
`ResizeObserver`, which held the rows still on a desktop and **stopped the
scroll dead on a phone**: assigning `scrollTop` during a touch or momentum
scroll cancels it on iOS. Reported from a phone as the board halting under the
thumb at the exact moment the head stuck.

So `.research-condensed-rail` is `position: sticky; top: 0; height: 0`, and the
box with the height in it is its child. Nothing in flow resizes, so the run can
appear and vanish mid-fling without moving a row, and there is nothing left to
compensate — the `ResizeObserver` and `overflow-anchor: none` are both gone with
the writes they existed for.

Sticky rather than `position: fixed` so it needs no arithmetic about where the
pane begins: the expanded box and the ordinary pane are the same coordinate
system to it. **And it is folded onto the pane's `left: 0` list, not given a
`top` alone** — this pane scrolls sideways as well as down, and the first
version pinned only the top, so the run rode off the left edge with the columns
while the table moved under it. Measured after, stuck at 390 with the pane
scrolled 300 and 900 to the right: the run's box stays at `left: 0` and 390
wide, the same answer the head and the count give. The two boxes held under it take measured offsets —
`.research-head` sticks at `var(--research-cond-h, 0px)` and the header row at
`calc(var(--research-cond-h, 0px) + var(--research-head-h, 0px))` — and that
token is `0px` whenever the rail is not drawn, so both are `top: 0` at rest by
construction rather than by a second rule.

**The sentinel is pinned sideways too, and for a subtler reason than the rail.**
`IntersectionObserver` tests *both axes*. A 1px block 390px wide in a pane whose
content is thousands leaves the root's box when the reader scrolls the columns —
indistinguishable, to the observer, from having scrolled *down* — so the
condensed run appeared at the top of an unscrolled board the moment the columns
moved. Reported exactly so. It takes `left: 0` from the pane's fold and
deliberately **no `top`**: pinned horizontally it never leaves that way, and
with no `top` it still scrolls away vertically, which leaves the observer the
one question it was ever asked. (A huge horizontal `rootMargin` answers the same
way and is the version with a magic number in it.)

Measured at 390 with the board at rest and the pane scrolled 200, 600 and 1200
to the right: no rail, three rows, at every one. Scrolled down: rail. Scrolled
down *and* across: rail still there. Back to the top with the pane still 800
across: rail gone. The sentinel's own box reads `left: 0` throughout.

**Measured at 390 and 1200, crossing in both directions:** `scrollTop` is never
rewritten (set 162 → 162, set 154 → 154), the head is **37px in both states**,
and the first row moves only the 8px the reader scrolled — 192 → 184 up, 184 →
192 back, the same figures returning on the round trip. Stuck at 390 the rail's
inner box is 52px at y=100, the head 37 at y=152 and the header row at 189: the
seam between run and head measures **0.00px**. At rest `--research-cond-h` is
`0px`, the head's `top` computes to `0px` and no rail is in the DOM.

**Expanded, the run is drawn from the first frame** rather than on a scroll.
That box covers the app's chrome, so the three-row bar there is not merely
scrolled away, it is *unreachable* — the case the badges used to carry alone and
carried badly, and the reason this reading needed the run more than the ordinary
one did. Measured expanded at 390 with no scroll at all: inner 52 at y=11, head
at 63, header row at 100.

**And expanded, the rail takes its height back** — `height: auto`, the one thing
this mode overrides on it. The zero exists so the run can appear and vanish
*mid-scroll* without moving a row; expanded it does neither, being drawn from
the first frame and staying for as long as the box is open, so nothing is bought
and the cost is paid. Out in the ordinary pane the run only ever arrives once
the whole control set has scrolled away above it, so its 52px paint over 52px of
nothing. Expanded at rest there is no scrolled-away content under it: those 52px
paint over the table, the head slides its own sticky 52 down on top of the first
rows, and the header row sticks 83 into a pane that has reserved 31. **Reported
as the full-page board cutting off its first row**, which it was — measured at
1200, expanded, at rest, the first row sat at 93 with the header cells painting
**94 → 145** over it, leaving a 6px sliver of a player nobody could read.

With the height back the run sits at **11 → 63**, the head at **63 → 94** (its
sticky `top` of 52 is now its flow position, so it no longer moves at all) and
the header row at **94 → 145**, with the first row starting at 145 and clear.
Identical at 390 / 1200 / 1920, on the batting and pitching boards, on `Teams`
and in the Schedule reading, with page-body overflow 0 at every one; scrolled
400 down and 900 across, the three bands hold at exactly those figures, and the
ordinary pane is untouched (no rail at rest, inner at the pane's own top once
stuck). Nothing else needed a number: the head and the header row already take
their offsets from `--research-cond-h`, which is measured off the inner box
either way. Bundle: CSS **163,242 → 163,306** raw and **29,367 → 29,379**
gzipped, JS byte-identical.

**A second source of chop went with it.** `useOverflowArrows` ran `measure()`
and built a fresh `ResizeObserver` in one effect with no dependency list, so
every render tore one down and made another — cheap once, and not cheap on a
board that draws four of these rows and re-renders on its own scroll. The
measuring keeps its bare effect (the *content* can change without the box doing
so); the observer got a stable one of its own.

Two things had to be measured rather than assumed while the compensation
existed, and both are kept because they are the record of why it is gone:

- **Chrome compensates already.** Scroll anchoring adjusts `scrollTop` when a box
  above the viewport resizes, so the explicit compensation landed on top of the
  browser's: measured at 390 crossing the threshold, `scrollTop` went 160 → 265
  where the head grew 42, and the first row moved 190 → 165. `.research-scroll`
  takes `overflow-anchor: none`. Turning the browser's off rather than dropping
  ours is the choice, because scroll anchoring is Chrome's and not Safari's —
  relying on it would hold the rows still on a desktop and jump on the phone.
- **A delta across the `stuck` flip is not enough.** The head does not reach its
  new height in one commit — the run renders, then `ScrollRow` measures its own
  overflow and renders again — so a before/after pair caught part of it and left
  21px as a jump (`scrollTop` 160 → 223, first row 190 → 165). Observing the box
  answers every change whatever caused it, which is also the honest rule: a
  filter badge landing while the reader is scrolled must not shift the rows.

**Measured after, at 390 and 1200, in both directions.** The head is **37px at
rest and 79 stuck**. Crossing up: `scrollTop` 154 → 162 becomes 154 → 204,
exactly the 42px the head grew, and the first row moves **192 → 184** — the 8px
the reader asked for and nothing else. Crossing back down: 162 → 154 becomes
162 → 112, and the row moves 226 → 234. Page-body overflow **0** throughout, the
three rows 36px each, the chrome 146px at 390 and 142 at 1200.

### The control set does not scroll the board

**A sideways gesture that landed on this row moved the table under it**,
reported exactly so. The row is a sticky child of `.research-scroll`, the pane
the table scrolls in — pinned at `left: 0`, so it never moves — but it is *in*
that pane, and the pane is the nearest scrollable ancestor of every pixel of it
that is not inside one of the three runs. So a two-finger swipe or a thumb
landing on the row's own 22px side padding, or in the 10px between two runs,
scrolled the columns: the control set stood still and the board slid, which
reads as dragging something that isn't there.

**The runs were never the fault and are the proof of what the fix has to be.**
`.tool-scroll-box` is `overflow-x: auto` with `overscroll-behavior-x: none`, so
it is a scroll container and a gesture landing in one is spent there *whether or
not it has anywhere to go* — which is why the middle run, which does not overflow
at 390, swallowed the swipe as completely as the two that do. Measured at 1200
with a 200px horizontal wheel, `.research-scroll.scrollLeft` after: **200 on the
row's left padding, 200 on the strip above the runs, 0 inside a run**. The row
takes the same pair and becomes the scroll container it was already behaving like
the inside of. After: **0, 0, 0**, at 1200 and 390 alike.

**`overscroll-behavior-x` alone would do nothing**, which is the trap: the row
is not a scroll container, so there is no chaining to prevent — the pane is
simply the box that scrolls. `overflow: hidden` is what interposes one.

**The block axis is left to chain**, deliberately: the row has no scrollable
overflow of its own, so a vertical wheel over it passes to the pane exactly as
before. Measured: `scrollTop` **300 either way**, with the condensed run
appearing at the stick and absent at the top — the sentinel sits in the gap above
`.research-stick-line`, *inside* the row's padding box, so it is not clipped and
goes on reporting. That was the one thing that had to be checked rather than
assumed, `IntersectionObserver` reading through clipping ancestors.

**And it is this pane's row alone, not the fold the neighboring selectors
make.** The Roster's tools row and the League Rankings' each open a *projection
key* out of their own box — four paragraphs hanging below the row — and a row
that clips would clip it. Nothing in the board's control set leaves the row: its
two dialogs are `Modal`s in a portal, and `Search` and `Filters` open rows
*inside* the bar. Checked by clicking all **26** controls in the row and looking
for a descendant outside its rect — **none**.

### The head does not scroll the board either

*(This is the section above, applied to the two boxes it left standing. Every
word of the mechanism is unchanged; what is new is the measurement that says the
row was one of three.)*

**Reported a second time, and about the other end of the pane**: *still able to
scroll the research table horizontally with a finger in the top section with the
filters — specifically the count of players and the middle filter row that
doesn't scroll itself.* Both of those are **`.research-head`**, and it is the
same box the tools row is for the same reason — a sticky child of the pane,
pinned at `left: 0`, whose own side padding and whose non-scrolling children have
the pane as their nearest scrollable ancestor. The third is the condensed run's
box while the head is stuck.

Measured at 390 with the same 200px horizontal wheel, `.research-scroll.
scrollLeft` after, **before**: 200 on the head's 22px side padding, 200 on
`.research-count`, 200 on the condensed run's own padding — against **0** inside
the tools row, which had already been answered a section ago. **After: 0, 0,
0**, at 390 and 1200 alike, with `scrollTop` still moving **300 either way** over
every one of them, the block axis being left to chain exactly as the row's is.

**The chips row was never the fault**, and it is the same proof the three button
runs were: `.research-chips` is `overflow-x: auto` with
`overscroll-behavior-x: none`, so a gesture landing in it is spent there whether
or not it has anywhere to go. Measured at 390 with six filters built (`scrollWidth`
575 against a 346 client): the chips row's own `scrollLeft` goes to 200 and the
pane's stays at 0.

**The head can take the rule because nothing in it leaves it**, which is the one
thing here that had to be measured rather than assumed — the head is where
`Search`, `Filters` and the turn-day strip *open*. Walked every descendant's rect
against the head's own in four states: at rest (31px tall), with Search open
(73), with Filters open (117) and with a chip built (150). **No descendant
outside the box in any of them**, and `scrollWidth === clientWidth` and
`scrollHeight === clientHeight` throughout. The two `<select>`s in the Filters
panel open a list the platform draws outside the document, which no `overflow`
reaches.

**The rail is not the box that takes it — its inner is.**
`.research-condensed-rail` is `height: 0` on purpose (see *The run rides a
zero-height rail*), so `overflow: hidden` there would clip the whole condensed
run out of existence rather than interposing a scroll container. The box with the
height in it is `.research-condensed-inner`, and it is safe for the reason the
head is: its one child is the run, **346px wide inside 390** at every offset, its
two arrows at x=22 and x=324, with the run's own overflow already clipped by
`.tool-scroll-box` one level in. Checked after: the condensed run still scrolls
itself (`tool-scroll-box.scrollLeft` 200 on a wheel over it) and both arrows are
still drawn.

So the fold is three selectors and one pair of declarations —
`.research-scroll > .view-tools`, `.research-scroll > .research-head` and
`.research-condensed-inner` — rather than three rules that agree today.

### The bar stops at its third row

*(This moves one line and nothing else: the section above describes the
mechanism, and every word of it still stands. What changed is **where** the
swap happens, and the three numbers that had to follow it.)*

**The bar scrolls away as far as its third row and no further.** The two runs
above it — *which players* and *which slice* — go up behind it and are gone; the
third, the run of tools, stops at the top of the pane and stays there with the
other two rows' buttons drawn onto it as marks.

**What was wrong with sticking at the head.** The mark was a block directly
above `.research-head`, so the run arrived once the whole bar had already left —
50px further down the page than the row it replaces. Its 52px and the head's own
line therefore landed together on rows that nothing had vacated: measured at
1200 crossing the old threshold, the band over the first table row went **31 →
83 in a single frame**, one whole row of the board swallowed while the rows
themselves never moved a pixel. The section above is right that nothing in flow
resizes; what it does not say is that the *painted* band grows by its own whole
height at the instant it appears. Reported as the board jumping when the buttons
came back.

**Read off the third row, the run has somewhere to be.** Three things had to
agree for the swap to cost nothing, and all three come off two tokens rather
than out of the air:

- **`--tools-row-gap` (10px, 12 below 640) and `--tools-band-gap` (14px, 12
  below 640)** are the air `.view-tools` keeps between two stacked runs and
  under itself. They were written out in three places — a `gap`, a
  `padding-block`, a `margin-bottom` — and the condensed run guessed at them
  with a `10px … 6px` of its own.
- **The mark sits one gap above the third row**, and it is `bottom:
  calc(100% + var(--tools-row-gap))` off that row rather than a negative `top`:
  an `IntersectionObserver` lets go when the mark's *lower* edge passes the
  pane, so anchoring the upper one puts the swap a pixel early — the run's
  buttons landing at 10 over a row that had reached 9.
- **The run's own padding is that same pair**, top and bottom. The top makes its
  buttons land on the buttons already there; the bottom makes its height the
  distance from the mark to the head, so `--research-cond-h` — which the head
  and, through `--pane-bar-h`, the header row are both held at — is where the
  head already was.

Measured at 1200, the frame before the swap and the frame after (`scrollTop` 96
and 97): the button band **10 → 46 both times**, the head **60 → 91 both
times**, the header row **91 → 142 both times**, and the first table row moving
the one pixel the reader scrolled. At 390 the same pair at 96 and 97 with the
band at **12 → 48** either side, the tokens being 12 there. Nothing moves.

**The rail is drawn ahead of the control set now**, first in the pane, and that
is what lets it reach the third row at all: `position: sticky` can only hold a
box *back* from where its flow would take it, and drawn after the bar its flow
line is the head's — measured at 1200, `scrollTop` 100, the run sat at 56 across
a head pinned at 60, the two overlapping. Ahead of the bar its flow line is the
top of the pane, so `top: 0` holds from the first frame it exists in, which is
the frame the third row reaches that line. It costs the bar nothing to sit above
it, the rail having no height.

**And that move cost it a layer.** Two sticky boxes at `z-index: 5` resolve by
document order, so ahead of `.view-tools` the run was painted straight over by
the bar it replaces — the third row showing through, unchanged, at every offset.
It takes **6**. The rule that carries it had to be renamed to `.research-scroll >
.research-condensed-rail`: the fold list up the file sets the layer two classes
deep, so the bare `.research-condensed-rail { z-index: 5 }` that sat here was a
declaration that lost to it and agreed with it, and the first attempt at 6
changed nothing at all — computed style still read 5.

**The tools lead the condensed run now**, where the bar reads who → slice →
tools. The run is drawn in the third row's own place, so the controls that
*were* standing there are the ones that must not move; led by the include marks
instead, the five tools started **741px along a 1,156px line** at 1200 and
Filters, Schedule, Columns and Ranks all went behind the scroll arrow at the
exact frame the row they live on stopped moving. Reading order belongs to a bar
you read top to bottom. This is one line replacing one row, and on a phone it is
the difference between the five tools being the first thing on it and their
being the last.

What did *not* change: the run is still marks rather than words, for the
argument the section above makes; the rail is still `height: 0` in the ordinary
pane and `height: auto` expanded; the sentinel is still an
`IntersectionObserver` against the pane rather than a scroll listener; and the
head and the header row are still held at measured heights and were told none of
this. Expanded, the run is **1 → 61**, the head 61 → 92, the header row 92 →
143 and the first row starts at 143, clear — the figures in the section above,
plus the 8px the run's own air grew by.

**The phone block at the end of the stylesheet sets the two tokens instead of
the two values**, which is what makes the run agree with the bar below 640px as
well. It used to restate `.view-tools`'s `gap` and its scoped `margin-bottom` at
`--stack-gap`; the run, being outside `.view-tools`, could not see either and
kept the desktop's 10 and 14 against a bar on 12 — the head moving 58 → 60 at
the stick, measured at 390. Moved onto `:root`, the numbers reach both.  It also
takes the specificity trap out rather than walking around it: that block's own
comment records `:not(:has(+ .date-bar))` having to be restated *because the
value was*, and with the value gone there is one rule for that margin again.

Bundle: CSS **165,439 → 165,630** raw and **29,657 → 29,710** gzipped — the
comments, near enough; JS **625,942 → 626,005** raw and **184,370 → 184,393**
gzipped.

### And then the badge row was the chips row, twice

*(This supersedes **The badges are the filters and nothing else**, above, and
finishes the argument that paragraph starts.)*

**The badge row lost its last reason when the chips moved into the head.** Its
whole remaining claim was that a stat threshold is *the one setting with no
button of its own to be lit* — every other one is a lit control in the condensed
run, on screen and pressable at any offset, which is what let the row come down
to the filters alone. The section above moved the chips row into the head for
its own reasons, and the chips are that button: the same sentence, in the same
words, off the same `filters` array, with a press attached.

So the head printed every filter twice. Measured at 390 with three built,
`HR ≥ 10 · RBI ≥ 40 · SB ≥ 5` appeared as chips at **y=350** and again as badges
at **y=383**, 33px apart, and the badge row cost the head **25px** (plus the
column's 6px gap) at every width to restate a control one line above it.
Reported as the filter badges being displayed twice, which is what they were.

**Of two rows saying one thing, the one that keeps is the one you can act on.**
The badge row is gone with `.research-badge` and `.research-badges`. What it
leaves behind is its one measurement, which the chips row takes over.

**The chips row scrolls now, where it wrapped.** That was the badge row's own
rule and the reason it was a scroller — *wrapping cost the table a second line
and then a third as the filters mounted up, on the one view where a line of
chrome is a row of the table* — and it applies harder here: the chips used to
wrap inside the control set, which scrolls away, and they are in the sticky head
now, so what they cost they cost at every offset. Measured at 390 with six
filters built, they wrapped to **three lines, 93px**.

- **`flex: none` on the children, and leaving it out is worse than wrapping.** A
  flex item's default is `flex-shrink: 1`, so the moment the run is wider than
  the row the chips are squeezed *below their content* and the labels wrap
  inside them: measured, every chip **57px tall** with `HR ≥ 10 ×` broken over
  three lines in a 53px box — a taller row than the wrapping run it replaced.
  This is the trap `.research-toggle svg` already records one argument along.
  Written on the children rather than on each class, `Clear all` being exactly
  as unsqueezable as the chips beside it.
- **No arrows, unlike the three button runs in the bar**, and *not* for the
  badge row's reason — these are controls, so "an arrow is a control" does not
  carry. It is that nothing here is undiscoverable: the reader built every chip
  in this row a moment ago, from the panel directly above it, where the bar's
  runs are a fixed vocabulary somebody has to be able to find the end of.
  `Clear all` is the last item and one flick away — driven at 390 with six
  filters, the row is 659px of content in 346, and a flick to the end puts
  `Clear all` at x=299 with `elementFromPoint` returning
  `BUTTON.research-clear`. The pane behind it does not move (`scrollLeft` 0),
  the row's `overscroll-behavior-x: none` being the app's standing rule.

**What the table gets back.** Head height and the column headings' resting
`top`, before → after:

| | 390 | 1200 |
| --- | --- | --- |
| no filters | 37 → **31** (th 295 → 289) | 37 → **31** (th 295 → 289) |
| 3 filters, panel open | 181 → **150** (th 439 → 408) | 137 → **106** (th 395 → 364) |
| 6 filters, panel open | 247 → **150** (th 505 → 408) | 137 → **106** (th 395 → 364) |
| 6 filters, panel shut | 161 → **64** (th 419 → 322) | 95 → **64** (th 353 → 322) |

**97px on a phone with six filters built** — nearly two rows of the board, held
back at every scroll offset, and the same 64px head whether the reader is at the
top or at row 400. Nothing had to be told any of it: `--research-head-h` is
measured, so the headings and the sort's scroll target followed the box.
Page-body horizontal overflow **0** at every reading.

### A panel opens where its button is

**Search and Filters answer with a panel, and the panel was drawn in the box
that scrolls away.** Every other control in the condensed run answers with a
*state* — a lit button, a changed board — which is why the run worked at all;
these two answer with a row of controls, and that row was a child of
`.research-chrome`, three rows above the top of the pane. Pressing Filters at
row 400 lit the button, set `aria-expanded="true"`, and opened the builder
**734px above the top of the pane** — measured at 390 with the board scrolled
900, the panel's box at `y = -734`. Reported as the filters and the search not
being usable once the top section has stuck, which is exactly what it was.

**They are rows of `.research-head` now**, above the badges, and the chips row
with them. That box is the only one on this board that is drawn at every offset
*and* sticks, so it is the only place a control's answer can be and still be
there when the control is. At rest it changes nothing about the reading order —
under the bar it is still panel, chips, badges, count — and once the head is
stuck it puts the panel directly under the condensed run, beneath the button
that opened it.

**One copy, not one per state.** Drawing a second set inside the rail and
choosing on `stuck` is the version that keeps the panel out of flow entirely,
and it remounts the search field on the scroll that crosses the threshold: an
`autoFocus` firing, and on a phone a keyboard opening, mid-fling. The head is
the box both states already share.

**Nothing had to be told the height**, which is the measured-height rule paying
for itself a second time. `--research-head-h` is measured off the head, so an
opened panel moves the column headings and the sort's scroll target with it:
measured at 390, opening Filters takes the head **37 → 123** and the headings'
`top` **295 → 381** at rest, **189 → 275** stuck. At 1200: head 37 → 79,
headings 191 → 233. The panel's own box is at `x: 22` with the pane scrolled
`scrollLeft: 1200`, the head's `left: 0` fold carrying it.

**The rows do not move under the press, on Chrome, and move honestly without
it.** The head grows above the viewport when stuck, so scroll anchoring adds
the difference: `scrollTop` 900 → 986 for an 80px panel plus its gap, and the
rows hold. Where anchoring is not on offer the rows move down by exactly what
the head grew and the head's own bottom edge moves with them, so the row against
that edge stays against it — an accordion opening. It is not the forbidden
"control that changes size under the finger that pressed it": the finger is on
the condensed run, which rides a zero-height rail and does not move at all.

**Driven, not compiled.** Stuck at 390 and 1200 and in the expanded box: the
builder opens fully in view, `elementFromPoint` at the Add button's center
returns `BUTTON.research-add`, and a filter added from the stuck run takes the
count **468 of 468 → 1 of 468**, raises the chip in the head and the badge
beside it, and the chip's `×` — also in the head now — puts it back. Expanded,
where the three-row bar is not merely scrolled away but unreachable, the run is
at `y: 11` and the panel at `y: 69`.

**At rest it costs nothing and gives 4-6px back.** The panel was a flex item of
`.view-tools` at that row's 10/12px gap and is a row of the head's 6px column
now. Before → after, panel open: headings **343 → 337** at 390 with Search,
**387 → 381** with Filters, **341 → 337** at 1200. Page-body horizontal overflow
**0** at every reading.

### Watchlists, saved searches, and the panel that would not paint

**Two controls, and they are two configurations of one component**
(`ResearchLists.tsx`). A watchlist is a saved set of players and a search is a
saved reading of the board; the rows, the inline rename, the share panel and the
armed delete are written once and used twice, because everything *around* the
two payloads is identical.

**Where each sits follows from what it is.** The Lists button is welded to the
Watchlist toggle in the *which players* run, a watchlist being a set of players.
The Searches button reads **last** in the *tools* run, after everything a saved
search is made of: Search, Filters and Watchlist decide who is in the table,
Schedule decides what the table is about them, Columns and Ranks decide how it is
drawn — and a saved search is all of them at once, under a name.

**A split button, not one button doing two things.** The toggle's job has not
changed; what is new is that "the watchlist" names one of several, so the caret
beside it is where that is said. Pressing a button that both toggles a set *and*
opens a panel is a control the reader cannot aim: the two answers are different
sizes and the wrong one is a pixel away. The two share an outline (the toggle
gives up its right radius and its right border) so they read as one thing.

**And the toggle now names the list.** With one list `Watchlist` said
everything; with several it says which of them only by not saying. The default
list is *called* `Watchlist`, so a reader who never makes a second one sees
exactly the button they always did, and a rename moves the label with it. A
shared list showing over the top takes the label too, because that is the list
on the board.

**The panels are rows of `.research-head`, and the first attempt was a popover
hanging off each button.** That does not work here and the failure is worth
recording, because it looks like nothing: `.tool-scroll-box` scrolls
horizontally, so it clips on **both** axes, and an absolutely-positioned child
of it is simply not painted. Measured, the popover reported a perfectly ordinary
**268×322 box at `x: 140, y: 160`** — a rect is computed whether or not an
ancestor clips it — and `elementFromPoint` at its centre returned the table
behind. And even unclipped it would have had the fault this file already records
for Search and Filters: the bar scrolls away and the condensed run replaces it,
so a panel anchored to the bar opens hundreds of pixels above the top of the
pane. So they go where every panel on this board goes. After the move, the same
measurement: **380×189 at `x: 22, y: 264`**, `elementFromPoint` inside it.

Joining `ResearchUi.panels` buys the rest for free — the open state is part of
where you were, and `setPanel`'s exclusivity means opening Lists closes Filters
exactly as opening Filters closes Search. The panel's own state (a rename in
progress, a half-pressed delete) needs no reset effect either: it is unmounted
when the panel shuts, so a panel re-opened cannot come back mid-gesture.

**Pressing a row does different things in the two panels, and the asymmetry is
the point.** A list is a **setting**: the row lights, the button above renames
itself, the panel stays open so the reader can go on to rename or share it. A
search is an **action**: its result is the board underneath, so applying closes
the panel — leaving it open would hide the very thing the press did.
`Update one to this board` is a second action rather than the same press,
because saving over a search is the one gesture here that destroys something,
and a control that reads or writes depending on where in the row you press it is
the control this app's roster ✕ was rewritten to stop being. The delete **arms
rather than asks**, the same gesture and the same red (`--strikeout`) that ✕
already uses.

**Applying a search replaces the reader's work, where `openSpotlightBoard`
deliberately does not.** That door leaves a search, a filter and a day set
alone, because it is a *door* — it opens the board at a place. A saved search
*is* somebody's reading, named; applying it while keeping yesterday's four
filters would produce a board that is neither. What it does not do is **write to
the record**: the include set and the Watchlist button are set locally with
their touched refs raised, exactly as that door sets the include set, so opening
somebody's link cannot quietly become your saved default.

**What a saved search remembers** is eleven fields (`ResearchSearchBoard`), and
the test each had to pass is *would a reader who saved this be surprised to find
it different*: position, span, ownership sets, watchlist on or off, clubs or
players, measured or projected, columns, sort key, sort direction, filters,
name search. What it deliberately does **not** remember is anything that is not
a reading — the paging, which panels were open, the half-typed condition in the
filter builder. Those are where the reader had got to, not what they were
looking at.

### A shared list or search says so, and touches nothing of yours

`wl=` and `rs=` are the two params, separate keys for the app's own reason that
two params must never mean two things: one is a set of players and the other is
a reading of the board, and a link is read before anything on screen can say
which. **Nothing of the reader's is touched to get there** — a shared thing
lives in App state and in the URL, in no preference and on no record — which is
what makes "opening somebody's link must not disturb your own" a property of the
design rather than something to remember.

**The board's watchlist union and the row's star come apart here, and only
here.** The union and the count are about the list *on screen*; the star is
about the list you *own*. So the board takes two sets (`watchlistKeys` and
`ownWatchlistKeys`) and marking a stranger's players starred while the press
writes to your own list is the thing that does not happen.

**The notice's two wordings are different tenses, and the difference is
honest.** A shared **watchlist** is live — its keys are on the board right now,
and re-sorting does not stop that being true — so it reads *Showing*. A shared
**search** is a reading that was *applied*; the board is now the reader's own to
change, and a banner claiming they are "using" it would go on claiming so after
they had re-filtered it into something else. So it reads *Opened from*, which
stays true. Both offer the same two ways out: keep it (a **copy**, which stops
tracking the owner's) or be rid of it.

**It sits between the controls and the table**, because that is where the fact
belongs: the board below looks entirely ordinary, and without this there is
nothing to say the rows came out of a link. It needed `flex: 1 1 100%` to claim
a line — `.research-chrome` is `display: contents`, so it is an item of
`.view-tools`'s own flex row, and left to size itself it landed in whatever the
third run had left over: **a 600px box starting half-way across a 1200px window
with `Save as my own` clipped off its right edge**. Fixed, it measures
**1156px at `x: 22`** with both buttons inside.

**Driven, not compiled.** The whole round trip, twice — as the owner and, with
the server restarted under a second `DEV_USER_ID`, as a genuine stranger:

- A search saved off `pos=SP&win=30&inc=mine,fa` and shared; the link opened
  cold carries **only** `rs=<code>`, and the board comes up at 30d, SP, both
  ownership sets lit, **201 of 415 pitchers**, with the pitcher column set — none
  of which was in the link.
- A shared list opened by a stranger: the toggle reads `Closers 2` and is on,
  the notice reads *Showing a shared watchlist · Closers — nothing of yours has
  changed*, and **no row is starred**, their own list being empty.
- `Save as my own` copies it, makes it active, and the notice goes; the star
  then writes to it (`Closers 2 → 3`) and survives a reload.
- `Dismiss` drops both the notice and the param.
- At **390px**: `document.scrollWidth` 390, the notice 346px over two lines with
  both buttons in, the `Lists` word visually hidden (the caret being unambiguous
  beside a button that says Watchlist), and the panel painted and hit-testable at
  346px.

### A row's actions were three 12px glyphs, and that was two faults

The first drawing of these panels put `✎ ⤴ ✕` against each row's right edge,
and it was wrong twice over.

**They were unreadable.** A pencil at 12px against `--faint` is a smudge, and
nothing said what any of the three did until you hovered — which a touch device
never does.

**They were un-pressable.** Measured, the three shared a 22×24px box apiece,
against this app's own icon buttons at **30px** and its chips at **28**.

And a *fourth* action had nowhere to go at all. A saved search can be **updated**
to the board it is looking at, and with the row full that had ended up as a
labeled run of pills at the foot of the panel — the same two names, listed a
second time, under `Update one to this board:`. A panel restating its own list is
what a row with no room looks like.

So a row is **one press and one `⋯`**, and the `⋯` opens a drawer under it
holding **labeled chips** at `.research-order-chip`'s own 28px/12px/700. Nothing
is guessed at, everything is aimable, and the fourth action is just a fourth
chip. Rename and Share take the drawer *over* rather than stacking on it —
three states of one box. Measured after: `.rl-more` **30×30**, chips **28** tall,
the row **34**.

**Nothing here invents a scale.** The heading is `.research-colgroup-head`'s
11px/800/uppercase in `--muted`; a lit chip is the accent at 12% behind a 45%
border, which is what "this control is doing something" already looks like in
this bar; the armed delete is `--strikeout`, the red `.remove-btn.armed`
already uses.

**Three smaller things the survey turned up:**

- **The caret rendered as a dot.** `▾` is a full-height character shrunk to sit
  beside a 12px label, and at the 9px that took it read as `Searches 2 ·`. It is
  a drawn 9×6 path now.
- **`Watchlist · Lists ▾` was two nouns for one thing.** The half beside it
  already names the list, so the second half is a caret alone, with its
  accessible name off the `title`.
- **The active row's tint stopped 30px short of its own right edge**, painted on
  the press rather than on the row — so the `⋯` sat outside the highlight it
  belonged to. It is on `.rl-row-main` now, and the active list is said twice
  (a filled dot *and* the tint), because identity never rests on hue here.
  The dot is reserved on every row so the names line up whichever is lit.
- **The shared bar was a paragraph.** One run of prose with the name bolded
  inside it, which at 390 wrapped into three lines of reading over a table. It
  is three parts in the order they are read now — an uppercase kind, the name,
  the reassurance — and at 1440 it is a single 44px line.

**Bundle**: JS 745.79 → 762.13 kB raw, 219.89 → 224.42 gzipped; CSS 192.67 →
198.16 raw, 34.32 → 35.16 gzipped.

### The page scrolls, and the head stays

*(This supersedes the arrangement the section above describes — the band is no
longer in the page above the board, it is the first child of the board's own
scroller. Everything that section says about the row's shape, its wrap and its
`display: contents` groups still holds; only where it is drawn has moved.)*

**The research view is a viewport-tall flex column in which only
`.research-scroll` scrolls** (`.app.research-mode`, which is `.app.summary-mode`
with a different name on it). A `position: sticky` box sticks to *the box that
scrolls*, so anything left in the page above that pane is not sticky at all —
it simply sits where it was laid out, forever. That is what the control set was
doing: **135px of buttons on a phone that the reader could not scroll away,
whatever they did**, on the one view in the app that is nothing but a table.

So the pane takes the whole page. `ResearchTable` renders, as the scroller's own
children and in this order: the control set, the board's error banner, **the
head**, the empty states, the table, and the paging strip. The control set
scrolls away with the rows; the head stops at the top of the pane and stays
there; the column headings hold directly under the head. Measured at 1200×900,
the chrome above the first row goes **237px → 102px** at rest and **237 → 143**
once the reader has scrolled — the app's own pinned bar, the head, and rows. At
390×844 it goes **283 → 100** and **283 → 172**, which is three more rows of a
phone screen at every offset past the first. *(The scrolled figures are **164**
and **193** since the head became two lines — the badges over the count. The
saving stands; it is 21px smaller than it was. See the bullet on the head's
shape, below.)*

  - **The head is the count and a badge per setting, and it is one box on both
    surfaces now.** The badges were the full-page mode's `.expanded-chrome` row,
    written for exactly this problem one level up — a table with its controls
    behind a fixed box is a table you cannot read, because "of 622" means
    nothing without knowing it is the 30-day window, free agents only, and
    shortstops. A control set that has scrolled off the top is the same
    sentence missing, so the same row answers it, and the full-page mode no
    longer draws one of its own.
    - **One wrapping row, not a badge row under a count line.** The count is the
      first thing the badges qualify — *467 of 467 batters · SS · free agents ·
      last 30 days* is one sentence — and a line each costs the table 31px to
      say nothing more. Measured at 390 with three badges: **41px as one
      wrapping row against 72px as two.**
      - ***Superseded, and the measurement it was decided on turned out to be
        the wrong pair of shapes.*** The head is **two lines now — the badges,
        then the count** (`.research-badges` inside `.research-head`), which is
        the shape that paragraph rejected, arrived at from the other end: the
        count is a fact about the *table*, and the table begins one pixel under
        this box, so the count is the last thing read before the first row and
        the badges are the qualification standing above it. The sentence is
        still one sentence; what the layout had wrong is which half of it the
        rows are about.

        The 31px it was rejected on was **the price of two boxes**, and this is
        one box with a column direction on it: the badge run keeps its own wrap
        and `align-items`, the count is a bare 15px line, and the head's 6/10
        padding is paid once. And because the count was *in* the wrapping run,
        taking it out sometimes takes a whole row of the run with it, so at some
        widths the head comes back **shorter**. Swept at 320 / 375 / 390 / 480 /
        640 / 900 / 1200 / 1920, before → after:

        | width | 320 | 375 | 390 | 480 | 640 | 900 | 1200 | 1920 |
        | --- | --- | --- | --- | --- | --- | --- | --- | --- |
        | player | 103→93 | 72→93 | 72→93 | 72→62 | 41→62 | 41→62 | 41→62 | 41→62 |
        | teams | 72→93 | 72→62 | 72→62 | 41→62 | 41→62 | —→62 | 41→62 | 41→62 |

        The one dash is a cell whose *before* was not captured — the API went
        down mid-sweep and the reading was not retaken. It is left as a dash
        rather than filled in from its neighbors, which both read 41.

        **+21 where the badge run does not change shape, −10 where a row of it
        goes**, against a flat 31 for the two-box version. No horizontal
        overflow of the page body at any of the sixteen readings.

        **Nothing else had to be told**, and that is the measured-height rule
        paying for itself: the column headings' resting `top` went **143 → 164
        at 1200 and 172 → 193 at 390** off `--research-head-h` alone, the sorted
        column's own header held at the same number as the rest of the row
        (it reads `--pane-bar-h`), and the new-signature scroll target stayed at
        **110 and 158** — the table's offset in the content and the head's
        height both grew by 21, and the target is their difference. Checked
        after: a sort from `scrollTop` 2,384 lands at 110 with the table's top
        on the head's bottom edge to the pixel (164), a sort pressed at 0 leaves
        it at 0, and at `scrollLeft` 1,431 the head is still at left 0 with the
        badges and the count both on the 22px gutter.

        The rule the old paragraph invoked against a moving box is untouched and
        is why this is safe: nothing in this head is pressable, so there is no
        control changing size under the finger that pressed it, and the box it
        *does* move — the header row — reads its offset from a measurement
        rather than from a number written down.
    - **Drawn at rest as well as scrolled, and that duplication is the point of
      the rule it obeys.** At the top of the board the badges restate five
      buttons that are two rows above them, which is redundant — and the
      alternative, revealing them once the control set has gone, changes the
      height of a sticky box *while the reader is scrolling under it*: the
      column headings would step down and every row with them, which is
      **reserve the box, don't move the page** at its most literal. The
      duplication costs 31px at rest on a phone and buys a head whose height is
      the same number at every offset.
    - **Its height is measured, not declared** — `--research-head-h`, published
      on the root by `usePublishedHeight` (the hook `--date-bar-h` already
      uses, floored for the reason it records), and read as `--pane-bar-h` on
      `.research-scroll`, which is the token `.summary-table thead th` already
      sticks below. There is no one number to write: on a checked board the
      same head is **41px at 640 and up, 72px at 390 and 103px at 320**, and it
      moves again with the wording — a filter built, a position picked, a
      search string typed. A constant would be a strip of rows showing through
      the gap at every width but the one it was written at.
    - **`.research-table thead th.research-sort.active` had `top: 0` written
      out**, which agreed with the rest of the header row for as long as
      `--pane-bar-h` was 0 on this board. It stopped agreeing the moment the
      head arrived above it: measured at 1200 scrolled 900 down, every other
      header cell held at **143** and the sorted column's at **102**, one
      column of headings floating 41px up in the middle of the head's own band.
      It reads the token now. Two things that stick to the same edge share the
      name of that edge.
  - **Every block child of the pane is `position: sticky; left: 0`**, folded
    onto the rule the summary pane's own two already share. This is the app's
    widest table and a block child of a scroller is only ever as wide as the
    pane, so without it the control set, the head, the banner and the empty
    states all sit off the left of the screen the moment the reader is out at
    Chase%. Measured at 390 scrolled to `scrollLeft` 1,431: the head at left 0,
    390 wide, with the count and every badge in view. The two that are *content*
    rather than band — the error banner and the empty state — put the page's
    gutter back as a margin (`--table-bleed`), the pane having bled out through
    it already: the empty state read 390 wide against the 346 it is in the page.
  - **The board draws its own tools row, and the portal is gone.** The control
    set used to be portalled into a `.research-chrome` box App kept for it,
    which was the only way to reach the app's pinned chrome from this file
    without lifting the board's whole column vocabulary into App. From a pane
    this component renders itself there is nothing to reach across — and the
    portal had begun to cost something real. **A host handed over by a callback
    ref is empty for the commit that creates it and filled by the re-render
    that ref triggers**, so the row was 28px tall for one frame and 110 the
    next. Inside the scroller that 82px of growth is *above the viewport*,
    which the browser's scroll anchoring answers by adding 82 to `scrollTop`,
    which App's per-view restore then reads as the reader having taken the
    scroll and stops placing. Measured: left at 800, back at **882**; left at
    1,500, back at **1,582**. Rendered inline the row is its full height in its
    first commit and there is nothing to compensate for — **back at 800 and
    1,500 on the nose.** (`ColumnPicker`'s own dialog is still portalled to the
    body and is unaffected; the passage below saying it must clear a host that
    is `position: sticky` with a `z-index` is now historical, and the dialog
    still opens at 46 in `.app-dialog`.)
  - **The pane is rendered whatever the board holds**, where the table inside it
    is not. Two reasons, and the second decided it: the pane is where the
    control set lives now, so a pane that came and went with the rows would take
    every button on the board with it — unmounting and remounting them on the
    keystroke that narrows the board to nobody, which is a search field losing
    the caret mid-word — and an empty state reads under the count it explains
    rather than on the far side of a hairline from it.
  - **The reset on a new signature goes to the top of the *table*, and never
    downwards.** It was `scrollTop = 0` for as long as those were the same
    place; with the control set inside the scroller, 0 is the top of the
    *pills*, and a reader who sorted by `HR` from row 400 would have been
    answered with a screenful of buttons and the leaders below them. The target
    is the offset at which the head is exactly where it sticks — the table's own
    offset in the content, less the head's height — measured as **110 at 1200
    and 158 at 390**, with the table's top landing on the head's bottom edge
    (143 and 172, **164 and 193** since the head became two lines) either way.
    The *target* is unchanged at 110 and 158, the table's offset and the head's
    height having both grown by the same 21. `Math.min` against the current
    offset is the other
    half: every control that can change the signature is up in that row, so a
    reader who can *see* the control they just pressed is by definition above
    the target and scrolling to it would take that control off the screen from
    under them. Measured: a sort from `scrollTop` 2,496 lands at 158, and a sort
    pressed at 0 leaves it at **0**.
  - **The chrome closes onto the band, as it does on the Roster's table
    reading.** `.app.research-mode .app-chrome` joins the two rules
    `.app.summary-mode .app-chrome` already carries — no bottom margin and no
    shadow — because what follows the chrome on this view is now the pane, whose
    first child is a band that paints its own ground. Left as they were, the
    14px was a strip of page between two bands and the shadow was a dark wash
    across the top of the second. Measured at every width from 320 to 1920, the
    pane's top and the chrome's bottom are **the same number** (148 / 100 / 102)
    and the pane's own top hairline is dropped
    (`.research-view:not(.is-expanded) > .research-scroll`), the chrome's being
    the one that closes the seam.
  - **Bundle: 600.91 → 601.05 KB of JS** (178.76 → 178.80 gzipped) and **159.36
    → 159.97 KB of CSS** (28.51 → 28.59) — 0.14KB and 0.61KB raw, 0.04KB and
    0.08KB over the wire, for a head, a measured height, a fold and the removal
    of a portal.

### The research board

Split out of `client.md`. The board is the league over a season where the two
roster views are a roster over a range; it needs no roster and is the one tab a
new user can use. What it shares with the summary table — the row geometry, the
identity block, the full-page mode — is in `client-summary.md`, and the passages
below say where they part.

  - **The player name sticks too, from 820px up** — the one place this table deliberately parts from the summary view's rule that only the headshot pins and the name scrolls away for the sake of stat columns on a phone. This table is three times as wide, and by the time you have scrolled out to Chase% or FB% there is nothing left to say whose row you are on. The offset *is* the headshot cell: the photo (global `border-box`, so its border is inside that) between two of this board's gutters, which comes to **68px** at a 42px circle and came to 63 at a 37px one. It is **derived rather than written out** — `calc(var(--row-photo) + 2 * var(--research-gutter))`, off the same variable the cells are padded with — because `63px` was a constant that went silently wrong the moment the circle grew, pinning the name five pixels under the headshot it exists to clear. Those gutters are `clamp(5px, 1.6vw, 13px)` and only reach 13px from ~813px of viewport up, which is the other half of why the breakpoint is 820 and why the calc resolves to a flat 68 everywhere the media query applies — below it the offset would be wrong **and** the pinned pair would eat two fifths of the screen. The soft edge that marks the pinned block moves out to the name (`.research-table .sum-img-col { box-shadow: none }`), since left on the headshot it would draw a seam through the middle of a pair that scrolls as one. All of it is scoped to `.research-table`, so the summary view is untouched.
  - **Every row's headshot carries today's status**, exactly as the summary table's does: the lineup pip on the top corner — a batting-order number, `SP`, a reliever's entry inning, `!` for a postponement or a posted lineup that left him out — and the status code on the bottom edge, `IL10`, `RA`, `DTD`, `OUT`, `DFA`. It matters more here than anywhere else in the app, and that is the argument for it: every other view draws players the user chose, while this one is the whole league and mostly strangers, and the question the board exists to answer is whether to pick somebody up. A man batting second tonight and a man who went on the IL this morning have the same season line, and the line was all the table showed of the difference. The facts come from `usePlayerStatus` — the league-wide `/api/statuses` map, since the board holds no `PlayerReport` for a player nobody is watching — and the marks themselves are `PhotoSpot`/`PhotoStatus` in `PhotoStatus.tsx`, shared with the summary table and the details view so the three cannot come to read differently. `statusCorner` in `lib.ts` is `lineupCorner`/`pitchingCorner` over the same five fields named apart from the game they usually arrive on (`CornerFacts`), which is what keeps one definition of what "batting 3rd" and "SP" look like rather than a second, drifting copy for the views with no report behind them. `useStatusBadge` holds the other shared rule — **MLB's status leads and ESPN's fills only the gap it leaves** (`rosterStatusBadge(...) ?? espnInjuryBadge(...)`), so day-to-day and out, which MLB has no code for, reach the board for anyone on a roster in the connected league. Absent until that one request lands, and absent afterwards for a player with nothing to say, which is most of them.
  - **Sorting** is a click on any header (`aria-sort` + a ▲▼ that is reserved in **both axes** whether or not the column is the sorted one, so clicking a header moves nothing — see the paragraph under this list, which is the same lesson twice over). A column declares which way it *opens* — `ascFirst`, set on the stats whose good end is the small one (ERA, WHIP, BB/9, a batter's K, and every Statcast column on the pitcher board, where a low xwOBA-against is the achievement). **Nulls sort to the bottom in both directions**: a blank is not a good score or a bad one, and floating them would bury the leaders. The board opens on **Ros% descending when a fantasy league is connected** — it is the first column there and the one a fantasy manager reads the league *by*, so the most widely rostered lead — and on PA (batters) / IP (pitchers) descending otherwise, which lands on names worth reading rather than the alphabet. `defaultSortKey` is computed at render rather than stored, for the reason the filter builder's default column is: `hasRosterPct` is false on the first render and anything seeded at mount would keep the answer from before the league arrived. It also requires the column to be **visible**, not merely present — hiding Ros% must not leave the board ordered by it, which is the same trap the fall-back exists for. **IP sorts on an out count, not its own string** — 6.2 is two thirds past six, so `ResearchRow.outs` rides along beside `inningsPitched` purely to order it.
  - **The sort mark's box is reserved in both axes, and the second one had been left to luck.** The width half is old and is stated above: the ▲▼ span holds 8px whether or not its column is the sorted one, so clicking a header does not shove every column right of it along. The height half was never reserved at all — the span is a **text glyph in a box sized by its own content**, 0px tall unsorted and its own line box tall sorted, so the header button's height is `20px of padding + max(label, arrow)` and *both* of its dimensions were a function of which installed face claims U+25B2 rather than of anything the stylesheet says.

    **What that costs is measured rather than argued.** The same span was rendered into the faces the glyph can plausibly fall back to at its own 9px: **7.08 × 11px** in the app's own stack, 7.42 × 9 in Apple Symbols, **9 × 14 in Hiragino Sans**, 8.92 × 10 in the default serif. So `min-width: 8px` is a floor a glyph can walk over — forced into the CJK face at 12px on the live board at 1200, the sorted column went **72.36 → 76.73px** wide and the header beside it moved **4.37px** right, and a 14px serif arrow took it to 78.58 and 6.21px — and the height was open at both ends: the sorted button went **35.00 → 38.00px** with its top at **207** while its unsorted neighbor stayed at **208.5**, which is the report exactly, a header's text stepping up a pixel or two on the one column that was just clicked. On the app's own face today the label's 15px line wins and nothing moves (measured: button 35.00 and every button's top 208.5 in both states, at 390 / 1200 / 1920). That is **four pixels of accidental slack in a box whose contents we do not choose**, which is not a rule, and it is the same shape of near-miss the width reservation was written for.

    So the box is **fixed rather than floored, in both axes**: `--research-head-line` (15px, the 12px/800 header's own `normal` line box, declared on `.research-table` because two rules read it), `line-height` on the sort button so the *label*'s line box stops being a font metric too, and `width`/`height` on `.research-arrow` with overflow left visible — a glyph too big for its box then paints outside it instead of pushing, which costs the table not one pixel and clips nothing. **The width stays exactly the 8px the board has been measured at**, so no column moves. One ordering trap: the `line-height` has to come **after `font: inherit`** in that rule, which is a shorthand and resets it — written above it the declaration computes back to `normal` and does nothing, which is what the button's computed style said the first time round.

    **Re-measured after, on the live board.** The four fallback probes — Hiragino at 12px, serif at 14px, and the label's own face swapped — leave the sorted button at **35.00px with its top at 208.5 and its neighbor's at 208.5**, the column at 72.36 and the table at 2103.19, where before they read 38/207, 76.73 and 2107.56. The glyph's *painted* box is byte-identical either side of the change (7.52 × 11px at x=270.25, y=220.5), so nothing about the mark moved on screen; only the box around it stopped being negotiable. Every figure the board is already measured against is unchanged at **390 / 1200 / 1920**: table 1678.03 / 2103.19 / 2103.19, header row 51.00, rows 58.00, the headshot column pinned at 0, the name column at **68** from 820px up, `--research-pin-left` 257, `--table-bleed` −22px and no horizontal overflow of the page body at any width. The arrow boxes go from `8×11` (sorted) and `8×0` (not) to a uniform **8×15** everywhere.
  - **Changing what the table shows puts it back at the top.** Four hundred rows down the board, a tap on `30d` or on the `SS` pill left the reader at the same offset in a table that had become a different set of players — rows with nothing to do with where they were, and the row they were actually reading gone. An offset only ever meant "where I am in *this* list", so a new list has no place to keep. The line is drawn on **population and order**, which is why `ResearchTable` reacts to a **signature of the table as it comes out** rather than to a list of the controls that can move it — the board (`kind`/`pos`), the window, the include set, the watchlist, the search term, the stat filters, and the effective sort. Every one of those is worked from the chrome pinned *above* the table, which gives no hint that the top of it has changed under you.
    - **Sorting resets too, and the sticky header row is what settles it.** The point of clicking `HR` is to bring the home-run leaders to the top, and because the header is reachable from anywhere in the table the reader can ask for that from row 400 and never see the answer. On a table you had to scroll to the top to click, the reset would be a no-op; here it is the difference between getting what you asked for and not. It reads `activeSortKey`, not the board's stored `sortKey`, so **hiding the sorted column** — which quietly falls the order back to the board's default — counts as the reorder it is.
    - **The column picker deliberately doesn't.** It changes what is shown *about* the same players in the same order, so the row under your eye is still the row you were reading — and it is worked a checkbox at a time with the dialog open, where a reset per tick would yank the table away fifteen times while you build the view you wanted. Opening or closing a disclosure doesn't either, for the same reason: nothing about the rows moved.
    - **`scrollTop` only — `scrollLeft` stays put.** The two axes ask different questions on this table: down it is *which players*, across it is *which stat you are reading about them*. Narrowing to shortstops doesn't change the second answer, and this is the app's widest table — a reader out at Chase% who lost the horizontal scroll on every pill would swipe back across forty columns each time. The pinned name column and the pinned sorted column keep a row legible from out there, so nothing is lost by staying where you are.
    - **It must not fight App's per-page scroll memory**, which restores the board's offset (keyed `'research'`) in a layout effect of its own so that leaving the board and coming back lands where the reader left it. The signature as it stands at mount describes the board they are *arriving on*, not a change they made to it, so a mount places nothing. The guard is therefore the **last signature placed** rather than a "have I mounted yet" flag, and the difference is not academic: StrictMode runs a mounting effect, tears it down and runs it again, which a flag reads as a second visit and answers by scrolling to nought — undoing the restore on every return to the board in development. Comparing signatures makes the effect idempotent for a given table, so a re-run of any kind is a no-op and only a real change moves anything. A **re-read** falls out of the same rule for free: new row objects with the same signature move nothing, and reading the same league again is not a reason to lose your place.
  - **The board draws fifty rows and grows as you scroll** (`PAGE_SIZE`, `LOAD_AHEAD` in `ResearchTable.tsx`). It drew the whole league on the first paint: 465 batters or 753 pitchers, each a headshot, an identity block, up to three marks and as many as 44 cells, with a percentile badge under every one of those cells when `Ranks` is on. Measured on the live batting board at 1400×900 with ranks on, the table went from **3,865 elements to 34,277** as the pages were loaded out (1,250 rank badges to 11,454) — nine tenths of it below a fold nobody had scrolled to.
    - **Fifty rather than the feed's twenty**, because the two pages are read differently: the feed is taken an item at a time where this is a leaderboard that is *scanned*, and a page running out ten rows past the fold would be a table stopping in the middle of its own answer. It is also what makes the load-ahead safe — 50 × 58px is 2,900px against a 1,080px screen, so one page always overfills the pane and growing can never leave the foot still in view and chain.
    - **It grows on scroll rather than on a `Load more` button.** A leaderboard has no end worth stopping at, and a control between row 50 and row 51 would be asking permission to carry on doing the one thing the page is for. Nothing is hidden by it either, which is what the app's *no silent caps* rule actually asks: the count line above the table still reads `465 of 465 batters` — the filters' own answer, not how far anybody has scrolled — and every one of those rows is one scroll away.
      - **The contrast this used to draw has not survived it.** It read *"which is where it parts from the feed and the game log — those are lists whose end is a real place, and the button says how many are left"*, and the **game log has since taken this mechanism whole**: the whole of it, extracted to `components/paging.tsx` and read by both tables, at its own `PAGE_SIZE` of 20. Two paging mechanisms in one app is the drift this codebase spends its comments avoiding — one of them gains a guard against a stale timer and the other goes on without it — so what stays with each caller is the page size and where the count lives, and nothing else. See **Client — the player page's other tabs**, *The Game Log grows on scroll*, for the log's own numbers and for the one thing it draws differently (its strip sits under the pane, a sticky `<tfoot>` of season totals being in the way inside it). The **feed** keeps its button and keeps this argument with it: its items are cards with clips in them, read rather than scanned, and the count on the button is a real number about a real end.
    - **A scroll handler on the pane, not an `IntersectionObserver` on a sentinel row**, and the axis is the reason. This pane scrolls in **both** directions, so a marker element sits outside the horizontal viewport whenever the reader is out at Chase% — an observer would quietly stop loading exactly there, which is the one place a wide table most needs to keep going. `scrollHeight − scrollTop − clientHeight` asks the vertical question alone and cannot be confused by the other axis; it is three layout reads on an event the browser is dispatching anyway, against the row it saves mounting. **And the threshold is short — 200px rather than the ten rows a prefetch wants** — because the mark below has to be on screen when it fires: the rows are already in hand, so a page asked for early lands 600px under the fold and the reader gets fifty more rows with nothing anywhere to say where they came from. Two hundred is the strip and a row or two. There is a check after each page lands as well, for a pane taller than the page it was given — a guard rather than a mechanism, since `PAGE_SIZE` is picked so that cannot happen, and it terminates either way once every row of `visible` is drawn. Measured on a phone at 390×844 scrolled **fully right** and then to the foot: 50 → 100 rows, `scrollLeft` untouched at 1,451.
    - **The reading position resets with the scroll**, off the same signature: a page into a table is a fact about *that* table, so narrowing to shortstops or sorting by `HR` goes back to fifty rows at the top, and the column picker and the schedule toggle leave it alone exactly as they leave the offset alone. Measured: `465 of 465` at 50 rows, grown to 350 by scrolling, then the `SS` pill → 50 rows at `scrollTop` 0 and `73 of 465`; and a 73-row board stops dead at 73 however far it is scrolled.
    - **The count lives in App** (`ResearchUi.shown`), for the reason the whole of that object does and the reason the feed's own `feedShown` is one level up from *it*: this component is unmounted the moment you leave the page, and this number decides how tall the table is. App restores a scroll offset per view, so a reader who had scrolled to row 300 and looked at the Roster tab would otherwise come back to fifty rows and an offset that page had no room for — the one way that memory can be exactly right and still land wrong. Measured: 73 rows at `scrollTop` 2,267, out to Roster and back, and both are unchanged. One number rather than one per board, since crossing boards is a change of signature and resets it anyway.
    - **A brief spinning baseball at the foot says the next page is coming** (`.page-more` — `.research-more` until the game log started drawing the same strip from the same component — and `PAGE_BEAT`) — the app's own `LoadingLine`, `Loading more players`, centered under the last row.
      - **The beat is what makes it visible, and nothing is being fetched — which is exactly why there has to be one.** `visible` is already in memory and a page is a `slice`, so a flag set and cleared in one commit is a spinner that never paints: the reader would get fifty rows out of nowhere. So the mark goes up, holds **450ms**, and *then* the rows land. That is `MIN_SPIN`'s own argument — a mark a press put up holds a floor so the press leaves a trace — applied to a scroll rather than a press, and it is the same number. It costs nothing in reach, `LOAD_AHEAD` firing while there are still rows under the fold, so the beat is spent on rows the reader has not reached rather than on a table that has stopped. Measured: the strip sits **1px above the fold** when it fires, the ball is up for the whole beat, and `scrollTop` does not move across it (2,311 before and after) — the rows arrive under the reader rather than shifting them.
      - **The strip is reserved from the moment there is a next page**, rather than appearing with the mark, because it lives *inside* the scroller: a 44px box that came and went would take its own height out of `scrollHeight` under a reader sitting at the very bottom of it, which is a jolt on every page. It goes for good on the last page, where it would be a strip promising something that isn't coming — measured on a 73-row `SS` board, `.page-more` is absent once all 73 are drawn, and still absent at the foot however far it is scrolled.
      - **Sticky on the inline axis** (`position: sticky; left: 0`), which the name column and the sorted column beside it already are and for the same reason: a block child of this scroller is only ever as wide as the pane, so on a table twice that it would sit off the left of the screen exactly when the reader is out at the far columns — which is where a mark about the foot of the list is least use and most needed. Measured scrolled fully right on a 1,861px table in a 390px pane: the strip is at left 0, 390 wide, with the ball in view.
      - **One beat at a time.** A scroll fires the handler every frame, so the timer is its own guard: 40 frames of scrolling to the bottom add **one** page, not forty. And a beat in flight is canceled by the signature reset, which is not tidiness — left to fire it would add a page to the table that *replaced* the one it was about. Measured: pressing `SS` mid-beat gives 50 rows at the top and `73 of 465`, with no mark left up.
    - **Bundle: 548.32 → 549.04 KB of JS** (162.43 → 162.66 gzipped) and **146.87 → 147.02 KB of CSS** (26.19 → 26.21) — 0.72KB and 0.15KB raw, 0.23KB and 0.02KB over the wire, for a slice, a scroll handler, a beat, a saved reading position and one rule; the paragraphs arguing them cost the bundle nothing.
  - **Which players** (`.research-include`, `My Roster · Other Rosters · Free Agents`) sits **ahead of the position row**, and is three independent buttons rather than the single-select `My Players · All Players · Free Agents` it replaced. That control could only ever name one set, and the question a fantasy manager actually arrives with spans two of them — "my roster and the free agents", "everyone who isn't already spoken for". Three switches that compose say all eight of those states where a segmented control says three. They are **`.research-toggle`s**, folded onto the same selector list as Search and Filters rather than restyled to resemble them, and that is the statement: a segment says "pick one of these", where a lit toggle already means "this control is doing something" everywhere else in this bar. They stay a separate group from the position pills for the reason the scope switch did — position and this both apply, so folding them into one row would read as a single-select where picking SS un-picks your own roster.
    - The three sets are a **partition of ownership**, computed in one pass in `boardRows`, and the order of the tests is what makes them disjoint: your roster wins first, so a player you hold whom ESPN says is on a leaguemate's team (possible in saved-roster mode, where the two lists are unrelated) is counted once, as yours. All three on is therefore exactly the whole board — checked on a live league: 13 + 158 + 453 = 624, which is the board's own count with everything on. **They remain three, and the watchlist is deliberately not a fourth key** — it says nothing about who holds a player, so it is a second axis rather than a fourth set, unioned on top in the same pass (see **the watchlist** below). Keeping it out of `ResearchInclude` is what keeps that record a partition, which `inc=none`, `isDefaultInclude` and the disjointness above all lean on.
    - **Free agents is the default**, and it is the right one for both kinds of user. With a league connected the board opens on the players you could actually add, which is what it is *for*. **With no league connected there is no ownership to read**, so the third button is labeled `Everyone Else` and means exactly that — everyone off your roster — and the middle one is not offered at all. The board is fully usable there and can still show everybody (both buttons on): measured on a disconnected account, `Everyone Else` alone gives 611 of the 624 on the board and the pair gives 624. That is honesty rather than convenience: a button promising free agency the app cannot check would be a claim, where "everyone else" is a fact. A `inc=others` link still renders the middle button on an unconnected account, so the state is visible and undoable, and the empty state under it is the way in.
    - Persisted as **`inc=`** — the active keys comma-joined, omitted at the default, and `inc=none` spelled out because turning everything off is a real state where an empty value reads as an absent one. The **legacy `scope=` is still read**: `mine` selects your roster, `fa` the free agents, and `all` turns all three on, which is what "everybody" is now made of. It is also **saved per user** (`researchInclude`), which is what "keep what I set it to" means for a control someone sets once and reads for a season; the URL wins where it speaks, exactly as `cols=` does, so a link someone was handed shows what it says without overwriting what they had saved.
    - On any board showing more than your own roster, a rostered row carries the **same accent baseball `PlayerDetails` shows beside "On roster"**, reduced to the glyph — one marker for one concept, and a table row has no space for the words. Matched on the app's `${kind}-${id}` key, so a two-way player rostered only as a pitcher is marked on the pitching board and not the batting one. It is **suppressed when your roster is all that is on the board**, where every row would carry one and so it would mark nothing.
    - **And a row somebody *else* holds carries a padlock** (`components/LockMark.tsx`), which is the baseball's opposite number and is drawn by the same three rules. It marks the set `Other Rosters` selects — see **ESPN fantasy league**, where the map behind it, the exclusion of the user's own team and the absence of the whole mark without a league are set out. What belongs here is what it looks like and where it stops.

        **Muted where the baseball is accent**, and that is a decision rather than a default. The board is read to decide who to pick up, so "this one is yours" is the loudest thing a row can say and "you can't have this one" is the reader ruling a row *out*; a mark that shouted about unavailability would leave the board's own answer — the free agents, which carry no mark at all — the quietest thing on it. It is `--muted`, one step down from the accent and the same tone the identity block's own sub-line takes, and it is **folded onto `.research-watched`'s rule** for everything except that color, so the two marks sit in the same slot on the same line and cannot part company by a pixel.

        **Suppressed on the same two tests.** Never on a row already wearing the baseball — the two answer one question and a name carrying both would invite a reader to hunt for a difference that isn't there — and never when `Other Rosters` is the *only* thing on the board (`onlyOthers`, the mirror of `onlyMine` and including the watchlist for the same reason: unioned in, it can put a free agent on a board that is otherwise other people's teams). There every row is locked by definition, so the mark states the board rather than the row, and the lit button and the expanded chrome's badge already say it. Measured: `Other Rosters` alone draws **0 locks on 157 rows**, and the same board with the watchlist unioned in draws **157 on 159** — the two unlocked rows being the watched free agents, which is exactly the distinction the mark exists to make.

        **It costs the board nothing**, which is the measurement that mattered on the app's widest table. The name column is fluid and already absorbs the table's slack, and the glyph is 13px in a 6px gutter — the same 19px the watchlist star trailing it costs. Measured before and after at 390 / 1200 / 1920 with the pane scrolled to its far right: the table is **1614.89 / 2002.38 / 2002.38px** either side of the change, the name column **209.75 / 223.28 / 223.28**, the identity block 31.08 and the row 58.00, with **7 / 9 / 10 rows entirely inside the pane** before and after and no horizontal overflow of the page body at any width. (A first pass appeared to widen the table by 54px; that was the `Opp` column, whose contents change as games go final, and it measures identical when the two builds are compared minutes apart rather than a quarter of an hour.)

    - **And a third mark says he has been in the news** (`components/NewsMark.tsx`), which is the first of the three that is not about *whose* he is. A **red** newspaper means something was filed about him today and a **gray** one means yesterday; anything older carries no mark at all. It is drawn on this board, on the summary table and on the player page's own `<h1>` — the three places the app names a player and has room for a mark beside the name.

        **What it answers is the question a season line cannot.** This board is read to decide whether to pick a stranger up, and a man who went on the IL at noon and a man who was named tonight's closer have exactly the same numbers on it as they had yesterday. The `Opp` column and the lineup pip already carry *today's game*; this carries **today's news**, which is the other half of what has changed since the reader last looked — and it points at something: the name beside it opens the player page, whose News tab is what the mark is a door-knocker for.

        **The tones carry the whole of the meaning, which is why they are not the app's delta pair.** This is *recency*, so the mark for "since you last looked" has to catch the eye and the one for "the day before" has to not: `--strikeout` (the app's red, the same token an arsenal delta going the wrong way takes) against `--faint`, a step quieter than the lock's `--muted` because a day-old note is a smaller fact than a man being unavailable. There is deliberately **no third tone**, since the server ships only the players inside the window — so no row can wear a mark that says nothing, which is the rule the roster baseball follows when it suppresses itself on a board that is nothing but your own roster.

        **It is a label rather than a control**, like the two marks before it: a `<span>` with a title and a screen-reader name, and pressing it does nothing. The title names the day *and the headline* — `Shohei Ohtani was in the news yesterday — Throws bullpen Friday` — which is what turns the mark from "go and look" into "he threw a bullpen": the map had to carry something to date the item by, and the newest item's own words are the honest thing to carry. It is **folded onto `.research-watched`'s rule** for its geometry, exactly as the lock is and for the identical reason — three marks in one slot on one line must not be able to part company by a pixel — with only the tone its own.

        **Unsuppressed, unlike the baseball**, and the reason is a count rather than a principle: that mark hides itself when every row would carry one, and this one cannot reach that state. Measured on the live board, **101 of 629 batting rows and 83 of 753 pitching rows** carried it, so it always distinguishes the row it is on.

        **It reads a league-wide map rather than a per-player route**, which is the whole of the server-side design and is set out in **Date handling and server routing** under `/api/news/recent`: news is per player, this board is six hundred names at once, and the map is therefore one sweep in the class `getPlayerPool` is in. It reaches the row through `RecentNewsContext` (`hooks.ts`) for the reason `EligibilityContext` exists — the mark is a leaf on two tables, and the components between it and App have no interest in a news map.

        **It costs the batting board nothing and the pitching board 19px**, measured on the live boards at 390 / 1200 / 1920 by reading the geometry and then stripping the marks out of the same page at the same instant. The batting table is **1784.73 / 2196.36 / 2196.36 either way** and its name column **209.75 / 223.28 / 223.28** — not a pixel, the fluid name column absorbing the mark exactly as it absorbs the star. The pitching table goes **1762.91 → 1781.91 at 390** and **2207.52 → 2226.52** at 1200 and 1920, all of it in the name column (193.25 → 212.25 and 206.78 → 225.78): 19px, which is the same 19px the watchlist star trailing the name has always cost, on a table that scrolls sideways at every width there is. Everything else is byte-identical at all three widths — rows **58.00px**, the header row **51.00**, **rows entirely inside the pane 9 / 11 / 14 before and after**, the headshot column pinned at **0** with the pane scrolled to its far right, and **no horizontal overflow of the page body** in either state.

        **And the whole mark is absent without the map**, which is what a failed read looks like: checked with `/api/news/recent` blocked, **0 marks** on a board that otherwise draws 101, with the table at its usual 2196.36 and the page overflowing by 0.

  - **The watchlist is a star on every row, and a fourth set the board is a union of.** `WatchStar` sits **after the name** and costs the table 19px of a column that absorbs the table's slack anyway — ahead of the name it would have pushed every name in the column along by its own width, on the app's widest table where every pixel is a stat off the right edge of a phone. It is drawn on **every** row rather than on hover, because half this app's traffic has no hover to give; outline is off and filled-accent is on, which is the same read a checkbox would give at three times the width and in a form's grammar rather than a state's. Persisted as **`watch=1`** and saved per user, both for the reason `hideil=1` is: it changes which players the view reports on, and absence is unspecified rather than off, which is what lets the saved value fill it in. It is saved with the include set by one route (`PUT /api/prefs/research-include`) because they are one control set.

    **It used to *narrow* the board and now *widens* it, and the difference is which question it answers.** The old rule was that a watched player can be on your roster, on a leaguemate's or free, so the star said nothing about ownership and therefore had no business being a fourth member of a set that partitions it — and that much is still exactly right, which is why `ResearchInclude` is still three keys and the watchlist is still a flag beside it rather than in it. What the old rule got wrong is what follows from that. A set that is **orthogonal** to a partition is the one you want to *add*, not to intersect with: intersecting produces "the watched free agents", a slice nobody asks for, and hides a watched player the moment his owner changes or the moment you turn his set off — while the union produces "my roster and the men I'm keeping an eye on", or "the free agents and my watchlist wherever they've ended up", which is what a watchlist is kept *for*. Put plainly: the three buttons answer *whose* players, and the star answers *which players are mine to follow*; you narrow within one question and you add across two. So `boardRows` is now `(any included ownership set) ∪ (the watchlist, if on)` — one `filter` over one array with the watchlist tested first, so a player who is both appears once and the count line stays "N of M" with no double-counting. Checked on a live league: My Roster alone is **14 of 14** batters, My Roster + Watchlist **16 of 16** (the two watched batters, neither rostered), and Free Agents + Watchlist **455**, exactly the 455 of Free Agents alone, because both watched men are already free agents there — the union absorbing them rather than listing them twice.

    **Watchlist alone is a real state and had to be made to work.** With all three ownership buttons off the board is exactly the watchlist (checked: 2 of 2), where before that combination was the empty board `inc=none` describes. `nothingIncluded` is therefore now "no ownership set **and** the watchlist off", with `watchlistAlone` as its own flag beside it, and `researchInclude: []` stops meaning an empty board on its own.

    **Two things had to move with it, and both were silent bugs waiting.** The roster **baseball** is suppressed when your roster is all that is on the board, on the grounds that a mark everything carries marks nothing — but unioned in, the watchlist puts free agents on a board that is otherwise your roster, so `onlyMine` gained `&& !includeWatchlist` and the mark distinguishes the two sets again. Measured on the same board: My Roster alone draws 0 baseballs on 14 rows, My Roster + Watchlist draws 14 on 16, with the two watched rows carrying the star and no baseball. And the watchlist **lost its chip in the filters row**, along with its place in `Clear all`. Every other member of that row — the stat thresholds, and Qualified while it existed — takes rows *out* of the table and `Clear all` is the button that puts them back; a control that puts rows in has no business in a row whose one action would then shrink the board — and with the three ownership buttons off, `Clear all` would have emptied it outright. Nothing is hidden by the loss, for exactly the reason the three include buttons have never needed chips either: the control is always on screen in the bar above, lit, with its count beside it.

    **It stays in the tools group rather than joining the include buttons, and that is a measurement rather than a preference.** It is now the same *kind* of statement as the other three — "include these" — which is the whole argument for moving it into `.research-include`, and moving it costs a phone a row of the table. Measured on the same page at the same six widths, before and after: in the include group that group goes **170px → 240** at 390, where the first row has 346px to spend and the `Roster · Research` pills have already taken 171 of it, so the group drops to a line of its own and the bar goes **three rows to four, 207px of chrome to 255**. At 640, 900, 1200 and 1920 the move changes nothing at all (2 / 3 / 2 / 2 rows either way, chrome 159 / 207 / 161 / 161 — measured while `Qualified` was still in the run, which is what took 1920 to one row when it went). Keeping the icon-only phone form doesn't buy it back — 240px is the group measured *with* the label already hidden — and letting it keep a word there costs 305. (Those figures are the **short-label** tier, which is what the include group was at every width under 640 when they were taken; below 480 that group is 116px of marks, and a fourth square would take it to 156 — still 40px more on a line the icons were only just able to join, so the conclusion is unchanged and the star stays where it is.) So the grouping would be bought only where there is room to spare and paid for only where there isn't, which is the opposite of the trade the include buttons themselves made when they took a second line at 1920 to answer a question no dropdown could. It reads **third in the tools group** instead, after the two disclosures and before Columns, so the run is `Search · Filters · Watchlist · Columns`. The one button in the run with no panel of its own, so it takes `.on` and never `.active`, and it carries the **count of watchlisted players on this board**, since a control that holds something must say so with its panel shut and this one has no panel at all. Where it sits *within* the run is a matter of the order the four are read in rather than of layout, since the group is one flex item that wraps whole: a button moved among them cannot change a width. Re-measured either side of the move: the group is **240px on a phone and 468 on a desktop**, and the bar wraps to rows **3 / 2 / 3 / 2 / 1** (chrome **207 / 159 / 207 / 161 / 115px**) at 390 / 640 / 900 / 1200 / 1920 — identical before and after, with no horizontal overflow at any of them.

    **The stored key was renamed and the URL param was not.** `UserPrefs.researchWatchlistOnly` was named for a semantic that no longer exists, so it is now **`researchWatchlist`**, with the old key **still read on the way in** (`prefs.researchWatchlist ?? prefs.researchWatchlistOnly`) and never written — a record migrates the first time the user touches the control, the rule `getEspnCreds` follows for the legacy inline ESPN credential rather than a migration script over every user, and `setResearchInclude` deletes the old key on every write so no record can end up holding two answers to one question. Checked by stubbing `/api/prefs`: a response carrying only `researchWatchlistOnly: true` brings the board up with the watchlist unioned in, identically to one carrying only `researchWatchlist: true`, and one carrying neither leaves it off. **`watch=1` keeps its spelling**, because renaming it would cost every open tab and every link already shared and buys nothing — the word never said "only", and a widening is the safe direction for an old link to be read in: it shows the watchlisted players it promised *plus* whatever its `inc=` asked for, rather than fewer than either.
  - **Every combination that empties the board names its own cause** (`emptyBoard`), which is the standard the old three-state free-agent message set and which four controls make harder to keep: the causes are tested in the order they *govern* — nothing included at all beats everything else, then the board that is the **watchlist alone**, then the league read the last two buttons depend on, and last a set that genuinely holds nobody. So: `No players included` with the way back on (the empty state's link turns Free Agents on); `No batters on your watchlist`, which explains what the star is; `Reading your ESPN league` — a **block wait rather than an `.empty-state`**, since that box is the app's shape for a *finding* and "there is nobody here" is precisely what this must not say while the league read is still out — and `Couldn't read your league`, the two states of the ownership read, unchanged in spirit from the old free-agent block; `No fantasy league connected` when `Other Rosters` is on without one, reachable only from a link; `No batters on your roster` when that is all that is on; and a closing one that names the sets that *are* on. Checked in a browser, connected and disconnected, for each of them.

    **The union changed three of these**, and adding an axis is exactly the kind of change that quietly costs a message set its honesty, so each is worth naming. `No players included` now requires the watchlist to be off as well, since with it on the board is the watchlist and not empty. The watchlist's own message is only reachable when it is the **only** thing on — with an ownership set beside it an empty board is that set's story rather than the star's, which is what keeps two causes from both being true — and its way out had to change with it: "show everyone" used to mean turning the filter off, which now leaves a board with nothing included at all, so the link turns **Free Agents** on instead (checked on the pitcher board, where nobody is starred: `No pitchers on your watchlist`, offering the league to go and find somebody in). And the closing case names the watchlist among the sets that are on, which it has to rather than being left to the branch above: there is a second route to an empty watchlist-only board — a starred player on neither leaderboard, a two-way man watched as a pitcher with the batting board up — and without it that reader would have got a sentence naming no sets at all.
  - **The sorted column follows you along the table.** It keeps its place until it would leave the viewport, then pins to whichever edge it was about to pass — left once you have scrolled beyond it, right while you have not yet reached it. That is one `position: sticky` carrying **both** `left` and `right`; the browser resolves which edge applies, so there is no scroll listener and no state to drift out of sync. The `left` offset cannot be a calc the way the name column's own is — it has to clear whatever is already pinned there, and the name column is fluid because it absorbs the table's slack — so the component measures it into **`--research-pin-left`** (264px at 1200 on a checked board: the 68px headshot cell plus a 196px name). Its **fallback**, for the one commit before that measurement lands, is the headshot cell's own calc, so the two agree by construction. It measures the **sum of the pinned widths**, not a position: a width is unaffected by scroll and by where the page sits, where `offsetLeft` is neither and quietly folded the app's own side padding into the offset (290px for a block ending at 268), parking the column that far past the name. Below 820px the name isn't sticky and only the headshot is cleared, which the same measurement gives by reading whichever cell is actually pinned — and "pinned" here has to be read off **`left`, not `position`**: every header cell in this table is `position: sticky` at every width, since that is what pins the header row to the top, so testing the position counted the name column as pinned on a phone and held the sorted column 240px into a 346px-wide table, out in the middle of the screen past a column that had scrolled away. The soft edge is on **both** sides here, unlike the name column's single right-hand one: which edge is doing the pinning changes with the scroll position and CSS cannot know which, and without it the half-covered column beside it reads as a broken column of its own — an OPS of .904 sliding under shows as a column headed "PS" holding "04". Unpinned, the pair reads as emphasis on the column the table is ordered by. The sorted *header* is pinned on both axes at once, so it keeps the header row's `top` and takes a layer above both. All of it is scoped to `.research-table`; the summary view is untouched.
  - **The position row** (`.research-positions`, `POSITIONS`) is the page's primary control and is **both the board switch and the position filter**: `Batters · Pitchers · C · 1B · 2B · 3B · SS · IF · OF · SP · RP`. The **kind is a consequence of the position** — picking SS puts you on the batting board, RP on the pitching one — which is why `researchKindFor(pos)` is what `App.tsx` reads to know which board to fetch, and why research shows no kind tabs. The row **scrolls sideways rather than wrapping** (`flex: none` on the pills is what makes them overflow instead of squashing): this view is a table that wants every pixel of height, and eleven pills reflowing to three lines on a phone push the first name below the fold. On a phone it isn't a row at all — see **the bar's three tab groups on a phone** below. The row is `flex: 0 1 auto` in the tab row it now lives in (`.research-bar` is `display: contents`, so its groups are items of `.view-bar-tabs` itself) — no grow, so it is only as wide as its pills; shrink allowed, so the line breaks under it and the pills take the width alone and scroll what won't fit (a flex item with `overflow-x: auto` has an automatic minimum size of 0, which is what lets it shrink past its content instead of forcing the wrap wider). Left as a block child of the column-flex `.research-view` it stretched to the full width and cost the table a whole row. A `useLayoutEffect` keeps the selected pill on screen when it changes — scrolled by hand, not with `scrollIntoView`, which walks up every scrollable ancestor and would drag the table and the page with it. The list is deliberately **not** built from the rows in view: an empty position is a fact worth seeing, and a row of pills that appears and disappears with the data is harder to aim at. `C`/`1B`/`2B`/`3B`/`SS` match a position he is **eligible at** and `IF`/`OF` the group (so they *overlap* the individual pills by design — IF is the whole infield, not "some other infielder"; and see **What a position means** below, since with a fantasy league connected they overlap each other too), and **`SP`/`RP` read ESPN's eligibility like the eight before them**, falling back to `ResearchRow.starter` — a majority of appearances are starts, the same test `isRotationStarter` applies to a watched pitcher — for a pitcher ESPN can't be joined to and for every user with no league. So the two no longer partition the pitching board: a swingman is under both (see **What a position means** below). Each board is itself narrowed to the players of its own trade (`boardRows`, via **`isPitcherByTrade`** / **`isBatterByTrade`**), because each MLB leaderboard arrives carrying the other's: 44 **position players who mopped up an eleven-run loss** on the pitching one, 77 **pitchers who took a plate appearance** on the batting one. Both really did appear, and both wreck the board the moment it's sorted by a rate — a utility infielder's scoreless inning tops ERA, a pitcher who went 1-for-1 tops AVG at 1.000. Filtering at the **board** rather than per pill is what keeps the count line honest: every denominator (745 pitchers, 622 batters) is a population some pill can actually reach, where narrowing only SP/RP would have left 44 rows in "of 789" that nothing could ever show. A **two-way player passes both tests**, which is right — he belongs on both boards, and dropping him would take a real starter out of SP. Note the two tests are shaped oppositely on purpose: an **allowlist** on the pitching side, where the set that belongs is small and closed, and a **denylist** (`!== 'Pitcher'`) on the batting side, where it is everyone else — including the 17 players MLB has no primary position on record for (`Unknown`, shown as `X`). Those are ordinary hitters (Conforto at 200 PA, Grichuk at 178) that no position pill reaches but Batters must, so an allowlist of the named positions would have quietly dropped a season of them. **There is no DH pill** — a player whose listed position is DH is on Batters and nowhere else, and ESPN's own `DH` eligibility is read but never filtered on (below). Persisted as `pos=` (omitted for the default `batters`, and only written while the research view is open, since it means nothing anywhere else); an unrecognized value falls back to `batters` via `toResearchPos`.
  - **What a position means: ESPN's eligibility with a league connected, MLB's listed one without.** A fantasy manager's question is never "where does he mostly stand" but "where will my league let me start him", and those differ in two ways MLB's single `position` cannot express. It is **multi-valued** — 301 of the 628 batters ESPN could be joined to are eligible at more than one place and 95 at three or more — and it is sometimes flatly **different**: 22 rows on a checked board lose a pill they used to match, every one of them a correction rather than a loss (Curtis Mead is listed at 2B and is eligible at 1B and 3B; Andy Ibáñez is listed in left and is eligible at third), so the old board was offering slots a league would refuse. Read together the pills go from 55 shortstops to 103, 68 second basemen to 143 and 240 infielders to 318, and 51 more players become reachable by any pill at all (568 → 619 of 626), the newcomers being the men MLB files under DH or nothing. The list itself is `ResearchRow.eligible`, **merged into the rows by App** exactly as `rosterPct` is and off the same `/api/espn/ownership` payload — see **ESPN fantasy league** for where it comes from, why it costs no extra upstream call and why the *league's* eligibility and the cookie-free global one were checked against each other (320 of 320 identical).
    - **The fallback is per row, not per page, and the two boards fall back to different things** — because they have different things to fall back *to*. `eligibleFor` takes ESPN's list where there is one; where there isn't, a batter takes MLB's single position (mapped through `MLB_TO_ELIGIBLE`, LF/CF/RF collapsing to OF) and a **pitcher takes `starter`**, MLB's own answer for him being `P`, which no pill has ever been able to use. So a player the name-and-club join can't place is filtered by what the app does know about him rather than dropped out of every pill. With no league at all that is every row, which is why **nothing changes for a user without one**: `Infielder` and `Outfielder` are precisely the four infield and three outfield abbreviations so IF and OF answer identically to the `positionType` tests they replace, and SP/RP answer exactly as they did when `starter` was all they read. On the checked board **2 of 626** batting rows and **5 of 749** pitching rows took the fallback with a league connected. **Each board reads only its own half of ESPN's vocabulary**, which is what makes a cross-trade mis-join harmless: ESPN has the Yankees' Fernando Cruz eligible at 2B and SS, and filtered to the pitching half that is an empty list and so the fallback, rather than a second baseman with an ERA.
    - **The pills are a cover now, not a partition**, and that is the honest consequence on **both** boards: a utility man is under 2B *and* SS *and* OF, and a swingman is under SP *and* RP — 143 of the 749 pitchers on a checked board are eligible at both — so the pill counts no longer sum to the board on either side of it. What a reader loses is the arithmetic: SP's 370 and RP's 522 come to 892 against a board of 749, and neither number is a share of it. What the count line says is unaffected, having always been "N of M" against the whole board rather than against the other pills: M is still every row a pill could reach (749), and N is still exactly the rows on screen. The pitching pills were the last partition in the row and their going is the price of the pills all meaning one thing.
    - **`SP`/`RP` read eligibility too, and used to read `ResearchRow.starter`.** They were held back on three objections and the objections were not wrong; two of them are still true and the board now pays them, and the third turned out to be the argument *for* the change once it was followed through.

The pills **stop partitioning** — 143 of 749 eligible at both — which is set out above as the cover it makes of the pitching board. It is a cost rather than an error, and the board already carries the same one on the batting side by design (`IF` overlaps the four infield pills, a utility man is on three at once); a swingman genuinely is both, and a control that insisted otherwise was answering a tidier question than the one being asked.

Eligibility is **season-long where `starter` follows the window**, which was the sharpest of the three and is the one that changed sides. The window decides which *games the numbers are drawn from*; it has never decided who the player is, and every batting pill beside these two has been a season-long fact on a seven-day board since eligibility landed. So `starter` made SP/RP the one control in the row whose meaning moved with the span — and moved it into the wrong answer. On the 7-day board **2 pitchers had started a majority of their week and are RP-eligible only** (Erik Miller, Daniel Lynch IV), so filtering to SP offered men the league will not let you start there — precisely the Curtis Mead correction the batting side already made — and **6 more had only relieved that week and are SP-eligible only** (Slade Cecconi, Jordan Montgomery), so RP offered men who cannot fill it. Being season-long is what makes an eligibility a fact about the player rather than about the fortnight, which is what a position is. The window still decides the **fallback**, where it is the only answer there is and is honestly a description of that span.

And `starter` **stays on the row, for a reason that has now changed under it twice.** It was kept because the server's qualifier read it and one definition of a starter was enough; then the `Qualified` toggle that rule fed went (see below) and it survived server-side read by nobody; and now the qualifier has come back on **Savant's** rule, which makes no starter/reliever split at all, so the qualifier does not read it either. What keeps `starter` is the fallback above: it is what these two pills read for a pitcher ESPN cannot place and for every user with no league, which is a live reader rather than a vestigial one. What it is no longer is the pills' *primary* definition. The two answer different questions — "did he start most of his outings in this window" against "where will my league let me start him" — so they are allowed to differ, and where they can be compared they mostly don't: of the 601 pitchers with a single ESPN answer, 561 match, and the 40 that don't are organizational starters who have so far only relieved in the majors (Ty Blach at 1 G, 0 GS, ESPN `SP`).

**The pills, measured on the same live league, before and after**: SP **224 → 370**, RP **525 → 522** — the RP figure barely moves because almost every man eligible at SP is eligible at RP as well, while 147 relievers by this window's reckoning are men their league will let you start. Every row still reaches some pill (749 both ways; `starter` was a partition, so coverage was never the thing missing). Off a 30-day window it is 179 → 277 and 347 → 362, off a 7-day one 154 → 217 and 259 → 284.
    - **Club and position are under the player's name, not columns of their own.** `Tm` and `Pos` were two columns at the head of the app's widest table — on a checked board **152px of every row** (measured at 390px, table 928 → 776 with the same ten stat columns) spent on two facts about *who the player is*, sitting beside a name that is the same kind of fact and whose column absorbs the table's slack anyway. Underneath it they are the identity block a player card's header already is: the club as its **cap logo** (`lib.ts::teamLogoUrl`, MLB's `team-cap-on-dark` cut — the light cut is drawn in the club's own navy for half the league, which is a smudge at 15px) **on a ground in the club's own color** (`lib.ts::teamColor`) with the eligibility list beside it. **It costs the board no rows**, which is the measurement that mattered and took two goes: the row's height is set by whichever of the headshot and this block is taller, and at a 16px logo over a 1px gap the block came to 33px against the 31 the 37px headshot's cell left — 51px rows became 54 and the board lost a row a screen. At 15px and no gap the block is 31px and the headshot set the height again: **10 / 11 / 12 rows at 390 / 1200 / 1920 in an 800px window, identical to before**, with the table 152px narrower at the width where that is a stat column off the right edge. The circle has since grown to 42px and the cells' padding to 12, which **moves that budget rather than removing it** — the image cell is 6 + 46 + 6 = 58 against this block's 12 + 31 + 12 = 55, so the headshot still sets the row and the block has three pixels of slack it did not have (measured: rows 58.00, block 31.08). See **The tables breathe** above for what that cost per screen. The abbreviation is not lost, only taken off the grid — it is the logo's `alt` and tooltip, it is what the board's search still matches on, and it is printed outright for a club with no id on the leaderboard row or an SVG that fails to load (`TeamMark`). The id it needs is **`ResearchRow.teamId`**, added to the blob for this (MLB serves a logo by id and nothing else, and a second abbreviation-to-id table on the client would be a copy of what `getTeamAbbrevs` already holds) — which is what took the storage key to **`-v7`**. **The mark brings its own ground, and it did not always.** The parenthesis above used to close on *"the app has one palette and it is dark"* — so the page supplied the dark the `on-dark` cut is cut for, and the mark needed nothing behind it. **Powder Blue is a light theme**, and thirteen of the thirty marks are drawn in white *alone* (CIN, DET, KC, LAD, WSH, ATH, PHI, ATL, CWS and NYY among them, read out of the SVGs), so on a powder page they were invisible — the Yankees' white `NY` on white being the one that gets reported. Each mark now carries a 3px-radius tile in its club's color, which is also what a cap *is*, so the row gained a picture rather than a patch: `lib.ts::teamColor` is where the table lives, why it is curated (no MLB endpoint publishes a color — probed), why deriving it from the `on-light` cut gets 24 of 30, and how every one of the thirty was checked (the mark's best ink against its ground, all clearing 4.5:1, the tightest being PHI's white P on Phillies red at 4.57). **It costs the board nothing**: the tile is the 15px box the mark already occupied, so the row is **58.00px** and the block **31.08** in all four themes, with the table at 2434.23 and 0 page overflow, byte-identical to before. **The block itself is no longer this file's**: it is `components/PlayerIdentity.tsx` and the unscoped `.row-id*` rules, shared with the summary table, which draws the same three facts under the same name for the same reason — see its own passage above for why it is shared rather than copied, and note that only the *name line* differs between the two (the baseball and the star here, a fantasy slot chip there).
    - **And which hand, after the position — three facts on that line now.** `RHB` / `LHB` / `SH` on the batting board and `RHP` / `LHP` on the pitching one, drawn by the same shared block and so identical to the summary table's by construction. The vocabulary, why it is one token per kind and what was rejected are in `lib.ts::handCell`; what is the **board's** own is that this is the table the fact could least afford a column on, and it does not take one. A column here is ~40px on a board that already overflows a 1920px screen with a third of its columns showing — the arithmetic that keeps this table's gutter at 13px where the other two grew theirs — where the sub-line costs it nothing at all.
    - **Nothing, measured the way the cap's own ground was**: the geometry read and then the token stripped out of the same page at the same instant, at 390 / 1200 / 1920 with the pane scrolled to its far right. The batting board is **1821.19 / 2292.84 / 2292.84** and the pitching board **1762.20 / 2235.34 / 2235.34, byte-identical either way**, with the name column identical on both (157.44 / 170.97 and 172.64 / 186.17), rows **58.00px**, the block **31.08**, the header row 51.00, the headshot column pinned at **0**, the name column at **68** from 820px up (`relative` at 819 and `sticky` at 820, which is the documented breakpoint unmoved), the sorted column's own pin at 68 below it and 254 above, and **page-body overflow 0** at 320 / 390 / 819 / 820 / 1200 / 1920. The full-page box draws it too, at the same 58.00px row with the headshot still at 0.
    - **Where the headroom is, since the zero is a fact about this league's names rather than a law.** The column is sized by the widest **name line** on the board, and the widest **sub-line** is a long way inside it: on the batting board the name column's content box is 216.28px, set by `Christian Encarnacion-Strand` at 216.3, against a widest sub-line of **143.2px** — Casey Schmitt's `1B/2B/3B/OF/DH` plus his `RHB` — so there are **73.1px** to spare, of which the hand spends 29.8. The pitching board is looser still: 180.78px of content set by `Simeon Woods Richardson`, a widest sub-line of 84.1, **96.7px** spare. Over all 465 batting and 609 pitching rows paged out, **no position list truncates** in either state. That is the margin to check against if this line is ever asked to hold a fourth thing.
    - **Absent draws nothing.** A player MLB lists no hand for, and every row before the boot request lands, carry no token rather than a dash — checked with `/api/players` blocked: **0 of 50 rows** marked, rows still 58.00px, headshot still pinned at 0, page overflow still 0. And there is deliberately **no handedness column and no pill**: the position pills are a control over *which rows are on the board* and a hand is not a thing anybody filters a leaderboard by, where a token under the name is a thing they read off the row they have already found.
    - **The Pos cell is where a filtered row says why it is on screen, so it prints the eligibility whole.** It held **two codes and then a count** (`2B/SS+3`) for a while, the card chip's form, on the argument that the column hugs its content (`width: 1%`) on the app's widest table and every pixel of it is a stat off the right edge of a phone. What that traded away is the one thing the cell is for. On the checked board **301 of the 628 matched batters are eligible in more than one place and 95 in three or more**, so a `+3` was the cell declining to answer its own question for a sixth of the board — and the hoist below made the cap *safe* rather than harmless: the reader could trust that the pill they had filtered to was in front, and had no way to see the rest. Re-measured at 390px on the real board: the column goes **65px → 108px** and the table 1573 → 1616, so the whole list costs 43px of a table already 1.6k wide and **overflows the page at no width** (checked 390 and 1200, document overflow 0 at both). The widest string the league can produce is still `1B/2B/3B/SS/OF`, fourteen characters — 5 batters carry five positions, 14 carry four. The order comes from **`lib.ts::positionOrder`**, shared with the card chip so the two agree on what leads; what the board no longer takes from `positionCodes` is the cap and the DH trim, both of which are the chip's line-width rules (a name and a chip on one phone line) and neither of which this column has a reason to pay. **The whole three-deep rule is `lib.ts::positionCell` now**, shared with the summary table's identity block, with `eligibleCodes` beside it as the same rule without a tooltip — which is what the position *pills* read, so a pill and the cell under it cannot disagree about where a man is eligible. What stays in this file is the pill to hoist and the wording of a pitcher's fallback, `starter` being measured over the board's window where a report's is his season. **The active pill's codes are still hoisted to the front** — filtering to SS and reading row four gives `SS/2B/3B/OF` rather than a list that opens somewhere else, so the cell leads on the reason the row is on screen (checked: all 32 rows under the SS pill lead `SS`, all 32 under 2B lead `2B`). **And `DH` now reads wherever ESPN grants it**, where the capped cell dropped it unless it was all he had: no pill selects it and it says the least of any code, which is exactly why it was the one to cut when only two slots were going — with the whole list printed there is nothing to cut it in favor of, and it is a real slot the league will let you fill. So `OF/DH` and `C/1B/DH` where the cell used to read `OF` and `C/1B`. The tooltip names its **source**, since `SS` alone cannot say whether it is ESPN's or the fallback, and the two boards fall back to different things so they say different things. **The pitching board's cell reads the same list its pill does**, which it did not at first: it printed MLB's `P` for every row and `TWP` for a two-way player, one character that the pill beside it had already split in two and that therefore could not say why a filtered row was on screen. It now prints `SP`, `RP` or `SP/RP` — two codes at most, so no pitching row was ever reaching the old cap and none of the above changes it — and the hoist applies here as everywhere, so the same swingman reads `SP/RP` under the SP pill and `RP/SP` under RP. A batting row with nothing in the board's vocabulary at all — a two-way player's `TWP`, a position MLB has no record of — still prints MLB's own spelling with its old `positionType` tooltip, which is exactly what the cell did before any of this; a **pitching** row can no longer reach that branch, `starter` always being there to fall back on.
    - **The pill tooltips change with the meaning**, not just the rows: `Shortstops` becomes `Eligible at shortstop in ESPN` once the map has landed (`hasEligibility`, a prop from App). That flag decides **wording only** — which rows match is decided per row off `ResearchRow.eligible`, so a player ESPN can't place falls back on his own account rather than by a page-wide switch.
  - **The opponent column is the one thing on the board that is about this afternoon** (`Opp`), and it now says what the summary table's opponent cell says: the matchup and the opposing announced starter before first pitch, the score and the inning while the game is on, the score and `Final` once it is over, and an em dash for a man with no game today. Every other column on the row is drawn from the window the board is on, and that is the argument for this one rather than against it: a season line is read to decide whether to start somebody **tonight**, and who he plays, where, off which starter, and whether the game has already been played are the facts that decision turns on and that no amount of season data carries. It reads the same on a 7-day board as on a season one for exactly that reason. It comes off the league-wide **`/api/statuses`** map, the same request every row's lineup pip and IL badge already come from, so it costs no second upstream and — the load-bearing half — no field on the research blob, which is cached per kind and window and served to every user alike and would carry a day's fact for six hours. `PlayerStatus` gained `opponent`/`isHome` and then `teamScore`/`opponentScore`, `currentInning`/`inningState`, `startTime` and `probablePitcher`, every one of them filled from the game `getPlayerStatuses` has already picked for him (so a doubleheader is settled the same way every other view settles it). **`saysSomething` widened for the first of those and for none of the rest**, which is the cost worth naming: having a game today is itself worth a row, so every player on a boxscore roster ships rather than only those a lineup or an IL stint had something to say about — measured on a full slate, **1,353 entries against the ~600 an unposted morning used to send**, and 10.7KB over the wire with `compression()` on. The four facts added since ride on that same game and can never make a man worth shipping on their own, so the population is unchanged and only the entries pay; see **`/api/statuses`** in the server notes for what they cost.

    **It follows the summary cell's vocabulary and departs from it in exactly one place, for width.** There the score is the away-first line score (`SEA 3–5 LAD`), which names both clubs and so stands in for the matchup on the main line; here the matchup **stays on the first line in every state** and the score is written from his side of it (`5–3`) — the game log's own convention for a narrow column (`W 5-3`), and a second club abbreviation saved on the app's widest table. Everything else is the same rule and the same type: two lines and never three, the start time riding the matchup (`.research-opp-time`, as `.sum-opp-time` does) so the second line is free for the starter, the starter by **surname** with his hand (`RHP Alcantara`, full name on the cell's tooltip), and color spent only on state — the live inning in `--hit` and a postponement's `PPD` in `--hr`, the two rules scoped to the span rather than the cell so that sorting *by* this column, which tints the whole cell accent, is not the moment the state stops being legible (checked: sorted, a live inning still computes `#34d399` inside a cell computing `#38bdf8`). `PPD` rather than "Postponed" because this map carries no `detailedState` to spell out and the column has no room for one.

    **Measured before and after on the same board and the same league.** Evening slate (live and final games): the table goes **1555 → 1592px at 390** and **1946 → 1982 at 1200**, the column itself 56 → 93 and 70 → 106. A morning slate, where every cell carries a time and a starter, is **1610 at 390** and **2000 at 1200** (column 111 and 124), so the whole feature costs a phone 37px of a 1.6k table at its narrowest and 55 at its widest, with no horizontal overflow of the page at either width. **The start time was kept, and it is 19px of that** at both widths — hide it and the pre-game column measures 92/105, which is exactly what the live and final states already need, so it is the only thing that ever makes this column wider than its own resting width. It is worth 19px because pre-game is the state the column is *read* in: a board opened at ten in the morning is being read to decide who to start, and a 1:10 start and a 10:10 one are different decisions.

    **Row height does not move**: the headshot sets it, and the identity block under the name already spends two lines on the budget it leaves, so this cell spends the same — 16px of matchup over 14px of detail, with no gap. Measured on every row of both boards, morning and evening: min and max row height 52px, identical before and after. (The row has since gone to **58px** off a 42px circle, which widens that budget to 34 and leaves this cell four pixels in hand where it had three — see **The tables breathe** above.)

    It still **sorts alphabetically on the opponent**, which on this column means "group my players by tonight's game" (`Column.text`, the one column that holds words rather than a number — hence its absence from the filter builder, `Opp ≥ 4` being no question anyone asks). Everything the cell gained is a fact about that same game and so is constant within a group: sorting on the score or the starter would only reorder ties, and neither is a threshold anybody would type.
  - **H/AB is one cell where H and AB were two columns**, the shape the summary table and the game log's leading cell already use and the way a batting line is read. It **sorts on hits**, the numerator being what a counting column is asked for, and the average it implies is the AVG column along the same row, computed over this very pair. `hits` and `ab` join `DEFAULT_OFF` on the batting board with it: the two of them off is the same line in one column rather than a stat dropped from the board. Batting board only — a pitcher's row has no at-bats to divide by.
  - **The Columns button opens a modal, where Search and Filters beside it stay inline panels** (`ColumnPicker.tsx`, over the app's shared `Modal` — the whole picker lives there now rather than in this file, and **the board reads the extracted version**, the player page's Stats tab being its second caller; see **The Stats tab** below for why it moved and what each caller keeps). The three buttons are one run and this is the one that leaves the row, and the reason is volume rather than taste: Search is a field and Filters is a three-part sentence, one line of the wrapping tab row each, where this holds the whole order row **and** every column the board has in four labeled runs — measured on the pitching board, 29 order chips over 48 checkboxes, several hundred pixels of it. Inline that is a block of chips wedged into the pinned chrome, pushing the table it describes down the page and, on a phone, taking the screen outright while still pretending to be a strip of controls — a picker that costs you sight of the thing it is picking for. A dialog can carry a **scroller of its own**, which is the whole of the fix: measured at 390×844 the box holds 620px of a 854px picker and the board behind it does not move, where the panel grew the page by the difference. It takes the app's overlay conventions rather than inventing a second visual language — `.details-view`'s dimmed fixed box over a `--panel` card on `--control-radius` and `--shadow`, the body pinned by `useLockBodyScroll` and `overscroll-behavior: none` on the one thing that scrolls (it landed as `contain`, reasoning from the two overlays it copies, and went to `none` with them when the bounce was removed app-wide — see the passage above) — and it owes a modal's four ways out: the ✕, Escape, a press on the backdrop, and the Columns button itself. That last one is free, the state still being `ui.panels.columns` beside the other two disclosures, so the button keeps its `.active` fill and its count badge exactly as it had them. Two details are load-bearing. **The shell is `components/Modal.tsx`** — portal, body lock, Escape, backdrop, head, one scrolling body — extracted when a second dialog was needed (a pitcher's `OutingBreakdown`) and extracted rather than copied, on the rule that folds `.settings-toggle` into `.sim-toggle`'s selector lists: two modals that merely resemble each other are two modals that will one day differ. The stylesheet's `.research-columns-*` rules were renamed `.app-dialog-*` in place, so this dialog is unchanged by construction; it takes the default 720px and passes no width modifier, where the breakdown asks for 860 to hold an arsenal table. What is left in `ColumnPicker.tsx` is the title and the contents — and what is left in `ResearchTable.tsx` is neither: the board hands the picker its vocabulary and its selection and takes back a list of keys, which is the one thing the two callers answer differently (this one stores nothing when the list has come back to the defaults, so `cols=` stays out of a link that isn't saying anything).

It is **portalled to the body**, not left in the chrome the rest of the control set is portalled into: that box is `position: sticky` with a `z-index`, so it opens a stacking context and a fixed child of it could never rise past its 41. And it takes **46** — over the chrome that opened it and over the full-page table box (45), under the player page (50) and the reel and how-to pages (60), which are pages where this is a control's panel; neither of those can be on screen with it in practice (the full-page mode covers the whole control set, and this backdrop swallows the click that would open a player), but Escape is written for the stacking anyway, the dialog declining the key while one of them is above it and joining the list `hooks.ts::overlayAbove` reads so they decline to it — one press, one thing undone, whichever way round. The backdrop dismisses on **`pointerdown`**, the rule `useDismissable` follows, which here also keeps a chip-drag that happens to *end* out on the backdrop — mouse down on a chip, up outside, whose click lands on their common ancestor — from closing the dialog on top of the reorder it just committed (checked again after the gesture changed: the dialog is still open either way). **Escape is the one key this dialog now shares**, since a picked-up column takes the first press and the box the second — see the order row below. Everything else inside is untouched: the group All/None, the last column that can't be turned off, the debounced `PUT /api/prefs/research-columns`, and the rule below that a tick of the picker deliberately does *not* put the table back at the top.
  - **The columns can be rearranged** (`ColumnOrder`, the first block of the Columns dialog, and in `ColumnPicker.tsx` with the rest of it since the player page's Stats tab became its second reader — one gesture rather than two, which matters most for the paragraphs below, where the touch half took three goes to get right). It is a row of its own rather than a handle on the chips below, because those chips are **grouped** — Counting, Slash line, Rates, Statcast — which is the right shape for choosing columns and no shape at all for arranging them, an arrangement being one flat sequence that crosses every heading. So the picker answers its two questions in two blocks, each drawn the way its own question wants. Three things had to change under it. **`cols=` became order-bearing**: it was read into a `Set` on the explicit grounds that a hand-edited link had no business shuffling the table, and now the order is the reader's to set and the parameter carries it — with a dedupe on the way in, since a key named twice would render two identical columns under one React key. **`isDefaultColumns` compares position by position**, so the same columns rearranged is a change a link and the saved preference both keep. And a column switched **on** lands at its canonical place among the ones already there (`withColumn`) rather than at the end: someone ticking `2B` with the default set on screen wants it beside `H/AB`, not out past the Statcast group, and whatever custom order is in force is left alone either way.

**The gesture is a press and a press, and a drag is the mouse's shortcut for it.** Press a chip to pick a column up — it fills with the accent, the others dim, and the hint line above says whose it is and how to cancel — then press another to drop it there. A mouse may instead hold the press and drag, which is the same move with the release doing the placing. **On touch there is no drag at all**, and that is the whole of what was wrong here for two attempts running.

**This paragraph used to say the two gestures were told apart by axis, and that was the second wrong answer.** The first was `PlayerOrderEditor`'s: `touch-action: none` on a 9×13px grip, on the reasoning that a finger anywhere else would still scroll the dialog. It does not work here, and the thing that breaks it is **Chrome's touch adjustment** — a touch landing near a small target is snapped onto it, so a finger up to ~10px outside the glyph arrived at the grip and `none` then forbade the scroll. Measured at 390px on the real board, the swallowed band ran **x=58 to past the chip's right edge on a chip spanning 29–84**, and vertically **199–237 on a chip spanning 203–231** — over half of it in both axes — and over the first six chips **40 of 85 sample flicks moved the dialog 0px**. Widening the grip makes that worse rather than better, the band growing outward from whatever box it is given.

So the grip went to **`pan-y`**, with a matching axis test in the handler: the block axis to the scroller, the inline axis to the drag, a move past `DRAG_SLOP` deciding which. **That fixed the scrolling and could not fix the reordering**, and the reason is one fact about the block that the axis argument never looked at: **the chips wrap.** Twenty-five of them are six rows on a 390px phone and twenty-six are seven, so the commonest thing anybody does here — take a column off the first row and drop it on the third — *is* a downward drag, and the axis test threw exactly those away as the scroller's. Measured on the real board with touch emulation, over thirty drags spanning a neighbor, the next row, two rows down and a row back up: **10 of 30** landed the chip where it was dragged at 390×844 on a seven-row board, **18 of 30** at 390×430 on the same board, and **22 of 30** at either size once a column resolved fewer and the block came to six rows. **Every single failure crossed a row**, and the "up a row" pairs are where it concentrates — 6 of 6 failed on the seven-row board and 4 of 6 on the six-row one, since a chip and the chip above it differ by 34px of `y` and, when they are the same width, almost nothing of `x`. A cross-row drag that happened to *start* sideways survived, which is why the rate moves with the layout and why the bug reads as intermittent rather than as a rule. The scrolling half of that build was genuinely fixed and stayed fixed: **0 of 450** vertical flicks over the first six chips moved the dialog 0px, against the 40 of 85 before it.

**There was no third scope to try**, which is what makes this the useful case in the `touch-action` passage above. A drop target is anywhere in a two-dimensional block inside a box that scrolls one of those dimensions, so the drag and the scroll share both their *place* and their *axis* and no declaration can separate them. What can be changed is the gesture, so on touch the drag is not attempted: **`touch-action` is not declared anywhere in this block**, every pixel of the picker scrolls from every pixel of a chip, and what is left for a finger is a press, which no scroller competes for. Touch adjustment stops mattering for a second reason as well — a snap can only move a press from one part of a chip to another, and every part of a chip now does the same thing (checked: a press on the grip glyph picks up exactly as a press on the chip's middle does).

**And the chip's own hover is scoped to `(hover: hover)`, which is the one small target in the app that takes that rule.** It is granted for *what* it paints rather than for its size: with the gesture a press and a press, a chip is left hovered by every step of a reorder, and `.target:hover` draws full opacity and a solid accent border — very nearly what `.picked` draws on the chip actually being held. Scroll the picker mid-reorder and the last chip the finger crossed claims to be the one being moved while the real one claims it too, which is the worst version of the sticky-hover fault. The grip's own accent lift goes with it, being the same claim in a quieter ink. Measured at 390 with touch emulation after picking a chip up: **0 of 27 `.target` chips lit**, their grips reading `rgb(92, 111, 151)` (`--faint`) rather than the accent; with a mouse at 1200 a hovered target still goes opacity `0.7 → 1` with its border to `rgb(56, 189, 248)` and its grip to the same. See **Client**, *A card doesn't highlight when you scroll past it*, for the rule and the ten surfaces it reaches. Nothing about the gesture below moved.

**The whole chip is the target, where the grip alone used to be.** That is the other half of the report and the half no gesture rule addresses: a 9×13px glyph is a fifth the width of a fingertip, and stretching its box to 25×28 — which the `pan-y` build did — is still under half of what a touch target should be. A chip is 51–78px wide and 28 tall, and with no `touch-action` on it there is nothing to be snapped *into* that would do the wrong thing. The grip stays as the **mark** that says a column can be moved, and as a mouse's cue that it can also be dragged; it starts nothing of its own.

**It is a real `<button>`**, so the press is the browser's own — which is what makes the touch half robust rather than clever. Nothing is bound for a finger at all: with no listener and no `touch-action`, a swipe that starts on a chip is the scroller's without anything here deciding that it is, and a press that stays put arrives as an ordinary `click`. The browser separates the two, which it is better at than any slop and axis test. It also buys the keyboard and a screen reader for nothing: a picked-up chip carries `aria-pressed`, the hint line is the live region that names it, and **ArrowLeft/ArrowRight move it one place at a time** while it is held (checked: three presses take a chip from 5 to 2).

**That hint line moved the chips under the reader's finger, and its height is now reserved by the worst case laying itself out.** The two strings are different lengths — `Press a column to pick it up, then press where it should go. The table reads left to right in this order.` against `Moving G — press a column to drop it there, or Esc to cancel.` — so they wrap to different numbers of rows, and the block below jumped by a line on the very press that picks a column up. Measured at 390 on both callers, resting → `Moving G`: the chips' top went **201.41 → 188.41px** and the first checkbox group's **511.41 → 498.41** on the board (443.41 → 430.41 on the Stats tab), which on a phone is the drop targets sliding 13px between the press that lifts a chip and the press that places it.

**A fixed height cannot answer it, which is where this parts from `--research-head-line`.** That reservation is one number because a sort arrow is one glyph; here the worst case is a function of the width. Measured in 2px steps from 300 to 720 with every label the two pickers hold: the resting string is **three rows below a 328px viewport, two to 584 and one above**, where the moving string is two below 414 and one above — so a fixed height would be three tiers on two font-derived breakpoints, and both constants go stale the moment the wording, the type scale or a column label changes, with nothing on screen to catch it. The app's own answer when there is no one number is to measure rather than declare (`--chrome-h`, `--clip-w`, `--roll-font`), and this is the CSS-only form of it: the live text and an invisible copy of the resting sentence share one grid cell (`display: grid`, `grid-area: 1 / 1`, `visibility: hidden` on the ghost), so the box is as tall as the taller of the two at whatever width the dialog happens to be. The ghost is the *resting* string because it is the longer — 107 characters against 66 with the widest label the vocabulary holds (`Whiff%`, `Sprint`, `F-Str%`, `Chase%`, all six) — and over that same sweep it is never the shorter. `RESTING_HINT` is one constant written once, so the reservation cannot become a stale copy of the sentence it reserves for.

**Measured after, on both callers.** The chip block's top and the first group's are **identical to the pixel in all three states** — resting, a one-character label, and the widest one — at 1200×900 (209 / 349 on the board, 288 / 394 on the Stats tab) and at 390×844 (201.41 / 511.41 and 201.41 / 443.41), where before only the widest label held still. The box's own height never moved either way, being capped. Swept at **320 / 340 / 375 / 390 / 480 / 560 / 640** the chips' top is stable across all three states at every one, with the reserved box reading 39px at 320, 26 to 560 and 13 at 640 while the live line inside it reads 39/26/26, 26/13/26 and 13/13/13 — i.e. the reservation tracks the width and the 320px three-row case, which any of the three fixed tiers would have got wrong somewhere, falls out for nothing. `visibility: hidden` keeps the ghost out of the accessibility tree, so `aria-live="polite"` stays where it was and the sentence is exposed **once** (checked against the AX tree at both widths: one `StaticText`, not two). The gesture is untouched — a real touch tap picks `Δ1d` up and a second on `R` drops it there (`Δ1d Δ3d G R` → `Δ3d G R Δ1d`) — and Escape still cancels the pick-up first and closes the dialog second. Page and dialog overflow are 0 at both widths. Bundle: **456.51 → 456.63 KB** of JS (135.38 → 135.41 gzipped) and **105.18 → 105.30 KB** of CSS (18.81 → 18.84), nearly all of it the comments.

**Escape cancels the pick-up rather than closing the dialog**, which is the app's standing rule that one press undoes one thing. `Modal` answers the key on `window` in the bubble phase, so `ColumnOrder`'s listener is a **capture** one on the same object and stops the event there; a second press closes the dialog as it always did (checked, in that order). Pressing the picked-up chip again puts it back down.

**Two bugs in the mouse half were found by measuring it rather than by reading it**, and both are the kind that only appear once a press means something. `armDrag` called `e.preventDefault()` on `pointerdown` — which reads as the right thing, canceling the browser's own text drag, and **also suppresses the `click`**, so a bare mouse press on a chip did nothing at all. The native drag is stopped by `onDragStart` instead, and `user-select: none` on the block is what keeps a drag from painting a selection across it. And the flag that ignores the `click` a drag leaves behind was cleared *by the press that read it*, where a drag that actually moved a chip leaves its click on the row rather than on the chip — so the flag stayed set and swallowed the next genuine press. Measured: after seventeen drags, a click picked nothing up. It is cleared on the next `pointerdown` instead.

**A pick-up survives a reorder and not a change of membership**, which is one signature apart and load-bearing: every commit this block makes changes the *order*, so clearing the pick-up on the order signature drops the chip the reader is still holding — measured, the arrow keys moved it one place and then let go. A column ticked off, a board switch or a reset is a different list and there is nothing left to be holding, so that clears it.

**Auto-scroll while dragging** (`EDGE_ZONE` 56px, `MAX_SCROLL_STEP` 12, both smaller than the edit screen's 120/20 because those are measured against a whole viewport where this scroller is 620px of an 844px phone) serves the **mouse** now, and is still warranted: a mouse drag's drop target is whatever `elementFromPoint` finds under the pointer, so a chip that has scrolled out of the box is otherwise unreachable, and once a drag is under way the browser will not scroll for us. The block genuinely outgrows the scroller — with every column on it is **266px of a 620px port at 390×844 and 300px of a 289px port at 390×430**. It scrolls the **dialog's own scroller** rather than the window (which `useLockBodyScroll` has pinned), found by walking up for the nearest scrolling ancestor rather than naming `.app-dialog-body`, so the block would work in whatever box held it; each step re-runs the hit test, which is what lets a stationary pointer keep picking up the chips sliding past it. A press-and-press needs none of it: the reader scrolls the picker with a finger, which is now unobstructed, and then presses.

**Driven in a browser at 390×844 and 390×430 with touch emulation on, and again with a mouse at 1200×800.** Touch: **30 of 30** presses landed the chip where it was asked to go at both sizes — the same thirty pairs, on the same six-row board, that dragging landed **22 of 30** at either size (and 10 of 30 and 18 of 30 on the seven-row one) — with every cross-row and up-a-row pair among them. The dead-zone grid stays where the `pan-y` build put it: **0 of 450** vertical flicks at 390×844 and **0 of 465** at 390×430 moved the dialog 0px, and a vertical swipe from the middle of a chip scrolls the picker (163px) and reorders nothing. A press on the grip glyph picks up exactly as a press on the chip does; a horizontal swipe from a chip does nothing, a swipe not being a press; pressing the picked chip again cancels; Escape cancels then closes. With a mouse: **16 of 16** drags from the grip land where they were dragged in every direction, a drag from the chip's body lands too, a bare click picks up and a second click places, a drag leaves no pick-up behind, the edge auto-scroll runs the picker's whole range (**0 → 495px** at 390×430 and back to 0), and a drag released out on the backdrop leaves the dialog open — the `pointerdown` rule `useDismissable` follows being what protects that.

The bundle went **436.13 → 437.16 KB** of JS (129.23 → 129.64 gzipped) and **96.75 → 97.16 KB** of CSS (17.33 → 17.39 gzipped) — a kilobyte for a gesture that works, most of it the comments explaining why the two before it didn't.

A drag's order is held locally while it is live and **committed on release**, unlike the editor's row list which moves as it goes — the difference is what is downstream, twenty rows there against six hundred players by twenty-five columns here. A press commits once, on the press that places. What the row hands back is **threaded through the saved list rather than replacing it** (`reorderColumns`): a saved list can name a column this board cannot resolve right now — `rosterPct` before the ESPN status lands, a trend window with no baseline — and those never reach the order row, so committing it as it comes would drop them from the reader's preference outright (checked: a `cols=` naming `rosterTrend30` on an install with no 30-day baseline still carries it after a press-and-press reorder).
  - **Which columns show is the user's** (`DEFAULT_OFF`, the Columns dialog). The two boards carry 39 and 44 columns between them, which is the point of a research table and a poor thing to open on, so the default is the box-score line plus the headline Statcast numbers — 23 for batters, 25 for pitchers — and the rest are a click away. The set is expressed as what's **off** rather than what's on, so a column added later shows up by default instead of being invisible until someone remembers to list it: the safe direction for this to fail in. On the pitching board SV and HLD are off *because* SVHD is on. The picker groups the columns by the `group` marker on the **first column of each run** (`columnGroups` carries it forward — a group per column would be forty lines of the same string, and the arrays are already written in those runs), and each run has an All/None, since checking off fifteen Statcast boxes by hand is how a picker gets abandoned. Each chip is a real `<label>` around a visually-hidden `<input type=checkbox>`, so it keeps keyboard and screen-reader behavior while reading as a chip; the focus ring is drawn by the label via `:has(input:focus-visible)`, focus landing on the input. **The last column can't be turned off** — an empty table has no headers left to click, so the only way back would be the Reset button.
    - Two things follow from a column being hidden rather than removed. **A filter on a hidden column still applies** and its chip still says so ("300+ PA" without a PA column is a legitimate thing to want), which is why the filter builder's select lists *every* column and not just the shown ones. But **the sort falls back** to the board's default (`activeSortKey`) when its column goes: a table ordered by something you can neither see nor reverse is a trap, there being no header left to click.
    - **Saved per user**, server-side, on the same item as their roster (see **Roster, watchlist, users and auth**). A reset stores the *absence* of an entry rather than a copy of today's default list, so a user who resets goes on following the defaults as they change instead of being pinned to whatever they were that day. The write is **debounced 600ms**: turning a group on is one intent and a dozen state changes, and each would otherwise be its own read/modify/write against the user's item (six rapid toggles send one PUT). The route validates the *shape* of a key (short, alphanumeric, ≤100 of them) and not which keys exist — the column vocabulary is the client's, and the client drops what it doesn't recognize on the way back in. A failed load is logged, never bannered: the board opens on its defaults, which is exactly what a user with nothing saved sees.
    - **A `cols=` link beats saved preferences**, for the board `pos=` names — someone handed a link should see what it says, and the saved set is not silently overwritten by opening it. `urlColumns` is what the prefs response checks itself against when it lands a moment later; it also skips any board the user has already touched in the meantime.
    - Persisted as **`cols=`**, and only for the board on screen — `pos=` is what says which board it describes. Written only once the selection differs from that board's defaults (`isDefaultColumns`), or every link would carry twenty stat keys to say "the usual". `toColumnKeys` narrows what comes back: unknown keys are dropped (an older build's link, or one board's keys pasted onto the other) and a list with nothing valid left falls back to the defaults rather than an empty table. The visible set is held as a `Set` and the table renders `allColumns.filter(...)`, so a hand-edited `cols=` can reorder nothing. `App.tsx` keeps the selection **per board** (`researchCols`), so customising batters and switching to pitchers leaves each with its own.
  - **The time-span tabs** (`Season · 7d · 15d · 30d · 60d`) sit in the control bar, after the position row. They were briefly inside the Filters panel and came out: a window decides *which games every number on the board is drawn from*, which is too large a thing to keep behind a disclosure — and being always visible they need no chip to report themselves, so the chip and the `.on` they used to put on the Filters button both went with the move. The control is the app's segmented switch, **folded into `.view-switch`/`.view-tab`'s selector lists** rather than restyled to resemble one, and `flex: none` so it travels intact when the bar wraps. It is the one page control the URL carries (`win=`, the default season omitted), because it decides which games the numbers come from rather than how they are presented, so a link without it opens a different table; and it is lifted to App and shared across both boards, "the last 30 days" meaning the same thing on either. **On a phone it is a dropdown** (`.research-window-select`) — see **the bar's three tab groups on a phone** below, which it is one of. It keeps the tabs' short labels, a native select being as wide as its widest option and "Last 60 days" costing back the width the swap is there to save.
  - **On a phone two of the bar's tab groups are dropdowns** — the time span and the eleven positions (`.research-window-select`, `.research-pos-select`). The third was the scope switch, and its dropdown went with it: a `<select>` is a single-select by construction, which is the one thing the three include buttons are not, so they stay buttons at every width and go to their short labels (`Mine · Others · Free`, or `Mine · Rest` with no league) instead — and, below 480, to the app's own marks for the sets they select (see the entry two below this one). Each is rendered alongside its pill row and swapped by the 640px media query, the pattern the header's date presets already use, and all three are **folded into one shared `<select>` rule** (headed by `.research-window-select`, and by `.date-presets-select` until the date presets went with the preset row) rather than restyled to match, so every "pills on a desktop, dropdown on a phone" control in the app is one control by construction. Three rows of pills — one of them scrolling sideways — were 124px of control set before the first name on the one page where every pixel of height is a row of the table; the dropdowns and the buttons take **two rows, 80px at 390px and wider** (measured 320–1000px: no horizontal overflow at any width, and at 375px and below the bar is back to three rows, which is what it was before, but with nothing left to swipe sideways). The three sit together rather than the window one riding at the head of the buttons as it used to: three dropdowns and four buttons were never going to be one line, and the three belong together — they name **which slice of the league the table is**, where the buttons open panels. The **position dropdown groups its options** (`POSITION_GROUPS` — Board / Batting / Pitching): the pills' labels are two characters wide because eleven of them share a phone's width, and "SS" alone in a closed box says less than it does in a row with C and 1B beside it. Short headings, since an optgroup label counts toward a select's width the same way an option does. Each hide rule is **two classes deep** (`.research-bar .research-positions`, …), because the shared `.view-switch` rule sets `display: inline-flex` and comes later in the file — the same reason `.date-row .date-presets` is written that way — and without the extra specificity a row and its dropdown would both be on screen at once.
  - **On a phone the four disclosure buttons go to their icons alone** (`.research-toggle-label`, hidden under `@media (max-width: 640px)`). The bar carries three tab groups and four buttons and was taking five lines before the first name; the words are about half the width of each button and the icon is the part you aim at. The label is **visually** hidden rather than removed, so it still names the button for a screen reader — `display: none` would leave four buttons whose only content is an `aria-hidden` glyph — and each carries a `title` for a pointer. The count badges stay, being the compact half of the label and the part that says what the panel holds.
  - **And below 480px the three include buttons go to their marks**, which this passage used to say could not be done. What it said was that they *keep their words* there, because "a star means watchlist to most people but **no glyph means other rosters**" — and that was true of the app when it was written and is not true of the app now. Two of the three sets already have a mark, drawn on the very rows the buttons select: the **accent baseball** for a player on your roster (`BaseballMark`, also the fantasy button and the `On roster` badge) and the **padlock** for one somebody else in the league is holding (`LockMark`, added later — see **ESPN fantasy league**). Reusing those is the whole point rather than a saving: the control and the thing it selects end up in one vocabulary, so a lit lock over a column of locked rows explains itself, where a third and fourth glyph invented for this row would have to be learned.

    **Free agency is the set with no mark, and it stays text.** `FA` sits in the same slot the glyphs occupy so the three buttons are one 36px square each, which is what makes the run read as a run. The alternative — inventing a glyph for "available" — is the thing the old paragraph was right to refuse; two characters that everyone in fantasy baseball already reads are not.

    **And `FA` would be a lie in the two-button state**, which is the case worth checking before shipping any of this. With no league connected the middle button is not offered at all (there is no ownership to read) and the third is labeled **`Everyone Else`**, which is not free agency — so its code is **`Rest`**, the short label it already carries one tier up, and the honesty rule that governs the wording governs the mark. `IncludeCode` takes the wording's own `code`, so the solo wording carries its own and the two can never part. Measured on a stubbed unconnected account: two 36px buttons, the baseball and `Rest`, no lock anywhere, and the accessible names `My Roster` and `Everyone Else`.

    **480 rather than 640, and the number is measured rather than matched to the block above.** The marks only *pay* below about 440: measured at 480, 520, 560, 600 and 640 with the icons forced on, the bar wraps to exactly the rows it wraps to with the words (3 / 2 / 2 / 2 / 2, chrome 207 / 159 / 159 / 159 / 159), so replacing them there would spend legibility and buy nothing. Between 481 and 640 there is room for `Mine · Others · Free` and three small glyphs would be the harder read; below it there is not. It is also the app's other established narrow threshold, `.player-card`'s own phone layout turning at the same width.

    **What it buys is a row, and only at the widths where a row was there to buy.** The group is **169.81px → 116** (three 36px squares 4px apart, against 8px of padding and a 6px gap around three short labels), and the bar goes **four rows to three at 390** — chrome **255px → 207**, which is 48px, more than a row of the table. Everything else is unchanged: 4 rows at 320, 360 and 375, 3 at 430, 2 at 640, 3 at 900, 2 at 1200 and 1 at 1920, with **no horizontal overflow of the page body at any of them**. On a disconnected account the same swap takes the group **102.2 → 76** and wins the row at **360** instead (4 → 3, chrome 303 → 255), the two-button group being narrower to begin with.

    **The 4px gap is what buys the row, and the margin is under two pixels.** At 390 the first line has 346px inside the app's gutters and `Roster · Feed · Research` takes 216.1 of it, so the include group has to come in under 117.9 to join it: at a 6px gap it is 120 and misses by two, and at 4px it is 116 and lands with **1.9px** to spare. That is thinner than this bar's usual margins and is taken deliberately, because the failure mode is benign — miss it and the group wraps to the next line exactly as it did before — where a two-pixel margin somewhere an overflow was possible would not be worth taking. Three squares 4px apart also read more plainly as one run than as three buttons, which is what they are.

    **The label goes visually hidden rather than away**, the rule this list's own first entry sets: a button whose only content is an `aria-hidden` mark has no accessible name at all. It is the **full** label rather than the abbreviation — with nothing on screen to read there is no reason to hand a screen reader the terser of the two — and the mark is `aria-hidden` wholesale, the glyphs carrying no words and `FA` being a shorthand for a label already there. **`display` has to be restated in that rule and the omission was a real bug**, found by reading the accessibility tree rather than the stylesheet: the 640px block above has already set `display: none` on that span, and a visually-hidden box that is still `none` is *gone*, so each button fell back to naming itself by its `title` — which browsers do only when there is nothing else. Measured before and after: `My Roster` / `Other Rosters` / `Free Agents` at 390 and 480, `Mine` / `Others` / `Free` at 481 and 640, `My Roster` / … at 900, with `aria-pressed` intact throughout and the 1px absolute span costing the group not one pixel of width.

    **And the glyph carries `flex: none`**, which is the trap `.research-toggle svg`'s own rule already documents: an `<svg>` in a flex row is a flex item and its `width` is a basis it will shrink below the moment the line is tight — on a button that is nothing *but* the glyph, that is the whole button. Measured after: 17px rendered inside a 36px square at every width the marks are drawn at.

    **Bundle: 451.11 → 451.50 KB of JS** (133.50 → 133.60 gzipped) and **102.73 → 103.24 KB of CSS** (18.35 → 18.41 gzipped) — 0.4KB and 0.5KB raw, a tenth of a kilobyte each over the wire, and the CSS is nearly all the paragraphs above restated where the rules are. Nothing was drawn that the app did not already have: `LockGlyph` is the path `LockMark` was already wrapping, and `BaseballMark` was imported by this file before any of this for the roster mark on a row.
  - **`Qualified` is gone**, and it was a plain toggle in that run, sitting between Filters and Columns, that kept only the players with a full season's worth of playing time behind them. It went because it was the wrong shape for the question the board is read with. It was a **single hard threshold with an invisible number**: on a `7d` window it asked for a week's worth of plate appearances against a bar the reader could not see and could not move, where the panel two buttons along says `PA ≥ 40` in the reader's own terms, states itself as a chip, and can be raised or dropped a row at a time. Anything Qualified could do the filter builder does more honestly, and the one thing it did that the builder cannot — apply a different rule to a starter and a reliever without saying so — is the part that made a short table hard to read rather than easy. So the button, its badge in the expanded-table chrome, its chip in the filters row and its place in `Clear all` all go, and the tools group is four buttons rather than five (which is what the `.research-toggle-label` phone rule and the wrap measurements above have always described — they were written for four and had been running one over ever since the watchlist button joined the run). **Measured on the same page and the same league before and after**, the group goes **289px → 240** on a phone and **581 → 468** on a desktop, and the bar goes rows 3 / 2 / 3 / 2 / **2 → 1** and chrome 207 / 159 / 207 / 161 / **161 → 115** at 390 / 640 / 900 / 1200 / 1920 — i.e. everything below 1920 is unchanged and 1920 gets back the row the three include buttons cost it. 320 and 375 are four rows either way, and no width overflows (measured 320, 375, 390, 480, 640, 900, 1200, 1920). **Its filters-row chip is why the chips paragraph reads the way it does**: Qualified was the one filter that used to leave no trace there, which is the argument that put it in the row, and with it gone that row is the stat thresholds and nothing else — so `Clear all` clears exactly those. What survived the toggle was **server-side and read by nobody**: `ResearchRow.qualified`, `qualifies()` and the standings read behind `getTeamGames()` went on being computed in `research.ts` and shipped on every row of the blob. That was deliberate rather than an oversight, and it has been vindicated — **the flag has a reader again**, and it is the percentile scale (`Ranks`, below). What it is *not* is this toggle coming back: nothing is filtered out of the board, and the rule decides only whose values build a yardstick. Its figures moved with the job — the qualifier is Savant's now rather than MLB's — so the three-rules passage in **Data sources** has been rewritten rather than merely re-pointed.
  - **`Ranks` draws a percentile under every value** (`components/columnRanks.tsx`, the toggle last in the tools run). A number on a research table says what a player did and not whether it is any good — `.265` is a fine batting average, a poor xwOBA and an extraordinary barrel rate — and the badge answers that in one figure per cell: **0–100, and 100 is always the good end**. The rule, the population and the badge itself live in that one file, which both this board and the player page's Stats tab read; see **The Stats tab** in the player-page notes for how that tab reaches the same population from a page which has none of its own.

    **The population is the *qualified* players on that board for that kind and window**, before any pill or button — `rankPopulation(boardPopulation(rows, kind))`, which is what `boardRows` narrows and is a stated fraction of the `M` in the count line's "455 of 622 batters" with all three include buttons on. **The board as the reader has narrowed it** was refused and stays refused: it moves under the reader, so a tap on `SS` would rewrite every badge on the table and a 62 becomes an 88 with nothing on screen saying the yardstick changed, each being a different claim ("88th of the 103 shortstops" against "62nd of the 622 batters") — and the Stats tab has no pills at all, so it is a population the two surfaces could never agree on. Checked, and still true: taking the include buttons from all three down to `My Roster` alone, and adding a `PA ≥ 300` filter, leaves every badge on the surviving rows byte-identical.

    **What changed is the third candidate.** This used to rank against *everyone* on the board, and refused a qualified subset on the grounds that "`ResearchRow.qualified` now has no reader on either side of the wire, so reviving it to gate a badge would put a rule the reader cannot see in the middle of one they can". The first half was a fact about the code rather than an argument, and the second half is answered by not gating anything: **nobody is dropped and nobody is blanked** — a player short of the bar is placed on the qualified players' scale and marked, and the rule is printed in the badge's own tooltip, in the toggle's, and in the expanded table's chrome.

    **And ranking against everyone was wrong by a large margin, which is the measurement that forced it.** A leaderboard has a qualifier because a man with forty plate appearances and a fluke .450 xwOBA is otherwise a rung on the ladder every real hitter is measured against. Measured on the live season boards, badge for badge, against the same rows under both populations: a qualified batter's badge moves by a **mean of 16.8 points and as much as 27** (634 batters with an xwOBA cut to 247), and a qualified pitcher's by a mean of 8.6 and as much as 18 (763 to 353). **Masyn Winn's xwOBA badge reads 49 against everyone and 23 against the qualified**, and Savant says 22. **Keibert Ruiz reads 33 and 6**, and Savant says 6. Yordan Alvarez goes 99 → 100 against Savant's 100.

    **The bar is Savant's, measured off Savant, not recalled** — 2.1 plate appearances per team game for a batter and 1.25 batters faced for a pitcher, computed server-side against his own club's games in the span (`ResearchRow.qualified`; see **Data sources** for the reproduction and the two boundary players that pin the rounding). The client could not compute it: it has no game count for anybody's team.

    **Checked against Savant's own percentile export, column by column**, which is the test that the *population* is right rather than merely plausible: over the 246 qualified batters, our badge matches Savant's published percentile within one point on **100% of xSLG, whiff%, barrel% and hard-hit%**, 97% of xwOBA (max 2) and 88% of xBA (max 3); over 353 pitchers, 97% of xwOBA within one (max 2). The residual point is rounding — the board carries the stat to three decimals and ties share the middle of their run where Savant counts the share strictly beaten — and it is two orders below the 16.8-point error the old population carried.

    **A board on which nobody qualifies keeps its badges**, ranked against the field, with every tooltip saying "of the N batters" rather than "of the N qualified batters". It is the standing rule that a failure costs its own column and never the request, applied to the one input that can go empty; it is not reachable on any window the board offers (the shortest is 7 days, where the measured bar is 12 to 14 PA and 271 of 406 batters clear it), but a table that silently loses every badge is the failure this app least wants.

    **What it is ranked against is stated on the badge and on the toggle, and so is the rule that made it.** Every badge's `title` names the column, the ordinal, the population and its size — `Home runs: 100th percentile of the 247 qualified batters with a figure on the Season board. 100 is best.` — and the toggle's says `the qualified players on the whole Season board (247 of 635 batters, Savant's bar of 2.1 plate appearances per team game), whatever you have narrowed it to`, with `1.25 batters faced` on the other board (354 of 764). A reader on a **ringed** badge gets one sentence more, naming the bar and what the ring means. That is the whole answer to the objection that retired the `Qualified` toggle: a rule the reader can read is not a rule the reader cannot see. **`n` is per column**, which is why it is stated rather than implied: a batting board carries a PA for everybody and an exit velocity only for whoever put a ball in play, and **a null is out of the denominator rather than at the bottom of it** — a player Savant has no barrel rate for has not got a bad barrel rate, which is the reasoning the sort already applies when it sends blanks to the bottom in both directions. So the ERA population is 751 of the 752 pitchers and FIP's is 713, and each badge says so.

    **Orientation is `Column.ascFirst` read back rather than a second declaration of it.** A column whose good end is the small one — ERA, WHIP, a batter's K, most of the pitching board's Statcast group — is ranked from that end up and its tooltip says so in a sentence; everything else from the large end up. That is the only thing that makes a badge on forty columns worth having: the reader never has to remember per-column polarity to read a row across. **Ties share the middle of their run** rather than the top of it, which a counting column forces: two hundred batters have hit no home runs, and giving each of them the percentile of the *best* nought would put a man with none ahead of a third of the league. Driven in a browser against an independent computation over the same rows: the HR leaders read **100** and the strikeout leaders **100**, while the lowest K% reads **99** and a 0.00 ERA **98**, both being the middle of a large tie at the good end.

    **Derived columns are ranked like any other**, and that is the whole reason the rule lives in the client. BB%, K%, K-BB%, ISO, PA/HR, SB%, K/BB, SVHD and Str% are computed in `Column.value` and exist nowhere on `ResearchRow`, so a server-side ranking could only ever reach the raw half of the board and would silently leave the rest unbadged. Spot-checked against a hand-written implementation over the same 628 rows: Salvador Perez's `K% 19.9% → 68`, `BB% 3.8% → 16`, `ISO .153 → 61` and `PA/HR 29.6 → 63` agree exactly, as do Chris Sale's `FIP 2.47 → 95` and `K/BB 5.39 → 97`.

    **Four columns get no badge because they have no good end**, and the vocabulary already says which by declaring no `ascFirst` on **either** board: launch angle and the GB/LD/FB split are "a profile, not a grade", and a percentile of a profile would be a claim that more fly balls is better than fewer. `Opp` holds words. And the **Fantasy group** — `Ros%` and its five trend columns — is a fact about a *market* rather than about a player: rostered in more leagues than 94% of batters is not a stat, and "rose faster than 94% of the league this week" is news rather than merit. Those are exactly the seven columns the Stats tab already cuts, plus the four profile ones, so the rule reads the same on both surfaces. The keys are a `Set` (`NO_GOOD_END`) rather than a flag on each column literal, on the precedent `DEFAULT_OFF` sets — one block read at a glance, and **a column added later is rankable by default**, which is the same safe direction that rule fails in. Measured over 200 rows: `LA`, `GB%`, `LD%`, `FB%`, `Ros%` and `Opp` carry **0 badges of 14 rows each** where `G`, `PA`, `HR`, `Sprint` and `OPS` carry 14 of 14.

    **A dashed cell carries no badge either**, which is the one case that had to be found by looking rather than by reasoning. `credit()` — the formatter W, L, SV, HLD and SVHD share — prints a dash where the value is nought, precisely because "a column of noughts reads as data when it isn't"; a percentile under that dash put the noise straight back, five hundred relievers reading `—` with a `25` beneath it. So `DASHES_AT_ZERO` drops the badge on those five at zero, while the nought stays in the column's population — the men who *do* have saves are still ranked against it. Every other formatter dashes only a genuine null, which `RankScale.of` already answers with no badge at all. Scanned over the whole league with the badges on: **487 dashed cells on the batting board and 1,393 on the pitching board, and not one of them badged.**

    **The badge is a second line rather than something beside the value**, and the width is why. This board carries 23 to 44 columns, already overflows a 1920px screen, and keeps its 13px gutter where the two other wide tables grew theirs on exactly this arithmetic — "a pixel a side is 54px of scroll on a 27-column board" — so an inline badge at twenty-odd pixels a cell is five hundred across a default board and two more stat columns off the right edge of a phone. Under the value it costs the table almost nothing across and **nothing down at all**: the row is 58px, set by the 42px headshot (6 + 46 + 6 against a text cell's 12 + content + 12), and the `Opp` cell already draws two lines inside the 34px that leaves. It is **monochrome** in `--faint`, the tone the board already gives the quieter of two lines in a cell (`.research-opp-sp`), because this table's standing rule is that "the stat columns are monochrome … color is reserved for *state*" — a heat scale would be a second color system beside the live inning, the postponement and the trend. The rule is scoped to `.research-table td .col-rank` so it outranks the **sorted** column's accent: checked, a badge inside a cell computing `rgb(56, 189, 248)` computes `rgb(92, 111, 151)`.

    **A badge on a player outside the population wears a dashed ring**, and the whole of the argument is that this is *not* a second meaning for a broken border. The app's ladder is solid = measured, broken = ours, and the percentile card one tab over already draws a dashed ring on **exactly these men**: Savant publishes no `percent_rank_` for a player under its bar, so `percentiles.ts` ranks him against the qualified distribution itself and marks the bar `estimated`, which the card draws as `.pct-bubble--est`. Driven and counted on the live app: an unqualified batter's card (Aaron Judge, 261 PA) draws **32 of its 39 bubbles ringed**, where a qualified one's (Yordan Alvarez) draws 4 of 41 — the four being rows Savant ranks for nobody. Same set of players, same sentence — *the league publishes no standing for this man, so this placement is ours* — so the board says it the same way, and the two screens now agree mark for mark about the same player.

    **What a badge that was both projected and unqualified would draw** was settled before the ring went on rather than after. Neither surface that draws a `.col-rank` percentile has a projected reading: the board and the Stats tab hold measured stats only, and the League Rankings table's `.col-rank` is a rank of *teams*, which the modifier is scoped away from. If one ever arrives, the two claims are the same claim in different words, and a second broken outline over the first would be two ways of saying one thing — the argument that took the third mark off a projected start row. The chrome would say `Projected` once for the whole table, as `.mup-card.mup-proj` does, and the ring would keep its single meaning. *(One has arrived — see* The projected reading *below — and it settled the question by not drawing a badge at all: `Ranks` comes off the bar under the lens, along with `Columns` and the window tabs, because nobody* qualifies *for a week nobody has played and there is no population to rank an estimate within. The paragraph above is left as written, this file's rule for its own superseded reasoning; what it got right is that the two marks are one claim, and what the answer turned out to be is that the projected surface simply has no percentile.)*

    **`--faint`, not `--text`.** The percentile card's ring is `--text` because it sits on a colored bubble; here the badge *is* `--faint`, the tone this table gives the quieter of two lines in a cell, and a ring louder than the number it encloses would invert the one hierarchy the cell has. **An `outline`, not a `border`**, for the reason `.pct-bubble--est` gives and `.sched-vs-estimated` gives: a border is part of the box, so a ring that comes and goes down a column would change a row's height and a table's width by which players happen to qualify. Every `.col-rank` on these two tables also takes `width: fit-content` and an auto start margin, so the box hugs its digits whether or not a ring is drawn on it — declared for all of them rather than for the ringed ones, which is *reserve the box, don't move the page*. **Measured on the same rows with the ring toggled in the DOM at 390 / 1200 / 1920**: table width `1583.25 / 1998.70 / 1998.70` with it and without it, every row 58.00px either way, each badge's box 7.31px wide and its right edge on the same hundredth, and page overflow 0. The `fit-content` itself moved nothing: a searched row is 1910.73 / 1904.44 / 1856.30 / 1921.63px for Winn / Ruiz / Judge / Alvarez before and after.

    **Measured, badges off → on, at 390 / 1200 / 1920 with the pane scrolled to its far right and down.** The batting table is **2054.64 → 2054.64 at 390** and **2539.83 → 2539.83 at 1920** — not a pixel — and the pitching table **1665.86 → 1667.33 at 390** and 2098.41 → 2098.41 at 1920, the 1.47px being one column whose two-digit badge is wider than its own single digit. Row height is **58.00px** either way, the header row 51.00, **rows entirely inside the pane are identical** (9 / 11 / 14 at the three widths), the headshot column pins at **0** and the name column at **68** from 820px up, `--table-bleed` is −22px, and **the page body overflows by 0 at every width in both states**. Everything else was driven and is unchanged: sorting still resets the pane to the top, the stat filters still narrow the rows without touching a badge, the Columns dialog still ticks a column into its canonical place (`ISO` beside `OPS`, badges 3,140 → 3,768) and closes cleanly, and the **full-page box** still expands with `--table-bleed: 12px`, the headshot pinned at 0 and a `Ranks` badge in `.expanded-chrome` beside the position, the include sets, the window and the filters — which it needs, since expanded there is no toggle on screen to explain a second number in every cell.

    **What it costs the bar is one row at 1920 and nothing anywhere else**, measured by hiding the button and re-reading the chrome at eight widths: **115 → 161px at 1920** (the tools group 467.39 → 561.73), and **identical at 320, 375, 390, 480, 640, 900 and 1200** (309 / 303 / 207 / 207 / 159 / 207 / 161px), with no horizontal overflow at any of them. That is the same 46px the three include buttons cost that width and that dropping `Qualified` won back, spent again on a control that adds a reading to every number on the table. The label is **`Ranks` rather than `Percentiles`** for that budget — the longer word takes the group past what 1920 can hold — with the long form in the tooltip; below 640 it drops to the glyph with the run's other four, and the glyph is three rising bars, which is a rank drawn as one.

    **Saved per user and deliberately not in the URL** (`UserPrefs.statRanks`, `PUT /api/prefs/stat-ranks`), and the line is worth drawing carefully because `cols=` *is* in the URL and is also presentation. The difference is what the two change: a column list decides **which numbers are on the page**, so a link that leaves it out describes a different table, where this leaves every number exactly where it was and adds a second reading of each — a fact about the reader rather than about the board, which is the line `muteAudio` is on. One flag serves both tables, since they are one column vocabulary and this is a habit of reading rather than a setting on either of them.

    **Nothing server-side computes a percentile, and `ResearchRow` still gains no field for one** — the badges are computed in the client, from the board's own rows, which is what lets a derived column like BB% or K-BB% carry one at all. **But a cache key did move.** `research.ts` now decides *who is in the population*, on Savant's rule rather than MLB's, and the blob went `-v10` → `-v11` for it: `qualified` is the same boolean it always was and has begun both to mean something else and to be read, and a v10 blob would deserialize perfectly and rank the whole league against the wrong population for six hours after a deploy. The version rule's real test is "would a stored blob serve the wrong thing", and that is the reading. The other thing on the server is one boolean on the user's own record (`UserPrefs.statRanks`), which is not a `storage.ts` blob at all.

  - **The buttons are one flex item** (`.research-tools`, `flex: none`), not five loose ones in the row. As separate children they wrapped one at a time, so on a wide screen whichever one still fitted was stranded at the end of the position row with the other three on the line below — a lone Search up there. The group moves to the next line whole or not at all, and the run stays legible as the set it is. It may wrap *within itself* on a very narrow screen, which is the one place a second line of buttons is the lesser evil. Measured 360–1600px: they are on one row at every width, and the position row still doesn't scroll above 390. **The player page's Stats tab is folded onto this rule** for everything except that `flex: none`, which is split out under this run's own name: that caption row draws the same shared `ColumnsButton` and `RanksButton` and had no gap at all, and the 8px between two `.research-toggle`s is worth having one definition of — see **the player page**, *the space between the two buttons is the board's*. Nothing here moved for it (checked: 8.00px between all five buttons at 1200 and 390, chrome 161px and 207px, page overflow 0, identical before and after).

### The Schedule view on the board

**The days ahead in place of the stat columns, and it is the same mode the summary table takes** — one shared module, one shared control, one shared cell. The whole of the design (why it is a mode rather than a page, why the span is its own rather than the calendar's, what `GS` counts, and every number behind it) is in **Client — the Roster view**, *The Schedule view: the days ahead, in place of the stats*. What is the board's own is set out here.

**`GS` counted announcements alone when that passage was written and now counts the turns his rotation slot puts him in as well**, in three marked tiers — filled where his club has named him, outlined off his own measured pace, dashed off his club's rotation. That matters more here than on the roster table, and for the reason this board exists: it is the whole league rather than twelve men, so *which free-agent starter gets two turns next matchup* is a question only this table can ask, and with announcements alone it could not be asked at all — MLB names probables about three days out, so `GS ≥ 2` fired for nobody. Measured on the live SP board over 14 days: **37 announced, 57 projected and 5 estimated** chips over 279 rows, and sorting by `GS` puts the two-turn rows on top — every one of them an announced turn beside a projected one. The whole of the argument, and what the projection was measured against, is in **Client — the Roster view**.

**And a cell names the man the other club is throwing**, announced where a club
has named him and projected off a rotation slot where it has not — the same three
tiers `GS` is drawn in, and the same shared `ScheduleCell`, so a day read here and
the same day read on the roster table cannot say two things. The design is in
**Client — the Roster view**, *And the cell names the man the other club is
throwing*; what is the board's own is that **width is free here and height is
not**. This board overflows a 1920px screen with a third of its columns showing —
the reason its gutter keeps the 13px the other two tables gave up — so it scrolls
sideways at every width and one more line in a day cell adds nothing a reader was
not already swiping through: **page-body overflow 0 at every width**, and
`board/batters · matchup` goes **586.19 → 797.92px with the row still 58px and the
rows on screen unchanged**. What costs a row a screen is a **pitcher's own start
day**, where his `SP` chip and the opposing starter make three lines rather than
two.

**And it is worth most here**, which is the argument the `GS` column above already
makes: this is the whole league rather than twelve men, so *who is my free-agent
pickup facing on Saturday* is a question only this table asks — and it could name
the club and not the arm.

**Why the board is what settled the mode-against-page argument.** This table's population is five controls deep — the three include buttons, the position pills, the window tabs, the search and the stat filters — and *a schedule of the shortstops nobody has rostered* is exactly the question a manager asks of it. A Schedule *page* would have to carry all five a second time or answer something narrower, so here it is a mode by force; and a feature drawn as a page on one table and a mode on the other is one thing wearing two shapes.

**The swap is one line and nothing downstream had to be told.** `columns` becomes `scheduleColumns(schedule, kind)`, built at runtime from the index for exactly the reason `opponentColumn(statuses)` is built from the statuses map: the array is a *shape*, and the data that fills it arrives when it arrives. Everything else on this page then works untouched — the sort, the count line, the pinned headshot and name, the sorted-column double-edge pin, the include buttons, the position pills, the search, the row identity and its two marks all read `visible`, and the only thing that changed is what is in it.

**`allColumns` stays the stat vocabulary underneath, and that is deliberate rather than incidental.** Two things still read it and must: the **column picker**, which is what the reader comes back to, and `columnsByKey`, which is what the **stat filters** are applied through. *"A filter on a hidden column still applies"* is this board's own rule, and a schedule of the batters with `PA ≥ 300` is precisely what a manager wants — so a `PA ≥ 300` chip goes on narrowing the rows while their PA is off screen, exactly as it does when the column is merely unticked. The sort resolves through the **drawn** columns first and `columnsByKey` second, which is what lets a day be sorted on at all and preserves the old behavior of ordering by a column the reader has unticked.

**A day column sorts as text**, the path `Opp` already takes — which on this column means *group the board by that day's game* — with the off days (`—`) going to the bottom in both directions exactly as a missing barrel rate does, and no entry in the filter builder, a threshold on a club abbreviation being nothing anyone can type.

**The mode leaves the sort alone, and it used to open on `G` descending.** That was argued as the half of the question the view is opened with, on a column that is always drawn (`GS` is the pitching board's alone), and what it actually did was reorder a table the reader had already ordered: sort by HR, press Schedule, and the home-run leaders are gone — replaced by whoever plays most, which is a change nobody asked the toggle for. The mode swaps the **columns** and nothing else, so the sort is whatever it was.

**Which took one line: `visibleKeys` is the days *plus* the stat vocabulary in this mode**, rather than the days alone. That set is what the sort's fallback tests against, and the fallback is right about the case it was written for — unticking the sorted column leaves the table ordered by something with no header left to click. A mode swap is not that: the way back to the column is one press of the lit toggle, and the comparator already resolves a key that is not drawn (`columnsByKey`, the same fallback a filter on a hidden column takes). `defaultSortKey` loses its schedule branch with it, so a reader who has never touched a header keeps the board's own default — Ros% with a league connected, PA or IP without one — rather than being moved onto G by a control they pressed to see fixtures.

**The board no longer scrolls back to the top on entering or leaving the mode**, which falls out of the same change: `activeSortKey` is what put the swap in the signature, and with the order unmoved the signature is unmoved. That is the right answer by that rule's own terms — the population is the same and the order is the same, so the row under your eye is still the row you were reading, which is exactly why the column picker was excluded from it too.

**Measured on the live board at 1400×900, before → after.** Sorted by HR (Casey Schmitt, Brooks Lee, Heriberto Hernández …) with the pane scrolled to 400, pressing Schedule gave **Blake Dunn, Blaze Jordan, Bryan Torres … with `G` marked `descending` and the pane back at 0**; it now gives **the same six names in the same order, `G` unsorted, and the pane still at 400**, with the HR sort still in force when the mode is pressed off. Bundle: **517.90 → 517.90 KB of JS** (152.95 → 152.96 gzipped), CSS unchanged.

**Two controls are not drawn while it is on, and two are.** **Columns** names the stat vocabulary and **Ranks** puts a percentile under each of them; neither is on screen in schedule mode, and a control whose whole subject has been swapped out is a setting lying about its own reach — the same test that keeps a menu entry off a page it cannot act on. **Search and Filters stay**, because they narrow *rows*. `ranks` is null in the mode whatever the saved toggle says, which it has to be twice over: a percentile under `@ LAD` is nothing, and a games-in-the-span count ranked against the league would be a percentile of a *fixture list* — the reason the Fantasy group is on `NO_GOOD_END`, a step further on.

**The board gets the two matchup spans too**, and the gate is a connected league rather than the fantasy roster — see **Client — the Roster view**, *Two spans, and which two depends on the league*, for the whole of that argument. What it buys here is the board's own question asked over a fantasy week: *which free agents play the most next matchup* is the pickup this table exists for, and it could not previously be asked. A connected league is offered those two **and not** `Next 7` / `Next 14`, which are the fallback — see that passage for why. Measured on the live league, the run is 228px and costs this bar **one row at 1200** (161 → 207px) and nothing at 640, 900, 1440 or 1920; below 640 it is the same `<select>` the roster row takes.

**Expanded, the span states itself in its own words** — `Schedule · this matchup` where a numeric span reads `Schedule · next 7 days`, beside the position, the include sets, the window and the filters — which is the rule that row exists for, arriving from the other direction: it is written for a table *narrowed* with nothing on screen to say why, and it applies just as squarely to one *widened* into the future. A badge reading `next matchup days` would be nonsense and one reading `7` over a fortnight of columns would be a lie, so it takes `spanLabel`'s own wording — the same words the pills carry. The toggle and its span tabs are behind the box, and a grid of dates whose headers read `Fri 8/15` still leaves "how far does this run" unanswered.

**The day header needed no room on this table**, which was the thing most likely to cost it: the sort button's own reserved line box (`--research-head-line`) already leaves the two-line header space, so the header row measures **51.00px in both modes** — unchanged — with the header sitting fully inside its cell and **12.3px of clearance above and 13.4 below** at 390 and at 1200 alike.

**The one thing it cost the bar is a wrap at 320 and 360.** The Schedule toggle is a sixth button in the tools run, which took that group from **289px to 333** against a 320px chrome and produced a **7px horizontal overflow of the page body** — the one thing this bar must never cause. `.research-tools` gives up its `flex: none` below **360px** so it can wrap **within itself**, which is the lesser evil that rule's own comment already names. Measured before → after at nine widths: overflow **7 → 0** at 320 and **0 everywhere else**; the chrome grows **303 → 347px at 320** and **255 → 299 at 360** (the run on two lines), and **375 through 1920 are byte-identical** — same group width, same number of rows in the bar.

**Measured at 320 / 390 / 640 / 1200 / 1920, both modes, pane scrolled to its far right and down.** Every invariant this board is measured against is unchanged: no horizontal overflow of the page body (**0** at every width in every mode), `--table-bleed` at 22px with the pane **0 from both edges**, rows **58.00px**, the header row **51.00**, the headshot column pinned at **0** and the name column at **68** from 820px up. The table *narrows*, this being the point — the batting board goes **1828.77 → 715.11 at 390** and **2273.36 → 1200 at 1200** over seven days, and **1119.11 / 1370.25** over fourteen — and rows on screen are **7 / 10 / 10 / 10 / 10** either way, save 390 over fourteen days where the span tabs take a row of chrome (10 → 9).

**Validated against MLB's own uncut payload through the rendered table**, which is the check that matters for a join: 275 rows of the `SP` board over seven days, **1,925 cell-days**, with each row's club resolved from the drawn cells alone and then every opponent, every home/away side, every game count and all **43** `SP` chips compared — **0 errors, 275 of 275 clubs resolved**. The route behind it matches the same payload 186 games of 186 on `gamePk`, date, both club ids, both probable ids and the postponed test, with 0 games on one side and not the other; see **Date handling and server routing**.

**The opponent is a press here too, and until now it was not.** `ScheduleCell` was built with an `onPreview` from the first commit and this board simply never handed it one — so `vs MIL` opened the game preview on the roster table's Schedule view and was plain text on the identical cell here, 626 of them on one screen. One cell drawing two behaviors is the thing this file and **Client — the Roster view** spend their length preventing, and the only reason for it was that the argument had been threaded on one side and not the other. It now opens the same dialog: the ballpark, the man the other club is throwing, and either his platoon split with this game's half marked or the lineup waiting for a starter. What it does *not* open is the club's page — the reversal **Client — the Roster view** records under *The opponent opens the game*, and it holds here for the same reason.

**And it is worth more here than there** — the third time this section makes that argument, after `GS` and after the opposing starter, and for the third time it is the population that makes it. The roster's fixture answers *do I start him Thursday*; this one answers *is this the week to pick him up*. A free-agent bat with two games against the club with the worst line against right-handers is exactly the case, and the board could already show the `2` and name the arm while having no way to say what either was worth.

**What the board cannot hand the dialog is the man.** A row here is a `ResearchRow` — a leaderboard line — and it carries neither his throwing hand nor his platoon split, both of which a `PlayerReport` arrives with and which is what every other caller passes. So `SchedulePreview` was narrowed to the three fields it actually reads (`PreviewSubject`: the id, the hand, the split), which every existing caller satisfies structurally and none of them had to be edited for. The **hand** comes off `HandednessContext`, which this board's own rows already read for the `L/R` under a name, so the dialog asks the app what it holds rather than fetching anything. The **split** is read on the press and held (`SplitsRead`, the `OppRead` twin), exactly as the opposing club's board beside it already is. Fetching 450 splits to make 450 cells pressable was the alternative and is not one.

**The dialog draws the wait, rather than the press holding the box shut until the read lands.** That is the discipline `OpponentRead` already sets for a pitcher's half — nothing under `WAIT_DELAY`, then the block wait, then a line with the retry a press has to offer — and it is *never over data* applied inside a dialog: the starter, the park and the projection note above the card are answered the instant the box opens and stay answered while the split arrives. The mark comes off on failure so `Try again` is a retry rather than a no-op, the same departure `useOpponentBoards` records and for the same reason (this is a press handler, not an effect with a cleanup that could discard the answer).

**The split cache is the board's, where the club cache is the open dialog's**, and the asymmetry is deliberate: a club's line is scoped to the man whose dialog asked for it (`useOpponentBoards`'s own contract, keyed on `fixture.row.id`), while a man's platoon split is a fact about him, so scanning a column and opening five batters and then the first one again costs five reads rather than six.

**Threaded as a parameter rather than read from `PreviewDoorContext`.** The summary table's cell reaches its door through that context because a cell is inside a `map` inside a row; here the door has to reach the *column*, which is not a component — the board builds `scheduleColumns` in a `useMemo` no hook of the cell's can reach — and it needs the **row** as well as the fixture, the board's row being a `ResearchRow` that context is not typed for and should not be widened to hold. `openFixture` is a `useCallback` over two stable loaders, so the columns memo does not thrash on it.

**Not offered on the team reading.** A club row is not a man, and the dialog's two halves are his platoon split and the lineup he faces; the caller decides that rather than `scheduleColumns`, which takes the door or nothing. Measured on `board=teams`: **426 day cells, 0 presses**.

**Measured in the running app on the live board at 1400×900, `sched=next`.** 707 day cells, **626 pressable** — the balance being off days, and finals and postponements, which are not previews anywhere in this app. A batter's: *Shohei Ohtani — Aug 25 @ ATL*, Bryce Elder named, Truist Park **plays neutral / vs LHB**, and the platoon card with **vs RHP** accented (182 PA against left, 372 against right). A starter's: *Yoshinobu Yamamoto — Aug 27 @ ATL*, Chris Sale as his counterpart, the same park, and ATL's nine cuts with `opp-row-on` on the **vs RHP** row — his hand, off the handedness map, and the one thing that would have gone silently wrong had the board guessed it. The three split states were driven by standing in for `fetch`: a delayed read draws `Reading his platoon splits` under an answered starter and park, the answer replaces it in place, a rejected read draws `Couldn't read his splits. Try again` and the retry succeeds on the next read (2 requests, not 1). Reopening a man already read costs **0** requests and draws the card in the same frame. One press of Escape closes the dialog and leaves the board's 50 rows standing; the opposing starter's name opens his own page over it (`player=pitcher-693821`). The roster table's Schedule view is byte-identical — 369 presses, and *Adley Rutschman — Aug 24 @ MIA* still opens Sandy Alcantara at loanDepot park.

**Bundle: 644.59 → 646.21 KB of JS** (191.54 → 192.22 gzipped), **CSS unchanged at 169.51** (30.45) — the dialog, the park strip, the split card and the opponent table were all already in the bundle, and what was added is the board's own state and one narrowed interface.


**A start day's box came out with no right-hand side on a phone, and what took it was the cell beside it.** Reported against this view: the border round a projected starter's day is drawn on three sides. Reproduced at **390** on `?view=research&pos=SP&sched=…`, and it is a paint fault rather than a layout one — the box's geometry is byte-identical either side of the fix (`290.36 → 366.34` for MacKenzie Gore's `vs LAA`, the `<td>` `271.44 → 367.58`, the table 556.55px, every row 58.00).

**What paints over it is `.summary-table td + td::before`** — the seam cover, the 6px strip of the row's ground that straddles every cell boundary so a fractional edge cannot show the page through as a hairline (its own argument is in `styles.css`, above the rule). It belongs to the cell on the **right** of the boundary and reaches 3px back over its neighbour, and being a positioned child of that cell it paints above everything in the cell to its left. That was free for as long as nothing was drawn in the last 3px of a cell's padding — which was true of every column in this app until this view arrived. `.sched-opp-box` is pulled 5px right of its cell's content edge (`margin-right: -5px`) so its *text* holds the column's shared right edge, and that puts its **1px stroke** inside the band.

**It is a phone bug by arithmetic, which is why the desktop looked right.** The stroke's outer edge sits 5px past the content edge and the boundary is a gutter away, so the stroke clears the cover only where the gutter is over 8px. The board's is `clamp(5px, 1.6vw, 13px)` and the roster's `clamp(5px, 1.9vw, 28px)`. Measured: at **1400** the gutter is 13px, the stroke clears by **8.00px**, and **0 of 21** boxes are in the band; at **390** the gutter is 6.24 and the stroke clears by **1.24**; at **320** it is 5.12 and **0.11**, with **18 of 21** boxes in the band. The 0.11 is the figure `.sched-opp-box`'s own note already records as "the tightest the stroke ever comes to its own `<td>`'s edge" — measured as geometry, before anything was painting there.

**Four experiments, in the page, to name the culprit rather than guess it.** With the box's `margin-right` set to 0 the stroke is whole (so it is the overhang). With the box's own `<td>` set to `position: static` nothing changes (so it is not its own cell). With the **next** `<td>` set to `position: static` the stroke is whole (so it is the next cell). With that same cell's `background` set to transparent it is **still** cut — which is what rules the cell's own ground out and leaves its `::before`. A 40× capture of the 12px around the boundary puts the last painted pixel of the corner arc at **x≈365.1** against a border box ending at 366.34: the cover's left edge, 3px back from 367.58 and snapped to the device pixel.

**So the day cell covers its own seam rather than being covered.** The strip moves to the start cell's own `::after` at `z-index: -1`, inside a cell made a stacking context by `isolation: isolate` — which is the one place a positioned strip can sit *above* a cell's ground and *below* its content. It still straddles by the same 3px either side and is still painted solid by one cell, so the seam is covered exactly as it was; the half that overhangs is repainted by the next cell's own ground, which is the same color by the rule this table already keeps (*a cell's ground is named, not assigned*). The next cell's cover comes off **that one boundary only**, because leaving it is the whole of the fault — two strips of the same ground in the same place, and the later one draws over the stroke. Verified by painting the new strip red: it runs from the cover's own left edge to the boundary and the box's stroke is drawn on top of it.

**Why not the two shorter fixes.** `z-index: 1` on the box does clear the stroke — and puts it above the pinned columns, which are `z-index: 1` on cells that come *earlier* in the row, so a day box would paint over the headshot column it is supposed to slide under. Raising the whole table's ladder instead is six declarations across four tables sharing `.summary-table`'s header and pin stack, for a 1px stroke. And simply suppressing the neighbour's cover leaves the seam it was drawn for, on scattered rows, which trades a missing stroke for a returning hairline.

**`:has()` rather than a class**, for the reason `.app-chrome:has(+ .view-tools)` gives one file over: the condition *is* "this cell holds a start box", it is the same condition on both wide tables, and a class would have to be threaded through two different column models to say it twice. The last cell in a row opts out — it has no boundary to its right, only the table's own edge.

**Measured before → after on the board at 320 / 390 / 1400**: every `.sched-opp-box`, its `<td>` and every header edge identical to the hundredth (at 1400 the day boundaries stay 893.98 / 1149.80 / 1400.00, at 390 they stay 367.58 / 470.13 / 556.55), rows **58.00**, page overflow **0**, and the stroke whole on all four sides at every width. **The roster's Schedule view takes it too and is the reason the rule is written on `.summary-table` rather than on the board's own class** — checked at 390 on the pitchers' tab: 6 boxes, **3 of them in the band** (a 7.41px gutter and 2.41px of clearance), the last column opting out of the strip as it should, rows 58.00 and overflow 0. **Bundle: 613.34 → 613.67 KB of JS** (182.96 → 183.05 gzipped) and **162.31 → 162.73 KB of CSS** (29.15 → 29.22), which is this section's rules and the player page's two empty states together.

**Search and the stat filters each sit behind their own button** (`.research-toggle`, both closed by default) rather than in a permanently-open control bar, which cost the table four rows before the first name on a phone. The **filter builder** is: pick a stat, ≥ or ≤, a number, Add. It **opens on Ros%** when a fantasy league is connected, that being the board's first column and the one a fantasy manager comes to this panel for; on `G` otherwise. Read live off `allColumns[0]` rather than seeded at mount, which is what makes it true at all — `hasRosterPct` is false on the first render, the ESPN status still being in flight, so a seeded default captured `G` and kept it for the session with Ros% sitting at the head of the very list the select was ignoring. Reading it live also covers the other case for free: a column the *other* board hasn't got is not a value this select can show, so crossing falls back rather than leaving it on a dead option. Its option list names each column by `title`, which for Ros% alone is a sentence rather than a phrase ("roster %" invites the wrong reading, and the header is the place to say so) — and a sentence truncates in a 240px select, which is why that column carries a short `pick` for the picker. Held as a list of conditions rather than a min/max pair per column because the board has forty of them and two inputs each is a form, not a filter bar — you come here with a question ("300+ PA, .350+ xwOBA") and the builder is that question typed out. **A collapsed panel must never be the only place a filter lives**, which is what the two classes on each button are for: `.active` means the panel is open, `.on` means it *holds* something and reads whether it's open or not. The filter button also carries a count badge, and the chips row sits **outside** the panel so the record of what the table is showing stays put when the panel is shut. A row with **no value fails every threshold**: a player Savant has no barrel rate for hasn't cleared 10%, and letting him through would put a row of dashes in a table filtered precisely to keep them out. A threshold typed in a column's *displayed* units is converted to the units its sort compares in (`Column.toValue`) — only IP needs it, and without it "IP ≥ 100" was read as 100 **outs** and let a 49.1-IP reliever through. Nothing is filtered by default. While the board's first read is out the count line **is** the wait — a `LoadingLine` reading `Reading the league leaderboard`, the ball turning in the very line that is about to hold the count, which is what a caption should do rather than being replaced by a box somewhere else. The **count line sits directly above the table**, not up in the control bar — which is now literally a tier away, the controls being in the chrome and this on the page — so it reads as that table's caption — the number describes what is under it rather than what the controls are set to, and it stays the last thing before the table however many panels are open. It carries no season: the app shows one, and says so nowhere else on the page either. Without it a short table would read as a short league rather than a tight filter, which is why "622 of 622" is stated even when nothing is filtered.
  - **Derived rates are computed in the column's `value`, not carried on the row** — BB%, K%, BB/K, PA/HR, SB% and ISO for a batter; K%, BB%, K-BB%, K/BB and Str% for a pitcher. Each is arithmetic over two fields already in the payload, and `value` is the single place a number has to exist for the table to sort and threshold it, so a server field would be a second copy. Every one **guards its denominator and returns null rather than a 0 or an `Infinity`**: a batter with no home runs has no PA/HR (∞ would sort him as the slowest to hit one rather than as having none), and a pitcher who has walked nobody has no K/BB. FIP is the exception and comes from the server, needing the league constant `leagueRates.ts` owns.
  - The pitching board keeps its **four ERA-scale numbers as two pairs — ERA · xERA · FIP · xFIP** — each estimator immediately after what it estimates, the rule the pitcher card's season line follows. That is why xERA sits here rather than leading the Statcast group it comes from: split across the table the two pairs would read as different kinds of thing when they are the same comparison twice. **SVHD** (saves plus holds) sits beside the two columns it sums rather than replacing them, since which half a reliever's came from is the next question you ask; it's a plain sum, not a guarded ratio, so a starter's zero stays a 0 for `credit()` to dash rather than a null for the sort to bury.
  - The **Statcast columns** sit at the right end and are drawn **exactly like every other column on the board**. They were set apart for a while — a `border-left` at the seam (`.research-statcast-start`) and the group's headers in the accent color — and both are gone, along with the `statcast` flag on `Column` that was the only thing marking them, since nothing else read it. What they were saying is a fact about where the numbers *come from*, and the place that is acted on is the **Columns dialog**, whose labeled runs are driven by the separate `group` marker on the first column of each run (`columnGroups`) and are untouched. On the table itself the reader is comparing a column against the ones beside it, and a seam through the middle of that is a claim the sort, the filter and the header have no other reason to make. Everything else about them stands. Nearly all of them declare `ascFirst` **on the pitching board only** — the same barrel rate is an achievement for a batter and a failing for a pitcher, so the column opens on whichever end is the good one; `Whiff%`, `Chase%` and `F-Str%` invert that again (a pitcher wants the swing and miss, the chase and the 0-1 count), and `LA` and the GB/LD/FB split declare nothing at all, being a profile rather than a grade.

**`PulAir%` sits at the end of that batted-ball run — after `FB%` and before `Whiff%` — and is the one member of it that *does* declare a direction.** GB/LD/FB say what kind of contact a man makes and neither end of them is the good one, which is why they declare nothing; pulled air contact is the shape home runs come out of, so a batter wants more of it and a pitcher wants to allow less, and it takes `ascFirst: p` exactly as `Brl%` and `HH%` two columns to its left do. It is on **both** boards, its upstream being populated on both (see **Data sources**, where the batted-ball board and the failed `custom`-leaderboard probe are set out).

**It reads on all five windows now, where it was an em dash on four of them.** The season board takes it off `leaderboard/batted-ball` as it always has; a window sums Savant's own per-day pull classification, reached through the search's `hfPull` filter — see **Data sources**, which also carries the spray-angle route that provably cannot work and the season-long validation (median error **0.000** points on both kinds). `Sprint` and `xERA` are still the two columns a window genuinely has no answer for, and still dash.

**It costs a windowed board nothing at all**, which is the measurement that mattered on the app's widest table: the column's header is wider than any value it can hold, so its width is header-bound. Measured on the live 7d, 30d and 60d batting boards at 390 / 1200 / 1920 by reading the geometry and then putting the em dash back in every cell, the table is **1589.94 / 1994.09 / 1994.09** (7d), **1584.50 / 1988.66 / 1988.66** (30d) and **1592.97 / 1997.13 / 1997.13** (60d) — **byte-identical either way** — with the column itself at **78.94px at 390 and 106.02 at 1200 and 1920**, which is exactly what the season board's has always measured. Rows **58.00px**, the header row 51.00, the headshot column pinned at **0**, the name column at **68** from 820px up, and **0 horizontal overflow of the page body** at every width in both states. Populated on 395 of 406 rows on the 7d board and 477 of 482 on the 30d — the remainder being men with no batted ball in the span, which is the same population `Brl%` beside it fills.

**It is on by default**, which is `DEFAULT_OFF`'s rule applied rather than excepted. That rule exists so a column added later shows up instead of being invisible until somebody remembers to list it, and the one documented departure from it — the four extra trend windows — was justified by their not being a *new stat* but four more resolutions of one already on the board. This is a new stat, so it takes the default. Note the rule only reaches a reader with **no saved column set**: a saved list is a list of keys, so anyone who has ticked the picker keeps exactly what they ticked and finds this under `Statcast` when they next open it — which is true of every column ever added here and is the price of saving the selection at all.

**Measured on the live board at 390 / 1200 / 1920, without → with.** The batting table goes **1581.66 → 1655.14** at 390 and **1975.05 → 2062.06** at 1200 and 1920 (the board overflows both, so it lays out on its content's own widths and the two agree) — 73–87px on a table already 1.6–2k wide, and **no horizontal overflow of the page body at any width**. Everything the board is already measured against is unchanged: rows **58.00px**, the headshot column pinned at **0**, the name column at **68** from 820px up, `--table-bleed` −22px. On the pitching board it lands between `HH%` and `Whiff%` at 2173.64px at 1200, 274 of the 275 rows under the `SP` pill carrying a value. Sorting opens descending on the batting board and puts the leaders on top (50.0% on a two-ball sample, which is what `min=1` buys and what the filter builder is for), one more press gives 0.0% first, and **nulls sit at the bottom in both directions**. The filter builder offers it by its `title` and a threshold typed there is compared in the units the cell prints — `PulAir% ≥ 25` takes the board from 458 rows to 76 with a measured minimum of exactly 25.0% and a maximum of 50.0% — which needs no `toValue`, this column displaying and sorting in the same percent (`IP` is still the only column that needs one). In the Columns dialog it is the 43rd chip, under the **Statcast** heading, between `FB%` and `Whiff%`.

**The Stats tab picks it up for free, which was checked rather than assumed.** That tab's vocabulary is the board's less `Opp`, `Ros%` and the five trend columns — a denylist — so a new stat column reaches it with no second declaration: measured on both kinds at all three widths, `Season` reads **19.8%** for Salvador Perez and **14.1%** for Cristopher Sánchez (both identical to Savant's published figure) with the four windows dashed under them, the table **1201.38 → 1275.94** at 390, **1944.73 → 2050.08** at 1200 and **2189.28 → 2305.03** at 1920, rows 44.55px, the span column pinned at 0, and the page and the overlay each overflowing by 0. **The four windows read now too**, which is a later change and cost the tab nothing: re-measured the same way — the geometry read, then the em dash put back in every cell — the table is **1275.94 / 2050.08 / 2305.03** on a batter and **1391.75 / 2227.45 / 2503.22** on a pitcher at 390 / 1200 / 1920, byte-identical either way, with rows **44.55px**, the span column pinned at **0** and the page and the overlay each overflowing by **0**; Perez reads `19.8 / 11.1 / 10.0 / 12.7 / 20.4` down the five spans. See **Data sources**. Its own picker gains the same chip in the same place — 41 chips against the board's 43, the six cut families being what makes the difference.

**Bundle: 456.51 → 456.68 KB of JS** (135.38 → 135.43 gzipped), **CSS unchanged at 105.18** (18.81) — 0.17KB raw and 0.05KB over the wire for one column definition read by two tables, and nothing at all in the stylesheet, a percent cell needing no rule of its own. There is still deliberately **no wash behind the cells**, and now none anywhere else either: the zebra stripe is defined later in the file and would win on half the rows, leaving a tint that flickers down the table rather than marking a group. And every sortable header on this board switches `text-transform` **off** — a rule written for these labels and orthogonal to the color that has gone, since the shared header rule uppercases everything, which is right for AVG and wrong for xwOBA, xBA, xERA and Brl%, mixed-case stat names the app writes that way everywhere else.

**`Bat` sits between `PulAir%` and `Whiff%`, which is where the batted ball stops being the subject and the swing starts.** It is the average speed of the swings he took — or, on the pitching board, of the swings taken at him, which is a real pitching stat and the reason the column is on both. It declares `ascFirst: p` like `Brl%` and `HH%`: a batter is trying to swing hard and a pitcher is trying to make him not, so those are the ends each side is aiming at. Bat speed is **not a virtue on its own** — a short quick swing beats a slow one and loses to a fast one, and the column says nothing about the second half of that — but a column has to open on some end, and this is the end each side is trying for.

**Its neighbor `swing_length` is not here, and that is the `pull_air_rate` failure repeating.** The custom leaderboard *accepts* it as a selection and returns an **empty column**: measured on the batting board at `min=100`, 420 rows with `avg_swing_speed` populated 420/420 beside `swing_length` at **0/420**. So the one-line version of "add bat tracking" ships a column of dashes, which is exactly what this file's own "checked to come back populated" rule exists to catch. Bat speed is real on both boards (420/420 batters, 96/96 pitchers at `min=100`) and swing length is reachable from no leaderboard at all, so only the one is asked for.

**The season figure is Savant's own and the windows are Savant's rule applied to the window**, which is a sharper distinction than the other Statcast columns need. Savant does not average every tracked swing: it averages **competitive** swings, which is bunts out and then the **slowest 10% of that player's own swings** dropped. That is a *percentile of a distribution*, and a percentile is the one shape `statcastWindow.ts` is built not to carry — everything there is a sum, because rates don't add. So a day stores a **histogram** beside the two sums, one bin per mph, which adds like everything else; see **Data sources** for the whole of it and for what it costs.

**Checked against Savant's published board rather than spot-checked**: the season column is **exact on every row of both boards — 630 of 630 batters and 755 of 755 pitchers**, with 0 ids on one side and not the other in either direction, which it should be, being their number read rather than ours computed. **And the windows were checked against an independent recompute** over the same day files, player by player, off the running server: `batter 7d 402 players`, `pitcher 7d 419`, `batter 15d 435`, `pitcher 15d 484`, `batter 30d 483`, `pitcher 30d 560`, `batter 60d 539`, `pitcher 60d 660` — **3,982 rows and 0 disagreements**, bar 14 that differ by exactly 0.1 where the checker's rounding lands on the other side of a half (Python rounds half-to-even where JS rounds half-away).

**It is on by default**, which is `DEFAULT_OFF`'s rule applied rather than excepted — the same call `PulAir%` records above, and for the same reason: that rule exists so a column added later shows up rather than being invisible until somebody remembers to list it, and this is a new stat. As ever it reaches only a reader with **no saved column set**; a saved list is a list of keys, so anyone who has ticked the picker keeps exactly what they ticked and finds `Bat` under `Statcast`, between `PulAir%` and `Whiff%`.

**Measured on the live board at 390 / 1200 / 1920, without → with** — the same saved 30-key batting set plus the one column, so the diff really is one column and not four. The table goes **1887.08 → 1931.48 at 390** and **2345.20 → 2403.14 at 1200 and 1920**: 44px at the narrow end and 58 at the wide one, on a table already 1.9–2.4k wide and scrolling sideways at every width there is. Everything else is byte-identical: rows **58.00px**, the header row **51.00**, the headshot column pinned at **0** with the pane scrolled to its far right, **rows entirely inside the pane 9 / 10 / 11 before and after**, and **no horizontal overflow of the page body at any width**. Sorting opens descending on the batting board (Caminero 79.8, Stanton 79.3, Walker 79.2 — Savant's own leaders), one more press puts the slowest swings on top, and nulls sit at the bottom in both directions; the filter builder offers it by its `title` and compares in the mph the cell prints, so it needs no `toValue`.

**The Stats tab picks it up for free**, that tab's vocabulary being the board's less six families rather than a list of its own — checked on both kinds at 390 and 1200: a pitcher's five spans read `71.0 / 70.9 / 70.9 / 70.9 / 71.2`, rows **44.55px** (58.55 with `Ranks` on), the span column pinned at **0**, and the page and the overlay each overflowing by **0**. Its own picker gains the same chip in the same place — **42 chips against the board's 43** — and ticking it on a batter fills all five spans.
  - **Each board keeps its own search, sort and filters, and keeps them while you are on the other one** (`BoardState`, a record with a slot per kind). They have to be separate — a batter's `PA ≥ 300` is not a condition the pitching board can express, and each opens on its own sort — and they have to *survive*, since a look at the RP list should not cost you the four filters you built on the batters. `App.tsx` used to key the component on the board (`key={researchKind}`) so that crossing from OF to SP remounted it rather than carrying a batter's column vocabulary onto a pitcher's table; a remount is a blunt way to say "these are two boards", and throwing the state away was the price. The key is gone and the record does both jobs. The one piece deliberately *not* per board is the half-built condition in the filter builder — it is a keystroke rather than a setting — but the column it names belongs to one board, so crossing falls back to the other board's first column rather than leaving the `<select>` on a value it has no option for. `researchPos` is lifted to App for the same reason it always was.
    - **And the whole of it lives in App** (`ResearchUi` — the two `BoardState`s, which of the three disclosures are open, and that half-built condition), alongside the include set and the watchlist, because the record above only ever survived the smaller crossing. `ResearchTable` is unmounted the moment the view changes, so a look at the summary table threw away everything it held: you came back to a board that had kept its position, window, included sets and columns — the four App already owned — and lost its search, its sort and its filters, which reads as a bug rather than as a rule. Holding half a page's settings in each of two places is exactly why only half of them came back. It is one object with one setter rather than six pieces of state, so App stores a line of it and every rule about what is in it — the per-kind slots, the sort's fallback to the board's default when its column is hidden, the draft column's fallback across boards — stays written in `ResearchTable.tsx` beside the vocabulary it is phrased in. A filter's `id` went with it and stopped being a counter: it is now one past the highest on that board, since a `useRef` counter is the one piece a remount could reset while the filters it numbered lived on in App, which is two chips answering to one id. The **open panels** are part of this on purpose — coming back to find the Filters panel shut is the same surprise as coming back to find it empty. Checked in a browser: a search term, a sort on HR and a `PA ≥ 300` chip, out to Roster and back, and all three are still there, both panels still open, the same 39 rows in the same order, and the board still scrolled to where it was (App's per-page memory already keyed `'research'` and still does). On the same run against `main`: the search, the panels, the sort and the chip are all gone. The data is fetched **lazily, once per kind per session** and kept: it's the whole league in one blob and the server caches it six hours, so re-fetching on a tab switch would buy nothing but a wait.


### The turn filter — which pitchers start on these days

**`Starting` — pick a day, or a run of them, and the board is the pitchers due to start in it, with every stat column still beside them.** It is how a manager streams a start, and it is the one question this table is the right population for: *who is pitching on Friday* is a question about six hundred arms, most of them strangers, which is what a leaderboard is and what a roster of twelve is not. In the URL as `turn=`, the control in the tools run beside Search and Filters, the days themselves in a strip that opens under the head.

**It is a filter and not a second Schedule mode**, and that line is the whole of its design. The Schedule view swaps the stat columns out for fourteen days; this leaves them exactly where they are and takes *rows* away — the half of the board a filter is allowed to touch, and the same partition that keeps Search and Filters on the bar in schedule mode while Columns and Ranks come off it. The two compose, and the composition is the useful thing: `Starting Fri – Sun` with the grid on is *a schedule of the men starting this weekend*, and with the grid off it is those men under `K/9`, `xERA` and `Whiff%`, which is the reading a pickup is actually decided on.

**The fact it selects on is the grid's own.** `turnsOnDays` walks the man's club's fixtures and asks `startTierOn` per game — the same function the day cell draws its box with and the `GS` column sums — so a pitcher this filter lets through on Friday is a pitcher the grid draws a box round on Friday, and neither can say the other is wrong. A **second start-day map**, built from the same payload by its own rules, was the obvious shape and is exactly what this module was written to prevent; and reading the index buys the club, the opponent and the doubleheader for nothing, none of which a player-to-dates map carries.

**What it reads is a fortnight of its own, and not the grid's span.** `buildTurnIndex` is a second index rather than the one the grid holds because the two answer different questions: that one is cut to `Next 7` or to a matchup period, and this filter has to be able to name a day beyond it (a link to next Tuesday opened by a reader on `Next 7`, or with the grid off altogether). It takes **no matchup**, deliberately — this is not a fantasy week, and a reader whose league runs three-week periods should not be handed a filter that quietly means something different from the one his leaguemate sees.

**And it is `buildScheduleIndex` with a span rather than an index of its own**, which is what the second version came to. The first built a whole-window index behind a span value (`'window'`) invented for it — not a member of `ScheduleSpan`, nothing offering it, `sched=` never able to say it — to describe a run of days that turned out, once the strip was cut to a fortnight, to be **exactly the span the app already had a name and a number for**. `TURN_DAYS` is 14 and the index is `buildScheduleIndex(win, 14, null, pitchers)`: `byTeam` cut to those days, `rotations` and `starters` read off the whole 28-day window regardless, so a pitcher's club is still derived from every game his slot touches. The fourth span value went with it.

**It carries the pitcher lookup, and the first version did not.** That argument is what `buildStarters` costs — the club derivation and the 750 game-sides behind it — and the `Start` column never draws the other club's man, so leaving it out looked free. What needs it is **the dialog that column opens**: `SchedulePreview` reads `opposingStarter` off the index it is handed, so an index built without the lookup opens a preview that cannot name the man on the mound, which is the half of it a reader opened it for. So it takes `playersLoading` in its gate as the grid's index does — there because a cell's *height* depends on the names, here because a dialog cannot answer without them.

#### The days are a fortnight of chips, each its own toggle

**Each day is pressed on and off by itself, and the days picked are a set.** It picked the two *ends* of a range for one commit, everything between them coming with them — a calendar's shape, and the wrong one for this control. The question is which days you can start somebody, and *Monday and Thursday* — a two-start week around an off day, or the two days of a fantasy week with a slot free — is not a run of days with the middle swept in. It cost a mode as well: the strip had to know whether the next press would begin a range or close one, and had to say which in its own foot (`Press another day for a range`), and a press that means two things depending on the last one is the trap the Columns dialog's reorder already records. A toggle is one rule, needs no foot to explain it, and undoes itself. Driven: press `Today 8/24`, press `Thu 8/27`, and the board is **14 of 622** with both chips lit and neither Tuesday nor Wednesday in it; press `Today` again and it is Thursday's 8.

**Fourteen days, where it drew all 28 the window has.** Two weeks is what a manager plans; the far half of a month of projections is a guess about a rotation that has not happened yet, and it is the same fourteen days the Schedule view's own long span draws, which is what let the whole `'window'` span go. What it buys on screen is measured: 14 chips at 49.5px fit outright from **900px up**, where 28 scrolled at every width below 1920.

**The panel is the strip and nothing else**, and it had two lines under it once. A `Clear` sat there first, where the Search panel has one — but that control has no chip, so its own panel is the only place its term can be undone, where this one is undone by the chip's `×` and by `Clear all`, both riding in the head at every scroll offset. And a line reading *Press a day to see who starts on it* sat beside it, drawn only until a day was picked, which is a panel that changes height under the finger that pressed it — the rule this app is strictest about — and reserved instead it is a permanently blank line in the pinned head. Both gone, the panel is **81.8 → 48.8px** and the head **151.8 → 118.8** at every width, half a row of the table back; what the line said is said by fourteen labelled buttons with counts under them.

**Every chip carries how many of the board start that day**, and the number is counted over the board **the reader has already narrowed** — the position pill, the search and the stat thresholds, everything but this filter. `12` under Friday is then *the rows that press will leave*, which is the only reading of it that can be acted on; counted over the league it would be a fact about MLB with no bearing on the table underneath. Measured live: the SP board reads `13 · 15 · 15 · 5 · 13 · 17 · 15` over its first week (Thursday's 5 is an eight-game day), and with `skubal` typed into the search every chip reads `0` but Friday's, which reads `1`.

**The chips do not sum, and that is right rather than a rounding error.** Each counts *rows*, and a man on two of the days picked is one row on the board — so days a rotation turn apart overlap by construction. Measured: `Today 8/24 · Thu 8/27 · Sat 8/29` reads `6 · 8 · 14` and leaves **26**, not 28, the two missing being starters due on the 24th *and* the 29th, five days apart. Three consecutive days summed exactly (13 + 17 + 15 = 45) for the same reason in reverse: nobody starts twice in three days.

**A day nobody starts is `0` and is still pressable.** A disabled chip would leave the reader to work out that the *board*, and not the schedule, has no starter on Thursday; pressed, the board says so in words and names the control — `Nobody here starts Tue 8/25` over `Pick other days under Starting, or clear it`, which is what an empty state owes. That message is drawn only where the days are what emptied it (the rows survived everything else and not this), so the general `No players match these filters` is never shown blaming a threshold nobody set.

**The strip is a `ScrollRow`.** 14 chips at 49.5px is ~770px, and a run that wrapped would put rows of chips into the pinned head where the table's rows go. Measured at seven widths with the panel open: it fits outright at **1920 / 1400 / 1200 / 900** and scrolls with both arrows drawn at **640 / 390 / 320**; `.research-turn-panel` is the one panel on this board laid out as a **column**, `.research-panel` being a wrapping row written for a search field and a threshold builder — wrapped as flex items the strip and its foot sat side by side at 1920 with the foot a caption 1,200px from the thing it captions.

**And the strip had to be held to the panel by hand.** `ScrollRow`'s `flex: 1 1 100%` is a basis on the *main* axis, and this panel's main axis is the column — so the strip took its width from its content and ran **1453.5px inside a 346px box at 390** (measured while it still drew 28 days), clipped by the head with no scroller and no arrows, three quarters of them unreachable. `width: 100%; min-width: 0; max-width: 100%` at the one call site that is not `.view-tools`, and 1453.5 → 346.0 with the box scrolling and both arrows drawn. Its bleed is taken back at the same place: `ScrollRow` re-pads by the bar's gutter and out by the container's, which is right in the row it was written for and put the first and last chip 12px outside the box here.

#### `Start` — the column the filter brings with it

**A filtered row has to say why it is on screen**, which is the argument the position cell already makes on this board for printing the whole eligibility list rather than two codes and a `+3`. `Starting Fri – Sun` narrows 147 pitchers to 45 and then says nothing about which of the three days any of them goes on, which is the half of the answer the reader is choosing between. So the filter splices a column in at the head of the run and takes it away with itself.

**It is the filter's own and in no vocabulary.** Not in `allColumns`, so the picker never lists it and the builder can hold no threshold against it — a day is not a number anybody has an opinion about, which is what `Opp` says by holding words. Two things had to be told about it by name, and both were found by driving it:

- **`NO_GOOD_END`**, or the column wears a percentile. Its `value` is an ordinal — where the turn sits in the window, which is what lets the reader put Friday's men above Sunday's — and ranked it read `50` under `Fri 8/28 @ DET`, a claim that Friday is better than Sunday. That is a fact about the schedule and not about him, which is the same thing `Ros%` and the four profile columns are excluded for.
- **`visibleKeys`**, or the header lights nothing. That set is the reader's *saved list*, and this column is in no list — so a press on its header set a `sortKey` the fallback rejected and the order fell straight back to `Ros%` with no header lit. Ordering by it is what the column is for: `ascFirst`, soonest turn first, because the nearest turn is the one there is least still to go wrong with.

And a third the Columns button had to be told: it counts the picker's vocabulary rather than what is drawn, or it reads `30` over a panel with 29 things in it.

**The opponent rides on the same line** — `Fri 8/28 @ DET` — because the day is half of a streaming decision and the club is the other half. One line per turn rather than two, which is the board's own trade said again: **width is free here and height is not**. A five-day range can hold two turns, and at two lines apiece that is four in a 58px row; at one line each it is two, and what it costs is ~40px of a table already 1,857px wide at 390 and scrolling sideways at every width. Measured over `Fri 8/28 – Tue 9/1`: 72 rows, one of them two turns, and **every row 58.00px**.

**Every start is a door, and it was plain text for one commit.** The reasoning for that was that the grid's cell is the *fixture*, drawn under a header naming the day, where this one is a caption on a start — a distinction without a difference to a reader, who is looking at a club on a day, which is the one thing this app has made pressable wherever it appears. A filter that puts forty starts on screen and lets none of them be opened is this file's own `vs MIL` fault — the board building `scheduleColumns` and never handing the cell a door — made a second time, one column over.

**It is the same two doors the roster table's opponent cell chooses between, on the same test.** A fixture nobody has played opens the **preview** — the park, the man the other club is throwing, and the lineup his own club would face; one already under way or finished opens the **game's page**, because by then *what is this game* has been answered and the question a result raises is *how*. Off the whole-window index, so a start four weeks out opens exactly as tonight's does. Driven: `Fri 8/28 @ CLE` on Michael Wacha's row opens *Michael Wacha — Aug 28 @ CLE* with Tanner Bibee named as his counterpart, Progressive Field reading `plays neutral` and CLE's board under it; **26 of 26 rows pressable**, one press of Escape closing it and leaving the board standing. The played half was driven against a payload with one of today's games rewritten to `final` — every real game today being still `scheduled` — and its start draws a door with no `aria-haspopup` reading *open the game*, which lands on `game=822695` and the page headed `COL @ WSH`.

**The opponent is the door and the day carries the caveat**, which is the grid's own division of a cell into two marks and here is forced as well as consistent: a door wears a dotted underline, an *estimated* turn wears a dashed one, and a descendant cannot cancel an ancestor's decoration — it only adds its own, so the two on one run of text is two lines a pixel apart. Marking the **day** is the honest half anyway: the club plays that day whatever happens, and what is being guessed is that he is the one starting. `.research-turn-est` folds onto `.sched-vs-estimated` and `.research-turn-guess` onto `.sched-vs-projected`, so neither mark is restated — the second is the shape `.sched-sp-projected, .sched-sp-estimated` already has, one italic named for both unannounced tiers.

**And the open dialog now closes with whichever surface raised it.** The fixture record carries **the index it was opened from**, because at the draw site there is no telling which of the two a game came from and the dialog reads that index for the opposing starter; `fixtureLive` then compares it against the two in force by identity. So a preview opened from the grid closes when the grid is pressed off even with the filter still on, and one opened from a start closes when the days are cleared or the reader crosses to the batters — all three driven.

**The three tiers are the app's ladder and they travel as modifiers** — upright where his club has named him, italic where it is our reading of his own slot, italic under a dashed line where it is his club's rotation standing in. `.sched-vs-projected` and `.sched-vs-estimated` are taken as they are, the way the player page's own next-start line takes them; nothing new is declared. Measured on the live board, which is the measurement that says why the projection is worth reading at all: **today's 13 rows are 13 announced**, and **Friday's 13, four days out, are 12 projected and 1 estimated** — with announcements alone the filter could answer for three days of the 28.

#### `turn=`, and the day a link is opened on

**`turn=` rather than `starts=`**, and the reason is the param an inch away: the date bar writes `start=` and `end=`, and a query string carrying `start=2026-08-20&starts=2026-08-28` is two params that mean two different things and *look* like one typed twice — this app's own two-params-must-never-mean-two-things trap, read at the level of the eye rather than the parser. A **turn** is what this app has called a start since the `GS` column was written.

**The days are comma-separated and a run of them is folded** — `turn=2026-08-24,2026-08-27`, and `turn=2026-08-28..2026-08-30` for three consecutive. The fold is an encoding and not a second meaning: a fortnight picked one chip at a time is 11 characters of query string rather than 160, and the two forms round-trip through `toTurnDays`/`turnDaysParam`. It also means **a link shared while this was a range still says what it said** — `a..b` reads as every day in the run, which is what it drew then.

**The dates are absolute**, where a date preset's are a rule. A preset is a fact about the recipient's own today, which is why the bar carries its label; `Starting Fri 8/28` is a fact about the schedule, exactly as the League page's `lwk=` is a fact about the league's calendar. What a link cannot promise is that those days are still ahead when it is opened — this app's schedule runs `SCHEDULE_DAYS` **forward of today** and never a day back — so `clampTurnDays` keeps the days the index actually holds and drops the rest, and the filter goes off where none survive. Driven, on a window opening 8/24: `turn=2026-08-27,2026-09-25` opens on `turn=2026-08-27` and 8 rows (the second day being past the fortnight), `turn=2026-08-01,2026-08-02` opens on the whole board with the param gone, and `turn=2026-08-28..2026-08-30` opens on three lit chips and 53 rows. It is also what drops an **off day** a run swept up: the index holds the days the schedule has.

**A part that cannot be read takes the whole param with it** — `turn=2026-08-27,rubbish` opens on the whole board rather than on the 27th. Half a set of days is a filter the reader never asked for, where a reversed run (`b..a`) is read forwards and a day named twice is kept once, both being malformations with an obvious reading.

**It is written only where it is in force.** A turn is a fact about a pitcher, so the control is not drawn on the batting board or on the thirty clubs — a control whose whole subject has been swapped out is a setting lying about its own reach, which is the rule that takes Columns and Ranks off the bar in schedule mode — and a param naming a filter the recipient's page does not offer is a parameter that lies about it. The range itself survives the crossing, so coming back to the pitchers finds the days still picked.

**One derivation decides all of that, and it did not at first.** `activeTurn` is the days, the index, `kind === 'pitcher'` and `!teams` in one place, read by the column, the row test, the chip, `Clear all`, the empty state and the board signature. Written as four separate tests it went out of step exactly where it would: crossing to the batting board left the range narrowing rows with the button gone, and the board read **`0 of 166 batters`** under an empty state blaming a threshold nobody had set.

#### What it cost, and what it was checked against

**Validated against MLB's own uncut payload through the rendered table**, which is the check that matters for a join. The whole SP board was paged in from the DOM (every row carrying an id), `/api/schedule` was read separately and the pitchers due on 2026-08-28 derived from it by hand — announced probables plus every projected turn whose `gamePk` falls that day, postponements out — and the two compared: the payload names **41** starters that day, **26** of them are on the board as read, and the filter draws **26**, with **0 rows the payload does not back and 0 the payload has that the table does not**. Every cell's opponent matches the club's fixture. Re-run after the range became a set, and after the strip came down to a fortnight, with the same result.

**The bar's cost is a wider group and not a taller bar.** `Starting` is a seventh button in `.research-tools`, which takes the run from **542.3px to 654** — and measured with and without it at **1920 / 1200 / 900 / 640 / 390 / 360 / 320**, the pinned chrome is **142 / 142 / 142 / 144 / 144 / 144 / 144px either way** and the page body overflows by **0 → 0** at every one of them. That is the three runs being `ScrollRow`s: a row that scrolls has no line budget to defend, so a button added to it gives up its end to an arrow rather than costing the table a row.

**Every other invariant unmoved**, measured at those widths with the panel open and days picked: rows **58.00px**, the header row **51.00**, the head **118.8**, the panel inside the head's own 22px gutter (`22 / 1356` at 1400, `22 / 346` at 390), and no horizontal overflow anywhere.

**And the board goes back to the top when the days move — which took a fix to the reset itself.** That rule is `Math.min(where you are, the top of the table)`, and the `min` is what keeps a press still: a reader who can see the control they pressed is above the target already. It read the live `scrollTop` for *where you are*, and this is the first control on the board that **narrows the rows and changes the columns in one commit** — which replaces the whole of the table's DOM, and Chrome clamps the offset against whatever the content momentarily is while it does. Measured on the first press from **1400**: the effect computed the right target (**156**) and found `scrollTop` already **0**, so the `min` answered 0 and the reader landed on a screenful of the control bar, the exact thing the target exists to prevent. *Where you are* is now recorded on the reader's own scrolls (`wasAt`), and the three cases hold together: a day chip from 1400 lands at **156** (was 0), a search narrowing the same board at **156** (unchanged), a sort from row 400 at **156** (unchanged, and the case the reset was written for), and a press made from the top of the page still moves nothing at all. The days are in the board signature, and rightly: they cut the population harder than anything else on that list.

**Bundle: 669.48 → 676.10 KB of JS** (197.24 → 199.52 gzipped), **CSS 174.72 → 176.16** (31.31 → 31.53).

### The team reading

**The same board, read as thirty clubs instead of six hundred players.** `board=teams` in the URL, the `Teams` toggle in the tools run. It is a *reading* and not a second table: the rows are the same `ResearchRow[]`, so the column vocabulary, the sort, the filter builder, the search, the percentile module, the column picker, the paging, the head, the Schedule view and the full-page box all work untouched — the same one-line swap the Schedule mode makes, one level up. What changes is the population, and with it every control that is only ever about people.

**Where the numbers come from** is `server/src/teamResearch.ts` and **Data sources**, which carries the reconciliation. In short: MLB's `teams/stats` leaderboard for the box-score half (season and `byDateRange` both answer, 30 splits, every field the player leaderboard carries), and the per-day Statcast export summed by club for the Statcast half — the same `StatcastCounts` and the same `toStatcast` the player *windows* are built from, so a club's barrel rate is barrels over batted balls computed by the routine that computes a player's rather than a second definition that agrees today.

  - **The control is a toggle in `.research-tools`, and the first shape was measured out.** It began as a `Players · Teams` tablist at the head of the bar, folded onto the window tabs' class list — and two one-word tabs are **145.5px**, where the control set at 1920 fits on one row with nothing to spare. Measured on the **player** reading, chrome without → with: **50 → 96 at 1920, 96 → 142 at 1200, 98 → 146 at 480**. A whole extra row on the one page where every pixel of height is a row of the table, and on the reading that had not asked for the control — which is the measurement that kept the Watchlist button out of `.research-include`, arriving on a wider screen. Inside `.research-tools` it is far cheaper: that run is one flex item that wraps whole, so the button grows a group that was already moving as a unit. Measured again, player reading, without → with: **320 190 → 190, 375 146 → 146, 390 146 → 146, 480 98 → 98, 640 98 → 98, 900 142 → 142, 1200 96 → 96, 1920 50 → 96** — free at seven of the eight widths, and one row at the width with the most vertical space to give. No horizontal overflow of the page body at any of them, on either reading.
  - **And the shape is honest.** `ScheduleToggle` two buttons along is the precedent and the same kind of thing — a mode you turn on that changes what the table is, with the board's own reading as the off state. Players is what this page *is*; Teams is the lens. It is the run's third panel-less toggle, so it takes `.on` and never `.active`, exactly as Watchlist and Ranks do. The glyph is a crest, the one shape in that run that says *club* rather than person, list or column.

  - **Eleven position pills become two, and they are two of the eleven.** Nine of them select a position and a club plays them all; what is left is the pair that were never positions — `Batters` and `Pitchers`, which say which side of the ball the board is, relabeled `Hitting` and `Pitching` because a row here is a club rather than a person. They carry the **same `pos=` values**, so the reading adds nothing to the URL and `researchKindFor` goes on deciding which board is fetched; and a press is a **no-op where the kind is already right**, so a reader who was on `SS`, crossed to the clubs and came back is still on `SS`.
  - **The include buttons and the Watchlist toggle are not drawn at all.** The three sets are a partition of *ownership* — of players — and the watchlist is a list of players; on this reading every row is in and no button could take one out. Not disabled: not drawn, which is the rule that suppresses a mark every row would carry, applied to a control. It is the same argument that takes Columns and Ranks off the bar in schedule mode — *a control whose whole subject has been swapped out is a setting lying about its own reach*. `boardRows` is therefore the population outright, and the count line reads `30 of 30 clubs` until a filter or the search narrows it.
  - **The head's badges follow the controls.** `Teams` leads them, because expanded there is nothing else on screen to say that "of 30" means clubs; then `Hitting` or `Pitching` in place of the position badge; and **no ownership badges and no `Watchlist`**, there being no button that could have set one.
  - **The team reading keeps its own search, sort and filters**, so `BoardState` has four slots rather than two (`BoardStateKey`, `team-batter` / `team-pitcher`). It is the argument the two kinds already keep theirs by: "a batter's `PA ≥ 300` is not a condition the pitching board can even express", and it is not one thirty clubs can express either — every one of them has 4,800. Checked in a browser: sort the batting board by HR, type a search, cross to the clubs, sort them by OPS, cross back — the search and the sort are as they were, and crossing forward again finds the clubs still on OPS.
  - **One sort bug the reading exposed, and it was not new.** `defaultSortKey` opened on `Ros%` whenever `hasRosterPct` was true and the key was in `visibleKeys` — and `visibleKeys` is the reader's *saved list*, which keeps a key it cannot draw. On a connected reader's team board that named a column no row has: the thirty came out in the server's own order with no header lit. It reads `columnsByKey` now, which is the vocabulary *this reading* has, and schedule mode is untouched (its default is still the board's, `visibleKeys` being days ∪ vocabulary there).

  - **And the same fault had a second door, which is why the team board now opens on the club's name.** Reading `columnsByKey` fixed the *absent* column; it does nothing about an *unticked* one. `Ros%` is not in a club's vocabulary at all, so the team board falls to `DEFAULT_SORT[kind]` — `PA` — and a reader who has taken PA off his column list gets a board ordered by a column that is not on it. Measured on a checked board at 1200: **no header lit anywhere in the 28-column header row**, no cell carrying `research-sorted`, and the thirty in an order (Cubs, Pirates, Nationals, Brewers, Cardinals, Dodgers, Athletics, Twins) that nothing on screen accounts for. It is the same sentence the paragraph above ends on, reached a different way.

    The answer is not another fallback but **a default that is legible from the table**: `defaultSortKey` is `NAME_KEY` on this reading, and the name column is on every team board by construction and cannot be unticked. Measured after: **Arizona Diamondbacks, Athletics, Atlanta Braves, Baltimore Orioles, Boston Red Sox, Chicago Cubs, Chicago White Sox, Cincinnati Reds … Toronto Blue Jays, Washington Nationals**, 30 rows, the `TEAM` header lit with a ▲ and `aria-sort="ascending"`.

    - **Why the alphabet here and not on the player board.** `DEFAULT_SORT`'s own comment says the board opens on the players with the most work behind them so that it lands on “names worth reading rather than the alphabet”, and that is right for six hundred rows you *scan*. Thirty clubs is a list you *look a row up in* — the reader has a club in mind — and A-to-Z is the only order that answers that question. So `Team` is a sort control and `Player` stays a word, which is the asymmetry the include buttons and the position pills already carry: **a control is drawn where it has a subject.**
    - **`NAME_COLUMN` is a `Column` that is in neither vocabulary.** It is a `Column` because that is what the comparator, the header and the direction rule all speak; it is kept out of `BATTER_COLUMNS` and `PITCHER_COLUMNS` because both of that array's consumers would be wrong about it — the picker would offer a column already on the table that cannot be taken off it, and the filter builder would offer a threshold on a club's name. Its `text` routes it down the alphabetical path the opponent column already uses, nulls to the bottom in both directions included.
    - **The direction had to be resolved the way the key is** (`activeSortAsc`). `sortAsc` is the direction the reader last *pressed*, and on a fresh board there has been no press — it reads `false`, which was right for as long as every possible default (`Ros%`, `PA`, `IP`) opened descending. A name does not: left on the stored flag the team board opened at Washington and ended at Arizona. It now falls back to the default column's own `ascFirst`, which is already the field deciding which way a header opens and which end a rank counts from; the player boards are untouched, every one of their defaults having no `ascFirst` and so still resolving to `false`. `toggleSort` flips from the direction **on screen** for the same reason — a press on the lit header used to read as “descending, please” while the ▲ under the reader's finger said ascending — and writes the key as well, which is what takes the board off its default now that the reader has chosen the column.
    - **`research-sort` for the button, and deliberately not `active`.** The header takes the sort button's whole shape — the hit target, the 10px line, the gutter off `--sort-gutter`, which on this table *is* `--research-gutter`, so the label stays on the gutter the thirty club names are set on (measured: label left 81 and the name links' left 81, before and after). What it does not take is `.active`, whose rule pins the sorted column to whichever edge it is passing: this is the leftmost column and is already `position: sticky; left:` above 820px, so a second `left` would park it past its own right edge. `is-sorted` is the lit state alone. And `text-transform` goes back to `uppercase`, which `.research-sort button` turns off for `xwOBA` and `Brl%`'s sake — left alone the header came back as `Team` beside a `PLAYER` on the reading next door.
    - **Nothing moved.** Measured at 1200 before → after: name header 164.75px wide either way, header row **51.00px**, club rows **58.00px**, `--research-pin-left` **233px**, the name label's left edge **81** — every one unchanged. The arrow **trails** the label here where every other header leads with it, which is the same rule at the opposite alignment: the reservation is paid on the side away from the edge the label is set against, and leading it pushed `TEAM` 11px inside the gutter its own column is set on.
    - **The default is reachable again**, which the old one was not: press `HR`, press `TEAM`, and the thirty are back at Arizona. Checked in a browser — open (ascending) → press (descending, Washington first) → press (ascending) → `HR` (name header unlit, `aria-sort="none"`) → `TEAM` (ascending). Expanded, the head still carries it: tools row `display: none`, head 62px, badges and count on the full-page box's own 12px bleed.

**The columns a club has not got are dropped rather than dashed** (`TEAM_HIDDEN`), the rule `Ros%` follows without a league and a trend window follows with no baseline. Three reasons, and none of them is taste:

  - **A fact about a player, and a club is not one.** `Ros%` and its five trend windows are how many fantasy leagues have rostered *him*. `Opp` is drawn from `/api/statuses`, which is keyed by player id and has no club entry — and today's opponent is a fact every one of that club's players already carries on the player reading.
  - **The upstream cannot fill it.** **`xERA`** is Savant's own model and its team expected-statistics board publishes no `xera` column at all — probed: fourteen columns, `est_ba` / `est_slg` / `est_woba` and their diffs, and nothing else. **`Sprint`** is a separate measurement that appears in no pitch row, which is why a *window* has none either.
  - **It would print the same thing twice.** A club's pitching **W** and **L** *are* its record — every game has a decision, and the two columns came back identical to the standings on all thirty — and the record is already under the name. **`GS`** is `G` on a club: 127 of 127 on every row measured, somebody starting every game.

A key here is still kept in the reader's saved column list, so crossing back puts the column where he had it; and the picker lists the reading's own vocabulary, `ColumnPicker` already preserving keys `all` has no answer for.

**And the mirror of that rule: `W%`, the one column only a club has** (`TEAM_ONLY`, `WIN_PCT_COLUMN`). It is the same sentence read the other way — *a column is offered on the reading whose rows can fill it* — and it is a `Set` beside `TEAM_HIDDEN` rather than a test on one key, because a board with a rule in one direction and an `if` in the other is a board where the next column of either sort goes in the wrong place. Not per kind, unlike `TEAM_HIDDEN`: a club's record is the club's whatever the board is reading it for, and the server puts `record` on a team row of both kinds.

  - **The record has been under the name since the team board arrived, and that is not the same object.** A label orders nothing and holds no threshold. `62-48` in an identity cell answers *which of these thirty is winning while it hits like this* only by being read thirty times and divided in the head; the column answers it with one press. Driven on the live board: sorted descending the top four read `80-49 → .620`, `77-51 → .602`, `76-52 → .594`, `75-54 → .581`, and ascending `49-79 → .383`, `50-77 → .394`, `51-77 → .398`, `52-75 → .409` — every cell agreeing with the record under the name beside it.
  - **Over the same span as the rest of the row**, because `record` already is, and that is what makes it worth a column rather than a link to the standings: the standings have the season and this has the window. Measured on the 30-day board, the same three clubs whose season lines read `67-61 → .523`, `49-79 → .383` and `75-54 → .581` read **`15-12 → .556`, `6-21 → .222` and `17-11 → .607`**.
  - **Derived on the client, off `record`.** No server change and no field: it is arithmetic over two numbers already in the payload, which is the rule every other rate on this board follows (`share`, `per9`, the slash line). Guarded like them too — a club with no decisions in the window is **null**, an em dash, rather than a `.000` that would claim a winless club.
  - **Written `.617` under a header that says `W%`.** That is what every standings table in the sport prints, and it is the app's own rule rather than an exception to it: a rate is `.xxx`, a share is a percent, and which of the two a stat is, is a convention rather than a property of the number — on-base *percentage* is `.xxx` too. Its threshold is therefore typed the way `AVG`, `OBP`, `SLG` and `xwOBA` are typed, in the units the column sorts in: `W% ≥ 0.55` cut the board **30 → 7 clubs**. No `toValue`, deliberately — the six other `.xxx` columns have none, and reinterpreting a `55` as `0.55` for this one alone would be a guess made in one column and not in six.
  - **First on the row, and its own group.** On a club row it is the headline — which of these thirty is winning — so it leads the stat columns, and the picker gets a `Club` heading of its own. That heading is what keeps the cut clean on the other two surfaces: the **player** board filters it out of `allColumns` beside `TEAM_HIDDEN`, and the **player page's Stats tab** cuts it in `statsColumns` with the three families already cut there, so neither table offers a column it cannot fill. Checked: the player board's header row runs `Headshot · Player · Opp · G · PA …` with no `W%` and none in its picker; the team board's runs `Cap logo · Team · W% · G · PA …` on the batting reading and `Cap logo · Team · W% · G · IP · SVHD …` on the pitching one.

**The identity block is the block, with three things swapped** (`TeamIdentity`, `TeamPhoto` in `PlayerIdentity.tsx`).

  - **The cap logo where the headshot is** — `lib.ts::teamLogoUrl`, MLB's `team-cap-on-dark` cut on the club's own `teamColor` ground, which is the mark this app already draws at 15px in the sub-line, at 42. It sits in **`.sum-photo-wrap`**, and the wrapper's `line-height: 0` is load-bearing, because left in the cell's inline flow the reserved descender took **every club row to 60.00px against the board's 58.00**. None of the headshot's marks come with it: the lineup pip is a batting order and the status code an injury designation, and neither is a fact about thirty men at once.
  - **Both of them open the club's page**, which is the one thing on this reading that has changed since it was built, and it changed because the premise did. These two bullets read *"as a `<span>` rather than a button: the box, not the control"* and *"plain text rather than a link — the page a name opens is a page about a person, and this app has no club page"*, and every word was true of the app they were written in. There is a club page now (`TeamDetails.tsx`, and `sicko-player-page` for the shell both pages ride on), so the cap logo is a `<button>` with the same class and the same box, and the name is an ordinary `.sum-name-link`. `TeamPhoto` takes an optional `onOpen` and falls back to the inert `<span>` without one — the old rule outlives its first caller, since *a row that looks pressable and is not is worse than one that plainly is not* holds whatever is on the other side. `.sum-name-link.is-static` survives for the same reason and now has no caller on this board. Checked in a browser: the board's first club row (`Arizona Diamondbacks`) is a `BUTTON`, and pressing either the name or the logo opens `?team=109` with the club's page over the board; `Back` returns to the board with `team=` gone and every other param — `board=teams`, `watch=1`, the 31-key `cols=` — untouched.
  - **The record where the position list was**, span-matched: `76-51` on the season board and `5-3` on a 7-day one, titled *"5-3 over the span on screen"*. Every other number on that row covers those seven days, and a season record among them would be the one figure on the line answering a different question. `.row-id-record` shares `.row-id-pos`'s slot and **not** its ellipsis — five characters cannot overflow, where a position list is the one thing on that line allowed to truncate — and takes `font-variant-numeric: tabular-nums`, thirty records in a stack that jitters by the width of a `1` reading as thirty different shapes.
  - **None of the four marks is drawn.** The baseball and the padlock say who owns him, which no fantasy league can say of the Brewers; the newspaper reads a per-player news map with no club entry; the star adds a `${kind}-${id}` key to a watchlist of players. Each would be a mark on no row or on every row, and the rule for both is the same one.

**The rank badge is a standing, 1st to 30th, not a percentile — and it is the League Rankings' badge folded onto rather than a second one.**

  - **A percentile of thirty is a share to the nearest 3.3 points wearing two significant figures.** The player badge's whole argument is that a percentile is what a *sample* of six hundred can honestly say; a complete population of thirty can say the thing itself, and `4th of 30` is both shorter and true in a way `88` over thirty clubs is not. What must never happen is a percentile against six hundred players rendering under a club's aggregate; a separate population is what prevents that, and `RankScale.rankOf` is what turns the same scale into a standing.
  - **It is the same object as the League table's, so it shares the selector list and the fill.** That table already draws a rank of *teams* under a value in this slot and in this class — the stylesheet's own note says so: *"the rank under the value, in the slot and the type the research board's own percentile badge takes — `.col-rank`, folded onto rather than restyled, so a second line under a number is one object in this app."* Two tables ranking clubs 1-to-N under a number are the same object and not two that resemble each other, so `rankBadge` moved out of `LeagueRankings.tsx` into `columnRanks.tsx` as `rankFill` (one scale, two callers) and the two ends of it (`--rank-hot` / `--rank-cold`) are one declaration on a selector list of both surfaces.
  - **The color is the League table's argument arriving where the objection to it has gone.** `RULES.md` spends color on state and calls that badge the one place a scale genuinely *is* the reading. The research board's percentile is monochrome because *its* color vocabulary is spoken for — "the live inning, the postponement and the trend" — and on the **player** reading it still is. On the team reading every one of those is off the table: `Opp` is not drawn, the five trend columns are not drawn, and there are no roster tints, no lineup pips and no IL codes, because there are no players. So the scale is the only color on the table and it is spent on the one thing this reading is for. It colors the rank and never the value, which is the rule the League badge already carries.
  - **The chip's shape is shared and its vertical rhythm is the table's own** — the `--table-bleed` split applied to a row. The board's 58px row leaves **33px** between a cell's 12px paddings and its 1px rule; a value line measures **18.85** of it, leaving **14.15**, and the bare `.col-rank` is exactly **14.00**. The League pill is 19 (14 of line, 1 of padding a side, 3 of margin) because its own row has the room, and taken whole it put every club row at **60.00px**. So the pill keeps its fill, radius, ink and right edge and gives up the two measurements that are the other table's row: the margin goes and the line comes to 12, so 1px of padding a side still lands the box on 14.00. Measured after: **58.00px on the team reading with the badges on and off**, identical to the player reading beside it, and the ordinals (`1st` … `30th`, no descender among them) sit centered in the 12px line.
  - **Direction is `Column.ascFirst` and nothing else.** There is deliberately no second table of which-way-is-good: the field that decides which way a header opens and which end the percentile counts from is the field that decides which end is 1st. Read off the live pitching board: **ERA 1st = 3.22** (the lowest), **WHIP 1st = 1.16**, **HR allowed 1st = 117** (the fewest), **K/9 1st = 10.0** (the highest), **K% 1st = 26.4%**; and on the batting board **K% 1st** is the *fewest* strikeouts and **PA/HR 30th** the most plate appearances per home run. Ties share the top of their run — the competition convention `teamHitting.ts::rankAll` and `espn.ts::rankAll` already use, and the one the League badge is drawn from: ATH and COL both read `29th` in ERA at 5.51. That is deliberately **not** the midrank the percentile uses, which exists to stop two hundred batters with no home run reading as the best nought — a problem thirty clubs with thirty distinct totals have not got, and "joint 4th" is what a reader of a thirty-row table expects.
  - **No dashed ring, ever, on this reading**, and it needed no new rule to be so. `ResearchRow.qualified` is **false on every club row**: Savant's bar separates players who have played enough from players who have not, and thirty clubs have all played the whole span, so the flag would partition nothing. False is what routes `rankScales` down its already-written nobody-qualifies path — the scale is built over all thirty, `qualifiedScale` is false, and the ring (which marks a row *outside* a population) is unreachable. The `Ranks` toggle and the head's badge say the other sentence: *1st is best, whichever end of the column that is*, with no bar named because there is none.

**The Schedule view works on the team reading with one column removed.** It was always drawn from `r.teamId` — `G` is "games his club plays" and every day cell is the club's game — so the mode needed a wording change and the loss of `GS`, a turn in the rotation being a fact about a pitcher, where `startTally` would have counted nobody's and printed thirty noughts. Checked: 30 rows, `G` plus the day columns, rows 58.00px, `Schedule · week 19` in the head.

**The empty state governs before the six below it**, which is the rule that family already follows — the causes are tested in the order they govern. None of the six can be reached here: the buttons that define every one of them are off the bar and `boardRows` is the whole population. So an empty board on this reading has exactly one cause and it is not a control the reader touched — the thirty rows did not arrive — and the message names that rather than blaming a filter, with `Players` as the way back. The *filter* empty state above it is untouched and says `No clubs match these filters`; checked with `HR ≥ 900`.

**Checked in a browser at 320 / 375 / 390 / 480 / 640 / 900 / 1200 / 1920**, both readings, dark and Powder Blue: rows **58.00px** everywhere, no horizontal overflow of the page body anywhere, the head measured at 41 / 72 / 103 exactly as before (**62 / 93 now** — the head is two lines since; the sweep is in the sort bullet above), the pinned name column and the sorted column's double edge unchanged, and the full-page box's `--table-bleed` still the 12px that box declares. Thirty rows is under `PAGE_SIZE`, so the board is one page and the paging strip is never reserved.

### The projected reading — the whole league over days nobody has played

**Both wide readings of this board are cut by what has already happened**, and
the question a manager is on it to answer is not: *who should I pick up for the
rest of this week*. The window tabs answer half of it — a man's last thirty days
are a better guide than his season — and stop where it gets interesting, because
they still describe games that are over. So the board takes a third reading:
**`Projected`**, which replaces every figure with what that player is expected to
do over a span of days still to be played.

**It is the same engine the Roster's own lens and the League page's matchup card
run** (`server/src/projection.ts`), asked a third question. That one wants a
side's total, the second wants a line per man on sixteen rows; this wants a line
per man on **six hundred**. One context, one per-player core, three callers —
two projections of one Saturday that disagreed would be worse than either.

#### It is a mode of this board, not a fourth page

The Schedule view's argument one section up, and it lands the same way: the same
rows, the same population, the same five controls above them, with the numbers in
the cells swapped. **Mutually exclusive with the Schedule view**, and in *both*
directions — that mode replaces the stat columns with days and this replaces the
figures in them, so they are two readings of one set of cells and cannot both be
in force.

The one-way version of that exclusivity shipped and was caught in a browser.
`toggleBoardProjected` cleared the span, and nothing cleared the lens: pressing
`Schedule` on `?view=research&bproj=1` left **both buttons lit**, the columns
became the fourteen days (the `schedule` branch of `columns` is tested first, so
that mode does win the table), and the projected span line stayed on screen above
a table with no projected figure anywhere in it. `setBoardScheduleSpan` is the
other half; the span is App's and shared with the Roster's copy of the toggle, so
this is the board's press saying what it means and nothing else changes hands.

**Not offered on the team reading**, and not disabled there: a projection is a
line per *man* — his lineup slot, his rotation turn, his platoon — and there is
no such thing for the Brewers. That is the rule the include buttons and the
position pills already follow on that reading, and crossing to it puts the lens
away.

#### The vocabulary changes with the figures, because two thirds of it cannot be projected

A projection can answer for a **count** and for a **rate built out of counts**,
and for nothing else. xwOBA, exit velocity, barrels, the GB/LD/FB split, chase
rate, bat speed and sprint speed are readings of *contact that has not happened*;
roster % and the five trend columns are facts about a fantasy league rather than
about a week of baseball. Left in the vocabulary they would be two thirds of the
columns on the app's widest table drawing em dashes, which reads as a broken
board rather than as an honest one.

So the lens swaps the **columns** as well as the numbers, which is exactly what
the Schedule view already does with a different answer:

| | drawn under the lens |
| --- | --- |
| batting | `Opp`* · `G` · `PA` · `AB` · `H/AB` · `R` · `HR` · `RBI` · `SB` · `CS` · `BB` · `K` · `AVG` · `OBP` · `SLG` · `OPS` · `ISO` · `BB%` · `K%` |
| pitching | `Opp`* · `G` · `GS` · `IP` · `BF` · `W` · `L` · `SV` · `HLD` · `SVHD` · `H` · `R` · `ER` · `HR` · `BB` · `HBP` · `K` · `ERA` · `WHIP` · `BAA` · `K/9` · `BB/9` · `HR/9` · `K%` · `BB%` · `K-BB%` · `K/BB` |

*\* on a single day only — see below.*

- **Every definition is the board's own, pulled by key** (`projectedColumns`).
  Nothing restates a formatter, a `value`, an `ascFirst` or a title, so a column
  whose arithmetic is fixed on the measured board is fixed here in the same
  breath. Two are genuinely different questions and are the only two written out.
- **`FIP` and `xFIP` are deliberately out**, although the projection produces
  every component either needs. They are estimators, and an estimator of an
  estimate is a number nobody can act on — the reader already has the projected
  ERA those components were built from, and a second ERA-scale figure beside it
  differing only by the modeling invites a comparison neither can survive.
  `BABIP` is out on the same ground: it is a *luck* metric, and there is no luck
  in an expected value.
- **`IP` is a decimal and the column says so.** `inningsPitched` is *thirds*
  everywhere else in this app — `6.2` is six and two thirds — and it takes a
  whole out count, which a projection has not got: 18.7 projected outs is 6.23
  innings, and printed in the ordinary form it reads as 6⅔, a third of an inning
  out with nothing on screen to say so. The server leaves `inningsPitched`
  **null** on a projected row and the lens's own column divides `outs` itself, so
  the ambiguous string is never written at all and the two forms cannot meet.
  It keeps `ip`'s key so a reader's sort survives the press, and `outs` as its
  `value` so the order is the same order; its `toValue` takes innings where the
  measured column takes thirds, which is the plainest statement that these are
  two columns rather than one.
- **`G` dashes at nothing where the measured board prints the number.** `0` is
  never an honest answer on a leaderboard — a row is there because he played —
  and it is the commonest answer here: a club with no game left in the span, a
  starter whose turn falls outside it, a man on the IL or in the minors. The rest
  of his row is already dashes, and a lone `0` among them would be the one cell
  claiming a measurement (*he appears in no games*) where the truth is *there is
  nothing here to project*.
- **`Ranks` comes off the bar and `Columns` does not**, which is that pair's own
  rule read one control at a time rather than as a block. *(It took both off for
  one round, on the reading that the vocabulary was not the reader's to pick
  here. That was wrong about Columns and is corrected below — see* The columns
  are the reader's under the lens too*.)* Ranks genuinely has no subject: a
  percentile is a standing among the *qualified* players on a measured board, and
  nobody qualifies for a week nobody has played — ranking an estimate against a
  field of estimates would put a solid badge under a number this app's own rule
  says must never wear a measurement's clothes. (`columnRanks.tsx`'s note that
  "neither surface that draws a `.col-rank` percentile has a projected reading"
  is what this answers: one of them does now, and it answers by not drawing
  them.)
- **And the window tabs come off with them**, which is the same rule one control
  further. A projection is not drawn from a window — it is his season blended
  with his last thirty days, always, whichever pill is lit — so under the lens
  those five decide **nothing**, and a reader who pressed `7d` and watched the
  table not move would be owed an explanation this bar has no room for. It is the
  tabs *and* the phone's dropdown, or a phone would keep the control the desktop
  has taken away. The setting survives and the board comes back to it.

#### `Opp` on a single day, and nothing over a range

**The one column on the row that a future span makes useless is the one naming a
game**, and the lens answers it two ways.

**On a single day it is that day's fixture** — `@ SEA`, the first pitch, and the
man the other club is throwing in the app's own three tiers (upright announced,
italic where it is his own rotation slot, italic under a dashed line where it is
his club's). That is what the reader asked for by narrowing to a day, and it is a
*different fact* from the measured board's `Opp`, which draws today's status map:
a projection of Thursday under a cell naming this afternoon's game would be the
one thing on the row describing another span.

**Over a range there is no column at all**, and `G` beside it is what a row is
read against instead. A week is a week of fixtures and naming one of them would be
a summary of nothing — the Roster's projected reading reached the same answer and
states it in the same words (**Client — the Roster view**, *The Opponent column
becomes `G`*).

- **It rides on the row** (`ResearchRow.projGame`, filled by
  `getBoardProjection`) rather than being joined client-side off a schedule
  index. The board holds an index only in schedule mode, and `buildScheduleIndex`
  takes a `ScheduleSpan` — one of four named runs — where this needs *one named
  date* that may be any of the next 28. The server already holds the fixture, the
  probable and the rotation map for exactly that day.
- **The name rides with it where `ScheduleGame` deliberately carries only ids**,
  and the population is why: that window is every club's fortnight read by a grid
  whose cells are two characters wide, where this is one fixture per row of a
  board read to pick a stranger up. One name per row against 750 names for every
  row of a window nobody has narrowed.
- **The tier is re-derived server-side rather than read off `ctx.starters`**,
  which flattens the three into one set: an announced start is a probable id on
  the game itself, everything else is the rotation map's, `estimated` where that
  projection came off the club's pooled cadence rather than the man's own. Same
  two facts, same ladder, so the board and the Schedule view's grid cannot
  disagree about how firm a Thursday start is.
- **Zero new CSS.** The cell is `.research-opp-main` / `.research-opp-time` /
  `.research-opp-sp`, the measured column's own three, and the two unannounced
  tiers wear `.sched-vs-projected` / `.sched-vs-estimated` — the modifiers the
  stylesheet already lends to the player page's Schedule tab.
- **And never on a span with nothing in it**, which `from === end` gets wrong on
  its own. A range wholly in the past clamps to its own last day, so
  `?bproj=1&start=2026-08-10&end=2026-08-12` answered `oneDay: true` and the
  board drew an `Opp` header over **471 em dashes**, beside a line already saying
  *nothing to project*. A column that can only be empty is a column not to draw.

#### The control: a disclosure, not the Roster's plain switch

The Roster's toggle has one thing to say — *the days in view, estimated* —
because that page already carries a date control and the lens borrows it. **This
board has no dates at all**, so the lens has to bring a span with it, and a span
is exactly what a lit button cannot say: `Week 20`, `Wed, Aug 26` and `Aug 26 –
Aug 30` are three readings behind one word.

So the button opens a panel and takes the class pair the board's other three
disclosures take — **`.active` for open, `.on` for holding something** — where the
Roster's takes `.on` alone. `ProjectedToggle` grew an optional `active`, so the
caller with a panel says so and the caller without it reads exactly as it always
has; `.projected-toggle.active` is folded onto `.research-toggle.active`'s
selector list, this being the same state on the same shape.

**Pressing it does not turn the lens on**, which is `Starting`'s half borrowed
whole: that button opens the day strip and narrows nothing until a day is
pressed. Here the panel opens and the board goes on drawing its measured figures
until a span is picked.

**Three doors, and only two of them are spans:**

| | |
| --- | --- |
| `Week 20` | the rest of this matchup period |
| `Week 21` | the next one, its own days |
| `Custom` | the app's calendar — one press picks a day, two pick a range |

- **A period is the one span a calendar cannot express**: its dates are the
  league's own arithmetic and they move as the week is played. `Next 7` / `Next
  14` where no league names them, which is `scheduleSpans`' own fallback one
  control over and the same words, so the two runs cannot come to call one span
  two things.
- **`Week 20`, not `This matchup`** — the wording `spanLabel` argues at length
  for: it says *which* fantasy week rather than that it is the current one, it is
  the vocabulary the League page already speaks, and `This week` would collide
  with the calendar week the date presets mean.
- **The current period starts today and the next one starts on its own first
  day**, and this got that wrong for one commit. Every span started today, so
  `Week 21` came out as *Aug 24 – Sep 20* — the rest of week 20 **and** all of
  week 21, which is not what anybody pressing it is asking for.
  `max(start, today)` is the one rule right for both, and it is a no-op on a
  period that has not begun. The current one still starts this morning because
  days already played are nobody's to project and `getBoardProjection` clamps
  forward regardless — a pill whose dates the answer contradicted would be the
  control lying about what it did.
- **`Today` was a third pill and has gone.** It is a single day, which is what
  the calendar beside it is *for*, and a named pill for one of the 130 days that
  calendar reaches was a pill arguing that today is a kind of span rather than a
  date.
- **A named span closes the panel and `Custom` does not**, which is not an
  asymmetry: pressing a period *is* the answer, where pressing `Custom` is asking
  the question — a panel that shut on it would take the calendar away in the same
  frame it drew it. Picking on the calendar closes it, that press being the
  answer.
- **The calendar is drawn only behind `Custom`.** Measured: **346px** of head
  with it always drawn against **36** without it, which is the panel most readers
  see for the two presses they make.
- **It opens on today where no custom range is in force.** A reader pressing
  `Custom` off `Week 20` is saying the period's fortnight is *not* what they
  want, so a grid marking those fourteen days would make picking a single day two
  presses of un-marking first.
- **It takes the panel's width, capped at 640.** Every other calendar in this app
  is the 260px its popover can afford; this one is in the flow of a head that is
  the full content width, where 260px marooned at the left edge read as a control
  that had failed to lay out. The grid is seven equal tracks, so width goes
  straight into the cells — uncapped at 1400 they come out ~195px each and the
  month reads as a wall of buttons. 640 puts a cell at about 90px, and below 640
  the picker really is the panel's full width, which is where it matters.

*(The last bullet is superseded: the calendar is a popover off a field now and
takes the app's own 260px. The width reasoning was a true answer to the wrong
question — see* The panel reopened blank, and the calendar left the head *below.
The bullet is left as written, this file's rule for its own superseded
reasoning.)*

#### The panel reopened blank, and the calendar left the head

**Two faults in one control, reported together**, and the second is what the
first turned out to be a symptom of.

**A custom span left the panel with nothing in it.** `ui.panels.projCustom` is
cleared whenever the projected panel closes (`setPanel`'s own rule, written for
`Projected → Custom → Filters → Projected` coming back on a calendar the reader
had abandoned three presses earlier) — and *picking on the calendar closes the
panel*. So a reader who picked `Aug 27 – Aug 30` and pressed `Projected` again
got the panel back with **no pill lit** (the span is custom and matches none of
them) and **no calendar** (the flag was cleared by their own press). Three unlit
pills, and the one place on the page that could have said which days were being
projected said nothing.

**So the door the panel opens on is the door the span in force came through**,
which is what the flag should have meant all along: `projCustomOpen` is the
reader's *question* (`Custom` pressed, nothing picked yet) **or** the reader's
*answer* (a custom span is what the board is drawing). The bug the clearing rule
was written for is untouched — with nothing picked there is no custom span in
force, so an abandoned question still comes back on the pills. Checked, both
paths: `Projected → Custom → pick → Projected` returns on the calendar marked on
those days; `Projected → Custom → Filters → Projected` returns on `Week 21`.

**And a lit `Custom` closes the panel, as a lit period does.** Once a pill can
be lit by the *span* rather than by the press, the press has to mean what the
two beside it mean — the span is already the answer, so the press puts the panel
away. Pressing it while it is merely *open* still closes the calendar and leaves
the pills, that press being the reader abandoning the question.

**The calendar is a popover off a field now, which is the fix the first fault
was pointing at.** What the reopened panel had to show was *which days* — and
the app already has one shape for that, on every other surface: a face that
states the days, and the calendar over the page when you press it (`DateBar`'s
`popover`, and *Every reading of a range opens it now*). The board was the one
place asking a reader to learn a second shape, and the width reasoning that put
a month of grid in the head was a true answer to a question nobody had asked.

- **`Custom` reveals the field; the field opens the calendar.** Two presses to a
  month rather than one, which is the shape `.drp-field` had before it was
  retired and the shape the reopened panel needs: a glyph alone while nothing is
  picked, **the days themselves once there are days** — `Aug 27 – Aug 30`,
  `Fri, Aug 28` — in `wideRange`'s one wording, the same the span line under it
  prints.
- **It is `.research-toggle` outright**, the board's own disclosure shape, so it
  takes the ground, the border, the `--control-h` that lines it up with the span
  run beside it, the lit state and the focus ring with no new rules.
  `.view-tab` is what it is **not**: that class is a *segment of a switch*
  (`border: none; background: none`) and outside one it draws as bare text —
  measured, 25px tall against the run's 36.
- **`CalendarGlyph` came back to `DateRangePicker.tsx`**, the markup unchanged
  from the `.drp-field` it went out with. A glyph naming a calendar belongs
  beside the calendar, and the file's own note about the field going with its
  last reader now has a reader again.
- **The pick puts the whole thing away** — the calendar it was made on and the
  panel that calendar was opened from — which is what a named pill's own press
  already does.
- **It is a `Modal`, not a popover hung off the field**, and that is the one
  place this control is not the date bar's shape. It was a popover for one
  round; both faults it met are faults of the box it was in.

  *The head cannot let anything hang out of it.* `.research-head` is
  `overflow: hidden` on both axes, and the horizontal half is load-bearing twice
  over: it is a sticky box in a pane that scrolls sideways, **and** `hidden` is
  what makes it a scroller that never scrolls, which is what gives the
  `overscroll-behavior-x: none` beside it something to hold. Relaxed to
  `overflow-x: clip` — the tools row's own trick one rule down — the paint came
  right and the *gesture* broke: `clip` is explicitly not a scroll container, so
  the overscroll rule stopped applying and a wheel or a finger anywhere in six
  rows of chrome chained through and **scrolled the table sideways under the
  reader**. Reported, and reverted; the head's rule is byte-identical to what it
  was.

  *And the anchor moves.* The field rides **after** a run of pills, so where it
  is depends on whether that run wrapped — which depends on the width of a date
  label the app does not choose. With nothing picked the field is a 35px glyph
  and the row does not wrap, so it sat at x=268 on a 390px phone and a 260px
  calendar hung at `left: 0` ran to **528, 138px past the right edge** — inside
  a head that clips, so the half of the month the reader needed was not merely
  off screen but unreachable. Pick a range and the label makes the row wrap, the
  field drops to the gutter, and the same `left: 0` is suddenly right. There is
  no constant that answers both.

  `ColumnPicker` is the same call made one control earlier and states it in the
  same words — *a modal, where Search and Filters beside it are inline panels*.
  A box this chrome has no room for leaves the row, and it comes with the whole
  ladder for free: Escape undoes exactly this one thing, the background goes
  inert, focus goes in and comes back, and the backdrop's press is spent on the
  dismissal. Checked at three widths: Escape closes the calendar and leaves the
  panel, with the field still reading its range.

- **`.research-cal-box` is the calendar's width, not the dialog's.**
  `.app-dialog-box` is `min(720px, 100%)` and a month is seven equal tracks, so
  a dialog-wide grid is the wall of buttons the accordion already measured
  (~195px cells at 1400). 292px is the 260px grid plus the box's own padding.
  Measured fully on screen at every width — **320×568 → 16…304 / 84…485**,
  **390×844 → 49…341 / 222…623**, **1400×1000 → centered** — against a popover
  that ran 138px off the first two.

- **Nothing is marked until the reader marks something.** The grid opened on
  *today*, selected — which is a calendar answering the question it was opened
  to ask. `Custom` off `Week 20` means *these are not the days I want*, and a
  filled cell under today is the same wrong claim one day wide rather than
  fourteen. `DateCalendar` takes `start`/`end` as `string | null` now, with a
  `month` beside them for which month to open on where there is no selection —
  a different claim and a true one, today being where the reader's attention is
  and the day every projection starts from. The foot says what the first press
  does (`Pick a day, or the first of a range`) rather than naming a day nobody
  chose. Every other caller passes a range it genuinely has and is unchanged to
  the pixel — checked on the app's own date bar, which still marks its own
  selection and whose popover is centered on the bar at 390 (195) and 1400 (700)
  as before.
- **Nothing is marked until the reader marks something.** The grid opened on
  *today*, selected — which is a calendar answering the question it was opened
  to ask. `Custom` off `Week 20` means *these are not the days I want*, and a
  filled cell under today is the same wrong claim one day wide rather than
  fourteen. `DateCalendar` takes `start`/`end` as `string | null` now, with a
  `month` beside them for which month to open on where there is no selection —
  a different claim and a true one, today being where the reader's attention is
  and the day every projection starts from. The foot says what the first press
  does (`Pick a day, or the first of a range`) rather than naming a day nobody
  chose. Every other caller passes a range it genuinely has and is unchanged to
  the pixel.

**Measured, before → after, with the calendar open.** The head does not move at
all now:

| | before | after |
| --- | --- | --- |
| head at 1400, panel open | 119px | 119px |
| head at 1400, **calendar open** | **419px** | **119px** |
| head at 390, panel open | 119px | 163px |
| head at 390, **calendar open** | **419px** | **163px** |
| the calendar itself | 346 / 640 × 292 in flow | **292px wide, over the page** |

The 44px the panel costs at 390 is the span run and the field wrapping to two
lines, which is `flex-wrap` doing its job in a 346px box; what it buys is the
300px the head used to grow by under the finger that opened the month. Page-body
overflow is 0 at both widths, open and shut.

**`Clear` is always drawn while the lens is on.** It was drawn only where no pill
was lit, on the reasoning that a lit pill is its own way off — press `Week 20`
again and the lens goes, the rule the turn filter's day strip keeps for its own
last day. That rule is true and it is not *findable*: nothing on a lit pill says
it is also a switch, and a reader looking for the way back to the measured board
has no reason to press the thing that is already selected. Reported as exactly
that. One button that says what it does beats a gesture that has to be explained.

#### The panel is in the head and the button is in the run, because the run clips

Every disclosure on this board has that shape and this one has to. `.research-scroll
> .view-tools` carries `overflow: hidden` — it is a sticky box in a pane that
scrolls sideways, and the run must not slide with it — so an absolutely
positioned panel opened from a button inside it is **clipped to the run's own
36px**. Measured at 1400 with the key drawn beside the toggle: the panel's box
was 320px wide at x=1058 and nothing of it painted below the row. `.research-head`
under it carries the same rule, which is why the panels there are all **in flow**
— an accordion, growing the head under the *rows* rather than under the finger
that pressed it, that finger being on the condensed rail, which has no height to
move.

**The date bar was tried first and is the record of why.** The lens drew App's own
`DateBar` as a second row of the tools band, on the argument that one bar states
the days on every surface that has them. Three things came out of driving it:

1. the calendar it opened was clipped by the same `overflow: hidden`, and had to
   be moved out of `.view-tools` to a block child of the pane;
2. `position: sticky` opens a stacking context whatever the `z-index`, so the
   popover's own 30 resolved against its siblings inside the bar — the board's
   head is a sticky sibling at the same 5 and later in the tree, and painted over
   a calendar hanging down into it;
3. and the head's caption then said twice what the bar said once — `PROJECTED /
   Wed, Aug 26` in the bar, `PROJECTED · Wed, Aug 26 · 1 day still to play`
   sixty pixels under it, which is the redundancy the Roster's own caption was
   retired for.

All three go with the bar. What is left is a button, a panel and a line.

#### The line in the head, which is where the span is stated

`PROJECTED · Wed, Aug 26 · 1 day still to play`, the last thing in the head before
the count. It is the Roster's retired caption, kept here because neither half of
the argument that retired it reaches: that bar was **pinned** and said the same
two lines eight pixels away, and this board has no bar at all — the days live
behind the button, in a panel the reader closes as soon as they have picked — so
the head is the only place the span is stated, and it is the one box on this page
that sticks and that the expanded mode keeps.

**The days left matter as much as the dates.** A span whose clubs are mostly idle
projects a board of dashes, and the count line directly under this one would then
be the only number on screen — a table that looks broken with nothing to explain
it. `5 days still to play` against a five-day span says the lens is drawing all of
it; `1 day` against the same span says most of it has been played.

**At none the span is not printed at all** and the line becomes the whole
sentence — `Nothing to project — every game in these days has been played`.
Naming a projected span there would be the lens taking credit for figures it did
not touch. Reached only by an inbound link over a past range; every span the panel
offers starts today, so a press cannot land here.

`.research-proj-line` is folded onto `.research-count`'s rule — the same object in
the same box, the head's quiet caption line, differing only in which sentence it
carries. The lead word takes the app's accent, this being a *state* the table is
in rather than emphasis.

#### The columns are the reader's under the lens too

**A picker that lists what the lens can draw.** The lens showed its whole
vocabulary outright for one round, which made it the one table in this app whose
columns were not the reader's to choose — and the argument for that ("the
vocabulary is not the reader's to pick here") does not survive contact with the
rule it was borrowed from. That rule is *a control whose whole subject has been
swapped out is a setting lying about its own reach*, and the lens does not swap
the columns out: it swaps them for **a smaller set of its own**. There is still
an order to set and still a `SV` a reader may want split out of `SVHD`.

So `Columns` stays on the bar under the lens and the dialog is handed the lens's
vocabulary. **The picker itself needed nothing** — it takes a list and a
selection and has no opinion about which reading produced them, which is what
lets one dialog serve three tables.

**It is a saved entry of its own, and that is the hazard rather than the
tidiness.** `UserPrefs.projectedColumns`, beside `researchColumns` and
`statsColumns`, through the same `readColumnBody` and the same
`store.ts::setColumnPrefs`. The lens lists a **strict subset** of the board's
vocabulary, so a write from its picker would hand the board a list with every
Statcast and roster-% key missing and **silently drop them from a set the reader
never touched** — which is, word for word, the hazard `statsColumns` exists to
avoid one table over. Measured: untick `SB` and tick `CS` under the lens, then
turn the lens off, and the measured board still draws all 31 of its saved
columns with `SB` among them.

- **The defaults are the board's own `DEFAULT_OFF`, not a second table.** Every
  key the lens draws is a key the measured board draws, so a column a reader
  would not want among 44 is one he would not want among 19 — `H` and `AB` are
  what `H/AB` prints on both, `SVHD` is the read and the split is the follow-up
  on both. It leaves **15 of 18** on the batting board and **17 of 26** on the
  pitching one, plus the opponent on a single day.
- **`PROJECTED_*_KEYS` are in the board's canonical order**, which is
  load-bearing rather than tidy: `ColumnPicker`'s `insertAt` puts a newly-ticked
  column back at its canonical place — ahead of the first column that follows it
  in `allColumns(kind)` — and that reads the *measured* array whichever picker
  raised it. Measured with `sb`/`cs` ahead of `walks`/`strikeouts` in the
  projected list: ticking `CS` on dropped it after `K` rather than after `SB`.
- **A saved list is narrowed to the vocabulary it is read against**
  (`toProjectedColumnKeys`), so a list stored under an older build — or one that
  carries the opponent column into a span that has stopped being a single day —
  comes back as the columns that still exist rather than as gaps.
- **…and `Opp` is put back on a single day, because a range could never have
  been asked about it.** That is the mirror of the line above and it was the
  half that was missing. A list saved over a *range* is saved out of a
  vocabulary the opponent is not in — the picker never offered it — so the key
  is absent for the same reason `xwOBA` is: nobody was asked. Narrowing to a
  single day read that absence as a decision, and the board drew `G` where the
  one column a single day is read for should be. **Measured on the live
  install**: the pitching board's stored list (14 keys) drew no `Opp` on a
  one-day span while the batting board, which had no stored list at all and so
  fell through to the defaults, drew it — one reader, two boards, two answers.
  `toProjectedColumnKeys` now leads the kept list with `OPPONENT_KEY` on a
  one-day span.
- **So it is not in the picker under the lens** (`pickerColumns`), and that is
  the half that keeps the rule above honest rather than bullying. A tick for it
  would be dead in both directions — off, `toProjectedColumnKeys` would put it
  straight back; on, it is already there — and a checkbox that cannot change
  anything is a control lying about its reach. `Opp` on a single day is what
  that reading *is*: the reader narrowed a projection to one date to find out
  who each man plays. **The key still rides in `orderedKeys`**, which is what
  draws and sorts it, and `ColumnPicker`'s `commit` carries a key it cannot
  resolve through its own reorder untouched — which is the same machinery that
  already lets a saved `Ros%` survive a session with no league. Checked:
  unticking `BAA` under the lens on a one-day span leaves `Opp` leading both the
  header row and `cols=`. The **measured** board is untouched — there `Opp` is
  one column among 44, drawn from today's status map whatever span the reader
  picked, and turning it off is a perfectly good thing to want.
- **A selection that is just the defaults is stored as nothing at all**
  (`isDefaultProjectedColumns`), so a reset goes on following the defaults as
  they change rather than pinning today's copy. Checked: `Reset to defaults`
  leaves `projectedColumns` as `{}` on the server and puts `SB` back.
- **In the URL as `cols=`, and that is not a second meaning on one param.**
  `cols=` has always named *the column set of the reading on screen* — `pos=`
  said which board — and `bproj=1` beside it now says which **reading**, exactly
  as it does for `start`/`end`. A link carries one set because a link describes
  one page, and the boot path reads it against the lens's vocabulary where the
  flag is there and the board's where it is not.
- **Its own 600ms debounce and its own timer**, the reasoning the two beside it
  give: turning a group on is one intent and a dozen state changes, and a shared
  timer would let a measured edit swallow a projected one made half a second
  later.

**Sorting needed nothing** — `visibleKeys` was already the union of the drawn
columns and the reader's saved list, so a board sorted by `HR` becomes a
projected home-run leaderboard rather than falling back. Checked on the pitching
board: pressing `K` under the lens sorts it, and the first page is nothing but
men with two turns in the span.

#### `How the projection works` is the same popover as everywhere else

**`ProjectionKey` beside the toggle, from the same `.proj-key` anchor the Roster
row and the League page use** — one engine explained by one component on three
surfaces, drawn only while the lens is on so the run carries no footnote to a
control that is doing nothing. Its sentences are `ProjectionNote`'s, split out of
`ProjectionKey` so the board's own branch could be a branch: the Roster's rows
and the matchup's card are both *what has already happened + what is left*, where
this board's span is clamped forward to today and every figure on it is an
estimate end to end. A key telling a reader of this table that part of his row
was a real line would be the one sentence on the page that is untrue.

**It was an accordion in the head for one round, and the fix is one CSS value.**
`.research-scroll > .view-tools` was `overflow: hidden` — it is a sticky box in a
pane that scrolls sideways and the run must not slide with it — and `hidden` on
one axis computes `visible` on the other to `auto`, so the panel was **clipped to
the row's own 36px**: measured at 1400, a 320px key painting as a 46px sliver.

**`clip` is the one value that does not drag its partner.** `overflow-x: clip`
with `overflow-y: visible` is explicitly allowed to stay as specified where
`hidden` + `visible` is not, so the row goes on clipping the axis it has to and
lets the panel hang below it. With the `:has(.info-key-panel)` layer bump above
the head — a sticky sibling at the same 5 and later in the tree — the key opens
in full at **1400, 390 and 320**, entirely on screen at each, with the control
rows still 36px and page-body overflow 0.

**A glyph and no word.** The four buttons beside it are *nouns* — Search,
Filters, Schedule, Projected — each naming a thing the board can be; this is a
footnote to the one beside it, and a fifth word in the run would read as a fifth
setting.

#### One panel at a time

The bar's disclosures each set only their own flag, so Search, Filters, the day
strip and the lens's span picker could all be open at once — and every one of
them opens **into the head**. A reader who pressed `Projected`, thought better of
it and pressed `Filters` got the filter row *under* a month of calendar he had
not dismissed, with the table three hundred pixels further down than he left it.

They are mutually exclusive now: opening one closes the rest. That is what a
reader means by pressing a second button — the first question is abandoned, not
stacked — and it is the rule the app's dialog layer already keeps one tier up.
**The `Schedule` toggle closes the lens's panel too**, since pressing it turns
the lens off and a span picker left open over a mode that is no longer on is the
same fault arriving from a control that is not a disclosure.

**`projCustom` is not in the run**, being a state *of* the span picker rather
than a sibling of it — passing it through would have `Custom` closing the panel
it lives inside. It is cleared on the **result** rather than in the `projected`
branch, which is the bug that came first: clearing it only where that button was
pressed left it set when the panel was shut by the exclusivity, so `Projected →
Custom → Filters → Projected` came back on a calendar the reader had last seen
three presses earlier, at 383px of head.

Driven through the whole run at 1400 — `Projected`, `Custom`, `Filters`,
`Search`, `Starting`, `Projected`, `Starting`, `Schedule` — exactly one panel is
open at every step and the lit button matches it, with the head at 31px empty,
73–86 with a one-row panel and 383 with the calendar.

#### What the server answers with, and what it costs

**`/api/research/projected?type=&start=&end=`**, a route of its own for the two
reasons `/api/projection/roster` is one beside `/api/report`: `/api/research` is a
**cached blob** keyed by kind and window, served warm to every reader alike, where
this is a computation over a span the reader picked; and it joins four league-wide
boards and the league's schedule, which nobody who never presses the toggle should
pay for. `start`/`end` take that route's own resolution and its own 62-day
ceiling.

**It adds no upstream at all.** `getBoardProjection` runs on the context
`getRosterProjection` already builds, which holds both season boards and both
30-day boards for the entire league — they are what every per-player projection is
drawn from — so the population is `pools.batSeason` / `pools.pitSeason`'s own key
set and there is nothing to fetch. The clamp forward to today, the `daysLeft` gate
and the memoized context are all shared with the roster's reading.

**The rows come back as `ResearchRow`s**, which is the whole economy of it: the
sort, the filters, the position pills, the include buttons, the marks, the
identity block and the paging are all phrased in that vocabulary and none of them
had to be told anything. Every stat field the projection cannot fill is **null**,
written out in `BLANK_STATS` rather than derived by walking the season row's keys
— a field added to `ResearchRow` later would be silently *carried over* by a map
over keys and silently blank here, and blank is the safe direction.

**A man with nothing to project keeps his row, dashed.** Dropping him would change
the board's *population* — the include counts, the position pills, `of 622` — to
say something about the span rather than about the league, and the sort already
puts a row of nulls at the bottom in both directions. `qualified` rides along
untouched: it is a fact about how much he has played this season, nothing reads it
under the lens, and blanking it would invent an answer where the honest one is
already on the row.

**The blank test is the *printed* count, not the raw one.** A reliever whose share
of a single day comes to four hundredths of an appearance projects two hundredths
of an inning: every count on his row rounds to nought, and the *rates* divided out
of those hundredths are his season's rates wearing a projection's clothes.
Measured on the 7-day pitching board before the test: Orlando Arcia — a shortstop
who threw one mop-up inning in April — read **`G 0 · IP 0.0 · ERA 4.26`**, a rate
with nothing on screen to be a rate *of*. The row is blank the moment its printed
innings are, and the batting side the moment its printed plate appearances are.

**Measured on the live board, 2026-08-24.**

| | rows | projecting | raw | gzipped |
| --- | --- | --- | --- | --- |
| batters, one day | 710 | 460 | 769KB | **44.7KB** |
| pitchers, one day | 821 | 173 | 894KB | **41.0KB** |
| pitchers, seven days | 821 | 519 | 838KB | **51.2KB** |

The raw figure is mostly the null run — forty-odd `"xwoba":null` per row, identical
on every one of them, which is what gzip is for. Warm, the route answers in under
a second; the context is memoized on the span and everything under it is cached
for hours already.

#### Three pre-existing engine bugs this board made impossible to miss

A board that sorts six hundred pitchers by a projected figure puts the engine's
worst case at the top of the first page, which is how all three of these were
found. **None of them is new** — every one was live in the Roster's own lens and
in the matchup card too — and all three are on the **pitching** side. A clean
A/B against the same day with only these constants moved: **710 of 710 batters
identical** on PA, HR and games; 503 of 821 pitchers identical, 318 moved, and
every one of them **downward**.

##### 1. A starter's recent month, read as if it were all starts

**Adrian Houser led the entire projected pitching board in strikeouts**, on 43
projected innings over two starts. He is not that pitcher.

`projectPitcher` blends a man's season outs-per-outing with his last thirty days'
and, on the **starter** view, divides each window's outs by that window's *starts*.
`projectOnePitcher` guards the season side of that with `startsAreHisRecord` — the
majority test that asks whether `outs / gs` is a number about starts at all, and
the thing that stops a swingman being projected for a starter's workload. **The
recent window had no such guard.** Houser's season is 25 games, 15 starts, 324
outs — a starter, 21.6 outs a turn, right. His last thirty days are **6
appearances and one start** for 75 outs, which is a month of long relief with a
spot start in it and says nothing whatever about how long his starts go; read as
`75 / 1` it claimed **twenty-five innings per turn**, blended to 39.4 at that
window's weight, and projected **78.8 outs over two starts**.

The recent term is now taken only where a majority of the recent appearances were
starts — the same majority test in the same words — and is otherwise null, so
`blend` falls back to his own season rate. **After: 43.2 outs over the same two
turns, 21.6 a turn, his season figure to the tenth**, and he is off the first page
of the board. The relief view needs no such guard: games are games whatever role
they were.

##### 2. A man with one appearance, read as pitching most days

**Andrew Sears was projected for 15.9 innings and 15.5 strikeouts over a week**
— the top of the board — off a career of **one four-inning outing**.

`shareOfFlags` answers *how often does he pitch* off the lineup record, and where
there is no stretch **before** his absence to read — a call-up, a debut, a man
traded in this month — it shrinks his thin record toward `RETURN_PRIOR` with the
weight of `RETURN_PRIOR_GAMES` club games. Both were **one number for batters and
pitchers**, and 0.55 is a batter's: a regular back off the injured list plays most
days. For a reliever it is more than double anything real — the league's own
figure this season is **0.182** over men with five or more appearances and 0.256
over the established ones.

A man whose whole record is one appearance therefore came out at
`(1 + 3 × 0.55) / (1 + 3)` = **0.6625**, and because his board ratio and his plain
rate over the window are the same one appearance, the factor `shareOfFlags /
plain` cancels and 0.6625 *is* his projected appearance rate. Three men on the
live board came out at exactly that number: Sears (1 appearance all season),
Khristian Curtis (2) and Kai-Wei Teng (1 in thirty days).

**Both constants are now per kind and both were swept**, in appearance space
against what actually happened: every pitcher and every club-day of the last
thirty, asking the rule for his share off the record up to that day and scoring
it against the share of his club's next six games he really did appear in —
**6,724 cases, 283 of them in this branch**, mean actual share **0.1873**.

| prior / pseudo-games | branch RMSE | branch bias |
| --- | --- | --- |
| **0.55 / 3** (as it was) | 0.36644 | **+0.3025** |
| 0.26 / 8 | 0.20891 | +0.1181 |
| 0.19 / 12 | 0.17767 | +0.0517 |
| **0.16 / 16** (shipped) | **0.17068** | **+0.0171** |
| 0.13 / 12 | 0.16949 | +0.0053 |
| 0.10 / 30 | 0.17930 | −0.0547 |

The basin is broad — every pair between `0.13/12` and `0.16/22` is inside 0.8% of
the best RMSE — so what decides it is **calibration** and **provenance**: 0.16 is
within a whisker of the league's own reliever appearance rate, which is what a
prior about relievers ought to be. Whole-population MAE over the same 6,724 cases
goes **0.13031 → 0.12302**. **Sixteen pseudo-games rather than three** matters as
much as the rate: *he pitched on the day he was activated* is close to no evidence
at all about the next six.

**The batter's pair is untouched at 0.55 / 3.** Nothing here says it is wrong; it
was measured on that population and this sweep is a pitcher's.

##### 3. One long outing, read as how long he always goes

Sears again, and the other half of his 15.9 innings: he threw **four innings** in
his one appearance, and `outsPer` was the single figure in `projectPitcher` left
unregressed — so the engine read that as four innings *every time he appears*,
against a league relief outing of **3.18 outs (1.06 innings)**.

The comment defending it says how long he goes is *a fact about his job rather
than about how well he has thrown*. That is true of a man with a record and says
nothing about a man with one.

**Swept against a genuine holdout**: the 7-day board is a subset of the season
board, so `season − 7d` is his record strictly *before* the week being predicted.
Scored over the **252 pitcher-weeks that were all relief**, weighted by the
appearances actually made:

| k (appearances) | MAE | RMSE | bias |
| --- | --- | --- | --- |
| **0** (as it was) | 0.9016 | 1.5989 | **+0.2621** |
| 4 | 0.7997 | 1.3790 | +0.1053 |
| 8 | 0.7655 | 1.3374 | +0.0340 |
| **10** (shipped) | **0.7571** | **1.3315** | **+0.0083** |
| 14 | 0.7510 | 1.3340 | −0.0318 |
| 20 | 0.7522 | 1.3544 | −0.0745 |

**MAE −16%, RMSE −17%, and the bias essentially gone.** 10 is the RMSE minimum
and the bias zero together.

**Only the relief branch takes it**, and that is the measurement's answer rather
than caution: the same sweep over the 134 pitcher-weeks that were all *starts*
improves MAE by 3% at k=30 and makes the bias **worse at every k** — +0.804
unregressed against +1.011 at 30 — because that side already runs long and the
league's 16.6 outs a start is above the typical actual. The original objection is
right where it was written; it was only ever wrong about relief.

**And the obvious fix was measured and rejected**, which is worth recording. A
swingman's `outs / games` mixes his starts into a relief workload — Kai-Wei Teng
is 26 appearances, 10 of them starts, 210 outs, so the plain figure says 2.7
innings an outing. Subtracting his starts at the league's own rate
(`outs − starts × 16.59`, over his relief appearances alone) looks like the answer
and back-tests **worse on every metric**: MAE 0.8064 against 0.7655 at the same k,
and a bias of **−0.279** against +0.034. A swingman's starts are openers and bulk
games far shorter than a rotation start, so the league SP figure strips too much.

##### What the three came to, on the board

| | before | after |
| --- | --- | --- |
| Andrew Sears | `G 4 · IP 15.9 · K 15.5` | **`1.3 · 1.7 · 1.6`** |
| Khristian Curtis | `3.3 · 13.1 · 11.9` | **`1 · 1.6 · 1.5`** |
| Kai-Wei Teng | `4.6 · 12.4 · 13` | **`1.5 · 3.3 · 3.4`** |
| Adrian Houser | `IP 26.3` over 2 starts | **`14.4`** |
| Payton Tolle, Gerrit Cole, deGrom, Nola… | — | **identical to the digit** |

The first page of the projected pitching board is now men with two turns in it,
and the deepest relief line on it is 6.0 innings over 4.4 appearances — a
50-appearance long man at 1.36 innings an outing. Every `IP / appearance` figure
among the men with no projected start now falls between **1.00 and 3.72**, which
is a relief workload; the top of that range is the genuine swingmen (Fedde,
Littell, Civale), which is right.

#### Measured

**Driven in a browser at 320 / 390 / 640 / 900 / 1200 / 1920**, batting and
pitching, lens on:

- page-body horizontal overflow **0** at every width;
- the control set stays **three rows** (36px each) — the panel is in the head,
  not the bar, so the bar is the bar it was;
- table rows **58.00px**, the header row **51.00**, unchanged from the measured
  board;
- the span line **15px**, drawn only under the lens;
- the panel **46px** with the three pills, **346** with `Custom` open, and the
  calendar 640px at 1400 against 346 at 390 (the panel's own width there);
- `.research-head` clips nothing at any width (`scrollHeight − clientHeight` = 0
  with the note and the calendar both open).

**Scrolled 900 into the pane at 1400**: the condensed rail holds the lit
`Projected` glyph with its label visually hidden, the head sits at 162 under a
rail at 102 with no overlap, and the span line is still on screen — which is what
the line is for.

**The whole flow, driven end to end**: press `Projected` → panel, 46px, `Week 20 ·
Week 21 · Custom`, nothing on the board changed; press `Week 21` → panel closes,
`PROJECTED · Sep 7 – Sep 20 · 14 days still to play`, the columns swap, `Columns`
and `Ranks` and the window tabs gone; press `Projected` again → `Custom` unlit,
`Week 21` lit, `Clear` drawn; press `Custom` → calendar at today; two presses on
the 28th → `PROJECTED · Fri, Aug 28 · 1 day still to play` with the `Opp` column
back; press `Clear` → the measured board, every control returned.

**Validated against the engine's own answer**, one row read out: Freddy Peralta on
2026-08-26, `@ DET 1:10 PM · RHP Melton`, `G 1 · GS 1 · IP 5.1 · BF 24.8 · W 0.2 ·
H 5.9 · ER 3.4 · BB 2.1 · K 4.1 · ERA 5.92 · WHIP 1.56 · K/9 7.2` — 24.8 batters
faced over 15.4 outs, and the four rates recompute off the counts printed beside
them.

**Bundle: 678.09 → 687.10 KB of JS** (200.37 → 202.93 gzipped) and **176.48 →
177.21 KB of CSS** (31.61 → 31.75) — 9.0KB of JS raw and 2.6KB over the wire,
against **0.7KB of CSS given back** raw and 0.03 gzipped, for a second reading of
the app's widest table, a server route, a column vocabulary, a picker, a span
control and a key. The stylesheet shrinking is the honest report: the accordion
the key opened into needed a block of rules, and the popover it became needs one
CSS value on a row that already had one.


---

## The lens's `VAL` column, and the two runs that survive the lens

**`VAL`** — what the projected line is worth in the categories the reader's
league scores, the same arithmetic the Overview ranks its top performers by
(`categoryValue.ts`). It leads the stat run, directly after `Games`: it is a
summary of everything to its right, and a summary that has to be scrolled to on
a nineteen-column board is a summary nobody reads.

**The span undivided**, which is the reading a projected board is opened for:
six games of a good hitter outscore three of an equal one, and *who will give me
the most this week* is the question. No divisor is needed to say so — the scales
are per-player-day and the terms are counts, so a line covering six games
already produces six games' worth. It is therefore **not** comparable to the
Overview's `+1.4`, which is a single day, and the title says which it is.

**Memoized per row** in a `WeakMap`: a column is asked for its value and its
format separately, the arithmetic walks every category the league scores, and
the board draws six hundred rows.

**And `VAL/G` beside it, off by default**, which is the same figure per
appearance — *how good is he on a day he plays* against `VAL`'s *how much will
he give me over these days*. It exists because the Overview's High Value rail
offers both readings and the `See more` card at the end of that rail opens
**this board sorted on the rail's own column**: without a column for it, a rail
ranked per appearance would land on a board ranked by the total and look like
the door had done nothing. That is the fault `withProjectedColumn` was written
to prevent for the four held-back trend windows, arriving here for the same
reason and handled the same way — the door turns the column on itself.

**Off beside `VAL`'s on**, which is the call `SV` and `HLD` get beside `SVHD`:
the total is the read a projected board is opened for and the per-appearance cut
is the follow-up question, and two columns of one figure on by default would be
the board answering something nobody asked in the place it has least room. It is
a tick away in the picker, under the same `Fantasy` heading.

**Two decimals where `VAL` takes one**, and forced rather than chosen: the whole
live spread of this figure inside a seat is about 0.55–0.65 for batters, so one
decimal prints seven of a top eight as `0.6` and the order stops being readable.
Same cell width either way — `+0.65` and `+13.8` are both five characters.

**A dash under one projected appearance.** `projectedRowValuePerGame` is null
there, and deliberately: dividing by less than one appearance does not produce a
per-appearance figure, it produces his rate with no appearance under it. It is
the rule `Games` already follows one column over, printing a dash rather than a
`0` that would claim a measurement. The floor lives in the figure rather than in
any one caller so that this column, the rail and the door between them read one
list — `client-overview.md` carries the sweep that sets it at one appearance,
and the measurement that shows what putting it anywhere else costs.

**Two counts the server had to start sending.** Every term the scorer needs is
on the projected row or falls out of what is — singles from hits less the
extra-base hits, total bases from the four of them — except `hbp` and `sf`,
on-base percentage being the one rate in baseball whose denominator is not the
obvious one (`AB + BB + HBP + SF`). They ride on `ResearchRow` as optional
fields the projected board fills and nothing prints. Two more, intentional walks
and wild pitches, are simply not projected and score nought for everybody, which
lowers every row by the same amount and so changes no ranking.

### `VAL` is filed under `Fantasy` in the picker, and a section has one heading

The picker cuts the column list positionally: a column names a section and the
ones after it follow, which is what makes the picker's order the table's order —
a reader who found `OBP` three columns along finds it three chips along.

`VAL` broke that in both directions at once. It named a section `Value` for
itself alone, and because the cut runs on, that section then **swallowed the
whole counting run behind it and retitled it**: measured on the lens before the
fix, the picker's second section read `Value` over `VAL PA AB H/AB R HR RBI BB K
SB CS`, and `Counting` above it held `G` by itself.

It belongs in **`Fantasy`**, with `Ros%` and the five `Δ` windows — the section
for the facts that exist only because a league is connected, which is exactly
what a line scored against *your* categories is. That takes two things:

- **`columnGroups` merges same-titled sections.** `VAL` leads the table's stat
  run and `Ros%` closes it, so the two `Fantasy` runs are at opposite ends of one
  list; cut positionally they were two sections with the same heading, which
  React draws under one key and which asks the reader which of two identical
  headings is theirs.
- **A recurring section sits where its *last* naming column does.** Ordering on
  the first would move `Fantasy` from the end of the picker — where a reader has
  learned `Ros%` and the `Δ`s are — up to second, for the sake of the one line of
  it that leads the table.

And the counting run re-declares `G`'s own title, so the merge puts the eleven
columns back under one `Counting` heading in the order the board draws them.
Measured after: `Counting` (11), `Slash line` (5), `Rates` (2), `Fantasy` (`VAL`,
`Ros%`, `Δ1d`–`Δ30d`). The measured board is untouched — no title repeats there,
so nothing merges and nothing moves.

### `SVHD` is a sum, so it is rounded back to a tenth

The board prints a count with `String` rather than to a width, and it is right
to: on the measured board every count is an integer and `5.0` would be a lie
about the precision of it. Under the lens they are tenths — `projection.ts`
rounds every printed component with `round1` precisely so a reader can add a
column up and get what was printed — and `String` is still right for one of
them.

**It is not right for the sum of two.** `SVHD` is the one derived count on the
lens's own key list that adds two projected figures together, and two tenths do
not add to a tenth in binary floating point: Brock Stewart's `0.4 + 2.3` is
`2.6999999999999997`, and that is what the cell printed. Reported off the
shipped board, and measured there — pitchers over Aug 26 – Sep 6, 823 rows, 230
with a saves-plus-holds figure at all, **25 of those 230 printing a
seventeen-digit string**.

**Rounded in `svhd` rather than in `credit`**, because the format is not the
only reader. `value` is what the board sorts on and what the filter builder
thresholds against, and `SVHD ≥ 2.7` against `2.6999999999999997` is a row the
reader can see and the filter cannot — a fault that survives any fix made in the
formatter. One arithmetic, one implementation.

The roster's own projected table never had this: `SummaryTable.tsx::projCount`
rounds to a tenth before printing, because it prints a column a reader adds up.
The board's `count` and `credit` do not, which is the difference the fix works
around rather than erases — a **new** derived count on the lens's key list owes
the same rounding at the point the arithmetic is done.

**`Ros%` and the five `Δ` windows are drawn under the lens now**, and were not.
The lens's rule is that it draws only what a projection can fill, which is the
wrong test for these two runs: they are not projections of anything. They are
facts about *now*, true whichever days the table is drawn over, and they are the
two facts a projected board is most often opened beside — *who is worth picking
up this week* is that column set read against `VAL`. They are the board's own
columns, same keys and same saved-list entries, so a reader who has turned
`Ros%` off keeps it off across the toggle.
