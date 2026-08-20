import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { RefObject } from 'react';
import type { PlayerStatus, RecentNews } from './types';

/**
 * Whether clips play with the sound off — the settings menu's "Mute clip
 * audio", saved per user.
 *
 * A context rather than a prop because the only component that needs it is a
 * leaf: every clip in the app plays through `ClipVideo`, and reaching it from
 * App means threading a boolean through PlayerCard, the game blocks, the plate
 * appearance cards, the feed and the reel — six components that have no other
 * interest in it. One provider at the top, one `useMuted()` in `ClipVideo`, and
 * every clip in the app is covered including any added later.
 *
 * Defaults to false, so a clip rendered outside the provider (a test, a future
 * standalone view) behaves as it always has.
 */
export const MutedContext = createContext(false);

export function useMuted(): boolean {
  return useContext(MutedContext);
}

/** A player's place on the user's fantasy roster: his slot on the day the range
 *  in view ends, and whether that slot is a lineup spot rather than the bench or
 *  the IL. */
export interface FantasySlot {
  slot: string;
  starting: boolean;
  /**
   * Which day the slot above is a fact about, or **null when that day is
   * today** — so the chip's title can say "today" rather than name a date the
   * reader is already looking at.
   *
   * It is the end of the range in view wherever the server could read that day,
   * which is what makes a chip over `Yesterday` describe yesterday's lineup
   * rather than the one set this morning. It falls back to today for the two
   * cases that leave the app on today's roster — a day ESPN wouldn't answer for,
   * and a tab or a server from before `endRoster` existed — and the null is what
   * keeps the wording honest in both: the title names the day the slot really
   * came from, never the day that was asked for.
   */
  day: string | null;
  /**
   * **Which** days of the range in view he was in the lineup on, and how many
   * days the range holds — null with no per-day lineups (an older tab, a failed
   * read), where the slot beside it is the whole of what is known.
   *
   * The days rather than a count of them, because two things read this now and
   * only one of them is counting: the chip's title says *3 of the 5 days in
   * view* and takes the length, and the projected table's `Starts` column has
   * to know *which* days, since its played half is the games he played on days
   * you started him (`SummaryTable.tsx::playedStarts`). One field carrying the
   * days is one fact; a count beside a list would be two that can disagree.
   *
   * The chip's letters and its color are still **one** day's — the last day of
   * the range — because that is what a slot *is*, and there is no honest way to
   * draw seven of them in one pill. Over a range that is not the whole truth:
   * the row beside it sums the days he was started, so a muted `BE` can sit
   * against four days of stats. The count is what makes the pair honest, and it
   * goes in the title rather than on the chip because this table's name column
   * is measured in stat columns pushed off a phone.
   */
  startedDays: string[] | null;
  rangeDays: number | null;
  /** ESPN's injury designation for him, raw — see `espnInjuryBadge`. It rides
   *  on this map rather than taking one of its own because it comes off the
   *  same roster read and reaches the same leaves. */
  injuryStatus: string | null;
  /**
   * Whose lineup this is, possessive (`The Homewreckers'`) — or **null for the
   * reader's own**, which every caller but one passes and which is what makes
   * the chip read `In your fantasy lineup` exactly as it always has.
   *
   * It exists because this map stopped being only the reader's team: the
   * League page's Matchup tab draws each manager's roster with the same table
   * and the same chip, and a pill saying *your* lineup over somebody else's
   * bench is a lie the reader has no way to catch — the same fault, one owner
   * along, that `day` was added to fix for a day.
   */
  owner?: string | null;
}

/**
 * Where each watched player sits on the user's fantasy roster **on the last day
 * of the range in view**, by the app's `${kind}-${id}` player key — or null when
 * the views are reading the saved watchlist, which is the state that renders no
 * slot at all.
 *
 * **Not the same set of players as `rosterKeys`**, and the difference is the
 * point rather than an accident: this is keyed on the roster as it stood that
 * day, so over `Yesterday` it holds the catcher you started and dropped this
 * morning and not the man you picked up in his place. "Is he on my team" is a
 * question about now and is answered off today's roster; see App's `rosterKeys`.
 *
 * A context for the reason `MutedContext` is one: the players who need it are
 * leaves, and they are scattered. The same chip belongs on the summary table's
 * name cell, on both kinds of player card and on every feed row, and threading
 * a map through the four views and their intermediate components — none of
 * which have any other interest in a fantasy league — is a lot of plumbing for
 * one badge.
 */
export const FantasyRosterContext = createContext<Map<string, FantasySlot> | null>(null);

export function useFantasySlot(key: string): FantasySlot | null {
  return useContext(FantasyRosterContext)?.get(key) ?? null;
}

/** The whole map, for a caller that asks about more than one player at a time —
 *  the summary table's `Starts` column, which needs every row's lineup days to
 *  total the column and to decide who sits above the `Total` divider. */
export function useFantasyRoster(): Map<string, FantasySlot> | null {
  return useContext(FantasyRosterContext);
}

/**
 * What the league has to say about each player **today** — his roster status
 * and where his club's game has him — by MLB player id, or null before the one
 * request that fills it has landed.
 *
 * A context for the reason the two above are: the research board's rows and the
 * details view's header are leaves, and what they want is one league-wide map
 * that neither of them should be fetching for itself. Keyed by id rather than
 * by the app's `${kind}-${id}` player key because it is the league's answer
 * about a *person*: a two-way player is batting third and starting on the mound
 * as one man, and the caller says which half it is drawing.
 */
export const PlayerStatusContext = createContext<Map<number, PlayerStatus> | null>(null);

export function usePlayerStatus(id: number): PlayerStatus | null {
  return useContext(PlayerStatusContext)?.get(id) ?? null;
}

/**
 * Where the connected ESPN league will let each player be started, by MLB id —
 * or null with no league, which is what makes every reader fall back to what
 * MLB knows on its own.
 *
 * A context for the reason the three above are: the summary table's identity
 * block is a leaf, and the two components between it and App — the per-kind
 * table and the row — have no interest in a fantasy league whatsoever. Keyed by
 * **id** rather than by the app's player key, exactly as `PlayerStatusContext`
 * is and for the same reason: ESPN's answer is about a person, and the caller
 * says which half of a two-way player it is drawing (`lib.ts::positionCell`
 * takes the kind).
 *
 * **Deliberately not `FantasyRosterContext`**, which is the obvious neighbor
 * and is the wrong vehicle: that map is null whenever the views are reading the
 * *saved* roster, where eligibility is a fact about the league and applies the
 * moment one is connected, whatever list is on screen. And deliberately not
 * threaded into the research board, which takes the same map as a prop from App
 * — it merges eligibility onto its rows to *filter* by it, which is a question
 * the table asks rather than the row, and a prop is what a table-level concern
 * should be.
 */
export const EligibilityContext = createContext<Map<number, string[]> | null>(null);

export function useEligible(id: number): string[] | null {
  return useContext(EligibilityContext)?.get(id) ?? null;
}

/**
 * Who in the league has news today or yesterday, by MLB id — or null before
 * the one request that fills it has landed, and for a reader whose page has
 * not asked for it.
 *
 * A context for the reason the three above are: the mark is drawn by leaves —
 * the summary table's name cell is three components below App, and the details
 * view's header is inside an overlay — and what they want is one league-wide
 * map that none of them should be fetching for itself. Keyed by **id** rather
 * than by the app's `${kind}-${id}` player key, exactly as the two above
 * are and for the same reason: news is a fact about a *person*, so a two-way
 * player has one entry where he has two of everything else — which is the same
 * decision `/api/players/:id/news` makes by taking no `?type=`.
 *
 * **Absent means no recent news**, not unknown: the server ships only the
 * players inside the window, the rule `/api/statuses` follows. A null *map*
 * is the unknown, and every reader draws nothing for it.
 */
export const RecentNewsContext = createContext<Map<number, RecentNews> | null>(null);

export function useRecentNews(id: number): RecentNews | null {
  return useContext(RecentNewsContext)?.get(id) ?? null;
}

/** Which side a man bats from and which arm he throws with, as MLB codes. */
export interface Handedness {
  bats: string | null;
  throws: string | null;
}

/**
 * Every player's handedness by MLB id, reduced from the season roster the app
 * already holds — or null before that one boot request has landed.
 *
 * A context for the reason the three above are: the token is drawn by leaves.
 * `PlayerIdentity` is the shared block on three tables and is several
 * components below App on each of them, and the research board draws its rows
 * inside a `map`, where a hook cannot be called at all — which is why the board
 * takes *eligibility* as a prop. Reading the map inside the block instead
 * answers both: the board's rows get it with no prop threaded, and the three
 * tables cannot come to disagree, since there is one lookup in one place.
 *
 * Keyed by **id** rather than by the `${kind}-${id}` player key, exactly as the
 * two above are: handedness is a fact about a *person*, so a two-way player has
 * one entry here where he has two of everything else, and the caller picks the
 * half it is drawing (`lib.ts::handCell`).
 *
 * **A null map and a missing id both draw nothing**, which is the same answer
 * and is the right one: the season roster is what would say, so before it lands
 * — and for a man it has never listed — the app has not been told.
 */
export const HandednessContext = createContext<Map<number, Handedness> | null>(null);

export function useHandedness(id: number): Handedness | null {
  return useContext(HandednessContext)?.get(id) ?? null;
}

/**
 * Returns a ref to attach to a collapsible element. When `expanded` flips from
 * false to true, the element scrolls to the top of the viewport (its own
 * scroll-margin-top clears the sticky nav). Only fires on the closed→open
 * transition — never on mount, on collapse, or on an unrelated re-render — so
 * expanding a card, a game, or an at-bat brings it into view without yanking
 * the page around otherwise.
 *
 * Every collapsible in the app scrolls this way — no per-caller alignment. An
 * earlier `block: 'nearest'` option existed for the feed's innings and made
 * them the one thing that moved differently from everything around it.
 */
export function useScrollIntoViewOnExpand<T extends HTMLElement>(expanded: boolean) {
  const ref = useRef<T>(null);
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    wasExpanded.current = expanded;
  }, [expanded]);
  return ref;
}

/**
 * Measures the pinned chrome and publishes its height as `--chrome-h` on the
 * document root, which `--scroll-offset` adds to its own breathing room.
 *
 * Everything in the app that scrolls something to the top of the viewport —
 * every collapsible via `useScrollIntoViewOnExpand`, a clip when it plays, a
 * player card jumped to from the summary table — lands it at `scroll-margin-top`
 * from the top of the *window*. That was the top of the page too until the
 * header, the search bar and the view bar were pinned there: now the top of the
 * window is behind the bar, so every one of those scrolls parks what it was
 * aiming at underneath it. The offset has to clear the bar as well.
 *
 * It is measured rather than declared because there is no one number to
 * declare: the bar wraps to two and three rows as the window narrows (115px on
 * a desktop, 303px at 320px wide), and it stands down altogether on the summary
 * and research views and under `max-height: 560px`, where the offset must go
 * back to the bare gap. So the height is whatever the element currently is, and
 * zero whenever it isn't actually pinned — read off the computed `position`,
 * which is the same answer the CSS gives rather than a second copy of the rules
 * that decide it.
 *
 * A `ResizeObserver` catches the wraps; the per-render pass catches everything a
 * resize can't see (a view swap that makes the bar static, an error banner
 * appearing above the fold). Both are layout effects, so the property is set
 * before the browser paints — and before any scroll a click has just triggered
 * reads it.
 *
 * Returns the same height as a ref, for the one scroll the app does by hand
 * (`scrollToPlayer`) rather than through `scroll-margin-top`.
 */
export function useStickyChromeOffset<T extends HTMLElement>(): [RefObject<T | null>, RefObject<number>] {
  const ref = useRef<T>(null);
  const height = useRef(0);
  const sync = useCallback(() => {
    const el = ref.current;
    const pinned = el && getComputedStyle(el).position === 'sticky';
    const h = pinned ? Math.round(el.getBoundingClientRect().height) : 0;
    if (h === height.current) return;
    height.current = h;
    document.documentElement.style.setProperty('--chrome-h', `${h}px`);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    // The window listener is not the observer's understudy — it catches the one
    // case the observer cannot see at all: a *shorter* window unpins the bar
    // (`max-height: 560px`) without changing its height by a pixel, so nothing
    // resizes and React never re-renders. A phone turned sideways would
    // otherwise keep clearing 159px of bar that is no longer there.
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [sync]);
  // No dependency list on purpose: the bar's height changes with things no
  // observer reports, and re-measuring is a rect read against one comparison.
  useLayoutEffect(sync);
  return [ref, height];
}

/**
 * Publish an element's height on `:root` as a custom property.
 *
 * The third of this file's measured-rather-than-declared heights, and the
 * plainest: `--chrome-h` has to read `position` off the computed style because
 * the bar it measures stands down on three views, and `--details-chrome-h`
 * writes onto an overlay rather than the root because two bars are pinned at
 * once. This one has neither problem — the date bar is drawn or it is not — so
 * it is the bare pattern: a `ResizeObserver` for a bar that wraps, a `resize`
 * listener for the widths at which its label changes shape, and a layout
 * effect on every render, all of which the two above already carry and for the
 * same reasons.
 *
 * **Zero when the element is gone**, set on the way out as well as on the way
 * in: the property is what the table's header row sticks below, and a stale
 * height there is a 54px band of nothing between the top of the pane and the
 * first column heading on every view that has no bar.
 */
export function usePublishedHeight(
  ref: RefObject<HTMLElement | null>,
  prop: string,
  enabled = true,
) {
  const sync = useCallback(() => {
    const el = enabled ? ref.current : null;
    const h = el ? Math.round(el.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty(prop, `${h}px`);
  }, [ref, prop, enabled]);
  useLayoutEffect(() => {
    const el = enabled ? ref.current : null;
    if (!el) {
      document.documentElement.style.setProperty(prop, '0px');
      return;
    }
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      document.documentElement.style.setProperty(prop, '0px');
    };
  }, [sync, enabled, prop, ref]);
  useLayoutEffect(sync);
}

/**
 * The same measurement one level down, for an overlay that pins a bar of its
 * own: measures `.details-chrome` and writes its height onto the overlay
 * element as `--details-chrome-h`, where the stylesheet turns it into that
 * subtree's own `--scroll-offset`.
 *
 * It cannot share the page's `--chrome-h`, and not because the number differs:
 * the two describe *different bars*. `--chrome-h` is the app's own pinned
 * chrome, which the overlay covers outright (41 against 50), so a box inside
 * here scrolled to the top of its scroller was clearing 115px of a bar nobody
 * can see while landing behind the one they can. Publishing it on the overlay
 * rather than on the document root is what keeps the two answers apart — a
 * custom property inherits, so the override reaches every descendant and stops
 * at the edge of the view.
 *
 * Measured rather than declared for the reason the page's is: the head is 139px
 * on a desktop and 193px on a phone, where it stacks into two rows, and neither
 * is a number a stylesheet can know — a two-line name, a present-or-absent
 * Rostered line and the width all move it. Zero whenever it isn't pinned, read
 * off the computed `position`, which is the same answer the CSS gives rather
 * than a second copy of the two rules that decide it (the Game Log's fixed
 * column, and a short window).
 *
 * The three triggers are that hook's three, for its three reasons: a
 * `ResizeObserver` for the head changing shape, a layout effect on every render
 * for the tab swap that makes it static, and a `resize` listener for a shorter
 * window unpinning it without changing its height by a pixel.
 */
export function useOverlayChromeOffset<T extends HTMLElement>(
  host: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const ref = useRef<T>(null);
  const height = useRef(0);
  const sync = useCallback(() => {
    const el = ref.current;
    const pinned = el && getComputedStyle(el).position === 'sticky';
    const h = pinned ? Math.round(el.getBoundingClientRect().height) : 0;
    if (h === height.current) return;
    height.current = h;
    host.current?.style.setProperty('--details-chrome-h', `${h}px`);
  }, [host]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [sync]);
  useLayoutEffect(sync);
  return ref;
}

/**
 * Freezes the page behind a full-screen overlay for as long as the caller is
 * mounted, then puts it back exactly where it was.
 *
 * The overlay (`.details-view`) is `position: fixed` with its own scroller, so
 * the document underneath stayed live: once the overlay hit its top or bottom
 * the scroll chained through to the window, and keyboard scrolling (space,
 * arrows, Page Down) never targeted the overlay at all because focus was still
 * on the card behind it. Either way the page drifted invisibly and closing the
 * overlay dumped the user somewhere they'd never scrolled to.
 *
 * `overflow: hidden` on the body alone doesn't hold on iOS Safari, so the body
 * is pinned with `position: fixed` and offset by the current scroll — the one
 * technique that stops touch scrolling everywhere. That offset is why the
 * scroll has to be restored by hand on unlock: pinning the body resets the
 * window to 0.
 */
export function useLockBodyScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const { body } = document;
    const y = window.scrollY;
    const prev = body.style.cssText;
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    return () => {
      body.style.cssText = prev;
      window.scrollTo(0, y);
    };
    // **The flag is a dependency and the hook is otherwise untouched.** It
    // exists for the one box in the app that is a *page* in one place and an
    // overlay in another — the matchup, which is a tab of its own and also a
    // page over the League view — and a page must not pin the document it is
    // part of. Every other caller passes nothing and gets what it always got.
  }, [enabled]);
}

/**
 * How many overlays are currently holding each element inert.
 *
 * A count rather than a flag, and the counting is what makes stacking work:
 * the Game Log's expanded box inside the player page holds `.app-chrome`
 * inert, and so does the player page itself, so collapsing the log must take
 * the hold to one rather than to none. Two dialogs deep, both hold `#root`.
 * Nothing in this app sets `inert` in markup, so a count of zero means the
 * attribute goes.
 */
const inertHolds = new WeakMap<Element, number>();

function holdInert(el: Element) {
  const n = inertHolds.get(el) ?? 0;
  inertHolds.set(el, n + 1);
  if (n === 0) el.setAttribute('inert', '');
}

function releaseInert(el: Element) {
  const n = inertHolds.get(el) ?? 0;
  if (n > 1) {
    inertHolds.set(el, n - 1);
    return;
  }
  inertHolds.delete(el);
  el.removeAttribute('inert');
}

/**
 * Make everything outside `box` inert — the walk this app's overlays need, run
 * once when one of them opens.
 *
 * **The bug this fixes is the plainest kind: the popups let you work the page
 * behind them.** `Modal` set `aria-modal="true"` and pinned the body, and that
 * was all — `aria-modal` is a hint to assistive technology and does nothing
 * whatever about the keyboard, so Tab walked straight out of every dialog into
 * whatever was underneath and Enter then pressed it. Measured on the live app
 * at 1200×900 with the research board's Columns picker open: **14 of 14 tab
 * stops landed outside the dialog** — the expand button, then the board's sort
 * headers one after another — and one press of Enter re-sorted the board behind
 * the dialog from Ros% to OPS. Fourteen more tabs reach the rows themselves,
 * where the stops are each row's headshot, its name link and its watchlist
 * star: Enter on those opens a player page *under* the dialog, or silently
 * stars somebody. Nothing was focused when a dialog opened either, so the first
 * Tab started from wherever focus happened to be, which for every one of these
 * is the control that opened it — outside the box, and one Tab from the page.
 *
 * **`inert` rather than a focus trap**, which is the modern answer and the
 * cheaper one: it takes the subtree out of the tab order, out of hit-testing
 * and out of the accessibility tree in one attribute, where a trap is a keydown
 * listener that has to know what is focusable and would be a second thing
 * reading Escape beside `answersEscape`. It also wraps Tab for free — with
 * everything else inert the only focusable things in the document are inside
 * the box, so the browser's own cycle is the trap.
 *
 * **The walk is siblings up the tree, not `#root`**, because "outside the
 * dialog" means a different set of nodes for each of the shapes this app has,
 * and only one rule gets all of them right. A `Modal` is portalled to the body,
 * so its siblings there are `#root` and any dialog below it — both of which go,
 * which is what makes the player page behind a Game Log popup inert while the
 * popup itself, being nobody's descendant, is untouched. The player page is a
 * child of `.app`, so its siblings are the pinned chrome and the view beside
 * it. The game log's full-page box is deeper still. Every one falls out of the
 * same loop rather than out of a list of cases.
 *
 * **A sibling that arrives later is marked too, and that is not a refinement —
 * it is the case this app hits most.** The first version captured the siblings
 * once, on the reasoning that in every stack here the box on top is the one that
 * mounted last, so whatever exists when the effect runs is what is behind it.
 * True of *overlays* and false of the page: a deep link like `?player=…` opens
 * the player page while the report is still in flight, so `.summary-view` does
 * not exist yet and `.app`'s children at that moment are the pinned chrome, the
 * float button and a loading block. Measured at 390×844 on exactly that link:
 * the chrome and the float button went inert, the summary table arrived a second
 * later, and **12 of 12 tab stops** then walked its headshots and name links
 * behind an open player page — the bug this whole hook is for, reintroduced by
 * the optimisation. So each parent on the path is watched (`childList`, not
 * subtree: four observers at the very deepest, firing only when children
 * actually change).
 *
 * **What is skipped is a box stacked *above* this one, and the test is the app's
 * own layer** (`layerOf`, which `overlayAbove` already reads for Escape) rather
 * than "is it an overlay". Two things forced that. `?player=…&help=1` mounts the
 * player page and the how-to page in **one commit**, so neither is "later" —
 * measured on that link, the player page's effect ran first and marked the
 * how-to page `inert`, leaving the keyboard trapped in the page *underneath* the
 * one on screen, with all 8 tab stops on the player page and none on the guide
 * covering it. And an "is it an overlay" test cannot be applied to the initial
 * pass at all: a `Modal` portalled to the body sees `#root`, which *contains*
 * every overlay in the app, so skipping it would inert nothing. A layer answers
 * both without a special case — `#root` declares no `z-index` and reads 0, the
 * how-to page reads 60 against the player page's 50 — and it is the same number
 * that decides which box answers Escape, so the two cannot come to disagree
 * about which of a pair is on top.
 *
 * **And the skip has to hold for a box that opens *later*, which is what the
 * registry beside this is for** — see the note on `BackgroundMark`. The sibling
 * test above can only answer for the stack as it stands when the walk runs, and
 * the app's commonest route puts the higher box *inside* something an older
 * mark is already holding: a `Modal` portalled to the body holds `#root`, and
 * the player page it opens renders inside it.
 */
export function useInertBackground(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    return markBackgroundInert(ref.current);
  }, [ref, active]);
}

/**
 * Every background mark in force, and the reason there is a registry at all:
 * **a mark has to answer to overlays that open after it.**
 *
 * The walk below runs once, when an overlay opens, and marks what is beside it
 * on the way up to the body. That is right for the stack as it stands and goes
 * wrong the moment a box opens *inside* something an older mark is holding —
 * which is not a corner of this app but one of its ordinary routes. The feed's
 * Upcoming row opens a `Modal` (46) portalled to the body, so that dialog's
 * only sibling to hold is `#root`; the pitcher's headshot inside it then opens
 * the player page (50), which renders **inside `#root`**. Measured on exactly
 * that path at 1200×900: `#root` still `inert`, `.details-view` reading
 * `insideInert: true`, `document.elementFromPoint` over its own tab strip
 * answering `BODY`, `document.activeElement` never leaving the body, and a
 * press on a tab doing nothing at all — the whole player page dead, on the one
 * route that opens it on a man nobody has rostered.
 *
 * The sibling test could not have caught it: `#root` is not the higher box, it
 * *contains* it, and it was held before that box existed. So the marks are
 * registered, each one recomputes what it should be holding rather than
 * remembering what it holds, and opening or closing any overlay re-runs the lot
 * (`syncMarks`). The holds are still counted, which is what lets two marks want
 * `#root` at once and the second release not undo the first.
 */
type BackgroundMark = { box: HTMLElement; held: Set<Element> };

const marks = new Set<BackgroundMark>();

/**
 * What `mark` should be holding inert as things stand: everything on either
 * side of its box's path to the body, less whatever a box stacked above it
 * needs left reachable.
 */
function backgroundOf(mark: BackgroundMark): Set<Element> {
  const want = new Set<Element>();
  const mine = layerOf(mark.box);
  const behindUs = (sib: Element) => {
    // Above us in the stack, so not behind us — see the note on the hook.
    if (layerOf(sib) > mine) return false;
    // Or it *contains* a box that is, which is the case a sibling test cannot
    // see and the one this app hits — see the note on `BackgroundMark`. Read
    // off the registry rather than off `OVERLAYS`, since the full-page table
    // box is a mark and is not one of those.
    for (const other of marks) {
      if (other === mark) continue;
      if (sib.contains(other.box) && layerOf(other.box) > mine) return false;
    }
    return true;
  };
  let node: Element | null = mark.box;
  while (node && node !== document.body) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    const onPath: Element = node;
    for (const sib of Array.from(parent.children)) {
      if (sib !== onPath && behindUs(sib)) want.add(sib);
    }
    node = parent;
  }
  return want;
}

/**
 * Bring one mark's holds level with what it should be holding. A diff rather
 * than a re-walk-and-hold, which is also what keeps the old "once per overlay"
 * rule: an element removed and re-added is held once, not twice and released
 * once, and would otherwise stay inert for the life of the page.
 */
function syncMark(mark: BackgroundMark) {
  const want = backgroundOf(mark);
  for (const el of mark.held) {
    if (want.has(el)) continue;
    mark.held.delete(el);
    releaseInert(el);
  }
  for (const el of want) {
    if (mark.held.has(el)) continue;
    mark.held.add(el);
    holdInert(el);
  }
}

function syncMarks() {
  for (const mark of marks) syncMark(mark);
}

/**
 * The walk itself. Returns its own release, so `useOverlayFocus` can order that
 * against giving focus back — and so the observers are disconnected by the same
 * call that drops the holds.
 */
function markBackgroundInert(box: HTMLElement | null): () => void {
  if (!box) return () => {};
  const mark: BackgroundMark = { box, held: new Set() };
  const watchers: MutationObserver[] = [];
  // Each parent on the path is watched, so a sibling that arrives later is
  // marked too — see the note on the hook. `childList`, not subtree: four
  // observers at the very deepest, firing only when children actually change,
  // and an `inert` attribute going on or off is not one of them.
  for (let node: Element | null = box; node && node !== document.body; node = node.parentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    const watcher = new MutationObserver(() => syncMark(mark));
    watcher.observe(parent, { childList: true });
    watchers.push(watcher);
  }
  marks.add(mark);
  // Every mark, not just this one: a box opening inside something an older mark
  // holds is precisely what that older mark now has to give up.
  syncMarks();
  return () => {
    for (const watcher of watchers) watcher.disconnect();
    marks.delete(mark);
    for (const el of mark.held) releaseInert(el);
    mark.held.clear();
    // ...and the marks still open take back what this one was making them skip.
    syncMarks();
  };
}

/**
 * What an overlay owes the keyboard: the background inert, focus landed inside
 * the box, and focus handed back to whatever opened it on the way out.
 *
 * The three are one effect rather than three because the **order** is the whole
 * of the correctness and effect order is the only thing that expresses it.
 * Going in: the opener is read *before* the background goes inert, since
 * marking an ancestor of the focused element inert blurs it to the body and the
 * chance to know where the reader came from is gone. Coming out: the background
 * is released *before* focus is handed back, because an element inside an inert
 * subtree cannot take focus and `focus()` on one is a silent no-op — the way
 * this would fail is a reader landing at the top of the document with nothing on
 * screen to say why.
 *
 * **`preventScroll` on both**, and for two different reasons. On the way in,
 * focusing the box must not scroll the page it is covering. On the way out,
 * `useLockBodyScroll` has already put the window back exactly where it was —
 * its cleanup runs first, being declared first in every caller — so a focus
 * that scrolled would be fighting it over a target that is already in view.
 *
 * **The box takes focus, not the first control in it.** A screen reader then
 * reads the dialog and its title rather than opening on whatever button
 * happened to be first, and the first Tab goes to that button anyway. Each
 * caller carries `tabIndex={-1}` on the element named here for that reason.
 */
export function useOverlayFocus(
  boxRef: RefObject<HTMLElement | null>,
  focusRef?: RefObject<HTMLElement | null>,
  /** Off for a box that is a *page* rather than an overlay — see
   *  `useLockBodyScroll`'s own flag, which is the same exception. Nothing
   *  outside such a box is background, so nothing outside it may be inerted. */
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const opener = document.activeElement as HTMLElement | null;
    const release = markBackgroundInert(boxRef.current);
    (focusRef?.current ?? boxRef.current)?.focus({ preventScroll: true });
    return () => {
      release();
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
    // Once per open. The refs are stable and the box is the box for the life of
    // the overlay; re-running would re-mark a background that has since gained
    // a box *above* this one. `enabled` is in the list because it decides
    // whether there is an open at all, and it does not change under a mounted
    // box — the matchup is a page or an overlay for its whole life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/**
 * How long a dismissal keeps waiting for the click it expects, when nothing
 * else has happened to say the gesture is over. A backstop rather than a
 * timing rule: a press that produces a click produces it in the same gesture,
 * and the *next* press disarms the guard regardless — see `swallowNextClick`.
 */
const CLICK_GRACE_MS = 700;

/**
 * Spend the click the gesture now in flight is still going to produce.
 *
 * `useDismissable` closes a popover on `pointerdown`, and a press has a second
 * half: `click` follows on the way up and lands on whatever is under the
 * pointer, which for a popover is a control that was visible and unobstructed
 * the whole time. So the dismissal alone is not the whole of what one press
 * did — measured, a press on the `Research` tab behind the open settings
 * popover dismissed it *and* changed the view.
 *
 * **Capture on `window`, which is what makes it reach everything.** React
 * attaches its own listeners to the root container, so a capture listener here
 * runs first and `stopPropagation` keeps the event from ever descending to
 * them; `preventDefault` is the other half, for the default actions no listener
 * is involved in — following a link above all.
 *
 * **It disarms three ways, and the three are not redundant.** The click it was
 * armed for takes it (the ordinary path); the *next* `pointerdown` takes it,
 * so a gesture that never produced a click — a drag, a scroll, a finger lifted
 * off the window — cannot leave a real press to be eaten a moment later; and a
 * timer takes it if neither ever comes. Note the `pointerdown` listener cannot
 * catch the press that armed it: that press is at `window` in the *bubble*
 * phase when this runs, and the capture phase at `window` is already behind it.
 */
function swallowNextClick() {
  let timer = 0;
  const disarm = () => {
    window.removeEventListener('click', kill, true);
    window.removeEventListener('pointerdown', disarm, true);
    window.clearTimeout(timer);
  };
  const kill = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    disarm();
  };
  window.addEventListener('click', kill, true);
  window.addEventListener('pointerdown', disarm, true);
  timer = window.setTimeout(disarm, CLICK_GRACE_MS);
}

/**
 * Close a popover on a press outside it or on Escape.
 *
 * The header has two of these — the settings gear and the fantasy button beside
 * it — and the Splits tab's key is a third, so they have to dismiss identically
 * or they read as three different kinds of control. `pointerdown` rather than
 * `click`, so a press that starts outside dismisses on the way down instead of
 * waiting for a mouse button that may come up somewhere else entirely.
 *
 * **And the press that dismisses does only that** (`swallowNextClick`), which
 * is the popover's half of the fault `Modal`'s backdrop was fixed for: one
 * press was doing two things, and the second of them was whatever happened to
 * be under the finger. Measured at 1200×900 with the settings popover open, a
 * single press on the `Research` tab behind it dismissed the popover **and
 * switched the whole app to the research board**. It is not the modal's
 * mechanism, and the difference is worth keeping straight. There the click
 * reached the page because the backdrop was *torn out* mid-gesture, so holding
 * that backdrop to the click was the whole fix and it was touch-only. Here
 * there is no backdrop to hold: the thing under the finger was never covered,
 * so the down and up targets are one element and the click lands on it under
 * every pointer there is. What has to go is the click itself.
 *
 * The reason it *should* go is that the popover was in the reader's way. A
 * press aimed past an open panel is aimed at getting rid of it; every other
 * dismissable surface in the app spends that press on the dismissal, and a
 * control that fires as a side effect of tidying up is one the reader never
 * chose. The cost is that a control behind an open popover takes two presses,
 * which is what a first press dismissing means and what every platform does.
 *
 * **Escape goes through `answersEscape` and is bound in the capture phase**, and
 * both halves were forced by the third caller: that popover opens **inside**
 * `.details-view`, which answers Escape itself. Bare, one press closed the
 * popover *and* the player page under it — two things undone by one key, which
 * is the exact fault `answersEscape` exists to prevent and which the header's
 * two callers never met, there being no overlay over the header to compete
 * with.
 *
 * Marking the press is what stops the page answering. **Capture** is what makes
 * the popover the one that answers first: the shared stacking test decides who
 * is topmost by reading declared `z-index`es off the `OVERLAYS` list, and a
 * popover is on none of them — it is not a page or a dialog, it is a panel
 * hanging off a button that happens to be inside one. Registration order would
 * otherwise decide it, and the overlay always registers first, being mounted
 * first. Capture precedes every bubble listener whatever the order, so "the
 * innermost thing goes first" holds by construction rather than by luck.
 *
 * A popover with an overlay genuinely **above** it still declines, `overlayAbove`
 * being consulted as ever: the header's menu sits at `z-index: 40` under a player
 * page at 50, so the page answers and the menu behind it does not — where before
 * they both did. And a popover inside that page is excluded from its own test by
 * containment, so it answers and the page waits for the next press.
 */
export function useDismissable(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      close();
      // This gesture has been spent on the dismissal — see the note above.
      swallowNextClick();
    };
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, ref.current)) close();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, ref, close]);
}

/**
 * The most a popover may be tall: whatever is left of the window below where it
 * starts. Published onto the element as `--popover-max-h`, which the stylesheet
 * turns into a `max-height` beside an `overflow-y: auto`.
 *
 * **The settings popover outgrew the window, which is what this is for.** It
 * hangs off the gear at `top: calc(100% + 8px)` with no cap at all, so its
 * height was simply the sum of what is in it — and the color-scheme picker at
 * the head of it is one row per theme. At four themes it was 329px; at six it
 * is **403px, with its foot at 461**, and measured across eight window sizes
 * that foot is 41px past the bottom of a 420px window, **71px past a phone held
 * sideways (844×390)** and 81px past a 380px one, with `How to use` unreachable
 * in every one of them. A menu that cannot be reached to the end is a menu with
 * entries nobody can press.
 *
 * **Measured rather than declared, for the reason `--chrome-h` is.** The cap is
 * the window less the popover's own distance from the top of it, and nothing in
 * CSS can read that: the popover is `position: absolute` inside the header, so
 * its offset is the header's geometry, which wraps to two and three rows as the
 * window narrows and which moves again the day anything is added to the brand
 * row. Measured, the anchor is at **58px in all eight states** — every width,
 * every view, sticky chrome or fixed-height column — so a constant would be
 * right today and silently wrong later, which is exactly the trap
 * `--research-pin-left` and `left: 63px` are on the record for.
 *
 * **Three triggers, each for something the others cannot see.** Opening is when
 * the element exists to be measured; `resize` is a window that changed under an
 * open menu (a phone turned sideways is the case this whole hook is about); and
 * a **capture-phase `scroll`** is the one that is easy to miss — under
 * `max-height: 560px` the app's chrome is deliberately *not* sticky, which is
 * precisely a short window, so scrolling there carries the anchor up the page
 * and the room below it grows. A scroll event does not bubble, hence capture.
 *
 * It cannot feed back on itself: capping a box's height does not move its top,
 * so the measurement is the same before and after it is applied.
 */
export function usePopoverFit(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  /**
   * **Which way the caller's CSS opens it.** A panel anchored by `bottom` grows
   * *upward*, so the room it has is what is above its own bottom edge — measure
   * it downward and the cap is a number about the wrong half of the window,
   * which lets it run off the top and out of reach.
   *
   * It is a flag rather than something read off the computed style, and
   * deliberately: `top` resolves to a used pixel value on an absolutely
   * positioned box whether or not the author wrote `auto`, so the stylesheet
   * cannot be interrogated for the answer. The two therefore have to agree by
   * hand, which is what this parameter is for saying out loud.
   */
  up = false,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      // The floor is for the degenerate case only — an anchor scrolled off the
      // bottom of the window would otherwise compute a negative height, which
      // is an invalid `max-height` and so no cap at all, i.e. the bug back
      // again. Below it the popover is off screen whatever it is told.
      //
      // Neither measurement can feed back on itself: the anchored edge is where
      // the caller's CSS puts it and does not move when the height it is being
      // told changes.
      const room = Math.max(
        POPOVER_MIN_H,
        up ? r.bottom - POPOVER_GUTTER : window.innerHeight - r.top - POPOVER_GUTTER,
      );
      el.style.setProperty('--popover-max-h', `${Math.round(room)}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    document.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      document.removeEventListener('scroll', sync, true);
    };
  }, [open, ref, up]);
}
/** Breathing room left under a capped popover, so it stops short of the edge
 *  rather than on it. */
const POPOVER_GUTTER = 12;
/** See the note in `usePopoverFit` — a floor for an anchor that is itself off
 *  screen, not a minimum anybody is meant to read a menu at. */
const POPOVER_MIN_H = 120;

/**
 * Give one element the whole browser page, and take it back.
 *
 * These tables are the app's widest things by some way — the research board
 * carries 44 columns — and they read out of a box a few hundred pixels tall
 * under a header, a tab row and a control bar. This is the button that says
 * "just show me the table": the app's own chrome goes and the table takes
 * everything the page has.
 *
 * **Deliberately not the Fullscreen API.** That takes the browser's chrome as
 * well, which is a bigger thing than was asked for and a worse one to be in by
 * accident — it swallows the tab strip and the address bar, needs a user
 * gesture, is refused outright by iPhone Safari for elements, and leaves the
 * page in a mode the browser rather than the app has to be asked to leave. A
 * fixed overlay covers everything this app draws, behaves the same everywhere,
 * and is undone by the same button that made it.
 *
 * Escape leaves, because a mode that fills the window should answer the key
 * that means "out of this" — but only while it is the thing on top. A player
 * page opened from an expanded table covers it (see `.is-expanded`'s z-index),
 * and one press of Escape must undo one thing: without the `overlayAbove` test
 * both listeners fire, so closing the player you just opened also collapsed the
 * table you opened him from.
 *
 * The returned `ref` goes on the box that takes the class, and is what makes
 * that test a question about *stacking* rather than "is any overlay open": the
 * game log's own expanded box lives **inside** `.details-view`, so an ancestor
 * overlay is behind it rather than above it and Escape is still its to answer.
 */
export function useFullPage<T extends HTMLElement = HTMLDivElement>() {
  const [isFull, setFull] = useState(false);
  const ref = useRef<T | null>(null);
  // The same background this box covers, taken out of the tab order while it is
  // covered — the rule every overlay in the app now follows. It is the mildest
  // of the cases and it is still the same one: the box holds a whole table, so
  // Tab has hundreds of stops to spend before it reaches the chrome behind
  // (measured, 0 of the first 10 escaped), but the pinned bar, the roster
  // search and the view tabs are all under there and all reachable in the end.
  //
  // **Focus is not moved and nothing is restored**, unlike `useOverlayFocus`,
  // and the reason is that this is a mode rather than a page: the button that
  // sets it is the table's own corner cell, so it is *inside* the box both
  // ways round and focus never had to leave. Taking the box's focus on expand
  // would only throw away the reader's place in the header row.
  useInertBackground(ref, isFull);
  useEffect(() => {
    if (!isFull) return;
    const onKey = (e: KeyboardEvent) => {
      if (answersEscape(e, ref.current)) setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFull]);
  const toggle = useCallback(() => setFull((v) => !v), []);
  return { isFull, toggle, ref };
}

/**
 * The app's fixed boxes that cover what is behind them. `.details-view` is
 * three of them — the player page, the how-to page and the ESPN settings page
 * all ride on it — `.reel-view` is the highlight reel, and **`.app-dialog`** is
 * every `Modal` in the app (the board's Columns picker, a pitcher's full
 * breakdown, a Game Log row's popup), which are panels rather than pages but sit
 * over what is behind them the same way and answer Escape the same way. Anything
 * listed here both consults this test and is seen by it, so one press of Escape
 * undoes exactly one of them.
 *
 * (It named `.research-columns-dialog` until now, which was the Columns
 * picker's class before the shell was extracted into `Modal` and the stylesheet
 * renamed its rules `.app-dialog-*`. A selector that matches nothing is a test
 * that quietly always passes, so the board's dialog and an expanded table were
 * both answering the one press.)
 *
 * **`.outing-view` is the one member whose layer is not fixed**, and it has to
 * be listed for both halves of that sentence above: it declines Escape while
 * its own inning dialog is over it, and — the half a page opened *from a
 * dialog* needs — the box underneath has to see it, or a player page at 50 with
 * an outing page at 51 over it answers the key and closes them both.
 */
const OVERLAYS ='.details-view, .reel-view, .mup-view, .outing-view, .app-dialog';

/**
 * The stacking layer an element sits on: the nearest ancestor's declared
 * `z-index`, or 0 if nothing on the way up declares one.
 */
function layerOf(el: Element | null): number {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const z = Number(getComputedStyle(n).zIndex);
    if (!Number.isNaN(z)) return z;
  }
  return 0;
}

/**
 * Is one of those overlays stacked **over** `box` rather than behind or around
 * it?
 *
 * Containment answers most of it — the game log's expanded box lives *inside*
 * `.details-view`, so its ancestor overlay is behind it and the key stays the
 * log's — but containment alone is not enough once a `Modal` is portalled to the
 * body from inside an overlay. That dialog is nobody's descendant, so every
 * open overlay looked like it was above it and it declined a key nothing else
 * was going to answer, while the player page under it happily closed on the
 * same press: one Escape, two things undone, and the wrong two.
 *
 * So a non-containing overlay only counts when it is genuinely **higher up the
 * stack**, which is a number the stylesheet already declares and this reads back
 * rather than restating (`layerOf`). Every pair in the app falls out of it: a
 * player page (50) over an expanded table (45) wins; a dialog opened from that
 * page (55) beats the page; the Columns dialog (46) beats an expanded board;
 * and the how-to page (60) beats a player page under it.
 */
export function overlayAbove(box: HTMLElement | null) {
  if (!box) return false;
  const mine = layerOf(box);
  return [...document.querySelectorAll(OVERLAYS)].some(
    (el) => !el.contains(box) && layerOf(el) > mine,
  );
}

/** Presses already answered — see `answersEscape`. A `WeakSet` so a key event
 *  is forgotten the moment the browser is done with it. */
const answered = new WeakSet<KeyboardEvent>();

/**
 * Does `box` answer *this* press of Escape? The one test every overlay in the
 * stack asks, and the whole of the app's "one press undoes one thing" rule.
 *
 * `overlayAbove` was that rule on its own, and it was **not enough** — the
 * ladder unwound whole on a single press, which was measured rather than
 * reasoned about. Instrumented with a capture listener and a bubble listener on
 * `window`, one keydown over a player page with a Game Log popup and a play's
 * detail open reads `dialogs=2 view=1` at the first listener and `dialogs=0
 * view=0` at the last: **the DOM changed in the middle of the dispatch.**
 *
 * The cause is a rule of the platform rather than of React. A microtask
 * checkpoint runs after *each* listener callback, not only at the end of the
 * event, and React schedules its sync flush in a microtask — so the topmost
 * dialog closing in listener *n* is gone from the DOM before listener *n+1*
 * runs, and `overlayAbove` then truthfully reports that nothing is above the
 * next box down. It closes, flushes, and the one below it inherits the same
 * false answer. Three things undone by one key, in the order the listeners
 * happened to be registered in — which is itself unstable, every re-render of a
 * `Modal` moving its listener to the end of the list.
 *
 * So the press itself is marked. `overlayAbove` still decides **who** answers —
 * the topmost, whatever order the handlers run in, since nothing has moved yet
 * when the first of them looks — and this decides **how many**: one. The two
 * are complementary rather than redundant, and either alone is wrong: without
 * the stacking test the first-registered box answers instead of the top one,
 * and without the mark every box under the top one answers as well.
 *
 * Callers with a further reason to decline — the player page, which leaves the
 * key to an expanded table inside itself — must test that **before** calling
 * this, or they claim a press they then decline to answer.
 */
export function answersEscape(e: KeyboardEvent, box: HTMLElement | null) {
  if (e.key !== 'Escape') return false;
  if (answered.has(e)) return false;
  if (overlayAbove(box)) return false;
  answered.add(e);
  return true;
}

/**
 * How long a read has to be in flight before the app admits to it.
 *
 * A warm server answers `/api/report` in about 16ms and a cached details tab in
 * not much more, which is one frame of a spinner — a wait that appears and
 * vanishes inside a tenth of a second reads as a flicker rather than as an
 * answer, and on a pane that then fills with rows it reads as the page
 * breaking. The report has held this floor since it was written; every block
 * wait in the app now takes it, so "nothing to show yet" and "nothing to show
 * yet *and it is taking a moment*" are two different states everywhere.
 *
 * It is the opposite end of the same argument as `MIN_SPIN`, and the two are
 * deliberately different numbers because they answer different questions.
 * `MIN_SPIN` is a *floor on how long a mark stays up* once a press has put it
 * there — a press that leaves no trace reads as a dead button, so a trace is
 * owed however fast the answer comes. This is a *delay before a mark goes up at
 * all*, for the waits nobody pressed a button to start.
 */
export const WAIT_DELAY = 250;

/**
 * `on`, but only once it has been true for `delay` — the guard that keeps a
 * fast answer from flashing a wait.
 *
 * Returns to false immediately when `on` does: the delay is on the way up
 * alone, since a wait that outstayed the thing it was waiting for would be the
 * flicker again with worse timing.
 */
export function useDelayedFlag(on: boolean, delay = WAIT_DELAY) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [on, delay]);
  return shown;
}
