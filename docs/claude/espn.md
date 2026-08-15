### ESPN fantasy league (`server/src/espn.ts`)

Connects one ESPN fantasy baseball league per user, so the research board can be narrowed to the **free agents in it** — and, since the board's include buttons became three rather than one, to the players on somebody else's roster in it. There is no public API and no key: a private league is visible only to someone signed in to it, so the app reads it with the user's own two session cookies, `SWID` and `espn_s2`. The shapes read here are the ones `cwendt94/espn-api` reads — `mRoster` for the rosters, `mTeam` for the team names and the owner ids, `mSettings` for the league's name — off `lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/{season}/segments/0/leagues/{id}`, with the cookies sent as a raw `Cookie` header (`espn_s2` arrives already percent-encoded and **must not** be encoded again).

**Free agency is read as the complement of ownership**, not from ESPN's own free-agent board. Both give the same answer — measured against a live 12-team league, `kona_player_info` with `filterStatus: [FREEAGENT, WAIVERS]` and "every MLB player not on a roster" agreed on 1050 of 1051 — but the roster read is 319 rows and 2MB against 3602 rows and 10MB, and it keeps ESPN's whole minor-league universe out of the name index, where it would only add collisions. It also means a player ESPN hasn't got round to listing is available rather than invisible, which is the right way for this to fail.

**The join is by name plus team, because ESPN publishes no MLB id.** `normalizeName` strips accents, case, punctuation and generational suffixes (ESPN's "Luis Garcia Jr." against MLB's "Luis García Jr."); the club then disambiguates, since duplicate names are real — two Fernando Cruzes, two Wilmer Floreses, one of each a minor leaguer. Team first and name second: a club match is decisive, and falling back to the name alone covers the player ESPN still has on his old team the morning after a trade. **An ambiguity neither test resolves is left unmatched rather than guessed** — marking the wrong Wilmer Flores as owned is worse than marking neither. The team match needs `ESPN_TO_MLB_TEAM`, a table because neither numbering system is derivable from the other; ESPN's `0` (no club) is deliberately absent. Checked against that league: **317 of 319 rostered players matched**, and the two that didn't are players the MLB season roster has never listed, so they could not have reached the board to be marked either way. The response carries `rosterCount` and `matched` for exactly that reason — a match that has silently stopped working (a wrong season, most likely) shows up as a gap rather than as a league where everyone is free.

Cached in memory per league for **10 minutes**, much shorter than the six hours the league-wide stat tables settle on: rosters move whenever anyone in the league makes a move, which is the point of the feature. An `inFlight` map keeps a cold Lambda from sending three upstreams at once, and `?refresh=1` skips the cache for the user who has just made a move — carried by **all three** reads of that payload (`/api/espn/ownership`, `/api/espn/roster` and `/api/report?source=fantasy`, the last two through `fantasyWatchlist(user, refresh, date)`), since a lineup move changes the slot chips, the free-agent set and *which players the report is about*, and refreshing one of the three would leave the app describing two different rosters. The MLB name index behind it is its own fetch of `sports/1/players` (1h) rather than `getSeasonPlayers`, which resolves a player's club to its **full name** where this needs the **team id**.

**Which day's lineup.** A lineup is a fact about a *day*, and `mRoster` answers for one day only — whichever **scoring period** ESPN happens to be on if the request doesn't name one. That was a real bug and the plainest kind: a manager moves a starter off his bench for tomorrow's games, ESPN files it under tomorrow's period, and the app went on reading today's and drawing him on the bench. Checked against the live league on 2026-08-11 (period 140): Gilbert `BE` / Webb `SP` at 140, and the reverse — the change that had just been made — at 141, with the un-parameterised request answering 140.

So the app **names the period** rather than inheriting ESPN's clock, and which period follows from the day being asked about: the **end of the range in view** for the single roster read (`getOwnership`), threaded from `/api/report`'s own `end` and from `App.tsx`'s `loadFantasyRoster`, and each day's own period for the per-day reads below. **The future is read at its own period** — the `Tomorrow` preset exists to surface a watched player's scheduled games before they are played, and the lineup he is scheduled to play *in* is the same kind of fact, so its chips are the lineup set for that day. It costs nothing: a future period returns the **current** roster with the lineup as it stands (checked: periods 141 through 200 carry the same 28 players as today, and 200 is past the season's last without erroring), so naming one can neither invent nor lose a player.

**And the past is read at its own period too, which is a reversal.** ESPN answers a past period with the roster **as it was then**, players and all — re-checked on the live 12-team league over the seven days ending 2026-08-13 (periods 136–142): **31 players were on the team at some point in that week against the 28 on it today**, three of them (Salvador Perez, Jeff Hoffman, Jonathan Bowlan) men the app could not show at all, and two of today's (Nick Pivetta, Trent Grisham) not on it a week earlier. That fact used to be the argument *against* reading a past period for the roster — it would have "the roster views reporting on a team the manager no longer has, where what he wants over Last 15 days is *his* team's last fifteen days" — and the argument was wrong in the same way the whole-range lineup was wrong beside it. What a manager wants over a range is not one roster applied to seven days, it is **what he actually had**: Grisham's `9/24, 5 R, 3 HR, 7 RBI` was six days of somebody else's week sitting on his table under a man he picked up on Wednesday, and Perez's six days were his and were nowhere. See **A range is a range of rosters** below, which is the same sentence about rosters that the passage beneath it is about lineups.

The mapping needs **no season-start constant**: ESPN numbers its periods one per calendar day of the season, the All-Star break included (2026 allocates ids 111–113 to three gameless days), so a day ahead is exactly a period ahead — checked against ESPN's own `proTeamSchedules_wl` across all 184 game days, period number and calendar day advance together with zero exceptions. What a straight line needs is a **point on it**, and that point is now derived from that same schedule rather than learned from ESPN's own clock — see **The anchor is derived from ESPN's calendar, not from our own clock** below, which is where the whole of that argument lives and why the version that read `currentScoringPeriod` was wrong for an hour and a half every morning. A date that is shaped like one but isn't (`2026-99-99` passes every `YYYY-MM-DD` test in the codebase and `Date.UTC` rolls it into 2034) is read as today by the league-wide read rather than as a period three thousand past the season, and names no period at all for a per-day one.

The ownership blob is therefore keyed by **league and period**, with today's keeping the bare league id so the map every member of a league shares — free agents, roster %, the trend — stays one entry rather than one per person's date range. `/api/espn/ownership` never passes a date: "who can I pick up" is a now question and the research board has no dates on it. And **`force` drops every period of the league**, not just the one asked for — "read my league again" is a statement about the league rather than about a day, and `Refresh from ESPN` leans on exactly that, forcing the ownership read and letting the roster and report follow; a per-period force would have left a `Tomorrow` view serving a nine-minute-old lineup, which is the staleness the button exists to clear. Measured: a warm future read is 3ms, and the same read after a forced ownership call is 269ms, i.e. genuinely back to ESPN.

**A range is a range of lineups.** The roster views summarise a span of days and applied **one** lineup to all of it — the one set for the end of the range — so the `Starters` filter over "Last 7 days" either counted a player's whole week or dropped him from it. That is the wrong arithmetic for what the summary table is: a man you started on Monday and benched on Wednesday earned you Monday's line and none of Wednesday's. It is not a rare shape either. Measured on the live 12-team league over the seven days ending 2026-08-12 (periods 135–141), **12 of the 29 players** who were on the team at some point in that week changed state inside it — Gausman benched, started, benched again; Gilbert started, benched, started; Snell off the IL on day six; Hoffman dropped and Bowlan added — and 8 of the 28 slots on a given day were held by somebody different a week earlier.

So the lineup is read **per day, at that day's own scoring period** (`getTeamRosters` in `espn.ts`, `lineups` on the `/api/espn/roster` response). The same payload answers two questions, and it now answers both about the day rather than one about the day and one about this afternoon:

- **Which players do the views report on?** The **union of every day's roster** — see the section below.
- **Which of a player's days count?** The days **you actually had him in your lineup**, each read at its own period, past ones included.

**A day you held him but did not start him is a day he was not in your lineup**, which is the honest reading: that Monday's line is his and is not yours. Measured on that same week: **Kyle Stowers started four of the seven and is on the IL today**, so the whole-range rule dropped him outright and the per-day one credits him his four days.

### A range is a range of rosters

**The paragraph above used to end on a loss, and this is that loss paid.** It read: *the one thing these rules cannot show is the man you have since dropped, whose Monday you really did earn — he is off the roster the whole app is reporting on, and putting him back is exactly what the roster rule refuses*, with **Salvador Perez, in the lineup on six of the seven days and not on the team today**, as its named example. The roster rule has been reversed, and Perez has his six days.

**One read per day now answers both questions.** `fetchTeamRoster` used to return the day's *started ids* and returns the whole `EspnRosterPlayer[]` instead — the same shape the league-wide read builds, off the same `toRosterPlayer`, so a day read one way and the same day read the other cannot disagree about a slot or a name. `startedIds` derives the lineup from it (`lineupsFrom`), so **the `lineups` map is unchanged by construction**: checked against `main` over the same seven days, all seven days' id lists identical, 0 differences. `rostersToWatchlist` reads the same map the second way — the union of every day's roster as the app's own `WatchPlayer` list, plus a `heldDays` map of the days each man was on it — which is exactly the pair `store.ts::getRosterForRange` answers for the saved roster (see **Roster, watchlist, users and auth**, *The roster is a range of rosters*), and which `getReport` projects onto in exactly the same way. **Order is the *end of the range's* team first, in its own order** (lineup, bench, IL, as `rosterToWatchlist` has always preserved), then the men who were on the team over the range but not on it that day, most-recently-held first: a manager reads his own team down the page and a man he was not holding on the day in question is a footnote to it rather than an interruption in the middle of it. That anchor said **today's** team until the passage below; see **The slot chip and the order are the range end's, not today's**.

**Measured on the live 12-team league over 2026-08-07…08-13, the two reports fetched back to back.** Batting: **14 rows → 15**, `76/266` with 43 R, 12 HR and 46 RBI → **`72/264`, 39 R, 9 HR, 43 RBI**. Pitching: **15 rows → 17**, **65.2 IP and a 2.74 ERA → 67.2 IP and 2.79**. Only two players moved and they moved in opposite directions, which is the whole point: **Salvador Perez** comes back with the six days he was held (`4/18`, 1 R, 4 RBI) where he had no row at all, joined by **Jeff Hoffman** (2.0 IP over four days) and **Jonathan Bowlan** (two days, no appearance); and **Trent Grisham** goes from six days to **one**, because five of the six were before anybody here picked him up — `9/24, 5 R, 3 HR, 7 RBI` of somebody else's week, which is why the batting totals *fall* while the table gains a row. Checked in a browser at 1200×900: the `Total` row reads exactly that, Perez's row sits last, and with `Starters` on he survives at `4/18` — the filter reading the days he was in the lineup, which is the composition the two halves were always meant to have.

### The slot chip and the order are the range end's, not today's

**This paragraph used to say the opposite, and what it said was the bug.** It read: *a man no longer on the team carries no slot chip, and that is deliberate rather than an oversight — the chip is `EspnRosterPlayer.slot` off today's roster, and a player you dropped has no slot today, so there is nothing to draw.* Both halves of that are false, and the second is what made the first look reasonable: **there is something to draw**, because the per-day read above already holds that day's roster with its slots on it, and the app was reducing it to bare started ids and throwing the rest away.

**What the reader actually saw**, reproduced against the live 12-team league with `Yesterday` selected (2026-08-12, period 141): **Adley Rutschman** wearing the `C` chip — he is the catcher **today**, and was on the **IL** on the day the table was reporting on — and **Salvador Perez**, who really did catch that day, at the bottom of the table with no chip at all. Every chip's title read *"in your fantasy lineup **today** at C"* over a table of yesterday's numbers.

**The cause is one clamp doing two jobs.** `getOwnership` reads anything at or before today at ESPN's current period — deliberately, and that rule stands, because *which players the views report on* must not become a team the manager no longer has (**Which day's lineup**, above). But `fantasyWatchlist` handed that one roster to *both* questions: `/api/espn/roster`'s `players`, which is what `FantasyRosterContext` draws the chips from, and `rostersToWatchlist`'s ordering anchor. So on a past range the slot chip stated a fact about this morning over a row of numbers from last Tuesday, and the order filed the catcher you did start under "no longer on the team".

**So the payload carries two rosters and each question reads its own.**

- **`players` — your team as it stands.** Today's, or the future day asked for. Untouched, and it is the answer to every *is he on my team* question the app asks: the research board's `My Roster` button and its accent baseball, `PlayerDetails`' `On roster` badge, the `Your fantasy team is empty` test. A man dropped this morning is not on it whatever range is on screen — which is the same rule the saved roster follows (**Roster, watchlist, users and auth**, *"Is he on my roster?" is a different question*).
- **`endRoster` — your team as it was at the end of the range**, slots and all, off `byDate[end]`. It is what a slot chip *is* and what the roster's own order is drawn from.

**It is sent only when it is a different day's list.** Every range ending today or later has `byDate[end] === roster` **by construction** — `getTeamRosters` seeds the map with the very array the ownership read returned — so there is nothing to send and the client's `endRoster ?? players` fallback is the ordinary path rather than a failure path. Measured on the live league: null on `Today`, on `Tomorrow` and on a week ending today, a 28-man list on `Yesterday`, and `players` byte-identical on all four.

**And absent means today, which is what keeps the wording honest.** The client anchors the chip to `end` when `endRoster` came back and when `end` is in the future (the ownership read having answered for that day itself), and to today otherwise — so a day ESPN wouldn't answer for falls back to today's roster **and** to the word "today", and the two can never part. `FantasySlotTag` names the date whenever it is not today: `In your fantasy lineup on Aug 12 at C`. It said "today" unconditionally before, which was already a lie on the `Tomorrow` preset a range could not even reach.

**A multi-day range still draws one pill**, and that argument is unchanged: a slot is a fact about a day and there is no honest way to draw seven of them in one chip, which is what the count in its title is for (`… on Aug 12 at IL · in your lineup on 4 of the 7 days in view`). What changed is only **which** day the one pill is anchored to.

**A man dropped inside the range keeps a chip for exactly the days he was there**, since the anchor is a day he may well have been on the team for — which is the case this fixes. A man dropped *before* the range ended still has none, and that absence is now the honest one the old paragraph claimed: on that day he really was not on the team. The row is not silent about him either way — his stats are there and his MLB lineup pip and IL badge are unaffected.

**Nothing persisted changed shape**, so no blob version moves: `endRoster` is a day's roster read straight out of `espn-lineup-{leagueId}-{teamId}-{period}-v2.json`, which has stored exactly that since it became a roster.

**Measured on the live league, `Yesterday` (2026-08-12), before → after.** The batting table's rows go `Rutschman C … Perez (no chip, last)` → **`Perez C` first and `Rutschman IL` last**, with all 14 rows carrying a chip where 13 did; every title goes from "today" to "on Aug 12". The report's player list is the **same 29 entries** in a new order — the union is `rostersToWatchlist`'s and is untouched. On `Today`, `Tomorrow` and a week ending today the report's order is **byte-identical** and `lineups` is byte-identical on all five ranges tested. With `Starters` on, `Yesterday` keeps the 11 men in that day's lineup and drops the three on the IL; over 08-06…08-12 it keeps 12 with Stowers reading `IL on Aug 12 · in your lineup on 4 of the 7 days`. With the end day's read forced to fail, `endRoster` is null, the chips are today's and the order is today's-team-first — the pre-per-day behaviour exactly, with the other six days' lineups still driving the filter.

**What this costs, and what it doesn't.** The **blob grows**, since a day now stores the roster rather than a list of ids: `espn-lineup-{leagueId}-{teamId}-{period}-**v2**.json` is **5,170 bytes against v1's 176**, and 61 days of one team come to **488KB** against 10,736. The `-v2` is what makes a v1 blob — a bare `number[]` — be ignored rather than deserialized as a roster of nothing; nothing prunes them, and the cache bucket's own 400-day lifecycle is the only expiry. **Nothing else about the fan-out moved**: the same `forTeamId` read (197,554 bytes, 11.3× smaller than the league's 2,237,620), the same `mapLimit` at 6, the same freeze rule (a period strictly before today's is a fact and takes the storage tier with no freshness test), and the same `force` reaching only the mutable days. **Re-measured end to end through `/api/espn/roster`**: 62 days genuinely cold, no blobs and a fresh process, **3.53s**; the same span from the blobs in a fresh process **730ms**; warm in memory **10ms**. Those are the figures the 176-byte version measured at 3,419ms / 647ms / 36ms, so a blob thirty times the size costs nothing measurable — the time is ESPN's, not the disk's.

**`/api/report?source=fantasy` now asks for the range**, where it passed only `end` and so got no per-day reads at all; the per-day map was `/api/espn/roster?start=`'s alone. That is one fan-out added to every fantasy report, and it is the cheap half of that request by two orders of magnitude: a cold 62-day report is **67 seconds** of MLB data on the same machine. **A read that fails leaves `held` null and the old behaviour standing** — today's team over every day of the range — which is the same direction `lineups` has always failed in, and a range reaching back past the season's first period simply has no rosters in its early half rather than erroring.

**Two things were checked to be untouched.** A **future** range still reports on today's team (29 entries over `Tomorrow`, which is the 28 players plus Ohtani's second kind), since a future period returns the current roster. And a **single past day** now reports on the team of that day: 2026-08-12 carries Perez, Hunter Greene and Bowlan, and not Grisham, Didier Fuentes or Pivetta.

**`forTeamId` is what makes the fan-out affordable**, and it is the measurement the whole design rests on: `view=mRoster&forTeamId=6` is **197,944 bytes against the full league's 2,237,620** — 11.3× smaller — and the 28 entries it returns are byte-identical to that team's entries in the full read (checked name and `lineupSlotId` for all 28, 0 differences, `injuryStatus` included). At the league-wide payload a 62-day range would be 137MB of upstream; at this one it is 12.1MB. The consumer is always one team's lineup on one day, so the blob is keyed by league, team and period rather than shared across a league the way the ownership map is — twelve members reading their own teams costs about what one league-wide read costs, and the one member who actually asks pays a tenth of it.

**A finished day is a fact, so it gets a storage blob rather than a clock.** You cannot retroactively start somebody in a game that has been played, nor retroactively have held him, so a period strictly before today's is written to the cache tier (`espn-lineup-{leagueId}-{teamId}-{period}-v2.json`, ~5,170 bytes; 61 days of one team come to **488KB**) and read back with **no freshness test at all** — the rule `savant.ts` already follows for a finished day's parse. Today's and any future day's are editable until the games start and stay in memory on the same ten minutes the rosters take. **The `-v2` is the roster**: v1 stored the day's lineup as a bare list of ids at 176 bytes, and a stored blob deserializes with everything added since it missing, so the bump is what stops a v1 blob reading as a roster of nobody. Bump it again if the shape grows. The fan-out is the repo's own `mapLimit` at **6** — an unbounded `Promise.all` over `MAX_RANGE_DAYS` (62) is 62 sockets against an upstream that has no idea we are doing it.

**Measured against the live league, end to end through `/api/espn/roster`** (each cold figure from a fresh process with the blobs deleted, so the ownership read is cold too): **7 days 765ms, 30 days 1,449ms, 62 days 3,419ms**. With the blobs on disk and a fresh process, 62 days is **647ms**; warm in memory it is **36ms** at any width. Raw upstream at 6 in flight is 1.4MB / 5.6MB / 11.7MB for the three spans, and the whole thing is paid once — the second reader of a given day, and every reader of it tomorrow, gets a 176-byte blob. Against the report those numbers are noise: a cold 62-day `/api/report` is **67 seconds** of MLB data on the same machine.

**`Refresh from ESPN` reaches only the mutable days.** That button is somebody saying "I have just moved a player", and the only lineups a move can touch are today's and the ones after it — so `force` skips the memory entry and the in-flight guard for those and leaves the frozen ones alone, where re-reading would spend one ESPN request per day of the range to be told what the blobs already say. Measured: a forced 30-day read is **530ms**, against 1,449ms for the same span genuinely cold.

**A day that can't be read is missing from the map, not empty.** `getTeamRosters` catches per day, so one failure costs that day its precision — its lineup, and its say in who was on the team — while every other day still speaks; the client falls back to the single end-of-range lineup it draws the chips from, which is exactly what the app did before any of this. The whole thing failing (a dead anchor, an upstream outage) is caught in `fantasyWatchlist` and leaves `lineups` and `held` both null, i.e. the old behaviour intact: today's team over every day of the range. A range reaching back past the season's first period simply has no lineups in its early half rather than erroring — `lineupPeriodFor` returns null below period 1.

### The anchor is derived from ESPN's calendar, not from our own clock

**This passage used to say the anchor had been "checked against ESPN's own calendar rather than assumed", and it had — at two instants, both of which happened to agree. Two agreeing observations are not a rule, and the rule was false.**

**What the old arithmetic asserted.** `dayOffsetFor` took `daysBetween(baseballToday(), date)` and `scoringPeriodFor` / `lineupPeriodFor` added it to ESPN's own `currentScoringPeriod`. Stated plainly, that says: *ESPN's period pointer turns at the same moment the app's baseball day does.* Nothing verified it and nothing could — it is a fact about ESPN's schedulers, and the app's own day turns at **3am ET** (`etDate.ts::DAY_ROLLOVER_HOUR`, chosen because a 10pm ET first pitch out west finishes around 1am and has nothing to do with ESPN). If ESPN's pointer turns at any other hour X, then between min(X, 3am) and max(X, 3am) every period this file computes is **off by one**.

**It does turn at another hour, and the payload says so.** A league read carries `status.lastUpdateInfo.source: "NightlyLeagueUpdateTaskProcessor"` — the pointer is advanced by a nightly batch rather than by a clock — and the timestamps that batch stamps are in the same object. On 2026-08-13 `standingsUpdateDate` and `waiverLastExecutionDate` both read **04:26:40 ET**, and the season's eighteen recorded waiver runs (`status.waiverProcessStatus`, ISO strings) spread from **03:39 to 05:19 ET**, median 04:42. So the window is real, it is roughly **3:00–4:30 ET**, and it is not even a fixed width. The two observations that used to stand here are consistent with exactly this and rule out the tidier alternative: at 00:33 ET on 2026-08-13 ESPN said 141 (= 08-12) while `baseballToday()` also said 08-12, which is only possible if ESPN does **not** roll at midnight ET; at 17:43 ET the same day it said 142 (= 08-13), as did we. The two clocks agree for 22½ hours a day and disagree for the other 1½.

**What that cost.** It was latent while the only caller was the `Tomorrow` preset — a wrong period there is one chip on one row. It became load-bearing when a range became a range of rosters: `lineupPeriodFor` is unclamped and now names a period **per day for up to `MAX_RANGE_DAYS` (62) of them**, so a stale anchor shifts every day's roster and every day's lineup back by one. Somebody opening the app at four in the morning would see yesterday's roster filed under today, Monday's lineup credited to Tuesday, and the `Starters` filter cutting the wrong days out of every row — silently wrong rather than absent, which is the failure this file least wants.

**So the anchor is derived rather than learned, and `baseballToday()` drops out of the period arithmetic entirely.** `proTeamSchedules_wl` maps every period to the ET calendar date of the games in it — all **184 of 184 periods map to exactly one ET date, 0 mixed**, and every one satisfies `period = p0 + daysBetween(d0, date)` against the first pair, **0 violations across the season**, the All-Star break's three gameless ids included by the linear rule rather than by a table. One pair is therefore enough, and `period = anchor.period + daysBetween(anchor.date, target)` answers for any day of the season **without consulting any clock of ours**. The app's own calendar keeps the one job it is right for — deciding *which day* the reader is asking about — and loses the job it was wrong for, which was deciding what ESPN calls that day. There is no hour at which the new rule can be off by one, because there is no moment at which it asks.

**Proved under a faked clock rather than argued.** The module was driven at **01:00, 02:59, 03:01, 04:00 and 12:00 ET** on 2026-08-13 with ESPN's pointer stubbed to what it really answers on each side of its own 04:26:40 rollover, and asked for the periods of a fixed set of dates. The anchor gives `08-11→140, 08-12→141, 08-13→142, 08-14→143` at **all five clocks**, identical to ESPN's own table. The old rule (reachable by forcing the schedule read to fail) gives the same at 01:00, 02:59 and 12:00 and **139/140/141/142 at 03:01 and 04:00** — every date one period low, exactly as predicted.

**The pair is picked by majority vote** over all 184 rather than by taking the first: each mapped period is restated as "what would the first date's period have been?" and the modal answer wins, so one malformed row cannot shift the season by a day. With 0 violations today the vote is unanimous; it is there for the day it isn't. A period whose games straddle two ET dates is dropped rather than guessed at.

**The read is cookie-free and season-static, so it is one read for everybody.** `seasons/{season}?view=proTeamSchedules_wl` returns 200 with **no `Cookie` header at all** — none of it is league-specific — which puts it in the same class as `getPlayerPool`'s 940KB player list: one fetch shared by every league and every user. It is 850,891 bytes, and **what is cached is the pair rather than the payload**: `espn-period-anchor-{season}-v1.json`, **67 bytes**, in memory and in the storage tier on a 30-day window, since a season's schedule does not move. `getPeriodAnchor` **never rejects** — it returns the pair or null — which is load-bearing rather than tidy: the fan-out names a period in every one of 62 places and `getTeamRosters` catches per *roster read* rather than around the naming, so a throw would take the whole range instead of costing it its accuracy. That was found by driving the module with the read forced to 503, where the in-flight guard handed one rejecting promise to five concurrent callers and the range died. A failure is remembered for a minute so a dead upstream is asked once per fan-out rather than once per wave.

**If the schedule can't be read at all the old rule stands as the fallback**, logged — ESPN's pointer plus the days from `baseballToday()`, which is right for 22½ hours a day and is what this file did for its whole life. A failed derivation must cost accuracy in the small hours, never the feature. Below that, an unnameable period leaves the request un-parameterised and ESPN answers for its own current day, which is the right direction to fail in.

**`currentScoringPeriod` is therefore the fallback and only the fallback**, and on the ordinary path is never issued: measured on a live 7-day range, the **6 bare league reads** it used to send (one per day of the fan-out, the ten-minute cache being no help against six concurrent misses) are now **0**, replaced by one schedule read that a 67-byte blob then answers for a month.

**What this cost and what it bought, measured on the live league through `/api/espn/roster` over 62 days**, same machine, same minutes: genuinely cold with no blobs and a fresh process **2.26–2.31s → 2.32–2.40s** (the one-off 850KB read, paid once per process and once per 30 days on disk); from the blobs in a fresh process **0.55–0.67s → 0.43–0.46s**, *faster*, the six bare league reads having gone; warm in memory 4.5–6.9ms → 2.6–6.3ms. Part of that is `etDate.ts::easternDate`, which built an `Intl.DateTimeFormat` per call and now holds one — over the schedule's 4,914 game rows that is **99ms against 13**, and it is the app's hottest date path anyway.

**And the change is a no-op wherever the two clocks agree**, which is the check that matters most. The same 7-day `/api/espn/roster` against the live league before and after returns a **byte-identical** `players` list and `lineups` map, and asks ESPN for the same per-day periods (136–141, today's being seeded from the ownership read); the one difference in the trace is that the league-wide read now names `scoringPeriodId=142` where it used to omit it, which is the same request — checked, the roster and slot content of the named and un-named reads is identical. Nothing changes except in the window it fixes.

**No cached blob needs invalidating, and the reasoning is the general rule.** `espn-lineup-{leagueId}-{teamId}-{period}-v2.json` is keyed by **period** and holds what ESPN answered *for that period* — which is that period's truth however the caller arrived at it. The bug was in the date→period arithmetic, and that arithmetic is stored nowhere: a blob written during the bad window under period 140 holds period 140's roster, correctly, and it was only the *map* that filed it under 08-12. The next read after the batch asks for 141 and gets 141's blob. Nothing is keyed by date, so nothing is stale, so the `-v2` stays where it is. (`espn-ownership-{date}.json` is keyed by date but holds cookie-free season-wide percentages with no period in them at all.)

**The downstream spot-check still holds**: Blake Snell reads IL on 08-07…08-10 and in the lineup from 08-11, and periods 139 and 140 say the same thing.

**The injury designation** rides on the same roster read as the slot (`EspnRosterPlayer.injuryStatus`, ESPN's own `DAY_TO_DAY`/`OUT`/`TEN_DAY_DL`/…, normalised to null for `ACTIVE`) and reaches the summary table's name cell through the same `FantasyRosterContext`. It exists because **MLB's roster status cannot say day-to-day or out**: a day-to-day player is still on the active roster, so `rosterStatusBadge` correctly draws nothing for him and the row said nothing about a man who is hurt. Checked league-wide, MLB's whole vocabulary is `Active`, the `D10`/`D15`/`D60` stints, minors, traded, released, claimed, DFA, free agent and suspended — there is no code in it for either. ESPN's league roster carries both, and **the cookie-free season-wide player list does not** (checked: the field is absent on all 3,921 rows), so this is a fantasy-mode fact by nature rather than by choice, and `FantasyInjuryTag` is simply absent the rest of the time exactly as the slot chip is. **MLB's badge leads and ESPN's fills only the gap it leaves** — `rosterStatusBadge(...) ?? espnInjuryBadge(...)` in `SummaryTable`'s `PhotoStatus` is the whole of the rule. Where ESPN says `TEN_DAY_DL` MLB has already said a 10-day stint, and one absence stated twice on one row reads as two different problems; what ESPN is there for is day-to-day and out, which MLB has no code for at all.

**The status sits on the headshot, not beside the name** (`.sum-photo-status`, bottom-centre; and `.details-photo-status` on the details view, which took the same mark later — see **Client**, where the research board and the details view share it through `PhotoStatus.tsx`), as a **short code**: `IL10`, `IL60`, `RA`, `DTD`, `OUT`, `DFA`, `MIN`, `SUS`. Two reasons, and the second is the load-bearing one. The circle is already where the row carries what is *true of the player* rather than what he did — the lineup-spot pip is on the opposite corner of it — so the two belong together and, being at opposite poles, never collide. And it **costs the name column nothing**: this table overflows a phone as it is, every pixel of the name column is a stat pushed off the right edge, and a `Rehab Assignment` chip beside a name spent about 120 of them to say what `RA` says in four characters. So each badge carries a `short` alongside its `label` — one builder, both forms, since the player card beside a name still has room for the words and should keep them. `IL10` rather than `10-day IL` because on a headshot the *number* is what distinguishes one stint from another and the word is what doesn't fit. `SHORT_BY_CODE` maps the ones with no natural abbreviation (`DES` → `DFA`, `RM`/`MIN` → `MIN`, `RA` → `RA`), falling back to the code itself when it is already badge-sized and to the description's initials when it isn't — so a status MLB adds later reads as something rather than as a blank. The chip carries a **solid** ground rather than `.roster-status`'s tinted one, the same reasoning `.clip-audio` follows over video: it sits on a photograph, which is a different colour behind every player, and a 13% wash that reads over one is invisible over the next — so tone lives in the text and the border, which is all that is left once the fill is spoken for. Day-to-day shares the suspension **amber**, a lesser thing than an IL stint's red since he may well play. Measured rather than eyeballed: at 560px and at 1200px all three badges render at their full size with clearance from the sticky total row, which is what a chip hanging below the last row in the table most needs checking for — 6px when this was written, and **5px** since the pill grew to 12px on a 42px headshot (`bottom: -5px` fixes its bottom edge, so the extra pixel went upward and the clearance came from the image cell's padding instead; see **Client**). Checked against a live league: Stowers day-to-day takes `DTD` where he previously carried nothing, while Crochet, Snell, Greene, Langeliers and Rutschman each keep their single MLB badge and gain no second one.

**The credential.** `espn_s2` is a live session cookie for the user's ESPN account, and is handled as one:

- Stored on the same DynamoDB item as the watchlist and prefs, but as a **sibling of `prefs`, not a field on it** (`EspnLeague` in `store.ts`) — `GET /api/prefs` hands that whole object to the browser, so keeping it out means the leak would have to be written on purpose rather than inherited by adding a key. Disconnecting drops the attribute entirely rather than storing an empty one.
- **It never comes back out.** `espnStatus()` in `index.ts` assembles the response field by field from the harmless half (league id and name, the user's team) rather than spreading the record, so there is no shape of `/api/espn` that returns the cookie it was given. The client's form is write-only: a reconnect means pasting a fresh value, not editing one the page is holding.
- Never logged.

**The cookies are optional, because a public league needs none** — ESPN serves one to anyone who asks, and a user with a public league then has *no credential stored at all*, which is the best available version of handling one. `leagueGet` omits the `Cookie` header entirely rather than sending it empty, and the 401 that comes back says which of the two things went wrong: without cookies it is "this league is private, add them", with cookies it is "the ones you gave have expired". Saying the wrong one sends the user off to solve a problem they don't have. The route enforces **both or neither**: half a pair is a typo rather than a choice, and letting it through would read the league anonymously and then report the private league's 401 as though the value supplied were wrong.

The connect form's first field takes a **pasted league URL** as well as a bare id (`parseLeagueRef`), collapsing it to the id in place so what stays on screen is the number the app will use, with a line underneath saying where it came from — a substitution that isn't explained looks like the field eating the paste. It is a regex over the raw string rather than `new URL()`, since half of what gets pasted is a fragment (a copied query string, an address whose scheme the source app trimmed) and none of those parse. Any `teamId` in the URL rides along, and is used **only when there is no SWID to identify the user's own team with** — i.e. the public-league case, where the URL is the one place it appears. Note what a URL cannot carry: `SWID` and `espn_s2` are cookies, and a cookie belongs to the site that set it, so no amount of parsing gets them and the instructions have to.

What the **cookie** fields parse instead is a paste that brought the *name* along with the value (`parseCookiePaste`) — `espn_s2:"AEB…"`, `SWID={…}`, `"espn_s2": "AEB…"`, or a whole `SWID=…; espn_s2=…` line, since every cookie viewer punctuates its copy differently and each of those pasted whole is a value the app would otherwise reject. A paste naming either key fills the field(s) it names **whichever box it landed in**, so dropping the entire cookie string into the SWID box connects the league; a paste naming neither is the bare value with any matched surrounding quotes stripped (matched, so a lone quote someone is mid-way through typing survives). The value is quoted or runs to the next separator — neither cookie can contain a space, comma or semicolon, so the unquoted form has an unambiguous end. Checked against eleven copy formats.

**Neither cookie field is masked**, and the `espn_s2` one is a `<textarea>`. It is a credential and the instinct is to hide it, but the failure this form actually suffers is a paste that silently dropped half a 300-character token — a row of dots is no help against that, and an `<input>` would show you its last forty characters. The amber warning says as much, so "treat it like a password" and "you can read it" don't sit on the page contradicting each other.

**The cookie step says plainly that it needs a laptop**, because no mobile browser has a cookie viewer and the two on-device routes that do exist (iOS Web Inspector over a cable from a Mac, `chrome://inspect` for Android) both involve a computer anyway — so they are a longer way of saying the same thing and are not on the page. What *is* on the page is why the constraint doesn't matter, and it is a fact about this architecture rather than about ESPN: the connection is saved to the **account**, not the device, so doing it once on a computer is the whole job and the phone inherits it. Note also that no `javascript:document.cookie` bookmarklet is suggested: whether `espn_s2` is flagged `HttpOnly` could not be established (ESPN sets it only at login, and the espn-api discussion that documents these values doesn't say), so the technique may simply return nothing — and an instruction that might not work is worse here than one that plainly asks for a laptop.

Nine routes: `GET /api/espn` (status — including `hasCredentials`, whether a cookie is stored at all, so the page can say *public* rather than imply one), `PUT /api/espn` (**verified against ESPN before it is saved** — a set of cookies that can't open the league is worth rejecting while the user still has the form open and can see which field is wrong, rather than at first use from a table that just looks empty), `DELETE /api/espn`, `GET /api/espn/ownership`, `GET /api/espn/roster` (the user's own team, slot by slot; `?refresh=1` as above, plus **`?end=`** — which day's *roster* to read, the end of the range on screen, validated for shape and otherwise left to `getOwnership`, which reads anything at or before today as today; `?date=` is the older tab's name for it and is still read. **`?start=` opts the response into `lineups`**, one lineup per day of the range, which is what lets the roster views credit a player only for the days he was in it — see **Which day's lineup** and **A range is a range of lineups** — and into **`endRoster`**, the team as it stood on the last day of that range, which is what the slot chips and the roster's order are drawn from when that is a day gone by (**The slot chip and the order are the range end's, not today's**). Absent, both fields are absent and nothing downstream changes; the span is capped at `MAX_RANGE_DAYS` like the report's, being the same span), `PUT /api/espn/team`, `PUT /api/espn/share`, `POST /api/espn/join` and `PUT /api/prefs/roster-source`. ESPN rejecting the cookies answers **409 with `code: 'espn-auth'`**, not 401 — `api.ts` treats a 401 as an expired *Cognito* token and retries it against a fresh one. Both `swid` and `espnS2` are normalised on the way in (`normalizeSwid` adds the braces people leave off, `normalizeS2` strips the quotes and whitespace a paste brings along).

**Roster %** is on the research board (a `Ros%` column, sortable and filterable like any other) and under the player's name on the details page, whenever a league is connected. It is **ESPN's own global figure** — the share of *all* ESPN leagues the player is rostered in — not the share of teams in the user's league, which for a twelve-team league could only ever be 0% or 8.3% and would say nothing. The tooltip on both says so, because "roster %" invites the other reading.

It comes from `getRosterPct`, off the **season-wide** players endpoint (`players?view=players_wl` with `filterActive`) rather than the league board: 3,921 rows and ~940KB against `kona_player_info`'s 3,602 and 10MB, and — the useful part — it takes **no cookies at all**, none of it being league-specific. So one fetch serves every user and the map is cached globally (6h, its own `inFlight` guard) rather than per league. Gating it on a connected league is therefore a *relevance* decision rather than a technical one: the number is available to anybody, and to someone with no fantasy team it is a column of noise. It rides on the `/api/espn/ownership` response rather than taking a route of its own, that being the call a connected client already makes and the gate on both being the same; its own six-hour cache means the ten-minute ownership refresh re-reads a map rather than an upstream, and a failed read costs one column instead of the connection (`getOwnership` catches it to an empty map). Matched to MLB ids by the same name-plus-team join everything else here uses — 695 of 696 batters and 789 of 794 pitchers on a checked board.

The client merges it into the rows rather than the server folding it into the research blob: **that blob is cached per kind and window and served to every user alike**, so a per-user concern has no business in it. The column drops out of the board's vocabulary entirely without a league — not shown as a column of dashes, since it would otherwise sit at the very front — which is what `hasRosterPct` is for. Note the include buttons take the opposite tack for the same reason: a set the app *can* name without a league (everyone off your roster) keeps its button under a different label, and the one it cannot (`Other Rosters`) is not offered. On the details page `undefined` hides the line and `null` dashes it: with a league connected, ESPN having no figure for a player is itself information.

**Position eligibility** is the other thing read off that same players endpoint, and it is what the research board's position pills — and the **chip beside a name on every player card** — mean whenever a league is connected. A fantasy position is not MLB's: it is **multi-valued** — Willi Castro is eligible at 1B, 2B, 3B, SS and OF at once — and it is the league's own rule about where you may actually start a man, where MLB's `primaryPosition` is one word about where he mostly stands. On a checked board **301 of the 628 batters** ESPN could be joined to carry more than one position and 95 carry three or more, so the single-position filter was answering a question nobody with a fantasy team was asking — and the same is true of the chip on a card, where MLB's one word is the wrong answer twice over: a pitcher's is `P`, which says nothing a fantasy manager can act on, and 22 rows on a checked board are men ESPN files somewhere MLB doesn't (Curtis Mead is listed at 2B and is eligible at 1B and 3B).

**The card chip is what took the laziness out of the ownership read.** That effect used to wait for the research board or an open player page; a chip on a feed group is neither, and a card that showed MLB's position for a second and then swapped would be worse than one that took a moment to be right — so the only gate left on the once-per-session read is a connected league. It is affordable precisely because of the vehicle: **27KB gzipped** (measured), against a page that was going to ask for it as soon as anybody opened a player. The board's own read is untouched and still fires on every entry, that one being about rosters that move by the hour rather than about eligibility that doesn't.

It rides on `eligibleSlots`, an array of `lineupSlotId`s on every row of `players?view=players_wl` — **the same 940KB, cookie-free, six-hour-cached fetch `getRosterPct` already makes**, which is the whole reason this costs nothing: one `matchPlayer` join per row now yields two facts instead of one, so `getRosterPct` became `getPlayerPool` returning both and the percentage is a thin wrapper over it (the trend reads that wrapper, so the five-window rewrite beside it needed no knowledge of any of this). It reaches the client on the `/api/espn/ownership` response beside `rosterPct` and for the same reason — the research blob is cached per kind and window and served to every user alike, so a fact only a connected user is shown has no business in it. ~24KB of JSON for 1,376 major leaguers, 6KB gzipped, against the 2MB league read it travels with. **No cache version needed anywhere**: both maps live in memory only, and the one blob this file does persist — the daily `espn-ownership-{date}.json` trend baseline — still stores nothing but the percentages.

**The eligibility a league scores by could have been league-specific, and isn't** — which is the measurement that justifies the cheap vehicle. ESPN grants a position off games played there and a league may in principle set its own threshold, so the honest question was whether the global list agrees with the user's own league. `mRoster` carries `eligibleSlots` per rostered player, and against the live 12-team league all **320 of them came back byte-identical** to the global pool's — 0 differences. The cookie-free list is not an approximation of the league's answer, it *is* the league's answer, so the 10MB cookied `kona_player_info` buys nothing here.

**The slots are reduced to the board's own vocabulary** (`ELIGIBLE_POSITIONS`, and client-side `lib.ts::ELIGIBLE_BY_KIND`, which is the half of that vocabulary a batting or pitching view speaks — one definition for the board's pills, its Pos cell and the card chip, so a mis-joined pitcher reads his fallback rather than `2B/SS` wherever he is drawn, and a two-way player's bat reads `DH` where his arm reads `SP`) — C, 1B, 2B, 3B, SS, OF, DH, SP, RP — and what is left out was left out on evidence rather than taste. The **composite** slots say nothing new: `2B/SS` (6), `1B/3B` (7) and `IF` (19) are places a manager may *play* him, granted off the single positions he already holds, and across all 3,922 rows not one player carries `2B/SS` without 2B or SS, `1B/3B` without 1B or 3B, or `IF` without one of the four infield spots — so the board's `IF` pill reads the four rather than the group, and the cell is a column narrower. **`LF`/`CF`/`RF` (8–10) collapse into `OF`** by the same check (slot 5 is present on every row carrying any of the three, 0 exceptions) because the board has one outfield pill. And `UTIL` (12), `P` (13), `BE` (16) and `IL` (17) are not positions — two are "anywhere" and two are where he sits when he isn't playing — nor are ESPN's two minor-league slots (21 and 22, 84 rows between them, every one a player the MLB index has never heard of).

**A player ESPN can't be joined to keeps what the app knows on its own** — MLB's listed position on the batting board and on a batter's card, `starter` on the pitching board and MLB's `P` on a pitcher's card — which is also what every user without a league sees, so nothing about the board changes for them. The fallback is narrow in practice: on the checked board **624 of 626 batting rows** and **744 of 749 pitching rows** carried an ESPN list. Note the pitching count is the one that needs the *board's own* half of the vocabulary read rather than the whole list: the Yankees' Fernando Cruz comes back eligible at `2B` and `SS`, the name-and-club join having found the wrong man of a duplicate name, and filtering per board turns that into an empty list — the fallback — instead of a second baseman on a pitching table. What it *does* change where it applies is the answer, and the change is the point — the same board goes from 55 shortstops to **103**, from 68 second basemen to **143**, from 240 infielders to **318**, and 51 more players become reachable by some pill at all (568 → 619, the tail being men MLB files under DH or nothing). **22 rows lose a pill they used to match** and every one of them is ESPN correcting MLB rather than losing him: Curtis Mead is listed at 2B and is eligible at 1B and 3B, Andy Ibáñez is listed in left field and is eligible at third. A manager filtering to 2B and seeing Mead was being shown a slot his league would not let him fill.

**SP and RP are read by the pitching board as well**, and for a while they were not — the pills there kept `ResearchRow.starter`, a majority of his appearances being starts, on three objections set out under **Client**. Two of them were facts and remain facts, and the board now pays them rather than avoiding them; the third turned out to argue the other way. The pills **stop partitioning** (143 of 749 pitchers are eligible at both, so a fifth of the board is under SP and RP alike) and eligibility is **season-long where `starter` follows the window** — which is the reason to prefer it rather than to refuse it, since the window says which games the numbers come from and has never said who the player is. `starter` stays on the row and stays the **qualifier's** definition of a starter, which is what it was computed server-side for; what it no longer is, is the pills' definition, and the two are allowed to differ because they answer different questions. The map needed nothing added to it: SP and RP have been fetched and shipped since the day eligibility landed, read only by the player page's chip, so this is the same 940KB request serving one more reader.

**The padlock beside a name** is the third thing that same ownership map buys, and it is the plainest of the three: *somebody else in this league already has him*. The set is exactly the one the `Other Rosters` button selects, the mark is `components/LockMark.tsx`, and it is drawn in the two places the app names a player and can answer the question — every row of the research board, and the player page's own `<h1>`. Its title names the holder (`Junior Caminero is on The Homewreckers in your ESPN league`), which costs nothing: `owned` is a map of MLB id → **team id** and the league's `teams` have ridden on `EspnLeagueInfo` since the connection was first verified, so the name is a join the payload already carries. "Somebody else has him" is the fact and "who" is the next question, and there was no reason to make the reader go and ask it.

**It costs no request and no field.** `App.tsx::ownedElsewhere` is one pass over the same `/api/espn/ownership` response `ownedIds`, `rosterPct` and `eligibility` are already read out of — the same rule that put those three there rather than on the research blob, which is cached per kind and window and served to every user alike and has no business holding a fact about one person's league. Measured on the live 12-team league, the batting board is **14 baseballs + 157 locks + 457 unmarked = 628**, which is the board's own count with all three include buttons on, and **no row carries both marks** (0 of 628).

**Your own team is excluded here rather than at the draw site, and that is where this deliberately parts from `boardRows`' partition.** That partition approximates "yours" as `rosterKeys`, which is exact in fantasy mode and is the **saved** list in saved-roster mode — and saved-roster mode with a league connected is the ordinary way to have one, the board's free agents being the reason most people connect at all. Left alone, the mark would then have drawn a padlock on every one of the user's own 28 ESPN players, stating outright that somebody else held a man he holds himself. A set that is a little wide costs a row on a board; **a label that is wrong costs the mark its meaning**, so `espnTeamId` — the team the user picked, falling back to the one his SWID identified — is taken out of the map before anything reads it, and the draw sites apply the roster test on top of that. The two rules therefore disagree about exactly those 28 men in saved-roster mode: the button files them under `Other Rosters` and the lock declines to lock them, which is the honest answer to both questions asked separately.

**And the whole mark is absent without a league**, since `ownedElsewhere` is null there and both readers are written as `ownedElsewhere?.…` — checked with `/api/espn` stubbed to `{ connected: false }`: 0 locks on a board that otherwise draws them 157 times.

See **Client** for where each of the two callers puts it, why it is muted where the roster baseball is accent, and the rule that suppresses it when it would mark every row.

**A third caller reads the path alone**, and it is a *control* rather than a mark on a player: below 480px the research board's `Other Rosters` button is the padlock, exactly as `My Roster` is the baseball (see **Client**, under the include buttons). So `LockMark.tsx` exports two things — `LockMark`, the labelled mark whose title names the holding team, and **`LockGlyph`**, the path in `currentColor` saying nothing — which is the split `BaseballMark` has always had and which the lock only needed once a button had to wear the same mark as the rows it selects. The button supplies its own accessible name and its own colour (`.on`'s accent against `--muted`), so the labelled form would have been wrong there twice over: it would name a player on a control that names a set, and it would pin the mark to one tone on a toggle whose whole job is to have two.

**Trending** is a run of `\u0394Nd` columns on the board (sortable — one tap gives a span's biggest adds, two gives the drops) and a row of the same spans beside the rostered figure on the player page. Rising is green and falling red, the `--hit`/`--strikeout` pair the arsenal tables already use for a delta; the cell rule is scoped to `td` so it outranks `.research-table td.research-sorted`, since sorting *by* the trend is the first thing anyone does with it and that must not be the moment the colour disappears.

**There are five spans, not one — 1D, 3D, 7D, 15D, 30D — because they are five different questions.** A one-day move is a reaction to something that happened yesterday (a start, an IL placement, a call-up), where a thirty-day one is a player the league has been coming round to all month, and one column has to pick which of those it is willing to say. They are not a smoothed version of each other either: measured on the local history, **38 of the 287 players** whose one-day and two-day moves are both non-zero point in **opposite directions** — 13% of them, and that is over one extra day rather than a month. The one-day column is not noise on its own account: 306 of 1,372 players moved on it overnight, the largest by 4.8 points. A single seven-day column could report neither the overnight reaction nor the month, and seven days is the *least* informative of the five on the day something actually happens to a player.

**The delta is computed here, not read from ESPN.** They publish a `percentChange`, but only on payloads this app can't justify: the league board is 10MB and needs cookies, and the season-wide `kona_player_info` that carries it without cookies is **180MB** and rejects `limit` and every stat filter there is (checked — 400 on each). Their window is undocumented either way. So `getRosterTrend` takes a **daily snapshot of the map `getRosterPct` already fetches** (`espn-ownership-{date}.json`, 19,367 bytes on a checked day) and subtracts, once per window. That costs nothing — the request is made regardless, and the five subtractions are five reads of a 19KB blob against a cache — and it gives each number a definition the app can print, which is why every label carries its own span rather than assuming one.

The snapshot is written **once per baseball day and not overwritten**: a baseline creeping toward the current value would shrink every delta measured against it as the day went on, for no reason a reader could see. Zero deltas are dropped from the blob, so the client reads "absent but has a roster %" as flat rather than unknown. Players missing from the baseline are **excluded rather than treated as rising from zero**, which would put every newly-added prospect at the top of the risers — and that is now per window, so the man ESPN added this morning is missing from 30D while appearing in 1D, which is exactly right.

**Each window gets its own drift, and the shortest gets none** (`TREND_DRIFT` — 0, 1, 2, 3 and 5 days either side of 1, 3, 7, 15 and 30). The single column this replaces walked out to **fourteen** days from a target of seven, and the same tolerance on a 1D column would report a fortnight's movement under a header saying yesterday. The wide old fallback was buying *coverage*: with one column, falling back from seven days to three was the difference between a trend and nothing at all. That argument dies the moment a 3D column sits beside the 7D one — a short span now has a column of its own to be reported in, so a long one blurring into it would only be two columns saying one thing under two headers. The drifts are also picked so the **bands cannot touch**: [1], [2–4], [5–9], [12–18], [25–35], verified disjoint, which matters because a column's label states the span it *measured* rather than the one it asked for — two headers both reading `\u03944d` over different columns would be unreadable, and this makes it impossible rather than merely unlikely. It also means no date is ever read twice, so the five windows resolve concurrently with no shared bookkeeping: five reads in the ordinary case, 27 in the worst.

**The column's key is the window; its label is the measurement.** `rosterTrend` stays the seven-day column's key rather than becoming `rosterTrend7`, because saved column sets and every `cols=` link in the wild name it and a rename would silently drop the one trend column anybody has today; the other four are `rosterTrend1`/`3`/`15`/`30`. The label is written from `RosterTrendWindow.days` — `\u03946d` where the seventh day back is missing and the sixth is not — since a header saying "7d" when it means six is a lie the reader has no way to catch.

**Four of the five are off by default**, which is a deliberate reading of the `DEFAULT_OFF` rule rather than an exception to it. That rule expresses the default set as what is *off* so a column added later shows up rather than being invisible, and what it protects is a **new stat** going unseen. These are not a new stat: they are four more resolutions of one already on the board, and left on they would put five near-identical signed columns at the very front of the app's widest table — ahead of games played — for every connected user. So the one that has always been there stays on and the rest are one tick away in the Columns panel, sitting next to it under the same `Fantasy` heading, where nobody has to already know they exist to find them.

**A cold install has no trend and says so**, and now says it a column at a time: `getRosterTrend` returns null until *some* window has a baseline, and any window without one is left out of the list entirely rather than sent empty, which is what removes its column — a column of zeroes reads as "nobody is moving", which is a claim where the truth is an absence. So the board fills in as the history grows: 1D tomorrow, 3D in three days, 30D in a month. Nothing falls back to the earliest snapshot it happens to hold and calls the answer a month.

**The history has to reach 35 days now, and nothing had to be widened to let it.** Snapshots are ordinary `storage.ts` blobs and **nothing prunes them**: the only expiry anywhere is the cache bucket's lifecycle rule on the whole `cache/` prefix at 400 days, an order of magnitude past `TREND_MAX_DAYS` (35, which is 30 plus its drift). The thing that actually limited the history to a fortnight was the constant, not the storage — so the infra is untouched. `warmer.ts` takes the snapshot nightly so the history accumulates whether or not anyone opens the board, and a missed night now costs unevenly: the columns have only their own narrow drift to route around a hole, so one skipped day takes the **1D column out entirely** the next morning while the 30D one never notices.

**On the player page the five read as a row rather than a sentence.** One trend used to read `\u25b2 1.2 in 7d`; five of those is a paragraph, so each is now its span in the muted label colour followed by the move (`7d \u25b21.2`), wrapping under the rostered figure when the line runs out. A flat window keeps a plain `0.0` in that same muted tone — the server drops zeroes from the wire and the client fills them back in, so flat is a real answer here and not an absence. The board's cells took the same fix: a zero used to format as `\u22120.0`, the sign being chosen on `> 0`, which reads as a fall of nothing on a board where a great many players are genuinely flat.

**Sharing a league with your leaguemates.** The second person in a league should not have to go through the cookie hunt at all, and doesn't: one member turns on an **invite link** and everyone else joins by opening it — no league id, no cookies.

The obvious design — recognise leaguemates by email and enrol them automatically — **is not possible**: ESPN publishes no member emails. Checked across `mTeam`, `mSettings`, `mNav`, `mMembers`, `mRoster`, `mMatchup` and `mStandings`, plus the `/members` and `/invites` endpoints: **zero email-shaped strings in 2.7MB of payload**. What `members[]` carries is `displayName`, `firstName`, `lastName` and the member's **SWID**. A SWID would be a stronger membership proof than an email — it is ESPN itself vouching — but a user only has one once they have supplied a cookie, which is the very step being avoided, so it can't bootstrap anyone's first league. Hence an explicit invite, which also keeps the consent explicit: sharing a connection means leaguemates' reads run on **your** ESPN session, and that should be something someone opts into rather than something that happens on a match they never see.

**The credential therefore lives on the league, not the user** (`LeagueRecord`, keyed `league#<id>` in the same DynamoDB table — schemaless past the key, so no new table and no CDK change). A user record holds only a *reference*: league id, their own team, no cookies. That is what makes the credential shareable, and it is also what makes **any member able to refresh it**: `PUT /api/espn` does double duty, so whoever notices the league has gone stale can paste their own cookies and revive it for everyone. A connection saved before this still carries its inline copy; `getEspnCreds` **promotes it onto a league record the first time it is read**, so the migration happens as people use the app rather than in a script (which is why `espnStatusFor` goes through it rather than reading the league directly — reading around it would report `hasCredentials: false` for a perfectly good legacy connection). The dev file backend became a map of the same keyed records for the same reason, and still reads both older shapes.

An invite code is 12 random bytes base64url, with a **pointer record** (`invite#<code>` → `{ leagueId }`) so a join is one lookup rather than a scan. `leagueForInvite` requires the pointer *and* the league's own copy to agree, so a half-finished revoke can't leave a working link. Revoking stops **new** joins and deliberately does not detach existing members — "revoke the link" and "throw out my leaguemates" are different intentions. An invalid and a revoked code get the **same** message, since telling them apart tells a stranger holding a guessed code whether they are close. The link is `?league=<code>`; `App` redeems it once on load and **opens the Fantasy league page** rather than silently rewiring where the player list comes from — and they have to pick a team anyway. No cleanup of the param is needed: App's URL sync writes the query string from the view state and `league` isn't in it, so the first sync drops it, which also stops a reload redeeming twice.

### The invite code is stored, not carried through the redirect

**The sentence above is still true of the URL and used to be the whole of the story, which is what broke the one visitor an invite link is aimed at: somebody with no account.** Between arriving on `?league=<code>` and being able to redeem it there is an entire sign-up, and for the Google route that means leaving the site, visiting two other origins and coming back — the least reliable thing the app does, and one that demonstrably fails on iOS (see **Roster, watchlist, users and auth**, *The Google round trip fails at Cognito*). Every way that round trip can go wrong lost the code:

- the federated leg fails at Cognito and never returns to the app at all, so the reader retries from Cognito's own page or comes back to the site by hand, and the `?league=` they clicked is long gone;
- the redirect returns `?error=` rather than `?code=`, and the query the reader arrived on is replaced by it;
- they give up on Google and sign in with an email and password, which restores no stashed query at all;
- the tab is closed and the link reopened, or iOS restores the tab.

**It was carried by `auth.tsx`'s `sicko:return-query`** — the whole query string, in **session**Storage, put back only on the *successful* federated path. That is exactly right for view state (a preset, an open player), which is worth restoring and costs nothing to lose, and exactly wrong for a one-shot credential that is the entire point of the visit. And it failed **silently**: the app came up signed in, on a page with no league connected, with nothing on screen to say a link had been dropped.

**So the code is stored deliberately and on its own** (`client/src/invite.ts`), and the two choices are the whole of the design.

- **localStorage, not sessionStorage.** sessionStorage is per tab and dies with it, which loses the code on exactly the paths above. The redemption is the reader's own act, minutes later at most, and has to survive a tab restore and a reopened link.
- **An hour, and then it is stale** (`MAX_AGE_MS`). Redeeming a leaguemate's invite joins you to their ESPN connection, so a code left lying in storage should expire; an hour covers a sign-up, a confirmation email and two failed Google attempts, and does not cover coming back tomorrow on a shared machine.

**It is captured at module load**, which it has to be: `App` rewrites the whole query string from its view state on its first sync, and `auth.tsx` navigates away to Cognito the moment the Google button is pressed. Both happen after the module graph has been evaluated. **`takeInvite()` spends it** — the read clears the entry and is memoised for the load, so it is safe to call from a render (React runs initialisers twice under StrictMode) and a reload cannot redeem twice, which is the property the old "the URL sync drops the param" argument bought. A browser that refuses storage falls back to the parameter read at load, so a link opened while already signed in still works; what that cannot do is survive the redirect, which is the honest limit of a fallback with nowhere to write. `sicko:return-query` is untouched and still restores the rest of the view state.

**Measured against the built client, before → after, on a fresh browser profile each time**, with the app served beside a stub API that logs every request:

| | before | after |
| --- | --- | --- |
| invite link, signed out — stored | `null` | `{"code":"INV123",…}` |
| redirect returns `?error=` — error shown | *(none)* | `Google sign-in didn't finish. Try it again.` |
| redirect returns `?error=` — URL | `?error=server_error&error_description=…` | `?league=INV123` |
| `?code=` with no verifier — error shown | *(none)* | `Sign-in couldn't be completed in this tab.…` |
| `?code=` with no verifier — URL | `?code=abc123&state=xyz` | *(cleaned)* |
| invite still stored after both failures | — | yes |
| **then signed in on a bare URL — `POST /api/espn/join`** | **0** | **1, `{"code":"INV123"}`** |
| a reload after that | — | still 1 |

That last row is the fix stated as a measurement: the join fires from a URL carrying no `?league=` at all, so the code came out of storage. Two further cases were driven the same way — pressing **Continue with Google** from an invite link (with the outgoing navigation intercepted so the tab keeps its storage) leaves the invite stored, the PKCE verifier stashed and `sicko:return-query` at `?league=INVGOOG`, with the authorize URL carrying `identity_provider=Google`, `response_type=code`, `code_challenge_method=S256` and `redirect_uri` at the app's own origin; and a **two-hour-old** stored invite is dropped on the next sign-in and sends no join.

The status carries `inviteCode`, `memberCount` and **`credentialMine`** — the last of these exists for the negative case, telling someone their league is running on a leaguemate's session so a stale one reads as something anybody can fix rather than a fault of theirs.

**Your own team as the roster.** `EspnLeague.teamId` is what makes this possible and is the reason the field is written rather than only displayed: it names which of the league's rosters is the user's. It is derived from the SWID at connect time — the team whose `owners` carry it — and **settable** (`PUT /api/espn/team`), because a public league read anonymously has no owner to match and a manager with two teams has to say which. The label beside the id is read back off the league rather than trusted from the client: the id is a choice, the name is a fact.

With a team known, `UserPrefs.rosterSource: 'fantasy'` swaps the two roster views over — `GET /api/report?source=fantasy` resolves its players from your team rather than from `getRosterForRange`, which over a range means the union of every day's `rosters[teamId]` through `rostersToWatchlist` (and over a single day, one read through `rosterToWatchlist`). (The wire value for the other source is `saved`, and `watchlist` is still accepted as the synonym an older tab sends.) **The client asks for the source explicitly rather than the server consulting the saved preference**, so a report and the view rendering it can never disagree about which set of players it describes; the preference decides what the client asks for and nothing else. A two-way player becomes **two entries**, one per kind, which is what the app's `${kind}-${id}` key means; players the name match couldn't place are dropped, there being nothing to report on for a prospect who has never appeared. Roster order is preserved — lineup first, then bench, then IL — so the list reads the way a manager reads their own team. In the URL as `roster=fantasy` and saved per user, both for the reasons `hideil=1` is: it changes *which players a view reports on*, and absence is unspecified rather than "the saved roster", which is what lets the saved value fill it in. **Absence is now unspecified in the *record* as well** — this is the one preference that stores both of its values, so that "never asked" and "asked for the saved roster" can be told apart; see **Naming a team for the first time turns the fantasy roster on** below, which is what needs the difference.

### Naming a team for the first time turns the fantasy roster on

**Joining a league by an invite link left the app reading a roster the joiner has nothing in.** The link attaches them to the league and opens the Fantasy league page (above), they pick which team is theirs, and then — nothing. `UserPrefs.rosterSource` was still `saved`, so the Roster and Feed views went on reporting on the list they built here, which for somebody who has just arrived is empty; the way out was the roster-source toggle in the fantasy popover, which is a control they have no reason to know exists. The last step of joining a league is to say which team is yours, and after it the app should be reading that team.

**So it does, and the rule is one sentence with two guards** (`App.tsx::onEspnStatusChange`): naming a team **where the connection had none** turns the fantasy roster on, **unless the user has stated which list they want**. Neither guard is optional and each excludes a different way of getting this wrong.

**`firstTeamNamed(prev, next)`** is the first, and it is a test on the *transition* rather than on the new status. It requires `prev.connected`, the **same league**, `prev.teamId === null` and `next.teamId !== null`. What each clause keeps out:

- **`prev.connected`** excludes the connect itself. Pasting cookies for a private league derives the team from the SWID in the same round trip, so that transition is disconnected → connected-with-a-team; counting it would also fire on every **re**-connect, which is what somebody does when the session cookie has expired and is no statement about which roster they want to read. A public league connected from a URL carrying a `teamId` is in the same class and is likewise not covered — the reader who wants the fantasy roster there is one press of the popover away, and a re-paste must not override them.
- **`prev.teamId === null`** excludes a team *change*, which is the case this must never fire on: a manager with two teams who has deliberately turned the fantasy roster **off** and is correcting which one is his would have it turned back on under him.
- **The same league** because a connection moved to a different league keeps nothing of the old one, and comparing team ids across two of them compares two different numbering systems.

**`rosterSourceStated` is the second, and it is what made the stored shape change.** The app's convention is that a preference stored as the absence of a key means *unspecified*, and every other entry in `UserPrefs` can live with absence and "off" being the same state because nothing acts on the difference. Something acts on it now. `setRosterSource` therefore writes **both** of its values — `rosterSource?: 'fantasy' | 'saved'` — so a user who has worked the toggle either way has an answer in their record and a user who has never touched it has none. Reading is unchanged in both workspaces (`=== 'fantasy'` is the only test anywhere), so a record written before this still reads as the saved roster; what it no longer claims is that its owner *chose* it. The client's ref is the same touched-guard the other preferences carry, widened by one thing: the *presence* of the key sets it, whichever value it holds — and deliberately **after** the branch that applies a stored `fantasy`, since setting it first would read a saved preference as "already stated" and never apply it.

**The two guards give a property worth stating: it can fire at most once for a user, ever.** The write it makes is itself a stated source, so the record then holds `fantasy`; a reader who turns it off writes `saved`; either way the ref and the record agree and nothing fires again. That is also why `rosterSource === 'saved'` is tested rather than assumed — with the fantasy roster already on there is nothing to turn on, and writing it down would have a `roster=fantasy` **link** quietly overwrite the record it was only ever meant to override for one visit, which is the rule `cols=` follows.

**Nothing downstream had to be told.** The switch is one call to `setRosterSource`, which is the same thing the popover's toggle presses: it flips `usingFantasy`, which is what `loadReport` asks its `source=` with, what the fantasy roster read and the report effect both depend on, what the URL sync writes `roster=fantasy` from, and what lights the fantasy button and takes the editing controls away (**Editing is off in that mode**, below). One state change, one render, one pass — so the URL and the record cannot end up saying different things, and the report is re-read rather than left describing the saved roster.

**One write at a time, which the shape gives for free.** `PUT /api/espn/team` has resolved by the time `onEspnStatusChange` is called, so the preference PUT that follows cannot race it against the same user item — the lost-update hazard `App.tsx::queueUserWrite` exists for and the reason this is not done optimistically inside the picker. Checked on the file backend, which has no version to conflict on: after a pick the record carries **both** `espn.teamId: 6` and `prefs.rosterSource: "fantasy"`.

**The page says what the pick does**, in the paragraph under the team picker: *Choosing one for the first time turns on **Use my fantasy team*** — and, in the same breath, that changing teams later leaves a stated preference alone, which is the honest half of a promise made only to first-timers.

**Driven end to end against the live 12-team league**, with the invite code, a real `PUT /api/espn/team` and the file backend, at 1200×900. *Fires* — a joiner with no record opens `?league=<code>`, the page opens with `teamId: null` and thirteen teams in the picker, and choosing one takes the URL to **`?preset=Today&roster=fantasy`**, the fantasy button to **`fantasy-btn on`**, the record to **`{"rosterSource":"fantasy"}`**, and the next report request to **`/api/report?…&source=fantasy`** — where before the pick it carried no `source`. Behind the page the summary table then draws **14 rows with 14 slot chips** and **0 add buttons**, and a reload comes back on `roster=fantasy` with the same 14 rows off the saved preference alone. *Does not fire, three ways.* A record holding `rosterSource: "saved"` with no team yet: the pick sets the team (`League 60120 · Brian&Tom's Excellent Adventure`) and leaves the record at `{"rosterSource":"saved"}`, the URL without `roster=`, the button unlit and the report without `source=`. A record with **no** stated source but a team already chosen, changed from team 6 to team 1: record stays `{}`, URL and button unchanged — the team-change case. And a `?league=<code>&roster=fantasy` **link** on a record with nothing saved: the views read the fantasy roster because the link says so, and the pick writes **nothing** to the record (`{}` before and after).

**Bundle: 464.53 → 464.87 KB of JS** (137.79 → 137.93 gzipped) and **CSS unchanged at 106.76** (19.06) — 0.34KB raw and 0.14KB over the wire, most of it the paragraphs arguing the two guards.

**Editing is off in that mode — all of it.** The reorder screen is hidden (`!usingFantasy`), because ESPN owns that list and a screen offering to rearrange it would be offering something it can't do. That was for a long time the only half that went, and the other half was argued for on the grounds that the search and the player page's add button still worked: they added to the *saved* list, the one the app goes back to the moment the toggle is turned off, so `PlayerAdder` kept deduping against the saved roster while `rosterKeys` (the research board's `My Roster` button and its baseball) followed whichever list was actually on screen — the adder showing the state of the thing its own button changes.

**What that argument leaves out is that the change is invisible.** Pressing ＋ in fantasy mode puts a player on a list no view on screen is showing: the summary, games and feed tables are the ESPN team and go on being it, so the only evidence anything happened is that his row quietly stops appearing in the very search that was used to add him — an effect nobody can read as a confirmation. And the player page's control was worse than invisible, being wrong twice: `Add to roster` beside a man already on the ESPN team the page's own views are reading, and an `On roster` badge with a **Remove** that ESPN's list will not honour, on a page reached from a board row precisely to decide whether to pick somebody up. So the whole editing path goes with the reorder screen it was half of:

- **`PlayerAdder` takes a `canAdd`** (false in fantasy mode), which drops the ＋ and leaves the field as the other thing it always was, a way of opening a player's page. **The dedupe goes with the button that justified it**: with nothing to add, hiding a rostered player would only be the search declining to find someone for a reason nothing on screen could explain, so in fantasy mode every player is findable.
- **The player page keeps its badge and loses its buttons.** `isOnRoster` is now read off `rosterKeys` rather than the saved list, so it is a true statement about the roster in view — and the same key set the board's baseball marks, which is what stops one row and one page disagreeing about one man. `Add to roster` and the `RemoveButton` are both behind `rosterEditable` (`!usingFantasy`). Nothing replaces them: the `Watch` star beside them is untouched, the watchlist being the user's own list and no business of ESPN's, and a disabled button or a line of explanation would be chrome saying "no" on every player page in the mode. The way to add or drop somebody here is a move made on ESPN, which is what `Refresh from ESPN` is for.
- **The wording of the badge does not change** — still `On roster`, because the board's button is still `My Roster` and marks these same keys, and a second name for one fact would only invite a reader to hunt for a difference that isn't there. Which list it is, is the title's business (`… is on your fantasy team — the roster the Roster and Feed views are reading`).

Two things were rejected. **Relabelling rather than removing** — an `Add to saved roster` that says which list it touches — is honest about the destination and still spends a control on a change the page cannot show; the app does not otherwise offer edits to lists it isn't displaying. And **keeping Remove beside the badge**, on the reasoning that it could fall back to the saved list, which is the same trick one level worse: a ✕ under a badge that says "on roster" would remove him from a list that isn't the one the badge is about.

One consequence had to be paid for. The `Your roster is empty` block is about the *saved* list, so it is now gated on `!usingFantasy` — a user with an ESPN team and nothing saved was getting it on top of a full page of his fantasy team's cards, over a button opening a search that no longer adds to anything. The mode's own empty case (`Your fantasy team is empty`) names its cause the way every other emptied view in the app does, held until the roster read has landed so it can't flash over a page that is merely waiting for ESPN.

The board's **watchlist** is a third thing again and is unaffected by any of this — it is a set of keys of the user's own, not a roster at all, which is why its star survives on the player page in every mode.

**The lineup slot** rides on `EspnRosterPlayer.slot`/`starting`, off ESPN's `lineupSlotId` — a **different numbering system** from `defaultPositionId`, which is the trap in that payload (`1` is first base here and a starting pitcher there). Bench is 16 and IL is 17; **everything else counts as starting**, including slot ids ESPN has never documented, which is the way round that fails safe — an unknown slot reads as playing rather than as benched. Which *day's* slot it is, is the range's business — see **Which day's lineup** above and **The slot chip and the order are the range end's, not today's**: the chip is the slot he was in on the **last day of the range in view**, which is today on the three presets that end there, tomorrow on `Tomorrow`, and the day itself on `Yesterday` or any hand-picked past range. It reads that off `endRoster` where the two differ and off `players` where they don't, and its title names the day unless the day is today. It reaches the UI through `FantasyRosterContext` (`hooks.ts`), a context for the reason `MutedContext` is one: the map would otherwise be threaded from App through `SummaryTable` and its per-kind table down to the row, three levels with no other interest in it. **`FantasySlotTag` is on the summary table alone** — it rode on both kinds of player card and on every feed row too, which is the same fact stated four times on pages that are about a player's night rather than about your team; the summary table is the one you read *as* a roster. It sits **ahead of the name**, where it used to trail it: the slot is what you scan a fantasy roster by, so it leads. A **42px floor** on the chip is what keeps every name in the column starting at one x — measured rather than chosen, by rendering every slot the app can print into a real chip (`UTIL` widest at 42, `DH` 33, `C` 24). And `vertical-align: middle` on both the chip and the name, since they are inline boxes of different heights and the default baseline alignment sits a 15px pill and a 13px name on their type baselines rather than through their middles. The chip renders **nothing at all** outside fantasy mode, so the column costs a saved-roster user nothing. What it marks with colour is **starting versus not**, not which slot: a lineup spot takes the accent, bench and IL go muted and outlined — `BE` against `2B/SS` is not a distinction the eye makes at a glance, and "is he accruing stats today" is the question being asked. **That same `starting` flag is what the roster row's `Starters` toggle reads while the fantasy roster is on** — on Roster and Feed alike (see **Client**), so the chip that marks a lineup spot and the filter that keeps only lineup spots are one fact rather than two — and the toggle's answer to "who am I actually starting today" is your lineup rather than MLB's. Note what the two features above make of each other: the filter reads whichever day's lineup the range asks for, so on `Tomorrow` it keeps the men you have started for tomorrow. That is the right composition rather than a coincidence — a filter reading one day's lineup beside chips drawn from another would be the two of them describing different teams.

**Over a range that flag is one day of several, and the filter now reads `lineups` instead** — the day-by-day map above — so a week's numbers are credited a day at a time (see **Client**, where the projection and what it does to the rows are set out). The chip keeps `starting`, because a slot *is* a fact about a day and there is no honest way to draw seven of them in one pill; what it gains over a multi-day range is a count in its title — `On your fantasy bench today · in your lineup on 4 of the 7 days in view` — which is what stops a muted `IL` sitting over four days of stats with nothing on screen to explain it. Checked in a browser on the live league: Stowers reads exactly that. **Everything fantasy is behind one button in the header, beside the settings gear** (`.fantasy-btn`, `.fantasy-menu`) — the roster-source toggle and the league page, both of which used to be entries in the gear's menu, plus a chip in the view bar naming the team. That was one feature answered in three places, none of them saying where the other two were. The button is lit — `.on`, the **filled** accent a selected tab takes — whenever the app is reading the fantasy roster, which is the state the chip used to carry, with the difference that a chip could only be read where this can also be pressed to change what it reports. A tint was tried first (accent text on a 12% wash, the way the research board's `.on` disclosures read) and was too quiet by half: beside the plain gear at 36px the two were barely distinguishable, and this button inherited the job of a chip that announced the fantasy roster from across the page. `.active` (the popover open) fills identically, which is the bargain the gear already makes — while the panel is on screen saying what it holds, the button under it has nothing left to distinguish. **With no league connected the button opens the league page directly** rather than a popover: a menu holding one item is not a menu. Connected, the popover leads with the **team name** — what the chip said, kept because the button can report *that* the roster is the fantasy one and not whose — as a line of text rather than a menu item, so it doesn't invite a press that does nothing.

Client-side, the connection is set up on **`EspnSettings.tsx`**, a full-screen overlay riding on `.details-view` and the how-to page's head — the same fixed box, own scroller, Escape-or-Back — reached from the fantasy button's popover (or, with nothing connected yet, from the button itself). Most of what is on it is **instructions**, and that is the right ratio: the two values it needs are browser cookies, and nobody knows where those are without being told. `App.tsx` reads the status once on boot (next to the preferences, since it decides whether the board offers its pill and a first render that got that wrong would then correct itself), and reads the ownership **lazily, on every entry to a board that needs it** — either of the two include buttons that are *defined* by who owns whom being on, where it used to be the single `Free Agents` scope — the rosters being irrelevant until someone asks which players are free, and a set read at breakfast is the wrong answer by lunchtime. Re-asking costs nothing (the server's ten minutes is the single place freshness is decided, and repeats inside it are a lookup), and the previous read is left in place while the next is in flight so a re-read never blanks a table someone is reading. The effect's dependency list is exactly the set of things that can *be* an entry — deliberately not `ownership` or `espnLoading`, either of which would re-run it on its own result and spin.

**The chosen team is a dependency, not just a status field.** `PUT /api/espn/team` answers with a new status and *nothing else about the league moves* — same league id, same `usingFantasy` — so the fantasy roster read and the report both went on describing the old team until a page reload. `fantasyTeamId` (`usingFantasy ? espnTeamId : null`, null in saved-roster mode so a team change there costs no refetch) is in both dependency lists, which is what makes picking a team on the Fantasy league page reload the views behind it. The roster read is `loadFantasyRoster`, a callback beside `loadOwnership` rather than a body inline in the effect, for the same reason that one is: the refresh path has to be able to call it too.

**A move made on ESPN is the one thing this app cannot see**, and until the cache expires it has no way to learn about it — so there is a **Refresh from ESPN** button (`refreshFantasy`), the first caller of the `?refresh=1` the server has always offered. It is **sequential and only the first call carries the flag**: ownership, then the roster and the report through the cache it just refilled. `getOwnership(force)` bypasses the `inFlight` guard as well as the cache, so firing all three with the flag would send three copies of one 2MB league read instead of one and two lookups.

**It is in the fantasy popover**, one press from any view (`refreshFantasyFromMenu`). It was only on the Fantasy league page, which put two navigations between "I just moved somebody on ESPN" and the app agreeing — the wrong distance for the one thing this app cannot see for itself, and the popover is already where every other fantasy control ended up for that same reason. It sits **above League settings and below the roster-source toggle**: it acts on what the menu is about without leaving it, where the entry under it is the menu's way *out*. A `.help-btn` like that entry rather than a control of its own, so the two rows are one object by construction; the only thing `.fantasy-refresh` adds is a glyph slot that holds its size, the app's spinning baseball being 14px inline against the 15px arrow it replaces, so without it the label would step a pixel left the moment the read started and back when it landed; the rule names `svg` rather than a spinner class because the ball *is* one. Its label drops to `Reading` while the read is out, with no ellipsis: the ball beside it is what says the read is still going (see **Loading** under **Client**). It takes that button's `MIN_SPIN` floor too, and the popover deliberately **stays open** across the press, this being the one entry whose result is a change in the page behind it. `Up to date ✓` is about the press rather than a standing state and is dropped when the menu is reopened, or a tick from an hour ago would greet someone who has come back precisely because they suspect it isn't.

**It stays on the league page as well**, and the two are not quite the same control: that one re-reads the **team picker** after the league (`EspnSettings`'s `refresh`), which is the page's own business and no use to the popover, and the page carries the paragraph explaining the ten-minute cache — a note naming a button that isn't there is worse than a second doorway. They are never on screen together, opening the page closing the popover, so this is one action reached from two places rather than the duplicated affordance the search bar's own close button was. There it still sits beside Disconnect on the status panel, in the app's accent — reading the league again is an ordinary action, and the red beside it is reserved for the control that undoes the connection. It reads `Reading` with the ball beside it in flight, as the popover's entry does, and the connect form's submit reads `Checking with ESPN` the same way; neither takes a `MIN_SPIN` floor of its own — this one inherits it through `onRefresh`, which *is* `refreshFantasy`, and a connect is a round trip to ESPN with no fast answer to leave a press without a trace.

### The league scoreboard

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

**`scoringPeriodId=0` is what makes the scoreboard affordable, and it is the
measurement worth keeping.** `mScoreboard` embeds two whole rosters per side —
`rosterForCurrentScoringPeriod` and `rosterForMatchupPeriod`, ~43KB a team —
which is the entire payload: one matchup period comes to **524,565 bytes**.
Naming a scoring period that is not a day empties both while leaving
`cumulativeScore` untouched, that being a fact about the **matchup** period
rather than about a day: **23,759 bytes**, a 22× reduction, and the category
scores are **byte-identical** — checked field by field over all 10 matchups of a
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

**A bye is a real shape.** A matchup with a `home` and no `away` is what a
playoff round looks like — period 19 of the live league is 2 matchups and **8
byes**, all 12 teams accounted for — so `EspnMatchup.away` is nullable rather
than the read being treated as malformed.

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
  70,794 bytes**, cached in memory per league on the rosters' own
  `OWNERSHIP_TTL_MS` (10 min) with an `inFlight` guard, so a cold Lambda serving
  three tabs sends one upstream rather than three. The season's spans are read
  unfiltered because the point of them *is* the season: they date every period
  and they are what tells the client which periods exist.
- **A finished matchup period is a fact**, so it takes a storage blob read with
  **no freshness test** — `espn-scoreboard-{leagueId}-{period}-v1.json`, **3,396
  bytes** on a checked week — which is the rule `espn-lineup-…` already follows
  for a finished day's roster and for the same reason: you cannot retroactively
  score a run in a week that is over. The period being played is memory-only on
  the same ten minutes.
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
not explain (checked: `?period=999` → 19).

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

**The order is `Season · Current matchup · First half · Second half ·
Playoffs`**, which is the order a manager reads them in: the whole year, then
the week being played, then the year cut up. `season` is also the default.

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

**The halves are cut on the All-Star break, read off ESPN's own calendar.**
`fetchPeriodAnchor` already downloads `proTeamSchedules_wl` and now reduces it
twice: the anchor pair as before, and the **longest run of gameless scoring
periods** inside the span the schedule covers. Checked on 2026: of the 187
periods it carries, exactly **three are gameless — 111, 112 and 113 — and they
are the only run of them in the season** (110 carries 30 games, 114 carries 2,
115 carries 30), so "the longest gameless run" is not a heuristic that happens
to work, it is the only candidate there is. `espn-period-anchor-{season}` goes
to **`-v2`** for it, which is exactly the bump that key's own note asked for: a
stored v1 blob carries no break and would come back deserializing as a season
with none, quietly costing the tab its two halves for a month.

**A matchup period that straddles the break goes to the half holding more of its
game days**, the gameless ones counting for neither — the live league's period
15 spans scoring periods 104–117, seven game days before the break and four
after, so it is the first half's. Dropping a straddling period outright was the
alternative and is worse: it would take a fortnight's play out of *both* halves
with nothing on screen to explain the gap. A half with no matchup periods in it
is **absent from the `spans` list** rather than served empty, which is the rule
the scoreboard's forward arrow already follows for a period ESPN has not opened;
so is a season whose break the calendar cannot show.

**Ranks are computed on the server here, where the research board computes them
in the client**, and the two are not in tension. That board ranks columns
*derived in `Column.value`* — BB%, K-BB%, ISO, PA/HR — which exist nowhere on
the row, so a server-side ranking could reach only the raw half. Nothing on this
table is derived in the client: the server holds the values, the `lowerBetter`
flag and the population, so there is no half it cannot reach. Competition
ranking, 1 is best whichever way the category runs, ties share a rank and the
next distinct figure skips — `teamStats.ts::rankAll`'s convention. A team with
no figure is **out of the ranking entirely** rather than at the bottom of it,
the rule `sideFrom` already follows for a category a side is ineligible for.
Checked against an independent recompute over all **five** spans: **600 of 600
cells match, 0 wrong, with 73 tied cells among them.**

**Caching is this file's own two rules.** A span whose last matchup period is
**over** cannot change, so it takes a storage blob read with no freshness test —
`espn-span-{leagueId}-{first}-{last}-v1.json` — which is what `getMatchups`
already does one period at a time. A span reaching into the week being played is
memory-only on the rosters' ten minutes, and `force` reaches that one and leaves
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
could only ever be the ten minutes beside it, and what it stored would be a
window that has moved by the time it is read. Keyed per league on
`OWNERSHIP_TTL_MS` with an `inFlight` guard, and `?refresh=1` reaches it — a move
made on ESPN is exactly what that button is for. `TRANSACTIONS_LIMIT` is 250,
which cuts nothing today (a season of this league is 770 topics and the tab reads
the most recent 250 of them) and bounds a payload that grows all season; the
client says when the list is at it.

**Measured through the route**: **86KB in 402ms** cold and **5ms** warm — 250
transactions, 415 players, 197 adds, 49 drops and 4 trades.
