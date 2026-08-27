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
no league and no connection, and its tabs are the questions anybody opening a
baseball app has. (There were three and there are two — see *News, and why there
is no longer one*.) So it is drawn unconditionally, where Overview and
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

## The two tabs

`MLB_TABS` in `MlbView.tsx`, drawn in the app's `.view-tools` row rather than on
the page, exactly as the Fantasy page's own three are and for the same reason:
the row is already the app's answer to *which page, then which reading of it*,
and a second strip of tabs an inch under the first reads as a different kind of
control rather than as one tier down of the same one. `.lg-tabs` and
`.lg-tabs-line` are folded on rather than copied — the two strips are the same
object.

**No `ScrollRow` and no overflow arrows on this strip**, unlike the Fantasy
page's: three short words (`Scoreboard · Standings · News`) measured 255px and
fit a 320px phone, where that page's three do not. At two they fit with room to
spare, so nothing about the strip changed when the third went.

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

**The bar runs the full width of the window**, through the app's own 22px
gutters — `--bar-bleed`, folded onto `.app > .date-bar`'s list, which is where
every other bar in the app takes it. It was left out and stopped 22px short of
each edge while the cards under it ran the full width: the one row on the page
that did not reach, which reads as a control floating in a margin rather than as
the band the page hangs from. The cards keep the gutters, which is the
convention — the bar bleeds, the content does not.

**The bar is sticky**, at `top: var(--chrome-h)` under the pinned chrome —
folded onto `.league-view > .date-bar`'s own rule rather than given one that
agrees today, the two being the same band in the same arrangement one box
further down the tree. It is the League tab's argument at a different scale: the
day is the one statement of *which games these are*, and a reader scrolling a
grid of fifteen cards on a phone had it off the top of the screen by the third
row with no way to tell yesterday's board from today's without going back up.
Measured at 390: the bar sits at 159px unscrolled and holds at **99px** — the
chrome's own measured bottom — after scrolling 900px down.

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

### A live card says who is in the middle of it

Two things a card being *watched* is being watched for, and it had neither: who
is pitching to whom, and who is on base. The slot the probables leave at first
pitch stayed empty for the whole of a game — so on a fifteen-game Tuesday the
nine finals each carried a decisions line and the six live cards carried
nothing, holding the height the grid stretched them to with the one register
that changes by the pitch blank. `2 out` in the head was the whole of what the
board said about a game in progress.

- **The foot carries `P {pitcher} vs AB {batter}`** and takes the probables'
  own slot, which is the whole argument for putting it there: that slot already
  means *the pitching matchup on this card*, and before first pitch the two
  announced starters are what it is. Once somebody is on the mound, the man
  there and the man facing him are the same fact **measured** rather than
  promised — the card's own reason for dropping the probables, answered instead
  of merely obeyed. `P` and `AB` are the vocabulary the final line already
  reads in (`W`, `L`, `S`): a role, then who. Two bare names either side of a
  `vs` would read as the two clubs' starters, which is exactly what the line
  means one state earlier and no longer means here.
- **`DUE` between halves.** MLB swaps its `offense` and `defense` blocks on the
  third out, so a board on `Middle 6` carries the *bottom's* pitcher and its
  leadoff man — a true and useful pair that nobody is yet batting against.
  `Top`/`Bottom` is the half being played; anything else is the gap, and the
  mark says so rather than claiming an at-bat.
- **The situation is drawn, not said.** `2 out` in words was half of what a live
  card is watched for, and the half the next pitch already implies. It is
  `BaseDiamond` now — the feed's own glyph, runners filled and outs as two dots
  — which says the count and who is on it in one mark. `.mlb-game-outs` went
  with the words.
- **Neither is a new read.** All three facts ride on the `linescore` hydration
  the half-inning already comes from. What they cost is recorded in
  `mlbScoreboard.ts`: 8,646 → 13,506 bytes on a finished day and 11,627 →
  18,790 on a live one, nearly all of it `fields=` being a **flat** name filter
  — `first`/`second`/`third` are the runners on one block and three infielders
  on the other, so asking for the bases asks for the whole defensive alignment.
  There is no per-path form to ask more narrowly.

**Measured, and the bundle**: JS **740,536 → 742,162** raw and **216,355 →
216,749** gzipped; CSS **190,883 → 191,885** and **34,022 → 34,179**. That
covers this change and the two beside it in the same commit — the at-bat
dialog's matchup head and the tab strip's cap.
- **Null on anything not being played**, and that gate is the `probablePitcher`
  fault read from the other end: MLB keeps sending a whole `offense`/`defense`
  block hours after a game is over, which on a `Final` card would draw a live
  matchup under a final score.

`.mlb-games` is `repeat(auto-fill, minmax(300px, 1fr))` — 300 being the
narrowest a card can be and hold a club's full name, its record and a two-digit
score on one line — collapsing to one column below 430.

---

## Standings

One board, one control over it, and nineteen columns of the season.

### The three groupings are three questions

**Division** (six tables), **Wild Card** (the clubs not leading one, per league,
with the cut line after the third) and **Overall** (one table of all thirty).
They are a
*grouping* rather than three pages because the rows are the same rows: the
server sends every club once with the wild-card order beside it, so crossing
between them is a re-grouping and not a fetch — the same economy the research
board's position pills make.

The wild-card order is on the wire because it is **not derivable from the rows**:
that board excludes division leaders and is ranked by a tiebreaker order MLB
owns. `WILD_CARDS` is 3 and is a constant rather than a count of who is above
`+0.0`, or the line would move with the standings instead of being the thing
they are read against.

**Overall is one table of thirty and was two of fifteen.** The other two
groupings are *races*, and a race is league-shaped by construction — you win a
division, and you get a wild card in your own league. The question this one is
left with is simply *who is any good*, and splitting that into American and
National answers it twice, with two clubs that never meet sitting at the top of
each. MLB's own `sportRank` is the order, which is on the same payload the other
two ranks are and needed asking for no more than they did.

**Games behind is recomputed on that board and nowhere else.** `gamesBack` on the
wire is a club's distance from *its division leader* — right on two of the three
boards and wrong here, where the row above is not in the same division. It was
wrong on the old two-tables reading too, and quietly. The arithmetic is MLB's
own (half the sum of the win gap and the loss gap), so the column means the same
thing on all three.

### There was a span control, and three columns replaced it

The tab offered the whole board over five spans — `season`, 60, 30, 15, 7 — as a
run of pills that became a `<select>` on a phone, with a windowed board computed
server-side for each. **`L30`, `1st Half` and `2nd Half` beside `L10` say more
of what that control was reached for**, and say it at the same time as
everything else: how a club has been going lately, and either side of the break,
without leaving the row its season record is on. A span control answers one of
those at a time and makes the reader hold the others in their head.

It also takes a whole vocabulary out of the app — a span type, a URL param
(`mspan`), a board that had to state in words which days it was drawn over, and
the rule that a window may not carry a season's columns. What is left is one
board that is always the season, which is what a standings page is.

**None of the three is on `/api/v1/standings`** — its `splitRecords` run to
sixteen types and stop at `lastTen`, and `date=` gives the standings *as of* a
day rather than the record *since* one. They come out of the season's own
schedule, walked once, by the machinery the windowed board used to use.

**`RS`, `RA` and `DIFF` sit straight after the race**, which is the one place
on this board where the column order is an argument rather than a habit. `W`,
`L`, `PCT` and `GB` are the standing; the three run columns are the nearest
thing to a *reason* for it, and a differential read beside the record it
produced is a different column from one read after eight columns of splits.
They were after `STRK`, which put a five-game streak between the two figures a
reader actually compares clubs on and left the runs adrift in the middle of the
board. `STRK` loses nothing by the move: it joins `L10`, `L30` and the two
halves, which are all one reading — *how has this club been going lately* — and
are better for being adjacent.

**`L30` is thirty games, not thirty days**, because it stands beside `L10` and
that one is games. Two columns an inch apart, one counting games and one
counting days, is the kind of thing this codebase spends its length preventing —
and a club that has had four days off would otherwise read as having gone cold.

**The halves split on the All-Star game's own date**, asked for rather than
approximated (the break moves by a week between seasons): `gameType=A` returns
exactly one game, 276 bytes, and the walk's own `gameType=R` means that game is
never among the games being split. A failed read leaves both columns null on
every row, which is the honest reading of "we could not ask" where `0-0` would
claim nobody has played since July.

Sanity check on the arithmetic: on 2026-08-25 Tampa Bay reads `56-38` and
`22-15`, which sums to the `78-53` on the same row.

### The board says nothing about itself in words

Two captions stood here — one naming the days the rows were drawn over, one
saying the line was the third wild card — and a third under the news list. All
three were the page explaining a table that already reads. The days went with
the span control; the line needs no caption, a rule drawn after the third row of
a board titled `American League Wild Card` being the one thing on it a reader is
looking for. Prose that restates the drawing is prose a reader learns to skip,
and then skips over the sentence that would have mattered.

### The control

Not in the app's tools row, which is the Fantasy page's own decision read one
view over: a control above the strip is a control over the *page*, and this one
governs one third of it. It is three pills and nothing else — 243px against the
276 the app's gutters leave at 320, so there is no width at which it wraps,
scrolls or collapses to a dropdown. It held two runs and a pair of `<select>`
fallbacks while there was a span to pick.

### The table

`.glog-table`'s selector lists with one more name in each — a wide stat table
with a sticky first column, read across rather than picked, is an object this
stylesheet already has. What is its own, and each of these is a measurement or a
bug report:

- **A narrower `--row-gutter`** (`clamp(4px, 1vw, 13px)` against the log's
  `clamp(5px, 1.9vw, 28px)`). Nineteen columns, seven of them a `43-23` pair.
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
  is worse than one that says `NYY`. The column's floor drops to 74px with it.

### The sticky column, and the two things that were wrong with it

**The flex box is a `<span>` inside the cell, not the cell itself.** The `<td>`
carried `.mlb-club`'s `display: flex` directly, which takes it out of
`display: table-cell` — and `position: sticky` on a table cell that is no longer
one is exactly the case Safari declines to honor. Chrome held it (measured: both
the header and the body cells sit at `left: 0` through a 250px scroll), which is
why it shipped; the report was *"the column header sticks but not the actual
teams below it"*, and the header is the one cell in that column that never had
the flex on it. One `<span>` puts the cell back to `table-cell`.

**And there is no pinned edge, at any width.** `--pin-edge` is an 8px blurred
shadow that says *the table goes on under this column*, and on the tables it is
borrowed from it reads as depth against a narrow date column. Here it read as a
soft vertical bar down the middle of six tables, and was reported twice: once
when it was drawn on tables that did not scroll at all, and again when nineteen
columns meant every table scrolled and it was therefore always on. The first
report was answered by measuring each scroller and drawing the edge only when it
overflowed — correct about *when* and wrong about *what*. On a board whose
sticky column is a crest and a club name, that is what separates it from the
numbers; the rows carry their own ground, so content passing beneath is hidden
cleanly with no edge needed to say so. The measurement went with it, having no
reader left.

**The cut line is a border on the row above it**, not a row of its own: a `<tr>`
with a `<td colspan>` would be a row in the accessibility tree saying nothing,
and it would take the zebra stripe.

Every row is a door into the club's page.

## News, and why there is no longer one

**The third tab was `News`** — the league's ten biggest stories, ranked on the
server off the same sweep the research board's news marks already paid for. It
drew `NewsList`, the player page's own list, with one slot filled (`owner`, who
the row was about). It is **gone**, and this section is kept as the record of
what it was and why it went.

**It was removed because a league-wide feed is the least personal thing this app
draws.** The news a reader of this app acts on is the news about *his own
players*, and two surfaces already put that in front of him at the moment he is
looking at that man: the roster's news mark, and the player page's News tab.
This tab was a second, worse place to find a subset of the same sweep — worse
because it could only ever show ten of ~970 notes, and because reaching it meant
leaving the page where the decision was being made.

**What went with it**, so nothing is left orphaned: `MlbNews.tsx`, the
`/api/mlb/news` route, `recentNews.ts::getLeagueNews` and the whole ranking that
served it (`TOP_STORIES`, `MLB_KINDS`, `EVENTS`, `eventWeight` — the
kind-of-event table, the graded recency and the chatter proxy), the
`LeagueNews`/`LeagueNewsItem` pair on both sides of the wire, `NewsList`'s
`owner` slot and its one caller, `App`'s `knownIds` set, and the `.mlb-news*`
block in the stylesheet. *A field nobody reads is a field nobody misses* —
applied here to about 350 lines. Measured: **JS 745.47 → 743.39 kB (gzip 219.86
→ 219.29), CSS 192.53 → 192.13 kB (gzip 34.30 → 34.24).**

**`recentNews.ts` is untouched and still sweeps.** `getRecentNews` — the news
mark on every board — was always its first reader and is now its only one again.
Two things it gained for the second reader are **deliberately kept**: the
seven-day reach (`NEWS_DAYS`), because that is also what makes the *player*
page's News tab reach back a week rather than to Tuesday, and the stored shape
(`news-recent-v2.json` holds the notes, not the reduced map), because reducing
it back would re-introduce the very v1 shape that version was bumped away from.
Both say so where they are declared.

**`mlb=news` in an old link falls back to the Scoreboard** rather than emptying
the view — the app's standing rule for a value it does not recognize, and
checked in the running app rather than assumed.

---

## State

Three params, all in the URL because all three decide what data is on screen:

| param | what | default (omitted) |
| --- | --- | --- |
| `mlb` | which tab | `scoreboard` |
| `mday` | the Scoreboard's day, as a rule or a date | `Today` |
| `mgrp` | the Standings' grouping | `division` |

There was a fourth, `mspan=`, and it went with the span control it named.
`mlb=news` was a fourth *value* of the first and went with its tab; an old link
carrying it falls back to the Scoreboard rather than emptying the view.

`mgrp` is scoped to the Standings tab rather than to the view: a grouping with
no standings to be about would name a reading that is not in force, the rule
`cut=`, `mt=` and `mr=` all follow.

**The `m` prefix is not `mp`/`mup`/`mt`/`mr`**, which are the fantasy matchup's.
Two params must never mean two things — a link is read before anything on screen
can say which view wrote it.

## The reads

One per tab, each read on its first open and kept — the rule the Fantasy page's
three and the player page's nine follow. What differs is what can change
afterwards, and only one of the two can:

- the **Scoreboard** re-reads when the day changes, and polls on `LIVE_POLL_MS`
  while the board holds a game being played or still to start. Gated on the tab
  as well as the view, unlike the league poll: nothing off this page draws a
  mark from this board;
- the **Standings** are read once — one board, and the grouping is a re-grouping
  of rows already in hand rather than a fetch.

There was a third read, the News, and it went with its tab.

The board **sequence-checks its own answers** against the day the reader is on —
a ref, so the loader is not rebuilt every time the date moves. Two presses of an
arrow are two reads in flight. The Standings need no such check: they have no
control that can supersede a read.

## Related

`sicko-server` for the two routes and the two modules behind them
(`mlbScoreboard.ts` and `mlbStandings.ts`; `recentNews.ts` no longer has a
reader on this page).
`sicko-game-page` for the page a card opens, `sicko-team-page` for the page a
standings row opens, `sicko-client` for the date bar and the loading rules,
`sicko-player-page` for `NewsList` itself.
