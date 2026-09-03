import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { answersEscape, useLockBodyScroll, useOverlayChromeOffset, useOverlayFocus } from '../hooks';
import { BackButton } from './BackButton';
import { DialogLayerContext, OVERLAY_LAYER } from './Modal';
import { TabStrip } from './TabStrip';

/**
 * **The full-screen page every details view is drawn on** — the box, its pinned
 * chrome, the tab strip inside that chrome, and the four behaviors a page over
 * the app owes the reader.
 *
 * It was `PlayerDetails`' own opening and closing markup for as long as there
 * was one such page. A **team** page is the second, and it wants every one of
 * these and not a line of what is between them: the same fixed box at the same
 * layer, the same measured chrome height, the same back button in the same
 * corner, the same tab strip that scrolls its selection into view, the same
 * scroll reset on a tab change and the same Escape.
 *
 * So it is extracted rather than copied, which is the rule this codebase
 * applies to `Modal`, to `OpponentSection` and to every folded selector list in
 * the stylesheet: **two pages that merely resemble each other are two pages
 * that will one day differ.** Every fault recorded below was found once, on the
 * player page, and a second copy of this markup is a second place to find them
 * again.
 *
 * What it deliberately does *not* own is anything about *what* is being read.
 * There is no player id here, no kind, no notion of a report — the head is a
 * node the caller builds and the tabs are buttons the caller writes. A shell
 * that knew it was usually about a player would be a shell the team page had to
 * work around.
 */
export function DetailsShell({
  tab,
  resetKey,
  onClose,
  head,
  tabsLabel,
  chromeExtra,
  tabs,
  className,
  initialScroll,
  children,
}: {
  /**
   * Which tab is showing — read for two things and stored for none: the scroll
   * reset below, and the strip's own scroll-into-view. The **key** rather than
   * an index, the rule `DetailsTab` states: nothing here stores a position, so
   * reordering a strip stays a one-place change in the caller.
   */
  tab: string;
  /**
   * **What makes this a different page rather than a different reading of the
   * same one** — a player key on one caller, a club's id on the other.
   *
   * It joins `tab` in the scroll reset, and it is a **guard rather than a fix**:
   * a new subject unmounts the body anyway, which collapses the box and leaves
   * the browser to clamp the offset to 0 on its own. Measured on the player
   * page at 390×844 either way — scrolled to 149 on a batter, the pitcher's
   * page opens at 0 with or without it. It is here so the property holds by
   * construction rather than by an accident of what another effect clears.
   */
  resetKey: string | number;
  onClose: () => void;
  /** Whatever names the subject, drawn beside the back button. */
  head: ReactNode;
  /** What the tablist is a list of, for a screen reader. */
  tabsLabel: string;
  /**
   * Anything else pinned between the head and the strip. Both callers have one
   * and it is the same control — which half of this subject am I reading — and
   * it is neither identity (it is a control) nor a tab of this page (it changes
   * the *subject*, where a tab is a reading of one), so it sits on a row of its
   * own inside the same pinned box.
   *
   * This said the player's half "navigates to another page", which it did, and
   * it put a step on `App`'s route stack for it — see `PlayerDetails`, where the
   * report that took the step back out is written down. It changes `player=`
   * and nothing else now, so neither caller's switch is a page opened over the
   * page and `Back` means the same thing on both.
   */
  chromeExtra?: ReactNode;
  /** The `role="tab"` buttons themselves. */
  tabs: ReactNode;
  /** A modifier on the view box — the game log's fixed-height column. */
  className?: string;
  /**
   * **Where this page was left**, for a page the reader is coming *back* to.
   *
   * The three pages are exclusive and one at a time, so a step back through
   * `App`'s route stack unmounts and remounts rather than uncovering — which
   * throws away the scroll along with everything else. `App` reads the offset
   * at the moment a door is pressed and hands it back here, so a reader who was
   * forty plays down a game, pressed a name, and came back is where they were.
   *
   * **Only on the mount that restores it**, which the ref below is for: a tab
   * change is still a reset (a tab is a different reading of the subject, not a
   * place in one), and so is a different subject.
   */
  initialScroll?: number;
  children: ReactNode;
}) {
  // This view covers the page but scrolls in its own box, so the list behind it
  // has to be frozen — otherwise the scroll chains straight through and closing
  // the view lands somewhere the user never scrolled to.
  useLockBodyScroll();

  // Five tabs overflow a phone, so the selected one can sit off the end of the
  // strip — cut in half, or out of sight entirely. Scrolled by hand rather than
  // with `scrollIntoView`, which walks up every scrollable ancestor and would
  // drag the overlay's own scroller with it.
  const tabsRef = useRef<HTMLDivElement | null>(null);
  // The overlay itself: read to ask whether something inside it has taken the
  // page (see the Escape handler below), scrolled back to the top on a tab
  // change (below that), and written to by the offset hook, which publishes the
  // pinned head's height on it for everything inside to clear.
  const viewRef = useRef<HTMLDivElement | null>(null);
  // The keyboard's half of covering the page. These overlays open from a
  // headshot, a cap logo, a name or a board row, and Tab used to walk from that
  // control straight along the table it was in — measured before the fix, 12 of
  // 12 tab stops behind the player page — so a reader could work the roster
  // underneath a page they had opened. Closing hands focus back to the row they
  // pressed. See `hooks.ts::useOverlayFocus`.
  useOverlayFocus(viewRef);
  const chromeRef = useOverlayChromeOffset<HTMLDivElement>(viewRef);

  // Switching tab puts the view back at the top. That came with the pinned head
  // and is the same rule the research board's own reset follows: the tabs were
  // at the top of the page, so getting to one meant scrolling back up first and
  // a reset came free with having to go there. Reachable from anywhere, they can
  // now be pressed from 1,700px down a percentile card — and what the next tab
  // has at that offset is somebody else's rows, or nothing at all. A tab is a
  // different reading of the subject, not a place in one.
  /**
   * **Which page-and-tab this effect last ran for**, so that the run which is a
   * *mount* can be told from the run which is a **change**.
   *
   * The obvious spelling — a `firstRun` flag spent on the way out — is the trap
   * `RULES.md` names and this codebase has found four times: React StrictMode
   * runs a mount's effects, tears them down and runs them again, so the second
   * pass sees the flag already spent and takes the change branch. Measured
   * before this: a page restored to 5,000px was put straight back to 0 by its
   * own second mount pass.
   *
   * Testing the value we already hold has no such second face. `null` is the
   * mount, an equal key is StrictMode running it again, and a different one is
   * the reader changing tab.
   */
  const lastReset = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!viewRef.current) return;
    const key = `${resetKey}\u0000${tab}`;
    // A mount takes the offset the caller was left at, where there is one;
    // a tab change and a new subject are the reset this effect has always been.
    viewRef.current.scrollTop = lastReset.current === null || lastReset.current === key
      ? initialScroll ?? 0
      : 0;
    lastReset.current = key;
    // `initialScroll` is deliberately not a dependency: it is read once, at
    // mount, and a caller that recomputed it would otherwise yank the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, resetKey]);

  useLayoutEffect(() => {
    const row = tabsRef.current;
    const el = row?.querySelector<HTMLElement>('.details-tab.is-active');
    if (!row || !el) return;
    const left = el.offsetLeft - row.offsetLeft;
    const overLeft = left - row.scrollLeft;
    const overRight = left + el.offsetWidth - (row.scrollLeft + row.clientWidth);
    // Land it clear of the edge rather than flush against it, which reads as
    // cut off and hides that there is more strip to swipe to — and clear of the
    // *arrow*, which since the strip went edge to edge is drawn over that end
    // rather than beside it, so a 24px peek left the tab it just chose half
    // under a chevron. The width is read off the wrapper's own
    // `--tabstrip-arrow-w` rather than copied here as a second 44 that would
    // have to agree with the stylesheet's. It costs nothing at the two ends: an
    // arrow there is hidden because there is nothing left to scroll, and the
    // larger peek clamps against the same 0 or maximum it always did.
    const arrowW = parseFloat(getComputedStyle(row).getPropertyValue('--tabstrip-arrow-w'));
    const PEEK = Number.isFinite(arrowW) && arrowW > 0 ? arrowW : 24;
    if (overLeft < 0) row.scrollLeft += overLeft - PEEK;
    else if (overRight > 0) row.scrollLeft += overRight + PEEK;
  }, [tab]);

  // Close on Escape, matching a modal/back affordance — unless something is on
  // top of this view, in which case the key is that thing's to answer. Two
  // shapes of "on top" and they need different tests. A **descendant** that has
  // taken the page is a full-page table box, which lives inside this overlay and
  // so is found by reading our own subtree (`hooks.ts::useFullPage` declines the
  // key from the other side, when *this* view is the one above). A **portalled**
  // one is a `Modal` opened from in here — a Game Log row's per-game popup —
  // which is nobody's descendant and is caught by the shared stacking test
  // instead. One press, one thing undone, either way round.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Before the claim, not after: a box that declines the key must not have
      // taken the press with it (see `answersEscape`).
      if (viewRef.current?.querySelector('.is-expanded')) return;
      if (!answersEscape(e, viewRef.current)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // The provider declares this box's own layer for anything opened from
    // inside it — a Game Log's per-game popup, say, which is portalled to the
    // body and so has no other way of knowing it must clear a page at 50. See
    // `Modal.tsx::DialogLayerContext`.
    <DialogLayerContext.Provider value={OVERLAY_LAYER}>
      <div
        ref={viewRef}
        tabIndex={-1}
        className={`details-view${className ? ` ${className}` : ''}`}
      >
        {/* The head and the tabs are one pinned box, held at the top of this
            overlay's own scroller — see `.details-chrome`. They are one
            statement of who is being read and which reading of them, which is
            the argument `.app-chrome` makes a level up for the header, the
            search and the view bar. */}
        <div className="details-chrome" ref={chromeRef}>
          <div className="details-head">
            <BackButton onClose={onClose} />
            {head}
          </div>
          {chromeExtra}
          <TabStrip label={tabsLabel} paneRef={tabsRef}>
            {tabs}
          </TabStrip>
        </div>
        {children}
      </div>
    </DialogLayerContext.Provider>
  );
}

/**
 * One tab button, which was written out longhand nine times on the player page
 * and would have been five more on the team page.
 *
 * The strip is a row of buttons rather than a `map` over a table for a reason
 * the player page states — the order is the order they are *written* in, and
 * each carries its own paragraph about why it sits where it does — and this
 * changes none of that. What it takes away is the four lines of `role`,
 * `aria-selected` and the two class expressions that were identical on every
 * one of them, and with them the chance of a strip where one tab is missing its
 * `aria-selected` and reads to a screen reader as a plain button.
 */
export function DetailsTabButton<T extends string>({
  id,
  tab,
  onPick,
  children,
}: {
  /** This button's own tab key. */
  id: T;
  /** The tab showing now. */
  tab: T;
  onPick: (tab: T) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`details-tab${tab === id ? ' is-active' : ''}`}
      onClick={() => onPick(id)}
    >
      {children}
    </button>
  );
}
