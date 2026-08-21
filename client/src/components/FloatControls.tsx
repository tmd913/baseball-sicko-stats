import { useCallback, useEffect, useState, type RefObject } from 'react';
import { BackButton } from './BackButton';

/**
 * **The way out and the way back up, from wherever you have got to** — shared by
 * every full-screen view long enough that its own head scrolls away.
 *
 * It was written for the how-to page and lived inside it, which was right while
 * one view had it. The Fantasy league settings page is the same object: the same
 * `.details-view` shell, the same `.tut-head` with a `Back` in it, the same own
 * scroller, and long enough that a reader down among the cookie instructions has
 * that `Back` a screenful above him and the `Connect league` button below.
 * Copying the pair across would have been two implementations that agree today —
 * so it moved here whole, and both views import it. Nothing about it changed in
 * the move except the names of the two custom properties, which are no longer
 * one page's (`--tut-float-*` → `--float-pair-*`).
 */

/**
 * Has the view's own head gone off the top?
 *
 * **The threshold is the head's own height, and it is observed rather than
 * declared** — the rule this repo applies wherever a number is a function of
 * width or of a font the app does not choose (`--chrome-h`, `--clip-w`). On the
 * how-to page that head is a `clamp(22px, 5vw, 30px)` title over a lede that
 * wraps, so it is **242px at 390 wide and 203px at 1440** — driven, and the pair
 * reveals at a `scrollTop` of 243 and 204 respectively, which is that height and
 * the pixel that clears it. A threshold typed in as a round 200 would fire 42px
 * late on the phone and 3px early on the desktop.
 *
 * **And it is the reason this generalizes at all.** The two views' heads are
 * different heights — the league page's lede is longer, so its head is 314px at
 * 390 against the guide's 242 — and neither number appears anywhere. Each view
 * hands over its own head and gets its own boundary.
 *
 * Before that moment the head's own `Back` is on screen and `Top` would point at
 * where you already are; after it, neither is true. One boundary, and it answers
 * for both buttons.
 *
 * An `IntersectionObserver` rather than a scroll handler: the browser reports
 * the crossing once instead of the app asking on every frame of a long read.
 */
export function useHeadGone(
  headRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const head = headRef.current;
    if (!root || !head) return;
    const io = new IntersectionObserver(([e]) => setGone(!e.isIntersecting), {
      root,
      threshold: 0,
    });
    io.observe(head);
    return () => io.disconnect();
  }, [headRef, rootRef]);
  return gone;
}

/**
 * The floating pair's geometry, written onto the view so the page can **reserve
 * the room at its foot** rather than let two fixed buttons sit on the last thing
 * there is to read. They are fixed to the viewport, so the only place they can
 * cover anything is the bottom of the last screenful — which on both views is a
 * button: the guide's `Got it`, the league page's `Connect league`.
 *
 * Measured at 390 with the flat 64px both views carried: the guide's pill
 * overlapped `Got it` by 6.08px, and the two overlap horizontally as well (the
 * pill runs 24 → 113.47 and the button 81.75 → 308.23). With the reserve it
 * clears by 23.92px, and by 24.23 at 1440, where the two never meet sideways in
 * the first place.
 *
 * **Read off the button rather than repeated from the stylesheet**, which is the
 * point: `.float-btn` declares the 46px height and the 24px inset, and a
 * `calc()` naming those numbers again would be two rules that agree today.
 * `offsetHeight` and the computed `bottom` of the box actually on screen cannot
 * fall out of step with the rule that sizes it.
 */
export function useFloatHeight(
  viewRef: RefObject<HTMLElement | null>,
  boxRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const view = viewRef.current;
    const box = boxRef.current;
    if (!view || !box) return;
    const write = () => {
      view.style.setProperty('--float-pair-h', `${box.offsetHeight}px`);
      view.style.setProperty('--float-pair-inset', getComputedStyle(box).bottom);
    };
    write();
    const ro = new ResizeObserver(write);
    ro.observe(box);
    return () => ro.disconnect();
  }, [viewRef, boxRef]);
}

/**
 * Back to the head of the given scroller.
 *
 * The pair goes `visibility: hidden` the moment the head is on screen again, and
 * a focused element that is hidden under the reader's own press drops focus to
 * the document body — so the press hands it to the view instead, which is where
 * a Tab from the top of the page should start anyway. `preventScroll` because
 * the view *is* the scroller and focusing it must not undo the scroll just asked
 * for.
 */
export function useScrollToTop(scrollRef: RefObject<HTMLElement | null>) {
  return useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    const held = document.activeElement;
    if (held instanceof HTMLElement && held.matches('.float-btn')) {
      scrollRef.current?.focus({ preventScroll: true });
    }
  }, [scrollRef]);
}

/**
 * **Both of these are shapes the app already had, in the corners it already
 * floats things in.** `.float-btn` is the round 46px button in the bottom right,
 * `.back-to-top` is its `↑`, and `.back-nav` is the pill in the bottom left at
 * the same 24px inset — written for a jump-back button the how-to page's own
 * rewrite removed, and after that a class with no user at all. Nothing new is
 * drawn here: the ground, the lift, the fade, the reduced-motion clause and the
 * hover are `.float-btn`'s, and the `Back` is `BackButton` under a different
 * class rather than a second copy of its chevron.
 *
 * Two buttons in opposite corners rather than one stacked cluster, because that
 * is what those two classes are and what the app's other floating pair (the
 * `Updating` badge in the left corner, `back-to-top` in the right) already looks
 * like.
 *
 * **Nothing insets them from a phone's home indicator, and nothing needs to.**
 * `client/index.html` deliberately leaves `viewport-fit` off, so iOS lays the
 * web view out *inside* the safe area; `styles.css` has no `env(safe-area-inset-*)`
 * anywhere for that reason, and `.float-btn`'s plain `bottom: 24px` has been the
 * app's answer on every other view. See `docs/claude/espn-connection.md`.
 *
 * **No `history.back()`.** The app writes its view state with
 * `history.replaceState` (`App.tsx`), so neither `help=1` nor the settings menu's
 * league page leaves an entry to return to — measured on the guide,
 * `history.length` is 2 both before and after opening, and a press would take the
 * reader out of the app entirely. This calls the same `onClose` the head's
 * `Back`, the view's own closing button and Escape all call.
 */
export function FloatControls({
  shown,
  backRef,
  onTop,
  onClose,
}: {
  shown: boolean;
  backRef: RefObject<HTMLButtonElement | null>;
  onTop: () => void;
  onClose: () => void;
}) {
  const on = shown ? ' visible' : '';
  return (
    <>
      <BackButton onClose={onClose} className={`float-btn back-nav${on}`} ref={backRef} />
      <button
        type="button"
        className={`float-btn back-to-top${on}`}
        onClick={onTop}
        aria-label="Back to top"
        title="Back to top"
      >
        ↑
      </button>
    </>
  );
}
