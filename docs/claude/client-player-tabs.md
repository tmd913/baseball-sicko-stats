### The News tab, and the two sources behind it

Split out of `client-player-page.md`, which holds the page these sit in and the
Overview tab. These are the four that read his season and his record — **News**,
**Stats**, **Game Log** and **Charts** — in the strip's own order. The
**Splits** tab is its own file (`client-player-splits.md`), and the percentile
card's own table is server-side, in `data-sources.md`.

**It is the eighth tab and it reads before Stats and the Game Log** — the strip
is `Overview · Percentile Rankings · [Arsenal] · Splits · News · Stats ·
Game Log · Charts` *(the **Schedule** tab has since gone in second, so News is
the ninth and the run reads `Overview · Schedule · Percentile Rankings ·
[Arsenal] · Splits · News · Stats · Game Log · Charts`; its own reasoning is in
`client-player-page.md`, **The Schedule tab: what he has coming**)* — which is the Overview's own block order one tier up and
for the same reason. What has *happened* to a player this week is a different
kind of fact from what he has *done* this season, and it is the one that changes
a decision fastest: a reader deciding about a stranger wants to know he went on
the IL this morning before reading his 30-day xwOBA.

**Lazy on first open, keyed by player alone.** The day, the game log and the
window table are all keyed by kind as well, because a two-way player's bat and
his arm are two of each; **news is a fact about a person**, so Ohtani has one
list rather than two. It takes the app's one loading discipline — `useDelayedFlag`
behind `WAIT_DELAY`, the spinning baseball, `Reading the latest news` — like every
other lazily-fetched tab.

**No row is a press, and a report used to be one.** A `rotowire` note opened
that player's RotoWire page in a new tab (`target="_blank"`,
`rel="noopener noreferrer"`), on the reasoning that it is where the note was read
from and where RotoWire's own analysis of it lives. That is gone, and the two
reasons are the ones the paragraph it replaces was already half-admitting:

- **The link was never item-precise.** RotoWire's per-note addresses
  (`/baseball/headlines/…-1020205`) exist on its **league-wide** feed and not on
  a player page, where the headline is a bare `<div>` — so all seven of a man's
  notes went to the same `#latest-news` anchor on the same page. A link that
  cannot reach the row it is on is a link to *a list containing* the row.
- **What it opened onto was a subscription wall.** The one thing that page has
  past what this section already draws is RotoWire's **analysis**, which is
  paywalled — measured when the scrape was written, 1 of 7 notes on a checked
  player carried it and the other six read *"Subscribe now to instantly reveal
  our take on this news."* The old passage used that same fact as the argument
  *for* the link; it is a better argument against one. Sending a reader out of
  the app to be asked to subscribe is not what a row on this list is for.

So the list is **one voice**: every row is a dated line, a kind and a headline,
with RotoWire's note under it as a standfirst where there is one. `.news-link`
and its pointer, hover tint and focus ring are gone from the stylesheet, and
`.news-static` — the shape the transaction row always had — is the only one
left. Nothing on this list looks pressable, which is the rule that class was
written to state and which is now true of the whole of it rather than half.

**What a row still says is where it came from**, in the pill and in the class
(`news-rotowire` / `news-mlb`): a desk's report and the official record are
different kinds of claim, and levelling them would be the section pretending it
has one source. A **transaction** still carries no summary, because MLB
publishes none — the whole of it is the one sentence — so that row is the date,
the kind and the headline and stops.

**`NewsItem.url` went with the link**, which is this codebase's own rule for a
field whose only reader has gone (`teamProbablePitcher` is the precedent: *a
field nobody reads is a field nobody misses*). It is dropped from both `types.ts`
and from `rotowire.ts`'s emit; `news.ts` never filled it with anything but
`null`. Nothing versioned moved — `news.ts` caches per player in memory alone on
30 minutes and writes no blob, so there is no stored shape to deserialize with a
field missing. The RotoWire **page address is still needed and still used**: it
is what the scrape fetches, a local in `rotowire.ts`, and none of that is
touched.

**The `kind` pill is the upstream's own word, and both upstreams already write
English** — which is why `prettyKind` is one line where it used to be a table.
MLB's `typeDesc` prints as it comes (`Status Change`, `Trade`, `Assigned`).
RotoWire's is the **body part** it files an injury note under — `Elbow`,
`Hamstring`, `Head` — which says more in four characters than any label this app
could invent, with `Report` on the notes it files under nothing; the server fills
it, so the pill is RotoWire's word rather than a mapping of it. (ESPN's `type`
was the one that needed translating, being a CMS label, and it went with the
feed.) Outlined and `--faint` rather than toned: this is a *label*, and the app's
color is spent on state.

**Both sources date to the day** — MLB publishes no time with a transaction and
RotoWire stamps a note `August 14, 2026` — so every row reads `Aug 11` today.
`formatDate`'s instant branch is kept anyway and is doing the work that matters
either way: reading a bare date as an instant is what goes wrong on its own,
`new Date('2026-08-11')` being UTC midnight, which in ET is the 10th. The length
of the string picks the branch, a day is pinned to noon before it is formatted,
and a source that starts publishing an instant draws as one without this being
touched. `news.ts::cmpDate` sorts on the day for the same reason.

**Reports lead the transactions they share a day with.** `cmpDate` answers 0 for
two rows on one day, `sort` is stable, so the concat order *is* the same-day
order — and a note that reads like a sentence belongs above the roster move it
describes rather than under it.

**The empty state is the one this most had to get right**, and it has become the
*rare* case rather than the common one. It used to be routine — a healthy player
mid-season had nothing written about him and no move on his record — and it is
now a man RotoWire has never written up, which over a random 40-player sample was
**nobody at all**: 40 of 40 had notes, and the median player had 10 items. It
still names its cause the way every emptied view in the app does — `No recent
news for Chad Patrick.` over a line saying that RotoWire's notes and MLB's
transaction log were both read and both were empty, so a reader can tell it from
a read that broke. (Chad Patrick himself now has seven notes; the wording is what
survives, not the example.)

### There is no per-player news API, and this is what was tried

**Recorded so nobody probes them again**, across three publishers. Every one of
these is a dead end, and the **two 200s are the dangerous half**, because they
look like they worked:

| Endpoint | Result |
| --- | --- |
| `statsapi.mlb.com/api/v1/people/{id}/news` | **404** |
| `site.web.api.espn.com/apis/common/v3/sports/baseball/mlb/athletes/{id}/news` | **404** |
| `sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/athletes/{id}/news` | **404** |
| `lm-api-reads.fantasy.espn.com/apis/v3/games/flb/news/players?playerId=` | **404** |
| `site.api.espn.com/…/mlb/news?athlete=` / `athleteId=` / `player=` | **200, parameter ignored** — the league-wide feed whatever you name |
| `search-api.mlb.com` | does not resolve |
| `rotowire.com/baseball/news.php?playerid=` / `?id=` / `?player=` | **200, parameter ignored** — the same 25 league-wide items, whatever you name. Caught by diffing the player links out of three responses: identical, 25 items, 25 distinct players |
| `rotowire.com/baseball/news.php?page=` / `?offset=` | **200, ignored** — the league feed is 25 items and does not page |
| `rotowire.com/rss/news.php?sport=MLB` | **200**, a real feed and league-wide: **10 items**, no player filter |
| `rotowire.com/inc/player-panel/api/main/?player_id=&sport=baseball` | **200 and `null`** — the React player panel's JSON API is real and its own page says `SUPPORTED_SPORTS = { football: true }`; `sport=mlb` is a 400 |
| `rotowire.com/baseball/ajax/player-page-data.php?id=` | **200, 572KB JSON** — real, and it is game logs, splits and matchups. **No news in it**, checked key by key |
| `rotowire.com/baseball/ajax/player-news.php`, `/baseball/tables/player-news.php`, `/baseball/player-news.php`, `/baseball/player/{slug}/news` | **404** |

So the list is **assembled** from two sources of opposite character
(`server/src/news.ts`, `server/src/rotowire.ts`).

**RotoWire's player page is the reporting, and it is why this section is worth
having.** `www.rotowire.com/baseball/player/{slug}-{id}` carries an
`id="latest-news"` region holding up to **7** dated notes about that one player,
written by a fantasy desk: a lineup he is out of, a bullpen session, a save, a
demotion, the closer's job changing hands. No login, no cookie, no User-Agent
gate; **~627KB of HTML, 93KB gzipped**, of which about 4KB is the news.

**It is a scrape, and the shape it depends on is written down in the code** —
which is the standard `percentiles.ts` already sets by scraping a Savant player
page. Three things: a container `id="latest-news"`; inside it one
`<div class="news-update …">` per note, matched on the class **followed by a
space** (every field inside is `news-update__something`, and a looser split
matched those too — ten "blocks" for one real note, on the first pass); and
within a block `__headline`, `__timestamp`, `__news` and `__inj`. Each field's
own tag is captured and back-referenced when it is read, because the note body
carries inline `<a>` links to the reporter's post and a closer written as
`</(?:div|a)>` truncates the sentence at the first of them — measured, it cut
*"…activated from the 60-day injured list ahead of his start Tuesday night
against the Royals"* at "list". **How it fails**: every field is optional, a note
with no date or no headline is dropped rather than drawn, a moved region yields
zero notes, and the whole read is inside its own `try` — so the worst a shape
change does is empty this half and leave the transactions carrying the section.
What it can never do is put somebody else's news on a player's page, since the
*join* decides whose page was read and the join is not in the HTML.

**MLB transactions are the record** — `/api/v1/transactions?playerId=`, per
player, official, dated, and needing **no matching of any kind**. RotoWire
reports most of these moves too and reports them better, but MLB is the one that
is authoritative about them, and it is the half that keeps standing if the scrape
ever goes quiet.

**ESPN's club article feed was the reporting half and is gone.** It was scoped to
a club and joined back to a player through ESPN's own `categories[]` athlete
tags — a good join, and beaten on every axis that matters here. RotoWire is per
player rather than per club, fantasy-shaped rather than general, and reaches
**1,375 of the 1,383 players on the season roster** rather than only the ones
ESPN happened to tag. `espn.ts::ESPN_SITE_TEAM_BY_MLB` went with it, that feed
having been its only reader; the measurement it carried (ESPN's site API numbers
its clubs identically to the fantasy `proTeamId`, all 30 checked) is kept as a
comment where the table it was derived from lives.

**The join is `espn.ts`'s, imported rather than rewritten** — the same
accent-and-suffix fold, the same MLB name index off `sports/1/players`, the same
rule that a club match breaks a tie and *an ambiguity neither test resolves is
left unmatched rather than guessed*. What is joined is RotoWire's own player
tables (`player-basic-stats.php` at `pos=B` and `pos=P`, cookie-free JSON,
`ID` / `URL` / `player` / `team`), 685 batters and 847 pitchers over all 30
clubs. **The slug is what has to be carried, not the id**: a RotoWire URL with
the right number and a wrong slug 301s to `/baseball/`, and the bare number is a
404, so an index is not optional.

**Measured, and the shared names are the headline result.** Of RotoWire's 1,378
rows, **1,375 match** — 1,370 on the name alone and **5 where the club broke a
tie**, which is five more than the ESPN join could ever manage, that one having
had no club to break one with. So **both Max Muncys and both José Fermíns now
get their own news**, where the old join gave all six of the shared-name players
their transactions and nothing else. Read the other way it covers **1,375 of the
1,383 players on MLB's list**; the eight it misses are three whose spelling the
fold cannot bridge (`Jihwan Bae` against RotoWire's `Ji Hwan Bae`, `José A.
Ferrer` against `Jose Ferrer`, and the third Luis García, whom MLB does not list
on the club RotoWire has him on) and five with no MLB stat line for RotoWire's
tables to carry. Each of the eight gets his transactions and no reporting, which
is the direction this codebase fails in everywhere else.

**Club abbreviations agree 29 of 30**, checked club by club: the exception is
Arizona, `ARI` to RotoWire and `AZ` to MLB. A one-entry alias table rather than a
thirty-entry one, applied over MLB's own abbreviations read at request time so a
rename cannot leave a stale copy.

**A second index was measured and rejected.** RotoWire's injury-report table
(`/baseball/tables/injury-report.php?team=ALL`) is cookie-free JSON with slugs
and needs no season parameter, and as an index it adds **369 ids, not one of
which** is among the eight major leaguers the stats tables miss — every one of
the 369 a minor leaguer whose name is a fresh chance to collide. It buys nothing
and costs collisions.

**RotoWire's own analysis is deliberately not shipped.** It is the thing RotoWire
is read for and it is **paywalled**: on a checked player 1 of 7 notes carried it
and the other 6 read "Subscribe now to instantly reveal our take on this news."
Shipping that string would be an advertisement in the app, and shipping the one
free take would make one row a paragraph and six rows a line. **The row used to
link to the page instead and no longer does**, for the same reason one step on:
a link whose whole value past the row is behind a paywall is a link out of the
app to be asked to subscribe. See *No row is a press* above.

**One transaction type code is dropped and only one.** `NUM` (a uniform change)
is 2 of 12,235 league transactions over a checked six weeks, and on one day a
year it is a uniform change for **every player in the league** — Jackie Robinson
Day would put "changed number to 42" at the top of 1,300 news sections for a
fortnight. Everything else stays, including the ones that look procedural: `ASG`
is 5,147 of that sample and is where a **rehab assignment** lives, which is the
most useful thing this list can say about a man on the IL. MLB also emits the
same move twice under two ids often enough to matter (a rehab assignment came
back as 863948 and 863854 on a checked player, same date, same wording), so the
dedupe is on what a row *says* rather than on its id.

**And the same rule now runs across the two sources**, one step more abstract
because the wording is two publishers' rather than one's. About a fifth of
RotoWire's notes restate a transaction — *"The Dodgers placed Treinen on the
15-day injured list Saturday due to right elbow inflammation"* against *"Los
Angeles Dodgers placed RHP Blake Treinen on the 15-day injured list. Right elbow
inflammation."* — and the two share no phrasing to compare, so what is compared
is **the move each names, on the day they share**: an ordered, mutually exclusive
classifier (`rehab`, `transfer`, `activate`, `il`, `dfa`, `select`, `recall`,
`option`, `trade`, `claim`, `release`, `sign`, `suspend`, first match wins). The
order is what makes an equality test meaningful — an activation *from* the IL has
to read `activate` rather than `il`, or a man placed on the IL in the morning and
a man activated off it would collapse into each other.

**RotoWire's row wins and MLB's is dropped**, which the sample settles rather
than taste: on every pair inspected RotoWire's note carries everything MLB's does
— the stint length, the club, the body part — with the reporting attached
(*"began a rehab assignment with Triple-A Durham on Sunday, walking three and
giving up a three-run homer"* against *"sent LHP Garrett Cleavinger on a rehab
assignment to Durham Bulls"*) and a headline a reader can scan. Measured over a
random 60-player sample of the 2026 season (401 notes, 266 deduped transactions):
**76 same-day same-class pairs, every one a genuine restatement on inspection**,
and **28 same-day different-class pairs all correctly kept** — a trade and an
option on one afternoon, a Triple-A club activating a man his major-league club
optioned. With no RotoWire notes the whole transaction list survives untouched,
which is what makes the collapse safe when the scrape fails.

**Each source is fetched in its own `try` and each failure costs its own half** —
a dead RotoWire page leaves the transactions standing and vice versa, and the
route answers `{ items: [] }` rather than 502ing a page whose other seven tabs
are already drawn.

**Bundle: 466.09 → 466.18 KB of JS** (138.60 → 138.62 gzipped) and **CSS
unchanged at 106.85** (19.09) — 90 bytes raw and 20 over the wire, and the
components themselves came in *smaller* than they went out (466.03 before the
how-to page's own paragraph about the section was rewritten): an ESPN kind table
and a per-player name lookup are more code than a one-line `prettyKind` and a
scrape that lives on the server.

**Measured against the live 2026 season.** Blake Snell reads as a genuine injury
narrative and reads it in RotoWire's own voice: `Strikes out 10 in return` over
`Activated from IL ahead of start` over `Making return Tuesday` (Aug 7, pill
`ELBOW`) over `Ready to make next start in majors`, then MLB's `sent LHP Blake
Snell on a rehab assignment to Oklahoma City Comets` — **15 items, 4.5KB**, with
MLB's own activation row collapsed into RotoWire's second note. **1,192ms
genuinely cold** (no blob, fresh process), **638ms from the blob in a fresh
process**, **610ms with the index warm**, **0.8ms on a cache hit**. Driven in a
browser at **1200×900 and 390×844**: the Overview's three-row preview and the
News tab's fifteen rows both draw, 7 rows are presses and 8 are static, the page
body and the overlay each overflow by **0** at both widths, and with the response
stubbed to `{ items: [] }` the tab draws its empty state and the Overview draws
its one line.

### The Stats tab: the board, transposed

**The tab used to be called Season and was one card of platoon splits.** It is
**Stats** now, and it leads with a table whose rows are the research board's own
five windows — `Season · Last 7 days · Last 15 days · Last 30 days · Last 60
days` — under the board's own columns for the player's kind.
`PlayerWindowTable.tsx` draws it; `/api/players/:playerId/windows` feeds it.

**The question is one the board already answered and could only answer six
hundred people at a time.** "How has he been going lately, against his season"
is a question about *one man*, and the only way to ask it of the board was to
tap through five window tabs and hold four of the answers in your head — on a
table of six hundred rows, having first found his. Transposed it is five rows,
read down, and the comparison the reader came for is the vertical one.

**Every number in it is the board's own, by construction rather than by care.**
The column definitions moved out of `ResearchTable.tsx` into
**`components/researchColumns.tsx`** — the `Column` type, the formatters, the
derived rates, the two boards' arrays, `DEFAULT_OFF` and the `cols=` helpers —
and both tables import them. A second copy of forty columns is exactly the drift
this codebase spends its comments avoiding: one file would gain a column or fix
a denominator and the other would go on printing the old answer, with nothing on
screen to say which was which. What did **not** move is anything about *reading*
the board — the sort, the filter builder, the position pills, the column picker
and the table itself are phrased in that vocabulary rather than part of it, and
they stayed. `ResearchTable` re-exports `defaultColumnKeys` / `toColumnKeys` /
`isDefaultColumns` so App's import is untouched: the *selection* is a board
setting, and the board is what App is configuring, even though the vocabulary
behind it now lives next door.

**Three of the board's columns are meaningless in this shape and are cut.**
`Opp` is the one column on the board that is about *this afternoon* rather than
about the window the rest of the row is drawn from — defensible where each row
is a different player and indefensible where every row is the same man, since it
would print the identical game five times; and what it says is on this very
page, the Overview tab being his day. `Ros%` and the five `Δ`*n*`d` trend
columns are facts about a *player* rather than about a span of his season, so
they would repeat down the column too — and all six are already under his name
in the page's own head, which is where a fact about the player belongs. The
**identity block** goes for the same reason one level up: the head has said the
headshot, the name, the club and the position once.

**It has the board's column picker now, and it is the board's own rather than
one that resembles it.** This paragraph used to read *"it shows the board's
default set rather than all forty-odd, and it has no column picker"*, on the
grounds that a picker is a board setting phrased as "which columns do I want
against six hundred names", with the board itself one tab strip away for anyone
who wants the long tail. Half of that is still exactly right and is why the two
selections are **saved apart** (below). The other half was wrong in the way an
argument from *where a control came from* usually is: the long tail is precisely
what a single player's page is read for. A reader on the board is scanning for
names and wants a legible width; a reader here has already chosen the man and is
asking one question about him, so `ISO`, `BABIP`, `Chase%` and `Sprint` are more
use over five spans of one player than over six hundred rows of everybody.
Refusing them cost this tab the one thing it can offer that the board cannot.

**So the picker moved rather than being copied.** `ColumnsDialog` and
`ColumnOrder` came out of `ResearchTable.tsx` into **`components/ColumnPicker.tsx`**
— the dialog shell, the order row and its whole press-and-press gesture, the
labeled runs of chips, the group All/None, the last-column guard and the reset —
and **the board reads the extracted version**, so there is one implementation and
not two that resemble each other. That is the same rule `researchColumns.tsx`
already applies to the vocabulary, and it matters more here than it looks: the
touch half of that gesture took three goes to get right (see **the columns can be
rearranged** above), and a second picker would have had to get it right twice and
then stay right twice. What each caller keeps is the **policy** — the picker
hands back a list of keys and the caller decides what to store — because that is
the half the two genuinely disagree about.

**The picker offers the vocabulary this table has, which is six columns short of
the board's.** `Opp`, `Ros%` and the five trend columns are cut from the
*picker* as well as from the table, which is the honest version of a rule that
used to be enforced by having no picker at all: the paragraph above says why five
identical cells down a column are not worth a column, and a chip that let them
back in would be that argument lost by default rather than answered. The three
families sit at the head of both boards' arrays and each owns its group heading
outright (`Today`, `Fantasy`), so cutting them leaves no orphaned run — the
picker opens on `Counting` and holds **40 chips against the board's 44** on the
batting side. Nothing else is withheld, and the default is unchanged: 23 columns
for a batter and 25 for a pitcher, which is exactly what the tab showed before it
had a picker, so nobody's tab changed shape on the day one arrived.

**Where the button goes**, which is a layout decision rather than a default:
a row of its own directly above the table (`.stats-tools`), in the slot the
caption used to hold.

Two other places were possible and both are wrong. The **pinned head**
(`.details-chrome`) is shared by all seven tabs and says *who is being read and
which reading of him*; a control belonging to one tab would either sit over the
percentile card doing nothing or make the pinned box change height as the reader
moved along the strip — and that height is measured at runtime and published as
`--details-chrome-h` for everything inside the overlay to clear, so a per-tab
control would move every scroll target on the page with it. A **second pinned
band** inside the tab is the same objection one level down: the overlay already
has one pinned box and a phone gives it 193px of 844. So it is the table's own
caption slot, scrolling with the tab — which is where the research board keeps
its count line for exactly this reason, that line being the table's caption
rather than a control over it.

**Right-aligned**, which is the one decision inside the row. The table bleeds to
the overlay's edges (`--table-bleed`) and this row keeps the gutters, so a
right-aligned button sits over the stat columns it governs while the left edge —
where the Span column and the reader's eye both start — stays clear; it is also
the order the board reads its own run of controls in, Columns last. It is
`ColumnsButton`, shared, so it carries the same glyph, the same `.active` fill
while the dialog is up, the same `.on` tint when the reader has a selection of
their own, the same count badge, and the same phone rule — below 640px it drops
its label to the icon and the badge, as the board's four disclosures do.

**And the space between the two buttons is the board's, because the row is now
folded onto the board's own run.** `.stats-tools` declared a bare
`display: flex` and its two placement rules and nothing else, so the pair sat
**edge to edge** — measured 0px at 1200 and at 390, labeled and icon-only
alike, `gap` computing `normal`. The number was never in doubt: the board puts
these same two controls beside each other in `.research-tools` at **8px**, and
every one of its five buttons is spaced by it (checked at both widths, all four
gaps 8.00). What was in doubt was where to write it, and writing `gap: 8px` here
would have been a second copy free to drift from the first the next time either
run moved.

So the selector is **folded onto `.research-tools`** — the stylesheet's standing
rule, the one that puts `.kind-switch` on `.view-switch`'s list and
`.settings-toggle` on `.sim-toggle`'s, so that two things which are the same
object cannot come to look like two. They are the same object by the test that
decides it: the same shared `ColumnsButton` and `RanksButton`, side by side,
spaced the same. The shared rule holds `display: flex`, `flex-wrap: wrap`,
`align-items: center` and the gap; what does **not** transfer is each row's
place in a layout, so `flex: none` is split out under `.research-tools` alone —
it is what makes that run travel whole inside a wrapping bar and it says nothing
in a caption row that is nobody's flex item — and the right alignment and the
8px below stay under `.stats-tools`, where the paragraph above argues for them.

**The board was checked for the same fault and has not got it**, which was worth
measuring rather than reading off the rule: 8.00px between all five of its
buttons at 1200 and at 390, chrome 161px and 207px, page overflow 0 — identical
before and after, the split of `flex: none` having changed nothing there.

**Measured before → after on Salvador Perez's Stats tab, at 1200×900 and
390×844.** The gap goes **0 → 8.00px** at both, and **the buttons do not
change size**: Columns 131.94 and Ranks 86.34 at 1200, Columns 69.14 and Ranks
41.00 at 390 (the icon-and-badge state, where Ranks is the bare glyph) — all
four byte-identical, with only Columns' left edge moving by the 8 (965.72 →
957.72 and 263.86 → 255.86). The row itself is **36.00px tall before and
after**, and the tab is still **one screen**: content height 900 at 1200 and 844
at 390, exactly the overlay's own client height in each, which is the number
the platoon card's departure bought and which this must not spend. Page body
overflow **0** and overlay overflow **0** at both widths, with Ranks off and on.
The table's invariants are untouched at both: rows **44.55px** (**58.55** with
Ranks on), the header row **36.00px**, the table 2340.20 / 1473.72px, and with
the pane scrolled to its far right the span column pinned at **0** and the
header row **1px** inside it, which is the border. A pitcher's tab reads the
same (Sale at 390: gap 8.00, row 44.55, header 36.00, span pinned at 0).

**Bundle: JS unchanged at 464.53 KB** (137.79 gzipped) and CSS **106.76 →
106.78** (19.06 → 19.07) — 20 bytes raw and 10 over the wire, the comments
arguing the fold being stripped by the minifier.

**And the line of text above the table is gone.** It read *"The research board's
own columns, one row per span"*, which named the page the columns came *from*
rather than saying anything about the table under it: the spans are written out
in the first column and the columns are the app's own, so it told a reader what
they were already looking at. The row it occupied is the row the control now
uses, so the tab is exactly as tall as it was — measured below.

**Sorting is a click on any header, and what it means here is not what it means
on the board.** A leaderboard has no order until you pick a column, which is why
the board opens on PA and why "no sort" is not a state anybody wants there. These
five rows *already have* an order, and it is time — so a sort on this table
**destroys** something unless the way back is as cheap as the way out.

Three answers were available. A **Reset** control beside the picker is a button
whose only job is to undo another control, on a tab with room for one row of
chrome. **Time order on a third click** of whichever header is sorted is
unguessable — nothing on screen says a third press means anything, and it makes
one header cycle through three states while every other has two. So the **span
column sorts like any other column**, and time order is what sorting by it *is*:
ascending, the board's own `Season · 7d · 15d · 30d · 60d`, which the table opens
on with the ▲ showing. The way back is a press on the leftmost header, in the
grammar the reader has just used to leave it, and the state the table starts in
is visibly a sort rather than the absence of one.

It sorts on the row's **position in the server's list** rather than on a number
of days, because `season` is not a number of days and would have to be
special-cased into one (0 sorts it first, ∞ last, and both are a claim about a
span that has no length). Descending is then `60d → season`, the other order
these rows can honestly be read in.

Everything else is the board's rule, read off the same `Column`: **`ascFirst`**
is honored per column, so ERA, WHIP and a batter's K open on their good end
(checked: one press of `ERA` gives ▲ and `2.01 · 2.16 · 2.20 · 2.25 · 4.50`,
where `K` gives ▼); the ▲▼ span is `.research-arrow`, reserved in **both** axes
whether or not its column is the sorted one, so pressing a header moves nothing;
and `aria-sort` names the one sorted column. **Nulls sort to the bottom in both
directions**, which on this table is the whole row rather than a cell — a span he
did not appear on has no value in any column, and it keeps its place among the
other absent spans. Checked on Cody Bellinger, who has no 7d or 15d row: `OPS`
descending reads `30d · Season · 60d · [7d] · [15d]` and ascending
`60d · Season · 30d · [7d] · [15d]`, the two sentences last both ways.

**A hidden column must not leave the table ordered by it**, the same trap the
board's `activeSortKey` exists for and worse here, since there would be no header
left to press. It falls back to the span, which is to say to time order.

**A window he does not appear on is absent, not zero**, and the server sends
`row: null` rather than a zeroed row for it. The cell spans the stat columns and
says `No games in this span` (`No outings` on a pitcher), because twenty
em-dashes say "absent" far less clearly than one sentence does — and a row of
noughts would say the opposite of the truth, claiming he played and did nothing.
Checked on Matt Brash (IL15, 20 G on the season, nothing inside 60 days): the
season row reads in full and all four windows carry the sentence.

**The platoon card has left this tab and become the one beside it**, and the
paragraph that used to stand here is worth keeping in outline because half of it
is still the argument for the *split existing at all*. It read: *the two are cuts
of one season along different axes and neither can stand in for the other — the
board's rows are cut by time, and MLB publishes no handedness split of them, nor
does Savant, so a split has no Statcast half either*; and it explained why
mapping a `SeasonStats` onto a `ResearchRow` to make two more rows of this table
is worse than it looks (it would carry avg/obp/slg/ops/hr/rbi/ab, dash the other
sixteen columns, and have to dash R and SB as well, MLB's platoon splits
returning both as **0 for every player**). All of that stands. What does not is
the conclusion — that a card with its own vocabulary therefore belongs *under*
this table. Two cuts of one season along two axes are two questions, and the
second one is not read the way the first is: nobody comes to a platoon split for
a stat line, they come to learn whether a hitter is a different hitter against
lefties, which is a **comparison** rather than a table. So it is its own tab and
its own drawing — see **The Splits tab** below.

**What this tab lost by it is height, and that is the measurement.** Content
height of the Stats tab, before → after, with the same player on the same day:
**921 → 900px at 1200** and **1,299 → 900 at 390** on a batter, **1,053 → 900**
on a pitcher at 1200 — i.e. the overlay's own scroller had 21, 399 and 153px of
range and now has **0 at every one of them**. The tab is one screen, which is
what a table of five rows should have been all along; the 399 is the number that
matters, a phone reader having had to scroll past a card to be sure the table
was the whole of it.

**The table rides on the game log's chrome rather than on a copy of it.**
`.stats-scroll` and `.stats-table` are folded into `.glog-scroll` / `.glog-table`'s
selector lists — one set of paddings, one gutter clamp, one zebra stripe, one
`--table-bleed`, one pinned left column (`.glog-date`, here holding the span) —
because the two are the same object: a wide stat table with a sticky first
column, inside the player overlay, read across rather than picked. What it adds
under its own name is three rules: `text-transform: none` on the headers (these
are the board's labels, and the board switched uppercase off for exactly this
reason — right for AVG, wrong for xwOBA and Brl%), a 96px floor and left
alignment on the span column, and the muted "no games" cell. Plus
`.stats-tools`, which keeps the overlay's gutters where the table gives them
back, the way the board's count line sits inside the app's while the board
bleeds past them — two declarations now, that row's flex layout and the 8px
between its buttons having been folded onto the board's own `.research-tools`
(above) — and one rule for the span column's **sort button**, which is
left-aligned and therefore puts the arrow's reserved box *after* the label. That
is the board's own rule read from the other end: it leads there precisely so the
label's right edge lines up with the right-aligned numbers, and at this end of
the cell it trails so the label's left edge lines up with the spans.

**The board's sort-header rules are folded onto `.stats-table` rather than
copied**, which took one variable. `.research-table th.research-sort button`
zeroes the `th`'s padding and re-applies the gutter the cells use — the board's
`--research-gutter` — and this table's gutter is a different clamp, so the shared
rule reads **`--sort-gutter`** and each table declares its own (`.research-table`
its `--research-gutter`, `.stats-table` the `--row-gutter` the cell padding above
was already using, named here so the clamp is written once rather than twice).
`--research-head-line` is declared on both for the reason it was declared at all:
the reservation that stops a header changing height when it is sorted is a
function of whichever installed face claims U+25B2, and 15px is that face's own
line written down.

**The span is written out where the board's tabs abbreviate.** `Season · 7d ·
15d · 30d · 60d` is right for eleven pills sharing a phone's width in a row that
already scrolls; here they are five labels read *down* a column that holds
nothing else, so the width is free — and `7d` beside a batting average could as
easily be a stat as a span.

**Lazy on first open**, like the Game Log, Arsenal and Charts tabs and keyed by
kind as well as player, since a two-way player's bat and his arm are two boards.
The splits fetch beside it stays eager, as it always was.

**Measured in a browser at 1200×900 and 390×844, on a batter and a pitcher.**
The table is **1818px (batter) / 1973px (pitcher)** at 1200 and **1080 / 1177**
at 390, in a scrollport of the window's width, and the **page body overflows by
0 at both widths on both kinds** — the overlay's own scroller still scrolls
(455px of range on the batter at 390, 719 on the pitcher) and `--table-bleed`
puts the pane at **0 from both edges**. The span column pins at **0** from the
scrollport's left edge with the table scrolled to its far right, on all four.
Rows are **44.55px**, which is the game log's own row less its headshot — this
table has none. The header reads `Span · G · PA · H/AB · R · 2B · 3B · HR · RBI
· BB · K · SB · AVG · OBP · SLG · OPS · BB% · K% · xBA · xSLG · xwOBA · EV ·
Brl% · HH%` on a batter and `Span · G · GS · IP · W · L · SVHD · H · ER · HR ·
BB · K · ERA · xERA · FIP · xFIP · WHIP · K/9 · BB/9 · K% · BB% · xwOBA · EV ·
Brl% · HH% · Whiff%` on a pitcher — the board's default set less the three cuts,
in the board's own order. Spot-checked against the boards themselves: Salvador
Perez reads `113 G · 473 PA · 94/436 · .216` on the season row and `6 G · 24 PA
· 5/21 · .238` on 7d; Chris Sale `21 G · 123.0 IP · 2.20 ERA` and `1 G · 6.0 IP`.

**What the picker and the sort cost the table, re-measured on the same players
the same afternoon, before → after.** The table widens by the arrow's
reservation on every header — 8px and a 3px gap, on columns whose own numbers
were often already wider than the label: **1818.39 → 1944.73 at 1200** and
**1079.95 → 1201.38 at 390** on the batter, **1972.75 → 2124.56** and **1177.45
→ 1319.64** on the pitcher, which is 121–152px on a pane that scrolls sideways
at every width there is. The **header row gets shorter**, 37.84 → **36.00**,
because the sort button's 10px of padding replaces the header cell's 11 — the
same two-pixel discount the board's own sort headers take, and for the same
reason: a header is one short line where a body row is not. Row height is
**44.55px** either way, the page body and the overlay each overflow by **0** at
both widths on both kinds, and the span column still pins at **0** with the pane
scrolled to its far right (header row 1px inside it, which is the border).

**And the tab is still one screen**, which is the number the platoon card's
departure bought and this must not spend: content height **900px at 1200 and
844 at 390** on both kinds, before and after — the caption's row and the
button's row are the same row.

**Driven in a browser for every state the two controls have.** The picker opens
at `z-index` **51** (the overlay's 50 plus one, `DialogLayerContext`'s ladder
doing its job with nothing written inline), titled `Columns`, holding
`Order · Counting · Slash line · Rates · Statcast` and no `Fantasy` or `Today`,
40 chips over 23 order chips, 720px wide at 1200 and **358 at 390 with a
scroller of its own** (626px of picker in 620). Ticking `ISO` puts it beside
`SLG` and takes the badge to 24; unticking `SB` takes it to 22 and the column
off the table. **Escape undoes one thing**: the first press closes the picker
and leaves the player page, the second closes the page. On a **touch** device at
390 the press-and-press reorder works across rows — `PA` picked up from row one
and dropped on `K` in row two moves it in the chips *and* in the table's header
— the hint line reads `Moving PA — press a column to drop it there, or Esc to
cancel`, and a vertical flick from the middle of a chip scrolls the picker and
reorders nothing (`touch-action` computing `auto` on the chip and the grip
alike, which is the fix that passage records).

### The percentile badges, and the population a one-player page hasn't got

**`Ranks` sits beside `Columns` in the caption row and draws the board's own
percentile under every value** — the same toggle, the same badge and the same
saved preference the research board reads, because the two are one column
vocabulary and this is a habit of reading rather than a setting on either table.
The whole of the rule — 0–100 with 100 always the good end, `ascFirst` read back
for orientation, nulls out of the denominator and unbadged, the four profile
columns and the Fantasy group left out for having no good end, the dashed credit
cells left out for having no value on screen, **the scale built from the
qualified players and a dashed ring on anyone outside them** — is
`components/columnRanks.tsx` and is argued under **the research board**. What is this tab's own is where the
population comes from.

**A percentile needs a population and this tab has none**: it is one player's
five rows off `/api/players/:id/windows`, which is five boards reduced to one row
each. Three ways out were weighed.

- **Rank on the server** and ship a number per cell. Much the cheapest, and it
  fails the one-definition test outright: better than half the board's columns
  are *derived* in `Column.value` and exist nowhere on `ResearchRow` — BB%,
  K-BB%, ISO, PA/HR, SB%, K/BB, SVHD, Str%. Ranking them server-side means
  writing every one of those denominators a second time, in a workspace that
  cannot import the first, and then hoping the two stay level; and it would
  silently leave those columns unbadged the day somebody forgot one, on a table
  where nothing on screen could say which columns had been forgotten.
- **Ship a compressed distribution** — a numeric projection of each board, or
  quantiles of it — and rank in the client. It halves the payload (measured:
  **120KB gzipped against 276KB** for a batter's five windows) and buys that with
  a hand-written list of which fields a column reads. Add a column tomorrow that
  reads a field the projection does not carry and this tab ranks the whole league
  as null while the board ranks it fine — a silent wrong answer, which is the one
  failure this app most avoids.
- **Read the five boards**, which is what it does: the same `/api/research` the
  research view reads, through the same per-kind, per-window cache App already
  keeps for it (`loadRankPopulations`), fetched only when the toggle is on *and*
  the Stats tab is mounted. The rows are then literally the rows the board ranks,
  `boardPopulation` cuts them to the same trade, and `rankScales` is the same
  function — so the two surfaces agree **by construction** rather than by
  measurement. It is the argument `getPlayerWindows` already makes for going
  through `getResearch` rather than around it.

**What it costs is bytes and nothing else.** The boards are cached six hours on
the server and pulled warm nightly by the warmer, so no upstream is touched, and
the client cache is keyed by kind and window rather than by player — twenty
player pages in one tab pay for it once, and a reader who has used the research
board has already paid for part of it. Measured, gzipped: **276KB for a batter's
five windows and 381KB for a pitcher's** (76 / 40 / 46 / 53 / 61 and 115 / 46 /
59 / 72 / 89). Against the page it sits on that is about three board loads, once
per kind per tab, and only for a reader who asked for the badges. **A window
whose board has not landed simply has no badges yet**, which is the app's own
loading rule — never a wait over data, nothing blanks while a read is in flight —
and they arrive a window at a time.

**The population is that board's *qualified* players**, which is where this tab
inherits a change rather than making one: `rankScales` is the board's own
function and it now builds each scale from the rows where `ResearchRow.qualified`
is true — Savant's bar for the span, 2.1 plate appearances per team game or 1.25
batters faced. A row short of it is still drawn, still badged and marked with a
dashed ring; see **the research board** for the whole argument, including why
that ring is the percentile card's mark arriving on a second surface rather than
a second meaning for a broken border.

**That makes this tab the one place the per-span qualifier is visible as such**,
because it draws five spans of one man at once and he can be on either side of
the bar in different ones. Driven on the live app, Nick Gonzales — a season
regular at 494 PA — reads Season `xwOBA .325 → 56`, 15-day `.389 → 91`, 30-day
`.331 → 68` and 60-day `.317 → 54` with no ring, and **his 7-day row rings every
badge on it**: 11 plate appearances against that window's bar of 13, so his
`.522 → 99` is a placement on the qualified players' scale rather than a standing
among them, and the row says so where a bare 99 would not. Yordan Alvarez, 23 PA
over the same week, clears it and draws none. Rows are **58.55px either way** —
the ring is an `outline`, so it costs no height and no width.

**Each row is ranked within its own span's board**, keyed by window, which is the
only comparison that means anything: a seven-day line against the season board
would rank every player last on every counting column. Checked against an
independent computation over the same blobs — Perez's 30-day `HR 5 → 92`, `OPS
.784 → 70`, `K% 18.2% → 71`, `xwOBA .335 → 76` (population 482), and Sale's
7-day `ERA 4.50 → 35`, `K 8 → 92`, `FIP 1.48 → 90`, `IP 6.0 → 83` (population
415) — all exact. And the badge's tooltip names the span it used: `Games pitched:
56th percentile of the 354 qualified pitchers with a figure on the Season
board.`, and on a ringed badge one sentence more, naming the bar he is short of
and what the ring means

**The board and this tab show the same number for the same player, window and
column**, which is the test the design was arranged around. Driven back to back
on the same afternoon: Perez's Season row here reads `G 113 → 85`, `PA 473 → 88`,
`HR 16 → 87`, `AVG .216 → 35`, `OPS .631 → 36`, `BB% 3.8% → 16`, `K% 19.9% → 68`,
`xwOBA .297 → 46`, `Brl% 9.5% → 71`, and the board's row for him reads the same
nine; Sale's reads `G 21 → 56`, `GS 21 → 91`, `IP 123.0 → 93`, `W 12 → 99`,
`L 7 → 9`, `K 151 → 98`, `ERA 2.20 → 90`, `FIP 2.47 → 95`, `WHIP 1.02 → 89`,
`xwOBA .274 → 85`, `Whiff% 30.7% → 86`, and so does the board's.

**Measured badges off → on, at 1200×900 and 390×844, on a batter, a starting
pitcher and one with three empty windows.** The table is **byte-identical in
width** in every case — 2340.20 / 1473.72 (batter), 2124.56 / 1319.64 (pitcher),
2109.67 / 1304.75 (the absent case) — because the badge is never wider than the
value above it on this table. What it costs is **row height, 44.55 → 58.55px**,
which is the one place this tab pays where the board does not: its rows are the
game log's 13px padding rather than a 42px headshot's 58, so there is no slack
for a second line to spend. Five rows is 70px of a tab that already fits one
screen. The header row is **36.00px** either way, the span column pins at **0**
with the pane scrolled to its far right and the header row at **1px**, and the
page body and the overlay each overflow by **0** at both widths in both states.
**A window he did not appear on still draws its sentence** — the absent-case
pitcher reads `No outings in this span` on three rows with the badges on exactly
as with them off, and the two rows he does have carry 47 badges between them.

**The selection is saved, and saved apart from the board's.** It is
`UserPrefs.statsColumns`, per kind, written by `PUT /api/prefs/stats-columns` on
the same 600ms debounce and the same "absent means the defaults" rule as the
board's, and held in App (`statsCols`) rather than in `PlayerDetails`, which is
unmounted every time the overlay closes and would make the preference a per-open
thing.

**One entry could have served both and must not**, which is the decision worth
recording. The economy is real — one vocabulary, one picker, and a reader who
wants xwOBA probably wants it in both places — and it loses to a fact about the
two tables: they do not have the same columns to offer. A write from this tab
carries a list with `Opp`, `Ros%` and the five trend columns *absent*, so a
shared entry would let a tick on a player page **silently drop six columns from
the board's saved set** — precisely the hazard `ColumnPicker`'s reorder threads
around inside one table, arriving between two. They are also read for different
things, which is the same observation the first paragraph of this section makes
from the other side. So: two entries, one shared `setColumnPrefs` on the server
so the two cannot come to disagree about what "back to the defaults" stores, and
`toStatsColumnKeys` narrowing on the way in exactly as `toColumnKeys` does — a
key this table hasn't got is dropped, and a list with nothing left falls back to
the defaults rather than to an empty table.

**And it is deliberately not in the URL.** `cols=` names the board that `pos=`
selects, and a second meaning on it would be two tables reading one parameter
with nothing to say which; the open player-page tab is in no URL either, so
there is no link that could carry this and mean anything. Checked end to end
against the running server: ticking `ISO` and unticking `SB` writes
`statsColumns.batter` with 22 keys, a reload draws those 22, and a reset stores
no entry at all.

**Bundle: 448.23 → 451.11 KB of JS** (132.72 → 133.50 gzipped) and **102.05 →
102.54 KB of CSS** (18.20 → 18.30 gzipped) — 2.9KB and 0.5KB raw, 0.8KB and
0.1KB over the wire, for a sort, a saved preference, a route and a picker
*extraction* that left the board with less code than it had.

### The Stats tab cuts every span four ways

**The five spans are one axis and this is the second.** The tab has always
answered "how has he been going lately, against his season"; it now answers "and
is he a different player against left-handers, or on the road" over the same
five spans, from a row of pills at the head of the caption row —
`All · vs RHP · vs LHP · Home · Away`, and `vs RHB · vs LHB` on a pitcher, the
cut being **the other man's hand** as a platoon split always is. One value on
the wire and in the URL (`vsr`, `vsl`), two labels, so a link means the same
thing whichever page it was made on.

**`cut=` is in the URL, where `cols=` deliberately is not**, and the line
between them is the one `RULES.md` draws: `cols=` is *how* a table is read and
this is **which data it shows** — five rows of one man against left-handers are
not the same five rows. It is scoped to `player=`, the page that draws it, for
the reason `mt=` is scoped to `mup=`; it is put away when the player page
closes, a cut being a question about *this* man, and kept when another player's
page opens **over** it, which is the rule that paragraph already states about
`player=`. Held in App rather than in `PlayerDetails`, which is unmounted every
time the overlay closes.

#### None of the cheap routes work, and the dead ends are worth recording

**MLB publishes exactly these four splits and will not date-range them.**
`statSplits` with `sitCodes=[vr,vl,h,a]` is exact, populated and league-wide
(checked: 623 batters carry a `vl` row), and it takes `startDate`/`endDate` in
either spelling, returns **200**, and ignores them — Soto's `vl` line reads
`120 PA / .276` for `2026-07-20 → 2026-08-20` exactly as it does for the season,
because it *is* the season. `stats=byDateRange&sitCodes=…` is the same dead end
from the other side: it honors the dates and drops the split, handing back the
overall line once per code with an empty `split` object. This is the
`pull_air_rate` failure wearing a date, and it is why the tab could not simply
ask for what it wanted.

**Savant publishes no windowed leaderboard at all** (`statcastWindow.ts` records
that), and its per-day exports carry no counting stats — they are pitches, where
`H`, `AB` and `AVG` come off MLB. **And five more boards per cut is not a
route**: the board is a league-wide season of pitch rows, so four cuts of five
windows is twenty of them.

#### So a cut is his own season of pitches, and it reconciles exactly

`statcast_search/csv` filtered to **one player** takes the whole season in a
single request (`batters_lookup[]` / `pitchers_lookup[]`), and every row of it
carries `game_date`, `p_throws`, `stand`, `inning_topbot` and `events` — so all
four cuts of all five spans fall out of one fetch by filtering, and the Statcast
half is `tally` and `toStatcast`, **imported from `statcastWindow.ts` rather
than rewritten**, so a cut of a span and the span itself are the same arithmetic
over the same rows. Measured: a batter's season is **1,472 rows / 985KB in
3.8s** (Soto), a starter's **2,077 / 1.4MB in 4.4s** (Sale) — far under the
25,000-row cap that rules this export out league-wide. Twenty rows are cached
per player for six hours, not the megabyte, and all four cuts come from the one
fetch: pressing `vs LHP` and then `Home` is one request, not two.

**The counting half is computed here, so it owes a check against the source that
publishes it.** Against MLB's own `statSplits` for 2026, byte for byte: Soto vs
L `120 PA / .276 / .809`, vs R `239 / .287 / 1.021`, home `169 / .331 / 1.077`,
away `190 / .242 / .833` — all four identical; Sale home `11 G / 262 BF / 52 H /
74 K`, away `11 / 255 / 51 / 86`, vs L `127 BF / .248`, vs R `390 / .206` — all
four identical **once `truncated_pa` is excluded**, which was the single
discrepancy in the whole exercise: a plate appearance ended by the third out on
the bases, which Statcast files as an event and MLB does not count as a batter
faced. And the sums close in the browser on every span, which is the check that
matters most on a table of five rows: Elly De La Cruz's `vsR + vsL` and
`home + away` are **487 / 34 / 65 / 125 / 230** — his season, 7-, 15-, 30- and
60-day PA off the uncut table — on both axes, with hits `73 + 38 = 111` and home
runs `12 + 8 = 20`. The split is a real one: `.330 / 1.040` against left-handers
against `.233 / .726` against right.

#### What a cut cannot carry, and what an empty cell draws

A pitch row knows what happened *in the plate appearance*. It does not know who
scored, who stole, or which runs were earned, so **R, RBI, SB and pull-air on a
batter, and IP, ER, ERA, W, L, SVHD, FIP, xFIP, WHIP, K/9 and BB/9 on a
pitcher, are null on a cut row** — and the client dashes them exactly as it
dashes `sprintSpeed` and `xERA` on a window row, which is the precedent this
follows rather than a new rule. Measured on Sale's `vs LHB`: **14 of 28 columns
dash**, which is the honest shape of the answer and not a fault; the reader can
hide them with the picker that is already there.

**Innings were probed and rejected, and the negative result is the point.**
Mapping `events` to outs gets Sale to **384 outs / 128.0 IP** against MLB's
**129.0** across the season (home 65.0 against 65.1, away 63.0 against 63.2):
three outs a season short, every one of them a runner caught on the bases during
a plate appearance, which the export records in `des` and nowhere a parser can
trust. Three outs is 0.8% and it is still a wrong number, and a wrong ERA is
worse than no ERA.

**A cut row always carries the count it was cut from**, whatever the reader's
saved columns say — `PA` on a batter, `BF` on a pitcher, inserted after `G` and
gone again with the cut. This is the one place this table adds a column of its
own and the sample size is what earns it: a week cut by hand is a handful of
plate appearances, and on a pitcher the column that normally says how much of a
season a row is — `IP` — is one a cut cannot carry at all. Without it Sale's
7-day `vs LHB` row reads `1 G · 2 H · 1 K` and a `.405 xwOBA` with nothing
anywhere to say it is **three batters**; with it, the 127 / 3 / 13 / 20 / 44 down
the `BF` column is the first thing the eye lands on. The saved selection is
untouched, which is why the picker still reads the reader's own list.

**And a span he has nothing in draws its sentence with the cut in it** —
`No away games in this span`, not `No games in this span`, because an empty
state names its own cause and the lit pill directly above it is the control that
caused it. This case is uncommon on the uncut table and **common here**: checked
on Elly at 390×844, `Away` empties his 7-day row outright, and on Soto — out
since 24 July — a `vs LHP` cut leaves four of the five spans empty and the
season row reading in full.

#### The percentile badges go off, and say why

`Ranks` is **off and inert under a cut**, with the reason on the control:
*"No percentiles under a cut — the badges are the research board's own, and
there is no board of everybody's line vs LHP. Press All to bring them back."*
The badges here have always been the board's own scale over the board's own
qualified population, which is what makes the number on this tab and the number
on the board the same number; there is no board of everybody's line against
left-handers, and the three ways of pretending otherwise are all worse than
saying so. Ranking a cut against the **uncut** board is a wrong answer wearing a
right one's clothes — a .380 against lefties would read as a 96th percentile it
was never measured for. Ranking against a population of one is not a rank. And
leaving the badges the uncut table last drew would be yesterday's answer under
today's numbers.

`ResearchRow.qualified` is `false` on every cut row for the same reason and
**nothing reads it**: Savant's bar is 2.1 plate appearances per team game over a
whole span, which is a statement about the span and not about a quarter of it.
The dashed qualification ring therefore cannot misfire under a cut — there are no
badges for it to be drawn on — and it comes back correct the moment `All` is
pressed. Measured at 1200×900 on Elly: **125 badges** with `All` and ranks on,
**0** under `vs LHP` with the button disabled, and **125** again on returning to
`All`, the saved preference never having been written to.

#### What the row costs, measured

The pills go in `.stats-tools`, at the head of the row the two disclosures end —
they change *which numbers* are in the table where those two change how it is
read, so they lead and the pair follows, which is the order the board reads its
own run of controls in. `.split-switch` / `.split-tab` are the pitcher card's
own pills, **folded on rather than restyled**: a segmented row picking one cut
of one player's line is the same object in both places. What the row adds under
its own name is the `auto` margin that pushes the pair to the far end and the
9px bottom margin killed, this being a row that centers its items.

Measured before → after at three widths, with the same player on the same
afternoon. At **1200** the row is **36.00px** either way — the pills fit beside
the two buttons, and the tab is still **one screen** (content height 900 in a
900px overlay). At **390** it goes **36 → 74**, the pills wrapping to a line of
their own, and at **320** **36 → 88**; the tab is still one screen at both
(content 844 in 844). The table's invariants are untouched at every width: rows
**44.55px** (**58.55** with ranks on), the span column pinned at **0** with the
pane scrolled to its far right, and the page body overflowing by **0**.

**The `Updating` badge is laid out whether or not it is showing**, which is
*reserve the box, don't move the page* on a row that wraps: a badge arriving with
the read would re-flow the two buttons under the finger that had just pressed a
pill. `visibility` rather than a conditional render, so the box reserved is the
badge's own width off a font this app does not choose and not a number written
down. Measured: the Columns button's box is **byte-identical** across a cut
change at 1200 (left 957.05), at 390 (255.19, 254) and at 320 (185.19, 322), and
the badge's own reserved width is **106.16px**.

**Never a wait over data.** The first open of the tab has no rows and gets the
block wait behind `WAIT_DELAY`; a *cut* is a re-read of a table already on
screen, so the rows stand while the next answer is in flight and the badge is
the only mark. The read carries **two guards that answer different questions**:
the ref that every lazy read on this page has, keyed to what was asked for
(`kind-id-cut`) so a different question re-asks and the same one does not — and
a **sequence number**, because a cut is a control a reader presses twice in three
seconds and a slow `vs LHP` returning after a fast `Home` would otherwise write
the wrong five rows under a lit pill. Neither is a cleanup flag, which is the
hang recorded one tab over.

### A game still being played reads `Live`, and has no W to show

**The result chip claimed a win for a game in the second inning, and the branch that should have caught it had never once been drawn.** `Opponent` printed `W`/`L` on `g.win !== null`, and the comment above it already described the right behavior — *"a game with no result yet (in progress, suspended) still shows the score it's reached, uncolored — there's no W or L to claim"* — so nothing in the client needed inventing. The field it tested was simply never null: MLB fills the game-log split's `isWin` **while the game is being played**, where it means *whose side is ahead right now*. Measured on 2026-08-19 with the page open at 1200×900: Kyle Schwarber's top row read a green **`W 1-0`**, title *"His team won 1-0"*, while Philadelphia were batting in the **second inning** of gamePk 823424; the same row now reads **`Live 1-0`**, title *"In Progress — 1-0 so far"*. The gate is on the server (see **Server**, the gamelog route) because that is where the postponed-is-`Final` trap is already read; the client's job is only to say which state it has.

**Live is the app's live green, and the word is what keeps it apart from the `W`'s.** `--hit` is the color the summary table's opponent cell gives a live inning and the schedule grid gives a live game, so it is the color this chip owes a live game too — but in *this* chip `--hit` is also the color of a win, which is the one place in the app where the app's live green would collide with a second meaning. Two things separate them and both are needed: the chip says the word `Live` rather than leading with a letter, and it takes `.game-status.live`'s **ring** (a 10% ground inside a 50% border) against `.glog-res-w`'s flat 16% tint and no border. A bare green `5-5` in a column of `W 5-3`s, which was the first cut, is exactly the chip a reader would take for a win with the letter clipped.

**The ring is why every chip in the column now declares `border: 1px solid transparent`.** Measured before it did: the ringed chip is 16px tall and the flat ones 14, so the column's pills sat two pixels apart depending on which state a game happened to be in — *reserve the box, don't move the page*, on a table whose row height is a documented **44.55px** and is unchanged by any of this (checked at 1200×900: 44.55 before, 44.55 after).

**A suspension is amber and a delay is not.** `stateOf` files a suspended game under `postponed` — deliberately, neither being a game whose result can be read — so the chip takes the amber (`--hr`) that the summary table's postponed cell and the board's `PPD` already spend on that state, and reads `Susp 9-4` off the wire label `Suspended: Rain`. A **delay** is a live game with nobody playing and stays green, reading `Delayed`; MLB's other live labels (`Warmup`, `Manager challenge`) all collapse to `Live`, which is the app's word for the state and two characters where `In Progress` is eleven, in a cell that also holds the opponent and the score. The full MLB label rides the chip's `title` in every case. **`PPD` is kept as the fallback and will never be drawn**: a log row exists only where the player has a line, and nobody played a postponed game — it is there so the branch cannot silently print nothing.

**Verified against real games and, for the two states MLB had none of, against forced ones.** Live: Schwarber (batter, `Live 1-0`) and the Diamondbacks' starter in gamePk 824722 (pitcher, `Live 5-5`), both on the Game Log tab and on the Overview tab's five-game preview, which draws the same `GameLogTable` and so took the fix without being touched. Suspended and delayed have no live example to point a browser at — **0 games carry either status across the 2022, 2024, 2025 and 2026 regular seasons as MLB serves them today**, a suspension being resolved to `Final` or `Completed Early` once it resumes — so those two were driven by forcing the state on two of Jarren Duran's rows in the running server: `Susp 9-4` in amber and `Delayed 3-8` in green, rendered and read back, and the forcing reverted. Light theme checked with the same read: the chip's green is `rgb(24, 97, 22)` there against `rgb(134, 207, 134)` in dark, both off `--hit`, since nothing here writes a color that is not a token.

**Bundle: 583.27 → 583.56 KB of JS** (173.94 → 174.04 gzipped) and **156.57 → 156.90 KB of CSS** (28.03 → 28.07 gzipped) — 0.29KB and 0.33KB raw, 0.1KB and 0.04KB over the wire.

### The Game Log grows on scroll, and its `Load more` button is gone

**It had a button and the board had a mechanism, and they are the same
mechanism now.** The log drew 25 rows under a `Load more · 125 earlier games`;
it draws **20** and grows as the reader reaches the foot of the pane, on the
research board's own paging — extracted to `components/paging.tsx` and read by
both, so there is one implementation rather than two that agree today. That is
the rule `researchColumns.tsx` and `ColumnPicker.tsx` already apply to this
tab's vocabulary and its picker, applied to the third thing the two tables
share. What each caller keeps is the **page size**, which is genuinely theirs.

**The board's own paragraph drew a contrast that has not survived it.** It said
a leaderboard has no end worth stopping at where the feed and the game log are
*lists* whose end is a real place, so a button that says how many are left hands
the reader a choice. The first half stands. The second turned out to be false of
a season: nobody reading down a log stops at row 25 to consider whether they
would like row 26, and the button was a control asking permission to carry on
doing the one thing the tab is for. (The **feed** keeps its button, and keeps
the argument with it — its items are cards with clips in them, an item is read
rather than scanned, and the count on the button is a real number about a real
end.)

**Twenty rather than the board's fifty**, and the difference is what a row
costs. A board row is a headshot, an identity block, three marks and up to 44
cells; a log row is fourteen numbers and a date. The constraint fifty answers on
the board — one page must overfill the pane, or growing chains — is met here at
twenty: **20 × 44.55px = 891px** against the **674** a 900px window gives this
pane and the **564** a phone does. It is also the number this app already uses
for a list read down rather than scanned.

**The strip goes under the pane, not inside it**, which is the one thing this
drawing does differently from the board's. The log closes with a sticky
`<tfoot>` — the season totals, pinned to the bottom of the box — so a strip
inside the scroller would sit *behind* that row at every offset but the last:
a mark about the foot of the list that cannot be seen until the reader has
already reached it. Out here it is visible from the moment it exists. The
reservation rule is unchanged and is why it is laid out at all rather than
appearing with the mark: inside a scroller a box that came and went would take
its height out of `scrollHeight`, and out here it would resize the pane. It goes
for good on the last page. `.research-more` is `.page-more` now, one rule for
both tables, and `.glog-more`'s button rules went with the button.

**Measured at 1200×900 and 390×844 on a 109-game batter.** The tab opens on
**20** rows and grows **20 → 40 → 60 → 80 → 100 → 109**, one page per touch of
the foot, with `Loading more games` up for the beat each time. `scrollLeft` is
**untouched at 219 (1200) and 506 (390)** across every page, which is the wide
table's own rule — down is which games, across is which stat. The strip is
**44px** and sits directly under the pane (top 836 in a 900px window, 780 in an
844px one, so it is on screen), and it is **absent once all 109 are drawn**, the
pane growing back into its 44px. There are **0** `Load more` buttons anywhere on
the page, and the page body overflows by **0** at both widths.

**The count is this component's own, where the board keeps its in App**, and the
mirror of the board's reason is why. App restores a scroll offset per *view* and
this pane is not a view: the player page puts the overlay back to the top on
every tab change and unmounts the tab it left, so there is no remembered offset
for a remembered count to disagree with — which is the one way an auto-loader
can fight a scroll restore. Measured both ways: grown to **60** rows at
`scrollTop` 1,206, out to the Overview tab and back gives **20** rows at
`scrollTop` **0**, which is what an unmounted tab reopened is.

### The Game Log's rows open the game

**A press on a row of the Game Log opens that game** — for a **batter** as a feed, the same `PlayerDay` narrowed to the row's `gamePk` in the app's shared `Modal` (`PlayerDayModal`), and for a **pitcher** as the outing page itself, that box having had nothing of its own to say (see *A pitcher's game opens the outing, not a box in front of it* below, which is where the split is argued). The log is the season as the games it is made of, and until now a row was the end of the road: fourteen columns of what he did that night and no way to see any of it. A doubleheader is why either is keyed on the game rather than the date — two rows share one afternoon.

It **fetches its own day** rather than being handed one, because a row names a date the page above it knows nothing about; per open is right for an explicit action against a route every layer of which is already cached (a past date is a frozen day snapshot, one read). `GameLog` therefore gained `playerId` and `name`, which it had never needed while it only drew what it was given. The box takes `--card-column` for the same reason the tab does.

**The rows look pressable now, and the paragraph this replaces is worth keeping in outline.** They carried no hover tint for a long time and the argument was sound while it held: with a pointer the tint lit a row that is read *across* rather than picked, and on a touch device, where `:hover` sticks to whatever was last tapped, it left a band of `--panel-2` on some arbitrary game until something else was pressed — a selection the app then declined to act on. Both halves of that turned on the row **doing nothing**. It opens a game now, so the tint is the truth rather than a tease and `cursor: pointer` is the shape of the thing you can do. The old complaint survives its own cause in one respect, so the tint is scoped to **`(hover: hover)`**: a sticky hover on a phone is still a mark left on the last row pressed after its dialog has closed, and there the press itself is the affordance. The zebra stripe is untouched, being what keeps a fourteen-column row readable across.

**That scoping was written here first and is now the app's.** The same fault was reported against the feed's cards — *"the cards should not highlight when scrolling"* — and ten more pressable surfaces take the identical rule, with the line between a surface and a control drawn where it belongs: see **A card doesn't highlight when you scroll past it** in **Client**. Nothing about this table moved; it is the precedent the sweep generalised, and its `:focus-visible` background stays outside the query on purpose, a keyboard ring being wanted on every device.

A `<tr>` cannot hold a button without leaving table layout and the whole row is the target, so it takes **`role="button"`, `tabIndex={0}` and Enter/Space** (`GameLog.tsx::pressProps`, which `preventDefault`s Space so the press doesn't also scroll the pane under it); `:focus-visible` draws an inset accent rule top and bottom, inset because a row spans a scrollport that clips at both edges. Everything else about the table is untouched and was checked to be: the sticky header row and sticky date column, the `<tfoot>` season row, Load-more paging and the full-page expand button all behave as before, and a row press works from inside the expanded box as well as out of it.

### A pitcher's game opens the outing, not a box in front of it

**Two of the three routes into a pitcher's outing went through a popup that had
nothing of its own to say.** A Game Log row and the Overview tab's game card
both opened `PlayerDayModal`, and for a pitcher what that box held was a
**static** outing bar over the innings (`detailInline`) with a `Full breakdown`
button under them — a door to `OutingPage`, which holds those same innings under
a tab strip with the Line, the Opponent and the Arsenal beside it. So the reader
pressed twice, and the box in between was one bar and a subset of the page it
was standing in front of. Both routes now open the page.

**Measured before, at 1200×900**: a Game Log row gave a dialog at **51** holding
6 inning bars and 1 `Full breakdown`, and pressing that gave the page at **52** —
**two presses in, three Escapes out**. The Overview card was the same shape.
After: **one press**, the page at **51**, and Escape hands focus back to the row
and closes the page in one. Identical at 390×844.

**Batters keep the popup, and that is the whole line.** A batter's game is a
**feed** — four or five plate appearances, each with its clip and its pitch
sequence a press away — which is a list and belongs in a box; a pitcher's game is
**one outing**, which is a page. `useGameOpen` branches on `kind` and nothing
else, and `PlayerDayModal` was narrowed to `kind: 'batter'` so that rule is
checkable rather than merely observed: the prop is gone from its signature and
its own fetch names the kind outright. Driven after the change: the batter's
Overview card still carries `aria-haspopup="dialog"` and opens a dialog at 51
(`Lawrence Butler — ATH vs TEX`), and his Game Log row opens one at 51 with 4
plate-appearance cards in it.

#### The wait is inside the page, not in front of it

**The Overview card needs no fetch and the Game Log row does**, and that
asymmetry is the only interesting thing about the routing. The card is rendered
from a `PlayerReport` and a `PlayerGame` the tab already holds, so it hands both
to `OutingPage` and the page is there on the press. A log row holds a
`PitcherGameLog` and nothing else, so `OutingPageForGame` reads
`/api/players/:id/day?date=` and picks the game out of it by **`gamePk`** — which
is what keeps the doubleheader property the popup had, two rows sharing one
afternoon.

**One component owning both states, rather than a loading shell that swaps for
the page.** The shell reads as the tidier design and breaks the thing this page
is careful about: a swap **remounts the box**, and `useOverlayFocus` reads the
opener at mount — so the second mount would record `body` as the opener and
Escape would drop the reader at the top of the document instead of back on the
row they pressed. `OutingPage` therefore takes an optional `pending` — the name,
the date, whether to draw a wait, and an error if there is one — and draws the
head it can already write with a `LoadingBlock` under it.

**Nothing at all opens under `WAIT_DELAY`.** The flag is `useDelayedFlag`, the
app's own 250ms floor, and it gates the *opening* as well as the wait: with the
read stubbed to **120ms**, nothing is on screen at 80ms and the full page is
there at 200ms, with **0** loading blocks drawn at any point. With it stubbed to
**1500ms**: nothing at 200ms, and at ~400ms the head alone — the name, `Aug 11`,
**1** Back button, **0** tab strips — over `Reading the outing`, with the whole
page at 2200ms. The tab strip is gated on the tab list rather than each tab being
gated inside it, which is the `.view-switch` rule (*gate the div, not what is in
it*) applied one file along: an empty strip still paints a segmented control's
ground, border and 36px floor around nothing.

**A failure says what failed rather than opening an empty page.** A 502 draws
`⚠ Upstream is having a day` in the page's own body, under the same head and the
same Back button, with no tab strip; the message is the server's, unwrapped by
`api.ts` as everywhere else.

#### A game with no outing

**It cannot be reached from the Overview card at all**, and that needed no work:
that card is already static for a game with no items in it, drawing `Did not
appear.` / `Not in the game yet.` / `Yet to play.` and taking no press. The
pitcher branch reads `game.pitching`, so a game he was on the roster for and did
not pitch in is the batter branch's static card exactly as before.

**From a Game Log row it draws a sentence in the page**: `No outing for
Cristopher Sánchez in that game.` The alternative was to fall back to the popup,
and it was rejected for the same reason the wait lives inside the page — falling
back means swapping one box for another after the press, which moves the focus
record, the `inert` marks and the layer under a reader who has already pressed
once. A page that says why it is empty is a page; a page that turns into a dialog
is a flicker.

#### The ladder, and what it cost

**One rung shorter from the player page, unchanged everywhere else.** Driven at
1200×900 and 390×844, one press of Escape undoing one thing at every rung, focus
restored at each, and no `inert` mark left at the end of any of them:

| from | before | after |
| --- | --- | --- |
| Game Log row → outing | player page 50 → popup 51 → page 52 | **50 → 51** |
| … → inning → faced batter | 53 → 54 | **52 → 53** |
| Overview game card | 50 → popup 51 → page 52 | **50 → 51** |
| the feed's own bar | 46 → 47 → 48 | unchanged |
| a matchup team page's feed | 48 → 49 → 50 | unchanged |

`[inert]` with the page open from a Game Log row is `#root`, `.app-chrome`,
`.summary-view` and `.float-btn` — the player page's own background, the page
itself never inert — and the four-press unwind from the deepest rung restores
focus to the faced-batter row, the inning bar, the Game Log `<tr>` and then the
row that opened the player page.

**The page's geometry is the same from either entry point**, which is the check
that matters for a page with two callers: at 320 / 390 / 640 / 1200 / 1920 the
head, the tab strip and the tab body share one **860px** column at both wide
widths (288 / 358 / 608 at the narrow ones, which is the window less the
gutters), and **page-body overflow and view overflow are 0 at every width from
both routes**.

**What went with the popup**: `detailInline`, which had no other caller and is
gone on the repo's own rule (*a field nobody reads is a field nobody misses*);
`.feed-item-toggle.static`, which nothing sets any more, so the feed's bar is
unconditionally a button; the `Full breakdown` button, the door having become the
row; and `.outing-breakdown-btn`'s three rules. Measured app-wide after: **0** of
each. `PlayerDayModal` stays, being the batter's.

**Bundle: 526.70 → 527.31 KB of JS** (155.69 → 155.90 gzipped) and **127.38 →
126.97 KB of CSS** (22.59 → 22.54). The CSS *falls* — a rule block went with the
button — and the 0.6KB of JS is the fetching wrapper and the paragraphs arguing
where the wait belongs.

### The Charts tab, and why its labels are a rendered size

**The tab read `Rolling xwOBA` and reads `Charts`.** Every other entry in the
strip names the *kind* of reading it holds — Overview, Percentile Rankings,
Splits, Stats, Game Log, Arsenal — and this was the one naming a single card, on
a strip a phone already scrolls sideways. It was also the longest label there:
measured on a pitcher at 390, the strip's content goes **721px → 665** for the
swap, against a 358px scrollport, so a reader arrives with two more tabs' worth
of the row already in view. Nothing is lost by the rename, because the card
inside still says `Rolling xwOBA · 2026`: the tab says which kind of reading you
are on and the card says which reading it is, exactly as the Stats tab is a place
and `PlayerWindowTable` is the thing in it.

**The key was in the URL nowhere, and that was checked rather than assumed.**
`rolling` became **`charts`** alongside the label, on the same reasoning the
`splits`/`stats` swap above records: the open tab is component state, so a rename
is a compile error at every call site or nothing at all — and here there were no
call sites, the key being named in `PlayerDetails.tsx` and in no other file in
either workspace (grepped). What the strip is *not* is a promise of more charts:
the tab holds one today, and a name that can hold a second is worth having when
the alternative is renaming the tab the day one arrives.

**The how-to page's list of these tabs was several renames behind and has been
rewritten whole**, which is what that passage asked for rather than the one-line
fix it declined. It named a `Season` tab that had been `Stats` for some time,
listed neither `Overview` nor `Splits`, and ended on `Rolling xwOBA` — five
entries against a strip of six, one of them describing a tab that no longer
existed. It now runs `Overview · Percentile Rankings · Arsenal · Splits · Stats ·
Game Log · Arsenal · Charts`, in the strip's own order, with a sentence each
for the three that had never been described at all. That list is the one place
in the app that tells a new reader what the player page *is*, so it is worth
keeping in step with the strip rather than behind it — and the four renames it
had accumulated are the argument for checking it whenever a tab moves.

### The key is behind an ⓘ here too

**The four-line caption under the chart is a popover now** — the same `InfoKey`
the Splits tab opens, which is the whole reason that component was extracted
rather than left where it was written. The argument for it is that one's and is
worth reading there: a bare `title` is invisible on a phone, a `Modal` is
ceremony two sentences cannot pay for, and an inline reveal fails on distance.
What this caller adds is the measurement: the caption is **36px on a desktop and
72 on a phone** (four lines at 390), spent on a paragraph a reader needs exactly
once, on a tab whose whole content is one chart. Measured on the real card, the
whole card goes **402.16 → 354.16px at 1200** and **337.33 → 262.33 at 390**.
The desktop figure is the caption and its 12px margin exactly: the head is
**32px before and after**, the 30px button fitting inside the height the window
buttons already gave that row. The phone figure is 9px short of it, because
there the head wraps to two lines and the title's own line goes 21 → 30 to hold
the button — **63 → 72px** — which is the whole cost of the control and is paid
back four times over by the caption it replaces.

**Nothing is left on the card the way the Splits tab leaves its sample-size
caveat**, and the difference is the test that passage sets rather than an
exception to it. That one keeps a *conditional warning about this player's
numbers* on the card, because a warning nothing hints at goes unread. This
caption held no warning: it is instructions plus two figures, and of those the
league average is **drawn on the chart itself** as the dashed line's own label,
while his season xwOBA is context for reading the line rather than a caveat about
it. So the whole caption goes behind the button, in the two paragraphs it always
was.

**One clause of that has since been overtaken and the conclusion has not.** The
league average is no longer "drawn on the chart itself" — that inline label is
gone and a **legend under the chart** names the figure instead (see *The league
average is a legend, not a label inside the plot* below). What the sentence was
really doing was justifying the caption's departure by showing that neither of
its two figures was a caveat, and that is unchanged: the league average is on the
card, more plainly than it was, and his season xwOBA is still the one number this
key carries alone. What did have to move with it is the key's **wording** — its
second paragraph named the league average and would now be saying, behind a
button, a figure the legend says in the open, so it names only his own season
xwOBA.

**The panel is anchored to the card's head, not to the button**, which is this
caller's own half of `InfoKey` (`.roll-key .info-key-panel`) and the one place it
parts from the Splits key. That one hangs off a control at the card's right edge
and opens leftward *into* the card; this one sits after a title in the middle of
a row, and at 390 the button lands at **x≈221 of a 358px card**, where a 320px
panel fits from neither of its edges — 531 opening right, −109 opening left. The
head is a full-width row, so anchoring the popover there gives it the card's own
left edge, which is where the reading starts anyway, and `top: calc(100% + 8px)`
drops it clear of the window buttons sharing that line. Measured: the panel is
**320 × 138.3 at both widths**, landing at **x=283 at 1200** (the card's content
edge — 260, its 22px of padding and its 1px border) and **x=29 at 390** (16 of
overlay gutter, the 12px that padding narrows to under 560, and the border),
fully inside the viewport at both and inside the card's own right edge at 390
(349 against 374).

**Driven in a browser rather than assumed**, on the live server at 1200×900 and
390×844: a press opens the panel and a second press closes it; **Enter and Space
both open and close it** with focus staying on the button throughout; an outside
`pointerdown` closes it (and spends its click, which is `useDismissable`'s own
rule doing its job — the press that dismissed it did not also press what was
under it); and **Escape closes the key and leaves the player page standing**,
with a second press closing the page. The button carries `aria-label`,
`aria-expanded` and `aria-controls`, and fills with the accent while its panel is
showing, as every disclosure in the app does.

### The chart's labels are 12px at every width, because a viewBox unit is not

**"Too small to read" was a fact about the phone rather than about the number.**
The chart is an SVG at `width: 100%` over a fixed `viewBox`, so everything in it
— the line, the gridlines and the *labels* — scales with the box it is drawn in.
A label is the one thing on a chart that must not: it is read at whatever size
the screen gives it. The card is **634px wide inside a desktop overlay and 332 on
a phone**, a 1.9× range, so the 11-unit labels rendered at **9.69px at 1200 and
5.07px at 390** — and 5.07px is the report. Picking a bigger unit count cannot
fix that: it moves both ends together, and a count that reads well at 390 is a
20px label on a desktop.

**So the size is declared in rendered pixels and the unit count is derived from
the measured scale.** `RollingXwoba` observes its own chart box with a
`ResizeObserver` and publishes `--roll-font` on the `<svg>` — the same shape
`useStickyChromeOffset` uses for `--chrome-h` and `ClipVideo` for `--clip-w`, and
for the same reason: there is no one number to declare. The stylesheet keeps the
rules saying *which* text is a label and reads the var for the size, with the old
`11px` as the pre-measurement fallback. **Measured: `--roll-font` resolves to
13.63px at 1200 and 26.02 at 390, and the axis labels render at 12.00px at
both** — against 9.69 and 5.07 before. Twelve is the app's own caption size
(`.roll-caption` was 12px, `.roll-tip-sub` is 11). *(That sentence read "both the
axis labels and the league-average label" until the inline label was retired; it
is one reader of the var now, and the measurement is unchanged.)*

**The plot's padding follows the label, because the padding is what the label
sits in.** The left pad holds the y labels and the bottom pad the x ticks, and
both were flat numbers (48 and 30) that were right at exactly one width: at 390 a
26-unit label would have run off the left edge of its own plot. They are
`2.3em + 10` and `1.6em + 8` now, off the same derived font — 2.3em being the
widest y label with slack, `.200` measuring 2.21em in this face (21.41px of ink
at an 11-unit font on a 0.8806 scale), and `formatRate` yielding four characters
across xwOBA's whole range. The right pad takes `max(22, 1em)`, since half the
last x tick's label hangs into it. Checked at both widths on a batter and a
pitcher: **every y label sits inside the chart box** and the lowest x tick clears
the SVG's own bottom edge. *(The bottom pad was `1.4em + 8` and the 1.6 is
`X_TICK_BASELINE_EM`, which the pad now reads rather than carrying a number of
its own — see the section below, which is why it moved.)*

**The box is held in state rather than in a ref**, which is not a style
preference: the chart is *conditional* — a player short of his window renders a
sentence instead — so a ref set on a later render would never re-run an effect
with an empty dependency list, and the labels would sit at the 11px fallback for
the life of the card. A callback ref makes attaching the node the thing that
measures it. The measurement is taken in a **layout** effect, so the first paint
already has it, and it cannot loop: the box is `width: 100%` of a column this
value does not touch.

**The two gestures the chart has were re-checked, since this is the file that
records losing one of them.** `touch-action: pan-y` is untouched and computes
`pan-y`: measured at 390×390, where the overlay has 145px of range, a vertical
drag starting in the **middle of the chart** moves it **137px**, which is exactly
what the same drag starting 60px above the chart moves it — the regression that
passage was written for (a chart that swallowed the page's scroll) has not come
back. And the crosshair still tracks a horizontal drag: a pointer at a quarter
and at three quarters of the chart's width reads `PA 165` and `PA 379` with the
crosshair at 179 and 539 user units, and the tip clears when the pointer leaves.

**That scrub is no longer this file's, and the two paragraphs above are why it
was worth moving.** The League matchup page's day-by-day category chart wanted
the same gesture — a crosshair snapped to the nearest point, a marker on it and
a readout naming the value and the point in time it belongs to — so the mechanic
is `components/chartScrub.tsx` now, and both charts use it: the hit test,
`ScrubCross` and `ScrubTip`. What stayed here is what is this chart's own, the
accent dot on the line and the words `PA 144 · 5/24`; what the matchup chart
keeps is its two team-colored dots and its `31 – 23`. Extraction rather than a
second copy, on the rule that took `Modal` out of the Columns dialog — and the
half that drifts silently is the arithmetic, since a snap to the nearest point
is right about which point is under the pointer or it is off by one. **It is the
same arithmetic, not a similar one**: the old `Math.round(paGuess - xMin)` over
a series whose PA numbers step by one *is* the rounded fraction of the way
across the plot the shared hit test computes.

`.roll-cross` and `.roll-tip`/`.roll-tip-val`/`.roll-tip-sub` are
`.chart-cross` and `.chart-tip*` with it — one rule for one component rather
than an `.mser-` copy free to drift. `.roll-dot` stays `.roll-dot`, being this
chart's own mark. **Measured before → after, same player, same script:** at 1200
the three sampled positions read `.375 / PA 144 · 5/24`, `.404 / PA 202 · 6/7`,
`.300 / PA 259 · 7/8` with the crosshair at **178.9 · 360.3 · 538.5** — the 179
and 539 above, at a third position between them — and at 390 `.370 / PA 137 ·
5/22`, `.412 / PA 198 · 6/6`, `.307 / PA 258 · 7/8` at **179.8 · 361.1 · 539.4**;
the dot stays `r=4` on the crosshair's own x, its dash stays `3px, 3px`,
`--roll-font` stays **13.63px and 26.02px**, the wrap stays **264.16 and 138.33**
tall with the tip up and after it clears, and page overflow is **0**. Every
figure identical on both sides of the change; the one thing that moved is the
class on the box, which is how the before run was confirmed to be the before
run. The whole of the matchup chart's own account is in **Client — the League
matchup page**, *The chart is scrubbed, and the scrub is the rolling chart's*.

**The readout ran off the right of the screen at the end of the series, and it
is clamped there now.** The box centers on the point it names, and half of it is
wider than the last plate appearance is from the right edge of a phone's window:
measured at the last point, `.364 / PA 256 · 5/31` — a box **92.9px** wide —
reached `x = 395.4` in a **390** window and **325.4** in a **320** one, **5.4px
past the glass in both**, taking the whole of the date with it. At **1200** the
same box ends at 944.1 inside a 1200 window and was never the fault. After:
**386.0** and **316.0**, each **4px inside** the edge on a nudge of
**−9.43px**, and 1200 unmoved at 944.1. The left end never needed it — the first
point's box starts at **13.8** at 320 and **14.8** at 390, the plot's own left
pad being wider than half a readout.

**The nudge lives in `ScrubTip` and is measured, not declared**, which is the
same rule `--roll-font` two paragraphs up follows: the width being corrected is
the width of the box's own text in a font this app does not choose, so it is
read off the rendered box in a layout effect on every move and published as
`--chart-tip-nudge` for the stylesheet's `translate(calc(-50% + …), -140%)` to
add. **It clamps to the window rather than to the chart**: clamping into the
wrap would have moved that same box **34.4px** — it hangs that far past the
svg's right edge at 390, where the wrap has 29px of card either side of it — for
a fault of 5.4, and every pixel of that is the readout walking away from the
point it names. The whole of that argument, and the matchup chart's own figures,
are in **Client — the League matchup page**.

**That window rule was measured here, is exactly right here, and was not
general** — a later pass replaced it, and nothing on this page moved. What cuts
a floating box is the first ancestor that clips, not the glass; this page has
none nearer, `.details-view` being a full-screen scroller whose padding box *is*
the window, so the two answers coincide and the narrower rule looked like the
broad one. The matchup's copy of this readout is drawn in a dialog whose body
scrolls, and the window clamp left **13.0px** of it painted nowhere at 390.
`ScrubTip` now clamps into the window **narrowed by every ancestor whose
overflow is not `visible`** (`visibleBand`), and clamps the box's *top* into the
same band by flipping it under the point where above will not fit
(`--chart-tip-lift`). **Neither changes anything on this page**: the same nine
positions at 1200, 390 and 320, before and after, read identical in all 27
rows — the same readouts, the same box edges, the same nudges (`0.00px`
everywhere but the last point, **−9.43px** there, ending at **386.0** and
**316.0**) — because the band computed here *is* the window, and no readout in
those 27 came within reach of the top of it. The argument and the matchup's own
figures are in **Client — the League matchup page**.

**Nothing else on this chart moved, which is the failure the clamp could
cause.** The same script before and after, same player, reads identical at all
three widths: the readouts `.425 / PA 100 · 4/21`, `.449 / PA 176 · 5/10`,
`.364 / PA 256 · 5/31` at 1200 with the crosshair at **41.3 · 361.3 · 698**,
`.469 / PA 173 · 5/10` in the middle at 390 with **69.9 · 361.9 · 694**, and
`.446 / PA 171 · 5/9` at 320 with **85.8 · 359.5 · 687**; the dot stays `r=4` on
the crosshair's own x, its dash stays `3px, 3px`, `--roll-font` stays **13.63 /
26.02 / 32.98px**, the wrap stays **264.16 / 138.33 / 109.16** tall with the tip
up and after it clears, the tip still clears on leave, and page overflow is
**0** at every width and position. Only the two clamped rows differ.

**The gesture is unchanged, and the check has a trap in it.** `touch-action`
computes `pan-y`, and at **390×390**, where the overlay has **196px** of range,
a real `Input.dispatchTouchEvent` drag upward starting **a quarter of the way
down the plot** moves the overlay **100px** — 99 before the change — against
**95px** for the same drag starting 8px above it. The trap: at that window the
*center* of the plot is below the fold, and a drag started there moves **0**
before the change as well as after, which reads as the swallowed-scroll
regression this file was written for and is nothing but a touch dispatched off
the screen. `document.elementFromPoint` at the start point answers `null` when
that is what has happened; check it before believing a zero.

**Both halves of the clamp are exercised, the left one by probe.** No real
readout reaches the left edge, so it was checked by widening the box with an
injected `min-width` at 320: at **200px** the first point's box would start at
**−39.8** and is clamped to **4** (nudge **+43.76px**), and at the last point to
a right edge of **316**. At **400px** — wider than the window — it sits flush at
the left gutter at both ends rather than being pushed off the right, page
overflow **0** throughout. `TIP_GUTTER` is the 4px that keeps the border and its
shadow off the glass. One gotcha for anyone re-running that probe: the effect
re-measures on a **render**, so scrubbing to a point the pointer is already on
re-measures nothing — move off the point and back.

**Bundle: 568.00 → 568.33 KB of JS** (167.58 → 167.73 gzipped) and **152.67 →
152.70 KB of CSS** (27.30 → 27.31) — 0.36KB and 0.04KB raw, 0.15KB and 0.02KB
over the wire, for the clamp and the paragraphs arguing it.

**Everything else the page is measured against is unchanged**, at 1200×900 and
390×844 on a batter and a pitcher: the SVG is **634 × 264.16** and **332 ×
138.33** (the viewBox never moved), the pinned chrome is **193px** at 390 either
way, every one of the six and seven tabs lands fully inside the strip when
selected, every tab switch still resets the view's scroll to **0**, and the page
body and the overlay each overflow by **0**.

**Bundle: 454.23 → 454.76 KB of JS** (134.39 → 134.70 gzipped) and **104.65 →
104.75 KB of CSS** (18.69 → 18.72 gzipped) — 0.5KB and 0.1KB raw, and a third of
a kilobyte over the wire, for a `ResizeObserver`, a popover and the paragraphs
arguing them.

### The x ticks clear the y labels, and the clearance is a derivation

**The leftmost x tick collided with the bottom y label**, and it was not a near
miss: measured ink against ink on the real chart, the `100` tick overlapped the
`.200` label by **2.46 × 0.69px at 1200 and 6.59 × 0.69px at 390**. Two rules
that were each right on their own put them in the same place. The lowest
gridline is *always* exactly on the plot's bottom edge — `yMin` is floored to a
step, so `sy(yMin)` is `PAD.top + PLOT_H` — and its label hangs `0.32em` below
that line, which is the `dy` on the `<text>`. And an x tick is centered on its own
tick, the first of which lands at or just past the plot's **left** edge, so half
of it hangs back into the left pad where the y labels live. The horizontal figure
differs between the two widths because that first tick's distance from the edge
does; the vertical one does not, because both labels render at 12px whatever the
width (see the section above).

**The fix is a named constant the tick and the pad both read**, rather than a
number nudged until it looked right. `X_TICK_BASELINE_EM` is how far below the
plot the tick's baseline sits, in ems of its own size, and it is built from what
it has to clear: `0.72` is where this face's digits start above their baseline
(measured, 8.65px of ascent at a 12px rendered size), `0.34` is where the y
label's ink ends below the gridline, and the rest is clearance. **1.6em leaves
0.54em — 6.5px at the rendered size, at every width**, because the whole
relationship is in ems of a label whose rendered size is fixed. The bottom pad is
that same constant plus the 8 units that keep the baseline off the SVG's own edge
(`fontU * X_TICK_BASELINE_EM + 8`, where it was a separate `1.4em + 8`), so the
two cannot drift apart the next time either moves. **Nothing is reserved below
the baseline**: an x tick is a plate-appearance count, and integers in this face
have no descender.

**Measured before → after, ink against ink, at 320 / 390 / 1200 / 1920.** The
collision count over the whole chart goes **1 → 0** at every width; the gap
between the lowest y label's ink and the top of the nearest x tick's goes
**−0.69px → 6.50–6.51px**, the same number at all four. The x ticks still clear
the SVG's own bottom edge (2.72 / 3.49 / 6.85 / 6.85px), every y label still sits
inside the chart box, and the **page body and the overlay each overflow by 0** at
all four. What it costs is 0.2em of plot height — the SVG's own box never moves
(the viewBox is fixed at 720 × 300, and it renders 634 × 264.16 at 1200 and
332 × 138.33 at 390, unchanged), so what shrinks is `PLOT_H` inside it, by 2.7
viewBox units at 1200 and 5.2 at 390: under 2% of the plot, spent on the one
thing that made its axis unreadable.

### The league average is a legend, not a label inside the plot

**The figure was in two places and neither of them was a legend.** It was painted
*on the chart* as `.315 league avg`, anchored to the right end of the reference
line at its own height; and it was a sentence inside the key behind the ⓘ, which
is a place a reader has to press a button to reach. What a reference line wants
is what every chart wants — a swatch of the mark and a word for it, under the
picture, read once and then ignored — so that is what it has: a `.roll-legend`
row below the chart reading `— — —  League average (.315)`.

**The inline label goes, and the second reason is the one a reader meets.** It
said the figure the legend now says, on a card whose whole content is one chart,
which is the rule this app applies everywhere else (the Overview tab's game card
dropped its matchup line because the status badge beside it already carried the
clubs; the feed's Upcoming row dropped its `ProbablePitcher` line because the
split's own head already named the hand). And it was drawn **inside the plot**,
hard against the right edge at the reference line's own height — which is exactly
where the rolling line of a league-average hitter runs, so the one mark this
chart exists to show was the thing the text sat on. Measured on **Gunnar
Henderson, whose season xwOBA is .315**: the label's ink spanned **16.2% of the
plot at 1200 and 32.6% at 390**, and **8 of his 444 plotted points fell inside
it** at both widths, with nothing in the drawing order keeping the line out from
under the text.

**The swatch is the guide line's own class**, which is the whole of "one
definition rather than a copy": the legend's `<line>` carries `.roll-ref`, the
same rule the chart's reference line is drawn by, so the color and the dash
pattern cannot come to be two of each the next time either moves. Checked in a
browser at every width: the swatch and the guide both compute
`stroke: rgb(92, 111, 151)`, `stroke-dasharray: 4px, 4px`, `stroke-width: 1.5px`.

**What the swatch deliberately does not match is the *rendered* dash length**,
and the phone is why. The chart's dashes are viewBox units scaled with the plot —
4 units paints **3.52px at 1200 and 1.85px at 390** — so matching them here would
mean scaling the swatch by the chart's own factor, and on a phone that is a
1.85px dash inside a 24px swatch: six cycles of sub-2px marks, which reads as a
gray smudge rather than as a dashed line. A legend owes the reader the *pattern*,
at the size the words beside it are read at. The swatch is therefore 24 × 2 CSS
px over a matching viewBox, so one unit is one pixel and `.roll-ref`'s `4 4`
paints 4px dashes at a 1.5px stroke.

**`.roll-legend` is folded onto `.summary-legend`'s rule rather than written
again**, the economy this stylesheet applies to `.settings-toggle` /
`.sim-toggle` and `.stats-table` / `.glog-table`: the app has one legend — a
wrapping row of swatch-and-word items in 12px `--muted` under the thing it
explains — and this is that object with a dashed line where the summary table's
key has a tinted square. Only the swatch differs, so only the swatch has a rule
of its own. The one caller-specific line is the padding: the shared rule's
`10px 0 12px` is the **summary view's** bottom, where the legend is the last
thing before the edge of the window, and inside a card the 24px of `.pct-card`
padding is already under it — so `.pct-card .roll-legend` gives back the 12,
written two classes deep to win wherever the shared rule sits in the file, the
way `.roll-key .info-key-panel` already does for its own anchor.

**The key's second paragraph was rewritten rather than left standing.** It read
*"The dashed line is the MLB league average (.315). This player's season xwOBA is
.417."*, and the first half of that is now the legend's job — repeating it behind
a button would be the app stating one fact in two places with only one of them
visible. What is left is the one number nothing else on the card carries: *his*
season xwOBA, and what it is for (`the flat figure the line above wanders either
side of`). Checked on the live page at both widths: **`.315` appears exactly once
in the whole card**, in the legend, and there are **0 `.roll-ref-label`
elements**.

**Measured at 1200 and 390.** The legend is one **25px** row at every width
tested (320, 390, 1200, 1920) with its swatch at 24 × 2, and the card grows by
exactly that: **354.16 → 379.16px at 1200** and **262.33 → 287.33 at 390**, which
is the row and nothing else — the SVG's own box is unchanged at 634 × 264.16 and
332 × 138.33. The key still opens and closes on a press, its panel still measures
**320 × 138.34** and still lands inside the viewport at 390 (x=29 against a card
running to 374), and the tab's scroll still resets to 0. The **empty case draws
neither**: a player short of his window (Michael Stefanic, 5 PA) renders the
sentence alone, with no chart, no legend and 0 overflow at both widths.

**The two gestures were re-measured, since this is the file that records losing
one of them.** `touch-action` still computes `pan-y`, and at 390×390 — where the
overlay has 170px of range — a vertical drag starting in the **middle of the
chart** moves it **170px**, which is exactly what the same drag starting 60px
above the chart moves it. The crosshair still tracks a horizontal drag: a pointer
at a quarter and at three quarters of the chart's width reads `PA 128` and
`PA 218` with the crosshair at 181.9 and 541.9 user units, and the tip clears
when the pointer leaves.

### The league line is measured, and the legend says how deeply

**It was `.315` written into `xwoba.ts` as a constant**, and the legend printed
it as though it were a fact about this season. It is a benchmark: the 2026
season to date measures **.3149 over 140,028 wOBA events**, so the constant is
right to a thousandth for the *year* and wrong by a fifth of that within it —
**.3241 in April against .3071 in August**. The nightly job measures it now (see
**Data sources**, *What an average plate appearance is worth*), and this end of
it is one attribute and one helper.

**The figure keeps its place on the legend and its depth goes in the title** —
`MLB average xwOBA over 140,028 plate appearances this season, measured
nightly`. That is the rank badge's own split: the legend is one line under a
chart and how many plate appearances the league is drawn from is context for the
figure rather than part of it.

**The wire says which of the two it is, and `0` is the word for benchmark.**
`XwobaSeries.leagueXwobaPa` is how many events the average was drawn from, and
the server sends 0 where it fell back to the constant — an installation whose
nightly job has not run. The legend's title then reads `A fixed benchmark — the
league average has not been measured yet…`, which is the same honesty the
percentile card's dotted bubble and the Splits card's hatched fill already
carry, in the one place a line has to carry it. A response from a server older
than the field has no `leagueXwobaPa` at all, which reads the same way and
should: neither can say how many plate appearances it is drawn from, because
neither was drawn from any.

**Nothing on the chart moved.** `.3149` and `.315` print the same three
decimals, so this week the line is where it was and only the tooltip is new;
what it changes is next April, when the line follows the league instead of
staying put. Measured after, on two players at 1200×900: the legend is the same
one **25px** row reading `League average (.315)`, the chart is drawn 108ms after
the tab is pressed, and the page and the overlay each overflow by 0.

**The summary table's own legend is untouched**, which is the thing a shared
selector list most easily breaks: measured at 1200 and 390 after the fold, a
**37px** row with `padding: 10px 0px 12px`, 12px `rgb(142, 160, 196)`, a
`6px 16px` gap, four items (`At bat · On deck · On base · On mound`), 14px
swatches, and the summary pane's bottom still **37px** up from the window.

**Bundle: 464.53 → 464.76 KB of JS** (137.79 → 137.85 gzipped) and **106.76 →
106.79 KB of CSS** (19.06 → 19.09 gzipped) — 0.23KB and 0.03KB raw, 0.06KB and
0.03KB over the wire, for a constant, a legend and the paragraphs arguing them.
The JS figure is the legend's markup and the derived tick offset; every comment
in this change, in both files, costs the bundle nothing.
