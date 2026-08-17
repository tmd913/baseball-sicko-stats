### The player page, and the reorder screen

Split out of `client.md`. `PlayerDetails` is the overlay that opens on **anybody**
— a roster row, a feed item, a research-board row of a man nobody has rostered —
which is the fact most of its design follows from. The dialog rules its tabs lean
on are in `client-dialogs.md`.

- **the player page and the editor** — what is left of the old **players / Games** view, which was one card per rostered player (`PlayerCard`, `PitcherCard`); the card became the feed's grouped reading and the grouping became this page's own **Overview** tab, so the card's job has ended up here. **Both card components survive in the tree and render nowhere**; their parts do the work instead — `PlateAppearanceCard`, `InningsList`, `OpponentSection` and `GameStatusBadge` are all read by `LiveFeed` (`PlatoonSplit` was the fifth until the feed's Upcoming row swapped it for `PlatoonSplits`' own card — see **The Upcoming dialog is the Splits card** in **Client — the Feed view** — so it is now named only by `PlayerCard`'s own unrendered `GameBlock`) and, through it, by `PlayerDay.tsx`, which is why the files stay and why rollup drops only the two shells (442KB → 425). See **Pitchers on the roster** for the two things that went off screen with them and have not been rehomed. `PlayerDetails` overlays a tabbed view: **Overview** (his season line, his day and his last five games — see its own section below; first in the strip and the tab the page opens on), the percentile card, a **Charts** tab holding the rolling-xwOBA chart (`RollingXwoba.tsx` — a client-computed rolling average over a 50/100/250-PA window, lazily fetched only when its tab opens; see **The Charts tab** below for why the strip names the kind of reading rather than the one card in it, for why the labels on that chart are sized in rendered pixels, and for why the league average is named in a legend under the chart rather than written across the plot), a pitchers-only **Arsenal** tab (also lazy, `SeasonArsenalRow`, with its own Overall / vs RHB / vs LHB `SplitTabs`), a **Game Log** tab (`GameLog.tsx`, lazy too — and lazy for the **Overview** as well, which draws five of its rows off the same one read; the whole season's games, newest first, in the app's one plain stat table outside the summary view. The table itself is **`GameLogTable`**, factored out so the tab and the Overview's preview are one component with `shown` and `totals` set differently rather than two tables free to drift — see **the player page's Overview tab** below: the counting stats per game plus the running **Szn** line (below), a `<tfoot>` season row summing **every** game rather than the page on screen (pinned to the bottom of the box, but **only on that axis**: its label spans four columns and carries `.glog-date`, the class that pins the date column to the left edge, so scrolling right slid the label along over its own totals and swallowed the first two stat columns — `left: auto` leaves it constrained on the block axis alone), and the feed's Load-more paging at `PAGE_SIZE` 25 because a batter's season is 150 rows inside an overlay that already scrolls. Its header row sticks to the top and the date column to the left, both at once — which is why this tab alone gives the overlay `.gamelog-mode`: a sticky header can only stick to the box that scrolls, and the box that scrolls has to be the table's own (its columns overflow a phone, and an `overflow-x` container scrolls in both axes whether you want it to or not), so the overlay becomes a fixed-height flex column — the shape `.app.summary-mode` gives the summary view — with the head and tabs holding their place. Zeroes are dimmed so the eye lands on the games with something in them. **Every row is a press that opens that game as a feed**, and carries the hover tint and the pointer that say so — see **The Game Log's rows open the game** below, which also sets out why the rows deliberately carried no tint for as long as they did nothing. The zebra stripe is untouched: it is what keeps a fourteen-column row readable across, and it is the same device the other two wide tables use. The pitcher's SP/RP marker renders **only when the log holds both** — twenty rows of SP say nothing the IP column doesn't. **The batter's line leads with where he hit and where he stood** — `Batting` and `Pos`, adjacent and ahead of the counting stats, because both are game context of the kind the opponent cell beside them is rather than anything he did. They are **one fact read twice**: `Batting` is his index in the posted order and `Pos` is where that same start was made, so neither can claim he started when the other says he didn't, and a man who came on off the bench draws a dimmed `—` in both under one tooltip (`Not in the posted lineup`) rather than a position for a start he never made. A starter's reads `Started at C`. See **Date handling and server routing** for where the position comes from, why the split's `positionsPlayed` is gated on the lineup entry rather than trusted alone, and why the schedule's own per-game position — correct, and already fetched — was refused on payload. It costs the table **70px at 1200 and 39 at 390** on a log that scrolls sideways at both, and nothing at all in height.

The batter's line then **leads its stats on `H/AB`** — one cell where AB and H were two columns, the same shape the summary table's own `H/AB` uses. It spent a spell over **plate appearances** instead, on the argument that AB throws away the walk and the sacrifice, so a 2-for-4 night with a walk read `2/5` where the at-bat count alone calls it four trips. What that traded away is the thing this column is actually read for: **every other number on the line is over at-bats** — the `Szn AVG` three cells along, and the AVG and the SLG inside the OPS on the `<tfoot>` row underneath — so `H/PA` was the one cell on the row whose denominator nothing else on it shared, and a reader checking the .259 beside it found 117 over 524 rather than the 117 over 452 that made it. Over at-bats the cell and the average agree by construction, and the walk it was defending is not lost at all: it is the BB column four cells along, which is where a walk belongs. `2/4` with a `1` under BB is a five-trip night stated in the two places that own the two facts. **PA leaves the columns and not the row** — it rides the cell's tooltip (`0 hits in 4 at-bats · 5 PA`) and it is still what tells the two kinds of `0/0` apart, below. The `<tfoot>` follows the cell above it, being that column's sum: season hits over season **at-bats**, which is the very pair the AVG at the end of the same row divides. Checked in a browser against MLB's published season line, three batters end to end — Alonso `117/452` · .259 · .833, Soto `83/293` · .283 · .947, and Justin Dean `3/8` · .375 · 1.125 at the thin end of the scale — each identical to MLB's own; and league-wide, summing 9,023 game-log rows across 120 batters reproduces MLB's season AB and H for **all 120**, 0 mismatches. **What dims is `pa === 0`, not a bare `0/0`.** A man who appeared without coming to the plate — a pinch-runner, a defensive replacement — has nothing to read in this cell and dims whole, the way every other zero in this table does. Over at-bats a night that was one walk is *also* `0/0`, and it deliberately stays plain: he did come up and he did do something, and the cell can no longer tell those two apart where the row still can. That distinction is worth keeping rather than collapsing — in the same sample 309 rows are a genuine 0 PA against 97 that are `0/0` off a walk or a sacrifice, so dimming on at-bats would have quietly filed 97 real plate appearances as “not in the game”. Each says which of the two it is on hover, the plain one naming the trip it doesn't count (`1 PA, no official at-bat`). `decisionColor` moved from `PitcherCard.tsx` to `lib.ts` so the log's W/L/S/HLD chips take the same colours as the card's. **The Szn columns read in the order the two lines are read in.** A batter's are `Szn AVG · Szn OBP · Szn SLG · Szn OPS` — slash-line order, so the eye takes them the way a slash line is taken, and OBP and SLG sit between AVG and OPS rather than after it because a slash line with its middle terms at the end is not a slash line. **SLG had gone unspent for a while**, on the argument that `seasonSlg` — parsed and shipped by the route since it was written — is exactly `OPS − OBP` off the two cells beside it, so a column for it would be a fourth cell saying nothing the other three didn't already imply, on a table already sixteen columns wide on the pitcher tab. That argument proves too much: `AVG` is no less implied by `H/AB` two cells to its left, and the whole point of a slash line is that a reader wants the middle terms named rather than derived on the fly down a column of games. So it is a column now, between `Szn OBP` and `Szn OPS`, reading straight off the same `seasonSlg` the route has always sent (`toBatterGameLog`'s `s(st.slg)`, the same season-to-date field `seasonAvg`/`seasonObp`/`seasonOps` already are — checked against MLB's own published season line for Salvador Perez, `.216/.262/.369/.631`, exact on all four). A pitcher's are `Szn ERA · Szn FIP · Szn WHIP` — **the estimator immediately after the number it estimates**, which is the rule the pitcher card's season line and the research board's `ERA · xERA · FIP · xFIP` both follow, and the reason the pair must not be split. **WHIP comes after the pair rather than between them**, because it answers a different question: ERA and FIP are two readings of the runs, one of them scrubbed of the fielding behind him, and a number counting the traffic he allows has no business standing in the middle of that comparison. FIP is **null under three innings** — `fipLike`'s own rule, applied to the season-to-date innings — and dashes there, which on a reliever's log is his first outing or two and nothing else.

**The `<tfoot>` treats the two kinds differently, and the split is honest rather than tidy.** The batter's OBP and SLG are **recomputed from the totals** alongside the AVG already there, off the `hbp`/`sacFlies`/`totalBases` the row has carried for exactly this since it was written — the four cells are then one arithmetic over one set of sums, and the OPS at the end of the row is that OBP plus that SLG. SLG shares AVG's guard rather than getting its own: both are null (dashed `—`) only when at-bats is zero, since both are over at-bats and a season with none has neither. The pitcher's FIP and WHIP are **not** recomputed and are **not summed** — a season-to-date rate is not a summable thing, and the newest row's running value *is* the season, the log running to the last game played. So the foot takes `games[0]`'s. That is right twice over: it keeps FIP's one definition on the server, where the constant behind it lives, rather than restating `FIP_CONSTANT` in a table; and it cannot disagree with the row directly above it. Checked against MLB's published season line end to end — **Alonso** `.259/.353/.833`, **Soto** `.283/.408/.947`, **Ohtani** `.290/.392/.930` and **Ke'Bryan Hayes** `.138/.191/.425` on the batting side (newest row and recomputed foot alike, save the one hundredth of Ohtani's foot OPS, which is the pre-existing rounding of an unrounded `obp + slg` against MLB's rounding of each half first), and **Sánchez** `2.54 / 2.68 / 1.19`, **Alcantara** `3.52 / 3.83 / 1.17`, **Gallen** `6.34 / 5.36 / 1.56` and **Vesia** `2.81 / 3.10 / 1.18` on the pitching side, each FIP identical to the one the Season tab prints for the same man.

**`Szn SLG` checked the same three ways.** Salvador Perez's newest row reads `.216 / .262 / .369 / .631` — identical to MLB's own published season line (`avg .216, obp .262, slg .369, ops .631`) — and `.631 − (.262 + .369)` is `0.000`, so the row's own OPS is still exactly OBP plus SLG with the new column standing between them. Reconstructing the totals independently from all 113 of his game-log rows (`totalBases / ab`) gives the identical `.369`, matching both the newest row's running figure and the `<tfoot>`'s own recomputation — which is the same "a season-to-date line through the last game is the season" agreement the OBP and OPS cells already had. **Measured at 390px and 1200px on the real log, before → after the column**: the batting table goes **771.53px → 836.86** at 390 and **1233.25 → 1329.36** at 1200 — one more numeric cell, ~65px at the narrow end and ~96px at the wide one where the gutter clamp is looser — against a scrollport that was already going to scroll on this table at every width checked; the header row still reads `… Szn AVG · Szn OBP · Szn SLG · Szn OPS` in that order, the pitcher's log is untouched (fourteen columns, no `Szn SLG` anywhere, since a pitcher's line has no batting average to slug), and the **page body and the overlay both overflow by 0** at both widths, before and after. **Bundle: 494.02 → 494.18 KB of JS** (146.19 → 146.22 gzipped), **CSS unchanged** at 115.61 KB (20.54 gzipped) — one cell in two components and an array entry, against a page that was already going to scroll.

**Measured at 390px on the real log**: the batting table goes **688px → 753** for one column and the pitching table **659 → 789** for two, against a 390px scrollport that was always going to scroll — and the page body overflows at **no** width (checked 320 / 390 / 640 / 1200 on both tabs, document overflow 0 at every one). The two sticky axes are untouched at every one of them: the date column pins at **0** from the scrollport's left edge with the table scrolled to its far right, and the header row at **1px**, which is the border.  It carries the same **full-page button** the other two wide tables do, inline in its Date header — the corner cell, pinned on both axes, so it is the way out as well as in; expanding now drops nothing but the app's own chrome, the log having stopped capping itself), a **Stats** tab — the research board transposed onto one player, five spans down the side and the board's own columns across (see **The Stats tab: the board, transposed** below) — and a **Splits** tab, which is that same season cut by *handedness* instead of by time: one diverging bar per stat, pointing at the side he is stronger against (`components/PlatoonSplits.tsx`, and **The Splits tab** below for the whole of its reasoning). Those two were one tab until the platoon card became a comparison rather than a table; `SeasonPanel` / `PitcherSeasonPanel` and their `.split-block` stat pills are gone from `PlayerDetails.tsx` with it, and the `.split-block` / `.stat-pill` rules are now read by nothing that renders — `PlayerCard.tsx`'s `PlatoonSplit` was their last live caller, and the feed's Upcoming row draws `BatterSplitsTab` instead. The player page is a fixed full-screen overlay with its own scroller, so it pins the body (`hooks.ts::useLockBodyScroll`, restoring the scroll on close) and sets `overscroll-behavior: none` — without both, scrolling it chained through to the list behind and closing it landed the user somewhere they never scrolled to; `none` rather than the `contain` that stood here for a while, since that stops the chaining and keeps the overlay's own iOS bounce (see **A table stops when its rows do** above). `GameReel`'s `.reel-view` is the same shape and does the same. `PlayerAdder` searches the season roster; the settings menu's **Edit players** entry swaps the card list for `PlayerOrderEditor.tsx` — a drag-to-reorder screen showing only each player's number, headshot, name and a remove button. It drags via Pointer Events (mouse + touch). **On touch only the ⠿ grip starts a drag** — `touch-action: none` sits on `.order-grip` alone, so a finger anywhere else on the row scrolls the list as usual (with it on `.order-row` the whole page was unscrollable in edit mode); a mouse has no such conflict and can still grab the row anywhere (`startRowDrag` bails on non-mouse pointers, the grip stops propagation so one press starts one drag). It reorders the live list as the dragged row passes another (the row under the pointer is found with `elementFromPoint`; the dragged row sets `pointer-events: none` so it resolves to its drop target), auto-scrolls the page while a drag is held within `EDGE_ZONE` of the viewport top/bottom, and persists the order (`PUT /api/watchlist/order` — the roster's route, old name and all) once on release. Each row's ✕ removes that player: two taps, the first arming the button into a red "Remove?" (a row you drag shouldn't delete a player on one stray tap, and there's no undo), the second calling `App.tsx::removeFromEditor` — which drops him from `reports`/`reportsRef` immediately so the row goes before the roster-triggered refetch lands, and so a drag right after commits the order without him. The button stops `pointerdown` propagating, or the row's drag handler would `preventDefault` the click away. That button is **`RemoveButton.tsx`**, shared with `PlayerDetails`' header so the roster's one destructive control looks and behaves the same wherever it appears — controlled rather than self-arming, because the editor keeps a single armed row across the whole list. Edit mode is transient — deliberately **not** in the URL — and clears on a view switch. There is no longer a player-nav strip; a player can also be removed from `PlayerDetails`.

**The chip beside a card's name is his ESPN eligibility**, whenever a league is connected — the same swap the research board's pills and Pos cell made, arriving on the cards for the same reason. MLB's one word is the wrong answer to the question a card in this app is read with: it is single-valued where a fantasy position is not, it is sometimes flatly different (Curtis Mead is listed at 2B and is eligible at 1B and 3B), and on a **pitcher's card it was `P`** — one letter, true of everybody on the tab, where `SP` and `RP` are the distinction a reader actually wants. Without a league, or for a player ESPN can't be joined to, it is MLB's listed position exactly as before, so nothing changes for a user without one. It costs no fetch: the map rides on the `/api/espn/ownership` response the board and the player page already read (see **ESPN fantasy league**, where the read losing its laziness is set out).

**Narrowed to the card's own kind** (`lib.ts::eligibleForKind`), exactly as each board is: a two-way player's bat reads `DH` where his arm reads `SP`, and the mis-joined Fernando Cruz reads his fallback rather than `2B/SS` on a pitcher's card. **And capped at two codes and a count** (`positionCodes`, which is now the *card's* rule alone — the board's cell prints the list whole and takes only the shared hoist, `positionOrder`, from it), because a card's header is a name and this chip on one line: measured on a real roster at 390px, the uncapped list wraps **8 of 14 names** and at 360 **13 of 14**, against the 1 and 3 that wrap today; capped, the worst the league can produce (`1B/2B+3`) wraps 3 and 6, and the roster as it actually stands wraps 2 and 3. The whole list is on the chip's `title` and printed whole on the player page, which is the one place with room for it.

**The card header summarises the range in view, not the season.** Everything under it is about the days the calendar names — the game blocks, the plate appearances, the aggregate on the right of the header itself — and the line under the player's name was the one thing on the card describing a different span: a week in which a hitter went 3-for-19 still read `.932 OPS, 27 HR, 72 RBI, 85 R, 30 SB`, because that is his year. It now reads `6 G · .158/.200/.158` (`rangeBattingSummary`) and, on a pitcher, `4.50 ERA, 1.17 WHIP, 35% K, 9% BB` (`rangePitchingSummary`) — the same games the card's own contents add up to. **The season is not lost**: the details view's **Season** tab shows it whole, a tap away, with the room to pair each estimator with the number it estimates, which a line meant to be scanned never had.

**The slash rather than the counting stats**, because the counting line sits in the same header a few centimetres to the right (`lineSummary` — `3-19, 1 R, 3 RBI, BB, K, .358 OPS`) and the two halves of a slash line are the one thing it cannot say. Its own OPS is left out for that same reason: the line beside it already ends in one, and this is that number's two halves. On the pitcher side K and BB are shares of **batters faced** rather than the season line's per-9 rates — a range can be a single appearance, and one inning turns K/9 into 18.0 where a share of the men he faced reads the same at any sample, and it is already the vocabulary of the card's own Rates strip below. Checked at 390px on a real watchlist: both lines sit under the name without wrapping, which is the constraint that took the estimators off the old season line in the first place.

**One game in view is named rather than added up.** Within a single day a card holding one game puts the matchup there instead — `KC @ LAD` — because a final's status badge carries the score and not the teams, so this is the only place the card says who was played; the aggregate takes over exactly where the pitcher card's `onePitchedGame` already stopped, and on the **range** rather than the game count, so a starter's week and a reliever's week read the same way (see **Pitchers on the watchlist**). The batter's test is the same shape (`oneGame`, `singleDay && played.length <= 1`), and the status badge then drops its own `withMatchup` copy of the teams, which would be them twice on one row.

**With nothing yet to add up, the game info takes the slot.** A range he hasn't played in has no line to print and used to print the season's; the line now names the game instead — the matchup where there is a single one to name, `ATH · 3 games` where there are several — which is the whole of what such a card is about and costs the row nothing, where a line of dashes plus the same fact stated below would cost it two. On a pitcher's no-outing card that line is joined by the opposing probable (`vs LHP Thornton` — `ProbablePitcher`'s `opposing` prop, which changes only the tooltip, the wording being right either way) and the first-pitch badge, with the lineup waiting for him below; the **SP pip stays on the headshot** rather than becoming a chip beside the name, and now shows on any range holding one game rather than only on a single day, a pip belonging to a game and not to a date. The batter card takes the pitcher's `.empty` rule with it: the dashed border claims nothing is coming, so it belongs only on a batter who can't still come to the plate. That is reachable there for a postponement alone — a range of finals with no plate appearance in it is `didNotAppear`'s card, which was already dashed.

### The player page's Overview tab: the player as a summary page

**It was his day and nothing else, and one thing is not what a page opened on a stranger is opened for.** A research-board row is a man you are deciding about, and the three questions under that decision are *how good is he*, *what is he doing* and *how has he been going* — of which the tab answered the middle one and left the other two behind two more tabs. So it is three blocks in that order (`PlayerOverview.tsx`), each a summary with a door to the tab that holds it whole:

1. **Season** — the box-score line a roster decision actually turns on, with a `Stats →` link.
2. **Today** — his day, unchanged and drawn by `PlayerDay` exactly as before, or the **next game** he has when the day holds none.
3. **Last 5 games** — the Game Log tab's own table, five rows of it, with a `Game Log →` link.

**Not one of the three is a second copy of anything, which is the property the whole change was arranged around.** The season line is the very object the Stats tab draws, handed *down* from `PlayerDetails` rather than fetched again — it is already in flight when the page opens, and a second read would be a second answer free to disagree with the tab it summarises. The day is `PlayerDay`, which is the feed's own items. And the five rows are `GameLogTable`, factored out of `GameLog.tsx` for this and used by both drawings, so the column lists, the cells, the zebra stripe, the two sticky axes and the press that opens a game have one definition. The pieces live where their family does and are imported out of it, the rule `LiveFeed.tsx` and `PitcherCard.tsx` already follow.

**The game log's read moved up a tab and did not become a second one.** `PlayerDetails` gated it on `tab === 'gamelog'`; it is now `'gamelog' || 'overview'`, keyed as before on `${kind}-${playerId}`, so one read serves both and crossing from the summary to the full log is free — and the two can never show different rows, which two independent fetches half an hour apart could. **`GameLogPreview` holds no data of its own**; it is handed the same `log` object.

**Only two things differ between the preview and the tab**, and both are `GameLogTable` props rather than a fork. `shown` is 5 against the tab's paging 25 — five rows is the shape of "lately", enough that a slump or a hot week shows and few enough that it stays a glance. And `totals` is off: the season row sums **every** game in the log rather than the rows on screen, which is right under a table that pages toward it and a non-sequitur under one whose heading says five. The `corner` prop is what the tab puts its expand button in; the preview passes none. Measured on a real pitcher at 1200: the preview draws 5 body rows and 0 foot rows, the tab 25 and 1, and the tab's expand button, `--table-bleed: 12px` full-page box, `.expanded-chrome` and its place in the Escape ladder are all unmoved (checked: expanded → one press leaves full page with the player page intact, a second closes the player).

**The season strip is `.glog-table` outright rather than a lookalike.** The app has one plain stat table and this is a one-row instance of it, so the class is reused and only three things come back off (`.ovw-table`): the pointer and the hover tint, which say a row is a press — the game log's rows open a game, this one is a line — and the body row's bottom border, which under a single row is a rule sitting a pixel above the box's own. Checked in a browser: `cursor: default`, `border-bottom-width: 0px`, against the preview row's `cursor: pointer` and `role="button"`.

**The tab takes the tab's width and the reading column moved inside it, which is a reversal of what stood here.** This paragraph used to explain why `.details-overview` declared **`--table-bleed: 0px`**: the bleed is always the *container's* own side padding — 22px on `.app`, 16 on the overlay, 12 in the full-page box — and a centred `--card-column` has none of its own, so the 16px it would otherwise inherit belongs to the overlay rather than to it and the tables would have hung out of a column every other block lines up with. That arithmetic is still exactly right, and it was an answer to the wrong question: it argued about how far the tables may bleed **out of the column** while taking for granted that they belonged in one.

**Two of the three blocks are not cards, they are stat tables**, and a stat table is the one thing in this app that is *scanned* rather than read — which is why the Game Log tab beside it dropped its own cap, why the summary table and the research board take the window, and why `--table-bleed` exists at all. Measured at 1200 before the change: the Overview column was **800px wide with 200px of empty overlay either side of it**, and the five-game table was **1,174.92px inside it** — a table scrolling sideways past `K`, `RBI` and the three `Szn` columns with 368px of nothing to its right. At 1920 it was worse in proportion: 1,327.84 inside 800, overflowing its pane by **528px** with 560px spare on each side.

So `.details-overview` loses its cap and inherits the overlay's own 16px bleed, and the cap moves to **`.details-overview .player-day`**, which is where it was always about — the day's items are the feed's cards and were sized against `--card-column` in the first place. The container goes with it: `container-type: inline-size` sits on the capped box rather than on a tab that is now as wide as the window, so a card reads its own column and cannot take the phone layout at one width and the wide one at the next for reasons nothing on screen could explain.

**Measured before → after, at 390 / 1200 / 1920.** The two `.glog-scroll` panes go 358 → **390**, 800 → **1200** and 800 → **1920**, each bleeding to the window's edge exactly as the Game Log tab's does; the five-game table's own overflow inside its pane goes **361 → 329** at 390 (a phone was always going to scroll a fourteen-column log), **372 → 0** at 1200 and **528 → 0** at 1920. The day's column is unchanged at **800px** (and the view's own width on a phone), the headings and the `Next game` line still sit at the overlay's 16px gutter, and the page body and the overlay both overflow by **0** at all three widths. **The Game Log tab is byte-identical** either side of the change, which is the thing that had to be true of a shared component: at 390 and 1200 its wrapper is 358 / 1168 at x=16, its pane 390 / 1200 at x=0 with a −16px bleed, its table 771.36 / 1233.08, its rows 44.55px, its date column pinned at 0 and its header row at 1px.

**The blocks are `.ovw-block`, and each heading is the percentile card's small caps minus the rule under it** — a block here closes on a table with its own border, so a second line above it would be two edges a few pixels apart. The links are text in the accent rather than buttons: they change which tab is on screen, which is what the strip above them does, so a button would be a second control competing with the tab it points at.

**Measured at 1200 and 390, on a batter, a starting pitcher and a reliever**: no horizontal overflow of the page or the overlay at either width (0 and 0 on every one), the season strip fits its column without scrolling at both (800 and 358), and the preview table scrolls inside its box exactly as the tab's does (1209 and 730 inside 800 and 358). The links work: `Stats →` lands on the Stats tab with the view scrolled back to the top, `Game Log →` on a 25-row log with its season foot, and a press on a preview row opens that game's `PlayerDayModal` at `z-index: 51` — the layer `DialogLayerContext` gives a dialog opened inside the overlay, untouched by any of this. **Bundle: 436.13 → 440.52 KB of JS** (129.23 → 130.31 gzipped) and **96.75 → 97.97 KB of CSS** (17.33 → 17.52), which is 4.4KB and 1.2KB raw — 1.1KB and 0.2KB over the wire — for two new blocks, a route and a component that replaced a copy that was never written.

#### The day, which is the block that did not change

**`PlayerDetails` still leads with his day**, before the percentile card and the season readings beside it — `PlayerDay.tsx`, drawn from the feed's own items and fed by `/api/players/:id/day`.

**It is the feed's grouped reading, and the Games view before that, arrived where it belongs.** Games was a card per player over the range; the feed's grouping was the same card on the same days; both were pages *about a player*, and the app already had one. What that page adds is the whole of the argument. It opens on **anybody** — a research-board row, a name in a feed item, a headshot on the summary table — where the grouped feed could only ever draw the players on your roster; and it carries the season beside the day, so "what did he do tonight" and "how good is he" are two tabs of one page rather than two pages that never met. The grouping's own strongest claim was that a sort order is not a page, and the same test finishes the job: one player's day is not a *view of a roster*, it is a fact about a player.

**Nothing about the drawing is new**, which is the property that had to be preserved rather than the code that had to be reused. The items are `FeedItem`, `LiveEntry` and `UpcomingRow` exactly as the stream renders them, and what happened to him is **`playerDayEntries`** — a function `LiveFeed.tsx` exports and *itself* uses, fanned across a roster and re-sorted by clock for the stream and called once for this tab. So the two readings cannot come to disagree about what happened, which is the same guarantee the grouped reading bought by deriving itself from the flat one, held by a smaller and more honest mechanism: one function rather than one bucketing pass over three collections. The pieces live in `LiveFeed.tsx` and are imported *out* of it, the way `PlayerCard.tsx` and `PitcherCard.tsx` already supply their parts *to* it — a component's home is where its family is, not where it happens to be rendered.

**The items are drawn `grouped`**, which drops their identity row: the page's own head has said the headshot, the name and the position chip once, and saying them per play is what the grouping was always for. That prop already existed and already had exactly this meaning, so nothing about the item shapes moved.

**The day is a card per game, and the plays are behind it.** It used to be the plays themselves, under a static header per game, and that was the tab spending its whole height on one thing: a day is one game almost every time, so what it opened on was a date line and then four or five at-bat cards with a clip apiece. Measured on the same batter and the same day, the tab is **384.75px → 44px at 1200 and 432.75px → 44px at 390**; on a pitcher it is **86 → 44** and **137 → 64**. That is the *lead* of a player page, and the first thing a lead should answer is "what did he do today", which is his line and how the game stands — the plays being the follow-up question.

So a game is a **card** (`.pday-game`, **folded into `.feed-item-toggle`'s selector lists** rather than restyled to resemble the bar it is: a full-width row carrying a line and a status badge, pressed to open what is behind it) carrying the date, his line for the game and `GameStatusBadge`, and a press opens the feed for that game in a dialog. Nothing was cut — everything the tab drew is one press away — and a doubleheader now reads as two things rather than as one long scroll with a rule through the middle of it.

**The matchup line went, and the badge is what let it.** The old header printed `CHC @ WSH` beside a badge that already reads `CHC 0–7 WSH` the moment there is a score — the same fact twice on one row — so the card drops the line and passes **`withMatchup`**, which fills exactly the gap the badge leaves (a game with no score yet). The card therefore says who was played in every state and says it once.

**The live entry and a scheduled game keep their place on the page**, which is the line worth drawing. A card behind a press is right for what has already happened; "he is at the plate right now" and "he is starting at 7:05" are what the page was opened *for*, and putting either behind a press would hide the answer to the question being asked. A **live** entry therefore sits above the cards — filing it behind one would bury it — while for a **batter** the game it belongs to still gets its card for the plays already completed in it. For a **pitcher** it does not, and the sentence used to stop one clause too early; see the section below.

**A scheduled game is an `UpcomingRow` instead of a card, not as well as one.** That row *is* the game info before first pitch — matchup, the SP chip, the other side's announced starter, first pitch, opening onto the platoon split or the lineup waiting for him — so a card above it would state the matchup twice.

**A game he was on the roster for and did nothing in is not a press**, there being nothing behind it: the card draws the line his stat line would have been on and stays static. Which of three things it says turns on the state, because getting it wrong is the difference between a fact and a wrong claim: a **final** says `Did not appear.`, a game still being played says `Not in the game yet.`, and anything else says `Yet to play.` (checked on a live game with a pitcher who hadn't come in, and on Aaron Judge's IL day, which reads the first).

**Inside the dialog the plays read forwards** — first at-bat first (`byPlayOrder`, which is `byRecency` negated so the two cannot disagree about a tie). The stream is newest-first because it is a stream; a *game* is one afternoon read start to finish, which is the order a box score, a play-by-play and a pitcher's innings all use. Checked on a real page: a batter's four trips read `1, 4, 7, 9` where they used to read `9, 7, 4, 1`.

**The combined line at the top of the tab is unchanged and still only appears when there is something to combine.** A day is one game almost every time, and that game's own card already carries his line for it — so on a single-game day the strip was the same string twice, an inch apart (measured on a real page: `1-2, 1 R, 2B, 2 BB, K, 1.750 OPS` in both). It is drawn only over a doubleheader, where it is the one place the two halves are added up.

**Narrowed to one game there is no card at all.** `PlayerDay` takes a `gamePk` — what a Game Log row means, and what a card's own dialog passes back in — and in that mode draws the feed directly: the box is already about that game, so a card inside one would be a press to reach the only thing on screen.

#### A pitcher on the mound was drawn twice

**The rule above reads as correct because it was written about a batter**, whose live entry is the **at-bat in progress** — never one of the completed plays, so his card underneath is the rest of his day and the two are complementary. A **pitcher's** feed item is his *whole outing* (`FeedPitcherGame`), so the live entry and the card were the same object: the outing bar with his line and his `GameStatusBadge`, and directly under it a static card with the date, the same line and the same badge again. On the tab the page opens on, an inch apart.

**`playerDayEntries` has had the guard since it was written and the card never saw it.** That function computes a `pinned` — the game a pitcher's live item is drawn from — and keeps its entry out of `entries`, which is what stops `LiveFeed`'s own stream repeating a pinned outing. `PlayerDay` builds its **sections off `report.games`** rather than off the entries, so the filter reached the plays and not the card. `livePitching` is that same guard one level up, phrased on exactly the condition the live branch renders on (`isPitcher && live.game.pitching`), so the two cannot come to disagree about which game is spoken for.

**Under a `gamePk` it was worse than a duplicate, which is the half a screenshot of the Overview tab would not have shown.** In the Game Log's popup the section *is* the plays, and with the pinned entry already filtered out of `entries` there were none — so `PlayerDayGameFeed` fell through to its empty case and printed **`Not in the game yet.`** beneath a bar saying he was on the mound in the second. The popup now draws the live item with `detailInline`, which is the rule that box already applies to a finished outing: it is about one game, so the innings read in it rather than behind a second press.

**Measured on the live 2026 season** (Grayson Rodriguez, LAA, 2026-08-14, on the mound), before → after:

| | 1200×900 | 390×844 |
| --- | --- | --- |
| Overview — outing bars | 1 → **1** | 1 → **1** |
| Overview — `.pday-game` cards | 1 → **0** | 1 → **0** |
| Overview — `GameStatusBadge`s | 2 → **1** | 2 → **1** |
| Overview — line summaries | 2 → **1** | 2 → **1** |
| Overview — `.player-day` height | 104 → **44px** | 135 → **75px** |
| Game Log popup — `Not in the game yet.` | 1 → **0** | 1 → **0** |
| Game Log popup — inning bars | 0 → **1** | 0 → **2** |

**And the three cases it must not touch were driven rather than reasoned about**, each pair back to back on the same build minutes apart. A **batter with a live at-bat** (Julio Rodríguez, at bat in the top of the 5th) is byte-identical at 1200: the `At bat` entry over one card reading `1-2, 2B, 1.500 OPS`, `.player-day` 146px both ways — which it has to be, `livePitching` being null for a batter and the filter then a no-op. A **final** game is identical on both kinds (Seiya Suzuki and Kodai Senga, one card and no bar, 44px). And the **Game Log popup** is identical where nothing is live — a batter's 675px at 390, a finished outing's 213px with its one inning bar at 1200. The **feed** is untouched by construction (`LiveFeed.tsx` is not in the diff, and the dependency runs the other way — `PlayerDay` imports from it), and was checked anyway: the pitcher stream draws 3 outings as 3 bars, and under `sim=1`, which puts three men on the mound, 3 live entries and 1 in Recent with no outing in both.

**`sim=1` does not reach this tab**, which is worth recording because it is the obvious way to try to reproduce this: the overlay applies to `reports` from `/api/report`, and the player page fetches its own day off `/api/players/:id/day`. Both halves above were reproduced on genuinely live pitchers instead.

**Bundle: 466.09 → 466.16 KB of JS** (138.60 → 138.63 gzipped), CSS unchanged at 106.85 (19.09).

#### The day leads, and the scheduled game is the third state of it

**This reverses the block order the section above sets out.** It read *Season →
Today → Last 5 games*, on the argument that the three questions under a roster
decision are *how good is he*, *what is he doing* and *how has he been going*.
Two of those three still hold; the order was wrong about which one a player page
is actually opened with. The tab's own next paragraph has always said so — *it is
the default tab as well as the first … on a game day the question a player page
is opened with is what he is doing* — and the block answering it was second.

**So the day block leads**, and the order is now:

1. **Today**, or the **next game** when the day holds none.
2. **Projected Starts** — a rotation starter only, and see its own section
   below, which is also where the third state of the block above it went.
3. **News** (below) — the latest item, whole.
4. **Season**, over to the Stats tab.
5. **Last 5 games**, over to the Game Log.

**The whole block moves, rather than the scheduled-game half of it.** What was
asked for was that the *scheduled game* lead, and there are two ways to read
that: hoist the block, or split `NextGameBlock` out so that only it sits at the
top. The split is worse, and the test is what the page opens on in each of the
three states it can be in:

- **A game in progress.** `PlayerDay` draws the live entry — the man is at the
  plate, or on the mound — which is the loudest thing this page can say and
  belongs at the top of it by the same argument.
- **A game today, played or scheduled.** The card, or the `UpcomingRow` with
  first pitch and the opposing starter on it.
- **No game at all.** `NextGameBlock`, which is the scheduled game the request
  was about.

Split, the leading block would be **present on a quiet morning and absent on a
game day**, so the page would open on a different thing depending on the fixture
list — and the two halves of one question ("what is he doing / when next") would
sit in two places on one page. Hoisted, the leading block is the same block in
all three states and is **never empty**, which is the property this had to have.

**The heading names what the block holds, which is what makes the third state
read.** It is `Today` where there are games and **`Next game`** where there
aren't — and the label therefore comes *off* the line inside `NextGameBlock`,
which used to print it in `.ovw-next-label`. Leading a page with a heading saying
`Today` over a line saying `Next game` would be the same two words an inch apart.

**`Next start` was the third wording and has gone with the sentence it headed.**
A rotation starter's "when, then" is the Projected Starts block's now (below), so
for him the day block says `Today` / `No game for X today.` and stops, and
`NextGameBlock` is not drawn at all — which is why `wantStart` feeds only the
*decision* to draw it and no longer feeds a heading or a sentence. What is left
under a batter's or a reliever's line is two: `Nothing scheduled in the next two
weeks.` for a club with nothing on, and `Couldn't read the schedule.` for a
failed read. (The measurements in the paragraph below were taken before that
change and Logan Webb's `Next start` line is the one figure in them that no
longer renders; everything else is unmoved, and the same page is re-measured in
the Projected Starts section.)

**Driven in a browser at 1200×900 and 390×844, in all three states, on the live
2026 season.** *Live* — Kevin Gausman: `Today [68px at 1200, 91 at 390] | News |
Season | Last 5 games`, the block carrying `STL 0–0 CHC · Bottom 3`. *A game
today* — Blake Snell: `Today [68px] | News | Season | Last 2 games`. *No game* —
Jeff Hoffman: **`Next game [61px]`** leading, `No game for Jeff Hoffman today.`
over `Aug 15 · 7:10 PM · vs PHI · vs LHP Jesús Luzardo`, with the label printed
**once**. And the starter's wording, with the day response stubbed to no games so
`isRotationStarter` still reads his real season line — Logan Webb: **`Next
start`**, `Aug 15 · 4:05 PM · vs COL · vs RHP Michael Lorenzen`. The page body
and the overlay each overflow by **0** in every one of those, at both widths.

#### The News section, and why it sits second

**It is his latest report or transaction — one of them, whole — over to the News
tab** (`NewsPreview` in this file, `NewsList` in `PlayerNews.tsx`).

**Second, between the day and the season line**, which is the order the tab is
already sorted by rather than an exception to it. The day says what he is doing;
the news says what has *happened* to him — an IL placement, a call-up, a report
that he is losing the closer's job — and both of those are this week, where the
season line and the game log under them are the record. A manager who has just
been told a man is hurt does not want to read a season line first.

**`NewsList` with `shown={1}`, not a second list.** That is the rule
`GameLogTable` sets for the Game Log and its own five-row preview, and it is
worth restating because it is the whole reason there is one component: the row
shapes, the two sources' different voices and the press that opens a report
have one definition. The only two things this block decides are how many rows and
whether the standfirst is drawn.

**One row with its standfirst, where it was three rows without.** Three headlines
is a list of things that have happened and answers none of them: a manager who
reads `Lands on IL with forearm strain` still has to press through to learn how
long for. The latest item is the one that changes a decision, and with one row on
the block there is room to draw the whole of what the item actually carries — the
date, the source's own word for the kind of thing it is, the headline, and
RotoWire's note under it. `summaries` was off here for a stated reason — *three
two-line rows would be the whole of the block above the season line it
introduces* — and that reason goes with the two rows it was about.

**And the block gets shorter rather than longer**, which is the half worth
measuring: two rows are worth more than one standfirst. Measured at 1200 on the
live 2026 season, `.ovw-news` goes **202.53 → 122.84px** on a RotoWire-led player
(Webb, Sánchez, Skubal), **→ 104.84** where the note is one line shorter (Hader,
Trout, Ohtani) and **→ 82.84** on a transaction (Amador). At 390: **202.53 →
140.84 / 122.84**, and **259.06 → 101.69** on the transaction.

**A transaction has no standfirst and leaves no gap.** MLB publishes one sentence
and no summary (`types.ts::NewsItem`), so a player whose latest item is a
transaction gets the date, the kind and the headline and stops — `NewsRow` guards
on the field and the row is a `gap`-spaced flex column, so the child is *absent*
rather than empty. Measured on Amador, whose latest is `Recalled`: the row's inner
box ends **10px** below the headline, which is exactly `.news-static`'s own
bottom padding, against **32px at 1200 and 50 at 390** on a row that does carry
one. It was also `.news-static` rather than `.news-link`, MLB publishing no URL
— a distinction that has since gone with the link, `.news-static` now being the
only shape there is (see *No row is a press* below). The measurement is
unchanged either way: that padding is what the rule always carried.

**Driven in a browser at 1200×900 and 390×844 against the live 2026 season**, on
a player of each source: **Blake Snell / Logan Webb / Mike Trout** draw one
`.news-rotowire` row — `Aug 9 · Report · Tosses eight innings in no-decision`
over `Webb did not factor into the decision Sunday against the Tigers, …`, and
**Adael Amador** draws one `.news-mlb` row — `Aug 12 · Recalled · Colorado
Rockies recalled 2B Adael Amador from Albuquerque Isotopes.` — with **0**
`.news-summary` elements. Both are `.news-static` and neither is a press; before
the link was dropped the first of them was an `<a>` opening a new tab. `News →` is drawn on both, the block caps at `--card-column`
(800 / 358), and the page and the overlay each overflow by **0**.

**There is no further body text to reach for, and this is where that was
checked.** `NewsItem` carries `date`, `kind`, `headline` and `summary` and
nothing else (it carried a `url` until the link went, above), and `summary` is
RotoWire's note itself — so "the whole item" is
the whole item. The one thing either upstream has beyond it is RotoWire's own
**analysis** block, which is **paywalled** and deliberately not scraped
(`rotowire.ts`, *What is deliberately not taken*: 1 of 7 items on a checked player
carried it and the other six read "Subscribe now to instantly reveal our take on
this news"). Nothing was added to the scrape for this change, so the HTML shape
`rotowire.ts` depends on is exactly the shape it depended on before.

**One read serves both**, hung on `PlayerDetails` and gated on `tab === 'news' ||
tab === 'overview'` exactly as the game log's is, so the preview is literally the
top of the list the tab draws and the two can never show different items.

**The block is capped at `--card-column` as a whole** (`.ovw-news`), where the
Season and Last-5 blocks let their tables take the window: those are stat tables
and are *scanned*, this is prose and is *read*. Capping the section rather than
only its list is what puts the `News →` door over the right edge of the rows it
opens rather than out at the far side of a widened tab.

**The empty case is a line, not a box.** `No recent news for Chad Patrick.` and
the link beside it — a preview of nothing has no business spending an
`.empty-state` on itself when the tab will say the whole of it, and the link is
what takes a reader there. The door is drawn whether or not there is anything
behind it, for that reason: the reader who wants to be sure nothing was missed is
exactly the reader with an empty block in front of them.

#### A day with no game names the next one

**"No game today" is true and useless on its own**, and it is what a day whose report holds nothing used to be reduced to — a single line where the reader's actual question is *when, then*, which no other view in the app can answer, every one of them being about today or a range that has already been picked. So the block names the next one (`NextGameBlock`, off `/api/players/:id/next-game`).

**Which "next game" that is turns on whether he works out of the rotation**, because the two are genuinely different facts. A batter or a reliever could be in any of his club's games, so his club's next game is his; a **starting pitcher is in one in five**, and his club's next game is somebody else's start — the very thing the feed's Upcoming section already refuses to guess at (see `isUpcomingFor`, where an announced probable is the only thing that puts a starter on the page). The test is **`lib.ts::isRotationStarter`** on the day report, which carries `pitcherSeasonStats`; it is the app's one definition of a starter and is read here rather than restated on the server, which is why the route takes a `start` flag rather than working it out again off a season line.

**ESPN's SP/RP eligibility is deliberately not that test**, although it is a fantasy position and this is a fantasy app. It is a **cover rather than a partition** — 143 of 749 pitchers on a checked board are eligible at both — so it says where a league will let you start a man and cannot say whether he takes the ball every fifth day. The two answer different questions and this is the one `starter`-shaped test the app already has.

**A starter with no announced start is told so rather than shown one**, which is the whole reason the server answers with `start` beside the game rather than a bare `NextGame | null`: `Next start not yet scheduled.` is a fact about how far ahead clubs name their rotations, where showing him his club's next game would be a claim about a start that isn't his. Checked against the live 2026 season on 08-13: Logan Webb reads `Next start · Aug 15 · 4:05 PM · vs COL · vs RHP Michael Lorenzen` where his club's next game is Aug 14; Chris Sale and Shohei Ohtani, neither named for a turn inside the window, read `Next start not yet scheduled.`; Dylan Lee (a reliever) reads `Next game · Aug 14 · 7:15 PM · vs AZ · vs RHP Brandon Pfaadt`; and Salvador Perez (a batter) reads `Next game · Aug 14 · 9:38 PM · @ LAA` with no starter, LAA having named nobody.

**The read is in this branch and nowhere else**, so a player who is playing today costs nothing at all: the day is drawn and the block is never mounted. `report.games.length === 0` is the test rather than a second copy of `PlayerDay`'s own emptiness rule, and the two agree by construction — sections and upcoming rows are both built off `games`, so an empty `games` is exactly the case `PlayerDay` would have drawn its "No game" line for.

**It is one wrapping line rather than a grid** (`.ovw-next-line`): the parts are a label, a when, a matchup and an opposing starter, and on a phone they read as a sentence broken over two lines rather than as a table of four things. Measured at 390: it wraps once and the page overflows by 0.

**It is the default tab as well as the first**, which is the same argument as the ordering: the tabs beside it are readings of his *season*, and on a game day the question a player page is opened with is what he is doing. It costs one request on open — `api.playerDay`, lazy in the same `dayReq` shape the Game Log, Arsenal and Charts tabs use, which for the default tab means it loads with the page — and that request is the cheap half of the two the page already made, being one player over one date against a percentile scrape (see **Date handling and server routing** for why it adds no cache of its own and why the date is the server's rather than the client's).

**The strip is seven tabs now, and eight on a pitcher** — five and six when Overview joined it, six and seven when Splits did, and seven and eight since **News** (below). It has needed nothing structural on any of the three occasions: `.details-tabs` already scrolls sideways and already scrolls the active tab into view with a 24px peek. Re-measured after News at **1200×900 and 390×844, on a batter and a pitcher, clicking every tab in turn**: all 7 and all 8 land **fully inside the strip** when selected, the tab's own column is `--card-column` less the overlay's gutters (358px), and the page body and the overlay each overflow by **0** at both widths.

**The day takes `--card-column` rather than the 860px the tabs beside it use**, because what is in it is exactly what the feed holds — an at-bat card, a clip, an outing's innings — and those were sized against that number in the first place. A day read here and the same day read on the stream is then the same reading at the same width (measured: 800px at 1440, 358 at 390). The cap sits on `.details-overview .player-day` rather than on the tab, which spans the tab so its two tables can (see **the player page's Overview tab** above), and the `container-type` sits on the same box for the reason `.details-arsenal` carries one: the cards inside size themselves off their container, and read off a full-width tab they would answer a container query the card itself never satisfies.

#### Projected Starts, and what a rotation slot is

**A starting pitcher's next turn is the one fact a fantasy manager plans around
and the one the app could least often say.** The block above answered it with
`/api/players/:id/next-game?start=1` — his next *announced* start — and clubs
name a rotation three or four days out, so for most of the month the honest
answer was `Not yet scheduled.`: true, useless, and a thing anybody with the
fixture list could have worked out. `ProjectedStartsBlock` works it out, three
turns ahead.

**It is second in the tab, directly under the day**, which is that tab's own
ordering argument rather than an exception to it: "when does he pitch next" is
the forward half of *what is he doing*, and the day block's own note says the
two halves of that question must not end up in two places on one page. And it is
drawn **only for a rotation starter** (`lib.ts::isRotationStarter`, the app's one
definition of who works out of the rotation), because a batter is in every game
his club plays and a reliever could be in any of them — neither has a slot to be
projected into. ESPN's `SP` eligibility is deliberately not the test, for the
reason `NextGameBlock` already states: it is a cover rather than a partition, so
it says where a league will let you start a man and not whether he takes the ball
every fifth day.

**So the day block defers to it, and `Not yet scheduled.` is gone.** For a
rotation starter with no game today the day says `Today` / `No game for
Cristopher Sánchez today.` and nothing else, and the block under it says when —
in three rows rather than a sentence. `NextGameBlock` therefore keeps only the
club's-next-game half, loses its `wantStart` prop and passes `false` at its one
call site; **the server route keeps its `?start=1`**, which is the rule
`/api/watchlist` follows for its own name — a tab open at the moment of a deploy
is still asking for it and still gets the right answer.

**What a projection is made of, in one paragraph.** Take the club's regular
season as an ordered run of games; find the positions in it of the games he has
started; the **median gap** between consecutive ones is his cadence — 5 for an
ordinary five-man rotation. Anchor on the latest start we know of and step
forward a cadence at a time over the games still to be played. **Counting in team
games rather than in days is the whole trick**: an off day, a rain-out and the
All-Star break each push a rotation back by exactly the days they take out of the
calendar and none of them takes a turn out of the run of games, so an index into
the club's own schedule models none of them and gets them all right. The median
rather than the mean because the outliers are the interesting half of a pitcher's
season — one IL stint of a month is a single gap of twenty team games — and gaps
past `MAX_TURN_GAP` (9) are dropped outright rather than trusted to it, so a man
with three starts either side of a stint is still placed off the two turns that
really were consecutive.

**A postponement is dropped from the run**, which is not tidiness: MLB
reschedules one under a **new `gamePk`**, so counting the original would put a
phantom game in the club's sequence and shift every slot after it by one.
Measured league-wide on the 2026 season, `detailedState` takes eight values —
Final, Scheduled, Postponed, In Progress, Completed Early, Game Over, Warmup,
Pre-Game — of which only Postponed (27 games) is one of these.

**Announced beats projected, always, and it re-phases what follows.** Every game
his club has named him for is in the answer as a fact; the anchor is then the
latest of those rather than his last actual start, which is his club saying where
he is in the rotation *now*. Where MLB has named **somebody else** for a slot the
projection wanted, that slot is not his — it is skipped and the rest re-phased
from wherever he lands, up to `MAX_SLIP` (3) consecutive skips, past which the
rotation has clearly been re-ordered and a shorter list beats a longer wrong one.

### A start today is the anchor, and for a while nothing could see it

**Reported as "the projected starts look wrong for pitchers starting today":
Logan Webb, taking the ball on 2026-08-15, was projected next for 08-18 — three
days later, which is not a rotation anybody pitches.**

**One test was doing two jobs.** The list of games his club had named him for
was read `g.date > today`, and it both seeded the announced **rows** and
supplied the **anchor** the projection steps forward from. The `> today` is
right for the rows and wrong for the anchor: a start today is the most recent
thing known about his slot and the one an anchor most wants. It is also
invisible everywhere else, which is why nothing caught it — `positions` comes
off his **game log**, which has no row for a game he has not finished pitching,
so on the afternoon of a start there was no evidence of it in either input.

**What that produced, traced on Webb's own schedule.** His last logged start was
08-09 and his cadence is 5 club games. Anchored on 08-09, five club games on is
08-15 — today's game, his own start — which the loop skips as past and steps one
game past; 08-16 is Tidwell's, counted as a slip; 08-17 is an off day; and it
settled on **08-18**. The reported symptom is the anchor being a turn behind and
then landing in the middle of the next man's.

**`>= today` on the anchor is the whole fix**, with the rows keeping `> today`
under a name of their own. It is idempotent where the two inputs agree: once the
game log catches up, today's index is in `positions` as well and the anchor is
the same either way.

**It fixes a refusal too, which was the same blindness one branch over.** A
pitcher whose last *logged* start is more than `MAX_TURNS_MISSED` turns back is
refused as `out-of-rotation` — correctly, when nobody has named him for
anything. A man his club has named for **today** is by that fact in the
rotation, and he was being refused: Braydon Fisher goes from `out-of-rotation`
to a five-row projection on his cadence of 7.

**Measured against an independent recompute of both rules, over every announced
starter in the league on 2026-08-15** — 29 pitchers, each one's club schedule and
game log fetched raw and both variants run against them:

- the route matches the recompute on **29 of 29**;
- **24 of the 29 changed**, and the old answers were wrong by two to four days
  rather than marginally: Michael Lorenzen, Sonny Gray, Jesús Luzardo, Ryan
  Gusto and eight more were projected for **08-17, two days after a start they
  were making that afternoon**;
- the five that did not change are the five that could not: four were already
  anchored correctly by a *future* announcement beside today's, and Brad Lord is
  `too-few-starts` either way.

**And nothing moves for a pitcher who is not starting today**, which is the
regression that mattered and is provable as well as measured: with no game today
naming him the two lists are the same list, so the anchor is the same index.
Checked on a random 25 pitchers with eight or more starts and no start that day —
**0 changed**, and the route matched the recompute on 24 of them (the 25th was
the script feeding Kris Bubic his leaderboard *stint* club instead of his
current one; against LAD the two agree on `new-club`, which is the answer this
file already records for him).

**What it refuses to guess**, which is four different facts about the pitcher and
so four different sentences (`ProjectionRefusal`). `not-a-starter` — he has
started nothing. `too-few-starts` — under three, too thin a median to read a
cadence off. **`new-club`** — he has a full season of starts and every one of them
is the club that has since traded him, so he holds no slot in this one yet;
checked on the live season, Kris Bubic's nine starts are Kansas City's and his
club is now the Dodgers, and reading that as `not-a-starter` would have printed
"he hasn't started a game this season" over a man with twenty-odd turns behind
him. And `out-of-rotation` — his last start was more than two turns ago, which is
a man something has happened to rather than a man with a slot; measured against
the announcements, the one pitcher on the live board in that state is also the one
whose projection missed. **Whatever is announced still comes back in every one of
those cases**, because an announcement is a fact whatever we can or cannot infer
around it — and where a refusal sits under a list rather than instead of one, the
sentence is drawn under the rows so a reader is not left wondering where the other
four went.

**A rehabbing starter's club is his org, not his rehab club.** `getRosterInfo`
answers with `currentTeam`, which for a man on a rehab assignment is a
minor-league club — checked: Edward Cabrera's is the Knoxville Smokies — so the
schedule read came back empty and the block said `Couldn't read his club's
schedule`, which is true of the id and a lie about him. `parentOrgOf` is the
fallback, fired only when the schedule is empty and cached for a day; with it he
reads his announced start and the projections off it, which is exactly the
pitcher this block is most worth drawing for.

**Announced and projected are never drawn alike**, which is the app's standing
rule that an estimate is marked as one — the percentile card's dotted bubble and
the Splits card's hatched fill are the same rule on two other surfaces. It used
to be **said three ways over** and is now said two: the row's text goes muted,
and the tag says the word. The row itself is **folded onto `.ovw-next-line`'s
rule**: the block above draws exactly this sentence for exactly this kind of
fact, so the two are one object. And the opposing starter is by **surname**,
where that single line prints the whole name — this is a list scanned down rather
than one sentence read across, which is the same reason the summary table's
opponent cell and the feed's Upcoming bar cut theirs.

**The third way was a left rail and it is gone, with the announced one beside
it.** The paragraph above used to read *"the row's rail goes from solid accent to
**dashed** `--faint`"*, over a stylesheet comment that admitted in as many words
to saying one thing three times. The rail was the weakest of the three: the tag
prints the word `Projected` at the end of the same line, and every cell on a
projected row is already `--muted` beside an announced row's `--text`.

**The pair went together rather than the dashed one alone**, and that is the only
way it reads. Each rail was `3px` of border over `10px` of padding, so a row's
text sat **13px** in from the block's own edge — measured, `29px` against the
block's `16` at both widths, on both kinds of row. Dropping it from the projected
rows only would have left the announced ones alone at 29 with everything under
them at 16: a list whose left edge steps in and out by which rows a club happens
to have named, on a block that is one announced row and two projected ones most
of the time. With neither, every row's text starts at **16** and the hairline
between rows is what groups the list — which is the `.news-item` device this
block already borrows for its rows.

**The two `.start-note` paragraphs under the list are gone too, and what each
said is in the heading row instead.** They were the block's small print — a
caveat naming his cadence, and, on a list that stopped short, the reason it did —
and three rows closing on two sentences of it was more apparatus than the rows it
qualified. Neither fact is lost; each is shortened to the phrase that carries it
and moved to the one line on the block that is always drawn and always read, with
the **whole sentence as that phrase's `title`**:

- **The cadence** → `a turn every 5 club games`, which is exactly what the
  sentence was for. It names *his own pace* rather than saying "estimated",
  because the number is what tells a reader how much to trust the muted rows —
  five club games is a settled rotation and six is a club running a six-man — and
  it is still drawn only when something on screen is actually a guess.
- **A refusal with rows above it** → `nothing past what his club has named`. That
  one is not decoration: a pitcher can have an announced start and no cadence to
  project past it (Skubal today, `too-few-starts`), and a block that showed the
  one row and stopped would leave a reader wondering where the other two went.
  The refusal *branch* only speaks when there is nothing at all.

The two can never both hold — a refusal is the projection declining to run, so
there is no cadence when there is a refusal and nothing projected when there is
no cadence — which is why it is one slot rather than two (`headNote`). It is
`.start-note` still, **folded onto `.ovw-none`'s rule** now that it wants no
margin of its own, and `.ovw-starts .ovw-head-row` overrides that row's
`space-between`: the phrase reads *beside* the heading, where the justification
written for the `News →` / `Stats →` doors would push it 800px away and make it
read as a link. It wraps under the heading on a phone where the two don't fit.

**Validated three ways, and the honest one is the middle number.**

- **The implementation against an independent recompute.** The whole method was
  written a second time in Python off the raw upstreams and run against the
  route for **all 183 pitchers with eight or more starts**: gamePks, the
  announced flags, the cadence and the refusal all agree, **183 of 183, 0
  mismatches**. (The one tie worth knowing about: `Math.round` is half-up where
  Python's `round` is half-even, which differ on a median of an even number of
  gaps — `[6, 7]` gives 7 here and 6 there.)
- **The method against the announcements, which is the production case.**
  Projecting from his last *actual* start with the announcements hidden, then
  revealing them: of the **48** of those 183 whose club has named their next
  start, the projection lands on it **exactly 41 times (85%) and within a day 43
  (90%)**. Split by the guard: **41 of 47 (87%) exact and 91% within a day** for
  the anchors it allows, and the single stale-anchor case — which it refuses —
  missed by three days, which is the guard earning its keep.
- **The method against the season, which is the pessimistic case.** Walking each
  pitcher's season and projecting his next five off only what was known then,
  with **no announcements at all** (they cannot be reconstructed historically),
  over 10,232 projections: **73.0% exact and 90.1% within a day** for the next
  start, then 57.0/78.7, 46.6/69.8, 39.1/62.4 and **33.5/56.1** for the fifth.
  Over the 40 busiest starters alone it is 81.0/95.4 down to 45.4/70.3. The tail
  decays because an IL stint is unpredictable by construction — 11.3% of fifth
  starts miss by more than eight days — which is why the block says five and not
  ten, and why the note names the cadence rather than claiming a date.

### Five turns again, not three

**The row count went to three for a spell and is five again, and the argument
did not change so much as get read the other way round.** The run above is
73.0% exact on the next start, 57.0 on the second and 46.6 on the third, then
**39.1 and 33.5** on the fourth and fifth (81.0 down to 45.4 over the 40
busiest starters). That decay is real, and this reader is shown all five rows
of it rather than the two most confident — which is worth saying plainly
rather than leaving to be inferred from a row count. A fourth or fifth row is
right roughly a third of the time, and it is drawn exactly like a reader would
need to be told that: muted, tagged `Projected`, under a note naming the
cadence it was built from rather than a date it is claiming. A third of the
time is still worth a row — it is the row most likely to be the one a
two-start week actually turns on, and five turns is closer to a month than the
fortnight three turns covers, which is the whole reason to reach for it.

**The three-row trim was made for a cost that, checked, is not being paid.**
`getRosterInfo` reads one 40-man roster per *distinct club* of the ids it is
handed, so a fourth or fifth row carrying a named opposing probable is a real
extra read rather than a free one, and trimming to avoid it was a reasonable
thing to have done. Checked against the live 2026 season, every pitcher's row
counted by position rather than sampled: **151 first rows, 142 apiece at
second through fifth** — once a pitcher's cadence clears the anchor he keeps a
row at every position through the fifth, this deep into the season, so the
only rows that stop short are the nine refusals that draw one announced row
and nothing else. The opposing probable is on **39 of the 151 first rows
(25.8%) and on 0 of the 568 rows behind it.** MLB names one about three days
out; a fourth or fifth turn on an ordinary five-day cadence is three to four
weeks off, which is nowhere near where any club has named anybody yet.
`WANT` still gates the announced slice, the projection loop and the final
`rows` in one place, so the number is one constant either way — it went back
to 5.

**Measured on the live 2026 season through the route, 3 → 5 rows**: Paul
Skenes (1 announced + 2 projected → 1 announced + 4 projected, `gamePk`s and
`cadence` unchanged for the rows that were already there), Cristopher Sánchez
(3 → 5, all projected). A refusal is untouched either way, there being nothing
past the first row for `WANT` to add to: Mick Abel (`out-of-rotation`) and
Spencer Arrighetti (`new-club`) both draw the same sentence and no rows at 3
and at 5.

**Driven in a browser at 1200×900 and 390×844 against the live 2026 season, in
six states, before → after `WANT`.**

| state | `.ovw-starts` at 1200 | at 390 |
| --- | --- | --- |
| Skenes (1 announced + projected) | **123 → 191** | **142 → 210** |
| Sánchez (all projected) | **123 → 191** | **123 → 191** |
| Abel (refused, `out-of-rotation`) | 39 → 39 | 69 → 69 |
| Arrighetti (refused, `new-club`) | 39 → 39 | 69 → 69 |
| Hader (a reliever) | no block → no block | no block → no block |

Rows go **3 → 5** on the first two and stay at 0 on the two refusals; on
Skenes the announced row still reads `Aug 16 · 1:35 PM · vs BOS · vs LHP
Sandoval · Announced` and the four projected rows below it are muted and
tagged `Projected`, closing on `Sep 9 · 7:40 PM · @ CWS`; on Sánchez all five
read `Projected`, running from `Aug 17` to `Sep 9`. The note reads `a turn
every 5 club games` on both in every state — the cadence itself doesn't move
with the row count — and the two refusals go on printing their own sentence
(`… has missed more than a turn, …`, `… hasn't started for his new club yet,
…`) with no rows under it. Josh Hader draws no block in any state, being a
reliever rather than a rotation starter. **Page and overlay overflow are 0 in
every one of those twenty states, at both widths**; the block still caps at
`--card-column` (800 / 358), the tab strip is still 8 tabs on a pitcher and 7
on a batter, and the block order is unchanged (`Today · Projected Starts ·
News · Season · Last 5 games`).

**`WANT` costs the bundle nothing**, being a server-side constant with no
client counterpart to rebuild — the row count is however many the route sends
back, and the client draws exactly that many. The bundle figures for this
round are the Game Log's, below, which is where the one client change worth
measuring actually is.

### A row opens the lineup he faces

**Every row named an opponent and said nothing about him**, which is half a
sentence: a manager reading `Aug 23 · vs STL` is deciding whether to start a
pitcher against that club, and the app already knows exactly how that club has
hit — nine cuts of it, over five spans, home and away, by the hand on the mound.
So a row is a press and it raises the **same dialog a pitcher's Upcoming row
raises in the feed**: `OpponentSection`, drawn by the same component with the
same span and venue controls and the same accented hand row.

**The same component rather than a thinner one, which is the whole of the
change.** A second drawing of an opposing lineup on the player page would be
three rows, ten columns, two segmented controls, a per-cut league rank and the
`lowerBetter`-free rule that 1st is always the best offence — every one of them
free to drift from the feed's copy the next time either was touched. This is the
rule `PlayerIdentity` and `PhotoStatus` already set for the blocks two tables
share, applied to the one table two *pages* share.

#### `OpponentSection` takes what it reads, and a start is not a game

**It took a whole `PlayerGame` and reads three fields off one** —
`opponentHitting`, `opponent` and `stand` — which was fine while every caller had
a game: the pitcher card, its Full breakdown and the feed's Upcoming row all draw
one that has been played or is about to be. **A `ProjectedStart` is not a game**
(`types.ts`): it is a `gamePk`, a date, an opponent id and an abbreviation,
placed on his club's remaining schedule, and four of its five rows are for games
nobody has been named for. Faking a `PlayerGame` around three fields to satisfy a
parameter is the kind of thing that reads as harmless and then has somebody
wondering, a year later, why a projection carries a `plateAppearances: []`.

So the component names the three (`hitting`, `opponent`, `hand`) and each caller
resolves its own. **The hand rule moved out with it**, deliberately: it was
`game.stand ?? throws ?? null` *inside* the table, and only a caller knows
whether it has a game to read a `stand` off — this one never does, so the row is
accented off `PlayerReport.throws` alone, which is precisely the pre-game case
that fallback was written for. The four call sites each pass one line
(`hand={game.stand ?? report.throws ?? null}`), so nothing about the three older
ones changed behaviour; measured after, the feed's Upcoming dialog reads
`SD · vs RHP` for a right-hander and the Full breakdown reads `MIL · vs LHP` for
Skubal, both off `stand` as before.

#### The season line is read on the press, and held

**Three ways of getting the opposing club's line were weighed and the client-side
read wins on all three counts.**

- **Widen the server** so a `ProjectedStart` carries its opponent's hitting. It
  is the tidiest to *call* and the worst to pay for: `projectedStarts.ts` is
  memory-only with no blob (that being this codebase's rule for a window onto
  games not yet played), so five `TeamHitting` boards — nine cuts each, ranked —
  would ride on every read of a route the block makes on **every pitcher's page**,
  for a reader who may open none of the five.
- **Fetch every row's club up front.** Same payload, moved; five requests on a
  page that mostly gets scrolled past.
- **Read it on the press** (`api.teamHitting(teamId, 'season')`), which is what
  it does. The route already exists and is what `OpponentTable` itself calls when
  the reader changes span; the module is cached six hours in memory and in the
  storage tier and pulled warm nightly by `warmer.ts`, so a press costs a `Map`
  lookup rather than an upstream. And the season cut is **the same object the
  report attaches** to a pitcher's games (`getReport` → `getTeamHitting`), so this
  is one number by another route rather than a second answer to one question.

**Held at block level rather than inside the row**, which is what makes a
three-game series free: two starts against one club cost one read, and closing a
dialog and reopening it costs none. The block therefore keeps a
`Record<teamId, OppRead>` and hands each row its own club's entry.

**The mark that dedupes it comes off on failure**, which is the one place this
departs from the rule stated at length in **Client — the League view**, *never
mark a request answered before it is answered*. What that rule guards against is
an effect whose cleanup discards the answer while the mark stands — `StrictMode`
mounting, tearing down and re-running. This is a **press handler**: there is no
cleanup and the answer always lands. Unmarking in the `catch` is what makes the
dialog's `Try again` a retry rather than a no-op, and it was driven: with
`/api/teams/` forced to reject, the dialog reads `Couldn't read the opponent's
line. Try again`, and pressing it with the stub lifted fills the table in
(`oppRows 0 → 3`).

#### A row with nothing behind it is not a press — one read later

**The feed's rule is `expandable = !!game.opponentHitting`, decided before
anything is drawn**, because the report already carries the line. Here it cannot
be: a projected start's club has not been read until somebody presses. So the row
is a press by default and goes **static** on exactly one answer — the server
returning **no board for that club**, which is what `getTeamHitting` gives for a
team its own board has no row for. A read that **threw** keeps its press, since a
retry is a different fact from an absence and the dialog offers one.

**Which forced one thing that reads as a subtlety and is not**: the dialog is
rendered on `open` alone rather than on `expandable && open`. The answer that
makes a row static arrives *while its own dialog is up*, so gating on both
unmounted the box in front of the reader the moment the read landed — measured
with a stubbed `null`: `dialogs 1 → 0` with nothing said, a press that flashed
and shut. Only a press can set `open` and a static row has none, so the two
states cannot contradict each other. With the fix the reader sees `No line for
STL.`, and the row behind is static when the box closes (`presses 5 → 4`,
`statics 0 → 1`, its title dropping the `open to see how that lineup has hit`
clause).

#### What the dialog says about a guess

**A projected row is a guess and its dialog must not read as a claim about a game
he has been named for.** On the row that is said twice already — the text is
muted and the tag reads `Projected` — and inside the box both of those are gone,
so the sentence is repeated where the reader is: *Projected from his rotation
slot — nobody has named this start yet, so this is the lineup he* **would**
*face.* An announced row carries none of it, his club having named him; measured,
that line is the whole of the difference between the two boxes (365.48 → 388.48px
at 1200, 409.48 → 447.48 at 390).

**The opposing starter is deliberately not named inside**, which is the feed's own
decision arriving here rather than a new one. A batter's Upcoming dialog names him
in full with a headshot through to his page, because the *card* in that box is
about the half of a platoon split he creates. A **pitcher's** dialog holds the
lineup instead, on the stated grounds that the man on the other side is his
counterpart rather than somebody he faces — and on a *projected* row there is
nobody to name at all, MLB reaching about three days out (measured on the live
season: the opposing probable is on **39 of 151 first rows and 0 of the 568
behind them**). A block that named him on row one and not on rows two to five
would be a fifth of a feature. The surname is on the closed row where it already
was, and his full name and hand are on the row's own `title`.

#### Measured

**Driven against the built client and the live 2026 season at 1200×900 and
390×844**, on Cristopher Sánchez (1 announced + 4 projected, cadence 5).

**The block does not move.** Before → after: `.ovw-starts` **191px at both
widths**, five rows at **32 / 32 / 32 / 32 / 31px**, byte-identical — the row's
`padding: 7px 0` having moved from the `<li>` to the line inside it, which is
where a press wants its own breathing room. Page-body and overlay overflow **0**
at both widths in every state.

**One fault was found by measuring rather than by reading, and it is the trap
this stylesheet already records from the other side.** `.start-line`'s button
reset was written `font: inherit`, which is a *shorthand* — so it reset the
`font-size: 13px` the shared `.ovw-next-line, .start-line` rule sets, and a
`<button>` then inherited the body's **16px** from the `<li>`. Measured: rows
**34px** against 32, block **201 / 220**, and the announced row **wrapping at
390** where it never had. `font-family: inherit` is the whole of the reset a
button actually needs here, everything else being declared; re-measured, 191 and
32 at both widths.

**The dialog.** `800 × 365.48` at 1200 and `358 × 409.48` at 390 on an announced
row (`388.48 / 447.48` projected), body overflow **0**, `z-index` **51** — the
overlay's 50 plus one, from `DialogLayerContext` with nothing written inline —
titled `Cristopher Sánchez — Aug 17 vs MIA`, holding the `Opponent` label, the
five span pills, the three venue pills and three rows (`Overall · vs RHP ·
vs LHP`) under a `MIA` corner header, with **`vs LHP` accented**, Sánchez being a
left-hander and the start having no `stand` to read.

**The press, four ways.** A mouse click opens it; **Enter** opens it and **Space**
opens it, with the focus ring measured at `2px solid rgb(56, 189, 248)`; the ✕
closes it; and **Escape unwinds one rung per press** — the dialog first with the
player page standing and focus back on the row's own button, the page second,
`[inert]` back to **0**.

**The hover is scoped.** With a mouse the line goes `rgba(0, 0, 0, 0)` →
`rgb(27, 41, 73)` (`--panel-2`, the app's borderless-row hover) with
`cursor: pointer`; under touch emulation (`(hover: hover)` **false**,
`(pointer: coarse)` **true**) the same pointer move leaves it at
`rgba(0, 0, 0, 0)` — and `matches(':hover')` reads **false** there, the emulator
not holding the state at all. **No caret** either way.

**Every other state was driven and is unchanged**: a refusal draws its own
sentence and **0 rows and 0 presses** (Abel `out-of-rotation` 39 / 69px,
Arrighetti `new-club` the same), and a reliever (Hader) and a batter (Perez) draw
**no block at all**. The three older `OpponentSection` call sites still work —
the feed's Upcoming dialog (`Nolan McLean — NYM vs SD`, `SD`, 3 rows, `vs RHP`,
five span pills) and a pitcher's Full breakdown (`Tarik Skubal — LAD vs MIL`,
`Line · Opponent · Arsenal`, `MIL`, 3 rows, `vs LHP`) — and the Roster, Feed and
Research views all render with no error banner and 0 overflow.

**Bundle: 522.29 → 524.14 KB of JS** (154.38 → 154.88 gzipped) and **126.34 →
126.64 KB of CSS** (22.44 → 22.48) — 1.9KB and 0.3KB raw, 0.5KB and 0.04KB over
the wire, for a press, a dialog, a lazy read with its cache and the paragraphs
above restated where the rules are.

#### The scheduled game's pitcher link opened nothing

**The report: press the pitcher in the Overview tab's scheduled-game popup and nothing happens.** Not a wrong page and not a dead-looking one — no change at all.

**A prop that was never threaded, and a default that swallowed it silently.** The popup is `UpcomingRow`'s, and its `.upcoming-sp` block draws the opposing starter with a headshot and a name, both links (see **Client — the Feed view**, *The headshot links to the opposing pitcher's own page*). `PlayerDay` takes `onOpenDetails` **optionally** and falls back to `() => {}`; `PlayerOverview` threads whatever it is given; and `PlayerDetails` rendered `<OverviewTab …>` without one. So the press reached a real button, ran a no-op, and left the page exactly as it was.

**The comment on that default said why it was safe and was out of date.** It read: *grouped items draw no identity row at all, so nothing here can actually reach it.* True when it was written and false since the Upcoming dialog started naming the starter — **`grouped` drops the row's *own* header and not that block**, which renders either way. A default that is justified by a claim about what renders is a default that goes wrong the moment something else starts rendering, and there is nothing on screen to say it has.

**Measured before, at 1200×900 and 390×844.** On Soderstrom's page, open the scheduled game and press the headshot: URL `?…player=batter-691016` **unchanged**, `<h1>` `Tyler Soderstrom` **unchanged**, dialogs still 1. The name link the same. Note this is *not* the inert fault of the section above it in **Client — popups**: `#root` is inert, correctly, and the link is inside the live dialog — the press lands, and the handler does nothing.

**So `PlayerDetails` takes an `onOpenDetails` and passes it down**, and App gives it the same `setDetailsKey` every other route into the page uses, so one man's page is reached the one way however it was arrived at.

**The dialog closes on its own, by construction rather than by a rule.** The per-player reset effect clears `day`, which unmounts the Overview's whole subtree, which unmounts the `UpcomingRow` holding the dialog's `open` state. That is the right split falling out of the tree: this dialog is *inside* the thing being navigated and its contents (one batter's platoon split against tonight's starter) mean nothing over the pitcher's page, where the **feed's** copy of the same row is *behind* the page and deliberately stays open under it (measured there: the page over the dialog at 50 against 46, Escape closing the page first and the dialog second).

**Two guards came with it, and both are guards rather than fixes** — the page could not change player at all until now, every route in opening it and every route out closing it, so nothing about it had ever had to answer for one.

- **The tab resets to Overview.** A no-op today, and measured as one: the only link that changes the player lives in the Overview tab's own dialog, so `tab` is already `overview` whenever it fires. What it defends against is the next link somewhere else — `arsenal` renders its button only for a pitcher, so carrying it onto a batter would leave a page with no tab selected and nothing under it, every block being gated on an `arsenal` the same effect has just cleared.
- **The scroll resets on `playerId` as well as `tab`.** Also a no-op today, and also measured: scrolled to 149 on a batter's Overview at 390, the pitcher's page opens at **0 with or without the dependency**, because clearing `day` collapses the box and the browser clamps. It is there so the property holds by construction rather than by an accident of what another effect happens to clear.

**Measured after, at 1200×900 and 390×844, by the headshot and by the name.** Batter page → 7 tabs, no Arsenal → open the scheduled game (`#root` inert, 4 focusables outside the page, all of them the dialog's) → press the SP: URL **`?…player=pitcher-808967`**, `<h1>` **`Yoshinobu Yamamoto`**, dialogs **1 → 0**, `#root` **released**, **8 tabs with Arsenal**, tab `Overview`, scroll 0, `insideInert: false`, **0 focusables outside the page**. His Arsenal tab then opens, and Escape closes the page leaving **no `inert` attribute**. Re-run against the shipping bundle on `:4000`.

**Nothing else moved, driven rather than reasoned about.** The feed's own Upcoming dialog still opens the pitcher *over* itself and unwinds `page → dialog` on two presses; feed → outing (46) → inning (47) → faced batter (48); the triple Upcoming dialog (46) → player page (50) → Game Log popup (51); and `?player=…&help=1` — each one press of Escape per box, top box never inert, 0 stops outside it.

**`PlayerDayModal` still passes no handler and stays optional for it alone.** It narrows `PlayerDay` to one `gamePk` off a Game Log row, which is a game that has been played, so `upcoming` is empty there by construction and the block cannot render — plumbing for an unreachable link, against a comment saying why there is none.

**Bundle: 466.02 → 466.09 KB of JS** (138.59 → 138.60 gzipped), CSS unchanged at 106.85 (19.09).

### The News tab, and the two sources behind it

**It is the eighth tab and it reads before Stats and the Game Log** — the strip
is `Overview · Percentile Rankings · Splits · News · Stats · Game Log ·
[Arsenal] · Charts` — which is the Overview's own block order one tier up and
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
colour is spent on state.

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
labelled runs of chips, the group All/None, the last-column guard and the reset —
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
**edge to edge** — measured 0px at 1200 and at 390, labelled and icon-only
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
is honoured per column, so ERA, WHIP and a batter's K open on their good end
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
cells left out for having no value on screen — is `components/columnRanks.tsx`
and is argued under **the research board**. What is this tab's own is where the
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

**Each row is ranked within its own span's board**, keyed by window, which is the
only comparison that means anything: a seven-day line against the season board
would rank every player last on every counting column. Checked against an
independent computation over the same blobs — Perez's 30-day `HR 5 → 92`, `OPS
.784 → 70`, `K% 18.2% → 71`, `xwOBA .335 → 76` (population 482), and Sale's
7-day `ERA 4.50 → 35`, `K 8 → 92`, `FIP 1.48 → 90`, `IP 6.0 → 83` (population
415) — all exact. And the badge's tooltip names the span it used: `Games pitched:
56th percentile of the 752 pitchers with a figure on the Season board.`

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

### The Splits tab: the two halves of the platoon, against each other

**The platoon card said what a player did against each hand and left the
comparison to the reader's own subtraction.** Three blocks of stat pills —
Overall, vs LHP, vs RHP — twenty-odd numbers, and the one thing anybody opens a
platoon split *for* was not among them: nobody comes here to learn a hitter's OPS
against lefties, they come to learn whether he is a **different hitter** against
them. So the tab (`components/PlatoonSplits.tsx`) draws each stat **once**, as a
bar that says which side he is stronger against and by how much, and the reader
sees "Perez mashes lefties" without doing any arithmetic at all.

**The bar's zero is the centre of the rail, and the fill grows toward the side he
is *better* against.** Length is the size of that edge measured against a
per-stat `full`; the two figures are printed either side of the track, the
stronger one in the accent and the weaker one muted, so the direction is stated
twice and the exact numbers are never hidden behind the picture. Each row's
tooltip spells the whole thing out in a sentence, gap and all (`On-base plus
slugging — .750 vs LHP, .587 vs RHP: .163 better vs LHP.`).

### The key is behind an ⓘ, and the caveat is not

**The sentence that says how to read a bar has been over the bars and under
them, and is now behind an icon on the card's title row.** It is a key to a chart
— *"Each bar runs from the centre toward the side he is **stronger** against — the
further it runs, the bigger the split. A full bar is one of the biggest splits in
the league for that stat. Each stat has its own scale, so a long OPS bar and a
long K% bar mean the same thing."* — and moving it from the top of the card to
the foot of it fixed the half that was wrong (a key read *before* the chart is a
paragraph of instructions for something the reader has not seen) while leaving the
half that was expensive. It is **four lines, 70px** at 390 wherever it sits, spent
on a tab whose whole content is eight bars, to say a thing a reader needs **once**.
The second time anybody opens this tab it is 70px of something they have read.

So it is a disclosure now: an ⓘ at the right of the title, opening a popover
holding the key. **Measured on the real card, before → after**: at 1200 the card
goes **427 → 389.2px** and at 390 **455.8 → 383.2px**, i.e. the key costs the tab
**37.8px on a desktop and 72.6px on a phone** and now costs it nothing. The same
saving on every card checked — Sale 393 → 355.2 and 421.8 → 349.2, the thin-sample
Nick Allen 456.4 → 418.6 and 502.5 → 430.

**Its second sentence used to be the statistic rather than the fact, and that
was the half a reader tripped on.** It read *"A full bar is a gap bigger than
nine players in ten have in that stat"*, which is `full`'s own definition — the
90th percentile of that stat's measured platoon gaps — handed over as a riddle. A
reader wants to know whether a long bar is a big split and whether two rows can
be read against each other; a quantile is the machinery that answers those, not
the answer. So it says the answer: **one of the biggest splits in the league for
that stat**, and **each stat has its own scale**, which is the comparability the
per-stat `full` exists to buy. Nothing under it moved — both tables of constants
are the same measured numbers — and the ⓘ stays, because the popover was never
what was complained about and the measured reason it exists (below) is unchanged
by making the sentence inside it plainer. The second paragraph is one line
shorter for having lost the chevron it used to name.

**Why a popover, and not the three things it could have been.** A bare `title`
attribute is **invisible on a phone**, and roughly half this app's traffic has no
hover to give — the rule the research board's `WatchStar` already follows by
drawing on every row rather than on hover — so the tooltip rides along on the
button for a pointer and is not the answer on its own. A **`Modal`** is the wrong
size, and the app has already written down why: the Columns dialog left the
board's control row for one stated reason, *volume*, holding an order row and 48
checkboxes; two sentences are the other end of that scale, and dimming the page,
pinning the body and portalling out to a dialog layer to deliver them is ceremony
the content cannot pay for. And an **inline reveal in the card body** is what the
key already was with a switch on it — it fails on distance, the control being at
the top of the card and the text appearing 300px below it and, on a phone, under
the fold. A disclosure has to reveal something beside itself.

**It is the app's own popover rather than a box that resembles one.**
`.settings-popover` on the panel — literally the class the header's settings gear
and fantasy button open — with only two things of its own: the anchor (it opens
leftward *into* the card, from the card's own right edge) and prose rules, that
box having only ever held controls. The button is
`.app-dialog-close`, the app's 30px icon button, so there is a real touch target
rather than a bare glyph, and it fills with the accent while its panel is showing
the way every other disclosure in the app does. **Measured: panel 320×138.3 at
both widths, landing at x=597 at 1200 and x=41 at 390** — inside the viewport on a
phone, which is what the width cap is for. It needs an explicit `width` where the
gear's menu does not, and the reason is worth keeping: the containing block was
the **30px button**, so a shrink-to-fit resolved against 30px and the box fell
back to the shared `min-width: 180px`, turning two sentences into a 225px-tall
column. (The containing block is `.spl-card-head` now — see below — which is a
*wide* box, so a shrink-to-fit there would be wrong in the other direction. The
explicit width answers both, and is part of why the panel's rect is identical
either side of that move.)

### The ⓘ sits beside the title, and its panel did not move at all

**It was at the far right of the card, which is not where a key goes.** The
button was `position: absolute; right: 0` on the card head, and what that bought
was worth having — a title centred in the card with the control out of flow — at
a price nobody had priced: **228px between the ⓘ and the words it belongs to at
1200, and 77px at 390** (658.66 → 887 and 253.66 → 331, measured). At that
distance the icon reads as a control over the
*card* rather than as a key to the heading, and a reader looking for the key
looks at the heading. So it is laid out immediately after the title instead.

**The title still sits exactly where it did**, which is the half of the old rule
worth keeping rather than trading: `.pct-card-head` is shared with the percentile
card, whose title is centred by `text-align`, so one tab's heading sitting 19px
off where every other tab's sits is a difference nothing on screen explains. The
button is in flow after the title and **gives its own width back** — 4px on the
left, 4 + its own 30 returned on the right, which is exactly 0 of the flex line's
main size — so the line centres as though the button were not there and the
button hangs to the right of it. Measured before → after, at 1200 and 390: the
title's box is **byte-identical** (541.34 → 658.66, 117.31 wide at 1200; 136.34 →
253.66 at 390), the head and the card are unchanged, and the only thing that
moved is the button, 887 → **662.66** at 1200 and 331 → **257.66** at 390 — which
is the title's right edge plus 4 in each case.

**And the panel's own rect is unchanged, which is the neat part.** The obvious
consequence of moving a button is that its popover moves with it, and at 390 that
is fatal: anchored to a button that now spans 257.66 → 287.66, a 320px panel runs
**257.7 → 577.7** opening rightward, or **287.7 → −32.3** opening leftward, i.e.
off the screen either way. What the change actually does is **re-parent the
containing block**
rather than flip the side — `.spl-key` becomes `position: static`, so `right: 0`
resolves against `.spl-card-head` instead of against the button, and 0 is now the
card's own right edge, which is exactly where the button used to be. Measured
before → after with the panel open: **597 → 917 at 1200 and 41 → 361 at 390,
320 × 138.34 in both**, identical to the pixel. `left: 0` was the other option and
is worse at the wide end — the panel would run 283 → 603 and stop **60px short of
its own trigger**, which reads as a popover belonging to something else.

**The stacking rule this key has always had to obey is kept, and `static` is a
second guarantee of it.** The first version of the button used `transform:
translateY(-50%)` to centre itself, which makes a stacking context and trapped the
popover's `z-index: 40` inside a box that paints *before* the table — so the key
opened underneath the very bars it explains. A static, untransformed box cannot
make one at all. Checked rather than assumed: with the panel open,
`elementFromPoint` at a point where the panel overlaps a `.spl-fill` returns the
panel, at 1200 and at 390.

**The rule is written two classes deep** (`.spl-card-head .spl-key`) because
`InfoKey` is shared now and the `.info-key*` family is the *component's*, where
the anchor is this caller's: a `position: relative` arriving on `.info-key` later
would otherwise silently put the panel back on the button, which is the state the
390 measurement above says is off the screen.

**Real keyboard access and a real name, driven rather than assumed.** It is a
`<button>` with `aria-label`, `aria-expanded` and `aria-controls`; driven in a
browser at **1200×900 and 390×844** after the move, seven presses in sequence:
a click opens it (`aria-expanded` true, the panel in the viewport, painting over
the bars) and a second click closes it; **Enter opens it**; **Escape closes the
key and leaves the player page standing** (still on the Splits tab, focus back on
the button); **Space opens it**; an outside press closes it and is spent on the
dismissal, the tab behind it unchanged; and a final Escape — with nothing open —
closes the player page. Page and overlay overflow are 0 throughout.

**The sample-size caveat stays in the body, and the two are not the same kind of
thing.** The key is *instructions* — true of every player, true of every chart on
the tab, read once. The amber line is a *caveat about this player's numbers*: it
fires only when a side is thin, it is `--hr` amber precisely to be caught sight
of, and it changes how the bars **on screen** should be read. Hiding a conditional
warning behind an icon that gives no hint it is holding one is how a warning goes
unread — and a reader who has not pressed the ⓘ has no way to learn there was
anything to press it for. So the general note is behind the button and the
particular one is on the card, which is the order the two were already in when
both were captions. Checked on Nick Allen (31 PA vs LHP) at 390: the amber line
sits under the bars and the key opens over them, both reachable at once.

**`.spl-intro` is gone from the stylesheet**, and with it the two arguments its
rule used to carry — both of which were right and neither of which applies any
more. Folding the key into `.spl-note`'s rule stopped one drifting a pixel from
the other, and there is now one of them; left-aligning it matched it to the caveat
under it, and it is not under it.

**Direction carries the polarity and nothing else does**, which is the decision
the whole shape was chosen for. A row where less is better — a pitcher's FIP and
WHIP, a batter's K% — is **not** drawn with a reversed scale or a different
colour: `lowerBetter` flips which side counts as stronger and flips nothing else,
so a bar pointing left means the same sentence on every row of the card. That is
what a centre anchor buys, and it is why the obvious alternative was rejected:
`RateBar` (`Arsenal.tsx`) is anchored at the left and scaled to a share, and
expressing this as L/(L+R) would **invert its meaning** on exactly those rows and
flatten every other one — .900 against .700 is a 56/44 bar, which is not what a
.200 OPS gap looks like. Five of the pitcher card's seven rows are `lowerBetter`,
so that is the ordinary case rather than the corner. The percentile card's
**dumbbell** was the other component considered and is a different object again:
its rail is a 0–100 league percentile and its two marks are two readings of one
population (an actual and its expected), where these are two populations on a
rail whose units are the stat's own. So this is a third bar, deliberately, and
the CSS says so by borrowing `.pct-card` for the box and the head and adding only
the grid, the rail and the two thin-sample states under `.spl-*`.

**`full` is measured off the league rather than chosen**, which is what makes a
full bar mean something rather than look dramatic. Every 2026 batter with at
least 100 PA against each hand (**167** of them) and every pitcher who faced 100
batters of each hand (**202**) had his gap in each stat computed, and `full` is
the **90th percentile** of that distribution, rounded — so a bar that reaches the
end of the rail is a top-decile split in that stat, and two rows of different
stats are readable against each other. Batters: OPS .283 → **.300**, AVG .087 →
.090, OBP .091 → .090, SLG .204 → .200, ISO **.140**, HR% 3.34 → 3.5, K% 8.51 →
8.5, BB% 6.61 → 6.5. Pitchers, over their own population: OPS .255 → **.260**,
AVG **.080**, FIP 2.38 → 2.40, WHIP 0.61 → **0.60**, K% 8.81 → 9, BB% 6.69 → 6.5,
HR% 3.10 → 3. The two kinds deliberately **do not share a scale** where their
distributions differ (a pitcher's OPS-against spreads a little tighter than a
hitter's OPS): a platoon gap is measured against the population it was drawn
from. The medians are worth stating too, since they are what an ordinary row
looks like — .101 of OPS and 3.3 points of K% for a batter — so the typical split
fills about a third of the rail and the end of it is a real place. A gap past
`full` clamps, which about one qualified player in
ten does on any given row by construction; Cristopher Sánchez is among the
league's most extreme cases and clamps four of his seven (his `.317` OPS against
lefties and `.762` against righties is a .445 gap). **A clamped bar is drawn no
differently from one at full scale** and says it is clamped in the row's own
tooltip alone — see *The clamp is a sentence, not a mark* below, which is where
the two marks that used to draw it, and why neither survived, are set out.

**The fill can never exceed its half of the rail, and for a while it could — by
1.43px, at the one place a reader would look.** This paragraph used to assert the
clamp above and stop there, and the clamp was never the thing that was broken:
`Math.min(1, gap / full)` was right, the width came out at exactly 50% of the
track, and the DOM agreed the fill's *box* sat inside the rail's *box* — measured
on Willson Contreras's clamped K% row, `fill.left − track.left` was **0.00px** at
1200 and at 390 alike. **The rail is painted as a pill**, though, and the fill was
inset 3px top and bottom and **nothing at all at the ends**, so a bar drawn to the
box ran past the ink: a rail of height 16 caps at radius 8, whose edge has already
receded **1.76px** by the fill's top row of pixels, and a clamped bar — which is the
bar you look at, being the one that reaches the end, and whose outer end was
squared off at the time — put its corner out there. Walking the fill's painted boundary against the rail's
pill in closed form, every clamped row in the league overhung by **+1.430px**
while every unclamped row cleared it by 3px. That is the whole bug, and it is the
third of the three shapes this kind of fault comes in: not a missing clamp, not a
clamp a `NaN` escaped, but **the rail's own box and the fill's box disagreeing**.

So the fill is inset on all four sides: `--spl-inset` (3px) top and bottom, which
makes it the rail's own pill inset by 3 — a radius-5 cap inside a radius-8 one,
the two concentric. The squared-off end was untouched by that fix and read
better for it, a squared cap nested inside a rounded one being unmistakable beside
the rounded cap of a bar that merely came close. It did not survive being looked
at twice more; see below. (**"All four sides" is now three**: the two long ones
and the *outer* end. The horizontal inset was only ever spent at the outer end —
it is subtracted from the fill's length while the inner edge is pinned to the
rail's centre — and the inner **cap** went flat in the fourth round, so there is
nothing there to nest inside anything. The sentence is left as it was written
because the nesting argument it makes is the outer end's and is still exactly
right.)

### The clamp is a sentence, not a mark

**Three things have been tried at the outer end of a clamped bar and the third
is nothing.** (Marks, not rounds — the round count in the summary above is over
the whole geometry, and these three fall in its third and fifth.) A gap past
`full` is clamped by `railFraction`, the
row's tooltip says *"Bigger than the bar can show, so it stops at the end."*, and
the rail itself draws a clamped bar exactly as it draws one at full scale. Two
earlier rounds put a mark there and both were complained about; what follows is
the record of them, because the reasons they failed are the reasons nothing
replaces them.

**The first squared the fill's outer end off.** That reads as a bar with its
corner cut off, and it cost real geometry: a square corner sits at the fill's
extreme height, 5px off the rail's centre line, where the rail's own cap has
already receded `8 − √(8² − 5²)` = **1.76px** — so at the sides' 3px inset it had
1.24px of rail beside it against its own midline's 3px, and the ends had to take
a larger token of their own (`--spl-inset-x`, 5px). Its quietest fault was that
**nothing on the card said what it meant**: a reader met a differently-shaped bar
end with no key to it.

**The second made every cap round again and knocked a chevron out of the fill
just inside its tip**, with the key behind the ⓘ to explain it — which is what
made a mark defensible at all, and is also what retires `--spl-inset-x`. A
radius-5 cap 3px inside a radius-8 one **shares its centre**, so the track shows
exactly 3px of itself at *every* angle rather than 5px at the midline and 3.24 at
the corner, and every bar is **2px longer** than it was. **That is still the
geometry today**, and these are its measurements: a clamped bar's tightest row
went **4.196px → 3.000px** of clearance and its midline 5px → 3.000px, with
`fillWidth − half` going **−5.000px → −3.000px**. The
tightest clearance *falls* by 1.196px and that is the right trade, because a
constant margin reads as a margin where a varying one reads as a corner running
out of room.

**The third is this one, and it removes the mark rather than redrawing it.**
The chevron was complained about too, and by then it had cost a pseudo-element
pair, four direction rules, 14px of solid accent laid under it so it stayed
legible on a hatched fill, and a stub of bar in the key's popover to explain it —
all to say a thing the row was already saying in words.

**What decides it is the two figures printed either side of the rail.** The
picture gives up precision at the end of its scale; the exact numbers it gave up
are ten pixels away on the same row, in the accent and the muted grey. So the
mark was flagging a loss the reader could already read off, in a glyph they had
to open a popover to decode — which is the same fault the squared end was
retired for, arrived at from the other direction. And the sentence a full bar makes is true of
a clamped one as well: *one of the biggest splits in the league in that stat*. A
1.0× bar and a 3.2× one really do both say that, so the two reading alike is not
a claim anybody has to be warned about.

**The hatched-and-clamped row is where it reads best**, and it is not a rare
shape — a row can be thin *and* clamped, and on Josh Hader's card **six of seven
rows are both**. The chevron needed a solid ground to be seen against the hatch,
so it laid 14px of solid accent over the end of a fill whose whole point is that
it is *not* solid: the sample-size texture broke, on nearly every bar, to make
room for a mark about something else entirely. The hatch now runs uninterrupted
to a clean round cap and says one thing.

**Nothing about the length or the invariant moved**, which is the property this
had to preserve. `railFraction` is untouched and still total; the inline width is
still `calc(frac × (50% − var(--spl-inset)))`; `max-width` still says it again at
the last moment; the inner end is still flat and the outer still round. What goes
is `.spl-fill--over` and its six rules, `.spl-key-chevron` and its own, and the
`over` class on the fill — `over` itself stays in `SplitRow`, read off `frac` as
before so the sentence and the length cannot disagree, and feeding the tooltip
alone. **Length stays monotonic in the gap** and now does so with nothing to
protect it: the shortest clamped bar is never shorter than the longest unclamped
one, checked on every drawn card (tightest case Sánchez at 1200, 214 against
207.66, and at 390 83.5 against 81.06).

**Measured on the rendered pixels, before → after**, by walking each fill's ink
one device row at a time against the rail's own painted pill (computed in closed
form from the track box, which is a stadium of radius h/2), at ×4 device
resolution, over ten real 2026 players at 1200×900 and 390×844. **Knocked-out
pixels strictly inside a clamped fill's own hull: 9.5 CSS px² → 0.0**, on every
clamped solid row of every card; `::before` and `::after` both compute `none` on
every drawn fill where they were `""` on the clamped ones. Everything else is
byte-identical: worst outer clearance **2.881px**, worst `fillWidth − half`
**−3.000px**, inner recess **0.000 at 1200** (0.500 at 390, where the rail's
centre falls on a half-pixel), rows **34px**, rails **434 / 173**, cards **680 /
358**, and page and overlay overflow **0 / 0** at both widths. The one figure
that is not identical is Josh Hader's clearance, **2.881 → 2.952px**, and it is
the hatch rather than the cap — on a striped fill the outermost accent pixel is
decided by the stripe phase, which is the same caveat the round below records.

**The tooltip's wording went with the mark.** It read *"Bigger than the rail's
full scale, so the bar stops at the end."* and now reads *"Bigger than the bar
can show, so it stops at the end."* — plainer for the same reason the key is:
with the two figures beside the bar, what a reader needs is that the picture
stopped, not the name of the thing it stopped against. Checked on Sánchez,
Turang and Hader at both widths; on Hader it composes with the thin-sample
clause, reading *"… so it stops at the end. Sample too thin to lean on."*

**Those two paragraphs are the first two of five rounds on this one geometry.**
The third and fifth are above — *The clamp is a sentence, not a mark*, which
holds both: the round that retired `--spl-inset-x` along with the square cap it
was written for and moved back to a single 3px inset, and the round that took the
chevron off the bar altogether and left the clamp to the tooltip. The fourth is
below — *The inner end is flat* — and it is about the **other** end entirely,
which is why it is not a reversal of either however much it sounds like one. The
figures here are kept as the record of how the fill came to be nested at all;
where they name 5px at the ends, read the third round, and where they describe
the fill as a pill, read the fourth.

**Bundle over that round: 451.63 → 452.70 KB of JS** (133.68 → 133.86 gzipped)
and **103.44 → 104.46 KB of CSS** (18.46 → 18.65), which is 1.1KB and 1.0KB raw
for a disclosure, a popover, a chevron and its solid tip — and nearly all of the
CSS half is the comments arguing them. **The fifth round gives some of it back**:
**485.25 → 485.14 KB of JS** (143.98 → 143.94 gzipped) and **112.93 → 112.14 KB
of CSS** (20.12 → 19.97), both *down*, which is what removing seven rules and a
span costs when the comments replacing them are shorter than the ones they
argue away.

### The inner end is flat, because the bar grows out of the zero

**A bar anchored at a centre must look anchored at it, and a round cap there says
the opposite.** Both ends of the fill were pills, so the ink pulled away from the
rail's centre everywhere except one row through the fill's own middle: measured on
Perez's card at 1200, **3px of recess** at the rows a reader takes the shape from,
5px at the extreme rows in principle. What that draws is a lozenge sitting *near*
the middle of the rail, which is a picture of a quantity that begins somewhere
vague — where the whole device is a quantity measured **from zero**, and every
diverging bar chart ever drawn meets its baseline square. So the inner end is
flat and the outer one stays round: `.spl-fill--r` rounds its right end and
squares its left, `.spl-fill--l` the reverse.

**The round before this took a square cap out and this puts one back, and the
two are not in conflict — they are opposite ends of the bar.** That cap was the
**clamp marker** on the *outer* end, and it went for three stated reasons; not
one of them reaches this end, which is worth walking through rather than
asserting. (The marker itself is gone entirely now — see *The clamp is a
sentence, not a mark* above — which retires the first and third of those three
outright and leaves this end exactly as this round left it.)

- It *"looked wrong at the end of a bar"* — and the outer end is where a bar
  stops, where a squared-off tip reads as damage. The inner end is where a bar
  **starts**, and a flat edge at an origin is the only thing that reads as an
  origin at all.
- It *"costs the clamp mark nothing (that is the outer end's)"*, which was true
  when there was one and is now true for free.
- It *"forced the ends onto an inset of their own"* (`--spl-inset-x`, 5px),
  because a square corner sits at the fill's extreme height where the rail's own
  cap has already receded 1.76px. **The inner end has no such problem and takes
  no inset**: the horizontal inset is spent entirely at the outer end, by being
  subtracted from the fill's *length*, while the inner edge is pinned to the
  rail's centre by `left: 50%` / `right: 50%`. The rail is straight-sided there —
  it is 217px from either cap — so there is nothing for a corner to run into. The
  token stays a single 3px and `--spl-inset-x` stays retired.
- It *"was never explained anywhere on the card"*, which is the sharpest of the
  three and the one that decides this. A clamp marker is a **claim** — *this bar
  is not the real number* — and a claim a reader cannot decode is worse than
  none. A flat edge on the zero is not a claim, it is the shape of the
  measurement, and it needs no key: the card already says the centre is zero,
  with a dashed guide down it. (That sentence outlived the mark it was written
  about: the chevron *was* explained, behind the ⓘ, and went anyway — a claim a
  reader has to open a popover to decode is not much better than one they
  cannot.)

**Nothing about the length moved**, which is the property the invariant rests on.
The inline width is still `calc(frac × (50% − var(--spl-inset)))`, `railFraction`
is untouched, and `max-width: calc(50% - var(--spl-inset))` still says the same
thing at the last moment. Only `border-radius` changed, and only on which corners
it lands.

**Measured on the rendered pixels, before → after**, by walking each fill's ink
row by row against the rail — the same scan the third round used, run on real
screenshots at device-pixel resolution. On the six solid cards (Perez, Turang,
Contreras, Sánchez, Betts, Sale) the worst inner recess goes **3 → 0.000 at
1200**; at 390, where the rail's centre falls on a half-pixel, it goes 2.5–3.5 →
−0.5–0.5, which is the sampling grid rather than a recess. `fillWidth − half`
is unchanged on every row of every card and still **≤ 0** (−3.000 on a clamped
row, −50.56 down to −189.17 on Perez's unclamped ones), and the outer clearance
is identical before and after everywhere.

**The hatched card had to be measured with its hatch off, and that is stated
rather than glossed.** On Nick Allen the fill is accent stripes over transparent
gaps, so "the leftmost accent pixel in this row" is decided by the stripes and
not by the cap — the raw scan reads 7 → 5 and means nothing. Neutralising
`.spl-fill--thin` to a solid **in the page, in both builds, on the same eight
rows**: inner recess **3 → 0 on all eight**, with the widths byte-identical
(214 / 211.61 / 183.08 / 214 / 214 / 197.23 / 214 / 108.5) and the outer clearance
byte-identical too. Four of those eight rows are thin *and* clamped, which is the
one row shape that has to survive every change to this bar.

**The clamp mark was untouched by this round, counted rather than eyeballed** —
and has since gone entirely, so what follows is the record of it holding still
while the *inner* end changed. The chevron was a knock-out inside the fill's
outer 14px tip, countable as non-accent pixels in that window: **22 per clamped
row on a solid fill and 16 on a hatched one, identical before and after**, over
Sánchez (4 clamped), Turang (3), Contreras (1) and Allen (4, all hatched), at
1200 and 390. The hatched rows were still hatched. `.spl-key-chevron` — the stub
of bar in the key's popover — deliberately stayed a full pill, being a detached
fragment of an **outer** end. All of that is gone with the mark; the flat inner
cap this round is about is not, and re-measures at **0.000** inner recess at 1200
after its removal.

**The zero guide costs two device pixels, and nothing about it changed.**
`.spl-track::before` is a 1px dashed border-left at the rail's centre, drawn
6px proud of the rail top and bottom, so it is a ~28px column of which the fill
can only ever reach 10. A **right**-pointing bar starts on that column and so
covers a little of it; a **left**-pointing one stops at its edge and covers none.
Measured over the same cards: a right-pointing row's tick ink goes **14 → 12**
(covered 6 → 10) and a left-pointing row's is **18 → 18**. Raising the tick above
the fills was considered and refused — a guide drawn *over* the data would say
the line is in front of the bar, where the truth is that the bar begins at the
line.

**The two ends of the length range were forced onto a real row**, since the
formulas did not move but the caps did. A width of `0` resolves to the **3px
`min-width` nub** (a D of ink with its flat edge on the centre and its outer end
rounded), `overHalf −214`, inner edge **0.000** off the centre; a width of
`5000px` resolves to **214** against a half of 217, `overHalf −3`, inner edge
0.000. Both directions, both radii sets, checked.

**Everything else this card is measured against is unchanged** at 390 and 1200 on
all six players: row height **34px**, rail width **173 / 434**, card width
**358 / 680**, and page and overlay overflow **0 / 0**.

**Bundle: JS unchanged at 454.23 KB** (134.39 gzipped) — the only change to a
component was a comment — and **CSS 104.65 → 104.73 KB** (18.69 → 18.71), which
is 80 bytes raw and 20 over the wire for two directional rules and the paragraphs
above restated where they apply.

**Sample size is on the card whatever it is, and changes how the bars are drawn
twice.** The column heads carry it always — `vs LHP · 76 PA` — and two thresholds
sit under it, because the two failures are different things. Under
**`MIN_SAMPLE` (25 PA / 25 BF)** on the thinner side **no bar is drawn at all**:
a .400 average over 15 PA is one good week, and the tab becomes two columns of
figures with a line saying so (`Only 24 PA vs LHP — a handful of plate
appearances is not a platoon split, so the figures are here and the bars are
not.`). Between there and **`THIN_SAMPLE` (100)** the comparison is worth showing
and not worth leaning on, so the fill is **hatched** rather than solid — this
card's version of the percentile card's dotted bubble, where a broken mark has
meant "our estimate, not a measurement" since it was written — under a line
naming the thin side. Neither number is a stabilisation point and neither is
claimed as one (none of these stabilises at 100); the point is that the reader is
told which side is thin, and how thin, in the same glance as the bar. A side with
**no** split at all gets its own sentence and dashes rather than a zero.

**Which stats, and the counting stats are the interesting omission.** A batter's
rows are OPS, AVG, OBP, SLG, ISO, HR%, K%, BB% — the slash line and its headline
in reading order, then power net of average, then the two three-true-outcome
rates, which is where a platoon split usually *comes from*: a right-handed
hitter's trouble with a right-handed slider shows up in K% long before it shows
up in OPS, and K% is also the batter card's one `lowerBetter` row. A pitcher's
are OPS-against, AVG-against, FIP, WHIP, K%, BB%, HR%. **HR, RBI, AB and hits are
not on either**, because every one of them scales with how often he faced that
hand — a right-handed hitter takes about 70% of his plate appearances against
right-handers, so a raw count says which side he *saw more of*, which is a fact
about the schedule rather than about him. Everything comparable is therefore a
rate, and power appears as ISO and as home runs per PA. **R and SB are out
twice over**: they are counts, and MLB returns both as **0 on every platoon
split for every player**, which the old card handled by gating them on its
`whole` flag and which this card handles by never asking.

**ERA is absent from the pitcher's rows and FIP stands in for it.** MLB does not
split earned runs, so a platoon half has no ERA at all — but it has the counts
FIP is made of, and `PlatoonSplits` reads the `fip` the server already computes
per split off `leagueRates.ts::fipLike`, the same function (and so the same
`FIP_CONSTANT`) the pitcher card, the game log and the research board use. It
honours that function's own floor: a half under three innings carries null and
**dashes** rather than reporting one afternoon as a season (checked on a 5-BF
side, which dashes while the 12-BF side beside it reads 2.88).

**Two fields were added to the data model for it, and both were checked to exist
on a split before being asked for.** `SeasonStats` gains `strikeOuts` and
`baseOnBalls` — counts rather than rates, because a rate over a split has to be
divided by *that split's* own PA and only this object knows it — which is what
K% and BB% are drawn from; and `PitcherSeasonStats` gains **`opsAgainst`**, MLB's
own `ops` off the pitching split, which is the only single-figure summary a half
has now that ERA is missing from one and is the direct analogue of the batter
tab's headline row. Both are filled in `mlbStats.ts`'s two `to*SeasonStats`
parsers and mirrored by hand into `client/src/types.ts`. **No cache version moves
for either**: `playerStatsCache`/`pitcherStatsCache` are memory-only on a
30-minute TTL, `withEstimators` copies by spread, and although a `PlayerReport`
rides in a `day-{date}-v{N}` snapshot, `getReport` reads only `games` off a day
and builds the report itself — the same test that passage sets for `teamId`,
`team` and `position`: not whether the shape rides in a blob, but whether
anything reads it back out of one.

**The tab keys were swapped and the swap is the honest one.** `splits` used to
name the tab labelled **Stats**, a leftover from when that tab *was* the platoon
card, kept through the rename on the reasoning that a key in no URL is not worth
churning. That stops being true the moment a tab called Splits exists beside it:
two tabs, one named after the other's subject, reads fine today and is a trap the
next time anybody touches the file. So the window table is **`stats`** and the
platoon comparison is **`splits`**, each named for what it holds. Nothing outside
`PlayerDetails.tsx` had to change but one prop type — the open tab is component
state and is in no URL, and `PlayerOverview`'s `Stats →` link (`onTab`) is the
only caller, which is a compile error rather than a silent change of behaviour if
it is missed.

**It costs no request.** The splits fetch is the page's own **eager** one, made
on open because the Overview tab's season line reads it, so this tab is never the
first thing on screen to be waiting — unlike the Stats, Game Log, Arsenal and
Charts tabs, which are lazy on first open. The `Reading the platoon splits` wait
and the error line moved across with the card.

**The card has a second caller now, and it takes an optional `highlight`.** The
feed's **Upcoming** row draws `BatterSplitsTab` in its dialog with the announced
starter's half marked — the same component, the same `SeasonStats` objects (the
report's `splitVsLeft`/`splitVsRight` are what `getPlayerStats` puts on the
splits route as well), the marked column taking `.spl-head-side--on`'s accent
colour and the pitcher's hand and name on the head's own tooltip. This tab
passes no `highlight`, so neither is rendered at all here and every figure this
section records is unmoved (re-measured: heads 25.19px, card 680 / 358, row
34px, rail 434 / 173). The whole of that argument — why the row shows the
comparison rather than the one half, and why the mark used to carry a third
line and doesn't any more — is in **Client — the Feed view**, *The Upcoming
dialog is the Splits card*.

**Where it sits**: directly after **Percentile Rankings**, so the strip reads
`Overview · Percentile Rankings · Splits · Stats · Game Log · [Arsenal] ·
Charts`. That is a **seventh** tab on a pitcher and needed nothing:
`.details-tabs` already scrolls sideways and scrolls the active tab into view
with a 24px peek (checked at 390 on a batter and a pitcher — every one of the six
and seven tabs lands fully inside the strip when selected, and every tab switch
still resets the view's scroll to 0).

**This paragraph used to place it after Stats, and the argument it gave was a
good one — it is overruled rather than refuted.** What it said was: *after Stats
and before the Game Log, which is the order the season is cut in — the whole of
it, then the same season cut by handedness, then the games it is made of.* That
is a true description of the three tabs and it orders them by **how the data is
sliced**, which is a fact about the app rather than about the reader. Ordered by
what the reader is doing instead, the pair that belongs together is the
percentile card and this: both are a picture of *what kind of player he is* — one
against the league, one against the two hands he faces — where Stats and the Game
Log are the numbers he has actually put up. So a reader deciding about a stranger
now takes both pictures without a table between them, and the cutting order
survives intact one place along (`Stats → Game Log`, the season then the games it
is made of). Nothing about the tab's contents, its fetch or its keys moved; this
is one button's position in the strip.

**Measured in a browser at 1200×900 and 390×844, against the live server, in
each of the five states the card can be in.** *Solid* — Salvador Perez, 131 PA
vs LHP against 342 vs RHP: eight rows, seven pointing left, `.750`/`.587` on OPS
at 27% of the rail, K% pointing **left** at 13% on 17.6% against 20.8% (the
polarity, drawn right). *Extreme* — Cristopher Sánchez, 153 BF / 493 BF, all
seven rows left with four clamped at the rail's end, each ending in the same
round cap an unclamped bar ends in. *Thin* — Aaron Judge at 76 PA vs LHP and Josh
Hader at 30 BF vs LHB: every fill hatched, the amber line naming the side, and on
Hader six of the seven both hatched and clamped, the hatch running unbroken to
the cap. *Too thin* — Eduardo Valencia at 22 PA vs LHP: no fills at all, the
rails empty, the figures still there. And *one-sided* — Gage Workman at 0 PA vs
LHP: dashes down the left column, no bars, and a line saying there is nothing to
compare against. The card is **680px at 1200 and 358 at 390** (the reading column
and the overlay's gutters), the rail 434 and 173, the row **34px** at both, and
the **page and the overlay each overflow by 0** at both widths in every state;
the whole tab fits one screen at 900px tall without scrolling.

**And the invariants were driven against stubbed hostile shapes**, the way the
rounds above were: a 2.000 OPS against a .200 over 40 PA, a −4.00 against an
18.00, a null / an empty string / the server's em-dash / the literal `NaN`, two
identical halves, and a zero PA denominator. At both widths, **no row's fill
exceeds its half of the rail** (worst `fillWidth − half` **−3.000px** on the
clamped cases) and none is a non-finite length; the null rows dash with no bar,
the dead-even rows draw the 3px nub at the centre, and the zero-PA card draws no
bars and says `No plate appearances vs LHP this season, so there is nothing to
compare against.`

**Bundle: 445.46 → 448.22 KB of JS** (131.59 → 132.68 gzipped) and **99.98 →
101.82 KB of CSS** (17.80 → 18.12 gzipped) — 2.8KB and 1.8KB raw, 1.1KB and
0.3KB over the wire, for a component that replaced a card and a stylesheet block
that is mostly the paragraphs above restated where the rules are.

### The Game Log's rows open the game

**A press on a row of the Game Log opens that game as a feed** — the same `PlayerDay`, narrowed to the row's `gamePk`, in the app's shared `Modal` (`PlayerDayModal`). The log is the season as the games it is made of, and until now a row was the end of the road: fourteen columns of what he did that night and no way to see any of it. A doubleheader is why the popup is keyed on the game rather than the date — two rows share one afternoon.

It **fetches its own day** rather than being handed one, because a row names a date the page above it knows nothing about; per open is right for an explicit action against a route every layer of which is already cached (a past date is a frozen day snapshot, one read). `GameLog` therefore gained `playerId` and `name`, which it had never needed while it only drew what it was given. The box takes `--card-column` for the same reason the tab does.

**The rows look pressable now, and the paragraph this replaces is worth keeping in outline.** They carried no hover tint for a long time and the argument was sound while it held: with a pointer the tint lit a row that is read *across* rather than picked, and on a touch device, where `:hover` sticks to whatever was last tapped, it left a band of `--panel-2` on some arbitrary game until something else was pressed — a selection the app then declined to act on. Both halves of that turned on the row **doing nothing**. It opens a game now, so the tint is the truth rather than a tease and `cursor: pointer` is the shape of the thing you can do. The old complaint survives its own cause in one respect, so the tint is scoped to **`(hover: hover)`**: a sticky hover on a phone is still a mark left on the last row pressed after its dialog has closed, and there the press itself is the affordance. The zebra stripe is untouched, being what keeps a fourteen-column row readable across.

**That scoping was written here first and is now the app's.** The same fault was reported against the feed's cards — *"the cards should not highlight when scrolling"* — and ten more pressable surfaces take the identical rule, with the line between a surface and a control drawn where it belongs: see **A card doesn't highlight when you scroll past it** in **Client**. Nothing about this table moved; it is the precedent the sweep generalised, and its `:focus-visible` background stays outside the query on purpose, a keyboard ring being wanted on every device.

A `<tr>` cannot hold a button without leaving table layout and the whole row is the target, so it takes **`role="button"`, `tabIndex={0}` and Enter/Space** (`GameLog.tsx::pressProps`, which `preventDefault`s Space so the press doesn't also scroll the pane under it); `:focus-visible` draws an inset accent rule top and bottom, inset because a row spans a scrollport that clips at both edges. Everything else about the table is untouched and was checked to be: the sticky header row and sticky date column, the `<tfoot>` season row, Load-more paging and the full-page expand button all behave as before, and a row press works from inside the expanded box as well as out of it.

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
existed. It now runs `Overview · Percentile Rankings · Splits · Stats ·
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
that line, which is the `dy` on the `<text>`. And an x tick is centred on its own
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
same rule the chart's reference line is drawn by, so the colour and the dash
pattern cannot come to be two of each the next time either moves. Checked in a
browser at every width: the swatch and the guide both compute
`stroke: rgb(92, 111, 151)`, `stroke-dasharray: 4px, 4px`, `stroke-width: 1.5px`.

**What the swatch deliberately does not match is the *rendered* dash length**,
and the phone is why. The chart's dashes are viewBox units scaled with the plot —
4 units paints **3.52px at 1200 and 1.85px at 390** — so matching them here would
mean scaling the swatch by the chart's own factor, and on a phone that is a
1.85px dash inside a 24px swatch: six cycles of sub-2px marks, which reads as a
grey smudge rather than as a dashed line. A legend owes the reader the *pattern*,
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
