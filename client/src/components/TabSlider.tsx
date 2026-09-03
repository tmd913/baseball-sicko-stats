import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { TAP_SLOP } from '../hooks';

/**
 * **One mark that travels, for every strip of tabs in the app.**
 *
 * This began as `useTabSlider` inside `App.tsx`, serving the five main tabs
 * alone, and the reasoning it was built on is in `docs/claude/client.md`: the
 * mark used to be a `border-bottom` per tab, transparent until that tab was the
 * page you were on, so a switch was one border fading out and another fading in
 * — **143–157ms on every tab**, measured, and it read as lag rather than as
 * movement. One element that travels is the opposite reading, because the eye
 * follows the same object from where it left to where it arrived.
 *
 * Every other strip in the app was still doing the thing the main row stopped
 * doing — the player and team pages' nine tabs, the outing page's four, the
 * League and MLB rows, and every `.view-switch` segmented control in the app
 * (the Overview's three, the game page's two, the matchup's sides, the standings
 * grouping, the park factors' hands, the schedule spans, the opponent table's
 * two, the player page's kind switch and both `.split-switch` filters). So the
 * hook moved here and took a component with it, and the strips are a
 * `SlidingTabs` call each rather than a rule copied nineteen times.
 *
 * ### Two shapes, one mechanism
 *
 * A strip's mark is either an **underline** — the 2px rule under `.main-tab` and
 * `.details-tab` — or a **pill**, the filled chip that `.view-tab`, `.lg-tab`
 * and `.split-tab` wear. The difference is entirely in the stylesheet
 * (`.tab-mark` and its two modifiers): an underline reads only the tab's `x`
 * and width, a pill reads its whole box. Nothing here knows which it is drawing
 * beyond `fill`, which says whether the vertical half of the rect is the mark's
 * business or the stylesheet's.
 *
 * ### FLIP, rather than a 1px box scaled to width
 *
 * The main strip's mark was `width: 1px` with `scaleX(w)` for its width, and
 * the note that put it there is still correct as far as it goes: **`width` is
 * not compositor-animatable**, so animating it beside a `transform` runs the two
 * halves of one movement on two threads, and a jammed main thread freezes the
 * right edge while the left one glides — measured off presented frames, the
 * width frozen at 147 for ~190ms and then +83 in a single frame.
 *
 * A 1px box cannot wear a `border-radius`, though, because a scaled radius is an
 * ellipse — the old note says exactly that and accepts it, a 2px underline
 * having no corners to lose. A **pill** is all corners, so that trade cannot be
 * made twice.
 *
 * FLIP keeps both. The mark's `left`/`width` (and, for a pill, `top`/`height`)
 * are written as **real layout**, so at rest the geometry is exact and the
 * radius is the radius; the *flight* is then a single `transform` that maps the
 * new box back onto the old one and is released to identity, so the animation is
 * one composited property exactly as before. The scale distortion that used to
 * be permanent now lasts only as long as the flight and is the ratio between two
 * adjacent tabs' widths — 0.7 to 1.4 on the strips in this app, where the old
 * mark's was the whole width of the tab.
 *
 * It also fixes something the scaled version got wrong and nobody had named: a
 * **resize** animated. The transition applied to every transform change, so a
 * window drag slid the mark about under the reader. A flight here is a change of
 * *tab*; a tab that merely moved is re-laid-out and does not travel.
 */
export function useTabSlider(opts: {
  /** The class every tab in this strip carries — `main-tab`, `view-tab`. */
  tab: string;
  /** The class the current one carries — `is-active` on the underline strips,
   *  `active` on the pills, which is the app's own split and not worth a sweep
   *  to unify. */
  on: string;
  /** Whether the mark takes the tab's whole box (a pill) or only its width (an
   *  underline, whose height and baseline are the stylesheet's). */
  fill?: boolean;
}) {
  const { tab: tabClass, on: onClass, fill = false } = opts;
  const stripEl = useRef<HTMLElement | null>(null);
  const markRef = useRef<HTMLSpanElement | null>(null);
  /** Whether the mark has ever been placed. The first placement must not
   *  animate — a mark that flies in from x=0 on boot is a page announcing
   *  itself. */
  const placed = useRef(false);
  /** The tab the mark is on, so a *move* can be told from a *re-measure*. */
  const at = useRef<HTMLElement | null>(null);
  /** The box last written, so the same numbers are never written twice — a
   *  write to an element's style invalidates it, and this runs on every render
   *  and on every resize the observer reports. */
  const box = useRef('');
  /** When the flight in progress lands, in `performance.now()` terms. Read by
   *  the ink delay below, which is the whole of why it is kept. */
  const lands = useRef(0);
  /** The delay last published, guarded for the same reason `box` is. */
  const ink = useRef('');

  /**
   * **The tab being pressed, until the page catches up with it.**
   *
   * This is the back-and-forth bug the main strip shipped once, and it needs to
   * be a ref rather than an argument. A press aims the mark before anything has
   * navigated; then *anything at all* that calls `place()` with no argument —
   * the per-render layout effect, the release handler, a resize — reads the
   * active class, which is still the **old** tab, and sends the mark home. The
   * click then lands and sends it back out. Measured off a 30fps screen
   * recording: the mark left Fantasy (1052) for Overview, got to 348, reversed
   * to 1052, and set off again, five times in seven seconds.
   *
   * So the aim outlives the press. It is cleared when the page agrees with it
   * (the layout effect below) or when the press turns out to have been
   * abandoned (the timer on release).
   */
  const aim = useRef<HTMLElement | null>(null);

  /**
   * **The touch that might still turn out to be a scroll**, and where it
   * started — see `onDown` below, which is the only thing that writes it.
   */
  const press = useRef<{ tab: HTMLElement; x: number; y: number } | null>(null);

  /** Which tab wears the pressed ink. Written onto the DOM rather than through
   *  React because the press is answered *before* anything renders — and read
   *  back off the DOM rather than remembered, because React owns `className` on
   *  these buttons and rewrites it the moment the active tab changes. */
  const showAim = useCallback(
    (tab: HTMLElement | null) => {
      const strip = stripEl.current;
      if (!strip) return;
      for (const el of strip.querySelectorAll<HTMLElement>(`.${tabClass}.is-aimed`)) {
        if (el !== tab) el.classList.remove('is-aimed');
      }
      if (tab) tab.classList.add('is-aimed');
    },
    [tabClass],
  );

  const place = useCallback(
    (aimAt?: HTMLElement) => {
      const strip = stripEl.current;
      const mark = markRef.current;
      if (!strip || !mark) return;
      // A pending aim beats the page, because the page has not caught up yet.
      const tab =
        aimAt ?? aim.current ?? strip.querySelector<HTMLElement>(`.${tabClass}.${onClass}`);
      if (!tab || !strip.contains(tab)) {
        // Nothing is active — the mark has nothing to point at, so it goes
        // rather than parking under whichever tab it last visited. `at` goes
        // with it, so the next tab to be lit is placed rather than flown to.
        if (mark.style.opacity !== '0') mark.style.opacity = '0';
        at.current = null;
        box.current = '';
        return;
      }
      const s = strip.getBoundingClientRect();
      const t = tab.getBoundingClientRect();
      /* **The strip's own scrolled content box**, not the viewport: the player
         page's nine tabs are a scroller, the mark is inside it, and an
         absolutely positioned child of a scroller is placed against its padding
         box and travels with its content. `clientLeft`/`clientTop` are the
         border the padding box excludes, which `.view-switch` and `.lg-tabs`
         both have. */
      /* **Two decimals, not whole pixels.** The rect of a tab in a track that
         centers it is routinely a half — a `.lg-tab` measured at `top: 121.5`
         in a strip at 116 — and rounding put the pill half a pixel low against
         the word it was drawn for. The rounding is only there to keep the guard
         below from seeing a new number every render; it does not have to cost
         the placement anything, a composited box being positioned in fractions
         like everything else the browser lays out. */
      const px = (n: number) => Math.round(n * 100) / 100;
      const x = px(t.left - s.left + strip.scrollLeft - strip.clientLeft);
      const y = px(t.top - s.top + strip.scrollTop - strip.clientTop);
      const w = px(t.width);
      const h = px(t.height);
      const next = fill ? `${x},${y},${w},${h}` : `${x},${w}`;
      if (next === box.current && at.current === tab) return;
      /* A flight is a change of *tab*. A tab that merely moved — a resize, a
         font landing, a word re-wrapping at a breakpoint — is re-laid-out where
         it now is, because a mark that slides across the strip because the
         window was dragged is a mark saying something happened when nothing
         did. */
      const flying = placed.current && at.current !== null && at.current !== tab;
      const from = flying ? mark.getBoundingClientRect() : null;

      // The layout, written plainly. Only `transform` is in the transition, so
      // none of this animates by itself.
      mark.style.transition = 'none';
      mark.style.transform = '';
      mark.style.left = `${x}px`;
      mark.style.width = `${w}px`;
      if (fill) {
        mark.style.top = `${y}px`;
        mark.style.height = `${h}px`;
      }
      if (mark.style.opacity !== '1') mark.style.opacity = '1';
      box.current = next;
      at.current = tab;

      if (from) {
        // **The inverse, then the release.** `to` is read back off the mark
        // rather than computed, so a stylesheet that adds an inset or a border
        // to one family's mark cannot put the flight out by that much.
        const to = mark.getBoundingClientRect();
        const sx = to.width ? from.width / to.width : 1;
        const sy = to.height ? from.height / to.height : 1;
        mark.style.transform = `translate(${from.left - to.left}px, ${
          from.top - to.top
        }px) scale(${sx}, ${sy})`;
        // Committed with no transition, so the mark is *at* the old box rather
        // than travelling to it.
        void mark.offsetWidth;
        mark.style.transition = '';
        mark.style.transform = '';
        const ms = flightMs(mark);
        lands.current = performance.now() + ms;
      } else {
        // Back to the stylesheet's transition for the next flight; nothing is
        // animating now, the transform having stayed at identity throughout.
        void mark.offsetWidth;
        mark.style.transition = '';
        lands.current = 0;
      }

      if (!placed.current) {
        placed.current = true;
        // Next frame, so the first placement has been painted before the
        // transition is allowed to apply to the second.
        requestAnimationFrame(() => markRef.current?.classList.add('is-placed'));
      }
    },
    [tabClass, onClass, fill],
  );

  /**
   * **The ink arrives with the pill, and this is the number that makes it.**
   *
   * A pill's active ink is `--on-accent`, which is the ink for a *saturated
   * fill* and nothing else: on Light and Powder Blue it is white, and the ground
   * it would sit on for the length of a flight is `--panel`, which is also
   * white. So a segmented control whose fill slides and whose ink snaps spends
   * the whole flight with its incoming label **invisible** — the same complaint
   * as the flash this work started from, one step further along.
   *
   * So the lit ink is delayed by exactly the flight that is still to run, and
   * the ink lands as the pill does. It is the *remaining* flight rather than the
   * duration, because the mark leaves on the press and the commit that moves the
   * class lands a hundred milliseconds or so later — see the aim above. Zero
   * where there is no flight (a first paint, a strip whose mark is arriving,
   * reduced motion), which is what keeps a selection instant when nothing is
   * moving.
   *
   * The outgoing label is not delayed at all: the pill leaves it at once, so its
   * ink has to leave with it.
   */
  const publishInk = useCallback(() => {
    const strip = stripEl.current;
    if (!strip || !fill) return;
    const left = Math.max(0, Math.round(lands.current - performance.now()));
    const next = left ? `${left}ms` : '0s';
    if (next === ink.current) return;
    ink.current = next;
    strip.style.setProperty('--tab-ink-in', next);
  }, [fill]);

  /**
   * **A callback ref, because the strip does not exist on the render that would
   * attach the listeners.**
   *
   * The app's own chrome is behind `initialLoadSettled`, so on the first render
   * the strip is null and an effect reading it wires nothing up — and its
   * dependencies do not change when the strip finally mounts, so it never runs
   * again. Measured, before the fix: **the first press of the session did not
   * move the mark**, and every press after it did.
   */
  const teardown = useRef<(() => void) | null>(null);
  const stripRef = useCallback(
    (el: HTMLElement | null) => {
      teardown.current?.();
      teardown.current = null;
      stripEl.current = el;
      if (!el) return;

      const onResize = () => place();
      // The strip's own box can hold still while a tab inside it moves — a
      // narrower window changes a padding token at a breakpoint, which re-flows
      // the words without resizing the row.
      const ro = new ResizeObserver(onResize);
      ro.observe(el);
      for (const t of el.querySelectorAll(`.${tabClass}`)) ro.observe(t);
      window.addEventListener('resize', onResize);

      /**
       * **The mark leaves on the press, not on the navigation.**
       *
       * A tab commits on the *click*, which is `pointerup` — the app's own rule
       * that a press arms on `pointerdown` and decides on release, so a scroll
       * that starts on a tab does not navigate. That rule is about the
       * navigation, and it left the mark waiting for it: on a touch the finger
       * is down, and nothing has moved, for as long as the finger stays down.
       *
       * **Delegated on the strip** rather than a prop per tab: the mark is the
       * strip's, and a tab that appears later — the fantasy tab when a league
       * connects, the Arsenal tab on a pitcher — is covered without being told.
       *
       * **A finger is not a press yet, and this shipped as though it were.**
       * Reported: *"the highlighting is weird when I scroll horizontally since
       * it activates on touch"* — the player page's nine tabs are a scroller, a
       * sideways flick has to start with a `pointerdown` on whichever tab is
       * under the finger, and that landed here. Measured at 390×844 on Ohtani's
       * page, one flick that began on `Percentile Rankings`:
       *
       * | | mark `left`/`width` | `.is-aimed` |
       * | --- | --- | --- |
       * | at rest | 0 / 90.27 | — |
       * | `touchStart` | **96.27 / 161.83** | **Percentile Rankings** |
       * | mid-drag (`scrollLeft` 109) | 0 / 90.27 | — |
       *
       * So the underline shot two tabs to the right and the label lit, for the
       * length of a flick nobody had aimed at anything — and then flew home
       * when Chrome sent `pointercancel` as the scroll took the touch. The
       * strip announced a selection it was then going to decline, which is the
       * app's own *a press arms on `pointerdown` and decides on release* stated
       * for a mark instead of a toggle.
       *
       * **So only a pointer that cannot scroll by dragging aims on the way
       * down.** A mouse is that pointer; a touch and a pen are not, and theirs
       * is remembered in `press` and aimed on release, if it stayed within
       * `TAP_SLOP` of where it started. That is the earliest moment the gesture
       * is *known* not to have been a scroll, and it keeps what this listener
       * was written for: `pointerup` still runs before `click`, so the mark
       * leaves ahead of the navigation rather than waiting for React to commit
       * and the incoming tab to render.
       *
       * **Retracting a wrong aim mid-drag was the other candidate** — aim on
       * the way down as before and cancel on the first `pointermove` past the
       * slop. It answers the report and it costs a twitch: at 60fps the mark
       * has a frame or two of flight before the move arrives, so a flick would
       * start with the underline lurching a tab and snapping back. A press that
       * has not been made yet is better off saying nothing.
       */
      const onDown = (e: PointerEvent) => {
        const t = (e.target as HTMLElement | null)?.closest<HTMLElement>(`.${tabClass}`);
        if (!t || !el.contains(t)) return;
        if (e.pointerType !== 'mouse') {
          press.current = { tab: t, x: e.clientX, y: e.clientY };
          return;
        }
        aim.current = t;
        showAim(t);
        place(t);
      };
      /**
       * **The press is over; the aim is not, until it has had time to land.**
       *
       * This used to drop the aim on a `setTimeout(0)`, which is the race that
       * caused the reversal: `pointerup` and `click` are separate tasks, so a
       * zero timeout can run *between* them — reading an active class that has
       * not moved yet and yanking the mark back before the navigation it was
       * waiting for even happened. 180ms is comfortably past a click without
       * being a pause a reader would notice on an abandoned press.
       *
       * **A touch's aim is made here rather than on the way down** — see
       * `onDown`. `pointercancel` is bound to this handler too and `e.type`
       * tells the two apart, which matters: a scroll that has taken the touch
       * is precisely the gesture that must not aim, so only a `pointerup`
       * within `TAP_SLOP` of where the finger landed counts as a press. The tab
       * is the one the gesture *started* on rather than whatever is under the
       * finger at the end of it, which is how the roster row's toggle and the
       * arsenal charts' pin already read a gesture.
       */
      const onUp = (e: PointerEvent) => {
        const p = press.current;
        press.current = null;
        if (
          p &&
          e.type === 'pointerup' &&
          el.contains(p.tab) &&
          Math.hypot(e.clientX - p.x, e.clientY - p.y) <= TAP_SLOP
        ) {
          aim.current = p.tab;
          showAim(p.tab);
          place(p.tab);
        }
        // Nothing was aimed here, and a press lands on one strip while every
        // other strip in the app is listening on the same window — so this
        // leaves before it costs them a timer each.
        if (!aim.current) return;
        setTimeout(() => {
          if (!aim.current) return;
          aim.current = null;
          showAim(null);
          place();
        }, 180);
      };
      el.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);

      teardown.current = () => {
        ro.disconnect();
        window.removeEventListener('resize', onResize);
        el.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      place();
      publishInk();
    },
    [place, publishInk, showAim, tabClass],
  );

  // No dependency list on purpose: a strip's contents change with things no
  // observer reports — a tab appearing when a league connects, a word
  // re-measuring when the font lands — and re-placing is two rect reads against
  // a string comparison.
  useLayoutEffect(() => {
    // **The page has caught up with the press, so the aim is spent.** Doing it
    // here rather than on a timer is what makes the common path exact: this
    // runs on the very commit that moved the active class, so the aim is
    // dropped in the same frame the navigation lands and never one animation
    // later.
    if (
      aim.current &&
      stripEl.current?.querySelector(`.${tabClass}.${onClass}`) === aim.current
    ) {
      aim.current = null;
      showAim(null);
    } else if (aim.current) {
      // React owns `className` on these buttons and rewrote it on this commit,
      // which takes the pressed ink off with it. Put it back while the press is
      // still open.
      showAim(aim.current);
    }
    place();
    publishInk();
  });

  return { stripRef, markRef };
}

/** How long this mark's flight is, read off the stylesheet rather than declared
 *  here — the duration is a design number and lives with the design, and
 *  `prefers-reduced-motion` turns it to zero without this file knowing. */
function flightMs(mark: HTMLElement): number {
  const d = getComputedStyle(mark).transitionDuration.split(',')[0]?.trim() ?? '0s';
  const n = parseFloat(d) || 0;
  return d.endsWith('ms') ? n : n * 1000;
}

/**
 * **A strip of tabs with a mark that slides between them.**
 *
 * The markup a caller already had, plus one `<span>`: the mark is a child of
 * the strip, absolutely positioned against it, and `aria-hidden` because it says
 * nothing a `role="tab"`'s own `aria-selected` has not already said.
 *
 * **The mark is first in the DOM**, so a pill paints under the labels without
 * either of them needing a stacking context of its own beyond the `z-index`
 * pair in the stylesheet.
 *
 * **Everything still works with the span absent**, which is what makes this
 * safe to adopt one strip at a time and what keeps the tutorial's painted-on
 * mock strips looking like the real thing: the per-tab paint is suppressed by
 * `:has(> .tab-mark)` on the strip, so a strip with no mark keeps the fill it
 * always had.
 */
export function SlidingTabs({
  children,
  className,
  label,
  tab = 'view-tab',
  on = 'active',
  fill = true,
  as = 'div',
  role = 'tablist',
  stripRef: outer,
}: {
  children: ReactNode;
  /** The strip's own classes, exactly as they were written before. */
  className: string;
  /** What the strip is a list of, for a screen reader. */
  label: string;
  tab?: string;
  on?: string;
  fill?: boolean;
  /** `span` where the strip sits inside a line of text — the Overview's
   *  leaders card is the one. */
  as?: 'div' | 'span';
  /** `group` where the control is a set of pressable spans rather than tabs —
   *  the board's projected spans. */
  role?: 'tablist' | 'group';
  /** Handed back to a caller that needs the element for something else — the
   *  League row scrolls its own tab into view. */
  stripRef?: RefObject<HTMLDivElement | null>;
}) {
  const { stripRef, markRef } = useTabSlider({ tab, on, fill });
  const attach = (el: HTMLDivElement | HTMLSpanElement | null) => {
    stripRef(el);
    if (outer) outer.current = el as HTMLDivElement | null;
  };
  const inside = (
    <>
      <span className={`tab-mark${fill ? ' tab-mark-fill' : ''}`} aria-hidden="true" ref={markRef} />
      {children}
    </>
  );
  return as === 'span' ? (
    <span className={className} role={role} aria-label={label} ref={attach}>
      {inside}
    </span>
  ) : (
    <div className={className} role={role} aria-label={label} ref={attach}>
      {inside}
    </div>
  );
}
