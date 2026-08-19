import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InfoKey } from './InfoKey';
import { ScrubCross, ScrubTip, useChartScrub } from './chartScrub';
import { formatRate } from '../lib';
import type { XwobaSeries } from '../types';

const WINDOWS = [50, 100, 250] as const;
type Win = (typeof WINDOWS)[number];

// SVG coordinate space; the element scales to the container width via CSS.
const VBW = 720;
const VBH = 300;
const PAD_TOP = 16;

/**
 * **The size of a label on this chart is a rendered size, not a viewBox one.**
 *
 * Everything in an SVG drawn at `width: 100%` scales with the box it is in, and
 * a *label* is the one thing on a chart that must not: it is read at whatever
 * size the screen gives it. This chart lives in the player page's card column,
 * which is 634px wide on a desktop and 332 on a phone — a 1.9× range — so an
 * 11-unit label rendered at **9.69px at 1200 and 5.07px at 390**, which is the
 * report ("too small to read") and is a fact about the phone rather than about
 * the number. Picking a bigger number cannot fix that: it moves both ends
 * together and the two ends want different unit counts.
 *
 * So the label is declared in **rendered CSS pixels** and the unit count is
 * derived from the box's measured scale — `--roll-font`, published on the `<svg>`
 * from a `ResizeObserver` exactly as `useStickyChromeOffset` publishes
 * `--chrome-h` and `ClipVideo` publishes `--clip-w`. There is no one number to
 * declare, so it is measured; the stylesheet keeps the rule saying *which* text
 * is a label and reads the var for its size, with the old 11px as the
 * pre-measurement fallback.
 */
const LABEL_PX = 12;

/**
 * **How far below the plot an x tick's baseline sits, in ems of its own size** —
 * and it is a derivation rather than a number picked to look right, because the
 * thing it has to clear is another label whose position is also stated in ems.
 *
 * The **leftmost x tick collided with the bottom y label**, which is the report.
 * Two facts put them in the same place. The lowest gridline is always exactly on
 * the plot's bottom edge (`yMin` is floored to a step, so `sy(yMin)` *is*
 * `PAD.top + PLOT_H`), and its label hangs `0.32em` below that line — the `dy`
 * on the `<text>`. And an x tick is centered on its own tick, the first of which
 * lands at or just past the plot's left edge, so half of it hangs back into the
 * left pad where the y labels live. Measured on the real chart, ink against ink:
 * the `100` tick overlapped the `.200` label by **2.46 × 0.69px at 1200 and
 * 6.59 × 0.69px at 390**, the horizontal figure differing because the tick's
 * distance from the plot edge does and the vertical one not because both
 * labels render at 12px whatever the width (see `LABEL_PX`).
 *
 * So the baseline has to clear the y label's ink by its own cap height plus a
 * gap: `0.72` is where this face's digits start above their baseline (measured:
 * 8.65px of ascent at a 12px rendered size), `0.34` is where the y label's ink
 * ends below the gridline, and the rest is the clearance. **1.6em leaves
 * 0.54em — 6.5px at the rendered size, at every width**, since the whole
 * relationship is in ems of a label whose rendered size is fixed.
 *
 * The bottom pad reads the same constant rather than a second number, so the
 * two cannot drift: the pad is the baseline plus the 8 units that keep it off
 * the bottom edge of the SVG. Nothing has to be reserved *below* the baseline
 * because an x tick is a plate-appearance count — integers, which in this face
 * have no descender at all.
 */
const X_TICK_BASELINE_EM = 1.6;

/**
 * The plot's own padding follows the label, since the label is what the padding
 * is *for*: the y labels sit in the left one and the x ticks in the bottom one.
 * `2.3em` is the widest y label with a little slack — `.200` measures 2.21em in
 * this face (21.41px of ink at an 11-unit font on a 0.8806 scale), and
 * `formatRate` always yields four characters at xwOBA's range. Written this way
 * the padding is right at every width for free, where the 48/30 it replaces was
 * right at exactly one: at 390 a 26-unit label would have run off the left edge
 * of its own plot.
 */
function padFor(fontU: number) {
  return {
    top: PAD_TOP,
    // Half the last x tick's label hangs into the right pad, so it can never be
    // narrower than the font itself; 22 was the old flat value and is the floor.
    right: Math.max(22, fontU),
    bottom: fontU * X_TICK_BASELINE_EM + 8,
    left: fontU * 2.3 + 10,
  };
}

interface Pt {
  pa: number; // ending plate-appearance number of the window
  y: number; // rolling xwOBA
  date: string;
}

// The window the chart opens on. 50 and 250 are only ever walked if they're picked.
const DEFAULT_WIN: Win = 100;

/**
 * The window to open on: the default, or — for a player who hasn't the plate
 * appearances to fill it — the largest shorter one he has, so a part season opens
 * on a chart rather than on "not enough for a 100-PA rolling window". Falls back to
 * the shortest window under 50 PA, where nothing plots and that message is the point.
 */
function openingWin(paCount: number): Win {
  if (paCount >= DEFAULT_WIN) return DEFAULT_WIN;
  const shorter = WINDOWS.filter((w) => w < DEFAULT_WIN && w <= paCount);
  return shorter.length ? shorter[shorter.length - 1] : WINDOWS[0];
}

/** The rolling-mean series as plotted points, dropping the incomplete leading window. */
function buildPoints(series: XwobaSeries, win: number): Pt[] {
  const roll = rollingMean(
    series.pas.map((p) => p.xwoba),
    win,
  );
  const pts: Pt[] = [];
  for (let i = 0; i < roll.length; i++) {
    if (!Number.isNaN(roll[i])) pts.push({ pa: i + 1, y: roll[i], date: series.pas[i].date });
  }
  return pts;
}

/** Trailing mean of `xs` over `win` values; NaN until the first full window. */
function rollingMean(xs: number[], win: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < xs.length; i++) {
    sum += xs[i];
    if (i >= win) sum -= xs[i - win];
    out.push(i >= win - 1 ? sum / win : NaN);
  }
  return out;
}

/** A gridline step giving roughly five lines across the value range. */
function niceStep(range: number): number {
  const raw = range / 5;
  return [0.02, 0.025, 0.05, 0.1, 0.2].find((s) => s >= raw) ?? 0.2;
}

/** Month/day label for a YYYY-MM-DD date. */
function md(date: string): string {
  const [, m, d] = date.split('-');
  return m && d ? `${Number(m)}/${Number(d)}` : date;
}

/**
 * **The rolling-xwOBA chart, and the whole of the Charts tab.**
 *
 * The tab is named for the shape rather than for this one chart: `Charts` is a
 * place for a chart of the season to live, and the card inside it keeps its own
 * name (`Rolling xwOBA · 2026`), which is what it *is*. So the strip says which
 * kind of reading you are on and the card says which reading it is — the same
 * split the Stats tab makes with the table inside it.
 */
export function RollingXwoba({ series, name }: { series: XwobaSeries; name: string }) {
  const [win, setWin] = useState<Win>(() => openingWin(series.pas.length));

  // How many CSS pixels one viewBox unit is drawn at — see `LABEL_PX`. Measured
  // in a *layout* effect so the first paint already has it, and kept true by a
  // `ResizeObserver`: the card is 634px inside a desktop overlay and 332 on a
  // phone, and nothing about the geometry below is honest without it. It cannot
  // loop — the box is `width: 100%` of a column this value does not touch.
  //
  // The box is held in state rather than in a ref because it is **conditional**:
  // a player short of the window renders a sentence instead of a chart, and a
  // ref set on a later render would never re-run an effect with an empty
  // dependency list — the labels would stay at the 11px fallback for the life of
  // the card. A callback ref makes attaching the node the thing that measures it.
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    if (!wrapEl) return;
    const read = () => setScale(wrapEl.clientWidth / VBW);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [wrapEl]);
  const fontU = scale > 0 ? LABEL_PX / scale : 11;
  const PAD = padFor(fontU);
  const PLOT_W = VBW - PAD.left - PAD.right;
  const PLOT_H = VBH - PAD.top - PAD.bottom;

  // Each window is built the first time it's selected and kept for the life of the
  // series, so opening the tab costs one pass over the season rather than three, and
  // switching back to a window already seen costs none.
  const cache = useRef<{ series: XwobaSeries; byWin: Map<Win, Pt[]> } | null>(null);
  if (cache.current?.series !== series) cache.current = { series, byWin: new Map() };

  const points = useMemo<Pt[]>(() => {
    const store = cache.current!.byWin;
    const seen = store.get(win);
    if (seen) return seen;
    const pts = buildPoints(series, win);
    store.set(win, pts);
    return pts;
  }, [series, win]);

  const { yMin, yMax, yStep } = useMemo(() => {
    if (points.length === 0) return { yMin: 0.25, yMax: 0.45, yStep: 0.05 };
    const ys = points.map((p) => p.y).concat(series.leagueXwoba);
    let lo = Math.min(...ys);
    let hi = Math.max(...ys);
    const pad = Math.max(0.02, (hi - lo) * 0.18);
    const step = niceStep(hi - lo + 2 * pad);
    lo = Math.floor((lo - pad) / step) * step;
    hi = Math.ceil((hi + pad) / step) * step;
    return { yMin: Math.max(0, lo), yMax: hi, yStep: step };
  }, [points, series.leagueXwoba]);

  const xMin = points.length ? points[0].pa : 0;
  const xMax = points.length ? points[points.length - 1].pa : 1;
  const sx = (pa: number) => PAD.left + ((pa - xMin) / Math.max(1, xMax - xMin)) * PLOT_W;
  const sy = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * PLOT_H;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.pa).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(' ');

  // Horizontal gridlines at each nice xwOBA step in the domain.
  const yLines: number[] = [];
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax + 1e-9; v += yStep) {
    yLines.push(Math.round(v * 1000) / 1000);
  }
  // ~5 x ticks at round PA numbers within the shown range.
  const xTicks: number[] = [];
  if (points.length) {
    const span = xMax - xMin;
    const tStep = niceTickStep(span);
    for (let v = Math.ceil(xMin / tStep) * tStep; v <= xMax; v += tStep) xTicks.push(v);
  }

  // **The scrub is `chartScrub`'s, not this file's, since the matchup chart
  // wanted the same one** — the hit test, the crosshair and the readout box are
  // shared and what stays here is what is this chart's own: an accent dot on
  // the line, and a readout naming a rolling figure and the plate appearance it
  // ends on. The arithmetic is unchanged — the old `Math.round(paGuess - xMin)`
  // over a series whose PA numbers step by one *is* the rounded fraction of the
  // way across the plot.
  const { svgRef, idx: hover, clear: clearScrub, scrubProps } = useChartScrub(points.length, {
    left: PAD.left,
    plotW: PLOT_W,
    vbw: VBW,
  });
  const cur = hover !== null ? points[hover] : null;

  return (
    <div className="pct-card">
      <div className="pct-card-head roll-head">
        <span className="roll-title">
          <span className="pct-card-title">Rolling xwOBA · {series.season}</span>
          {/* The key to the chart, behind the app's own ⓘ — see `InfoKey`, which
              carries the whole argument for a popover over a `title`, a modal or
              an inline reveal. It was a four-line caption under the chart, which
              is 36px on a desktop and 72 on a phone spent on a paragraph a
              reader needs exactly once, on a tab whose whole content is one
              chart. Nothing is left on the card the way the Splits tab leaves
              its sample-size caveat, and the difference is that this caption
              held no warning: its one player-specific number is context for
              reading the line rather than a caveat about it, and the league
              average beside it is drawn on the chart itself.

              **The league-average sentence has since left this key**, which is
              the same rule one level in: the legend under the chart names that
              figure now, so repeating it behind a button would be the app
              stating one fact in two places and only one of them visible. What
              is left here is the one number nothing else on the card carries —
              *his* season xwOBA, which is what the line is wandering either
              side of. */}
          <InfoKey className="roll-key" label="How to read this chart">
            <p>
              Each point is his <strong>xwOBA over the previous {win} plate appearances</strong>,
              plotted against the one it ends on — so the line is the shape of a hot or cold
              stretch rather than any single night.
            </p>
            <p>
              This player&rsquo;s season xwOBA is {formatRate(series.seasonXwoba)} — the flat
              figure the line above wanders either side of.
            </p>
          </InfoKey>
        </span>
        <div className="roll-windows" role="group" aria-label="Rolling window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={`roll-win${win === w ? ' is-active' : ''}`}
              aria-pressed={win === w}
              onClick={() => {
                setWin(w);
                clearScrub();
              }}
            >
              {w} PA
            </button>
          ))}
        </div>
      </div>

      {points.length === 0 ? (
        <div className="details-status">
          {name} has {series.pas.length} plate appearance{series.pas.length === 1 ? '' : 's'} this
          season — not enough for a {win}-PA rolling window.
        </div>
      ) : (
        <>
          <div className="roll-chart-wrap" ref={setWrapEl}>
            <svg
              ref={svgRef}
              className="roll-chart"
              style={{ '--roll-font': `${fontU.toFixed(2)}px` } as React.CSSProperties}
              viewBox={`0 0 ${VBW} ${VBH}`}
              role="img"
              aria-label={`Rolling ${win}-plate-appearance xwOBA over the ${series.season} season`}
              {...scrubProps}
            >
              {/* horizontal gridlines + y labels */}
              {yLines.map((v) => (
                <g key={v}>
                  <line
                    className="roll-grid"
                    x1={PAD.left}
                    x2={PAD.left + PLOT_W}
                    y1={sy(v)}
                    y2={sy(v)}
                  />
                  <text
                    className="roll-axis-label"
                    x={PAD.left - 8}
                    y={sy(v)}
                    dy="0.32em"
                    textAnchor="end"
                  >
                    {formatRate(v)}
                  </text>
                </g>
              ))}
              {/* x ticks */}
              {xTicks.map((v) => (
                <text
                  key={v}
                  className="roll-axis-label"
                  x={sx(v)}
                  y={PAD.top + PLOT_H + fontU * X_TICK_BASELINE_EM}
                  textAnchor="middle"
                >
                  {v}
                </text>
              ))}
              {/* **The league-average reference line, and nothing written on it.**
                  It carried its own label — `.315 league avg`, anchored to the right
                  end of the line at its own height — and that label is gone, named by
                  the legend below the chart instead. Two reasons, and the second is
                  the one a reader meets. It said the same figure the legend now says,
                  on a card whose whole content is one chart, which is the rule this
                  app applies everywhere else (the Overview tab's game card dropped its
                  matchup line because the status badge beside it already carried the
                  clubs). And it was drawn **inside the plot**, hard against the right
                  edge at the reference line's own height — which is exactly where the
                  rolling line of a league-average hitter runs, so the one mark this
                  chart exists to show was the thing it sat on. Measured on Gunnar
                  Henderson, whose season xwOBA *is* .315: the label's ink spanned
                  **16.2% of the plot at 1200 and 32.6% at 390**, and **8 of his 444
                  plotted points fell inside it** at both widths, with nothing in the
                  drawing order keeping the line out from under the text. */}
              <line
                className="roll-ref"
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={sy(series.leagueXwoba)}
                y2={sy(series.leagueXwoba)}
              />
              {/* the rolling line */}
              <path className="roll-line" d={linePath} />
              {/* hover crosshair + dot */}
              {cur && (
                <>
                  <ScrubCross x={sx(cur.pa)} top={PAD.top} bottom={PAD.top + PLOT_H} />
                  <circle className="roll-dot" cx={sx(cur.pa)} cy={sy(cur.y)} r={4} />
                </>
              )}
            </svg>
            {cur && (
              <ScrubTip x={sx(cur.pa)} y={sy(cur.y)} vbw={VBW} vbh={VBH}>
                <span className="chart-tip-val">{formatRate(cur.y)}</span>
                <span className="chart-tip-sub">
                  PA {cur.pa} · {md(cur.date)}
                </span>
              </ScrubTip>
            )}
          </div>
          {/* **The legend, which is where the league average is named.** It was a
              figure in two places and neither was a legend: a label painted inside
              the plot on the line itself, and a sentence in the key behind the ⓘ
              that a reader has to press to reach. A reference line wants the thing
              every chart wants — a swatch of the mark and a word for it, under the
              picture, read once and then ignored.

              **The swatch is the guide line's own class**, so the color and the
              dash pattern have one definition in the stylesheet rather than a
              hand-written copy that drifts the next time either moves; the swatch's
              `<svg>` is 24 × 2 over a matching viewBox, so a unit is a pixel and
              `.roll-ref`'s `4 4` paints 4px dashes at 1.5px.

              That is deliberately **not** the same *rendered* length as the chart's
              own dashes, which are viewBox units scaled with the plot — 3.52px at
              1200 and 1.85px at 390. Matching those would mean scaling the swatch by
              the chart's factor, and on a phone that is a 1.85px dash in a 24px
              swatch: six cycles of sub-2px marks, which reads as a gray smudge
              rather than as a dashed line. A legend owes the reader the *pattern*,
              at the size the label beside it is read at. */}
          {/* **The figure is measured, and the legend says how deeply.** It was a
              constant — .315, a benchmark rather than a measurement — and is now
              the season's own plate appearances summed nightly (see
              `leagueWoba.ts`). `leagueXwobaPa` is how many, and **0 is the
              server saying it is still the benchmark**: a line a reader is
              judging a whole season against should not have to be taken on
              trust, and this is the cheapest place to say which it is.

              In the title rather than on the label, for the reason the rank
              badge's own population is: the legend is one line under a chart
              and the number of plate appearances behind the league is context
              for the figure rather than part of it. */}
          <div className="roll-legend">
            <span className="roll-legend-item" title={leagueNote(series)}>
              <svg className="roll-legend-swatch" viewBox="0 0 24 2" width="24" height="2" aria-hidden="true">
                <line className="roll-ref" x1="0" y1="1" x2="24" y2="1" />
              </svg>
              League average ({formatRate(series.leagueXwoba)})
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What the league line is, in words: the measurement and its depth, or the
 * benchmark and the fact that it is one.
 *
 * `leagueXwobaPa` is absent from a response an older server wrote, which reads
 * the same way as the benchmark — neither can say how many plate appearances it
 * is drawn from, because neither was drawn from any.
 */
function leagueNote(series: XwobaSeries): string {
  const pa = series.leagueXwobaPa ?? 0;
  return pa > 0
    ? `MLB average xwOBA over ${pa.toLocaleString()} plate appearances this season, measured nightly`
    : 'A fixed benchmark — the league average has not been measured yet, so this is the ~.310–.320 that wOBA is calibrated to';
}

/** A round PA-number step for the x-axis, ~5 ticks across `span`. */
function niceTickStep(span: number): number {
  const raw = span / 5;
  return [10, 20, 25, 50, 100, 200].find((s) => s >= raw) ?? 200;
}
