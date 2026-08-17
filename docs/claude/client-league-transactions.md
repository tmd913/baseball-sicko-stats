### The Transactions tab wears a dot when there are moves you haven't seen

Split out of `client-league.md`, which holds the view this tab sits in. Who
added, dropped and traded whom — the feed, what a row says about a player, and
the red dot on the tab that says there are moves this reader has not seen.

A **red dot** in the corner of the tab, and it goes the moment the tab is opened.

**What it is drawn from is one comparison**: the newest move in the feed against
the newest this reader had in front of them when they last had that tab open
(`UserPrefs.seenTransactions` — see **Roster, watchlist, users and auth**, where
the marker and why it carries a league id are set out). Both halves fail in the
same direction and it is the only safe one here: a reader who has **never**
opened the tab has seen none of it and gets the dot, and so does a marker from a
*different* league. News offered rather than news hidden.

**The newest move is a `max` rather than the first row**, although the server
sends the feed newest first: this is the one number the dot turns on, a reduce
over 250 rows costs nothing, and it cannot be wrong the day an upstream sort
changes under us.

**Opening the tab is reading it**, and the marker moves again while the tab stays
open and a poll brings something new, since those rows are on screen too. The
state leads and the write follows — the rule `noteRecentPlayer` already states,
because the dot has to go on the very next render rather than a round trip
later — and it goes through `queueUserWrite`, this and the search history writing
to the same user item. A marker that would not move writes **nothing**, so
sitting on the tab through a quiet hour of polls costs no writes at all.

**Absolutely positioned in the tab's own padding, not laid out after the
label.** Laid out it would be a 6px dot plus the row's 6px gap — 12px of tab that
appears when somebody makes a move and vanishes when the tab is opened, moving
the two tabs beside it each time; a row of tabs that changes width under the
reader is worse than no mark at all. Measured at 320 / 375 / 390 / 640 / 900 /
1200 / 1920: the tab is **104.2px wide with the dot and without it** at every one
of them, the dot lands inside its own tab at every one, and the page body
overflows by **0**. The colour is `--strikeout`, the app's red and the tone
`NewsMark` already gives news filed today; it is `aria-hidden` with the fact
given to a screen reader as words, since a coloured circle names nothing.

**Not on the League pill itself**, which was the obvious extension and is not
what was asked for: the tabs are drawn only on the League view, so the dot is a
statement about a page you are already on.

**Measured end to end against the live 12-team league**, at 1200×900: a marker
from another league draws the dot on arrival; opening the tab clears it and
writes `{leagueId: 60120, ts: 1786824052358}` — the feed's own newest date — and
it stays clear across a tab switch and a reload; rewinding the marker by one
millisecond draws it again. The route rejects a bad pair (`leagueId must be a
positive integer`, `ts must be epoch milliseconds`) and the store keeps the newer
of two markers for one league while replacing another league's outright.

**Bundle, for the poll and the dot together: 498.16 → 500.00 KB of JS** (147.34 →
147.88 gzipped) and **116.39 → 116.54 KB of CSS** (20.70 → 20.73) — 1.8KB and
0.15KB raw, 0.54KB and 0.03KB over the wire, for a poll, a saved marker, a route
and the paragraphs above restated where the rules are.

### Transactions

**A feed, which is why it is neither of the two tabs beside it** — the Scoreboard
is one period and the Rankings are one span, and this is a stream with no period
on it at all, read from the top and paged the way the app's other two streams are
(`PAGE_SIZE` 25, the Feed's and the Game Log's own idiom).

**A row is one transaction and its players are what moved in it**, which is
ESPN's own shape rather than one imposed here: a pickup and the drop that paid
for it are one act by one manager and arrive as one topic, and a trade is one
topic carrying three to nine players. Drawing them as separate rows would read as
five things happening where one did. A trade names both teams in its head with an
arrow that says nothing about direction, and **the direction rides on the
player** — which way *he* went is the fact, and in a five-player trade the two
names above say nothing about any one of them.

**Every name opens the player page**, wherever the name-and-club join found
exactly one major leaguer; where it didn't the name is plain text, which is
`matchMlbPlayer`'s standing rule rather than a new one and leaves the row still
saying what happened. `App.tsx::openLeaguePlayer` resolves the **kind** off the
season roster — the app keys a player page on `${kind}-${id}` and a transaction
says a player moved, not whether he pitches — falling back to `batter`, which is
what a bare id in an old link has always done (`readKeys`). Measured on the live
league: **42 of 42 names on the first page are links, 0 plain.**

### A row says who moved, not only that he moved

**The name was the whole of a player row, and a name is not enough to decide
anything on.** A waiver feed is read to answer *does this matter to me* — which
turns on where he plays, how widely he is rostered and, at a glance, whether you
recognise him at all — and the row said none of it. It now carries his headshot,
his club's cap logo, ESPN's own position eligibility and his global roster %.

**Three of the four are on the row and the fourth is the mark alone**, which is a
judgement about density rather than about room. The **positions** are the most
actionable thing a feed of adds and drops can say (*somebody just dropped a
shortstop*). The **roster %** is how big a deal the move is — a 78%-rostered
player being dropped is news where a 2% one is noise — and it is four characters,
right-aligned to the same edge the transaction's own date sits on, so it reads as
a column rather than as something in the way of scanning the names (it has since
gained its own three deltas under it — see *And how that percentage has moved*
below). The **headshot** is recognition, and the app's own way of naming a player
everywhere else. And the **club** is the cap logo with the abbreviation on its
tooltip: on a *fantasy* feed it is the least decision-relevant of the four, and
drawn as `MIL` it would have been a third string on a line already carrying two.

**The block is `PlayerIdentity`**, the same component the summary table and the
research board draw a name over a club and a position list with, and the position
itself is `lib.ts::positionCell` — one definition rather than a third copy, which
is the rule those two already state for each other. What this caller adds is the
two things a row in a *feed* needs of it: room to shrink, and a name line that
carries the trade destination beside the name. (The waiver bid was the third
thing on that line and has gone — see *The waiver bid is a word, not a figure*
below.)

### The headshot opens his page, where it used to be a plain image

**This reverses the paragraph that stood here**, which read: *the name is 8px away
and is the press, so a 32px target beside it would only be a smaller version of
the same one — at the cost of a tab stop on every one of up to nine players in a
trade.* The first half of that is true of **every table in the app** and is not
how a single one of them is built: the summary table's `PhotoCell`, the research
board's and the feed's `FeedHeadshot` all wrap the circle in a button of its own
beside a name that opens the same page, because a face is what a reader aims at
when scanning a list of people. A row that looks like every other row in the app
and is the one that does not answer a press is worse than a duplicated target,
and it was reported as exactly that.

**The tab-stop cost is real and is the one every other table already pays.** The
button carries `aria-label` (`Open Lawrence Butler's page`) the way
`.sum-photo-wrap` and `.feed-photo-link` carry theirs, so a screen reader hears
two named routes to one page rather than an unnamed control; it is the app's own
bare-button reset holding the 32px slot, so the row is laid out identically to
the image it replaced.

**A player the join could not place is not a press**, which is `PlayerName`'s own
rule one element to the right — there is no page to open. The two are the same
set by construction rather than by care, and were checked to be: over the whole
415-row feed, **412 photo links and 412 name buttons, 3 plain marks and 3 plain
names**, and *every row* agrees with itself about which it is.

**A missing image is still a press.** The initials fallback is what the button
wraps once `onError` fires, so a player with no headshot on file keeps both the
slot and the link (checked by dispatching the error: `LB` in a 32 × 32 mark,
still pressable, row still 32px).

**Still no lineup pip and no `IL10` code**, which the two wide tables put on a
headshot: those read off `/api/statuses`, which this page does not fetch, and
they answer a question about *this afternoon* where every row here is dated — a
call-up's pip says nothing about the trade that moved him three weeks ago.

**Measured at 1200×900 and 390×844 against the live league**, before → after: the
image is **32 × 32** and the row **32px** either way, and the whole feed paged out
is **415 rows with heights 32 / 37 / 52** (52 for the 23 trades, 37 for the one
long unjoined name) — the figures this file already records, unmoved — with the
page body overflowing by **0** at both widths. A press opens
`?…player=batter-671732` with `Lawrence Butler` in the `<h1>`; the button focuses,
draws the accent ring and reads `cursor: pointer`; and one press of Escape closes
the page and leaves the tab on Transactions with its 42 rows.

**Bundle: 500.00 → 500.20 KB of JS** (147.88 → 147.93 gzipped) and **116.54 →
116.82 KB of CSS** (20.73 → 20.76) — 0.2KB and 0.28KB raw, 0.05KB and 0.03KB
over the wire, for a button, a bare-button reset and the paragraphs above
restated where the rule is.

**The club is the one fact that needed threading, and it needed no upstream.**
Roster % and eligibility ride on the `/api/espn/ownership` response App already
holds for the research board, and a player's *kind* and MLB's listed position
come off the season roster the header search holds — but MLB serves a cap logo by
**team id** and nothing else, and no client-side list carries one for an arbitrary
player. The join that finds a transaction's `mlbId` already has it:
`matchMlbPlayer` answers with the whole `IndexEntry`, whose club is the very field
the tie is broken on. So `EspnPlayerPool.byEspnId` keeps that id beside the name
it already kept, and `EspnTransactionPlayer` gains `mlbTeamId` and `team` — the
abbreviation off `getTeamAbbrevs()`, the 24h table every other badge in the app
reads. **No new request, and no cache version moves**: the pool and the
transactions blob are both memory-only, so there is no stored shape to deserialize
with a field missing.

**Where ESPN has said nothing the row prints MLB's own word rather than a guess.**
`positionCell`'s pitching fallback is `starter` — a fact about how a man has been
*used*, which a transaction does not carry — so the kind is read as a batter's for
that one branch, which routes a pitcher to `P` instead of to a coin-flip between
SP and RP; where ESPN *has* spoken, the real kind narrows his list, which is what
stops a mis-joined pitcher reading `2B/SS`. Measured with `/api/espn/ownership`
blocked: 42 of 42 rows fall back, pitchers read `P — MLB's listed position`,
batters their own, the cap logos still draw (they are the transaction row's own
fact) and the roster % is simply **absent** rather than a column of dashes — a
feed is not a table, so a missing figure reads as missing.

**A player the join could not place keeps his slot.** He has no club and no
eligibility, so the row draws his name alone rather than an identity block of two
em dashes — but the circle is still there, as his initials, which is
`PlayerOrderEditor`'s own fallback and is what keeps every name in the list
starting at one x. Measured over the whole feed: **412 of 415 rows joined**, and
the three that didn't read as initials and plain text.

**The name line wraps, and only a trade can make it.** `to Ookie Rookie` beside a
name is more than a 390px row has, and the name is the half that must not give:
measured on the live league's 415 rows, the name was ellipsized on **every one of
the 23 trades at 390 and on none at 1200**. Wrapping puts the destination on its
own line there and leaves every other row at its 32px.

**And the Load-more button is the app's own.** It carried `className="load-more"`,
a class **no rule in the stylesheet answered** — a bare browser button at the foot
of the one tab that is a stream. `.lg-tx-more` is folded onto `.feed-more`'s
selector list, count badge and all, so this is the Feed's button rather than one
that resembles it; `.lg-transactions` becomes a flex column so its
`align-self: center` resolves against something, which is the shape
`.feed-section` already gives the stream whose paging idiom this tab borrowed.

**The word for the move is the manager's rather than ESPN's message-type
number** — `Added`, `Claimed`, `Dropped`, `Traded` — and a waiver claim is worth
telling from a free pickup: one cost him a bid and his place in the order and the
other cost him nothing, so the bid rides on the row where there was one. The
reader's own moves take the accent rail, the same mark the scoreboard puts on the
reader's own matchup and for the same reason: a feed of a twelve-team league is
mostly somebody else's business.

**The date is printed at the resolution it has** — `Today · 5:43 AM`,
`Yesterday · 7:21 PM`, `Aug 11 · 12:14 PM` — because what a reader wants from
this list is how long ago, and for anything inside two days the day's name says
it faster than its date does.

**And what the list *is* is said at its foot when it is at the server's own
limit**, rather than implied: `The 250 most recent moves. ESPN's activity feed
goes back further than this page reads it.` A reader who scrolls to the bottom of
a season deserves to know that rather than to conclude the league was quiet in
April.

### Measured

Driven against the built client and the live 2026 league at **390×844 and
1200×900**, and swept at **320 / 375 / 390 / 640 / 1200 / 1920**.

- **Page-body overflow 0 at every one of the six widths**, on all three tabs, and
  0 on the Roster, Feed and Research views (which draw no `.lg-tabs` at all).
- **The tab strip is one row from 375 up** and hugs its pills at **296.97px**
  rather than stretching the 800px column; both strips wrap to two rows at 320,
  where this bar already pays a line for everything else. The span strip is one
  row from 640 up and two below it.
- **Rankings**: 12 rows, 10 categories, **120 rank badges and 11 marked first**
  (eleven rather than ten because one category has a tie at the top, which is the
  competition ranking doing its job). The header reads `Team · R · HR · RBI · W ·
  ERA · SB · WHIP · K · OPS · SVHD`; the pane bleeds to **0 from both edges**;
  the team column pins at **0** with the pane scrolled to its far right; rows are
  **58.55px** and the header row **36.00** at every width.
- **The five spans read**: `Current matchup` (`Week 19 · Aug 10 – Aug 16 · so
  far`, and the one the tab opens on), `Season` (`ESPN's own season line`),
  `First half` (`Weeks 1–9 · Mar 25 – May 31`) and `Second half` (`Weeks 10–18 ·
  Jun 1 – Aug 9`), each writing its own `lspan=` except the default, which is
  omitted. **The halves are an even division of the regular season by
  matchup period** — nine weeks each of an eighteen-week season, where they were
  cut on the All-Star break and ran 15 and 3; see **ESPN fantasy league**, *The
  halves are an even division*.
- **The ranks were recomputed independently** from the values the route ships,
  over all five spans: **600 of 600 cells match, 0 wrong, 73 of them tied.**
- **Transactions**: 25 rows on the first page of 250, the Load-more button
  reading `Load more` over a `225` badge and taking it to 50, **7 of the 25 the
  reader's own**, and 42 of 42 names links. Pressing one opens
  `?player=pitcher-676775` with `Keaton Winn` in the `<h1>`, and one press of
  Escape closes the page and leaves the tab on Transactions.
- **The player rows, over the whole feed** (all 250 transactions paged out, both
  widths): **415 rows, 412 with a cap logo, a position list and a roster %**, 3
  with initials and a plain name, and **0 clipped names**. Every row is
  **32.00px** at 1200 and at 390 alike, save the 23 trades at 390 (52px, the
  destination on its own line) and one long unjoined name (37px); **page-body
  overflow 0** at both. Spot-checked against ESPN: `Francisco Alvarez · NYM ·
  C/DH · 11.4%`, `Keaton Winn · SF · RP · 0.5%`, `Fernando Tatis Jr. · SD ·
  2B/OF · 99.6% · to Baldy's Bozos`.
- **Every empty state names its cause**, driven with the relevant route blocked:
  a failed rankings or transactions read draws `Couldn't read your league` over
  the message, and with no league connected the strip is not drawn at all — three
  tabs over one message would be chrome for a feature the reader hasn't got.
- **A span this league cannot serve falls back to the season** rather than an
  empty table (`?lspan=bogus` → `Season`, and the param dropped from the URL),
  and a deep link straight to `?lt=transactions` or `?lspan=second` opens on it.

**Bundle: 485.25 → 493.09 KB of JS** (143.98 → 146.06 gzipped) and **112.93 →
115.36 KB of CSS** (20.12 → 20.47 gzipped) — 7.8KB and 2.4KB raw, 2.1KB and
0.35KB over the wire, for two tabs, two routes, two components and the paragraphs
above restated where the rules are.

**And for the player rows on Transactions: 494.02 → 495.54 KB of JS** (146.19 →
146.62 gzipped) and **115.61 → 116.33 KB of CSS** (20.54 → 20.63) — 1.5KB and
0.7KB raw, 0.43KB and 0.09KB over the wire, for a shared identity block, a
headshot with its fallback, a roster-% cell and the Load-more fold.

### Added players lead, and a hairline separates one from the next

**ESPN's order inside a transaction is arbitrary, and half the feed read
backwards because of it.** A pickup and the drop that paid for it arrive as one
topic, and which of the two comes first is not a fact about anything: measured
over the live league's 250 most recent moves, **79 of the 149 two-player
transactions arrive drop-first and 70 add-first**. So the man who left sat above
the man who arrived on a coin flip, on a feed read to find out what somebody
went and did.

**The add is the news**, so it leads — the drop is what it cost — and the sort
is one comparator over `move`, applied where the row is drawn rather than on the
wire, the payload being ESPN's own record and no business of ours to reorder.

**`sort` is stable by specification, which is what makes it safe on a trade.**
Every player in one is an `add` (ESPN's message type 244 files them that way,
each to the team receiving him), so the comparator is flat across all nine and
the order ESPN sent — which pairs the two halves of the deal — survives
untouched. Checked against the route on a five-player trade: the drawn order is
byte-identical to the payload's.

**And a hairline separates one player from the next**, which a 4px gap did not:
an ordinary add-and-drop ran together as one block of four lines and a
nine-player trade as eighteen. It is the app's own list separator — the rule
`.news-item` and `.start-row` already carry, `var(--border)` with the last row
exempt — rather than a second device invented here. It costs a two-player card
**9px**, because the padding is only ever *between* two rows and never at the
card's own edges.

### The waiver bid is a word, not a figure

**`$12` beside a name is gone.** What it was there for is already said by the
row's own word — `Claimed` rather than `Added`, which is the distinction that
changes a reading (one cost him a bid and his place in the order, the other cost
him nothing) — and the figure itself is a number nobody scans a feed for. It sat
on the name line, which is the one line on the row that has to shrink.

**`EspnTransactionPlayer.bid` keeps a reader and stays**, which is the test this
repo applies before removing a field: the matchup page's Moves section carries it
in the row's **tooltip**, with the day (`Claimed · Aug 17 · $1`), where it is
available to anybody who wants it and in nobody's way. So this is one chip
removed from one surface rather than a field pruned.

### And how that percentage has moved

**The roster % says how big a deal a move is and could not say which way it was
going.** A player at 21.3% is either a man the league is dropping or one it is
picking up, and on a *dated* feed that is the more useful half: the row says what
happened on Tuesday, and the deltas say what the league has thought of it since.

**Three spans, 1d / 3d / 7d**, of the five the server can send. The board offers
all five and defaults four of them off, on the argument that five near-identical
signed columns at the front of the app's widest table is a resolution nobody
asked for; a feed is the opposite case, and the three *short* spans are the ones
a move a week old can still be read against — 15 and 30 would be a fortnight and
a month of drift over a transaction from Tuesday. A window the read found no
baseline for is simply absent from the response, so a young install draws
whichever of the three it has and no empty columns.

**Under the figure, not beside it**, which costs the row no height at all: the
percentage's line and the deltas' come to 32px between them, and the 32px
headshot beside them already set that. The two are one fact at two resolutions,
so a column reads as one thing where a run of four figures across would read as
four.

**The classes are folded onto the player page's own** (`.details-trend`,
`.details-trend-span`) rather than restyled to match: that header draws the same
object — a span label and a signed roster-% move, beside the same figure — so the
up/down vocabulary has one definition. All this caller differs in is a 10px label
under an 11px value, which is the same step down the 11-under-12.5 there is.

**It costs no request.** `App` already holds the deltas for the board's trend
columns and the player page's header; the tab is the third reader and takes them
whole, because it asks after one player at a time rather than merging a column
onto every row.

**A flat window prints `0.0` rather than nothing.** The server drops zeroes from
the wire to keep the blob small, so absence there means *hasn't moved* and the
figure is filled back in here — which is what keeps the column a fixed width down
a list of 418 rows, and what stops a genuine nought reading as a missing answer.
A player with **no** roster % at all draws no ownership block, deltas included:
a move with no figure to have moved is nothing to draw.

### On a phone the ownership column takes its own line

**The row's fixed costs are a 58px move word, a 32px circle, three 8px gaps and —
once the deltas joined it — a 151px ownership block**, which at 390 left the name
**53px** and ellipsized **all 42 of them**. Wrapping the block under the row
rather than dropping the deltas gives the name the whole first line (0
ellipsized) and costs the row ~17px, which on a scrolling feed is much the
cheaper of the two. It stays right-aligned there, so the percentages still line
up down the list.

**It is the one place the row wraps, and it does not undo the rule above it**:
what must not wrap is the *identity block*, which still ellipsizes, so a
nine-player trade is nine rows of two lines rather than nine paragraphs.

### Measured

**Driven against the built client and the live 12-team league**, at 320 / 390 /
640 / 900 / 1200 / 1920 in Midnight and Powder Blue:

- **Over the whole feed paged out — 250 transactions, 418 player rows —
  `0` transactions draw a drop above an add**, where the payload has 79 of them.
  A five-player trade's drawn order is byte-identical to the route's.
- **`0` bid chips and `0` `$` characters** anywhere in the tab.
- **415 of the 418 rows carry the ownership block and its three deltas**; the
  three that don't are the players the name-and-club join could not place, which
  is the same set that draws initials and a plain name.
- **The hairline** computes `1px` in each theme's own `--border` (`rgb(38,54,92)`
  / `rgb(180,207,230)`), and `0px` on the last row of every card.
- **The deltas** read `1d ▼1.5 3d ▲0.8 7d ▲0.9`, with `up` and `down` resolving
  each theme's `--hit` and `--strikeout` (`rgb(52,211,153)` / `rgb(248,113,113)`
  and `rgb(13,84,36)` / `rgb(163,21,31)`).
- **Row height** 40px from 640 up and 57 below it (the wrapped ownership line),
  against 32/32 before; **0 names ellipsized at any width in either theme**, and
  **page-body overflow 0** and card overflow 0 at all six.
- **With `/api/espn/ownership` blocked** the rows draw with no ownership block at
  all, the positions fall back to MLB's own word, and there is no error state —
  42 rows, `0` `.lg-tx-own`, `0` `.lg-tx-trends`, overflow 0.
- **The matchup page's Moves section is untouched**: 25 moves with the bid still
  in the tooltip (`Claimed · Aug 17 · $1`).

**Bundle: 544.45 → 545.25 KB of JS** (161.65 → 161.87 gzipped) and **145.50 →
146.00 KB of CSS** (25.93 → 26.02) — 0.8KB and 0.5KB raw, 0.2KB and 0.09KB over
the wire, for a sort, a hairline, a stacked column, a phone rule and the
paragraphs above restated where they apply.
