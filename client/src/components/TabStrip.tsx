import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode, RefObject } from 'react';
import { useTabSlider } from './TabSlider';

/** What one `deltaMode: 1` line is worth to a row that scrolls sideways — the
 *  app's own control height, since a "line" of one of these rows is a button. */

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
   * **A vertical wheel over one of these rows scrolls the page, and used to
   * scroll the row sideways.**
   *
   * The rule that stood here was reported into existence and reported out of
   * it, and both reports are worth keeping because the second is not a reversal
   * of the first so much as a correction of what the first was actually about.
   *
   * **What it was:** a native, non-passive `wheel` listener turning `deltaY`
   * into horizontal travel, `preventDefault`ing where the box had somewhere to
   * go. It answered *"nothing happens when your mouse is over them and you
   * scroll"* — true, and the browser being literal rather than the row being
   * wrong: a `deltaY` over a box with no vertical overflow goes to the nearest
   * ancestor that has some, which on the research board is the pane holding six
   * hundred rows.
   *
   * **Why it is gone:** *"now when I scroll vertically on tabs that can scroll
   * horizontally, it scrolls horizontally instead."* A reader scrolling down
   * over the player page's nine tabs got the tabs and not the page — measured
   * at 390 on 2026-08-29, four wheel-downs took `.details-tabs` `scrollLeft`
   * **0 → 240** with the pane at **0** throughout, and the same wheel fifty
   * pixels lower took the pane **0 → 240**. A tab strip crossing the whole
   * width of the page is a band a reader has to scroll *past*, and taking their
   * gesture to move something they were not looking at is the same fault the
   * Overview's carousel had, one row thinner. The Overview declined this
   * listener when that was found; this is the rest of the answer.
   *
   * **What stops the first report coming back, measured rather than assumed.**
   * Checked on the player page's tab strip at 390 (`scrollWidth − clientWidth`
   * = 356), after the removal:
   *
   * | | `.details-tabs` `scrollLeft` |
   * | --- | --- |
   * | one press of the right arrow | 0 → **312** |
   * | a trackpad's sideways `deltaX: 150` | 0 → **150** |
   * | a vertical wheel over the strip | **0**, and the pane 0 → 360 |
   *
   * The arrows are what answer for a mouse, they are drawn whenever the row
   * overflows, and **one press covers most of the row** — which is the number
   * that makes this safe: the original report was written when the arrows
   * existed too, and what it was really about is that the *pane* moved instead
   * of the row. The page moving is the thing being asked for now, and the row
   * still has a control that moves it.
   *
   * (`shift`+wheel was measured as well and is **not** a fourth way here: it
   * read 0 → 60 before the removal and 0 → 0 after, so what was answering it
   * was this listener rather than the browser. Chrome translates a shifted
   * wheel above the DOM on a real trackpad or mouse, which a synthesized
   * `modifiers: 8` does not reach — so that is untested rather than absent, and
   * it is written down as untested rather than claimed.)
   */

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
/**
 * **Where each row was left, by label — and it has to live outside the
 * component.**
 *
 * The Roster's readings run is rendered in *two* places: the page on a stream
 * reading and the table's own pane on a table reading (see `tableTakesChrome`).
 * Crossing between them is not a re-render, it is an **unmount and a mount
 * somewhere else** — so a `useRef` goes with the old one and the new row starts
 * at `scrollLeft: 0`.
 *
 * Which is what a reader loses: the run is 391px wider than a 430px phone, so
 * `Schedule`, `Projected`, `Summary` and `News` are all off the right-hand end
 * and have to be scrolled to. Measured, scrolled fully right and pressing each:
 *
 * | press | run `scrollLeft` |
 * | --- | --- |
 * | `News` | 391 → **0** |
 * | `Feed` | 391 → **0** |
 * | `Schedule` | 391 → 386 |
 * | `Summary`, `Projected` | 391 → 391 |
 *
 * So the two that move the row are exactly the two that move it *between
 * containers*, and the button the reader just pressed ends up off the end of a
 * row that has scrolled back to the beginning — reported as *"feed, schedule,
 * and news still scroll all the way to the beginning of the tabs"*.
 *
 * A module-level map keyed by the row's own label is the smallest thing that
 * survives the move. It is not state anybody reads: nothing renders from it and
 * a stale entry costs a clamp, which is why it is a plain `Map` rather than
 * anything the app has to own. The label is already a required prop, and the
 * two call sites that are one row pass the same one — which is the whole point,
 * and is the same reason `App`'s page-scroll memory is keyed by view rather
 * than by component.
 */
const rowScroll = new Map<string, number>();

export function ScrollRow({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** What the row is, for the arrows' own labels — and the key its scroll
   *  offset is remembered under, so a row that moves between containers comes
   *  back where the reader left it. See `rowScroll`. */
  label: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { state, measure, nudge } = useOverflowArrows(boxRef, wrapRef);
  /* **On mount, and only on mount.** A row that is merely re-rendering has not
     lost anything, and writing its own remembered offset back on every render
     would fight a reader mid-flick. `[label]` rather than `[]` because the key
     is what the entry belongs to, not the mount. */
  useLayoutEffect(() => {
    const box = boxRef.current;
    const want = rowScroll.get(label);
    if (!box || !want) return;
    box.scrollLeft = want;
    // The arrows are drawn off `scrollLeft`, so the restore has to be measured
    // or the row comes back scrolled with a left arrow that says it is not.
    measure();
  }, [label, measure]);
  const onScroll = useCallback(() => {
    measure();
    const box = boxRef.current;
    if (box) rowScroll.set(label, Math.round(box.scrollLeft));
  }, [label, measure]);

  /**
   * **The control a reader pressed stays where they can see it**, which
   * remembering the offset gets most of the way to and not all of it.
   *
   * Keeping the row where it was is right for the controls that only light up.
   * It is not enough for one that **changes size on being pressed**: `Schedule`
   * turns into a span picker, so the row re-lays out under a preserved offset
   * and the button that grew is pushed off the end. Measured at 430, scrolled
   * fully right — the offset held at 386 of 391 and `Schedule` was off-screen
   * anyway, which is the reader's complaint word for word with the row in the
   * right place.
   *
   * So the press is remembered and the *element* is scrolled in, on the commit
   * after it — a layout effect with no dependency list, for the reason the
   * measure above has none: the row's content can change without its box doing
   * so, and it is the content that moved. The ref is only ever set by a click,
   * so this acts at most once per press and is a comparison against `null`
   * otherwise.
   *
   * It is `DetailsShell`'s rule for its own tab strip, one tier out and by the
   * same arithmetic — including the **peek**, read off `--tabstrip-arrow-w`
   * rather than copied as a second 24 that would have to agree with the
   * stylesheet's: these arrows are drawn *over* the row's ends, so landing a
   * control flush against one puts it under a chevron.
   *
   * A control on a row that unmounts (`Feed` and `News` move the whole row from
   * the page to the table's pane and back) is not reachable from here at all —
   * the element goes with the old row. That case is the offset's to answer, and
   * it does.
   */
  const pressed = useRef<HTMLElement | null>(null);
  const onClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button, a');
    if (el && boxRef.current?.contains(el)) pressed.current = el;
  }, []);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = pressed.current;
    if (!box || !el) return;
    pressed.current = null;
    if (!box.contains(el)) return;
    const left = el.offsetLeft - box.offsetLeft;
    const overLeft = left - box.scrollLeft;
    const overRight = left + el.offsetWidth - (box.scrollLeft + box.clientWidth);
    const arrowW = parseFloat(getComputedStyle(box).getPropertyValue('--tabstrip-arrow-w'));
    const PEEK = Number.isFinite(arrowW) && arrowW > 0 ? arrowW : 24;
    if (overLeft < 0) box.scrollLeft += overLeft - PEEK;
    else if (overRight > 0) box.scrollLeft += overRight + PEEK;
    else return;
    rowScroll.set(label, Math.round(box.scrollLeft));
    measure();
  });

  return (
    <div ref={wrapRef} className={`tool-scroll${className ? ` ${className}` : ''}`} onClick={onClick}>
      {state.over && (
        <ScrollArrow dir="l" shown={state.left} label={`Scroll ${label} left`} onPress={() => nudge(-1)} />
      )}
      <div className="tool-scroll-box" ref={boxRef} onScroll={onScroll}>
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
 *
 * **Drawn over takes two statements, and shipped with one.** Being positioned
 * over the strip's ends is where the arrow *is*; a tab carries a `z-index` of
 * its own (the label sits above the sliding mark), so it took a `z-index` on
 * the arrow as well for the arrow to be what a reader sees and presses there.
 * `.tabstrip-arrow` carries the measurement — a chevron drawn through the word
 * `Stats`, and a tap on the arrow that switched tabs instead of scrolling.
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
    /* The tabs, and **only** the tabs: the sliding mark is a child of this box
       too (it has to be, to travel with the strip's own scroll), and it is
       absolutely positioned, so counting it would add its width to a sum that
       decides how wide the strip is allowed to grow. */
    const tabs = (Array.from(box.children) as HTMLElement[]).filter((el) =>
      el.classList.contains('details-tab'),
    );
    const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
    const natural = tabs.reduce(
      (w, el, i) => w + el.getBoundingClientRect().width + (i ? gap : 0),
      0,
    );
    wrap.style.setProperty('--tabstrip-grow', `${Math.ceil(natural)}px`);
  }, []);
  const { state, measure, nudge } = useOverflowArrows(boxRef, wrapRef, publish);
  /* **The same mark the app's own row wears**, one tier down — see
     `useTabSlider`. It rides *inside* the scroller rather than over it, so a
     strip flicked sideways carries its mark with it without a `scroll`
     listener; `.details-tabs` is its containing block for exactly that. */
  const { stripRef, markRef } = useTabSlider({ tab: 'details-tab', on: 'is-active' });

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
          stripRef(el);
        }}
        onScroll={measure}
      >
        <span className="tab-mark" aria-hidden="true" ref={markRef} />
        {children}
      </div>
      {state.over && (
        <ScrollArrow dir="r" shown={state.right} label={`Scroll ${label} right`} onPress={() => nudge(1)} />
      )}
    </div>
  );
}
