### The Feed view

Split out of `client.md`. The feed is the roster's day read by clock where the
summary table reads it as a roster; it sits between the roster it reports on and
the league it doesn't. Its items open into dialogs whose rules are in
`client-dialogs.md`.

**It keeps its own date range**, which is `client-dates.md`'s — the calendar is
the same control drawn on both pages and each writes its own entry, so coming
here for last week's plays no longer costs the Roster its today. What belongs
here is only the consequence: the range this page is on is not the one the
summary table is on, so the report behind the two of them can differ and a
crossing between them costs the read that difference implies.

### One stream of both kinds, with the outings above the plays

**The feed used to be one kind at a time**, and the Recent section's heading was
the tell: `{kind === 'pitcher' ? 'Recent outings' : 'Recent plays'}`, one list
whose word changed with the tab above it. The tabs are gone (see **Client**,
*Kind tabs — removed*), so the stream carries a whole roster.

**The two do not interleave.** An outing is a whole game's work in one card and
a play is one swing, and sorting them together by clock put a six-inning start
between two groundouts as though the three were the same size of event. So the
outings are their own section — `outings`, everything in `allRecent` of type
`pitching` — and the plays are `allPlays`, everything else. **Above**, because a
start is the day's larger fact and because it is what a reader with two pitchers
on his roster came to check; the plays below it are the long tail he scrolls.
(**The two have since swapped**, and only the order — the split, its rule and
everything else in this section stand; see *The outings went below the plays*.)

**The play pills do not reach the outings, and that is why the split is on
`type` rather than on the filtered list.** A pitching entry has no play kinds at
all — `playKinds` returns an empty set for it — so any lens but `All` would have
emptied the outings section as a *side effect* of narrowing the plays, which is
a control saying it does one thing and doing two. Measured on 2026-08-19 over
the live roster: `All` gives **3 outings / 10 plays**, the `HR` lens **3 / 3**
and the `SB` lens **3 / 1** — the outings unmoved under all three.

**The outings are unpaged.** A roster carries two or three starters and a day
gives each at most one card, so there is nothing for a `Load more` to hold back;
the plays below keep the ten-at-a-time paging and the `shown` key, which is what
that machinery was written for.

**`newPlays` counts plays and skips outings.** The red button says `N new plays`
and the page it opens is a page of plays, so counting a start in it would be the
mark naming one thing and opening another. `newRecent` filters `allPlays` for
the same reason.

**Live and Upcoming needed nothing.** Both were already built from per-player
entries that never tested the kind, so both carry the whole roster the moment
the filter above them goes. Driven with the app's own live simulator (`sim=1`),
the Live section shows **9 items across all four role tints** — `role-at-bat`,
`role-on-deck`, `role-on-base` and `role-pitching` — in one list. Upcoming on
2026-08-20 drew **7 rows, three of them pitchers** (Dylan Lee, Didier Fuentes,
Trevor Megill) beside four batters, ordered by first pitch as it always was.

**The pills' gate changed from a tab to a fact about the roster.** They were
drawn on the batter tab alone; the test is now *are there any batters here*, so
a roster of nothing but pitchers still draws a feed — outings, upcoming starts —
without six lenses over a list none of them can touch.

### The batter feed narrows to kinds of play, and says when something is new

**On a full slate the stream is hundreds of items** — every plate appearance of
every batter on the roster, plus every bag any of them took — and the one thing
it could not do was answer *what actually happened today* without the reader
scrolling past every strikeout in between. It has a lens now, and a red button
that says how many plays have arrived since they last looked.

**Seven pills and one of them lit**: `All · H · RBI · HR · SB · R · Video`,
in a row at the head of the stream. That reverses two decisions taken when this
shipped — that the kinds should be **independent switches** and that they should
live behind a disclosure **in the pinned tab row** — and both of the old
arguments are kept below, with what the reversal costs stated rather than
glossed.

**And the row carries a second control at its right end**, `Oldest first`, which
is not a pill and not about kinds at all — see *The stream can be read forwards*
below.

**`New` was an eighth pill and is a mode of its own again**, reached from the red
button in the stream rather than from this row. The row is the **kind** axis and
nothing else now; see *New plays is a mode, not a pill* below, which is where the
one-lens rule and this one part company and why.

**`All` is a pill rather than the absence of one.** With switches, turning the
last one off is how the whole stream comes back; with one active at a time there
has to be something to press that means *no lens*. It leads the row and is the
state the feed opens in.

**The order is the fantasy categories' rather than a box score's**, which is the
reversal of what this paragraph used to argue. What it said: *the order is a box
score's rather than the vocabulary's history — the two ways of reaching a base by
hitting it, then the two halves of a run (`Runs` he scored, `RBI` he drove in),
then the base he took with no hit at all, and last the one kind-pill that is not
a kind of play but a fact about whether there is film of it; `SB` reads after
`RBI` for that reason rather than beside the hits, where it sat only because it
was added with them.*

That was right about a *line score* and wrong about this row. Nobody reads the
feed to reconstruct a box score; they read it to find out how the week is going,
and the week is going in categories. So the run is `H · RBI · HR · SB · R`:
`H` leads because it is the widest cut of the day — **18 of the 51 items** on the
day measured below, the one press that turns a stream into the plays that
mattered — then the three that decide a matchup, then `R`, which is the one
thing on the row that happens *to* him rather than by him and the only one of the
five nobody opens this page to count. `Video` keeps the last place it always had,
for the reason it always had it: it is not a kind of play but a fact about
whether there is film of one.

**`Hits` and `Runs` are `H` and `R` now**, which the reordering forces rather than
merely permits. A run of category abbreviations with two whole words in the
middle of it reads as two kinds of thing on one row, and both single letters are
forms a box score already uses — the same test every other label here passed. It
also buys back 24px, which on a row whose content is **353px against a 174px
scrollport at 320** is 24px of scrolling nobody has to do. The *keys* are
untouched (`hit`, `run`), so every `plays=` link ever written still opens on the
pill it named.

**`XBH` was a seventh chip and is gone**, and the two reasons are the ones that
decide any pill on this row. It answered a question nobody asks of a *stream*: a
double and a home run are two plays a reader recognizes on sight, and a pill's
job here is to cut hundreds of items down rather than to name a class of hit. And
it barely cut — on the checked day it was **11 of 51 items against `Hits`' 18**,
two thirds of a set already one pill away, on a row where every pill costs the
next one its place on the line. An old `plays=xbh` link is read as the wider
stream it no longer names, which is the direction `toPlayFilter` fails in for
every key it does not know.

**The labels are abbreviations because the row is read across**, and each is a
form a box score already uses. What an abbreviation cannot say is which plays it
takes — that a home run is inside `H` and inside `RBI`, that `R` is him crossing
the plate where `RBI` is him driving somebody in — so every pill carries the
sentence as its `title`.

**`H` reads `outcomeKind` rather than a list of its own**, which is the same
function the at-bat card's rail is colored by, so a pill and the card it selects
cannot come to disagree about what a hit is. `XBH` was the one pill that needed a
set of its own (`XBH_EVENTS`), that function filing the three non-homer hits
under one `hit`; the set went with the pill, on this repo's own rule that a
definition nobody reads is a definition nobody misses.

**`RBI` reads the plate appearance's own `rbi` rather than its event**, and that
is the difference between a pill that is right and one that enumerates. A run
bats in on plays that are not hits at all — a sacrifice fly, a groundout, a
bases-loaded walk — so an event list would have to name them and would miss the
next one. It sits beside `Runs` because the two are the halves of one thing: that
one is him crossing the plate and this is him sending somebody else over it.
Measured against the day's own report, counted independently: **9 plate
appearances with an RBI and 6 home runs** on a checked roster, which is exactly
what the pills draw. That the two sets *overlap* — every home run is an RBI, so
the union of the pair is 9 rather than 15 — is what an item's own `playKinds`
still records as a **set**; what single-select decides is how many of those sets
a reader may ask for, not how many an item is in.

### `Video` was selecting the whole stream, and now selects the plays with film

**The paragraph this replaces is the bug, argued.** It read: *`Video` is
`playId != null` — the id MLB filed a clip under — rather than a clip that has
been resolved. Resolution is one request per play and the feed does it lazily as
each item scrolls into view, so a filter that waited for it would send hundreds
of requests to draw one screen. The cost is that a play whose clip does not come
back is still selected, which is exactly what the item itself already does: it
draws the play and no frame.*

**The cost is not what that says it is.** MLB files a play id for very nearly
every play, so the pill was not selecting a subset at all: measured on
2026-08-18, **42 of 43 items** carried one, and pressing `Video` drew the same 20
items `All` did — of which **5** rendered a frame. A filter that selects
everything and promises film is worse than no filter.

**The two publishers fail on opposite axes, and that is what makes it cheap.**
From `mlbStats.ts::resolveVideoUrl`: **Savant** covers essentially every play and
is a day behind, and **MLB's own reel** lands during the game and is curated. So
the question splits on the game's date and neither half costs a request per play:

- **A game before today has film for every play.** Measured over three settled
  days — 2026-08-15, 08-16 and 08-17 — **90 of 90 sampled plays resolved**, and
  08-16 was checked whole at **40 of 40**. So that half is a date comparison and
  nothing else.
- **A game from today has film for whatever is in its reel**, which is **one read
  per game** rather than one per play, against the very cache `/api/video`
  already fills. Measured on 2026-08-18 across 8 games: **13 of 42** plays.

**Resolving per play is what this exists to avoid**, and the figure is the whole
argument: **~350ms a play** on a settled day (40 plays took **14.1s**), against
**200ms for the eight reels** that answer the same day today. Over a range the
first is minutes of upstream to draw one screen.

**`GET /api/video/clips?games=…` is the read** — a set of games in one request
rather than a route per game, since the caller is a stream that draws a day's
worth of them; capped at `MAX_CLIP_GAMES` (40), with a game that throws answering
**an empty list rather than failing the request**, which is the direction every
join in this app fails in. It is registered **before** `/api/video/:playId`,
which would otherwise match `clips` and reject it as a malformed play id.

**Only today's games are ever asked about** (`LiveFeed`'s `liveGames`), so the
request count is a slate rather than a range: a fortnight of feed asks about the
same handful of games the day being played has.

**A today-game whose reel has not landed reads as *no film yet*** — the lens
shows what it can vouch for and fills in, with `Finding the clips` under the
heading while any reel is out (the app's own `LoadingLine` behind `WAIT_DELAY`,
so a cached reel draws nothing at all). Measured on a range spanning 08-16 to
08-18 with the read held 4s: **20 items on screen throughout**, the settled days
answered immediately and the wait line up until today's reels landed.

**A failed read marks its games answered-with-nothing rather than leaving them
pending**, and both halves of that matter. Their plays drop out of the lens,
which is the only direction it can fail in without showing a play with no film;
and the wait line resolves, where leaving them pending held `Finding the clips`
on screen for ever, which reads as working when nothing is. **The retry is
pressing `Video` again** — `askedReels` is cleared whenever the lens is selected,
which is the rule the player page's tabs already follow for a failed read, and
which is also the *right* thing on a game still being played, whose reel grows as
the cuts land. Measured with the route blocked: 0 items, no wait line, no error
banner, the empty state naming the pills; unblock and press `All` then `Video`
and the 15 items come back.

**Measured, before → after**, on the live roster at 1200×900:

| | items | of which drew a frame |
| --- | --- | --- |
| `All`, today | 20 | 7 |
| `Video`, today — **before** | **20** | **7** |
| `Video`, today — after | **15** | **15** |
| `Video`, a settled day (08-16) | 20 | 20 |
| `Video`, 08-16…08-18 | 20 | **20** (was 7) |

Every item the lens shows has film, at 320 / 390 / 640 / 1200 / 1920, with the
row 34px and page-body overflow 0 at each.

**`playKinds` lost its `video` member with it.** That function is the five real
kinds now and `hasFilm` is its own test in `passesFilters` — which is the honest
shape: the other five are facts about the play, and this one is a fact about
whether anybody has published a clip of it.

### New plays is a mode, not a pill

**This section has now been written three times and the middle version is the
one being undone.** It began as *`New` is not one of the six and is deliberately
kept out of that list — it asks* when *rather than* what kind*, so it **narrows**
whatever the chips selected instead of adding to it*; it then became *single-select
cannot say that sentence, and the row is single-select*, and `New` was made the
eighth pill. The first version was right about the data and the second was right
about the control, and what settles it is that they were answering different
questions: the row can be single-select **and** the narrowing can survive, as long
as the narrowing is not in the row.

**So the row is the kind axis and the mode is reached from the stream.** The red
`N new plays` button at the head of the Recent section is the only way in — which
is where it always was, and where it belongs for the reason that section already
gives: it is news, and it belongs where the news landed and where pressing it can
also take the reader to it. Pressing it flips the section's heading from `Recent
plays` to **`New plays`**, and the pills go on selecting a kind underneath.

**`HR + New` is sayable again**, and so is every other pair the union bought and
the single-select row spent — `HR + SB` ("the things worth watching") is the one
genuine loss that stays lost, the kinds still being one at a time. Measured on the
live roster over `Yesterday`: `All` 20 items on screen of 51 new, `New` 20 of 51,
and **`HR` inside the mode 6** — which is the sentence the middle version could
not say.

**The heading is what carries the mode**, rather than a lit pill. A mode with no
mark is a mode a reader forgets they are in; a *heading* that has changed its word
is the plainest mark a list can have, and it costs the row nothing. There is no
pitcher wording for it and there does not need to be: `App.tsx` passes
`newOnly={feedIsBatters ? feedNewOnly : undefined}`, so `New plays` and `Recent
outings` cannot both be reachable — checked by forcing `?kind=pitcher&newplays=1`,
which draws `Recent outings`, no pills, no red button and no way out, because
there is nothing to be out of.

**Two ways back, at the two ends of the list.** One where the red button was,
because that is where a reader who has just arrived is looking, and one after the
items and after `Load more`, because a reader who has read down a short list of
new plays is at the *bottom* of it. Both are `.feed-more`'s pill — ordinary chrome
rather than red, `--strikeout` in this app meaning *something has happened since
you looked* rather than *put that away*. The foot one is not drawn over an empty
section, where the top one is a few pixels above the copy naming it.

**And leaving the mode is the only thing that marks the stream read**, which is
the half that used to need a guard and is now structural. While `New` was a pill,
every press of every pill passed through `setFeedNewOnly` — and turning it off is
what advances the watermark — so a guard was needed against the case measured at
the time: pressing `HR` from `All` marked the whole day read and took a reader who
had never touched `New` to nought. `selectFeedLens` no longer touches the mode at
all, so there is no path from a pill to the marker to guard. Measured: the marker
holds at `1786504193513` across `New → HR`, and advances to `1787023601744` on
`Show all plays`.

**It is still two pieces of state**, as it always was — `newplays=1` in the URL,
the red button, the mark-read side effect — and the two are now genuinely
independent rather than derived into one lens. A link carrying **both** is a state
the app can hold and reach: `?plays=hr&newplays=1` opens on the new home runs.

**Two spacing devices came before all of this and are gone with the panel.** `New`
was set off from the chips by a **hairline**, which the wrap retired (the panel
broke where the window said, so at 390px the rule was left at the end of a line
with nothing after it), and then by a **wider gap**, which cannot dangle and was
the right shape for the wrong claim — a chip set apart reads as a second *group*,
and the break lands where the window puts it rather than where the argument
wanted it. On a row that scrolls rather than wraps neither question arises: the
gap is a uniform **8px** and what carries the distinction is what always did, the
**word** and the **red count**, which is still the only color in the row.

**Batter tab only.** A pitcher's stream item is his whole *outing* rather than a
play — the same fact the kind tabs exist for — so none of the six kinds can match
one.
**That is gated on the same flag that draws the control**, and it had to be: a
`plays=hr` link opened on `kind=pitcher` drew **0 outings** before the gate, the
filters having been passed through unconditionally. The *state* survives the
excursion — a lens the reader set is still set on the tab that does not offer
it, so switching back to batters puts it straight back in force, and what a
control cannot narrow it does not un-set.

**The five props are optional and the second caller passes none of them.** A
matchup team page draws this same component for a leaguemate's week
(`LeagueTeam.tsx`), and neither half of the feature belongs to it: the marker is a
fact about how far down *the reader's own* stream they have got, and that page's
control row already carries four groups. Checked: `?mup=…&mt=…&plays=hr&newplays=1`
draws that page's feed with **0** pills and no red button.

**Half of that paragraph has since been overturned, and it is the half about the
pills.** The control row it names is `mup-tools`, and the pills are not in it any
more than they are in the view bar here — they sit in the page, at the head of
the stream, for the reason the section directly below sets out, and that reason
holds for a leaguemate's week word for word. `LeagueTeam.tsx` draws
`FeedFilterPills` on its batter tab now, from this same component, and passes
`playFilter` through; the measurements are in **The Feed reading takes the
play-filter pills** in `client-league-matchup.md`. **The `New` half stands as
written**: `seenPlays` is one watermark on the reader's own record, so a red count
over somebody else's plays would be counting his day against it, and none of the
six new-plays props is passed. The checked link now draws that page's feed with
**7** pills, `plays=hr` still being ignored there — the lens is that overlay's own
state, `mup` and `mt` being the whole of what a matchup link carries.

### Where the controls sit: both of them in the page now

**This section used to argue for the split and the split is gone.** What it said:
*the `Plays` disclosure is in the pinned tab row and the red button is in the
page, and that is not arbitrary — a control that decides which rows a view shows
lives with the tabs that select the view (the research board's whole
control set, the include buttons), so the filters do, behind one disclosure with a
count badge; the red button is* not *a filter, it is news, and it belongs where
the news landed and where pressing it can also take the reader to it.*

**The second half stands and the first half is overturned by its own test.** What
the tab-row rule protects is a control a reader has to reach **while scrolling** —
the board's filters qualify a table six hundred rows long, and losing them off the
top of the page would be losing them. This one qualifies a stream that is read
from the top and worked once on arrival, and it *is* the answer to the question
the page was opened with. So it goes where the answer is: directly above the
plays, beside the red button that has been in the page for that same reason all
along. What was a disclosure, a panel and a count badge is one row of pills.

**And the disclosure was costing the tab row a line at two widths**, which is the
measurable half. A/B'd on the same page by hiding the button, the docs recorded
**320 (207 → 255px of chrome)** and **640 (111 → 159)**; removing it gives both
back — measured after, chrome is **207px at 320 and 111 at 640**, with 375, 390,
480, 900, 1200 and 1920 unchanged at 159 / 159 / 159 / 115 / 115 / 115.

**The row scrolls sideways rather than wrapping** — `.feed-filters` when this was
written, `.feed-filter-kinds` inside it since `Oldest first` joined the row and
took the scrolling box off it; see *The stream can be read forwards* — which is the
answer every other strip of pills in this app gives when it outgrows its width —
the research board's position row and its window tabs, the player page's tab
strip, the tutorial's jump strip. A wrapping row would change the height of the
thing sitting above a stream at every width, and this row is read across. Hence
`flex-wrap: nowrap` and `flex: none` on the pills: an unconstrained flex item
shrinks below its content before a scrollport ever appears, which on a row of
two-character labels is a row of clipped words rather than a row that scrolls.
`overscroll-behavior-x` alone and never the block axis, the rule `.details-tabs`
and `.research-positions` already follow — a scroll container blocks chaining on
an axis it cannot itself scroll, so naming the block axis here would swallow a
vertical swipe belonging to the stream under it.

**It shares the feed's own column** (`--card-column` and its auto margins), so the
row's left edge is the left edge of the items below it, and its **zero bottom
margin collapses with `.live-feed`'s own 16px top one** — so the gap under it is
the gap the stream has always had rather than a second one. Measured at 1200: the
row at x=200 and 800 wide, 34px tall, with the feed's top at 181 against the row's
bottom at 165.

**It is inside the same guard as the feed** (`filteredCards.length > 0`) rather
than beside it: a row of pills over a page with no players on it would be a
control over nothing, and the empty state there names its own cause already.

### The stream cannot be read forwards any more

**`Oldest first` is gone.** The control, both of its states, both of its
parameters (`oldest=1` and `noldest=1`), the two pieces of state behind them and
the two `.sort()` calls that read them. The stream runs newest-first, which is
what it opens on and what makes it a stream — see `byRecency`, and
`byPlayOrder`'s own note that a *game* is the thing read forwards.

**Six sections below are the record of that control** — *The stream can be read
forwards*, *The marker and the cycle*, *The order toggle went to the navbar*,
*The new-plays page splits its two controls*, *The order control says its
direction* and *The new-plays page keeps its own direction* — and they are left
as written, this file's rule for its own superseded reasoning. Four things in
them outlive the button and are why they are worth keeping:

- **Which controls belong in a pinned row.** An order is the one feed control a
  reader reaches *while scrolling*; the kind pills are worked once on arrival
  and stay in the page at the head of the list they narrow. That is the test to
  apply to the next control that asks for the row, and the pills' half of it is
  still live.
- **A label that names a state rather than an action.** This was the only one in
  the app, and the reason was the second stream: two directions on two pages
  means two buttons that have to say which is which, and a lit border is a
  weaker statement than a word.
- **Reserving a box by laying it out.** Both words in one grid cell, the one not
  in force under `visibility: hidden` — measured at **118.58 × 36px, lit and
  unlit and back again**, against the 5.86px an unreserved box would have jumped
  on every press (`Newest first` is 78.58px of text against `Oldest first`'s
  72.72).
- **A container query rather than a breakpoint.** The word was dropped below
  **335px** of the tab row's container and **360px** of the new-plays head's —
  two numbers because the two bars are different widths at the same window width
  (346 and 358 at a 390px window), which is the whole reason it could not be a
  media query.

**What went with it in the stylesheet**: `.feed-order` and its `-arrow`,
`-word`, `-said` and `-ghost` parts, and both container queries — the only
queries either container had, so `container-type: inline-size` came off
`.view-tools` and `.newplays-head` as well. A container nothing queries is not
inert: inline-size containment is the promise that a box's inline size does not
depend on its contents, which this file records elsewhere as a trap (declared on
a shrink-to-fit flex item it takes that item's intrinsic contribution to nought
— measured, a whole tab row 1356px → 0).

**And what survives in the code**: `byPlayOrder` itself, which is `byRecency`
negated and still orders the Live block's in-progress events cause-then-effect;
`FeedFilterPills`, which was never part of this control; and the new-plays
page's head, which is `Back` and the name and nothing else now — measured, its
chrome is **70px** where it was 82 with the button in it.

**An `?oldest=1` or `?noldest=1` link still opens.** The params are simply not
read and the first URL sync drops them, which is the courtesy `group=player`
and the pre-two-way ids in `readKeys` already get, and the safe direction for an
old link to fail in.

### The stream can be read forwards

**`Oldest first` turns the day round**, and it is at the right end of the pill
row. The stream was newest-first and nothing else from the day it shipped, which
is right for the question it is usually opened with — *what just happened* — and
wrong for the other one people actually ask it: *what happened while I was out*,
which is a day you read from the first pitch.

**Not an eighth pill.** The pills are single-select over **kinds**, and an order
is not a kind — a reader who wants the home runs read forwards has to be able to
say both, and a row where saying one unsays the other cannot put it. That is the
same fault `New` had on this row and was taken off it for, one section above. So
the kinds are a `role="group"` of their own (`.feed-filter-kinds`) and this
stands outside that group.

**A lit toggle rather than a segmented `Newest | Oldest` run**, which is the
other shape this app has for a control with two values. A segmented run says its
two values are **peers** — Roster/Feed/Research, Batters/Pitchers, `Next 7` /
`Next 14` — and these are not peers: newest-first is what makes a stream a
stream (`byRecency`, and `byPlayOrder`'s own note that a *game* is the thing read
start to finish), and oldest-first is the departure from it. This app spells a
departure as a lit toggle whose absence is the default — `Watchlist`,
`Projected`, `hideil` — and carries only the departure in the URL.
It is also the narrower control, on a row whose kinds already overflow at 320 and
390: **94px measured**, where a segmented pair has to carry both words at once and
can never be narrower than the two of them.

**The label did not change when it lit, and now it does** — see *The order
control says its direction* below, which is a straight reversal of this
paragraph and carries the reason and the measurements. What stood here: ``Oldest
first`` is both what pressing it does and what being lit means; a label that
flipped to `Newest first` would change the button's width under the finger that
pressed it, which is *reserve the box* broken by a control that is nothing but a
box. Measured then: **94 × 30px lit and unlit**, at every width. The half of
that which survived is the geometry — the box is still identical in both states,
by reservation rather than by refusing to say anything.

**It sits outside the scrollport rather than at the end of it**, which is the one
piece of geometry this control cost. `.feed-filters` was itself the scrolling box;
it is now a plain row holding the kind group — which scrolls — and the toggle,
`flex: none` with `margin-left: auto`. Putting the toggle inside the scrollport
would have hidden it behind a sideways scroll at exactly the widths where the row
is longest: measured, the kinds are **353px of content in a 174px port at 320**
and **244px at 390**, so `Oldest first` would have been two pill-widths past the
edge on a phone and visible only on a desktop. The kind group needs `min-width:
0` to shrink at all — a flex item's automatic minimum size is its content, and
without it the box refuses to go below its seven pills and pushes the toggle off
the row instead of scrolling.

**What reversing means for the three sections — only one of them turns.**

- **Recent** turns. It is the section with a clock the reader reads *along*, and
  it sorts by `byPlayOrder` instead of `byRecency` — that comparator negated
  rather than a second one written out, so the two cannot come to disagree about
  a play's own grouped events (cause then effect, either way round). `Load more`
  turns with it: the page walks *forward* from the first pitch instead of back
  from the last.
- **Live does not**, and stays pinned to the top. It is not ordered by a clock at
  all — `ROLE_ORDER` puts the man at bat above the man on deck above the man on
  base — so reversing it would say nothing except that on-base now outranks
  at-bat. And a control that reorders plays is not a control that rebuilds the
  page: what is happening now is why this page is open.
- **Upcoming does not either**, and the reason is stronger than "it is the
  future": it already agrees with both readings. It sorts by first pitch,
  earliest first, which is *next up first* reading the day backwards and
  *forwards in time* reading it forwards. The two orders it could be asked for
  are the same order, so there is nothing to flip — reversing it would only bury
  the game that starts soonest under the one that starts at ten.

**`oldest=1` in the URL**, absent meaning the stream as it has always opened —
`newplays=1` and `hideil=1`'s own spelling, and it means the default can be
redefined later without anyone's link needing revisiting. **It is this stream's
alone**: the new-plays page has `noldest=1`, a second parameter for a second
stream, and the two never read each other — see *The new-plays page keeps its own
direction*. **Gated on the view and
not on the batter tab**, unlike the pills beside it: a pitcher's outings are
stamped with a clock exactly as a plate appearance is, so the toggle is drawn and
in force on both kind tabs where the kind group is the batter tab's alone. Not a
saved preference, on `plays=`'s line — which way you want to read this afternoon
is not a fact about you.

**Measured**, driven in headless Chrome against the live dev API, the roster's
own day for 2026-08-17 (51 items, the same day the table below counts):

| | newest-first | `oldest=1` |
| --- | --- | --- |
| items in the stream | 51 | **51** |
| head | Crow-Armstrong, CHC, **10th** | Stewart, CIN, **1st** |
| foot | Stewart, CIN, **1st** | Crow-Armstrong, CHC, **10th** |
| with `plays=hr` | 6, head Crow-Armstrong 10th | 6, head McGonigle **2nd** |
| pitcher tab | 2 outings, Snell then McLean | 2, **McLean then Snell** |
| Live rows (`sim=1`) | 6, and the section leads | **the same 6, same order, still leading** |
| Upcoming rows (today) | 11 | **the same 11, same order** |

The head and foot swap **exactly**, over the whole list rather than the first
page: `Load more` was pressed to the end in both directions first, which is what
makes 51-against-51 a reversal rather than two lists that happen to start
differently.

**Geometry, at 320 / 390 / 1200**, and the row is the height it always was:
**34px at all three**, with the toggle at x=204 / 274 / 906 and the feed's own
top at 181 against the row's bottom at 165 at 1200 — the figures *Where the
controls sit* recorded before this control existed, unchanged. On the pitcher
tab, where the kind group is not drawn at all, the toggle is at **the same x=274
and the row is the same 34px** as on the batter tab, which is what the auto
margin is for.

**The press is quiet.** It is local state over data already on screen, so no
wait, no badge and no re-read: measured, `.loading-line` absent through the flip
and the 51 loaded items still 51 after it — the reader's page depth survives the
turn. `oldest=banana` opens on the whole stream newest-first (20 items on the
first page, not nought), which is the direction every parameter in this app
fails in.

### The marker, and the cycle the two controls make together

**`UserPrefs.seenPlays` is one epoch-ms watermark** — how far down the stream this
reader has got. See **Roster, watchlist, users and auth** for the field and
**Date handling and server routing** for the route; what belongs here is the
cycle.

- **New** is `entryTime(entry) > seenPlays`, over the **unfiltered** stream: the
  count is news about the day rather than about the lens, and a count that shrank
  when the reader pressed `HR` would be saying the other plays had stopped being
  new. It is drawn on the red button alone now, the pill it used to also sit on
  having gone.
- **The red button** appears when that count is over nought *and* the mode is off.
  Pressing it turns the mode on and puts the top of the stream back under the
  reader — they are at the head of the list, which is not where somebody who has
  been reading is.
- **The marker is frozen while the mode is on**, and it has to be: it narrows to
  plays newer than the marker, so advancing it while it is in force is asking for
  none of them. That is also why the button is not drawn then — with the reader
  already looking at the new plays it would be a control offering what is on
  screen, and pressing it would clear the very list it opened. What stands in its
  slot instead is the way *out*.
- **Leaving the mode is what says "done with those"**, so that is what marks the
  stream read: `Show all plays`, at either end of the list. Pressing a kind pill
  marks nothing — not by a guard but because `selectFeedLens` has no path to the
  marker at all. A reader who never engages accumulates a count, which is what
  the transactions dot does too.
- **And `Clear`, beside the red button, says it without going and looking.** For
  a while leaving the mode was the *only* thing that moved the marker, which
  made the count answerable in exactly one way: a reader who could see from
  `3 new plays` that it was three groundouts still had to open them to make them
  stop being new. `Clear` is the other answer, and it is the same act rather
  than a second one — App points both presses at `markPlaysSeen(newestPlayTs)`,
  so there is one definition of *seen* and one route to the record. It is wired
  to `markPlaysSeen` rather than to `showAllPlays`, which would work today, the
  mode being off wherever the button is drawn: that handler is *leaving a mode*,
  and a scroll or a URL edit added to it later is a thing a caller that was
  never in the mode would silently inherit.
- **`Clear` touches neither the mode nor the URL**, and the second half is the
  one worth writing down. `newplays=1` says *which stream this view is showing*
  and belongs to the link; "I have seen these" is a fact about the **person** and
  belongs to their record. So the press writes `UserPrefs.seenPlays` and leaves
  the query string byte for byte as it found it — measured below, and it means a
  reader who clears and then shares the page shares the page they are looking at.
- **The two go together and neither is ever disabled.** They sit inside one gate
  (`showNewButton && onShowNew`), so the instant the count is nought the pair is
  *absent*: a `Clear` with nothing to clear is a mark that would be on every row.
  That vanishing is also the press's own trace, which is why it carries no
  `MIN_SPIN` mark — the state it changes is local and immediate and the write
  behind it is queued and swallowed, so there is no wait to stand in front of.
- **Ordinary chrome beside the red, and the pill's own geometry.** `--strikeout`
  in this app means *something has happened since you looked*; `Clear` is the
  reader answering that, so two reds in one row would be two things claiming to
  be the news. It takes `.feed-more`'s ground — the page's own, the plain border
  — which is what `Show all plays` takes at the other end of this list and for
  the same reason. What it does **not** take is `.feed-more`'s box:
  `--control-radius` shoulder to shoulder with a 999px pill is that mistake made
  in the other direction, so the shape is shared with `.feed-new` and only the
  ground differs. The `align-self: center` moved off the button and onto
  `.feed-new-row`, so the section centers the pair as one object.
- **Coming out does not scroll**, where going in does. Going in the reader is
  handed a different and much shorter list and belongs at the head of it; coming
  out they are somewhere in a list that is about to get *longer around them*, and
  the mode being a filter over the same stream, dropping it inserts items above
  and the browser's own scroll anchoring keeps the item under their eye where it
  is. Sending them to the top would throw away a reading position for nothing.

**The count is computed in App rather than here**, off `newPlays` — exported from
this file so the clock that orders the stream has one definition, the rule
`playerDayEntries` already sets for the stream and the player page. App owns both
halves of the feature: it holds the marker, persists it, merges the saved one on
arrival, and is what leaves the mode, which is the act that needs the timestamp.
It also holds the pill row's own lens, for the same reason — though that is one
piece of state read as one lens now rather than two read as one.

**The button appearing does not move the reader**, and that is the browser's own
scroll anchoring rather than a reservation — the same mechanism this file already
relies on for a new at-bat arriving above somebody mid-read. Measured: scrolled to
1400 with the item under the reader's eye at y=1773, inserting the button takes
`scrollY` to 1444 (its own 44px) and the **item moves 0px**.

### The order toggle went to the navbar, and the pills did not

**One of the two controls above the stream has moved into the pinned tab row,
and this reverses — for that one control — the argument two sections up.** The
pills stay in the page, and the reasoning there stands word for word; what it
turns out to have been describing is a *kind* of control rather than the whole
row.

**The test the tab row applies is "does a reader have to reach this while
scrolling".** *Where the controls sit* wrote that down and then applied it to
the row as a unit: the board's filters qualify a table six hundred rows long and
losing them off the top of the page would be losing them, where these qualify a
stream read from the top and worked once on arrival. That is exactly right about
the **kinds** — nobody is forty items into a day's plays and then decides they
wanted only the home runs; picking a kind is what you do when you arrive, and it
is the answer to the question the page was opened with. It is exactly wrong
about the **order**. *What happened while I was out* is a question a reader asks
after they have started reading, and the control that answers it was at the top
of a stream they had already scrolled past — 700px past it, in the case
measured. So `Oldest first` goes with the tabs, which are pinned, and the kinds
stay where they are.

**Both halves are drawn from one component** (`FeedFilters.tsx::FeedOrderToggle`
and `FeedFilterPills`), because there is one place that still wants them on one
row: the new-plays page's own navbar, which has no tab row to hang an order off.
That caller passes `order` and gets the toggle back inside the row, at its right
end, `flex: none` with `margin-left: auto` outside the scrollport — unchanged
from where it stood. `compact` is the only difference between the two drawings
and it is a height: in the tab row it is a bare `.research-toggle`,
`--control-h` (36px) like the mode toggles beside it, and in the navbar it takes
`.feed-filter-pill` so that row is one height. **Measured: 99 × 36 in the tab row
at 320, 390, 640, 900, 1200 and 1920** — the same box at every width, and the
same box lit and unlit, which is the *reserve the box* rule the label's own
refusal to flip to `Newest first` already answers.

**The pill row is the batter tab's alone now**, where it was drawn on both. It
was drawn on both *because* of the toggle — an outing carries a clock like a
plate appearance does — and with the toggle gone a pitcher tab would draw an
empty row. Checked at `?kind=pitcher&newplays=1&plays=hr`: **no pill row, the
toggle still in the tab row, no red button, no new-plays page, `Recent
outings`** — the same excursion the old gate was measured on, one control
further along. The row's own height is untouched at **34px**, the kinds being
what set it.

**What it costs is a line of chrome at two widths, and it is the same line the
`Plays` disclosure gave back.** A/B'd on the same page by hiding the button:
**320 goes 261 → 309px of chrome** and **640 goes 165 → 213**, a 48px line
either way (a 36px control and the row's 12px gap); **390, 900, 1200 and 1920
are unchanged** at 213 / 169 / 169 / 169. *Where the controls sit* recorded the
disclosure's removal buying back exactly 320 and 640, so this spends one of the
two things that purchase bought and keeps the other — the panel, its count badge
and the two rules it needed are still gone. The trade is deliberate: 48px of a
phone once, against a scroll back up the stream every time the reader wants the
day turned round.

**And the same move again on the new-plays page**, which was the one surface
left drawing the pills in its chrome and now draws them in its page with
`Oldest first` in its pinned head — see *The new-plays page splits its two
controls the way every other surface does*.

**The same move on the matchup page's team feed** (`LeagueTeam.tsx`), and it is
the same argument in that page's own terms: the toggle joins `mup-tools` beside
the other two *which reading of it* controls (`Schedule`, `Projected`), on the
feed reading alone — there is no order to a table — and the pill row there is
drawn on the batter tab alone for the reason it is here. See **The Feed reading
takes the play-filter pills** in `client-league-matchup.md`.

### The new plays are a page now, not a mode

**`New plays is a mode, not a pill` has been overtaken, and only its middle
clause.** The mode was right that `New` asks *when* where the pills ask *what
kind*, that the two must be able to AND, and that the red button belongs where
the news landed. What it got wrong is what pressing it should *do*. Narrowing
the Recent section in place meant the stream a reader was reading rearranged
itself around them — items above them vanished, the heading under their thumb
changed its word — and then rearranged itself again on the way out. The section
even had to argue its way out of scrolling on the return leg for that reason.

**So the plays open as a page over the feed** (`LiveFeed.tsx::NewPlaysPage`), and
the stream underneath is the whole day whether the page is up or not. Measured
at 1200×900 with the reader 700px down: opening the page leaves **10 items and
both section headings** exactly as they were behind it, and one press of Escape
puts the reader back at **656** — 700 less the 44px the red button's own row
gives up when the count goes to nought, which is the browser's scroll anchoring
doing what *The button appearing does not move the reader* already measured, in
the other direction.

**It rides on `.details-view`**, the class every full-screen page in this app
rides on, and takes the conventions with it: its own fixed box and scroller,
`useLockBodyScroll`, `useOverlayFocus`, `answersEscape`, a `BackButton` and a
pinned head. **Portalled to `document.body`** — measured, `parentElement` is
`BODY` — which is a fact about CSS rather than about this ladder:
`.app-dialog-body` declares `container-type: inline-size`, and layout
containment makes a box a containing block for `position: fixed` descendants, so
a page rendered inside one would be laid out inside that dialog. Nothing opens
this from inside a dialog today; the portal is what keeps that from becoming a
bug the day something does.

**Layer 48, not `.details-view`'s own 50**, and the reason is the Escape ladder
rather than stacking. A name or a headshot on any of these cards opens the
**player page**, which is fixed at 50; two boxes on one layer are two boxes
`overlayAbove` cannot order, and both would read nothing above them, so one press
would be answered by whichever listener happened to run first. At 48 —
`.mup-view`'s number, for `.mup-view`'s reason — the ladder is `feed → new plays
(48) → player page (50)`. Driven: with a player page open over it, the page
reads **z-index 50 against 48**, `.newplays-view` carries `inert`, focus is
inside the player page, and Escape unwinds one rung a press.

**What the navbar carries**, all of it pinned: the back button, the filters, the
order toggle, and **the window the plays cover**. That last is off the same
`entryTime` the stream is ordered by rather than a second read of the timestamps,
and it narrows with the pills, which is the honest reading — it states the range
of what is *on this page*. Measured: **`12:43 PM – 8:34 PM`** over 28 new plays,
**`2:12 PM – 8:34 PM`** with `HR` lit, and **`8:06 PM`** where the lens leaves one
play, the two stamps collapsing to one rather than printing `8:06 – 8:06 PM`. The
date is printed only across two days (`Aug 18, 7:12 PM – Aug 19, 4:07 PM`): one
baseball day is already named in the app's own date bar and repeating it on every
reading of it is noise.

**Geometry: the navbar is 112px at 320, 390 and 1200** — the same box at all
three, the head being 46px of it — and **100px** where there is no range to state
(an empty page). No horizontal overflow at any of the three, on the page or in
the view. The kind group goes on scrolling inside it rather than wrapping: **353px
of content in 353 at 1200, 256 at 390 and 186 at 320**, with `Oldest first` outside
the scrollport at x=906 / 280 / 210.

**Both paragraphs above are the navbar that carried the pills, and it does not
any more.** The filters are in the page at the head of the list and only the
order is still pinned, which takes the box to 66px at 1400 and 390 — see *The
new-plays page splits its two controls the way every other surface does* below,
which carries the new figures and the argument. The rest of what is written here
— the range line, the layer, the two ways out, the inert background — is
untouched.

**A press cannot get behind it, and the clips behind it stop painting.** With the
page open `[inert]` is `#root` and a `SCRIPT`; all five sample points (four
corners and the center) hit inside `.newplays-view`; two real dispatched presses
at the bottom corners open nothing, change the feed's 10 items not at all and
leave the URL byte for byte. And `2 of 2` of the feed's own `<video>` elements read
`visibility: hidden` while the page is up and **both are visible again** the
moment it closes — the `[inert] video` rule composing for free, which is what it
was written to do.

**No `swallowNextClick`.** That rule is for a dismissal by a press *outside* the
box, where the control under the finger was never covered and the click lands on
it. This page is opaque and full-screen and has no backdrop: the only presses
that close it are its own two buttons and Escape, and a click on a button is
already spent on that button.

**Two ways out, at the two ends, exactly as the mode had.** `Back` in the pinned
head — which is the half the mode had to draw at the top of its list and now gets
for free from the head being pinned — and `Show all plays` after the last card,
because a reader who has read down a short list of new plays is at the bottom of
it. Both call the same `onShowAll`, so there is one definition of leaving and one
route to the marker; **leaving is still what marks the stream read**, and `Clear`
beside the red button is still the other answer. Measured: one Escape takes
`newplays=1` out of the URL, drops `[inert]` to nought, leaves the feed's 10 items
standing and takes the red button away with the count.

**Linkable on the parameter it already had.** `newplays=1` said *which stream this
view is showing* and says *this page is open*, which is the same fact one shape
along — so no second parameter was invented, which is the rule that two params
must never mean two things. Driven: **`?view=feed&newplays=1&plays=hr` opens the
page with `HR` lit on 2 items** and the feed behind it narrowed to the same 2;
`?newplays=1&oldest=1` opens it with both toggles lit and the first play of the
day at the head (`McGonigle, DET @ PIT, 1st`) where `?newplays=1` alone heads on
the newest (`Stewart, CIN vs STL, 6th`); and **`newplays=banana` opens the plain
feed on 10 items** rather than emptying it, which is the direction every parameter
in this app fails in.

**The middle of those three no longer holds, and only the middle.** `oldest=1`
is the *stream's* direction and stops at the page: the page has one of its own
under `noldest=1`, which is a second parameter and had to be — see *The
new-plays page keeps its own direction* below, where the four-way table is
driven. `newplays=1` is still the only thing that says this page is open, which
is what the paragraph above is about.

**The page has its own empty state and its own way out named in it**, which is
what the section it replaces could not do without also naming the pills: `Nothing
new since you last marked the feed read. Back is the whole day again.` and, with a
lens on, `No new plays of that kind. The pills above are narrowing this — All is
every kind of play, and Back is the whole day again.` Both drawn with no range
line and no foot button, there being nothing to state a range over and nothing to
have read down. The feed's own empty state is one sentence shorter for it: the
three-shaped answer the two axes forced is one axis again, and the mode's two
branches are gone from it.

**It pages on its own**, seeded at `FEED_PAGE_SIZE` and reported nowhere: the page
is opened, read and left, where the feed's own depth has to survive a view switch.
Measured on 28 new plays: **10 on open, `Load more 18`, 20 after one press.**

### The new-plays page splits its two controls the way every other surface does

**Its navbar carried both and now carries one.** *What the navbar carries*
above lists "the back button, the filters, the order toggle, and the window the
plays cover", all of it pinned — which was the one place left in the app where
the kind pills lived in the chrome rather than in the page. Two sections earlier
this file argues at length that they should not: *Where the controls sit* puts
them at the head of the stream they narrow, *The order toggle went to the
navbar, and the pills did not* separates the two controls by the test a pinned
bar applies, and `LeagueTeam.tsx` makes the same move a third time on the
matchup's team feed. The page was the exception because its row was read as *two
controls with nowhere else to go*. They have somewhere else to go: its own page,
and its own head.

**So the pills are in the page at the head of the list, and `Oldest first` is in
the pinned head beside `Back`.** Nothing in the argument is new — a kind is
picked on arrival, an order is wanted halfway down a list — and the head is this
page's tab row, the bar that is always on screen. The toggle rides on a row that
was already there, so what the move costs is nothing and what it buys is a whole
row of pinned chrome.

**Geometry, driven at 1400 / 390 / 320 on the live roster with 51 new plays**,
before → after. `.newplays-chrome` is the box, and is what `--details-chrome-h`
is measured from:

| | 1400 | 390 | 320 |
| --- | --- | --- | --- |
| navbar height | 112 → **66** | 112 → **66** | 112 → **114** |
| `--details-chrome-h` | 112 → **66** | 112 → **66** | 112 → **114** |
| the head inside it | 46 → 46 | 46 → 46 | 46 → **94**, two rows |
| the pill row's top | 78 (chrome) → **82 (page)** | 78 → **82** | 78 → **130** |
| navbar → pills | 16 → **16** | 16 → **16** | 16 → **16** |
| pills → first item | 16 → **16** | 12 → **12** | 12 → **12** |
| horizontal overflow | none → none | none → none | none → none |

Neither gap is a new rhythm: the 16 is `.details-chrome`'s own bottom margin
collapsing with `.feed-filters`' 16px top one, and the 12 under 640px is
`--stack-gap`, which the narrow block already hands `.live-feed` and
`.feed-filters` together. Nothing in the page had to be told the pills had
arrived, and the rule the head used to carry — *no top margin, and the 16px
bottom one `.details-chrome` takes from its last child* — went with them:
`.newplays-head` carries it now, its `margin-bottom` going 12 → 16.

**That margin was the wrong shape for the job and has become a padding on the
chrome.** A margin on a last child with no padding or border under it collapses
*through* its parent, so the 16px was never inside the pinned bar at all and the
head sat flush on its hairline — see *The new-plays navbar has a bottom edge
again* below.

**46px of pinned chrome given back at 1400 and 390, and two pixels spent at
320.** There the head wrapped — `Back`, the name and a 99px `Oldest first` came
to 399px of content on a 288px line — so the navbar was 114 where it had been
112 (**the wrap is gone**: the order control is an arrow alone below a 360px
container now, and the head is 46px at 320 again — see *The order control says
its direction*),
against a pill row that was 46 of those 112 and now scrolls away with the
stream. **The row gap for that wrap is declared as 12px on `.newplays-head`**
rather than left at `.details-head`'s 20: measured, 20 makes the navbar **122**
and 12 makes it **114**, and 12 is the gap this head had to the pill row while
the pills were up here. `--details-chrome-h` follows the wrap by itself, which
is the whole reason it is measured rather than declared.

**The kinds stopped scrolling at 390**, which the move bought without being the
point of it: the row is the kind group alone now, so the group gets the whole
column. Content against port: **353 in 256 → 353 in 353 at 390**, and 353 in 186
→ **353 in 288 at 320**, where it still scrolls and always did.

**`compact` went with the row it existed for.** `FeedOrderToggle` took a flag
that made it 30px tall for exactly one caller — the navbar row where it stood
shoulder to shoulder with the pills — and beside `Back` it is the same
`--control-h` box the tab row draws: measured **99 × 36 at 1400, 390 and 320**,
lit and unlit. `FeedFilterPills`' `order` prop went with it, and so did
`.feed-filters .feed-order`'s `margin-left: auto`. A prop with no caller is a
prop nobody misses.

**The pills are drawn on a guard that is the empty state's own two branches read
off one condition** — `entries.length > 0 || playFilter !== null`. With a lens in
force the row is what emptied the page and the sentence under it points at the
row; with no lens and nothing new there is nothing to narrow, and a row of pills
would be a control over nothing, which is `filteredCards.length > 0`'s rule one
page along. Driven with the marker planted at *now*, so the page is empty:
`?newplays=1` draws **0 pills** over *Nothing new since you last marked the feed
read. Back is the whole day again.*, and `?newplays=1&plays=hr` draws **7** over
*No new plays of that kind. The pills above are narrowing this — All is every
kind of play, and Back is the whole day again.* — a sentence now true in the
strong sense, the pills being directly above it in the page rather than pinned
above the page.

**Everything else about the page is untouched**, driven on the same roster: the
pills still narrow it and the range still narrows with them (`plays=hr` → **3
items**, `12:43 PM – 11:48 PM` → `2:12 PM – 9:37 PM`; `plays=sb` → **1 item**,
`8:06 PM` collapsed to one stamp); one Escape closes it, `[inert]` goes **2 →
0**, `newplays=1` leaves the URL and `plays=hr` survives with the feed behind
narrowed to the same 3; and `?kind=pitcher&newplays=1` opens **no page at all**.
The Feed's own page is unmoved — chrome **213px at 390**, the pill row at y=227
in the page, `Oldest first` in the tab row, the red button reading `51 new
plays` — and so is the matchup team feed, **7 pills in the page with the toggle
in `mup-tools`**, which is where this move was copied from.

### The order control says its direction

**It was a lit toggle that read `Oldest first` in both states; it is a direction
control that says which direction the stream is in.** An arrow and a word —
`▲ Oldest first` or `▼ Newest first` — the word naming *the state the stream is
in* rather than what pressing does. *The stream can be read forwards* argues the
other way above, and its own paragraph is marked as overtaken.

**What broke the old rule is the second stream.** `Oldest first` was both
readings at once — what the press does and what being lit means — and that only
holds while the button is the *only* order control on screen. It is not: the
new-plays page has a direction of its own now (see below), so a reader crossing
between the two meets two buttons that may disagree, and a button whose word is
the same in both states cannot say which of the two streams they are looking at.
A lit border is a weaker statement than a word, and it is being asked to carry a
*state* that the word is only carrying an *action* for.

**The geometry half of the old rule is kept, by reservation rather than by
silence.** Both words are laid out in one grid cell and the one not in force is
`visibility: hidden` — the app's *reserve the worst case by laying it out*
device, which `.research-arrow` already applies to the board's sort mark on
every column, sorted or not. Measured in the tab row at 1400: the button is
**118.58 × 36px at x=606.72, lit, unlit and lit again**, where `Newest first` is
**78.58px of text against `Oldest first`'s 72.72** — 5.86px the box would have
jumped on every press without the ghost.

**The arrow is the research board's own sort mark**, `▲`/`▼`, leading the word
the way it leads a column label there, in an 8 × 9px box declared in both axes
for that mark's own reason: the glyph's metrics belong to whichever installed
face claims it. `▲` is ascending, and oldest-first *is* ascending — the day's
clock running down the page.

**Where the bar is too narrow for the word, the arrow stands alone, and the
threshold is a container query rather than a breakpoint.** This one button sits
in three bars, and at *the same window width* they are three different widths:
at a 390px window the tab row's container is **346**, the new-plays head's is
**358** and `mup-tools` is **358**. A media query would have had to answer for
one of them and guess at the other two. So each bar declares
`container-type: inline-size` and the word is dropped on that bar's own number.

**`.view-bar` and not `.view-bar-tabs`**, which is this app's *layout
containment* rule met in a second form. The tab row is the only child of
`.view-bar`, a flex row, so it is a **flex item sized shrink-to-fit** — and
inline-size containment is exactly the promise that a box's inline size does not
depend on its contents. Measured with the declaration on the row: the tab row
went **1356px → 0px** at 1400, every tab still painted and overflowing a
zero-width box. The container has to be a box already filling its parent.

**The tab row's number is 335px**, measured. Below 456 of container the row is
two lines whatever this button says and the button is on the second one, with
the kind tabs and `Starters`; that line is **333.69px of content with the word
and 251.11 without** (and the whole row is 703.3 against 620.72), so below ~334
the word pushes the button onto a third line.
Driven at 1400 / 900 / 640 / 390 / 320:

| container | 1356 | 856 | 596 | 346 | 276 |
| --- | --- | --- | --- | --- | --- |
| lines, with the word | 1 | 1 | 2 | 2 | **3** |
| lines, without | 1 | 1 | 1 | 2 | **2** |
| `--chrome-h` as shipped | 169 | 169 | 213 | 213 | **261** |
| the button | 118.58 | 118.58 | 118.58 | 118.58 | **36** |

Above 335 the word is carried **even where it costs the row a line** — a 640
window and the band around 700 are both two-line rows that would be one without
it, 48px each. That is the trade taken deliberately: the `title` is the only
other thing on this button that says which way the stream runs, and **a touch
device has no pointer to raise one with**, so at the widths this app is actually
read on the word is the whole statement of what the control is doing. The
`aria-label` carries the sentence at every width, so nothing is lost below the
threshold that a screen reader could have had.

**The new-plays head's number is 360**, and it is bigger for a reason that is
the head's rather than a rounding: that head is one line, not a row that may
wrap to two, so losing the word costs nothing there and keeping it costs a whole
second line of **pinned** chrome. `Back` (80.1) and the button (118.6) with two
20px gaps leave the name-and-range block 119px, and the range line is about that
wide (`12:43 PM – 11:48 PM`), so the head wraps just under 359. Measured with a
range up: the head is **46px at a container of 358 and 94px at 345**, taking
`--details-chrome-h` to **130**; with the word gone it is 46 and the chrome 82 at
every width down to a 288px container. A two-day range
(`Aug 18, 7:12 PM – Aug 19, 4:07 PM`) is wider still and will wrap the head above
this number — which is why the head keeps its `row-gap` and why that height is
measured rather than declared.

**Below the threshold the button is the app's own 36px square** —
`width: var(--control-h); padding: 0`, which is what `Starters` beside it takes
below 640 and for that rule's reason: a run of icon buttons that are 36 and 34
reads as two kinds of thing. Measured at 320, the two are the same square on the
same line.

**`mup-tools` takes the tab row's 335 and it costs that bar nothing**: driven on
the matchup team feed at 1400 / 640 / 480 / 390 / 360 / 320, the band is
**1 / 1 / 2 / 2 / 2 / 3** rows with the word and the same six numbers without
it, so there the threshold only buys horizontal slack. The button reads
`▼ Newest first` down to a 358px container and `▼` at 328.

**The three bars therefore disagree at 390, and that is the point.** The tab row
shows `▼ Newest first`, the new-plays head shows `▼` alone, and each is
answering its own width. Driven at 377 the tab row is already down to `▼` while
`mup-tools` still has the word.

### The new-plays page keeps its own direction

**It was `feedOldestFirst`, shared with the stream underneath, and that is the
fault.** Turning the new-plays page round turned the feed round with it, and
leaving the page put the reader back on a whole day running backwards with
nothing on the page they had just left having said so. A press about one page
must not rearrange another — the same rule as *a lens is put away when its page
leaves the screen*, read from the other end. The page is a bounded catch-up read
and left; the stream under it is the whole day and is **still on screen behind
it**.

**So two flags and two parameters: `oldest=1` here, `noldest=1` there.** Two
params must never mean two things — `proj=1` is a matchup's and `rproj=1` is the
roster's, deliberately — so the page's direction takes a name of its own rather
than a second reading of `oldest=`. The `n` is `newplays=`'s own letter, the way
`rproj`'s `r` is the roster's. It is written **only under `newplays=1`**, on
`starters=1`'s rule: a direction for a page the link does not open is a claim
about something nobody can see.

**It defaults to newest-first, and the alternative was seriously held.** The
page is a catch-up with its own stated window in its head, and a catch-up read
forwards reconstructs the afternoon in the order it happened. What decides it
against is that the set is not reliably small: a reader away for a day opens
this on 51 plays paged twenty at a time, and oldest-first buries the play that
raised the red button under two presses of `Load more` — and that play is the
reason the page is open at all. So the page opens the way the stream it opened
over opens, and absence in the URL means that, which is how every binary lens
here spells "off" and what lets the default be redefined later without anyone's
link needing revisiting.

**One list is re-sorted, not merged twice.** `newRecent` is `allRecent`
filtered — `filter` hands back a fresh array — and then sorted on its own flag
with the same pair the stream uses (`byPlayOrder` / `byRecency`), so the two
lists cannot come to disagree about a play's own grouped events. Live and
Upcoming are not on the page at all, so the three-sections note above is the
whole of what an order can turn here.

**Driven on the roster's 2026-08-19 (51 new plays, the marker planted at 8am
that morning), at 1400:**

| link | feed head | page head | tab row | the page's own |
| --- | --- | --- | --- | --- |
| `newplays=1` | Betts | Betts | Newest first | Newest first |
| `newplays=1&oldest=1` | **McGonigle** | Betts | Oldest first, lit | Newest first |
| `newplays=1&noldest=1` | Betts | **McGonigle** | Newest first | Oldest first, lit |
| both | **McGonigle** | **McGonigle** | Oldest first, lit | Oldest first, lit |
| `noldest=banana` | Betts | Betts | Newest first | Newest first |

`noldest=banana` also leaves the URL on the next sync, which is the direction
every parameter in this app fails in.

**And the round trip, which is the report this fixed.** Opened at
`newplays=1&oldest=1`, the page's own toggle pressed three times and then `Back`:
the feed's head is **Kevin McGonigle at every one of the five snapshots**, its
ten items stay ten, `oldest=1` never leaves the URL, `noldest=1` arrives and
leaves with each press and goes on `Back` — because it is only written while the
page is up. The tab row's button reads `Oldest first, lit` throughout and the
page's flips under it.

### The new-plays navbar has a bottom edge again

**Its head sat flush on the bar's own hairline**, `Back`, `New plays` and the
order control against the bottom of the pinned box with the 16px that was
supposed to be under them outside it. The cause is margin collapsing:
`.details-chrome` carries **no bottom padding** — right on the player page,
where its last child is the tab strip and the active tab's 2px underline *is*
the bar's bottom edge — and with no padding or border there, `.newplays-head`'s
own `margin-bottom` collapsed straight through the box and became the gap
*below* it. Measured at 1400 before: the chrome is **66px**, which is 20 of top
padding plus a 46px head plus nothing.

**So the number moves onto `.newplays-chrome`, where a padding cannot collapse,
and the head gives its margin up.** 16px rather than the 20 above it: the top
padding is clearing a window edge and a rounded corner where this is clearing
text from a rule, and 16 is the gap every other box on this page reads. The gap
*under* the bar is unchanged — that is `.details-chrome`'s own
`margin-bottom: 16px`, which is what the head's margin was collapsing into and
is now the only thing there.

**`--details-chrome-h` follows by itself**, `useOverlayChromeOffset` measuring
the border box on a `ResizeObserver`. Driven with a range line up, before →
after:

| | 1400 | 640 | 480 | 390 | 320 |
| --- | --- | --- | --- | --- | --- |
| `.newplays-chrome` | 66 → **82** | 66 → **82** | 66 → **82** | 66 → **82** | 114 → **82** |
| `--details-chrome-h` | 66 → **82** | 66 → **82** | 66 → **82** | 66 → **82** | 114 → **82** |
| head → bar's bottom | 0 → **16** | 0 → **16** | 0 → **16** | 0 → **16** | 0 → **16** |
| bar's bottom → pills | 16 → **16** | 16 → **16** | 16 → **16** | 16 → **16** | 16 → **16** |
| the head itself | 46 | 46 | 46 | 46 | 94 → **46** |

**320 is the row that gains twice.** It was 114 because the head wrapped there —
`Back`, the name and a 99px `Oldest first` on a 288px line — and the arrow-alone
form fits, so the head is 46 again and the bar is 82 like every other width. The
`row-gap: 12px` that wrap needs stays declared: a two-day range will still wrap
it, and the height is measured for exactly that reason.

**Neither declaration is written on this page's own selectors any more, and
nothing about this page changed.** The **outing page** turned out to be the same
box in its *loading* state — a head with no tab strip under it, flush on the
hairline, 66px — so the two numbers are one rule keyed on there being no strip
(`.details-chrome:not(:has(.details-tabstrip))`, beside `.details-chrome`
itself), which is this repo's fold-don't-restyle rule: they are the same object,
a details chrome whose last child is a head. This page never has a strip, so the
rule matches it at every width and the chrome still measures **82**. The two
paragraphs above are left where they are, carrying the reasoning and the
measurement that established it. See **Pitchers**, *The outing page's head closes
itself while the outing is being read*, for the second measurement.

**Bundle: 602.26 → 602.83 KB of JS** (179.31 → 179.45 gzipped) and **159.54 →
160.17 KB of CSS** (28.57 → 28.67) — 0.57KB of JS for a second piece of state, a
second parameter and two spans, and 0.63KB of CSS for the reservation grid, the
three container declarations and the two queries.

### What counts as a play, and the ones that were not plays

**A stream item was any plate appearance with an event on it, and MLB files
plays under a batter that are not his plate appearance.** `playerDayEntries`
tests `filter((pa) => pa.event)` — a play that has been given a result — and for
the *client* that is the right test: what it can trust is what the server called
a plate appearance. What the server called one was too much.

**What was getting through**, counted over every raw feed in the cache — 1,600
blobs, **672 distinct games, 121,133 plays**:

| filed as | plays | in a batter's stream before | after |
| --- | --- | --- | --- |
| `caught_stealing_2b` | 75 | 0 | 0 |
| `pickoff_1b` | 23 | 0 | 0 |
| `pickoff_caught_stealing_2b` | 15 | 0 | 0 |
| `caught_stealing_home` | 4 | 0 | 0 |
| `caught_stealing_3b` | 3 | 0 | 0 |
| `pickoff_3b` | 2 | 0 | 0 |
| `pickoff_2b` | 2 | 0 | 0 |
| `pickoff_caught_stealing_3b` | 1 | 0 | 0 |
| `pickoff_caught_stealing_home` | 1 | 0 | 0 |
| `wild_pitch` | 1 | 0 | 0 |
| `stolen_base_3b` | 1 | 0 | 0 |
| `game_advisory` | 1 | 0 | 0 |
| **`other_out`** | **7** | **7** | **0** |

The first eleven were already excluded **by name** —
`savant.ts::isBaserunningEvent`, a list of event families applied twice, once to
the batter's plate appearances and once to the pitcher's batters faced — and
`game_advisory` by a `continue` of its own in the play loop. `other_out` is a
runner thrown out advancing (*Victor Robles out at 3rd*, a challenged tag play),
and nobody had told either list about it. So it was a card in the stream, filed
under the batter who happened to be at the plate and labeled off the raw event
type: `eventLabel` prettifies anything it has no name for and the stylesheet
capitalizes the result, so it read **`OTHER OUT`**. A `pitching_substitution`
filed as a play of its own — which this API does not do and others have — would
have read *Pitching Substitution* by exactly the same route.

**Driven, before → after**, on the seven days those seven plays fall on, through
`/api/players/:id/day` (the route the player page's day dialog reads, drawing
the same `playerDayEntries` items the stream draws), against MLB's own game log
for the same player and day:

| | items | derived line | MLB's line |
| --- | --- | --- | --- |
| Abimelec Ortiz, Aug 8 | 5 → **4** | 5 AB → **4** | 1-for-**4** |
| Bryan Reynolds, Aug 7 | 6 → **5** | 6 → **5** | 2-for-**5** |
| Trevor Larnach, Jul 11 | 4 → **3** | 4 → **3** | 1-for-**3** |
| Brendan Donovan, Aug 18 | 5 → **4** | 4 → **3** | 1-for-**3** |
| Steven Kwan, Jul 19 | 5 → **4** | 5 → **4** | 2-for-**4** |
| Connor Wong, Aug 6 | 5 → **4** | 4 → **3** | 2-for-**3** |
| Jeremiah Jackson, Aug 6 | 5 → **4** | 4 → **3** | 0-for-**3** |

Every one of the seven was **one at-bat above MLB's own line** before and agrees
with it exactly after, which is the measurement that makes this a bug rather
than a preference. Donovan's day drawn in the browser went from `DOUBLE · WILD
PITCH · STRIKEOUT · OTHER OUT · STRIKEOUT` to the same list with the fourth
gone; the `WILD PITCH` beside it is *his* base event and stayed, which is the
half that must not move.

**Excluded at the play rather than at the item**, which is what makes the three
sections and the two counts agree without anything being told twice. The test is
`mlbStats.ts::isPlateAppearance`, in the loop that reads the play, and it gates
the two *rows* the play would contribute — the batter's plate appearance and the
pitcher's batter faced — and nothing else: the outs and the bases still advance,
the pitches are still the pitcher's, and the **base event the play really is**
is still filed under both parties, that being the item the reader wanted all
along. Everything downstream is one list read through: `passesFilters` narrows
it for the pills, `newPlays` counts it for the red button, `entries` feeds
Recent, `liveEvents` feeds Live, `upcoming` never held plays — so a play that is
not in the stream is not in the tally either, and no count can disagree with the
list it counts. The client's own `filter((pa) => pa.event)` is left exactly as it
was: a second test here would be a second definition of a play, free to drift
from the first.

**The rule is structural rather than a list of names**, which is the whole point
— a list has to be extended for every kind MLB adds, and had not been extended
for the one that was actually arriving. **A plate appearance is a play the
batter is himself one of the runners on**: he reached, he was put out, or he
struck out, where a runner's play names only the runner. Measured over those 672
games (50,473 plays): all **50,337** plays of the 21 batter-outcome event types
carry a runner row for the batter, and all **136** plays of the 13 kinds that
are not plate appearances carry none. No exceptions either way. `result.type`
cannot be the test — this API stamps every play `atBat`, caught stealings
included (**121,133 of 121,133**) — and an in-progress play is a plate
appearance by definition here, having no result and so no runner rows yet, which
is `midAtBat` passed in rather than read a second time.

**`DAY_SNAPSHOT_VERSION` goes to 7 for it**, with nothing added to the shape: a
v6 snapshot holds reports built under the old rule and would go on serving the
`OTHER OUT` card and the extra at-bat forever. A version guards the meaning of
what is stored, not only its shape, which is the arsenal blob's own `-v5`
reason. No `FEED_CACHE_VERSION` bump — the raw feed is untouched, and
`runners[].details.runner.id` was already in `FEED_FIELDS`.

**What is unchanged, read off the roster's own days**: the per-day item counts
over the settled days of the week are identical before and after — 2026-08-12
through 08-18 at **53 / 32 / 46 / 40 / 39 / 43 / 49** — with the day's event mix
unchanged to the play. Only 08-19 moves (45 → 46), because a live game finished
between the two reads.

### The stream opens on ten

**`FEED_PAGE_SIZE` is 10 and was 20.** Twenty was a page of *scrolling* — on a
full slate the stream opened on more than a phone screen of cards and the
reader's first gesture was always down, which is the opposite of what a first
page is for. Ten is a page a reader can see the end of, which is what makes
`Load more` a choice rather than the only thing left to do.

**Measured on the live roster, 28 items in the Recent section: 10 items on first
paint at 320, 390, 640, 900, 1200 and 1920**, with `Load more 18` under them at
every one of the six. The count under the button is what stops a cut list reading
as *that is all there is*, and it was already there — this is the file's existing
paging idiom taken at a smaller step, not a new control.

**The read is silent**, which is the loading rule rather than a property of the
number: `Load more` grows a slice of a list already in hand, so there is no
request, no wait and no badge — the same reason the order toggle's press is
quiet. And the number is a **floor rather than a ceiling**: App and `LeagueTeam`
seed the component from `feedShown`, so a page a reader had already grown to
sixty comes back at sixty after a view switch, which is the fault that made App
hold the count in the first place.

**Bundle: 591.79 → 593.90 KB of JS** (176.58 → 177.08 gzipped), **CSS 157.84 →
158.17** (28.18 → 28.24) — 2.1KB raw and 0.5KB over the wire for a page, a
component split in two and the comments arguing both.


### Measured

**Every count checked against the raw API figures** for 2026-08-17 (43 plate
appearances and 8 base events across 14 batters — 6 home runs, 5 doubles, 7
singles, 1 steal, 5 runs, 9 plate appearances with an RBI, every play with a
`playId`), 51 items in the stream:

| pill | drawn | raw |
| --- | --- | --- |
| `H` | **18** | 6 HR + 5 2B + 7 1B |
| `RBI` | **9** | 9 plate appearances with an RBI |
| `HR` | **6** | 6 home runs |
| `SB` | **1** | 1 steal |
| `R` | **5** | 5 runs scored |
| `Video` | **51** | every item — which is the measurement that retired the
proxy it was drawn from; see *`Video` was selecting the whole stream* above |

The table is in the row's own order, and the two renamed rows are the two rows
that were renamed: the sets are the ones they always were, and `HR` was re-read
off the rendered page after the reorder at **6** to prove it. Those were taken
when the chips unioned, and the union's own two rows (`HR + SB`
7, `HR + RBI` 9) are what the row can no longer be asked for. (`XBH` drew **11** —
5 doubles and 6 home runs — on that same day, which is the figure its own removal
is argued from above.)

**Single-select on the kind axis, driven end to end.** Exactly one pill is lit at
every step and the URL follows it: `All` with no `plays=`, `HR` and `plays=hr`,
`SB` and `plays=sb`, `All` back with the param gone. **Seven pills**, no `New`
among them. The `Plays` toggle and its panel are **0** on the page at every one.

**The whole new-plays cycle**, driven at 1200×900 on the live roster over
`Yesterday`, with a marker planted seven days back so the count is non-zero
(**and in a `server/data` of the worktree's own, not the shared one** — the
marker is a *write*, and forward-only, so a test that plants one in the real
record cannot put it back):

| | lit | heading | red button | back buttons | items | URL | marker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| open | `All` | `Recent plays` | `51 new plays` | 0 | 20 | — | 1786504193513 |
| press it | `All` | **`New plays`** | — | **2** (head + foot) | 20 | `newplays=1` | 1786504193513 |
| press `HR` | **`HR`** | **`New plays`** | — | 2 | **6** | `plays=hr&newplays=1` | **unchanged** |
| `Show all plays` | `HR` | `Recent plays` | — | 0 | 6 | `plays=hr` | **1787023601744** |

The third row is the whole of what this change is for: the mode survives a kind
press, the two params are both in the URL at once, and the marker does not move.
The fourth is the other half — leaving is what marks it read, and the kind
survives *that*, which is right: the reader narrowed to home runs and did not ask
to stop.

**`Clear`, beside the count.** Driven on the live roster over `Today`
(2026-08-18, 20 items on screen of **56** new), against a server of the
worktree's own for the reason the table above gives — the marker is a
forward-only *write*, so it can be wound back in a `server/data` of one's own
and nowhere else. Planted at 24 hours back; the press advanced it to
**1787109926488**, which is 23:25:26 ET, the newest play in view.

| | red button | `Clear` | back buttons | heading | URL | marker |
| --- | --- | --- | --- | --- | --- | --- |
| open | `56 new plays` | drawn | 0 | `Recent plays` | — | 1787026821356 |
| press the red one | — | — | **2** | **`New plays`** | `newplays=1` | unchanged |
| open again, press `Clear` | **absent** | **absent** | 0 | `Recent plays` | **unchanged** | **1787109926488** |
| reload | absent | absent | 0 | `Recent plays` | unchanged | 1787109926488 |

The third row is the whole of it: the count goes, both buttons go with it, and
the query string is the one the reader arrived on — `?preset=Today&view=feed&roster=fantasy`
before the press and after it. The fourth is the half a session-held marker
could not do.

**The pair is one row's worth of box, and the box does not move.** Measured at
1200, 390 and 320 with the count at 56, before → after:

| | 1200 | 390 | 320 |
| --- | --- | --- | --- |
| red pill | 133×32 → 133×32 | same | same |
| `Clear` | — → 65×32 | — → 65×32 | — → 65×32 |
| the row | — → 206×32 | — → 206×32 | — → 206×32 |
| gap between them | — → 8px | 8px | 8px |
| **first feed item's top** | **253 → 253** | **291 → 291** | **339 → 339** |
| horizontal overflow | 0 → 0 | 0 → 0 | 0 → 0 |

Both pills are 32px and share a top, so the row needs no vertical correction;
206px of pair inside 276px of content at 320 leaves it centered with 35px either
side and nothing wrapping. And the list starts at the same y it always did,
which is the point of the pair being one flex item rather than two.

**What the press reclaims is exactly its own box.** The first item goes 291 → 247
at 390 on the press — the row's 32px and the section's 12px `gap` — and nothing
else on the page moves. That is a dismissal rather than a resize: the control
being pressed is the control being put away, and reserving a slot for something
that will not come back this session would be a gap where the news used to be.

**Bundle**: JS 578.64 → 579.02kB raw, 172.36 → 172.45kB gzipped; CSS 155.43 →
155.79kB raw, 27.82 → 27.85kB gzipped.

**Deep links.** `?plays=hr,sb` — a link written when these unioned — opens on
**HR** and rewrites itself to `plays=hr`; `?plays=xbh` opens on **All** and drops
the param. Neither is an empty stream, which is the direction every parameter in
this app fails in.

**The empty state names whichever control emptied it, and there are three
answers now rather than two** — the kind, the mode, or **both at once**, which is
the one it could never have to say while `New` was a pill. Driven at 390×844 on
`?newplays=1&plays=sb`: `No new plays of that kind.` over `Two controls are
narrowing this — **All** above is every kind, and **Show all plays** is every play
of the day.`, with **1** back button (the head one; the foot is not drawn over an
empty list) and 0 overflow. The other two read `No plays of that kind today.` and
`Nothing new since you last marked the feed read.` The
**day-level** message is still held back while a filter is what emptied it
(`filtered`), `No games for these players.` being a claim about the day and a lie
over a stream narrowed to home runs on an afternoon of singles.

**Widths, re-measured at 320 / 390 / 640 / 1200 / 1920 with the row a pill
shorter**: page-body overflow **0** at every one, the row **34px tall at every
one** — the property a wrapping row could not have — and the pinned chrome
**207 / 159 / 111 / 115 / 115**, unchanged, so dropping a pill costs the bar
nothing and gains it nothing. The row scrolls sideways at 320 (114px past its
276px scrollport) and 390 (44px past 346) and fits from 640 up (596 / 800 / 800,
scrolling nowhere) — where with the eighth pill it overflowed 390 by rather more.

**And the mode is unreachable where it would mean nothing.** Forcing
`?kind=pitcher&newplays=1` draws `Recent outings`, **0** pills, **0** back
buttons and no red button: App gates the mode on the batter tab, so the pitcher
stream cannot be put into a state it has no way out of.

**And it is drawn only where it can act**: **0** pills on the pitcher tab, **0**
on the Roster view, and **0** on a matchup team page's feed, which passes none of
the five props.

**Contrast, composited over the real ground in all six schemes.** The `New` count
badge — `--strikeout` on an 18% wash of itself — reads **4.45 (Midnight) to 5.64
(Powder Blue)**, which is the band the app's own `.feed-more-count` already
occupies (**4.54 to 6.12**), so it ships at the standard already set rather than
under it. The red **button** is the same ink on a *12%* wash, so it is higher than
the badge in every scheme by construction, and was measured at **5.97 / 7.80 /
6.31** on Light, Lavender and Powder Blue. The pills are ordinary chrome
(`.research-toggle`) at 12.09–17.75.

**Red rather than the accent, and it is the one control in this app that is.**
`--strikeout` is otherwise spent on a delta going the wrong way and on the news
mark's *filed today* — and this is that second sense, something has happened since
you looked. The accent means "this control is doing something", which is what a
lit pill beside it says and what the count must not, since it does nothing until
it is pressed. Its dot is the Live heading's own mark in the same red at the same
size, and deliberately **does not pulse**: that animation says a game is in
progress where this says a count is waiting, and two things pulsing in one column
read as one thing.

**Bundle, for taking `New` out of the row: 574.32 → 574.82 KB of JS** (170.85 →
170.92 gzipped) and **154.95 → 154.76 KB of CSS** (27.73 → 27.72) — 0.5KB of JS
raw and 0.07KB over the wire for a mode, two buttons and three empty-state
sentences, and the CSS **falls** by 0.19KB, `.feed-filter-count` having gone with
the pill that carried it.

**Bundle, for the feature as it shipped: 560.15 → 565.05 KB of JS** (166.36 →
168.01 gzipped) and **151.76 → 153.08 KB of CSS** (27.21 → 27.39). **And for the
row that replaced it: 574.13 → 572.97 KB of JS** (170.70 → 170.37 gzipped) and
**154.82 → 154.88 KB of CSS** (27.71 → 27.72) — the JS **falls** by 1.2KB (0.33
over the wire), a disclosure, a panel, a set and a membership toggle being more
code than a row and a lens; the CSS grows by 60 bytes, nearly all of it the
comments arguing the sideways scroll. **And for the `Video` lens learning what
film is: 572.97 → 574.17 KB of JS** (170.37 → 170.82 gzipped) and **154.88 →
154.95 KB of CSS** (27.72 → 27.73) — 1.2KB and 70 bytes raw, for a bulk read, a
per-game reel cache, a wait line and the paragraphs above restated where the
rules are.

- **feed** (`LiveFeed.tsx`) — the roster's day as **one chronological stream**. It had a second reading for a while, the same days grouped one card per player, and that reading is the player page's **Overview** tab now (below), which is where a card per player belonged: this page is the roster read by clock, and one player is not a roster. What is left is a chronological stream across the watched players of the active kind, in three sections (Live / **Recent plays** — "Recent outings" on the pitcher tab, since a pitcher's items are outings, not plays / Upcoming). What one stream item *is* depends on the kind: for a **batter** a single completed plate appearance; for a **pitcher** his whole outing (`FeedPitcherGame`), which is why the pitcher stream is sorted on his *last* batter faced (`lastFacedTime`). A **batter's** stream is interleaved with the base events off `PlayerGame.baseEvents` — his own baserunning, one item per play (see **the base-event vocabulary** below).

**A pitcher's are not items of their own**, and the difference follows from what each stream's item *is*. A batter's item is one play, so the bag he took is a play like the at-bat above it; a pitcher's item is the whole outing, and his balk belongs *inside* it — in the inning he threw it, between the two batters it happened between, which is where `InningsList` puts it and where his card has always read it (see **Pitchers on the roster**). Drawn as a stream item as well it was the same event twice on one page: once in the fourth inning of the outing and again a few hundred pixels below it, timed by its own clock and so detached from the outing by whatever else happened in between. The rule this replaces — that his events were never *pinned* to the Live section but stayed in the stream where they happened, since pinning them would put a balk from the second inning back at the top of the page every time he came out to throw the seventh — is honored more literally now than it was then: a balk from the second sits in the second. Nothing is lost with the item, because the inning row gained what it carried: it **opens onto MLB's line for the play and the clip of it**, and it prints the count a steal went on where a batter's row prints his pitch count. An outing **opens into a full-screen page** — `OutingPage`, `Line · Arsenal · Innings · Opponent`, which is where the whole read lives now (see **Pitchers on the roster**, *All four sections are back, as a page*); every other openable shape in this feed is a dialog, since the feed swapped its accordions for popups (see **Details are popups, not accordions**), and the outing is the one that outgrew a box. It takes the same *shape* as the rest of them: a **static identity header** (headshot + name + matchup, both of them links) over a full-width **line bar** (`.feed-item-toggle`) that is the only control — the batter item's `PlateAppearanceCard` in the same slot. The two were one row until the links inside the tap target made a mistimed thumb navigate away instead of expanding; **don't put the headshot or name back inside the toggle** (the same rule the Upcoming row now follows). The bar carries the tags, the line summary and the game's `GameStatusBadge` (score + Final/inning + bases) so a closed item still says how it went and how the game stands — which is why the context line under his name is just the matchup, the badge already spelling out the live inning it used to. The live-role tag moved to the header, where a batter's already sits (`.feed-item-head .live-role`). Pressed, it opens the page, which leads on his **Line** where the outing is over and on his **Innings** while it is still being thrown — a result against a narrative, and the page opens on whichever the outing is (see **Pitchers on the roster**, *All four sections are back, as a page*). That tab holds `InningsList` **first inning first** — a bar per inning, each of which opens *that* inning as a feed of the batters he faced and the base events he was a party to, in play order (see **Pitchers on the roster**, *An inning is a popup*). Checked from this bar on the live 2026 season: a pitcher in the bottom of the 4th opens on `Innings` with four inning bars, and a finished outing on `Line`. **The sentence this replaces was `and nothing else`** — the dialog held the innings alone, on the reasoning that *the arsenal table belongs to the breakdown and the details view, not to the item, which is a stream entry rather than a full read on the outing*. That was an argument about the **item** applied to the **box it opens**, and the box then had to grow a `Full breakdown` button to reach the read anyway; pressing an outing is asking for the full read, so it lands on one. The innings used to be drawn `newestFirst` so the half he was throwing sat directly under his name the way the stream around it reads; that is gone, and the whole of the argument is in **Pitchers on the roster**. The bar has a 44px floor so it's a thumb-sized target, and `.feed-pitcher` is its own `container-type: inline-size` so that at ≤480px its contents spread across it (`space-between`) with the **player card's** 9em floor on the line, instead of bunching at the right end. Open state is a flag of the item's own, like an at-bat's, and there is no scroll-on-open at all: the stream does not move. **Each live row carries the situation** — a `BaseDiamond` between the name and the role tag, runners and outs off `game.status` (the state *now*, where an at-bat card's diamond is the state that at-bat began in), the same glyph the card and the summary table's live badge use. Without it the section named a player's role and said nothing about the game he was in: "on base" with no word on who else was, "at bat" with no outs. **And the live at-bat carries what has happened during it** (`PlateAppearance.actions`, MLB's own line for each) — a pitching change above all, since who is on the mound is the whole question when your man is up and the card's matchup line has already been overtaken by it; mound visits, pickoffs and substitutions ride along. The server picks them by a **denylist** (`QUIET_ACTIONS`) rather than an allowlist, so a kind MLB adds later shows up rather than vanishing — the safe direction when the job is to say what is going on — excluding only the four that mean nothing happened (batter timeout, step-off, pitching timeout, and `game_advisory`, which is MLB talking to itself). They are filled **only while the at-bat is in progress**, which is the one place they are read: a day snapshot is written once every game is final, so no at-bat in one can be in progress, and no stored day can be stale for want of a field it could never have held, which is the reason this needs no `DAY_SNAPSHOT_VERSION` bump. No `FEED_CACHE_VERSION` bump either: `eventType` and `description` were already in `FEED_FIELDS`, which is leaf-matched, so every cached feed already carries them. The Live section pins whoever is at bat / on deck / on base / on the mound; a pitcher pinned there renders the same outing item, so `livePinned` keeps the stream below from repeating it. **A pitcher stays there until he is taken out of the game**, not just while his half is being played. `liveRoleGame` reads `GameStatus.inGamePitcherIds` — the pitcher each side still has in the game, one per team — where it used to read `pitchingId`, which is `linescore.defense.pitcher` and so names only the side currently *fielding*. Half of every game, therefore, a starter in the middle of a start was nobody's `defense.pitcher`: he dropped out of the Live section the moment his own team came up to bat, reappeared an inning later, and did that all night. Checked against a live board: with the Mets batting in the top of the 6th, McLean — their starter, due back on the mound in ten minutes — was not in the section at all. The server takes the **last entry of each side's boxscore `pitchers[]`**, that array being who has taken the mound in order and so ending on the man who has not yet been replaced (`inGamePitchers` in `mlbStats.ts`); it is filled from warmup on, the same property `startingPitchers` leans on. Checked against nine live games at once: for whichever side was fielding it named exactly the pitcher `defense.pitcher` did, and for the other it named the one in the dugout. A pitcher who really *has* been replaced falls out for good, which is the half of the old behavior that was right. **`pitchingId` stays and keeps its meaning** — the card's `.inning-block.active` accent is a claim about the half being thrown *now*, which is a different question and would be a lie about a pitcher sitting in the dugout. Live-only by nature, so no `DAY_SNAPSHOT_VERSION` bump — a snapshot holds only finished games — and no `FEED_CACHE_VERSION` one either: `pitchers[]` is absent from the compact feed a *final* is cached as, and this is only ever computed for a live game, which is always read from the unfiltered feed. **Only the batter actually up gets an at-bat under him there** (`roleAtBat`): a runner on base has nothing in progress, only the *completed* at-bat that put him there — which the Recent section already carries in full, clip and all — so surfacing it again up top stated the same thing twice and pushed the players who are batting down the page. On base and on deck are therefore the header row alone, which is also what a pitcher with no outing yet looks like. Its rows follow the same rule as the rest of the feed: **the identity row carries no box.** `.live-entry`'s header used to take the panel gradient, a border, a role-colored left accent and a 12px radius — the exact chrome of the `.feed-item-toggle` bar and the at-bat card below it — so a static row of two links read as a collapsed card and invited a tap that did nothing (on deck worst of all, where there is nothing under it to open). The role now reads off the headshot ring (`.feed-photo-link.role-*`, which gained the missing `role-pitching` rule in the process — folded onto on-base's purple then, and split off onto `--mound-teal` since) and the tag, and a role-colored **rail** on `.live-entry` itself runs the whole entry — flagging the group as live without any one row of it posing as a control. A box in this feed means something you can open. **Upcoming** splits the same way, and is built the same way — a static `.upcoming-id` (headshot + name) over an `.upcoming-head` bar carrying the matchup, the SP chip, **the announced starter on the other side** (`vs LHP Boyd` — surname only, as in the summary table's opponent cell, so the bar still holds the matchup and first pitch on one phone line) and first pitch, which is the whole of the row's interactive surface: a batter's opens a dialog on the **platoon card** with that starter's half marked (see below), a pitcher's on the lineup waiting for him — the same `OpponentSection` his card carries, since the probable on the other side is his counterpart rather than someone he faces (and no caret on that row, per the rule above; a control that raises a box gets one no more than a control that unrolls one). **And the row is grouped by a rail, the last of the five shapes to take one** (`.upcoming-item`, which now takes `.feed-item`'s layout so that class is the rail and nothing else) — the same rail `.live-entry`, `.feed-at-bat`, `.feed-base-item` and `.feed-outing` carry. Without it the section read as a run of loose blocks: a name and a bar under it, two things on the page with nothing saying they were one, beside neighbors that group themselves. (It was three while the split unrolled underneath; that half is a dialog now and the rail still earns its keep on the two that are left.) The tone is **`--muted`**, which is what `.feed-outing` takes for an outing with no decision yet and for the same reason — every other rail in this feed is a color for something that happened, and nothing has happened here, so this one groups the item and claims no more than that. A plain border rather than the base event's gradient: that mechanism exists for a play that was two things at once, which nothing scheduled is. The bar gave up its own 4px accent left edge on the way, since under a rail it is a second vertical line 11px inside the first — the fold `.feed-at-bat .pa-card` already makes, and for the same reason. It keeps its box, because it opens and that is what a box means here, and its hover still lights the whole border. The starter is on the **closed** bar because he's what decides whether a scheduled game is worth opening, and the row is expandable on a probable of *known hand* rather than on any probable at all: without one there is no half to mark, and the man named for the game is the row's whole reason to open. (That clause used to close on a second one — *naming him inside too was the same fact twice, the split's own head already saying which hand it's against* — which was true of the old one-hand card and is not true of the comparison that replaced it; see **The Upcoming dialog is the Splits card** below, where he is named in full at the head of it.) **Upcoming lists the games the player is actually in, not his team's** (`isUpcomingFor`): a watched player's club plays every day, but he doesn't. Someone off the active roster — hurt, suspended, optioned — is in none of them, so anything `rosterStatusBadge` puts a badge on (`isOnActiveRoster`) is dropped from the section; his completed at-bats still stand in Recent, since a range that reaches back before the IL stint holds real games he played. And a **starting pitcher is in one game in five** — `isRotationStarter` (a majority of his appearances are starts, so a reliever is never filtered) gates him on being the announced probable, which `pitchingRole === 'starting'` already reports. **An announcement is the only thing that puts him there**, and the rule that stood before it was the opposite: a side that had announced nobody yet (a TBD probable) hid no one, on the reasoning that an unannounced game might still be his. Four starters in five are not pitching, so what that actually did was put the whole rotation on the page and be right about one of them — Logan Webb sat in Upcoming every morning San Francisco had yet to name anybody, which is checked and was the complaint. The cost of the strict rule is that a genuinely undeclared starter appears when his club names him rather than before, which is also the first moment anyone could have known. That retired `PlayerGame.teamProbablePitcher` — his own side's probable, the mirror of `probablePitcher` — which existed for the TBD test and had no other reader in either workspace, so it is gone from both `types.ts` and from `rosterGame`. Nothing cached had to be re-versioned for its removal: a field nobody reads is a field nobody misses, and it was null in every day snapshot anyway (a snapshot is written only once every game is final). The Recent section pages: `PAGE_SIZE` (20) items, then a **Load more** button carrying the count still below it — a day of at-bats across a watchlist runs to hundreds, each mounting its own card. The count is a reading position rather than a view, so it is deliberately not in the URL — but it **is held by App** (`feedShown`, keyed exactly as the component is, kind + date range), which is what keeps switching kind or range resetting it to the first page while a 20s live poll, which only changes the data, leaves it where it was. What it no longer resets on is a **view** switch, and the reason is the scroll memory: the count decides how tall the page is, so a reader who had pressed Load more twice and gone to the board came back to twenty items and to an offset that page had no room for — measured, 57 items and 11,113px left at 6,668 came back to 20 items, 4,529px and **3,629**, which is 3,039px short and the one way the memory could be exactly right and still land wrong. Seeded from App and reported back to it on each press, so the rule that a remount re-reads it is untouched. Each at-bat shows its clip directly (`InlineVideoClip`, `preload="none"`, no Watch button). **The item is grouped by a rail in the outcome's color** (`.feed-at-bat`, `outcomeKind`) — header, card and clip inside one `.pa-card`-colored edge, the same rail device `.live-entry`, the base-event item, the pitcher's outing and the Upcoming row use, so all five of the feed's item shapes group themselves the one way.

  **None of those five shapes highlights under a finger any more.** The hover that lights an Upcoming row's border, an outing bar's border and an at-bat card's ground is scoped to `@media (hover: hover)`, because on a touch device `:hover` has no way to end — it sticks to the last card the finger crossed, so a scroll down the feed left one glowing and a tap that opened a dialog left it glowing after the dialog was dismissed. Reported against this section by name (*"the cards should not highlight when scrolling, e.g. on the feed upcoming games"*) and measured here: an Upcoming row's border came back `rgb(56, 189, 248)` after a tap-and-close against a resting `rgb(38, 54, 92)`, and now comes back `rgb(38, 54, 92)` with `matches(':hover')` still true. With a pointer every one of them lights exactly as before. The whole rule, the ten surfaces it reaches and the controls deliberately left alone are in **Client**, *A card doesn't highlight when you scroll past it*.

  **A pitcher's outing takes that rail in `decisionColor`'s color** (`.feed-outing`, set inline). It was the one shape without one, so the pitcher feed read as a list of loose blocks where the batter feed read as items. The color is the decision because that is already the pitcher side's answer to "what did this outing come to" — the same green/red/accent/amber as the credit chip sitting on the bar an inch away, the game line's accent on the card and the log's W/L/S/HLD chip, so a fifth definition here would be a fourth place for four colors to drift; hence inline off the shared function rather than a `.dec-*` class list restating them. `--muted` when there is no decision yet — a start in progress, an ordinary relief appearance — which groups the item without claiming anything about how it went. **On the mound the role rail wins outright**: a pitcher pinned to the Live section is a `.live-entry` and `.feed-outing` is only ever set when he isn't, so the two can't both apply, and "this is happening now" outranks a credit he hasn't got. The card keeps its box, unlike a base event's detail, because it *opens* and that is what a box means here; what it gives up in the feed alone is its own colored left edge, which would draw a second vertical line 11px inside the rail saying the same thing (`.feed-at-bat .pa-card`, which has to sit after `.pa-card.kind-*` to win the same-specificity tie). Where the card was the whole item — the Games view — it kept that edge, there being no header or clip outside it for a rail to gather; with that view gone the fold is the only case left. The Live section's at-bat is a different component and is unaffected: its rail is the *role*, and the card under it keeps the outcome edge, so the two colors never compete for one line. `BaseDiamond` renders runners on base. Base events are captured server-side per runner in `mlbStats.ts` (`StatsApiGame.baseEvents`); a run on the runner's own home run is omitted (the at-bat already shows it).

  **A base event reads as a plate appearance does** — the same player header, the same situation glyph, what happened, then the clip — because in this stream it is the same kind of thing: something that happened to the watched player, with video of it. It was a bare badge (`Bot 5 · Stole 2nd`) until now, which said when but never how, and was the one item in the feed you couldn't watch. `baseEventDetail` fills the rest, and **the clip is the interesting part**: a runner's movement names the play event it happened on (`runners[].details.playIndex`), and that event is where the id lives — as `playId` when a run scored on a batted ball, and as **`actionPlayId`** when the movement is its own action (a steal, a balk, a wild pitch). Both are the same kind of guid, so `/api/video` resolves either with no special case — checked against Savant, which has a clip for a steal, a balk and a batted ball alike. So a steal plays the steal, and a run plays the hit that drove him in. **The description is the action's own line where there is one** ("X steals (4) 2nd base.") rather than the play's result, which describes the batter's eventual outcome — "…strikes out swinging" for the at-bat a steal happened during, which is not what the item is about; a run scored on a batted ball has no line of its own ("In play, run(s)") and so takes the play's, which names both the man who drove him in and him scoring. **Nothing toggles**: the whole item is three short rows, where a caret would be hiding one of them.

  **The vocabulary is ten kinds, and it was read off the payload rather than guessed** (`BASE_EVENT_KINDS` in `mlbStats.ts`, `BaseEventKind` in both `types.ts`): stolen base, caught stealing, picked off, picked off *and* caught stealing, advanced on a pickoff throwing error, balk, wild pitch, passed ball, defensive indifference, and a run. Every runner row of **111 games (8,385 plays)** was inventoried to settle it, and the two things it leaves out are the interesting half of the measurement. **`error` is not a kind**: 58 of the 68 in that sample point at the *pitch* that was put in play — a runner taking an extra base on a throw during a batted ball, which the at-bat's own description already narrates in full — and the other 10 ride on a steal or wild pitch that is already its own item and whose line ends "…on a throwing error by catcher X". The error that genuinely stands alone is the **pickoff throw into the outfield**, and MLB gives that its own type, so it gets one (`poe`). **`other_out` likewise**: 44 of 45 are a runner thrown out advancing on a batted ball, and the 45th was a reviewed tag play — an eleventh badge for one event in forty games, saying what the at-bat beside it already says. A **disengagement violation** folds into `balk`, being a balk by rule (the runner is awarded the base identically), with MLB's own line under the badge saying which of the two it was.

  **Seven of the ten also land on the pitcher** (`PITCHER_BASE_EVENTS`), because they happened *between* him and the runner: the bag taken off him, the runner thrown out behind him, the man he picked off, the throw he sent into right field, his balk and his wild pitch. Three are deliberately absent. A **passed ball** is charged to the catcher. A **defensive indifference** is the defense declining to contest and belongs to nobody. And a **run** is on his line twice over already — the boxscore counts it and the innings section shows the play that scored it — where an item per run allowed would be four or five a start of pure repetition. The same `BaseEvent` object is filed under both parties (`StatsApiGame.baseEvents` by runner, `pitcherBaseEvents` by pitcher), so the two sides of a play cannot drift — but they are **read in different shapes**, since a pitcher's feed item is his outing rather than a play: the runner gets `FeedBaseEvent`, a stream item of its own, and the pitcher gets `InningBaseEvent`, a row inside the inning he threw it in.

  **The kind is read from `details.eventType`, and only the clip from whichever play event it turned out to be** — the two are not a clean split. 19 of the 36 caught stealings in that sample hang off the *pitch* the runner went on rather than off an action of their own, so a rule shaped as "a base event is a movement pointing at a non-pitch action" would have lost half of them.

  **Ten kinds are painted by four tones** (`baseEventTone` in `lib.ts`), because the distinction the eye wants off a feed is not which rule sent him down the line but what it did for him: `take` (he took the base — the live purple the on-base ring uses), `free` (he was handed it: a balk, a wild pitch, a passed ball, a pickoff throw away, the defense declining to contest — `--walk`, the color of a free base at the plate, which is exactly what this is on the paths), `out` (caught stealing, picked off — `--out`) and `run` (`--hit`). That is also what keeps the rail at eight CSS rules instead of a hundred: `--rail-a`/`--rail-b` and one gradient, where a second tone adds `rail2-*` and a single tone lets `--rail-b` resolve through `--rail-a` so the gradient paints one color and reads as a solid edge.

  **The situation is the at-bat card's, not a text line of its own.** `PlaySituation` (extracted from `PlateAppearanceCard` into `BaseDiamond.tsx`) is the half-inning triangle and number followed by the `BaseDiamond` — so a steal and the at-bat above it in the same stream state where they happened identically, where before one drew a diamond and the other spelled out `Bot 5 · 2 outs` in words. That means the server has to carry the bases **at the moment of the event**, which MLB does not publish: `matchup.postOn*` is the state a play *ended* in and a steal happens in the middle of one. `playBases` reconstructs it — the state the batter came up to, with every movement recorded before this one applied **per runner** (he leaves the first base he is listed as starting from and arrives at the last one he is listed as reaching). Per runner is load-bearing: MLB emits a man going first to third as two rows, and treating those as independent base changes leaves second occupied by someone standing on third. Checked against `postOn*` over those 8,385 plays: **6,389 of 6,414 exact**, the other 25 being the extra-innings automatic runner, whom MLB places with an action carrying no movement row — and who is already in the state the reconstruction starts from. The outs come off the play event's own count, which is the count *before* the play's outs were made. What the glyph can't draw stays as a line under the description: the count a steal went on, the man on the mound, and who was at the plate while he ran.

**Everything about where the runners were has now gone out of that line**, the glyph beside it drawing exactly that. The outs went first — a row saying "1 out" beside a picture of one out is saying it twice — and **`Scored from 3rd` follows them**: a run's own diamond is the state he scored out of, so the man on third in the picture *is* him. That had been a special case for a while, a run off a **steal of home** dropping the phrase because the badge beside it already said where he was standing; a special case is what it should never have been, since the badge is one drawing of the situation and the diamond is the other, and every run has the second one. It leaves a run's item with no meta line at all — a description, a picture and a clip — which is the whole of what a run is.

  **Both item shapes state the score after the play, and state it in the same place** — `FeedScore` at the right end of the identity row (`.feed-score`), reading `awayScore`/`homeScore` off the `BaseEvent` or (new) off the `PlateAppearance`. The header is the one row the two shapes genuinely share: an at-bat's own row is `PlateAppearanceCard`, which the Games view also rendered under a game block that already carried the score, and a base event's is a badge row.

  **Two events off one play are one item** (`groupBaseEvents`): a steal of home is a stolen base *and* a run, and the feed listed them twice — same line, same clip, one directly above the other — where it is one thing that happened. They are keyed on `playId`, the play event both were read off, with the timestamp standing in when a play has no clip id (every event of a play carries that play's `endTime`, which is why `playOrder` exists); an event with neither stays on its own rather than joining every other keyless one. Whatever moved him leads and the run follows, cause before effect, and each badge keeps its own tone — so the badge rules key off the **badge's** tone rather than the item's, while the rail splits at its middle in the same order. One badge per *kind*, and the meta line is merged and de-duplicated the same way, every event of one play naming the same battery and the same batter. Both of those were written for the pitcher's copy of a play as much as the runner's — one wild pitch that moves two runners is two events on his list — and only a runner's item survives to use them, his side of it being read inside his outing now; a runner's play is never two of the same kind, but a steal of home is genuinely two *kinds*, so the rule stands where it is. What went with the pitcher's item is the half of the naming rule that named the **runner** rather than the man on the mound, on the grounds that "off Luzardo" on a Luzardo item tells him nothing — and it is not really lost, being exactly what an inning row states when it names the runner and no pitcher at all. And because none of it opens, the grouping is a **rail rather than a box** (`.feed-base-item`): who it was, what happened and the clip of it are one thing to read, and they were three detached blocks — the name loose above a bordered panel, the video in a second box below. The rail runs the whole item, header to clip, the same device `.live-entry` uses and at the same width. It is deliberately not a card: a box in this feed means something you can open.


### `detailInline` is gone, and the popup with it — for a pitcher

**This reverses the section that stood here, and the reversal is worth reading
rather than deleting.** What it said was: *one caller of the outing item does not
open anything — the Game Log's per-game popup, where `PlayerDay` passes
`detailInline`, so the bar goes static (`.feed-item-toggle.static`) and the
innings read underneath; the alternative was to drop the inline innings and make
the popup a bar with a press on it, which would have been tidy — one shape
everywhere — and would have made the popup a **shim**, a dialog whose whole
content is a control opening a second box, on a row the reader has already
pressed once to get there.*

**It was right about the shim and wrong about which box to keep.** It took the
popup as given and asked what should be *in* it; asked the other way — what
should the row **open** — the answer is the page, and the popup is a shim
whichever way it is filled. For a pitcher it was a box holding one static bar
over a list of innings, in front of a page holding that same list under a tab
strip with the Line, the Opponent and the Arsenal beside it. A Game Log row and
an Overview game card now open the page directly; see **Client — the player
page**, *A pitcher's game opens the outing, not a box in front of it*, for the
whole of that argument and its measurements.

**So `detailInline` has no caller and is gone**, which is the rule this repo
already applies to `teamProbablePitcher` — *a field nobody reads is a field
nobody misses*. Three things went with it: `.feed-item-toggle.static`, which
nothing sets any more; the `Full breakdown` button, the door having become the
row; and `.outing-breakdown-btn`'s rules. Measured app-wide after, at both
widths: **0** `.feed-item-toggle.static` and **0** `.outing-breakdown-btn`.

**The feed's own item is untouched**, and is what it always was — a bar that
opens the page. Its ladder is unchanged: outing **46** → inning 47 → faced
batter 48, one press of Escape per rung, `#root` inert throughout. So is a
matchup team page's feed, where the same bar opens the page at **49** over
`.mup-view`'s 48, unwinding page → matchup on two presses.

### The Upcoming dialog is the Splits card, and it names the man in full

**A batter's Upcoming row opened onto `PlayerCard`'s `PlatoonSplit` — six stat
pills of his line against one hand — and now opens onto the player page's own
Splits card** (`components/PlatoonSplits.tsx`, `BatterSplitsTab`), the
diverging-bar comparison, with tonight's half marked. Three things changed on
that row and each is argued separately below: **what the dialog holds**, **where
the opposing starter's full name goes**, and **his headshot, which is the row's
only route to his player page**.

**What the old block could not do is grade itself.** `.750 vs LHP` is a fact and
not an answer: an .800 OPS against lefties is a platoon edge for one hitter and a
shortfall for another, and the row was asking the reader to hold his other half
in their head — which is exactly the sentence the Splits tab was written to
retire ("nobody comes here to learn a hitter's OPS against lefties, they come to
learn whether he is a **different hitter** against them"). A pill block that says
one number where the app has a component for the comparison is a second, weaker
drawing of the same fact.

**It needs no fetch, which is the half worth checking rather than assuming.**
`report.splitVsLeft` / `splitVsRight` are on every batter's `PlayerReport`
already, and they are **the very objects `/api/players/:id/splits` answers with**
— both come out of `mlbStats.ts::getPlayerStats`, so the card the player page
draws from the route and the card this row draws from the report are one
definition of one number rather than two that can drift. So there is no lazy
read, no `useDelayedFlag`, no `Reading …` line and no second source: the app's
loading discipline is about waits, and there is nothing here to wait for. (The
old `PlatoonSplit` read the same two fields — this is the same data drawn better,
not new data.)

**The dialog shows the whole comparison with tonight's half marked, rather than
that half alone**, and the reader is told which is which rather than being left
to infer it. The alternative — narrowing the card to one side — would have meant
gutting the component, since its whole device is a bar *between* two halves; a
one-sided "Splits card" is the pill block again with a rail drawn round it. And
narrowing hides the thing that makes the half readable: Guerrero's `.788 vs LHP`
only means something beside his `.657 vs RHP`.

So `SplitCard` takes an optional **`highlight`** (`'left' | 'right' | null`) with
a `highlightTitle`, and the marked column reads `vs LHP / 135 PA` in the accent
with the pitcher named in the head's tooltip (`Andrew Alvarez throws left-handed,
so this is the half that applies to this game.`).

**The marked column used to carry a third line saying `this game`, and it's
gone — the accent color and the tooltip were already the whole of the mark,
and the words were repeating what the color already says.** That line had a
real cost: it was reserved on **both** heads whenever it rendered at all,
hidden rather than blanked on the unmarked one (`.spl-head-mark--ghost`,
`visibility: hidden`), because the heads are one grid row on
`align-items: center` and a third line on one side alone would push its label
off the baseline its twin sits on. Reserving it meant laying out the *worst*
case rather than declaring a height — `this game` wraps to two lines in the
46px column a phone gives it — which is real machinery for four words nobody
needed spelled out: a reader who has just been told which pitcher is on the
mound doesn't need the accent-blue column told to them a second time in prose.
`highlightNote` is gone from `SplitCard`, `SplitHead` and `BatterSplitsTab`
along with it, and `.spl-head-mark`/`.spl-head-mark--ghost` are gone from the
stylesheet — the mark is `.spl-head-side--on`'s color alone now, which was
already carrying the fact and costing the head nothing to hold it.

**Measured on the same matchup, before → after, on the built client.** At 1200
the head goes **37.19px → 25.19px** and the card **401.19px → 389.19px** — a
flat 12px, one line of the reservation. At 390, where the old line wrapped to
two, the head goes **49.19px → 25.19px** and the card **407.19px → 383.19px** —
24px, both lines of it. The marked column is still unmistakable at either width:
`.spl-head-side--on` still carries the accent, and the tooltip still names the
pitcher and his hand.

**The player page's Splits tab names no half and is untouched**, the marker
being drawn only when a caller asks for one: measured on that tab before and
after, **0 marks**, heads **25.19px**, card **680 / 358**, row **34px**, rail
**434 / 173** — every figure that passage records, unmoved, `highlightTitle`
being the only prop this tab never passed.

**Bundle: 466.09 → 465.88 KB of JS** (138.60 → 138.54 gzipped) and **106.85 →
106.76 KB of CSS** (19.09 → 19.08 gzipped) — a net loss of both, for a prop, a
CSS ground rule and a paragraph removed.

**`.upcoming-detail .pct-card { width: 100% }` is one rule and it is a trap this
stylesheet already documents once.** `.pct-card` centers itself with
`margin: 0 auto`, which is right in the block flow of the player page — and **an
auto margin on the cross axis suppresses a flex item's stretch**, so inside
`.app-dialog-body`'s flex column the card shrank to its own content: measured at
1200 before the rule, a **246px** card in a 774px body, its `1fr` bar track
collapsed and **every fill 0px wide**. It is the same sentence `.details-chrome`
records for the head and tabs it took out of a flex row. With the rule the card
is **680 at 1200** (its own cap, still centered) and **328 at 390**.

**The container query the docs warn about is not in play here**, and that was
checked rather than assumed: `.spl-*` declares no `@container` at all — its
breakpoints are ordinary viewport media queries — so the failure `.pa-detail`
suffered when it moved into a dialog cannot arise. `.app-dialog-body` is still
`container-type: inline-size` and is measured as such.

#### The full name is in the dialog because the bar cannot hold it

**The closed bar keeps `vs LHP Gasser` and the dialog carries `Andrew Alvarez`**,
and the reason is a measurement rather than a preference. Forcing the full name
into the bar's `.game-prob-pitcher` on the live roster at **390**: four of five
rows are unchanged at 48px and **`vs LHP Andrew Alvarez` takes the bar 48 → 73px**
— a wrapped line on the row that has to hold the matchup and first pitch together.
At 1200 every row stays 48. So the surname stays where the summary table's
opponent cell already puts it, and the dialog — which is 800px at 1200 and 358 at
390 — takes the whole name, his hand and his club (`Andrew Alvarez` over
`LHP · starting for WSH`).

#### The headshot links to the opposing pitcher's own page

**`.upcoming-sp` is `FeedHeadshot` + `FeedPlayerName`, the feed's own identity
pieces**, rather than a third headshot circle: they are in this file, they are
the same 40px target with the same click behavior as every other name in the
stream, and a reader who presses one here gets what pressing one anywhere else
gives. The sub-line stacks under the name in `.feed-item-id`, the Live section's
own wrapper.

**It carries no lineup pip and no status code.** Those are `PhotoStatus`'s marks
and read off the league-wide `/api/statuses` map, which the feed does not fetch
(the roster views read each player's own report instead — see **The roster row
had one filter, `Starters`, and it is gone**), and both would only restate the
bar: his pip is `SP`,
and a man on the IL is not the announced starter.

**`ProbablePitcher` already carried an `id`** — `mlbStats.ts::probablePitcher`
has filled it from `gameData.probablePitchers` since it was written, and both
`types.ts` files already declare it — so **nothing was threaded and no cache
version moved**. That is the test `DAY_SNAPSHOT_VERSION` sets applied and
answered in the easiest direction: not "does this field ride in a blob" but "is
anything newly read back out of one", and the answer is that the field was
already there and already read (the summary table's opponent cell prints the same
object's `name`).

**And it is drawn wherever the row is, which was true of the markup and not of
the handler.** This block renders on every `UpcomingRow`, `grouped` or not —
`grouped` drops the row's *own* identity header and has never had anything to
say about the block naming the other side's starter. The **player page's
Overview tab** draws the same row through `PlayerDay`, and that was the one
caller of `PlayerDay` which never passed an `onOpenDetails`, so both links there
reached its `?? (() => {})` default and **did nothing at all**. See
**Client — the player page**, *The scheduled game's pitcher link opened nothing*,
for the measurement and the threading.

**A key the season roster cannot resolve opens nothing**, which is
`App.tsx::detailsPlayer`'s standing behavior — it resolves a `player=` key
against `reports` and then `getSeasonPlayers`, and renders `PlayerDetails` only
when one of them has it. Every `onOpenDetails` caller in the app shares that,
this one included; an announced major-league starter is on that list by
construction.

#### Measured

**Driven in a browser at 1200×900 and 390×844 against the live 2026 season**, on
a five-batter Upcoming section (Guerrero vs LHP Alvarez, Freeman vs LHP Gasser,
Rutschman vs RHP Chandler, Lowe vs RHP King, Walton vs RHP Rocker):

- **The closed bar is 48px on every row at both widths**, unchanged, and the page
  body overflows by **0** at both.
- **The dialog** is `800 × 532` at 1200 and `358 × 538` at 390, its body
  overflowing by 0, with the card at 680 / 328 and eight bar rows.
- **All four sample states draw as the Splits tab draws them**: solid (Guerrero
  135/389 PA, seven of eight bars pointing left), **hatched** (Lowe, 28 PA vs
  LHP — 8 of 8 fills hatched under `Only 28 PA vs LHP…`), **no bars** (Walton, 15
  PA — 0 fills under `…a handful of plate appearances is not a platoon split`),
  and the marked column in the accent in every one.
- **The Escape ladder is unchanged.** Feed → dialog → one press closes it, with
  `#root` inert while it is open and **0 `[inert]` left afterwards**. The card's
  own ⓘ opens its 320px panel inside the viewport at both widths and takes the
  **first** press, the dialog the second.
- **The headshot opens the pitcher** — `?player=pitcher-674841`, `.details-view`
  at `z-index: 50` over the dialog's 46, `<h1>` reading `Andrew Alvarez` — and
  Escape then closes the player page first and the dialog second, one thing per
  press. The name link does the same (`pitcher-688107`, Robert Gasser).
- **The pitcher's own Upcoming row is untouched**: bar 48px, dialog holding
  `OpponentSection` and **no** splits card and **no** `.upcoming-sp` block, page
  overflow 0.

**And its dialog has a second caller now**, which cost this row one line and
nothing else. The player page's **Projected Starts** block opens the same
`OpponentSection` off a `ProjectedStart` — no `PlayerGame` in sight — so that
component takes the three fields it reads rather than a game, and this call site
resolves its own hand (`hand={game.stand ?? report.throws ?? null}`) where the
table used to do it inside. `.start-detail` is folded onto `.upcoming-detail`'s
rule for the same reason: it is this box holding this same table, opened from a
row that names a start instead of a scheduled game. Re-measured on the live
season after the change: this dialog reads `Nolan McLean — NYM vs SD` over an
`SD` corner header, three rows, **`vs RHP`** accented and the five span pills,
with the page overflowing by 0. See **Client — the player page**, *A row opens
the lineup he faces*.

**Bundle: 464.53 → 464.54 KB of JS** (137.79 → 137.96 gzipped) and **106.76 →
107.01 KB of CSS** (19.06 → 19.11 gzipped) — 0.01KB and 0.25KB raw, and under
0.2KB over the wire between them, for a card that replaced a card, a marker, an
identity block and the paragraphs above restated where the rules are.

### The rail is 5px, and two of its grays were one gray

**Reported as: it is hard to tell some of the bars apart.** The rail is the
colored edge down the left of every feed item — the outcome of a plate
appearance, the tone of a base-running play, a pitcher's decision, the live role
of whoever is in a game — and it is the smallest colored thing in the app. Two
separate faults were behind the report and each was measured.

**It was 3px, which is too little ink for a color to be read off.** The tones
are not close: the four base-event ones (take, free, out, run) sat ΔE2000 14.5 to
25 apart depending on theme, which is a plain difference in a *patch* and a guess
in a three-pixel sliver. It is **5px** now (`--rail-w`), and the padding gives
back the two (`--rail-pad`, 9px), so **nothing moves**: the rail is a border and
the content starts at `border + padding`, which is 14px either way — measured on
every shape at 14px before and after, with 0 page overflow. The two numbers are
tokens because five shapes draw this rail and one of them being 3px while the
other four are 5 is worse than all five being 3.

**And `--faint` left the rail's vocabulary.** `kind-other` — an at-bat MLB filed
no event for at all — was drawn in `--faint` beside `kind-out`'s `--out`, and
those two are **ΔE2000 5.5** apart on three of the four themes: two grays nobody
can tell apart, for two meanings nobody can tell apart either. They are one gray
now, `--out`, which says "nothing came of it" once.

**Two palette values moved with it, and both are in `styles.css` beside the token
that changed.** Powder Blue's `--out` was a cool slate — the same hue family as
`--walk` — so the *out* and *free base* tones of a base-running item measured
14.5, the tightest pair of the four in any theme; off the blue axis it is 28.2.
Maroon's `--walk` went one step bluer, taking its distance from `--live-purple`
(the pair that can genuinely sit a row apart) from 17.4 to 20.2.

**After all four changes, every theme's base-event four is at least ΔE 20.2**
(Midnight 21.0, Lavender 23.5, Maroon 20.2, Powder Blue 23.2, against a worst of
14.5 before), and the whole seven-tone batter-feed set — the five outcomes, the
on-base purple and the default border — is at least **19.5**.

### What the feed lost with the grouping

The toggle, the `.group-toggle` button and its glyph, `FeedPlayerGroup`, `PlayerGroup`, the group-header classes (`.feed-groups`, `.feed-group*`) and — in App — `expandedKeys`, `toggleCollapsed`, `scrollToPlayer`, `backView`/`goBack` and the float **Back** button, `scrollPlaced`, and `positionFor`. `collapseAll` and `hasExpanded` answered for `feedOpenKeys` alone after that, the feed having one level of collapsible rather than two — and the three of them have since gone too, the feed having none at all (see **Details are popups, not accordions**).

**`positionFor` is the one loss worth stating rather than listing.** The ESPN-eligibility chip beside a name was the player *card's*, and moved onto the group header when the card became one; with the header gone, its remaining homes are the research board's `Pos` cell and the player page's own chip, which prints the list whole. That is the right shrinkage — the chip answers "where will my league let me start him", which is a question about a player, and both survivors are pages about players.

**The tab row got a phone width back.** Measured on the feed view with the same roster at 320 / 375 / 390 / 430 / 640 / 900 / 1200 / 1920, with the group toggle's 36px square put back as a clone to stand in for the old layout: **320 goes from three rows to two** (tab bar 132px → 84, chrome 261 → 213) and every other width is identical (2 / 2 / 2 / 1 / 1 / 1 / 1 rows), with no horizontal overflow anywhere. That is the honest size of it — the toggle was a square and a gap, and it only ever cost a line at the narrowest width the app draws.

**The player page's header carries one control per list** — a `Watch` star (`.details-watch-star`) and, beside it, either `Add to roster` or the `On roster` badge with its Remove. That is the plainest place in the app for the distinction to be made, since this page opens on anybody and "am I following this man, and in which sense" is the question it exists to settle. The star is outlined where Add is filled, on the reasoning the two deserve different weight: rostering a player changes every other view in the app, where watching him changes one board. It keeps its **word** where the board's star has none — this page has the room a table row does not, and "Watch" is a verb the glyph alone doesn't supply.

**The roster half of that pair is whichever roster the app is reporting on, and in fantasy mode it is not ours to change.** `isOnRoster` reads `rosterKeys` — the saved list, or the ESPN team while `rosterSource` says so — rather than the saved list directly, which is what makes the badge a statement about the roster actually on screen and what keeps it agreeing with the research board's baseball, that being the same key set. With the fantasy team in view (`rosterEditable={!usingFantasy}`) the badge therefore *stays* on a player who is on it, and the `Add to roster` button and the `RemoveButton` beside the badge both go: ESPN owns the list, and a control the list will not honor is the thing this app has decided twice already not to draw — the reorder screen is hidden in that mode for the same reason. **Nothing takes their place.** The star is the one list on this page the user can still act on, and it is untouched; a disabled button, or a line explaining where the roster came from, would be chrome saying "no" on every player page in the mode, on a page opened to read a season rather than to be told about a setting. The badge keeps the words `On roster` in both modes — the board's button is still `My Roster` and marks these same keys, so renaming it here would only invite a hunt for a difference that isn't there — and the *title* names which list it is. See **ESPN fantasy league** for the search's half of this: the header's `PlayerAdder` loses its ＋ and its dedupe in that mode and becomes what it also always was, a way of opening a player's page.

**In fantasy mode `rosterKeys` is `fantasyRoster.players` — your team as it *stands* — and deliberately not `fantasySlots.keys()`, which it used to be.** The slot chips are now anchored to the last day of the range in view (see **The slot chip and the order are the range end's, not today's** in **ESPN fantasy league**), so over `Yesterday` the slot map holds the catcher you dropped this morning and lacks the man you picked up in his place. Every reader of `rosterKeys` is asking a different question and it is a question about **now**: does this badge say I hold him, may I pick him up, does the board's baseball mark this row. Reading them off the chips would put a baseball on a free agent on a board drawn beside today's ownership map, and have one row of it contradict the next. Checked in a browser over `Yesterday` on the live league: the man dropped that morning gets no badge and the man who replaced him does — which is exactly what the same page did before any of this.

**The position chip beside his name is his ESPN eligibility, whole** — `2B/SS/OF`, `SP` and `RP` in one list, where the research board's cell prints the same list narrowed to the half its own board speaks. This is the one place in the app that prints **both** halves; the board prints one of them whole and the card chip caps that at two codes and a count, so the three are the same fact at three widths; without a league connected, or for a player ESPN can't be joined to, it is MLB's single listed position exactly as before. The prop follows `rosterPct`'s convention one step short of it: `undefined` (no league) and `null` (a league but no match) both fall back to the chip that was there, since a position is something the app can always answer where a rostered percentage isn't. **The chip is built once (`posChip`) because the page draws it twice** — under his name, and again in the head the expanded **Game Log** puts back when that table takes the page and covers this one. That second copy was MLB's listed position on its own, so the same man read `C` in one head and `C/1B/DH` in the other depending on which was on screen; one element, one rule, and the two cannot disagree. **The handedness token beside it follows both of those rules and departs from the first**, being three characters wherever it is drawn — see **Client — the player page**, *Which hand, on the heading*.

**And the padlock follows that chip on the same line, when somebody else in the league holds him.** It is the research board's own mark (`LockMark`, and see **ESPN fantasy league** for where the fact comes from), so a reader who has learned it on a board row recognizes it on the page that row opens — which is the whole reason it is one component with its title inside it rather than a glyph each caller wraps to taste. The baseball is the counter-example and the difference is worth naming: *its* wrappers genuinely differ (a bare mark on a board row, a badge carrying the words `On roster` with a Remove beside it here), where the lock is the same label in both places and is never a control.

**On the name line rather than out in the button cluster**, and that is the rule the `Rostered 72.2%` line under it already set: the cluster on the right is things you *do* to him, where this is a fact *about* him, like the position chip it follows. It is the **glyph alone**, where the `Watch` button two inches away keeps its word — that one is a verb naming what a press does, and this is a label whose words ("on another manager's team in your ESPN league") are longer than an `<h1>` can spare and are exactly what the tooltip and the screen-reader text already say. 15px here against 13 on a board row, matching the star beside it rather than the name column it came from.

**It is suppressed when he is on the roster in view**, the badge below being the answer then and the two otherwise being one question answered twice — and in fantasy mode that case cannot arise at all, the user's own team being excluded from the map upstream. Driven in a browser on the live league at 1200 and 390: **Jose Altuve** and **Juan Soto** carry the lock with the holding team named in the title and no `Add to roster` beside it (the page reading a fantasy roster, so the roster controls are gone anyway), **Adley Rutschman** — on the user's own team — carries the `On roster` badge and no lock, and **Jihwan Bae**, a free agent, carries neither. The `<h1>` is 28px in every one of those states at both widths, so the mark wraps nothing, and the page and the view both overflow by 0.

**And the newspaper follows that chip on the same line, when he has been in the news today or yesterday** (`NewsMark`, and see **Client — the research board** for the mark itself, its two tones and where the map behind it comes from). It is on the name line for the reason the lock beside it is: a fact *about* him, like the position chip it follows, where the cluster on the right is things you do to him.

**This is the page the mark points at**, which is what earns it a third draw site: the News tab is a few pixels below it, so on a player page the mark is a door-knocker rather than a summary. It is drawn **whether or not he is on the roster in view**, unlike the lock — having been in the news has nothing to do with whose he is — and it is the **glyph alone** at 15px, matching the star and the lock beside it rather than the 13 a table row gives them, with the day and the headline in the title (`Jose Altuve was in the news today — Swipes two bags in return`).

**Driven in a browser at 1200×900 and 390×844 against the live 2026 season.** A player with news today draws `rgb(248, 113, 113)` (`--strikeout`) and one with news yesterday `rgb(92, 111, 151)` (`--faint`); the `<h1>` is **28px at both widths in both states**, so the mark wraps nothing, and the page and the view each overflow by **0**. **Checked against the tab it points at**, six players deep: opening the News tab under each mark, a red mark sits over a newest row dated `Aug 15` and a gray one over `Aug 14` — **6 of 6 levels agree** — which is the browser half of the 16-of-16 the route itself was validated to. With `/api/news/recent` blocked the mark is absent and the page is otherwise untouched.

**The details view's portrait carries the same two marks** (`DetailsPhoto`, `.details-photo-wrap`) — the lineup pip on the corner, the status code on the bottom edge — scaled to the 64px portrait from the tables' row circle (37px when this was written, 42 since; the portrait deliberately did not follow it up — see **The tables breathe** above). This view is the one that most needed them and had them least: it opens from everywhere in the app and **on anybody, rostered or not**, so a user arrives here from a board row to decide something about a player he does not follow, and the two questions under every such decision — is he playing today, and is he hurt — were answered by every other view in the app and not by this one. It reads the same `usePlayerStatus` map the board does, for the same reason: `PlayerDetails` takes an id and a name, never a report.

**Those marks center their ink, not their line box**, and until now none of them did. Every code the app can print on a photograph — `IL10` `IL60` `RA` `DTD` `OUT` `DFA` `MIN` `SUS`, a batting number, `!`, `SP`, a reliever's entry inning — sat off center in its pill, and by a different amount in each of the three places it is drawn, which is exactly what "not *always* centered" was. `align-items: center` centers the **line box**, which is the font's ascent plus its descent; every one of these codes is caps and digits with **no descender at all**, so its ink runs from cap height down to the baseline and sits above the middle of the box it is centered in by `(ascent − descent − capHeight) / 2` — a number belonging to the font rather than to the design. Measured with a canvas against the rendered baseline: the digit pip in the summary table had 3.31px of air above it and 5.22 below inside a 15px circle (**0.95px high**), `SP` 3.47/5.60 (**1.06px**), the status code 1.75/3.40 in an 11px pill (**0.83px**) — while on the details portrait the pips were 0.18–0.53px high and its status pill was 0.63px **low**. The error did not even share a sign, so no single nudge could have answered it, and `padding-bottom: 0.05em` on `.lineup-spot` was that nudge: it moves the text up by half its own value, which took one font's pip from +0.33 to +0.11 and the other's from −0.68 to −0.90. It is gone.

**`text-box: trim-both cap alphabetic` trims the box to the cap-height box instead**, so what gets centered is the ink and the font's metrics stop deciding anything. It has to sit on the block container that holds the line and an anonymous flex item does not inherit it — measured, a flex or a grid container carrying the property lays out identically to one without it — so the badge becomes a plain block and `align-content: center` does the centring; `width: auto` still shrink-to-fits, every one of these being absolutely positioned. Every code, at the tables' circle and the details view's 64px portrait, now lands within **0.015px** of dead center, `!` alone at 0.09 (it is fractionally taller than cap height in this face). Re-measured after the row circle grew to 42px and its marks with it: the digit pip 0.01, `SP` and the status code 0.00. Behind `@supports`, because `align-content` on a block container *without* the trim would drop the text to the top of the pill; where neither is understood the badges center their line box exactly as they did before, which is a fraction of a pixel rather than a regression. **And it has to sit past the last rule it overrides** — `@supports` adds no specificity, so written beside `.lineup-spot`, where it belongs by subject, it lost `display` to `.sum-photo-status`'s and `.details-photo-status`'s own `inline-flex` and centered the pips alone, both status pills measuring back at their old offsets. The same trap the narrow-screen block at the end of the file already documents; it now lives under `.sum-photo-status`, the last of the three.

**Half of the inconsistency was a typeface nobody chose.** `.sum-photo-wrap` and `.player-photo-link` are `<button>`s reset to draw as a bare headshot, and `font-family` is the half of that reset neither of them made: a `<button>` defaults to the UA's own face, so the pip and the status code on every row of the summary table and the research board rendered in **Arial** while the identical marks on the details portrait — whose wrapper is a `<span>` — rendered in the app's own. One mark, two typefaces, two sets of font metrics for one centring rule to answer for, which is why the old nudge could only ever be right for one of them. Both buttons now say `font-family: inherit`, which is also what makes the `font-family: inherit` the badges themselves already carried mean what it says. It costs the pill nothing: `IL60`, the widest code, goes from 24.7px to 28.1 inside a 37px circle and still clears either rim by 4.5px — and 32.3 inside the 42px circle it is drawn on now, clearing 4.8.

**The head and the tabs are pinned to the top of the overlay, as one box** (`.details-chrome`). It is `.app-chrome`'s argument one level down and it survives the descent intact: the two are one statement — *who is being read, and which reading of him* — and that is the last thing that should scroll away from under a page being read. Both halves were scrolling away, on a view whose shortest tab is 1,734px tall on a desktop and whose percentile card runs to 1,782 on a phone: the name the numbers belong to went first, and with it the only route to another tab or out of the view at all.

**Both halves or neither**, rather than pinning the strip and letting the identity go. The head is the tall one — a 64px portrait, a name, the Rostered line and the Savant link — so it was measured before it was pinned: the whole box is **139px on a desktop** and **193px at 390** (the head stacks into two rows under 640, its own media query putting the two controls on one line and the identity block under them) against an 844px phone viewport, which is **23%** of it. The page's own chrome takes 159px of that same screen and is accepted, so this is not the "too tall to pin" case and there is nothing for a condensed state to buy: a head that dropped its portrait or its Rostered line on scroll would be a second layout to keep true, saving 65px of a screen that can spare them. The Rostered line is worth less than it looks anyway — removing it costs the box **1px**, the head being portrait-bound.

**A window with no room for it stands it down**, on the page's own budget and for its own reason: `hooks.ts::budgetSticky` measures this head against the window it is in and unpins it past a third of it (`STICKY_BUDGET`, and *The chrome stood down on a landscape iPhone* in `client.md` is the case that put the ratio there in place of a viewport height). It is a closer call here than for the page's bar — this box never wraps to three rows — and the interesting thing is that the two now come out **differently**: measured at 844×390 and 932×430 this head is **165px, 42% and 38%**, so it still stands down on a phone held sideways where the app's own chrome, one row of 102, now stays pinned. One threshold across the app is still what this is; it is a threshold in the units the question is asked in, which is what lets one statement give two boxes two answers. **The Game Log stands it down too, explicitly**: that tab already makes the overlay a fixed-height flex column (`.gamelog-mode`) so the log's own header can stick, and a sticky box in an `overflow: hidden` column is held against its padding box — the same trap `.app.summary-mode .app-chrome` opts out of. Static there puts it back in flow, where it holds its place as a `flex: none` item exactly as the head and tabs used to. One thing got simpler on the way: those two were flex items centring themselves with `margin: 0 auto`, and an auto margin on the cross axis suppresses a flex item's stretch, so that rule carried a `width: 100%` to undo it; inside the chrome they are ordinary blocks again and the auto margins do what they were written to do.

**The view gave up its top padding for it**, which is the one thing that had to be got right rather than guessed. Sticky offsets resolve against the scrollport's **content** box, so `top: 0` on the first child of a box with 20px of padding is held 20px down — measured, the head stuck at y=20 with rows sliding up through the bare strip above it, and a negative top margin cannot help, the constraint being exactly what undoes it. So `.details-view` is `padding: 0 16px 64px` and the 20px moves onto the chrome, which is what makes `top: 0` mean the top; the two other pages riding on this class (`.tutorial-view`, `.espn-view`) already replaced that padding wholesale and carry it on their own heads, for the same reason. The negative side margins bleed the box to the overlay's 16px gutters while the head and tabs inside keep their 680px reading column, and **the hairline moved with it**: left on `.details-tabs` the rule stopped a third of the way across a desktop, where the box spans the window. It is still an inset shadow rather than a border — it paints on the padding box, under the descendants, so the active tab's 2px accent still covers it at that spot instead of being underlined by a second line a pixel below — which is exactly how `.tut-nav-wrap` carries the same rule for the how-to page's jump strip.

**It stacks under the game log's full-page box and over everything else** (`z-index: 5` against that box's 45, inside the overlay's own 50). Expanding the log therefore covers the head as it covers the rest, and **Escape still undoes one thing at a time** — checked both ways round with the log expanded inside the player page: the first press leaves full page with the player page intact, the second closes the player.

**Everything inside the overlay now clears the right bar.** `--scroll-offset` is redefined on `.details-view` off a `--details-chrome-h` the overlay carries, because the one on `:root` describes a *different* bar: `--chrome-h` is the page's own pinned chrome, which this box covers outright (41 against 50), so anything in here scrolled to the top of its scroller was clearing 115px of a bar nobody can see. Measured rather than declared, by `hooks.ts::useOverlayChromeOffset` — a sibling of `useStickyChromeOffset` with its three triggers for its three reasons, and it needs all three: the `ResizeObserver` catches the head changing shape (193 → 192 with the Rostered line gone, 279 with a name long enough to wrap), the per-render layout effect catches the tab swap that makes the box static, and the `resize` listener catches a short window unpinning it without changing its height by a pixel — checked, 279px tall and `0px` published, and back again on the way up. It publishes onto the overlay rather than the document root, which is what keeps the two answers apart: a custom property inherits, so the override reaches every descendant and stops at the edge of the view. **It has readers now**: the Overview tab's items are the feed's own, and every one of them carries `.feed-item`'s `scroll-margin-top: var(--scroll-offset)` — so opening an at-bat or an outing in here lands it below the pinned head rather than behind it, which is exactly the rule this was written for and, when it was written, held ahead of a reader rather than for one.

**Switching tab puts the view back at the top**, which is new with the pinning and is the research board's own rule arriving here for the same reason. The tabs used to be at the top of the page, so getting to one meant scrolling back up first and a reset came free with having to go there; reachable from anywhere, they can now be pressed from 1,700px down a percentile card, and what the next tab holds at that offset is somebody else's rows or nothing at all. A tab is a different reading of the player, not a place in one. Checked: 834 → 0.

Measured at 390 / 640 / 1200 and on a 844×390 short window, on a batter and a pitcher and across every tab (five then, six now that Overview leads them): the box pins at 0 and holds its height while the content scrolls under it (193 / 193 / 139), a probe carrying `scroll-margin-top: var(--scroll-offset)` resolves to **205 / 205 / 151px** — the box plus the app's 12px of breathing room — the short window scrolls it away with the offset back at 12, no width overflows the page or the view, and the Game Log keeps its own single scroller with the head and tabs holding their place above it.

**The how-to page** (`Tutorial.tsx`) is a fourth full-screen overlay, not a view: it rides on `.details-view` — the same fixed box, own scroller, `useLockBodyScroll`, Back-or-Escape — so only what differs from the player page is styled (`.tutorial-view`), and it sits at `z-index: 60` because a `?help=1` link can land on top of an already-open `PlayerDetails` and closing the guide should reveal it rather than the other way round. Ten chapters in one continuous read rather than tabs — a tutorial is gone through in order, and tabs would hide nine of them from someone who doesn't yet know what to look for — under a **sticky jump strip** that takes the `.details-tabs` shape (a scrolling strip over a rule) rather than the segmented pill, which would claim it filters the page; `useActiveChapter` tracks which chapter is under it with one `IntersectionObserver` rooted on the overlay, its band pulled down past the strip (`-56px`) and up off the bottom (`-75%`), and **leaves the highlight alone when no heading is in the band** — mid-chapter, that's still the chapter being read. Reached from the settings popover (`.help-btn`, folded into the `.sim-toggle` selector lists so the menu's two entries stay identical by construction) and from the empty state (`.empty-help`) — the one screen every new user lands on. Its `Demo` blocks are **replicas built from the app's own classes** (`.view-switch`, `.date-bar`, …), which work because those rules are written against the class rather than the element, so plain `<span>`s render identically; `.tut-demo-stage` turns pointer events off so a replica can't invite a tap that does nothing.

App holds **no expansion state at all** now. It held `feedOpenKeys` (string keys, never persisted) for the feed's at-bats, outings and Upcoming rows, cleared by a floating "Collapse all"; every one of those raises a dialog instead, so the open thing is one at a time and belongs to the item that opened it. (Two sets went before it — `expandedIds` and then `expandedKeys`, which opened the cards on the Games view and then the groups on the feed.) `hooks.ts::useScrollIntoViewOnExpand` stays for the collapsibles that remain — the game blocks on the two unrendered cards, the pitcher's inning blocks having become dialogs too — and still aligns to the top of the viewport (its `scroll-margin-top` clears the sticky nav). There is deliberately **no per-caller alignment**: an earlier `block: 'nearest'` option for the feed's innings made them the one thing in the app that moved differently from everything around them.

**Live polling:** while any *real* game is in progress (`status.state === 'live'`), `App.tsx` re-polls `/api/report` every 20s to track scores, bases, and the at-bat/on-deck/on-base highlights on the cards, summary table, and feed.

**Simulate mode** (`simulate.ts`, the `sim=1` URL param — its settings-menu toggle is hidden behind `App.tsx::SHOW_SIMULATE_TOGGLE`, currently `false`, since a demo overlay isn't something to hand a user a switch for; the app has no notion of an admin yet, so the flag is the placeholder for one) overlays a synthetic live day onto the fetched reports so the live-only UI can be demoed when nothing is on. It derives values from player ids (never `Math.random`) so the picture is stable across re-renders, never mutates the source reports, and does **not** drive polling. Everything rendered reads `displayReports`; raw `reports` still back polling and reordering. It covers **both kinds**: up to six batters take the live roles (one at bat — his last plate appearance rewound to in-progress — one on deck, the rest on base) and up to three pitchers take the mound, one per game, their live inning being the last one they actually worked so the card's `.inning-block.active` accent lands on a half that exists (a pitcher's half is the one the *opponent* bats in, the mirror of the batter case). Crucially it also simulates off **scheduled** games, not just games with at-bats or an outing already in them — `targetGame` prefers a game with material and falls back to any game not called off, since the day you reach for this toggle is the day nothing has started. Players who *have* played sort first, so the treatments that need material land on someone who has it; a pitcher taking the mound with no outing yet is a header-only Live row, which is what an announced reliever looks like anyway.


### What happens *during* the live at-bat stays in the Live section

The in-progress plate appearance has been kept out of the Recent stream since
`playerDayEntries` was written — `filter((pa) => pa.event)`, one line, and the
Live section shows it instead. **Its base events had no such test at all.** A
steal taken behind the batter who is still up, the wild pitch that moved the man
on second, the run that wild pitch scored: each one was read off the same
unfinished play and each one went straight into `entries`, which is Recent. So
the two halves of one play sat in two different sections — the at-bat under
`Live`, the steal a few hundred pixels below it under `Recent plays`, a heading
claiming a completeness the play did not have — and the item that was the most
current thing on the page was filed as the oldest kind of thing on it.

**MLB does not emit these as plays of their own, which is the first thing to get
right about them.** Every record in `liveData.plays.allPlays` is a plate
appearance: measured over the 26 finals of 2026-08-17 and 2026-08-18, **1,995
plays, every one of them `result.type === 'atBat'`**, with `result.eventType`
set and `about.isComplete` true on all 1,995 — the two agreeing on every single
play, which is why `result.eventType` alone is a sound test for "still being
played" and no second flag is needed. A pitching change, a mound visit, a
pickoff throw and a steal are **`playEvents` of the at-bat they interrupted**,
and MLB files them there whether they happened between two batters or in the
middle of one. Of the non-pitch events that landed after at least one pitch of
their own play in that sample — genuinely mid-at-bat, not merely at the top of
the next at-bat — there were **438 batter timeouts, 19 wild pitches, 18 steals,
12 game advisories, 11 mound visits, 6 caught stealing or pickoffs, 3 defensive
indifferences and one offensive substitution**, and **no pitching change at
all**: the three-batter minimum means a change between batters is where MLB
files it, at `afterPitch: 0` of the at-bat that follows, which is the case that
already worked and is not touched here.

So the fix is the same test in the same place, carried on one field.
`BaseEvent.midAtBat` is `!play.result?.eventType` read off the play the event
came from, set in `mlbStats.ts` beside the line that fills `actions` — literally
the same expression, so the live at-bat and the events that interrupted it
cannot come to disagree about which play is the live one.
`playerDayEntries` then splits on it: `entries` is everything else, and
`liveEvents` is a second list the Live section draws.

**It is its own item there, not a line folded into the live card**, and the
reason is ownership rather than taste. `PlateAppearance.actions` can be a line
under the card because those actions are the *batter's* play — MLB hands them
over inside his record. A base event is filed under the **runner**, and on a
roster those are two different people of whom usually only one is watched: fold
it into the card and it appears when the steal and the at-bat happen to belong
to two men you both roster, and vanishes otherwise. Worse, the runner can have
no live entry to fold into at all — caught stealing behind a live batter he is
out, and scoring on a wild pitch he is in the dugout, yet both things happened
ten seconds ago on the play being watched. Those sort last in the section
(`NO_ROLE`, below all four roles) on their own. And the shape `FeedBaseEvent`
already has is the shape the moment needs: the badge, the situation glyph, MLB's
own line and **the clip**, which an action line would have to give up — the clip
being, as the base-event section above says, the interesting part.

**It is drawn ungrouped**, keeping its identity row, even directly under that
player's own `On base` row. `grouped` is for a container that carries the name
itself — the player page's day, where it *is* passed, and where the row reads
`On base` then `Stole 3rd` with one headshot. The Live section is a flat list of
items with no such container, and the Recent stream below it already repeats the
name on every consecutive item by one player; a grouping device invented for
this one adjacency would be a sixth shape for a two-item run.

**Nothing needs a version bump, and the reason is the one `actions` gives.**
`FEED_CACHE_VERSION` stays at 8: `result.eventType` has been in `FEED_FIELDS`
from the start, leaf-matched, so every cached feed already carries what this is
computed from. `DAY_SNAPSHOT_VERSION` stays at 6: a snapshot is written only
once every game of the day is final, so no play in one can be in progress, every
event in one is `false`, and a blob written before the field existed reads back
`undefined` — which is that same `false`. The *meaning* of what is stored is
unchanged too, which is the other half of the bump test: a finished day
classified either way is the same finished day.

**Measured, on a real play rewound.** Game 824723 (2026-08-18), bottom of the
3rd, `atBatIndex` 30: Andruw Monasterio batting against Merrill Kelly, Caleb
Durbin steals 3rd after pitch 2 and scores on a wild pitch after pitch 5, and
the at-bat then ends in a field out on pitch 7. Planting that game's feed in the
server's cache with the play rewound to each of those three moments — the cache
is only ever *written* for a final, so a doctored one with `In Progress` on it is
read verbatim and never overwritten — drives all three states on demand:

- **Rewound to the steal.** Before: `Live` = Monasterio *At bat*, Durbin *On
  base*; `Recent plays` led with `Stole 3rd`. After: `Live` = Monasterio *At
  bat*, Durbin *On base*, Durbin *Stole 3rd*; `Recent plays` holds his completed
  single and nothing else.
- **Rewound past the wild pitch**, where Durbin has scored and so has no live
  role left. `Live` = Monasterio *At bat* (his card carrying both MLB lines as
  actions), Durbin *Stole 3rd*, Durbin *Wild Pitch · Run Scored* — the two-tone
  rail, in play order, cause before effect. `Recent plays` unchanged.
- **The real, finished play** as the control: no `Live` section at all, and all
  twelve items in `Recent plays` including the steal and the run in their right
  places — the fix costs the stream nothing once a play is over.

Bundle: JS 583.27 → 583.66 kB raw, 173.94 → 174.05 gzipped. CSS unchanged —
`.live-rows` is a flex column with a 16px gap and the item is the one the stream
already draws, so the section needed no rule of its own.

### The outings went below the plays

**The split shipped with the outings on top and that was the wrong half on
top.** The argument for `Above` is in *One stream of both kinds* — a start is
the day's larger fact, and it is what a reader with two pitchers came to check.
Both halves of that are true and neither is what the section costs. The plays
are what the feed is *opened* for and the only part of it that moves through the
evening; an outing is settled the moment it appears and never changes again. So
the order was putting the day's stillest items in front of its most current
ones, which is the same fault the Live section exists to avoid one level up.

**Measured at 900px on 2026-08-19, the roster's own day.** Before: `Recent
outings` at y=272 carrying 3 cards, `Recent plays` beginning at y=634. After:
`Recent plays` at y=272 with its first ten, `Recent outings` at y=5317. Three
outing cards is **362px** of settled pitching standing between the filter pills
and the day's first at-bat — under a laptop's fold but over a phone's, and the
whole of it above the fold on any screen.

**The pills now sit directly above the list they narrow**, which is what the
`feed-filters` comment always claimed and what the layout had stopped doing:
measured, pills at y=222 and `Recent plays` at y=272, **50px** apart, where they
were **412px** and a whole section of untouchable cards away from their first
effect. The claim in
*One stream of both kinds* — that the lens must not reach the outings — is
unchanged and still enforced on `type`: `All` gives **10 plays / 3 outings**, the
`HR` lens **3 / 3**, the `SB` lens **1 / 3**, the outings unmoved under all
three, exactly as before with the two numbers read the other way round.

**Nothing else in the section moved.** The order *within* each list is
untouched, both are still built off the same `allRecent` split on `type`, the
outings are still unpaged and the plays still page ten at a time. `newPlays`
still counts plays only, and the red button and its `Clear` still ride at the
head of the plays — which is now the head of the Recent block, so the news about
the day is the first thing under the pills rather than the first thing after
three pitching cards.

**The plays' empty state still names the pills and still points up at them.**
Emptied by a lens (2026-08-16, `SB`), `Recent plays` draws `No plays of that
kind today. Change it with the pills above — All is every play of the day.`
*above* the three outing cards, where before it was a sentence sandwiched under
them. The section keeps its own heading when a filter empties it for the reason
`filtered` already gives, and that gate is untouched.

**The Tutorial's sentence was a claim about this order** and moves with it: `On
the feed a pitcher's outings are their own section below the plays`. It sits two
lines under `Both show your whole roster — batters first, then pitchers`, which
the old order contradicted on the very next sentence and the new one does not.

Bundle: JS 600,915 → 600,915 bytes raw, 176,982 → 176,985 gzipped (+3 bytes, the
moved comment's words). CSS unchanged at 159,369 / 28,510 — the two sections
were already siblings under `.live-feed` with the same class, so the order is a
JSX one and no rule anywhere depends on which came first.

### The park, on every game preview

**Three doors open one preview** — the feed's Upcoming row, the Overview's
Projected Starts row and the Schedule tab's game row — and each of them now
draws `GamePark` above whatever the dialog opened on: for a batter the platoon
card, for a pitcher the opposing lineup.

**It goes above, not below.** The park is the one fact about a scheduled game
that is settled the moment the fixture is — the split under it is a season's
worth of one man and the lineup is the other club's, both of which are readings
of people — and it moves both: a platoon edge worth 40 points of wOBA is being
read inside a park worth nine of it either way.

**A strip rather than the sixteen-row card**, because of what is under it. This
box already holds a nine-cut opposing lineup or a whole platoon comparison, and
sixteen more bars would bury the thing the reader pressed for. The rest are a
reading of the park itself and live on its club's page, one press away.

**Six figures, the same six on every strip** — `wOBA · Runs · HR · H · BB · K` —
and there is no separate *park factor* among them, because **`wOBA` is one**.
That is what Savant's own board means by the name, and why that board carries no
plain `wOBA` column at all. Two labels over one number are not two facts, and a
pitcher's strip carrying both printed the same figure twice side by side with the
same tint, which reads as a bug.

**What differs between a batter's strip and a pitcher's is the cut, not the
columns.** A batter reads the ground from his own side of the plate — the whole
reason the board is fetched by hand — and a pitcher reads both hands together,
facing whichever nine the other club writes down. The hand chip in the head says
which, so the strip does not spend a column on it. Measured: Yankee Stadium is
`wOBA 97` to Aaron Judge under a `vs RHB` chip, and T-Mobile is `wOBA 94` to
Logan Gilbert under none.

**It spent one for two commits and no longer does.** A batter's carried the
overall wOBA *and* his own beside it (`102` and `97` at Yankee Stadium), which is
a real and interesting difference — and it cost a seventh column on the narrowest
surface in the app to say something the head already says in three characters.
The club's Park tab is where the two cuts can be read against each other
properly, on a switch and at full width.

**Hits, walks and strikeouts stopped being a pitcher's alone.** They were on a
pitcher's strip and off a batter's, on the reasoning that they are his night
rather than the hitter's. True of who *earns* them, false of who is *affected*
by them: a park that eats singles eats them for the man batting in it, and a
manager starting a hitter wants to know that quite as much as the pitcher does.
The split was a distinction about baseball imposed on a table that only reports
the park.

**Strikeouts are the one figure that runs the other way** — more of them is the
pitcher's gain where more of everything else is the hitter's — and they are drawn
like every other column anyway, because **the tint says how much of a thing
happens here, not who it is good for**. Red is *more than an average park* on
every figure and both surfaces. That is the rule the club page's bars already
follow (*the fill points at the index, not at who it favors*), and it is Savant's
own board, whose `SO` column colors 111 red and 87 blue exactly as its `HR`
column does. An earlier draft kept K off the strip on the grounds that one
inverted column made the hue mean two things; that was the wrong diagnosis — the
hue never meant *good*, it meant *more*.

**The column count is written inline** as `--pf-figs`, and the grid's own cap
scales with it: a fixed 420px would put six figures at 65px where four sit at
100. It survives the columns settling at six because the number is still the
thing that decides the width. Measured at 390px and 900px, both strips hold one
line with no overflow.

**Strikeouts came off the strip.** Every other figure runs the same way — more of
it is the hitter's night — and K ran the other way, so the one column that
inverted the whole strip's meaning sat on the surface with least room to explain
itself. It keeps its row on the club's page, where sixteen rows and a key can
carry the exception.

**Hot and cold, Savant's own way of drawing this board.** The strip has no rails
on it, so the figures carry both halves of the reading themselves: red above the
average park, blue below, and the strength of the tint is how far. A number's
distance from 100 is exactly the case `RULES.md` allows color for — *where a
scale genuinely is the reading* — and dropping K is what makes one hue mean one
thing. A reader arriving from Savant does not have to learn a second vocabulary.

**It saturates at half the rail's scale**, not the whole of it. The club page's
bars run to the most extreme park in the league, which is right for a *length*:
it makes a long bar rare and therefore worth something. A *tint* at that scale is
the opposite — almost every park lands in a pale middle and the strip reads as
colorless, which is not the reading Savant's table gives. Half-scale puts the
ordinary park at a visible tint and the extreme one at full strength.

**And the tint is capped at 70%, which is measured.** The two hues are mid-tone,
so a chip at full strength is too light for dark ink and too dark for light: at
100% the figure reads **3.34:1** in the dark theme, under the 4.5 a 15px
weight-800 number needs (not WCAG "large text", which starts at 18.66px bold).
Measured across five themes, the worst case runs 6.67 at 45%, 5.20 at 65%,
**4.87 at 70%** and 4.57 at 75% — so 75 passes by 0.07, one palette tweak from
failing, and 70 passes with margin everywhere. `frac` still runs the whole 0→1,
so the relative scale is untouched; only how dark its top gets is capped. The
alternative was Savant's own, white ink on a saturated chip, and it does not
survive six themes: the ink here is `--text`, already near-white in four of them.

A **chip** rather than colored ink, which is also what Savant does: ink tinted to
30% of a hue is a number gone pale, where a ground tinted to 30% is a number on a
pale ground.

**A hitter is shown his own side of the plate and a pitcher is shown both.** He
faces whichever nine the other club writes down, so the park he works in is the
park as it plays to everybody; a hitter stands on one side all night, and on the
2026 board that is worth **34 points of home-run index at Yankee Stadium**.

**A switch hitter is resolved off the very fact the dialog opened to show** —
the hand the announced (or projected) starter throws with, which decides the
side he will actually bat from. Verified in the running app: Adley Rutschman
(`bats: S`) against a left-handed starter draws the **vs RHB** cut. Unknown
handedness falls to both hands together rather than guessing a side, both hands
being a true reading of the park where the wrong side is not.

**It draws nothing rather than a wait.** Rule 1 of the loading system, and this
is the case it is for: the block is a garnish on a dialog whose content is
already up, so a park still being read shows nothing at all rather than a
spinner over somebody's platoon splits. It appears when it has something to say,
and a game whose venue this app was never told (`venueId: null`) never asks.

**One league-wide table behind all four surfaces**, held by `App` and shared
through `ParkFactorsContext` — the shape `PlayerStatusContext`,
`EligibilityContext`, `RecentNewsContext` and `HandednessContext` already have,
and for their reason: the readers are leaves, three and four components down
inside dialogs and one of them inside a `map` where a prop would have to be
threaded through the feed, the player group and the row. **Lazy**, on
`needSchedule`'s own idiom, so a session that opens no team page and previews no
game never pays for the request.

#### A row no longer needs an announced starter to be worth opening

**It used to, and the reason was sound at the time.** A batter's detail was the
platoon card *with one half marked*, so with nobody named there was no half to
mark and the dialog had nothing to say — `expandable` tested `spHand !== null`
and a row three days out was dead.

Two things are now true that were not. The **park is a fact about the fixture
rather than about either club's plans**, so it is knowable the moment the game
is scheduled and reads the same whoever ends up on the mound. And the platoon
comparison **reads perfectly well unmarked** — that is exactly what the player
page's own Splits tab draws, and `BatterSplitsTab` has always taken a null
`highlight` for it. So the test became *has this row anything to show*: his
split, or the park.

**What an unnamed starter costs is the mark, and the dialog says so where the
reader is** rather than by refusing to open — one line naming which of the two
it is short of (nobody named, or nobody named *or projected*), above an unmarked
comparison.

Measured on a 14-day schedule: **3 of Aaron Judge's 12 rows and 4 of Shohei
Ohtani's 12** had no starter named or projected and were static; all of them
open now. A quarter to a third of a fortnight.

**The test is `game.venueId`, not a park looked up in the table.** The table is
fetched lazily and would not have landed when `expandable` is first read, so a
row keyed on the *park* would turn pressable half a second after it drew — a
control changing under the finger, which is the fault `RULES.md` names under
*reserve the box, don't move the page*. The venue is on the game, so this is
settled at first paint. The one venue a season with no factor behind it still
has the split to show, which is what its dialog would have opened on anyway.

#### The venue's name is the door to its club's Park tab

A reader who has just been told the ground moves a night by nine points of wOBA
wants the other twelve indexes, and they are one press away — the same
relationship the Overview's `Stats →` has with the Stats tab, said with the name
instead of an arrow because the name is already the thing being read.

**It opens on `park` rather than on the club's Overview**, which is what makes
it an answer rather than a navigation. `openTeam` grew an optional tab for it
and `TeamDetails` takes `initialTab`; `App` keys the page on club-and-tab so a
door naming a tab gets a page that opens on it.

**A neutral site is not a door.** `ParkFactor.teamId` is null for the venues
nobody is at home in, so there is no club page to lead to and the name stays
plain text — the same null the venue join exists to produce.

**The dialog stays open under the club's page, and this reverses the paragraph
that stood here.** It read: *the dialog closes as the club's page opens —
`openTeam` puts away a player page on its own, so the two doors inside one are
covered for free; the feed's is not, the feed being a view rather than an
overlay, and without `GamePark`'s `onNavigate` the club's page opened underneath
a box the reader had to dismiss by hand.* The first half is right and is why the
callback was never needed inside the player page; the second half is the claim
that is not true, and the numbers say so. A dialog raised from a **view** is
`.app-dialog`'s own **`z-index: 46`** and the club's page is `.details-view`'s
**50**, so the page opens *over* the box, not under it. Measured with both up on
the Roster and on the Feed: `elementFromPoint` at the middle of the window
returns the **details view**, and `useInertBackground` marks the dialog `[inert]`
along with the chrome, the table and the float button. 51 is the layer that
would have sat over the page, and that is a dialog raised from *inside* the
player page — which unmounts with it.

**What the callback cost was the app's own rule that one press undoes exactly
one thing.** Shutting the box on the way *in* meant `Back` from the club's page
landed the reader two steps from where they pressed — reported as *going back
from the team page after clicking a link in the opponent preview exits both
views*. It is gone, and with it `GamePark`'s `onNavigate` prop, nobody passing it
any more.

**Driven at 1200 on all four hosts**, `?preset=Tomorrow` for a fixture with a
park to press:

| | preview | club's page | `Back` |
| --- | --- | --- | --- |
| Roster opponent cell | `app-dialog@46` | `details-view@50` over `app-dialog@46[inert]` | the dialog, live again |
| Feed Upcoming row | `app-dialog@46` | same | same |
| Player page → Schedule | `details-view@50` + `app-dialog@51` | the club alone, **no stray overlay** | back to *him* |
| Player page → a projected start | `details-view@50` + `app-dialog@51` | the club alone | back to *him* |

The two player-page rows are the case the old paragraph was really describing,
and they are unchanged: the dialog is inside that page's tree, so `openTeam`
putting the page away takes the box with it whatever this strip does.

**And the Escape ladder is one rung a press**, which is what the layering buys.
Stacked on the Roster: **5** `[inert]` marks, focus on the details view; one
press leaves `app-dialog@46` with **2** marks and focus back on
`.app-dialog-box`; a second leaves **0** marks and focus on the body; a third
does nothing.

**`TeamDoorContext` rather than a prop.** `App::openTeam` is what the app calls
*the one door in* — it puts away the player page, remembers him for the way back
and opens the club — and the strip that wants it is a leaf inside three dialogs
in four trees, one of them inside a `map` in the feed. Threaded as an optional
prop it would be six signatures and six chances for a call site to forget it,
and a forgotten one does not fail: it silently stops being a link on one surface
out of four. The tab union lives in `hooks.ts` (`TeamPageTab`) so the door can
name one without `hooks.ts` importing a component.

#### The man on the mound comes first, and every preview draws him

**Order: starter, park, then the reading.** The whole reason a scheduled game is
worth opening is *who is pitching*, and both the park and the split below are
read against him. He sat under the ballpark for a commit, which put a fact about
the ground above a fact about the game.

**A pitcher's preview draws him too**, where it used to draw only the opposing
lineup. He is that man's **counterpart** rather than somebody he faces — MLB's
`probablePitcher` on a pitcher's own game is the *opposing* announced starter —
and a manager deciding whether to start a pitcher wants to know who the other
club is running out quite as much as a hitter does. The sub-line says which
reading it is (`RHP · PHI's starter, his counterpart`), because `starting for
PHI` under a pitcher's dialog would otherwise be read as a man he steps in
against.

**The Schedule row's preview drew no starter at all until now**, and that was
the gap rather than a choice: it carried the *sentence* about a projected
starter without ever naming the man or offering a way through to him. It now
draws the same `StarterLine`, so a fixture opened from a Schedule row and the
same game opened from the feed show him identically — and the tier rides on the
line as one word (`· projected`) rather than as a second sentence, the paragraph
below being about what the tier does to the *reading* underneath.

**`OpposingStarter` gained a plain `name`.** The cell forms are `label`
(`RHP Alcantara`) and `full` (`Sandy Alcantara (RHP)`), and the starter line puts
the hand on its own row — so `full` would print it twice. Carried rather than
parsed back out of a string this file wrote, which is the reason `hand` is
carried too.

**`StarterLine`'s opener is optional and its absence draws him without links
rather than with dead ones.** The Overview mounts `UpcomingGames` from a context
whose own opener is optional, and a headshot that looks like a door and answers
nothing is worse than one that does not look like a door.

Verified in the running app. Batter, from a roster cell: `upcoming-sp` →
`pf-strip` → `pct-card`, with *Sandy Alcantara · RHP · starting for MIA* over
loanDepot park. Batter, from a Schedule row: the same order with *Ethan Pecko ·
RHP · starting for HOU · projected*. Pitcher, from a Schedule row: *Aaron Nola ·
RHP · PHI's starter, his counterpart* over T-Mobile Park and the PHI lineup.
