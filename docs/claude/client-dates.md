### The date bar, and the range each roster view keeps

Split out of `client.md`, which holds the shell these sit in — the pinned
chrome, the view tabs and the report the dates decide the days of. This is the
**full-width bar under the tabs**, the row it opens, the component a matchup's
team pages share with it, and the thing that earned them a file of their own:
**the Roster and the Feed each keep their own range.**

#### It is a bar, and it was a button

**The dates run across the whole window, under the navigation chrome and above the page: a step back on the left, the days in the middle, a step forward on the right.** They were a *calendar button*, last in the wrapping row of tab groups, and before that a square icon in the header beside a round chip that stated the range and could not change it. Two things were wrong with the button and neither was fixable inside one:

- **The one fact every number on the page depends on was the smallest thing in the chrome.** `.view-bar` wraps by whole groups, so every character the button spent was one that could push the group after it onto the next line — which is why its label was `8/1 – 8/9` and not a date anyone reads aloud, and why under 640px it lost the label altogether and became a **10px bubble on the corner of a 36px glyph**. Measured, the button was **89px** wide at a desktop and **36px** on a phone.
- **Moving the dates was a two-press errand at every width.** Open the row, pick, and the row closes again. There was no way at all to say *the day before this one* — the commonest move there is — short of opening the picker and hitting the same day twice.

**What it costs and what it buys, measured at six widths** on the live fantasy roster (chrome height, Roster / Feed, `?preset=Today`):

| | before | after |
| --- | --- | --- |
| 1920 | 115 / 115 | 169 / 169 |
| 1200 | 115 / 115 | 169 / 169 |
| 640 | 159 / 111 | 213 / 165 |
| 480 | 159 / 159 | 213 / 213 |
| **390** | **207** / 159 | **213** / 213 |
| 320 | 255 / 207 | 309 / 261 |

The bar is **54px** and that is what it costs almost everywhere. The exception is the one that matters: at **390 the Roster gained 6px, not 54** — taking the calendar out of the tab row dropped that row from three wrapped lines to two (132px → 84), and the bar then paid for itself but 6. Page-body overflow is **0** at every width on every view, before and after.

**The bar's height does not change when its label does**, which is the rule a control under a finger has to keep. Measured at 1200 and at 320: **54px** on `Today` (`TODAY` over `Wed, Aug 19`), 54 on `Last 15 days` (`Aug 5 – Aug 19`), 54 in the Schedule reading (`SCHEDULE · WEEK 19` over `Aug 19 – Aug 23`) and 54 in the projected one. **No ghost is needed to reserve that box** and that is worth saying, because this file's own rule usually demands one: both lines are *always* filled — there is no state in which the upper one is absent, `Custom range` being what it reads when no rule is in force — so the worst case **is** the ordinary case. Each line is `nowrap` and truncates rather than wrapping; the widest lead the app can print is the Schedule reading's, and it is **130.1px** now that the span run names its weeks by number (`Schedule · Week 19`, where `Schedule · This Matchup` was 171) — against the **228** a 320px phone leaves between the two arrows, so nothing is clipped at any width the app supports. Measured at 320 and 1200 alike, and on both spans: the whole face is **200 × 39** either way, where the long labels made it 204.9.

**A three-column grid, not `space-between`.** The middle has to be centered on the *bar* rather than on the space its neighbours leave: the arrows are the same width, so two equal fixed side columns put the label on the bar's own center line whatever it says. Measured, the face's center is **600 at a 1200 window and 195 at 390**, on `Today` and on a fifteen-day range alike — under `space-between` those two labels differ by 21px of width and the text would shuffle under the finger that stepped it. And the face is **sized to its content and centered in that column** rather than stretched across it: stretched it measured **1092px** at a 1200 window, a press target the width of the page, which lights the whole bar on hover and reads as a surface rather than a control.

**The label is words now, not numerals.** `numericRange` and `tightRange` are gone with the button that needed them; `wideRange` prints `Mon, Aug 18` for a day and `Aug 10 – Aug 18` for a range. **It lives in `lib.ts`**, beside the `prettyDate` it is built on, rather than in `DateRangePicker.tsx` where the bar's own picker put it: it has four callers now — this face, a matchup's head, the Scoreboard's week face and the Rankings caption — and three of them never open a calendar. The three that arrived last had each open-coded `start === end ? prettyDate(start) : prettyDate(start) – prettyDate(end)`, which agreed with this face on every range and parted from it on exactly one span. Evaluated side by side in the browser: a day was **`Wed, Aug 19`** here and **`Aug 19`** there, while a range inside a month (`Aug 10 – Aug 19`), across a month (`Aug 24 – Sep 6`) and across a year end (`Dec 28 – Jan 3`) came out character for character the same from both. One function, so the fold changed one reading and settled three. The terseness was a *budget* rather than a choice, and the bar does not have to keep it — the widest form this produces (`Aug 28 – Sep 11`, a range across a month boundary) is 108px against 204 available at 320. The weekday rides on a single day only, where it is worth something; a range says its length in its two ends. The year stays off both, the app showing one season and saying so nowhere else on the page.

#### The arrows step the window by its own length, and land back on a rule where they can

**A step is the window moved by its own span** — a day steps a day, a week a week, `Last 15 days` fifteen — and the tooltip says which (`Previous day`, `Next 15 days`). The ceiling is the **picker's own `max`**, not today and not a second opinion about which days exist: the arrows have to reach exactly what the calendar reaches, or the bar holds two controls that disagree about the end of the season. There is no floor for the same reason — the picker has none. A disabled arrow keeps its box and its tooltip: it goes **off rather than away**, because a control that vanished would move the label out from under the finger stepping it.

**And this is where a preset had to be decided.** A preset is a rule and the URL carries only the label, so stepping back from `Today` could either freeze the range at yesterday's dates or say `Yesterday` — and the second is the true one: the rule and the range agree on this reader's clock, so a link shared from there re-derives on the recipient's own today, which is exactly what `Yesterday` means. **A step adopts a preset's label wherever the days it lands on are exactly that preset's days**, and produces an honest hand-picked range with no preset otherwise. Driven at 1200:

| press | reads | URL |
| --- | --- | --- |
| — | `Today` · Wed, Aug 19 | `?preset=Today` |
| ‹ | **`Yesterday`** · Tue, Aug 18 | `?preset=Yesterday` |
| ‹ | `Custom range` · Mon, Aug 17 | `?start=2026-08-17&end=2026-08-17` |
| › | **`Yesterday`** · Tue, Aug 18 | `?preset=Yesterday` |
| › | **`Today`** · Wed, Aug 19 | `?preset=Today` |

So a press and an unpress return you to the rule you started on, which is the thing a frozen range would have quietly lost.

#### The bar says which *reading* of the days it is on

Two modes reinterpret the dates, and a bar printing a bare range under either would be stating a fact that is no longer the one on screen.

- **Schedule** replaces the stat columns with one column per day *ahead*. The days on screen are then the span's rather than the range's, so the bar prints `Schedule · Week 19` over **the days it actually draws** (`spanDates`, off the index where it has landed and off the span's own definition while the window is still being read, so the bar does not go blank for the length of a fetch), and **the arrows step the span run** — `stepSpan`, over `scheduleSpans(matchup)` rather than all four, because an arrow that stepped onto `Next 7` in a league that names both its own weeks would produce a span the pills beside it do not contain. At either end the arrow is off and says `The first span offered` / `The last span offered`, the vocabulary of the reading it is in rather than `Previous day` for a press that would not move a day.
- **Projected** keeps the range but fills it with estimates over days that have not been played. The lens clears the preset on its way to today → the end of the period, so `Custom range` is what the bar would otherwise read — the label that says nothing about why. It reads `Projected`, and the arrows go on stepping the calendar: the reader is free to move off the lens's days, which is what that lens has always allowed.

Everything else — hide-injured, the kind tabs — narrows *rows* rather than reinterpreting days, and the bar is silent about all of them.

**`ScheduleSpanTabs` came with the span.** It was a group in the tab row beside the toggle that turns the mode on; it is in the bar's disclosure now, under the label the arrows move. Leaving it where it was would have been two controls an inch apart holding one piece of state, which is the fault the calendar and the old `dateBadge` chip were merged to fix. **The research board keeps its own copy in its own bar** and gets no date bar at all — and that is the decision rather than an oversight: the board has no `start`/`end` in the first place (its stats come off the window tabs, `Season · 7d · 15d · 30d · 60d`), so a bar that appeared only in Schedule mode would be a bar the page has no state for the rest of the time. Checked: on `?view=research&sched=matchup` the board draws **0** date bars and its own two-week strip, unmoved.

#### The disclosure, and what stopped being needed

**The presets and the range picker are still behind a press**, at every width and not just on a phone: they are 576px of pills and picker against the content width, set once and then read for the rest of a session, which is the shape of a thing that belongs behind a press. They open under the *middle* of the bar — a disclosure and the thing it discloses have to stay together. **Picking a preset closes the row**, from the pills and the phone `<select>` alike: it is the errand the row was opened for. The range picker deliberately doesn't, its own popover needing the row to stay put. Measured, the panel adds **50px** to the bar in every reading; the bar goes 54 → 104 and the pinned chrome follows it. It carried the span strip *above* the presets in the Schedule reading and came to **96** there — which is the paragraph below.

#### In the Schedule reading the span *is* the panel

**A preset list under a table of days ahead names days that no column on screen is drawn from.** The disclosure opened the same six presets and the same range picker in every reading, with the span strip stacked on top of them where Schedule was the reading — so the one control that decides what the reader is looking at sat above five that decide something else, in a panel a press taller than any other reading's. In that reading the columns are the span's days: the range still decides *whose* rows these are, but nothing a preset says is on screen. **So the span run is the whole panel there**, and `dates` and `projected` keep theirs untouched.

**Driven at 1200 × 900 on the fantasy roster**, opening the panel in each reading (`?preset=Today`, `?preset=Today&rproj=1`, `?preset=Today&sched=matchup`):

| reading | panel, before → after | bar | in it, after |
| --- | --- | --- | --- |
| dates | 50 → **50** | 104 | six preset pills, the picker |
| projected | 50 → **50** | 104 | six preset pills, the picker |
| schedule | 96 → **50** | 150 → **104** | `This Matchup` · `Next Matchup` |

At **390** the same three read 50 / 50 / 96 → 50, the phone `<select>` standing in for each pill row exactly as it did — `.schedule-span-select` is folded onto `.date-presets-select`, so one control replaces two and the height does not move with the swap.

**And that is the rule this bar owed, not a saving.** *Reserve the box, don't move the page*: the Schedule toggle is a press away in the tab row, so a reader can flip the reading with the panel standing open — and it did, taking the panel 50 → 96 and the pinned chrome with it. Measured at 1200 × 1400 (tall enough that the chrome is sticky), with the panel open in each reading: the chrome was **219 / 219 / 265** and the first row of the table sat at **270 / 318 / 316**; it is now **219 / 219 / 219** and **270 / 318 / 270**. The 48px the projected reading holds the table down by is its own `.summary-proj-note`, measured, and not the bar. Driving the round trip with the panel left open — open on `Yesterday`, Schedule on, the other span, Schedule off — the panel reads 50 at every step and the URL goes `?preset=Yesterday` → `&sched=matchup` → `&sched=next` → `?preset=Yesterday`: **a preset is a rule and survives the excursion**, which it must, the range being what says whose roster the schedule is of.

**And the strip is sized to its own content and centered, which the panel did not do for free.** `.date-bar-panel` is a column with `align-items: stretch`, and that is right for `.date-control` — a *row* of pills and a picker, which wants the width — and wrong for the span strip, which is not a row of controls but the control. Stretched, it measured **1180px at a 1200 window** against the 163 its two pills need: a segmented surface the width of the page, lighting on hover, which is the very fault the face one row up was fixed for (`stretched it measured 1092px`, above). At 320 and 390 the phone `<select>` measured **300 and 370** against the 100 it wants, its chevron a thumb's width from the word it belongs to. `align-self: center` on both halves takes them to **162.6** and **100**, centered under the label the arrows move — which is where they belong, the strip *being* the panel in that reading, so there is nothing to left-align them against. Both halves are named in the selector rather than only the one on screen at the width the rule was written at; the pills above 640 and the `<select>` below are one control, and a rule that caught one would be the same bug wearing the other's clothes. Measured after, and on all three callers: the roster's panel 162.6 at x=519 in a 1180 panel and 100 at x=110 / x=145 at 320 / 390, a team page's 162.6 at x=519 in a 780 panel — every one of them centered on the bar's own center line, the panel still **50px** in every reading, and page-body overflow **0**.

**The rule is in `DateBar`, not in each caller**, as a `spanControl` slot drawn *in place of* `children` where `reading.kind === 'schedule'`, falling back to `children` where a caller passes none — an unrecognized state falls back rather than emptying the panel a press promised. The alternative was a conditional in the caller, which is where the span strip already lived: `{!scheduleReading && <DateRow …/>}` in `App.tsx` is a smaller diff and was rejected for the reason this component exists at all — **a matchup's team pages draw the same bar**, and a rule about what one component's panel holds, written twice, is two panels that will one day disagree about it. Written once, both callers hand over their own span strip and neither decides anything. The face's tooltip follows the same test (`How far ahead`, where it used to promise `Presets and a range picker` under a panel that has neither).

**Two rules died with the button, and both were traps.** `.date-control` was `display: none` and undone only by `.app.date-open` — a class on the app's own shell — so a date row rendered anywhere else laid out correctly at **0 × 0** and showed nothing; the matchup overlay found exactly that and had to answer it with a second `display` rule of its own, which then had to stay in step. The bar renders its panel **only while it is open**, so the row is a plain flex row again, no shell knows anything about it and there is only one rule. `.date-toggle`'s whole family went too: the label, the corner bubble, the phone square, the `position: relative` it needed to anchor the bubble, and its membership of the header's four-square selector list.

**Where the bar bleeds is the container's business**, which is `--table-bleed`'s rule one box over: `--bar-bleed` is declared by whatever holds the bar — `--app-gutter` (22px) on `.app-chrome`, **12px** on the expanded full-page box — and defaults to 0, which is what a team page's tools want, that row being a centered 800px card column rather than the width of the overlay. Measured: the bar runs **0 → 1200** inside the chrome at a 1200 window and **0 → 1200** inside the expanded box, and **200 → 1000** on a team page, its face centered at 600 in all three.

#### The bar is pinned on its own now, and the row above it scrolls away

**It was the last thing inside `.app-chrome` and it is a sibling of it.** The
passage above says the bar stays inside the chrome so that `--chrome-h` is one
measurement of one pinned box; that reasoning is left as written and the
conclusion has been overturned, by a report about the other half of the bargain.
Everything that could be called chrome was in that box, so the pinned band
reached **303px at 320px wide** — most of a phone held sideways — and a reader
scrolling a table carried the reading toggles down the page with the dates.

**The split is between what says *where you are* and what says *which
reading*.** The chrome keeps the title row and the four main tabs and is pinned;
the tools row (`.view-tools`, which now holds the reading toggles, the League
tabs and the research board's control set) is in the page and scrolls away; the
bar is pinned under the chrome at `top: var(--chrome-h)`, `z-index: 39` against
the chrome's 41. Measured, the pinned band is **102px at 1200, 100 at 390 and
148 at 320**, against 169 / 213 / 309 before.

**There are two measured heights now rather than one**, which is the cost and it
is one `ResizeObserver`: `--date-bar-h`, published by
`hooks.ts::usePublishedHeight` from the app's own bar and from a matchup team
page's (`measure` on `DateBar`, and the two are never both on screen — the
expanded box's bar is above its pane rather than in it, so it publishes
nothing).

**It rounds *down*, and the direction is the whole of a reported bug.** The seam
between the bar and whatever sticks under it is `published − actual`, so it is a
**gap** whenever the published number is the larger — and `Math.round` produces
one on any bar whose height lands above `.5`. The bar is 54px at every width
this was measured at, which is why the seam was flush here and not on the
screen it was reported from: the face is a control height plus a line of text in
a font this app does not choose. Driven with the bar forced to 55.391px, `ceil`
publishes **56** and the seam measures **+0.609px** where `floor` publishes
**55** and it measures **−0.391** — a sub-pixel overlap, which paints as
nothing. `--chrome-h` and `--details-chrome-h` take the same rounding for the
same reason, this bar being what sticks under both of them. `--scroll-offset` is
`--chrome-h + --date-bar-h + 12px`, or a clip scrolling itself into view on the
Feed lands behind 54px of dates. The property goes to **0 on the way out as well
as in**, since a table's header row sticks below it and a stale height is a band
of nothing above the first column heading on every view with no bar. Measured
across the tabs, `--chrome-h`/`--date-bar-h`: Roster **0/54**, Research **0/0**,
League **102/0**, Matchup **0/0**.

**And on the Roster's table reading the bar is inside the table's own pane.**
That view is a viewport-tall flex column in which only `.summary-scroll` scrolls,
and a sticky box sticks to the box that scrolls — so a bar in the page there is
pinned to a column that never moves while the header row is pinned to the pane,
54px lower. Both rows are handed to `SummaryTable` as `paneChrome` and rendered
as the pane's first children, where they stick against the same scrollport and
take `position: sticky; left: 0` besides, the pane scrolling in both directions.
Measured at 1200×900 with the pane scrolled 600 down and 400 across: the bar
holds at **y 102** (the pane's top) and the header row at **156**, both at
**x 0**, with the tools row gone to −498. See **Client — the Roster view**,
*The tools row and the dates are inside the pane*.

**A matchup team page takes the identical arrangement**, which is the point of
having one component: the bar is a child of `.mup-view` and sticky under that
page's band on its feed reading, and inside `.summary-scroll` on its two table
readings. See **Client — a league matchup**, *The ladder, and where the bar
sticks on each reading*.

**One thing the move needed and nothing else did.** The bar carries
`flex: 1 1 100%` — "its own line", written for the wrapping rows it used to sit
in — and the two fixed-height views make `.app` a **column** flex container,
where that basis is 100% of the *height*. A 54px bar became the whole viewport
and pushed the table off the bottom of it until `.app > .date-bar` took
`flex: none`. It was inert in the chrome and is inert in the pane, both of those
being blocks. `--bar-bleed` moved with it, from `.app-chrome` to
`.app > .date-bar` — the child combinator is load-bearing, the bar being *also*
rendered inside a pane that has already bled through those same gutters.

**Where it is drawn.** On the Roster and the Feed, once there is something to read — the same guard the calendar carried, the dates qualifying exactly those two views and nothing on the research board. In the expanded full-page table, which keeps it for the reason it keeps the kind tabs: a table of dates with nothing on screen saying which days is the state that mode must never be in. And on a matchup's team pages, below their tools row. It goes with the rest of the chrome on the **edit screen** by being **named in `.app.edit-mode`'s list** rather than by being inside `.view-bar` — it used to inherit that for free and is a sibling of that row now; verified, `display: none` under that class where it is `block` without it.

#### On the Feed the face opens the calendar, and the presets are not behind it

**The press opened six preset pills and a field that opened a calendar; on the Feed it opens the calendar.** The bar is drawn on two views and they ask different questions of it — the paragraph below (*The Roster and the Feed keep their own range*) is that argument for the *range*, and this is the same argument one step further on, about the *control*. The Roster is a table read for what a line comes to over a named span, which is what `Last 7 days` is a word for; the Feed is a record of what happened, scrolled back through, and going to it is going to a **day**. Reaching that day was three presses — the face, the `Aug 19, 2026` field, then the day — of which the middle one existed only to get past a row of controls the reader was not there for.

**It is a popover over the page, not a panel in the flow, and that is a number rather than a taste.** The presets panel is 50px; the calendar is 318. The bar lives inside `.app-chrome`, which is pinned and whose height is *measured* into `--chrome-h`, so a calendar drawn in the flow is a calendar added to the pinned chrome. Driven on the Feed with the calendar open, the same grid drawn in the bar's flow against drawn over the page:

| | chrome, over the page | chrome, in the flow | window |
| --- | --- | --- | --- |
| 1400 × 900 | **169** | 501 | 900 |
| 390 × 844 | **213** | 545 | 844 |
| 320 × 844 | **309** | 641 | 844 |

At 390 that is 65% of the window given over to chrome, with the first feed item pushed to y=633 — a control that answers *which day* by hiding the day. Over the page the chrome does not move at all, at any of the three widths, and page-body overflow is **0** in every state measured.

**The anchor is the bar, not a wrapper round the face**, which is what the three-column grid already buys: the middle column is centered on the bar's own center line whatever the label says, so a popover centered on the bar is centered on the face by construction. Measured, the bar's center and the face's center are the same number at all three widths — **700 / 195 / 160** — and the popover is 260 wide at each, running 570 → 830 at 1400, 65 → 325 at 390 and 30 → 290 at 320. `.drp-popover` is folded onto in the JSX rather than restyled, so the Feed's calendar and the Roster's are one surface; what `.date-bar-pop` declares is the anchoring and a `--popover-max-h` cap, the latter for the reason that token exists — measured at 712 / 612 / 516 at the three widths, none of which the 318px grid reaches, but a phone held sideways would.

**The presets do not stay, and that is the decision rather than an omission.** Three things were weighed:

- **The arrows already carry the two that matter.** `stepRange` lands back on a preset's *label* wherever the days it reaches are exactly that preset's days, so `Today` → ‹ → `Yesterday` → › → `Today` round-trips through the rule rather than through a frozen range, with the URL going `?preset=Today` → `?preset=Yesterday` → `?preset=Today`. Those are the two a stream reader wants; the other four are spans, and the four *are* reachable — two presses on the calendar draw any of them.
- **Keeping them above the calendar would have made "opens the calendar" false where it matters.** Stacked, the panel is the pills plus the grid, and on a phone the pills are a `<select>` — so the control the press was for starts 50px lower on a surface that already has the least room. At 320 the popover's foot is at 634 against an 844 window; 50px of presets above it puts it past the fold.
- **A preset names a span and a feed is not read in spans.** `Last 15 days` on a stream is a scroll, not a reading, which is the same fact that made `Schedule` and `Projected` the Roster's alone.

The pills, the phone `<select>` and the field-behind-a-calendar are all untouched on the Roster, where the case for them is the case that was always made: measured after this change, its panel is **50px** and its bar 54 → 104 exactly as before, six pills, one field, and one press of Escape closing the calendar and leaving the panel standing.

**Dismissal is the app's, not a second mechanism.** `useDismissable` on the bar, so an outside press closes the popover and is **spent on the closing** — driven at 1400 with the calendar open on the Feed, a press on the `Roster` tab behind it dismissed the popover and left the view on the Feed (`?view=feed` unchanged), and a second press then crossed. Escape goes through `answersEscape` and undoes exactly one thing: driven on a matchup's team page in its feed reading, one press closed the calendar with the matchup page still open (`?mup=109&mt=6` intact) and a second closed the page. **The box the press is tested against is the whole bar**, deliberately: the face is the opener and its own `onClick` already toggles, so a face outside the test is a dismissal and a re-open racing each other on one press — and the arrows are inside it because they and the calendar are one control over one range, so a step with the calendar open moves the grid (`DateCalendar` re-centers on `end`) instead of closing it.

**A matchup's team pages take it from the same component**, in the `feed` reading, and there the case is stronger rather than weaker: that page's preset row leads with a `Matchup` pill of its own, and the whole page *is* one matchup period, so it is the one preset a reader of that feed has least reason to press. Driven at 390 on `?view=league&mup=109&mt=6`: the Roster reading opens six pills and a field in a 50px panel (bar 103), and the Feed reading opens a 260 × 318 calendar with the bar still at 53.

**`DateRangePicker` split in two for it.** `DateCalendar` is the month head, the grid and the foot — no field, no open state — and `DateRangePicker` is that calendar behind the field the Roster's panel wants. The two surfaces share the grid rather than being two grids that agree today about how a range is picked. The effect that used to re-center the grid and drop a half-made selection on every open is gone with the split: the calendar is mounted only while it is shown, so a fresh mount does both in its own initializers, and the remaining effect watches `end` — which is what makes an arrow pressed with the calendar open move the grid to the month the reader has just been moved to.

#### And then the Roster's face opened the calendar too, and `DateRow` went with its last reader

**The paragraph above made the case for the Feed and closed by saying the pills were "untouched on the Roster, where the case for them is the case that was always made".** That case has now been re-read against what the arrows actually do, and it does not hold. The six pills bought two things a reader presses and four they do not:

- **`Today` and `Yesterday` are already the arrows.** `stepRange` lands on a preset's *label* wherever the days it reaches are exactly that preset's days, so `?preset=Today` → ‹ → `?preset=Yesterday` → › → `?preset=Today` round-trips through the **rule**, not through a frozen range. Driven at 1400, 390 and 320 on the live roster: identical at all three. Those are the two moves a dated table takes, and neither needed a panel.
- **The other four were a press away from the calendar anyway.** `This week`, `Last 15 days`, `Tomorrow` and (on a connected league) `Matchup` are spans; a span is two presses on the grid. What the pills saved was one press on four spans, against one press *added* on every day-level move — the face, then the `Aug 19, 2026` field, then the day — which is the move the bar exists for.

**So `popover` is what every reading but Schedule opens**, on the Roster, in the projected reading, in the full-page table box and on a matchup's team pages alike. Schedule keeps its panel for the reason it already had: the columns there are days *ahead*, and a calendar over a table of fixtures picks days no column is drawn from.

**Measured at 1400 × 900 on the live fantasy roster**, pressing the face in each reading (`?preset=Today`, `&rproj=1`, `&sched=matchup`):

| reading | before | after |
| --- | --- | --- |
| dates | a 50px panel, six pills and a field; bar 54 → 104 | a **260 × 318** calendar over the page; bar **54**, chrome **169** unmoved, first table row at **169** either way |
| projected | the same 50px panel | the same calendar, `Projected` still the lead |
| schedule | the span strip, 50px panel | **unchanged** — the strip, 50px, bar 54 → 104 |

and at 390 and 320 the calendar is 260 × 318 at x=65 and x=30, centered on the bar's own center line (195 / 160) with `--popover-max-h` measuring 612 and 516. Page-body overflow **0** at every width in every reading.

**`DateRow` had no reader left, so it is gone**, and `DateRangePicker` — the calendar behind a *field* — with it: the field existed because the grid sat at the end of a preset row, and there is no preset row. `DateCalendar` is the whole of the picker now. Out of the stylesheet with them went `.date-control`, `.date-row`, `.date-presets`, `.date-preset`, `.date-presets-select`, `.drp`, `.drp-field`, `.drp-icon`, `.drp-value` and the two narrow-screen rules that hid the pill row — **five selector names and no declarations**, the pills having been a fold onto `.view-switch`/`.view-tab` all along. `.date-presets-select` headed the app's one dropdown rule (the research board's three, the Schedule span's, the Rankings span's, the matchup picker's); the list is headed by `.research-window-select` now and nothing in it changed but the name at the top. Bundle over the whole branch (this change plus the Summary reading beside it): CSS **159,545 → 158,755** raw and **28,553 → 28,438** gzipped; JS **602,263 → 600,818** raw and **177,464 → 177,299** gzipped — smaller on all four counts, which a change that removes a component and five selector names should be.

**What is genuinely lost, said plainly.** A preset is a *rule* and the calendar can only produce a *range*, so `This week`, `Last 15 days` and `Matchup` are now reachable as days but not as rules: two presses on the grid give you the same table under `Custom range`, and a link shared from there carries `start`/`end` rather than a label the recipient's own clock re-derives. `Today` and `Yesterday` keep their rules through the arrows, and a `?preset=` link written before this change still opens exactly as it did — nothing stopped *reading* labels, only writing them from a pill. The one that stings is `Matchup` on the roster; the matchup page answers it directly now, with a **Summary** reading whose days are the period's and are not the reader's to move (see **Client — a league matchup**).

**The how-to page's Dates chapter was rewritten with it**, because a tutorial drawing a control the app no longer has is worse than no tutorial: the `Demo` replica of the pill row is gone, the list is `Today` / what an arrow does / what the middle opens, and the note explains `Custom range` rather than "picking a preset closes them again".

#### And where the days are not the reader's to pick, the bar says so and offers nothing

**`fixed` on `DateBar`**: no arrows, and the face is a `<div>` rather than a `<button>`. It exists for a matchup team page's **Summary** reading, whose span is the period's start to today.

**This is deliberately not the disabled-arrow rule.** A step that has nowhere to go goes *off rather than away* — it keeps its 36px box because the reader could have stepped and cannot from *here*, and a control that vanished would move the label out from under the finger stepping it. In a fixed reading there is no stepping at all and never was, so two permanently dead squares would be a control the page does not have. The row goes from `--control-h · 1fr · --control-h` to a single `minmax(0, 1fr)`, which is the same center line with the two tracks and their gaps given back: **measured at 1400 on a team page, the face's center is 700 either way**, so the label does not move as the reader crosses the switch — which is why this is one grid with a different track list rather than a second box.

Nothing else is restated. The face keeps its fill, radius, two lines and `min-width` floor; it loses the hover tint (the `@media (hover: hover)` rule is now `.date-bar:not(.date-bar-fixed) .date-face:hover`, because a `<div>` has no `:disabled` to lean on) and the pointer cursor, and it loses those by being a `<div>` rather than by a rule about what it says.

#### What this replaced (kept for the history)

The two paragraphs below are the button's own argument, left as written. The
rules they describe are gone; the reasoning is why the bar reads the way it
does, and the second of them is still the live rule for `DateRow` itself.

> **The date controls are behind `.date-toggle` at every width** — not just on a phone. They are 576px of pills and picker — measured against the 1136px content width the app used to cap itself at, where they were easily the widest thing in the chrome — and they are set once and then read for the rest of a session, which is the shape of a thing that belongs behind a button. On a phone the button that opens them is the same calendar reduced to its icon, with the range on a bubble. They are **rendered once** rather than duplicated into a second location: `.view-bar` already wraps, so `.app.date-open .date-control { flex: 1 1 100% }` is the whole of "open as its own row", and it opens directly under the row whose last item is the button that opened it.
>
> **The button is on the roster row, not in the header, and it says which days it holds.** Those were two controls until then: a square calendar icon up in the header and a round `dateBadge` chip down in the view bar — the page stating the span in one place and letting you change it in another, and a chip that could only be read sitting an inch from a button that only opened. One control does both, and the label *is* the state: **`activePreset ?? numericRange(start, end)`**, so it reads `Today` while a preset is active — that is what was picked, and it survives the date rolling over — and `8/1 – 8/9` once a range is picked by hand. **Numeric on purpose**: it sits in a wrapping row of tab groups, so every character it spends is one that can push the group after it onto the next line. It kept its label at every width, alone among the chrome's buttons in doing so: the label was the only thing on the page saying which days every number on it is drawn from, and the icon alone would leave that unsaid.

#### One component, two callers

**The pieces are `components/DateControls.tsx`** — `DateBar`, `DateRow` (since removed with the preset row, above) and the two pure helpers the callers share (`stepRange`, `dateBarFace`) — extracted when a second surface needed them: a matchup's team pages are these same roster views read for a leaguemate's team over a span the reader picks, and a second implementation of "Today / Yesterday / a range" beside this one is two controls that will one day disagree about what a preset means. What each caller keeps is the **state** — which days, which preset, whether the row is open, and what a step does — that being the only half the two genuinely answer differently. The *face* is built by one function so the roster and a team page cannot come to word the same state differently. See **Client — the League view**, *A team page is the app's own Roster and Feed views*.

**Driven on a team page** (`?view=league&mup=110&mt=5`, 1200×900): the bar is 800 × 54 at x=200, its face centered at 600, `Today` → ‹ → `Yesterday`; the Schedule toggle takes it to `Schedule · This Matchup · Aug 19 – Aug 23` with the back arrow off (`The first span offered`) and the forward one reading `Show Next Matchup`; and its panel carries a preset row leading with that page's own `Matchup` pill — **one** of them, over six, which is the rule that page already had. That was driven before the panel came to hold the span run alone in the Schedule reading, which this page takes from the same component and for the same reason: there its panel is the span strip and that pill is not in it, being exactly the preset that reading makes least true.

### The Roster and the Feed keep their own range

**They shared one, and the two pages ask different questions of it.** The Roster
is a table read for what a line comes to and is opened on today; the Feed is a
stream scrolled back through, and going to it for last week's plays is an
ordinary thing to do. Sharing meant every such excursion cost the other page its
range: back on the Roster you found a summary table of last week, put the
calendar to Today to fix it, and found the Feed on Today the next time you
crossed. One control answering two questions and losing one of them each way.

**So `App.tsx` holds a range per roster view** (`ranges`, keyed by `DateScope` —
`summary | feed`), and `start`, `end` and `activePreset` are the live entry
destructured out of it. Nothing downstream was told: the report read, the
fantasy roster read, `rangeHasToday`, the projected lens and the URL sync all go
on reading those three, so what changed is only *which* pair they resolve to.

**Nothing about the control moved either.** It is the same button, the same
presets, the same picker and the same phone `<select>`, rendered on whichever
page is on screen and writing that page's own entry — one `setRange`, which
reads the scope at call time rather than closing over it, so the presets, the
range picker and the projected lens's excursion into the days ahead all land on
the entry the reader is looking at.

**Both entries are seeded from the same link**, which is the honest reading of
one: `?preset=Yesterday` means yesterday, whichever page it opens on. They part
from there as the reader moves each, and the URL then carries the range of the
page in view, that being the one it describes.

**The scope is sticky across Research and League**, which is the one piece of
machinery this needs. Those two draw no dates at all, so mapping them to
`summary` would swap the range out from under the report on the way *out* of the
Feed and again on the way back in — two `/api/report` reads, the app's most
expensive request, for a range nobody is looking at in between, with the roster
pills and the live poll flickering along with them. `dateScopeRef` is written
during render and only while `isRosterView(view)`, so a crossing leaves the last
roster view's range standing. It is derived purely from `view` and idempotent,
which is the rule the file's own `reportsRef` write already follows.

**What a *crossing between the two* costs is one report read, and only when
their ranges differ.** That is the same read changing the date on one page has
always cost, answered off the server's own cache, and nothing blanks while it is
out — rule 1 of the loading system, so the previous page's rows stand under the
`Updating` badge exactly as they do when the calendar is worked.

**The projected lens is the one thing that moves a range without being a date
control**, and it stays inside its own scope by construction: it is drawn on the
Roster alone, so its excursion into the days ahead and the `beforeProjection`
restore both write `summary`. Measured on the live app — pressing it takes the
Roster to `8/18 – 8/23` while the Feed sits unmoved on `Yesterday`, and pressing
it off puts the Roster back on `Yesterday`, preset and all.

**Driven in a browser at 1200×900 and 390×844 against the live server**, on a
fantasy roster:

| | Roster | Feed | report reads |
| --- | --- | --- | --- |
| boot | `Today 8/18`, 14 rows | — | 1 |
| → Feed, pick `Yesterday` | — | `Yesterday 8/17`, 20 items | 1 |
| → Roster | **`Today 8/18`, 14 rows** | — | 1 |
| → Feed | — | **`Yesterday 8/17`** | 1 |
| → Research → Feed | — | **`Yesterday 8/17`** | **0** |
| → League → Feed (390px) | — | **`Last 15 days 8/4–8/18`** | **0** |

The phone's `<select>` writes the Feed's own entry the way the pills do
(`Last 15 days` on the Feed against `Today` on the Roster), a deep link opens
both pages on the range it names (`?view=feed&preset=Yesterday` → both), the URL
carries the range of the page in view and the last roster view's while on
Research or League, and page-body overflow is **0** at both widths on every
view. The pinned chrome is unchanged at 207px (Roster) and 159px (Feed) at 390.

**Bundle: 574.17 → 574.32 KB of JS** (170.82 → 170.85 gzipped), **CSS unchanged
at 154.95** (27.73) — 150 bytes raw and 30 over the wire, for a record, a sticky
scope and one setter; the paragraphs arguing them cost the bundle nothing.

### And the fantasy week is a preset of its own

**A manager reading his own roster could not ask for *this fantasy week*.** The
row offered `Today · Tomorrow · Yesterday · This week · Last 15 days` — a
calendar week among them, which is not the week his league scores — while the
one page that already knew the answer was a matchup's team page, two views over,
about somebody else's team. So the row takes a sixth pill, **`Matchup`**, off the
connected league.

**It is derived rather than declared, which is why it is not in `datePresets()`.**
That function is a pure five and is memoized once at mount; these days come off
`/api/espn/matchup-window`, a read App already makes once per session on a
connected league for the Schedule control's two named spans. `rosterPresets` is
the five plus this one where there is a window to name it with, and it is the
list the two roster views' `DateRow` was handed. **There is no `DateRow` now** —
see *And then the Roster's face opened the calendar too* — and `rosterPresets`
survives it as the list `stepRange` reads to name the days an arrow lands on,
which is the half of a preset that outlived the pills.

#### The end is clamped to today, and the whole period is not what it names

`MatchupWindow` publishes the period **entire** — Aug 10 – Aug 23 on the live
league's fortnight-long playoff round — because it was derived for the
**Schedule** view, which is a grid of fixtures and wants every day of it. These
two tables are cut by what has been *played*: on the 18th, a range running to
the 23rd is five days of empty columns on every row of the summary table and
five days of nothing on the Feed, under a pill whose whole claim is that it
names the week's numbers. `matchupDays` clamps it, so `Matchup` is the days the
week has actually had — **Aug 10 – Aug 18** on the day this was measured — which
is also the span the League page's own category totals are summed over, so the
two agree rather than the table quietly including days the score does not. A
period whose first day is still ahead has no played days at all and so no span,
which drops the pill rather than offering a range that runs backwards.

**The days ahead are not lost, they are two other controls**, and the split is
clean: the Schedule view replaces the stat columns with the fixtures and offers
the league's own two weeks as its spans, and the projected lens runs
from today to `matchupWindow.end` — the rest of this very period. Measured, that
composes exactly: `Matchup` is `8/10 – 8/18` and pressing the lens over it gives
`8/18 – 8/23`, the two halves of the week either side of today.

**The scoreboard's own `start`/`end` were the other candidate and were
rejected.** They truncate at today already, so they would need no clamp at all —
which is what a matchup's team page uses (`LeagueMatchup.tsx::matchupSpan`, off
the `board` it is drawn from). They ride on `/api/espn/scoreboard`, which is read
only while the League view is open or a matchup is; making the **Roster** depend
on it would put a league-wide read on every load of the two views most people
never leave, for a pill many of them never press. The window is **103 bytes**,
already being fetched, and is what the derivation exists for.

#### No `Next matchup`, and that is a decision

The window carries one (`matchupWindow.next` — Aug 24 – Sep 6 on the live
league) and it is not offered. Both these tables are cut by what has *happened*,
so a span wholly in the future is a summary table of em-dashes and a Feed
reading `No games for these players` — a control that empties the page with
nothing on screen to say why, which is the one thing this app's own rules forbid
a filter to do. `Tomorrow` is not the counter-example it looks like: it is **one
day**, and what it is for is the Upcoming section's scheduled games, where a
fortnight of those is not a reading anybody wants. Next week is the Schedule
view's question, and that view already answers it.

#### It reads last, where the matchup page's own copy leads

There `Matchup` is the reason the reader opened the page; here `Today` is the
reading a manager arrives with and the app's own default. It is also the widest
of the named spans, so last is where the row's existing narrow-to-wide order
puts it — and adding at the end moves no pill anyone has already learned the
position of.

**And it is the same word for a deliberately different span**, which is why
`LeagueMatchupView` goes on being handed the bare five and adding its own on top:
that one names *the matchup being read*, a week the reader navigated to and often
a past one, where this names *the week the league is on*. Handing that page a
list which already carried one would put two pills reading `Matchup` in one row,
meaning two spans. Checked: a team page draws **1** `Matchup` pill, leading, over
six in total.

#### A `Matchup` link is a rule, so its days are derived at boot

A preset is a rule rather than a range — the URL carries only the label — so a
link saved under this one opens on the **recipient's** current matchup rather
than on the sharer's fortnight. Which means the label is all there is at mount
and the days arrive a round trip later, from a league that has not answered yet.
Three things follow, and each is a rule this file already had somewhere else.

- **`initialPreset` accepts the label on trust.** It is validated against
  `presets`, which cannot contain it, so `Matchup` is named explicitly there —
  the one preset whose dates are not derivable from the clock alone.
- **The report waits for it** (`matchupFromUrl && !matchupWindowSettled`), which
  is the third clause of a gate whose first two already say the same thing one
  question earlier: a read fired now is about a range nobody is going to be
  shown and would be replaced a moment later by the one they asked for. It costs
  nothing to anybody else, `matchupFromUrl` being false on every load that did
  not name the preset.
- **The settle and the resolution are one state update** (`settleMatchup`), and
  that had to be measured to be got right. With them apart — the flag set in the
  fetch and the range moved in an effect keyed on it — the gate opened on one
  commit and the range on the next, so the report effect fired **twice**:
  `?start=2026-08-18&end=2026-08-18` at 26ms and `?start=2026-08-10&…` at 27ms.
  Batched, there is one read, which is what the gate was for. Measured on the
  live league, reads per boot: **`?preset=Matchup` 1**, against **2** for
  `?preset=Today` and 2 for `?preset=Last 15 days` — the pre-existing shape,
  where the effect re-runs as the fantasy roster lands. So the gate is a net
  saving against the ordinary path rather than a cost.

**With no span the label falls back to `Today` rather than being kept**, and
that is where this parts from the Schedule view's own spans. There the control
can mark the span it is *actually* drawing while the URL keeps what it was
handed (`sched=`, the rule `cols=` follows); here a preset's label **is** its
state and is what the calendar button prints, so a reader with no league would
be left on a button reading `Matchup` over a row with no such pill and no way
back to it. The URL self-corrects to `preset=Today` on the next sync, which is
the honest reading of a link this reader cannot honor. It only ever touches an
entry still sitting on the label, so a reader who moved the dates in the second
before the league answered keeps their own range.

#### It falls out for both views, because the range does

The Roster and the Feed each keep their own entry and the preset row is one
shared control, so nothing had to be threaded: picking `Matchup` on one leaves
the other where it was, and a link seeds both. `settleMatchup` walks both
entries for that reason — a `?preset=Matchup` link has to mean the matchup on
whichever of the two it is read from.

#### Measured

**Against the live 12-team league on 2026-08-18** (period 19, Aug 10 – Aug 23),
at 320 / 390 / 480 / 640 / 900 / 1200 / 1920, A/B'd by hiding the pill on the
same page at the same instant:

| | without | with |
| --- | --- | --- |
| preset row, 900 / 1200 / 1920 | 441.55px | **522px** |
| preset row, 320–640 | 0 (the `<select>`) | 0 |
| pinned chrome, 320 / 390 / 480 / 640 | 303 / 255 / 207 / 207 | **unchanged** |
| pinned chrome, 900 / 1200 / 1920 | 207 / 161 / 161 | **unchanged** |
| page-body overflow, every width | 0 | **0** |

So the pill costs a desktop **80.45px** of a row that had the width for it — no
wrapped line at any width — and costs a phone **nothing at all**, the row being
hidden below 640 and the sixth option riding in the `<select>` for free.

**What it draws**, at 1200×900 and 390×844 alike: the button reads `Matchup`
with a `8/10–8/18` bubble, the URL reads `?preset=Matchup`, and the summary
table goes **14 rows / `Total 12/40 · 10 R · 5 HR · 12 RBI · 1.116`** on `Today`
to **15 rows / `Total 88/341 · 48 R · 20 HR · 57 RBI · .834`** — the week's own
union of rosters, which is what a fantasy week read as a roster is. The Feed
over the same span draws its 20 items and pages on.

**Every state was driven rather than reasoned about.** A `?preset=Matchup` deep
link resolves to `8/10–8/18` with the pill lit and one report read, at both
widths and on `view=feed` as well as the Roster. On the **phone**, picking
`Matchup` out of the `<select>` on the Feed takes it to the week, crossing to the
Roster finds it still on `Today`, and crossing back finds the Feed still on the
matchup. The **projected lens** over it goes `Matchup` → `8/18 – 8/23 · rproj=1`
→ back to `Matchup`, preset and all. And **disconnected** (`/api/espn` stubbed to
`{connected:false}`): five pills and five options with no `Matchup` among them, a
`?preset=Matchup` link falling back to `Today` with the URL rewritten to
`preset=Today`, two ordinary today-today report reads, no error banner and 0
overflow. A matchup's own team page is untouched — one `Matchup` pill, leading,
`Today` lit on a live week.

**Bundle: 574.32 → 575.02 KB of JS** (170.85 → 171.25 gzipped), **CSS unchanged
at 154.95** (27.73) — 0.7KB raw and 0.4KB over the wire, for a derived preset, a
boot gate, a resolver and one more entry in a list; the paragraphs arguing them
cost the bundle nothing.
