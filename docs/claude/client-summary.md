### The Roster view — the summary table

Split out of `client.md`, which holds the shell this sits in (player keys, the
app's chrome, the kind tabs, the date controls, the loading system and the
hide-injured filter). The three wide tables' shared behavior — the full-page
mode, the bleed, the sticky columns — is described here and referred to from the
other two.

- **summary** (`SummaryTable.tsx`, the default, listed first) — a full-page stat table over the range (one row per player: opponent/score, H/AB, R, HR, RBI, SB, OPS, BB, K; a `Total` row **between the starters and the bench**, summing the men above it — see *The `Total` row is a divider now* below). The opponent column shows the matchup pre-game, the live score + inning while a game is on, and the final score once it's over — for a representative game picked live-first, then scheduled, then most recent — and, **before first pitch only**, the other side's announced starter on a second line (`game.probablePitcher`, **surname only**: this is the column whose width costs a stat column off the right of a phone, so the name takes a line rather than widening the cell). Pre-game the start time moves up beside the matchup, so the cell is two lines in every state instead of three in one of them; once the game is under way the starter drops off, the score and inning being what matters by then (and the batter as likely to be facing a reliever). On the pitcher tab that starter is his counterpart, not someone he faces. **In neither of the table's other two readings is that column drawn at all** — the Schedule view and the projected lens each replace it with `G`, for the same reason stated twice: one representative game says nothing about a span of days ahead (see *What the mode swaps* and *The Opponent column becomes `G`* below). Hides the overall-stats chips, and the search bar too — *except* when the roster is empty, since the view tabs are also hidden until something is on it, so a new user would otherwise have no way to add a first player (`showAdder` in `App.tsx`). The `.app.summary-mode` class turns the app into a fixed-height flex column so only the table scrolls.

**And on this view the column gives its vertical margins back too**, the way the three wide tables give back the side gutters (`--table-bleed`, above): the table meets the bar above it and the bottom of the window below. There were two of them and they were both 14px, one from each box — `.app`'s own `padding-bottom` and the chrome's `margin-bottom` — and neither was doing any work here. The pane *is* the page on this view: there is nothing under it to be held off and nothing above it but the bar, so both were a strip of background showing through where a reader expects rows. **The 80px `.app` carries at the bottom is not the culprit it looks like** and never reached this view: the `.app.summary-mode, .app.research-mode` rule has overridden it to 14 since summary mode was written, which is why the fix is a *pair* of 14s and why removing only one of them would have taken the table to one edge and not the other. `padding-bottom` alone rather than the whole padding — the top 14px is already spoken for by the chrome's negative top margin, and the sides are what `--table-bleed` reads to know how far the table may bleed back out through them. Measured before and after at 320, 390, 640, 1200 and 1920 wide and on a 500px-tall window, on both the batter and the pitcher tab: 14px above the header row and 14px below the pinned total row at every one of them, **0 and 0** after, with the total row landing on the window's own bottom edge less the 1px the bottom border takes — the same pixel the sticky-column note above measures.

**The top hairline goes with the margin**, for the reason the sides went with theirs: the chrome closes itself with a `border-bottom` of its own, so the pane's would be the second of two lines a pixel apart. The bottom one stays, and the two cases are why. On a long roster it sits exactly on the edge of the screen, where a hairline reads as the edge rather than as a border; on a short one the pane ends above the fold and that rule is the only thing closing the table. Scoped `:not(.is-expanded)`, so the full-page box — which has its own 10/12px padding and its own `--table-bleed: 12px` — keeps the border it has always had, and `.expanded-chrome` keeps its 8px above the pane and its 12px gutter (checked: box padding `10px 12px`, chrome row 36px + 8, pane border-top still 1px, bleed still −12).

**A short roster still doesn't stretch**, which is the thing this must not undo: `align-items: flex-start` with `max-height: 100%` is what shrinks the pane to its rows rather than filling the column, and the docs record the bordered expanse of nothing that came of getting it wrong. Measured at 1000×1400 after the change: 806px of pane in a column with 479px to spare under it, the total row closing the table where the rows end. All the removal did there was give that leftover the 15px the padding and the top border used to hold.

**The bottom edge is `100dvh`'s to keep**, and it already was — the column has been declared in `dvh` since it was written, which is the unit that follows a phone's browser chrome coming and going. Driven through 844 → 740 → 844 → 620 → 500 without a reload: the pane's bottom lands on the window every time, the total row pins one pixel above it every time, and the page itself never gains a scrollbar.

**The one thing that inherited the loss is the wait**, and it is not the table. Before any rows exist this view holds a **block wait** instead — the 28px baseball over `Reading your roster's games`, `.loading-block`, a child of `.app` itself — and it is *not* the page: it has nothing to run to the edges of and every reason to sit clear of the bar. `.app.summary-mode .app-chrome { margin-bottom: 0 }` took its cushion away with the table's, and because this view is a **flex column** nothing collapses, so what was left above it was its own 40px margin and literally nothing else. **Measured immediately under `.app-chrome` at 900px wide, three page shapes and two different reasons for the same number**: Roster **40px** (flex, chrome margin zeroed — the block's own margin alone); Feed **40px** (ordinary block flow, where the chrome's 14px *collapses into* the block's 40 rather than adding to it, so the bar contributes nothing there either); Research **54px** (a flex column whose chrome keeps its 14px, so the two add). 54 is therefore the app's own answer to this question and the other two were short of it — the Roster view by a rule written for the table, the Feed by a collapse.

So the page-level wait takes **`margin-top: 54px`** and both views land on it identically: on Roster the flex column adds 0 + 54, on the Feed the collapse resolves to the larger of 14 and 54. **Measured before → after at 390 / 900 / 1200**, with `/api/report` held open by CDP so the wait is genuinely on screen: **40 → 54px** at every one of them on both views, and no horizontal overflow of the page body at any.

**Scoped to `.app > .loading-block`**, which is exactly the wait that sits under the pinned bar and nothing else. Not `.loading-block` itself: every other consumer of that class is inside an overlay or a board with something of its own above it — the player page's six lazily-fetched tabs, the highlight reel, the Game Log's per-game popup, the research board's `Reading your ESPN league` — and none of them is under the chrome or wants the extra room; `.details-status` is folded onto that selector list too and would have taken it as well. Checked: the player page's tab wait computes `margin-top: 40px` and sits 40px under `.details-chrome` at 1200 and at 390, a probe block inside the research view computes 40, and only a direct child of `.app` computes 54. And scoped to the **wait** rather than handed back to the chrome, which is the fix that looks equivalent and isn't — a margin on the bar would push the *table* down and undo every number the three paragraphs above measure. Re-checked with rows present at 390 / 900 / 1200 and at 1000×1400: pane top **0px** below the chrome, pane bottom **0px** above the window's bottom edge at the first three, the pinned total row **1px** off the pane's bottom at all four, `border-top: 0px` on the pane, `align-items: flex-start` with `max-height: 100%` intact, and the short-roster case still shrinking the pane to its rows (912px of pane in a 1285px column, 373px to spare).

**And that rule fixed one of the two waits under the bar, which is why the gap was reported a second time.** The four paragraphs above are correct as measured and reach only `.loading-block` — the wait for a page with *nothing on it*. The other one is the **`Updating` badge**, which is what a re-read looks like once there are rows to protect, and it is a direct child of `.app` on the same two views; nothing had ever given it a top margin, so on the Roster view it sat at **0px** under the pinned bar. `.app > .loading-block` was never the selector that had stopped matching — checked, it still matches and still computes 54 on both views — so the second report was not the first fix having lapsed but a second wait that fix had not been about.

**It was worse than a missing gap, and both halves are the one cause.** `.app.summary-mode` is a flex column, so this pill — `inline-flex` everywhere else in the app — is **blockified and stretched**: measured on the live roster, the badge rendered **1156px wide at 1200 and 346px at 390**, a full-width bar jammed against the bar above it, against the **106px** pill sitting 14px down on the Feed, which is ordinary block flow and keeps the chrome's own margin. So the thing the reader called "the loading bar" was a bar on exactly one view, and only because the rule that lets the table meet the chrome (`.app.summary-mode .app-chrome { margin-bottom: 0 }`) had taken its cushion the same way it took the block wait's.

**`.app.summary-mode > .refreshing` gives both back** — `align-self: flex-start` for the width and `margin-top: 14px` for the gap — and the two views land on **14px** identically. **Fourteen rather than 54**, and the two numbers answer different questions: the block wait is a *page* with nothing behind it and takes a reading block's 40 on top of the bar's 14, where this sits over rows somebody is reading and must not shove them a third of an inch down every time a preset changes. 14 is also exactly what the badge already gives *below* itself, so it is evenly set between the bar and the table, and it is what the Feed has always shown.

**Scoped to summary mode, which is the one place this parts from the rule above.** That one lands on one number for both views by **margin collapsing** — a block's 54 swallows the chrome's 14 on the Feed and adds to the zeroed 0 on the Roster — and an inline-level box does not collapse, so a bare `margin-top: 14px` here would read 14 on the Roster and **28** on the Feed, i.e. the very inconsistency that rule exists to avoid. Blockifying the badge to buy the collapse was the alternative and is worse: `.refreshing` is a modifier on `.loading-line`, which must stay inline for the research board's count line, so it would fork the two. This is instead the counterpart of the `margin-bottom: 0` that caused it — handing back to the badge what that rule takes from everything under the bar for the table's sake — and sits beside `.summary-view … { border-top: none }` as the second consequence of that one decision. And still scoped to the **wait** rather than given back to the chrome, for the reason stated above: a margin on the bar would push the table down and undo the 0px the pane is measured at.

**Measured before → after at 390 and 1200, with `/api/report` held open by CDP and a preset changed so the badge is genuinely on screen.** Roster: gap **0 → 14px** and width **1156 → 106.16 at 1200**, **0 → 14** and **346 → 106.16 at 390**. Feed: **14px and 106.16px, unchanged at both**. Every summary invariant re-checked with rows present and no badge: pane top **0px** below the chrome, pane left and right **0** with `--table-bleed` at −22, `border-top: 0px`, the pinned total row **1px** off the pane's bottom, the header row flush at **0** in its scrollport, the headshot column pinned at **0**, a **58.00px** row on a table measuring 690.33 at 390 and 1200 at 1200, the legend's row still landing on the window with the pane 37px up, and no horizontal overflow of the page body at either width. The other three waits are untouched: the block wait computes **54** on Roster and Feed alike, the research count line **14** (its caption position, which the paragraph below is about), and the player page's tab wait **40** under `.details-chrome`. Bundle: **JS unchanged at 451.11 KB** (133.50 gzipped), CSS **102.54 → 102.80** (18.30 → 18.37), nearly all of it the comment explaining the rule.

**And the `.empty-state` box is the third victim of that one rule, which is why the gap was reported a third time.** The two passages above fix the two *waits* under the pinned bar and reach nothing else; the box that says **`Your roster is empty`** — and its three siblings, `Your fantasy team is empty`, the hide-injured one and the `Starters` one, all four of them children of `.app` on the Roster and Feed views — had no top margin of its own either, so on the Roster view every one of them sat flush against the chrome at **0px**. Same cause a third time: `.app.summary-mode .app-chrome { margin-bottom: 0 }` is written so the *table* can meet the bar, and what is under the bar here is a bordered card rather than a table.

**Fourteen, and the research board is what settles it.** This box is drawn in three places and the chrome rule reaches exactly one of them: on the **Feed** it sits at 14 (ordinary block flow, the chrome's own margin) and on the **research view** — a flex column whose chrome keeps its 14 — at 14 as well, measured at 390 and at 1200 alike. So 14 is already this box's answer everywhere that rule cannot reach, and the Roster view was the sole outlier; a fix landing anywhere else would have made the same box sit at two heights depending on which view emptied, which is the inconsistency these rules exist to remove. It is deliberately **not** the block wait's 54: that number is `.loading-block`'s own reading-block `margin: 40px auto` *plus* the bar's 14, and `.empty-state` has never had a margin of its own to add — it is a full-width bordered card, not a centered column of prose, and the 40 belongs to the thing that declares it.

**It is not being blockified, and that was measured rather than assumed** — which is the half this deliberately does *not* inherit from the badge. That pill is `inline-flex`, so a flex column stretched it to a full-width bar and it needed `align-self: flex-start` to get its content width back. `.empty-state` is a plain **block**, and a block in a `stretch` flex column is already the width it is in block flow: measured at **346px at 390 and 1156px at 1200 on both views, before and after**, four states each. So no `align-self`, and the one line is the margin.

**Unscoped `.app > …` rather than summary mode only**, which is where this parts from the badge and does so because the mechanism that rule could not use is available here. A block's margin **collapses** with the chrome's, so on the Feed the declaration is a no-op — `max(14, 14)` — exactly as `.app > .loading-block`'s 54 swallows the same 14, where a bare `margin-top` on the inline-level badge would have read 14 on the Roster and 28 on the Feed. And scoped to the box rather than given back to the chrome, for the reason both passages above state: a margin on the bar would push the table down and undo the 0px the pane is measured at. The `>` is what keeps it off the research board's own `.empty-state`s, which are children of `.research-view` and already sit at 14 (checked: unchanged at both widths).

**Measured before → after at 390×844 and 1200×900, on the Roster view and the Feed, for all four of them.** The gap below `.app-chrome` goes **0 → 14px** on Roster and stays **14px** on the Feed, in every one of the sixteen states: `Your roster is empty` (empty roster), `Your fantasy team is empty` (a stubbed connected ESPN team with nobody on it), `Nothing to show — everyone here is on the IL` (a one-man roster with `hideil=1`) and `Nothing to show — nobody here is starting today` (`starters=1`). The box's width is **346 / 1156 unchanged** in all sixteen and the page body overflows by **0**. The research board's own empty state (`inc=none`) is **14px at both widths before and after**.

**Two of those four are gated on `!editMode` and a third has since joined them, which is the one thing that passage's sixteen states could not have caught.** The measurements above are of the *gap* and are unaffected; what they take for granted is that each box belongs on the page it is measured on. `Your roster is empty` does not: the edit screen takes the whole page in this mode, so the card landed over the very rows the last ✕ had just cleared, offering a search the mode has hidden. It carries `!editMode` now, alongside the hide-injured and `Starters` messages that already did. `Your fantasy team is empty` is deliberately still ungated — the mode cannot be entered while the fantasy roster is in view — and the research board's own empty states are children of `.research-view` and out of reach of this whole family. See **Client**, *The edit screen takes the page*, for the whole of that rule and for the line the edit screen says in its place.

**The other two waits are untouched, checked rather than reasoned.** With `/api/report` held open in the page, the block wait computes `margin-top: 54px` and sits **54px** under the chrome on Roster and Feed at both widths; with rows already up and a preset changed under a delayed second read, the `Updating` badge is **14px down and 106.16px wide** on both views at both widths — the figures the two passages above record. The one adjacency this creates is the transient state where the badge sits *over* an empty state (a foreground re-read while the toggle is emptying the page): the gap between them goes **14 → 28px**, which is the badge's own 14 below itself plus the box's new 14 and does not collapse, the badge being inline-level. That is a real 14px more in a state that lasts as long as a report fetch, and it is taken rather than special-cased because **both views agree on it** — measured 28 on Roster and 28 on the Feed at both widths, where the whole point of these three rules is that the two views land on one number.

**Every summary invariant re-checked with rows present**, at 390×844 and 1200×900 on an 18-row roster, the pane scrolled to its far right and its foot: pane top **0px** below the chrome, `--table-bleed` **−22px** with the pane at **0 from both edges**, `border-top: 0px`, the pinned total row **1px** off the pane's bottom, the sticky header cell **flush at 0** in its scrollport, the headshot column pinned at **0**, **58.00px** rows, and **no horizontal overflow of the page body** — every figure byte-identical to the same build without the rule. The legend still lands on the window with the pane 37px up (`bottomToWindow` 37 at both widths).

**Bundle: JS unchanged at 464.53 KB** (137.79 gzipped) and **CSS 106.76 → 106.80 KB** (19.06 → 19.07) — 40 bytes raw and 10 over the wire, nearly all of it the paragraphs above restated where the rule is.

**Only the summary view.** `.app.research-mode` shares the flex-column rule and is deliberately left out of this one: what its chrome's bottom margin holds off is the **count line**, which is a caption rather than a bordered pane and would read as part of the bar if the two touched, and the board's error banner and empty states are children of that same column. The games view and the feed are lists of cards and keep the full 80px, which is what stops the last card sitting on the edge of the window. Checked after the change: research is still 14px of chrome margin over its count line and 14px of `.app` padding under its pane, games still 80px under its last card.

**The legend is inside the pane now, and the phrase above — *the room at the bottom of this view* — is what was wrong with it.** *(Superseded in that one respect; everything below about what the key says, why it is always drawn and why each swatch is the row's own ground stands unchanged.)* This view is a viewport-tall flex column in which only the table scrolls, so a legend that is a *sibling* of the pane is pinned by construction: it sat on the window's own bottom edge at every scroll position, on every roster, on a page whose whole design is that the rows get the screen. Measured on the live roster at 900px tall: the key held **37px** off the bottom of the pane at 1400, 390 and 320 alike, and gave it back the moment it moved — pane **694 → 731 at 1400** and **650 → 687 at 390**, which is the legend's own box to the pixel.

A key is a thing you go and look at, not a thing that follows you. So it is the last child of `.summary-scroll`, under the last row, and reaching the foot of the table is what brings it into view: measured, it lays out at y **1080** in a 900px window and reads at **862** once the pane is scrolled to its end.

**Two things had to be decided rather than assumed, and both were measured wrong first.** A child of `.summary-tables` looks like the right home — that column is `width: max-content`, so the key would travel with the table — but the column is *wider than the screen on a phone*, and centering four items in it put them at x≈190–524 in a 390px viewport, half of them off the right of a screen nobody had scrolled. As a child of the scroller it takes the client width instead and centers in the viewport: items at **36–354 at 390** and **1–319 at 320**. And being inside a two-axis scroller would otherwise cost it the horizontal axis — a table scrolled out to `K` would leave the key behind at the far left of a 1952px content box — so it takes **`position: sticky; left: 0`**, which is the same pinning the headshot column already has, on the same axis, and deliberately not on the vertical one. Measured at full right scroll: legend left **0** at 1400 and 390, **−0.1** at 320.

The full-page box takes the change with it, the legend being a child of the same pane there: measured expanded at 1400×900, pane **774px** with the key at **852** once scrolled to the foot, and page-body overflow **0** at every width.

**A legend for the row tints sits under the table, always, and it is also the room at the bottom of this view.** Nothing on this page had ever named the colors it paints rows in — a reader arriving at a table with three shades in it had to work out from the pips and the rings what each one meant, or ask — so the four live roles get a key: `At bat`, `On deck`, `On base`, `On mound`, each a swatch and a word, on both tabs and on every day of the season.

**How that squares with the passage above, which took this column's vertical margins away.** What went then was a **pair of empty 14s** and the argument was precisely that they were "a strip of background showing through where a reader expects rows". Neither rule comes back and neither needs to. The room this row occupies is taken off the pane by the flex column, so the table still runs from the bar to whatever is under it — and what is under it is *content* rather than background, which is the one condition the old argument turned on. The old reasoning holds exactly as written; it never claimed the strip could not be used, only that it must not be empty, and 37px of key is not empty on any day.

**The view became a column to hold it** (`.summary-view`), where it was a row flex with `align-items: flex-start` — which is how it kept a short table from being stretched to the full height of its column. That job moves onto the pane as **`flex: 0 1 auto` with `min-height: 0`**, basis the content's own height, no grow, shrink only when there is more table than screen: the identical pair `.summary-view.is-expanded > .summary-scroll` has carried since the full-page box was written, saying the same thing on the axis that is now the main one. `align-items: stretch` does what the pane's old `flex: 1` did across the row, which is take the full width. **The short-roster case is the thing that must not break** and doesn't: measured at 1000×1400, 912px of pane in a 1285px column with **336px to spare** under the legend — which is the 373 that passage records, less the legend's own 37.

**It used to be gated on something being live and to name only the kind on screen's roles, and both of those are now reversed — the same correction twice.** The gate was `anyLive`, argued from the marks this app suppresses when they would say nothing: the board's roster baseball when every row would carry one, the kind tabs when only one kind is watched, `Starters` over a range that cannot contain a lineup. **The analogy does not hold.** Those are marks *on* the data, and a mark on every row distinguishes nothing; this is a **legend**, and a legend's whole job is to be there before you need it. What the gate actually did was remove the key at the one moment a reader goes looking for it — a quiet morning, a tinted row they have not seen before, "what does the purple mean" — and make it flicker the rest of the time, appearing at first pitch and going at the last out on a table nobody had touched. Reproduced on the running app with nothing live: the batter tab drew a three-item key and the **pitcher tab drew none at all**, both against `main`.

**The contents were per-kind for the same shape of reason and cost the same thing.** The batter tab drew the three batting roles and the pitcher tab the one pitching role, so **`On mound` could not be read from the Batters tab at all** — you had to already know the purple meant something in order to go and find out what it was. A vocabulary is not per-page. All four are drawn on both tabs, which also puts the on-base and on-mound swatches side by side for the first time — and that is what showed they were **literally the same color**.

**On the mound is a teal now, and the sentence that used to stand here is the whole reason it had to be.** It read: *they are the same purple, deliberately and by the app's own convention (a man on base and a man on the mound are both* in the game right now*), and a key showing them as one color under two labels states that convention rather than hiding it.* The convention was real — `--role-pitching-bg` was the same `color-mix` of `--live-purple` as `--role-on-base-bg`, and five more rules folded `.role-pitching` onto `.role-on-base` — and the conclusion is still wrong. **A key exists to tell one shade from another**, so two labels over one swatch is the key stating that these are the same row tint at the exact moment the table is calling them two roles; a reader who counts four entries and finds three colors cannot tell whether that is a design or a bug, which is what makes it worse than the per-kind legend it replaced. The convention itself survives where it belongs — both roles are still *live*, both still take a ring, a tag and a rail — and is now carried by the family of marks rather than by the ink.

**`--mound-teal` (#2ddfd6) sits beside `--live-purple` on `:root`, and the hue is measured rather than picked.** Teal is the risky family precisely because it sits between the app's green (`--hit` #34d399) and its accent blue (`--accent` #38bdf8), so it was chosen by a hue sweep at fixed saturation and lightness, maximising the smaller of the two ΔE2000 distances. Tailwind's teal-400 (#2dd4bf, hue 172) is **10.1** from `--hit` — the wrong end of the gap — and cyan-400 (#22d3ee, hue 187) *is* `--accent-2`. The plateau is hue 176–180, and #2ddfd6 sits at 177.

**The four grounds as they render, read off the page rather than off the hex** (`getComputedStyle` on a real cell of each tinted row, `sim=1`): at bat **#3f2732**, on deck **#3b3521**, on base **#2f294c**, on the mound **#123b44**. Pairwise ΔE2000 over the six pairs: at bat/on deck 22.1, at bat/on base **12.1**, at bat/on mound 31.4, on deck/on base 29.4, on deck/on mound 20.5, and **on base/on mound 22.1 where it was 0.0**. The tightest pair on the board is therefore at bat against on base, which this table has always drawn and nobody has reported, and the pair this fixes is now the second-widest.

**And the two colors teal must not be confused with, in the pure form the ring, the tag and the rail take**: `--hit` **14.6**, `--accent` **22.8**, `--accent-2` **12.3**, `--live-purple` **44.4**. The 12.3 is the tightest and is still wider than the `--accent`/`--walk` pair (11.7) the stylesheet already relies on to tell a link from a walk, and `--accent-2` is drawn in four places, none of them near a live role. On the dark ground it carries **11.27:1** against `--bg` where the purple carries 7.09:1, so it is the more legible of the two.

**What moved and what deliberately did not.** Everything meaning *this pitcher is working right now* is teal: the row tint (`--role-pitching-bg`), the legend swatch's border, the headshot ring on the summary table and in the feed, `.live-role.role-pitching`, the feed's `.live-entry.role-pitching` rail, and the pitcher card's live-inning accent — its border, its 12% head tint, its label and its `Live` tag (see **Pitchers on the roster**). Everything meaning *this runner is on base* stays purple: `--role-on-base-bg` and its swatch, `.live-role.role-on-base`, `.live-entry.role-on-base`, `.sum-photo.role-on-base`, `.feed-photo-link.role-on-base`, `.player-photo-link.role-on-base` — and the whole `take` tone, which is the *runner's* achievement and reads the same on a card, on a badge and on a feed rail (`.faced-event.tone-take`, `.pa-badge.tone-take`, `.feed-base-item.rail-take`/`rail2-take`, `.feed-base-badge.tone-take`). That last group is the one worth naming, because a `tone-take` row is drawn inside a *pitcher's* inning block and is still not his: the bag was taken off him.

**The five folded rules were split rather than a class list widened**, which is the one place this parts from the stylesheet's fold-don't-copy rule and does so because the two selectors now say different things. `.live-role.role-pitching` gets a ground of `color-mix(in srgb, var(--mound-teal) 15%, transparent)` rather than a fourth hand-written `rgba()` — the three above it predate the token and are the same 15% wash, and a hex copied out of `--mound-teal` there is the drift the file spends its comments avoiding. **`.player-photo-link` was deliberately left alone**: it has an on-base rule and never had a pitching one, and it is a local of `PlayerCard.tsx`, which renders nowhere.

**Driven in a browser under `sim=1` at 1200×900 and 390×844, on both tabs.** The Batters tab draws at bat (Contreras), on deck (Sal Stewart) and four on base; the Pitchers tab draws three on the mound, all three computing `color(srgb 0.0698 0.2314 0.2682)` — which is #123b44 exactly, the predicted 20% mix. All four legend swatches render on **both** tabs with four distinct fills and four distinct borders (`rgb(45, 223, 214)` on the mound's, against `rgb(192, 132, 252)` on on-base's), the key sits on one row at 390 and at 1200, and the page body overflows by 0 at both. In the feed, three live pitcher entries carry a teal rail, a teal ring and a teal `On mound` tag, while the batter feed's four on-base entries are still `rgb(192, 132, 252)`; opening two live outings gives their live innings a teal border, a `color(srgb 0.0591 0.1671 0.2111)` head (#0f2b36, the 12% mix) and a teal `Live` tag.

**Bundle, for the teal and the Splits caption together**: **448.23 KB of JS unchanged** (132.72 gzipped either way — nothing about the components moved but one paragraph of JSX) and **102.05 → 102.24 KB of CSS** (18.20 → 18.24 gzipped), which is 190 bytes raw and 40 over the wire, nearly all of it the comments explaining the two rules.

**What the gate was protecting is real and is kept, at a fixed price.** The row costs the pane its height, this view being a fixed-height column where every pixel under the pane is a row of players off the bottom of it — and that is now a standing ~37px rather than a row that comes and goes, which is the cheaper thing to lay out and by far the easier thing to read. The old worry about the *contents* moving under a reader is unchanged and is why they are still the fixed set rather than the roles actually held: at bat, on deck and on base turn over every half-inning, and the 20-second poll would otherwise drop `On deck` at the exact moment the on-deck hitter stepped in. A key has to hold still to be a key — which, followed through, is the argument for it standing still when nothing is live either.

**The labels are `liveRoleLabel`'s**, the same strings the live tag on a feed row and a player card carry, so the legend and the thing it explains cannot come to call one role by two names. That is what turned up **`Pitching`**, the one entry of the four that said what a man was *doing* where the other three say where he *is* — invisible while the tag was only ever drawn one at a time, and impossible to miss once a legend put the four in a row. It reads **`On mound`** now, in the feed and on a card as well as here. It costs the live tag **8.09px** (78.05 → 86.14 on a real feed row, measured), which is the one place the string sits in a laid-out row rather than in a legend that wraps, and no width in the app moved as a result.

**And the swatch is the row's own ground, read from the same token the row reads.** The four `--role-*-bg` are `color-mix()`es on `:root` now, where the row tints wrote them out inline; a legend mixing its own approximation of a color is the one way a legend can lie. Checked in a browser: every swatch's computed `background-color` is byte-identical to the `background-color` of the cells in the row it explains. The **border** is the role's pure hue — the very color the headshot ring takes — and it is load-bearing rather than decorative: a 22% mix over the page reads across a 58px row and is close to invisible in a 14px square, so the square states the ground and the outline names the family, which together are exactly what the row shows.

**`role-pitching` was missing from the table's own tint rules, and adding the legend is what made that a visible claim.** `tr.role-pitching` has been set on the pitcher tab for as long as the pitcher side has existed and **nothing in the stylesheet answered it** — nor `.sum-photo.role-pitching`, so a watched pitcher standing on the mound was the one live role this table drew nothing at all for. It went unnoticed because the tab most people read is the batter one and because nothing on the page named the vocabulary; a legend saying `On mound` over a table that never paints it would have been worse than no legend. Measured on the pitcher tab under `sim=1`, before → after: the three men on the mound compute `rgb(11,18,32)` / `rgb(22,33,58)` — the page ground and the zebra stripe — and now compute the role mix, all three, with the ring on the headshot to match. **Both rules landed folded onto their on-base counterparts** and have since been split, the shared color being the bug the legend then exposed — see the passage above.

**Measured before and after, on both tabs at 390 / 1200 / 1920 with the pane scrolled to its far right and its foot.** Everything this table is already measured against is unchanged: **no horizontal overflow** of the page body at any width; `--table-bleed` still −22px with the pane at **0 from both edges**; **no border above** the pane and 1px below; the sticky header row **flush at the top of its scrollport (0)**; the pinned total row **1px off the bottom**; the headshot column **pinned at 0**; and a **58.00px row** on a table measuring 690.33 / 1200 / 1920 either side of the change. What moved is the pane's height and nothing else: **685 → 648 at 390** and **785 → 748 at 1200 and 1920**, which is the legend's 37px exactly — and **rows entirely inside the pane are 10 / 12 / 12 before and after**, since 37px is less than a 58px row and the pane had that much slack. With nothing live the pane's bottom was **0 from the window** as before, and with the legend it is the legend's box that lands on the window with its own 12px inside it — the first half of which is superseded by the paragraph below, the legend being drawn on a quiet morning too now. In the full-page box the legend comes along as an ordinary column child under the pane, the box keeping its `10px 12px` padding, its `--table-bleed: 12px`, its pane at 0 from both edges and its 1px top border.

**The shift at first pitch that used to be "the one cost worth naming" is gone with the gate.** The row appeared when the first watched player went live and went when the last game ended, moving the table 37px on a poll the reader had not asked for; the alternative named there — holding the row permanently — is what this now does, and the "empty strip" objection to it does not apply, since a key naming four colors is not an empty strip. What is left is a **standing 37px**, the same at ten in the morning as in the ninth inning.

**Re-measured with the gate off, on the live roster and at 390 / 1200 / 1920.** With **nothing live**, `main` draws no legend at all and the pane's bottom is 0 from the window; this draws `At bat · On deck · On base · On mound` in **one 37px row at every one of those widths** with the pane's bottom 37px up, and the legend's own box landing on the window with its 12px inside it. On the **pitcher tab**, `main` draws nothing and this draws the same four. Everything else the table is measured against is unchanged at all three widths, scrolled to the far right and the foot: `--table-bleed` **−22px** with the pane at **0 from both edges**, **no border above** the pane, the sticky header row **flush at the top of its scrollport (0)**, the pinned total row **1px off the bottom**, the headshot column **pinned at 0**, **58.00px** rows, tables at **690.33 / 1200 / 1920**, and **no horizontal overflow of the page body** at any width. In the full-page box the legend comes along as an ordinary column child under the pane, which keeps its `10px 12px` padding, its `--table-bleed: 12px`, its pane at 0 from both edges and its 1px top border. The short-roster case still shrinks the pane to its rows (854px of pane in a 1400px window). **320px is the one width where the key takes two rows** (58px), which is where the app already pays a line for everything else.

**And the key is centered under the table, which it was not.** It sat at the
app's own left gutter — `x=22` at every width, because the shared
`.summary-legend, .roll-legend` rule declares no `justify-content` and flex
therefore starts it at the box's leading edge. That is fine on a phone, where
the four items very nearly fill the row anyway, and it is the wrong answer on a
desktop: the pane this key belongs to bleeds to both gutters, so on a 1920px
screen the four items ended at **x=340** with 1,536px of nothing to their right,
reading as a line left over rather than as the table's caption. `justify-content:
center` on `.summary-legend` is the whole of it.

**It is one declaration on one caller rather than a split of the shared rule**,
which is the same shape `.pct-card .roll-legend` already takes to give back its
padding. The Charts tab's legend keeps its left edge deliberately: it is a
**single** item inside an 800px reading column, under a chart with a paragraph
and an info button above it, each of which establishes a left edge it lines up
with — centring one item there would set it adrift from the card's own copy.
This one has four items and nothing above it to line up with.

**Measured before → after at 320 / 390 / 1200 / 1920**, on the live roster with
the pane scrolled to its foot. The first item's x goes **22 → 800.9 at 1920**,
**22 → 440.9 at 1200** and **22 → 35.9 at 390** (a phone barely moves, the row
being nearly full), and the item span's midpoint lands on the box's own midpoint
to a tenth of a pixel at every width — 960.0 of 960 at 1920, 600.0 of 600 at
1200, 195.0 of 195 at 390. **Nothing else moves**: the row is **37px** before and
after, the pane's bottom is **37px** up from the window at both, page-body
overflow is **0** at all four widths, and **320 still takes two rows** (58px) —
three items on the first and `On mound` on the second, each run centered on its
own line, which is the width this table already pays a line for everything at.

**And the Charts tab's own legend was checked rather than reasoned about**, that
being the caller a shared selector list most easily breaks: opened on a real
player page at 1200, `.roll-legend` computes `justify-content: normal` with its
one item at **x=283** — the legend box's own x — so it is still exactly where it
was.

**The bundle, for the legend and the padlock together**: **436.13 → 437.51 KB** of JS (129.23 → 129.71 gzipped) and **96.75 → 97.95 KB** of CSS (17.33 → 17.53 gzipped) — 1.4KB and 1.2KB raw, under half a kilobyte each over the wire, most of the CSS being the paragraphs explaining the two rules.

**And for the three presentational fixes that followed** — the legend's gate coming off, the research header's height reservation and the Overview tab's tables taking the tab — **435.02 → 434.91 KB** of JS (127.17 → 127.14 gzipped) and **97.64 → 97.78 KB** of CSS (17.42 → 17.45 gzipped). The JS *falls*: a legend that is always drawn needs no `anyLive` scan and no per-kind assembly, which is more code than the fourth entry costs. The CSS grows by 143 bytes raw and 28 over the wire, and nearly all of it is the comments.

**The stray vertical line down a stat column was a fraction of a pixel.** It was reported as the OPS header and the Total row under it carrying a line on their left edge, with the columns to the right of it artifacting as the table was scrolled sideways, and the same at the right-hand end of the pitcher tab. Nothing draws it and there is no border there: it is the **boundary between two cell backgrounds landing mid-device-pixel**. The gutters are `clamp()`ed against the viewport and the numeric columns take `width: auto`, so the browser distributes the table's surplus in thousandths of a pixel — at 1200px the batter table's column edges fall at 376.891, 641.938, 867.281 and so on — and where such an edge lands inside a device pixel the two cells each cover part of it, neither ground comes out whole, and the page shows through a shade darker.

Two things follow from that, and they are exactly the report. It is visible **only where the row's ground differs from the page's**: the header and the Total row are `--panel-2` on a `--bg` page and show it plainly, where an odd body row is `--bg` on `--bg` and hides its own (a zebra row is `--row-alt`, which is `--panel` on the three dark themes, and shows it faintly — measured Δ7 against the header's Δ11). And **which columns show it is a function of the width and the display**, which is why it reads as artifacting rather than as one line in one place: measured on the real table at 1200px, a 1.5× display seams at `Batter|Opponent` and `RBI|SB` where a 2× one seams nowhere, and 900px at 1.75× seams at five boundaries at once. Any fractional device ratio is in that case — a 1.25× phone, a laptop at 110% zoom.

**A cell's ground is therefore named rather than assigned** (`--cell-bg`, painted once by the base `th, td` rule and only *redefined* by the zebra stripe, the header, the Total row, the pinned cell and the three role tints), and a strip of it is drawn **straddling each cell's left edge**, so the boundary is painted solid by one cell instead of shared between two. Two things about that strip's box are load-bearing and both were arrived at by measuring the alternatives.

**It spans the padding box, not the border box** — which is why it is an absolutely positioned `::before` at `top: 0; bottom: 0` and not the `box-shadow` the job looks like. A shadow spans the *border* box, so covering the seam with one paints over the rules this table draws through that band: the body rows' `border-bottom`, nicked once per column (measured, nine dots a line at Δ34 — a line down the table traded for a dotted line across it), and the Total row's 2px `border-top`, nicked at every one of its eleven boundaries at Δ19. `top: 0; bottom: 0` is exactly the padding box, so every rule runs through untouched: measured against the same page with the strip switched off, the header's rule reads Δ12–22 either way and the Total row's Δ4–34 either way, i.e. left to itself.

**It straddles rather than butts**, 3px either side. A 1px strip laid against the boundary has fractional edges of its own and still measured a Δ4–6 blend; pushed out to 3px both its edges land inside solid ground **of the same color**, because every cell in a row of this table carries one ground — the zebra stripe, the three role tints, the header and the Total row each name the pinned headshot cell alongside the rest. So the cover introduces no edge anywhere, and its overspill is the row's own color over the row's own color, into 5px of padding at its narrowest. `position: relative` is declared on the **body** cells alone, the header's and the Total row's being `position: sticky` already and a rule naming all of them tying with `.summary-table thead th` on specificity and unsticking the header. And none of it can reach the pinned headshot cell, which is first in every row and so matches no `+` selector, so `--pin-edge` is undisturbed.

**The Total row's own corner went with it**, being the same fault one size up. `.summary-table .sum-img-col` carries two classes where `.summary-table tfoot td` carries one, so the pinned cell of the Total row won the cascade with `--bg` and painted the **page** color inside a `--panel-2` row — a dark block the width of the headshot column at the foot of the table, with a Δ41 edge against the row beside it. The header row has had its own copy of that rule since it was written (`thead .sum-img-col`); the foot now has the matching one.

**Measured before and after**, on both tabs at 320 / 390 / 640 / 900 / 1200 / 1920 and at device ratios of 1, 1.25, 1.5, 1.75 and 2, each state sampled unscrolled and scrolled to the far right, and each read off the **rendered pixels** rather than off the DOM — a seam is a thing the geometry says nothing about, every column boundary reporting a gap of exactly 0. **913 seams over 120 states before, 0 after.** Everything this table is already measured against is unchanged at every one of those widths: no horizontal overflow of the page body, `--table-bleed` still −22px with the pane at 0 from both edges, no border above the pane and 1px below it, the header row flush at the top of its scrollport and the total row 1px off the bottom, the headshot column pinned at 0, the zebra stripe and the three role tints computing their old colors, and a 58px row on a 690.33px table at 390 and a 1920px one at 1920. The stylesheet went **96.08 → 96.74 KB** (17.17 → 17.32 gzipped), nearly all of it the paragraph explaining the rule. What is left at a seamed boundary is the one pixel where the row's own rule crosses it — border meeting border, unchanged and unreachable without redrawing the rule, and measured at the same figures before and after.

**The research board and the game log still carry the same seam**, and are deliberately left out of this. The cause is theirs too — the board's gutters are `clamp()`ed the same way and its columns take the same `auto` — and it is not small: on the batting board at 1920px on a 1.25× display, 17 of the 19 boundaries the same scan flags across the header row are this, the other two being the sorted column's own pinned edges. What makes it a separate job rather than three more lines of this one is exactly that column: it is pinned to **both** edges and already spends its `box-shadow` on `var(--pin-edge), var(--pin-edge-left)`, so the cover has to be composed with those rather than declared beside them, on the app's widest and most intricate table. Stated here rather than left to be rediscovered.

**Club and position sit under the name here too, and it is the research board's own block.** This table said neither. Which club a man plays for, and where a fantasy league will let you start him, are the two standing facts about a roster row — the same pair the board moved off its `Tm` and `Pos` columns and under the name, for a reason that reads the same way from this side: they are facts about *who the player is*, and the name is the one column already carrying one of those and already absorbing the table's slack. What the summary table adds to that argument is that it had nothing at all to lose here — no columns were cut, because there were none — so the block is pure addition on the one view read as a roster.

**And which way he does it, after where he does it.** `RHB` / `LHB` / `SH` for a
hitter, `RHP` / `LHP` for a pitcher, last on the sub-line — the club, then where
he plays, then which hand he plays it with, which reads outward from the cap and
leaves the pair that was here before it exactly where it was. It is a fact of the
same kind as the two beside it and the argument for putting it here is the one
above, one item further along: the name column absorbs the table's slack, so this
line has room the grid has not.

**It is one token per kind, and a two-way player is the case that shows why.**
Ohtani's batter row reads `LHB` and his pitcher row `RHP` — the same man, two
entries, each describing the half of him the row is about, which is the rule the
position cell beside it already follows (`eligibleForKind` narrows his bat to
`DH` and his arm to `SP`). It is the *useful* reading as well as the consistent
one: which arm a designated hitter throws with decides nothing. The whole
vocabulary, and the two forms that were rejected, are in `lib.ts::handCell`.

**`--faint`, a step behind the position**, which is how it stays out of the way:
the cap says who employs him and the positions say where your league will let you
start him, where this is a standing fact about the man, so the eye lands on the
two actionable things first. Measured, it resolves each theme's own token at
**3.72 / 3.95 / 4.39 / 5.17** against the ground it sits on in Midnight,
Lavender, Maroon and Powder Blue — the same band every other `--faint` reader in
the app occupies.

**It costs this table nothing, measured rather than assumed** — the geometry read
and then the token stripped out of the same page at the same instant, at 390 /
1200 / 1920 on both tabs with the pane scrolled to its far right. The table is
**595.84 / 1200 / 1920 on the batter tab and 717.42 / 1200 / 1920 on the
pitcher's, byte-identical either way**; the name column identical (111.55 /
204.64 / 309.78 and 105.38 / 159.86 / 234.45); rows **58.00px**; the identity
block **31.00**; the headshot column pinned at **0**; the pinned total row 1px off
the pane's bottom; and **page-body overflow 0** at every width in both states.
Three characters on the sub-line are free because that line was never what sizes
the column.

**A player MLB lists no hand for draws nothing** — not a dash and not a guess —
and so does every row before the boot request that fills the map has landed.
Checked with `/api/players` blocked outright: **0 tokens over 50 rows**, rows
still 58.00px, the headshot still pinned at 0 and the page still overflowing by 0.

**Bundle, for the whole of it — the field, the vocabulary, the context, three
tables and the player page's heading: 550.02 → 550.90 KB of JS** (163.06 → 163.28
gzipped) and **147.02 → 147.21 KB of CSS** (26.21 → 26.24) — 0.88KB and 0.19KB
raw, 0.22KB and 0.03KB over the wire, for a fact on every name in the app. The
CSS is two rules; the comments arguing them cost the bundle nothing.

**Shared rather than copied**, which is the rule `PhotoStatus` already sets for the marks on a headshot: two tables that merely resemble each other are two tables that will one day differ, and this is the block a reader is meant to *recognize* moving between two pages. `components/PlayerIdentity.tsx` holds it — `PlayerIdentity` (the column, the sub-line) and `TeamMark` (the cap logo on a ground in the club's own color, moved out of `ResearchTable.tsx`; see **Client — the research board** for where that ground comes from and why the mark needs one) — and the name line is a `children`, because that is the one part the two genuinely disagree about: the board trails a name with the roster baseball and the watchlist star, where this table leads it with the fantasy slot chip. The CSS is shared outright and unscoped (`.row-id*`, renamed from `.research-id*` — `.player-id` was already the player card's header block and had been for far longer), since both tables are 58px rows off a 42px circle and there is one set of numbers to keep true. **The only thing this table adds is `display: inline-flex`**, so the block sits *beside* the slot chip rather than under it; it must not be a flex `<th>`, which takes the cell out of table layout, the mistake the game log's corner header already documents.

**The position rule moved to `lib.ts::positionCell`** and is now one definition for both. It was `posCellText` on the board, three fallbacks deep — ESPN's eligibility narrowed to the row's kind, then MLB's listed position for a batter and `starter` for a pitcher, then MLB's own spelling — and a second copy of that on a table that draws exactly the same cell would have been the drift this codebase spends its comments avoiding. `eligibleCodes` is the same rule without the tooltip, which is what the board's **position pills** read, so a pill and the cell beside it cannot come to disagree. Each caller keeps the two things that really are its own: the board hoists the pill in force to the front and says its pitcher fallback is measured "over the window", where a report's is `isRotationStarter`'s season.

**Two things had to be threaded to make it answerable.** The **club** is `PlayerReport.teamId`/`team`, new on the report and free: `getRosterInfo` already resolved a watched player's current team id (it is what ties an IL player to his club's games), so the abbreviation is a join against the thirty clubs `mlbStats.ts` already downloads for their names and the listed **position** is one more leaf on the same `people?hydrate=currentTeam` call. It is his **current** club rather than the club of a game in the range, deliberately, so a traded man's row wears the cap he is wearing now. **No cache version moves for any of it**: `playerTeamCache` is memory-only on a 30-minute TTL, and although a `PlayerReport` does ride in a day snapshot, `getReport` reads only `games` off a day and builds the report itself — so the three fields are null in every snapshot and nothing reads them there. The **eligibility** reaches the row through a new `EligibilityContext` (`hooks.ts`), a context for the reason `PlayerStatusContext` is one: the block is a leaf and the two components above it have no interest in a fantasy league. Deliberately **not** `FantasyRosterContext`, the obvious neighbor and the wrong vehicle — that map is null whenever the views read the *saved* roster, where eligibility is still a fact the moment a league is connected. And deliberately not threaded into the research board, which keeps its prop: that table merges eligibility onto its rows to *filter* by it, which is a question the table asks rather than the row.

**Measured before and after on the same roster and the same day, at 320 / 390 / 640 / 1200 / 1920 with the pane scrolled to its far right.** The row is **58.00px at every width on both tabs, unchanged**, because the budget the board's block was tuned against is this table's too — the image cell is 6 + 46 + 6 = 58 against the block's 12 + 31 + 12 = 55, so the circle still sets the row and the block spends three of its four spare pixels. **Rows entirely inside the pane are identical**: 9 / 10 / 11 / 10 / 10 on the batter tab and the same on the pitcher tab, before and after. And the **table does not widen by a pixel at any width** — batters 676.11 / 690.33 / 774.75 / 1200 / 1920 and pitchers 783.81 / 801.05 / 914.23 / 1222.78 / 1920, byte-identical either side of the change — because the sub-line is narrower than the name above it on every row of a real roster (the name column's own width is unmoved too: 203.38 / 206.03 / 215.53 / 289.30 / 446.22). **No horizontal overflow of the page body at any of the five widths**, and the headshot column still pins at 0. The bundle is **+0.81KB of JS** (129.14 gzipped against 128.94) and **−0.03KB of CSS**, for a component that replaced a copy.

**A name here also carries the news mark**, on the same terms it takes on the research board and drawn by the same component — a red newspaper for news filed today, a gray one for yesterday, nothing older. It is argued in full under **Client — the research board**; what this table adds to the case is that it is the one view read *as a roster*, so "he was in the news this morning" is the IL placement a manager most needs to be told about, and the name column is the one column here with slack to absorb a 13px glyph.

**Measured on the live fantasy roster at 390 / 1200 / 1920**, by reading the geometry and then stripping the marks out of the same page at the same instant: the batter table is **690.33 / 1200 / 1920 either way** and its name column 206.03 / 285.67 / 441.17 — not a pixel. The pitcher table goes **770.66 → 786.59 at 390** and **1200 → 1206.67 at 1200** and is **unchanged at 1920**, all of it in the name column (158.61 → 174.55, 190.97 → 205.33, 292.70 → 312.06): about the 19px a glyph on this line has always cost, absorbed entirely once the table has slack to spend. Rows **58.00px**, the header row **51.00**, **rows entirely inside the pane 10 / 12 / 12 before and after**, the headshot column pinned at **0** with the pane scrolled to its far right, and **no horizontal overflow of the page body** at any width in either state.

**Driven in a browser for each of the three states the block can be in.** With the league connected it reads the eligibility whole — `C/DH` under Rutschman, `1B/3B/DH` under Sal Stewart, `SP` under Ohtani's *pitcher* row where his batting row reads `DH` (`eligibleForKind`, so a two-way player answers once per kind). With `/api/espn/ownership` blocked it falls back per row and says so on hover — `C — MLB's listed position; ESPN has no eligibility for him`, and `SP — off his appearances this season; …` on the pitching tab — at the same 58px row. And with the fantasy roster read blocked, so no slot chip renders, every name in the column still starts at one x (110.4px, against 160.4 with the chip) and the table is still 1200 wide with 0 overflow. The research board was re-measured through the same change and is untouched: 58.00px rows, a 31.08px block, the same tables at 1952.91 (batting) and 2011.50 (pitching), 0 overflow.

**The roster row had one filter, `Starters`, and it is gone.** It kept only the players actually starting today — a hitter in a posted lineup, a pitcher named as today's starter, and on a connected ESPN team *your* lineup rather than his club's. It is removed because it was not worth its place: the fact it filtered on is already on every row it filtered, as the lineup pip on the headshot, so what the button bought was a way of hiding the men the pips had already told you about. What it cost is on the other side of the ledger and is measured below.

**What survives it is the set, not the button.** The summary table's `Total` row is a divider between the men who are starting and everybody else (see below), and that line needs exactly the answer the filter computed. So `App.tsx::starterKeys` is what is left: the same two readings — tonight's MLB lineup card on a saved roster (`isStartingOn` in `lib.ts`, the same `lineupStatus`/`pitchingRole` fields the pip is drawn from), *your* fantasy lineup where the views are reading an ESPN team, deliberately not the union of the two — and the same fallbacks, `lib.ts::projectStarters` asking it a day at a time where there is a per-day lineup map and off the end-of-range roster where there is not. `startersKnown` gates it, on `rangeHasToday || fantasyLineups !== null`: over a range with no today in it and no per-day lineups there is nobody it could name, and the divider goes back to the bottom rather than drawing a line it cannot justify. **A leaguemate's team page keeps the same set for the same divider** (`LeagueTeam.tsx`), and lost its own copy of the button with this one.

**The projection onto lineup days went with the button and is not missed.** While the filter existed it did not merely keep or drop a row: over a range it *cut days*, projecting each report onto the days the man was actually in the lineup, so a player started Monday and benched Wednesday kept Monday's line and lost Wednesday's. That arithmetic lives on inside `projectStarters` — the team pages and the divider still run it — but nothing narrows a report by it any more, which means every row on the roster is now the whole of the man's range on every reading. The measurement that argued the day-cutting is left below as the record of what it bought, since it is what the arithmetic still in `projectStarters` was checked against: on the live 12-team league over 2026-08-06…08-12, batting went 14 rows to **12** and the `Total` from `80/279` to **`77/268`**, where a row-level filter gave 11 and `72/258`; pitching went 15 rows to **13** and **64.1 IP → 61.1**, which a filter that only removed rows could not have done.

**What it cost, measured.** The button was a 36px square in the wrapping tab row, drawn on **both** roster readings. Removing it takes a whole line of *pinned* chrome off a phone and — the part nobody had noticed — stops the band changing height under the finger that crosses between them. Driven on the live roster at 1400 / 390 / 320, reading `.app-chrome` on the Roster view and again on the Feed:

| width | before, Roster → Feed | after, Roster → Feed |
| --- | --- | --- |
| 1400 | 169 → 169 | 169 → 169 |
| 390 | **213 → 261** | **213 → 213** |
| 320 | **302 → 309** | **261 → 261** |

The tab row itself goes 84 → 84 at 390 on the Roster and **132 → 84** on the Feed, and **125 → 84** at 320. Page overflow is 0 at every width in every state, before and after. The same removal on a matchup's team pages needed a second reservation to keep that promise there — see **Client — a league matchup**, *A team page carried the `Starters` filter too*.

**The `starters=1` parameter is gone from the URL**, and an inbound link carrying it now falls back rather than emptying anything: the app does not read it, the table draws every row, and the parameter is dropped from the URL it rewrites (checked — `?view=summary&starters=1` opens 15 rows and rewrites to `?preset=Today&roster=fantasy`). Several passages in `App.tsx` used to cite it as the precedent for a lens being in the URL and not in `UserPrefs`; each of them now states the rule on its own terms — *a standing fact about the reader is a preference, a lens for an afternoon is a parameter* — rather than pointing at a control that is not there.

**`components/StartersToggle.tsx` is deleted**, and `.starters-toggle` is out of the five `.research-toggle` selector lists it was folded into. Nothing in those lists was written for it: `.schedule-toggle` and `.projected-toggle` are still folded on and still carry the base, the hover, the `flex: none`, the `.on` fill, the focus ring and the two narrow-screen blocks, so the family reads as it did. The one rule that *was* its own — the visually-hidden `.starters-toggle-label` under 640px — went with it.

#### One table of both kinds, and the pitcher header takes over from the batter one

**The tabs are gone and the batters and the pitchers are one list**, pitchers
below batters. See **Client**, *Kind tabs — removed*, for why; what matters here
is that this component needed no drawing code for it. `SummaryTable` has
rendered a `BatterTable` and a `PitcherTable` into one `.summary-tables` column
since it was written — the case was reachable from the matchup team page and
nowhere else, every other caller having filtered to one kind upstream. All that
changed is what arrives in `reports`.

**The header handoff is `position: sticky` doing what it already did.** Each
table's `thead th` is `sticky; top: 0`, which pins *within its own table's box*:
the batter header holds the top edge until the batter table's bottom passes it,
and the pitcher header takes the edge as its own table arrives. Nothing
arbitrates between them and nothing needed to.

**Measured, because the seam is the part that could have been ugly.** The two
tables sit at a **0px** gap, so the handoff has no interval in which neither
header owns the edge. Swept the scroller 1px at a time across 81 consecutive
positions spanning the handoff (`scrollTop` 852 → 932 on an 18-batter,
15-pitcher roster at 1200×900): **exactly one header covered the top edge at
every one of them** — never zero, never two. A coarser 12px sweep over the whole
bottom third agrees. Were the gap ever made non-zero, that interval comes back
and reads as the header flickering off and on.

**Different column counts, one width.** The batter table has 11 columns and the
pitcher table 15, and `.summary-tables` is `width: max-content` with each table
at `width: 100%`, so both take the wider one's width and the narrower stretches
to meet it. That is what stops the batter table ending short of the scrolled-
right edge, and it is why the horizontal axis needed no work either. Measured on
the live roster, both tables and the column identical to the tenth of a pixel at
every width — **1200 / 1200 at 1200, 884.6 at 640, 784.1 at 390, 769.5 at 320**
— with the scroller's `scrollWidth` matching the column and **0px of page-body
overflow** at all four. Scrolled fully right at each, **both** headshot columns
pin at `left: 0` and the legend stays at 0 (−0.5 at 320, its own half-pixel).

#### The `Total` row is a divider now, and it totals the men above it

**The most useful row on the table was the one figure nobody could act on.** It
was a `<tfoot>` under *every* player on the tab — starters, bench and injured
list alike — which answers the question *what would my roster score if all
sixteen of them could bat at once*. Nobody asks that. What a manager opens a
roster to find out is what **tonight's team** is worth, and that is the men
above the line.

So the table is cut in two and the row is the cut: **the starters, the `Total`,
then the bench and the injured under it**, and the row sums only what is above
it. Measured on the live 12-team league, batting on 2026-08-15: eleven lineup
slots over the line and `Total · 11` reading `3/30 · 1 R · 0 HR · 3 RBI · 0 SB ·
.417 · 6 BB · 8 K`, which is the eleven rows added up to the character —
against a bench `BE` under the line (Carson Benge, `1/2`, 1 R, 1 HR, 1 RBI, 2
BB, 1 K) that the old foot would have carried into every one of those cells and
this one does not. The same cut in the Schedule view, same day: `Total · 11` and
`G 48` against the eleven rows' 4+4+5+5+4+4+5+4+5+4+4, and the per-day counts
`11 · 4 · 11 · 11 · 11` where three injured men below the line have games on
four of those five days and are counted on none of them.

**It is not sticky any more**, and the two facts are one fact: a row that totals
everything above it belongs pinned to the foot of the pane, and a row that
*divides* one half of the table from the other has to be where it falls or it says
nothing. Pinned, it sat across the middle of the rows it separates. Measured on
the live table at 1200×700 — pane 494px, row 48 — the divider now reads 689 →
489 → 271px from the top of the pane as the pane scrolls 0 → 200 → 418, where
sticky it held 446 at every one of them. The `position: sticky`, the `bottom: 0`
and the `z-index` went with it, as did the `z-index: 3` that lifted its pinned
headshot cell over a row hanging off the bottom of the box; what stays is the
dressing that makes it read as a rule under the numbers — the 2px top border,
the bolder ink, 15px of vertical padding against a body row's own. **Every
measurement above this section that reads "the pinned total row 1px off the pane's bottom" is a record
of a build in which it was pinned**, and each is left as written for the reason
this file leaves all its superseded reasoning: the number was true, and what
those passages were measuring — the pane meeting the window, the gutters, the
chrome — is untouched by a row inside it moving.

**Who is a starter is not the table's decision, and that is deliberate.** The
app has exactly one answer to that question — `App.tsx::starterKeys`, over
`lib.ts::projectStarters`, described above — and hands the table the keys it
keeps; `SummaryTable.tsx::splitStarters` does nothing but look them up. A test
written down there would be a second test that will one day disagree with the
first, and it would disagree **silently**, one set of men counted in the foot
while the line above it was drawn round another. *(The set was the `Starters`
button's while that button existed, computed whether it was pressed or not
precisely so the line and the filter could not part company. The button is gone
and the set is not: this row is what it is still computed for.)*

That means the word carries what were the filter's two readings, and its edge
cases. On your own roster a starter is a man in tonight's posted lineup or named
as today's starting pitcher; on a fantasy team he is a man **you** started on
some day of the range, however his real manager has him — so over
2026-08-12…08-19 a `BE` chip (Chris Sale, Jake Bennett) and a man since dropped
(Kevin Gausman, no chip at all) all sit above the line, every one of them
started on some day of that range, and `Total · 15` is those fifteen. **A player
the app cannot place goes below the line**, which is what the filter does with
him — it keeps what it can name and drops the rest — and it is the conservative
direction of the two: counting a man into a lineup he is not in overstates the
one row that is read as *what is tonight worth*, where leaving him out puts him
with the bench and leaves his own row adding up exactly as before.

**Two degenerate cases, and both are the old table to the pixel.** With nobody
above the line — nothing posted yet this morning, or a range the set cannot be
computed over at all (`startersKnown` false, `starters` null) — a divider would
divide nothing and label a total of nought, so the row goes back to the bottom
over everybody. With nobody below it — a team every man of which is in the
lineup — it is at the bottom for the ordinary reason, that there is nothing
after it. Measured on a table narrowed to those eleven on the same day: two
`<tbody>`s, eleven rows, `Total · 11` reading the identical `3/30 · 1 ·
0 · 3 · 0 · .417 · 6 · 8`. The rule reads the same at both ends — the row totals
what is above it, and what is above it is the whole table whenever the split has
nothing to say.

**Under the lens the plan answers, and that is the same rule rather than an
exception to it.** There is still exactly one test in the app for who is
starting; what changes is that over days nobody has played, ESPN's lineup is not
it. That one describes *today*, and on a span of days ahead the fallback is
today's lineup carried forward — an honest guess, made where the projection has
just filled every one of those days seat by seat. So a
man the plan starts on **any** day of the span is above the line, which is also
the set the `Lineup` foot beside it is a total over and the set each name
column's chip already names. The two halves of a straddling range each take
their own answer: the plan for the days ahead, your actual lineups for the days
behind, so nothing a man banked on Monday drops out of the foot because
Thursday's lineup has no room for him. **The test is the `Starts` column's own
figure** — *does it read more than nought* — rather than a second one written
here, which is the same rule this section opens with, applied to the lens: the
line and the number printed beside it cannot part company if they are one
count. (It was two tests for a day, the starter set answering for the played half,
and the `Starts` column has since been made to count that half itself — see
*Both halves, or it is not the row's count*.)

What it fixes is a line that could disagree with the total it labels. Measured
on team 4 over 8/19–8/23 before the change: **sixteen rows above `Lineup · 16`**,
among them Teoscar Hernández drawing `BE` and two men whose clubs have nothing
left — three players the plan seats on no day, in the half of the table that is
supposed to be what the plan gets. After: **thirteen above, `Lineup · 13`**, the
three below it, and Austin Riley and Christian Yelich (`1 of 4`, benched the
other three days) **above** it, which is the reading the user's own question
asks for — a man with a start in the range is a starter. On the reader's own
roster over the ordinary press (8/19–8/23) it is eleven above and the three on
the IL below, unchanged, since there the two tests already agreed.

**The team page runs it too, off the same arithmetic.** A matchup's team pages
are this component, and they handed it no starter set at all, so the divider
they drew was the old undivided foot. `LeagueTeam` computes the key set the way
App does — `projectStarters` over the span — so the two surfaces cannot draw the
line in two places. Measured on team 4's ordinary reading: `Total · 11` with
five below it, those eleven being exactly the men that team's manager started on
some day of the span.

**The count on the label is the count of what it totals**, which is the whole
point of the move: `Total · 9` on a sixteen-man roster is a figure a manager can
act on where `Total · 16` never was. `Lineup` still replaces the word where the
projection filled one, and both now narrow to the same set — measured under the
lens on `Today`, `Lineup · 11` over eleven rows with three injured below. The
title says the split is there, since the count alone cannot: nine of sixteen and
nine of nine read identically.

#### The count says how many it left out, and nothing under the line was ever dropped

*(Which supersedes the sentence directly above — the title is no longer the only
place the split is stated. The paragraph is left as written, this file's rule
for its own superseded reasoning, and it is the paragraph this one answers.)*

**It reads `Lineup · 11 of 14`.** *Nine of sixteen and nine of nine read
identically* is a correct diagnosis with the wrong remedy attached: it sends the
fact to a `title`, and the argument two paragraphs up — the one that made the
word `Total` change to `Lineup` — is that **half this app's traffic has no
hover**, so a figure a reader can misread has to be corrected *where it is
read*. The denominator is the correction, and it is the app's own `n of n`, the
form the projected slot chip and the `Starts` column's title already say a span
in. **`Lineup · 11` where the line has nobody under it**, since `11 of 11` is a
fraction that divides nothing — and that is also what keeps a table with no
split reading exactly as it did.

**Measured under the lens on the live fantasy roster over 8/21–8/23**, at 1400,
390 and 320: the label goes **69.1 → 104.8px** on the batting table
(`Lineup · 11` → `Lineup · 11 of 14`) and **71.3 → 107.1** on the pitching one,
the same width at all three, and the name column is **292.1 / 205.9px at 1400,
226.2 / 167.5 at 390 and 221.0 / 164.9 at 320 before and after** — it absorbs
the string whole. Every invariant the table is measured against is where it was
at all three widths and in the full-page box: table **1472.6 / 857.5 / 814.6**,
divider **48.00px**, rows **58.00**, header **51.00**, the pinned headshot column
at **left: 0**, page-body overflow **0**, and the label **16.0px tall**, which is
one line. **The totals cells are identical to the character** either side of the
change — batting `30.7 · 33 · 30.3/114.2 · 17.9 · 5.7 · 18.1 · 2.4 · .822 ·
14.3 · 28.1`, pitching `11.5 · 18 · 40.0 · 31 · 14.7 · 13.4 · 9.9 · 44.3 · 2.6 ·
2.9 · 1.2 · 1.7 · 3.02 · 1.02` — which is the point: this changes what the row
*says about itself*, never what it adds. **Both branches on one page**: with the
injured hidden (`hideil=1`) the batting table has nobody left below the line and
prints **`Lineup · 11` at 69.1px** again, while the pitching table keeps two
below and reads **`Lineup · 10 of 12`**.

**Bundle: 612,641 → 612,654 bytes of JS** (180,129 → 180,157 gzipped), 13 bytes
raw and 28 over the wire, and **CSS byte-identical** (160,799 / 28,501, same
content hash).

**And the request this answers was that the projected reading *drops* the bench,
which it does not and did not.** Worth writing down, because it is the reading
the page invites: driven under the lens on the reader's own roster over
8/21–8/23, the ESPN roster's **27 entries render as 28 rows** (Ohtani being two),
**11 batters above the line and 3 below, 10 pitchers above and 4 below**, in the
pane and in the full-page box alike — `splitStarters` partitions, and the second
`<tbody>` under the divider has drawn `rest` since the divider was written. What
the reader was looking at is that **every man below his line reads as a row of
dashes**: all six are on the IL, and the seventh, a starter whose turn falls the
day after the span, has nothing to project either. That is honest — *A row is
what he would do if he plays* only has numbers where he can play — and the two
bench arms he does have (`BE` on ESPN, McLean and Bennett) are **above** the
line, seated by the plan on the days their turns fall, which is the rule
*Under the lens the plan answers* sets out and which this user's own question
drove. So what was missing was never a row. It was the arithmetic: the label
counted 11 and said nothing about the 3.

**Two other ways of saying it were rejected.** Muting the group below the line
(`color: var(--muted)` on its `<tbody>`) is the app's mark for **a guess** —
`.start-row--projected` and `.start-row--estimated` are that rule and this file
argues it as *solid means measured, broken means ours* — and under this lens
**every** row is a projection, so muting three of them would say the wrong word
in the one reading where the word is already spoken. A named head row over the
group (`Bench · 3`, the Feed's section device) says the most and costs the most:
a row of the pane's height on a view whose whole geometry is *a fixed-height
column where every pixel under the table is a row of players off the bottom of
it* — the 37px the legend gave back, spent twice over, to name a group whose
rows already say what they are one by one (the `BE` chip, the `IL10` badge, the
`Starts · 0`). The label was already there and already carried a count.

**The divider is a `<tbody>` of its own**, which is what keeps the stripe
honest. `tbody tr:nth-child(even)` counts inside its own body, so the row is
always the first of its and takes no stripe, and the group under it stripes from
its own first row rather than from whatever parity the line happened to leave
behind. Measured at 1200: `#121314 / #202122` alternating down the eleven above,
`#2a2b2c` on the divider (`--panel-2`, and its pinned headshot cell names the
same ground rather than inheriting the page's `--bg`), then `#121314 / #202122 /
#121314` down the three below. The alternative was a third `nth-child` selector
and an `:not()`, which is a rule that has to be kept in step with the markup;
this is the markup saying it.

**Measured at 320 / 390 / 640 / 1200 / 1920, on both tabs.** Every invariant the
table is already measured against is unchanged at every width and on both:
page-body overflow **0**, the headshot column pinned at **0**, a **58.00px**
row, a **51.00px** header row, and the divider itself **48.00px** — the pinned
foot's own height, the padding being the only thing it kept. Batters split 11 /
1 / 3 and pitchers 10 / 1 / 5 at all five widths, the two tables behaving
identically by construction: the split, the label and the schedule-mode
narrowing are one function each, called twice.

*(Superseded, and kept for what it explains: the calendar is a full-width bar under the tab row now — see `client-dates.md`, **It is a bar, and it was a button** — so the bubble, the visually-hidden label and the square are all gone with it, and the phone run below is the mode toggles and `Starters` alone. The rule the paragraph establishes is why the bar states its days in full at every width.)* **The calendar cannot simply lose its wording, so its range moves to a bubble on the corner of the glyph** (`.date-toggle-bubble`). Its label is the only thing on the page saying which days every number on it is drawn from — that is why that button was never allowed to be a square in the first place — and an unlabeled calendar icon would leave it unsaid. The bubble says the same fact in the space a badge takes: `8/12`, or `7/29–8/12` over a range, from `tightRange` in `DateRangePicker.tsx`. **Numbers rather than the preset's word, always**, where the label reads "Today": a preset's name is a label's worth of text and this is a badge on a 36px square, where `8/12` says the same thing in half the width and says it exactly. It is rendered at every width and hidden by the stylesheet above 640, the way the date presets and their dropdown already are.

It hangs off the corner the way a notification badge does, and **it is anchored to the button's left edge, so a long range grows rightwards**, because a range is nearly twice as wide as a single date and the anchor decides which way that width grows. Anchored *right* it grew leftwards across its own button and into the starters toggle beside it — 3px of clearance on a fortnight's range, which reads as touching. It was **centered** for a while, which halves that problem and pays for the other half in a margin (below): the calendar sat 10px further from the button it belongs beside, at every width and on every range, for the sake of the widest one. Left-anchored the whole overhang is on the right, which is the one direction that is free — the calendar is the last group in the row, so it lands in the row's own slack and then in the app's 22px gutter — and the two filters sit at the row's ordinary 12px gap.

**No margin of its own, and the measurement is what it costs at the right edge.** Centered, the bubble needed `margin-left: 10px` to clear the starters toggle — a number sized against the row's own slack (at 390 the roster tabs and the two squares come to 315px of the 346 the gutters leave, so 31px are spendable before the calendar is pushed onto a line of its own, which is the whole thing the phone swap bought; 16px each side was tried and cost exactly that row at 375 and at 390). Left-anchored it needs none, so the gap from the starters button goes **23px → 13px** (12 between the buttons themselves) and is the same 13 at every width from 360 up. What it buys is paid on the right: the overhang past a 36px square is 18.6px on a fortnight's range and 29.5px on `10/29–10/31`, the widest string the app can print. Measured at 320 / 360 / 375 / 390 / 430 / 540 / 600 with that widest string forced into the bubble, on the summary view with the filter on: **no horizontal overflow of the page at any of them** — the only width where the row is full enough for the overhang to reach the edge of the screen is **360**, where a real range clears it by 4px and the widest possible one is clipped by 6, which is the price of the ten pixels and is paid in a corner rather than in the layout.

Open, the button fills with the accent and the bubble **inverts** (dark pill, accent text): same-colored, the two merged into one lollipop with a dark seam through the middle.

*(Superseded — the button the next six paragraphs describe is gone, and with it its glyph, its label rule and its filtering. They are kept for the two lessons that outlived it: an `<svg>` in a flex row is a flex **item** and needs `flex: none` or its `width` is a basis it shrinks below, and a narrow-screen block must sit **after** the family it overrides, a media query adding no specificity. Both rules now hold the roster row's two mode toggles up, and the stylesheet states them there. See **The roster row had one filter, `Starters`, and it is gone** above.)*

**The starters glyph is a clipboard**, which is what the filter is — the men written on tonight's lineup card. It was three shortening rules, a fair drawing of a filtered list, and it had to go because it was *optically* tiny rather than small: its strokes span 10 of the viewBox's 24 units, so at 15px they came to about 6px of ink adrift in the middle of a 36px square — fine beside a word, not fine as the whole of a button. It draws at **20px** against the calendar's 17 (the size every other icon button in the app uses), and spans **3–21 across and 2–22 down** of its viewBox, the first clipboard drawn here having been 16 units wide against the calendar's 18 — a tall narrow outline carries less weight than a wide one whatever its box says.

**But the thing that actually made it small was a missing `flex: none`.** An `<svg>` in a flex row is a flex *item*, and its `width` attribute is a basis it will shrink below the moment the line is tight; `.date-toggle svg` has carried the declaration since it was written and the starters toggle never did. Measured on the phone button, its 20px clipboard rendered **10px wide by 20 tall** — squashed to half its width, on the one button where the glyph is all there is. That is why raising the number from 15 to 17 to 20 kept not helping, and it is worth knowing which of the two symptoms is which: a glyph that is small *and the right shape* is a size; a glyph that is small *and the wrong shape* is a flex item. The rule now names the three toggles; the calendar was a fourth member taking a muted fill of its own, and left with the button (the bar's two chevrons declare `flex: none` inline for the identical reason).

**And the reason it had something to shrink toward is where the phone block sits.** Those rules were first written beside `.date-toggle`, five hundred lines above the `.research-toggle` family, and a media query adds no specificity — so `padding: 0` there lost to `.research-toggle, .starters-toggle { padding: 0 12px }` further down and the glyph was overflowing a 12px content box inside a 36px square, centered, which is why it *looked* right the whole time. The block now sits below that family, which is the honest fix for a whole block where `.date-row .date-presets` and the `.research-bar` dropdowns each go two classes deep instead. `.date-toggle` was never affected, its own base rules being above; it was down there so the pair read as one thing, and it has since left the block with the button. The narrow-screen rhythm block stays last in the file, as it must. Rendered ink after the fix: 15 × 16.7px for the clipboard against 12.8 × 13.5 for the calendar, and the tab bar is unchanged at every width, both buttons being fixed 36px squares on a phone.

Measured on the summary view with a range preset and the filter on, the tab bar goes **132px → 84px at 375, 390, 430 and 480** — the roster tabs and both filters now share one line where the calendar used to be pushed onto its own — and is **unchanged at 320, 360, 540 and 600**, and above 640. That 375 is what the bubble's clearance is budgeted against; it is the narrowest width the single row survives at. A `Filters` button holding both behind one disclosure was tried first and is worse at every width: it saved 11px where this saves 48, and cost 37px at both 320 and 540, where two labeled buttons already fit and a badge row underneath was pure addition.

**The button and the arithmetic are both shared now, and neither was when this was written.** A matchup's team pages ask the identical question of a leaguemate's lineup (see **Client — a league matchup**, *A team page carries the `Starters` filter too*), and a second button and a second projection would be two of each that will one day disagree. So the button is **`components/StartersToggle.tsx`** — the same class, the same lineup-card glyph, the same `.on`, the same phone rule, with only the *wording* left to each caller, because the reading genuinely differs and the label cannot say which. And the projection is **`lib.ts::projectStarters`**, with `startedOn` and `rangeDatesOf` beside it: `filteredCards`' two fantasy tiers are one call to it, the MLB tier staying its own. It takes the end-of-range answer as a **callback** because the two callers reach it differently — the app off the slot map it is already holding, a team page off the roster it read for its chips — and that same callback is the per-day map's own fallback for a day the server could not answer for. Checked after the lift, on the app's own roster over 2026-08-10…17: the per-day title, 15 rows → 13 and `71/292` → `68/276`, and `starters=1` still written to and read back from the URL.

Filtering happens in `App.tsx` (`filteredCards`, which is what both roster views render) **below** the kind split, where hide-injured is above it. The two are still different questions: an injured player is absent from every view for weeks, so dropping him before the split keeps the tab counts equal to the lists under them and reaches the edit screen's neighbors the same way, while "starting today" is about one afternoon and about the roster views alone. Below the split also leaves the Batters/Pitchers tabs alone, which is right: they say what is watched, not what tonight's lineups came to.

**Emptied, it says so in its own words** — on whichever of the three views it emptied, and in whichever of the *three* readings emptied it. The hide-injured message names the gear; this one names the toggle in the row above and adds the thing a reader needs at 9am: lineups post a couple of hours before first pitch, so an empty page in the morning may only mean they aren't out yet. **That excuse is wrong in fantasy mode and is not offered there** — your lineup is set the moment you set it, so an empty table means the kind on screen really is all bench and IL, and pointing at lineups still to post would send someone off to wait for something that has already happened. It says that instead, naming what the toggle is hiding. **And over a range it says *days* rather than today** (`nobody here was in your lineup on any of these days`), because the filter is no longer a statement about one afternoon there — a message reading "today" over a table showing last July would be naming a day nothing on screen is about. The toggle's own tooltip splits the same three ways for the same reason. The two messages can't both fire, the injured one requiring the kind's list to be empty before this one is applied. **Expanded, the toggle comes with the kind tabs and the date control** into `.expanded-chrome` rather than being reduced to a `.research-badge` the way the board's settings are: it is what the rows *are*, a table narrowed to nine names with nothing on screen saying why is the one state this must never be in, and being the live control it is also the way back out without leaving the page.

#### The tools row and the dates are inside the pane

**`paneChrome` — the app's own `.view-tools` and `.date-bar`, rendered as
`.summary-scroll`'s first children.** They are in the page on every other view;
here they are not, and the reason is the one this view has always turned on:
`.app.summary-mode` is a viewport-tall flex column in which only the pane
scrolls, and **a sticky box sticks to the box that scrolls**. A date bar left
above the pane is pinned to a column that never moves — it simply sits where it
was laid out — while the table's header row is pinned to the pane, 54px lower.
Two boxes stuck to two different edges, drawn as one band, with the first rows
of the table lost in the difference.

Inside, they stick against the same scrollport: the tools row scrolls away with
the rows, the bar holds at the top of the pane, the header row holds directly
under it. `thead th` takes `top: var(--pane-bar-h, 0px)`, set to the bar's
*measured* `--date-bar-h` by `.summary-scroll.has-pane-chrome` — **a class
rather than `:has(> .date-bar)`**, because the question is whose bar it is
rather than whether one is present: the expanded full-page box draws its own
above the pane, and a header row held 54px down under nothing there is a band of
rows showing through the gap. `SummaryTable` renders `paneChrome` only while
`!isFull` for the same reason, or the expanded box would hold two date bars.

**Both take `position: sticky; left: 0`**, which is the half a two-axis pane
adds and the half the legend at the foot of this same pane already documents:
without it a reader scrolled out to the K column leaves the dates behind at the
far left of a 1,900px content box. Their width is the pane's own client width —
a block child of a scroll container sizes to its content box, not to its scroll
width — so pinning at 0 puts them across the viewport exactly as they were. The
tools row puts the app's gutter back (`padding: 10px var(--app-gutter) 0`), the
pane having already bled through it; the bar does not, being a full-width band
by design with its own 10px of padding.

**Measured at 1200×900 on the live fantasy roster**, at rest → 600px down the
pane → 400px across it: `.app-chrome` **0 / 0 / 0** (static here, and always
visible), `.view-tools` **102 / −498 / −498** at x **0**, `.date-bar`
**158 / 102 / 102** at x **0**, `thead` **212 / 156 / 156**. At 390 the same
ladder reads 100 / 156 / 210 at rest with page-body overflow **0**. Expanded:
one date bar, in `.expanded-chrome`, `has-pane-chrome` off, `thead` at the
pane's own top (**117** against a pane at 116).

### The Schedule view: the days ahead, in place of the stats

**Both wide tables are cut by what has already happened, and the question a fantasy manager arrives with on a Sunday night is not.** *Who plays how many games this week, against whom, and which of my starters gets two turns* is answerable from neither the summary table (a roster's past range) nor the research board (the league's past season), and it is the question the whole week turns on. So both tables take a **Schedule view**: a column per day across the top, a row per player, each cell naming that day's opponent — `@ LAD`, `vs SEA`, a faint dash for an off day — with a per-row count of the games in the span and, on a pitcher's row, the days his club has **announced** him to start.

Everything about what a day *says* is `components/schedule.tsx` and is shared: the index, the cell, the two counts, the header. The two tables draw the same `ScheduleCell`, so a day read on the roster and the same day read on the board cannot come to say two things — the rule `PlayerIdentity` and `PhotoStatus` already set for the blocks those tables share.

#### It is a mode of the two tables, not a fourth page

**This is the decision the feature turns on and it was a close one**, so both sides are worth writing down. A page was arguable: it asks a different question of a different span from a different upstream, which is exactly the test that keeps Roster, Feed and Research three pages rather than one. What settles it is the **research board**.

The board's population is defined by five controls — the three include buttons, the position pills, the window tabs, the search box and the stat filters — and *a schedule of the shortstops nobody has rostered* is precisely the question a manager asks of it. A Schedule **page** would have to carry all five of them a second time, or answer a narrower question than the board already answers; so on the board it is a mode by force. And a feature that is a page on one table and a mode on the other is one thing wearing two shapes, which is what the stylesheet's fold-don't-restyle rule exists to prevent.

**The sharper statement of "a sort order is not a page" is what it comes to.** That rule collapsed Games into the Feed because the two differed only in how the same rows were *ordered*; the rule underneath it is that a page is a different **set of players**, and this is the same players with a different set of **columns** — which is what the board's own column picker changes without anybody calling it a page. The app already has one precedent of exactly this shape: the **full-page mode**, a mode on all three wide tables reached by one shared control.

What it costs is the honest half, and it is worth stating rather than glossing: the span really is a different one (forward rather than back), and the summary table's date control keeps a second job it always had — see below.

#### Two spans, and which two depends on the league

**They read `Week 19` and `Week 20`, and that is a measurement rather than a preference.** They read `This Matchup` and `Next Matchup` for a round, and the rows this strip rides in were laid out for the fallback pair it stands in for — so a named span wider than that pair costs the reader a line of pinned chrome. Driven on the research board's own wrapping bar, stepping the window 1000 → 1600 in 20s and reading the narrowest width at which the tools run and the strip share a line, batters and pitchers alike:

| the pair | strip | shares a line from |
| --- | --- | --- |
| `Next 7 · Next 14` (the fallback) | 144.3px | **1200** |
| `This Matchup · Next Matchup` | 228 | **1280** |
| `Week 19 · Week 20` | 162.6 | **1200** |

So at 1200 — a laptop — the long pair took a **third** line of the bar and the pinned chrome went **207px, where the numeric pair leaves it at 161**. The short pair costs that row exactly what the pair it replaces costs, which is the rule rather than the number: *a named span may not cost the row more than the numeric one it stands in for.*

**And the word is the app's own rather than a shorter invention.** A matchup period is `Week 19` on the League page's scoreboard head and on a matchup's own — see **Client — the League view**, *The week face* — so this is vocabulary the reader already has, and it says *which* fantasy week where `This Matchup` only said that it was the current one. The tooltip is unchanged and goes on expanding it (`The rest of matchup period 19 — 8/10 – 8/23`), which is where the dates were always stated.

**`This Week` / `Next Week` was rejected outright, and not on width** (188.6px, still 1280). The date presets a press away already carry a `This week` and it is the **calendar** week — two controls that close together reading the same words and meaning two different weeks is the one thing this run must not say, and it is the same argument that keeps `Next 7` spelled out beside window tabs reading `7d`. `Wk 19 · Wk 20` fitted from 1180 and `This · Next` from 1160; both were narrower than needed and neither names anything.

**Nothing moves under the finger that presses it**, which the pair had to be checked for rather than assumed: measured, `Week 19` and `Week 20` are **75.8px each**, and `Week 22` / `Week 23` are 75.8 too — the digits are the same advance, so no week number in a season moves the strip. Picking the other span at 1200 leaves it 162.6 wide at x=519; at 320 and 390 the `<select>` stays 100 wide at x=110 and x=145. And the bar's face, which prints the span's label, goes `SCHEDULE · THIS MATCHUP` at 204.9px to `SCHEDULE · WEEK 19` at **200**, one width on both spans.

**A connected league is offered its own two weeks and nothing else; everyone else gets `Next 7` and `Next 14`.** The named pair answers *which fantasy week* where the numeric pair answers *how far ahead*, and those are rarely the same span — on the live league today this matchup is a fortnight's playoff round with eight days left (Aug 16–23 drawn, of a period running Aug 10–23) and next runs Aug 24 – Sep 6. A manager setting a lineup is setting it for a **matchup period**, and the view could previously only offer him a rolling week that starts today and ends in the middle of one.

**The numeric pair is a fallback rather than two more options.** They were offered alongside the named pair for one round and are not: four pills where two will do is a control asking the reader to decide which *kind* of week he means every time he reads the table, and a manager whose league runs matchup periods plans in matchup periods. This week is what the mode opens on (`defaultScheduleSpan`), because it is the question the view is opened with.

**The test is both named spans, not the league**, and that is what keeps a one-option control off the screen: the last matchup period of a season has no `next`, and there the run is `Week 22 · Next 7 · Next 14` so the reader still has somewhere to go. A segmented control holding a single option is a control with no choice in it — the argument the matchup page's own strip already makes for a bye.

**A span this reader is not offered falls back to the one that is** (`effectiveSpan`), which is one rule where there were two: a `sched=7` link opened by somebody whose league names both its weeks draws this week, exactly as a `sched=matchup` link opened without a league draws `Next 7`. Either way the control marks the span the table is actually drawing — the one thing it must not get wrong — and the URL keeps what it was handed, the rule `cols=` follows. Measured both ways: `?sched=7` with the live league marks this week and draws its eight columns, and with the matchup read blocked `?sched=matchup` marks `Next 7` and draws seven.

**The named span starts today rather than at the period's own start**, for the reason every other span here does: the days already played are not days anybody can plan for, and every other column in this view is a day still to come. The pill's tooltip names the whole period (`The rest of matchup period 19 — 8/10 – 8/23`) so the reader can see which fantasy week it is as well as which days are drawn.

**They are offered only where there is a league to define them, and the gate is a connected league rather than `rosterSource`.** A matchup period is a fact about an ESPN league; which *list* the roster views read has nothing to do with which *days* a span covers. That is the same gate `Ros%` and the eligibility chip are on, and it is also why the **research board** gets the pair too: a board of free agents read for *next* matchup is exactly the pickup question, and it is a question the board could not previously ask.

**Absent, they fall back rather than vanishing.** `sched=matchup` opened by somebody with no league — or by somebody whose league read failed — draws `Next 7`, and the control marks `Next 7` as selected so it agrees with the table under it (`effectiveSpan`). The URL keeps what it was given, the rule `cols=` follows: a link says what it meant even where this reader cannot honor it. Measured with the read blocked: two pills, `Next 7` active, seven day columns.

**The dates come from a route of their own, and the scoreboard's own two dates are the wrong ones.** `getScoreboard` publishes a `start` and an `end` and both truncate at today for the period being played, and its `nextPeriod` is null on the current period by construction — ESPN materialises no future matchup period at all. So `/api/espn/matchup-window` derives both spans instead; the derivation, and the check that reproduces **every settled period exactly** on the live league, is in **ESPN fantasy league**, *The matchup window*.

#### Seven days or fourteen, and why the calendar was not reused

**The date control in the view bar names a *past* range that the stats are drawn from**, and its own label is the one thing on the page saying which days every number on it comes from. Reusing it here would make one control mean two things: every preset but `Tomorrow` — `Today`, `Yesterday`, `This week`, `Last 15 days` — would name a schedule of games already played, which is a schedule of nothing.

**That control offers a `Matchup` preset now and it is not this span**, which is worth stating plainly because the two share a word. Its `Matchup` is the fantasy week's **played** days — the period clamped to today, so the summary table's figures are the ones the League page's own category totals are summed over — where this run's `Week 19` is the days of that same period **still to come**, drawn as fixtures. One is what the week has come to and the other is what is left of it, which is the same split the projected lens makes beside them. See **Client — the date controls**, *And the fantasy week is a preset of its own*.

So the mode carries **its own span**, and the precedent is the research board's window tabs: a small segmented run in the control row, in the URL, naming which games the numbers are drawn from. This is that mirrored — which games are *coming*. **The numeric two are two questions**: seven is a planning week (*who plays how many games this week* is what the view exists for) and fourteen is the planning horizon — `nextGame.ts`'s own argument, a rotation turn being five days and an off day either side of the All-Star break the widest gap a club's schedule has.

**`SCHEDULE_DAYS` is no longer either of those numbers and is now 28**, which is how far the *window* reaches rather than how much of it is ever drawn: the widest *this matchup + next matchup* a league with fortnight playoff rounds can ask for is 14 + 14. It costs about three kilobytes — measured against MLB with the route's own `fields`, 14 days is 47,570 bytes raw / **3,129 gzipped** and 189 games against 28 days' 91,776 / **5,444** and 376, and our own response to a client goes 3,110 gzipped to **5,243** — for one shared read per baseball day. At 14 the named spans were answerable for an ordinary seven-day week and silently short exactly when a manager cares most, which is the failure this codebase least wants.

**They read `Next 7` and `Next 14`, spelled out, and that wording is load-bearing on the board**: the window tabs an inch away read `Season · 7d · 15d · 30d · 60d` and mean the opposite direction in time. Two controls both reading `7d` on one row, one meaning last week and one next week, is the one thing that bar must not say.

**The span starts today**, not tomorrow. The question is asked of a week that has begun, and `nextGame.ts` opens tomorrow only because it is asked exclusively about days holding no game at all. Today's column is headed `Today`, and a game already **final** goes muted while one in progress takes the accent green — so the column says at a glance which of its games are still to come. **A postponement is `PPD` in amber and is out of the count**: a postponed game is not a game he gets, and that is the one error that would make the count lie.

#### What the URL carries, and what it deliberately does not

**`sched=7` / `sched=14` / `sched=matchup` / `sched=next`, absent meaning off** — one parameter carrying both the mode and its span, so it can never say a span with no mode: a parameter that cannot describe the page it opens is a parameter that lies about it. It is in the URL by the rule `hideil=1` and `roster=fantasy` follow: it changes *what data the view is showing*, so a link that carries it describes a different table.

**It is not a saved preference**, and the line is `view`'s rather than `hideInjured`'s. Which *reading* of your players you are on is restored by a link and a reload, not by a record — that is the footing `view=feed` and `kind=pitcher` are already on — so there is no `UserPrefs` key, no route, and none of the already-touched ref dance the saved toggles need. **One flag and one span for both tables**, because they are one vocabulary the way `statRanks` says they are, and because "the next 7 days" — and "this matchup" — mean one thing wherever they are read.

#### On a phone the run is a dropdown

**How many spans a reader is offered is a fact about his league**, so the pill row's width is not ours to know: the fallback run measures **367px at 390 against the 346** the app's gutters leave, taking a line of its own and the pinned chrome from 207px to 255. The `<select>` is **134px** whatever the run holds and shared its line with the filter and calendar buttons beside it. *(Both the pill row and the `<select>` are in the **date bar's disclosure** now rather than in the tab row — the bar's arrows step the span, so the strip that names the whole run belongs under the label they move. The measurement above is what the row cost while it was up there; the board, which has no date bar, keeps its own copy in its own bar and is unaffected.)* A control whose shape depended on what somebody's league happened to publish would be worse than one that is simply a dropdown on a phone.

It is the app's own swap rather than a new one — the date presets, the research board's window tabs and its position row all become a `<select>` at 640, and `.schedule-span-select` is folded onto `.research-window-select` — `.date-presets-select` headed that list until the date presets went with the preset row — so every "pills on a desktop, dropdown on a phone" control in the app is one control by construction. **Both are rendered and the media query picks**, rather than a JS media test that could drift from the CSS. The hide rule is written as the two classes the pill row actually has (`.schedule-span.view-switch`) rather than scoped to a parent, because this run is drawn in three of them — the roster row, the board's tools and a team page's — and `.view-switch`'s own `display: inline-flex` is later in the file and would otherwise leave both on screen at once. That is the trap `.date-row .date-presets` already documents, met from a third direction.

**On a desktop the trim gave the roster row its line back.** The run measures **228px** for the named pair against 367.3 for the four that were briefly offered and 144.3 for the numeric pair alone; the roster row's pinned chrome at 1200 goes **161 → 115px**, back to what it was before the mode had a named span at all. The **board is unchanged at 207** there — 228px does not fit that bar's line where 144 does — and both are unchanged at 640, 900 and 1920. The cost is paid only while the mode is on either way.

#### The counts, and the two-start week that cannot be announced

**`G` is the games his club plays in the span, postponements out** — the half of the question the reader came for, and it is not a formality: measured on the live 2026 season, the next seven days spread **5 to 8** games a club (CIN and STL 8, MIN and PHI 5) and the next fourteen **11 to 14**. Over the next matchup week (Aug 24 – Sep 6) it reads **13 and 14** on the first rows of a real roster, which is the number a manager is actually choosing between.

**The column's own title says which span it counted**, in the span's own words — `Games his club plays in the rest of this matchup period` where a numeric span reads `in the next 7 days`. It is one function (`spanPhrase`) read by both tables, which it had to become: the summary table wrote that sentence out by hand and read **`in the next matchup days`** the moment a span stopped being a number.

**And a span the window cannot reach says so rather than under-counting in silence** (`ScheduleIndex.short`). It cannot happen in a league whose periods are a week or a fortnight — the window is 28 days and the widest *this matchup + next* such a league can ask for is 14 + 14 — so it is there for the league that runs three-week rounds, and for the rule rather than the likelihood. A span that merely runs out of **games** (the end of the regular season) is not short: the schedule really has no more days.

**`GS`, on the pitching table only, is the turns he gets in the span** — the ones his club has announced, and the ones his rotation slot puts him in — and the marker for two of them is the single most actionable thing this view can say.

**It used to count announcements alone, and the passage arguing for that is worth keeping because its measurement is what overturned it.** What it said was: *MLB probables reach about three days out* — on the live window, 28/28 slots filled today, 27/30 tomorrow, 30/30 at two days, then **3/22 at three, 1/30 at four, and none at all beyond** — so *over a fortnight the whole league has 89 announced starters and a maximum of one start each: `GS ≥ 2` is drawn correctly and fires for nobody today.* Every figure there is still true. The conclusion drawn from it was that **projecting the rest off a rotation slot is refused**, on the feed's Upcoming line — *"an announcement is the only thing that puts him there"* — and the same four-in-five reasoning.

**What that measurement actually says is that an announcement cannot answer this column's question.** A `GS` of 1 for every starter in the league is a column of noise, and *which of my starters gets two turns* — the thing the marker exists for, and the reason a manager opens this view on a Sunday night — was unanswerable **by construction**: the fact needed is three weeks of rotation and the source reaches three days. A column that fires for nobody is not a cautious column, it is an empty one.

**So the turns are projected, and the projection is measured rather than guessed** — which is the other half of what changed, and the half that makes the reversal honest. `server/src/rotations.ts` reads each club's own schedule for who started which of its games (MLB keeps `probablePitcher` on a game already played — **1,866 of 1,868 finals carry both sides**), takes the median gap between a pitcher's consecutive starts *in club games*, and steps that forward over the games still to come. Blinded against real announcements, a pitcher's own cadence lands his next start **41 of 51 exact and 51 of 51 within a day**; where his own record is too thin, his club's pooled rotation stands in and lands **9 of 9**. The feed's Upcoming rule is untouched and still right *there*, for a reason this view does not share: that section is a list of games a player is *in*, where a wrong entry is a game he is not playing, and this is a grid of a club's fixtures where the mark qualifies a day that is on screen either way.

**Three tiers, and the reader is told which.** A cell's chip and the `GS` count both carry the weight, and the ladder is the app's own — **filled** where his club has named him, **outlined** where his own rotation slot puts him there, **dashed** where his club's rotation does. That is the progression the percentile card's solid-against-dotted bar already draws and the Splits card's solid-against-hatched fill, applied to a grid cell where a word will not fit; each chip's `title` carries the sentence, and the cadence with it (`a turn every 5 club games`). See **Client — the player page**, *Projected Starts*, where the same three tiers are drawn as words because a row there has the width for them. (**The cell's own chip is a border round the opponent now**, with `SP` breaking its bottom stroke, and the fill is gone with it — see *The `SP` mark is a border round the day* below. The `GS` count still wears the ladder exactly as this paragraph describes.)

**The `GS` count takes the *weakest* tier among the turns it counts**, so a `2` built on one announcement and one guess is drawn as a guess and its title says so (`2 turns in the next 7 days — 1 announced · 1 projected from his own pace`). Drawing it as a fact would be the one thing this column must not do — and it is the ordinary shape rather than a corner, an announced Monday and a projected Saturday being exactly what a two-start week looks like three days out.

**A pitcher off the active roster gets no projected turn at all**, which is where the feed's rule *does* apply and is taken from it: *"someone off the active roster — hurt, suspended, optioned — is in none of them"*. A man on the IL is not making a start his slot happens to fall on, and the app already knows — measured before the rule, **10 of 170 pitchers with a slot (6%)** were drawing chips for starts they could not make, 5 on the 15-day IL and 5 in the minors. An **announcement still stands**, a club naming a returning starter before the transaction posts being ordinary. A pitcher on *no* 40-man roster is left projectable, absence being ambiguous between released and a failed read — see `projectStarts`.

**What it costs the wire is 2.6KB gzipped.** The projections ride on `/api/schedule` beside the games rather than taking a route of their own, keyed by player id and carrying only the *unannounced* turns — an announced one is already on the game as `homeProbableId`. Measured on the live board: **5,177 → 7,860 bytes gzipped** for 160 pitchers and 710 projected starts.

#### And the cell names the man the other club is throwing

**A cell said which club, and a manager does not set a lineup against a club.**
`vs SEA` is half a sentence: whether you start a left-handed hitter on Saturday
turns on who is on the mound for Seattle, and that was the one fact this grid —
built out of a payload that names both sides' starters — declined to say. It says
it now, on a second line: **`RHP Alcantara`**, hand and surname.

**The vocabulary is the app's own rather than a new one.** `handThrows` and
`surname` are `lib.ts`'s, and they are what the summary table's opponent cell and
the feed's Upcoming bar already write a starter in (`vs LHP Gasser`); the `vs` is
dropped here because the line above it has already spent that word on the club.
So a starter named in the grid and the same starter named on the row's ordinary
opponent cell are one string built by one function.

**Announced where his club has named him, projected where a rotation slot puts
him there** — the same three tiers the `SP` chip beside it carries, because it is
the same question asked about the other side. **The player page's Schedule tab
draws the same line off the same resolution**, in a row rather than a cell and
so with the tier's underline and none of the 10px caption this column's width
argues for — see **Client — the player page**, *The Schedule tab: what he has
coming*, which sets out what it folds onto and what it deliberately does not. What that buys is the whole of the
argument for reading the projection here at all: measured on the live 28-day
window, of **750 game-sides** an announcement can name **75** — clubs name a
probable about three days out — where announcement-plus-projection names **610
(81.3%)**. A grid that could speak for the front three days now speaks for four
weeks.

#### The wire says who is starting and never says for whom

**That is the one thing standing between `rotations` and this feature**, and it
is worth setting out because the fix is a derivation rather than a lookup. A
projection is a list of `gamePk`s hung off a player id (`RotationProjection`),
and a game names two clubs; nothing in the payload says which of them is his. So
`buildStarters` resolves it, by two routes that check each other:

- **An announced probable names his club outright** — he *is* the
  `homeProbableId` of a game whose home club is that club. No inference at all.
- **A pitcher's projected turns are all his own club's games**, so the club
  common to every one of them is his. Two games settle it and most pitchers have
  five.

**Measured on the live window rather than assumed**, which is what makes the
second route safe to lean on: all **163** pitchers with a projection resolve to
exactly one club — **77 by announcement, 86 by intersection** — and where both
routes answer they **agree on all 77, with 0 disagreements**. Not one projected
turn lands on a game its own pitcher's club is not a side of. A `Map` from
`gamePk` to club to one man falls out of it, built once at index time so a cell
drawn thousands of times is two `Map` reads.

**A pitcher's own row was the obvious third route and is the wrong one.** Every
row of these tables carries a `teamId`, so the club of a pitcher who is *on the
board* is free — and that is exactly the population it cannot answer for: an
opposing starter is usually somebody nobody has rostered and no filter has put on
screen. A resolution that works only for the men already in front of the reader
is no resolution.

**Both passes read the whole window rather than the span**, which is deliberate:
a club is derived from every game a pitcher's slot touches, so narrowing the
evidence to seven days would leave a man with one turn inside it unresolvable
when the fortnight around him settles it. What is drawn is then cut by the
columns, which is the span's own job.

#### Nobody is named where the answer is not one man

**Four ways that happens, each a silence rather than a guess** — the direction
every join in this app fails in, and each counted over those 750 game-sides:

- **Two of a club's starters project onto one game.** `rotations.ts` steps each
  pitcher's slot forward independently, so slots collide: **90 sides** have two
  candidates (84) or three (6). There is nothing in the payload to prefer one —
  cadence says how often a man goes, not who is up — so naming either would be
  naming the wrong man about half the time.
- **The season roster has never heard of him** — **11 sides**, so there is no
  name to print. Printing the id would be showing a reader a number.
- **Nobody is starting at all**, announced or projected — **39 sides**.
- **The club could not be derived** — **0** today, and the reason it is still a
  branch is that a pitcher with a single projected turn and no announcement
  anywhere in the window would be genuinely ambiguous.

**And a postponed game names nobody**, which is the tier logic's own rule one
step further on: an announcement for a game that is not being played means
nothing now, and the projection never places a turn on one. The live window holds
no postponement to observe, so it was forced — two games rewritten to
`postponed` in the response drew **5 `PPD` cells and 0 starters**, their titles
reading `vs WSH — postponed` with no starter clause.

**Silence is *absence*, not a dash.** A dash in this grid already means *no
game*, and a cell that spent it on a starter would be lying in a vocabulary the
column has already taught.

#### The tier is an underline, and the underline costs no height

The three weights are **the `GS` count's own** (`.sched-gs`) rather than a fourth
mark: nothing where his club has named him, a **solid** underline where the slot
is our reading of *him*, a **dashed** one where it is his club's rotation
standing in. An announcement is the fact this grid is otherwise short of, and a
fact needs no caveat; the sentence is on the cell's own title (`vs DET — Chase
Anderson (RHP) — projected from his own rotation slot`).

**`text-decoration` rather than a `border-bottom`, and that is a height decision
rather than a stylistic one.** A border is part of the box, so it would have to
be reserved `transparent` on the announced tier or a cell would change height as
clubs name their probables through the week — and reserved, it costs every one of
these lines a pixel on a grid fourteen columns wide that stacks two of them on a
doubleheader. An underline is painted rather than laid out. Measured across
Midnight, Dark, Light and Powder Blue, all three tiers render at **11px** and
resolve their own theme's `--muted`, so the ladder cannot change a row's height
by construction.

**`--muted` on all three**, for the reason the `SP` chip beside it already
records: a third step down to `--faint` puts a label a reader has to *read* at
3.18:1 on Midnight's zebra stripe, where `--muted` measures 6.08. The ladder is
carried by the structure and every tier stays legible.

#### And the tier is italic now, not an underline

**The passage above is left as it stands because its height argument is still
the one in force** — what changed is *which* painted mark carries the tier, not
that it is painted. The solid underline on `projected` is gone and the two
unannounced tiers are **italic**: `LHP Rogers` for a slot we read off his own
cadence, and italic under the same `--faint` dashed line for one read off his
club's rotation. `announced` is still upright and undecorated.

**One word, said the same way in both places.** The `SP` mark on the row's own
pitcher goes italic on exactly the same two tiers (see the section below), so a
slanted name and a slanted `SP` are the same caveat about the same game and a
reader learns one thing rather than two. The underline it replaces had a second
problem: a *solid* line is the measured half of this app's own
solid-against-broken ladder, spent on the half that is ours.

**Dropping the dashed line as well was the tidier option and was rejected.**
With the solid one gone the dashes no longer mean "unannounced" — they mean *his
club's rotation, not his own*, which is what dashes have meant here since the
percentile card's first dotted bar — and italic alone cannot say which of two
unannounced tiers a name is in. A 10px caption has room for one more signal and
this is the one that costs no height.

**Measured, and the height claim holds either side.** All three tiers render at
**11px** in the grid before and after, and at **16px** on the player page's
Schedule tab, which wears the two modifiers on its `.ovw-next-vs` line — driven
there and read back: four announced names upright at 16px, six unannounced
italic at 16px, the estimated ones carrying the dashed line. The whole change
costs the table **≤0.17px of width** at every measured state (roster 760.50 →
760.67 at 390, board 748.42 → 748.59 at 320).

#### The `SP` mark is a border round the day, with the word breaking its bottom stroke

**A pill under the opponent made the reader pair two things; a border round the
opponent is the one thing.** The mark is a fact about a *day* — he is starting
this one — so it is drawn as the day, with `SP` sitting in the middle of the
bottom stroke the way a fieldset's legend sits in its border. What was three
lines in the cell (`vs PIT`, the starter's name, an `SP` pill) is two.

**And it buys the row back.** The pill was a laid-out third line — 12.8px plus a
pixel of margin — which put a start day's cell at 39.19px against the 33px a
58px row leaves between its 12px paddings and its rule, so **the row grew to
64.19**. The legend is `position: absolute`, so it costs the cell nothing but
the 5px the box reserves below itself for the half of the word that hangs under
the stroke. Measured on the live roster (pitcher tab, `sched=7`) and the SP
board at **1400 / 390 / 320**, with an `estimated` tier forced into the payload
so all three draw:

| | start rows before → after | cell content | plain rows |
| --- | --- | --- | --- |
| roster · 1400 / 390 / 320 | 58×3 + **64.19×4** → **58×7** | 39.19 → **32.39** (21.39 with no starter named) | 48×1 + 58×7, unchanged |
| board · 1400 / 390 / 320 | 58×3 + **64.19×29** → **58×32** | 39.19 → **32.39** | 58×18, unchanged |

That is **33 of 39 start rows on the two tables back to 58px**, the figure the
other three wide tables keep, and it is the honest reversal of the "+6.19px a
start day" line the table above this section records as the cost of naming the
opposing starter. Column widths move by **≤0.17px** and page-body and document
overflow are **0** in all six states.

**The box is a flex container rather than the block a flex item is otherwise
blockified into**, which is worth 1.2px of that budget: a block draws a *strut*
off its own inherited font — the `<td>`'s 13px against the opponent's 12 — so
the first pass measured **17.59px** of box round a 14.39px line, put the cell at
33.59 and the row at **58.59**. A flex container has no strut; the box is
16.39px and cannot drift if the opponent's own size ever changes.

**The negative right margin is what keeps the column lined up.** A day cell is
right-aligned so the abbreviations share one edge down the column, and 4px of
padding plus a 1px stroke would push a start day's `vs PIT` 5px in from every
other day's. Pulled back by exactly that, the *text* holds the edge and the
stroke overhangs into the cell's own gutter — and **5px is the number because it
is the floor of both gutters**, `clamp(5px, 1.9vw, 28px)` on the summary table
and `clamp(5px, 1.6vw, 13px)` on the board, so the stroke can touch a column
boundary and can never cross one. Measured over **79 start-against-plain pairings
on the roster and 1198 on the board**, the two opponents' right edges agree to
**0.00px**; the tightest the stroke comes to its own `<td>`'s edge is **0.11px**
(board at 320) and **1.08px** (roster at 320).

**The legend's ground is `var(--cell-bg)`, and that is the whole of how the
stroke breaks.** This is the rule the stylesheet already states for the summary
table — a cell's ground is *named* rather than assigned, because two things need
the same color and must not be able to disagree: here the cell behind the box
and the patch of it painted over the stroke. Assigning `--bg` would put a
page-colored notch in every even row's zebra stripe and in all four live-role
tints. Checked on both tables at all three widths: every legend's computed
`background-color` is byte-identical to its own `<td>`'s — two values in play,
`rgb(32,33,34)` on the page and `rgb(18,19,20)` on the stripe — and the legend's
center sits **0.00px** off the stroke's, which is what `bottom: -0.5px` plus a
half-height translate buys over a plain `bottom: 0` (that lands the word on the
padding box's edge and leaves the line visible under it).

**The ladder survives; the fill does not.** Three weights, still: an **accent
solid** stroke where his club has named him, a **muted solid** one where his own
rotation slot puts him there, a **dashed** one where his club's rotation does —
and the legend italic on the two nobody has announced. The 14% accent *fill* the
announced pill carried was dropped and is the alternative rejected here: inside
a stroke that now encloses `vs PIT` it tints the opponent rather than the mark,
which reads as a box that has grown or as a selection — and this table already
spends a ground on the zebra stripe and four live-role tints. What the fill said,
the accent hue says.

**Each cell's `title` is untouched** — `vs PIT — his club has announced him to
start`, `@ BOS — estimated to start — his club's rotation, his own record being
too thin to read one off — Sonny Gray (RHP) — announced by his club` — read back
off the rendered cells before and after and identical, as is the legend's own
(`TIER_TITLE` plus the cadence).

**Bundle: 600.22 → 600.35 KB of JS** (178.72 → 178.74 gzipped) and **158.32 →
158.34 KB of CSS** (28.30 → 28.37) — 130 bytes and 20 bytes raw, for a mark that
gives 33 rows their 58px back.

#### The stroke encloses both lines, and the legend stopped crossing the top one

**The border was round the opponent alone, and the opposing starter hung loose
underneath it.** That is the pill-under-the-opponent shape the section above
replaced, one line lower: a box round `vs PIT` and a caption below it, two
things in a cell with nothing saying they were one, and the reader pairing them.
The mark is about a *day*, and the man the other club is throwing that day is as
much a fact about it as the opponent is — so `.sched-vs` goes **inside**
`.sched-opp-box`, which is now a column flex aligned `flex-end` like the cell
around it. Measured on the live roster and the SP board at 1400 / 390 / 320: the
starter line sits inside the stroke on **3 of 3** start cells that name one on
the roster and **26 of 26** on the board, where it was 0 of 3 and 0 of 26.

**The legend was overlapping the opponent the whole time, and that is the fault
this change had to answer rather than inherit.** `SP` is centered on the bottom
stroke, so half its 9px line falls *inside* the box — and inside the box was
`vs PIT`. Its ground is opaque (`--cell-bg`, by the rule above), so the mark was
painting over the bottom four pixels of the opponent on **6 of 6** start cells on
the roster and **29 of 29** on the board. It went unnoticed because a team
abbreviation is all caps and has no descenders to lose; a pitcher's surname does,
and pulling `RHP Gray` inside the box would have put a nineteen-pixel notch
through the middle of a name.

**So the half that hangs upward is reserved as padding inside the box**, and the
old `margin-bottom: 5px` — which reserved the half that hangs *downward*, back
when there was a caption below to protect — is what pays for it. The two are the
same five pixels moved from outside the box to inside it, which is why the cell
is **the same height either side of this change**: 32.39px on a start day with a
starter named, 21.39 without, and the row **58**. The downward half now leaves
the cell altogether and lands in the `<td>`'s own 12px bottom padding (measured
4.00px of overhang against 13.31px of padding).

**Reserved by arithmetic rather than by a laid-out ghost**, which is the one
place this app's *reserve the worst case, don't declare a height* rule is
answered with a number — and it is answered with a number because the worst case
here is not a function of anything this app does not control. `.sched-sp`
declares its own `font-size: 9px` and `line-height: 1` precisely so the legend's
height cannot be whatever `normal` resolves to; 9px tall by construction is 4.5
above the stroke, and 5 is what the box already spent on it. A ghost laid out in
the flow would reserve the whole 9 and cost the row 4px for nothing.

**Measured, before → after, at 1400 / 390 / 320 on both tables** (roster pitcher
tab `sched=7`, board `pos=SP`):

| | before | after |
| --- | --- | --- |
| legend overlapping a text run | 6/6 roster, 29/29 board | **0, 0** |
| starter line inside the stroke | 0/3, 0/26 | **3/3, 26/26** |
| cell height (start day, starter named) | 32.39 | **32.39** |
| row heights | 48 / 58 roster, 58 board | **unchanged** |
| right-edge agreement, start vs plain day | ≤0.01px over 88 + 330 spans | **≤0.01px** |
| legend center off the stroke's | 0.00px | **0.00px** |
| legend ground vs its own `<td>`'s | identical | **identical** |
| page-body overflow | 0 | **0** |

**What it costs is width, and only where a start day is the widest cell in its
column.** The box's 4px of side padding and 1px stroke now wrap the *longer* of
the two lines rather than the shorter, so a column whose width was set by
`RHP Misiorowski` gains the box's 10px minus the 5px the negative right margin
already gives back. The tables go **676.28 → 686.28** at 390 and **658.94 →
668.94** at 320 on the roster, **654.25 → 663.66** and **637.03 → 646.44** on the
board, and are **1400 either way** at 1400 where both have slack. Both tables
scroll sideways at a phone width in any case, and the page body overflows by 0 at
every width before and after.

**A doubleheader pays 3px for it.** The upper cell's legend used to hang into the
box's own bottom margin and so stayed inside its cell; it now hangs past the
cell, into the gap between the two. `.sched-cell + .sched-cell` goes **2px → 5**,
which is the same half-legend the box reserves above the stroke, and is only ever
paid on a day a club plays twice.


#### What it costs is width, which is free here, and one row a screen, which is not

**The label is surname and hand rather than the whole name**, and that is
measured rather than inherited. Over the **134** pitchers a live 28-day window
actually draws, the label runs 7 characters to 17 with a median of 10, and the
widest the whole 760-man pitcher list can produce is `RHP McCullers Jr.` at the
same 17; rendered, the widest drawn is **`RHP Smith-Shawver` at 101.3px**, against
a column the two-line header sets at ~59. Full names would put `RHP Sandy
Alcantara` in that column.

**Dropping the hand was the obvious narrower option and buys nothing worth
having.** It would take about 24px off every column — some 336px off a fourteen-
day table — and width is the one thing this grid can afford: the tables scroll
sideways and **page-body overflow is 0 at every width measured**. The hand is
also the half a manager acts on first, and on a touch device a `title` is not an
answer. So the width is spent, and the height is what gets defended.

**Measured at 320 / 390 / 640 / 1200 / 1920**, on the Roster summary table and the
research board, on the batter tab and the pitcher tab, over both spans this reader
is offered — with the line stripped out of the same page at the same instant,
which is this repo's own A/B. **Page-body and document overflow are 0 in all 40
states**, before and after.

| | table before → after | row (max) | rows on screen |
| --- | --- | --- | --- |
| roster/batter · matchup (6 days) | 656.8 → **822.53** … 1920 → 1920 | 58 → **58** | 8/10/11/11/12 → **unchanged** |
| roster/batter · next (14 days) | 1105.69 → **1530.05** … 1920 → **2275.47** | 58 → **77.78** | 8/10/11/11/12 → 7/9/10/10/**10** |
| roster/pitcher · matchup | 627.91 → **790.23** … 1920 → 1920 | 58 → **64.19** | 8/10/11/11/12 → 8/10/11/11/**11** |
| roster/pitcher · next | 1081.27 → **1484.36** … 1920 → **2271.53** | 69.58 → **91.58** | 8/10/11/11/11 → 7/9/10/10/11 |
| board/batters · matchup | 586.19 → **797.92** … 1920 → 1920 | 58 → **58** | 7/9/10/10/10 → **unchanged** |
| board/batters · next | 1025.53 → **1542.5** … 1920 → 1920 | 58 → **77.78** | 7/9/10/10/10 → 6/8/9/9/9 |
| board/SP · matchup | 612.92 → **841.66** … 1920 → 1920 | 58 → **64.19** | 7/9/10/10/10 → 7/**8**/10/**9**/10 |
| board/SP · next | 1042.8 → **1521.95** … 1920 → 1920 | 69.58 → **91.58** | 7/9/10/10/10 → 7/**8**/10/**9**/10 |

**The height is the honest cost and it has exactly two causes**, both arithmetic
on a budget the row already had. A day cell is 24px of padding inside a 58px row
set by the 42px headshot, so the content budget is **34px**. The opponent line
measures 14.39 and the new one 11 — **25.39, which fits with 8.6 to spare**, and
that is why the batter side over a matchup span costs *nothing at all*. Add the
player's own `SP` chip (12.8 and a pixel of margin) and the budget is gone; stack
two games on a **doubleheader** and it is gone twice over. So:

- **A pitcher's start day is +6.19px** — the third line — which on the SP board is
  26 of 50 rows and costs **one row a screen at 390 and 1200** and nothing at 640
  or 1920.
- **A doubleheader row is +19.78px**, and it is rare: **4 day-cells of 196** on
  the roster and **9 of 700** on the board. It is also the case that most earns
  its space, both games getting their own man — measured, `vs AZ / RHP Kelly`
  over `vs AZ / RHP Pfaadt`.

**Nineteen of the 40 states lose a row and eighteen of those lose exactly one.**
The worst is the batter roster over 14 days at 1920, **12 → 10**, where three of
its fourteen rows hold a doubleheader. That is the cost this repo has accepted
before by name — *"the cost is one row a screen, counted rather than
estimated"* — and it is spent here to fill four fifths of a grid that could
previously speak for three days.

**The sticky columns are untouched**, checked with the pane scrolled to its far
right and 200 down in every state: the headshot column pins at **0** on both
tables, the board's name column at **68** from 820px up (and correctly scrolls
away below it, which is that breakpoint's own documented behavior), and the
header row sits at **0** in the summary table's scrollport and **1px** — the
border — in the board's.

#### The grid waits for the season roster, because the name decides the height

**The names come off `seasonPlayers`, which is a *different* read from the
schedule**, and that is the one loading hazard here. `/api/players` is held from
boot for the header search, so naming a pitcher costs no request — but a grid
drawn before it lands and again after would **grow under the reader**: 6px a start
day on a pitcher's row. Measured on a `?sched=` deep link, where both reads go out
together, `/api/schedule` finished **3ms before** `/api/players`, so the two-paint
window is real rather than theoretical, and on a cold 207KB list it is however
long that takes.

**So `scheduleIndex` waits on `playersLoading` as well as on the window**, and it
is that flag *settled* rather than succeeded — it starts true and is cleared in
the read's `finally`, so a list that **fails** settles it too. The rule
`initialLoadSettled` already follows for the view tabs. It costs the ordinary path
nothing, the toggle being pressed long after boot, and rule 1 is intact: with the
index null both tables go on drawing their **stat columns** rather than blanking.

Driven with `/api/players` held 6 seconds: at t+500ms the table is drawing its
stat columns (`days=0, cells=0`), and at t+6000ms the whole grid appears **once,
complete**, with 59 names — no intermediate grid. Driven with it **blocked
outright**: the grid draws in full (6 days, 84 cells) with **0 names** and the row
back at 58, which is the honest degraded state.

#### Validated against the raw payload, cell by cell

**Every drawn cell was checked against `/api/schedule` by a second
implementation** sharing no code with the client: a cell's own opponent text names
the opposing club, so the expected starter is that club's for that game, resolved
independently from `homeProbableId`/`awayProbableId` and the `rotations` map (a
doubleheader's Nth cell paired with its Nth game).

- **`next` span, 14 days, 638 cells checked**: **502 named and 0 wrong**; 136
  silent, and every one of the 136 correctly so.
- **`matchup` span, 6 days, 277 cells checked**: **232 named and 0 wrong** — 132
  announced, 92 projected, 8 estimated — with 45 correctly silent.

That is **734 cells named across all three tiers and not one of them wrong**, and
181 silences every one of which the payload agrees could not be filled.

**Bundle: 574.32 → 576.42 KB of JS** (170.85 → 171.51 gzipped) and **154.95 →
155.48 KB of CSS** (27.73 → 27.80) — 2.1KB and 0.5KB raw, 0.7KB and 0.07KB over
the wire, for a club derivation, an inverted index, a line in every cell and the
paragraphs above restated where the rules are.

#### And each day's cell in the `Total` row is a body count

In schedule mode each day's cell in that row is **how many of these players have a game that day** — the "do I have enough bodies on Thursday" question, which no other view in the app can answer and which falls out of the same pass for nothing. Measured on a real 12-man fantasy roster: `Total · 12 | 75 | 12 12 12 9 12 12 5` — twelve on each of the first three days, nine on Monday and five on Thursday, over 75 games in the week. The two leading cells are the ordinary sums.

*(That row is a divider between the starters and the bench now rather than a `<tfoot>` over everybody, and this mode narrows with it — the counts are of the men above the line, `ScheduleTotalCells` taking the same list the stat totals do. Measured on 2026-08-15 with the live league: `Total · 11`, `G 48` against the eleven rows' own 4+4+5+5+4+4+5+4+5+4+4, and `11 · 4 · 11 · 11 · 11` down the days where three injured men below the line have games on four of the five and are counted on none. The question the cell answers is unchanged and is now asked of the team you are actually playing: an injured man is not a body you have on Thursday. See *The `Total` row is a divider now*.)*

#### What the mode swaps, and what it leaves alone

The **opponent column goes** with the stats: it is one representative game's matchup, and the whole table beside it is every game of the span. Everything else on the leading cells stays — the headshot with its lineup pip and status code, the fantasy slot chip, the identity block, the row tints and their legend — because none of them is about the columns.

**The calendar is untouched**, which is the same split the board makes between the controls that decide which rows and days a report is built from and the ones that dress its columns: this changes which *columns* the table has, where the calendar decides which days the report came from. *(The `Starters` filter was the other half of that pair and is gone — see above.)* The calendar keeps the second job it always had — over a range the report's player list is the roster as it stood on those days — so it still says whose roster is on screen even when nothing on screen is drawn from those days.

**The toggle leads its group**, ahead of the calendar, which is this row's own documented order rather than an exception to it: the questions come in the sequence *which page, which kind, **which reading of it**, which players, which days*, and the mode is literally the third of those. (On the board it reads in the tools run after the controls that narrow rows and before the two that dress the columns, which is that run's own order — the two placements answer to two different rows and each is argued where it sits.)

**Expanded, the mode and its span come along as live controls** rather than being reduced to a badge, exactly as the kind tabs and the dates do: a grid of dates with nothing on screen saying how far it runs is the one state this must never be in, and the toggle is also the way back to the stats without leaving the page. (The board, whose expanded chrome is badges, gets a badge instead — see **the research board**.)

**Nothing blanks while the window is being read.** The mode is the *presence of an index* rather than a flag beside one — App holds the window and hands the table an index only once it has landed — which makes "in schedule mode with no schedule" impossible to draw: both tables go on showing their stat columns until it lands, which is rule 1 of the app's loading system, and the only mark the press leaves is the spinning baseball inside the toggle that started it. A read that **fails** leaves the stat columns standing and says so in a banner of its own, separate from the report's, since the report behind the page is untouched.

#### Measured

**At 320 / 390 / 640 / 1200 / 1920, on both tabs, with the pane scrolled to its far right and its foot.** Every invariant this table is already measured against is **unchanged in both modes and at every width**: no horizontal overflow of the page body (**0** everywhere), `--table-bleed` at 22px with the pane **0 from both edges**, no border above the pane, the headshot column pinned at **0**, the pinned total row **1px** off the pane's bottom, a **58.00px** row, and the four-item legend still landing on the window.

What moves is three things. The **header row grows 51.00 → 51.30px** — the day header is two lines (`Fri` over `8/15`), which is what keeps a column as narrow as the matchup under it rather than as wide as its own label; measured, it sits fully inside its cell with **12–13px of clearance top and bottom** on both tables and clips nothing. **It needs no width floor of its own**, which was checked rather than assumed: a `min-width` was written and measured to bind at no width on either table (the two-line header sets the column at ~61px against a `vs SEA` that wants ~40), so it was taken out again rather than left as a number that never fires. The **table widens**: batters 690.33 → **719.98** at 390 and 1200 → 1200 at 1200 (the surplus is absorbed, as always), and over fourteen days 690.33 → **1136.42** at 390 and **1664.63** at 1200, which scrolls sideways as this table always has. And **rows on screen cost one at 390 and 640** — 11 → 10 and 12 → 11 — which is the span tabs taking a row of chrome (159 → 207 and 111 → 159) rather than anything the table did; 320, 1200 and 1920 are identical at 9 / 12 / 12.

**Bundle: 466.09 → 473.58 KB of JS** (138.60 → 140.65 gzipped) and **106.85 → 107.85 KB of CSS** (19.09 → 19.27) — 7.5KB and 1.0KB raw, 2.1KB and 0.2KB over the wire, for a route, a shared module, a control drawn twice, the columns for two tables and the paragraphs above restated where the rules are.

**And for the projected turns**, driven at 1400 and 390 in both color schemes, on the board and the summary table: **page-body overflow 0** everywhere, rows **58.00px** and the header row **51.00** unchanged, and the board's 14-day grid drawing **37 announced, 57 projected and 5 estimated** chips over 279 rows. Sorting the board by `GS` puts the two-turn rows on top and every one of them is an announced turn beside a projected one — the pair that was undrawable before. The three chip weights resolve distinctly in both schemes (Midnight: accent-filled, `--muted` solid, `--muted` dashed; Lavender the same through its own tokens), and the **ink stays `--muted` on both guesses rather than stepping down to `--faint`**, which is measured: `--faint` puts a 9px bold chip at **3.18:1 on Midnight's zebra stripe** where `--muted` is 6.08, so the ladder is carried by the two structural properties — fill, then border style — and all three stay legible.

**And the games the grid draws are unchanged**, which is the regression that mattered once the server started reading the whole season rather than a 28-day window: MLB lists a rescheduled game twice under one `gamePk` (28 times a season, 5 inside a window), which the narrower read never saw. Collapsed, the window is **376 games with 0 duplicates, 0 games on one side and not the other in either direction and 0 field mismatches** against the read it replaces — and **0 projected turns land on a postponed game, outside the window, or on a game he is announced for**, with 8 real doubleheaders in the window and no pitcher projected onto both halves of one.

**Server-side, measured through the route**: **176–230ms genuinely cold** in a fresh process and **0.0ms warm**, against main's own 141–277ms for the narrower window it used to read — the extra 600KB of season is dwarfed by the round trip, and the thirty roster reads run beside it. An independent re-implementation of the method reproduces the whole league-wide map, **335 of 335 pitchers**; and over 40 sampled pitchers every projected row the player page draws inside the window is on the grid at the same tier and the same cadence, **40 of 40**.

**Bundle: 541.63 → 543.50 KB of JS** (160.49 → 161.17 gzipped) and **142.05 → 142.85 KB of CSS** (25.16 → 25.29) — 1.9KB and 0.8KB raw, 0.7KB and 0.1KB over the wire, for three tiers on two tables, a tally, and the paragraphs above restated where the rules are.

### The Projected reading: what these players are going to do

**Both wide readings of a roster are cut by what has already happened**, and the
question a manager has on a Monday morning is not: *what are my players going to
do this week, and is it enough*. The Schedule view answers half of it — who plays
whom, and how often — and stops exactly where it gets interesting. So the summary
table takes a third reading: **`Projected`**, which adds what each man is
expected to do over the days in view that have not been played.

**It is the same engine the League page's matchup projection runs**
(`server/src/projection.ts`), asked a different question. That one wants a
*team's* total added to what ESPN has already scored; this wants a **line per
player**. Which is why they share a context and a per-player core rather than
each having their own — two projections of one roster that disagreed about a
Saturday would be worse than either.

#### It is a mode of this table, not a fourth page

The same argument the Schedule view records one section up, and it lands the same
way: this is the **same players over the same days** with the numbers in the
cells swapped, which is not a different page any more than a different sort order
is. It is drawn on the **Roster view alone** — a feed is a record of things that
happened and there is no honest projected version of one, so the toggle is not
offered there, exactly as the Schedule toggle is not.

**Mutually exclusive with the Schedule view**, and pressing either from the other
is one press. That mode replaces the stat *columns* with days and this replaces
the *figures* in them, so they are two readings of one set of cells and cannot
both be in force; leaving one lit over a table it was not reading is the thing
this app's rule about a control lying about its reach forbids. Each toggle turns
the other off, and where the table is somehow handed both the **schedule wins**
and the caption is not drawn — the columns being days, there is nothing for it to
be a caption to.

**A run of two rather than a segmented control of three**, and that is a phone's
budget rather than a preference: each is a departure from the plain table and a
third pill would spend a line saying which one the reader is already on.

#### Pressing it moves the reader to the days it is about

A projection over "Yesterday" is a projection of nothing, so the press opens on
the days there are still games in: **the rest of this matchup period** where a
connected league says what that is, and **the week ahead** (today + 6) where none
does. `matchupWindow` is the same once-per-session read the Schedule view's two
named spans come off, so the two controls cannot disagree about which days this
matchup has left.

**The date control is untouched**, which is what makes the rest of the feature
fall out rather than needing rules: pick a single future day and the projection
narrows to that day's games; pick a past range and it projects nothing and the
table reads as it always did; pick a range straddling today and the two halves
are added. Turning the lens **off puts the range back where it was, preset and
all** — otherwise a press and an unpress would strand somebody in a future week
with no stats in it. The Schedule toggle turning it off deliberately does *not*
restore the range: the days ahead are exactly what a schedule is for.

#### What a projected row is made of

**What has already happened plus what is still to come**, which is the matchup
card's own shape one level down. The server projects **only the games of the
range that have not been played** (`start` clamped forward to today, and today's
own games counted only where they have not started — `remainingGames`' rule,
which is what stops a figure being counted twice), and the client adds the
report's own lines for the days that have. That is the whole reason an arbitrary
range needs no case of its own.

**The lines are the table's own `BattingLine` / `PitchingLine`**, so a projected
row is this table's row over different numbers and every cell, rate and total
below it is the arithmetic that was already there — the same economy
`asProjected` makes for a scoreboard card. Nothing about the leading cells
changes: the headshot, its pip and status, the identity block, the row tints and
the opponent cell are facts about the player and his next game rather than about
the columns. **The slot chip was in that list and no longer is** — see *The
lineup it would set* below, which is the one leading cell the lens now answers
for, on the grounds that over days nobody has played there is no slot he is
*in*.

**A count is printed to a tenth**, and rounded on the **server** rather than on
screen: the client sums these for the `Total` row, so what a reader adds down a
column is what was printed in it. A tenth rather than a whole number because a
per-player 0.4 home runs over three days is a real answer where `0` is not — the
matchup card can round to whole numbers because a side's week is twenty of these
added together. A whole number stays whole, so a range wholly in the past reads
identically to the ordinary table.

**And a count is only rounded where it *is* a column.** The `OPS` cell is derived
from six numbers and this table prints two of them (`H` and `AB`); the other four
— `1B`, `2B`, `3B` and the `TB` built out of them, along with `HBP` and `SF` —
have no column to be added down, so rounding them bought nothing and cost the
rate. Over a short span it cost it a great deal: a home run projected at 0.163
prints as `0.2` and `TB` multiplies that error by four, which on a one-day
projection is 48 thousandths of OPS and was enough to put a range figure *below
every day in it*, which is not a thing a weighted mean can do. Those four now ride
at four decimal places and the rate is the projection's rather than the
rounding's. **Not one printed count changed** — the whole of the fix is in cells
this table has never drawn. See *A component is rounded where it is a column* in
**The league scoreboard** for the measurement.

**Innings are `5.8`, not `5.2`.** `formatIp`'s form is *thirds* — `6.2` is two
thirds of an inning — and it takes a whole out count, which a projection has not
got; a projected decimal read as one would be off by a factor of five. So the
projected reading passes its own formatter and the two never meet.

**Nothing to project is dashes, not noughts.** A club with no game left in the
span, a starter whose turn does not fall in it, a man neither research board has
a row for, **a man off the active roster** — on the injured list, in the minors,
suspended: `chances` is 0, the line is null, and a row that has also played
nothing draws em-dashes. That last one is the plainest reading this table has of
an injury, and it is drawn beside the `IL10` on his own headshot rather than
instead of it. A line of zeros would claim he plays and does nothing,
which is the opposite of the truth — the same distinction the research board
makes when it sends a window a player does not appear on back as `null` rather
than as a zeroed row.

#### A reliever's day was dashes, and a fraction of an appearance is the answer

**Every reliever on the roster read as a row of em-dashes on a single date**, and
the reason was not the lens, the role test or a probable-starter gate. It was the
appearance model: `server/src/projection.ts::projectOnePitcher` rounded a
reliever's span to a **whole number of outings** — `Math.round(clubGames × rate)`
— and then projected exactly that many. The ordinary bullpen arm is used in
something like two fifths of his club's games, and `Math.round(0.4)` is 0, so
over one day he had no appearance to be projected into, `chances` came back 0 and
the client dashed the row. Measured on 2026-08-21 over the twelve busiest
relievers in baseball: **5 of 12 answered `chances 0` and a null line**, on a day
their clubs were all playing.

**Two more faults in the same three lines, both invisible.** The rounding also
threw the fraction away on *every* span, not just short ones — Sam Moll over
three days is 3 × 0.44 = 1.32 appearances, filed as 1, a quarter of the answer
gone — and the whole number was taken as `games.slice(0, count)`, the **first**
N games of the span, so a reliever's opponent-quality multipliers came off the
front of the week and none of the back of it.

**The fix is the treatment a batter's line has always had.** `projectBatter`
takes a `playShare` and scales what one game is worth by it, which is how a
hitter gets `4.8 games` and a fractional line over a five-day span. So
`projectPitcher` gained an `appearanceShare`: a starter passes the default 1 and
`mults` is one entry per *turn*, a reliever passes his appearance rate and
`mults` is one entry per *club game*. Every remaining game then contributes its
own share — which also settles the opponent mix, each day carrying its own
multiplier at the same weight.

**It is the arithmetic the lineup planner in the same file was already using for
the same man.** `pitcherCandidate` values a reliever's day as `day.set(g.date,
rate)` — a fraction of an appearance — while `projectOnePitcher` insisted on
whole ones. Two answers to one question, in one file; there is one now.

**Measured on the live board, before → after.** Over the twelve busiest relievers
on a one-day span (2026-08-21): `chances 0` and a null line on **5 of 12** →
**0 of 12**, the rest reading 0.4–0.6 of an appearance. Over three days the whole
numbers become fractions with no change of level (Sam Moll `1 → 1.4`, Tyler
Rogers `2 → 1.5`, Eduard Bazardo `2 → 1.6`); over seven the level is where it
was (Rogers `3 → 3`, Bazardo `4 → 3.8`, Moll `3 → 3.3`). Driven in the browser on
the live fantasy roster over 2026-08-21, pitcher tab, `rproj=1` — the four
relievers the plan seats, every one of them holding a lineup slot (`Starts 1`):

| | before | after |
| --- | --- | --- |
| Dylan Lee | `Games — · IP — · K — · HLD —` | `0.5 · 0.4 · 0.5 · 0.2` |
| Didier Fuentes | all dashes | `0.4 · 0.5 · 0.7 · 0.1` |
| Trevor Megill | all dashes | `0.4 · 0.4 · 0.4 · SV 0.2` |
| Tanner Scott | all dashes | `0.5 · 0.4 · 0.6 · SV 0.2` |
| `Lineup` foot | `Games 3 · IP 17.9 · K 17.8 · SV — · HLD —` | `4.8 · 19.6 · 20 · 0.4 · 0.5` |

The three starters on the same table are untouched to the digit, which is the
other half of the check: `appearanceShare` defaults to 1 and a turn is still a
whole outing.

**And a fraction is the honest clothing, not a compromise.** This app's rule is
that an estimate must never wear a measurement's clothes, and a reliever's day is
the most uncertain thing the lens draws — nobody knows which nights he warms up.
A whole projected outing on a named date would claim exactly the thing that
cannot be known; `0.4` of an appearance cannot be mistaken for one, because no
outing anybody ever threw was four tenths of an appearance. It also lands inside
the mark the projected reading already carries: a measured count is printed
whole and a projected one to a tenth (`projCount`), so a reliever's row is in
tenths from end to end. The `Games` header's own title and the `How the
projection works` key both say it in words — *a reliever's is a share of every
game his club has left, since nobody knows which nights he warms up*.

**No cache version moves with it.** Nothing in `projection.ts` is written to a
blob: the context is memoized in memory on the matchup's own minute and the
roster projection is computed per request. The wire shape is unchanged too — the
only field whose *meaning* moved is `EspnProjectedSide.reliefGames`, which goes
from an integer to a fraction and which nothing in either workspace reads.


#### The lineup it would set, and the two arithmetics that follow

**The lens now fills a lineup, which it did not before.** `getRosterProjection`
is the engine's second caller and was handed `plan: null` on the stated grounds
that it "has no lineup to fill" — true of a saved watchlist and false of a
fantasy team, which *is* an ESPN roster with slots and a bench. So in fantasy
mode it runs the same day-by-day assignment the matchup runs (see **ESPN
scoreboard**, *The lineup is filled a day at a time*), over the roster
`fantasyWatchlist` has already returned, and the table says what that came to.
The two cannot disagree about who starts on Saturday, being one function.

**The chip answers for the days ahead.** The ordinary `FantasySlotTag` names the
slot ESPN has him in on the last day of the range — the right answer for days
already played and the wrong one for a span nobody has played, where there is no
single slot he is *in*: there is a set of decisions, which is exactly what the
projection has just made. So under the lens it says **the same two things the
day chip says, over a span: where he plays and how often.**

| | |
| --- | --- |
| one slot, every day | **`2B 5/5`** |
| two slots | **`3B/UTIL 4/5`** |
| a single date picked | **`2B`** |
| never started | **`BE`** |
| club has no game left | *(no chip)* |

- **The slot leads and the count follows**, because the slot is the fact this
  column exists for and the one a reader scans a roster by; over a week *where*
  is only half the answer, which is what the count adds. Lit on the day chip's
  own rule — `starting` means the lineup has him at all.
- **Slots are ordered by how many days he spends there**, first appearance
  breaking a tie, so a man at third all week with one day at UTIL reads
  `3B/UTIL` rather than whichever he happened to fill on the Monday.
  `lineup.days` arrives in date order, which is what makes that second key
  stable.
- **One open day drops the count.** `2B 1/1` says nothing `2B` does not, and it
  is the case a reader meets most — a single date picked, where every man has
  one open day or none — so the chip reads as the plain slot chip it is the rest
  of the time. It also covers a starter with a single turn in a wider span,
  where the count answers a question the `G` column beside it already answers.
- **`BE` rather than a word of its own**, which is the vocabulary the rest of
  this column already speaks: the day chip draws ESPN's own slot names and `BE`
  is one of them, so a bench under the lens and a bench without it are the same
  two letters. It keeps the muted outlined shape that chip has always had, so
  the column still reads *lit is playing, quiet is not* at a glance — and no
  count rides along, `BE 0/5` being a nought where the two letters have said it.
- **Nothing at all** where his club has no game left in the span. That is the
  honest absence — an off day is not a benching, the row's own figures are
  dashes beside it for the same reason, and a chip would invent a decision
  nobody made.
- The days are the **tooltip**, benched ones named, which is what a count has to
  be able to defer to: *4/5* cannot say which four. That sentence keeps the word
  **benched**: it is prose rather than a label, and the two letters that read
  best on a chip read worst in the middle of one.

**It is `.fantasy-slot` outright rather than a lookalike**, so the two states a
reader already knows — lit is in, quiet is out — carry over with no new
vocabulary and **no new CSS at all** (measured: the stylesheet is byte-identical
across this change).

#### The count comes off the chip and becomes the `Starts` column

*(Which supersedes the count half of the section above — the table of chip
forms, the ordering key and the "one open day drops the count" rule. The chip
still says **where**, and everything written above about the slots, the `BE` and
the absent chip stands unchanged; what moved is **how often**. The paragraphs
are left as written, this file's rule for its own superseded reasoning, and the
two states a reader can now read off two places instead of one are named in the
table below.)*

**`2B 5/5` put a fact about the *span* in the one cell that carries facts about
the *player*.** Everything else the lens says about a week is a column — the
figures, the `G` beside them, the total under all of them — and a column is
scanned, compared row to row and added up at the foot. A count at the end of a
pill in the name column could do none of the three: no two rows' counts line up
(the chips are different widths, `IF/UTIL 4/4` against `C 4/4`), the `Total` row
had nowhere to say how many seat-days the plan spends, and the reader who wants
*who is my week actually going to* had to read sixteen pills to find out. So the
chip keeps **where he plays** and a column takes **how often** — the split the
two questions had all along.

| | chip | `Starts` |
| --- | --- | --- |
| one slot, every day | **`2B`** | **`5`** |
| two slots | **`3B/UTIL`** | **`4`** |
| a single date picked | **`2B`** | **`1`** |
| never started, nor already | **`BE`** | **`0`** |
| nothing either way | *(no chip)* | **`—`** |

- **It sits beside `G`, which is the column it qualifies.** `G` is games his
  figures are drawn over and this is days the lineup had room for him, and the
  gap between the two is the whole argument of *A row is what he would do if he
  plays; the foot is what the lineup gets* — a reliever reading `Games 1 ·
  Starts 5` is a man holding a seat all week for one appearance, which is a
  thing a manager acts on and which neither number says alone.
- **A whole number, where every other projected figure is a tenth.** Those are
  shares of a game (`chances` is play-share weighted for a batter, starts plus
  relief for a pitcher, and 0.4 home runs is a real answer where `0` is not); a
  start is a decision the plan made on a named day, and there is no such thing
  as 4.3 of them.
- **`0` where nobody started him on any of it, `—` where there was nothing to
  decide either way.** The dash holds this table's standing rule that a nought is
  never drawn where the honest answer is *nothing was asked*: a man with no day
  played in your lineup and no day left for his club has the rest of his row in
  dashes for the same reason. (Both of those read differently now than they did
  when this was written — see *Both halves, or it is not the row's count* below.)
- **The days are on the title**, which is where they already were: `5 starts —
  started Aug 19; projected in the lineup Aug 20 at 3B, Aug 21 at 1B, Aug 22 at
  1B, Aug 23 at 1B`, and `1 start — projected in the lineup Aug 20 at UTIL —
  benched Aug 21, Aug 22, Aug 23`. The projected half of that sentence is
  `FantasySlot.tsx::readLineup`'s, word for word the one the chip carries, so
  the two cannot come to describe one plan differently.
- **The foot adds it up**, which is this table's standing rule about a column
  and the figure under it. Measured on the live league over 8/19–8/23, batting:
  rows `4 · 4 · 5 · 5 · 4 · 4 · 5 · 4 · 5 · 4 · 4` and `Lineup · 11` reading
  **48**.
- **No new CSS.** The header and the cells are `sum-num`, the class every stat
  column already uses — the stylesheet is byte-identical across this change
  (158,320 raw / 28,282 gzipped, before and after).

**Drawn only where there is a lineup to fill.** A saved watchlist and a league
that published no slot counts have no plan, so the column would be dashes to the
bottom; `anyLineup` is read over the whole tab rather than over the men above
the divider, so the header and the cells under it cannot disagree about how many
columns the table has. Driven with the roster source switched to the saved
watchlist over the same span: **no `Starts` column, no chips, `Total · 1`** —
which is exactly what that reading drew before this change. (The server settles
it as well: `/api/projection/roster` without `source=fantasy` comes back with
**0 of 4 rows carrying a lineup**.)

**What it costs the table, measured on the live fantasy roster at 1400, 390 and
320.** The chip pays for most of it: widest **78.4 → 56.3px** (`IF/UTIL 4/4`
became `IF/UTIL`), typical **53 → 42**, so the name column gives back
**333.9 → 295.2px** at 1400 and **236.1 → 225** at 390 while the new column
takes 64.3 at 390 and 61.6 at 320. The batting table is **1400 → 1400 at 1400**
(the slack absorbs it whole) and **744.6 → 797.8 at 390**, where the table
already scrolls inside its pane; rows are **58px** and the divider 48 before and
after, **0** rows wrap at any width, and page-body overflow is **0** throughout.

**Bundle: 597,032 → 598,222 bytes of JS** (176,055 → 176,298 gzipped) — 1.2KB
raw and 243 bytes over the wire — and **CSS byte-identical**.

#### A row is what he would do if he plays; the foot is what the lineup gets

**Two arithmetics on one table, and each is the only honest answer to its own
question.** A **row** is read to decide *should I start this man*, so cutting it
by the seat the projection happened to give him would make the row a statement
about the allocation rather than about the player — the bench bat being weighed
would read as dashes precisely *because* he has not been started, which is the
one thing it must not do. A **foot** is read as *what is my week worth*, and
adding up sixteen players who cannot all be in the lineup at once is a figure
nobody can act on; that one takes the seated half, and so agrees with the League
page's matchup projection over the same days.

**The seated half is projected in a second pass rather than the first one
scaled.** The days are not interchangeable — each carries its own
opponent-quality multiplier — so a factor would quietly average a man's Tuesday
against his Sunday.

**And the foot says which arithmetic it is, in the label.** This table's
standing rule is that a reader can add a column up and get the figure at the
bottom, which is the whole reason the server rounds each projected component to
a tenth. This deliberately breaks it: measured on the live league, team 4's rows
come to **59.5 games** where its lineup gets **48.5**, the gap being the three of
its fourteen startable bats that cannot be seated. A gap that size has to be
named **where it is read** rather than explained in a tooltip — half this app's
traffic has no hover — so the word changes with the arithmetic: **`Total`** when
it is the column's, **`Lineup`** when it is the plan's, with the sentence on the
title. Where no lineup was filled at all the two are one and it reads `Total`,
which is what it has always said.

#### Measured

**Nothing is a new upstream.** The roster is the one `fantasyWatchlist` already
returns, the slot counts were stashed by the `mSettings` half of that read, and
the categories come off the scoreboard's own cached minute — a projection that
could not read them falls back to seating by playing time, which is what
`seatValues` does with an empty list. Checked on the live league: the roster
route sees **10 categories, a 26-man roster and slot counts present**.

**Across all twelve teams**, over Aug 19–23: **235 rows full** (`n of n`),
**10 partial**, **3 benched**, and 66 with no open day at all — the fantasy IL,
the injured, and clubs with nothing left in the span. The reader's own team is
one of the ones where it is **inert**, and that is worth recording rather than
hiding: it carries exactly **11 startable batters against 11 batting seats**, so
nobody can be benched and every chip reads `n of n`.

**One assignment, read out in full** — team 4 on Aug 19, 14 batters for 11 seats:
Harper (worth 12.29) → 1B, Buxton (7.78) → UTIL, Trout (7.36) → OF, Chisholm
(7.00) → 3B, Adell (6.99) → OF, Arraez (5.84) → 2B, Marsh (5.26) → OF,
Torkelson (4.78) → IF, Reynolds (4.65) → OF, Neto (4.17) → SS, Perez (2.17) → C
— **all 11 seats filled**, and the three left out are Teoscar (4.59), Yelich
(3.84) and Riley (3.62). Teoscar outranks two men who *are* seated, which looks
wrong and is the assignment being right: he is the fifth-best of seven
outfielders for four OF seats and a UTIL already taken, where Neto is the only
shortstop on the roster and Perez the only catcher, so each of them holds a
chair nobody else can use. That is the matroid greedy's whole point, and it is
why *4 of 5* falls where it does — the same three sit on every contended day and
all of them start on Aug 20, the one day most of their clubs are idle.

**The two arithmetics, on team 4**: rows **59.5** games / **247.2** PA / **8.0**
HR against a lineup of **48.5** / **203.7** / **6.6**, the difference being
exactly the three men it cannot seat (11.0 games, 43.5 PA). The lineup figure
sits under its own ceiling of 55 seat-days (11 seats × 5 days), the slack being
Aug 20.

**Driven in a browser at 320, 390, 1000 and 1200**, on both surfaces — the
Roster view and the matchup's team page, which are one code path. The chips read
`C 5/5`, `IF 4/4`, `3B/2B 5/5`, `3B 1/5`, `UTIL 1/5` and `BE`, and a single date
picked draws `C`, `2B`, `UTIL` with **no count on any row**; the two IL men draw
**no chip and dashes**;
the tooltips read *Projected in the lineup Aug 20 at 3B — benched Aug 19, Aug
21, Aug 22, Aug 23* and *Projected on the bench every day his club plays — Aug
19, Aug 21, Aug 22, Aug 23*; the foot reads **`Lineup · 16` at 48.5** against a
column summing to 59.5, and reverts to `Total` the moment the lens is turned
off. **0** page overflow and **0** error banners throughout.

**A saved watchlist is untouched**: every row comes back `lineup: null`, so the
day chip stands and the foot reads `Total` — which is exactly what this table did
before. (Worth noting for anyone re-measuring: `?roster=saved` in the URL does
not settle it, the saved roster-source preference loading a moment later and
putting the app back in fantasy mode. Check the response, not the link.)

**What the slot costs the column, measured on the same table at 320, 390 and
1200**: the widest chip goes **65 → 72px** (`benched` gave way to `3B/2B 5/5`)
and a typical one **48 → 53**, against a name column of **205px at 320**. The row
is **58px** before and after, **0** rows wrap at any width, and page overflow is
**0** — the slot is free, which is what the slack in the one column carrying a
name was there for. A single date picked draws the chip at **42px**, exactly the
width of the ordinary day chip it stands in for.

**Bundle: 580.31 → 581.59 KB of JS** (172.90 → 173.33 gzipped) and **156.33 KB
of CSS, unchanged** (27.98) — the chip being `.fantasy-slot` outright.

#### The Opponent column becomes `G`

**The one column on the row that a future span makes useless is the one naming a
game.** `OpponentCell` draws a single *representative* game — live first, then
the next scheduled, then the most recent — which is a fair summary of a range
that has been played and says almost nothing about one the lens has just moved
the reader into the future of: it names one fixture out of a week of them, none
of which anybody has played. So under the lens that column is **`G`**, exactly
as the Schedule view puts its own `G` there and for the same reason — what a
row is read against once its figures are estimates is how many games it is made
of.

**It counts the whole row rather than the projection's half of it.** Every
figure beside it is `what he has already done + what he should still add`, so a
count naming only the second half would be the one cell on the row keeping a
different arithmetic. That is not a corner case: the ordinary press straddles
today, a game already under way this afternoon being in the report's own line
and out of the projection by `remainingGames`' rule. So `projectedGames` is
**games played over the days in view + `ProjectedPlayerLine.chances`**, and the
`Total` row is that summed down the column, which is what the Schedule view's
own `G` total already is.

**"Played" is each kind's own test, and both are tests the app already had**: a
batter's game he came to the plate in (`PlayerCard`'s own `played`) and a
pitcher's game he threw in (`aggregatePitching`'s filter). Neither is
`r.games.length`, which counts the placeholder games a report carries for the
days his club played without him — over a future range that is *every* game on
it, so the count would read as a full week for a man who has played none of it.

**A tenth, like every other projected count**, since an expected game is a share
of one (`chances` is play-share weighted for a batter and starts-plus-relief for
a pitcher), and a **dash at nothing** — a club with no game left and no day
played is the same absence that already dashes the rest of his row rather than
drawing it as noughts. Over a range wholly in the past the column is therefore
whole numbers and the caption says `nothing to project`, which is the honest
reading of a `G` that is only games played (measured on a real 15-batter roster
over 08-10…08-12: `3 · 3 · 3 … Total 31`).

**It costs the table nothing and the stylesheet nothing.** The header and the
cells are `sum-num`, the class every stat column already uses, so there is no
rule to add; measured on the live fantasy roster, the batting table goes
**709 → 720px at 390** — the eleven pixels are the projected figures themselves
(`3.9/17.1` against `0/1`), the G column being *narrower* than the Opponent one
— and **1400 → 1400 at 1400**, with the row 58.00px, the header row 51.00, the
headshot column pinned at 0 and page-body overflow 0 either way.

#### Both halves, or it is not the row's count

**`Starts` counted the projection's half and `Games` counted the row, and one
table cannot keep two arithmetics.** It shipped that way and was caught by a
reader inside a day: *4 starts remaining but 5 games for Sal Stewart, even
though his game for today is finished.* The figures were right about what each
was counting — his club's game today was final, so the projection had already
dropped it (which is what the live re-read above is for) and the row read
`Games 5 · Starts 4`: one game played plus four projected against four
projected. But *he was started today*. That is a fifth start, and the column
that would not say so was the one column on the row measuring a different span
from the rest of it.

**So the played half is counted, by the exact test the `Games` column's played
half uses.** `playedStarts` is *the games he played on days your lineup had
him*: `playedGame`'s own per-kind test — a batter's game he came to the plate
in, a pitcher's game he threw in — intersected with `FantasySlot.startedDays`.
Sal Stewart now reads **`Games 5 · Starts 5`**, and Austin Riley on a team page
reads `Starts 2` where the plan gives him one day and the manager already gave
him today.

- **The lineup days come off the chip's own map.** `FantasySlot.startedDays`
  went from a *count* of the days in view he was in the lineup on to the **days
  themselves** — one field carrying one fact, where a count beside a list is two
  that can disagree. The chip's title takes its length and reads exactly as it
  did; the column takes the days. A matchup team page filled that field with
  `null` on the stated grounds that it "reads one day's roster", which was true
  of the chip and stopped being true of the page — it reads the per-day map for
  its own `Total` divider, so it now fills the days from `byDate` and its
  chips gain the range title they never had.
- **Two tiers, `projectStarters`' own**, so nothing new can fail here: the
  per-day map where there is one, and the single end-of-range `starting` flag
  applied to every played game where there is not (an older tab, a failed read).
- **A game he played on a day you had him benched is not a start**, and his row
  still counts it in `Games`. That is *A row is what he would do if he plays*
  again: the row is about the player and the count of starts is about what you
  did with him.
- **Days, not games**, which is what keeps the column consistent with its own
  other half: the plan seats a man once a day however many games that day holds,
  so a doubleheader you started him for is one start against two games.
- **`Starts` above `Games` is the ordinary case, not an error.** A batter
  started four times who bats in 80% of the games he is started for is `Starts 4
  · Games 3.3` — a start is a whole decision and a game is a share, which is the
  same pair the `0.4 home runs` in the row is drawn from.
- **The divider reads the same count.** `splitStarters` under the lens was
  asking two questions (the plan's seats, or `starters` plus a played game); it
  asks one now — *does this column read more than nought* — so the line above the
  `Lineup` total and the figure printed in it cannot part company.
- **`0` and `—` shift with it.** `0` is *nobody started him on any of these
  days*, and the dash is *there was nothing to decide either way* — no day
  played with him in your lineup and no day left for his club. So a pitcher who
  threw today in your lineup and whose club is idle for the rest of the span
  reads `1`, where before the column dashed him.

Measured over 8/19–8/23 on the live roster, batting: the eleven above the line
read `4 · 4 · 5 · 5 · 4 · 4 · 5 · 4 · 5 · 4 · 4` against `Games` of `3.3 · 3.6 ·
4.4 · 5 · 3.9 · 4 · 4.4 · 3.7 · 5 · 3.9 · 4`, and `Lineup · 11` reads **48**,
which is the column added up. On the pitcher tab, Logan Gilbert — who threw
today and whose club has nothing left in the span — goes from a dash to
**`Games 1 · Starts 1`**. On team 4: Riley `2`, Yelich `1`, Teoscar `0` and
below the line, `Lineup · 13` reading **51**.

#### The header is the word, not the letter

*(Which supersedes the header in the section above — `G` is now **`Games`**.
The column is the same column and everything argued for it stands.)*

**`G` beside `Starts` is a letter with two readings, and one of them is the
other column.** On a pitcher's row especially: `G` in every baseball table ever
printed is *appearances* and `GS` is *games started*, so a reader meeting `G 1 ·
Starts 4` against a reliever has every reason to read the pair as "one game,
four of them started", which is not merely unhelpful but backwards. The word
costs 14 pixels at 390 (`797.8 → 812`, and 872.8 on the pitcher tab, where the
table already scrolls inside its pane) and **0 at 1400**, where the surplus
absorbs it whole, so the letter was buying nothing.

**And the title says which games, per kind**, because *games* means two
different things across the two tabs and only the pitcher tab's is
counter-intuitive:

- batting — `Games behind these figures — the ones he has come to the plate in
  over the days in view plus the ones he is expected still to get`
- pitching — `Appearances behind these figures — games he pitches in, a start
  and a relief outing alike: the ones already thrown over the days in view plus
  the ones he is expected still to get`

**`Starts` gets the disclaimer on the same grounds**, and only where the
ambiguity exists: the pitcher tab's title ends `A lineup slot, not a start on
the mound.` A word that reads two ways on one tab and one way on the other is a
word that says so on the tab where it does. **Whose lineup goes unsaid** in that
title — this table draws a leaguemate's roster on a matchup team page as readily
as your own, and the chip in the name column is the one with an owner to name.

**The Schedule view's own `G` is untouched.** It counts a *club's fixtures* over
the days ahead where this counts a *man's appearances*, which are two facts
rather than one shared header, and nothing sits beside it there to be confused
with — the ambiguity this fixes is the pair `G · Starts`, which exists only
under the lens.

**The key behind the toggle names both columns**, which is where a reader who
has no hover at all is left: `Games is how many he appears in over those days —
the ones he bats in, or for a pitcher his outings, a start and a relief
appearance alike — and Starts is how many of the days his club plays your
fantasy lineup has room for him.` It goes in the roster branch of
`ProjectionKey` alone; the League page's half of that panel is about a side's
categories and has no such columns.

#### The lens re-reads itself while games are being played

**A projection of a day being played is a figure that moves**, and it was drawn
once. The server projects only the games that **have not started**, so every
first pitch takes a game out of the estimate and puts it on the report beside
it; an inning's runs cross from the projected half of a row to the played half.
The report under the table already re-polls every twenty seconds while anything
is live — so the lens, read once when it was pressed, was the one thing on the
page frozen at the moment of the press, and the two halves of every row were
drawn from different minutes.

**It rides the report's own tick rather than a timer of its own**, which is the
point: the played half and the projected half of a row have to move together or
the row counts a game twice on the way past. `loadRosterProjection(true)` goes
in the same interval callback, guarded by a ref rather than named in the deps —
the report's clock is not the lens's to reset, and a dep would restart the
twenty seconds on every press of a button that has nothing to do with polling.

**Quietly**, which is rule 1 of the loading system: no ball in the toggle, no
blank cells, the last answer standing until the next lands. And
**sequence-numbered**, which the poll is what makes necessary — two reads can
now be in flight at once, the one a range change fired and the one the tick did,
and only the newest may write. The single-run `canceled` flag it replaced could
not tell them apart.

**Measured.** With the lens on and games live, the two reads go out **together
on every tick** — `report` and `projection/roster` at 21s, 41s and 61s, one pair
per twenty seconds and no read in between. Driven against a server patched to
move the answer on every request, the table follows it — the first row's `Games`
reading **8.3 → 9.3 → 10.3** as each answer lands, each within a tick of its own
read — with **0** spinners in the toggle across the whole run and no cell blank
at any point.

**The other two projections take the same correction**, on the League page's own
minute rather than this one's twenty seconds: the matchup card's (half of which
is the side's live total, re-read on the very same tick) and a team page's. They
are in **Client — the League view**, *A projected card is polled with the board
it is drawn over*, and **Client — a league matchup**, *The team pages' own lens*.

**Bundle for the header and the three polls together: 598,222 → 599,538 bytes
of JS** (176,298 → 176,705 gzipped), **CSS byte-identical**.

#### The caption, and the key behind it

*(Superseded in its first two thirds, and kept because the paragraph below is
what the correction is measured against.)* `Projected · Aug 18 – Aug 23 · 6 days
still to play`, directly above the pane — the table's **caption** rather than a
control, which is why it is not up in the pinned row with the toggle: the
research board's count line and the Rankings tab's span line are the same object
in the same place. The **days** matter as much as the dates, because a span whose
clubs are all idle projects nothing, and a table of dashes with nothing to
explain it is the one state this must not be in. With nothing left to play the
span is **not printed at all** and the line reads `nothing to project — every
game in these days has been played`: naming a projected span there would be the
lens taking credit for figures it did not touch.

The ⓘ beside it is **`ProjectionKey`, shared with the League page** — see
**Client — the League view**, *The key and the glyph are one component*. Its
`categories` half is absent here, so the first paragraph says *what he has
already done plus what he should add* rather than naming a league's scoring
categories. It is anchored to the caption row rather than to its own 30px button,
which is `.roll-key`'s measured trick.

#### The caption was saying twice what the bar above it says once

**It was written before the date bar had a projected reading, and the two now
sit eight pixels apart.** The bar under the tabs prints its lead over its range,
and one of its three readings *is* this lens: `PROJECTED` over `Aug 19 – Aug 23`,
measured on the running app the instant the toggle is pressed. The caption
underneath then printed `Projected` again, and the same two dates again, in a
row of its own. That is not a caption a reader gains anything from — and the bar
says it **better**, being pinned (so it is on screen with the pane scrolled to
its foot) and coming along into the expanded mode, where the caption was two
scroll positions away from the numbers it described.

So the caption goes, and with it the accent `Projected` tag, the span and the
`N days still to play` line. **Two things it carried do not.**

**The ⓘ moves up beside the `Projected` toggle**, which is the control it
explains and is where the League page has kept its own copy all along
(`.lg-proj-key`, one row up). Drawn **on the press rather than on the answer** —
`days` is 0 until the read lands and the panel words that as *over the days
left* rather than naming a number it has not got — because a key that appeared a
quarter of a second after the press would move the row under the finger that had
gone on to the next control. It hangs off **the row** rather than off its own
30px button, the trick this file records four times: nothing between it and
`.view-bar` is positioned, so `right: 0` is the app's own gutter. Measured with
the panel open: 858→1178 inside a 1200 window, 48→368 inside 390, 22→298 inside
320 (the `min(320px, 100vw - 44px)` cap doing the last one), and 868→1188 inside
the expanded box at 1200, whose chrome row takes `position: relative` for
exactly this.

**And the one line neither the bar nor the toggle can carry stays where it was**
— `nothing to project — every game in these days has been played`, drawn at
`daysLeft === 0` and not at all otherwise. This is the state the paragraph above
calls the one this must not be silent in, and it survives the redundancy
argument untouched: the bar can say *which days*, and it cannot say *there is
nothing in them*. A reader who has pressed a control and watched the table not
move is owed the reason, and where the clubs are idle as well as the days spent
it is a table of dashes with nothing else on the page to explain it. Reached by
an inbound `rproj=1` over a past range — a **press** moves the reader to the days
there are games in, which is that toggle's own documented rule, so the press
cannot land here. Measured on `?start=2026-08-12&end=2026-08-14&rproj=1`: the
bar reads `PROJECTED` over `Aug 12 – Aug 14`, the line is drawn at 22px in from
the app's gutter and 33px tall at 1200 (48px, two lines, at 390), the table
below it carries the report's own figures, and page-body overflow is **0** at
both.

**It keeps its place directly above the pane** rather than moving up beside the
toggle with the ⓘ, and the caption's original argument is why: it is about the
rows under it, not about the control that produced them — and at a phone's width
the tab row has not got a line to spare for a sentence, where the pane can give
up 48px in the one state where its rows say nothing anyway.

**Bundle for the two together: 591.79 → 592.28 KB of JS** (176.58 → 176.69
gzipped) and **157.84 → 157.62 KB of CSS** (28.18 → 28.17) — 0.5KB of JS raw and
0.1KB over the wire, against **0.2KB of CSS given back** raw and 0.01 gzipped.
The stylesheet shrinking is the honest report: a divider needs less than a
pinned foot did (the sticky, the offset, two z-indexes) and a caption reduced to
one line needs less than four rules and an anchor, so what the split and the
group beside the toggle cost is more than paid for by what came out.

#### `rproj=1`, and why it is not `proj=1`

In the URL by the rule `hideil=1`, `sched=` and `plays=` follow: it
changes *what the numbers are*, so a link carrying it describes a different
table. **A different param from the League page's `proj=1`** because that one
means a *matchup* — one param meaning two things in two views is exactly the trap
`lspan=` avoids by not being `win=`, and a link is read before anything on screen
can say which view it was written on.

**Not a saved preference**, by the line every lens in this app sits the far side of: which figures a reader
wants in front of them is a lens for an afternoon, and a saved copy would mean a
table quietly showing next week's estimates a fortnight later.

**The read is lazy on the toggle** — it joins four league-wide boards and the
league's schedule against the roster — and it needs **no fantasy league at all**:
every input is a board this app already holds, so a reader with a saved roster
and no ESPN connection gets the same answer. What a connected league adds is the
span the toggle opens on and the roster it is asked about. `/api/projection/roster`
takes the same three parameters `/api/report` takes and resolves the roster the
same way, so the lines it describes are the rows that report describes; the whole
of that is in **Date handling and server routing**.

**Never over data**: the last answer stands while the next is in flight, so
changing the range does not blank a table somebody is reading, and the only mark
a press leaves is the ball inside the toggle that started it. A **failed** read
costs the lens its figures and nothing else — the table falls back to the
report's own numbers rather than the page becoming a message, which is the
direction the schedule window already fails in.

#### Leaving the Roster puts it away

**Not saving it was not enough.** "Not a saved preference" keeps next week's
estimates out of tomorrow's session; it said nothing about *this* one, and the
Roster is the page every other page comes back to. Measured before the rule
existed, against the live 12-team league on 8/19: press `Projected` on `Today`
and the URL goes `?preset=Today` → `?start=2026-08-19&end=2026-08-23&rproj=1`,
the date button `Today` → `8/19 – 8/23`, the caption to `Projected · Aug 19 –
Aug 23 · 5 days still to play`. Cross to the **Feed** and back and all three
were still there; the same after **Research** and after **League**. Nothing
reset it — the state is plain component state, and `rproj=1` was written to the
URL on every view, so a link copied off the Feed claimed a reading the Feed has
not got.

So **crossing the view tabs does what pressing the toggle a second time does**:
the lens off, and the range it was turned on over restored, preset and all. It
is one effect on `view` beside `toggleRosterProjected`, and it reads the same
`beforeProjection` ref the toggle's off branch reads. After: `Feed` → back is
`?preset=Today`, the button `Today`, the toggle unlit, the caption gone and the
table back to the report's own 14 rows and its `Total`; `Research` → back and
`League` → back are the same. The away URLs lose `rproj=1` with it —
`?preset=Today&view=feed`, not `?preset=Today&view=feed&rproj=1`.

**The range is written to the `summary` entry by name**, not through `setRange`.
`setRange` writes whichever scope is on screen (see **The client shell**, the
two roster ranges), and by the time this effect runs the view has already
changed — on the way to the Feed that scope *is* the Feed's, so restoring
through it would move a second page nobody touched.

**A navigation, not a load.** The seed is untouched, which is the whole point of
the param: `?rproj=1&preset=Today` opens with the toggle lit and the button on
`Today`, and `?start=2026-08-19&end=2026-08-23&rproj=1` opens lit over those
days. On a link nothing was pressed, so `beforeProjection` is empty and there is
nothing to restore — leaving takes the lens off and **leaves the dates the link
named**, measured: the dated link crosses to the Feed and back as
`?start=2026-08-19&end=2026-08-23` with the button unchanged, and pressing the
toggle there and pressing it again round-trips to the same pair. Back and
forward are full loads (this app only ever `replaceState`s), so they are that
same case — and because the param no longer rides on a non-roster URL, stepping
back through one cannot restore the lens either.

**The player page is not a leaving.** It is an overlay over this view, the URL
still names the roster, and closing it returns to the same table at the same
scroll — so tapping a name to read a man's projection and coming back must not
cost the lens and jump the range back a week. `view` is what the rule watches
and a `player=` does not change it: measured, `?…&player=batter-668939&rproj=1`
opens over a lit toggle and Escape returns to `?…&rproj=1`, still lit.

**The two League lenses are deliberately left as they are**, and they persist
the same way — measured: turn `Projected` on the Rankings tab, cross to the
Roster (the URL correctly drops `rankproj=1`, which is view-gated), come back
and the button is lit again with `rankproj=1` returned. Three reasons not to
follow. **The roster's lens is the only one of the three that moves the days in
view**, so it is the only one whose persistence strands a reader in a week with
no stats in it — a League lens left on swaps figures on a board and nothing
else. **The Roster is a destination and the other two are not**: it is the
default view, what closing a matchup or a player page returns to, and where a
reader who pressed nothing still ends up, where `lt=rankings` and `mup=` are
each opened on purpose. And **the two of them are read against each other**: a
manager comparing a projected matchup with his projected finish moves between
the Scoreboard and the Rankings on the same week, and a rule that reset them on
the way out would have to answer why it does not reset them on the way between —
which is the same trap the feed's play lens avoids by staying in force across
the kind tabs.

**That paragraph is superseded and is left standing as the reasoning it was.**
The two League lenses now go away with their own pages — see *A page opens
measured, unless a link says otherwise* at the end of this section, which
answers its three reasons rather than stepping around them.

**Bundle**: JS 581.59 → 581.72 kB raw, 173.33 → 173.37 kB gzipped; CSS
unchanged at 156.33 / 27.98.

#### Measured

**Driven against the live 12-team league in a browser.** Pressing the toggle from
`Today` takes the URL to `?start=2026-08-18&end=2026-08-23&rproj=1`, the date
button to `8/18 – 8/23`, and the caption to `Projected · Aug 18 – Aug 23 · 6 days
still to play`; the batting table draws 14 rows of tenths with a `Total` of
`57.1/207.3 · 32 R · 10.8 HR · 33.7 RBI · 3.7 SB · .852 · 24.5 BB · 51.8 K`.
Pressing it back returns `?preset=Yesterday` and the `Yesterday 8/17` button —
the range **and** the preset, which is why the ref remembers both.

**The three ranges, each with no case of its own.** A single future day
(`8/21`) reads `Projected · Aug 21 · 1 day still to play` with a `Total` of
`11.2/42.6 · 6.5 R · 1.9 HR`; a range wholly in the past (`8/14 – 8/16`) reads
`nothing to project — every game in these days has been played` over the report's
own integers; and the pitcher tab over `8/19 – 8/23` draws `6.4 IP · 5.6 H · 2.4
R · 2.3 ER · 1.4 BB · 4.5 K · 3.25 ERA · 1.10 WHIP` for a starter with a turn in
the span and **em-dashes across the row** for one whose next turn falls outside
it — which is the honest answer and the one a manager is looking for.

**Mutual exclusivity, driven both ways**: with `Projected` on, pressing
`Schedule` leaves `projected-toggle` unlit, `schedule-toggle on`, `sched=matchup`
in the URL, **no caption** and the day columns drawn; pressing `Projected` with
`Schedule` on does the reverse.

**Widths**, at 320 / 375 / 390 / 480 / 640 / 900 / 1200 / 1920: **page-body
overflow 0** at every one, the button a **36px square** with its label visually
hidden under 640, and the key's panel **320 × 467 at x=22** of a 390px screen —
fully in view. What the control costs the pinned row is **a wrapped line at 375,
390 and 900** (159 → 207px, 115 → 161) and **nothing at 320, 480, 640, 1200 or
1920**, A/B'd by hiding the button on the same page.

**Full-page mode** carries the caption and puts the toggle in
`.expanded-chrome` beside the kind tabs, the Schedule control and the
dates — a live control rather than a badge, for the reason that row's own note
gives: it is what the figures *are*, and it is the way back to them without
leaving the page.

**Server-side**, through the route on the live league: the context is memoized on
the matchup's own minute and every board under it is cached for hours and pulled
warm nightly, so a range change is five map builds rather than a fetch. The
response is one line per player and carries no components — the same rule
`categoryScores` sets for the matchup's own wire.

**Bundle, for this and the two changes it shipped with** (the Scoreboard's toggle
leaving, and the matchup card's hatched bars): **569.58 → 572.31 KB of JS**
(169.46 → 170.25 gzipped) and **154.21 → 155.30 KB of CSS** (27.62 → 27.76) —
2.7KB and 1.1KB raw, 0.8KB and 0.14KB over the wire, for a route, a shared engine
context, a toggle, a caption, a shared key and glyph, four hatch rules and the
paragraphs above restated where the rules are. The JS figure is net of what the
Scoreboard gave back: a component's worth of projection plumbing left that file
and one copy of the key went with it.

**And for the `G` column and the matchup team page's copy of the toggle**
(measured together, both being one round): **572.58 → 574.13 KB of JS** (170.34
→ 170.70 gzipped) and **CSS unchanged at 154.82** (27.71) — 1.55KB of JS raw and
0.36KB over the wire, for a column, a second toggle with its own read, and the
paragraphs above restated where the rules are. The stylesheet does not move at
all, which is the measurement worth keeping: the `G` header and its cells are
`sum-num`, the class every stat column on this table already uses.

**Every one of the three wide tables offers itself the whole page** (`ExpandButton.tsx`, `hooks.ts::useFullPage`) — the summary table, the research board and the game log. They are the app's widest things by some way and they read out of a box a few hundred pixels tall under a header, a tab row and a control bar; the button is "just show me the table", and what it buys is the app's own chrome.

**Deliberately not the Fullscreen API.** That takes the *browser's* chrome as well, which is a bigger thing than was asked for and a worse one to be in by accident: it swallows the tab strip and the address bar, needs a user gesture, is refused outright by iPhone Safari for elements, and leaves the page in a mode the browser rather than the app has to be asked to leave. A `position: fixed` box over everything the app draws behaves the same everywhere and is undone by the same button that made it (and by Escape).

**It covers the page and nothing else** — `z-index: 45`, above every piece of the app's own chrome (which tops out at 41: the pinned bar, whose settings popover and search menu sit at 40 within it) and **below the overlays**, the player page at 50 and the reel, how-to and league pages at 60. The box sat at 90 for a while and that was wrong in exactly the way this mode is most used: a click on a headshot in an expanded table opened `PlayerDetails` *underneath* it, so the player's page was on screen with the table drawn over the whole of it and the click read as though nothing had happened — a link that appears not to work, on the one view whose rows are mostly strangers you clicked to find out about. Stacking rather than dropping out of the mode is what the two states should be: closing the player returns you to the expanded table at the row you left, the same way an ordinary summary view stays mounted behind him. The name link is the other way out and needs nothing — it changes the *view*, so the table unmounts and the mode goes with it.

**And Escape undoes one thing.** Both boxes answer the key on `window`, so with a player page over an expanded table one press closed the player *and* collapsed the table behind him. `useFullPage` therefore declines Escape while an overlay is stacked above it, and `PlayerDetails` declines it while something inside *it* has taken the page. That second half is what makes the test a question about stacking rather than "is any overlay open": the game log's own expanded box lives **inside** `.details-view`, so its ancestor overlay is behind it rather than above it and the key stays the log's to answer — the hook's `ref` (attached to whichever box takes `.is-expanded`) is what lets `overlayAbove` tell the two apart, and `.details-view` reads its own subtree for the mirror case. Checked all four ways round: player over expanded summary table (closes the player, table intact), a second press (leaves full page), expanded log inside the player page (closes the log, player page intact), and the research board's Back button (returns to the still-expanded board).

**Expanded, each table keeps the one piece of chrome it can't be read without** (`.expanded-chrome`, a `flex: none` row above the pane). The summary view keeps the **kind tabs and the date control** — which kind and which days are not decoration, they are what the numbers *are*, and both are reached for while reading; App hands them down as nodes, since it owns the state behind them, and the same nodes render in the view bar too, behind the box and so never on screen at once. The research board keeps **the count line** — "522 of 748 pitchers", the one number saying what the badges above it add up to, and still directly above the table because it is that table's caption rather than a control — and **a badge per active setting** (`.research-badge`) in place of the whole control set: position, then one badge per included set (or `Nobody included`, which the buttons can genuinely reach and a blank table would otherwise leave unexplained), `Watchlist` when it is one of them, the window, the search term and every stat filter — because "of 622" says nothing without knowing it is the 30-day window, free agents only, and shortstops. Labels rather than controls — the round pill this app reserves for things you read — and the way to change any of them is the button that expanded the table. The game log keeps **a face and a name** (`.glog-id`, 26px against the details head's 65), the head that normally says whose season it is being behind the box.

Expanded, the pane is **only as tall as its rows**: `flex: 0 1 auto` takes the content's height and `min-height: 0` lets it shrink back to the box when there is more content than screen, which is the one case where full height is right. **The ordinary layout now says the same thing**, which for a while only the expanded one did. `.research-scroll` and the game log's `.glog-scroll` carried `flex: 1` for their place in that layout and so filled their column whatever was in it — a dozen rows above a bordered expanse of nothing reaching the bottom of the window, with the game log's Load more button pinned to the far edge of it, which reads as a table that has stopped scrolling rather than one that has ended. The summary view arrived at the same place by another route and keeps it: `.summary-view` is a *row* flex with `align-items: flex-start`, so nothing stretches its pane on the block axis. All three now behave the same in both modes — a short table is a short box, a long one takes the height available and scrolls.

**The button is in the table's own top-left header cell** — the one over the headshots, which carries no text. Two things follow and both are the point: it costs the page no vertical space, where a row above the table cost a row of stats; and that cell is the one pinned on *both* axes (the header row sticks to the top, the headshot column to the left), so the way back out is on screen wherever you have scrolled to. The game log's corner cell is the one that carries a word, so the button sits inline before it — **not** by making the `<th>` a flex box, which takes the cell out of table layout altogether and had the header at 22px against its own 76px column, its text overflowing into the next header's space. Headshot and name are separate columns so only the narrow headshot column sticks on horizontal scroll (the name scrolls away, freeing room for stats on a phone); the header/total rows stick on vertical scroll (pure CSS `position: sticky`). Column gutters are `clamp()`ed against the viewport (as are the `.sum-num` floor and the name column's min-width), because the table always overflows on a phone and every pixel of padding is a stat pushed off screen — that alone takes the pitcher table from 1015px to 726px at 390px wide. **The wide end of that clamp is the opposite problem and took the opposite answer**: a monitor has room the table has no use for, and the stat columns used to hug their own digits (`width: 1%`) so every pixel of it went to the single auto column — the name — leaving a 600px hole in the middle of every row with the nine stats crushed together past it. A table can span the window and still read as a table's worth of numbers pinned to the right-hand edge of one. So the numeric columns are `width: auto` and **take a share of the surplus** in proportion to what they hold, and the gutters open up at the wide end rather than staying at 13 — 22px when that was written and **28px** since the tables were given room to breathe (`clamp(5px, 1.9vw, 28px)`, the floor unmoved). Nothing of this reaches a phone: an overflowing table is laid out on its content's own widths whatever `width` says, so the clamp floors still decide it there. **The research board is exempt from the gutter half** and keeps 13px, for the reason that widened the others: it carries 23 to 44 columns and overflows a 1920px screen with every one of them at its own width, so there is no surplus to spend and each pixel added to a gutter is a column pushed off the right edge. The exemption was tested again when the two other tables' gutters grew and it held — a pixel a side is 54px of scroll on a 27-column board, and the 1.9vw/28px they took would have been 320 of them. The `auto` needs no exemption — it does nothing until there is slack, and on a board narrowed to a handful of columns it is just as welcome. In the table, **the headshot and the name both open `PlayerDetails`** — see **the player page's Overview tab** below for why the two led to different places and no longer do. The **stat columns are monochrome** — OPS and ERA used to be `--accent`, which just made the eye jump between columns. Color is reserved for *state*, and there it stays: a live game's inning (`--hit`) and a postponed one (`--hr`) in the opponent cell, the headshot's lineup-spot / pitching-role pip, and the row tint for at bat / on deck / on base.

#### A page opens measured, unless a link says otherwise

**The rule the paragraph above stopped short of.** A lens is a press, and a
press is about the page it was made on; a lens still in force on a page the
reader has just opened is a table of guesses nobody asked for. All four of this
app's projected lenses now have that shape:

| the lens | its page | what puts it away |
| --- | --- | --- |
| `rproj=1`, the Roster's | the Roster view | a crossing of the view tabs |
| `proj=1`, a matchup's | the matchup page | that page closing, or the view leaving |
| `rankproj=1`, the Rankings' | the Rankings tab | leaving that tab, or the view |
| `teamProjected`, a team page's | the matchup overlay | the overlay unmounting, which it already did |

The fourth is the one that needed no code: it is state inside `LeagueMatchup`,
which App renders only while `mup=` names a matchup, so closing the page has
always taken it with it. Measured on the live 12-team league on 8/19: press
`Projected` on the `BETS` page of matchup 110 (`projected-toggle on`), press
`Back`, reopen the card and the same page, and the toggle is unlit. It is in the
table because the rule is now the same for all four, not because it moved.

**The three reasons, answered.** *Only the roster's lens moves the days in
view* and *the Roster is a destination* are both arguments that the roster's
case is the **worst** — not that the other two are harmless. A manager reading
dashed cards as scores is the same fault whether or not the calendar moved with
it, and the League's own tab is a destination too, because `lt=` is remembered:
measured before this, `Rankings` projected → `Roster` → `League` came back lit
with `rankproj=1` returned, and a matchup card closed with the lens on reopened
**any** card dashed with nothing pressed. The third reason is the real one —
*the two are read against each other, so a rule that reset them on the way out
would have to answer why it does not reset them on the way between*. This
answers it by resetting on the way between as well: on the way between, the
reader is **opening a page**, and one press is what a page they chose to open
costs.

**A page over a page is not a leaving**, which is the `player=` precedent
carried across rather than a second rule. Measured: a matchup page opened from a
projected Rankings row (`?…&lt=rankings&mup=112&mt=9&rankproj=1`) leaves the
caption `Week 19 · projected to Aug 23 · 5 days still to play` and the lit
button behind it, and `Back` returns to both; a player page opened from a
projected matchup (`?…&player=pitcher-700712&…&proj=1&mup=110`) leaves
`mup-card mup-proj` and the `Projected` tag standing, and Escape returns to
`?…&proj=1&mup=110` with the card still dashed.

**A sub-selection inside a page is not a leaving either.** The Rankings span
strip is the case: `rankproj=1` is written only on the span it can act on, so
`Season` and back is a round trip the URL already describes — measured,
`lspan=season` drops the param and `Current matchup` writes it again with the
lens still lit. The alternative considered was mirroring the URL gate exactly,
so state and query string could never disagree; it was rejected for that, and
because that gate has a `rankings.projectable` in it which arrives **after** the
link does — a reset watching fetched data would put out a lens an inbound link
had just lit.

**The inbound links still open lit**, which is the whole point of the three
params and the one thing this could have broken. Every test either effect makes
is state seeded synchronously from the query string (`view`, `mup=`, `lt=`), so
a link is already on its own surface on the first render and nothing fires.
Measured: `?view=league&lt=rankings&rankproj=1` opens on `Week 19 · projected to
Aug 23 · 5 days still to play` under a lit `lg-proj-btn on`, and
`?view=league&mup=110&proj=1` opens on a `mup-card mup-proj` under the
`Projected` tag with `R` at `67 – 52`.

**What it costs on the way out**: nothing on the wire. The Rankings read is
gated on the tab, so putting that lens away off the tab sends no request — the
live table is read on the next entry, which is the read that entry was going to
make anyway; and the matchup projection's effect already clears its own loading
flag when the lens goes off, which is the shape it was given for the toggle's
own second press.

**Bundle**: JS 583.27 → 583.41 kB raw, 173.94 → 173.99 kB gzipped; CSS unchanged
at 156.57 / 28.03 — two effects of four lines each, and their prose.
