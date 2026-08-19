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
