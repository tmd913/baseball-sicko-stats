### The team page

`TeamDetails.tsx` — a club's own page, and the **second** thing in this app to
be one. It is the player page's twin by construction rather than by
resemblance, which is the whole of what this document is about: the box it is
drawn in is `DetailsShell.tsx`, extracted from `PlayerDetails` the day this page
was written, and everything above it in the tree is shared by both.

Read `client-player-page.md` beside this: the shell's own reasoning — the
measured chrome, the Escape rule, the focus and inert handling — was written
there, was found there, and is documented there. This file is what is different
about reading **thirty men at once**.

---

## The shell, and why the refactor came first

`PlayerDetails` was 1,999 lines of which about thirty were the page *itself*: a
fixed box at layer 50, `useLockBodyScroll`, `useOverlayFocus`, the
`useOverlayChromeOffset` that publishes `--details-chrome-h`, a scroll reset on
tab change, the tab strip's scroll-the-selection-into-view, and an Escape
handler with two different tests of "is something on top of me". Every one of
those is a rule with a measurement behind it and a fault it was written to fix —
12 of 12 tab stops walking behind the page, a strip whose chosen tab landed
half under a chevron, a ladder of overlays unwinding whole on one keypress.

A second page wants all thirty of those lines and none of the 1,969 around them.
So they moved into **`DetailsShell`**, which takes:

| prop | what it is |
| --- | --- |
| `tab` | which tab is showing — the scroll reset and the strip's scroll-into-view |
| `resetKey` | what makes this a *different page* — a player key on one caller, a club id on the other |
| `head` | whatever names the subject, drawn beside the back button |
| `chromeExtra` | anything pinned between the head and the strip — one caller has one |
| `tabs` | the `role="tab"` buttons themselves |
| `className` | a modifier on the box (`gamelog-mode`) |
| `onClose` | |

It knows nothing about a player: no id, no kind, no report. That is deliberate
and it is the test that the extraction is honest — a shell that knew it was
*usually* about a player is a shell the team page would work around.

**`DetailsTabButton` came with it.** The strip is a row of buttons written out
longhand rather than a `map` over a table, for a reason the player page states at
length (the order is the order they are written in, and each carries its own
paragraph about why it sits where it does) — and that is untouched. What the
component takes away is the four lines of `role`, `aria-selected` and the two
class expressions that were identical on all nine, and with them the chance of a
strip where one tab is missing its `aria-selected` and reads to a screen reader
as a plain button. Nine call sites on the player page, five here.

**Checked in a browser after the extraction, before any team page existed**: the
player page opens on a pitcher with `--details-chrome-h` **165px**, the head at
20 → 111, all nine tabs in order (`Overview · Percentile Rankings · Arsenal ·
Splits · News · Stats · Game Log · Schedule · Charts`), `Overview` active and
`aria-selected`; pressing `Stats` moves both marks and leaves the scroll at 0;
Escape closes the page and drops `player=` from the URL. Byte-for-byte the same
behavior it had, from a different file.

---

## What the page is, and what it is not

Five tabs: **Overview · Schedule · Roster · Splits · Stats**.

Every per-player mark is gone, each for the reason the research board's team
rows already give: the roster baseball and the padlock say who owns him, which
no fantasy league can say of the Brewers; the watchlist star adds a
`${kind}-${id}` key to a list of *players*; the lineup pip is a batting order and
the status code an injury designation. Each would be a mark on every club or on
none, which is the rule `RULES.md` states — *a mark that would be on every row
marks nothing*.

**Four of the player page's nine tabs are absent and none of them is an
omission.** Each was refused for a reason about the club rather than about the
work:

- **Percentile Rankings** and **Charts** are Savant scrapes, and Savant publishes
  percentile bars and a rolling xwOBA series **per player**. There is no club
  scrape behind either, and building one out of the team board would be this
  app's own ranking wearing Savant's clothes — the exact failure the estimate
  rule exists to prevent (*an estimate never wears the same clothes as a
  measurement*).
- **Splits** is a tab here, and it is nine cuts where the player page's platoon
  card is two — the same `OpponentSection` a pitcher's opponent draws. A
  diverging bar beside it would be the same fact at lower resolution.
- **News** for a club is thirty men's news, which the app already draws where it
  belongs — the newspaper mark beside each of their names.
- **Game Log** for a club is its schedule with the scores in it, and the scores
  are not on the wire: `ScheduleGame` is deliberately thin (see `types.ts`, which
  argues the omission), so the tab would be a route and a payload before it was a
  table.

---

## The head

The **crest** where the portrait goes: `.details-photo`'s box — 64px, round, the
same border — with the two things a *cap mark* needs that a face does not.
`object-fit: contain` with 9px of padding, because these are SVG marks that the
photo's `cover` would crop to their middle; and no `--panel-2` ground, the club's
own color riding inline off `teamColor` (the `on-dark` cut is white alone for
thirteen of the thirty and would vanish on a light theme — the contrast
measurements are in `lib.ts`). A club MLB serves no mark for falls back to the
abbreviation in the same circle on the same ground, so a broken logo reads the
same way on a row and on a page.

The **name in full**, and under it two things:

- **The abbreviation**, in the position chip's own slot and shape. Every table in
  the app calls this club `MIL`, so a page that named it only in full would leave
  a reader arriving from a `MIL` cell to take on faith that it is the same club.
  It is the same kind of fact the chip carries on a player — *what this subject
  is, in the app's own words*.
- **The record**, where a player's hand goes, which is the substitution the
  board's team rows already make: a club has no hand to hit from, and its
  won-lost is the one fact about it that reads like an identity rather than a
  statistic. `.team-record` is **folded onto `.player-hand`'s rule** rather than
  given declarations that agree today — same slot, same size, and the two can
  never appear together (a club has no hand, a player has no record), which is
  exactly the case this stylesheet folds. Season-matched, the head being about
  the season; the windowed records are on the Stats tab's rows, each beside its
  own span.

---

## The side switch

**`chromeExtra`'s one caller on this page**, in the player page's own row and
classes (`.details-kind-row`, `.view-switch`). The two controls are the same
control — *which half of this subject am I reading* — and what differs is only
what a press does. On a player it is **navigation**: a two-way man is two pages
under one id, and the switch opens the other one. Here it is a **reading** of one
page, because a club is always both halves at once and nobody would call the
Brewers' pitching a different club.

It rides in the URL as **`tside=pitching`**, written only off the default, and
scoped to `team=` — a side with no club to be a side *of* would name a reading
that is not in force, the rule `cut=` and `mt=` already follow. It is in the URL
at all because it decides *which numbers* the Stats and Overview tabs are
showing, which is the test that put `pos=` and `win=` there.

It is **not** in the page's `resetKey`: switching bat for arm is a reading of the
same club, so the reader keeps their place on a five-row table rather than being
thrown to the top of it.

---

## The tabs

### Overview

Two blocks, and the tab is deliberately short — a club's page is opened to get
*to* something, where a player's is opened to read his day.

**Season** is the club's line for the side on screen, drawn as the one-row
`.glog-table` the player page's own Season block draws. Which numbers is the side
switch's answer, and they are the research board's defaults for each kind rather
than a set chosen here: a reader who wants a different eight has the Stats tab's
picker one door along, and a third vocabulary of stat labels is the thing this
app has spent `researchColumns` on not having. `Stats →` is its door.

**Next Games** is the fixture list at five rows, with `Schedule →` through to the
whole fortnight.

### Schedule

The same list at its full length — `HORIZON` is **14**, the player page's own, one
fortnight meaning one thing in this app whether the rows are a man's or his
club's.

**It is not `UpcomingGames`**, and that is a judgment rather than an oversight.
That block's row is built around a *player*: whether this man is the announced
starter, which turn of the rotation it is, what tier of certainty the projection
has, and the opposing lineup he would face. Every one of those is a fact about
somebody standing in the game, and a club is not standing in it. What a club's
row wants instead is **both** announced starters, which that row has no place for
and no reason to grow one. Two rows that answer two questions are two rows —
which is the same rule read the other way as `OpponentSection`, shared precisely
because both its callers want the identical nine cuts.

What *is* shared is everything underneath: `buildScheduleIndex`, `gamesOn`,
`opponentText` and `spanPhrase` are the schedule's own vocabulary, so this list
and the two wide tables' Schedule view cannot disagree about which games are in a
fortnight or about what a postponement is. The row is `.start-row` /
`.start-line` and its cells are `.ovw-next-when` / `.ovw-next-opp` /
`.ovw-next-vs` — the Projected Starts row's own, folded onto rather than
restyled, that block drawing exactly this kind of fact.

**The `vs` belongs to the man on the right.** All three states read: `Priester vs
Sale` with both named, a bare `Priester` where only this club has named one, and
`vs Sale` where only the other has — that last being the commonest of the three,
since a reader on a club's page most often wants to know who *they* are facing.
Hung off the pair instead (`mine || theirs`), it left a line ending in a dangling
"vs" whenever the far club had named nobody; seen on the live window and fixed.

**A name nobody has announced draws nothing, not `TBD`.** Clubs name a starter
about three days out — measured, 28/28 today, 27/30 tomorrow, 30/30 at two days,
3/22 at three, 1/30 at four and nothing beyond — so past the front of the window
the absence is the schedule rather than a fact about the game, and a fortnight of
placeholders says the same non-thing eleven times. Each name that *is* known is a
link into his page, by **surname**, the rule the Projected Starts row states: a
list scanned down rather than a sentence read across, and two full names would
wrap the line on a phone.

A **postponement** takes the tag slot at the end of the line, in `.start-tag`'s
box and the app's one amber (`--hr` — the token is named for the home run it was
picked for and is what a postponement already wears in the summary table's
opponent cell, on the board's, in the schedule cell's `PPD` and on
`.game-status.postponed`). A row that drew it silently would be a fixture that
never happens sitting among ones that will.

### Roster

**Who plays for them** — and the tab costs no request at all, which is why it can
afford to be a plain list rather than a board. It is a filter over the season
roster the client already holds from boot for the header search.

**Joined on `SeasonPlayer.teamId`, not on the printed name.** That field was
added for this (see below): matching `team` would be a join on a display string,
and a club whose name the list spells differently would come back *empty* rather
than wrong — which is worse, being indistinguishable from a club with nobody on
it.

**One kind at a time, and the side switch picks it.** It drew both lists under
two headings at first, which made this the one tab on the page the switch did
nothing to — a control pinned above every tab that four of the five obey and the
fifth ignores is a control that has stopped meaning anything. It is also the
app's own rule for a *roster*: the Roster view has two tables with a kind tab
over them, and the reorder screen splits the same way. So `Batting` is the club's
hitters and `Pitching` its arms, and the heading says which. The strip and the
switch then answer two different questions, which is what they are for — *which
reading of this club* and *which half of it*.

**Alphabetical**, because nothing else here ranks them and a list a reader is
scanning for a name wants the order names come in. Ranking lives on the Stats
tab, and ranking *players* lives on the research board — this is an index, not a
leaderboard. Each row is a name (a door to his page), his listed position, and
his hand in the tables' own token (`LHB` / `RHP` / `SH`), pushed to the far end
by an auto margin because a roster is exactly the list a reader scans for the
left-handers.

A two-way player is two rows under one id, here as everywhere — so he is on both
sides of the switch, correctly, once each.

The empty state names the control as well as the cause: *no **pitchers** on the
season's player list are filed under this club*, since with the switch deciding
which half is on screen, "nobody is filed under this club" would be the wrong
sentence for a club whose hitters are all there.

### Splits

`OpponentSection` at nine cuts — five spans × three venues × three hands — off
`/api/teams/:teamId/splits`, the route a pitcher's opponent table already reads.
The same component, for the reason that file records at length: nine cuts, three
rows, ten columns, a span control, a venue control and the accented hand row are
a lot of decisions to keep two copies of.

**It follows the side switch, which is what makes it two tabs' worth of reading
in one.** On `Batting` it is how the club has hit, by the hand on the mound; on
`Pitching` it is the line opposing batters have put up against them, by the hand
at the plate. That is the same table off the same rows — a club's pitching line
*is* its opponents' batting line, summed under the fielding club instead of the
batting one (`data-sources.md`, *Both sides of the ball*).

**It is `Splits` on the strip and `Hitting` / `Pitching` on the table's own
heading**, and the split of labour is deliberate. The strip names the *kind* of
reading a tab holds — the rule the player page applied when `Rolling xwOBA`
became `Charts` — and this tab held `Hitting`, which named its content instead.
That label also stopped being *true* the moment the tab followed the switch: a
tab headed `Hitting` over a table of runs allowed lies about what is under it.
What is invariant is that the table is a split, by the other man's hand and by
the ballpark; which half of the club it splits is what the heading says.

`hand` is **null** on both sides — that argument accents the row for the man on
the mound, and there is no one man here.

**Three things in the table are read off the side and nothing else is.**

- **The row labels.** `vs RHP` / `vs LHP` batting, `vs RHB` / `vs LHB` pitching
  — one letter, appended rather than the label being written out twice, so the
  two rows cannot come to disagree about which hand they are. The *field* behind
  them is one field: `vsLeft` is the left-handed **other man** on both sides,
  which is the economy `SplitCut` already makes on a player's page (`vsr` reads
  as *vs RHP* on a batter's and *vs RHB* on a pitcher's).
- **The tooltips.** The ten column labels are the same ten on both sides and the
  titles are not: `AVG` on a pitching row is the average against, `R/G` is runs
  allowed. Relabelling the headers (`oAVG`, `RA/G`) would be a second vocabulary
  for one set of figures on a table whose whole shape exists so a reader can run
  their eye *down* a column; what the side changes is what a number **means**,
  and a meaning is what a tooltip is for.
- **The direction of every rank.** Handled on the server (`rankedFor`), because
  the ranks ride on the line. *1st is best* holds on both sides — the fewest
  runs allowed, the lowest OPS against, and the **most** strikeouts.

Everything else is the component untouched, including the span control: the
spans are cached **by side and span together**, so switching sides costs one
read of what has not been read and never shows one side's `15d` under the
other's lit tab. Measured — `15d` batting is 552 plate appearances over 14
games, `15d` pitching 523 over the same 14, and crossing back and forth is
instant.

### Stats

`PlayerWindowTable` over the board's **team** reading — the same table, the same
column vocabulary, the same picker, the same span column, the same sort. Two
things change and the prop that changes them is `teams`:

- **The population the badges rank within.** `boardPopulation` cuts a leaderboard
  to its trade by reading `positionType`, which a club has not got — on this
  reading it would empty the pitching board and pass every row of the batting
  one. The server already answers with exactly the thirty rows the kind asked
  for, so there is nothing left to cut, and the expression here is the research
  table's own `teams ? rows : boardPopulation(rows, kind)`, in the same words for
  the same reason.
- **The cut control is not drawn.** Savant publishes no team cut of the boards
  these rows are summed from, so the four buttons could only ever be four
  requests for the same table — the failure `RULES.md` names first, an upstream
  that accepts a selection and answers something else. A control that cannot
  change what it points at is worse than no control, because nothing on screen
  would say why nothing happened. The club's platoon reading is the Hitting tab.

  **It was first written as `hidden={teams}` on the box, which does nothing**:
  `[hidden]`'s `display: none` comes from the UA stylesheet at the lowest
  specificity and `.split-switch { display: flex }` beats it, so the empty row
  was still laid out and still took its slot — seen as a 5px artifact at the left
  end of the tools row. A conditional render is what an absent control is.

The saved **column set is the player page's own**. It is one vocabulary and one
table, and a reader who has chosen their columns has chosen them for the way they
read a stat line, not for the kind of subject it belongs to.

---

## The server

Two routes, and between them they cost the upstreams nothing that was not already
being fetched.

**`GET /api/teams`** — the thirty clubs, `{ id, name, abbreviation }`, sorted by
name. `getTeamList` in `mlbStats.ts` is a shape change on the cached fetch the
two existing maps are already cut from, not a request. A route rather than a
table in the client bundle for the reason `/api/players` is one: it is MLB's own
list, and a curated copy goes stale silently when a club moves or renames.

**`GET /api/teams/:teamId/windows?type=`** — one club's row on each of the five
spans, in `PlayerWindows`, the exact shape and route pattern
`/api/players/:playerId/windows` answers in, because it is the same table
transposed onto a different population. `getTeamWindows` is five lookups into
`getTeamResearch`'s own cached boards, so the first read of a club's page warms
five boards the research view then opens instantly on.

It takes **no `cut`**, where the player route does, and the reason is the same
one that hides the control: the team boards carry no split. Offering the
parameter and ignoring it is exactly what `teamResearch.ts`' own header warns
about.

**`SeasonPlayer` gained `teamId`.** One number per row on a list of ~1,400 the
client holds from boot, off `p.currentTeam.id`, which was already in hand on the
line that looks the club's *name* up. Null for a free agent, whom MLB files under
no club. It is what the Roster tab joins on and what the header search's club
rows and the player page's club link are keyed to. **No cache version to bump**:
`getSeasonPlayers` is an in-memory TTL cache, not a stored blob, so nothing
deserializes with the field missing. `espn.ts`'s prospect fallback fills it from
the `IndexEntry` that already carried one.

---

## Where the page is reached from

Three doors, and the third is the one that pays for the other two.

**The research board's team reading.** Its rows were the one identity block in
the app drawn as plain text — `is-static`, under a comment reading *"there being
no club page behind it"*. There is one now, so the cap logo is a `<button>` with
the same class and the same box and the name is an ordinary `.sum-name-link`.
`TeamPhoto` takes an optional `onOpen` and falls back to the inert `<span>`
without one: the old rule outlives its first caller, since *a row that looks
pressable and is not is worse than one that plainly is not* holds whatever is on
the other side.

**A player's Overview.** The report has carried `teamId` and `team` since the
summary table wanted a cap logo, and there was nowhere to send a reader who
pressed it. It is a chip at the head of the tab — context rather than a reading,
the one line there that is about *where* he is rather than what he has done — and
it leads because a reader who wants it wants it before anything else on the page.
Its wrapper `.ovw-team-row` is folded onto the tab's reading-column cap
(`.ovw-day, .ovw-starts, .ovw-news`), which is not cosmetic: without it the chip
sat at the far left of the overlay, **200px outside** the column every heading
under it is centered in. Measured after — chip and first heading both at `left:
200` at 1200px and both at `16` at 390.

Drawn only where the report can name the club, which is the join-to-null rule: a
report with no `teamId` is a free agent or a man the day's read could not place,
and a link headed by a blank is worse than no link.

**The header search.** The app's one way of reaching a subject by typing its
name, and a club is a subject now. Clubs are matched on the same folded haystack
the players are (`searchFold`, so a typed accent or a hyphen is gone from both
sides), over the **name and the abbreviation** — the abbreviation being the half
that matters, since every table in the app calls the club `MIL` and `MIL` is what
a reader who has just read one of those rows will type.

They **lead the menu under a `Teams` head, capped at three.** The head, because a
`Milwaukee Brewers` row in a run of players reads as a player this app has got
badly wrong; the cap, because the field is a player search that also finds clubs
— thirty against fourteen hundred — and clubs must never crowd the players out.
The empty state moved with them: `No players or teams match "zzzz"`, because a
reader who typed a club name and read *"No players match"* would be told the
search does not do the thing it had just failed to do.

Measured against the live index: `brew` → `Milwaukee Brewers` then Brewer
Hicklen; `MIL` → the Brewers then eight players with `mil` in their names; `turang`
→ Brice Turang alone, no team row; `zzzz` → the empty state.

---

## One page at a time

`team=` and `player=` are **mutually exclusive by construction**, enforced in the
one place that can enforce it: `App`'s `openTeam` and `openPlayer`, which each
clear the other. Every caller goes through them — the board row, the Overview
chip, the search, the roster row, a fixture's starter — so the exclusion cannot
be got round by a caller. On the way *in*, a link carrying both takes the
**player**, the older parameter and the one an existing link can have; a hand-made
URL is the only way to produce the pair, and falling back beats emptying the view.

They are **not a stack**. A player opened from a club's roster *replaces* the
club, exactly as a player opened from another player's Overview already replaces
him — one page at one layer, and one press of Escape to leave it. Stacking would
need a second `.details-view` above 50 and would then have to answer what happens
when a reader walks a chain of six.

The page draws only for a club `teams` can name; an id nobody has heard of opens
nothing, which is `detailsPlayer`'s standing rule for an unresolvable `player=`
and is the same answer for the same reason — a page headed by a bare number is
worse than no page.

---

## Measured

Driven in a browser at **1200×900** and **390×844**, dark theme, against the live
season.

**The page.** `--details-chrome-h` is **188px** at 1200 and **242** at 390 (the
strip wraps to its scrolling form and the side switch takes its own line), the
crest and both head chips drawn, all five tabs in the strip, and **page-body
overflow 0 and view overflow 0 on every tab at both widths**. Rows are 31px.

**Overview** (MIL): `Season` and `Next Games`, the season strip reading `G 129 ·
R 644 · HR 119 · SB 129 · AVG .253 · OBP .337 · SLG .396 · OPS .733` — MLB's own
figures — and five fixtures with both starters where both are named.

**Schedule**: 13 rows over the fortnight.

**Roster**: `Batters 23` on the batting side and `Pitchers 26` on the pitching
one, one heading at a time, alphabetical, hands at the right edge.

**Splits**, both sides, MIL, season, all games:

- **Batting** — heading `Hitting`, rows `Overall / vs RHP / vs LHP`, the Overall
  line `G 128 · PA 4967 · R/G 5.02 (3rd) · AVG .253 (5th) · OBP .337 (1st) · SLG
  .397 (19th) · OPS .734 (7th) · HR 119 (30th) · K% 21.6% (11th) · BB% 10.8%
  (1st)`.
- **Pitching** — heading `Pitching`, rows `Overall / vs RHB / vs LHB`, the
  Overall line `G 128 · PA 4717 · R/G 3.77 (2nd) · AVG .219 (2nd) · OBP .294
  (3rd) · SLG .357 (1st) · OPS .651 (1st) · HR 129 (7th) · K% 26.4% (1st) · BB%
  8.6% (12th)` — every rank the other way up, which is `rankedFor` working: the
  *lowest* OPS against is 1st and the *most* strikeouts is 1st. `vs LHB` reads
  `.209`, which is `.209` at MLB.
- **The span control survives the switch and keeps the two apart**: `15d` is 552
  plate appearances batting and 523 pitching over the same 14 games, and
  crossing back and forth redraws instantly off each side's own cache.

It landed inside 150ms from the server's cache, so no wait was drawn — which is
rule 1 of the loading system working, not a missing state.

**The pitcher's opponent dialog is untouched**, which is the other caller of the
same component: a projected start on Logan Gilbert's page opens the `Opponent`
heading, `Overall / vs RHP / vs LHP`, with the row for his hand still accented.

**Stats**: five spans down the side with percentile badges against the **thirty
clubs** — season `G 129` at the 53rd, `R 644` at the 88th — and no cut control.
The side switch to `Pitching` writes `tside=pitching`, keeps the Stats tab, and
redraws with the pitching board's own columns (`G · GS · IP · W · L · SVHD · H ·
ER · HR · BB · K · ERA · xERA · FIP`, `xERA` a dash because Savant publishes no
team xERA).

**The three doors**, each driven end to end: the board's club name and its cap
logo both open `?team=109` over the board and `Back` returns with every other
param untouched; a player's Overview chip opens `?team=158` from
`?player=batter-668930`; a roster row inside that page opens
`?player=batter-683734` with `team=` gone — the two params never coexisting at
any step. Escape closes the page and leaves the view behind it exactly as it was.

**Bundle**: JS **610,768 → 623,989** bytes raw (180,191 → 183,900 gzipped), CSS
**163,306 → 165,315** (29,379 → 29,654 gzipped) — +13,221 of JS and +2,009 of
CSS for a page, a shell, three routes' worth of client, a search that finds
clubs, both sides of the splits table and the stylesheet's own thirty-odd lines.
The shell is the reason it is not more: the box, the chrome, the strip's
scrolling and the Escape ladder are the same code the player page was already
carrying — and the pitching side of the Splits tab cost **846 bytes** (196
gzipped), being three labels and a tooltip on a table that already existed.
