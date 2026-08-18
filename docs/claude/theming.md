### Themes: the palette, and the switch that changes it

The app has **six color schemes** — the plain **Dark** and **Light** pair off VS
Code's own defaults, of which **Dark is the app's default**; **Midnight**, the
navy original; **Lavender**, dark gray and violet; and **Maroon** and **Powder
Blue**, the dark and light halves of one 1980 Phillies road uniform — and a
picker in the settings menu, which lists them in that order. This file is the whole of it: how a theme is expressed, what had
to change before a second one was possible, how the choice is stored and how it
reaches the first painted frame.

**A theme is a palette, not a stylesheet.** `client/src/styles.css` opens with a
`:root` block of color tokens and closes with five blocks that redeclare the same
names against **`html[data-theme='…']`**. Nothing else in 14,000 lines of
stylesheet knows there is more than one, and no component reads a theme at all.
The only rules a theme adds of its own are a short run of gradients Midnight does
not want (below), and those are *shared* wherever the polarity allows it.

**What a theme costs, end to end**, is the measurement that says whether the
first two were built right, and it has now been paid four times. **Maroon**: one
`ThemeId` union member, one `THEMES` entry, two map keys in the boot script, one
token block, three selector lines, and **not one component, rule or class name**.
**Powder Blue** is the same plus **three rules of its own** — the two ombré
gradients whose token order flips with the polarity, and the logo plate only a
light theme needs — and one line in the picker's stylesheet, which is the only
*layout* any of the six has cost.

**And the pair added last cost less again, which is the point of having paid it
twice.** **Dark** is a token block and **five selector-list entries** — the page
ombré, the card ombré and the wide tables' header row — and **no rule of its
own** at all. **Light** is a token block and five more entries on the three lists
Powder Blue already carries (its flat page, its card ombré, its logo plate) plus
the shared header. Neither touched a component, a class name or the picker's
stylesheet; the picker's own markup is a `map` over `THEMES` and grew by two rows
without being edited. Measured, that is **149.08 → 151.55 KB of CSS** (26.59 →
27.09 gzipped) and **558.81 → 559.06 KB of JS** (165.93 → 166.03) — 2.5KB and
0.25KB raw, half a kilobyte and a tenth over the wire, for two whole palettes;
and better than half the CSS is the two comment blocks arguing them.

### What had to change first: 88 literals and a dozen hexes

**A token is only a token if the rules use it, and they didn't.** The palette
had names for its colors and then spelled the colors out again wherever a
*tint* of one was wanted: `rgba(56, 189, 248, 0.12)` for a 12% accent wash, the
same four numbers in forty places — 88 of them across ten palette entries. A
theme moving `--accent` would have moved the accent and left every wash it backs
sitting on the old hue, which is the failure mode that looks like the theme half
worked.

They are `color-mix(in srgb, var(--accent) 12%, transparent)` now. That is the
**identical color by construction** — the mix is against `transparent`, so the
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

### The Lavender palette

The measured figures live in the stylesheet beside the block that declares them,
which is where they can be checked against what is actually shipping. What is
worth having here is the shape of the thing.

**It was a light theme and is not any more.** The first Lavender was a near-white
page (`--bg: #f3f1f8`, `--panel: #ffffff`) with every semantic hue *deepened* so
it could do three jobs at one lightness: printed as text **on the pale page**,
filled **under white ink**, and — the one that is easy to miss and was missed on
its first pass — printed as text **on a live-role row**, whose ground is that
same palette washed over the page. On a dark theme the third is nearly free: a
color sitting 9–11:1 from the page barely notices a 20% wash. On a light one the
wash eats most of a 4.5, and the first pass put the live inning's green on a
tinted row at **2.90:1**.

All of that arithmetic was right and it answered the wrong question. This app is
read for an evening of baseball, mostly in the dark, and a page of white is the
one thing a second theme should not be — which is what the reader said. So the
surfaces are **graphite** and the hues go back to being light on dark, which is
the polarity `:root` is written in. Most of the old block goes with the page:
`--on-accent` is `:root`'s `var(--bg)` again, `--pitch-ink` and `--chip-solid`
are near-blacks again, the violet-cast shadow set and the pin edges are
`:root`'s, and `--logo-plate` and the rule behind it are gone. Each existed to
undo something a pale page did.

What survives is the **method**: every number is measured against Midnight's own
figures rather than picked. As it renders —

- **on `--bg`** — text **14.3:1** (Midnight 16.1), muted 6.9 (7.1), faint 4.0
  (3.7), accent **7.4** (8.7), hit 9.8, hr 10.2, walk 7.8, strikeout 7.4,
  on-base 6.8, mound 10.3, out 4.8 (3.9).
- **on the worst live-role ground** (on deck) — text 9.0, mound 6.5, hit 6.2,
  walk 4.9, strikeout 4.7, accent **4.66**, muted 4.37, on-base **4.28**, out
  3.00, faint 2.49, against Midnight's own worst row (on mound) at accent 5.65,
  strikeout 4.38, muted 4.60, out 2.54, faint 2.41.
- **`--on-accent` on each fill** — the page's own graphite reads accent 7.4, hit
  9.8, hr 10.2, walk 7.8, strikeout 7.4, on-base 6.8, mound 10.3, out 4.8.

**The role grounds are `:root`'s own 22/20 mixes and this theme does not
redeclare them at all** — which is not an omission but a property of custom
properties: they are substituted after the cascade, on the element they are used
from, and `html[data-theme='lavender']` *is* `:root`, so the four `color-mix()`es
declared up there resolve against the palette declared here. (The light theme
raised them to 24/22, a 20% wash of a deep color over a near-white page being a
tint you have to look for; over graphite the same mix lands at ΔE 15.1–19.0 from
the page against Midnight's own 13.5–22.7, so there is nothing to correct.) Their
six pairwise ΔE2000 distances come to at bat/on deck **14.4**, at bat/on base
**12.9**, at bat/on mound 31.7, on deck/on base 25.7, on deck/on mound 20.2, on
base/on mound 26.8 — a tightest pair of 12.9 against Midnight's 12.1, which is
what the legend under the summary table needs, drawing all four side by side.

**Two violets is the one thing this theme buys and pays for.** The accent is the
hero lavender and the on-base role is a purple of long standing, so the two share
a family: `--accent` #b49cfb against `--live-purple` #dd7bff is ΔE **11.7**, the
tightest pair in either palette (Midnight's own is `--accent`/`--accent-2` at
11.6). It is the peak of a measured trade rather than a guess — a pinker on-base
takes the *at bat*/on base grounds to 7.8 and a bluer one takes accent/on-base to
9.0 — and it is taken deliberately: the two never appear in one key (the legend
draws the roles and the accent is not among them), and they are different objects,
chrome against a live mark.

### The Maroon palette, and the photograph it came off

**The third and fourth themes are one photograph** — the 1980 Phillies road
uniform: powder-blue body, maroon `P` and maroon sleeve stripes, white piping
between them. They are the first palettes here taken off an image rather than
reasoned out, and the sampling is written down because the alternative is
remembering a color. **Maroon** is the dark one, below; **Powder Blue** is the
same jersey the other way up and has its own section after it. Neither is called
after the uniform, because either alone would be a poor description of it.

**The image was decoded and its pixels binned.** The jersey body reads **#527dae
at the 10th percentile, #6d98ce at the median and #86aede at the 90th**; the
lettering and the stripes cluster hard on **#66283b** (family #5a2737 to
#773548). Those two are the palette — the powder lifted until it carries text on
a dark page (`--accent: #8fc0ea`, 9.4:1), the maroon taken down until it *is*
one (`--bg: #1d1319`), and the white piping as `--text`, warmed a couple of
points off neutral.

**Which way up was the question, and it now has both answers.** The obvious
reading of a powder-blue uniform is a powder-blue *page*, and this app had a
light theme until the reader asked for it to stop being one — so this one puts
the maroon on the page and the powder on top of it, which is the division the
jersey itself makes with its lettering, and which keeps it clear of Midnight: a
maroon page with a pale blue on it cannot be mistaken for a navy page with a cyan
on it. The other answer was asked for once this one existed to be looked at, and
is the section below.

**The maroon is stated once more, as a hairline.** `--border: #56303f` is the
piping, and a hairline is the one place a *saturated* burgundy fits without
competing with the accent — ΔE 11.8 from the card it edges and 15.8 from the
page. `--brand-2` is the other place it shows: the app mark's gradient runs
`--accent` → a cranberry, which is the jersey read across.

**Two blues is what this theme pays for**, exactly as two violets is what
Lavender pays for. `--accent` is a blue and so is `--walk`, and on a maroon page
they are the pair that wants watching: the powder is left where the jersey has it
and the walk is pushed to a **periwinkle** (#989cf6), which holds them ΔE **12.8**
apart — wider than Midnight's own `--accent`/`--walk` at 11.7. The tightest pair
here is `--accent` against `--accent-2` at **10.9**, which is a hover pair and is
meant to be adjacent (Midnight's is 11.6).

**Measured against Midnight, as Lavender is:**

- **on `--bg`** — text **15.9:1** (Midnight 16.1), muted 7.8 (7.1), faint 4.4
  (3.7), accent **9.4** (8.7), hit 10.1, hr 10.7, walk 7.3, strikeout 8.1,
  on-base 7.2, mound 10.9, out 5.6 (3.9).
- **on the worst live-role ground** (on deck) — text 10.1, mound 6.9, hit 6.4,
  accent 6.0, strikeout 5.2, muted 4.94, walk **4.62**, on-base 4.58, out 3.55,
  faint 2.79, against Midnight's own worst row at strikeout 4.38, muted 4.60, out
  2.54, faint 2.41.
- **the four role grounds** are `:root`'s own 22/20 mixes — this block, like
  Lavender's, does not redeclare them, for the reason given above — and their six
  pairwise ΔE2000 distances bottom out at **12.3** (at bat against on base)
  against Midnight's 12.1.

**`--win` is `--hit` here too**, and `--logo-plate` does not exist: both are the
light theme's problems, and the three themes shipped at the time were all
dark. (`Dark`, added later, is in the same case; `Light` declares both.)

### The Powder Blue palette, and the page that gave up its color

**The same jersey the other way up**: the piping's white on the page, the maroon
written on it, and the powder carried by everything drawn on it — the zebra
stripe, the table headers, every card's own foot, the borders and the logo
plate. It is the app's **only light theme**, and Lavender's own light
incarnation — described three sections up — is the record of what that costs in
general.

**The page was the powder itself for a spell, and what retired it is a table.**
A wide table's header runs `--panel-2` → `--bg-2` (#eef5fc → #c7dcf1) and its
first row was `--bg` (#dceaf7): **ΔE2000 4.6** between the header's own foot and
the row directly under it, so a reader could not see where the header stopped.
Starting the zebra on **white** puts **ΔE 13.0** at that boundary and costs the
stripe nothing — the two row colors are the same two the other way round.

**And every measured figure in this section improved with it**, which is the
page's color being handed back. What the colored page cost was measured when
it was chosen: holding the four role colors fixed and walking the page from
neutral (`#f3f1f8`, the old light Lavender's) to the jersey's own body
(`#b9d3ec`), the tightest pair of the four live-role grounds falls **12.6 →
9.2** — a page with chroma in it has less room left for four washes to differ
in, and the summary table's legend draws all four side by side. `#dceaf7` was
where that curve was cut, at **12.1**, Midnight's own figure to the decimal; and
the section recorded the bill for it in as many words, the worst live-role row
sitting **~0.2 under** both Midnight's and the light Lavender's. A white page
pays neither.

**Two things that came out of that compromise are kept**, both being right on
their own account: the binding pair is *at bat against on base* (which is
Midnight's own tightest pair too), and `--hr` stays the amber (#7c4400) it was
pushed to from a gold.

**As it renders, with the figures the powder page gave in brackets:**

- **on `--bg`** — text **17.8:1** (14.5), muted 9.5 (7.7), faint 5.2 (4.2),
  accent **8.5** (7.0), hit 9.1, hr 7.8, walk 8.4, strikeout 7.8, on-base 8.5,
  mound 8.1, out 7.1.
- **on the worst live-role ground** (at bat, #e9c7c9) — text 11.39, muted 6.08,
  hit 5.83, accent 5.47, on-base 5.45, walk 5.37, mound 5.19, hr and strikeout
  **5.02**, out 4.55, faint 3.32. That worst figure was **4.17** over the powder
  page, against Midnight's own worst row at 4.38 and the light Lavender's at
  4.40 — so this theme went from a fifth of a point under both to two thirds of
  a point over them.
- **the four role grounds** are ΔE2000 **12.8** apart at the tightest (12.1
  before; Midnight's own is 12.1), the other five pairs 13.5, 13.9, 22.7, 22.8
  and 24.5. They are still **redeclared at 24/22** rather than `:root`'s 22/20,
  which is the light Lavender's own correction and for its reason: a 20% wash of
  a deep color over a light page is a tint you have to look for.
- **white on each fill** — accent 8.5, hit 9.1, hr 7.8, walk 8.4, strikeout 7.8,
  on-base 8.5, mound 8.1, out 6.4. Unchanged, the fills not having moved — and
  now the same figures as the first line, since with a white page "printed on
  the page" and "white on the fill" are one measurement.

**The zebra is what a white page threatens, and it is why `--row-alt` exists.**
The stripe was `--panel`, which is right on a colored page — the card color
and the stripe are both the white it is read against — and impossible once the
page is white too. It carries the jersey's own #dceaf7 instead: **1.22:1**
against the white beside it (light Lavender 1.15, Midnight 1.11), which is the
same step the table always had. See *Three things a theme is allowed to move*
below.

**A white page and a white card is not a lost distinction**, which was the thing
to check rather than assume: a card carries a border, `--shadow`, and its own
wash down to `--panel-2`, which is how every light UI separates the two. What
does go is the recess an inset used to have — a `--bg` fill on a `--panel` card
was a powder well and is now white on white — and every one of the dozen rules
that draws one (`.split-switch`, `.roll-windows`, `.research-col-chip`,
`.app-dialog-close`, `.roll-tip`, the three table panes, …) was checked to carry
a `1px solid var(--border)` of its own. `.tut-nav-wrap` carries an inset shadow
instead, which does the same job.

**Three rules are its own, and one of them shrank.** The two card ombré
gradients flip token order (*lighter at the top* means `--panel` here where it
means `--panel-2` on a dark theme), and **`--logo-plate` is back** — the well
behind an uploaded team badge, which only a white card needs, at the value the
light Lavender measured and with the same `.lg-logo-none` exclusion. The third
is **`body`, which is now one declaration**: the page's three-layer ombré (a
white lift at the top right, a 9% accent wash in the bottom-left corner, and a
linear down to `--bg-2`) went with the color it was made of — the first layer
is white on white and the third would take the foot of every page to #c7dcf1,
which is not a white page by any reading. It stays a rule of this theme's own
rather than a deletion, because the base `body` rule would otherwise put
`:root`'s own blue lift over the white. `--page-glow` is dropped from the
palette with it, nothing in this theme reading it any more.

**The wide tables' header rule still needs no version**, `--panel-2` being
lighter than `--bg-2` in all four palettes — and on this one that header is what
the white first row is read against.

### The Dark and Light pair, off VS Code's own defaults

**They were asked for as "default light and default dark", inspired by VS Code's
`Dark 2026` and `Light 2026`** — which are that editor's shipped defaults, and
which are the first source here that is *another product's tokens* rather than a
photograph or a hue sweep. Both were read out of the installed app
(`/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/
theme-defaults/themes/2026-dark.json` and `2026-light.json`, 293 and 299 colors
apiece) rather than remembered, which is the same rule the Maroon block follows
for its jersey.

**They are named `Dark` and `Light`, and that is a decision rather than a
shrug.** Midnight, Lavender, Maroon and Powder Blue each have a character to
name; these are deliberately plain — one near-neutral surface ramp, one accent,
no cast — and there is no noun for that but the polarity itself. A reader who
wants exactly that is looking for exactly those two words.

**That sentence used to close on "they are *not* `DEFAULT_THEME`, which is still
Midnight", and both halves of it have been overturned** — `Dark` is the default
now, and the pair leads the picker rather than trailing it. See *The default is
Dark, and the plain pair leads the list* below, which is where the two are
argued and what they cost is measured.

#### What was copied and what was not

**The surfaces are VS Code's, unaltered.** Dark takes `editor.background`
#121314, `sideBar.background` #191A1B, `editorWidget.background` #202122 and
`widget.border` #2A2B2C straight onto the ramp `:root` runs; Light takes
#FFFFFF, `sideBar.background` #FAFAFD and `dropdown.border` #D8D8D8. Dark's
steps come out at ΔE2000 **2.07 / 2.20 / 3.16** against Midnight's 3.98 / 2.89 /
3.42, with the border **8.9** off the card it edges (Midnight 7.74, Lavender
10.61). One surface is lifted: Dark's `--border` goes #333536 → #3a3d3f, because
in VS Code that value edges an *input* and here it edges every card in the app.

**The hues of the marks are VS Code's and the lightnesses are not**, which is
the trade the Maroon block already makes with its jersey — *"the powder lifted
until it carries text on a dark page, the maroon taken down until it is one"* —
applied to a set of tokens instead. The reason is measured rather than asserted:
VS Code tunes for syntax on a large surface and reads a good deal softer than
anything this app draws.

| | VS Code's own value | on its own page | this app's band |
| --- | --- | --- | --- |
| Dark `foreground` | #bfbfbf | **10.1:1** | 14.3–17.8 |
| Dark `descriptionForeground` | #8C8C8C | 5.5 | 6.9–9.5 |
| Dark `disabledForeground` | #555555 | **2.5** | 3.7–5.3 |
| Dark `textLink.foreground` | #48A0C7 | 6.3 | 7.4–9.4 (accent) |
| Light `charts.green` | #388A34 | **4.3** | 7.6–9.1 (hit) |
| Light `charts.orange` | #d18616 | **2.6** | 7.5–7.8 (hr) |
| Light `disabledForeground` | #BBBBBB | **1.9** | 5.2 (Powder's faint) |
| Light `button.background` | #0069CC | 5.4 | 8.5 (Powder's accent) |

That `2.5` is the one that decides it: this app already documents **3.18** as the
quietest thing it draws (`--faint` on a live-role row), so VS Code's disabled
gray would be a new floor rather than a palette. The same is true of the *chart*
colors on the dark side — #EF8773 and #E0B97F are a salmon and a tan at 61–79%
saturation, and washed into the at-bat and on-deck row grounds at `:root`'s own
22/20 they land **ΔE 10.48** apart, under the **11.98** floor the three shipped
themes hold. So each mark keeps its hue and takes this app's saturation and
lightness.

#### Three hues moved, and each was forced by a pair

**The walk, on both.** This app carries *two* blues where a code editor carries
one, which is the problem the Maroon block records for its own periwinkle. On
Dark, `charts.blue` #57A3F8 (hue 212) against an accent at hue 198 is ΔE
**11.07**, under Midnight's own accent/walk pair at 11.67; four degrees to hue
216 makes it **11.81**. On Light it is far sharper — a light page has no
lightness left to separate them with — so `charts.blue` #1A5CFF (hue 223)
against a deepened #0069CC is **8.01**, and it goes to hue 238, where it is
**13.54**.

**The purple, on Light**, because an indigo walk then crowds it: `charts.purple`
#652D90 (hue 274) goes to hue 280, taking walk-against-purple from 12.87 to
**13.63**.

**And `--mound-teal` is in neither source at all.** 2026 Dark's whole accent
family is one steel blue — #297AA0 the button, #3994BC the badge, #48A0C7 the
link, hue 198–200 across 293 colors — and there is no teal in it. It is picked on
the sweep Midnight's own note describes, and against a *desaturated* accent it is
the tighter problem: Dark's #5ad6cb lands **19.4** from the accent, **12.9** from
`--accent-2` (Midnight 12.29) and **18.9** from `--hit` (Midnight 14.63).

#### Two numbers each block had to find rather than take

**Light's `--bg-2`, which is the foot of the wide tables' header row.** Powder
Blue's own note is the record of what happens when that is wrong: the boundary
that matters is the header's bottom edge against row one, which is `--bg`, and at
ΔE **4.6** a reader could not see where the header stopped. Powder's fix lands at
12.96 — and a *neutral* cannot reach that without going visibly dark, because ΔE
counts chroma as well as lightness and a gray has none to spend. At Powder's own
1.36:1 a neutral is only **7.77** apart. **#d7d7dc is 8.86 and 1.43:1**, which is
nearly twice the measured failure and as far as a white theme's header can go
before it reads as a band rather than a heading.

**Light's accent, which is set by the app's tightest instance of one rather than
by the page**, and which is two whole steps below VS Code's #0069CC because of
it. `.feed-more-count` — the count badge on the Load-more button — is the accent
printed on its *own* 18% wash over `--bg-2`, which on a white theme is the
darkest surface there is. It was the one element the six-view audit flagged:
**4.03:1 at 12px/800**. At **#004a8b** it is **4.72**, against Powder Blue's 4.54
and Lavender's 4.84 for the same badge — and every other figure on the palette
improved with it (accent on the page 7.50 → **8.93**, on the worst role ground
4.54 → **5.40**). Worth recording as a general fact about this app: *an accent's
floor is not its contrast with the page, it is its contrast with its own 18%
wash on the deepest surface a theme has.*

#### The role grounds, and Light's 26

Dark takes `:root`'s own **22/20** mixes, which resolve against its palette for
the reason the Lavender block gives, and comes out at **13.32** apart at the
tightest — the widest floor of the six.

Light redeclares them at **26/22/22/22**, where Powder Blue uses 24/22 and
`:root` 22/20 — the red taking four extra points rather than Powder's two, which
is the correction `:root`'s own comment already makes (*"the red needs the extra
two to read as the same weight"*) sized for a page with no color in it to help.
At 24 the at-bat and on-base grounds sit **11.94** apart, a hair under Maroon's
11.98 floor; at 26 they are **12.55**.

#### As they render

Every figure below was read off the running app rather than computed — the four
role grounds were compared against the predicted hexes and match to the byte
(Dark `#432b27 / #3e3624 / #332c3e / #203a39`, Light `#eabfbf / #e1d8c7 /
#e0cfe9 / #c7dcdb`), and their pairwise ΔE reproduce the predicted set exactly.

| | Midnight | Lavender | Maroon | **Dark** | Powder | **Light** |
| --- | --- | --- | --- | --- | --- | --- |
| text on `--bg` | 16.1 | 14.3 | 14.9 | **14.2** | 17.8 | **16.3** |
| muted | 7.1 | 6.9 | 8.3 | **7.2** | 9.5 | **7.3** |
| faint | 3.7 | 4.0 | 5.3 | **3.9** | 5.2 | **5.5** |
| accent | 8.7 | 7.4 | 9.4 | **8.0** | 8.5 | **8.9** |
| role grounds, tightest ΔE | 12.13 | 12.90 | 11.98 | **13.32** | 12.77 | **12.55** |
| accent/walk ΔE | 11.67 | 15.98 | 12.77 | **11.81** | 34.82 | **13.54** |
| worst-ground floor | 2.41 | 2.49 | 3.36 | **2.49** | 3.32 | **3.35** |
| `--win` against `--muted` ΔE | 17.9 | 16.4 | 28.2 | **18.0** | 16.5 | **19.6** |

Dark's text is deliberately the softest of the six — that is 2026 Dark's own
character, kept as far as the app's floor allows. On its **worst live-role
ground** (on deck, #3e3624) it reads faint 2.49, out 2.95, muted 4.59, strikeout
4.59, on-base 4.64, walk 4.95, accent 5.15, hit 6.42, mound 6.78, hr 7.03, text
9.10 — against Midnight's own worst row at 2.41 / 2.54 / 4.60 / 4.38 / 4.58 /
4.76 / 5.65. Light's (at bat, #eabfbf, which is Powder's worst row too) reads
faint 3.35, out 4.37, muted 4.40, mound 4.43, walk 4.51, strikeout 4.52, hr 4.55,
hit 4.60, on-base 5.26, accent 5.40, text 9.86: **every non-`--faint` mark clears
4.3**, which is the floor the six hold.

#### Measured — the audit, and what the two pay in geometry

**The same text-node audit the three themes before them took**, over five views
(roster, feed, research board, League, how-to) at 1400×950 against the running
app, compositing each element's real background stack:

| view | Dark, under 4.5 | worst real | Light, under 4.5 | worst real |
| --- | --- | --- | --- | --- |
| roster | 18 | **3.37** `--faint` | 1 | *(none)* |
| feed | 0 | — | 1 | *(none)* |
| research | 1,311 | **3.37** `--faint` | 1 | *(none)* |
| League | 1 | **3.37** `--faint` | 1 | *(none)* |
| how-to | 23 | **3.37** `--faint` | 2 | *(none)* |

**Every element under the bar in Dark is `--faint`** — the percentile badge under
a value, an opponent cell's second line, the handedness token on a name — which
is the tone this app spends deliberately and which is 3.18 in Midnight, 3.35 in
Lavender and 3.90 in Maroon. **Light has none at all**: its only entries are
`.brand-sicko`, which is `color: transparent` with a gradient clipped to the
text, so the audit reads 1.00 for it in every theme including the three shipped
ones. It is the cleanest of the six by that measure.

**The four existing themes were re-run through the same audit and are
byte-identical** to their recorded worst figures — Midnight 3.18, Lavender 3.35,
Maroon 3.90, Powder Blue 4.23 — which is what had to be true of a change that
edited three shared selector lists.

**And a theme costs no geometry, which was checked rather than assumed.** At 320
/ 390 / 1400 / 1920 on the research board, both new themes: rows **58.00px**, the
header row **51.00**, the headshot column pinned at **0** with the pane scrolled
to its far right, the table at **1750.14 / 1822.70 / 2294.36 / 2294.36**, and
**page-body overflow 0** at every width — identical figures in both, and to the
other four.

#### Measured — the picker, the boot script and the three shared rules

**The picker draws six rows and needed nothing.** Measured at 1200×900, 390×844
and 390×620: **six** `menuitemradio` rows at 30px each, the popover **403px**
tall (it was 329 with four — 74px for two rows) with its foot at **461**, chips
at one x (223.2 at 1200, 46 at 390), **0 labels clipped**, no internal scroll,
and page overflow 0. It still fits a 620px-tall window. Its width is unchanged at
**193.3px at 1200 and 251.2 at 390**, `Powder Blue` still being the widest label.

**Each press applies live**, driven rather than reasoned about: `Dark` sets
`data-theme="dark"`, `colorScheme: dark`, the localStorage mirror and `--bg:
#121314 / --accent: #63b4d8`; `Light` sets `light`, `colorScheme: light` (which
is what hands the browser's own form controls, scrollbars and address bar the
right polarity), and `#ffffff / #004a8b`; `Midnight` **removes** the attribute.
`aria-checked` follows, and the menu stays open across the press.

**The boot script paints the right base color**, checked with `/api/prefs`
blocked so localStorage is the only input — the server is the source of truth and
would otherwise overrule the mirror:

| stored | attribute | `color-scheme` | injected style | after boot |
| --- | --- | --- | --- | --- |
| `dark` | `dark` | dark | `html{background:#121314}` | `--bg: #121314` |
| `light` | `light` | **light** | `html{background:#ffffff}` | `--bg: #fff`, body white |
| `powder` | `powder` | light | `#ffffff` | unchanged |
| `midnight` | *(none)* | dark | `#0b1220` | `#0b1220` |
| **nonsense** | *(none)* | dark | `#0b1220` | `#0b1220` |

That last row is the `BG[saved]` guard in the boot script and `toThemeId` in the
app both holding. `html` computes `rgba(0, 0, 0, 0)` in every case afterwards,
which is `html { background: none }` clearing the paint-ahead — the rule that
stops the page's gradient being clipped to the height of its content.

**The three shared rules resolve per palette**, which is what makes a theme
three selector lines rather than thirty rules. Read off the running app:

| | page | card ombré | wide-table header |
| --- | --- | --- | --- |
| **Dark** | the shared radial, its own `--page-glow` `rgb(36,40,43)` | `#2a2b2c → #202122` | `#2a2b2c → #191a1b` |
| **Light** | **`none`** — flat white, on Powder Blue's rule | `#ffffff → #f7f7fa` | `#f7f7fa → #d7d7dc` |

The card ombré's token order flips with the polarity exactly as Powder Blue's
note describes (*lighter at the top* is `--panel-2` on a dark theme and `--panel`
on a light one), and the header keeps its single form in all six, `--panel-2`
being the lighter of that pair in every palette. **The logo plate** — the well
behind an uploaded team logo, which only a light theme needs — draws
`rgb(214, 214, 221)` on Light and the page color on the dark themes, and is
excluded from `.lg-logo-none` as it is on Powder Blue.

### Ombré

Midnight gradients the things that are *lit* — the page, the pinned bar, a card
header — and leaves the rest flat, because on a near-black ground a second flat
step is all a gradient can be. The other two sit a step up from that, which is
enough room for a card to have a top and a bottom without spending a border on
it, so the wash runs on every large surface instead: a three-layer page (lit at
the top right, a wash of the theme's own accent in the bottom-left corner), a
`--panel-2` → `--panel` wash on the cards and popovers, and a header row on the
four wide tables that reads as a header.

**The rules are shared and their declarations name only tokens**, so each palette
supplies its own colors to one written shape. That is what made Maroon three
selector lines rather than a second copy of the section — and it is the same rule
the stylesheet applies to `.settings-toggle` on `.sim-toggle`'s list: two things
that are the same object must not be able to become two.

**Powder Blue shares one of the three, writes one and has none of the third.**
It shares the wide tables' header, which runs `--panel-2` → `--bg-2` in every
palette because `--panel-2` is the lighter of that pair in every one of them —
and on this theme that header is what the white first row is read against. It
writes the card gradient, which runs *lighter at the top* and so flips token
order with the polarity: `--panel-2` → `--panel` on a dark theme and `--panel` →
`--panel-2` here. And it has **no page ombré at all** — the page is flat white
(see its own section above), so the three layers went with the color they were
made of and the theme's `body` rule is one declaration whose only job is to keep
`:root`'s blue lift off the white.

**Every one of them runs lighter at the top**, which is the light theme's own
rule read the other way up: there `--panel` is white and `--panel-2` a step down,
so the wash runs `panel → panel-2`; on a dark theme `--panel-2` is the *lighter*
surface, so it leads, and the page's own linear runs `--bg-2` → `--bg` rather
than the reverse.

**The three wide tables keep a flat body on purpose.** A gradient down a
scrolling table would slide against its own rows, and the zebra stripe is already
doing the work a wash would do.

**The header gradient has to be set through `--cell-bg`, and setting
`background` instead was a shipped bug.** The summary table — and the research
board, whose table carries `.summary-table` too — draws a **6px strip of
`var(--cell-bg)` straddling every cell's left edge**, the cover for the sub-pixel
seam between two cell grounds (see **Client — the Roster view**, where that
mechanism is argued at length). Assigning `background` directly left the strip on
the *solid* color the token still held while the cell had become a gradient, so
every column boundary in the header wore a vertical bar of `--panel-2` over a
ground that had darkened to `--bg-2` by the bottom of the row: **ten light bars
across the header of every roster page**, measured at `rgb(241,236,250)` against
`rgb(233,229,243)`, and nineteen color steps along a text-free row of the header
where there should be one.

The token's own comment says exactly what went wrong — *"two things need the same
color and must not be able to disagree: the cell's own background, and the
hairline of it drawn just outside its left edge"* — so the fix is to set the name
rather than to paint behind it. A `background` shorthand takes an image, so the
token holds a gradient happily, and because the strip spans `top: 0; bottom: 0`
of the very cell it sits in, a **vertical** gradient lands on the same stops in
both. Measured after: **one** color step along that row on the roster and the
game log and the league table, **two** on the research board — each of them a
pinned column's own edge shadow, which is meant to be there.

**The rule to take from it**: a theme may only ever set the *tokens* a component
names. Where one is declared, something is reading it, and painting past it is
how two halves of one surface come to disagree.

### Three things a theme is allowed to move, and one of them does now

**The winner's color** (`--win`). Four rules make one statement — the
scoreboard card's winning figure, the matchup Summary's, its diverging category
bar and the run of the whole-matchup meter the leader holds — and all four wrote
`--hit` out. They read a token now, so a theme can move the statement rather than
four rules. Lavender moved it to the **accent** while it was a light theme, on
the grounds that the app's green was the one loud thing on a page of violet and
read as an import from the other palette; it took that back when the page became
graphite, where the green reads exactly as it does in Midnight. So all the
shipped themes were on `--hit` — Powder Blue included, where a deep green on a
powder page is as plain a winner as it is anywhere — and the token is kept for
what it is: the one place a fifth reader of that statement would otherwise have
to be found.

**The plate behind a team logo** (`--logo-plate`). ESPN lets a manager upload
anything, so a logo is an arbitrary image on whatever surface it lands on — and
on a near-white card a **light or white** one had no boundary at all. Measured on
the live 12-team league at the time, 6 of its 12 logos were transparent or pale
enough that a fifth to a half of their box sat within 6/255 of the card. The
answer was a well for the logo to sit in, at a value measured against what it had
to hold (white on it 1.53:1, against 1.00 on `--bg` and 1.42 on `--border`), with
`.lg-logo-none` — our own fallback baseball rather than an uploaded image —
excluded from it.

Both the token and its one rule went when the light theme did, because the
problem is the pale page's — and **both are back with Powder Blue**, at the same
measured value and with the same `.lg-logo-none` exclusion, which is why the
paragraphs above were kept rather than deleted. `Light` declares it too, at its
own value. The four dark themes have the mirror of it instead — a *black* logo on
a dark card — and all four leave that
alone for the reason Midnight always did: nobody has reported it, and `--bg` is
doing the same job the plate was.

**The zebra stripe's other row** (`--row-alt`), which is the one of the three
that a shipped theme actually moves. Four wide tables draw a zebra — the summary
table, the research board (which carries `.summary-table` too), the game log's
family and the League table — and all four wrote `--panel`, which is right for a
dark theme and says two things at once: *a card is a step up from the page* and
*so is the stripe*. Those are one answer only while the page has a color. On
Powder Blue the page is white, so a card wants to be white as well and a stripe
cannot be — and the token is what lets the palette say so in one line rather
than the stylesheet say it in three overrides. `:root` declares it
`var(--panel)`, so the four dark themes resolve exactly what they always drew
(checked in a browser: `--row-alt` reads `#16213a` / `#2a2833` / `#2b1d26` /
`#202122` and the rows are byte-identical), and the two light ones declare their
own — the jersey's #dceaf7 and a neutral #ebebef.

### The third thing a light theme took back: a cap needs a ground

**A light theme does not only change what the app draws, it changes what the app
can *assume*** — and `lib.ts::teamLogoUrl` had an assumption in its own comment.
It asks MLB for the **`on-dark`** cut of each club's cap mark, on the reasoning
that "this app has one palette and it is dark": the on-light cut is drawn in the
club's own navy for half the league, which is a smudge at the 15px a table row
gives it. So the page was the mark's ground, and the mark needed nothing.

**Thirteen of the thirty are drawn in white alone**, read out of the SVGs — CIN,
DET, KC, LAD, WSH, ATH, PHI, ATL, CWS and NYY among them — so on Powder Blue's
page they disappeared. The Yankees' white `NY` on white is the one that gets
reported.

**So the mark carries its own ground, in the club's color** (`lib.ts::teamColor`,
a 3px-radius tile the same proportion `.lg-logo`'s 5px is at its own size). It is
set **inline**, for the reason the theme picker's swatches are: it is one of
thirty values keyed by club rather than one value the page has, so it cannot be a
token. That also means it is **not a theme's to move** — a cap is the club's
colors in every palette, which is the same argument `lib.ts::pitchStyle` already
makes for the pitch dots.

**Why it is a table and how it was checked** are in `lib.ts` beside it, and the
short version is this file's own method: no MLB endpoint publishes a team color
(probed — `teams/{id}` carries no color field and `hydrate=team(colors)` changes
nothing), deriving one from the `on-light` cut gets 24 of 30 and fails silently on
the other six, so the table is curated and the **check** is mechanical — every
color in every mark measured against its ground, requiring the mark's best ink to
clear 4.5:1. All thirty pass, the tightest being PHI at **4.57** (a white P on
Phillies red, which is their cap exactly). Two clubs are not on their primary
because the mark *contains* it: NYM sits a shade under their blue (4.13 → 4.93)
and STL on the navy of its own cap rather than on Cardinal red (5.84 → 15.79).

**It costs the tables nothing and it is not conditional on the theme.** The tile
is the 15px box the mark already occupied, so rows stay **58.00px** and the
identity block **31.08** — measured in every theme, along with the table's own
width and 0 page overflow. And it is drawn in all of them rather than only the
light ones: on a dark page a navy tile behind a white mark is invisible and harmless,
which is what the page was doing before, and one behavior beats a rule that
changes with the palette.

**`--logo-plate` is the other half of this and is deliberately still separate.**
That is the well behind an **ESPN fantasy** team's logo — an arbitrary image a
manager uploaded, with no color to look up — so it stays a single theme-level
token that only a light theme declares. A club's cap has a color; a leaguemate's
avatar does not. Both are drawn on the League page's Transactions feed, a row
apart, and were checked together on Powder Blue: **43 cap marks, all 43 with
their club's ground, and 25 ESPN logos on `#bcd2e8`**.

**Bundle: JS 543.96 → 544.45 KB** (161.36 → 161.65 gzipped) and **CSS 145.40 →
145.42** (25.86 → 25.86) — half a kilobyte of JS raw and 0.3 over the wire, which
is thirty hex values and the paragraphs arguing them; the stylesheet's share is
one `border-radius`.

### The winner is the theme's own accent now, not the app's green

**`--win` — the color of a category a manager is taking** — is read by four
rules (the scoreboard card's winning figure, the matchup Summary's, its diverging
category bar and the run of the whole-matchup meter the leader holds), which is
why it is a token at all: they are one statement made four ways.

It was `--hit`, and green was the right answer while Midnight was the only
palette. It is not in the three added since, where it is the one loud thing on
the page belonging to no other mark on it — the light Lavender said exactly that
and moved `--win` to its accent for the duration, and a bottle-green winner on
Powder Blue's maroon-and-sky page is the same observation again.

**So it is the accent, in `:root`, for all of them.** Not five overrides and a
default: the rule is one sentence — *the winner is the theme's hero color* —
which every palette is built to make the loudest thing it has, and Midnight's
green went with the rest rather than becoming an exception. **The muted loser is
untouched**, and it is the half that carries the comparison: the app's green/red
delta pair would put ten red cells down the losing side of every card, which is
the row shouting rather than the winner being marked.

Measured against that `--muted`, which is the comparison the card actually asks a
reader to make: ΔE2000 **17.9** on Midnight, 16.4 on Lavender, 28.2 on Maroon and
16.5 on Powder Blue, at 6.3–8.5:1 on the surface it is printed on, and the winner
is bolder besides. Green's own gap was 35–44, so this is a real narrowing rather
than a free lunch; 16 is where the light Lavender shipped it and is a plain
difference at a glance. One line restores any of them.

### Cards that were the page's own color

**"Some of the cards look flat"**, and five of them literally were:
`.pa-card`, `.faced-card`, `.faced-row`, `.inning-head` and `.ars-row` were
painted `--bg` — the page color — so on every theme they were a bordered box the
same shade as whatever was behind them. The rest of the app's cards have carried
`--panel` → `--bg-2` for a long time (`.player-card`, `.feed-item-toggle`,
`.upcoming-head`, `.pday-game`, `.lg-matchup`, `.lg-tx`), which is the wash the
report names by pointing at the Upcoming rows.

They are cards by every other measure — a radius, a border, a tone rail,
something you can press — so they take the card surface. It is the **same one
declaration** rather than a fifth variation, which is the rule this stylesheet
applies to everything two things share: eleven rules now name that gradient and
there is one gradient.

Note this is the *base* wash, in every theme, and is not the themed ombré block
further down — that one adds a wash to the large flat surfaces (cards, popovers,
the tables' header row) which Midnight leaves flat. A card gets its top and
bottom either way.

**Bundle for this round** — the winner color, the five cards, the 5px rail and
the two palette values it moved: **CSS 145.42 → 145.71 KB** (25.86 → 25.90
gzipped) and **JS unchanged at 544.45** (161.65). Nothing here is a component;
it is five declarations, two tokens and the paragraphs arguing them.

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
one step further from the data than `hideil=1`: a color scheme is a fact about
this person and this room, not about the view a link describes.

**And it is the one preference this app mirrors into `localStorage`.** The rule
elsewhere is that there is none — the view lives in the query string — and the
reason to break it here is about the *first frame* rather than about
persistence. The record is still the source of truth, and that is what makes the
choice follow the reader to another device; but it arrives with `/api/prefs`, a
round trip after the page has painted, so without a local copy the app opens in
Midnight's navy and turns graphite in front of the reader on **every load**. That
is worse than any wait: it is the app appearing to change its mind. (Both themes
are dark now, so what would flash is a hue rather than a polarity — the mirror is
what keeps even that off the first frame.)

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

**The boot script is the only place a palette color is written outside the
stylesheet** — two `--bg` values and two `color-scheme` words — and it is inline,
blocking and tiny because it has to have finished before the first paint.

**And it paints the root, so the stylesheet has to clear the root again**
(`html { background: none }`, declared beside the `overscroll-behavior` rule
that is the document's other one-line statement). The page's background is
`body`'s, and it covers the window rather than only the body's own box because a
background on `body` is **propagated to the canvas** — but only while the root
element has none of its own. The paint-ahead gives the root one, and left
standing it outlives its purpose for the life of the page: `body` then paints
its gradient inside its own box, which is as tall as the content, so every page
shorter than the window ended on a hard seam with the flat root color under it.
Reported as *"the bottom of the page is white when there isn't enough content"*
and measured on the League view at 900×3000 under the light Lavender:
`rgb(235, 232, 244)` at the last row of content and **`rgb(243, 241, 248)`** —
`--bg`, a whiter band — for the 720px beneath it, with the bottom-left cool glow
clipped away with it. **The graphite palette would hide that seam the way
Midnight does** (its own gradient's foot *is* `--bg`, which is what the boot
script paints), so the rule now has no theme that shows its absence — which is
exactly why it is written down here rather than left to be rediscovered by
whoever writes the third one.

**Midnight hid it, which is why it went unnoticed**: that gradient's own foot is
`--bg` at its 55% stop, which is exactly the color the boot script paints, so
the seam had nothing to show. Measured after the fix, Midnight is
`rgb(11, 18, 32)` from the last row of content to the foot of the window —
byte-identical to before — while Lavender continues its gradient and its glow to
the bottom edge.

**The rule has to sit after the injected `<style>` in document order to win the
tie, and it does**: the boot script appends its style while `<head>` is being
parsed, and the stylesheet link is the last thing in it (checked in the built
`index.html`; in dev Vite injects its styles at runtime, which appends later
still). A stylesheet that somehow lost that tie would paint a flat page rather
than a broken one.

### The picker

A **row of swatches** in the settings menu, under the two toggles, rather than a
third toggle. A toggle holds two and there is no reason a third palette should
mean redrawing the control; and a color scheme is the one preference in that
menu whose *answer* can be shown rather than described — each button is three
stops of the palette it selects (the page, an edge on it, the accent), which is a
truer statement of what it does than any name.

The middle stop is `--border` rather than `--panel`, and that is measured: a card
is a step off the page in every theme (`#0b1220` → `#16213a`, `#1c1b22` →
`#2a2833`, `#1d1319` → `#2b1d26`) and at 8px wide that step is invisible, so the
swatch read as two stops. It pays off a third time in Powder Blue, whose
`--border` *is* the jersey's maroon piping — so that swatch is literally the
three colors of the uniform, in the order the uniform has them. The stops are **inline styles off `theme.ts`**, deliberately — they are
*another theme's* values, so they cannot be tokens, which would resolve to the
palette currently in force and draw every swatch the same. The hairline around
them is `--border`, which does follow the page.

**One theme per row**, which is what a fourth forced. The buttons were
`flex: 1 1 auto` in a wrapping row — "so two of them share the menu's width
evenly rather than each hugging the length of its own name", which was written
when there were two — and four labels of four different lengths packed
**1 / 2 / 1**, so the picker read as a ragged grid rather than as a list. A
two-column grid was the other way out and does not survive the narrow case: at
390px the menu leaves 219px of content, so a column is 106 against the 132
`Powder Blue` needs. Full width is what every other entry in this menu already
is, and it costs a phone about 38px of a popover with 500px to spare (measured:
four rows at 37px, the menu 329px tall with its foot at 387 of an 844px
viewport).

**Those are the four-theme figures and the argument is theirs; the current ones
are six rows at 30px, a 403px popover with its foot at 461** — see *The Dark and
Light pair* above, where the row is re-measured at three window sizes, and *The
menu is capped against the window* below, which is what 461 turned out to cost
on a short one. The two
that were added cost the picker no width and no rule: `Powder Blue` is still the
longest label, so the popover is unchanged at 193.3px at 1200 and 251.2 at 390,
and the markup is a `map` over `THEMES` that grew by two rows without being
edited.

It is a **radio group** (`menuitemradio`), this being one question with one
answer where a checkbox each would claim independent switches, and the
menu **stays open** across a press — the rule `Refresh from ESPN` follows, and
for the same reason: the result is a change in the page behind it.

**The picker leads the menu**, where it trailed the two toggles. It is the one
entry here that changes the whole app's appearance rather than one view's
contents, and it is the one a reader opens this menu *for* — hide-injured and
mute-audio are set once and then left. Leading also puts the *picture* at the
top of the popover, so the menu opens on something that says what it is; and it
leaves `Settings` heading the run it actually describes rather than the whole
box. Measured, the popover's children now read `Color scheme · Settings · Hide
injured players · Mute clip audio · How to use`, and its height is unchanged at
**329px** — a reorder costs nothing.

**The chips lead each row and the name is centered in what is left.** The button
used to center the pair as a group (`justify-content: center`), so the pill sat
at a different x on every row — it moved with the length of the name beside it —
and four rows of a picture-and-a-word read as four unrelated buttons rather than
as one column of themes. Pinned left (`.theme-swatch-label { flex: 1;
text-align: center }`), the pills line up down one edge and so do the names:
measured, `chipsX` is **223.2 on every row at 1200** and **46 at 390**, and the
labels' ink shares one center — **312.8 at 1200, 164.6 at 390** — with nothing
clipped. Both figures are unchanged with six rows in the list, which is the
property pinning them bought.

**That center is 17px right of the button's own midline**, which is half the
pill plus the gap, and the alternative was measured rather than waved away. A
mirrored 34px spacer on the right is what centers the name truly, and it spends
the same 34px out of the name column. The binding width is not the phone but the
**desktop**, where the popover hangs off the gear and is *narrower* than it is at
390 — **193.3px against 251.2**. Measured there the name column is **111.3px**
and `Powder Blue`, the longest label the picker has, is **75.7px** of ink: a
mirror would leave it **1.6px** of slack, and the next theme name to arrive would
clip. So the cheaper centring is the one that keeps the control working at the
width it is tightest at, and it buys the thing that actually reads as centered —
four names sharing one center.

### The menu is capped against the window and scrolls

**Six themes is where the settings popover outgrew a short screen.** It hangs
off the gear at `top: calc(100% + 8px)` with no cap at all, so its height was
simply the sum of what is in it, and the picker at its head is one row per
theme. At four it was 329px; at six it is **403px with its foot at 461**, and
measured across eight window sizes that foot is:

| window | foot | past the bottom | `How to use` reachable |
| --- | --- | --- | --- |
| 1200×900 | 461 | — | yes |
| 1200×500 | 461 | — | yes |
| 740×420 | 461 | **41px** | **no** |
| 844×390 *(a phone held sideways)* | 461 | **71px** | **no** |
| 1400×380 | 461 | **81px** | **no** |

A menu whose last entries cannot be reached is a menu with controls nobody can
press, and the ones off the bottom were `Mute clip audio` and `How to use`.

**So the popover is capped at whatever is left of the window below where it
starts, and scrolls** — `max-height: var(--popover-max-h, …)` with `overflow-y:
auto` and the app's own `overscroll-behavior: none`, which is the rule for
anything in this app that scrolls (the gesture is consumed where it lands
rather than chaining on to the page behind).

**The cap is measured rather than declared, for the reason `--chrome-h` is.**
It is the window less the popover's own distance from the top of it, and nothing
in CSS can read that: the popover is `position: absolute` inside the header, so
its offset is the *header's* geometry — which wraps to two and three rows as the
window narrows, and which moves again the day anything joins the brand row.
Measured, the anchor sits at **58px in all eight states above** — every width,
every view, sticky chrome or fixed-height column — so a constant would be right
today and quietly wrong later, which is the trap `--research-pin-left` and
`left: 63px` are both on the record for. `hooks.ts::usePopoverFit` reads the
element's own top and publishes `--popover-max-h` onto it; the stylesheet's
fallback (`calc(100dvh - 70px)`) is what it resolves to for the one frame before
that lands, and is deliberately generous rather than exact.

**Three triggers, each for something the others cannot see.** *Opening* is when
the element exists to be measured. *`resize`* is a window that changed under an
open menu, which is the case this is for at all — measured, a phone turned
sideways with the menu open takes it **403 → 320px** and its foot 461 → 378, and
turning it back restores both. And a **capture-phase `scroll`** is the one that
is easy to miss: under `max-height: 560px` the app's chrome is deliberately
*not* sticky, which is precisely a short window, so scrolling there carries the
anchor up the page and the room below it grows — measured on a 900×420 feed
(chrome confirmed `static`), scrolling 300px takes the anchor to −242 and the
cap from 350px to 650, so the menu un-caps to its natural height. A scroll event
does not bubble, hence capture.

It cannot feed back on itself: capping a box's height does not move its top, so
the measurement is the same before and after it is applied.

**Measured after, at six short windows:** the foot lands **12px inside** the
window in every one (844×390, 1400×380, 740×420, 390×380, 320×300), `How to
use` is reachable by scrolling and `document.elementFromPoint` returns *it*
rather than something over it, there is **no horizontal scroll** (`overflow-y`
computes `overflow-x: auto` alongside it, and nothing here is wide enough to
use it) and page overflow is 0. Even 320×300 works, at 173px of scroll.

**The fantasy popover takes the same cap**, sharing the class. It is much
shorter — a team name, a toggle and two entries, 242px with its foot 148px
inside a 390px window — so it never actually scrolls; one rule for both beats
two that agree today and stop agreeing when something is added to either.

**And so does every `InfoKey`, which for a long time only carried half of it.**
Those panels have always had `.settings-popover` — so they read `--popover-max-h`
— and nothing was ever *publishing* one for them, so all four fell back to
`calc(100dvh - 70px)`: a cap measured from the **top of the viewport** for a box
that opens part-way down it, which is no cap at all for the box it is applied to.
It went unnoticed while the tallest key was two sentences. Measured on the League
Scoreboard's projection key, which is four paragraphs, that put a **537px panel at
y=265 and let it run 182px past the bottom of a 620px window**, and a 641px one
54px past the bottom of a 900px one. `InfoKey` calls `usePopoverFit` now, which is
completing the pattern rather than changing it. Re-measured at 1200×900, 390×844,
390×620, 320×900 and 1400×380: **0px past the bottom at every one**, with 37px and
185px of scroll at the two short ones and the cap reading the measured figure
(343px, 195px) rather than the fallback — and the three older keys are a strict
improvement, the Splits, Charts and Rankings panels all opening in view with a
measured cap (626 / 624 / 721px) and 0 page overflow.

### The invite page offers one too

**The first screen a new user sees is the one place the app can reasonably ask**,
and with six palettes — two of them light — a reader on a bright screen was
otherwise committed to Midnight's navy until they found a gear they had no
reason to open yet. So the invite-link onboarding page carries a `Color scheme`
field, under the team picker and above the button.

**Second, not first.** The team is what that page is *for* — its lede says so,
and naming it is what turns the roster views over to the fantasy team — so the
required question leads and the optional one follows. A preference above the
task is the settings-page mistake that page was created to avoid.

**The swatches are the settings menu's own**, extracted to
`components/ThemePicker.tsx` when the second caller arrived, which is this app's
rule for a control drawn twice (`DateControls`, `StartersToggle`,
`PlayerIdentity`, `ColumnPicker` all moved on the same trigger). It matters more
than usual here: a swatch's whole claim is that it **is** a picture of the
palette it selects, and a second copy is a picture that will one day be of
something else. A reader who meets the gear later meets a control they have
already used.

**What is not shared is the heading**, because the two surfaces genuinely label
things differently — the popover's is a `.settings-popover-label` over a menu
section, the invite page's is the `.espn-label` its team picker already uses —
so each caller supplies its own, the way `PlayerIdentity` takes its name line as
`children`.

**And the role turns on where it is drawn**, which is the one thing the
component cannot decide for itself. Inside the popover — which is a
`role="menu"` — a swatch is a `menuitemradio` and the grouping belongs to the
menu; on a page there is no menu, and an orphaned `menuitemradio` is a lie about
its container, so it is a plain `radio` inside a `radiogroup` the component
labels itself. Measured: the popover draws six `menuitemradio` under
`role="menu"` with `role="group"` on `.theme-picker` and **no** role on
`.theme-swatches`; the page draws six `radio` inside a `radiogroup` labelled
`Color scheme`.

**The layout is the one thing the page overrides, and both halves are the
popover's own reasoning failing to transfer.** That control is argued for a menu
193–251px wide; the invite page's field is **460px from 640px up** and 288–358
below.

- **It wraps into columns instead of stacking.** A *basis* rather than a column
  count, so the count falls out of the width and no breakpoint has to be
  maintained: **160px** gives two per row from 390px of window up (the field is
  358 there, so each is 175.5) and 226.5 at 640 and above, dropping to one at
  320, where the field is 288. Three would need a basis under 148.7 at the 460px
  field, and `Powder Blue` — the longest label the picker has, 75.7px of ink —
  needs 129.7 with its pill and padding, so three columns would be nine pixels
  from clipping. Six rows became three: the block **235px → 124**, and the page
  **712 → 601**.
- **The label sits beside its own pill rather than centered.** The popover
  centers it because its rows are narrow and a column of names down one center
  is what makes six buttons read as one list; at 460px that same rule left the
  26px pill at the far left with the name **114px** away, which reads as two
  things on a row rather than as a labelled swatch.

**A press applies immediately and saves itself** — the page changing color under
the reader is the whole confirmation, and there is nothing here for the button
below to commit. Driven end to end: pressing `Light` stamps `data-theme`, sets
`color-scheme: light`, resolves `--bg: #fff` and `--accent: #004a8b`, writes the
localStorage mirror and fires `PUT /api/prefs/theme`; `Not now` and Escape leave
the scheme where the reader put it and set no team.

**It goes with the field it belongs to.** Both are gated on `phase === 'ready'`,
so a league whose teams could not be read shows the message, `Try again` and
`Not now` and **no picker** — there is nothing to pick a team from, and offering
a preference on a page that has failed its own question is chrome over a
failure. Measured: 0 swatches on that state, 6 back after a successful retry.

#### The confirm now drains the write queue, and that was a real loss

**`confirmEspnOnboarding` ends by reloading the tab**, which is argued at length
in **ESPN fantasy league**, *The pick ends in a boot*. A scheme picked on this
page is a `PUT` on the **same user record**, fired through `App.tsx::queueUserWrite`
and not awaited — so the reload can tear down a write that has not been sent.

**It is reachable and it was reproduced.** `queueUserWrite` is one promise
chain, so a *second* pick is queued behind the first and has not left the
browser when the button is pressed. Driven against a stub holding the
preference PUT 1.5s, picking `Lavender` then `Maroon` and pressing in the same
breath:

| | server saw | after the reload |
| --- | --- | --- |
| **before** | `theme:start · team:start · team:done · theme:done:lavender` | **Lavender** |
| **after** | `theme:start · team:start · team:done · theme:done:lavender · theme:start · theme:done:maroon` | **Maroon** |

The reader picked Maroon and got Lavender. `await queueUserWrite(async () =>
undefined)` before the navigation resolves only once everything already in the
chain has settled, which is the same reason `saveRosterSource` beside it is
awaited rather than fired and forgotten. It costs nothing when the queue is
empty.

**The scheme itself survives either way** — `storeTheme` writes the localStorage
mirror synchronously, so the boot after the reload paints the right palette
whatever the record says. What the drain saves is the *record*, and with it the
choice following its owner to another device; without it the next load reads the
stale saved value back and overwrites the mirror with it, which is what the
table above measures.

**Bundle: 559.06 → 560.00 KB of JS** (166.03 → 166.32 gzipped) and **151.55 →
151.73 KB of CSS** (27.09 → 27.15) — 0.94KB and 0.18KB raw, 0.29KB and 0.06KB
over the wire, for a shared component, a measured cap, a second picker and the
paragraphs above restated where the rules are.

### The default is Dark, and the plain pair leads the list

**Two changes and one reason.** The picker listed the four named palettes first
and the plain pair last, and `DEFAULT_THEME` was Midnight — the app's original,
and the palette `:root` itself declares. Both are reversed: `Dark` and `Light`
lead, and `Dark` is what a reader who has never chosen gets.

**The order first, because it is the smaller of the two.** A reader opening this
picker is answering *light or dark* before they are answering *which navy*, and
the two entries that say only that should be the two they meet first; Midnight,
Lavender, Maroon and Powder Blue each have a character to them, which is what
makes them the choice you make once you have one. And a picker whose default is
sixth in its own list is a picker that opens on somebody else's answer. Nothing
about the control changed — its markup is a `map` over `THEMES`, so reordering
the array is the whole of it, and the popover is unchanged at **193 × 403px with
its foot at 461**.

**The array's order is now the picker's alone, and `themeById` had to be told
so.** It fell back to `THEMES[0]` for an id it did not recognize, which was
right only while the first entry and the default were the same entry. It reads
`DEFAULT_THEME` now — the fallback being a statement about which palette an
unknown id resolves to, where the array's order is a statement about a list.

### `:root` is still Midnight, so every theme is stamped now

**The default and the palette `:root` declares used to be one thing, and
`applyTheme` leaned on it**: the default carried **no attribute at all**, on the
sound reasoning that a bare `:root` already *was* Midnight, so a reader who had
never chosen had nothing stamped on their document. Moving the default breaks
exactly that coupling.

**Two ways out, and the cheap one is right.** Either move the Midnight palette
into an `html[data-theme='midnight']` block of its own and put Dark's on
`:root`, or leave the palette where it is and stamp the attribute
unconditionally. The first is a hundred-line move of the block **every theme
redeclares tokens against**, to buy back one attribute; the second is one line.
So `:root` is still Midnight — it is the base rather than the default now — and
`applyTheme` sets `data-theme` for all six.

**It is safe because nothing keys on the attribute's absence**, which was
checked rather than assumed: the stylesheet contains no `:not([data-theme])` and
no bare-`:root`-only rule. The one visible consequence is that **Midnight now
carries `data-theme="midnight"` and there is no block by that name** — the
attribute is inert for that one theme and it resolves `:root` exactly as it
always did, which is measured below.

**`html[data-theme='dark']` was already known to be complete**, which is what
makes this a default change rather than a palette change: it redeclares all 30
color tokens `:root` declares and leaves the derived ones — `--row-alt`, the
four role grounds, the geometry, the shadows — to resolve against it, which is
what every theme block does and what this one has been measured at (its
role-ground floor of **13.32** is the widest of the six).

**The boot script moved with it**, and has to: `index.html` paints the base
color before the stylesheet loads, so its own default went `midnight` → `dark`
and it stamps the attribute unconditionally too. The three places that have to
agree about what the default is are that script, `DEFAULT_THEME` and
`applyTheme`, and each carries a comment naming the other two.

**Nothing about the stored preference changed shape.** `setTheme` still writes
`null` for the default, which the server stores as the absence of the entry — so
"back to the default" goes on meaning *whatever the default is now*, which is
the property that rule was written for and the reason a record saved before this
needs no revisiting. A reader who explicitly picked Midnight has `midnight` in
their record and keeps it; a reader who never chose has no entry and now gets
Dark, which is the intent.

### Measured — the default and the order

**A reader who has never chosen**, driven with the localStorage mirror cleared
and `theme` stripped from the `/api/prefs` response: `data-theme="dark"`,
`color-scheme: dark`, the `<meta>` at `dark`, and the tokens resolving
**`--bg: #121314` / `--accent: #63b4d8`** — VS Code's own dark surfaces, which
is what the palette should be.

**The picker**, at 1200×900: six rows reading **`Dark · Light · Midnight ·
Lavender · Maroon · Powder Blue`** with **`Dark`** the one carrying
`aria-checked`, the popover **193 × 403px** with its foot at 461, and page-body
overflow **0**. Pressing `Light` stamps `light`, sets `color-scheme: light` and
resolves `#ffffff / #004a8b`, writing the mirror; pressing `Dark` puts both
back.

**All six resolve, and Midnight's inert attribute with them.** Driven one at a
time with the prefs response stubbed to each, on the research board at 1200×900
— every row `attr`, `--bg` and `--row-alt` as its block declares:

| | attr | `color-scheme` | `--bg` | `--row-alt` |
| --- | --- | --- | --- | --- |
| Dark | `dark` | dark | #121314 | #202122 |
| Light | `light` | **light** | #ffffff | #ebebef |
| Midnight | `midnight` | dark | **#0b1220** | **#16213a** |
| Lavender | `lavender` | dark | #1c1b22 | #2a2833 |
| Maroon | `maroon` | dark | #1d1319 | #2b1d26 |
| Powder Blue | `powder` | light | #ffffff | #dceaf7 |

Midnight's row is the one that matters: it is stamped for the first time and
reads `:root`'s own values to the byte. Rows are **58.00px** and the header row
**51.00** in all six, with **page-body overflow 0** at every one.

**And the geometry did not move**, checked across the four main views at 390×844
and 1200×900: `Roster`, `Feed`, `Research` and `League` each render with **0**
horizontal overflow and no error banner.

**Bundle: 559.06 → 559.86 KB of JS** (166.03 → 166.28 gzipped) and **151.55 →
151.77 KB of CSS** (27.09 → 27.17) — 0.8KB and 0.22KB raw, 0.25KB and 0.08KB
over the wire, and that figure carries the two other changes of this round (the
`[inert] video` rule and the onboarding button) as well as this one; the
paragraphs arguing them cost the bundle nothing.

### Measured — the first Lavender, and the sweep that made a theme possible

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
reading the stylesheet. In the light Lavender everything that failed the 4.5 bar
was either `--faint` at **3.98** (the deliberately-quiet percentile badge, where
Midnight's own reads **3.72**) or small bold text on a live-role row at
**3.93–4.45**, where Midnight's comparable is **4.35**. Two faults the audit
found were real and were fixed: the status chip on a headshot, which was a
near-black chip under that theme's darker semantic inks at **3.08:1** and became
a white one at **7.5:1**; and the tinted-row problem the palette section above is
mostly about.

**Bundle: 527.38 → 529.61 KB of JS** (155.93 → 156.65 gzipped) and **127.49 →
134.27 KB of CSS** (22.64 → 23.58) — 2.2KB and 6.8KB raw, 0.7KB and 0.9KB over
the wire. The CSS growth is almost entirely the `color-mix()` expansion, which is
the thing that makes a second theme reach the tints at all; gzip finds the
repetition and charges under a kilobyte for it.

### Measured — the graphite reversal

**The same text-node audit, run on both themes over the same four views** (a
simulated live roster, the research board, a player page, the League rankings) at
1400×950 against the running app, compositing each element's real background
stack. Nothing new fails: **the set of elements under the bar is identical in the
two themes** — 2 on the roster, 11,599 on the research board (the percentile
badge under every value of every row), 45 on the player page, 0 on the rankings —
and Lavender's worst is **higher** than Midnight's everywhere it is measured.

| the quiet ones | Midnight | Lavender |
| --- | --- | --- |
| `--faint` on a live-role row (`.sum-opp-sp`, `.col-rank`, `.glog-zero`) | 3.18 | **3.35** |
| `--faint` on the page (`.news-summary`, `.details-trend`) | 3.72 | **3.95** |
| the ordinary chrome label (`.view-tab`, `.row-id-pos`) | 6.08 | 5.88 |
| a stat cell (`.sum-num`, `.lg-num`) | 5.46 | **12.09** |

Every one of those is `--faint`, which is the tone this app spends deliberately —
the percentile badge under a value, a dimmed zero in a game log, the second line
of an opponent cell — and it is quieter in Midnight than here.

**Midnight is untouched by construction and was checked to be**: every
declaration in the diff is inside the `html[data-theme='lavender']` block or one
of its two ombré rules, and `:root` changed in comments alone.

**Driven in a browser at 390–1400 across the app**: the roster and its four-role
legend, the research board, a player page, the League scoreboard and rankings
(where the diverging rank badge reads off `--strikeout`/`--walk` and follows for
free), the feed with a plate appearance's dialog open — its scrim, its pitch dots
and their near-black numbers — and the settings menu with the picker in it. The
simulated live board draws all four role tints distinctly.

**Bundle: JS unchanged at 543.50 KB** (161.17 → 161.16 gzipped) and **CSS
142.86 → 142.26 KB** (25.29 → 25.14) — a *fall* of 0.6KB raw and 0.15KB over the
wire, which is what dropping a token, a rule and a set of inversions costs when
what replaces them is `:root`'s own values.

### Measured — Powder Blue

**The same text-node audit, over the same four views** (a simulated live roster,
the research board, a player page, the League rankings) at 1400×950 against the
running app. Nothing new fails, and the theme is the *quietest-safe* of the three:
every element under the 4.5 bar in any theme is `--faint`, and Powder Blue's
`--faint` is the highest-contrast of the three.

| the quiet ones | Midnight | Lavender | Powder Blue |
| --- | --- | --- | --- |
| `--faint` on a live-role row (`.sum-opp-sp`, `.col-rank`, `.glog-zero`) | 3.18 | 3.35 | **3.90** |
| `--faint` on the page (`.news-summary`, `.details-trend`) | 3.72 | 3.95 | **4.39** |
| the ordinary chrome label (`.view-tab`, `.row-id-pos`) | 6.08 | 5.88 | **6.90** |
| a stat cell (`.lg-num`, `.lg-row-title`) | 5.46 | 12.09 | **14.10** |

**Driven in a browser at 390 and 1200–1400.** The picker now holds three rows and
**each one applies live**: pressing Midnight removes the `data-theme` attribute
and lands `--bg: #0b1220 / --accent: #38bdf8`, Lavender sets `lavender` and
`#1c1b22 / #b49cfb`, Powder Blue sets `powder` and `#1d1319 / #8fc0ea`, with
`aria-checked` moving and the localStorage mirror following each press. The menu
is **251 × 292px at 390**, well inside an 844px viewport, and the page body
overflows by **0** on every view at both widths.

**The shared ombré rules resolve per palette**, which is the thing a shared
selector list most easily breaks: a card reads `#35242f → #2b1d26` under Powder
Blue, and a table header `#332f3d → #232229` under Lavender (byte-identical to
before the two lists were merged) and `#35242f → #241820` under Powder Blue —
each the theme's own `--panel-2` into its own `--panel`/`--bg-2`.

**Everything the tables are already measured against is untouched**: 58.00px
rows, the pinned columns and the header row where they were, and no horizontal
overflow at 390 with 465 rows on the research board.

**Bundle: CSS 142.26 → 143.36 KB** (25.14 → 25.40 gzipped) and **JS 543.50 →
543.71** (161.16 → 161.25) — **1.1KB of CSS and 0.2KB of JS raw**, a quarter of a
kilobyte over the wire, for a whole theme. Most of the CSS is the comment
recording where the three colors were sampled from.

### Measured — Powder Blue, and the rename

**`powder` was the dark theme's id for one round and is now the light one's.**
The dark theme is `maroon`, which is what it always should have been called once
a second theme off the same photograph existed: `Powder Blue` describes the page
rather than the accent, and the page is the thing a reader picks. The id was
renamed rather than the label alone, because a stored `powder` that meant the
dark theme and now means the light one is exactly the kind of thing a saved
preference should not be able to do — and nothing had it stored: the theme was
minutes old, unshipped, and its only writer was this session's own testing.
`toThemeId` narrows an unknown id to the default, so even a record that had one
would open on Midnight rather than on nothing.

**The same text-node audit, over the same four views**, now across all four
themes. Nothing new fails: every element under the 4.5 bar in any theme is
`--faint`, the tone this app spends deliberately (the percentile badge under a
value, a dimmed zero in a game log, the second line of an opponent cell), and
Powder Blue is the **highest** of the four on it.

| the quiet ones | Midnight | Lavender | Maroon | Powder Blue |
| --- | --- | --- | --- | --- |
| `--faint` on a live-role row | 3.18 | 3.35 | 3.90 | **4.23** |
| `--faint` on the page or a card | 3.72 | 3.95 | 4.39 | **4.23** |
| the ordinary chrome label (`.view-tab`) | 6.08 | 5.88 | 6.90 | **8.52** |
| a stat cell (`.sum-num`, `.lg-num`) | 5.46 | 12.09 | 14.10 | **14.50** |

**The audit's own page fallback had to be fixed to run it**, and it is worth
recording because it would have produced a confident wrong answer: the walker
composites an element's background stack and, finding nothing opaque, fell back
to a **hard-coded** page color. On a light theme that compared dark text against
a dark ground and reported `.research-count` at 1.8:1 and the chrome labels at
2.01 — all of them false. It reads `--bg` off the document now. The dark themes'
figures are unchanged by the fix, because every element it flagged sits on a
table cell with an opaque `--cell-bg`.

**Driven in a browser at 390 and 1400.** The picker holds four rows and each
applies live, with `data-theme`, `color-scheme` (`light` for Powder Blue, which is
what hands the browser's own controls the right polarity), `aria-checked` and the
localStorage mirror all following the press. Page-body overflow is **0** on every
view at both widths. The shared table-header gradient resolves per palette
(`#eef5fc → #c7dcf1` here), the two own-rules run the other way up (`#ffffff →
#eef5fc` on a card, `#dceaf7 → #c7dcf1` on the page), and the logo plate draws
behind an uploaded badge and not behind our own fallback baseball.

**Bundle: CSS 143.36 → 145.40 KB** (25.40 → 25.86 gzipped) and **JS 543.71 →
543.96** (161.25 → 161.36) — **2.0KB of CSS and 0.25KB of JS raw**, half a
kilobyte over the wire, for a whole theme in the opposite polarity.

### Measured — the white page, and the zebra that had to move with it

**Reported as two things and they are one change**: on Powder Blue the first row
of a table should be white so the header above it is tellable apart, and the page
should be white. Both fall out of `--bg` going `#dceaf7` → `#ffffff` — the first
row *is* `--bg` — plus the one thing that then breaks, the zebra's other row,
which was `--panel` and is white too. See *The Powder Blue palette* above for the
palette and *Three things a theme is allowed to move* for `--row-alt`.

**The three dark themes are untouched, and that was checked rather than reasoned
about.** Driven theme by theme on the research board at 1200×900, reading the
tokens and the rendered rows back:

| | `--bg` | `--panel` | `--row-alt` | row 1 / row 2 |
| --- | --- | --- | --- | --- |
| Midnight | #0b1220 | #16213a | **#16213a** | `rgb(11,18,32)` / `rgb(22,33,58)` |
| Lavender | #1c1b22 | #2a2833 | **#2a2833** | `rgb(28,27,34)` / `rgb(42,40,51)` |
| Maroon | #1d1319 | #2b1d26 | **#2b1d26** | `rgb(29,19,25)` / `rgb(43,29,38)` |
| Powder Blue | **#ffffff** | #ffffff | **#dceaf7** | `rgb(255,255,255)` / `rgb(220,234,247)` |

Every dark row is byte-identical to what it drew before — `--row-alt` resolving
`var(--panel)` on `:root` is the whole of why, and it is the same mechanism the
four role grounds already use (a `color-mix` declared on `:root` resolves against
the palette in force, `html[data-theme='…']` *being* `:root`).

**On Powder Blue, driven at 320 / 390 / 640 / 1200 / 1920** on the roster, the
research board, a player page's Game Log, the feed and the League view:

- **`body` computes `rgb(255, 255, 255)` with `background-image: none`** on every
  view at every width — flat white, no ombré, no corner wash.
- **The zebra runs white then powder** on all four wide tables: the summary
  table's rows and its pinned headshot cell alike (`rgb(255,255,255)` /
  `rgb(220,234,247)`), the research board's, the game log's and the League
  table's.
- **The header is the boundary this was reported for**: the shared gradient
  computes `linear-gradient(rgb(238,245,252) 0%, rgb(199,220,241) 100%)` on all
  four tables, so its foot meets a **white** first row at ΔE2000 **13.0** where
  it met #dceaf7 at **4.6**.
- **The four live-role grounds** compute #e9c7c9 / #e2d6c7 / #e0c9ef / #c7dbda —
  the 24/22 mixes over white — pairwise ΔE 12.8 at the tightest against 12.1
  before.
- **Nothing moved geometrically**: rows **58.00px**, the pinned headshot column
  at **0** with the pane scrolled to its far right, the header row at **0** in
  its scrollport, the Total row still `--panel-2` (`rgb(238,245,252)`), and
  **page-body overflow 0** at all five widths on every view.

**The text-node audit was re-run over four views at 1400×950**, compositing each
element's real background stack: **every element under the 4.5 bar is
`--faint`** — the percentile badge under a value, an opponent cell's second line,
a dimmed zero in a game log — and the worst of them is **4.23**, which is that
tone on the striped row (it is 5.17 on the white one). The League view has **0**
elements under the bar. Two things the audit's own script had to be fixed for are
worth recording, because both produce confident wrong answers: a `color(srgb …)`
background — which is what a `color-mix()` computes to, so every role-tinted row
and every `.on` toggle — parses as 0–1 floats and reads as near-black unless
scaled, and the page fallback has to be read off `--bg` rather than hard-coded or
a light theme is measured against a dark ground.

**Bundle: CSS 145.42 → 145.50 KB** (25.86 → 25.93 gzipped) and **JS unchanged at
544.45** (161.65) — 80 bytes of CSS raw and 70 over the wire, nearly all of it
the comments; the JS is flat because the only change outside the stylesheet is
one hex in `theme.ts` and one in the boot script.
