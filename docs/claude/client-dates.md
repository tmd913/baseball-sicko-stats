### The date controls, and the range each roster view keeps

Split out of `client.md`, which holds the shell these sit in — the pinned
chrome, the view tabs and the report the dates decide the days of. This is the
calendar button and the row it opens, the component a matchup's team pages share
with it, and the thing that earned them a file of their own: **the Roster and
the Feed each keep their own range.**

**The date controls are behind `.date-toggle` at every width** — not just on a phone. They are 576px of pills and picker — measured against the 1136px content width the app used to cap itself at, where they were easily the widest thing in the chrome — and they are set once and then read for the rest of a session, which is the shape of a thing that belongs behind a button. On a phone the button that opens them is the same calendar reduced to its icon, with the range on a bubble — see the starters toggle's note below, which the two share. They are **rendered once** rather than duplicated into a second location: `.view-bar` already wraps, so `.app.date-open .date-control { flex: 1 1 100% }` is the whole of "open as its own row", and it opens directly under the row whose last item is the button that opened it. **Picking a preset closes the row**, from the pills and the phone dropdown alike: it is the errand the row was opened for. The range picker deliberately doesn't, its own popover needing the row to stay put. Both are hidden on the research board, which has nothing dated to act on, and with the rest of the chrome on the edit screen — by being inside `.view-bar`, which that mode hides, rather than by being named in its list.

**The two pieces are `components/DateControls.tsx` now** — `DateToggle` and `DateRow` — extracted when a second surface needed them: a matchup's team pages are these same roster views read for a leaguemate's team over a span the reader picks, and a second implementation of "Today / Yesterday / a range" beside this one is two controls that will one day disagree about what a preset means. The markup and the classes are unchanged, so every rule above applies to both callers by construction; what each caller keeps is the **state** — which days, which preset, whether the row is open, and what a pick does — that being the only half the two genuinely answer differently. One trap the second caller found and this one never could: `.date-control` is `display: none` by default and undone only by `.app.date-open`, which is a class on the app's own shell, so a row rendered outside it lays out correctly at **0 × 0** and shows nothing. See **Client — the League view**, *A team page is the app's own Roster and Feed views*.

**The button is on the roster row, not in the header, and it says which days it holds.** Those were two controls until now: a square calendar icon up in the header and a round `dateBadge` chip down in the view bar — the page stating the span in one place and letting you change it in another, and a chip that could only be read sitting an inch from a button that only opened. One control does both, and the label *is* the state: **`activePreset ?? numericRange(start, end)`**, so it reads `Today` while a preset is active — that is what was picked, and it survives the date rolling over — and `8/1 – 8/9` once a range is picked by hand. **Numeric on purpose**: it sits in a wrapping row of tab groups, so every character it spends is one that can push the group after it onto the next line, and the month name buys nothing the number doesn't (the year buys less still — the app shows one season and says so nowhere else on the page). It keeps its label at every width, alone among the chrome's buttons in doing so: the label is the only thing on the page saying which days every number on it is drawn from, and the icon alone would leave that unsaid.

It is on the roster row for the reason the roster tabs are: the dates qualify exactly those three views and nothing on the research board, so a header slot made it chrome belonging to the whole app when it belongs to one page of it. **Last in the row**, after the tab groups — it answers "which days", the question that comes after "which page", "which kind" and "which reading of them".

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
list the two roster views' `DateRow` is handed.

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
`This Matchup` and `Next Matchup` as its own spans, and the projected lens runs
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
