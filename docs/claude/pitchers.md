### Pitchers on the roster

The roster holds both batters and pitchers, discriminated by `WatchPlayer.kind` / `PlayerReport.kind` (`'batter' | 'pitcher'`). The whole pipeline is written so **batter code paths are untouched**: `PlayerGame` gained one optional field `pitching: PitcherGame | null` (null for batters), and every client component branches on `report.kind === 'pitcher'`.

- **Role (starter / reliever)**: the pitcher-side mirror of a batter's lineup slot. `PlayerGame.pitchingRole` (`'starting' | 'relief' | null`) + `entryInning` live on `PlayerGame`, not `PitcherGame`, because the pre-game case has no outing to hang off (`rosterGame`'s placeholder). A starter is named by the boxscore — `teams[side].pitchers[0]`, filled from warmup on, else `gamesStarted` (`startingPitchers()` in `mlbStats.ts`, exposed as `StatsApiGame.pitchingStarters` and carried onto each `DayGame` as `pitchingStarterIds`); before first pitch the announced probable stands in, and only then, since a probable who never reaches the boxscore was scratched. Everything else is a reliever, with `entryInning` from the first batter he faced. The client reads it through `pitchingBadge` / `pitchingCorner` (`lib.ts`, alongside `lineupBadge`/`lineupCorner`, sharing the `Corner` type): an **SP** chip / pip, or **RP 7th** with the inning he came in. Rendered by `PitchingTag` on each game block's bar and the feed's outing/Upcoming rows, and as the headshot corner pip on the cards and in `SummaryTable`. **Not in the pitcher card's header summary line** — the pip beside the name already says it, under exactly the same condition (a lone game in view — which on the **no-outing** card is now any range holding one game rather than a lone game on a single day, a pip belonging to a game and not to a date), so a chip there was the same fact twice on one row.
- **Server**: `getStatsApiGame` builds a `pitchers` map by regrouping the SAME `allPlays` loop on `matchup.pitcher.id` (faced batters + all pitches), and reads `liveData.decisions` for the W/L/S pitcher ids (`StatsApiGame.decisions`); the authoritative per-game line comes from the boxscore (`parsePitchingLines`, needs `stats`/`pitching` in `FEED_FIELDS` — bumping `FEED_CACHE_VERSION` re-fetches cached finals; it's currently **8** — v2 added the boxscore line, v3 added `decisions` + the per-batter pitch sequence, v4 added `runners[].details.earned`, v5 added `responsiblePitcher`, v6 added the rest of the boxscore pitching line: `doubles`/`triples`/`hitBatsmen`/`atBats`/`intentionalWalks`/`wildPitches`/`inheritedRunners(Scored)`, v7 added the per-game `wins`/`saves`/`holds` credits — a win/save duplicates `decisions`, but a **hold** exists nowhere else — v8 added what a base-running event needs to describe itself: `runners[].details.playIndex`, the action events' `actionPlayId`/`description`/score, and `movement.start`). **Widening that vocabulary to all ten kinds needed no v9**, and the reasoning is worth keeping because it is the general rule: `fields` is leaf-matched, so `runners[].details.runner.fullName` and `result.awayScore` were already arriving under names requested for other parents (`fullName` for a batter, `awayScore` for an action event), and `movement.end` was already there beside `start`. Everything new is *derived* from fields a cached final feed already holds — which is exactly why `DAY_SNAPSHOT_VERSION` **did** have to go to 6: the snapshot stores the finished model, not the feed. `deriveLine` (the no-boxscore fallback) counts what it can from the plays and zeroes the rest. Each `FacedBatter` also carries `launchAngle`/`bbType` (the batted-ball trajectory, which powers the card's GB/LD/FB split — the boxscore only counts batted-ball *outs*) and `runs`/`earnedRuns` — the runs that scored on that play, counted from `play.runners[]` where `movement.end === 'score'` (earned via `details.earned !== false`) and **charged to the pitcher who threw it** (`responsiblePitcher.id`, so a reliever isn't billed for inherited runners); the pitcher card sums these per inning. Note this "runs scored while he pitched" differs from the boxscore line when a pitcher leaves runners who score later (the game-total pill uses the authoritative line). **`isBaserunningEvent` now filters the batter's plate appearances too, not just the pitcher's batters faced.** A play whose *result* is a caught stealing or a pickoff carries the batter who was up, and MLB only files one that way when it ended the half-inning — all 31 of them across a checked 111 games were the third out, so the at-bat itself resumes next inning and the row is somebody else's baserunning wearing his name. It was showing in his feed as an out and counting toward his `line.pa`; `buildPitcherGame` has excluded it since it was written, and both sides now do. The outs and bases the loop tracks are still updated from that play — only the two pushes are skipped — and the pitches thrown on it are still his. `getStatsApiGame` also keys a second map, **`pitcherBaseEvents`**, by the man on the mound: the same `StatsApiBaseEvent` objects filed under both parties, narrowed by `PITCHER_BASE_EVENTS` to the ones that happened *between* him and the runner. `savant.ts::buildStatsApiDay` assembles the `PitcherGame` (whiff%/CSW%/pitch-mix from the pitches via `aggregatePitches()`, each `PitchMix` carrying its own `strikes` count via `isStrikePitch()` — the shared "not ruled a ball" test `deriveLine` also uses, so balls are `count - strikes`; `vsRight`/`vsLeft` re-run that same aggregation over just the faced batters of one `stand` (`buildSplit`), null when he faced nobody of that hand — the boxscore doesn't split, so a split's `line` comes from `deriveLine` and its `outs` is 0; `decision` via `pitcherDecision(g, id)` — the official W/L/S from `liveData.decisions`, falling through to **`H`** when his boxscore line carries a hold, which `decisions` has no slot for (checked last, so a real decision can never be demoted to a hold); per-batter `FacedBatter.pitches` via the shared `toClientPitch` helper — the same projection batter PAs use; season/league arsenal filled per-pitcher in `getReport`). New modules: `pitcherArsenal.ts` (per-pitch-type season usage (`PitchUsage`: `count`/`strikes`) and averages — velo/spin/break, **plus the season Results**: PA, BA, SLG, wOBA, xwOBA, whiff%, put-away%, computed from the same CSV by classifying `events`/`description`; note the feed's `breakHorizontal` = `−pfx_x`, `breakVerticalInduced` = `pfx_z`, both ×12 to inches; the arsenal is keyed by the **feed's** pitch names via `feedPitchName()` — Savant's CSV says "Split-Finger" where the feed says "Splitter", and without the mapping a splitter's season baselines and Results never attached to its game row; `SeasonPitch` = movement `ArsenalPitch` + `PitchResults`), `pitchLeague.ts` (a curated league-average table). Those season Results ride along on each `PitchMix` as `season{Pa,Ba,Slg,Woba,Xwoba,Whiff,PutAway}`. `getPitcherStats` mirrors `getPlayerStats` with `group=[pitching]`. `percentiles.ts` has a `PITCHER_SECTIONS` table + the `statcast-r-pitching-mlb` page; `xwoba.ts` takes a `kind` for xwOBA-**against**. The percentile/xwoba/splits routes take `?type=pitcher`.
- **The record and the credits**: `PitcherSeasonStats` also carries **`wins`/`losses`/`saves`/`holds`**, read straight off the same MLB season line the rest of it comes from (`toPitcherSeasonStats`) rather than derived. They exist for the player page's **Overview** strip, which summarises a pitcher's season as `IP · W-L · SV · HD · ERA · WHIP · K%` — and those four are the half of it no rate can express, a closer's year being his saves and holds. **That last cell is a share and prints as one** (`26.1%`), where `kRate` reaches it as the `.261` string `toPitcherSeasonStats` builds: one conversion, in `lib.ts::ratePercent`, shared with the opposing-lineup section that reads the same field — see **Client**, *A rate is `.xxx` and a share is a percent*. **Not tallied off the game log**, which counts the same credits a game at a time (`decisionOf` there, checked in scorebook order): that is a different question — what he got *that night* — and summing 60 rows of it would be a second arithmetic free to disagree with the line the block already holds. A **split** reports 0 for all four, which is honest in the same way it reports no ERA (neither a decision nor an earned run is split by hand) and is read by nothing. Nothing needed a version bump: `PitcherStats` is memory-cached on a 30-minute TTL and `withEstimators` copies by spread, so the fields flow through it untouched; `client/src/types.ts` mirrors them by hand as ever.
- **Season estimators**: `PitcherSeasonStats` carries `fip`, `xfip` and `xera` beside ERA. `leagueRates.ts` holds the two curated league constants they need (`FIP_CONSTANT`, `LEAGUE_HR_PER_FB`) plus `fipLike()` and `ipToOuts()` — FIP and xFIP differ only in whether the home-run term is his own or his fly balls at the league rate. FIP is computed in `mlbStats.ts` from the MLB line; **xFIP can't be**, since nothing there counts fly balls (the boxscore has batted-ball *outs* only), so `getSeasonArsenal` now also returns a `BattedBallMix` off the same season CSV it already downloads and `getReport::withXfip` fills it in on a copy of the cached line. Both are null under 3 innings, where the number is noise. The arsenal's storage key is `-v5` because a stale blob deserializes with the newer fields missing and silently costs every pitcher what they feed — v2 added the fly balls behind his xFIP, v3 the per-game `appearances` (see the game log), and v4 the movement samples the Arsenal tab's dot cloud is drawn from (a v3 blob would leave that plot empty for six hours with its legend and its league blobs intact, which reads as a pitcher who threw nothing rather than as a stale blob). **v5 is the subtler version of that same hazard**: nothing was added, the *sampling rule* changed, so a v4 blob deserializes perfectly and holds the old allocation — 240 points with a floor of ten under every pitch type — and the plot would go on overstating a rare pitch tenfold for six hours off a blob nothing could tell was stale. **A version guards the meaning of what is stored, not only its shape.** **xERA is neither computed nor per-pitcher**: it's Statcast's own model, so `expectedStats.ts` reads Savant's expected-statistics leaderboard — every pitcher in one CSV (`min=1`, or the September call-up and most of the bullpen would be filtered out), cached 6h in memory and in the storage tier the way `teamHitting.ts` caches the league's hitting, and a failed fetch resolves to an empty map rather than 502ing a report that already has the outing. `getReport::withEstimators` fills both it and xFIP onto a copy of the cached season line; a **split** gets neither, the leaderboard not splitting and a split's line having no innings.
- **Opposing lineup**: `PlayerGame.opponentId` rides on every game, and `getReport` attaches `opponentHitting` to a *pitcher's* games (`teamHitting.ts::getTeamHitting`) — the **season, all games** cut, which is the opponent table's opening state and is why that table draws with no request of its own. What that module answers with is **nine cuts** rather than three: a window, a venue and a hand, whole league, each ranked within its own population. It is computed from the per-date Savant exports rather than read from MLB, and the whole of that — why MLB cannot be asked for a windowed or home-only platoon split, how a day reduces to four leaves plus a game count, why runs are read off the score progression, and the validation against MLB's own numbers — is in **Data sources**, *Team hitting: nine cuts a window*. Two rules of the old module survive unchanged: **ranks are computed here, not read off the API**, which ranks by its own default sort and doesn't rank splits at all (ties share a rank, and **1st is always the best offence** — so the fewest strikeouts ranks 1st, not 30th); and **a failed lookup resolves to null**, the opponent's line being context on a card that must never 502 a report which already has the outing. Note a **team's** hand split is by the hand of the pitcher they faced, so a lefty's card marks `vsLeft`.
### The Arsenal tab's two charts

**The tab is third on a pitcher, directly after the percentile card**, where it
used to trail the Game Log. Same argument that put Splits there: the card and
these two charts are both a picture of *what kind of pitcher this is* — what he
throws and where it moves — where Stats and the Game Log are the numbers he has
put up, and a reader deciding about a stranger takes the pictures first. It also
stops the one pitcher-only tab being the one furthest along a strip that scrolls
on a phone: measured at 390px, Arsenal is now fully in view at `scrollLeft 0`
where it was the seventh of eight.

**`components/ArsenalCharts.tsx` recreates the two pictures a Baseball Savant
pitcher page leads with** — **Pitch Usage** and **Movement Profile (Induced
Break)** — and they are now the whole of the tab. They are what a reader opens
an arsenal *for*: what he throws, and where it moves.

**The rows and the split control went, and each was saying again what a picture
says better.** The tab shipped with the charts *above* a `SeasonArsenalRow` per
pitch and an Overall / vs RHB / vs LHB `SplitTabs` over the lot, which is the
shape it had before the charts existed with the charts pasted on top.

- **The split tabs are subsumed by the usage chart**, which draws vs LHH and vs
  RHH side by side *always*. A control that switches the entire tab between two
  of the three columns already on screen is a second, narrower way to ask a
  question the chart has answered — and it quietly cut the movement cloud to a
  third of itself for no reason the reader could see. (`SplitTabs` itself stays:
  the pitcher card's Line and Arsenal sections are its live callers, and the
  outing page still draws it.)
- **The rows are the velo / spin / break / results table**, which is what the
  movement plot, the legend under it and the callouts now carry between them.

The samples are handed to the chart whole for the same reason: with no split
control there is nothing to cut them by, and the cloud is the pitcher's season.
The tab is **two charts and nothing else** — no note, no rows, no control —
which took it from roughly three screens to one.

**They share one selection, held by the tab.** Picking out the slider in one
picks it out in the other, because they are two views of one arsenal — a
selection each would be two answers to "which pitch am I looking at" on one
screen. `ArsenalTab` owns `hovered` for the same reason it owns the split.

**Hover is for pointers and the press is for everyone.** Every highlightable
thing is a real `<button>` — the usage rows, the legend columns — so a touch
reader taps to select and taps again to clear, and the `:hover` tints sit
inside `@media (hover: hover)`. That is the app-wide rule (**Client**, *A card
doesn't highlight when you scroll past it*), and it matters more here than
usual: on touch there is no pointer to move away, so a hover-only chart would
be a chart that stays stuck on whatever the finger last crossed.

**The pitch colours do not theme.** They are `lib.ts::pitchStyle`'s — Savant's
own palette, already shared with the arsenal rows, the per-game rows and the
pitch dots in a plate appearance — so a four-seamer is that red in Midnight and
in Lavender alike, the way a club's cap logo is its own colours. Everything
around them is tokens.

#### Pitch Usage: a butterfly, not a bar chart

The pitch runs down the middle and how often he goes to it against each side of
the plate grows **outward from it**, so the two hands read against each other
across the pitch they belong to rather than down two separate columns.

**The bars are scaled to the widest pitch on the chart, not to 100%** — checked
against Savant's own rendering, whose proportions are relative (15/64, 6/64 and
13/64 of the track for a 64% four-seamer's 15%, 6% and 13% neighbours). At
absolute scale every arsenal but a one-pitch reliever's would sit in the left
fifth of its track, and the comparison a reader makes here is between *these*
pitches. The exact figure is printed beside every bar, so the relative scale
hides nothing. **One scale across all three columns**, so a bar reaching further
really is a pitch thrown more often.

**Selected, the badge grows into the pitch's full name and takes the figure's
place**, which is Savant's own move. The middle column is a fixed width, so
nothing either side of it shifts while that happens.

**It is drawn tight.** The table is five rows of one number each and had been
laid out like a card — a 26px badge in a 36px row, 13px figures, a 22px bar —
which spent most of a screen saying very little. At a 22px badge in a **26px**
row, 12px figures and an 18px bar it says the same thing in **177px against
228**, and the chart under it comes up the page by the difference. Nothing was
removed to get there: the same five rows, the same three columns, the same
figures.

**The badge's ink is computed, not chosen** (`inkOn`). The palette spans a
crimson four-seamer and a near-yellow slider, so no single ink serves it — white
on `#c9b200` measures **2.0:1**, well under what an 11px bold badge owes
anybody. WCAG relative luminance, then whichever of black or white contrasts
more; the same test the League table's rank badge settled its own ink with.

**A pitcher who has faced only one hand gets no butterfly** (`.pu-chart.solo`),
the middle column being the whole chart.

#### Movement Profile: the pitches themselves, not one bubble each

Every dot is a real pitch. **That is the whole point of the server shipping
samples** — the spread *within* a pitch type is what a reader is looking at, and
a slider that sometimes cuts and sometimes sweeps is two clusters under one
average that a single bubble would hide.

**Each dot is outlined in a darker version of its own colour** (`darken`, the
fill's channels at 0.62). Without an edge, sixty-four overlapping four-seamers
are a single blob whose shape says how *far* the pitches spread and nothing
about how many are stacked where — which is half of what a cloud is for. The
outline is the dot's **own** colour rather than a neutral: a grey or black ring
would be a second thing to look at on a chart already carrying five colours, and
it reads as ink rather than as the edge of the mark. It is multiplied in JS
rather than mixed toward black in CSS because this is an SVG `stroke`
**attribute**, where `color-mix()` is not something to lean on. The fill went
**0.75 → 0.82** with it: the outline does the separating now, so the fill no
longer has to be see-through to do it.

**One dot per percent of his pitches**, so a pitch he throws a tenth of the time
gets ten dots and the cloud's densities *are* his usage — countable, not just
comparable. That replaced a 240-dot budget with a **floor of ten per pitch
type**, and the floor is what broke the correspondence: a 1% changeup drew the
same ten dots as a 10% one, overstating it tenfold on the very chart whose
densities are meant to say how often he goes to it. Measured on a real arsenal,
before → after: `4-Seam 153 → 64, Cutter 32 → 13, Slider 26 → 11, Curveball
25 → 11, Changeup 10 → 1`, against usages of 63.9 / 13.2 / 11.0 / 10.6 / 1.3%.
A pitch that survives `aggregate` still gets **at least one** dot, so nothing in
the legend is missing from the plot. What it costs is the spread of a pitch
thrown a handful of times — which is a spread there was never much evidence for,
and the hatched league blob and the AVG marker still place it.

**The axes need no handedness case, and this was the one thing worth checking
before anything was drawn.** The app's `hBreak` is positive toward third base
and `vBreak` is positive upward for a pitcher of either hand, which turns out to
be exactly Savant's own plotting convention with the sign already the right way
round. Verified against Savant's rendering of the same pitcher, and then in the
browser against a left-hander: a RHP's four-seam at `hBreak +11` sits up and to
the right on both, and **Chris Sale's at −14.6 sits up and to the left**, which
is where a left-hander's arm-side run belongs. No flip, no per-hand branch.

**The domain is fixed at 24", not fitted to the pitcher**, so two pitchers'
charts can be read against each other. It is wide enough that only a genuine
outlier lands outside the last ring (measured on a real arsenal: the widest
pitch was 21"), and the soft disc extends a little past it so such a pitch still
lands on something.

**Only the solid rings carry a figure.** Savant labels its inner rings on one
side only, which keeps a right-hander's fastball quadrant clear and would crowd
a left-hander's; labelling the two solid rings on all four arms is symmetric,
handedness-neutral and leaves the middle — where the pitches are — clear, with
the dashed rings reading as the halves they are.

**The league average is a hatched blob rather than a point**, as wide as the
league's own spread (`leagueHRange`/`leagueVRange`). "Average" is a cloud too,
and a bare dot would invite a reader to treat half an inch of daylight as a
difference.

**The selected pitch's own figures are in the callout row above the plot, not on
the leader lines.** Savant rotates a label along each leader, which works
because those labels are the only thing in that space; here both legs collapse
toward nothing as a pitch approaches the origin, and a slider at 3.5" break and
2.2" rise left two 80px boxes stacked on each other **and on the AVG marker** —
a picture of the collision rather than of the pitch. Off the plot they cannot
collide at any geometry, and they gain the room to carry the league comparison
in the same breath (`Break 3.5" · 3.0" less than league`). **A leg is drawn only
when it is longer than the marker's own radius**, for the same reason: two stubs
behind a 15px bubble read as specks rather than as a measurement.

**"More" and "less" are said of the quantity just named, and the sign flips with
the pitch.** A curveball whose induced break is *above* the league's has **less
drop**, not more rise — so the comparison reads off `vBreak`'s own sign as well
as the difference's. Checked in the browser: the curve reads `Drop 8.2" · 0.3"
less than league` and the four-seam `Rise 15.4" · 0.1" less than league`, both
agreeing exactly with the ▲▼ deltas on the rows below, which are computed
independently from the same league fields.

**The callout row reserves its own height with a hidden copy of a real pitch's
chips** rather than a declared `min-height` — the chips wrap to two rows on a
phone and one on a desktop, so any fixed number would be wrong at one of those
widths and would shift the plot under the reader's finger the moment they picked
a pitch. The same trick `.spl-head-mark--ghost` uses on the Splits card, and it
took two goes: a ghost sitting *beside* an empty real row is two margins where
the selected state has one, which is exactly the 6px of shift it exists to
prevent. **The ghost and the live text now share one grid cell** — the Columns
dialog's own hint-line trick — so the space the chips will need carries, at
rest, the sentence that says how to get them (`Pick a pitch to compare it with
the league`) rather than sitting empty. Reserved space with something in it
beats reserved space without.

**The legend is transposed the way Savant's is** — a column per pitch, a row per
measure — with the label column and every pitch column sharing one row template,
so `Usage` lines up with the usage figures without either side hard-coding the
other's height. The labels **stay on a phone**, at a smaller size: three
unlabelled numbers under a swatch are not a legend.

**A column is headed by the pitch's abbreviation, and by its whole name when it
is the one being read.** Five full names across a 470px chart wraps `4-Seam
Fastball` onto two lines and pushes the numbers under it apart, and only one
column is ever the answer to a question — so `FF` at rest and `4-Seam Fastball`
selected, which is the move the usage badge already makes one chart up. The full
name is **absolutely placed**, so the grid holds still while it appears and it is
free to overhang the columns either side, which are dimmed at that moment anyway.
Checked at the narrowest width the app draws: at 320px every one of the five
names stays inside both the chart and the viewport when selected (`4-Seam
Fastball` runs x=34…123 of a 16…304 chart), and a name forced longer than any in
the vocabulary still fits.

**The abbreviation is *not* in the pitch's own colour**, which is worth writing
down because it is the obvious thing to try and it cannot be made to work. That
palette is built to be a **fill** with computed ink over it (`inkOn`); as *text*
it fails on one scheme or the other for nearly every pitch — measured against the
two page grounds, **6 of 9 land under 3:1 on Lavender** (the slider at 1.90, the
curve at 1.65) **and FC and KC under 3:1 on Midnight**, with no value clearing
4.5:1 in both. There is no per-pitch colour that reads on both themes, so the
abbreviation takes the app's own ink and the swatch directly below it carries the
colour, which is what a legend swatch is for.

**An `InfoKey` carries what the chart cannot say for itself** — that the rings
are inches, that the vertical axis is *induced* break rather than total drop,
and what the hatching means. The app's own disclosure, for that component's
stated reasons, anchored to the title row rather than to its own 30px button
(the `.roll-key` trick: a shrink-to-fit against the button resolves to 180px,
and a 320px panel fits from neither of the button's edges on a phone).

#### What is deliberately not recreated

**The arm-angle figure and its silhouette.** It is a separate Savant dataset
(`pitcherArmAngles`) this app does not read, and inventing one from the break
would be a guess drawn as a measurement.

**The "100 pitch sample" toggle.** The cloud is 100 dots by construction now —
one per percent — so the control would toggle between that and itself.

**Savant's own `RHP AVG` velocity row** reads `Lg avg` here, because
`pitchLeague.ts` is not split by hand — the label says what the number is.

#### A missing field must not unmount the app

**The first thing this shipped with was a client that trusted the server to be
the same build**, and a stale dev server found it in minutes: `arsenal.samples`
absent → `undefined.filter` → **`#root` with 0 children**, the whole application
gone rather than one chart. Measured, before the guard.

**`SeasonArsenal.samples` is declared non-optional and the two `types.ts` are
mirrored by hand**, so TypeScript cannot see this coming — it is precisely the
hazard that mirroring carries, and the window is real rather than theoretical: a
deploy puts the new client at the edge while a warm Lambda is still on the older
build. So the tab reads `arsenal.samples ?? []`, `MovementChart` guards its own
prop as well (it is exported, and a chart that can blank the app is too sharp an
edge to leave on one caller's discipline), `season` is checked with `!= null` so
an unnamed season prints nothing rather than `undefined`, and a league blob whose
spread is missing is **not drawn at all** — `rx="NaN"` is an invalid attribute
that paints nothing anyway, and "we cannot say how wide the league is here" is
the honest reading.

**Measured against a genuinely stale server**, before → after: `#root` children
**0 → 1**, arsenal rows 0 → 5, charts 0 → 2, exceptions 1 → **0**, NaN
attributes 5 → 0. The Pitch Usage chart is *fully* working in that state, being
drawn from fields the older build does send; what is lost is the dot cloud and
the league blobs, which is the right thing to lose. Against a current server the
guards cost nothing: 246 dots, 5 blobs, 0 NaN attributes, the year back in the
title.

#### Measured

**Driven in a browser against the live 2026 season** at 320 / 390 / 480 / 640 /
900 / 1400: **0 horizontal overflow of the page body and of the player-page view
at every width**, 0 clipped cells in either chart, the legend's row labels drawn
at every one, and **the plot's top identical before and after selecting a
pitch** at all six (570 / 516 / 489 / 489 / 435 / 435 once the usage table was
condensed; 659 / 603 / 576 / 576 / 522 / 522 before that, and 698 / 642 / 615 /
615 / 561 / 561 when the tab still carried the rows and the split control). The SVG is 288px at 320
and caps at 470. 246 dots, 5 usage rows, 5 legend columns on a five-pitch
arsenal; the split tabs cut the cloud to **146 dots vs LHB and 100 vs RHB**,
matching the `stand` counts on the wire, with the legend re-sorting to that
split's own usage. Both colour schemes checked. `Escape` with the info key open
closes the key and leaves the player page standing, then closes the page —
**with a real key event**; a synthetic `window.dispatchEvent` targets `window`
rather than the focused element and collapses the ladder, which is a property of
that test rather than of the app.

**At rest** — which is the state that matters most, and the one a stale dev
server hid for a while — the plot draws the **whole cloud and every league blob**
with nothing dimmed: 246 dots and 5 hatched blobs on a five-pitch right-hander,
241 and 4 on a four-pitch left-hander, and 0 dimmed dots in both. Selecting
lights one type and dims the rest (26/246 dots, 1/5 blobs, the AVG marker in);
deselecting restores all 246 with the marker gone.

**The payload halved on the way**, twice over: 100 points rather than 240, and a
point that is `{ pitchType, hBreak, vBreak }` rather than five fields — `velo`
and `stand` went with their last reader when the split tabs did (the rule
`teamProbablePitcher`'s removal sets), and each is one line to put back if a
per-dot tooltip or a per-hand cloud ever wants it. **3,109 → 1,718 bytes
gzipped**, measured through the route.

**Bundle: 529.65 → 537.27 KB of JS** (156.66 → 159.08 gzipped) and **134.44 →
140.71 KB of CSS** (23.64 → 24.86) — 7.6KB and 6.3KB raw, 2.4KB and 1.2KB over
the wire, for two charts, a shared selection, an explainer and the paragraphs
above restated where the rules are; stripping the rows and the split plumbing
gave 2.4KB of it back.

**And `MovementSample` is one declaration per workspace again.** It had two on
the server — `pitcherArsenal.ts`'s own and a copy in `types.ts` — and `tsc`
could not see them drift, nothing importing the duplicate; by the time it was
noticed the copy in `types.ts` was still carrying two fields the wire had
stopped sending. The wire shape lives in `types.ts`, which is the file mirrored
by hand into the client, and `pitcherArsenal.ts` imports and re-exports it.

**One number worth knowing about, and it is not this change's.** The curated
`Slider` league horizontal break in `pitchLeague.ts` is **6.5"** where Savant's
own 2026 right-hander table says **3.88"** — most other entries match closely
(four-seam 8.0 against 7.76, sinker 15.0 against 14.73, curve 8.5 against 8.17).
It puts a slider's hatched league blob further from the plate's centre than
Savant's does, and it moves the ▲▼ arrow on every slider row in the app, which
is why it was left alone here rather than corrected as a side effect of drawing
a chart.


- **Client**: **`PitcherCard` no longer renders anywhere, and neither does `PlayerCard`.** They were the Games view's cards, and that view is gone — folded into the feed as a grouping, and from there onto the player page as its Overview tab (see **Client**). Their *parts* very much live on, which is why both files stay: `PitchingTag`, `lineSummary` and `OpponentSection` here, `GameStatusBadge` next door (and `PlatoonSplit`, which the feed's Upcoming row read until it took `PlatoonSplits`' own card instead), all read by `LiveFeed` and, through it, by `PlayerDay.tsx`, plus everything `PitcherCard.tsx` imports from `PlayerCard.tsx`. What is unrendered is the two top-level components and the pieces only they used (`CardSection`, `GameLine`), which rollup drops from the bundle — 442KB to 425.
  **All four sections are back, as a page.** The Games view took a pitcher's per-game **Line** (the `.ars-row` with its Results / Rates / Contact strips), the **Opponent** lineup and his per-game **Arsenal** off screen with it, and the way back to them was `OutingBreakdown`: a **Full breakdown** button inside the opened outing dialog, raising a *second* `Modal` over the three sections the item hasn't got. That is now **`OutingPage`** (`components/OutingPage.tsx`) — one full-screen page, the shape `PlayerDetails` (`.details-view`) and `LeagueMatchupView` (`.mup-view`) already have, opening straight onto the full read under a tab strip: **`Line · Innings · Opponent · Arsenal`**.

  **The passage this replaces argued for the two dialogs, and its argument was about the button rather than the box.** It read: *the feed's outing item deliberately opens onto `InningsList` alone, an item being a stream entry rather than a full read* — and then bolted a door onto that stream entry to reach the read anyway. Two presses and two stacked dialogs to see a pitcher's line is a ladder built on a decision the second press immediately overturns; the honest reading is that pressing an outing **is** asking for the full read, so it should land on one. It also stops the innings and the line being two different kinds of thing: they are four tabs of one page now, in the order an outing is read — what he did, how it went inning by inning, whom he faced, what he threw.

  **Line is the default tab**, being the thing you open a pitcher's outing for; Innings is second because it is the narrative, and the two behind them are context. **Opponent and Arsenal are drawn only when there is something in them** (`game.opponentHitting`, and a non-empty `pitchMix`), so a relief appearance with no arsenal data gets three tabs rather than a fourth that says nothing — the rule `SplitTabs` already follows for a hand he never faced.

  **The sections are the card's own components** (`GameLine`, `OpponentSection`, `ArsenalSection`, `InningsList`), not a second rendering of the same numbers: a page that drifted from the card it replaces would be worse than the gap it fills, which is also why `PitcherCard` stays rather than being deleted for parts. What each gained is a **`bare`** mode. Inside a page opened *for* a section, under a tab strip that has just named it, a `.game-sub-bar` reading `Line` over the line is the same word twice — and a *collapsible* one offers to hide the only thing on screen. So `CardSection` has three modes: a toggle (the card), a static label (`defaultOpen`, which the old breakdown used), and no heading at all (`bare`). Measured on the page: **0 `.section-title`** elements.

  **The page is portalled to `document.body`, and that is a requirement rather than a habit.** `.app-dialog-body` declares `container-type: inline-size` — which the plate-appearance detail's own `@container` queries need — and layout containment makes a box **a containing block for `position: fixed` descendants**. A page rendered in the tree where the Game Log's popup draws its outing would therefore be laid out *inside that popup*. The portal is what makes “full-screen” mean the screen from all four entry points.

  **Its layer is read from context rather than declared**, which is the genuinely delicate part: the outing is reached at three different depths. In the feed stream nothing is above it (**46**). On a **matchup team page** (`.mup-view`, 48) it opens at **49**. Inside the **player page** (50) — from the Overview tab's game card and from a Game Log row alike — it opens at **51**. No fixed z-index serves all three: 50 would sit level with the page that opened it and pointlessly over the feed. So `OutingPage` reads `DialogLayerContext`, takes `host + 1`, and **provides its own layer downward**, so the inning dialog inside it climbs one more (47 / 50 / 52) and a faced batter one more again (48 / 51 / 53). `.outing-view { z-index: 46 }` in the stylesheet is the floor for the no-host case; the rung is written inline whenever there is a host. **It was four depths and the two player-page ones were 52 apiece**, each behind a `PlayerDayModal` at 51; that box is a batter's alone now, so both routes lost a rung — see **Client — the player page**, *A pitcher's game opens the outing, not a box in front of it*.

  **And `.outing-view` joins `OVERLAYS`** — the selector `overlayAbove` and the background-mark registry read — with a note there that it is the one member of that list whose layer is *not* fixed, so `layerOf` has to read it off the element. Without it the box under an open outing page (the Game Log's popup, a matchup page) would answer Escape alongside it, which is the fault that list exists to prevent.

  **Driven from every entry point at 1200×900 and 390×844**, one press of Escape undoing one thing at each rung and no `inert` mark left at the end of any of them: the **feed** 46 → 47 → 48 (three presses, focus back to the inning bar and then to `.feed-item-toggle` — checked with a real mouse press, `HTMLElement.click()` not focusing its target and so restoring to the body); a **matchup team page** 48 → 49 → 50; the **Overview** tab 50 → 51 → 52; and the **Game Log** popup 50 → 51 → 52 → 53 → 54, five presses. **The last two of those are one rung shorter now** — a pitcher's Game Log row and his Overview game card open the page rather than a popup in front of it, so the Overview reads 50 → 51 and the Game Log 50 → 51 → 52 → 53; see the paragraph below. `[inert]` at the deepest feed rung is `#root`, `.details-view`, `.app-dialog`, and the top box is never itself inert.

  **Geometry**, same build, five widths (320 / 390 / 640 / 1200 / 1920): the view is the window at every one, `.details-chrome` is **194 / 163 / 120 / 120 / 120px** tall (the head wraps under 640), and the head, the tab strip and the tab body share one **860px** column — `--card-column` + 60, the width `.details-arsenal` already uses, and scoped to this page so its head does not sit at the player page's 680 over a body at 860. **Page-body overflow 0 and view overflow 0 at every width on every tab.** The opponent table fits its pane from 640 up (0 sideways scroll, 858px inside 860 at 1200) and scrolls on a phone as every wide table here does; the tab strip itself scrolls sideways at 320 (38px) and fits from 390 up.

  **Bundle: 522.29 → 523.62 KB of JS** (154.38 → 154.73 gzipped) and **126.34 → 126.59 KB of CSS** (22.44 → 22.48) — 1.3KB and 0.25KB raw, 0.35KB and 0.04KB over the wire, for a page that replaced two dialogs; the CSS is nearly all the comments arguing the borrowed shape, one rule block having gone with `OutingBreakdown`.

  **The `Full breakdown` button does not survive at all, and this paragraph used to say it did.** It read: *the button survives in exactly one place, and it is a door rather than a leftover — see the Game Log's popup, which keeps its inline innings.* That was true of a popup that had a reason to be there, and it no longer has one: a pitcher's Game Log row and his Overview game card open **this page** now, so the box the button was the door out of is not drawn for a pitcher at all. `detailInline`, `.feed-item-toggle.static` and `.outing-breakdown-btn` went with it, on the rule `teamProbablePitcher` already sets — *a field nobody reads is a field nobody misses*. See **Client — the player page**, *A pitcher's game opens the outing, not a box in front of it*, and **Client — the Feed view** for the reversal stated where it was argued.

  The card as it stood: `PitcherCard.tsx` renders four collapsible `CardSection`s, in this order: **Line** (`GameLine`), **Innings** (batters faced, grouped by inning), **Opponent**, **Arsenal**. Its header speaks for **one game only while the range in view is one day** (`singleDay && pitched.length === 1`) — the role chip, the decision, the final-score badge and now the header line itself all belong to a particular outing. Gating that on the *outing count* instead, which is what it used to do, read a week two different ways depending on the pitcher's role: a starter makes one start in it and got a card identical to a single day's — one line, one W, one final score, as though that game were the week — while the reliever below him made five appearances and got a bare aggregate. Over a range every pitcher now reads the same: the credits **tallied** (`creditTally`, counted off the per-game `decision` since `PitchingLine` carries wins/saves/holds but no losses) ahead of `N G · ` and the combined line. The **no-outing** card follows the same rule for its badge list — over a week those are his team's games, not his, and seven of them ran off the right of the card. `CardSection`'s toggle bar *is* the batter card's `.game-sub-bar` (plus `.section-bar` to adapt it to a `<button>`), so both cards' expandables share one format — a bare label, no sub, no caret. **Only Line is open when a card first expands** (`CardSection`'s `defaultOpen`, off by default): opening a pitcher used to unroll all four sections at once — a screen and a half of tables before the next player — so the rest now start as bars, and the game line, the one thing you open a pitcher's card for, reads first. **Nothing on the pitcher side carries a caret** — not the card's sections, not its inning blocks or batters faced, and not the feed's collapsible outing (`.feed-item-toggle`, the line bar under its header): the bar *is* the affordance, and the only triangle allowed near an inning is the half-inning top/bottom indicator, which is a label rather than a toggle. This keeps getting re-added; don't. The game line deliberately reuses the arsenal row's parts instead of `StatPill`s so the two read as one table — an `.ars-row` accented by `decisionColor()` whose head carries the W/L/S, IP, pitch count and a `RateBar` for strike% (the shared labelled bar: label, track, percentage, then the raw counts — `66 S · 32 B` here), and which ends in three `.ars-results` strips: **Results** (H/2B/3B/HR/R/ER/BB/HBP/K), **Rates** (ERA/WHIP/BAA/K%/BB%/Whiff/CSW, plus WP and inherited-runners-scored only when nonzero) and **Contact** (`battedBallStats()` over the faced batters: BIP, avg/max EV, 95+%, GB/LD/FB — derived from the plays because the boxscore has no exit velocity and only counts batted-ball outs). (A credit chip — **W/L/S/HLD**, `creditLabel()`; a bare "H" would read as a hit — sits in the card header, on the game line's head and on the feed's outing row, all off the one `PitcherGame.decision` field. A hold takes the same relief amber as the RP chip.) **Opponent** sits *below* Innings and takes the same toggle bar as the sections around it — but only on a card with an outing under it: once he's thrown a pitch this is background to a game that has its own story, so it reads last and folds away. `OpponentSection`'s `collapsible` prop drives that; without it (the **no-outing card** and the feed's Upcoming row) the heading is a plain `.opp-title` label — no frame, and none of the 46px `.game-sub-bar` reserves for the controls a collapsible one carries — because there it's the whole point of the card and a toggle would only offer to hide the one thing worth reading. It reads: **how the opposing lineup has hit, whole and by the hand on the mound, over a span the reader picks and cut to home games, road games or both.** That non-collapsible form is also the whole of the **no-outing card**, which is otherwise header-only: a pitcher with a scheduled or in-progress game he hasn't entered becomes collapsible and opens straight onto this section, since who's waiting for him is the only thing that card can say before first pitch (a game he *sat out* isn't offered — the lineup he didn't face is nothing). That card takes `.empty`'s **dashed border only when he can't still take the ball** — no game at all, or every one of them over (or called off) without him. The dashed edge claims nothing is coming, so a scheduled or in-progress game keeps the card solid. His hand normally comes off `game.stand`, which a pitcher's game only has once he's appeared in one, so `PlayerReport.throws` (from `getRosterInfo`'s `pitchHand`) stands in — without it the split, the useful half, would be missing in exactly the pre-game case this is for. It is a **table** — nine categories across, and **Overall / vs RHP / vs LHP** down — where it was three stat strips, and the shape is the point: those are the same nine questions asked three ways, so a reader wants to run their eye *down* a column ("is this lineup worse against lefties, and by how much") and three separate strips of label-and-value pairs made you do that by memory. Rows and columns is the app's own answer everywhere else it comes up, and the table is folded into **`.glog-table` / `.glog-scroll`**'s selector lists rather than restyled to resemble them — one set of paddings, one zebra stripe, one pinned left edge, one sticky header. What it deliberately does **not** take is the log's `cursor: pointer` and row hover, which say a row is a press: nothing here is.

**It takes the three things it reads rather than a whole `PlayerGame`** — `hitting` (the season, all-games cut), `opponent` (the club, for the corner header) and `hand` (which row is accented) — and that is a fourth caller's doing: the player page's **Projected Starts** block opens this same table off a `ProjectedStart`, which is a `gamePk`, a date and an opponent id with no game behind it at all. The whole of that argument, and why the `game.stand ?? throws` fallback moved *out* to the callers, is in **Client — the player page**, *`OpponentSection` takes what it reads, and a start is not a game*. Nothing about the other call sites changed but one line each; measured after, the feed's Upcoming dialog still reads `SD · vs RHP` off `stand` and the outing page's **Opponent** tab `MIL · vs LHP`. (That second one was the `Full breakdown` dialog when it was measured — the two landed in the same merge, and it is the same section under a tab now, taking `bare` where the dialog took `defaultOpen`.)

**Two controls sit above it.** A **span** — `Season · 7d · 15d · 30d · 60d`, deliberately the research board's own five so "the last 30 days" means one thing everywhere in the app — and a **venue**, `All Games · Home · Away`. Both are the app's segmented switch, folded onto `.view-switch`/`.view-tab` rather than restyled, and both `flex: none` so a narrow card breaks between the two rather than inside one. They compose: picking `Away` and then `Season` gives the away half of the season, which is the whole reason the nine cuts ship together.

**Only the span costs a request.** The report already carries the **season, all games** cut for every opponent in view (`PlayerGame.opponentHitting`), so the table's opening state draws with no fetch at all; `/api/teams/:id/hitting?window=` serves the other four, and each answers with **all three venues**, so changing that control is free. A span read once is kept for the life of the card. The wait for an unread span is a **block wait behind `WAIT_DELAY`** rather than the previous span's numbers left standing — that is the one place this parts from "never blank over data", and for a stated reason: the old table under a lit `15d` would be a wrong label on a right table, which is worse than a moment of nothing. A failed read says so and **pressing the lit span again retries** (`attempt`, bumped when the reader presses the span already selected — `setWindow` to the value it holds changes nothing, so without it the message would promise a retry the effect never runs).

**Every number keeps its league rank**, and it is `.col-rank` under the value now rather than `.ars-rnote` beside it — the research board's own percentile badge folded onto rather than restyled, so a second line under a number is one object in this app, and a rank costs the column no width. A rank is what makes a team line readable at all: `.231` says nothing until you know it is 28th. **1st is always the best offence**, so the fewest strikeouts ranks 1st rather than 30th, and **each cut ranks within its own population** — a 30-day home-vs-LHP line against the other 29 teams' 30-day home-vs-LHP lines, never against the season board. The four columns with no rank are the ones a rank would say nothing about: games, plate appearances, and — where there is nothing to rank against — a cut nobody batted in.

**The row matching the pitcher's own hand is accented**, the way the Splits card marks the half that applies to a game, with the reason in its title rather than a third line of text. His hand normally comes off `game.stand`, which a pitcher's game only has once he has appeared in one, so `PlayerReport.throws` stands in — without it the row that matters would be unmarked in exactly the pre-game case this is for. The cells keep the zebra ground rather than taking a wash: a band across the row would be a second colour system beside the rank badges, which is the argument the League table's own row wash lost.

**The gutter reads the container rather than the viewport**, which is the one place the table parts from the log's shared clamp and is a measurement rather than a preference. Every other wide table in the app grows with the window, so `vw` is the right signal for them; this one lives in a dialog capped at `--card-column`, so at 1920 the shared clamp opened to its full 28px and pushed eleven columns **204px past a pane that had stopped growing at 800**. `cqi` against `.app-dialog-body` — already a container for the plate-appearance detail's own queries — tracks the box the table is actually in, capped at 13px for the research board's reason: eleven columns and no slack. Measured, that takes the table 972 → 768px inside a 770px pane, i.e. from 204px of sideways scroll to none.

**Measured at 320 / 390 / 640 / 900 / 1200 / 1920**, in the Upcoming dialog: the table fits its pane with **0 sideways scroll from 640 up** and scrolls on a phone as every wide table here does (226px at 320, 162 at 390), with the row-label column **pinned at 0** and the header row at 1px — which is the border — at every width, rows **58.55px** and the header **37.84**, and the page body and the dialog body each overflowing by **0** everywhere. The two controls share one line from 640 up and take two at 390.

The collapsed header's line is the **range in view** rather than the season (`rangePitchingSummary` — ERA · WHIP · K% · BB% over the outings on the card, and the matchup instead while `onePitchedGame` holds; see **Client** for the rule and its batter twin). The season line it replaced ran ERA · FIP · WHIP · K/9 · BB/9 · HR/9 and carried **no estimators**, for a reason that outlived it: xERA and xFIP used to ride along paired with the number each estimates (`2.20/3.04 ERA/xERA`), which doubled the width of the two leading items and turned a line meant to be scanned into one to be read. The pairing itself is right — the comparison is why they're carried, and it only lands if the two sit together — so it survives where there's room for it, on the **Season tab**, which puts each estimator immediately after the number it estimates and is now where the season line itself lives, whole and a tap away. The Line and Arsenal sections each carry their own `SplitTabs` — **Overall / vs RHB / vs LHB**, offering only a hand he actually faced and hiding itself when that leaves one option. On a split the head shows BF instead of IP and drops the decision, and Rates drops ERA/WHIP: a split's line is derived from the plays, so it has no innings (`splitOf()` returns null for Overall, which is what every "is this the whole outing" check reads). The arsenal is a **Savant-style color-coded table** (one row per pitch type: `pitchStyle()` dot+abbr, then two `RateBar`s — **Usage** with the pitch count and **Strike** with that type's S/B counts — then velo/spin/iVB/HB with ▲▼-vs-season deltas + whiff — the delta's **green/red is per pitch type**, from `PITCH_DIRECTIONS` (a `BetterWay` per metric): a four-seamer wants more iVB, a changeup/curveball wants less, a slider's iVB is `none` (uncolored, it sits near zero by design), and offspeed velo/`Sinker` spin are `none` too since neither is a quality signal on its own. HB uses `more` — its sign is only arm side vs glove side and flips with handedness, so the delta compares **magnitude**; without that, a lefty gaining break read as red — then a **Szn vs** Results strip carrying the same stats in the same order as the details tab's — PA/BA/SLG/wOBA/xwOBA/PutAway). **A split's season column is that same split of his season**, not his season as a whole: `attachArsenalBaselines` feeds the game's `vsRight`/`vsLeft` mixes from `SeasonArsenals.vsRight`/`vsLeft` (falling back to `all` per pitch type, for one he's barely thrown to that hand), and the strip's tag says which — **Szn vs RHB** / **Szn vs LHB**. Before that the baselines were season-wide on every tab, so switching to vs RHB moved the game numbers and left the season ones sitting still, comparing two different populations. Inside the Innings section the `InningBlock`s are bars carrying that inning's line (BF/H/R/ER/K/BB/pitches — `inningStats()`; ER only when it differs from R), each opening a dialog onto the result rows, each of which leads with its number within the inning (`.faced-seq`) and opens again onto the full pitch-by-pitch sequence. They were accordions when this card rendered; see **An inning is a popup** below. A batted ball there reads the **same line a batter's at-bat carries** — exit velo · launch angle · distance from `contactHighlight()` — on the row, and again in the opened detail beside the batted-ball type and xwOBA, the way `PlateAppearanceCard` lays it out. It used to print exit velo alone; the helper now takes the three batted-ball fields rather than a whole `PlateAppearance`, since `FacedBatter` carries them too and one contact should describe itself the same way from either side of it. **An inning block also carries what happened on the bases** — his balk, his wild pitch, the bag taken off him, the man he picked off (`InningBaseEvent`, off the same `PlayerGame.baseEvents` the feed reads; see **the base-event vocabulary** under Client for what is in that list and why the passed ball and the run are not). They are merged in on **`atBatNumber`** — which is why `FacedBatter` now carries one — and land *before* the batter of the same number, a balk happening in the middle of an at-bat where the batter's row is that at-bat's outcome. An event whose at-bat has no row at all goes to the end of its inning, which is exactly right for the one case that produces it: a caught stealing for the third out, where MLB files the play under the batter who was up and `savant.ts` drops it as the non-plate-appearance it is. The **groups are sorted by inning** rather than left in the order they were built, because that same case can produce an inning made of nothing but an event — a reliever brought in for one batter who picks the runner off to end it — and an inning first seen while merging the events would otherwise be appended after every inning he actually faced someone in: a half-inning at the wrong end of the outing, wherever the outing is drawn. It sits on a quieter ground, being background to the at-bat it happened inside, and is accented by the same four tones the feed's rail uses so one event is the one colour in both places. `.faced-seq` stays the *batter* count and skips them: it answers "which man of the inning is this", and a balk is not one of them — what the row carries at that end instead is **the count a steal went on**, where a batter's row carries his pitch count, that being the one thing about a steal neither the glyph nor MLB's line for the play ever says.

**It reads its whole story on the row now — badge, MLB's line, and the clip of it** — where it opened a dialog onto those last two. That dialog was right while these rows lived in an *inning block* squeezed into whatever box the outing was drawn in, since a video frame unrolled between two rows pushed the rest of the inning down the page; the inning is a dialog of its own now (below), and inside a box about one inning there is room to say what a base-running play *is*. A press onto a box holding one sentence would be a rung of the Escape ladder spent on nothing, so the row is the terminus and `InningBaseEvent` raises nothing at all. It was static once before, with its description hidden in a `title` a phone cannot show, which is not what this is: the line is printed, not hidden. `.faced-event` names the tone and the quieter ground on whichever of the two shapes it takes — the bare row, or the card it becomes once there is a line or a clip to carry — so neither is a second definition of the other.

### An inning is a popup, and the rung under it was given back

**This reverses a decision recorded a few paragraphs up, and the reversal is the point rather than an oversight.** What stood here was: *`FacedBatterCard` and `InningBaseEvent` are details about one thing, so each raises a `Modal`; an **inning** is a grouping, a list of rows each of which opens on its own account, so popping it would put the pitch sequence three dialogs deep from the feed and four from the Game Log's popup, and its accordion now grows the dialog's scroller rather than the page.* Every clause of that is still true as stated. What it left out is what a reader gets from a **batter's** game log row and did not get from a **pitcher's**.

**A batter's game opens as a feed.** A press on his Game Log row raises `PlayerDayModal` and inside it is a row per plate appearance with the clip of it underneath and the pitch-by-pitch a press away — the shape the whole app reads plays in. A pitcher's opened as a static bar and a stack of closed accordions, and unrolling one grew the box it was in: measured on Logan Webb's eight-inning start of 2026-08-09 at 1200×900, the popup's scroller went **501 → 751px** on opening the 4th and **→ 1001px** with the 6th open beside it, each open inning pushing every inning under it down a scroller the reader is *reading*. That is the exact complaint the accordion-to-popup sweep was written to answer everywhere else, and the "it's only the dialog's scroller" line was waving it away.

**So the inning takes a rung, and the rung under it is given back.** `InningBlock` is a bar that opens a `Modal` (`.inning-box`, `--card-column` like every other box holding a piece of the feed), and that dialog **is** the feed for that inning: its rows carry what the feed's rows carry.

- **A batter faced** keeps his press, because a pitch table and a strike-zone plot genuinely want a box — but the **clip moves out of it onto the row**, exactly as `FeedAtBat` carries a batter's and passes `showVideo={false}` into the card's own dialog. One at-bat drawn from the pitcher's side and the same at-bat drawn from the batter's now read as one thing in one app.
- **A base event stops being a press at all.** Its dialog held a sentence and a clip; both read on the row now, which is `FeedBaseEvent`'s own shape, and a press onto one sentence is a rung spent on nothing.

**What it costs, counted rather than waved at.** Presses to reach a pitch sequence from a Game Log row are **unchanged** — row, inning, batter, three either way. What moves is the Escape count on the deepest path, from two to three: `PlayerDayModal` (51) → the inning (52) → the batter (53), under the player page at 50, which is four presses in all. From the feed's stream it is outing (46) → inning (47) → batter (48). Both were driven in a browser and unwind exactly one thing per press, in both directions — see the ladder note below, which had to be fixed before any of this could be true.

**What it buys is that the list of innings holds still.** Bars all the way down: the same popup's scroller is **501px whatever the reader has open**, an eight-inning start is 382px of bars that fits a 390×844 phone whole, and the inning the reader asked for gets a box with its own scroller and a title naming it (`Logan Webb — Top of the 4th`). The bar's line is repeated at the head of that box (`.inning-box-line`), the bar carrying it being behind the dialog.

**One CSS trap was found by measuring rather than by reading, and it is worth keeping.** `.app-dialog-body` is a **column flex container with a bounded height**, and a flex item whose `overflow` is not `visible` has an automatic minimum size of **zero** — so `.faced-card`, which clips its own corners, *shrank* instead of overflowing and cut its own clip off inside itself: measured on a four-batter inning at 1200, cards 150px tall against the ~418 their contents ask for, each clip 640×360 by the box model and a 90px strip on the screen. The batter's plays next door never had it because `.feed-game-section` already wraps them and lets its overflow show. `.inning-batters` is that wrapper restored, and its own content-based minimum is what holds the list open and lets the dialog scroll (`scrollHeight` 665 → 1777 on the same inning).

**Measured on the live 2026 season.** Logan Webb, 2026-08-09, Game Log → the game (a dialog at 51 then, eight inning bars + `Full breakdown`, 501px; the outing page itself at 51 since) → `Top of the 4th` (52, four `.faced-card`s, four inline clips at 640×360, box 800px at 1200 and 358 at 390) → `Gleyber Torres — Reached On Error · Top 4` (53, pitch table and strike zone, **no clip in it**). Blake Snell, 2026-08-11, whose 4th holds a stolen base and two wild pitches: three `.faced-event` rows, **zero buttons among them**, three descriptions and three clips. No horizontal overflow of the page body at 390 or 1200 in any state. Bundle: **445.46 → 445.58 KB** of JS (131.59 → 131.66 gzipped) and **99.98 → 100.06 KB** of CSS (17.80 → 17.84), which is a tenth of a kilobyte each.

**What is still an accordion, and why the test survives its own reversal.** The grouping-against-detail test was not wrong; it was applied to a case where the *cost of the grouping staying open* had not been measured. Nothing else on the pitcher side changed: `CardSection` is still a plain label inside the breakdown, and the two unrendered cards' game blocks still collapse. The rule to carry forward is the sharper one — **a grouping may stay an accordion only while opening it does not push the thing the reader is reading**, and inside a bounded dialog scroller it always does.

**Innings read first-to-last everywhere, and `newestFirst` is gone.** `InningsList` took a flag that reversed them, which the feed passed so the half he was throwing sat directly under his name the way the stream around it reads newest-first. What that bought was one inning's convenience on a live outing; what it cost is that an outing was drawn in **two different orders in two places of the same app** — the card and the breakdown one way, the feed the other — with the reader expected to notice which. An outing is a thing with a beginning: a first inning at the top is how a box score, a game log and a scorebook all read it, and it is what makes "he lost it in the sixth" a sentence you can follow down the page. The live half is still marked (`.inning-block.active`), so nothing is lost by leaving it where it belongs in the sequence. Measured on a real outing in the feed, before → after: `5th 4th 3rd 2nd 1st` → `1st 2nd 3rd 4th 5th`, and the same list in the Overview tab's game dialog, the Game Log's popup and the breakdown. Batters faced always read in play order, live or final, and always did. While the watched pitcher is the one on the mound (`status.pitchingId`), the half-inning he's throwing gets `.inning-block.active` — a **`--mound-teal`** border, a 12% head tint and a **Live** tag, the same teal his row, his ring, his tag and his rail take, so "this man is working" reads as one thing across the app. It was `--live-purple`, on the reasoning that it is "the same purple the at-bat/on-base rings use" — which said *this pitcher is working* in the colour a **runner** wears, and is the collision the summary table's legend made visible; see **Client**, where the token and the measured gaps between all four role grounds are set out. The arsenal table itself lives in **`Arsenal.tsx`**, shared by both views: `ArsenalRow` (one game, ▲▼ vs the pitcher's own season — the outing page's Arsenal tab is its live caller), and the pieces it shares with what is left of the file. `SeasonArsenalRow` (the whole season, ▲▼ vs the **league**) was beside it until the player page's Arsenal tab became the two charts alone; it had exactly one caller, and every helper it used — `RateBar`, `ArsenalMetric`, `ResultStat`, `PITCH_DIRECTIONS`, `pct`/`avg3` — is read by `ArsenalRow` too, so removing it orphaned nothing. Those pieces, plus — `RateBar`, `ArsenalMetric`, `ResultStat`, `PITCH_DIRECTIONS`, `SplitTabs` (the Overall / vs RHB / vs LHB selector the pitcher card's Line and Arsenal sections use too) and the `pct`/`avg3` formatters. That pitch sequence (pitch table + `StrikeZone` plot, sharing a hover/tap highlight) lives in the shared `PitchSequence.tsx` — extracted from `PlateAppearanceCard`, which now reuses `PitchTable`. The innings themselves live in **`Innings.tsx`** for the same reason — `InningsList` (grouping + the live-inning accent), `InningBlock` and `FacedBatterCard` — so every place an outing is drawn reads it identically — and it takes no flag to say so, `newestFirst` having gone (above). Everything here still mirrors its batter counterpart: the inning bar takes the game bar's shape and raises a dialog rather than unrolling (see above, which is also why `useScrollIntoViewOnExpand` has no caller left in this file — nothing here moves the page any more), the faced-batter card takes `.pa-card`'s radius, left accent, hover tint and focus ring and opens a dialog exactly as `PlateAppearanceCard` does, carrying its clip on the row exactly as `FeedAtBat` does, and **nothing carries a caret** either way. The batter-name font shrinks on narrow cards via `@container` queries on `.faced-batter`. `SummaryTable` renders a pitcher sub-table (IP/H/R/ER/BB/K/HR, then the **W/SV/HLD** credits summed off `PitchingLine`, then ERA/WHIP — a credit column is dashed at zero, since almost every row is empty); `LiveFeed`'s pitcher tab renders one item per outing (`FeedPitcherGame`), whose bar raises a dialog holding that same `InningsList`, and `PlayerDay.tsx` draws that very item for one pitcher's day on the player page — where it is the **live** entry alone, a finished outing being a card that opens the outing page rather than a bar that unrolls; `PlayerDetails` gains an `isPitcher` prop. It used to draw it in the Game Log's popup too, with a **`detailInline`** flag that made the bar static and read the innings underneath, and that popup is a batter's alone now.
