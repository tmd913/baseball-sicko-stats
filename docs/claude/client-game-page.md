### The game page

`GamePage.tsx` — one game, whole: the line score, both clubs' box scores and
rosters, and every play in the order it happened. It is the **third** thing in
this app to be a full-screen page, after a player's and a club's, and it is
their sibling by construction rather than by resemblance — the box, the pinned
chrome, the back button, the tab strip, the scroll reset and the Escape are
`DetailsShell`, which neither of the other two owns either.

Read `client-team-page.md` beside this, and `client-player-page.md` behind that:
the shell's own reasoning — the measured chrome, the Escape rule, the focus and
inert handling — was written on the player page, was found there, and is
documented there. This file is what is different about reading **one night**.

---

## What makes it a page

Every other reading of a game in this app is a reading of a game **through
somebody**. The outing page is a pitcher's night. The feed's cards are a
roster's plate appearances. The preview dialog is a matchup one man is about to
stand in — `SchedulePreview` takes a `PreviewSubject` and cannot be opened
without one. There was nowhere to answer *what happened in this game* that did
not first ask *to whom*.

That is a different subject, and it is several screens of table: nine batting
lines a side with their substitutes, every pitcher who took the mound, two
benches, two bullpens, a line score and four hundred sentences. The same
argument `OutingPage` makes for itself one level down — a dialog is a panel over
a page you are still reading, and this *replaces* the reading.

---

## Three tabs

**Overview · Box Score · Plays**, and the order is the order a reader asks for
them.

### Overview

**Three different pages, and which one is the game's own state.** That is the
whole of this tab's design and it was got wrong first.

- A game that has been played is the **line score** and the **decisions**.
- One that has not is **who is pitching it** — `Probables`, away over home, a
  club that has named nobody drawing nothing rather than `TBD` (the fixture
  row's own rule: clubs name a starter about three days out, so past the front
  of the window the absence is the schedule rather than a fact about the game).
- A **postponement** is one sentence, because there is nothing else true about a
  game that did not happen.

Drawn the first way for all three, a scheduled game came out as two rows of
empty line-score cells, a `Decisions` heading with nothing under it and *Nothing
has been played yet* — a page saying the same non-thing at length. Seen at
1200×1400 on gamePk 823585 before the split.

**There was a `Scoring Plays` block and it has gone.** It was five of MLB's
sentences with the score beside each, and the Plays tab's `Scoring` cut is the
same reading in the app's own items one tab along — so the block was a second
answer free to drift from the first. Its going took a good deal with it: the
`GamePlay` type, `buildScoringPlays`, the `scoringPlays` field on `GameReport`,
`PlayRow` and ten `.game-play*` rules, all of which had that one block as their
last reader. The report went **11,482 → 7,352 bytes** with the field.

**The line score's cells are doors**, which is the other thing that changed
here: see *A half-inning as a popup* below.

`hasStarted` is the one test the three blocks make and it is written once, as a
test for the two states that *did* happen rather than a test against
`scheduled`: a postponement is a `Final` on MLB's wire, which is the trap
`schedule.ts::stateOf` names.

**The line score is its own table** and is the one place this page cuts its own
rather than folding onto the three wide ones. Those are read *down* a column of
a hundred rows; this is two rows read *across* twelve narrow ones, so every
declaration they carry for the first — the 13px cell padding, the zebra stripe,
the minimum column width — is wrong here or does nothing. Two objects that would
agree about a font.

It **shrinks to the innings rather than to the page**, which every other table
in this app does the opposite of. At 1200px `width: 100%` spread twelve numbers
100px apart — a picture read across, drawn so wide the eye cannot. `width:
max-content; max-width: 100%` gives it both readings: compact where there is
room, scrolling in its own box on a phone.

**But a phone is where it has to be read whole, and it was not.** Measured at
390 the table came to **426px in a 356px box** — 70 over — and what fell off the
right was the **H and the E**, `R` being the last column visible. That is the
wrong two of the three to lose: R is the score, which the head one line up has
already said, and H and E are the two facts the line score adds to it.

The 70px was **reservation rather than content**. `min-width` is a floor on a
border-box here, so nothing ever clipped against those numbers — a wider column
simply pushed past them — which made the 30px an inning and the 34px a total
slack, held for digits that were not coming. Reset from the ink at 13px Inter
with `tabular-nums` — **25px an inning** (two digits is 16.23, or the 800-weight
header in extras), **26px a total** (two digits at 800 is 17.67, and three is a
score nobody has posted), **8px either side of the club** rather than 12
(`width: 1%`, so its width is its own abbreviation, widest `WSH` at 32.3) — the
worst case is **351.3 in the 356 box** and the whole line score is on screen at
390. The stylesheet carries the arithmetic and the two games it was measured on.

**A narrow-screen block was the first shape and was rejected**: two sets of
numbers for one table is two definitions that agree today, and there was no
measurement behind the 30 and the 34 for a wide screen to keep.

#### It takes the gutters on a phone and the column on a desktop

**The `width: max-content` above never did what it says.** `.game-ls-team`
carries `width: 1%`, and a percentage width on a cell defeats the intrinsic
sizing of the box around it — so `max-content` resolved to the container every
time, and at 1200 the table measured **1166px, the full page**, which is exactly
the width the comment was written to prevent. The sentence stands because the
*argument* is right; what was wrong was believing the declaration carried it.

What carries it is the block. **This page had no capped block on any of its
three tabs** — measured at 1440, every one of them **x=16 and 1408 wide** under
a head and a tab strip that are 680 and centered, while the player page's own
cards were **800 at x=320** and the team page's `Next Games` likewise. So the
Overview's four blocks, the Plays tab's half-innings and its filter row take
`.ovw-column`, which is the player page's `--card-column` rule with the game
page folded onto it rather than a second cap that agrees with it. After: **800
at x=320**, the same axis as the other two pages. The **Box Score is
deliberately not in it** — four stat tables and a roster are the *other* kind of
block, the kind that takes the window and bleeds, and its counterparts (the
player page's Season and Last 5, the team page's Season) are uncapped too.

The Plays tab is the sharpest case: it draws **the feed's own items**, and
`.live-feed` measures 800 at x=320 at 1440 — so the same plate-appearance card
was 800 wide on the Feed view and 1408 wide here.

**And on a phone the line score was the last table on this page stopping
short.** The Box Score is in the `--table-bleed` list and the line score was
not, so at 390 the two tables on one page sat at **x=0 w=390** and **x=16
w=358** — one page saying twice, differently, where its left edge is. The box
now takes the gutters back by however much of them is left to take:
`--card-column` less the container, floored at 0 and capped at `--table-bleed`,
which is 16 where the block is against the pane's padding and **0 where the
block is already capped**, so it reaches the glass at 390 and sits flush with
its siblings at 1440. `margin-inline: auto` cannot express that — a box wider
than its containing block gets auto margins of *zero*, which `.details-tabstrip`
had already measured — so it is written as the width expression divided out of
the container, the way that rule writes it. The innings get the 32px back with
it: the ten-inning game that scrolled 15px over now fits.

**The sides of the box are a breakpoint and the rest is not**, because
`border-width` rejects percentages: `max(0px, 1px - var(--ls-bleed))` is thrown
out and the border falls back to `medium`, measured at 3px on every side. The
number is derived — the bleed is spent in full up to a viewport of
`--card-column` + `--table-bleed`, **816** — and then swept: the box sits at x=0
through 816, at x=1, 8 and 15 across 817–831 as the bleed runs out, and at x=16
from 832 up. Drawn both ways at both ends, the stripped box is plainly right at
390 and the kept one plainly right at 1440, where without it the rows run off
into nothing on either side.

**`x` is a half nobody played, and it is drawn only on a game that is over.**
The wire sends the same absent number for two different facts and nothing in the
payload separates them:

- the bottom of the ninth with the home club ahead — gamePk 822696's ninth
  arrives as `{"num":9,"away":{"runs":0},"home":{}}` on a final game;
- **a half being played that has not scored yet** — gamePk 823745 in the bottom
  of the eighth, `{"num":8,"home":{},"away":{"runs":0}}`.

What separates them is the game's **state**, which the client has and the server
does not need. So the wire stays honest (null means MLB sent no number) and the
judgment is made here. The server deliberately does **not** pad the innings out
to `scheduledInnings` for the same reason — a rain-shortened seven-inning final
would have grown two innings nobody played and drawn `x` in both. The client
pads the *columns* instead, so a game in the fourth is drawn against the nine it
is heading for rather than growing one under the reader every twenty minutes.

#### A half-inning as a popup

**Every cell of the line score that was batted in is a door**, and what it opens
is a **dialog** holding that half-inning's plays — the same feed items the Plays
tab draws, off the same `buildHalves`, so a half cannot read one way in the box
and another in the stream.

The line score is the one picture of a game that is already *by inning*, and a
reader looking at the `5` in the Nationals' fifth is asking what happened in it.
A dialog is what that press deserves: it is a detail about one thing, the page
behind it does not move, and Escape or the backdrop puts it back — which is the
argument `PlateAppearanceCard` already makes for the box it opens, one play
smaller.

**It sent the reader to the Plays tab for a commit, and the machinery that took
is what condemned it.** To land somebody on the fifth it had to open that tab's
paging out to the fifth, scroll to it, and then **hold** the target while every
clip in the four innings above resolved and pushed it down the page — measured,
the block finishing 5px below the fold before the holding was added, and needing
a `ResizeObserver`, a wheel listener and a timeout to stay put. Three mechanisms
to put a reader somewhere they had not asked to be, against one box holding the
six plays they had.

**A half nobody played is the one cell that is not a door**, and the test is the
`x` rather than the null: two absences arrive as the same missing number (see
the server's `buildInnings`), and the one that is still being thrown has plays
to read. The cell **is** the press — `.game-ls-door` fills it rather than
wrapping the digits, one or two characters not being a target — and it carries
no underline and no color of its own, because a line score is a picture and a
grid of eighteen dotted numbers would be a picture of the links.

The dialog's read is the Plays tab's own route, so **whichever of the two the
reader reaches first pays for it** and the other finds it done.

**Game Info prints MLB's labels and values unedited** — pitches-strikes per
pitcher, the umpires, first pitch, the attendance, the weather. They are prose
off the wire rather than fields, MLB's list differs game to game (a pitch-timer
violation appears only where there was one), and a curated subset would go
quietly stale the first time MLB added a kind. **The ballpark is dropped from
it**: the head names it already, on every tab, and one fact twice in one page
reads as two facts that happen to agree.

### The line score says where the game is, and where it is not yet

**A cell with no number in it is a dash, not a blank.** Three things can be in
one — a number, an `x` for a half nobody played, and nothing at all for the
innings a game has not reached and the half being thrown right now — and the
third had no mark. A blank is not the absence of a reading, it is a reading the
table failed to make: on a game in the fourth it drew five empty columns that
looked like the table running out rather than like five innings still to play.
An em-dash is what every other table in this app prints for a figure that is not
there yet.

**And the inning being played is marked on its column** — the header and both
cells. A live line score is the one reading on this page where *where we are* is
half the information, and nothing on the table said it: a game in the seventh
drew six columns of runs, three empty and a nine, and the reader had to find the
last filled cell and add one. The chip in the head says `Top 7` and the column
now says which seven that is.

It takes `--accent`, which is what the app's colour rule reserves colour for — a
live inning is named in `RULES.md` explicitly, beside a postponement and a
lineup pip — and it takes it as a **wash on the column** rather than as ink on
the digits: the runs in that column are the same runs as the ones beside them,
and colouring them would say the numbers are different. The head is the loud
half (accent outright, on a number nobody was otherwise reading); the two cells
take a tenth-strength wash, enough to draw the column together and not enough to
compete with the runs in it. The header also carries the fact in words on its
`title`, the app's rule that identity never rests on hue alone.

`null` on anything but a live game, which is what keeps it a mark on a *state*:
a final game has no inning being played, and marking the last one would be a
live tint on a game that has stopped. Measured on a live game in the seventh:
innings 7, 8 and 9 draw `–`, the 7th column marked on the header and both cells,
and nothing marked once the game goes final.

### Box Score

**One club at a time, and the switch above the table is which.**

It drew **both stacked** for a commit, on the argument that a game is two
subjects and the reader is comparing them — a box score you cannot read across
being most of what a box score is not for. That argument is right about a *line*
score, which is two rows and is on the Overview; it is wrong about this, which
is four tables and forty names a side. Nothing on the away club's batting line
is read against a number on the home club's, and stacking them put **ninety
rows** between a reader and the second half of what they opened.

So the two clubs are two tabs, in **`.view-switch`**'s own shape — the same
control the team page pins over its own two halves and the Park tab keeps inside
itself, which is `role="tablist"` and two `role="tab"` buttons. They are named by
**abbreviation**, which is what every table in the app calls a club and what the
head three lines up has just said. **Away leads**, the order every line score in
this app is written in.

It is **not on the page's own strip**, where it would read as `Overview · CHC ·
WSH · Plays`: that strip names the *kind* of reading a tab holds, and two clubs
are two subjects rather than two readings. The same division the team page makes
between its strip and its side switch.

It is the **roster** reading as well as the stat one — the bench and the bullpen
under each club's two tables — because MLB files them as one thing and splitting
them would put a man's name on two tabs. That list is the half a fantasy reader
opens it for: whether the man they were watching was rested or is simply not up
yet.

**The table is folded onto the three wide ones** (`.glog-table`,
`.stats-table`, `.opp-table`) rather than restyled: the shape, the gutters, the
cell padding, the zebra stripe and the sticky header are one definition. What is
this table's own is the **name column**, which is a slot number, a name, and the
position or the decision after it.

**`"801"` is the second man in the eighth slot.** MLB writes a batting order as
the slot in hundreds and the depth down it in units, which is what lets a
substitute be indented under the man he came in for rather than filed as a tenth
hitter. The server sorts by that number rather than by the order men came up
(`boxscore.batters` puts a pinch hitter wherever he happened to bat); the client
draws the slot only on the man who *started* it, and reserves the box on every
row all the same — without that the names step left wherever the number is
absent, which is *reserve the box, don't move the page* on a fourteen-character
scale.

**A man with no batting order is not in this table**, and that is a filter on
the server rather than a sort. MLB appends the pitchers who took the mound to
`batters` whether or not they ever occupied a lineup slot, so with a designated
hitter the batting table came out ten and eleven rows long with the relievers on
the end at `0 AB, .000, .000` — seen on gamePk 822696, Kevin Gausman and Aaron
Civale under the Cubs' nine. No box score has ever printed that. **The test is
the slot rather than "is he a pitcher"**, which is what makes it right in the
games where it matters: a pitcher who does bat occupies a slot and stays, and so
does a defensive substitute who came in and never came up.

**The decision rides on the pitcher's name as MLB writes it** — `(W, 10-5)`, the
credit and the record it left him with as one string. Re-deriving it from
`decisions` would lose the record half, which is the part a reader looking at
the line wants.

**It takes three tones and took one for a commit.** `--hit` for all of them put
a *loss* in the app's live green, on the one line of the table where the reader
is being told the pitcher lost the game — seen at 390 on Kevin Gausman's `(L,
6-11)`. Green for a win and red for a loss is the game log's own vocabulary
(`.glog-res-w` / `.glog-res-l`) and the two surfaces must not disagree about
what a `W` looks like. A save and a hold take neither, being credits rather than
results; a third color would say they were a third outcome.

### Plays

**The game as it happened, drawn as the feed draws it.**

It was a list of MLB's sentences with the pitcher under each — accurate, short,
and not what a reader of this app means by a play. A play here is a
**`PlateAppearanceCard`**: the pitch sequence in the zone, the exit velocity and
the distance, xBA and xwOBA, the win-expectancy swing, and the colored rail that
says what the outcome was. So this tab draws the same **`FeedItem`** the
roster's stream and the player page's Overview draw, off the same
**`playerDayEntries`**, and the three readings of what happened cannot disagree
— which is the property that function was kept as one function for.

**The base-running comes with it**, which the sentence list had no shape for: a
steal, a wild pitch, a run scored are items of their own in the feed and are
items of their own here, in play order under the at-bat they happened on.
`liveEvents` are folded in beside `entries`, because on this page there is no
Live section to pin them to — a steal taken behind the batter at the plate
belongs in the inning it happened in.

**Grouped by half-inning**, which is the whole of the reading: a stream without
it is a hundred cards, and with it a reader can find the fifth and read the four
plays that turned it. Each heading names the half **and the club that was
batting**, because "Top 5th" alone leaves the reader to remember which side is
away.

**Read forwards**, where the feed reads newest-first — `byPlayOrder`, which is
the feed's own comparator negated and is exported for exactly this. A roster's
stream is *what has just happened*; a game is a narrative, and that comparator
puts cause before effect within a play (the single, then the steal it set up,
then the run).

**A pitcher's outing is not here.** In the feed his stream item is the whole
appearance, which is a different reading of this game and one the Box Score tab
already holds; his base events are rows inside it rather than items (see
`LiveFeed.tsx::baseEntries`). So the server sends batter reports alone, and
every play in the game is on one of them.

**A run that is nothing but a run is dropped.** In the feed a runner crossing
the plate is an item of its own and has to be: that stream is a *roster's*, and
the man who scored is very often on it while the man who drove him in is not.
Here both are on the page by construction and the at-bat above says it twice
over — MLB's description ends *"Jorbit Vivas scores"* and the score on the
item's own head has already moved. **Only where the run is the whole of the
item**: `groupBaseEvents` gathers one play's events into one, so a steal of home
is a steal *and* a run and a runner who comes in on a wild pitch is a wild pitch
*and* a run — those are plays no at-bat carries, and they keep both badges.
Measured on gamePk 822696: 71 items become **65**, and the one base item left is
a stolen base.

#### `sameGame`, and one inning at a time

`FeedItem` gained one prop for this caller, and it is not a reading of
`grouped`: that one means *the header above me says who*, `multiGame` means *and
it cannot say which game*, and **`sameGame`** is *the page says which game*. It
drops the matchup off the identity row, `CHC vs WSH` on all sixty-five rows
being the mark that marks nothing.

**What keeps seventy cards off the page is a page, not a thinner card.** There
was a second prop for a while, `showClip`, which turned the inline film off
here: measured on gamePk 822696, 71 items with a clip apiece make a **35,747px**
page — forty screens — and fire **65** clip lookups the moment the tab opens.
Taking the film away fixed both numbers and took the best of a feed item with
it, so it went, and the tab **pages** instead.

**The page is an inning**, because that is what a game is read in — six to ten
plays, which is `FEED_PAGE_SIZE` arrived at from the other direction. One to
start, and each press of the feed's own `Show more` adds one more, the button
naming the inning it will open and counting how many are left. Measured: the tab
opens at **3,327px with 6 clip lookups** and reaches the whole game in eight
presses.

**Only on `All`.** The `Scoring` cut is a dozen plays over the whole game and is
the summary a reader switched to *because* it is short; paging it would be a
control answering a problem that filter had already solved.

**The reset is on the cut alone.** It watched `reports` too, on the reasoning
that a new game is a new page — but a new game remounts the whole component
(`GamePage` is keyed on `gamePk`), so the only thing that dependency ever fired
on was the read *landing*, which undid whatever the reader had opened. And the
test for "this run is the mount" is **the value already held** rather than a
first-run flag: a flag spent on the way out is the trap `RULES.md` names and this
codebase has found four times, StrictMode running a mount's effects, tearing
them down and running them again.

**`All` / `Scoring` is a filter and not a second list.** A scoring-plays reading
already exists on the Overview and is the summary; this is the same stream cut
down, which is what lets a reader who has found the inning they want widen back
out to it in place. `Scoring` is *did a run cross the plate* rather than a test
on `rbi` alone — a run scored on a wild pitch has no RBI and is a base event, so
the test is `pa.rbi > 0` or an event of kind `run`. Its empty state names the
**control** rather than the game — *No scoring plays — press All for the whole
game* — because a message reading "nobody scored" would claim a fact about the
game where this is a fact about the button above it.

**The read is lazy and its own route.** `/api/games/:gamePk/plays` is ~150KB raw
(**21.5KB gzipped**) against the report's 11.5, and it costs a `getDay` — so it
is made when the tab opens, the rule every read on the player page follows. It
re-reads on the same twenty-second clock while the game is being played, and
quietly.

---

### The inning picker, and `Live` first

**The Plays tab pages an inning at a time and now chooses which end to page
from.** Beside the `All`/`Scoring` cut there is a `<select>`: `Live` (only while
the game is on), `All innings`, and every inning the game has.

- **`All innings`** is what this tab has always been — forwards from the first,
  `Show the 2nd` adding one.
- **`Live` reads backwards**, and it is the **default while a game is on**. A
  reader who opens the Plays tab of a game in the seventh has come for the
  seventh, and paging forwards from the first made them press `Show more` six
  times to reach it. So the newest half leads and `Show the 6th` adds the one
  below it.
- **A number is one inning on its own**, which is the question the line score's
  own cells ask and the only way to ask it of this tab without paging to it. It
  is never paged: one inning is one page by construction.

**Descending reverses the blocks and nothing inside them.** A half-inning's own
plays stay in the order they happened — a half read backwards is not a reading
anybody wants — so what reverses is which half is at the top.

**The pick rides in a per-game memo beside the paging** (`pickMemo` next to
`shownMemo`), so a page stepped back onto comes back on the inning it was left
on, which is the argument `shownMemo` already makes applied to the other half of
what the reader chose. **`live` is normalised on read rather than watched**: a
game that was on when the page was opened and has since ended leaves `live` in
the memo and the dropdown no longer offers it, so it reads as `all` there —
the app's standing rule for an unrecognized value, and it needs no effect to
chase the state change.

**Hidden under the `Scoring` cut**, which is a dozen plays over the whole game
and is never paged: a control that cannot change what is on screen is worse than
no control, because nothing would say why nothing happened.

The select is `.research-pick-select`'s family folded onto rather than restyled
— the app's one dropdown shape, drawn at every width, with the app's control
height and its own chevron. Measured on a live game in the top of the 7th:
options `Live · All innings · 1st … 7th`, value `live`, one block drawn
(`Top 7th · NYY batting`) and `Show the 6th · 6` under it.

## The head

**Two clubs with the score between them**, which is the one thing that names
this subject: a game has no portrait and no single club to take the crest's
place. So it is a row rather than `.details-id`'s photo-beside-text column.

**It stands 32px off the `Back` button where the other two pages stand 20**, and
the reason is what is next to the button. `.details-head`'s 20px column gap is
right where the thing after the button is a *portrait* — a player's headshot and
a club's crest both carry their own ring of empty pixels, so 20 reads as more
than 20. A game's head begins with a crest and then immediately with the
**score**, `NYY 1 – 7 LAA` set large and bold, and at 20 the `Back` chip and the
away club's abbreviation were two runs of text a thumb apart with nothing
between them. 32 is the gap the other two *look* like they have. It is a
`column-gap` scoped with `:has(> .game-head)`, so on a phone — where the head
wraps to its own line under the button — the horizontal gap is not spent at all
and the row gap is the shell's own 16. Measured at 1200 and 390: gap 32 at both,
and `--details-chrome-h` unchanged at 137px.

The crests are **`TeamPhoto`** — the same round mark the research board's team
rows and the summary table's club cell draw, at a size this box sets through
`--row-photo` (34 rather than the row's 42: two of them plus two scores and a
separator have to fit a phone beside the back button, and the head is pinned
chrome, so every pixel it takes is a pixel off every tab under it). Each is a
**door to that club's page**, which is what makes the head worth its space: a
reader who arrived from an opponent cell is one press from either club.

**The home club is written inwards** (`flex-direction: row-reverse`), so the two
scores meet in the middle either side of the separator and the eye lands on the
pair rather than hunting the ends of a line. `@` before first pitch and `–` once
there are two numbers — the same two shapes the summary table's opponent cell
draws, and for the same reason: a matchup is a fixture until it is a result.

**The status chip is `.game-status`**, folded onto rather than restyled. Its
four state modifiers are what the summary table's cell, the schedule grid and
the feed's bar already draw, and a page that gave a live game its own green
would be a second definition of what live looks like.

**The box is held while the read is out.** The head is pinned chrome and
publishes `--details-chrome-h`, so a head that grew when the answer landed would
push every tab under it down under the reader. The empty state is the same three
rows with nothing written in them.

---

## Names

**A name is a door where this app can open one, and plain text where it cannot.**
That is `StarterName`'s rule one table wider, and it is why `GamePage` takes
`players` at all: `App::detailsPlayer` renders a player's page only for a key one
of its two sources can resolve, so a name that list has never heard of would open
a page that never appears — *a row that looks pressable and is not is worse than
one that plainly is not*.

The test is a **set of `${kind}-${id}`** rather than a map of ids, because that
is exactly what `detailsPlayer` resolves against and because a two-way player is
two keys: his batting line should open his batting page and his pitching line
his pitching one, which a lookup keyed on the id alone could not say.

Measured on gamePk 823507 (TOR at NYY): **28 of 28** names in the two box scores
and **24 of 24** on the two rosters are doors; the eight `.game-box-name` cells
without one are the four headers and the four totals rows.

---

## The reads

One route, `/api/games/:gamePk`, read on open and — while the game is being
played — again every **`LIVE_POLL_MS`**, which is the roster's own clock so that
a reader with both open never sees two answers about one game a beat apart. The
poll is keyed on the *state* rather than on the report, so the twenty seconds
are not restarted by the answer that arrives.

The poll is **quiet**, which is rule 1: the last answer stands while the next is
in flight, nothing blanks, and **a failed re-read leaves the last answer
standing** — the banner is for a page with nothing on it, and blanking a box
score the reader is in the middle of would be the loading rule broken in its own
words. A block wait is drawn only where there is nothing on screen yet and only
past `WAIT_DELAY`.

**The sequence number is bumped rather than compared against a key**, which is
the one place this page differs from the team page's own reads: the poll asks
for the *same* game over and over, so a key would be equal to itself and every
answer would look current.

**The page 502s honestly** where every enrichment in this server costs its own
column and nothing more. That is the `/api/schedule` exception and the same
test: the answer *is* the page. There is nothing else on screen, and a page of
dashes would be indistinguishable from a game nobody played.

---

## The server

**`GET /api/games/:gamePk`** → `GameReport`, built in `server/src/game.ts`.

### Why it is its own module and not a wider `StatsApiGame`

`mlbStats.ts::getStatsApiGame` already reads this exact feed and already caches
it, so the obvious move was to widen that type and bump `FEED_CACHE_VERSION`. It
was rejected on three counts, and they are worth keeping because the same
temptation will come back with the next feature that wants a game.

- **What that type is cut for.** Every field on `StatsApiGame` is *per player* —
  a batter's plate appearances, a pitcher's faced batters, a runner's base
  events — because every reader of it is a player: the day snapshot, the feed,
  the game log. A line score by inning, a bench, a bullpen and a list of the
  game's own plays are facts about the **game**, and none of the four surfaces
  that read a day would draw one.
- **What the bump would cost.** 622 settled feeds are frozen on disk under
  `game-<pk>-v8.json`, and a version bump reads every one of them as a miss —
  the whole season re-fetched to carry a field the day view does not draw. The
  version rule exists to stop a stale blob serving nulls; paying it for a field
  nothing in that pipeline reads is the rule applied where it does not bite.
- **What it would cost a live day.** That module resolves a live game through
  `diffPatch`, which is the whole reason a day of fifteen games can be re-read
  every twenty seconds. This page reads **one** game and can afford a plain
  fetch of it.

### The field filter, measured

The unfiltered feed for a finished game is **697,054 bytes** (gamePk 822696).
With the whitelist it is **110,199** — a 6.3× cut — and every field the module
reads survives it, checked leaf by leaf against the full payload before a line
was written. That is the repo's own rule about upstreams: a `fields=` list is
leaf-matched, and a name left off does not fail, it returns a column of nothing.

The cut matters twice over: a settled game pays it once ever, and a **live** one
pays it every twenty seconds for as long as somebody is watching.

The built report is **8,227 bytes** for a finished game (822696), and it was
**29,501** when this page was first written. It shed the play list in two
steps, and both are the same rule: *a field nobody reads is a field nobody
misses.* The Plays tab moved onto the day pipeline, which left the Overview's
five-row *Scoring Plays* block as the only reader of sixty-four plays
(`scoringPlays`, `REPORT_VERSION` 2); then that block went, the Plays tab's
`Scoring` cut being the same reading in the app's own items — and `GamePlay`,
`buildScoringPlays`, `PlayRow` and ten stylesheet rules went with it.

### The cache, and what may be frozen

`game-report-<pk>-v1.json`, plus the same in-memory pin `getStatsApiGame` keeps
— with the same consequence written down where it was found there: dropping a
bad blob does nothing until the server restarts.

**Only a settled game is frozen**, and `isSettled` is `mlbStats.ts::isSettledFeed`'s
test reached at the same three branches: a final game MLB has closed out names
**both** a winner and a loser; a postponement or a cancellation is settled the
moment it is called; and a **tie** has neither by definition, so it is read off
the line score. That module's copy was found by a hold missing from exactly 1
blob in 622, and this page's box score would lose the same credit in the same
window. It is restated rather than imported because that one takes `LiveFeed`, a
type private to a module whose payload is a different `fields=` cut of the same
endpoint. **The two must move together; each names the other.**

**`isFinalStatus` and `isPostponedStatus` are exported from `mlbStats.ts`** so
this module does not restate MLB's status keys. There were three readings of
them already (`stateOf`, `isPostponedStatus`, `buildGameStatus`) and a fourth is
where the three start to disagree — the same economy `schedule.ts::stateOf`
makes for `gameLog.ts`.

### `GameStatus` is one shape

`buildStatus` fills `bases`, `atBatId`, `onDeckId`, `onBaseIds`, `pitchingId`
and `inGamePitcherIds` with nulls and empty arrays, and that is deliberate: a
`GameStatus` is one shape across the whole app, and a second one differing in
six fields would be a second thing every reader of a status has to know about.
Those six belong to the *day* pipeline, which builds them from the `offense`
block this cut of the feed does not ask for.

### The plays route, and why it is the day pipeline

**`GET /api/games/:gamePk/plays`** → the day's own `PlayerReport`s, narrowed to
this one game.

The Plays tab drew a thin sentence list first, and the answer to *"plays should
be structured like they are on the feed"* is not to grow that list until it
resembles a feed item. A feed item is a `PlateAppearanceCard`: the pitch
sequence, the exit velocity, xBA and xwOBA, the win-expectancy swing. Every one
of those is already computed, per plate appearance, for **every player in every
game** — `savant.ts::getDay` merges MLB's feed with Savant's day CSV and caches
the result per date, which is the read the roster view makes anyway.

So the route hands back that, and the client draws it with `playerDayEntries`
and `FeedItem`. **Batters only**: a pitcher's stream item is his whole outing,
which the Box Score tab already holds, and his base events are rows inside it
rather than items.

Measured cold: **1,002ms** for 2026-08-13 and **385ms** for the live day,
against **19** and **18** batters, **64** and **74** plate appearances, and
payloads of **149,606** and **178,785** bytes (**21,465 gzipped**). That is why
it is a route of its own read when the tab opens rather than a field on
`GameReport`: a reader who came for the box score never pays for it.

`game_advisory` is dropped from `scoringPlays` too, being MLB's own bookkeeping
wearing the upcoming batter's matchup — it cannot be a scoring play, but the
test stays: that loop is the one place `allPlays` is read, and a filter that
depends on another filter's shape is how a payload comes to include something
nobody meant.

---

## Where the page is reached from

Three doors, and all three go through **`App::openGame`** — `GameDoorContext`,
which is `TeamDoorContext`'s exact twin and a context for the same reason: the
callers are leaves. The summary table's opponent cell is inside a `map` inside a
row inside one of two tables drawn in two places; a club's fixture row and its
result row are two more. Threaded as an optional prop it would be five
signatures and five chances for a call site to forget it — and a forgotten one
does not fail, it silently stops being a link on one surface out of five.

### The summary table's opponent cell

**A fixture opens the preview and a result opens the page**, and the two do not
overlap. That slot used to be plain text once there was a score, and the
reasoning was sound as far as it went: the preview answers *what is this game*
and a cell already showing `TOR 3–2 NYY` has answered it. What it left
unanswered is the question a score raises — **how** — and there was nowhere to
send a reader who asked it.

**The whole line is the door**, not the club in the middle of it. It drew the
two clubs separately for a while, on the argument that a link cannot be put
through the middle of a finished string — which is why `gameStatusView` hands
back `sides` beside `score`. That was written for a door onto a *club's* page,
which is not what a reader looking at a score is asking for; and while it stood
the branch was unreachable anyway, a scheduled game having no `sides` and a
played one having nothing to open. `sides` survives as the test for which shape
the cell is drawing.

A **postponement** opens neither, and that is not an omission: there is no game
to read. Its cell says `PPD` and the schedule is where the makeup lands.

Measured on the live roster: **29 of 31** opponent cells are doors, the two
without being a row with no game and one whose fixture has no preview to raise.

### A club's Results tab

See `client-team-page.md`. Every row is a door, and the club page **remembers
the tab** so `Back` returns the reader to the list they pressed a row of.

### A club's fixture rows

The Schedule tab and the Overview's Next Games. **These open the game's page
rather than the preview**, and that is forced rather than chosen: the preview is
built around a `PreviewSubject` — a player, his hand, his split — and a club is
not standing in the game. The page is the only thing a club's fixture can open.

---

## One page at a time, and the route in

`player=`, `team=` and `game=` are **mutually exclusive by construction**,
enforced in `App::showPage` — the one function that sets all three, and which
every door goes through. They are one page at one layer: a page opened from
another *replaces* it rather than stacking over it, which is what keeps this to
a single `.details-view` and one press of Escape to leave whatever is on screen.

On the way *in* a link carrying more than one takes the **oldest** parameter it
can — player, then team. A hand-made URL is the only way to produce the set, and
falling back beats emptying the view. Driven: `?team=158&game=822696` opens the
club, `?player=batter-592450&game=822696` opens the player.

### `Back` undoes exactly one thing, and it is a route rather than a memory

**It was one step of memory per page and that was wrong.** The step was spent on
the way *in*: a club opened from a player remembered him, and a player opened
from that club remembered nobody — so a reader who walked *player → club → one
of its games* got back to the game and then, from a crest he pressed inside it,
straight out to the view. Reported as **"back button from game page closes
previous pages too"** and reproduced on the rendered page: a crest on a game's
page opened `?team=112`, and one press of `Back` left `?preset=Today` with the
game he came from nowhere. A name in the box score did the same.

So `App` keeps **`pageStackRef`**, the pages the reader has passed through, and
the objection the old comment raised against a stack — *what happens when a
reader walks a chain of six* — has an answer that reads better than the memory
did: **he presses `Back` six times.** What that objection was really about is
*rendering* six pages at once, which nothing here does. One page is on screen;
the rest are a route, and a route costs a small array. It is capped at
`PAGE_HISTORY` (12), which is far past any chain anybody walks and is only the
point at which the oldest step is dropped rather than the array growing for the
life of the session.

**A step carries the club's tab as well as its id**, because the tab is what the
reader was looking at. Returning a reader who pressed a row on `Results` to the
club's `Overview` is the same fault one step smaller — measured in a browser
before `teamTabRef` existed. **That ref is not `teamPageTab`**: that one is the
tab a *door* named and the page's key is built from it, so following the strip
with it would remount the page on every press of a tab. `TeamDetails` reports
its own through `onTabChange` and it lands in a ref.

**A ref rather than state**, because nothing renders it: a stack in state would
re-render the whole app on every navigation to change a value two callbacks
read.

### The two module caches are two keys, and one of them was never written

**`gameCache` and `playsCache` were module-level `Map`s**, kept for a measured
reason that still holds: a page stepped back onto must render at its **full
height in the first commit**, or the browser clamps `DetailsShell`'s restored
scroll offset to 0 against an empty box. Both are keys on the resource store now
(*One entry per server resource*, in the client shell), which holds an answer
past the component that asked for it and hands it back synchronously on the next
mount — the same property, in a cache the rest of the app can see, invalidate
and bound.

**And one of them did not actually keep its promise.** `gameCache.set(gamePk, g)`
sat *inside* the read's own guard —

```
if (!alive || reqRef.current !== req) return;
gameCache.set(gamePk, g);
```

— so an answer that landed after the reader had left was discarded **along with
the cache write it was going to make**. Which is precisely the case the cache
exists for: open a game, get bored, go back, come back.

**Measured, with the game report held 2s in the page**, opening a game from the
MLB scoreboard, pressing Back before it lands, and opening it again:

| | +130ms | +400ms | +900ms |
| --- | --- | --- | --- |
| before | `Reading the game` | `Reading the game` | `Reading the game` |
| after | **the page, 1047 chars** | the page | the page |

The first open is a block wait on both, correctly — there is nothing to draw.

**And the ordinary open costs half what it did**: 2 `/api/games/:pk` reads per
open before, 1 after. The two were dev's StrictMode double-mount against an
effect with nothing to dedupe against; the store's in-flight join is what
removes it.

**`staleMs: 0` on the report, which is what the old paragraph promised**: *"It
says nothing about freshness. Every mount still issues its read, and a live game
still polls; what the cache changes is what is on screen while that is in
flight."* That sentence is now the configuration.

**The Plays tab keeps `playsAsked`'s bargain without the ref.** That was a mark
set *before* the read — a once-per-mount gate rather than a test of what had
landed, which the file was careful to say out loud because it is the shape that
has hung this app four times. The key replaces both halves: the store's dedupe
is what stops the tab and a half-inning dialog making two requests of it, and
**`SEASON_STALE_MS`** is what decides a re-entry. Five minutes rather than the
store's twenty seconds because of this read's size — ~150KB against the report's
11.5 — so crossing to the Box Score and back must not re-buy it. Measured: 1
read on first open, **0** on re-entry, before and after.

### A page comes back as it was left

A step onto a page carries **which tab** it was showing and **where its scroller
was**, so a reader who was forty plays down the Plays tab, pressed a name, and
came back is where they were.

**The tab** is `gameTabRef`, and it is the same split `TeamDetails` makes:
`gamePageTab` is the tab a *door* named and the page's key is built from it, so
following the strip with it would remount the page on every press of a tab.
`GamePage` reports its own through `onTabChange` and it lands in a ref.

**The scroll** is read at the moment the door is pressed — one `scrollTop` off
the one `.details-view` there can be — and handed back through `DetailsShell`'s
`initialScroll`. That is the cheap half. The expensive half is that **restoring
an offset onto a page whose content has not arrived restores nothing**: the
three pages are exclusive, so a step back unmounts and remounts, and the browser
clamps 5,000px against a box of nothing.

So `GamePage` keeps three module-level caches — the game, its plays, and how far
down the game the Plays tab was opened — and they are **layout** caches rather
than network ones, exactly as `PlateAppearanceCard`'s `clipUrls` is. Every mount
still issues its read and a live game still polls; what they change is what is
on screen while that is in flight, which is rule 1. With them the page renders
at full height in the *first* commit and the offset lands: measured, `5000 /
13385` with eight half-innings and twenty-six clips at the **80ms** sample, and
unchanged at four seconds.

**`DetailsShell` had to be taught to tell a mount from a change**, and the
obvious spelling was wrong for the reason above: a `firstRun` flag spent on the
way out is spent again by StrictMode's second pass, which then took the change
branch and put a page restored to 5,000px straight back to 0. It compares the
page-and-tab key it last ran for instead — `null` is the mount, an equal key is
StrictMode running it again, a different one is the reader changing tab.

**Only the game's page takes it**, and that is a limit rather than a choice: the
club's and the player's re-read on every mount, so the same prop on them would
land on 0 about as often as it worked — measured, both come back at 0. The
mechanism is the shell's and waits for their reads to be cached.

**A fresh open still opens at the top** and a **tab change still resets** —
measured, both 0. A step back is the only thing that restores, which is the
difference between arriving at a page and returning to one.

**It is not in the URL**, which is where everything about *which* page is open
lives. A route is what the reader did rather than where they are, and a link
carrying it would promise a recipient pages he was never on — so a reload of
`?game=…` closes to the view, which is exactly what the same link handed to
somebody else does, and the two agreeing is the point.

**`Back` and Escape are one door**: `DetailsShell` gives both to `onClose`, and
all three pages now pass `closePage`. So a returning press is a returning key.

**The page draws for any id at all**, unlike the club's. A game is named by its
own payload rather than by a table the client holds, so there is no equivalent
of "a club nobody has heard of" to decline — an id MLB does not know answers 502
and the page says so, which is the honest reading of *that* fact.

---

## The club's Results tab

`GET /api/teams/:teamId/games` → `TeamGameResult[]`, newest first, in
`server/src/teamGames.ts`.

**It is the mirror of `/api/schedule` rather than a second copy of it.** That
window is the forward one — `baseballToday()` to +28 days, no scores, because a
game that has not been played has none — and `ScheduleGame` is thin on purpose.
`client-team-page.md` records the consequence: a Game Log tab was refused there
on the grounds that *"the scores are not on the wire"*. They are now.

**Fixtures are not in it.** A row with two dashes where the score goes would be
the Schedule tab's answer at lower resolution, in a list whose one column is the
score. The two tabs are one reading split at today, which is why they sit next
to each other in the strip.

`hydrate=linescore` is what buys the half-inning a live row says — the
schedule's own payload carries the score and not where the game has got to.
Measured on one club's season: **72,449 bytes**, read once every half hour per
club (a minute while a game is live, the two spans `gameLog.ts` settles on).

**`SEASON` is imported from `research.ts` rather than declared**, which is what
`playerSplits.ts` does and for the same reason: this file has nothing to update
when the year rolls over, so a constant of its own would be a twelfth place for
`CLAUDE.md`'s list to be one behind.

**The score is the club's own first**, which is the one place this app turns a
line score round: everywhere else `TOR 3–2 NYY` is away-first because the reader
is looking at a *game*, and here they are looking at one club's season down a
column — where the number that has to be in the same place on every row is
theirs. The chip's tooltip names both sides so nothing is lost.

**The chip is `.glog-res`**, the game log's own, folded onto rather than
restyled: same object (a result beside an opponent), and that rule already
carries the four tones and the argument for each color. **`won` is null on a
game with no winner**, which is two things at once — one still being played, and
a tie — and both are correctly "not a result yet or ever". MLB omits the flag
rather than sending false.

---

## Measured

Driven in a browser at **1200×900** and **390×844**, dark theme, against the
live season.

**The page.** `--details-chrome-h` is **137px** at both widths (the head is one
row of crests and one of prose, where a player's is a portrait beside three
lines), all three tabs in the strip, and **page-body overflow 0 and view
overflow 0 on every tab at both widths**.

**Overview** (gamePk 822696, CHC at WSH, final): the head reads `CHC 0 – 7 WSH ·
Final · Aug 13 · Nationals Park`; the line score `CHC 0 0 0 0 0 0 0 0 0 | 0 1 0`
and `WSH 0 0 0 1 5 0 0 1 x | 7 10 0`, the `x` in the ninth; `W Cade Cavalli · L
Kevin Gausman`; five scoring plays; thirteen Game Info rows.

**The line score's width**, measured on three games at 390: gamePk 823099
`CHC 19 · SEA 2`, the widest totals a line score gets, **426 → 356 and overflow
0** where it was 70 in a 356 box; gamePk 823827 `WSH · MIA`, the widest
abbreviation of the thirty, **overflow 0**; gamePk 824798 `TB · BAL`, ten
innings, **370.58 in 356** and still scrolling. No cell in any of the three
reports `scrollWidth > clientWidth`, at 390 or at 1200. With the bleed the box
is **x=0 w=390** on all three and the ten-inning one fits too — overflow 0.

**The three tabs' axis**, at 1440, before → after: Overview's blocks **x=16
w=1408 → x=320 w=800**, Plays' filter row and half-innings the same, Box Score
**x=16 w=1408 unchanged**. The player page (`ovw-day`, `ovw-starts`, `ovw-news`
at 800/x=320; Season and Last 5 at 1408/x=16) and the team page (`Next Games` at
800/x=320, Season at 1408/x=16) measure **identically before and after**. The
line score's box: **x=0 w=390** at 390 and 816, **x=1 w=815** at 817, **x=16
w=800** at 832, **x=320 w=800** at 1440, with `border-left` 0 at and below 816
and 1px above it. `.details-view` and `document.body` report **overflow 0** at
every width, and the half-inning door — now **28.4×34** — still opens `Top 8th ·
CHC batting` and still closes on one press of Escape.

**Box Score**: `CHC | WSH` above the tables, `CHC` lit; two tables at a time,
the batting one eleven rows with the substitutes indented under their slots
(Tyrone Taylor `PH` under Seiya Suzuki, James Triantos `2B` under Michael Busch)
and **no pitchers on the end of it**, `BENCH 2 · BULLPEN 11` under them. Pressing
`WSH` swaps the heading to `Washington Nationals` and the tables with it. Kevin
Gausman's `(L, 6-11)` draws red. At 390 the name column pins and the stats
scroll under it, with the page's own overflow at 0.

**Plays**: opens on **one inning** — 2 half-innings, 6 feed items, 6 clips, a
**3,327px** page — each item with its headshot, its outcome rail, its situation
glyph, the pitcher it was against, the batted ball and its film. `Show the 2nd`
with **8** innings left counts down a press at a time to the whole game:
**17** half-innings and **65** items, **64** at-bats and **1** base event, the
six bare runs dropped as the at-bats' own. **0** `feed-context` matchups, which
is `sameGame`. The gap under the `All / Scoring` row is **24px**, the tab's own
block rhythm, where it was 4. **The roster's own feed is untouched**: 14 items,
14 matchups, 4 inline clips, and its runs still items of their own.

**A half-inning off the line score**: pressing the Nationals' `5` opens a dialog
titled `Bottom 5th · WSH batting` holding **10** items, with the Overview still
lit behind it; Escape closes the dialog and leaves the page. The `x` in the
ninth is the one cell that is not a door. At 390 the same box, same title, same
ten items, page overflow 0.

**A page comes back as it was left**: eight half-innings deep and scrolled to
5,000, pressing a batter's name and coming back gives `5000 / 13385` with all
eight and twenty-six clips at the **80ms** sample. Box Score → a name → `Back`
returns on **Box Score**; Plays → a name → **Plays**; Plays → a crest → a club →
`Back` → **Plays**. A fresh open is 0 and a tab change is 0.

**A game nobody has played** (823585, MIL at NYM): the head reads `MIL @ NYM ·
7:10 PM`; the Overview is `Probable Pitchers · MIL Kyle Harrison · NYM Zac
Thornton` and nothing else; the Box Score is *Neither club has posted a lineup
yet* over both clubs' rosters under a **`MIL — Roster`** heading rather than
`Not in the Game`; Plays is *The game hasn't started.*

**A game being played** (823745, ATL at MIL, bottom of the eighth): status chip
`Bottom 9` in the app's live green, the line score eight innings wide against
nine columns, the live at-bat drawn as a count rather than a sentence, and the
poll re-reading it every twenty seconds without blanking anything. It went final
mid-session and the page followed it — `Final`, a complete line score, the live
row gone.

**The route in and out**, walked five pages deep with real pointer presses and
then unwound one press at a time:

```
?player=batter-592450  (Aaron Judge)
  → his club chip        ?team=147
  → Results, a row       ?game=823507
  → the away crest       ?team=141
  → Roster, a name       ?player=batter-680718
  ← Back                 ?team=141   on Roster
  ← Back                 ?game=823507
  ← Back                 ?team=147   on Results
  ← Back                 ?player=batter-592450
  ← Back                 the view
```

Every step lands on the page **and the tab** the reader left, every other
parameter is untouched throughout, and no two of the three page parameters are
ever in the URL together. **Escape unwinds the same route**, one rung a press,
and a cold `?game=822696` closes straight to the view.

**The box score's scroll, found by being unusable.** Reported as *"box score
page isn't scrollable"*, and the cause is a rule that is right for the four
panes it was written for. `.glog-scroll` declares `overscroll-behavior: none` in
**both** axes, which is correct where the pane is *itself* the vertical scroller
— the Game Log tab reshapes the overlay so that it is. A box score is not: it
sits in an ordinary scrolling page and scrolls sideways only. The trap is that a
box with `overflow-x: auto` computes `overflow-y: auto` too, so it **is** a
vertical scroll container with `scrollHeight === clientHeight` — at its boundary
the instant a wheel arrives, and `none` then declines to pass the scroll on.
Measured before: `.details-view` at **2862/900** with a wheel over the table
moving it 0px, the pane reading `auto/auto osb=none sh=571 ch=571`. After
(`.game-box-scroll`, `overscroll-behavior-x: none` alone): the same wheel moves
the page **0 → 600** at 1200 and **0 → 500** at 390, and the table still scrolls
sideways to 127 inside its own box with the page's own overflow at 0.

**And the fix was scoped one pane too narrowly, which the same report caught a
second time.** Reported as *"on a laptop I'm not able to scroll when I'm over a
table in the overview page"* — the player page's **Overview**, whose `Next game`
strip and `Last 5 games` preview are both `.glog-scroll` and neither of which is
the vertical scroller either. Measured at 1440×900 on `?player=660271`: both
boxes read `auto/auto osb=none` with **sh 81 = ch 81** and **sh 261 = ch 261**,
and three 120px wheel steps at (720, 751) left `.details-view.scrollTop` at
**0 → 0** — where the identical three steps 520px to the left, over no table,
took it **0 → 267**, the whole of what the overlay had to give.

So the polarity is reversed rather than another exception added: **the base rule
names the inline axis alone** (`overscroll-behavior-x: none` on `.glog-scroll`,
`.stats-scroll`, `.opp-scroll`, `.game-box-scroll`, `.league-scroll`), and the
block axis is named **only beside the `overflow: auto` that makes a box the
vertical scroller** — `.details-view.gamelog-mode .glog-scroll`, the two expanded
panes, and the League page's rankings pane. `.game-box-scroll`'s override is gone
with it, the fault never having been the box score's. After: the same three
wheel steps over the Overview's table take the overlay **0 → 267**, and a sweep
of every element on the roster, the player page and the Game Log tab for
`overflow-y: auto/scroll` with a non-`auto` `overscroll-behavior-y` and
`scrollHeight === clientHeight` returns **nothing** on any of the three.

**The three doors**, each driven end to end:

- the roster's opponent cell → `?game=824720`, head `SF 4 – 5 BOS · Final · Aug
  23 · Fenway Park`; **Escape** closes it and leaves the view exactly as it was;
- a club's **Results** row → `?game=823743` → `Back` → `?team=158` **on
  Results**; and its **Schedule** row → `?game=823745` → `Back` → `?team=158`
  **on Schedule**; and its Overview's **Next Games** row the same;
- the **fixture preview is untouched** by the opponent cell's new door: a day of
  fixtures (`?start=2026-08-24`) draws four `aria-haspopup="dialog"` cells, and
  pressing one still raises the preview with the URL unchanged.

**Bundle, `main` → this work.** JS **646.21 → 669.48 kB** raw, **192.22 →
197.24 kB gzipped** (+5.02); CSS **169.51 → 174.72 kB** raw, **30.45 → 31.31 kB
gzipped** (+0.86). **+5.88 kB gzipped in total** for a page, three tabs, three
routes' worth of client, a tab on the club's page, a half-inning dialog, the
route stack that replaced three separate returns, and the stylesheet's own three
hundred lines. The Plays tab costs almost none of it: it is `FeedItem` and
`playerDayEntries`, which the bundle was already carrying. The shell is the reason it is not more: the box, the chrome, the
strip's scrolling and the Escape ladder are the same code the other two pages
were already carrying.
