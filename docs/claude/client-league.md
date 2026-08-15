### The League view

Split into its own file for the reason `client.md`'s closing map gives: the
division is by **the surface being described**, and this is one — the only page
in the app about the *fantasy league* rather than about players.
`components/LeagueView.tsx` draws it; **ESPN fantasy league**, *The league
scoreboard*, is where the reads behind it and their caching live.

**It is a fourth pill rather than an entry in the fantasy popover**, and both
halves of that were live options so the argument is worth stating.

The popover is where everything fantasy already lives — the roster-source
toggle, `Refresh from ESPN`, the doorway to the league's settings form — and
that is exactly what it holds: **controls over the app**. Which list the roster
views read, a cache bypass, a form. A scoreboard is none of those; it is a
**page of data** a manager comes back to through a week, and putting it behind
a popover would file the app's second-largest table under a menu whose other
three entries are switches.

The app's own test for what earns a pill is the one that collapsed Games into
the Feed: **a sort order is not a page, a different question is.** Roster and
Feed are the same players over the same days read two ways; Research is the
whole league over a season. This is a fourth question — *how is my team doing
against the league* — and it is the only view that holds a matchup at all.
Nothing in it is a re-reading of anything: no other page in the app knows the
league has weeks.

**It needs a league where Research needs no roster**, which is the one way it
parts from the pill beside it. Research is always present precisely because it
depends on nothing the reader has to have set up; this depends on a connected
ESPN league, and a pill leading to a page that could only ever say *connect a
league* is chrome for a feature the reader hasn't got. So `espnConnected` gates
it — in **either** roster mode, since the league's matchups are a fact about the
league rather than about which list the roster views happen to be reading.

**`view=league` is nonetheless read off the URL before that status has landed**,
and the view's own empty state says why if there turns out to be no league.
Silently dropping a link to Roster would leave somebody who was handed one with
nothing on screen to explain where it went, which is the direction this app
declines to fail in.

**What it costs the tab row, measured on the same page in one browser** by
drawing the bar with the pill and then again with it removed, at 320 / 375 / 390
/ 640 / 900 / 1200 / 1920. The view switch goes **216 → 289px** at every width.
The bar's own height is **unchanged on the Roster, Feed and League views at all
seven** (159 / 111 / 111 / 111 / 115 / 115 / 115), and moves on the **research**
view at two of them: **207 → 255px at 390** and **115 → 161 at 1920**, which is
one wrapped line each. That is the same 46–48px the three include buttons cost
1920 and that dropping `Qualified` won back, spent again — and it is spent on
the board alone, because that is the one page whose tab row already carries a
whole control set. **No horizontal overflow of the page body at any of the seven
widths on any of the four views.**

### What is on the page

Two blocks, in the order the two questions come in, and the second is why the
page is worth having twice: the scoreboard answers *am I winning*, the table
answers *why*.

**The scoreboard** is a card per matchup — `.lg-matchup`, the app's own panel
gradient on `--radius` — with both teams named, their logo and record beside
them, the headline number at the right end of each row, and the category line
under both. **The reader's own matchup leads**, which is a sort rather than a
mark and is what actually gets it on screen without scrolling on a phone; the
accent border and the `Your matchup` label are what say *which* one it is once
several are in view. Both were needed: on a 12-team league the board is ten
cards, so a mark alone would have been a mark you had to go and find.

**The winning side of each category is green and the losing side muted**, which
is deliberately *not* the `--hit`/`--strikeout` pair this app uses for a delta.
Red on the loser would put ten red cells on one side of every card — the whole
row shouting where the job is to mark a winner — so the app's rule that colour
is spent on **state** is honoured by marking one state and letting the other go
quiet. A tie is `--faint`, neither. Each cell's `title` spells it out in words
(`Runs: 32 — winning so far`), the `so far` appearing on a live period alone.

### The headline is a triple, because a categories matchup has no single score

**A head-to-head categories matchup is won category by category**, so what a
side *has* is not one number: it is how many categories it is winning, losing
and tied in. A team up in six, down in three and level in one reads **`6-3-1`**.
The card printed the wins alone — a `6` beside a `3` — which left the reader to
work out how many of the ten were still level, or whether the other seven had
even been played.

**The triple is the server's own tally rather than a second count**, and that
matters because the tally is the thing that has been *checked*: ESPN fills its
`cumulativeScore` only once a matchup is over, so `espn.ts` computes it for
every matchup live and final alike, and the computed answer matched ESPN's on
all 1,080 category comparisons of the league's eighteen completed periods (see
**ESPN fantasy league**, *The category winner is computed here, not read*). The
client's own `outcome()` still decides the *cell* colours, which is a per-cell
question the tally cannot answer; what it does not do is add itself up into a
second definition of who is winning a category.

**All three terms, always**, where the season record beside it drops a zero tie
count (`record()` — `7-7` rather than `7-7-0`). Two reasons and the second is
the load-bearing one: the three are a partition of the categories, so the sum is
a fact a reader can check against the header above, which `6-3` cannot be; and
`7-7` as a season record and `7-7` as this week's categories would be the same
string meaning two different things an inch apart on one row.

**Only a categories league has this shape.** A points league has one number a
side and `score()` still prints `fmtPoints(side.points)`; a roto league has no
matchups at all and draws its own empty state. Both were driven with the
response stubbed rather than reasoned about — the points card reads `812.5` /
`774.25` with **no category grid at all**, and the roto one reads `No matchups
in this league`.

**Verified against ESPN over every settled matchup period of the live league**
(1–18, 108 matchups, 216 sides): the triple **sums to the ten categories on
216 of 216 sides**, **matches ESPN's own `cumulativeScore` on 216 of 216**, and
the side the triple implies is the winner agrees with ESPN's `winner` **and**
with the card's own `matchup.winner` on **108 of 108**. Live, week 19 reads
`7-1-2` / `1-7-2` and `3-5-2` / `5-3-2`.

### Batters and pitchers are two blocks, not one ten-column run

**The league's own category order interleaves the two sides of the ball** — the
live league scores `R HR RBI W ERA SB WHIP K OPS SVHD` — so a manager wanting to
know how his *pitchers* were doing had to pick four columns out of ten by eye.
A category league is read as two halves, because a manager's bats and his arms
are two rosters doing two jobs. So the line is two blocks, each with its own
head and its own two rows, under a small-caps `BATTERS` / `PITCHERS` label.

**And it is what stops the line overflowing a phone.** Ten columns at the grid's
`minmax(42px, 1fr)` want 438px inside a card that is 318px wide at 390 —
measured before the change, the category line **overflowed its own card by
118px** and scrolled sideways. Split, each half is five columns: measured after,
`scrollWidth - clientWidth` is **0 on both blocks at 320, 375, 390, 640, 900,
1200 and 1920**, with no horizontal overflow of the page body at any of them.
Each block's own `border-top` is the rule between the two, so the split costs no
new mark.

**A label line above each block rather than a leading column.** A left-hand
label column costs the card about 52px of *width* where a line costs it 14px of
*height*, and this card is width-bound rather than height-bound — the whole
reason the split was worth making. The card is 800px at 1200 and 346 at 390,
unchanged.

### Which side a category is on is the server's answer

**`categoryGroups` in `LeagueView.tsx` is the one place the split happens**, and
both the scoreboard's line and the Rankings table read it — so a cell, its
header and the block it belongs to cannot come to disagree about which column is
which. The two surfaces use it differently and deliberately: the scoreboard
*draws* the split (a labelled block per side, which is also what stops that line
overflowing a phone), where the Rankings table only *orders* by it and names the
side in each header's tooltip — see **The Rankings table groups its columns and
does not label them**, which is where that asymmetry is argued.

**It groups, it does not decide.** The side and the reading order ride on
`EspnCategory` off `STAT_META`, which is the only place that can say either: a
**label cannot**, because `H` is a hit and a hit allowed, `K` a strikeout taken
and a strikeout thrown, and `BB`, `HR`, `HBP` and `IBB` are each two categories
in that table under one abbreviation. Pattern-matching the labels here would get
four of them wrong on a league that scores both sides. See **ESPN fantasy
league**, *`STAT_META` says which side of the ball, and in what order*.

**The array on the wire stays in the league's own order**, and the client
regroups. The payload is a faithful record of what the league scores; grouping
is presentation, and putting it in the client means nothing server-side had to
learn about it — `sideFrom`, `getRankings` and the blob keys all index by
`statId` and are untouched.

**A category the table cannot place is drawn rather than dropped**, in a third
group called **`Other`** at the end. That is the honest bucket for an ESPN stat
id `STAT_META` has never been read against — the same one whose header already
reads `Stat 62` — because filing it under Batters would be a claim where a group
of its own is an admission. Driven with one category rewritten to an unknown id:
the card draws `Batters` (four), `Pitchers` (five) and `Other` (one), with
nothing lost from either real group. A group with nothing in it is not drawn at
all, so an ordinary league sees two — and on the Rankings table the group
**header row is not drawn at all below two groups**, a single spanning label
over every column being a row spent saying nothing.

**A bye is a real shape, not a failed read.** The live 12-team league's first
playoff round is 2 matchups and **8 byes**, so a card with one team on it and
the word `Bye` is the ordinary case in mid-September rather than an error state.

**The period is navigable and its dates are printed.** `‹ Week 19 · Aug 10 –
Aug 14 · Live ›`, with the two arrows as the app's `--control-h` icon square.
The dates are not decoration and the `Live`/`Final` tag beside them is what
makes them readable: a **live** period's totals cover the days played *so far*
(ESPN's `pointsByScoringPeriod` truncates at its own current day), so the span
and the tag have to be read together or the numbers claim a whole week they have
not had. Measured on the live league: week 19 reads `Aug 10 – Aug 14 · Live`
against week 18's `Aug 3 – Aug 9 · Final`.

**The forward arrow is disabled on the week being played and stays that way**,
because ESPN materialises no future matchup period at all — there is nothing to
navigate to. Disabled rather than hidden: a control that comes and goes is
harder to aim at than one that dims, and its absence would say nothing about
why.

**`mp=` is in the URL only once the reader has navigated off the current
period.** Absent means *the one being played*, which is a **rule rather than a
value** — the same reasoning that keeps a date preset in the URL as its label
rather than as two dates, so a link shared this week opens on the week the
recipient is in rather than on a frozen one. Driven in a browser: the current
period writes no `mp`, `‹` writes `mp=18`, `‹` again `mp=17`, `›` back to
`mp=18`, and `?view=league&mp=14` opens on `Week 14 · Jun 29 – Jul 5 · Final`.

**The season table** is every team against every one of the league's own
categories, sortable per column, with the reader's own row marked by an accent
ring on its team badge — see *The rank is a badge and the badge is the scale*
below, which is also where the 12% accent row wash this sentence used to
describe went and why. The team cell carries the logo, the name, and the record,
streak and (in a points league) the points total on a second line.

**A logo is an arbitrary third-party URL and is treated as one.** ESPN lets a
manager upload anything: the live league carries images on `thespun.com` and
`pbs.twimg.com` beside ESPN's own CDN. `onError` swaps to the club's
abbreviation rather than leaving a broken-image glyph, which is the fallback
`TeamMark` already makes for an MLB cap that fails to load.

**A second small sort rather than the research board's, and that is the lesser
evil.** The board's sort is written against its `Column` vocabulary —
`value`, `toValue`, `ascFirst`, forty definitions of a derived rate — and none
of that exists here: these columns are **discovered at runtime** from the
league's own `scoringItems`, so there is no `Column` to reuse and nothing but a
comparison over `Record<number, number>`. What *is* reused is everything a
reader can see. `.league-table` is folded onto `.glog-table`'s selector lists
(one gutter clamp, one zebra stripe, one pinned first column, one set of
paddings) and onto the board's `.research-sort` / `.research-arrow` rules, which
is where the reserved arrow box, the accent-on-active header and the focus ring
come from — so a sorted header here is the same object as a sorted header on the
board, by construction rather than by care. Two of the board's own rules come
with it: **`ascFirst` per column**, so ERA and WHIP open on their good end
(checked: one press of `ERA` gives ▲ and `3.29 · 3.45 · 3.61` down from the top,
where `HR` gives ▼ and `232 · 223 · 221`), and **nulls to the bottom in both
directions**, a team with no figure not having a bad one.

### The four league formats, and the two it refuses to guess at

**The view is honest about the league it is looking at**, which took reading
`mSettings.scoringSettings.scoringType` rather than assuming head-to-head
categories:

- **`H2H_CATEGORY` / `H2H_MOST_CATEGORIES`** — matchups with a category line.
  This is what the live league is (`H2H_MOST_CATEGORIES`) and what everything
  above was measured on. The two share a bucket because the scoreboard is the
  same object either way: what differs is only how the league's *standings* are
  kept, and those are read off `mTeam` rather than computed.
- **`H2H_POINTS`** — matchups with one number a side. Drawn: the card's headline
  number becomes `totalPoints` and the category grid is not rendered at all,
  since there is none. **Unverified against a real league** — there was one
  league to test against and it is a category league — so this is the one part
  of the page a reviewer should be sceptical of.
- **`ROTO` / `TOTAL_POINTS`** — no matchups by design. The scoreboard half says
  so, naming ESPN's own word for the format, and the table stands alone, which
  in a roto league is the whole of what the league *is*.
- **Anything else** — named and refused: `This league's scoring isn't supported
  yet`, with `scoringType` printed. The table still draws, since `valuesByStat`
  is there whatever the format. A wrong scoreboard drawn confidently is the
  failure being avoided; a named refusal is one a reader can act on.

### Loading, and every state that has nothing to show

The app's own discipline, unchanged. **Never over data**: the previous board is
left standing while the next is in flight (`setScoreboard` is called on success
alone), so pressing `‹` does not blank the page. A **block wait** only when
there is nothing yet, behind `useDelayedFlag`'s `WAIT_DELAY` — the spinning
baseball over `Reading your league's scoreboard`, which names what is being
read the way every other wait in the app does.

**Each empty state names its own cause**, driven in a browser with the relevant
response stubbed:

| state | what it says |
| --- | --- |
| no league connected | `No fantasy league connected`, over a button that opens the league page |
| cookies expired (409 `espn-auth`) | `Couldn't read your league` over ESPN's own message — *the espn_s2 cookie expires — sign in to ESPN again and re-copy it* |
| roto / total points | `No matchups in this league`, naming `scoringType` |
| a scoring type this page has not been read against | `This league's scoring isn't supported yet`, naming `scoringType` |
| a period ESPN has no schedule for | `No matchups in week N` |
| no teams at all | `No teams in this league` — usually a league id for another season |

**The 409 is handled rather than swallowed**, which is what the route's
`code: 'espn-auth'` is for: `api.ts` treats a 401 as an expired *Cognito* token
and retries it, so a credential problem answered as 401 would be a silent retry
loop. Measured with the scoreboard route stubbed to 409: the page draws
`Couldn't read your league` with ESPN's sentence under it, and the League pill,
the other three views and the page's own chrome are all untouched.

### What it draws and what it deliberately does not

The League page is neither a roster reading nor the board, so it carries **no
kind tabs, no date control, no `Starters` toggle** and none of the report's own
waits or empty states. Every one of those was gated on `view !== 'research'` —
right while Research was the only page that is not a roster reading, and the
League view is the second — so the nine render sites now read
`isRosterView(view)`, a named test over `summary | feed`. **The three *effects*
that carried the same string were left naming the board**, which is what they
always meant: the ownership read the board depends on, the statuses map it
draws, and the board's own fetch. Measured: on the League view `kind-switch`,
`date-toggle` and `starters-toggle` are each **0**, and on Roster and Feed each
is **1**, unchanged.

**The scroll offset keys on the view alone** (`'league'`), exactly as the
research board's does, because this page has no kind: it is one board about one
league.

### Measured

Driven against the built client and the live 2026 league at **390×844 and
1200×900**:

- **Page-body overflow 0** at both, and at 320 / 375 / 640 / 900 / 1920 as well,
  on all four views. (One real overflow was found and fixed on the way: at 320
  the `Bye` card's name carried `flex: none` beside `white-space: nowrap`, so a
  long team name pushed the `Bye` tag **3px past the edge of the page**. The
  name is elastic like every other row's now, `margin-left: auto` on the tag
  being what puts it at the right end.)
- **Week 19 · Aug 10 – Aug 14 · Live**, 10 matchups of which **8 are byes**, the
  reader's own first and the only one carrying `.lg-mine`.
- The category head reads `R · HR · RBI · W · ERA · SB · WHIP · K · OPS · SVHD`
  — the league's own ten, in the league's own order — and the two real matchups
  carry **17 wins, 17 losses and 6 ties** across the 40 cells they have between
  them.
- The table draws **12 rows** with **1** on the accent wash, its header the same
  ten categories, the pane bleeding to **0 from both edges** at 390 (`paneW`
  390, `paneL` 0) with the table itself 739px inside it.
- The card column is **346px at 390**, which is the app's own gutters.

**Bundle: 466.09 → 475.20 KB of JS** (138.60 → 141.24 gzipped) and **106.85 →
111.03 KB of CSS** (19.09 → 19.77 gzipped) — 9.1KB and 4.2KB raw, 2.6KB and
0.7KB over the wire, for a view, a route, a component and the paragraphs above
restated where the rules are.

### Three tabs, because they are three questions

**The page above is described as two blocks and is now three tabs** —
`Scoreboard`, `Rankings`, `Transactions` — and the passage before this one is
kept as written because its argument for the *page* is unchanged: this is still
the one view about the fantasy league rather than about players, and it still
earns a pill rather than an entry in the fantasy popover. What changed is that
one page holding a scoreboard with a season table stacked under it was a page
with one question and a half, and it has three:

1. **Scoreboard** — every matchup of one period, the category line under both
   sides. *Am I winning.*
2. **Rankings** — every team's figure in every category and where that figure
   stands, over a span the reader picks. *Why.*
3. **Transactions** — who added, dropped and traded whom. *What has been going
   on.*

**The season table moved into Rankings rather than staying beside the
scoreboard**, which is what makes the split three questions rather than two and
a leftover: it *is* the answer to "why", read the other way round.

### The period arrows live inside the Scoreboard tab

**A control above the strip is a control over the page, and this one governs
exactly one third of it.** Rankings has a span filter of its own — four named
cuts rather than a week at a time, which is a *different* question — and
Transactions is a feed with no period on it at all. Left above the strip,
`‹ Week 19 ›` would sit over two tabs it says nothing about, and a reader
pressing it on the Transactions tab would watch nothing happen.

The app's own precedent is the **date control**, which sits with the roster tabs
it qualifies and is hidden on the research board it does not. So the arrows, the
`Live`/`Final` tag and the dates go inside the tab they belong to, and
`Scoreboard` is a component of its own holding all four.

**`mp=` is therefore the Scoreboard tab's parameter alone**, and nothing about it
moved: absent still means the period being played, and `‹` still writes `mp=18`.

### Which tab is open is in the URL, and so is the span

**`lt=` for the tab and `lspan=` for the Rankings span**, both by the rule
`view=`, `win=` and `mp=` follow: each decides what data is on screen, so a link
that leaves one out describes a different page. The Scoreboard is the default and
is omitted, so a bare `?view=league` opens where the page always opened; `season`
is the span default and is omitted the same way.

**`lspan=` is deliberately not `win=`.** That one is the research board's own
window and means five different spans of a different thing; one parameter meaning
two things in two views is exactly the trap `cols=` avoids by being scoped to the
board `pos=` names. Neither name can collide: the app's other params are
`preset`, `start`, `end`, `player`, `view`, `kind`, `sim`, `hideil`, `starters`,
`sched`, `roster`, `pos`, `cols`, `inc`, `scope`, `watch`, `win`, `help`, `mp`
and `league`.

**Each tab's data is read on its first open and kept**, the way the player page's
tabs are — the scoreboard read is gated on `leagueTab === 'scoreboard'` and the
rankings on `leagueTab === 'rankings'`, and each of the three responses carries
its own `teams`, so no tab depends on another having been opened. Nobody who only
looks at the scoreboard pays for a 300KB aggregation of the first half.

**The transactions feed is the exception and is read on entry to the *view***,
any tab of it, and then kept (a `transactionsRef`, so the effect does not re-run
on its own result). It was gated on its own tab, on exactly the reasoning above,
and the dot below is what overrules it: *there are moves you haven't seen* is a
claim the tab row has to be able to make **before** the tab is opened, and
nothing else on the wire carries it. So the read moves one level out and the
86KB is paid on entry — answered from the server's own minute-long cache, and
about a tenth of that over the wire once `compression()` has had it.

### The page updates itself, a minute at a time

**Polling was half the fix, and on its own it fixed nothing.** The page was
still reported stale after the poll shipped, and the cause was not on this side
of the wire at all: ESPN's `cumulativeScore` — the figure every matchup cell is
drawn from — **stops at yesterday**, covering every scoring period of the week
except the one being played. A poll can only be as live as the number it
re-reads, and that number does not move until ESPN's nightly batch. The server
adds the missing day now; the whole of that measurement, the two guards that
keep it from double-counting at the rollover, and the `cumulativeScoreLive` dead
end are in **ESPN fantasy league**, *`cumulativeScore` stops at yesterday*. What
follows is the client half, which is unchanged by it.

**The three tabs are the one part of this app that describes something which
moves while you watch it**, and until now all three were read on entry and then
left: a matchup's category totals climb through an evening's games, the standings
under them climb with them, a leaguemate can drop somebody at any hour, and a
page anybody actually sits on quietly went stale. It polls now
(`App.tsx::LEAGUE_POLL_MS`), and the whole of the design is four rules.

**A minute, not the report's twenty seconds**, and the difference is what is
being watched. That poll tracks a *plate appearance* — the bases, the count, the
batter at the plate — where this tracks a **week's** totals, which ESPN's own
scoreboard does not move faster than about a minute anyway. The number is matched
to `espn.ts::LIVE_TTL_MS` so that a tick either reads a cache under a minute old
or goes and asks, which is the cheapest way to be a minute behind ESPN and no
more.

**Only what is on screen, and only what can still change.** The scoreboard is
polled when its tab is open **and the week it is showing is still being played**
— a settled period is read back off a blob with no freshness test at all, so
asking again every minute would be a request a minute to be told a fact. The
rankings are polled when their tab is open and the span can still move, which is
the span's own `live` flag **plus `season`**: that flag answers a different
question (*do these numbers include a week still being played*, which is what
puts `so far` on the caption) and is `false` for the season, whose figure is
ESPN's running total and accrues all year. The transactions feed is polled
whatever tab is open, because the dot in the tab row is drawn from it.

**Quiet, which is rule 1 of the app's loading discipline stated for a read
nobody asked for.** No wait goes up, nothing is blanked, and a tick that *fails*
leaves the last good answer standing with no error banner over it — a page that
has been readable for ten minutes must not become a message because one poll lost
its connection. Component state survives it by construction: the Rankings table's
sort and the Transactions list's paging are plain `useState` with nothing keyed
on the data, so a new object underneath them changes the numbers and not the
reading position.

**A hidden tab is skipped**, which is where this parts from the report poll
deliberately: a league read is 10–120KB upstream against a league that has no
idea we are doing it, and a forgotten background tab polling it all night buys
nobody anything. Becoming visible fires a tick immediately rather than waiting
out the interval, so what a reader returns to is current — which is also what
keeps the dot honest.

**What it costs upstream is one league's worth per minute, not one per
reader**, and that is the measurement the cadence rests on: the server's cache
is keyed by league, so twelve leaguemates all sitting on the page cost the same
one read a minute that one of them does. Measured through the route on the live
league, with no poller running: a live scoreboard is **536ms** at the first ask
past the minute and **3.7ms** inside it; a settled week is **271ms** (its
`leagueMeta`, since the matchups themselves come off the frozen blob) and 1.4ms;
the transactions feed 140ms and 3.2ms.

**`Refresh from ESPN` changed with it, and in two ways that were wrong before.**
It used to *drop* the client's copy of the feed, which re-read the same
ten-minute server cache — so the one button whose whole purpose is "I have just
made a move" could not actually reach past it. It now asks with `?refresh=1`,
and it **sets** the answer rather than blanking first, so the tab stays readable
while the read is out where a null left it empty until the reader navigated away
and came back. Only when there is a feed to refresh: a reader who has never
opened the League page is not made to pay for one by pressing it.

### The Transactions tab wears a dot when there are moves you haven't seen

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

### Rankings

**Each cell carries the rank under the figure, and carries the figure**, because
a rank with no number behind it cannot be acted on: `1st` is what you are looking
for and `12th` is what you are looking for, and the value is what you do about
it. The badge is **`.col-rank`**, the research board's own percentile badge,
folded onto rather than restyled — a second line under a number is one object in
this app.

**First place is marked and nothing else is**, which is the scoreboard's rule
arriving here rather than a new one: the winning side of a category is green and
the loser goes quiet, because ten red cells down one side of a card would be the
row shouting where the job is to mark a winner. A twelve-row table of ranks is
that same picture turned on its side.

### The Rankings table groups its columns and does not label them

**The two sections order the columns and are not drawn.** The `<thead>` was two
rows — `BATTERS` and `PITCHERS` spanning their own runs, over the sort headers —
with an inset-shadow hairline where the runs met. Both are gone, along with the
second sticky row and the `--lg-group-h` offset that held the sort headers under
it.

**What the labels said, the columns already say.** The argument for them was
that a bare rule between two columns *"says there is a seam here without saying
what is on either side of it"*, and that is true of the **rule**; it is not an
argument for the **words**, which on a ten-column table nobody needs — no reader
takes `ERA` for a batting stat or `RBI` for a pitching one. So a whole extra
pinned header row, a second pinning offset for the row under it, and a hairline
were being spent on a label the data carries.

**The grouping itself stays and is load-bearing**, which is why `groups` is
still what the table renders rather than the league's own array: it is the
server's `side`/`order` (see **ESPN fantasy league**, *`STAT_META` says which
side of the ball, and in what order*), and it is the only thing keeping the
batting run ahead of the pitching one. Measured after: `R · HR · RBI · SB · OPS`
then `K · W · ERA · WHIP · SVHD`, unchanged.

**And the side is still named per column, in the sort header's `title`** — which
is not a consolation prize but the half that matters. `H` is a hit and a hit
allowed, `K` a strikeout taken and one thrown, and `BB`, `HR`, `HBP` and `IBB`
are each two categories in `STAT_META` under one abbreviation, so on a league
scoring both sides the label alone is genuinely ambiguous where the tooltip is
not. Measured: `Batters · Runs — season`, `Batters · Home runs — season`.

**The caption above the table is the research board's spacing now**, which is
the other half of this change and was a plain inconsistency. `.lg-span-detail`
carried `margin: 10px 0 6px` on the reasoning that the first thing under a
pinned bar needs air — true, and the air was already there: the chrome's own
`margin-bottom` is 14px, so the caption's 10 sat on top of it and the line
landed **24px** down where the board's own count line lands at 14. They are the
same object — the one line between the controls and the rows, saying what is
under them — so the margin goes and the two now measure the same: **14px above
and 10 below**, the 10 being the pane's own margin exactly as it is over there.

**Measured at 390 and 1200, after.** Caption **14 above / 10 below** at both
(24 / 16 before). One `<thead>` row where there were two, **0** `.lg-group-row`,
**0** `.lg-group-start` and **0** cells painting an inset shadow. The single
header row pins at **1px** (the border) with the pane scrolled down, and the
badge column still pins at **0** with it scrolled to its far right. Rows
**61.55px**, table **824.7 / 1200px**, page-body overflow **0**.

**The scoreboard's own `BATTERS` / `PITCHERS` labels are deliberately kept**,
and the two cases are not the same one. There they head *a block of five
categories inside a matchup card*, which is what stopped that line overflowing a
phone by 118px (see the section above); the labels are the block's own heading
rather than a second header row over a table, and a card has no sticky head for
them to compete with. Checked after the change: all 10 matchup cards still draw
both.

### The rank is a badge and the badge is the scale

**More red the better the rank, more blue the worse, grey in the middle** — a
diverging scale over the teams ranked in one category. **It is on the chip,
where it used to wash the whole cell**, and the reader's own row is marked by a
ring on its team badge where it used to be washed accent-blue across all twelve
cells. The three changes are one change: there were three colour systems on this
table and now there is one.

**Why the cell wash went.** It had to be a translucent layer over whatever
ground the row resolved — that is what made it compose with the zebra stripe —
so it could only ever be faint (22% at its strongest, and 2% either side of the
middle, where it said nothing at all), and it painted a colour across the
**value** as well as the rank. A figure tinted by its own standing is the one
thing a raw number on this page is there to avoid: the whole argument for
carrying the value beside the rank is that *a rank with no number behind it
cannot be acted on*, and washing the number is that argument half taken back. On
the chip the scale can be strong enough to read at a glance and it stops where
the claim stops — `1st` is red, and the figure beside it is just the figure.

**Why the row wash went with it.** The reader's own row was a 12% accent
`--cell-bg`, which is one wash too many once every rank cell carries a colour of
its own: an accent-blue row under a column of blue-to-red badges is two scales
competing for one reading, and on the cold end of a category the two were very
nearly the same ink. The team's badge is where the row says who it is anyway —
the logo, the name and the record are all in those two cells — so the mark goes
there and the numbers are left to mean one thing. A **ring rather than a
border**, which is this app's own idiom for exactly this (the live-role ring is
a 2px `box-shadow` outside a 1px border): every image in the app is
`border-box`, so a real border would eat 2px out of a 26px badge and shrink the
picture, where a shadow is drawn outside it and costs the layout nothing. It
composes with `.lg-logo-none`'s own hairline, so a team with no logo is marked
as plainly as one with, and the cell's `title` names it in words
(`… — your team`) since a ring is a thing you see rather than a thing you can
read.

**The departure from the research board's rule is unchanged and still worth
saying plainly.** That board's stat columns are deliberately **monochrome** and
its percentile badges deliberately `--faint`, on the stated grounds that
*"colour is reserved for state"* — a heat scale there would be a second colour
system beside the live inning, the postponement and the trend. That rule is
right for what it governs: a six-hundred-row leaderboard whose job is to be
**scanned for names**. This table is the other thing. It is **twelve rows read
for standing**, it carries no live state at all, and where the board says *here
is a number, judge it* a league table says *here is where you are*. The colour
**is** the reading, and at this size it is the difference between finding your
weak category at a glance and reading a hundred and twenty ordinals. The board
is untouched, and `.col-rank` is still one object in this app — the League table
adds a fill to it and the two other callers draw it bare.

**It colours the rank and never the value**, which is what makes `lowerBetter`
need no special case at all: the server has already computed the rank with the
direction baked in (`rankBy`, 1 is best whichever way the category runs), so a
3.29 ERA and 232 home runs are both `1st` and both take the deepest red.
**Ties share a rank and so share a colour** by the same construction. `n` is the
teams *ranked in that category* rather than the twelve rows, matching the
badge's own denominator, so a team with no figure gets no badge at all any more
than it gets a rank.

**The fill carries the scale and the text does not**, and that is a measurement
rather than a preference. Colouring the *text* is the obvious first move — it is
what the old badge did on top of the wash — and it puts a mid-luminance red on a
mid-luminance ground: `--rank-hot` on the reddest chip is **3.09:1**, under the
4.5 an 11px label owes a reader, and no amount of tuning the tint fixes it
because both ends of the pair move together. `--text` on the same grounds is
**5.12:1 at its worst and 11.72 at its best**, measured over all 120 badges the
live board draws. `--panel-2` is the base the tone is mixed into, which is what
makes the middle of a category a plain neutral chip and the scale pass through
grey rather than through nothing.

**48% at the ends**, and the scale is symmetric and monotone in the rank —
measured on the live twelve-team board, `1st` resolves to `rgb(133, 76, 92)` and
`12th` to `rgb(60, 100, 158)`, with 6th and 7th within a few points of
`--panel-2` (`#1b2949`) either side of it. Opaque rather than a
`color-mix(…, transparent)` layer, unlike the wash it replaces: that one had to
let the zebra stripe through because it covered a whole cell, where a badge is a
discrete object and reads as one ink.

**The `1st`-in-green mark is gone**, and the paragraph it replaces argued for
keeping it: *it is a different layer from the wash — text over ground — and it
is the same green the scoreboard's winning category takes, so a reader who has
learned it on one tab reads it on the other.* That is true and it lost to the
scale. The scoreboard's rule is right for a card showing **one matchup**, where
the job is to mark a *winner*; this is twelve teams ranked in one category,
where the job is to say **where each of them stands**, and a green `1st` inside
a red-to-blue scale is a third colour system saying what the reddest chip
already says. First place is marked by being at the end of the scale.

**What it costs is 5px a row**, which is the honest price of turning a bare
second line into a chip: `56.55 → 61.55px`, measured by neutralising the pill's
own padding and margin in the page and reading the row back. It is the rank cell
that sets the row height (the team cell's own block is 28.78px inside 24px of
padding), so the whole of the 5px is the badge and none of it is anything else.

**Nothing else about the table moved**, re-measured at 390 / 1200 / 1920 on the
live twelve-team league: page-body overflow **0** at every width, the badge
column pinned at **0** with the pane scrolled to its far right, **120 badges on
12 rows**, the pane bleeding to **0 from both edges**, and no row hover or
pointer (`cursor: auto`). The reader's own row resolves the ordinary zebra
ground it shares with everybody else (`rgb(11, 18, 32)` against the striped
`rgb(22, 33, 58)`) where it used to resolve the accent mix, its badge carries
`rgb(56, 189, 248) 0 0 0 2px` and no other row's does, and `background-image` on
a rank cell is **`none`**. Sorting is untouched and was driven rather than
assumed — one press of `HR` gives ranks `1, 2, 2, 4 … 12` with the tie sharing
its rank, the group row still drawn and `aria-sort` naming exactly one column.

**Bundle: 498.60 → 498.59 KB of JS** (147.48 → 147.47 gzipped) and **117.22 →
117.10 KB of CSS** (20.83 → 20.82) — both *down*, which is what removing a
per-cell gradient layer, a row-wash rule and a green first-place override costs
when what replaces them is one pill rule and one ring.

**Sorting is on the rank rather than the value**, which is the one thing this
table does that the season table did not, and it buys the reader a rule they no
longer have to know: **every column opens on first place**, whichever direction
the category itself runs. It comes to the same thing where every team has a
figure, and where one doesn't it keeps that team out of the order rather than
filing him at one end of it — nulls to the bottom in both directions, the board's
own rule. The **span column sorts like any other column** and time order is what
sorting by it *is*, which is the Stats tab's answer to the same problem: a table
that already has an order must have a way back to it as cheap as the way out, and
a press on the leftmost header is that way in the grammar the reader has just
used to leave it.

**The span strip is drawn from what the server says it can serve**, not from a
list held here — so a season with no All-Star break in ESPN's calendar has no
halves at all, and April has no second half, rather than either being offered and
answering with an empty table. It is folded onto `.view-switch` / `.view-tab`
alongside the League strip itself, which is this stylesheet's standing rule: the
League tabs are the view switch one tier down and the span tabs are the research
board's window tabs asking the same shape of question about a different thing, so
both are that control and only their placement is their own.

**What each span covers is printed beside the tabs** — `Weeks 1–15 · Mar 25 –
Jul 19`, `Week 19 · Aug 10 – Aug 15 · so far`, `ESPN's own season line` — and it
is not decoration. `First half` is a phrase, and which weeks and which days it is
made of is the whole of what makes the numbers under it readable, which is the
same argument the scoreboard's header makes for printing its dates beside `Week
19`. `so far` is the other half of it: a span reaching into the week being played
is a total to date, and a bare `Season` over a figure that stops on Tuesday would
be a claim.

**`Current matchup` means the week being played, not the week the Scoreboard tab
is navigated to.** The tabs are independent pages of one view — which is the
whole reason the period arrows belong to the Scoreboard — and a span labelled
`Current matchup` that silently followed somebody else's arrows would be a label
that is false as often as it is true. Which week it is, is printed under the tabs.

**Where the five spans come from, which are ESPN's own and which are summed,
and why the halves are the regular season alone** are all in **ESPN fantasy
league**, *The Rankings tab, and the five spans*. The one thing worth repeating
here is the last of those, because a reader can see it: the two halves add up to
the season for the four teams in the winners' bracket and fall short by their
live week for the other eight, and `season` is kept as **ESPN's own figure**
deliberately — it is the number on ESPN's site and the number the old table drew.

### The Rankings table is the research board's, not the game log's

**It was folded onto `.glog-table` / `.glog-scroll` and that was the wrong table
to be.** The reasoning at the time was that both are "the app's plain wide stat
table with a sticky first column", which is true as far as it goes and misses
what the log actually is: a list of *one player's games*, read **down**, inside
an overlay. Its rows are presses, its table is `width: 100%` because fourteen
columns have to fit a box, and its cells paint an opaque `--bg` because nothing
underneath them ever changes colour. None of those three holds for twelve teams
by ten categories read **across**, which is the research board's shape exactly.

**Three faults came out of that one fold, and all three had a single cause.**
The team `<th>` carried `display: flex` — which takes a cell out of table layout
altogether, the trap this stylesheet already records for the game log's own
corner header, and which nothing in the build or the DOM reports. Measured on
the live 12-team league, before:

| | 1200×900 | 390×844 |
| --- | --- | --- |
| team cell width | **168px** | **168px** |
| its own header cell | 318.34px | 257.34px |
| pane horizontal scroll | **0** | 353px |

So the column and its header disagreed by 150px and 89px — the misalignment —
and the reader's own row wash (`.lg-row-mine`, a 12% accent over `--bg`) painted
**168px of a 318px column**, which is the *dark blue rectangle in the team
column* that was reported. The third symptom is the same sentence: with the
table still `width: 100%` there was nothing to scroll sideways at 1200 while the
cells were crushed to fit.

**What it takes from the board instead**, each answering one of those:

- **A table sized to its content** (`width: max-content; min-width: 100%`) inside
  a scrollport of its own, so a wide table overflows and the pane scrolls under
  it rather than the columns being squeezed into the window.
- **A ground named once as `--cell-bg`**, the rule the summary table states at
  length. The pinned column must paint the same colour as the row it belongs to,
  and a second declaration of that colour is a second thing to keep in step —
  which is precisely how the row wash became a rectangle. `.lg-row-mine` sets the
  variable rather than a `background`, so it resolves on every cell of the row
  including the sticky one.
- **The identity block is a `<span>` inside the cell**, not the cell itself —
  what `.row-id` already does on the two tables that draw one.
- **Both axes pinned**: the header row to the top, the team column to the left,
  the corner above both.

**And the tab is a fixed-height column** (`.app.league-rank-mode`), which is the
board's own `.app.research-mode` applied to the one League tab that is a table
rather than a list of cards. A sticky header can only stick to a box that
scrolls; without it the page grew, the header scrolled away with it, and reading
across meant taking the whole window along. **Scoped to the tab**: Scoreboard and
Transactions are card lists and keep the ordinary scrolling page (measured: the
`-mode` class is absent on both, and the document scrolls 275px and 1,668px
where Rankings scrolls 0 and its pane scrolls instead).

**No row hover and no pointer.** The log's rows carry both because a press there
opens that game; nothing in this table is pressable, so a tint following the
cursor offers something that is not there — and on touch, where `:hover` has no
way to end, it leaves the last row a finger crossed looking selected, which is
the app-wide rule set out in **Client**, *A card doesn't highlight when you
scroll past it*. The header buttons keep their own hover: those really are
controls.

**The pinned column is capped, because it is paid for out of the stats beside
it.** The board makes this trade explicitly — it pins the 42px headshot at every
width and only pins the *name* column from 820px up, on the grounds that below
that the pinned pair would eat two fifths of the screen. Uncapped, the longest
team name here took the column to **257px of a 390px phone**, two thirds of it,
leaving two categories reachable. Now the pinned column is the badge alone and
**the name is neither capped nor ellipsized**: it scrolls with the stats it is
being compared against, so it costs the reader nothing but the scrolling they
are already doing, and `Brian&Tom's Excellent Adventure` reading
`Brian&Tom's Excellent…` is the one thing a league table must not do — the row
*is* the team. Measured: 0 of 12 names truncated at either width.

**Measured after, at 1200×900 and 390×844:**

| | before | after |
| --- | --- | --- |
| team cell vs its header | 168 vs 318 / 168 vs 257 | **318 vs 318 / 257 vs 257** |
| `display` on the body `<th>` | `flex` | **`table-cell`** |
| distinct cell grounds on the reader's row | 2 | **1** |
| cells cover the row's width | no | **yes** |
| header row after scrolling down | scrolls away | **pinned, 1px** (the border) |
| team column after scrolling right 300px | — | **pinned, 0px** |
| row `cursor` | `pointer` | **`auto`** |
| background under the pointer | tints | **unchanged** |
| page-body overflow | 0 | **0** |

Sorting, the span strip and the URL are unchanged and were driven rather than
assumed: `HR` sorts to the leaders and reverses, `First half` loads and writes
`lspan=first` with `Weeks 1–15 · Mar 25 – Jul 19` under the strip, and switching
to Transactions from the navbar drops the fixed-height mode and draws 302 rows.

### Only the badge pins, and it is a circle

**The pinned column was the whole identity block** — logo, name and record — and
a pinned column is paid for out of the categories beside it. Uncapped, the
longest team name took it to **257px of a 390px phone**, two thirds of the
screen; capping and ellipsizing the name got it to 168 and four categories,
which was better and still the wrong shape. The board's own rule is the answer:
it pins the 42px headshot at *every* width and pins the **name** only from 820px
up, on the grounds that below that the pinned pair eats two fifths of the
screen. So the cell is two cells here — a `.lg-logo-col` holding the badge
alone, pinned, and a `.lg-name-col` holding the name over its record, which
scrolls away with the stats it is being compared against.

Measured: the pinned column is **49px at 1200 and 33px at 390** (one 26px circle
in its own gutters) against the 318/257 it was; after scrolling right the badge
sits at **0** from the pane's left edge while the name column has gone to
**−267**, which is the whole point of the split. The sort that belonged to the
team's identity stays on the **name** header — a badge column carries no label
and nothing to sort by — and the club's name and record are the badge cell's
`title`, so the row is still identifiable from the pinned part alone.

**The badges are circles**, which is what every other picture of a person or a
thing in this app already is: the headshot on three tables, the portrait on the
player page. A 6px corner made this the one mark in the app that wasn't.
`object-fit: contain` rather than `cover`, because these are arbitrary
third-party images at arbitrary aspect ratios and `cover` crops a wide badge to
its middle.

**A team with no logo gets a default image rather than its initials.** Three
letters in a circle read as a *broken* logo — the eye takes it as text that
failed to become a picture — where a plain mark reads as the absence of one,
which is the honest statement: this manager has not set one, or ESPN's URL for
it is dead. On a real league that is the ordinary case rather than the exception
(measured: **1 of 12** teams on the live league), which is why it is drawn with
as much care as the real thing. It is a baseball, because the app already has
one: `BaseballMark`'s own shape in `--faint`, so the default sits in the same
vocabulary as the roster mark and the spinner rather than importing a silhouette
from somewhere else. The abbreviation is not lost — it rides on the cell's
`title` with the name and the record.

### Four spacing and shape faults, and where each came from

Reported together after the rebuild, and each has its own cause rather than a
shared one.

**The pinned bar had a 14px strip of page above it, which no other view shows.**
`.app.league-rank-mode` is a fixed-height column with `overflow: hidden`, and
this stylesheet already records what that does to a sticky child: it makes the
column a scrollport of its own, and a sticky box in one is held against its
**padding** box, which undoes the chrome's negative top margin. The two views
that were fixed-height before this opt out of sticky explicitly for exactly that
reason (`.app.summary-mode .app-chrome, .app.research-mode .app-chrome`), and
the new mode simply had not joined the list. Measured: the bar sat at **y=14** on
Rankings against **y=0** on Research and Roster, and joining the list puts it at
0. Worth noting as a maintenance hazard — that rule is a list of modes, and a
mode added anywhere else in the app has to be added to it too.

**The caption had no air above it.** It is the first thing under the bar and
carried a bottom margin only, so it sat against the bar's own hairline as
though it were part of the chrome rather than the table's caption. `10px` on
top; measured 24px below the chrome and 16px above the pane once the strip
above went.

**The badge column had no gutter on its right.** It was given `padding-right: 0`
when it still held the whole identity block and the name sat beside the badge
inside the cell; with the name in its own column that put the image hard against
the column boundary, which on a pinned column reads as the picture having been
clipped. It takes the table's own gutter on both sides now — measured 22.8px at
1200 and 7.41px at 390, symmetric.

**The team name was truncated.** See the passage above: the cap and the ellipsis
were bought when the name was *pinned* and every pixel of it was paid for out of
the categories held beside it. That argument died with the pin and the rules
outlived it.

### The span strip is in the tab row, and its caption is on the table

**Both halves of that sentence were wrong before and they were wrong in opposite
directions.** The strip sat on the page with its caption beside it; the strip
belongs in the tab row with every other control of its kind, and the caption
does not belong with the strip at all.

**The strip** is the research board's window tabs asking the same shape of
question about a different thing — *which games are these numbers drawn from* —
so it takes that control's answers exactly: pills on a desktop, a native
`<select>` under 640px, **both rendered and swapped by one media query** rather
than by a JS media test that could drift from the CSS, which is the rule every
"pills on a desktop, dropdown on a phone" control in this app follows.
`.lg-span-select` is folded onto `.date-presets-select` / `.research-window-select`
/ `.research-pos-select` so all four are one control by construction, and the
pill row is hidden two classes deep (`.view-bar-tabs .lg-span-row`) for the
reason `.research-bar .research-window-row` is: the shared `.view-switch` rule
sets `display: inline-flex` later in the file and would otherwise leave both on
screen at once. Measured at 1200 the pills are `flex` and the select `none`; at
390 the reverse.

It is drawn from **`rankings.spans`** — the spans the server says it can serve
honestly — rather than from a list in the client, so a season whose All-Star
break ESPN's calendar does not show has no halves and April has no second half,
instead of either being offered and coming back empty. It renders only on the
Rankings tab, so the Scoreboard and Transactions carry no empty slot for it
(checked: absent on both).

**The caption** — `Weeks 1–15 · Mar 25 – Jul 19`, and `· so far` where the span
reaches into the week being played — sat beside the strip, on the reasoning that
it was a caption on the *control*. With the strip a tier away in the tab row
that would have stranded it up among the buttons, describing something two boxes
below it. It is the **table's** caption and now sits directly above the table,
which is where the research board keeps its count line and for the same reason:
the one thing between the controls and the rows describes what is under them.
Measured 16px above the pane at both widths.

Driven rather than assumed: the desktop pill and the phone `<select>` each write
`lspan=` and redraw the caption (`First half` → `Weeks 1–15 · Mar 25 – Jul 19`,
`Second half` → `Weeks 16–19 · Jul 20 – Aug 15 · so far`), the select keeps its
value across the reload, and sorting is untouched.

### The three tabs are in the app's tab row

**They rendered on the page, directly above what they selected**, which is where
a tab strip belongs when the page is all there is — and this app already has a
row for exactly that statement. `.view-bar-tabs` holds the view switch, the kind
tabs and the roster row's own controls, and its whole rule is that each group is
`flex: none` so the row fits as many whole groups per line as the width allows.
A second strip of tabs an inch under the first read as a different kind of
control rather than as one tier down of the same one.

So `App` draws them there, beside where the kind tabs go and under the same
condition — **only on the League view**, exactly as the kind tabs are drawn only
on the two roster views, so no other page carries an empty slot. `LeagueView`
keeps the vocabulary (`LEAGUE_TABS`, exported) and has no `onTab` prop any more.
The strip is still folded onto `.view-switch` / `.view-tab`, so it is the same
object as the pills above it by construction.

**The span strip lost its reading column with it.** It carried
`max-width: var(--card-column); margin: 0 auto` from when the page under it was
a list of cards; the table under it now spans the window, so a strip centred in
an 800px column floated in the middle of the page with the thing it governs
running past it on both sides. It sits at the app's gutters now, over a table
that bleeds past them — which is the arrangement the research board's own count
line already has.

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
a column rather than as something in the way of scanning the names. The
**headshot** is recognition, and the app's own way of naming a player everywhere
else. And the **club** is the cap logo with the abbreviation on its tooltip: on a
*fantasy* feed it is the least decision-relevant of the four, and drawn as `MIL`
it would have been a third string on a line already carrying two.

**The block is `PlayerIdentity`**, the same component the summary table and the
research board draw a name over a club and a position list with, and the position
itself is `lib.ts::positionCell` — one definition rather than a third copy, which
is the rule those two already state for each other. What this caller adds is the
two things a row in a *feed* needs of it: room to shrink, and a name line that
carries the trade destination and the waiver bid beside the name.

**The headshot is a plain image rather than a second link.** The name is 8px away
and is the press, so a 32px target beside it would only be a smaller version of
the same one — at the cost of a tab stop on every one of up to nine players in a
trade. And **no lineup pip and no `IL10` code**, which the two wide tables put on
a headshot: those read off `/api/statuses`, which this page does not fetch, and
they answer a question about *this afternoon* where every row here is dated — a
call-up's pip says nothing about the trade that moved him three weeks ago.

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
- **The five spans read**: `Season` (`ESPN's own season line`), `Current matchup`
  (`Week 19 · Aug 10 – Aug 15 · so far`), `First half` (`Weeks 1–15 · Mar 25 –
  Jul 19`) and `Second half` (`Weeks 16–19 · Jul 20 – Aug 15 · so far`), each
  writing its own `lspan=`.
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
