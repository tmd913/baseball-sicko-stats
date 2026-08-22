### Data sources — MLB Stats API is primary (README is out of date here)

The README describes Baseball Savant CSV as the primary source. **The code has since inverted this:**

- **MLB Stats API** (`server/src/mlbStats.ts`) is now the primary source. `getStatsApiGame(gamePk)` pulls the `feed/live` play-by-play and builds the full nested model — plate appearances, pitches, official scoring (runs, RBI, SB, CS), and hit data (exit velo, launch angle, distance).
- **Baseball Savant CSV** (`server/src/savant.ts`, `savantUrl`) is now **enrichment only** — it supplies the handful of Statcast fields with no Stats API equivalent: `batSpeed`, `swingLength`, `xba`/`xwoba` (expected BA/wOBA), and `deltaRunExp` (per-PA run value → `runValue`). If the CSV fetch fails, the report still renders; those fields are just null.

`savant.ts::getDay(date)` orchestrates both: build the Stats API day, then merge CSV enrichment keyed by `batterId|gamePk|atBatNumber` (and `|pitchNumber` for pitches). `getReport(start, end, roster)` fans `getDay` across an inclusive date range and merges each player's games chronologically. **`getPlayerDay(id, kind, date)` is that same function asked for one man over one date** — what the player page's Overview tab and the Game Log's per-game popup read, both of which open on players nobody has rostered. It goes *through* `getReport` rather than around it so the report those views draw is the report the feed draws, and it adds no cache of its own because every layer under it already has one; see **Date handling and server routing** for the whole of that argument.

`server/src/research.ts` backs the research view, and is the one place that reads a **league-wide season leaderboard** rather than a day or a player. The traditional half is MLB's own `stats?stats=season&group=hitting|pitching&sportId=1&playerPool=ALL` — the *leaderboard* rather than a hydrated per-player group, because it already does what `preferSeasonWide` has to undo elsewhere: a **traded player comes back once**, aggregated across his stints and carrying his current club (Arraez's 111 G is the 105 + 6 of his two teams, not the 6). `playerPool=ALL` is what keeps the September call-up and the position player who threw an inning — the long tail is the point of a research table. Each row carries `position.type`, which is what the client's position-type filter selects on. **`qualified`** is computed here too, and needs a third upstream: it is measured against games **his team** has played, and the only game count on the leaderboard is the player's own — so `getTeamGames()` reads the standings for games played per team id, and `getTeamGamesInRange()` counts finals off the schedule for a dated window. Getting the team right is the point rather than a nicety: with team games spread 116–120 in August, a man on a side that has played 116 clears a bar a man on a 118-game side misses at the same raw total, and any league-wide proxy gets that pair backwards. A player whose team can't be placed falls back to the league **maximum** games, since a zero would be a threshold of nothing and quietly qualify him. Checked against the standings row by row: 0 mismatches.

**The rule it carries is Savant's, and that is a change from what this paragraph used to say.** It was MLB's rate-stat qualifier — 3.1 PA per team game, an inning for a starter, one appearance in three for a reliever — written for the board's `Qualified` toggle, which was removed and left the flag with no reader at all (the passage that recorded that is now the one in `research.ts` explaining why it was kept). It has a reader again and a different job: **it is the population the percentile badges are ranked within**, on the research board and on the player page's Stats tab. So the bar is the one Savant ranks within: **2.1 plate appearances per team game for a batter, 1.25 batters faced for a pitcher**, compared as `volume >= rate × games` with no flooring. There is no starter/reliever split, because Savant makes none — 182 of the 353 pitchers it qualifies today are relievers.

**Both figures were measured off Savant rather than recalled**, and the measurement is in `qualifies()` in full. In short: taking Savant's own `percentile-rankings` export for 2026 as the answer key and placing every player on his club's games played, `bf >= 1.25 × G` reproduces the ranked pitcher set **exactly** — 0 false positives and 0 false negatives over 814 — with Austin Warren at 160 BF against 128 games (1.2500) ranked and Matt Strahm at 161 against 129 (1.2481) not, which is also what rules out flooring the threshold. `pa >= 2.1 × G` reproduces 636 of 637 batters; the one miss is Savant disagreeing with itself at the margin, its `min=q` leaderboard carrying a 269-PA catcher its percentile card does not. **And its leaderboard qualifier and its player-page one are the same rule**, which was worth checking separately: `min=q` returns 247 batters and 354 pitchers against the card's 246 and 354.

**Per window, which comes free from expressing it per team game**: a 7-day board asks for 2.1 PA against the five or six games that club finished inside the window — a bar of 12 to 14 PA — rather than against the season. Measured on the live 7-day board: 271 of 406 batters qualify, the lowest at 12 PA, and a 16-PA batter on an eight-game club misses where a 13-PA batter on a six-game club clears. A rate per team game is the only form of a qualifier that survives being scaled to a span.

There are **three rules, because one number cannot serve all three roles**. A batter qualifies on 3.1 plate appearances per team game and a **starter** on one inning — MLB's own figures, `Math.floor` being what reproduces them (162 games is a 502 PA qualifier, and 3.1 × 162 is 502.2). A **reliever qualifies on appearances**, one per three team games, because the innings rule excludes *literally every one of them*: it asks for 117 innings and the hardest-worked reliever in the league has 59, so the RP tab with the filter on was an empty table. Innings are also the wrong measure of a reliever's season — the most-used arm in the league has 62 appearances and 47 innings, a matchup lefty whose value is in how often he is asked rather than how long he stays. The appearance rule yields ~4.3 qualified relievers a club (128 of 520), a settled bullpen core rather than everyone who has warmed up. Which rule applies turns on **`ResearchRow.starter`**, computed here rather than in the client so the SP/RP pills and the qualifier cannot disagree about who is a starter — which is now the *only* live reason `starter` is a server field, the pills being its other reader and the qualifier having lost its own. Note **Savant's `min=q` is not any of this** — it is Savant's own 2.1 PA/game convention on the batting boards and a batted-ball minimum on the pitching ones, so it is no use as a cross-check.

**FIP and xFIP** are computed here, off the same `fipLike`/`ipToOuts`/`LEAGUE_HR_PER_FB` in `leagueRates.ts` that the pitcher card's season line uses — so the constants have one definition in the codebase and a pitcher's numbers read the same on the board as on his card (both null under three innings, which `fipLike` enforces itself). xFIP is the interesting one: the card gets its fly-ball count from that pitcher's own season CSV (`getSeasonArsenal`'s `BattedBallMix`), which has no league-wide equivalent, but the **custom leaderboard carries `flyballs` and `popups` as counts** — and `fly_ball + popup` is exactly what `BattedBallMix.fly` sums, so the two sources agree to the hundredth (checked: Alcantara 4.09 and Sánchez 2.53 on both). It is therefore computed in `enrich` rather than beside FIP in `buildBase`, since the count is Savant's — a failed custom board costs xFIP and leaves FIP standing. xERA remains the one estimator read rather than computed, being Statcast's own model. The Statcast half is **three** Savant CSVs per kind, each fetched in its **own `try`**: `expected_statistics` (xBA/xSLG/xwOBA, plus xERA on the pitcher board), one `custom` board (`CUSTOM_COLUMNS` — EV, launch angle, barrel%, hard-hit%, sweet-spot%, the GB/LD/FB split, whiff%, chase%, first-pitch-strike%, bat speed and sprint speed), and `batted-ball` (pull air rate, below), all at `min=1` so a qualified-only default can't drop most of the league. Every one of those columns was checked to come back populated on both boards before being added — `max_hit_speed` and `avg_hyper_speed` come back empty and are not requested, and `sprint_speed` is empty on the *pitching* board, which needs no special case since `cell` resolves a blank to null. The storage key carries a **`-v10`** (it was `-v4` when this passage was written, and has been bumped for every field added since — `teamId`, which is what the board draws a club's cap logo from, then `pullAirRate` at v8, v9 for that same field starting to carry a value on a *window*, and v10 for `batSpeed`, and **v11 for `qualified` changing meaning and gaining a reader**): a stored blob deserializes with every field added since it missing, so a stale one would quietly cost each row its FIP and its whole discipline group for six hours — and a field that has just started having a value is the same fault wearing a `null`, which is what v9 answers. Bump it whenever a field is added **or begins to be filled** — **or begins to be read**, which is v11 and is the sharper reading of the same rule. `qualified` is byte-for-byte the boolean it always was; what changed is that it now answers Savant's question instead of MLB's, and that something finally reads it. A v10 blob would deserialize perfectly and rank the whole league against the wrong population for six hours after the deploy. **No other blob needed a bump for this.** The percentile card's own blobs are untouched — that surface takes Savant's `percent_rank_` fields and already ranks within Savant's qualified population by construction — and nothing else stores a `ResearchRow`; `getPlayerWindows` has no blob of its own and reads the five boards through `getResearch`.

**Pull air rate is the fourth column here and the first to come off a *third* board, and the negative result that put it there is worth recording so nobody repeats the probe.** The obvious move is to append `pull_air_rate` to `CUSTOM_COLUMNS` beside the batted-ball split it belongs with, and it does not work: the `custom` leaderboard **accepts the selection and returns an empty column**. Measured on the batting board at `min=100` — 420 rows, `barrel_batted_rate` populated 420/420 beside `pull_air_rate` and `air_rate` at **0/420** — so the one-line version compiles, fetches, joins and yields a column of dashes on every row, which is the failure mode this file's own "checked to come back populated" rule exists to catch. What does carry it is **`leaderboard/batted-ball`**, the board `percentiles.ts` already fetches for its `RANK_FALLBACK` (`air_rate` and `pull_air_rate` are two of the three metrics that table ranks), so this is a URL the codebase already knows rather than a new upstream to reason about. It answers for **both kinds** (`type=pitcher` checked: 798 rows, populated on every one, where a pull-air rate *allowed* is a real pitching stat) and keys on **`id`** where the other two boards key on `player_id` — the one trap in the join. It publishes a **proportion** where the column prints a percent, hence the ×100, exactly as that `RANK_FALLBACK` entry's `scale: 100` already does for the same field.

**Checked against Savant's own published board rather than spot-checked**: every row of both, **627 of 627 batters and 798 of 798 pitchers exact to machine precision**, with 0 ids on one side and not the other in either direction. On the board, 627 of 700 batting rows and 798 of 799 pitching rows carry a value — the remainder being men with no batted ball tracked, which `cell` resolves to null and the client dashes. **The MLB half throwing fails the request** — without it there is no table — while the Savant half failing empties only its own columns, the rule the percentile card's leaderboards already follow. Cached in memory and in the storage tier for 6h, keyed by **kind and window**, with an `inFlight` map so a cold Lambda doesn't send three upstreams at once, and pulled warm nightly by `warmer.ts` (nothing else would — it belongs to nobody's roster).

**The board has a second reader, and it reads it whole.** `getPlayerWindows(playerId, kind)` fans `getResearch` across all five windows and picks out one player's row from each — which is the player page's **Stats** tab, the board transposed onto one man (see **Client**). It is deliberately five reads of this file rather than a per-player upstream of its own: every number on that tab is then the board's own row, so FIP's constant, xFIP's fly-ball count, the qualifier's rules and the whole Statcast join have one definition rather than two that can drift. It costs nothing upstream — the warmer pulls all ten boards nightly and each is cached six hours here and in the storage tier, so the ordinary call is five map lookups (measured: 1.0ms warm, 13.9ms from the blobs in a fresh process, 4.8KB of response). A window the player does not appear on comes back **null rather than a zeroed row**, absence and a scoreless week being different facts.

**The board reads a window as well as the season** (`ResearchWindow` — `'season' | 7 | 15 | 30 | 60`), and the two halves get there by very different routes. The traditional half just asks MLB for a different span: `stats=byDateRange` takes `playerPool=ALL` and still returns a traded player once carrying his current club, so nothing downstream has to know which it asked for. **The Statcast half has no such endpoint.** Savant's `expected_statistics` and `custom` leaderboards take a `year` and *ignore* every date-range spelling there is — checked, the CSV comes back byte-identical — and the pitch-level `statcast_search` export that does take a range caps at **25,000 rows**, which a league-wide week (~30,000 pitches) silently exceeds. So a window is built the only way that stays correct: **one day at a time**, in `statcastWindow.ts`, from the same per-date CSV `savant.ts` already downloads and keeps forever, reduced immediately to per-player counts. The *counts* are what's cached, not the CSV — a day is ~3.3MB of text and ~2KB of counts, so a 60-day board sums sixty small blobs instead of re-parsing 200MB every six hours. One file feeds both boards, every pitch row carrying a `batter` and a `pitcher` id. Everything accumulated is a **sum, never a rate**: rates don't add, and averaging sixty daily barrel rates would weight a one-ball afternoon like a four-hit night.

**Bat speed is the one column here whose published figure is not a mean over everything tracked, and so the one that could not be assembled from two running sums.** Savant averages **competitive** swings: bunts out, and then the **slowest 10% of that player's own swings** dropped. That is a percentile of a distribution, which is exactly the shape `statcastWindow.ts` is written not to carry — everything in it is a sum, because rates don't add and a percentile adds even less. So a day stores the **distribution** as well as the sum: `StatcastCounts.swingBins`, one bin per whole mph, which adds across days like every other count; `reduce` walks the summed bins from the bottom, drops the slowest 10%, and subtracts their contribution from the exact sum using each bin's midpoint. Only the swings actually thrown away are approximated and the retained ones keep their real values — measured, that is **free**: against Savant's own season board, reconstructed from all 139 daily exports, the histogram scores a **median error of 0.1 mph, p90 0.2, max 0.9** over the 480 batters with 100+ swings, which is *identical* to keeping the exact swing list. One-mph bins are therefore as good as any finer grid, and they cost **~8.5KB gzipped a day** against the counts blob's own ~13KB (measured on two real days: 18,396 → 26,601 bytes and 16,581 → 24,007). `statcast-counts-{date}-v4` is that field arriving; a bump here costs a re-parse off the day CSVs this file keeps forever, not a re-download.

**The rule is Savant's, applied to the window rather than read from it.** They publish no windowed bat speed, so there is nothing to check a 7-day figure against and nothing being estimated: "the slowest 10% of his swings *in these seven days*" is the honest analogue of what their season number means. **The drop count rounds half-up** (`Math.round`), which is a fit rather than a convention — against their board, rounding reproduces **313 of 630** batters exactly where flooring reproduces 290, with the same 0.1 median either way. Two other rules were tried and beaten: an absolute floor (`> 62 mph` is closest, median 0.3) and a share of the player's own maximum (`>= 75%`, median 0.3), against the percentile rule's **0.1 with 290–313 exact**. And the *season* column is not any of this — it is Savant's `avg_swing_speed` read straight off the custom board, so it is exact on every row by construction and was checked to be: **630 of 630 batters and 755 of 755 pitchers**, 0 ids on one side and not the other.

**`swing_length` was the obvious column to add beside it and is a repeat of the `pull_air_rate` dead end**: the custom board accepts the selection and returns an **empty column**, 0/420 on the batting board at `min=100` beside `avg_swing_speed`'s 420/420. It is in no export and on no leaderboard, so it is not asked for.

**Two** of the board's Statcast columns are **absent by nature** on a window rather than by failure — `sprintSpeed` is a separate measurement that never appears in a pitch row, and `xera` is Statcast's own model — and both stay null, which the client dashes like any other missing value.

**`pullAirRate` was a third of them and is now a real number on a window**, and the whole of the passage below is kept because the dead end in it is still a dead end and the thing that opened it is a *general* trick worth knowing. What this file used to say was: *the day export carries `hc_x`, `hc_y` and `stand`, so a pulled air ball looks derivable — take the spray angle off the landing coordinates (`atan((hc_x − 125.42) / (198.27 − hc_y))`), flip its sign for a left-handed batter so one bucket means "pull" for both, and count the batted balls past some boundary that are not ground balls.* Reconstructing the whole season from the 138 cached daily CSVs gets the *population* exactly right — **627 batters and 798 pitchers, the board's own row counts**, with `bbe` exact on 606 of 627 — and then fails on the **classification**. That measurement stands and has been sharpened. Fitting a threshold, pull *air* rate is closest at **16.1°** (median error 0.585 points, p90 1.44, max 3.60 over the 359 batters with 100+ batted balls) while pull *ground-ball* rate wants **20.1°** and bottoms out at 2.03 points; fitting the coordinate origin as well (a 10 × 12 grid around the usual 125.42 / 198.27, the threshold refitted at each point and the two scored jointly) does no better, 0.985 + 1.261 at its best.

**Asked as a feasibility question rather than as a fit, it is not close.** Sorting each player's batted balls by spray angle and asking where the boundary would have to fall for Savant's own pull *count* to come out — which either has a solution or provably has none — the constraints **intersect empty on both boards, by tens of degrees**: the pull threshold must be simultaneously `> 51.17°` and `<= 11.77°` over the 235 batters whose `bbe` we reproduce and whose every ball has coordinates, and `> 34.83°` and `<= 0.31°` over 348 pitchers. **Ground balls are what wreck it**, and the reason is plain once the labels are in hand: their `hc` coordinates are where the ball was *fielded* rather than where it was hit. Against Savant's own labels for one day, its pulled ground balls span **−15.5° to 175.6°** and its straightaway ones **−47.7° to 92.9°** — 319 of 320 pulled balls sit below the largest straightaway angle, so the two are not separable at any angle. Air balls very nearly are (pull 15.9°–49.8°, straightaway −26.1°–27.4°), which is exactly why fitting them alone looked so nearly good.

**Two other routes were probed and both are dead.** `leaderboard/batted-ball` — the board the season column comes off — **ignores every date-range spelling there is**, checked byte-identically against `start_date`/`end_date`, `startDate`/`endDate`, `game_date_gt`/`game_date_lt`, `game_date_start`/`game_date_end`, `date_start`/`date_end`, `month` and `hfMo`: 627 rows and the same md5 every time, exactly as `expected_statistics` and `custom` already do. And it publishes **rates only** — no counts, so nothing on it sums over days; the underlying `num_bbe` is in the page's embedded JSON but the rates are per-season regardless.

**What answered it is the field Savant actually classifies on, which is what the old passage said to go and find.** It is the Hawk-Eye **launch direction**: the Statcast Search page carries two commented-out chart options, `api_h_launch_direction` and `api_h_launch_direction_pullopp` ("Launch Direction Pull/Opp"), and it is in no export — the per-date `statcast_search` CSV's 119 columns do not include it, and neither `chk_batted_ball_direction` nor any `chk_*` spelling adds one (checked: the detail CSV comes back byte-identical, 119 columns, with any of them set). **What is reachable is the filter built on it.** The search's own filter set names it `hfPull`, with values `Pull` / `Straightaway` / `Opposite` — so the same per-date export this file already downloads, asked for `hfPull=Pull|`, returns precisely the batted balls Savant files as pulled. It **partitions exactly**: on 2026-08-01 the three directions return 320 + 266 + 195 = **781 rows, which is the day's batted-ball count in the unfiltered export**, disjoint by `game_pk`/`at_bat_number`/`pitch_number` with 0 rows on one side and not the other in either direction, and every returned row carries a `bb_type`.

**So a window's pull air rate is Savant's own classification summed a day at a time**, exactly as everything else here is: `savant.ts::downloadPullCsv` fetches and caches `cache/{date}-pull.csv` beside the day's own CSV (~280KB against 3.1MB, kept forever on the same "a finished day is a fact" rule), and `statcastWindow.ts::addPull` counts the non-ground-ball rows into `StatcastCounts.pullAir`. The denominator is **`pullBip`**, copied from `bip` rather than counted, since the pull export is a subset of the very rows `bip` was tallied from — which also gives a player with no pulled ball his denominator, and gives a day whose pull export *failed* a `pullBip` of 0, so that day drops out of both halves rather than diluting the numerator. A failed pull read costs one column and is logged; the day's other fifteen stand, and the day's counts are **not cached** so the next reader retries the small request rather than being stuck with an undercount for ever. It costs one extra request per day per lifetime — nothing on a warm board, and 60 small requests on a genuinely cold 60-day one.

**Checked against Savant's published season board the way the four columns beside it were**, by reconstructing the whole season from the 138 daily pull exports and comparing every row: **median error 0.000 points, p90 0.000, on both kinds** — exact on **606 of 627 batters and 785 of 798 pitchers**, with a worst case of 1.40 points (Stanton) and 0.70 (Keaton Winn). Every non-exact row is one whose `bbe` we already do not reproduce (606 of 627 batters, 787 of 798 pitchers — the same denominator discrepancy `barrelRate` and `hardHitRate` have always carried and which is why *their* median is 0.000 too), and 0 ids appear on one side and not the other in either direction. **And the windows were checked against an independent recompute** over the same day files, player by player, off the running server: `batter 7d 395 players`, `pitcher 7d 421`, `batter 15d 432`, `batter 30d 480`, `pitcher 30d 555`, `batter 60d 536`, `pitcher 60d 657` — **0 mismatches on every one**. `qualified` is scaled to the window: the standings carry a season total and nothing else, so `getTeamGamesInRange` counts finals off the schedule per team (no two clubs play the same number over thirty days — 22 to 25 on a checked month), and the same three rules then apply to it. (Unread, as above — the schedule call is what a windowed board pays for a flag nothing renders.)

**The computed numbers were checked against Savant's published season board**, by reconstructing the whole season from the daily exports and comparing 416 batters and 94 pitchers: barrel%, hard-hit%, whiff% and chase% all land on a median error of **0.000**. EV and LA did not at first — they ran systematically light, 0.76 mph and 0.5° — and the cause is worth keeping: **Savant leaves bunts out of the EV and LA averages but keeps them in the batted-ball denominators**, which is exactly why barrel% and hard-hit% matched while the means didn't. Excluding them takes EV's median error from 0.299 to 0.027 mph. There is no bunt column in the export (`bb_type` files a bunt as an ordinary ground ball), so the play description is the only signal there is. Bumping `StatcastCounts` means bumping the day blob's version, which holds sums and would otherwise keep serving pre-fix numbers — `-v2` for that bunt fix, and `-v3` since `pullAir`/`pullBip` joined it.

A third source: `server/src/percentiles.ts` **scrapes the Savant player page** for the percentile-ranking card, parsing the `serverVals.statcast` blob embedded in the HTML. The `SECTIONS` table maps each displayed row to its `percent_rank_*` (0–100 rank) and raw-value fields; metrics where lower is better carry `lowerBetter` (only used by the estimated-percentile fallback — Savant's own `percent_rank_` fields already bake direction in). Cached on disk; the current season re-scrapes every 6h, past seasons are immutable — with a `CARD_VERSION` stamped on each stored card, since a past season's is otherwise kept forever and would keep being served in the shape it was scraped in. **Every expected stat carries the actual it estimates directly above it in its section's table** — that adjacency is what the client collapses into one dumbbell row (`EXPECTED_OF`, actual first), so the pitcher card's xwOBA/xERA/xBA/xSLG each reveal what he really gave up on hover or tap. The batter card's rows are grouped the way the pitcher card's are — **Value, Batting** (the slash line, each stat beside its expected twin, closing on BABIP), **Batted Ball, Swing** (bat tracking), **Plate Discipline**, then Vs Pitch Type / Running / Fielding — rather than the one long Batting section that used to hold everything from wOBA to strike-zone judgment; the client renders whatever sections it's handed, so this is a server-side table alone. Rows the page shows but doesn't rank are ranked against a leaderboard instead — `BATTER_COMPUTED` (**HR**, ahead of xHR in Batting, and **Fast Swing %**, after Bat Speed in Swing — each with its own board, hence its own builder), and on the pitcher side every entry in `PITCHER_COMPUTED` (**ERA**, **HR**, first-pitch strike %, edge %, meatball %, swords, HR/FB), each declaring the section it splices into and, for an actual with an expected twin, the key to sit ahead of. Their population is not everyone who threw a pitch — Savant publishes the size of the one it ranks within as `n` beside each metric in `metricSummaryStats`, and taking that many pitchers off a leaderboard in PA order reproduces its own xERA/xwOBA/BA ranks to the point, which is the check that the slice is right. Two boards feed them (`POP_COLUMNS`): expected-statistics for ERA, and one custom-leaderboard call for everything else — each fetched in its own `try`, so a board that fails costs only its own bars a percentile. **HR/FB is derived, not read**: that board prints the rate as an empty column, so it's recomputed from the `home_run`/`flyballs` counts it does carry.

**The unqualified player is the case the card is *for*, and five of its rows used to go blank on him.** A part-season hitter has no `percent_rank_` on almost anything, which is exactly why the estimated-percentile fallback exists — a z-score into the normal CDF off the league mean and stddev Savant embeds as `metricSummaryStats`, drawn with a dotted bubble so the card says whose rank it is. Checked against Savant's own ranks where both exist (133 metric/player pairs over two qualified batters and two qualified pitchers) that estimate lands on a **median error of 1 percentile point**, 3 at the 90th and 16 at its worst (Henderson's OAA, whose league distribution is the least normal thing on the card), so the fallback is sound and the dotted bar is worth drawing. What it could not cover is a metric that blob has **no entry for at all**: the batter page carries a `percent_rank_` for 67 metrics and summarizes 56 of them, the pitcher page 67 and 48. Five of the missing ones are rows these cards show — **Pull Air %**, **Air %**, **Basestealing Runs** and **Extra-Base Runs** on the batter card, **Blast %** on the pitcher card — and for those the estimate had nothing to work from, so the row kept its value and simply lost its bar. Measured on a real call-up: George Lombard Jr. (24 PA) got 34 bars over 38 rows where Gunnar Henderson (545 PA) got 39 of 39, and Quinn Mathews (5 IP) 42 of 43 against Cristopher Sánchez's 43 of 43 — one bare track per section on the very cards that are read to decide whether a stranger is worth picking up. Note where the fault was *not*: nothing was dropped, no section collapsed, no cached card was stale (`CARD_VERSION` already re-scrapes a card built by an older shape) and the client draws whatever it is handed — a null percentile renders as the label, an empty track and the value, which is precisely what was on screen.

**Three of the five are now ranked against a leaderboard** (`RANK_FALLBACK`), the same answer `PITCHER_COMPUTED` reaches for the rows Savant ranks for nobody, and keyed by the metric's **raw** field exactly as `metricSummaryStats` is — so a row opts in without `MetricDef` gaining a field. Two boards carry them: `leaderboard/batted-ball` has `air_rate` and `pull_air_rate`, and `leaderboard/bat-tracking?type=pitcher` has `blast_per_swing`, each a proportion where the page prints a percent and each **identical to the page's own figure** once scaled (checked: Henderson 55.1 / 24.4 and Sánchez 10.3 on page and board alike). The population is the thing that has to be got right, and it is the same trick the pitcher board already uses: rank within the `n` busiest players rather than the whole board, `n` read off a **summarized sibling from that same board** — `groundballs_percent` (248) for batted ball, `avg_swing_speed` (214) for bat tracking. Against Savant's own ranks for players it did rank, over 40 qualified batters and 30 qualified pitchers, that reproduces **Air % to a median of 2 points (max 3), Pull Air % to 1 (max 2) and Blast % to 1 (max 2)**; ranking within the whole board instead — 624 batters and 794 pitchers — takes those to 5, 7 and 5 with a worst case of 14, so the slice is doing the work rather than decorating it. The bars are marked `estimated` and drawn dotted, which is the rule for the whole scraped table: **solid means Savant ranked this player, dotted means we did.** The boards are fetched **only when a row that needs one is actually un-ranked on this page** (`neededRankBoards`), so a qualified player's card costs no new request at all, and each is in its own `try` — a board that fails costs its own bars and nothing else.

**Basestealing Runs and Extra-Base Runs are deliberately left bare, and the reason is the units.** Savant summarizes neither and the page prints each as a **whole run**, which is too coarse a number to rank: measured against the 242-man `baserunning-run-value` board, a printed `0` of Basestealing Runs spans the **26th to the 70th** percentile and a printed `1` of Extra-Base Runs the **52nd to the 86th**, so a bar drawn from it would sit up to 22 points from the truth — and ranking the printed value does exactly that, reproducing Savant's ranks to a median of 14 and 16 points with a worst case of 44, against the 1 and 2 of the three rows above. The unrounded figure exists only on that board, which lists nobody unqualified, so there is no way to do better. A value with no bar is the honest reading and the row's tooltip now says so (`no league rank published for this stat`, where it used to say `no data` over a printed number). The card gained bars, so `CARD_VERSION` is **5**.

**Traded players.** A hydrated `stats(...)` group comes back as one row **per stint** plus a season-wide one, and the aggregate is the row carrying no `team` — it leads in the `season` group but *trails* its own stints in the vs-L/R group, so position can't be the test. `mlbStats.ts::preferSeasonWide` picks it (falling back to the first stint row if nothing is team-less, so an unfamiliar shape still yields stats). Taking whichever row came last — what both parsers used to do — showed a traded player only his new team's numbers, i.e. a season that appeared to reset on trade day.

**A game that never happened is `postponed`, and a cancellation is one of those.** `mlbStats.ts::isPostponedStatus` is the day path's test for "this date's game was not played", and it read only MLB's *postponement* — `codedGameState 'D'` / a `Postponed` label. MLB has a second such state and spells it differently: a cancellation is `codedGameState 'C'` / `Cancelled`, measured on gamePk 831608, whose schedule status reads `('Final', 'C', 'Cancelled')` and whose feed reads `('Final', 'C', 'Cancelled: Rain')`. Both states report `abstractGameState: "Final"`, so `isFinalFeed` claims either one, and a cancelled game was filing as a real Final with no score — the same error `schedule.ts::stateOf` names as the one that would make the per-row game count lie, in the code path that one does not cover. `Cancelled` is **MLB's own spelling**, a value off the wire; Americanizing it silently stops the test matching, which is the standing rule for every wire value in this repo.

**What it cost, measured, was nothing yet — and that is the reason to write it down rather than to skip it.** Of the 2,458 games of the 2026 regular season, **27 are `Postponed` and 0 are `Cancelled`**; the cancellations MLB is carrying this year are spring-training games, and `getGamesForDate` asks for `gameTypes=R`. So this was a latent fault the day it was found, reachable only by a regular-season cancellation — which is a real MLB state, most often a late-season game that no longer affects the standings. The fix costs two comparisons and closes it before there is a row on screen to be wrong.

**`Suspended` is deliberately *not* in that set, which is where the two tests genuinely differ.** `stateOf` buckets a suspension with the postponements, and is right to: it answers a *forward* question — whether the schedule grid has a game to plan around — and a suspended game is not one. `isPostponedStatus` answers a backward question about a date already played, and a suspended game **was** partly played. Its feed carries real plays, and `savant.ts` pushes every batter's and pitcher's line out of it whatever this test returns — the postponed branch there rewrites only the *status*, never the stats. Calling it postponed would print "did not happen" over a row whose numbers are counted anyway: the same lie as the cancellation bug, pointing the other way. 0 games of the 2026 regular season carry `Suspended` (a suspension resolves to `Final` or `Completed Early` on resumption), so this costs nothing today either, and it is recorded because two tests that look almost alike are what invite somebody to align them.

**Neither function imports the other, and the reason is a cycle**: `schedule.ts` already imports `mlbStats.ts`, so folding them would close one. They are restated, each names the other, and each carries the reasoning — change one and read the other.

### What an average plate appearance is worth, measured nightly

**The rolling-xwOBA chart draws a reference line, and for its whole life that
line was `const LEAGUE_XWOBA = 0.315`** — a benchmark, with a comment admitting
as much ("wOBA is calibrated to the league OBP scale, so this sits ~.310–.320
year to year"). It is a good benchmark and a poor measurement: the 2026 season
to date is **.3149 over 140,028 wOBA events**, so the constant is right to a
thousandth for the year and wrong by a fifth of that *within* it — reduced by
month, the same season runs **.3241 in April and .3071 in August**. A chart read
in August was comparing a hitter against a league that stopped existing in the
spring, and nothing on the page said the number was a guess at all.

**`server/src/leagueWoba.ts` measures it from the days the app already holds.**
Every wOBA event of the season is in the per-date Savant exports `savant.ts`
downloads and keeps forever, and `statcastWindow.ts` already tallies the two
numbers this needs while building the research board — `paDen` (the wOBA
denominator) and `xwobaSum`. So this is a **second reader of that tally** rather
than a second pass over the same CSV, which is the rule that file already
follows for the two boards it feeds; `countsFor` was renamed `dayCounts` and
exported for it.

**The batter side and the pitcher side are the same number**, so one figure
serves both charts — the pitcher's series being xwOBA *allowed*. Every plate
appearance has exactly one of each, so the two sums count the same events:
checked on three days, **identical PA counts and a difference of 1.7e-16 or
less** in the average (2026-08-07 `1120 / .304905` on both sides, 07-04 `1123 /
.317818`, 04-15 `1099 / .328411`).

**Nothing on the read path builds it, which is the whole of the split.**
`getLeagueXwoba()` reads a blob and answers null if there isn't one;
`buildLeagueXwoba()` is the nightly job, and `warmer.ts`'s backfill is its only
caller. A chart opening must never be the thing that reduces 142 days of
Statcast — measured, that build is **53.8s the first time** (the days with no
counts blob yet) and **under 0.1s** thereafter, off 142 tiny per-day blobs.

**Stored a day at a time, so a run that dies leaves its work behind.**
`league-woba-{date}-v1.json` is two numbers — **111 bytes** against the 25KB
counts blob they are reduced from — written for every settled day and read back
with no freshness test, the rule `statcast-counts-{date}` itself follows. The
season blob `league-xwoba-{season}-v1.json` is one object (`xwoba`, `pa`,
`through`, `days`) and is what the route reads, memoised 30 minutes. Today's day
is never stored, its games being unfinished — the same exception
`statcastWindow.ts` makes.

**Yesterday is the last day counted**, `windowDates`' own boundary and for its
reason: Savant lags the live feed by a day. **March rather than opening day** is
the start, `teamHitting.ts`'s rule — a spring date reduces to an empty day, so
this file needs no fixture list and **no season constant**, the year coming off
`baseballToday()`. The count `CLAUDE.md` keeps is still nine.

**Validated against an independent sum of every day CSV on disk**: summing
`woba_denom` and `estimated_woba_using_speedangle` straight out of all 142
exports gives **.3149 over 140,028 events**, which is what the module returns —
exact, as it must be, both being the same rows added up two ways.

**The fallback is the old constant and says so on the wire.** An installation
whose nightly job has not run gets `.315` with `leagueXwobaPa: 0`, which is what
the chart's legend reads to tell a measurement from a benchmark (see **Client —
the player page's reading tabs**, *The league average is a legend*). Note the
two round to the same three decimals today — `.3149` prints as `.315` — so what
this changes on screen this week is the tooltip and not the line; what it
changes next April is the line.

### Report join keys

- Stats API at-bats ↔ Savant CSV rows: `at_bat_number == atBatIndex + 1`.
- Players are matched by MLB id, with a **fallback to `savantName`** (`toSavantName` in `names.ts` converts "First Last" → "Last, First") if the id isn't present that day.

### Caching (multiple layers; `server/data/` locally, S3 when deployed)

**All cache reads/writes go through `storage.ts`** — `readBlob`/`writeBlob` (text), `readGzipBlob`/`writeGzipBlob` (gzipped, `.gz` suffix applied internally), `readJsonBlob`/`writeJsonBlob` (JSON + a `cachedAt` stamp with a caller-supplied freshness test). It writes to `server/data/cache/` by default, or to S3 under a `cache/` prefix when `CACHE_BUCKET` is set. Key names are identical either way. **No module outside `storage.ts` should touch `fs` for cache purposes.** Cache reads degrade to a miss and cache *writes are logged and swallowed* — a failed write must never fail a request that already has its answer.

- `cache/{date}.csv` — Savant CSV, downloaded once per date, kept forever (delete to refresh).
- `cache/{date}-pull.csv` — **the same date's export filtered to `hfPull=Pull|`**, on the same terms and for the same reason: a finished day's pulled batted balls are a fact. It is the one thing that makes `pullAirRate` derivable on a window at all (see above), and it is small — **~280KB against the day's own 3.1MB**, so ~17% more cache for the season. One consumer, `statcastWindow.ts`, whose counts blob is the ordinary cache; this file exists so that bumping *that* version reparses off disk rather than sending 60 requests back to Savant, which is exactly why the day CSV beside it is kept.
- Stats API responses cached via `storage.ts` **and** in-memory.
- `day-{date}-v{N}.json.gz` — **a whole finished day as one gzipped object** (`DAY_SNAPSHOT_VERSION`, currently 9). Written by `getDay` once every game that day is final **and settled** (see *The last out is not the last word*); on a later cold read it replaces the schedule fetch + ~16 per-game reads + the CSV with a single read. Two things in it are `Map`s and so need explicit conversion (`JSON.stringify` turns a Map into `{}` silently): `ParsedDay.reports`, and each `DayGame`'s `homeStarters`/`awayStarters` — that second one is what v2 fixed. v3 added the pitching role each game carries, the line's win/save/hold credits, and the opposing team id (see **Pitchers on the watchlist**); v4 fills `probablePitcher` on a *pitcher's* own game — the opposing announced starter, which the builder used to leave null — for the summary table's opponent column; v5 gives each `BaseEvent` its clip, description, matchup and count, which a v4 snapshot has none of and would go on serving as a bare badge forever; **v6** is the rest of the base-event vocabulary — the eight kinds past stolen base and run, a pitcher's own copy of the ones he was a party to, and the situation each happened in (`onBase`, `runnerName`, `atBatNumber`, plus `awayScore`/`homeScore` on a `PlateAppearance`). Everything v6 adds is *derived* rather than newly fetched, which is exactly why the bump is needed and a `FEED_CACHE_VERSION` one is not: the raw fields it reads — `movement.start`/`end`, `runners[].details.runner.fullName`, `playIndex`, `actionPlayId`, the scores — were all already in `FEED_FIELDS` (leaf-matched, so `runner.fullName` and `result.awayScore` arrive without being named under their parents), so every cached final feed can answer for them, while a v5 snapshot holds the finished model and would go on serving a day with no balks in it. **v7 adds nothing at all and is a bump on *meaning***, the arsenal blob's own `-v5` reason: the plays MLB files under the batter who was up but which are not his plate appearance — a caught stealing, a pickoff, a runner thrown out at the plate — no longer become one (`mlbStats.ts::isPlateAppearance`), and a v6 snapshot has those rows baked into its reports, so it would go on drawing an `OTHER OUT` card in the feed under a batter who never made an out and counting it in his line. Measured before the bump: seven such plays in the 672 distinct games the cache holds, every one of them one at-bat high against MLB's own game log for that player and day. **v8 puts the sacrifice fly on every batting line** — a field a stored day is read straight back out of, so a v7 snapshot deserializes with `line.sf` undefined and the OBP denominator divides by `NaN`; see *The sacrifice fly* below for why it is the only blob that needed the bump. It doubles as the discard that heals a day frozen over an unwritten box score, there being no v8 snapshot anywhere yet. **v9 stamps the day with `builtAt`, the moment it was built from the wire** — the field `revisions.ts` compares a reported rescoring against, and the one thing that keeps *every* day from being rebuilt once for nothing (MLB writes to a game after the last out as a matter of course, so the change feed names most of a slate the night it is played). A v8 snapshot deserializes without it and reads as `builtAt: 0`, which is safe — older than any revision, so rebuilt the first time MLB names its date — but it is a field read straight back out of the blob, which is the test this file applies. See *Official scoring moves, and MLB says which games moved*.
- `mlb-revisions-v1.json` — **which finished days MLB has rescored and this app has not rebuilt yet**: a `since` stamp and a map of baseball date → the `gamePk`s waiting, a few hundred bytes at rest and empty most of the time. What it is reduced *from* is `game/changes?updatedSince=`, so this is the rule `espn-period-anchor` and the RotoWire index follow — store the answer, not the payload. Polled at most once per **30 minutes**, and a cold process **adopts a stamp younger than that instead of polling**, which is what keeps the rule off the cold path: measured on a 7-day `/api/report` served entirely off snapshots, **228/212/207ms adopting against 226/216/204ms before the rule existed, and 681ms for the one process that has to poll**. Cleared by the *rebuild* rather than by the poll, or a revision reported to a process that then died would never be reported again. See *Official scoring moves* below for the whole of it.
- `espn-lineup-{leagueId}-{teamId}-{period}-v2.json` — **one finished day's fantasy roster**, slot by slot (~5,170 bytes; 61 days of one team come to 488KB). Written only for a period strictly before today's and read back with **no freshness test**, on the same reasoning as the day snapshot above: you cannot retroactively start somebody in a game that has been played, nor retroactively have held him. Today's and any future day's are mutable and stay in memory on the ownership map's ten minutes. **v1 was the day's lineup alone, a bare list of MLB ids at 176 bytes**, and the bump is what stops one deserializing as a roster of nobody; the lineup is now derived from the roster rather than stored beside it, so the two cannot disagree about a day. See **ESPN fantasy league**, *A range is a range of rosters*, for why a range needs one of these per day and what the thirty-fold growth costs (nothing measurable — the time is ESPN's).
- `espn-period-anchor-{season}-v2.json` — **one `{ period, date }` pair, 67 bytes**, reduced from ESPN's 850,891-byte `proTeamSchedules_wl`. It is what turns a calendar day into an ESPN scoring period, and it exists because doing that off ESPN's *current* period plus `baseballToday()` was wrong for the hour and a half each morning between our 3am rollover and ESPN's nightly batch. The payload is **cookie-free and static for the season**, so this is one read shared by every league and every user — the class `getPlayerPool`'s player list is in — and what is cached is the pair rather than the 0.81MB it came out of. Keyed by season on a **30-day** window in memory and in the storage tier; a season's schedule does not move. **The `-v2` is a bump that has outlived its field**: it was the All-Star break riding along with the pair, which the Rankings tab's two halves used to be cut on and which nothing reads since they became an even division by matchup period — a stored v2 blob simply carries two numbers this shape ignores, and re-bumping would spend the 850KB again to learn the same pair. The derivation never rejects (it answers with the pair or with null, the fallback being ESPN's own pointer), because the caller names a period in each of up to 62 places at once. See **ESPN fantasy league** for the whole of it.
- **Nothing was versioned for `PlayerReport`'s `teamId`/`team`/`position`** — the club and listed position the summary table's identity block draws (see **Client**). They are filled by `getReport` alone, off `getRosterInfo`, whose own `playerTeamCache`/`teamRosterCache` are memory-only on a 30-minute TTL; the per-day reports a `day-{date}-v{N}` snapshot holds carry nulls for all three and **nothing reads them there**, `getReport` taking only `games` off a day and building the report itself. That is the test to apply before bumping `DAY_SNAPSHOT_VERSION` for a `PlayerReport` field: not whether the shape rides in the blob, but whether anything reads it back out of one.
- `rotowire-index-{SEASON}-v1.json` — **RotoWire's whole player list reduced to what the news scrape needs**: MLB id → the path of that player's RotoWire page, 1,375 pairs in **65,502 bytes**, on a 6-hour window in memory and in the storage tier with an `inFlight` guard. What it is reduced *from* is two cookie-free JSON tables (`player-basic-stats.php` at `pos=B` and `pos=P`, 611KB raw / 75KB gzipped between them), so this is the rule `espn-period-anchor` follows — store the answer, not the payload. It earns a blob where the news itself deliberately does not, and the split is the two rules this file already states: a **per-player** window onto something still moving is `nextGame.ts`'s case and stays in memory on 30 minutes, where a **cookie-free list shared by every player and every user** is `getPlayerPool`'s and `expectedStats.ts`'s. **The slug is what has to be stored, not the id** — a RotoWire player URL with the right number and a wrong slug 301s to `/baseball/`, and the bare number is a 404, so the address genuinely has to be looked up. It replaced `news-espn-{espnTeamId}-v1.json`, the club article feed the ESPN half of that section read, which went with the feed. See **Date handling and server routing** for the whole of the route, and **Client — the player page** for the probe record and the join.
- `news-recent-v1.json` — **who in the league has news today or yesterday**: MLB id → the day the newest item is stamped and its headline, ~25KB for the 285 players inside the window on a checked day. What it is reduced *from* is thirty RotoWire club news pages (~10MB of HTML, 2MB gzipped) plus one league-wide MLB transactions call, so this is the rule `espn-period-anchor` and the RotoWire index beside it both follow — store the answer, not the payload. On a **30-minute** window in memory and in the storage tier with an `inFlight` guard, which is `news.ts`'s own TTL and is that deliberately: the mark beside a player's name and the News tab behind it must not be able to disagree about whether a man has news. **The dates are stored and the levels are not.** A level (`today` / `yesterday`) is a fact about the day it was computed on, so a blob holding levels would go wrong at 3am whether or not anything in it was stale; holding the date and classifying at read time makes the blob mean the same thing whenever it is read, and makes the rollover self-correct with no refetch. See **Date handling and server routing** for the whole of the route, and **Client — the research board** for the mark it draws.
- `xwoba-*`/`arsenal-*` — `xwoba.ts` and `pitcherArsenal.ts` were memory-only; both now have a storage tier because each is backed by a *full-season* Savant CSV, and `getReport` pulls one arsenal per watched pitcher.
- `league-woba-{date}-v1.json` / `league-xwoba-{season}-v1.json` — **the rolling chart’s reference line, measured rather than declared**: two numbers a day (111 bytes) and one season total, both read back with no freshness test and built by the nightly warmer alone. See *What an average plate appearance is worth* above.
- **Live-game freshness:** a game for the current day is re-fetched via `diffPatch` deltas at most once per `LIVE_GAME_TTL` (10s); the parsed day is memoized with a `TODAY_TTL` (10min). Past dates are treated as immutable.
- `getSeasonPlayers` (roster for the add-player search) cached with a 1h TTL. It
  also carries **`bats` and `throws`** — see below.

### The sacrifice fly, and the one denominator in baseball that is not obvious

**On-base percentage divides by `AB + BB + HBP + SF`**, and a `BattingLine`
carried no `SF` at all — so `lib.ts::lineOps` divided by `AB + BB + HBP` and
every OPS in the app ran a hair high. It was documented as a known hair rather
than fixed, in both of the two places that computed it, which is how a hair
survives a year.

**Measured against a scoreboard that does it properly.** A fantasy manager's
eleven-day lineup read `.824` where ESPN read `.8221`; the whole of the gap is
two sacrifice flies — `143/428` here against `143/430` there — and adding ESPN's
own `SF: 2` back to our denominator reproduces its figure to four places. Across
five team-weeks of the live league, our OPS now agrees with ESPN's to four
decimal places on every one.

**It costs no upstream read.** A sacrifice fly is already an event on the plate
appearances the line is summed from, and `savant.ts::classifyHit` already had to
know about it to keep it out of the at-bats. **Probed before it was built on**,
which is this file's standing rule: over **305 player-games** of three fantasy
rosters, deriving `sf` this way reproduces MLB's own boxscore `sacFlies`
exactly, alongside AB, H, 2B, 3B, HR, TB, BB, HBP and PA — **one mismatch in
3,660 cells**, and that one a play MLB had rescored since we cached it (see *The
last out is not the last word*).

**Sacrifice hits are deliberately not on the line.** SH is not in the OBP
denominator and nothing in this app computes anything from it, so carrying it
would be a field nobody reads — the rule this file applies to
`teamProbablePitcher` and `NewsItem.url`. What the SH side *did* cost was an
at-bat, which is the next paragraph.

**`classifyHit` knew two of MLB's four sacrifice codes.** `sac_fly_double_play`
and `sac_bunt_double_play` are the same sacrifice with a runner thrown out
behind it; they fell through to the default and were charged as at-bats.
Checked against MLB's own boxscore rather than reasoned from the rulebook:
Ceddanne Rafaela's on 2026-08-10 (gamePk 822780) reads `PA 4 · AB 3 · H 2 ·
SF 1` and Chandler Simpson's (824970) `PA 5 · AB 4 · H 2 · SF 1` — each an
at-bat short of what we were giving them. Rare, and that is the argument *for*
the constant rather than against it: across the 1,442 game blobs on disk
`sac_fly` appears in 627 and `sac_bunt` in 365, against **3** for
`sac_fly_double_play` and **0** for `sac_bunt_double_play`. A miss that surfaces
twice a season is a miss nobody will ever chase out of a slash line.

**Which blobs needed the bump, and which did not.** `DAY_SNAPSHOT_VERSION` went
**7 → 8**, and it is the only one: a stored day holds `PlayerReport.games` and
`getReport` reads those straight back out, so a v7 snapshot deserializes with
`line.sf` undefined and `lineOps` divides by `NaN` — the version rule at its
most literal. Nothing else needed one, and each for its own reason. The raw game
feed a line is *derived* from already carried the `sac_fly` events, so
`FEED_CACHE_VERSION` stays at 8. `HitCounts` in `teamHitting.ts` has counted
`sacFlies` since it was written, and its OBP was already right. The research
board takes OBP off Savant's own leaderboard rather than computing one.
`StatcastCounts` holds no batting line at all. And on the *projected* side
`projection.ts` already carried the sacrifice residue as `BAT.sf`; putting it on
the line is what makes a projected OPS recompute to the blended OBP it was
pinned to, instead of running a hair high the way the measured one did.

### The last out is not the last word: a game MLB is still writing

**A `Final` game is not yet a finished game**, and freezing one there is how a
credit that MLB posts half an hour later never arrives at all.

`getStatsApiGame` used to persist a game the moment `isFinalFeed` turned true —
the last out — and a persisted game is never re-read. MLB fills the rest of the
box score in *after* that: the winning and losing pitchers, the save, and the
**holds**, which are the one credit that lives nowhere else in the payload
(`FEED_FIELDS` says so beside them; a win or a save duplicates
`liveData.decisions`, a hold does not).

**Found by a number that would not add up.** A fantasy team's week read **11**
saves-plus-holds against ESPN's **12**. The missing one is Brent Headrick's hold
on 2026-08-12 (gamePk 823511): MLB credits it today, and the blob on disk —
written at **22:10 that night** — records `holds: 0`, with `decisions` an
**empty object** beside it, meaning MLB had not even named the winning pitcher
when we froze it.

**Then counted, because one anecdote is not a rule.** Over every frozen game
blob on disk, **621 of 622 name a winner and a loser and exactly one does not**
— and it is that game. So the fault is rare, real, and permanent wherever it
lands.

**The tell is free and already in the payload**, which is why the fix needs no
extra request and no timer. `isSettledFeed` is `isFinalFeed` plus *has MLB
finished writing this*:

- a game it has finished names **both** pitchers;
- a **postponement or cancellation** is settled the moment it is called — there
  is no decision coming, ever;
- a **tie** has no winner and no loser by definition, and is read off the
  linescore instead: equal runs on a final game. Without that branch a tie would
  be re-fetched on every cold read of its day for ever and its day never
  snapshotted, which is a worse fault than the one being fixed.

A clock was the alternative — *trust a final that is a day old whatever it says*
— and it was written first and thrown away. It blesses every blob already frozen
too early, including the one game this was found by, so it fixes nothing that has
already happened. **The payload answers the question; a timer only guesses at
it.**

**It applies in four places, and all four were the same fault.** The blob is not
*written* unless the feed is settled; a blob already on disk that fails the test
is *read as a miss* and fetched again; `gameMemCache` no longer pins an unsettled
game for the life of the process (which is why dropping the bad blob did nothing
until the server was restarted — measured, twice); and **a day is not
snapshotted unless every game in it is settled**, `ParsedDay.settled` carrying
that out of `buildStatsApiDay`. The last one matters most: a day snapshot is
never re-read either, so freezing one over an unwritten box score bakes the
blanks in a second time, one level up.

**What it costs is one extra read of a game in the gap between the final out and
the box score being closed out** — a window during which the app was already
re-reading that game every ten seconds while it was live. Nothing else moves:
621 of 622 games on disk are settled on the first test and are served exactly as
before.

**And official scoring itself moves, which is the same fault wearing a different
hat.** Comparing every play of the matchup week's cached games against MLB as it
reads today: **4 plays of 10,781 have been rescored** since we froze them — a
single that became a double (824478, 2026-08-17), a single that became a triple
(824076, 8/19), a single that became a field error (824239, 8/15) and an
`other_out` that became a caught stealing (823749, 8/18). Every one of those
blobs was written on the game's own night. Over a random 60 cached games spread
across the season the same probe finds **0 in 4,558**, which is consistent with
that rate rather than distinguishable from it. `isSettledFeed` does not catch
these — a rescoring can land days later, long after the decisions are in — and
no test in the payload announces one. **This is written down rather than fixed**:
the honest options are a periodic re-read of recent finals or a
`FEED_CACHE_VERSION` bump, and the first needs a measurement of *when* MLB
revises that this repo does not have. The four blobs above were refreshed by
hand when the rule was written; the one they cost was a total base.

**That measurement has since been made, and it is the next section.** MLB
publishes the answer — `game/changes?updatedSince=` names every game it has
touched since an instant — so the periodic re-read no longer has to guess at a
window, and neither of the two options above is what shipped.

### Official scoring moves, and MLB says which games moved

**The section above ends by saying this was written down rather than fixed.**
It is fixed now, and what unblocked it is that MLB will tell you:
`https://statsapi.mlb.com/api/v1/game/changes?updatedSince=<instant>&sportId=1`
answers with every game it has touched since that instant. The revision does not
have to be *detected*; it has to be *asked for*.

**How wrong the cache actually was, measured over all of it.** Every
current-version game blob on disk — 622 of them, 47,018 plays — re-fetched
through the same field-filtered URL the app writes with, and compared play for
play against what MLB serves today. **Nine plays across eight games differ**,
1.3% of the games, and every one of the eight has a later update stamp in MLB's
own change feed than the moment we froze it:

| game | date | what moved |
| --- | --- | --- |
| `823264` | 2026-08-12 | five runs went from earned to unearned — that pitcher's line reads `ER 8` on disk and `ER 3` at MLB |
| `823754` | 2026-08-06 | a single became a field error: the batter loses a hit and an RBI, the pitcher a hit and an earned run |
| `823024` | 2026-08-07 | a field error became a single, the other way — the pitcher's hits go 4 → 5 |
| `823994` | 2026-08-13 | the **losing pitcher** was reassigned, 615698 → 695239 |
| `824725` | 2026-08-17 | two strikeouts and an inning moved off one reliever onto another who had not been credited with appearing at all |
| `824970` `824969` `824240` `824395` | 2026-08-11 to 08-20 | three more earned-run flags and two runner attributions |

**And how late they land.** Binary-searching the change feed on `updatedSince`
gives the instant of a game's last update exactly, so slicing it — every 30
minutes across the last 14 days, every day across the last 31 — and reading each
game's `officialDate` off it gives the lag distribution directly. Of the games
MLB touched in a 31-day window, **33 were touched two or more days after they
were played**: at 2, 3, 4, 5, 6, 7, 10, 11, 12, 15 and 16 days, plus two
outliers at 42 and 135 and eleven archival touches on 2023–2025 games. The
longest in-season lag in the fine-grained scan is **12 days** — `823754`, played
2026-08-06 and revised 2026-08-17T22:35Z. They arrive in small clusters rather
than continuously: three games inside one half-hour on 8/15, three more inside
one hour on 8/17, which is what a scorer's batch looks like.

**Two ways to spend that, and neither is what shipped.** A short TTL on a
finished day throws away the whole point of the day snapshot — a 62-day range
would re-fetch a thousand games to move nine plays — and a *window* (anything
inside N days is provisional) is only a guess at a tail that demonstrably runs
to 15 and 16 days. What shipped instead is: **ask which games moved, and rebuild
only those days.** `revisions.ts` polls the change feed at most once per 30
minutes, keeps a durable map of baseball date → the `gamePk`s waiting, and
`getDay` reads that map before it will serve a frozen day. A day MLB has not
named costs exactly what it cost before: one map lookup and a snapshot read.

**`fields` is not decoration on this endpoint.** Filtered to
`dates,games,gamePk,officialDate` a 14-day lookback is **17,117 bytes and
148ms**; unfiltered it is **260,456 bytes and 686ms**. In the steady state the
lookback is the half hour since the last poll and the answer is **12 bytes**.
And `officialDate` is asked for by name rather than read off the enclosing
`dates[].date`, which is the *UTC* day and is one past this app's for every
night game.

**Two traps in it, both probed before anything was built on this.** It caps at
**1,000 games** — `-120d` and `-200d` both answer with exactly 1,000 — so a
lookback past about 60 days silently truncates and cannot be trusted. And an
**omitted or empty `updatedSince` returns 200 with the full 1,000-game list**
rather than an error, which is this file's standing warning about an endpoint
that accepts a parameter and ignores it; the value is built in one place and can
never be blank. A malformed value 400s honestly.

**`builtAt` is what keeps this from rebuilding yesterday every morning.** MLB
writes to a game after the last out as a matter of course — the decisions, the
holds, the section above — so the change feed names most of a slate the night it
is played, and a rule that read the mere presence of a pending entry as
staleness would rebuild every day once for nothing. A day snapshot now carries
the instant it was built (`DAY_SNAPSHOT_VERSION` 8 → 9) and a revision only
supersedes it if we learned of it *after* that. The comparison is safe in the
direction that matters, because a snapshot written at *T* was written by a
`getDay` that consulted the map at *T*; the one race left — a poll landing while
a build is in flight — is what the poll's **two-hour rewind** covers, the same
rewind that makes a lost stamp write cost a repeated answer rather than a missed
one (`storage.ts` has no compare-and-set).

**Which blobs got the rule, and which deliberately did not.**

- **The per-game feed (`game-{pk}-v8.json`) and the day snapshot
  (`day-{date}-v9.json.gz`) got it**, and they are the only two. A revision *is*
  the whole reading of a single game's line — five earned runs on one start is
  not a rounding — and the day snapshot is what a cold read of a past day
  actually serves, so without it the game-level rule would never fire. The
  `wp-{pk}.json` beside a game blob rides along, being rewritten in the same
  branch.
- **The Savant per-date exports (`{date}.csv`, `{date}-pull.csv`) did not**, and
  this is the measurement that decided it. Re-downloading eight dates and
  diffing against disk, 33,064 pitch rows: `events` moved on **2 rows**, both
  single → field error, both on games the MLB feed also shows rescored;
  `woba_value` and `woba_denom`, which everything downstream sums, moved on
  **0**. What *does* move is `delta_run_exp`, on **~66% of rows on every date
  including one four months old** (2,959 of 4,343 on 2026-04-15), by ±0.001 to
  ±0.01 — Savant re-fitting its run-expectancy table, not a scorer. Re-downloading
  3.3MB to chase two rows in 33,000 would churn every derived per-day blob for
  reasons that have nothing to do with scoring.
- **The per-day count blobs built off those exports did not** —
  `statcast-counts-{date}-v5`, `team-hitting-{date}-v1`, `league-woba-{date}-v1`.
  They are aggregates: a window sums 7 to 170 of them, and the season wOBA
  reference line moves in the fifth decimal for one rescored play. They are also
  downstream of a CSV that does not carry the correction anyway.
- **Nothing that already carries a TTL needed one.** The research and team
  boards, team hitting's boards, the percentile cards, the arsenal, the xwOBA
  series, the expected-stat and arm-angle tables all re-derive on six hours or
  less from upstreams that carry the correction themselves. ESPN's own numbers
  are out of scope — ESPN restates on its own schedule, and this is MLB scoring.

**`FEED_CACHE_VERSION` deliberately did not move.** A v8 game blob's bytes and
their meaning are unchanged; what changed is the policy for deciding when to
re-read one, and that policy lives outside the blob and applies to a v8 blob
exactly as it would to a v9. The eight blobs measured to be wrong are healed
without a bump, and that is measured too: their last MLB update is between
**0.84 and 10.45 days** old against the **14-day** lookback a cold stamp asks
about — and no blob on disk is older than that either, all 622 having been
written on 2026-08-10 or later, when `FEED_CACHE_VERSION` went to 8. A bump
would re-download 622 games to arrive at 614 byte-identical ones.
`DAY_SNAPSHOT_VERSION` moved because `builtAt` is a field read back out of the
blob, which is the test this file has always applied.

**What it costs, driven in the running app.** A 7-day `/api/report` whose days
all come off snapshots, three server restarts each and the same watchlist:
**226/216/204ms cold and 3–5ms warm before**, against **228/212/207ms cold and
3–5ms warm after** — indistinguishable, because a cold process adopts a stamp
younger than the poll window instead of polling. The **one** process that does
have to poll is **681ms cold** (646–938ms over the wider set of trials), nearly
all of that the first TLS handshake to `statsapi.mlb.com` rather than the
answer, and the two restarts after it adopt the stamp it wrote and come back to
**217ms and 198ms**. That is once per 30 minutes per *deployment* rather than
per container, the stamp being shared. In request counts: **+0 upstream requests
per read**, and **+1 `game/changes` per 30 minutes** for the whole deployment,
plus — per day MLB actually names — one schedule fetch and one feed fetch per
named game, once. A day MLB has named is rebuilt **once**: 1,441ms for a 15-game day, then
3ms and 2ms on the two reads after it. The warmer drains the map before it warms
anything else, so a reader pays only if nothing else got there first — the rule
the research board and team hitting already follow here.

**Verified end to end rather than reasoned about.** With the poll quiet, César
Prieto's 2026-08-07 reads `PA 2 · AB 2 · H 0 · TB 0` and the play reads *reaches
on a throwing error by pitcher Ryan Feltner*; Feltner's line reads `H 4`. With
the poll live, the same two routes read `PA 2 · AB 2 · H 1 · 1B 1 · TB 1`,
*singles on a bunt ground ball to pitcher Ryan Feltner*, and `H 5`. Re-running
the whole drift probe against the rebuilt cache afterwards: **0 play-level drift
in 16,228 plays across 214 games**, against 9 in 47,018 before.

**And it lands on the roster table, not just on a route.** `823754` is Brice
Turang's game, and he is on the watchlist this was driven against: the summary
table for Thu Aug 6 read `1/4` with an RBI off the frozen blob and reads `0/4 ·
.000` after the rebuild, which is what MLB's own box score says. A day's line
being wrong by a hit is not a rounding on a page whose whole job is that line.

**What is inferred rather than measured.** The 14-day seed lookback is a
judgement, not a bound: MLB revised a game at 42 days and another at 135 inside
the same month, and a rescoring that lands after a blob has aged past a cold
stamp's lookback will not be found — the app has to have been running, and
polling, in the interval. `PENDING_MAX_DAYS` (45) is likewise a number chosen to
sit past the longest in-season lag seen rather than one MLB guarantees. And the
drift measurement itself has a horizon: no current-version game blob on disk is
older than 11 days, so "no drift on older games" is a fact about the blobs and
**not** evidence that a June game frozen in June is still right.

### Handedness rides on the season roster, because that is the list that answers for everybody

**Which side a man bats from and which arm he throws with are two more leaves on
a request this app already makes**, and choosing *which* request is the whole of
the decision. Three were available and only one of them can answer for a
stranger.

- **`getRosterInfo`'s people call** already hydrates `pitchHand` — it is what
  `PlayerReport.throws` is, and what a pitcher's card reads before he has thrown
  a pitch — and `batSide` is one more leaf on it. It answers for the players a
  **report** was built for, which is a roster and nothing else.
- **The research blob** (`research-{kind}-{window}-{SEASON}-v7.json`) would put
  it on the row that needs it most, and is the wrong home for the reason
  `rosterPct` and `eligible` are kept off it: that blob is cached per kind and
  per window and served to every user alike, so a fact about a player would ride
  in ten copies and a fifth window would have to learn it too.
- **`getSeasonPlayers`** is every player of the season, `fields`-filtered, cached
  an hour, and — the part that decides it — **already fetched by the client at
  boot** for the header search. One lookup by id then answers for *anybody*,
  which is what the research board needs: six hundred rows of players nobody has
  rostered, with no report behind a single one of them.

So it is the third, and `bats`/`throws` join `SeasonPlayer`. Measured against
MLB, the pair takes that call from **161,842 to 228,706 bytes raw and 21,989 to
24,061 gzipped** — 2.0KB over the wire, once an hour, shared by every user of the
installation — and both fields come back populated on **1,393 of 1,393** rows of
a checked season, so this is not a column that will quietly be mostly empty.

**One source rather than two, which is why `PlayerReport` gained nothing.**
Adding `bats` beside the `throws` already on a report is nearly free and would
have given the summary table an answer off its own row — and then the board and
the player page would still have needed the season list, and the app would hold
two definitions of one displayed fact, free to disagree the next time either was
touched. `PlayerReport.throws` is untouched and keeps its own readers, which are
a different question: it is the hand a **game** is read against, standing in for
`PlayerGame.stand` before he has appeared in one, and it is what accents the
opposing lineup's platoon row. Who a man *is* comes off the list that knows
about everybody.

**One entry per person, carrying both facts**, and the reader picks the half it
is drawing. A two-way player is two rows of this list under one id — checked,
Ohtani's batter row and his pitcher row agree, `L` and `R` on both — so the
client reduces it to a map keyed by **id** the way the news map is, and
`lib.ts::handCell` takes the kind. See **Client — the Roster view** for the
vocabulary that comes out of it and what it costs the two wide tables (nothing).

**Nothing versioned moved, and the test is the repo's own.** `seasonPlayersCache`
is **memory only** — `getSeasonPlayers` writes no `storage.ts` blob at all — so
there is no stored shape that could deserialize with the pair missing, which is
the hazard a version guards against. `SeasonPlayer` is also not what a roster
entry is stored as: `store.ts` persists `WatchPlayer` (+ `addedAt`), and the two
new fields are deliberately on `SeasonPlayer` alone rather than on the type every
report, card and stored entry in both workspaces is built on.

**`pitchHand` is `S` for two players on a checked season** — Carlos Cortes and
Anthony Seigler, ambidextrous, and **neither of them a pitcher** (MLB lists them
RF and 2B). There is no honest word for a switch-throwing pitcher, so the client
answers for `R` and `L` and draws nothing for anything else, which is the
direction every join in this app fails in.

**`getDay(date, filter?)`** takes an optional `DayFilter` (`dayFilterFor(players)`). A day holds a report for *every* player who appeared — ~600, several MB — so `getReport` narrows each day to the rostered players as it parses. The filter carries **names as well as ids**, because `findPlayerDay` falls back to a same-kind `savantName` match when an id isn't present that day; filtering on ids alone would silently break that. Frozen, filtered days are memoized in a bounded `projectedCache` keyed by date + roster; only still-mutable days are kept whole in `memCache`. `mapLimit` (`limit.ts`) caps the fan-out at `DAY_CONCURRENCY` (6) and `GAME_CONCURRENCY` (8) — this bounds peak heap as much as it bounds sockets.

### Team hitting: nine cuts a window, and why MLB cannot be asked for them

**`server/src/teamHitting.ts` is how every team has hit** — over one of the
research board's five windows, at home or away or both, and against each hand
on the mound. Nine cuts, which is what a watched pitcher's opponent table is
made of (see **Pitchers on the roster**) — **and, since the team page's Splits
tab, the same nine cuts of a club in the field**, which is the same rows read
from the other end. See *Both sides of the ball* below; the file keeps its name
because the batting side is still what every caller but that tab means.

**MLB publishes five of the nine for the season and none of the rest, and every
way of asking was tried.** A team's season line, its `vl`/`vr` platoon splits
and its `h`/`a` home-road splits each come back exactly and for free — and
there is **no combination and no window**. Probed rather than assumed:
`stats=byDateRange` answers for a team over a range and **ignores `sitCodes`
entirely** (the same 30 unsplit rows come back), while `stats=statSplits`
accepts a `startDate`/`endDate` and **ignores the range** — 109 games on a
14-day query, i.e. the whole season. There is no compound situation code
either: the 602 codes `/api/v1/situationCodes` lists include `h`, `a`, `vl` and
`vr` and nothing that crosses them, and the `vls`/`vrs` starter splits return
**nothing at all** for a team. So a windowed or home-only platoon split cannot
be asked for, only summed.

**So it is summed a day at a time from the per-date Savant export**, which is
`statcastWindow.ts`'s own answer to the same problem and reuses the same file:
`downloadDayCsv`, kept forever, so a day already on disk for the research board
is never fetched twice. The rule is that file's rule — everything stored per day
is a **count**, never a rate, and the rates are computed once at the end from
the summed counts. A day reduces to at most **30 × 4 buckets** (team, hand,
venue) plus one game count per team per venue, from which all nine cuts fall out
by addition, so the leaves cannot come to disagree with the rows drawn from them.

**Game counts are the one quantity that does not fall out of the leaves**, and
the reason is worth stating because it is easy to get wrong: nearly every game
features both hands, so adding the two hand leaves' game counts tells a club it
has played twice as often as it has. `DayHitting` therefore carries a second,
per-venue tally, and the `all`-hand rows read that where the hand rows keep
their own leaf count — which is "games in which they faced this hand", and is
exactly what their runs-per-game divides by.

**Runs are read off the score progression, not off each pitch's own delta**, and
that is what makes them exact. A run that scores on a play with **no pitch** — a
balk, a steal of home, defensive indifference — is in no row of a pitch-level
export, so summing `post_bat_score − bat_score` loses it: measured before the
fix, **30 runs league-wide (0.2%), always short and never over**. Taking the
score *since this side's last pitch* picks those up on the next pitch thrown,
which is also the right leaf — whoever was on the mound gave them up. It is why
`parseDay` sorts its rows: a progression needs an order, and `at_bat_number` is
game-wide and sequential across both sides, so that sort is scorebook order.

**Checked against MLB's own published numbers rather than spot-checked.**
Against `stats=byDateRange` over the same span, all 30 teams: **plate
appearances, games, runs, home runs, walks and strikeouts are exact on every
one — 0 deltas** — and the only residue is **16 hits league-wide out of ~41,000
(0.04%)**, signed both ways, which is what an official-scoring change looks like
from here: a hit later ruled an error is corrected in MLB's aggregate while the
frozen daily export we cached still carries the original ruling. It moves a team
average by at most .001. And **an independent recompute of all nine cuts**, off
the same day files, matches the route on **3,239 of 3,240 cells for the season
and 9,595 of 9,600 across the season, 30-day and 7-day boards** — every one of
the residue a `.125`-style rounding tie between JS's half-away and Python's
half-to-even, not a disagreement about a number.

**Both sides of the ball come off the same rows**, and the pitching side is the
batting side filed under the other club. A club's pitching line *is* its
opponents' batting line: the same pitch, keyed by who was **in the field** with
the **batter's** hand as its axis instead of the pitcher's, and at that club's
own venue — which is the other one, the away side batting in the top of an
inning. So the day now reduces to **30 × 8** buckets, four to a side, and the
nine cuts of either side fall out of that side's four by the same addition.
`TeamSplitSide` is the parameter, on `getTeamHitting` and on
`/api/teams/:teamId/splits`.

- **It is one arithmetic and not two.** Every count is written to both leaves in
  one pass — a strikeout is one the batting club took and one the fielding club
  got — so the two sides cannot come to disagree about what happened, and the
  run progression files the same run as *scored* and as *allowed* rather than
  re-deriving it.
- **The better end of every column flips**, and that is a rule rather than a
  second table: whatever end is the better offense is by construction the worse
  defense, so `rankedFor('pitching')` inverts each category's `lowIsBest` — most
  strikeouts, fewest walks, fewest runs allowed, lowest OPS against. Writing the
  eight out again with the flags inverted would be eight chances to invert seven
  of them. It is what keeps *1st is best* true on both sides, which is the
  sentence a rank is unreadable without.
- **The two axes are measured complete.** Over three whole days of the live
  export — **11,592 pitches** — `p_throws` and `stand` are each `L` or `R` on
  every row, none missing either, so the two sides count the same rows and the
  one guard the loop keeps (a row with no `p_throws` is skipped whole, runs and
  all) cannot cost the pitching side a plate appearance the batting side kept.
- **Checked as a mirror, which is the invariant that proves it.** Summed over
  all 30 clubs, the two sides are **identical on every count**: 145,164 plate
  appearances, 17,186 runs, 4,411 home runs, 12,951 walks, 32,108 strikeouts and
  3,838 club-games, **0 delta on all six**. Every plate appearance in the league
  is filed exactly once on each side.
- **And against MLB.** Every one of the 30 clubs' season pitching lines differs
  from MLB's published one by **exactly one game** — dG 1 on all 30, with the
  residue one game's size (0–9 runs, 3–14 strikeouts, 0–4 home runs) — which is
  the window rule and not an error: the window ends *yesterday*, Savant lagging
  the live feed by a day. The **batting** side is one game behind on all 30 in
  the same run, so the two sides are equally close to MLB. Spot-checked against
  the published splits themselves: MIL's pitching `vl` reads `.209` here and
  `.209` at MLB.

**Cached the way the research board is**: a day's counts are a blob
(`team-hitting-{date}-v2.json` — **`-v2`** because the leaf keys gained their
`B|`/`P|` side prefix, and a key that changes meaning is the same fault as a
field that arrives; a bump costs a re-parse off CSVs already on disk rather than
a re-download), and a window's whole board is another per side
(`team-hitting-board-{window}-v1.json` and `team-pitching-board-{window}-v1.json`,
81KB on a checked season, six hours in memory and in the storage tier with an
`inFlight` guard). **The batting board key is deliberately unchanged**: what a
stored `-v1` holds is byte-for-byte what this build produces, the leaves it is
summed from having gained a prefix rather than a number, so bumping it would
throw away every cached board in exchange for identical figures. The one thing
such a blob lacks is `TeamHitting.side`, which is why that field is optional and
absent means `batting`. The `season` window starts at **1 March of the end date's own
year** rather than opening day, which is what keeps this file off the list of
places a season rolls over in: `savant.ts` asks Savant for `hfGT=R|`, so a
spring date reduces to an empty day, and `dayHitting` writes its counts blob
either way — so the pre-season dates cost one headers-only request each, once
ever.

**Measured through the route**: the season board **12.3s genuinely cold** (167
days reduced, the CSVs already on disk), **26ms** off its blob in a fresh
process and **10ms** warm. That cold figure is why `warmer.ts` builds all five
nightly: `/api/report` reads this for every opponent a watched pitcher has, so a
reader must never be the one paying for it.


### Team research: thirty clubs on the research board, and what reconciles

`teamResearch.ts`. The board's **team reading** (see **Client — research**) is
thirty `ResearchRow`s, one per club, over the same five windows the player board
offers. Two halves, joined on nothing at all — each club is filled from both —
and each is fetched in its own `try` on the standing rule.

**The MLB half is a leaderboard of teams**, one path segment along from the one
`research.ts` reads:
`teams/stats?stats=season|byDateRange&group=hitting|pitching&season=…&sportId=1`.
**Probed before anything was built on it**, and it answers in all four
combinations — 30 splits each, carrying every field `buildBase` reads off the
player leaderboard (`plateAppearances`, `battersFaced`, `strikeoutsPer9Inn`,
`outs`, `earnedRuns`, `numberOfPitches` and the rest), so FIP comes out of
`fipLike` here on exactly the inputs it does there.

**This is not the endpoint the section above records as useless.** That one
wanted a windowed *split* — home only, versus left-handers — and it is
`sitCodes` that `byDateRange` ignores. An unsplit team line over a range comes
back correctly, and was checked against the same range's schedule.

**The Statcast half is summed a day at a time**, off two new axes in
`statcastWindow.ts`'s day blob: `batterTeam` and `pitcherTeam`, the same pitch
rows bucketed under the export's own `home_team`/`away_team` abbreviation
instead of under a player id (`inning_topbot === 'Top'` is the away side
batting, the same test `teamHitting.ts` makes off the same three columns). They
are tallied in the **same pass** as the two player axes, because the day CSV is
3.3MB and the expensive part is reading it; `teamStatcast` then sums them with
the same `addCounts` and finishes with the same `toStatcast`, so a club's barrel
rate is barrels over batted balls computed by the routine that computes a
player's.

**Why summed and not read, when Savant does publish two team boards.** Probed:
`expected_statistics?type={batter,pitcher}-team` returns 30 rows keyed on the
abbreviation, and `leaderboard/statcast?type={batter,pitcher}-team` returns 30
more. But **`custom?type=batter-team` returns the 637-row *player* board** (its
`ddlType` select offers Batters and Pitchers and nothing else), and
**`batted-ball?type=batter-team` returns 633 rows with the `id` and `name`
columns blank** — so Whiff%, Chase%, F-Str%, the GB/LD/FB mix, PulAir% and Bat
are reachable for a club from no leaderboard at all. And none of the team boards
takes a date range. Summing the days answers every column on every span with one
rule; a leaderboard season beside a summed window would have been a board whose
columns emptied when the reader pressed a tab.

**So the two Savant team boards became the answer key instead.** Our summed
season against theirs, all 30 clubs, both kinds, median absolute error:

| column | vs Savant | batters | pitchers |
| --- | --- | --- | --- |
| xwOBA | `expected_statistics` `est_woba` | **0.000** (max 0.001) | **0.000** (max 0.001) |
| EV | `statcast` `avg_hit_speed` | **0.0** (max 0.1) | **0.0** (max 0.1) |
| LA | `statcast` `avg_hit_angle` | **0.0** (max 0.1) | **0.0** (max 0.1) |
| Barrel% | `statcast` `brl_percent` | **0.0** (max 0.0) | **0.0** (max 0.0) |
| HardHit% | `statcast` `ev95percent` | **0.0** (max 0.2) | **0.0** (max 0.2) |
| SwSp% | `statcast` `anglesweetspotpercent` | +1.5 (1.0 – 1.7) | +1.5 (1.0 – 1.9) |
| xBA | `expected_statistics` `est_ba` | −0.026 (max 0.030) | −0.025 (max 0.032) |
| xSLG | `expected_statistics` `est_slg` | −0.042 (max 0.049) | −0.042 (max 0.053) |

**The three that miss are `statcastWindow.ts`'s own definitions and not this
file's**, which was checked rather than assumed — the same comparison run
against the *player* season-length window (313 batters with 200+ PA, against
Savant's `custom` board) gives **SwSp% +1.20 signed median (0.00 – 4.30)** and
**0.00 on barrel rate, hard-hit rate and exit velocity**. So the team board is
exactly as accurate as the player windows beside it, which is the property that
matters to a reader comparing the two; xBA and xSLG are `xbaSum`/`xslgSum` over
the **wOBA denominator** where Savant's are over at-bats, and moving either
would move every window on the player board and wants its own change and its
own bump.

**And the MLB half reconciles against the player board — league-wide, exactly.**
Summing the 30 team rows against summing all ~640 player rows for the same
season: **11 of 11 batting fields identical** (145,164 PA, 128,944 AB, 31,410 H,
5,955 2B, 516 3B, 4,411 HR, 17,186 R, 16,435 RBI, 12,951 BB, 32,108 K, 2,596 SB)
and **7 of 8 pitching fields identical** (the same 31,410 hits and 4,411 home
runs read from the other side, 145,164 BF, 102,095 outs, 12,951 BB, 32,108 K);
earned runs differ by **29 of 15,750 (0.18%)**, MLB's team ER and the sum of its
pitchers' not being the same quantity when a run is charged to a club and to no
individual.

**Per *club* they deliberately do not match, and that is the finding that
settles the design.** The player leaderboard returns a traded player **once,
under his current club, aggregated across his stints** — which `research.ts`
records as the reason it reads that board at all — so summing it by club files
a man's April with whoever holds him in August. Measured: only 21 of 330 batting
cells and 0 of 240 pitching cells match, ATL 96 PA short and MIL 113, SF 258
hits light against TOR 49 heavy. The team leaderboard is the club's own line and
is the only thing that answers; the league totals above are what shows the two
are reading the same league.

**The record is the standings on a season board and the schedule on a windowed
one** — the same split `research.ts` already makes for its team game counts, and
for the same reason: the standings carry a season total and nothing else. Season
takes `wins`/`losses` off the `teamRecords` rows `getTeamGames` already reads
(`fields=` widened by two); a window counts `isWinner` off the schedule with the
same `codedGameState === 'F'` test, so a postponement is not a loss. Spot
checked against the standings: **TB 76-51, MIL 79-49, LAD 77-51** on the season
board, and **PHI 5-0, KC 6-1, WSH 1-5** over the seven days ending yesterday.
A finished game MLB has marked no winner on either side of counts for neither
club rather than for both.

**Two columns stay null and are not drawn for a club.** `xera` — Savant's team
expected-statistics board publishes no such column (fourteen columns, `est_ba` /
`est_slg` / `est_woba` and their diffs, and nothing else) — and `sprintSpeed`,
which appears in no pitch row. The same two a *window* has none of, for the same
two reasons.

**Cache.** `team-research-{kind}-{window}-{SEASON}-v1.json`, 6h in memory and in
the storage tier with an `inFlight` guard, the shape the player board uses. And
**`statcast-counts-{date}` went `-v4` → `-v5`**, which is the rule at its most
literal: a v4 blob deserializes perfectly with `batterTeam` and `pitcherTeam`
**missing**, so the team board would have read `undefined` off every settled day
and served thirty rows of dashes — and those blobs have no TTL at all, so *for
ever*. The bump costs a re-parse off the day CSVs `savant.ts` keeps, not a
re-download. Nothing else needed one: `team-hitting-*` is untouched, and the
research blob's own `-v11` is unchanged, `ResearchRow.record` being a field only
the new blob carries and only the new board reads.

**Measured through the route**: a season team board **18.8s genuinely cold**
(174 days reduced, CSVs on disk, and the v5 re-parse paid on the way), **0.9s**
for a 7-day one, milliseconds off the blob. `warmer.ts` builds all ten nightly,
in the same sequential-by-window loop the player boards use and immediately
after it — by which point every window but the season's is a handful of `Map`
additions, the day blobs having just been written.

### One player's spans, cut four ways — and why it has to be his own pitches

`playerSplits.ts`, behind `GET /api/players/:playerId/windows?cut=vsr|vsl|home|away`
— the **same route** the uncut Stats tab reads, because it is the same table:
five spans, `row: null` for a span he has nothing in, and the board's own
`ResearchRow` shape. A second route would be a second shape for the client to
hold and a second place for the two to drift. An unrecognized `cut` falls back to
the uncut board rather than 400ing, which is the client's own rule for a
parameter it does not know arriving in a link.

**MLB publishes exactly these four splits and will not date-range them, and the
probe is recorded so nobody repeats it.** `statSplits` with
`sitCodes=[vr,vl,h,a]` is exact, populated and league-wide (623 batters carry a
`vl` row), and it accepts `startDate`/`endDate` in either spelling, returns
**200**, and ignores them: Juan Soto's `vl` line reads `120 PA / .276` for
`2026-07-20 → 2026-08-20` exactly as it does for the season, because it *is* the
season. `stats=byDateRange&sitCodes=…` is the same dead end from the other side
— it honors the dates and drops the split, handing back the overall line once
per code with an empty `split` object. This is the `pull_air_rate` failure
wearing a date, and it is the same shape as the one **Team hitting** above
records: MLB will give you the cut or the window, never both.

**And there is no board to read it off.** The research board is a league-wide
season of pitch rows per window; four cuts of five windows is twenty of them,
which is not a route, it is a nightly job three times the size of the one this
app already runs.

**So a cut is his own season of pitches.** `statcast_search/csv` filtered to one
player (`batters_lookup[]` / `pitchers_lookup[]`) takes the whole season in a
single request, and every row of it carries `game_date`, `p_throws`, `stand`,
`inning_topbot` and `events` — so all four cuts of all five spans fall out of one
fetch by filtering. Measured: **1,472 rows / 985KB in 3.8s** for a batter (Soto)
and **2,077 / 1.4MB in 4.4s** for a starter (Sale), both far under the
**25,000-row cap** that rules this export out league-wide and is why
`statcastWindow.ts` builds a window a day at a time instead. Twenty rows are
cached per player for six hours — the same TTL the boards settle on — and all
four cuts come out of the one fetch, because the fetch is the cost and a cut is a
filter over it.

**The Statcast half is `statcastWindow.ts`'s own arithmetic, imported.** `tally`
and `empty` are exported for this one caller, so a cut of a span and the span
itself count a barrel the same way by construction rather than by care. Two
things stay null that a day export would have filled: `pullAirRate`, which needs
Savant's separate `hfPull` file keyed by date and has no per-player counterpart,
and `sprintSpeed`/`xERA`, which are absent on a window already.

**The counting half is computed here, so it is checked against the source that
publishes it — and it reconciles byte for byte.** Against MLB's `statSplits` for
2026: Soto vs L `120 PA / .276 / .809 OPS`, vs R `239 / .287 / 1.021`, home
`169 / .331 / 1.077`, away `190 / .242 / .833`, all four identical and
`vsL + vsR = home + away = 359`; Sale home `11 G / 262 BF / 52 H / 74 K`, away
`11 / 255 / 51 / 86`, vs L `127 BF / .248`, vs R `390 / .206`, all four
identical. **`truncated_pa` was the single discrepancy in the whole exercise** —
a plate appearance ended by the third out on the bases, exactly one in Sale's
season, which Statcast files as an event and MLB does not count as a batter
faced. It heads `NON_PA_EVENTS`, a **denylist** rather than an allowlist for the
reason `QUIET_ACTIONS` is one: an outcome MLB adds next season should show up as
the plate appearance it almost certainly is rather than vanish out of the
denominator.

**Home and away are `inning_topbot`, not the club abbreviations.** The top of an
inning is the visiting side batting, so a batter is at home in the bottom and a
pitcher in the top. Reading it off `home_team` would need the player's own club,
which changes at a trade deadline and is precisely the join this does not have
to make.

**Innings were probed and rejected, and the negative result is the point.**
Mapping `events` to outs gets Sale to **384 outs / 128.0 IP** against MLB's
**129.0** across the season — home 65.0 against 65.1, away 63.0 against 63.2 —
three outs a season short, every one of them a runner caught on the bases during
a plate appearance, which the export records in `des` and nowhere a parser can
trust. Three outs is 0.8% and it is still a wrong number, and a wrong ERA is
worse than no ERA. So `inningsPitched` is null on a cut row and every rate built
on it goes with it (ERA, WHIP, FIP, xFIP, K/9, BB/9), along with the things a
pitch row cannot know at all: runs, RBI, stolen bases, earned runs, decisions.
The client dashes them exactly as it dashes `sprintSpeed` on a window — see
**Client — the player page's other tabs** for what that looks like and for the
one column the table adds under a cut to keep the sample size on screen.

**`player-cuts-{kind}-{id}-{SEASON}-v1.json`**, and the version guards the
meaning as much as the shape: bump it whenever a field a cut row carries is
added *or begins to be filled*, this blob being read straight back out as the
answer.

**Identity comes off the season board and a failure costs only the names.** The
row needs a name, a club and a position that a cut has no opinion about;
`getResearch(kind, 'season')` already has them cached, and it is fetched in its
own `try` so a dead board leaves the numbers standing.

