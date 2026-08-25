# The rules that apply whatever file you are in

This file is **always loaded**. Everything else about the architecture is
documented per surface and loaded on demand — see the routing table in
`CLAUDE.md`, and invoke the skill for the surface you are touching.

Nothing here is new. Every rule below is extracted from the per-surface
documents, which carry the measurements and the reasoning behind it; this is the
short form, kept always-on because these apply no matter which file you opened.

---

## Method

**Measure, don't declare.** This repo's whole documentation style is that a
claim carries the measurement that establishes it. A new claim owes the same:
drive it in a browser, read the numbers off the rendered page, and write the
before → after down beside the rule. "It looks right" is not a result. Where a
value could be a constant or a measurement and there is no *one* number — a
bar that wraps, a box that changes height, a font this app does not choose —
**measure it at runtime** rather than declaring it (`--chrome-h`, `--clip-w`,
`--roll-font`, `--research-pin-left`, `--popover-max-h` are all this rule).

**Probe before you build on an upstream.** Half the dead ends in these docs are
endpoints that return 200 and ignore the parameter. Check that a column comes
back *populated* before adding it — the `pull_air_rate` and `swing_length`
columns each accept the selection and return an empty column, which compiles,
fetches, joins and yields a table of dashes.

**Report the bundle.** JS and CSS, raw and gzipped, before → after. A change
that removes more than it adds should say so.

## Verifying

**There is no test runner and no linter.** "Verifying" a change means running
`npm run build` (which typechecks both workspaces via `tsc`) **and exercising
the flow in the running app**. The build passing is necessary and nowhere near
sufficient — most faults recorded in these docs are geometric, and were found by
driving a browser and reading values back, not by compiling.

## Landing work

**Never commit straight to `main`.** Branch, open a PR, merge it — whatever the
old history appears to show. Several agents work at once here, each in its own
worktree on a `worktree-<slug>` branch; the `merge` skill covers landing them and
names this repo's conflict hotspots (`CLAUDE.md`, `styles.css`, `App.tsx`, the
paired `types.ts`).

**Never `git stash` in a worktree.** The stash is a **single stack on the shared
repository**, not a per-worktree one, so an agent's `git stash pop` takes
whatever entry is on top — which, with several agents working at once, is
routinely somebody else's uncommitted work landing in your tree while theirs
disappears. Observed: an agent stashed, and its `pop` pulled in another
worktree's `chartScrub.tsx` and `styles.css`; it was recovered with `git stash
store` at the original stack position, but only because the collision was
noticed.

Reproduced deliberately afterwards, which takes four commands: two detached
worktrees A and B, each staging one file of its own and running `git stash
push`; `git stash list` **read from A shows both entries**, B's on top because
it stashed last; `git stash pop` in A drops `probe-b.txt` into A's tree and A's
own work stays on the stack. Commit to your own branch instead — a throwaway
commit you amend or reset is private to your worktree, where the stash never
is.

**Deploy only when asked.** Merging is not a licence to ship. Offer the deploy;
don't start it.

---

## The data model

**`client/src/types.ts` mirrors `server/src/types.ts` by hand.** The workspaces
cannot import from each other. Change one and change the other in the same
breath — nothing will catch it for you, and a field that exists on one side and
not the other fails at runtime rather than at build time.

**The season is pinned in eleven places** and they must stay in sync. The list
is in `CLAUDE.md`; **check the count against the code rather than trusting the
prose** — `grep -rln "hfSea\|CURRENT_SEASON = \|SEASON = " server/src/` is what
it is derived from, and it has been one behind **twice** (`teamResearch.ts`, and
then `parkFactors.ts`). That grep answers **twelve** against a count of eleven,
and always will — `playerSplits.ts` answers it by *using* an imported `SEASON`
rather than declaring one. Count the declarations, not the filenames — and note
the declaration grep is itself one short, `savant.ts` spelling its pin
`hfSea: '2026|'` where the pattern looks for `hfSea=`. Ten from that grep plus
`savant.ts` is the eleven.

**All cache reads and writes go through `storage.ts`.** No module outside it
should touch `fs` for cache purposes. Reads degrade to a miss; **writes are
logged and swallowed** — a failed write must never fail a request that already
has its answer.

**Bump a cache version when a field is added *or begins to be filled*.** A
stored blob deserializes with everything added since it missing, so a stale one
quietly serves nulls; and a field that has *just started* carrying a value is
the same fault wearing a `null`. The test to apply is not whether the field
rides in the blob but **whether anything reads it back out of one** — a
`PlayerReport` rides in a day snapshot, but `getReport` reads only `games` off a
day and builds the report itself, so three fields on it needed no bump at all.
And a version guards **the meaning** of what is stored, not only its shape: the
arsenal blob went to `-v5` when nothing was added and only the *sampling rule*
changed.

**A field nobody reads is a field nobody misses.** Remove it with its last
reader (`teamProbablePitcher`, `NewsItem.url`, `EspnMatchupSeries.live` are the
precedents). The mirror of that rule: before removing, check for a *second*
reader — and check whether a *future* one is worth waiting for.
`ResearchRow.qualified` is the case that vindicates the mirror: it was kept
deliberately with **no reader at all**, on the grounds that the reasoning behind
it was still correct, and it has one again — the percentile scale on the
research board and the player page's Stats tab is built from the rows it
selects. Had it been pruned, the work would have been the standings fetch, the
qualifier and the field, put back.

**A failure costs its own column, never the request.** Each upstream is fetched
in its own `try`: a dead Savant leaves the MLB half standing, a dead RotoWire
leaves the transactions, a failed leaderboard costs its own bars a percentile. A
route whose answer *is* the table (`/api/schedule`) is the one exception and
502s honestly.

**A join fails to null, never to a guess.** An ambiguity neither test resolves
is left unmatched — marking the wrong Wilmer Flores as owned is worse than
marking neither.

---

## Client conventions

### The stylesheet

**Fold, don't restyle.** Two things that are the same object share a selector
list rather than being given rules that agree today: `.kind-switch` is folded
onto `.view-switch`, `.settings-toggle` onto `.sim-toggle`, `.stats-table` onto
`.glog-table`. Two things that merely resemble each other are two things that
will one day differ.

**A media query adds no specificity.** A rule inside one loses to a later rule
of equal specificity, so a narrow-screen block must sit **after** everything it
overrides. This has bitten five times (the phone rhythm block at the end of the
file, `.date-row .date-presets` going two classes deep, the roster row's
toggle-glyph rules moving below `.research-toggle`, the `text-box` `@supports`
block,
the `.mup-*` narrow blocks). The same holds for `@supports`.

**`font: inherit` is a shorthand and resets `font-size`.** Declare
`font-family: inherit` on a button reset unless you mean to lose the size.

**`--table-bleed` is declared by the container, not the table.** The number is
that container's own padding and there are three of them (22px in `.app`, 16 in
the player overlay, 12 in the full-page box), so a table can never bleed by more
or less than the box it is in has to give.

**A cell's ground is named (`--cell-bg`), not assigned.** Where a rule paints a
cell *and* something just outside its edge, both read the token — assigning
`background` directly is how the two halves of one surface come to disagree
(shipped once, as light bars down the summary table's header).

**An auto margin on the cross axis suppresses a flex item's stretch.** A
`margin: 0 auto` card inside a column flex shrinks to its content
(`.upcoming-detail .pct-card` is the fix; `.details-chrome` records the same).
**It has bitten the same card twice** — `.start-detail` was folded onto
`.upcoming-detail` for the flex column and not onto the `width: 100%` beside it,
and the splits card came back at 246px in a 774px body with every bar 0px wide.
Fold a wrapper on and check what else its twin is carrying.

**Layout containment makes a box a containing block for `position: fixed`
descendants.** `container-type: inline-size` on a dialog body means a
full-screen page rendered inside it is laid out *inside the dialog* — portal to
`document.body` instead.

**A container query with no container silently fails.** Moving a detail out of
the card it was written for keeps the layout it had at every width.

### Touch and pointers

**Hover on a pressable *surface* is scoped to `@media (hover: hover)`.** A touch
device has no pointer to move away, so the tint sticks to the last card a finger
crossed and reads as a selection the app then declines to act on. Scoped, not
deleted — a pointer user loses nothing. Full-width rows and cards in a scrolling
list take the rule; small aimed targets (buttons, tabs, pills, icon squares)
keep their hover. `:active` and `:focus-visible` are never scoped.

**`touch-action` in the smallest scope that answers, and only where an element
genuinely consumes the gesture.** It can arbitrate between two gestures that
differ in *place* or *axis*; where they differ in neither, **the gesture is what
has to move** (the Columns dialog's reorder went from a drag to a press for
exactly this reason). Chrome performs **touch adjustment**, snapping a touch
that lands near a small target onto it — so a `touch-action: none` region is
effectively wider than the element declaring it by roughly a fingertip.

**A press arms on `pointerdown` and decides on release.** A scroll begins with a
`pointerdown` on whatever is under the finger, so toggling there means every
flick that starts on a row flips it. Judge the gesture on where it *started* and
whether it stayed within `TAP_SLOP` (8px).

**`overscroll-behavior: none`**, not `contain` — `contain` stops the chaining
and keeps the element's own iOS bounce, which is the thing being complained
about. Declared on `html` unconditionally, and on every scroller, in the axes
that box genuinely scrolls.

### Loading

1. **Never over data.** If the pane has rows, the read is quiet. The only marks
   a re-read may leave are inside the control that started it and the in-place
   `Updating` badge. Write results on success alone; leave the last answer
   standing while the next is in flight.
2. **A block wait only when there is nothing to show yet**, and only after
   `WAIT_DELAY` (250ms) — `useDelayedFlag`. Gate the *content* on the real flag,
   not the delayed one, or a fast read shows a blank pane instead of a wait.
   **Rule 1 is about a re-read**, where there is an answer on screen worth
   protecting; the *first* read has nothing to protect, and three quarters of a
   page is not a page. `App` holds the whole frame behind the boot `Splash`
   until the roster, the report and the league status have all answered —
   measured, the alternative was the page painting at 258ms and the tab row
   dropping in on top of it at 762.
3. **A press-triggered mark holds `MIN_SPIN` (450ms)** so a press leaves a
   trace. The two numbers answer different questions and are deliberately
   different.

**A stale answer must not land on a fresh one.** Sequence-number every read that
can be superseded; only the newest may write state or raise an error banner.

**Never mark a request answered before it is answered**, and never unmark it in
an effect cleanup. React StrictMode mounts, tears down and re-runs: pass one
sets the mark and its teardown discards the answer, pass two sees the mark and
returns, and the wait stays up forever. Test the state you already hold, or
clear the mark in an unconditional `finally`. This has been found four times.

**A wait names what is being read** — `Reading the league leaderboard`, not
`Loading…`. The turning ball carries the tense, so no trailing ellipsis.

### Dialogs and overlays

Every popup rides on `components/Modal.tsx`. Its layer comes from
`DialogLayerContext` — a host declares the z-index of the box it is and every
dialog inside takes one step above, so a component never needs to know how deep
it was opened. `.details-view`, `.mup-view`, `.outing-view` and the full-page
table box are in `OVERLAYS`, which `overlayAbove` and the background-mark
registry read.

**One press of Escape undoes exactly one thing.** Both halves are needed:
`overlayAbove` decides *who* answers (the topmost, before anything has moved),
and `answersEscape`'s marked-event set decides *how many* (one). Without the
second, a microtask checkpoint runs between listeners, React flushes, and each
box in the stack truthfully reports that nothing is above it.

**A popup covers the keyboard and the pointer.** `useInertBackground` walks
siblings up the tree; marks are **recomputed rather than remembered**, because a
box opening *inside* a subtree an older mark is holding must free it.
`useOverlayFocus` reads the opener before inerting and releases before restoring
— focus cannot land inside an inert subtree.

**A dismissal spends the gesture.** A modal backdrop arms on `pointerdown` and
dismisses on the `click`; a popover closing on an outside press swallows the
ensuing click (`swallowNextClick`), or the press does two things.

**`[inert] video` does not paint.** A `<video>` is a compositing layer and can
paint over the box covering it.

### State, and where it lives

- **Which data a view shows → the URL.** `preset`/`start`/`end`, `view`,
  `hideil`, `sched`, `plays`, `roster`, `pos`, `cols`, `inc`,
  `win`, `board`, `mp`, `mup`, `mt`, `mr`, `lt`, `lspan`, `lwk`, `proj`,
  `rproj`, `rsum`, `rankproj`, `cut`, `mlb`, `mday`, `mgrp`. A link
  that leaves one out describes a
  different page.

- **A fact about the person → a saved preference** on the user's own record
  (`UserPrefs`). Absence means the default, so a default can change without
  anyone's record needing revisiting; store a value only when it differs.
- **Only `theme` is mirrored into `localStorage`**, and it is a paint-ahead
  cache rather than a second home.
- **A preset is a rule, not a range.** The URL carries the label so a shared
  link re-derives the dates on the recipient's own today.
- **Two params must never mean two things.** `proj=1` is a matchup's and
  `rproj=1` is the roster's, deliberately, because a link is read before
  anything on screen can say which view wrote it.
- **A lens is put away when its page leaves the screen.** A press is about the
  page it was made on, so a projected reading (`rproj=1`, `proj=1`,
  `rankproj=1`, a team page's own) goes off when the reader crosses the view
  tabs, closes the matchup page or leaves the Rankings tab — **a page opens
  measured unless a link says otherwise**. A page opened *over* another
  (`player=`, a matchup over a tab) is not a leaving, and neither is a
  sub-selection inside one (a span, a kind). The reset watches navigation state
  seeded from the URL and never fetched data, so an inbound link is already on
  its own surface before any effect runs.
- An unrecognized value **falls back rather than emptying the view**, and the
  URL keeps what it was handed.

### Presentation

**A rate is `.xxx` and a share is a percent**, and which is which is a
convention rather than a property of the number — so it is a table of stats
(`lib.ts`), never a test on the name or the value. On-base *percentage* is
`.xxx`; K% is a percent, to one decimal.

**Color is spent on state, not on emphasis.** The wide tables' stat columns are
monochrome; a live inning, a postponement, a lineup pip and a role tint are what
color means. Where a scale genuinely *is* the reading (the League rankings'
rank badge), it is argued where it sits.

**One arithmetic, one implementation.** The figure that ranks the Overview's top
performers (`categoryValue.ts::dayValue`) is the same figure the roster lens's
`Value` column and the research lens's `VAL` column print — one scorer, two
adapters, and `ScoringCategoriesContext` so every surface scores against the
same set. The Overview's is **one day** and the two projected columns are **the
whole span undivided**, which is the reading a projected board is opened for
(six games of a good hitter outscore three of an equal one); the titles say
which, because the two are not comparable.

**An estimate never wears the same clothes as a measurement.** A dotted
percentile bubble, a hatched split fill, a dashed projected chip, a muted
projected row: solid means measured, broken means ours.

**A mark that would be on every row marks nothing** — suppress it (the roster
baseball on a board that is only your roster, the padlock on `Other Rosters`
alone, the kind tabs when one kind is watched).

**An empty state names its own cause and the control that caused it**, and
points at where that control is. A filter message must not claim a fact about
the day.

**Reserve the box, don't move the page.** A control that changes size under the
finger that pressed it is the fault; reserve the worst case by laying it out
(a hidden ghost sharing a grid cell) rather than declaring a height, whenever
the worst case is a function of width or of a font this app does not choose.

---

## Spelling

American English throughout, with the two exceptions `CLAUDE.md` sets out —
values that come off the wire (MLB's `Cancelled`) and names the platform owns
(`aria-labelledby`). Note `analysis`/`analyses` and `cancellation` are already
correct American spellings.
