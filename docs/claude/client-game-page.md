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

- A game that has been played is the **line score**, the **decisions** and the
  **scoring plays**.
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
room, scrolling in its own box on a phone. Measured at 390: the box scrolls and
the `R` column is the last one visible, which is the right one to be.

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

**Game Info prints MLB's labels and values unedited** — pitches-strikes per
pitcher, the umpires, first pitch, the attendance, the weather. They are prose
off the wire rather than fields, MLB's list differs game to game (a pitch-timer
violation appears only where there was one), and a curated subset would go
quietly stale the first time MLB added a kind. **The ballpark is dropped from
it**: the head names it already, on every tab, and one fact twice in one page
reads as two facts that happen to agree.

### Box Score

**Both clubs at once, away first, and no side switch.** The team page pins a
Batting/Pitching switch above every tab and this page deliberately has none: a
club is one subject with two halves, so a switch there is *which half am I
reading*; a game is **two** subjects and the reader is comparing them. A box
score read one club at a time is a box score you cannot read across, which is
most of what a box score is for.

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

**The game as it happened, grouped by half-inning.** The grouping is the whole
of the reading: a play stream without it is four hundred sentences, and with it
a reader can find the fifth and read the four plays that turned it. Each heading
names the half **and the club that was batting**, because "Top 5th" alone leaves
the reader to remember which side is away.

**The sentence is MLB's own, unedited.** It names the batter, what he did, where
it went and who scored, in one line, and no rewriting here could be more
accurate or shorter. What is added around it is the two things it does not say:
the **score after** it and the **pitcher** who threw it.

**The score rides only on a play that changed it** — *a mark that would be on
every row marks nothing*. A running score down every row of four hundred is a
column of the same two numbers.

**The live at-bat has no sentence**, MLB not having given it a result, so it
draws the count and the two men instead. It is the one row that says what is
happening rather than what happened, and it is marked in the app's live green
where a scoring play takes the app's one amber.

**`All` / `Scoring` is a filter and not a second list.** A scoring-plays reading
already exists on the Overview and is the summary; this is the same stream cut
down, which is what lets a reader who has found the inning they want widen back
out to it in place. Its empty state names the **control** rather than the game —
*No scoring plays — press All for the whole game* — because a message reading
"nobody scored" would claim a fact about the game where this is a fact about the
button above it.

---

## The head

**Two clubs with the score between them**, which is the one thing that names
this subject: a game has no portrait and no single club to take the crest's
place. So it is a row rather than `.details-id`'s photo-beside-text column.

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

The built report is **29,501 bytes** for a finished game (822696), 33,065 for a
live one mid-eighth (823745), 4,369 for one nobody has played (823585).

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

### Every play, including the ones that are not plate appearances

The opposite call from `mlbStats.ts::isPlateAppearance`, deliberately: that test
exists because a caught stealing filed under the batter who was up would be an
extra at-bat on *his line*, where here there is no line to corrupt and a stolen
base is exactly the kind of thing a reader opens a play stream to find. The two
answer different questions about the same play. `game_advisory` is dropped,
being MLB's own bookkeeping wearing the upcoming batter's matchup.

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

**Box Score**: four tables, **11 · 2 · 9 · 2** rows — the two batting tables
nine and eleven with the substitutes indented under their slots (Tyrone Taylor
`PH` under Seiya Suzuki, James Triantos `2B` under Michael Busch) and **no
pitchers on the end of either**. `BENCH 2 · BULLPEN 11 · BENCH 4 · BULLPEN 11`
under them. At 390 the name column pins and the stats scroll under it.

**Plays**: **17** half-innings, **64** plays; the `Scoring` filter cuts it to
**5**, which is the Overview's own count.

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

**The three doors**, each driven end to end:

- the roster's opponent cell → `?game=824720`, head `SF 4 – 5 BOS · Final · Aug
  23 · Fenway Park`; **Escape** closes it and leaves the view exactly as it was;
- a club's **Results** row → `?game=823743` → `Back` → `?team=158` **on
  Results**; and its **Schedule** row → `?game=823745` → `Back` → `?team=158`
  **on Schedule**; and its Overview's **Next Games** row the same;
- the **fixture preview is untouched** by the opponent cell's new door: a day of
  fixtures (`?start=2026-08-24`) draws four `aria-haspopup="dialog"` cells, and
  pressing one still raises the preview with the URL unchanged.

**Bundle, `main` → this work.** JS **646.21 → 667.00 kB** raw, **192.22 →
196.40 kB gzipped** (+4.18); CSS **169.51 → 175.03 kB** raw, **30.45 → 31.33 kB
gzipped** (+0.88). **+5.06 kB gzipped in total** for a page, three tabs, two
routes' worth of client, a tab on the club's page, the route stack that replaced
three separate returns, and the stylesheet's own three hundred lines. The shell is the reason it is not more: the box, the chrome, the
strip's scrolling and the Escape ladder are the same code the other two pages
were already carrying.
