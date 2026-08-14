### The player page, and the reorder screen

Split out of `client.md`. `PlayerDetails` is the overlay that opens on **anybody**
— a roster row, a feed item, a research-board row of a man nobody has rostered —
which is the fact most of its design follows from. The dialog rules its tabs lean
on are in `client-dialogs.md`.

- **the player page and the editor** — what is left of the old **players / Games** view, which was one card per rostered player (`PlayerCard`, `PitcherCard`); the card became the feed's grouped reading and the grouping became this page's own **Overview** tab, so the card's job has ended up here. **Both card components survive in the tree and render nowhere**; their parts do the work instead — `PlateAppearanceCard`, `InningsList`, `OpponentSection`, `GameStatusBadge`, `PlatoonSplit` are all read by `LiveFeed` and, through it, by `PlayerDay.tsx`, which is why the files stay and why rollup drops only the two shells (442KB → 425). See **Pitchers on the roster** for the two things that went off screen with them and have not been rehomed. `PlayerDetails` overlays a tabbed view: **Overview** (his season line, his day and his last five games — see its own section below; first in the strip and the tab the page opens on), the percentile card, rolling xwOBA chart (`RollingXwoba.tsx` — a client-computed rolling average over a 50/100/250-PA window, lazily fetched only when its tab opens), a pitchers-only **Arsenal** tab (also lazy, `SeasonArsenalRow`, with its own Overall / vs RHB / vs LHB `SplitTabs`), a **Game Log** tab (`GameLog.tsx`, lazy too — and lazy for the **Overview** as well, which draws five of its rows off the same one read; the whole season's games, newest first, in the app's one plain stat table outside the summary view. The table itself is **`GameLogTable`**, factored out so the tab and the Overview's preview are one component with `shown` and `totals` set differently rather than two tables free to drift — see **the player page's Overview tab** below: the counting stats per game plus the running **Szn** line (below), a `<tfoot>` season row summing **every** game rather than the page on screen (pinned to the bottom of the box, but **only on that axis**: its label spans three columns and carries `.glog-date`, the class that pins the date column to the left edge, so scrolling right slid the label along over its own totals and swallowed the first two stat columns — `left: auto` leaves it constrained on the block axis alone), and the feed's Load-more paging at `PAGE_SIZE` 25 because a batter's season is 150 rows inside an overlay that already scrolls. Its header row sticks to the top and the date column to the left, both at once — which is why this tab alone gives the overlay `.gamelog-mode`: a sticky header can only stick to the box that scrolls, and the box that scrolls has to be the table's own (its columns overflow a phone, and an `overflow-x` container scrolls in both axes whether you want it to or not), so the overlay becomes a fixed-height flex column — the shape `.app.summary-mode` gives the summary view — with the head and tabs holding their place. Zeroes are dimmed so the eye lands on the games with something in them. **Every row is a press that opens that game as a feed**, and carries the hover tint and the pointer that say so — see **The Game Log's rows open the game** below, which also sets out why the rows deliberately carried no tint for as long as they did nothing. The zebra stripe is untouched: it is what keeps a fourteen-column row readable across, and it is the same device the other two wide tables use. The pitcher's SP/RP marker renders **only when the log holds both** — twenty rows of SP say nothing the IP column doesn't. The batter's line **leads on `H/AB`** — one cell where AB and H were two columns, the same shape the summary table's own `H/AB` uses. It spent a spell over **plate appearances** instead, on the argument that AB throws away the walk and the sacrifice, so a 2-for-4 night with a walk read `2/5` where the at-bat count alone calls it four trips. What that traded away is the thing this column is actually read for: **every other number on the line is over at-bats** — the `Szn AVG` three cells along, and the AVG and the SLG inside the OPS on the `<tfoot>` row underneath — so `H/PA` was the one cell on the row whose denominator nothing else on it shared, and a reader checking the .259 beside it found 117 over 524 rather than the 117 over 452 that made it. Over at-bats the cell and the average agree by construction, and the walk it was defending is not lost at all: it is the BB column four cells along, which is where a walk belongs. `2/4` with a `1` under BB is a five-trip night stated in the two places that own the two facts. **PA leaves the columns and not the row** — it rides the cell's tooltip (`0 hits in 4 at-bats · 5 PA`) and it is still what tells the two kinds of `0/0` apart, below. The `<tfoot>` follows the cell above it, being that column's sum: season hits over season **at-bats**, which is the very pair the AVG at the end of the same row divides. Checked in a browser against MLB's published season line, three batters end to end — Alonso `117/452` · .259 · .833, Soto `83/293` · .283 · .947, and Justin Dean `3/8` · .375 · 1.125 at the thin end of the scale — each identical to MLB's own; and league-wide, summing 9,023 game-log rows across 120 batters reproduces MLB's season AB and H for **all 120**, 0 mismatches. **What dims is `pa === 0`, not a bare `0/0`.** A man who appeared without coming to the plate — a pinch-runner, a defensive replacement — has nothing to read in this cell and dims whole, the way every other zero in this table does. Over at-bats a night that was one walk is *also* `0/0`, and it deliberately stays plain: he did come up and he did do something, and the cell can no longer tell those two apart where the row still can. That distinction is worth keeping rather than collapsing — in the same sample 309 rows are a genuine 0 PA against 97 that are `0/0` off a walk or a sacrifice, so dimming on at-bats would have quietly filed 97 real plate appearances as “not in the game”. Each says which of the two it is on hover, the plain one naming the trip it doesn't count (`1 PA, no official at-bat`). `decisionColor` moved from `PitcherCard.tsx` to `lib.ts` so the log's W/L/S/HLD chips take the same colours as the card's. **The Szn columns read in the order the two lines are read in.** A batter's are `Szn AVG · Szn OBP · Szn OPS` — slash-line order, so the eye takes them the way a slash line is taken, and OBP sits between the two rather than after them because a slash line with its middle term at the end is not a slash line. **SLG is the one part of it that gets no column**, and deliberately: `seasonSlg` is parsed and shipped by the route (it always has been), but it is exactly `OPS − OBP` off the two cells beside it, and this table is already sixteen columns wide on the pitcher tab. A pitcher's are `Szn ERA · Szn FIP · Szn WHIP` — **the estimator immediately after the number it estimates**, which is the rule the pitcher card's season line and the research board's `ERA · xERA · FIP · xFIP` both follow, and the reason the pair must not be split. **WHIP comes after the pair rather than between them**, because it answers a different question: ERA and FIP are two readings of the runs, one of them scrubbed of the fielding behind him, and a number counting the traffic he allows has no business standing in the middle of that comparison. FIP is **null under three innings** — `fipLike`'s own rule, applied to the season-to-date innings — and dashes there, which on a reliever's log is his first outing or two and nothing else.

**The `<tfoot>` treats the two kinds differently, and the split is honest rather than tidy.** The batter's OBP is **recomputed from the totals** alongside the AVG and OPS already there, off the `hbp`/`sacFlies` the row has carried for exactly this since it was written — the three cells are then one arithmetic over one set of sums, and the OPS at the end of the row is that OBP plus a slugging over the same at-bats. The pitcher's FIP and WHIP are **not** recomputed and are **not summed** — a season-to-date rate is not a summable thing, and the newest row's running value *is* the season, the log running to the last game played. So the foot takes `games[0]`'s. That is right twice over: it keeps FIP's one definition on the server, where the constant behind it lives, rather than restating `FIP_CONSTANT` in a table; and it cannot disagree with the row directly above it. Checked against MLB's published season line end to end — **Alonso** `.259/.353/.833`, **Soto** `.283/.408/.947`, **Ohtani** `.290/.392/.930` and **Ke'Bryan Hayes** `.138/.191/.425` on the batting side (newest row and recomputed foot alike, save the one hundredth of Ohtani's foot OPS, which is the pre-existing rounding of an unrounded `obp + slg` against MLB's rounding of each half first), and **Sánchez** `2.54 / 2.68 / 1.19`, **Alcantara** `3.52 / 3.83 / 1.17`, **Gallen** `6.34 / 5.36 / 1.56` and **Vesia** `2.81 / 3.10 / 1.18` on the pitching side, each FIP identical to the one the Season tab prints for the same man.

**Measured at 390px on the real log**: the batting table goes **688px → 753** for one column and the pitching table **659 → 789** for two, against a 390px scrollport that was always going to scroll — and the page body overflows at **no** width (checked 320 / 390 / 640 / 1200 on both tabs, document overflow 0 at every one). The two sticky axes are untouched at every one of them: the date column pins at **0** from the scrollport's left edge with the table scrolled to its far right, and the header row at **1px**, which is the border.  It carries the same **full-page button** the other two wide tables do, inline in its Date header — the corner cell, pinned on both axes, so it is the way out as well as in; expanding now drops nothing but the app's own chrome, the log having stopped capping itself), a **Stats** tab — the research board transposed onto one player, five spans down the side and the board's own columns across (see **The Stats tab: the board, transposed** below) — and a **Splits** tab, which is that same season cut by *handedness* instead of by time: one diverging bar per stat, pointing at the side he is stronger against (`components/PlatoonSplits.tsx`, and **The Splits tab** below for the whole of its reasoning). Those two were one tab until the platoon card became a comparison rather than a table; `SeasonPanel` / `PitcherSeasonPanel` and their `.split-block` stat pills are gone from `PlayerDetails.tsx` with it, though the `.split-block` / `.stat-pill` rules stay live for `PlayerCard.tsx`'s `PlatoonSplit`, which the feed's Upcoming row draws. The player page is a fixed full-screen overlay with its own scroller, so it pins the body (`hooks.ts::useLockBodyScroll`, restoring the scroll on close) and sets `overscroll-behavior: none` — without both, scrolling it chained through to the list behind and closing it landed the user somewhere they never scrolled to; `none` rather than the `contain` that stood here for a while, since that stops the chaining and keeps the overlay's own iOS bounce (see **A table stops when its rows do** above). `GameReel`'s `.reel-view` is the same shape and does the same. `PlayerAdder` searches the season roster; the settings menu's **Edit players** entry swaps the card list for `PlayerOrderEditor.tsx` — a drag-to-reorder screen showing only each player's number, headshot, name and a remove button. It drags via Pointer Events (mouse + touch). **On touch only the ⠿ grip starts a drag** — `touch-action: none` sits on `.order-grip` alone, so a finger anywhere else on the row scrolls the list as usual (with it on `.order-row` the whole page was unscrollable in edit mode); a mouse has no such conflict and can still grab the row anywhere (`startRowDrag` bails on non-mouse pointers, the grip stops propagation so one press starts one drag). It reorders the live list as the dragged row passes another (the row under the pointer is found with `elementFromPoint`; the dragged row sets `pointer-events: none` so it resolves to its drop target), auto-scrolls the page while a drag is held within `EDGE_ZONE` of the viewport top/bottom, and persists the order (`PUT /api/watchlist/order` — the roster's route, old name and all) once on release. Each row's ✕ removes that player: two taps, the first arming the button into a red "Remove?" (a row you drag shouldn't delete a player on one stray tap, and there's no undo), the second calling `App.tsx::removeFromEditor` — which drops him from `reports`/`reportsRef` immediately so the row goes before the roster-triggered refetch lands, and so a drag right after commits the order without him. The button stops `pointerdown` propagating, or the row's drag handler would `preventDefault` the click away. That button is **`RemoveButton.tsx`**, shared with `PlayerDetails`' header so the roster's one destructive control looks and behaves the same wherever it appears — controlled rather than self-arming, because the editor keeps a single armed row across the whole list. Edit mode is transient — deliberately **not** in the URL — and clears on a view switch. There is no longer a player-nav strip; a player can also be removed from `PlayerDetails`.

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

**The live entry and a scheduled game keep their place on the page**, which is the line worth drawing. A card behind a press is right for what has already happened; "he is at the plate right now" and "he is starting at 7:05" are what the page was opened *for*, and putting either behind a press would hide the answer to the question being asked. A **live** entry therefore sits above the cards — filing it behind one would bury it — while the game it belongs to still gets its card for the plays already completed in it.

**A scheduled game is an `UpcomingRow` instead of a card, not as well as one.** That row *is* the game info before first pitch — matchup, the SP chip, the other side's announced starter, first pitch, opening onto the platoon split or the lineup waiting for him — so a card above it would state the matchup twice.

**A game he was on the roster for and did nothing in is not a press**, there being nothing behind it: the card draws the line his stat line would have been on and stays static. Which of three things it says turns on the state, because getting it wrong is the difference between a fact and a wrong claim: a **final** says `Did not appear.`, a game still being played says `Not in the game yet.`, and anything else says `Yet to play.` (checked on a live game with a pitcher who hadn't come in, and on Aaron Judge's IL day, which reads the first).

**Inside the dialog the plays read forwards** — first at-bat first (`byPlayOrder`, which is `byRecency` negated so the two cannot disagree about a tie). The stream is newest-first because it is a stream; a *game* is one afternoon read start to finish, which is the order a box score, a play-by-play and a pitcher's innings all use. Checked on a real page: a batter's four trips read `1, 4, 7, 9` where they used to read `9, 7, 4, 1`.

**The combined line at the top of the tab is unchanged and still only appears when there is something to combine.** A day is one game almost every time, and that game's own card already carries his line for it — so on a single-game day the strip was the same string twice, an inch apart (measured on a real page: `1-2, 1 R, 2B, 2 BB, K, 1.750 OPS` in both). It is drawn only over a doubleheader, where it is the one place the two halves are added up.

**Narrowed to one game there is no card at all.** `PlayerDay` takes a `gamePk` — what a Game Log row means, and what a card's own dialog passes back in — and in that mode draws the feed directly: the box is already about that game, so a card inside one would be a press to reach the only thing on screen.

#### A day with no game names the next one

**"No game today" is true and useless on its own**, and it is what a day whose report holds nothing used to be reduced to — a single line where the reader's actual question is *when, then*, which no other view in the app can answer, every one of them being about today or a range that has already been picked. So the block names the next one (`NextGameBlock`, off `/api/players/:id/next-game`).

**Which "next game" that is turns on whether he works out of the rotation**, because the two are genuinely different facts. A batter or a reliever could be in any of his club's games, so his club's next game is his; a **starting pitcher is in one in five**, and his club's next game is somebody else's start — the very thing the feed's Upcoming section already refuses to guess at (see `isUpcomingFor`, where an announced probable is the only thing that puts a starter on the page). The test is **`lib.ts::isRotationStarter`** on the day report, which carries `pitcherSeasonStats`; it is the app's one definition of a starter and is read here rather than restated on the server, which is why the route takes a `start` flag rather than working it out again off a season line.

**ESPN's SP/RP eligibility is deliberately not that test**, although it is a fantasy position and this is a fantasy app. It is a **cover rather than a partition** — 143 of 749 pitchers on a checked board are eligible at both — so it says where a league will let you start a man and cannot say whether he takes the ball every fifth day. The two answer different questions and this is the one `starter`-shaped test the app already has.

**A starter with no announced start is told so rather than shown one**, which is the whole reason the server answers with `start` beside the game rather than a bare `NextGame | null`: `Next start not yet scheduled.` is a fact about how far ahead clubs name their rotations, where showing him his club's next game would be a claim about a start that isn't his. Checked against the live 2026 season on 08-13: Logan Webb reads `Next start · Aug 15 · 4:05 PM · vs COL · vs RHP Michael Lorenzen` where his club's next game is Aug 14; Chris Sale and Shohei Ohtani, neither named for a turn inside the window, read `Next start not yet scheduled.`; Dylan Lee (a reliever) reads `Next game · Aug 14 · 7:15 PM · vs AZ · vs RHP Brandon Pfaadt`; and Salvador Perez (a batter) reads `Next game · Aug 14 · 9:38 PM · @ LAA` with no starter, LAA having named nobody.

**The read is in this branch and nowhere else**, so a player who is playing today costs nothing at all: the day is drawn and the block is never mounted. `report.games.length === 0` is the test rather than a second copy of `PlayerDay`'s own emptiness rule, and the two agree by construction — sections and upcoming rows are both built off `games`, so an empty `games` is exactly the case `PlayerDay` would have drawn its "No game" line for.

**It is one wrapping line rather than a grid** (`.ovw-next-line`): the parts are a label, a when, a matchup and an opposing starter, and on a phone they read as a sentence broken over two lines rather than as a table of four things. Measured at 390: it wraps once and the page overflows by 0.

**It is the default tab as well as the first**, which is the same argument as the ordering: the tabs beside it are readings of his *season*, and on a game day the question a player page is opened with is what he is doing. It costs one request on open — `api.playerDay`, lazy in the same `dayReq` shape the Game Log, Arsenal and Rolling tabs use, which for the default tab means it loads with the page — and that request is the cheap half of the two the page already made, being one player over one date against a percentile scrape (see **Date handling and server routing** for why it adds no cache of its own and why the date is the server's rather than the client's).

**The strip is six tabs now, and seven on a pitcher** — it was five and six when Overview joined it, and the Splits tab added the sixth. It needed nothing either time: `.details-tabs` already scrolls sideways and already scrolls the active tab into view with a 24px peek. Measured at 390px, the strip shows Overview · Percentile Rankings · Stats with the rest a swipe away, every tab lands fully inside the strip when it is selected (checked one by one on both kinds), the tab's own column is `--card-column` less the overlay's gutters (358px), and the page body overflows by 0.

**The day takes `--card-column` rather than the 860px the tabs beside it use**, because what is in it is exactly what the feed holds — an at-bat card, a clip, an outing's innings — and those were sized against that number in the first place. A day read here and the same day read on the stream is then the same reading at the same width (measured: 800px at 1440, 358 at 390). The cap sits on `.details-overview .player-day` rather than on the tab, which spans the tab so its two tables can (see **the player page's Overview tab** above), and the `container-type` sits on the same box for the reason `.details-arsenal` carries one: the cards inside size themselves off their container, and read off a full-width tab they would answer a container query the card itself never satisfies.

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
bleeds past them — and one rule for the span column's **sort button**, which is
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

**Lazy on first open**, like the Game Log, Arsenal and Rolling tabs and keyed by
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
further it runs, the bigger the split. A full bar is a gap bigger than nine
players in ten have in that stat."* — and moving it from the top of the card to
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
and fantasy button open — with `.spl-key` folded into `.settings-menu`'s own
positioning rule, and only two things of its own: the opposite anchor (it hangs
off a button at the card's right edge, so it opens leftward *into* the card) and
prose rules, that box having only ever held controls. The button is
`.app-dialog-close`, the app's 30px icon button, so there is a real touch target
rather than a bare glyph, and it fills with the accent while its panel is showing
the way every other disclosure in the app does. **Measured: panel 320×138.3 at
both widths, landing at x=597 at 1200 and x=41 at 390** — inside the viewport on a
phone, which is what the width cap is for. It needs an explicit `width` where the
gear's menu does not, and the reason is worth keeping: the containing block here
is the **30px button**, so a shrink-to-fit resolved against 30px and the box fell
back to the shared `min-width: 180px`, turning two sentences into a 225px-tall
column.

**Real keyboard access and a real name, driven rather than assumed.** It is a
`<button>` with `aria-label`, `aria-expanded` and `aria-controls`; driven in a
browser, **Enter and Space both open it**, Escape closes it and leaves focus on
the button, an outside press closes it, and the button itself toggles it shut.

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
`full` clamps and **carries a chevron just inside its tip** to say it has, which
about one qualified player in ten does on any given row by construction;
Cristopher Sánchez is among the league's most extreme cases and clamps four of his
seven (his `.317` OPS against lefties and `.762` against righties is a .445 gap).
That mark **squared the bar's outer end off** until now — see *The clamped end is
round, and the clamp moved inside the bar* below, which is where the reversal and
what it cost are set out.

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
at twice more; see below.

### The clamped end is round, and the clamp moved inside the bar

**This reverses the decision the two paragraphs above were written for, and it
takes a token with it.** What stood here was that *the ends need a bigger inset
than the sides, and the concentric argument is why*: the concentric nesting holds
for a *round* cap and says nothing about a **square** one, which is what a clamped
bar drew. A square corner sits at the fill's extreme height, 5px off the rail's
centre line, where the cap's ink has already receded `8 − √(8² − 5²)` = **1.76px**;
at a 3px inset that corner had **1.24px** of rail beside it against its own
midline's 3px, so it ran into the curve with no margin left to read as one, and
`--spl-inset-x` (5px) was the answer. Every word of that is still true of a square
cap. **The square cap is gone**, so none of it applies.

**It went because it was complained about twice and defended once too often.**
The squared end was the clamp marker — *this is not an exact measurement, the real
gap is bigger* — and it paid for that in three ways: it looked wrong at the end of
a bar, it forced the ends onto an inset of their own, and, the quietest fault,
**nothing on the card ever said what it meant**. A reader met a differently-shaped
bar end with no key to it. That third one is what makes the reversal an
improvement rather than a trade: the key now has a home behind the ⓘ (above) and
the room to explain a mark, which a permanently-visible caption never had.

**So every cap is round, and the clamp is a chevron knocked out of the fill just
inside its tip.** Where the mark could go was decided by measuring rather than by
taste. **Past the end there is nowhere to put anything**: a full bar stops 3px
short of the rail and the figure beside it is one 10px column gap away (7px under
560), so a glyph out there would sit in the gutter and collide at exactly the
widths this table is tightest at. And it must not be a `background` treatment —
`.spl-fill--thin` already spends that on the hatch, and a row can be thin *and*
clamped — so a pseudo-element is the one layer that composes with both. It **costs
no length**, which is the invariant that had to survive: the chevron is drawn
*within* the fill, so a clamped bar is exactly as long as one at full scale.

**The hatched-and-clamped row is where the first attempt failed, and it is worth
recording.** The chevron was knocked out in `--panel`, on the tidy reasoning that
the card's own ground reads as the rail showing through the bar. It does, on a
solid fill. On a hatched one it **disappeared**: the hatch is accent stripes over
transparent gaps, the gaps show the rail, and the rail is `--panel` under a 6%
wash — so the mark was one more gap among ten. Measured at 1× on Nick Allen (31 PA
vs LHP, four rows both thin and clamped) it was invisible, and darkening it to
`--bg` barely helped, the hatch being busy rather than merely similar. So a
`::before` lays **14px of solid accent — two whole stripe periods** — under the
outer end and the chevron is knocked out of *that*. On a solid fill the tip is the
accent the bar already is and changes nothing whatever; on a hatched one it gives
the mark a ground. One rule, one mark, both fills.

**And with the square corner gone the two tokens are one again.**
`--spl-inset-x` is retired and the width is `calc(frac × (50% − var(--spl-inset)))`
— 3px on all four sides, which is the case that number was chosen for in the first
place. A radius-5 cap 3px inside a radius-8 one **shares its centre**, so the
track shows exactly 3px of itself at *every* angle rather than 5px at the midline
and less at the corner, and every bar is **2px longer** than it was.

**Measured on the rendered pixels, before → after**, by walking each fill row and
asking how much track is left past it — the check the closed-form pass missed, and
the one the 5px was bought with. A clamped bar's **tightest** row goes **4.196px →
3.000px** and its midline **5px → 3.000px**: the clearance is now the *same number
at every row*, where before it varied by 0.8px around a hard corner. That is the
whole of the trade, and it is worth stating plainly rather than as a win — the
tightest clearance **falls by 1.196px**. It is the right trade because 3px is the
margin the fill's long sides have carried since the first fix and nobody has ever
complained about those; a constant margin reads as a margin where a varying one
reads as a corner running out of room. `fillWidth − half` goes **−5.000px →
−3.000px**, so every fill is still strictly inside its half and is 2px longer.

(Note the 4.196px: the previous round recorded "3.24px clear at its tightest",
which is the figure for a **truly square** corner. The rule that shipped was
`border-radius: 2px`, not 0, and a probe that models both caps' real painted radii
finds the minimum at `dy = −4` rather than at the extreme row. The 5px inset was
therefore buying a little more than it was credited with — and it is still 1.2px
more than the round cap needs.)

**Swept over Turang (3 clamped rows), Contreras (1), Betts (0), Sale (0) and Nick
Allen (4 clamped and all 8 hatched), at 1200px and 390px**: every clamped end
clears by **3.000px at both widths on every card**, the widest fill is 214 of a
217px half at 1200 and 83.5 of 86.5 at 390 (212 and 81.5 before), row height is
**34px** and the page and the overlay overflow by **0** at both widths, all
unchanged.

**Length stays monotonic in the gap**, which is what the single inset exists to
preserve and what a mark inside the bar cannot threaten: checked on all five
cards, the **shortest clamped bar is never shorter than the longest unclamped
one** (tightest case Nick Allen at 390, 83.5 against 82.56). A clamped row also
says so **in words** — the row's own tooltip gains *"Bigger than the rail's full
scale, so the bar stops at the end."* — which is the belt to the chevron's braces
and reaches a reader who has met the mark before finding the key.

**The invariant is held in two places and neither is decorative.**
`railFraction(gap, full)` replaces the bare `Math.min`, and is **total**: it
answers in [0,1] for every input, `NaN`/`±Infinity`/negative/zero-denominator
included, where `Math.min(1, NaN)` is `NaN` — not a length, so the width would
have been dropped as invalid and the bar left to size itself. Nothing upstream can
hand it one today (`num` rejects every non-finite string and `share` refuses a zero
denominator), and that is the argument for guarding rather than against it: it is
the one function between a stat's arithmetic and a length in pixels, and the next
stat added to either table gets checked whether or not its author thought to. The
stylesheet says it again at the last moment — `max-width: calc(50% - var(--spl-inset))`
on `.spl-fill`, with the `min-width` floor that draws a 3px nub for a gap of almost
nothing taking that same cap as its own ceiling (`min(3px, 50% - …)`) so the floor
can never breach it either.

**The scale was checked rather than assumed, and it is not the fault.** Sweeping
the league's own split leaderboards, **224 of the 414 batters** and **315 of the
532 pitchers** whose thinner side clears `MIN_SAMPLE` have at least one clamped
row — which is what a per-row 90th percentile *should* give over eight and seven
rows (1 − 0.9⁸ is 57%), so `full` is calibrated where it was and none of it moved.
What the sweep is for is the extremes, and they cluster exactly where a thin side
meets a real one: on the batting board **Josh Smith** (27/148 PA) runs 44.4% K%
against 16.9% — **3.24×** the scale — with McCutchen at 3.11×, **Drew Gilbert**
(38/250 PA, .081 OBP against .357) at 3.07× and 7 of his 8 rows clamped, and
James Outman at 3.04×; on the pitching board **Joe Ross** (30/27 BF) has a 2.90
FIP against a 16.65 — **5.73×** — with Chris Roycroft's WHIP at 5.32× and Zach
Maxwell at 5.13×. Below `MIN_SAMPLE` the ratios are farther out still (a 2-PA side
gives a 1.000 AVG gap, 11× the scale) and no bar is drawn for them at all, which
is the gate doing its job rather than the clamp doing it.

**Measured before → after with the two builds driven back to back**, on
Contreras, on the three worst drawn batters, on the two worst pitchers and on
Sánchez, at 1200px and 390px, by walking each fill's painted boundary against its
rail: worst overhang **+1.430px → −0.933px** (i.e. from ink outside the rail to
clearance inside it) and worst `fillWidth − half` **0.000px → −3.000px**, with the
clamped rows still flagged and marked in both. Driven again with the splits
response stubbed to the hostile shapes — a 2.000 OPS against a .200 over 40 PA, a
−4.00 FIP against an 18.00, a null / an empty string / the server's em-dash / the
literal `NaN`, two identical halves, and a zero PA denominator — the worst
overhang over every one of those at both widths is the same **−0.933px**, and each
absence still reads as it should: the null rows dash with no bar, the dead-even
rows draw the 3px nub at the centre, and the zero-PA card draws no bars and says
`No plate appearances vs LHP this season`. Row height (34px), rail width (173 /
434), card width (358 / 680) and page overflow (0 at both widths, on both kinds)
are all unchanged. **Bundle: 451.11 → 451.23 KB of JS** (133.50 → 133.55 gzipped)
and **102.73 → 102.84 KB of CSS** (18.35 → 18.37), which is 0.1KB each and nearly
all of it the comments explaining the nesting.

**Those two paragraphs are the first two of three rounds on this one geometry,
and the third is above** — *The clamped end is round, and the clamp moved inside
the bar*, which retires `--spl-inset-x` along with the square cap it was written
for and carries the before → after for the move back to a single 3px inset. The
figures here are kept as the record of how the fill came to be nested at all;
where they name 5px at the ends, read the third round.

**Bundle over this round: 451.63 → 452.70 KB of JS** (133.68 → 133.86 gzipped)
and **103.44 → 104.46 KB of CSS** (18.46 → 18.65), which is 1.1KB and 1.0KB raw
for a disclosure, a popover, a chevron and its solid tip — and nearly all of the
CSS half is the comments arguing them.

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
Rolling tabs, which are lazy on first open. The `Reading the platoon splits` wait
and the error line moved across with the card.

**Where it sits**: after Stats and before the Game Log, which is the order the
season is cut in — the whole of it, then the same season cut by handedness, then
the games it is made of. That is a **seventh** tab on a pitcher and needed
nothing: `.details-tabs` already scrolls sideways and scrolls the active tab into
view with a 24px peek (checked at 390 on a batter and a pitcher — every one of
the six and seven tabs lands fully inside the strip when selected, and every tab
switch still resets the view's scroll to 0).

**Measured in a browser at 1200×900 and 390×844, against the live server, in
each of the four states the card can be in.** *Solid* — Salvador Perez, 131 PA vs
LHP against 342 vs RHP: eight rows, seven pointing left, `.750`/`.587` on OPS at
27% of the rail, K% pointing **left** at 13% on 17.6% against 20.8% (the
polarity, drawn right). *Extreme* — Cristopher Sánchez, 153 BF / 493 BF, all
seven rows left with four clamped at the rail's end and squared off. *Thin* —
Aaron Judge at 76 PA vs LHP and Josh Hader at 27 BF vs LHB: every fill hatched,
the amber line naming the side. *Too thin* — Alex Jackson at 24 PA vs LHP: no
fills at all, the rails empty, the figures still there. And *one-sided* — a
call-up with 0 PA vs LHP: dashes down the left column, no bars, and a line saying
there is nothing to compare against. The card is **680px at 1200 and 358 at 390**
(the reading column and the overlay's gutters), the rail 434 and 173, the row
**34px** at both, and the **page and the overlay each overflow by 0** at both
widths in every state; the whole tab fits one screen at 900px tall without
scrolling.

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
