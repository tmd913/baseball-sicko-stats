### The league scoreboard

Split out of `espn.md`, which holds the league read this is drawn from. **The
league's own numbers**: the scoreboard and the day `cumulativeScore` leaves off,
how many acquisitions a manager gets, the stat-id table and which side of the ball
each is on, the matchup window, the Rankings tab's five spans and its summary
columns, and the transactions feed.

**Everything above is about players — who owns whom, who is eligible where, what
each manager has in his lineup — and the one thing a manager opens ESPN for is
the thing none of it could say: the matchups.** `getScoreboard` answers for one
matchup period's matchups and every team's season-to-date total in each of the
league's own scoring categories. See **Client — the League view** for the page
it draws.

**Which ESPN view carries what, measured against the live 12-team league rather
than assumed**, because three of them look interchangeable and are not:

- **`mScoreboard`** is the only one carrying `cumulativeScore.scoreByStat` — the
  per-category total for each side of a matchup, plus ESPN's own `result`
  (WIN/LOSS/TIE) once the matchup is over. It is what a scoreboard is made of
  and nothing else has it.
- **`mMatchupScore`** carries `matchupPeriodId` and `pointsByScoringPeriod` and
  **not** `scoreByStat` — its `statBySlot` is null on every row. What it is worth
  reading for is the **date span**: the keys of `pointsByScoringPeriod` are the
  scoring periods a matchup period covers, and they are the only published
  statement of which days a scoreboard's numbers are drawn from.
- **`mTeam`** carries `valuesByStat` — every team's **season** total in each
  category — beside its record, playoff seed and logo. That is the whole
  standings table in one 46KB read, and it is the read `getLeagueInfo` already
  makes with one view added.
- **`mStandings` is useless here** and was checked: its `teams` carry an `id`
  and nothing else at all.

### `cumulativeScore` stops at yesterday, and polling could not fix that

**The scoreboard was reported stale after the League page was given a
minute-by-minute poll, and the poll was not the problem: the number it was
re-reading does not move.** A matchup's `cumulativeScore` covers every scoring
period of the week **except `status.latestScoringPeriod`** — the day being
played — so through an evening's games it sits at yesterday's figure however
often it is asked for. Shortening a cache cannot reach that.

**Measured on the live league rather than reasoned about, and the first check
was inconclusive in a way worth recording.** Summing one team's per-day lineup
stats over the week reproduced its `cumulativeScore` exactly — which looked like
proof that today was included, and was not: that team's players had done nothing
yet that day, so a cumulative *excluding* today would have matched too. Run
across all twelve, every team whose players had produced that day was short by
**exactly** that day's contribution (Pirates Cove `25/9/27` summed against a
cumulative `22/8/24`, the day being `3/1/3`) and every team with a quiet day
matched. That is what makes the boundary a rule.

**And the summation is ESPN's own arithmetic, checked against a settled week.**
Rebuilding matchup period 18 from its seven scoring periods — summing the stat
lines of every player in a lineup, then recomputing the rate categories from the
components — reproduces ESPN's own final `cumulativeScore` for **120 of 120
cells to 4.9e-9**. So the fix is not an approximation of ESPN's number, it is
the same number computed a day earlier than ESPN gets round to it.

**`cumulativeScoreLive` is not the answer, and it was the first thing tried.**
The side object declares it beside `totalPointsLive`, which reads exactly like
the field this needs. It is **null on every side of every read** — bare, at
`scoringPeriodId=0`, and at the current day alike, 0 of 12 populated. A
points-league field this league never fills.

**So the live period's scoreboard adds the missing day**
(`espn.ts::scoringPeriodTotals`, `withScoringPeriod`): today's stat lines,
summed over the players in a lineup, added to `cumulativeScore`'s components,
with every rate category rebuilt from those components afterwards — the rule
`getSpanTotals` already obeys, because a rate does not add. Two guards make it
safe rather than merely right this afternoon:

- **Today is added only when ESPN's own latest scoring period falls inside the
  week being built.** ESPN's nightly batch (03:39–05:19 ET, measured under *The
  anchor is derived from ESPN's calendar*) folds the finished day into
  `cumulativeScore` and advances the pointer to a day that belongs to the *next*
  matchup period — which fails the test, so a settled week never has a day put
  back on it and no day is ever counted twice. A frozen period is untouched
  either way.
- **Today can move a number ESPN already gave a side and can never invent one.**
  A category a side is ineligible for is absent by `sideFrom`'s own rule, and
  putting it back as a day's total would read, in a `lowerBetter` category, as
  the best score in the league.

**The bench and IL are excluded** (`NON_ACCRUING_SLOTS`, ESPN's slots 16 and
17), which is what the 120-of-120 check validates: everything else counts, the
same fail-safe direction `toRosterPlayer` takes for the slot chip.

**Which view to read it from was chosen on payload**, measured on one matchup
period of the live league: `mScoreboard` at `scoringPeriodId=0` is **23KB and
carries no roster at all**, the same read at the day is **488KB** and carries
both, and **`mMatchupScore` at the day is 208KB** and carries the roster without
the scores. So the live path is **two reads at 231KB** rather than one at 488,
and the frozen path keeps the 23KB read it has always made. A failed second read
costs the live day and leaves the week standing.

**The Rankings tab takes the same fix on the same day**, because its `Current
matchup` span is the same week the Scoreboard draws and the two must not
disagree — checked after the change: **120 of 120 cells identical, worst delta
0**. The halves and the playoff span get it too, being the same
`getSpanTotals` path; a frozen span never receives a day and its blob stays
clean. **`season` deliberately does not**: that column is ESPN's own published
season line, and a figure of ours that silently disagreed with ESPN's own site
would be worse than one that lags with it. (It has a second quirk of its own
that has nothing to do with today, already recorded below: it counts a playoff
week only for the teams still in the winners' bracket — measured, the eight
teams on a bye are short by exactly their week's total.)

**Measured through the route**: a live scoreboard is **698ms** cold against the
536ms it was, and **2.1ms** warm; a settled week is **1.8ms**; the live rankings
span **743ms** cold and **1.5ms** warm. The response itself is unchanged in size
— only the numbers in it moved. And they do move: sampled a minute apart with
games in progress, `Let's Go Mets OPS 0.909 → 0.913`, which is a cell that could
not have changed at all before this.

**`scoringPeriodId=0` is what makes the scoreboard affordable, and it is the
measurement worth keeping.** `mScoreboard` embeds two whole rosters per side —
`rosterForCurrentScoringPeriod` and `rosterForMatchupPeriod`, ~43KB a team —
which is the entire payload: one matchup period comes to **524,565 bytes**.
Naming a scoring period that is not a day empties both while leaving
`cumulativeScore` untouched, that being a fact about the **matchup** period
rather than about a day: **23,759 bytes**, a 22× reduction, and the category
scores are **byte-identical** (re-checked with games in progress: 0 differing
cells of 12 sides — what it drops is the *roster*, and with it the live day the
section above has to read separately) — checked field by field over all 10 matchups of a
period, both sides, 18,102 bytes of scores, `IDENTICAL: true`. It is the same
trick `forTeamId` plays for the per-day roster read, arrived at from the other
end: there the payload is narrowed to one team, here to no day.

**`X-Fantasy-Filter` does the narrowing server-side**, which is the first time
this file has needed it, so `leagueGet` gained an optional fourth argument that
becomes that header. `{"schedule":{"filterMatchupPeriodIds":{"value":[19]}}}`
returns that period's matchups alone where the season's 118 come back without
it. `filterCurrentMatchupPeriod` answers identically and is deliberately **not**
used, for the reason the whole of this file distrusts ESPN's own pointers.

**Which period is the current one is read off the schedule, not off ESPN's
pointer** — the rule this file has followed since the scoring-period anchor.
ESPN materialises **no future matchup periods at all** (checked: the schedule's
highest is exactly the one being played, 19 of a 21-period season), so the
highest period the schedule carries **is** the current one, as a fact about the
data rather than a claim about a clock. `status.currentMatchupPeriod` is kept as
the fallback and agrees today.

**What that cannot fix, and does not pretend to.** Between our 3am rollover and
ESPN's own nightly batch — the ~90-minute window **The anchor is derived from
ESPN's calendar** measures at 03:39–05:19 ET — ESPN has not yet opened the new
matchup period, so on a Monday morning the highest period it carries is the week
that has just ended. There is nothing to read for the new one, by anybody. That
is shown as what it is: the period's own dates, and `Final` rather than `Live`,
with the arrows to move. A wrong week silently labelled "this week" is the
failure being avoided, and **printing the dates is what avoids it** — which is
also why the header prints them rather than a bare week number.

**The dates come from the anchor run backwards.** `dateForPeriod` is
`getPeriodAnchor`'s arithmetic the other way round (`addDays(anchor.date, period
− anchor.period)`), so one pair dates every period of the season and a failed
schedule read costs the header its dates and nothing else.

**The category winner is computed here, not read.** ESPN fills `result` and the
wins/losses/ties tally only once a matchup is **over**: a live one comes back
with `result: null`, `wins/losses/ties: 0` and `winner: 'UNDECIDED'`, so a page
that only reported ESPN's answer would say nothing at all about the week being
played — which is the week anybody is looking at. So the comparison is done here
for every matchup, live and final alike, honouring `isReverseItem` (ERA and
WHIP, where the smaller number wins).

**Checked against ESPN's own answer rather than reasoned about.** Over all 18
completed matchup periods of the live league — **108 matchups and 1,080 category
comparisons** — the computed per-category result matched ESPN's `result`
**1,080 of 1,080**, the computed matchup winner matched ESPN's `winner` on all
108, and the computed win/loss/tie tally matched ESPN's own `cumulativeScore` on
all 108. So a live matchup and a final one are drawn by one arithmetic, and that
arithmetic is known to reproduce ESPN's. `ineligible` was scanned for over the
same **5,244 score cells** and is false on every one; it is honoured anyway,
since a category a team cannot score in is not a category it is losing, and a
zero in a `lowerBetter` category would otherwise read as the best score in the
league.

**That tally is what the scoreboard's headline now prints** — `wins`/`losses`/
`ties` per side, as `6-3-1` rather than the bare wins the card used to show, so
the one number on the card is the one number this file has measured against
ESPN. Re-checked end to end through the route over all 18 settled periods: the
triple **sums to the ten categories on 216 of 216 sides** and **matches ESPN's
own `cumulativeScore` on 216 of 216**, with the winner it implies agreeing with
ESPN's `winner` on 108 of 108. See **Client — the League view**, *The headline is
a triple*.

**A bye is a real shape.** A matchup with a `home` and no `away` is what a
playoff round looks like — period 19 of the live league is 2 matchups and **8
byes**, all 12 teams accounted for — so `EspnMatchup.away` is nullable rather
than the read being treated as malformed.

**And a bye side carries the period's own totals**, which is what makes it worth
drawing rather than announcing: ESPN fills `cumulativeScore` for a bye exactly
as it does for a matchup — checked on the live league, all 23 stats with the
*week's* figures rather than the season's (24 R, 7 HR, .677 OPS). Nothing here
had to change for it; the card was simply declining to read them. See **Client —
the League view**, *A bye card shows his week*.

### How many acquisitions a manager gets, which ESPN does not publish

**`transactionCounter.matchupAcquisitionTotals` on every `mTeam` row is how many
he has *used*, per matchup period** — `{"1": 9, "2": 5, …, "19": 7}` — and it
rides on the standings read `leagueMeta` already makes, so the count costs no
request at all.

**The limit is not published and has to be derived.** What ESPN gives is
`acquisitionSettings.matchupAcquisitionLimit` — **0.7142857142857143** on the
live league, with `matchupLimitPerScoringPeriod: true` beside it — which is the
limit *per scoring period*. 5/7 is exactly 0.714…, so an ordinary seven-day week
is 5.

**How many days a period has is the part that needs care**, because neither
source is right on its own:

- The **observed span** — the scoring periods `pointsByScoringPeriod` reports,
  which `leagueMeta` already computes for the header's dates — is exact on a
  settled period and catches the two that are not seven days: **period 1 is 12**
  on the live league (the season opened mid-week) and **period 15 is 14** (the
  All-Star break falls inside it). But it **truncates at ESPN's own current
  day**, so the period being played reads short — 7 for a two-week playoff
  round.
- The **declared length** (`scheduleSettings.matchupPeriods`, which maps a
  period to the *weeks* it covers — `{"1": [1], "19": [19, 20]}`) is right about
  the playoff round and wrong about both of the others, knowing nothing of an
  opening stretch or a break. Note it is **weeks, not scoring periods**: a
  reading of it as days gives 1 and is wrong by an order of magnitude.

So `acquisitionLimitFor` takes the **larger of the two**, which needs no
live/settled branch and is principled rather than lucky: the observation is a
lower bound because it truncates, and the declaration is the nominal length, so
a period is at least as long as both.

**Checked against every team's own totals rather than reasoned about.** Over the
live league's **185 team-periods, 0 are over the computed limit and 55 are
exactly at it** — a cap 55 managers hit and none exceeded. The four periods that
are not 5: **1 → 9** (12 days), **15 → 10** (14), **19 → 10** (a fortnight's
playoff round), every other week **5**.

**A team with no key for the period has used none**, not an unknown number:
`matchupAcquisitionTotals` carries a key only for the periods a manager actually
moved in, so a quiet week is a missing key. Null is kept for a team ESPN
reported no counter for at all, which is a different fact and draws nothing.

**`espn-scoreboard-…` went to `-v2`** for it, and this is the hazard that key
exists for stated plainly: a settled period is read back with **no freshness
test**, so a v1 blob deserializes with `acquisitions` missing and every finished
week would have gone on serving sides with no count while the live one had them.
Measured before the bump: `undefined` on every side of period 18 against a
working 19.

**The stat ids are a curated table, because ESPN publishes no dictionary of them
anywhere.** Checked against the game-level `seasons/{year}`, `kona_game_state`
and every league view: none names a single stat. So `STAT_META` is the same
shape `pitchLeague.ts` takes for its league averages, and the honest failure is
a header reading `Stat 62` rather than a wrong one. **Twenty-three entries were
confirmed arithmetically** against the live league rather than taken on trust,
by checking identities the numbers themselves have to satisfy: `41` is
`(37 + 39) / (34 / 3)` to eight places (1.24968711 from 1,440 hits and 557 walks
over 1,598 innings), `47` is `45 × 9 / (34 / 3)` (3.92553191 from 697 earned
runs), and `83` is `57 + 60` (2 = 1 + 1). Those are 0, 1, 3, 4, 5, 10, 12, 13,
18, 20, 21, 23, 34, 37, 39, 41, 45, 47, 48, 53, 57, 60 and 83 — this league's
own 23. **The rest are the community mapping `cwendt94/espn-api` uses and are
unconfirmed**: a league scoring quality starts or complete games is a league
this table has never been read against. Each entry also carries a `format`, and
getting *that* wrong is the difference between an ERA and an OPS — `avg` prints
`.759` the way a slash line is written, `rate` prints `3.93`.

**Two `avg` entries are named "percentage" and are still `.xxx`, deliberately**:
`55` (WPCT) and `59` (SV%) are shares, and baseball writes both with a leading
dot exactly as it writes on-base *percentage* and slugging *percentage* — which
is why the app's rule (see **Client**, *A rate is `.xxx` and a share is a
percent*) is a table of stats rather than a test on the name or the value. Note
what makes SV% the closest call in that table: ESPN's own label carries a `%`
where WPCT's does not. It is left as `avg` on the convention, and it is
**unverified against a real league** — the live league scores neither, so
nothing here has ever drawn either cell. ESPN sends every `avg` category as a
proportion (measured: OPS arrives as `0.75955848`), so a future `pct` format
would need the ×100 rather than only the suffix.

### `STAT_META` says which side of the ball, and in what order

**Each entry carries a `side` (`batting` / `pitching`) and an `order`**, and
both ride out on every `EspnCategory` — which is what lets the client draw the
scoreboard's line and the Rankings table as **Batters** over **Pitchers** (see
**Client — the League view**). It has to be declared here rather than inferred
from the label, because **a label cannot say it**: `H` is a hit and a hit
allowed, `K` a strikeout taken and a strikeout thrown, and `BB`, `HR`, `HBP` and
`IBB` are each *two* entries in this table under one abbreviation. Any rule
written against the labels gets four of them wrong on a league that scores both
sides.

**The order is a reading order rather than the league's own**, and each side's
is a rule rather than a taste:

- **Batting** — the counting stats in the order a box score lists them (R, hits,
  the extra-base ladder, HR, RBI, the steals, the walks and strikeouts), then
  the rates in slash-line order (AVG, OBP, SLG, OPS).
- **Pitching** — the **starter's line first**, its counting stats before its
  rates, with the **relief categories trailing everything**: a save or a hold is
  a role a manager fills a slot for rather than something a season accrues, so
  SV, HD, SVHD, SVO, BS and SV% come after the ERA and the WHIP.

On the live league those two rules give **`R · HR · RBI · SB · OPS`** and
**`K · W · ERA · WHIP · SVHD`**, which is how a 5x5 is written.

**`other` is a real third answer rather than a failure bucket.** A stat id this
table has never been read against — the same one whose header already reads
`Stat 62` — gets `side: 'other'` and an order of its own id, and the client
draws it in a group of its own rather than filing it under a side nothing
establishes it is on. That is the same honesty the label already has.

**The wire keeps the league's own order.** `categories` is a faithful record of
what the league scores and nothing server-side reads the array's order — every
consumer indexes by `statId` — so the grouping is the client's and the payload
is unchanged apart from the two fields. **No blob key moved**: nothing in
`espn-scoreboard-…` or `espn-span-…` holds a category, and a stored blob
therefore cannot deserialize with either field missing.

**Four formats, and only two of them have matchups** (`formatOf`).
`H2H_CATEGORY` and `H2H_MOST_CATEGORIES` share a bucket, the scoreboard being
the same object either way and the difference being only how the league's
standings are kept — which are read off `mTeam` rather than computed.
`H2H_POINTS` is matchups with one number a side. `ROTO` and `TOTAL_POINTS` have
**no matchups at all**, so `getScoreboard` does not even issue the scoreboard
read for them and the client draws the table alone; anything else is `unknown`,
named on screen rather than guessed at. **Only the category case is verified
against a real league** — there was one to test against — which is worth
knowing before trusting the points-league card.

**Caching, on this file's own two rules.**

- **The league's own facts** (`leagueMeta` — teams, records, `valuesByStat`, the
  categories, and the whole season's period spans) are two reads, **49,749 +
  70,794 bytes**, cached in memory per league on **`LIVE_TTL_MS` (1 min)** with
  an `inFlight` guard, so a cold Lambda serving three tabs sends one upstream
  rather than three. The season's spans are read unfiltered because the point of
  them *is* the season: they date every period and they are what tells the
  client which periods exist. **A minute rather than the rosters' ten**, and
  `valuesByStat` is why: it is the Rankings tab's **season** column and it
  accrues while games are being played, so on the rosters' clock the one span
  that reads ESPN's own running total would have been the one span on the page
  that did not move.
- **A finished matchup period is a fact**, so it takes a storage blob read with
  **no freshness test** — `espn-scoreboard-{leagueId}-{period}-v1.json`, **3,396
  bytes** on a checked week — which is the rule `espn-lineup-…` already follows
  for a finished day's roster and for the same reason: you cannot retroactively
  score a run in a week that is over. The period being played is memory-only on
  **`LIVE_TTL_MS`**, a minute, which is the cadence the League page's own poll
  reads through (**Client — the League view**, *The page updates itself, a
  minute at a time*) — so a reader sitting on the scoreboard is never more than
  about a minute behind ESPN, and a settled week costs nothing at all.
- **`?refresh=1` drops every period of the league from memory**, not just the
  one asked for — "read my league again" is a statement about the league rather
  than about a week, which is exactly what `getOwnership` says — **while the
  frozen blobs stand**, since re-reading a settled week would spend an ESPN
  request to be told what the blob already says. That is `getTeamRoster`'s
  `stale = force && !frozen` applied one level up.

**Measured against the live league through the route**, each cold figure from a
fresh process: the **current** period **10,023 bytes in 470ms**, a **finished**
one **9,876 bytes in 282ms** cold and **2.7ms** off its blob, and the current
period **1.7ms** warm in memory. A period the league has no row for falls back
to the current one rather than answering with an empty board the reader could
not explain (checked: `?period=999` → 19). **Re-measured against the live TTL**
with no poller running: the live period is **536ms** at the first ask past the
minute and **3.7ms** inside it, and a settled week is **271ms** — which is its
`leagueMeta` and not its matchups, those coming off the frozen blob — and 1.4ms.

### The matchup window: which days this week is, and which days next week is

**The Schedule view offers a fantasy *matchup* as a span, and the two dates it
needs are the two the scoreboard cannot give.** `getScoreboard` publishes a
`start` and an `end` and they are the **observed** span — the scoring periods
`pointsByScoringPeriod` actually reports, which for the period being played
**truncates at ESPN's own current day**. A forward-looking view asked for "this
matchup" and would have been handed a window ending today. And `nextPeriod` is
null on the current period by construction, ESPN materialising no future matchup
period at all, so next matchup is not in that payload in any form.

**So both are derived, by `acquisitionLimitFor`'s own rule one step further
on**: a period is at least as long as the larger of what has been *observed* of
it (a lower bound, since it truncates) and what the league *declares* —
`scheduleSettings.matchupPeriods`, which maps a period to the **weeks** it
covers, `{"19": [19, 20]}` being a fortnight. The next period then begins on the
day after this one ends, because **matchup periods are contiguous**, and runs
for its own declared weeks. `dateForPeriod` turns both ends into ET days off the
period anchor.

**Checked against the live league rather than reasoned about.** Over its 19
materialised periods the observed spans are contiguous with **0 gaps**
(`first(p+1) === last(p) + 1` on all 18 joins), and the declaration never
overstates an observation — 7 against 7 on the ordinary weeks, 7 against period
1's **12** (the season opened mid-week) and period 15's **14** (the All-Star
break falls inside it). So `max(observed, declared)` reproduces **every settled
period exactly**, and on the live one it is the declaration that corrects the
truncation: period 19 observed 139–145 (seven days, cut at today) and declared a
fortnight reads 139–152, which through the route is **Aug 10 – Aug 23**, with
next reading **period 20, Aug 24 – Sep 6**.

**Which is also the honest failure, and it is worth naming**: a period that is
*longer* than it declares and is still being played — period 15's fortnight,
mid-break — reads short until observation catches it up. It errs toward showing
fewer days than the period has, never more, and it corrects itself day by day.

**`matchupPeriods` declares every period of the season** (1…21 on the live
league, past the 19 the schedule has materialised), so whether there *is* a next
matchup is that key existing rather than a guess.

**It costs no new upstream.** `leagueMeta` is the two reads the League page
already makes (49,749 + 70,794 bytes, cached per league on `LIVE_TTL_MS`), so
this is those two dates falling out of a payload the file already parses;
measured through the route, **103 bytes**. The client reads it once per session
on a connected league, the terms the ownership map is on.

### The Rankings tab, and the five spans

**The season table the League page opened with was the raw values, and a value
is only half of what a manager wants from it.** 232 home runs is a lot or a
little depending on the eleven numbers beside it, and the reader was doing that
comparison by eye down a column of twelve. `getRankings` answers with the figure
*and* where it stands, over one of five spans — and the whole of the work was
establishing which of those four could be answered honestly.

**ESPN will not aggregate a stat over a span, and every way of asking was
tried.** `mTeam`'s `valuesByStat` is the **season** and only the season: naming
a `scoringPeriodId` leaves it byte-identical (checked at `sp=100` against the
bare read), and every span filter there is comes back **400** —
`filterStatsForTopScoringPeriodIds`, `filterScoringPeriodIds`,
`filterStatsForMatchupPeriodIds`, `filterStatsForSplitTypeIds` and
`filterStatsForExternalIds`, each rejected outright.

**What answers it is a measurement on a payload this file already reads.**
`mScoreboard`'s `cumulativeScore.scoreByStat` carries **all 23 stats ESPN
tracks** — the *components* (AB, H, 2B, 3B, HR, BB, HBP, SF, outs, hits and
walks allowed, earned runs) as well as the ten this league scores. So a span is
the **sum of its matchup periods**: the counting stats add, and the rate
categories are **recomputed from the summed components** rather than averaged,
which would be wrong in exactly the way averaging sixty daily barrel rates is
wrong in `statcastWindow.ts`.

**Verified against the one span ESPN does publish**, which is the check the
whole design turns on. Summing `scoreByStat` over a prefix of matchup periods
reproduces every team's `valuesByStat` **exactly — all 12 teams, all 20 counting
stats to the unit, and OPS, WHIP and ERA to within 5e-9** over all 36 of them.
The prefix is 1..18 for eight teams and 1..19 for four, and that difference is
ESPN's own quirk rather than a fault in the arithmetic: the four are the ones in
the **winners' bracket** in the live period 19, whose stats ESPN counts toward
the season line while the consolation ladder's are not yet counted. Every team
is reproduced by *some* prefix, to machine precision, which is what makes the
summation trustworthy.

**So all five spans are served and none is faked.** `matchup` and `season` are
**ESPN's own numbers** — the current period's `scoreByStat` and `valuesByStat`
respectively — and the two halves are ours; where ESPN publishes a figure this
reads it, and it computes only where ESPN publishes nothing. What *is* refused
is a category with no derivation from the components in hand (opponent batting
average, runs created): `DERIVED` names the stat ids each rate needs and a span
missing any one of them yields **null**, which the client dashes rather than
summing a rate as though it were a count.

**The halves are the *regular season*, and a fifth span carries the bracket.**
The spans were four and the two halves were cut over every period the schedule
carried — which on the checked league meant period 19, **the first playoff
round and already being played**, was landing in "Second half" and being counted
as regular-season play. ESPN says where the regular season ends and the schedule
does not: `settings.scheduleSettings.matchupPeriodCount` is **18** on that league
against a schedule running to 21 (`playoffMatchupPeriodLength: 2`,
`playoffTeamCount: 6`), and period 19's matchups carry
`playoffTierType: WINNERS_BRACKET | LOSERS_CONSOLATION_LADDER` where 18 and
below carry `NONE`. So `halvesOf` takes `regularPeriods` and filters to it, and
**`playoffs`** is the periods past it that the schedule actually carries — 19
today, growing to 21 as the bracket is played, so a round nobody has reached is
absent rather than offered empty.

**The order is `Current matchup · Season · First half · Second half ·
Playoffs`**, and the week being played is also the **default**. Season led for a
while, on the argument that a manager reads the whole year first and then the
narrowing — which is how a *reference* table reads and is not what this is. The
Rankings tab is opened in the middle of a matchup to find out which categories
are being lost **this week** and what can still be done about it; the season
line is the context for that rather than the question. The two are one decision
in the code: `asked` falls back to whichever span leads the list (`spans[0]`)
rather than to a named constant, so the order and the default cannot come to
disagree. `season` is the floor under that, being the one span every league has
— it is ESPN's own line and needs no matchup period at all.

### Three summary columns: overall, batting, and pitching

**A column of ten ranks cannot say how a team is doing overall**, and that is
the question a manager reads a league table with: `2nd · 5th · 1st · 9th · 3rd`
down a batting run is arithmetic he is doing in his head. So each side of the
ball gets a column of its own (`EspnRankSideTotal`, one per side the league
actually scores), drawn at the head of its own group.

**The figure is roto points** — `n + 1 − rank` summed over that side's
categories, so first in a twelve-team category is worth 12 and last is worth 1.
That rather than a mean of ranks for three reasons: it is the currency every
categories league already keeps its standings in; it goes **up** with quality
like every other value in the table, where a mean of ranks would be the one
column reading backwards; and it needs no case for a tie. The direction is
already baked in by `rankBy`, so a `lowerBetter` category needs no case of its
own either — 1 is the best ERA and the most home runs alike, and both are worth
the same points.

**A tie shares the better points, deliberately**, where roto's own convention
splits them (two teams tied for first take 11.5 each). This column is computed
from the ranks printed beside it, and those share a rank and skip the next
(1, 2, 2, 4) because that is what every league table does — so a reader adding
up the ranks he can see has to get the number the column shows. The visible cost
is that a side's points no longer sum to a fixed `categories × n(n+1)/2`:
measured on the live league, batting comes to **408** against that formula's 390
and pitching to **404**, and both excesses are *exactly* the `k(k−1)/2` their tie
groups predict (**18** and **14**). That is the arithmetic agreeing with the
table rather than drifting from it.

**A team not ranked in a category earns nothing there**, the direction every
absent figure here fails in, and `categories`/`of` ride along so a short total
says so in the cell's own tooltip rather than looking like a bad one. A team
ranked in none of a side's categories has **no total at all** rather than a
total of nought.

**`OVR` is the same arithmetic over every category the league scores**, which
makes it the roto total — and, because both are `n + 1 − rank` added up, it is
**`BAT` + `PIT` by construction** rather than by two computations that happen to
agree (one `totalOver` serves both, given a different list of categories). That
identity is worth having for a figure the app derives: a number a reader can
check by adding the two columns beside it is a number they can trust, and it is
why the total counts *every* side rather than the two named ones — a category
`STAT_META` cannot place is still a category the league scores, and leaving it
out would make the total disagree with the columns above it.

**It is absent where there is only one side to combine**, that column being the
side's own said twice.

**Checked against an independent recompute through the route**, over every span
the live league offers: `matchup`, `season`, `first` and `playoffs` each
reproduce **24 of 24 side totals** and **12 of 12 overall totals** — the points,
the rank, and the count of categories scored in — with 0 mismatches, and `OVR ==
BAT + PIT` on every row of every span.

**`current` is ESPN's own pointer now**, not "the last period the schedule
mentions". Those agree today only because the rounds past the current one are
not scheduled yet; the day they are, the last one would be a round nobody has
played. `status.currentMatchupPeriod` is read where present, with the old
derivation as the fallback.

**Every team's spans now add up, and the residue has an exact cause.** Measured
through the route over all seven counting categories, each of the twelve teams
falls into one of exactly two cases and **none is unexplained**:

- **The four winners'-bracket teams**: `first + second + playoffs == season`.
- **The eight consolation teams**: `first + second == season` — ESPN's own
  season figure does **not** count their live playoff week.

That is the same quirk the old note recorded as "`first + second` is not
`season` for eight of the twelve teams", stated precisely instead of as a wart:
ESPN counts playoff-week play in `valuesByStat` only for teams still in the
winners' bracket. `season` is kept as ESPN's own figure deliberately — it is the
number the manager sees on ESPN's site — and each span states the weeks and days
it covers, and says `so far` where it reaches into the week being played.
`matchup` and `playoffs` are identical while 19 is the only playoff round
(checked: 12 of 12 teams), which is a fact about the calendar rather than a
duplication — they diverge the moment round 20 is played.

**The halves are an even division of the regular season by matchup period, and
they were the All-Star break until now.** That break was read off ESPN's own
calendar — `fetchPeriodAnchor` reduced `proTeamSchedules_wl` twice, once to the
anchor pair and once to the longest run of gameless scoring periods, which on
2026 is exactly three (111–113) and is the only run of them in the season. It
was a true fact about the season and the wrong cut for this table, because **the
break does not fall halfway**: on the live league it lands inside matchup period
15 of an 18-period regular season, so `First half` was fifteen weeks of play and
`Second half` three.

**What that did to the numbers is the whole of the argument.** Measured on the
live league by summing every counting category over each period, the old split
gave the twelve teams **4.5× to 6.8× more runs in the first half than the
second** (The Homewreckers 608 against 93, Pirates Cove 572 against 125); the
even split gives **0.88× to 1.19×** (359/342 and 337/360). Two columns that
differ by a factor of five in every counting stat are not two halves a manager
can read against each other — they are a season and a fortnight under labels
saying otherwise.

So `halvesOf` takes `regularPeriods` alone: `mid = ceil(N / 2)`, first half
1..mid, second half the rest, the odd period going to the first (19 → 10 and 9)
since one of them has to take it. On the checked league that is **`Weeks 1–9 ·
Mar 25 – May 31`** and **`Weeks 10–18 · Jun 1 – Aug 9`**, where it read `Weeks
1–15 · Mar 25 – Jul 19` and `Weeks 16–18 · Jul 20 – Aug 9`.

**The boundary is the league's matchup count, not the periods the schedule
happens to carry**, and that is what keeps it still: a league's
`matchupPeriodCount` is settled before opening day, so `ceil(N / 2)` names the
same week in April as in September, where halving the list of periods *played so
far* would move the line every week and change what a saved `lspan=first` link
described between two visits. In April the second half is therefore empty, and a
half with no matchup period in it is **absent from the `spans` list** rather than
served empty — the rule the scoreboard's forward arrow already follows for a
period ESPN has not opened, and the same one a playoff round nobody has reached
follows. A league that publishes no matchup count gets no halves at all, which
is what an unreadable one looked like before.

**And the two halves still partition the regular season exactly**, which is the
property the old cut had and this must not lose: checked against an independent
per-period sum built from each matchup period's own `scoreByStat`, **168 of 168
counting cells** (12 teams × 7 categories × 2 halves) reproduce it, and the
eight consolation teams' `first + second == season` check above is unmoved.

**The break derivation went with the cut.** Nothing else read it, so
`SeasonCalendar` is a `PeriodAnchor` again and `fetchPeriodAnchor` reduces the
schedule once — a field nobody reads is a field nobody misses, the rule
`teamProbablePitcher`'s removal already sets. **The blob key stays at `-v2`**
although the shape has shrunk back to the pair: that bump *was* the break
joining it, and a stored v2 blob carrying the two extra numbers deserializes
into the pair with them ignored, where the hazard a version guards against is
the opposite one — a field arriving missing. Bumping would spend the 850KB
again to learn the same `{ period, date }`.

**Ranks are computed on the server here, where the research board computes them
in the client**, and the two are not in tension. That board ranks columns
*derived in `Column.value`* — BB%, K-BB%, ISO, PA/HR — which exist nowhere on
the row, so a server-side ranking could reach only the raw half. Nothing on this
table is derived in the client: the server holds the values, the `lowerBetter`
flag and the population, so there is no half it cannot reach. Competition
ranking, 1 is best whichever way the category runs, ties share a rank and the
next distinct figure skips — `teamHitting.ts::rankAll`'s convention. A team with
no figure is **out of the ranking entirely** rather than at the bottom of it,
the rule `sideFrom` already follows for a category a side is ineligible for.
Checked against an independent recompute over all **five** spans: **600 of 600
cells match, 0 wrong, with 73 tied cells among them.**

**And the rank is what the client colours**, which is the whole reason the
direction can be baked in here and needs no special case there: a `lowerBetter`
category's `1st` is its lowest figure, so the reddest badge on the ERA column
and the reddest badge on the HR column mean the same thing. Ties share a rank
and so share a colour by the same construction. See **Client — the League
view**, *The rank is a badge and the badge is the scale*, which is also where
the departure from the research board's monochrome rule is argued.

**Caching is this file's own two rules.** A span whose last matchup period is
**over** cannot change, so it takes a storage blob read with no freshness test —
`espn-span-{leagueId}-{first}-{last}-v1.json` — which is what `getMatchups`
already does one period at a time. A span reaching into the week being played is
memory-only on **`LIVE_TTL_MS`**, and `force` reaches that one and leaves
the frozen ones alone. The read is `mScoreboard` **alone**, filtered to the
span's periods: it does not carry `matchupPeriodId` back (that is
`mMatchupScore`'s field, which is why `leagueMeta` reads it separately) and it
does not need to, since every row it returns belongs to a period that was asked
for. Measured on the live league: the first half's fifteen periods are **299,245
bytes**, the second half's four **82,823**, one period **23,511** — about 20KB a
week either way.

**Measured through the route**, each cold figure from a fresh process: `season`
**10.8KB in 449ms** cold and **5ms** warm, `matchup` **178ms**, `first`
**258ms**, `second` **195ms**.

### The Transactions tab: who moved whom

**Which ESPN endpoint answers this, and the ones that look as though they should
and don't.** Recorded for the reason the scoreboard's own probe table is: this
file exists partly so nobody re-probes.

- **`view=mTransactions2`** is real and is **scoped to one scoring period** — by
  the query param, not the filter. Bare it returns the current day's 30 rows;
  `scoringPeriodId=100` returns that day's. `filterType` works
  (`{"transactions":{"filterType":{"value":["FREEAGENT","WAIVER","TRADE_ACCEPT"]}}}`
  narrows 30 rows to 4), but **`filterScoringPeriodIds` is ignored** — the same
  30 rows come back — and `limit`, `offset` and `sortDate` are each a **400**.
  So a season off this view is one request per scoring period, ~150 of them,
  which is not a page load.
- **`view=mTransactions`** carries no `transactions` key at all (1,375 bytes:
  `members`, `players`, `settings`), and **`mPendingTransactions`** is 1,285
  bytes of nothing on a league with none pending.
- **Diffing `mRoster` day over day** was the fallback and is not needed; it would
  also be a reconstruction where the endpoint below is a record.

**What answers it is `communication/` with `kona_league_communication`**, the
endpoint ESPN's own "recent activity" is drawn from — and the one that takes
`limit` and `offset`, which is the whole difference: the entire 2026 season of
this league is **770 topics and 1,261 messages in one request** (933,078 bytes
at `limit: 1000`), against 244KB for the most recent 200.

**A topic is the transaction and its messages are the players in it.** The
shapes, counted over that whole season: `178+179` (pick up and drop) 458, `178`
alone 160, `239` alone 121, `180+181` (waiver claim and drop) 19, `180` alone 8,
and five trades of three to nine messages each.

**The message-type table was cross-checked against `mTransactions2` rather than
taken from the community mapping**, on four topics of the same afternoon: a
`t179 p32667 to6` is `mTransactions2`'s `DROP p32667 6->0`, and the `t178 p39640
to6` beside it is its `ADD p39640 0->6`. **And the field carrying the team was
counted over all 1,266 messages**, because it is not the same field on every
type: `to` is a real team id on all 1,122 of the 178/179/180/181 messages and on
both ends of all 23 trades, while a **`239` has `to: -1` on all 121 of them and
its team in `for`** — where its `from` is a lineup slot that merely *looks* like
a team id 50 times in 121. Reading `from` there would have filed a third of the
league's drops under the wrong manager.

**Names cost no upstream at all.** `EspnPlayerPool` gains a third reading of
rows it already parses and joins — `byEspnId`, ESPN's own player id to his name
and the MLB id he joined to — so the tab's names come off the same cookie-free
940KB list `getRosterPct` and the eligibility chip already share on six hours.
Checked against a whole season of this league's activity: **376 of 376** distinct
ESPN player ids named in it are on that list. Every row is kept whether or not
it joined, since a name is worth having for a player MLB has never listed; a null
`mlbId` is what makes his row not a link. Measured through the route: **412 of
415 players joined (99.3%)**, the three that didn't being names the join declines
to guess at.

**Memory only, and deliberately no storage blob.** A past transaction is
immutable, which is the argument for one — and what is read is not a past
transaction, it is the **head of a feed** that grows all season, which is
`nextGame.ts`'s class rather than `espn-lineup-…`'s: a blob's freshness test here
could only ever be the TTL beside it, and what it stored would be a
window that has moved by the time it is read. Keyed per league on
**`LIVE_TTL_MS`** with an `inFlight` guard, and `?refresh=1` reaches it — a move
made on ESPN is exactly what that button is for. **A minute rather than the
rosters' ten**, and for a reason the feed did not have until now: the League page
polls it whatever tab is open, because the red dot on the Transactions tab is
computed from its head, and a mark saying "something happened" ten minutes after
it happened is a mark the reader has already scrolled past on ESPN. `TRANSACTIONS_LIMIT` is 250,
which cuts nothing today (a season of this league is 770 topics and the tab reads
the most recent 250 of them) and bounds a payload that grows all season; the
client says when the list is at it.

**Measured through the route**: **86KB in 402ms** cold and **5ms** warm — 250
transactions, 415 players, 197 adds, 49 drops and 4 trades; **140ms** at the
first ask past the minute and **3.2ms** inside it.

**What the polling costs upstream is one league's worth per minute, not one per
reader**, which is the measurement the whole cadence rests on: every cache in
this file is keyed by league, so twelve leaguemates all sitting on the League
page cost the same one read a minute that one of them does — and only while
somebody has the page in front of them, a hidden browser tab skipping its ticks
outright.
