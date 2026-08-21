import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

/**
 * **A row of tabs that scrolls only when it has to, and says which way.**
 *
 * The player page's nine tabs and the outing page's four are one control drawn
 * twice, so this is one component drawn twice rather than a rule copied. Two
 * things were wrong with the strip before it:
 *
 * - **It scrolled at every width.** `.details-tabs` was capped at the reading
 *   column's 680px, so a strip whose nine labels come to 781px was a scroller
 *   on a 1,920px monitor with 1,100px of empty page either side of it. The cap
 *   is a *column for cards*, and a control is not a card.
 * - **Nothing said there was more of it.** The scrollbar is hidden
 *   (`scrollbar-width: none`, deliberately — see the stylesheet), so the only
 *   hint that `Charts` existed was the half-tab peeking at the edge, and that
 *   is only there when the strip happens to be scrolled to a place where a tab
 *   straddles the edge.
 *
 * ### The width is measured, not declared
 *
 * Whether the tabs fit is a function of the viewport, of the labels (a pitcher
 * has an Arsenal tab and a batter does not) and of **a font this app does not
 * choose** — three things no breakpoint can know. So the natural width is read
 * off the rendered tabs and published as `--tabstrip-grow`, and the stylesheet
 * takes `max-width: max(<the column>, var(--tabstrip-grow))`: the strip grows to
 * its content where the page has room and is capped by its parent where it has
 * not. That is `--chrome-h`, `--clip-w` and `--research-head-h`'s own rule, and
 * the alternative — a media query at whatever width the labels happened to
 * overflow on the machine this was written on — is the fault those three exist
 * to record.
 *
 * **It sums the tabs rather than reading `scrollWidth`**, and the difference is
 * not academic. `scrollWidth` is the *box's* width once the content fits inside
 * it, so a strip that had grown to 781px for a pitcher would go on reporting
 * 781 for a batter whose eight tabs come to 700 — a measurement that can only
 * ever ratchet upwards, leaving a centered strip 80px off center. The children
 * are `flex: none` and `white-space: nowrap`, so their own widths are
 * independent of the box, which makes the sum the one figure that is stable
 * under what it is used to set.
 *
 * ### The arrows are laid out before they are shown
 *
 * Both are in the flow the moment the strip overflows, and the one with nothing
 * behind it is `visibility: hidden` rather than absent — *reserve the box,
 * don't move the page*. A reader who scrolls to the last tab must not have the
 * strip shift 28px under the finger that is about to press it, and an arrow
 * that appears and disappears at each end would do exactly that. They are small
 * aimed targets, so they keep their hover: the `(hover: hover)` scoping is for
 * full-width pressable surfaces, which these are the opposite of.
 */
export function TabStrip({
  children,
  label,
  paneRef,
  className,
}: {
  /** The tabs themselves — `role="tab"` buttons. */
  children: ReactNode;
  /** What the tablist is a list of, for a screen reader. */
  label: string;
  /** The scrolling pane, handed back to the caller that needs it — the player
   *  page scrolls its active tab into view on every tab change. */
  paneRef?: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Whether the strip overflows, and — when it does — whether there is
   *  anything left in each direction. Held in state rather than written onto
   *  the DOM by hand because both decide what is rendered. */
  const [state, setState] = useState({ over: false, left: false, right: false });

  const measure = useCallback(() => {
    const box = boxRef.current;
    const wrap = wrapRef.current;
    if (!box || !wrap) return;
    // The tabs' own widths plus the gaps between them — see the header for why
    // this is not `scrollWidth`.
    const tabs = Array.from(box.children) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
    const natural = tabs.reduce(
      (w, el, i) => w + el.getBoundingClientRect().width + (i ? gap : 0),
      0,
    );
    wrap.style.setProperty('--tabstrip-grow', `${Math.ceil(natural)}px`);
    // A pixel of slack in each test: these are fractional widths rounded into
    // integer scroll positions, and a strip that fits exactly must not draw an
    // arrow for the 0.4px it is over by.
    const max = box.scrollWidth - box.clientWidth;
    setState((s) => {
      const next = {
        over: max > 1,
        left: box.scrollLeft > 1,
        right: box.scrollLeft < max - 1,
      };
      return s.over === next.over && s.left === next.left && s.right === next.right
        ? s
        : next;
    });
  }, []);

  // Every render, and on any resize of the strip. No dependency list on the
  // layout effect for the reason the research board's pinned-column measurement
  // has none: the labels can change without the box doing so — a pitcher's page
  // has an Arsenal tab and a batter's has not — and a `ResizeObserver` on the
  // box hears nothing when the *content* is what moved.
  useLayoutEffect(() => {
    measure();
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  });

  /** A press moves the strip by most of a pane — enough to be a page rather
   *  than a nudge, and short of a whole one so that the tab at the edge stays
   *  on screen and the reader keeps their place. */
  const nudge = (dir: -1 | 1) => {
    const box = boxRef.current;
    if (!box) return;
    box.scrollBy({ left: dir * box.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div ref={wrapRef} className={`details-tabstrip${className ? ` ${className}` : ''}`}>
      {state.over && (
        <button
          type="button"
          className="tabstrip-arrow"
          style={{ visibility: state.left ? 'visible' : 'hidden' }}
          disabled={!state.left}
          aria-label={`Scroll ${label} left`}
          onClick={() => nudge(-1)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      <div
        className="details-tabs"
        role="tablist"
        aria-label={label}
        ref={(el) => {
          boxRef.current = el;
          if (paneRef) paneRef.current = el;
        }}
        onScroll={measure}
      >
        {children}
      </div>
      {state.over && (
        <button
          type="button"
          className="tabstrip-arrow"
          style={{ visibility: state.right ? 'visible' : 'hidden' }}
          disabled={!state.right}
          aria-label={`Scroll ${label} right`}
          onClick={() => nudge(1)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
