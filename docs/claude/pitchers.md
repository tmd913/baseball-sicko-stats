### Pitchers on the roster

The roster holds both batters and pitchers, discriminated by `WatchPlayer.kind` / `PlayerReport.kind` (`'batter' | 'pitcher'`). The whole pipeline is written so **batter code paths are untouched**: `PlayerGame` gained one optional field `pitching: PitcherGame | null` (null for batters), and every client component branches on `report.kind === 'pitcher'`.

- **Role (starter / reliever)**: the pitcher-side mirror of a batter's lineup slot. `PlayerGame.pitchingRole` (`'starting' | 'relief' | null`) + `entryInning` live on `PlayerGame`, not `PitcherGame`, because the pre-game case has no outing to hang off (`rosterGame`'s placeholder). A starter is named by the boxscore — `teams[side].pitchers[0]`, filled from warmup on, else `gamesStarted` (`startingPitchers()` in `mlbStats.ts`, exposed as `StatsApiGame.pitchingStarters` and carried onto each `DayGame` as `pitchingStarterIds`); before first pitch the announced probable stands in, and only then, since a probable who never reaches the boxscore was scratched. Everything else is a reliever, with `entryInning` from the first batter he faced. The client reads it through `pitchingBadge` / `pitchingCorner` (`lib.ts`, alongside `lineupBadge`/`lineupCorner`, sharing the `Corner` type): an **SP** chip / pip, or **RP 7th** with the inning he came in. Rendered by `PitchingTag` on each game block's bar and the feed's outing/Upcoming rows, and as the headshot corner pip on the cards and in `SummaryTable`. **Not in the pitcher card's header summary line** — the pip beside the name already says it, under exactly the same condition (a lone game in view — which on the **no-outing** card is now any range holding one game rather than a lone game on a single day, a pip belonging to a game and not to a date), so a chip there was the same fact twice on one row.
- **Server**: `getStatsApiGame` builds a `pitchers` map by regrouping the SAME `allPlays` loop on `matchup.pitcher.id` (faced batters + all pitches), and reads `liveData.decisions` for the W/L/S pitcher ids (`StatsApiGame.decisions`); the authoritative per-game line comes from the boxscore (`parsePitchingLines`, needs `stats`/`pitching` in `FEED_FIELDS` — bumping `FEED_CACHE_VERSION` re-fetches cached finals; it's currently **8** — v2 added the boxscore line, v3 added `decisions` + the per-batter pitch sequence, v4 added `runners[].details.earned`, v5 added `responsiblePitcher`, v6 added the rest of the boxscore pitching line: `doubles`/`triples`/`hitBatsmen`/`atBats`/`intentionalWalks`/`wildPitches`/`inheritedRunners(Scored)`, v7 added the per-game `wins`/`saves`/`holds` credits — a win/save duplicates `decisions`, but a **hold** exists nowhere else — v8 added what a base-running event needs to describe itself: `runners[].details.playIndex`, the action events' `actionPlayId`/`description`/score, and `movement.start`). **Widening that vocabulary to all ten kinds needed no v9**, and the reasoning is worth keeping because it is the general rule: `fields` is leaf-matched, so `runners[].details.runner.fullName` and `result.awayScore` were already arriving under names requested for other parents (`fullName` for a batter, `awayScore` for an action event), and `movement.end` was already there beside `start`. Everything new is *derived* from fields a cached final feed already holds — which is exactly why `DAY_SNAPSHOT_VERSION` **did** have to go to 6: the snapshot stores the finished model, not the feed. `deriveLine` (the no-boxscore fallback) counts what it can from the plays and zeroes the rest. Each `FacedBatter` also carries `launchAngle`/`bbType` (the batted-ball trajectory, which powers the card's GB/LD/FB split — the boxscore only counts batted-ball *outs*) and `runs`/`earnedRuns` — the runs that scored on that play, counted from `play.runners[]` where `movement.end === 'score'` (earned via `details.earned !== false`) and **charged to the pitcher who threw it** (`responsiblePitcher.id`, so a reliever isn't billed for inherited runners); the pitcher card sums these per inning. Note this "runs scored while he pitched" differs from the boxscore line when a pitcher leaves runners who score later (the game-total pill uses the authoritative line). **`isBaserunningEvent` is gone and the test is `mlbStats.ts::isPlateAppearance`, one rung up.** A play whose *result* is a caught stealing or a pickoff carries the batter who was up, and MLB only files one that way when it ended the half-inning — all 31 of them across a checked 111 games were the third out, so the at-bat itself resumes next inning and the row is somebody else's baserunning wearing his name. It was showing in his feed as an out and counting toward his `line.pa`; `buildPitcherGame` excluded it from `facedBatters` from the start and `buildStatsApiDay` came to filter the batter's `plateAppearances` the same way — **two lists of event names, in `savant.ts`, that each had to be told about every kind MLB files**. They had not been told about `other_out` (a runner thrown out advancing, `Victor Robles out at 3rd` — 7 of them in the 672 distinct games the cache holds, every one drawing an `OTHER OUT` card in its batter's stream and putting his derived line one at-bat above MLB's own game log), and they could not have been told about a substitution or an ejection at all, which MLB files as plays of its own in other seasons of this API and which `eventLabel` would prettify into a card reading *Pitching Substitution*. What replaced them is structural and needs no vocabulary: **a plate appearance is a play the batter is himself one of the runners on**. Measured across those 672 games (50,473 plays): all 50,337 plays of the 21 batter-outcome event types carry a runner row for the batter, and all 136 plays of the 13 that are not plate appearances carry none — no exceptions either way. `result.type` cannot answer it, this API stamping every play `atBat`, caught stealings included (121,133 of 121,133 over 1,600 cached feeds). An **in-progress** play is a plate appearance by definition here — MLB has given it no result and so no runner rows, and it is the at-bat the Live section is showing — which is `midAtBat`, the same expression this file already uses for "still being played", passed in rather than read a second time. The outs and bases the loop tracks are still updated from that play — only the two pushes are skipped — the pitches thrown on it are still his, and the base event the play really *is* is still filed under both parties, that being the item the reader wanted all along. `getStatsApiGame` also keys a second map, **`pitcherBaseEvents`**, by the man on the mound: the same `StatsApiBaseEvent` objects filed under both parties, narrowed by `PITCHER_BASE_EVENTS` to the ones that happened *between* him and the runner. `savant.ts::buildStatsApiDay` assembles the `PitcherGame` (whiff%/CSW%/pitch-mix from the pitches via `aggregatePitches()`, each `PitchMix` carrying its own `strikes` count via `isStrikePitch()` — the shared "not ruled a ball" test `deriveLine` also uses, so balls are `count - strikes`; `vsRight`/`vsLeft` re-run that same aggregation over just the faced batters of one `stand` (`buildSplit`), null when he faced nobody of that hand — the boxscore doesn't split, so a split's `line` comes from `deriveLine` and its `outs` is 0; `decision` via `pitcherDecision(g, id)` — the official W/L/S from `liveData.decisions`, falling through to **`H`** when his boxscore line carries a hold, which `decisions` has no slot for (checked last, so a real decision can never be demoted to a hold); per-batter `FacedBatter.pitches` via the shared `toClientPitch` helper — the same projection batter PAs use; season/league arsenal filled per-pitcher in `getReport`). New modules: `pitcherArsenal.ts` (per-pitch-type season usage (`PitchUsage`: `count`/`strikes`) and averages — velo/spin/break, **plus the season Results**: PA, BA, SLG, wOBA, xwOBA, whiff%, put-away%, computed from the same CSV by classifying `events`/`description`; note the feed's `breakHorizontal` = `−pfx_x`, `breakVerticalInduced` = `pfx_z`, both ×12 to inches; the arsenal is keyed by the **feed's** pitch names via `feedPitchName()` — Savant's CSV says "Split-Finger" where the feed says "Splitter", and without the mapping a splitter's season baselines and Results never attached to its game row; `SeasonPitch` = movement `ArsenalPitch` + `PitchResults`), `pitchLeague.ts` (a curated league-average table). Those season Results ride along on each `PitchMix` as `season{Pa,Ba,Slg,Woba,Xwoba,Whiff,PutAway}`. `getPitcherStats` mirrors `getPlayerStats` with `group=[pitching]`. `percentiles.ts` has a `PITCHER_SECTIONS` table + the `statcast-r-pitching-mlb` page; `xwoba.ts` takes a `kind` for xwOBA-**against**. The percentile/xwoba/splits routes take `?type=pitcher`.
- **The record and the credits**: `PitcherSeasonStats` also carries **`wins`/`losses`/`saves`/`holds`**, read straight off the same MLB season line the rest of it comes from (`toPitcherSeasonStats`) rather than derived. They exist for the player page's **Overview** strip, which summarizes a pitcher's season as `IP · W-L · SV · HD · ERA · WHIP · K%` — and those four are the half of it no rate can express, a closer's year being his saves and holds. **That last cell is a share and prints as one** (`26.1%`), where `kRate` reaches it as the `.261` string `toPitcherSeasonStats` builds: one conversion, in `lib.ts::ratePercent`, shared with the opposing-lineup section that reads the same field — see **Client**, *A rate is `.xxx` and a share is a percent*. **Not tallied off the game log**, which counts the same credits a game at a time (`decisionOf` there, checked in scorebook order): that is a different question — what he got *that night* — and summing 60 rows of it would be a second arithmetic free to disagree with the line the block already holds. A **split** reports 0 for all four, which is honest in the same way it reports no ERA (neither a decision nor an earned run is split by hand) and is read by nothing. Nothing needed a version bump: `PitcherStats` is memory-cached on a 30-minute TTL and `withEstimators` copies by spread, so the fields flow through it untouched; `client/src/types.ts` mirrors them by hand as ever.
- **Season estimators**: `PitcherSeasonStats` carries `fip`, `xfip` and `xera` beside ERA. `leagueRates.ts` holds the two curated league constants they need (`FIP_CONSTANT`, `LEAGUE_HR_PER_FB`) plus `fipLike()` and `ipToOuts()` — FIP and xFIP differ only in whether the home-run term is his own or his fly balls at the league rate. FIP is computed in `mlbStats.ts` from the MLB line; **xFIP can't be**, since nothing there counts fly balls (the boxscore has batted-ball *outs* only), so `getSeasonArsenal` now also returns a `BattedBallMix` off the same season CSV it already downloads and `getReport::withXfip` fills it in on a copy of the cached line. Both are null under 3 innings, where the number is noise. The arsenal's storage key is `-v5` because a stale blob deserializes with the newer fields missing and silently costs every pitcher what they feed — v2 added the fly balls behind his xFIP, v3 the per-game `appearances` (see the game log), v4 the movement samples the Arsenal tab's dot cloud is drawn from (a v3 blob would leave that plot empty for six hours with its legend and its league blobs intact, which reads as a pitcher who threw nothing rather than as a stale blob). **v5 is the subtler version of that same hazard**: nothing was added, the *sampling rule* changed, so a v4 blob deserializes perfectly and holds the old allocation — 240 points with a floor of ten under every pitch type — and the plot would go on overstating a rare pitch tenfold for six hours off a blob nothing could tell was stale. **A version guards the meaning of what is stored, not only its shape.** v6 is his throwing hand, which picks the per-hand league line — a v5 blob deserializes with it null, which falls the chart back to the blended figure and the word `LEAGUE AVG`, so that one degrades rather than lying. **xERA is neither computed nor per-pitcher**: it's Statcast's own model, so `expectedStats.ts` reads Savant's expected-statistics leaderboard — every pitcher in one CSV (`min=1`, or the September call-up and most of the bullpen would be filtered out), cached 6h in memory and in the storage tier the way `teamHitting.ts` caches the league's hitting, and a failed fetch resolves to an empty map rather than 502ing a report that already has the outing. `getReport::withEstimators` fills both it and xFIP onto a copy of the cached season line; a **split** gets neither, the leaderboard not splitting and a split's line having no innings.
- **Opposing lineup**: `PlayerGame.opponentId` rides on every game, and `getReport` attaches `opponentHitting` to a *pitcher's* games (`teamHitting.ts::getTeamHitting`) — the **season, all games** cut, which is the opponent table's opening state and is why that table draws with no request of its own. What that module answers with is **nine cuts** rather than three: a window, a venue and a hand, whole league, each ranked within its own population. It is computed from the per-date Savant exports rather than read from MLB, and the whole of that — why MLB cannot be asked for a windowed or home-only platoon split, how a day reduces to four leaves plus a game count, why runs are read off the score progression, and the validation against MLB's own numbers — is in **Data sources**, *Team hitting: nine cuts a window*. Two rules of the old module survive unchanged: **ranks are computed here, not read off the API**, which ranks by its own default sort and doesn't rank splits at all (ties share a rank, and **1st is always the best offense** — so the fewest strikeouts ranks 1st, not 30th); and **a failed lookup resolves to null**, the opponent's line being context on a card that must never 502 a report which already has the outing. Note a **team's** hand split is by the hand of the pitcher they faced, so a lefty's card marks `vsLeft`.
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
screen. `ArsenalTab` owns it for the same reason it owns the split.

#### What is lit: a glance and a press are two different statements

**One sentence: the chart shows the pitch the reader is pointing at, or the one
they last pressed.** A pointer over a button previews it and leaving that button
drops the preview; a press pins, pressing the same one again unpins, and a press
anywhere else unpins. On touch there is no pointer, so it reduces to *the one you
last tapped*, cleared by tapping it again or tapping off it.

**That is two pieces of state where it used to be one, and the paragraph this
replaces was wrong about both halves of it.** What stood here was: *a touch
reader taps to select and taps again to clear* — which was the intention and was
not what the charts did. `ArsenalTab` owned a single `hovered`, written by
**three** handlers on every button (`onMouseEnter`, `onFocus`, `onClick`) and
cleared by exactly one, a `mouseleave` on the whole `<figure>`. Both of those
produced a reported fault, and both were measured on the live tab before they
were touched:

- **A press could not select at all.** Chrome dispatches a tap as
  `pointerenter:touch → mouseenter → mousedown → focus → mouseup → click`, so the
  compatibility `mouseenter` set the pitch, React rendered it as picked, and the
  click read that fresh `on` and toggled it straight back off. Measured under
  touch emulation on Paul Skenes' seven-pitch arsenal: **tapping a legend column
  lit nothing** (`legOn=[]`, 0 of 101 dots dimmed, no AVG marker), and it took
  **two taps of the same column** to light one — so tapping a *different* pitch
  type left the reader looking at neither, which is the "part of the 4-Seam
  Fastball stays highlighted when you click a different pitch type" report from
  the inside. It is the trap `ArmAngleMark` records below, unfixed on these two
  buttons; the fix is the same one, `pointerType === 'mouse'` on the preview,
  plus a press that pins rather than toggling against a state a hover has just
  written.
- **And the clear was a different element from the setter.** The plot is *inside*
  `.mv-chart`, so moving the pointer off a legend column and onto the circle left
  that column lit with nothing under the pointer at all: measured, `legOn` stayed
  `["4-Seam Fastball"]` with **60 of 101 dots dimmed and the AVG marker still
  drawn**, where the same move off a usage row cleared correctly — that figure
  being in the other `<figure>`. Tabbing past the last legend column left the last
  one lit for the same reason: nothing answered the blur. Both clear now
  (`legOn=[]`, `0/101 dim`, no marker), because a leave belongs to the button the
  pointer actually left.

**Hover is for pointers and the press is for everyone.** Every highlightable
thing is a real `<button>` — the usage rows, the legend columns — and every one
of them carries the same handlers (`pitchButtonProps`), written once so the two
charts cannot come to answer a gesture differently. The preview is filtered on
`pointerType === 'mouse'`; on the keyboard it is **`:focus-visible`** that
previews, which is that discrimination read off the platform rather than guessed
at — Chrome matches it on a Tab and not on a click or a tap, measured `false` on
both — so a click focusing its own button no longer previews and no longer
cancels its own press. The `:hover` tints sit inside `@media (hover: hover)`,
the app-wide rule (**Client**, *A card doesn't highlight when you scroll past
it*), and it matters more here than usual: on touch there is no pointer to move
away, so a hover-only chart would be a chart that stays stuck on whatever the
finger last crossed.

**A leave only ever clears its own preview**, which is why `onPreview` takes the
pitch type on the way *out* as well as in: focus can leave one button while the
pointer sits on another, and an unconditional clear takes the wrong one down.

**`aria-pressed` reports the pin, not what is lit.** A toggle button owes
assistive technology its *toggle* state, and reporting the preview there would
have it flicker as the pointer crossed a row. Measured after a keyboard Enter on
`Sweeper` and a Tab onto `Changeup`: `Sweeper:true` with every other column
`false`, while what is drawn is Changeup — the pin and the glance saying two
different true things.

**A press anywhere else unpins**, which is the other half of a press meaning
something: on touch there is nothing to move away, so without it a tapped pitch
would stay lit until the reader remembered which one it was. It is a listener in
`ArsenalTab` testing `[data-pitch]` — the attribute both buttons carry, so the
test names *a pitch button* rather than either chart's markup — and it is
deliberately **not `useDismissable`**, though it is the same shape. That hook
also spends the press (`swallowNextClick`), because a popover is in the reader's
way and a press past it is aimed at getting rid of it; a lit pitch covers
nothing, so the press that clears it should also do what it was aimed at.
Measured: with a pitch pinned, one press of the `Splits` tab switches the tab
**and** clears the pin.

### A scroll is not a press, and for a while it was

**Reported as the arsenal page dropping its touch highlight when you scroll**,
and the mechanism is the one word in the paragraph above: it cleared on the
**`pointerdown`**, and on a touch device a scroll *begins* with a `pointerdown`
on whatever happens to be under the finger. So dragging the player page anywhere
but on a pitch button unpinned the pitch — which is the gesture a reader makes
constantly on a chart taller than a phone, and the pin is the only selection
touch has.

**Reproduced before it was touched**, at 390×844 with real `Input.dispatchTouchEvent`
gestures: tap the `4-Seam Fastball` legend column → `pinned 4-Seam Fastball · 60
of 101 dots dimmed · AVG marker in`; then one touch drag → **`pinned [] · 0
dimmed · no marker`**, with a second drag no different.

**So the press only arms and the release decides.** A gesture that stayed within
`TAP_SLOP` of where it went down is a tap and clears the pin; one that travelled
further is a drag and does not; and a scroll the browser takes over fires
`pointercancel` with no `pointerup` at all, so it disarms without ever reaching
the test. **Arming is judged on where the gesture *started*** — a drag that
begins on a pitch button and releases on the page is that button's, and the
reverse is the page's — which is the modal backdrop's own rule
(**Client — popups**, *A tap can still reach behind a popup*). What this does
*not* borrow from that one is dismissing on the `click`: that fault was a box
torn out mid-gesture, and with no box here the release can be judged directly
and iOS's reluctance to deliver a `click` from a non-interactive element never
comes into it.

**`PairRow` in this same file already had every line of it**, which is the part
worth keeping: the percentile card's rows reveal on a deliberate tap and its
comment is this bug stated one tab over — *"the card is a list of rows inside a
scroller, and toggling on pointerdown meant every flick that happened to start on
a row flipped it"*. That was fixed; the arsenal pin was written afterwards
without it. It reuses that `TAP_SLOP` (8, Chromium's own figure) rather than
declaring a second, two numbers for one question being two numbers to keep true.

**Measured after, same build, same gestures**: the tap lights it, **two touch
drags leave `pinned 4-Seam Fastball · 60 dimmed · marker in`** throughout, and a
genuine tap off a pitch button still clears the lot (`pinned [] · 0 dimmed · no
marker`). **And the mouse is untouched**, driven at 1200×900: hovering a column
previews it (`lit Sweeper`, `pinned []`), a click pins it, moving the pointer
away keeps the pin, clicking another moves it, clicking the same again unpins,
and a click on the axis foot clears everything.

**Bundle, for the gesture and the lift together: 559.85 → 560.15 KB of JS**
(166.28 → 166.36 gzipped) and **151.79 → 151.76 KB of CSS** (27.22 → 27.21) —
0.3KB of JS raw and 0.08KB over the wire, and the CSS *falls*, a phone override
having gone. Page-body and view overflow are **0** at 320 / 390 / 480 / 640 /
900 / 1400 in both states.

**The pitch colors do not theme.** They are `lib.ts::pitchStyle`'s — Savant's
own palette, already shared with the arsenal rows, the per-game rows and the
pitch dots in a plate appearance — so a four-seamer is that red in Midnight and
in Lavender alike, the way a club's cap logo is its own colors. Everything
around them is tokens.

#### Pitch Usage: a butterfly, not a bar chart

The pitch runs down the middle and how often he goes to it against each side of
the plate grows **outward from it**, so the two hands read against each other
across the pitch they belong to rather than down two separate columns.

**The bars are scaled to the widest pitch on the chart, not to 100%** — checked
against Savant's own rendering, whose proportions are relative (15/64, 6/64 and
13/64 of the track for a 64% four-seamer's 15%, 6% and 13% neighbors). At
absolute scale every arsenal but a one-pitch reliever's would sit in the left
fifth of its track, and the comparison a reader makes here is between *these*
pitches. The exact figure is printed beside every bar, so the relative scale
hides nothing. **One scale across all three columns**, so a bar reaching further
really is a pitch thrown more often.

**Its one separator is the rule under the headers.** That took a fix of its own
and keeps it: it was a `border-bottom` on each of the three head cells with a
margin either side of the middle one — drawn in three segments with two gaps in
it, a separator that looks like it is made of pieces — and is one border on the
container now.

**The two vertical dividers down the Pitch column are gone**, and the round of
work that got them drawing unbroken is the argument for it. They ran the full
height of the table either side of the badges, and keeping them continuous took a
`padding: 0` on the row button and a `.pu-mid` stretched to it (a 2px button
padding had put a 2px break in them, drawing each divider as a dashed line) plus
the header rule above being one border rather than three segments so the two
separators met. All of that was in service of a line that was **boxing the middle
column into a table-within-a-table** — on the one chart in the app whose whole
device is that a row *is* one pitch, read across from its share against lefties
to its share against righties. What they were separating needs no line: the `vs.
LHH` / `vs. RHH` heads and the bars' own direction already say which side of the
plate a figure belongs to. The rhythm the fixes moved onto `.pu-mid` stays, since
that cell is what sets the row height — measured after, a **28px row with 0px
between consecutive rows** and the header rule still 1px, which is now the only
rule on the chart.

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

**Each dot is outlined in a darker version of its own color** (`darken`, the
fill's channels at 0.62). Without an edge, sixty-four overlapping four-seamers
are a single blob whose shape says how *far* the pitches spread and nothing
about how many are stacked where — which is half of what a cloud is for. The
outline is the dot's **own** color rather than a neutral: a gray or black ring
would be a second thing to look at on a chart already carrying five colors, and
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

**The two bottom corners carry the arm and the key**, and where they sit is
**solved rather than nudged** — because "in the corner" is not the same as
"clear of the circle", and the first pass was neither.

A mark is clear when the corner of its box **nearest the plot's center** is
further than the disc's radius away — the top-*inner* corner, both marks sitting
low and outboard. That gives the arm a shoulder no further in than x ≈ 319; it
was at 314, **six units inside**, and the key's *text* was running to x = 100 and
18 units in. The check that passed the first version measured the key's
**anchor** rather than the end of its text, and asked only whether a *dot* fell
under the marks rather than whether the **chart** did — which is how "0 dots
under either mark" was true of marks that were clipping the disc.

**Measured now on both hands at four widths, over every drawn part of each mark**
— each line, the ball, both labels, the swatch: **0 of them intersect the
plot**, the arm clearing by 10–25px and the key by 23–37px, with every part
inside the SVG. The tightest case is the ball at a 70° slot, the highest the
leaderboard carries.

**His arm slot is drawn as the arm** — a horizontal reference from the shoulder,
the arm itself at the measured angle, and the ball at the end of it — so the
picture *is* the number rather than an illustration beside it. Savant's own
figure is the angle between exactly those two lines: checked, `atan2` over the
shoulder and release points their leaderboard publishes reproduces the printed
`ball_angle` to the decimal (Misiorowski 29.9°, which their page prints as 30°).

**It goes on his own side** — a right-hander's arm is toward third base, which is
the right of this chart — with the hatch key opposite. A near-sidearm left-hander
reads instantly: Sale's 11° is a nearly flat line at the bottom left.

**Both labels sit *below* the horizontal reference.** Above it is the opening the
arm sweeps through, and at a low slot the arm passes straight through where a
number would go — measured at 30°, the degrees and the arm line were touching.

### The mark is a press, and what it opens is the release point

**The mark drew half of what the leaderboard says about a slot and its whole
affordance was an SVG `<title>`** — which is the two failures this app has
already written down once, met a third time. A native tooltip is **invisible on a
phone**, where roughly half the traffic is; and it wants the pointer on the
*painted stroke*, which here is **2.5 units of arm 34 long**. So there was nothing
to see on touch and next to nothing to hit with a mouse, which is exactly how it
was reported: *not seeing the overlay when clicking or hovering the arm angle*.

**And the missing half was already on the wire.** `ArmAngleInfo` has carried
`releaseHeight` and `releaseSide` since it was written — Savant publishes the
release point beside the angle, which is what its own arm-angle page leads with —
and **nothing in either workspace read either field**. The angle is where his arm
is; the release point is where the ball actually leaves it, which is the fact a
reader is chasing when they reach for this corner at all.

So the group is a real target — `role="button"` with a `tabIndex`, the rule the
Game Log's rows and a scoreboard card already follow for an element that cannot
hold a `<button>` — and the reveal is the app's own **popover**
(`.settings-popover`, literally the box `InfoKey` and the settings gear open)
rather than a second box that resembles one. A pointer opens it by hovering and
closes it by leaving, a finger presses it, the keyboard opens it on focus and
toggles it with Enter or Space, and an outside press or Escape closes it through
`useDismissable`.

**The hit area is two transparent shapes, not one box, and that is forced.** A
single rect containing both the shoulder (low and inboard) and the ball at the
steepest slot the leaderboard carries (70°, high and outboard) has a top-*inner*
corner at (316, 314), which is **165.5 units from the disc's center against its
171.6 radius** — inside it, which is the one thing the geometry above is written
to avoid. A 16-unit-wide transparent line along the arm clears the disc by 190
(its closest approach is its own shoulder at 198, less 8 of half-width) and a box
over the two labels by 198.4. `pointer-events: all` rather than leaving a
transparent paint to `visiblePainted`, which hit-tests where a paint is *drawn*.

**The press only ever opens, and that took measuring the event order.** Filtering
the hover on `pointerType` — rather than binding `onMouseEnter`, which Chrome
dispatches *after* a tap — is necessary and not sufficient: a tap's real order is
`pointerenter:touch → … → mouseenter → mousedown → **focus** → mouseup → click`,
so opening on focus and *toggling* on the click cancel out. Measured before the
fix, **the first tap on the mark did nothing at all and the second opened it**,
because by then the element was already focused and only the click fired. Both
handlers now say `onOpen(true)`, which cannot depend on their order; what that
gives up is closing by pressing the mark again, and closing is the popover
contract instead.

**The panel carries the figures and the ⓘ carries the definitions**, which is the
split the app already makes between a reveal and a key: what 0° and 90° *mean* is
needed once and in the way ever after, so it went into the chart's own `InfoKey`
alongside a sentence saying the arm is his slot and opens onto his release point.
Two lines rather than four, and every line of the panel is a dot in the cloud the
reader cannot see while it is open — measured, **101 → 101 dots** behind a
250 × 102px box.

**`role="img"` on the `<svg>` does not prune it, which was checked rather than
assumed.** The spec makes an `img`'s children presentational, so a focusable
widget inside one is the kind of thing that silently disappears from the
accessibility tree; Chrome exposes the group as **`role: button`, focusable,
under `role="img"` and `role="group"` alike**, so the chart keeps the image role
that makes its cloud read as one labeled thing. The group's `aria-label` carries
the whole fact in words — *"Arm angle 26° above horizontal, against an MLB average
of 37°. Released 5.6 feet off the ground, 2.2 feet to his arm side of the
shoulder"* — so nothing rides on the panel being reachable.

**Whole degrees in both places**, which is what Savant's own page prints: the
corner label has no room for a decimal, so a panel carrying one would be the same
fact reading two ways an inch apart. A **missing** release figure reaches us as 0
(the server writes that where the leaderboard's column would not parse) and as
`undefined` from a build older than the field; nobody releases a ball at ground
level, so either way there is no height to state and the line is dropped rather
than printed as `0.0`.

**Driven in a browser at 1200×900 and 390×844, on a right-hander (Skenes, 26°), a
left-hander (Skubal, 47°) and a steep slot (Verlander, 57°).** With a mouse:
hovering the arm *or* its label box opens the panel and the mark takes the accent
(`--muted` → accent on the line, the ball and both labels), a click while hovered
leaves it open, and leaving closes it. On touch (`hover: none`, `pointer:
coarse`): **one tap opens it** where before the first tap did nothing, a second
tap leaves it open, and a tap on a legend column dismisses it *and* still selects
that column. From the keyboard: **20 tabs into the page** reaches the mark, focus
opens it with a `:focus-visible` outline, Enter and Space toggle it, Space does
not scroll the tab (`viewScroll moved: 0`), and Tab away closes it. **Escape
undoes one thing** — the panel first with the player page standing, the page on
the second press, and no `inert` attribute left. Geometry: the panel is
**250 × 102px** anchored to the arm's own side (`right: 4px` for a right-hander at
x=581 of a 470px chart, `left: 4px` for a left-hander), **above the highest the
ball can reach at any angle**, inside the viewport at both widths, with **page
and view overflow 0** everywhere.

**And the two states that draw no mark were driven with the response stubbed**,
since both are reachable: `armAngle: null` (a pitcher Savant's board has no row
for, or a failed read) draws **no `.mv-arm` at all** with both charts otherwise
intact and no error line, and a pitcher who has faced only one hand takes the
usage chart's `solo` layout — no head row, so no rule and nothing that could have
carried a divider — with the arm mark and its press unaffected. 0 page overflow in
both.

**Bundle: 539.76 → 541.63 KB of JS** (159.84 → 160.49 gzipped) and **141.60 →
142.05 KB of CSS** (25.04 → 25.16) — 1.9KB and 0.45KB raw, 0.6KB and 0.12KB over
the wire, for a hit area, a popover, the release point it carries and the
paragraphs above restated where the rules are.

**Two of `.settings-popover`'s own offsets have to be given back**, and each was a
real fault rather than a tidy-up: it anchors `top: calc(100% + 8px)` because it
hangs *below* a button, so a `bottom` beside it over-constrained the box and
squashed two paragraphs into **26px below the plot**; and its `left: 0` beat the
`right` on the rule below it, which put a right-hander's panel at the chart's
**left** edge (x=365 against the 581 it wants).

**`armAngle.ts` is where it comes from, and this is the one thing on the chart
the pitch-level CSV cannot give.** Savant measures the angle against an estimate
of the **shoulder**, which is in no per-pitch export — so the figure is read off
their `pitcher-arm-angles` leaderboard rather than reconstructed from an
assumption about where a shoulder is. One league-wide CSV (~92KB, 780 pitchers),
`min=1` so the bullpen is not left out, cached six hours in memory and in the
storage tier with an `inFlight` guard: the class `expectedStats.ts` is in, and it
costs the arsenal route nothing on a warm cache. A failure resolves to **null**
and the chart simply draws no arm. It is a **new season constant**, taking the
count `CLAUDE.md` keeps from eight to nine.

**The league average is one number, not two.** Right-handers average 36.9° and
left-handers 37.0° over the 2026 board — as close to identical as two
populations get — so the arm's panel names a single MLB average. (The *break*
table next door is split by hand, because velocity genuinely differs; the two
decisions look inconsistent and are each what their own measurement says.)

**The hatch key says `MLB AVG`.** The blob it stands for sits at the average for
his own hand, so `RHP AVG` would be the more precise word — but the row at the
foot of the chart already carries that split (`RHP avg` / `LHP avg`) against the
velocities, and a second per-hand label on the same chart reads as a second
population rather than the same one. The key names the thing at its coarsest
true description and the `?` explains the rest.

**The dashed legs from the AVG marker are gone.** They measured the two figures
the callout row now prints, so they were decorating a decomposition nobody has
to do on the plot — and near the origin they collapsed into two specks behind
the marker. The marker itself stays: it is where the pitch *is*.

**`1B ◀ MOVES TOWARD ▶ 3B` reads under the plot**, not over it. It names the
horizontal axis, and the axis is where the reader's eye already is by the time
they want it — above the circle it was a line of chrome between the title and
the thing the title names. It sits close to the plot and **16px clear of the
legend**: it belongs to the picture above it, and hard against the pitch names
below it read as their heading.

**And the vertical axis is named down the left edge, with each arrow outboard of
its label** — `▲` above `MORE RISE`, `▼` below `MORE DROP`. They pointed the
other way for a while and it was not a source-order mistake: the arrows were
inline with the words in a 4.4em box, so `More rise ▲` wrapped and put the ▲ on a
second line *underneath* the label, while `▼ More drop` put its ▼ on a first line
*above* it. Measured, the rise block was two lines and the drop block three, and
each arrow pointed away from the half of the plot it names. An arrow that shares
a line lands wherever the break puts it, so it has a block of its own now.

**The rise block grows upward, so its bottom edge does not move.** The arrow
adds a line and the edge nearest the disc is the bottom one, so the top is pulled
up by exactly that line (`top: calc(26% - 12.5px)`) rather than the block
reaching further into the circle: measured, its nearest approach to the painted
field is **+1.4px at 470px of chart, the same figure it was**. The drop block was
already three lines, so the arrow moving to its foot changes no height at all;
what moved is its anchor, 62% → **64%**, which squares the two blocks up against
each other — their centers now sit ~87px either side of the disc's own center —
and takes its corner clear of the field for the first time (**−1.7px → +1.1px**).

**At phone widths they move outboard, because they do not shrink and the disc
does.** A label is a type size and the circle is a share of the chart, so the
same anchors that clear it at 470px had the block sitting **7.2px inside the 24"
ring at 320** — measured on `main`, and true before this change as well as after
the arrow moved. Under the container query that already tunes this chart for a
phone they take **17% and 70%**, and every part of both labels then clears that
ring at every width the app is checked at: **+19.7 / +19.4 at 470px, +15.1 /
+12.9 at 390, +2.3 / +2.9 at 320**, against +19.7 / +16.7, +3.2 / +2.7 and −7.2 /
−5.9 before. What they still sit over at the two narrowest widths, as they always
have, is the **soft field wash** — the 7% accent tint drawn 2.4" past the last
ring precisely so an outlier lands on something — which is a wash rather than a
mark, and the two corners a label could retreat into are the arm's and the hatch
key's.

**The arm and the key are untouched and were re-measured to prove it**: every
drawn part of both clears the painted field by the same figures it did before
(the arm 10.8–30.5px at 320 and 17.7–49.6 at 470, the key 22.5–60.5), and neither
label's box intersects any part of either mark, or the callout row above, at
320 / 360 / 390 / 480 / 640 / 900 / 1400 — with both labels inside the SVG at
every one.

**And the box is cropped to what is in it.** A disc in a 400×400 viewBox leaves
~33 units of nothing above it and ~40 below, which at the width this renders is
about 70px of empty SVG between the title and the top of the circle — space no
margin can take back, because it is *inside the picture*. `VIEW_TOP` / `VIEW_H`
crop to 22…370, measured against the soft disc (y = 24.4…367.6) rather than the
rings, and the plot is then pulled up under the callout row: the two blocks sit
in the corners the circle never reaches, and at its top the circle is a point. A
first crop at 26 clipped 1.6 units off the top of the disc and it took a check
on the **painted pixels** to see it, the DOM being perfectly happy.

**The lift is 20px, and it was 40 on a desktop and 18 on a phone.** Both of those
were measured against the **chips**, which is the state the row is in once a
pitch is picked — and the state it is in at rest is the **hint**, `Pick a pitch
to compare it with the league`, which is *centered*. That is exactly where the
disc's apex is. Measured on the live page, the hint's bottom edge sat **4px
inside the SVG at every width from 480 up** against **+18 at 390**, which is the
report — cramped on a wide screen, fine on a phone — and on screen the field wash
began where the sentence ended.

**There is one lever and it reaches both states.** The plot's top is the row's
height plus the margin, so growing the row and shrinking the lift are the same
move; and a lever *per state* is a jolt on the very press that picks a pitch,
because the legend a reader presses sits **below** the plot and would move under
their finger — which is what the ghost row exists to prevent. So one value for
both states and every width: **-20px**, which puts the hint **16px clear of the
SVG at 320, 390, 480, 640, 900 and 1400 alike**, where it was −4/−4/−4/−4/−4/+18.

**The chips gain by it rather than lose**, which is what had to be checked before
spending the phone's own number: measuring every `.mv-cal`/`.mv-cal-tag` box
against the painted soft disc, clearance goes **33.2 → 48.1px at 1400** and **7.5
→ 23.1 at 390**, and at 320 — the width the phone override was written for —
**−8.2px at the old desktop 40 → +8.2 at 20**, against the override's own 9.9.
So the override's reason is gone with it, and the file carries one number where
it carried two. **Title to circle: ~70px → 40px**, which is the 20px the hint
needed and still a good deal less than the crop was worth.

**The domain is fixed at 24", not fitted to the pitcher**, so two pitchers'
charts can be read against each other. It is wide enough that only a genuine
outlier lands outside the last ring (measured on a real arsenal: the widest
pitch was 21"), and the soft disc extends a little past it so such a pitch still
lands on something.

**Only the solid rings carry a figure.** Savant labels its inner rings on one
side only, which keeps a right-hander's fastball quadrant clear and would crowd
a left-hander's; labeling the two solid rings on all four arms is symmetric,
handedness-neutral and leaves the middle — where the pitches are — clear, with
the dashed rings reading as the halves they are.

**The league average is a hatched blob rather than a point**, as wide as the
league's own spread (`leagueHRange`/`leagueVRange`). "Average" is a cloud too,
and a bare dot would invite a reader to treat half an inch of daylight as a
difference.

**And it is the average for his own hand** — `RHP AVG` / `LHP AVG` on the blob's
key and on the legend's bottom row, rather than a blended "league". That is a
data change and not a relabeling: `pitchLeague.ts` now carries a per-hand table
beside the blended one, because **a right-hander throws 0.9 to 2.0 mph harder
than a left-hander at every pitch type** (measured off Savant's own league
movement figures), so a lefty judged against a blend is marked down about two
miles an hour for being left-handed. The **break** magnitudes barely move by
comparison — 0.05 to 0.74" horizontally, 0.10 to 0.95" vertically — which is why
the blended table served for as long as it did.

**Which hand is read, not inferred**: `p_throws` off the season CSV the arsenal
already parses, taken as the majority of the season so one mislabeled row
cannot flip a pitcher and a genuine switch-pitcher resolves to the arm he mostly
uses. It rides on `SeasonArsenals`, so the per-game baselines got it for free —
`fillBaselines` takes it off the arsenal it is already handed and no caller had
to learn about it. **A pitcher whose hand cannot be read falls back to the
blended figure and the word `LEAGUE AVG`**, so that one degrades rather than
lying.

**The callout row is two blocks, and they answer two different questions.** On
the **left**, what the pitch actually does — its rise or drop, its tail or
break. On the **right**, how that compares with the same pitch thrown by the
rest of his own hand. They were one run of chips saying both at once
(`Break 3.5" · 3.0" less than league`), which reads as one fact and is two.

**Tail or break is a fact about his arm rather than about the number**: a pitch
moving to his throwing side tails, one moving to his glove side breaks. Arm side
is toward third base for a right-hander and toward first for a left-hander, so
it falls out of the hand the wire now carries — and with no hand there is no way
to tell, where "break" is the word that is true either way.

**The comparison is red for better and blue for worse** (`--rank-hot` /
`--rank-cold`, the diverging pair the League table's rank badge already uses and
the one Savant's own percentile card reads in). **Which way is better is not
ours to assume**: a four-seamer wants more ride and a curveball wants more drop,
so it comes off `pitchDirections` — the same per-pitch table the arsenal rows
color their ▲▼ with, rather than a second opinion beside it. A metric that
table calls neutral takes **no color at all**, which on a slider's induced
break is the honest answer: it sits near zero by design and a wobble there says
nothing. Checked on a real left-hander: his four-seam reads `5.1" less rise` in
blue, his sinker `6.2" less rise` in **red** (a sinker wants less ride), his
changeup `4.9" more drop` in red, and his slider's `6.2" more drop` in neither.

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

***Superseded on the noun, and the paragraph above is the fault written down.***
It reads the noun off `vBreak`'s **sign**, and a splitter's induced break is a
small *positive* number — it is thrown to fall off a fastball's plane and still
rises a little against a spinless path. So a splitter under the league's own
splitter printed `1.8" less rise` **in red**, and the sentence beside its color
said the opposite of it. Reported from the page, in exactly those words: a
splitter should say *more drop*. The same fault ran through the sinker, which
the paragraph two above states as a *finding* — `6.2" less rise` in red, "a
sinker wants less ride" — where it is the same unreadable sentence with the
reasoning supplied by hand.

**The noun is a fact about the pitch type, not about the sign of its break.** It
comes off `pitchDirections`, the table the color one line below it already reads
— so the two halves of the chip cannot disagree by construction, which is the
whole of why that table was the source of the color in the first place. A pitch
it calls `down` is spoken of in **drop** (the sinker, the curve and its cousins,
the changeup, the splitter, the forkball); one it calls `up` in **rise** (the
four-seamer). Where it calls the metric `none` — the cutter, the slider, the
sweeper, which sit near zero by design — there is no intent to speak in, the
sign genuinely *is* the reading, and those keep it and keep their absence of
color with it.

**The left-hand chip stays on the sign, and the split is the point.** It is the
measurement: a splitter with +2.0" of induced break does not drop two inches,
whatever it is thrown for, and saying `2.0" drop` there to agree with
`1.8" more drop` next door would buy the agreement with a false reading. The
pair reads as what it is — *it rises two inches, and that is nearly two inches
more drop than the league's own splitter.*

Driven on a right-hander with all seven types, before → after:

| pitch | iVB | league | before | after |
| --- | --- | --- | --- | --- |
| Splitter | 2.0 | 3.8 | `1.8" less rise` *(red)* | **`1.8" more drop`** *(red)* |
| Sinker | 6.4 | 8.7 | `2.3" less rise` *(red)* | **`2.3" more drop`** *(red)* |
| Curveball | −14.8 | −9.4 | `5.4" more drop` *(red)* | unchanged |
| 4-Seam | 14.0 | 15.1 | `1.1" less rise` *(blue)* | unchanged |
| Cutter | 10.9 | 7.9 | `3.0" more rise` *(none)* | unchanged |
| Slider | −0.8 | 1.9 | `2.7" more drop` *(none)* | unchanged |

Four of the seven were already right and say so; the two that changed are the
two the table calls `down` while their break is positive, which is exactly the
set the sign test could not reach. The left-hand chip is unmoved at every row —
the splitter still reads `2.0" rise` beside its `1.8" more drop`. A changeup
checked on a left-hander moves the other way for the same reason: `2.9" more
rise` in blue becomes **`2.9" less drop`** in blue, the color unchanged and the
words finally agreeing with it.

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
unlabeled numbers under a swatch are not a legend.

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

**The abbreviation is *not* in the pitch's own color**, which is worth writing
down because it is the obvious thing to try and it cannot be made to work. That
palette is built to be a **fill** with computed ink over it (`inkOn`); as *text*
several of its members fail outright — measured against the two themes' card
grounds, **4 of the 15 land under 3:1 somewhere**: FC **2.28/2.06**, KC
**2.23/2.02**, and FF and KN **3.21/2.91**, Midnight against Lavender. Coloring
the label would leave a cutter and a knuckle curve unreadable to buy the others
nothing the swatch does not already say, so the abbreviation takes the app's own
ink and the swatch directly below it carries the color, which is what a legend
swatch is for. (It was measured again when Lavender went from a light theme to
graphite — on the pale page it was **6 of 9** in a real arsenal, with the slider
at 1.90 and the curve at 1.65 — and the conclusion is the one that survived the
reversal.)

**An `InfoKey` carries what the chart cannot say for itself** — that the rings
are inches, that the vertical axis is *induced* break rather than total drop,
and what the hatching means. The app's own disclosure, for that component's
stated reasons, anchored to the title row rather than to its own 30px button
(the `.roll-key` trick: a shrink-to-fit against the button resolves to 180px,
and a 320px panel fits from neither of the button's edges on a phone).

#### What is deliberately not recreated

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
split's own usage. Both color schemes checked. `Escape` with the info key open
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

**And the four gestures were each driven end to end against the built client**,
on Skenes' seven pitches (101 dots), reading the two charts' classes and the
cloud back at every step — a lit pitch is `puOn`/`legOn` naming one type, its
dots undimmed and the AVG marker drawn.

| | before | after |
| --- | --- | --- |
| a **tap** on a legend column | nothing lit, `0/101` dimmed | **that pitch**, `60/101` dimmed, marker in |
| a **tap** on a *different* column | still nothing lit | **only the new one** |
| a second tap on the same one | lights it (the first tap's work) | **clears it** |
| a tap **off** a button (the plot) | leaves it lit | **clears it** |
| pointer off a legend column onto the plot | `["4-Seam Fastball"]`, `60/101` dimmed, marker in | **`[]`, `0/101`, no marker** |
| pointer off a *usage row* onto the plot | cleared | cleared (unchanged) |
| a **mouse click** | cleared the pitch the hover had just lit | **pins it**; it survives the pointer leaving |
| **Tab** past the last legend column | `["Curveball"]` left lit | **cleared** |
| Enter on a focused column, then Tab on | one pitch `on` and another `:hover`-tinted | pin `Sweeper:true`, preview `Changeup` lit |
| a press on the `Splits` tab with a pitch pinned | — | **tab switches and the pin clears** |

The arm-angle mark is unaffected by the new outside-press listener: it still
opens on hover and on a press (its 250 × 102 panel), the press clears a pinned
pitch as any other press outside a pitch button does, and one Escape closes the
panel and leaves the player page standing.

**The payload halved on the way**, twice over: 100 points rather than 240, and a
point that is `{ pitchType, hBreak, vBreak }` rather than five fields — `velo`
and `stand` went with their last reader when the split tabs did (the rule
`teamProbablePitcher`'s removal sets), and each is one line to put back if a
per-dot tooltip or a per-hand cloud ever wants it. **3,109 → 1,718 bytes
gzipped**, measured through the route.

**Bundle: 529.65 → 539.76 KB of JS** (156.66 → 159.84 gzipped) and **134.44 →
141.60 KB of CSS** (23.64 → 25.04) — 7.6KB and 6.3KB raw, 2.4KB and 1.2KB over
the wire, for two charts, a shared selection, an explainer and the paragraphs
above restated where the rules are; stripping the rows and the split plumbing
gave 2.4KB of it back.

**And for the preview-and-pin selection, the axis arrows and the outing page's
own default tab together: 550.02 → 550.77 KB of JS** (163.06 → 163.28 gzipped)
and **147.02 → 147.14 KB of CSS** (26.21 → 26.23) — 0.75KB and 0.12KB raw, 0.22KB
and 0.02KB over the wire, for a second piece of state, one shared set of button
handlers replacing three per button, a window listener, a block-level arrow and a
lazy initialiser.

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
It puts a slider's hatched league blob further from the plate's center than
Savant's does, and it moves the ▲▼ arrow on every slider row in the app, which
is why it was left alone here rather than corrected as a side effect of drawing
a chart.


- **Client**: **`PitcherCard` no longer renders anywhere, and neither does `PlayerCard`.** They were the Games view's cards, and that view is gone — folded into the feed as a grouping, and from there onto the player page as its Overview tab (see **Client**). Their *parts* very much live on, which is why both files stay: `PitchingTag`, `lineSummary` and `OpponentSection` here, `GameStatusBadge` next door (and `PlatoonSplit`, which the feed's Upcoming row read until it took `PlatoonSplits`' own card instead), all read by `LiveFeed` and, through it, by `PlayerDay.tsx`, plus everything `PitcherCard.tsx` imports from `PlayerCard.tsx`. What is unrendered is the two top-level components and the pieces only they used (`CardSection`, `GameLine`), which rollup drops from the bundle — 442KB to 425.
  **All four sections are back, as a page.** The Games view took a pitcher's per-game **Line** (the `.ars-row` with its Results / Rates / Contact strips), the **Opponent** lineup and his per-game **Arsenal** off screen with it, and the way back to them was `OutingBreakdown`: a **Full breakdown** button inside the opened outing dialog, raising a *second* `Modal` over the three sections the item hasn't got. That is now **`OutingPage`** (`components/OutingPage.tsx`) — one full-screen page, the shape `PlayerDetails` (`.details-view`) and `LeagueMatchupView` (`.mup-view`) already have, opening straight onto the full read under a tab strip: **`Line · Innings · Opponent · Arsenal`**.

  **The passage this replaces argued for the two dialogs, and its argument was about the button rather than the box.** It read: *the feed's outing item deliberately opens onto `InningsList` alone, an item being a stream entry rather than a full read* — and then bolted a door onto that stream entry to reach the read anyway. Two presses and two stacked dialogs to see a pitcher's line is a ladder built on a decision the second press immediately overturns; the honest reading is that pressing an outing **is** asking for the full read, so it should land on one. It also stops the innings and the line being two different kinds of thing: they are four tabs of one page now, in the order an outing is read — what he did, how it went inning by inning, whom he faced, what he threw.

  **The tabs read in the order an outing is read**, and the one the page *opens* on is whichever of the first two the outing is: **Innings while it is live, Line once it is done.** A finished outing is a result, so it leads on the line; one still being thrown is a narrative, and what a manager wants at 9:40 on a Tuesday is the half-inning he is in — which the line, one number per column and rewritten every batter, cannot say. It is the argument the Rankings tab already makes for opening on the week being played rather than on the season. (This sentence read **Line is the default tab** flat, which was right about a game that is over and stated of every game.) **Opponent and Arsenal are drawn only when there is something in them** (`game.opponentHitting`, and a non-empty `pitchMix`), so a relief appearance with no arsenal data gets three tabs rather than a fourth that says nothing — the rule `SplitTabs` already follows for a hand he never faced.

  **Live is `gameStatusView`'s own `kind`, not a second test** — that is what the `GameStatusBadge` at the head of this very page reads to print `Live`, so the tab and the badge above it cannot come to disagree about whether the outing is still going on.

  **A lazy `useState` initialiser rather than an effect**, the rule `LeagueMatchup`'s `sideTab` sets: the game is a prop at mount for every caller that has one, so the first paint is already the right tab, where an effect would draw Line, swap a frame later, and reset the scroll doing it. And it decides **once** — `tab` is null until something has decided it — so a game that goes final under a reader who has the page open cannot move the tab out from under them, which is a live hazard rather than a hypothetical: the feed re-polls `/api/report` every twenty seconds while a game is on and hands this page a fresh `game` object each time. The reader's own press is the last word from the moment they make it.

  **The one caller that opens this page before it has a game is the Game Log row**, whose read is still out, and the same latch covers it without painting anything wrong: the `pending` branch draws **no tab strip at all**, so there is nothing on screen to swap. Measured with that read held 1.5s, at t+400ms and t+900ms: **0 tab strips, 0 tabs, the block wait**, then at t+1300ms the game lands and the page is on **Innings** with its four inning bars. Setting the state during that render rather than in an effect is what keeps it to one paint — React re-renders on a set during render before it commits.

  **The head closes itself while the outing is being read**, which is the same
  fault the New plays page recorded and fixed — and it is on this page's own
  loading state, which is exactly when a reader is looking at it. `.details-chrome`
  carries **no bottom padding**, and is right not to: on the player page its last
  child is the tab strip, and the active tab's 2px underline *is* the bar's bottom
  edge. With no strip yet the last child is the head, whose `margin-bottom: 20px`
  then **collapses straight through the box** and becomes the gap below it.
  Measured at 1200 on a Game Log row's press with the day read held at 5s of
  latency: the chrome is **66px** — 20 of top padding plus a 46px head plus
  nothing — with the pitcher's name and the game line sitting flush on the
  hairline. After: **82**, the head's own bottom at 66 and 16px of band under it,
  and the loaded page **unchanged at 120** (a 34px strip whose own bottom *is* the
  chrome's). One rule for both pages rather than a copy each —
  `.details-chrome:not(:has(.details-tabstrip))`, they being the same object, a
  details chrome whose last child is a head — and `.newplays-chrome` /
  `.newplays-head` give up their two declarations to it. **16px rather than the
  head's own 20**: the top padding is clearing a window edge and a rounded corner
  where this is clearing text from a rule. See **Client — the Feed view**, *The
  new-plays navbar has a bottom edge again*, for the first measurement.

  **Measured on the live 2026 season, all four routes**: a live outing (Blake Snell, `LAD 5–1 COL · Bottom 4`) opens on **Innings** with 4 inning bars from the Overview tab's game card, from a Game Log row and from the feed's own outing bar alike; a finished one (`STL 2–1 CIN · Final`) opens on **Line** from all three. Pressing `Line` on the live page sticks.

  **The sections are the card's own components** (`GameLine`, `OpponentSection`, `ArsenalSection`, `InningsList`), not a second rendering of the same numbers: a page that drifted from the card it replaces would be worse than the gap it fills, which is also why `PitcherCard` stays rather than being deleted for parts. What each gained is a **`bare`** mode. Inside a page opened *for* a section, under a tab strip that has just named it, a `.game-sub-bar` reading `Line` over the line is the same word twice — and a *collapsible* one offers to hide the only thing on screen. So `CardSection` has three modes: a toggle (the card), a static label (`defaultOpen`, which the old breakdown used), and no heading at all (`bare`). Measured on the page: **0 `.section-title`** elements.

  **The page is portalled to `document.body`, and that is a requirement rather than a habit.** `.app-dialog-body` declares `container-type: inline-size` — which the plate-appearance detail's own `@container` queries need — and layout containment makes a box **a containing block for `position: fixed` descendants**. A page rendered in the tree where the Game Log's popup draws its outing would therefore be laid out *inside that popup*. The portal is what makes “full-screen” mean the screen from all four entry points.

  **Its layer is read from context rather than declared**, which is the genuinely delicate part: the outing is reached at three different depths. In the feed stream nothing is above it (**46**). On a **matchup team page** (`.mup-view`, 48) it opens at **49**. Inside the **player page** (50) — from the Overview tab's game card and from a Game Log row alike — it opens at **51**. No fixed z-index serves all three: 50 would sit level with the page that opened it and pointlessly over the feed. So `OutingPage` reads `DialogLayerContext`, takes `host + 1`, and **provides its own layer downward**, so the inning dialog inside it climbs one more (47 / 50 / 52) and a faced batter one more again (48 / 51 / 53). `.outing-view { z-index: 46 }` in the stylesheet is the floor for the no-host case; the rung is written inline whenever there is a host. **It was four depths and the two player-page ones were 52 apiece**, each behind a `PlayerDayModal` at 51; that box is a batter's alone now, so both routes lost a rung — see **Client — the player page**, *A pitcher's game opens the outing, not a box in front of it*.

  **And `.outing-view` joins `OVERLAYS`** — the selector `overlayAbove` and the background-mark registry read — with a note there that it is the one member of that list whose layer is *not* fixed, so `layerOf` has to read it off the element. Without it the box under an open outing page (the Game Log's popup, a matchup page) would answer Escape alongside it, which is the fault that list exists to prevent.

  **Driven from every entry point at 1200×900 and 390×844**, one press of Escape undoing one thing at each rung and no `inert` mark left at the end of any of them: the **feed** 46 → 47 → 48 (three presses, focus back to the inning bar and then to `.feed-item-toggle` — checked with a real mouse press, `HTMLElement.click()` not focusing its target and so restoring to the body); a **matchup team page** 48 → 49 → 50; the **Overview** tab 50 → 51 → 52; and the **Game Log** popup 50 → 51 → 52 → 53 → 54, five presses. **The last two of those are one rung shorter now** — a pitcher's Game Log row and his Overview game card open the page rather than a popup in front of it, so the Overview reads 50 → 51 and the Game Log 50 → 51 → 52 → 53; see the paragraph below. `[inert]` at the deepest feed rung is `#root`, `.details-view`, `.app-dialog`, and the top box is never itself inert.

  **Geometry**, same build, five widths (320 / 390 / 640 / 1200 / 1920): the view is the window at every one, `.details-chrome` is **194 / 163 / 120 / 120 / 120px** tall (the head wraps under 640), and the head, the tab strip and the tab body share one **860px** column — `--card-column` + 60, the width `.details-arsenal` already uses, and scoped to this page so its head does not sit at the player page's 680 over a body at 860. **Page-body overflow 0 and view overflow 0 at every width on every tab.** The opponent table fits its pane from 640 up (0 sideways scroll, 858px inside 860 at 1200) and scrolls on a phone as every wide table here does; the tab strip itself scrolls sideways at 320 (38px) and fits from 390 up.

  **Bundle: 522.29 → 523.62 KB of JS** (154.38 → 154.73 gzipped) and **126.34 → 126.59 KB of CSS** (22.44 → 22.48) — 1.3KB and 0.25KB raw, 0.35KB and 0.04KB over the wire, for a page that replaced two dialogs; the CSS is nearly all the comments arguing the borrowed shape, one rule block having gone with `OutingBreakdown`.

  **The `Full breakdown` button does not survive at all, and this paragraph used to say it did.** It read: *the button survives in exactly one place, and it is a door rather than a leftover — see the Game Log's popup, which keeps its inline innings.* That was true of a popup that had a reason to be there, and it no longer has one: a pitcher's Game Log row and his Overview game card open **this page** now, so the box the button was the door out of is not drawn for a pitcher at all. `detailInline`, `.feed-item-toggle.static` and `.outing-breakdown-btn` went with it, on the rule `teamProbablePitcher` already sets — *a field nobody reads is a field nobody misses*. See **Client — the player page**, *A pitcher's game opens the outing, not a box in front of it*, and **Client — the Feed view** for the reversal stated where it was argued.

  The card as it stood: `PitcherCard.tsx` renders four collapsible `CardSection`s, in this order: **Line** (`GameLine`), **Innings** (batters faced, grouped by inning), **Opponent**, **Arsenal**. Its header speaks for **one game only while the range in view is one day** (`singleDay && pitched.length === 1`) — the role chip, the decision, the final-score badge and now the header line itself all belong to a particular outing. Gating that on the *outing count* instead, which is what it used to do, read a week two different ways depending on the pitcher's role: a starter makes one start in it and got a card identical to a single day's — one line, one W, one final score, as though that game were the week — while the reliever below him made five appearances and got a bare aggregate. Over a range every pitcher now reads the same: the credits **tallied** (`creditTally`, counted off the per-game `decision` since `PitchingLine` carries wins/saves/holds but no losses) ahead of `N G · ` and the combined line. The **no-outing** card follows the same rule for its badge list — over a week those are his team's games, not his, and seven of them ran off the right of the card. `CardSection`'s toggle bar *is* the batter card's `.game-sub-bar` (plus `.section-bar` to adapt it to a `<button>`), so both cards' expandables share one format — a bare label, no sub, no caret. **Only Line is open when a card first expands** (`CardSection`'s `defaultOpen`, off by default): opening a pitcher used to unroll all four sections at once — a screen and a half of tables before the next player — so the rest now start as bars, and the game line, the one thing you open a pitcher's card for, reads first. **Nothing on the pitcher side carries a caret** — not the card's sections, not its inning blocks or batters faced, and not the feed's collapsible outing (`.feed-item-toggle`, the line bar under its header): the bar *is* the affordance, and the only triangle allowed near an inning is the half-inning top/bottom indicator, which is a label rather than a toggle. This keeps getting re-added; don't. The game line deliberately reuses the arsenal row's parts instead of `StatPill`s so the two read as one table — an `.ars-row` accented by `decisionColor()` whose head carries the W/L/S, IP, pitch count and a `RateBar` for strike% (the shared labeled bar: label, track, percentage, then the raw counts — `66 S · 32 B` here), and which ends in three `.ars-results` strips: **Results** (H/2B/3B/HR/R/ER/BB/HBP/K), **Rates** (ERA/WHIP/BAA/K%/BB%/Whiff/CSW, plus WP and inherited-runners-scored only when nonzero) and **Contact** (`battedBallStats()` over the faced batters: BIP, avg/max EV, 95+%, GB/LD/FB — derived from the plays because the boxscore has no exit velocity and only counts batted-ball outs). (A credit chip — **W/L/S/HLD**, `creditLabel()`; a bare "H" would read as a hit — sits in the card header, on the game line's head and on the feed's outing row, all off the one `PitcherGame.decision` field. A hold takes the same relief amber as the RP chip.) **Opponent** sits *below* Innings and takes the same toggle bar as the sections around it — but only on a card with an outing under it: once he's thrown a pitch this is background to a game that has its own story, so it reads last and folds away. `OpponentSection`'s `collapsible` prop drives that; without it (the **no-outing card** and the feed's Upcoming row) the heading is a plain `.opp-title` label — no frame, and none of the 46px `.game-sub-bar` reserves for the controls a collapsible one carries — because there it's the whole point of the card and a toggle would only offer to hide the one thing worth reading. It reads: **how the opposing lineup has hit, whole and by the hand on the mound, over a span the reader picks and cut to home games, road games or both.** That non-collapsible form is also the whole of the **no-outing card**, which is otherwise header-only: a pitcher with a scheduled or in-progress game he hasn't entered becomes collapsible and opens straight onto this section, since who's waiting for him is the only thing that card can say before first pitch (a game he *sat out* isn't offered — the lineup he didn't face is nothing). That card takes `.empty`'s **dashed border only when he can't still take the ball** — no game at all, or every one of them over (or called off) without him. The dashed edge claims nothing is coming, so a scheduled or in-progress game keeps the card solid. His hand normally comes off `game.stand`, which a pitcher's game only has once he's appeared in one, so `PlayerReport.throws` (from `getRosterInfo`'s `pitchHand`) stands in — without it the split, the useful half, would be missing in exactly the pre-game case this is for. It is a **table** — nine categories across, and **Overall / vs RHP / vs LHP** down — where it was three stat strips, and the shape is the point: those are the same nine questions asked three ways, so a reader wants to run their eye *down* a column ("is this lineup worse against lefties, and by how much") and three separate strips of label-and-value pairs made you do that by memory. Rows and columns is the app's own answer everywhere else it comes up, and the table is folded into **`.glog-table` / `.glog-scroll`**'s selector lists rather than restyled to resemble them — one set of paddings, one zebra stripe, one pinned left edge, one sticky header. What it deliberately does **not** take is the log's `cursor: pointer` and row hover, which say a row is a press: nothing here is.

**It takes the three things it reads rather than a whole `PlayerGame`** — `hitting` (the season, all-games cut), `opponent` (the club, for the corner header) and `hand` (which row is accented) — and that is a fourth caller's doing: the player page's **Projected Starts** block opens this same table off a `ProjectedStart`, which is a `gamePk`, a date and an opponent id with no game behind it at all. The whole of that argument, and why the `game.stand ?? throws` fallback moved *out* to the callers, is in **Client — the player page**, *`OpponentSection` takes what it reads, and a start is not a game*. Nothing about the other call sites changed but one line each; measured after, the feed's Upcoming dialog still reads `SD · vs RHP` off `stand` and the outing page's **Opponent** tab `MIL · vs LHP`. (That second one was the `Full breakdown` dialog when it was measured — the two landed in the same merge, and it is the same section under a tab now, taking `bare` where the dialog took `defaultOpen`.)

**Two controls sit above it.** A **span** — `Season · 7d · 15d · 30d · 60d`, deliberately the research board's own five so "the last 30 days" means one thing everywhere in the app — and a **venue**, `All Games · Home · Away`. Both are the app's segmented switch, folded onto `.view-switch`/`.view-tab` rather than restyled, and both `flex: none` so a narrow card breaks between the two rather than inside one. They compose: picking `Away` and then `Season` gives the away half of the season, which is the whole reason the nine cuts ship together.

**Only the span costs a request.** The report already carries the **season, all games** cut for every opponent in view (`PlayerGame.opponentHitting`), so the table's opening state draws with no fetch at all; `/api/teams/:id/hitting?window=` serves the other four, and each answers with **all three venues**, so changing that control is free. A span read once is kept for the life of the card. The wait for an unread span is a **block wait behind `WAIT_DELAY`** rather than the previous span's numbers left standing — that is the one place this parts from "never blank over data", and for a stated reason: the old table under a lit `15d` would be a wrong label on a right table, which is worse than a moment of nothing. A failed read says so and **pressing the lit span again retries** (`attempt`, bumped when the reader presses the span already selected — `setWindow` to the value it holds changes nothing, so without it the message would promise a retry the effect never runs).

**Every number keeps its league rank**, and it is `.col-rank` under the value now rather than `.ars-rnote` beside it — the research board's own percentile badge folded onto rather than restyled, so a second line under a number is one object in this app, and a rank costs the column no width. A rank is what makes a team line readable at all: `.231` says nothing until you know it is 28th. **1st is always the best offense**, so the fewest strikeouts ranks 1st rather than 30th, and **each cut ranks within its own population** — a 30-day home-vs-LHP line against the other 29 teams' 30-day home-vs-LHP lines, never against the season board. The four columns with no rank are the ones a rank would say nothing about: games, plate appearances, and — where there is nothing to rank against — a cut nobody batted in.

**The row matching the pitcher's own hand is accented**, the way the Splits card marks the half that applies to a game, with the reason in its title rather than a third line of text. His hand normally comes off `game.stand`, which a pitcher's game only has once he has appeared in one, so `PlayerReport.throws` stands in — without it the row that matters would be unmarked in exactly the pre-game case this is for. The cells keep the zebra ground rather than taking a wash: a band across the row would be a second color system beside the rank badges, which is the argument the League table's own row wash lost.

**The gutter reads the container rather than the viewport**, which is the one place the table parts from the log's shared clamp and is a measurement rather than a preference. Every other wide table in the app grows with the window, so `vw` is the right signal for them; this one lives in a dialog capped at `--card-column`, so at 1920 the shared clamp opened to its full 28px and pushed eleven columns **204px past a pane that had stopped growing at 800**. `cqi` against `.app-dialog-body` — already a container for the plate-appearance detail's own queries — tracks the box the table is actually in, capped at 13px for the research board's reason: eleven columns and no slack. Measured, that takes the table 972 → 768px inside a 770px pane, i.e. from 204px of sideways scroll to none.

**Measured at 320 / 390 / 640 / 900 / 1200 / 1920**, in the Upcoming dialog: the table fits its pane with **0 sideways scroll from 640 up** and scrolls on a phone as every wide table here does (226px at 320, 162 at 390), with the row-label column **pinned at 0** and the header row at 1px — which is the border — at every width, rows **58.55px** and the header **37.84**, and the page body and the dialog body each overflowing by **0** everywhere. The two controls share one line from 640 up and take two at 390.

The collapsed header's line is the **range in view** rather than the season (`rangePitchingSummary` — ERA · WHIP · K% · BB% over the outings on the card, and the matchup instead while `onePitchedGame` holds; see **Client** for the rule and its batter twin). The season line it replaced ran ERA · FIP · WHIP · K/9 · BB/9 · HR/9 and carried **no estimators**, for a reason that outlived it: xERA and xFIP used to ride along paired with the number each estimates (`2.20/3.04 ERA/xERA`), which doubled the width of the two leading items and turned a line meant to be scanned into one to be read. The pairing itself is right — the comparison is why they're carried, and it only lands if the two sit together — so it survives where there's room for it, on the **Season tab**, which puts each estimator immediately after the number it estimates and is now where the season line itself lives, whole and a tap away. The Line and Arsenal sections each carry their own `SplitTabs` — **Overall / vs RHB / vs LHB**, offering only a hand he actually faced and hiding itself when that leaves one option. On a split the head shows BF instead of IP and drops the decision, and Rates drops ERA/WHIP: a split's line is derived from the plays, so it has no innings (`splitOf()` returns null for Overall, which is what every "is this the whole outing" check reads). The arsenal is a **Savant-style color-coded table** (one row per pitch type: `pitchStyle()` dot+abbr, then two `RateBar`s — **Usage** with the pitch count and **Strike** with that type's S/B counts — then velo/spin/iVB/HB with ▲▼-vs-season deltas + whiff — the delta's **green/red is per pitch type**, from `PITCH_DIRECTIONS` (a `BetterWay` per metric): a four-seamer wants more iVB, a changeup/curveball wants less, a slider's iVB is `none` (uncolored, it sits near zero by design), and offspeed velo/`Sinker` spin are `none` too since neither is a quality signal on its own. HB uses `more` — its sign is only arm side vs glove side and flips with handedness, so the delta compares **magnitude**; without that, a lefty gaining break read as red — then a **Szn vs** Results strip carrying the same stats in the same order as the details tab's — PA/BA/SLG/wOBA/xwOBA/PutAway). **A split's season column is that same split of his season**, not his season as a whole: `attachArsenalBaselines` feeds the game's `vsRight`/`vsLeft` mixes from `SeasonArsenals.vsRight`/`vsLeft` (falling back to `all` per pitch type, for one he's barely thrown to that hand), and the strip's tag says which — **Szn vs RHB** / **Szn vs LHB**. Before that the baselines were season-wide on every tab, so switching to vs RHB moved the game numbers and left the season ones sitting still, comparing two different populations. Inside the Innings section the `InningBlock`s are bars carrying that inning's line (BF/H/R/ER/K/BB/pitches — `inningStats()`; ER only when it differs from R), each opening a dialog onto the result rows, each of which leads with its number within the inning (`.faced-seq`) and opens again onto the full pitch-by-pitch sequence. They were accordions when this card rendered; see **An inning is a popup** below. A batted ball there reads the **same line a batter's at-bat carries** — exit velo · launch angle · distance from `contactHighlight()` — on the row, and again in the opened detail beside the batted-ball type and xwOBA, the way `PlateAppearanceCard` lays it out. It used to print exit velo alone; the helper now takes the three batted-ball fields rather than a whole `PlateAppearance`, since `FacedBatter` carries them too and one contact should describe itself the same way from either side of it. **An inning block also carries what happened on the bases** — his balk, his wild pitch, the bag taken off him, the man he picked off (`InningBaseEvent`, off the same `PlayerGame.baseEvents` the feed reads; see **the base-event vocabulary** under Client for what is in that list and why the passed ball and the run are not). They are merged in on **`atBatNumber`** — which is why `FacedBatter` now carries one — and land *before* the batter of the same number, a balk happening in the middle of an at-bat where the batter's row is that at-bat's outcome. An event whose at-bat has no row at all goes to the end of its inning, which is exactly right for the one case that produces it: a caught stealing for the third out, where MLB files the play under the batter who was up and `savant.ts` drops it as the non-plate-appearance it is. The **groups are sorted by inning** rather than left in the order they were built, because that same case can produce an inning made of nothing but an event — a reliever brought in for one batter who picks the runner off to end it — and an inning first seen while merging the events would otherwise be appended after every inning he actually faced someone in: a half-inning at the wrong end of the outing, wherever the outing is drawn. It sits on a quieter ground, being background to the at-bat it happened inside, and is accented by the same four tones the feed's rail uses so one event is the one color in both places. `.faced-seq` stays the *batter* count and skips them: it answers "which man of the inning is this", and a balk is not one of them — what the row carries at that end instead is **the count a steal went on**, where a batter's row carries his pitch count, that being the one thing about a steal neither the glyph nor MLB's line for the play ever says.

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

**A shorthand zeroed the clip's own top margin, and the row sat on the video.** `.faced-card .pa-video` was written `margin: 0 12px 12px`. The horizontal 12 is the row's own padding, so the video lines up with the badge above it and that half is argued; the `0` never was, and it overrode the `margin-top: 10px` that `.pa-video` gives every clip in the app. The only air above a clip in the inning popup was the row's own 11px of padding — measured at 1200 on Trevor Megill's bottom-of-the-9th, three faced batters each with film: **0px between the row's box and the top of the video**, against 12px below it and 12px either side, where the batter feed's clip in the same shape (`FeedAtBat`: the card, then `InlineVideoClip`) sits **18px** under its card. Set the three margins one at a time — left, right, bottom — so the top is left to the one rule that declares it, rather than restating the 10px here where the two could drift apart. Before → after, at 320, 390 and 1200 alike: row bottom to clip top **0 → 10px**, with the clip's 12px bottom, its 16px inset from the card's left edge and its size (745×360 at 1200, 303×170 at 390, 233×131 at 320) all unmoved. The same fix reaches the base-event card, whose clip sits under `.faced-des` rather than under a row and was tight for exactly the same reason — Kevin Gausman, 2026-08-13, the 5th: 0 → 10px there too. The batter feed's own clips are untouched, the selector needing a `.faced-card` to bite: 18px before and after. Bundle: CSS **155.43 → 155.46 KB** (27.82 → 27.83 gzipped), JS unchanged at 578.64 (172.36).

**What is still an accordion, and why the test survives its own reversal.** The grouping-against-detail test was not wrong; it was applied to a case where the *cost of the grouping staying open* had not been measured. Nothing else on the pitcher side changed: `CardSection` is still a plain label inside the breakdown, and the two unrendered cards' game blocks still collapse. The rule to carry forward is the sharper one — **a grouping may stay an accordion only while opening it does not push the thing the reader is reading**, and inside a bounded dialog scroller it always does.

**Innings read first-to-last everywhere, and `newestFirst` is gone.** `InningsList` took a flag that reversed them, which the feed passed so the half he was throwing sat directly under his name the way the stream around it reads newest-first. What that bought was one inning's convenience on a live outing; what it cost is that an outing was drawn in **two different orders in two places of the same app** — the card and the breakdown one way, the feed the other — with the reader expected to notice which. An outing is a thing with a beginning: a first inning at the top is how a box score, a game log and a scorebook all read it, and it is what makes "he lost it in the sixth" a sentence you can follow down the page. The live half is still marked (`.inning-block.active`), so nothing is lost by leaving it where it belongs in the sequence. Measured on a real outing in the feed, before → after: `5th 4th 3rd 2nd 1st` → `1st 2nd 3rd 4th 5th`, and the same list in the Overview tab's game dialog, the Game Log's popup and the breakdown. Batters faced always read in play order, live or final, and always did. While the watched pitcher is the one on the mound (`status.pitchingId`), the half-inning he's throwing gets `.inning-block.active` — a **`--mound-teal`** border, a 12% head tint and a **Live** tag, the same teal his row, his ring, his tag and his rail take, so "this man is working" reads as one thing across the app. It was `--live-purple`, on the reasoning that it is "the same purple the at-bat/on-base rings use" — which said *this pitcher is working* in the color a **runner** wears, and is the collision the summary table's legend made visible; see **Client**, where the token and the measured gaps between all four role grounds are set out. The arsenal table itself lives in **`Arsenal.tsx`**, shared by both views: `ArsenalRow` (one game, ▲▼ vs the pitcher's own season — the outing page's Arsenal tab is its live caller), and the pieces it shares with what is left of the file. `SeasonArsenalRow` (the whole season, ▲▼ vs the **league**) was beside it until the player page's Arsenal tab became the two charts alone; it had exactly one caller, and every helper it used — `RateBar`, `ArsenalMetric`, `ResultStat`, `PITCH_DIRECTIONS`, `pct`/`avg3` — is read by `ArsenalRow` too, so removing it orphaned nothing. Those pieces, plus — `RateBar`, `ArsenalMetric`, `ResultStat`, `PITCH_DIRECTIONS`, `SplitTabs` (the Overall / vs RHB / vs LHB selector the pitcher card's Line and Arsenal sections use too) and the `pct`/`avg3` formatters. That pitch sequence (pitch table + `StrikeZone` plot, sharing a hover/tap highlight) lives in the shared `PitchSequence.tsx` — extracted from `PlateAppearanceCard`, which now reuses `PitchTable`. The innings themselves live in **`Innings.tsx`** for the same reason — `InningsList` (grouping + the live-inning accent), `InningBlock` and `FacedBatterCard` — so every place an outing is drawn reads it identically — and it takes no flag to say so, `newestFirst` having gone (above). Everything here still mirrors its batter counterpart: the inning bar takes the game bar's shape and raises a dialog rather than unrolling (see above, which is also why `useScrollIntoViewOnExpand` has no caller left in this file — nothing here moves the page any more), the faced-batter card takes `.pa-card`'s radius, left accent, hover tint and focus ring and opens a dialog exactly as `PlateAppearanceCard` does, carrying its clip on the row exactly as `FeedAtBat` does, and **nothing carries a caret** either way. The batter-name font shrinks on narrow cards via `@container` queries on `.faced-batter`. `SummaryTable` renders a pitcher sub-table (IP/H/R/ER/BB/K/HR, then the **W/SV/HLD** credits summed off `PitchingLine`, then ERA/WHIP — a credit column is dashed at zero, since almost every row is empty); `LiveFeed`'s pitcher tab renders one item per outing (`FeedPitcherGame`), whose bar raises a dialog holding that same `InningsList`, and `PlayerDay.tsx` draws that very item for one pitcher's day on the player page — where it is the **live** entry alone, a finished outing being a card that opens the outing page rather than a bar that unrolls; `PlayerDetails` gains an `isPitcher` prop. It used to draw it in the Game Log's popup too, with a **`detailInline`** flag that made the bar static and read the innings underneath, and that popup is a batter's alone now.
