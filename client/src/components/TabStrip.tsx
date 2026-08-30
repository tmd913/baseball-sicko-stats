import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

/** What one `deltaMode: 1` line is worth to a row that scrolls sideways — the
 *  app's own control height, since a "line" of one of these rows is a button. */
const WHEEL_LINE = 36;

/**
 * **Whether a scrolling row overflows, and which way there is more of it.**
 *
 * Lifted out of `TabStrip` when a second caller wanted the same three
 * questions answered — the app's tools row, which had been *hiding its
 * buttons' labels* below 640px to make them fit. Both are a row of controls
 * too wide for a phone, so both get the same answer rather than two rules that
 * agree today; `ScrollRow` below is the general one and `TabStrip` is the
 * tablist-shaped one.
 *
 * The caller owns the two refs and the markup. This owns only the measuring,
 * because the measuring is the part with the traps in it:
 *
 * - **A pixel of slack in each test.** These are fractional widths rounded
 *   into integer scroll positions, and a row that fits exactly must not draw
 *   an arrow for the 0.4px it is over by.
 * - **The layout effect has no dependency list**, for the reason the research
 *   board's pinned-column measurement has none: the *content* can change
 *   without the box doing so — a pitcher's page has an Arsenal tab and a
 *   batter's has not, and a roster row gains `Projected` only with a league
 *   connected — and a `ResizeObserver` on the box hears nothing when the
 *   content is what moved.
 * - **State, not a class written onto the DOM by hand**, because all three
 *   answers decide what is *rendered*.
 */
export function useOverflowArrows(
  boxRef: RefObject<HTMLDivElement | null>,
  wrapRef: RefObject<HTMLDivElement | null>,
  /** Anything else the caller wants measured off the same pass. */
  publish?: (box: HTMLElement, wrap: HTMLElement) => void,
  /**
   * **Whether a vertical wheel over this row moves it sideways** — true for a
   * control row, and false for anything the page is entitled to scroll over.
   * See the wheel effect below, which is the whole of what this switches.
   */
  claimsWheel = true,
) {
  const [state, setState] = useState({ over: false, left: false, right: false });
  const measure = useCallback(() => {
    const box = boxRef.current;
    const wrap = wrapRef.current;
    if (!box || !wrap) return;
    publish?.(box, wrap);
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
  }, [boxRef, wrapRef, publish]);

  /* **Measure on every render; observe once.** The two used to be one effect
     with no dependency list, which re-ran the whole body each render — so every
     render tore down a `ResizeObserver` and built another. That is cheap once
     and is not cheap four times a render on the research board, which draws
     four of these rows and re-renders on its own scroll. The measuring still
     has to happen every render (the *content* can change without the box
     doing so — a pitcher's page has an Arsenal tab and a batter's has not, and
     a `ResizeObserver` on the box hears nothing when the content moved), so
     that keeps its bare effect; the observer gets a stable one of its own.

     `measure` is a `useCallback` over three refs, so the observer's effect
     re-runs only if the caller passes a new `publish` — which none of them
     does after mount. */
  useLayoutEffect(() => {
    measure();
  });
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [boxRef, measure]);

  /**
   * **A wheel over a sideways row scrolls it sideways.**
   *
   * Reported against the board's control rows: *nothing happens when your
   * mouse is over them and you scroll*. That is the browser being literal
   * rather than a bug in the row — a mouse wheel is `deltaY`, this box has no
   * vertical overflow to spend it on, so the event goes to the nearest
   * ancestor that does, which on the research board is the pane holding six
   * hundred rows. The row a reader is pointing at never moves, and the only
   * ways along it are the arrows and a drag of a scrollbar the app hides
   * (`scrollbar-width: none`). A trackpad's sideways swipe already arrives as
   * `deltaX` and works today, which is why this was only ever reported by
   * somebody on a mouse.
   *
   * **`deltaY` only, and only when it is the bigger of the two.** A trackpad
   * gesture that is genuinely diagonal already has its horizontal half
   * applied by the browser, and adding the vertical half to it would move
   * this row at twice the speed of the finger.
   *
   * **And the page gets the wheel back at either end.** A row scrolled to its
   * last control that went on swallowing the wheel would be a 36px band the
   * page cannot be scrolled over — the `overscroll-behavior` rule stated as a
   * gesture. So the clamp is computed first and the event is only taken
   * (`preventDefault`) where this box actually has somewhere to go.
   *
   * **A native listener, not React's `onWheel`.** React binds wheel at the
   * root as **passive**, where `preventDefault` is a no-op and a console
   * warning — so the page would scroll *as well*, which is the whole of what
   * this is for.
   *
   * ### It is a control row's rule, and `claimsWheel` is where that is said
   *
   * **Every argument above is about a 36px band of buttons**: a row that has
   * nowhere of its own to spend a `deltaY`, whose only other way along it is a
   * pair of arrows, and over which the page loses nothing worth having. None of
   * that holds for a row that is a **carousel of tall cards** — there the band
   * is a third of the screen, the dots are already a way along it, and the page
   * under the reader's finger is exactly where a downward wheel belongs.
   *
   * **And on a snapping row it takes the gesture and then cannot even spend
   * it.** `box.scrollLeft = next` inside a `scroll-snap-type: x mandatory`
   * container is corrected to the nearest snap point on the same frame, so a
   * step shorter than half the card pitch lands back where it started. The
   * Overview's day carousel is one card per scrollport — a 398px pitch against
   * a wheel notch of 120 — so **no notch could ever move it**, and the
   * `preventDefault` above meant the page could not move either.
   *
   * Measured in a 430×900 window on 2026-08-29, pointer over the day cards:
   * six wheel-downs of 120 left `scrollY` at **0** and the row's `scrollLeft`
   * at **398**, unmoved — nothing on the page responded at all. Twenty pixels
   * higher, over the heading, the same event scrolled the page. Two of those
   * carousels are on the Overview at 370px each, so **740px of a 2,685px page
   * was dead to the wheel**. Reported as *"it sometimes sticks and doesn't let
   * me scroll"*, and the swipe row was the right suspect.
   */
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !claimsWheel) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = box.scrollWidth - box.clientWidth;
      if (max <= 1) return;
      /* `deltaMode` is pixels almost everywhere and lines on Firefox; a line is
         not a length this row knows, so it is spent as one control's worth of
         it — `--control-h`, the 36px square every button here is. */
      const step =
        e.deltaMode === 1
          ? e.deltaY * WHEEL_LINE
          : e.deltaMode === 2
            ? e.deltaY * box.clientWidth
            : e.deltaY;
      const next = Math.min(max, Math.max(0, box.scrollLeft + step));
      if (next === box.scrollLeft) return;
      e.preventDefault();
      box.scrollLeft = next;
      measure();
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [boxRef, measure, claimsWheel]);

  /** A press moves the row by most of a pane — enough to be a page rather than
   *  a nudge, and short of a whole one so the control at the edge stays on
   *  screen and the reader keeps their place. */
  const nudge = useCallback(
    (dir: -1 | 1) => {
      const box = boxRef.current;
      if (!box) return;
      box.scrollBy({ left: dir * box.clientWidth * 0.8, behavior: 'smooth' });
    },
    [boxRef],
  );

  return { state, measure, nudge };
}

/** The two arrows, which are the same object wherever a row scrolls. Drawn
 *  only while the row overflows; the one with nothing behind it is
 *  `visibility: hidden` rather than absent — *reserve the box, don't move the
 *  page*, and a hidden box does not hit-test, so the end a reader has reached
 *  is all control and no dead band. */
function ScrollArrow({
  dir,
  shown,
  label,
  onPress,
}: {
  dir: 'l' | 'r';
  shown: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={`tabstrip-arrow tabstrip-arrow-${dir}`}
      style={{ visibility: shown ? 'visible' : 'hidden' }}
      disabled={!shown}
      aria-label={label}
      onClick={onPress}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={dir === 'l' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );
}

/**
 * **A row of controls that scrolls only when it has to, and says which way.**
 *
 * This is the app's tools row on the Roster, the matchup page and the League
 * Rankings tab — `.view-tools` — and it exists because of what that row used
 * to do instead. Below 640px it **took its buttons' words away**: `Feed`,
 * `Schedule`, `Projected` and `Summary` were visually hidden and the buttons
 * became lone glyphs with a `title`, which is a tooltip no touch device will
 * ever show. A row of unlabeled icons on the one device that cannot hover is
 * the reading that was traded away, and the thing bought with it was a row
 * that did not wrap to a third line.
 *
 * **Scrolling buys the same line count without the trade.** The words stay at
 * every width and the row gives up only what is off the end — which the arrows
 * then say is there, and reach.
 *
 * **The inner box is `width: max-content; margin: 0 auto`,** and that is
 * load-bearing rather than tidy: `justify-content: center` on a scroller is
 * the standard way to lose the start of the content, because overflow goes
 * both ways and `scrollLeft` cannot go negative — the first control becomes
 * unreachable. An auto margin centers the row while it fits and collapses to
 * zero the moment it does not, which is the same behavior with a start you can
 * still scroll back to.
 *
 * The research board keeps its own `.view-tools` and does **not** take this:
 * its row is a different set of controls with its own measured head height,
 * and its two-character labels are the case the hiding rule was actually
 * written for.
 */
export function ScrollRow({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** What the row is, for the arrows' own labels. */
  label: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { state, measure, nudge } = useOverflowArrows(boxRef, wrapRef);
  return (
    <div ref={wrapRef} className={`tool-scroll${className ? ` ${className}` : ''}`}>
      {state.over && (
        <ScrollArrow dir="l" shown={state.left} label={`Scroll ${label} left`} onPress={() => nudge(-1)} />
      )}
      <div className="tool-scroll-box" ref={boxRef} onScroll={measure}>
        <div className="tool-scroll-inner">{children}</div>
      </div>
      {state.over && (
        <ScrollArrow dir="r" shown={state.right} label={`Scroll ${label} right`} onPress={() => nudge(1)} />
      )}
    </div>
  );
}

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
 * ### The strip runs edge to edge, and the arrows are drawn over its ends
 *
 * The wrapper takes its container's gutters back (`--table-bleed`), so the
 * scroll track reaches the glass rather than stopping in a strip of bare ground
 * — see `.details-tabstrip`. The arrows were the other half of the same inset:
 * laid out *beside* the strip they cost the tabs 60px of a 390px phone, 28 of
 * button and 2 of gap at each end, on the width where the strip is most
 * truncated to begin with. Measured at 390×844 on a batter, the pane was
 * 46 → 344 and is 0 → 390.
 *
 * Both arrows appear the moment the strip overflows and the one with nothing
 * behind it is `visibility: hidden` rather than absent — *reserve the box,
 * don't move the page*. A reader who scrolls to the last tab must not have the
 * strip shift under the finger that is about to press it, and an arrow that
 * appeared and disappeared at each end would do exactly that. Out of the flow
 * that holds by construction rather than by reservation, and a hidden box does
 * not hit-test, so the end a reader has reached is all tab and no dead band.
 * They are small aimed targets, so they keep their hover: the `(hover: hover)`
 * scoping is for full-width pressable surfaces, which these are the opposite
 * of.
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
  /* The tabs' own widths plus the gaps between them, published as the grow
     var — see the header for why this is not `scrollWidth`. It is the one
     thing this strip needs that a plain scroller does not, which is why it
     rides in as a callback rather than living in the hook. */
  const publish = useCallback((box: HTMLElement, wrap: HTMLElement) => {
    const tabs = Array.from(box.children) as HTMLElement[];
    const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
    const natural = tabs.reduce(
      (w, el, i) => w + el.getBoundingClientRect().width + (i ? gap : 0),
      0,
    );
    wrap.style.setProperty('--tabstrip-grow', `${Math.ceil(natural)}px`);
  }, []);
  const { state, measure, nudge } = useOverflowArrows(boxRef, wrapRef, publish);

  return (
    <div ref={wrapRef} className={`details-tabstrip${className ? ` ${className}` : ''}`}>
      {state.over && (
        <ScrollArrow dir="l" shown={state.left} label={`Scroll ${label} left`} onPress={() => nudge(-1)} />
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
        <ScrollArrow dir="r" shown={state.right} label={`Scroll ${label} right`} onPress={() => nudge(1)} />
      )}
    </div>
  );
}
