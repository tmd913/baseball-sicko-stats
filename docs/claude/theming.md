### Themes: the palette, and the switch that changes it

The app has **two colour schemes** — **Midnight**, the dark original and still
the default, and **Lavender**, a light gray and violet one — and a picker in the
settings menu. This file is the whole of it: how a theme is expressed, what had
to change before a second one was possible, how the choice is stored and how it
reaches the first painted frame.

**A theme is a palette, not a stylesheet.** `client/src/styles.css` opens with a
`:root` block of colour tokens and closes with a block that redeclares the same
names against **`html[data-theme='lavender']`**. Nothing else in 12,000 lines of
stylesheet knows there is more than one, and no component reads a theme at all.
The only rules a theme adds of its own are a short run of gradients the dark
theme does not want (below).

### What had to change first: 88 literals and a dozen hexes

**A token is only a token if the rules use it, and they didn't.** The palette
had names for its colours and then spelled the colours out again wherever a
*tint* of one was wanted: `rgba(56, 189, 248, 0.12)` for a 12% accent wash, the
same four numbers in forty places — 88 of them across ten palette entries. A
theme moving `--accent` would have moved the accent and left every wash it backs
sitting on the old hue, which is the failure mode that looks like the theme half
worked.

They are `color-mix(in srgb, var(--accent) 12%, transparent)` now. That is the
**identical colour by construction** — the mix is against `transparent`, so the
percentage *is* the alpha — and it follows whatever the token holds. The
conversion was mechanical and exact (a script over the ten known literals, 88
substitutions, no hand edits), which is what makes it checkable: see the pixel
diff at the foot of this file.

**A dozen hard-coded hexes were not palette entries at all** and each got a name
for what it is rather than for what it was:

| token | what it is |
| --- | --- |
| `--on-accent` | ink on a saturated fill — a lit tab, a count badge, a lineup pip |
| `--prose` | body prose inside a card (a play description) |
| `--out-ink` | ink on the one badge whose own tone is too quiet to write in |
| `--error-ink` | the error banner's ink |
| `--pitch-ink` | the number inside a pitch dot |
| `--chip-solid` | the ground under a status code on a **photograph** |
| `--video-chip` / `--video-chip-hover` | the mute chip over playing video |
| `--scrim` | the dimmer behind a dialog |
| `--page-glow` / `--brand-2` | the page's own radial glow, and the brand mark's second stop |
| `--shadow-bar` / `--shadow-pop` | the two lifts that are not `--shadow` |

Two more were already tokens and simply started following one:
`--rank-hot`/`--rank-cold`, the League table's diverging rank scale, were
`#f87171` and `#60a5fa` written out — which are `--strikeout` and `--walk` to
the byte, so they reference them now and theme for free. And the two empty bar
rails (`.pct-track`, `.spl-track`) were a **white** alpha, which is a veil on a
white card; they are `color-mix(in srgb, var(--text) 7%, transparent)`, the page's
own ink, so they invert with the theme.

**`--on-accent` changed one pixel of the dark theme, deliberately.** Eighteen
rules wrote their ink as `var(--bg)`; a nineteenth — `.lineup-spot.spot-out`, the
red "!" pip — wrote `#fff`. White on `--strikeout` measures **3.60:1** against the
near-black's **5.94:1**, so folding it in both unifies the rule and takes that
pip from under the bar a 9px bold glyph owes a reader to comfortably over it.

### The Lavender palette, and the three jobs a colour has to do

The measured figures live in the stylesheet beside the block that declares them,
which is where they can be checked against what is actually shipping. What is
worth having here is the **shape of the problem**, because it is the thing a
light theme gets wrong and the thing this one got wrong on its first pass.

A semantic colour does three jobs. It is **printed as text on the page**, it is
**filled under white ink**, and — the one that is easy to miss — it is **printed
as text on a live-role row**, whose ground is that same palette washed over the
page. On a dark theme the third is free: a colour sitting 9–11:1 from the page
barely notices a 20% wash. On a light theme the wash eats most of a 4.5, and the
first pass put the live inning's green on a tinted row at **2.90:1**.

Solving all three at once is what pushes every hue deeper than its dark-theme
twin — the amber lands on a dark gold rather than a sunflower, which is what
every light theme's "warning" is and for exactly this reason. The bar used was
the app's own: the dark theme's worst real text on a tinted row is `--muted` at
**4.60** and `--strikeout` at **4.38**, and the light set lands at **4.40–4.91**.

**Two purples is the one thing the theme buys and pays for.** The accent is the
hero lavender and the on-base live role is a purple of long standing, so the two
share a family at ΔE **10.1** — the tightest pair in either palette, against the
dark theme's own `--accent`/`--walk` at 11.7. It is taken deliberately: they
never appear in one key (the summary table's legend draws the four *roles*, and
the accent is not among them), they are different objects, and the alternative
measured worse where it counts — pushing the purple far enough to clear the
accent takes the at-bat/on-base grounds under 12, and *those* two are drawn side
by side in that legend.

**The role grounds are mixed at 24%/22%** against the dark theme's 22/20, a 20%
wash of a deep colour over a near-white page being a tint you have to look for.
Their six pairwise ΔE2000 distances bottom out at **12.6** against the dark
theme's 12.1.

### Ombré

The dark theme gradients the things that are *lit* — the page, the pinned bar, a
card header — and leaves the rest flat, because on a near-black ground a second
flat step is all a gradient can be. On a pale ground it is the opposite: white on
white needs an edge, and a two-step wash gives a surface a top and a bottom
without spending a border on it. So the theme block carries a short run of rules
of its own: a two-radial page (warm at the top right, cool at the foot), a
`--panel` → `--panel-2` wash on the cards and popovers, and a header row on the
four wide tables that reads as a header.

**The three wide tables keep a flat body on purpose.** A gradient down a
scrolling table would slide against its own rows, and the zebra stripe is already
doing the work a wash would do.

**The header gradient has to be set through `--cell-bg`, and setting
`background` instead was a shipped bug.** The summary table — and the research
board, whose table carries `.summary-table` too — draws a **6px strip of
`var(--cell-bg)` straddling every cell's left edge**, the cover for the sub-pixel
seam between two cell grounds (see **Client — the Roster view**, where that
mechanism is argued at length). Assigning `background` directly left the strip on
the *solid* colour the token still held while the cell had become a gradient, so
every column boundary in the header wore a vertical bar of `--panel-2` over a
ground that had darkened to `--bg-2` by the bottom of the row: **ten light bars
across the header of every roster page**, measured at `rgb(241,236,250)` against
`rgb(233,229,243)`, and nineteen colour steps along a text-free row of the header
where there should be one.

The token's own comment says exactly what went wrong — *"two things need the same
colour and must not be able to disagree: the cell's own background, and the
hairline of it drawn just outside its left edge"* — so the fix is to set the name
rather than to paint behind it. A `background` shorthand takes an image, so the
token holds a gradient happily, and because the strip spans `top: 0; bottom: 0`
of the very cell it sits in, a **vertical** gradient lands on the same stops in
both. Measured after: **one** colour step along that row on the roster and the
game log and the league table, **two** on the research board — each of them a
pinned column's own edge shadow, which is meant to be there.

**The rule to take from it**: a theme may only ever set the *tokens* a component
names. Where one is declared, something is reading it, and painting past it is
how two halves of one surface come to disagree.

### Two things a theme is allowed to move that are not colours of the page

**The winner's colour** (`--win`). Four rules make one statement — the
scoreboard card's winning figure, the matchup Summary's, its diverging category
bar and the run of the whole-matchup meter the leader holds — and all four wrote
`--hit` out. They read a token now, so a theme can move the statement rather than
four rules, and Lavender moves it to the **accent**: on a palette whose whole
subject is violet, the app's green is the one loud thing on the page belonging to
no other mark on it, and it reads as an import from the other theme. It is still
unmistakably *the* mark — ΔE **15.8** from the `--muted` a losing figure takes,
half again the widest gap this palette has anywhere else, and the winner is
bolder besides. Midnight keeps its green, which is what the token is for.

**The plate behind a team logo** (`--logo-plate`). ESPN lets a manager upload
anything, so a logo is an arbitrary image on whatever surface it lands on — and
on a near-white card a **light or white** one has no boundary at all. Measured on
the live 12-team league, 6 of its 12 logos are transparent or pale enough that a
fifth to a half of their box sat within 6/255 of the card: the ESPN cap logos'
white panel, and any photo with a pale surround, simply ended where the card
began. So a logo gets a well to sit in rather than the page's own colour, at a
value measured against the thing it has to hold: white on it is **1.53:1** where
white on `--bg` is 1.00 and on `--border` 1.42, and it reads as a tile against
both grounds it can land on (1.53 on a card, 1.36 on the zebra). A step further
(#cfc6e4, 1.63) starts to read as a coloured chip behind every team.

`.lg-logo-none` — the fallback baseball for a team with no logo or a dead URL —
is excluded, because it is **our** mark rather than an uploaded one: it is drawn
in `--faint` on the page's own colour, which the plate would only push toward its
own ink (3.98:1 on `--bg` against 2.3 on the plate). It keeps the hairline that
already makes it read as a deliberate placeholder.

The dark theme has the mirror of the same problem — a *black* logo on a
near-black card — and is deliberately left alone: nobody has reported it, and
`--bg` there is doing the same job this token does here.

### The preference, and why it is the one thing in localStorage

`UserPrefs.theme` is a **string id** rather than a boolean — there can be a third
theme — saved by `PUT /api/prefs/theme`, where `null` means "back to the default"
and is stored as the absence of the entry, the convention every preference in
that record follows. Which ids exist is the **client's** vocabulary
(`client/src/theme.ts`); the route shape-checks the id and otherwise trusts it,
so a record written by a newer build opens an older tab on Midnight rather than
on nothing. See **Roster, watchlist, users and auth** for the record it rides on
and **Date handling and server routing** for the route.

**It is deliberately not in the URL**, which is the line `muteAudio` is on and
one step further from the data than `hideil=1`: a colour scheme is a fact about
this person and this room, not about the view a link describes.

**And it is the one preference this app mirrors into `localStorage`.** The rule
elsewhere is that there is none — the view lives in the query string — and the
reason to break it here is about the *first frame* rather than about
persistence. The record is still the source of truth, and that is what makes the
choice follow the reader to another device; but it arrives with `/api/prefs`, a
round trip after the page has painted, so without a local copy the app opens dark
and turns lavender in front of the reader on **every load**. That is worse than
any wait: it is the app appearing to change its mind.

So the mirror is a **paint-ahead cache and nothing else** — written when the
reader picks, read by an inline script in `index.html` before the stylesheet has
loaded and by `App` before its first render, and overruled without ceremony the
moment the server's answer lands (which also writes it back, so a theme picked on
one device reaches this one). A browser refusing storage gets the default and one
frame of the wrong theme on a reload, which is the whole cost of it being a
cache.

**Saving it is a write to the user's own item, so it goes through the queue.**
Everything this app saves about a person lands on one record, and the settings
menu is the one surface where several of them are pressed in sequence: the
scheme and the three toggles beside it. Driven back to back before the writes
were queued, a theme press and a mute-audio press **corrupted the dev record** —
not a lost update but a torn file, and both writes then 502'd, as did every one
after them. The client half is `App.tsx::queueUserWrite`, which the scheme and
all three toggles now use; the server half is `store.ts::fileWriteDb`, which
writes to a temp file and renames. Both are set out under **Roster, watchlist,
users and auth**.

**The boot script is the only place a palette colour is written outside the
stylesheet** — two `--bg` values and two `color-scheme` words — and it is inline,
blocking and tiny because it has to have finished before the first paint.

### The picker

A **row of swatches** in the settings menu, under the two toggles, rather than a
third toggle. A toggle holds two and there is no reason a third palette should
mean redrawing the control; and a colour scheme is the one preference in that
menu whose *answer* can be shown rather than described — each button is three
stops of the palette it selects (the page, an edge on it, the accent), which is a
truer statement of what it does than any name.

The middle stop is `--border` rather than `--panel`, and that is measured: a card
is a step off the page in both themes (`#0b1220` → `#16213a`, `#f3f1f8` →
`#ffffff`) and at 8px wide that step is invisible, so the swatch read as two
stops. The stops are **inline styles off `theme.ts`**, deliberately — they are
*another theme's* values, so they cannot be tokens, which would resolve to the
palette currently in force and draw every swatch the same. The hairline around
them is `--border`, which does follow the page.

It is a **radio group** (`menuitemradio`), this being one question with one
answer where three checkboxes would claim three independent switches, and the
menu **stays open** across a press — the rule `Refresh from ESPN` follows, and
for the same reason: the result is a change in the page behind it.

### Measured

**The dark theme is unchanged, and that is a pixel diff against a control rather
than a claim.** Three views (a simulated live roster, the research board, a
player page) rendered at 1400×950 on `main` and on this branch and compared pixel
by pixel — and, because two of the three draw **live data**, the same pair of
captures taken twice from `main` alone as the control. Counting pixels whose
worst channel differs by more than 8:

| view | main vs main | main vs branch |
| --- | --- | --- |
| roster | **0** | **116** |
| research | 224,314 | 224,489 |
| player | 3,708 | 3,708 |

The research board and the player page move by the same amount whether or not the
branch is involved: that is the opponent column, the roster percentages and the
day's own numbers changing between captures, and the player page's figure is
*identical* to the control. Two captures from the branch, minutes apart, differ
by **0** on all three, so the renderer is deterministic where the data is.

What is left is the roster's **116 pixels**, which are the `spot-out` pip's ink
changing from white to the near-black its five siblings already used — the one
deliberate change, argued above. Under the 8-channel threshold there is one more
thing: the pinned bar's accent glow is off by **1/255** in a channel, which is
the `rgba()`-to-`color-mix()` rounding, and is what takes the roster's raw count
from 116 to 5,316.

**Contrast was audited by walking every rendered text node** on four views —
compositing each element's real background stack and comparing — rather than by
reading the stylesheet. In Lavender everything that fails the 4.5 bar is either
`--faint` at **3.98** (the deliberately-quiet percentile badge, where the dark
theme's own reads **3.72**) or small bold text on a live-role row at
**3.93–4.45**, where the dark theme's comparable is **4.35**. Two faults the
audit found were real and are fixed: the status chip on a headshot, which was a
near-black chip under this theme's darker semantic inks at **3.08:1** and is a
white one at **7.5:1**; and the tinted-row problem the palette section above is
mostly about.

**Bundle: 527.38 → 529.61 KB of JS** (155.93 → 156.65 gzipped) and **127.49 →
134.27 KB of CSS** (22.64 → 23.58) — 2.2KB and 6.8KB raw, 0.7KB and 0.9KB over
the wire. The CSS growth is almost entirely the `color-mix()` expansion, which is
the thing that makes a second theme reach the tints at all; gzip finds the
repetition and charges under a kilobyte for it.
