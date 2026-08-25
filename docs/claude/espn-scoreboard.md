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

  *(**Superseded, and by the same correction the projection took first.** The
  rule is right about *ineligible* and wrong about *early*: on the first day of
  a week nobody has thrown an inning, so nobody has an ERA for today's
  production to move, and the live card drew `—` against `—` for both rates
  while the opponent's starter was three innings into a shutout. `sideFrom` now
  goes through `espn.ts::withLiveDay`, which passes `withAddedComponents`'
  `createRates` and then puts the narrower half of this rule back. See **A rate
  the side is early for is not a rate it is ineligible for** below.)*

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

*(**Superseded**: `season` is `Regular Season` now — periods `1 … regularPeriods`
through the same `getSpanTotals` path as the halves, so it takes the live day
like they do and it is no longer ESPN's line. The quirk in the parenthesis is
what settled it: a column three teams in twelve carry an extra fortnight in is a
column nobody can rank. See **Client — the League rankings**, *`Season` is
`Regular Season`*. ESPN's line survives as the fallback for a league that
publishes no matchup count, where there is no boundary to cut a bracket out at,
and there the paragraph above still holds word for word.)*

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
with the arrows to move. A wrong week silently labeled "this week" is the
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
for every matchup, live and final alike, honoring `isReverseItem` (ERA and
WHIP, where the smaller number wins).

**Checked against ESPN's own answer rather than reasoned about.** Over all 18
completed matchup periods of the live league — **108 matchups and 1,080 category
comparisons** — the computed per-category result matched ESPN's `result`
**1,080 of 1,080**, the computed matchup winner matched ESPN's `winner` on all
108, and the computed win/loss/tie tally matched ESPN's own `cumulativeScore` on
all 108. So a live matchup and a final one are drawn by one arithmetic, and that
arithmetic is known to reproduce ESPN's. `ineligible` was scanned for over the
same **5,244 score cells** and is false on every one; it is honored anyway,
since a category a team cannot score in is not a category it is losing, and a
zero in a `lowerBetter` category would otherwise read as the best score in the
league.

**That scan covered the settled periods only, and the flag is not false on a
live one.** Every one of those 5,244 cells belongs to a week that finished, and
a finished week has innings in it. On the first day of a week the flag is
`true` on both rate categories for every side in the league — which is the
finding the next section is about, and it means "`ineligible` is false
everywhere" must be read as "in a week that was played", not as a fact about
the field.

**That tally is what the scoreboard's headline now prints** — `wins`/`losses`/
`ties` per side, as `6-3-1` rather than the bare wins the card used to show, so
the one number on the card is the one number this file has measured against
ESPN. Re-checked end to end through the route over all 18 settled periods: the
triple **sums to the ten categories on 216 of 216 sides** and **matches ESPN's
own `cumulativeScore` on 216 of 216**, with the winner it implies agreeing with
ESPN's `winner` on 108 of 108. See **Client — the League view**, *The headline is
a triple*.

**A category *neither* side has a figure for is a tie; one only one side has is
skipped.** The two absences are different facts and the split is the whole of the
rule. A side ESPN reports as **ineligible** for a category is absent from
`scores` by `sideFrom`'s own rule, and counting that as a loss is the fault the
skip exists to prevent — but ineligibility is a fact about *one* side, so the
other still has its figure and the skip still answers it.

Both sides absent is the other thing entirely, and it is **the first minute of
every week**: a side that has thrown no innings has no denominator, so ESPN
reports no ERA and no WHIP for either of them. (That is the same absence
`withAddedComponents`' `createRates` was found and answered on the projection's
side of the house; this is the live card's half of it, and it went unnoticed
longer because a skipped category *looks* like nothing.) Measured on the live
12-team league at the top of period 20, all six matchups: `scoreByStat` carries
every counting category **and OPS** as `0` from the first minute — ESPN having
nothing to divide — and carries neither **47 (ERA)** nor **41 (WHIP)** at all.
Skipped, the headline read **`0-0-8`** on a ten-category league, which says two
of the ten are somebody's and does not say whose. Level on nothing is what they
are, so they are level: **`0-0-10`**.

*(**One correction to that sentence, found later the same evening.** ESPN does
carry 47 and 41 — as
`{"ineligible":true,"rank":0,"result":"TIE","score":"Infinity"}`, a **string**
where a number belongs, which `sideFrom`'s `typeof cell.score !== 'number'` test
dropped without a trace. So they are present and unusable rather than absent,
and everything the rule above concludes still holds: they reach `scores` as
absences either way, and ESPN's own `result` on the cell is `TIE`, which is the
verdict the tally reaches independently. What the correction does change is what
can be done about it — a cell that says *no denominator* rather than *cannot
score* is a rate we may rebuild, which is the next section.)*

Which also means **only a rate can reach the tie**, and that is what keeps the
ineligibility rule intact rather than merely mostly intact: a counting category
ESPN sends as `0` from the first minute is *present*, so a counting category that
is genuinely absent is genuinely ineligible — and ineligible for one side, not
for both.

**Re-checked against the settled weeks, where the change must do nothing.**
Periods 18 and 19 through the route after: every side's triple still **sums to
the ten categories** and the winner it implies is unmoved (18: `2-7-1`/`7-2-1`,
`3-7-0`/`7-3-0`, `5-2-3`/`2-5-3`, `4-5-1`/`5-4-1`, `1-9-0`/`9-1-0`,
`4-4-2`/`4-4-2`). A week in which innings were thrown has ERA and WHIP on both
sides and never reaches the new branch.

**And the blob went to `-v3` with nothing gaining a field**, which is the other
half of the cache-version rule: a version guards the *meaning* of what is stored
as well as its shape. The tally is computed once, on the way in, and a settled
period is read back with **no freshness test at all** — so a week in which a side
threw no innings would have gone on serving the old skip long after every live
week counted them tied. The two answers cannot be told apart by looking, which is
exactly when a stale blob is worth least.

**The client draws the same line, in two places, deliberately.**
`LeagueView::outcome` colors the Scoreboard's cells and `LeagueMatchup::winnerOf`
draws the matchup page's rows and its per-side-of-the-ball group tallies; both
now return `tie` for two absences and `null` for one, so the tally a card prints
and the cells under it cannot disagree about a category. The two titles that
would have read `— to —: level` and `ERA: — — tied` say *neither side has a
figure yet* and *no figure yet* instead.

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

### A rate the side is early for is not a rate it is ineligible for

**The live card showed no ERA and no WHIP while the opponent's starter was three
innings into a shutout.** Reported as *"why am I not seeing ERA/WHIP for my
current matchup even though my opponent has a pitcher that's pitched 3
innings"*, and it is the third time the same distinction has had to be drawn:
`createRates` drew it for the projection, the tie rule drew it for the tally,
and this is the figures themselves.

`sideFrom` merged today's day onto ESPN's through-yesterday score with
`withAddedComponents`' `createRates` **off**, under the standing rule that today
*"can move a number ESPN already gave this side and can never invent one"*. On
the first day of a week there is no number to move: nobody has thrown an inning,
so nobody has a rate, and the merge dropped a figure the components in its own
hands could produce. Every other day of the week the rate is already there and
gets rebuilt correctly, which is why this survived a season — **it is one day of
every week wide, and it closes overnight** when ESPN's batch folds the day into
`cumulativeScore`.

**The two surfaces of the same page disagreed, which is how it was pinned
down.** Measured at 19:49 ET on 2026-08-24, the first day of period 20, team 12
having thrown 3.1 innings on 3 hits, no walks and no earned runs:

| | matchup card | Rankings, `Current matchup` |
| --- | --- | --- |
| team 12 ERA | `—` | **0.00** |
| team 12 WHIP | `—` | **0.90** |

Same week, same components, two answers — and the **rankings are the half that
was right**: `withRates` there rebuilds every rate category from its components
with no absent-guard at all, and has since *The Rankings tab takes the same fix
on the same day*. So the fix is the scoreboard catching up to a rule this file
already had, not a new one.

**`espn.ts::withLiveDay` is where it lives**, between `sideFrom` and
`withAddedComponents`, because this caller needs two things the projection's
does not and neither belongs inside a function they share. It passes
`createRates` and then takes back the two halves of the old rule that were
right:

- **A category ESPN genuinely calls the side ineligible for stays out.**
- **The components `createRates` invents are dropped again.** The projection's
  scores go through `categoryScores` before they reach the wire and this
  caller's do not, so the merged map's **48, 68 and 76 ids** (the three sides
  logged) come back down to what ESPN sent plus the categories the league
  scores: **21 keys a side before, 23 after** where the side has pitched, 21
  where it has not.

#### `Infinity` is an empty denominator, not an ineligibility

**And this is what the change actually cost**, because the first, faithful
version of that first bullet withheld exactly the figure the change exists to
produce, and drew `—` against `—` all over again. ESPN sends the rate cell:

```
{"ineligible":true,"rank":0,"result":"TIE","score":"Infinity"}
```

on **both rate categories, both sides, all six matchups** of period 20's first
day. The flag does not mean *this team cannot score in this category*; it means
*there is nothing to divide by yet*. A side that has not pitched is early, which
is the same distinction `createRates` is built on, arriving this time in ESPN's
own field. So `sideFrom` tests the score: `String(cell.score) !== 'Infinity'`
before it believes an `ineligible`, and anything else ESPN calls ineligible is
still taken at its word.

Two things follow from the shape of that cell:

- **The `score` is a string.** `typeof cell.score !== 'number'` dropped it
  silently, which is why the cell was recorded above as absent altogether. The
  field is typed `number | string` now, so the string cannot be mistaken for a
  figure.
- **ESPN's own `result` is `TIE`**, which is the verdict `tallyCategories`
  reaches for two absences by its own arithmetic. The tie rule was argued from
  first principles a section ago and ESPN agrees with it in the payload.

#### What it moves, and what it does not

**Measured through the route, before → after**, on one fetch with both tallies
computed off it so no figure moved under the comparison:

| | before | after |
| --- | --- | --- |
| team 12, 4.0 IP | `— / —` | **`ERA 2.25 / WHIP 0.750`** |
| team 9, 9.1 IP | `— / —` | **`2.89 / 1.286`** |
| team 6, no innings | `— / —` | `— / —` |
| 6 vs 12 headline | `1-1-8` / `1-1-8` | `1-1-6` / `1-1-6` |
| 9 vs 4 headline | `3-0-7` / `0-3-7` | `3-2-5` / `2-3-5` |
| payload | 11,048 B | 11,174 B |

A side that has not pitched is **unmoved**, which is the `DERIVED` zero-
denominator guard doing its job rather than an argument that it would: every one
of the nine rules returns `null` on an empty denominator, so no `0.00` that
would read as the best score in the league can be reached from here.

**The headline sums to eight for a few hours of a Monday**, and that is the one
thing this makes look worse before it looks better. While one side has pitched
and the other has not, the rates stop being *both* absent and become absent on
one side — which `tallyCategories` **skips**, that being its standing answer to
a figure only one side has. It is not the `0-0-8` the tie rule was written
against: there the card showed `—` against `—` and could not say whose the two
categories were, and here it shows `—` against `2.25` and says so plainly. The
moment the second side throws an inning both rates are real on both sides and
the categories are decided again — 9 vs 4 in the table above, back to ten.

**No cache version moves with this.** `getMatchups` writes a blob only for a
frozen period, `today` is null on every frozen read, and `withLiveDay` returns
`scores` untouched when there is no day to add — so a settled week is
byte-identical, tally included, and `-v3` still describes what is stored. This
is the other side of the rule that took the blob to `-v3` in the first place: a
version guards what is *stored*, and nothing stored changed.

### A category day by day, and the four ways ESPN cannot be asked for it

**A scoreboard cell is one number and the week that produced it is not.** `R
31–23` says who is ahead and nothing about how: a lead built on the Monday and
defended since reads identically to one taken on the Saturday, and only the
second is still worth doing something about. So a category row on the **matchup
page** opens a chart of that category **day by day, both sides** (see **Client —
a league matchup**, *A category row opens its chart*; it was first hung off the
scoreboard's own cells, and the passage there records why it moved). The whole
of the work was establishing whether ESPN can answer for a day at all — and
none of it changed with the caller.

**It cannot, and the probes are written down here so nobody repeats them.** All
figures the live 12-team league, matchup period 18, scoring periods 132–138.

- **`cumulativeScore` is not parameterised by `scoringPeriodId`.** This is the
  one that would have made the series free *and* authoritative — one read per
  day of ESPN's own running total, with no summation of ours anywhere. It is a
  fact about the **matchup** period and nothing else: asked at
  `scoringPeriodId` 0, 132, 134, 136, 138 and 146, the same matchup comes back
  with **byte-identical scores every time** (`R 32 · HR 13 · RBI 28 · K 45 ·
  ERA 4.43283582`). What the day *does* change is the payload — **23,511 bytes**
  at a day outside the period against **521,748–579,080** at one inside it,
  which is the two rosters `scoringPeriodId=0` empties.
- **A response carries exactly one day's stat lines.** The obvious escape —
  read one day and take the whole week out of it — does not exist: over the 28
  roster entries of one side, every stat line present is
  `scoringPeriodId/statSourceId/statSplitTypeId` = **`136/0/5`, 28 of 28**.
- **`players.filterStatsForTopScoringPeriodIds` is a 400**, as it already is on
  the Rankings tab's own probe table.
- **`schedule.filterScoringPeriodIds` is ignored** — **125,723 bytes** and the
  same single day back, whatever it names. So is `filterStatsForSplitTypeIds` on
  `mScoreboard`, which still empties the roster (23,511 bytes, 0 entries).
- **`mBoxscore` is `mScoreboard` under another name** — **577,813 bytes**, one
  day, both roster forms.

**So a day is one read, and the series is the days summed** — which is
`scoringPeriodTotals`' own arithmetic, already validated at 120 of 120 cells
against ESPN's final `cumulativeScore` and **re-validated for this**: summing
the seven days of period 18 reproduces every one of its **120 category cells**,
worst delta **4.86e-9**, which is ESPN's own eight-decimal rounding of an OPS
rather than a disagreement.

**Counting stats add and rates are rebuilt**, the rule `getSpanTotals` and
`withScoringPeriod` both obey: the running ERA on day four is four days of
earned runs over four days of outs, never four ERAs averaged. Every `DERIVED` id
is recomputed from the running components at each day.

#### And it stops reproducing the card as a week wears on, which is open

**The 120 of 120 above was measured on a week that had just settled, and the
agreement does not hold once managers have moved players.** Re-measured on
2026-08-23 with the revision rule below in force and every day's totals fresh
from ESPN: **19 of the live week's 120 cells disagree with the card**, all of
them small — team 1's Runs **72 against 75**, its Home runs 17 against 18,
Stolen bases 8 against 9, OPS .731 against .743; team 5's Wins 10 against 11 and
Strikeouts 119 against 121. The 101 that agree agree exactly.

**It is not staleness and it is not the arithmetic.** Both were checked and
excluded: forcing every day of the period fresh from ESPN changes nothing, and
the day-by-day sum reproduces itself through two independent upstreams —
`mMatchupScore`'s `rosterForCurrentScoringPeriod` and `mRoster` at the same past
day give the identical **72**. ESPN's own figure for the same period is **71
through yesterday**, and `rosterForMatchupPeriodDelayed` reproduces *that*
exactly (R 71, ER 60, outs 482, K 135) — so ESPN has a per-player accrual for the
matchup period that our per-day reconstruction is three runs short of.

**What is short is two players, not two days.** Sorted, our per-player run
totals for the period are `10,9,8,7,6,6,5,5,5,3,3,1` and ESPN's are
`12,10,8,7,6,6,5,5,5,3,3,1` — the same twelve scorers, with one on 12 where we
have 10 and one on 10 where we have 9. So somebody accrued on a day our snapshot
of that day has him benched: ESPN scores the lineup **as it was when the game
started**, and the roster it hands back for a past scoring period is the lineup
as it was left. A manager who benches a player after his game has been played
takes that day's production out of our sum and not out of ESPN's.

**It is not fixable from what ESPN exposes**, which is why it is written down
rather than fixed. `rosterForMatchupPeriodDelayed` is the accrual view and is the
only place the missing production appears — but it is the **whole period** in one
figure (its stat line is `scoringPeriodId: 0`, invariant to the
`scoringPeriodId` asked for, checked at 139/141/145/149/151/152), and its entries
carry **no player identity at all**: `playerPoolEntry.player` has a `stats` key
and nothing else. There is no per-day breakdown to distribute and no name to
attach one to.

**So the chart's last point is *within a unit or two* of the cell that opened
it, not identical to it** — and correcting that by pinning the last point to the
card was considered and rejected: it would put a whole week's divergence onto one
day, which is a lie about that day. This repo's rule is that a join fails to null
rather than to a guess, and the same holds for a total.

**A day that cannot be read stops the series rather than being skipped.** Every
figure is a running total, so a hole in the middle is not a missing point but a
wrong one for every day after it — the sum would be short by that day's
production with nothing on screen to say so. The first failure marks its own day
`ok: false` and every point from there is null, and the chart draws the days it
actually knows.

### A day's own counts are a blob, which is what makes the chart affordable

**`espn-day-totals-{leagueId}-{scoringPeriod}-v1.json` is one scoring period's
production per team**, keyed by stat id — **~7.5KB** on the live league against
the **77,483–126,786 bytes** it is reduced from. Store the answer, not the
payload, which is the rule `espn-period-anchor` and the RotoWire index already
follow.

**A finished day is a fact**, which is the one split here and it is
`getTeamRoster`'s exactly: a scoring period strictly before ESPN's
`latestScoringPeriod` is a day whose games have been played and whose lineups
can no longer be edited, so it is read back with **no freshness test at all**.
The day being played is memory-only on `LIVE_TTL_MS`. That is what makes the
chart affordable on the week anybody is looking at — the first press pays for
the whole week, and every minute after it re-reads the one day that can still
move.

**The freeze is the matchup period's, not the day's** — which is the correction
the paragraph above needed, and the one the day blob shipped without. A finished
day *is* a fact once its **week** is over; a finished day inside the week being
played is still being scored, and ESPN restates it when official scoring is
revised. Measured on the live league on 2026-08-23 against blobs written on the
17th: team 1's **earned runs for Aug 11 went 15 → 10 and for Aug 15 went 3 → 1**,
so the day-by-day chart's ERA for week 19 read **3.53 against the card's 3.16**,
and its WHIP **1.2422 against 1.2363** — and it would have gone on reading them
for as long as the blob lived, because nothing ever asked ESPN again. Every other
stat of every other day of that week matched to the unit, which is what makes
this a revision rule rather than a cache-everything one.

So `DayFreeze` is three states rather than a boolean, and `REVISION_TTL_MS` is
what the middle one is believed for: **half an hour**. A day in a settled period
is `settled` and is untouched — a blob read with no test, which is what keeps a
past week free. A finished day in the live period is `revisable` and takes the
same blob against that half hour. The day itself is `live` and memory-only on
`LIVE_TTL_MS`, unchanged.

**The stamp is read rather than spent**, which is why this goes through
`readStampedBlob` and not `readJsonBlob`: the memory copy inherits the blob's own
`cachedAt`, so a `revisable` day read off a 29-minute-old blob is due in one
minute rather than in thirty-one. `readJsonBlob` spends the stamp on its
freshness predicate and would have left `dayTotalsCache` believing it had just
read ESPN.

**What it costs is thirteen reads a half hour on the one week being played**,
against the one a minute the live day already costs — and nothing at all on the
eighteen weeks that are over. Measured after the change, the ERA and WHIP cells
match the card exactly (3.1640625 and 1.236328125 against the card's own
3.1640625 and 1.236328125, 0 delta).

**The live scoreboard reads through it too, which it did not before.**
`fetchMatchups` only ever asks for `latestScoringPeriod`, so it always takes the
live path and its behavior is unchanged; what it gains is the `inFlight` guard,
so a cold container serving three tabs sends one upstream rather than three.

**`getMatchupSeries` is keyed by team and stat rather than by matchup**, so one
read serves every card on the board: the ten cards of a 12-team league are six
matchups over the same twelve teams and the same ten categories. **The span is
clamped to the day ESPN is on**, so a period that declares more days than have
been played is never asked for a day that has not happened — on a settled period
that is the period's own last day, and on the live one `latestScoringPeriod`,
which is the same day the scoreboard adds to `cumulativeScore`. The fan-out is
the repo's own `mapLimit` at **6**; the assembled series is memoized per league
and period, frozen with no freshness test and live on `LIVE_TTL_MS`, and `force`
reaches the live one while the settled day blobs stand.

**Measured through the route on the live league.** A settled seven-day week is
**797,498 bytes and 1,588ms of upstream**, paid once ever: **675ms** genuinely
cold in a fresh process with no blobs, **320ms** from the fourteen blobs in a
fresh process, and **1.3ms** warm. The live week is **509ms / 219ms / 1.3ms** on
the same three, its eighth day being the only one re-read. The response itself
is **6,827 bytes** for a seven-day period and **7,663** for the live eight-day
one.

**Which is exactly why it is a route of its own** rather than a field on
`/api/espn/scoreboard`: that board is read by everybody who opens the League
page, and this is a week of ESPN rosters summed a day at a time. It is the split
`/api/espn/matchup-window` already makes for the same page from the other
direction — that one is 103 bytes and is fetched once a session, and this one is
paid on the first press.

**Validated end to end through both routes**, which is the check that matters
for a series whose whole claim is that it ends where the card does: the last
point of every series equals the figure on the card the chart is drawn beside —
**120 of 120 cells on settled period 18** (worst 4.86e-9) and **120 of 120
exactly** on the live period 19, where the two are bit-identical because the
scoreboard's own figure is `cumulativeScore` plus the same day this sums.

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
  **`LIVE_TTL_MS`**, **thirty seconds**, which is the cadence the League page's
  own poll reads through (**Client — the League view**, *The page updates
  itself, half a minute at a time*) — so a reader sitting on the scoreboard is
  never more than about a minute behind ESPN, and a settled week costs nothing
  at all.

  **It was a minute, and "about a minute behind" was out by a factor of two.**
  The poll and this cache are two independent windows of the same length stacked
  end to end, so a tick every 60s landing on a blob up to 60s old is up to
  **120s** behind. ESPN's board, sampled every 20s across four minutes of live
  games, moves **once a minute** — so the reader routinely missed a whole cycle.
  Halving both together puts the worst case at 60s, which is that quantum. The
  pairing with `lib.ts::LEAGUE_POLL_MS` is the load-bearing part: shorten one
  without the other and the shorter is wasted. The sampling and the numbers are
  in **Client — the League view**.
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

### Every period, dated — the list the week face opens

**The scoreboard publishes `periods`, one entry per matchup period the schedule
has materialised, and it is the *same* arithmetic `start`/`end` are, run for the
whole schedule instead of for the week being shown.** The client draws it as the
list behind the header's own press — see *The week reads like the app's date
face* in **Client — the League view**. The two arrows are two members of it.

**It is derived, not fetched, and that was the constraint.** `leagueMeta.periods`
is already in hand on every scoreboard read — it is what `prevPeriod` and
`nextPeriod` are computed from — and `dateForPeriod` awaits one **cached** period
anchor and then does `addDays`. So the whole list is that one await and no
upstream request at all. Written as one expression over `meta.periods` rather
than beside the header's own pair, deliberately: the week the header is on and
that week's own row in the list are then the same two calls, and cannot come to
print different days.

**The dates are the observed span**, which is the truncation the header already
carries on the live period and is the right reading *here* for exactly that
reason — a row that read further than the face above it would be two dates for
one week. The whole-period reading is the section above, and it has its own route
because it answers a different question.

Checked against the live league through the route: **19 entries**, contiguous
with 0 gaps, `Week 1 · 2026-03-25 → 2026-04-05` (the 12-day opening week) through
`Week 19 · 2026-08-10 → 2026-08-19`, period 15 reading its 14 days, and the entry
for period 19 byte-identical to the payload's own `start`/`end`.

**No cache version was bumped and none was owed.** The rule is whether anything
reads the field back *out of a stored blob*, and the scoreboard's frozen blob
holds `EspnMatchup[]` alone (`scoreboardBlobKey`) — this rides on the assembled
`EspnScoreboard`, which is built fresh from `meta` on every call. Null dates
where the anchor could not be read, the same failure the header's own dates take;
the list then names the week without them rather than dropping it.

### The Rankings tab, and the five spans

*(Six now, and the sixth is not one of them. `week` is one matchup period the
reader picked off the league's calendar — the tab's own bar — and it is
deliberately **absent from `spans`**, the list the strip is drawn from: the
strip offers five named cuts and the league has nineteen weeks, so a strip entry
for it would have to be relabeled every time the reader moved. It rides on
`?period=` and comes back on `week`, an `EspnRankSpanInfo` like the five so the
bar has one shape to read whichever is in force.*

*It is the `matchup` branch with one period substituted:
`getSpanTotals(creds, [period], frozen: true, null)` — the same `mScoreboard`
sum over a single matchup period, with ESPN's own rates for it read as they
come. **Frozen**, because it is over: the totals go to a blob and are read back
with no freshness test, so stepping back through a season costs one read a week
and then nothing. **No live day is added** — that day belongs to the week being
played, and this is not it.*

*The week being played is **not** a `week`: `period === current` normalizes to
null and falls through to whatever span was asked for, which is why a `week` is
always settled and so never `projectable`. An unknown period does the same,
which is the direction an unrecognized `span=` already falls in — a bad value
costs the reader the cut they asked for, never the table.*

*Checked cell by cell against the board for the same week: every team's figure
in `?period=12` equals its own `scores` entry in `/api/espn/scoreboard?period=12`
— **120 of 120 cells, 0 mismatches**, 12 rows, 10 categories. No cache version
was bumped and none was owed: the span blob's shape and meaning are unchanged
and the key is `espn-span-<league>-12-12-v1.json`, one it has never held
before.)*

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

*(That verification is also what made moving `season` off ESPN's line safe rather
than hopeful: the summation **is** ESPN's line, to machine precision, for
whichever prefix ESPN happens to have counted. Taking the prefix `1..18` for
every team is therefore not a different arithmetic — it is the same one with the
bracket left out on purpose, which is what the reader asked for and what the
"eight teams and four teams" split above shows they need.)*

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

### And the same table read against the end of the week

**`getRankings` takes a `projected` flag, and it changes one input rather than
any of the arithmetic.** Where it is set and the span is `matchup` on a week
still being played, the per-team `values` are replaced with `getProjection`'s own
projected `scores` — categories only, which is what `onlyCategories` already
cuts — and every rank, side total and `OVR` below falls out over them unchanged.

**That is the whole reason it is a flag here rather than a route of its own.**
The ranking rule is `rankBy` and `totalOver` in this file: competition ranking
with the direction baked in, ties sharing a rank, `n + 1 − rank` summed per side,
and `OVR` = `BAT` + `PIT` *by construction* because one function computes both. A
projected table computed anywhere else would be a second implementation of all of
that, free to drift; asked here it is the same table with the figures swapped.
Validated against the projection through both routes on the live league: **120 of
120 values match `EspnProjectedSide.scores`, 120 of 120 ranks reproduce an
independent competition ranking with `lowerBetter` honored, and `OVR == BAT +
PIT` on 12 of 12 rows** — with 119 of the 120 cells genuinely differing from the
live table, which is what says the swap happened.

**A bye's side is projected like any other**, `away` being null on the matchup
and the side's own totals being projected all the same; dropping it would leave a
team out of a league table it is in.

**`projectable` and `projected` are two different questions and both ride on the
response.** The first is whether this span *could* be projected — the current
matchup, on a live week — and is what lets the client draw no toggle at all
rather than a dead one; the second is whether the figures on screen **are** the
projection, which is false where the flag was set and the projection came back
`ok: false` (a settled week) or could not be read. `projectedEnd` and
`projectedDaysLeft` ride along so the caption can say what it is looking at.
Anywhere else the flag is ignored and the live figures come back with `projected:
false` — checked: `?span=season&projected=1` answers `projected: false,
projectable: false`.

**`getProjection` is imported dynamically**, and that is a cycle rather than a
preference: `projection.ts` is built on `getScoreboard` and `getOwnership` and so
imports *this* module. Nothing is evaluated at module scope on either side, so a
static import would work today and be one refactor away from not; the dynamic one
says so, and is only reached once a reader has pressed the toggle.

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

**And the rank is what the client colors**, which is the whole reason the
direction can be baked in here and needs no special case there: a `lowerBetter`
category's `1st` is its lowest figure, so the reddest badge on the ERA column
and the reddest badge on the HR column mean the same thing. Ties share a rank
and so share a color by the same construction. See **Client — the League
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

### Where a live matchup is heading

**A live scoreboard says who is ahead now, which on the Tuesday of a seven-day
week is a question nobody is really asking.** `R 12–9` with five days left says
almost nothing, and what a manager actually wants to know is whether the two
saves he is behind by are two he is going to get. `server/src/projection.ts`
answers for the end of the week: every side's **projected final total** in every
category the league scores, and the tally that falls out of comparing them.

**Project the components, derive the rates.** A counting stat adds and a rate
does not, so nothing here ever projects an ERA — it projects earned runs and outs
and lets `espn.ts::withAddedComponents` rebuild the ERA from them. That is the
same function, and so the same `DERIVED` table, that adds today's day to ESPN's
through-yesterday score; it was `withScoringPeriod` while that was its only job
and is named for what both callers mean now. Every rule in it holds for a week's
worth of production unchanged, and the two that matter most are what stop a
projection **inventing** a category the side is ineligible for (which in a
`lowerBetter` category would read as the best score in the league) or rebuilding
a rate out of half its parts.

**`tallyCategories` is exported for the same reason.** The projection compares two
*projected* sides and must reach the same verdict from the same numbers as the
card it replaces — one function rather than two that agree today. That one has
been checked against ESPN's own answer on **1,080 of 1,080** category comparisons
over eighteen settled periods, so the projection's tally inherits the check.

### The four inputs, and that not one of them is a new upstream

Nothing in this file fetches anything the app was not already fetching. Each of
these is a read that is already cached and — for three of the four — already
pulled warm nightly by `warmer.ts`:

- **How many chances are left** — `schedule.ts`'s league-wide 28-day window,
  which carries every club's fixtures *and* `rotations`, the projected turn for
  every pitcher with a rotation slot. That map is what makes "his remaining
  starts" answerable past the three days MLB names probables for, and it is the
  same map the Schedule view's grid draws — so the projection and that grid cannot
  disagree about whether he pitches on Saturday.
- **How he has been going** — `research.ts`'s season board and its **30-day**
  board, blended (below). Thirty rather than seven: seven is a handful of starts
  and a bad week, and a projection that swung on it would report noise as news.
- **How strong the opposition is** — for a **pitcher**, `teamHitting.ts`'s nine
  cuts of how every club has hit, taken at 30 days and **against his own hand**;
  for a **batter**, the opposing club's announced or projected *starter* and how
  that man has actually pitched. A named pitcher is a far sharper answer than a
  club average and it is the one a reader would give.
- **Which way each of them swings** — `bats`/`throws` off `getSeasonPlayers`, for
  the platoon.
- **Whether he is playing at all, and how often when he is** — the per-day
  appearance map `statcastWindow.ts` already reduces every day export to
  (`dayCounts`), each club's own run of games off the same `schedule.ts` cache
  entry the window comes from, and the thirty 40-man rosters `/api/statuses` and
  every roster badge already share. See *Hurt is not rested* below; the first of
  those is the sharpest thing in this list, and it is free — `getResearch(kind,
  30)` above has already assembled its window from exactly those thirty days.

### The platoon edge is measured off the day exports, not taken from a book

Every wOBA event of the season is in the per-date Savant exports `savant.ts`
downloads and keeps forever, and each row carries the batter's `stand` and the
pitcher's `p_throws` — so the league's own same-hand and opposite-hand wOBA is a
sum over files already on disk. Over **140,889 plate appearances across 143
days**:

| | wOBA | PA |
| --- | --- | --- |
| same hand | **.3138** | 59,008 |
| opposite hands | **.3311** | 81,881 |
| league | .3238 | 140,889 |

a **5.5%** advantage to the batter with the better of it, which is
`PLATOON_SAME = 0.969` and `PLATOON_OPP = 1.022` as multipliers on the league.
Broken out: `L vs LHP .3057`, `L vs RHP .3325`, `R vs LHP .3281`, `R vs RHP
.3163`. A **switch hitter** always has the better of it, which is what switch
hitting is for.

**It is a league figure rather than the player's own, and that is a real
limitation stated plainly**: a genuine platoon monster loses more than 3% against
a same-handed pitcher and a reverse-split hitter loses nothing. Doing better needs
each player's own vs-L/vs-R split, which is one MLB request *per player*
(`getPlayerStats`) and so ~28 a team a matchup — the thing this whole file is
written to avoid. It is `FIP_CONSTANT`'s own bargain: a measured league constant,
named, with the method beside it.

### The blend, the share, and the three caps

**Season is always the larger half.** `RECENT_MAX` is 40%, and that weight is
**earned in proportion to how much he actually played**: a full month reaches it
and twenty plate appearances gets a fifth of it. Without the second cap a man just
off the IL would have his whole projection set by one good series, which is exactly
the noise the 30-day window was chosen to avoid.

**And a hitter does not play every game his club has left**, which is the one
thing the first version got wrong and the measurement that found it. Projecting
every hitter into every remaining club game put the twelve teams at **0.58 runs
per player-game against the 0.41 the same period had actually produced** — a
40% over-count. `playShareOf` is very nearly all of it: how often he is in his
club's game, read over the **last thirty days** where it can be, because a season
ratio is wrong in the one direction that matters most — a **call-up** has thirty
games of a club's hundred and twenty and would be projected to play a quarter of
the week when he is the everyday shortstop now. `getTeamHitting(30)` already
carries each club's games over the same span, so the numerator and the denominator
are the same month. The same figure is a reliever's appearance rate.

**That ratio is still the level and no longer the whole answer**, because a
ratio cannot tell *hurt* from *rested* — see *Hurt is not rested* below, which is
the correction applied to it.

### A reliever's appearance is a share, not a whole outing

**The same figure was applied to a reliever the wrong way round, and on a short
span it answered nothing at all.** `projectOnePitcher` took his appearance rate,
rounded the span to a **whole number of outings** — `Math.round(clubGames ×
rate)` — and projected exactly that many. A bullpen arm is used in something like
two fifths of his club's games and `Math.round(0.4)` is 0, so over a single date
he had no appearance to be projected into: `chances` came back 0, the line came
back null, and the Roster view's projected reading drew him as a row of dashes
beside a hitter who had a fractional line on the same day. Measured over the
twelve busiest relievers in baseball on 2026-08-21, every one of their clubs
playing: **5 of 12 answered `chances 0`**.

**The rounding was wrong on long spans too, and quietly.** It discarded the
fraction every time — Sam Moll over three days is 3 × 0.44 = 1.32 appearances,
filed as 1 — and it took `games.slice(0, count)`, the **first** N games of the
span, so his opponent-quality multipliers came off the front of the week and none
of the back of it. The per-game `mults` array exists precisely so a soft
three-game set and a brutal two-game one are projected on both rather than on
their average; slicing the front is not averaging, it is front-loading.

**So `projectPitcher` gained an `appearanceShare`, which is `projectBatter`'s
`playShare` arriving on the pitching side.** A starter passes the default 1 and
`mults` is one entry per *turn*, a turn being a whole outing. A reliever passes
his rate and `mults` is one entry per *club game*, each worth that share of an
outing. Every rate under the function is per **out**, so scaling the outs scales
the whole line; the four per-*appearance* figures (win, loss, save, hold) take
the share explicitly.

**This is what the seat side of the same file already believed.**
`pitcherCandidate` values a reliever's day as `day.set(g.date, rate)` — a
fraction — and *The seat goes by what the day is worth* below compares "a
0.4-of-an-appearance reliever" against a starter's whole one. The planner and the
projection were answering one question two ways, in one file.

**Measured, before → after.** On a one-day span, `chances 0` and a null line on
**5 of 12** busy relievers → **0 of 12**, the rest reading 0.4–0.6 of an
appearance. On three days the whole numbers become fractions at the same level
(Moll `1 → 1.4`, Tyler Rogers `2 → 1.5`, Eduard Bazardo `2 → 1.6`); on seven the
level is where it was (Rogers `3 → 3`, Bazardo `4 → 3.8`, Moll `3 → 3.3`), which
is the check that this is a change of *resolution* rather than of calibration.
Starters are untouched to the digit at every span, `appearanceShare` defaulting
to 1.

**Nothing is versioned by it.** No blob in this file is written to disk — the
context is memoized in memory on the matchup's own minute — and the wire shape is
unchanged. The one field whose meaning moves is `EspnProjectedSide.reliefGames`,
integer to fraction, which `hitterGames` beside it has always been and which
nothing in either workspace reads.

**No single adjustment may move a figure by more than a fifth** (`ADJ_CLAMP`),
and every one of them is clamped before use and their product clamped again. Each
is a ratio of two measured figures and a ratio has no upper bound: a pitcher with
six innings and a .190 xwOBA-against would otherwise halve a hitter's week on the
strength of one start. It keeps the projection's shape decided by **how much a
player plays** — the thing this can actually know — rather than by whom he plays.
A batter's adjustment is damped again through `STARTER_SHARE` (0.6), a starter
facing the top of the order three times and the bullpen covering the rest.

### Hurt is not rested, and a ratio cannot tell them apart

**The play share is how often a man is in his club's game, and for its whole
life it was one division: his games over his club's, across the last thirty
days.** That number answers *how often does he play* by conflating two things
that have nothing to do with each other — the days he was rested and the days he
was **not there**. Both directions were wrong, and both were reported:

- A man who missed three weeks and has started every game since he was
  activated read **0.21** and was projected for a fifth of a week he is going to
  play all of. Adley Rutschman, on the live board.
- A man placed on the injured list yesterday read **0.89** and was projected for
  a week he will play none of. Dansby Swanson, the same afternoon — and 26 of
  the 87 batters off the active roster that day read a share over 0.40.

**So availability is read rather than inferred, and the bench rate is measured
over the games he was available for.** Three answers in order:

1. **Off the active roster is a share of nothing.** The IL, the minors, a
   suspension, a DFA — `getAllRosterMembers`' own `status.code !== 'A'`, which
   is the feed's Upcoming rule (*"someone off the active roster is in none of
   them"*) and the same test `schedule.ts` already gates a rotation slot on. It
   is the thirty 40-man rosters `/api/statuses` and every roster badge in the app
   already read, on their own thirty-minute cache.
2. **Otherwise, his appearance rate since his last absence ended.** An absence is
   `ABSENCE_GAMES` of his club's games in a row that he was not in; the games
   before one belong to a month he was not part of, and holding them against him
   is the whole of the complaint. A thin stretch since is filled in by his own
   rate **before** the absence, on `blend`'s own shape — which is what lets the
   projection answer for a man activated this morning who has played nothing
   since.
3. **A club the day exports cannot answer for, or a man who has not appeared in
   a month**, falls back to the ratio as it was.

**A correction to the ratio rather than a replacement of it, and the units are
why.** The day export sees a man who *came to the plate*; the board's `games`
counts an appearance of any kind, a pinch-runner's included — and `projectBatter`
divides his plate appearances by that same count to get his per-game rate. Read
as a share outright, the record would answer in the wrong unit and quietly dock a
utility man for every game he was run for: measured, **Nick Allen is in 84% of
his club's games and at the plate on 44% of its days**, with no absence anywhere
in his record. So the record supplies the **shape** — where the gaps are, as the
factor `since / whole window` — and the board keeps the level.

**The threshold is measured, and it is two numbers.** Over the thirty days
ending 2026-08-17, the longest run of consecutive club games missed is **2** for
the 144 batters in 90% or more of them and **4** for the 84 in 75–90% — so at
**six** a regular's day off, a catcher's weekly rest and a platoon bat's weekend
against two left-handers are all bench time, and nothing that fires on those can
fire on this. **A reliever's is twelve**, because a reliever who misses six
straight may simply not have been needed: measured over 28,021 reliever cases,
truncating at six on its own *costs* accuracy (mean error 0.1486 against the
plain share's 0.1443, over-projecting his appearances by 6.2 points of share),
where twelve is about the shortest stint that would have put him on the list.

**Back-tested against what actually happened, over the whole season.** Every
player and every day of it, asking each rule for his share and comparing it with
the share of his club's next six games he really did play — **40,013 batter cases
and 28,021 reliever ones**, off the 143 day exports on disk:

| | batters | relievers |
| --- | --- | --- |
| the ratio, as it was | 0.2087 | 0.1443 |
| the truncation alone | 0.1791 | 0.1486 |
| availability alone | 0.1578 | 0.1119 |
| **both** | **0.1245** | **0.1070** |

a **40%** and a **26%** reduction in mean absolute error, and each half earns its
place — the truncation alone is a loss on relievers and availability alone
leaves the returner where he was. On the **5,485** batter cases where he was
genuinely unavailable, the old rule is off by **0.371** and this one by nothing.

**It is scored in appearance space**, which is worth saying plainly: the
back-test asks each rule for the share of his club's next six days he will be at
the plate in, because that is what the record can be checked against, where what
ships applies the same rule as a factor on the board's ratio. The two are the
same number for every player whose board games and plate-appearing days agree,
which is everybody who starts.

**What it costs is a little calibration, stated rather than buried.** The old
ratio was well calibrated in aggregate (+0.006 of share on a mean of 0.654) by
being wrong in both directions at once; this runs **+0.018** high, which is 2.7%
— inside the 3.1% the whole projection is already measured to sit at, and the
price of being right about two populations rather than cancelling out across
them. `ABSENCE_GAMES` is what buys it back if it ever needs buying: at twelve
the batter bias falls to +0.005 and the error rises to 0.1287.

**Measured through the engine on the live board, and checked against an
independent recompute of the same rule: 708 batters, 0 mismatches.** Of them
**271 move (38%)** — 186 to zero, every one of them off the active roster, and 85
up by a median of **0.34**. **Not one is docked**, which is the shape the ratio
form guarantees it will mostly have: it either raises a man's share or says he is
not playing. And it costs nothing to read, the thirty days behind it being the
thirty `getResearch(kind, 30)` has already assembled its own window from — a
cold roster projection is **87ms** and a warm one 0.

**It falls out for a traded player with no rule of its own.** His appearances are
under his old club's days and his new club's run has none of them, which reads as
an absence that ended when he arrived — so he is projected on his time here,
which is `clubFor`'s own answer to the same question one file over.

### A short record is pulled toward its own position

**A season-and-recent blend is a question about which of a man's own records to
believe, and it cannot answer the question underneath both of them: how much to
believe him at all.** Joshua Báez was recalled on 2026-08-15 and hit three home
runs in his first games. Nothing in a blend of his own season and his own last
month can know that ten games is not a rate, so the projection carried that pace
straight into the week ahead — reported as *"players that just debuted or
returned from injury that get off to hot starts should not be assumed to
continue that pace"*, and it was doing exactly that.

The fix is the oldest one in the subject: pull a rate toward the population it
came from, in proportion to how little of it there is — `own × n/(n+K) +
baseline × K/(n+K)`.

**The population is his own position**, and a pitcher's is his own **role**. A
short-sample catcher pulled toward a league that is 40% designated hitters and
corner outfielders would be trading one bias for another. The baselines are
summed rather than averaged — the group's counts over the group's plate
appearances, not the mean of its members' rates, so a 12-PA September call-up
does not weigh as much as a 600-PA everyday shortstop in the figure he is pulled
toward — and a group under 2,000 plate appearances (1,500 outs) **falls back to
the whole population**, since the point of a baseline is that it is the stable
thing and a thin position is another small sample wearing a population's
clothes. Both are built from the season boards `buildContext` already holds, so
neither is a read.

#### K was swept against what actually happened

The season board minus the 30-day board is an *early* half and the 30-day board a
*late* one. Each player's early rate is regressed at a given K and scored against
his own late rate, weighted by the late sample it is judged on. **362 batters**
with 20+ plate appearances either side over the ten counting stats a projection
is built from, and **390 pitchers** with 15+ outs either side over seven. Mean
absolute error per 1,000 plate appearances or outs:

| K (PA) | 20–74 PA | 75–199 | 200–399 | 400+ | all |
| --- | --- | --- | --- | --- | --- |
| **0** (as it was) | 47.692 | 33.382 | 27.867 | 24.879 | 28.947 |
| 100 | 35.041 | 31.181 | 26.627 | 24.357 | 27.256 |
| **150** | **35.042** | **31.134** | **26.464** | **24.318** | **27.162** |
| 200 | 35.100 | 31.167 | 26.410 | 24.342 | 27.155 |
| 300 | 35.301 | 31.326 | 26.441 | 24.491 | 27.256 |

| K (outs) | 15–59 outs | 60–179 | 180–399 | all |
| --- | --- | --- | --- | --- |
| **0** (as it was) | 90.635 | 58.936 | 46.779 | 55.881 |
| 60 | 71.555 | 54.691 | 45.558 | 51.710 |
| **150** | **70.379** | **53.927** | **45.045** | **51.044** |
| 300 | 70.208 | 54.305 | 45.217 | 51.268 |

**The curve is flat between 125 and 225 and the ends are what decide it.** A
short record improves enormously — **26.5%** on the batters inside 75 plate
appearances and **22.3%** on the pitchers inside 60 outs, which is the Báez case
and the just-off-the-injured-list case — and a long one barely moves, **2.3%** at
400+ plate appearances. That second half is the property that makes this safe to
apply to *everybody* rather than to a flagged few: a full season regresses to
itself. 150 is within 0.05% of the best figure in every bucket of both tables, so
one number serves where two picked per bucket would only be fitting the noise. A
pitcher's is in outs and a batter's in plate appearances — the same number and
not the same quantity, so they are two constants.

#### Blend first, then regress

The order is stated because it is not obvious and it is not symmetric. The blend
asks *which of his own records to believe*; the regression asks *how much to
believe him at all*. Regressing first would mix a league rate into the season
figure and then blend that against a raw 30-day one, which weights the baseline
by how recently he played rather than by how little he has played. The evidence
count is his **season** plate appearances, because that is what he has actually
done — the 30-day window is a subset of it, not an addition to it.

**A pitcher's `outsPer` is the one figure left alone.** How long he goes is a
fact about his job rather than about how well he has thrown: a rookie starter's
five innings is not a small sample of a starter's six, it is what his club is
letting him do, and pulling it toward the role would project innings nobody is
going to give him. It is also the denominator every rate rides on, so moving it
would move all of them a second time.

#### Measured through the engine, on the live roster

Projected over 2026-08-24 to 08-30, before → after:

| | chances | PA | H/AB | HR | R | RBI |
| --- | --- | --- | --- | --- | --- | --- |
| **Joshua Báez** (10 games) | 5.70 | 23.40 → **20.60** | 2.80/20.60 → **4.00/18.30** | 2.30 → **0.90** | 2.80 → **2.50** | 5.10 → **2.80** |
| **Manny Machado** (128 games) | 6.00 | 25.90 → 25.00 | 5.10/22.80 → 5.00/22.10 | 0.80 → 0.80 | 2.90 → 2.80 | 3.00 → 2.90 |

Báez's home runs for the week fall by **61%** and his runs batted in by 45%,
which is the complaint answered; his batting average goes the *other* way
(.136 → .219), because ten games that were three home runs and little else are a
small sample in both directions and the regression does not care which way it is
wrong. Machado, on a full season, moves by a tenth of a unit or not at all.
Tarik Skubal over two starts: ER 4.70 → 5.00, H 9.60 → 10.10, K 11.30 → 11.10 —
a strong pitcher with a big sample nudged very slightly toward his role.

**Nothing is drawn differently.** A regressed projection is still a projection
and the app already says so — the dashed chip, the muted row. A mark meaning
"this one is regressed harder than that one" would be a mark on every row, and a
mark that would be on every row marks nothing.

### ERA and WHIP at the start of a period, which were absent

**Reported as *"projections for matchups are not including ERA/WHIP at the
beginning of the matchup"*, and it was measured before it was fixed.** Read off
the live league at the opening of period 20 on 2026-08-24, ESPN's own
`scoreByStat` for both sides is:

```
{"0":0,"1":0,"3":0,"4":0,"5":0,"10":0,"12":0,"13":0,"18":0,"20":0,"21":0,
 "23":0,"34":0,"37":0,"39":0,"45":0,"48":0,"53":0,"57":0,"60":0,"83":0}
```

Every **component** is there at zero — `34` outs, `37` hits allowed, `39` walks,
`45` earned runs — and `18` (OPS) is there at zero too. **`41` (WHIP) and `47`
(ERA) are absent altogether**, because there is no denominator to divide by yet.
They are two of the ten categories this league scores.

`withAddedComponents`' standing rule is that today's day *"can move a number
ESPN already gave this side and can never invent one"* — a category absent from
`scores` is one the side is ineligible for, and putting it back as a zero-based
total would read as the best score in the league in a `lowerBetter` category.
That rule is right about **today** and wrong about **the end of the week**: a
side that has not pitched yet is not ineligible, it is early. So the projection
passes `createRates`, and two guards keep it honest:

- **Only a `DERIVED` rate may be created, never a counting category.** ESPN sends
  a counting stat as `0` from the first minute of a week, so a counting category
  that is genuinely absent is genuinely ineligible — and the identity this file
  is measured on stays true where it was about something.
- **The zero denominator is its own guard.** All nine `DERIVED` rules return
  `null` on an empty denominator, so a side with no pitching to project produces
  no ERA rather than a `0.00`. The dangerous case cannot be reached from here.

Measured through the route on the live league, before → after: **8 categories
per side → 10**, on every side of every matchup; the two added are `41` and `47`
and no counting category moved. Team 6 now projects `ERA 3.42 / WHIP 1.142`
against team 12's `3.11 / 1.142`, and the tallies follow — `4-2-2 → 5-3-2` and
`2-4-2 → 3-5-2`, one of the two new categories to each side, which is what
those figures say. **422ms cold and 1.5ms warm**, unchanged.

### What it deliberately does not do

- **It does not project today's games that are already under way.** A `live` or
  `final` game is counted as it stands, because the current total already holds it
  — `withAddedComponents` put today there — so only a game still `scheduled` is
  projected. A matchup read at nine in the morning therefore projects the whole
  day and one read at nine at night projects almost none of it, which is the
  honest reading either way. A **postponement is not a game he gets**, which is
  `schedule.ts`'s own rule.

  **And "already under way" is asked of the clock as well as of the state**,
  which is a correction rather than an addition. `state` is right and goes
  *stale*: it rides on the league-wide schedule window, cached **thirty
  minutes** (`WINDOW_TTL`, set by how often probables move — the slowest thing
  in that blob), so for up to half an hour after a first pitch the window still
  says `scheduled` and this went on projecting a game whose runs were already
  landing on the report beside it. That is the double count this rule exists to
  prevent, arriving through the cache instead of through the rule. `yetToStart`
  reads `startTime` too, which cannot go stale: a `scheduled` game whose first
  pitch is behind the clock is a game under way that this process has not been
  told about yet. **Measured** against a deliberately staled window — today's
  games put back to `scheduled`, which is exactly what the cache says half an
  hour in — over a 28-man roster on 2026-08-19 at 21:50 ET with all fifteen of
  the day's games played or playing: the old state-only rule answers **5 days
  left and 59.40 expected games**, the new one **4 and 46.20** — 13.2 games of
  double count, every one of them already on the report. On a window that is
  *not* stale the two agree exactly (46.20 either way), which is the other half
  of the measurement. It fails toward *not* projecting: a delayed game reads as
  started and is left out, understating by a game where the alternative
  overstates by one that is already counted — and understating is the direction
  the whole of this file errs in. `daysLeft` is counted through the same helper
  rather than repeating the test inline, which is how the two came to disagree
  about a game under way in the first place.
- **It does not guess at lineup changes** — *superseded; it now fills the lineup
  a day at a time, and the argument and the numbers are in* **The lineup is
  filled a day at a time** *below.* The reasoning it replaced is left standing
  because it is the reasoning every measurement above was taken under: *it
  projects the players a manager has in a lineup slot right now — the same
  assumption `scoringPeriodTotals` already makes for today, and the same
  `NON_ACCRUING_SLOTS` rule. A bench player he starts tomorrow is not in it and
  neither is anybody on his IL.* Half of it still holds exactly: **anybody on
  his fantasy IL is still not in it**, that being a roster move rather than a
  lineup decision. And what it *does* read is **MLB's** own roster status, which
  is a different question and a fact rather than a guess: a man on the injured
  list plays none of the week whatever slot his manager has left him in.
- **It does not guess at a return date.** A player on the IL is projected at
  nothing for the whole span, even where he is due back on Thursday — MLB
  publishes no such date and the app holds none, so the honest answer is the one
  it can stand behind. It errs the way the whole file errs: toward saying less.
- **It does not adjust a pitcher's outs.** A tough lineup shortens an outing, and
  putting that in would move the *denominator* of every rate as well as its
  numerator — a projection that got worse in a way nobody could see. He pitches as
  long as he has been pitching. **Wins take the inverse multiplier**, being the one
  thing on a pitcher's line that moves the other way from runs.
- **It is not a probability.** One expected value per category, no distribution and
  no interval, which the key on screen says in as many words.

### The lineup is filled a day at a time

**The engine rested on one assumption — *the lineup a manager has set today
stands for the rest of the week* — and it is the assumption that made the
projection wrong in the one direction nobody wanted.** A starting pitcher
benched on his off day was projected for **no start at all**; a reliever left on
the bench for nothing; a bench bat for nothing on the Thursday four of the men
ahead of him are idle. Every one of those is a figure the reader can see is too
low, and the fault was never in the arithmetic — it was in projecting a lineup
nobody was going to leave alone.

**So the lineup is set again every morning, which is how ESPN itself models
it.** `lineupLocktimeType` is `INDIVIDUAL_GAME` on the live league — a slot
locks when *that player's* game starts rather than when the day does — so every
one of these choices is genuinely in front of a manager who looks once a day.
Three rules, and they fall out of one mechanism rather than being three cases:

- **A starting pitcher is in the lineup on the day he starts.** His turn comes
  off the rotation map the Schedule view's grid already draws, so he brings one
  unit on that day and nothing on the six around it — and the seat he is *not*
  using on the other six is a seat somebody else gets. Who counts as a starter
  at all, and what happens when more of them are going than there are seats, is
  **The pitching seats: role, then rank** below.
- **A reliever is in the lineup when he pitches**, benched today or not. Nobody
  can know which day that is, so he competes every day at his appearance rate,
  which is exactly what the seat is worth in expectation.
- **The batting order fills as far as it will go**, every day.

**Who deserves a seat is measured, and measured off *MLB* lineups rather than
fantasy ones.** `playShareOf` is already how often a man is in his club's game
over the games he was **available** for — the availability-corrected share this
file back-tests at 0.1245 mean absolute error over 40,013 batter cases — so an
everyday shortstop brings ~1 unit a day, a strong-side platoon bat ~0.6 and a
backup catcher ~0.25. The regulars take the seats without anybody having to
write down who the regulars are, and the alternative (reading how often the
*manager* starts him, which the per-day roster history would answer) was
rejected for a reason worth stating: it bakes in exactly the bench decisions
this change exists to look past.

**When more men are available than there are seats**, the seat goes to the best
projected value in the league's own **counting** categories, each normalized by
what the rest of that roster does per day — so a 5×5 league and a twelve-category
one come out on the same scale with no constant here to drift from the league's
actual settings. **Rate categories are deliberately not in the ordering**, and
that is a limitation rather than an oversight: a rate is not additive, a
player's effect on a team ERA depends on the innings underneath it, and ranking
on his own ERA would seat a one-inning specialist above a workhorse worth far
more of the same category. They are still *projected* — every category the
league scores is in the answer — it is only the seating order that ignores them.
A league scoring nothing but rates falls back to units, which is the request
read literally: fill the seats with whoever plays most.

**The assignment is optimal rather than a heuristic, and that is worth one
sentence because it looks like it should be hard.** A player is worth the same
in every slot he is eligible for, so the weight is on the *player* and not on
the pairing — which makes taking them in descending order and keeping each one
that still fits provably optimal (it is the greedy algorithm on a transversal
matroid). "Still fits" is the ordinary augmenting search, so a man whose slots
are all taken still gets in when one of the sitting players can shuffle to
another seat he is eligible for. Hitters and pitchers never compete for the same
chair, so it is two small assignments rather than one twice the size.

**Not one input is a new upstream and not one byte of it is on the wire**, which
is the rule the rest of this file is built on. The slot counts are stashed out of
the `mSettings` half of the roster read that already happens (`lineupSlotsFor` —
a module cache rather than a field on `EspnOwnership`, precisely so they do not
travel); the raw `eligibleSlots` ride on the cookie-free player pool that read
already asks for, as a third map beside `pct` and `eligible` that `getOwnership`
does not copy onto the object the client reads. Measured through the route: the
response is **3,367 bytes / 1,018 gzipped**, against 3,370 / 1,032 before.

**Two things still do not compete.** The **fantasy IL** is a roster move rather
than a lineup decision, which is the line this file already draws at *it does
not guess at a return date*; and a man **off MLB's active roster** brings zero
units, so he never takes a seat — that falls out of the play share rather than
being a case here. A league that published no slot counts gets `plan: null`,
which is exactly the rule this file had before, and so does **the Roster view's
own projection**, which has no lineup to fill.

### Measured, on the live 12-team league

Week 19, five days left, both engines run against the same board minutes apart:

| | before | after |
| --- | --- | --- |
| hitter-games | 554 | **575** |
| starts | 48 | **61** |
| relief appearances | 83 | **84** |
| sides raised / lowered | | **12 / 0** |

**The starts are the headline and they were checked against an independent
recompute** — every rostered rotation starter's projected turns inside the
window, taken straight from `/api/schedule`'s rotation map and probables and
joined to the rosters, with no part of `projection.ts` involved: **61 against
61, 0 of 12 teams disagreeing.** The thirteen it recovers are named, which is
the sharpest way to say what the old rule cost: Yamamoto, deGrom, Sale,
Imanaga, Alcantara, Misiorowski, May, Abbott, Boyd, Woo, Henderson, Burke and
Bennett were all on a bench with a turn this week, and all thirteen were
projected for nothing.

**The other two numbers reconcile exactly.** League-wide there are **17 bench
starting pitchers** (13 with a turn — the +13), **1 bench reliever** (Seymour —
the +1) and **17 bench batters**, whose seats plus the ones freed by idle
starters are the +21 hitter-games.

**The seat capacity is never exceeded**, instrumented over every assignment the
run makes: **0 of 120 day/side assignments** seat more men than the league has
chairs. The live league starts **11 batting** and **9 pitching**; batting is
full on **46 of 60** day-teams (mean 10.13 seated of 11 — the shortfall is a
roster that genuinely cannot fill it, not a bug in the matching), and pitching
is full on **0 of 60** at a mean of 4.33, which is why "a reliever is in the
lineup when he pitches" is a pure gain in this league: its pitching seats were
never contended.

**Identity checks over every side of the live board**: **0** categories
invented, **0** lost, **0** non-category stats shipped, **0** counting
categories projected below the figure already banked, **0** tallies that
disagree with the cells beside them, and **0** counting cells anywhere that
came out *below* the old rule — which is the shape the change guarantees, it
being able only to use seats that were going empty.

**The Roster view's projection is byte-identical**, checked rather than
asserted: the same request against both engines returns the same 1,351 bytes
and the same `players` array, differing in `fetchedAt` alone.

**It costs nothing to read.** Through the route: **315–451ms** cold with the
boards warm, **0.9–1.2ms** off its own minute — against the 580–858ms and
34–35ms recorded above, which is the same read plus a matching problem small
enough to disappear into it. Driven in a browser at 1200: the Rankings lens
draws its 12 rows under `Week 19 · projected to Aug 23 · 5 days still to play`
and a matchup page opens its 20 category rows, both lit, **0** error banners and
**0** page overflow.

### The pitching seats: role, then rank

The first cut of the fill treated the pitching side as one list ordered by value,
which got two things wrong that the batting side has no equivalent of.

**A manager does not weigh a start against a relief appearance.** He starts the
man who is starting and fills what is left — so the seats now go by **tier and
then by rank**: every starter with a turn that day is asked before any reliever
is considered at all, and inside each tier the order is value. `seatDay` already
fills in whatever order it is handed and the greedy pass is optimal for that
order, so this is a comparator rather than a new algorithm.

Both halves of that matter, and each answers something the reader named:

- **Seven seats and eight starters going means the best seven start**, and the
  eighth genuinely misses out rather than being quietly assumed in. A rotation
  slot is not a lineup slot, and on a Sunday when everybody's turn lands the
  difference is real.
- **The relievers who fill what is left are the best of them**, rather than
  whoever the iteration reached first.

**And role is read from what he is doing now**, which is where the SP/RP
eligibility the reader flagged comes in. `isRotationStarter` — a majority of his
appearances are starts, over the whole season — is the app's definition of who
*works out of a rotation*, and it is right for labelling a player and wrong for
projecting one: the men it is most wrong about are exactly the ones a manager is
deciding over. The starter moved to the bullpen in July still reads starter; the
long man given a rotation spot a fortnight ago still reads reliever; and the
**swingman ESPN lists as both SP and RP** has a real role this week and two
eligibilities that cannot say which. `currentRole` answers in four rules, the
first two being facts rather than inferences: he has a turn in this window; he
holds a rotation slot whose turn falls outside it; the last thirty days where
there are `ROLE_MIN_GAMES` (3) of them to read; then the season, which is the
old behavior.

**Eligibility is not role, and keeping them apart is the point.**
`eligibleSlots` says which chairs he may sit in and nothing whatever about what
he will do; `currentRole` says what he will do and leaves the chair to the
assignment. A swingman is therefore free to take an `SP` seat on a day no
starter wants it, and is still projected in the shape he is actually being used
in.

**`rotationIds` is the second rule and it earns its place on its own.**
`starters` answers *who has this game* and goes quiet for a man whose next turn
falls the day after the span ends — which a six-man rotation over a five-day
week has several of. Without it, half such a rotation reads as relievers and gets
projected for relief appearances nobody is going to ask them for.

### The trap this walked into, which is why the shape is still the old test

**The role says *when* he pitches. His own record says *how much*.** They look
like one question and conflating them is a measured disaster rather than a
tidiness point.

`projectPitcher`'s starter view divides his season **outs** by his season
**starts**, which is a per-start rate only when the starts are where the outs
came from. **Bryan King is 50 appearances, 1 start and 155 outs** — an opener,
and exactly the man `currentRole` newly gets *right* about the day. Read as a
starter he projects `155 / 1` outs in a single outing, blended with his thirty
days to **≈143 outs — 47.7 innings, in one appearance.** That shipped into a
commit on this branch and was caught by measuring the branch rather than by
building it.

So `starterView` stays on the old majority test, which is the one thing that
test is genuinely good for: it is precisely the condition under which `outs / gs`
is a number about starts at all. A mixed-role pitcher is seated on the day he
starts and projected **per appearance** — under his real workload, and by a long
way the safer of the two directions to be wrong in.

### Measured

**The role rule moves two of the 124 rostered pitchers**, and both the way it
was built to: Bryan King and Ian Seymour, `reliever → starter`, each because he
has a **turn in the window** that the season's majority could not see. Recomputed
independently from `/api/schedule`'s rotation map, the 30-day board and the
season board, with no part of `projection.ts` involved.

**The tier rule is currently inert on this league and was driven anyway**, which
is the only honest way to test it: the live league starts nine pitchers and fills
a mean of **4.33** of them, full on **0 of 60** day-teams, so nothing contends.
Squeezing the pitching seats to three and re-running the whole board:

| squeezed to | contended day/team cases | reliever seated over a skipped starter | lower-ranked man preferred inside a tier |
| --- | --- | --- | --- |
| 3 seats | **33** of 60 | **0** | **0** |
| 1 seat | **16** of 60 had *more starters than seats* | **0** | **0** |

At three seats a starter valued **5.89** is seated ahead of two relievers valued
**7.64** and **7.55**, which is the tier rule doing the one thing value ordering
alone would never do. At one seat, three starters compete and the best (**8.03**)
takes it while the other two genuinely do not start.

**The board, against the rule this file had before any of this:**

| | before | after |
| --- | --- | --- |
| hitter-games | 554 | **575** |
| starts | 48 | **63** |
| relief appearances | 83 | **81** |
| sides raised / lowered | | **12 / 0** |

Relief falls by two where starts rise by two, which is the reclassification
showing up in both columns at once rather than anything being lost.

**Identity checks over every side**: **0** categories invented, **0** lost, **0**
non-category stats shipped, **0** counting categories below the figure already
banked, **0** tallies disagreeing with their own cells. Through the route:
**310–332ms** cold, **3,368 bytes**.

**The role rule reaches the Roster view too**, `projectOnePitcher` being one
function with two callers, and that is intended — *what is he doing now* is the
better answer to a roster row as much as to a matchup. Measured on the live
watchlist it changes nothing there, none of its four players having moved role.

### An opener is neither a starter nor a reliever

**Three of the four decision categories are settled by rule rather than by a
pitcher's record, and the rule is about the outing rather than about the man.**

- **A save and a hold are relief statistics.** Neither can be earned by the
  pitcher who starts the game, ever. So both are zero for anybody projected on a
  turn day, whoever he is: for a genuine starter his record's figures are near
  zero anyway and nothing moves, and for the **swingman** it is the difference
  between a real projection and one crediting him with the holds he collects on
  his *other* days.
- **A starter must complete five innings to be credited with the win.** An
  opener — a reliever's workload on the day he happens to start — cannot
  qualify, and the wins on his record were earned in relief where no such rule
  applies. Zeroed in that case alone (`!starterView`), because a genuine
  starter's rate is `wins / starts` off his own record and **already** carries
  how often he goes the five; docking him again would charge him twice for one
  fact.
- **A loss is the one decision he can still take**, so it keeps its rate.

This is why an opener is worth so much less than either of the things he
resembles, and the seat ordering sees it *through the projection* rather than
through a rule of its own — there is no "opener" branch anywhere, only a pitcher
whose line comes out small because the rules of baseball make it small.

**Measured directly** on the two men the role rule newly starts, comparing the
same outing with the rule and without it:

| | outings | outs | W | SVHD |
| --- | --- | --- | --- | --- |
| **Bryan King** (50 G, 1 GS) | 1 | **3.0** | 0.043 → **0** | 0.385 → **0** |
| **Ian Seymour** (39 G, 10 GS) | 1 | **11.2** | 0.272 → **0** | 0.363 → **0** |

King's three outs are the signature: exactly one inning, which is what the
workload rule above already had right and what an opener is. Neither figure
reaches the wire on its own — a count is rounded to a whole number there, and
0.385 of a hold is not — which is precisely why it was checked at the bucket
rather than at the response.

### The seat goes by what the day is worth, not by what an outing is worth

**Two corrections, and together they retire the hard tier.**

**Expected value *that day* is `units × value`, and the units were missing.** A
starter brings a whole outing and a reliever brings his appearance rate, so
ranking on per-outing worth alone compared a 0.4-of-an-appearance reliever as
though he were certain to pitch. This is most of why a start outranks a relief
appearance in the ordinary case: it is one unit against four tenths of one.

**And the value now carries the rate categories, as a marginal.** A rate is not
additive, so *his* ERA says nothing about what he is worth to a side — a
one-inning specialist at 1.50 and a workhorse at 3.10 are not comparable
figures, and ranking on them seats the specialist. What **is** comparable is what
one more outing of him would do to the side's own rate, so the value adds a unit
of him to the roster's whole projected line and asks what the category becomes.
The formulas are `espn.ts`' **`DERIVED`**, exported rather than copied: it is
already the definition every score on the board is rebuilt from, and a second
table of the same nine would be a second table to keep in step.

**`Candidate.tier` is superseded and its reasoning left on the interface.** It
was *every starter going that day before any reliever is considered*, which is
usually true and is not a rule — and a hard tier made exactly the cases that
prompted this impossible to express. Now a start outranks a relief appearance
because it **is worth more**, and does not when it genuinely is not.

**Driven under a squeeze, the live league's nine pitching seats never being
contended** (a mean of 4.33 filled, full on 0 of 60 day-teams — so the ordering
cannot be tested on it as it stands). Cutting the pitching seats to two and
re-running the whole board: **46 of 60** day-teams contend, the ordering is
monotone in worth on every one of them, and **a reliever is seated over a
skipped starter in 17 of them**. One of those, in full:

| | | worth | |
| --- | --- | --- | --- |
| a starter | SP | **14.59** | seated |
| a reliever | RP | 4.24 | seated |
| a reliever | RP | 3.96 | — |
| a reliever | RP | 3.52 | — |
| a reliever | RP | 2.36 | — |
| a starter | SP | **−0.87** | — |
| a starter | SP | **−1.94** | — |

which is the reader's own case arriving as arithmetic rather than as a special
rule: the good start leads everything by a distance, and the two starts whose
damage to ERA and WHIP outruns their strikeouts and their share of a win come
out **negative** and lose their seats to relievers worth a quarter as much as
the ace.

### P, SP and RP, and what is deliberately not modelled

**The three pitching slots were always handled and are worth stating.** ESPN
gives `13` to `P`, `14` to `SP` and `15` to `RP`, the seats are expanded one per
body from the league's own `lineupSlotCounts` (five, two and two on the live
league), and who may sit where is ESPN's `eligibleSlots` rather than anything
inferred. Measured across all twelve rosters: **81** pitchers are `P`+`SP`,
**49** are `P`+`RP`, and **17** are `P`+`SP`+`RP` — the swingmen, who can take
any of the three chairs and whose *role* is `currentRole`'s business rather than
their eligibility's.

**What is not modelled, deliberately: the opponent.** A manager who is facing a
side with far more starting pitchers than his own may punt the categories he
cannot win and protect the ones he can, which is a real thing managers do and is
a **strategy** model rather than a projection — it needs the opponent's roster,
his own read of the matchup, and an intent this app cannot observe. What is here
instead is the honest half of it: the value a start is worth *to his own side*
now includes what it does to ERA and WHIP, so a start that genuinely costs more
than it brings loses its seat to a reliever without anybody having to guess at
why the manager wanted it that way.

**And a seat is still filled where one is free.** Where the pitching slots are
not contended — which is every day of the live league — a negative-worth starter
is seated anyway, on the reading that a manager with an empty slot generally
uses it. Benching him outright would be a stronger claim about behavior than the
evidence supports, and it is the one lever to reach for if this is ever wanted:
refuse a seat below a worth of zero.

### Measured, end to end

Against the rule this file had before any of the lineup work:

| | before | after |
| --- | --- | --- |
| hitter-games | 554 | **577** |
| starts | 48 | **63** |
| relief appearances | 83 | **81** |
| sides raised / lowered | | **12 / 0** |

Relief falling by two where starts rise is the reclassification showing in both
columns at once rather than anything being lost. **Identity checks over every
side**: **0** categories invented, **0** lost, **0** non-category stats shipped,
**0** counting categories below the figure already banked, **0** tallies
disagreeing with their own cells. Through the route: **310–710ms** cold and
**3,368 bytes**.

**The Roster view is byte-identical**, and this time both halves were captured
minutes apart rather than hours: **0 of 4** players differ. (An earlier
comparison showed one, which was the boards refreshing under a stale baseline
and not the code — worth recording, because it is the shape a false positive
takes here.)

### The engine has a second caller, and so it has a context

**`projection.ts` is written against a `ProjectionContext` rather than against a
matchup**, because there are two callers now and they know different things: a
matchup knows two ESPN rosters and a week, and the **Roster view** knows a saved
list and whatever range the reader has picked (see **Client — the Roster view**,
*The Projected reading*). What they share is *the rest of the schedule and how
everybody has been going* — the league-wide schedule window with its rotation
map, the season and 30-day research boards for both kinds, the two team-hitting
cuts for every club that still has a game, and the season roster list for the two
handedness maps. **Not one of those is a new upstream**, and three of the four are
pulled warm nightly.

`buildContext(from, to)` assembles it and `projectOneBatter` / `projectOnePitcher`
are the per-player core; `projectTeam` is a loop over them that merges the buckets,
which is what it always was written as. **`remainingGames`' rule is what keeps a
figure from being counted twice**: today counts only where its games have not
started — `yetToStart`, which reads the first pitch as well as the cached state,
for the reason set out under *What it deliberately does not do* — and a
postponement is not a game anybody gets.

**`getRosterProjection(players, start, end)` is the second entry point.** It keeps
the per-player buckets apart rather than merging them and turns each into the
client's own `BattingLine` / `PitchingLine` — so a projected roster row is the
summary table's row over different numbers, exactly as a projected matchup card is
the scoreboard's card over different numbers. **A count is rounded to a tenth
there rather than to a whole number**, and rounded on the *server* so the client's
`Total` row sums what it printed: a side's week is twenty of these added together
and rounds to an integer honestly, where a per-player 0.4 home runs over three
days is a real answer and `0` is not.

#### `getGameProjection` is the fourth entry point, and the narrowest

**One man over one game**, which is what a game preview draws — see **Client —
the League view**, *The key and the glyph are one component*, for the block
itself, and `/api/projection/game` in **Server** for the route. It is the same
arithmetic narrowed rather than a second one: `contextFor(day, day)` and then
`projectOneBatter` / `projectOnePitcher`, so a figure in a preview and the same
man's figure under the roster's toggle come off one function over one set of
boards.

**What it adds to the pair above is a narrowing by `gamePk` rather than by
date**, and a doubleheader is why. `chancesOf` is now the one filter both halves
of the engine ask, and it takes either: a set of **days**, which is the lineup
planner's *the days your fantasy team starts him*, or a single **game**. The
second is deliberately not a set of one day. Measured on the live schedule,
**Cody Bellinger on 2026-08-29** — the day NYY play BOS twice — the board's
one-day lens reads **2 games / 8.1 PA** with `projGame` naming only the first,
where this reads **1 game / 4.0 PA** for each half and names each half's own
opposing starter (Jake Bennett for 823501, Ranger Suarez for 823539). `fixtureOn`
was split for the same reason: `fixtureFor` finds by `gamePk`, and the *reading*
off the found game is one function (`fixtureOf`), so the board, the grid and a
preview cannot come apart over who is on the mound.

**A fraction is the answer rather than a rounding of one**, which is why
`chances` rides on the response beside the line. A batter who sits one start in
five is `0.8` of a game and eight tenths of a line; a reliever is his share of an
appearance; a starter on his turn is `1`. Zero is the honest absence and there
are exactly three ways to reach it — a starter whose turn falls elsewhere, a man
off the active roster (`playShareOf`'s `offRoster`, the only route to zero for a
batter), or no fixture at all, which is the game having started under the
reader's finger — and the client names which. Measured 2026-08-25: Ohtani vs
Bryce Elder **0.96 G / 4.1 PA / 0.2 HR**, Elder himself **1 start / 18.1 outs /
2.4 ER / 5.0 K / 0.4 W**, Aaron Judge **0**, which is what the roster lens reads
for him over the same days.

#### A component is rounded where it is a column, and left alone where it is only an input to a rate

**Every component was rounded, and the projected OPS a short span printed was the
OPS of the rounding rather than of the projection.** Reported as *"his OPS for
each individual day is higher than his OPS for the remaining matchup date
range"*, which is not a thing that can be true: `OBP` and `SLG` are each a
weighted mean of the daily figures — the weights being that day's share of the
on-base denominator and of the at-bats — so a range figure has to land between
the lowest and the highest day's, and a projection that is *below all of them* is
arithmetically impossible.

The engine was not the fault. It is additive by construction (`projectBatter`
loops over one multiplier per game and adds into a bucket), and the unrounded
answers say so to the last digit: team 6's Trent Grisham on 2026-08-21, projected
one day at a time, comes to **0.704 + 0.717 + 0.831 = 2.252 hits** against the
three-day range's **2.252**, and **3.625 + 3.619 + 3.561 = 10.805 at-bats**
against **10.805**.

What broke it was `round1` reaching quantities a tenth cannot describe. Over one
day this man's home runs are **0.163** and his doubles **0.160**; a tenth prints
both as `0.2`, and `totalBases` — derived from the *rounded* components — then
multiplies the home-run error by four. Four readings of the same three days:

| | Aug 21 | Aug 22 | Aug 23 | Aug 21–23 |
| --- | --- | --- | --- | --- |
| every component rounded (shipped) | .692 | .692 | **.744** | **.681** |
| unrounded | .644 | .657 | .767 | .689 |
| columns rounded, rate's own inputs kept (now) | .655 | .662 | .748 | **.690** |

The middle row is what the projection actually says; the top row is the fault —
the range under all three days, and two genuinely different days (.644 and .657)
printing the same figure because a tenth swallowed the difference.

**So `battingOf` rounds a component where the table prints it and leaves it alone
where it does not.** `SummaryTable.tsx::StatCells` draws `H/AB`, `R`, `HR`, `RBI`,
`SB`, `BB` and `K`; it never draws `1B`, `2B`, `3B`, `HBP`, `SF` or `TB`. Rounding
the first set is what the `Total` row's "add a column up and get the figure at the
foot of it" rests on and it is untouched — **not one printed count moved**, on any
row, at any span. Rounding the second set bought a reader nothing, there being no
column to add, and cost the one rate on the row. `PA` is rounded with the columns
although it is not one: it is the row's blank test (`pa === 0` is the man drawn as
dashes), and an exact `0.0001` would draw him a line of noughts.

**This is the rule `categoryScores` already followed**, one section down — *the
rates are derived before the rounding* — arrived at there by the same
measurement (deriving OPS from a rounded home-run count moved it by up to 3.1
thousandths on a *week*; on a day it moves it by 48). The two entry points now
agree.

**The unprinted components ride at four decimal places, not full precision**
(`round4`). `0.15960384659945423` is seventeen characters of wire for a number
nobody prints, and six such fields ride on every player twice over — the line and
the lineup's half of it. Four rather than three because the only reader is a rate
written to three, and rounding an input to the width of its own answer is how a
thousandth comes to move: measured, identical to the last digit of `.655 / .662 /
.748` against `.690`, and **1,108 bytes off a 20,261-byte response**.

**`pitchingOf` is deliberately untouched.** ERA and WHIP divide `earnedRuns`,
`hits` and `walks` by `outs`, and the pitching run prints every one of those four
— so there is no unprinted input to leave exact, and the rate on screen is
already the rate of the numbers beside it. Where a batter's `TB` was a hidden
component multiplied by four, a pitcher's worst case is his own `ER` over his own
`IP`, both on the row.

**It needs no league at all.** `getOwnership` is the matchup path's alone — every
input to the context is league-wide — so a reader with a saved roster and no ESPN
connection gets the same engine. The context is memoized per span on the same
minute the matchup projection uses, with a rejected read dropped rather than
remembered.

### Only the categories go out, and a count is rounded

`categoryScores` is the whole of the wire. **The rates are derived before the
rounding and the tally computed after it**, and both halves are deliberate:
before, because a rate should be the best estimate rather than one that inherits
the rounding of up to four components — measured, deriving OPS from the *rounded*
home-run count moves it by up to **3.1 thousandths** and changes the printed
figure on 11 of 36 cells; after, because a reader can add up a **tally** and
cannot derive an OPS, so the headline `8-2-0` is computed from exactly the figures
the cells show. ERA and WHIP are **exact** either way, their components not being
categories this league scores and so never rounded.

**The components do not ride along.** `scoreByStat` carries all 23 stats ESPN
tracks and the scoreboard ships them because they arrive free in ESPN's own
payload; every component here is a number this file *computed*, and nothing reads
them — the rule `teamProbablePitcher`'s removal sets. Measured: **6,948 bytes to
3,370, and 2,868 gzipped to 1,032.**

### Caching, and a settled week

Memory per league and period on the scoreboard's own minute, with an `inFlight`
guard, because that is what it is built on: a projection whose already-happened
half was a minute stale would be a minute stale itself. `?refresh=1` reaches it
and `dropProjections` clears a league, which is the same statement about a league
rather than about a week that `getOwnership` makes.

**A settled period answers `ok: false` with `note: 'settled'`** rather than an
error. Nothing is wrong with a week that is over; there is simply nothing left to
project, and the client draws no toggle at all.

### Measured, and calibrated against the period's own rate

**Through the route on the live league**: **580–858ms** with the boards warm
(which they are — three of the four are pulled nightly) and **34–35ms** off its
own minute, for **3,370 bytes / 1,032 gzipped**.

**Calibration.** Normalising both halves of the period by *expected hitter-games*
— each club's games in each half times each man's own play share — the league
comes to **0.515 runs per expected hitter-game over the eight days played and
0.531 projected over the six left: a 3.1% difference.** Per team the two agree to
within a few per cent on nine of the twelve; the outliers are exactly the ones a
projection should move, and in the right direction — **Sho me the Parlay +37%**
and **Didl +14%**, both teams whose observed week (0.375 and 0.395) is well under
the league, regressed up toward their players' own form, and **Swaggy −6%**, a hot
week (0.613) regressed down.

**Identity checks over every side of the live board**: **0** counting categories
projected *below* their current figure, **0** categories invented where the side
has none, **0** lost, **0** tallies that disagree with the cells beside them, and
**0** matchups whose winner disagrees with its own tally. ERA and WHIP recompute
from the projected components exactly (0.00e+0).

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

**What the polling costs upstream is one league's worth per tick, not one per
reader**, which is the measurement the whole cadence rests on: every cache in
this file is keyed by league, so twelve leaguemates all sitting on the League
page cost the same one read that one of them does — and only while somebody has
the page in front of them, a hidden browser tab skipping its ticks outright.
That is also what makes the cadence affordable to halve: two reads a minute for
a whole league rather than two per reader.
