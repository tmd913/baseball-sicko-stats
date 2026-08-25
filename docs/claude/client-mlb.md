# The MLB view

The one page in this app that is about **baseball** rather than about a roster
or a fantasy league: the day's games, where the thirty clubs stand, and the
biggest things that have happened. It is the fifth main tab, it is last, and it
is the only one of the five that needs nothing of the reader.

---

## Why it is a tab at all, and why it is last

The four tabs before it are all *the reader's*: his week (Overview), his players
(Roster), the players he might want (Research) and his fantasy league (Fantasy).
Each of them is gated on something he has done — a connected league, a
watchlist — and the app's answer to a reader who has done none of it was an
empty roster and a six-hundred-row research board.

The MLB view is the page that works on the first visit. It needs no watchlist,
no league and no connection, and its three tabs are the three questions anybody
opening a baseball app has. So it is drawn unconditionally, where Overview and
Fantasy are drawn only for a connected reader.

**Last, because the row runs from the page closest to the reader to the page
furthest from him.** That is the whole of the ordering rule and it is worth
writing down, because the obvious alternative — leading with it, the way a
sports site would — gets the app backwards: this is a fantasy tool, and the
page that answers *how is my week going* has to be the one a bare URL opens.

**And the League tab is called `Fantasy` now.** It was `League`, which was
unambiguous while there was one league in the app and stopped being so the
moment a tab appeared that is about *the* league. Two pills a thumb apart both
meaning "league" is the row failing at the one job it has. **`view=league` is
untouched** — a label is what a reader sees and a URL is a contract with every
link already shared.

---

## The three tabs

`MLB_TABS` in `MlbView.tsx`, drawn in the app's `.view-tools` row rather than on
the page, exactly as the Fantasy page's own three are and for the same reason:
the row is already the app's answer to *which page, then which reading of it*,
and a second strip of tabs an inch under the first reads as a different kind of
control rather than as one tier down of the same one. `.lg-tabs` and
`.lg-tabs-line` are folded on rather than copied — the two strips are the same
object.

**No `ScrollRow` and no overflow arrows on this strip**, unlike the Fantasy
page's: three short words (`Scoreboard · Standings · News`) measure 255px and
fit a 320px phone, where that page's three do not.

Which tab is open is `mlb=` in the URL, `scoreboard` being the default and
omitted.

---

## Scoreboard

Every game on one ET day, each card a door into that game's own page
(`GamePage`, through `openGame` — the same one door the roster's opponent cell
and a club's fixture rows use).

### The bar is a day, not a range

The app's date control is a range everywhere else, because everywhere else is a
stat line summed over days. A scoreboard is not: a game is played on a date, and
two days of games in one list would have to repeat the date on every card to
stay readable.

So the bar carries `start === end`, and:

- **`DateCalendar` is in `single` mode** — one press picks one day. That is a
  prop on the shared calendar rather than a second calendar, which is the
  stylesheet's *fold, don't restyle* rule applied to a component: the grid, the
  month head, the ceiling and the re-centering are the same control, and the
  only thing that differs is whether the first press is an anchor or the answer.
- **The presets are the app's own three single-day rules**, filtered out of
  `datePresets` (`Today`, `Tomorrow`, `Yesterday`) rather than written again.
  The two ranges in that list are spans this board cannot draw.
- **The reading is `label`, not `dates`.** `dates` derives its lines from the
  range and calls a hand-picked one `Custom range`, which is true of five days
  in a stat table and false of one day's games. The lead is the rule where the
  day came from one and `Chosen day` where the reader picked it, and the range
  line is `wideRange`'s single-day form — character-for-character what
  `dateBarFace` would have produced.
- `stepRange` and `stepTitle` are the roster bar's own, so the arrows step one
  day and call themselves `Previous day` for free.

`mday=` carries the rule's **label** where there is one and the date otherwise,
which is the same two-halves split `preset=`/`start=`/`end=` makes for the
roster's range: a link made on `Today` opens on the recipient's today.

### The card

Status pill, both clubs with records and score (home second, the way a line
score is written), and one line under them that changes with the state. The
whole card is a `<button>`.

- **The status pill leads** because on a scoreboard the first question is *is
  this over*: `Final`, a live half-inning (`Top 6`), or the first pitch.
  `.lg-state` / `.lg-state-live` are folded on — the live one is the only state
  that is a *reading* rather than a label, which is why it is the only one that
  takes a color.
- **A dash rather than a zero before first pitch.** A game nobody has played has
  no score, and `0` on a card that also says `7:05 PM` reads as a result.
- **The winner is told by weight and tone, not by hue.** The losing side stays
  at `--muted` — where both sides start, so a game in progress favors neither —
  and the winner comes forward to `--text`. A green-and-red scoreboard would be
  two more hues meaning "the same fact you can already read off the two
  numbers".
- **The probables go the moment the game starts**, and the decisions arrive only
  when it is final. MLB sends `probablePitcher` right through a game and fills
  `decisions` as soon as a winner is determinable; both would be a promise about
  a fact, and the box score is one press away.
- **No line score and no box.** Both are on the game's own page. Nine columns of
  runs across fifteen cards is that page at a resolution nobody can read.

`.mlb-games` is `repeat(auto-fill, minmax(300px, 1fr))` — 300 being the
narrowest a card can be and hold a club's full name, its record and a two-digit
score on one line — collapsing to one column below 430.

---

## Standings

One board, two controls, three groupings and five spans.

### The three groupings are three questions

**Division** (six tables), **Wild Card** (the clubs not leading one, per league,
with the cut line after the third) and **League** (all fifteen). They are a
*grouping* rather than three pages because the rows are the same rows: the
server sends every club once with the wild-card order beside it, so crossing
between them is a re-grouping and not a fetch — the same economy the research
board's position pills make.

The wild-card order is on the wire because it is **not derivable from the rows**:
that board excludes division leaders and is ranked by a tiebreaker order MLB
owns. `WILD_CARDS` is 3 and is a constant rather than a count of who is above
`+0.0`, or the line would move with the standings instead of being the thing
they are read against.

### The spans are the research board's own five

`season`, 7, 15, 30, 60 — `RESEARCH_WINDOWS`, deliberately, because that is what
*the last 15 days* already means in this app. A vocabulary of its own here would
be a reader asking two boards the same question and getting two answers.

**What a window cannot have, it does not draw.** Games behind and the streak are
computed over the window and mean what they say; the wild-card race, the last ten
games, one-run games, the Pythagorean record and the magic number are facts
about a *season*, so on a window those columns are not in the table at all
rather than drawn as dashes or carried over. That is `BoardProjection`'s rule: a
season figure and a seven-day figure on one line would be two arithmetics on one
row. A window adds `GP`, which is the one column that says whether a `.667` off
three games means anything.

On a window the wild-card grouping keeps its rows and loses its line, with a
sentence saying why — a line across seven days would claim three clubs are in,
off seven days of baseball.

### The controls live in the tab, and collapse to dropdowns

Not in the app's tools row, which is the Fantasy page's own decision read one
view over: a control above the strip is a control over the *page*, and these two
govern one third of it.

**Below 700 each run becomes a `<select>`**, which is the app's answer for every
strip of pills that outgrows a narrow screen — the research board's window tabs
and position row, the Schedule span, the Rankings spans, the matchup picker —
and `.mlb-standings-select` is folded onto `.research-window-select` so all of
them are one control by construction. Both are rendered and the stylesheet
chooses, rather than a JS media test that could drift from the CSS.

**700 is measured rather than borrowed, and this is the one row in the app that
cannot take its 640.** It holds *two* runs on one line — the grouping at 243px
and the spans at 358 with 12px between, **613px** — so with the app's 22px
gutters it needs a **657px** window, and at 640 the two would break to two lines
for the seventeen pixels before the dropdowns arrived. A row that is briefly two
lines on the way to being one control is the fault the swap exists to prevent.
700 leaves room for a sixth span without this being re-measured.

Measured after: the row is **36px at 320, 390, 640, 700, 701, 760, 900 and
1280**, one line at every one of them, and the page body never scrolls sideways.
Before any of it, at 390 the row was **96px** — the span run broke to a second
line and `Last 60` then wrapped inside its own pill, taking every span pill from
25px to 40. The pills keep `nowrap` so that second half cannot come back at a
width where the runs are still drawn.

**It was a `ScrollRow` for a day, and that was the wrong shape.** A scroller is
right where the run is long and its members are peers a reader browses — the
roster's five readings, a player page's nine tabs. These two are short, closed
sets where the reader is picking one value, which is what a `<select>` is; and
side-scrolling hides a filter behind a gesture on the one device where the
reader cannot see there is more of it without trying.

### The table

`.glog-table`'s selector lists with one more name in each — a wide stat table
with a sticky first column, read across rather than picked, is an object this
stylesheet already has. Three things are its own, and each is a measurement:

- **A narrower `--row-gutter`** (`clamp(4px, 1vw, 13px)` against the log's
  `clamp(5px, 1.9vw, 28px)`). Sixteen columns, five of them a `43-23` pair: at
  1280 the table is 1396px in a 1280 scrollport with the inherited clamp and
  **1280 with this one**.
- **A `min-width` on the club cell.** `.glog-date` is `width: 1%` and a flex
  child with `overflow: hidden` has a minimum content width of zero, so the two
  together collapsed the column onto the crest and drew thirty rows with **no
  club name on them** (measured: cell 48.6px, name 0px). The cap is 206 —
  `Arizona Diamondbacks` at 148px, the widest of the thirty, plus the crest, its
  gap and two gutters.
- **The abbreviation below 900px**, both rendered and one chosen by the
  stylesheet. Measured by taking each club's rendered prefix across widths: at
  900 and up no two collide; at 800 both Los Angeleses read `Los Angele…`; at
  700 three pairs collide. A row that cannot say which of two clubs it is about
  is worse than one that says `NYY`. The column's floor drops to 74px with it,
  which is stat columns that no longer have to be scrolled to.

**The pinned edge is measured, not declared.** `--pin-edge` says *the table goes
on under this column*, and this is the first board that sometimes fits — drawn
unconditionally it was a vertical bar down the middle of six tables marking an
edge nothing was moving past. Whether a table fits depends on how wide
`Arizona Diamondbacks` renders in a font this app does not choose, so
`StandingsTable` measures its own scroller with `useOverflowArrows` (the app's
one implementation of that measurement) and puts `is-pinned` on the table. Off
by default, which is the safe direction.

**The cut line is a border on the row above it**, not a row of its own: a `<tr>`
with a `<td colspan>` would be a row in the accessibility tree saying nothing,
and it would take the zebra stripe.

Every row is a door into the club's page.

---

## News

The league's **ten biggest stories**, not its feed.

It is `NewsList` — the player page's own list — with one slot filled: `owner`,
which draws who the row is about. That is the only thing a league feed needs and
a player page cannot want, his name there being the page it is on. Two lists
that merely resemble each other are two lists that will one day disagree about
what a row is.

**It was the whole feed.** 973 items over seven days (measured) is not news but
an inbox — most of it a desk noting that a man went 2-for-4 — so the ranking
went in, on the server, where the corpus is. The payload went from **354KB to
3.6KB** with it, and the filter pills and the `Show more` went with the feed: a
source filter over ten rows narrows ten rows.

How a story's size is decided — the kind-of-event table, the graded recency, the
chatter proxy, one story per player, and the prominence signal that is
deliberately not modeled — is in `server/src/recentNews.ts`, beside the sweep it
reads.

**The name is a door only where there is something behind it.** A row's player
is an exact MLB id, but the player page needs the season roster to know whether
he is a batter or a pitcher, so a man it cannot place is a name and not a press.

The list is centered at the reading column with `width: 100%` beside the auto
margin — the recorded trap that an auto margin on the cross axis suppresses a
flex item's stretch.

---

## State

Four params, all in the URL because all four decide what data is on screen:

| param | what | default (omitted) |
| --- | --- | --- |
| `mlb` | which tab | `scoreboard` |
| `mday` | the Scoreboard's day, as a rule or a date | `Today` |
| `mspan` | the Standings' span | `season` |
| `mgrp` | the Standings' grouping | `division` |

The last two are scoped to the Standings tab rather than to the view: a span
with no standings to be about would name a reading that is not in force, the
rule `cut=`, `mt=` and `mr=` all follow.

**The `m` prefix is not `mp`/`mup`/`mt`/`mr`**, which are the fantasy matchup's.
Two params must never mean two things — a link is read before anything on screen
can say which view wrote it.

## The reads

One per tab, each read on its first open and kept — the rule the Fantasy page's
three and the player page's nine follow. What differs is what can change
afterwards, and only one of the three can:

- the **Scoreboard** re-reads when the day changes, and polls on `LIVE_POLL_MS`
  while the board holds a game being played or still to start. Gated on the tab
  as well as the view, unlike the league poll: nothing off this page draws a
  mark from this board;
- the **Standings** re-read when the span changes — the grouping costs no fetch;
- the **News** is read once. It is a thirty-minute sweep on the server, so a
  poll would be the same answer at a cost.

Both the board and the standings **sequence-check their own answers**: the board
against the day the reader is on (a ref, so the loader is not rebuilt every time
the date moves) and the standings against the span. Two presses of an arrow are
two reads in flight.

## Related

`sicko-server` for the three routes and the two modules behind them
(`mlbScoreboard.ts`, `mlbStandings.ts`, and `recentNews.ts`'s second reader).
`sicko-game-page` for the page a card opens, `sicko-team-page` for the page a
standings row opens, `sicko-client` for the date bar and the loading rules,
`sicko-player-page` for `NewsList` itself.
