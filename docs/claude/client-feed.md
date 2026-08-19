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

### The batter feed narrows to kinds of play, and says when something is new

**On a full slate the stream is hundreds of items** — every plate appearance of
every batter on the roster, plus every bag any of them took — and the one thing
it could not do was answer *what actually happened today* without the reader
scrolling past every strikeout in between. It has a lens now, and a red button
that says how many plays have arrived since they last looked.

**Seven pills and one of them lit**: `All · HR · Hits · Runs · RBI · SB ·
Video`, in a row at the head of the stream. That reverses two decisions taken
when this shipped — that the kinds should be **independent switches** and that
they should live behind a disclosure **in the pinned tab row** — and both of the
old arguments are kept below, with what the reversal costs stated rather than
glossed.

**`New` was an eighth pill and is a mode of its own again**, reached from the red
button in the stream rather than from this row. The row is the **kind** axis and
nothing else now; see *New plays is a mode, not a pill* below, which is where the
one-lens rule and this one part company and why.

**`All` is a pill rather than the absence of one.** With switches, turning the
last one off is how the whole stream comes back; with one active at a time there
has to be something to press that means *no lens*. It leads the row and is the
state the feed opens in.

**The order is a box score's rather than the vocabulary's history**: the two ways
of reaching a base by hitting it, then the two halves of a run — `Runs` he
scored, `RBI` he drove in — then the base he took with no hit at all, and last
the one kind-pill that is not a kind of play but a fact about whether there is
film of it. `SB` reads after `RBI` for that reason rather than beside the hits,
where it sat only because it was added with them.

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
takes — that a home run is inside `Hits` and inside `RBI`, that `Runs` is him
crossing the plate where `RBI` is him driving somebody in — so every pill carries
the sentence as its `title`.

**`Hits` reads `outcomeKind` rather than a list of its own**, which is the same
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
excursion, which is `startersOnly`'s own rule — switching back to batters puts the
lens straight back in force.

**The five props are optional and the second caller passes none of them.** A
matchup team page draws this same component for a leaguemate's week
(`LeagueTeam.tsx`), and neither half of the feature belongs to it: the marker is a
fact about how far down *the reader's own* stream they have got, and that page's
control row already carries four groups. Checked: `?mup=…&mt=…&plays=hr&newplays=1`
draws that page's feed with **0** pills and no red button.

### Where the controls sit: both of them in the page now

**This section used to argue for the split and the split is gone.** What it said:
*the `Plays` disclosure is in the pinned tab row and the red button is in the
page, and that is not arbitrary — a control that decides which rows a view shows
lives with the tabs that select the view (`Starters`, the research board's whole
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

**The row scrolls sideways rather than wrapping** (`.feed-filters`), which is the
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

### Measured

**Every count checked against the raw API figures** for 2026-08-17 (43 plate
appearances and 8 base events across 14 batters — 6 home runs, 5 doubles, 7
singles, 1 steal, 5 runs, 9 plate appearances with an RBI, every play with a
`playId`), 51 items in the stream:

| pill | drawn | raw |
| --- | --- | --- |
| `HR` | **6** | 6 home runs |
| `Hits` | **18** | 6 HR + 5 2B + 7 1B |
| `Runs` | **5** | 5 runs scored |
| `RBI` | **9** | 9 plate appearances with an RBI |
| `SB` | **1** | 1 steal |
| `Video` | **51** | every item — which is the measurement that retired the
proxy it was drawn from; see *`Video` was selecting the whole stream* above |

Those were taken when the chips unioned, and the union's own two rows (`HR + SB`
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

**A pitcher's are not items of their own**, and the difference follows from what each stream's item *is*. A batter's item is one play, so the bag he took is a play like the at-bat above it; a pitcher's item is the whole outing, and his balk belongs *inside* it — in the inning he threw it, between the two batters it happened between, which is where `InningsList` puts it and where his card has always read it (see **Pitchers on the roster**). Drawn as a stream item as well it was the same event twice on one page: once in the fourth inning of the outing and again a few hundred pixels below it, timed by its own clock and so detached from the outing by whatever else happened in between. The rule this replaces — that his events were never *pinned* to the Live section but stayed in the stream where they happened, since pinning them would put a balk from the second inning back at the top of the page every time he came out to throw the seventh — is honored more literally now than it was then: a balk from the second sits in the second. Nothing is lost with the item, because the inning row gained what it carried: it **opens onto MLB's line for the play and the clip of it**, and it prints the count a steal went on where a batter's row prints his pitch count. An outing **opens into a full-screen page** — `OutingPage`, `Line · Innings · Opponent · Arsenal`, which is where the whole read lives now (see **Pitchers on the roster**, *All four sections are back, as a page*); every other openable shape in this feed is a dialog, since the feed swapped its accordions for popups (see **Details are popups, not accordions**), and the outing is the one that outgrew a box. It takes the same *shape* as the rest of them: a **static identity header** (headshot + name + matchup, both of them links) over a full-width **line bar** (`.feed-item-toggle`) that is the only control — the batter item's `PlateAppearanceCard` in the same slot. The two were one row until the links inside the tap target made a mistimed thumb navigate away instead of expanding; **don't put the headshot or name back inside the toggle** (the same rule the Upcoming row now follows). The bar carries the tags, the line summary and the game's `GameStatusBadge` (score + Final/inning + bases) so a closed item still says how it went and how the game stands — which is why the context line under his name is just the matchup, the badge already spelling out the live inning it used to. The live-role tag moved to the header, where a batter's already sits (`.feed-item-head .live-role`). Pressed, it opens the page, which leads on his **Line** where the outing is over and on his **Innings** while it is still being thrown — a result against a narrative, and the page opens on whichever the outing is (see **Pitchers on the roster**, *All four sections are back, as a page*). That tab holds `InningsList` **first inning first** — a bar per inning, each of which opens *that* inning as a feed of the batters he faced and the base events he was a party to, in play order (see **Pitchers on the roster**, *An inning is a popup*). Checked from this bar on the live 2026 season: a pitcher in the bottom of the 4th opens on `Innings` with four inning bars, and a finished outing on `Line`. **The sentence this replaces was `and nothing else`** — the dialog held the innings alone, on the reasoning that *the arsenal table belongs to the breakdown and the details view, not to the item, which is a stream entry rather than a full read on the outing*. That was an argument about the **item** applied to the **box it opens**, and the box then had to grow a `Full breakdown` button to reach the read anyway; pressing an outing is asking for the full read, so it lands on one. The innings used to be drawn `newestFirst` so the half he was throwing sat directly under his name the way the stream around it reads; that is gone, and the whole of the argument is in **Pitchers on the roster**. The bar has a 44px floor so it's a thumb-sized target, and `.feed-pitcher` is its own `container-type: inline-size` so that at ≤480px its contents spread across it (`space-between`) with the **player card's** 9em floor on the line, instead of bunching at the right end. Open state is a flag of the item's own, like an at-bat's, and there is no scroll-on-open at all: the stream does not move. **Each live row carries the situation** — a `BaseDiamond` between the name and the role tag, runners and outs off `game.status` (the state *now*, where an at-bat card's diamond is the state that at-bat began in), the same glyph the card and the summary table's live badge use. Without it the section named a player's role and said nothing about the game he was in: "on base" with no word on who else was, "at bat" with no outs. **And the live at-bat carries what has happened during it** (`PlateAppearance.actions`, MLB's own line for each) — a pitching change above all, since who is on the mound is the whole question when your man is up and the card's matchup line has already been overtaken by it; mound visits, pickoffs and substitutions ride along. The server picks them by a **denylist** (`QUIET_ACTIONS`) rather than an allowlist, so a kind MLB adds later shows up rather than vanishing — the safe direction when the job is to say what is going on — excluding only the four that mean nothing happened (batter timeout, step-off, pitching timeout, and `game_advisory`, which is MLB talking to itself). They are filled **only while the at-bat is in progress**, which is the one place they are read: a day snapshot is written once every game is final, so no at-bat in one can be in progress, and no stored day can be stale for want of a field it could never have held, which is the reason this needs no `DAY_SNAPSHOT_VERSION` bump. No `FEED_CACHE_VERSION` bump either: `eventType` and `description` were already in `FEED_FIELDS`, which is leaf-matched, so every cached feed already carries them. The Live section pins whoever is at bat / on deck / on base / on the mound; a pitcher pinned there renders the same outing item, so `livePinned` keeps the stream below from repeating it. **A pitcher stays there until he is taken out of the game**, not just while his half is being played. `liveRoleGame` reads `GameStatus.inGamePitcherIds` — the pitcher each side still has in the game, one per team — where it used to read `pitchingId`, which is `linescore.defense.pitcher` and so names only the side currently *fielding*. Half of every game, therefore, a starter in the middle of a start was nobody's `defense.pitcher`: he dropped out of the Live section the moment his own team came up to bat, reappeared an inning later, and did that all night. Checked against a live board: with the Mets batting in the top of the 6th, McLean — their starter, due back on the mound in ten minutes — was not in the section at all. The server takes the **last entry of each side's boxscore `pitchers[]`**, that array being who has taken the mound in order and so ending on the man who has not yet been replaced (`inGamePitchers` in `mlbStats.ts`); it is filled from warmup on, the same property `startingPitchers` leans on. Checked against nine live games at once: for whichever side was fielding it named exactly the pitcher `defense.pitcher` did, and for the other it named the one in the dugout. A pitcher who really *has* been replaced falls out for good, which is the half of the old behavior that was right. **`pitchingId` stays and keeps its meaning** — the card's `.inning-block.active` accent is a claim about the half being thrown *now*, which is a different question and would be a lie about a pitcher sitting in the dugout. Live-only by nature, so no `DAY_SNAPSHOT_VERSION` bump — a snapshot holds only finished games — and no `FEED_CACHE_VERSION` one either: `pitchers[]` is absent from the compact feed a *final* is cached as, and this is only ever computed for a live game, which is always read from the unfiltered feed. **Only the batter actually up gets an at-bat under him there** (`roleAtBat`): a runner on base has nothing in progress, only the *completed* at-bat that put him there — which the Recent section already carries in full, clip and all — so surfacing it again up top stated the same thing twice and pushed the players who are batting down the page. On base and on deck are therefore the header row alone, which is also what a pitcher with no outing yet looks like. Its rows follow the same rule as the rest of the feed: **the identity row carries no box.** `.live-entry`'s header used to take the panel gradient, a border, a role-colored left accent and a 12px radius — the exact chrome of the `.feed-item-toggle` bar and the at-bat card below it — so a static row of two links read as a collapsed card and invited a tap that did nothing (on deck worst of all, where there is nothing under it to open). The role now reads off the headshot ring (`.feed-photo-link.role-*`, which gained the missing `role-pitching` rule in the process — folded onto on-base's purple then, and split off onto `--mound-teal` since) and the tag, and a role-colored **rail** on `.live-entry` itself runs the whole entry — flagging the group as live without any one row of it posing as a control. A box in this feed means something you can open. **Upcoming** splits the same way, and is built the same way — a static `.upcoming-id` (headshot + name) over an `.upcoming-head` bar carrying the matchup, the SP chip, **the announced starter on the other side** (`vs LHP Boyd` — surname only, as in the summary table's opponent cell, so the bar still holds the matchup and first pitch on one phone line) and first pitch, which is the whole of the row's interactive surface: a batter's opens a dialog on the **platoon card** with that starter's half marked (see below), a pitcher's on the lineup waiting for him — the same `OpponentSection` his card carries, since the probable on the other side is his counterpart rather than someone he faces (and no caret on that row, per the rule above; a control that raises a box gets one no more than a control that unrolls one). **And the row is grouped by a rail, the last of the five shapes to take one** (`.upcoming-item`, which now takes `.feed-item`'s layout so that class is the rail and nothing else) — the same rail `.live-entry`, `.feed-at-bat`, `.feed-base-item` and `.feed-outing` carry. Without it the section read as a run of loose blocks: a name and a bar under it, two things on the page with nothing saying they were one, beside neighbors that group themselves. (It was three while the split unrolled underneath; that half is a dialog now and the rail still earns its keep on the two that are left.) The tone is **`--muted`**, which is what `.feed-outing` takes for an outing with no decision yet and for the same reason — every other rail in this feed is a color for something that happened, and nothing has happened here, so this one groups the item and claims no more than that. A plain border rather than the base event's gradient: that mechanism exists for a play that was two things at once, which nothing scheduled is. The bar gave up its own 4px accent left edge on the way, since under a rail it is a second vertical line 11px inside the first — the fold `.feed-at-bat .pa-card` already makes, and for the same reason. It keeps its box, because it opens and that is what a box means here, and its hover still lights the whole border. The starter is on the **closed** bar because he's what decides whether a scheduled game is worth opening, and the row is expandable on a probable of *known hand* rather than on any probable at all: without one there is no half to mark, and the man named for the game is the row's whole reason to open. (That clause used to close on a second one — *naming him inside too was the same fact twice, the split's own head already saying which hand it's against* — which was true of the old one-hand card and is not true of the comparison that replaced it; see **The Upcoming dialog is the Splits card** below, where he is named in full at the head of it.) **Upcoming lists the games the player is actually in, not his team's** (`isUpcomingFor`): a watched player's club plays every day, but he doesn't. Someone off the active roster — hurt, suspended, optioned — is in none of them, so anything `rosterStatusBadge` puts a badge on (`isOnActiveRoster`) is dropped from the section; his completed at-bats still stand in Recent, since a range that reaches back before the IL stint holds real games he played. And a **starting pitcher is in one game in five** — `isRotationStarter` (a majority of his appearances are starts, so a reliever is never filtered) gates him on being the announced probable, which `pitchingRole === 'starting'` already reports. **An announcement is the only thing that puts him there**, and the rule that stood before it was the opposite: a side that had announced nobody yet (a TBD probable) hid no one, on the reasoning that an unannounced game might still be his. Four starters in five are not pitching, so what that actually did was put the whole rotation on the page and be right about one of them — Logan Webb sat in Upcoming every morning San Francisco had yet to name anybody, which is checked and was the complaint. The cost of the strict rule is that a genuinely undeclared starter appears when his club names him rather than before, which is also the first moment anyone could have known. That retired `PlayerGame.teamProbablePitcher` — his own side's probable, the mirror of `probablePitcher` — which existed for the TBD test and had no other reader in either workspace, so it is gone from both `types.ts` and from `rosterGame`. Nothing cached had to be re-versioned for its removal: a field nobody reads is a field nobody misses, and it was null in every day snapshot anyway (a snapshot is written only once every game is final). The Recent section pages: `PAGE_SIZE` (20) items, then a **Load more** button carrying the count still below it — a day of at-bats across a watchlist runs to hundreds, each mounting its own card. The count is a reading position rather than a view, so it is deliberately not in the URL — but it **is held by App** (`feedShown`, keyed exactly as the component is, kind + date range), which is what keeps switching kind or range resetting it to the first page while a 20s live poll, which only changes the data, leaves it where it was. What it no longer resets on is a **view** switch, and the reason is the scroll memory: the count decides how tall the page is, so a reader who had pressed Load more twice and gone to the board came back to twenty items and to an offset that page had no room for — measured, 57 items and 11,113px left at 6,668 came back to 20 items, 4,529px and **3,629**, which is 3,039px short and the one way the memory could be exactly right and still land wrong. Seeded from App and reported back to it on each press, so the rule that a remount re-reads it is untouched. Each at-bat shows its clip directly (`InlineVideoClip`, `preload="none"`, no Watch button). **The item is grouped by a rail in the outcome's color** (`.feed-at-bat`, `outcomeKind`) — header, card and clip inside one `.pa-card`-colored edge, the same rail device `.live-entry`, the base-event item, the pitcher's outing and the Upcoming row use, so all five of the feed's item shapes group themselves the one way.

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
(the roster views read each player's own report instead — see **The roster row's
one filter is `Starters`**), and both would only restate the bar: his pip is `SP`,
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

**A short window stands it down**, on the page's own `max-height: 560px` threshold and for its own reason: a phone held sideways is about 390px tall, and 139px of chrome is 36% of it. That is a closer call than the 303-of-390 the page's bar reaches — this box never wraps to three rows — but the bargain is the same one and one threshold across the app beats two that nearly agree. **The Game Log stands it down too, explicitly**: that tab already makes the overlay a fixed-height flex column (`.gamelog-mode`) so the log's own header can stick, and a sticky box in an `overflow: hidden` column is held against its padding box — the same trap `.app.summary-mode .app-chrome` opts out of. Static there puts it back in flow, where it holds its place as a `flex: none` item exactly as the head and tabs used to. One thing got simpler on the way: those two were flex items centring themselves with `margin: 0 auto`, and an auto margin on the cross axis suppresses a flex item's stretch, so that rule carried a `width: 100%` to undo it; inside the chrome they are ordinary blocks again and the auto margins do what they were written to do.

**The view gave up its top padding for it**, which is the one thing that had to be got right rather than guessed. Sticky offsets resolve against the scrollport's **content** box, so `top: 0` on the first child of a box with 20px of padding is held 20px down — measured, the head stuck at y=20 with rows sliding up through the bare strip above it, and a negative top margin cannot help, the constraint being exactly what undoes it. So `.details-view` is `padding: 0 16px 64px` and the 20px moves onto the chrome, which is what makes `top: 0` mean the top; the two other pages riding on this class (`.tutorial-view`, `.espn-view`) already replaced that padding wholesale and carry it on their own heads, for the same reason. The negative side margins bleed the box to the overlay's 16px gutters while the head and tabs inside keep their 680px reading column, and **the hairline moved with it**: left on `.details-tabs` the rule stopped a third of the way across a desktop, where the box spans the window. It is still an inset shadow rather than a border — it paints on the padding box, under the descendants, so the active tab's 2px accent still covers it at that spot instead of being underlined by a second line a pixel below — which is exactly how `.tut-nav-wrap` carries the same rule for the how-to page's jump strip.

**It stacks under the game log's full-page box and over everything else** (`z-index: 5` against that box's 45, inside the overlay's own 50). Expanding the log therefore covers the head as it covers the rest, and **Escape still undoes one thing at a time** — checked both ways round with the log expanded inside the player page: the first press leaves full page with the player page intact, the second closes the player.

**Everything inside the overlay now clears the right bar.** `--scroll-offset` is redefined on `.details-view` off a `--details-chrome-h` the overlay carries, because the one on `:root` describes a *different* bar: `--chrome-h` is the page's own pinned chrome, which this box covers outright (41 against 50), so anything in here scrolled to the top of its scroller was clearing 115px of a bar nobody can see. Measured rather than declared, by `hooks.ts::useOverlayChromeOffset` — a sibling of `useStickyChromeOffset` with its three triggers for its three reasons, and it needs all three: the `ResizeObserver` catches the head changing shape (193 → 192 with the Rostered line gone, 279 with a name long enough to wrap), the per-render layout effect catches the tab swap that makes the box static, and the `resize` listener catches a short window unpinning it without changing its height by a pixel — checked, 279px tall and `0px` published, and back again on the way up. It publishes onto the overlay rather than the document root, which is what keeps the two answers apart: a custom property inherits, so the override reaches every descendant and stops at the edge of the view. **It has readers now**: the Overview tab's items are the feed's own, and every one of them carries `.feed-item`'s `scroll-margin-top: var(--scroll-offset)` — so opening an at-bat or an outing in here lands it below the pinned head rather than behind it, which is exactly the rule this was written for and, when it was written, held ahead of a reader rather than for one.

**Switching tab puts the view back at the top**, which is new with the pinning and is the research board's own rule arriving here for the same reason. The tabs used to be at the top of the page, so getting to one meant scrolling back up first and a reset came free with having to go there; reachable from anywhere, they can now be pressed from 1,700px down a percentile card, and what the next tab holds at that offset is somebody else's rows or nothing at all. A tab is a different reading of the player, not a place in one. Checked: 834 → 0.

Measured at 390 / 640 / 1200 and on a 844×390 short window, on a batter and a pitcher and across every tab (five then, six now that Overview leads them): the box pins at 0 and holds its height while the content scrolls under it (193 / 193 / 139), a probe carrying `scroll-margin-top: var(--scroll-offset)` resolves to **205 / 205 / 151px** — the box plus the app's 12px of breathing room — the short window scrolls it away with the offset back at 12, no width overflows the page or the view, and the Game Log keeps its own single scroller with the head and tabs holding their place above it.

**The how-to page** (`Tutorial.tsx`) is a fourth full-screen overlay, not a view: it rides on `.details-view` — the same fixed box, own scroller, `useLockBodyScroll`, Back-or-Escape — so only what differs from the player page is styled (`.tutorial-view`), and it sits at `z-index: 60` because a `?help=1` link can land on top of an already-open `PlayerDetails` and closing the guide should reveal it rather than the other way round. Ten chapters in one continuous read rather than tabs — a tutorial is gone through in order, and tabs would hide nine of them from someone who doesn't yet know what to look for — under a **sticky jump strip** that takes the `.details-tabs` shape (a scrolling strip over a rule) rather than the segmented pill, which would claim it filters the page; `useActiveChapter` tracks which chapter is under it with one `IntersectionObserver` rooted on the overlay, its band pulled down past the strip (`-56px`) and up off the bottom (`-75%`), and **leaves the highlight alone when no heading is in the band** — mid-chapter, that's still the chapter being read. Reached from the settings popover (`.help-btn`, folded into the `.sim-toggle` selector lists so the menu's two entries stay identical by construction) and from the empty state (`.empty-help`) — the one screen every new user lands on. Its `Demo` blocks are **replicas built from the app's own classes** (`.view-switch`, `.date-presets`, …), which work because those rules are written against the class rather than the element, so plain `<span>`s render identically; `.tut-demo-stage` turns pointer events off so a replica can't invite a tap that does nothing.

App holds **no expansion state at all** now. It held `feedOpenKeys` (string keys, never persisted) for the feed's at-bats, outings and Upcoming rows, cleared by a floating "Collapse all"; every one of those raises a dialog instead, so the open thing is one at a time and belongs to the item that opened it. (Two sets went before it — `expandedIds` and then `expandedKeys`, which opened the cards on the Games view and then the groups on the feed.) `hooks.ts::useScrollIntoViewOnExpand` stays for the collapsibles that remain — the game blocks on the two unrendered cards, the pitcher's inning blocks having become dialogs too — and still aligns to the top of the viewport (its `scroll-margin-top` clears the sticky nav). There is deliberately **no per-caller alignment**: an earlier `block: 'nearest'` option for the feed's innings made them the one thing in the app that moved differently from everything around them.

**Live polling:** while any *real* game is in progress (`status.state === 'live'`), `App.tsx` re-polls `/api/report` every 20s to track scores, bases, and the at-bat/on-deck/on-base highlights on the cards, summary table, and feed.

**Simulate mode** (`simulate.ts`, the `sim=1` URL param — its settings-menu toggle is hidden behind `App.tsx::SHOW_SIMULATE_TOGGLE`, currently `false`, since a demo overlay isn't something to hand a user a switch for; the app has no notion of an admin yet, so the flag is the placeholder for one) overlays a synthetic live day onto the fetched reports so the live-only UI can be demoed when nothing is on. It derives values from player ids (never `Math.random`) so the picture is stable across re-renders, never mutates the source reports, and does **not** drive polling. Everything rendered reads `displayReports`; raw `reports` still back polling and reordering. It covers **both kinds**: up to six batters take the live roles (one at bat — his last plate appearance rewound to in-progress — one on deck, the rest on base) and up to three pitchers take the mound, one per game, their live inning being the last one they actually worked so the card's `.inning-block.active` accent lands on a half that exists (a pitcher's half is the one the *opponent* bats in, the mirror of the batter case). Crucially it also simulates off **scheduled** games, not just games with at-bats or an outing already in them — `targetGame` prefers a game with material and falls back to any game not called off, since the day you reach for this toggle is the day nothing has started. Players who *have* played sort first, so the treatments that need material land on someone who has it; a pitcher taking the mound with no outing yet is a header-only Live row, which is what an announced reliever looks like anyway.
