### The player page, and the reorder screen

Split into three files, because it had grown past the 150k-char limit
`CLAUDE.md` sets for these. This one is the page itself — the overlay, its
pinned head, the reorder screen — and the **Overview** tab, which is what he is
doing now: his day, his next game, his projected starts, his latest news and his
last five games. The tabs that read his *season* are in `client-player-tabs.md`,
and the Splits tab in `client-player-splits.md`; both are listed again at the
foot of this file.

Split out of `client.md`. `PlayerDetails` is the overlay that opens on **anybody**
— a roster row, a feed item, a research-board row of a man nobody has rostered —
which is the fact most of its design follows from. The dialog rules its tabs lean
on are in `client-dialogs.md`.

- **the player page and the editor** — what is left of the old **players / Games** view, which was one card per rostered player (`PlayerCard`, `PitcherCard`); the card became the feed's grouped reading and the grouping became this page's own **Overview** tab, so the card's job has ended up here. **Both card components survive in the tree and render nowhere**; their parts do the work instead — `PlateAppearanceCard`, `InningsList`, `OpponentSection` and `GameStatusBadge` are all read by `LiveFeed` (`PlatoonSplit` was the fifth until the feed's Upcoming row swapped it for `PlatoonSplits`' own card — see **The Upcoming dialog is the Splits card** in **Client — the Feed view** — so it is now named only by `PlayerCard`'s own unrendered `GameBlock`) and, through it, by `PlayerDay.tsx`, which is why the files stay and why rollup drops only the two shells (442KB → 425). See **Pitchers on the roster** for the two things that went off screen with them and have not been rehomed. `PlayerDetails` overlays a tabbed view: **Overview** (his season line, his day and his last five games — see its own section below; first in the strip and the tab the page opens on), the percentile card, a **Charts** tab holding the rolling-xwOBA chart (`RollingXwoba.tsx` — a client-computed rolling average over a 50/100/250-PA window, lazily fetched only when its tab opens; see **The Charts tab** below for why the strip names the kind of reading rather than the one card in it, for why the labels on that chart are sized in rendered pixels, and for why the league average is named in a legend under the chart rather than written across the plot), a pitchers-only **Arsenal** tab (also lazy — two charts and nothing else since the Pitch Usage butterfly and the Movement Profile cloud landed; it carried a `SeasonArsenalRow` per pitch and its own Overall / vs RHB / vs LHB `SplitTabs` until both turned out to be saying, in a table and a control, what the pictures say better — see **Pitchers on the roster**, *The Arsenal tab's two charts*), a **Game Log** tab (`GameLog.tsx`, lazy too — and lazy for the **Overview** as well, which draws five of its rows off the same one read; the whole season's games, newest first, in the app's one plain stat table outside the summary view. The table itself is **`GameLogTable`**, factored out so the tab and the Overview's preview are one component with `shown` and `totals` set differently rather than two tables free to drift — see **the player page's Overview tab** below: the counting stats per game plus the running **Szn** line (below), a `<tfoot>` season row summing **every** game rather than the page on screen (pinned to the bottom of the box, but **only on that axis**: its label spans four columns and carries `.glog-date`, the class that pins the date column to the left edge, so scrolling right slid the label along over its own totals and swallowed the first two stat columns — `left: auto` leaves it constrained on the block axis alone), and the feed's Load-more paging at `PAGE_SIZE` 25 because a batter's season is 150 rows inside an overlay that already scrolls. Its header row sticks to the top and the date column to the left, both at once — which is why this tab alone gives the overlay `.gamelog-mode`: a sticky header can only stick to the box that scrolls, and the box that scrolls has to be the table's own (its columns overflow a phone, and an `overflow-x` container scrolls in both axes whether you want it to or not), so the overlay becomes a fixed-height flex column — the shape `.app.summary-mode` gives the summary view — with the head and tabs holding their place. Zeroes are dimmed so the eye lands on the games with something in them. **Every row is a press that opens that game** — as a feed for a batter, as the outing page for a pitcher — and carries the hover tint and the pointer that say so — see **The Game Log's rows open the game** below, which also sets out why the rows deliberately carried no tint for as long as they did nothing. The zebra stripe is untouched: it is what keeps a fourteen-column row readable across, and it is the same device the other two wide tables use. The pitcher's SP/RP marker renders **only when the log holds both** — twenty rows of SP say nothing the IP column doesn't. **The batter's line leads with where he hit and where he stood** — `Batting` and `Pos`, adjacent and ahead of the counting stats, because both are game context of the kind the opponent cell beside them is rather than anything he did. They are **one fact read twice**: `Batting` is his index in the posted order and `Pos` is where that same start was made, so neither can claim he started when the other says he didn't, and a man who came on off the bench draws a dimmed `—` in both under one tooltip (`Not in the posted lineup`) rather than a position for a start he never made. A starter's reads `Started at C`. See **Date handling and server routing** for where the position comes from, why the split's `positionsPlayed` is gated on the lineup entry rather than trusted alone, and why the schedule's own per-game position — correct, and already fetched — was refused on payload. It costs the table **70px at 1200 and 39 at 390** on a log that scrolls sideways at both, and nothing at all in height.

The batter's line then **leads its stats on `H/AB`** — one cell where AB and H were two columns, the same shape the summary table's own `H/AB` uses. It spent a spell over **plate appearances** instead, on the argument that AB throws away the walk and the sacrifice, so a 2-for-4 night with a walk read `2/5` where the at-bat count alone calls it four trips. What that traded away is the thing this column is actually read for: **every other number on the line is over at-bats** — the `Szn AVG` three cells along, and the AVG and the SLG inside the OPS on the `<tfoot>` row underneath — so `H/PA` was the one cell on the row whose denominator nothing else on it shared, and a reader checking the .259 beside it found 117 over 524 rather than the 117 over 452 that made it. Over at-bats the cell and the average agree by construction, and the walk it was defending is not lost at all: it is the BB column four cells along, which is where a walk belongs. `2/4` with a `1` under BB is a five-trip night stated in the two places that own the two facts. **PA leaves the columns and not the row** — it rides the cell's tooltip (`0 hits in 4 at-bats · 5 PA`) and it is still what tells the two kinds of `0/0` apart, below. The `<tfoot>` follows the cell above it, being that column's sum: season hits over season **at-bats**, which is the very pair the AVG at the end of the same row divides. Checked in a browser against MLB's published season line, three batters end to end — Alonso `117/452` · .259 · .833, Soto `83/293` · .283 · .947, and Justin Dean `3/8` · .375 · 1.125 at the thin end of the scale — each identical to MLB's own; and league-wide, summing 9,023 game-log rows across 120 batters reproduces MLB's season AB and H for **all 120**, 0 mismatches. **What dims is `pa === 0`, not a bare `0/0`.** A man who appeared without coming to the plate — a pinch-runner, a defensive replacement — has nothing to read in this cell and dims whole, the way every other zero in this table does. Over at-bats a night that was one walk is *also* `0/0`, and it deliberately stays plain: he did come up and he did do something, and the cell can no longer tell those two apart where the row still can. That distinction is worth keeping rather than collapsing — in the same sample 309 rows are a genuine 0 PA against 97 that are `0/0` off a walk or a sacrifice, so dimming on at-bats would have quietly filed 97 real plate appearances as “not in the game”. Each says which of the two it is on hover, the plain one naming the trip it doesn't count (`1 PA, no official at-bat`). `decisionColor` moved from `PitcherCard.tsx` to `lib.ts` so the log's W/L/S/HLD chips take the same colors as the card's. **The Szn columns read in the order the two lines are read in.** A batter's are `Szn AVG · Szn OBP · Szn SLG · Szn OPS` — slash-line order, so the eye takes them the way a slash line is taken, and OBP and SLG sit between AVG and OPS rather than after it because a slash line with its middle terms at the end is not a slash line. **SLG had gone unspent for a while**, on the argument that `seasonSlg` — parsed and shipped by the route since it was written — is exactly `OPS − OBP` off the two cells beside it, so a column for it would be a fourth cell saying nothing the other three didn't already imply, on a table already sixteen columns wide on the pitcher tab. That argument proves too much: `AVG` is no less implied by `H/AB` two cells to its left, and the whole point of a slash line is that a reader wants the middle terms named rather than derived on the fly down a column of games. So it is a column now, between `Szn OBP` and `Szn OPS`, reading straight off the same `seasonSlg` the route has always sent (`toBatterGameLog`'s `s(st.slg)`, the same season-to-date field `seasonAvg`/`seasonObp`/`seasonOps` already are — checked against MLB's own published season line for Salvador Perez, `.216/.262/.369/.631`, exact on all four). A pitcher's are `Szn ERA · Szn FIP · Szn WHIP` — **the estimator immediately after the number it estimates**, which is the rule the pitcher card's season line and the research board's `ERA · xERA · FIP · xFIP` both follow, and the reason the pair must not be split. **WHIP comes after the pair rather than between them**, because it answers a different question: ERA and FIP are two readings of the runs, one of them scrubbed of the fielding behind him, and a number counting the traffic he allows has no business standing in the middle of that comparison. FIP is **null under three innings** — `fipLike`'s own rule, applied to the season-to-date innings — and dashes there, which on a reliever's log is his first outing or two and nothing else.

**The `<tfoot>` treats the two kinds differently, and the split is honest rather than tidy.** The batter's OBP and SLG are **recomputed from the totals** alongside the AVG already there, off the `hbp`/`sacFlies`/`totalBases` the row has carried for exactly this since it was written — the four cells are then one arithmetic over one set of sums, and the OPS at the end of the row is that OBP plus that SLG. SLG shares AVG's guard rather than getting its own: both are null (dashed `—`) only when at-bats is zero, since both are over at-bats and a season with none has neither. The pitcher's FIP and WHIP are **not** recomputed and are **not summed** — a season-to-date rate is not a summable thing, and the newest row's running value *is* the season, the log running to the last game played. So the foot takes `games[0]`'s. That is right twice over: it keeps FIP's one definition on the server, where the constant behind it lives, rather than restating `FIP_CONSTANT` in a table; and it cannot disagree with the row directly above it. Checked against MLB's published season line end to end — **Alonso** `.259/.353/.833`, **Soto** `.283/.408/.947`, **Ohtani** `.290/.392/.930` and **Ke'Bryan Hayes** `.138/.191/.425` on the batting side (newest row and recomputed foot alike, save the one hundredth of Ohtani's foot OPS, which is the pre-existing rounding of an unrounded `obp + slg` against MLB's rounding of each half first), and **Sánchez** `2.54 / 2.68 / 1.19`, **Alcantara** `3.52 / 3.83 / 1.17`, **Gallen** `6.34 / 5.36 / 1.56` and **Vesia** `2.81 / 3.10 / 1.18` on the pitching side, each FIP identical to the one the Season tab prints for the same man.

**`Szn SLG` checked the same three ways.** Salvador Perez's newest row reads `.216 / .262 / .369 / .631` — identical to MLB's own published season line (`avg .216, obp .262, slg .369, ops .631`) — and `.631 − (.262 + .369)` is `0.000`, so the row's own OPS is still exactly OBP plus SLG with the new column standing between them. Reconstructing the totals independently from all 113 of his game-log rows (`totalBases / ab`) gives the identical `.369`, matching both the newest row's running figure and the `<tfoot>`'s own recomputation — which is the same "a season-to-date line through the last game is the season" agreement the OBP and OPS cells already had. **Measured at 390px and 1200px on the real log, before → after the column**: the batting table goes **771.53px → 836.86** at 390 and **1233.25 → 1329.36** at 1200 — one more numeric cell, ~65px at the narrow end and ~96px at the wide one where the gutter clamp is looser — against a scrollport that was already going to scroll on this table at every width checked; the header row still reads `… Szn AVG · Szn OBP · Szn SLG · Szn OPS` in that order, the pitcher's log is untouched (fourteen columns, no `Szn SLG` anywhere, since a pitcher's line has no batting average to slug), and the **page body and the overlay both overflow by 0** at both widths, before and after. **Bundle: 494.02 → 494.18 KB of JS** (146.19 → 146.22 gzipped), **CSS unchanged** at 115.61 KB (20.54 gzipped) — one cell in two components and an array entry, against a page that was already going to scroll.

**Measured at 390px on the real log**: the batting table goes **688px → 753** for one column and the pitching table **659 → 789** for two, against a 390px scrollport that was always going to scroll — and the page body overflows at **no** width (checked 320 / 390 / 640 / 1200 on both tabs, document overflow 0 at every one). The two sticky axes are untouched at every one of them: the date column pins at **0** from the scrollport's left edge with the table scrolled to its far right, and the header row at **1px**, which is the border.  It carries the same **full-page button** the other two wide tables do, inline in its Date header — the corner cell, pinned on both axes, so it is the way out as well as in; expanding now drops nothing but the app's own chrome, the log having stopped capping itself), a **Stats** tab — the research board transposed onto one player, five spans down the side and the board's own columns across (see **The Stats tab: the board, transposed** below) — and a **Splits** tab, which is that same season cut by *handedness* instead of by time: one diverging bar per stat, pointing at the side he is stronger against (`components/PlatoonSplits.tsx`, and **The Splits tab** below for the whole of its reasoning). Those two were one tab until the platoon card became a comparison rather than a table; `SeasonPanel` / `PitcherSeasonPanel` and their `.split-block` stat pills are gone from `PlayerDetails.tsx` with it, and the `.split-block` / `.stat-pill` rules are now read by nothing that renders — `PlayerCard.tsx`'s `PlatoonSplit` was their last live caller, and the feed's Upcoming row draws `BatterSplitsTab` instead. The player page is a fixed full-screen overlay with its own scroller, so it pins the body (`hooks.ts::useLockBodyScroll`, restoring the scroll on close) and sets `overscroll-behavior: none` — without both, scrolling it chained through to the list behind and closing it landed the user somewhere they never scrolled to; `none` rather than the `contain` that stood here for a while, since that stops the chaining and keeps the overlay's own iOS bounce (see **A table stops when its rows do** above). `GameReel`'s `.reel-view` is the same shape and does the same. `PlayerAdder` searches the season roster; the settings menu's **Edit players** entry swaps the card list for `PlayerOrderEditor.tsx` — a drag-to-reorder screen showing only each player's number, headshot, name and a remove button. It drags via Pointer Events (mouse + touch). **On touch only the ⠿ grip starts a drag** — `touch-action: none` sits on `.order-grip` alone, so a finger anywhere else on the row scrolls the list as usual (with it on `.order-row` the whole page was unscrollable in edit mode); a mouse has no such conflict and can still grab the row anywhere (`startRowDrag` bails on non-mouse pointers, the grip stops propagation so one press starts one drag). It reorders the live list as the dragged row passes another (the row under the pointer is found with `elementFromPoint`; the dragged row sets `pointer-events: none` so it resolves to its drop target), auto-scrolls the page while a drag is held within `EDGE_ZONE` of the viewport top/bottom, and persists the order (`PUT /api/watchlist/order` — the roster's route, old name and all) once on release. Each row's ✕ removes that player: two taps, the first arming the button into a red "Remove?" (a row you drag shouldn't delete a player on one stray tap, and there's no undo), the second calling `App.tsx::removeFromEditor` — which drops him from `reports`/`reportsRef` immediately so the row goes before the roster-triggered refetch lands, and so a drag right after commits the order without him. The button stops `pointerdown` propagating, or the row's drag handler would `preventDefault` the click away. That button is **`RemoveButton.tsx`**, shared with `PlayerDetails`' header so the roster's one destructive control looks and behaves the same wherever it appears — controlled rather than self-arming, because the editor keeps a single armed row across the whole list. Edit mode is transient — deliberately **not** in the URL — and clears on a view switch. There is no longer a player-nav strip; a player can also be removed from `PlayerDetails`.

### Which hand, on the heading

**The page's `<h1>` says which way he does it, right after where he does it** —
`RHB` / `LHB` / `SH` on a batter's page, `RHP` / `LHP` on a pitcher's, beside the
position chip. That line is already the page's run of facts *about him* — the
position, the padlock, the newspaper — where the cluster on the right is things
you *do* to him, and a hand is as plainly one of the first as the position it
follows. The vocabulary and the one-token-per-kind rule are `lib.ts::handCell`;
where the fact comes from is **Data sources**, *Handedness rides on the season
roster*, which is also why this page can say it about a man nobody has rostered.

**It says it at the tables' width, and that is the one place this parts from the
chip beside it.** The position chip is here *in full* because the board's cell
may truncate a six-position list and this never does — the two read one fact at
two widths, which is that chip's own argument. A hand is not a list. `LHB` is the
whole of it, so there is no longer form for the page's extra room to buy, and
spelling out `Bats left-handed` here would hand the reader a second wording to
learn for a fact they already recognize from every row they arrived through. The
sentence is the `title`, where it costs the heading nothing.

**Text, not a second chip.** `.player-pos`'s ground and border are what this page
uses to mean *position*, and `LHB` inside one would read as a place he can be
started — so the token keeps that chip's type and spacing and gives up the box,
in the same `--faint` the two tables give it and a step behind the position for
the same reason it is a step behind it there.

**Drawn twice, for the reason `posChip` is**: the Game Log's own head puts the
identity back when that table takes the page and covers this one, and a head that
dropped the hand would be the same man reading two ways depending on which was on
screen.

**It costs the heading nothing, including on the names that were already
wrapping.** Measured at 390 and 1200 with the token stripped out of the same page
at the same instant, the `<h1>` is **28 → 28px** on Aaron Judge, Paul Skenes and
Ozzie Albies at both widths; and on the three longest names in the league it is
**77 → 77** (Christian Encarnacion-Strand, Simeon Woods Richardson) and **49 →
49** (Deyvison De Los Santos) at 390 — they wrapped before this and wrap no
further for it — with 28 → 28 at 1200. Page and view overflow **0** in every one.
`.details-name` is a wrapping flex line, so the heading gives way at a width
rather than overflowing.

**Every case was driven rather than reasoned about**, at 390 and 1200: `RHB`
(Aaron Judge), `LHB` (Corbin Carroll), `SH` (Ozzie Albies), `LHP` (Chris Sale),
`RHP` (Paul Skenes) — and the two-way player on both of his pages, **Ohtani's
batter page reading `LHB` and his pitcher page `RHP`**, which is the rule stated
as a measurement. With `/api/players` blocked the chip is simply absent and the
heading is 28px, which is the honest answer for a fact the app has not been told.

**Both tokens have since come off the heading and onto their own line under the
name** — `.details-sub`, between the `<h1>` and the Rostered caption. Everything
above is the record of *why* the hand belongs beside the position and what it is
allowed to look like, and none of it moves: same `posChip`, same `handChip`, same
vocabulary, same order, still built once and still drawn a second time in the
game log's own head. What changed is the line they sit on. Inside the `<h1>` they
were read as part of his name at a glance — the heading is 24px/800 and they are
12px, but they are *in* it — and that heading was also carrying the padlock and
the newspaper, marks a reader can **press**, where these two are only
description. Split, the heading is his name and the things you can do on it, and
the line under it is the standing description of the man, immediately above the
Rostered line, which is the same kind of thing and was already argued into that
position for the same reason. It is `PlayerIdentity`'s `.row-id-sub` one page
along — club → position → hand, minus the club, which the head's own portrait has
already said at a size the row's 14px mark exists to stand in for — so the page
and the row a reader arrived through state one fact in one order.

**What it costs the pinned head, measured at 320 / 390 / 1200 on a batter (Aaron
Judge) and a pitcher (Logan Gilbert), reading `.details-chrome` off the rendered
page and rebuilding the previous DOM in the same tab at the same instant.** The
head is **139 → 165px at 1200** and **193 → 219 at 390** on the pitcher — **+26**,
the 21px line plus its 5px margin — and the before figures are the same 139 and
193 this file already records for `--details-chrome-h`, which is the check that
the reconstruction was honest. **Where the tokens had been making the heading
wrap, it costs less than half that**: on Judge at 390 the `<h1>` is **43 → 28**
and the head **208 → 219**, and at 320 both men go 43 → 28 and **223 → 234** —
**+11**, because a wrapped 24px line came off the heading and a 21px line went
under it. `--details-chrome-h` and `--scroll-offset` track it (the hook
re-measures), so the pane below starts **157 → 183 at 1200**, **211 → 237** and
**226 → 237 at 390**, **241 → 252 at 320**; against a 900px viewport the pane on
screen goes 761 → 735, 707 → 681 / 692 → 681, and 677 → 666. Page overflow and
the overlay's own are **0** at every width, before and after.

**The line is always drawn and reserves its own box.** The handedness map is null
until the boot request lands and a position can be missing outright, and this
head is pinned chrome over a scroller: a line that appeared a beat after the page
did would push everything under the reader's finger. So with neither token to
draw, a hidden `.player-pos` holds the height instead — the box is **laid out
rather than declared**, which is the app's standing rule for a height that is a
function of a font this app does not choose. Measured with both tokens stripped
from the rendered page: the line is **21px** and the head **234 / 219 / 165** at
320 / 390 / 1200 — identical to the three figures above in every cell. And
sampled every 100ms through the boot, 91 samples over 9 seconds on both men at
both widths, the line is 21px and the head its final height from the **first
sample at ~160ms** and neither moves again.

**Bundle**: JS 578,644 → 578,803 raw and 170,626 → 170,661 gzipped; CSS 155,432 →
155,621 and 27,795 → 27,841. +159/+189 raw for a line of markup and a rule, most
of it the comments.

**Three forms were rejected before this one.** A **sentence** — `SS · B: R / T:
R`, or `Bats right-handed` spelled out — because the extra room a new line buys
is *width*, not a reason to say a three-character fact in three words, and
because it would hand the reader a second wording for something they already
recognize from every row they arrived through; the sentence is still the `title`,
where it costs nothing. A **second bordered chip** for the hand, which the
section above already refuses and the move does not make any safer — a grounded
pill beside a grounded pill still reads as two positions. And **completing
`.row-id-sub`'s trio with the club mark**, which would put the team twice on a
head whose portrait is a capped headshot.

**The chip beside a card's name is his ESPN eligibility**, whenever a league is connected — the same swap the research board's pills and Pos cell made, arriving on the cards for the same reason. MLB's one word is the wrong answer to the question a card in this app is read with: it is single-valued where a fantasy position is not, it is sometimes flatly different (Curtis Mead is listed at 2B and is eligible at 1B and 3B), and on a **pitcher's card it was `P`** — one letter, true of everybody on the tab, where `SP` and `RP` are the distinction a reader actually wants. Without a league, or for a player ESPN can't be joined to, it is MLB's listed position exactly as before, so nothing changes for a user without one. It costs no fetch: the map rides on the `/api/espn/ownership` response the board and the player page already read (see **ESPN fantasy league**, where the read losing its laziness is set out).

**Narrowed to the card's own kind** (`lib.ts::eligibleForKind`), exactly as each board is: a two-way player's bat reads `DH` where his arm reads `SP`, and the mis-joined Fernando Cruz reads his fallback rather than `2B/SS` on a pitcher's card. **And capped at two codes and a count** (`positionCodes`, which is now the *card's* rule alone — the board's cell prints the list whole and takes only the shared hoist, `positionOrder`, from it), because a card's header is a name and this chip on one line: measured on a real roster at 390px, the uncapped list wraps **8 of 14 names** and at 360 **13 of 14**, against the 1 and 3 that wrap today; capped, the worst the league can produce (`1B/2B+3`) wraps 3 and 6, and the roster as it actually stands wraps 2 and 3. The whole list is on the chip's `title` and printed whole on the player page, which is the one place with room for it.

**The card header summarizes the range in view, not the season.** Everything under it is about the days the calendar names — the game blocks, the plate appearances, the aggregate on the right of the header itself — and the line under the player's name was the one thing on the card describing a different span: a week in which a hitter went 3-for-19 still read `.932 OPS, 27 HR, 72 RBI, 85 R, 30 SB`, because that is his year. It now reads `6 G · .158/.200/.158` (`rangeBattingSummary`) and, on a pitcher, `4.50 ERA, 1.17 WHIP, 35% K, 9% BB` (`rangePitchingSummary`) — the same games the card's own contents add up to. **The season is not lost**: the details view's **Season** tab shows it whole, a tap away, with the room to pair each estimator with the number it estimates, which a line meant to be scanned never had.

**The slash rather than the counting stats**, because the counting line sits in the same header a few centimetres to the right (`lineSummary` — `3-19, 1 R, 3 RBI, BB, K, .358 OPS`) and the two halves of a slash line are the one thing it cannot say. Its own OPS is left out for that same reason: the line beside it already ends in one, and this is that number's two halves. On the pitcher side K and BB are shares of **batters faced** rather than the season line's per-9 rates — a range can be a single appearance, and one inning turns K/9 into 18.0 where a share of the men he faced reads the same at any sample, and it is already the vocabulary of the card's own Rates strip below. Checked at 390px on a real watchlist: both lines sit under the name without wrapping, which is the constraint that took the estimators off the old season line in the first place.

**One game in view is named rather than added up.** Within a single day a card holding one game puts the matchup there instead — `KC @ LAD` — because a final's status badge carries the score and not the teams, so this is the only place the card says who was played; the aggregate takes over exactly where the pitcher card's `onePitchedGame` already stopped, and on the **range** rather than the game count, so a starter's week and a reliever's week read the same way (see **Pitchers on the watchlist**). The batter's test is the same shape (`oneGame`, `singleDay && played.length <= 1`), and the status badge then drops its own `withMatchup` copy of the teams, which would be them twice on one row.

**With nothing yet to add up, the game info takes the slot.** A range he hasn't played in has no line to print and used to print the season's; the line now names the game instead — the matchup where there is a single one to name, `ATH · 3 games` where there are several — which is the whole of what such a card is about and costs the row nothing, where a line of dashes plus the same fact stated below would cost it two. On a pitcher's no-outing card that line is joined by the opposing probable (`vs LHP Thornton` — `ProbablePitcher`'s `opposing` prop, which changes only the tooltip, the wording being right either way) and the first-pitch badge, with the lineup waiting for him below; the **SP pip stays on the headshot** rather than becoming a chip beside the name, and now shows on any range holding one game rather than only on a single day, a pip belonging to a game and not to a date. The batter card takes the pitcher's `.empty` rule with it: the dashed border claims nothing is coming, so it belongs only on a batter who can't still come to the plate. That is reachable there for a postponement alone — a range of finals with no plate appearance in it is `didNotAppear`'s card, which was already dashed.

### Every tab's read is lazy now, including the percentile card's

**The percentile card was the one eager fetch on this page and it was the
dearest of them.** Six of the seven tabs read on first open — the day, the game
log, the news, the windows, the arsenal, the rolling series — and `percentiles`
fired on **mount**, whatever the reader was looking at, for a card that is not
the tab the page opens on.

**What it costs, measured on a player nobody had opened**: `/api/percentiles`
**1.07s** against 0.16s for the splits and 0.05s each for the day and the game
log, and **2.15s** on another. It is a Savant player-page scrape, so it is the
slowest thing on the page by an order of magnitude and it was on the critical
path of every open — including from a research-board row, where the reader is
skimming strangers and may open a dozen.

**And a page that opens is a burst rather than a queue.** Opening anybody fired
**five** requests in one tick (percentiles, splits, day, game log, news) plus
App's own `/api/statuses`; behind one Lambda, which handles one request per
instance, those do not overlap so much as queue or cold-start alongside each
other. Taking the dearest of them off the burst is worth more than the second it
saves on its own.

**`splits` stays eager, and that is not an inconsistency**: the Overview's own
season strip reads it, so it *is* the visible tab's data — which is the same test
that makes the game log and the news eager-for-Overview (each is previewed
there) and the windows lazy.

**The mechanics are the six tabs' own, restated in one place.** A `pctReq` ref
keyed `${kind}-${playerId}` so a re-open of the same tab is free and a two-way
player's two cards are two reads; `loading` starts **false** rather than true,
since nothing is in flight until the tab is opened; a failure clears the ref, so
re-opening the tab retries; and the per-player reset clears the ref and the data
with the other six. Nothing else on the page reads `data`, `loading` or `error`
— all three appear only under `tab === 'percentiles'`, which is what made this a
change of *when* rather than of anything drawn.

**Measured in a browser at 1400×950 against the real server**, before → after:
opening a player fires **5 player requests → 4** and the percentile scrape moves
to the tab that draws it (2,151ms there, on its own, with the page already up).
Pressing the tab twice fetches once; leaving the tab and coming back draws from
what it has — which was measured on a read that had already landed, and is the
half of it the section below is about.

### Leaving a tab mid-read hung it, for ever

**Reported as the percentile tab hanging "sometimes", and the sometimes is a
race with one's own reader.** That card is the slowest thing on the page — a
Savant player-page scrape, measured at 1.07s and 2.15s on two players against
the 0.16s the splits take and the 0.05s the day and the game log do — so it is
the one tab with a window wide enough to get bored in and press something else.
Doing that is what hung it.

**One shape, seven copies, and the mark was the bug.** Each lazy read marked its
ref *before* firing and bailed on a later run that found the mark, while the
answer was gated on a `live` flag the effect cleanup clears. Switching tab runs
that cleanup, so the answer was thrown away with the mark still standing; coming
back found the mark, returned early, and left `loading` **true** with no second
request coming. The wait is `useDelayedFlag(loading)`, so `Reading the percentile
card` stayed on screen for the life of the page, and nothing short of a reload
undid it.

**Reproduced before it was touched**, against the built client with the
percentile read held 2.5s in the page: press the tab, press **Splits** 400ms
later, come back once the read has landed — **`Reading the percentile card` at
t+1s and still at t+6s, 0 rows**, against the control (press it and stay) which
draws its **35 rows**.

**It is the trap this repo has now written down four times** — `auth.tsx`'s
`exchangeOnce`, the research board's scroll memory, and the matchup page's two
reads, whose passage states the rule outright: *never mark a request answered
before it is answered, or unmark it in the cleanup*. Each of the first three
found it through StrictMode's double invoke, which is a **development** thing
and is why this one looked new: the percentile effect fires on a *tab press*
rather than on mount, so StrictMode never doubles it and the only way in is a
reader switching away — in production as readily as in dev.

**So the ref is the test, and the `live` flag is gone from all seven.** An answer
lands if `pctReq.current` still names the request that asked for it, which is
false in exactly one case — the player or the kind changed under it, which is
when a landing answer really is stale (the per-player reset nulls every ref).
Leaving the tab changes neither, so the answer lands, and coming back finds the
card rather than a wait. **`.then(ok, err)` rather than `.catch().finally()`**,
which is not a preference: the error path nulls the ref so a re-open retries,
and a `finally` reading that ref a moment later would find its own `catch` had
just nulled it and skip clearing the wait — the same hang by the other door.

**The eager splits read keeps its `live` flag**, correctly: it has no mark to
bail on, so every player change re-runs it and clears its own wait, and the flag
is doing the one job it is right for — dropping a superseded player's answer.

**Two reads also gained `playerId` in their deps.** News and Arsenal listed
`[tab]` alone, so on a player change the reset nulled their refs and nothing
re-ran them: a page opened on a new player from the Overview's own
scheduled-game link kept an empty News tab — and with it an empty News block on
the Overview — until some tab was pressed. The other five were already keyed on
the player.

**And the rest of the app was swept for the same shape.** `let live = true`
appears in six other components and none of them is this: five have no
persistent mark at all, so a dep change re-runs them and resets their own wait,
and `PlayerOverview`'s `asked` set is a **press handler** with no cleanup, whose
deliberate unmark-on-failure is argued where it sits.

**Measured after, same build, same 2.5s hold**, at 1200×900:

| | before | after |
| --- | --- | --- |
| percentiles — away mid-read, then back | wait at t+6s, 0 rows | **35 rows, no wait** |
| … away and back three times over one read | — | **35 rows** |
| … press and stay (control) | 35 rows | 35 rows |
| Stats / Game Log / News, away and back | — | **5 / 25 / 11 rows** |
| Charts and Arsenal, away and back | — | **drawn** (in flight at 1s, there by 4s) |
| a 502 on the read | — | `Couldn't load percentile rankings: Upstream is having a day` |
| … re-opening the tab after it | — | **retries and draws 35 rows** |

**Bundle: 549.91 → 549.74 KB of JS** (162.93 → 162.96 gzipped), CSS unchanged —
seven cleanups removed and a guard put back, which nets to nothing.

### The player page's Overview tab: the player as a summary page

**It was his day and nothing else, and one thing is not what a page opened on a stranger is opened for.** A research-board row is a man you are deciding about, and the three questions under that decision are *how good is he*, *what is he doing* and *how has he been going* — of which the tab answered the middle one and left the other two behind two more tabs. So it is three blocks in that order (`PlayerOverview.tsx`), each a summary with a door to the tab that holds it whole:

1. **Season** — the box-score line a roster decision actually turns on, with a `Stats →` link.
2. **Today** — his day, unchanged and drawn by `PlayerDay` exactly as before, or the **next game** he has when the day holds none.
3. **Last 5 games** — the Game Log tab's own table, five rows of it, with a `Game Log →` link.

**Not one of the three is a second copy of anything, which is the property the whole change was arranged around.** The season line is the very object the Stats tab draws, handed *down* from `PlayerDetails` rather than fetched again — it is already in flight when the page opens, and a second read would be a second answer free to disagree with the tab it summarizes. The day is `PlayerDay`, which is the feed's own items. And the five rows are `GameLogTable`, factored out of `GameLog.tsx` for this and used by both drawings, so the column lists, the cells, the zebra stripe, the two sticky axes and the press that opens a game have one definition. The pieces live where their family does and are imported out of it, the rule `LiveFeed.tsx` and `PitcherCard.tsx` already follow.

**The game log's read moved up a tab and did not become a second one.** `PlayerDetails` gated it on `tab === 'gamelog'`; it is now `'gamelog' || 'overview'`, keyed as before on `${kind}-${playerId}`, so one read serves both and crossing from the summary to the full log is free — and the two can never show different rows, which two independent fetches half an hour apart could. **`GameLogPreview` holds no data of its own**; it is handed the same `log` object.

**Only two things differ between the preview and the tab**, and both are `GameLogTable` props rather than a fork. `shown` is 5 against the tab's paging 25 — five rows is the shape of "lately", enough that a slump or a hot week shows and few enough that it stays a glance. And `totals` is off: the season row sums **every** game in the log rather than the rows on screen, which is right under a table that pages toward it and a non-sequitur under one whose heading says five. The `corner` prop is what the tab puts its expand button in; the preview passes none. Measured on a real pitcher at 1200: the preview draws 5 body rows and 0 foot rows, the tab 25 and 1, and the tab's expand button, `--table-bleed: 12px` full-page box, `.expanded-chrome` and its place in the Escape ladder are all unmoved (checked: expanded → one press leaves full page with the player page intact, a second closes the player).

**The season strip is `.glog-table` outright rather than a lookalike.** The app has one plain stat table and this is a one-row instance of it, so the class is reused and only three things come back off (`.ovw-table`): the pointer and the hover tint, which say a row is a press — the game log's rows open a game, this one is a line — and the body row's bottom border, which under a single row is a rule sitting a pixel above the box's own. Checked in a browser: `cursor: default`, `border-bottom-width: 0px`, against the preview row's `cursor: pointer` and `role="button"`.

**The tab takes the tab's width and the reading column moved inside it, which is a reversal of what stood here.** This paragraph used to explain why `.details-overview` declared **`--table-bleed: 0px`**: the bleed is always the *container's* own side padding — 22px on `.app`, 16 on the overlay, 12 in the full-page box — and a centered `--card-column` has none of its own, so the 16px it would otherwise inherit belongs to the overlay rather than to it and the tables would have hung out of a column every other block lines up with. That arithmetic is still exactly right, and it was an answer to the wrong question: it argued about how far the tables may bleed **out of the column** while taking for granted that they belonged in one.

**Two of the three blocks are not cards, they are stat tables**, and a stat table is the one thing in this app that is *scanned* rather than read — which is why the Game Log tab beside it dropped its own cap, why the summary table and the research board take the window, and why `--table-bleed` exists at all. Measured at 1200 before the change: the Overview column was **800px wide with 200px of empty overlay either side of it**, and the five-game table was **1,174.92px inside it** — a table scrolling sideways past `K`, `RBI` and the three `Szn` columns with 368px of nothing to its right. At 1920 it was worse in proportion: 1,327.84 inside 800, overflowing its pane by **528px** with 560px spare on each side.

So `.details-overview` loses its cap and inherits the overlay's own 16px bleed, and the cap moves to the **reading blocks** — the day's items are the feed's cards and were sized against `--card-column` in the first place, and Projected Starts and News are prose. The container goes with it: `container-type: inline-size` sits on the capped box rather than on a tab that is now as wide as the window, so a card reads its own column and cannot take the phone layout at one width and the wide one at the next for reasons nothing on screen could explain.

**That cap first went on `.details-overview .player-day`, one box *inside* the day's section, and putting it there was half a fix** — see *The reading blocks share the tab's center, not its left edge* below, which is the other half.

**Measured before → after, at 390 / 1200 / 1920.** The two `.glog-scroll` panes go 358 → **390**, 800 → **1200** and 800 → **1920**, each bleeding to the window's edge exactly as the Game Log tab's does; the five-game table's own overflow inside its pane goes **361 → 329** at 390 (a phone was always going to scroll a fourteen-column log), **372 → 0** at 1200 and **528 → 0** at 1920. The day's column is unchanged at **800px** (and the view's own width on a phone), the headings and the `Next game` line still sit at the overlay's 16px gutter, and the page body and the overlay both overflow by **0** at all three widths. **The Game Log tab is byte-identical** either side of the change, which is the thing that had to be true of a shared component: at 390 and 1200 its wrapper is 358 / 1168 at x=16, its pane 390 / 1200 at x=0 with a −16px bleed, its table 771.36 / 1233.08, its rows 44.55px, its date column pinned at 0 and its header row at 1px.

#### The reading blocks share the tab's center, not its left edge

**Reported as: the sections above the two tables are too far left on a wide screen.** They were, and the measurement says how far: at 1920 the tab is 1888px and `Today`, `Projected Starts` and `News` were **800px at x=16** — the top of the page occupying its left 42% — above two tables running the full width, every heading flush at x=16.

**Neither width is negotiable, which is what makes this an alignment question rather than a sizing one.** The Season and Last-5 blocks are stat tables and take the window, for the reason the passage above argues at length. The other three are the other kind: the day's items are the feed's cards, and a headline over a standfirst is read across a line rather than scanned down a column. A tab that holds both genuinely has two column widths in it.

**What was negotiable is the axis they share, and the left edge was the wrong one.** Sharing a **center** makes the whole tab symmetric about one vertical line, where flush left made half of it under half as wide as the rest and stranded it in a corner. So `.ovw-day`, `.ovw-starts` and `.ovw-news` take one rule — `max-width: var(--card-column); margin-inline: auto` — and the two tables go on taking the window.

**The strongest argument for it is that every other tab on this page was already doing it**, which came out of checking the change had not reached them. Measured at 1920: Percentile Rankings, Splits and Charts each sit in a **680px column at x=620**, and News in an **860px one at x=530** — centered, all of them. The Overview was the one tab whose content hugged the left edge, and it did so because its cap sat on a box *inside* a section rather than on the section.

**Which is the fault the class fixes.** The cap was `.details-overview .player-day`, so the day's *items* were 800 wide while the `TODAY` heading above them was the full 1888 — centering `.player-day` alone would have centered the content and left the heading behind. The section carried no modifier to reach it with, so it has one (`ovw-day`), and the three caps fold into a single rule. `.ovw-starts` and `.ovw-news` were already section-level and each keeps its own comment, the half that says why *that* block is a reading column.

**The head row travels with its block, which is the rule those three already had** and is what keeps the result coherent rather than merely centered: `News →` still sits over the right edge of the rows it opens and `Stats →` over its own table's, so the two left edges differ by design while every block is centered on the same line.

**Measured before → after, at 390 / 900 / 1200 / 1440 / 1920.** The three blocks' x goes **16 → 560** at 1920, 16 → 320 at 1440, 16 → 200 at 1200 and 16 → 50 at 900, each 800 wide throughout and each centered on the tab's own axis to the pixel (560 + 400 = 960 = 16 + 1888/2). **390 is unchanged to the pixel** — x=16 at 358 wide, a block narrower than its cap having no free space for an auto margin to split — so a phone needs no media query and gets no change. The headings read `Today@560 · Projected Starts@560 · News@560 · Season@16 · Last 5 games@16` on a pitcher and the same less the middle one on a batter.

**Nothing else moved, which is the half a shared `.player-day` most easily breaks.** The day's container is **800px at 1920 and 1200 and 358 at 390 with `container-type: inline-size`** — identical to before, so the cards' own container queries resolve exactly as they did. The two panes still bleed to the window (0 → 1920 and 0 → 390), the tables are the same width, and the page body and the overlay each overflow by **0** at every width on every tab. The six other tabs are byte-identical at all three.

**Bundle: 559.84 → 559.85 KB of JS** (166.28 gzipped either way) and **151.82 → 151.79 KB of CSS** (27.21 → 27.22) — the CSS *falls*, three `max-width` declarations having become one rule.

**The blocks are `.ovw-block`, and each heading is the percentile card's small caps minus the rule under it** — a block here closes on a table with its own border, so a second line above it would be two edges a few pixels apart. The links are text in the accent rather than buttons: they change which tab is on screen, which is what the strip above them does, so a button would be a second control competing with the tab it points at.

**Measured at 1200 and 390, on a batter, a starting pitcher and a reliever**: no horizontal overflow of the page or the overlay at either width (0 and 0 on every one), the season strip fits its column without scrolling at both (800 and 358), and the preview table scrolls inside its box exactly as the tab's does (1209 and 730 inside 800 and 358). The links work: `Stats →` lands on the Stats tab with the view scrolled back to the top, `Game Log →` on a 25-row log with its season foot, and a press on a preview row opens that game at `z-index: 51` — the layer `DialogLayerContext` gives a box opened inside the overlay, untouched by any of this; it was `PlayerDayModal` for both kinds and is that for a batter and the outing page for a pitcher. **Bundle: 436.13 → 440.52 KB of JS** (129.23 → 130.31 gzipped) and **96.75 → 97.97 KB of CSS** (17.33 → 17.52), which is 4.4KB and 1.2KB raw — 1.1KB and 0.2KB over the wire — for two new blocks, a route and a component that replaced a copy that was never written.

#### The day, which is the block that did not change

**`PlayerDetails` still leads with his day**, before the percentile card and the season readings beside it — `PlayerDay.tsx`, drawn from the feed's own items and fed by `/api/players/:id/day`.

**It is the feed's grouped reading, and the Games view before that, arrived where it belongs.** Games was a card per player over the range; the feed's grouping was the same card on the same days; both were pages *about a player*, and the app already had one. What that page adds is the whole of the argument. It opens on **anybody** — a research-board row, a name in a feed item, a headshot on the summary table — where the grouped feed could only ever draw the players on your roster; and it carries the season beside the day, so "what did he do tonight" and "how good is he" are two tabs of one page rather than two pages that never met. The grouping's own strongest claim was that a sort order is not a page, and the same test finishes the job: one player's day is not a *view of a roster*, it is a fact about a player.

**Nothing about the drawing is new**, which is the property that had to be preserved rather than the code that had to be reused. The items are `FeedItem`, `LiveEntry` and `UpcomingRow` exactly as the stream renders them, and what happened to him is **`playerDayEntries`** — a function `LiveFeed.tsx` exports and *itself* uses, fanned across a roster and re-sorted by clock for the stream and called once for this tab. So the two readings cannot come to disagree about what happened, which is the same guarantee the grouped reading bought by deriving itself from the flat one, held by a smaller and more honest mechanism: one function rather than one bucketing pass over three collections. The pieces live in `LiveFeed.tsx` and are imported *out* of it, the way `PlayerCard.tsx` and `PitcherCard.tsx` already supply their parts *to* it — a component's home is where its family is, not where it happens to be rendered.

**The items are drawn `grouped`**, which drops their identity row: the page's own head has said the headshot, the name and the position chip once, and saying them per play is what the grouping was always for. That prop already existed and already had exactly this meaning, so nothing about the item shapes moved.

**The day is a card per game, and the plays are behind it.** It used to be the plays themselves, under a static header per game, and that was the tab spending its whole height on one thing: a day is one game almost every time, so what it opened on was a date line and then four or five at-bat cards with a clip apiece. Measured on the same batter and the same day, the tab is **384.75px → 44px at 1200 and 432.75px → 44px at 390**; on a pitcher it is **86 → 44** and **137 → 64**. That is the *lead* of a player page, and the first thing a lead should answer is "what did he do today", which is his line and how the game stands — the plays being the follow-up question.

So a game is a **card** (`.pday-game`, **folded into `.feed-item-toggle`'s selector lists** rather than restyled to resemble the bar it is: a full-width row carrying a line and a status badge, pressed to open what is behind it) carrying the date, his line for the game and `GameStatusBadge`, and a press opens that game — the feed for it in a dialog on a batter, the outing page itself on a pitcher (below). Nothing was cut — everything the tab drew is one press away — and a doubleheader now reads as two things rather than as one long scroll with a rule through the middle of it.

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

**Under a `gamePk` it was worse than a duplicate, which is the half a screenshot of the Overview tab would not have shown.** In the Game Log's popup the section *is* the plays, and with the pinned entry already filtered out of `entries` there were none — so `PlayerDayGameFeed` fell through to its empty case and printed **`Not in the game yet.`** beneath a bar saying he was on the mound in the second. The popup drew the live item with `detailInline` instead, which was the rule that box already applied to a finished outing: it is about one game, so the innings read in it rather than behind a second press. **That case is unreachable now and the flag is gone**, a pitcher's Game Log row opening the outing page directly — so the popup is a batter's alone and `livePitching` is the guard that still keeps his own live at-bat from being drawn twice.

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

**The strip is seven tabs now, and eight on a pitcher** — five and six when Overview joined it, six and seven when Splits did, and seven and eight since **News** (below). *(Eight and nine since the **Schedule** tab, which is second in the strip — see **The Schedule tab: what he has coming** below, where the same measurement is re-run on all nine. The sentence is left as it was written, this file's rule for its own superseded arithmetic.)* It has needed nothing structural on any of the three occasions: `.details-tabs` already scrolls sideways and already scrolls the active tab into view with a 24px peek. Re-measured after News at **1200×900 and 390×844, on a batter and a pitcher, clicking every tab in turn**: all 7 and all 8 land **fully inside the strip** when selected, the tab's own column is `--card-column` less the overlay's gutters (358px), and the page body and the overlay each overflow by **0** at both widths.

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

**A thin record is no longer a refusal — it is his club's rotation, marked as
such.** `too-few-starts` used to mean "under three starts of his own, too thin a
median", and that pitcher — a call-up, a man traded in last week, a fifth starter
two turns into the job — got his one announced row and a shrug. He now takes the
cadence pooled over **his club's** recent starters and a third tier of row saying
so. It is a good stand-in and measured twice: where a pitcher has both, the club's
figure equals his own for **207 of 225** (92.0%), and blinded against real
announcements the club cadence lands his actual next start **9 of 9**, against the
own cadence's 41 of 51 exact and 51 of 51 within a day. What survives under the
old name is the case where *neither* can be read, which past the opening week of a
season is a club whose games we have not got.

**What it refuses to guess**, which is five different facts about the pitcher and
so five different sentences (`ProjectionRefusal`). `not-a-starter` — he has
started nothing. **`off-roster`** — he is on the IL, in the minors or otherwise off
the active roster, so he is not making a start his slot happens to fall on; that
is the feed's Upcoming rule (*"someone off the active roster — hurt, suspended,
optioned — is in none of them"*) and it earns its keep, 10 of the 170 pitchers with
a slot on a checked board being in that state. **`new-club`** — he has a full season
of starts, every one of them is the club that has since traded him, and this one
has not named him, so there is nothing to anchor on here yet; checked on the live
season, Kris Bubic's nine starts are Kansas City's and his club is now the Dodgers,
and reading that as `not-a-starter` would have printed "he hasn't started a game
this season" over a man with twenty-odd turns behind him. `out-of-rotation` — his
last start was more than two turns ago, which is a man something has happened to
rather than a man with a slot. And `too-few-starts`, above. **Whatever is announced
still comes back in every one of those cases**, because an announcement is a fact
whatever we can or cannot infer around it — a club naming a returning starter
before the transaction posts is ordinary — and where a refusal sits under a list
rather than instead of one, the sentence is drawn under the rows so a reader is not
left wondering where the other four went.

**A rehabbing starter's club is his org, and `parentOrgOf` is gone.** The
paragraph here used to record the bug and its fix: `getRosterInfo` answers with
`currentTeam`, which for a man on a rehab assignment is a minor-league club —
checked, Edward Cabrera's is the Knoxville Smokies — so the schedule read came
back empty and the block said `Couldn't read his club's schedule`, true of the id
and a lie about him; a `parentOrgId` lookup was the fallback. That case is now
handled by **`clubFor`**, the one club rule this block shares with the Schedule
view's grid: the roster's club where we have a schedule for it, and otherwise the
club he was most recently *named to start* for. Which for a rehabbing pitcher is
the major-league club he last pitched for — the right answer, arrived at from
where he has actually pitched rather than from a farm system's parentage, and with
no special case to maintain.

**And `clubFor` exists because two readers had two club rules and drifted**, which
is worth recording as the shape of mistake this whole arrangement is built to
prevent: the grid resolved a pitcher to the club he last pitched for and this
block to the club his roster spot is on, and on the one pitcher where those
differed — Miles Mikolas, on Washington's roster with his starts behind him at St.
Louis — the block drew five projected starts and the grid drew none.

**The three tiers are never drawn alike**, which is the app's standing rule that
an estimate is marked as one — the percentile card's dotted bubble and the Splits
card's hatched fill are the same rule on two other surfaces. A row's text goes
muted for either guess, and the tag says the word: `Announced` in the accent with
a solid border, `Projected` muted with a solid border, `Estimated` muted with a
**dashed** one. That is the same ladder the Schedule view's grid draws as chip
weights, read from the outside in — a fact, our measurement of *him*, a
measurement of his *club* standing in for one of him — and the two surfaces
deliberately differ in one way only: a row here has the width for a word where a
grid cell has room for two characters, so there the weight carries it alone and
the sentence is on the chip's title.

**The ink stays `--muted` on both guesses rather than stepping down to `--faint`
on the third**, and that is measured: `--faint` puts a 10px uppercase tag at
**3.18:1 on Midnight's zebra stripe**, under what a label a reader has to read
owes them, where `--muted` is 6.08. So the border style is what separates the two
guesses and all three stay legible. It is the same measurement the grid's chip
records, and the same conclusion.

The row itself is **folded onto `.ovw-next-line`'s rule**: the block above draws
exactly this sentence for exactly this kind of fact, so the two are one object.
And the opposing starter is by **surname**, where that single line prints the
whole name — this is a list scanned down rather than one sentence read across,
which is the same reason the summary table's opponent cell and the feed's Upcoming
bar cut theirs.

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
  it is still drawn only when something on screen is actually a guess. **On the
  `estimated` tier it names whose pace it is**, reading `his club's turn: every 6
  club games`: the same phrase would otherwise be the same phrase whether it was
  measured off his own starts or borrowed, and which of those it is is precisely
  what decides how much the rows below are worth. `estimated` wins where a list
  holds both tiers, being the weaker.
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

**Validated three ways, and the honest one is the middle number.** All three
below were run against the *previous* implementation — the one that read a club's
season and his game log per pitcher — and the first of them has been re-run
against the shared engine that replaced it: an independent re-implementation
reproduces the whole **league-wide** map, **335 of 335** pitchers, on the projected
`gamePk` list, the tier and the cadence; this route agrees with its own former
answers on **58 of 60** starters, the two differences being the `estimated` tier
it gained; and the two surfaces agree with each other on **40 of 40** sampled
pitchers. The second and third bullets are properties of the *method* rather than
of the source and are unaffected by the swap.

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
`lowerBetter`-free rule that 1st is always the best offense — every one of them
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
ones changed behavior; measured after, the feed's Upcoming dialog reads
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
**no block at all**. The other `OpponentSection` call sites still work —
the feed's Upcoming dialog (`Nolan McLean — NYM vs SD`, `SD`, 3 rows, `vs RHP`,
five span pills) and the pitcher's own outing (`Tarik Skubal — LAD vs MIL`, `MIL`,
3 rows, `vs LHP`) — and the Roster, Feed and Research views all render with no
error banner and 0 overflow. That second one was a `Full breakdown` **dialog**
when it was measured, and is the outing page's **Opponent tab** since; the two
changes landed in the same merge, and what the tab draws is this same section
with `bare` where the dialog passed `defaultOpen`.

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

### The Schedule tab: what he has coming

**Every other tab on this page reads backwards.** Seven of them are a season
already played and the eighth is his day, and the question a fantasy manager
opens a player page with on a Sunday night is the other one — *how many games
does he get this week, against whom, and does my starter get two turns.* The app
could already answer it on a **grid of everybody** (the roster and the board's
Schedule view, `client-summary.md`) and one row at a time on the Overview; it
could not answer it about **one man**, which is the page a reader is on when he
asks.

**It is second in the strip, directly after Overview**, and that is the strip's
own ordering argument rather than an exception to it. Everything from the
percentile card rightward is a reading of a season behind him; Overview is what
he is doing now; this is what he has coming. *Now → next → the record* is one
direction of travel, and it is the same argument the Overview makes for putting
Projected Starts directly under the day — the two halves of "what is he doing"
must not end up in two places. Last in the strip would have put six tabs of
season history between them. *(It is seventh now, after the Game Log — see
**The Overview carries the forward half, so the tab moved** below. The paragraph
is left as it was written, this file's rule for its own superseded reasoning:
what changed is not the argument but its premise, the Overview having taken the
forward half onto itself.)*

**The strip is eight tabs now, and nine on a pitcher** — it was seven and eight.
It has needed nothing structural, as it did not for News: `.details-tabs`
already scrolls sideways and scrolls the active tab into view. Re-measured at
**390×844 and 1200×900, on a batter and a pitcher, pressing every tab in turn**:
all 8 and all 9 land **fully inside the strip** when selected (`Schedule` at 90px
sits 96 from the strip's left edge with 171 to spare), the strip is **34px** tall
at both widths, and the page body and the overlay each overflow by **0**.

#### Two kinds of row, because it is two questions

*(Superseded — there is **one** kind of row now, and a starter's turns are marked
within his club's fixtures rather than replacing them. See **A starter gets the
fortnight too, with his turns marked in it** below. The reasoning is left as it
was written, and the half of it that still stands is named there.)*

**A batter is in every game his club plays and a reliever could be in any of
them**, so what either has coming *is* his club's fixture list. **A starting
pitcher is in one in five**, and his club's next game is somebody else's start —
so his rows are his **turns**. The test is `lib.ts::isRotationStarter`, the app's
one definition of who works out of the rotation, read off the day report exactly
as `NextGameBlock` and `ProjectedStartsBlock` read it; ESPN's `SP` eligibility is
deliberately not it, for the reason both of those already record — it is a cover
rather than a partition, so it says where a league will let you start a man and
not whether he takes the ball every fifth day.

**The starter's half is not a second implementation of anything.** It is
`ProjectedStartsBlock` itself, exported from `PlayerOverview.tsx` and drawn here
over `/api/players/:id/projected-starts` — the same route, the same five rows,
the same three tiers, the same cadence note and the same opponent dialog. That is
the arrangement News and the Game Log already have on this page (the Overview
previews, a tab holds the whole thing), with one difference worth naming: those
two are one *read* shared by two drawings and this is one *component* drawn on
two tabs, only ever one of them mounted. The alternative — a Schedule-tab list of
starts written here — is the thing that could not have been kept honest, five
rows of tiered projection being the fiddliest reading on the page.

**So a rotation starter's Schedule tab never asks for the league-wide window at
all**, which is the same economy the roster's own toggle follows: measured with
the page's requests logged, opening Merrill Kelly and pressing Schedule three
times fires **`/api/schedule` zero times**.

#### The fixture list, and what it is folded onto

**A row here is a when, a matchup and the man the other club is throwing** —
which is exactly what a `.start-row` is, minus the tag that says whose guess it
is. So it takes `.start-list` / `.start-row` / `.start-line` and `.ovw-next-when`
/ `.ovw-next-opp` / `.ovw-next-vs` unchanged, and the section takes `.ovw-starts`
for the `--card-column` cap, the tab's shared center and the head-row rule that
lets a note read *beside* a heading. **The whole tab adds no CSS rule at all**:
`.details-schedule` is folded onto `.details-overview`'s 18px step off the strip,
and the only other stylesheet change is a paragraph naming the second reader of
`.sched-vs-projected` / `.sched-vs-estimated`.

**The data is folded too.** `buildScheduleIndex` is the roster and the board's
own index, called here **unchanged** — so a day read on this tab and the same day
read on the grid come off one function over one payload, including the opposing
starter, whose resolution (`buildStarters`, and the four ways it declines to name
anybody) is the last thing in this app that should exist twice.

**What is deliberately *not* folded is the grid itself, and that is the judgment
this tab turns on.** `ScheduleCell` is a cell two characters wide in a table
fourteen columns across and hundreds of rows down, and the entire span control
exists because *width* is that view's binding constraint. This is one man in a
scrolling overlay, where a row has room for a date, a time, a matchup and a named
pitcher — measured, the section is **800px at 1200 and 358 at 390**, against a
grid column the two-line day header sets at ~59. The two draw the same facts at
two widths, which is the case the stylesheet's rule calls two things that merely
*resemble* each other; so what is shared is the index, the vocabulary and the
row, and what is not is the geometry.

**Fourteen days, which is the app's own planning horizon** rather than a number
picked here: `nextGame.ts` argues it (a rotation turn is five days, and an off
day either side of the All-Star break is the widest gap a club's schedule has)
and the Schedule view's `Next 14` is the same number on the same question.
Measured league-wide on the live window, fourteen days is **10 to 14 scheduled
games a club, median 12**, where the whole 28-day window the server answers with
is **22 to 26, median 24**. **The window was the alternative and it was rejected
twice over**: it would have meant either a fifth `ScheduleSpan` that no URL can
carry and no control offers — a concept in `schedule.tsx` existing for one caller
— or a private copy of that file's `byTeam`, which is the drift this arrangement
exists to prevent; and what it buys is days 15 to 28, which is past where anybody
sets a lineup. The two kinds of row are then bounded in their own units, a
fortnight of fixtures against five turns, which is right rather than untidy: at a
cadence of five club games those five turns *are* about four weeks, and a turn is
the unit a rotation is planned in where a day is the unit a lineup is.

**`state === 'scheduled'` is the filter, and it says three things at once.** A
game already **live or final** is not something anybody plans around — the
Overview's day block is what says what today's game is doing — and a
**postponement is not a game he gets**, which is the rule the grid's own `G`
count states and the one error that would make this list lie.

**A doubleheader is sorted by first pitch here, and the grid's order is not wrong
so much as answering a different question.** `schedule.ts` keeps a day's games in
MLB's own game order, which the grid stacks in one cell where two lines under one
date read as "twice that day" whichever way up they are. A list is read *down*,
so an out-of-order pair reads as a bug — and it happened: on the live window the
Yankees' Aug 29 doubleheader against Boston arrives `gamePk` **823501 (7:15 PM)
ahead of 823539 (1:05 PM)**, and the tab drew the nightcap first until it sorted.
A game with no posted time sorts last, which is the only place it can go.

#### The one guess on a fixture row wears the ladder

**No tag, and that is the rule rather than an omission.** Every row is a game his
club is scheduled to play, so a mark saying so would be on every row — and a mark
that would be on every row marks nothing.

**Which leaves exactly one guess a row can hold, and it is the opposing
starter.** It is `opposingStarter`'s answer, which is the grid's resolution
rather than a second one: announced where his club has named him, projected where
his own rotation slot puts him there, estimated where his club's rotation does,
and **absent** where the answer is not one man. It wears the grid's own underline
ladder — nothing on the announced tier, a solid underline for our reading of his
slot, a dashed one for his club's — which is `an estimate never wears the same
clothes as a measurement` said on a row rather than in a cell, and the same
three-weight progression the percentile card's dotted bar and the Splits card's
hatched fill already draw. **Measured on Aaron Judge's own thirteen rows: 9 of
13 name somebody — 2 announced, 6 projected, 1 estimated — and 4 name nobody.**
An announcement alone would have named two of the thirteen, which is the whole
argument for reading the projection here and is the same argument the grid
records league-wide (75 of 750 game-sides announced against 610 named).

#### The empty state names which of four things happened

A single "nothing scheduled" would be a claim about his club's schedule made in
three cases where we never got as far as looking at one, so there are four
sentences (`emptyText`), each driven and read off the page:

| | |
| --- | --- |
| the window read failed | `Couldn’t read the league schedule.` |
| his day read failed, so we have no club | `Couldn’t read which club Aaron Judge is on, so there is no schedule to draw.` |
| he is on no club | `Aaron Judge isn’t on a club right now, so there are no games to list.` |
| his club really has nothing left | `Nothing left on his club’s schedule in the next 14 days.` |

*(A rotation starter now gets these four as well, his tab being his club's
fixtures like everybody else's — see **A starter gets the fortnight too**. His
five rotation refusals are still drawn, on the Overview block that still asks
that question. The paragraph below is left as written.)*

A **rotation starter** with nothing to show gets `ProjectedStartsBlock`'s own
five refusal sentences instead, which is the point of drawing that block rather
than a list — checked on the live season, Mick Abel's tab reads *"Mick Abel isn’t
on the active roster, so he isn’t making a start his rotation slot falls on —
nothing past what his club has named."*

#### The read, and the two rules it had to obey

**The window takes no parameters** — one object for every club and every player —
so it is read once per session and shared, and this page is the **third** surface
to ask for it after the two wide tables' Schedule view and the matchup page's
team pages. It asks the way they do, through App's `onNeedSchedule`, and only
where it is going to draw something with it. **Nothing here can be superseded**,
which is why there is no sequence number: the window is the same answer whoever
asked, and a player change unmounts the tab.

**Driven at 1200×900 with `/api/schedule` held 2.5s in the page**, the app's
loading discipline reads off the rendered page exactly:

| | |
| --- | --- |
| t≈100ms (under `WAIT_DELAY`) | nothing at all — no wait, no empty box |
| t≈300ms | `Reading his upcoming games` |
| t≈3500ms | **13 rows**, wait gone |
| the read **fails** instead | `Couldn’t read the league schedule.` at t≈100ms, and no wait at any point |

And the requests, logged in the page: pressing Schedule fires `/api/schedule`
**once**, and pressing away and back twice more fires it **zero** further times.
Pressing the tab, leaving it 400ms into a held read and coming back draws **13
rows and no wait**; three more away-and-backs over one read, the same.

#### `ProjectedStartsBlock`'s read moved up a level, and the measurement is why

**The block used to fetch its own rotation**, which was right while it was a
section of one tab and wrong the moment it became the whole of another: mounting
it fetched, so every tab switch away and back was a fresh read — and **two** of
them in development, StrictMode double-invoking an effect whose only guard was a
`live` flag its own cleanup cleared. **Measured before the move: opening a
pitcher and pressing Schedule three times fired `/api/players/:id/projected-starts`
six times.**

So the read is `PlayerDetails`' now, in the shape every other lazy read on this
page already has — a `startsReq` ref keyed by **player alone** (a rotation slot is
a fact about a person, and only one of a two-way player's kinds could have one),
gated on `tab === 'overview' || tab === 'schedule'` and on `wantStarts`, with
**the ref as the test and no cleanup flag**, which is the hang this file records
four sections up. The error path nulls the ref, so re-opening either tab retries
— driven, with the first read forced to reject: the tab draws the block, the
retry fires on the next tab press and **5 rows land**. **After the move: one
request on opening the pitcher's page, and zero for three presses of Schedule.**

**And "nobody has asked yet" is drawn as a wait rather than as an answer**,
which is the one thing the hoist had to add. `startsLoading` is set in an effect,
which runs *after* the paint that first mounts the block — so for one frame the
block held no rotation, no failure and no read in flight, which is precisely the
state its own refusal branch draws `Couldn’t read his club’s schedule.` for.
`startsPending` folds that beat into the flag the block is given. **Sampled every
animation frame across a `/day` read held 5s**, with Schedule pressed while it
was still out: `nothing` at t+1507 (under `WAIT_DELAY`), `Reading his upcoming
games` at t+1767, and `Projected Starts` with **5 rows** at t+5066 — three
states, and not one frame of a sentence that isn't true.

**The wait says `Reading his upcoming games` in that middle state even though
what is out is the day**, and that is deliberate rather than sloppy: the tab
cannot know which of its two lists it is drawing until that report lands, so the
only honest name for what it is doing is the question the reader pressed.

**The day report is read for the Schedule tab as well as the Overview**, under
the same `dayReq` key, because it carries the two facts this tab turns on and
nothing else on the page does — his club, and whether `isRotationStarter` places
him in a rotation. In practice the Overview has always already had it, that being
the tab the page opens on; what the second test buys is the case that matters, a
**failed** day read, where the error path nulls the ref and pressing Schedule is
then the retry.

**Bundle: 583.27 → 586.95 KB of JS** (173.94 → 174.85 gzipped) and **156.57 →
156.59 KB of CSS** (28.03 → 28.04) — 3.7KB and 20 bytes raw, 0.9KB and 10 bytes
over the wire, for a tab, a list, four sentences and a read hoisted a level. The
CSS is one extra selector and two comments because the tab is a fold rather than
a surface.

### A fixture is a press, and it opens what an upcoming game opens

**Every row on this tab named a game and did nothing**, which is half a
sentence in exactly the way the Projected Starts rows were half a sentence
before they became presses: a manager reading `Aug 26 · vs HOU · RHP Lambert` is
deciding whether to start a man in that game, and the app already knows the
thing that decides it. So a fixture row is a press, and what it raises is not a
new box — it is **the dialog an upcoming game already raises in the feed**,
picked by the same test that file makes.

| the row belongs to | the box | the test for whether a row is a press |
| --- | --- | --- |
| a pitcher | `OpponentSection` over the opposing club's season line | not a press once the server answers with **no board** for that club |
| a batter | `BatterSplitsTab`, with the half the other club's starter creates marked | a press only where that starter has a **hand** — the feed's own `spHand !== null` |

**The two tests differ because the two facts arrive at different times**, which
is the distinction `A row with nothing behind it is not a press` already draws
for a projected start. A batter's is decidable before anything is drawn: a
platoon half needs a hand to mark, and a game nobody has been named for has
none. A pitcher's cannot be, the club's line not being read until somebody
presses — so the row is a press by default and goes static on the one answer
that says there is nothing behind it. **Measured on Aaron Judge's thirteen
rows: 9 are presses and 4 are static**, which is the same 9-of-13 the opposing
starter is named on, because it is the same fact.

**The club-line cache moved rather than being written twice.** It was
`ProjectedStartsBlock`'s own `opps`/`asked`/`loadOpponent`, and two lists of
dated rows now read one club's season line on a press, so it is
`useOpponentBoards` in `OpponentTable.tsx` — beside the table it feeds, which is
also what keeps `PlayerOverview.tsx` and `PlayerSchedule.tsx` from importing
each other now that the Overview draws the Schedule tab's block. `StartOpponent`
went with it as `OpponentRead`, which is the same three states named by what
they are rather than by which list asked.

**The press is a `<button>`, which is this app's answer to *a press arms on
`pointerdown` and decides on release* wherever the target is a whole row.** The
feed's Upcoming bar and the Projected Starts row are both plain buttons, and a
click is by definition armed on the press and decided on the release, with the
browser cancelling it when the gesture becomes a scroll. Driven with synthesized
touches on a fixture row at 1200×900: a touch that lands on the row and moves
**60px** before lifting leaves `dialogs` at **0**, and one that lands and lifts
**2px** away opens **1**. A second interaction spelled by hand here would have
been a second answer to a question the app has already answered three times.

**What the box says about a guess it is looking at.** A dialog inherits none of
the row's marks, so both of the row's caveats are repeated inside it where the
reader is: a projected turn of his own carries *Projected from his rotation
slot — nobody has named this start yet*, and a batter's row against a projected
opposing starter carries *HOU hasn't named a starter this far out — Peter
Lambert (RHP) is who their rotation puts on the mound, so this is the half of
his split that would apply.* Read off the page, with the marked half's own title
reading `Peter Lambert (RHP) throws right-handed, so this is the half that
applies to this game.` on `.spl-head-side--on`. An announced row carries neither
sentence.

### A starter gets the fortnight too, with his turns marked in it

**The tab was two lists and is one.** A rotation starter got
`ProjectedStartsBlock` — his five turns and nothing else — on the argument that
he is in one in five of his club's games, so his turns are what he *has coming*.
What that leaves out is that the other four are what he does **not** have
coming, and a manager holding a two-start week is reading the fortnight to find
out: five turns cannot answer *does he go again before Sunday* without the days
they fall between. So every player's tab is his club's fixture list, and a
starter's turns are **marked** within it — which is the reading the roster's
Schedule grid has always given a pitcher's row, where `SP` sits on the days he
takes the ball and the club's other games are still drawn.

**The half of the old argument that stands** is that a rotation is a different
reading from a fixture list, and it keeps its own block: `Projected Starts` is
unmoved on the Overview, with its tiers, its cadence note and its five refusal
sentences. What changed is that it stopped standing in for the tab.

**The mark is `startTierOn`, the grid's own function**, over the window this
list is already built from — not the `/api/players/:id/projected-starts`
payload the Overview draws. That is the same fold as `buildScheduleIndex` one
paragraph up: the rows and the marks on them come off **one** read, so a row
here and a cell on the grid cannot place a turn on two different days. It also
takes the rotation read off this tab entirely — `PlayerDetails`' `startsReq` is
gated on the Overview alone again, which is where the block that draws it lives.

**The tag wears the ladder and the row does not**, and that is the one place
this departs from the Projected Starts block it borrows from. There, a projected
row is muted *and* tagged, because every row is a start and the whole line is a
guess. Here the date, the time and the matchup are a game his club is scheduled
to play whatever we think of the rotation, so muting them would mark a fact as a
guess — the guess is confined to the thing that is one. Measured on Walker
Buehler's tab: the marked rows' `.ovw-next-when` is `rgb(223, 225, 226)`, the
same `--text` as every unmarked row's, and the tag alone carries the three
weights (`rgb(158, 161, 162)`, `--muted`, solid border on a projection).

**The words differ from the block's for the same reason the mark does.** There
the heading says `Projected Starts` and the tag says how sure it is
(`Announced` / `Projected` / `Estimated`); here most rows are not his starts at
all, so a tag has to say **that he starts** before it says how sure — `Start`,
`Proj. start`, `Est. start`. The three weights are the existing ones, folded
onto tag-level classes (`.start-tag--announced` and its two siblings share the
selector list `.start-row--announced .start-tag` already had) rather than given
rules that agree today.

**Driven on two starting pitchers at 1200×900.** Walker Buehler's tab draws
**11 rows where it drew 5 turns**, two of them marked — `Aug 23 · 4:10 PM · vs
MIN · RHP Ober · Start` in the accent and `Aug 29 · 4:10 PM · @ TB · Proj.
start` in the muted outline — and all 11 are presses. The second pitcher's draws
**12 rows with 2 marked**, both `Proj. start`, which is the right count at a
five-game cadence over a fortnight. Aaron Judge's is unchanged at **13 rows with
0 marks**, a mark that would never be true not being drawn at all.

**And the request economy is unchanged where it was argued and honest where it
moved.** Logged in the page: a **starter's** page opens with `/api/schedule`
**zero** times (his Overview block is his rotation, so nothing asks for the
window), the first press of Schedule fires it **once**, and two further presses
fire it **zero** more times, with `/api/projected-starts` sitting at **1**
throughout. A **batter's** page now fires `/api/schedule` **once on opening**,
which is new and is what the Overview's five rows cost; three presses of
Schedule fire it **zero** further times. One object for every player, held by
`App` for the session, so the third and fourth surfaces to ask for it are free
after the first.

### The Overview carries the forward half, so the tab moved

**`Next 5 games` sits in the slot Projected Starts occupies on a starter**, and
the two are never both drawn. That is the same test the day block above them has
just made (`isRotationStarter`): a batter is in every game his club plays and a
reliever could be in any of them, so what either has coming is the fixture list;
a starter is in one in five and his turns are the answer. The Overview's rhythm
is *now → next → what has happened → the record*, and `next` is now **one block
whoever the reader opened the page on** rather than a block a starter has and
nobody else does.

**It is the Schedule tab's own component with two props changed**, which is the
rule this tab already keeps for the Game Log and the News: `limit` is 5 against
the tab's fortnight, and `onSeeAll` puts a `Schedule →` door in the head row.
Everything else — the rows, the presses, the marks, the doubleheader sort and
the four empty sentences — has one definition. The door needed the one CSS rule
in this whole change: `.ovw-starts`'s head row is `flex-start` so a *note* reads
beside its heading, and a *door* belongs over the right edge of the rows it
opens, so `.ovw-starts.ovw-upcoming` turns the justification back on. Measured,
it lands at **x=1000**, which is exactly where the `News →` door two blocks
below lands.

**Measured at 1200×900 and 390×844, on Aaron Judge.** The block is **800 × 186px
at x=200** at 1200 — centered on the tab's own axis to the pixel (200 + 400 =
600 = 16 + 1168/2), beside `Today` and `News`, which are 800 at 200 — and **358
× 186 at x=16** at 390, the same five rows at **30px** each and the same height,
a row at this width wrapping at neither. The page body and the overlay each
overflow by **0** at both. The tab's block order reads `Today · Next 5 games ·
News · Season · Last 5 games` on a batter and `Today · Projected Starts · News ·
Season · Last 5 games` on either starting pitcher.

**Which is what moved the tab.** `Schedule` went in second on the argument that
*now → next → the record* is one direction of travel and the two halves of "what
is he doing" must not sit at two ends of a strip. They no longer do: they sit in
two blocks of **one tab**, with a door between them. What is left for the tab is
the fortnight behind that preview — a deeper reading rather than a first one —
so it belongs where the other deep readings are. **The strip as rendered**, read
off the page at 1200×900: `Overview · Percentile Rankings · Splits · News ·
Stats · Game Log · Schedule · Charts`, with `Arsenal` third on a pitcher. At
390×844 the strip is **34px** tall, the selected tab lands **fully inside** it
(Schedule sits 244px from the strip's left edge), and the page body and the
overlay each overflow by **0**.

**A tab is a key and nothing stores a position**, which is why moving it was a
one-place change: the button moved in the JSX and the `DetailsTab` union was
re-ordered to match for reading. The tab is not in the URL (it is state, not a
param), no `cols`-style saved preference carries it, and `PlayerOrderEditor` —
the one reorder screen in the app — is about the order of **players** on a
roster. All three were checked rather than assumed.

**Bundle: 591.79 → 594.14 KB of JS** (176.58 → 177.17 gzipped) and **157.84 →
157.98 KB of CSS** (28.18 → 28.21) — 2.35KB and 0.14KB raw, 0.59KB and 0.03KB
over the wire, for a press on every fixture row, two dialogs, a block on the
Overview, a mark on a starter's fortnight and a cache lifted into the file that
owns the table it feeds. The CSS is one new rule and three folded selectors,
which is what a change made of folds costs.

### Where the rest of the player page's documentation lives

This file was 215KB across eight tabs and is now three, on `CLAUDE.md`'s own
150k-per-file rule and by the division `client.md` already made one level up:
**by the surface being described, not by size**. What is above is the page — the
overlay, its pinned head and tab strip, the reorder screen — the **Overview**
tab, which is what he is doing *now*, and the **Schedule** tab beside it, which
is what he has coming: the two are one question in two directions and the second
draws the first's own Projected Starts block, so they belong in one file.

- **`client-player-tabs.md`** — the four tabs that read his season and his
  record, in the strip's own order: **News** (and the eleven dead ends behind
  it), **Stats** (the research board transposed onto one man, and its percentile
  badges), **Game Log** (and the outing a pitcher's row opens), and **Charts**.
- **`client-player-splits.md`** — the **Splits** tab: the platoon comparison,
  its diverging bar and the five rounds of measured geometry that bar has taken.

Nothing was rewritten to fit its new file, so a claim that reads oddly against
its neighbors is a seam rather than a change of mind; **every one of the 2,207
non-blank lines of the original is present exactly once across the three**, with
nothing added but the paragraph at the head of each. References elsewhere to
"see **Client — the player page**" still resolve, all three being imported
together — follow them by the tab they name.
