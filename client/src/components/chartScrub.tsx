import { useLayoutEffect, useRef, useState } from 'react';

/**
 * **The scrub — dragging across a chart to read the point under the finger —
 * factored out of the two charts that have it.**
 *
 * `RollingXwoba` had this first and the matchup's day-by-day chart wanted the
 * same thing: a crosshair snapped to the nearest point, a marker on it, and a
 * readout naming the value and the point in time it belongs to. The two charts
 * are otherwise different objects — one continuous series against plate
 * appearances, two teams against the days of a week — so what is shared is the
 * **mechanic** and not the drawing: this module owns the hit test, the
 * crosshair and the box the readout sits in, and each chart keeps its own
 * marker (one accent dot; two dots in the two teams' colors) and its own words.
 *
 * This is the repo's standing rule rather than a preference — `Modal` came out
 * of the Columns dialog the moment a second dialog wanted it, and two things
 * that merely resemble each other are two things that will one day differ.
 * Written twice, the snap-to-nearest arithmetic below is the half that drifts
 * silently: it is right about which point is under the pointer or it is off by
 * one, and nothing on the screen says which.
 *
 * **The hit test is index arithmetic, not a distance search.** Both charts lay
 * their points out evenly across the plot — one per plate appearance, one per
 * day — so the nearest point to an x is the rounded fraction of the way across,
 * clamped. That is exactly what `RollingXwoba` computed before this moved
 * (`Math.round(paGuess - xMin)` over a series whose PA numbers step by one), so
 * the extraction is arithmetically identical there rather than merely similar.
 *
 * **`touch-action: pan-y` on the plot is what makes this work under a finger**,
 * and it belongs on the chart's own class rather than here — see `.roll-chart`
 * in the stylesheet, which records the bug it exists for. The scrub and the
 * page's scroll differ in *axis*, which is the case `touch-action` can
 * arbitrate: the browser keeps the vertical pan and the chart keeps the
 * horizontal drag. Nothing here listens on `pointerdown`, deliberately — a
 * scroll begins with a `pointerdown` on whatever is under the finger, so
 * reading one would flash a readout on every flick that starts on the plot.
 * The readout appears on the first `pointermove` and leaves with the pointer
 * (`pointercancel`, which is what the browser sends when it takes the gesture
 * for a scroll, is followed by `pointerout`/`pointerleave` per spec, so the one
 * handler covers both).
 */

/** Where the plot sits inside the viewBox — the three numbers the hit test needs. */
export interface ScrubGeom {
  /** Left edge of the plot, in viewBox units. */
  left: number;
  /** Width of the plot, in viewBox units. */
  plotW: number;
  /** The viewBox's own width, which is what a client x is scaled into. */
  vbw: number;
}

/**
 * The index of the point under the pointer, and the handlers that keep it true.
 *
 * `count` is how many evenly spaced points the plot holds; `null` means the
 * pointer is not on the chart. `clear` is for the callers that change what is
 * plotted underneath a held pointer — picking a new rolling window, say — where
 * an index into the old series is a lie about the new one.
 */
export function useChartScrub(count: number, geom: ScrubGeom) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [idx, setIdx] = useState<number | null>(null);
  const clear = () => setIdx(null);
  const onPointerMove = (e: React.PointerEvent) => {
    if (count <= 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    // The rendered box is the viewBox scaled, so one ratio converts the two.
    const svgX = ((e.clientX - rect.left) / rect.width) * geom.vbw;
    const t = count <= 1 ? 0 : ((svgX - geom.left) / geom.plotW) * (count - 1);
    setIdx(Math.max(0, Math.min(count - 1, Math.round(t))));
  };
  return { svgRef, idx, clear, scrubProps: { onPointerMove, onPointerLeave: clear } };
}

/** The dashed vertical rule through the point under the pointer. */
export function ScrubCross({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  return <line className="chart-cross" x1={x} x2={x} y1={top} y2={bottom} />;
}

/**
 * The readout itself — an absolutely positioned box inside the chart's own
 * `position: relative` wrap, so it is drawn over the plot and **takes no
 * layout**: a readout that appeared under a finger and changed the chart's
 * height would shove the page it is being read on.
 *
 * `x`/`y` are the anchor point in viewBox units and are turned into percentages
 * of the box, which is the one form that survives the chart being drawn at any
 * width. The box centers on the anchor and sits above it (`translate(-50%,
 * -140%)` in the stylesheet), so a chart anchoring on a plotted point puts the
 * readout above that point and one with two series anchors on the higher of
 * them.
 *
 * **Centered on the anchor until centering would put it off the screen**, which
 * near the ends of a plot it does: the box is half its own width wider than the
 * point it names, and the last point of both charts sits close enough to the
 * right edge of a phone's window that the half hangs past it. Measured at the
 * last plate appearance of the rolling chart, `.364 / PA 256 · 5/31` — a box
 * **92.9px wide** — ran to `x = 395.4` in a **390** window and to `325.4` in a
 * **320** one, 5.4px off the screen in both, with the whole of the second line's
 * date beyond the edge. So the box is nudged back in, and the nudge is a
 * **measurement rather than a constant**: its width is its own text's, which is
 * a font this app does not choose, so it is read off the rendered box every move
 * (`--chart-tip-nudge`, the rule `--roll-font` and `--clip-w` already follow).
 *
 * **It is clamped to what actually cuts it, and that is rarely the window.**
 * This paragraph read *"clamped to the window and not to the chart"* and argued
 * the plot's edge is not an edge at all — which is true, and is not the whole
 * list. A box floating over the page is cut by the first ancestor that clips,
 * and the rolling chart, which is what the window rule was measured on, simply
 * has none nearer than the glass: `.details-view` is a full-screen scroller
 * whose padding box *is* the window, so the two answers coincided there and the
 * rule looked general. The matchup chart is drawn in a dialog, and
 * `.app-dialog-body` scrolls (`overflow-y: auto`, which forces `overflow-x` to
 * `auto` with it) inside an `.app-dialog-box` that is `overflow: hidden`.
 * Measured on week 19's `OPS` chart at the last day, `.741–.486 · Aug 19`, the
 * window clamp put the box's right edge exactly on its 4px gutter — **386.0 at
 * 390, 316.0 at 320, 973.1 at 1200** — and the dialog cut it **13.0px, 13.0px
 * and 14.1px** short of that, taking the second team's last digit and the whole
 * border with it. So the band is the window **narrowed by every ancestor whose
 * overflow is not `visible`** (`visibleBand`), which gives the window back
 * unchanged on the player page — the rolling chart's nine readouts are
 * identical at all three widths — and gives the dialog's own padding box in the
 * matchup. It is still not clamped to the *chart*: the wrap is 29px narrower
 * again either side at 390, and every pixel of that is the readout walking away
 * from the point it names.
 *
 * **The same band holds it down from the top**, which was never clamped at all
 * and is the fault the right edge hid. The box sits `-140%` above its anchor,
 * so a series high in the plot pushes it through the ceiling of the same
 * scroller: measured on the same chart, `.831–.577 · Aug 11` lost **16.1px at
 * 390 and 21.7px at 320** off its top — at 320 that is the whole of the figure
 * line. Above the point is where it belongs, so it goes **under** the point
 * rather than being slid down over it (`--chart-tip-lift`, the flipped position
 * being the mirror of the same 40%-of-its-height gap), and only clamps into the
 * band in the corner where neither side fits.
 *
 * Both offsets are computed from the anchor and the box's own width and height
 * rather than from its `getBoundingClientRect().left`/`top`, so neither reads
 * back a position it itself moved: run twice on the same anchor they give the
 * same answer. `TIP_GUTTER` keeps the border and its shadow off the edge rather
 * than flush against it.
 */

/** How close the readout may come to an edge that would cut it, in px. */
const TIP_GUTTER = 4;

/**
 * The box the readout has to stay inside: the window, narrowed by every
 * ancestor that clips.
 *
 * Read off the *padding* box (`clientLeft`/`clientWidth`), which is where an
 * overflow cuts and which excludes a scrollbar's own strip. An ancestor is
 * asked about each axis separately, because `overflow-x` and `overflow-y` are
 * two declarations and a box that scrolls in one axis and clips in the other is
 * the common case rather than the odd one.
 */
function visibleBand(el: HTMLElement) {
  const doc = document.documentElement;
  const band = { left: 0, right: doc.clientWidth, top: 0, bottom: doc.clientHeight };
  for (let n = el.parentElement; n && n !== doc; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const cutsX = cs.overflowX !== 'visible';
    const cutsY = cs.overflowY !== 'visible';
    if (!cutsX && !cutsY) continue;
    const b = n.getBoundingClientRect();
    if (cutsX) {
      band.left = Math.max(band.left, b.left + n.clientLeft);
      band.right = Math.min(band.right, b.left + n.clientLeft + n.clientWidth);
    }
    if (cutsY) {
      band.top = Math.max(band.top, b.top + n.clientTop);
      band.bottom = Math.min(band.bottom, b.top + n.clientTop + n.clientHeight);
    }
  }
  return band;
}

export function ScrubTip({
  x,
  y,
  vbw,
  vbh,
  children,
}: {
  x: number;
  y: number;
  vbw: number;
  vbh: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Every move, before the paint that would show the box past an edge that cuts
  // it — the text changes with the point, so neither its width nor its height is
  // a value that can be measured once and kept.
  useLayoutEffect(() => {
    const el = ref.current;
    const par = el?.offsetParent as HTMLElement | null;
    if (!el || !par) return;
    const box = par.getBoundingClientRect();
    // `left`/`top` are percentages of the padding box, which is where
    // `clientLeft`/`clientTop` and `clientWidth`/`clientHeight` measure from.
    const ax = box.left + par.clientLeft + (x / vbw) * par.clientWidth;
    const ay = box.top + par.clientTop + (y / vbh) * par.clientHeight;
    const own = el.getBoundingClientRect();
    const half = own.width / 2;
    const band = visibleBand(el);
    const lo = band.left + TIP_GUTTER;
    const hi = band.right - TIP_GUTTER;
    let nudge = 0;
    if (ax + half > hi) nudge = hi - (ax + half);
    // The left edge wins where both overflow, so a box wider than the band
    // starts at the left of it rather than being pushed off the other side.
    if (ax - half + nudge < lo) nudge = lo - (ax - half);
    el.style.setProperty('--chart-tip-nudge', `${nudge.toFixed(2)}px`);

    // `-140%` is the box's own height plus the 40% of it that is the gap
    // between the box and the point it names; flipped, that gap is all there is
    // between them.
    const gap = own.height * 0.4;
    let top = ay - gap - own.height;
    if (top < band.top + TIP_GUTTER) top = ay + gap;
    top = Math.min(top, band.bottom - TIP_GUTTER - own.height);
    top = Math.max(top, band.top + TIP_GUTTER);
    el.style.setProperty('--chart-tip-lift', `${(top - ay).toFixed(2)}px`);
  });
  return (
    <div
      ref={ref}
      className="chart-tip"
      style={{ left: `${(x / vbw) * 100}%`, top: `${(y / vbh) * 100}%` }}
    >
      {children}
    </div>
  );
}
