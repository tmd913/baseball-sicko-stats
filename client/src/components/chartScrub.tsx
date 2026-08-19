import { useRef, useState } from 'react';

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
 */
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
  return (
    <div className="chart-tip" style={{ left: `${(x / vbw) * 100}%`, top: `${(y / vbh) * 100}%` }}>
      {children}
    </div>
  );
}
